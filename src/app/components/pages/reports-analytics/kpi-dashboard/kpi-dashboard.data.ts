import { RA_MONTHS, money } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { RA_SITES, dateFromOffset, formatDate, periodWindow, siteWeight, sitesInScope, weightedAverage } from '../inspection-analytics/kit/scope';

// DEMO MODE: KPI catalogue for the KPI Dashboard. Current values come from RA_METRICS so every tile matches the
// detail page it links to (Maintenance Cost here = Maintenance Analytics = Financial Analytics, etc.).

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
  /** Group-wide value for 01 Jan – 28 Oct 2026 */
  value: number;
  target: number;
  direction: KpiDirection;
  owner: string;
  /** % change vs the previous period */
  change: number;
  /** Amount accumulates over the period (cost, capex); otherwise a point-in-time figure */
  flow?: boolean;
  /** Days from 28 Oct 2026 until the owner's next review / action is due */
  dueInDays: number;
  info: string;
  custom?: boolean;
}

const M = RA_METRICS;

export const KPI_CATALOG: KpiDef[] = [
  // Asset
  { id: 'health', name: 'Asset Health Score', module: 'Asset', unit: '%', value: M.assets.healthScore, target: 85, direction: 'higher', owner: 'Omar Hassan', change: 5.2, dueInDays: 14, info: 'Weighted condition score across monitored assets' },
  { id: 'utilization', name: 'Asset Utilization', module: 'Asset', unit: '%', value: M.assets.utilization, target: 80, direction: 'higher', owner: 'Priya Sharma', change: -3.6, dueInDays: 8, info: 'Productive hours ÷ available hours' },
  { id: 'availability', name: 'Asset Availability', module: 'Asset', unit: '%', value: M.assets.availability, target: 95, direction: 'higher', owner: 'Omar Hassan', change: 0.8, dueInDays: 12, info: 'Share of time assets were available for use' },
  { id: 'mtbf', name: 'MTBF', module: 'Asset', unit: 'hrs', value: M.reliability.mtbfHours, target: 1200, direction: 'higher', owner: 'Rahul Mehta', change: 4.1, dueInDays: 20, info: 'Mean time between failures' },
  { id: 'prediction', name: 'Prediction Accuracy', module: 'Asset', unit: '%', value: M.predictive.accuracy, target: 90, direction: 'higher', owner: 'Aisha Rahman', change: 3.6, dueInDays: 18, info: 'Predicted failures confirmed by inspection or breakdown' },
  { id: 'missing', name: 'Missing Assets', module: 'Asset', unit: 'count', value: M.assets.status.missing, target: 40, direction: 'lower', owner: 'Fatima Noor', change: 6.3, dueInDays: 6, info: 'Assets not located in the last audit or scan' },
  // Maintenance
  { id: 'pm', name: 'Preventive Compliance', module: 'Maintenance', unit: '%', value: M.maintenance.pmCompliance, target: 90, direction: 'higher', owner: 'Rahul Mehta', change: 4.1, dueInDays: 16, info: 'Preventive work orders completed on schedule' },
  { id: 'openWo', name: 'Open Work Orders', module: 'Maintenance', unit: 'count', value: M.maintenance.openWorkOrders, target: 100, direction: 'lower', owner: 'Ahmed Khan', change: -18.9, dueInDays: 10, info: 'Work orders not yet closed' },
  { id: 'overdueWo', name: 'Overdue Work Orders', module: 'Maintenance', unit: 'count', value: M.maintenance.overdueWorkOrders, target: 15, direction: 'lower', owner: 'Ahmed Khan', change: 5.9, dueInDays: 4, info: 'Open work orders past their due date' },
  { id: 'mttr', name: 'MTTR', module: 'Maintenance', unit: 'hrs', value: M.reliability.mttrHours, target: 8, direction: 'lower', owner: 'Rahul Mehta', change: -7.4, dueInDays: 22, info: 'Mean time to repair' },
  { id: 'cost', name: 'Maintenance Cost', module: 'Maintenance', unit: 'AED', value: M.maintenance.cost, target: M.maintenance.budget, direction: 'lower', owner: 'Michael Chen', change: 12.4, flow: true, dueInDays: 5, info: 'Maintenance spend against budget' },
  // Inspection
  { id: 'inspection', name: 'Inspection Completion', module: 'Inspection', unit: '%', value: M.inspection.completionRate, target: 95, direction: 'higher', owner: 'Daniel Kim', change: -1.7, dueInDays: 12, info: 'Completed ÷ due inspections' },
  { id: 'openFindings', name: 'Open Findings', module: 'Inspection', unit: 'count', value: M.inspection.openFindings, target: 130, direction: 'lower', owner: 'Daniel Kim', change: -9.4, dueInDays: 15, info: 'Inspection findings not yet closed' },
  { id: 'criticalFindings', name: 'Critical Findings', module: 'Inspection', unit: 'count', value: M.inspection.criticalFindings, target: 10, direction: 'lower', owner: 'Sarah Khan', change: -20, dueInDays: 3, info: 'Open findings rated critical' },
  // Inventory
  { id: 'turnover', name: 'Inventory Turnover', module: 'Inventory', unit: 'x', value: M.inventory.turnover, target: 6, direction: 'higher', owner: 'Lisa Wong', change: 11.5, dueInDays: 25, info: 'Cost of goods issued ÷ average stock value' },
  { id: 'accuracy', name: 'Stock Accuracy', module: 'Inventory', unit: '%', value: M.inventory.stockAccuracy, target: 98, direction: 'higher', owner: 'Lisa Wong', change: 0.4, dueInDays: 11, info: 'Cycle-count matches ÷ items counted' },
  { id: 'reorder', name: 'Items Below Reorder', module: 'Inventory', unit: 'count', value: M.inventory.belowReorder, target: 200, direction: 'lower', owner: 'John Mathew', change: -4.2, dueInDays: 9, info: 'Stock items under their reorder point' },
  // Operations
  { id: 'oee', name: 'Overall Equipment Effectiveness', module: 'Operations', unit: '%', value: M.production.oee, target: 85, direction: 'higher', owner: 'James Wilson', change: -2.3, dueInDays: 13, info: 'Availability × performance × quality' },
  { id: 'onTime', name: 'On-Time Production', module: 'Operations', unit: '%', value: M.production.onTimeCompletion, target: 95, direction: 'higher', owner: 'James Wilson', change: -4.1, dueInDays: 6, info: 'Production orders completed by their due date' },
  { id: 'telemetry', name: 'Telemetry Availability', module: 'Operations', unit: '%', value: M.iot.telemetryAvailability, target: 97, direction: 'higher', owner: 'Mohammed Ali', change: 0.6, dueInDays: 30, info: 'Connected assets reporting within their interval' },
  { id: 'alerts', name: 'Active IoT Alerts', module: 'Operations', unit: 'count', value: M.iot.activeAlerts, target: 40, direction: 'lower', owner: 'Mohammed Ali', change: -8.1, dueInDays: 7, info: 'Unacknowledged IoT alerts' },
  // Compliance
  { id: 'compliance', name: 'Compliance Score', module: 'Compliance', unit: '%', value: M.compliance.score, target: 90, direction: 'higher', owner: 'Sarah Ahmed', change: 4.8, dueInDays: 19, info: 'Weighted score across regulations and standards' },
  { id: 'capa', name: 'CAPA Closure Rate', module: 'Compliance', unit: '%', value: M.compliance.capaClosureRate, target: 90, direction: 'higher', owner: 'Sarah Khan', change: -2.9, dueInDays: 7, info: 'Corrective actions closed ÷ raised' },
  { id: 'overdueCapa', name: 'Overdue CAPA Actions', module: 'Compliance', unit: 'count', value: M.compliance.overdueCapa, target: 5, direction: 'lower', owner: 'Sarah Khan', change: -25, dueInDays: 2, info: 'Corrective actions past due' },
  { id: 'expiring', name: 'Expiring Certifications', module: 'Compliance', unit: 'count', value: M.compliance.expiringCertifications, target: 20, direction: 'lower', owner: 'Fatima Al Mansoori', change: 6, dueInDays: 21, info: 'Permits and certificates expiring within 90 days' },
  // Financial
  { id: 'capex', name: 'Capital Expenditure', module: 'Financial', unit: 'AED', value: M.financial.capex, target: 6_800_000, direction: 'lower', owner: 'Michael Chen', change: 9.8, flow: true, dueInDays: 24, info: 'Capex spend against the approved budget' },
  { id: 'opex', name: 'Operating Expenditure', module: 'Financial', unit: 'AED', value: M.financial.opex, target: 3_000_000, direction: 'lower', owner: 'Michael Chen', change: 7.2, flow: true, dueInDays: 9, info: 'Asset operating spend against budget' },
  { id: 'inventoryValue', name: 'Inventory Value', module: 'Financial', unit: 'AED', value: M.inventory.value, target: 5_000_000, direction: 'lower', owner: 'Lisa Wong', change: -2.6, dueInDays: 27, info: 'Stock on hand at cost vs. the holding ceiling' },
  { id: 'wip', name: 'WIP Value', module: 'Financial', unit: 'AED', value: M.production.wipValue, target: 3_600_000, direction: 'lower', owner: 'James Wilson', change: -3.1, dueInDays: 17, info: 'Work in progress at cost vs. the ceiling' }
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

export const BUSINESS_UNITS = ['All business units', 'Operations', 'Maintenance', 'Facilities', 'Corporate'];
const BU_SHARE = [1, 0.4, 0.3, 0.2, 0.1];
const BU_OFFSET = [0, 0.4, -0.6, 0.2, 0.9];

/** Score offset (pts) per site for percentage KPIs */
const SITE_OFFSET: Record<string, number> = {
  'Dubai HQ': 1.2, 'Abu Dhabi Office': 0.6, 'Sharjah Facility': -0.8, 'Riyadh Office': -1.4,
  'London Office': 1.8, 'Singapore Office': 1.4, 'Jebel Ali Warehouse': -2.2, 'Al Ain Depot': -0.7
};

export interface KpiScope {
  share: number;
  periodShare: number;
  offset: number;
}

export function kpiScope(period: string, organization: string, location: string, businessUnit: string): KpiScope {
  const sites = sitesInScope(organization, location);
  const bu = Math.max(0, BUSINESS_UNITS.indexOf(businessUnit));
  const { start, end } = periodWindow(period);
  const groupOffset = weightedAverage(RA_SITES, (s) => SITE_OFFSET[s.name]);
  return {
    share: siteWeight(sites) * BU_SHARE[bu],
    periodShare: (end - start) / RA_MONTHS.length,
    offset: sites.length ? weightedAverage(sites, (s) => SITE_OFFSET[s.name]) - groupOffset + BU_OFFSET[bu] : 0
  };
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

/** Applies the filter scope to a KPI and works out its status, texts and 10-month sparkline. */
export function evaluateKpi(def: KpiDef, scope: KpiScope): KpiState {
  const amount = def.unit === 'count' || def.unit === 'AED';
  const factor = amount ? scope.share * (def.flow ? scope.periodShare : 1) : 1;
  const adjust = (v: number): number => {
    if (amount) return v * factor;
    if (def.unit === '%') return Math.min(99.9, v + scope.offset);
    return v * (1 + (scope.offset / 100) * (def.direction === 'higher' ? 1 : -1));
  };
  const target = amount ? def.target * factor : def.target;
  const noData = scope.share === 0;
  const value = noData ? 0 : adjust(def.value);

  // Sparkline: from the previous-period level to today's value with a gentle deterministic wobble
  const prev = def.value / (1 + def.change / 100);
  const seed = def.id.length + def.name.length;
  const spark = Array.from({ length: 10 }, (_, i) => {
    const base = prev + ((def.value - prev) * i) / 9;
    const wobble = i === 9 ? 0 : Math.sin(i * 1.9 + seed) * (Math.abs(def.value - prev) * 0.25 + def.value * 0.004);
    return noData ? 0 : Number(adjust(base + wobble).toFixed(2));
  });

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
    changeText: signedText(def.change, 1, '%'),
    changeUp: def.change >= 0,
    changeGood,
    spark,
    attainment: noData ? 0 : attainment(value, target, def.direction),
    due: formatDate(dateFromOffset(def.dueInDays))
  };
}

function targetLabel(def: KpiDef, target: number): string {
  if (def.unit === 'AED') return `Budget ${money(target)}`;
  const t = formatKpi(target, def.unit);
  return def.direction === 'lower' && def.unit === 'count' ? `Target <${t}` : `Target ${t}`;
}

function signedText(v: number, digits: number, suffix: string): string {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : ''}${r}${suffix}`;
}
