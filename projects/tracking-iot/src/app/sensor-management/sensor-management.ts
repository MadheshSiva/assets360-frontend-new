import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, catchError, concatMap, from, map, of, toArray } from 'rxjs';
import * as XLSX from 'xlsx';
import { ComboOption, SmCombo } from './sm-combo';
import {
  LucideAngularModule,
  Activity,
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Cpu,
  Download,
  Droplets,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  FileText,
  Gauge,
  Info,
  Network,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Thermometer,
  Trash2,
  TriangleAlert,
  Upload,
  Waves,
  Wrench,
  X,
  Zap,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import {
  CAL_WINDOW_DAYS, INTERVALS, NOW, PARAMETERS, POINTS_BY_TYPE, Parameter, SENSORS, STATUSES, Sensor, SensorEvent, SensorStatus, SensorType,
  daysUntil, historyOf, isCalDue, isOverdue, nextNumber, paramOf, sensorIdOf, series,
} from './sensor-data';
import { SensorApiService, SensorDeviceOptionDto, SensorRequest, toParameter, toSensor } from './sensor-api.service';

type Tab = 'sensors' | 'params' | 'calibration' | 'mapping';
type PanelTab = 'overview' | 'readings' | 'configuration' | 'history';
type SensorBody = Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>;

interface SensorForm {
  editId: string;
  type: SensorType;
  number: string;
  serial: string;
  deviceId: string;
  channel: number | null;
  asset: string;
  point: string;
  site: string;
  intervalSec: number | null;
  low: number | null;
  high: number | null;
  calDue: string;
}

interface CalForm { id: string; date: string; certificate: string; result: '' | 'Pass' | 'Adjusted'; note: string }

interface ImportRow { line: number; type: SensorType | null; number: string; id: string; serial: string; deviceId: string; channel: number; asset: string; point: string; site: string; calDue: string; error: string }

type Dialog =
  | { kind: 'form'; f: SensorForm }
  | { kind: 'calibrate'; f: CalForm }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string };

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Icon per known sensor type; other types fall back to the radio icon. */
const TYPE_ICONS: Record<string, typeof Radio> = {
  'temperature probe': Thermometer, 'vibration sensor': Activity, 'humidity sensor': Droplets, 'pressure transmitter': Gauge, 'current sensor': Zap, 'level sensor': Waves,
};

/** Latest-reading chart geometry. */
const CW = 380;
const CH = 128;
const CP = { l: 26, r: 6, t: 8, b: 20 };

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  for (const m of [1, 2, 4, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

@Component({
  selector: 'app-sensor-management',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, SmCombo],
  templateUrl: './sensor-management.html',
  styleUrls: ['./sensor-management.css', './sensor-management-table.css', './sensor-management-panel.css', '../shared/iot-purple-theme.css'],
})
export class SensorManagement implements OnInit, OnDestroy {
  readonly icons = {
    ArrowRight, Building2, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Cpu, Download, Ellipsis, EllipsisVertical, ExternalLink,
    FileText, Gauge, Info, Network, Pencil, Plus, Radio, RotateCcw, Search, Settings, SlidersHorizontal, Trash2, TriangleAlert, Upload, Wrench, X,
  };
  readonly statuses = STATUSES;
  readonly parameters = PARAMETERS;
  readonly intervals = INTERVALS;
  readonly pageSizes = [10, 25, 50];
  readonly cw = CW;
  readonly ch = CH;
  readonly cp = CP;
  readonly calWindow = CAL_WINDOW_DAYS;
  readonly now = NOW;

  private readonly api = inject(SensorApiService);
  private readonly router = inject(Router);
  private subs = new Subscription();

  tab: Tab = 'sensors';
  search = '';
  typeFilter: SensorType | '' = '';
  kindFilter = '';
  siteFilter = '';
  statusFilter: SensorStatus | '' = '';
  pageSize = 10;
  page = 0;
  checked = new Set<string>();

  /** No sensor is selected until a row is clicked. */
  selectedId: string | null = null;
  panelTab: PanelTab = 'overview';
  menuId = '';
  dialog: Dialog | null = null;
  formError = '';
  saving = false;
  toast = '';
  hoverPt: number | null = null;

  loading = false;
  loadError = '';
  readingsLoading = false;
  readingsError = '';

  /** Linked device dropdown (GET /api/sensors/devices) and measurement point suggestions for the open form. */
  deviceOptions: SensorDeviceOptionDto[] = [];
  pointOptions: string[] = [];
  channelHint = '';

  private toastTimer?: ReturnType<typeof setTimeout>;
  private version = 0;

  ngOnInit(): void {
    this.loadOptions();
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    this.subs.unsubscribe();
  }

  // ===== Loading =====

  /** Sensor types, sampling intervals, statuses and measurement points (GET /api/sensors/form-options). */
  private loadOptions(): void {
    this.subs.add(this.api.formOptions().subscribe({
      next: (o) => {
        PARAMETERS.splice(0, PARAMETERS.length, ...o.sensorTypes.map(toParameter));
        STATUSES.splice(0, STATUSES.length, ...o.statuses);
        INTERVALS.splice(0, INTERVALS.length, ...o.samplingIntervals);
        for (const k of Object.keys(POINTS_BY_TYPE)) delete POINTS_BY_TYPE[k];
        Object.assign(POINTS_BY_TYPE, o.measurementPointsBySensorType);
        // re-resolve sensor types loaded before the options arrived
        for (const s of SENSORS) {
          const p = paramOf(s.type);
          if (p) s.param = { ...s.param, prefix: p.prefix, decimals: p.decimals, unit: s.param.unit || p.unit };
        }
        this.version++;
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e, 'Could not load the sensor form options.')),
    }));
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.subs.add(this.api.list().subscribe({
      next: (rows) => {
        SENSORS.splice(0, SENSORS.length, ...rows.map((r) => toSensor(r, PARAMETERS)));
        this.checked.clear();
        if (this.selectedId && !SENSORS.some((s) => s.id === this.selectedId)) this.selectedId = null;
        this.loading = false;
        this.version++;
      },
      error: (e: unknown) => {
        this.loading = false;
        this.loadError = apiErrorMessage(e, 'Could not load sensors.');
      },
    }));
  }

  // ===== Option lists derived from the loaded sensors =====

  get types(): SensorType[] {
    const list = PARAMETERS.map((p) => p.type);
    for (const s of SENSORS) if (!list.includes(s.type)) list.push(s.type);
    return list;
  }

  private optCache = { version: -1, kinds: [] as string[], sites: [] as string[], assets: [] as string[] };

  private get opts() {
    if (this.optCache.version !== this.version) {
      const uniq = (v: string[]) => [...new Set(v.filter((x) => !!x))].sort((a, b) => a.localeCompare(b));
      const assets = uniq([...SENSORS.map((s) => s.assetName), ...this.deviceOptions.map((d) => d.assetName ?? '')]);
      this.optCache = {
        version: this.version,
        kinds: uniq(SENSORS.map((s) => s.assetName)),
        sites: uniq([...SENSORS.map((s) => s.site), ...this.deviceOptions.map((d) => d.siteName ?? '')]),
        assets,
      };
    }
    return this.optCache;
  }

  /** Asset filter options: the assets sensors are mapped to. */
  get kinds(): string[] {
    return this.opts.kinds;
  }

  get sites(): string[] {
    return this.opts.sites;
  }

  // ===== Popup suggestion lists (sm-combo); cached so the list is not rebuilt on every change detection =====

  private comboCache: { devices: unknown; assets: unknown; points: unknown; d: ComboOption[]; a: ComboOption[]; p: ComboOption[] } = { devices: null, assets: null, points: null, d: [], a: [], p: [] };

  get deviceCombo(): ComboOption[] {
    if (this.comboCache.devices !== this.deviceOptions) {
      this.comboCache.devices = this.deviceOptions;
      this.comboCache.d = this.deviceOptions.map((o) => ({ value: o.deviceId, hint: [o.deviceName, o.model, o.assetName].filter(Boolean).join(' · ') }));
    }
    return this.comboCache.d;
  }

  get assetCombo(): ComboOption[] {
    const list = this.assetOptions;
    if (this.comboCache.assets !== list) {
      this.comboCache.assets = list;
      this.comboCache.a = list.map((value) => ({ value }));
    }
    return this.comboCache.a;
  }

  get pointCombo(): ComboOption[] {
    if (this.comboCache.points !== this.pointOptions) {
      this.comboCache.points = this.pointOptions;
      this.comboCache.p = this.pointOptions.map((value) => ({ value }));
    }
    return this.comboCache.p;
  }

  get assetOptions(): string[] {
    return this.opts.assets;
  }

  // ===== KPIs =====

  get kpi() {
    let active = 0, due = 0, fault = 0;
    for (const s of SENSORS) {
      if (s.status === 'Active') active++;
      if (s.status === 'Offline') fault++;
      if (isCalDue(s)) due++;
    }
    const total = SENSORS.length;
    return { total, active, due, fault, activePct: this.pct(active, total), duePct: this.pct(due, total), faultPct: this.pct(fault, total) };
  }

  pct(n: number, of: number): string {
    return of ? ((n / of) * 100).toFixed(1) : '0.0';
  }

  kpiGo(k: 'total' | 'active' | 'due' | 'fault'): void {
    if (k === 'due') {
      this.clearFilters();
      this.tab = 'calibration';
      return;
    }
    this.tab = 'sensors';
    this.statusFilter = k === 'active' ? (this.statusFilter === 'Active' ? '' : 'Active') : k === 'fault' ? (this.statusFilter === 'Offline' ? '' : 'Offline') : '';
    if (k === 'total') this.clearFilters();
    this.onFilter();
  }

  // ===== Filtering & paging =====

  private cacheKey = '';
  private cacheRows: Sensor[] = [];

  /** Sensors matching the filters (newest first, as the API lists them). */
  get filtered(): Sensor[] {
    const key = JSON.stringify([this.search, this.typeFilter, this.kindFilter, this.siteFilter, this.statusFilter, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    this.cacheRows = SENSORS.filter((s) =>
      (!this.typeFilter || s.type === this.typeFilter) && (!this.kindFilter || s.assetName === this.kindFilter) &&
      (!this.siteFilter || s.site === this.siteFilter) && (!this.statusFilter || s.status === this.statusFilter) &&
      (!q || `${s.id} ${s.name} ${s.type} ${s.param.label} ${s.deviceId} ${s.assetName} ${s.point} ${s.serial}`.toLowerCase().includes(q)));
    this.cacheKey = key;
    return this.cacheRows;
  }

  get hasFilters(): boolean {
    return !!(this.search || this.typeFilter || this.kindFilter || this.siteFilter || this.statusFilter);
  }

  /** Rows for the active tab before paging. */
  get list(): Sensor[] {
    if (this.tab !== 'calibration') return this.filtered;
    return this.filtered.filter((s) => isCalDue(s)).sort((a, b) => (a.calDue ?? 0) - (b.calDue ?? 0));
  }

  get pageRows(): Sensor[] {
    return this.list.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.list.length / this.pageSize));
  }

  get pages(): (number | null)[] {
    const n = this.pageCount;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const p = this.page;
    if (p <= 3) return [0, 1, 2, 3, 4, null, n - 1];
    if (p >= n - 4) return [0, null, n - 5, n - 4, n - 3, n - 2, n - 1];
    return [0, null, p - 1, p, p + 1, null, n - 1];
  }

  get showing(): string {
    const n = this.list.length;
    const noun = this.tab === 'mapping' ? 'mappings' : 'sensors';
    return n ? `Showing ${(this.page * this.pageSize + 1).toLocaleString()}–${Math.min(n, (this.page + 1) * this.pageSize).toLocaleString()} of ${n.toLocaleString()} ${noun}` : `No ${noun}`;
  }

  /** Text of the table's empty row. */
  get emptyText(): string {
    if (this.loading) return 'Loading sensors…';
    if (this.loadError) return 'Sensors could not be loaded.';
    if (!SENSORS.length) return 'No sensors registered yet.';
    return '';
  }

  onFilter(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.typeFilter = this.statusFilter = '';
    this.kindFilter = this.siteFilter = '';
    this.onFilter();
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.page = 0;
    this.menuId = '';
  }

  // ===== Calibration tab =====

  get calSummary() {
    let overdue = 0, week = 0, month = 0;
    for (const s of this.filtered) {
      if (s.calDue === null) continue;
      const d = daysUntil(s.calDue);
      if (d < 0) overdue++;
      else if (d <= 7) week++;
      else if (d <= CAL_WINDOW_DAYS) month++;
    }
    return { overdue, week, month };
  }

  // ===== Parameters tab =====

  get paramRows() {
    return PARAMETERS.map((p) => {
      const list = SENSORS.filter((s) => s.type === p.type);
      return {
        p, total: list.length, active: list.filter((s) => s.status === 'Active').length,
        alerts: list.filter((s) => s.status === 'Attention').length, offline: list.filter((s) => s.status === 'Offline').length,
      };
    });
  }

  viewParamSensors(p: Parameter): void {
    this.clearFilters();
    this.typeFilter = p.type;
    this.tab = 'sensors';
  }

  // ===== Row helpers =====

  typeIcon(s: Sensor) {
    return TYPE_ICONS[s.type.toLowerCase()] ?? Radio;
  }

  typeWords(s: Sensor): string {
    return s.type;
  }

  fmtValue(s: Sensor, v: number | null): string {
    if (v === null) return s.status === 'Inactive' ? '—' : 'No data';
    const u = s.param.unit;
    const n = Number(v).toFixed(s.param.decimals);
    return u === '%RH' || u === '%' ? `${n}%` : `${n}${u ? ' ' + u : ''}`;
  }

  /** Threshold with unit, or — when not set. */
  fmtLimit(s: Sensor, v: number | null): string {
    return v === null ? '—' : `${v}${s.param.unit ? ' ' + s.param.unit : ''}`;
  }

  readingClass(s: Sensor): string {
    const v = s.reading;
    if (v === null) return 'rd--none';
    if ((s.high !== null && v > s.high) || (s.low !== null && v < s.low)) return 'rd--bad';
    if (s.high === null || s.low === null) return 'rd--ok';
    const margin = (s.high - s.low) * 0.08;
    return v > s.high - margin || v < s.low + margin ? 'rd--warn' : 'rd--ok';
  }

  statusClass(s: Sensor): string {
    return 'ps--' + s.status.toLowerCase().replace(/\s+/g, '-');
  }

  overdue(s: Sensor): boolean {
    return isOverdue(s);
  }

  calState(s: Sensor): { text: string; cls: string } {
    if (s.calDue === null) return { text: '—', cls: '' };
    const d = daysUntil(s.calDue);
    if (d < 0) return { text: `Overdue ${-d} day${d === -1 ? '' : 's'}`, cls: 'cs--bad' };
    if (d <= 7) return { text: d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'cs--warn' };
    return { text: `Due in ${d} days`, cls: 'cs--soon' };
  }

  fmtDate(ms: number | null): string {
    if (ms === null) return '—';
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  fmtDateTime(ms: number): string {
    const d = new Date(ms);
    return `${this.fmtDate(ms)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  clock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  ago(min: number): string {
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    if (min < 1440) return `${Math.round(min / 60)} h ago`;
    return `${Math.round(min / 1440)} days ago`;
  }

  /** "Last reading 5 min ago" from the loaded readings, or — when none were reported. */
  lastReadingText(s: Sensor): string {
    const pts = series(s);
    const last = pts.length ? pts[pts.length - 1].at : null;
    return last === null ? 'No readings in the last 24 hours' : `Last reading ${this.ago(Math.round((Date.now() - last) / 60_000))}`;
  }

  /** The API does not store a measuring range. */
  rangeText(_s: Sensor): string {
    return '—';
  }

  intervalText(sec: number | null): string {
    if (sec === null) return '—';
    const opt = INTERVALS.find((i) => i.seconds === sec);
    if (opt) return opt.label;
    return sec < 60 ? `${sec} seconds` : sec === 60 ? '60 seconds' : sec < 3600 ? `${sec / 60} minutes` : `${sec / 3600} hours`;
  }

  // ===== Selection =====

  isChecked(s: Sensor): boolean {
    return this.checked.has(s.id);
  }

  toggleCheck(s: Sensor): void {
    if (this.checked.has(s.id)) this.checked.delete(s.id);
    else this.checked.add(s.id);
  }

  get pageAllChecked(): boolean {
    const rows = this.pageRows;
    return rows.length > 0 && rows.every((s) => this.checked.has(s.id));
  }

  get pageSomeChecked(): boolean {
    return !this.pageAllChecked && this.pageRows.some((s) => this.checked.has(s.id));
  }

  togglePage(): void {
    const all = this.pageAllChecked;
    for (const s of this.pageRows) {
      if (all) this.checked.delete(s.id);
      else this.checked.add(s.id);
    }
  }

  // ===== Panel =====

  get selected(): Sensor | null {
    return this.selectedId ? SENSORS.find((s) => s.id === this.selectedId) ?? null : null;
  }

  /** Opens the panel and refreshes the sensor (GET /api/sensors/{id}) and its last 24 h of readings. */
  select(s: Sensor): void {
    const changed = this.selectedId !== s.id;
    this.selectedId = s.id;
    this.panelTab = 'overview';
    this.menuId = '';
    this.hoverPt = null;
    if (!changed) return;
    this.subs.add(this.api.get(s.id).subscribe({
      next: (dto) => this.replace(s.id, dto),
      error: (e: unknown) => this.showToast(apiErrorMessage(e, `Could not refresh ${s.id}.`)),
    }));
    this.loadReadings(s.id);
  }

  private loadReadings(id: string): void {
    this.readingsLoading = true;
    this.readingsError = '';
    this.subs.add(this.api.readings(id, 1).subscribe({
      next: (pts) => {
        const s = SENSORS.find((x) => x.id === id);
        if (s) s.readings = pts;
        this.readingsLoading = false;
        this.version++;
      },
      error: (e: unknown) => {
        this.readingsLoading = false;
        this.readingsError = apiErrorMessage(e, 'Could not load readings.');
      },
    }));
  }

  /** Swaps in the server copy of a sensor, keeping page-only details (events, readings, session calibration). */
  private replace(id: string, dto: Parameters<typeof toSensor>[0]): Sensor {
    const fresh = toSensor(dto, PARAMETERS);
    const i = SENSORS.findIndex((x) => x.id === id);
    if (i >= 0) {
      const old = SENSORS[i];
      fresh.events = old.events;
      fresh.readings = old.readings;
      fresh.lastCal = old.lastCal;
      fresh.certificate = old.certificate;
      SENSORS[i] = fresh;
    } else {
      SENSORS.unshift(fresh);
    }
    this.version++;
    return fresh;
  }

  history(s: Sensor): SensorEvent[] {
    return historyOf(s);
  }

  calCountdown(s: Sensor): string {
    if (s.calDue === null) return '';
    const d = daysUntil(s.calDue);
    return d < 0 ? `(${-d} days overdue)` : d === 0 ? '(today)' : `(in ${d} days)`;
  }

  private chartCache: { key: string; v: ReturnType<SensorManagement['buildChart']> | null } | null = null;

  get chart() {
    const s = this.selected;
    if (!s) return null;
    const key = `${s.id}|${s.reading}|${s.status}|${this.version}`;
    if (this.chartCache?.key !== key) this.chartCache = { key, v: series(s).length >= 2 ? this.buildChart(s) : null };
    return this.chartCache.v;
  }

  private buildChart(s: Sensor) {
    const pts = series(s);
    const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
    const max = Math.max(...vals, s.reading ?? 0, 1);
    const step = niceStep(max / 3);
    const yMax = step * Math.max(3, Math.ceil(max / step));
    const plotW = CW - CP.l - CP.r;
    const plotH = CH - CP.t - CP.b;
    const t0 = pts[0].at;
    const span = Math.max(1, pts[pts.length - 1].at - t0);
    const x = (at: number) => CP.l + ((at - t0) / span) * plotW;
    const y = (v: number) => CP.t + plotH - (v / yMax) * plotH;
    let line = '';
    let area = '';
    let run: { x: number; y: number }[] = [];
    const flush = () => {
      if (run.length > 1) {
        const d = run.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('');
        line += d;
        area += `${d}L${run[run.length - 1].x.toFixed(1)},${CP.t + plotH}L${run[0].x.toFixed(1)},${CP.t + plotH}Z`;
      }
      run = [];
    };
    const xs: number[] = [];
    const ys: (number | null)[] = [];
    for (const p of pts) {
      xs.push(x(p.at));
      ys.push(p.v === null ? null : y(p.v));
      if (p.v === null) flush();
      else run.push({ x: x(p.at), y: y(p.v) });
    }
    flush();
    const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => ({ y: y(i * step), label: String(Math.round(i * step * 10) / 10) }));
    const xTicks: { x: number; label: string }[] = [];
    const first = new Date(t0);
    first.setMinutes(0, 0, 0);
    const end = pts[pts.length - 1].at;
    for (let t = first.getTime(); t <= end; t += 3_600_000) {
      if (t < t0 || new Date(t).getHours() % 4) continue;
      xTicks.push({ x: x(t), label: this.clock(t) });
    }
    return { line, area, xs, ys, pts, yTicks, xTicks, hitW: plotW / (pts.length - 1), empty: !vals.length };
  }

  get readingRows(): { at: number; v: number | null }[] {
    const s = this.selected;
    if (!s) return [];
    const pts = series(s);
    const stepN = Math.max(1, Math.ceil(pts.length / 12));
    return pts.filter((_, i) => (pts.length - 1 - i) % stepN === 0).reverse().slice(0, 12);
  }

  get readingStats(): { min: string; max: string; avg: string } | null {
    const s = this.selected;
    if (!s) return null;
    const vals = series(s).map((p) => p.v).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min: this.fmtValue(s, Math.min(...vals)), max: this.fmtValue(s, Math.max(...vals)), avg: this.fmtValue(s, avg) };
  }

  valueClass(s: Sensor, v: number | null): string {
    if (v === null) return 'rd--none';
    return (s.high !== null && v > s.high) || (s.low !== null && v < s.low) ? 'rd--bad' : 'rd--ok';
  }

  viewDevice(s: Sensor): void {
    this.menuId = '';
    this.router.navigate(['/tracking-iot/device-health'], { queryParams: { device: s.deviceId } });
  }

  // ===== Add / edit =====

  private toIsoDate(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Linked device options for the form (GET /api/sensors/devices). */
  private loadDevices(): void {
    this.subs.add(this.api.devices('', 100).subscribe({
      next: (list) => {
        this.deviceOptions = list;
        this.version++;
        const d = this.dialog;
        if (d?.kind === 'form') this.onFormDevice(d.f, false);
      },
      error: (e: unknown) => (this.formError = apiErrorMessage(e, 'Could not load devices.')),
    }));
  }

  /** Measurement point suggestions for the form's type (GET /api/sensors/measurement-points). */
  private loadPoints(type: SensorType): void {
    this.pointOptions = POINTS_BY_TYPE[type] ?? [];
    if (!type) return;
    this.subs.add(this.api.measurementPoints(type).subscribe({ next: (p) => (this.pointOptions = p), error: () => undefined }));
  }

  openAdd(): void {
    this.menuId = '';
    this.formError = '';
    this.channelHint = '';
    const type: SensorType = '';
    this.dialog = {
      kind: 'form',
      f: { editId: '', type, number: type ? String(nextNumber(type)) : '', serial: '', deviceId: '', channel: 1, asset: '', point: '', site: '', intervalSec: null, low: null, high: null, calDue: this.toIsoDate(NOW + 365 * DAY) },
    };
    this.loadDevices();
    this.loadPoints(type);
  }

  openEdit(s: Sensor): void {
    this.menuId = '';
    this.formError = '';
    this.channelHint = '';
    this.dialog = {
      kind: 'form',
      f: { editId: s.id, type: s.type, number: s.number || s.id, serial: s.serial, deviceId: s.deviceId, channel: s.channel, asset: s.assetName, point: s.point, site: s.site, intervalSec: s.intervalSec, low: s.low, high: s.high, calDue: s.calDue !== null ? this.toIsoDate(s.calDue) : '' },
    };
    this.loadDevices();
    this.loadPoints(s.type);
  }

  onFormType(f: SensorForm): void {
    if (!f.editId) f.number = String(nextNumber(f.type));
    this.loadPoints(f.type);
  }

  formPreview(f: SensorForm): string {
    return f.editId || (f.number.trim() ? sensorIdOf(f.type, f.number.trim()) : '—');
  }

  private deviceOption(id: string): SensorDeviceOptionDto | undefined {
    const key = id.trim().toUpperCase();
    return key ? this.deviceOptions.find((d) => d.deviceId.toUpperCase() === key) : undefined;
  }

  /** Linked device changed: suggest the next free channel and fill asset / site from the device when empty. */
  onFormDevice(f: SensorForm, fromInput = true): void {
    const id = f.deviceId.trim();
    this.channelHint = '';
    if (!id) return;
    const known = this.deviceOption(id);
    const apply = (used: number[], next: number) => {
      const editing = f.editId ? SENSORS.find((s) => s.id === f.editId) : undefined;
      const usedByOthers = used.filter((c) => !(editing && editing.deviceId.toUpperCase() === id.toUpperCase() && editing.channel === c));
      this.channelHint = usedByOthers.length ? `Channels in use: ${usedByOthers.join(', ')}` : 'No channels in use on this device';
      if (fromInput && !f.editId) f.channel = next;
    };
    if (known) {
      apply(known.usedChannels, known.nextChannel);
      if (fromInput && !f.asset.trim() && known.assetName) f.asset = known.assetName;
      if (fromInput && !f.site && known.siteName) f.site = known.siteName;
      return;
    }
    if (!fromInput) return;
    this.subs.add(this.api.channels(id).subscribe({
      next: (c) => { if (this.dialog?.kind === 'form' && this.dialog.f === f) apply(c.usedChannels, c.nextChannel); },
      error: (e: unknown) => { if (this.dialog?.kind === 'form' && this.dialog.f === f) this.channelHint = apiErrorMessage(e, `Device ${id} was not found.`); },
    }));
  }

  /** Asset ids for a typed asset name: from the linked device or another sensor on the same asset. */
  private resolveAsset(name: string, deviceId: string): { assetRegistrationId: string | null; assetCode: string | null; assetName: string } {
    const n = name.trim();
    const dev = this.deviceOption(deviceId);
    if (dev?.assetName && dev.assetName.toLowerCase() === n.toLowerCase()) return { assetRegistrationId: dev.assetRegistrationId, assetCode: dev.assetCode, assetName: dev.assetName };
    const known = SENSORS.find((s) => s.assetName.toLowerCase() === n.toLowerCase());
    if (known) return { assetRegistrationId: known.assetRegId || null, assetCode: known.assetId || null, assetName: known.assetName };
    const other = this.deviceOptions.find((d) => (d.assetName ?? '').toLowerCase() === n.toLowerCase());
    if (other) return { assetRegistrationId: other.assetRegistrationId, assetCode: other.assetCode, assetName: n };
    return { assetRegistrationId: null, assetCode: null, assetName: n };
  }

  private siteIdOf(name: string): string | null {
    if (!name) return null;
    return SENSORS.find((s) => s.site === name && s.siteId)?.siteId || this.deviceOptions.find((d) => d.siteName === name && d.siteId)?.siteId || null;
  }

  /** Request body for a sensor (edit keeps the fields the form does not show). */
  private bodyOf(f: SensorForm, existing?: Sensor): SensorBody {
    const deviceId = f.deviceId.trim().toUpperCase();
    const sameDevice = !!existing && existing.deviceId.toUpperCase() === deviceId;
    const sameType = !!existing && existing.type === f.type;
    const known = this.deviceOption(deviceId);
    return {
      sensorId: existing ? existing.id : null,
      sensorNumber: existing ? existing.number || null : f.number.trim(),
      serialNumber: f.serial.trim(),
      name: existing ? existing.name || null : null,
      sensorType: f.type,
      measuredParameter: sameType ? existing!.param.name || null : null,
      unit: sameType ? existing!.param.unit || null : null,
      deviceId: known?.deviceId ?? deviceId,
      deviceModel: sameDevice ? existing!.deviceModel || null : known?.model ?? null,
      channel: numOrNull(f.channel),
      samplingIntervalSeconds: numOrNull(f.intervalSec),
      lowAlarm: numOrNull(f.low),
      highAlarm: numOrNull(f.high),
      siteId: f.site ? (existing && existing.site === f.site ? existing.siteId || this.siteIdOf(f.site) : this.siteIdOf(f.site)) : null,
      siteName: f.site || null,
      ...this.resolveAsset(f.asset, deviceId),
      measurementPoint: f.point.trim(),
      liveReading: existing ? existing.reading : null,
      calibrationDueDate: f.calDue,
      status: existing ? existing.status : null,
    };
  }

  saveForm(): void {
    const d = this.dialog;
    if (d?.kind !== 'form' || this.saving) return;
    const f = d.f;
    const existing = f.editId ? SENSORS.find((x) => x.id === f.editId) : undefined;
    if (f.editId && !existing) return void (this.formError = `${f.editId} no longer exists. Reload the page.`);
    if (!f.type) return void (this.formError = 'Choose the sensor type.');
    if (!f.editId && !f.number.trim()) return void (this.formError = 'Enter a sensor number.');
    const id = f.editId || sensorIdOf(f.type, f.number.trim());
    if (!f.editId && SENSORS.some((s) => s.id.toLowerCase() === id.toLowerCase())) return void (this.formError = `${id} already exists.`);
    if (!f.serial.trim()) return void (this.formError = 'Enter the serial number.');
    if (SENSORS.some((s) => s.serial.toLowerCase() === f.serial.trim().toLowerCase() && s.id !== f.editId)) return void (this.formError = 'Another sensor already uses this serial number.');
    if (!f.deviceId.trim()) return void (this.formError = 'Enter the linked device ID.');
    const channel = numOrNull(f.channel);
    if (channel !== null && !(Number.isInteger(channel) && channel >= 1)) return void (this.formError = 'Channel must be 1 or more.');
    const clash = channel === null ? undefined : SENSORS.find((s) => s.deviceId.toUpperCase() === f.deviceId.trim().toUpperCase() && s.channel === channel && s.id !== f.editId);
    if (clash) return void (this.formError = `${f.deviceId.toUpperCase()} channel ${channel} is already mapped to ${clash.id}.`);
    if (!f.asset.trim() || !f.point.trim()) return void (this.formError = 'Choose the asset and the measurement point.');
    const low = numOrNull(f.low);
    const high = numOrNull(f.high);
    if (low !== null && high !== null && !(low < high)) return void (this.formError = 'The low threshold must be below the high threshold.');
    if (!f.calDue) return void (this.formError = 'Set the calibration due date.');

    const body = this.bodyOf(f, existing);
    const moved = !!existing && (existing.deviceId.toUpperCase() !== body.deviceId.toUpperCase() || existing.channel !== body.channel || existing.assetName !== body.assetName || existing.point !== body.measurementPoint);
    this.saving = true;
    this.formError = '';
    const call = existing ? this.api.update(existing.id, body) : this.api.create(body);
    this.subs.add(call.subscribe({
      next: (dto) => {
        this.saving = false;
        const s = this.replace(dto.sensorId, dto);
        if (existing) {
          s.events.unshift({ at: Date.now(), text: moved ? `Mapping changed to ${s.deviceId} ch ${s.channel ?? '—'} → ${s.assetName} · ${s.point}` : 'Configuration updated', by: this.api.userName() ?? '—', level: 'info' });
          this.showToast(`${s.id} updated.`);
        } else {
          this.clearFilters();
          this.showToast(`${s.id} added.${s.reading === null ? ' It shows "No data" until the device sends its first reading.' : ''}`);
        }
        this.dialog = null;
        if (this.selectedId !== s.id) this.select(s);
      },
      error: (e: unknown) => {
        this.saving = false;
        this.formError = apiErrorMessage(e, existing ? `Could not update ${existing.id}.` : 'Could not add the sensor.');
      },
    }));
  }

  // ===== Delete =====

  deleteSensor(s: Sensor): void {
    this.menuId = '';
    if (!confirm(`Delete ${s.id}? This removes the sensor and its mapping.`)) return;
    this.subs.add(this.api.remove(s.id).subscribe({
      next: () => {
        const i = SENSORS.findIndex((x) => x.id === s.id);
        if (i >= 0) SENSORS.splice(i, 1);
        this.checked.delete(s.id);
        if (this.selectedId === s.id) this.selectedId = null;
        this.version++;
        this.showToast(`${s.id} deleted.`);
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e, `Could not delete ${s.id}.`)),
    }));
  }

  // ===== Calibrate =====

  openCalibrate(s: Sensor): void {
    this.menuId = '';
    this.formError = '';
    const year = new Date(NOW).getFullYear();
    this.dialog = { kind: 'calibrate', f: { id: s.id, date: this.toIsoDate(Date.now()), certificate: `CAL-${s.id}-${year}.pdf`, result: '', note: '' } };
  }

  calTarget(f: CalForm): Sensor | undefined {
    return SENSORS.find((s) => s.id === f.id);
  }

  /** Saves the next due date (calibration date + 1 year) through PUT /api/sensors/{id}. */
  saveCalibrate(): void {
    const d = this.dialog;
    if (d?.kind !== 'calibrate' || this.saving) return;
    const f = d.f;
    const s = this.calTarget(f);
    if (!s) return;
    if (!f.date) return void (this.formError = 'Enter the calibration date.');
    if (!f.result) return void (this.formError = 'Choose the calibration result.');
    const at = new Date(f.date + 'T09:00').getTime();
    if (at > Date.now() + DAY) return void (this.formError = 'The calibration date cannot be in the future.');
    if (!f.certificate.trim()) return void (this.formError = 'Enter the certificate reference.');
    const next = new Date(at);
    next.setFullYear(next.getFullYear() + 1);
    const form: SensorForm = {
      editId: s.id, type: s.type, number: s.number, serial: s.serial, deviceId: s.deviceId, channel: s.channel, asset: s.assetName, point: s.point,
      site: s.site, intervalSec: s.intervalSec, low: s.low, high: s.high, calDue: this.toIsoDate(next.getTime()),
    };
    const body = this.bodyOf(form, s);
    body.assetRegistrationId = s.assetRegId || null;
    body.assetCode = s.assetId || null;
    body.assetName = s.assetName || null;
    this.saving = true;
    this.formError = '';
    this.subs.add(this.api.update(s.id, body).subscribe({
      next: (dto) => {
        this.saving = false;
        const fresh = this.replace(s.id, dto);
        fresh.lastCal = at;
        fresh.certificate = f.certificate.trim();
        fresh.events.unshift({ at: Date.now(), text: `Calibrated (${f.result})${f.note.trim() ? ': ' + f.note.trim() : ''} · certificate ${fresh.certificate} · next due ${this.fmtDate(fresh.calDue)}`, by: this.api.userName() ?? '—', level: 'ok' });
        this.dialog = null;
        this.showToast(`${s.id} calibrated. Next calibration due ${this.fmtDate(fresh.calDue)}.`);
      },
      error: (e: unknown) => {
        this.saving = false;
        this.formError = apiErrorMessage(e, `Could not save the calibration for ${s.id}.`);
      },
    }));
  }

  // ===== Import / export =====

  openImport(): void {
    this.menuId = '';
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
  }

  downloadTemplate(): void {
    const header = ['Type', 'Sensor Number', 'Serial Number', 'Device ID', 'Channel', 'Asset', 'Point', 'Site', 'Calibration Due'];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([], { header }), 'Sensors');
    XLSX.writeFile(book, 'Sensor_Import_Template.xlsx');
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const d = this.dialog;
    if (!file || d?.kind !== 'import') return;
    d.fileName = file.name;
    d.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const book = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
        d.rows = this.validate(raw);
        if (!d.rows.length) d.error = 'The file has no rows.';
      } catch {
        d.error = 'This file could not be read. Use the Excel or CSV template.';
        d.rows = [];
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private dateCell(v: unknown): string {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return this.toIsoDate(v.getTime());
    const s = String(v ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = s ? new Date(s).getTime() : NaN;
    return Number.isNaN(t) ? '' : this.toIsoDate(t);
  }

  private validate(raw: Record<string, unknown>[]): ImportRow[] {
    const ids = new Set(SENSORS.map((s) => s.id.toLowerCase()));
    const serials = new Set(SENSORS.map((s) => s.serial.toLowerCase()));
    const channels = new Set(SENSORS.map((s) => `${s.deviceId.toUpperCase()}#${s.channel}`));
    const types = this.types;
    const key = (r: Record<string, unknown>, ...keys: string[]) => Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = key(r, ...keys);
      return k ? String(r[k]).trim() : '';
    };
    return raw.map((r, i) => {
      const typeText = get(r, 'type', 'sensor type');
      const t = typeText.toLowerCase();
      const type = types.find((x) => x.toLowerCase() === t) ?? PARAMETERS.find((p) => p.name.toLowerCase() === t || p.type.toLowerCase().startsWith(t))?.type ?? null;
      const number = get(r, 'sensor number', 'number');
      const id = type && number ? sensorIdOf(type, number) : '';
      const serial = get(r, 'serial number', 'serial');
      const deviceId = get(r, 'device id', 'device').toUpperCase();
      const channel = Number(get(r, 'channel')) || 1;
      const site = get(r, 'site');
      const asset = get(r, 'asset');
      const point = get(r, 'point', 'measurement point');
      const calKey = key(r, 'calibration due', 'calibration due date');
      const calDue = calKey ? this.dateCell(r[calKey]) : '';
      let error = '';
      if (!type) error = typeText ? `Unknown type "${typeText}"` : 'Type missing';
      else if (!number) error = 'Sensor number missing';
      else if (ids.has(id.toLowerCase())) error = `${id} already exists`;
      else if (!serial) error = 'Serial number missing';
      else if (serials.has(serial.toLowerCase())) error = 'Serial number already used';
      else if (!deviceId) error = 'Device ID missing';
      else if (channels.has(`${deviceId}#${channel}`)) error = `${deviceId} ch ${channel} already mapped`;
      else if (!asset || !point) error = 'Asset or point missing';
      else if (!calDue) error = 'Calibration due date missing';
      if (!error) {
        ids.add(id.toLowerCase());
        serials.add(serial.toLowerCase());
        channels.add(`${deviceId}#${channel}`);
      }
      return { line: i + 2, type, number, id, serial, deviceId, channel, asset, point, site, calDue, error };
    });
  }

  get importValid(): number {
    const d = this.dialog;
    return d?.kind === 'import' ? d.rows.filter((r) => !r.error).length : 0;
  }

  /** Posts each valid row in turn; rows the API rejects are reported with its message. */
  saveImport(): void {
    const d = this.dialog;
    if (d?.kind !== 'import' || this.saving) return;
    const ok = d.rows.filter((r) => !r.error && r.type);
    if (!ok.length) return;
    this.saving = true;
    this.subs.add(from(ok).pipe(
      concatMap((r) => {
        const f: SensorForm = { editId: '', type: r.type!, number: r.number, serial: r.serial, deviceId: r.deviceId, channel: r.channel, asset: r.asset, point: r.point, site: r.site, intervalSec: null, low: null, high: null, calDue: r.calDue };
        return this.api.create(this.bodyOf(f)).pipe(
          map((dto) => ({ r, dto, err: '' })),
          catchError((e: unknown) => of({ r, dto: null, err: apiErrorMessage(e, 'Rejected by the server') })),
        );
      }),
      toArray(),
    ).subscribe((results) => {
      this.saving = false;
      let added = 0;
      for (const x of results) {
        if (x.dto) {
          this.replace(x.dto.sensorId, x.dto);
          added++;
        } else x.r.error = x.err;
      }
      const failed = results.length - added;
      const skipped = d.rows.length - ok.length;
      this.clearFilters();
      this.showToast(`${added} sensor${added === 1 ? '' : 's'} imported${failed ? `, ${failed} rejected` : ''}${skipped ? `, ${skipped} skipped` : ''}.`);
      if (!failed) this.dialog = null;
      else d.error = `${failed} row${failed === 1 ? '' : 's'} could not be imported — see the Result column.`;
    }));
  }

  /** Exports the ticked sensors, or the filtered list when nothing is ticked. */
  exportRows(): void {
    const list = this.checked.size ? SENSORS.filter((s) => this.checked.has(s.id)) : this.list;
    const rows = list.map((s) => ({
      'Sensor ID': s.id, 'Sensor Type': s.type, Parameter: s.param.label, Unit: s.param.unit, 'Linked Device': s.deviceId, Channel: s.channel ?? '',
      Asset: s.assetName, Point: s.point, Site: s.site, 'Live Reading': s.reading ?? '', Status: s.status, 'Calibration Due': s.calDue !== null ? this.fmtDate(s.calDue) : '',
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Sensors');
    XLSX.writeFile(book, 'Sensors.xlsx');
  }

  // ===== Menus =====

  toggleMenu(id: string, e: Event): void {
    e.stopPropagation();
    this.menuId = this.menuId === id ? '' : id;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    if (this.dialog) this.dialog = null;
    else if (window.innerWidth < 1200) this.selectedId = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }

  /** Narrow a dialog for the template (strict templates cannot narrow a union on their own). */
  dlg<K extends Dialog['kind']>(kind: K): Extract<Dialog, { kind: K }> | null {
    return this.dialog?.kind === kind ? (this.dialog as Extract<Dialog, { kind: K }>) : null;
  }
}
