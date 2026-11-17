import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, clone, demo, demoError } from '../shared/tracking-api';
import type { IoTDeviceDto } from '../device-management/iot-device-api.service';
import { IOT_DEVICES, liveDevices } from '../device-management/iot-devices.data';
import { modelByNumber } from '../device-type-model/device-models.data';
import { DEVICE_HEALTH } from '../device-health/device-health.data';
import { FIRMWARE_VERSIONS } from '../firmware-connectivity/firmware-versions.data';
import { IOT_ALERTS } from '../geofence-alerts/iot-alerts.data';
import { AlertRule, ConfigVersion, DeviceConfig, HistoryEvent, ParamIcon, TelemetryParam, VersionStatus } from './config-data';
import { CONFIG_ACTIVITY, CONFIG_OPTIONS, CONFIG_VERSIONS, activityOf, versionsOf } from './device-configurations.data';
import { sameModel } from './iot-device-lookup.service';

// ===== DTOs =====

export interface ConfigOptionsDto {
  regions: string[];
  joinModes: string[];
  intervalUnits: string[];
  dataRates: string[];
  samplingIntervalsSeconds: number[];
  batteryReportIntervals: string[];
  parameterTypes: string[];
  aggregations: string[];
  alertConditions: string[];
  alertSeverities: string[];
  notifyChannels: string[];
  deploymentModes: string[];
  rolloutTargets: string[];
  statuses: string[];
}

export interface ConnectivitySettingsDto {
  protocol: string | null;
  region: string | null;
  joinMode: string | null;
  appEui: string | null;
  devEui: string | null;
  reportingInterval: number;
  reportingIntervalUnit: string;
  confirmedUplink: boolean;
  adaptiveDataRate: boolean;
  dataRate: string | null;
}

export interface TelemetryParameterDto {
  name: string;
  type: string;
  unit: string | null;
  enabled: boolean;
  aggregation: string;
  transmitThreshold: number | null;
  activeAlertRules?: number;
}

export interface AlertRuleDto {
  ruleId: string;
  parameter: string;
  condition: string;
  value: number;
  unit: string | null;
  severity: string;
  notifyChannels: string[];
  active: boolean;
}

export interface ConfigurationDto {
  id: string;
  deviceId: string;
  version: number;
  status: string | null;
  note: string | null;
  connectivity: ConnectivitySettingsDto;
  telemetry: { samplingIntervalSeconds: number; batteryReporting: boolean; batteryReportInterval: string | null; transmittedCount: number; parameters: TelemetryParameterDto[] };
  alertRules: AlertRuleDto[];
  deploymentMode: string;
  scheduledAt: string | null;
  rolloutTarget: string;
  deviceGroup: string | null;
  restoredFromVersion: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  confirmedAt: string | null;
}

export interface ConfigCheckDto { key: string; title: string; passed: boolean; detail: string }
export interface ConfigValidationDto { passed: boolean; passedCount: number; totalCount: number; checks: ConfigCheckDto[] }

export interface ConfigDeviceDto {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  gateway: string | null;
  assetRegistrationId: string | null;
  assetName: string | null;
  status: string | null;
  lastSeenAt: string | null;
  batteryLevel: number | null;
  rssiDbm: number | null;
  snrDb: number | null;
  firmwareVersion: string | null;
}

export interface DeviceFirmwareDto {
  model: string;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  latestReleaseDate: string | null;
  releaseNotes: string[];
  minimumVersion: string | null;
  isCompatible: boolean | null;
  pendingVersion: string | null;
  updateScheduledAt: string | null;
}

export interface ConfigOverviewDto {
  device: ConfigDeviceDto;
  current: ConfigurationDto | null;
  runningVersion: number | null;
  draft: ConfigurationDto | null;
  editable: ConfigurationDto;
  alertCounts: { critical: number; warning: number; info: number };
  firmware: DeviceFirmwareDto;
  validation: ConfigValidationDto;
}

export interface ConfigVersionDto {
  version: number;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  appliedAt: string | null;
  confirmedAt: string | null;
  note: string | null;
}

export interface ConfigActivityDto { version: number; message: string; at: string; by: string | null }

/** Save Draft / Validate / Apply body. Sections left out keep their saved value. */
export interface SaveConfigRequest {
  note?: string | null;
  connectivity?: Partial<Omit<ConnectivitySettingsDto, 'reportingInterval'>> & { reportingInterval?: number };
  telemetry?: { samplingIntervalSeconds?: number; batteryReporting?: boolean; batteryReportInterval?: string | null; parameters?: Omit<TelemetryParameterDto, 'activeAlertRules'>[] };
  alertRules?: AlertRuleRequest[];
  deploymentMode?: string;
  scheduledAt?: string | null;
  rolloutTarget?: string;
  deviceGroup?: string | null;
}

export interface AlertRuleRequest {
  ruleId?: string | null;
  parameter: string;
  condition: string;
  value: number;
  unit?: string | null;
  severity: string;
  notifyChannels: string[];
  active: boolean;
}

// ===== Mapping =====

const UNIT_GROUPS = [['°C', '°F'], ['km/h', 'mph']];

/** Row icon for a telemetry parameter name. */
export function iconFor(name: string): ParamIcon {
  const n = name.toLowerCase();
  if (n.includes('temp')) return 'temp';
  if (n.includes('humid')) return 'hum';
  if (n.includes('batt')) return 'battery';
  if (n.includes('rssi') || n.includes('signal')) return 'rssi';
  if (n.includes('snr') || n.includes('noise')) return 'snr';
  if (n.includes('vib')) return 'vib';
  if (n.includes('accel') || n.includes('motion') || n.includes('tilt')) return 'accel';
  if (n.includes('speed')) return 'speed';
  if (n.includes('volt')) return 'volt';
  if (n.includes('ign')) return 'ign';
  return 'rssi';
}

function paramFromDto(p: TelemetryParameterDto): TelemetryParam {
  const unit = p.unit ?? '';
  return {
    key: p.name,
    name: p.name,
    icon: iconFor(p.name),
    kind: p.type === 'Diagnostic' ? 'diag' : 'sensor',
    unit,
    units: UNIT_GROUPS.find((g) => g.includes(unit)) ?? [unit],
    enabled: p.enabled,
    agg: p.aggregation,
    threshold: p.transmitThreshold,
  };
}

export function ruleFromDto(r: AlertRuleDto): AlertRule {
  return { id: r.ruleId, param: r.parameter, cond: r.condition, value: r.value, unit: r.unit, severity: r.severity, notify: [...(r.notifyChannels ?? [])], enabled: r.active };
}

export function ruleToRequest(r: AlertRule): AlertRuleRequest {
  return { ruleId: r.id || null, parameter: r.param, condition: r.cond, value: Number(r.value), unit: r.unit, severity: r.severity, notifyChannels: r.notify, active: r.enabled };
}

/** Form model for a configuration version. */
export function configFromDto(c: ConfigurationDto): DeviceConfig {
  const cx = c.connectivity;
  return {
    protocol: cx.protocol ?? '',
    region: cx.region ?? '',
    joinMode: cx.joinMode ?? '',
    appEui: cx.appEui ?? '',
    devEui: cx.devEui ?? '',
    confirmed: cx.confirmedUplink,
    adr: cx.adaptiveDataRate,
    dataRate: cx.dataRate ?? '',
    interval: cx.reportingInterval,
    intervalUnit: cx.reportingIntervalUnit,
    sampling: c.telemetry.samplingIntervalSeconds,
    batteryReporting: c.telemetry.batteryReporting,
    batteryInterval: c.telemetry.batteryReportInterval ?? '',
    params: (c.telemetry.parameters ?? []).map(paramFromDto),
    alerts: (c.alertRules ?? []).map(ruleFromDto),
  };
}

/** Save Draft / Validate / Apply body for the form (all tabs). Empty text fields are left out, so they keep their saved value. */
export function configToRequest(f: DeviceConfig): SaveConfigRequest {
  const text = (v: string) => (v.trim() ? v.trim() : null);
  return {
    connectivity: {
      protocol: text(f.protocol),
      region: text(f.region),
      joinMode: text(f.joinMode),
      appEui: text(f.appEui),
      devEui: text(f.devEui),
      reportingInterval: Number(f.interval),
      reportingIntervalUnit: f.intervalUnit,
      confirmedUplink: f.confirmed,
      adaptiveDataRate: f.adr,
      dataRate: f.adr ? null : text(f.dataRate),
    },
    telemetry: {
      samplingIntervalSeconds: Number(f.sampling),
      batteryReporting: f.batteryReporting,
      batteryReportInterval: text(f.batteryInterval),
      parameters: f.params.map((p) => ({
        name: p.name,
        type: p.kind === 'diag' ? 'Diagnostic' : 'Measurement',
        unit: p.unit || null,
        enabled: p.enabled,
        aggregation: p.agg,
        transmitThreshold: p.threshold === null || (p.threshold as unknown) === '' ? null : Number(p.threshold),
      })),
    },
    alertRules: f.alerts.map(ruleToRequest),
  };
}

export function versionFromDto(v: ConfigVersionDto): ConfigVersion {
  return {
    v: v.version,
    status: (v.status ?? 'Draft') as VersionStatus,
    createdBy: v.createdBy ?? '—',
    created: v.createdAt,
    applied: v.appliedAt,
    confirmed: v.confirmedAt,
    note: v.note ?? '',
  };
}

export function activityFromDto(a: ConfigActivityDto): HistoryEvent {
  return { at: a.at, by: a.by ?? '—', text: a.message, version: a.version };
}

/** Device configurations (static demo): versioned settings per device, kept in device-configurations.data.ts. */
@Injectable({ providedIn: 'root' })
export class DeviceConfigurationApiService {
  private readonly auth = inject(AuthService);

  private user(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  private device(deviceId: string): IoTDeviceDto | null {
    return liveDevices().find((d) => d.deviceId === deviceId) ?? null;
  }

  private log(deviceId: string, version: number, message: string): void {
    CONFIG_ACTIVITY.get(deviceId)?.unshift({ version, message, at: new Date().toISOString(), by: this.user() });
  }

  /** The device's draft, created from the latest version when there is none. */
  private draftOf(d: IoTDeviceDto): ConfigurationDto {
    const list = versionsOf(d);
    const existing = list.find((v) => v.status === 'Draft');
    if (existing) return existing;
    const latest = list[list.length - 1];
    const now = new Date().toISOString();
    const draft: ConfigurationDto = {
      ...clone(latest), id: `CFG-${d.deviceId}-v${latest.version + 1}`, version: latest.version + 1, status: 'Draft', note: null,
      deploymentMode: 'Immediate', scheduledAt: null, restoredFromVersion: null, createdBy: this.user(), createdAt: now,
      updatedBy: null, updatedAt: null, appliedBy: null, appliedAt: null, confirmedAt: null,
    };
    list.push(draft);
    return draft;
  }

  private merge(c: ConfigurationDto, body: SaveConfigRequest): void {
    if (body.note !== undefined) c.note = body.note;
    if (body.connectivity) {
      const cx = body.connectivity;
      for (const [k, v] of Object.entries(cx)) if (v !== null && v !== undefined) (c.connectivity as unknown as Record<string, unknown>)[k] = v;
      if (cx.adaptiveDataRate) c.connectivity.dataRate = null;
    }
    if (body.telemetry) {
      const t = body.telemetry;
      if (t.samplingIntervalSeconds !== undefined) c.telemetry.samplingIntervalSeconds = t.samplingIntervalSeconds;
      if (t.batteryReporting !== undefined) c.telemetry.batteryReporting = t.batteryReporting;
      if (t.batteryReportInterval !== undefined && t.batteryReportInterval !== null) c.telemetry.batteryReportInterval = t.batteryReportInterval;
      if (t.parameters) c.telemetry.parameters = t.parameters.map((p) => ({ ...p }));
      c.telemetry.transmittedCount = c.telemetry.parameters.filter((p) => p.enabled).length;
    }
    if (body.alertRules) c.alertRules = body.alertRules.map((r, i) => this.ruleOf(c.deviceId, r, i));
    if (body.deploymentMode) c.deploymentMode = body.deploymentMode;
    if (body.scheduledAt !== undefined) c.scheduledAt = body.scheduledAt;
    if (body.rolloutTarget) c.rolloutTarget = body.rolloutTarget;
    if (body.deviceGroup !== undefined) c.deviceGroup = body.deviceGroup;
    c.updatedBy = this.user();
    c.updatedAt = new Date().toISOString();
  }

  private ruleOf(deviceId: string, r: AlertRuleRequest, i = 0): AlertRuleDto {
    return {
      ruleId: r.ruleId || `CR-${deviceId}-${Date.now().toString(36)}${i}`, parameter: r.parameter, condition: r.condition, value: Number(r.value),
      unit: r.unit ?? null, severity: r.severity, notifyChannels: [...r.notifyChannels], active: r.active,
    };
  }

  private firmwareOf(d: IoTDeviceDto): DeviceFirmwareDto {
    const fw = FIRMWARE_VERSIONS.find((f) => sameModel(d.model, f.deviceModel));
    const m = modelByNumber(d.model);
    const installed = d.firmwareVersion;
    const latest = fw?.latestVersion ?? m?.firmwareTo ?? null;
    const min = m?.firmwareFrom ?? null;
    return {
      model: d.model,
      installedVersion: installed,
      latestVersion: latest,
      updateAvailable: !!installed && !!latest && compareVersions(installed, latest) < 0,
      latestReleaseDate: fw?.releaseDate ?? null,
      releaseNotes: fw?.releaseNotes ?? [],
      minimumVersion: min,
      isCompatible: installed && min ? compareVersions(installed, min) >= 0 : null,
      pendingVersion: d.pendingFirmwareVersion,
      updateScheduledAt: d.firmwareUpdateScheduledAt,
    };
  }

  private check(d: IoTDeviceDto, c: ConfigurationDto): ConfigValidationDto {
    const cx = c.connectivity;
    const lora = /lora/i.test(cx.protocol ?? d.connectivity);
    const unitSec: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600 };
    const reportSec = cx.reportingInterval * (unitSec[cx.reportingIntervalUnit] ?? 60);
    const enabled = c.telemetry.parameters.filter((p) => p.enabled).map((p) => p.name);
    const badRule = c.alertRules.find((r) => r.active && !enabled.includes(r.parameter));
    const fw = this.firmwareOf(d);
    const connOk = cx.reportingInterval > 0 && (!lora || (!!cx.region && !!cx.joinMode && /^[0-9A-F]{16}$/i.test(cx.devEui ?? '')));
    const checks: ConfigCheckDto[] = [
      {
        key: 'connectivity', title: 'Connectivity settings', passed: connOk,
        detail: connOk ? `${cx.protocol ?? d.connectivity} · reporting every ${cx.reportingInterval} ${cx.reportingIntervalUnit}` : lora ? 'LoRaWAN needs a region, a join mode and a 16-hex-digit DevEUI.' : 'The reporting interval must be greater than zero.',
      },
      {
        key: 'telemetry', title: 'Telemetry parameters', passed: enabled.length > 0 && c.telemetry.samplingIntervalSeconds <= reportSec,
        detail: !enabled.length ? 'Enable at least one parameter.' : c.telemetry.samplingIntervalSeconds > reportSec ? 'The sampling interval is longer than the reporting interval.' : `${enabled.length} parameter${enabled.length > 1 ? 's' : ''} transmitted, sampled every ${c.telemetry.samplingIntervalSeconds} s`,
      },
      {
        key: 'alertRules', title: 'Alert rules', passed: !badRule,
        detail: badRule ? `Rule on ${badRule.parameter} refers to a parameter that is not transmitted.` : `${c.alertRules.filter((r) => r.active).length} active rule(s) reference transmitted parameters`,
      },
      {
        key: 'firmware', title: 'Firmware compatibility', passed: fw.isCompatible !== false,
        detail: fw.isCompatible === false ? `Firmware ${fw.installedVersion} is older than the minimum ${fw.minimumVersion} for ${d.model}.` : `Firmware ${fw.installedVersion ?? '—'} supports this configuration`,
      },
    ];
    const passedCount = checks.filter((x) => x.passed).length;
    return { passed: passedCount === checks.length, passedCount, totalCount: checks.length, checks };
  }

  options(): Observable<ConfigOptionsDto> {
    return demo(CONFIG_OPTIONS);
  }

  overview(deviceId: string): Observable<ConfigOverviewDto> {
    const d = this.device(deviceId);
    if (!d) return demoError(`Device ${deviceId} was not found.`);
    const list = versionsOf(d);
    const draft = list.find((v) => v.status === 'Draft') ?? null;
    const current = [...list].reverse().find((v) => v.status !== 'Draft') ?? null;
    const running = [...list].reverse().find((v) => v.status === 'Applied') ?? null;
    const editable = draft ?? current ?? this.draftOf(d);
    const health = DEVICE_HEALTH.find((h) => h.deviceId === d.deviceId);
    const open = IOT_ALERTS.filter((a) => a.deviceId === d.deviceId && a.status !== 'Resolved');
    return demo({
      device: {
        deviceId: d.deviceId, deviceName: d.deviceName, deviceType: d.deviceType, model: d.model, gateway: d.gateway, assetRegistrationId: d.assetRegistrationId,
        assetName: d.assetName, status: health?.connectivity ?? d.status ?? null, lastSeenAt: d.lastSeenAt, batteryLevel: d.batteryLevel,
        rssiDbm: health?.signalStrengthDbm ?? null, snrDb: health?.snrDb ?? null, firmwareVersion: d.firmwareVersion,
      },
      current,
      runningVersion: running?.version ?? null,
      draft,
      editable,
      alertCounts: {
        critical: open.filter((a) => a.severity === 'Critical').length,
        warning: open.filter((a) => a.severity === 'Warning').length,
        info: open.filter((a) => a.severity === 'Info').length,
      },
      firmware: this.firmwareOf(d),
      validation: this.check(d, editable),
    });
  }

  saveDraft(deviceId: string, body: SaveConfigRequest): Observable<ConfigurationDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not save the draft.');
    const draft = this.draftOf(d);
    this.merge(draft, body);
    this.log(deviceId, draft.version, `Draft v${draft.version} saved`);
    return demo(draft);
  }

  discardDraft(deviceId: string): Observable<void> {
    const list = CONFIG_VERSIONS.get(deviceId) ?? [];
    const i = list.findIndex((v) => v.status === 'Draft');
    if (i >= 0) {
      this.log(deviceId, list[i].version, `Draft v${list[i].version} discarded`);
      list.splice(i, 1);
    }
    return demo(undefined as void);
  }

  /** Checks the draft with the unsaved changes in the body, without saving. */
  validate(deviceId: string, body: SaveConfigRequest): Observable<ConfigValidationDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not validate the configuration.');
    const list = versionsOf(d);
    const c = clone(list.find((v) => v.status === 'Draft') ?? list[list.length - 1]);
    this.merge(c, body);
    return demo(this.check(d, c));
  }

  /** Saves the body into the draft and queues it; a failing check answers 422 with the checks. */
  apply(deviceId: string, body: SaveConfigRequest): Observable<ConfigurationDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not apply the configuration.');
    const list = versionsOf(d);
    const trial = clone(list.find((v) => v.status === 'Draft') ?? list[list.length - 1]);
    this.merge(trial, body);
    const validation = this.check(d, trial);
    if (!validation.passed) return throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable Entity', error: validation }));
    const draft = this.draftOf(d);
    this.merge(draft, body);
    for (const v of list) if (v.status === 'Queued') v.status = 'Superseded';
    draft.status = 'Queued';
    draft.appliedBy = this.user();
    draft.appliedAt = new Date().toISOString();
    const when = draft.deploymentMode === 'Scheduled' && draft.scheduledAt ? `scheduled for ${new Date(draft.scheduledAt).toLocaleString()}` : 'immediate';
    this.log(deviceId, draft.version, `v${draft.version} applied (${when})`);
    return demo(draft);
  }

  addRule(deviceId: string, rule: AlertRuleRequest): Observable<AlertRuleDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not add the alert rule.');
    const draft = this.draftOf(d);
    const dto = this.ruleOf(deviceId, { ...rule, ruleId: null });
    draft.alertRules.push(dto);
    this.log(deviceId, draft.version, `Alert rule added: ${dto.parameter} ${dto.condition} ${dto.value}${dto.unit ? ' ' + dto.unit : ''}`);
    return demo(dto);
  }

  updateRule(deviceId: string, ruleId: string, rule: AlertRuleRequest): Observable<AlertRuleDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not update the alert rule.');
    const draft = this.draftOf(d);
    const i = draft.alertRules.findIndex((r) => r.ruleId === ruleId);
    const dto = this.ruleOf(deviceId, { ...rule, ruleId });
    if (i >= 0) draft.alertRules[i] = dto;
    else draft.alertRules.push(dto);
    this.log(deviceId, draft.version, `Alert rule updated: ${dto.parameter} ${dto.condition} ${dto.value}`);
    return demo(dto);
  }

  setRuleActive(deviceId: string, ruleId: string, active: boolean): Observable<AlertRuleDto> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not change the alert rule.');
    const draft = this.draftOf(d);
    const r = draft.alertRules.find((x) => x.ruleId === ruleId);
    if (!r) return demoError('The alert rule was not found.');
    r.active = active;
    this.log(deviceId, draft.version, `Alert rule on ${r.parameter} ${active ? 'enabled' : 'disabled'}`);
    return demo(r);
  }

  deleteRule(deviceId: string, ruleId: string): Observable<void> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not delete the alert rule.');
    const draft = this.draftOf(d);
    const i = draft.alertRules.findIndex((x) => x.ruleId === ruleId);
    if (i >= 0) {
      this.log(deviceId, draft.version, `Alert rule on ${draft.alertRules[i].parameter} deleted`);
      draft.alertRules.splice(i, 1);
    }
    return demo(undefined as void);
  }

  versions(deviceId: string): Observable<ConfigVersionDto[]> {
    const d = this.device(deviceId);
    if (!d) return demoError('Could not load configuration versions.');
    return demo(versionsOf(d).map((v) => ({ version: v.version, status: v.status, createdBy: v.createdBy, createdAt: v.createdAt, appliedAt: v.appliedAt, confirmedAt: v.confirmedAt, note: v.note })));
  }

  version(deviceId: string, version: number): Observable<ConfigurationDto> {
    const d = this.device(deviceId);
    const v = d ? versionsOf(d).find((x) => x.version === version) : undefined;
    return v ? demo(v) : demoError(`Could not load v${version}.`);
  }

  /** A new draft with the settings of `version`. */
  restore(deviceId: string, version: number): Observable<ConfigurationDto> {
    const d = this.device(deviceId);
    const src = d ? versionsOf(d).find((x) => x.version === version) : undefined;
    if (!d || !src) return demoError(`Could not restore v${version}.`);
    const draft = this.draftOf(d);
    draft.connectivity = clone(src.connectivity);
    draft.telemetry = clone(src.telemetry);
    draft.alertRules = clone(src.alertRules);
    draft.restoredFromVersion = version;
    draft.note = `Restored from v${version}`;
    this.log(deviceId, draft.version, `Draft v${draft.version} restored from v${version}`);
    return demo(draft);
  }

  /** Records that the device confirmed a Queued version at check-in. */
  confirm(deviceId: string, version: number): Observable<ConfigurationDto> {
    const d = this.device(deviceId);
    const list = d ? versionsOf(d) : [];
    const v = list.find((x) => x.version === version);
    if (!v) return demoError(`Could not confirm v${version}.`);
    for (const x of list) if (x !== v && (x.status === 'Applied' || x.status === 'Queued')) x.status = 'Superseded';
    v.status = 'Applied';
    v.confirmedAt = new Date().toISOString();
    this.log(deviceId, version, `Device confirmed v${version} at check-in`);
    return demo(v);
  }

  activity(deviceId: string): Observable<ConfigActivityDto[]> {
    const d = this.device(deviceId);
    return d ? demo(activityOf(d)) : demoError('Could not load configuration activity.');
  }

  firmware(deviceId: string): Observable<DeviceFirmwareDto> {
    const d = this.device(deviceId);
    return d ? demo(this.firmwareOf(d)) : demoError(`Could not load the firmware of ${deviceId}.`);
  }

  /** targetVersion defaults to the model's latest; scheduledAt must be in the future. */
  scheduleFirmware(deviceId: string, scheduledAt: string, targetVersion?: string | null): Observable<DeviceFirmwareDto> {
    const d = IOT_DEVICES.find((x) => x.deviceId === deviceId);
    if (!d) return demoError(`Could not schedule the firmware update of ${deviceId}.`);
    if (!(Date.parse(scheduledAt) > Date.now())) return demoError('Choose a time in the future for the firmware update.');
    const target = targetVersion || this.firmwareOf(d).latestVersion;
    if (!target) return demoError(`No firmware version is known for ${d.model}.`);
    d.pendingFirmwareVersion = target;
    d.firmwareUpdateScheduledAt = scheduledAt;
    return demo(this.firmwareOf(d));
  }

  cancelFirmware(deviceId: string): Observable<void> {
    const d = IOT_DEVICES.find((x) => x.deviceId === deviceId);
    if (d) {
      d.pendingFirmwareVersion = null;
      d.firmwareUpdateScheduledAt = null;
    }
    return demo(undefined as void);
  }
}

/** -1 / 0 / 1 comparing dotted version numbers ("2.10.0" > "2.9.1"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((x) => Number(x) || 0);
  const pb = b.split(/[.\-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
