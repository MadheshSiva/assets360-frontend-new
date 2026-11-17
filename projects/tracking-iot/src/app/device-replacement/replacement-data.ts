/* Device Replacement — demo data (in-memory, session only). */

export type DeviceKind = 'beacon' | 'vibration' | 'temperature' | 'gps';
export type Health = 'Critical' | 'Offline' | 'Damaged' | 'End of Life' | 'Retired';
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type Compat = 'Compatible' | 'Partial' | 'Incompatible';
export const REASONS = ['Battery failure', 'Hardware fault', 'End of life', 'Damaged', 'Upgrade'];

export interface HistoryEvent { at: string; kind: 'install' | 'alert' | 'maint' | 'fw' | 'info' | 'replace'; text: string }

export interface ExistingDevice {
  id: string;
  kind: DeviceKind;
  type: string;
  model: string;
  protocol: string;
  battery: number;
  status: Health;
  assetId: string;
  assetName: string;
  site: string;
  zone: string;
  gateway: string;
  firmware: string;
  channels: string[];
  lastSeen: string; // ISO local
  reason: string;
  group: string;
  history: HistoryEvent[];
}

export interface Candidate {
  id: string;
  kind: DeviceKind;
  model: string;
  protocol: string;
  battery: number;
  location: string;
  tag: string;
  channels: string[];
  signal: 'Good' | 'Fair' | 'None';
  firmwareProfiles: string[];
}

export interface CheckResult { key: string; name: string; status: CheckStatus; text: string }

export const QUEUE: ExistingDevice[] = [
  {
    id: 'BLE-20951', kind: 'beacon', type: 'BLE Beacon', model: 'Minew E8', protocol: 'BLE 5.0', battery: 8, status: 'Critical',
    assetId: 'FL-008', assetName: 'Forklift FL-008', site: 'Dubai Warehouse', zone: 'Zone B', gateway: 'GW-DXB-02', firmware: 'v2.1.0',
    channels: ['Temperature', 'Motion'], lastSeen: '2026-10-22T14:28', reason: 'Battery failure', group: 'DXB Material Handling',
    history: [
      { at: '2026-10-22T14:28', kind: 'alert', text: 'Last heartbeat received via GW-DXB-02 (RSSI −91 dBm)' },
      { at: '2026-10-21T09:05', kind: 'alert', text: 'Critical alert: battery level dropped to 8%' },
      { at: '2026-10-14T11:40', kind: 'alert', text: 'Low battery warning (18%)' },
      { at: '2026-08-03T16:12', kind: 'fw', text: 'Firmware updated v2.0.4 → v2.1.0' },
      { at: '2026-03-18T10:30', kind: 'maint', text: 'Preventive check: mounting bracket re-secured' },
      { at: '2025-04-09T08:15', kind: 'install', text: 'Installed on Forklift FL-008 and mapped to Temperature, Motion' },
    ],
  },
  {
    id: 'VS-30018', kind: 'vibration', type: 'Vibration Sensor', model: 'Vibration Sensor V2', protocol: 'LoRaWAN', battery: 46, status: 'Offline',
    assetId: 'PMP-118', assetName: 'Pump PMP-118', site: 'Abu Dhabi Plant', zone: 'Pump Room 2', gateway: 'GW-AUH-01', firmware: 'v3.0.4',
    channels: ['Vibration', 'Temperature'], lastSeen: '2026-10-19T08:12', reason: 'Hardware fault', group: 'AUH Rotating Equipment',
    history: [
      { at: '2026-10-19T08:12', kind: 'alert', text: 'Device went offline — no uplink for 8 days' },
      { at: '2026-10-18T22:47', kind: 'alert', text: 'Accelerometer self-test failed (axis Z)' },
      { at: '2026-06-02T13:20', kind: 'fw', text: 'Firmware updated v3.0.1 → v3.0.4' },
      { at: '2025-11-27T09:00', kind: 'install', text: 'Installed on Pump PMP-118' },
    ],
  },
  {
    id: 'TS-80233', kind: 'temperature', type: 'Temperature Sensor', model: 'ThermoTrack T2', protocol: 'LoRaWAN', battery: 61, status: 'Damaged',
    assetId: 'CR-03', assetName: 'Cold Room CR-03', site: 'Sharjah Cold Store', zone: 'Bay 3', gateway: 'GW-SHJ-04', firmware: 'v1.8.2',
    channels: ['Temperature', 'Humidity'], lastSeen: '2026-10-25T17:02', reason: 'Damaged', group: 'SHJ Cold Chain',
    history: [
      { at: '2026-10-25T17:02', kind: 'alert', text: 'Humidity readings out of range (probe damaged)' },
      { at: '2026-10-24T10:15', kind: 'maint', text: 'Technician reported cracked enclosure' },
      { at: '2025-09-10T12:00', kind: 'install', text: 'Installed in Cold Room CR-03' },
    ],
  },
  {
    id: 'GPS-10477', kind: 'gps', type: 'GPS Tracker', model: 'Teltonika FMC130', protocol: 'LTE Cat-M1', battery: 72, status: 'End of Life',
    assetId: 'DV-221', assetName: 'Delivery Van DV-221', site: 'Dubai Logistics Hub', zone: 'Fleet Yard', gateway: 'Cellular (du)', firmware: 'v03.27',
    channels: ['Location', 'Ignition', 'Speed'], lastSeen: '2026-10-27T07:41', reason: 'End of life', group: 'DXB Last-mile Fleet',
    history: [
      { at: '2026-10-01T09:00', kind: 'info', text: 'Vendor end-of-life notice: FMC130 support ends Dec 2026' },
      { at: '2026-05-12T15:34', kind: 'fw', text: 'Firmware updated v03.25 → v03.27' },
      { at: '2022-02-08T08:30', kind: 'install', text: 'Installed on Delivery Van DV-221' },
    ],
  },
];

export const STOCK: Candidate[] = [
  { id: 'BLE-30112', kind: 'beacon', model: 'Minew E8', protocol: 'BLE 5.0', battery: 100, location: 'Central Store', tag: 'TAG-7F21A9', channels: ['Temperature', 'Motion'], signal: 'Good', firmwareProfiles: ['v2.1.0', 'v2.0.4'] },
  { id: 'BLE-30126', kind: 'beacon', model: 'Minew E8', protocol: 'BLE 5.0', battery: 100, location: 'Central Store', tag: 'TAG-7F21C4', channels: ['Temperature', 'Motion'], signal: 'Good', firmwareProfiles: ['v2.1.0'] },
  { id: 'BL-90144', kind: 'beacon', model: 'Minew E9', protocol: 'BLE 5.0', battery: 95, location: 'Central Store', tag: 'TAG-90A144', channels: ['Temperature'], signal: 'Good', firmwareProfiles: ['v2.1.0'] },
  { id: 'VS-30044', kind: 'vibration', model: 'Vibration Sensor V2', protocol: 'LoRaWAN', battery: 100, location: 'Abu Dhabi Store', tag: 'TAG-3A0044', channels: ['Vibration', 'Temperature'], signal: 'Good', firmwareProfiles: ['v3.0.4'] },
  { id: 'VS-30051', kind: 'vibration', model: 'Vibration Sensor V3', protocol: 'LoRaWAN', battery: 100, location: 'Central Store', tag: 'TAG-3A0051', channels: ['Vibration', 'Temperature'], signal: 'Fair', firmwareProfiles: ['v4.0.0'] },
  { id: 'TS-80301', kind: 'temperature', model: 'ThermoTrack T2', protocol: 'LoRaWAN', battery: 100, location: 'Sharjah Store', tag: 'TAG-80301B', channels: ['Temperature', 'Humidity'], signal: 'Good', firmwareProfiles: ['v1.8.2'] },
  { id: 'TS-80318', kind: 'temperature', model: 'ThermoTrack T1', protocol: 'LoRaWAN', battery: 90, location: 'Central Store', tag: 'TAG-80318B', channels: ['Temperature'], signal: 'Good', firmwareProfiles: ['v1.8.2'] },
  { id: 'GPS-10590', kind: 'gps', model: 'Teltonika FMC150', protocol: 'LTE Cat-M1', battery: 100, location: 'Central Store', tag: 'TAG-G10590', channels: ['Location', 'Ignition', 'Speed'], signal: 'Good', firmwareProfiles: ['v03.27', 'v03.29'] },
  { id: 'GPS-10611', kind: 'gps', model: 'Teltonika FM1120', protocol: '2G GSM', battery: 100, location: 'Central Store', tag: 'TAG-G10611', channels: ['Location', 'Ignition', 'Speed'], signal: 'None', firmwareProfiles: ['v01.10'] },
];

/** Session-only state shared across component instances (survives navigation, not a page reload). */
export interface ReplacementDraft { deviceId: string; reason: string; candidateId: string; step: number; opts: Record<string, boolean>; savedAt: string }
export const SESSION = {
  draft: null as ReplacementDraft | null,
  requests: {} as Record<string, string>,
  nextRequest: 4821,
  completed: [] as { oldId: string; newId: string; asset: string; at: string }[],
};

export function checksFor(d: ExistingDevice, c: Candidate): CheckResult[] {
  const sameKind = d.kind === c.kind;
  const sameProto = d.protocol === c.protocol;
  const mapped = d.channels.filter((ch) => c.channels.includes(ch));
  const missing = d.channels.filter((ch) => !c.channels.includes(ch));
  const hasFw = c.firmwareProfiles.includes(d.firmware);
  return [
    { key: 'type', name: 'Device type supported', status: sameKind ? 'pass' : 'fail', text: sameKind ? `${d.type} (${c.model}) is supported` : `${c.model} is not a ${d.type}` },
    { key: 'proto', name: 'Protocol compatible', status: sameProto ? 'pass' : 'fail', text: sameProto ? `${c.protocol} matches existing device` : `${c.protocol} does not match ${d.protocol}` },
    {
      key: 'chan', name: 'Sensor channels mapped', status: missing.length ? 'warn' : 'pass',
      text: missing.length
        ? `${mapped.join(', ') || 'None'} (${mapped.length}/${d.channels.length}) — ${missing.join(', ')} not available`
        : `${mapped.join(', ')} (${mapped.length}/${d.channels.length}) can be mapped`,
    },
    {
      key: 'gw', name: 'Gateway coverage confirmed', status: c.signal === 'Good' ? 'pass' : c.signal === 'Fair' ? 'warn' : 'fail',
      text: c.signal === 'None' ? `No coverage — ${c.protocol} not served by ${d.gateway}` : `Covered by ${d.gateway} (Signal strength: ${c.signal})`,
    },
    {
      key: 'fw', name: 'Firmware profile available', status: hasFw ? 'pass' : 'warn',
      text: hasFw ? `Firmware profile exists (${d.firmware})` : `No ${d.firmware} profile — will use ${c.firmwareProfiles[0]}`,
    },
  ];
}

export function compatOf(d: ExistingDevice, c: Candidate): Compat {
  const r = checksFor(d, c);
  if (r.some((x) => x.status === 'fail')) return 'Incompatible';
  return r.some((x) => x.status === 'warn') ? 'Partial' : 'Compatible';
}
