/**
 * Tracking & Telemetry types and the mapping from the Tracking service records (IoT devices, device health,
 * telemetry readings, IoT alerts, location events) to the page model. Nothing here is hardcoded demo data.
 */
import { DeviceHealthDto, IotAlertDto, IotDeviceDto, LocationEventDto, TelemetryReadingDto, paramKind, timeOf } from './telemetry-api';

export type Status = 'online' | 'warning' | 'offline';
export type MarkerIcon = 'forklift' | 'pump' | 'cold' | 'generator' | 'sensor';
export type Metric = 'temp' | 'vib' | 'battery';
export type Severity = 'Info' | 'Warning' | 'Critical';
export type Range = '1h' | '24h' | '7d';
export type LiveKey = 'temp' | 'vib' | 'battery' | 'rssi';

export interface CampusFeature {
  type: 'Feature';
  properties: { kind: string; id: string; name?: string; [k: string]: unknown };
  geometry: { type: 'Point' | 'LineString' | 'Polygon'; coordinates: unknown };
}

export interface AlertItem { id: string; title: string; detail: string; severity: Severity; status: string; at: number; acknowledged: boolean }
export interface HistoryItem { at: number; text: string; by: string }

export interface TrackedAsset {
  /** Device id (unique per tracked item). */
  id: string;
  name: string;
  type: string;
  icon: MarkerIcon;
  kind: 'asset' | 'device';
  status: Status;
  health: 'Healthy' | 'Attention' | 'Critical';
  /** Site name ('' when the device has none). */
  building: string;
  /** Master Data site id ('' when the device has none). */
  siteId: string;
  assetCode: string;
  assetRegistrationId: string;
  device: { id: string; type: string; model: string; firmware: string; protocol: string; gateway: string; serial: string; installed: string };
  /** Latest values (null when the device has reported nothing). */
  live: Record<LiveKey, number | null>;
  /** Alert thresholds; none are stored by the API, so they are only set from this page for the session. */
  thresholds: Record<Metric, number | null>;
  alerts: AlertItem[];
  history: HistoryItem[];
  /** Epoch ms of the last payload (NaN when the device never reported). */
  lastSeen: number;
  /** Latest zone from the location events, with when it was entered. */
  zone: { name: string; at: number } | null;
}

export interface TelemetryEvent {
  /** Epoch ms. */
  at: number;
  /** Tracked asset (device) id, or '' when the record matches no known device. */
  assetId: string;
  assetName: string;
  deviceId: string;
  icon: 'pin' | 'warn' | 'temp' | 'battery';
  event: string;
  reading: string;
  severity: Severity;
  configurable: boolean;
}

/** Site map geometry as GeoJSON. The Tracking API has no endpoint for site geometry or device coordinates yet. */
export const CAMPUS_GEO: { type: 'FeatureCollection'; name: string; features: CampusFeature[] } = { type: 'FeatureCollection', name: '', features: [] };
export const CAMPUS_NAME = '';

export const BUILDINGS: { id: string; name: string }[] = CAMPUS_GEO.features
  .filter((f) => f.properties.kind === 'building')
  .map((f) => ({ id: f.properties.id, name: String(f.properties.name) }));

export function buildingName(id: string): string {
  return BUILDINGS.find((b) => b.id === id)?.name ?? id;
}

/** KPI card definitions; values are aggregated on the page. */
export const KPIS = [
  { key: 'tracked', label: 'Tracked Assets', color: '#22c55e' },
  { key: 'online', label: 'Devices Online', color: '#22c55e' },
  { key: 'alerts', label: 'Active Alerts', color: '#ef4444' },
  { key: 'points', label: 'Telemetry Points', color: '#6366f1' },
] as const;

export const RANGE_SPEC: Record<Range, { label: string; mins: number; step: number; days: number }> = {
  // `days` is the API window (whole UTC days ending today) that covers the range
  '1h': { label: 'Last 1 hour', mins: 60, step: 1, days: 2 },
  '24h': { label: 'Last 24 hours', mins: 1440, step: 15, days: 2 },
  '7d': { label: 'Last 7 days', mins: 10080, step: 120, days: 8 },
};

export interface Series { metric: Metric; mins: number[]; values: (number | null)[] }

/** A device without a payload for longer than this is shown offline (when device health has no connectivity for it). */
const OFFLINE_AFTER_MIN = 60;
/** ... and in warning (late heartbeat) after this long. */
const WARNING_AFTER_MIN = 15;

function iconFor(...texts: (string | null | undefined)[]): MarkerIcon {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  if (/forklift|vehicle|truck|car\b|van\b/.test(t)) return 'forklift';
  if (/pump|motor/.test(t)) return 'pump';
  if (/cold|fridge|freez|refrig|chiller/.test(t)) return 'cold';
  if (/generator|genset/.test(t)) return 'generator';
  return 'sensor';
}

function sevOf(s: string | null | undefined): Severity {
  return s === 'Critical' ? 'Critical' : s === 'Warning' ? 'Warning' : 'Info';
}

function fmtDay(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
}

export function matchesDevice(d: IotDeviceDto, assetId: string | null | undefined): boolean {
  return !!assetId && (assetId === d.deviceId || assetId === d.assetCode || assetId === d.assetRegistrationId);
}

export function alertOfDevice(d: IotDeviceDto, a: IotAlertDto): boolean {
  return (!!a.deviceId && a.deviceId === d.deviceId) || (!!a.assetRegistrationId && a.assetRegistrationId === d.assetRegistrationId);
}

/**
 * Connectivity of a device: the device-health record's connectivity when there is one, otherwise worked out
 * from how long ago it last reported (never reported = offline).
 */
export function deviceStatus(h: DeviceHealthDto | undefined, lastSeen: number, now: number): Status {
  if (h?.connectivity) return h.connectivity === 'Online' ? 'online' : h.connectivity === 'Warning' ? 'warning' : 'offline';
  if (!Number.isFinite(lastSeen)) return 'offline';
  const mins = (now - lastSeen) / 60000;
  return mins > OFFLINE_AFTER_MIN ? 'offline' : mins > WARNING_AFTER_MIN ? 'warning' : 'online';
}

/** Epoch ms of a device's last payload (device, its health record or its latest reading); NaN when it never reported. */
export function lastSeenOf(d: IotDeviceDto, h: DeviceHealthDto | undefined, latestReading?: TelemetryReadingDto): number {
  return Math.max(timeOf(d.lastSeenAt) || 0, timeOf(h?.lastSeenAt) || 0, timeOf(latestReading?.recordedAt) || 0) || NaN;
}

export interface TelemetrySource {
  devices: IotDeviceDto[];
  health: DeviceHealthDto[];
  /** Fleet readings, newest first. */
  readings: TelemetryReadingDto[];
  alerts: IotAlertDto[];
  locationEvents: LocationEventDto[];
}

/** Maps the API records to tracked assets (one per IoT device). `prev` keeps thresholds set on this page. */
export function buildAssets(src: TelemetrySource, now: number, prev: TrackedAsset[] = []): TrackedAsset[] {
  const healthBy = new Map(src.health.map((h) => [h.deviceId, h]));
  const readingsBy = new Map<string, TelemetryReadingDto[]>();
  for (const r of src.readings) {
    const list = readingsBy.get(r.deviceId) ?? [];
    list.push(r);
    readingsBy.set(r.deviceId, list);
  }
  return src.devices.map((d) => {
    const h = healthBy.get(d.deviceId);
    const readings = readingsBy.get(d.deviceId) ?? [];
    const latest = (k: LiveKey): number | null => {
      const r = readings.find((x) => paramKind(x.parameter) === k);
      return r ? Number(r.value) : null;
    };
    const lastSeen = lastSeenOf(d, h, readings[0]);
    const status = deviceStatus(h, lastSeen, now);
    const healthText = h?.health ?? d.health ?? '';
    const health: TrackedAsset['health'] = /critical/i.test(healthText) ? 'Critical' : /attention|warning|maintenance/i.test(healthText) ? 'Attention' : 'Healthy';

    const alerts: AlertItem[] = src.alerts.filter((a) => alertOfDevice(d, a)).map((a) => ({
      id: a.alertId,
      title: a.eventType,
      detail: a.message || a.assetName,
      severity: sevOf(a.severity),
      status: a.status ?? 'Open',
      at: timeOf(a.raisedAt),
      acknowledged: (a.status ?? 'Open') !== 'Open',
    }));
    const events = src.locationEvents.filter((e) => matchesDevice(d, e.assetId));
    const history: HistoryItem[] = [
      ...events.map((e) => ({ at: timeOf(e.eventTime), text: `${e.eventType}: ${e.zoneName}${e.details ? ' · ' + e.details : ''}`, by: e.createdBy || 'System' })),
      ...src.alerts.filter((a) => alertOfDevice(d, a)).flatMap((a) => [
        { at: timeOf(a.raisedAt), text: `Alert raised: ${a.eventType}`, by: a.createdBy || 'System' },
        ...(a.acknowledgedAt ? [{ at: timeOf(a.acknowledgedAt), text: `Alert acknowledged: ${a.eventType}`, by: a.acknowledgedBy || '—' }] : []),
        ...(a.resolvedAt ? [{ at: timeOf(a.resolvedAt), text: `Alert resolved: ${a.eventType}`, by: a.resolvedBy || '—' }] : []),
      ]),
    ].filter((x) => Number.isFinite(x.at)).sort((x, y) => y.at - x.at).slice(0, 50);

    // events are newest first: the current zone is the latest event unless the asset departed it
    const last = events[0];
    const zone = last && last.eventType !== 'Departed Zone' ? { name: last.zoneName, at: timeOf(last.eventTime) } : null;
    const old = prev.find((p) => p.id === d.deviceId);

    return {
      id: d.deviceId,
      name: d.assetName || d.deviceName || d.deviceId,
      type: d.deviceType,
      icon: iconFor(d.assetName, d.deviceType, d.deviceName),
      kind: d.assetCode || d.assetRegistrationId ? 'asset' : 'device',
      status,
      health,
      building: d.siteName ?? h?.siteName ?? '',
      siteId: d.siteId ?? h?.siteId ?? '',
      assetCode: d.assetCode ?? '',
      assetRegistrationId: d.assetRegistrationId ?? '',
      device: {
        id: d.deviceId,
        type: d.deviceType,
        model: d.model,
        firmware: d.firmwareVersion || '—',
        protocol: d.connectivity || '',
        gateway: d.gateway || h?.gateway || '—',
        serial: d.serialNumber || '—',
        installed: fmtDay(timeOf(d.createdAt)),
      },
      live: {
        temp: latest('temp'),
        vib: latest('vib'),
        battery: latest('battery') ?? h?.batteryLevel ?? d.batteryLevel ?? null,
        rssi: latest('rssi') ?? h?.signalStrengthDbm ?? null,
      },
      thresholds: old ? old.thresholds : { temp: null, vib: null, battery: null },
      alerts,
      history,
      lastSeen,
      zone,
    } satisfies TrackedAsset;
  });
}

/** Recent location events and alerts within the last `mins` minutes, newest first. */
export function buildEvents(src: TelemetrySource, assets: TrackedAsset[], now: number, mins: number): TelemetryEvent[] {
  const since = now - mins * 60000;
  const out: TelemetryEvent[] = [];
  for (const e of src.locationEvents) {
    const at = timeOf(e.eventTime);
    if (!(at >= since)) continue;
    const dev = src.devices.find((d) => matchesDevice(d, e.assetId));
    out.push({
      at,
      assetId: dev?.deviceId ?? '',
      assetName: e.assetName || e.assetId,
      deviceId: dev?.deviceId ?? e.assetId,
      icon: 'pin',
      event: e.eventType,
      reading: e.zoneName + (e.details ? ` · ${e.details}` : ''),
      severity: e.eventType === 'Geofence Alert' || e.eventType === 'Dwell Exceeded' ? 'Warning' : 'Info',
      configurable: false,
    });
  }
  for (const a of src.alerts) {
    const at = timeOf(a.raisedAt);
    if (!(at >= since)) continue;
    const dev = src.devices.find((d) => alertOfDevice(d, a));
    const t = a.eventType.toLowerCase();
    const icon: TelemetryEvent['icon'] = t.includes('batter') ? 'battery' : t.includes('reading') || t.includes('temp') ? 'temp' : 'warn';
    out.push({
      at,
      assetId: dev?.deviceId ?? '',
      assetName: a.assetName,
      deviceId: a.deviceId ?? dev?.deviceId ?? '—',
      icon,
      event: a.eventType,
      reading: a.message || (a.status ? `Status: ${a.status}` : ''),
      severity: sevOf(a.severity),
      configurable: !!dev && assets.some((x) => x.id === dev.deviceId),
    });
  }
  return out.sort((x, y) => y.at - x.at).slice(0, 100);
}

/**
 * One metric of a device over a range, oldest first: readings averaged into RANGE_SPEC steps
 * (mins are minutes before `now`; null where the device reported nothing).
 */
export function seriesFor(readings: TelemetryReadingDto[], metric: Metric, range: Range, now: Date): Series {
  const spec = RANGE_SPEC[range];
  const n = Math.ceil(spec.mins / spec.step);
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  const t = now.getTime();
  for (const r of readings) {
    if (paramKind(r.parameter) !== metric) continue;
    const ago = (t - timeOf(r.recordedAt)) / 60000;
    if (!(ago >= 0 && ago < spec.mins)) continue;
    // bucket 0 is the oldest
    const i = n - 1 - Math.floor(ago / spec.step);
    sums[i] += Number(r.value);
    counts[i]++;
  }
  const mins: number[] = [];
  const values: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    mins.push((n - 1 - i) * spec.step + spec.step / 2);
    values.push(counts[i] ? Math.round((sums[i] / counts[i]) * 10) / 10 : null);
  }
  return { metric, mins, values };
}
