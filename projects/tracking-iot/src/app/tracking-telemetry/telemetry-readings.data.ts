/**
 * Static demo telemetry: readings are generated on request from fixed series (one per demo sensor plus device battery
 * and signal diagnostics). Values are deterministic per series and timestamp, so the same moment always reads the
 * same value, and new readings appear as time passes. Also builds the IoT events timeline.
 */
import { IOT_ALERTS } from '../geofence-alerts/iot-alerts.data';
import { DEVICE_RSSI, IOT_DEVICES, LAST_SEEN_MIN } from '../device-management/iot-devices.data';
import { LOCATION_EVENTS } from '../real-time-location/location-events.data';
import { SENSORS } from '../sensor-management/sensors.data';
import { hashOf, seeded } from '../shared/tracking-api';
import type { IotEventsTimelineDto, IotEventsTimelinePointDto, TelemetryQuery, TelemetryReadingDto } from './telemetry-api';

interface Series {
  key: string;
  deviceId: string;
  sensorId: string | null;
  parameter: string;
  unit: string | null;
  base: number;
  /** Daily swing amplitude. */
  amp: number;
  /** Random noise amplitude. */
  noise: number;
  /** Change per day going back in time (positive = value was lower before). */
  trendPerDay: number;
  decimals: number;
  min: number;
  max: number;
  /** Energy-like series follow working hours. */
  shift: boolean;
}

const MIN = 60_000;
const DAY = 86_400_000;

function seriesList(): Series[] {
  const out: Series[] = [];
  for (const s of SENSORS) {
    if (s.liveReading === null || s.status === 'Inactive' || !s.deviceId) continue;
    const p = s.measuredParameter;
    const v = s.liveReading;
    const cold = v < 0;
    const spec: Partial<Series> =
      p === 'Temperature' ? { amp: cold ? 0.7 : Math.max(0.6, Math.abs(v) * 0.05), noise: cold ? 0.35 : 0.4, decimals: 1, min: -40, max: 120 }
        : p === 'Humidity' ? { amp: 4, noise: 1.5, decimals: 1, min: 5, max: 100 }
          : p === 'Vibration' ? { amp: v * 0.12, noise: v * 0.08, decimals: 2, min: 0.2, max: 25 }
            : p === 'Energy' ? { amp: v * 0.15, noise: v * 0.06, decimals: 1, min: 0, max: 500, shift: true }
              : { amp: v * 0.1, noise: v * 0.05, decimals: 0, min: 0, max: 1000, shift: true };
    out.push({
      key: s.sensorId, deviceId: s.deviceId, sensorId: s.sensorId, parameter: p, unit: s.unit, base: v,
      amp: spec.amp!, noise: spec.noise!, decimals: spec.decimals!, min: spec.min!, max: spec.max!, shift: !!spec.shift,
      // Pump P-14 has been deteriorating; Compressor AC-03 slowly too
      trendPerDay: s.sensorId === 'SEN-V-40311' ? 0.32 : s.sensorId === 'SEN-V-40321' ? 0.12 : 0,
    });
  }
  for (const d of IOT_DEVICES) {
    if (d.batteryLevel !== null && !/external/i.test(d.powerSource)) {
      out.push({ key: `${d.deviceId}:bat`, deviceId: d.deviceId, sensorId: null, parameter: 'Battery', unit: '%', base: d.batteryLevel, amp: 0, noise: 0.3, trendPerDay: -0.25, decimals: 0, min: 0, max: 100, shift: false });
    }
    if (/ble|cellular|lte/i.test(d.connectivity) && d.deviceType !== 'Gateway') {
      out.push({ key: `${d.deviceId}:rssi`, deviceId: d.deviceId, sensorId: null, parameter: 'RSSI', unit: 'dBm', base: DEVICE_RSSI[d.deviceId] ?? -75, amp: 3, noise: 4, trendPerDay: 0, decimals: 0, min: -120, max: -30, shift: false });
    }
  }
  return out;
}

let SERIES: Series[] | null = null;
function allSeries(): Series[] {
  return (SERIES ??= seriesList());
}

function valueAt(s: Series, t: number, now: number): number {
  const h = hashOf(s.key);
  const phase = (h % 1000) / 1000;
  const dayFrac = (((t + 5.5 * 3_600_000) % DAY) / DAY + phase * 0.1) % 1;
  const daysAgo = (now - t) / DAY;
  const wave = s.shift ? (dayFrac > 0.25 && dayFrac < 0.92 ? 0.6 : -1.2) : Math.sin(2 * Math.PI * (dayFrac + phase));
  const noise = (seeded(`${s.key}|${Math.floor(t / (5 * MIN))}`) - 0.5) * 2;
  let v = s.base - s.trendPerDay * daysAgo + s.amp * wave + s.noise * noise;
  // short excursions on a few series (door openings, load spikes) a couple of times per day
  if (seeded(`${s.key}|x|${Math.floor(t / (40 * MIN))}`) > 0.965) v += s.amp * 2.5;
  v = Math.min(s.max, Math.max(s.min, v));
  const f = 10 ** s.decimals;
  return Math.round(v * f) / f;
}

/** Readings matching the query, newest first (spaced so `limit` readings cover the whole window). */
export function generateReadings(q: TelemetryQuery = {}): TelemetryReadingDto[] {
  const now = Date.now();
  const days = Math.min(365, Math.max(1, q.days ?? 7));
  const limit = Math.min(5000, Math.max(1, q.limit ?? 500));
  const series = allSeries().filter((s) => (!q.deviceId || s.deviceId === q.deviceId) && (!q.sensorId || s.sensorId === q.sensorId));
  if (!series.length) return [];
  const per = Math.max(1, Math.floor(limit / series.length));
  const step = Math.max(5 * MIN, Math.ceil((days * DAY) / per / (5 * MIN)) * 5 * MIN);
  const from = now - days * DAY;
  const assetOf = new Map(IOT_DEVICES.map((d) => [d.deviceId, d.assetRegistrationId]));
  const out: TelemetryReadingDto[] = [];
  for (let t = Math.floor(now / step) * step; t > from && out.length < limit; t -= step) {
    for (const s of series) {
      const silentMin = LAST_SEEN_MIN[s.deviceId] ?? 0;
      if (t > now - silentMin * MIN) continue;
      const at = new Date(t).toISOString();
      const id = `${s.key}@${t}`;
      out.push({
        id, readingId: `RD-${(hashOf(id) % 100_000_000).toString().padStart(8, '0')}`, recordedAt: at, deviceId: s.deviceId, sensorId: s.sensorId,
        assetRegistrationId: assetOf.get(s.deviceId) ?? null, parameter: s.parameter, value: valueAt(s, t, now), unit: s.unit, createdAt: at,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Daily counts of telemetry messages, location updates, geofence events and alerts for the last `days` UTC days. */
export function eventsTimeline(days: number): IotEventsTimelineDto {
  const d = Math.min(365, Math.max(1, days));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = today.getTime() - (d - 1) * DAY;
  const perDayTelemetry = allSeries().reduce((n, s) => n + (s.sensorId ? 1440 / 10 : 24), 0);
  const trackers = IOT_DEVICES.filter((x) => /ble beacon|tracker/i.test(x.deviceType)).length;
  const points: IotEventsTimelinePointDto[] = [];
  for (let t = start; t <= today.getTime(); t += DAY) {
    const key = dayKey(t);
    const r = (k: string) => seeded(`${key}|${k}`);
    const weekend = [0, 6].includes(new Date(t).getUTCDay());
    const fraction = t === today.getTime() ? Math.min(1, (Date.now() - t) / DAY) : 1;
    const geo = LOCATION_EVENTS.filter((e) => e.eventTime.startsWith(key)).length;
    points.push({
      date: key,
      telemetryData: Math.round(perDayTelemetry * (0.93 + r('t') * 0.07) * fraction),
      locationUpdates: Math.round(trackers * 1440 * (weekend ? 0.45 : 0.8 + r('l') * 0.2) * fraction),
      geofenceEvents: geo || Math.round((weekend ? 4 : 9 + r('g') * 8) * fraction),
      alerts: IOT_ALERTS.filter((a) => a.raisedAt.startsWith(key)).length,
    });
  }
  const totals = points.reduce<IotEventsTimelinePointDto>(
    (s, p) => ({ date: 'total', telemetryData: s.telemetryData + p.telemetryData, locationUpdates: s.locationUpdates + p.locationUpdates, geofenceEvents: s.geofenceEvents + p.geofenceEvents, alerts: s.alerts + p.alerts }),
    { date: 'total', telemetryData: 0, locationUpdates: 0, geofenceEvents: 0, alerts: 0 },
  );
  return { days: d, from: new Date(start).toISOString(), to: new Date().toISOString(), totals, points };
}
