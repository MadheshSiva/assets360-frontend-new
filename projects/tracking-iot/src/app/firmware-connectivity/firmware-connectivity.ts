import { Component, HostListener, NgZone, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  Antenna,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bluetooth,
  Calendar,
  Check,
  CircleCheck,
  Cpu,
  Database,
  Download,
  Ellipsis,
  FileText,
  FlaskConical,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Router,
  Search,
  Settings,
  ShieldCheck,
  Thermometer,
  TriangleAlert,
  Truck,
  Wifi,
  X,
} from 'lucide-angular';
import { CAMPAIGNS, Campaign, CampaignStatus, Conn, DeviceModel, GATEWAYS, Gateway, MODELS, ModelKind, NetworkProfile, PREVIOUS, PROFILES, Protocol, SITES, signalSeries, trend } from './firmware-data';

type Tab = 'overview' | 'inventory' | 'campaigns' | 'diagnostics' | 'profiles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICONS: Record<ModelKind, typeof Cpu> = { sensor: Thermometer, beacon: Bluetooth, tracker: Truck, vibration: Activity, tag: Package };
/** Signal chart series: categorical hues, identified by legend + tooltip as well. */
const WIFI_COLOR = '#7c3aed';
const CELL_COLOR = '#14b8a6';
const SW = 380;
const SH = 130;
const SPAD = { l: 34, r: 8, t: 8, b: 20 };

@Component({
  selector: 'app-firmware-connectivity',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './firmware-connectivity.html',
  styleUrls: ['./firmware-connectivity.css', './firmware-connectivity-sections.css'],
})
export class FirmwareConnectivity implements OnDestroy {
  readonly icons = { Activity, Antenna, ArrowDown, ArrowRight, ArrowUp, Calendar, Check, CircleCheck, Cpu, Database, Download, Ellipsis, FileText, FlaskConical, Pause, Pencil, Play, Plus, RadioTower, RefreshCw, Router, Search, Settings, ShieldCheck, TriangleAlert, Wifi, X };
  readonly models = MODELS;
  readonly campaigns = CAMPAIGNS;
  readonly sites = SITES;
  readonly gateways = GATEWAYS;
  readonly profiles = PROFILES;
  readonly protocols: Protocol[] = ['Wi-Fi / Ethernet', 'Cellular', 'LoRaWAN', 'BLE'];
  readonly windows = ['Sun 02:00 – 06:00 (GST)', 'Daily 01:00 – 04:00 (GST)', 'Fri 22:00 – Sat 04:00 (GST)', 'Immediately'];
  readonly retries = ['1 attempt', '2 attempts', '3 attempts', '5 attempts'];
  readonly wifiColor = WIFI_COLOR;
  readonly cellColor = CELL_COLOR;
  readonly sw = SW;
  readonly sh = SH;
  readonly spad = SPAD;

  tab: Tab = 'inventory';
  // inventory filters
  modelSearch = '';
  modelStatus: '' | 'update' | 'current' = '';
  modelFilter = '';
  sortDevices: 'none' | 'desc' | 'asc' = 'none';
  // diagnostics filters
  dSite = '';
  dProtocol: Protocol | '' = '';
  dStatus: Conn | '' = '';
  dModel = '';
  signalGateway = '';
  hoverSignal: number | null = null;
  // policy
  window = this.windows[0];
  retry = '3 attempts';
  rollback = true;

  selectedCampaignId = CAMPAIGNS[0].id;
  menuOpen = '';
  notesOf: DeviceModel | null = null;
  form: { name: string; models: string[]; window: string; start: 'now' | 'window' } | null = null;
  formError = '';
  profileForm: NetworkProfile | null = null;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private ticker?: ReturnType<typeof setInterval>;
  private readonly zone = inject(NgZone);

  constructor() {
    // live progress of running campaigns (one device every few seconds)
    this.zone.runOutsideAngular(() => {
      this.ticker = setInterval(() => this.zone.run(() => this.tick()), 4000);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====

  get totals() {
    const devices = MODELS.reduce((t, m) => t + m.devices, 0);
    const online = MODELS.reduce((t, m) => t + m.online, 0);
    const updates = MODELS.filter((m) => this.hasUpdate(m)).reduce((t, m) => t + this.pendingOf(m), 0);
    const updateModels = MODELS.filter((m) => this.hasUpdate(m)).length;
    const issues = SITES.reduce((t, s) => t + s.issues, 0);
    const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
    return {
      devices, online, onlineChange: pct(online, PREVIOUS.online),
      updates, updateModels, updatesChange: pct(updates, PREVIOUS.updates),
      campaigns: CAMPAIGNS.length, running: CAMPAIGNS.filter((c) => c.status === 'Running' || c.status === 'Paused').length, completed: CAMPAIGNS.filter((c) => c.status === 'Completed').length,
      issues, issueSites: SITES.length, issuesChange: pct(issues, PREVIOUS.issues),
    };
  }

  private sparkCache = new Map<string, string>();

  spark(key: string, seed: number, start: number, last: number, wobble: number, w = 84, h = 30): string {
    const k = `${key}|${last}`;
    let d = this.sparkCache.get(k);
    if (!d) {
      const v = trend(seed, start, last, wobble);
      const min = Math.min(...v);
      const max = Math.max(...v);
      d = v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((y - min) / Math.max(1, max - min)) * (h - 4)).toFixed(1)}`).join('');
      this.sparkCache.set(k, d);
    }
    return d;
  }

  campaignBars(): number[] {
    return [3, 5, 4, 7, 6, 9, 11, 8];
  }

  // ===== Inventory =====

  hasUpdate(m: DeviceModel): boolean {
    return m.current !== m.latest;
  }

  /** Devices of a model still waiting for the latest version (the running campaign updates them). */
  pendingOf(m: DeviceModel): number {
    if (!this.hasUpdate(m)) return 0;
    return m.devices;
  }

  kindIcon(m: DeviceModel) {
    return KIND_ICONS[m.kind];
  }

  get modelRows(): DeviceModel[] {
    const q = this.modelSearch.trim().toLowerCase();
    const rows = MODELS.filter((m) => (!q || `${m.name} ${m.vendor} ${m.current} ${m.latest}`.toLowerCase().includes(q))
      && (!this.modelStatus || (this.modelStatus === 'update') === this.hasUpdate(m)) && (!this.modelFilter || m.id === this.modelFilter));
    if (this.sortDevices !== 'none') rows.sort((a, b) => (this.sortDevices === 'desc' ? b.devices - a.devices : a.devices - b.devices));
    return rows;
  }

  cycleSort(): void {
    this.sortDevices = this.sortDevices === 'none' ? 'desc' : this.sortDevices === 'desc' ? 'asc' : 'none';
  }

  fmtDate(iso: string): string {
    return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  }

  // ===== Campaigns =====

  get selectedCampaign(): Campaign {
    return CAMPAIGNS.find((c) => c.id === this.selectedCampaignId) ?? CAMPAIGNS[0];
  }

  queued(c: Campaign): number {
    return Math.max(0, c.target - c.updated - c.failed);
  }

  pct(n: number, of: number): number {
    return of ? Math.round((n / of) * 100) : 0;
  }

  modelNames(c: Campaign): string {
    return c.models.length > 1 ? 'Multiple device models' : MODELS.find((m) => m.id === c.models[0])?.name ?? '';
  }

  statusClass(s: CampaignStatus): string {
    return 'cs--' + s.toLowerCase();
  }

  private tick(): void {
    for (const c of CAMPAIGNS) {
      if (c.status !== 'Running' || !this.queued(c)) continue;
      // about 1 in 30 updates fails
      if (Math.random() < 0.033) c.failed++;
      else c.updated++;
      if (!this.queued(c)) {
        c.status = 'Completed';
        for (const id of c.models) {
          const m = MODELS.find((x) => x.id === id);
          if (m) m.current = m.latest;
        }
        this.showToast(`${c.name} completed: ${c.updated} updated, ${c.failed} failed.`);
      }
    }
  }

  togglePause(c: Campaign): void {
    if (c.status === 'Running') {
      c.status = 'Paused';
      this.showToast(`${c.name} paused. Devices already updating will finish.`);
    } else if (c.status === 'Paused' || c.status === 'Scheduled') {
      c.status = 'Running';
      this.showToast(`${c.name} resumed.`);
    }
  }

  cancel(c: Campaign): void {
    this.menuOpen = '';
    if (!confirm(`Cancel ${c.name}? Queued devices keep their current firmware.`)) return;
    c.status = 'Cancelled';
    this.showToast(`${c.name} cancelled.`);
  }

  retryFailed(c: Campaign): void {
    this.menuOpen = '';
    if (!c.failed) return;
    const n = c.failed;
    c.failed = 0;
    if (c.status === 'Completed' || c.status === 'Cancelled') c.status = 'Running';
    this.showToast(`${n} failed devices queued again.`);
  }

  get stages(): { title: string; count: string; note: string }[] {
    const t = this.selectedCampaign.target;
    const pilot = Math.min(5, t);
    const ten = Math.round(t * 0.1);
    const half = Math.round(t * 0.5);
    return [
      { title: 'Pilot group', count: `${pilot} devices`, note: 'Validate on a small group' },
      { title: '10% batch', count: `~${ten} devices`, note: 'Auto-rollout if healthy' },
      { title: '50% batch', count: `~${half} devices`, note: 'Monitor for issues' },
      { title: 'Full rollout', count: 'Remaining devices', note: 'Complete deployment' },
    ];
  }

  /** Stage the selected campaign has reached. */
  get stageIndex(): number {
    const c = this.selectedCampaign;
    const done = c.updated + c.failed;
    if (c.status === 'Completed') return 4;
    if (done < 5) return 0;
    if (done < c.target * 0.1) return 1;
    if (done < c.target * 0.5) return 2;
    return 3;
  }

  openCreate(model?: DeviceModel): void {
    this.menuOpen = '';
    this.formError = '';
    const pending = MODELS.filter((m) => this.hasUpdate(m)).map((m) => m.id);
    this.form = { name: model ? `${model.name} ${model.latest}` : `Firmware rollout – ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`, models: model ? [model.id] : pending, window: this.window, start: 'window' };
  }

  toggleFormModel(id: string): void {
    const f = this.form;
    if (!f) return;
    f.models = f.models.includes(id) ? f.models.filter((x) => x !== id) : [...f.models, id];
  }

  get formTarget(): number {
    return this.form ? MODELS.filter((m) => this.form!.models.includes(m.id)).reduce((t, m) => t + this.pendingOf(m), 0) : 0;
  }

  get updatableModels(): DeviceModel[] {
    return MODELS.filter((m) => this.hasUpdate(m));
  }

  saveCampaign(): void {
    const f = this.form;
    if (!f) return;
    if (!f.name.trim()) return void (this.formError = 'Enter a campaign name.');
    if (!f.models.length) return void (this.formError = 'Choose at least one device model.');
    const busy = CAMPAIGNS.find((c) => (c.status === 'Running' || c.status === 'Paused' || c.status === 'Scheduled') && c.models.some((m) => f.models.includes(m)));
    if (busy) return void (this.formError = `${busy.name} already updates some of these models. Pause or finish it first.`);
    const n = Math.max(0, ...CAMPAIGNS.map((c) => Number(c.id.split('-')[2]) || 0)) + 1;
    const c: Campaign = {
      id: `CMP-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`, name: f.name.trim(), models: [...f.models], started: new Date().toISOString().slice(0, 10),
      status: f.start === 'now' ? 'Running' : 'Scheduled', target: this.formTarget, updated: 0, failed: 0, window: f.start === 'now' ? 'Immediately' : f.window,
    };
    CAMPAIGNS.unshift(c);
    this.selectedCampaignId = c.id;
    this.form = null;
    this.showToast(`${c.name} ${c.status === 'Running' ? 'started' : 'scheduled for ' + c.window}.`);
  }

  // ===== Diagnostics =====

  siteName(code: string): string {
    return SITES.find((s) => s.code === code)?.name ?? code;
  }

  siteHealth(s: (typeof SITES)[number]): 'Healthy' | 'Degraded' | 'Offline' {
    return s.health >= 90 ? 'Healthy' : s.health >= 60 ? 'Degraded' : 'Offline';
  }

  get gatewayModels(): string[] {
    return [...new Set(GATEWAYS.map((g) => g.model))];
  }

  get filteredGateways(): Gateway[] {
    return GATEWAYS.filter((g) => (!this.dSite || g.site === this.dSite) && (!this.dProtocol || g.protocol === this.dProtocol) && (!this.dStatus || g.conn === this.dStatus) && (!this.dModel || g.model === this.dModel));
  }

  get filteredSites() {
    return SITES.filter((s) => !this.dSite || s.code === this.dSite);
  }

  connClass(c: Conn): string {
    return 'cn--' + c.toLowerCase();
  }

  protocolIcon(p: Protocol) {
    return p === 'Cellular' ? RadioTower : p === 'LoRaWAN' ? Antenna : p === 'BLE' ? Bluetooth : Router;
  }

  ago(min: number): string {
    return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`;
  }

  private signalCache: { key: string; v: { wifi: string; cellular: string; wifiArea: string; xs: number[]; wy: number[]; cy: number[]; raw: { wifi: number[]; cellular: number[] } } } | null = null;

  get signal() {
    const key = this.signalGateway || this.dSite || 'all';
    if (this.signalCache?.key === key) return this.signalCache.v;
    const raw = signalSeries(key);
    const n = raw.wifi.length;
    const xs = raw.wifi.map((_, i) => SPAD.l + (i / (n - 1)) * (SW - SPAD.l - SPAD.r));
    const y = (v: number) => SH - SPAD.b - (v / 100) * (SH - SPAD.t - SPAD.b);
    const wy = raw.wifi.map(y);
    const cy = raw.cellular.map(y);
    const path = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${v.toFixed(1)}`).join('');
    const wifi = path(wy);
    const v = { wifi, cellular: path(cy), wifiArea: `${wifi}L${xs[n - 1]},${SH - SPAD.b}L${xs[0]},${SH - SPAD.b}Z`, xs, wy, cy, raw };
    this.signalCache = { key, v };
    return v;
  }

  readonly signalTicks = [0, 25, 50, 75, 100].map((p) => ({ p, y: SH - SPAD.b - (p / 100) * (SH - SPAD.t - SPAD.b) }));
  readonly signalHours = [0, 4, 8, 12, 16, 20].map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, x: SPAD.l + ((h * 2) / 47) * (SW - SPAD.l - SPAD.r) }));

  hourLabel(i: number): string {
    const m = i * 30;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // ===== Profiles =====

  editProfile(p?: NetworkProfile): void {
    this.formError = '';
    this.profileForm = p ? { ...p, sites: [...p.sites] } : { id: '', name: '', type: 'Wi-Fi / Ethernet', detail: '', security: '', sites: [], devices: 0, active: true };
  }

  toggleProfileSite(code: string): void {
    const f = this.profileForm;
    if (f) f.sites = f.sites.includes(code) ? f.sites.filter((s) => s !== code) : [...f.sites, code];
  }

  saveProfile(): void {
    const f = this.profileForm;
    if (!f) return;
    if (!f.name.trim()) return void (this.formError = 'Enter a profile name.');
    if (!f.sites.length) return void (this.formError = 'Choose at least one site.');
    const existing = PROFILES.find((p) => p.id === f.id);
    if (existing) Object.assign(existing, { ...f, name: f.name.trim() });
    else PROFILES.push({ ...f, id: `NP-${String(PROFILES.length + 1).padStart(2, '0')}`, name: f.name.trim() });
    this.profileForm = null;
    this.showToast(`Profile ${f.name.trim()} saved.`);
  }

  toggleProfile(p: NetworkProfile): void {
    if (p.active && p.devices && !confirm(`${p.devices} devices use ${p.name}. Disable it anyway?`)) return;
    p.active = !p.active;
    this.showToast(`${p.name} ${p.active ? 'enabled' : 'disabled'}.`);
  }

  siteCodes(p: NetworkProfile): string {
    return p.sites.join(', ');
  }

  // ===== Export / menus =====

  exportReport(): void {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(MODELS.map((m) => ({ 'Device Model': m.name, 'Current Version': m.current, 'Latest Version': m.latest, Devices: m.devices, Online: m.online, 'Update Status': this.hasUpdate(m) ? 'Update available' : 'Up to date', 'Release Date': m.releaseDate }))), 'Firmware');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(CAMPAIGNS.map((c) => ({ Campaign: c.name, ID: c.id, Status: c.status, Started: c.started, Target: c.target, Updated: c.updated, Failed: c.failed, Queued: this.queued(c), Window: c.window }))), 'Campaigns');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(SITES.map((s) => ({ Site: s.name, 'Health %': s.health, Status: this.siteHealth(s), Gateways: s.gateways, Online: s.online, Issues: s.issues }))), 'Sites');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(GATEWAYS.map((g) => ({ Gateway: g.id, Site: this.siteName(g.site), Protocol: g.protocol, Model: g.model, Connection: g.conn, 'Last Seen (min)': g.lastSeenMin, 'RSSI (dBm)': g.rssi, Devices: g.devices, Firmware: g.firmware }))), 'Gateways');
    XLSX.writeFile(book, `Firmware_Connectivity_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  toggleMenu(name: string, e: Event): void {
    e.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = '';
    this.form = null;
    this.notesOf = null;
    this.profileForm = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
