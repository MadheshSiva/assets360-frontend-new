import { RA_COLORS } from '../shared/charts/chart-utils';

// View models and the static demo dataset for the WIP / Production Analytics page. The service
// (wip-production-analytics.service.ts) aggregates the demo lines and production orders below for the filter bar, in the browser.

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_PLANTS = 'All plants';
export const ALL_LINES = 'All production lines';
export const ALL_WORK_CENTERS = 'All work centers';
export const ALL_PRODUCTS = 'All products';
export const ALL_PRODUCTION_VIEW = 'All Production';

/** Period presets, in whole months (the filter bar has no date pickers). */
export const PA_FALLBACK_PERIODS = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'Last 6 months', 'This year', 'Last 12 months'];
export const PA_DEFAULT_PERIOD = 'Last 12 months';

/** Equipment utilization target (%). */
export const UTILIZATION_TARGET = 85;

export const WIP_STAGES = ['Raw Material', 'In Process', 'Quality Inspection', 'Ready for Dispatch'];
export const WIP_STAGE_COLORS = [RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.pink];

export const WORK_ORDER_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
export const WORK_ORDER_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink];

/** Downtime causes. */
export const DOWNTIME_CAUSES = ['Mechanical', 'Material Shortage', 'Changeover', 'Quality Hold', 'Unplanned'];

/** An unfinished production order. Quantities are null when the jobs carry none. */
export interface ProductionOrder {
  /** Record id */
  key: string;
  /** Order number shown to users (falls back to the record id) */
  code: string;
  product: string;
  line: string;
  site: string;
  workCenter: string;
  assetId: string | null;
  planned: number | null;
  completed: number | null;
  wip: number | null;
  unit: string;
  /** 0–100 */
  progress: number;
  /** yyyy-MM-dd, null when the order has no due date */
  due: string | null;
  /** Not Started, In Progress, On Hold or Completed */
  status: string;
  /** Raw Material, In Process, Quality Inspection or Ready for Dispatch */
  stage: string;
  /** Delayed, At Risk or On Track */
  schedule: string;
  /** What the Status pill shows: Delayed / At Risk first, then Quality Hold, else the status */
  state: string;
  wipValue: number;
  priority: string | null;
}

/** A Bottleneck Work Centers row. */
export interface WorkCenter {
  name: string;
  line: string;
  queue: number;
  inProgress: number;
  /** Average days from raising an open order to its start */
  avgWait: number | null;
  utilization: number | null;
  risk: string;
}

export interface LineRow {
  name: string;
  workCenters: number;
  utilization: number | null;
  target: number;
  meetsTarget: boolean | null;
}

export interface ProductionInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  value: number | null;
  lines: string[];
  actions: string[];
  /** Order filter behind "View orders", e.g. schedule=At Risk,Delayed */
  query: string;
}

/** A KPI value with the previous period's value and the change between them. */
export interface PaKpiValue {
  value: number | null;
  previous: number | null;
  change: number;
}

export interface ProductionView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  utilizationTarget: number;
  /** "units" (or the jobs' own unit), or "orders" when the jobs carry no quantities */
  outputUnit: string;
  output: PaKpiValue;
  wipValue: PaKpiValue;
  onTime: PaKpiValue;
  utilization: PaKpiValue;
  oee: PaKpiValue;
  /** Month labels shared by the trend charts ("Jan\n2026") */
  labels: string[];
  actual: number[];
  planned: number[];
  /** Only when an output target is set */
  target: number[] | null;
  /** One series per WIP stage */
  stageStacks: { name: string; values: number[] }[];
  workOrderTotal: number;
  workOrders: { name: string; count: number }[];
  lines: LineRow[];
  downtimeCauses: string[];
  downtime: number[];
  /** Hours per month for each cause */
  downtimeTrend: { name: string; values: number[] }[];
  availability: number[];
  performance: number[];
  quality: number[];
  oeeTrend: number[];
  /** True when any efficiency figure could be measured */
  hasEfficiency: boolean;
  orders: ProductionOrder[];
  ordersTotal: number;
  workCenters: WorkCenter[];
  insights: ProductionInsight[];
}

const none = (): PaKpiValue => ({ value: null, previous: null, change: 0 });

/** What the page shows before the first load. */
export function emptyProductionView(): ProductionView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    utilizationTarget: UTILIZATION_TARGET,
    outputUnit: 'units',
    output: none(),
    wipValue: none(),
    onTime: none(),
    utilization: none(),
    oee: none(),
    labels: [],
    actual: [],
    planned: [],
    target: null,
    stageStacks: [],
    workOrderTotal: 0,
    workOrders: [],
    lines: [],
    downtimeCauses: DOWNTIME_CAUSES,
    downtime: DOWNTIME_CAUSES.map(() => 0),
    downtimeTrend: [],
    availability: [],
    performance: [],
    quality: [],
    oeeTrend: [],
    hasEfficiency: false,
    orders: [],
    ordersTotal: 0,
    workCenters: [],
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
const HISTORY_MONTHS = 24;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight UTC today. */
export const WIP_TODAY = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
})();

/** Start of the month `offset` months before the current one (UTC ms). */
export function monthStart(offset: number): number {
  const d = new Date(WIP_TODAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1);
}

/** End of a month offset (exclusive), or the end of today for the current month. */
export function monthEnd(offset: number): number {
  return offset === 0 ? WIP_TODAY + DAY_MS : monthStart(offset - 1);
}

/** "Jan 2026" for a month offset. */
export function monthCategory(offset: number): string {
  const d = new Date(monthStart(offset));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Month offsets (oldest first; 0 = this month) covered by a period preset, and the previous period of the same length. */
export function periodOffsets(period: string): { current: number[]; previous: number[] } {
  const month = new Date(WIP_TODAY).getUTCMonth();
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

export const WIP_GROUP = 'Purple IQ Group';
export const WIP_ORGANIZATIONS = [WIP_GROUP, 'Purple IQ UAE', 'Purple IQ KSA'];

export interface DemoProduct {
  name: string;
  /** Standard cost per unit, AED */
  unitCost: number;
}

export const WIP_PRODUCTS: DemoProduct[] = [
  { name: 'Control Panel CP-200', unitCost: 410 },
  { name: 'Pump Housing PH-45', unitCost: 185 },
  { name: 'Valve Assembly VA-12', unitCost: 96 },
  { name: 'Cable Harness CH-8', unitCost: 38 },
  { name: 'Steel Enclosure EN-30', unitCost: 140 },
  { name: 'Bracket Kit BK-5', unitCost: 22 }
];

export interface DemoLine {
  name: string;
  plant: string;
  organization: string;
  workCenters: string[];
  /** Products made on the line and their share of its output */
  products: [string, number][];
  /** Monthly planned output at full load (units) */
  capacity: number;
  utilization: number;
  availability: number;
  /** Downtime hours per month by cause (DOWNTIME_CAUSES order) */
  downtime: number[];
}

export const WIP_LINES: DemoLine[] = [
  {
    name: 'Assembly Line 1', plant: 'Jebel Ali Plant', organization: 'Purple IQ UAE', workCenters: ['Sub-Assembly Cell A', 'Final Assembly A'],
    products: [['Control Panel CP-200', 0.55], ['Cable Harness CH-8', 0.45]], capacity: 5200, utilization: 88, availability: 92, downtime: [12, 6, 9, 3, 4]
  },
  {
    name: 'Machining Line 1', plant: 'Jebel Ali Plant', organization: 'Purple IQ UAE', workCenters: ['CNC Cell 1', 'CNC Cell 2'],
    products: [['Pump Housing PH-45', 0.6], ['Valve Assembly VA-12', 0.4]], capacity: 3800, utilization: 91, availability: 89, downtime: [18, 4, 11, 2, 6]
  },
  {
    name: 'Fabrication Line 1', plant: 'Sharjah Plant', organization: 'Purple IQ UAE', workCenters: ['Laser Cutting', 'Welding Bay 2'],
    products: [['Steel Enclosure EN-30', 0.7], ['Bracket Kit BK-5', 0.3]], capacity: 4400, utilization: 79, availability: 87, downtime: [15, 12, 8, 4, 7]
  },
  {
    name: 'Paint & Finish Line', plant: 'Sharjah Plant', organization: 'Purple IQ UAE', workCenters: ['Powder Coat Booth', 'Curing Oven'],
    products: [['Steel Enclosure EN-30', 0.5], ['Bracket Kit BK-5', 0.5]], capacity: 6100, utilization: 72, availability: 85, downtime: [9, 15, 6, 7, 5]
  },
  {
    name: 'Assembly Line 2', plant: 'Dammam Plant', organization: 'Purple IQ KSA', workCenters: ['Valve Assembly Cell', 'Test Bench 1'],
    products: [['Valve Assembly VA-12', 0.65], ['Pump Housing PH-45', 0.35]], capacity: 4700, utilization: 86, availability: 91, downtime: [10, 8, 7, 3, 3]
  },
  {
    name: 'Packaging Line 1', plant: 'Dammam Plant', organization: 'Purple IQ KSA', workCenters: ['Packing Station', 'Palletizer'],
    products: [['Cable Harness CH-8', 0.4], ['Bracket Kit BK-5', 0.35], ['Valve Assembly VA-12', 0.25]], capacity: 9800, utilization: 83, availability: 93,
    downtime: [5, 7, 10, 2, 3]
  }
];
export const WIP_PLANTS = [...new Set(WIP_LINES.map((l) => l.plant))];

/** One line's figures for one month. */
export interface DemoLineMonth {
  planned: number;
  actual: number;
  target: number;
  availability: number;
  performance: number;
  quality: number;
  utilization: number;
  downtime: number[];
}

export interface DemoOrder {
  key: string;
  code: string;
  product: string;
  line: DemoLine;
  workCenter: string;
  assetId: string;
  planned: number;
  unitCost: number;
  raised: number;
  due: number;
  /** Share of the planned duration completed per day of work (below 1 runs late) */
  pace: number;
  /** Planned working days */
  duration: number;
  onHold: boolean;
  priority: string;
}

function buildDemo(): { months: Map<string, DemoLineMonth[]>; orders: DemoOrder[] } {
  const rand = seeded(777001);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const months = new Map<string, DemoLineMonth[]>();
  for (const line of WIP_LINES) {
    months.set(line.name, Array.from({ length: HISTORY_MONTHS }, (_, m) => {
      const start = monthStart(m);
      const days = Math.round((monthStart(m - 1) - start) / DAY_MS);
      const elapsed = m === 0 ? Math.min(days, Math.round((WIP_TODAY - start) / DAY_MS) + 1) / days : 1;
      // Ramadan / summer slowdown and a gradual improvement as the lines mature
      const season = 1 - 0.07 * Math.max(0, Math.sin(((new Date(start).getUTCMonth() - 4) / 12) * 2 * Math.PI));
      const improve = 1 + (HISTORY_MONTHS - m) * 0.003;
      const planned = Math.round(line.capacity * season * between(0.94, 1.06) * elapsed);
      const availability = Math.min(98, line.availability * improve * between(0.97, 1.02));
      const performance = Math.min(98, between(84, 93) * improve);
      const quality = Math.min(99.6, between(96.2, 99.2));
      return {
        planned,
        actual: Math.round(planned * between(0.86, 1.01) * improve),
        target: Math.round(line.capacity * 0.95 * elapsed),
        availability: Math.round(availability * 10) / 10,
        performance: Math.round(performance * 10) / 10,
        quality: Math.round(quality * 10) / 10,
        utilization: Math.round(Math.min(98, line.utilization * between(0.95, 1.04)) * 10) / 10,
        downtime: line.downtime.map((h) => Math.round(h * between(0.6, 1.4) * elapsed * 10) / 10)
      };
    }));
  }

  const orders: DemoOrder[] = [];
  let seq = 2400;
  const lastRaise = WIP_TODAY;
  for (let m = HISTORY_MONTHS - 1; m >= 0; m--) {
    const start = monthStart(m);
    const end = Math.min(monthStart(m - 1), lastRaise + DAY_MS);
    for (const line of WIP_LINES) {
      const count = Math.round(((end - start) / DAY_MS / 30) * between(6, 9));
      for (let k = 0; k < count; k++) {
        const r = rand();
        let acc = 0;
        const product = line.products.find(([, share]) => (acc += share) >= r)?.[0] ?? line.products[0][0];
        const raised = start + Math.floor(rand() * Math.max(1, (end - start) / DAY_MS)) * DAY_MS;
        const duration = Math.round(between(8, 24));
        seq += 1 + Math.floor(rand() * 2);
        orders.push({
          key: `po-${seq}`,
          code: `PO-${new Date(raised).getUTCFullYear()}-${String(seq).padStart(5, '0')}`,
          product,
          line,
          workCenter: line.workCenters[Math.floor(rand() * line.workCenters.length)],
          assetId: `AST-2026-${line.plant.slice(0, 3).toUpperCase()}-${String(500 + WIP_LINES.indexOf(line) * 10 + Math.floor(rand() * 4)).padStart(6, '0')}`,
          planned: Math.round(between(80, 1400) / 10) * 10,
          unitCost: WIP_PRODUCTS.find((p) => p.name === product)?.unitCost ?? 100,
          raised,
          due: raised + duration * DAY_MS,
          pace: rand() < 0.84 ? between(1, 1.18) : between(0.72, 0.98),
          duration,
          onHold: rand() < 0.1,
          priority: rand() < 0.15 ? 'High' : rand() < 0.7 ? 'Medium' : 'Low'
        });
      }
    }
  }
  return { months, orders };
}

/** Two years of monthly line figures and production orders (so the previous period always has data). */
export const WIP_DEMO = buildDemo();
