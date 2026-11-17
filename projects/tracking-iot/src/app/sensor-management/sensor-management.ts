import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
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
  Search,
  Settings,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Upload,
  Waves,
  Wrench,
  X,
  Zap,
} from 'lucide-angular';
import {
  ASSET_KINDS, CAL_WINDOW_DAYS, NOW, PARAMETERS, Parameter, SENSORS, SITES, STATUSES, Sensor, SensorEvent, SensorStatus, SensorType, TYPES,
  daysUntil, historyOf, isCalDue, isOverdue, nextNumber, paramOf, sensorIdOf, series,
} from './sensor-data';

type Tab = 'sensors' | 'params' | 'calibration' | 'mapping';
type PanelTab = 'overview' | 'readings' | 'configuration' | 'history';

interface SensorForm {
  editId: string;
  type: SensorType;
  number: string;
  serial: string;
  deviceId: string;
  channel: number;
  asset: string;
  point: string;
  site: string;
  intervalSec: number;
  low: number;
  high: number;
  calDue: string;
}

interface CalForm { id: string; date: string; certificate: string; result: 'Pass' | 'Adjusted'; note: string }

interface ImportRow { line: number; type: SensorType | null; id: string; serial: string; deviceId: string; channel: number; asset: string; point: string; site: string; error: string }

type Dialog =
  | { kind: 'form'; f: SensorForm }
  | { kind: 'calibrate'; f: CalForm }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string };

const DAY = 86_400_000;
const CURRENT_USER = 'John Doe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_ICONS: Record<SensorType, typeof Radio> = {
  'Temperature Probe': Thermometer, 'Vibration Sensor': Activity, 'Humidity Sensor': Droplets, 'Pressure Transmitter': Gauge, 'Current Sensor': Zap, 'Level Sensor': Waves,
};
const TYPE_ALIASES: Record<string, SensorType> = {
  temperature: 'Temperature Probe', 'temperature probe': 'Temperature Probe', vibration: 'Vibration Sensor', 'vibration sensor': 'Vibration Sensor',
  humidity: 'Humidity Sensor', 'humidity sensor': 'Humidity Sensor', pressure: 'Pressure Transmitter', 'pressure transmitter': 'Pressure Transmitter',
  current: 'Current Sensor', 'current sensor': 'Current Sensor', level: 'Level Sensor', 'level sensor': 'Level Sensor',
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

@Component({
  selector: 'app-sensor-management',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './sensor-management.html',
  styleUrls: ['./sensor-management.css', './sensor-management-table.css', './sensor-management-panel.css'],
})
export class SensorManagement implements OnDestroy {
  readonly icons = {
    ArrowRight, Building2, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Cpu, Download, Ellipsis, EllipsisVertical, ExternalLink,
    FileText, Gauge, Info, Network, Pencil, Plus, Radio, Search, Settings, SlidersHorizontal, TriangleAlert, Upload, Wrench, X,
  };
  readonly types = TYPES;
  readonly kinds = ASSET_KINDS;
  readonly sites = SITES;
  readonly statuses = STATUSES;
  readonly parameters = PARAMETERS;
  readonly pageSizes = [10, 25, 50];
  readonly cw = CW;
  readonly ch = CH;
  readonly cp = CP;
  readonly calWindow = CAL_WINDOW_DAYS;
  readonly now = NOW;

  tab: Tab = 'sensors';
  search = '';
  typeFilter: SensorType | '' = '';
  kindFilter = '';
  siteFilter = '';
  statusFilter: SensorStatus | '' = '';
  pageSize = 10;
  page = 0;
  checked = new Set<string>();

  /** Wide screens open with a sensor selected; narrower ones keep the drawer closed until a row is clicked. */
  selectedId: string | null = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'SEN-T-80214' : null;
  panelTab: PanelTab = 'overview';
  menuId = '';
  dialog: Dialog | null = null;
  formError = '';
  toast = '';
  hoverPt: number | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private version = 0;

  constructor(private router: Router) {}

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
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

  /** Sensors matching the filters (featured design rows first, then the most recently changed). */
  get filtered(): Sensor[] {
    const key = JSON.stringify([this.search, this.typeFilter, this.kindFilter, this.siteFilter, this.statusFilter, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    this.cacheRows = SENSORS.filter((s) =>
      (!this.typeFilter || s.type === this.typeFilter) && (!this.kindFilter || s.assetKind === this.kindFilter) &&
      (!this.siteFilter || s.site === this.siteFilter) && (!this.statusFilter || s.status === this.statusFilter) &&
      (!q || `${s.id} ${s.type} ${s.param.label} ${s.deviceId} ${s.assetName} ${s.point} ${s.serial}`.toLowerCase().includes(q)));
    this.cacheKey = key;
    return this.cacheRows;
  }

  get hasFilters(): boolean {
    return !!(this.search || this.typeFilter || this.kindFilter || this.siteFilter || this.statusFilter);
  }

  /** Rows for the active tab before paging. */
  get list(): Sensor[] {
    if (this.tab !== 'calibration') return this.filtered;
    return this.filtered.filter((s) => isCalDue(s)).sort((a, b) => a.calDue - b.calDue);
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
      const list = SENSORS.filter((s) => s.param === p);
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
    return TYPE_ICONS[s.type];
  }

  /** "Temperature Probe" → two lines in the table. */
  typeWords(s: Sensor): string {
    return s.type;
  }

  fmtValue(s: Sensor, v: number | null): string {
    if (v === null) return s.status === 'Maintenance' ? '—' : 'No data';
    const u = s.param.unit;
    const n = v.toFixed(s.param.decimals);
    return u === '%RH' || u === '%' ? `${n}%` : `${n} ${u}`;
  }

  readingClass(s: Sensor): string {
    const v = s.reading;
    if (v === null) return 'rd--none';
    if (v > s.high || v < s.low) return 'rd--bad';
    const margin = (s.high - s.low) * 0.08;
    return v > s.high - margin || v < s.low + margin ? 'rd--warn' : 'rd--ok';
  }

  statusClass(s: Sensor): string {
    return 'ps--' + s.status.toLowerCase();
  }

  overdue(s: Sensor): boolean {
    return isOverdue(s);
  }

  calState(s: Sensor): { text: string; cls: string } {
    const d = daysUntil(s.calDue);
    if (d < 0) return { text: `Overdue ${-d} day${d === -1 ? '' : 's'}`, cls: 'cs--bad' };
    if (d <= 7) return { text: d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'cs--warn' };
    return { text: `Due in ${d} days`, cls: 'cs--soon' };
  }

  fmtDate(ms: number): string {
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

  rangeText(s: Sensor): string {
    const [a, b] = s.param.range;
    const u = s.param.unit;
    return `${a} – ${b} ${u}`;
  }

  intervalText(sec: number): string {
    return sec < 60 ? `${sec} seconds` : sec === 60 ? '60 seconds' : `${sec / 60} minutes`;
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

  select(s: Sensor): void {
    this.selectedId = s.id;
    this.panelTab = 'overview';
    this.menuId = '';
    this.hoverPt = null;
  }

  history(s: Sensor): SensorEvent[] {
    return historyOf(s);
  }

  calCountdown(s: Sensor): string {
    const d = daysUntil(s.calDue);
    return d < 0 ? `(${-d} days overdue)` : d === 0 ? '(today)' : `(in ${d} days)`;
  }

  private chartCache: { key: string; v: ReturnType<SensorManagement['buildChart']> } | null = null;

  get chart() {
    const s = this.selected;
    if (!s) return null;
    const key = `${s.id}|${s.reading}|${s.status}|${this.version}`;
    if (this.chartCache?.key !== key) this.chartCache = { key, v: this.buildChart(s) };
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
    const span = pts[pts.length - 1].at - t0;
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
    for (let t = first.getTime(); t <= NOW; t += 3_600_000) {
      if (t < t0 || new Date(t).getHours() % 4) continue;
      xTicks.push({ x: x(t), label: this.clock(t) });
    }
    return { line, area, xs, ys, pts, yTicks, xTicks, hitW: plotW / (pts.length - 1), empty: !vals.length };
  }

  get readingRows(): { at: number; v: number | null }[] {
    const s = this.selected;
    if (!s) return [];
    const pts = series(s);
    return pts.filter((_, i) => (pts.length - 1 - i) % 4 === 0).reverse().slice(0, 12);
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
    return v > s.high || v < s.low ? 'rd--bad' : 'rd--ok';
  }

  viewDevice(s: Sensor): void {
    this.menuId = '';
    this.router.navigate(['/tracking-iot/device-health'], { queryParams: { device: s.deviceId } });
  }

  downloadCertificate(s: Sensor): void {
    const text = [
      'CALIBRATION CERTIFICATE (demo)', `Certificate: ${s.certificate}`, `Sensor: ${s.id} (${s.type})`, `Make / Model: ${s.param.make} / ${s.param.model}`,
      `Serial: ${s.serial}`, `Calibrated: ${this.fmtDate(s.lastCal)}`, `Next due: ${this.fmtDate(s.calDue)}`, `Accuracy: ${s.param.accuracy}`,
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = s.certificate.replace('.pdf', '.txt');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== Add / edit =====

  private toIsoDate(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  openAdd(): void {
    this.menuId = '';
    this.formError = '';
    const type: SensorType = 'Temperature Probe';
    this.dialog = { kind: 'form', f: { editId: '', type, number: String(nextNumber(type)), serial: '', deviceId: '', channel: 1, asset: '', point: '', site: SITES[0], intervalSec: 60, low: 0, high: 10, calDue: this.toIsoDate(NOW + 365 * DAY) } };
  }

  openEdit(s: Sensor): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'form', f: { editId: s.id, type: s.type, number: s.id.split('-')[2], serial: s.serial, deviceId: s.deviceId, channel: s.channel, asset: s.assetName, point: s.point, site: s.site, intervalSec: s.intervalSec, low: s.low, high: s.high, calDue: this.toIsoDate(s.calDue) } };
  }

  onFormType(f: SensorForm): void {
    if (!f.editId) f.number = String(nextNumber(f.type));
  }

  formPreview(f: SensorForm): string {
    return sensorIdOf(f.type, Number(f.number) || 0);
  }

  private cacheAssets: { version: number; list: string[] } = { version: -1, list: [] };

  get assetOptions(): string[] {
    if (this.cacheAssets.version !== this.version) this.cacheAssets = { version: this.version, list: [...new Set(SENSORS.map((s) => s.assetName))].sort() };
    return this.cacheAssets.list;
  }

  private resolveAsset(name: string): { assetId: string; assetName: string; assetKind: string } {
    const known = SENSORS.find((s) => s.assetName.toLowerCase() === name.trim().toLowerCase());
    if (known) return { assetId: known.assetId, assetName: known.assetName, assetKind: known.assetKind };
    const parts = name.trim().split(/\s+/);
    const code = parts.length > 1 ? parts.pop()! : parts[0];
    return { assetId: code.toUpperCase(), assetName: name.trim(), assetKind: parts.join(' ') || 'Asset' };
  }

  saveForm(): void {
    const d = this.dialog;
    if (d?.kind !== 'form') return;
    const f = d.f;
    const n = Number(f.number);
    const id = f.editId || sensorIdOf(f.type, n);
    if (!f.editId && (!Number.isInteger(n) || n <= 0)) return void (this.formError = 'Enter a sensor number.');
    if (!f.editId && SENSORS.some((s) => s.id === id)) return void (this.formError = `${id} already exists.`);
    if (!f.serial.trim()) return void (this.formError = 'Enter the serial number.');
    if (SENSORS.some((s) => s.serial === f.serial.trim() && s.id !== f.editId)) return void (this.formError = 'Another sensor already uses this serial number.');
    if (!f.deviceId.trim()) return void (this.formError = 'Enter the linked device ID.');
    if (!(f.channel >= 1 && f.channel <= 16)) return void (this.formError = 'Channel must be between 1 and 16.');
    const clash = SENSORS.find((s) => s.deviceId.toUpperCase() === f.deviceId.trim().toUpperCase() && s.channel === f.channel && s.id !== f.editId);
    if (clash) return void (this.formError = `${f.deviceId.toUpperCase()} channel ${f.channel} is already mapped to ${clash.id}.`);
    if (!f.asset.trim() || !f.point.trim()) return void (this.formError = 'Choose the asset and the measurement point.');
    if (!(Number(f.low) < Number(f.high))) return void (this.formError = 'The low threshold must be below the high threshold.');
    if (!f.calDue) return void (this.formError = 'Set the calibration due date.');
    const asset = this.resolveAsset(f.asset);
    const p = paramOf(f.type);
    const calDue = new Date(f.calDue + 'T09:00').getTime();
    if (f.editId) {
      const s = SENSORS.find((x) => x.id === f.editId);
      if (!s) return;
      const moved = s.deviceId !== f.deviceId.trim().toUpperCase() || s.channel !== f.channel || s.assetName !== asset.assetName || s.point !== f.point.trim();
      Object.assign(s, { serial: f.serial.trim(), deviceId: f.deviceId.trim().toUpperCase(), channel: f.channel, ...asset, point: f.point.trim(), site: f.site, intervalSec: Number(f.intervalSec), low: Number(f.low), high: Number(f.high), calDue });
      s.events.unshift({ at: Date.now(), text: moved ? `Mapping changed to ${s.deviceId} ch ${s.channel} → ${s.assetName} · ${s.point}` : 'Configuration updated', by: CURRENT_USER, level: 'info' });
      this.showToast(`${s.id} updated.`);
    } else {
      const s: Sensor = {
        id, type: f.type, param: p, serial: f.serial.trim(), deviceId: f.deviceId.trim().toUpperCase(), deviceModel: p.deviceModel, channel: f.channel,
        ...asset, point: f.point.trim(), site: f.site, intervalSec: Number(f.intervalSec), low: Number(f.low), high: Number(f.high), reading: null,
        status: 'Offline', lastSeenMin: 0, installedOn: Date.now(), lastCal: calDue - 365 * DAY, calDue, certificate: `CAL-${id}-${new Date(calDue - 365 * DAY).getFullYear()}.pdf`,
        seed: n, events: [{ at: Date.now(), text: 'Registered — waiting for first reading', by: CURRENT_USER, level: 'info' }],
      };
      SENSORS.unshift(s);
      this.clearFilters();
      this.showToast(`${id} added. It shows "No data" until the device sends its first reading.`);
    }
    this.selectedId = id;
    this.version++;
    this.dialog = null;
  }

  // ===== Calibrate =====

  openCalibrate(s: Sensor): void {
    this.menuId = '';
    this.formError = '';
    const year = new Date(NOW).getFullYear();
    this.dialog = { kind: 'calibrate', f: { id: s.id, date: this.toIsoDate(NOW), certificate: `CAL-${s.id}-${year}.pdf`, result: 'Pass', note: '' } };
  }

  calTarget(f: CalForm): Sensor | undefined {
    return SENSORS.find((s) => s.id === f.id);
  }

  saveCalibrate(): void {
    const d = this.dialog;
    if (d?.kind !== 'calibrate') return;
    const f = d.f;
    const s = this.calTarget(f);
    if (!s) return;
    if (!f.date) return void (this.formError = 'Enter the calibration date.');
    const at = new Date(f.date + 'T09:00').getTime();
    if (at > NOW + DAY) return void (this.formError = 'The calibration date cannot be in the future.');
    if (!f.certificate.trim()) return void (this.formError = 'Enter the certificate reference.');
    s.lastCal = at;
    s.calDue = at + 365 * DAY;
    s.certificate = f.certificate.trim();
    if (s.status === 'Attention' && s.reading !== null && s.reading <= s.high && s.reading >= s.low) s.status = 'Active';
    s.events.unshift({ at: Date.now(), text: `Calibrated (${f.result})${f.note.trim() ? ': ' + f.note.trim() : ''} · next due ${this.fmtDate(s.calDue)}`, by: CURRENT_USER, level: 'ok' });
    this.version++;
    this.dialog = null;
    this.showToast(`${s.id} calibrated. Next calibration due ${this.fmtDate(s.calDue)}.`);
  }

  // ===== Import / export =====

  openImport(): void {
    this.menuId = '';
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
  }

  downloadTemplate(): void {
    const sample = [
      { Type: 'Temperature Probe', 'Sensor Number': nextNumber('Temperature Probe'), 'Serial Number': 'TS300-90001-0001', 'Device ID': 'TS-90001', Channel: 1, Asset: 'Cold Room CR-03', Point: 'Return Air', Site: 'Dubai Plant' },
      { Type: 'Pressure Transmitter', 'Sensor Number': nextNumber('Pressure Transmitter'), 'Serial Number': 'PT16-90002-0001', 'Device ID': 'IO-GW-14', Channel: 8, Asset: 'Compressor CMP-014', Point: 'Suction', Site: 'Sharjah Warehouse' },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sample), 'Sensors');
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
        const book = XLSX.read(reader.result, { type: 'array' });
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

  private validate(raw: Record<string, unknown>[]): ImportRow[] {
    const ids = new Set(SENSORS.map((s) => s.id));
    const serials = new Set(SENSORS.map((s) => s.serial));
    const channels = new Set(SENSORS.map((s) => `${s.deviceId}#${s.channel}`));
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
      return k ? String(r[k]).trim() : '';
    };
    return raw.map((r, i) => {
      const typeText = get(r, 'type', 'sensor type');
      const type = TYPE_ALIASES[typeText.toLowerCase()] ?? null;
      const num = Number(get(r, 'sensor number', 'number'));
      const id = type && num > 0 ? sensorIdOf(type, num) : '';
      const serial = get(r, 'serial number', 'serial');
      const deviceId = get(r, 'device id', 'device').toUpperCase();
      const channel = Number(get(r, 'channel')) || 1;
      const site = SITES.find((s) => s.toLowerCase() === get(r, 'site').toLowerCase()) ?? '';
      const asset = get(r, 'asset');
      const point = get(r, 'point', 'measurement point');
      let error = '';
      if (!type) error = typeText ? `Unknown type "${typeText}"` : 'Type missing';
      else if (!(num > 0)) error = 'Sensor number missing';
      else if (ids.has(id)) error = `${id} already exists`;
      else if (!serial) error = 'Serial number missing';
      else if (serials.has(serial)) error = 'Serial number already used';
      else if (!deviceId) error = 'Device ID missing';
      else if (channels.has(`${deviceId}#${channel}`)) error = `${deviceId} ch ${channel} already mapped`;
      else if (!asset || !point) error = 'Asset or point missing';
      else if (!site) error = 'Unknown site';
      if (!error) {
        ids.add(id);
        serials.add(serial);
        channels.add(`${deviceId}#${channel}`);
      }
      return { line: i + 2, type, id, serial, deviceId, channel, asset, point, site, error };
    });
  }

  get importValid(): number {
    const d = this.dialog;
    return d?.kind === 'import' ? d.rows.filter((r) => !r.error).length : 0;
  }

  saveImport(): void {
    const d = this.dialog;
    if (d?.kind !== 'import') return;
    const ok = d.rows.filter((r) => !r.error && r.type);
    for (const r of ok) {
      const p = paramOf(r.type!);
      const calDue = NOW + 365 * DAY;
      SENSORS.unshift({
        id: r.id, type: r.type!, param: p, serial: r.serial, deviceId: r.deviceId, deviceModel: p.deviceModel, channel: r.channel, ...this.resolveAsset(r.asset),
        point: r.point, site: r.site, intervalSec: 60, low: p.range[0], high: p.range[1], reading: null, status: 'Offline', lastSeenMin: 0, installedOn: Date.now(),
        lastCal: NOW, calDue, certificate: `CAL-${r.id}-${new Date(NOW).getFullYear()}.pdf`, seed: Number(r.id.split('-')[2]) || 1,
        events: [{ at: Date.now(), text: 'Imported — waiting for first reading', by: CURRENT_USER, level: 'info' }],
      });
    }
    const skipped = d.rows.length - ok.length;
    this.version++;
    this.dialog = null;
    this.clearFilters();
    this.showToast(`${ok.length} sensor${ok.length === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped` : ''}.`);
  }

  /** Exports the ticked sensors, or the filtered list when nothing is ticked. */
  exportRows(): void {
    const list = this.checked.size ? SENSORS.filter((s) => this.checked.has(s.id)) : this.list;
    const rows = list.map((s) => ({
      'Sensor ID': s.id, 'Sensor Type': s.type, Parameter: s.param.label, Unit: s.param.unit, 'Linked Device': s.deviceId, Channel: s.channel,
      Asset: s.assetName, Point: s.point, Site: s.site, 'Live Reading': s.reading ?? '', Status: s.status, 'Last Calibrated': this.fmtDate(s.lastCal), 'Calibration Due': this.fmtDate(s.calDue),
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
