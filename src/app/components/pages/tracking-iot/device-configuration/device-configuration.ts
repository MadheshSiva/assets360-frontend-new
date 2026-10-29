import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  Activity, Antenna, AudioWaveform, Battery, Bell, Bluetooth, Building2, Calendar, ChartColumn, Check, CircleAlert, CircleCheck, CircleX,
  Clock, Copy, Cpu, Droplets, Eye, Gauge, History, IdCard, Info, Key, LayoutDashboard, MapPin, Move3d, Pencil, Plus, RadioTower, RotateCcw, Save,
  Send, ShieldCheck, SignalHigh, Thermometer, Trash2, TriangleAlert, X, Zap,
} from 'lucide-angular';
import {
  AUTO_RATE, AlertRule, BATTERY_INTERVALS, CURRENT_USER, Cond, ConfigVersion, DATA_RATES, DEVICES, Device, DeviceConfig, NETWORK_MODES, NOTIFY,
  ParamIcon, REGIONS, SAMPLING, Severity, TX_POWERS, TelemetryParam, VersionStatus, series,
} from './config-data';

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
const CW = 560;
const PH = 62;
const PGAP = 16;
const PAD = { l: 44, r: 10, t: 8, b: 20 };
/** Preview starts 24 h before "now" (27 Oct 2026 12:00). */
const PREVIEW_START = new Date(2026, 9, 26, 12, 0).getTime();
const ASSETS = ['Cold Room CR-03', 'Cold Room CR-04', 'Freezer FZ-02', 'Pump PMP-118', 'Forklift FL-008', 'Generator GEN-042', 'Chiller CH-07'];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/[^\d.]/g, '').split('.').map(Number);
  const pb = b.replace(/[^\d.]/g, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function nowIso(): string {
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
  styleUrls: ['./device-configuration.css', './device-configuration-sections.css'],
})
export class DeviceConfiguration implements OnDestroy {
  readonly icons = { Antenna, Bell, Bluetooth, Building2, Calendar, ChartColumn, Check, CircleAlert, CircleCheck, CircleX, Clock, Copy, Cpu, Eye, History, IdCard, Info, LayoutDashboard, Pencil, Plus, RadioTower, RotateCcw, Save, Send, ShieldCheck, Thermometer, Trash2, TriangleAlert, X, Battery };
  readonly devices = DEVICES;
  readonly regions = REGIONS;
  readonly dataRates = DATA_RATES;
  readonly autoRate = AUTO_RATE;
  readonly samplings = SAMPLING;
  readonly batteryIntervals = BATTERY_INTERVALS;
  readonly txPowers = TX_POWERS;
  readonly networkModes = NETWORK_MODES;
  readonly notifyOptions = NOTIFY;
  readonly aggs = ['Average', 'Min', 'Max', 'Last'];
  readonly conds: Cond[] = ['>', '≥', '<', '≤'];
  readonly severities: Severity[] = ['Critical', 'Warning', 'Info'];
  readonly assets = ASSETS;
  readonly cw = CW;
  readonly pad = PAD;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'connectivity', label: 'Connectivity' }, { id: 'telemetry', label: 'Telemetry' },
    { id: 'alerts', label: 'Alerts' }, { id: 'firmware', label: 'Firmware' }, { id: 'history', label: 'History' },
  ];
  readonly hourTicks = [0, 8, 16, 24, 32, 40, 48].map((i) => ({ i, x: this.px(i), label: this.timeLabel(i) }));

  tab: Tab = 'connectivity';
  device: Device = DEVICES[0];
  deviceId = DEVICES[0].id;
  assetSel = DEVICES[0].asset;
  form: DeviceConfig = clone(DEVICES[0].versions[0].config);
  private baseline = '';
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
  fwDialog: { when: 'checkin' | 'scheduled'; at: string } | null = null;
  fwError = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('device');
    this.load(DEVICES.find((d) => d.id === q) ?? DEVICES[0]);
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Loading & versions =====

  private load(d: Device): void {
    this.device = d;
    this.deviceId = d.id;
    this.assetSel = d.asset;
    const src = this.draft ?? this.currentVersion;
    this.form = clone(src.config);
    this.baseline = JSON.stringify(this.form);
    this.group = d.groups[0]?.name ?? '';
    this.rollout = 'device';
    this.deploy = 'immediate';
    this.scheduleAt = '';
    this.applyError = '';
    this.hover = null;
  }

  selectDevice(id: string): void {
    const d = DEVICES.find((x) => x.id === id);
    if (!d || d === this.device) return;
    if (this.dirty && !confirm(`Discard unsaved changes to ${this.device.id}?`)) {
      // let the select show the choice, then snap back to the current device
      this.deviceId = id;
      setTimeout(() => (this.deviceId = this.device.id));
      return;
    }
    this.load(d);
    this.router.navigate([], { relativeTo: this.route, queryParams: { device: d.id }, replaceUrl: true });
  }

  relinkAsset(asset: string): void {
    const d = this.device;
    const other = DEVICES.find((x) => x !== d && x.asset === asset);
    if (other && !confirm(`${asset} is linked to ${other.id}. Link it to ${d.id} as well?`)) {
      this.assetSel = asset;
      setTimeout(() => (this.assetSel = d.asset));
      return;
    }
    this.assetSel = asset;
    const prev = d.asset;
    d.asset = asset;
    this.log(`Linked asset changed from ${prev} to ${asset}`);
    this.showToast(`${d.id} is now linked to ${asset}.`);
  }

  get draft(): ConfigVersion | undefined {
    return this.device.versions.find((v) => v.status === 'Draft');
  }

  /** Latest version that is not a draft (applied, queued or scheduled). */
  get currentVersion(): ConfigVersion {
    const vs = this.device.versions.filter((v) => v.status !== 'Draft' && v.status !== 'Superseded');
    return vs[vs.length - 1] ?? this.device.versions[this.device.versions.length - 1];
  }

  get nextV(): number {
    return Math.max(...this.device.versions.map((v) => v.v)) + 1;
  }

  get dirty(): boolean {
    return JSON.stringify(this.form) !== this.baseline;
  }

  /** What the Configuration Version card shows. */
  get shownVersion(): { v: number; status: VersionStatus; createdBy: string; unsaved: boolean; scheduledFor?: string } {
    const d = this.draft;
    if (d) return { v: d.v, status: 'Draft', createdBy: d.createdBy, unsaved: this.dirty };
    if (this.dirty) return { v: this.nextV, status: 'Draft', createdBy: CURRENT_USER, unsaved: true };
    const c = this.currentVersion;
    return { v: c.v, status: c.status, createdBy: c.createdBy, unsaved: false, scheduledFor: c.scheduledFor };
  }

  get lastApplied(): string {
    const a = this.device.versions.filter((v) => v.applied).map((v) => v.applied as string).sort();
    return a.length ? this.fmt(a[a.length - 1]) : 'Never';
  }

  get appliedVersion(): ConfigVersion | undefined {
    return this.device.versions.find((v) => v.status === 'Applied');
  }

  saveDraft(silent = false): ConfigVersion | null {
    let d = this.draft;
    if (!d && !this.dirty) {
      if (!silent) this.showToast(`No changes to save. v${this.currentVersion.v} is the current configuration.`);
      return null;
    }
    if (!d) {
      d = { v: this.nextV, status: 'Draft', createdBy: CURRENT_USER, created: nowIso(), note: 'Edited in Device Configuration', config: clone(this.form) };
      this.device.versions.push(d);
      this.log(`Draft v${d.v} created`);
    } else {
      if (!this.dirty) {
        if (!silent) this.showToast(`Draft v${d.v} is already saved.`);
        return d;
      }
      d.config = clone(this.form);
      d.createdBy = CURRENT_USER;
      this.log(`Draft v${d.v} updated`);
    }
    this.baseline = JSON.stringify(this.form);
    if (!silent) this.showToast(`Draft v${d.v} saved.`);
    return d;
  }

  discardChanges(): void {
    if (!this.dirty) return;
    this.form = JSON.parse(this.baseline) as DeviceConfig;
    this.showToast('Unsaved changes discarded.');
  }

  // ===== Validation =====

  hexError(v: string, label: string): string {
    if (!v.trim()) return `${label} is required.`;
    return HEX16.test(v.trim()) ? '' : `${label} must be 16 hexadecimal characters (${v.trim().length}/16).`;
  }

  get appEuiError(): string { return this.hexError(this.form.appEui, 'AppEUI'); }
  get devEuiError(): string { return this.hexError(this.form.devEui, 'DevEUI'); }

  get intervalError(): string {
    const n = Number(this.form.interval);
    const max = this.form.intervalUnit === 'hours' ? 24 : 1440;
    return Number.isInteger(n) && n >= 1 && n <= max ? '' : `Enter a whole number from 1 to ${max} ${this.form.intervalUnit}.`;
  }

  get advError(): string {
    const n = Number(this.form.advInterval);
    return n >= 20 && n <= 10240 ? '' : 'Advertising interval must be 20–10240 ms.';
  }

  get apnError(): string { return this.form.apn.trim() ? '' : 'APN is required.'; }
  get iccidError(): string { return /^\d{19,20}$/.test(this.form.iccid.trim()) ? '' : 'ICCID must be 19–20 digits.'; }

  private get connErrors(): string[] {
    const p = this.device.protocol;
    const e = [this.intervalError];
    if (p === 'LoRaWAN') e.push(this.form.region ? '' : 'Region is required.', this.appEuiError, this.devEuiError, !this.form.adr && this.form.dataRate === AUTO_RATE ? 'Choose a fixed data rate when ADR is off.' : '');
    if (p === 'BLE 5.0') e.push(this.advError);
    if (p === 'Cellular') e.push(this.apnError, this.iccidError);
    return e.filter((x) => x);
  }

  get checks(): Check[] {
    const f = this.form;
    const d = this.device;
    const conn = this.connErrors;
    const connOk = this.device.protocol === 'LoRaWAN' ? 'Region, join mode and keys configured.' : this.device.protocol === 'BLE 5.0' ? 'Advertising and TX power configured.' : 'APN, SIM and network mode configured.';
    const sensors = f.params.filter((x) => x.kind === 'sensor');
    const enabled = f.params.filter((x) => x.enabled);
    const badThr = enabled.filter((x) => (x.threshold as number | null) === null || !(Number(x.threshold) >= 0));
    const tele: Check = !sensors.some((x) => x.enabled)
      ? { title: 'Telemetry mapping complete', sub: 'Enable at least one measured parameter.', state: 'fail', tab: 'telemetry' }
      : badThr.length ? { title: 'Telemetry mapping complete', sub: `Set a valid threshold for ${badThr[0].name}.`, state: 'fail', tab: 'telemetry' }
        : { title: 'Telemetry mapping complete', sub: 'All enabled parameters mapped.', state: 'ok', tab: 'telemetry' };
    const rules = f.alerts.filter((a) => a.enabled);
    const orphan = rules.find((a) => !f.params.find((x) => x.key === a.param && x.enabled));
    const alert: Check = !rules.length
      ? { title: 'Alert rules linked', sub: 'No active alert rules. Devices will report without alarms.', state: 'warn', tab: 'alerts' }
      : orphan ? { title: 'Alert rules linked', sub: `A rule uses ${this.paramName(orphan.param)}, which is not transmitted.`, state: 'warn', tab: 'alerts' }
        : { title: 'Alert rules linked', sub: 'Threshold rules configured.', state: 'ok', tab: 'alerts' };
    let fw: Check = { title: 'Firmware compatibility verified', sub: `${d.firmware} is compatible.`, state: 'ok', tab: 'firmware' };
    if (cmpVersion(d.firmware, d.minFirmware) < 0) fw = { ...fw, sub: `${d.firmware} is below ${d.minFirmware} required by this configuration.`, state: 'fail' };
    else if (f.sampling < 30 && d.fastSamplingFirmware && cmpVersion(d.firmware, d.fastSamplingFirmware) < 0) fw = { ...fw, sub: `${f.sampling} s sampling needs ${d.fastSamplingFirmware} or later.`, state: 'fail' };
    if (fw.state === 'fail' && d.firmwareTarget) fw.sub += ` Update to ${d.firmwareTarget.version} pending.`;
    return [
      { title: 'Connectivity parameters complete', sub: conn.length ? conn[0] : connOk, state: conn.length ? 'fail' : 'ok', tab: 'connectivity' },
      tele, alert, fw,
    ];
  }

  get failing(): Check[] {
    return this.checks.filter((c) => c.state === 'fail');
  }

  checkIcon(s: CheckState) {
    return s === 'ok' ? CircleCheck : s === 'warn' ? CircleAlert : CircleX;
  }

  validate(): void {
    const c = this.checks;
    const fail = c.filter((x) => x.state === 'fail');
    const warn = c.filter((x) => x.state === 'warn');
    this.applyError = '';
    if (fail.length) this.showToast(`${fail.length} check${fail.length > 1 ? 's' : ''} failed: ${fail.map((x) => x.sub).join(' ')}`);
    else if (warn.length) this.showToast(`Configuration is valid with ${warn.length} warning: ${warn[0].sub}`);
    else this.showToast('All 4 checks passed. Configuration is ready to apply.');
  }

  // ===== Apply =====

  get selectedGroup(): { name: string; count: number } | undefined {
    return this.device.groups.find((g) => g.name === this.group);
  }

  apply(): void {
    this.applyError = '';
    const fail = this.failing;
    if (fail.length) {
      this.applyError = `Fix ${fail.length} failing check${fail.length > 1 ? 's' : ''} before applying: ${fail.map((x) => x.title.toLowerCase()).join(', ')}.`;
      this.showToast('Apply blocked. ' + fail[0].sub);
      return;
    }
    if (this.deploy === 'scheduled' && (!this.scheduleAt || this.scheduleAt <= nowIso())) {
      this.applyError = 'Choose a future date and time for the scheduled deployment.';
      return;
    }
    const d = this.device;
    let ver = this.draft || this.dirty ? this.saveDraft(true) : null;
    const target = this.rollout === 'group' && this.selectedGroup ? `group ${this.selectedGroup.name} (${this.selectedGroup.count} devices)` : d.id;
    if (!ver) {
      if (this.rollout !== 'group') {
        this.showToast(`Nothing new to apply. v${this.currentVersion.v} is already ${this.currentVersion.status.toLowerCase()} on ${d.id}.`);
        return;
      }
      ver = this.currentVersion;
      this.log(`v${ver.v} pushed to ${target}`);
      this.showToast(`v${ver.v} queued for ${target}.`);
      return;
    }
    for (const v of d.versions) if (v !== ver && (v.status === 'Queued' || v.status === 'Scheduled')) v.status = 'Superseded';
    const applied = ver;
    if (this.deploy === 'scheduled') {
      applied.status = 'Scheduled';
      applied.scheduledFor = this.scheduleAt;
      this.log(`v${applied.v} scheduled for ${target} on ${this.fmt(this.scheduleAt)}`);
      this.showToast(`v${applied.v} scheduled for ${this.fmt(this.scheduleAt)}.`);
      return;
    }
    applied.status = 'Queued';
    applied.applied = nowIso();
    this.log(`v${applied.v} applied to ${target}, queued until next check-in`);
    if (d.status === 'Offline') {
      this.showToast(`v${applied.v} queued. ${d.id} is offline and will receive it when it reconnects.`);
      return;
    }
    this.showToast(`v${applied.v} queued for ${target}. Waiting for device check-in…`);
    setTimeout(() => {
      if (applied.status !== 'Queued') return;
      for (const v of d.versions) if (v.status === 'Applied') v.status = 'Superseded';
      applied.status = 'Applied';
      d.lastSeen = nowIso();
      d.events.unshift({ at: nowIso(), by: 'System', text: `v${applied.v} confirmed by ${d.id} at check-in` });
      if (d === this.device) this.showToast(`${d.id} checked in and confirmed v${applied.v}.`);
    }, 5000);
  }

  private log(text: string, d: Device = this.device): void {
    d.events.unshift({ at: nowIso(), by: CURRENT_USER, text });
  }

  // ===== Connectivity helpers =====

  onAdr(on: boolean): void {
    this.form.adr = on;
    this.form.dataRate = on ? AUTO_RATE : DATA_RATES[2];
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

  get batteryParam(): TelemetryParam | undefined {
    return this.form.params.find((p) => p.key === 'battery');
  }

  toggleBattery(): void {
    const b = this.batteryParam;
    if (b) b.enabled = !b.enabled;
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
    p.threshold = round(convert(p.threshold, from, unit, true), 2);
    for (const a of this.form.alerts) if (a.param === p.key) a.value = round(convert(a.value, from, unit), 1);
    p.unit = unit;
  }

  rulesFor(key: string): number {
    return this.form.alerts.filter((a) => a.param === key && a.enabled).length;
  }

  samplingLabel(s: number): string {
    return s < 60 ? `${s} seconds` : s === 60 ? '60 seconds' : `${s / 60} minutes`;
  }

  get protocolIcon() {
    return this.device.protocol === 'LoRaWAN' ? Antenna : this.device.protocol === 'BLE 5.0' ? Bluetooth : RadioTower;
  }

  get deviceIcon() {
    const id = this.device.id;
    return id.startsWith('TS') ? Thermometer : id.startsWith('VS') ? Activity : id.startsWith('BLE') ? Bluetooth : MapPin;
  }

  get connSummary(): { k: string; v: string }[] {
    return this.summarize(this.form);
  }

  private summarize(f: DeviceConfig): { k: string; v: string }[] {
    const every = `${f.interval} ${f.intervalUnit}`;
    if (this.device.protocol === 'LoRaWAN') return [
      { k: 'Region', v: f.region }, { k: 'Join mode', v: f.joinMode }, { k: 'AppEUI', v: f.appEui || '—' }, { k: 'DevEUI', v: f.devEui || '—' },
      { k: 'Reporting', v: every }, { k: 'Confirmed uplink', v: f.confirmed ? 'On' : 'Off' }, { k: 'ADR', v: f.adr ? 'On' : 'Off' }, { k: 'Data rate', v: f.dataRate },
    ];
    if (this.device.protocol === 'BLE 5.0') return [
      { k: 'Advertising interval', v: `${f.advInterval} ms` }, { k: 'TX power', v: `${f.txPower} dBm` }, { k: 'Connectable', v: f.connectable ? 'Yes' : 'No' }, { k: 'Gateway upload', v: every },
    ];
    return [{ k: 'APN', v: f.apn || '—' }, { k: 'SIM ICCID', v: f.iccid || '—' }, { k: 'Network mode', v: f.networkMode }, { k: 'Roaming', v: f.roaming ? 'Allowed' : 'Blocked' }, { k: 'Reporting', v: every }];
  }

  get enabledCount(): number {
    return this.form.params.filter((p) => p.enabled).length;
  }

  get severityCounts(): { s: Severity; n: number }[] {
    return this.severities.map((s) => ({ s, n: this.form.alerts.filter((a) => a.enabled && a.severity === s).length }));
  }

  // ===== Live preview (stacked panels, shared x-axis) =====

  private px(i: number): number {
    return PAD.l + (i / 48) * (CW - PAD.l - PAD.r);
  }

  timeLabel(i: number, withDay = false): string {
    const d = new Date(PREVIEW_START + i * 30 * 60000);
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return withDay ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${t}` : t;
  }

  get xs(): number[] {
    return Array.from({ length: 49 }, (_, i) => this.px(i));
  }

  private previewCache: { key: string; panels: Panel[] } | null = null;

  get panels(): Panel[] {
    const sensors = this.sensorParams.slice(0, 3);
    const key = this.device.id + JSON.stringify(sensors.map((p) => [p.key, p.unit, p.threshold, p.enabled]));
    if (this.previewCache?.key === key) return this.previewCache.panels;
    const panels = sensors.map((p, n) => {
      const top = PAD.t + n * (PH + PGAP);
      const bottom = top + PH;
      const values = series(this.device.id, p.key).map((v) => convert(v, p.units[0], p.unit));
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

  // ===== Alerts =====

  editAlert(a?: AlertRule): void {
    this.alertError = '';
    const first = this.form.params[0]?.key ?? '';
    this.alertForm = a ? { ...a, isNew: false } : { id: '', param: first, cond: '>', value: 0, severity: 'Warning', notify: 'Email', enabled: true, isNew: true };
  }

  saveAlert(): void {
    const f = this.alertForm;
    if (!f) return;
    if (!f.param) return void (this.alertError = 'Choose a parameter.');
    if ((f.value as number | null) === null || !Number.isFinite(Number(f.value))) return void (this.alertError = 'Enter a numeric threshold value.');
    const { isNew, ...rule } = f;
    rule.value = Number(rule.value);
    const dup = this.form.alerts.find((a) => a.id !== rule.id && a.param === rule.param && a.cond === rule.cond && a.value === rule.value);
    if (dup) return void (this.alertError = 'An identical rule already exists.');
    if (isNew) {
      const n = Math.max(0, ...this.form.alerts.map((a) => Number(a.id.split('-')[1]) || 0)) + 1;
      this.form.alerts.push({ ...rule, id: `AR-${n}` });
    } else {
      const i = this.form.alerts.findIndex((a) => a.id === rule.id);
      if (i >= 0) this.form.alerts[i] = rule;
    }
    this.alertForm = null;
    this.showToast(`Alert rule ${isNew ? 'added' : 'updated'}. Save the draft to keep it.`);
  }

  deleteAlert(a: AlertRule): void {
    if (!confirm(`Delete the rule "${this.paramName(a.param)} ${a.cond} ${a.value} ${this.paramUnit(a.param)}"?`)) return;
    this.form.alerts = this.form.alerts.filter((x) => x !== a);
    this.showToast('Alert rule deleted.');
  }

  sevClass(s: Severity): string {
    return 'sev--' + s.toLowerCase();
  }

  // ===== Firmware =====

  get fwUpToDate(): boolean {
    return cmpVersion(this.device.firmware, this.device.latestFirmware) >= 0;
  }

  openFirmware(): void {
    this.fwError = '';
    this.fwDialog = { when: 'checkin', at: '' };
  }

  scheduleFirmware(): void {
    const f = this.fwDialog;
    const d = this.device;
    if (!f) return;
    if (f.when === 'scheduled' && (!f.at || f.at <= nowIso())) return void (this.fwError = 'Choose a future date and time.');
    const version = d.latestFirmware;
    d.firmwareTarget = { version, when: f.when === 'checkin' ? 'Next check-in' : f.at };
    this.fwDialog = null;
    this.log(`Firmware update to ${version} scheduled (${f.when === 'checkin' ? 'next check-in' : this.fmt(f.at)})`, d);
    if (f.when === 'scheduled' || d.status === 'Offline') {
      this.showToast(`Firmware ${version} pending for ${d.id}${d.status === 'Offline' ? ' (device offline)' : ''}.`);
      return;
    }
    this.showToast(`Firmware ${version} will install at ${d.id}'s next check-in…`);
    setTimeout(() => {
      if (d.firmwareTarget?.version !== version) return;
      const old = d.firmware;
      d.firmware = version;
      d.firmwareTarget = null;
      d.events.unshift({ at: nowIso(), by: 'System', text: `Firmware updated ${old} → ${version}` });
      if (d === this.device) this.showToast(`${d.id} updated to firmware ${version}.`);
    }, 8000);
  }

  cancelFirmware(): void {
    const t = this.device.firmwareTarget;
    if (!t) return;
    this.device.firmwareTarget = null;
    this.log(`Firmware update to ${t.version} cancelled`);
    this.showToast('Pending firmware update cancelled.');
  }

  get fwWhen(): string {
    const t = this.device.firmwareTarget;
    return !t ? '' : t.when === 'Next check-in' ? 'next check-in' : this.fmt(t.when);
  }

  // ===== History =====

  private flatten(c: DeviceConfig): Map<string, string> {
    const m = new Map<string, string>();
    for (const s of this.summarize(c)) m.set(s.k, s.v);
    m.set('Sampling interval', this.samplingLabel(c.sampling));
    m.set('Battery reporting interval', c.batteryInterval);
    for (const p of c.params) m.set(`${p.name}`, p.enabled ? `On · ${p.agg} · Δ ≥ ${p.threshold} ${p.unit}` : 'Off');
    for (const a of c.alerts) {
      const name = c.params.find((p) => p.key === a.param)?.name ?? a.param;
      m.set(`Alert ${a.id}`, `${name} ${a.cond} ${a.value} · ${a.severity} · ${a.notify}${a.enabled ? '' : ' (off)'}`);
    }
    return m;
  }

  get diffRows(): { k: string; from: string; to: string }[] {
    const v = this.diffOf;
    if (!v) return [];
    const prev = this.device.versions.find((x) => x.v === v.v - 1);
    const a = prev ? this.flatten(prev.config) : new Map<string, string>();
    const b = this.flatten(v.config);
    const keys = [...new Set([...a.keys(), ...b.keys()])];
    return keys.filter((k) => a.get(k) !== b.get(k)).map((k) => ({ k, from: a.get(k) ?? '—', to: b.get(k) ?? 'Removed' }));
  }

  restore(v: ConfigVersion): void {
    const d = this.draft;
    const msg = d && d !== v ? `Load v${v.v} into draft v${d.v}? The current draft contents will be replaced.` : `Load v${v.v} as a new draft?`;
    if (d === v) return void this.showToast(`v${v.v} is the current draft.`);
    if (!confirm(this.dirty ? msg + ' Unsaved changes will be lost.' : msg)) return;
    this.form = clone(v.config);
    this.baseline = '';
    const saved = this.saveDraft(true);
    if (saved) {
      saved.note = `Restored from v${v.v}`;
      this.showToast(`v${v.v} restored as draft v${saved.v}.`);
    }
  }

  statusClass(s: VersionStatus): string {
    return 'vs--' + s.toLowerCase();
  }

  // ===== Formatting / UI =====

  fmt(iso: string): string {
    return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
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
