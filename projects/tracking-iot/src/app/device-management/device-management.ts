import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Ellipsis,
  ExternalLink,
  Info,
  Link2,
  Plug,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  ScanLine,
  Search,
  Settings,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Smartphone,
  Thermometer,
  TriangleAlert,
  Unlink,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-angular';
import {
  CONNS, DEVICES, DevEvent, Device, DeviceType, HEALTHS, Health, HealthPoint, HealthRange, LinkedAsset, MODELS_BY_TYPE, Protocol, SITES, TYPES,
  bucketOf, ensureSite, isCellular, knownAssets,
} from './device-data';
import { IoTDeviceApiService, connOf } from './iot-device-api.service';

type Kpi = '' | 'online' | 'offline' | 'attention';
type Tab = 'overview' | 'telemetry' | 'events' | 'settings';
type Range = HealthRange;

interface DeviceForm { name: string; id: string; type: DeviceType; model: string; serial: string; protocol: Protocol; site: string; gateway: string; asset: string }
interface ImportRow { line: number; id: string; name: string; type: DeviceType | null; model: string; serial: string; protocol: string; site: string; gateway: string; asset: string; error: string }
type Dialog =
  | { kind: 'add'; f: DeviceForm }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string }
  | { kind: 'link'; deviceId: string; asset: string }
  | { kind: 'unlink'; deviceId: string; reason: string }
  | { kind: 'delete'; deviceId: string };

interface ChartTick { x: number; label: string }
interface Chart {
  pts: HealthPoint[];
  xs: number[];
  rssiPath: string;
  rssiDots: { x: number; y: number }[];
  batPath: string;
  bars: { x: number; y: number; h: number }[];
  barW: number;
  xTicks: ChartTick[];
  hitW: number;
  maxMsgs: number;
  hasBattery: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Icon for a device type text (the API's types are free text, e.g. "Asset Tracker", "Condition Sensor"). */
function typeIconOf(type: string): typeof Radio {
  const t = type.toLowerCase();
  if (t.includes('gps') || t.includes('cellular') || t.includes('tracker') && !t.includes('ble')) return Satellite;
  if (t.includes('temp') || t.includes('environment')) return Thermometer;
  if (t.includes('vibration') || t.includes('condition')) return Activity;
  if (t.includes('rfid')) return ScanLine;
  return Radio;
}

/** Health chart geometry: three stacked bands sharing the time axis. */
const CW = 640;
const CP = { l: 46, r: 12 };
const SIG = { top: 10, h: 82, min: -120, max: -40 };
const BAT = { top: 110, h: 54 };
const MSG = { top: 180, h: 30 };
const CH = 236;

@Component({
  selector: 'app-device-management',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-management.html',
  styleUrls: ['./device-management.css', './device-management-sections.css', './device-management-panel.css', '../shared/iot-purple-theme.css'],
})
export class DeviceManagement implements OnInit, OnDestroy {
  private readonly api = inject(IoTDeviceApiService);
  readonly icons = { Box, ChevronLeft, ChevronRight, CircleCheck, Download, Ellipsis, ExternalLink, Info, Link2, Plug, Plus, RefreshCw, Search, Settings, Smartphone, TriangleAlert, Unlink, Upload, Wifi, WifiOff, X };
  readonly types: DeviceType[] = TYPES;
  readonly conns = CONNS;
  readonly healths = HEALTHS;
  readonly sites = SITES;
  /** Connectivity options of the Add form (GET /api/iot-devices/connectivities, narrowed to the chosen model). */
  protocols: string[] = [];
  /** Connectivity filter options: every connectivity the API offers plus those of loaded devices. */
  connectivityOptions: string[] = [];
  readonly pageSizes = [5, 10, 25, 50];
  readonly cw = CW;
  readonly ch = CH;
  readonly cp = CP;
  readonly sig = SIG;
  readonly bat = BAT;
  readonly msg = MSG;
  readonly sigTicks = [-40, -80, -120];
  readonly batTicks = [100, 50, 0];

  search = '';
  typeFilter: DeviceType | '' = '';
  connFilter = '';
  siteFilter = '';
  healthFilter: Health | '' = '';
  kpi: Kpi = '';
  pageSize = 5;
  page = 0;

  /** No device is selected until a row is clicked. */
  selectedId: string | null = null;
  tab: Tab = 'overview';
  range: Range = '24h';
  hover: number | null = null;

  menuId = '';
  menuPos = { top: 0, left: 0 };
  dialog: Dialog | null = null;
  formError = '';
  settingsDraft = { intervalMin: 10, lowBattery: 20, offlineAfterMin: 30, alerts: true };
  private settingsFor = '';
  toast = '';
  /** True while the device list is being fetched. */
  loading = false;
  /** Why the device list could not be loaded. */
  loadError = '';
  /** True while a change is being saved. */
  saving = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private version = 0;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.load();
    this.loadOptions();
  }

  /** GET /api/iot-devices → the device list. */
  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getAll().subscribe({
      next: (list) => {
        DEVICES.splice(0, DEVICES.length, ...list);
        for (const d of list) this.addOptions(d);
        this.loading = false;
        this.version++;
      },
      error: (e: Error) => {
        this.loading = false;
        this.loadError = e.message;
        this.version++;
      },
    });
  }

  /** Device types, models, connectivities, gateways and sites for the filters and the Add / Import forms. */
  private loadOptions(): void {
    this.api.deviceTypes().subscribe((types) => {
      for (const t of types) if (!TYPES.includes(t)) TYPES.push(t);
      this.version++;
    });
    this.api.models().subscribe((models) => {
      for (const k of Object.keys(MODELS_BY_TYPE)) delete MODELS_BY_TYPE[k];
      for (const m of models) {
        (MODELS_BY_TYPE[m.deviceType] ??= []).push(m.modelNumber);
        if (!TYPES.includes(m.deviceType)) TYPES.push(m.deviceType);
      }
      this.version++;
    });
    this.api.connectivities().subscribe((list) => {
      this.protocols = list;
      for (const c of list) this.addConnectivity(c);
      this.version++;
    });
    this.api.gateways().subscribe((gws) => {
      for (const g of gws) ensureSite(g.siteName ?? '', g.siteId, g.deviceId);
      this.version++;
    });
    this.api.sites().subscribe((sites) => {
      for (const s of sites) ensureSite(s.name, s.id);
      this.version++;
    });
    this.api.registeredAssets().subscribe((assets) => {
      this.registeredAssets = assets;
      this.version++;
    });
  }

  /** Makes a loaded device's type, site and gateway selectable in the filters. */
  private addOptions(d: Device): void {
    if (d.type && !TYPES.includes(d.type)) TYPES.push(d.type);
    ensureSite(d.site, d.api?.siteId, d.gateway);
    this.addConnectivity(d.protocol);
  }

  private addConnectivity(c: string | null | undefined): void {
    if (!c || this.connectivityOptions.some((o) => o.toLowerCase() === c.toLowerCase())) return;
    this.connectivityOptions = [...this.connectivityOptions, c].sort((a, b) => a.localeCompare(b));
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====

  get counts() {
    const c = { total: DEVICES.length, online: 0, offline: 0, attention: 0 };
    for (const d of DEVICES) {
      const b = bucketOf(d);
      if (b !== 'pending') c[b]++;
    }
    return c;
  }

  pct(n: number): string {
    const t = DEVICES.length;
    return t ? ((n / t) * 100).toFixed(1) + '%' : '0%';
  }

  setKpi(k: Kpi): void {
    this.kpi = this.kpi === k ? '' : k;
    this.onFilter();
  }

  // ===== Table =====

  private cache = { key: '', rows: [] as Device[] };

  get rows(): Device[] {
    const key = [this.search, this.typeFilter, this.connFilter, this.siteFilter, this.healthFilter, this.kpi, this.version].join('|');
    if (key === this.cache.key) return this.cache.rows;
    const q = this.search.trim().toLowerCase();
    const rows = DEVICES.filter((d) =>
      (!this.typeFilter || d.type === this.typeFilter) && (!this.connFilter || d.protocol.toLowerCase() === this.connFilter.toLowerCase()) && (!this.siteFilter || d.site === this.siteFilter) &&
      (!this.healthFilter || d.health === this.healthFilter) && (!this.kpi || bucketOf(d) === this.kpi) &&
      (!q || `${d.id} ${d.name} ${d.serial} ${d.imei} ${d.model} ${d.asset ? d.asset.name : ''} ${d.gateway} ${d.site}`.toLowerCase().includes(q)));
    this.cache = { key, rows };
    return rows;
  }

  get pageRows(): Device[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
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
    const n = this.rows.length;
    return n ? `Showing ${(this.page * this.pageSize + 1).toLocaleString()}–${Math.min(n, (this.page + 1) * this.pageSize).toLocaleString()} of ${n.toLocaleString()} devices` : 'No devices';
  }

  get hasFilters(): boolean {
    return !!(this.search || this.typeFilter || this.connFilter || this.siteFilter || this.healthFilter || this.kpi);
  }

  onFilter(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.typeFilter = this.healthFilter = this.kpi = '';
    this.connFilter = this.siteFilter = '';
    this.onFilter();
  }

  typeIcon(d: Device) {
    return typeIconOf(d.type);
  }

  batteryIcon(d: Device) {
    const b = d.battery ?? 0;
    return b >= 60 ? BatteryFull : b >= 25 ? BatteryMedium : BatteryLow;
  }

  batteryClass(d: Device): string {
    const b = d.battery ?? 100;
    return b < 20 ? 'c-red' : b < 30 ? 'c-amber' : 'c-green';
  }

  signalIcon(rssi: number | null) {
    if (rssi === null) return SignalLow;
    return rssi >= -65 ? Signal : rssi >= -80 ? SignalHigh : rssi >= -95 ? SignalMedium : SignalLow;
  }

  signalClass(rssi: number | null): string {
    if (rssi === null) return '';
    return rssi >= -80 ? 'c-green' : rssi >= -95 ? 'c-amber' : 'c-red';
  }

  connClass(d: Device): string {
    return d.conn === 'Online' ? 'pill--green' : d.conn === 'Offline' ? 'pill--red' : 'pill--grey';
  }

  healthClass(d: Device): string {
    return d.health === 'Good' ? 'pill--green' : d.health === 'Warning' ? 'pill--amber' : 'pill--red';
  }

  ago(sec: number | null): string {
    if (sec === null) return 'Never';
    if (sec < 60) return `${sec} sec ago`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(sec / 3600);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  private clock(dt: Date): string {
    const h = dt.getHours() % 12 || 12;
    return `${String(h).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} ${dt.getHours() < 12 ? 'AM' : 'PM'}`;
  }

  fmtAt(ms: number): string {
    const dt = new Date(ms);
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}, ${this.clock(dt)}`;
  }

  seenDate(d: Device): string {
    return d.lastSeenSec === null ? 'No message received yet' : this.fmtAt(Date.now() - d.lastSeenSec * 1000);
  }

  // ===== Row menu =====

  openMenu(d: Device, e: MouseEvent): void {
    e.stopPropagation();
    if (this.menuId === d.id) {
      this.menuId = '';
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const up = r.bottom + 200 > window.innerHeight;
    this.menuPos = { top: up ? r.top - 196 : r.bottom + 4, left: Math.max(8, r.right - 190) };
    this.menuId = d.id;
  }

  get menuDevice(): Device | null {
    return this.menuId ? this.byId(this.menuId) : null;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId = '';
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    this.menuId = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuId = '';
    if (this.dialog) this.dialog = null;
    else if (window.innerWidth < 1200) this.selectedId = null;
  }

  // ===== Panel =====

  byId(id: string): Device | null {
    return DEVICES.find((d) => d.id === id) ?? null;
  }

  get selected(): Device | null {
    return this.selectedId ? this.byId(this.selectedId) : null;
  }

  select(d: Device, tab: Tab = 'overview'): void {
    this.menuId = '';
    this.selectedId = d.id;
    this.tab = tab;
    this.hover = null;
  }

  setTab(t: Tab): void {
    this.tab = t;
    const d = this.selected;
    if (t === 'settings' && d && this.settingsFor !== d.id) this.resetSettings();
  }

  get events(): DevEvent[] {
    const d = this.selected;
    return d ? d.log : [];
  }

  /** Battery text when there is no level: wired power, or "—" for a battery device that has not reported one. */
  powerText(d: Device): string {
    return d.power === 'Battery' ? '—' : d.power === 'PoE' ? 'PoE' : 'External power';
  }

  batteryWord(d: Device): { label: string; cls: string } {
    const b = d.battery ?? 100;
    return b < 20 ? { label: 'Low', cls: 'pill--red' } : b < 30 ? { label: 'Fair', cls: 'pill--amber' } : { label: 'Good', cls: 'pill--green' };
  }

  /** Type-specific values of the latest payload, when reported. */
  payload(d: Device): { k: string; v: string }[] {
    return d.payload ?? [];
  }

  /** Last few messages before the last-seen time, when reported. */
  recentMessages(d: Device): { at: number; rssi: number }[] {
    return d.messages ?? [];
  }

  uptime(d: Device): string {
    const pts = this.chartFor(d)?.pts ?? [];
    if (!pts.length) return '—';
    const live = pts.filter((p) => p.msgs > 0).length;
    return Math.round((live / pts.length) * 100) + '%';
  }

  msgCount(d: Device): number {
    return (this.chartFor(d)?.pts ?? []).reduce((s, p) => s + p.msgs, 0);
  }

  // ===== Health chart =====

  /** The chart follows the selected device. */
  get chartDevice(): Device | null {
    return this.selected;
  }

  private chartCache = { key: '', v: null as Chart | null };

  get chart(): Chart | null {
    const d = this.chartDevice;
    return d ? this.chartFor(d) : null;
  }

  /** Null when the device has fewer than two reported points for the range. */
  private chartFor(d: Device): Chart | null {
    const key = `${d.id}|${this.range}|${this.version}`;
    if (this.chartCache.key === key) return this.chartCache.v;
    const pts = d.healthSeries?.[this.range] ?? [];
    if (pts.length < 2 || pts[pts.length - 1].at <= pts[0].at) {
      this.chartCache = { key, v: null };
      return null;
    }
    const plotW = CW - CP.l - CP.r;
    const t0 = pts[0].at;
    const span = pts[pts.length - 1].at - t0;
    const x = (at: number) => CP.l + ((at - t0) / span) * plotW;
    const xs = pts.map((p) => x(p.at));
    const ySig = (v: number) => SIG.top + ((SIG.max - Math.max(SIG.min, Math.min(SIG.max, v))) / (SIG.max - SIG.min)) * SIG.h;
    const yBat = (v: number) => BAT.top + ((100 - v) / 100) * BAT.h;
    const path = (vals: (number | null)[], y: (v: number) => number) => {
      let out = '';
      let pen = false;
      vals.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        out += `${pen ? 'L' : 'M'}${xs[i].toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return out;
    };
    const maxMsgs = Math.max(1, ...pts.map((p) => p.msgs));
    const barW = Math.max(2, Math.min(10, (plotW / pts.length) * 0.45));
    const bars = pts.map((p, i) => {
      const h = (p.msgs / maxMsgs) * MSG.h;
      return { x: xs[i] - barW / 2, y: MSG.top + MSG.h - h, h };
    });
    const xTicks: ChartTick[] = [];
    if (this.range === '24h') {
      const first = new Date(t0);
      first.setMinutes(0, 0, 0);
      for (let t = first.getTime() + 3_600_000; t <= pts[pts.length - 1].at; t += 3_600_000) {
        const dt = new Date(t);
        if (dt.getHours() % 4 === 0) xTicks.push({ x: x(t), label: this.clock(dt).replace(/^0/, '') });
      }
    } else {
      const first = new Date(t0);
      first.setHours(0, 0, 0, 0);
      for (let t = first.getTime() + 86_400_000; t <= pts[pts.length - 1].at; t += 86_400_000) {
        const dt = new Date(t);
        xTicks.push({ x: x(t), label: `${MONTHS[dt.getMonth()]} ${dt.getDate()}` });
      }
    }
    const v: Chart = {
      pts, xs, maxMsgs, barW, bars, xTicks, hitW: plotW / (pts.length - 1),
      rssiPath: path(pts.map((p) => p.rssi), ySig),
      rssiDots: pts.filter((p) => p.rssi !== null).map((p) => ({ x: x(p.at), y: ySig(p.rssi as number) })),
      batPath: path(pts.map((p) => p.battery), yBat),
      hasBattery: d.battery !== null,
    };
    this.chartCache = { key, v };
    return v;
  }

  sigY(v: number): number {
    return SIG.top + ((SIG.max - v) / (SIG.max - SIG.min)) * SIG.h;
  }

  batY(v: number): number {
    return BAT.top + ((100 - v) / 100) * BAT.h;
  }

  hoverLabel(i: number): string {
    const at = this.chart?.pts[i]?.at;
    if (at === undefined) return '';
    const dt = new Date(at);
    return this.range === '24h' ? this.clock(dt) : `${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${this.clock(dt)}`;
  }

  // ===== Actions =====

  viewAsset(d: Device): void {
    this.menuId = '';
    if (!d.asset) return;
    this.clearFilters();
    this.search = d.asset.code;
    this.showToast(`Showing the devices linked to ${d.asset.name}.`);
  }

  showGateway(d: Device): void {
    if (!d.gateway) return;
    this.clearFilters();
    this.search = d.gateway;
    this.showToast(`Showing devices reporting through ${d.gateway}.`);
  }

  configure(d: Device): void {
    this.menuId = '';
    this.router.navigate(['/tracking-iot/device-configuration'], { queryParams: { device: d.id } });
  }

  replace(d: Device): void {
    this.menuId = '';
    this.router.navigate(['/tracking-iot/device-replacement'], { queryParams: { device: d.id } });
  }

  private log(d: Device, title: string, detail: string, level: DevEvent['level']): void {
    d.log.unshift({ at: Date.now(), title, detail: detail ? `${detail} · by ${this.api.currentUser()}` : `by ${this.api.currentUser()}`, level });
    this.version++;
  }

  /** Puts a saved device into the list, keeping the page-only fields (events, settings) of the local copy. */
  private commit(saved: Device, local?: Device): Device {
    if (local) {
      saved.log = [...local.log.filter((e) => !saved.log.some((x) => x.at === e.at && x.title === e.title)), ...saved.log].sort((a, b) => b.at - a.at);
      saved.settings = local.settings;
    }
    const i = DEVICES.findIndex((x) => x.id === saved.id);
    if (i >= 0) DEVICES[i] = saved;
    else DEVICES.unshift(saved);
    this.addOptions(saved);
    this.version++;
    return saved;
  }

  private failed(e: Error): void {
    this.saving = false;
    if (this.dialog) this.formError = e.message;
    else this.showToast(e.message);
  }

  // link / unlink

  /** Assets from the asset register (GET api/asset-registrations), name and code. */
  private registeredAssets: LinkedAsset[] = [];
  private assetCache = { version: -1, list: [] as LinkedAsset[] };

  /** "Link to asset" choices: the registered assets, then any asset already linked on a device that is not in the register. */
  get assetOptions(): LinkedAsset[] {
    if (this.assetCache.version !== this.version) {
      const seen = new Set(this.registeredAssets.map((a) => a.code.toUpperCase()));
      const extra = knownAssets().filter((a) => !seen.has(a.code.toUpperCase()));
      this.assetCache = { version: this.version, list: [...this.registeredAssets, ...extra] };
    }
    return this.assetCache.list;
  }

  /** "Tv - TV12333": asset name and code, as in Tag Management. */
  assetOptionLabel(a: LinkedAsset): string {
    return a.name && a.name !== a.code ? `${a.name} - ${a.code}` : a.code;
  }

  /** The picked code as a linked asset (with its name and registration id when it is registered). */
  private resolveAsset(code: string): LinkedAsset {
    const c = code.trim().toUpperCase();
    return this.assetOptions.find((a) => a.code.toUpperCase() === c) ?? { name: code.trim(), code: code.trim() };
  }

  openLink(d: Device): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'link', deviceId: d.id, asset: '' };
  }

  saveLink(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'link' || this.saving) return;
    const d = this.byId(dl.deviceId);
    if (!d) return;
    if (!dl.asset.trim()) return void (this.formError = 'Choose the asset to link.');
    const asset = this.resolveAsset(dl.asset);
    this.saving = true;
    this.api.update({ ...d, asset }).subscribe({
      next: (saved) => {
        const n = this.commit(saved, d);
        this.log(n, 'Linked to asset', asset.name, 'purple');
        this.saving = false;
        this.dialog = null;
        this.selectedId = n.id;
        this.showToast(`${n.id} linked to ${asset.name}.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  openUnlink(d: Device): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'unlink', deviceId: d.id, reason: '' };
  }

  saveUnlink(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'unlink' || this.saving) return;
    const d = this.byId(dl.deviceId);
    if (!d?.asset) return;
    const from = d.asset;
    this.saving = true;
    this.api.update({ ...d, asset: null }).subscribe({
      next: (saved) => {
        const n = this.commit(saved, d);
        this.log(n, 'Unlinked from asset', `${from.name}${dl.reason.trim() ? ' — ' + dl.reason.trim() : ''}`, 'grey');
        this.saving = false;
        this.dialog = null;
        this.showToast(`${n.id} unlinked from ${from.name}.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // delete

  openDelete(d: Device): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'delete', deviceId: d.id };
  }

  saveDelete(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'delete' || this.saving) return;
    this.saving = true;
    this.api.delete(dl.deviceId).subscribe({
      next: () => {
        const i = DEVICES.findIndex((x) => x.id === dl.deviceId);
        if (i >= 0) DEVICES.splice(i, 1);
        if (this.selectedId === dl.deviceId) this.selectedId = null;
        this.saving = false;
        this.dialog = null;
        this.version++;
        this.page = Math.min(this.page, this.pageCount - 1);
        this.showToast(`${dl.deviceId} deleted.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // settings (page-only: the API has no per-device settings here; Configure opens Device Configuration)

  resetSettings(): void {
    const d = this.selected;
    if (!d) return;
    this.settingsDraft = { ...d.settings };
    this.settingsFor = d.id;
    this.formError = '';
  }

  saveSettings(): void {
    const d = this.selected;
    if (!d) return;
    const s = this.settingsDraft;
    if (!(s.intervalMin >= 1 && s.intervalMin <= 1440)) return void (this.formError = 'Reporting interval must be 1–1440 minutes.');
    if (!(s.lowBattery >= 5 && s.lowBattery <= 50)) return void (this.formError = 'Low-battery threshold must be 5–50%.');
    if (!(s.offlineAfterMin >= s.intervalMin * 2)) return void (this.formError = 'Mark offline after at least two missed intervals.');
    this.formError = '';
    d.settings = { ...s };
    d.conn = connOf(d.lastSeenSec, s.offlineAfterMin);
    this.log(d, 'Settings updated', `Report every ${s.intervalMin} min · offline after ${s.offlineAfterMin} min · low battery ${s.lowBattery}%`, 'purple');
    this.showToast(`Settings applied to ${d.id} for this session. Use Configure to change the device itself.`);
  }

  // add device

  modelsFor(t: DeviceType): string[] {
    return MODELS_BY_TYPE[t] ?? [];
  }

  gatewaysFor(site: string): string[] {
    return SITES.find((s) => s.name === site)?.gateways ?? [];
  }

  cellular(f: DeviceForm): boolean {
    return isCellular(f.type, f.protocol);
  }

  openAdd(): void {
    this.formError = '';
    const f: DeviceForm = { name: '', id: '', type: '', model: '', serial: '', protocol: '', site: '', gateway: '', asset: '' };
    this.dialog = { kind: 'add', f };
    this.onAddModel(f, false);
  }

  onAddType(f: DeviceForm): void {
    f.model = '';
    this.onAddModel(f, false);
  }

  /** GET /api/iot-devices/connectivities?model: once a model is picked, its protocol comes first and is pre-selected. */
  onAddModel(f: DeviceForm, pick = true): void {
    this.api.connectivities(f.model || undefined, f.type || undefined).subscribe((list) => {
      if (!list.length) return;
      this.protocols = list;
      if (!pick || !f.model) return;
      f.protocol = list[0];
      if (this.cellular(f)) f.gateway = 'Cellular';
      else if (f.gateway === 'Cellular') f.gateway = '';
    });
  }

  onAddSite(f: DeviceForm): void {
    if (f.gateway !== 'Cellular') f.gateway = '';
  }

  private validateDevice(id: string, serial: string, type: DeviceType | null, model: string, site: string, gateway: string, ids: Set<string>, serials: Set<string>): string {
    if (!type) return 'Device type missing';
    if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(id)) return 'Device ID must be 3–20 letters, digits or dashes';
    if (ids.has(id)) return `${id} already exists`;
    if (!serial) return 'Serial number missing';
    if (serials.has(serial)) return 'Serial number already registered';
    if (!model) return 'Model missing';
    // catalogue checks apply only once models / sites / gateways are loaded
    const models = this.modelsFor(type);
    if (models.length && !models.includes(model)) return `${model} is not a ${type} model`;
    if (SITES.length && site && !SITES.some((s) => s.name === site)) return 'Unknown site';
    const gateways = this.gatewaysFor(site);
    if (gateway && gateway !== 'Cellular' && gateways.length && !gateways.includes(gateway)) return `${gateway} is not at ${site}`;
    return '';
  }

  saveAdd(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'add' || this.saving) return;
    const f = dl.f;
    const id = f.id.trim().toUpperCase();
    const serial = f.serial.trim().toUpperCase();
    if (!f.name.trim()) return void (this.formError = 'Enter a device name.');
    const err = this.validateDevice(id, serial, f.type, f.model, f.site, f.gateway, new Set(DEVICES.map((d) => d.id)), new Set(DEVICES.map((d) => d.serial)));
    if (err) return void (this.formError = err + '.');
    if (!f.protocol) return void (this.formError = 'Choose the connectivity.');
    const draft = this.newDevice(id, f.name.trim(), f.type, f.model, serial, f.protocol, f.site, f.gateway, f.asset);
    this.saving = true;
    this.api.create(draft, this.siteIdOf(f.site)).subscribe({
      next: (saved) => {
        const d = this.commit(saved);
        this.saving = false;
        this.dialog = null;
        this.clearFilters();
        this.select(d);
        this.showToast(`${d.id} registered. It shows as Pending until its first message arrives.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  private siteIdOf(site: string): string | null {
    return SITES.find((s) => s.name === site)?.id || null;
  }

  /** A new device to POST; the API fills in power source, health and who registered it. */
  private newDevice(id: string, name: string, type: DeviceType, model: string, serial: string, protocol: Protocol, site: string, gateway: string, assetCode: string): Device {
    const asset = assetCode.trim() ? this.resolveAsset(assetCode) : null;
    return {
      id, name, type, model, serial, imei: '', protocol, conn: 'Pending', health: 'Good', asset, site, gateway, power: 'External', battery: null,
      rssi: null, lastSeenSec: null, firmware: '', installedDaysAgo: 0, settings: { intervalMin: 10, lowBattery: 20, offlineAfterMin: 30, alerts: true }, log: [],
    };
  }

  // import

  openImport(): void {
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
  }

  downloadTemplate(): void {
    const header = ['Device ID', 'Name', 'Device Type', 'Model', 'Serial', 'Connectivity', 'Site', 'Gateway', 'Linked Asset'];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([], { header }), 'Devices');
    XLSX.writeFile(book, 'IoT_Devices_Import_Template.xlsx');
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const dl = this.dialog;
    if (!file || dl?.kind !== 'import') return;
    dl.fileName = file.name;
    dl.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const book = XLSX.read(reader.result, { type: 'array' });
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
        dl.rows = this.validateImport(raw);
        if (!dl.rows.length) dl.error = 'The file has no rows.';
      } catch {
        dl.error = 'This file could not be read. Use the Excel or CSV template.';
        dl.rows = [];
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private validateImport(raw: Record<string, unknown>[]): ImportRow[] {
    const ids = new Set(DEVICES.map((d) => d.id));
    const serials = new Set(DEVICES.map((d) => d.serial));
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
      return k ? String(r[k]).trim() : '';
    };
    return raw.map((r, i) => {
      const id = get(r, 'device id', 'id').toUpperCase();
      const typeText = get(r, 'device type', 'type');
      const type = this.types.find((t) => t.toLowerCase() === typeText.toLowerCase()) ?? (this.types.length ? null : typeText || null);
      const model = get(r, 'model');
      const serial = get(r, 'serial', 'serial number').toUpperCase();
      const protocol = get(r, 'connectivity', 'protocol');
      const site = SITES.find((s) => s.name.toLowerCase() === get(r, 'site').toLowerCase())?.name ?? get(r, 'site');
      const gateway = get(r, 'gateway').toUpperCase().replace('CELLULAR', 'Cellular');
      let error = this.validateDevice(id, serial, type, model, site, gateway, ids, serials);
      if (!type && typeText) error = `Unknown device type "${typeText}"`;
      if (!error && !protocol) error = 'Connectivity missing';
      if (!error) {
        ids.add(id);
        serials.add(serial);
      }
      return { line: i + 2, id, name: get(r, 'name') || id, type, model, serial, protocol, site, gateway, asset: get(r, 'linked asset', 'asset'), error };
    });
  }

  get importValid(): number {
    const dl = this.dialog;
    return dl?.kind === 'import' ? dl.rows.filter((r) => !r.error).length : 0;
  }

  /** POSTs the valid rows one by one; rows the API rejects are reported with its reason. */
  saveImport(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'import' || this.saving) return;
    const ok = dl.rows.filter((r) => !r.error && r.type);
    this.saving = true;
    from(ok).pipe(
      concatMap((r) => this.api.create(this.newDevice(r.id, r.name, r.type!, r.model, r.serial, r.protocol, r.site, r.gateway, r.asset), this.siteIdOf(r.site)).pipe(
        map((saved) => {
          this.commit(saved);
          return '';
        }),
        catchError((e: Error) => of((r.error = e.message))),
      )),
      toArray(),
    ).subscribe((results) => {
      this.saving = false;
      const done = results.filter((x) => !x).length;
      const failed = results.length - done;
      const skipped = dl.rows.length - ok.length;
      this.clearFilters();
      if (failed) {
        dl.error = `${done} imported; ${failed} rejected by the server (see Result).`;
        dl.rows = dl.rows.filter((r) => r.error);
        return;
      }
      this.dialog = null;
      this.showToast(`${done} device${done === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped` : ''}.`);
    });
  }

  // helpers

  /** Narrow a dialog for the template (strict templates cannot narrow a union on their own). */
  dlg<K extends Dialog['kind']>(kind: K): Extract<Dialog, { kind: K }> | null {
    return this.dialog?.kind === kind ? (this.dialog as Extract<Dialog, { kind: K }>) : null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
