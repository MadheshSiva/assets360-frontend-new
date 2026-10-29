import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ChartColumn, ChartColumnIncreasing, CircleCheck, CircleDollarSign, Factory, LucideAngularModule, Settings, TriangleAlert
} from 'lucide-angular';
import { downloadCsv, money } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, RA_COLORS } from '../shared/charts';
import {
  ALL_LINES, ALL_PLANTS, ALL_PRODUCTS, ALL_WORK_CENTERS, DOWNTIME_CAUSES, LINES, PLANTS, PRODUCTS, ProductionOrder, ProductionView,
  UTILIZATION_TARGET, WIP_STAGES, WIP_STAGE_COLORS, WORK_CENTERS, WORK_ORDER_COLORS, WORK_ORDER_STATUSES, WorkCenter, buildProductionView
} from './wip-production-analytics.data';
import { OrderMenuAction, ProductionOrderTable, WorkCenterTable } from './production-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, fmtDate, fmtInt, previousSeries, siteInScope, sumOf
} from '../inventory-analytics/parts';

const KPI_DELTAS = { output: 11.8, wip: 5.6, onTime: 2.8, utilization: 4.7, oee: 3.2 };

/** Reports & Analytics > WIP / Production Analytics */
@Component({
  selector: 'app-ra-wip-production-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog, RaDetailsDialog,
    RaFormDialog, ProductionOrderTable, WorkCenterTable
  ],
  templateUrl: './wip-production-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './wip-production-analytics.css']
})
export class WipProductionAnalyticsPage extends RaDashboardPage implements OnInit {
  private readonly router = inject(Router);
  protected readonly slug = 'wip-production-analytics';

  readonly plants = [ALL_PLANTS, ...PLANTS];
  readonly workCenters = [ALL_WORK_CENTERS, ...WORK_CENTERS.map((c) => c.name)];
  readonly products = [ALL_PRODUCTS, ...PRODUCTS.map((p) => p.name)];
  plant = ALL_PLANTS;
  line = ALL_LINES;
  workCenter = ALL_WORK_CENTERS;
  product = ALL_PRODUCTS;
  lineOptions: string[] = [];

  view!: ProductionView;
  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];

  // Chart inputs, rebuilt in apply() so the charts only re-render when the data changes
  outputSeries: ChartSeries[] = [];
  stageSeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  lineLabels: string[] = [];
  lineSeries: ChartSeries[] = [];
  downtimeSeries: ChartSeries[] = [];
  efficiencySeries: ChartSeries[] = [];
  totalOrdersText = '';

  readonly downtimeLabels = DOWNTIME_CAUSES.map((c) => c.replace(' ', '\n'));
  readonly pct = (v: number) => `${Math.round(v)}%`;
  readonly hours = (v: number) => `${Math.round(v)} h`;

  ngOnInit(): void {
    this.updatedMinutes = 3;
    this.apply();
  }

  override get scopeText(): string {
    return `${this.period} · ${this.organization} · ${this.plant}`;
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.apply();
  }

  /** Recomputes the view whenever a filter changes. */
  apply(): void {
    const location = this.plant === ALL_PLANTS ? 'All locations' : this.plant;
    this.lineOptions = [ALL_LINES, ...LINES.filter((l) => siteInScope(l.site, this.organization, location)).map((l) => l.name)];
    if (!this.lineOptions.includes(this.line)) this.line = ALL_LINES;
    const v = buildProductionView({ period: this.period, organization: this.organization, plant: this.plant, line: this.line, workCenter: this.workCenter, product: this.product });
    this.view = v;
    this.buildKpis(v);
    this.buildCharts(v);
    this.buildInsights(v);
  }

  private buildKpis(v: ProductionView): void {
    const d = KPI_DELTAS;
    const prev = (value: number, delta: number) => value / (1 + delta / 100);
    this.kpis = [
      { id: 'production-output', label: 'Production Output', value: `${fmtInt(v.output)} units`, delta: d.output, goodWhenUp: true, previous: `${fmtInt(prev(v.output, d.output))} units`, tone: 'purple', icon: Factory },
      { id: 'wip-value', label: 'WIP Value', value: money(v.wipValue), delta: d.wip, goodWhenUp: true, previous: money(prev(v.wipValue, d.wip)), tone: 'green', icon: CircleDollarSign },
      { id: 'on-time-completion', label: 'On-Time Completion', value: `${v.onTime.toFixed(1)}%`, delta: d.onTime, goodWhenUp: true, previous: `${prev(v.onTime, d.onTime).toFixed(1)}%`, tone: 'orange', icon: CircleCheck },
      { id: 'equipment-utilization', label: 'Equipment Utilization', value: `${Math.round(v.utilization)}%`, delta: d.utilization, goodWhenUp: true, previous: `${Math.round(prev(v.utilization, d.utilization))}%`, tone: 'blue', icon: Settings },
      { id: 'oee', label: 'Overall Equipment Effectiveness', value: `${v.oee.toFixed(1)}%`, delta: d.oee, goodWhenUp: true, previous: `${prev(v.oee, d.oee).toFixed(1)}%`, tone: 'purple', icon: ChartColumn }
    ];
  }

  private buildCharts(v: ProductionView): void {
    this.outputSeries = [
      { name: 'Actual', values: v.actual, color: RA_COLORS.purple, type: 'bar' },
      { name: 'Planned', values: v.planned, color: RA_COLORS.green, type: 'line' },
      { name: 'Target', values: v.target, color: RA_COLORS.pink, type: 'line', dashed: true }
    ];
    if (this.compare) {
      this.outputSeries.push({ name: 'Actual (previous period)', values: previousSeries(v.actual, KPI_DELTAS.output).map(Math.round), color: RA_COLORS.grey, type: 'line', dashed: true });
    }
    this.stageSeries = WIP_STAGES.map((name, i) => ({ name, values: v.stageStacks[i], color: WIP_STAGE_COLORS[i], type: 'bar' as const }));
    this.statusSlices = WORK_ORDER_STATUSES.map((name, i) => ({ name, value: v.workOrders[i], color: WORK_ORDER_COLORS[i] }));
    this.totalOrdersText = fmtInt(sumOf(v.workOrders));

    // Bars are coloured by band (one stacked series per band, only one band has a value per line)
    this.lineLabels = v.lines.map((l) => `Production\n${l.name}`);
    const band = (lo: number, hi: number) => v.lines.map((l) => (l.utilization >= lo && l.utilization < hi ? l.utilization : 0));
    this.lineSeries = [
      { name: `At target (≥ ${UTILIZATION_TARGET}%)`, values: band(UTILIZATION_TARGET, 101), color: RA_COLORS.green, type: 'bar' },
      { name: 'Watch (75–85%)', values: band(75, UTILIZATION_TARGET), color: RA_COLORS.orange, type: 'bar' },
      { name: 'Below (< 75%)', values: band(0, 75), color: RA_COLORS.red, type: 'bar' },
      { name: 'Target', values: v.lines.map(() => UTILIZATION_TARGET), color: RA_COLORS.purple, type: 'line', dashed: true }
    ];

    this.downtimeSeries = [{ name: 'Downtime', values: v.downtime, color: RA_COLORS.pink, type: 'bar' }];
    this.efficiencySeries = [
      { name: 'OEE', values: v.oeeTrend, color: RA_COLORS.purple },
      { name: 'Availability', values: v.availability, color: RA_COLORS.green },
      { name: 'Performance', values: v.performance, color: RA_COLORS.orange },
      { name: 'Quality', values: v.quality, color: RA_COLORS.pink }
    ];
    if (this.compare) {
      this.efficiencySeries.push({ name: 'OEE (previous period)', values: previousSeries(v.oeeTrend, KPI_DELTAS.oee), color: RA_COLORS.grey, dashed: true });
    }
  }

  private buildInsights(v: ProductionView): void {
    const list: InsightCard[] = [];
    const low = [...v.lines].sort((a, b) => a.utilization - b.utilization)[0];
    if (low && low.utilization < UTILIZATION_TARGET) {
      list.push({
        id: 'line', tone: 'red', icon: TriangleAlert, title: `${low.name} utilization below target`,
        text: `Production ${low.name} (${low.site}) is operating at ${low.utilization}% utilization, below the target of ${UTILIZATION_TARGET}%.`,
        actions: [{ id: 'view', label: 'View orders' }, { id: 'open', label: 'Open work center', primary: true }]
      });
    }
    const atRisk = this.ordersWith('At Risk');
    if (atRisk.length) {
      const share = ((atRisk.length / v.orders.length) * 100).toFixed(1);
      list.push({
        id: 'risk', tone: 'orange', icon: ChartColumnIncreasing, title: `${atRisk.length} production order${atRisk.length === 1 ? '' : 's'} at risk of late completion`,
        text: `${atRisk.length} orders (${share}% of active orders) are at risk due to current WIP and resource constraints.`,
        actions: [{ id: 'view', label: 'View orders' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    const hold = this.ordersWith('Quality Hold');
    if (hold.length) {
      const value = money(sumOf(hold.map((o) => o.wipValue)));
      list.push({
        id: 'hold', tone: 'red', icon: TriangleAlert, title: `Quality hold affecting ${value} WIP`,
        text: `${value} of WIP across ${hold.length} order${hold.length === 1 ? ' is' : 's are'} currently on hold due to quality inspection issues.`,
        actions: [{ id: 'view', label: 'View orders' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    const shortageHours = v.downtime[DOWNTIME_CAUSES.indexOf('Material Shortage')];
    if (shortageHours > 0) {
      list.push({
        id: 'shortage', tone: 'blue', icon: Settings, title: `Material shortage causing ${shortageHours} hours downtime`,
        text: `Material shortage has caused ${shortageHours} hours of downtime in the current period.`,
        actions: [{ id: 'view', label: 'View orders' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    this.insights = list;
  }

  private ordersWith(status: string): ProductionOrder[] {
    return this.view.orders.filter((o) => o.status === status);
  }

  // ===== Insight + table actions =====

  onInsight(p: InsightPick): void {
    const v = this.view;
    const low = [...v.lines].sort((a, b) => a.utilization - b.utilization)[0];
    switch (`${p.insight.id}:${p.action.id}`) {
      case 'line:view':
        this.showOrders(v.orders.filter((o) => o.line === low.name), `Active orders on ${low.name}`);
        break;
      case 'line:open':
        this.router.navigateByUrl('/wip-operations/resources');
        break;
      case 'risk:view':
        this.showOrders(this.ordersWith('At Risk'), 'Orders at risk of late completion');
        break;
      case 'risk:plan':
        this.openActionPlan(`Recover ${this.ordersWith('At Risk').length} production orders at risk of late completion`);
        break;
      case 'hold:view':
        this.showOrders(this.ordersWith('Quality Hold'), 'Orders on quality hold');
        break;
      case 'hold:plan':
        this.openActionPlan(`Release quality hold on ${money(sumOf(this.ordersWith('Quality Hold').map((o) => o.wipValue)))} of WIP`);
        break;
      case 'shortage:view':
        this.showOrders(v.orders.filter((o) => o.materialShortage), 'Orders affected by material shortage');
        break;
      case 'shortage:plan':
        this.openActionPlan('Resolve material shortages causing production downtime');
        break;
    }
  }

  private showOrders(rows: ProductionOrder[], title: string): void {
    this.openList({
      title,
      subtitle: this.scopeText,
      columns: ['Order No', 'Product', 'Line', 'Work Center', 'Planned Qty', 'Completed Qty', 'WIP Qty', 'WIP Value', 'Due Date', 'Status', 'Supervisor'],
      numeric: [4, 5, 6, 7],
      rows: [...rows].sort((a, b) => a.due.localeCompare(b.due))
        .map((o) => [o.code, o.product, o.line, o.workCenter, o.planned, o.completed, o.wip, money(o.wipValue), fmtDate(o.due), o.status, o.supervisor]),
      fileName: 'production-orders.csv'
    });
  }

  orderAction(e: { order: ProductionOrder; action: OrderMenuAction }): void {
    const o = e.order;
    if (e.action === 'plan') {
      this.openActionPlan(`Action plan for ${o.code} ${o.product} (${o.status})`, o.supervisor);
      return;
    }
    this.openDetails({
      title: `${o.code} · ${o.product}`,
      subtitle: `${o.line} · ${o.site}`,
      items: [
        { label: 'Status', value: o.status },
        { label: 'Current work center', value: o.workCenter },
        { label: 'Progress', value: `${o.completed.toLocaleString('en-US')} of ${o.planned.toLocaleString('en-US')} (${Math.round((o.completed / o.planned) * 100)}%)` },
        { label: 'WIP', value: `${o.wip.toLocaleString('en-US')} units · ${money(o.wipValue)}` },
        { label: 'Due date', value: fmtDate(o.due) },
        { label: 'Material shortage', value: o.materialShortage ? 'Yes' : 'No' },
        { label: 'Supervisor', value: o.supervisor }
      ]
    });
  }

  viewAllOrders(): void {
    this.showOrders(this.view.orders, 'Active production orders');
  }

  viewWorkCenter(c: WorkCenter & { risk: string }): void {
    const orders = this.view.orders.filter((o) => o.workCenter === c.name).length;
    this.openDetails({
      title: `${c.code} · ${c.name}`,
      subtitle: this.scopeText,
      items: [
        { label: 'Queue', value: `${c.queue} orders` },
        { label: 'Average wait', value: `${c.avgWait} hrs` },
        { label: 'Capacity used', value: `${c.capacity}%` },
        { label: 'Bottleneck risk', value: c.risk },
        { label: 'Active orders here', value: String(orders) }
      ]
    });
  }

  // ===== Exports =====

  exportPage(): void {
    this.exportOrders();
    this.exportWorkCenters();
    this.notify('Exported active production orders and bottleneck work centers (CSV).');
  }

  exportOrders(): void {
    downloadCsv('active-production-orders.csv', ['Order No', 'Product', 'Line', 'Site', 'Work Center', 'Planned Qty', 'Completed Qty', 'WIP Qty', 'WIP Value (AED)', 'Due Date', 'Status'],
      this.view.orders.map((o) => [o.code, o.product, o.line, o.site, o.workCenter, o.planned, o.completed, o.wip, Math.round(o.wipValue), o.due, o.status]));
  }

  exportWorkCenters(): void {
    downloadCsv('bottleneck-work-centers.csv', ['Code', 'Work Center', 'Queue (Orders)', 'Avg. Wait (hrs)', 'Capacity %', 'Risk'],
      this.view.workCenters.map((c) => [c.code, c.name, c.queue, c.avgWait, c.capacity, c.risk]));
  }

  private exportSeries(file: string, labels: string[], series: ChartSeries[]): void {
    downloadCsv(file, ['', ...series.map((s) => s.name)], labels.map((l, i) => [l.replace('\n', ' '), ...series.map((s) => Math.round((s.values[i] ?? 0) * 10) / 10)]));
  }

  exportOutput(): void {
    this.exportSeries('production-output.csv', this.view.window.labels, this.outputSeries);
  }

  exportStages(): void {
    this.exportSeries('wip-by-stage.csv', this.view.window.labels, this.stageSeries);
  }

  exportStatus(): void {
    downloadCsv('work-order-status.csv', ['Status', 'Work Orders'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportLines(): void {
    downloadCsv('equipment-utilization-by-line.csv', ['Line', 'Site', 'Utilization %', 'Target %'], this.view.lines.map((l) => [l.name, l.site, l.utilization, UTILIZATION_TARGET]));
  }

  exportDowntime(): void {
    downloadCsv('downtime-by-cause.csv', ['Cause', 'Hours'], DOWNTIME_CAUSES.map((c, i) => [c, this.view.downtime[i]]));
  }

  exportEfficiency(): void {
    this.exportSeries('production-efficiency.csv', this.view.window.labels, this.efficiencySeries);
  }
}
