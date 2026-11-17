import { Component, DoCheck, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, forkJoin, map, of } from 'rxjs';
import { AuthService } from 'shared-ui';
import {
  LucideAngularModule,
  Activity, Antenna, AudioWaveform, Battery, Bell, Bluetooth, Building2, Calendar, ChartColumn, Check, CircleAlert, CircleCheck, CircleX,
  Clock, Copy, Cpu, Droplets, Eye, Gauge, History, IdCard, Info, Key, LayoutDashboard, MapPin, Move3d, Pencil, Plus, RadioTower, RotateCcw, Save,
  Send, ShieldCheck, SignalHigh, Thermometer, Trash2, TriangleAlert, X, Zap,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import { AlertRule, ConfigVersion, Device, DeviceConfig, DeviceOption, HistoryEvent, ParamIcon, TelemetryParam, VersionStatus, blankConfig, protocolKind } from './config-data';
import {
  ConfigOptionsDto, ConfigOverviewDto, ConfigValidationDto, DeviceConfigurationApiService, SaveConfigRequest,
  activityFromDto, configFromDto, configToRequest, ruleFromDto, ruleToRequest, versionFromDto,
} from './device-configuration-api.service';
import { IoTDeviceLookupService } from './iot-device-lookup.service';

type Tab = 'overview' | 'connectivity' | 'telemetry' | 'alerts' | 'firmware' | 'history';
type CheckState = 'ok' | 'warn' | 'fail';
interface Check { title: string; sub: string; state: CheckState; tab: Tab }
interface Panel {
  key: string; name: string; unit: string; color: string; enabled: boolean; top: number; bottom: number;
  path: string; band: string; ticks: { y: number; label: string }[]; ys: number[]; values: number[]; dots: { x: number; y: number }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ICONS: Record<ParamIcon, typeof Thermometer> = { temp: Thermometer, hum: Droplets, battery: Battery, rssi: SignalHigh, snr: AudioWaveform, vib: Activity, accel: Move3d, speed: Gauge, volt: Zap, ign: Key };
const COLORS = ['#6d28d9', '#0f9f94', '#2563eb'];
const HEX16 = /^[0-9A-Fa-f]{16}$/;
const CHECK_TABS: Record<string, Tab> = { connectivity: 'connectivity', telemetry: 'telemetry', alertRules: 'alerts', firmware: 'firmware' };
const CW = 560;
const PH = 62;
const PGAP = 16;
const PAD = { l: 44, r: 10, t: 8, b: 20 };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Local yyyy-MM-ddTHH:mm, the datetime-local input format. */
function nowLocal(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function convert(v: number, from: string, to: string, delta = false): number {
  if (from === to) return v;
  if (from === '°C' && to === '°F') return delta ? v * 1.8 : v * 1.8 + 32;
  if (from === '°F' && to === '°C') return delta ? v / 1.8 : (v - 32) / 1.8;
  if (from === 'km/h' && to === 'mph') return v * 0.621371;
  if (from === 'mph' && to === 'km/h') return v / 0.621371;
  return v;
}
const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

@Component({
  selector: 'app-device-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-configuration.html',
  styleUrls: ['./device-configuration.css', './device-configuration-sections.css', '../shared/iot-purple-theme.css'],
})
export class DeviceConfiguration implements OnInit, DoCheck, OnDestroy {
  readonly icons = { Antenna, Bell, Bluetooth, Building2, Calendar, ChartColumn, Check, CircleAlert, CircleCheck, CircleX, Clock, Copy, Cpu, Eye, History, IdCard, Info, LayoutDashboard, Pencil, Plus, RadioTower, RotateCcw, Save, Send, ShieldCheck, Thermometer, Trash2, TriangleAlert, X, Battery };
  readonly cw = CW;
  readonly pad = PAD;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'connectivity', label: 'Connectivity' }, { id: 'telemetry', label: 'Telemetry' },
    { id: 'alerts', label: 'Alerts' }, { id: 'firmware', label: 'Firmware' }, { id: 'history', label: 'History' },
  ];
  /** Preview covers the 24 h before the page was opened. */
  private readonly previewStart = Date.now() - 24 * 3600000;
  readonly hourTicks = [0, 8, 16, 24, 32, 40, 48].map((i) => ({ i, x: this.px(i), label: this.timeLabel(i) }));
  /** Last-24 h telemetry per parameter key (49 half-hourly points). No telemetry feed is wired to this page yet. */
  private telemetry: Record<string, number[]> = {};

  /** Dropdown option lists from GET /api/device-configurations/options. */
  options: ConfigOptionsDto | null = null;
  devices: DeviceOption[] = [];
  loadingDevices = true;
  loadingDevice = false;
  busy = false;
  loadError = '';

  tab: Tab = 'connectivity';
  device: Device | null = null;
  private overview: ConfigOverviewDto | null = null;
  versions: ConfigVersion[] = [];
  events: HistoryEvent[] = [];
  deviceId = '';
  form: DeviceConfig = blankConfig();
  private baseline = JSON.stringify(this.form);
  /** Server checks and the form snapshot they were computed for. */
  private validation: { snap: string; checks: Check[] } = { snap: '', checks: [] };
  private validateTimer?: ReturnType<typeof setTimeout>;
  private validateSub?: Subscription;
  deploy: 'immediate' | 'scheduled' = 'immediate';
  scheduleAt = '';
  rollout: 'device' | 'group' = 'device';
  group = '';
  applyError = '';
  hover: number | null = null;
  menuOpen = '';
  toast = '';
  alertForm: (AlertRule & { isNew: boolean }) | null = null;
  alertError = '';
  diffOf: ConfigVersion | null = null;
  diffConfigs: { before: DeviceConfig | null; after: DeviceConfig } | null = null;
  diffLoading = false;
  fwDialog: { at: string } | null = null;
  fwError = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DeviceConfigurationApiService);
  private readonly lookup = inject(IoTDeviceLookupService);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.api.options().subscribe({ next: (o) => (this.options = o), error: (e) => this.showToast(apiErrorMessage(e, 'Could not load configuration options.')) });
    this.lookup.list().subscribe({
      next: (rows) => {
        this.devices = rows
          .map((d) => ({ id: d.deviceId, label: `${d.deviceType} ${d.deviceId}`, type: d.deviceType, protocol: d.connectivity }))
          .sort((a, b) => a.id.localeCompare(b.id));
        this.loadingDevices = false;
        const q = this.route.snapshot.queryParamMap.get('device');
        const first = this.devices.find((x) => x.id === q) ?? this.devices[0];
        if (first) this.loadDevice(first.id);
      },
      error: (e) => {
        this.loadingDevices = false;
        this.loadError = apiErrorMessage(e, 'Could not load devices.');
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    clearTimeout(this.validateTimer);
    this.validateSub?.unsubscribe();
  }

  /** Re-checks the configuration on the server shortly after the form changes. */
  ngDoCheck(): void {
    if (!this.device || this.loadingDevice || this.validateTimer) return;
    const snap = JSON.stringify(this.form);
    if (snap === this.validation.snap) return;
    this.validateTimer = setTimeout(() => {
      this.validateTimer = undefined;
      this.runValidation(false);
    }, 700);
  }

  // ===== Option lists =====

  get regions(): string[] { return this.options?.regions ?? []; }
  get joinModes(): string[] { return this.options?.joinModes ?? []; }
  get intervalUnits(): string[] { return this.options?.intervalUnits ?? []; }
  get autoRate(): string { return this.options?.dataRates[0] ?? ''; }
  get dataRates(): string[] { return (this.options?.dataRates ?? []).slice(1); }
  get samplings(): number[] { return this.options?.samplingIntervalsSeconds ?? []; }
  get batteryIntervals(): string[] { return this.options?.batteryReportIntervals ?? []; }
  get aggs(): string[] { return this.options?.aggregations ?? []; }
  get conds(): string[] { return this.options?.alertConditions ?? []; }
  get severities(): string[] { return this.options?.alertSeverities ?? []; }
  get notifyOptions(): string[] { return this.options?.notifyChannels ?? []; }

  // ===== Loading & versions =====

  /** Selected device; only used where the template guarantees one is loaded. */
  private get dev(): Device {
    if (!this.device) throw new Error('No device selected');
    return this.device;
  }

  private get currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || '—';
  }

  /** Loads the device's overview, versions and activity. With keepForm the unsaved form stays as it is. */
  private loadDevice(id: string, keepForm = false, done?: () => void): void {
    this.deviceId = id;
    this.loadingDevice = !keepForm;
    if (!keepForm) this.loadError = '';
    forkJoin({ ov: this.api.overview(id), versions: this.api.versions(id), activity: this.api.activity(id) }).subscribe({
      next: ({ ov, versions, activity }) => {
        this.overview = ov;
        this.device = this.toDevice(ov);
        this.versions = versions.map(versionFromDto).sort((a, b) => a.v - b.v);
        this.events = activity.map(activityFromDto);
        if (!keepForm) {
          this.form = configFromDto(ov.editable);
          const loaded = JSON.stringify(this.form);
          // prefill a protocol the saved settings lack (see toDevice), so the next save sends it
          if (!this.form.protocol) this.form.protocol = this.device.protocol;
          this.baseline = JSON.stringify(this.form);
          const ed = ov.editable;
          this.deploy = ed.deploymentMode === 'Scheduled' && ov.draft ? 'scheduled' : 'immediate';
          this.scheduleAt = '';
          this.rollout = ed.rolloutTarget === 'Device group' && ov.draft ? 'group' : 'device';
          this.group = ed.deviceGroup ?? '';
          this.applyError = '';
          this.hover = null;
          // a differing snapshot makes ngDoCheck re-validate with the prefilled protocol
          this.validation = { snap: loaded, checks: this.toChecks(ov.validation) };
        }
        this.loadingDevice = false;
        done?.();
      },
      error: (e) => {
        this.loadingDevice = false;
        if (keepForm) this.showToast(apiErrorMessage(e, 'Could not refresh the configuration.'));
        else {
          this.device = null;
          this.loadError = apiErrorMessage(e, `Could not load the configuration of ${id}.`);
        }
      },
    });
  }

  private toDevice(ov: ConfigOverviewDto): Device {
    const d = ov.device;
    const fw = ov.firmware;
    // the model master gives the protocol; without one, use the connectivity the device registry has
    const protocol = ov.editable.connectivity.protocol || this.devices.find((x) => x.id === d.deviceId)?.protocol || '';
    return {
      id: d.deviceId,
      name: d.deviceName,
      type: d.deviceType,
      model: fw.model || d.model,
      protocol,
      protocolKind: protocolKind(protocol),
      gateway: d.gateway,
      asset: d.assetName || d.assetRegistrationId,
      status: d.status,
      lastSeen: d.lastSeenAt,
      battery: d.batteryLevel,
      rssi: d.rssiDbm,
      snr: d.snrDb,
      firmware: fw.installedVersion ?? d.firmwareVersion,
      latestFirmware: fw.latestVersion,
      updateAvailable: fw.updateAvailable,
      latestReleaseDate: fw.latestReleaseDate,
      minFirmware: fw.minimumVersion,
      isCompatible: fw.isCompatible,
      releaseNotes: fw.releaseNotes ?? [],
      firmwareTarget: fw.pendingVersion ? { version: fw.pendingVersion, when: fw.updateScheduledAt } : null,
    };
  }

  selectDevice(id: string): void {
    if (!id || id === this.device?.id) return;
    if (this.device && this.dirty && !confirm(`Discard unsaved changes to ${this.device.id}?`)) {
      // let the select show the choice, then snap back to the current device
      this.deviceId = id;
      setTimeout(() => (this.deviceId = this.device?.id ?? ''));
      return;
    }
    this.loadDevice(id);
    this.router.navigate([], { relativeTo: this.route, queryParams: { device: id }, replaceUrl: true });
  }

  get draft(): ConfigVersion | undefined {
    return this.versions.find((v) => v.status === 'Draft');
  }

  /** Latest applied or queued version. */
  get currentVersion(): ConfigVersion | undefined {
    const c = this.overview?.current;
    return c ? this.versions.find((v) => v.v === c.version) : undefined;
  }

  get nextV(): number {
    return Math.max(0, ...this.versions.map((v) => v.v)) + 1;
  }

  get dirty(): boolean {
    return JSON.stringify(this.form) !== this.baseline;
  }

  /** What the Configuration Version card shows. */
  get shownVersion(): { v: number; status: VersionStatus; createdBy: string; unsaved: boolean; scheduledFor?: string } {
    const d = this.draft;
    if (d) return { v: d.v, status: 'Draft', createdBy: d.createdBy, unsaved: this.dirty };
    if (this.dirty) return { v: this.nextV, status: 'Draft', createdBy: this.currentUser, unsaved: true };
    const c = this.currentVersion;
    if (!c) return { v: 0, status: 'Draft', createdBy: '—', unsaved: false };
    const cur = this.overview?.current;
    const scheduledFor = cur?.deploymentMode === 'Scheduled' && cur.scheduledAt ? cur.scheduledAt : undefined;
    return { v: c.v, status: c.status, createdBy: c.createdBy, unsaved: false, scheduledFor };
  }

  get lastApplied(): string {
    const a = this.versions.map((v) => v.applied).filter((x): x is string => !!x).sort();
    return a.length ? this.fmt(a[a.length - 1]) : 'Never';
  }

  /** The version the device confirmed at check-in. */
  get runningVersion(): number | null {
    return this.overview?.runningVersion ?? null;
  }

  /** Body for Save Draft / Validate / Apply. */
  private request(withDeployment = false): SaveConfigRequest {
    const body = configToRequest(this.form);
    if (!withDeployment) return body;
    return {
      ...body,
      deploymentMode: this.deploy === 'scheduled' ? 'Scheduled' : 'Immediate',
      scheduledAt: this.deploy === 'scheduled' && this.scheduleAt ? new Date(this.scheduleAt).toISOString() : null,
      rolloutTarget: this.rollout === 'group' ? 'Device group' : 'Device',
      deviceGroup: this.rollout === 'group' ? this.group.trim() || null : null,
    };
  }

  saveDraft(): void {
    if (!this.device || this.busy) return;
    const d = this.draft;
    if (!this.dirty) {
      this.showToast(d ? `Draft v${d.v} is already saved.` : this.currentVersion ? `No changes to save. v${this.currentVersion.v} is the current configuration.` : 'No changes to save.');
      return;
    }
    const id = this.device.id;
    this.busy = true;
    this.api.saveDraft(id, this.request()).subscribe({
      next: (saved) => {
        this.busy = false;
        this.loadDevice(id, false, () => this.showToast(`Draft v${saved.version} saved.`));
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, 'Could not save the draft.'));
      },
    });
  }

  discardChanges(): void {
    if (!this.dirty) return;
    this.form = JSON.parse(this.baseline) as DeviceConfig;
    this.showToast('Unsaved changes discarded.');
  }

  /** Deletes the saved draft (DELETE …/draft). */
  discardDraft(): void {
    const d = this.draft;
    if (!this.device || !d || this.busy) return;
    if (!confirm(`Discard draft v${d.v}? Its settings will be lost.`)) return;
    const id = this.device.id;
    this.busy = true;
    this.api.discardDraft(id).subscribe({
      next: () => {
        this.busy = false;
        this.loadDevice(id, false, () => this.showToast(`Draft v${d.v} discarded.`));
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, 'Could not discard the draft.'));
      },
    });
  }

  // ===== Validation =====

  hexError(v: string, label: string, required = true): string {
    if (!v.trim()) return required ? `${label} is required.` : '';
    return HEX16.test(v.trim()) ? '' : `${label} must be 16 hexadecimal characters (${v.trim().length}/16).`;
  }

  get appEuiError(): string { return this.hexError(this.form.appEui, 'AppEUI', this.form.joinMode === 'OTAA'); }
  get devEuiError(): string { return this.hexError(this.form.devEui, 'DevEUI'); }

  get intervalError(): string {
    const n = Number(this.form.interval);
    return Number.isInteger(n) && n >= 1 ? '' : `Enter a whole number of ${this.form.intervalUnit}.`;
  }

  private toChecks(v: ConfigValidationDto): Check[] {
    return v.checks.map((c) => ({ title: c.title, sub: c.detail, state: c.passed ? 'ok' : 'fail', tab: CHECK_TABS[c.key] ?? 'overview' }));
  }

  /** Validation Checklist from the server (POST …/validate with the current form). */
  get checks(): Check[] {
    return this.validation.checks;
  }

  get firmwareCheck(): Check | undefined {
    return this.checks.find((c) => c.tab === 'firmware');
  }

  get failing(): Check[] {
    return this.checks.filter((c) => c.state === 'fail');
  }

  checkIcon(s: CheckState) {
    return s === 'ok' ? CircleCheck : s === 'warn' ? CircleAlert : CircleX;
  }

  private runValidation(announce: boolean): void {
    if (!this.device) return;
    const snap = JSON.stringify(this.form);
    this.validateSub?.unsubscribe();
    this.validateSub = this.api.validate(this.device.id, this.request()).subscribe({
      next: (v) => {
        this.validation = { snap, checks: this.toChecks(v) };
        if (announce) this.announceChecks();
      },
      error: (e) => {
        // invalid field values (400): show the reason against connectivity / telemetry
        const msg = apiErrorMessage(e, 'Could not validate the configuration.');
        const field = e instanceof HttpErrorResponse && e.error?.errors ? Object.keys(e.error.errors)[0] ?? '' : '';
        const tab: Tab = field.startsWith('Telemetry') ? 'telemetry' : field.startsWith('AlertRules') ? 'alerts' : 'connectivity';
        const checks = this.validation.checks.length ? this.validation.checks.map((c) => (c.tab === tab ? { ...c, sub: msg, state: 'fail' as CheckState } : c)) : [{ title: 'Configuration valid', sub: msg, state: 'fail' as CheckState, tab }];
        this.validation = { snap, checks };
        if (announce) this.showToast(msg);
      },
    });
  }

  private announceChecks(): void {
    const fail = this.failing;
    if (fail.length) this.showToast(`${fail.length} check${fail.length > 1 ? 's' : ''} failed: ${fail.map((x) => x.sub).join(' ')}`);
    else this.showToast(`All ${this.checks.length} checks passed. Configuration is ready to apply.`);
  }

  validate(): void {
    this.applyError = '';
    clearTimeout(this.validateTimer);
    this.validateTimer = undefined;
    this.runValidation(true);
  }

  // ===== Apply =====

  apply(): void {
    this.applyError = '';
    if (!this.device || this.busy) return;
    if (this.deploy === 'scheduled' && (!this.scheduleAt || this.scheduleAt <= nowLocal())) {
      this.applyError = 'Choose a future date and time for the scheduled deployment.';
      return;
    }
    if (this.rollout === 'group' && !this.group.trim()) {
      this.applyError = 'Enter the device group to apply this configuration to.';
      return;
    }
    if (!this.draft && !this.dirty && this.rollout === 'device') {
      const cur = this.currentVersion;
      this.showToast(cur ? `Nothing new to apply. v${cur.v} is already ${cur.status.toLowerCase()} on ${this.device.id}.` : 'Nothing to apply. Change a setting first.');
      return;
    }
    const d = this.device;
    const target = this.rollout === 'group' ? `group ${this.group.trim()}` : d.id;
    this.busy = true;
    this.api.apply(d.id, this.request(true)).subscribe({
      next: (applied) => {
        this.busy = false;
        const msg = applied.deploymentMode === 'Scheduled' && applied.scheduledAt
          ? `v${applied.version} scheduled for ${target} on ${this.fmt(applied.scheduledAt)}.`
          : d.status === 'Offline' ? `v${applied.version} queued. ${d.id} is offline and will receive it when it reconnects.` : `v${applied.version} queued for ${target}. Waiting for device check-in…`;
        this.loadDevice(d.id, false, () => this.showToast(msg));
      },
      error: (e) => {
        this.busy = false;
        const body = e instanceof HttpErrorResponse ? e.error : null;
        if (e instanceof HttpErrorResponse && e.status === 422 && Array.isArray(body?.checks)) {
          this.validation = { snap: JSON.stringify(this.form), checks: this.toChecks(body as ConfigValidationDto) };
          const fail = this.failing;
          this.applyError = `Fix ${fail.length} failing check${fail.length > 1 ? 's' : ''} before applying: ${fail.map((x) => x.title.toLowerCase()).join(', ')}.`;
          this.showToast('Apply blocked. ' + (fail[0]?.sub ?? ''));
          return;
        }
        this.applyError = apiErrorMessage(e, 'Could not apply the configuration.');
      },
    });
  }

  // ===== Connectivity helpers =====

  onAdr(on: boolean): void {
    this.form.adr = on;
    this.form.dataRate = on ? this.autoRate : this.dataRates[2] ?? this.dataRates[0] ?? '';
  }

  copy(value: string, label: string): void {
    const done = () => this.showToast(`${label} ${value} copied to clipboard.`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(done, () => this.fallbackCopy(value, done));
    else this.fallbackCopy(value, done);
  }

  private fallbackCopy(value: string, done: () => void): void {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { this.showToast('Copy failed. Select the value and press Ctrl+C.'); }
    ta.remove();
  }

  get sensorParams(): TelemetryParam[] {
    return this.form.params.filter((p) => p.kind === 'sensor');
  }

  toggleBattery(): void {
    this.form.batteryReporting = !this.form.batteryReporting;
  }

  paramIcon(p: TelemetryParam) {
    return ICONS[p.icon];
  }

  paramName(key: string): string {
    return this.form.params.find((p) => p.key === key)?.name ?? key;
  }

  paramUnit(key: string): string {
    return this.form.params.find((p) => p.key === key)?.unit ?? '';
  }

  /** Changing the display unit converts the threshold and the related alert values. */
  changeUnit(p: TelemetryParam, unit: string): void {
    const from = p.unit;
    if (p.threshold !== null) p.threshold = round(convert(Number(p.threshold), from, unit, true), 2);
    for (const a of this.form.alerts) if (a.param === p.key) { a.value = round(convert(a.value, from, unit), 1); a.unit = unit; }
    p.unit = unit;
  }

  rulesFor(key: string): number {
    return this.form.alerts.filter((a) => a.param === key && a.enabled).length;
  }

  samplingLabel(s: number): string {
    return s < 60 ? `${s} seconds` : s === 60 ? '60 seconds' : s < 3600 ? `${s / 60} minutes` : `${s / 3600} hour${s === 3600 ? '' : 's'}`;
  }

  get protocolIcon() {
    const k = this.device?.protocolKind;
    return k === 'LoRaWAN' ? Antenna : k === 'BLE' ? Bluetooth : RadioTower;
  }

  get deviceIcon() {
    const t = (this.device?.type ?? '').toLowerCase();
    return t.includes('temp') ? Thermometer : t.includes('vib') ? Activity : t.includes('ble') || t.includes('beacon') ? Bluetooth : MapPin;
  }

  get connSummary(): { k: string; v: string }[] {
    return this.summarize(this.form);
  }

  private summarize(f: DeviceConfig): { k: string; v: string }[] {
    const every = `${f.interval} ${f.intervalUnit}`;
    if (protocolKind(f.protocol) === 'LoRaWAN') return [
      { k: 'Region', v: f.region || '—' }, { k: 'Join mode', v: f.joinMode || '—' }, { k: 'AppEUI', v: f.appEui || '—' }, { k: 'DevEUI', v: f.devEui || '—' },
      { k: 'Reporting', v: every }, { k: 'Confirmed uplink', v: f.confirmed ? 'On' : 'Off' }, { k: 'ADR', v: f.adr ? 'On' : 'Off' }, { k: 'Data rate', v: f.dataRate || '—' },
    ];
    return [{ k: 'Reporting', v: every }];
  }

  get enabledCount(): number {
    return this.form.params.filter((p) => p.enabled).length;
  }

  get severityCounts(): { s: string; n: number }[] {
    return this.severities.map((s) => ({ s, n: this.form.alerts.filter((a) => a.enabled && a.severity === s).length }));
  }

  // ===== Live preview (stacked panels, shared x-axis) =====

  private px(i: number): number {
    return PAD.l + (i / 48) * (CW - PAD.l - PAD.r);
  }

  timeLabel(i: number, withDay = false): string {
    const d = new Date(this.previewStart + i * 30 * 60000);
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return withDay ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${t}` : t;
  }

  get xs(): number[] {
    return Array.from({ length: 49 }, (_, i) => this.px(i));
  }

  private previewCache: { key: string; panels: Panel[] } | null = null;

  get panels(): Panel[] {
    const sensors = this.sensorParams.slice(0, 3);
    const key = (this.device?.id ?? '') + JSON.stringify(sensors.map((p) => [p.key, p.unit, p.threshold, p.enabled]));
    if (this.previewCache?.key === key) return this.previewCache.panels;
    const withData = sensors.filter((p) => (this.telemetry[p.key]?.length ?? 0) >= 49);
    const panels = withData.map((p, n) => {
      const top = PAD.t + n * (PH + PGAP);
      const bottom = top + PH;
      const values = this.telemetry[p.key].slice(0, 49).map((v: number) => convert(v, p.units[0], p.unit));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const raw = (max - min) / 2 || 1;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
      const lo = Math.floor(min / step) * step;
      const hi = Math.max(lo + step, Math.ceil(max / step) * step);
      const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * PH;
      const ys = values.map(y);
      const ticks: { y: number; label: string }[] = [];
      for (let t = lo; t <= hi + step / 1000; t += step) ticks.push({ y: y(t), label: `${round(t, step < 1 ? 1 : 0)}` });
      // change-triggered uplinks (deadband) and the band each transmitted value covers
      const thr = Math.max(0, Number(p.threshold) || 0);
      const dots: { x: number; y: number }[] = [{ x: this.px(0), y: ys[0] }];
      let band = '';
      let last = values[0];
      let from = 0;
      const seg = (a: number, b: number, v: number) => {
        const y1 = Math.max(top, y(Math.min(hi, v + thr)));
        const y2 = Math.min(bottom, y(Math.max(lo, v - thr)));
        return `M${this.px(a).toFixed(1)},${y1.toFixed(1)}H${this.px(b).toFixed(1)}V${y2.toFixed(1)}H${this.px(a).toFixed(1)}Z`;
      };
      for (let i = 1; i < values.length; i++) {
        if (Math.abs(values[i] - last) >= thr) {
          band += seg(from, i, last);
          last = values[i];
          from = i;
          dots.push({ x: this.px(i), y: ys[i] });
        }
      }
      band += seg(from, 48, last);
      const path = ys.map((v, i) => `${i ? 'L' : 'M'}${this.px(i).toFixed(1)},${v.toFixed(1)}`).join('');
      return { key: p.key, name: p.name, unit: p.unit, color: COLORS[n], enabled: p.enabled, top, bottom, path, band, ticks, ys, values, dots };
    });
    this.previewCache = { key, panels };
    return panels;
  }

  get chartH(): number {
    const n = Math.max(1, this.panels.length);
    return PAD.t + n * PH + (n - 1) * PGAP + PAD.b;
  }

  get tipLeft(): number {
    const h = this.hover ?? 0;
    return Math.min(82, Math.max(18, (this.px(h) / CW) * 100));
  }

  // ===== Alerts (saved straight into the draft through the alert-rule endpoints) =====

  editAlert(a?: AlertRule): void {
    this.alertError = '';
    this.alertForm = a
      ? { ...a, notify: [...a.notify], isNew: false }
      : { id: '', param: '', cond: '', value: 0, unit: null, severity: '', notify: this.notifyOptions.slice(0, 1), enabled: true, isNew: true };
  }

  toggleNotify(f: AlertRule, channel: string): void {
    f.notify = f.notify.includes(channel) ? f.notify.filter((c) => c !== channel) : [...f.notify, channel];
  }

  notifyText(a: AlertRule): string {
    return a.notify.length ? a.notify.join(' + ') : '—';
  }

  /** Puts a rule change into the form and into the baseline, so it does not count as unsaved. */
  private patchRules(change: (rules: AlertRule[]) => AlertRule[]): void {
    this.form.alerts = change(this.form.alerts);
    const base = JSON.parse(this.baseline) as DeviceConfig;
    base.alerts = change(base.alerts);
    this.baseline = JSON.stringify(base);
  }

  saveAlert(): void {
    const f = this.alertForm;
    const d = this.device;
    if (!f || !d || this.busy) return;
    if (!f.param) return void (this.alertError = 'Choose a parameter.');
    if (!f.cond) return void (this.alertError = 'Choose a condition.');
    if (!f.severity) return void (this.alertError = 'Choose a severity.');
    if ((f.value as number | null) === null || !Number.isFinite(Number(f.value))) return void (this.alertError = 'Enter a numeric threshold value.');
    const { isNew, ...rule } = f;
    rule.value = Number(rule.value);
    rule.unit = this.paramUnit(rule.param) || null;
    const dup = this.form.alerts.find((a) => a.id !== rule.id && a.param === rule.param && a.cond === rule.cond && a.value === rule.value);
    if (dup) return void (this.alertError = 'An identical rule already exists.');
    this.busy = true;
    const call = isNew ? this.api.addRule(d.id, ruleToRequest(rule)) : this.api.updateRule(d.id, rule.id, ruleToRequest(rule));
    call.subscribe({
      next: (saved) => {
        this.busy = false;
        const r = ruleFromDto(saved);
        this.patchRules((rules) => (isNew ? [...rules, r] : rules.map((x) => (x.id === r.id ? r : x))));
        this.alertForm = null;
        this.showToast(`Alert rule ${isNew ? 'added' : 'updated'} in the draft.`);
        this.loadDevice(d.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.alertError = apiErrorMessage(e, 'Could not save the alert rule.');
      },
    });
  }

  toggleAlert(a: AlertRule): void {
    const d = this.device;
    if (!d || this.busy) return;
    this.busy = true;
    this.api.setRuleActive(d.id, a.id, !a.enabled).subscribe({
      next: (saved) => {
        this.busy = false;
        const r = ruleFromDto(saved);
        this.patchRules((rules) => rules.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)));
        this.loadDevice(d.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, 'Could not change the alert rule.'));
      },
    });
  }

  deleteAlert(a: AlertRule): void {
    const d = this.device;
    if (!d || this.busy) return;
    if (!confirm(`Delete the rule "${this.paramName(a.param)} ${a.cond} ${a.value} ${this.paramUnit(a.param)}"?`)) return;
    this.busy = true;
    this.api.deleteRule(d.id, a.id).subscribe({
      next: () => {
        this.busy = false;
        this.patchRules((rules) => rules.filter((x) => x.id !== a.id));
        this.showToast('Alert rule deleted from the draft.');
        this.loadDevice(d.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, 'Could not delete the alert rule.'));
      },
    });
  }

  sevClass(s: string): string {
    return 'sev--' + s.toLowerCase();
  }

  // ===== Firmware =====

  get fwUpToDate(): boolean {
    // with the installed version unknown the API reports no update; that is not "up to date"
    return !!this.device?.firmware && !this.device.updateAvailable;
  }

  openFirmware(): void {
    this.fwError = '';
    this.fwDialog = { at: '' };
  }

  scheduleFirmware(): void {
    const f = this.fwDialog;
    const d = this.device;
    if (!f || !d || this.busy) return;
    if (!f.at || f.at <= nowLocal()) return void (this.fwError = 'Choose a future date and time.');
    this.busy = true;
    this.api.scheduleFirmware(d.id, new Date(f.at).toISOString(), d.latestFirmware).subscribe({
      next: (fw) => {
        this.busy = false;
        this.fwDialog = null;
        const v = fw.pendingVersion ?? d.latestFirmware ?? '';
        this.showToast(`Firmware ${v} pending for ${d.id}${d.status === 'Offline' ? ' (device offline)' : ''}.`);
        this.loadDevice(d.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.fwError = apiErrorMessage(e, 'Could not schedule the firmware update.');
      },
    });
  }

  cancelFirmware(): void {
    const d = this.device;
    const t = d?.firmwareTarget;
    if (!d || !t || this.busy) return;
    this.busy = true;
    this.api.cancelFirmware(d.id).subscribe({
      next: () => {
        this.busy = false;
        this.showToast('Pending firmware update cancelled.');
        this.loadDevice(d.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, 'Could not cancel the firmware update.'));
      },
    });
  }

  get fwWhen(): string {
    const t = this.device?.firmwareTarget;
    return !t ? '' : t.when ? this.fmt(t.when) : '—';
  }

  // ===== History =====

  private flatten(c: DeviceConfig): Map<string, string> {
    const m = new Map<string, string>();
    for (const s of this.summarize(c)) m.set(s.k, s.v);
    m.set('Sampling interval', this.samplingLabel(c.sampling));
    m.set('Battery reporting', c.batteryReporting ? `On · ${c.batteryInterval || '—'}` : 'Off');
    for (const p of c.params) m.set(`${p.name}`, p.enabled ? `On · ${p.agg} · Δ ≥ ${p.threshold ?? '—'} ${p.unit}` : 'Off');
    for (const a of c.alerts) {
      const name = c.params.find((p) => p.key === a.param)?.name ?? a.param;
      m.set(`Alert ${name} ${a.cond} ${a.value}`, `${a.severity} · ${a.notify.join(' + ') || '—'}${a.enabled ? '' : ' (off)'}`);
    }
    return m;
  }

  /** View changes: loads the version and the one before it. */
  openDiff(v: ConfigVersion): void {
    const d = this.device;
    if (!d) return;
    this.diffOf = v;
    this.diffConfigs = null;
    this.diffLoading = true;
    const prev = this.versions.filter((x) => x.v < v.v).sort((a, b) => b.v - a.v)[0];
    const before$: Observable<DeviceConfig | null> = prev ? this.api.version(d.id, prev.v).pipe(map(configFromDto)) : of(null);
    forkJoin({ after: this.api.version(d.id, v.v), before: before$ }).subscribe({
      next: ({ after, before }) => {
        if (this.diffOf !== v) return;
        this.diffConfigs = { before, after: configFromDto(after) };
        this.diffLoading = false;
      },
      error: (e) => {
        this.diffLoading = false;
        this.showToast(apiErrorMessage(e, `Could not load v${v.v}.`));
      },
    });
  }

  get diffPrevV(): number | null {
    const v = this.diffOf;
    if (!v) return null;
    return this.versions.filter((x) => x.v < v.v).sort((a, b) => b.v - a.v)[0]?.v ?? null;
  }

  get diffRows(): { k: string; from: string; to: string }[] {
    const c = this.diffConfigs;
    if (!c) return [];
    const a = c.before ? this.flatten(c.before) : new Map<string, string>();
    const b = this.flatten(c.after);
    const keys = [...new Set([...a.keys(), ...b.keys()])];
    return keys.filter((k) => a.get(k) !== b.get(k)).map((k) => ({ k, from: a.get(k) ?? '—', to: b.get(k) ?? 'Removed' }));
  }

  restore(v: ConfigVersion): void {
    const dev = this.device;
    if (!dev || this.busy) return;
    const d = this.draft;
    if (d && d.v === v.v) return void this.showToast(`v${v.v} is the current draft.`);
    const msg = d ? `Load v${v.v} into draft v${d.v}? The current draft contents will be replaced.` : `Load v${v.v} as a new draft?`;
    if (!confirm(this.dirty ? msg + ' Unsaved changes will be lost.' : msg)) return;
    this.busy = true;
    this.api.restore(dev.id, v.v).subscribe({
      next: (saved) => {
        this.busy = false;
        this.loadDevice(dev.id, false, () => this.showToast(`v${v.v} restored as draft v${saved.version}.`));
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not restore v${v.v}.`));
      },
    });
  }

  /** Records the device's check-in confirmation of a Queued version (normally sent by the device platform). */
  confirmVersion(v: ConfigVersion): void {
    const dev = this.device;
    if (!dev || this.busy || v.status !== 'Queued') return;
    if (!confirm(`Mark v${v.v} as confirmed by ${dev.id}? The previously applied version will be superseded.`)) return;
    this.busy = true;
    this.api.confirm(dev.id, v.v).subscribe({
      next: () => {
        this.busy = false;
        this.showToast(`v${v.v} is now applied on ${dev.id}.`);
        this.loadDevice(dev.id, true);
      },
      error: (e) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not confirm v${v.v}.`));
      },
    });
  }

  statusClass(s: string): string {
    return 'vs--' + s.toLowerCase();
  }

  // ===== Formatting / UI =====

  /** Local date and time for an ISO timestamp (or a datetime-local value); '—' when missing. */
  fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const z = (n: number) => String(n).padStart(2, '0');
    return `${z(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
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
    this.alertForm = null;
    this.diffOf = null;
    this.fwDialog = null;
  }

  @HostListener('window:beforeunload', ['$event'])
  onUnload(e: BeforeUnloadEvent): void {
    if (this.dirty) e.preventDefault();
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3800);
  }
}
