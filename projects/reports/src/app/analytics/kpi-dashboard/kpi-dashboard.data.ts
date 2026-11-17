import { money } from '../shared/analytics-common';

// View models and static demo catalogue for the KPI Dashboard. Figures are worked out in kpi-dashboard.service.ts.

export const KPI_MODULES = ['Asset', 'Maintenance', 'Inspection', 'Inventory', 'Operations', 'Compliance', 'Financial'] as const;
export type KpiModule = (typeof KPI_MODULES)[number];
export const KPI_UNITS = ['%', 'count', 'AED', 'x', 'hrs'] as const;
export type KpiUnit = (typeof KPI_UNITS)[number];
export type KpiDirection = 'higher' | 'lower';
export type KpiStatus = 'On Track' | 'Watch' | 'At Risk' | 'Over Budget' | 'No Data';

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_CATEGORIES = 'All categories';
export const KD_DEFAULT_VIEW = 'executive';

/** Period presets. "Custom" is left out: the filter bar has no date pickers. */
export const KD_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const KD_DEFAULT_PERIOD = 'This year';

export interface KpiDef {
  id: string;
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  /** The defined target (flow KPIs: annual amount, pro-rated to the period) */
  target: number;
  direction: KpiDirection;
  /** '' when nobody owns the KPI yet */
  owner: string;
  info: string;
  /** Catalogue metric the KPI measures; null = manually reported value */
  metric: string | null;
  manualValue: number | null;
  /** Amount accumulates over the period (cost) */
  flow: boolean;
  /** Monthly values exist (false for figures known only as of now, e.g. stock on hand) */
  history: boolean;
  source: string;
  /** Next review / action date (yyyy-MM-dd) or null */
  reviewDue: string | null;
  custom: boolean;
}

/** A catalogue metric a custom KPI can measure. */
export interface KpiMetric {
  id: string;
  name: string;
  module: string;
  unit: KpiUnit;
  direction: KpiDirection;
  history: boolean;
  source: string;
  info: string;
}

export interface KpiViewDef {
  key: string;
  label: string;
  dashboard: string;
  custom: boolean;
  /** Tiles in order, hidden ones included */
  items: { id: string; visible: boolean }[];
  defaultIds: string[];
}

export interface KpiState {
  def: KpiDef;
  value: number | null;
  /** Period target (pro-rated for flow KPIs) */
  target: number;
  status: KpiStatus;
  valueText: string;
  targetText: string;
  varianceText: string;
  changeText: string;
  changeUp: boolean;
  changeGood: boolean;
  spark: number[];
  /** Values per month of the period (monthLabels) for KPIs with history on the view; null = nothing measured */
  monthly: (number | null)[];
  attainment: number;
  /** Formatted next review date, or "—" */
  due: string;
  /** Days until the next review (negative = overdue); null when not set */
  dueInDays: number | null;
}

export interface KpiInsightVm {
  key: string;
  tone: string;
  title: string;
  text: string;
  actionLabel: string;
  action: 'exceptions' | 'plan' | 'settings' | 'due-week';
  kpiId: string | null;
  kpiIds: string[];
}

export interface KpiTrendVm {
  labels: string[];
  overall: number[];
  target: number[];
  prior: number[];
}

/** Everything the page shows for one view and filter bar. */
export interface KpiDashboardVm {
  generatedAt: string | null;
  monthLabels: string[];
  views: KpiViewDef[];
  viewKey: string;
  tiles: KpiState[];
  kpis: KpiState[];
  trend: KpiTrendVm;
  targets: { module: string; value: number }[];
  exceptions: KpiState[];
  insights: KpiInsightVm[];
  library: { module: KpiModule; count: number }[];
}

export function emptyKpiDashboard(): KpiDashboardVm {
  return {
    generatedAt: null,
    monthLabels: [],
    views: [],
    viewKey: KD_DEFAULT_VIEW,
    tiles: [],
    kpis: [],
    trend: { labels: [], overall: [], target: [], prior: [] },
    targets: [],
    exceptions: [],
    insights: [],
    library: KPI_MODULES.map((module) => ({ module, count: 0 }))
  };
}

export const STATUS_TONE: Record<KpiStatus, string> = { 'On Track': 'green', Watch: 'orange', 'At Risk': 'red', 'Over Budget': 'pink', 'No Data': 'grey' };

export function formatKpi(value: number, unit: KpiUnit): string {
  switch (unit) {
    case '%':
      return `${Number(value.toFixed(1))}%`;
    case 'AED':
      return money(value);
    case 'x':
      return `${Number(value.toFixed(1))}x`;
    case 'hrs':
      return `${Number(value.toFixed(1)).toLocaleString('en-US')} hrs`;
    default:
      return Math.round(value).toLocaleString('en-US');
  }
}

export function signedText(v: number, digits: number, suffix: string): string {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : ''}${r}${suffix}`;
}

/** "Budget AED 1.72M", "Target 95%", "Target <15" */
export function targetLabel(def: KpiDef, target: number, basis: string): string {
  if (def.unit === 'AED') return `${basis === 'budget' || def.flow ? 'Budget' : 'Target'} ${money(target)}`;
  const t = formatKpi(target, def.unit);
  return def.direction === 'lower' && def.unit === 'count' ? `Target <${t}` : `Target ${t}`;
}

// ----- Static demo catalogue -----

/** A built-in KPI: its definition plus the demo figures it is measured from. */
export interface KpiSeed {
  id: string;
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  direction: KpiDirection;
  /** Target; for flow KPIs the annual budget */
  target: number;
  /** Value this month (flow KPIs: spend vs budget ratio, e.g. 1.06 = 6% over) */
  value: number;
  owner: string;
  info: string;
  source: string;
  flow?: boolean;
  /** false = only known as of now (no monthly history) */
  history?: boolean;
  /** Days from today to the next review */
  reviewIn: number;
}

const k = (
  id: string, name: string, module: KpiModule, unit: KpiUnit, direction: KpiDirection, target: number, value: number, owner: string, reviewIn: number,
  source: string, info: string, extra: Partial<KpiSeed> = {}
): KpiSeed => ({ id, name, module, unit, direction, target, value, owner, reviewIn, source, info, ...extra });

export const KPI_SEEDS: KpiSeed[] = [
  // Asset
  k('health', 'Asset Health Score', 'Asset', '%', 'higher', 85, 87.4, 'Omar Hassan', 12, 'Condition Monitoring', 'Weighted condition score across monitored assets'),
  k('utilization', 'Asset Utilization', 'Asset', '%', 'higher', 80, 78.9, 'James Tan', 3, 'Tracking & IoT', 'Productive hours ÷ available hours'),
  k('availability', 'Asset Availability', 'Asset', '%', 'higher', 95, 96.3, 'Omar Hassan', 21, 'Maintenance', 'Share of time assets were available for use'),
  k('mtbf', 'MTBF', 'Asset', 'hrs', 'higher', 1200, 1284, 'Rahul Mehta', 30, 'Maintenance', 'Mean time between failures'),
  k('prediction', 'Prediction Accuracy', 'Asset', '%', 'higher', 90, 86.4, 'Daniel Kim', 5, 'Predictive Maintenance', 'Predicted failures confirmed by inspection or breakdown'),
  k('missing', 'Missing Assets', 'Asset', 'count', 'lower', 40, 37, '', 14, 'Asset Audit', 'Assets not located in the last audit or scan', { history: false }),
  // Maintenance
  k('pm', 'Preventive Compliance', 'Maintenance', '%', 'higher', 90, 92.1, 'Aisha Rahman', 9, 'Maintenance', 'Preventive work orders completed on schedule'),
  k('openWo', 'Open Work Orders', 'Maintenance', 'count', 'lower', 100, 104, 'Aisha Rahman', 2, 'Maintenance', 'Work orders not yet closed'),
  k('overdueWo', 'Overdue Work Orders', 'Maintenance', 'count', 'lower', 15, 23, 'Ahmed Khan', -2, 'Maintenance', 'Open work orders past their due date'),
  k('mttr', 'MTTR', 'Maintenance', 'hrs', 'lower', 8, 7.2, 'Ahmed Khan', 18, 'Maintenance', 'Mean time to repair'),
  k('cost', 'Maintenance Cost', 'Maintenance', 'AED', 'lower', 1_860_000, 1.07, 'Priya Sharma', 4, 'Finance Integration', 'Maintenance spend against budget', { flow: true }),
  // Inspection
  k('inspection', 'Inspection Completion', 'Inspection', '%', 'higher', 95, 93.9, 'Lisa Wong', 6, 'Inspection', 'Completed ÷ due inspections'),
  k('openFindings', 'Open Findings', 'Inspection', 'count', 'lower', 130, 118, 'Lisa Wong', 11, 'Inspection', 'Inspection findings not yet closed'),
  k('criticalFindings', 'Critical Findings', 'Inspection', 'count', 'lower', 10, 7, 'Fatima Ali', 1, 'Inspection', 'Open findings rated critical'),
  // Inventory
  k('turnover', 'Inventory Turnover', 'Inventory', 'x', 'higher', 6, 5.4, 'Mohammed Ali', 25, 'Inventory', 'Cost of goods issued ÷ average stock value'),
  k('accuracy', 'Stock Accuracy', 'Inventory', '%', 'higher', 98, 98.9, 'Mohammed Ali', 40, 'Inventory', 'Cycle-count matches ÷ items counted'),
  k('reorder', 'Items Below Reorder', 'Inventory', 'count', 'lower', 200, 164, 'John Mathew', 8, 'Inventory', 'Stock items under their reorder point', { history: false }),
  // Operations
  k('oee', 'Overall Equipment Effectiveness', 'Operations', '%', 'higher', 85, 83.1, 'Michael Chen', 7, 'WIP / Operations', 'Availability × performance × quality'),
  k('onTime', 'On-Time Production', 'Operations', '%', 'higher', 95, 96.2, 'Michael Chen', 16, 'WIP / Operations', 'Production orders completed by their due date'),
  k('telemetry', 'Telemetry Availability', 'Operations', '%', 'higher', 97, 98.1, 'Daniel Kim', 28, 'Tracking & IoT', 'Connected assets reporting within their interval'),
  k('alerts', 'Active IoT Alerts', 'Operations', 'count', 'lower', 40, 46, 'Daniel Kim', 3, 'Tracking & IoT', 'Unacknowledged IoT alerts'),
  // Compliance
  k('compliance', 'Compliance Score', 'Compliance', '%', 'higher', 90, 92.4, 'Fatima Noor', 13, 'Audit & Compliance', 'Weighted score across regulations and standards'),
  k('capa', 'CAPA Closure Rate', 'Compliance', '%', 'higher', 90, 86.3, 'Fatima Noor', 0, 'Audit & Compliance', 'Corrective actions closed ÷ raised'),
  k('overdueCapa', 'Overdue CAPA Actions', 'Compliance', 'count', 'lower', 5, 4, 'Priya Nair', 10, 'Audit & Compliance', 'Corrective actions past due'),
  k('expiring', 'Expiring Certifications', 'Compliance', 'count', 'lower', 20, 18, '', 35, 'Audit & Compliance', 'Permits and certificates expiring within 90 days'),
  // Financial
  k('capex', 'Capital Expenditure', 'Financial', 'AED', 'lower', 6_200_000, 0.93, 'Sarah Ahmed', 20, 'Finance Integration', 'Capex spend against the approved budget', { flow: true }),
  k('opex', 'Operating Expenditure', 'Financial', 'AED', 'lower', 9_400_000, 1.03, 'Sarah Ahmed', 6, 'Finance Integration', 'Asset operating spend against budget', { flow: true }),
  k('inventoryValue', 'Inventory Value', 'Financial', 'AED', 'lower', 3_600_000, 3_480_000, 'Mohammed Ali', 22, 'Inventory', 'Stock on hand at cost vs. the holding ceiling', { history: false }),
  k('wip', 'WIP Value', 'Financial', 'AED', 'lower', 1_200_000, 1_270_000, 'Michael Chen', 9, 'WIP / Operations', 'Work in progress at cost vs. the ceiling', { history: false })
];

/** Default tiles per standard view, plus one saved custom view. */
export const KPI_VIEW_SEEDS: { key: string; label: string; dashboard: string; custom: boolean; ids: string[] }[] = [
  {
    key: 'executive', label: 'Executive', dashboard: 'Executive KPI Overview', custom: false,
    ids: ['health', 'pm', 'utilization', 'cost', 'openWo', 'inspection', 'turnover', 'oee', 'compliance', 'onTime', 'prediction', 'capa']
  },
  { key: 'operations', label: 'Operations', dashboard: 'Operations KPI Overview', custom: false, ids: ['oee', 'onTime', 'utilization', 'availability', 'openWo', 'inspection', 'telemetry', 'alerts'] },
  { key: 'maintenance', label: 'Maintenance', dashboard: 'Maintenance KPI Overview', custom: false, ids: ['pm', 'openWo', 'overdueWo', 'cost', 'mttr', 'mtbf', 'health', 'prediction'] },
  { key: 'finance', label: 'Finance', dashboard: 'Finance KPI Overview', custom: false, ids: ['cost', 'capex', 'opex', 'inventoryValue', 'wip', 'turnover'] },
  { key: 'custom:my-kpis', label: 'My KPIs', dashboard: 'My KPIs (custom)', custom: true, ids: ['compliance', 'capa', 'overdueCapa', 'expiring', 'criticalFindings', 'openFindings'] }
];
