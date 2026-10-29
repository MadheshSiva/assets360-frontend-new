import { RA_MONTH_LABELS } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';
import {
  RA_ASSETS, RA_ASSET_TYPES, RA_WORK_ORDERS, RISK_LEVELS, RaAsset, RaScope, distribute, inScope, mean, periodMonths, round1
} from '../asset-performance/kit/asset-universe';

// DEMO MODE: predictions come from the shared sample register in asset-performance/kit/asset-universe
// (risk level, risk score, remaining useful life and failure window per monitored asset).

export const ALL_RISK_LEVELS = 'All risk levels';
export const RISK_OPTIONS = [ALL_RISK_LEVELS, ...RISK_LEVELS];
export const ACCURACY_TARGET = 90;
/** Predictions with lower model confidence go to an engineer before anyone acts on them. */
export const REVIEW_CONFIDENCE = 70;

/** Change vs the previous period shown on the KPI cards (%). */
export const PA_DELTAS = { monitored: 9.4, highRisk: -16, failures: -22, accuracy: 3.6 };

export const RISK_COLORS: Record<string, string> = { Critical: RA_COLORS.red, High: RA_COLORS.orange, Medium: RA_COLORS.blue, Low: RA_COLORS.green };

// Model quality per asset type; shifted so the monitored-weighted figures equal the group model at full scope
interface ModelSeed {
  accuracy: number;
  precision: number;
  recall: number;
  status: 'Online' | 'Training';
}
const MODEL_SEEDS: Record<string, ModelSeed> = {
  'Rotating Equipment': { accuracy: 93.6, precision: 94.1, recall: 91.2, status: 'Online' },
  'Static Equipment': { accuracy: 90.8, precision: 91.3, recall: 88.7, status: 'Online' },
  'Mobile Equipment': { accuracy: 88.4, precision: 89.6, recall: 86.1, status: 'Online' },
  'Electrical Equipment': { accuracy: 87.5, precision: 88.1, recall: 85.6, status: 'Training' },
  'IT & Electronics': { accuracy: 89.2, precision: 90.4, recall: 87.8, status: 'Online' }
};
const MONITORED = RA_ASSETS.filter((a) => a.monitored);
const offset = (get: (s: ModelSeed) => number, target: number) => target - mean(MONITORED.map((a) => get(MODEL_SEEDS[a.type])));
const ACCURACY_OFFSET = offset((s) => s.accuracy, RA_METRICS.predictive.accuracy);
const PRECISION_OFFSET = offset((s) => s.precision, 92.4);
const RECALL_OFFSET = offset((s) => s.recall, 89.6);
const FALSE_POSITIVE_RATE = 4.8;

// Group-wide monthly anomaly events and downtime cost avoided (AED 680K Jan–Oct), scaled to the monitored assets in view
const ANOMALY_BASE: Record<string, number[]> = {
  Temperature: [8, 9, 10, 12, 13, 15, 16, 18, 20, 22],
  Vibration: [6, 7, 7, 9, 10, 11, 13, 14, 16, 18],
  Energy: [5, 5, 6, 7, 7, 8, 9, 10, 11, 12],
  Pressure: [3, 4, 4, 5, 5, 6, 6, 7, 8, 9]
};
const ANOMALY_COLORS = [RA_COLORS.red, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.violet];
const AVOIDED_BASE = distribute(680_000, [40, 48, 52, 58, 62, 68, 74, 82, 90, 106]);

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

function weighted(list: RaAsset[], get: (s: ModelSeed) => number, shift: number): number {
  return list.length ? round1(mean(list.map((a) => get(MODEL_SEEDS[a.type]))) + shift) : 0;
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
  const assets = RA_ASSETS.filter((a) => inScope(a, scope));
  const monitored = assets.filter((a) => a.monitored && (risk === ALL_RISK_LEVELS || a.risk === risk));
  const months = periodMonths(period);
  const share = monitored.length / RA_METRICS.predictive.assetsMonitored;
  const labels = months.map((m) => RA_MONTH_LABELS[m]);

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

  const anomalies: ChartSeries[] = Object.keys(ANOMALY_BASE).map((name, i) => ({
    name,
    values: months.map((m) => Math.round(ANOMALY_BASE[name][m] * share)),
    color: ANOMALY_COLORS[i]
  }));

  const ids = new Set(assets.map((a) => a.id));
  const orders = RA_WORK_ORDERS.filter((o) => ids.has(o.asset.id));
  const avoidedByMonth = months.map((m) => Math.round(AVOIDED_BASE[m] * share));
  const costForecast: ChartSeries[] = [
    { name: 'Preventive', values: months.map((m) => orders.filter((o) => o.month === m && (o.type === 'Preventive' || o.type === 'Inspection')).reduce((s, o) => s + o.cost, 0)), color: RA_COLORS.violet },
    { name: 'Corrective', values: months.map((m) => orders.filter((o) => o.month === m && (o.type === 'Corrective' || o.type === 'Emergency')).reduce((s, o) => s + o.cost, 0)), color: RA_COLORS.blue },
    { name: 'Avoided Cost', values: avoidedByMonth, color: RA_COLORS.green }
  ];

  const models: ModelRow[] = RA_ASSET_TYPES.map((type) => {
    const list = monitored.filter((a) => a.type === type);
    return {
      type,
      monitored: list.length,
      accuracy: weighted(list, (s) => s.accuracy, ACCURACY_OFFSET),
      precision: weighted(list, (s) => s.precision, PRECISION_OFFSET),
      recall: weighted(list, (s) => s.recall, RECALL_OFFSET),
      status: MODEL_SEEDS[type].status
    };
  }).filter((r) => r.monitored > 0);

  return {
    assets,
    monitored,
    highRisk: monitored.filter((a) => a.risk === 'Critical').length,
    failures: monitored.filter((a) => a.failureWindowDays !== null).sort((a, b) => (a.failureWindowDays ?? 0) - (b.failureWindowDays ?? 0) || b.riskScore - a.riskScore),
    accuracy: weighted(monitored, (s) => s.accuracy, ACCURACY_OFFSET),
    precision: weighted(monitored, (s) => s.precision, PRECISION_OFFSET),
    recall: weighted(monitored, (s) => s.recall, RECALL_OFFSET),
    falsePositiveRate: monitored.length ? FALSE_POSITIVE_RATE : 0,
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
