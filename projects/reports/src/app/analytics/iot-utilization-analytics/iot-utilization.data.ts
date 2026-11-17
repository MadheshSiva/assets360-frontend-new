import { RA_PERIODS } from '../shared/analytics-common';

// IoT / Utilization page data. Every KPI, chart, map pin and table is aggregated from IOT_ASSETS / IOT_ALERTS,
// which stay empty until an IoT telemetry API is wired.

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

/** Sites with IoT coverage (populated from the API). */
export const IOT_SITES: IotSite[] = [];

export const DEVICE_TYPES = ['Asset Tags', 'Telematics', 'Environment Sensors', 'Power Meters', 'Vibration Sensors', 'CCTV Cameras'];
export const CONNECTIVITY: Connectivity[] = ['Online', 'Intermittent', 'Offline', 'Never Connected'];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const IOT_ASSETS: IotAsset[] = [];
export const IOT_ALERTS: IotAlert[] = [];

// ===== Period handling =====

export interface PeriodWindow {
  labels: string[];
  /** Index into the telemetry timeline for each label */
  months: number[];
  weekly: boolean;
}

/** Timeline labels come with the telemetry API data; none are generated here. */
export function periodWindow(period: string): PeriodWindow {
  const weekly = [1, 3].includes(RA_PERIODS.indexOf(period));
  return { labels: [], months: [], weekly };
}

export function telemetryTime(minutesAgo: number | null): string {
  if (minutesAgo === null) return 'Never';
  const d = new Date(Date.now() - minutesAgo * 60000);
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
