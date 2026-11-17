/**
 * DEMO MODE: Tracking & Telemetry data. Map geometry (buildings, geofences, gateways, asset positions, the forklift's
 * patrol route) lives in campus.geo.json; this file holds the tracked assets, their linked devices, thresholds, seeded
 * telemetry history and recent events. Series are generated from fixed seeds so the page looks the same on every load.
 */
import CAMPUS from './campus.geo.json';

export type Status = 'online' | 'warning' | 'offline';
export type MarkerIcon = 'forklift' | 'pump' | 'cold' | 'generator' | 'sensor';
export type Metric = 'temp' | 'vib' | 'battery';
export type Severity = 'Info' | 'Warning' | 'Critical';
export type Range = '1h' | '24h' | '7d';

export interface CampusFeature {
  type: 'Feature';
  properties: { kind: string; id: string; name?: string; [k: string]: unknown };
  geometry: { type: 'Point' | 'LineString' | 'Polygon'; coordinates: unknown };
}

export interface AlertItem { id: string; title: string; detail: string; severity: Severity; minsAgo: number; acknowledged: boolean }
export interface HistoryItem { minsAgo: number; text: string; by: string }

export interface TrackedAsset {
  id: string;
  name: string;
  type: string;
  icon: MarkerIcon;
  kind: 'asset' | 'device';
  status: Status;
  health: 'Healthy' | 'Attention' | 'Critical';
  building: string;
  device: { id: string; type: string; model: string; firmware: string; protocol: string; gateway: string; serial: string; installed: string };
  /** Latest live values (null when the device sends nothing). */
  live: { temp: number | null; vib: number | null; battery: number | null; rssi: number | null };
  thresholds: { temp: number; vib: number; battery: number };
  alerts: AlertItem[];
  history: HistoryItem[];
  /** Minutes since the last payload for offline devices. */
  silentMins?: number;
}

export interface TelemetryEvent {
  /** Seconds before "now". */
  secsAgo: number;
  assetId: string;
  deviceId: string;
  icon: 'pin' | 'warn' | 'temp' | 'battery';
  event: string;
  reading: string;
  severity: Severity;
  configurable: boolean;
}

export const CAMPUS_GEO = CAMPUS as unknown as { type: 'FeatureCollection'; name: string; features: CampusFeature[] };
export const CAMPUS_NAME = 'Riverside Industrial Campus';
export const SITE_OPTIONS = [CAMPUS_NAME];

export const BUILDINGS: { id: string; name: string }[] = CAMPUS_GEO.features
  .filter((f) => f.properties.kind === 'building')
  .map((f) => ({ id: f.properties.id, name: String(f.properties.name) }));

export function buildingName(id: string): string {
  return BUILDINGS.find((b) => b.id === id)?.name ?? id;
}

export const ASSETS: TrackedAsset[] = [
  {
    id: 'FL-008', name: 'Forklift FL-008', type: 'Forklift', icon: 'forklift', kind: 'asset', status: 'online', health: 'Healthy', building: 'WH-B',
    device: { id: 'BL-20951', type: 'BLE Beacon', model: 'Minew E8', firmware: 'v2.1.0', protocol: 'BLE 5.0', gateway: 'GW-01', serial: 'E8-20951-AC233F', installed: '09 Apr 2025' },
    live: { temp: 24.6, vib: 1.8, battery: 82, rssi: -61 }, thresholds: { temp: 35, vib: 7.1, battery: 20 },
    alerts: [{ id: 'AL-5521', title: 'High temperature', detail: '35.8 °C at 02:14 (threshold 35 °C)', severity: 'Warning', minsAgo: 738, acknowledged: false }],
    history: [
      { minsAgo: 0.5, text: 'Entered geofence Warehouse Zone B', by: 'System' },
      { minsAgo: 738, text: 'High temperature alert raised (35.8 °C)', by: 'Rule: High temperature' },
      { minsAgo: 1980, text: 'Battery replaced on BL-20951 (100%)', by: 'Sarah Ahmed' },
      { minsAgo: 8700, text: 'Firmware updated v2.0.4 → v2.1.0', by: 'OTA service' },
    ],
  },
  {
    id: 'PMP-118', name: 'Pump PMP-118', type: 'Centrifugal Pump', icon: 'pump', kind: 'asset', status: 'warning', health: 'Attention', building: 'MFG',
    device: { id: 'IOT-77521', type: 'Vibration Sensor', model: 'VibeSense VS3', firmware: 'v3.0.4', protocol: 'LoRaWAN', gateway: 'GW-02', serial: 'VS3-77521-0091', installed: '27 Nov 2025' },
    live: { temp: 41.2, vib: 6.4, battery: 64, rssi: -72 }, thresholds: { temp: 55, vib: 5.0, battery: 20 },
    alerts: [{ id: 'AL-5530', title: 'Vibration threshold exceeded', detail: '6.4 mm/s (threshold 5.0 mm/s)', severity: 'Critical', minsAgo: 74, acknowledged: false }],
    history: [
      { minsAgo: 74, text: 'Vibration threshold exceeded (6.4 mm/s)', by: 'Rule: Vibration > 5.0' },
      { minsAgo: 2880, text: 'Bearing inspection completed', by: 'Field Services LLC' },
      { minsAgo: 12960, text: 'Sensor channel re-mapped to Motor DE', by: 'Michael Tan' },
    ],
  },
  {
    id: 'CR-03', name: 'Cold Room CR-03', type: 'Cold Room', icon: 'cold', kind: 'asset', status: 'online', health: 'Healthy', building: 'WH-A',
    device: { id: 'TH-99872', type: 'Temperature & Humidity', model: 'Milesight EM300-TH', firmware: 'v1.3.2', protocol: 'LoRaWAN', gateway: 'GW-03', serial: 'EM300-99872-61', installed: '10 Sep 2025' },
    live: { temp: 4.2, vib: 0.3, battery: 91, rssi: -66 }, thresholds: { temp: 8, vib: 2, battery: 20 },
    alerts: [],
    history: [
      { minsAgo: 105, text: 'Temperature reading 4.2 °C', by: 'TH-99872' },
      { minsAgo: 4320, text: 'Door-open alert cleared after 3 min', by: 'System' },
    ],
  },
  {
    id: 'GEN-042', name: 'Generator GEN-042', type: 'Diesel Generator', icon: 'generator', kind: 'asset', status: 'offline', health: 'Critical', building: 'FUEL',
    device: { id: 'IOT-44109', type: 'Multi-sensor Node', model: 'Teltonika FMC130', firmware: 'v03.27', protocol: 'LTE Cat-M1', gateway: 'Cellular (du)', serial: 'FMC130-44109', installed: '08 Feb 2022' },
    live: { temp: null, vib: null, battery: null, rssi: null }, thresholds: { temp: 90, vib: 9, battery: 20 }, silentMins: 250,
    alerts: [{ id: 'AL-5502', title: 'Device offline', detail: 'No uplink from IOT-44109 for 4 hours', severity: 'Critical', minsAgo: 250, acknowledged: false }],
    history: [
      { minsAgo: 250, text: 'Device went offline: no uplink from IOT-44109', by: 'System' },
      { minsAgo: 250, text: 'Location updated: Fuel & Generators (x: 284, y: 118)', by: 'IOT-44109' },
      { minsAgo: 20160, text: 'Load test completed (85% for 2 h)', by: 'Ahmed Rashid' },
    ],
  },
  {
    id: 'TS-80214', name: 'Sensor TS-80214', type: 'Temperature Sensor', icon: 'sensor', kind: 'device', status: 'online', health: 'Attention', building: 'ADM',
    device: { id: 'TS-80214', type: 'Temperature Sensor', model: 'Milesight EM300-TH', firmware: 'v1.4.2', protocol: 'LoRaWAN', gateway: 'GW-01', serial: 'TS300-80214-7765', installed: '12 Nov 2025' },
    live: { temp: 22.8, vib: 0.1, battery: 18, rssi: -78 }, thresholds: { temp: 30, vib: 2, battery: 20 },
    alerts: [{ id: 'AL-5490', title: 'Low battery', detail: 'Battery 18% (threshold 20%)', severity: 'Warning', minsAgo: 381, acknowledged: false }],
    history: [
      { minsAgo: 381, text: 'Low battery warning (18%)', by: 'Rule: Battery < 20%' },
      { minsAgo: 52560, text: 'Calibrated (±0.3 °C)', by: 'TempSense Lab' },
    ],
  },
];

export const EVENTS: TelemetryEvent[] = [
  { secsAgo: 20, assetId: 'FL-008', deviceId: 'BL-20951', icon: 'pin', event: 'Entered geofence', reading: 'Warehouse Zone B', severity: 'Info', configurable: false },
  { secsAgo: 4436, assetId: 'PMP-118', deviceId: 'IOT-77521', icon: 'warn', event: 'Vibration threshold exceeded', reading: '6.4 mm/s (threshold 5.0)', severity: 'Critical', configurable: true },
  { secsAgo: 6308, assetId: 'CR-03', deviceId: 'TH-99872', icon: 'temp', event: 'Temperature reading', reading: '4.2 °C', severity: 'Info', configurable: false },
  { secsAgo: 15004, assetId: 'GEN-042', deviceId: 'IOT-44109', icon: 'pin', event: 'Location updated', reading: 'Fuel & Generators (x: 284, y: 118)', severity: 'Info', configurable: false },
  { secsAgo: 22872, assetId: 'TS-80214', deviceId: 'TS-80214', icon: 'battery', event: 'Low battery warning', reading: 'Battery 18% (threshold 20%)', severity: 'Warning', configurable: true },
];

export const KPIS = [
  { key: 'tracked', label: 'Tracked Assets', value: '486', note: '', delta: '6%', up: true, good: true, color: '#22c55e' },
  { key: 'online', label: 'Devices Online', value: '442', note: '91% of 486', delta: '3%', up: true, good: true, color: '#22c55e' },
  { key: 'alerts', label: 'Active Alerts', value: '18', note: '', delta: '2', up: true, good: false, color: '#ef4444' },
  { key: 'points', label: 'Telemetry Points', value: '12.8M', note: '', delta: '12%', up: true, good: true, color: '#6366f1' },
] as const;

// ===== seeded series =====

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Smooth random walk around `base` with amplitude `amp`, clamped to [lo, hi]. */
export function walk(seed: string, n: number, base: number, amp: number, lo: number, hi: number): number[] {
  const rng = mulberry32(hash(seed));
  const out: number[] = [];
  let v = base;
  let drift = 0;
  for (let i = 0; i < n; i++) {
    drift = drift * 0.82 + (rng() - 0.5) * amp * 0.5;
    v = v + drift + (base - v) * 0.08;
    out.push(Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10);
  }
  return out;
}

export const RANGE_SPEC: Record<Range, { label: string; mins: number; step: number }> = {
  '1h': { label: 'Last 1 hour', mins: 60, step: 1 },
  '24h': { label: 'Last 24 hours', mins: 1440, step: 15 },
  '7d': { label: 'Last 7 days', mins: 10080, step: 120 },
};

const BASE: Record<string, { temp: number; vib: number; battery: number }> = {
  'FL-008': { temp: 23.8, vib: 1.8, battery: 84 },
  'PMP-118': { temp: 40.5, vib: 5.2, battery: 66 },
  'CR-03': { temp: 4.1, vib: 0.3, battery: 92 },
  'GEN-042': { temp: 52, vib: 3.1, battery: 40 },
  'TS-80214': { temp: 22.6, vib: 0.1, battery: 21 },
};

export interface Series { metric: Metric; mins: number[]; values: (number | null)[] }

/**
 * History for one metric over a range, oldest first. `mins` are minutes before now. The forklift's temperature has a
 * real spike at the most recent 02:14 (the alert shown on the chart); offline devices have no data after they went silent.
 */
export function seriesFor(asset: TrackedAsset, metric: Metric, range: Range, now: Date): Series {
  const spec = RANGE_SPEC[range];
  const n = Math.floor(spec.mins / spec.step) + 1;
  const mins = Array.from({ length: n }, (_, i) => spec.mins - i * spec.step);
  const b = BASE[asset.id];
  const amp = metric === 'temp' ? Math.max(0.6, b.temp * 0.05) : metric === 'vib' ? Math.max(0.08, b.vib * 0.12) : 1.2;
  const lo = metric === 'battery' ? 0 : 0;
  const hi = metric === 'battery' ? 100 : 200;
  let values: (number | null)[] = walk(`${asset.id}|${metric}|${range}`, n, b[metric], amp, lo, hi);
  if (metric === 'battery') {
    // batteries drain slowly towards the current level
    const end = asset.live.battery ?? b.battery;
    values = (values as number[]).map((v, i) => Math.round(Math.min(100, end + (n - 1 - i) * (spec.mins / 1440) * 0.15 + (v - b.battery) * 0.2) * 10) / 10);
  }
  if (asset.id === 'FL-008' && metric === 'temp' && range !== '1h') {
    const spike = spikeMinsAgo(now);
    const i = mins.reduce((best, m, k) => (Math.abs(m - spike) < Math.abs(mins[best] - spike) ? k : best), 0);
    mins[i] = spike;
    values[i] = 35.8;
    if (i > 0 && values[i - 1] !== null) values[i - 1] = Math.round(((values[i - 1] as number) + 6) * 10) / 10;
    if (i < n - 1 && values[i + 1] !== null) values[i + 1] = Math.round(((values[i + 1] as number) + 3) * 10) / 10;
  }
  if (asset.silentMins) values = values.map((v, k) => (mins[k] < asset.silentMins! ? null : v));
  // the last point is the live value
  const live = asset.live[metric];
  if (live !== null && values.length) values[values.length - 1] = live;
  return { metric, mins, values };
}

/** Minutes since the most recent 02:14 (the forklift's temperature alert). */
export function spikeMinsAgo(now: Date): number {
  const t = new Date(now);
  t.setHours(2, 14, 0, 0);
  if (t.getTime() > now.getTime()) t.setDate(t.getDate() - 1);
  return Math.floor((now.getTime() - t.getTime()) / 60000);
}

/** Short history for the live tiles' sparklines. */
export function sparkSeed(id: string, metric: 'temp' | 'vib' | 'battery' | 'rssi', current: number, n = 24): number[] {
  const amp = metric === 'temp' ? Math.max(0.4, Math.abs(current) * 0.03) : metric === 'vib' ? Math.max(0.1, current * 0.15) : metric === 'rssi' ? 2.5 : 0.6;
  const v = walk(`${id}|spark|${metric}`, n, current, amp, -200, 200);
  v[n - 1] = current;
  return v;
}

/** Seeded sparkline for a KPI card. */
export function kpiSpark(key: string, rising: boolean): number[] {
  const v = walk(`kpi|${key}`, 26, 50, 8, 0, 100);
  return v.map((x, i) => x + (rising ? i * 0.9 : 0));
}
