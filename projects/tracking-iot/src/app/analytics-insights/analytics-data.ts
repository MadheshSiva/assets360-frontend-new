/**
 * DEMO MODE: IoT fleet for Analytics & Insights. Devices are generated once from a fixed seed (same fleet on every
 * load); daily site metrics are derived from a hash of site + date, so any filter or date range gives stable,
 * consistent figures. Every KPI, chart and table on the page is aggregated from these.
 */

export type Tech = 'BLE' | 'GPS' | 'RFID' | 'LoRaWAN';
export type Health = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
export type Conn = 'Online' | 'Warning' | 'Offline';
export type Param = 'temperature' | 'vibration' | 'energy';

export interface Site {
  name: string;
  code: string;
  gateways: number;
  /** Uptime % / location coverage % today; earlier days trend slightly lower. */
  uptime: number;
  coverage: number;
  /** Alert volume relative to the fleet average. */
  alertFactor: number;
  /** Device counts by health and by current connectivity. */
  health: Record<Health, number>;
  conn: { warning: number; offline: number };
  telemetryOffset: number;
}

export interface IotDevice {
  id: string;
  site: string;
  gateway: string;
  assetType: string;
  assetTag: string;
  tech: Tech;
  health: Health;
  status: Conn;
  /** Battery %, or null for mains-powered trackers. */
  battery: number | null;
  eventsPerDay: number;
  /** Location changes per day. */
  moveRate: number;
  /** mm/s RMS, or null when the asset has no vibration sensor. */
  vibration: number | null;
  lastSeen: string;
}

export interface Filters {
  site: string;
  from: string;
  to: string;
  assetType: string;
  tech: string;
}

export const SITES: Site[] = [
  { name: 'Dubai Plant', code: 'DXB', gateways: 4, uptime: 99.4, coverage: 97.4, alertFactor: 1.18, health: { Healthy: 492, Warning: 92, Critical: 44, Unknown: 14 }, conn: { warning: 50, offline: 30 }, telemetryOffset: 2.4 },
  { name: 'Abu Dhabi DC', code: 'AUH', gateways: 3, uptime: 98.2, coverage: 92.9, alertFactor: 1.0, health: { Healthy: 392, Warning: 66, Critical: 30, Unknown: 10 }, conn: { warning: 36, offline: 20 }, telemetryOffset: 0.6 },
  { name: 'Sharjah Warehouse', code: 'SHJ', gateways: 3, uptime: 96.9, coverage: 90.6, alertFactor: 1.12, health: { Healthy: 286, Warning: 56, Critical: 26, Unknown: 8 }, conn: { warning: 32, offline: 18 }, telemetryOffset: -1.2 },
  { name: 'Al Ain Depot', code: 'AAN', gateways: 2, uptime: 99.0, coverage: 93.8, alertFactor: 0.78, health: { Healthy: 316, Warning: 47, Critical: 18, Unknown: 7 }, conn: { warning: 24, offline: 10 }, telemetryOffset: -2.0 },
];

export const ASSET_TYPES = ['Generators', 'Vehicles', 'Pumps & Motors', 'HVAC', 'IT Equipment', 'Tools & Equipment'];
export const TECHS: Tech[] = ['BLE', 'GPS', 'RFID', 'LoRaWAN'];
export const HEALTHS: Health[] = ['Healthy', 'Warning', 'Critical', 'Unknown'];
export const ALERT_CATEGORIES = ['Low battery', 'Offline', 'Threshold breach', 'Geofence entry'] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
/** Alerts per device per day, by category. */
const ALERT_RATES: Record<AlertCategory, number> = { 'Low battery': 0.006, Offline: 0.00375, 'Threshold breach': 0.00224, 'Geofence entry': 0.00133 };
export const VIBRATION_BASELINE = 6.3;

const TYPE_META: Record<string, { weight: number; prefix: string; tech: [Tech, number][]; move: number; temp: number | null; vibration: boolean; energy: number }> = {
  Generators: { weight: 8, prefix: 'GEN', tech: [['LoRaWAN', 6], ['GPS', 4]], move: 0.4, temp: 62, vibration: true, energy: 28 },
  Vehicles: { weight: 18, prefix: 'VEH', tech: [['GPS', 10]], move: 6, temp: 55, vibration: false, energy: 0 },
  'Pumps & Motors': { weight: 16, prefix: 'PMP', tech: [['LoRaWAN', 6], ['BLE', 4]], move: 0.3, temp: 51, vibration: true, energy: 18 },
  HVAC: { weight: 22, prefix: 'HVAC', tech: [['LoRaWAN', 5], ['BLE', 5]], move: 0.2, temp: 34, vibration: true, energy: 14 },
  'IT Equipment': { weight: 20, prefix: 'IT', tech: [['RFID', 6], ['BLE', 4]], move: 0.8, temp: 41, vibration: false, energy: 4 },
  'Tools & Equipment': { weight: 16, prefix: 'TL', tech: [['BLE', 6], ['RFID', 4]], move: 3, temp: null, vibration: false, energy: 0 },
};
const EVENTS: Record<Tech, number> = { GPS: 560, BLE: 300, RFID: 120, LoRaWAN: 250 };
/** BLE tags with a battery below 20%, per site. */
const LOW_BATTERY: Record<string, number> = { DXB: 7, AUH: 5, SHJ: 4, AAN: 2 };
/** Pumps with vibration above baseline, per site. */
const HIGH_VIBRATION: Record<string, number> = { DXB: 2, SHJ: 1 };

function mulberry32(seed: number): () => number {
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

/** Deterministic noise in [-1, 1] for a key. */
function noise(key: string): number {
  return mulberry32(hash(key))() * 2 - 1;
}

function pick<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((t, [, w]) => t + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const NOW = new Date();
export const TODAY = isoOf(NOW);

function buildDevices(): IotDevice[] {
  const rng = mulberry32(20261026);
  const out: IotDevice[] = [];
  let n = 1000;
  for (const site of SITES) {
    const health: Health[] = HEALTHS.flatMap((h) => Array<Health>(site.health[h]).fill(h));
    for (let i = health.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [health[i], health[j]] = [health[j], health[i]];
    }
    const list = health.map((h, i) => {
      const assetType = pick(rng, ASSET_TYPES.map((t) => [t, TYPE_META[t].weight] as [string, number]));
      const meta = TYPE_META[assetType];
      const tech = pick(rng, meta.tech);
      n++;
      return {
        id: `DEV-${n}`,
        site: site.name,
        gateway: `GW-${site.code}-0${1 + (i % site.gateways)}`,
        assetType,
        assetTag: `${meta.prefix}-${String(10000 + Math.floor(rng() * 90000))}`,
        tech,
        health: h,
        status: 'Online' as Conn,
        battery: tech === 'GPS' ? null : Math.round(25 + rng() * 75),
        eventsPerDay: Math.round(EVENTS[tech] * (0.8 + rng() * 0.4)),
        moveRate: meta.move * (0.6 + rng() * 0.8),
        vibration: meta.vibration ? Math.round((2.4 + rng() * 3.2) * 10) / 10 : null,
        lastSeen: '',
      };
    });
    // current connectivity: offline first from unknown, then critical; warnings from remaining critical, then warning
    const byPriority = (hs: Health[]) => list.filter((d) => d.status === 'Online' && hs.includes(d.health));
    for (const d of [...byPriority(['Unknown']), ...byPriority(['Critical'])].slice(0, site.conn.offline)) d.status = 'Offline';
    for (const d of [...byPriority(['Critical']), ...byPriority(['Warning'])].slice(0, site.conn.warning)) d.status = 'Warning';
    // the Dubai offline cluster sits on one gateway
    if (site.code === 'DXB') list.filter((d) => d.status === 'Offline').forEach((d, i) => i % 5 < 3 && (d.gateway = 'GW-DXB-02'));
    // low-battery BLE tags and high-vibration pumps
    list.filter((d) => d.tech === 'BLE').slice(0, LOW_BATTERY[site.code] ?? 0).forEach((d) => (d.battery = 5 + Math.floor(rng() * 14)));
    list.filter((d) => d.assetType === 'Pumps & Motors' && d.vibration !== null).slice(0, HIGH_VIBRATION[site.code] ?? 0)
      .forEach((d) => (d.vibration = Math.round((7.1 + rng() * 1.4) * 10) / 10));
    for (const d of list) {
      const mins = d.status === 'Online' ? Math.floor(rng() * 10) : d.status === 'Warning' ? 20 + Math.floor(rng() * 200) : 300 + Math.floor(rng() * 4000);
      const t = new Date(NOW.getTime() - mins * 60_000);
      d.lastSeen = `${isoOf(t)} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
    out.push(...list);
  }
  return out;
}

export const DEVICES: IotDevice[] = buildDevices();

// ===================== Aggregation =====================

export interface Analytics {
  days: string[];
  devices: IotDevice[];
  kpi: { uptime: number; uptimeDelta: number; coverage: number; coverageDelta: number; events: number; eventsDelta: number; resolution: number; resolutionDelta: number };
  connectivity: { online: number[]; warning: number[]; offline: number[]; now: Record<Conn, number> };
  /** [2-hour bucket 0..11][weekday Mon..Sun] location changes. */
  heat: number[][];
  telemetry: Record<Param, number[]>;
  telemetryAvg: Record<Param, number>;
  health: Record<Health, number>;
  alerts: { category: AlertCategory; count: number }[];
  sites: { name: string; uptime: number; devices: number; alerts: number; coverage: number }[];
  offlineRise: { site: string; pct: number; gateway: string; devices: IotDevice[] } | null;
  lowBattery: IotDevice[];
  highVibration: IotDevice[];
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00');
  const end = new Date(to + 'T00:00');
  while (d <= end && out.length < 400) {
    out.push(isoOf(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.round((new Date(TODAY + 'T00:00').getTime() - new Date(iso + 'T00:00').getTime()) / 86_400_000));
}

const WEEKDAY_FACTOR = [0.35, 1, 1.05, 1.1, 1.08, 1, 0.55]; // Sun..Sat
/** Share of a day's movements in each 2-hour bucket (00-02 .. 22-24). */
const BUCKET_SHARE = [0.01, 0.01, 0.02, 0.07, 0.13, 0.15, 0.16, 0.15, 0.13, 0.09, 0.05, 0.03];

interface SiteDay {
  uptime: number;
  coverage: number;
  eventsFactor: number;
  offlineFactor: number;
  warningFactor: number;
  alertFactor: number;
  resolution: number;
  tempNoise: number;
}

function siteDay(site: Site, iso: string): SiteDay {
  const ago = daysAgo(iso);
  const k = site.code + iso;
  const weekday = new Date(iso + 'T00:00').getDay();
  return {
    uptime: Math.min(99.95, site.uptime - Math.min(ago, 120) * 0.035 + noise(k + 'u') * 0.35),
    coverage: Math.min(99.5, site.coverage - Math.min(ago, 90) * 0.11 + noise(k + 'c') * 0.6),
    eventsFactor: (1 - Math.min(ago, 120) * 0.0027) * (weekday === 0 || weekday === 6 ? 0.9 : 1) * (1 + noise(k + 'e') * 0.04),
    // Dubai's offline events rose over the last 30 days
    offlineFactor: (site.code === 'DXB' && ago >= 30 ? 0.89 : 1) * (1 + noise(k + 'o') * 0.3),
    warningFactor: 1 + noise(k + 'w') * 0.2,
    alertFactor: site.alertFactor * (1 + noise(k + 'a') * 0.25),
    resolution: Math.min(0.99, 0.945 - Math.min(ago, 120) * 0.0014 + noise(k + 'r') * 0.01),
    tempNoise: noise(k + 't'),
  };
}

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

export function analyze(f: Filters): Analytics {
  const devices = DEVICES.filter((d) => (!f.site || d.site === f.site) && (!f.assetType || d.assetType === f.assetType) && (!f.tech || d.tech === f.tech));
  const days = daysBetween(f.from, f.to);
  const len = days.length;
  const prevTo = new Date(f.from + 'T00:00');
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (len - 1));
  const prevDays = daysBetween(isoOf(prevFrom), isoOf(prevTo));
  const sites = SITES.filter((s) => !f.site || s.name === f.site);
  const ofSite = new Map(sites.map((s) => [s.name, devices.filter((d) => d.site === s.name)]));
  const total = devices.length;

  // ---- per-site, per-period helpers ----
  const avgOver = (ds: string[], fn: (s: Site, sd: SiteDay) => number, weight = (s: Site) => ofSite.get(s.name)!.length) => {
    const w = sum(sites.map(weight));
    if (!w || !ds.length) return 0;
    return sum(sites.map((s) => (weight(s) * sum(ds.map((d) => fn(s, siteDay(s, d))))) / ds.length)) / w;
  };
  const eventsOver = (ds: string[]) => sum(sites.map((s) => sum(ofSite.get(s.name)!.map((d) => d.eventsPerDay)) * sum(ds.map((d) => siteDay(s, d).eventsFactor))));
  const alertsOver = (ds: string[], s: Site, cat: AlertCategory) => {
    const n = ofSite.get(s.name)!.length;
    const extra = cat === 'Offline' ? (sd: SiteDay) => sd.offlineFactor : () => 1;
    return sum(ds.map((d) => { const sd = siteDay(s, d); return n * ALERT_RATES[cat] * sd.alertFactor * extra(sd); }));
  };
  const resolutionOver = (ds: string[]) => {
    const alerts = sites.map((s) => sum(ALERT_CATEGORIES.map((c) => alertsOver(ds, s, c))));
    const w = sum(alerts);
    return w ? sum(sites.map((s, i) => alerts[i] * (sum(ds.map((d) => siteDay(s, d).resolution)) / ds.length))) / w : 0;
  };

  const uptime = avgOver(days, (_s, sd) => sd.uptime);
  const coverage = avgOver(days, (_s, sd) => sd.coverage);
  const events = eventsOver(days);
  const resolution = resolutionOver(days) * 100;
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const kpi = {
    uptime, uptimeDelta: uptime - avgOver(prevDays, (_s, sd) => sd.uptime),
    coverage, coverageDelta: coverage - avgOver(prevDays, (_s, sd) => sd.coverage),
    events, eventsDelta: pct(events, eventsOver(prevDays)),
    resolution, resolutionDelta: resolution - resolutionOver(prevDays) * 100,
  };

  // ---- connectivity: daily counts, the last day equals the current state ----
  const now: Record<Conn, number> = { Online: 0, Warning: 0, Offline: 0 };
  for (const d of devices) now[d.status]++;
  const online: number[] = [], warning: number[] = [], offline: number[] = [];
  days.forEach((iso, i) => {
    let w = 0, o = 0;
    for (const s of sites) {
      const list = ofSite.get(s.name)!;
      const sd = siteDay(s, iso);
      w += list.filter((d) => d.status === 'Warning').length * sd.warningFactor;
      o += list.filter((d) => d.status === 'Offline').length * sd.offlineFactor;
    }
    const last = i === days.length - 1 && iso === TODAY;
    const wi = last ? now.Warning : Math.round(w);
    const oi = last ? now.Offline : Math.round(o);
    warning.push(wi);
    offline.push(oi);
    online.push(Math.max(0, total - wi - oi));
  });

  // ---- movement heatmap ----
  const heat = BUCKET_SHARE.map(() => [0, 0, 0, 0, 0, 0, 0]);
  for (const s of sites) {
    const moves = sum(ofSite.get(s.name)!.map((d) => d.moveRate));
    for (const iso of days) {
      const wd = new Date(iso + 'T00:00').getDay();
      const col = (wd + 6) % 7; // Mon = 0
      const dayMoves = moves * WEEKDAY_FACTOR[wd] * (1 + noise(s.code + iso + 'm') * 0.15);
      BUCKET_SHARE.forEach((share, b) => (heat[b][col] += dayMoves * share * (1 + noise(s.code + iso + 'b' + b) * 0.2)));
    }
  }
  heat.forEach((row) => row.forEach((v, i) => (row[i] = Math.round(v))));

  // ---- telemetry (fleet daily averages for sensor-equipped devices) ----
  const sensed = devices.filter((d) => TYPE_META[d.assetType].temp !== null);
  const baseTemp = sensed.length ? sum(sensed.map((d) => TYPE_META[d.assetType].temp!)) / sensed.length : 0;
  const vib = devices.filter((d) => d.vibration !== null);
  const baseVib = vib.length ? sum(vib.map((d) => d.vibration!)) / vib.length : 0;
  const powered = devices.filter((d) => TYPE_META[d.assetType].energy > 0);
  const baseEnergy = powered.length ? sum(powered.map((d) => TYPE_META[d.assetType].energy)) / powered.length : 0;
  const siteOffset = sites.length ? sum(sites.map((s) => s.telemetryOffset * ofSite.get(s.name)!.length)) / Math.max(1, total) : 0;
  const telemetry: Record<Param, number[]> = { temperature: [], vibration: [], energy: [] };
  days.forEach((iso, i) => {
    const trend = Math.max(0, i - len * 0.8) / Math.max(1, len * 0.2); // warmer last fifth of the range
    const n1 = sites.length ? sum(sites.map((s) => siteDay(s, iso).tempNoise)) / sites.length : 0;
    const n2 = noise(iso + (f.site || 'all') + 'v');
    const n3 = noise(iso + (f.site || 'all') + 'en');
    telemetry.temperature.push(sensed.length ? Math.round((baseTemp - 6 + siteOffset + n1 * 3 + trend * 9) * 10) / 10 : 0);
    telemetry.vibration.push(vib.length ? Math.round((baseVib + n2 * 0.5 + trend * 0.6) * 10) / 10 : 0);
    telemetry.energy.push(powered.length ? Math.round((baseEnergy * 0.75 + n3 * 1.6) * 10) / 10 : 0);
  });
  const mean = (xs: number[]) => (xs.length ? Math.round((sum(xs) / xs.length) * 10) / 10 : 0);
  const telemetryAvg = { temperature: mean(telemetry.temperature), vibration: mean(telemetry.vibration), energy: mean(telemetry.energy) };

  // ---- health, alerts, sites ----
  const health: Record<Health, number> = { Healthy: 0, Warning: 0, Critical: 0, Unknown: 0 };
  for (const d of devices) health[d.health]++;
  const alerts = ALERT_CATEGORIES.map((category) => ({ category, count: Math.round(sum(sites.map((s) => alertsOver(days, s, category)))) }));
  const siteRows = sites.map((s) => {
    const n = ofSite.get(s.name)!.length;
    return {
      name: s.name,
      devices: n,
      uptime: n && len ? sum(days.map((d) => siteDay(s, d).uptime)) / len : 0,
      coverage: n && len ? sum(days.map((d) => siteDay(s, d).coverage)) / len : 0,
      alerts: Math.round(sum(ALERT_CATEGORIES.map((c) => alertsOver(days, s, c)))),
    };
  });

  // ---- insights ----
  let offlineRise: Analytics['offlineRise'] = null;
  for (const s of sites) {
    const cur = alertsOver(days, s, 'Offline');
    const prev = alertsOver(prevDays, s, 'Offline');
    const rise = prev ? ((cur - prev) / prev) * 100 : 0;
    if (rise >= 5 && (!offlineRise || rise > offlineRise.pct)) {
      const off = ofSite.get(s.name)!.filter((d) => d.status === 'Offline');
      const gws = new Map<string, number>();
      for (const d of off) gws.set(d.gateway, (gws.get(d.gateway) ?? 0) + 1);
      const gateway = [...gws.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      offlineRise = { site: s.name, pct: Math.round(rise), gateway, devices: off };
    }
  }
  const lowBattery = devices.filter((d) => d.battery !== null && d.battery < 20).sort((a, b) => a.battery! - b.battery!);
  const highVibration = devices.filter((d) => d.vibration !== null && d.vibration > VIBRATION_BASELINE && d.assetType === 'Pumps & Motors');

  return { days, devices, kpi, connectivity: { online, warning, offline, now }, heat, telemetry, telemetryAvg, health, alerts, sites: siteRows, offlineRise, lowBattery, highVibration };
}
