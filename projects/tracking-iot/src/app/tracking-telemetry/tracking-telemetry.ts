import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  ArrowUp,
  Battery,
  BatteryLow,
  Bell,
  Box,
  Building2,
  Calendar,
  Check,
  Clock,
  Cpu,
  Download,
  Droplets,
  Forklift,
  Heart,
  History,
  Info,
  Link,
  Locate,
  MapPin,
  Minus,
  Plus,
  RadioTower,
  Signal,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Wifi,
  X,
  Zap,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import { MapLayers, MapPlace, MapPosition, TtMap } from './tt-map';
import { IotAlertDto, IotEventsTimelineDto, MAX_READINGS, MdmBuilding, MdmSite, TelemetryReadApi, TelemetryReadingDto, paramKind, timeOf } from './telemetry-api';
import {
  AlertItem, CAMPUS_NAME, KPIS, LiveKey, MarkerIcon, Metric, RANGE_SPEC, Range, Series, Severity, Status,
  TelemetryEvent, TelemetrySource, TrackedAsset, buildAssets, buildEvents, buildingName, seriesFor,
} from './telemetry-data';

type Tab = 'live' | 'location' | 'device' | 'alerts' | 'history';
interface Tick { x: number; label: string }
interface Band {
  metric: Metric;
  label: string;
  unit: string;
  color: string;
  top: number;
  h: number;
  ticks: { y: number; label: string }[];
  path: string;
  dots: { x: number; y: number }[];
  threshold: { y: number; label: string } | null;
  alert: { x: number; y: number; value: string; time: string } | null;
}
interface ConfigForm { assetId: string; metric: Metric; value: number | null; email: boolean; sms: boolean; error: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const METRIC_META: Record<Metric, { label: string; short: string; unit: string; color: string; thrLabel: string }> = {
  temp: { label: 'Temperature (°C)', short: 'Temperature', unit: '°C', color: '#7c3aed', thrLabel: 'High temperature threshold' },
  vib: { label: 'Vibration (mm/s)', short: 'Vibration', unit: 'mm/s', color: '#0891b2', thrLabel: 'High vibration threshold' },
  battery: { label: 'Battery (%)', short: 'Battery', unit: '%', color: '#16a34a', thrLabel: 'Low battery threshold' },
};
const ICONS_BY_MARKER: Record<MarkerIcon, typeof Box> = { forklift: Forklift, pump: Droplets, cold: Snowflake, generator: Zap, sensor: Thermometer };
const CHART_PAD = { l: 50, r: 18, t: 14, gap: 26, axis: 22 };
/** Live data refresh interval. */
const POLL_MS = 20000;
/** Window of alerts shown on the asset tabs and in the events table (open alerts are always included). */
const ALERT_DAYS = 30;
const EMPTY_SOURCE: TelemetrySource = { devices: [], health: [], readings: [], alerts: [], locationEvents: [] };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

@Component({
  selector: 'app-tracking-telemetry',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, TtMap],
  templateUrl: './tracking-telemetry.html',
  styleUrls: ['./tracking-telemetry.css', './tracking-telemetry-panels.css', '../shared/iot-purple-theme.css'],
})
export class TrackingTelemetry implements OnInit, AfterViewInit, OnDestroy {
  readonly icons = { Activity, ArrowUp, Battery, BatteryLow, Bell, Box, Building2, Calendar, Check, Clock, Cpu, Download, Heart, History, Info, Link, Locate, MapPin, Minus, Plus, RadioTower, Signal, Thermometer, TriangleAlert, Wifi, X };
  readonly campus = CAMPUS_NAME;
  readonly ranges = Object.entries(RANGE_SPEC).map(([key, v]) => ({ key: key as Range, label: v.label }));
  readonly metricMeta = METRIC_META;
  readonly metrics: Metric[] = ['temp', 'vib', 'battery'];

  @ViewChild(TtMap) private mapCmp?: TtMap;
  @ViewChild('chartBox') private chartBox?: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private readonly api = inject(TelemetryReadApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Site filter of the page (Master Data site id; '' = all sites). */
  site = '';
  private _range: Range = '24h';
  /** Site and building shown on the map (Master Data ids; '' = all). */
  mapSite = '';
  building = '';
  /** Master Data sites and buildings (loaded once). */
  private mdmSites: MdmSite[] = [];
  private mdmBuildings: MdmBuilding[] = [];
  layers: MapLayers = { assets: true, devices: true, gateways: true, geofences: true };
  satellite = true;
  selectedId = '';
  tab: Tab = 'live';
  show: Record<Metric, boolean> = { temp: true, vib: true, battery: false };
  hoverIdx: number | null = null;
  chartW = 1100;
  config: ConfigForm | null = null;
  toast = '';

  /** True until the first load finishes. */
  loading = true;
  /** Message of the last failed refresh ('' once a refresh succeeds). */
  error = '';

  clock = '';
  now = new Date();
  /** Recent values for the tile sparklines, oldest first. */
  spark: Record<string, Record<LiveKey, number[]>> = {};
  /** Map positions: the Tracking API has no device coordinates yet, so this stays empty. */
  positions: Record<string, [number, number]> = {};
  statuses: Record<string, Status> = {};

  /** Every tracked asset (IoT device) from the API; `assets` applies the site filter. */
  private all: TrackedAsset[] = [];
  private src: TelemetrySource = EMPTY_SOURCE;
  private openAlertRows: IotAlertDto[] = [];
  private timeline: IotEventsTimelineDto | null = null;
  private trendReadings: TelemetryReadingDto[] = [];
  private trendFor = '';
  private trendSub?: Subscription;
  private loadSub?: Subscription;

  private timers: ReturnType<typeof setInterval>[] = [];
  private toastTimer?: ReturnType<typeof setTimeout>;
  private resize?: ResizeObserver;
  private trendCache: { key: string; bands: Band[]; mins: number[]; xTicks: Tick[]; height: number; series: Series[] } | null = null;
  private version = 0;
  private eventsCache: { key: string; rows: TelemetryEvent[] } | null = null;

  constructor() {
    this.tickClock();
    this.timers.push(setInterval(() => this.tickClock(), 1000));
  }

  ngOnInit(): void {
    this.refresh();
    this.loadPlaces();
    this.timers.push(setInterval(() => this.refresh(), POLL_MS));
  }

  /** Master Data sites and buildings for the site / building pickers and the map pins. */
  private loadPlaces(): void {
    forkJoin({ sites: this.api.sites(), buildings: this.api.buildings() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sites, buildings }) => {
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
        this.mdmSites = [...sites].sort(byName);
        this.mdmBuildings = [...buildings].sort(byName);
        // start the map on a real place: the first site with coordinates (or with a located building)
        if (!this.mapSite) {
          const located = this.mdmSites.find((s) => s.lat !== null || this.mdmBuildings.some((b) => this.inSite(b, s) && b.lat !== null));
          this.mapSite = (located ?? this.mdmSites[0])?.id ?? '';
        }
        this.updateMap();
      });
  }

  /** Time range of the trend, events table and telemetry KPI; changing it reloads from the API. */
  get range(): Range {
    return this._range;
  }

  set range(r: Range) {
    if (r === this._range) return;
    this._range = r;
    this.hoverIdx = null;
    this.refresh();
  }

  /** Sites for the pickers: Master Data sites, or the sites named on devices while Master Data has none. */
  get sites(): MdmSite[] {
    if (this.mdmSites.length) return this.mdmSites;
    return [...new Set(this.all.map((a) => a.building).filter(Boolean))].sort().map((name) => ({ id: name, name, lat: null, lng: null }));
  }

  /** Buildings of the map's site (all buildings when no site is chosen). */
  get mapBuildings(): MdmBuilding[] {
    const site = this.sites.find((s) => s.id === this.mapSite);
    return site ? this.mdmBuildings.filter((b) => this.inSite(b, site)) : this.mdmBuildings;
  }

  get assets(): TrackedAsset[] {
    return this.site ? this.all.filter((a) => this.assetInSite(a, this.site)) : this.all;
  }

  /** A device belongs to a site by its site id, or by the site's name (devices registered with a name only). */
  private assetInSite(a: { siteId?: string | null; building?: string | null; siteName?: string | null }, siteId: string): boolean {
    const s = this.sites.find((x) => x.id === siteId);
    const name = (a.building ?? a.siteName ?? '').trim().toLowerCase();
    return (!!a.siteId && a.siteId === siteId) || (!!s && !!name && name === s.name.trim().toLowerCase());
  }

  private inSite(b: MdmBuilding, s: MdmSite): boolean {
    return b.siteId ? b.siteId === s.id : b.siteName.trim().toLowerCase() === s.name.trim().toLowerCase();
  }

  get events(): TelemetryEvent[] {
    const key = `${this.version}|${this.site}|${this.range}|${Math.floor(this.now.getTime() / 60000)}`;
    if (this.eventsCache?.key === key) return this.eventsCache.rows;
    const ids = new Set(this.assets.map((a) => a.id));
    const evs = buildEvents(this.src, this.all, this.now.getTime(), RANGE_SPEC[this.range].mins);
    const rows = this.site ? evs.filter((e) => ids.has(e.assetId)) : evs;
    this.eventsCache = { key, rows };
    return rows;
  }

  /** KPI cards, aggregated from the API data. */
  get kpis(): { key: string; label: string; value: string; note: string; color: string }[] {
    const assets = this.assets;
    const online = assets.filter((a) => a.status !== 'offline').length;
    const open = this.openAlertRows.filter((x) => !this.site || this.assetInSite(x, this.site) || assets.some((a) => a.id === x.deviceId)).length;
    const pts = this.points();
    return KPIS.map((k) => {
      let value: string;
      if (this.loading) value = '—';
      else if (k.key === 'tracked') value = assets.length.toLocaleString();
      else if (k.key === 'online') value = online.toLocaleString();
      else if (k.key === 'alerts') value = open.toLocaleString();
      else value = pts.count.toLocaleString() + (pts.capped ? '+' : '');
      const note = this.loading ? '' : k.key === 'online' && assets.length ? `${Math.round((online / assets.length) * 100)}% of ${assets.length}` : k.key === 'points' ? RANGE_SPEC[this.range].label.toLowerCase() : '';
      return { ...k, value, note };
    });
  }

  /** Telemetry points in the range: the events timeline for 7 days fleet-wide, otherwise the readings returned. */
  private points(): { count: number; capped: boolean } {
    if (this.range === '7d' && !this.site && this.timeline) return { count: this.timeline.totals.telemetryData, capped: false };
    const ids = new Set(this.assets.map((a) => a.id));
    const since = this.now.getTime() - RANGE_SPEC[this.range].mins * 60000;
    const rows = this.src.readings.filter((r) => timeOf(r.recordedAt) >= since && (!this.site || ids.has(r.deviceId)));
    // the endpoint returns at most MAX_READINGS rows, newest first
    const capped = this.src.readings.length >= MAX_READINGS && timeOf(this.src.readings[this.src.readings.length - 1].recordedAt) >= since;
    return { count: rows.length, capped };
  }

  ngAfterViewInit(): void {
    const el = this.chartBox?.nativeElement;
    if (!el) return;
    this.resize = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      if (w > 0 && Math.abs(w - this.chartW) > 2) this.zone.run(() => (this.chartW = w));
    });
    this.resize.observe(el);
  }

  ngOnDestroy(): void {
    this.timers.forEach((t) => clearInterval(t));
    clearTimeout(this.toastTimer);
    this.resize?.disconnect();
    this.loadSub?.unsubscribe();
    this.trendSub?.unsubscribe();
  }

  // ===== data =====

  /** Loads devices, health, readings, alerts and location events, then rebuilds the page model. */
  refresh(): void {
    const spec = RANGE_SPEC[this.range];
    this.loadSub?.unsubscribe();
    this.loadSub = forkJoin({
      devices: this.api.devices(),
      health: this.api.deviceHealth(),
      readings: this.api.readings({ days: spec.days, limit: MAX_READINGS }),
      alerts: this.api.alerts({ days: ALERT_DAYS }),
      open: this.api.alerts({ status: 'Open' }),
      locationEvents: this.api.locationEvents(),
      timeline: this.range === '7d' ? this.api.timeline(7) : (of(null) as Observable<IotEventsTimelineDto | null>),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          const alerts = [...r.alerts, ...r.open.filter((o) => !r.alerts.some((x) => x.alertId === o.alertId))];
          this.src = { devices: r.devices, health: r.health, readings: r.readings, alerts, locationEvents: r.locationEvents };
          this.openAlertRows = r.open;
          this.timeline = r.timeline;
          this.rebuild();
          this.loading = false;
          this.error = '';
          this.loadTrend();
        },
        error: (err) => {
          this.loading = false;
          const msg = apiErrorMessage(err, 'Could not load tracking data.');
          // toast once per distinct failure; the banner stays while the problem lasts
          if (msg !== this.error) this.showToast(msg);
          this.error = msg;
        },
      });
  }

  private rebuild(): void {
    const now = Date.now();
    this.all = buildAssets(this.src, now, this.all);
    this.statuses = Object.fromEntries(this.all.map((a) => [a.id, a.status]));
    const spark: Record<string, Record<LiveKey, number[]>> = {};
    for (const a of this.all) spark[a.id] = { temp: [], vib: [], battery: [], rssi: [] };
    // readings are newest first; keep the latest 24 per metric, oldest first
    for (const r of this.src.readings) {
      const k = paramKind(r.parameter);
      const s = spark[r.deviceId];
      if (!s || !k || k === 'energy' || s[k].length >= 24) continue;
      s[k].unshift(Number(r.value));
    }
    this.spark = spark;
    this.version++;
  }

  /** Readings of the selected device for the trend chart (refetched on selection, range change and each poll). */
  private loadTrend(): void {
    const a = this.selected;
    if (!a) {
      this.trendReadings = [];
      this.trendFor = '';
      return;
    }
    const key = `${a.id}|${this.range}`;
    this.trendSub?.unsubscribe();
    this.trendSub = this.api
      .readings({ deviceId: a.id, days: RANGE_SPEC[this.range].days, limit: MAX_READINGS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.trendReadings = rows;
          this.trendFor = key;
          this.version++;
        },
        error: (err) => this.showToast(apiErrorMessage(err, 'Could not load telemetry for this asset.')),
      });
  }

  private readingsFor(a: TrackedAsset): TelemetryReadingDto[] {
    return this.trendFor === `${a.id}|${this.range}` ? this.trendReadings : this.src.readings.filter((r) => r.deviceId === a.id);
  }

  // ===== live =====

  private tickClock(): void {
    this.now = new Date();
    // local time, like every other timestamp on the page, with the real UTC offset
    const n = this.now;
    const off = -n.getTimezoneOffset();
    const zone = `UTC${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + pad(Math.abs(off) % 60) : ''}`;
    this.clock = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())} (${zone})`;
  }

  onMoved(p: MapPosition): void {
    this.positions[p.id] = [p.lng, p.lat];
  }

  // ===== selection =====

  get selected(): TrackedAsset | null {
    const list = this.assets;
    return list.find((a) => a.id === this.selectedId) ?? list[0] ?? null;
  }

  selectAsset(id: string, tab?: Tab): void {
    if (!id) return;
    this.selectedId = id;
    if (tab) this.tab = tab;
    else if (this.tab === 'alerts' && this.selected && !this.openAlerts(this.selected).length) this.tab = 'live';
    this.hoverIdx = null;
    this.loadTrend();
  }

  markerIcon(a: TrackedAsset) {
    return ICONS_BY_MARKER[a.icon];
  }

  statusLabel(s: Status): string {
    return s === 'online' ? 'Online' : s === 'warning' ? 'Warning' : 'Offline';
  }

  agoLabel(id: string): string {
    const a = this.all.find((x) => x.id === id);
    if (!a || !Number.isFinite(a.lastSeen)) return 'Never';
    const s = Math.max(0, Math.floor((this.now.getTime() - a.lastSeen) / 1000));
    if (s < 60) return `${s} sec ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 172800) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} days ago`;
  }

  /** Offline note: how long the device has been silent. */
  silentFor(a: TrackedAsset): string {
    return Number.isFinite(a.lastSeen) ? ` for ${this.agoLabel(a.id).replace(' ago', '')}` : ' yet';
  }

  openAlerts(a: TrackedAsset): AlertItem[] {
    return a.alerts.filter((x) => !x.acknowledged);
  }

  isLowBattery(a: TrackedAsset): boolean {
    const thr = a.thresholds.battery;
    return a.live.battery !== null && thr !== null && a.live.battery < thr;
  }

  // ===== map controls =====

  zoomIn(): void {
    this.mapCmp?.zoomIn();
  }

  zoomOut(): void {
    this.mapCmp?.zoomOut();
  }

  locate(): void {
    this.mapCmp?.locate();
  }

  /** Page site filter changed: the map follows it. */
  onSite(): void {
    if (this.site) this.mapSite = this.site;
    this.building = '';
    this.updateMap();
  }

  /** Map site changed: its buildings fill the building picker and the map flies to the site. */
  onMapSite(): void {
    this.building = '';
    this.updateMap();
  }

  onBuilding(): void {
    this.updateMap();
  }

  /**
   * Pins for the map's site and its buildings (every site when none is chosen), then flies to the chosen building,
   * else the site. A place without coordinates is skipped; the map then fits whatever is located.
   */
  private updateMap(): void {
    const located = <T extends { lat: number | null; lng: number | null }>(p: T): p is T & { lat: number; lng: number } => p.lat !== null && p.lng !== null;
    const site = this.sites.find((s) => s.id === this.mapSite);
    const sitePins: MapPlace[] = (site ? [site] : this.sites).filter(located).map((s) => ({ id: s.id, name: s.name, kind: 'site', lat: s.lat, lng: s.lng }));
    const buildingPins: MapPlace[] = (site ? this.mapBuildings : []).filter(located).map((b) => ({ id: b.id, name: b.name, kind: 'building', lat: b.lat, lng: b.lng }));
    const places = [...sitePins, ...buildingPins];
    const focus = places.find((p) => p.id === this.building) ?? places.find((p) => p.id === this.mapSite) ?? (site ? buildingPins[0] : undefined);
    this.mapCmp?.showPlaces(places, focus?.id ?? '');
  }

  toggleLayer(k: keyof MapLayers): void {
    this.layers = { ...this.layers, [k]: !this.layers[k] };
  }

  centerSelected(): void {
    this.mapCmp?.locate();
  }

  // ===== live tiles =====

  tileValue(a: TrackedAsset, k: LiveKey): string {
    const v = a.live[k];
    if (v === null) return '—';
    return k === 'temp' ? v.toFixed(1) : k === 'vib' ? v.toFixed(1) : String(Math.round(v));
  }

  sparkPath(values: number[] | undefined, w = 120, h = 30): string {
    if (!values || values.length < 2) return '';
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join('');
  }

  // ===== location tab =====

  get position(): [number, number] | null {
    return this.positions[this.selected?.id ?? ''] ?? null;
  }

  /** Zone the selected asset is in, from its latest location event. */
  get geofencesHere(): string[] {
    const z = this.selected?.zone;
    return z ? [z.name] : [];
  }

  get enteredAt(): string {
    const z = this.selected?.zone;
    return z && Number.isFinite(z.at) ? this.stamp(z.at, true) : '';
  }

  buildingName(id: string): string {
    return buildingName(id);
  }

  fmtCoord(v: number): string {
    return v.toFixed(6);
  }

  // ===== history tab =====

  stamp(ms: number, seconds = false): string {
    return Number.isFinite(ms) ? this.fmtStamp(new Date(ms), seconds) : '—';
  }

  // ===== trend chart =====

  get trend() {
    const a = this.selected;
    if (!a) return null;
    const key = [a.id, this.range, this.chartW, this.show.temp, this.show.vib, this.show.battery, a.thresholds.temp, a.thresholds.vib, a.thresholds.battery, this.version, Math.floor(this.now.getTime() / 60000)].join('|');
    if (this.trendCache?.key === key) return this.trendCache;
    const on = this.metrics.filter((m) => this.show[m]);
    const readings = this.readingsFor(a);
    const series = on.map((m) => seriesFor(readings, m, this.range, this.now));
    // nothing reported for this range yet
    if (!series.some((s) => s.values.some((v) => v !== null))) return null;
    const spec = RANGE_SPEC[this.range];
    const w = this.chartW;
    const plotW = Math.max(200, w - CHART_PAD.l - CHART_PAD.r);
    const x = (mins: number) => CHART_PAD.l + (1 - mins / spec.mins) * plotW;
    const bandH = on.length <= 1 ? 160 : on.length === 2 ? 118 : 96;
    const bands: Band[] = series.map((s, bi) => {
      const meta = METRIC_META[s.metric];
      const top = CHART_PAD.t + bi * (bandH + CHART_PAD.gap);
      const vals = s.values.filter((v): v is number => v !== null);
      const thr = a.thresholds[s.metric];
      let max: number;
      if (s.metric === 'battery') max = 100;
      else {
        // four equal, round steps: 0 / 10 / 20 / 30 / 40, 0 / 0.5 / 1 / 1.5 / 2, ...
        const raw = Math.max(...vals, (thr ?? 0) * 1.1, s.metric === 'temp' ? 10 : 1);
        const step = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 250, 500, 1000].find((v) => v * 4 >= raw) ?? Math.ceil(raw / 4);
        max = step * 4;
      }
      const y = (v: number) => top + bandH - (Math.max(0, Math.min(v, max)) / max) * bandH;
      const ticks = [0, 1, 2, 3, 4].map((i) => ({ y: y((max * i) / 4), label: String(Math.round(((max * i) / 4) * 10) / 10) }));
      let path = '';
      let pen = false;
      const dots: { x: number; y: number }[] = [];
      s.values.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        path += `${pen ? 'L' : 'M'}${x(s.mins[i]).toFixed(1)},${y(v).toFixed(1)}`;
        // isolated points would not show as a line
        if (!pen && (s.values[i + 1] ?? null) === null) path += `l0.01,0`;
        pen = true;
      });
      let alert: Band['alert'] = null;
      if (thr !== null) {
        const breach = (v: number | null) => v !== null && (s.metric === 'battery' ? v < thr : v > thr);
        const breachIdx = s.values.findIndex(breach);
        if (breachIdx >= 0) {
          const peak = s.values.reduce<number>((best, v, i) => (breach(v) && (s.metric === 'battery' ? v! < s.values[best]! : v! > s.values[best]!) ? i : best), breachIdx);
          const v = s.values[peak] as number;
          alert = { x: x(s.mins[peak]), y: y(v), value: `${v} ${meta.unit}`, time: this.clockAt(s.mins[peak]) };
        }
      }
      return {
        metric: s.metric, label: meta.label, unit: meta.unit, color: meta.color, top, h: bandH, ticks, path, dots,
        threshold: thr !== null && thr <= max ? { y: y(thr), label: `${meta.thrLabel} (${thr} ${meta.unit})` } : null,
        alert,
      };
    });
    const xTicks: Tick[] = [];
    const tickEvery = this.range === '1h' ? 10 : this.range === '24h' ? 120 : 1440;
    const start = new Date(this.now.getTime() - spec.mins * 60000);
    const first = new Date(start);
    if (this.range === '7d') first.setHours(0, 0, 0, 0);
    else first.setMinutes(Math.ceil(first.getMinutes() / (this.range === '1h' ? 10 : 60)) * (this.range === '1h' ? 10 : 60), 0, 0);
    for (let t = first.getTime(); t <= this.now.getTime(); t += tickEvery * 60000) {
      if (t < start.getTime()) continue;
      const d = new Date(t);
      if (this.range === '24h' && d.getHours() % 2) continue;
      const mins = (this.now.getTime() - t) / 60000;
      xTicks.push({ x: x(mins), label: this.range === '7d' ? `${DAYS[d.getDay()]} ${d.getDate()}` : `${pad(d.getHours())}:${pad(d.getMinutes())}` });
    }
    const height = bands.length ? bands[bands.length - 1].top + bandH + CHART_PAD.axis : 60;
    this.trendCache = { key, bands, mins: series[0]?.mins ?? [], xTicks, height, series };
    return this.trendCache;
  }

  get chartLeft(): number {
    return CHART_PAD.l;
  }

  clockAt(minsAgo: number): string {
    const d = new Date(this.now.getTime() - minsAgo * 60000);
    return this.range === '7d' ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  onChartMove(ev: MouseEvent): void {
    const tr = this.trend;
    if (!tr?.mins.length) return;
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const px = ev.clientX - box.left;
    const spec = RANGE_SPEC[this.range];
    const plotW = Math.max(200, this.chartW - CHART_PAD.l - CHART_PAD.r);
    const mins = (1 - (px - CHART_PAD.l) / plotW) * spec.mins;
    let best = 0;
    tr.mins.forEach((m, i) => {
      if (Math.abs(m - mins) < Math.abs(tr.mins[best] - mins)) best = i;
    });
    this.hoverIdx = px < CHART_PAD.l - 4 ? null : best;
  }

  hoverX(): number {
    const tr = this.trend;
    if (this.hoverIdx === null || !tr) return 0;
    const spec = RANGE_SPEC[this.range];
    const plotW = Math.max(200, this.chartW - CHART_PAD.l - CHART_PAD.r);
    return CHART_PAD.l + (1 - tr.mins[this.hoverIdx] / spec.mins) * plotW;
  }

  hoverRows(): { label: string; color: string; value: string }[] {
    const i = this.hoverIdx;
    if (i === null) return [];
    return (this.trend?.series ?? []).map((s) => {
      const v = s.values[i];
      return { label: METRIC_META[s.metric].short, color: METRIC_META[s.metric].color, value: v === null || v === undefined ? 'No data' : `${v} ${METRIC_META[s.metric].unit}` };
    });
  }

  hoverTime(): string {
    const tr = this.trend;
    return this.hoverIdx === null || !tr ? '' : this.clockAt(tr.mins[this.hoverIdx]);
  }

  toggleMetric(m: Metric): void {
    const next = { ...this.show, [m]: !this.show[m] };
    if (!next.temp && !next.vib && !next.battery) return;
    this.show = next;
    this.hoverIdx = null;
  }

  // ===== events table =====

  eventTime(e: TelemetryEvent): string {
    return this.stamp(e.at, true);
  }

  fmtStamp(d: Date, seconds: boolean): string {
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? ':' + pad(d.getSeconds()) : ''}`;
  }

  assetOf(e: TelemetryEvent): TrackedAsset | undefined {
    return this.all.find((a) => a.id === e.assetId);
  }

  eventMarker(e: TelemetryEvent): MarkerIcon {
    return this.assetOf(e)?.icon ?? 'sensor';
  }

  eventMarkerIcon(e: TelemetryEvent) {
    return ICONS_BY_MARKER[this.eventMarker(e)];
  }

  sevClass(s: Severity): string {
    return 'sev--' + s.toLowerCase();
  }

  eventIcon(e: TelemetryEvent) {
    return e.icon === 'pin' ? MapPin : e.icon === 'warn' ? TriangleAlert : e.icon === 'temp' ? Thermometer : BatteryLow;
  }

  viewAsset(id: string): void {
    if (!id) return;
    this.selectAsset(id, 'live');
    this.mapCmp?.locate();
    document.querySelector('.tt-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  viewHistory(id: string): void {
    if (!id) return;
    this.selectAsset(id, 'history');
    document.querySelector('.tt-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== alert thresholds (kept on this page only: the Tracking API stores no per-asset thresholds) =====

  openConfig(e: TelemetryEvent | null, a: TrackedAsset | null = this.selected): void {
    const asset = e ? this.assetOf(e) : a;
    if (!asset) return;
    const metric: Metric = e?.icon === 'battery' ? 'battery' : e?.icon === 'warn' ? 'vib' : 'temp';
    this.config = { assetId: asset.id, metric, value: asset.thresholds[metric], email: true, sms: metric !== 'temp', error: '' };
  }

  configAsset(): TrackedAsset | undefined {
    return this.all.find((a) => a.id === this.config?.assetId);
  }

  onConfigMetric(): void {
    const c = this.config;
    const a = this.configAsset();
    if (c && a) c.value = a.thresholds[c.metric];
  }

  saveConfig(): void {
    const c = this.config;
    const a = this.configAsset();
    if (!c || !a) return;
    const v = Number(c.value);
    if (c.value === null || !Number.isFinite(v) || v <= 0) return void (c.error = 'Enter a threshold above 0.');
    if (c.metric === 'battery' && v > 100) return void (c.error = 'Battery threshold must be 100% or less.');
    const meta = METRIC_META[c.metric];
    a.thresholds = { ...a.thresholds, [c.metric]: v };
    this.config = null;
    this.showToast(`${meta.short} threshold for ${a.name} set to ${v} ${meta.unit} on this page.`);
  }

  // ===== export =====

  exportData(): void {
    const book = XLSX.utils.book_new();
    const list = this.assets;
    const assets = list.map((a) => ({
      Asset: a.name, 'Device ID': a.id, 'Asset Code': a.assetCode, Type: a.type, Status: this.statusLabel(a.status), Health: a.health, Site: a.building,
      'Device Type': a.device.type, 'Temperature (°C)': a.live.temp ?? '', 'Vibration (mm/s)': a.live.vib ?? '', 'Battery (%)': a.live.battery ?? '', 'RSSI (dBm)': a.live.rssi ?? '',
      'Last Seen': this.stamp(a.lastSeen, true),
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(assets), 'Assets');
    const events = this.events;
    const ev = events.map((e) => ({ Timestamp: this.eventTime(e), Asset: e.assetName, Device: e.deviceId, Event: e.event, 'Reading / Location': e.reading, Severity: e.severity }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(ev), 'Events');
    const a = this.selected;
    if (a) {
      const readings = this.readingsFor(a);
      const series = this.metrics.map((m) => seriesFor(readings, m, this.range, this.now));
      const rows = series[0].mins
        .map((m, i) => ({
          Time: this.fmtStamp(new Date(this.now.getTime() - m * 60000), false),
          'Temperature (°C)': series[0].values[i] ?? '', 'Vibration (mm/s)': series[1].values[i] ?? '', 'Battery (%)': series[2].values[i] ?? '',
        }))
        .filter((r) => r['Temperature (°C)'] !== '' || r['Vibration (mm/s)'] !== '' || r['Battery (%)'] !== '');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), `${a.id} ${this.range}`.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    }
    XLSX.writeFile(book, `Tracking_Telemetry_${this.range}.xlsx`);
    this.showToast(`Exported ${list.length} assets, ${events.length} events${a ? ` and ${a.id} telemetry` : ''} (${RANGE_SPEC[this.range].label.toLowerCase()}).`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.config = null;
  }

  private showToast(m: string): void {
    this.toast = m;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3800);
  }
}
