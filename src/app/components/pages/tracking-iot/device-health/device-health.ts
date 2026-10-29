import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  Activity,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bluetooth,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Cpu,
  Ellipsis,
  ExternalLink,
  Fan,
  Forklift,
  HeartPulse,
  Info,
  LoaderCircle,
  MapPin,
  Package,
  Play,
  Plug,
  Plus,
  ScanLine,
  Settings,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SlidersHorizontal,
  Search,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Truck,
  Wifi,
  WifiOff,
  Check,
  FileText,
  RadioTower,
  Battery,
  X,
  Zap,
} from 'lucide-angular';
import {
  ASSIGNEES, AssetKind, DEVICES, DevEvent, Device, DeviceType, Level, NOW, PRIORITIES, SITES, Status, TYPES,
  baseEvents, healthScore, isStale, signalQuality, stateAt, telemetry,
} from './health-data';

type Range = '1h' | '24h' | '7d';
type Tab = 'overview' | 'diagnostics' | 'events' | 'configuration';
type CheckResult = 'pass' | 'warn' | 'fail';
interface DiagRun { at: number; checks: { name: string; result: CheckResult; detail: string }[] }
interface Point { x: number; y: number }

const RANGE_MIN: Record<Range, number> = { '1h': 60, '24h': 1440, '7d': 10080 };
const RANGE_STEP: Record<Range, number> = { '1h': 5, '24h': 60, '7d': 360 };
const RANGE_TICK: Record<Range, number> = { '1h': 10, '24h': 180, '7d': 1440 };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_ICONS: Record<DeviceType, typeof Cpu> = { 'BLE Beacon': Bluetooth, 'Temperature Sensor': Thermometer, 'Vibration Sensor': Activity, 'GPS Tracker': MapPin, 'RFID Reader': ScanLine };
const ASSET_ICONS: Record<AssetKind, typeof Cpu> = { forklift: Forklift, cold: Snowflake, pump: Fan, generator: Zap, truck: Truck, box: Package };
export const COLORS = { online: '#16a34a', warning: '#d97706', critical: '#dc2626', offline: '#9ca3af', maint: '#7c3aed', purple: '#6d28d9' };

/** Trend chart geometry. */
const TW = 640;
const TH = 236;
const TP = { l: 44, r: 14, t: 12, b: 26 };
/** Panel mini chart geometry. */
const MW = 300;
const MH = 112;
const MP = { l: 36, r: 8, t: 8, b: 18 };

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  for (const m of [1, 2, 2.5, 3, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

@Component({
  selector: 'app-device-health',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-health.html',
  styleUrls: ['./device-health.css', './device-health-table.css', './device-health-panel.css'],
})
export class DeviceHealth implements OnDestroy {
  readonly icons = { Battery, Check, FileText, RadioTower, Signal, Building, Calendar, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Cpu, Ellipsis, ExternalLink, HeartPulse, Info, LoaderCircle, MapPin, Play, Plug, Plus, Search, Settings, SlidersHorizontal, TriangleAlert, Wifi, WifiOff, X };
  readonly colors = COLORS;
  readonly sites = SITES;
  readonly types = TYPES;
  readonly assignees = ASSIGNEES;
  readonly priorities = PRIORITIES;
  readonly pageSizes = [5, 10, 25, 50];
  readonly tw = TW;
  readonly th = TH;
  readonly tp = TP;
  readonly mw = MW;
  readonly mh = MH;
  readonly mp = MP;
  readonly ranges: { key: Range; label: string }[] = [{ key: '1h', label: 'Last 1 hour' }, { key: '24h', label: 'Last 24 hours' }, { key: '7d', label: 'Last 7 days' }];

  // page filters
  site = '';
  range: Range = '24h';
  // table filters
  search = '';
  statusFilter: '' | 'attention' | Status = '';
  typeFilter: '' | DeviceType = '';
  lowBattery = false;
  poorSignal = false;
  staleOnly = false;
  moreOpen = false;
  page = 1;
  pageSize = 5;
  menuId = '';

  /** Wide screens open with a device selected; narrower ones keep the drawer closed until a row is clicked. */
  selectedId: string | null = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'VS-30018' : null;
  tab: Tab = 'overview';

  hoverTrend: number | null = null;
  hoverSeg: string | null = null;
  hoverBat: number | null = null;
  hoverRssi: number | null = null;

  diag: Record<string, DiagRun> = {};
  running: { id: string; step: number } | null = null;
  extraEvents: Record<string, DevEvent[]> = {};
  issueSeq = 141;
  issueForm: { title: string; priority: string; assignee: string; notes: string } | null = null;
  formError = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private diagTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(private router: Router) {}

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    this.diagTimers.forEach((t) => clearTimeout(t));
  }

  // ===== Scope (page filters) =====

  /** Devices at the selected site that reported or changed state inside the selected window. */
  get scoped(): Device[] {
    const key = `${this.site}|${this.range}`;
    if (this.scopeCache?.key !== key) {
      const r = RANGE_MIN[this.range];
      this.scopeCache = { key, rows: DEVICES.filter((d) => (!this.site || d.site === this.site) && (d.lastSeenMin <= r || d.sinceMin <= r)) };
    }
    return this.scopeCache.rows;
  }
  private scopeCache: { key: string; rows: Device[] } | null = null;

  get counts(): Record<Status, number> & { total: number; attention: number } {
    const c = { Healthy: 0, Warning: 0, Critical: 0, Offline: 0, Maintenance: 0, total: 0, attention: 0 };
    for (const d of this.scoped) c[d.status]++;
    c.total = this.scoped.length;
    c.attention = c.Warning + c.Critical;
    return c;
  }

  pct(n: number, of: number): string {
    return of ? ((n / of) * 100).toFixed(1) : '0.0';
  }

  setRange(r: Range): void {
    this.range = r;
    this.hoverTrend = null;
    this.onFilter();
  }

  kpi(f: '' | 'attention' | Status): void {
    this.statusFilter = this.statusFilter === f ? '' : f;
    this.onFilter();
  }

  // ===== Trend chart =====

  private trendCache: { key: string; v: ReturnType<DeviceHealth['buildTrend']> } | null = null;

  get trend() {
    const key = `${this.site}|${this.range}`;
    if (this.trendCache?.key !== key) this.trendCache = { key, v: this.buildTrend() };
    return this.trendCache.v;
  }

  private buildTrend() {
    const range = RANGE_MIN[this.range];
    const step = RANGE_STEP[this.range];
    const devices = this.scoped;
    const mins: number[] = [];
    for (let m = range; m >= 0; m -= step) mins.push(m);
    const online: number[] = [];
    const warning: number[] = [];
    const offline: number[] = [];
    for (const m of mins) {
      let on = 0, wa = 0, off = 0;
      for (const d of devices) {
        const s = stateAt(d, m);
        if (s === 'online') on++;
        else if (s === 'warning') wa++;
        else off++;
      }
      online.push(on);
      warning.push(wa);
      offline.push(off);
    }
    // tight domain: nice step for ~5 gridlines, top gridline just above the highest value
    const vMax = Math.max(4, ...online, ...warning, ...offline);
    const yStep = niceStep(vMax / 5);
    const yN = Math.ceil(vMax / yStep);
    const yMax = yStep * yN;
    const plotW = TW - TP.l - TP.r;
    const plotH = TH - TP.t - TP.b;
    const x = (m: number) => TP.l + (1 - m / range) * plotW;
    const y = (v: number) => TP.t + plotH - (v / yMax) * plotH;
    const xs = mins.map(x);
    const pts = (vals: number[]): Point[] => vals.map((v, i) => ({ x: xs[i], y: y(v) }));
    const path = (p: Point[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('');
    const series = [
      { key: 'online', label: 'Online', color: COLORS.online, values: online, pts: pts(online) },
      { key: 'warning', label: 'Warning', color: COLORS.warning, values: warning, pts: pts(warning) },
      { key: 'offline', label: 'Offline', color: COLORS.critical, values: offline, pts: pts(offline) },
    ].map((s) => ({ ...s, d: path(s.pts), last: s.values[s.values.length - 1] }));
    const yTicks = Array.from({ length: yN + 1 }, (_, i) => i).map((i) => ({ y: y(i * yStep), label: (i * yStep).toLocaleString('en-US') }));
    // x ticks aligned to the clock (every 10 min / 3 h / midnight)
    const tick = RANGE_TICK[this.range];
    const start = new Date(NOW.getTime() - range * 60000);
    const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const xTicks: { x: number; label: string }[] = [];
    for (let t = midnight; t <= NOW.getTime(); t += tick * 60000) {
      if (t < start.getTime()) continue;
      const m = (NOW.getTime() - t) / 60000;
      const dt = new Date(t);
      xTicks.push({ x: x(m), label: this.range === '7d' ? `${MONTHS[dt.getMonth()]} ${dt.getDate()}` : this.clock(dt, this.range === '1h') });
    }
    const hitW = plotW / (mins.length - 1);
    return { mins, xs, series, yTicks, xTicks, hitW };
  }

  trendLabel(i: number): string {
    const dt = new Date(NOW.getTime() - this.trend.mins[i] * 60000);
    return this.range === '7d' ? `${DAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${this.clock(dt, true)}` : this.clock(dt, true);
  }

  get trendR(): number {
    return this.range === '7d' ? 2.5 : 3;
  }

  // ===== Donut =====

  get donut() {
    const c = this.counts;
    const r = 58;
    const circ = 2 * Math.PI * r;
    const rows = [
      { key: 'Healthy' as Status, label: 'Healthy', color: COLORS.online, n: c.Healthy },
      { key: 'Warning' as Status, label: 'Warning', color: COLORS.warning, n: c.Warning },
      { key: 'Critical' as Status, label: 'Critical', color: COLORS.critical, n: c.Critical },
      { key: 'Offline' as Status, label: 'Offline', color: COLORS.offline, n: c.Offline },
      { key: 'Maintenance' as Status, label: 'Maintenance', color: COLORS.maint, n: c.Maintenance },
    ];
    let acc = 0;
    const gap = c.total ? 1.5 : 0;
    const segs = rows.map((row) => {
      const len = c.total ? (row.n / c.total) * circ : 0;
      const seg = { ...row, pct: this.pct(row.n, c.total), dash: `${Math.max(0, len - (row.n ? gap : 0))} ${circ}`, offset: -acc };
      acc += len;
      return seg;
    });
    return { r, segs, total: c.total };
  }

  get hoverSegRow() {
    return this.donut.segs.find((s) => s.key === this.hoverSeg) ?? null;
  }

  // ===== Table =====

  get rows(): Device[] {
    const q = this.search.trim().toLowerCase();
    return this.scoped.filter((d) => {
      if (this.statusFilter === 'attention' ? d.status !== 'Warning' && d.status !== 'Critical' : this.statusFilter && d.status !== this.statusFilter) return false;
      if (this.typeFilter && d.type !== this.typeFilter) return false;
      if (this.lowBattery && (d.battery === null || d.battery >= 20)) return false;
      if (this.poorSignal && signalQuality(d.rssi) !== 'Poor') return false;
      if (this.staleOnly && d.lastSeenMin <= 60) return false;
      if (q && !`${d.id} ${d.model} ${d.type} ${d.asset ? d.asset.name + ' ' + d.asset.code : ''} ${d.site} ${d.gateway}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get pageRows(): Device[] {
    const p = Math.min(this.page, this.pageCount);
    return this.rows.slice((p - 1) * this.pageSize, p * this.pageSize);
  }

  get rangeText(): string {
    const n = this.rows.length;
    if (!n) return 'Showing 0 of 0 devices';
    const p = Math.min(this.page, this.pageCount);
    return `Showing ${((p - 1) * this.pageSize + 1).toLocaleString('en-US')}–${Math.min(n, p * this.pageSize).toLocaleString('en-US')} of ${n.toLocaleString('en-US')} devices`;
  }

  get pages(): (number | null)[] {
    const last = this.pageCount;
    const p = Math.min(this.page, last);
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    if (p <= 4) return [1, 2, 3, 4, 5, null, last];
    if (p >= last - 3) return [1, null, last - 4, last - 3, last - 2, last - 1, last];
    return [1, null, p - 1, p, p + 1, null, last];
  }

  goPage(p: number): void {
    this.page = Math.max(1, Math.min(this.pageCount, p));
  }

  onFilter(): void {
    this.page = 1;
  }

  get moreCount(): number {
    return (this.lowBattery ? 1 : 0) + (this.poorSignal ? 1 : 0) + (this.staleOnly ? 1 : 0);
  }

  clearMore(): void {
    this.lowBattery = this.poorSignal = this.staleOnly = false;
    this.onFilter();
  }

  typeIcon(d: Device) {
    return TYPE_ICONS[d.type];
  }

  assetIcon(d: Device) {
    return d.asset ? ASSET_ICONS[d.asset.kind] : Package;
  }

  quality(d: Device) {
    return signalQuality(d.rssi);
  }

  signalIcon(d: Device) {
    const q = signalQuality(d.rssi);
    return q === 'Strong' ? Signal : q === 'Good' ? SignalHigh : q === 'Fair' ? SignalMedium : SignalLow;
  }

  qualityClass(d: Device): string {
    const q = signalQuality(d.rssi);
    return q === 'Poor' ? 'c-red' : q === 'Fair' ? 'c-amber' : 'c-green';
  }

  batteryIcon(d: Device) {
    const b = d.battery ?? 0;
    return b >= 60 ? BatteryFull : b >= 20 ? BatteryMedium : BatteryLow;
  }

  batteryClass(d: Device): string {
    const b = d.battery ?? 0;
    return b < 20 ? 'c-red' : b < 30 ? 'c-amber' : 'c-green';
  }

  connClass(d: Device): string {
    return 'pill--' + (d.conn === 'Online' ? 'green' : d.conn === 'Warning' ? 'amber' : 'grey');
  }

  healthLabel(d: Device): string {
    return d.status === 'Warning' ? 'Attention' : d.status;
  }

  healthClass(d: Device): string {
    return 'pill--' + this.statusLevel(d.status);
  }

  statusLevel(s: Status): Level {
    return s === 'Healthy' ? 'green' : s === 'Warning' ? 'amber' : s === 'Critical' ? 'red' : s === 'Maintenance' ? 'purple' : 'grey';
  }

  ago(min: number): string {
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    if (min < 1440) {
      const h = Math.round(min / 60);
      return `${h} hour${h === 1 ? '' : 's'} ago`;
    }
    const dd = Math.round(min / 1440);
    return `${dd} day${dd === 1 ? '' : 's'} ago`;
  }

  clock(dt: Date, minutes = true): string {
    const h = dt.getHours() % 12 || 12;
    return `${h}:${minutes ? String(dt.getMinutes()).padStart(2, '0') : '00'} ${dt.getHours() < 12 ? 'AM' : 'PM'}`;
  }

  timeAt(min: number): string {
    return this.clock(new Date(NOW.getTime() - min * 60000));
  }

  dateAt(min: number): string {
    const dt = new Date(NOW.getTime() - min * 60000);
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  /** Event time: clock time today, otherwise date + time. */
  whenAt(min: number): string {
    const dt = new Date(NOW.getTime() - min * 60000);
    return dt.getDate() === NOW.getDate() && min < 1440 ? this.clock(dt) : `${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${this.clock(dt)}`;
  }

  // ===== Row menu =====

  toggleMenu(id: string, e: Event): void {
    e.stopPropagation();
    this.moreOpen = false;
    this.menuId = this.menuId === id ? '' : id;
  }

  select(d: Device, tab: Tab = 'overview'): void {
    this.menuId = '';
    this.selectedId = d.id;
    this.tab = tab;
    this.hoverBat = this.hoverRssi = null;
  }

  openConfig(d: Device): void {
    this.menuId = '';
    this.router.navigate(['/tracking-iot/device-configuration'], { queryParams: { device: d.id } });
  }

  // ===== Panel =====

  get selected(): Device | null {
    return this.selectedId ? DEVICES.find((d) => d.id === this.selectedId) ?? null : null;
  }

  closePanel(): void {
    this.selectedId = null;
  }

  get score(): number {
    const d = this.selected;
    return d ? healthScore(d) : 0;
  }

  get scoreColor(): string {
    const d = this.selected;
    if (!d) return COLORS.online;
    return d.status === 'Healthy' ? COLORS.online : d.status === 'Warning' ? COLORS.warning : d.status === 'Offline' ? '#6b7280' : COLORS.critical;
  }

  get scoreDash(): string {
    const c = 2 * Math.PI * 34;
    return `${(this.score / 100) * c} ${c}`;
  }

  /** Callout sentence built from what is wrong with the device. */
  get callout(): { level: Level; title: string; text: string } {
    const d = this.selected;
    if (!d) return { level: 'green', title: '', text: '' };
    const reasons: string[] = [];
    if (d.conn === 'Offline') reasons.push('is offline');
    else if (d.conn === 'Warning') reasons.push('has intermittent connectivity');
    if (d.battery !== null && d.battery < 20) reasons.push('reporting low battery level');
    else if (d.battery !== null && d.battery < 30) reasons.push('battery is running low');
    if (d.rssi < -85) reasons.push('has poor signal quality');
    if (isStale(d)) reasons.push('missed recent heartbeats');
    const title = d.status === 'Warning' ? 'Attention' : d.status;
    if (!reasons.length) return { level: 'green', title, text: 'All health checks are passing.' };
    return { level: this.statusLevel(d.status), title, text: `Device ${reasons.slice(0, 2).join(' and ')}.` };
  }

  batteryWord(d: Device): { label: string; level: Level } {
    const b = d.battery ?? 0;
    return b < 20 ? { label: 'Low', level: 'red' } : b < 30 ? { label: 'Fair', level: 'amber' } : { label: 'Good', level: 'green' };
  }

  signalWord(d: Device): { label: string; level: Level } {
    const q = signalQuality(d.rssi);
    return q === 'Poor' ? { label: 'Weak', level: 'red' } : q === 'Fair' ? { label: 'Fair', level: 'amber' } : { label: q, level: 'green' };
  }

  // panel mini charts
  private teleCache: { id: string; v: ReturnType<DeviceHealth['buildTele']> } | null = null;

  get tele() {
    const d = this.selected;
    if (!d) return null;
    if (this.teleCache?.id !== d.id) this.teleCache = { id: d.id, v: this.buildTele(d) };
    return this.teleCache.v;
  }

  private buildTele(d: Device) {
    const t = telemetry(d);
    const plotW = MW - MP.l - MP.r;
    const plotH = MH - MP.t - MP.b;
    const xs = t.mins.map((m) => MP.l + (1 - m / 1440) * plotW);
    const base = MH - MP.b;
    const yb = (v: number) => MP.t + plotH - (v / 100) * plotH;
    const yr = (v: number) => MP.t + ((-30 - v) / 80) * plotH; // -30 (top) .. -110 (bottom)
    const line = (ys: number[]) => ys.map((y, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y.toFixed(1)}`).join('');
    const by = t.battery.map(yb);
    const ry = t.rssi.map(yr);
    const bLine = line(by);
    const xTicks: { x: number; label: string }[] = [];
    const start = NOW.getTime() - 1440 * 60000;
    const first = new Date(new Date(start).setMinutes(0, 0, 0)).getTime();
    for (let tm = first; tm <= NOW.getTime(); tm += 3600000) {
      const dt = new Date(tm);
      if (tm < start || dt.getHours() % 6) continue;
      xTicks.push({ x: MP.l + (1 - (NOW.getTime() - tm) / 60000 / 1440) * plotW, label: this.clock(dt).replace(':00 ', '') });
    }
    return {
      mins: t.mins, xs, battery: t.battery, rssi: t.rssi, by, ry, bLine, rLine: line(ry),
      bArea: `${bLine}L${xs[xs.length - 1].toFixed(1)},${base}L${xs[0].toFixed(1)},${base}Z`,
      bTicks: [0, 50, 100].map((v) => ({ y: yb(v), label: v + '%' })),
      rTicks: [-30, -70, -110].map((v) => ({ y: yr(v), label: String(v) })),
      xTicks, hitW: plotW / Math.max(1, xs.length - 1),
    };
  }

  get batColor(): string {
    const d = this.selected;
    const b = d && d.battery !== null ? d.battery : 100;
    return b < 20 ? COLORS.critical : b < 30 ? COLORS.warning : COLORS.online;
  }

  // ===== Events =====

  events(d: Device): DevEvent[] {
    return [...(this.extraEvents[d.id] ?? []), ...baseEvents(d)];
  }

  get selEvents(): DevEvent[] {
    const d = this.selected;
    return d ? this.events(d) : [];
  }

  private addEvent(d: Device, e: DevEvent): void {
    this.extraEvents = { ...this.extraEvents, [d.id]: [e, ...(this.extraEvents[d.id] ?? [])] };
  }

  // ===== Diagnostics =====

  readonly checkNames = ['Heartbeat', 'Gateway reachability', 'Battery', 'RSSI / signal'];

  get selDiag(): DiagRun | null {
    const d = this.selected;
    return d ? this.diag[d.id] ?? null : null;
  }

  get runningSel(): boolean {
    return !!this.running && this.running.id === this.selectedId;
  }

  get runStep(): number {
    return this.running ? this.running.step : 0;
  }

  runDiagnostics(d: Device): void {
    this.menuId = '';
    this.select(d, 'diagnostics');
    if (this.running) return;
    this.running = { id: d.id, step: 0 };
    for (let i = 1; i <= this.checkNames.length; i++) {
      this.diagTimers.push(setTimeout(() => {
        if (!this.running) return;
        this.running = { id: d.id, step: i };
        if (i === this.checkNames.length) this.finishDiagnostics(d);
      }, i * 650));
    }
  }

  private finishDiagnostics(d: Device): void {
    const gwSite = SITES.find((s) => s.name === d.site);
    const gwDown = DEVICES.filter((x) => x.gateway === d.gateway && x.conn === 'Offline').length;
    const q = signalQuality(d.rssi);
    const checks: DiagRun['checks'] = [
      d.conn === 'Offline'
        ? { name: 'Heartbeat', result: 'fail', detail: `No heartbeat for ${this.ago(d.lastSeenMin).replace(' ago', '')} (expected every ${d.intervalMin} min)` }
        : isStale(d) || d.conn === 'Warning'
          ? { name: 'Heartbeat', result: 'warn', detail: `Last heartbeat ${this.ago(d.lastSeenMin)}, expected every ${d.intervalMin} min` }
          : { name: 'Heartbeat', result: 'pass', detail: `Heartbeat received ${this.ago(d.lastSeenMin)}` },
      d.gateway === 'Cellular'
        ? { name: 'Gateway reachability', result: 'pass', detail: 'Cellular network registered (UAE-M2M APN)' }
        : { name: 'Gateway reachability', result: 'pass', detail: `${d.gateway} reachable at ${gwSite ? gwSite.name : d.site}, ${20 + (d.seed % 40)} ms latency${gwDown ? ` · ${gwDown} offline device(s) on gateway` : ''}` },
      d.battery === null
        ? { name: 'Battery', result: 'pass', detail: d.power === 'PoE' ? 'Powered over Ethernet (PoE)' : 'External power supply stable' }
        : { name: 'Battery', result: d.battery < 20 ? 'fail' : d.battery < 30 ? 'warn' : 'pass', detail: `${d.battery}% remaining${d.battery < 20 ? ' — replace battery' : ''}` },
      { name: 'RSSI / signal', result: q === 'Poor' ? 'fail' : q === 'Fair' ? 'warn' : 'pass', detail: `${d.rssi} dBm (${q})${q === 'Poor' ? ' — below -90 dBm threshold' : ''}` },
    ];
    this.diag = { ...this.diag, [d.id]: { at: 0, checks } };
    this.running = null;
    const failed = checks.filter((c) => c.result === 'fail').length;
    const warned = checks.filter((c) => c.result === 'warn').length;
    this.addEvent(d, { min: 0, title: 'Diagnostics run', detail: failed ? `${failed} of ${checks.length} checks failed` : warned ? `${warned} check(s) need attention` : 'All checks passed', level: failed ? 'red' : warned ? 'amber' : 'green' });
    this.showToast(`Diagnostics for ${d.id} completed: ${checks.length - failed - warned} passed, ${warned} warning, ${failed} failed.`);
  }

  diagCount(r: CheckResult): number {
    const run = this.selDiag;
    return run ? run.checks.filter((c) => c.result === r).length : 0;
  }

  checkIcon(r: CheckResult) {
    return r === 'pass' ? CircleCheck : r === 'warn' ? TriangleAlert : CircleX;
  }

  // ===== Issues =====

  openIssue(d: Device): void {
    this.menuId = '';
    this.select(d, this.tab);
    this.formError = '';
    const what = this.callout.text.replace(/^Device /, '').replace(/\.$/, '');
    this.issueForm = { title: `${d.id} ${d.status === 'Healthy' ? 'requires inspection' : '— ' + what}`, priority: d.status === 'Critical' || d.status === 'Offline' ? 'High' : 'Medium', assignee: ASSIGNEES[4], notes: '' };
  }

  saveIssue(): void {
    const f = this.issueForm;
    const d = this.selected;
    if (!f || !d) return;
    if (!f.title.trim()) return void (this.formError = 'Enter an issue title.');
    const id = `ISS-2026-${String(++this.issueSeq).padStart(4, '0')}`;
    this.addEvent(d, { min: 0, title: `Issue ${id} created`, detail: `${f.priority} priority · assigned to ${f.assignee}`, level: 'purple' });
    this.issueForm = null;
    this.showToast(`${id} created for ${d.id} and assigned to ${f.assignee}.`);
  }

  // ===== Configuration =====

  config(d: Device): { k: string; v: string }[] {
    return [
      { k: 'Device type', v: d.type },
      { k: 'Protocol', v: d.protocol === 'Ethernet' ? 'Ethernet (LLRP)' : d.protocol },
      { k: 'Gateway', v: d.gateway === 'Cellular' ? 'Cellular (UAE-M2M)' : `${d.gateway} · ${d.site}` },
      { k: 'Reporting interval', v: `${d.intervalMin} min` },
      { k: 'Heartbeat timeout', v: `${d.intervalMin * 3} min` },
      { k: 'Low battery threshold', v: d.battery === null ? 'Not applicable' : '20%' },
      { k: 'RSSI alert threshold', v: '-90 dBm' },
      { k: 'Firmware', v: d.firmware === d.latestFirmware ? `${d.firmware} (latest)` : `${d.firmware} → ${d.latestFirmware} available` },
    ];
  }

  // ===== Menus / keys =====

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId = '';
    this.moreOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.issueForm) this.issueForm = null;
    else if (this.menuId || this.moreOpen) this.closeMenus();
    // drawer mode: Esc also closes the details
    else if (window.innerWidth < 1200) this.selectedId = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3800);
  }
}
