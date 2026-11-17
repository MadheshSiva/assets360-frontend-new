/**
 * DEMO MODE: sensor registry for Tracking & IoT → Sensor Management. Generated once from a fixed seed and kept in
 * memory for the session (add / edit / calibrate change records in place). A sensor is one measurement point: it
 * reads one parameter, comes in through one channel of an IoT device, and is mapped to a point on an asset.
 */

export type SensorType = 'Temperature Probe' | 'Vibration Sensor' | 'Humidity Sensor' | 'Pressure Transmitter' | 'Current Sensor' | 'Level Sensor';
export type SensorStatus = 'Active' | 'Attention' | 'Offline' | 'Maintenance';

export interface Parameter {
  name: string;
  unit: string;
  type: SensorType;
  /** Shown in the table, e.g. "Temperature", "Relative Humidity". */
  label: string;
  make: string;
  model: string;
  range: [number, number];
  accuracy: string;
  devicePrefix: string;
  deviceModel: string;
  decimals: number;
}

export interface SensorEvent { at: number; text: string; by: string; level: 'info' | 'ok' | 'warn' | 'bad' }

export interface Sensor {
  id: string;
  type: SensorType;
  param: Parameter;
  serial: string;
  deviceId: string;
  deviceModel: string;
  channel: number;
  /** Asset code, e.g. CR-03. */
  assetId: string;
  /** Display name, e.g. Cold Room CR-03. */
  assetName: string;
  /** Asset category used by the Asset filter, e.g. Cold Room. */
  assetKind: string;
  point: string;
  site: string;
  intervalSec: number;
  /** Alarm thresholds in the parameter's unit. */
  low: number;
  high: number;
  /** Latest value, or null when the sensor sends no data. */
  reading: number | null;
  status: SensorStatus;
  /** Minutes since the last reading. */
  lastSeenMin: number;
  installedOn: number;
  lastCal: number;
  calDue: number;
  certificate: string;
  seed: number;
  /** Changes made on the page (newest first). */
  events: SensorEvent[];
}

const DAY = 86_400_000;
/** Demo "now": readings, ages and calibration countdowns are relative to this. */
export const NOW = new Date(2026, 9, 28, 14, 32).getTime();
export const SITES = ['Dubai Plant', 'Abu Dhabi', 'Sharjah Warehouse', 'Al Ain Depot'];
export const STATUSES: SensorStatus[] = ['Active', 'Attention', 'Offline', 'Maintenance'];
const USERS = ['Sarah Ahmed', 'Michael Tan', 'Ahmed Rashid', 'Priya Nair', 'John Doe'];

export const PARAMETERS: Parameter[] = [
  { name: 'Temperature', label: 'Temperature', unit: '°C', type: 'Temperature Probe', make: 'TempSense', model: 'T300', range: [0, 50], accuracy: '±0.3 °C', devicePrefix: 'TS', deviceModel: 'TempSense T300', decimals: 1 },
  { name: 'Vibration', label: 'Vibration', unit: 'mm/s', type: 'Vibration Sensor', make: 'VibeSense', model: 'VS3', range: [0, 50], accuracy: '±5 %', devicePrefix: 'VS', deviceModel: 'VibeSense VS3', decimals: 1 },
  { name: 'Relative Humidity', label: 'Relative Humidity', unit: '%RH', type: 'Humidity Sensor', make: 'BlueLeaf', model: 'H200', range: [0, 100], accuracy: '±2 %RH', devicePrefix: 'BL', deviceModel: 'BlueLeaf H200', decimals: 1 },
  { name: 'Pressure', label: 'Pressure', unit: 'bar', type: 'Pressure Transmitter', make: 'PressTech', model: 'PT-16', range: [0, 16], accuracy: '±0.25 % FS', devicePrefix: 'IO-GW', deviceModel: 'I/O Gateway G14', decimals: 1 },
  { name: 'Current', label: 'Current', unit: 'A', type: 'Current Sensor', make: 'AmpSense', model: 'CT-200', range: [0, 200], accuracy: '±1 %', devicePrefix: 'CT', deviceModel: 'AmpSense CT-200', decimals: 0 },
  { name: 'Level', label: 'Level', unit: '%', type: 'Level Sensor', make: 'LevelPro', model: 'LR-10', range: [0, 100], accuracy: '±0.5 %', devicePrefix: 'LV', deviceModel: 'LevelPro LR-10', decimals: 0 },
];
export const TYPES: SensorType[] = PARAMETERS.map((p) => p.type);
const LETTER: Record<SensorType, string> = { 'Temperature Probe': 'T', 'Vibration Sensor': 'V', 'Humidity Sensor': 'H', 'Pressure Transmitter': 'P', 'Current Sensor': 'C', 'Level Sensor': 'L' };
const COUNTS: Record<SensorType, number> = { 'Temperature Probe': 900, 'Vibration Sensor': 520, 'Humidity Sensor': 430, 'Pressure Transmitter': 300, 'Current Sensor': 168, 'Level Sensor': 100 };
const START: Record<SensorType, number> = { 'Temperature Probe': 80000, 'Vibration Sensor': 30000, 'Humidity Sensor': 20500, 'Pressure Transmitter': 44000, 'Current Sensor': 61000, 'Level Sensor': 72000 };

/** Asset families each sensor type is fitted to: [kind, code prefix, how many, points, normal reading range]. */
type Family = [string, string, number, string[], [number, number]];
const FAMILIES: Record<SensorType, Family[]> = {
  'Temperature Probe': [
    ['Cold Room', 'CR', 12, ['Supply Air', 'Return Air', 'Evaporator'], [2, 6]],
    ['Chiller', 'CH', 30, ['Supply Water', 'Return Water'], [6, 12]],
    ['AHU', 'AHU', 20, ['Supply Air', 'Return Air'], [14, 22]],
    ['Server Room', 'SR', 6, ['Rack Inlet', 'Rack Outlet'], [19, 27]],
  ],
  'Vibration Sensor': [
    ['Pump', 'PMP', 60, ['Motor DE', 'Motor NDE', 'Pump DE'], [1, 3.5]],
    ['Motor', 'MTR', 40, ['DE Bearing', 'NDE Bearing'], [0.8, 3]],
    ['Compressor', 'CMP', 20, ['Crankcase'], [2, 4.5]],
  ],
  'Humidity Sensor': [
    ['Warehouse', 'WH', 8, ['Zone A', 'Zone B', 'Zone C', 'Zone D'], [38, 60]],
    ['Data Hall', 'DH', 3, ['Cold Aisle', 'Hot Aisle'], [40, 55]],
    ['Cold Room', 'CR', 12, ['Supply Air'], [70, 88]],
  ],
  'Pressure Transmitter': [
    ['Compressor', 'CMP', 20, ['Discharge', 'Suction', 'Oil'], [6, 9]],
    ['Pump', 'PMP', 60, ['Discharge', 'Suction'], [2, 5]],
    ['Boiler', 'BLR', 5, ['Steam Header'], [8, 10]],
  ],
  'Current Sensor': [
    ['Motor', 'MTR', 40, ['Phase L1', 'Phase L2', 'Phase L3'], [18, 70]],
    ['Generator', 'GEN', 45, ['Output L1'], [60, 160]],
  ],
  'Level Sensor': [
    ['Tank', 'TK', 30, ['Main'], [25, 92]],
    ['Fuel Tank', 'FT', 12, ['Main'], [30, 95]],
  ],
};
export const ASSET_KINDS = [...new Set(Object.values(FAMILIES).flat().map((f) => f[0]))].sort();

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paramOf(type: SensorType): Parameter {
  return PARAMETERS.find((p) => p.type === type)!;
}

export function sensorIdOf(type: SensorType, n: number): string {
  return `SEN-${LETTER[type]}-${n}`;
}

/** Every asset on one site, so all sensors of an asset share it. */
function siteOf(assetId: string): string {
  let h = 0;
  for (const c of assetId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SITES[h % SITES.length];
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function thresholds(normal: [number, number]): [number, number] {
  const span = normal[1] - normal[0];
  return [round(Math.max(0, normal[0] - span * 0.6), 1), round(normal[1] + span * 0.6, 1)];
}

function build(): Sensor[] {
  const rng = mulberry32(80214);
  const out: Sensor[] = [];
  const day = (d: number) => NOW - d * DAY;
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0).getTime();

  // rows shown in the design, first and in this order
  type Featured = Partial<Sensor> & { type: SensorType; n: number; kind: string; code: string; point: string; site: string; normal: [number, number] };
  const featured: Featured[] = [
    { type: 'Temperature Probe', n: 80214, deviceId: 'TS-80214', channel: 1, kind: 'Cold Room', code: 'CR-03', point: 'Supply Air', site: 'Dubai Plant', reading: 4.2, status: 'Active', lastSeenMin: 0, calDue: at(2026, 11, 12), lastCal: at(2025, 11, 12), serial: 'TS300-80214-7765', intervalSec: 60, normal: [2, 6] },
    { type: 'Vibration Sensor', n: 30018, deviceId: 'VS-30018', channel: 1, kind: 'Pump', code: 'PMP-118', point: 'Motor DE', site: 'Abu Dhabi', reading: null, status: 'Offline', lastSeenMin: 6 * 60 + 14, calDue: at(2026, 12, 2), lastCal: at(2025, 12, 2), serial: 'VS3-30018-1204', intervalSec: 300, normal: [1, 3.5] },
    { type: 'Humidity Sensor', n: 20951, deviceId: 'BL-20951', channel: 2, kind: 'Warehouse', code: 'WH-02', point: 'Zone A', site: 'Dubai Plant', reading: 48.6, status: 'Active', lastSeenMin: 1, calDue: at(2027, 1, 15), lastCal: at(2026, 1, 15), serial: 'H200-20951-0388', intervalSec: 120, normal: [38, 60] },
    { type: 'Pressure Transmitter', n: 44002, deviceId: 'IO-GW-14', channel: 3, kind: 'Compressor', code: 'CMP-014', point: 'Discharge', site: 'Sharjah Warehouse', reading: 7.8, status: 'Attention', lastSeenMin: 2, calDue: at(2026, 10, 9), lastCal: at(2025, 10, 9), serial: 'PT16-44002-5531', intervalSec: 30, normal: [6, 9] },
  ];
  for (const f of featured) {
    const p = paramOf(f.type);
    const [low, high] = thresholds(f.normal);
    out.push({
      id: sensorIdOf(f.type, f.n), type: f.type, param: p, serial: f.serial!, deviceId: f.deviceId!, deviceModel: p.deviceModel, channel: f.channel!,
      assetId: f.code, assetName: `${f.kind} ${f.code}`, assetKind: f.kind, point: f.point, site: f.site, intervalSec: f.intervalSec!,
      low, high, reading: f.reading ?? null, status: f.status!, lastSeenMin: f.lastSeenMin!, installedOn: day(400 + Math.floor(rng() * 300)),
      lastCal: f.lastCal!, calDue: f.calDue!, certificate: `CAL-${sensorIdOf(f.type, f.n)}-${new Date(f.lastCal!).getFullYear()}.pdf`, seed: f.n, events: [],
    });
  }

  // the rest of the fleet: 2,176 active, 130 attention, 31 offline, 81 in maintenance (2,418 in all)
  const pool: SensorStatus[] = [
    ...Array<SensorStatus>(2176 - 2).fill('Active'),
    ...Array<SensorStatus>(130 - 1).fill('Attention'),
    ...Array<SensorStatus>(31 - 1).fill('Offline'),
    ...Array<SensorStatus>(81).fill('Maintenance'),
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const taken = new Set(out.map((s) => s.id));
  let k = 0;
  let gw = 1;
  for (const type of TYPES) {
    const p = paramOf(type);
    const need = COUNTS[type] - out.filter((s) => s.type === type).length;
    let n = START[type];
    for (let c = 0; c < need; c++) {
      while (taken.has(sensorIdOf(type, n))) n++;
      const id = sensorIdOf(type, n);
      taken.add(id);
      const fams = FAMILIES[type];
      const fam = fams[Math.floor(rng() * fams.length)];
      const [kind, prefix, count, points, normal] = fam;
      const width = prefix === 'PMP' ? 3 : prefix === 'CH' || prefix === 'CMP' || prefix === 'GEN' || prefix === 'MTR' ? 3 : 2;
      const num = prefix === 'PMP' ? 100 + 1 + Math.floor(rng() * count) : 1 + Math.floor(rng() * count);
      const code = `${prefix}-${pad(num, width)}`;
      const [low, high] = thresholds(normal);
      const status = pool[k++];
      const normalValue = normal[0] + rng() * (normal[1] - normal[0]);
      const reading = status === 'Offline' || status === 'Maintenance' ? null
        : status === 'Attention' ? high + (high - low) * (0.03 + rng() * 0.15) : normalValue;
      // pressure transmitters share 8-channel I/O gateways; other sensors have their own device
      const isIo = type === 'Pressure Transmitter';
      const deviceId = isIo ? `IO-GW-${pad(gw + 14, 2)}` : `${p.devicePrefix}-${n}`;
      const channel = isIo ? (c % 8) + 1 : 1;
      if (isIo && c % 8 === 7) gw++;
      const lastCal = day(Math.floor(30 + rng() * 300));
      out.push({
        id, type, param: p, serial: `${p.model.replace('-', '')}-${n}-${pad(Math.floor(rng() * 10000), 4)}`, deviceId, deviceModel: p.deviceModel, channel,
        assetId: code, assetName: `${kind} ${code}`, assetKind: kind, point: points[Math.floor(rng() * points.length)], site: siteOf(code),
        intervalSec: [30, 60, 60, 120, 300][Math.floor(rng() * 5)], low, high,
        reading: reading === null ? null : round(reading, p.decimals), status,
        lastSeenMin: status === 'Offline' ? 90 + Math.floor(rng() * 4000) : status === 'Maintenance' ? 1440 + Math.floor(rng() * 9000) : Math.floor(rng() * 4),
        installedOn: day(380 + Math.floor(rng() * 900)), lastCal, calDue: lastCal + 365 * DAY, certificate: '', seed: n, events: [],
      });
      n++;
    }
  }

  // calibration: 8 more overdue (all flagged for attention) and 54 more due within 30 days (64 in all with the design rows)
  const rest = out.slice(featured.length);
  const pick = (list: Sensor[], count: number) => {
    const chosen: Sensor[] = [];
    while (chosen.length < count && list.length) chosen.push(list.splice(Math.floor(rng() * list.length), 1)[0]);
    return chosen;
  };
  const late = pick(rest.filter((s) => s.status === 'Attention'), 8);
  for (const s of late) {
    s.calDue = NOW - (2 + Math.floor(rng() * 40)) * DAY;
    s.reading = s.reading === null ? null : round(s.low + (s.high - s.low) * (0.3 + rng() * 0.4), s.param.decimals);
  }
  for (const s of pick(rest.filter((s) => s.status === 'Active' && s.calDue - NOW > 30 * DAY), 54)) s.calDue = NOW + (1 + Math.floor(rng() * 29)) * DAY;
  for (const s of rest) {
    s.lastCal = s.calDue - 365 * DAY;
    s.certificate = `CAL-${s.id}-${new Date(s.lastCal).getFullYear()}.pdf`;
  }
  // mix sensor types in the list (the design rows stay on top)
  for (let i = out.length - 1; i > featured.length; i--) {
    const j = featured.length + Math.floor(rng() * (i - featured.length + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const SENSORS: Sensor[] = build();

/** Calibration overdue, or due within this many days, counts as "Calibration Due". */
export const CAL_WINDOW_DAYS = 30;

export function daysUntil(ms: number): number {
  return Math.round((ms - NOW) / DAY);
}

export function isOverdue(s: Sensor): boolean {
  return s.calDue < NOW;
}

export function isCalDue(s: Sensor): boolean {
  return daysUntil(s.calDue) <= CAL_WINDOW_DAYS;
}

/** Reading every 15 minutes over the last 24 hours (null where the sensor sent nothing). */
export function series(s: Sensor): { at: number; v: number | null }[] {
  const rng = mulberry32(s.seed * 7 + 13);
  const pts: { at: number; v: number | null }[] = [];
  const end = s.reading ?? (s.low + s.high) / 2;
  const span = Math.max(0.5, (s.high - s.low) / 6);
  for (let i = 0; i <= 96; i++) {
    const minsAgo = (96 - i) * 15;
    const at = NOW - minsAgo * 60_000;
    if (s.status === 'Maintenance' || minsAgo < s.lastSeenMin) {
      pts.push({ at, v: null });
      continue;
    }
    const t = i / 96;
    let v = end + Math.sin(t * Math.PI * 3 + (s.seed % 7)) * span * 0.35 * (1 - t * 0.6) + (rng() - 0.5) * span * 0.25;
    // the design row: warm start after a door-open event, then settling at 4.2 °C
    if (s.id === 'SEN-T-80214') v = 4.2 + (t < 0.1 ? 1.4 + t * 21 : t < 0.2 ? 3.5 - (t - 0.1) * 28 : 0.7 * Math.exp(-(t - 0.2) * 6)) + (rng() - 0.5) * 0.5;
    pts.push({ at, v: round(Math.max(0, v), s.param.decimals) });
  }
  if (s.reading !== null) pts[pts.length - 1].v = s.reading;
  return pts;
}

/** Events derived from the record plus anything changed on the page, newest first. */
export function historyOf(s: Sensor): SensorEvent[] {
  const rng = mulberry32(s.seed + 99);
  const by = () => USERS[Math.floor(rng() * USERS.length)];
  const h: SensorEvent[] = [
    { at: s.installedOn, text: `Installed on ${s.assetName} · ${s.point}`, by: by(), level: 'info' },
    { at: s.installedOn + 3_600_000, text: `Mapped to ${s.deviceId} channel ${s.channel}`, by: by(), level: 'info' },
    { at: s.lastCal, text: `Calibrated (${s.param.accuracy}) · certificate ${s.certificate}`, by: by(), level: 'ok' },
  ];
  if (s.status === 'Offline') h.push({ at: NOW - s.lastSeenMin * 60_000, text: 'No data received from device', by: 'System', level: 'bad' });
  if (s.status === 'Maintenance') h.push({ at: NOW - s.lastSeenMin * 60_000, text: 'Taken out of service for maintenance', by: by(), level: 'warn' });
  if (s.status === 'Attention' && s.reading !== null && s.reading > s.high) h.push({ at: NOW - (20 + Math.floor(rng() * 200)) * 60_000, text: `High threshold exceeded (${s.reading} ${s.param.unit} > ${s.high} ${s.param.unit})`, by: 'System', level: 'warn' });
  if (isOverdue(s)) h.push({ at: s.calDue, text: 'Calibration overdue', by: 'System', level: 'bad' });
  return [...s.events, ...h.filter((e) => e.at <= NOW).sort((a, b) => b.at - a.at)];
}

export function nextNumber(type: SensorType): number {
  const nums = SENSORS.filter((s) => s.type === type).map((s) => Number(s.id.split('-')[2]) || 0);
  return Math.max(0, ...nums) + 1;
}
