import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { downloadCsv } from '../shared/analytics-common';
import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';
import { ALL_CATEGORIES } from '../asset-performance/kit/asset-universe';
import { monthLabel } from '../asset-performance/kit/api-utils';
import {
  ALL_LOCATIONS, ALL_MAINTENANCE_TYPES, ALL_MAINTENANCE_VIEW, ALL_ORGANIZATIONS, DAY_MS, MA_CATEGORIES, MA_DEFAULT_PERIOD, MA_DEMO,
  MA_DOWNTIME_CAUSES, MA_FALLBACK_PERIODS, MA_FALLBACK_TYPES, MA_GROUP, MA_ORGANIZATIONS, MA_SITES, MA_TODAY, MaDemoAsset, MaDemoOrder, MaInsight,
  MaKpiValue, MaWorkOrder, MaintenanceView, PM_TARGET, PRIORITY_RANK, TechnicianRow, emptyMaintenance, monthCategory, monthCoverage, monthStart, periodOffsets
} from './maintenance-analytics.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface MaFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  maintenanceType: string;
}

export interface MaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface MaOptions {
  periods: string[];
  defaultPeriod: string;
  maintenanceTypes: string[];
  complianceTarget: number;
}

export interface MaFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
}

/** Previous-period lines for Compare Periods. */
export interface MaPreviousTrends {
  totalCost: number[];
  emergency: number[];
  pm: number[];
}

/** The overview shows this many backlog rows (the tables sort them in the browser). */
const BACKLOG_ROWS = 200;
/** Assets below this health score count as approaching failure. */
const FAILURE_HEALTH = 45;
const HOURS_PER_MONTH = 720;

const COST_COLORS: Record<string, string> = { Planned: RA_COLORS.blue, Corrective: RA_COLORS.orange, Emergency: RA_COLORS.red, 'Total Cost': RA_COLORS.purple };
const TYPE_COLORS: Record<string, string> = { Preventive: RA_COLORS.blue, Corrective: RA_COLORS.orange, Emergency: RA_COLORS.red, Inspection: RA_COLORS.violet };
const STATUS_COLORS: Record<string, string> = { Open: RA_COLORS.blue, 'In Progress': RA_COLORS.orange, 'On Hold': RA_COLORS.pink, Completed: RA_COLORS.green, Overdue: RA_COLORS.red };
const CAUSE_COLORS = [RA_COLORS.red, RA_COLORS.orange, RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.teal];
const STATUSES = ['Open', 'In Progress', 'On Hold', 'Overdue', 'Completed'];

const round1 = (v: number) => Math.round(v * 10) / 10;
const sum = (list: number[]) => list.reduce((s, v) => s + v, 0);
const mean = (list: number[]) => (list.length ? sum(list) / list.length : null);
const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms).slice(0, 10);
const isRepair = (o: MaDemoOrder) => o.type === 'Corrective' || o.type === 'Emergency';
const unfinished = (o: MaDemoOrder) => o.status !== 'Completed';
/** Relative change in %, one decimal. */
const change = (now: number | null, before: number | null) => (now === null || !before ? 0 : round1(((now - before) / before) * 100));

/** "All …" in the filter bar is no filter. */
const all = (value: string, everything: string) => !value || value === everything;

function inScope(a: MaDemoAsset, f: MaFilters): boolean {
  return (all(f.organization, ALL_ORGANIZATIONS) || f.organization === MA_GROUP || a.organization === f.organization)
    && (all(f.location, ALL_LOCATIONS) || a.location === f.location)
    && (all(f.category, ALL_CATEGORIES) || a.category === f.category);
}

function toWorkOrder(o: MaDemoOrder): MaWorkOrder {
  return {
    key: o.key,
    id: o.id,
    type: o.type,
    priority: o.priority,
    assetId: o.asset.id,
    asset: o.asset.name,
    location: o.asset.location,
    ageDays: Math.round((MA_TODAY - o.raised) / DAY_MS),
    technician: o.technician ?? 'Unassigned',
    status: o.status,
    dueDate: day(o.due),
    overdue: o.status === 'Overdue',
    partsShortage: o.partsShortage
  };
}

const byUrgency = (a: MaDemoOrder, b: MaDemoOrder) => (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) || a.raised - b.raised;

/** PM compliance (%) of preventive orders already due. */
function pmRate(list: MaDemoOrder[]): { value: number | null; completed: number; due: number } {
  const due = list.filter((o) => o.type === 'Preventive' && o.due <= MA_TODAY);
  const completed = due.filter((o) => o.onTime).length;
  return { value: due.length ? round1((completed / due.length) * 100) : null, completed, due: due.length };
}

/** MTBF (hrs): operating hours of the assets in scope over the breakdowns. */
const mtbf = (assets: number, months: number[], failures: number) =>
  (assets ? Math.round((assets * HOURS_PER_MONTH * sum(months.map(monthCoverage))) / Math.max(1, failures)) : null);

/** Maintenance Analytics figures, filters and saved views, computed in the browser from the static demo dataset. */
@Injectable()
export class MaintenanceAnalyticsService {
  readonly view = signal<MaintenanceView>(emptyMaintenance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(MA_FALLBACK_PERIODS);
  readonly views = signal<MaSavedView[]>([]);

  private savedViews: MaSavedView[] = [
    {
      viewId: 'view-uae-emergency', name: 'UAE Emergency Work', builtIn: false, isDefault: false,
      filters: { period: 'This quarter', organization: 'Purple IQ UAE', location: ALL_LOCATIONS, category: ALL_CATEGORIES, maintenanceType: 'Emergency' }
    },
    {
      viewId: 'view-dubai-hvac', name: 'Dubai HQ – HVAC', builtIn: false, isDefault: false,
      filters: { period: MA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: 'Dubai HQ', category: 'HVAC', maintenanceType: ALL_MAINTENANCE_TYPES }
    }
  ];
  private nextViewId = 1;

  /** Period presets, maintenance types and the compliance target. */
  loadOptions(): Observable<MaOptions> {
    this.periods.set(MA_FALLBACK_PERIODS);
    return of({
      periods: MA_FALLBACK_PERIODS,
      defaultPeriod: MA_DEFAULT_PERIOD,
      maintenanceTypes: [ALL_MAINTENANCE_TYPES, ...MA_FALLBACK_TYPES],
      complianceTarget: PM_TARGET
    });
  }

  /** Organization, Location and Asset Category values. */
  loadFilters(): Observable<MaFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...MA_ORGANIZATIONS],
      locations: [ALL_LOCATIONS, ...MA_SITES.map((s) => s.location)],
      categories: [ALL_CATEGORIES, ...MA_CATEGORIES]
    });
  }

  private assets(f: MaFilters): MaDemoAsset[] {
    return MA_DEMO.assets.filter((a) => inScope(a, f));
  }

  /** Work orders for the filter bar (any month); the maintenance type filter applies too. */
  private orders(f: MaFilters): MaDemoOrder[] {
    return MA_DEMO.orders.filter((o) => inScope(o.asset, f) && (all(f.maintenanceType, ALL_MAINTENANCE_TYPES) || o.type === f.maintenanceType));
  }

  /** Every section for the filter bar in one call. */
  loadOverview(f: MaFilters): Observable<MaintenanceView> {
    this.loading.set(true);
    const v = this.build(f);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  private build(f: MaFilters): MaintenanceView {
    const { current, previous } = periodOffsets(f.period || MA_DEFAULT_PERIOD);
    const assets = this.assets(f);
    const scoped = this.orders(f);
    const inMonths = (months: number[]) => scoped.filter((o) => months.includes(o.month));
    const orders = inMonths(current);
    const before = inMonths(previous);
    const byMonth = current.map((m) => orders.filter((o) => o.month === m));
    const labels = current.map((m) => monthLabel(monthCategory(m)));
    const previousEnd = monthStart(previous[previous.length - 1] - 1);
    // Scales previous-period totals to the current period's length so the change % compares like with like
    const prorate = previous.length ? current.length / previous.length : 1;

    // Cost
    const costOf = (list: MaDemoOrder[]) => sum(list.map((o) => o.cost));
    const planned = byMonth.map((l) => costOf(l.filter((o) => o.type === 'Preventive' || o.type === 'Inspection')));
    const corrective = byMonth.map((l) => costOf(l.filter((o) => o.type === 'Corrective')));
    const emergency = byMonth.map((l) => costOf(l.filter((o) => o.type === 'Emergency')));
    const totals = byMonth.map(costOf);
    const costTrend: ChartSeries[] = [
      { name: 'Planned', values: planned, color: COST_COLORS['Planned'], type: 'bar' },
      { name: 'Corrective', values: corrective, color: COST_COLORS['Corrective'], type: 'bar' },
      { name: 'Emergency', values: emergency, color: COST_COLORS['Emergency'], type: 'bar' },
      { name: 'Total Cost', values: totals, color: COST_COLORS['Total Cost'], type: 'line' }
    ];
    const totalCost = sum(totals);

    // Work orders by type: one coloured column per type (each series only fills its own column)
    const types = all(f.maintenanceType, ALL_MAINTENANCE_TYPES) ? MA_FALLBACK_TYPES : MA_FALLBACK_TYPES.filter((t) => t === f.maintenanceType);
    const typeSeries: ChartSeries[] = types.map((t, i) => ({
      name: t,
      values: types.map((_, j) => (i === j ? orders.filter((o) => o.type === t).length : 0)),
      color: TYPE_COLORS[t] ?? RA_COLORS.teal
    }));
    const statusSlices: ChartSlice[] = STATUSES.map((s) => ({ name: s, value: orders.filter((o) => o.status === s).length, color: STATUS_COLORS[s] }))
      .filter((s) => s.value > 0);

    // Open work orders now, against those still open at the end of the previous period
    const open = orders.filter(unfinished).length;
    const openBefore = before.filter((o) => o.completedAt === null || o.completedAt > previousEnd).length;

    // Preventive compliance
    const pm = pmRate(orders);
    const pmBefore = pmRate(before);
    const pmValues = byMonth.map((l) => pmRate(l).value ?? 0);

    // Reliability
    const repairs = orders.filter(isRepair);
    const repairsBefore = before.filter(isRepair);
    const mttr = mean(repairs.map((o) => o.repairHours));
    const mttrBefore = mean(repairsBefore.map((o) => o.repairHours));
    const mtbfNow = mtbf(assets.length, current, repairs.length);
    const mtbfBefore = mtbf(assets.length, previous, repairsBefore.length);

    // Downtime by cause
    const downtimeByCause: ChartSeries[] = MA_DOWNTIME_CAUSES.map((c, i) => ({
      name: c,
      values: byMonth.map((l) => round1(sum(l.filter((o) => o.cause === c).map((o) => o.downtimeHours)))),
      color: CAUSE_COLORS[i % CAUSE_COLORS.length]
    }));

    const backlog = scoped.filter(unfinished).sort(byUrgency);
    const emergencyCost = sum(emergency);
    const target = PM_TARGET;

    return {
      generatedAt: new Date().toISOString(),
      previousFromUtc: iso(monthStart(previous[0])),
      previousToUtc: iso(previousEnd),
      complianceTarget: target,
      cost: { value: totalCost, change: change(totalCost, costOf(before) * prorate), unit: 'percent' },
      open: { value: open, change: change(open, openBefore), unit: 'percent' },
      pmCompliance: { value: pm.value, change: pm.value !== null && pmBefore.value !== null ? round1(pm.value - pmBefore.value) : 0, unit: 'points' },
      mttr: { value: mttr === null ? null : round1(mttr), change: change(mttr, mttrBefore), unit: 'percent' },
      mtbf: { value: mtbfNow, change: change(mtbfNow, mtbfBefore), unit: 'percent' },
      labels,
      costTrend,
      monthlyEmergency: emergency,
      monthlyTotal: totals,
      emergencyCost,
      totalCost,
      workOrders: orders.length,
      typeSeries,
      statusSlices,
      pmCompleted: pm.completed,
      pmDue: pm.due,
      pmTrend: [
        { name: 'PM Compliance', values: pmValues, color: RA_COLORS.green, area: true },
        { name: `Target ${target}%`, values: labels.map(() => target), color: RA_COLORS.grey, dashed: true }
      ],
      reliability: [
        { name: 'MTTR (hrs)', values: byMonth.map((l) => round1(mean(l.filter(isRepair).map((o) => o.repairHours)) ?? 0)), color: RA_COLORS.purple },
        { name: 'MTBF (hrs)', values: byMonth.map((l, i) => mtbf(assets.length, [current[i]], l.filter(isRepair).length) ?? 0), color: RA_COLORS.blue, axis: 'right' }
      ],
      downtimeByCause,
      downtimeHours: round1(sum(orders.map((o) => o.downtimeHours))),
      backlog: backlog.slice(0, BACKLOG_ROWS).map(toWorkOrder),
      backlogTotal: backlog.length,
      technicians: this.technicians(orders),
      insights: this.insights(assets, scoped, orders, backlog, emergencyCost, Math.round(sum(before.filter((o) => o.type === 'Emergency').map((o) => o.cost)) * prorate), totalCost)
    };
  }

  private technicians(orders: MaDemoOrder[]): TechnicianRow[] {
    const names = [...new Set(orders.map((o) => o.technician).filter((t): t is string => !!t))];
    return names.map((name) => {
      const mine = orders.filter((o) => o.technician === name);
      const done = mine.filter((o) => o.status === 'Completed');
      const rate = (ok: number) => (done.length ? Math.round((ok / done.length) * 100) : null);
      const response = mean(mine.map((o) => o.responseHours));
      return {
        name,
        assigned: mine.length,
        completed: done.length,
        firstTimeFix: rate(done.filter((o) => o.firstTimeFix).length),
        response: response === null ? null : round1(response),
        sla: rate(done.filter((o) => o.slaMet).length)
      };
    });
  }

  private insights(
    assets: MaDemoAsset[], scoped: MaDemoOrder[], orders: MaDemoOrder[], backlog: MaDemoOrder[], emergencyCost: number, emergencyBefore: number,
    totalCost: number
  ): MaInsight[] {
    const aed = (v: number) => `AED ${Math.round(v).toLocaleString('en-US')}`;
    const overdue = backlog.filter((o) => o.status === 'Overdue').sort((a, b) => a.due - b.due);
    const critical = overdue.filter((o) => o.priority === 'Critical' || o.priority === 'High').length;
    const pastDue = (o: MaDemoOrder) => Math.max(1, Math.round((MA_TODAY - o.due) / DAY_MS));
    const emergencyChange = change(emergencyCost, emergencyBefore);
    const emergencyCount = orders.filter((o) => o.type === 'Emergency').length;

    // Low health, or repeated breakdowns in the last 90 days
    const breakdowns = (a: MaDemoAsset) => scoped.filter((o) => o.asset === a && isRepair(o) && o.raised >= MA_TODAY - 90 * DAY_MS).length;
    const atRisk = assets
      .map((a) => ({ a, failures: breakdowns(a) }))
      .filter(({ a, failures }) => a.health < FAILURE_HEALTH || failures >= 4)
      .sort((x, y) => x.a.health - y.a.health);
    const shortage = backlog.filter((o) => o.partsShortage);
    const parts = [...new Set(shortage.flatMap((o) => o.parts))];
    const orderRef = (o: MaDemoOrder, reasons: string[]) => ({
      key: o.key, id: o.id, assetId: o.asset.id, asset: o.asset.name, priority: o.priority, status: o.status, reasons
    });

    return [
      {
        key: 'overdue_work_orders',
        severity: overdue.length ? 'critical' : 'success',
        title: overdue.length ? `${overdue.length} work orders are overdue` : 'No overdue work orders',
        message: overdue.length
          ? `${critical} of them are critical or high priority. The oldest, ${overdue[0].id} (${overdue[0].asset.name}), is ${pastDue(overdue[0])} days past due.`
          : 'Every open work order is within its due date.',
        count: overdue.length,
        workOrders: overdue.map((o) => orderRef(o, [`${pastDue(o)} days past due`])),
        assets: [],
        parts: [],
        actions: overdue.length ? ['view_work_orders', 'create_action_plan'] : ['view_work_orders'],
        query: 'status=Overdue'
      },
      {
        key: 'emergency_cost',
        severity: emergencyChange > 0 ? 'warning' : 'success',
        title: emergencyChange > 0 ? `Emergency maintenance cost up ${emergencyChange}%` : `Emergency maintenance cost down ${Math.abs(emergencyChange)}%`,
        message: `${emergencyCount} emergency work orders cost ${aed(emergencyCost)} this period (${totalCost ? round1((emergencyCost / totalCost) * 100) : 0}% of `
          + `maintenance spend), against ${aed(emergencyBefore)} in the previous period.`,
        count: emergencyCount,
        workOrders: [],
        assets: [],
        parts: [],
        actions: ['view_details', 'create_action_plan'],
        query: 'type=Emergency'
      },
      {
        key: 'assets_approaching_failure',
        severity: atRisk.length ? 'warning' : 'success',
        title: atRisk.length ? `${atRisk.length} assets approaching failure threshold` : 'No assets near the failure threshold',
        message: atRisk.length
          ? `Health below ${FAILURE_HEALTH} or repeated breakdowns in the last 90 days. Lowest: ${atRisk[0].a.name} at ${atRisk[0].a.location} (health ${atRisk[0].a.health}).`
          : `Every asset in view has a health score of ${FAILURE_HEALTH} or more.`,
        count: atRisk.length,
        workOrders: [],
        assets: atRisk.map(({ a, failures }) => ({
          key: a.key, id: a.id, name: a.name, location: a.location, health: a.health,
          reasons: [
            ...(a.health < FAILURE_HEALTH ? [`Health score ${a.health}`] : []),
            ...(failures ? [`${failures} breakdown${failures === 1 ? '' : 's'} in the last 90 days`] : [])
          ]
        })),
        parts: [],
        actions: atRisk.length ? ['view_assets', 'create_action_plan'] : ['view_assets'],
        query: ''
      },
      {
        key: 'spare_parts_shortage',
        severity: shortage.length ? 'info' : 'success',
        title: shortage.length ? `${shortage.length} work orders waiting for spare parts` : 'No work orders waiting for parts',
        message: shortage.length
          ? `${parts.length} parts are out of stock or below minimum, including ${parts.slice(0, 3).join(', ')}.`
          : 'Spare parts are available for every open work order.',
        count: shortage.length,
        workOrders: shortage.map((o) => orderRef(o, o.parts.map((p) => `Waiting for ${p}`))),
        assets: [],
        parts,
        actions: ['view_work_orders', 'open_inventory'],
        query: 'partsShortage=true'
      }
    ];
  }

  /** Compare Periods: the previous period's cost lines and PM compliance, month by month. */
  loadPrevious(f: MaFilters, _range?: { from: string; to: string }): Observable<MaPreviousTrends> {
    const { previous } = periodOffsets(f.period || MA_DEFAULT_PERIOD);
    const scoped = this.orders(f);
    const months = previous.map((m) => scoped.filter((o) => o.month === m));
    return of({
      totalCost: months.map((l) => sum(l.map((o) => o.cost))),
      emergency: months.map((l) => sum(l.filter((o) => o.type === 'Emergency').map((o) => o.cost))),
      pm: months.map((l) => pmRate(l).value ?? 0)
    });
  }

  /** The previous period's monthly emergency cost (Emergency insight → View details). */
  loadPreviousEmergency(f: MaFilters): Observable<{ labels: string[]; values: number[] }> {
    const { previous } = periodOffsets(f.period || MA_DEFAULT_PERIOD);
    const scoped = this.orders(f).filter((o) => o.type === 'Emergency');
    return of({
      labels: previous.map(monthCategory),
      values: previous.map((m) => sum(scoped.filter((o) => o.month === m).map((o) => o.cost)))
    });
  }

  /** Unfinished work orders with extra filters (status, partsShortage, assignedTo, type), most urgent first. */
  loadBacklog(f: MaFilters, extra: Record<string, string> = {}): Observable<{ items: MaWorkOrder[]; total: number }> {
    const statuses = extra['status'] ? extra['status'].split(',') : null;
    const rows = this.orders(f)
      .filter(unfinished)
      .filter((o) => (!statuses || statuses.includes(o.status))
        && (extra['partsShortage'] !== 'true' || o.partsShortage)
        && (!extra['assignedTo'] || (o.technician ?? 'Unassigned') === extra['assignedTo'])
        && (!extra['type'] || o.type === extra['type']))
      .sort(byUrgency);
    return of({ items: rows.slice(0, BACKLOG_ROWS).map(toWorkOrder), total: rows.length });
  }

  /** The work orders behind an insight's "View work orders" (status=Overdue or partsShortage=true). */
  loadInsightOrders(f: MaFilters, insight: MaInsight): Observable<{ items: MaWorkOrder[]; total: number }> {
    const extra: Record<string, string> = {};
    for (const part of insight.query.split('&')) {
      const [key, value] = part.split('=');
      if (key) extra[key] = value ?? '';
    }
    return this.loadBacklog(f, extra);
  }

  /** Monthly summary and the backlog for the filter bar, as a CSV download. */
  export(f: MaFilters): Observable<void> {
    const v = this.view().labels.length ? this.view() : this.build(f);
    const series = (name: string, list: ChartSeries[]) => list.find((s) => s.name === name)?.values ?? [];
    const rows: (string | number)[][] = v.labels.map((l, i) => [
      l.replace('\n', ' '),
      series('Planned', v.costTrend)[i] ?? 0,
      series('Corrective', v.costTrend)[i] ?? 0,
      series('Emergency', v.costTrend)[i] ?? 0,
      v.monthlyTotal[i] ?? 0,
      series('PM Compliance', v.pmTrend)[i] ?? 0,
      series('MTTR (hrs)', v.reliability)[i] ?? 0,
      series('MTBF (hrs)', v.reliability)[i] ?? 0,
      round1(sum(v.downtimeByCause.map((s) => s.values[i] ?? 0)))
    ]);
    downloadCsv('maintenance-analytics.csv',
      ['Month', 'Planned (AED)', 'Corrective (AED)', 'Emergency (AED)', 'Total Cost (AED)', 'PM Compliance %', 'MTTR (hrs)', 'MTBF (hrs)', 'Downtime (hrs)'], rows);
    return of(undefined);
  }

  // ----- Saved views (kept in memory for the session) -----

  /** The built-in All Maintenance view, then the user's own. */
  loadViews(): Observable<MaSavedView[]> {
    const list = [this.allMaintenanceView(), ...this.savedViews];
    this.views.set(list);
    return of(list);
  }

  createView(name: string, f: MaFilters, isDefault = false): Observable<MaSavedView> {
    const saved: MaSavedView = { viewId: `view-${Date.now()}-${this.nextViewId++}`, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = [...this.savedViews, saved];
    this.views.update((list) => [...list, saved]);
    return of(saved);
  }

  updateView(viewId: string, name: string, f: MaFilters, isDefault = false): Observable<MaSavedView> {
    const saved: MaSavedView = { viewId, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = this.savedViews.map((v) => (v.viewId === viewId ? saved : v));
    this.views.update((list) => list.map((v) => (v.viewId === viewId ? saved : v)));
    return of(saved);
  }

  deleteView(viewId: string): Observable<void> {
    this.savedViews = this.savedViews.filter((v) => v.viewId !== viewId);
    this.views.update((list) => list.filter((v) => v.viewId !== viewId));
    return of(undefined);
  }

  allMaintenanceView(): MaSavedView {
    return {
      viewId: 'all-maintenance', name: ALL_MAINTENANCE_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: MA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, maintenanceType: ALL_MAINTENANCE_TYPES
      }
    };
  }

  private toFilters(f: MaFilters): Record<string, string> {
    return {
      period: f.period && this.periods().includes(f.period) ? f.period : MA_DEFAULT_PERIOD,
      organization: f.organization || ALL_ORGANIZATIONS,
      location: f.location || ALL_LOCATIONS,
      category: f.category || ALL_CATEGORIES,
      maintenanceType: f.maintenanceType || ALL_MAINTENANCE_TYPES
    };
  }
}
