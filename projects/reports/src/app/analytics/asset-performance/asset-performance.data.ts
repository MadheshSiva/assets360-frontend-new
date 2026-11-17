import { ChartSeries, HBarRow } from '../shared/charts';

// View models for the Asset Performance page. Every figure comes from /api/asset-performance (asset-performance.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_ASSETS_VIEW = 'All Assets';

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const AP_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const AP_DEFAULT_PERIOD = 'This year';

/** Used until the API reports the thresholds it applied (AssetPerformanceOptions defaults). */
export const AP_DEFAULT_HEALTH_THRESHOLD = 60;
export const AP_DEFAULT_UTILIZATION_TARGET = 60;

/** One asset's figures over the period (API AssetPerformanceRow). Missing measurements are null. */
export interface ApAssetRow {
  /** Record id */
  key: string;
  /** Asset ID shown to users (falls back to the record id) */
  id: string;
  name: string;
  category: string;
  type: string;
  location: string;
  health: number | null;
  utilization: number | null;
  availability: number | null;
  mtbf: number | null;
  mttr: number | null;
  downtime: number;
  failures: number;
  score: number | null;
  band: string | null;
  /** Top Performer, On Track, Underperforming or Not rated */
  status: string;
}

export interface ApLocationRow {
  name: string;
  assets: number;
  health: number | null;
  utilization: number | null;
  availability: number | null;
  score: number | null;
  status: string;
}

/** An asset named on an insight card. */
export interface ApInsightAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  health: number | null;
  reasons: string[];
}

export interface ApInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  assets: ApInsightAsset[];
  locations: string[];
  actions: string[];
  /** Query string for /assets or /locations behind "View assets" / "View locations", e.g. healthBelow=60 */
  query: string;
}

/** A KPI value with its change against the previous period (0 when there is nothing to compare). */
export interface ApKpiValue {
  value: number | null;
  change: number;
}

export interface AssetPerformanceView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  healthThreshold: number;
  utilizationTarget: number;
  total: number;
  totalChange: number;
  health: ApKpiValue;
  utilization: ApKpiValue;
  availability: ApKpiValue;
  mtbf: ApKpiValue;
  mttr: ApKpiValue;
  labels: string[];
  healthTrend: ChartSeries[];
  categoryLabels: string[];
  categoryUtilization: ChartSeries[];
  distribution: HBarRow[];
  ratedAssets: number;
  notRated: number;
  reliability: ChartSeries[];
  downtime: ChartSeries[];
  downtimeHours: number;
  topBottom: ApAssetRow[];
  locations: ApLocationRow[];
  insights: ApInsight[];
}

const none = (): ApKpiValue => ({ value: null, change: 0 });

/** What the page shows before the first response. */
export function emptyAssetPerformance(): AssetPerformanceView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    healthThreshold: AP_DEFAULT_HEALTH_THRESHOLD,
    utilizationTarget: AP_DEFAULT_UTILIZATION_TARGET,
    total: 0,
    totalChange: 0,
    health: none(),
    utilization: none(),
    availability: none(),
    mtbf: none(),
    mttr: none(),
    labels: [],
    healthTrend: [],
    categoryLabels: [],
    categoryUtilization: [],
    distribution: [],
    ratedAssets: 0,
    notRated: 0,
    reliability: [],
    downtime: [],
    downtimeHours: 0,
    topBottom: [],
    locations: [],
    insights: []
  };
}
