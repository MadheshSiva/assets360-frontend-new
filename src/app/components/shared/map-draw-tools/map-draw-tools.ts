import { Component, HostListener, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type * as Leaflet from 'leaflet';
import { LucideAngularModule, Check, Maximize, Pentagon, Search, Smartphone, SquarePen, Trash2, Undo2, X } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { DEVICES } from '../../pages/tracking-iot/device-management/device-data';
import { DeviceFix, DevicePositionFeed } from './device-position-feed';
import { MdPortal } from './md-portal';

type L = typeof Leaflet;
type LL = [number, number];
type Mode = 'idle' | 'draw' | 'edit' | 'place';

export interface DrawnArea { id: string; name: string; color: string; points: LL[] }
export interface PlottedDevice { deviceId: string; areaId: string; lat: number; lng: number }
interface DrawState { areas: DrawnArea[]; devices: PlottedDevice[] }
interface PickDevice { id: string; name: string; type: string; serial: string }
interface PickRow { d: PickDevice; plotted: string }

/** Live state of one plotted device: the last fixes, the marker's animation leg and (demo mode) its simulated walk. */
interface Track {
  /** Marker animates from `from` to `to` over `dur` ms starting at `t0`. */
  from: LL;
  to: LL;
  t0: number;
  dur: number;
  /** Marker has reached `to` (nothing to animate). */
  settled: boolean;
  trail: LL[];
  fix: DeviceFix;
  outside: boolean;
  mobile: boolean;
  /** Simulation: where it is heading, how fast, and when a stop ends. */
  target: LL | null;
  speed: number;
  pauseUntil: number;
}

/** Shown in the selected-device card. */
export interface DeviceReading { id: string; name: string; type: string; area: string; color: string; lat: number; lng: number; speed: number; accuracy: number; at: number; outside: boolean; live: boolean; battery: number | null }

const COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#475569'];
const STORE = 'a360.map-draw.';
const M_LAT = 111_320;
/** Trackers move (on people, pallets, vehicles); sensors and readers are fixed installations. */
const MOBILE_TYPES = new Set(['BLE Tracker', 'GPS / Cellular']);
const SIM_STEP_MS = 1000;
const TRAIL_MAX = 40;
/** m/s; anything faster between two fixes is treated as a position jump. */
const MAX_SPEED = 12;

/** Ray-casting point-in-polygon on [lat, lng] points. */
function inside(lat: number, lng: number, pts: LL[]): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i];
    const [yj, xj] = pts[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Ground distance between two [lat, lng] points, metres (flat-earth; fine at site scale). */
function distM(a: LL, b: LL): number {
  const mLng = M_LAT * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * M_LAT, (b[1] - a[1]) * mLng);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Drawing toolkit laid over any Leaflet map: draw named areas (polygons), reshape / recolour / delete them, and plot
 * devices inside an area (pick from the device register, then click inside the area to place). Drawings are kept per
 * map in this browser (localStorage, keyed by `storageKey`). The host map passes its Leaflet instance in `map` and
 * should ignore its own map clicks while the container has the `md-busy` class.
 */
@Component({
  selector: 'app-map-draw-tools',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MdPortal],
  templateUrl: './map-draw-tools.html',
  styleUrls: ['./map-draw-tools.css'],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'md-host', '[class.md-right]': "side === 'right'" },
})
export class MapDrawTools implements OnChanges, OnDestroy {
  @Input() map: Leaflet.Map | null = null;
  @Input() storageKey = 'default';
  @Input() side: 'left' | 'right' = 'left';
  /** Distance of the toolbar from the top of the map, px. */
  @Input() top = 12;
  /** Distance of the toolbar from the map's left (or right) edge, px. */
  @Input() inset = 12;
  /** Backend endpoint returning the latest device fixes (polled). Leave empty to push fixes via DevicePositionFeed. */
  @Input() feedUrl = '';
  @Input() feedEveryMs = 2000;

  readonly icons = { Check, Maximize, Pentagon, Search, Smartphone, SquarePen, Trash2, Undo2, X };
  readonly colors = COLORS;
  private readonly zone = inject(NgZone);
  private L?: L;

  mode: Mode = 'idle';
  color = COLORS[0];
  colorsOpen = false;
  areas: DrawnArea[] = [];
  devices: PlottedDevice[] = [];
  /** Selected area id, or `dev:<deviceId>` for a plotted device. */
  selected = '';
  drawCount = 0;

  /** Name dialog after a polygon is closed. */
  naming: { points: LL[]; name: string } | null = null;
  pickerOpen = false;
  pickerQuery = '';
  /** Picker rows, rebuilt only when the query or plotted set changes (keeps row elements stable for clicks). */
  pickRows: PickRow[] = [];
  pickTotal = 0;
  placing: PickDevice | null = null;
  confirmDelete = false;
  toast = '';
  /** Latest reading of the selected device. */
  reading: DeviceReading | null = null;

  private readonly feed = inject(DevicePositionFeed);
  private feedSub?: Subscription;
  private stopPoll?: () => void;
  private tracks = new Map<string, Track>();
  private markers = new Map<string, Leaflet.Marker>();
  private trails = new Map<string, Leaflet.Polyline>();
  private accuracy?: Leaflet.Circle;
  private simTimer?: ReturnType<typeof setInterval>;
  private frame = 0;
  private lastSave = 0;

  private group?: Leaflet.LayerGroup;
  private handles?: Leaflet.LayerGroup;
  private draft?: Leaflet.LayerGroup;
  private polys = new Map<string, Leaflet.Polygon>();
  private drawPts: LL[] = [];
  private guide?: Leaflet.Polyline;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly onClick = (e: Leaflet.LeafletMouseEvent) => this.mapClick(e);
  private readonly onMove = (e: Leaflet.LeafletMouseEvent) => this.mapMove(e);
  private readonly onDbl = (e: Leaflet.LeafletMouseEvent) => {
    if (this.mode !== 'draw') return;
    this.L?.DomEvent.stop(e);
    this.zone.run(() => this.finishDraw());
  };

  async ngOnChanges(c: SimpleChanges): Promise<void> {
    if (c['map'] && this.map) {
      if (!this.L) {
        const mod = (await import('leaflet')) as unknown as L & { default?: L };
        // UMD build: the API is either the module itself or its default export, depending on the bundler
        this.L = (typeof (mod as { map?: unknown }).map === 'function' ? mod : mod.default) as L;
      }
      this.load();
      this.zone.runOutsideAngular(() => {
        this.attach();
        this.startTracking();
      });
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    this.stopTracking();
    this.detach();
  }

  // ===== toolbar =====

  get selectedArea(): DrawnArea | null {
    return this.areas.find((a) => a.id === this.selected) ?? null;
  }

  get selectedDevice(): PlottedDevice | null {
    return this.selected.startsWith('dev:') ? this.devices.find((d) => 'dev:' + d.deviceId === this.selected) ?? null : null;
  }

  startDraw(): void {
    if (this.mode === 'draw') return this.cancel();
    this.cancel();
    this.select('');
    this.mode = 'draw';
    this.drawPts = [];
    this.drawCount = 0;
    this.map?.doubleClickZoom.disable();
    this.syncBusy();
  }

  toggleEdit(): void {
    if (this.mode === 'edit') return this.cancel();
    if (!this.selectedArea) return this.showToast('Select an area on the map to edit it.');
    this.cancel();
    this.mode = 'edit';
    this.syncBusy();
    this.renderHandles();
  }

  setColor(c: string): void {
    this.color = c;
    this.colorsOpen = false;
    const a = this.selectedArea;
    if (a) {
      a.color = c;
      this.save();
      this.render();
    }
  }

  openPicker(): void {
    if (!this.selectedArea) return this.showToast('Select (or draw) an area first, then plot a device inside it.');
    this.cancel(false);
    this.pickerQuery = '';
    this.refreshPick();
    this.pickerOpen = true;
  }

  fitAll(): void {
    const L = this.L;
    if (!L || !this.map || !this.areas.length) return this.showToast('No areas drawn on this map yet.');
    const b = L.latLngBounds(this.areas.flatMap((a) => a.points));
    this.map.flyToBounds(b, { padding: [40, 40], duration: 0.7, maxZoom: Math.max(this.map.getZoom(), 19) });
  }

  askDelete(): void {
    if (!this.selected) return this.showToast('Select an area or a plotted device to delete.');
    this.confirmDelete = true;
  }

  doDelete(): void {
    this.confirmDelete = false;
    const dev = this.selectedDevice;
    if (dev) {
      this.devices = this.devices.filter((d) => d !== dev);
      this.showToast(`${this.deviceLabel(dev.deviceId)} removed from the map.`);
    } else if (this.selectedArea) {
      const a = this.selectedArea;
      const n = this.devices.filter((d) => d.areaId === a.id).length;
      this.areas = this.areas.filter((x) => x !== a);
      this.devices = this.devices.filter((d) => d.areaId !== a.id);
      this.showToast(`${a.name} deleted${n ? ` with ${n} plotted device${n === 1 ? '' : 's'}` : ''}.`);
    }
    if (this.mode === 'edit') this.cancel();
    this.selected = '';
    this.reading = null;
    this.dropStaleTracks();
    this.save();
    this.render();
  }

  get deleteText(): string {
    const dev = this.selectedDevice;
    if (dev) return `Remove ${this.deviceLabel(dev.deviceId)} from ${this.areaName(dev.areaId)}?`;
    const a = this.selectedArea;
    const n = a ? this.devices.filter((d) => d.areaId === a.id).length : 0;
    return `Delete ${a?.name}?${n ? ` Its ${n} plotted device${n === 1 ? '' : 's'} will be removed too.` : ''}`;
  }

  // ===== drawing =====

  undoPoint(): void {
    this.drawPts.pop();
    this.drawCount = this.drawPts.length;
    this.renderDraft();
  }

  finishDraw(): void {
    if (this.drawPts.length < 3) return;
    const points = [...this.drawPts];
    this.drawPts = [];
    this.renderDraft();
    this.mode = 'idle';
    this.map?.doubleClickZoom.enable();
    this.syncBusy();
    this.naming = { points, name: this.nextName() };
  }

  saveName(): void {
    const n = this.naming;
    if (!n) return;
    const name = n.name.trim() || this.nextName();
    const area: DrawnArea = { id: 'A' + Date.now().toString(36), name, color: this.color, points: n.points };
    this.areas = [...this.areas, area];
    this.naming = null;
    this.selected = area.id;
    this.save();
    this.render();
    this.showToast(`${name} saved. Use the device button to plot a device inside it.`);
  }

  discardName(): void {
    this.naming = null;
  }

  /** Leaves draw / edit / place mode. */
  cancel(clearPick = true): void {
    if (this.mode === 'draw') {
      this.drawPts = [];
      this.renderDraft();
      this.map?.doubleClickZoom.enable();
    }
    this.mode = 'idle';
    if (clearPick) this.placing = null;
    this.handles?.clearLayers();
    this.syncBusy();
    this.render();
  }

  // ===== device picker =====

  /** Rebuilds the picker rows; called when the picker opens and when the search changes (never per change detection). */
  refreshPick(): void {
    const q = this.pickerQuery.trim().toLowerCase();
    const plotted = new Map(this.devices.map((p) => [p.deviceId, this.areaName(p.areaId)]));
    const hits = DEVICES.filter((d) => !q || `${d.name} ${d.id} ${d.type} ${d.serial}`.toLowerCase().includes(q));
    this.pickTotal = hits.length;
    this.pickRows = hits
      .map((d) => ({ d: { id: d.id, name: d.name, type: d.type, serial: d.serial }, plotted: plotted.get(d.id) ?? '' }))
      // already plotted first, as a reminder of what is on the map
      .sort((a, b) => +!a.plotted - +!b.plotted)
      .slice(0, 60);
  }

  trackRow(_: number, r: PickRow): string {
    return r.d.id;
  }

  pick(d: PickDevice): void {
    this.pickerOpen = false;
    this.placing = d;
    this.mode = 'place';
    this.syncBusy();
  }

  get placeArea(): DrawnArea | null {
    return this.selectedArea;
  }

  // ===== map events =====

  private attach(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    this.detach();
    if (!map.getPane('md-areas')) map.createPane('md-areas').style.zIndex = '420';
    if (!map.getPane('md-devices')) map.createPane('md-devices').style.zIndex = '640';
    this.group = L.layerGroup().addTo(map);
    this.draft = L.layerGroup().addTo(map);
    this.handles = L.layerGroup().addTo(map);
    map.on('click', this.onClick);
    map.on('mousemove', this.onMove);
    map.on('dblclick', this.onDbl);
    this.render();
  }

  private detach(): void {
    const map = this.map;
    if (!map) return;
    map.off('click', this.onClick);
    map.off('mousemove', this.onMove);
    map.off('dblclick', this.onDbl);
    for (const g of [this.group, this.draft, this.handles]) if (g) map.removeLayer(g);
  }

  private mapClick(e: Leaflet.LeafletMouseEvent): void {
    const pt: LL = [e.latlng.lat, e.latlng.lng];
    if (this.mode === 'draw') {
      const first = this.drawPts[0];
      // clicking near the first corner closes the shape
      if (first && this.drawPts.length >= 3 && this.map!.latLngToContainerPoint(first).distanceTo(e.containerPoint) < 12) {
        this.zone.run(() => this.finishDraw());
        return;
      }
      this.drawPts.push(pt);
      this.renderDraft();
      this.zone.run(() => (this.drawCount = this.drawPts.length));
    } else if (this.mode === 'place') {
      this.zone.run(() => this.place(pt));
    } else if (this.mode === 'idle' && this.selected) {
      this.zone.run(() => this.select(''));
    }
  }

  private mapMove(e: Leaflet.LeafletMouseEvent): void {
    if (this.mode !== 'draw' || !this.drawPts.length || !this.guide) return;
    this.guide.setLatLngs([this.drawPts[this.drawPts.length - 1], e.latlng, this.drawPts[0]]);
  }

  private place(pt: LL): void {
    const a = this.selectedArea;
    const d = this.placing;
    if (!a || !d) return;
    if (!inside(pt[0], pt[1], a.points)) return this.showToast(`Click inside ${a.name} to place ${d.name}.`);
    // a device lives in one place: re-plotting moves it
    this.devices = [...this.devices.filter((x) => x.deviceId !== d.id), { deviceId: d.id, areaId: a.id, lat: pt[0], lng: pt[1] }];
    this.tracks.delete(d.id);
    this.placing = null;
    this.mode = 'idle';
    this.syncBusy();
    this.save();
    this.render();
    this.showToast(`${d.name} (${d.id}) plotted in ${a.name}.`);
  }

  // ===== rendering =====

  private select(id: string): void {
    if (this.mode === 'edit' && id !== this.selected) this.cancel();
    this.selected = id;
    this.colorsOpen = false;
    this.render();
    this.updateReading();
  }

  private render(): void {
    const L = this.L;
    const g = this.group;
    if (!L || !g) return;
    this.zone.runOutsideAngular(() => {
      g.clearLayers();
      this.polys.clear();
      for (const a of this.areas) {
        const sel = a.id === this.selected;
        const poly = L.polygon(a.points, { pane: 'md-areas', color: a.color, weight: sel ? 3 : 2, dashArray: sel ? undefined : '6 5', fillColor: a.color, fillOpacity: sel ? 0.22 : 0.13, className: 'md-area' });
        poly.bindTooltip(esc(a.name), { permanent: true, direction: 'top', className: 'md-label' + (sel ? ' is-sel' : ''), offset: [0, -4] });
        poly.on('click', (e: Leaflet.LeafletMouseEvent) => {
          if (this.mode === 'draw' || this.mode === 'place') return;
          L.DomEvent.stopPropagation(e);
          this.zone.run(() => this.select(a.id));
        });
        poly.addTo(g);
        // anchor the label to the top edge of the area
        const b = poly.getBounds();
        poly.openTooltip([b.getNorth(), b.getCenter().lng]);
        this.polys.set(a.id, poly);
      }
      this.markers.clear();
      this.trails.clear();
      this.accuracy = undefined;
      for (const d of this.devices) {
        const area = this.areas.find((a) => a.id === d.areaId);
        if (!area) continue;
        const t = this.trackOf(d);
        const sel = this.selected === 'dev:' + d.deviceId;
        const editable = this.mode === 'edit' && this.selected === area.id;
        const at = this.posOf(t, performance.now());
        // recent movement trail, faded dashes in the area colour
        this.trails.set(d.deviceId, L.polyline(t.trail, { pane: 'md-areas', color: area.color, weight: sel ? 3 : 2, opacity: sel ? 0.85 : 0.5, dashArray: '2 6', lineCap: 'round', interactive: false }).addTo(g));
        if (sel) this.accuracy = L.circle(at, { pane: 'md-areas', radius: t.fix.accuracy ?? 2, color: area.color, weight: 1, dashArray: '3 4', fillColor: area.color, fillOpacity: 0.1, interactive: false }).addTo(g);
        const m = L.marker(at, {
          pane: 'md-devices', draggable: editable, keyboard: false,
          icon: L.divIcon({ className: 'md-dev-wrap', html: `<span class="md-dev${sel ? ' is-sel' : ''}${t.outside ? ' is-out' : ''}${t.mobile ? '' : ' is-fixed'}" style="--c:${area.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="3"/><path d="M10 7h4"/><circle cx="12" cy="15" r="1.6"/></svg></span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
        });
        this.markers.set(d.deviceId, m);
        m.bindTooltip(() => this.tipOf(d, area), { className: 'md-tip', direction: 'top', offset: [0, -14] });
        m.on('click', (e: Leaflet.LeafletMouseEvent) => {
          if (this.mode === 'draw' || this.mode === 'place') return;
          L.DomEvent.stopPropagation(e);
          this.zone.run(() => this.select('dev:' + d.deviceId));
        });
        if (editable) {
          const from = L.latLng(at[0], at[1]);
          m.on('dragend', () => {
            const p = m.getLatLng();
            if (!inside(p.lat, p.lng, area.points)) {
              m.setLatLng(from);
              this.zone.run(() => this.showToast(`Devices stay inside ${area.name}.`));
              return;
            }
            // a manual move restarts the device's history from the new spot
            this.tracks.delete(d.deviceId);
            d.lat = p.lat;
            d.lng = p.lng;
            this.trackOf(d);
            this.save();
          });
        }
        m.addTo(g);
      }
    });
    if (this.mode === 'edit') this.renderHandles();
  }

  /** Corner handles (drag to move, double-click to remove) and midpoint handles (drag to add a corner). */
  private renderHandles(): void {
    const L = this.L;
    const h = this.handles;
    const a = this.selectedArea;
    if (!L || !h) return;
    this.zone.runOutsideAngular(() => {
      h.clearLayers();
      if (!a || this.mode !== 'edit') return;
      const poly = this.polys.get(a.id);
      const icon = (cls: string) => L.divIcon({ className: 'md-handle-wrap', html: `<span class="${cls}" style="--c:${a.color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
      a.points.forEach((p, i) => {
        const v = L.marker(p, { draggable: true, keyboard: false, pane: 'md-devices', icon: icon('md-vertex') }).addTo(h);
        v.on('drag', () => {
          const q = v.getLatLng();
          a.points[i] = [q.lat, q.lng];
          poly?.setLatLngs(a.points);
        });
        v.on('dragend', () => this.commitShape());
        v.on('dblclick', (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stop(e);
          if (a.points.length <= 3) return this.zone.run(() => this.showToast('An area needs at least 3 corners.'));
          a.points.splice(i, 1);
          this.commitShape();
        });
      });
      a.points.forEach((p, i) => {
        const q = a.points[(i + 1) % a.points.length];
        const mid = L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { draggable: true, keyboard: false, pane: 'md-devices', icon: icon('md-mid') }).addTo(h);
        let added = false;
        mid.on('drag', () => {
          const m = mid.getLatLng();
          if (!added) {
            a.points.splice(i + 1, 0, [m.lat, m.lng]);
            added = true;
          }
          a.points[i + 1] = [m.lat, m.lng];
          poly?.setLatLngs(a.points);
        });
        mid.on('dragend', () => this.commitShape());
      });
    });
  }

  private commitShape(): void {
    this.save();
    this.zone.run(() => this.render());
  }

  private renderDraft(): void {
    const L = this.L;
    const g = this.draft;
    if (!L || !g) return;
    g.clearLayers();
    this.guide = undefined;
    if (!this.drawPts.length) return;
    L.polygon(this.drawPts, { color: this.color, weight: 2, fillColor: this.color, fillOpacity: 0.12, interactive: false }).addTo(g);
    this.guide = L.polyline([this.drawPts[this.drawPts.length - 1], this.drawPts[0]], { color: this.color, weight: 1.5, dashArray: '5 5', interactive: false }).addTo(g);
    this.drawPts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 6 : 4, color: '#fff', weight: 2, fillColor: this.color, fillOpacity: 1, interactive: false }).addTo(g));
  }

  private syncBusy(): void {
    const el = this.map?.getContainer();
    if (!el) return;
    el.classList.toggle('md-busy', this.mode === 'draw' || this.mode === 'place');
    el.classList.toggle('md-drawing', this.mode === 'draw' || this.mode === 'place');
  }

  // ===== live tracking =====

  private startTracking(): void {
    this.stopTracking();
    this.feedSub = this.feed.fixes$.subscribe((f) => this.onFix(f, true));
    if (this.feedUrl) this.stopPoll = this.feed.poll(this.feedUrl, this.feedEveryMs);
    this.simTimer = setInterval(() => this.simulate(), SIM_STEP_MS);
    const tick = () => {
      this.animate();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopTracking(): void {
    this.feedSub?.unsubscribe();
    this.stopPoll?.();
    clearInterval(this.simTimer);
    cancelAnimationFrame(this.frame);
  }

  private areaOf(d: PlottedDevice): DrawnArea | undefined {
    return this.areas.find((a) => a.id === d.areaId);
  }

  private trackOf(d: PlottedDevice): Track {
    let t = this.tracks.get(d.deviceId);
    if (!t) {
      const p: LL = [d.lat, d.lng];
      const type = DEVICES.find((x) => x.id === d.deviceId)?.type ?? '';
      const mobile = MOBILE_TYPES.has(type);
      const area = this.areaOf(d);
      t = {
        from: p, to: p, t0: 0, dur: 0, settled: true, trail: [p],
        fix: { deviceId: d.deviceId, lat: d.lat, lng: d.lng, at: Date.now(), accuracy: mobile ? 2.6 : 1.2, speed: 0 },
        outside: !!area && !inside(d.lat, d.lng, area.points), mobile, target: null,
        // walking pace for tags on people / pallets, vehicle pace for GPS trackers
        speed: type === 'GPS / Cellular' ? 1.6 + Math.random() * 0.8 : 0.6 + Math.random() * 0.7,
        pauseUntil: Date.now() + 1500 + Math.random() * 2000,
      };
      this.tracks.set(d.deviceId, t);
    }
    return t;
  }

  private dropStaleTracks(): void {
    const ids = new Set(this.devices.map((d) => d.deviceId));
    for (const id of [...this.tracks.keys()]) if (!ids.has(id)) this.tracks.delete(id);
  }

  /** Where the marker is right now along its current animation leg. */
  private posOf(t: Track, now: number): LL {
    const k = t.dur ? Math.min(1, Math.max(0, (now - t.t0) / t.dur)) : 1;
    return [t.from[0] + (t.to[0] - t.from[0]) * k, t.from[1] + (t.to[1] - t.from[1]) * k];
  }

  /** Applies one location fix (from the backend, or simulated) to a plotted device. */
  private onFix(f: DeviceFix, live: boolean): void {
    const d = this.devices.find((x) => x.deviceId === f.deviceId);
    const area = d && this.areaOf(d);
    if (!d || !area) return;
    const t = this.trackOf(d);
    if (live && f.at < t.fix.at) return; // late / out-of-order fix
    const now = performance.now();
    const to: LL = [f.lat, f.lng];
    const metres = distM(t.to, to);
    const dt = Math.max(0.001, (f.at - t.fix.at) / 1000);
    t.from = this.posOf(t, now);
    t.to = to;
    t.t0 = now;
    // faster than any tracked asset moves on site: a position jump (re-acquired signal), so snap instead of gliding
    const jump = metres / dt > MAX_SPEED;
    t.dur = jump ? 0 : live ? Math.min(2000, Math.max(300, f.at - t.fix.at)) : SIM_STEP_MS;
    t.settled = false;
    t.fix = { ...f, speed: f.speed ?? (jump || metres <= 0.2 ? 0 : +(metres / dt).toFixed(2)) };
    if (metres > 0.3) {
      t.trail.push(to);
      if (t.trail.length > TRAIL_MAX) t.trail.shift();
      this.trails.get(d.deviceId)?.setLatLngs(t.trail);
    }
    d.lat = f.lat;
    d.lng = f.lng;
    if ('dev:' + d.deviceId === this.selected) this.accuracy?.setRadius(f.accuracy ?? 2);
    const out = !inside(f.lat, f.lng, area.points);
    if (out !== t.outside) {
      t.outside = out;
      this.markers.get(d.deviceId)?.getElement()?.querySelector('.md-dev')?.classList.toggle('is-out', out);
      const name = `${this.deviceLabel(d.deviceId)} (${d.deviceId})`;
      this.zone.run(() => this.showToast(out ? `${name} has left ${area.name}.` : `${name} is back inside ${area.name}.`));
    }
    if ('dev:' + d.deviceId === this.selected) this.zone.run(() => this.updateReading());
    if (Date.now() - this.lastSave > 10_000) {
      this.lastSave = Date.now();
      this.save();
    }
  }

  /**
   * Demo mode for devices the backend has not reported: trackers walk between random points inside their area at a
   * realistic pace, with occasional stops; sensors and readers stay put and send a heartbeat.
   */
  private simulate(): void {
    const now = Date.now();
    for (const d of this.devices) {
      if (this.feed.isLive(d.deviceId)) continue;
      const area = this.areaOf(d);
      if (!area || (this.mode === 'edit' && this.selected === area.id)) continue;
      const t = this.trackOf(d);
      if (!t.mobile || now < t.pauseUntil) {
        if (now - t.fix.at >= (t.mobile ? 3000 : 5000)) this.onFix({ ...t.fix, at: now, speed: 0 }, false);
        continue;
      }
      const cur: LL = [d.lat, d.lng];
      t.target ??= this.wanderTarget(area, cur);
      if (!t.target) continue;
      const mLng = M_LAT * Math.cos((cur[0] * Math.PI) / 180);
      const dy = (t.target[0] - cur[0]) * M_LAT;
      const dx = (t.target[1] - cur[1]) * mLng;
      const dist = Math.hypot(dx, dy);
      const step = t.speed * (SIM_STEP_MS / 1000) * (0.85 + Math.random() * 0.3);
      let next: LL;
      if (dist <= step) {
        next = t.target;
        t.target = null;
        if (Math.random() < 0.4) t.pauseUntil = now + 2000 + Math.random() * 6000;
      } else {
        next = [cur[0] + ((dy / dist) * step) / M_LAT, cur[1] + ((dx / dist) * step) / mLng];
      }
      if (!inside(next[0], next[1], area.points)) {
        t.target = null;
        continue;
      }
      this.onFix({ deviceId: d.deviceId, lat: next[0], lng: next[1], at: now, accuracy: +(1.8 + Math.random() * 1.6).toFixed(1), speed: +(Math.min(step, dist) / (SIM_STEP_MS / 1000)).toFixed(2) }, false);
    }
  }

  /** A random point inside the area that can be reached in a straight line without leaving it. */
  private wanderTarget(area: DrawnArea, from: LL): LL | null {
    const lats = area.points.map((p) => p[0]);
    const lngs = area.points.map((p) => p[1]);
    const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    for (let i = 0; i < 30; i++) {
      const p: LL = [s + Math.random() * (n - s), w + Math.random() * (e - w)];
      if (!inside(p[0], p[1], area.points) || distM(from, p) < 2) continue;
      let clear = true;
      for (let k = 1; k < 8 && clear; k++) clear = inside(from[0] + ((p[0] - from[0]) * k) / 8, from[1] + ((p[1] - from[1]) * k) / 8, area.points);
      if (clear) return p;
    }
    return null;
  }

  private animate(): void {
    const now = performance.now();
    for (const [id, t] of this.tracks) {
      if (t.settled) continue;
      const m = this.markers.get(id);
      if (!m || m.dragging?.enabled()) continue;
      const p = this.posOf(t, now);
      m.setLatLng(p);
      if (this.selected === 'dev:' + id) this.accuracy?.setLatLng(p);
      if (now - t.t0 >= t.dur) t.settled = true;
    }
  }

  private updateReading(): void {
    const d = this.selectedDevice;
    const area = d && this.areaOf(d);
    if (!d || !area) {
      this.reading = null;
      return;
    }
    const t = this.trackOf(d);
    const rec = DEVICES.find((x) => x.id === d.deviceId);
    this.reading = {
      id: d.deviceId, name: rec?.name ?? d.deviceId, type: rec?.type ?? '', area: area.name, color: area.color,
      lat: t.fix.lat, lng: t.fix.lng, speed: t.fix.speed ?? 0, accuracy: t.fix.accuracy ?? 0, at: t.fix.at,
      outside: t.outside, live: this.feed.isLive(d.deviceId), battery: rec?.battery ?? null,
    };
  }

  private tipOf(d: PlottedDevice, area: DrawnArea): string {
    const t = this.trackOf(d);
    const moving = (t.fix.speed ?? 0) > 0.2;
    const when = new Date(t.fix.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<strong>${esc(this.deviceLabel(d.deviceId))} · ${esc(d.deviceId)}</strong>`
      + `<span>${t.outside ? 'Outside' : 'Inside'} ${esc(area.name)} · ${moving ? `${t.fix.speed} m/s` : 'Stationary'}</span>`
      + `<span>${t.fix.lat.toFixed(6)}, ${t.fix.lng.toFixed(6)} · ±${t.fix.accuracy ?? '–'} m · ${when}</span>`;
  }

  closeReading(): void {
    this.select('');
  }

  // ===== persistence / helpers =====

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE + this.storageKey);
      const s = raw ? (JSON.parse(raw) as DrawState) : null;
      this.areas = s?.areas ?? [];
      this.devices = s?.devices ?? [];
    } catch {
      this.areas = [];
      this.devices = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORE + this.storageKey, JSON.stringify({ areas: this.areas, devices: this.devices } satisfies DrawState));
    } catch {
      /* storage unavailable: drawings last for this visit only */
    }
  }

  private nextName(): string {
    let i = this.areas.length + 1;
    while (this.areas.some((a) => a.name === `Area ${i}`)) i++;
    return `Area ${i}`;
  }

  areaName(id: string): string {
    return this.areas.find((a) => a.id === id)?.name ?? '';
  }

  deviceLabel(id: string): string {
    return DEVICES.find((d) => d.id === id)?.name ?? id;
  }

  devicesIn(a: DrawnArea): number {
    return this.devices.filter((d) => d.areaId === a.id).length;
  }

  private showToast(msg: string): void {
    this.toast = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.pickerOpen || this.naming || this.confirmDelete) {
        this.pickerOpen = false;
        this.naming = null;
        this.confirmDelete = false;
      } else if (this.mode !== 'idle') this.cancel();
      this.colorsOpen = false;
    } else if (e.key === 'Backspace' && this.mode === 'draw' && !(e.target as HTMLElement)?.closest('input, textarea')) {
      e.preventDefault();
      this.undoPoint();
    } else if (e.key === 'Enter' && this.mode === 'draw') {
      this.finishDraw();
    }
  }
}
