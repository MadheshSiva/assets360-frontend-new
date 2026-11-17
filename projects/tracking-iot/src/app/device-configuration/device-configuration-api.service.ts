import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError } from 'rxjs';
import { apiError, tenantParams, trackingUrl } from '../shared/tracking-api';
import { AlertRule, ConfigVersion, DeviceConfig, HistoryEvent, ParamIcon, TelemetryParam, VersionStatus } from './config-data';

// ===== DTOs (/api/device-configurations) =====

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

/** /api/device-configurations: versioned connectivity, telemetry and alert settings of one IoT device. */
@Injectable({ providedIn: 'root' })
export class DeviceConfigurationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = trackingUrl('device-configurations');

  private url(deviceId: string, path = ''): string {
    return `${this.base}/${encodeURIComponent(deviceId)}${path}`;
  }

  options(): Observable<ConfigOptionsDto> {
    return this.http.get<ConfigOptionsDto>(`${this.base}/options`, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load configuration options.')));
  }

  overview(deviceId: string): Observable<ConfigOverviewDto> {
    return this.http.get<ConfigOverviewDto>(this.url(deviceId), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load the configuration of ${deviceId}.`)));
  }

  saveDraft(deviceId: string, body: SaveConfigRequest): Observable<ConfigurationDto> {
    return this.http.put<ConfigurationDto>(this.url(deviceId, '/draft'), body, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not save the draft.')));
  }

  discardDraft(deviceId: string): Observable<void> {
    return this.http.delete<void>(this.url(deviceId, '/draft'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not discard the draft.')));
  }

  /** Checks the draft with the unsaved changes in the body, without saving. 400 = invalid field values. */
  validate(deviceId: string, body: SaveConfigRequest): Observable<ConfigValidationDto> {
    return this.http.post<ConfigValidationDto>(this.url(deviceId, '/validate'), body, { params: tenantParams() });
  }

  /** Saves the body into the draft and queues it. 422 carries a ConfigValidationDto with the failing checks. */
  apply(deviceId: string, body: SaveConfigRequest): Observable<ConfigurationDto> {
    return this.http.post<ConfigurationDto>(this.url(deviceId, '/apply'), body, { params: tenantParams() });
  }

  addRule(deviceId: string, rule: AlertRuleRequest): Observable<AlertRuleDto> {
    return this.http.post<AlertRuleDto>(this.url(deviceId, '/draft/alert-rules'), rule, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not add the alert rule.')));
  }

  updateRule(deviceId: string, ruleId: string, rule: AlertRuleRequest): Observable<AlertRuleDto> {
    return this.http.put<AlertRuleDto>(this.url(deviceId, `/draft/alert-rules/${encodeURIComponent(ruleId)}`), rule, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not update the alert rule.')));
  }

  setRuleActive(deviceId: string, ruleId: string, active: boolean): Observable<AlertRuleDto> {
    return this.http.patch<AlertRuleDto>(this.url(deviceId, `/draft/alert-rules/${encodeURIComponent(ruleId)}/active`), { active }, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not change the alert rule.')));
  }

  deleteRule(deviceId: string, ruleId: string): Observable<void> {
    return this.http.delete<void>(this.url(deviceId, `/draft/alert-rules/${encodeURIComponent(ruleId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not delete the alert rule.')));
  }

  versions(deviceId: string): Observable<ConfigVersionDto[]> {
    return this.http.get<ConfigVersionDto[]>(this.url(deviceId, '/versions'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load configuration versions.')));
  }

  version(deviceId: string, version: number): Observable<ConfigurationDto> {
    return this.http.get<ConfigurationDto>(this.url(deviceId, `/versions/${version}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load v${version}.`)));
  }

  restore(deviceId: string, version: number): Observable<ConfigurationDto> {
    return this.http.post<ConfigurationDto>(this.url(deviceId, `/versions/${version}/restore`), {}, { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not restore v${version}.`)));
  }

  /** Records that the device confirmed a Queued version at check-in. */
  confirm(deviceId: string, version: number): Observable<ConfigurationDto> {
    return this.http.post<ConfigurationDto>(this.url(deviceId, `/versions/${version}/confirm`), {}, { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not confirm v${version}.`)));
  }

  activity(deviceId: string): Observable<ConfigActivityDto[]> {
    return this.http.get<ConfigActivityDto[]>(this.url(deviceId, '/activity'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load configuration activity.')));
  }

  firmware(deviceId: string): Observable<DeviceFirmwareDto> {
    return this.http.get<DeviceFirmwareDto>(this.url(deviceId, '/firmware'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load the firmware of ${deviceId}.`)));
  }

  /** targetVersion defaults to the model's latest; scheduledAt must be in the future. */
  scheduleFirmware(deviceId: string, scheduledAt: string, targetVersion?: string | null): Observable<DeviceFirmwareDto> {
    return this.http
      .put<DeviceFirmwareDto>(this.url(deviceId, '/firmware/schedule'), { targetVersion: targetVersion ?? null, scheduledAt }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, `Could not schedule the firmware update of ${deviceId}.`)));
  }

  cancelFirmware(deviceId: string): Observable<void> {
    return this.http.delete<void>(this.url(deviceId, '/firmware/schedule'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not cancel the firmware update of ${deviceId}.`)));
  }
}
