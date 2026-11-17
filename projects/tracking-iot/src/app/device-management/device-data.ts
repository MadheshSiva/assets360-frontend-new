/* Demo data for IoT Device Management: 1,284 connected devices, generated deterministically (session only). */

export type DeviceType = 'BLE Tracker' | 'GPS / Cellular' | 'Temperature Sensor' | 'Vibration Sensor' | 'RFID Reader';
export type Conn = 'Online' | 'Offline' | 'Pending';
export type Health = 'Good' | 'Warning' | 'Critical';
export type Power = 'Battery' | 'External' | 'PoE';
export type Protocol = 'BLE 5.0' | 'LoRaWAN' | 'LTE-M' | 'Ethernet';
export type Level = 'red' | 'amber' | 'green' | 'purple' | 'grey';

export interface LinkedAsset { name: string; code: string }

export interface DevEvent { at: number; title: string; detail: string; level: Level }

export interface DeviceSettings { intervalMin: number; lowBattery: number; offlineAfterMin: number; alerts: boolean }

export interface Device {
  id: string;
  /** Display name, e.g. "BLE Beacon". */
  name: string;
  type: DeviceType;
  model: string;
  serial: string;
  /** Only cellular trackers have an IMEI. */
  imei: string;
  protocol: Protocol;
  conn: Conn;
  health: Health;
  asset: LinkedAsset | null;
  site: string;
  /** Gateway id, or "Cellular" for devices that report over the mobile network. */
  gateway: string;
  power: Power;
  /** Battery %, null when powered externally / PoE. */
  battery: number | null;
  rssi: number;
  /** Seconds since the last message; null for a device that has never reported. */
  lastSeenSec: number | null;
  firmware: string;
  installedDaysAgo: number;
  settings: DeviceSettings;
  /** Changes made on this page, newest first. */
  log: DevEvent[];
  seed: number;
}

/** Demo clock: 28 Oct 2026, 2:32 PM (Gulf Standard Time). */
export const NOW = new Date(2026, 9, 28, 14, 32, 0);

export const SITES: { name: string; gateways: string[] }[] = [
  { name: 'Dubai Plant', gateways: ['GW-DXB-01', 'GW-DXB-02'] },
  { name: 'Dubai Warehouse', gateways: ['GW-DXB-03', 'GW-DXB-04'] },
  { name: 'Abu Dhabi', gateways: ['GW-AUH-01', 'GW-AUH-02'] },
  { name: 'Sharjah Depot', gateways: ['GW-SHJ-01'] },
  { name: 'Jebel Ali Yard', gateways: ['GW-JBL-01', 'GW-JBL-02'] },
];

export const TYPES: DeviceType[] = ['BLE Tracker', 'GPS / Cellular', 'Temperature Sensor', 'Vibration Sensor', 'RFID Reader'];
export const CONNS: Conn[] = ['Online', 'Offline', 'Pending'];
export const HEALTHS: Health[] = ['Good', 'Warning', 'Critical'];

interface TypeSpec {
  name: string;
  prefix: string;
  start: number;
  models: string[];
  protocol: Protocol;
  assets: [string, string][];
  unlinked: number;
  interval: number;
}

export const TYPE_SPEC: Record<DeviceType, TypeSpec> = {
  'BLE Tracker': { name: 'BLE Beacon', prefix: 'BL-', start: 20000, models: ['Minew E8', 'Minew C10', 'Kontakt Asset Tag 2'], protocol: 'BLE 5.0', assets: [['Chiller', 'CH'], ['Forklift', 'FL'], ['Pallet Jack', 'PJ'], ['Trolley', 'TR']], unlinked: 0.08, interval: 5 },
  'GPS / Cellular': { name: 'GPS Tracker', prefix: 'GPS-', start: 10000, models: ['Teltonika FMC920', 'Teltonika FMB140'], protocol: 'LTE-M', assets: [['Forklift', 'FL'], ['Truck', 'TRK'], ['Generator', 'GEN'], ['Van', 'VAN']], unlinked: 0.03, interval: 1 },
  'Temperature Sensor': { name: 'Temp Sensor', prefix: 'TS-', start: 80000, models: ['Milesight EM300-TH', 'Milesight EM500-PT100'], protocol: 'LoRaWAN', assets: [['Cold Room', 'CR'], ['Freezer', 'FZ'], ['Chiller', 'CH']], unlinked: 0.04, interval: 10 },
  'Vibration Sensor': { name: 'Vibration Sensor', prefix: 'VS-', start: 30000, models: ['Industrial V2', 'Industrial V3'], protocol: 'LoRaWAN', assets: [['Pump', 'PMP'], ['Compressor', 'CMP'], ['Motor', 'MTR']], unlinked: 0.03, interval: 10 },
  'RFID Reader': { name: 'RFID Reader', prefix: 'RR-', start: 0, models: ['Fixed Reader R4', 'Handheld Reader H2'], protocol: 'Ethernet', assets: [], unlinked: 1, interval: 1 },
};

export const MODEL_FW: Record<string, string> = {
  'Minew E8': 'v3.2.0', 'Minew C10': 'v3.1.4', 'Kontakt Asset Tag 2': 'v1.9.2', 'Teltonika FMC920': 'v03.28.07', 'Teltonika FMB140': 'v03.27.10',
  'Milesight EM300-TH': 'v1.4.3', 'Milesight EM500-PT100': 'v1.2.7', 'Industrial V2': 'v2.8.1', 'Industrial V3': 'v3.0.2', 'Fixed Reader R4': 'v5.6.0', 'Handheld Reader H2': 'v4.1.1',
};

export function powerFor(type: DeviceType, model: string): Power {
  return type === 'GPS / Cellular' ? 'External' : model === 'Fixed Reader R4' ? 'PoE' : 'Battery';
}

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

function imeiFor(n: number): string {
  return `35${String(9876543210000 + n * 7919).slice(-13)}`;
}

function make(id: string, type: DeviceType, model: string, extra: Partial<Device>): Device {
  const spec = TYPE_SPEC[type];
  return {
    id, name: spec.name, type, model, serial: `SN-${id}`, imei: type === 'GPS / Cellular' ? imeiFor(Number(id.replace(/\D/g, ''))) : '',
    protocol: spec.protocol, conn: 'Online', health: 'Good', asset: null, site: SITES[0].name, gateway: SITES[0].gateways[0],
    power: powerFor(type, model), battery: null, rssi: -65, lastSeenSec: 60, firmware: MODEL_FW[model], installedDaysAgo: 300,
    settings: { intervalMin: spec.interval, lowBattery: 20, offlineAfterMin: 30, alerts: true }, log: [], seed: 1, ...extra,
  };
}

/** The rows shown in the design, first in the list. */
const FIXED: Device[] = [
  make('BL-20951', 'BLE Tracker', 'Minew E8', { asset: { name: 'Chiller CH-011', code: 'CH-011' }, site: 'Dubai Warehouse', gateway: 'GW-DXB-04', battery: 82, rssi: -61, lastSeenSec: 120, installedDaysAgo: 412, seed: 11 }),
  make('GPS-10482', 'GPS / Cellular', 'Teltonika FMC920', { asset: { name: 'Forklift FL-008', code: 'FL-008' }, site: 'Dubai Warehouse', gateway: 'Cellular', rssi: -58, lastSeenSec: 60, installedDaysAgo: 233, seed: 12 }),
  make('TS-80214', 'Temperature Sensor', 'Milesight EM300-TH', { asset: { name: 'Cold Room CR-03', code: 'CR-03' }, site: 'Abu Dhabi', gateway: 'GW-AUH-02', battery: 67, rssi: -74, lastSeenSec: 240, installedDaysAgo: 518, seed: 13 }),
  make('VS-30018', 'Vibration Sensor', 'Industrial V2', { serial: 'SN-VS-30018', asset: { name: 'Pump PMP-118', code: 'PMP-118' }, site: 'Dubai Plant', gateway: 'GW-DXB-02', conn: 'Offline', health: 'Warning', battery: 18, rssi: -112, lastSeenSec: 3 * 3600 + 8 * 60, installedDaysAgo: 640, seed: 14 }),
  make('RR-00914', 'RFID Reader', 'Fixed Reader R4', { site: 'Dubai Plant', gateway: 'GW-DXB-01', rssi: -52, lastSeenSec: 30, installedDaysAgo: 701, seed: 15 }),
];

/** Fleet breakdown the generator must hit: online & healthy, offline, online but needing attention. */
const TARGET = { online: 1106, offline: 142, attention: 36 };

type Bucket = keyof typeof TARGET;

function generate(): Device[] {
  const rng = mulberry32(20261028);
  const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const left: Record<Bucket, number> = { ...TARGET };
  for (const d of FIXED) left[bucketOf(d) as Bucket]--;
  const pool: Bucket[] = [];
  (Object.keys(left) as Bucket[]).forEach((b) => { for (let i = 0; i < left[b]; i++) pool.push(b); });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const used = new Set(FIXED.map((d) => d.id));
  const assetNums = new Map<string, number>();
  const out: Device[] = [];
  for (const bucket of pool) {
    const r = rng();
    const type: DeviceType = r < 0.4 ? 'BLE Tracker' : r < 0.6 ? 'Temperature Sensor' : r < 0.72 ? 'Vibration Sensor' : r < 0.88 ? 'GPS / Cellular' : 'RFID Reader';
    const spec = TYPE_SPEC[type];
    const model = pick(spec.models);
    let id = '';
    do id = spec.prefix + String(spec.start + int(1, 9999)).padStart(5, '0');
    while (used.has(id));
    used.add(id);

    const site = pick(SITES);
    const gateway = type === 'GPS / Cellular' ? 'Cellular' : pick(site.gateways);
    let asset: LinkedAsset | null = null;
    if (rng() >= spec.unlinked && spec.assets.length) {
      const [name, code] = pick(spec.assets);
      const n = (assetNums.get(code) ?? int(3, 20)) + int(1, 3);
      assetNums.set(code, n);
      const c = `${code}-${String(n).padStart(3, '0')}`;
      asset = { name: `${name} ${c}`, code: c };
    }
    const power = powerFor(type, model);
    const hasBattery = power === 'Battery';
    let battery: number | null = hasBattery ? int(35, 100) : null;
    let rssi = int(-84, -50);
    let lastSeenSec = int(5, spec.interval * 120);
    let conn: Conn = 'Online';
    let health: Health = 'Good';

    if (bucket === 'attention') {
      const issue = rng();
      if (issue < 0.5 && hasBattery) battery = int(4, 19);
      else rssi = int(-112, -96);
      health = (battery !== null && battery < 10) || rssi < -105 ? 'Critical' : 'Warning';
    } else if (bucket === 'offline') {
      conn = 'Offline';
      lastSeenSec = int(45 * 60, 48 * 3600);
      if (hasBattery && rng() < 0.35) battery = int(3, 25);
      if (rng() < 0.4) rssi = int(-112, -88);
      health = battery !== null && battery < 10 ? 'Critical' : 'Warning';
    }

    out.push(make(id, type, model, {
      asset, site: site.name, gateway, battery, rssi, lastSeenSec, conn, health, installedDaysAgo: int(20, 900), seed: int(1, 1e9),
      settings: { intervalMin: spec.interval, lowBattery: 20, offlineAfterMin: Math.max(15, spec.interval * 3), alerts: rng() > 0.05 },
    }));
  }
  out.sort((a, b) => (a.lastSeenSec ?? 0) - (b.lastSeenSec ?? 0));
  return out;
}

/** Which KPI a device counts towards. */
export function bucketOf(d: Device): 'online' | 'offline' | 'attention' | 'pending' {
  if (d.conn === 'Pending') return 'pending';
  if (d.conn !== 'Online') return 'offline';
  return d.health === 'Good' ? 'online' : 'attention';
}

export const DEVICES: Device[] = [...FIXED, ...generate()];

/** Asset codes in use, for the link picker. */
export function knownAssets(): LinkedAsset[] {
  const map = new Map<string, LinkedAsset>();
  for (const d of DEVICES) if (d.asset && !map.has(d.asset.code)) map.set(d.asset.code, d.asset);
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Event history derived from the device's state (newest first); page changes are prepended by the caller. */
export function baseEvents(d: Device): DevEvent[] {
  const rng = mulberry32(d.seed * 31 + 7);
  const now = NOW.getTime();
  const seen = d.lastSeenSec === null ? null : now - d.lastSeenSec * 1000;
  const ev: DevEvent[] = [];
  if (d.conn === 'Offline' && seen !== null) ev.push({ at: seen + 60_000 * Math.max(5, d.settings.offlineAfterMin), title: 'Device went offline', detail: `No message for ${d.settings.offlineAfterMin} min via ${d.gateway}`, level: 'red' });
  if (d.battery !== null && d.battery < d.settings.lowBattery && seen !== null) ev.push({ at: seen - 40 * 60_000, title: 'Low battery', detail: `Battery dropped to ${d.battery}%`, level: 'amber' });
  if (d.rssi < -95 && seen !== null) ev.push({ at: seen - 95 * 60_000, title: 'Weak signal', detail: `RSSI ${d.rssi} dBm at ${d.gateway}`, level: 'amber' });
  if (seen !== null && d.conn === 'Online') ev.push({ at: seen, title: 'Message received', detail: `Telemetry via ${d.gateway}`, level: 'green' });
  ev.push({ at: now - (8 + Math.floor(rng() * 40)) * 86_400_000, title: 'Firmware verified', detail: `${d.firmware} is current for ${d.model}`, level: 'grey' });
  if (d.asset) ev.push({ at: now - (d.installedDaysAgo - 1) * 86_400_000, title: 'Linked to asset', detail: d.asset.name, level: 'purple' });
  ev.push({ at: now - d.installedDaysAgo * 86_400_000, title: 'Device registered', detail: `${d.model} · ${d.serial}`, level: 'grey' });
  return ev.sort((a, b) => b.at - a.at);
}

export interface HealthPoint { at: number; rssi: number | null; battery: number | null; msgs: number }

/** Signal, battery and messages per bucket for the health chart (gaps after the device stopped reporting). */
export function healthSeries(d: Device, hours: number, step: number): HealthPoint[] {
  const rng = mulberry32(d.seed + hours);
  const now = NOW.getTime();
  const seenAgoH = d.lastSeenSec === null ? Infinity : d.lastSeenSec / 3600;
  const n = Math.round(hours / step);
  const perBucket = Math.max(1, Math.round((step * 60) / d.settings.intervalMin));
  const pts: HealthPoint[] = [];
  const startBattery = d.battery === null ? null : Math.min(100, d.battery + Math.round(hours / 24) * (d.battery < 25 ? 3 : 1));
  for (let i = 0; i <= n; i++) {
    const agoH = hours - i * step;
    const at = now - agoH * 3_600_000;
    const live = agoH >= seenAgoH - 1e-6;
    const k = i / n;
    // an offline device's signal had been fading before it dropped out: stronger further back in time
    const fade = d.conn === 'Offline' ? Math.min(1, (agoH - seenAgoH) / Math.max(1, hours / 3)) * 12 : 0;
    pts.push({
      at,
      rssi: live ? Math.round(d.rssi + (rng() - 0.5) * 8 + fade) : null,
      battery: live && startBattery !== null && d.battery !== null ? Math.round(startBattery + (d.battery - startBattery) * Math.min(1, k * hours / Math.max(0.5, hours - seenAgoH))) : null,
      msgs: live ? Math.max(0, Math.round(perBucket * (0.7 + rng() * 0.5))) : 0,
    });
  }
  return pts;
}
