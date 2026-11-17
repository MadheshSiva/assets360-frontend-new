/**
 * Sensor registry for Tracking & IoT → Sensor Management. Filled from the Tracking API (/api/sensors) on page load;
 * add / edit / calibrate / delete go to the API and update these lists in place. A sensor is one measurement point: it
 * reads one parameter, comes in through one channel of an IoT device, and is mapped to a point on an asset.
 */

/** e.g. Temperature Probe; the list comes from GET /api/sensors/form-options. */
export type SensorType = string;
/** One of GET /api/sensors/statuses (Active, Offline, Attention, Inactive). */
export type SensorStatus = string;

/** A sensor type option and what it measures (GET /api/sensors/types). */
export interface Parameter {
  name: string;
  unit: string;
  type: SensorType;
  /** Shown in the table, e.g. "Temperature", "Relative Humidity". */
  label: string;
  /** Sensor id prefix, e.g. SEN-T. */
  prefix: string;
  decimals: number;
}

export interface SensorEvent { at: number; text: string; by: string; level: 'info' | 'ok' | 'warn' | 'bad' }

export interface Sensor {
  id: string;
  /** Number part of the id, e.g. 80900 in SEN-T-80900. */
  number: string;
  name: string;
  type: SensorType;
  param: Parameter;
  serial: string;
  deviceId: string;
  deviceModel: string;
  channel: number | null;
  /** Asset code, e.g. CR-03. */
  assetId: string;
  assetRegId: string;
  /** Display name, e.g. Cold Room CR-03. */
  assetName: string;
  point: string;
  siteId: string;
  site: string;
  intervalSec: number | null;
  /** Alarm thresholds in the parameter's unit (null when not set). */
  low: number | null;
  high: number | null;
  /** Latest value, or null when the sensor sends no data. */
  reading: number | null;
  status: SensorStatus;
  /** Registered (createdAt). */
  installedOn: number | null;
  createdBy: string;
  updatedOn: number | null;
  updatedBy: string;
  /** Not stored by the API; only known for calibrations recorded in this session. */
  lastCal: number | null;
  calDue: number | null;
  /** Not stored by the API; only known for calibrations recorded in this session. */
  certificate: string;
  /** Readings over the last 24 hours (GET /api/telemetry-readings), loaded when the sensor is opened. */
  readings?: { at: number; v: number | null }[];
  /** Changes made on the page (newest first). */
  events: SensorEvent[];
}

const DAY = 86_400_000;
/** Reference time for reading ages and calibration countdowns (page load). */
export const NOW = Date.now();

/** Sensor types (filled from the API). */
export const PARAMETERS: Parameter[] = [];
/** Sensor statuses (filled from the API). */
export const STATUSES: SensorStatus[] = [];
/** Sampling interval options (filled from the API). */
export const INTERVALS: { seconds: number; label: string }[] = [];
/** Common measurement points per sensor type (filled from the API). */
export const POINTS_BY_TYPE: Record<string, string[]> = {};

export function paramOf(type: SensorType): Parameter | undefined {
  return PARAMETERS.find((p) => p.type === type);
}

/** Sensor id the API builds from the type prefix and number, e.g. SEN-T-80900. */
export function sensorIdOf(type: SensorType, n: number | string): string {
  return `${paramOf(type)?.prefix ?? 'SEN'}-${n}`;
}

/** In-memory sensor registry (filled from the API). */
export const SENSORS: Sensor[] = [];

/** Calibration overdue, or due within this many days, counts as "Calibration Due". */
export const CAL_WINDOW_DAYS = 30;

export function daysUntil(ms: number): number {
  return Math.round((ms - NOW) / DAY);
}

export function isOverdue(s: Sensor): boolean {
  return s.calDue !== null && s.calDue < NOW;
}

export function isCalDue(s: Sensor): boolean {
  return s.calDue !== null && daysUntil(s.calDue) <= CAL_WINDOW_DAYS;
}

/** Readings over the last 24 hours, as reported (empty until loaded). */
export function series(s: Sensor): { at: number; v: number | null }[] {
  return s.readings ?? [];
}

/** Events derived from the record plus anything changed on the page, newest first. */
export function historyOf(s: Sensor): SensorEvent[] {
  const h: SensorEvent[] = [];
  if (s.installedOn !== null) {
    h.push({ at: s.installedOn, text: `Registered on ${s.assetName || '—'} · ${s.point || '—'} (${s.deviceId}${s.channel !== null ? ` channel ${s.channel}` : ''})`, by: s.createdBy || '—', level: 'info' });
  }
  if (s.updatedOn !== null) h.push({ at: s.updatedOn, text: 'Record updated', by: s.updatedBy || '—', level: 'info' });
  if (s.calDue !== null && isOverdue(s)) h.push({ at: s.calDue, text: 'Calibration overdue', by: 'System', level: 'bad' });
  return [...s.events, ...h.sort((a, b) => b.at - a.at)];
}

/** Next free number for a type's id series (a suggestion; the API rejects duplicates). */
export function nextNumber(type: SensorType): number {
  const prefix = `${paramOf(type)?.prefix ?? 'SEN'}-`;
  const nums = SENSORS.filter((s) => s.id.startsWith(prefix)).map((s) => Number(s.id.slice(prefix.length)) || 0);
  return Math.max(0, ...nums) + 1;
}
