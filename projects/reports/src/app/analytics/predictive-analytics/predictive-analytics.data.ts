import { RA_MONTH_LABELS } from '../shared/analytics-common';
import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';
import { RISK_LEVELS, RaAsset, RaScope, RaWorkOrder, inScope, mean, periodMonths, round1 } from '../asset-performance/kit/asset-universe';

// Predictions (risk level, risk score, remaining useful life and failure window per monitored asset), model quality,
// anomaly events and avoided cost come from the predictive service. No data source is wired yet, so all start empty.
const PA_ASSETS: RaAsset[] = [];
const PA_WORK_ORDERS: RaWorkOrder[] = [];
const PA_MODELS: ModelRow[] = [];

export const ALL_RISK_LEVELS = 'All risk levels';
export const RISK_OPTIONS = [ALL_RISK_LEVELS, ...RISK_LEVELS];
export const ACCURACY_TARGET = 90;
/** Predictions with lower model confidence go to an engineer before anyone acts on them. */
export const REVIEW_CONFIDENCE = 70;

/** Change vs the previous period shown on the KPI cards (%). Not available until a data source is wired. */
export const PA_DELTAS = { monitored: 0, highRisk: 0, failures: 0, accuracy: 0 };

export const RISK_COLORS: Record<string, string> = { Critical: RA_COLORS.red, High: RA_COLORS.orange, Medium: RA_COLORS.blue, Low: RA_COLORS.green };

const ANOMALY_TYPES = ['Temperature', 'Vibration', 'Energy', 'Pressure'];
const ANOMALY_COLORS = [RA_COLORS.red, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.violet];

export interface ModelRow {
  type: string;
  monitored: number;
  accuracy: number;
  precision: number;
  recall: number;
  status: 'Online' | 'Training';
}

export interface PredictiveView {
  assets: RaAsset[];
  monitored: RaAsset[];
  highRisk: number;
  failures: RaAsset[];
  accuracy: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  labels: string[];
  riskTrend: ChartSeries[];
  rulForecast: ChartSeries[];
  riskSlices: ChartSlice[];
  anomalies: ChartSeries[];
  costForecast: ChartSeries[];
  avoided: number;
  avoidedByMonth: number[];
  /** Critical + High, highest risk first */
  actionList: RaAsset[];
  models: ModelRow[];
  vibration: RaAsset[];
  review: RaAsset[];
}

export function failureWindow(a: RaAsset): string {
  if (a.failureWindowDays !== null) return `Within ${a.failureWindowDays} days`;
  const days = Math.ceil(a.rulHours / 24);
  return days > 90 ? '> 90 days' : `${days} days`;
}

export function recommendedAction(a: RaAsset): string {
  if (a.vibrationAnomaly) return 'Inspect vibration';
  if (a.failureWindowDays !== null && a.failureWindowDays <= 14) return 'Schedule maintenance';
  if (a.risk === 'Critical') return 'Inspect and service';
  return 'Monitor closely';
}

export function buildPredictive(scope: RaScope, period: string, risk: string, compare: boolean): PredictiveView {
  const assets = PA_ASSETS.filter((a) => inScope(a, scope));
  const monitored = assets.filter((a) => a.monitored && (risk === ALL_RISK_LEVELS || a.risk === risk));
  const months = periodMonths(period);
  const labels = months.map((m) => RA_MONTH_LABELS[m]).filter((l) => l !== undefined);

  // Failure risk: today's average risk score per band, rising through the year (drift = monthly share)
  const bands: [string, RaAsset[], number, string][] = [
    ['High Risk', monitored.filter((a) => a.risk === 'Critical' || a.risk === 'High'), 0.028, RA_COLORS.red],
    ['Medium Risk', monitored.filter((a) => a.risk === 'Medium'), 0.035, RA_COLORS.orange],
    ['Low Risk', monitored.filter((a) => a.risk === 'Low'), 0.04, RA_COLORS.green]
  ];
  const riskTrend: ChartSeries[] = bands
    .filter(([, list]) => list.length)
    .map(([name, list, drift, color]) => {
      const now = mean(list.map((a) => a.riskScore));
      return { name, values: months.map((m) => round1(now * (1 - (9 - m) * drift))), color };
    });
  if (compare && riskTrend.length) {
    riskTrend.push({ name: `${riskTrend[0].name} (previous period)`, values: riskTrend[0].values.map((v) => round1(v * 1.06)), color: riskTrend[0].color, dashed: true });
  }
  riskTrend.push({ name: 'High Risk Threshold', values: months.map(() => 80), color: RA_COLORS.grey, dashed: true });

  // Remaining useful life: today's average, higher earlier in the year
  const elevated = monitored.filter((a) => a.risk === 'Critical' || a.risk === 'High');
  const groups: [string, RaAsset[], string][] = [
    ['Critical Assets', elevated, RA_COLORS.purple],
    ['Rotating Equipment', monitored.filter((a) => a.type === 'Rotating Equipment'), RA_COLORS.blue],
    ['Static Equipment', monitored.filter((a) => a.type === 'Static Equipment'), RA_COLORS.green]
  ];
  const rulForecast: ChartSeries[] = groups
    .filter(([, list]) => list.length)
    .map(([name, list, color]) => {
      const now = mean(list.map((a) => a.rulHours));
      return { name, values: months.map((m) => Math.round(now * (1 + (9 - m) * 0.07))), color, area: name === 'Critical Assets' };
    });
  if (rulForecast.length && rulForecast[0].name === 'Critical Assets') {
    const base = rulForecast[0].values;
    rulForecast.push({ name: 'Confidence band (upper)', values: base.map((v) => Math.round(v * 1.12)), color: RA_COLORS.lavender, dashed: true });
    rulForecast.push({ name: 'Confidence band (lower)', values: base.map((v) => Math.round(v * 0.88)), color: RA_COLORS.lavender, dashed: true });
  }

  const riskSlices: ChartSlice[] = RISK_LEVELS.map((r) => ({ name: r, value: monitored.filter((a) => a.risk === r).length, color: RISK_COLORS[r] }));

  const anomalies: ChartSeries[] = ANOMALY_TYPES.map((name, i) => ({ name, values: [], color: ANOMALY_COLORS[i] }));

  const ids = new Set(assets.map((a) => a.id));
  const orders = PA_WORK_ORDERS.filter((o) => ids.has(o.asset.id));
  const avoidedByMonth: number[] = [];
  const costForecast: ChartSeries[] = [
    { name: 'Preventive', values: months.map((m) => orders.filter((o) => o.month === m && (o.type === 'Preventive' || o.type === 'Inspection')).reduce((s, o) => s + o.cost, 0)), color: RA_COLORS.violet },
    { name: 'Corrective', values: months.map((m) => orders.filter((o) => o.month === m && (o.type === 'Corrective' || o.type === 'Emergency')).reduce((s, o) => s + o.cost, 0)), color: RA_COLORS.blue },
    { name: 'Avoided Cost', values: avoidedByMonth, color: RA_COLORS.green }
  ];

  const models: ModelRow[] = PA_MODELS.filter((r) => r.monitored > 0);

  return {
    assets,
    monitored,
    highRisk: monitored.filter((a) => a.risk === 'Critical').length,
    failures: monitored.filter((a) => a.failureWindowDays !== null).sort((a, b) => (a.failureWindowDays ?? 0) - (b.failureWindowDays ?? 0) || b.riskScore - a.riskScore),
    // Model quality metrics come from the predictive service (not wired yet)
    accuracy: 0,
    precision: 0,
    recall: 0,
    falsePositiveRate: 0,
    labels,
    riskTrend,
    rulForecast,
    riskSlices,
    anomalies,
    costForecast,
    avoided: avoidedByMonth.reduce((a, b) => a + b, 0),
    avoidedByMonth,
    actionList: [...elevated].sort((a, b) => b.riskScore - a.riskScore),
    models,
    vibration: monitored.filter((a) => a.vibrationAnomaly),
    review: elevated.filter((a) => a.confidence < REVIEW_CONFIDENCE).sort((a, b) => a.confidence - b.confidence)
  };
}
