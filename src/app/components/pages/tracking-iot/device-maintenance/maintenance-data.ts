/**
 * Demo data for Device Maintenance (session only, in memory).
 * All dates are offsets from today so statuses (Overdue / Due Soon / Scheduled) stay correct.
 */

export type DeviceKind = 'gateway' | 'vibration' | 'temp' | 'beacon' | 'tracker' | 'meter';
export type MaintType = 'Preventive' | 'Corrective repair' | 'Calibration' | 'Battery replacement' | 'Firmware update' | 'Inspection';
export type Stage = 'planned' | 'in-progress' | 'completed';
export type TaskStatus = 'Scheduled' | 'In Progress' | 'Due Soon' | 'Overdue' | 'Completed';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ReqStatus = 'Open' | 'Assigned' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
export type Health = 'Healthy' | 'Degraded' | 'Critical';

export const MAINT_TYPES: MaintType[] = ['Preventive', 'Corrective repair', 'Calibration', 'Battery replacement', 'Firmware update', 'Inspection'];
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];
export const SITES = ['Dubai Plant', 'Dubai Warehouse', 'Abu Dhabi DC', 'Sharjah Yard', 'Jebel Ali Port'];
export const KIND_LABELS: Record<DeviceKind, string> = {
  gateway: 'Gateway', vibration: 'Vibration Sensor', temp: 'Temperature Sensor', beacon: 'BLE Beacon', tracker: 'GPS Tracker', meter: 'Energy Meter',
};
export const SITE_AREAS: Record<string, string> = {
  'Dubai Plant': 'Main Steel Facility', 'Dubai Warehouse': 'Bay 2 – Distribution', 'Abu Dhabi DC': 'Cold Chain Hall', 'Sharjah Yard': 'Outdoor Yard B', 'Jebel Ali Port': 'Terminal 1 Logistics',
};

/** Last month's figures, used for the KPI trend lines. */
export const PREVIOUS = { due: 25, open: 9, overdue: 5, completed: 39 };

const DAY = 86_400_000;

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local date `n` days from today (negative = past). */
export function rel(n: number): string {
  const t = new Date();
  return toIso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
}

export function daysFromToday(iso: string): number {
  const t = new Date();
  const base = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - base) / DAY);
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  model: string;
  asset: { id: string; name: string } | null;
  /** Infrastructure record shown in the panel when the device has no linked asset. */
  infra: string;
  site: string;
  health: Health;
  uptime: number;
  firmware: string;
  warranty: string;
}

export interface Task {
  id: string;
  deviceId: string;
  type: MaintType;
  due: string;
  assignee: string;
  /** A work slot has been confirmed with the technician/vendor. */
  booked: boolean;
  stage: Stage;
  checklist: boolean[];
  completedOn?: string;
}

export interface ServiceRequest {
  id: string;
  deviceId: string;
  type: MaintType;
  priority: Priority;
  status: ReqStatus;
  created: string;
  due: string;
  assignee: string;
  description: string;
}

export interface HistoryEntry {
  id: string;
  deviceId: string;
  date: string;
  by: string;
  title: string;
  note: string;
}

export interface Plan {
  id: string;
  name: string;
  kind: DeviceKind;
  interval: number;
  type: MaintType;
  checklist: string[];
}

export interface Vendor {
  name: string;
  internal: boolean;
  services: string[];
  sla: string;
  contact: string;
  phone: string;
  email: string;
  rating: number;
}

export const TECHNICIANS = ['Unassigned', 'A. Rahman', 'S. Iqbal', 'M. Thomas', 'Internal IoT Team', 'Field Services LLC', 'NetServe Technical', 'ColdTech Calibration'];

const D = (id: string, name: string, kind: DeviceKind, model: string, site: string, asset: [string, string] | null, x: Partial<Device> = {}): Device => ({
  id, name, kind, model, site, asset: asset ? { id: asset[0], name: asset[1] } : null,
  infra: kind === 'gateway' ? `Gateway Infrastructure - ${site}` : `IoT Device Fleet - ${site}`,
  health: 'Healthy', uptime: 99.2, firmware: 'v1.8.0', warranty: rel(380), ...x,
});

export const DEVICES: Device[] = [
  D('GW-DXB-02', 'LoRaWAN Gateway', 'gateway', 'RAK7268', 'Dubai Plant', null, { uptime: 99.8, firmware: 'v2.3.1', warranty: rel(411) }),
  D('VS-30018', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Dubai Plant', ['PMP-118', 'Pump PMP-118'], { health: 'Critical', uptime: 91.4, firmware: 'v3.0.2' }),
  D('TS-80214', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Abu Dhabi DC', ['CR-03', 'Cold Room CR-03'], { uptime: 99.5, firmware: 'v1.4.6' }),
  D('BLE-20951', 'BLE Beacon', 'beacon', 'MINEW E8', 'Dubai Warehouse', ['FL-008', 'Forklift FL-008'], { health: 'Degraded', uptime: 87.2, firmware: 'v2.1.0', warranty: rel(-30) }),
  D('TS-80177', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Dubai Warehouse', ['FZ-02', 'Freezer FZ-02'], { health: 'Degraded', uptime: 97.9, firmware: 'v1.4.6' }),
  D('GW-AUH-01', 'Cellular Gateway', 'gateway', 'Teltonika RUT956', 'Abu Dhabi DC', null, { health: 'Degraded', uptime: 96.1, firmware: 'v7.6.3' }),
  D('TRK-40412', 'GPS Tracker', 'tracker', 'Teltonika FMC130', 'Jebel Ali Port', ['TRK-12', 'Truck TRK-12'], { health: 'Degraded', uptime: 94.0, firmware: 'v03.28.07' }),
  D('GW-SHJ-03', 'BLE Gateway', 'gateway', 'MINEW G1', 'Sharjah Yard', null, { uptime: 98.7, firmware: 'v4.1.0' }),
  D('VS-30022', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Dubai Plant', ['CV-04', 'Conveyor CV-04'], { uptime: 99.1, firmware: 'v3.0.2' }),
  D('VS-30031', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Dubai Plant', ['CMP-07', 'Compressor CMP-07'], { uptime: 98.9, firmware: 'v3.0.2' }),
  D('GW-DXB-05', 'LoRaWAN Gateway', 'gateway', 'RAK7268', 'Dubai Warehouse', null, { health: 'Degraded', uptime: 95.6, firmware: 'v2.3.1' }),
  D('EM-50110', 'Energy Meter', 'meter', 'WEM-3080T', 'Abu Dhabi DC', ['CH-02', 'Chiller CH-02'], { uptime: 99.9, firmware: 'v1.2.4' }),
  D('BLE-20977', 'BLE Beacon', 'beacon', 'MINEW E8', 'Dubai Warehouse', ['PJ-03', 'Pallet Jack PJ-03'], { uptime: 98.0, firmware: 'v2.1.0' }),
  D('TRK-40430', 'GPS Tracker', 'tracker', 'Teltonika FMC130', 'Jebel Ali Port', ['TRK-19', 'Truck TRK-19'], { uptime: 99.0, firmware: 'v03.28.07' }),
  D('GW-JAP-01', 'Cellular Gateway', 'gateway', 'Teltonika RUT956', 'Jebel Ali Port', null, { uptime: 99.6, firmware: 'v7.6.3' }),
  D('VS-30044', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Sharjah Yard', ['PMP-121', 'Pump PMP-121'], { health: 'Degraded', uptime: 96.8, firmware: 'v2.9.5' }),
  D('TS-80230', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Abu Dhabi DC', ['CR-05', 'Cold Room CR-05'], { uptime: 99.7, firmware: 'v1.4.6' }),
  D('GW-DXB-07', 'BLE Gateway', 'gateway', 'MINEW G1', 'Dubai Plant', null, { uptime: 99.4, firmware: 'v4.1.0' }),
  D('EM-50118', 'Energy Meter', 'meter', 'WEM-3080T', 'Sharjah Yard', ['GEN-01', 'Generator GEN-01'], { uptime: 99.8, firmware: 'v1.2.4' }),
  D('TS-80219', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Abu Dhabi DC', ['CR-04', 'Cold Room CR-04'], { uptime: 99.3, firmware: 'v1.4.6' }),
  D('VS-30027', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Dubai Plant', ['MTR-15', 'Motor MTR-15'], { uptime: 98.6, firmware: 'v3.0.2' }),
  D('TS-80241', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Jebel Ali Port', ['RF-07', 'Reefer RF-07'], { uptime: 97.4, firmware: 'v1.4.2' }),
  D('EM-50124', 'Energy Meter', 'meter', 'WEM-3080T', 'Dubai Plant', ['MP-01', 'Main Panel MP-01'], { uptime: 99.9, firmware: 'v1.2.4' }),
  D('TS-80255', 'Temp Sensor EM300-TH', 'temp', 'EM300-TH', 'Dubai Warehouse', ['PS-01', 'Pharma Store PS-01'], { uptime: 99.6, firmware: 'v1.4.6' }),
  D('BLE-20988', 'BLE Beacon', 'beacon', 'MINEW E8', 'Dubai Warehouse', ['FL-011', 'Forklift FL-011'], { health: 'Degraded', uptime: 93.1, firmware: 'v2.1.0' }),
  D('TRK-40455', 'GPS Tracker', 'tracker', 'Teltonika FMC130', 'Sharjah Yard', ['VAN-04', 'Van VAN-04'], { uptime: 98.2, firmware: 'v03.27.14' }),
  D('GW-AUH-04', 'LoRaWAN Gateway', 'gateway', 'RAK7268', 'Abu Dhabi DC', null, { uptime: 99.5, firmware: 'v2.3.1' }),
  D('VS-30052', 'Vibration Sensor V2', 'vibration', 'VS-V2', 'Abu Dhabi DC', ['FAN-02', 'Exhaust Fan FAN-02'], { health: 'Critical', uptime: 89.9, firmware: 'v3.0.2' }),
  D('BLE-21003', 'BLE Beacon', 'beacon', 'MINEW E8', 'Dubai Plant', ['TC-09', 'Tool Cart TC-09'], { uptime: 98.8, firmware: 'v2.1.0' }),
  D('TRK-40461', 'GPS Tracker', 'tracker', 'Teltonika FMC130', 'Jebel Ali Port', ['TRL-02', 'Trailer TRL-02'], { uptime: 99.1, firmware: 'v03.28.07' }),
];

export const PLANS: Plan[] = [
  { id: 'PL-01', name: 'Gateway preventive service', kind: 'gateway', interval: 90, type: 'Preventive', checklist: ['Antenna inspection', 'Power check (voltage & PoE)', 'Connectivity test (LoRaWAN)', 'Firmware review'] },
  { id: 'PL-02', name: 'Vibration sensor service', kind: 'vibration', interval: 120, type: 'Preventive', checklist: ['Mounting & bracket check', 'Sensor alignment', 'Battery level check', 'Data sample validation'] },
  { id: 'PL-03', name: 'Temperature sensor calibration', kind: 'temp', interval: 180, type: 'Calibration', checklist: ['Reference probe comparison', 'Offset adjustment', 'Seal & housing check', 'Calibration certificate logged'] },
  { id: 'PL-04', name: 'Beacon battery cycle', kind: 'beacon', interval: 365, type: 'Battery replacement', checklist: ['Replace battery', 'Advertising interval check', 'Enclosure & mount check'] },
  { id: 'PL-05', name: 'Tracker inspection', kind: 'tracker', interval: 180, type: 'Inspection', checklist: ['Wiring & harness check', 'GNSS fix test', 'Cellular link test', 'Firmware review'] },
  { id: 'PL-06', name: 'Energy meter service', kind: 'meter', interval: 365, type: 'Preventive', checklist: ['CT clamp check', 'Terminal torque check', 'Reading verification'] },
];

const T = (n: number, deviceId: string, type: MaintType, due: number, assignee: string, booked: boolean, stage: Stage = 'planned'): Task => {
  const kind = DEVICES.find((d) => d.id === deviceId)?.kind ?? 'gateway';
  const items = PLANS.find((p) => p.kind === kind)?.checklist.length ?? 3;
  return { id: `MT-${String(n).padStart(4, '0')}`, deviceId, type, due: rel(due), assignee, booked, stage, checklist: new Array(items).fill(false) };
};

export const TASKS: Task[] = [
  T(2101, 'GW-DXB-02', 'Preventive', 4, 'A. Rahman', true),
  T(2102, 'VS-30018', 'Corrective repair', -5, 'Field Services LLC', true, 'in-progress'),
  T(2103, 'TS-80214', 'Calibration', 16, 'Internal IoT Team', false),
  T(2104, 'BLE-20951', 'Battery replacement', -6, 'Unassigned', false),
  T(2105, 'TS-80177', 'Calibration', -9, 'ColdTech Calibration', true),
  T(2106, 'GW-AUH-01', 'Preventive', -2, 'A. Rahman', true),
  T(2107, 'TRK-40412', 'Inspection', -12, 'Unassigned', false),
  T(2108, 'GW-SHJ-03', 'Firmware update', -1, 'Internal IoT Team', true, 'in-progress'),
  T(2109, 'VS-30022', 'Preventive', 2, 'Field Services LLC', true),
  T(2110, 'VS-30031', 'Preventive', 7, 'A. Rahman', true),
  T(2111, 'GW-DXB-05', 'Preventive', 9, 'A. Rahman', false),
  T(2112, 'EM-50110', 'Preventive', 11, 'Internal IoT Team', true),
  T(2113, 'BLE-20977', 'Preventive', 13, 'Unassigned', false),
  T(2114, 'TRK-40430', 'Preventive', 15, 'Field Services LLC', true),
  T(2115, 'GW-JAP-01', 'Preventive', 18, 'NetServe Technical', true),
  T(2116, 'VS-30044', 'Preventive', 21, 'Field Services LLC', false),
  T(2117, 'TS-80230', 'Preventive', 24, 'Internal IoT Team', true),
  T(2118, 'GW-DXB-07', 'Preventive', 38, 'A. Rahman', true),
  T(2119, 'EM-50118', 'Preventive', 52, 'NetServe Technical', true),
  T(2120, 'TS-80219', 'Calibration', 3, 'ColdTech Calibration', true),
  T(2121, 'VS-30027', 'Calibration', 8, 'Field Services LLC', false),
  T(2122, 'TS-80241', 'Calibration', 12, 'ColdTech Calibration', true),
  T(2123, 'EM-50124', 'Calibration', 19, 'NetServe Technical', false),
  T(2124, 'TS-80255', 'Calibration', 27, 'Internal IoT Team', true),
  T(2125, 'BLE-20988', 'Battery replacement', 1, 'Unassigned', false),
  T(2126, 'TRK-40455', 'Firmware update', 5, 'Internal IoT Team', true),
  T(2127, 'GW-AUH-04', 'Inspection', 10, 'NetServe Technical', true),
  T(2128, 'VS-30052', 'Corrective repair', 6, 'Field Services LLC', true, 'in-progress'),
  T(2129, 'BLE-21003', 'Battery replacement', 20, 'Unassigned', false),
  T(2130, 'TRK-40461', 'Inspection', 26, 'Field Services LLC', true),
];

const R = (n: number, deviceId: string, type: MaintType, priority: Priority, status: ReqStatus, created: number, due: number, assignee: string, description: string): ServiceRequest => ({
  id: `SR-${n}`, deviceId, type, priority, status, created: rel(created), due: rel(due), assignee, description,
});

export const REQUESTS: ServiceRequest[] = [
  R(1053, 'VS-30044', 'Corrective repair', 'Medium', 'Open', -1, 6, 'Unassigned', 'Sensor reports gaps in vibration samples during night shift.'),
  R(1052, 'TRK-40455', 'Firmware update', 'Low', 'On Hold', -2, 5, 'Internal IoT Team', 'Awaiting vehicle availability to apply tracker firmware.'),
  R(1051, 'GW-DXB-05', 'Inspection', 'Medium', 'Assigned', -3, 9, 'A. Rahman', 'Intermittent uplink loss reported by warehouse team.'),
  R(1050, 'EM-50124', 'Calibration', 'Low', 'Open', -4, 19, 'NetServe Technical', 'Readings deviate 2% from utility meter.'),
  R(1049, 'BLE-20988', 'Battery replacement', 'Low', 'Open', -4, 1, 'Unassigned', 'Battery level below 15%.'),
  R(1048, 'GW-AUH-01', 'Corrective repair', 'Medium', 'Assigned', -5, -2, 'A. Rahman', 'Cellular modem reboots several times a day.'),
  R(1047, 'TS-80177', 'Calibration', 'High', 'Assigned', -7, -9, 'ColdTech Calibration', 'Reading drift of +1.8 °C against reference probe.'),
  R(1046, 'VS-30052', 'Corrective repair', 'Critical', 'In Progress', -8, 6, 'Field Services LLC', 'Sensor detached from fan housing; data invalid.'),
  R(1045, 'GW-SHJ-03', 'Firmware update', 'Medium', 'In Progress', -9, -1, 'Internal IoT Team', 'Apply v4.1.0 security patch.'),
  R(1044, 'TRK-40412', 'Inspection', 'High', 'Open', -12, -12, 'Unassigned', 'No GNSS fix for 3 days; check antenna and wiring.'),
  R(1043, 'BLE-20951', 'Battery replacement', 'Medium', 'Open', -14, -6, 'Unassigned', 'Battery at 4%, beacon advertising intermittently.'),
  R(1042, 'VS-30018', 'Corrective repair', 'High', 'In Progress', -10, -5, 'Field Services LLC', 'Bearing noise detected; vibration above threshold.'),
  R(1041, 'TS-80219', 'Calibration', 'Low', 'Completed', -25, -18, 'ColdTech Calibration', 'Annual calibration.'),
  R(1040, 'GW-DXB-07', 'Inspection', 'Low', 'Cancelled', -30, -20, 'A. Rahman', 'Duplicate of SR-1036.'),
  R(1039, 'BLE-20977', 'Battery replacement', 'Medium', 'Completed', -33, -26, 'Internal IoT Team', 'Battery replacement after low-battery alert.'),
  R(1038, 'GW-JAP-01', 'Corrective repair', 'High', 'Completed', -40, -35, 'NetServe Technical', 'Replaced failed PoE injector.'),
];

const NOTES: Record<MaintType, string[]> = {
  Preventive: ['Routine inspection completed. No issues found.', 'Cleaned enclosure and checked mounting.', 'Preventive checklist completed.'],
  'Corrective repair': ['Replaced faulty cable. Device back online.', 'Re-seated sensor and verified readings.', 'Repaired connector corrosion.'],
  Calibration: ['Calibrated against reference. Offset −0.3 °C applied.', 'Calibration within tolerance; certificate logged.'],
  'Battery replacement': ['Battery replaced. Level 100%.', 'Replaced battery and enclosure seal.'],
  'Firmware update': ['Firmware updated. Device rebooted cleanly.', 'Updated to latest release. No issues found.'],
  Inspection: ['Visual inspection completed.', 'Wiring and antenna checked; all good.'],
};

function buildHistory(): HistoryEntry[] {
  const out: HistoryEntry[] = [
    { id: 'H-0001', deviceId: 'GW-DXB-02', date: rel(-97), by: 'A. Rahman', title: 'Preventive Maintenance', note: 'Routine inspection and firmware check completed.' },
    { id: 'H-0002', deviceId: 'GW-DXB-02', date: rel(-226), by: 'Internal IoT Team', title: 'Firmware Update', note: 'Updated to v2.3.1. No issues found.' },
    { id: 'H-0003', deviceId: 'GW-DXB-02', date: rel(-321), by: 'Field Services LLC', title: 'Connectivity Issue', note: 'Investigated intermittent disconnects. Resolved.' },
    { id: 'H-0004', deviceId: 'GW-DXB-02', date: rel(-448), by: 'A. Rahman', title: 'Antenna Replacement', note: 'Replaced external antenna due to low signal.' },
  ];
  const others = DEVICES.filter((d) => d.id !== 'GW-DXB-02');
  const crew = ['A. Rahman', 'Internal IoT Team', 'Field Services LLC', 'NetServe Technical', 'ColdTech Calibration', 'S. Iqbal', 'M. Thomas'];
  const dom = new Date().getDate();
  // 46 jobs completed this month (day 1 … today)
  for (let i = 0; i < 46; i++) {
    const dev = others[(i * 7) % others.length];
    const type = MAINT_TYPES[(i * 5) % MAINT_TYPES.length];
    const day = 1 + ((i * 11) % dom);
    out.push({ id: `H-${String(i + 5).padStart(4, '0')}`, deviceId: dev.id, date: rel(day - dom), by: crew[i % crew.length], title: titleOf(type), note: NOTES[type][i % NOTES[type].length] });
  }
  // older jobs (previous months)
  for (let i = 0; i < 24; i++) {
    const dev = others[(i * 3) % others.length];
    const type = MAINT_TYPES[(i * 2 + 1) % MAINT_TYPES.length];
    out.push({ id: `H-${String(i + 51).padStart(4, '0')}`, deviceId: dev.id, date: rel(-dom - 3 - i * 9), by: crew[(i + 2) % crew.length], title: titleOf(type), note: NOTES[type][i % NOTES[type].length] });
  }
  return out;
}

export function titleOf(t: MaintType): string {
  return t === 'Preventive' ? 'Preventive Maintenance' : t === 'Corrective repair' ? 'Corrective Repair' : t === 'Battery replacement' ? 'Battery Replacement' : t === 'Firmware update' ? 'Firmware Update' : t;
}

export const HISTORY: HistoryEntry[] = buildHistory();

export const VENDORS: Vendor[] = [
  { name: 'Internal IoT Team', internal: true, services: ['Firmware', 'Configuration', 'Calibration'], sla: 'Same day', contact: 'Noura Saeed', phone: '+971 4 555 0101', email: 'iot-team@assets360.example', rating: 4.7 },
  { name: 'A. Rahman', internal: true, services: ['Gateways', 'Preventive', 'Inspection'], sla: 'Next business day', contact: 'Abdul Rahman', phone: '+971 50 555 0142', email: 'a.rahman@assets360.example', rating: 4.8 },
  { name: 'Field Services LLC', internal: false, services: ['Corrective repair', 'Sensors', 'Trackers'], sla: '24 h response', contact: 'James Carter', phone: '+971 4 555 0188', email: 'dispatch@fieldservices.example', rating: 4.3 },
  { name: 'NetServe Technical', internal: false, services: ['Gateways', 'Energy meters', 'Networking'], sla: '48 h response', contact: 'Priya Menon', phone: '+971 2 555 0133', email: 'support@netserve.example', rating: 4.1 },
  { name: 'ColdTech Calibration', internal: false, services: ['Calibration', 'Cold chain sensors'], sla: '72 h, certified', contact: 'Omar Haddad', phone: '+971 6 555 0177', email: 'lab@coldtech.example', rating: 4.6 },
];

/** Deterministic 30-day telemetry for a device: uptime % and RSSI dBm. */
export function telemetry(id: string, uptime: number): { uptime: number[]; rssi: number[] } {
  let s = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const up: number[] = [];
  const rssi: number[] = [];
  const base = -70 - (s % 25);
  for (let i = 0; i < 30; i++) {
    const dip = rnd() < (100 - uptime) / 8 ? rnd() * 12 : 0;
    up.push(Math.max(70, Math.min(100, +(uptime + (rnd() - 0.4) * 0.6 - dip).toFixed(1))));
    rssi.push(Math.round(base + (rnd() - 0.5) * 10));
  }
  up[29] = Math.min(100, uptime);
  return { uptime: up, rssi };
}
