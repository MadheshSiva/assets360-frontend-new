import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';

// View models and the static demo dataset for the Predictive Analytics page. The service (predictive-analytics.service.ts)
// aggregates the demo predictions below for the filter bar, in the browser.

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_RISK_LEVELS = 'All risk levels';
export const ALL_PREDICTIONS_VIEW = 'All Predictions';

/** AI risk levels, highest first. */
export const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
export const RISK_OPTIONS = [ALL_RISK_LEVELS, ...RISK_LEVELS];

/** Period presets, in whole months (the filter bar has no date pickers). */
export const PA_FALLBACK_PERIODS = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'Last 6 months', 'This year', 'Last 12 months'];
export const PA_DEFAULT_PERIOD = 'Last 12 months';

/** Model thresholds. */
export const ACCURACY_TARGET = 90;
/** Predictions with lower model confidence go to an engineer before anyone acts on them. */
export const REVIEW_CONFIDENCE = 70;
export const HIGH_RISK_SCORE = 60;
export const FAILURE_WINDOW_DAYS = 30;

export const RISK_COLORS: Record<string, string> = { Critical: RA_COLORS.red, High: RA_COLORS.orange, Medium: RA_COLORS.blue, Low: RA_COLORS.green };

/** A monitored asset's current prediction. Missing measurements are null. */
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

/** What the page shows before the first load. */
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
/** Months of history kept for every asset (current year plus the previous period). */
export const HISTORY_MONTHS = 24;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight UTC today. */
export const PA_TODAY = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
})();

/** Start of the month `offset` months before the current one (UTC ms). */
export function monthStart(offset: number): number {
  const d = new Date(PA_TODAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1);
}

/** "Jan 2026" for a month offset. */
export function monthCategory(offset: number): string {
  const d = new Date(monthStart(offset));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Month offsets (oldest first; 0 = this month) covered by a period preset, and the previous period of the same length. */
export function periodOffsets(period: string): { current: number[]; previous: number[] } {
  const month = new Date(PA_TODAY).getUTCMonth();
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

export const PA_SITES = [
  { location: 'Dubai HQ', organization: 'Purple IQ UAE', code: 'DXB', assets: 22 },
  { location: 'Abu Dhabi Office', organization: 'Purple IQ UAE', code: 'AUH', assets: 16 },
  { location: 'Sharjah Facility', organization: 'Purple IQ UAE', code: 'SHJ', assets: 18 },
  { location: 'Jebel Ali Warehouse', organization: 'Purple IQ UAE', code: 'JBA', assets: 14 },
  { location: 'Riyadh Office', organization: 'Purple IQ KSA', code: 'RUH', assets: 16 },
  { location: 'Doha Office', organization: 'Purple IQ Qatar', code: 'DOH', assets: 10 }
];
/** The group holding company covers every site. */
export const PA_GROUP = 'Purple IQ Group';
export const PA_ORGANIZATIONS = [PA_GROUP, 'Purple IQ UAE', 'Purple IQ KSA', 'Purple IQ Qatar'];

interface AssetModel {
  name: string;
  category: string;
  type: string;
  sensor: string;
  issues: [string, string][];
}

/** Asset models with their monitoring sensor and the issues the model predicts (issue, recommended action). */
const ASSET_MODELS: AssetModel[] = [
  { name: 'Chiller Unit', category: 'HVAC', type: 'Rotating Equipment', sensor: 'Vibration', issues: [['Compressor bearing wear', 'Replace compressor bearings'], ['Refrigerant leak', 'Leak test and recharge refrigerant']] },
  { name: 'Air Handling Unit', category: 'HVAC', type: 'Rotating Equipment', sensor: 'Vibration', issues: [['Fan belt misalignment', 'Realign and tension fan belt'], ['Motor bearing wear', 'Lubricate and inspect motor bearings']] },
  { name: 'Cooling Tower', category: 'HVAC', type: 'Static Equipment', sensor: 'Temperature', issues: [['Fill media fouling', 'Clean fill media and basin'], ['Fan gearbox overheating', 'Inspect gearbox oil and seals']] },
  { name: 'Air Compressor', category: 'Machinery', type: 'Rotating Equipment', sensor: 'Vibration', issues: [['Valve plate failure', 'Replace valve plate'], ['Bearing wear', 'Replace bearings']] },
  { name: 'Hydraulic Press', category: 'Machinery', type: 'Static Equipment', sensor: 'Pressure', issues: [['Seal degradation', 'Replace hydraulic seals'], ['Pump cavitation', 'Inspect pump and filters']] },
  { name: 'Conveyor Drive', category: 'Machinery', type: 'Rotating Equipment', sensor: 'Vibration', issues: [['Gearbox wear', 'Inspect gearbox and change oil'], ['Belt tracking fault', 'Adjust belt tracking']] },
  { name: 'Forklift', category: 'Vehicles', type: 'Mobile Equipment', sensor: 'Current', issues: [['Traction battery degradation', 'Schedule battery replacement'], ['Hydraulic pump wear', 'Service hydraulic pump']] },
  { name: 'Reach Truck', category: 'Vehicles', type: 'Mobile Equipment', sensor: 'Current', issues: [['Drive motor overheating', 'Inspect drive motor and cooling']] },
  { name: 'Diesel Generator', category: 'Power & Electrical', type: 'Electrical Equipment', sensor: 'Temperature', issues: [['Coolant overheating', 'Flush cooling system'], ['Fuel injector fouling', 'Service fuel injectors']] },
  { name: 'Transformer', category: 'Power & Electrical', type: 'Electrical Equipment', sensor: 'Temperature', issues: [['Insulation breakdown', 'Oil test and insulation check']] },
  { name: 'UPS System', category: 'Power & Electrical', type: 'Electrical Equipment', sensor: 'Current', issues: [['Battery string degradation', 'Replace weak battery modules']] },
  { name: 'Passenger Elevator', category: 'Facilities', type: 'Rotating Equipment', sensor: 'Vibration', issues: [['Hoist rope wear', 'Inspect hoist ropes and sheave']] },
  { name: 'Fire Pump', category: 'Facilities', type: 'Rotating Equipment', sensor: 'Pressure', issues: [['Impeller wear', 'Inspect impeller and run test']] },
  { name: 'Server Rack', category: 'IT Equipment', type: 'IT & Electronics', sensor: 'Temperature', issues: [['Cooling fan failure', 'Replace rack cooling fans']] },
  { name: 'Core Network Switch', category: 'IT Equipment', type: 'IT & Electronics', sensor: 'Energy', issues: [['Power supply degradation', 'Replace redundant PSU']] }
];
export const PA_CATEGORIES = [...new Set(ASSET_MODELS.map((m) => m.category))];
export const PA_ASSET_TYPES = [...new Set(ASSET_MODELS.map((m) => m.type))];
/** Prediction models by asset type. */
export const PA_MODELS: Record<string, string[]> = {
  'Rotating Equipment': ['Vibration LSTM v3.2', 'Bearing RUL Regressor v2'],
  'Static Equipment': ['Pressure Drift GBM v1.4'],
  'Mobile Equipment': ['Battery Health GBM v2.1'],
  'Electrical Equipment': ['Thermal Anomaly IF v1.8', 'Load Profile LSTM v1.1'],
  'IT & Electronics': ['Thermal Anomaly IF v1.8']
};
/** Base accuracy by asset type (rotating equipment has the most training data). */
export const PA_TYPE_ACCURACY: Record<string, number> = {
  'Rotating Equipment': 93, 'Static Equipment': 89, 'Mobile Equipment': 90, 'Electrical Equipment': 91, 'IT & Electronics': 86
};
export const ANOMALY_SIGNALS = ['Vibration', 'Temperature', 'Pressure', 'Current', 'Energy'];
const OWNERS = ['Rahul Mehta', 'Ahmed Khan', 'John Mathew', 'Omar Khalid', 'Michael Chen', 'Daniel Tan', 'Priya Nair', 'James Wilson'];

export interface PaDemoAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  organization: string;
  category: string;
  type: string;
  sensor: string;
  model: string;
  issue: string;
  action: string;
  confidence: number;
  owner: string | null;
  /** Monitoring started this many months ago */
  monitoredSince: number;
  /** Risk score (0–100) at each month end, index = month offset (0 = now) */
  scores: number[];
  /** Anomaly events per month offset, by signal */
  anomalies: Record<string, number>[];
  /** Predictions checked against outcomes per month offset, and how many matched */
  evaluated: number[];
  correct: number[];
  /** Failures prevented by maintenance per month offset */
  prevented: number[];
  /** Preventive and corrective spend per month offset (AED) */
  preventiveCost: number[];
  correctiveCost: number[];
}

export function riskLevel(score: number): string {
  return score >= 80 ? 'Critical' : score >= HIGH_RISK_SCORE ? 'High' : score >= 35 ? 'Medium' : 'Low';
}

/** Hours to the predicted failure for a risk score. */
export function rulHours(score: number, jitter = 1): number {
  return Math.max(12, Math.round(15000 * Math.pow((100 - score) / 100, 2.2) * jitter));
}

function buildDemo(): PaDemoAsset[] {
  const rand = seeded(424242);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const assets: PaDemoAsset[] = [];
  let n = 300;
  for (const site of PA_SITES) {
    for (let i = 0; i < site.assets; i++) {
      const model = ASSET_MODELS[(i * 7 + assets.length) % ASSET_MODELS.length];
      const [issue, action] = model.issues[Math.floor(rand() * model.issues.length)];
      const r = rand();
      const now = Math.round(r < 0.07 ? between(80, 94) : r < 0.2 ? between(60, 79) : r < 0.5 ? between(35, 59) : between(8, 34));
      // Degrading assets climbed faster over the last months
      const drift = now >= 60 ? between(2, 3.6) : now >= 35 ? between(0.6, 1.6) : between(-0.2, 0.6);
      const scores = Array.from({ length: HISTORY_MONTHS }, (_, m) =>
        m === 0 ? now : Math.max(4, Math.min(96, Math.round(now - drift * m + between(-3, 3)))));
      const monitoredSince = rand() < 0.18 ? 2 + Math.floor(rand() * 14) : HISTORY_MONTHS;
      const months = Array.from({ length: HISTORY_MONTHS }, (_, m) => m);
      const baseAccuracy = PA_TYPE_ACCURACY[model.type] / 100;
      const evaluated = months.map((m) => (m > monitoredSince ? 0 : rand() < 0.45 ? 1 + Math.floor(rand() * 2) : 0));
      n += 1 + Math.floor(rand() * 7);
      assets.push({
        key: `pa-${site.code.toLowerCase()}-${i + 1}`,
        id: `AST-2026-${site.code}-${String(n).padStart(6, '0')}`,
        name: `${model.name} ${String(i + 1).padStart(2, '0')}`,
        location: site.location,
        organization: site.organization,
        category: model.category,
        type: model.type,
        sensor: model.sensor,
        model: PA_MODELS[model.type][Math.floor(rand() * PA_MODELS[model.type].length)],
        issue,
        action,
        confidence: Math.round(rand() < 0.13 ? between(52, 69) : between(71, 97)),
        owner: rand() < 0.1 ? null : OWNERS[Math.floor(rand() * OWNERS.length)],
        monitoredSince,
        scores,
        anomalies: months.map((m) => {
          const s = scores[m];
          const events: Record<string, number> = {};
          for (const signal of ANOMALY_SIGNALS) {
            const own = signal === model.sensor ? 1 : 0.18;
            events[signal] = m > monitoredSince ? 0 : Math.floor(rand() * own * (s / 22 + 0.3));
          }
          return events;
        }),
        evaluated,
        // Accuracy improves slightly as the models retrain
        correct: evaluated.map((e, m) => Array.from({ length: e }).filter(() => rand() < baseAccuracy + 0.03 - m * 0.003).length),
        prevented: months.map((m) => (m <= monitoredSince && scores[m] >= 55 && rand() < 0.16 ? 1 : 0)),
        preventiveCost: months.map((m) => (m > monitoredSince ? 0 : Math.round(between(350, 1100) * (1 + scores[m] / 120)))),
        correctiveCost: months.map((m) => (m > monitoredSince || rand() > 0.12 + scores[m] / 400 ? 0 : Math.round(between(4500, 16000))))
      });
    }
  }
  return assets;
}

/** The demo monitored assets with two years of risk, anomaly, accuracy and cost history. */
export const PA_DEMO = buildDemo();
/** Average corrective repair cost, used to value prevented failures (AED). */
export const PA_AVG_CORRECTIVE_COST = 18_400;
