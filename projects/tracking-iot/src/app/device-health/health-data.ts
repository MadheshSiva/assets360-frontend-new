/* Demo data for Device Health & Status: 1,284 connected devices, generated deterministically (session only). */

export type DeviceType = 'BLE Beacon' | 'Temperature Sensor' | 'Vibration Sensor' | 'GPS Tracker' | 'RFID Reader';
export type Conn = 'Online' | 'Warning' | 'Offline';
export type Status = 'Healthy' | 'Warning' | 'Critical' | 'Offline' | 'Maintenance';
export type Power = 'Battery' | 'External' | 'PoE';
export type Protocol = 'BLE' | 'LoRaWAN' | 'Cellular' | 'Ethernet';
export type AssetKind = 'forklift' | 'cold' | 'pump' | 'generator' | 'truck' | 'box';
export type Level = 'red' | 'amber' | 'green' | 'purple' | 'grey';

export interface Device {
  id: string;
  model: string;
  type: DeviceType;
  asset: { name: string; code: string; kind: AssetKind } | null;
  site: string;
  /** Gateway id, or "Cellular" for devices that report over the mobile network. */
  gateway: string;
  conn: Conn;
  rssi: number;
  /** Battery %, null when powered externally / PoE. */
  battery: number | null;
  power: Power;
  lastSeenMin: number;
  status: Status;
  /** Minutes since the current (non-healthy) status began. */
  sinceMin: number;
  /** Optional transient warning in the past for healthy devices: [startedMinAgo, endedMinAgo]. */
  blip: [number, number] | null;
  firmware: string;
  latestFirmware: string;
  protocol: Protocol;
  intervalMin: number;
  seed: number;
}

export interface DevEvent { min: number; title: string; detail: string; level: Level }

/** Demo clock: 27 Oct 2026, 3:18 PM (Gulf Standard Time). */
export const NOW = new Date(2026, 9, 27, 15, 18, 0);

export const SITES: { name: string; gateways: string[] }[] = [
  { name: 'Dubai Warehouse', gateways: ['GW-DXB-03', 'GW-DXB-04'] },
  { name: 'Dubai Plant', gateways: ['GW-DXB-01', 'GW-DXB-02'] },
  { name: 'Abu Dhabi', gateways: ['GW-AUH-01', 'GW-AUH-02'] },
  { name: 'Sharjah Depot', gateways: ['GW-SHJ-01'] },
  { name: 'Jebel Ali Yard', gateways: ['GW-JBL-01', 'GW-JBL-02'] },
];

export const TYPES: DeviceType[] = ['BLE Beacon', 'Temperature Sensor', 'Vibration Sensor', 'GPS Tracker', 'RFID Reader'];

interface ModelInfo { fw: string; latest: string; interval: number }
export const MODEL_INFO: Record<string, ModelInfo> = {
  'Minew E8': { fw: 'v3.2.0', latest: 'v3.2.0', interval: 5 },
  'Minew C10': { fw: 'v3.1.4', latest: 'v3.2.0', interval: 5 },
  'Kontakt Asset Tag 2': { fw: 'v1.9.2', latest: 'v1.9.2', interval: 5 },
  'Milesight EM300-TH': { fw: 'v1.4.3', latest: 'v1.4.3', interval: 10 },
  'Milesight EM500-PT100': { fw: 'v1.2.7', latest: 'v1.3.0', interval: 10 },
  'Vibration Sensor V2': { fw: 'v2.8.1', latest: 'v2.8.1', interval: 10 },
  'Vibration Sensor V3': { fw: 'v3.0.2', latest: 'v3.0.2', interval: 10 },
  'Teltonika FMC920': { fw: 'v03.28.07', latest: 'v03.28.07', interval: 1 },
  'Teltonika FMB140': { fw: 'v03.27.10', latest: 'v03.28.07', interval: 1 },
  'Fixed Reader R4': { fw: 'v5.6.0', latest: 'v5.6.0', interval: 1 },
  'Handheld Reader H2': { fw: 'v4.1.1', latest: 'v4.2.0', interval: 5 },
};

const TYPE_SPEC: Record<DeviceType, { prefix: string; digits: number; models: string[]; protocol: Protocol; assets: [string, string, AssetKind][]; unlinked: number }> = {
  'BLE Beacon': { prefix: 'BLE-', digits: 5, models: ['Minew E8', 'Minew C10', 'Kontakt Asset Tag 2'], protocol: 'BLE', assets: [['Forklift', 'FL', 'forklift'], ['Pallet Jack', 'PJ', 'forklift'], ['Trolley', 'TR', 'box'], ['Container', 'CT', 'box']], unlinked: 0.1 },
  'Temperature Sensor': { prefix: 'TS-', digits: 5, models: ['Milesight EM300-TH', 'Milesight EM500-PT100'], protocol: 'LoRaWAN', assets: [['Cold Room', 'CR', 'cold'], ['Chiller', 'CH', 'cold'], ['Freezer', 'FZ', 'cold']], unlinked: 0.04 },
  'Vibration Sensor': { prefix: 'VS-', digits: 5, models: ['Vibration Sensor V2', 'Vibration Sensor V3'], protocol: 'LoRaWAN', assets: [['Pump', 'PMP', 'pump'], ['Compressor', 'CMP', 'pump'], ['Motor', 'MTR', 'pump']], unlinked: 0.03 },
  'GPS Tracker': { prefix: 'GPS-', digits: 5, models: ['Teltonika FMC920', 'Teltonika FMB140'], protocol: 'Cellular', assets: [['Generator', 'GEN', 'generator'], ['Truck', 'TRK', 'truck'], ['Van', 'VAN', 'truck']], unlinked: 0.02 },
  'RFID Reader': { prefix: 'RFID-RR-', digits: 5, models: ['Fixed Reader R4', 'Handheld Reader H2'], protocol: 'Ethernet', assets: [], unlinked: 1 },
};

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

function base(id: string, model: string, type: DeviceType, extra: Partial<Device>): Device {
  const info = MODEL_INFO[model];
  return {
    id, model, type, asset: null, site: '', gateway: '', conn: 'Online', rssi: -65, battery: null, power: 'Battery', lastSeenMin: 1, status: 'Healthy', sinceMin: 0, blip: null,
    firmware: info.fw, latestFirmware: info.latest, protocol: TYPE_SPEC[type].protocol, intervalMin: info.interval, seed: 1, ...extra,
  };
}

const FIXED: Device[] = [
  base('BLE-20951', 'Minew E8', 'BLE Beacon', { asset: { name: 'Forklift FL-008', code: 'AST-FL-008', kind: 'forklift' }, site: 'Dubai Warehouse', gateway: 'GW-DXB-04', rssi: -61, battery: 82, lastSeenMin: 2, seed: 11 }),
  base('TS-80214', 'Milesight EM300-TH', 'Temperature Sensor', { asset: { name: 'Cold Room CR-03', code: 'AST-CR-003', kind: 'cold' }, site: 'Abu Dhabi', gateway: 'GW-AUH-02', rssi: -74, battery: 67, lastSeenMin: 4, seed: 12 }),
  base('VS-30018', 'Vibration Sensor V2', 'Vibration Sensor', { asset: { name: 'Pump PMP-118', code: 'AST-PMP-118', kind: 'pump' }, site: 'Dubai Plant', gateway: 'GW-DXB-02', conn: 'Offline', rssi: -96, battery: 18, lastSeenMin: 183, status: 'Critical', sinceMin: 180, seed: 13 }),
  base('GPS-10482', 'Teltonika FMC920', 'GPS Tracker', { asset: { name: 'Generator GEN-042', code: 'AST-GEN-042', kind: 'generator' }, site: 'Dubai Plant', gateway: 'Cellular', rssi: -55, power: 'External', lastSeenMin: 1, seed: 14 }),
  base('RFID-RR-00914', 'Fixed Reader R4', 'RFID Reader', { site: 'Dubai Plant', gateway: 'GW-DXB-01', conn: 'Warning', rssi: -82, power: 'PoE', lastSeenMin: 25, status: 'Warning', sinceMin: 25, seed: 15 }),
];

/** Final fleet breakdown the generator must hit exactly. */
const TARGET: Record<Status, number> = { Healthy: 1106, Warning: 102, Critical: 40, Offline: 36, Maintenance: 0 };

function generate(): Device[] {
  const rng = mulberry32(20261027);
  const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  // statuses still to hand out once the fixed rows are counted, shuffled
  const left = { ...TARGET };
  for (const d of FIXED) left[d.status]--;
  const pool: Status[] = [];
  (Object.keys(left) as Status[]).forEach((s) => { for (let i = 0; i < left[s]; i++) pool.push(s); });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const used = new Set(FIXED.map((d) => d.id));
  const assetNums = new Map<string, number>();
  const out: Device[] = [];
  for (const status of pool) {
    const r = rng();
    const type: DeviceType = r < 0.4 ? 'BLE Beacon' : r < 0.6 ? 'Temperature Sensor' : r < 0.72 ? 'Vibration Sensor' : r < 0.87 ? 'GPS Tracker' : 'RFID Reader';
    const spec = TYPE_SPEC[type];
    const model = pick(spec.models);
    let id = '';
    do {
      const start = type === 'BLE Beacon' ? 20000 : type === 'Temperature Sensor' ? 80000 : type === 'Vibration Sensor' ? 30000 : type === 'GPS Tracker' ? 10000 : 0;
      id = spec.prefix + String(start + int(1, 9999)).padStart(spec.digits, '0');
    } while (used.has(id));
    used.add(id);

    const site = pick(SITES);
    const gateway = type === 'GPS Tracker' ? 'Cellular' : pick(site.gateways);
    let asset: Device['asset'] = null;
    if (rng() >= spec.unlinked && spec.assets.length) {
      const [name, code, kind] = pick(spec.assets);
      const n = (assetNums.get(code) ?? int(3, 20)) + int(1, 3);
      assetNums.set(code, n);
      const num = String(n).padStart(3, '0');
      asset = { name: `${name} ${code}-${num}`, code: `AST-${code}-${num}`, kind };
    }
    const power: Power = type === 'GPS Tracker' ? 'External' : model === 'Fixed Reader R4' ? 'PoE' : 'Battery';
    const info = MODEL_INFO[model];
    const hasBattery = power === 'Battery';
    let conn: Conn = 'Online';
    let rssi = int(-80, -50);
    let battery: number | null = hasBattery ? int(30, 100) : null;
    let lastSeenMin = int(0, Math.max(2, info.interval * 2));
    let sinceMin = 0;
    let blip: [number, number] | null = null;

    if (status === 'Healthy') {
      if (rng() < 0.1) {
        const a = int(40, 9500);
        blip = [a, Math.max(5, a - int(20, 240))];
      }
    } else if (status === 'Warning') {
      conn = rng() < 0.55 ? 'Warning' : 'Online';
      const issue = rng();
      if (issue < 0.4 && hasBattery) battery = int(20, 29);
      else if (issue < 0.75) rssi = int(-90, -86);
      else { conn = 'Warning'; lastSeenMin = int(info.interval * 3, 90); }
      sinceMin = Math.max(lastSeenMin, int(10, 1300));
    } else if (status === 'Critical') {
      conn = rng() < 0.4 ? 'Offline' : 'Warning';
      if (hasBattery && rng() < 0.6) battery = int(4, 19);
      if (battery === null || battery >= 20 || rng() < 0.5) rssi = int(-99, -91);
      lastSeenMin = conn === 'Offline' ? int(35, 600) : int(5, 120);
      sinceMin = conn === 'Offline' ? Math.max(1, lastSeenMin - 3) : int(lastSeenMin, 900);
    } else {
      conn = 'Offline';
      lastSeenMin = int(45, 1380);
      sinceMin = lastSeenMin - 3;
      if (hasBattery && rng() < 0.3) battery = int(5, 40);
      if (rng() < 0.3) rssi = int(-95, -84);
    }

    out.push({
      id, model, type, asset, site: site.name, gateway, conn, rssi, battery, power, lastSeenMin, status, sinceMin, blip,
      firmware: info.fw, latestFirmware: info.latest, protocol: spec.protocol, intervalMin: info.interval, seed: int(1, 1e9),
    });
  }
  return out;
}

export const DEVICES: Device[] = [...FIXED, ...generate()];

export const ASSIGNEES = ['Omar Haddad', 'Priya Nair', 'Lucas Meyer', 'Fatima Al Zaabi', 'IoT Operations Team'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export type SignalQuality = 'Strong' | 'Good' | 'Fair' | 'Poor';
export function signalQuality(rssi: number): SignalQuality {
  return rssi >= -60 ? 'Strong' : rssi >= -70 ? 'Good' : rssi >= -85 ? 'Fair' : 'Poor';
}

/** True when the device has missed several reporting intervals while still nominally connected. */
export function isStale(d: Device): boolean {
  return d.conn !== 'Offline' && d.lastSeenMin > d.intervalMin * 3;
}

/** Health score 0–100 derived from connectivity, battery, signal and heartbeat freshness. */
export function healthScore(d: Device): number {
  let s = 100;
  if (d.conn === 'Offline') s -= 40;
  else if (d.conn === 'Warning') s -= 12;
  if (d.battery !== null) s -= d.battery < 20 ? 20 : d.battery < 30 ? 10 : 0;
  s -= d.rssi < -90 ? 12 : d.rssi < -85 ? 6 : d.rssi < -75 ? 2 : 0;
  if (isStale(d)) s -= 6;
  return Math.max(0, s);
}

/** Device state used by the trend chart, `min` minutes before now. */
export function stateAt(d: Device, min: number): 'online' | 'warning' | 'offline' {
  if (d.status === 'Offline' && min < d.sinceMin) return 'offline';
  if ((d.status === 'Warning' || d.status === 'Critical') && min < d.sinceMin) return 'warning';
  if (d.blip && min <= d.blip[0] && min >= d.blip[1]) return 'warning';
  return 'online';
}

/** Event history derived from the device's current state (newest first). */
export function baseEvents(d: Device): DevEvent[] {
  const rng = mulberry32(d.seed);
  const ev: DevEvent[] = [];
  if (d.conn === 'Offline') ev.push({ min: d.sinceMin, title: 'Device went offline', detail: 'No heartbeat received from device', level: 'red' });
  if (d.conn === 'Warning') ev.push({ min: d.sinceMin, title: 'Intermittent connectivity', detail: `Heartbeat delayed (expected every ${d.intervalMin} min)`, level: 'amber' });
  if (d.battery !== null && d.battery < 20) ev.push({ min: d.lastSeenMin, title: 'Low battery level', detail: `Battery level dropped to ${d.battery}%`, level: 'amber' });
  else if (d.battery !== null && d.battery < 30) ev.push({ min: d.lastSeenMin + 30, title: 'Battery running low', detail: `Battery level at ${d.battery}%`, level: 'amber' });
  if (d.rssi < -90) ev.push({ min: d.lastSeenMin + 93, title: 'Poor signal quality', detail: 'RSSI below -90 dBm', level: 'red' });
  else if (d.rssi < -85) ev.push({ min: d.lastSeenMin + 60, title: 'Weak signal', detail: 'RSSI below -85 dBm', level: 'amber' });
  if (d.conn !== 'Offline') ev.push({ min: d.lastSeenMin, title: 'Payload received', detail: `Telemetry via ${d.gateway}`, level: 'green' });
  if (d.blip) ev.push({ min: d.blip[1], title: 'Connectivity restored', detail: 'Heartbeat back to normal', level: 'green' }, { min: d.blip[0], title: 'Heartbeat delayed', detail: 'Recovered automatically', level: 'amber' });
  ev.push({ min: 1440 + Math.floor(rng() * 600), title: 'Configuration synced', detail: `Reporting interval ${d.intervalMin} min`, level: 'grey' });
  ev.push({ min: 4320 + Math.floor(rng() * 2000), title: 'Firmware check', detail: d.firmware === d.latestFirmware ? `${d.firmware} is the latest version` : `${d.latestFirmware} available (running ${d.firmware})`, level: d.firmware === d.latestFirmware ? 'green' : 'purple' });
  return ev.sort((a, b) => a.min - b.min);
}

/** Hourly battery % and RSSI readings over the last 24 h up to the last payload. */
export function telemetry(d: Device): { mins: number[]; battery: number[]; rssi: number[] } {
  const rng = mulberry32(d.seed ^ 0x5bd1e995);
  const mins: number[] = [];
  for (let m = 1440; m >= d.lastSeenMin; m -= 60) mins.push(m);
  if (mins[mins.length - 1] !== d.lastSeenMin) mins.push(d.lastSeenMin);
  const n = mins.length;
  const b0 = d.battery === null ? 0 : Math.min(100, d.battery + (d.battery < 20 ? 13 : 2));
  const battery = mins.map((_, i) => (d.battery === null ? 0 : i === n - 1 ? d.battery : Math.round(b0 + ((d.battery - b0) * i) / (n - 1) + (rng() - 0.5) * 1.5)));
  const r0 = d.rssi + (d.rssi < -90 ? 18 : 4);
  const rssi = mins.map((_, i) => (i === n - 1 ? d.rssi : Math.round(r0 + ((d.rssi - r0) * i) / (n - 1) + (rng() - 0.5) * 7)));
  return { mins, battery, rssi };
}
