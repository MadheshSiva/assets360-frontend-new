// View models for the IoT / Utilization Analytics page. Every figure comes from /api/iot-utilization-analytics
// (iot-utilization-analytics.service.ts); this file only holds the shapes, the empty state and small formatters.

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

/**
 * Known site coordinates. This page takes its pins from master_sites through the API; the list stays only because
 * Interactive Dashboards (interactive-dashboards.data.ts) uses it to place map pins by site name.
 */
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
