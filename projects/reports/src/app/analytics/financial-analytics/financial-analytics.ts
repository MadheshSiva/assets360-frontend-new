import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChartColumn, ChartPie, CircleDollarSign, Coins, FileText, Lightbulb, LucideAngularModule, Target, TriangleAlert, Wrench
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { CURRENT_USER, RA_PEOPLE, downloadCsv } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import {
  ALL_CATEGORIES, ALL_COST_CENTERS, ALL_LOCATIONS, ALL_ORGANIZATIONS, BUDGET_TARGET, CURRENCIES, CostAsset, CostCenterRow, Currency, FA_DEFAULT_PERIOD,
  FA_FALLBACK_PERIODS, FinancialKpi, FinancialView, TCO_COLORS, TCO_COMPONENTS, moneyIn, toCurrency
} from './financial-analytics.data';
import { FaCostCenterOption, FaFilterLists, FaFilters, FaOptions, FinancialAnalyticsService } from './financial-analytics.service';
import { CostAssetTable, CostCenterTable } from './financial-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, fmtDate, sumOf
} from '../inventory-analytics/parts';

/** Reports & Analytics > Financial Analytics */
@Component({
  selector: 'app-ra-financial-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog,
    RaDetailsDialog, RaFormDialog, CostAssetTable, CostCenterTable
  ],
  providers: [FinancialAnalyticsService],
  templateUrl: './financial-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './financial-analytics.css']
})
export class FinancialAnalyticsPage extends RaDashboardPage implements OnInit {
  protected readonly slug = 'financial-analytics';
  private readonly api = inject(FinancialAnalyticsService);

  readonly icons = { CircleDollarSign, Target, ChartColumn };
  // Filter values come from /options, /filters and /cost-centers
  override periods: string[] = FA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override period = FA_DEFAULT_PERIOD;
  override organization = ALL_ORGANIZATIONS;
  override location = ALL_LOCATIONS;
  categories: string[] = [ALL_CATEGORIES];
  costCenterOptions: string[] = [ALL_COST_CENTERS];
  private costCenterValues = new Map<string, string>();
  readonly currencies = CURRENCIES;
  budgetTarget = BUDGET_TARGET;
  category = ALL_CATEGORIES;
  costCenter = ALL_COST_CENTERS;
  currency: Currency = 'AED';
  error: string | null = null;

  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];

  // Chart inputs, rebuilt in rebuild() so the charts only re-render when the data changes
  tcoSeries: ChartSeries[] = [];
  budgetLabels: string[] = [];
  budgetSeries: ChartSeries[] = [];
  budgetRightMin = -40;
  budgetRightMax = 20;
  categorySlices: ChartSlice[] = [];
  depreciationSeries: ChartSeries[] = [];
  siteLabels: string[] = [];
  siteSeries: ChartSeries[] = [];
  tcoCenter = '';
  budgetUtilization = 0;

  readonly pctFormat = (v: number) => `${Math.round(v)}%`;
  readonly sliceFormat = (v: number) => compactNumber(v);

  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  get view(): FinancialView {
    return this.api.view();
  }

  get loading(): boolean {
    return this.api.loading();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  /** Nothing recorded for the filters: no assets, costs or cost centers. */
  get empty(): boolean {
    const v = this.view;
    return this.loaded && !v.totalAssetValue.value && !v.tcoTotal && !v.assetTotal && !v.costCenters.length;
  }

  ngOnInit(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<FaOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<FaFilterLists | null>(null)),
      costCenters: this.api.loadCostCenters().pipe(soft<FaCostCenterOption[] | null>(null))
    }).subscribe(({ options, filters, costCenters }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.budgetTarget = options.budgetTarget;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
      }
      if (costCenters) {
        this.costCenterOptions = costCenters.map((c) => c.label);
        this.costCenterValues = new Map(costCenters.map((c) => [c.label, c.value]));
      }
      if (errors.length) this.notify(errors[0]);
      this.apply();
    });
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  get costAxisTitle(): string {
    return `Cost (${this.currency})`;
  }

  get valueAxisTitle(): string {
    return `Value (${this.currency})`;
  }

  /** Purple while within budget, red once spend passes it */
  get gaugeColor(): string {
    return this.budgetUtilization > 100 ? RA_COLORS.red : RA_COLORS.purple;
  }

  get gaugeDisplay(): string {
    return this.view.budgetUtilization === null ? '—' : `${this.budgetUtilization}%`;
  }

  get pendingCapex(): number {
    return sumOf(this.view.capexRequests.map((r) => r.amount));
  }

  fmt(aed: number): string {
    return moneyIn(aed, this.currency);
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.rebuild();
  }

  private filters(): FaFilters {
    const code = this.costCenterValues.get(this.costCenter);
    return {
      period: this.period,
      organization: this.organization,
      location: this.location,
      category: this.category,
      costCenter: this.costCenter === ALL_COST_CENTERS ? null : code || this.costCenter
    };
  }

  /** Reloads the page from GET /overview whenever a filter changes. */
  apply(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    this.loadSub = this.api.loadOverview(this.filters()).subscribe({
      next: () => {
        this.error = null;
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        this.rebuild();
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.error = err.message;
        this.notify(err.message);
      }
    });
  }

  /** Currency changes only convert the figures already loaded. */
  setCurrency(): void {
    this.rebuild();
  }

  override refresh(): void {
    if (!this.refreshing) this.apply('Data refreshed.');
  }

  override saveView(name: string): void {
    this.api.createView(name, this.filters()).subscribe({
      next: () => this.notify(`View “${name}” saved with the current period, organization, location and category.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  private rebuild(): void {
    const v = this.view;
    this.buildKpis(v);
    this.buildCharts(v);
    this.buildInsights(v);
  }

  private buildKpis(v: FinancialView): void {
    const kpi = (id: string, label: string, k: FinancialKpi, goodWhenUp: boolean, tone: KpiCardData['tone'], icon: KpiCardData['icon']): KpiCardData => ({
      id, label, value: this.fmt(k.value), delta: k.change ?? 0, goodWhenUp, previous: this.fmt(k.previous), tone, icon
    });
    this.kpis = [
      kpi('total-asset-value', 'Total Asset Value', v.totalAssetValue, true, 'purple', Coins),
      kpi('maintenance-spend', 'Maintenance Spend', v.maintenance, false, 'blue', Wrench),
      kpi('capex', 'CAPEX', v.capex, false, 'green', ChartColumn),
      kpi('opex', 'OPEX', v.opex, false, 'orange', ChartPie),
      kpi('net-book-value', 'Net Book Value', v.netBookValue, true, 'purple', FileText)
    ];
  }

  private buildCharts(v: FinancialView): void {
    const cur = (values: number[]) => values.map((x) => toCurrency(x, this.currency));
    this.tcoSeries = TCO_COMPONENTS.map((name, i) => ({ name, values: cur(v.tco[i] ?? []), color: TCO_COLORS[i], type: 'bar' as const }));
    this.tcoSeries.push({ name: 'Total TCO (cumulative)', values: cur(v.tcoCumulative), color: RA_COLORS.purple, type: 'line', axis: 'right' });
    if (this.compare) {
      this.tcoSeries.push({ name: 'Total TCO (previous period)', values: cur(v.tcoCumulativePrevious), color: RA_COLORS.grey, type: 'line', axis: 'right', dashed: true });
    }
    this.tcoCenter = this.fmt(v.tcoTotal).replace(`${this.currency} `, '');

    this.budgetLabels = v.costCenters.map((c) => c.name);
    const variance = v.costCenters.map((c) => (c.utilization === null ? 0 : c.utilization - 100));
    this.budgetSeries = [
      { name: 'Budget', values: cur(v.costCenters.map((c) => c.budget)), color: RA_COLORS.sky, type: 'bar' },
      { name: 'Actual', values: cur(v.costCenters.map((c) => c.actual)), color: RA_COLORS.purple, type: 'bar' },
      { name: 'Variance %', values: variance, color: RA_COLORS.red, type: 'line', axis: 'right' }
    ];
    // Keep the variance axis wide enough for real overruns
    this.budgetRightMin = Math.min(-40, Math.floor(Math.min(0, ...variance) / 10) * 10);
    this.budgetRightMax = Math.max(20, Math.ceil(Math.max(0, ...variance) / 10) * 10);
    this.budgetUtilization = v.budgetUtilization ?? 0;

    this.categorySlices = v.categoryCosts.map((c) => ({ name: c.name, value: toCurrency(c.value, this.currency), color: c.color }));

    this.depreciationSeries = [
      { name: 'Monthly Depreciation', values: cur(v.depreciation), color: RA_COLORS.blue, type: 'bar' },
      { name: 'Accumulated Depreciation', values: cur(v.accumulated), color: RA_COLORS.purple, type: 'line', axis: 'right' }
    ];
    if (this.compare) {
      this.depreciationSeries.push({ name: 'Monthly Depreciation (previous period)', values: cur(v.depreciationPrevious), color: RA_COLORS.grey, type: 'line', dashed: true });
    }

    // Wrap the last word of the site name onto a second line ("Jebel Ali\nWarehouse")
    this.siteLabels = v.siteMaintenance.map((s) => {
      const at = s.site.lastIndexOf(' ');
      return at > 0 ? `${s.site.slice(0, at)}\n${s.site.slice(at + 1)}` : s.site;
    });
    this.siteSeries = [
      { name: 'Labor', values: cur(v.siteMaintenance.map((s) => s.labour)), color: RA_COLORS.blue, type: 'bar' },
      { name: 'Parts', values: cur(v.siteMaintenance.map((s) => s.parts)), color: RA_COLORS.green, type: 'bar' },
      { name: 'Contractor', values: cur(v.siteMaintenance.map((s) => s.contractor)), color: RA_COLORS.orange, type: 'bar' }
    ];
  }

  private buildInsights(v: FinancialView): void {
    const list: InsightCard[] = [];
    const change = v.maintenance.change;
    if (v.maintenance.value > 0) {
      const up = change !== null && change > 0;
      const text = change === null
        ? `Maintenance spend is ${this.fmt(v.maintenance.value)}; there is no previous-period spend to compare with.`
        : `Maintenance costs are ${Math.abs(change)}% ${up ? 'higher' : 'lower'} than the previous period (${this.fmt(v.maintenance.value)} vs ${this.fmt(v.maintenance.previous)}).`;
      list.push({
        id: 'maintenance', tone: up ? 'red' : 'green', icon: up ? TriangleAlert : Lightbulb,
        title: change === null ? 'Maintenance spend recorded this period' : `Maintenance spend ${Math.abs(change)}% ${up ? 'above' : 'below'} prior period`,
        text,
        actions: [{ id: 'view', label: 'View costs' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    const over = this.overThreshold;
    if (over.length) {
      list.push({
        id: 'lifecycle', tone: 'red', icon: TriangleAlert, title: `${over.length} asset${over.length === 1 ? '' : 's'} exceed the maintenance cost threshold`,
        text: `${over.length} asset${over.length === 1 ? ' has' : 's have'} spent more than ${v.maintenanceRatioLimit}% of their acquisition cost on maintenance and need a repair-vs-replace review.`,
        actions: [{ id: 'view', label: 'View assets' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    if (v.capexRequests.length) {
      const total = this.fmt(this.pendingCapex);
      list.push({
        id: 'capex', tone: 'orange', icon: TriangleAlert, title: `CAPEX approval required for ${total}`,
        text: `${total} in ${v.capexRequests.length} CAPEX request${v.capexRequests.length === 1 ? ' is' : 's are'} pending approval.`,
        actions: [{ id: 'approve', label: 'Open approvals', primary: true }, { id: 'view', label: 'View details' }]
      });
    }
    if (v.disposals.length) {
      const total = this.fmt(sumOf(v.disposals.map((d) => d.recoverable)));
      list.push({
        id: 'disposal', tone: 'green', icon: Lightbulb, title: `Asset disposal opportunity identified: ${total} recoverable value`,
        text: `${v.disposals.length} underutilized asset${v.disposals.length === 1 ? ' has' : 's have'} (below ${v.utilizationThreshold}% utilization) ${total} net book value that could be recovered.`,
        actions: [{ id: 'view', label: 'View assets' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    this.insights = list;
  }

  private get overThreshold(): CostAsset[] {
    return this.view.assets.filter((a) => a.maintenanceRatio !== null && a.maintenanceRatio > this.view.maintenanceRatioLimit);
  }

  // ===== Insight + table actions =====

  onInsight(p: InsightPick): void {
    const v = this.view;
    switch (`${p.insight.id}:${p.action.id}`) {
      case 'maintenance:view':
        this.openList({
          title: 'Maintenance cost by location',
          subtitle: `${this.scopeText} · ${this.currency}`,
          columns: ['Location', 'Labor', 'Parts', 'Contractor', 'Total'],
          numeric: [1, 2, 3, 4],
          rows: v.siteMaintenance.map((s) => [s.site, this.fmt(s.labour), this.fmt(s.parts), this.fmt(s.contractor), this.fmt(s.total)]),
          fileName: 'maintenance-cost-by-location.csv'
        });
        break;
      case 'maintenance:plan': {
        const change = v.maintenance.change;
        this.openActionPlan(`Reduce maintenance spend (${this.fmt(v.maintenance.value)}${change === null ? '' : `, ${change > 0 ? '+' : ''}${change}% vs prior period`})`);
        break;
      }
      case 'lifecycle:view':
        this.showAssets(this.overThreshold, 'Assets above the maintenance cost threshold');
        break;
      case 'lifecycle:plan':
        this.openActionPlan(`Review replace-vs-repair for ${this.overThreshold.map((a) => a.name).join(', ')}`);
        break;
      case 'capex:view':
        this.openList({
          title: 'CAPEX requests pending approval',
          subtitle: `${v.capexRequests.length} requests · ${this.fmt(this.pendingCapex)}`,
          columns: ['Request', 'Title', 'Location', 'Category', 'Amount', 'Requested By', 'Submitted', 'Status'],
          numeric: [4],
          rows: v.capexRequests.map((r) => [r.ref, r.title, r.site, r.category, this.fmt(r.amount), r.requestedBy, fmtDate(r.submitted), r.status]),
          fileName: 'capex-pending-approval.csv'
        });
        break;
      case 'capex:approve':
        this.openApprovals();
        break;
      case 'disposal:view':
        this.openList({
          title: 'Disposal candidates',
          subtitle: 'Underutilized assets with net book value left',
          columns: ['Asset ID', 'Asset Name', 'Category', 'Location', 'Utilization', 'Recoverable Value (NBV)'],
          numeric: [4, 5],
          rows: v.disposals.map((d) => [d.id, d.name, d.category, d.site, `${d.utilization}%`, this.fmt(d.recoverable)]),
          fileName: 'disposal-candidates.csv'
        });
        break;
      case 'disposal:plan':
        this.openActionPlan(`Dispose of ${v.disposals.length} underutilized assets (${this.fmt(sumOf(v.disposals.map((d) => d.recoverable)))} recoverable)`);
        break;
    }
  }

  /** CAPEX Approvals: the decision is recorded through POST /capex-requests/decisions, then the page reloads. */
  private openApprovals(): void {
    const all = 'All pending requests';
    const reqs = this.view.capexRequests;
    this.openForm(
      {
        title: 'CAPEX Approvals',
        intro: `${reqs.length} requests totaling ${this.fmt(this.pendingCapex)} are waiting for your decision.`,
        submitLabel: 'Submit Decision',
        fields: [
          { key: 'request', label: 'Request', type: 'select', value: all, options: [all, ...reqs.map((r) => `${r.ref} · ${r.title} · ${this.fmt(r.amount)}`)], required: true },
          { key: 'decision', label: 'Decision', type: 'select', value: 'Approve', options: ['Approve', 'Reject', 'Request more information'], required: true },
          { key: 'approver', label: 'Approver', type: 'select', value: CURRENT_USER.name, options: RA_PEOPLE },
          { key: 'comments', label: 'Comments', type: 'textarea', value: '', required: true }
        ]
      },
      (values) => {
        const picked = String(values['request']);
        const refs = picked === all ? reqs.map((r) => r.ref) : [picked.split(' · ')[0]];
        const decision = String(values['decision']);
        this.api.decideCapex(refs, decision, String(values['approver'] ?? ''), String(values['comments'] ?? '')).subscribe({
          next: (r) => this.apply(`${decision} recorded for ${r.count === 1 ? refs[0] : `${r.count} CAPEX requests`} (${r.status}).`),
          error: (err: Error) => this.notify(err.message)
        });
        return '';
      }
    );
  }

  private showAssets(rows: CostAsset[], title: string): void {
    this.openList({
      title,
      subtitle: `${this.scopeText} · ${this.currency}`,
      columns: ['Asset ID', 'Asset Name', 'Category', 'Location', 'Acquisition', 'Maintenance to Date', 'Maintenance / Acquisition'],
      numeric: [4, 5, 6],
      rows: rows.map((a) => [a.id, a.name, a.category, a.site, this.fmt(a.acquisition), this.fmt(a.maintenance), a.maintenanceRatio === null ? '—' : `${a.maintenanceRatio}%`]),
      fileName: 'maintenance-threshold-assets.csv'
    });
  }

  private perHour(a: CostAsset): string {
    return a.costPerHour === null ? '—' : `${this.currency} ${toCurrency(a.costPerHour, this.currency).toFixed(2)}`;
  }

  viewAsset(a: CostAsset): void {
    this.openDetails({
      title: `${a.id} · ${a.name}`,
      subtitle: `${a.category} · ${a.site}`,
      items: [
        { label: 'Acquisition cost', value: this.fmt(a.acquisition) },
        { label: 'Maintenance cost (to date)', value: this.fmt(a.maintenance) },
        { label: 'Accumulated depreciation', value: this.fmt(a.depreciation) },
        { label: 'Net book value', value: this.fmt(a.netBookValue) },
        { label: 'Total cost of ownership', value: this.fmt(a.tco) },
        { label: 'Operating hours', value: a.hours === null ? '—' : a.hours.toLocaleString('en-US') },
        { label: 'Cost per operating hour', value: this.perHour(a) },
        { label: 'Maintenance / acquisition', value: a.maintenanceRatio === null ? '—' : `${a.maintenanceRatio}%` }
      ]
    });
  }

  planAsset(a: CostAsset): void {
    this.openActionPlan(`Cost review for ${a.id} ${a.name} (TCO ${this.fmt(a.tco)})`);
  }

  viewCostCenter(c: CostCenterRow): void {
    this.openDetails({
      title: `${c.code} ${c.name}`,
      subtitle: this.scopeText,
      items: [
        { label: 'Budget', value: this.fmt(c.budget) },
        { label: 'Actual', value: this.fmt(c.actual) },
        { label: 'Variance', value: `${c.variance > 0 ? '+' : ''}${this.fmt(c.variance)}` },
        { label: 'Utilization', value: c.utilization === null ? '—' : `${c.utilization.toFixed(1)}%` },
        { label: 'Status', value: c.status }
      ]
    });
  }

  // ===== Exports =====

  /** Page export: the API's Excel workbook (every section, amounts in AED). */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Exported Financial Analytics workbook (Excel, amounts in AED).'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  exportAssets(): void {
    const c = this.currency;
    downloadCsv('highest-cost-assets.csv', ['Asset ID', 'Asset Name', 'Category', 'Location', `Acquisition (${c})`, `Maintenance (${c})`, `Depreciation (${c})`, `TCO (${c})`, `Cost per Op. Hour (${c})`],
      [...this.view.assets].sort((a, b) => b.tco - a.tco).map((a) => [
        a.id, a.name, a.category, a.site, this.raw(a.acquisition), this.raw(a.maintenance), this.raw(a.depreciation), this.raw(a.tco),
        a.costPerHour === null ? '' : toCurrency(a.costPerHour, c).toFixed(2)
      ]));
  }

  exportCostCenters(): void {
    const c = this.currency;
    downloadCsv('cost-center-performance.csv', ['Cost Center', `Budget (${c})`, `Actual (${c})`, `Variance (${c})`, 'Utilization %', 'Status'],
      this.view.costCenters.map((r) => [`${r.code} ${r.name}`, this.raw(r.budget), this.raw(r.actual), this.raw(r.variance), r.utilization === null ? '' : r.utilization.toFixed(1), r.status]));
  }

  private raw(aed: number): number {
    return Math.round(toCurrency(aed, this.currency));
  }

  private exportSeries(file: string, labels: string[], series: ChartSeries[]): void {
    downloadCsv(file, ['', ...series.map((s) => s.name)], labels.map((l, i) => [l.replace('\n', ' '), ...series.map((s) => Math.round(s.values[i] ?? 0))]));
  }

  exportTco(): void {
    this.exportSeries(`tco-trend-${this.currency}.csv`, this.view.labels, this.tcoSeries);
  }

  exportBudget(): void {
    this.exportSeries(`budget-vs-actual-${this.currency}.csv`, this.budgetLabels, this.budgetSeries);
  }

  exportCategories(): void {
    downloadCsv(`cost-by-category-${this.currency}.csv`, ['Category', `Cost (${this.currency})`], this.categorySlices.map((s) => [s.name, Math.round(s.value)]));
  }

  exportDepreciation(): void {
    this.exportSeries(`depreciation-${this.currency}.csv`, this.view.labels, this.depreciationSeries);
  }

  exportUtilization(): void {
    const v = this.view;
    downloadCsv('budget-utilization.csv', ['Current Spend', 'Total Budget', 'Remaining Budget', 'Utilization %', 'Target %'],
      [[this.fmt(v.spend), this.fmt(v.budget), this.fmt(v.budget - v.spend), v.budgetUtilization ?? '', this.budgetTarget]]);
  }

  exportSites(): void {
    this.exportSeries(`maintenance-cost-by-location-${this.currency}.csv`, this.siteLabels, this.siteSeries);
  }
}
