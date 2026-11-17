import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Zone } from './geofence-data';
import { LL, zoneShape } from './geofence-geo';

/** An open alert shown on the map next to the asset that raised it. */
export interface MapAlert {
  key: string;
  zoneId: string;
  assetCode: string;
  title: string;
  sub: string;
}

export type MapMode = 'view' | 'draw' | 'edit';

type L = typeof Leaflet;

interface ZoneLayer {
  shape: Leaflet.Polygon | Leaflet.Circle;
  vertices: Leaflet.LayerGroup;
  zone: Zone;
}

/** Neutral view used while the site has no zone geometry. */
const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const TILES = {
  map: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxNativeZoom: 19, maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' } },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxNativeZoom: 19, maxZoom: 20, attribution: 'Imagery &copy; Esri' } },
  satLabels: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', opts: { maxNativeZoom: 19, maxZoom: 20, opacity: 0.85 } },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Leaflet map for Geofence & Alerts: real tiles (street / satellite), zones from the API geometry, alert markers,
 * and drawing / vertex editing of zones. Runs outside Angular; talks back through
 * outputs only.
 */
@Component({
  selector: 'app-geofence-map',
  standalone: true,
  template: '<div #host class="gz-map" [class.is-draw]="mode === \'draw\'" [class.is-edit]="mode === \'edit\'"></div>',
  styleUrls: ['./geofence-map.css'],
  encapsulation: ViewEncapsulation.None,
})
export class GeofenceMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input() site = '';
  @Input() zones: Zone[] = [];
  /** Cheap signature of everything drawn; the map redraws only when it changes. */
  @Input() rev = '';
  @Input() selectedId = '';
  @Input() alerts: MapAlert[] = [];
  @Input() satellite = false;
  @Input() showAssets = true;
  /** Kept for the layers menu; the Tracking API has no gateway positions, so nothing is drawn yet. */
  @Input() showGateways = true;
  @Input() showLabels = true;
  @Input() mode: MapMode = 'view';
  @Input() editId = '';

  @Output() zoneClick = new EventEmitter<string>();
  @Output() alertClick = new EventEmitter<string>();
  @Output() drawPoints = new EventEmitter<number>();
  @Output() drawDone = new EventEmitter<LL[]>();
  @Output() editChange = new EventEmitter<LL[]>();
  @Output() zoomChange = new EventEmitter<{ zoom: number; min: number; max: number }>();
  /** The Leaflet map once created (for the shared drawing tools). */
  @Output() ready = new EventEmitter<Leaflet.Map>();

  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private L?: L;
  private map?: Leaflet.Map;
  private base?: Leaflet.TileLayer;
  private labelsLayer?: Leaflet.TileLayer;
  private zoneGroup?: Leaflet.FeatureGroup;
  private assetGroup?: Leaflet.LayerGroup;
  private alertGroup?: Leaflet.LayerGroup;
  private draftGroup?: Leaflet.LayerGroup;
  private layers = new Map<string, ZoneLayer>();
  private drawPts: LL[] = [];
  private drawGuide?: Leaflet.Polyline;
  private editPoly: LL[] = [];
  private shownSite = '';
  /** The view has been fitted to zone geometry of the shown site. */
  private geoFitted = false;
  private resize?: ResizeObserver;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    const mod = (await import('leaflet')) as unknown as L & { default?: L };
    if (this.destroyed) return;
    // UMD build: the API is either the module itself or its default export, depending on the bundler
    const Lf: L = (typeof (mod as { map?: unknown }).map === "function" ? mod : mod.default) as L;
    this.L = Lf;
    this.zone.runOutsideAngular(() => this.init(Lf));
  }

  ngOnChanges(c: SimpleChanges): void {
    if (!this.map) return;
    this.zone.runOutsideAngular(() => {
      if (c['satellite']) this.setBase();
      const siteChanged = !!c['site'] && this.site !== this.shownSite;
      if (c['rev'] || c['site'] || c['showLabels'] || c['showAssets'] || c['showGateways'] || c['editId'] || c['mode']) this.render();
      if (siteChanged) this.fitSite(true);
      else if (c['rev'] && !this.geoFitted) this.fitSite(false);
      else if (c['selectedId'] && !c['selectedId'].firstChange) this.focusSelected(false);
      if (c['mode']) this.onMode();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resize?.disconnect();
    this.map?.remove();
  }

  // ===================== public API (called from the page) =====================

  zoomIn(): void {
    this.map?.zoomIn(1, { animate: true });
  }

  zoomOut(): void {
    this.map?.zoomOut(1, { animate: true });
  }

  /** Smoothly frame the selected zone. */
  locate(): void {
    this.zone.runOutsideAngular(() => this.focusSelected(true));
  }

  resetView(): void {
    this.zone.runOutsideAngular(() => this.fitSite(true));
  }

  undoPoint(): void {
    this.drawPts.pop();
    this.renderDraft();
  }

  finishDraw(): void {
    if (this.drawPts.length < 3) return;
    const pts = [...this.drawPts];
    this.drawPts = [];
    this.renderDraft();
    this.zone.run(() => this.drawDone.emit(pts));
  }

  get drawCount(): number {
    return this.drawPts.length;
  }

  // ===================== setup =====================

  private init(L: L): void {
    const el = this.host.nativeElement;
    const map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, inertia: true, maxZoom: 20, minZoom: 2, fadeAnimation: true, zoomAnimation: true, markerZoomAnimation: true });
    this.map = map;
    map.attributionControl.setPrefix('');
    L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 120 }).addTo(map);
    this.zoneGroup = L.featureGroup().addTo(map);
    this.assetGroup = L.layerGroup().addTo(map);
    this.alertGroup = L.layerGroup().addTo(map);
    this.draftGroup = L.layerGroup().addTo(map);
    this.setBase();
    this.render();
    this.fitSite(false);
    map.on('click', (e: Leaflet.LeafletMouseEvent) => this.onMapClick(e));
    map.on('mousemove', (e: Leaflet.LeafletMouseEvent) => this.onMapMove(e));
    map.on('zoomend', () => this.emitZoom());
    map.on('dblclick', (e: Leaflet.LeafletMouseEvent) => {
      if (this.mode !== 'draw') return;
      L.DomEvent.stop(e);
      this.finishDraw();
    });
    this.resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    this.resize.observe(el);
    this.emitZoom();
    this.zone.run(() => this.ready.emit(map));
    this.onMode();
  }

  private emitZoom(): void {
    const m = this.map;
    if (!m) return;
    const v = { zoom: m.getZoom(), min: m.getMinZoom(), max: m.getMaxZoom() };
    this.zone.run(() => this.zoomChange.emit(v));
  }

  /** Cross-fades base tiles: the new layer loads under the old one, which is removed once ready. */
  private setBase(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    const spec = this.satellite ? TILES.sat : TILES.map;
    const next = L.tileLayer(spec.url, { ...spec.opts, className: 'gz-tiles' }).addTo(map);
    next.bringToBack();
    const old = this.base;
    const oldLabels = this.labelsLayer;
    this.base = next;
    this.labelsLayer = this.satellite ? L.tileLayer(TILES.satLabels.url, { ...TILES.satLabels.opts, className: 'gz-tiles gz-tiles--labels' }).addTo(map) : undefined;
    const drop = () => {
      if (old) map.removeLayer(old);
      if (oldLabels) map.removeLayer(oldLabels);
    };
    if (old) {
      next.once('load', drop);
      setTimeout(drop, 2500);
    }
    this.host.nativeElement.classList.toggle('is-sat', this.satellite);
  }

  private fitSite(animate: boolean): void {
    const map = this.map;
    const L = this.L;
    if (!map || !L) return;
    this.shownSite = this.site;
    map.setMinZoom(DEFAULT_ZOOM);
    const shapes = [...this.layers.values()].map((l) => l.shape.getBounds());
    if (!shapes.length) {
      // no zone geometry at this site: neutral world view
      this.geoFitted = false;
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate });
      return;
    }
    this.geoFitted = true;
    const bounds = L.latLngBounds(shapes[0].getSouthWest(), shapes[0].getNorthEast());
    for (const b of shapes) bounds.extend(b);
    if (animate) map.flyToBounds(bounds, { padding: [24, 24], duration: 0.9, easeLinearity: 0.2 });
    else map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }

  private boundsOf(id: string): Leaflet.LatLngBounds | null {
    const layer = this.layers.get(id);
    return layer ? layer.shape.getBounds() : null;
  }

  /** Brings the selected zone into view: glides there if it is off-screen (or always, when asked to locate). */
  private focusSelected(force: boolean): void {
    const map = this.map;
    const b = this.boundsOf(this.selectedId);
    if (!map || !b) return;
    const view = map.getBounds().pad(-0.08);
    if (force) map.flyToBounds(b, { padding: [60, 60], maxZoom: 19, duration: 0.8, easeLinearity: 0.2 });
    else if (!view.contains(b)) map.flyToBounds(b, { padding: [60, 60], maxZoom: Math.max(map.getZoom(), 17), duration: 0.7, easeLinearity: 0.2 });
  }

  // ===================== rendering =====================

  private render(): void {
    const L = this.L;
    if (!L || !this.zoneGroup) return;
    this.zoneGroup.clearLayers();
    this.layers.clear();
    const siteZones = this.zones.filter((z) => z.site === this.site);
    for (const z of siteZones) this.drawZone(L, z);
    // selected zone on top
    this.layers.get(this.selectedId)?.shape.bringToFront();
    this.renderAssets(L, siteZones);
    this.renderEdit(L);
    this.renderDraft();
  }

  private style(z: Zone, hover = false): Leaflet.PathOptions {
    const sel = z.id === this.selectedId;
    const off = z.status === 'Disabled';
    return {
      color: off ? '#94a3b8' : z.color,
      weight: sel ? 3.5 : hover ? 3 : 2.2,
      opacity: off ? 0.7 : 1,
      fillColor: off ? '#cbd5e1' : z.color,
      fillOpacity: off ? 0.12 : sel ? 0.42 : hover ? 0.34 : 0.24,
      dashArray: off ? '3 6' : z.type === 'Restricted' ? '8 6' : undefined,
      lineJoin: 'round',
      className: 'gz-zone' + (sel ? ' is-sel' : ''),
    };
  }

  private drawZone(L: L, z: Zone): void {
    const geo = zoneShape(z);
    const editing = this.mode === 'edit' && this.editId === z.id;
    const ring = editing && this.editPoly.length ? this.editPoly : geo.poly;
    let shape: Leaflet.Polygon | Leaflet.Circle;
    if (geo.center && geo.radiusM) shape = L.circle([geo.center.lat, geo.center.lng], { radius: geo.radiusM, ...this.style(z) });
    else if (ring) shape = L.polygon(ring.map((p) => [p.lat, p.lng] as [number, number]), this.style(z));
    else return;
    const vertices = L.layerGroup();
    if (ring && !editing) {
      for (const p of ring) {
        L.circleMarker([p.lat, p.lng], { radius: z.id === this.selectedId ? 4.5 : 3.2, color: z.status === 'Disabled' ? '#94a3b8' : z.color, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false, className: 'gz-vtx' }).addTo(vertices);
      }
    }
    shape.on('mouseover', () => this.mode === 'view' && shape.setStyle(this.style(z, true)));
    shape.on('mouseout', () => shape.setStyle(this.style(z)));
    shape.on('click', (e: Leaflet.LeafletMouseEvent) => {
      if (this.mode === 'draw') return;
      L.DomEvent.stopPropagation(e);
      if (this.mode === 'view') this.zone.run(() => this.zoneClick.emit(z.id));
    });
    shape.bindTooltip(`<strong>${esc(z.name)}</strong><span>${esc(z.type)} · ${z.monitoredCount} assets · ${z.status}</span>`, { sticky: true, direction: 'top', offset: [0, -10], className: 'gz-tip', opacity: 1 });
    if (this.showLabels) {
      const top = ring ? ring.reduce((a, p) => (p.lat > a.lat ? p : a), ring[0]) : null;
      const at = top
        ? L.latLng(top.lat, ring!.reduce((t, p) => t + p.lng, 0) / ring!.length)
        : L.latLng(shape.getBounds().getNorth(), (shape as Leaflet.Circle).getLatLng().lng);
      L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'gz-label-wrap', html: `<span class="gz-label" style="--c:${z.status === 'Disabled' ? '#64748b' : z.color}">${esc(z.name)}</span>`, iconSize: [0, 0] }) }).addTo(vertices);
    }
    shape.addTo(this.zoneGroup!);
    vertices.addTo(this.zoneGroup!);
    this.layers.set(z.id, { shape, vertices, zone: z });
  }

  /** Open alerts are pinned to their zone (asset positions are not part of the zone data). */
  private renderAssets(L: L, siteZones: Zone[]): void {
    this.assetGroup!.clearLayers();
    this.alertGroup!.clearLayers();
    for (const z of siteZones) {
      if (z.status !== 'Active') continue;
      const open = this.alerts.find((a) => a.zoneId === z.id);
      if (!open) continue;
      const geo = zoneShape(z);
      const at = geo.center ?? (geo.poly?.length ? this.centroid(geo.poly) : null);
      if (!at) continue;
      const am = L.marker([at.lat, at.lng], { icon: L.divIcon({ className: 'gz-alert-wrap', html: '<span class="gz-alert">!</span>', iconSize: [22, 22], iconAnchor: [-2, 20] }), keyboard: false, zIndexOffset: 900 })
        .bindTooltip(`<strong>${esc(open.title)}</strong><span>${esc(open.assetCode)} · ${esc(open.sub)}</span>`, { direction: 'top', offset: [10, -22], className: 'gz-tip', opacity: 1 })
        .addTo(this.alertGroup!);
      am.on('click', (e: Leaflet.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.zone.run(() => this.alertClick.emit(open.key));
      });
    }
  }

  private centroid(p: LL[]): LL {
    return { lat: p.reduce((t, x) => t + x.lat, 0) / p.length, lng: p.reduce((t, x) => t + x.lng, 0) / p.length };
  }

  // ===================== drawing =====================

  private onMode(): void {
    const map = this.map;
    if (!map) return;
    if (this.mode !== 'draw') {
      this.drawPts = [];
      this.renderDraft();
    }
    if (this.mode === 'draw') map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }

  private onMapClick(e: Leaflet.LeafletMouseEvent): void {
    if (this.mode !== 'draw') return;
    const p = { lat: e.latlng.lat, lng: e.latlng.lng };
    // clicking near the first point closes the shape
    if (this.drawPts.length >= 3 && this.map) {
      const a = this.map.latLngToContainerPoint([this.drawPts[0].lat, this.drawPts[0].lng]);
      if (a.distanceTo(e.containerPoint) < 14) {
        this.finishDraw();
        return;
      }
    }
    this.drawPts.push(p);
    this.renderDraft();
  }

  private onMapMove(e: Leaflet.LeafletMouseEvent): void {
    if (this.mode !== 'draw' || !this.drawPts.length || !this.L) return;
    const last = this.drawPts[this.drawPts.length - 1];
    const pts: [number, number][] = [[last.lat, last.lng], [e.latlng.lat, e.latlng.lng]];
    if (this.drawPts.length >= 2) pts.push([this.drawPts[0].lat, this.drawPts[0].lng]);
    if (this.drawGuide) this.drawGuide.setLatLngs(pts);
    else this.drawGuide = this.L.polyline(pts, { color: '#6d28d9', weight: 2, dashArray: '5 6', interactive: false, className: 'gz-guide' }).addTo(this.draftGroup!);
  }

  private renderDraft(): void {
    const L = this.L;
    const g = this.draftGroup;
    if (!L || !g) return;
    g.clearLayers();
    this.drawGuide = undefined;
    const pts = this.drawPts.map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length >= 2) L.polygon(pts, { color: '#6d28d9', weight: 2.5, fillColor: '#7c3aed', fillOpacity: 0.18, interactive: false, className: 'gz-draft' }).addTo(g);
    pts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 6 : 4.5, color: '#6d28d9', weight: 2, fillColor: i === 0 ? '#ede9fe' : '#fff', fillOpacity: 1, interactive: false }).addTo(g));
    const n = this.drawPts.length;
    this.zone.run(() => this.drawPoints.emit(n));
  }

  // ===================== vertex editing =====================

  private renderEdit(L: L): void {
    if (this.mode !== 'edit') {
      this.editPoly = [];
      return;
    }
    const layer = this.layers.get(this.editId);
    if (!layer || !(layer.shape instanceof L.Polygon)) return;
    if (!this.editPoly.length) this.editPoly = (zoneShape(layer.zone).poly ?? []).map((p) => ({ ...p }));
    const poly = layer.shape as Leaflet.Polygon;
    const handles = L.layerGroup().addTo(this.draftGroup!);
    const icon = L.divIcon({ className: 'gz-handle-wrap', html: '<span class="gz-handle"></span>', iconSize: [16, 16], iconAnchor: [8, 8] });
    const mid = L.divIcon({ className: 'gz-handle-wrap', html: '<span class="gz-handle gz-handle--mid"></span>', iconSize: [12, 12], iconAnchor: [6, 6] });
    const redraw = () => {
      poly.setLatLngs(this.editPoly.map((p) => [p.lat, p.lng] as [number, number]));
    };
    const build = () => {
      handles.clearLayers();
      this.editPoly.forEach((p, i) => {
        const h = L.marker([p.lat, p.lng], { icon, draggable: true, keyboard: false, zIndexOffset: 1000 }).addTo(handles);
        h.on('drag', () => {
          const ll = h.getLatLng();
          this.editPoly[i] = { lat: ll.lat, lng: ll.lng };
          redraw();
        });
        h.on('dragend', () => {
          build();
          this.emitEdit();
        });
        // double-click a corner to remove it (keeps at least a triangle)
        h.on('dblclick', (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stop(e);
          if (this.editPoly.length <= 3) return;
          this.editPoly.splice(i, 1);
          redraw();
          build();
          this.emitEdit();
        });
      });
      // midpoint handles add a corner when dragged
      this.editPoly.forEach((p, i) => {
        const q = this.editPoly[(i + 1) % this.editPoly.length];
        const m = L.marker([(p.lat + q.lat) / 2, (p.lng + q.lng) / 2], { icon: mid, draggable: true, keyboard: false, zIndexOffset: 900 }).addTo(handles);
        let added = false;
        m.on('dragstart', () => {
          const ll = m.getLatLng();
          this.editPoly.splice(i + 1, 0, { lat: ll.lat, lng: ll.lng });
          added = true;
        });
        m.on('drag', () => {
          if (!added) return;
          const ll = m.getLatLng();
          this.editPoly[i + 1] = { lat: ll.lat, lng: ll.lng };
          redraw();
        });
        m.on('dragend', () => {
          build();
          this.emitEdit();
        });
      });
    };
    redraw();
    build();
  }

  private emitEdit(): void {
    const pts = this.editPoly.map((p) => ({ ...p }));
    this.zone.run(() => this.editChange.emit(pts));
  }
}
