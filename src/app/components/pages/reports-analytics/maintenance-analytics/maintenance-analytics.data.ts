import { RA_MONTH_LABELS } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';
import {
  DOWNTIME_CAUSES, RA_ASSETS, RA_WORK_ORDERS, RaAsset, RaScope, RaWorkOrder, TECHNICIANS, WO_STATUSES, WO_TYPES, WoType, inScope, isActive, mean,
  periodMonths, round1
} from '../asset-performance/kit/asset-universe';

// DEMO MODE: Maintenance Analytics aggregates the shared work order history in asset-performance/kit/asset-universe.

export const ALL_MAINTENANCE_TYPES = 'All maintenance types';
export const MAINTENANCE_TYPES = [ALL_MAINTENANCE_TYPES, ...WO_TYPES];
export const PM_TARGET = 90;

/** Change vs the previous period shown on the KPI cards (%). */
export const MA_DELTAS = { cost: 8.2, open: -12, pm: 4.2, mttr: -18.4, mtbf: 12.5 };

export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const TYPE_COLORS: Record<WoType, string> = { Preventive: RA_COLORS.blue, Corrective: RA_COLORS.orange, Emergency: RA_COLORS.red, Inspection: RA_COLORS.violet };
const STATUS_COLORS = [RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.green, RA_COLORS.red];
const CAUSE_COLORS = [RA_COLORS.red, RA_COLORS.orange, RA_COLORS.blue, RA_COLORS.violet];

// PM compliance by site; shifted so the group figure equals RA_METRICS at full scope
const SITE_PM: Record<string, number> = { DXB: 95, AUH: 93, SHJ: 90, RUH: 88, LON: 96, SIN: 94, JEA: 89, AAN: 86 };
const PM_SHAPE = [86.5, 87.2, 88, 88.4, 89.3, 90.1, 90.6, 91.4, 92.3, 93.2];
const PM_OFFSET = RA_METRICS.maintenance.pmCompliance - mean(RA_ASSETS.map((a) => SITE_PM[a.site.code]));

// Emergency spend target: the full-scope emergency share of cost is 14% above it
const EMERGENCY_OVERRUN = 0.14;
const EMERGENCY_TARGET_SHARE = shareOf(RA_WORK_ORDERS, 'Emergency') / (1 + EMERGENCY_OVERRUN);

function shareOf(orders: RaWorkOrder[], type: WoType): number {
  const total = orders.reduce((s, o) => s + o.cost, 0);
  return total ? orders.filter((o) => o.type === type).reduce((s, o) => s + o.cost, 0) / total : 0;
}

export interface TechnicianRow {
  name: string;
  completed: number;
  firstTimeFix: number;
  response: number;
  sla: number;
}

export interface MaintenanceView {
  assets: RaAsset[];
  /** Work orders raised in the period for the current filters */
  orders: RaWorkOrder[];
  cost: number;
  open: number;
  pmCompliance: number;
  mttr: number;
  mtbf: number;
  labels: string[];
  costTrend: ChartSeries[];
  monthlyEmergency: number[];
  monthlyTotal: number[];
  typeSeries: ChartSeries[];
  statusSlices: ChartSlice[];
  pmTrend: ChartSeries[];
  reliability: ChartSeries[];
  downtimeByCause: ChartSeries[];
  backlog: RaWorkOrder[];
  technicians: TechnicianRow[];
  overdue: RaWorkOrder[];
  emergencyCost: number;
  emergencyTarget: number;
  /** Assets the predictive model expects to fail within 7 days */
  nearFailure: RaAsset[];
  waitingParts: RaWorkOrder[];
}

const sumCost = (list: RaWorkOrder[]) => list.reduce((s, o) => s + o.cost, 0);

export function buildMaintenance(scope: RaScope, period: string, type: string, compare: boolean): MaintenanceView {
  const assets = RA_ASSETS.filter((a) => inScope(a, scope));
  const months = periodMonths(period);
  const ids = new Set(assets.map((a) => a.id));
  const inPeriod = RA_WORK_ORDERS.filter((o) => ids.has(o.asset.id) && months.includes(o.month));
  const orders = type === ALL_MAINTENANCE_TYPES ? inPeriod : inPeriod.filter((o) => o.type === type);
  const byMonth = months.map((m) => orders.filter((o) => o.month === m));

  // Cost trend: planned (preventive + inspection), corrective and emergency spend per month
  const planned = byMonth.map((list) => sumCost(list.filter((o) => o.type === 'Preventive' || o.type === 'Inspection')));
  const corrective = byMonth.map((list) => sumCost(list.filter((o) => o.type === 'Corrective')));
  const emergency = byMonth.map((list) => sumCost(list.filter((o) => o.type === 'Emergency')));
  const totals = byMonth.map(sumCost);
  const costTrend: ChartSeries[] = [
    { name: 'Planned', values: planned, color: RA_COLORS.blue, type: 'bar' },
    { name: 'Corrective', values: corrective, color: RA_COLORS.orange, type: 'bar' },
    { name: 'Emergency', values: emergency, color: RA_COLORS.red, type: 'bar' },
    { name: 'Total Cost', values: totals, color: RA_COLORS.purple, type: 'line' }
  ];
  if (compare) costTrend.push({ name: 'Total (previous period)', values: totals.map((v) => Math.round(v / (1 + MA_DELTAS.cost / 100))), color: RA_COLORS.purple, type: 'line', dashed: true });

  // One coloured column per type: each series only fills its own column
  const types = type === ALL_MAINTENANCE_TYPES ? WO_TYPES : WO_TYPES.filter((t) => t === type);
  const typeSeries: ChartSeries[] = types.map((t, i) => ({
    name: t,
    values: types.map((_, j) => (i === j ? orders.filter((o) => o.type === t).length : 0)),
    color: TYPE_COLORS[t]
  }));

  const statusSlices: ChartSlice[] = WO_STATUSES.map((s, i) => ({ name: s, value: orders.filter((o) => o.status === s).length, color: STATUS_COLORS[i] }));

  const pmCompliance = assets.length ? round1(mean(assets.map((a) => SITE_PM[a.site.code])) + PM_OFFSET) : 0;
  const shapeMean = mean(months.map((m) => PM_SHAPE[m]));
  const pmValues = months.map((m) => (assets.length ? round1(Math.min(100, PM_SHAPE[m] + pmCompliance - shapeMean)) : 0));
  const pmTrend: ChartSeries[] = [
    { name: 'PM Compliance', values: pmValues, color: RA_COLORS.green, area: true },
    { name: `Target ${PM_TARGET}%`, values: months.map(() => PM_TARGET), color: RA_COLORS.grey, dashed: true }
  ];
  if (compare) pmTrend.push({ name: 'Previous period', values: pmValues.map((v) => round1(v / (1 + MA_DELTAS.pm / 100))), color: RA_COLORS.green, dashed: true });

  // MTTR from breakdown repairs, MTBF from the asset register improving through the year
  const repairs = orders.filter((o) => o.type === 'Corrective' || o.type === 'Emergency');
  const mttr = repairs.length ? round1(mean(repairs.map((o) => o.repairHours))) : 0;
  const mtbf = assets.length ? Math.round(mean(assets.map((a) => a.mtbf))) : 0;
  const allShape = mean([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => 0.8 + m * 0.045));
  const reliability: ChartSeries[] = [
    { name: 'MTTR (hrs)', values: byMonth.map((list) => {
      const r = list.filter((o) => o.type === 'Corrective' || o.type === 'Emergency');
      return r.length ? round1(mean(r.map((o) => o.repairHours))) : 0;
    }), color: RA_COLORS.purple },
    { name: 'MTBF (hrs)', values: months.map((m) => Math.round((mtbf * (0.8 + m * 0.045)) / allShape)), color: RA_COLORS.blue, axis: 'right' }
  ];

  const downtimeByCause: ChartSeries[] = DOWNTIME_CAUSES.map((c, i) => ({
    name: c,
    values: byMonth.map((list) => round1(list.filter((o) => o.cause === c).reduce((s, o) => s + o.downtimeHours, 0))),
    color: CAUSE_COLORS[i]
  }));

  const backlog = orders.filter(isActive).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.ageDays - a.ageDays);

  const completed = orders.filter((o) => o.status === 'Completed');
  const technicians: TechnicianRow[] = TECHNICIANS.map((name) => {
    const list = completed.filter((o) => o.technician === name);
    return {
      name,
      completed: list.length,
      firstTimeFix: list.length ? Math.round((list.filter((o) => o.firstTimeFix).length / list.length) * 100) : 0,
      response: list.length ? round1(mean(list.map((o) => o.responseHours))) : 0,
      sla: list.length ? Math.round((list.filter((o) => o.slaMet).length / list.length) * 100) : 0
    };
  }).filter((t) => t.completed > 0);

  const cost = sumCost(orders);
  return {
    assets,
    orders,
    cost,
    open: orders.filter((o) => o.status === 'Open').length,
    pmCompliance,
    mttr,
    mtbf,
    labels: months.map((m) => RA_MONTH_LABELS[m]),
    costTrend,
    monthlyEmergency: months.map((m) => sumCost(inPeriod.filter((o) => o.month === m && o.type === 'Emergency'))),
    monthlyTotal: months.map((m) => sumCost(inPeriod.filter((o) => o.month === m))),
    typeSeries,
    statusSlices,
    pmTrend,
    reliability,
    downtimeByCause,
    backlog,
    technicians,
    overdue: orders.filter((o) => o.status === 'Overdue').sort((a, b) => b.ageDays - a.ageDays),
    emergencyCost: sumCost(inPeriod.filter((o) => o.type === 'Emergency')),
    emergencyTarget: Math.round(sumCost(inPeriod) * EMERGENCY_TARGET_SHARE),
    nearFailure: assets.filter((a) => a.failureWindowDays !== null && a.failureWindowDays <= 7),
    waitingParts: orders.filter((o) => o.status === 'On Hold' && o.cause === 'Parts Unavailable')
  };
}
