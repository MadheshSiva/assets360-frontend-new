import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, catchError, forkJoin, of } from 'rxjs';
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
  Thermometer,
  TriangleAlert,
  Wifi,
  WifiOff,
  Check,
  FileText,
  RadioTower,
  Battery,
  X,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import { IoTDeviceDto, IoTDeviceLookupService, sameModel } from '../device-configuration/iot-device-lookup.service';
import { FirmwareVersionApiService, FirmwareVersionDto } from '../firmware-connectivity/firmware-version-api.service';
import { API_CONNECTIVITY, API_HEALTH, API_POWER, ApiConnectivity, ApiHealth, ApiPowerSource, DeviceHealthApiService, DeviceHealthDto, DeviceHealthFields } from './device-health-api.service';
import { ASSIGNEES, DevEvent, Device, Level, PRIORITIES, Status, baseEvents, healthScore, isStale, signalQuality, telemetry } from './health-data';

type Range = '1h' | '24h' | '7d';
type Tab = 'overview' | 'diagnostics' | 'events' | 'configuration';
type CheckResult = 'pass' | 'warn' | 'fail';
interface DiagRun { at: number; checks: { name: string; result: CheckResult; detail: string }[] }
interface HealthForm {
  id: string;
  deviceId: string;
  deviceModel: string;
  assetRegistrationId: string;
  assetName: string;
  siteId: string;
  siteName: string;
  gateway: string;
  connectivity: ApiConnectivity | '';
  signalStrengthDbm: number | null;
  snrDb: number | null;
  powerSource: ApiPowerSource | '';
  batteryLevel: number | null;
  /** datetime-local value or ''. */
  lastSeen: string;
  health: ApiHealth | '';
}

const RANGE_MIN: Record<Range, number> = { '1h': 60, '24h': 1440, '7d': 10080 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const COLORS = { online: '#16a34a', warning: '#d97706', critical: '#dc2626', offline: '#9ca3af', maint: '#7c3aed', purple: '#6d28d9' };

/** Panel mini chart geometry. */
const MW = 300;
const MH = 112;
const MP = { l: 36, r: 8, t: 8, b: 18 };

const z2 = (n: number) => String(n).padStart(2, '0');
/** datetime-local value for an ISO timestamp. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}T${z2(d.getHours())}:${z2(d.getMinutes())}`;
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

@Component({
  selector: 'app-device-health',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-health.html',
  styleUrls: ['./device-health.css', './device-health-table.css', './device-health-panel.css', '../shared/iot-purple-theme.css'],
})
export class DeviceHealth implements OnInit, OnDestroy {
  readonly icons = { Battery, Check, FileText, RadioTower, Signal, Building, Calendar, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Cpu, Ellipsis, ExternalLink, HeartPulse, Info, LoaderCircle, MapPin, Play, Plug, Plus, Search, Settings, SlidersHorizontal, TriangleAlert, Wifi, WifiOff, X };
  readonly colors = COLORS;
  readonly assignees = ASSIGNEES;
  readonly priorities = PRIORITIES;
  readonly connectivities = API_CONNECTIVITY;
  readonly powerSources = API_POWER;
  readonly healthValues = API_HEALTH;
  readonly pageSizes = [5, 10, 25, 50];
  readonly mw = MW;
  readonly mh = MH;
  readonly mp = MP;
  readonly ranges: { key: Range; label: string }[] = [{ key: '1h', label: 'Last 1 hour' }, { key: '24h', label: 'Last 24 hours' }, { key: '7d', label: 'Last 7 days' }];

  /** Devices with a health record (GET /api/device-health). */
  devices: Device[] = [];
  /** Registered IoT devices, for the add form and device type / firmware. */
  registry: IoTDeviceDto[] = [];
  private firmware: FirmwareVersionDto[] = [];
  loading = true;
  loadError = '';
  busy = false;
  /** Reference time of the last load, for relative timestamps. */
  now = Date.now();

  // page filters
  site = '';
  range: Range | '' = '';
  // table filters
  search = '';
  statusFilter: '' | 'attention' | Status = '';
  typeFilter = '';
  lowBattery = false;
  poorSignal = false;
  staleOnly = false;
  moreOpen = false;
  page = 1;
  pageSize = 5;
  menuId = '';

  /** No device is selected until a row is clicked. */
  selectedId: string | null = null;
  tab: Tab = 'overview';

  hoverSeg: string | null = null;
  hoverBat: number | null = null;
  hoverRssi: number | null = null;

  diag: Record<string, DiagRun> = {};
  running: { id: string; step: number } | null = null;
  extraEvents: Record<string, DevEvent[]> = {};
  issueSeq = 0;
  issueForm: { title: string; priority: string; assignee: string; notes: string } | null = null;
  healthForm: HealthForm | null = null;
  formError = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);
  private readonly api = inject(DeviceHealthApiService);
  private readonly lookup = inject(IoTDeviceLookupService);
  private readonly firmwareApi = inject(FirmwareVersionApiService);

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Loading =====

  /** Health records are required; the registry and firmware inventory only enrich them. */
  load(): void {
    this.loading = true;
    this.loadError = '';
    const errors: string[] = [];
    const soft = <T>(o: Observable<T[]>, what: string) => o.pipe(catchError((e) => { errors.push(apiErrorMessage(e, `Could not load ${what}.`)); return of([] as T[]); }));
    forkJoin({ health: this.api.list(), registry: soft(this.lookup.list(), 'IoT devices'), firmware: soft(this.firmwareApi.list(), 'firmware versions') }).subscribe({
      next: ({ health, registry, firmware }) => {
        this.now = Date.now();
        this.registry = registry;
        this.firmware = firmware;
        this.devices = health.map((r) => this.toDevice(r)).sort((a, b) => a.id.localeCompare(b.id));
        this.scopeCache = null;
        this.teleCache = null;
        if (this.selectedId && !this.devices.some((d) => d.id === this.selectedId)) this.selectedId = null;
        this.loading = false;
        if (errors.length) this.showToast(errors.join(' '));
      },
      error: (e) => {
        this.loading = false;
        this.loadError = apiErrorMessage(e, 'Could not load device health.');
      },
    });
  }

  private toDevice(r: DeviceHealthDto): Device {
    const reg = this.registry.find((d) => d.deviceId === r.deviceId);
    const fw = this.firmware.find((f) => sameModel(r.deviceModel, f.deviceModel));
    const seen = r.lastSeenAt ? Date.parse(r.lastSeenAt) : NaN;
    const health = r.health ?? 'Healthy';
    const status: Status = health === 'Maintenance' || health === 'Critical' ? health : r.connectivity === 'Offline' ? 'Offline' : health === 'Attention' ? 'Warning' : 'Healthy';
    return {
      id: r.deviceId,
      model: r.deviceModel,
      type: reg?.deviceType || '—',
      asset: r.assetRegistrationId || r.assetName ? { code: r.assetRegistrationId ?? '', name: r.assetName || r.assetRegistrationId || '', kind: 'box' } : null,
      site: r.siteName || r.siteId || '—',
      gateway: r.gateway || '—',
      conn: r.connectivity,
      rssi: r.signalStrengthDbm,
      snr: r.snrDb,
      quality: r.signalQuality ?? signalQuality(r.signalStrengthDbm),
      battery: r.powerSource === 'Battery' ? r.batteryLevel : null,
      power: r.powerSource === 'External power' ? 'External' : r.powerSource,
      lastSeenMin: isNaN(seen) ? null : Math.max(0, Math.round((this.now - seen) / 60000)),
      status,
      firmware: reg?.firmwareVersion || '—',
      latestFirmware: fw?.latestVersion ?? null,
      protocol: reg?.connectivity || '—',
      api: r,
    };
  }

  get sites(): string[] {
    return [...new Set(this.devices.map((d) => d.site).filter((s) => s !== '—'))].sort();
  }

  get types(): string[] {
    return [...new Set(this.devices.map((d) => d.type).filter((t) => t !== '—'))].sort();
  }

  // ===== Scope (page filters) =====

  /** Devices at the selected site that reported inside the selected window, plus any not currently online. */
  get scoped(): Device[] {
    const key = `${this.site}|${this.range}`;
    if (this.scopeCache?.key !== key || this.scopeCache.src !== this.devices) {
      const r = this.range ? RANGE_MIN[this.range] : Infinity;
      this.scopeCache = { key, src: this.devices, rows: this.devices.filter((d) => (!this.site || d.site === this.site) && (d.lastSeenMin === null || d.lastSeenMin <= r || d.conn !== 'Online')) };
    }
    return this.scopeCache.rows;
  }
  private scopeCache: { key: string; src: Device[]; rows: Device[] } | null = null;

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

  setRange(r: Range | ''): void {
    this.range = r;
    this.onFilter();
  }

  kpi(f: '' | 'attention' | Status): void {
    this.statusFilter = this.statusFilter === f ? '' : f;
    this.onFilter();
  }

  // ===== Trend (current connectivity; the API keeps no history) =====

  get trend() {
    const rows = this.scoped;
    return {
      series: [
        { key: 'online', label: 'Online', color: COLORS.online, last: rows.filter((d) => d.conn === 'Online').length },
        { key: 'warning', label: 'Warning', color: COLORS.warning, last: rows.filter((d) => d.conn === 'Warning').length },
        { key: 'offline', label: 'Offline', color: COLORS.critical, last: rows.filter((d) => d.conn === 'Offline').length },
      ],
    };
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
      if (this.poorSignal && d.quality !== 'Poor') return false;
      if (this.staleOnly && (d.lastSeenMin === null || d.lastSeenMin <= 60)) return false;
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
    const t = `${d.type} ${d.model}`.toLowerCase();
    return t.includes('beacon') || t.includes('ble') ? Bluetooth : t.includes('temp') ? Thermometer : t.includes('vib') ? Activity : t.includes('gps') || t.includes('track') ? MapPin : t.includes('rfid') ? ScanLine : Cpu;
  }

  assetIcon(_d: Device) {
    return Package;
  }

  quality(d: Device): string {
    return d.quality ?? '—';
  }

  signalIcon(d: Device) {
    const q = d.quality;
    return q === 'Strong' ? Signal : q === 'Good' ? SignalHigh : q === 'Fair' ? SignalMedium : SignalLow;
  }

  qualityClass(d: Device): string {
    const q = d.quality;
    return q === null ? '' : q === 'Poor' ? 'c-red' : q === 'Fair' ? 'c-amber' : 'c-green';
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

  ago(min: number | null): string {
    if (min === null) return '—';
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

  timeAt(min: number | null): string {
    return min === null ? '—' : this.clock(new Date(this.now - min * 60000));
  }

  dateAt(min: number): string {
    const dt = new Date(this.now - min * 60000);
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  /** Event time: clock time today, otherwise date + time. */
  whenAt(min: number): string {
    const dt = new Date(this.now - min * 60000);
    return dt.getDate() === new Date(this.now).getDate() && min < 1440 ? this.clock(dt) : `${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${this.clock(dt)}`;
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

  // ===== Add / edit / delete health records =====

  openAdd(): void {
    this.menuId = '';
    this.formError = '';
    this.healthForm = {
      id: '', deviceId: '', deviceModel: '', assetRegistrationId: '', assetName: '', siteId: '', siteName: '', gateway: '',
      connectivity: '', signalStrengthDbm: null, snrDb: null, powerSource: '', batteryLevel: null, lastSeen: '', health: '',
    };
  }

  openEdit(d: Device): void {
    this.menuId = '';
    this.formError = '';
    const r = d.api;
    this.healthForm = {
      id: r.id, deviceId: r.deviceId, deviceModel: r.deviceModel, assetRegistrationId: r.assetRegistrationId ?? '', assetName: r.assetName ?? '',
      siteId: r.siteId ?? '', siteName: r.siteName ?? '', gateway: r.gateway ?? '', connectivity: r.connectivity, signalStrengthDbm: r.signalStrengthDbm,
      snrDb: r.snrDb, powerSource: r.powerSource, batteryLevel: r.batteryLevel, lastSeen: toLocalInput(r.lastSeenAt), health: r.health ?? 'Healthy',
    };
  }

  /** Registered devices without a health record yet (plus the one being edited). */
  get pickableDevices(): IoTDeviceDto[] {
    const taken = new Set(this.devices.map((d) => d.id));
    return this.registry.filter((d) => !taken.has(d.deviceId) || d.deviceId === this.healthForm?.deviceId);
  }

  /** Picking a registered device fills in what the registry knows about it. */
  onPickDevice(id: string): void {
    const f = this.healthForm;
    if (!f) return;
    f.deviceId = id;
    const reg = this.registry.find((d) => d.deviceId === id);
    if (!reg || f.id) return;
    f.deviceModel = reg.model;
    f.assetRegistrationId = reg.assetRegistrationId ?? '';
    f.assetName = reg.assetName ?? '';
    f.siteId = reg.siteId ?? '';
    f.siteName = reg.siteName ?? '';
    f.gateway = reg.gateway ?? '';
    if ((API_POWER as string[]).includes(reg.powerSource)) f.powerSource = reg.powerSource as ApiPowerSource;
    f.batteryLevel = reg.batteryLevel;
    f.lastSeen = toLocalInput(reg.lastSeenAt);
  }

  saveHealth(): void {
    const f = this.healthForm;
    if (!f || this.busy) return;
    if (!f.deviceId.trim()) return void (this.formError = 'Choose or enter the device ID.');
    if (!f.deviceModel.trim()) return void (this.formError = 'Enter the device model.');
    if (!f.connectivity) return void (this.formError = 'Select the connectivity.');
    if (!f.powerSource) return void (this.formError = 'Select the power source.');
    if (!f.health) return void (this.formError = 'Select the health.');
    const dbm = num(f.signalStrengthDbm);
    if (dbm !== null && (dbm < -150 || dbm > 0)) return void (this.formError = 'Signal strength must be between -150 and 0 dBm.');
    const battery = num(f.batteryLevel);
    if (f.powerSource === 'Battery' && battery === null) return void (this.formError = 'Enter the battery level for a battery-powered device.');
    if (battery !== null && (battery < 0 || battery > 100)) return void (this.formError = 'Battery level must be between 0 and 100.');
    if (f.lastSeen && new Date(f.lastSeen).getTime() > Date.now() + 5 * 60000) return void (this.formError = 'Last seen cannot be in the future.');
    const fields: DeviceHealthFields = {
      deviceId: f.deviceId, deviceModel: f.deviceModel, assetRegistrationId: f.assetRegistrationId, assetName: f.assetName, siteId: f.siteId, siteName: f.siteName,
      gateway: f.gateway, connectivity: f.connectivity, signalStrengthDbm: dbm === null ? null : Math.round(dbm), snrDb: num(f.snrDb), powerSource: f.powerSource,
      batteryLevel: battery === null ? null : Math.round(battery), lastSeenAt: f.lastSeen ? new Date(f.lastSeen).toISOString() : null, health: f.health,
    };
    this.busy = true;
    (f.id ? this.api.update(f.id, fields) : this.api.create(fields)).subscribe({
      next: (saved) => {
        this.busy = false;
        this.healthForm = null;
        this.showToast(`Health of ${saved.deviceId} ${f.id ? 'updated' : 'added'}.`);
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.formError = apiErrorMessage(e, 'Could not save the health record.');
      },
    });
  }

  deleteHealth(d: Device): void {
    this.menuId = '';
    if (this.busy || !confirm(`Delete the health record of ${d.id}? The device itself stays registered.`)) return;
    this.busy = true;
    this.api.delete(d.api.id, d.id).subscribe({
      next: () => {
        this.busy = false;
        if (this.selectedId === d.id) this.selectedId = null;
        this.showToast(`Health record of ${d.id} deleted.`);
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not delete the health record of ${d.id}.`));
      },
    });
  }

  // ===== Panel =====

  get selected(): Device | null {
    return this.selectedId ? this.devices.find((d) => d.id === this.selectedId) ?? null : null;
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
    return d.status === 'Healthy' ? COLORS.online : d.status === 'Warning' ? COLORS.warning : d.status === 'Offline' ? '#6b7280' : d.status === 'Maintenance' ? COLORS.maint : COLORS.critical;
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
    if (d.rssi !== null && d.rssi < -85) reasons.push('has poor signal quality');
    if (isStale(d)) reasons.push('missed recent heartbeats');
    const title = d.status === 'Warning' ? 'Attention' : d.status;
    if (!reasons.length) return { level: d.status === 'Healthy' ? 'green' : this.statusLevel(d.status), title, text: d.status === 'Healthy' ? 'All health checks are passing.' : `Device marked ${title.toLowerCase()}.` };
    return { level: this.statusLevel(d.status), title, text: `Device ${reasons.slice(0, 2).join(' and ')}.` };
  }

  batteryWord(d: Device): { label: string; level: Level } {
    const b = d.battery ?? 0;
    return b < 20 ? { label: 'Low', level: 'red' } : b < 30 ? { label: 'Fair', level: 'amber' } : { label: 'Good', level: 'green' };
  }

  signalWord(d: Device): { label: string; level: Level } {
    const q = d.quality;
    if (q === null) return { label: '—', level: 'grey' };
    return q === 'Poor' ? { label: 'Weak', level: 'red' } : q === 'Fair' ? { label: 'Fair', level: 'amber' } : { label: q, level: 'green' };
  }

  // panel mini charts (no telemetry history API yet: tele stays null and the panel shows its empty state)
  private teleCache: { id: string; v: ReturnType<DeviceHealth['buildTele']> | null } | null = null;

  get tele() {
    const d = this.selected;
    if (!d) return null;
    if (this.teleCache?.id !== d.id) this.teleCache = { id: d.id, v: telemetry(d).mins.length >= 2 ? this.buildTele(d) : null };
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
    const start = this.now - 1440 * 60000;
    const first = new Date(new Date(start).setMinutes(0, 0, 0)).getTime();
    for (let tm = first; tm <= this.now; tm += 3600000) {
      const dt = new Date(tm);
      if (tm < start || dt.getHours() % 6) continue;
      xTicks.push({ x: MP.l + (1 - (this.now - tm) / 60000 / 1440) * plotW, label: this.clock(dt).replace(':00 ', '') });
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

  // ===== Diagnostics (evaluated from the device's last report) =====

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
    this.finishDiagnostics(d);
  }

  private finishDiagnostics(d: Device): void {
    const gwDown = d.gateway === '—' ? 0 : this.devices.filter((x) => x.gateway === d.gateway && x.conn === 'Offline').length;
    const gwRecord = this.devices.find((x) => x.id === d.gateway);
    const q = d.quality;
    const checks: DiagRun['checks'] = [
      d.lastSeenMin === null
        ? { name: 'Heartbeat', result: 'warn', detail: 'No heartbeat time recorded' }
        : d.conn === 'Offline'
          ? { name: 'Heartbeat', result: 'fail', detail: `No heartbeat for ${this.ago(d.lastSeenMin).replace(' ago', '')}` }
          : isStale(d) || d.conn === 'Warning'
            ? { name: 'Heartbeat', result: 'warn', detail: `Last heartbeat ${this.ago(d.lastSeenMin)}` }
            : { name: 'Heartbeat', result: 'pass', detail: `Heartbeat received ${this.ago(d.lastSeenMin)}` },
      d.gateway === '—'
        ? { name: 'Gateway reachability', result: 'warn', detail: 'No gateway recorded for this device' }
        : d.gateway === 'Cellular'
          ? { name: 'Gateway reachability', result: d.conn === 'Offline' ? 'fail' : 'pass', detail: 'Reports over the cellular network' }
          : { name: 'Gateway reachability', result: gwRecord?.conn === 'Offline' ? 'fail' : gwDown ? 'warn' : 'pass', detail: `${d.gateway}${gwRecord ? ' is ' + gwRecord.conn.toLowerCase() : ''}${gwDown ? ` · ${gwDown} offline device(s) on gateway` : ''}` },
      d.battery === null
        ? { name: 'Battery', result: 'pass', detail: d.power === 'PoE' ? 'Powered over Ethernet (PoE)' : 'External power supply' }
        : { name: 'Battery', result: d.battery < 20 ? 'fail' : d.battery < 30 ? 'warn' : 'pass', detail: `${d.battery}% remaining${d.battery < 20 ? ' — replace battery' : ''}` },
      d.rssi === null
        ? { name: 'RSSI / signal', result: 'warn', detail: 'No signal reading reported' }
        : { name: 'RSSI / signal', result: q === 'Poor' ? 'fail' : q === 'Fair' ? 'warn' : 'pass', detail: `${d.rssi} dBm (${q ?? '—'})${q === 'Poor' ? ' — below -85 dBm' : ''}` },
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

  // ===== Issues (no API yet: logged in this session only) =====

  openIssue(d: Device): void {
    this.menuId = '';
    this.select(d, this.tab);
    this.formError = '';
    const what = this.callout.text.replace(/^Device /, '').replace(/\.$/, '');
    this.issueForm = { title: `${d.id} ${d.status === 'Healthy' ? 'requires inspection' : '— ' + what}`, priority: '', assignee: '', notes: '' };
  }

  saveIssue(): void {
    const f = this.issueForm;
    const d = this.selected;
    if (!f || !d) return;
    if (!f.title.trim()) return void (this.formError = 'Enter an issue title.');
    if (!f.priority) return void (this.formError = 'Select a priority.');
    const id = `ISS-${new Date().getFullYear()}-${String(++this.issueSeq).padStart(4, '0')}`;
    this.addEvent(d, { min: 0, title: `Issue ${id} noted`, detail: `${f.priority} priority${f.assignee ? ' · assigned to ' + f.assignee : ''}`, level: 'purple' });
    this.issueForm = null;
    this.showToast(`${id} noted for ${d.id} (this session only).`);
  }

  // ===== Configuration =====

  config(d: Device): { k: string; v: string }[] {
    return [
      { k: 'Device type', v: d.type },
      { k: 'Protocol', v: d.protocol },
      { k: 'Gateway', v: d.gateway === 'Cellular' || d.site === '—' ? d.gateway : `${d.gateway} · ${d.site}` },
      { k: 'Power source', v: d.api.powerSource },
      { k: 'Low battery threshold', v: d.battery === null ? 'Not applicable' : '20%' },
      { k: 'RSSI alert threshold', v: '-90 dBm' },
      { k: 'Firmware', v: !d.latestFirmware || d.firmware === '—' ? d.firmware : d.firmware.replace(/^v/i, '') === d.latestFirmware.replace(/^v/i, '') ? `${d.firmware} (latest)` : `${d.firmware} → ${d.latestFirmware} available` },
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
    else if (this.healthForm) this.healthForm = null;
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
