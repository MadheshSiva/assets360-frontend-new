/* Demo data for Geofence & Alerts. Everything is in-memory; KPIs are computed from these arrays. */

export type ZoneType = 'Allowed' | 'Warning' | 'Restricted';
export type ZoneStatus = 'Active' | 'Disabled';
export type ZoneShape = 'Polygon' | 'Circle';
export type AssetKind = 'Forklift' | 'Tool Cart' | 'Truck' | 'Pallet Jack' | 'Mobile Tool';
export type Trigger = 'enter-exit' | 'enter' | 'exit' | 'dwell';
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type EventType = 'Entered' | 'Exited' | 'Dwell Exceeded';
export type EventStatus = 'Unacknowledged' | 'Acknowledged' | 'Assigned' | 'Resolved';

export const SITES = ['Dubai Plant', 'Abu Dhabi DC', 'Sharjah Warehouse'];
export const ASSET_GROUPS = ['Forklifts', 'Mobile Tools', 'Vehicles', 'All assets'];
export const SCHEDULES = ['Always active', 'Working hours (07:00–19:00)', 'After hours (19:00–07:00)', 'Weekdays only'];
export const TEAMS = ['Security Team', 'Facilities', 'Operations'];
export const WORKFLOWS = ['Restricted Zone Incident', 'Unauthorized Entry', 'Dwell Escalation'];
export const CONDITIONS = ['During all hours', 'Working hours', 'After hours'];
export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
export const TRIGGERS: { value: Trigger; label: string }[] = [
  { value: 'enter-exit', label: 'When asset enters or exits zone' },
  { value: 'enter', label: 'When asset enters zone' },
  { value: 'exit', label: 'When asset exits zone' },
  { value: 'dwell', label: 'When asset dwells longer than…' },
];
export const ZONE_COLORS = ['#2563eb', '#eab308', '#dc2626', '#0d9488', '#7c3aed', '#ea580c', '#db2777', '#0891b2'];

/** Map coordinate space (SVG viewBox units). 100 m = 160 units at zoom 1. */
export const MAP_W = 1000;
export const MAP_H = 620;
export const UNITS_PER_100M = 160;

export interface Pt { x: number; y: number }
export interface Slot { x: number; y: number; w: number; h: number }

export interface Asset { id: string; code: string; kind: AssetKind; site: string }

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  site: string;
  status: ZoneStatus;
  shape: ZoneShape;
  /** Vertex count for polygons; drawn geometry uses `poly` when present, else a generated shape in `slot`. */
  points: number;
  color: string;
  groups: string[];
  schedule: string;
  monitorEntry: boolean;
  monitorExit: boolean;
  dwellMin: number;
  assetIds: string[];
  createdDaysAgo: number;
  poly?: Pt[];
  slot?: Slot;
  /** Real-world outline (WGS84). Seeded zones get theirs from geofences.geo.json; drawn/edited zones keep their own. */
  latlngs?: { lat: number; lng: number }[];
  /** Circle zones. */
  center?: { lat: number; lng: number };
  radiusM?: number;
  /** Bumped whenever the geometry changes, so the map redraws the zone. */
  geoRev?: number;
}

export interface Rule {
  id: string;
  name: string;
  zoneId: string;
  trigger: Trigger;
  dwellMin: number;
  severity: Severity;
  group: string;
  condition: string;
  createAlert: boolean;
  notify: boolean;
  team: string;
  workflow: boolean;
  workflowName: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  enabled: boolean;
}

export interface AlertEvent {
  id: string;
  ts: Date;
  assetCode: string;
  assetKind: AssetKind;
  zoneId: string;
  zoneName: string;
  type: EventType;
  durationMin: number | null;
  owner: string;
  status: EventStatus;
}

export interface MapGateway { site: string; x: number; y: number; name: string }

/* ---------- deterministic helpers ---------- */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function at(daysAgo: number, hh: number, mm: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/* ---------- asset fleet (186 unique assets: 110 + 46 + 30) ---------- */
const KINDS: { kind: AssetKind; prefix: string }[] = [
  { kind: 'Forklift', prefix: 'FL' },
  { kind: 'Tool Cart', prefix: 'TC' },
  { kind: 'Truck', prefix: 'TR' },
  { kind: 'Pallet Jack', prefix: 'PJ' },
  { kind: 'Mobile Tool', prefix: 'MT' },
];
const FLEET_SIZE: Record<string, number> = { 'Dubai Plant': 110, 'Abu Dhabi DC': 46, 'Sharjah Warehouse': 30 };

export const ASSETS: Asset[] = (() => {
  const counters: Record<string, number> = {};
  const out: Asset[] = [];
  for (const site of SITES) {
    for (let i = 0; i < FLEET_SIZE[site]; i++) {
      const k = KINDS[i % KINDS.length];
      counters[k.prefix] = (counters[k.prefix] ?? 0) + 1;
      const code = `${k.prefix}-${String(counters[k.prefix]).padStart(3, '0')}`;
      out.push({ id: code, code, kind: k.kind, site });
    }
  }
  return out;
})();

export function assetGroup(kind: AssetKind): string {
  if (kind === 'Forklift' || kind === 'Pallet Jack') return 'Forklifts';
  if (kind === 'Truck') return 'Vehicles';
  return 'Mobile Tools';
}

/** Monitored assets last month (KPI baseline). */
export const PREV_MONITORED = 174;
/** Unacknowledged alerts at the same time yesterday (KPI baseline). */
export const PREV_OPEN = 3;

/* ---------- map geometry ---------- */
export const SITE_SLOTS: Record<string, Slot[]> = {
  'Dubai Plant': [
    { x: 478, y: 242, w: 196, h: 66 },
    { x: 478, y: 326, w: 196, h: 66 },
    { x: 742, y: 40, w: 214, h: 86 },
    { x: 338, y: 352, w: 112, h: 90 },
    { x: 338, y: 462, w: 112, h: 100 },
    { x: 478, y: 434, w: 66, h: 140 },
  ],
};
for (const s of SITES.slice(1)) {
  const slots: Slot[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) slots.push({ x: 40 + c * 238, y: 34 + r * 196, w: 204, h: 150 });
  SITE_SLOTS[s] = slots;
}

interface Seed { name: string; type: ZoneType; site: string; assets: number; rules: number; color: string; groups: string[]; poly?: number[]; created?: number; schedule?: string; dwell?: number }

const SEEDS: Seed[] = [
  { name: 'Restricted Zone', type: 'Restricted', site: 'Dubai Plant', assets: 42, rules: 3, color: '#dc2626', groups: ['Forklifts', 'Mobile Tools'], poly: [742, 168, 880, 150, 952, 214, 952, 330, 892, 402, 762, 402, 716, 334, 716, 232], created: 9, dwell: 5 },
  { name: 'Warehouse A', type: 'Allowed', site: 'Dubai Plant', assets: 68, rules: 2, color: '#2563eb', groups: ['Forklifts', 'Mobile Tools', 'Vehicles'], poly: [50, 40, 412, 40, 412, 96, 440, 96, 440, 300, 50, 300], dwell: 30 },
  { name: 'Loading Bay', type: 'Warning', site: 'Dubai Plant', assets: 35, rules: 2, color: '#eab308', groups: ['Forklifts', 'Vehicles'], poly: [472, 40, 706, 40, 706, 206, 590, 222, 472, 206], schedule: 'Working hours (07:00–19:00)', dwell: 10 },
  { name: 'Maintenance Yard', type: 'Warning', site: 'Dubai Plant', assets: 27, rules: 2, color: '#7c3aed', groups: ['Mobile Tools', 'Vehicles'], poly: [566, 432, 958, 432, 958, 584, 626, 584, 566, 530], dwell: 20 },
  { name: 'Cold Storage', type: 'Allowed', site: 'Dubai Plant', assets: 14, rules: 1, color: '#0d9488', groups: ['Forklifts'], poly: [50, 344, 306, 344, 306, 584, 50, 584], dwell: 15 },
  { name: 'Main Gate', type: 'Allowed', site: 'Dubai Plant', assets: 22, rules: 1, color: '#0891b2', groups: ['Vehicles'], dwell: 5 },
  { name: 'Fuel Station', type: 'Restricted', site: 'Dubai Plant', assets: 9, rules: 1, color: '#ea580c', groups: ['Vehicles'], created: 21, dwell: 5 },
  { name: 'Staff Parking', type: 'Warning', site: 'Dubai Plant', assets: 12, rules: 1, color: '#db2777', groups: ['Vehicles'], dwell: 60 },
  { name: 'Inbound Dock', type: 'Allowed', site: 'Abu Dhabi DC', assets: 18, rules: 1, color: '#2563eb', groups: ['Forklifts', 'Vehicles'] },
  { name: 'Outbound Dock', type: 'Allowed', site: 'Abu Dhabi DC', assets: 16, rules: 1, color: '#0891b2', groups: ['Forklifts', 'Vehicles'] },
  { name: 'High-Value Cage', type: 'Restricted', site: 'Abu Dhabi DC', assets: 6, rules: 1, color: '#dc2626', groups: ['Forklifts', 'Mobile Tools'], dwell: 3 },
  { name: 'Racking Aisles 1–4', type: 'Allowed', site: 'Abu Dhabi DC', assets: 24, rules: 1, color: '#0d9488', groups: ['Forklifts'] },
  { name: 'Charging Station', type: 'Warning', site: 'Abu Dhabi DC', assets: 10, rules: 1, color: '#eab308', groups: ['Forklifts'], dwell: 30 },
  { name: 'Yard Perimeter', type: 'Allowed', site: 'Abu Dhabi DC', assets: 30, rules: 1, color: '#7c3aed', groups: ['All assets'] },
  { name: 'Hazmat Store', type: 'Restricted', site: 'Abu Dhabi DC', assets: 4, rules: 1, color: '#ea580c', groups: ['Mobile Tools'], created: 26, dwell: 2 },
  { name: 'Returns Area', type: 'Warning', site: 'Abu Dhabi DC', assets: 8, rules: 1, color: '#db2777', groups: ['Forklifts', 'Mobile Tools'] },
  { name: 'Receiving Area', type: 'Allowed', site: 'Sharjah Warehouse', assets: 15, rules: 1, color: '#2563eb', groups: ['Forklifts', 'Vehicles'] },
  { name: 'Dispatch Bay', type: 'Warning', site: 'Sharjah Warehouse', assets: 12, rules: 1, color: '#eab308', groups: ['Vehicles'] },
  { name: 'Bulk Storage', type: 'Allowed', site: 'Sharjah Warehouse', assets: 20, rules: 1, color: '#0d9488', groups: ['Forklifts'] },
  { name: 'Mezzanine', type: 'Warning', site: 'Sharjah Warehouse', assets: 6, rules: 1, color: '#7c3aed', groups: ['Mobile Tools'] },
  { name: 'Server Room', type: 'Restricted', site: 'Sharjah Warehouse', assets: 3, rules: 1, color: '#dc2626', groups: ['Mobile Tools'], dwell: 2 },
  { name: 'Workshop', type: 'Warning', site: 'Sharjah Warehouse', assets: 9, rules: 1, color: '#ea580c', groups: ['Mobile Tools'] },
  { name: 'Container Yard', type: 'Allowed', site: 'Sharjah Warehouse', assets: 14, rules: 1, color: '#0891b2', groups: ['Vehicles'] },
  { name: 'Security Gate', type: 'Restricted', site: 'Sharjah Warehouse', assets: 7, rules: 1, color: '#db2777', groups: ['All assets'], dwell: 5 },
];

export const ZONES: Zone[] = (() => {
  const offsets: Record<string, number> = {};
  const slotIx: Record<string, number> = {};
  return SEEDS.map((s, i) => {
    const fleet = ASSETS.filter((a) => a.site === s.site);
    const off = offsets[s.site] ?? 0;
    offsets[s.site] = off + s.assets;
    const assetIds: string[] = [];
    for (let k = 0; k < s.assets; k++) assetIds.push(fleet[(off + k) % fleet.length].id);
    const poly = s.poly ? s.poly.reduce<Pt[]>((acc, v, j) => (j % 2 ? acc : [...acc, { x: v, y: s.poly![j + 1] }]), []) : undefined;
    let slot: Slot | undefined;
    if (!poly) {
      const n = slotIx[s.site] ?? 0;
      slotIx[s.site] = n + 1;
      slot = SITE_SLOTS[s.site][n];
    }
    return {
      id: `gz-${String(i + 1).padStart(2, '0')}`,
      name: s.name,
      type: s.type,
      site: s.site,
      status: 'Active' as ZoneStatus,
      shape: 'Polygon' as ZoneShape,
      points: poly ? poly.length : 4,
      color: s.color,
      groups: s.groups,
      schedule: s.schedule ?? 'Always active',
      monitorEntry: true,
      monitorExit: s.type !== 'Allowed' || i % 2 === 0,
      dwellMin: s.dwell ?? 15,
      assetIds,
      createdDaysAgo: s.created ?? 40 + i * 9,
      poly,
      slot,
    };
  });
})();

const zoneByName = (n: string) => ZONES.find((z) => z.name === n)!;

/* ---------- rules ---------- */
function mkRule(id: number, zone: Zone, name: string, p: Partial<Rule>): Rule {
  const team = zone.type === 'Restricted' ? 'Security Team' : zone.type === 'Warning' ? 'Operations' : 'Facilities';
  return {
    id: `AR-${String(id).padStart(3, '0')}`,
    name,
    zoneId: zone.id,
    trigger: 'enter-exit',
    dwellMin: zone.dwellMin,
    severity: zone.type === 'Restricted' ? 'High' : zone.type === 'Warning' ? 'Medium' : 'Low',
    group: zone.groups[0] === 'All assets' ? 'All assets' : zone.groups[0],
    condition: 'During all hours',
    createAlert: true,
    notify: true,
    team,
    workflow: zone.type === 'Restricted',
    workflowName: zone.type === 'Restricted' ? 'Restricted Zone Incident' : 'Dwell Escalation',
    inApp: true,
    email: zone.type !== 'Allowed',
    push: zone.type === 'Restricted',
    enabled: true,
    ...p,
  };
}

export const RULES: Rule[] = (() => {
  const out: Rule[] = [];
  let n = 1;
  const rz = zoneByName('Restricted Zone');
  out.push(mkRule(n++, rz, 'Unauthorized forklift entry', { trigger: 'enter', group: 'Forklifts' }));
  out.push(mkRule(n++, rz, 'Dwell over 5 minutes', { trigger: 'dwell', dwellMin: 5, severity: 'Critical', workflowName: 'Dwell Escalation' }));
  out.push(mkRule(n++, rz, 'After-hours tool movement', { trigger: 'enter-exit', group: 'Mobile Tools', condition: 'After hours', severity: 'Medium', workflow: false }));
  const wa = zoneByName('Warehouse A');
  out.push(mkRule(n++, wa, 'Forklift idle in aisle', { trigger: 'dwell', dwellMin: 30, severity: 'Medium', team: 'Operations' }));
  out.push(mkRule(n++, wa, 'Asset left Warehouse A', { trigger: 'exit', group: 'Mobile Tools', condition: 'After hours' }));
  const lb = zoneByName('Loading Bay');
  out.push(mkRule(n++, lb, 'Truck dwell at bay', { trigger: 'dwell', dwellMin: 10, group: 'Vehicles' }));
  out.push(mkRule(n++, lb, 'Forklift entry outside shift', { trigger: 'enter', condition: 'After hours', severity: 'High' }));
  const my = zoneByName('Maintenance Yard');
  out.push(mkRule(n++, my, 'Tool cart left yard', { trigger: 'exit', group: 'Mobile Tools', team: 'Facilities' }));
  out.push(mkRule(n++, my, 'Vehicle parked too long', { trigger: 'dwell', dwellMin: 20, group: 'Vehicles' }));
  const cs = zoneByName('Cold Storage');
  out.push(mkRule(n++, cs, 'Door dwell — cold chain', { trigger: 'dwell', dwellMin: 15, severity: 'High' }));
  for (const z of ZONES.slice(5)) {
    const trig: Trigger = z.type === 'Restricted' ? 'enter' : z.type === 'Warning' ? 'dwell' : 'enter-exit';
    const label = trig === 'enter' ? 'Unauthorized entry' : trig === 'dwell' ? `Dwell over ${z.dwellMin} min` : 'Entry / exit log';
    out.push(mkRule(n++, z, `${z.name} — ${label}`, { trigger: trig }));
  }
  return out;
})();

/* ---------- events ---------- */
function kindOf(code: string): AssetKind {
  return ASSETS.find((a) => a.code === code)?.kind ?? 'Forklift';
}

type TodaySeed = [string, string, string, EventType, number | null, string, EventStatus];
const TODAY: TodaySeed[] = [
  ['14:32', 'FL-008', 'Restricted Zone', 'Entered', null, 'Security Team', 'Unacknowledged'],
  ['14:10', 'TC-021', 'Maintenance Yard', 'Exited', null, 'Facilities', 'Resolved'],
  ['13:55', 'FL-003', 'Warehouse A', 'Dwell Exceeded', 8, 'Operations', 'Assigned'],
  ['13:41', 'PJ-024', 'High-Value Cage', 'Entered', null, 'Security Team', 'Unacknowledged'],
  ['13:20', 'FL-035', 'Server Room', 'Entered', null, 'Security Team', 'Unacknowledged'],
  ['12:47', 'TR-027', 'Yard Perimeter', 'Exited', null, 'Operations', 'Resolved'],
  ['12:18', 'FL-012', 'Loading Bay', 'Dwell Exceeded', 14, 'Operations', 'Assigned'],
  ['11:52', 'MT-033', 'Workshop', 'Exited', null, 'Facilities', 'Resolved'],
  ['11:30', 'TC-034', 'Security Gate', 'Entered', null, 'Security Team', 'Unacknowledged'],
  ['11:03', 'PJ-006', 'Cold Storage', 'Dwell Exceeded', 22, 'Facilities', 'Assigned'],
  ['10:36', 'FL-019', 'Fuel Station', 'Entered', null, 'Security Team', 'Unacknowledged'],
  ['10:05', 'TR-036', 'Dispatch Bay', 'Dwell Exceeded', 12, 'Operations', 'Resolved'],
  ['09:44', 'MT-026', 'Hazmat Store', 'Entered', null, 'Security Team', 'Resolved'],
  ['09:12', 'TR-011', 'Main Gate', 'Exited', null, 'Operations', 'Resolved'],
  ['08:40', 'TC-028', 'Charging Station', 'Dwell Exceeded', 35, 'Facilities', 'Assigned'],
  ['08:05', 'FL-025', 'Inbound Dock', 'Exited', null, 'Operations', 'Resolved'],
  ['07:31', 'PJ-033', 'Mezzanine', 'Entered', null, 'Facilities', 'Resolved'],
];

/** Events per previous day (index 0 = yesterday). Yesterday 23 → today 17 = −26 %. */
const HISTORY_COUNTS = [23, 19, 21, 16, 24, 18, 20];

export const EVENTS: AlertEvent[] = (() => {
  const out: AlertEvent[] = [];
  let n = 1;
  for (const [t, code, zn, type, dur, owner, status] of TODAY) {
    const z = zoneByName(zn);
    const [hh, mm] = t.split(':').map(Number);
    out.push({ id: `EV-${String(n++).padStart(4, '0')}`, ts: at(0, hh, mm), assetCode: code, assetKind: kindOf(code), zoneId: z.id, zoneName: z.name, type, durationMin: dur, owner, status });
  }
  const rand = rng(2610);
  const types: EventType[] = ['Entered', 'Exited', 'Dwell Exceeded'];
  HISTORY_COUNTS.forEach((count, d) => {
    const step = Math.floor((15 * 60) / count);
    for (let i = 0; i < count; i++) {
      const minute = 21 * 60 + 40 - i * step - Math.floor(rand() * step * 0.7);
      // only zones that monitor assets can raise events
      const withAssets = ZONES.filter((x) => x.assetIds.length > 0);
      const z = withAssets[Math.floor(rand() * withAssets.length)];
      const pickId = z.assetIds[Math.floor(rand() * z.assetIds.length)];
      // fall back to any asset of the zone's site if the id is not in the fleet
      const a = ASSETS.find((x) => x.id === pickId) ?? ASSETS.find((x) => x.site === z.site) ?? ASSETS[0];
      const type = types[Math.floor(rand() * 3)];
      const owner = z.type === 'Restricted' ? 'Security Team' : z.type === 'Warning' ? 'Operations' : 'Facilities';
      out.push({
        id: `EV-${String(n++).padStart(4, '0')}`,
        ts: at(d + 1, Math.floor(minute / 60), minute % 60),
        assetCode: a.code,
        assetKind: a.kind,
        zoneId: z.id,
        zoneName: z.name,
        type,
        durationMin: type === 'Dwell Exceeded' ? z.dwellMin + 2 + Math.floor(rand() * 25) : null,
        owner,
        status: 'Resolved',
      });
    }
  });
  return out;
})();

/* ---------- map furniture ---------- */
export const GATEWAYS: MapGateway[] = [
  { site: 'Dubai Plant', x: 456, y: 30, name: 'GW-DXB-01' },
  { site: 'Dubai Plant', x: 700, y: 318, name: 'GW-DXB-02' },
  { site: 'Dubai Plant', x: 324, y: 596, name: 'GW-DXB-03' },
  { site: 'Dubai Plant', x: 968, y: 420, name: 'GW-DXB-04' },
  { site: 'Abu Dhabi DC', x: 262, y: 200, name: 'GW-AUH-01' },
  { site: 'Abu Dhabi DC', x: 738, y: 396, name: 'GW-AUH-02' },
  { site: 'Abu Dhabi DC', x: 500, y: 596, name: 'GW-AUH-03' },
  { site: 'Sharjah Warehouse', x: 262, y: 396, name: 'GW-SHJ-01' },
  { site: 'Sharjah Warehouse', x: 738, y: 200, name: 'GW-SHJ-02' },
];

export interface Bldg { x: number; y: number; w: number; h: number }
export const BUILDINGS: Record<string, Bldg[]> = {
  'Dubai Plant': [
    { x: 78, y: 66, w: 300, h: 196 },
    { x: 494, y: 62, w: 190, h: 112 },
    { x: 768, y: 214, w: 150, h: 120 },
    { x: 78, y: 372, w: 196, h: 180 },
    { x: 640, y: 456, w: 150, h: 92 },
    { x: 830, y: 470, w: 100, h: 84 },
    { x: 764, y: 58, w: 90, h: 50 },
  ],
};
for (const s of SITES.slice(1)) BUILDINGS[s] = SITE_SLOTS[s].filter((_, i) => i % 3 !== 2).map((r) => ({ x: r.x + 26, y: r.y + 24, w: r.w - 52, h: r.h - 50 }));

export const TREES: Pt[] = [
  { x: 20, y: 320 }, { x: 34, y: 336 }, { x: 460, y: 600 }, { x: 476, y: 590 }, { x: 980, y: 140 }, { x: 966, y: 150 },
  { x: 720, y: 112 }, { x: 552, y: 600 }, { x: 320, y: 20 }, { x: 336, y: 14 }, { x: 980, y: 600 }, { x: 18, y: 600 },
];
