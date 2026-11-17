import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
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
  Trash2,
  TriangleAlert,
  Truck,
  Wifi,
  X,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import { DeviceConfigurationApiService } from '../device-configuration/device-configuration-api.service';
import { GATEWAY_TYPE, IoTDeviceDto, IoTDeviceLookupService, sameModel } from '../device-configuration/iot-device-lookup.service';
import { DeviceHealthApiService, DeviceHealthDto } from '../device-health/device-health-api.service';
import { Campaign, CampaignStatus, Conn, DeviceModel, Gateway, ModelKind, NetworkProfile, PROFILES, Protocol, Site } from './firmware-data';
import { FirmwareVersionApiService, FirmwareVersionDto, modelFromDto } from './firmware-version-api.service';

type Tab = 'overview' | 'inventory' | 'campaigns' | 'diagnostics' | 'profiles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICONS: Record<ModelKind, typeof Cpu> = { sensor: Thermometer, beacon: Bluetooth, tracker: Truck, vibration: Activity, tag: Package };
/** Signal chart series: categorical hues, identified by legend + tooltip as well. */
const WIFI_COLOR = '#7c3aed';
const CELL_COLOR = '#14b8a6';
const SW = 380;
const SH = 130;
const SPAD = { l: 34, r: 8, t: 8, b: 20 };

/** "v1.7.0" and "1.7.0" are the same version. */
const sameVersion = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase().replace(/^v/, '') === b.trim().toLowerCase().replace(/^v/, '');

/** Local yyyy-MM-ddTHH:mm, the datetime-local input format. */
function nowLocal(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

interface FirmwareForm { id: string; deviceModel: string; currentVersion: string; latestVersion: string; deviceCount: number | null; releaseDate: string; notes: string }

@Component({
  selector: 'app-firmware-connectivity',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './firmware-connectivity.html',
  styleUrls: ['./firmware-connectivity.css', './firmware-connectivity-sections.css', '../shared/iot-purple-theme.css'],
})
export class FirmwareConnectivity implements OnInit, OnDestroy {
  readonly icons = { Activity, Antenna, ArrowDown, ArrowRight, ArrowUp, Calendar, Check, CircleCheck, Cpu, Database, Download, Ellipsis, FileText, FlaskConical, Pause, Pencil, Play, Plus, RadioTower, RefreshCw, Router, Search, Settings, ShieldCheck, Trash2, TriangleAlert, Wifi, X };
  readonly profiles = PROFILES;
  readonly profileTypes: Protocol[] = ['Wi-Fi / Ethernet', 'Cellular', 'LoRaWAN', 'BLE'];
  readonly windows = ['Sun 02:00 – 06:00 (GST)', 'Daily 01:00 – 04:00 (GST)', 'Fri 22:00 – Sat 04:00 (GST)', 'Immediately'];
  readonly retries = ['1 attempt', '2 attempts', '3 attempts', '5 attempts'];
  readonly wifiColor = WIFI_COLOR;
  readonly cellColor = CELL_COLOR;
  readonly sw = SW;
  readonly sh = SH;
  readonly spad = SPAD;

  // data (loaded from the API)
  models: DeviceModel[] = [];
  campaigns: Campaign[] = [];
  sites: Site[] = [];
  gateways: Gateway[] = [];
  private iotDevices: IoTDeviceDto[] = [];
  private health: DeviceHealthDto[] = [];
  loading = true;
  loadError = '';
  busy = false;

  tab: Tab = 'inventory';
  // inventory filters
  modelSearch = '';
  modelStatus: '' | 'update' | 'current' = '';
  modelFilter = '';
  sortDevices: 'none' | 'desc' | 'asc' = 'none';
  // diagnostics filters
  dSite = '';
  dProtocol = '';
  dStatus: Conn | '' = '';
  dModel = '';
  signalGateway = '';
  hoverSignal: number | null = null;
  // policy (no API: kept for this session only)
  window = this.windows[0];
  retry = '3 attempts';
  rollback = true;

  selectedCampaignId = '';
  menuOpen = '';
  notesOf: DeviceModel | null = null;
  form: { models: string[]; at: string } | null = null;
  fwForm: FirmwareForm | null = null;
  formError = '';
  profileForm: NetworkProfile | null = null;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly firmwareApi = inject(FirmwareVersionApiService);
  private readonly configApi = inject(DeviceConfigurationApiService);
  private readonly devicesApi = inject(IoTDeviceLookupService);
  private readonly healthApi = inject(DeviceHealthApiService);

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Loading =====

  /** Firmware inventory is required; devices and health only enrich it, so their failures are reported but not fatal. */
  load(): void {
    this.loading = true;
    this.loadError = '';
    const errors: string[] = [];
    const soft = <T>(o: Observable<T[]>, what: string) => o.pipe(catchError((e) => { errors.push(apiErrorMessage(e, `Could not load ${what}.`)); return of([] as T[]); }));
    forkJoin({
      firmware: this.firmwareApi.list(),
      devices: soft(this.devicesApi.list(), 'IoT devices'),
      health: soft(this.healthApi.list(), 'device health'),
    }).subscribe({
      next: ({ firmware, devices, health }) => {
        this.iotDevices = devices;
        this.health = health;
        this.build(firmware);
        this.loading = false;
        if (errors.length) this.showToast(errors.join(' '));
      },
      error: (e) => {
        this.loading = false;
        this.loadError = apiErrorMessage(e, 'Could not load firmware versions.');
      },
    });
  }

  private healthOf(deviceId: string): DeviceHealthDto | undefined {
    return this.health.find((h) => h.deviceId === deviceId);
  }

  /** Devices of an inventory model. */
  devicesOf(m: DeviceModel): IoTDeviceDto[] {
    return this.iotDevices.filter((d) => sameModel(d.model, m.name));
  }

  private build(firmware: FirmwareVersionDto[]): void {
    this.models = firmware.map((dto) => {
      const m = modelFromDto(dto);
      const rows = this.health.filter((h) => sameModel(h.deviceModel, m.name));
      return { ...m, online: rows.length ? rows.filter((h) => h.connectivity === 'Online').length : null };
    });
    this.campaigns = this.buildCampaigns();
    this.gateways = this.buildGateways();
    this.sites = this.buildSites();
    if (!this.campaigns.some((c) => c.id === this.selectedCampaignId)) this.selectedCampaignId = this.campaigns[0]?.id ?? '';
  }

  private buildCampaigns(): Campaign[] {
    const groups = new Map<string, { model: DeviceModel | undefined; modelName: string; version: string; devices: IoTDeviceDto[] }>();
    for (const d of this.iotDevices) {
      if (!d.pendingFirmwareVersion) continue;
      const model = this.models.find((m) => sameModel(d.model, m.name));
      const key = `${model?.id ?? d.model}|${d.pendingFirmwareVersion.toLowerCase()}`;
      const g = groups.get(key) ?? { model, modelName: model?.name ?? d.model, version: d.pendingFirmwareVersion, devices: [] };
      g.devices.push(d);
      groups.set(key, g);
    }
    const now = Date.now();
    return [...groups.entries()].map(([key, g]) => {
      const times = g.devices.map((d) => d.firmwareUpdateScheduledAt).filter((t): t is string => !!t).sort();
      const first = times[0] ?? '';
      const updated = this.iotDevices.filter((d) => sameModel(d.model, g.modelName) && !d.pendingFirmwareVersion && sameVersion(d.firmwareVersion, g.version)).length;
      const status: CampaignStatus = times.some((t) => Date.parse(t) > now) ? 'Scheduled' : 'Running';
      return {
        id: key,
        name: `${g.modelName} ${g.version}`,
        models: g.model ? [g.model.id] : [],
        started: first,
        status,
        target: g.devices.length + updated,
        updated,
        failed: null,
        window: first ? this.fmtDateTime(first) : '—',
        targetVersion: g.version,
        pendingDeviceIds: g.devices.map((d) => d.deviceId),
      };
    }).sort((a, b) => b.started.localeCompare(a.started));
  }

  private buildGateways(): Gateway[] {
    const now = Date.now();
    return this.iotDevices
      .filter((d) => d.deviceType.toLowerCase() === GATEWAY_TYPE.toLowerCase())
      .map((d) => {
        const h = this.healthOf(d.deviceId);
        const seen = h?.lastSeenAt ?? d.lastSeenAt;
        const conn: Conn | null = !h ? null : h.connectivity === 'Online' ? 'Online' : h.connectivity === 'Warning' ? 'Degraded' : 'Offline';
        return {
          id: d.deviceId,
          site: d.siteId || d.siteName || '',
          protocol: d.connectivity || '—',
          model: d.model || '—',
          conn,
          lastSeenMin: seen ? Math.max(0, Math.round((now - Date.parse(seen)) / 60000)) : null,
          rssi: h?.signalStrengthDbm ?? null,
          devices: this.iotDevices.filter((x) => x.gateway === d.deviceId).length,
          firmware: d.firmwareVersion || '—',
        };
      });
  }

  private buildSites(): Site[] {
    const bySite = new Map<string, { name: string; devices: IoTDeviceDto[] }>();
    for (const d of this.iotDevices) {
      const code = d.siteId || d.siteName;
      if (!code) continue;
      const s = bySite.get(code) ?? { name: d.siteName || code, devices: [] };
      s.devices.push(d);
      bySite.set(code, s);
    }
    return [...bySite.entries()].map(([code, s]) => {
      const reports = s.devices.map((d) => this.healthOf(d.deviceId)).filter((h): h is DeviceHealthDto => !!h);
      const gws = this.gateways.filter((g) => g.site === code);
      return {
        code,
        name: s.name,
        health: reports.length ? Math.round((reports.filter((h) => h.connectivity === 'Online').length / reports.length) * 100) : null,
        gateways: gws.length,
        online: gws.filter((g) => g.conn === 'Online').length,
        issues: reports.filter((h) => h.connectivity !== 'Online').length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ===== KPIs =====

  get totals() {
    const updateModels = this.models.filter((m) => this.hasUpdate(m));
    return {
      devices: this.iotDevices.length,
      online: this.health.length ? this.health.filter((h) => h.connectivity === 'Online').length : null,
      updates: updateModels.reduce((t, m) => t + this.pendingOf(m), 0),
      updateModels: updateModels.length,
      fleetDevices: this.models.reduce((t, m) => t + m.devices, 0),
      campaigns: this.campaigns.length,
      running: this.campaigns.filter((c) => c.status === 'Running').length,
      scheduled: this.campaigns.filter((c) => c.status === 'Scheduled').length,
      issues: this.sites.reduce((t, s) => t + s.issues, 0),
      issueSites: this.sites.filter((s) => s.issues).length,
    };
  }

  // ===== Inventory =====

  hasUpdate(m: DeviceModel): boolean {
    return m.updateAvailable;
  }

  /** Devices of a model still waiting for the latest version. */
  pendingOf(m: DeviceModel): number {
    return this.hasUpdate(m) ? m.devices : 0;
  }

  kindIcon(m: DeviceModel) {
    return KIND_ICONS[m.kind];
  }

  get modelRows(): DeviceModel[] {
    const q = this.modelSearch.trim().toLowerCase();
    const rows = this.models.filter((m) => (!q || `${m.name} ${m.current} ${m.latest}`.toLowerCase().includes(q))
      && (!this.modelStatus || (this.modelStatus === 'update') === this.hasUpdate(m)) && (!this.modelFilter || m.id === this.modelFilter));
    if (this.sortDevices !== 'none') rows.sort((a, b) => (this.sortDevices === 'desc' ? b.devices - a.devices : a.devices - b.devices));
    return rows;
  }

  cycleSort(): void {
    this.sortDevices = this.sortDevices === 'none' ? 'desc' : this.sortDevices === 'desc' ? 'asc' : 'none';
  }

  /** dd Mon yyyy for a yyyy-MM-dd… value; '—' when empty. */
  fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  }

  fmtDateTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const z = (n: number) => String(n).padStart(2, '0');
    return `${z(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  /** Model names already in the device registry, for the add form's suggestions. */
  get registryModels(): string[] {
    return [...new Set(this.iotDevices.filter((d) => d.deviceType.toLowerCase() !== GATEWAY_TYPE.toLowerCase()).map((d) => d.model).filter((m) => m))].sort();
  }

  editFirmware(m?: DeviceModel): void {
    this.menuOpen = '';
    this.formError = '';
    this.fwForm = m
      ? { id: m.id, deviceModel: m.name, currentVersion: m.current, latestVersion: m.latest, deviceCount: m.devices, releaseDate: m.releaseDate, notes: m.notes.join('\n') }
      : { id: '', deviceModel: '', currentVersion: '', latestVersion: '', deviceCount: null, releaseDate: '', notes: '' };
  }

  /** Pre-fills the device count from the registry when a model is picked. */
  onFormModel(name: string): void {
    const f = this.fwForm;
    if (!f) return;
    f.deviceModel = name;
    if (!f.id && f.deviceCount === null) {
      const n = this.iotDevices.filter((d) => sameModel(d.model, name)).length;
      if (n) f.deviceCount = n;
    }
  }

  saveFirmware(): void {
    const f = this.fwForm;
    if (!f || this.busy) return;
    if (!f.deviceModel.trim()) return void (this.formError = 'Enter the device model.');
    if (!f.currentVersion.trim() || !f.latestVersion.trim()) return void (this.formError = 'Enter the current and latest versions.');
    if (f.deviceCount !== null && (f.deviceCount as unknown) !== '' && Number(f.deviceCount) < 0) return void (this.formError = 'Devices cannot be negative.');
    const fields = {
      deviceModel: f.deviceModel,
      currentVersion: f.currentVersion,
      latestVersion: f.latestVersion,
      deviceCount: f.deviceCount === null || (f.deviceCount as unknown) === '' ? null : Number(f.deviceCount),
      releaseDate: f.releaseDate,
      releaseNotes: f.notes.split('\n'),
    };
    this.busy = true;
    (f.id ? this.firmwareApi.update(f.id, fields) : this.firmwareApi.create(fields)).subscribe({
      next: (saved) => {
        this.busy = false;
        this.fwForm = null;
        this.showToast(`${saved.deviceModel} ${f.id ? 'updated' : 'added'}.`);
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.formError = apiErrorMessage(e, 'Could not save the firmware version.');
      },
    });
  }

  deleteFirmware(m: DeviceModel): void {
    this.menuOpen = '';
    if (this.busy || !confirm(`Delete the firmware record of ${m.name}?`)) return;
    this.busy = true;
    this.firmwareApi.delete(m.id, m.name).subscribe({
      next: () => {
        this.busy = false;
        this.showToast(`${m.name} deleted.`);
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not delete ${m.name}.`));
      },
    });
  }

  // ===== Campaigns =====

  get selectedCampaign(): Campaign | null {
    return this.campaigns.find((c) => c.id === this.selectedCampaignId) ?? this.campaigns[0] ?? null;
  }

  queued(c: Campaign): number {
    return Math.max(0, c.target - c.updated - (c.failed ?? 0));
  }

  pct(n: number, of: number): number {
    return of ? Math.round((n / of) * 100) : 0;
  }

  modelNames(c: Campaign): string {
    return c.models.length > 1 ? 'Multiple device models' : this.models.find((m) => m.id === c.models[0])?.name ?? c.name.replace(` ${c.targetVersion}`, '');
  }

  statusClass(s: CampaignStatus): string {
    return 'cs--' + s.toLowerCase();
  }

  /** Cancels the scheduled update of every device still waiting in the campaign. */
  cancel(c: Campaign): void {
    this.menuOpen = '';
    if (this.busy || !confirm(`Cancel ${c.name}? ${c.pendingDeviceIds.length} queued device(s) keep their current firmware.`)) return;
    this.busy = true;
    const calls = c.pendingDeviceIds.map((id) => this.configApi.cancelFirmware(id).pipe(map(() => true), catchError(() => of(false))));
    forkJoin(calls.length ? calls : [of(true)]).subscribe((results) => {
      this.busy = false;
      const failed = results.filter((ok) => !ok).length;
      this.showToast(failed ? `${c.name}: ${failed} of ${results.length} device(s) could not be cancelled.` : `${c.name} cancelled.`);
      this.load();
    });
  }

  get stages(): { title: string; count: string; note: string }[] {
    const t = this.selectedCampaign?.target ?? 0;
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
    if (!c) return 0;
    const done = c.updated + (c.failed ?? 0);
    if (c.status === 'Completed') return 4;
    if (done < 5) return 0;
    if (done < c.target * 0.1) return 1;
    if (done < c.target * 0.5) return 2;
    return 3;
  }

  /** Devices of a model that would receive its latest firmware (not on it yet, no update already scheduled). */
  private eligible(m: DeviceModel): IoTDeviceDto[] {
    return this.devicesOf(m).filter((d) => !d.pendingFirmwareVersion && !sameVersion(d.firmwareVersion, m.latest));
  }

  eligibleCount(m: DeviceModel): number {
    return this.eligible(m).length;
  }

  openCreate(model?: DeviceModel): void {
    this.menuOpen = '';
    this.formError = '';
    this.form = { models: model ? [model.id] : this.updatableModels.map((m) => m.id), at: '' };
  }

  toggleFormModel(id: string): void {
    const f = this.form;
    if (!f) return;
    f.models = f.models.includes(id) ? f.models.filter((x) => x !== id) : [...f.models, id];
  }

  get formTarget(): number {
    const f = this.form;
    return f ? this.models.filter((m) => f.models.includes(m.id)).reduce((t, m) => t + this.eligibleCount(m), 0) : 0;
  }

  get updatableModels(): DeviceModel[] {
    return this.models.filter((m) => this.hasUpdate(m));
  }

  /** Schedules the latest firmware on every eligible device of the chosen models. */
  saveCampaign(): void {
    const f = this.form;
    if (!f || this.busy) return;
    if (!f.models.length) return void (this.formError = 'Choose at least one device model.');
    if (!f.at || f.at <= nowLocal()) return void (this.formError = 'Choose a future install date and time.');
    const chosen = this.models.filter((m) => f.models.includes(m.id));
    const jobs = chosen.flatMap((m) => this.eligible(m).map((d) => ({ d, m })));
    if (!jobs.length) return void (this.formError = 'No registered device of these models needs the update (or an update is already scheduled).');
    const at = new Date(f.at).toISOString();
    this.busy = true;
    forkJoin(jobs.map(({ d, m }) => this.configApi.scheduleFirmware(d.deviceId, at, m.latest).pipe(map(() => '' as string), catchError((e) => of(apiErrorMessage(e, d.deviceId)))))).subscribe((results) => {
      this.busy = false;
      const errors = results.filter((r) => r);
      if (errors.length === results.length) {
        this.formError = `Could not schedule the update: ${errors[0]}`;
        return;
      }
      this.form = null;
      this.showToast(errors.length ? `Update scheduled on ${results.length - errors.length} of ${results.length} devices. ${errors[0]}` : `Update scheduled on ${results.length} device(s) for ${this.fmtDateTime(at)}.`);
      this.load();
    });
  }

  // ===== Diagnostics =====

  siteName(code: string): string {
    return this.sites.find((s) => s.code === code)?.name ?? (code || '—');
  }

  siteHealth(s: Site): 'Healthy' | 'Degraded' | 'Offline' | null {
    return s.health === null ? null : s.health >= 90 ? 'Healthy' : s.health >= 60 ? 'Degraded' : 'Offline';
  }

  get protocols(): string[] {
    return [...new Set(this.gateways.map((g) => g.protocol))].sort();
  }

  get gatewayModels(): string[] {
    return [...new Set(this.gateways.map((g) => g.model))];
  }

  get filteredGateways(): Gateway[] {
    return this.gateways.filter((g) => (!this.dSite || g.site === this.dSite) && (!this.dProtocol || g.protocol === this.dProtocol) && (!this.dStatus || g.conn === this.dStatus) && (!this.dModel || g.model === this.dModel));
  }

  get filteredSites(): Site[] {
    return this.sites.filter((s) => !this.dSite || s.code === this.dSite);
  }

  connClass(c: Conn | null): string {
    return 'cn--' + (c ?? 'offline').toLowerCase();
  }

  protocolIcon(p: string) {
    const n = p.toLowerCase();
    return n.includes('cell') || n.includes('lte') ? RadioTower : n.includes('lora') ? Antenna : n.includes('ble') || n.includes('bluetooth') ? Bluetooth : Router;
  }

  ago(min: number | null): string {
    if (min === null) return '—';
    return min < 60 ? `${min} min ago` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min ago` : `${Math.floor(min / 1440)} d ago`;
  }

  private signalCache: { key: string; v: { wifi: string; cellular: string; wifiArea: string; xs: number[]; wy: number[]; cy: number[]; raw: { wifi: number[]; cellular: number[] } } } | null = null;

  /** Signal quality (%) samples every 30 min over 24 h. No API provides this history yet, so the chart shows its empty state. */
  signalRaw: { wifi: number[]; cellular: number[] } = { wifi: [], cellular: [] };

  get signal() {
    const key = this.signalGateway || this.dSite || 'all';
    const raw = this.signalRaw;
    if (this.signalCache?.key === key && this.signalCache.v.raw === raw) return this.signalCache.v;
    const n = raw.wifi.length;
    if (n < 2 || raw.cellular.length !== n) return null;
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

  // ===== Profiles (no API: session only) =====

  editProfile(p?: NetworkProfile): void {
    this.formError = '';
    this.profileForm = p ? { ...p, sites: [...p.sites] } : { id: '', name: '', type: '' as Protocol, detail: '', security: '', sites: [], devices: 0, active: true };
  }

  toggleProfileSite(code: string): void {
    const f = this.profileForm;
    if (f) f.sites = f.sites.includes(code) ? f.sites.filter((s) => s !== code) : [...f.sites, code];
  }

  saveProfile(): void {
    const f = this.profileForm;
    if (!f) return;
    if (!f.name.trim()) return void (this.formError = 'Enter a profile name.');
    if (!f.type) return void (this.formError = 'Choose a profile type.');
    if (!f.sites.length) return void (this.formError = 'Choose at least one site.');
    const existing = PROFILES.find((p) => p.id === f.id);
    if (existing) Object.assign(existing, { ...f, name: f.name.trim() });
    else PROFILES.push({ ...f, id: `NP-${String(PROFILES.length + 1).padStart(2, '0')}`, name: f.name.trim() });
    this.profileForm = null;
    this.showToast(`Profile ${f.name.trim()} saved for this session.`);
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
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.models.map((m) => ({ 'Device Model': m.name, 'Current Version': m.current, 'Latest Version': m.latest, Devices: m.devices, Online: m.online ?? '', 'Update Status': this.hasUpdate(m) ? 'Update available' : 'Up to date', 'Release Date': m.releaseDate }))), 'Firmware');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.campaigns.map((c) => ({ Campaign: c.name, Status: c.status, 'Install At': c.window, Target: c.target, Updated: c.updated, Queued: this.queued(c) }))), 'Campaigns');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.sites.map((s) => ({ Site: s.name, 'Health %': s.health ?? '', Status: this.siteHealth(s) ?? '', Gateways: s.gateways, Online: s.online, Issues: s.issues }))), 'Sites');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.gateways.map((g) => ({ Gateway: g.id, Site: this.siteName(g.site), Protocol: g.protocol, Model: g.model, Connection: g.conn ?? '', 'Last Seen (min)': g.lastSeenMin ?? '', 'RSSI (dBm)': g.rssi ?? '', Devices: g.devices, Firmware: g.firmware }))), 'Gateways');
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
    this.fwForm = null;
    this.notesOf = null;
    this.profileForm = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
