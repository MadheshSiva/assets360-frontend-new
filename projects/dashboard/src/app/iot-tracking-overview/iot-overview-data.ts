/**
 * STATIC DEMO: the connected-asset fleet behind the IoT & Tracking Overview: the tracked assets of the dashboard's
 * demo register (services/dashboard/dashboard.data.ts), so the fleet, alerts and the Dashboard service's KPIs agree.
 */
import { DEMO_ALERTS, DEMO_ASSETS, DEMO_SITES, LATEST_FIRMWARE_VERSION, demoEventHistory, demoLastSeen, siteOf } from '../services/dashboard/dashboard.data';

export type DeviceStatus = 'Online' | 'Idle' | 'Offline' | 'Unknown';
export type HealthBand = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
export type Severity = 'Critical' | 'Warning' | 'Info';
export type AlertStatus = 'Open' | 'Acknowledged' | 'In Progress' | 'Resolved';
export type EventSeries = 'telemetry' | 'location' | 'geofence' | 'alerts';

export interface Site {
  name: string;
  /** Zone outline on the map, [lat, lng] corners. */
  zone: [number, number][];
  color: string;
  image: string;
}

export interface Device {
  id: string;
  assetId: string;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serial: string;
  site: string;
  status: DeviceStatus;
  /** 0-100, or null when the device has not reported. */
  health: number | null;
  /** 0-100 share of the period the asset was running. */
  utilization: number;
  firmwareLatest: boolean;
  firmware: string;
  /** A sensor is outside its normal band. */
  abnormal: boolean;
  lat: number;
  lng: number;
  commissioned: string;
  /** yyyy-MM-ddTHH:mm */
  lastUpdate: string;
  battery: number;
  signal: number;
  temperature: number;
  vibration: number;
  lastService: string;
  nextService: string;
}

export interface IotAlert {
  id: string;
  /** yyyy-MM-ddTHH:mm */
  at: string;
  deviceId: string;
  event: string;
  severity: Severity;
  status: AlertStatus;
}

export interface EventDay {
  date: string;
  telemetry: number;
  location: number;
  geofence: number;
  alerts: number;
}

/** Asset types of the tracked assets (utilization rows). */
export const ASSET_TYPES: string[] = [...new Set(DEMO_ASSETS.filter((a) => !!a.device).map((a) => a.type))];
export const STATUSES: DeviceStatus[] = ['Online', 'Idle', 'Offline', 'Unknown'];
export const STATUS_COLORS: Record<DeviceStatus, string> = { Online: '#16a34a', Idle: '#2563eb', Offline: '#dc2626', Unknown: '#cbd5e1' };
export const HEALTH_COLORS: Record<HealthBand, string> = { Healthy: '#16a34a', Warning: '#f5b324', Critical: '#dc2626', Unknown: '#cbd5e1' };
export const SERIES: { key: EventSeries; label: string; color: string }[] = [
  { key: 'telemetry', label: 'Telemetry Data', color: '#2563eb' },
  { key: 'location', label: 'Location Updates', color: '#16a34a' },
  { key: 'geofence', label: 'Geofence Events', color: '#f5b324' },
  { key: 'alerts', label: 'Alerts', color: '#dc2626' },
];
/** Firmware every device should run; others count as pending updates. */
export const LATEST_FIRMWARE = LATEST_FIRMWARE_VERSION;

/** One zone per site: a small square around the site's position. */
export const SITES: Site[] = DEMO_SITES.map((s): Site => {
  const d = 0.0022;
  return { name: s.name, color: s.color, image: s.image, zone: [[s.lat + d, s.lng - d], [s.lat + d, s.lng + d], [s.lat - d, s.lng + d], [s.lat - d, s.lng - d]] };
});

export const DEVICES: Device[] = DEMO_ASSETS.filter((a) => !!a.device).map((a, i): Device => {
  const d = a.device!;
  return {
    id: `DEV-${String(i + 1).padStart(5, '0')}`,
    assetId: a.tag, name: a.name, type: a.type, manufacturer: a.manufacturer, model: a.model, serial: a.serial,
    site: siteOf(a).name, status: d.network, health: a.health,
    utilization: d.network === 'Online' ? a.utilization : d.network === 'Idle' ? Math.min(a.utilization, 12) : 0,
    firmwareLatest: d.firmware === LATEST_FIRMWARE_VERSION, firmware: d.firmware,
    abnormal: a.health < 65 || d.vibration > 7,
    lat: a.lat, lng: a.lng, commissioned: a.purchaseDate, lastUpdate: demoLastSeen(a),
    battery: d.battery, signal: d.signal, temperature: d.temperature, vibration: d.vibration,
    lastService: a.lastService, nextService: a.nextService,
  };
});

const DEVICE_BY_TAG = new Map(DEVICES.map((d) => [d.assetId, d.id]));
export const ALERTS: IotAlert[] = DEMO_ALERTS.filter((a) => DEVICE_BY_TAG.has(a.tag)).map((a) => ({
  id: a.id, at: a.at, deviceId: DEVICE_BY_TAG.get(a.tag)!, event: a.event, severity: a.severity, status: a.status,
}));
export const EVENT_HISTORY: EventDay[] = demoEventHistory();

/** Figures for the previous period, so the KPIs can show a change. */
export const PREVIOUS: { connected: number; coverage: number; freshness: number } | null = { connected: 15, coverage: 85.7, freshness: 92.3 };

export function healthBand(h: number | null): HealthBand {
  return h === null ? 'Unknown' : h >= 70 ? 'Healthy' : h >= 40 ? 'Warning' : 'Critical';
}

/** One GET api/asset-dashboard/location-updates?days=k window: totals from `from` up to the API's fixed end (next midnight). */
export interface LocationWindow {
  from: string;
  totalCount: number;
  tags: { tagId: string; count: number }[];
}

/**
 * Daily location updates from cumulative windows. The API only returns totals for "the last k days", all ending at
 * the same moment, so day k-ago = window(k) - window(k-1). windows[k - 1] is the response for days=k (k = 1..n).
 * Returns the days oldest first, plus each day's updates per tag.
 */
export function dailyLocationUpdates(windows: LocationWindow[]): { days: EventDay[]; tagsByDay: Map<string, { tagId: string; count: number }[]> } {
  const days: EventDay[] = [];
  const tagsByDay = new Map<string, { tagId: string; count: number }[]>();
  windows.forEach((w, i) => {
    const prev = windows[i - 1];
    const date = w.from.slice(0, 10);
    const before = new Map((prev?.tags ?? []).map((t) => [t.tagId, t.count]));
    const tags = w.tags
      .map((t) => ({ tagId: t.tagId, count: Math.max(0, t.count - (before.get(t.tagId) ?? 0)) }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
    days.push({ date, telemetry: 0, location: Math.max(0, w.totalCount - (prev?.totalCount ?? 0)), geofence: 0, alerts: 0 });
    tagsByDay.set(date, tags);
  });
  return { days: days.reverse(), tagsByDay };
}
