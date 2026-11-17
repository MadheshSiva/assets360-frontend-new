/**
 * IoT fleet analytics for Analytics & Insights. Every KPI, chart and table is aggregated from the Tracking API
 * records (IoT devices, device health, asset utilization, IoT alerts, telemetry readings, location events and the
 * IoT events timeline). Figures the API cannot supply are null and shown as '—'.
 */
import { IotAlertDto, IotDeviceDto, LocationEventDto, TelemetryReadingDto, paramKind, timeOf } from '../tracking-telemetry/telemetry-api';
import { alertOfDevice, deviceStatus, lastSeenOf, matchesDevice } from '../tracking-telemetry/telemetry-data';
import { AnalyticsSource } from './analytics-api';

export type Tech = string;
export type Health = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
export type Conn = 'Online' | 'Warning' | 'Offline';
export type Param = 'temperature' | 'vibration' | 'energy';

export interface IotDevice {
  id: string;
  site: string;
  gateway: string;
  assetType: string;
  assetTag: string;
  tech: Tech;
  health: Health;
  status: Conn;
  /** Battery %, or null for mains-powered / unreported devices. */
  battery: number | null;
  /** Latest vibration reading (mm/s), or null when the device reports none. */
  vibration: number | null;
  lastSeen: string;
  /** Source record, for matching alerts and location events. */
  dto: IotDeviceDto;
}

export interface Filters {
  site: string;
  from: string;
  to: string;
  assetType: string;
  tech: string;
}

export const HEALTHS: Health[] = ['Healthy', 'Warning', 'Critical', 'Unknown'];
/** Asset type of devices that no utilization record links to an asset type. */
export const UNKNOWN_TYPE = 'Unassigned';
/** mm/s RMS vibration level above which pumps & motors are flagged (ISO 10816 zone C boundary for medium machines). */
export const VIBRATION_BASELINE = 6.3;
/** Battery % below which tags are flagged for replacement. */
export const LOW_BATTERY = 20;

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const TODAY = isoOf(new Date());

/** Local calendar day (yyyy-MM-dd) of an API timestamp; '' when missing. */
function dayOf(iso: string | null | undefined): string {
  const t = timeOf(iso);
  return Number.isFinite(t) ? isoOf(new Date(t)) : '';
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00');
  const end = new Date(to + 'T00:00');
  while (d <= end && out.length < 400) {
    out.push(isoOf(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** "BLE 5.0" → BLE, "LoRaWAN EU868" → LoRaWAN, ...; other connectivities are kept as they are. */
function techOf(connectivity: string): Tech {
  const c = connectivity.toLowerCase();
  if (c.includes('lora')) return 'LoRaWAN';
  if (c.includes('ble') || c.includes('bluetooth')) return 'BLE';
  if (c.includes('gps') || c.includes('gnss')) return 'GPS';
  if (c.includes('rfid')) return 'RFID';
  return connectivity.trim() || 'Unknown';
}

function healthOf(text: string | null | undefined): Health {
  if (!text) return 'Unknown';
  if (/critical/i.test(text)) return 'Critical';
  if (/warning|attention|maintenance/i.test(text)) return 'Warning';
  if (/good|healthy/i.test(text)) return 'Healthy';
  return 'Unknown';
}

function fmtSeen(ms: number): string {
  if (!Number.isFinite(ms)) return 'Never';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${isoOf(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Maps the API devices to the analytics device model (once per load, not per filter change). */
export function buildDevices(src: AnalyticsSource, now: number): IotDevice[] {
  const healthBy = new Map(src.health.map((h) => [h.deviceId, h]));
  const typeByDevice = new Map<string, string>();
  const typeByAsset = new Map<string, string>();
  for (const u of src.utilization) {
    if (u.deviceId && !typeByDevice.has(u.deviceId)) typeByDevice.set(u.deviceId, u.assetType);
    if (u.assetRegistrationId && !typeByAsset.has(u.assetRegistrationId)) typeByAsset.set(u.assetRegistrationId, u.assetType);
  }
  const latest = new Map<string, TelemetryReadingDto>();
  const latestVib = new Map<string, number>();
  for (const r of src.readings) {
    if (!latest.has(r.deviceId)) latest.set(r.deviceId, r);
    if (!latestVib.has(r.deviceId) && paramKind(r.parameter) === 'vib') latestVib.set(r.deviceId, Number(r.value));
  }
  return src.devices.map((d) => {
    const h = healthBy.get(d.deviceId);
    const seen = lastSeenOf(d, h, latest.get(d.deviceId));
    const st = deviceStatus(h, seen, now);
    return {
      id: d.deviceId,
      site: d.siteName || h?.siteName || '',
      gateway: d.gateway || h?.gateway || '—',
      assetType: typeByDevice.get(d.deviceId) ?? (d.assetRegistrationId ? typeByAsset.get(d.assetRegistrationId) : undefined) ?? UNKNOWN_TYPE,
      assetTag: d.assetCode || d.assetName || d.assetRegistrationId || '—',
      tech: techOf(d.connectivity || ''),
      health: healthOf(h?.health ?? d.health),
      status: st === 'online' ? 'Online' : st === 'warning' ? 'Warning' : 'Offline',
      battery: h?.batteryLevel ?? d.batteryLevel ?? null,
      vibration: latestVib.get(d.deviceId) ?? null,
      lastSeen: fmtSeen(seen),
      dto: d,
    };
  });
}

// ===================== Aggregation =====================

export interface Kpis {
  /** No uptime history in the API: always null. */
  uptime: number | null;
  uptimeDelta: number | null;
  coverage: number | null;
  coverageDelta: number | null;
  events: number | null;
  eventsDelta: number | null;
  resolution: number | null;
  resolutionDelta: number | null;
}

export interface Analytics {
  days: string[];
  devices: IotDevice[];
  kpi: Kpis;
  /** Daily connectivity history (empty: the API keeps only each device's current state). */
  connectivity: { online: number[]; warning: number[]; offline: number[]; now: Record<Conn, number> };
  /** [2-hour bucket 0..11][weekday Mon..Sun] location changes. */
  heat: number[][];
  /** Daily fleet average per parameter (null on days without readings). */
  telemetry: Record<Param, (number | null)[]>;
  telemetryAvg: Record<Param, number | null>;
  health: Record<Health, number>;
  alerts: { category: string; count: number }[];
  sites: { name: string; uptime: number | null; devices: number; alerts: number; coverage: number | null }[];
  offlineRise: { site: string; pct: number; gateway: string; devices: IotDevice[] } | null;
  lowBattery: IotDevice[];
  highVibration: IotDevice[];
}

/** Rows of the movement heatmap: 2-hour buckets (00-02 .. 22-24). */
const HEAT_BUCKETS = 12;
const PARAM_KIND: Record<Param, 'temp' | 'vib' | 'energy'> = { temperature: 'temp', vibration: 'vib', energy: 'energy' };
const OFFLINE_ALERT = /offline|signal lost/i;
const MOVES = ['Entered Zone', 'Departed Zone'];

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);
const diff = (cur: number | null, prev: number | null) => (cur === null || prev === null ? null : round1(cur - prev));

export function analyze(src: AnalyticsSource | null, all: IotDevice[], f: Filters): Analytics {
  const filtered = !!(f.site || f.assetType || f.tech);
  const devices = all.filter((d) => (!f.site || d.site === f.site) && (!f.assetType || d.assetType === f.assetType) && (!f.tech || d.tech === f.tech));
  const days = daysBetween(f.from, f.to);
  const len = days.length;
  const prevFrom = addDays(f.from, -len);
  const prevTo = addDays(f.from, -1);
  const inCur = (day: string) => day >= f.from && day <= f.to;
  const inPrev = (day: string) => day >= prevFrom && day <= prevTo;

  const now: Record<Conn, number> = { Online: 0, Warning: 0, Offline: 0 };
  for (const d of devices) now[d.status]++;
  const health: Record<Health, number> = { Healthy: 0, Warning: 0, Critical: 0, Unknown: 0 };
  for (const d of devices) health[d.health]++;

  const empty: Analytics = {
    days, devices,
    kpi: { uptime: null, uptimeDelta: null, coverage: null, coverageDelta: null, events: null, eventsDelta: null, resolution: null, resolutionDelta: null },
    connectivity: { online: [], warning: [], offline: [], now },
    heat: Array.from({ length: HEAT_BUCKETS }, () => [0, 0, 0, 0, 0, 0, 0]),
    telemetry: { temperature: [], vibration: [], energy: [] },
    telemetryAvg: { temperature: null, vibration: null, energy: null },
    health,
    alerts: [],
    sites: [],
    offlineRise: null,
    lowBattery: [],
    highVibration: [],
  };
  if (!src) return empty;

  const ids = new Set(devices.map((d) => d.id));
  // alerts / events / readings in scope of the device filters (everything when no filter is set)
  const alertIn = (a: IotAlertDto) => !filtered || devices.some((d) => alertOfDevice(d.dto, a)) || (!!f.site && !f.assetType && !f.tech && a.siteName === f.site);
  const eventIn = (e: LocationEventDto) => !filtered || devices.some((d) => matchesDevice(d.dto, e.assetId));
  const alerts = src.alerts.filter(alertIn);
  const events = src.locationEvents.filter(eventIn);
  const readings = filtered ? src.readings.filter((r) => ids.has(r.deviceId)) : src.readings;
  const curAlerts = alerts.filter((a) => inCur(dayOf(a.raisedAt)));
  const prevAlerts = alerts.filter((a) => inPrev(dayOf(a.raisedAt)));
  // the alert / timeline windows reach back 2 × the loaded days (capped at 365), so the previous period may be partial
  const prevComplete = src.days * 2 <= 365 || prevFrom >= addDays(TODAY, -(365 - 1));

  // ----- location coverage: linked assets with at least one location event in the period -----
  const coverageOf = (list: IotDevice[], inPeriod: (day: string) => boolean): number | null => {
    const linked = list.filter((d) => d.dto.assetCode || d.dto.assetRegistrationId);
    const fixed = linked.filter((d) => events.some((e) => matchesDevice(d.dto, e.assetId) && inPeriod(dayOf(e.eventTime))));
    const v = pct(fixed.length, linked.length);
    return v === null ? null : round1(v);
  };
  const coverage = coverageOf(devices, inCur);
  const coveragePrev = coverageOf(devices, inPrev);

  // ----- telemetry events: the timeline fleet-wide, else readings + location events of the selected devices -----
  let eventsCur: number | null;
  let eventsPrev: number | null = null;
  if (!filtered) {
    const sum = (inPeriod: (day: string) => boolean) => src.timeline.points.filter((p) => inPeriod(p.date)).reduce((n, p) => n + p.telemetryData + p.locationUpdates + p.geofenceEvents, 0);
    eventsCur = sum(inCur);
    eventsPrev = prevComplete ? sum(inPrev) : null;
  } else {
    eventsCur = readings.filter((r) => inCur(dayOf(r.recordedAt))).length + events.filter((e) => inCur(dayOf(e.eventTime))).length;
  }
  const eventsDelta = eventsCur !== null && eventsPrev ? round1(((eventsCur - eventsPrev) / eventsPrev) * 100) : null;

  // ----- alert resolution -----
  const resolution = (list: IotAlertDto[]) => {
    const v = pct(list.filter((a) => a.status === 'Resolved').length, list.length);
    return v === null ? null : round1(v);
  };
  const resCur = resolution(curAlerts);
  const resPrev = prevComplete ? resolution(prevAlerts) : null;

  // ----- movement heatmap -----
  const heat = empty.heat;
  for (const e of events) {
    if (!MOVES.includes(e.eventType)) continue;
    const t = timeOf(e.eventTime);
    if (!Number.isFinite(t) || !inCur(dayOf(e.eventTime))) continue;
    const d = new Date(t);
    heat[Math.floor(d.getHours() / 2)][(d.getDay() + 6) % 7]++;
  }

  // ----- telemetry trends -----
  const telemetry: Record<Param, (number | null)[]> = { temperature: [], vibration: [], energy: [] };
  const telemetryAvg: Record<Param, number | null> = { temperature: null, vibration: null, energy: null };
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  for (const p of Object.keys(PARAM_KIND) as Param[]) {
    const sums = new Array<number>(len).fill(0);
    const counts = new Array<number>(len).fill(0);
    let total = 0;
    let n = 0;
    for (const r of readings) {
      if (paramKind(r.parameter) !== PARAM_KIND[p]) continue;
      const i = dayIndex.get(dayOf(r.recordedAt));
      if (i === undefined) continue;
      const v = Number(r.value);
      sums[i] += v;
      counts[i]++;
      total += v;
      n++;
    }
    telemetry[p] = sums.map((s, i) => (counts[i] ? round1(s / counts[i]) : null));
    telemetryAvg[p] = n ? round1(total / n) : null;
  }

  // ----- top alert categories (event types) -----
  const byType = new Map<string, number>();
  for (const a of curAlerts) byType.set(a.eventType, (byType.get(a.eventType) ?? 0) + 1);
  const alertRows = [...byType.entries()].map(([category, count]) => ({ category, count })).sort((x, y) => y.count - x.count || x.category.localeCompare(y.category)).slice(0, 4);

  // ----- sites -----
  const siteNames = [...new Set(devices.map((d) => d.site).filter(Boolean))].sort();
  const sites = siteNames.map((name) => {
    const here = devices.filter((d) => d.site === name);
    return {
      name,
      uptime: null,
      devices: here.length,
      alerts: curAlerts.filter((a) => a.siteName === name || here.some((d) => alertOfDevice(d.dto, a))).length,
      coverage: coverageOf(here, inCur),
    };
  });

  // ----- offline rise: offline / signal-lost alerts per site vs the previous period -----
  let offlineRise: Analytics['offlineRise'] = null;
  if (prevComplete) {
    for (const name of siteNames) {
      const here = devices.filter((d) => d.site === name);
      const ofSite = (a: IotAlertDto) => OFFLINE_ALERT.test(a.eventType) && (a.siteName === name || here.some((d) => alertOfDevice(d.dto, a)));
      const cur = curAlerts.filter(ofSite);
      const prev = prevAlerts.filter(ofSite).length;
      if (!prev || cur.length <= prev) continue;
      const rise = Math.round(((cur.length - prev) / prev) * 100);
      if (offlineRise && rise <= offlineRise.pct) continue;
      const affected = here.filter((d) => d.status === 'Offline' || cur.some((a) => alertOfDevice(d.dto, a)));
      const gwCount = new Map<string, number>();
      for (const d of affected) if (d.gateway !== '—') gwCount.set(d.gateway, (gwCount.get(d.gateway) ?? 0) + 1);
      const gateway = [...gwCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—';
      offlineRise = { site: name, pct: rise, gateway, devices: affected };
    }
  }

  return {
    ...empty,
    kpi: {
      uptime: null,
      uptimeDelta: null,
      coverage,
      coverageDelta: diff(coverage, coveragePrev),
      events: eventsCur,
      eventsDelta,
      resolution: resCur,
      resolutionDelta: diff(resCur, resPrev),
    },
    heat,
    telemetry,
    telemetryAvg,
    alerts: alertRows,
    sites,
    offlineRise,
    lowBattery: devices.filter((d) => d.battery !== null && d.battery < LOW_BATTERY).sort((a, b) => a.battery! - b.battery!),
    highVibration: devices.filter((d) => d.vibration !== null && d.vibration > VIBRATION_BASELINE && /pump|motor/i.test(d.assetType)),
  };
}
