import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Forklift, LucideIconData, Package, Tag, TriangleAlert, Wifi, Wrench, Zap, Droplets } from 'lucide-angular';
import {
  ASSETS, FACILITY_GEO, FacilityFeature, LngLat, TrackedAsset, Zone,
  distanceM, isLowConfidence, placeOf, pointAlong,
} from './location-data';
import { buildPlanArt } from './rl-plan-art';
import { LayoutPlot, LayoutZone } from './floor-layout-api';

type L = typeof Leaflet;

export interface MapLayers { zones: boolean; labels: boolean; gateways: boolean; trails: boolean; assets: boolean }
export interface LivePosition { id: string; lng: number; lat: number; place: string; regLng: number; regLat: number; heading: number }
/**
 * A floor's plan: the image (Maps & Floor Plans plan, else the Master Data floor image), where it sits (floor, else
 * building / site coordinates), its size and the zones / assets / devices drawn on it in Maps & Floor Plans.
 */
export interface FloorPlan {
  /** Candidate plan images, best first; the first one that loads is shown (a stored link can point to a lost file). */
  urls: string[];
  name: string;
  lat: number | null;
  lng: number | null;
  /** Floor area in m² (sizes the plan when the plan has no metres). */
  area: number | null;
  /** Plan size in metres from Maps & Floor Plans. */
  widthM: number | null;
  heightM: number | null;
  zones: LayoutZone[];
  plots: LayoutPlot[];
}

/** Width (m) of a plan with no size entered (same default as Maps & Floor Plans, so drawings line up). */
const DEFAULT_PLAN_WIDTH_M = 60;
const DEFAULT_PLAN_ASPECT = 60 / 32;
const M_PER_DEG_LAT = 111_320;

/** Neutral view used until a floor plan or geofence geometry is loaded. */
const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

/** Status colours (legend): live moving, live stationary, stale, low-confidence, offline / breach. */
const COLOR = { moving: '#16a34a', stationary: '#2563eb', stale: '#d97706', lowconf: '#6b7280', offline: '#dc2626', breach: '#dc2626' };
const ICONS: Record<string, LucideIconData> = { Forklift, Pump: Droplets, Generator: Zap, 'Tool Cart': Wrench, 'BLE Tag': Tag, gateway: Wifi, alert: TriangleAlert, other: Package };

function svgOf(data: LucideIconData, width = 2.2): string {
  const body = data.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
/** Invisible hover / tooltip target over equipment drawn by the plan artwork. */
const HIT = { stroke: false, fillColor: '#0f172a', fillOpacity: 0, className: 'rl-hit' } as const;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Marker colour of a plotted asset from its status (legend colours). */
function plotColor(status: string): string {
  const s = status.toLowerCase();
  if (/offline|inactive|fault|lost|disposed|retired/.test(s)) return COLOR.offline;
  if (/maint|repair|warn|stale|idle/.test(s)) return COLOR.stale;
  if (/moving|in use|in transit/.test(s)) return COLOR.moving;
  return COLOR.stationary;
}

export function stateColor(a: TrackedAsset): string {
  if (a.state === 'stationary' && isLowConfidence(a)) return COLOR.lowconf;
  return COLOR[a.state];
}

/**
 * Leaflet indoor floor plan for Real-Time Location. The plan (walls, zones, racks, machines, gateways) comes from
 * FACILITY_GEO and the assets from location-data. Runs outside Angular and reports selections / live positions
 * through outputs.
 */
@Component({
  selector: 'app-rl-map',
  standalone: true,
  template: '<div #host class="rl-map"></div>',
  styleUrls: ['./rl-map.css'],
  encapsulation: ViewEncapsulation.None,
})
export class RlMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input() selectedId = '';
  @Input() layers: MapLayers = { zones: true, labels: true, gateways: true, trails: true, assets: true };
  @Input() imagery = false;
  /** Geofences from the Tracking API, drawn on the zones / labels layers. */
  @Input() geofences: Zone[] = [];

  @Output() select = new EventEmitter<string>();
  @Output() live = new EventEmitter<LivePosition>();
  @Output() replayDone = new EventEmitter<void>();
  /** The Leaflet map once created (for the shared drawing tools). */
  @Output() ready = new EventEmitter<Leaflet.Map>();

  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private L?: L;
  private map?: Leaflet.Map;
  private sat?: Leaflet.TileLayer;
  private planBounds?: Leaflet.LatLngBounds;
  private groups: Record<'plan' | 'zones' | 'labels' | 'gateways' | 'trails' | 'assets' | 'featured' | 'focus', Leaflet.LayerGroup> = {} as never;
  private markers = new Map<string, Leaflet.Marker | Leaflet.CircleMarker>();
  private accuracy?: Leaflet.Circle;
  private replay?: { line: Leaflet.Polyline; ghost: Leaflet.Marker; path: Leaflet.LatLng[]; cum: number[]; total: number; start: number };
  private frame = 0;
  private resize?: ResizeObserver;
  private destroyed = false;
  private nearZoom = 20;
  private geoZones?: Leaflet.FeatureGroup;
  private geoLabels?: Leaflet.LayerGroup;
  /** The floor plan to show (undefined = never set) and its image on the map. */
  private floorPlan: FloorPlan | null | undefined;
  private floorImage?: Leaflet.Layer;
  /** Zones / plots of the floor, each with the layer group it was added to (for removal). */
  private floorLayers: [Leaflet.Layer, Leaflet.LayerGroup][] = [];
  /** Markers of the plotted assets / devices by item id, and the one to fly to once its floor is drawn. */
  private plotMarkers = new Map<string, Leaflet.Marker>();
  private pendingPlot = '';
  private floorBounds?: Leaflet.LatLngBounds;
  /** Bumped per floor change, so a slow image load can't place an older floor. */
  private floorToken = 0;

  async ngAfterViewInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    const mod = (await import('leaflet')) as unknown as L & { default?: L };
    if (this.destroyed) return;
    // UMD build: the API is either the module itself or its default export, depending on the bundler
    const Lf: L = (typeof (mod as { map?: unknown }).map === 'function' ? mod : mod.default) as L;
    this.L = Lf;
    this.zone.runOutsideAngular(() => this.init(Lf));
  }

  ngOnChanges(c: SimpleChanges): void {
    if (!this.map) return;
    this.zone.runOutsideAngular(() => {
      if (c['layers']) this.applyLayers();
      if (c['imagery']) this.setImagery();
      if (c['geofences']) {
        this.drawGeofences();
        if (!this.planBounds) this.fitPlan(false);
      }
      if (c['selectedId']) {
        this.restyle();
        if (!c['selectedId'].firstChange && this.selectedId) this.focus(this.selectedId);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.map?.remove();
  }

  // ===== public API =====

  zoomIn(): void {
    this.map?.zoomIn(0.5);
  }

  zoomOut(): void {
    this.map?.zoomOut(0.5);
  }

  /** Re-centres on the selected asset, or the whole level. */
  locate(): void {
    if (this.selectedId) this.focus(this.selectedId, 21.5);
    else this.fitPlan(true);
  }

  /** Flies to a plotted asset / device and opens its tooltip (after the floor is drawn when it is still loading). */
  focusPlot(itemId: string): void {
    this.pendingPlot = itemId;
    if (this.map) this.zone.runOutsideAngular(() => this.flyToPlot());
  }

  private flyToPlot(): void {
    const map = this.map;
    const m = this.plotMarkers.get(this.pendingPlot);
    if (!map || !m) return;
    this.pendingPlot = '';
    const zoom = Math.max(map.getZoom(), this.floorBounds ? map.getBoundsZoom(this.floorBounds) + 1.5 : 21);
    map.flyTo(m.getLatLng(), zoom, { duration: 0.8 });
    map.once('moveend', () => m.openTooltip());
  }

  /** Shows a floor's uploaded plan image (null removes it) and frames it. */
  showFloorPlan(plan: FloorPlan | null): void {
    this.floorPlan = plan;
    if (this.map) this.zone.runOutsideAngular(() => this.applyFloorPlan(true));
  }

  private applyFloorPlan(animate: boolean): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map || this.floorPlan === undefined) return;
    const plan = this.floorPlan;
    const token = ++this.floorToken;
    if (this.floorImage) map.removeLayer(this.floorImage);
    this.floorImage = undefined;
    this.floorBounds = undefined;
    for (const [layer, group] of this.floorLayers) group.removeLayer(layer);
    this.floorLayers = [];
    this.plotMarkers.clear();
    this.host.nativeElement.classList.toggle('has-floor', !!plan);
    if (!plan) {
      this.fitPlan(animate);
      return;
    }
    // the frame is sized like Maps & Floor Plans sizes it (plan metres, else the image's shape), so zones and plots
    // stored as % of the plan land where they were drawn
    const place = (aspect: number, url: string | null) => {
      if (token !== this.floorToken || !this.map) return;
      const geo = this.geoZones?.getLayers().length ? this.geoZones.getBounds() : null;
      const center = plan.lat !== null && plan.lng !== null ? L.latLng(plan.lat, plan.lng) : geo?.isValid() ? geo.getCenter() : map.getCenter();
      const widthM = plan.widthM ?? (plan.area ? Math.sqrt(plan.area * aspect) : DEFAULT_PLAN_WIDTH_M);
      const heightM = plan.heightM ?? widthM / aspect;
      const dLat = heightM / M_PER_DEG_LAT;
      const dLng = widthM / (M_PER_DEG_LAT * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
      const north = center.lat + dLat / 2;
      const west = center.lng - dLng / 2;
      const bounds = L.latLngBounds([north - dLat, west], [north, west + dLng]);
      this.floorImage = url
        ? L.imageOverlay(url, bounds, { pane: 'rl-art', className: 'rl-floor-img', interactive: false, alt: plan.name }).addTo(map)
        : L.rectangle(bounds, { pane: 'rl-art', color: '#94a3b8', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.9, interactive: false }).addTo(map);
      this.floorBounds = bounds;
      const at = (x: number, y: number) => L.latLng(north - (y / 100) * dLat, west + (x / 100) * dLng);
      this.drawLayout(L, plan, at, widthM);
      map.setMinZoom(DEFAULT_ZOOM);
      this.fitPlan(animate);
      if (this.pendingPlot) this.flyToPlot();
    };
    // the first image that loads; with none, a plain frame still carries the zones and plots
    const tryFrom = (i: number) => {
      if (token !== this.floorToken) return;
      const url = plan.urls[i];
      if (!url) return place(DEFAULT_PLAN_ASPECT, null);
      const img = new Image();
      img.onload = () => this.zone.runOutsideAngular(() => place(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : DEFAULT_PLAN_ASPECT, url));
      img.onerror = () => this.zone.runOutsideAngular(() => tryFrom(i + 1));
      img.src = url;
    };
    tryFrom(0);
  }

  /** Zones (with names), devices (gateway style) and assets (status dot + card) drawn in Maps & Floor Plans. */
  private drawLayout(L: L, plan: FloorPlan, at: (x: number, y: number) => Leaflet.LatLng, widthM: number): void {
    const add = (layer: Leaflet.Layer, group: Leaflet.LayerGroup) => {
      layer.addTo(group);
      this.floorLayers.push([layer, group]);
    };
    for (const z of plan.zones) {
      const style: Leaflet.PathOptions = { color: z.color, weight: 2, dashArray: '7 6', fillColor: z.color, fillOpacity: z.restricted ? 0.13 : 0.09, className: 'rl-zone' + (z.restricted ? ' is-restricted' : '') };
      const shape =
        z.shape === 'Circle'
          ? L.circle(at(z.x + z.w / 2, z.y + z.h / 2), { ...style, radius: ((z.radius ?? z.w / 2) / 100) * widthM })
          : z.shape === 'Polygon'
            ? L.polygon(z.points.map((p) => at(p.x, p.y)), style)
            : L.rectangle(L.latLngBounds(at(z.x, z.y), at(z.x + z.w, z.y + z.h)), style);
      shape.bindTooltip(`<strong>${esc(z.name)}</strong><span>${esc([z.type, z.rule].filter(Boolean).join(' · ') || 'Zone')}</span>`, { className: 'rl-tip', sticky: true, direction: 'top' });
      add(shape, this.groups.zones);
      const b = shape.getBounds();
      const lbl = L.marker(L.latLng(b.getNorth(), b.getCenter().lng), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'rl-lbl-wrap', html: `<span class="rl-zone-lbl${z.restricted ? ' is-red' : ''}" style="--c:${z.color}">${esc(z.name)}</span>`, iconSize: [0, 0] }),
      });
      add(lbl, this.groups.labels);
    }
    for (const p of plan.plots) {
      const pos = at(p.x, p.y);
      const status = p.status || (p.kind === 'device' ? 'Online' : 'Stationary');
      if (p.kind === 'device') {
        const m = L.marker(pos, { keyboard: false, icon: L.divIcon({ className: 'rl-wrap', html: `<span class="rl-gw">${svgOf(ICONS['gateway'], 2.6)}</span><span class="rl-gw-id">${esc(p.code)}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) });
        m.bindTooltip(`<strong>${esc(p.code)} · ${esc(p.name)}</strong><span>${esc([p.type, status].filter(Boolean).join(' · '))}</span>`, { className: 'rl-tip', direction: 'top', offset: [0, -10] });
        add(m, this.groups.gateways);
        this.plotMarkers.set(p.id, m);
        continue;
      }
      const color = plotColor(status);
      const m = L.marker(pos, { keyboard: false, riseOnHover: true, zIndexOffset: 800, icon: L.divIcon({ className: 'rl-wrap', html: `<span class="rl-mk" style="--c:${color}"><i></i></span>`, iconSize: [34, 34], iconAnchor: [17, 17] }) });
      m.bindTooltip(`<strong>${esc(p.code)} · ${esc(p.name)}</strong><span><i class="rl-tip-dot" style="background:${color}"></i>${esc([p.type, status].filter(Boolean).join(' · '))}</span>`, { className: 'rl-tip', direction: 'top', offset: [0, -16] });
      add(m, this.groups.featured);
      this.plotMarkers.set(p.id, m);
      const card = L.marker(pos, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 700,
        icon: L.divIcon({ className: 'rl-card-wrap', html: `<span class="rl-card" style="--c:${color}"><b>${esc(p.code)}</b><span>${esc(p.name)}</span><span>${esc(status)}</span></span>`, iconSize: [0, 0] }),
      });
      add(card, this.groups.featured);
    }
  }

  fitPlan(animate: boolean): void {
    if (!this.map) return;
    if (this.floorBounds) {
      this.map.flyToBounds(this.floorBounds, { padding: [16, 16], maxZoom: 23, duration: animate ? 0.8 : 0, animate });
      return;
    }
    if (!this.planBounds) {
      // no floor plan: frame the geofences when there are any, else keep the neutral world view
      const geo = this.geoZones?.getLayers().length ? this.geoZones.getBounds() : null;
      if (geo?.isValid()) this.map.flyToBounds(geo, { padding: [24, 24], maxZoom: 20, duration: animate ? 0.8 : 0, animate });
      else if (!animate) this.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    this.map.flyToBounds(this.planBounds, { padding: [10, 10], duration: animate ? 0.8 : 0, animate });
  }

  /** Replays a recorded run (lng/lat points, oldest first) as an animated ghost marker. */
  replayHistory(history: LngLat[]): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    if (history.length < 2) {
      this.replayDone.emit();
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.clearReplay();
      const path = history.map(([lng, lat]) => L.latLng(lat, lng));
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i - 1].distanceTo(path[i]));
      const line = L.polyline(path, { color: '#7c3aed', weight: 3, opacity: 0.85, dashArray: '2 7', lineCap: 'round', className: 'rl-replay', interactive: false }).addTo(map);
      const ghost = L.marker(path[0], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'rl-wrap', html: `<span class="rl-ghost">${svgOf(Forklift)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
      this.replay = { line, ghost, path, cum, total: cum[cum.length - 1], start: performance.now() };
      map.flyToBounds(line.getBounds(), { padding: [40, 40], maxZoom: 21, duration: 0.8 });
    });
  }

  // ===== setup =====

  private init(L: L): void {
    const el = this.host.nativeElement;
    const map = L.map(el, { zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, minZoom: 18, maxZoom: 23.5, fadeAnimation: true, zoomAnimation: true, preferCanvas: false });
    this.map = map;
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 120 }).addTo(map);
    for (const k of ['plan', 'zones', 'labels', 'gateways', 'trails', 'assets', 'featured', 'focus'] as const) this.groups[k] = L.layerGroup().addTo(map);
    // CAD-style plan artwork sits in its own pane under the zones, markers and hover targets
    map.createPane('rl-art').style.zIndex = '350';
    if (FACILITY_GEO.features.some((x) => x.properties.kind === 'outline')) {
      const art = buildPlanArt(FACILITY_GEO.features);
      L.svgOverlay(art.svg, [[art.south, art.west], [art.north, art.east]], { pane: 'rl-art', interactive: false, className: 'rl-art' }).addTo(map);
    } else {
      // no floor plan yet: allow a world view
      map.setMinZoom(DEFAULT_ZOOM);
    }
    this.drawPlan(L);
    this.geoZones = L.featureGroup().addTo(this.groups.zones);
    this.geoLabels = L.layerGroup().addTo(this.groups.labels);
    this.drawGeofences();
    this.drawAssets(L);
    this.fitPlan(false);
    // the 230-odd background assets only appear once zoomed in past the whole-level view
    this.nearZoom = map.getZoom() + 0.5;
    map.on('zoomend', () => this.applyZoomClass());
    this.applyZoomClass();
    if (this.planBounds) map.setMaxBounds(this.planBounds.pad(0.35));
    this.applyLayers();
    this.restyle();
    this.applyFloorPlan(false);
    this.resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    this.resize.observe(el);
    // the drawing tools own map clicks while they draw / place (container gets md-busy)
    map.on('click', () => !el.classList.contains('md-busy') && this.zone.run(() => this.select.emit('')));
    this.zone.run(() => this.ready.emit(map));
    const tick = (t: number) => {
      this.animate(t);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Optional faint aerial imagery under the plan (layers menu). */
  private setImagery(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    if (this.imagery && !this.sat) {
      this.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 23.5, className: 'rl-sat' }).addTo(map);
      this.sat.bringToBack();
    } else if (!this.imagery && this.sat) {
      map.removeLayer(this.sat);
      this.sat = undefined;
    }
    this.host.nativeElement.classList.toggle('has-imagery', this.imagery);
  }

  private drawPlan(L: L): void {
    const ll = (c: LngLat) => L.latLng(c[1], c[0]);
    const ring = (f: FacilityFeature) => (f.geometry.coordinates as LngLat[][])[0].map(ll);
    const label = (at: Leaflet.LatLng, html: string, group: Leaflet.LayerGroup, cls = 'rl-lbl-wrap') =>
      L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: cls, html, iconSize: [0, 0] }) }).addTo(group);
    const plain = { interactive: false } as const;

    for (const f of FACILITY_GEO.features) {
      const p = f.properties;
      switch (p.kind) {
        case 'outline': {
          // drawn by the plan artwork; kept (invisible) for the bounds
          const poly = L.polygon(ring(f), { ...plain, stroke: false, fillOpacity: 0 }).addTo(this.groups.plan);
          this.planBounds = poly.getBounds();
          break;
        }
        // walls, doors, bay lines and machine details are part of the plan artwork
        case 'rack':
          L.polygon(ring(f), HIT)
            .bindTooltip(`<strong>${esc(String(p.name))}</strong><span>Pallet racking</span>`, { className: 'rl-tip', sticky: true, direction: 'top' })
            .addTo(this.groups.plan);
          break;
        case 'machine':
        case 'tank':
        case 'truck':
          L.polygon(ring(f), HIT)
            .bindTooltip(`<strong>${esc(String(p.name))}</strong>`, { className: 'rl-tip', sticky: true, direction: 'top' })
            .addTo(this.groups.plan);
          break;
        case 'aisle': {
          const b = L.polygon(ring(f)).getBounds();
          label(L.latLng(b.getSouth() - 0.000004, b.getCenter().lng), `<span class="rl-aisle">${esc(String(p.name))}</span>`, this.groups.labels);
          break;
        }
        case 'zone':
        case 'room': {
          if (p['hidden']) break;
          const color = String(p['color']);
          const isZone = p.kind === 'zone';
          const poly = L.polygon(ring(f), isZone
            ? { color, weight: 2, dashArray: '7 6', fillColor: color, fillOpacity: p['restricted'] ? 0.13 : 0.09, className: 'rl-zone' + (p['restricted'] ? ' is-restricted' : '') }
            : { stroke: false, fillColor: '#0f172a', fillOpacity: 0, className: 'rl-room' });
          poly.bindTooltip(`<strong>${esc(String(p.name))}</strong><span>${esc(String(p['type']))} · ${esc(String(p['rule']))}</span>`, { className: 'rl-tip', sticky: true, direction: 'top' });
          poly.addTo(isZone ? this.groups.zones : this.groups.plan);
          const b = poly.getBounds();
          if (isZone) {
            const at = p.id === 'loading-bay' ? b.getCenter() : L.latLng(b.getNorth() - 0.000016, b.getCenter().lng);
            label(at, `<span class="rl-zone-lbl${p['restricted'] ? ' is-red' : ''}" style="--c:${color}">${esc(String(p.name))}</span>`, this.groups.labels);
          } else {
            label(L.latLng(b.getCenter().lat + 0.000012, b.getCenter().lng), `<span class="rl-room-lbl">${esc(String(p.name))}</span>`, this.groups.labels);
          }
          break;
        }
        case 'gateway': {
          const [lng, lat] = f.geometry.coordinates as LngLat;
          L.marker([lat, lng], { keyboard: false, icon: L.divIcon({ className: 'rl-wrap', html: `<span class="rl-gw">${svgOf(ICONS['gateway'], 2.6)}</span><span class="rl-gw-id">${esc(p.id)}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
            .bindTooltip(`<strong>${esc(p.id)}</strong><span>${esc(String(p['model']))} · Online · ${this.countNear(lng, lat)} assets within 15 m</span>`, { className: 'rl-tip', direction: 'top', offset: [0, -10] })
            .addTo(this.groups.gateways);
          break;
        }
      }
    }
  }

  /** Geofence outlines (polygons, rectangles and circles as rings) from the API. */
  private drawGeofences(): void {
    const L = this.L;
    const zones = this.geoZones;
    const labels = this.geoLabels;
    if (!L || !zones || !labels) return;
    zones.clearLayers();
    labels.clearLayers();
    for (const z of this.geofences) {
      if (z.hidden || z.ring.length < 3) continue;
      const poly = L.polygon(z.ring.map(([lng, lat]) => L.latLng(lat, lng)), { color: z.color, weight: 2, dashArray: '7 6', fillColor: z.color, fillOpacity: z.restricted ? 0.13 : 0.09, className: 'rl-zone' + (z.restricted ? ' is-restricted' : '') });
      poly.bindTooltip(`<strong>${esc(z.name)}</strong><span>${esc(z.type)} · ${esc(z.rule)}</span>`, { className: 'rl-tip', sticky: true, direction: 'top' });
      poly.addTo(zones);
      const b = poly.getBounds();
      L.marker(L.latLng(b.getNorth(), b.getCenter().lng), { interactive: false, keyboard: false, icon: L.divIcon({ className: 'rl-lbl-wrap', html: `<span class="rl-zone-lbl${z.restricted ? ' is-red' : ''}" style="--c:${z.color}">${esc(z.name)}</span>`, iconSize: [0, 0] }) }).addTo(labels);
    }
  }

  private countNear(lng: number, lat: number): number {
    return ASSETS.filter((a) => distanceM(a, { lng, lat }) <= 15).length;
  }

  private drawAssets(L: L): void {
    // everything else in view: small status dots
    for (const a of ASSETS.filter((x) => !x.featured)) {
      const m = L.circleMarker([a.lat, a.lng], { radius: 4, weight: 1.5, color: '#ffffff', fillColor: stateColor(a), fillOpacity: 1, className: 'rl-dot' + (a.state === 'breach' ? ' is-breach' : '') });
      m.bindTooltip(() => this.tipFor(a), { className: 'rl-tip', direction: 'top', offset: [0, -4] });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.zone.run(() => this.select.emit(a.id));
      });
      m.addTo(this.groups.assets);
      this.markers.set(a.id, m);
    }
    // featured assets with label cards
    for (const a of ASSETS.filter((x) => x.featured)) {
      const m = L.marker([a.lat, a.lng], { keyboard: false, riseOnHover: true, zIndexOffset: 800, icon: this.featuredIcon(L, a) });
      m.bindTooltip(() => this.tipFor(a), { className: 'rl-tip', direction: 'top', offset: [0, -16] });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.zone.run(() => this.select.emit(a.id));
      });
      m.addTo(this.groups.featured);
      this.markers.set(a.id, m);
      L.marker([a.lat, a.lng], { interactive: false, keyboard: false, zIndexOffset: 700, icon: L.divIcon({ className: 'rl-card-wrap', html: this.cardHtml(a), iconSize: [0, 0] }) }).addTo(this.groups.featured);
    }
  }

  private tipFor(a: TrackedAsset): string {
    const pos = (this.markers.get(a.id)?.getLatLng() ?? { lat: a.lat, lng: a.lng }) as { lat: number; lng: number };
    const state = a.state === 'breach' ? 'Geofence breach' : a.state === 'stationary' && isLowConfidence(a) ? 'Stationary · low confidence' : a.state[0].toUpperCase() + a.state.slice(1);
    return `<strong>${esc(a.id)} · ${esc(a.name)}</strong><span><i class="rl-tip-dot" style="background:${stateColor(a)}"></i>${state}${a.speed ? ' · ' + a.speed + ' m/s' : ''}</span><span>${esc(placeOf(pos.lng, pos.lat))} · ±${a.accuracy} m</span>`;
  }

  private featuredIcon(L: L, a: TrackedAsset): Leaflet.DivIcon {
    const sel = a.id === this.selectedId ? ' is-sel' : '';
    if (a.state === 'breach') {
      return L.divIcon({ className: 'rl-wrap', html: `<span class="rl-alert${sel}">${svgOf(ICONS['alert'], 2.4)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    }
    return L.divIcon({ className: 'rl-wrap', html: `<span class="rl-mk${sel}" style="--c:${stateColor(a)}"><i></i></span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  private cardHtml(a: TrackedAsset): string {
    const status = a.state === 'moving' ? `${a.speed} m/s` : a.state === 'breach' ? '<em>Near Boundary</em>' : 'Stationary';
    return `<span class="rl-card${a.state === 'breach' ? ' is-alert' : ''}" style="--c:${stateColor(a)}"><b>${esc(a.id)}</b><span>${esc(a.name)}</span><span>${status}</span></span>`;
  }

  private restyle(): void {
    const L = this.L;
    if (!L) return;
    for (const a of ASSETS) {
      const m = this.markers.get(a.id);
      if (!m) continue;
      if (a.featured) (m as Leaflet.Marker).setIcon(this.featuredIcon(L, a));
      else {
        const sel = a.id === this.selectedId;
        (m as Leaflet.CircleMarker).setStyle({ weight: sel ? 3 : 1.5, color: sel ? '#111827' : '#ffffff' });
        (m as Leaflet.CircleMarker).setRadius(sel ? 7 : 4);
        m.getElement()?.classList.toggle('is-sel', sel);
        if (sel) (m as Leaflet.CircleMarker).bringToFront();
      }
    }
    this.showAccuracy();
  }

  /** Dashed accuracy circle around the selected asset. */
  private showAccuracy(): void {
    const L = this.L;
    if (!L) return;
    this.groups.focus.clearLayers();
    this.accuracy = undefined;
    const a = ASSETS.find((x) => x.id === this.selectedId);
    const m = a && this.markers.get(a.id);
    if (!a || !m) return;
    this.accuracy = L.circle(m.getLatLng(), { radius: a.accuracy, color: stateColor(a), weight: 1.2, dashArray: '3 4', fillColor: stateColor(a), fillOpacity: 0.08, interactive: false }).addTo(this.groups.focus);
  }

  private focus(id: string, zoom = 21): void {
    const m = this.markers.get(id);
    if (!m || !this.map) return;
    this.map.flyTo(m.getLatLng(), Math.max(this.map.getZoom(), zoom), { duration: 0.8 });
  }

  private applyZoomClass(): void {
    if (this.map) this.host.nativeElement.classList.toggle('is-far', this.map.getZoom() < this.nearZoom);
  }

  private applyLayers(): void {
    const map = this.map;
    if (!map) return;
    const set = (g: Leaflet.LayerGroup, on: boolean) => (on ? g.addTo(map) : map.removeLayer(g));
    set(this.groups.zones, this.layers.zones);
    set(this.groups.labels, this.layers.labels);
    set(this.groups.gateways, this.layers.gateways);
    set(this.groups.trails, this.layers.trails);
    set(this.groups.assets, this.layers.assets);
    set(this.groups.featured, this.layers.assets);
    set(this.groups.focus, this.layers.assets);
  }

  private clearReplay(): void {
    if (!this.replay || !this.map) return;
    this.map.removeLayer(this.replay.line);
    this.map.removeLayer(this.replay.ghost);
    this.replay = undefined;
  }

  /** Advances the history replay ghost, if one is running. */
  private animate(t: number): void {
    if (this.replay) {
      const r = this.replay;
      // 4x walking speed (1.4 m/s), then hold the finished line for a moment
      const along = ((t - r.start) / 1000) * 1.4 * 4;
      if (along > r.total + 8) {
        this.clearReplay();
        this.zone.run(() => this.replayDone.emit());
      } else {
        const [lng, lat] = pointAlong(r.path.map((p) => [p.lng, p.lat] as LngLat), Math.min(along, r.total));
        r.ghost.setLatLng([lat, lng]);
      }
    }
  }
}
