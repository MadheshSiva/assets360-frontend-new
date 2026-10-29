import { RA_MONTH_LABELS, RA_PERIODS, assetId } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';

// DEMO MODE: 1,086 IoT-connected assets generated deterministically. Every KPI, chart, map pin and table
// on the IoT / Utilization page is aggregated from this list, so filters change all of them consistently.

export type Connectivity = 'Online' | 'Intermittent' | 'Offline' | 'Never Connected';
export type SensorHealth = 'Healthy' | 'Warning' | 'Failed';
export type AlertSeverity = 'Critical' | 'Warning';

export interface IotSite {
  name: string;
  code: string;
  org: string;
  lat: number;
  lng: number;
  /** Connected assets at the site */
  count: number;
}

export interface IotAsset {
  id: string;
  name: string;
  category: string;
  site: string;
  org: string;
  deviceType: string;
  deviceId: string;
  status: Connectivity;
  health: SensorHealth;
  /** Utilization % for the reporting period (null: never reported) */
  utilization: number | null;
  target: number;
  /** Telemetry availability % (null: never reported) */
  availability: number | null;
  /** Average signal strength in dBm */
  signal: number | null;
  /** Minutes since the last telemetry message */
  lastSeenMin: number | null;
}

export interface IotAlert {
  id: string;
  asset: IotAsset;
  type: string;
  severity: AlertSeverity;
  reading: string;
  raisedMin: number;
}

/** Sites with IoT coverage. Counts add up to RA_METRICS.iot.connectedAssets (1,086). */
export const IOT_SITES: IotSite[] = [
  { name: 'Dubai HQ', code: 'DXB', org: 'Purple IQ UAE', lat: 25.2048, lng: 55.2708, count: 312 },
  { name: 'Abu Dhabi Office', code: 'AUH', org: 'Purple IQ UAE', lat: 24.4539, lng: 54.3773, count: 196 },
  { name: 'Sharjah Facility', code: 'SHJ', org: 'Purple IQ UAE', lat: 25.3463, lng: 55.4209, count: 152 },
  { name: 'Jebel Ali Warehouse', code: 'JAW', org: 'Purple IQ UAE', lat: 25.0117, lng: 55.0613, count: 141 },
  { name: 'Al Ain Depot', code: 'AAN', org: 'Purple IQ UAE', lat: 24.2075, lng: 55.7447, count: 78 },
  { name: 'Riyadh Office', code: 'RUH', org: 'Purple IQ KSA', lat: 24.7136, lng: 46.6753, count: 117 },
  { name: 'London Office', code: 'LON', org: 'Purple IQ Group', lat: 51.5072, lng: -0.1276, count: 44 },
  { name: 'Singapore Office', code: 'SIN', org: 'Purple IQ Group', lat: 1.3521, lng: 103.8198, count: 46 }
];

export const DEVICE_TYPES = ['Asset Tags', 'Telematics', 'Environment Sensors', 'Power Meters', 'Vibration Sensors', 'CCTV Cameras'];
export const CONNECTIVITY: Connectivity[] = ['Online', 'Intermittent', 'Offline', 'Never Connected'];

/** Device mix per category: [device type, assets]. Category totals and device totals both add up to 1,086. */
const CATEGORY_DEVICE_MIX: [string, [string, number][]][] = [
  ['Vehicles', [['Telematics', 200], ['Asset Tags', 38]]],
  ['Machinery', [['Telematics', 48], ['Vibration Sensors', 100], ['Power Meters', 30], ['Asset Tags', 36]]],
  ['Facilities', [['Environment Sensors', 96], ['CCTV Cameras', 80]]],
  ['IT Equipment', [['Asset Tags', 89], ['Power Meters', 55], ['CCTV Cameras', 18]]],
  ['HVAC', [['Environment Sensors', 100], ['Vibration Sensors', 28]]],
  ['Power & Electrical', [['Vibration Sensors', 17], ['Power Meters', 87]]],
  ['Safety & PPE', [['Asset Tags', 64]]]
];

const STATUS_COUNTS: [Connectivity, number][] = [['Online', 739], ['Intermittent', 107], ['Offline', 163], ['Never Connected', 77]];
const HEALTH_COUNTS: [SensorHealth, number][] = [['Healthy', 892], ['Warning', 144], ['Failed', 50]];

/** Typical utilization per category and the target it is measured against. */
const CATEGORY_PROFILE: Record<string, { mean: number; target: number }> = {
  Vehicles: { mean: 84, target: 75 },
  Machinery: { mean: 80, target: 70 },
  Facilities: { mean: 72, target: 60 },
  'IT Equipment': { mean: 66, target: 55 },
  HVAC: { mean: 87, target: 75 },
  'Power & Electrical': { mean: 85, target: 75 },
  'Safety & PPE': { mean: 74, target: 65 }
};

const NAME_POOL: Record<string, [string, string][]> = {
  Vehicles: [['Delivery Truck', 'DT'], ['Forklift', 'FL'], ['Pickup Truck', 'PU'], ['Service Van', 'SV'], ['Reach Stacker', 'RS']],
  Machinery: [['Excavator', 'EX'], ['Generator', 'GEN'], ['Air Compressor', 'AC'], ['Conveyor', 'CV'], ['CNC Machine', 'CNC']],
  Facilities: [['Cold Room', 'CR'], ['Pump Room', 'PR'], ['Fire Panel', 'FP'], ['Passenger Lift', 'LF'], ['Lighting Panel', 'LP']],
  'IT Equipment': [['Server Rack', 'SR'], ['Network Switch', 'NS'], ['UPS Unit', 'UPS'], ['Laptop Cart', 'LC']],
  HVAC: [['HVAC Unit', 'HV'], ['Chiller', 'CH'], ['Air Handling Unit', 'AHU'], ['Cooling Tower', 'CT']],
  'Power & Electrical': [['Transformer', 'TR'], ['Switchgear', 'SG'], ['Main Distribution Board', 'MDB'], ['Solar Inverter', 'SI']],
  'Safety & PPE': [['Gas Detector', 'GD'], ['SCBA Set', 'SC'], ['Fall Arrest Kit', 'FA'], ['Fire Extinguisher', 'FE']]
};

const DEVICE_PREFIX: Record<string, string> = {
  'Asset Tags': 'TAG', Telematics: 'TEL', 'Environment Sensors': 'ENV', 'Power Meters': 'PWR', 'Vibration Sensors': 'VIB', 'CCTV Cameras': 'CAM'
};

const SIGNAL_BASE: Record<string, number> = {
  'Asset Tags': -71, Telematics: -68, 'Environment Sensors': -72, 'Power Meters': -74, 'Vibration Sensors': -69, 'CCTV Cameras': -67
};

/** "Now" for the demo data: 28 Oct 2026 10:30 (GMT+4). */
const NOW = Date.UTC(2026, 9, 28, 10, 30);
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Small deterministic generator (LCG). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(list: T[], r: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function expand<T>(pairs: [T, number][]): T[] {
  const out: T[] = [];
  pairs.forEach(([v, n]) => {
    for (let i = 0; i < n; i++) out.push(v);
  });
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Shifts the values so their mean is exactly `mean`, then clamps and rounds. */
function centre(values: (number | null)[], mean: number, min: number, max: number): (number | null)[] {
  const real = values.filter((v): v is number => v !== null);
  const shift = mean - real.reduce((a, b) => a + b, 0) / real.length;
  return values.map((v) => (v === null ? null : round1(Math.min(max, Math.max(min, v + shift)))));
}

function buildAssets(): IotAsset[] {
  const r = seeded(1086);
  const pairs: [string, string][] = [];
  CATEGORY_DEVICE_MIX.forEach(([cat, types]) => types.forEach(([type, n]) => {
    for (let i = 0; i < n; i++) pairs.push([cat, type]);
  }));
  const sites = shuffle(expand(IOT_SITES.map((s): [IotSite, number] => [s, s.count])), r);
  const statuses = shuffle(expand(STATUS_COUNTS), r);
  const health = shuffle(expand(HEALTH_COUNTS), r);
  const siteSeq: Record<string, number> = {};
  const nameSeq: Record<string, number> = {};

  const rawUtil: (number | null)[] = [];
  const rawAvail: (number | null)[] = [];
  const assets = pairs.map(([category, deviceType], i) => {
    const site = sites[i];
    const status = statuses[i];
    const profile = CATEGORY_PROFILE[category];
    siteSeq[site.code] = (siteSeq[site.code] ?? 180) + 1 + Math.floor(r() * 3);
    const pool = NAME_POOL[category];
    const [label, code] = pool[i % pool.length];
    nameSeq[code] = (nameSeq[code] ?? 0) + 1;

    const never = status === 'Never Connected';
    let util = profile.mean + (r() - 0.5) * 24;
    if (r() < 0.03) util -= 25 + r() * 15; // idle outliers (parked, decommissioning, waiting for parts)
    rawUtil.push(never ? null : util);
    const avail = status === 'Online' ? 99.4 + (r() - 0.5) : status === 'Intermittent' ? 94 + (r() - 0.5) * 4 : 96 + (r() - 0.5) * 4;
    rawAvail.push(never ? null : avail);

    let lastSeenMin: number | null = null;
    if (status === 'Online') lastSeenMin = Math.floor(r() * 15);
    else if (status === 'Intermittent') lastSeenMin = 20 + Math.floor(r() * 220);
    else if (status === 'Offline') lastSeenMin = r() < 0.05 ? (25 + Math.floor(r() * 48)) * 60 : (1 + Math.floor(r() * 22)) * 60 + Math.floor(r() * 60);

    return {
      id: assetId(site.code, siteSeq[site.code]),
      name: `${label} ${code}-${String(nameSeq[code]).padStart(2, '0')}`,
      category,
      site: site.name,
      org: site.org,
      deviceType,
      deviceId: `${DEVICE_PREFIX[deviceType]}-${String(10240 + i * 7).padStart(6, '0')}`,
      status,
      health: health[i],
      utilization: null,
      target: profile.target,
      availability: null,
      signal: never ? null : Math.round(SIGNAL_BASE[deviceType] + (r() - 0.5) * 8),
      lastSeenMin
    } as IotAsset;
  });

  const util = centre(rawUtil, RA_METRICS.iot.avgUtilization, 3, 99.5);
  const avail = centre(rawAvail, RA_METRICS.iot.telemetryAvailability, 80, 100);
  assets.forEach((a, i) => {
    a.utilization = util[i];
    a.availability = avail[i];
  });
  return assets;
}

const ALERT_TYPES: [string, AlertSeverity, string][] = [
  ['High temperature', 'Critical', '68 °C (limit 55 °C)'],
  ['Connectivity loss', 'Warning', 'No heartbeat for 42 min'],
  ['Power spike', 'Warning', '412 V (limit 400 V)'],
  ['Low battery', 'Warning', 'Battery 9%'],
  ['Geofence breach', 'Critical', 'Left assigned zone'],
  ['High humidity', 'Warning', '78% RH (limit 65%)']
];

/** 37 active alerts on 26 assets; 14 of them are abnormal-vibration alerts on 8 vibration-monitored assets. */
function buildAlerts(assets: IotAsset[]): IotAlert[] {
  const r = seeded(37);
  const reporting = assets.filter((a) => a.status === 'Online' || a.status === 'Intermittent');
  const vib = shuffle(reporting.filter((a) => a.deviceType === 'Vibration Sensors'), r).slice(0, 8);
  const others = shuffle(reporting.filter((a) => a.deviceType !== 'Vibration Sensors'), r).slice(0, 18);
  const alerts: IotAlert[] = [];
  let seq = 4120;
  const add = (asset: IotAsset, type: string, severity: AlertSeverity, reading: string) =>
    alerts.push({ id: `ALR-2026-${String(seq++).padStart(6, '0')}`, asset, type, severity, reading, raisedMin: 5 + Math.floor(r() * 900) });
  vib.forEach((a, i) => {
    add(a, 'Abnormal vibration', 'Critical', `${(9 + r() * 4).toFixed(1)} mm/s (limit 7.1 mm/s)`);
    if (i < 6) add(a, 'Abnormal vibration', 'Warning', `${(7.2 + r() * 1.5).toFixed(1)} mm/s (limit 7.1 mm/s)`);
  });
  others.forEach((a, i) => {
    const [type, severity, reading] = ALERT_TYPES[i % ALERT_TYPES.length];
    add(a, type, severity, reading);
    if (i < 5) {
      const [t2, s2, r2] = ALERT_TYPES[(i + 3) % ALERT_TYPES.length];
      add(a, t2, s2, r2);
    }
  });
  return alerts.sort((a, b) => a.raisedMin - b.raisedMin);
}

export const IOT_ASSETS: IotAsset[] = buildAssets();
export const IOT_ALERTS: IotAlert[] = buildAlerts(IOT_ASSETS);

// ===== Period handling =====

export interface PeriodWindow {
  labels: string[];
  /** Index into the 12-month timeline (Nov 2025 – Oct 2026) for each label */
  months: number[];
  weekly: boolean;
}

const TIMELINE_LABELS = ['Nov\n2025', 'Dec\n2025', ...RA_MONTH_LABELS];

export function periodWindow(period: string): PeriodWindow {
  switch (RA_PERIODS.indexOf(period)) {
    case 1:
    case 3:
      return { labels: ['Week 1\nOct', 'Week 2\nOct', 'Week 3\nOct', 'Week 4\nOct'], months: [11, 11, 11, 11], weekly: true };
    case 2:
      return { labels: TIMELINE_LABELS.slice(8, 11), months: [8, 9, 10], weekly: false };
    case 4:
      return { labels: TIMELINE_LABELS, months: TIMELINE_LABELS.map((_, i) => i), weekly: false };
    default:
      return { labels: TIMELINE_LABELS.slice(2), months: RA_MONTH_LABELS.map((_, i) => i + 2), weekly: false };
  }
}

/** Utilization / availability for the selected period relative to the year-to-date figures. */
export const PERIOD_UTIL_OFFSET = [0, 1.2, -0.8, 1.0, -1.6];
export const PERIOD_AVAIL_OFFSET = [0, 0.3, -0.2, 0.3, -0.4];

/** KPI change vs the previous period of the same length: connected, utilization, availability, alerts. */
export const PERIOD_DELTAS: [number, number, number, number][] = [
  [9.4, 5.8, 1.6, -14],
  [1.2, 1.6, 0.4, -6],
  [3.1, 2.4, 0.7, -9],
  [1.4, 1.9, 0.5, -5],
  [11.2, 6.7, 2.1, -18]
];

/** Live telemetry jitter applied on each auto refresh; each sequence sums to zero so values stay near the base. */
export const LIVE_UTIL_STEPS = [0.2, -0.1, 0.3, -0.2, 0.1, -0.3, 0.2, -0.2];
export const LIVE_AVAIL_STEPS = [0.1, -0.1, 0.05, 0.05, -0.1, 0.1, -0.05, -0.05];

/** Stable 0..1 number for a string (used to vary trend shapes per filter selection). */
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function telemetryTime(minutesAgo: number | null): string {
  if (minutesAgo === null) return 'Never';
  const d = new Date(NOW - minutesAgo * 60000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm}`;
}

export function agoText(minutes: number | null): string {
  if (minutes === null) return 'Never reported';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
