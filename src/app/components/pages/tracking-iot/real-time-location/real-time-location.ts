import { Component, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  Bell,
  Box,
  Building2,
  ChevronDown,
  Clock,
  Crosshair,
  Eye,
  Forklift,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Minus,
  Package,
  Pause,
  Play,
  Plus,
  Route,
  Search,
  Settings,
  ShieldAlert,
  Signal,
  Tag,
  TriangleAlert,
  Wifi,
  X,
} from 'lucide-angular';
import {
  ASSETS, AssetState, LEVELS, LocEvent, SITE, TrackedAsset, ZONES, buildEvents, distanceM, isAlert, isLowConfidence, placeOf, trailFL008,
} from './location-data';
import type * as Leaflet from 'leaflet';
import { MapDrawTools } from '../../../shared/map-draw-tools/map-draw-tools';
import { LivePosition, MapLayers, RlMap, stateColor } from './rl-map';

type StatusFilter = '' | AssetState | 'alerts';
interface AlertForm { assetId: string; rule: 'enter' | 'exit' | 'dwell' | 'boundary'; zone: string; minutes: number; notify: string }

const SITES = ['Dubai Plant', 'Abu Dhabi', 'Sharjah Warehouse'];
const RULE_LABEL: Record<AlertForm['rule'], string> = { enter: 'Enters zone', exit: 'Leaves zone', dwell: 'Dwells longer than', boundary: 'Comes within 3 m of boundary' };

@Component({
  selector: 'app-real-time-location',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RlMap, MapDrawTools],
  templateUrl: './real-time-location.html',
  styleUrls: ['./real-time-location.css', './real-time-location-panels.css'],
})
export class RealTimeLocation implements OnDestroy {
  readonly icons = { Bell, Box, Building2, ChevronDown, Clock, Crosshair, Eye, Forklift, Info, Layers, LocateFixed, MapPin, Minus, Package, Pause, Play, Plus, Route, Search, Settings, ShieldAlert, Signal, Tag, TriangleAlert, Wifi, X };
  readonly levels = LEVELS;
  readonly sites = SITES;
  readonly zones = ZONES;
  readonly ruleLabel = RULE_LABEL;
  readonly types = [...new Set(ASSETS.map((a) => a.type))].sort();

  @ViewChild(RlMap) private mapRef?: RlMap;
  private readonly router = inject(Router);

  site = SITE;
  level = LEVELS[0].id;
  /** Seconds since the page opened; drives "updated N sec ago" and last-seen ages. */
  tick = 0;
  /** Location engine refresh cycle, seconds. */
  readonly refresh = 10;
  layers: MapLayers = { zones: true, labels: true, gateways: true, trails: true, assets: true };
  imagery = false;
  drawMap: Leaflet.Map | null = null;
  layersOpen = false;

  search = '';
  typeFilter = '';
  statusFilter: StatusFilter = '';
  zoneFilter = '';

  selectedId = 'FL-008';
  flPos: LivePosition | null = null;
  replaying = false;
  eventsAll = false;
  locateOpen = false;
  locateQuery = '';
  alertForm: AlertForm | null = null;
  formError = '';
  toast = '';

  private readonly openedAt = Date.now();
  private readonly events: LocEvent[] = buildEvents(this.openedAt);
  readonly trail = trailFL008(this.openedAt);
  private timer = setInterval(() => this.tick++, 1000);
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====

  get kpi() {
    let moving = 0, stationary = 0, alerts = 0;
    for (const a of ASSETS) {
      if (a.state === 'moving') moving++;
      else if (a.state === 'stationary') stationary++;
      if (isAlert(a)) alerts++;
    }
    return { total: ASSETS.length, moving, stationary, alerts };
  }

  setStatus(s: StatusFilter): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
  }

  get updatedSec(): number {
    return this.tick % this.refresh;
  }

  // ===== asset list =====

  /** Current position: live for FL-008, otherwise the last fix. */
  posOf(a: TrackedAsset): { lng: number; lat: number } {
    return a.id === 'FL-008' && this.flPos ? this.flPos : a;
  }

  zoneName(a: TrackedAsset): string {
    if (a.id === 'FL-008' && this.flPos) return placeOf(this.flPos.lng, this.flPos.lat).split(' / ')[0];
    return placeOf(a.lng, a.lat).split(' / ')[0];
  }

  /** Seconds since the last fix right now (live assets keep reporting; stale / offline ones age). */
  seenSec(a: TrackedAsset): number {
    if (a.state === 'stale' || a.state === 'offline') return a.seenSec + this.tick;
    const cycle = a.state === 'moving' ? this.refresh : 30;
    return a.seenSec < cycle ? (a.seenSec + this.tick) % cycle : a.seenSec + (this.tick % cycle);
  }

  ago(sec: number): string {
    if (sec < 60) return `${sec} sec ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    const h = Math.floor(sec / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }

  dotColor(a: TrackedAsset): string {
    return stateColor(a);
  }

  stateLabel(a: TrackedAsset): string {
    if (a.state === 'breach') return 'Geofence breach';
    if (a.state === 'stationary' && isLowConfidence(a)) return 'Stationary (low confidence)';
    return a.state[0].toUpperCase() + a.state.slice(1);
  }

  get rows(): TrackedAsset[] {
    const q = this.search.trim().toLowerCase();
    return ASSETS.filter((a) =>
      (!this.typeFilter || a.type === this.typeFilter) &&
      (!this.statusFilter || (this.statusFilter === 'alerts' ? isAlert(a) : a.state === this.statusFilter)) &&
      (!this.zoneFilter || this.zoneName(a) === this.zoneFilter) &&
      (!q || `${a.id} ${a.name} ${a.device} ${a.type}`.toLowerCase().includes(q)));
  }

  get hasFilters(): boolean {
    return !!(this.search || this.typeFilter || this.statusFilter || this.zoneFilter);
  }

  clearFilters(): void {
    this.search = this.typeFilter = this.zoneFilter = '';
    this.statusFilter = '';
  }

  trackId(_: number, a: TrackedAsset): string {
    return a.id;
  }

  // ===== selection =====

  get selected(): TrackedAsset | null {
    return ASSETS.find((a) => a.id === this.selectedId) ?? null;
  }

  select(id: string): void {
    this.selectedId = id;
    this.locateOpen = false;
  }

  onLive(p: LivePosition): void {
    this.flPos = p;
  }

  place(a: TrackedAsset): string {
    const p = this.posOf(a);
    return placeOf(p.lng, p.lat);
  }

  confidence(a: TrackedAsset): string {
    return a.accuracy < 4 ? 'High' : a.accuracy < 8 ? 'Medium' : 'Low';
  }

  speedText(a: TrackedAsset): string {
    return a.state === 'moving' ? `${a.speed} m/s (${(a.speed * 3.6).toFixed(1)} km/h)` : '0 m/s (stationary)';
  }

  clock(ms: number, seconds = false): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}${seconds ? ':' + p(d.getSeconds()) : ''}`;
  }

  fixTime(a: TrackedAsset): string {
    const d = new Date(Date.now() - this.seenSec(a) * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${this.clock(d.getTime(), true)}`;
  }

  /** Device fix vs the asset's own registered fix (for FL-008 both are live; others use their last checkpoint). */
  get comparison(): { dev: { lng: number; lat: number; acc: number; sec: number }; reg: { lng: number; lat: number; acc: number; sec: number }; dist: number } | null {
    const a = this.selected;
    if (!a) return null;
    const dev = { ...this.posOf(a), acc: a.accuracy, sec: this.seenSec(a) };
    const reg = a.id === 'FL-008' && this.flPos
      ? { lng: this.flPos.regLng, lat: this.flPos.regLat, acc: 4.1, sec: this.seenSec(a) + 1 }
      : { lng: a.lng + 0.000012, lat: a.lat - 0.000009, acc: Math.round((a.accuracy + 0.9) * 10) / 10, sec: this.seenSec(a) + 7 };
    return { dev, reg, dist: Math.round(distanceM(dev, reg) * 10) / 10 };
  }

  coord(n: number): string {
    return n.toFixed(6);
  }

  /** Last 30 minutes: FL-008's recorded run; other assets stayed where they are. */
  get trailPoints(): { at: number; place: string; moved: boolean }[] {
    const a = this.selected;
    if (!a) return [];
    if (a.id === 'FL-008') return this.trail.map((p, i) => ({ at: p.at, place: p.place, moved: i > 0 && p.place !== this.trail[i - 1].place }));
    const place = placeOf(a.lng, a.lat);
    return this.trail.map((p) => ({ at: p.at, place, moved: false }));
  }

  // ===== actions =====

  setLayer(key: string, on: boolean): void {
    this.layers = { ...this.layers, [key as keyof MapLayers]: on };
  }

  zoomIn(): void {
    this.mapRef?.zoomIn();
  }

  zoomOut(): void {
    this.mapRef?.zoomOut();
  }

  locate(): void {
    this.mapRef?.locate();
  }

  onSite(s: string): void {
    if (s !== SITE) {
      this.showToast(`${s} has no indoor floor plan yet. Showing ${SITE}.`);
      setTimeout(() => (this.site = SITE));
    }
  }

  onLevel(id: string): void {
    const lv = LEVELS.find((l) => l.id === id);
    if (lv && !lv.mapped) {
      this.showToast(`${lv.name} is not mapped for location tracking yet.`);
      setTimeout(() => (this.level = LEVELS[0].id));
    }
  }

  get locateResults(): TrackedAsset[] {
    const q = this.locateQuery.trim().toLowerCase();
    const list = q ? ASSETS.filter((a) => `${a.id} ${a.name} ${a.device}`.toLowerCase().includes(q)) : ASSETS.filter((a) => a.featured);
    return list.slice(0, 8);
  }

  openLocate(): void {
    this.locateOpen = true;
    this.locateQuery = '';
  }

  configureGeofences(): void {
    this.router.navigate(['/tracking-iot/geofence-alerts']);
  }

  viewAsset(a: TrackedAsset): void {
    this.router.navigate(['/assets/status-condition'], { queryParams: { tag: a.id } });
  }

  trackHistory(a: TrackedAsset): void {
    if (a.id !== 'FL-008') {
      this.showToast(`${a.id} has not moved in the last 30 minutes. Its trail is a single point.`);
      return;
    }
    this.replaying = true;
    this.mapRef?.replayHistory();
    this.showToast('Replaying FL-008: Charging Zone → Main Corridor → Warehouse A / Aisle 04 (4× speed).');
  }

  onReplayDone(): void {
    this.replaying = false;
  }

  openAlert(a: TrackedAsset): void {
    this.formError = '';
    this.alertForm = { assetId: a.id, rule: 'boundary', zone: 'Restricted Zone', minutes: 15, notify: 'Operations team' };
  }

  saveAlert(): void {
    const f = this.alertForm;
    if (!f) return;
    if (f.rule === 'dwell' && !(f.minutes > 0)) return void (this.formError = 'Enter the dwell time in minutes.');
    const a = ASSETS.find((x) => x.id === f.assetId);
    this.events.unshift({
      at: Date.now(), assetId: f.assetId, assetName: a?.name ?? '', event: 'Geofence Alert', zone: f.zone,
      details: `Alert rule created: ${RULE_LABEL[f.rule].toLowerCase()}${f.rule === 'dwell' ? ' ' + f.minutes + ' min' : ''} · notify ${f.notify}`,
    });
    this.alertForm = null;
    this.showToast(`Alert created for ${f.assetId}: ${RULE_LABEL[f.rule].toLowerCase()} ${f.zone}.`);
  }

  // ===== events =====

  get shownEvents(): LocEvent[] {
    return this.eventsAll ? this.events : this.events.slice(0, 3);
  }

  get eventCount(): number {
    return this.events.length;
  }

  eventIcon(e: LocEvent) {
    return e.event === 'Geofence Alert' ? TriangleAlert : e.event === 'Signal Lost' || e.event === 'Stale Location' ? Clock : e.event === 'Entered Zone' ? Play : Route;
  }

  eventClass(e: LocEvent): string {
    return e.event === 'Geofence Alert' || e.event === 'Signal Lost' ? 'ev--red' : e.event === 'Stale Location' ? 'ev--amber' : e.event === 'Entered Zone' ? 'ev--green' : 'ev--blue';
  }

  // ===== misc =====

  @HostListener('document:click')
  closeMenus(): void {
    this.layersOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.layersOpen = false;
    this.locateOpen = false;
    this.alertForm = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
