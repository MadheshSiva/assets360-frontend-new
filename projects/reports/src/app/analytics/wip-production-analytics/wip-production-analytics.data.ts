import { RA_COLORS } from '../shared/charts/chart-utils';

// View models for the WIP / Production Analytics page. Every figure comes from /api/production-analytics
// (wip-production-analytics.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_PLANTS = 'All plants';
export const ALL_LINES = 'All production lines';
export const ALL_WORK_CENTERS = 'All work centers';
export const ALL_PRODUCTS = 'All products';
export const ALL_PRODUCTION_VIEW = 'All Production';

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const PA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const PA_DEFAULT_PERIOD = 'This year';

/** Used until the API reports the target it applied (ProductionAnalyticsOptions.DefaultUtilizationTarget). */
export const UTILIZATION_TARGET = 85;

export const WIP_STAGES = ['Raw Material', 'In Process', 'Quality Inspection', 'Ready for Dispatch'];
export const WIP_STAGE_COLORS = [RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.pink];

export const WORK_ORDER_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
export const WORK_ORDER_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink];

/** Downtime causes shown until the first response (the API may add others, e.g. Planned). */
export const DOWNTIME_CAUSES = ['Mechanical', 'Material Shortage', 'Changeover', 'Quality Hold', 'Unplanned'];

/** An unfinished production order (API ProductionOrderRow). Quantities are null when the jobs carry none. */
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

/** A Bottleneck Work Centers row (API BottleneckRow). */
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
  /** Query string for /orders behind "View orders", e.g. schedule=At Risk,Delayed */
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

/** What the page shows before the first response. */
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
