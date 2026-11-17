import { money } from '../shared/analytics-common';
import { dateFromOffset, formatDate } from '../inspection-analytics/kit/scope';

// KPI catalogue (definitions only) for the KPI Dashboard. Current values, owners and trends come from the
// reporting API; until it is wired up every catalogue KPI reads 'No Data'.

export const KPI_MODULES = ['Asset', 'Maintenance', 'Inspection', 'Inventory', 'Operations', 'Compliance', 'Financial'] as const;
export type KpiModule = (typeof KPI_MODULES)[number];
export const KPI_UNITS = ['%', 'count', 'AED', 'x', 'hrs'] as const;
export type KpiUnit = (typeof KPI_UNITS)[number];
export type KpiDirection = 'higher' | 'lower';
export type KpiStatus = 'On Track' | 'Watch' | 'At Risk' | 'Over Budget' | 'No Data';

export interface KpiDef {
  id: string;
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  /** Current value; null until the reporting API supplies it */
  value: number | null;
  target: number;
  direction: KpiDirection;
  owner: string;
  /** % change vs the previous period */
  change: number;
  /** Amount accumulates over the period (cost, capex); otherwise a point-in-time figure */
  flow?: boolean;
  /** Days from today until the owner's next review / action is due */
  dueInDays: number;
  info: string;
  custom?: boolean;
}

export const KPI_CATALOG: KpiDef[] = [
  // Asset
  { id: 'health', name: 'Asset Health Score', module: 'Asset', unit: '%', value: null, target: 85, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Weighted condition score across monitored assets' },
  { id: 'utilization', name: 'Asset Utilization', module: 'Asset', unit: '%', value: null, target: 80, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Productive hours ÷ available hours' },
  { id: 'availability', name: 'Asset Availability', module: 'Asset', unit: '%', value: null, target: 95, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Share of time assets were available for use' },
  { id: 'mtbf', name: 'MTBF', module: 'Asset', unit: 'hrs', value: null, target: 1200, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Mean time between failures' },
  { id: 'prediction', name: 'Prediction Accuracy', module: 'Asset', unit: '%', value: null, target: 90, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Predicted failures confirmed by inspection or breakdown' },
  { id: 'missing', name: 'Missing Assets', module: 'Asset', unit: 'count', value: null, target: 40, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Assets not located in the last audit or scan' },
  // Maintenance
  { id: 'pm', name: 'Preventive Compliance', module: 'Maintenance', unit: '%', value: null, target: 90, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Preventive work orders completed on schedule' },
  { id: 'openWo', name: 'Open Work Orders', module: 'Maintenance', unit: 'count', value: null, target: 100, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Work orders not yet closed' },
  { id: 'overdueWo', name: 'Overdue Work Orders', module: 'Maintenance', unit: 'count', value: null, target: 15, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Open work orders past their due date' },
  { id: 'mttr', name: 'MTTR', module: 'Maintenance', unit: 'hrs', value: null, target: 8, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Mean time to repair' },
  { id: 'cost', name: 'Maintenance Cost', module: 'Maintenance', unit: 'AED', value: null, target: 0, direction: 'lower', owner: '', change: 0, flow: true, dueInDays: 0, info: 'Maintenance spend against budget' },
  // Inspection
  { id: 'inspection', name: 'Inspection Completion', module: 'Inspection', unit: '%', value: null, target: 95, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Completed ÷ due inspections' },
  { id: 'openFindings', name: 'Open Findings', module: 'Inspection', unit: 'count', value: null, target: 130, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Inspection findings not yet closed' },
  { id: 'criticalFindings', name: 'Critical Findings', module: 'Inspection', unit: 'count', value: null, target: 10, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Open findings rated critical' },
  // Inventory
  { id: 'turnover', name: 'Inventory Turnover', module: 'Inventory', unit: 'x', value: null, target: 6, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Cost of goods issued ÷ average stock value' },
  { id: 'accuracy', name: 'Stock Accuracy', module: 'Inventory', unit: '%', value: null, target: 98, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Cycle-count matches ÷ items counted' },
  { id: 'reorder', name: 'Items Below Reorder', module: 'Inventory', unit: 'count', value: null, target: 200, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Stock items under their reorder point' },
  // Operations
  { id: 'oee', name: 'Overall Equipment Effectiveness', module: 'Operations', unit: '%', value: null, target: 85, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Availability × performance × quality' },
  { id: 'onTime', name: 'On-Time Production', module: 'Operations', unit: '%', value: null, target: 95, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Production orders completed by their due date' },
  { id: 'telemetry', name: 'Telemetry Availability', module: 'Operations', unit: '%', value: null, target: 97, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Connected assets reporting within their interval' },
  { id: 'alerts', name: 'Active IoT Alerts', module: 'Operations', unit: 'count', value: null, target: 40, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Unacknowledged IoT alerts' },
  // Compliance
  { id: 'compliance', name: 'Compliance Score', module: 'Compliance', unit: '%', value: null, target: 90, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Weighted score across regulations and standards' },
  { id: 'capa', name: 'CAPA Closure Rate', module: 'Compliance', unit: '%', value: null, target: 90, direction: 'higher', owner: '', change: 0, dueInDays: 0, info: 'Corrective actions closed ÷ raised' },
  { id: 'overdueCapa', name: 'Overdue CAPA Actions', module: 'Compliance', unit: 'count', value: null, target: 5, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Corrective actions past due' },
  { id: 'expiring', name: 'Expiring Certifications', module: 'Compliance', unit: 'count', value: null, target: 20, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Permits and certificates expiring within 90 days' },
  // Financial
  { id: 'capex', name: 'Capital Expenditure', module: 'Financial', unit: 'AED', value: null, target: 0, direction: 'lower', owner: '', change: 0, flow: true, dueInDays: 0, info: 'Capex spend against the approved budget' },
  { id: 'opex', name: 'Operating Expenditure', module: 'Financial', unit: 'AED', value: null, target: 0, direction: 'lower', owner: '', change: 0, flow: true, dueInDays: 0, info: 'Asset operating spend against budget' },
  { id: 'inventoryValue', name: 'Inventory Value', module: 'Financial', unit: 'AED', value: null, target: 0, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Stock on hand at cost vs. the holding ceiling' },
  { id: 'wip', name: 'WIP Value', module: 'Financial', unit: 'AED', value: null, target: 0, direction: 'lower', owner: '', change: 0, dueInDays: 0, info: 'Work in progress at cost vs. the ceiling' }
];

export interface KpiViewDef {
  key: string;
  label: string;
  dashboard: string;
  ids: string[];
  custom?: boolean;
}

export const KPI_VIEWS: KpiViewDef[] = [
  { key: 'executive', label: 'Executive', dashboard: 'Executive KPI Overview', ids: ['health', 'pm', 'utilization', 'cost', 'openWo', 'inspection', 'turnover', 'oee', 'compliance', 'onTime', 'prediction', 'capa'] },
  { key: 'operations', label: 'Operations', dashboard: 'Operations KPI Overview', ids: ['oee', 'onTime', 'utilization', 'availability', 'openWo', 'inspection', 'telemetry', 'alerts'] },
  { key: 'maintenance', label: 'Maintenance', dashboard: 'Maintenance KPI Overview', ids: ['pm', 'openWo', 'overdueWo', 'cost', 'mttr', 'mtbf', 'health', 'prediction'] },
  { key: 'finance', label: 'Finance', dashboard: 'Finance KPI Overview', ids: ['cost', 'capex', 'opex', 'inventoryValue', 'wip', 'turnover'] },
  { key: 'custom:my-kpis', label: 'My KPIs', dashboard: 'My KPIs (custom)', ids: ['compliance', 'capa', 'overdueCapa', 'expiring', 'criticalFindings', 'openFindings'], custom: true }
];

/** Business units (to be loaded from the organisation API) */
export const BUSINESS_UNITS = ['All business units'];

export interface KpiScope {
  share: number;
  periodShare: number;
  offset: number;
}

/** Filter scope applied to KPI values. Neutral until the reporting API scopes values server-side. */
export function kpiScope(_period: string, _organization: string, _location: string, _businessUnit: string): KpiScope {
  return { share: 1, periodShare: 1, offset: 0 };
}

export interface KpiState {
  def: KpiDef;
  value: number;
  target: number;
  status: KpiStatus;
  valueText: string;
  targetText: string;
  varianceText: string;
  changeText: string;
  changeUp: boolean;
  changeGood: boolean;
  spark: number[];
  attainment: number;
  due: string;
}

export function kpiStatus(value: number, target: number, direction: KpiDirection, unit: KpiUnit): KpiStatus {
  if (direction === 'higher') return value >= target ? 'On Track' : value >= target * 0.97 ? 'Watch' : 'At Risk';
  if (value <= target) return 'On Track';
  if (unit === 'AED') return 'Over Budget';
  return value <= target * 1.05 ? 'Watch' : 'At Risk';
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

/** Attainment vs target in % (100 = on target), for both directions */
export function attainment(value: number, target: number, direction: KpiDirection): number {
  if (direction === 'higher') return target ? (value / target) * 100 : 0;
  return value ? Math.min(130, (target / value) * 100) : 130;
}

/** Applies the filter scope to a KPI and works out its status and texts. */
export function evaluateKpi(def: KpiDef, scope: KpiScope): KpiState {
  const amount = def.unit === 'count' || def.unit === 'AED';
  const factor = amount ? scope.share * (def.flow ? scope.periodShare : 1) : 1;
  const adjust = (v: number): number => {
    if (amount) return v * factor;
    if (def.unit === '%') return Math.min(99.9, v + scope.offset);
    return v * (1 + (scope.offset / 100) * (def.direction === 'higher' ? 1 : -1));
  };
  const target = amount ? def.target * factor : def.target;
  const noData = scope.share === 0 || def.value === null;
  const current = def.value ?? 0;
  const value = noData ? 0 : adjust(current);

  // Monthly history (sparkline) comes from the reporting API; nothing is generated here
  const spark: number[] = [];

  const status: KpiStatus = noData ? 'No Data' : kpiStatus(value, target, def.direction, def.unit);
  let varianceText: string;
  if (def.unit === '%') varianceText = signedText(value - target, 1, '%');
  else if (def.unit === 'count') varianceText = signedText(Math.round(value) - Math.round(target), 0, '');
  else if (def.unit === 'x') varianceText = signedText(value - target, 1, 'x');
  else varianceText = signedText(((value - target) / (target || 1)) * 100, 0, '%');

  const changeGood = def.direction === 'higher' ? def.change >= 0 : def.change <= 0;
  return {
    def,
    value,
    target,
    status,
    valueText: noData ? '—' : formatKpi(value, def.unit),
    targetText: targetLabel(def, target),
    varianceText: noData ? '—' : varianceText,
    changeText: noData ? '' : signedText(def.change, 1, '%'),
    changeUp: def.change >= 0,
    changeGood,
    spark,
    attainment: noData ? 0 : attainment(value, target, def.direction),
    due: noData ? '—' : formatDate(dateFromOffset(def.dueInDays))
  };
}

function targetLabel(def: KpiDef, target: number): string {
  if (def.unit === 'AED') return target ? `Budget ${money(target)}` : 'Budget —';
  const t = formatKpi(target, def.unit);
  return def.direction === 'lower' && def.unit === 'count' ? `Target <${t}` : `Target ${t}`;
}

function signedText(v: number, digits: number, suffix: string): string {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : ''}${r}${suffix}`;
}
