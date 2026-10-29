import { RA_CATEGORIES, RA_PEOPLE, RA_PERIODS, assetId } from '../../shared/analytics-common';
import { RA_METRICS } from '../../shared/analytics-metrics';

// DEMO MODE: one deterministic asset register and work order history behind Asset Performance, Maintenance
// Analytics and Predictive Analytics, so the three pages agree with each other and with RA_METRICS at full scope.

export interface RaSite {
  name: string;
  code: string;
  org: string;
  assets: number;
}

/** Sites from RA_LOCATIONS with their asset counts (sum = RA_METRICS.assets.total). */
export const RA_SITES: RaSite[] = [
  { name: 'Dubai HQ', code: 'DXB', org: 'Purple IQ UAE', assets: 312 },
  { name: 'Abu Dhabi Office', code: 'AUH', org: 'Purple IQ UAE', assets: 208 },
  { name: 'Sharjah Facility', code: 'SHJ', org: 'Purple IQ UAE', assets: 186 },
  { name: 'Riyadh Office', code: 'RUH', org: 'Purple IQ KSA', assets: 164 },
  { name: 'London Office', code: 'LON', org: 'Purple IQ Group', assets: 92 },
  { name: 'Singapore Office', code: 'SIN', org: 'Purple IQ Group', assets: 78 },
  { name: 'Jebel Ali Warehouse', code: 'JEA', org: 'Purple IQ UAE', assets: 142 },
  { name: 'Al Ain Depot', code: 'AAN', org: 'Purple IQ UAE', assets: 66 }
];

export const ALL_CATEGORIES = 'All categories';
export const ALL_TYPES = 'All asset types';
export const RA_ASSET_TYPES = ['Rotating Equipment', 'Static Equipment', 'Mobile Equipment', 'Electrical Equipment', 'IT & Electronics'];
export const CATEGORY_OPTIONS = [ALL_CATEGORIES, ...RA_CATEGORIES];
export const TYPE_OPTIONS = [ALL_TYPES, ...RA_ASSET_TYPES];

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const RISK_LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];

export type WoType = 'Preventive' | 'Corrective' | 'Emergency' | 'Inspection';
export type WoStatus = 'Open' | 'In Progress' | 'On Hold' | 'Completed' | 'Overdue';
export type WoPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type DowntimeCause = 'Mechanical' | 'Electrical' | 'Operational' | 'Parts Unavailable';
export const WO_TYPES: WoType[] = ['Preventive', 'Corrective', 'Emergency', 'Inspection'];
export const WO_STATUSES: WoStatus[] = ['Open', 'In Progress', 'On Hold', 'Completed', 'Overdue'];
export const DOWNTIME_CAUSES: DowntimeCause[] = ['Mechanical', 'Electrical', 'Operational', 'Parts Unavailable'];
export const TECHNICIANS = ['Michael Chen', 'Daniel Kim', 'Priya Sharma', 'James Tan', 'Omar Hassan', 'Rahul Mehta', 'Lisa Wong', 'Ahmed Khan'];

export interface RaAsset {
  id: string;
  name: string;
  site: RaSite;
  category: string;
  type: string;
  owner: string;
  /** 0–100 */
  health: number;
  /** % of available hours in use */
  utilization: number;
  availability: number;
  mtbf: number;
  /** Connected to IoT telemetry and scored by the predictive model */
  monitored: boolean;
  risk: RiskLevel | null;
  riskScore: number;
  rulHours: number;
  /** Days until the predicted failure, for the assets the model expects to fail */
  failureWindowDays: number | null;
  /** Model confidence in % */
  confidence: number;
  vibrationAnomaly: boolean;
}

export interface RaWorkOrder {
  id: string;
  type: WoType;
  status: WoStatus;
  priority: WoPriority;
  asset: RaAsset;
  /** 0 = Jan 2026 … 9 = Oct 2026 */
  month: number;
  created: string;
  ageDays: number;
  cost: number;
  repairHours: number;
  downtimeHours: number;
  cause: DowntimeCause;
  technician: string;
  firstTimeFix: boolean;
  responseHours: number;
  slaMet: boolean;
}

export interface RaScope {
  organization: string;
  location: string;
  category: string;
  type: string;
}

/** Deterministic noise in [0, 1). */
export function rnd(k: number, salt = 0): number {
  const x = Math.sin((k + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Splits a whole number by weights (largest remainder), so the parts always add up to the total. */
export function distribute(total: number, weights: number[]): number[] {
  const w = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((x) => (total * x) / w);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (let j = 0; left > 0 && order.length; j = (j + 1) % order.length, left--) parts[order[j].i]++;
  return parts;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Month indexes (0 = Jan 2026) covered by a period from RA_PERIODS. Data starts in Jan 2026. */
export function periodMonths(period: string): number[] {
  switch (RA_PERIODS.indexOf(period)) {
    case 1:
    case 3:
      return [9];
    case 2:
      return [6, 7, 8];
    default:
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }
}

export function inScope(a: RaAsset, s: RaScope): boolean {
  if (s.organization !== 'All organizations' && s.organization !== 'Purple IQ Group' && a.site.org !== s.organization) return false;
  if (s.location !== 'All locations' && a.site.name !== s.location) return false;
  if (s.category !== ALL_CATEGORIES && a.category !== s.category) return false;
  if (s.type !== ALL_TYPES && a.type !== s.type) return false;
  return true;
}

export function scopeSites(s: RaScope): RaSite[] {
  return RA_SITES.filter((site) => RA_ASSETS.some((a) => a.site === site && inScope(a, s)));
}

/** Indexes of `count` items with the lowest keys. */
function lowest(keys: number[]): number[] {
  return keys.map((k, i) => ({ k, i })).sort((a, b) => a.k - b.k).map((x) => x.i);
}

function shiftMean<T>(items: T[], get: (t: T) => number, set: (t: T, v: number) => void, target: number, lo: number, hi: number): void {
  // Two passes so clamping doesn't move the mean far from the target
  for (let pass = 0; pass < 2; pass++) {
    const delta = target - mean(items.map(get));
    items.forEach((t) => set(t, Math.min(hi, Math.max(lo, get(t) + delta))));
  }
}

// ===== Asset register =====

const CATEGORY_SHARES = [18, 22, 20, 16, 10, 9, 5];
const CATEGORY_HEALTH_BIAS = [-0.06, -0.08, 0.03, 0.08, -0.05, 0, 0.05];
const CATEGORY_UTILIZATION = [82, 76, 68, 71, 84, 80, 62];
const SITE_HEALTH_BIAS: Record<string, number> = { DXB: 0.05, AUH: 0.03, SHJ: -0.04, RUH: -0.06, LON: 0.06, SIN: 0.04, JEA: -0.03, AAN: -0.08 };
const SITE_UTILIZATION: Record<string, number> = { DXB: 4, AUH: 1, SHJ: -3, RUH: -6, LON: 2, SIN: 0, JEA: -4, AAN: -8 };

const CATEGORY_TYPES: Record<string, [string, number][]> = {
  Vehicles: [['Mobile Equipment', 1]],
  Machinery: [['Rotating Equipment', 6], ['Static Equipment', 4]],
  Facilities: [['Static Equipment', 7], ['Electrical Equipment', 3]],
  'IT Equipment': [['IT & Electronics', 1]],
  HVAC: [['Rotating Equipment', 1]],
  'Power & Electrical': [['Electrical Equipment', 1]],
  'Safety & PPE': [['Static Equipment', 1]]
};

const NAME_TEMPLATES: Record<string, [string, number][]> = {
  Vehicles: [['Forklift FL-', 1], ['Delivery Van DV-', 10], ['Pickup Truck PT-', 20], ['Reach Stacker RS-', 1]],
  Machinery: [['Generator G-', 200], ['Pump P-', 10], ['Compressor C-', 1], ['Conveyor CV-', 1], ['CNC Machine CN-', 1]],
  Facilities: [['Elevator EL-', 1], ['Fire Pump FPU-', 1], ['Water Tank WT-', 1], ['Access Gate AG-', 1]],
  'IT Equipment': [['Server SRV-', 1], ['Core Switch SW-', 1], ['UPS Unit U-', 1], ['Workstation WS-', 100]],
  HVAC: [['HVAC Unit ', 1], ['Chiller CH-', 1], ['AHU-', 1], ['Cooling Tower CT-', 1]],
  'Power & Electrical': [['Transformer TR-', 1], ['Switchgear SG-', 1], ['Power Meter PM-', 1], ['Distribution Board DB-', 1]],
  'Safety & PPE': [['Fire Panel FP-', 1], ['Gas Detector GD-', 1], ['SCBA Set SC-', 1], ['Fire Extinguisher FE-', 1]]
};

function buildAssets(): RaAsset[] {
  const assets: RaAsset[] = [];
  const nameSeq: Record<string, number> = {};
  RA_SITES.forEach((site) => {
    let n = 0;
    distribute(site.assets, CATEGORY_SHARES).forEach((count, c) => {
      const category = RA_CATEGORIES[c];
      const types = CATEGORY_TYPES[category];
      distribute(count, types.map((t) => t[1])).forEach((typeCount, t) => {
        for (let j = 0; j < typeCount; j++, n++) {
          const k = assets.length;
          const templates = NAME_TEMPLATES[category];
          const [prefix, start] = templates[Math.floor(rnd(k, 7) * templates.length)];
          nameSeq[prefix] = (nameSeq[prefix] ?? start - 1) + 1;
          assets.push({
            id: assetId(site.code, 101 + n),
            name: prefix + nameSeq[prefix],
            site,
            category,
            type: types[t][0],
            owner: RA_PEOPLE[k % RA_PEOPLE.length],
            health: 0,
            utilization: 0,
            availability: 0,
            mtbf: 0,
            monitored: false,
            risk: null,
            riskScore: 0,
            rulHours: 0,
            failureWindowDays: null,
            confidence: 0,
            vibrationAnomaly: false
          });
        }
      });
    });
  });

  // Health bands: Excellent 80–100, Good 60–79, Watch 40–59, Critical 0–39
  const bands: [number, number, number, number][] = [
    [30, 12, 39, 1],
    [62, 40, 59, 1],
    [196, 60, 79, 1.4],
    [960, 80, 100, 2.6]
  ];
  const byHealth = lowest(assets.map((a, k) => rnd(k, 1) + SITE_HEALTH_BIAS[a.site.code] + CATEGORY_HEALTH_BIAS[RA_CATEGORIES.indexOf(a.category)]));
  let pos = 0;
  bands.forEach(([count, lo, hi, skew]) => {
    for (let j = 0; j < count; j++, pos++) {
      const u = count > 1 ? j / (count - 1) : 0;
      assets[byHealth[pos]].health = Math.round(hi - (hi - lo) * Math.pow(1 - u, skew));
    }
  });

  assets.forEach((a, k) => {
    a.utilization = CATEGORY_UTILIZATION[RA_CATEGORIES.indexOf(a.category)] + SITE_UTILIZATION[a.site.code] + (rnd(k, 2) - 0.5) * 18 + (a.health - 87) * 0.15;
    a.availability = 94.6 + (a.health - 87) * 0.12 + (rnd(k, 3) - 0.5) * 4;
    a.mtbf = 1284 * (0.7 + 0.6 * rnd(k, 4)) * (0.6 + (0.4 * a.health) / 87);
  });
  shiftMean(assets, (a) => a.utilization, (a, v) => (a.utilization = v), RA_METRICS.assets.utilization, 8, 99);
  shiftMean(assets, (a) => a.availability, (a, v) => (a.availability = v), RA_METRICS.assets.availability, 70, 99.9);
  const mtbfScale = RA_METRICS.reliability.mtbfHours / mean(assets.map((a) => a.mtbf));
  assets.forEach((a) => {
    a.utilization = round1(a.utilization);
    a.availability = round1(a.availability);
    a.mtbf = Math.round(a.mtbf * mtbfScale);
  });

  // Predictive model coverage: Safety & PPE is mostly not instrumented
  const p = RA_METRICS.predictive;
  const byCoverage = lowest(assets.map((a, k) => rnd(k, 5) + (a.category === 'Safety & PPE' ? 0.7 : 0)));
  const monitored = byCoverage.slice(0, p.assetsMonitored).map((i) => assets[i]);
  monitored.forEach((a) => (a.monitored = true));

  // Risk follows health with some noise; Critical = the high-risk assets on the KPI card
  const riskBands: [RiskLevel, number, number, number][] = [
    ['Critical', p.highRiskAssets, 80, 98],
    ['High', 187, 60, 79],
    ['Medium', 420, 35, 59],
    ['Low', p.assetsMonitored - p.highRiskAssets - 187 - 420, 5, 34]
  ];
  const byRisk = lowest(monitored.map((a, i) => a.health + rnd(i, 6) * 18));
  pos = 0;
  riskBands.forEach(([level, count, lo, hi]) => {
    for (let j = 0; j < count; j++, pos++) {
      const a = monitored[byRisk[pos]];
      a.risk = level;
      a.riskScore = Math.round(hi - ((hi - lo) * j) / Math.max(1, count - 1));
      a.rulHours = Math.round((100 - a.riskScore) * 95 + rnd(pos, 8) * 240);
      a.confidence = Math.round(72 + rnd(pos, 9) * 25);
    }
  });

  // The model expects the top risk scores to fail within 30 days
  const critical = monitored.filter((a) => a.risk === 'Critical').sort((a, b) => b.riskScore - a.riskScore);
  critical.slice(0, p.predictedFailures).forEach((a, i) => {
    a.failureWindowDays = i < 3 ? 7 : i < 8 ? 14 : i < 13 ? 21 : 30;
    a.rulHours = Math.round(a.failureWindowDays * 24 * (0.68 + rnd(i, 10) * 0.08));
  });
  // Five low-confidence predictions go to an engineer for review
  const elevated = monitored.filter((a) => a.risk === 'Critical' || a.risk === 'High');
  lowest(elevated.map((_, i) => rnd(i, 11))).slice(0, 5).forEach((i, j) => (elevated[i].confidence = 58 + j * 2));
  // Abnormal vibration over the last 7 days on rotating equipment
  const rotating = elevated.filter((a) => a.type === 'Rotating Equipment');
  lowest(rotating.map((_, i) => rnd(i, 12))).slice(0, 7).forEach((i) => (rotating[i].vibrationAnomaly = true));
  return assets;
}

export const RA_ASSETS: RaAsset[] = buildAssets();

// ===== Work order history (Jan–Oct 2026) =====

/** Work orders raised per month (sum = RA_METRICS.maintenance.totalWorkOrders). */
const WO_PER_MONTH = [28, 30, 31, 33, 34, 35, 37, 38, 40, 42];
const WO_TYPE_COUNTS = [148, 101, 58, 41];
const WO_BASE_COST: Record<WoType, number> = { Preventive: 3800, Corrective: 6200, Emergency: 9800, Inspection: 1500 };
const TECH_WEIGHTS = [16, 15, 14, 13, 12, 11, 10, 9];
const TECH_FTF = [0.96, 0.88, 0.82, 0.79, 0.86, 0.76, 0.9, 0.81];
const TECH_RESPONSE = [2.4, 3.1, 4.2, 5.1, 3.6, 6.3, 2.9, 4.6];
const TECH_SLA = [0.98, 0.95, 0.92, 0.88, 0.93, 0.85, 0.96, 0.9];
const DAY_MS = 86_400_000;
const REPORT_DATE = Date.UTC(2026, 9, 28);

function pickWeighted(u: number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (u < acc) return i;
  }
  return weights.length - 1;
}

function buildWorkOrders(): RaWorkOrder[] {
  const m = RA_METRICS.maintenance;
  const total = m.totalWorkOrders;
  const types: WoType[] = new Array(total);
  let pos = 0;
  const byType = lowest(Array.from({ length: total }, (_, n) => rnd(n, 20)));
  WO_TYPE_COUNTS.forEach((count, t) => {
    for (let j = 0; j < count; j++) types[byType[pos++]] = WO_TYPES[t];
  });
  const sickest = lowest(RA_ASSETS.map((a) => a.health)).map((i) => RA_ASSETS[i]);

  const orders: RaWorkOrder[] = [];
  WO_PER_MONTH.forEach((count, month) => {
    for (let j = 0; j < count; j++) {
      const n = orders.length;
      const type = types[n];
      const unplanned = type === 'Corrective' || type === 'Emergency';
      const asset = unplanned ? sickest[Math.floor(Math.pow(rnd(n, 21), 2) * sickest.length)] : RA_ASSETS[Math.floor(rnd(n, 22) * RA_ASSETS.length)];
      const day = 1 + Math.floor(rnd(n, 23) * 27);
      const createdMs = Date.UTC(2026, month, day);
      const tech = pickWeighted(rnd(n, 24), TECH_WEIGHTS);
      const repairHours = unplanned
        ? (9.5 - month * 0.45) * (0.7 + 0.6 * rnd(n, 25)) * (type === 'Emergency' ? 1.2 : 1)
        : type === 'Preventive' ? 2 + rnd(n, 25) * 3 : 0.5 + rnd(n, 25);
      const u = rnd(n, 27);
      orders.push({
        id: `WO-2026-${String(1000 + n + 1).padStart(6, '0')}`,
        type,
        status: 'Completed',
        priority: type === 'Emergency' ? 'Critical' : type === 'Corrective' ? (u < 0.5 ? 'High' : 'Medium') : type === 'Preventive' ? (u < 0.3 ? 'Medium' : 'Low') : 'Low',
        asset,
        month,
        created: new Date(createdMs).toISOString().slice(0, 10),
        ageDays: Math.round((REPORT_DATE - createdMs) / DAY_MS),
        cost: WO_BASE_COST[type] * (0.6 + 0.8 * rnd(n, 26)) * (0.85 + month * 0.03),
        repairHours,
        downtimeHours: 0,
        cause: DOWNTIME_CAUSES[pickWeighted(rnd(n, 28), [40, 25, 22, 13])],
        technician: TECHNICIANS[tech],
        firstTimeFix: rnd(n, 29) < TECH_FTF[tech],
        responseHours: round1(TECH_RESPONSE[tech] * (0.7 + 0.6 * rnd(n, 30))),
        slaMet: rnd(n, 31) < TECH_SLA[tech]
      });
    }
  });

  // Total cost = RA_METRICS maintenance cost
  const scale = m.cost / orders.reduce((a, o) => a + o.cost, 0);
  orders.forEach((o) => (o.cost = Math.round(o.cost * scale)));
  orders[orders.length - 1].cost += m.cost - orders.reduce((a, o) => a + o.cost, 0);

  // MTTR = mean repair time of corrective + emergency work orders
  const repairs = orders.filter((o) => o.type === 'Corrective' || o.type === 'Emergency');
  const repairScale = RA_METRICS.reliability.mttrHours / mean(repairs.map((o) => o.repairHours));
  repairs.forEach((o) => (o.repairHours *= repairScale));
  orders.forEach((o) => {
    o.downtimeHours = round1(o.type === 'Inspection' ? 0.5 : o.repairHours * (o.type === 'Preventive' ? 1 : 2.2));
    o.repairHours = round1(o.repairHours);
  });

  // Recent work orders are still active, older ones are completed (a few are overdue)
  const recentFirst = lowest(orders.map((o, n) => -(o.month + rnd(n, 32) * 2.5)));
  const active = recentFirst.slice(0, m.openWorkOrders + 72 + 28);
  const older = recentFirst.slice(active.length);
  const activeOrder = lowest(active.map((_, i) => rnd(i, 33))).map((i) => active[i]);
  activeOrder.forEach((n, i) => (orders[n].status = i < m.openWorkOrders ? 'Open' : i < m.openWorkOrders + 72 ? 'In Progress' : 'On Hold'));
  lowest(older.map((_, i) => rnd(i, 34))).slice(0, m.overdueWorkOrders).forEach((i) => (orders[older[i]].status = 'Overdue'));

  // Seven of the on-hold work orders are waiting for spare parts
  orders.filter((o) => o.status === 'On Hold').forEach((o, i) => {
    if (i < 7) o.cause = 'Parts Unavailable';
    else if (o.cause === 'Parts Unavailable') o.cause = 'Mechanical';
  });
  return orders;
}

export const RA_WORK_ORDERS: RaWorkOrder[] = buildWorkOrders();

export function isActive(o: RaWorkOrder): boolean {
  return o.status !== 'Completed';
}
