import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartColumnIncreasing, Coins, LucideAngularModule, Package, RefreshCw, Target, TriangleAlert, Warehouse as WarehouseIcon } from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { CURRENT_USER, RA_PEOPLE, downloadCsv, money } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, RA_COLORS } from '../shared/charts';
import { alignTo } from '../asset-performance/kit/api-utils';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, ALL_STORES, ALL_WAREHOUSES, CATEGORY_PALETTE, IA_DEFAULT_PERIOD, IA_FALLBACK_PERIODS,
  IaKpi, InventoryView, ReorderItem, STOCK_STATUSES, STOCK_STATUS_COLORS, Supplier, Warehouse
} from './inventory-analytics.data';
import { IaActionRequest, IaFilterLists, IaFilters, IaSavedView, InventoryAnalyticsService } from './inventory-analytics.service';
import { ReorderTable, SupplierTable } from './inventory-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, fmtInt, sumOf
} from './parts';

const UTIL_LIMIT = 90;
const PRIORITIES = ['High', 'Medium', 'Low'];

const dash = (v: number | null | undefined, fmt: (n: number) => string): string => (v === null || v === undefined ? '—' : fmt(v));
const cover = (d: number | null): string => (d === null ? '—' : String(d));

/** yyyy-MM-dd, `days` from today. */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Reports & Analytics > Inventory Analytics */
@Component({
  selector: 'app-ra-inventory-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog, RaDetailsDialog,
    RaFormDialog, ReorderTable, SupplierTable
  ],
  providers: [InventoryAnalyticsService],
  templateUrl: './inventory-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './inventory-analytics.css']
})
export class InventoryAnalyticsPage extends RaDashboardPage implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(InventoryAnalyticsService);
  protected readonly slug = 'inventory-analytics';

  // Filter values come from /options and /filters
  override periods: string[] = IA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override period = IA_DEFAULT_PERIOD;
  override organization = ALL_ORGANIZATIONS;
  override location = ALL_LOCATIONS;
  categories: string[] = [ALL_CATEGORIES];
  statuses: string[] = [ALL_STATUSES, ...STOCK_STATUSES];
  readonly allWarehouses = ALL_WAREHOUSES;
  warehouse = ALL_WAREHOUSES;
  store = ALL_STORES;
  category = ALL_CATEGORIES;
  status = ALL_STATUSES;

  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];
  warehouseOptions: { name: string; code: string; site: string }[] = [];
  storeOptions: string[] = [ALL_STORES];
  error: string | null = null;

  // Chart inputs, rebuilt after each load so the charts only re-render when the data changes
  trendSeries: ChartSeries[] = [];
  categoryLabels: string[] = [];
  categorySeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  consumptionSeries: ChartSeries[] = [];
  utilLabels: string[] = [];
  utilSeries: ChartSeries[] = [];

  /** Previous period's monthly issue value while Compare Periods is on */
  private previousIssues: number[] | null = null;
  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  readonly pct = (v: number) => `${Math.round(v)}%`;

  get view(): InventoryView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  /** Nothing recorded for the filters: no stock lines, issues or warehouses. */
  get empty(): boolean {
    return this.loaded && !this.error && !this.view.stockItems && !this.view.issuedValue && !this.view.warehouses.length;
  }

  get totalItemsText(): string {
    return fmtInt(this.view.stockItems);
  }

  ngOnInit(): void {
    this.updatedMinutes = 0;
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<{ periods: string[]; defaultPeriod: string; statuses: string[] } | null>(null)),
      views: this.api.loadViews().pipe(soft<IaSavedView[]>([]))
    }).subscribe(({ options, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.statuses = [ALL_STATUSES, ...options.statuses];
      }
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) this.restore(preferred.filters);
      if (errors.length) this.notify(errors[0]);
      this.apply();
    });
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  private filters(): IaFilters {
    return {
      period: this.period, organization: this.organization, location: this.location, warehouse: this.warehouse, store: this.store,
      category: this.category, status: this.status
    };
  }

  private restore(f: IaFilters): void {
    this.period = this.periods.includes(f.period) ? f.period : IA_DEFAULT_PERIOD;
    this.organization = f.organization;
    this.location = f.location;
    this.warehouse = f.warehouse;
    this.store = f.store;
    this.category = f.category;
    this.status = f.status;
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.apply();
  }

  override refresh(): void {
    if (!this.refreshing) this.apply('Data refreshed.');
  }

  /** Reloads the dropdowns (warehouses follow the organization, stores the warehouse), then the figures from GET /overview. */
  apply(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    this.loadSub = this.api.loadFilters(this.filters()).pipe(
      catchError((err: Error) => {
        this.notify(err.message);
        return of(null as IaFilterLists | null);
      }),
      switchMap((lists) => {
        if (lists) this.setLists(lists);
        const f = this.filters();
        return this.api.loadOverview(f).pipe(
          switchMap((v) => {
            if (!this.compare) return of({ v, previous: null as number[] | null });
            return this.api.loadPrevious(f).pipe(
              map((p) => ({ v, previous: p.issues as number[] | null })),
              catchError((err: Error) => {
                this.notify(err.message);
                return of({ v, previous: null as number[] | null });
              })
            );
          })
        );
      })
    ).subscribe({
      next: ({ v, previous }) => {
        this.error = null;
        this.previousIssues = previous;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.error = err.message;
        this.notify(err.message);
      }
    });
  }

  private setLists(lists: IaFilterLists): void {
    this.organizations = lists.organizations;
    if (!this.organizations.includes(this.organization)) this.organization = ALL_ORGANIZATIONS;
    this.warehouseOptions = lists.warehouses;
    if (this.warehouse !== ALL_WAREHOUSES && !lists.warehouses.some((w) => w.name === this.warehouse)) {
      this.warehouse = ALL_WAREHOUSES;
      this.store = ALL_STORES;
    }
    this.storeOptions = lists.stores;
    if (!this.storeOptions.includes(this.store)) this.store = ALL_STORES;
    this.categories = lists.categories.includes(this.category) ? lists.categories : [...lists.categories, this.category];
    this.statuses = lists.statuses;
    if (!this.statuses.includes(this.status)) this.status = ALL_STATUSES;
  }

  resetFilters(): void {
    this.organization = ALL_ORGANIZATIONS;
    this.location = ALL_LOCATIONS;
    this.warehouse = ALL_WAREHOUSES;
    this.store = ALL_STORES;
    this.category = ALL_CATEGORIES;
    this.status = ALL_STATUSES;
    this.apply();
  }

  private build(v: InventoryView): void {
    this.buildKpis(v);
    this.buildCharts(v);
    this.buildInsights(v);
  }

  private buildKpis(v: InventoryView): void {
    const card = (k: IaKpi, fmt: (n: number) => string) => ({ value: dash(k.value, fmt), delta: k.change ?? 0, previous: dash(k.previous, fmt) });
    const times = (n: number) => `${n.toFixed(1)}x`;
    const pctText = (n: number) => `${n.toFixed(1)}%`;
    this.kpis = [
      { id: 'inventory-value', label: 'Total Inventory Value', ...card(v.totalValueKpi, (n) => money(n)), goodWhenUp: true, tone: 'purple', icon: Coins },
      { id: 'stock-items', label: 'Stock Items', ...card(v.stockItemsKpi, fmtInt), goodWhenUp: true, tone: 'green', icon: Package },
      { id: 'turnover', label: 'Inventory Turnover', ...card(v.turnoverKpi, times), goodWhenUp: true, tone: 'orange', icon: RefreshCw },
      { id: 'below-reorder', label: 'Items Below Reorder', ...card(v.belowReorderKpi, fmtInt), goodWhenUp: false, tone: 'red', icon: TriangleAlert },
      // No service records cycle counts yet, so the API sends no stock accuracy ("—")
      { id: 'stock-accuracy', label: 'Stock Accuracy', ...card(v.accuracyKpi, pctText), goodWhenUp: true, tone: 'blue', icon: Target }
    ];
  }

  private buildCharts(v: InventoryView): void {
    this.trendSeries = [{ name: 'Issues', values: v.issues, color: RA_COLORS.red, type: 'bar' }];
    if (this.compare && this.previousIssues) {
      this.trendSeries.push({ name: 'Issues (previous period)', values: alignTo(this.previousIssues, v.labels.length), color: RA_COLORS.grey, type: 'line', dashed: true });
    }

    // One coloured column per category: each series only fills its own column
    this.categoryLabels = v.categories.map((c) => c.name);
    this.categorySeries = v.categories.map((c, i) => ({
      name: c.name,
      values: v.categories.map((_, j) => (i === j ? c.units : 0)),
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      type: 'bar' as const
    }));
    this.statusSlices = v.statusCounts
      .filter((s) => s.count > 0 && (this.status === ALL_STATUSES || s.name === this.status))
      .map((s) => ({ name: s.name, value: s.count, color: STOCK_STATUS_COLORS[s.name] ?? RA_COLORS.grey }));
    const lineColors = [RA_COLORS.purple, RA_COLORS.green, RA_COLORS.pink, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.teal];
    this.consumptionSeries = v.consumption.map((c, i) => ({ name: c.name, values: c.values, color: lineColors[i % lineColors.length] }));

    // Only warehouses with bin capacity or max stock recorded have a utilization.
    // One stacked series per band so each bar takes its band colour (only one band has a value per bar)
    const measured = v.warehouses.filter((w) => w.utilization !== null);
    this.utilLabels = measured.map((w) => w.name.replace(/ (Warehouse|Store)$/, '\n$1'));
    const band = (lo: number, hi: number) => measured.map((w) => (w.utilization! >= lo && w.utilization! < hi ? w.utilization! : 0));
    this.utilSeries = [
      { name: 'Normal (< 85%)', values: band(0, 85), color: RA_COLORS.purple, type: 'bar' },
      { name: 'High (85–90%)', values: band(85, UTIL_LIMIT), color: RA_COLORS.orange, type: 'bar' },
      { name: `Critical (≥ ${UTIL_LIMIT}%)`, values: band(UTIL_LIMIT, Number.MAX_VALUE), color: RA_COLORS.red, type: 'bar' }
    ];
  }

  private buildInsights(v: InventoryView): void {
    const list: InsightCard[] = [];
    const n = v.reorderTotal;
    list.push(
      n
        ? {
            id: 'reorder', tone: 'red', icon: TriangleAlert, title: `${fmtInt(n)} items below reorder level`,
            text: 'These items are at or below their reorder level and may risk stockout.',
            actions: [{ id: 'view', label: 'View items' }, { id: 'request', label: 'Create purchase request', primary: true }]
          }
        : { id: 'reorder', tone: 'green', icon: Package, title: 'No items below reorder level', text: 'Every item in scope is above its reorder level.', actions: [] }
    );
    if (v.slowTotal) {
      list.push({
        id: 'slow', tone: 'orange', icon: ChartColumnIncreasing, title: `${money(v.slowValue)} of stock is obsolete or slow-moving`,
        text: `${fmtInt(v.slowTotal)} items have not been issued in ${v.slowDays}+ days, totaling ${money(v.slowValue)} in value.`,
        actions: [{ id: 'view', label: 'View items' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    if (v.criticalAtRisk.length) {
      list.push({
        id: 'critical', tone: 'red', icon: TriangleAlert, title: `${v.criticalAtRisk.length} critical spare parts at risk of stockout`,
        text: `${v.criticalAtRisk.length} critical spare parts are out of stock or have less than 7 days of stock based on recent consumption.`,
        actions: [{ id: 'view', label: 'View items' }, { id: 'request', label: 'Create purchase request', primary: true }]
      });
    }
    const busiest = this.busiestWarehouse;
    if (busiest && busiest.utilization! >= UTIL_LIMIT) {
      list.push({
        id: 'warehouse', tone: 'orange', icon: WarehouseIcon, title: `${busiest.name} utilization above ${UTIL_LIMIT}%`,
        text: `${busiest.name} (${busiest.site}) is operating at ${busiest.utilization}% capacity. Consider reallocating stock or expanding capacity.`,
        actions: [{ id: 'view', label: 'View details' }, { id: 'open', label: 'Open warehouse', primary: true }]
      });
    } else if (busiest) {
      list.push({
        id: 'warehouse', tone: 'green', icon: WarehouseIcon, title: 'Warehouse capacity within limits',
        text: `The busiest warehouse in scope, ${busiest.name}, is at ${busiest.utilization}% utilization.`,
        actions: [{ id: 'view', label: 'View details' }]
      });
    }
    this.insights = list;
  }

  private get busiestWarehouse(): Warehouse | undefined {
    return this.view.warehouses.filter((w) => w.utilization !== null).sort((a, b) => b.utilization! - a.utilization!)[0];
  }

  // ===== Insight + table actions =====

  onInsight(p: InsightPick): void {
    const v = this.view;
    switch (`${p.insight.id}:${p.action.id}`) {
      case 'reorder:view':
        this.showReorderList(v.reorderItems, 'Items below reorder level');
        break;
      case 'reorder:request':
        this.requestFor(v.reorderItems, 'insight:reorder');
        break;
      case 'critical:view':
        this.showReorderList(v.criticalAtRisk, 'Critical spare parts at risk of stockout');
        break;
      case 'critical:request':
        this.requestFor(v.criticalAtRisk, 'insight:critical');
        break;
      case 'slow:view':
        this.openList({
          title: 'Obsolete and slow-moving stock',
          subtitle: `${fmtInt(v.slowTotal)} items not issued in ${v.slowDays}+ days · ${money(v.slowValue)}`,
          columns: ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Qty', 'Value (AED)', 'Days Since Issue'],
          numeric: [5, 6, 7],
          rows: v.slowItems.map((x) => [x.code, x.name, x.category, x.warehouseName, x.store, x.quantity, fmtInt(x.value), x.daysSinceIssue ?? '—']),
          fileName: 'slow-moving-stock.csv'
        });
        break;
      case 'slow:plan':
        this.raiseActionPlan(
          `Clear ${money(v.slowValue)} of obsolete / slow-moving stock (${fmtInt(v.slowTotal)} items)`,
          v.slowItems.map((x) => x.code),
          'insight:slow'
        );
        break;
      case 'warehouse:view':
        this.showWarehouse();
        break;
      case 'warehouse:open':
        this.router.navigateByUrl('/inventory');
        break;
    }
  }

  private showReorderList(rows: ReorderItem[], title: string): void {
    this.openList({
      title,
      subtitle: this.scopeText,
      columns: ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Available', 'Reorder Level', 'Days of Cover', 'Suggested Qty', 'Supplier', 'Risk'],
      numeric: [5, 6, 7, 8],
      rows: [...rows].sort((a, b) => a.riskRank - b.riskRank || a.coverRank - b.coverRank)
        .map((r) => [r.code, r.name, r.category, r.warehouseName, r.store, r.available, r.reorderLevel, cover(r.daysCover), r.suggestedQty, r.supplier, r.risk]),
      fileName: 'items-below-reorder.csv'
    });
  }

  private requestFor(rows: ReorderItem[], source: string): void {
    const suppliers = [...new Set(rows.map((r) => r.supplier).filter((s) => s !== '—'))];
    this.raisePurchaseRequest(`${rows.length} items below reorder level`, rows, suppliers.length === 1 ? suppliers[0] : 'Multiple suppliers', 'High', source);
  }

  private showWarehouse(): void {
    const w = this.busiestWarehouse;
    if (!w) return;
    this.openDetails({
      title: `${w.code} · ${w.name}`,
      subtitle: w.site,
      items: [
        { label: 'Utilization', value: `${w.utilization}% of capacity (${w.utilizationBasis ?? 'capacity'})` },
        { label: 'Stores', value: w.stores.join(', ') || '—' },
        { label: 'Stock items', value: `${fmtInt(w.items)} (${fmtInt(w.units)} units, ${money(w.value)})` },
        { label: 'Items below reorder', value: String(w.belowReorder) },
        { label: 'Storekeeper', value: w.keeper }
      ]
    });
  }

  createRequest(r: ReorderItem): void {
    this.raisePurchaseRequest(`${r.code} · ${r.name}`, [r], r.supplier === '—' ? '' : r.supplier, r.risk === 'Low' ? 'Medium' : r.risk, 'reorder-table');
  }

  viewItem(r: ReorderItem): void {
    this.openDetails({
      title: `${r.code} · ${r.name}`,
      subtitle: `${r.category} · ${r.warehouseName} / ${r.store}`,
      items: [
        { label: 'Available', value: `${r.available} (reorder level ${r.reorderLevel})` },
        { label: 'Days of cover', value: r.daysCover === null ? 'No recent usage' : `${r.daysCover} days` },
        { label: 'Daily usage', value: r.dailyUsage === null ? '—' : String(r.dailyUsage) },
        { label: 'Suggested order', value: String(r.suggestedQty) },
        { label: 'Risk', value: r.critical ? `${r.risk} · critical spare` : r.risk },
        { label: 'Unit cost', value: money(r.unitCost) },
        { label: 'Supplier', value: r.supplier },
        { label: 'Site', value: r.site }
      ]
    });
  }

  viewSupplier(s: Supplier): void {
    this.openDetails({
      title: s.name,
      subtitle: `Main category: ${s.category}`,
      items: [
        { label: 'Code', value: s.code || '—' },
        { label: 'Items supplied', value: fmtInt(s.items) },
        { label: 'Stock value', value: money(s.stockValue) },
        { label: 'Items below reorder', value: String(s.belowReorder) },
        { label: 'Rating', value: s.rating === null ? '—' : String(s.rating) },
        { label: 'Preferred supplier', value: s.preferred ? 'Yes' : 'No' }
      ]
    });
  }

  viewAllReorder(): void {
    this.showReorderList(this.view.reorderItems, 'Items below reorder level');
  }

  // ===== Requests (POST /requests) and saved views (POST /views) =====

  private raisePurchaseRequest(item: string, rows: ReorderItem[], supplier: string, priority: string, source: string): void {
    this.openForm(
      {
        title: 'Create Purchase Request',
        intro: 'Raises a purchase request for the selected stock.',
        submitLabel: 'Create Request',
        fields: [
          { key: 'item', label: 'Item(s)', type: 'text', value: item, required: true },
          { key: 'quantity', label: 'Quantity', type: 'number', value: Math.max(1, sumOf(rows.map((r) => r.suggestedQty))), required: true },
          { key: 'supplier', label: 'Preferred supplier', type: 'text', value: supplier },
          { key: 'needBy', label: 'Needed by', type: 'date', value: isoInDays(7), required: true },
          { key: 'priority', label: 'Priority', type: 'select', value: priority, options: PRIORITIES },
          { key: 'requester', label: 'Requested by', type: 'select', value: CURRENT_USER.name, options: RA_PEOPLE },
          { key: 'notes', label: 'Justification', type: 'textarea', value: '' }
        ]
      },
      (v) => {
        this.submitRequest({
          requestType: 'Purchase Request', title: String(v['item']), itemCodes: rows.map((r) => r.code), quantity: Number(v['quantity']),
          supplier: String(v['supplier'] ?? '') || null, dueDate: String(v['needBy']), priority: String(v['priority']), assignee: String(v['requester']),
          notes: String(v['notes'] ?? '') || null, source, warehouse: this.warehouse === ALL_WAREHOUSES ? null : this.warehouse
        }, 'Purchase request');
        return '';
      }
    );
  }

  private raiseActionPlan(subject: string, itemCodes: string[], source: string): void {
    this.openForm(
      {
        title: 'Create Action Plan',
        intro: subject,
        submitLabel: 'Create Action Plan',
        fields: [
          { key: 'title', label: 'Action title', type: 'text', value: subject, required: true },
          { key: 'owner', label: 'Owner', type: 'select', value: RA_PEOPLE[1], options: RA_PEOPLE, required: true },
          { key: 'due', label: 'Due date', type: 'date', value: isoInDays(14), required: true },
          { key: 'priority', label: 'Priority', type: 'select', value: 'High', options: PRIORITIES },
          { key: 'notes', label: 'Planned actions', type: 'textarea', value: '', required: true, hint: 'What will be done and how success is measured.' }
        ]
      },
      (v) => {
        this.submitRequest({
          requestType: 'Action Plan', title: String(v['title']), itemCodes, quantity: null, supplier: null, dueDate: String(v['due']),
          priority: String(v['priority']), assignee: String(v['owner']), notes: String(v['notes']), source,
          warehouse: this.warehouse === ALL_WAREHOUSES ? null : this.warehouse
        }, 'Action plan');
        return '';
      }
    );
  }

  private submitRequest(body: IaActionRequest, label: string): void {
    this.api.createRequest(body).subscribe({
      next: (ref) => this.notify(`${label} ${ref} created${body.requestType === 'Action Plan' && body.assignee ? ` and assigned to ${body.assignee}` : ''}.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  override openSaveView(): void {
    this.openForm(
      {
        title: 'Save View',
        intro: `Saves the current filters (${this.scopeText}) as a named view.`,
        submitLabel: 'Save View',
        fields: [
          { key: 'name', label: 'View name', type: 'text', value: '', required: true, hint: 'e.g. Main warehouse – this quarter' },
          { key: 'default', label: 'Open this view by default', type: 'select', value: 'No', options: ['No', 'Yes'] }
        ]
      },
      (v) => {
        this.api.createView(String(v['name']), this.filters(), v['default'] === 'Yes').subscribe({
          next: (saved) => this.notify(`View “${saved.name}” saved with the current filters.`),
          error: (err: Error) => this.notify(err.message)
        });
        return '';
      }
    );
  }

  // ===== Exports =====

  /** GET /export: the Excel workbook with every section. */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Exported Inventory Analytics (Excel).'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  exportReorder(): void {
    downloadCsv('inventory-items-below-reorder.csv', ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Available', 'Reorder Level', 'Days of Cover', 'Suggested Qty', 'Supplier', 'Risk'],
      this.view.reorderItems.map((r) => [r.code, r.name, r.category, r.warehouseName, r.store, r.available, r.reorderLevel, cover(r.daysCover), r.suggestedQty, r.supplier, r.risk]));
  }

  exportSuppliers(): void {
    downloadCsv('inventory-top-suppliers.csv', ['Supplier', 'Category', 'Items', 'Stock Value (AED)', 'Items Below Reorder', 'Rating'],
      this.view.suppliers.map((s) => [s.name, s.category, s.items, Math.round(s.stockValue), s.belowReorder, s.rating ?? '—']));
  }

  private exportSeries(file: string, series: ChartSeries[]): void {
    const labels = this.view.labels.map((l) => l.replace('\n', ' '));
    downloadCsv(file, ['Period', ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => Math.round(s.values[i] ?? 0))]));
  }

  exportTrend(): void {
    this.exportSeries('inventory-value-trend.csv', this.trendSeries);
  }

  exportCategories(): void {
    downloadCsv('stock-by-category.csv', ['Category', 'Items', 'Units', 'Value (AED)'],
      this.view.categories.map((c) => [c.name, c.items, c.units, Math.round(c.value)]));
  }

  exportConsumption(): void {
    this.exportSeries('inventory-consumption.csv', this.consumptionSeries);
  }

  exportStatus(): void {
    downloadCsv('stock-status.csv', ['Status', 'Items'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportUtilization(): void {
    downloadCsv('warehouse-utilization.csv', ['Code', 'Warehouse', 'Site', 'Utilization %', 'Basis'],
      this.view.warehouses.map((w) => [w.code, w.name, w.site, w.utilization ?? '—', w.utilizationBasis ?? 'Not recorded']));
  }
}
