import { Component, HostListener, OnDestroy } from '@angular/core';
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
  CONNS, DEVICES, DevEvent, Device, DeviceType, HEALTHS, Health, HealthPoint, LinkedAsset, MODEL_FW, NOW, Protocol, SITES, TYPES, TYPE_SPEC,
  baseEvents, bucketOf, healthSeries, knownAssets, mulberry32, powerFor,
} from './device-data';

type Kpi = '' | 'online' | 'offline' | 'attention';
type Tab = 'overview' | 'telemetry' | 'events' | 'settings';
type Range = '24h' | '7d';

interface DeviceForm { name: string; id: string; type: DeviceType; model: string; serial: string; protocol: Protocol; site: string; gateway: string; asset: string }
interface ImportRow { line: number; id: string; name: string; type: DeviceType | null; model: string; serial: string; site: string; gateway: string; asset: string; error: string }
type Dialog =
  | { kind: 'add'; f: DeviceForm }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string }
  | { kind: 'link'; deviceId: string; asset: string }
  | { kind: 'unlink'; deviceId: string; reason: string };

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
const PROTOCOLS: Protocol[] = ['BLE 5.0', 'LoRaWAN', 'LTE-M', 'Ethernet'];
const TYPE_ICON: Record<DeviceType, typeof Radio> = { 'BLE Tracker': Radio, 'GPS / Cellular': Satellite, 'Temperature Sensor': Thermometer, 'Vibration Sensor': Activity, 'RFID Reader': ScanLine };
const TYPE_ALIASES: Record<string, DeviceType> = {
  ble: 'BLE Tracker', 'ble tracker': 'BLE Tracker', beacon: 'BLE Tracker', gps: 'GPS / Cellular', 'gps / cellular': 'GPS / Cellular', cellular: 'GPS / Cellular',
  temperature: 'Temperature Sensor', 'temperature sensor': 'Temperature Sensor', vibration: 'Vibration Sensor', 'vibration sensor': 'Vibration Sensor', rfid: 'RFID Reader', 'rfid reader': 'RFID Reader',
};

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
  styleUrls: ['./device-management.css', './device-management-sections.css', './device-management-panel.css'],
})
export class DeviceManagement implements OnDestroy {
  readonly icons = { Box, ChevronLeft, ChevronRight, CircleCheck, Download, Ellipsis, ExternalLink, Info, Link2, Plug, Plus, RefreshCw, Search, Settings, Smartphone, TriangleAlert, Unlink, Upload, Wifi, WifiOff, X };
  readonly types = TYPES;
  readonly conns = CONNS;
  readonly healths = HEALTHS;
  readonly sites = SITES;
  readonly protocols = PROTOCOLS;
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

  /** Wide screens open with a device selected; narrower ones keep the drawer closed until a row is clicked. */
  selectedId: string | null = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'VS-30018' : null;
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
  private toastTimer?: ReturnType<typeof setTimeout>;
  private version = 0;

  constructor(private router: Router) {}

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
      (!this.typeFilter || d.type === this.typeFilter) && (!this.connFilter || d.conn === this.connFilter) && (!this.siteFilter || d.site === this.siteFilter) &&
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
    return TYPE_ICON[d.type];
  }

  batteryIcon(d: Device) {
    const b = d.battery ?? 0;
    return b >= 60 ? BatteryFull : b >= 25 ? BatteryMedium : BatteryLow;
  }

  batteryClass(d: Device): string {
    const b = d.battery ?? 100;
    return b < 20 ? 'c-red' : b < 30 ? 'c-amber' : 'c-green';
  }

  signalIcon(rssi: number) {
    return rssi >= -65 ? Signal : rssi >= -80 ? SignalHigh : rssi >= -95 ? SignalMedium : SignalLow;
  }

  signalClass(rssi: number): string {
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
    return d.lastSeenSec === null ? 'No message received yet' : this.fmtAt(NOW.getTime() - d.lastSeenSec * 1000);
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
    return d ? [...d.log, ...baseEvents(d)] : [];
  }

  batteryWord(d: Device): { label: string; cls: string } {
    const b = d.battery ?? 100;
    return b < 20 ? { label: 'Low', cls: 'pill--red' } : b < 30 ? { label: 'Fair', cls: 'pill--amber' } : { label: 'Good', cls: 'pill--green' };
  }

  /** Type-specific values of the latest payload (derived for the demo). */
  payload(d: Device): { k: string; v: string }[] {
    const rng = mulberry32(d.seed * 7 + 3);
    const r = (a: number, b: number, dp = 1) => (a + rng() * (b - a)).toFixed(dp);
    switch (d.type) {
      case 'Temperature Sensor':
        return [{ k: 'Temperature', v: `${r(2, 6)} °C` }, { k: 'Humidity', v: `${r(55, 82, 0)} %RH` }];
      case 'Vibration Sensor':
        return [{ k: 'Velocity (RMS)', v: `${r(1.2, 6.8)} mm/s` }, { k: 'Surface temperature', v: `${r(38, 64, 0)} °C` }];
      case 'GPS / Cellular':
        return [{ k: 'Position', v: `${r(25.0, 25.12, 5)}, ${r(55.1, 55.2, 5)}` }, { k: 'Speed', v: `${r(0, 14, 0)} km/h` }, { k: 'Ignition', v: rng() > 0.4 ? 'On' : 'Off' }];
      case 'RFID Reader':
        return [{ k: 'Tag reads / min', v: r(40, 320, 0) }, { k: 'Active antennas', v: '4 / 4' }];
      default:
        return [{ k: 'Advertising interval', v: '1,000 ms' }, { k: 'TX power', v: '0 dBm' }];
    }
  }

  /** Last few messages before the last-seen time. */
  recentMessages(d: Device): { at: number; rssi: number }[] {
    if (d.lastSeenSec === null) return [];
    const rng = mulberry32(d.seed + 99);
    const last = NOW.getTime() - d.lastSeenSec * 1000;
    return Array.from({ length: 5 }, (_, i) => ({ at: last - i * d.settings.intervalMin * 60_000, rssi: Math.round(d.rssi + (rng() - 0.5) * 6) }));
  }

  uptime(d: Device): string {
    const pts = this.chartFor(d).pts;
    const live = pts.filter((p) => p.msgs > 0).length;
    return Math.round((live / pts.length) * 100) + '%';
  }

  msgCount(d: Device): number {
    return this.chartFor(d).pts.reduce((s, p) => s + p.msgs, 0);
  }

  // ===== Health chart =====

  /** The chart follows the selected device, or VS-30018 when nothing is selected. */
  get chartDevice(): Device {
    return this.selected ?? this.byId('VS-30018') ?? DEVICES[0];
  }

  private chartCache = { key: '', v: null as Chart | null };

  get chart(): Chart {
    return this.chartFor(this.chartDevice);
  }

  private chartFor(d: Device): Chart {
    const key = `${d.id}|${this.range}|${this.version}`;
    if (this.chartCache.key === key && this.chartCache.v) return this.chartCache.v;
    const hours = this.range === '24h' ? 24 : 168;
    const step = this.range === '24h' ? 1 : 6;
    const pts = healthSeries(d, hours, step);
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
    const at = this.chart.pts[i].at;
    const dt = new Date(at);
    return this.range === '24h' ? this.clock(dt) : `${dt.getDate()} ${MONTHS[dt.getMonth()]}, ${this.clock(dt)}`;
  }

  // ===== Actions =====

  viewAsset(d: Device): void {
    this.menuId = '';
    if (!d.asset) return;
    this.clearFilters();
    this.search = d.asset.code;
    this.showToast(`${d.asset.name} isn't in the demo asset register — showing the devices linked to it.`);
  }

  showGateway(d: Device): void {
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
    d.log.unshift({ at: Date.now(), title, detail, level });
    this.version++;
  }

  // link / unlink

  private assetCache = { version: -1, list: [] as LinkedAsset[] };

  get assetOptions(): LinkedAsset[] {
    if (this.assetCache.version !== this.version) this.assetCache = { version: this.version, list: knownAssets() };
    return this.assetCache.list;
  }

  openLink(d: Device): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'link', deviceId: d.id, asset: '' };
  }

  saveLink(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'link') return;
    const d = this.byId(dl.deviceId);
    const code = dl.asset.trim().toUpperCase();
    if (!d) return;
    if (!code) return void (this.formError = 'Choose the asset to link.');
    const asset = knownAssets().find((a) => a.code.toUpperCase() === code) ?? { name: code, code };
    d.asset = asset;
    this.log(d, 'Linked to asset', asset.name, 'purple');
    this.dialog = null;
    this.selectedId = d.id;
    this.showToast(`${d.id} linked to ${asset.name}.`);
  }

  openUnlink(d: Device): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'unlink', deviceId: d.id, reason: '' };
  }

  saveUnlink(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'unlink') return;
    const d = this.byId(dl.deviceId);
    if (!d?.asset) return;
    const from = d.asset;
    d.asset = null;
    this.log(d, 'Unlinked from asset', `${from.name}${dl.reason.trim() ? ' — ' + dl.reason.trim() : ''}`, 'grey');
    this.dialog = null;
    this.showToast(`${d.id} unlinked from ${from.name}. The asset keeps its history.`);
  }

  // settings

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
    this.log(d, 'Settings updated', `Report every ${s.intervalMin} min · offline after ${s.offlineAfterMin} min · low battery ${s.lowBattery}%`, 'purple');
    this.showToast(`Settings saved for ${d.id}.`);
  }

  // add device

  modelsFor(t: DeviceType): string[] {
    return TYPE_SPEC[t].models;
  }

  gatewaysFor(site: string): string[] {
    return SITES.find((s) => s.name === site)?.gateways ?? [];
  }

  openAdd(): void {
    const type: DeviceType = 'BLE Tracker';
    const site = SITES[0];
    this.formError = '';
    this.dialog = { kind: 'add', f: { name: TYPE_SPEC[type].name, id: '', type, model: TYPE_SPEC[type].models[0], serial: '', protocol: TYPE_SPEC[type].protocol, site: site.name, gateway: site.gateways[0], asset: '' } };
  }

  onAddType(f: DeviceForm): void {
    const spec = TYPE_SPEC[f.type];
    f.name = spec.name;
    f.model = spec.models[0];
    f.protocol = spec.protocol;
    f.gateway = f.type === 'GPS / Cellular' ? 'Cellular' : this.gatewaysFor(f.site)[0] ?? '';
  }

  onAddSite(f: DeviceForm): void {
    if (f.gateway !== 'Cellular') f.gateway = this.gatewaysFor(f.site)[0] ?? '';
  }

  private validateDevice(id: string, serial: string, type: DeviceType | null, model: string, site: string, gateway: string, ids: Set<string>, serials: Set<string>): string {
    if (!type) return 'Unknown device type';
    if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(id)) return 'Device ID must be 3–20 letters, digits or dashes';
    if (ids.has(id)) return `${id} already exists`;
    if (!serial) return 'Serial number missing';
    if (serials.has(serial)) return 'Serial number already registered';
    if (!TYPE_SPEC[type].models.includes(model)) return `${model || 'Model'} is not a ${type} model`;
    if (!SITES.some((s) => s.name === site)) return 'Unknown site';
    if (type === 'GPS / Cellular' ? gateway !== 'Cellular' : !this.gatewaysFor(site).includes(gateway)) return type === 'GPS / Cellular' ? 'Cellular trackers report over the mobile network' : `${gateway || 'Gateway'} is not at ${site}`;
    return '';
  }

  saveAdd(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'add') return;
    const f = dl.f;
    const id = f.id.trim().toUpperCase();
    const serial = f.serial.trim().toUpperCase();
    if (!f.name.trim()) return void (this.formError = 'Enter a device name.');
    const err = this.validateDevice(id, serial, f.type, f.model, f.site, f.gateway, new Set(DEVICES.map((d) => d.id)), new Set(DEVICES.map((d) => d.serial)));
    if (err) return void (this.formError = err + '.');
    if (f.type === 'GPS / Cellular' && f.protocol !== 'LTE-M') return void (this.formError = 'GPS / Cellular devices use LTE-M.');
    const d = this.createDevice(id, f.name.trim(), f.type, f.model, serial, f.protocol, f.site, f.gateway, f.asset);
    this.dialog = null;
    this.clearFilters();
    this.select(d);
    this.showToast(`${d.id} registered. It shows as Pending until its first message arrives.`);
  }

  private createDevice(id: string, name: string, type: DeviceType, model: string, serial: string, protocol: Protocol, site: string, gateway: string, assetCode: string): Device {
    const code = assetCode.trim().toUpperCase();
    const asset = code ? knownAssets().find((a) => a.code.toUpperCase() === code) ?? { name: code, code } : null;
    const power = powerFor(type, model);
    const spec = TYPE_SPEC[type];
    const d: Device = {
      id, name, type, model, serial, imei: '', protocol, conn: 'Pending', health: 'Good', asset, site, gateway, power, battery: power === 'Battery' ? 100 : null,
      rssi: -70, lastSeenSec: null, firmware: MODEL_FW[model], installedDaysAgo: 0, settings: { intervalMin: spec.interval, lowBattery: 20, offlineAfterMin: Math.max(15, spec.interval * 3), alerts: true },
      log: [], seed: Math.floor(Math.random() * 1e9),
    };
    d.log.push({ at: Date.now(), title: 'Device registered', detail: `${model} · ${serial}`, level: 'grey' });
    if (asset) d.log.unshift({ at: Date.now(), title: 'Linked to asset', detail: asset.name, level: 'purple' });
    DEVICES.unshift(d);
    this.version++;
    return d;
  }

  // import

  openImport(): void {
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
  }

  downloadTemplate(): void {
    const sample = [
      { 'Device ID': 'BL-29901', Name: 'BLE Beacon', 'Device Type': 'BLE Tracker', Model: 'Minew E8', Serial: 'SN-BL-29901', Site: 'Dubai Warehouse', Gateway: 'GW-DXB-04', 'Linked Asset': 'FL-008' },
      { 'Device ID': 'GPS-19902', Name: 'GPS Tracker', 'Device Type': 'GPS / Cellular', Model: 'Teltonika FMC920', Serial: 'SN-GPS-19902', Site: 'Jebel Ali Yard', Gateway: 'Cellular', 'Linked Asset': '' },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sample), 'Devices');
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
      const type = TYPE_ALIASES[typeText.toLowerCase()] ?? null;
      const model = get(r, 'model');
      const serial = get(r, 'serial', 'serial number').toUpperCase();
      const site = SITES.find((s) => s.name.toLowerCase() === get(r, 'site').toLowerCase())?.name ?? get(r, 'site');
      const gateway = get(r, 'gateway').toUpperCase().replace('CELLULAR', 'Cellular');
      let error = this.validateDevice(id, serial, type, model, site, gateway, ids, serials);
      if (!type && typeText) error = `Unknown device type "${typeText}"`;
      if (!error) {
        ids.add(id);
        serials.add(serial);
      }
      return { line: i + 2, id, name: get(r, 'name') || (type ? TYPE_SPEC[type].name : ''), type, model, serial, site, gateway, asset: get(r, 'linked asset', 'asset'), error };
    });
  }

  get importValid(): number {
    const dl = this.dialog;
    return dl?.kind === 'import' ? dl.rows.filter((r) => !r.error).length : 0;
  }

  saveImport(): void {
    const dl = this.dialog;
    if (dl?.kind !== 'import') return;
    const ok = dl.rows.filter((r) => !r.error && r.type);
    for (const r of ok) this.createDevice(r.id, r.name, r.type!, r.model, r.serial, TYPE_SPEC[r.type!].protocol, r.site, r.gateway, r.asset);
    const skipped = dl.rows.length - ok.length;
    this.dialog = null;
    this.clearFilters();
    this.showToast(`${ok.length} device${ok.length === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped` : ''}.`);
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
