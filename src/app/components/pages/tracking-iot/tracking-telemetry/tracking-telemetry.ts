import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import type * as Leaflet from 'leaflet';
import { MapDrawTools } from '../../../shared/map-draw-tools/map-draw-tools';
import { MapLayers, MapPosition, TtMap } from './tt-map';
import {
  ASSETS, AlertItem, BUILDINGS, CAMPUS_GEO, CAMPUS_NAME, EVENTS, KPIS, MarkerIcon, Metric, RANGE_SPEC, Range, SITE_OPTIONS, Series, Severity, Status,
  TelemetryEvent, TrackedAsset, buildingName, kpiSpark, seriesFor, sparkSeed, spikeMinsAgo,
} from './telemetry-data';

type Tab = 'live' | 'location' | 'device' | 'alerts' | 'history';
type LiveKey = 'temp' | 'vib' | 'battery' | 'rssi';
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
interface ConfigForm { assetId: string; metric: Metric; value: number; email: boolean; sms: boolean; error: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const METRIC_META: Record<Metric, { label: string; short: string; unit: string; color: string; thrLabel: string }> = {
  temp: { label: 'Temperature (°C)', short: 'Temperature', unit: '°C', color: '#7c3aed', thrLabel: 'High temperature threshold' },
  vib: { label: 'Vibration (mm/s)', short: 'Vibration', unit: 'mm/s', color: '#0891b2', thrLabel: 'High vibration threshold' },
  battery: { label: 'Battery (%)', short: 'Battery', unit: '%', color: '#16a34a', thrLabel: 'Low battery threshold' },
};
const ICONS_BY_MARKER: Record<MarkerIcon, typeof Box> = { forklift: Forklift, pump: Droplets, cold: Snowflake, generator: Zap, sensor: Thermometer };
const CHART_PAD = { l: 50, r: 18, t: 14, gap: 26, axis: 22 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ray-casting point-in-polygon on [lng, lat] rings. */
function inside(lng: number, lat: number, ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function metres(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

@Component({
  selector: 'app-tracking-telemetry',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, TtMap, MapDrawTools],
  templateUrl: './tracking-telemetry.html',
  styleUrls: ['./tracking-telemetry.css', './tracking-telemetry-panels.css'],
})
export class TrackingTelemetry implements AfterViewInit, OnDestroy {
  readonly icons = { Activity, ArrowUp, Battery, BatteryLow, Bell, Box, Building2, Calendar, Check, Clock, Cpu, Download, Heart, History, Info, Link, Locate, MapPin, Minus, Plus, RadioTower, Signal, Thermometer, TriangleAlert, Wifi, X };
  readonly assets = ASSETS;
  readonly buildings = BUILDINGS;
  readonly sites = SITE_OPTIONS;
  readonly campus = CAMPUS_NAME;
  readonly kpis = KPIS;
  readonly ranges = Object.entries(RANGE_SPEC).map(([key, v]) => ({ key: key as Range, label: v.label }));
  readonly metricMeta = METRIC_META;
  readonly metrics: Metric[] = ['temp', 'vib', 'battery'];

  @ViewChild(TtMap) private mapCmp?: TtMap;
  @ViewChild('chartBox') private chartBox?: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);

  site = '';
  range: Range = '24h';
  mapSite = CAMPUS_NAME;
  building = '';
  layers: MapLayers = { assets: true, devices: true, gateways: true, geofences: true };
  satellite = true;
  drawMap: Leaflet.Map | null = null;
  selectedId = 'FL-008';
  tab: Tab = 'live';
  show: Record<Metric, boolean> = { temp: true, vib: true, battery: false };
  hoverIdx: number | null = null;
  chartW = 1100;
  config: ConfigForm | null = null;
  toast = '';

  clock = '';
  /** Page time origin for the events table and "x sec ago" labels. */
  readonly t0 = new Date();
  now = new Date();
  /** Seconds since each asset last reported (reset on every live tick). */
  ago: Record<string, number> = {};
  /** Recent live values for the tile sparklines. */
  spark: Record<string, Record<LiveKey, number[]>> = {};
  positions: Record<string, [number, number]> = {};

  readonly statuses: Record<string, Status> = Object.fromEntries(ASSETS.map((a) => [a.id, a.status]));
  readonly kpiSparks = Object.fromEntries(KPIS.map((k) => [k.key, kpiSpark(k.key, k.up)]));

  private timers: ReturnType<typeof setInterval>[] = [];
  private toastTimer?: ReturnType<typeof setTimeout>;
  private resize?: ResizeObserver;
  private trendCache: { key: string; bands: Band[]; mins: number[]; xTicks: Tick[]; height: number; series: Series[] } | null = null;
  private version = 0;

  constructor() {
    // the forklift's temperature alert sits on the chart at the most recent 02:14; keep the alert and history in step
    const spike = spikeMinsAgo(new Date());
    const fl = ASSETS.find((a) => a.id === 'FL-008');
    if (fl) {
      fl.alerts.forEach((x) => (x.minsAgo = spike));
      fl.history.forEach((h) => h.text.startsWith('High temperature') && (h.minsAgo = spike));
    }
    for (const a of ASSETS) {
      this.ago[a.id] = a.silentMins ? a.silentMins * 60 : a.id === 'FL-008' ? 10 : 5 + (a.id.length * 7) % 40;
      this.spark[a.id] = {
        temp: a.live.temp === null ? [] : sparkSeed(a.id, 'temp', a.live.temp),
        vib: a.live.vib === null ? [] : sparkSeed(a.id, 'vib', a.live.vib),
        battery: a.live.battery === null ? [] : sparkSeed(a.id, 'battery', a.live.battery),
        rssi: a.live.rssi === null ? [] : sparkSeed(a.id, 'rssi', a.live.rssi),
      };
      const f = CAMPUS_GEO.features.find((x) => x.properties.id === a.id);
      if (f) this.positions[a.id] = f.geometry.coordinates as [number, number];
    }
    this.tickClock();
    this.timers.push(setInterval(() => this.tickClock(), 1000));
    this.timers.push(setInterval(() => this.liveTick(), 3000));
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
  }

  // ===== live =====

  private tickClock(): void {
    this.now = new Date();
    // local time, like every other timestamp on the page, with the real UTC offset
    const n = this.now;
    const off = -n.getTimezoneOffset();
    const zone = `UTC${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + pad(Math.abs(off) % 60) : ''}`;
    this.clock = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())} (${zone})`;
    for (const a of ASSETS) this.ago[a.id] = (this.ago[a.id] ?? 0) + 1;
  }

  /** New readings every few seconds for every reporting device (random walk around the current value). */
  private liveTick(): void {
    const step = (v: number, amp: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * amp)) * 10) / 10;
    for (const a of ASSETS) {
      if (a.status === 'offline') continue;
      // not every device reports on every tick
      if (Math.random() < 0.35 && a.id !== this.selectedId) continue;
      const l = a.live;
      if (l.temp !== null) l.temp = step(l.temp, Math.max(0.3, Math.abs(l.temp) * 0.015), -30, 120);
      if (l.vib !== null) l.vib = step(l.vib, Math.max(0.05, l.vib * 0.08), 0, 30);
      if (l.battery !== null && Math.random() < 0.06) l.battery = Math.max(0, l.battery - 1);
      if (l.rssi !== null) l.rssi = Math.round(step(l.rssi, 3, -110, -40));
      const s = this.spark[a.id];
      for (const k of ['temp', 'vib', 'battery', 'rssi'] as LiveKey[]) {
        const v = l[k];
        if (v === null) continue;
        s[k] = [...s[k].slice(-23), v];
      }
      this.ago[a.id] = 0;
    }
    this.version++;
  }

  onMoved(p: MapPosition): void {
    this.positions[p.id] = [p.lng, p.lat];
  }

  // ===== selection =====

  get selected(): TrackedAsset {
    return ASSETS.find((a) => a.id === this.selectedId) ?? ASSETS[0];
  }

  selectAsset(id: string, tab?: Tab): void {
    if (!id) return;
    this.selectedId = id;
    if (tab) this.tab = tab;
    else if (this.tab === 'alerts' && !this.openAlerts(this.selected).length) this.tab = 'live';
    this.hoverIdx = null;
  }

  markerIcon(a: TrackedAsset) {
    return ICONS_BY_MARKER[a.icon];
  }

  statusLabel(s: Status): string {
    return s === 'online' ? 'Online' : s === 'warning' ? 'Warning' : 'Offline';
  }

  agoLabel(id: string): string {
    const s = this.ago[id] ?? 0;
    if (s < 60) return `${s} sec ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)} h ago`;
  }

  openAlerts(a: TrackedAsset): AlertItem[] {
    return a.alerts.filter((x) => !x.acknowledged);
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

  onBuilding(): void {
    this.mapCmp?.showBuilding(this.building);
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
    return k === 'temp' ? v.toFixed(1) : k === 'vib' ? v.toFixed(1) : String(v);
  }

  sparkPath(values: number[], w = 120, h = 30): string {
    if (values.length < 2) return '';
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join('');
  }

  // ===== location tab =====

  get position(): [number, number] | null {
    return this.positions[this.selectedId] ?? null;
  }

  get geofencesHere(): string[] {
    const p = this.position;
    if (!p) return [];
    return CAMPUS_GEO.features
      .filter((f) => f.properties.kind === 'geofence' && inside(p[0], p[1], (f.geometry.coordinates as [number, number][][])[0]))
      .map((f) => String(f.properties.name));
  }

  get nearestGateway(): { id: string; m: number } | null {
    const p = this.position;
    if (!p) return null;
    let best: { id: string; m: number } | null = null;
    for (const f of CAMPUS_GEO.features.filter((x) => x.properties.kind === 'gateway')) {
      const m = Math.round(metres(p, f.geometry.coordinates as [number, number]));
      if (!best || m < best.m) best = { id: f.properties.id, m };
    }
    return best;
  }

  get enteredAt(): string {
    const e = EVENTS.find((x) => x.assetId === this.selectedId && x.event === 'Entered geofence');
    return e ? this.eventTime(e) : '';
  }

  buildingName(id: string): string {
    return buildingName(id);
  }

  fmtCoord(v: number): string {
    return v.toFixed(6);
  }

  /** History entries are stored as minutes before page load; new ones are negative (after load). */
  private nowMins(): number {
    return -(Date.now() - this.t0.getTime()) / 60000;
  }

  // ===== history tab =====

  historyTime(minsAgo: number): string {
    return this.fmtStamp(new Date(this.t0.getTime() - minsAgo * 60000), false);
  }

  // ===== trend chart =====

  get trend() {
    const a = this.selected;
    const key = [a.id, this.range, this.chartW, this.show.temp, this.show.vib, this.show.battery, a.thresholds.temp, a.thresholds.vib, a.thresholds.battery, Math.floor(this.version / 10)].join('|');
    if (this.trendCache?.key === key) return this.trendCache;
    const on = this.metrics.filter((m) => this.show[m]);
    const series = on.map((m) => seriesFor(a, m, this.range, this.now));
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
        const raw = Math.max(...vals, thr * 1.1, s.metric === 'temp' ? 10 : 1);
        const step = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].find((x) => x * 4 >= raw) ?? 50;
        max = step * 4;
      }
      const y = (v: number) => top + bandH - (v / max) * bandH;
      const ticks = [0, 1, 2, 3, 4].map((i) => ({ y: y((max * i) / 4), label: String(Math.round((max * i) / 4 * 10) / 10) }));
      let path = '';
      let pen = false;
      const dots: { x: number; y: number }[] = [];
      s.values.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        path += `${pen ? 'L' : 'M'}${x(s.mins[i]).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      const breachIdx = s.values.findIndex((v) => v !== null && (s.metric === 'battery' ? v < thr : v > thr));
      let alert: Band['alert'] = null;
      if (breachIdx >= 0 && breachIdx < s.values.length - 1) {
        const peak = s.values.reduce<number>((bi2, v, i) => (v !== null && (s.metric === 'battery' ? v < (s.values[bi2] ?? 999) : v > (s.values[bi2] ?? -999)) ? i : bi2), breachIdx);
        const v = s.values[peak] as number;
        alert = { x: x(s.mins[peak]), y: y(v), value: `${v} ${meta.unit}`, time: this.clockAt(s.mins[peak]) };
      }
      return {
        metric: s.metric, label: meta.label, unit: meta.unit, color: meta.color, top, h: bandH, ticks, path, dots,
        threshold: thr <= max ? { y: y(thr), label: `${meta.thrLabel} (${thr} ${meta.unit})` } : null,
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
    if (!tr.mins.length) return;
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
    if (this.hoverIdx === null) return 0;
    const spec = RANGE_SPEC[this.range];
    const plotW = Math.max(200, this.chartW - CHART_PAD.l - CHART_PAD.r);
    return CHART_PAD.l + (1 - tr.mins[this.hoverIdx] / spec.mins) * plotW;
  }

  hoverRows(): { label: string; color: string; value: string }[] {
    const i = this.hoverIdx;
    if (i === null) return [];
    return this.trend.series.map((s) => {
      const v = s.values[i];
      return { label: METRIC_META[s.metric].short, color: METRIC_META[s.metric].color, value: v === null ? 'No data' : `${v} ${METRIC_META[s.metric].unit}` };
    });
  }

  hoverTime(): string {
    return this.hoverIdx === null ? '' : this.clockAt(this.trend.mins[this.hoverIdx]);
  }

  toggleMetric(m: Metric): void {
    const next = { ...this.show, [m]: !this.show[m] };
    if (!next.temp && !next.vib && !next.battery) return;
    this.show = next;
    this.hoverIdx = null;
  }

  // ===== events table =====

  readonly events = EVENTS;

  eventTime(e: TelemetryEvent): string {
    return this.fmtStamp(new Date(this.t0.getTime() - e.secsAgo * 1000), true);
  }

  fmtStamp(d: Date, seconds: boolean): string {
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? ':' + pad(d.getSeconds()) : ''}`;
  }

  assetOf(e: TelemetryEvent): TrackedAsset {
    return ASSETS.find((a) => a.id === e.assetId)!;
  }

  sevClass(s: Severity): string {
    return 'sev--' + s.toLowerCase();
  }

  eventIcon(e: TelemetryEvent) {
    return e.icon === 'pin' ? MapPin : e.icon === 'warn' ? TriangleAlert : e.icon === 'temp' ? Thermometer : BatteryLow;
  }

  viewAsset(id: string): void {
    this.selectAsset(id, 'live');
    this.mapCmp?.locate();
    document.querySelector('.tt-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  viewHistory(id: string): void {
    this.selectAsset(id, 'history');
    document.querySelector('.tt-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===== alerts =====

  acknowledge(a: TrackedAsset, al: AlertItem): void {
    al.acknowledged = true;
    a.history.unshift({ minsAgo: this.nowMins(), text: `Alert acknowledged: ${al.title}`, by: 'Jordan Davis' });
    this.showToast(`${al.title} on ${a.name} acknowledged.`);
  }

  openConfig(e: TelemetryEvent | null, a: TrackedAsset = this.selected): void {
    const asset = e ? this.assetOf(e) : a;
    const metric: Metric = e?.icon === 'battery' ? 'battery' : e?.icon === 'warn' ? 'vib' : 'temp';
    this.config = { assetId: asset.id, metric, value: asset.thresholds[metric], email: true, sms: metric !== 'temp', error: '' };
  }

  configAsset(): TrackedAsset | undefined {
    return ASSETS.find((a) => a.id === this.config?.assetId);
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
    if (!Number.isFinite(v) || v <= 0) return void (c.error = 'Enter a threshold above 0.');
    if (c.metric === 'battery' && v > 100) return void (c.error = 'Battery threshold must be 100% or less.');
    const meta = METRIC_META[c.metric];
    a.thresholds[c.metric] = v;
    a.history.unshift({ minsAgo: this.nowMins(), text: `${meta.thrLabel} set to ${v} ${meta.unit}${c.email || c.sms ? ' (notify ' + [c.email ? 'email' : '', c.sms ? 'SMS' : ''].filter(Boolean).join(' + ') + ')' : ''}`, by: 'Jordan Davis' });
    this.config = null;
    this.showToast(`${meta.short} alert for ${a.name} now triggers at ${v} ${meta.unit}.`);
  }

  // ===== export =====

  exportData(): void {
    const book = XLSX.utils.book_new();
    const assets = ASSETS.map((a) => ({
      Asset: a.name, 'Asset ID': a.id, Type: a.type, Status: this.statusLabel(a.status), Health: a.health, Building: buildingName(a.building),
      Device: a.device.id, 'Device Type': a.device.type, 'Temperature (°C)': a.live.temp ?? '', 'Vibration (mm/s)': a.live.vib ?? '', 'Battery (%)': a.live.battery ?? '', 'RSSI (dBm)': a.live.rssi ?? '',
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(assets), 'Assets');
    const ev = EVENTS.map((e) => ({ Timestamp: this.eventTime(e), Asset: this.assetOf(e).name, Device: e.deviceId, Event: e.event, 'Reading / Location': e.reading, Severity: e.severity }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(ev), 'Events');
    const a = this.selected;
    const series = this.metrics.map((m) => seriesFor(a, m, this.range, this.now));
    const rows = series[0].mins.map((m, i) => ({
      Time: this.fmtStamp(new Date(this.now.getTime() - m * 60000), false),
      'Temperature (°C)': series[0].values[i] ?? '', 'Vibration (mm/s)': series[1].values[i] ?? '', 'Battery (%)': series[2].values[i] ?? '',
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), `${a.id} ${this.range}`);
    XLSX.writeFile(book, `Tracking_Telemetry_${this.range}.xlsx`);
    this.showToast(`Exported ${ASSETS.length} assets, ${EVENTS.length} events and ${a.id} telemetry (${RANGE_SPEC[this.range].label.toLowerCase()}).`);
  }

  get alertMinutes(): number {
    return spikeMinsAgo(this.now);
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
