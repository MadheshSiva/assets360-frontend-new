/**
 * Static demo device configurations: option lists and the version history of each device's connectivity, telemetry
 * and alert settings. Histories are generated from the demo device registry the first time a device is opened and
 * then kept in memory (edits last until the page is reloaded).
 */
import type { IoTDeviceDto } from '../device-management/iot-device-api.service';
import { modelByNumber } from '../device-type-model/device-models.data';
import { hashOf, isoDaysAgo } from '../shared/tracking-api';
import type { AlertRuleDto, ConfigActivityDto, ConfigOptionsDto, ConfigurationDto, TelemetryParameterDto } from './device-configuration-api.service';

export const CONFIG_OPTIONS: ConfigOptionsDto = {
  regions: ['IN865', 'EU868', 'US915', 'AU915', 'AS923', 'KR920'],
  joinModes: ['OTAA', 'ABP'],
  intervalUnits: ['seconds', 'minutes', 'hours'],
  dataRates: ['Auto (ADR)', 'DR0 (SF12)', 'DR1 (SF11)', 'DR2 (SF10)', 'DR3 (SF9)', 'DR4 (SF8)', 'DR5 (SF7)'],
  samplingIntervalsSeconds: [10, 30, 60, 120, 300, 600, 900, 1800, 3600],
  batteryReportIntervals: ['Every uplink', 'Hourly', 'Every 6 hours', 'Daily'],
  parameterTypes: ['Measurement', 'Diagnostic'],
  aggregations: ['Last', 'Average', 'Min', 'Max', 'Sum'],
  alertConditions: ['>', '>=', '<', '<=', '=', '!='],
  alertSeverities: ['Critical', 'Warning', 'Info'],
  notifyChannels: ['In-app', 'Email', 'SMS', 'Webhook'],
  deploymentModes: ['Immediate', 'Scheduled'],
  rolloutTargets: ['This device', 'Device group'],
  statuses: ['Draft', 'Queued', 'Applied', 'Superseded'],
};

/** Configuration versions per device id, oldest first. */
export const CONFIG_VERSIONS = new Map<string, ConfigurationDto[]>();
/** Configuration activity per device id, newest first. */
export const CONFIG_ACTIVITY = new Map<string, ConfigActivityDto[]>();

const UNITS: Record<string, string | null> = {
  Temperature: '°C', Humidity: '%RH', Vibration: 'mm/s', Battery: '%', Energy: 'kWh', RSSI: 'dBm', SNR: 'dB', Motion: 'g', Location: null,
  'Tag Reads': 'reads/s', 'Uplink Packets': 'pkt/min', 'People Count': 'count', 'CO₂': 'ppm', TVOC: 'ppb', Light: 'lux',
};

function params(d: IoTDeviceDto): TelemetryParameterDto[] {
  const m = modelByNumber(d.model);
  const lora = /lora/i.test(d.connectivity);
  const measured = (m?.supportedMeasurements ?? []).filter((x) => x !== 'Battery' && x !== 'RSSI');
  const rows: TelemetryParameterDto[] = measured.map((name) => ({
    name, type: 'Measurement', unit: UNITS[name] ?? null, enabled: true,
    aggregation: name === 'Energy' || name === 'Tag Reads' ? 'Sum' : name === 'Vibration' ? 'Max' : name === 'Location' ? 'Last' : 'Average',
    transmitThreshold: name === 'Temperature' ? 0.5 : name === 'Vibration' ? 0.3 : name === 'Humidity' ? 2 : null,
  }));
  if (d.batteryLevel !== null) rows.push({ name: 'Battery', type: 'Diagnostic', unit: '%', enabled: true, aggregation: 'Last', transmitThreshold: 1 });
  rows.push({ name: 'RSSI', type: 'Diagnostic', unit: 'dBm', enabled: true, aggregation: 'Average', transmitThreshold: null });
  if (lora) rows.push({ name: 'SNR', type: 'Diagnostic', unit: 'dB', enabled: false, aggregation: 'Average', transmitThreshold: null });
  return rows;
}

function rules(d: IoTDeviceDto, ps: TelemetryParameterDto[]): AlertRuleDto[] {
  const out: AlertRuleDto[] = [];
  const has = (n: string) => ps.some((p) => p.name === n);
  const add = (parameter: string, condition: string, value: number, unit: string | null, severity: string, notifyChannels: string[], active = true) =>
    out.push({ ruleId: `CR-${d.deviceId}-${out.length + 1}`, parameter, condition, value, unit, severity, notifyChannels, active });
  const name = `${d.assetName ?? ''} ${d.deviceName}`.toLowerCase();
  if (has('Temperature')) {
    if (/cr-01|frozen|reefer|rc-02/.test(name)) add('Temperature', '>', -15, '°C', 'Critical', ['In-app', 'Email', 'SMS']);
    else if (/cr-02|chilled/.test(name)) add('Temperature', '>', 8, '°C', 'Critical', ['In-app', 'Email', 'SMS']);
    else if (/chiller/.test(name)) add('Temperature', '>', 12, '°C', 'Warning', ['In-app', 'Email']);
    else add('Temperature', '>', 55, '°C', 'Warning', ['In-app', 'Email']);
  }
  if (has('Humidity')) add('Humidity', '>', 85, '%RH', 'Warning', ['In-app']);
  if (has('Vibration')) {
    add('Vibration', '>', 7.1, 'mm/s', 'Critical', ['In-app', 'Email', 'SMS']);
    add('Vibration', '>', 4.5, 'mm/s', 'Warning', ['In-app']);
  }
  if (has('Energy')) add('Energy', '>', 45, 'kWh', 'Info', ['In-app'], false);
  if (has('Battery')) add('Battery', '<', 20, '%', 'Warning', ['In-app', 'Email']);
  return out;
}

function base(d: IoTDeviceDto, version: number, status: string, createdDays: number, by: string, note: string): ConfigurationDto {
  const lora = /lora/i.test(d.connectivity);
  const h = hashOf(d.deviceId).toString(16).toUpperCase().padStart(8, '0');
  const tracker = /tracker/i.test(d.deviceType);
  const ps = params(d);
  const at = isoDaysAgo(createdDays);
  return {
    id: `CFG-${d.deviceId}-v${version}`,
    deviceId: d.deviceId,
    version,
    status,
    note,
    connectivity: {
      protocol: d.connectivity,
      region: lora ? (d.siteId === 'SITE-DXB-01' ? 'EU868' : 'IN865') : null,
      joinMode: lora ? 'OTAA' : null,
      appEui: lora ? '70B3D57ED0' + h.slice(0, 6) : null,
      devEui: lora ? ('24E124' + h + 'A0').slice(0, 16) : null,
      reportingInterval: tracker ? 30 : lora ? (version === 1 ? 15 : 10) : 1,
      reportingIntervalUnit: tracker ? 'seconds' : 'minutes',
      confirmedUplink: false,
      adaptiveDataRate: true,
      dataRate: null,
    },
    telemetry: {
      samplingIntervalSeconds: tracker ? 10 : lora ? 300 : 60,
      batteryReporting: d.batteryLevel !== null,
      batteryReportInterval: d.batteryLevel !== null ? 'Hourly' : null,
      transmittedCount: ps.filter((p) => p.enabled).length,
      parameters: ps,
    },
    alertRules: rules(d, ps),
    deploymentMode: 'Immediate',
    scheduledAt: null,
    rolloutTarget: 'This device',
    deviceGroup: null,
    restoredFromVersion: null,
    createdBy: by,
    createdAt: at,
    updatedBy: null,
    updatedAt: null,
    appliedBy: status === 'Draft' ? null : by,
    appliedAt: status === 'Draft' ? null : isoDaysAgo(createdDays - 0.01),
    confirmedAt: status === 'Applied' || status === 'Superseded' ? isoDaysAgo(createdDays - 0.02) : null,
  };
}

/** Versions of a device, generated on first use: v1 at install, v2 tuning (applied); some devices also have a draft. */
export function versionsOf(d: IoTDeviceDto): ConfigurationDto[] {
  let list = CONFIG_VERSIONS.get(d.deviceId);
  if (list) return list;
  const installed = Math.max(2, Math.round((Date.now() - Date.parse(d.createdAt ?? new Date().toISOString())) / 86_400_000));
  const v1 = base(d, 1, 'Superseded', installed, d.createdBy ?? 'arjun.mehta', 'Initial configuration at install');
  const v2 = base(d, 2, 'Applied', Math.max(1, Math.round(installed / 3)), 'kavya.nair', 'Reporting interval tuned for battery life');
  list = [v1, v2];
  const activity: ConfigActivityDto[] = [
    { version: 2, message: 'Device confirmed v2 at check-in', at: v2.confirmedAt!, by: 'system' },
    { version: 2, message: 'v2 applied (immediate)', at: v2.appliedAt!, by: v2.createdBy },
    { version: 1, message: 'Device confirmed v1 at check-in', at: v1.confirmedAt!, by: 'system' },
    { version: 1, message: 'v1 applied at registration', at: v1.appliedAt!, by: v1.createdBy },
  ];
  if (hashOf(d.deviceId) % 4 === 0 && !/gateway|rfid/i.test(d.deviceType)) {
    const draft = base(d, 3, 'Draft', 1, 'priya.raman', 'Tighter thresholds for summer');
    draft.connectivity.confirmedUplink = true;
    draft.alertRules = draft.alertRules.map((r) => (r.parameter === 'Battery' ? { ...r, value: 25 } : r));
    list.push(draft);
    activity.unshift({ version: 3, message: 'Draft v3 saved', at: draft.createdAt!, by: draft.createdBy });
  }
  CONFIG_VERSIONS.set(d.deviceId, list);
  CONFIG_ACTIVITY.set(d.deviceId, activity);
  return list;
}

export function activityOf(d: IoTDeviceDto): ConfigActivityDto[] {
  versionsOf(d);
  return CONFIG_ACTIVITY.get(d.deviceId)!;
}
