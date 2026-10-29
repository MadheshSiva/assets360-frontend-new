/* Demo data for Device Configuration. Module-level arrays act as session-only storage. */

export type Protocol = 'LoRaWAN' | 'BLE 5.0' | 'Cellular';
export type Agg = 'Average' | 'Min' | 'Max' | 'Last';
export type ParamIcon = 'temp' | 'hum' | 'battery' | 'rssi' | 'snr' | 'vib' | 'accel' | 'speed' | 'volt' | 'ign';
export type VersionStatus = 'Draft' | 'Queued' | 'Scheduled' | 'Applied' | 'Superseded';
export type Severity = 'Critical' | 'Warning' | 'Info';
export type Cond = '>' | '<' | '≥' | '≤';

export interface TelemetryParam {
  key: string;
  name: string;
  icon: ParamIcon;
  /** sensor = measured value (shown on Connectivity tab and preview); diag = device health. */
  kind: 'sensor' | 'diag';
  unit: string;
  units: string[];
  enabled: boolean;
  agg: Agg;
  threshold: number;
}

export interface AlertRule {
  id: string;
  param: string;
  cond: Cond;
  value: number;
  severity: Severity;
  notify: string;
  enabled: boolean;
}

export interface DeviceConfig {
  // LoRaWAN
  region: string;
  joinMode: 'OTAA' | 'ABP';
  appEui: string;
  devEui: string;
  confirmed: boolean;
  adr: boolean;
  dataRate: string;
  // BLE
  advInterval: number;
  txPower: number;
  connectable: boolean;
  // Cellular
  apn: string;
  iccid: string;
  networkMode: string;
  roaming: boolean;
  // common
  interval: number;
  intervalUnit: 'minutes' | 'hours';
  sampling: number;
  batteryInterval: string;
  params: TelemetryParam[];
  alerts: AlertRule[];
}

export interface ConfigVersion {
  v: number;
  status: VersionStatus;
  createdBy: string;
  created: string;
  applied?: string;
  scheduledFor?: string;
  note: string;
  config: DeviceConfig;
}

export interface HistoryEvent {
  at: string;
  by: string;
  text: string;
}

export interface Device {
  id: string;
  type: string;
  model: string;
  protocol: Protocol;
  gateway: string;
  firmware: string;
  latestFirmware: string;
  /** Lowest firmware that supports this configuration schema. */
  minFirmware: string;
  /** Sampling below 30 s needs this firmware (null = never supported). */
  fastSamplingFirmware: string | null;
  releaseNotes: string[];
  asset: string;
  status: 'Online' | 'Offline';
  lastSeen: string;
  battery: number;
  rssi: number;
  snr: number | null;
  groups: { name: string; count: number }[];
  versions: ConfigVersion[];
  events: HistoryEvent[];
  firmwareTarget: { version: string; when: string } | null;
}

export const CURRENT_USER = 'Rex Kumar';
export const REGIONS = ['UAE (AS923)', 'KSA (AS923)', 'EU868', 'US915', 'AU915', 'IN865'];
export const DATA_RATES = ['DR0 (SF12 / 125 kHz)', 'DR1 (SF11 / 125 kHz)', 'DR2 (SF10 / 125 kHz)', 'DR3 (SF9 / 125 kHz)', 'DR4 (SF8 / 125 kHz)', 'DR5 (SF7 / 125 kHz)'];
export const AUTO_RATE = 'Auto (Network Optimized)';
export const SAMPLING = [15, 30, 60, 120, 300, 600];
export const BATTERY_INTERVALS = ['Hourly', 'Every 6 hours', 'Daily', 'Weekly'];
export const TX_POWERS = [-20, -16, -12, -8, -4, 0, 4];
export const NETWORK_MODES = ['LTE Cat 1 (2G fallback)', 'LTE only', '2G only'];
export const NOTIFY = ['Email', 'SMS', 'Email + SMS', 'Webhook'];

const p = (key: string, name: string, icon: ParamIcon, kind: 'sensor' | 'diag', unit: string, enabled: boolean, agg: Agg, threshold: number, units: string[] = [unit]): TelemetryParam =>
  ({ key, name, icon, kind, unit, units, enabled, agg, threshold });
const r = (id: string, param: string, cond: Cond, value: number, severity: Severity, notify: string, enabled = true): AlertRule => ({ id, param, cond, value, severity, notify, enabled });

const BASE: DeviceConfig = {
  region: 'UAE (AS923)', joinMode: 'OTAA', appEui: '', devEui: '', confirmed: false, adr: true, dataRate: AUTO_RATE,
  advInterval: 1000, txPower: 0, connectable: false,
  apn: '', iccid: '', networkMode: NETWORK_MODES[0], roaming: false,
  interval: 5, intervalUnit: 'minutes', sampling: 60, batteryInterval: 'Daily', params: [], alerts: [],
};

function cfg(over: Partial<DeviceConfig>): DeviceConfig {
  return JSON.parse(JSON.stringify({ ...BASE, ...over })) as DeviceConfig;
}

const thParams = (humThr: number, tempThr = 0.5): TelemetryParam[] => [
  p('temp', 'Temperature', 'temp', 'sensor', '°C', true, 'Average', tempThr, ['°C', '°F']),
  p('hum', 'Humidity', 'hum', 'sensor', '%RH', true, 'Average', humThr),
  p('battery', 'Battery Level', 'battery', 'diag', '%', true, 'Last', 5),
  p('rssi', 'RSSI', 'rssi', 'diag', 'dBm', true, 'Average', 6),
  p('snr', 'SNR', 'snr', 'diag', 'dB', false, 'Average', 2),
];
const coldAlerts = (hi: number): AlertRule[] => [
  r('AR-1', 'temp', '>', hi, 'Critical', 'Email + SMS'),
  r('AR-2', 'temp', '<', 2, 'Warning', 'Email'),
  r('AR-3', 'hum', '>', 75, 'Warning', 'Email'),
  r('AR-4', 'battery', '<', 20, 'Info', 'Email'),
];

const TS1 = { appEui: '24E124C0002A1B3C', devEui: 'A81758FFFE0123AB' };
const TS2 = { appEui: '24E124C0002A1B3C', devEui: 'A81758FFFE0124F7' };

export const DEVICES: Device[] = [
  {
    id: 'TS-80214', type: 'Temperature Sensor', model: 'Milesight EM300-TH', protocol: 'LoRaWAN', gateway: 'GW-AUH-02', firmware: 'v1.6.2', latestFirmware: 'v1.7.0', minFirmware: 'v1.4.0', fastSamplingFirmware: 'v1.7.0',
    releaseNotes: ['Supports 15 s sampling interval for critical cold-chain monitoring.', 'Improved ADR back-off on congested gateways.', 'Battery estimation accuracy improved by ~8%.', 'Fixes rare humidity spike after rejoin.'],
    asset: 'Cold Room CR-03', status: 'Online', lastSeen: '2026-10-27T11:56', battery: 87, rssi: -96, snr: 7.5,
    groups: [{ name: 'Cold Rooms', count: 12 }, { name: 'Abu Dhabi Sensors', count: 48 }, { name: 'All EM300-TH', count: 124 }],
    versions: [
      { v: 1, status: 'Superseded', createdBy: 'Aisha Rahman', created: '2026-06-02T10:15', applied: '2026-06-02T10:40', note: 'Initial commissioning', config: cfg({ ...TS1, adr: false, dataRate: DATA_RATES[2], interval: 15, sampling: 120, params: thParams(5, 1), alerts: coldAlerts(10).slice(0, 2) }) },
      { v: 2, status: 'Applied', createdBy: 'Rex Kumar', created: '2026-10-17T15:20', applied: '2026-10-18T09:30', note: 'Tighter cold-room thresholds', config: cfg({ ...TS1, interval: 10, sampling: 120, params: thParams(5), alerts: coldAlerts(8) }) },
      { v: 3, status: 'Draft', createdBy: 'Rex Kumar', created: '2026-10-26T16:40', note: 'Faster reporting for audit', config: cfg({ ...TS1, interval: 5, sampling: 60, params: thParams(3), alerts: coldAlerts(8) }) },
    ],
    events: [
      { at: '2026-10-26T16:40', by: 'Rex Kumar', text: 'Draft v3 created' },
      { at: '2026-10-18T09:34', by: 'System', text: 'v2 confirmed by device at check-in' },
      { at: '2026-10-18T09:30', by: 'Rex Kumar', text: 'v2 applied to TS-80214' },
      { at: '2026-06-02T10:40', by: 'Aisha Rahman', text: 'v1 applied at commissioning' },
    ],
    firmwareTarget: null,
  },
  {
    id: 'TS-80221', type: 'Temperature Sensor', model: 'Milesight EM300-TH', protocol: 'LoRaWAN', gateway: 'GW-DXB-02', firmware: 'v1.7.0', latestFirmware: 'v1.7.0', minFirmware: 'v1.4.0', fastSamplingFirmware: 'v1.7.0',
    releaseNotes: ['Supports 15 s sampling interval for critical cold-chain monitoring.', 'Improved ADR back-off on congested gateways.', 'Battery estimation accuracy improved by ~8%.'],
    asset: 'Freezer FZ-02', status: 'Online', lastSeen: '2026-10-27T11:58', battery: 64, rssi: -104, snr: 3.1,
    groups: [{ name: 'Freezers', count: 9 }, { name: 'Dubai Sensors', count: 36 }, { name: 'All EM300-TH', count: 124 }],
    versions: [
      { v: 1, status: 'Superseded', createdBy: 'Aisha Rahman', created: '2026-05-11T09:00', applied: '2026-05-11T09:20', note: 'Initial commissioning', config: cfg({ ...TS2, interval: 15, params: thParams(5, 1), alerts: [r('AR-1', 'temp', '>', -15, 'Critical', 'Email + SMS')] }) },
      { v: 2, status: 'Applied', createdBy: 'Rex Kumar', created: '2026-09-03T13:05', applied: '2026-09-03T13:30', note: 'Freezer alarm bands', config: cfg({ ...TS2, interval: 10, params: thParams(4), alerts: [r('AR-1', 'temp', '>', -15, 'Critical', 'Email + SMS'), r('AR-2', 'temp', '<', -28, 'Warning', 'Email'), r('AR-3', 'battery', '<', 20, 'Info', 'Email')] }) },
    ],
    events: [{ at: '2026-09-03T13:30', by: 'Rex Kumar', text: 'v2 applied to TS-80221' }, { at: '2026-05-11T09:20', by: 'Aisha Rahman', text: 'v1 applied at commissioning' }],
    firmwareTarget: null,
  },
  {
    id: 'VS-30018', type: 'Vibration Sensor V2', model: 'Vibration Sensor V2', protocol: 'LoRaWAN', gateway: 'GW-DXB-02', firmware: 'v2.8.1', latestFirmware: 'v2.9.0', minFirmware: 'v2.5.0', fastSamplingFirmware: 'v2.6.0',
    releaseNotes: ['FFT peak detection for bearing wear.', 'Lower idle current in deep sleep.', 'Fixes surface temperature offset above 70 °C.'],
    asset: 'Pump PMP-118', status: 'Offline', lastSeen: '2026-10-26T22:14', battery: 41, rssi: -113, snr: -2.4,
    groups: [{ name: 'Pump Station Sensors', count: 18 }, { name: 'All Vibration V2', count: 57 }],
    versions: [
      { v: 1, status: 'Applied', createdBy: 'Omar Haddad', created: '2026-08-21T08:30', applied: '2026-08-21T08:45', note: 'Commissioning', config: cfg({ appEui: '70B3D57ED0041A20', devEui: '70B3D57ED005C318', interval: 10, sampling: 30, params: [
        p('vib', 'Vibration Velocity', 'vib', 'sensor', 'mm/s', true, 'Max', 0.5), p('accel', 'Acceleration', 'accel', 'sensor', 'g', true, 'Max', 0.1), p('temp', 'Surface Temperature', 'temp', 'sensor', '°C', true, 'Average', 1, ['°C', '°F']),
        p('battery', 'Battery Level', 'battery', 'diag', '%', true, 'Last', 5), p('rssi', 'RSSI', 'rssi', 'diag', 'dBm', true, 'Average', 6), p('snr', 'SNR', 'snr', 'diag', 'dB', true, 'Average', 2)],
        alerts: [r('AR-1', 'vib', '>', 7.1, 'Critical', 'Email + SMS'), r('AR-2', 'vib', '>', 4.5, 'Warning', 'Email'), r('AR-3', 'temp', '>', 80, 'Warning', 'Email')] }) },
    ],
    events: [{ at: '2026-10-26T22:14', by: 'System', text: 'Device went offline (last uplink from GW-DXB-02)' }, { at: '2026-08-21T08:45', by: 'Omar Haddad', text: 'v1 applied at commissioning' }],
    firmwareTarget: null,
  },
  {
    id: 'BLE-20951', type: 'BLE Beacon', model: 'Minew E8', protocol: 'BLE 5.0', gateway: 'GW-DXB-04', firmware: 'v2.3.0', latestFirmware: 'v2.4.1', minFirmware: 'v2.4.0', fastSamplingFirmware: 'v2.4.0',
    releaseNotes: ['Configuration profile schema v4 (required for this page).', 'Motion-triggered advertising burst.', 'Fixes TX power reset after battery swap.'],
    asset: 'Forklift FL-008', status: 'Online', lastSeen: '2026-10-27T11:59', battery: 72, rssi: -71, snr: null,
    groups: [{ name: 'Forklifts', count: 22 }, { name: 'All Minew E8', count: 140 }],
    versions: [
      { v: 1, status: 'Applied', createdBy: 'Omar Haddad', created: '2026-07-14T11:00', applied: '2026-07-14T11:05', note: 'Fleet default', config: cfg({ advInterval: 1000, txPower: 0, interval: 1, params: [
        p('temp', 'Temperature', 'temp', 'sensor', '°C', true, 'Average', 1, ['°C', '°F']), p('accel', 'Motion', 'accel', 'sensor', 'g', true, 'Max', 0.2),
        p('battery', 'Battery Level', 'battery', 'diag', '%', true, 'Last', 5), p('rssi', 'RSSI', 'rssi', 'diag', 'dBm', true, 'Average', 8)],
        alerts: [r('AR-1', 'accel', '>', 2.5, 'Warning', 'Email'), r('AR-2', 'battery', '<', 15, 'Info', 'Email')] }) },
    ],
    events: [{ at: '2026-07-14T11:05', by: 'Omar Haddad', text: 'v1 applied' }],
    firmwareTarget: null,
  },
  {
    id: 'GPS-10482', type: 'GPS Tracker', model: 'Teltonika FMC920', protocol: 'Cellular', gateway: 'du LTE', firmware: 'v03.28.07', latestFirmware: 'v03.28.07', minFirmware: 'v03.27.00', fastSamplingFirmware: 'v03.27.00',
    releaseNotes: ['Current release. Improved GNSS cold-start time.', 'Ignition detection via voltage hysteresis.'],
    asset: 'Generator GEN-042', status: 'Online', lastSeen: '2026-10-27T11:57', battery: 95, rssi: -79, snr: null,
    groups: [{ name: 'Generators', count: 31 }, { name: 'All FMC920', count: 210 }],
    versions: [
      { v: 1, status: 'Superseded', createdBy: 'Aisha Rahman', created: '2026-03-09T10:00', applied: '2026-03-09T10:10', note: 'Commissioning', config: cfg({ apn: 'iot.du.ae', iccid: '8997103000012345678', interval: 2, sampling: 60, params: [] }) },
      { v: 2, status: 'Applied', createdBy: 'Rex Kumar', created: '2026-09-22T14:10', applied: '2026-09-22T14:15', note: 'Idle reporting tuned', config: cfg({ apn: 'iot.du.ae', iccid: '8997103000012345678', interval: 1, sampling: 30, params: [
        p('speed', 'Speed', 'speed', 'sensor', 'km/h', true, 'Max', 5, ['km/h', 'mph']), p('volt', 'External Voltage', 'volt', 'sensor', 'V', true, 'Average', 0.3),
        p('ign', 'Ignition', 'ign', 'diag', 'state', true, 'Last', 1), p('battery', 'Battery Level', 'battery', 'diag', '%', true, 'Last', 5), p('rssi', 'GSM Signal', 'rssi', 'diag', 'dBm', true, 'Average', 6)],
        alerts: [r('AR-1', 'volt', '<', 11.8, 'Warning', 'Email'), r('AR-2', 'speed', '>', 30, 'Critical', 'Email + SMS')] }) },
    ],
    events: [{ at: '2026-09-22T14:15', by: 'Rex Kumar', text: 'v2 applied to GPS-10482' }, { at: '2026-03-09T10:10', by: 'Aisha Rahman', text: 'v1 applied at commissioning' }],
    firmwareTarget: null,
  },
];
// GPS v1 used the v2 parameter set as well (kept short above).
DEVICES[4].versions[0].config.params = JSON.parse(JSON.stringify(DEVICES[4].versions[1].config.params));

/** Deterministic pseudo-random generator. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const BASELINES: Record<string, { base: number; amp: number; noise: number }> = {
  temp: { base: 6.4, amp: 0.9, noise: 0.35 },
  hum: { base: 65, amp: 3.5, noise: 1.6 },
  vib: { base: 3.2, amp: 0.8, noise: 0.5 },
  accel: { base: 0.6, amp: 0.25, noise: 0.15 },
  speed: { base: 2, amp: 2, noise: 3 },
  volt: { base: 12.6, amp: 0.3, noise: 0.1 },
};

/** 49 half-hourly points covering the last 24 h, in the parameter's base unit. */
export function series(deviceId: string, key: string): number[] {
  const seed = [...(deviceId + key)].reduce((t, c) => t + c.charCodeAt(0), 0);
  const rand = rng(seed);
  let b = BASELINES[key] ?? { base: 10, amp: 2, noise: 1 };
  if (deviceId === 'TS-80221' && key === 'temp') b = { base: -21, amp: 1.2, noise: 0.5 };
  if (deviceId === 'TS-80221' && key === 'hum') b = { base: 48, amp: 4, noise: 2 };
  if (deviceId === 'VS-30018' && key === 'temp') b = { base: 54, amp: 4, noise: 1.2 };
  if (deviceId === 'BLE-20951' && key === 'temp') b = { base: 31, amp: 3, noise: 0.8 };
  const out: number[] = [];
  for (let i = 0; i < 49; i++) {
    // door-opening style bumps around 16:00 and 08:00 for cold rooms
    const bump = key === 'temp' && deviceId === 'TS-80214' && (i === 8 || i === 9 || i === 40) ? 1.1 : 0;
    const v = b.base + Math.sin((i / 48) * Math.PI * 2 + 0.6) * b.amp + (rand() - 0.5) * b.noise * 2 + bump;
    out.push(key === 'speed' ? Math.max(0, v) : v);
  }
  return out;
}
