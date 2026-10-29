import { RA_PEOPLE } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { RA_COLORS } from '../shared/charts/chart-utils';
import { PeriodWindow, flowSeries, levelSeries, periodWindow, seeded, siteInScope, splitTotal, sumOf } from '../inventory-analytics/parts/ra-parts';

// DEMO MODE: production analytics computed from seeded per-line / per-product sample data (same on every load).
// At "All" filters for 01 Jan – 28 Oct 2026 the headline figures match RA_METRICS.production.

export interface ProductionLine {
  name: string;
  site: string;
  /** Share of group output */
  share: number;
  utilization: number;
  onTime: number;
  /** Availability relative to the group average */
  availabilityTilt: number;
}

export const LINES: ProductionLine[] = [
  { name: 'Line A', site: 'Sharjah Facility', share: 0.32, utilization: 82, onTime: 93, availabilityTilt: 1.01 },
  { name: 'Line B', site: 'Sharjah Facility', share: 0.24, utilization: 70, onTime: 87, availabilityTilt: 0.96 },
  { name: 'Line C', site: 'Dubai HQ', share: 0.26, utilization: 76, onTime: 92, availabilityTilt: 0.99 },
  { name: 'Line D', site: 'Riyadh Office', share: 0.18, utilization: 85, onTime: 93.5, availabilityTilt: 1.04 }
];
export const PLANTS = [...new Set(LINES.map((l) => l.site))];
export const UTILIZATION_TARGET = 85;

export interface Product {
  code: string;
  name: string;
  share: number;
  /** Standard cost per unit, AED */
  unitCost: number;
}

export const PRODUCTS: Product[] = [
  { code: 'PA-100', name: 'Industrial Pump PA-100', share: 0.26, unitCost: 1850 },
  { code: 'CV-200', name: 'Control Valve CV-200', share: 0.22, unitCost: 640 },
  { code: 'GB-300', name: 'Gear Box GB-300', share: 0.2, unitCost: 980 },
  { code: 'MH-400', name: 'Motor Housing MH-400', share: 0.17, unitCost: 420 },
  { code: 'SM-500', name: 'Sensor Module SM-500', share: 0.15, unitCost: 260 }
];

export interface WorkCenter {
  code: string;
  name: string;
  queue: number;
  avgWait: number;
  capacity: number;
}

export const WORK_CENTERS: WorkCenter[] = [
  { code: 'WC-101', name: 'Machining Cell', queue: 18, avgWait: 12.4, capacity: 95 },
  { code: 'WC-204', name: 'Assembly Bay 02', queue: 12, avgWait: 8.6, capacity: 88 },
  { code: 'WC-301', name: 'Paint Shop', queue: 8, avgWait: 6.2, capacity: 76 },
  { code: 'WC-118', name: 'Inspection Bay', queue: 6, avgWait: 5.8, capacity: 70 },
  { code: 'WC-405', name: 'Packaging', queue: 4, avgWait: 2.1, capacity: 60 }
];

// ===== 12-month group series (Nov 2025 – Oct 2026) =====

/** Units produced; Jan – Oct adds up to RA_METRICS.production.outputUnits (48,620) */
const OUTPUT = [3000, 2950, 3100, 3600, 3950, 4300, 4650, 5000, 5350, 5700, 6200, 6770];
const ATTAINMENT = [0.93, 0.92, 0.94, 0.95, 0.94, 0.95, 0.96, 0.95, 0.96, 0.95, 0.96, 0.97];
const PLANNED = OUTPUT.map((o, m) => Math.round(o / ATTAINMENT[m]));
const TARGET = PLANNED.map((p) => Math.round(p * 1.05));

/** WIP value at month end, AED; Oct 2026 = RA_METRICS.production.wipValue */
const WIP_VALUE = [2.62, 2.7, 2.78, 2.86, 2.95, 3.02, 3.08, 3.15, 3.22, 3.28, 3.35, 3.42].map((v) => v * 1_000_000);
export const WIP_STAGES = ['Raw Material', 'In Process', 'Quality Inspection', 'Ready for Dispatch'];
export const WIP_STAGE_COLORS = [RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.pink];
const STAGE_SHARE = [0.3, 0.38, 0.18, 0.14];

/** OEE components in % by month; OEE = availability × performance × quality */
const AVAILABILITY = [91, 91.2, 91.4, 91.6, 91.8, 91.9, 92, 92.1, 92.2, 92.3, 92.4, 92.6];
const PERFORMANCE = [92.8, 93, 93.1, 93.2, 93.3, 93.4, 93.5, 93.6, 93.7, 93.8, 93.8, 94];
const QUALITY = [98, 98.1, 98.1, 98.2, 98.2, 98.3, 98.3, 98.3, 98.4, 98.4, 98.4, 98.5];

export const WORK_ORDER_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
export const WORK_ORDER_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink];
const WORK_ORDER_COUNTS = [522, 348, 249, 126];

export const DOWNTIME_CAUSES = ['Mechanical', 'Material Shortage', 'Changeover', 'Quality Hold', 'Unplanned'];
/** Downtime hours for Jan – Oct 2026 */
const DOWNTIME_HOURS = [86, 64, 42, 28, 18];

// ===== Active production orders =====

export type OrderStatus = 'In Progress' | 'On Track' | 'At Risk' | 'Quality Hold';

export interface ProductionOrder {
  code: string;
  product: string;
  line: string;
  site: string;
  workCenter: string;
  planned: number;
  completed: number;
  wip: number;
  wipValue: number;
  due: string;
  status: OrderStatus;
  materialShortage: boolean;
  supervisor: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pickWeighted(r: number, weights: number[]): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

const HOLD_VALUES = [96_000, 84_000, 72_000, 68_000, 56_000, 44_000];

/**
 * 143 active job orders (JO-2026-00438 downwards). 12 are at risk and 6 are on quality hold (AED 420K);
 * WIP values are scaled so the orders add up to the group WIP value.
 */
export const ORDERS: ProductionOrder[] = (() => {
  const rnd = seeded(438);
  const sizes = [500, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
  let hold = 0;
  const rows = Array.from({ length: 143 }, (_, i) => {
    const line = LINES[pickWeighted(rnd(), LINES.map((l) => l.share))];
    const product = PRODUCTS[pickWeighted(rnd(), PRODUCTS.map((p) => p.share))];
    const planned = sizes[Math.floor(rnd() * sizes.length)];
    const completed = Math.round(planned * (0.15 + rnd() * 0.7));
    const status: OrderStatus = i % 12 === 5 ? 'At Risk' : i % 24 === 11 ? 'Quality Hold' : i % 3 === 0 ? 'On Track' : 'In Progress';
    const wip = planned - completed;
    return {
      code: `JO-2026-${String(438 - i).padStart(5, '0')}`,
      product: product.name,
      line: line.name,
      site: line.site,
      workCenter: WORK_CENTERS[status === 'Quality Hold' ? 3 : Math.floor(rnd() * WORK_CENTERS.length)].name,
      planned,
      completed,
      wip,
      wipValue: status === 'Quality Hold' ? HOLD_VALUES[hold++] : wip * product.unitCost * 0.45,
      due: addDays('2026-10-31', status === 'At Risk' ? 2 + (i % 5) : 3 + Math.floor(rnd() * 28)),
      status,
      materialShortage: i % 10 === 3,
      supervisor: RA_PEOPLE[(i * 7) % RA_PEOPLE.length]
    };
  });
  const openTotal = RA_METRICS.production.wipValue - sumOf(HOLD_VALUES);
  const raw = sumOf(rows.filter((r) => r.status !== 'Quality Hold').map((r) => r.wipValue));
  return rows.map((r) => (r.status === 'Quality Hold' ? r : { ...r, wipValue: Math.round((r.wipValue * openTotal) / raw) }));
})();

// ===== View for the current filters =====

export const ALL_PLANTS = 'All plants';
export const ALL_LINES = 'All production lines';
export const ALL_WORK_CENTERS = 'All work centers';
export const ALL_PRODUCTS = 'All products';

export interface ProductionFilters {
  period: string;
  organization: string;
  plant: string;
  line: string;
  workCenter: string;
  product: string;
}

export interface ProductionView {
  window: PeriodWindow;
  hasScope: boolean;
  output: number;
  wipValue: number;
  onTime: number;
  utilization: number;
  oee: number;
  actual: number[];
  planned: number[];
  target: number[];
  stageStacks: number[][];
  workOrders: number[];
  lines: ProductionLine[];
  downtime: number[];
  availability: number[];
  performance: number[];
  quality: number[];
  oeeTrend: number[];
  orders: ProductionOrder[];
  workCenters: (WorkCenter & { risk: 'High' | 'Medium' | 'Low' })[];
}

function weighted(lines: ProductionLine[], pick: (l: ProductionLine) => number): number {
  const total = sumOf(lines.map((l) => l.share));
  return total ? sumOf(lines.map((l) => l.share * pick(l))) / total : 0;
}

export function buildProductionView(f: ProductionFilters): ProductionView {
  const w = periodWindow(f.period);
  const location = f.plant === ALL_PLANTS ? 'All locations' : f.plant;
  const lines = LINES.filter((l) => siteInScope(l.site, f.organization, location) && (f.line === ALL_LINES || f.line === l.name));
  const product = PRODUCTS.find((p) => p.name === f.product) ?? null;
  const scope = sumOf(lines.map((l) => l.share)) * (product ? product.share : 1);

  const actual = flowSeries(OUTPUT, w, scope).map(Math.round);
  const planned = flowSeries(PLANNED, w, scope).map(Math.round);
  const target = flowSeries(TARGET, w, scope).map(Math.round);

  const wip = levelSeries(WIP_VALUE, w, scope);
  // Stage mix drifts a little month to month; each column still adds up to the WIP value
  const stageStacks = WIP_STAGES.map((_, s) => wip.map((v, i) => {
    const drift = STAGE_SHARE.map((share, k) => share * (1 + 0.06 * Math.sin(i * 1.3 + k * 2)));
    return (v * drift[s]) / sumOf(drift);
  }));

  // Availability scales with the lines' mix; OEE is recomputed from its components
  const tilt = lines.length ? weighted(lines, (l) => l.availabilityTilt) / weighted(LINES, (l) => l.availabilityTilt) : 0;
  const availability = levelSeries(AVAILABILITY, w, tilt);
  const performance = levelSeries(PERFORMANCE, w, lines.length ? 1 : 0);
  const quality = levelSeries(QUALITY, w, lines.length ? 1 : 0);
  const oeeTrend = availability.map((a, i) => (a * performance[i] * quality[i]) / 10_000);

  const share = (w.weekly ? 1 : w.monthCount) / 10;
  const downtime = DOWNTIME_HOURS.map((h) => Math.round(h * share * scope));

  const lineNames = lines.map((l) => l.name);
  const orders = ORDERS.filter((o) => lineNames.includes(o.line) && (!product || o.product === product.name)
    && (f.workCenter === ALL_WORK_CENTERS || f.workCenter === o.workCenter));

  const workCenters = WORK_CENTERS.filter((c) => f.workCenter === ALL_WORK_CENTERS || f.workCenter === c.name).map((c) => ({
    ...c,
    queue: Math.round(c.queue * scope),
    risk: (c.capacity >= 85 ? 'High' : c.capacity >= 70 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low'
  }));

  return {
    window: w,
    hasScope: scope > 0,
    output: sumOf(actual),
    wipValue: wip[wip.length - 1],
    onTime: weighted(lines, (l) => l.onTime),
    utilization: weighted(lines, (l) => l.utilization),
    oee: oeeTrend.length ? sumOf(oeeTrend) / oeeTrend.length : 0,
    actual,
    planned,
    target,
    stageStacks,
    workOrders: splitTotal(Math.round(sumOf(WORK_ORDER_COUNTS) * scope), WORK_ORDER_COUNTS),
    lines,
    downtime,
    availability,
    performance,
    quality,
    oeeTrend,
    orders,
    workCenters
  };
}
