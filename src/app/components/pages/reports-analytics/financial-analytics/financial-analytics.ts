import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChartColumn, ChartPie, CircleDollarSign, Coins, FileText, Lightbulb, LucideAngularModule, Target, TriangleAlert, Wrench
} from 'lucide-angular';
import { CURRENT_USER, RA_CATEGORIES, RA_PEOPLE, downloadCsv } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import {
  ALL_CATEGORIES, ALL_COST_CENTERS, BUDGET_TARGET, COST_CENTERS, CURRENCIES, CostAsset, CostCenterRow, Currency, FinancialView, LIFECYCLE_LIMIT,
  TCO_COLORS, TCO_COMPONENTS, buildFinancialView, moneyIn, toCurrency
} from './financial-analytics.data';
import { CostAssetTable, CostCenterTable } from './financial-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, fmtDate, previousSeries, sumOf
} from '../inventory-analytics/parts';

const KPI_DELTAS = { assetValue: 6.3, maintenance: 8.2, capex: 12.1, opex: 4.7, nbv: 2.4 };

/** Reports & Analytics > Financial Analytics */
@Component({
  selector: 'app-ra-financial-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog,
    RaDetailsDialog, RaFormDialog, CostAssetTable, CostCenterTable
  ],
  templateUrl: './financial-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './financial-analytics.css']
})
export class FinancialAnalyticsPage extends RaDashboardPage implements OnInit {
  protected readonly slug = 'financial-analytics';

  readonly icons = { CircleDollarSign, Target, ChartColumn };
  readonly categories = [ALL_CATEGORIES, ...RA_CATEGORIES];
  readonly costCenterOptions = [ALL_COST_CENTERS, ...COST_CENTERS.map((c) => `${c.code} ${c.name}`)];
  readonly currencies = CURRENCIES;
  readonly budgetTarget = BUDGET_TARGET;
  category = ALL_CATEGORIES;
  costCenter = ALL_COST_CENTERS;
  currency: Currency = 'AED';
  /** CAPEX requests decided from the approvals dialog this session */
  private decided = new Set<string>();

  view!: FinancialView;
  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];

  // Chart inputs, rebuilt in apply() so the charts only re-render when the data changes
  tcoSeries: ChartSeries[] = [];
  budgetLabels: string[] = [];
  budgetSeries: ChartSeries[] = [];
  categorySlices: ChartSlice[] = [];
  depreciationSeries: ChartSeries[] = [];
  siteLabels: string[] = [];
  siteSeries: ChartSeries[] = [];
  tcoCenter = '';
  budgetUtilization = 0;

  readonly pctFormat = (v: number) => `${Math.round(v)}%`;
  readonly sliceFormat = (v: number) => compactNumber(v);

  ngOnInit(): void {
    this.updatedMinutes = 7;
    this.apply();
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

  get pendingCapex(): number {
    return sumOf(this.view.capexRequests.map((r) => r.amount));
  }

  fmt(aed: number): string {
    return moneyIn(aed, this.currency);
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.apply();
  }

  /** Recomputes the view whenever a filter changes. */
  apply(): void {
    const v = buildFinancialView({ period: this.period, organization: this.organization, location: this.location, category: this.category, costCenter: this.costCenter });
    v.capexRequests = v.capexRequests.filter((r) => !this.decided.has(r.ref));
    this.view = v;
    this.buildKpis(v);
    this.buildCharts(v);
    this.buildInsights(v);
  }

  private buildKpis(v: FinancialView): void {
    const d = KPI_DELTAS;
    const kpi = (id: string, label: string, aed: number, delta: number, goodWhenUp: boolean, tone: KpiCardData['tone'], icon: KpiCardData['icon']): KpiCardData => ({
      id, label, value: this.fmt(aed), delta, goodWhenUp, previous: this.fmt(aed / (1 + delta / 100)), tone, icon
    });
    this.kpis = [
      kpi('total-asset-value', 'Total Asset Value', v.totalAssetValue, d.assetValue, true, 'purple', Coins),
      kpi('maintenance-spend', 'Maintenance Spend', v.maintenance, d.maintenance, false, 'blue', Wrench),
      kpi('capex', 'CAPEX', v.capex, d.capex, false, 'green', ChartColumn),
      kpi('opex', 'OPEX', v.opex, d.opex, false, 'orange', ChartPie),
      kpi('net-book-value', 'Net Book Value', v.netBookValue, d.nbv, true, 'purple', FileText)
    ];
  }

  private buildCharts(v: FinancialView): void {
    const cur = (values: number[]) => values.map((x) => toCurrency(x, this.currency));
    this.tcoSeries = TCO_COMPONENTS.map((name, i) => ({ name, values: cur(v.tco[i]), color: TCO_COLORS[i], type: 'bar' as const }));
    this.tcoSeries.push({ name: 'Total TCO (cumulative)', values: cur(v.tcoCumulative), color: RA_COLORS.purple, type: 'line', axis: 'right' });
    if (this.compare) {
      this.tcoSeries.push({ name: 'Total TCO (previous period)', values: cur(previousSeries(v.tcoCumulative, 6.3)), color: RA_COLORS.grey, type: 'line', axis: 'right', dashed: true });
    }
    this.tcoCenter = this.fmt(v.tcoTotal).replace(`${this.currency} `, '');

    this.budgetLabels = v.costCenters.map((c) => c.name);
    this.budgetSeries = [
      { name: 'Budget', values: cur(v.costCenters.map((c) => c.budget)), color: RA_COLORS.sky, type: 'bar' },
      { name: 'Actual', values: cur(v.costCenters.map((c) => c.actual)), color: RA_COLORS.purple, type: 'bar' },
      { name: 'Variance %', values: v.costCenters.map((c) => c.utilization - 100), color: RA_COLORS.red, type: 'line', axis: 'right' }
    ];
    this.budgetUtilization = v.budget ? Math.round((v.spend / v.budget) * 1000) / 10 : 0;

    this.categorySlices = v.categoryCosts.map((c) => ({ name: c.name, value: toCurrency(c.value, this.currency), color: c.color }));

    this.depreciationSeries = [
      { name: 'Monthly Depreciation', values: cur(v.depreciation), color: RA_COLORS.blue, type: 'bar' },
      { name: 'Accumulated Depreciation', values: cur(v.accumulated), color: RA_COLORS.purple, type: 'line', axis: 'right' }
    ];
    if (this.compare) {
      this.depreciationSeries.push({ name: 'Monthly Depreciation (previous period)', values: cur(previousSeries(v.depreciation, 2.4)), color: RA_COLORS.grey, type: 'line', dashed: true });
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
    if (v.maintenance > 0) {
      list.push({
        id: 'maintenance', tone: 'red', icon: TriangleAlert, title: `Maintenance spend ${KPI_DELTAS.maintenance}% above prior period`,
        text: `Maintenance costs are ${KPI_DELTAS.maintenance}% higher than the previous period (${this.fmt(v.maintenance)}), driven by increased corrective maintenance.`,
        actions: [{ id: 'view', label: 'View costs' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    const over = this.overLifecycle;
    if (over.length) {
      list.push({
        id: 'lifecycle', tone: 'red', icon: TriangleAlert, title: `${over.length} asset${over.length === 1 ? '' : 's'} exceed lifecycle cost threshold`,
        text: `${over.length} asset${over.length === 1 ? ' has' : 's have'} exceeded ${LIFECYCLE_LIMIT}% of their expected lifecycle cost and require review.`,
        actions: [{ id: 'view', label: 'View assets' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    if (v.capexRequests.length) {
      const total = this.fmt(this.pendingCapex);
      list.push({
        id: 'capex', tone: 'orange', icon: TriangleAlert, title: `CAPEX approval required for ${total}`,
        text: `${total} in ${v.capexRequests.length} CAPEX request${v.capexRequests.length === 1 ? ' is' : 's are'} pending approval for critical asset replacements.`,
        actions: [{ id: 'approve', label: 'Open approvals', primary: true }, { id: 'view', label: 'View details' }]
      });
    }
    if (v.disposals.length) {
      const total = this.fmt(sumOf(v.disposals.map((d) => d.recoverable)));
      list.push({
        id: 'disposal', tone: 'green', icon: Lightbulb, title: `Asset disposal opportunity identified: ${total} recoverable value`,
        text: `${v.disposals.length} underutilized asset${v.disposals.length === 1 ? ' has' : 's have'} an estimated ${total} recoverable value based on current market conditions.`,
        actions: [{ id: 'view', label: 'View assets' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    this.insights = list;
  }

  private get overLifecycle(): CostAsset[] {
    return this.view.assets.filter((a) => a.lifecyclePct > LIFECYCLE_LIMIT);
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
      case 'maintenance:plan':
        this.openActionPlan(`Reduce corrective maintenance spend (${this.fmt(v.maintenance)}, +${KPI_DELTAS.maintenance}% vs prior period)`);
        break;
      case 'lifecycle:view':
        this.showAssets(this.overLifecycle, 'Assets above lifecycle cost threshold');
        break;
      case 'lifecycle:plan':
        this.openActionPlan(`Review replace-vs-repair for ${this.overLifecycle.map((a) => a.name).join(', ')}`);
        break;
      case 'capex:view':
        this.openList({
          title: 'CAPEX requests pending approval',
          subtitle: `${v.capexRequests.length} requests · ${this.fmt(this.pendingCapex)}`,
          columns: ['Request', 'Title', 'Location', 'Category', 'Amount', 'Requested By', 'Submitted'],
          numeric: [4],
          rows: v.capexRequests.map((r) => [r.ref, r.title, r.site, r.category, this.fmt(r.amount), r.requestedBy, fmtDate(r.submitted)]),
          fileName: 'capex-pending-approval.csv'
        });
        break;
      case 'capex:approve':
        this.openApprovals();
        break;
      case 'disposal:view':
        this.openList({
          title: 'Disposal candidates',
          subtitle: 'Underutilized assets with recoverable value',
          columns: ['Asset ID', 'Asset Name', 'Category', 'Location', 'Utilization', 'Recoverable Value'],
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
        if (values['decision'] !== 'Request more information') {
          refs.forEach((r) => this.decided.add(r));
          this.apply();
        }
        return `${values['decision']} recorded for ${refs.length === 1 ? refs[0] : `${refs.length} CAPEX requests`} (demo mode).`;
      }
    );
  }

  private showAssets(rows: CostAsset[], title: string): void {
    this.openList({
      title,
      subtitle: `${this.scopeText} · ${this.currency}`,
      columns: ['Asset ID', 'Asset Name', 'Category', 'Location', 'TCO', 'Expected Lifecycle Cost', 'Lifecycle %'],
      numeric: [4, 5, 6],
      rows: rows.map((a) => [a.id, a.name, a.category, a.site, this.fmt(a.tco), this.fmt(a.plannedTco), `${a.lifecyclePct}%`]),
      fileName: 'lifecycle-cost-assets.csv'
    });
  }

  viewAsset(a: CostAsset): void {
    this.openDetails({
      title: `${a.id} · ${a.name}`,
      subtitle: `${a.category} · ${a.site}`,
      items: [
        { label: 'Acquisition cost', value: this.fmt(a.acquisition) },
        { label: 'Maintenance cost', value: this.fmt(a.maintenance) },
        { label: 'Depreciation', value: this.fmt(a.depreciation) },
        { label: 'Total cost of ownership', value: this.fmt(a.tco) },
        { label: 'Operating hours', value: a.hours.toLocaleString('en-US') },
        { label: 'Cost per operating hour', value: `${this.currency} ${toCurrency(a.costPerHour, this.currency).toFixed(2)}` },
        { label: 'Lifecycle cost used', value: `${a.lifecyclePct}% of ${this.fmt(a.plannedTco)}` }
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
        { label: 'Utilization', value: `${c.utilization.toFixed(1)}%` },
        { label: 'Status', value: c.status }
      ]
    });
  }

  // ===== Exports =====

  exportPage(): void {
    this.exportAssets();
    this.exportCostCenters();
    this.notify(`Exported highest cost assets and cost center performance in ${this.currency} (CSV).`);
  }

  exportAssets(): void {
    const c = this.currency;
    downloadCsv('highest-cost-assets.csv', ['Asset ID', 'Asset Name', 'Category', 'Location', `Acquisition (${c})`, `Maintenance (${c})`, `Depreciation (${c})`, `TCO (${c})`, `Cost per Op. Hour (${c})`],
      [...this.view.assets].sort((a, b) => b.tco - a.tco).map((a) => [a.id, a.name, a.category, a.site, this.raw(a.acquisition), this.raw(a.maintenance), this.raw(a.depreciation), this.raw(a.tco), toCurrency(a.costPerHour, c).toFixed(2)]));
  }

  exportCostCenters(): void {
    const c = this.currency;
    downloadCsv('cost-center-performance.csv', ['Cost Center', `Budget (${c})`, `Actual (${c})`, `Variance (${c})`, 'Utilization %', 'Status'],
      this.view.costCenters.map((r) => [`${r.code} ${r.name}`, this.raw(r.budget), this.raw(r.actual), this.raw(r.variance), r.utilization.toFixed(1), r.status]));
  }

  private raw(aed: number): number {
    return Math.round(toCurrency(aed, this.currency));
  }

  private exportSeries(file: string, labels: string[], series: ChartSeries[]): void {
    downloadCsv(file, ['', ...series.map((s) => s.name)], labels.map((l, i) => [l.replace('\n', ' '), ...series.map((s) => Math.round(s.values[i] ?? 0))]));
  }

  exportTco(): void {
    this.exportSeries(`tco-trend-${this.currency}.csv`, this.view.window.labels, this.tcoSeries);
  }

  exportBudget(): void {
    this.exportSeries(`budget-vs-actual-${this.currency}.csv`, this.budgetLabels, this.budgetSeries);
  }

  exportCategories(): void {
    downloadCsv(`cost-by-category-${this.currency}.csv`, ['Category', `Cost (${this.currency})`], this.categorySlices.map((s) => [s.name, Math.round(s.value)]));
  }

  exportDepreciation(): void {
    this.exportSeries(`depreciation-${this.currency}.csv`, this.view.window.labels, this.depreciationSeries);
  }

  exportUtilization(): void {
    downloadCsv('budget-utilization.csv', ['Current Spend', 'Total Budget', 'Remaining Budget', 'Utilization %', 'Target %'],
      [[this.fmt(this.view.spend), this.fmt(this.view.budget), this.fmt(this.view.budget - this.view.spend), this.budgetUtilization, BUDGET_TARGET]]);
  }

  exportSites(): void {
    this.exportSeries(`maintenance-cost-by-location-${this.currency}.csv`, this.siteLabels, this.siteSeries);
  }
}
