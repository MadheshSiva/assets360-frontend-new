import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { downloadCsv } from '../shared/analytics-common';
import { monthLabel } from '../asset-performance/kit/api-utils';
import {
  ALL_LINES, ALL_ORGANIZATIONS, ALL_PLANTS, ALL_PRODUCTION_VIEW, ALL_PRODUCTS, ALL_WORK_CENTERS, DAY_MS, DOWNTIME_CAUSES, DemoLine, DemoLineMonth,
  DemoOrder, PA_DEFAULT_PERIOD, PA_FALLBACK_PERIODS, PaKpiValue, ProductionInsight, ProductionOrder, ProductionView, UTILIZATION_TARGET, WIP_DEMO,
  WIP_GROUP, WIP_LINES, WIP_ORGANIZATIONS, WIP_PLANTS, WIP_PRODUCTS, WIP_STAGES, WIP_TODAY, WORK_ORDER_STATUSES, WorkCenter, emptyProductionView,
  monthCategory, monthEnd, monthStart, periodOffsets
} from './wip-production-analytics.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface PaFilters {
  period: string;
  organization: string;
  plant: string;
  line: string;
  workCenter: string;
  product: string;
}

export interface PaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface PaFilterLists {
  organizations: string[];
  plants: string[];
  lines: string[];
  workCenters: string[];
  products: string[];
}

export interface PaPrevious {
  actual: number[];
  oee: number[];
}

/** Rows the overview returns for the bottleneck list. */
const OVERVIEW_BOTTLENECKS = 10;
const RISK_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

const round1 = (v: number) => Math.round(v * 10) / 10;
const sum = (list: number[]) => list.reduce((s, v) => s + v, 0);
const mean = (list: number[]) => (list.length ? sum(list) / list.length : null);
const iso = (ms: number) => new Date(ms).toISOString();
const all = (value: string, everything: string) => !value || value === everything;
/** Relative change in %, one decimal. */
const pctChange = (now: number | null, before: number | null) => (now === null || !before ? 0 : round1(((now - before) / before) * 100));
const kpi = (value: number | null, previous: number | null, points: boolean): PaKpiValue => ({
  value, previous, change: points ? (value === null || previous === null ? 0 : round1(value - previous)) : pctChange(value, previous)
});

// ----- An order's state at a moment -----

const completedAt = (o: DemoOrder) => o.raised + (o.duration / o.pace) * DAY_MS;
const progressAt = (o: DemoOrder, t: number) => Math.max(0, Math.min(1, ((t - o.raised) / DAY_MS / o.duration) * o.pace));
const activeAt = (o: DemoOrder, t: number) => o.raised < t && completedAt(o) > t;
const stageOf = (p: number) => (p < 0.15 ? WIP_STAGES[0] : p < 0.7 ? WIP_STAGES[1] : p < 0.9 ? WIP_STAGES[2] : WIP_STAGES[3]);
const wipValueAt = (o: DemoOrder, t: number) => Math.round(o.planned * o.unitCost * (0.3 + 0.6 * progressAt(o, t)));

function statusNow(o: DemoOrder): string {
  if (!activeAt(o, WIP_TODAY + DAY_MS)) return 'Completed';
  const p = progressAt(o, WIP_TODAY);
  return p < 0.05 ? 'Not Started' : o.onHold ? 'On Hold' : 'In Progress';
}

function scheduleNow(o: DemoOrder): string {
  if (WIP_TODAY > o.due) return 'Delayed';
  const expected = (WIP_TODAY - o.raised) / DAY_MS / o.duration;
  return expected - progressAt(o, WIP_TODAY) > 0.1 ? 'At Risk' : 'On Track';
}

function toOrder(o: DemoOrder): ProductionOrder {
  const p = progressAt(o, WIP_TODAY);
  const status = statusNow(o);
  const stage = stageOf(p);
  const schedule = scheduleNow(o);
  const completed = Math.round(o.planned * p);
  return {
    key: o.key,
    code: o.code,
    product: o.product,
    line: o.line.name,
    site: o.line.plant,
    workCenter: o.workCenter,
    assetId: o.assetId,
    planned: o.planned,
    completed,
    wip: status === 'Not Started' ? 0 : o.planned - completed,
    unit: 'units',
    progress: Math.round(p * 1000) / 10,
    due: iso(o.due).slice(0, 10),
    status,
    stage,
    schedule,
    state: schedule !== 'On Track' ? schedule : stage === 'Quality Inspection' ? 'Quality Hold' : status,
    wipValue: wipValueAt(o, WIP_TODAY),
    priority: o.priority
  };
}

/** WIP / Production figures, filters and saved views, computed in the browser from the static demo dataset. */
@Injectable()
export class WipProductionAnalyticsService {
  readonly view = signal<ProductionView>(emptyProductionView());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(PA_FALLBACK_PERIODS);
  readonly views = signal<PaSavedView[]>([]);

  private savedViews: PaSavedView[] = [
    {
      viewId: 'view-jebel-ali', name: 'Jebel Ali Plant', builtIn: false, isDefault: false,
      filters: { period: PA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, plant: 'Jebel Ali Plant', line: ALL_LINES, workCenter: ALL_WORK_CENTERS, product: ALL_PRODUCTS }
    },
    {
      viewId: 'view-enclosures', name: 'Enclosures – this quarter', builtIn: false, isDefault: false,
      filters: { period: 'This quarter', organization: ALL_ORGANIZATIONS, plant: ALL_PLANTS, line: ALL_LINES, workCenter: ALL_WORK_CENTERS, product: 'Steel Enclosure EN-30' }
    }
  ];
  private nextViewId = 1;

  /** Period presets and the default one. */
  loadOptions(): Observable<{ periods: string[]; defaultPeriod: string }> {
    this.periods.set(PA_FALLBACK_PERIODS);
    return of({ periods: PA_FALLBACK_PERIODS, defaultPeriod: PA_DEFAULT_PERIOD });
  }

  /** Organizations, plants, lines, work centers and products. */
  loadFilters(): Observable<PaFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...WIP_ORGANIZATIONS],
      plants: [ALL_PLANTS, ...WIP_PLANTS],
      lines: [ALL_LINES, ...WIP_LINES.map((l) => l.name)],
      workCenters: [ALL_WORK_CENTERS, ...WIP_LINES.flatMap((l) => l.workCenters)],
      products: [ALL_PRODUCTS, ...WIP_PRODUCTS.map((p) => p.name)]
    });
  }

  private lines(f: PaFilters): DemoLine[] {
    return WIP_LINES.filter((l) => (all(f.organization, ALL_ORGANIZATIONS) || f.organization === WIP_GROUP || l.organization === f.organization)
      && (all(f.plant, ALL_PLANTS) || l.plant === f.plant)
      && (all(f.line, ALL_LINES) || l.name === f.line)
      && (all(f.workCenter, ALL_WORK_CENTERS) || l.workCenters.includes(f.workCenter))
      && (all(f.product, ALL_PRODUCTS) || l.products.some(([p]) => p === f.product)));
  }

  private orders(f: PaFilters): DemoOrder[] {
    const lines = this.lines(f);
    return WIP_DEMO.orders.filter((o) => lines.includes(o.line)
      && (all(f.workCenter, ALL_WORK_CENTERS) || o.workCenter === f.workCenter)
      && (all(f.product, ALL_PRODUCTS) || o.product === f.product));
  }

  /** Output share of the line that the product filter keeps. */
  private share(line: DemoLine, f: PaFilters): number {
    return all(f.product, ALL_PRODUCTS) ? 1 : (line.products.find(([p]) => p === f.product)?.[1] ?? 0);
  }

  private lineMonth(line: DemoLine, m: number): DemoLineMonth {
    return WIP_DEMO.months.get(line.name)![m];
  }

  /** Output per month (units) for the lines in scope. */
  private output(lines: DemoLine[], f: PaFilters, months: number[], key: 'actual' | 'planned' | 'target'): number[] {
    return months.map((m) => Math.round(sum(lines.map((l) => this.lineMonth(l, m)[key] * this.share(l, f)))));
  }

  /** OEE components per month, weighted by each line's output. */
  private efficiency(lines: DemoLine[], months: number[]) {
    const avg = (m: number, pick: (x: DemoLineMonth) => number) => {
      const rows = lines.map((l) => this.lineMonth(l, m));
      const weight = sum(rows.map((r) => r.actual));
      return weight ? round1(sum(rows.map((r) => pick(r) * r.actual)) / weight) : 0;
    };
    return {
      availability: months.map((m) => avg(m, (r) => r.availability)),
      performance: months.map((m) => avg(m, (r) => r.performance)),
      quality: months.map((m) => avg(m, (r) => r.quality)),
      oee: months.map((m) => avg(m, (r) => (r.availability * r.performance * r.quality) / 10_000))
    };
  }

  /** Every section for the filter bar in one call. */
  loadOverview(f: PaFilters): Observable<ProductionView> {
    this.loading.set(true);
    const v = this.build(f);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  private build(f: PaFilters): ProductionView {
    const { current, previous } = periodOffsets(f.period || PA_DEFAULT_PERIOD);
    const lines = this.lines(f);
    const orders = this.orders(f);
    const labels = current.map((m) => monthLabel(monthCategory(m)));
    const from = monthStart(current[0]);
    const to = monthEnd(current[current.length - 1]);
    const prevFrom = monthStart(previous[0]);
    const prevTo = monthEnd(previous[previous.length - 1]);
    const target = UTILIZATION_TARGET;

    const actual = this.output(lines, f, current, 'actual');
    const actualBefore = this.output(lines, f, previous, 'actual');
    const eff = this.efficiency(lines, current);
    const effBefore = this.efficiency(lines, previous);
    const periodMean = (list: number[]) => (list.length && lines.length ? round1(mean(list) ?? 0) : null);

    // WIP value now and at the end of the previous period
    const active = orders.filter((o) => activeAt(o, WIP_TODAY + DAY_MS));
    const wipNow = sum(active.map((o) => wipValueAt(o, WIP_TODAY)));
    const wipBefore = sum(orders.filter((o) => activeAt(o, prevTo)).map((o) => wipValueAt(o, prevTo)));

    // On-time completion of the orders finished in each period
    const onTime = (start: number, end: number) => {
      const done = orders.filter((o) => completedAt(o) >= start && completedAt(o) < end && completedAt(o) <= WIP_TODAY + DAY_MS);
      return done.length ? round1((done.filter((o) => completedAt(o) <= o.due).length / done.length) * 100) : null;
    };

    const utilizationOf = (line: DemoLine, months: number[]) => round1(mean(months.map((m) => this.lineMonth(line, m).utilization)) ?? 0);
    const utilNow = lines.length ? round1(mean(lines.map((l) => utilizationOf(l, current))) ?? 0) : null;
    const utilBefore = lines.length ? round1(mean(lines.map((l) => utilizationOf(l, previous))) ?? 0) : null;

    // WIP by stage at each month end
    const stageStacks = WIP_STAGES.map((stage) => ({
      name: stage,
      values: current.map((m) => {
        const t = m === 0 ? WIP_TODAY : monthEnd(m);
        return sum(orders.filter((o) => activeAt(o, t) && stageOf(progressAt(o, t)) === stage).map((o) => wipValueAt(o, t)));
      })
    }));

    // Work orders raised in the period, by status now
    const raised = orders.filter((o) => o.raised >= from && o.raised < to);
    const statuses = raised.map(statusNow);

    // Downtime
    const downtimeTrend = DOWNTIME_CAUSES.map((cause, i) => ({
      name: cause,
      values: current.map((m) => round1(sum(lines.map((l) => this.lineMonth(l, m).downtime[i]))))
    }));

    const lineRows = lines.map((l) => {
      const u = utilizationOf(l, current);
      return { name: l.name, workCenters: l.workCenters.length, utilization: u, target, meetsTarget: u >= target };
    });

    const workCenters = this.bottlenecks(lines, f, active, current);
    const rows = active.map(toOrder).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));

    return {
      generatedAt: new Date().toISOString(),
      previousFromUtc: iso(prevFrom),
      previousToUtc: iso(prevTo),
      utilizationTarget: target,
      outputUnit: 'units',
      output: kpi(lines.length ? sum(actual) : null, lines.length ? sum(actualBefore) : null, false),
      wipValue: kpi(wipNow, wipBefore, false),
      onTime: kpi(onTime(from, to), onTime(prevFrom, prevTo), true),
      utilization: kpi(utilNow, utilBefore, true),
      oee: kpi(periodMean(eff.oee), periodMean(effBefore.oee), true),
      labels,
      actual,
      planned: this.output(lines, f, current, 'planned'),
      target: this.output(lines, f, current, 'target'),
      stageStacks,
      workOrderTotal: raised.length,
      workOrders: WORK_ORDER_STATUSES.map((name) => ({ name, count: statuses.filter((s) => s === name).length })),
      lines: lineRows,
      downtimeCauses: DOWNTIME_CAUSES,
      downtime: downtimeTrend.map((s) => round1(sum(s.values))),
      downtimeTrend,
      availability: eff.availability,
      performance: eff.performance,
      quality: eff.quality,
      oeeTrend: eff.oee,
      hasEfficiency: lines.length > 0,
      orders: rows,
      ordersTotal: rows.length,
      workCenters,
      insights: this.insights(lineRows, rows, downtimeTrend.find((s) => s.name === 'Material Shortage')?.values ?? [], target)
    };
  }

  private bottlenecks(lines: DemoLine[], f: PaFilters, active: DemoOrder[], months: number[]): WorkCenter[] {
    const centers = lines.flatMap((l) => l.workCenters.map((name, i) => ({ name, line: l, i })))
      .filter((c) => all(f.workCenter, ALL_WORK_CENTERS) || c.name === f.workCenter);
    return centers.map(({ name, line, i }) => {
      const here = active.filter((o) => o.workCenter === name);
      const queued = here.filter((o) => ['Not Started', 'On Hold'].includes(statusNow(o)));
      const wait = mean(queued.map((o) => (WIP_TODAY - o.raised) / DAY_MS));
      const utilization = round1(Math.min(99, (mean(months.map((m) => this.lineMonth(line, m).utilization)) ?? 0) + (i === 0 ? 3.5 : -2.5)));
      const risk = utilization >= 90 || queued.length >= 4 ? 'High' : utilization >= 82 || queued.length >= 2 ? 'Medium' : 'Low';
      return {
        name, line: line.name, queue: queued.length, inProgress: here.length - queued.length, avgWait: wait === null ? null : round1(wait), utilization, risk
      };
    })
      .sort((a, b) => RISK_RANK[b.risk] - RISK_RANK[a.risk] || (b.utilization ?? 0) - (a.utilization ?? 0) || b.queue - a.queue)
      .slice(0, OVERVIEW_BOTTLENECKS);
  }

  private insights(lines: ProductionView['lines'], orders: ProductionOrder[], shortage: number[], target: number): ProductionInsight[] {
    const aed = (v: number) => `AED ${Math.round(v).toLocaleString('en-US')}`;
    const below = lines.filter((l) => l.utilization !== null && l.utilization < target).sort((a, b) => (a.utilization ?? 0) - (b.utilization ?? 0));
    const risky = orders.filter((o) => o.schedule !== 'On Track');
    const delayed = risky.filter((o) => o.schedule === 'Delayed').length;
    const hold = orders.filter((o) => o.stage === 'Quality Inspection');
    const holdValue = sum(hold.map((o) => o.wipValue));
    const shortageHours = round1(sum(shortage));
    return [
      {
        key: 'line_utilization',
        severity: below.length ? 'warning' : 'success',
        title: below.length ? `${below.length} production line${below.length === 1 ? '' : 's'} below ${target}% utilization` : `Every line at or above ${target}% utilization`,
        message: below.length
          ? `${below.map((l) => `${l.name} (${l.utilization}%)`).join(', ')} ran below the ${target}% target in the period.`
          : 'Equipment utilization is on target across the production lines.',
        count: below.length,
        value: below[0]?.utilization ?? null,
        lines: below.map((l) => l.name),
        actions: ['view_orders', 'create_action_plan'],
        query: below.length ? `productionLine=${below[0].name}` : ''
      },
      {
        key: 'orders_at_risk',
        severity: delayed ? 'critical' : risky.length ? 'warning' : 'success',
        title: risky.length ? `${risky.length} orders at risk of late completion` : 'All active orders on schedule',
        message: risky.length
          ? `${delayed} are already past their due date and ${risky.length - delayed} are behind their planned progress.`
          : 'Every active production order is tracking to its due date.',
        count: risky.length,
        value: null,
        lines: [...new Set(risky.map((o) => o.line))],
        actions: ['view_orders', 'create_action_plan'],
        query: 'schedule=At Risk,Delayed'
      },
      {
        key: 'quality_hold',
        severity: hold.length ? 'warning' : 'success',
        title: hold.length ? `${aed(holdValue)} of WIP in quality inspection` : 'No WIP waiting on quality inspection',
        message: hold.length
          ? `${hold.length} orders are waiting for quality release before dispatch.`
          : 'No production orders are held at quality inspection.',
        count: hold.length,
        value: holdValue,
        lines: [...new Set(hold.map((o) => o.line))],
        actions: ['view_orders', 'create_action_plan'],
        query: 'stage=Quality Inspection'
      },
      {
        key: 'material_shortage',
        severity: shortageHours ? 'info' : 'success',
        title: shortageHours ? `${shortageHours.toLocaleString('en-US')} hours lost to material shortages` : 'No downtime from material shortages',
        message: shortageHours
          ? 'Late supplier deliveries of steel sheet and electronic components stopped the lines in the period.'
          : 'Materials were available for every scheduled run.',
        count: Math.round(shortageHours),
        value: shortageHours,
        lines: [],
        actions: ['view_orders', 'create_action_plan'],
        query: ''
      }
    ];
  }

  /** Compare Periods: the previous period's Actual output and OEE line. */
  loadPrevious(f: PaFilters, _range?: { from: string; to: string }): Observable<PaPrevious> {
    const { previous } = periodOffsets(f.period || PA_DEFAULT_PERIOD);
    const lines = this.lines(f);
    return of({ actual: this.output(lines, f, previous, 'actual'), oee: this.efficiency(lines, previous).oee });
  }

  /** Active orders, optionally narrowed by an insight's query (schedule=…, stage=…, productionLine=…), soonest due first. */
  loadOrders(f: PaFilters, query = ''): Observable<{ items: ProductionOrder[]; total: number }> {
    const q: Record<string, string> = {};
    for (const part of query.split('&')) {
      const [key, value] = part.split('=');
      if (key) q[key] = value ?? '';
    }
    const schedules = q['schedule'] ? q['schedule'].split(',') : null;
    const items = this.orders(f)
      .filter((o) => activeAt(o, WIP_TODAY + DAY_MS))
      .map(toOrder)
      .filter((o) => (!schedules || schedules.includes(o.schedule)) && (!q['stage'] || o.stage === q['stage'])
        && (!q['productionLine'] || o.line === q['productionLine']))
      .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
    return of({ items, total: items.length });
  }

  /** Monthly output, efficiency and downtime for the filter bar, as a CSV download. */
  export(f: PaFilters): Observable<void> {
    const v = this.build(f);
    downloadCsv('production-analytics.csv',
      ['Month', 'Planned (units)', 'Actual (units)', 'Target (units)', 'Availability %', 'Performance %', 'Quality %', 'OEE %', 'Downtime (hrs)', 'WIP Value (AED)'],
      v.labels.map((l, i) => [
        l.replace('\n', ' '), v.planned[i] ?? 0, v.actual[i] ?? 0, v.target?.[i] ?? '', v.availability[i] ?? 0, v.performance[i] ?? 0, v.quality[i] ?? 0,
        v.oeeTrend[i] ?? 0, round1(sum(v.downtimeTrend.map((s) => s.values[i] ?? 0))), sum(v.stageStacks.map((s) => s.values[i] ?? 0))
      ]));
    return of(undefined);
  }

  // ----- Saved views (kept in memory for the session) -----

  /** The built-in All Production view, then the user's own. */
  loadViews(): Observable<PaSavedView[]> {
    const list = [this.allProductionView(), ...this.savedViews];
    this.views.set(list);
    return of(list);
  }

  createView(name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const saved: PaSavedView = { viewId: `view-${Date.now()}-${this.nextViewId++}`, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = [...this.savedViews, saved];
    this.views.update((list) => [...list, saved]);
    return of(saved);
  }

  updateView(viewId: string, name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const saved: PaSavedView = { viewId, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = this.savedViews.map((v) => (v.viewId === viewId ? saved : v));
    this.views.update((list) => list.map((v) => (v.viewId === viewId ? saved : v)));
    return of(saved);
  }

  deleteView(viewId: string): Observable<void> {
    this.savedViews = this.savedViews.filter((v) => v.viewId !== viewId);
    this.views.update((list) => list.filter((v) => v.viewId !== viewId));
    return of(undefined);
  }

  allProductionView(): PaSavedView {
    return {
      viewId: 'all-production', name: ALL_PRODUCTION_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: PA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, plant: ALL_PLANTS, line: ALL_LINES, workCenter: ALL_WORK_CENTERS, product: ALL_PRODUCTS
      }
    };
  }

  private toFilters(f: PaFilters): Record<string, string> {
    return {
      period: f.period && this.periods().includes(f.period) ? f.period : PA_DEFAULT_PERIOD,
      organization: f.organization || ALL_ORGANIZATIONS,
      plant: f.plant || ALL_PLANTS,
      line: f.line || ALL_LINES,
      workCenter: f.workCenter || ALL_WORK_CENTERS,
      product: f.product || ALL_PRODUCTS
    };
  }
}
