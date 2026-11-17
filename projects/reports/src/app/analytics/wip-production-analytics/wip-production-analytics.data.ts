import { RA_COLORS } from '../shared/charts/chart-utils';
import { PeriodWindow, periodWindow, siteInScope, sumOf } from '../inventory-analytics/parts/ra-parts';

// Production analytics: lines, products, work centers, monthly series and active orders come from the production
// system. No data source is wired yet, so everything starts empty and each widget shows its empty state.

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

export const LINES: ProductionLine[] = [];
export const PLANTS = [...new Set(LINES.map((l) => l.site))];
export const UTILIZATION_TARGET = 85;

export interface Product {
  code: string;
  name: string;
  share: number;
  /** Standard cost per unit, AED */
  unitCost: number;
}

export const PRODUCTS: Product[] = [];

export interface WorkCenter {
  code: string;
  name: string;
  queue: number;
  avgWait: number;
  capacity: number;
}

export const WORK_CENTERS: WorkCenter[] = [];

export const WIP_STAGES = ['Raw Material', 'In Process', 'Quality Inspection', 'Ready for Dispatch'];
export const WIP_STAGE_COLORS = [RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.pink];

export const WORK_ORDER_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
export const WORK_ORDER_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink];

export const DOWNTIME_CAUSES = ['Mechanical', 'Material Shortage', 'Changeover', 'Quality Hold', 'Unplanned'];

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

export const ORDERS: ProductionOrder[] = [];

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

  // Monthly series (output, WIP by stage, OEE components) and downtime are not available until a data source is wired
  const actual: number[] = [];
  const planned: number[] = [];
  const target: number[] = [];
  const stageStacks: number[][] = WIP_STAGES.map(() => []);
  const availability: number[] = [];
  const performance: number[] = [];
  const quality: number[] = [];
  const oeeTrend: number[] = [];
  const downtime = DOWNTIME_CAUSES.map(() => 0);

  const lineNames = lines.map((l) => l.name);
  const orders = ORDERS.filter((o) => lineNames.includes(o.line) && (!product || o.product === product.name)
    && (f.workCenter === ALL_WORK_CENTERS || f.workCenter === o.workCenter));

  const workCenters = WORK_CENTERS.filter((c) => f.workCenter === ALL_WORK_CENTERS || f.workCenter === c.name).map((c) => ({
    ...c,
    risk: (c.capacity >= 85 ? 'High' : c.capacity >= 70 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low'
  }));

  return {
    window: w,
    hasScope: lines.length > 0,
    output: sumOf(actual),
    wipValue: sumOf(orders.map((o) => o.wipValue)),
    onTime: weighted(lines, (l) => l.onTime),
    utilization: weighted(lines, (l) => l.utilization),
    oee: oeeTrend.length ? sumOf(oeeTrend) / oeeTrend.length : 0,
    actual,
    planned,
    target,
    stageStacks,
    workOrders: WORK_ORDER_STATUSES.map(() => 0),
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
