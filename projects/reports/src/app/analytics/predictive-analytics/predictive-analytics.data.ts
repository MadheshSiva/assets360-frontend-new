import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';

// View models for the Predictive Analytics page. Every figure comes from /api/predictive-analytics (predictive-analytics.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_RISK_LEVELS = 'All risk levels';
export const ALL_PREDICTIONS_VIEW = 'All Predictions';

/** Risk levels used until /options answers (PredictiveAnalyticsCalculator.RiskLevels). */
export const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
export const RISK_OPTIONS = [ALL_RISK_LEVELS, ...RISK_LEVELS];

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const PA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const PA_DEFAULT_PERIOD = 'This year';

/** Defaults used until the API reports the values it applied. */
export const ACCURACY_TARGET = 90;
/** Predictions with lower model confidence go to an engineer before anyone acts on them. */
export const REVIEW_CONFIDENCE = 70;
export const HIGH_RISK_SCORE = 60;
export const FAILURE_WINDOW_DAYS = 30;

export const RISK_COLORS: Record<string, string> = { Critical: RA_COLORS.red, High: RA_COLORS.orange, Medium: RA_COLORS.blue, Low: RA_COLORS.green };

/** A monitored asset's current prediction (API AssetPrediction). Missing measurements are null. */
export interface PaAsset {
  /** Record key used by the insight lists */
  key: string;
  id: string;
  name: string;
  location: string;
  category: string;
  type: string;
  risk: string;
  /** 0–100: 100 minus the model's health score */
  riskScore: number | null;
  health: number | null;
  confidence: number | null;
  /** Days to the predicted failure; null once resolved or when the model gave no date */
  failureWindowDays: number | null;
  rulHours: number | null;
  predictedFailureDate: string | null;
  issue: string | null;
  model: string | null;
  sensor: string | null;
  action: string;
  vibrationAnomaly: boolean;
  /** Technician on the asset's latest open work order */
  owner: string;
  alertStatus: string;
}

export interface ModelRow {
  type: string;
  monitored: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  /** Predictions checked against outcomes in the period */
  evaluated: number;
  /** Online (scored in the last 30 days) or Inactive */
  status: string;
  models: string[];
}

/** A KPI value with its change against the previous period (0 when there is nothing to compare). */
export interface PaKpiValue {
  value: number | null;
  change: number;
}

export interface PaInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  amount: number | null;
  assetKeys: string[];
}

export interface PredictiveView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  accuracyTarget: number;
  reviewConfidence: number;
  highRiskScore: number;
  failureWindowDays: number;
  monitoredKpi: PaKpiValue;
  highRiskKpi: PaKpiValue;
  failuresKpi: PaKpiValue;
  accuracyKpi: PaKpiValue;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  evaluated: number;
  labels: string[];
  riskTrend: ChartSeries[];
  rulForecast: ChartSeries[];
  riskSlices: ChartSlice[];
  anomalies: ChartSeries[];
  costForecast: ChartSeries[];
  avoided: number;
  avoidedByMonth: number[];
  preventedFailures: number;
  /** Every monitored asset, highest risk score first, and how many there are in all */
  predictions: PaAsset[];
  predictionTotal: number;
  /** Critical + High, highest risk first */
  actionList: PaAsset[];
  failures: PaAsset[];
  vibration: PaAsset[];
  review: PaAsset[];
  models: ModelRow[];
  insights: PaInsight[];
}

const none = (): PaKpiValue => ({ value: null, change: 0 });

/** What the page shows before the first response. */
export function emptyPredictive(): PredictiveView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    accuracyTarget: ACCURACY_TARGET,
    reviewConfidence: REVIEW_CONFIDENCE,
    highRiskScore: HIGH_RISK_SCORE,
    failureWindowDays: FAILURE_WINDOW_DAYS,
    monitoredKpi: none(),
    highRiskKpi: none(),
    failuresKpi: none(),
    accuracyKpi: none(),
    accuracy: null,
    precision: null,
    recall: null,
    falsePositiveRate: null,
    evaluated: 0,
    labels: [],
    riskTrend: [],
    rulForecast: [],
    riskSlices: [],
    anomalies: [],
    costForecast: [],
    avoided: 0,
    avoidedByMonth: [],
    preventedFailures: 0,
    predictions: [],
    predictionTotal: 0,
    actionList: [],
    failures: [],
    vibration: [],
    review: [],
    models: [],
    insights: []
  };
}

export function failureWindow(a: PaAsset): string {
  if (a.failureWindowDays !== null) return a.failureWindowDays === 0 ? 'Overdue' : `Within ${a.failureWindowDays} days`;
  return a.predictedFailureDate ? 'Resolved' : 'No failure predicted';
}
