import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Forklift, LucideIconData, Package, Tag, TriangleAlert, Wifi, Wrench, Zap, Droplets } from 'lucide-angular';
import {
  ASSETS, FACILITY_GEO, FacilityFeature, HISTORY_FL008, LngLat, ROUTE_FL008, TrackedAsset,
  distanceM, isLowConfidence, placeOf, pointAlong,
} from './location-data';
import { buildPlanArt } from './rl-plan-art';

type L = typeof Leaflet;

export interface MapLayers { zones: boolean; labels: boolean; gateways: boolean; trails: boolean; assets: boolean }
export interface LivePosition { id: string; lng: number; lat: number; place: string; regLng: number; regLat: number; heading: number }

interface Mover {
  id: string;
  marker: Leaflet.Marker | Leaflet.CircleMarker;
  label?: Leaflet.Marker;
  path: Leaflet.LatLng[];
  cum: number[];
  total: number;
  speed: number;
  dist: number;
  /** ping-pong movers reverse at the ends; loops wrap */
  loop: boolean;
  dir: number;
}

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

export function stateColor(a: TrackedAsset): string {
  if (a.state === 'stationary' && isLowConfidence(a)) return COLOR.lowconf;
  return COLOR[a.state];
}

/**
 * Leaflet indoor floor plan for Real-Time Location (Dubai Plant, Level 1). Everything drawn comes from
 * facility-level1.geo.json (walls, zones, racks, machines, gateways, featured assets, the forklift route); the other
 * assets come from location-data. Runs outside Angular and reports selections / live positions through outputs.
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
  private movers: Mover[] = [];
  private trail?: Leaflet.Polyline;
  private trailPts: Leaflet.LatLng[] = [];
  private arrow?: Leaflet.Marker;
  private accuracy?: Leaflet.Circle;
  private replay?: { line: Leaflet.Polyline; ghost: Leaflet.Marker; path: Leaflet.LatLng[]; cum: number[]; total: number; start: number };
  private frame = 0;
  private last = 0;
  private lastEmit = 0;
  private lastTrail = 0;
  private resize?: ResizeObserver;
  private destroyed = false;
  private nearZoom = 20;

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

  fitPlan(animate: boolean): void {
    if (!this.map || !this.planBounds) return;
    this.map.flyToBounds(this.planBounds, { padding: [10, 10], duration: animate ? 0.8 : 0, animate });
  }

  /** Replays FL-008's recorded run (charging zone → corridor → Aisle 04) as an animated ghost marker. */
  replayHistory(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    this.zone.runOutsideAngular(() => {
      this.clearReplay();
      const path = HISTORY_FL008.map(([lng, lat]) => L.latLng(lat, lng));
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
    const art = buildPlanArt(FACILITY_GEO.features);
    L.svgOverlay(art.svg, [[art.south, art.west], [art.north, art.east]], { pane: 'rl-art', interactive: false, className: 'rl-art' }).addTo(map);
    this.drawPlan(L);
    this.drawAssets(L);
    this.fitPlan(false);
    // the 230-odd background assets only appear once zoomed in past the whole-level view
    this.nearZoom = map.getZoom() + 0.5;
    map.on('zoomend', () => this.applyZoomClass());
    this.applyZoomClass();
    map.setMaxBounds(this.planBounds!.pad(0.35));
    this.applyLayers();
    this.restyle();
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
            .bindTooltip(`<strong>${esc(String(p.name))}</strong><span>Pallet racking · 10 bays</span>`, { className: 'rl-tip', sticky: true, direction: 'top' })
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
      if (a.path) this.addMover(L, a.id, m, undefined, a.path, a.speed, false);
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
      const card = L.marker([a.lat, a.lng], { interactive: false, keyboard: false, zIndexOffset: 700, icon: L.divIcon({ className: 'rl-card-wrap', html: this.cardHtml(a), iconSize: [0, 0] }) }).addTo(this.groups.featured);
      if (a.id === 'FL-008') {
        // FL-008 drives its loop through Aisle 04 / 05; start where the GeoJSON places it
        const route = ROUTE_FL008;
        const mv = this.addMover(L, a.id, m, card, route, a.speed, true);
        mv.dist = 9;
        this.trail = L.polyline([], { color: COLOR.moving, weight: 3, opacity: 0.9, dashArray: '1 7', lineCap: 'round', interactive: false, className: 'rl-trail' }).addTo(this.groups.trails);
        this.arrow = L.marker([a.lat, a.lng], { interactive: false, keyboard: false, zIndexOffset: 750, icon: L.divIcon({ className: 'rl-wrap', html: '<span class="rl-arrow"><i></i></span>', iconSize: [0, 0] }) }).addTo(this.groups.trails);
      }
    }
  }

  private addMover(L: L, id: string, marker: Leaflet.Marker | Leaflet.CircleMarker, label: Leaflet.Marker | undefined, coords: LngLat[], speed: number, loop: boolean): Mover {
    const path = coords.map(([lng, lat]) => L.latLng(lat, lng));
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i - 1].distanceTo(path[i]));
    const mv: Mover = { id, marker, label, path, cum, total: cum[cum.length - 1] || 0.01, speed: speed || 1, dist: 0, loop, dir: 1 };
    this.movers.push(mv);
    return mv;
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

  private animate(t: number): void {
    const L = this.L!;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    for (const mv of this.movers) {
      mv.dist += mv.speed * dt * mv.dir;
      if (mv.loop) mv.dist = ((mv.dist % mv.total) + mv.total) % mv.total;
      else if (mv.dist >= mv.total || mv.dist <= 0) {
        mv.dist = Math.max(0, Math.min(mv.total, mv.dist));
        mv.dir *= -1;
      }
      let i = 1;
      while (i < mv.cum.length - 1 && mv.cum[i] < mv.dist) i++;
      const a = mv.path[i - 1];
      const b = mv.path[i];
      const k = (mv.dist - mv.cum[i - 1]) / (mv.cum[i] - mv.cum[i - 1] || 1);
      const pos = L.latLng(a.lat + (b.lat - a.lat) * k, a.lng + (b.lng - a.lng) * k);
      mv.marker.setLatLng(pos);
      mv.label?.setLatLng(pos);
      if (mv.id === this.selectedId) this.accuracy?.setLatLng(pos);
      if (mv.id === 'FL-008') this.trackFl008(L, mv, pos, a, b, t);
    }
    if (this.replay) {
      const r = this.replay;
      // 4x real speed (1.4 m/s), then hold the finished line for a moment
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

  private trackFl008(L: L, mv: Mover, pos: Leaflet.LatLng, a: Leaflet.LatLng, b: Leaflet.LatLng, t: number): void {
    const heading = Math.atan2((b.lng - a.lng) * Math.cos((pos.lat * Math.PI) / 180), b.lat - a.lat);
    if (t - this.lastTrail > 220) {
      this.lastTrail = t;
      this.trailPts.push(pos);
      if (this.trailPts.length > 45) this.trailPts.shift();
      this.trail?.setLatLngs(this.trailPts);
      // the arrow sits a few metres ahead, pointing the direction of travel
      const ahead = L.latLng(pos.lat + Math.cos(heading) * (4 / 111_320), pos.lng + Math.sin(heading) * (4 / (111_320 * Math.cos((pos.lat * Math.PI) / 180))));
      this.arrow?.setLatLng(ahead);
      const el = this.arrow?.getElement()?.querySelector('.rl-arrow') as HTMLElement | null;
      if (el) el.style.transform = `rotate(${(heading * 180) / Math.PI}deg)`;
    }
    if (t - this.lastEmit > 1000) {
      this.lastEmit = t;
      // the asset's own registered fix trails the device by ~2.5 m (last checkpoint read)
      const back = ((mv.dist - 2.5) % mv.total + mv.total) % mv.total;
      const [rLng, rLat] = pointAlong(mv.path.map((p) => [p.lng, p.lat] as LngLat), back);
      this.zone.run(() => this.live.emit({ id: mv.id, lng: pos.lng, lat: pos.lat, place: placeOf(pos.lng, pos.lat), regLng: rLng, regLat: rLat, heading }));
    }
  }
}

