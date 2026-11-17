import { ChartSeries, ChartSlice } from '../shared/charts';

// View models and the static demo dataset for the Maintenance Analytics page. The service (maintenance-analytics.service.ts)
// aggregates the demo asset register and work orders below for the filter bar, in the browser.

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_MAINTENANCE_TYPES = 'All maintenance types';
export const ALL_MAINTENANCE_VIEW = 'All Maintenance';

/** Maintenance (work order) types. */
export const MA_FALLBACK_TYPES = ['Preventive', 'Corrective', 'Emergency', 'Inspection'];

/** Period presets, in whole months (the filter bar has no date pickers). */
export const MA_FALLBACK_PERIODS = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'Last 6 months', 'This year', 'Last 12 months'];
export const MA_DEFAULT_PERIOD = 'Last 12 months';

/** Preventive compliance target (%). */
export const PM_TARGET = 90;

/** Backlog sort order, most urgent first. */
export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

/** A KPI value with its change against the previous period (0 when there is nothing to compare). */
export interface MaKpiValue {
  value: number | null;
  change: number;
  /** "percent" (relative change) or "points" (difference of two rates) */
  unit: string;
}

/** An unfinished work order. */
export interface MaWorkOrder {
  /** Record id */
  key: string;
  /** Work order number shown to users */
  id: string;
  type: string;
  priority: string;
  assetId: string;
  asset: string;
  location: string;
  /** Days since it was raised; null when no date is recorded */
  ageDays: number | null;
  technician: string;
  status: string;
  dueDate: string | null;
  overdue: boolean;
  partsShortage: boolean;
}

export interface TechnicianRow {
  name: string;
  assigned: number;
  completed: number;
  /** Missing measurements are null */
  firstTimeFix: number | null;
  response: number | null;
  sla: number | null;
}

/** A work order named on an insight card. */
export interface MaInsightOrder {
  key: string;
  id: string;
  assetId: string;
  asset: string;
  priority: string;
  status: string;
  reasons: string[];
}

/** An asset named on the "approaching failure" insight. */
export interface MaInsightAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  health: number | null;
  reasons: string[];
}

export interface MaInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  workOrders: MaInsightOrder[];
  assets: MaInsightAsset[];
  parts: string[];
  actions: string[];
  /** Backlog filter behind "View work orders", e.g. status=Overdue or partsShortage=true */
  query: string;
}

export interface MaintenanceView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  complianceTarget: number;
  cost: MaKpiValue;
  open: MaKpiValue;
  pmCompliance: MaKpiValue;
  mttr: MaKpiValue;
  mtbf: MaKpiValue;
  labels: string[];
  costTrend: ChartSeries[];
  monthlyEmergency: number[];
  monthlyTotal: number[];
  /** Period cost totals */
  emergencyCost: number;
  totalCost: number;
  /** Work orders raised in the period */
  workOrders: number;
  typeSeries: ChartSeries[];
  statusSlices: ChartSlice[];
  pmCompleted: number;
  pmDue: number;
  pmTrend: ChartSeries[];
  reliability: ChartSeries[];
  downtimeByCause: ChartSeries[];
  downtimeHours: number;
  /** Most urgent unfinished work orders and how many there are in all */
  backlog: MaWorkOrder[];
  backlogTotal: number;
  technicians: TechnicianRow[];
  insights: MaInsight[];
}

const none = (unit = 'percent'): MaKpiValue => ({ value: null, change: 0, unit });

/** What the page shows before the first load. */
export function emptyMaintenance(): MaintenanceView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    complianceTarget: PM_TARGET,
    cost: none(),
    open: none(),
    pmCompliance: none('points'),
    mttr: none(),
    mtbf: none(),
    labels: [],
    costTrend: [],
    monthlyEmergency: [],
    monthlyTotal: [],
    emergencyCost: 0,
    totalCost: 0,
    workOrders: 0,
    typeSeries: [],
    statusSlices: [],
    pmCompleted: 0,
    pmDue: 0,
    pmTrend: [],
    reliability: [],
    downtimeByCause: [],
    downtimeHours: 0,
    backlog: [],
    backlogTotal: 0,
    technicians: [],
    insights: []
  };
}

// ===== Static demo dataset =====

/** Small seeded generator so the demo figures are the same on every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAY_MS = 86_400_000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight UTC today: the demo history ends here. */
export const MA_TODAY = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
})();

/** Start of the month `offset` months before the current one (UTC ms). */
export function monthStart(offset: number): number {
  const d = new Date(MA_TODAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1);
}

/** Share of a month already elapsed (1 for past months). */
export function monthCoverage(offset: number): number {
  if (offset > 0) return 1;
  const start = monthStart(0);
  return Math.min(1, (MA_TODAY - start + DAY_MS) / (monthStart(-1) - start));
}

/** "Jan 2026" for a month offset. */
export function monthCategory(offset: number): string {
  const d = new Date(monthStart(offset));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Month offsets (oldest first; 0 = this month) covered by a period preset, and the previous period of the same length. */
export function periodOffsets(period: string): { current: number[]; previous: number[] } {
  const month = new Date(MA_TODAY).getUTCMonth();
  const span = (from: number) => Array.from({ length: from + 1 }, (_, i) => from - i);
  const current =
    period === 'This month' ? [0]
      : period === 'Last month' ? [1]
        : period === 'Last 30 days' ? [1, 0]
          : period === 'This quarter' ? span(month % 3)
            : period === 'Last 6 months' ? span(5)
              : period === 'This year' ? span(month)
                : span(11);
  const shift = period === 'Last 30 days' ? 1 : current.length;
  return { current, previous: current.map((o) => o + shift) };
}

export interface MaSite {
  location: string;
  organization: string;
  code: string;
}

export const MA_SITES: MaSite[] = [
  { location: 'Dubai HQ', organization: 'Purple IQ UAE', code: 'DXB' },
  { location: 'Abu Dhabi Office', organization: 'Purple IQ UAE', code: 'AUH' },
  { location: 'Sharjah Facility', organization: 'Purple IQ UAE', code: 'SHJ' },
  { location: 'Jebel Ali Warehouse', organization: 'Purple IQ UAE', code: 'JBA' },
  { location: 'Riyadh Office', organization: 'Purple IQ KSA', code: 'RUH' },
  { location: 'Doha Office', organization: 'Purple IQ Qatar', code: 'DOH' }
];
/** The group holding company covers every site. */
export const MA_GROUP = 'Purple IQ Group';
export const MA_ORGANIZATIONS = [MA_GROUP, 'Purple IQ UAE', 'Purple IQ KSA', 'Purple IQ Qatar'];

const ASSET_MODELS: Record<string, string[]> = {
  HVAC: ['Chiller Unit', 'Air Handling Unit', 'Cooling Tower', 'Split AC Unit'],
  Machinery: ['Air Compressor', 'Hydraulic Press', 'Conveyor Belt', 'CNC Lathe'],
  Vehicles: ['Forklift', 'Delivery Van', 'Reach Truck'],
  Facilities: ['Passenger Elevator', 'Fire Pump', 'Loading Dock Door'],
  'Power & Electrical': ['Diesel Generator', 'UPS System', 'Transformer'],
  'IT Equipment': ['Server Rack', 'Core Network Switch']
};
export const MA_CATEGORIES = Object.keys(ASSET_MODELS);

export const MA_TECHNICIANS = [
  'Rahul Mehta', 'Ahmed Khan', 'John Mathew', 'Omar Khalid', 'Michael Chen', 'Daniel Tan', 'Priya Nair', 'James Wilson', 'Mohammed Ali', 'Lisa Wong'
];
export const MA_DOWNTIME_CAUSES = ['Mechanical Failure', 'Electrical Fault', 'Wear & Tear', 'Parts Unavailable', 'Operator Error'];
const SPARE_PARTS = [
  'Compressor contactor', 'V-belt B52', 'Hydraulic seal kit', 'Bearing 6205-2RS', 'Air filter 24x24', 'Refrigerant R-410A', 'Starter motor',
  'Control PCB', 'Brake pad set', 'Door operator motor', 'Fuel injector', 'Battery module 12V'
];

export interface MaDemoAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  organization: string;
  category: string;
  health: number;
}

export interface MaDemoOrder {
  key: string;
  id: string;
  type: string;
  priority: string;
  asset: MaDemoAsset;
  /** Month offset it was raised in (0 = this month) */
  month: number;
  raised: number;
  due: number;
  /** null while unfinished */
  completedAt: number | null;
  status: string;
  technician: string | null;
  cost: number;
  partsShortage: boolean;
  parts: string[];
  firstTimeFix: boolean;
  responseHours: number;
  slaMet: boolean;
  repairHours: number;
  downtimeHours: number;
  cause: string | null;
  /** Preventive work completed by its due date */
  onTime: boolean;
}

const DUE_DAYS: Record<string, number> = { Critical: 2, High: 5, Medium: 10, Low: 21 };
const RESPONSE_HOURS: Record<string, [number, number]> = { Critical: [0.5, 3], High: [1.5, 7], Medium: [4, 20], Low: [8, 40] };

function buildDemo(): { assets: MaDemoAsset[]; orders: MaDemoOrder[] } {
  const rand = seeded(20260917);
  const pickFrom = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const weighted = (table: [string, number][]): string => {
    let r = rand() * table.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of table) if ((r -= w) <= 0) return v;
    return table[table.length - 1][0];
  };
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const assets: MaDemoAsset[] = [];
  let n = 140;
  for (const site of MA_SITES) {
    const count = site.location === 'Dubai HQ' ? 16 : site.location === 'Doha Office' ? 8 : 12;
    for (let i = 0; i < count; i++) {
      const category = MA_CATEGORIES[(i + assets.length) % MA_CATEGORIES.length];
      n += 1 + Math.floor(rand() * 9);
      assets.push({
        key: `ast-${site.code.toLowerCase()}-${i + 1}`,
        id: `AST-2026-${site.code}-${String(n).padStart(6, '0')}`,
        name: `${pickFrom(ASSET_MODELS[category])} ${String(i + 1).padStart(2, '0')}`,
        location: site.location,
        organization: site.organization,
        category,
        health: Math.round(rand() < 0.13 ? between(24, 44) : between(52, 97))
      });
    }
  }

  const orders: MaDemoOrder[] = [];
  let seq = 4100;
  for (let m = 23; m >= 0; m--) {
    const start = monthStart(m);
    const days = Math.round((monthStart(m - 1) - start) / DAY_MS);
    const month = new Date(start).getUTCMonth();
    // Summer HVAC load in the Gulf, and emergency work slowly falling as the PM programme matures
    const season = 1 + 0.22 * Math.max(0, Math.sin(((month - 3) / 12) * 2 * Math.PI));
    const lastDay = m === 0 ? Math.min(days, Math.round((MA_TODAY - start) / DAY_MS) + 1) : days;
    const count = Math.round(44 * season * (lastDay / days) * between(0.9, 1.1));
    const emergencyWeight = 12 - (23 - m) * 0.18;
    for (let k = 0; k < count; k++) {
      const asset = assets[Math.floor(rand() * assets.length)];
      const type = weighted([['Preventive', 46], ['Corrective', 24 + (asset.health < 45 ? 10 : 0)], ['Emergency', emergencyWeight], ['Inspection', 16]]);
      const priority = type === 'Emergency' ? weighted([['Critical', 55], ['High', 45]])
        : type === 'Corrective' ? weighted([['Critical', 8], ['High', 34], ['Medium', 44], ['Low', 14]])
          : weighted([['High', 10], ['Medium', 50], ['Low', 40]]);
      const raised = start + Math.floor(rand() * lastDay) * DAY_MS;
      const due = raised + DUE_DAYS[priority] * DAY_MS;
      const age = Math.round((MA_TODAY - raised) / DAY_MS);
      const repair = type === 'Corrective' || type === 'Emergency';
      const base = type === 'Preventive' ? between(900, 4200) : type === 'Inspection' ? between(350, 1500)
        : type === 'Corrective' ? between(2500, 9000) : between(6000, 18000);
      const cost = Math.round(base * (asset.category === 'HVAC' || asset.category === 'Power & Electrical' ? 1.15 : 1));
      // Work finishes after its duration (the PM programme gets faster over time); a few orders linger past their due date
      const duration = Math.max(1, Math.round(between(0.3, 1.25 - (23 - m) * 0.006) * DUE_DAYS[priority]));
      const finish = raised + duration * DAY_MS;
      const done = finish <= MA_TODAY && rand() >= (age > 45 ? 0.012 : 0.09);
      const completedAt = done ? finish : null;
      const shortage = !done && repair && rand() < 0.32;
      const status = done ? 'Completed' : MA_TODAY > due ? 'Overdue' : shortage ? 'On Hold' : age <= 1 ? 'Open' : rand() < 0.55 ? 'In Progress' : 'Open';
      const technician = status === 'Open' && rand() < 0.25 ? null : pickFrom(MA_TECHNICIANS);
      const skill = technician ? 0.8 + (MA_TECHNICIANS.indexOf(technician) % 4) * 0.04 : 0.8;
      const repairHours = repair ? round1(between(type === 'Emergency' ? 3 : 1.5, type === 'Emergency' ? 11 : 7) * (1 - (23 - m) * 0.006)) : 0;
      const [rLo, rHi] = RESPONSE_HOURS[priority];
      seq += 1 + Math.floor(rand() * 3);
      orders.push({
        key: `wo-${seq}`,
        id: `WO-${new Date(raised).getUTCFullYear()}-${String(seq).padStart(5, '0')}`,
        type,
        priority,
        asset,
        month: m,
        raised,
        due,
        completedAt,
        status,
        technician,
        cost,
        partsShortage: shortage,
        parts: shortage ? [...new Set([pickFrom(SPARE_PARTS), ...(rand() < 0.4 ? [pickFrom(SPARE_PARTS)] : [])])] : [],
        firstTimeFix: rand() < skill + 0.06,
        responseHours: round1(between(rLo, rHi)),
        slaMet: rand() < skill + 0.1,
        repairHours,
        downtimeHours: repair ? round1(repairHours * between(1.1, 2.4)) : 0,
        cause: !repair ? null : shortage ? 'Parts Unavailable'
          : weighted([['Mechanical Failure', 34], ['Electrical Fault', 24], ['Wear & Tear', 22], ['Parts Unavailable', 10], ['Operator Error', 10]]),
        onTime: done && type === 'Preventive' && duration <= DUE_DAYS[priority]
      });
    }
  }
  return { assets, orders };
}

/** The demo asset register and two years of work orders (so the previous period always has data). */
export const MA_DEMO = buildDemo();
