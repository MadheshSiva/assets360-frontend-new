import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ChartColumn, ChartColumnIncreasing, CircleCheck, CircleDollarSign, Factory, Info, LucideAngularModule, LucideIconData, Settings, TriangleAlert
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { downloadCsv, money } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, RA_COLORS } from '../shared/charts';
import { alignTo, previousRange } from '../asset-performance/kit/api-utils';
import {
  ALL_LINES, ALL_ORGANIZATIONS, ALL_PLANTS, ALL_PRODUCTS, ALL_WORK_CENTERS, PA_DEFAULT_PERIOD, PA_FALLBACK_PERIODS,
  PaKpiValue, ProductionInsight, ProductionOrder, ProductionView, WIP_STAGES, WIP_STAGE_COLORS, WORK_ORDER_COLORS, WORK_ORDER_STATUSES, WorkCenter
} from './wip-production-analytics.data';
import { PaFilterLists, PaFilters, PaPrevious, PaSavedView, WipProductionAnalyticsService } from './wip-production-analytics.service';
import { OrderMenuAction, ProductionOrderTable, WorkCenterTable } from './production-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, Tone, fmtDate, fmtInt
} from '../inventory-analytics/parts';

/** Insight cards by API key: card id (used by the action switch), icon and tone. */
const INSIGHT_STYLE: Record<string, { id: string; icon: LucideIconData; tone: Tone }> = {
  line_utilization: { id: 'line', icon: TriangleAlert, tone: 'red' },
  orders_at_risk: { id: 'risk', icon: ChartColumnIncreasing, tone: 'orange' },
  quality_hold: { id: 'hold', icon: TriangleAlert, tone: 'red' },
  material_shortage: { id: 'shortage', icon: Settings, tone: 'blue' }
};
const ACTION_LABELS: Record<string, { id: string; label: string; primary?: boolean }> = {
  view_orders: { id: 'view', label: 'View orders' },
  open_work_center: { id: 'open', label: 'Open work center', primary: true },
  create_action_plan: { id: 'plan', label: 'Create action plan', primary: true }
};

const qty = (v: number | null): string | number => (v === null ? '—' : v);

/** Reports & Analytics > WIP / Production Analytics */
@Component({
  selector: 'app-ra-wip-production-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog, RaDetailsDialog,
    RaFormDialog, ProductionOrderTable, WorkCenterTable
  ],
  providers: [WipProductionAnalyticsService],
  templateUrl: './wip-production-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './wip-production-analytics.css']
})
export class WipProductionAnalyticsPage extends RaDashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(WipProductionAnalyticsService);
  protected readonly slug = 'wip-production-analytics';

  // Filter values come from /options and /filters
  override periods: string[] = PA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override period = PA_DEFAULT_PERIOD;
  override organization = ALL_ORGANIZATIONS;
  plants: string[] = [ALL_PLANTS];
  /** Production lines found on the orders (the API lists them for every plant) */
  lineOptions: string[] = [ALL_LINES];
  workCenters: string[] = [ALL_WORK_CENTERS];
  products: string[] = [ALL_PRODUCTS];
  plant = ALL_PLANTS;
  line = ALL_LINES;
  workCenter = ALL_WORK_CENTERS;
  product = ALL_PRODUCTS;

  views: PaSavedView[] = [];
  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];

  // Chart inputs, rebuilt in build() so the charts only re-render when the data changes
  outputSeries: ChartSeries[] = [];
  stageSeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  lineLabels: string[] = [];
  lineSeries: ChartSeries[] = [];
  downtimeLabels: string[] = [];
  downtimeSeries: ChartSeries[] = [];
  efficiencySeries: ChartSeries[] = [];
  efficiencyMin = 60;
  totalOrdersText = '';

  readonly pct = (v: number) => `${Math.round(v)}%`;
  readonly hours = (v: number) => `${Math.round(v)} h`;

  /** Previous-period lines while Compare Periods is on */
  private previous: PaPrevious | null = null;
  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  get view(): ProductionView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get utilizationTarget(): number {
    return this.view.utilizationTarget;
  }

  ngOnInit(): void {
    this.views = [this.api.allProductionView()];
    this.build(this.view);
    this.init();
  }

  override get scopeText(): string {
    return `${this.period} · ${this.organization} · ${this.plant}`;
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.recompute();
  }

  /** Reloads the page whenever a filter changes. */
  apply(): void {
    this.recompute();
  }

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<{ periods: string[]; defaultPeriod: string } | null>(null)),
      filters: this.api.loadFilters().pipe(soft<PaFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<PaSavedView[]>([this.api.allProductionView()]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.plants = filters.plants;
        this.lineOptions = filters.lines;
        this.workCenters = filters.workCenters;
        this.products = filters.products;
      }
      this.views = views;
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) this.restoreFilters(preferred.filters);
      if (errors.length) this.notify(errors[0]);
      this.recompute();
    });
  }

  private filters(): PaFilters {
    return { period: this.period, organization: this.organization, plant: this.plant, line: this.line, workCenter: this.workCenter, product: this.product };
  }

  /** Reloads the page from GET /overview (and the previous period's lines when comparing). */
  recompute(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    const f = this.filters();
    this.loadSub = this.api.loadOverview(f).pipe(
      switchMap((v) => {
        if (!this.compare || !v.previousFromUtc || !v.previousToUtc) return of({ v, previous: null });
        return this.api.loadPrevious(f, previousRange(v.previousFromUtc, v.previousToUtc)).pipe(
          map((previous) => ({ v, previous: previous as PaPrevious | null })),
          catchError((err: Error) => {
            this.notify(err.message);
            return of({ v, previous: null });
          })
        );
      })
    ).subscribe({
      next: ({ v, previous }) => {
        this.previous = previous;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.recompute('Data refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  private build(v: ProductionView): void {
    this.buildKpis(v);
    this.buildCharts(v);
    this.insights = v.insights.map((i) => this.toCard(i));
  }

  private buildKpis(v: ProductionView): void {
    const unit = v.outputUnit;
    const show = (k: PaKpiValue, text: (n: number) => string) => ({ value: k.value === null ? '—' : text(k.value), previous: k.previous === null ? '—' : text(k.previous) });
    const card = (id: string, label: string, k: PaKpiValue, text: (n: number) => string, tone: Tone, icon: LucideIconData): KpiCardData =>
      ({ id, label, ...show(k, text), delta: k.change, goodWhenUp: true, tone, icon });
    // On-time, utilization and OEE change in percentage points (the API's changeUnit "points"); output and WIP value in percent
    this.kpis = [
      card('production-output', 'Production Output', v.output, (n) => `${fmtInt(n)} ${unit}`, 'purple', Factory),
      card('wip-value', 'WIP Value', v.wipValue, (n) => money(n), 'green', CircleDollarSign),
      card('on-time-completion', 'On-Time Completion', v.onTime, (n) => `${n.toFixed(1)}%`, 'orange', CircleCheck),
      card('equipment-utilization', 'Equipment Utilization', v.utilization, (n) => `${Math.round(n)}%`, 'blue', Settings),
      card('oee', 'Overall Equipment Effectiveness', v.oee, (n) => `${n.toFixed(1)}%`, 'purple', ChartColumn)
    ];
  }

  private buildCharts(v: ProductionView): void {
    const months = v.labels.length;
    this.outputSeries = [
      { name: 'Actual', values: v.actual, color: RA_COLORS.purple, type: 'bar' },
      { name: 'Planned', values: v.planned, color: RA_COLORS.green, type: 'line' }
    ];
    // The API adds a Target line only when an output target is set
    if (v.target) this.outputSeries.push({ name: 'Target', values: v.target, color: RA_COLORS.pink, type: 'line', dashed: true });
    if (this.compare && this.previous) {
      this.outputSeries.push({ name: 'Actual (previous period)', values: alignTo(this.previous.actual, months), color: RA_COLORS.grey, type: 'line', dashed: true });
    }
    this.stageSeries = v.stageStacks.map((s, i) => {
      const k = WIP_STAGES.indexOf(s.name);
      return { name: s.name, values: s.values, color: WIP_STAGE_COLORS[k >= 0 ? k : i % WIP_STAGE_COLORS.length], type: 'bar' as const };
    });
    this.statusSlices = v.workOrders.map((s, i) => {
      const k = WORK_ORDER_STATUSES.indexOf(s.name);
      return { name: s.name, value: s.count, color: WORK_ORDER_COLORS[k >= 0 ? k : i % WORK_ORDER_COLORS.length] };
    });
    this.totalOrdersText = fmtInt(v.workOrderTotal);

    // Bars are coloured by band (one stacked series per band, only one band has a value per line); lines without a measurement show no bar
    const target = v.utilizationTarget;
    const watch = Math.max(0, target - 10);
    this.lineLabels = v.lines.map((l) => l.name.replace(' ', '\n'));
    const band = (lo: number, hi: number) => v.lines.map((l) => (l.utilization !== null && l.utilization >= lo && l.utilization < hi ? l.utilization : 0));
    this.lineSeries = [
      { name: `At target (≥ ${target}%)`, values: band(target, 101), color: RA_COLORS.green, type: 'bar' },
      { name: `Watch (${watch}–${target}%)`, values: band(watch, target), color: RA_COLORS.orange, type: 'bar' },
      { name: `Below (< ${watch}%)`, values: band(0, watch), color: RA_COLORS.red, type: 'bar' },
      { name: 'Target', values: v.lines.map(() => target), color: RA_COLORS.purple, type: 'line', dashed: true }
    ];

    this.downtimeLabels = v.downtimeCauses.map((c) => c.replace(' ', '\n'));
    this.downtimeSeries = [{ name: 'Downtime', values: v.downtime, color: RA_COLORS.pink, type: 'bar' }];
    this.efficiencySeries = [
      { name: 'OEE', values: v.oeeTrend, color: RA_COLORS.purple },
      { name: 'Availability', values: v.availability, color: RA_COLORS.green },
      { name: 'Performance', values: v.performance, color: RA_COLORS.orange },
      { name: 'Quality', values: v.quality, color: RA_COLORS.pink }
    ];
    if (this.compare && this.previous) {
      this.efficiencySeries.push({ name: 'OEE (previous period)', values: alignTo(this.previous.oee, months), color: RA_COLORS.grey, dashed: true });
    }
    // Months without a measurement plot as 0, so the axis only starts at 60% when every value is above it
    this.efficiencyMin = this.efficiencySeries.every((s) => s.values.every((x) => x >= 60)) ? 60 : 0;
  }

  private toCard(i: ProductionInsight): InsightCard {
    const style = INSIGHT_STYLE[i.key] ?? { id: i.key, icon: Info, tone: (i.severity === 'critical' ? 'red' : i.severity === 'warning' ? 'orange' : 'blue') as Tone };
    const clear = i.count === 0 || i.severity === 'success';
    return {
      id: style.id,
      tone: clear ? 'green' : style.tone,
      icon: clear ? CircleCheck : style.icon,
      title: i.title,
      text: i.message,
      actions: clear ? [] : i.actions.filter((a) => ACTION_LABELS[a]).map((a) => ({ ...ACTION_LABELS[a] }))
    };
  }

  private insight(cardId: string): ProductionInsight | undefined {
    const key = Object.keys(INSIGHT_STYLE).find((k) => INSIGHT_STYLE[k].id === cardId) ?? cardId;
    return this.view.insights.find((i) => i.key === key);
  }

  // ===== Saved views (GET/POST /views) =====

  private restoreFilters(f: Record<string, string>): void {
    const period = f['period'];
    this.period = period && this.periods.includes(period) ? period : PA_DEFAULT_PERIOD;
    this.organization = this.keep('organizations', f['organization'] ?? ALL_ORGANIZATIONS);
    this.plant = this.keep('plants', f['plant'] ?? ALL_PLANTS);
    this.line = this.keep('lineOptions', f['line'] ?? ALL_LINES);
    this.workCenter = this.keep('workCenters', f['workCenter'] ?? ALL_WORK_CENTERS);
    this.product = this.keep('products', f['product'] ?? ALL_PRODUCTS);
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private keep(list: 'organizations' | 'plants' | 'lineOptions' | 'workCenters' | 'products', value: string): string {
    if (!this[list].includes(value)) this[list] = [...this[list], value];
    return value;
  }

  /** Save View (page header): POST /views with the current filter bar. */
  override saveView(name: string): void {
    this.api.createView(name, this.filters()).subscribe({
      next: (saved) => {
        this.views = this.api.views();
        this.notify(`View “${saved.name}” saved with the current filters.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ===== Insight + table actions =====

  onInsight(p: InsightPick): void {
    const insight = this.insight(p.insight.id);
    if (!insight) return;
    if (p.action.id === 'open') {
      this.router.navigateByUrl('/wip-operations/resources');
      return;
    }
    if (p.action.id === 'plan') {
      const subjects: Record<string, string> = {
        line: `Raise utilization on ${insight.lines.join(', ') || 'production lines below target'}`,
        risk: `Recover ${insight.count} production order${insight.count === 1 ? '' : 's'} at risk of late completion`,
        hold: `Release quality hold on ${money(insight.value ?? 0)} of WIP`,
        shortage: 'Resolve material shortages causing production downtime'
      };
      this.openActionPlan(subjects[p.insight.id] ?? insight.title);
      return;
    }
    if (p.insight.id === 'shortage') {
      // Downtime records carry no order, so /orders can't narrow to the affected ones: show the shortage hours per month instead
      this.showShortage();
      return;
    }
    // "View orders": GET /orders with the insight's query (productionLine=…, schedule=At Risk,Delayed or stage=Quality Inspection)
    const titles: Record<string, string> = {
      line: `Active orders on ${insight.lines.join(', ')}`,
      risk: 'Orders at risk of late completion',
      hold: 'Orders on quality hold'
    };
    this.api.loadOrders(this.filters(), insight.query).subscribe({
      next: ({ items }) => {
        // Several lines below target: the query can name only one, so the rest are narrowed here
        const rows = insight.lines.length > 1 ? items.filter((o) => insight.lines.includes(o.line)) : items;
        this.showOrders(rows, titles[p.insight.id] ?? insight.title);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  private showShortage(): void {
    const series = this.view.downtimeTrend.find((s) => s.name === 'Material Shortage');
    const months = this.view.labels.map((l) => l.replace('\n', ' '));
    this.openList({
      title: 'Material shortage downtime by month',
      subtitle: this.scopeText,
      columns: ['Month', 'Downtime (hrs)'],
      numeric: [1],
      rows: months.map((m, i) => [m, series?.values[i] ?? 0]),
      fileName: 'material-shortage-downtime.csv'
    });
  }

  private showOrders(rows: ProductionOrder[], title: string): void {
    this.openList({
      title: `${title} (${rows.length})`,
      subtitle: this.scopeText,
      columns: ['Order No', 'Product', 'Line', 'Work Center', 'Planned Qty', 'Completed Qty', 'WIP Qty', 'WIP Value', 'Due Date', 'Status', 'Priority'],
      numeric: [4, 5, 6, 7],
      rows: rows.map((o) => [
        o.code, o.product, o.line, o.workCenter, qty(o.planned), qty(o.completed), qty(o.wip), money(o.wipValue), o.due ? fmtDate(o.due) : '—', o.state,
        o.priority ?? '—'
      ]),
      fileName: 'production-orders.csv'
    });
  }

  orderAction(e: { order: ProductionOrder; action: OrderMenuAction }): void {
    const o = e.order;
    if (e.action === 'plan') {
      this.openActionPlan(`Action plan for ${o.code} ${o.product} (${o.state})`);
      return;
    }
    const progress = o.planned !== null && o.completed !== null
      ? `${o.completed.toLocaleString('en-US')} of ${o.planned.toLocaleString('en-US')} ${o.unit} (${Math.round(o.progress)}%)`
      : `${Math.round(o.progress)}%`;
    this.openDetails({
      title: `${o.code} · ${o.product}`,
      subtitle: `${o.line} · ${o.site}`,
      items: [
        { label: 'Status', value: o.status },
        { label: 'Stage', value: o.stage },
        { label: 'Schedule', value: o.schedule },
        { label: 'Current work center', value: o.workCenter },
        { label: 'Progress', value: progress },
        { label: 'WIP', value: o.wip === null ? money(o.wipValue) : `${o.wip.toLocaleString('en-US')} ${o.unit} · ${money(o.wipValue)}` },
        { label: 'Due date', value: o.due ? fmtDate(o.due) : '—' },
        { label: 'Priority', value: o.priority ?? '—' }
      ]
    });
  }

  /** Every active order for the filters: GET /orders (the overview returns the first rows only). */
  viewAllOrders(): void {
    this.api.loadOrders(this.filters()).subscribe({
      next: ({ items }) => this.showOrders(items, 'Active production orders'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  viewWorkCenter(c: WorkCenter): void {
    const orders = this.view.orders.filter((o) => o.workCenter === c.name).length;
    this.openDetails({
      title: c.name,
      subtitle: `${c.line} · ${this.scopeText}`,
      items: [
        { label: 'Queue', value: `${c.queue} orders (not started or on hold)` },
        { label: 'In progress', value: `${c.inProgress} orders` },
        { label: 'Average wait', value: c.avgWait === null ? '—' : `${c.avgWait} days` },
        { label: 'Utilization', value: c.utilization === null ? '—' : `${c.utilization}%` },
        { label: 'Bottleneck risk', value: c.risk },
        { label: 'Active orders here', value: String(orders) }
      ]
    });
  }

  // ===== Exports =====

  /** GET /export: the API's Excel workbook (summary, trends, status, lines, downtime, insights, orders and bottlenecks). */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Production analytics workbook exported.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  // Widget CSVs are built in the browser from the data already loaded (the API exports whole pages only)

  exportOrders(): void {
    downloadCsv('active-production-orders.csv',
      ['Order No', 'Product', 'Line', 'Plant', 'Work Center', 'Planned Qty', 'Completed Qty', 'WIP Qty', 'WIP Value (AED)', 'Due Date', 'Status', 'Stage', 'Schedule'],
      this.view.orders.map((o) => [
        o.code, o.product, o.line, o.site, o.workCenter, qty(o.planned), qty(o.completed), qty(o.wip), Math.round(o.wipValue), o.due ?? '', o.status, o.stage, o.schedule
      ]));
  }

  exportWorkCenters(): void {
    downloadCsv('bottleneck-work-centers.csv', ['Work Center', 'Line', 'Queue (Orders)', 'In Progress', 'Avg. Wait (days)', 'Utilization %', 'Risk'],
      this.view.workCenters.map((c) => [c.name, c.line, c.queue, c.inProgress, c.avgWait ?? '', c.utilization ?? '', c.risk]));
  }

  private exportSeries(file: string, labels: string[], series: ChartSeries[]): void {
    downloadCsv(file, ['', ...series.map((s) => s.name)], labels.map((l, i) => [l.replace('\n', ' '), ...series.map((s) => Math.round((s.values[i] ?? 0) * 10) / 10)]));
  }

  exportOutput(): void {
    this.exportSeries('production-output.csv', this.view.labels, this.outputSeries);
  }

  exportStages(): void {
    this.exportSeries('wip-by-stage.csv', this.view.labels, this.stageSeries);
  }

  exportStatus(): void {
    downloadCsv('work-order-status.csv', ['Status', 'Work Orders'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportLines(): void {
    downloadCsv('equipment-utilization-by-line.csv', ['Line', 'Work Centers', 'Utilization %', 'Target %'],
      this.view.lines.map((l) => [l.name, l.workCenters, l.utilization ?? '', l.target]));
  }

  exportDowntime(): void {
    downloadCsv('downtime-by-cause.csv', ['Cause', 'Hours'], this.view.downtimeCauses.map((c, i) => [c, this.view.downtime[i]]));
  }

  exportEfficiency(): void {
    this.exportSeries('production-efficiency.csv', this.view.labels, this.efficiencySeries);
  }
}
