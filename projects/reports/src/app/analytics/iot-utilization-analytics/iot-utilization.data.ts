// View models, formatters and static demo data for the IoT / Utilization Analytics page.
// Figures are generated in the browser from the device fixture at the end of this file and follow the filter bar.

export type Connectivity = 'Online' | 'Intermittent' | 'Offline' | 'Never Connected';
export type SensorHealth = 'Healthy' | 'Warning' | 'Failed';
export type AlertSeverity = 'Critical' | 'Warning';

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_CATEGORIES = 'All categories';
export const ALL_DEVICE_TYPES = 'All device types';
export const ALL_STATUSES = 'All statuses';

/** Connectivity statuses used until /options answers (IotUtilizationAnalyticsCalculator.ConnectivityStatuses). */
export const CONNECTIVITY: Connectivity[] = ['Online', 'Intermittent', 'Offline', 'Never Connected'];

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const IOT_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const IOT_DEFAULT_PERIOD = 'Last 30 days';

/** Sensor health target used until the API reports it (%). */
export const SENSOR_HEALTH_TARGET = 95;

/** A connected asset: an IoT device and the asset it is assigned to (API IotAssetRow). */
export interface IotAsset {
  /** Row id (the device record id); used for the detail dialog's history request */
  key: string;
  /** Asset ID shown to users (falls back to the device id) */
  id: string;
  name: string;
  category: string;
  site: string;
  org: string;
  deviceType: string;
  deviceId: string;
  status: Connectivity;
  /** Null when the device reports no health */
  health: SensorHealth | null;
  /** Utilization % for the period (null: the asset has no planned utilization or no asset record) */
  utilization: number | null;
  target: number;
  /** Utilization − target in points (null with no utilization) */
  variance: number | null;
  /** Telemetry availability % (null: never reported) */
  availability: number | null;
  /** Signal strength in dBm (null: not reported) */
  signal: number | null;
  /** Last telemetry message (ISO, UTC) */
  lastSeen: string | null;
  /** Minutes since the last telemetry message */
  lastSeenMin: number | null;
}

/** An active sensor alert (API IotAlertRow). */
export interface IotAlert {
  id: string;
  /** Row key of the asset it belongs to */
  assetKey: string;
  assetId: string;
  assetName: string;
  site: string;
  sensorType: string | null;
  type: string;
  severity: AlertSeverity;
  reading: string;
  raisedMin: number | null;
}

/** A KPI with its change against the previous period. */
export interface IotKpiValue {
  value: number | null;
  previous: number | null;
  /** 0 when there is nothing to compare */
  change: number;
  /** "percent" (relative change) or "points" (difference of two rates) */
  unit: string;
}

export interface IotSiteRow {
  site: string;
  lat: number | null;
  lng: number | null;
  connected: number;
  online: number;
  intermittent: number;
  offline: number;
  utilization: number | null;
  availability: number | null;
  alerts: number;
}

export interface IotDeviceRow {
  type: string;
  connected: number;
  availability: number | null;
  signal: number | null;
  failed: number;
}

export interface IotCategoryRow {
  category: string;
  utilization: number;
  target: number;
}

export interface IotInsightDto {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  assetKeys: string[];
}

/** Everything the page draws, from GET /overview. */
export interface IotView {
  generatedAt: string | null;
  previousFromUtc: string | null;
  previousToUtc: string | null;
  utilizationTarget: number;
  connected: IotKpiValue;
  utilization: IotKpiValue;
  availability: IotKpiValue;
  alertCount: IotKpiValue;
  /** Bucket labels (weeks or months) shared by the trend, telemetry and events charts */
  labels: string[];
  production: number[];
  idle: number[];
  maintenance: number[];
  offline: number[];
  telemetry: { name: string; values: number[] }[];
  critical: number[];
  warning: number[];
  informational: number[];
  connectivity: Record<Connectivity, number>;
  categories: IotCategoryRow[];
  health: { healthy: number; warning: number; failed: number; score: number | null; target: number };
  sites: IotSiteRow[];
  devices: IotDeviceRow[];
  insights: IotInsightDto[];
  alerts: IotAlert[];
  assets: IotAsset[];
  assetTotal: number;
}

const emptyKpi = (): IotKpiValue => ({ value: null, previous: null, change: 0, unit: 'percent' });

/** The page before the first answer, and with nothing recorded. */
export function emptyIot(): IotView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    utilizationTarget: 60,
    connected: emptyKpi(),
    utilization: emptyKpi(),
    availability: emptyKpi(),
    alertCount: emptyKpi(),
    labels: [],
    production: [],
    idle: [],
    maintenance: [],
    offline: [],
    telemetry: [],
    critical: [],
    warning: [],
    informational: [],
    connectivity: { Online: 0, Intermittent: 0, Offline: 0, 'Never Connected': 0 },
    categories: [],
    health: { healthy: 0, warning: 0, failed: 0, score: null, target: SENSOR_HEALTH_TARGET },
    sites: [],
    devices: [],
    insights: [],
    alerts: [],
    assets: [],
    assetTotal: 0
  };
}

export interface IotSite {
  name: string;
  code: string;
  org: string;
  lat: number;
  lng: number;
}

/** Site coordinates for the map pins (also used by Interactive Dashboards, interactive-dashboards.data.ts). */
export const IOT_SITES: IotSite[] = [
  { name: 'Dubai HQ', code: 'DXB', org: 'Purple IQ UAE', lat: 25.2048, lng: 55.2708 },
  { name: 'Abu Dhabi Office', code: 'AUH', org: 'Purple IQ UAE', lat: 24.4539, lng: 54.3773 },
  { name: 'Sharjah Facility', code: 'SHJ', org: 'Purple IQ UAE', lat: 25.3463, lng: 55.4209 },
  { name: 'Jebel Ali Warehouse', code: 'JAW', org: 'Purple IQ UAE', lat: 25.0117, lng: 55.0613 },
  { name: 'Al Ain Depot', code: 'AAN', org: 'Purple IQ UAE', lat: 24.2075, lng: 55.7447 },
  { name: 'Riyadh Office', code: 'RUH', org: 'Purple IQ KSA', lat: 24.7136, lng: 46.6753 },
  { name: 'London Office', code: 'LON', org: 'Purple IQ Group', lat: 51.5072, lng: -0.1276 },
  { name: 'Singapore Office', code: 'SIN', org: 'Purple IQ Group', lat: 1.3521, lng: 103.8198 }
];

const MONTHS_SHORT =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Oct 2026 10:30" in local time, or "Never". */
export function telemetryTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`;
}

export function agoText(minutes: number | null): string {
  if (minutes === null) return 'Never reported';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}

// ===================== Static demo data =====================

/** The filter bar ("All …" means no filter); same shape as IotFilters in the service. */
export interface DemoIotFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  deviceType: string;
  connectivity: string;
}

export const IOT_DEVICE_TYPES = ['Asset Tags', 'Telematics', 'Environment Sensors', 'Power Meters', 'Vibration Sensors', 'CCTV Cameras'];
export const IOT_CATEGORIES = ['Vehicles', 'Machinery', 'Facilities', 'IT Equipment', 'HVAC', 'Power & Electrical'];
export const IOT_UTILIZATION_TARGET = 60;

/** Utilization target per asset category (%). */
const CATEGORY_TARGET: Record<string, number> = {
  Vehicles: 65, Machinery: 70, Facilities: 55, 'IT Equipment': 60, HVAC: 60, 'Power & Electrical': 75
};

/** Which categories each device type is fitted to, and the asset names used for them. */
const DEVICE_PROFILES: { type: string; weight: number; categories: string[]; names: string[]; prefix: string }[] = [
  { type: 'Telematics', weight: 0.22, categories: ['Vehicles'], names: ['Forklift', 'Delivery Van', 'Pickup Truck', 'Reach Truck', 'Pool Car'], prefix: 'TLM' },
  { type: 'Vibration Sensors', weight: 0.2, categories: ['Machinery', 'HVAC'], names: ['CNC Lathe', 'Air Compressor', 'Chiller Pump', 'Conveyor Drive', 'Cooling Tower Fan'], prefix: 'VIB' },
  { type: 'Power Meters', weight: 0.16, categories: ['Power & Electrical'], names: ['Diesel Generator', 'Main LV Panel', 'UPS System', 'Transformer'], prefix: 'PWR' },
  { type: 'Environment Sensors', weight: 0.17, categories: ['HVAC', 'Facilities'], names: ['AHU', 'Cold Room', 'Server Room CRAC', 'Rooftop Package Unit'], prefix: 'ENV' },
  { type: 'Asset Tags', weight: 0.15, categories: ['IT Equipment', 'Machinery'], names: ['Server Rack', 'Scissor Lift', 'Pallet Jack', 'Network Switch'], prefix: 'TAG' },
  { type: 'CCTV Cameras', weight: 0.1, categories: ['Facilities'], names: ['Gate Camera', 'Warehouse Camera', 'Lobby Camera'], prefix: 'CAM' }
];

/** Share of devices per site. */
const SITE_WEIGHTS: Record<string, number> = {
  'Dubai HQ': 0.24, 'Abu Dhabi Office': 0.14, 'Sharjah Facility': 0.16, 'Jebel Ali Warehouse': 0.17, 'Al Ain Depot': 0.07,
  'Riyadh Office': 0.12, 'London Office': 0.05, 'Singapore Office': 0.05
};

const TELEMETRY_SERIES = ['Temperature', 'Vibration', 'Power Load', 'Humidity'];
const IOT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_PER_DAY = 1440;

function iotHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0..1, the same for the same key. */
const wobble = (key: string) => (iotHash(key) % 10_000) / 10_000;

function iotRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

// ----- Device fixture -----

interface DemoDevice {
  key: string;
  assetId: string;
  name: string;
  category: string;
  site: IotSite;
  deviceType: string;
  deviceId: string;
  status: Connectivity;
  health: SensorHealth | null;
  /** Base utilization (%), null when no utilization is planned */
  utilization: number | null;
  target: number;
  availability: number | null;
  signal: number | null;
  lastSeenMin: number | null;
}

function buildDevices(): DemoDevice[] {
  const r = iotRandom(9031);
  const weighted = <T>(list: { item: T; weight: number }[]): T => {
    let x = r();
    for (const e of list) {
      x -= e.weight;
      if (x < 0) return e.item;
    }
    return list[list.length - 1].item;
  };
  const sites = IOT_SITES.map((s) => ({ item: s, weight: SITE_WEIGHTS[s.name] ?? 0.05 }));
  const profiles = DEVICE_PROFILES.map((p) => ({ item: p, weight: p.weight }));
  const statuses: { item: Connectivity; weight: number }[] = [
    { item: 'Online', weight: 0.79 }, { item: 'Intermittent', weight: 0.1 }, { item: 'Offline', weight: 0.08 }, { item: 'Never Connected', weight: 0.03 }
  ];
  const counters = new Map<string, number>();
  const list: DemoDevice[] = [];
  for (let i = 0; i < 132; i++) {
    const site = weighted(sites);
    const profile = weighted(profiles);
    const category = profile.categories[Math.floor(r() * profile.categories.length)];
    const status = weighted(statuses);
    const n = (counters.get(profile.prefix) ?? 0) + 1;
    counters.set(profile.prefix, n);
    const base = profile.names[Math.floor(r() * profile.names.length)];
    const target = CATEGORY_TARGET[category] ?? IOT_UTILIZATION_TARGET;
    const healthRoll = r();
    const health: SensorHealth | null = status === 'Never Connected' ? null
      : status === 'Offline' ? (healthRoll < 0.5 ? 'Failed' : 'Warning')
      : healthRoll < 0.92 ? 'Healthy' : healthRoll < 0.98 ? 'Warning' : 'Failed';
    const utilRoll = r();
    const utilization = status === 'Never Connected' || utilRoll < 0.04 ? null
      : r1(Math.max(8, Math.min(96, target + (utilRoll - 0.42) * 46 - (status === 'Offline' ? 25 : status === 'Intermittent' ? 10 : 0))));
    const lastSeenMin = status === 'Never Connected' ? null
      : status === 'Online' ? Math.floor(r() * 4)
      : status === 'Intermittent' ? 5 + Math.floor(r() * 85)
      : r() < 0.7 ? MIN_PER_DAY + Math.floor(r() * 5 * MIN_PER_DAY) : 120 + Math.floor(r() * 1200);
    list.push({
      key: `dev-${String(i + 1).padStart(4, '0')}`,
      assetId: `AST-2026-${site.code}-${String(300 + i * 11).padStart(6, '0')}`,
      name: `${base} ${String.fromCharCode(65 + (n % 26))}-${String(n).padStart(2, '0')}`,
      category,
      site,
      deviceType: profile.type,
      deviceId: `${profile.prefix}-${site.code}-${String(n).padStart(4, '0')}`,
      status,
      health,
      utilization,
      target,
      availability: status === 'Never Connected' ? null
        : r1(status === 'Online' ? 96 + r() * 3.9 : status === 'Intermittent' ? 74 + r() * 18 : 38 + r() * 40),
      signal: status === 'Never Connected' || profile.type === 'CCTV Cameras' && r() < 0.3 ? null : Math.round(-52 - r() * 30),
      lastSeenMin
    });
  }
  return list;
}

const DEMO_DEVICES = buildDevices();

const isAllValue = (v: string | null | undefined) => !v || v.startsWith('All ');
const matches = (a: string, b: string) => isAllValue(b) || a.toLowerCase() === b.toLowerCase();

function scopedDevices(f: DemoIotFilters): DemoDevice[] {
  return DEMO_DEVICES.filter((d) =>
    matches(d.site.org, f.organization) && matches(d.site.name, f.location) && matches(d.category, f.category) &&
    matches(d.deviceType, f.deviceType) && matches(d.status, f.connectivity));
}

function toIotAsset(d: DemoDevice, period: string): IotAsset {
  // Utilization moves a little with the period so switching presets changes the figures
  const utilization = d.utilization === null ? null : r1(Math.max(5, Math.min(98, d.utilization + (wobble(`${d.key}|${period}`) - 0.5) * 8)));
  const lastSeen = d.lastSeenMin === null ? null : new Date(Date.now() - d.lastSeenMin * 60_000).toISOString();
  return {
    key: d.key,
    id: d.assetId,
    name: d.name,
    category: d.category,
    site: d.site.name,
    org: d.site.org,
    deviceType: d.deviceType,
    deviceId: d.deviceId,
    status: d.status,
    health: d.health,
    utilization,
    target: d.target,
    variance: utilization === null ? null : r1(utilization - d.target),
    availability: d.availability,
    signal: d.signal,
    lastSeen,
    lastSeenMin: d.lastSeenMin
  };
}

function alertsFor(assets: IotAsset[]): IotAlert[] {
  const list: IotAlert[] = [];
  const add = (a: IotAsset, type: string, sensorType: string | null, severity: AlertSeverity, reading: string, raisedMin: number) =>
    list.push({ id: `ALR-${a.key.slice(4)}-${list.length + 1}`, assetKey: a.key, assetId: a.id, assetName: a.name, site: a.site, sensorType, type, severity, reading, raisedMin });
  for (const a of assets) {
    const w = wobble(`alert|${a.key}`);
    if (a.status === 'Offline') {
      add(a, 'Device offline', 'Connectivity', (a.lastSeenMin ?? 0) > MIN_PER_DAY ? 'Critical' : 'Warning', `No telemetry for ${agoText(a.lastSeenMin).replace(' ago', '')}`, a.lastSeenMin ?? 0);
    }
    if (a.deviceType === 'Vibration Sensors' && a.health && a.health !== 'Healthy') {
      add(a, 'Abnormal vibration', 'Vibration', a.health === 'Failed' ? 'Critical' : 'Warning', `${(7.1 + w * 4.5).toFixed(1)} mm/s RMS (limit 7.1)`, 10 + Math.floor(w * 600));
    } else if (a.deviceType === 'Environment Sensors' && a.health === 'Warning') {
      add(a, 'High temperature', 'Temperature', 'Warning', `${(27 + w * 6).toFixed(1)} °C (limit 26 °C)`, 15 + Math.floor(w * 400));
    } else if (a.deviceType === 'Power Meters' && a.health && a.health !== 'Healthy') {
      add(a, 'Power quality', 'Power', a.health === 'Failed' ? 'Critical' : 'Warning', `Voltage drop ${(8 + w * 7).toFixed(0)}%`, 20 + Math.floor(w * 500));
    } else if (a.deviceType === 'Telematics' && a.health === 'Warning') {
      add(a, 'Low battery', 'Battery', 'Warning', `${Math.round(8 + w * 10)}% battery`, 30 + Math.floor(w * 700));
    } else if (a.health === 'Failed' && a.status !== 'Offline') {
      add(a, 'Sensor fault', a.deviceType.replace(/s$/, ''), 'Critical', 'Sensor not responding', 40 + Math.floor(w * 900));
    }
  }
  return list.sort((a, b) => (a.raisedMin ?? 0) - (b.raisedMin ?? 0));
}

// ----- Period buckets -----

interface IotBucket {
  label: string;
  /** Length in days */
  days: number;
}

function iotBuckets(period: string, previous = false): IotBucket[] {
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const dayLabel = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${IOT_MONTHS[d.getMonth()]}`;
  const weeks = (from: Date, to: Date): IotBucket[] => {
    const list: IotBucket[] = [];
    for (let d = from; d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      const days = Math.min(7, Math.round((to.getTime() - d.getTime()) / 86_400_000));
      list.push({ label: `${dayLabel(d)}\n${d.getFullYear()}`, days });
    }
    return list;
  };
  const shift = previous ? 1 : 0;
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'Today':
      return ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((h) => ({ label: `${h}\n${dayLabel(day(-shift))}`, days: 1 / 6 }));
    case 'Last 7 days':
      return Array.from({ length: 7 }, (_, i) => {
        const d = day(i - 6 - shift * 7);
        return { label: `${dayLabel(d)}\n${d.getFullYear()}`, days: 1 };
      });
    case 'This month':
      return previous ? weeks(new Date(y, m - 1, 1), new Date(y, m, 1)) : weeks(new Date(y, m, 1), day(1));
    case 'Last month':
      return weeks(new Date(y, m - 1 - shift, 1), new Date(y, m - shift, 1));
    case 'This quarter': {
      const q = Math.floor(m / 3) * 3;
      return previous ? weeks(new Date(y, q - 3, 1), new Date(y, q, 1)) : weeks(new Date(y, q, 1), day(1));
    }
    case 'This year':
      return Array.from({ length: m + 1 }, (_, i) => ({ label: `${IOT_MONTHS[i]}\n${y - shift}`, days: i === m && !previous ? now.getDate() : 30 }));
    default:
      // Last 30 days
      return weeks(day(-29 - shift * 30), day(1 - shift * 30));
  }
}

// ----- Builders -----

const kpiValue = (value: number, previous: number, unit: 'percent' | 'points'): IotKpiValue => ({
  value,
  previous,
  change: unit === 'points' ? r1(value - previous) : previous ? r1(((value - previous) / previous) * 100) : 0,
  unit
});

export function buildDemoIot(f: DemoIotFilters): IotView {
  const devices = scopedDevices(f);
  const assets = devices.map((d) => toIotAsset(d, f.period));
  const alerts = alertsFor(assets);
  const withUtil = assets.filter((a) => a.utilization !== null);
  const reporting = assets.filter((a) => a.availability !== null);
  const avgUtil = r1(avg(withUtil.map((a) => a.utilization!)));
  const avgAvail = r1(avg(reporting.map((a) => a.availability!)));
  const connectedCount = assets.filter((a) => a.status !== 'Never Connected').length;
  const key = `${f.organization}|${f.location}|${f.category}|${f.deviceType}|${f.connectivity}|${f.period}`;

  // Trend: share of time per state, per bucket
  const buckets = iotBuckets(f.period);
  const offlineShare = assets.length ? (assets.filter((a) => a.status === 'Offline').length / assets.length) * 100 : 0;
  const production: number[] = [];
  const idle: number[] = [];
  const maintenance: number[] = [];
  const offline: number[] = [];
  buckets.forEach((b, i) => {
    const p = r1(Math.max(5, avgUtil - 4 + i * (8 / Math.max(1, buckets.length)) + (wobble(`${key}|p|${b.label}`) - 0.5) * 6));
    const off = r1(Math.max(1, offlineShare * 0.6 + wobble(`${key}|o|${b.label}`) * 3));
    const mnt = r1(4 + wobble(`${key}|m|${b.label}`) * 5);
    production.push(p);
    offline.push(off);
    maintenance.push(mnt);
    idle.push(r1(Math.max(0, 100 - p - off - mnt)));
  });
  const telemetry = TELEMETRY_SERIES.map((name, s) => ({
    name,
    values: buckets.map((b, i) => r1(Math.min(98, [62, 38, 71, 48][s] + Math.sin(i / 1.7 + s) * 7 + (wobble(`${key}|t${s}|${b.label}`) - 0.5) * 8)))
  }));
  const perDay = Math.max(0.3, assets.length / 40);
  const events = (sev: string, rate: number) => buckets.map((b) => Math.round(b.days * perDay * rate * (0.7 + wobble(`${key}|${sev}|${b.label}`) * 0.6)));

  const connectivity: Record<Connectivity, number> = { Online: 0, Intermittent: 0, Offline: 0, 'Never Connected': 0 };
  for (const a of assets) connectivity[a.status]++;

  const categories = IOT_CATEGORIES.map((c) => {
    const rows = withUtil.filter((a) => a.category === c);
    return rows.length ? { category: c, utilization: r1(avg(rows.map((a) => a.utilization!))), target: CATEGORY_TARGET[c] } : null;
  }).filter((c): c is IotCategoryRow => c !== null);

  const healthy = assets.filter((a) => a.health === 'Healthy').length;
  const warning = assets.filter((a) => a.health === 'Warning').length;
  const failed = assets.filter((a) => a.health === 'Failed').length;
  const sensors = healthy + warning + failed;

  const sites: IotSiteRow[] = IOT_SITES.map((s): IotSiteRow | null => {
    const rows = assets.filter((a) => a.site === s.name);
    if (!rows.length) return null;
    const util = rows.filter((a) => a.utilization !== null);
    const avail = rows.filter((a) => a.availability !== null);
    return {
      site: s.name, lat: s.lat, lng: s.lng,
      connected: rows.length,
      online: rows.filter((a) => a.status === 'Online').length,
      intermittent: rows.filter((a) => a.status === 'Intermittent').length,
      offline: rows.filter((a) => a.status === 'Offline' || a.status === 'Never Connected').length,
      utilization: util.length ? r1(avg(util.map((a) => a.utilization!))) : null,
      availability: avail.length ? r1(avg(avail.map((a) => a.availability!))) : null,
      alerts: alerts.filter((x) => rows.some((a) => a.key === x.assetKey)).length
    };
  }).filter((s): s is IotSiteRow => s !== null);

  const devicesRows: IotDeviceRow[] = IOT_DEVICE_TYPES.map((t): IotDeviceRow | null => {
    const rows = assets.filter((a) => a.deviceType === t);
    if (!rows.length) return null;
    const avail = rows.filter((a) => a.availability !== null);
    const sig = rows.filter((a) => a.signal !== null);
    return {
      type: t,
      connected: rows.length,
      availability: avail.length ? r1(avg(avail.map((a) => a.availability!))) : null,
      signal: sig.length ? Math.round(avg(sig.map((a) => a.signal!))) : null,
      failed: rows.filter((a) => a.health === 'Failed').length
    };
  }).filter((d): d is IotDeviceRow => d !== null);

  // Insights
  const insights: IotInsightDto[] = [];
  const critical = alerts.filter((a) => a.severity === 'Critical');
  if (alerts.length) {
    insights.push({
      key: 'alerts', severity: critical.length ? 'critical' : 'warning',
      title: `${alerts.length} active IoT alert${alerts.length === 1 ? '' : 's'}`,
      message: `${critical.length} critical and ${alerts.length - critical.length} warning alerts across ${new Set(alerts.map((a) => a.site)).size} locations need attention.`,
      count: alerts.length, assetKeys: [...new Set(alerts.map((a) => a.assetKey))]
    });
  }
  const below = withUtil.filter((a) => (a.variance ?? 0) < 0).sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));
  if (below.length) {
    insights.push({
      key: 'below_target', severity: 'warning',
      title: `${below.length} assets below utilization target`,
      message: `${below[0].name} (${below[0].site}) is ${Math.abs(below[0].variance ?? 0)} pts below its ${below[0].target}% target. Review allocation and idle time.`,
      count: below.length, assetKeys: below.map((a) => a.key)
    });
  }
  const vibration = alerts.filter((a) => a.sensorType === 'Vibration');
  if (vibration.length) {
    insights.push({
      key: 'abnormal_vibration', severity: 'critical',
      title: `Abnormal vibration on ${vibration.length} asset${vibration.length === 1 ? '' : 's'}`,
      message: `Vibration sensors on ${vibration.map((a) => a.assetName).slice(0, 2).join(' and ')}${vibration.length > 2 ? ' and others' : ''} exceed the 7.1 mm/s alarm limit. Schedule a condition check.`,
      count: vibration.length, assetKeys: [...new Set(vibration.map((a) => a.assetKey))]
    });
  }
  const offline24 = assets.filter((a) => a.status === 'Offline' && (a.lastSeenMin ?? 0) > MIN_PER_DAY);
  if (offline24.length) {
    insights.push({
      key: 'offline_devices', severity: 'warning',
      title: `${offline24.length} device${offline24.length === 1 ? '' : 's'} offline for more than 24 hours`,
      message: `No telemetry from ${offline24.length} devices for over a day. Check power, SIM and gateway connectivity.`,
      count: offline24.length, assetKeys: offline24.map((a) => a.key)
    });
  }

  const ordered = [...assets].sort((a, b) => (a.variance ?? Number.MAX_VALUE) - (b.variance ?? Number.MAX_VALUE));
  return {
    generatedAt: new Date().toISOString(),
    previousFromUtc: null,
    previousToUtc: null,
    utilizationTarget: IOT_UTILIZATION_TARGET,
    connected: kpiValue(connectedCount, Math.max(0, connectedCount - Math.max(1, Math.round(connectedCount * 0.05))), 'percent'),
    utilization: kpiValue(avgUtil, r1(avgUtil - 2.4 + wobble(`${key}|pu`) * 1.5), 'points'),
    availability: kpiValue(avgAvail, r1(Math.min(99.9, avgAvail - 0.6 + wobble(`${key}|pa`))), 'points'),
    alertCount: kpiValue(alerts.length, alerts.length + Math.round(alerts.length * 0.15) + 1, 'percent'),
    labels: buckets.map((b) => b.label),
    production, idle, maintenance, offline,
    telemetry,
    critical: events('c', 0.35),
    warning: events('w', 1.1),
    informational: events('i', 2.6),
    connectivity,
    categories,
    health: { healthy, warning, failed, score: sensors ? r1((healthy / sensors) * 100) : null, target: SENSOR_HEALTH_TARGET },
    sites,
    devices: devicesRows,
    insights,
    alerts,
    assets: ordered,
    assetTotal: assets.length
  };
}

/** Previous period's Production line. */
export function buildDemoPreviousProduction(f: DemoIotFilters): number[] {
  const current = buildDemoIot(f);
  const util = current.utilization.previous ?? 50;
  return iotBuckets(f.period, true).map((b, i, list) => r1(Math.max(5, util - 4 + i * (6 / Math.max(1, list.length)) + (wobble(`prev|${f.period}|${b.label}`) - 0.5) * 6)));
}

/** Weekly utilization over the last 12 weeks for one asset. */
export function buildDemoHistory(f: DemoIotFilters, assetKey: string): number[] {
  const d = DEMO_DEVICES.find((x) => x.key === assetKey);
  if (!d || d.utilization === null) return [];
  const now = toIotAsset(d, f.period).utilization ?? d.utilization;
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? now : r1(Math.max(5, Math.min(98, now + (wobble(`${assetKey}|h${i}`) - 0.5) * 18 - (11 - i) * 0.4)))));
}

/** Filter dropdown values. */
export function demoIotFilterLists(): { organizations: string[]; locations: string[]; categories: string[]; deviceTypes: string[] } {
  return {
    organizations: [ALL_ORGANIZATIONS, ...new Set(IOT_SITES.map((s) => s.org))],
    locations: [ALL_LOCATIONS, ...IOT_SITES.map((s) => s.name)],
    categories: [ALL_CATEGORIES, ...IOT_CATEGORIES],
    deviceTypes: [ALL_DEVICE_TYPES, ...IOT_DEVICE_TYPES]
  };
}

/** CSV rows of the connected assets for the filters. */
export function demoIotAssetRows(f: DemoIotFilters): (string | number)[][] {
  return buildDemoIot(f).assets.map((a) => [
    a.id, a.name, a.category, a.site, a.org, a.deviceType, a.deviceId, a.status, a.health ?? '', a.utilization ?? '', a.target, a.variance ?? '',
    a.availability ?? '', a.signal ?? '', telemetryTime(a.lastSeen)
  ]);
}
