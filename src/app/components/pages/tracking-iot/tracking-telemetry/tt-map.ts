import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Droplets, Forklift, LucideIconData, RadioTower, Snowflake, Thermometer, Zap } from 'lucide-angular';
import { CAMPUS_GEO, CampusFeature, MarkerIcon, Status } from './telemetry-data';

type L = typeof Leaflet;
type LngLat = [number, number];

export interface MapLayers { assets: boolean; devices: boolean; gateways: boolean; geofences: boolean }
export interface MapPosition { id: string; lat: number; lng: number }

interface Mover {
  id: string;
  marker: Leaflet.Marker;
  label: Leaflet.Marker;
  path: Leaflet.LatLng[];
  /** cumulative metres at each vertex */
  cum: number[];
  total: number;
  speed: number;
  dist: number;
  last: number;
}

const TILES = {
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxNativeZoom: 19, maxZoom: 20, attribution: 'Imagery &copy; Esri, Maxar' } },
  map: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxNativeZoom: 19, maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' } },
};

/** Marker fill per icon (category colour, as in the design); the status shows as a small corner dot. */
const FILL: Record<MarkerIcon, string> = { forklift: '#f59e0b', pump: '#f59e0b', cold: '#3b82f6', generator: '#dc2626', sensor: '#7c3aed' };
const STATUS_COLOR: Record<Status, string> = { online: '#22c55e', warning: '#f59e0b', offline: '#ef4444' };
const ICON_DATA: Record<MarkerIcon | 'gateway', LucideIconData> = { forklift: Forklift, pump: Droplets, cold: Snowflake, generator: Zap, sensor: Thermometer, gateway: RadioTower };

/** Lucide icon data → inline SVG (markers are plain HTML inside Leaflet). */
function svgOf(data: LucideIconData): string {
  const body = data.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const SVG = Object.fromEntries(Object.entries(ICON_DATA).map(([k, v]) => [k, svgOf(v)])) as Record<MarkerIcon | 'gateway', string>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Leaflet campus map for Tracking & Telemetry. Everything drawn comes from campus.geo.json: building footprints,
 * geofences, internal roads, gateways, asset / device positions and the forklift's patrol route (animated).
 * Runs outside Angular and reports back through outputs.
 */
@Component({
  selector: 'app-tt-map',
  standalone: true,
  template: '<div #host class="tt-map"></div>',
  styleUrls: ['./tt-map.css'],
  encapsulation: ViewEncapsulation.None,
})
export class TtMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input() selectedId = '';
  @Input() layers: MapLayers = { assets: true, devices: true, gateways: true, geofences: true };
  @Input() statuses: Record<string, Status> = {};
  @Input() satellite = true;

  @Output() select = new EventEmitter<string>();
  @Output() moved = new EventEmitter<MapPosition>();
  /** The Leaflet map once created (for the shared drawing tools). */
  @Output() ready = new EventEmitter<Leaflet.Map>();

  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private L?: L;
  private map?: Leaflet.Map;
  private base?: Leaflet.TileLayer;
  private campusBounds?: Leaflet.LatLngBounds;
  private groups: Record<'buildings' | 'roads' | 'geofences' | 'gateways' | 'assets' | 'devices' | 'labels', Leaflet.LayerGroup> = {} as never;
  private markers = new Map<string, Leaflet.Marker>();
  private labels = new Map<string, Leaflet.Marker>();
  private buildings = new Map<string, Leaflet.Polygon>();
  private movers: Mover[] = [];
  private frame = 0;
  private lastEmit = 0;
  private resize?: ResizeObserver;
  private destroyed = false;

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
      if (c['satellite']) this.setBase();
      if (c['selectedId'] || c['statuses']) this.restyleMarkers();
      if (c['selectedId'] && !c['selectedId'].firstChange) this.focus(this.selectedId);
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
    this.map?.zoomIn(0.75);
  }

  zoomOut(): void {
    this.map?.zoomOut(0.75);
  }

  /** Re-centres on the selected item, or the whole campus when nothing is selected. */
  locate(): void {
    if (this.selectedId) this.focus(this.selectedId, 18.5);
    else this.fitCampus(true);
  }

  fitCampus(animate: boolean): void {
    if (!this.map || !this.campusBounds) return;
    this.map.flyToBounds(this.campusBounds, { padding: [18, 18], duration: animate ? 0.8 : 0, animate });
  }

  /** Flies to a building ('' = whole campus) and highlights it. */
  showBuilding(id: string): void {
    const map = this.map;
    if (!map) return;
    this.buildings.forEach((p, key) => p.setStyle(this.buildingStyle(key === id)));
    const poly = this.buildings.get(id);
    if (poly) map.flyToBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 19, duration: 0.9 });
    else this.fitCampus(true);
  }

  // ===== setup =====

  private init(L: L): void {
    const el = this.host.nativeElement;
    const map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxZoom: 20, minZoom: 14, fadeAnimation: true, zoomAnimation: true });
    this.map = map;
    map.attributionControl.setPrefix('');
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(map);
    for (const k of ['roads', 'buildings', 'geofences', 'gateways', 'devices', 'assets', 'labels'] as const) this.groups[k] = L.layerGroup().addTo(map);
    this.setBase();
    this.draw(L);
    this.fitCampus(false);
    this.applyLayers();
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

  /** Cross-fades the base tiles when switching map / satellite. */
  private setBase(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    const spec = this.satellite ? TILES.sat : TILES.map;
    const next = L.tileLayer(spec.url, { ...spec.opts, className: 'tt-tiles' }).addTo(map);
    next.bringToBack();
    const old = this.base;
    this.base = next;
    if (old) {
      const drop = () => map.hasLayer(old) && map.removeLayer(old);
      next.once('load', drop);
      setTimeout(drop, 2500);
    }
    this.host.nativeElement.classList.toggle('is-sat', this.satellite);
    // internal roads only help on the street map; the imagery already shows them
    if (this.groups.roads) {
      if (this.satellite) map.removeLayer(this.groups.roads);
      else this.groups.roads.addTo(map);
    }
  }

  private draw(L: L): void {
    const feats = CAMPUS_GEO.features;
    const ring = (f: CampusFeature) => ((f.geometry.coordinates as LngLat[][])[0]).map(([lng, lat]) => L.latLng(lat, lng));
    for (const f of feats) {
      const p = f.properties;
      switch (p.kind) {
        case 'campus': {
          const poly = L.polygon(ring(f), { color: '#ffffff', weight: 1.5, opacity: 0.7, dashArray: '2 6', fill: false, interactive: false });
          poly.addTo(this.groups.buildings);
          this.campusBounds = poly.getBounds();
          break;
        }
        case 'road':
          L.polyline((f.geometry.coordinates as LngLat[]).map(([lng, lat]) => L.latLng(lat, lng)), { color: '#cbd5e1', weight: 7, opacity: 0.9, interactive: false, lineCap: 'round' }).addTo(this.groups.roads);
          break;
        case 'building': {
          const poly = L.polygon(ring(f), this.buildingStyle(false));
          poly.bindTooltip(`<strong>${esc(String(p.name))}</strong><span>${esc(String(p['use']))} · ${Number(p['areaM2']).toLocaleString()} m²</span>`, { className: 'tt-tip', direction: 'top', sticky: true });
          poly.addTo(this.groups.buildings);
          this.buildings.set(p.id, poly);
          // label at the top edge so markers in the building stay readable
          const bb = poly.getBounds();
          const c = L.latLng(bb.getNorth(), bb.getCenter().lng);
          L.marker(c, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'tt-bl-wrap', html: `<span class="tt-bl">${esc(String(p.name)).replace(' Zone', '<br>Zone').replace(' &amp; ', ' &amp;<br>')}</span>`, iconSize: [0, 0] }) }).addTo(this.groups.labels);
          break;
        }
        case 'geofence':
          L.polygon(ring(f), { color: '#a855f7', weight: 2.2, dashArray: '7 6', fillColor: '#a855f7', fillOpacity: 0.16, className: 'tt-geofence' })
            .bindTooltip(`<strong>Geofence: ${esc(String(p.name))}</strong><span>${esc(String(p['rule']))}</span>`, { className: 'tt-tip', direction: 'top', sticky: true })
            .addTo(this.groups.geofences);
          break;
        case 'gateway': {
          const [lng, lat] = f.geometry.coordinates as LngLat;
          const m = L.marker([lat, lng], { keyboard: false, riseOnHover: true, icon: L.divIcon({ className: 'tt-mk-wrap', html: `<span class="tt-gw">${SVG.gateway}</span><span class="tt-chip">${esc(p.id)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
          m.bindTooltip(`<strong>${esc(p.id)}</strong><span>${esc(String(p['model']))} · Online</span>`, { className: 'tt-tip', direction: 'top', offset: [0, -12] });
          m.addTo(this.groups.gateways);
          break;
        }
        case 'asset':
        case 'device': {
          const [lng, lat] = f.geometry.coordinates as LngLat;
          const icon = p['icon'] as MarkerIcon;
          const m = L.marker([lat, lng], { keyboard: false, riseOnHover: true, icon: this.markerIcon(L, p.id, icon) });
          m.on('click', (e: Leaflet.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            this.zone.run(() => this.select.emit(p.id));
          });
          m.bindTooltip(() => this.tipFor(p.id, String(p['building'])), { className: 'tt-tip', direction: 'top', offset: [0, -16] });
          m.addTo(p.kind === 'asset' ? this.groups.assets : this.groups.devices);
          m.setZIndexOffset(p.kind === 'asset' ? 600 : 400);
          this.markers.set(p.id, m);
          const label = L.marker([lat, lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'tt-chip-wrap', html: `<span class="tt-chip">${esc(p.id)}</span>`, iconSize: [0, 0] }) });
          label.addTo(p.kind === 'asset' ? this.groups.assets : this.groups.devices);
          this.labels.set(p.id, label);
          break;
        }
      }
    }
    // patrol routes: the forklift drives its loop inside Warehouse Zone B
    for (const f of feats.filter((x) => x.properties.kind === 'route')) {
      const id = String(f.properties['asset']);
      const marker = this.markers.get(id);
      const label = this.labels.get(id);
      if (!marker || !label) continue;
      const path = (f.geometry.coordinates as LngLat[]).map(([lng, lat]) => L.latLng(lat, lng));
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i - 1].distanceTo(path[i]));
      this.movers.push({ id, marker, label, path, cum, total: cum[cum.length - 1], speed: Number(f.properties['speedMps']) || 1.5, dist: 0, last: 0 });
    }
  }

  private tipFor(id: string, building: string): string {
    const st = this.statuses[id] ?? 'online';
    const b = CAMPUS_GEO.features.find((f) => f.properties.id === building);
    return `<strong>${esc(id)}</strong><span><i class="tt-dot" style="background:${STATUS_COLOR[st]}"></i>${st[0].toUpperCase() + st.slice(1)} · ${esc(String(b?.properties.name ?? ''))}</span>`;
  }

  private buildingStyle(on: boolean): Leaflet.PathOptions {
    return on
      ? { color: '#c4b5fd', weight: 2.5, fillColor: '#ede9fe', fillOpacity: 0.35, className: 'tt-building is-on' }
      : { color: '#ffffff', weight: 1.4, opacity: 0.85, fillColor: '#f8fafc', fillOpacity: 0.12, className: 'tt-building' };
  }

  private markerIcon(L: L, id: string, icon: MarkerIcon): Leaflet.DivIcon {
    const st = this.statuses[id] ?? 'online';
    const sel = id === this.selectedId;
    return L.divIcon({
      className: 'tt-mk-wrap',
      html: `<span class="tt-mk${sel ? ' is-sel' : ''}${st === 'offline' ? ' is-off' : ''}" style="--f:${FILL[icon]}">${SVG[icon]}<i style="background:${STATUS_COLOR[st]}"></i></span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  private restyleMarkers(): void {
    const L = this.L;
    if (!L) return;
    for (const f of CAMPUS_GEO.features) {
      const m = this.markers.get(f.properties.id);
      if (m) m.setIcon(this.markerIcon(L, f.properties.id, f.properties['icon'] as MarkerIcon));
    }
  }

  private focus(id: string, zoom = 18.25): void {
    const m = this.markers.get(id);
    if (!m || !this.map) return;
    this.map.flyTo(m.getLatLng(), Math.max(this.map.getZoom(), zoom), { duration: 0.8 });
  }

  private applyLayers(): void {
    const map = this.map;
    if (!map) return;
    const set = (g: Leaflet.LayerGroup, on: boolean) => (on ? g.addTo(map) : map.removeLayer(g));
    set(this.groups.assets, this.layers.assets);
    set(this.groups.devices, this.layers.devices);
    set(this.groups.gateways, this.layers.gateways);
    set(this.groups.geofences, this.layers.geofences);
  }

  private animate(t: number): void {
    for (const mv of this.movers) {
      const dt = mv.last ? Math.min(0.1, (t - mv.last) / 1000) : 0;
      mv.last = t;
      mv.dist = (mv.dist + mv.speed * dt) % mv.total;
      let i = 1;
      while (i < mv.cum.length - 1 && mv.cum[i] < mv.dist) i++;
      const a = mv.path[i - 1];
      const b = mv.path[i];
      const seg = mv.cum[i] - mv.cum[i - 1] || 1;
      const k = (mv.dist - mv.cum[i - 1]) / seg;
      const pos = this.L!.latLng(a.lat + (b.lat - a.lat) * k, a.lng + (b.lng - a.lng) * k);
      mv.marker.setLatLng(pos);
      mv.label.setLatLng(pos);
      if (t - this.lastEmit > 1000) {
        this.lastEmit = t;
        this.zone.run(() => this.moved.emit({ id: mv.id, lat: pos.lat, lng: pos.lng }));
      }
    }
  }
}
