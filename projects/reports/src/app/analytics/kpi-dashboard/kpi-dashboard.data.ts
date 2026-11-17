import { money } from '../shared/analytics-common';

// View models for the KPI Dashboard. Every figure comes from /api/kpi-dashboard (kpi-dashboard.service.ts).

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

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const KD_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const KD_DEFAULT_PERIOD = 'This year';

export interface KpiDef {
  id: string;
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  /** The defined target (flow KPIs: annual amount, pro-rated to the period by the API) */
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

/** A catalogue metric a custom KPI can measure (/options). */
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

/** The page as GET /overview returns it. */
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
