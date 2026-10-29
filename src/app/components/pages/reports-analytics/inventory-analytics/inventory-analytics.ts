import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartColumnIncreasing, Coins, LucideAngularModule, Package, RefreshCw, Target, TriangleAlert, Warehouse as WarehouseIcon } from 'lucide-angular';
import { downloadCsv, money } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, RA_COLORS } from '../shared/charts';
import {
  ALL_CATEGORIES, ALL_STATUSES, ALL_STORES, ALL_WAREHOUSES, INV_CATEGORIES, InventoryView, ReorderItem, STOCK_STATUSES, STORES, Supplier,
  WAREHOUSES, Warehouse, buildInventoryView
} from './inventory-analytics.data';
import { ReorderTable, SupplierTable } from './inventory-tables';
import {
  InsightCard, InsightPick, KpiCardData, RaDashboardPage, RaDetailsDialog, RaFormDialog, RaInsightsPanel, RaKpiCard, RaListDialog, RaPageHead,
  RaWidget, fmtInt, previousSeries, siteInScope, sumOf
} from './parts';

const KPI_DELTAS = { value: 7.6, items: 3.1, turnover: 9.2, belowReorder: -14, accuracy: 1.8 };
const UTIL_LIMIT = 90;

/** Reports & Analytics > Inventory Analytics */
@Component({
  selector: 'app-ra-inventory-analytics',
  imports: [
    FormsModule, LucideAngularModule, CartesianChart, DonutChart, RaPageHead, RaKpiCard, RaWidget, RaInsightsPanel, RaListDialog, RaDetailsDialog,
    RaFormDialog, ReorderTable, SupplierTable
  ],
  templateUrl: './inventory-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './inventory-analytics.css']
})
export class InventoryAnalyticsPage extends RaDashboardPage implements OnInit {
  private readonly router = inject(Router);
  protected readonly slug = 'inventory-analytics';

  readonly categories = [ALL_CATEGORIES, ...INV_CATEGORIES];
  readonly statuses = [ALL_STATUSES, ...STOCK_STATUSES];
  readonly allWarehouses = ALL_WAREHOUSES;
  warehouse = ALL_WAREHOUSES;
  store = ALL_STORES;
  category = ALL_CATEGORIES;
  status = ALL_STATUSES;

  view!: InventoryView;
  kpis: KpiCardData[] = [];
  insights: InsightCard[] = [];
  warehouseOptions: Warehouse[] = [];
  storeOptions: string[] = [];

  // Chart inputs, rebuilt in apply() so the charts only re-render when the data changes
  trendSeries: ChartSeries[] = [];
  categorySeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  consumptionSeries: ChartSeries[] = [];
  utilLabels: string[] = [];
  utilSeries: ChartSeries[] = [];

  readonly pct = (v: number) => `${Math.round(v)}%`;

  ngOnInit(): void {
    this.updatedMinutes = 6;
    this.apply();
  }

  get totalItemsText(): string {
    return fmtInt(this.view.stockItems);
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.apply();
  }

  /** Recomputes the view whenever a filter changes. */
  apply(): void {
    this.warehouseOptions = WAREHOUSES.filter((w) => siteInScope(w.site, this.organization, this.location));
    if (this.warehouse !== ALL_WAREHOUSES && !this.warehouseOptions.some((w) => w.name === this.warehouse)) this.warehouse = ALL_WAREHOUSES;
    const codes = this.warehouseOptions.filter((w) => this.warehouse === ALL_WAREHOUSES || w.name === this.warehouse).map((w) => w.code);
    this.storeOptions = [ALL_STORES, ...STORES.filter((s) => codes.includes(s.warehouse)).map((s) => s.name)];
    if (!this.storeOptions.includes(this.store)) this.store = ALL_STORES;

    const v = buildInventoryView({
      period: this.period, organization: this.organization, location: this.location,
      warehouse: this.warehouse, store: this.store, category: this.category, status: this.status
    });
    this.view = v;
    this.buildKpis(v);
    this.buildCharts(v);
    this.buildInsights(v);
  }

  private buildKpis(v: InventoryView): void {
    const prev = (value: number, delta: number) => value / (1 + delta / 100);
    const d = KPI_DELTAS;
    this.kpis = [
      { id: 'inventory-value', label: 'Total Inventory Value', value: money(v.totalValue), delta: d.value, goodWhenUp: true, previous: money(prev(v.totalValue, d.value)), tone: 'purple', icon: Coins },
      { id: 'stock-items', label: 'Stock Items', value: fmtInt(v.stockItems), delta: d.items, goodWhenUp: true, previous: fmtInt(prev(v.stockItems, d.items)), tone: 'green', icon: Package },
      { id: 'turnover', label: 'Inventory Turnover', value: `${v.turnover.toFixed(1)}x`, delta: d.turnover, goodWhenUp: true, previous: `${prev(v.turnover, d.turnover).toFixed(1)}x`, tone: 'orange', icon: RefreshCw },
      { id: 'below-reorder', label: 'Items Below Reorder', value: fmtInt(v.belowReorder), delta: d.belowReorder, goodWhenUp: false, previous: fmtInt(prev(v.belowReorder, d.belowReorder)), tone: 'red', icon: TriangleAlert },
      { id: 'stock-accuracy', label: 'Stock Accuracy', value: `${v.accuracy.toFixed(1)}%`, delta: d.accuracy, goodWhenUp: true, previous: `${prev(v.accuracy, d.accuracy).toFixed(1)}%`, tone: 'blue', icon: Target }
    ];
  }

  private buildCharts(v: InventoryView): void {
    this.trendSeries = [
      { name: 'Opening Value', values: v.opening, color: RA_COLORS.sky, type: 'bar' },
      { name: 'Receipts', values: v.receipts, color: RA_COLORS.green, type: 'line' },
      { name: 'Issues', values: v.issues, color: RA_COLORS.red, type: 'line' },
      { name: 'Closing Value', values: v.closing, color: RA_COLORS.purple, type: 'line' }
    ];
    if (this.compare) {
      this.trendSeries.push({ name: 'Closing Value (previous period)', values: previousSeries(v.closing, KPI_DELTAS.value), color: RA_COLORS.grey, type: 'line', dashed: true });
    }
    this.categorySeries = v.categories
      .map((name, i) => ({ name, values: v.categoryStacks[i], color: v.categoryColors[i], type: 'bar' as const }))
      .filter((s) => this.category === ALL_CATEGORIES || s.name === this.category);
    this.statusSlices = v.statuses
      .map((name, i) => ({ name, value: v.statusCounts[i], color: v.statusColors[i] }))
      .filter((s) => this.status === ALL_STATUSES || s.name === this.status);
    const lineColors = [RA_COLORS.purple, RA_COLORS.green, RA_COLORS.pink];
    this.consumptionSeries = v.consumption.map((c, i) => ({ name: c.name, values: c.values, color: lineColors[i] }));

    // One stacked series per band so each bar takes its band colour (only one band has a value per bar)
    this.utilLabels = v.warehouses.map((w) => w.name.replace(/ (Warehouse|Store)$/, '\n$1'));
    const band = (lo: number, hi: number) => v.warehouses.map((w) => (w.utilization >= lo && w.utilization < hi ? w.utilization : 0));
    this.utilSeries = [
      { name: 'Normal (< 85%)', values: band(0, 85), color: RA_COLORS.purple, type: 'bar' },
      { name: 'High (85–90%)', values: band(85, UTIL_LIMIT), color: RA_COLORS.orange, type: 'bar' },
      { name: `Critical (≥ ${UTIL_LIMIT}%)`, values: band(UTIL_LIMIT, 101), color: RA_COLORS.red, type: 'bar' }
    ];
  }

  private buildInsights(v: InventoryView): void {
    const list: InsightCard[] = [];
    const n = v.belowReorder;
    list.push(
      n
        ? {
            id: 'reorder', tone: 'red', icon: TriangleAlert, title: `${fmtInt(n)} items below reorder level`,
            text: 'These items are at or below their reorder level and may risk stockout.',
            actions: [{ id: 'view', label: 'View items' }, { id: 'request', label: 'Create purchase request', primary: true }]
          }
        : { id: 'reorder', tone: 'green', icon: Package, title: 'No items below reorder level', text: 'Every item in scope is above its reorder level.', actions: [] }
    );
    if (v.slowItems.length) {
      list.push({
        id: 'slow', tone: 'orange', icon: ChartColumnIncreasing, title: `${money(v.slowValue)} of stock is obsolete or slow-moving`,
        text: `${fmtInt(v.slowItems.length)} items have not been issued in 180+ days, totaling ${money(v.slowValue)} in value.`,
        actions: [{ id: 'view', label: 'View items' }, { id: 'plan', label: 'Create action plan', primary: true }]
      });
    }
    if (v.criticalAtRisk.length) {
      list.push({
        id: 'critical', tone: 'red', icon: TriangleAlert, title: `${v.criticalAtRisk.length} critical spare parts at risk of stockout`,
        text: `${v.criticalAtRisk.length} high-priority spare parts have less than 7 days of stock based on current consumption.`,
        actions: [{ id: 'view', label: 'View items' }, { id: 'request', label: 'Create purchase request', primary: true }]
      });
    }
    const busiest = this.busiestWarehouse;
    if (busiest && busiest.utilization >= UTIL_LIMIT) {
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
    return [...this.view.warehouses].sort((a, b) => b.utilization - a.utilization)[0];
  }

  // ===== Insight + table actions =====

  onInsight(p: InsightPick): void {
    const v = this.view;
    switch (`${p.insight.id}:${p.action.id}`) {
      case 'reorder:view':
        this.showReorderList(v.reorderItems, 'Items below reorder level');
        break;
      case 'reorder:request':
        this.requestFor(v.reorderItems);
        break;
      case 'critical:view':
        this.showReorderList(v.criticalAtRisk, 'Critical spare parts at risk of stockout');
        break;
      case 'critical:request':
        this.requestFor(v.criticalAtRisk);
        break;
      case 'slow:view':
        this.openList({
          title: 'Obsolete and slow-moving stock',
          subtitle: `${fmtInt(v.slowItems.length)} items not issued in 180+ days · ${money(v.slowValue)}`,
          columns: ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Qty', 'Value (AED)', 'Days Since Issue'],
          numeric: [5, 6, 7],
          rows: [...v.slowItems].sort((a, b) => b.value - a.value)
            .map((x) => [x.code, x.name, x.category, x.warehouseName, x.store, x.quantity, fmtInt(x.value), x.daysSinceIssue]),
          fileName: 'slow-moving-stock.csv'
        });
        break;
      case 'slow:plan':
        this.openActionPlan(`Clear ${money(v.slowValue)} of obsolete / slow-moving stock (${fmtInt(v.slowItems.length)} items)`);
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
      columns: ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Available', 'Reorder Level', 'Days of Cover', 'Lead Time (days)', 'Supplier', 'Risk'],
      numeric: [5, 6, 7, 8],
      rows: [...rows].sort((a, b) => a.riskRank - b.riskRank || a.daysCover - b.daysCover)
        .map((r) => [r.code, r.name, r.category, r.warehouseName, r.store, r.available, r.reorderLevel, r.daysCover, r.leadTime, r.supplier, r.risk]),
      fileName: 'items-below-reorder.csv'
    });
  }

  private requestFor(rows: ReorderItem[]): void {
    const qty = sumOf(rows.map((r) => r.reorderLevel * 2 - r.available));
    const suppliers = [...new Set(rows.map((r) => r.supplier))];
    this.openPurchaseRequest(`${rows.length} items below reorder level`, qty, suppliers.length === 1 ? suppliers[0] : 'Multiple suppliers');
  }

  private showWarehouse(): void {
    const w = this.busiestWarehouse;
    if (!w) return;
    this.openDetails({
      title: `${w.code} · ${w.name}`,
      subtitle: w.site,
      items: [
        { label: 'Utilization', value: `${w.utilization}% of capacity` },
        { label: 'Stores', value: STORES.filter((s) => s.warehouse === w.code).map((s) => s.name).join(', ') },
        { label: 'Stock accuracy', value: `${w.accuracy}%` },
        { label: 'Items below reorder', value: String(this.view.reorderItems.filter((r) => r.warehouse === w.code).length) },
        { label: 'Storekeeper', value: w.keeper }
      ]
    });
  }

  createRequest(r: ReorderItem): void {
    this.openPurchaseRequest(`${r.code} · ${r.name}`, r.reorderLevel * 2 - r.available, r.supplier, r.risk === 'Low' ? 'Medium' : r.risk);
  }

  viewItem(r: ReorderItem): void {
    this.openDetails({
      title: `${r.code} · ${r.name}`,
      subtitle: `${r.category} · ${r.warehouseName} / ${r.store}`,
      items: [
        { label: 'Available', value: `${r.available} (reorder level ${r.reorderLevel})` },
        { label: 'Days of cover', value: `${r.daysCover} days` },
        { label: 'Lead time', value: `${r.leadTime} days` },
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
        { label: 'Items supplied', value: fmtInt(s.items) },
        { label: 'On-time delivery', value: `${s.onTime}%` },
        { label: 'Fill rate', value: `${s.fillRate}%` },
        { label: 'Open purchase orders', value: String(s.openPos) },
        { label: 'Items below reorder', value: String(this.view.reorderItems.filter((r) => r.supplier === s.name).length) }
      ]
    });
  }

  viewAllReorder(): void {
    this.showReorderList(this.view.reorderItems, 'Items below reorder level');
  }

  // ===== Exports =====

  exportPage(): void {
    this.exportReorder();
    this.exportSuppliers();
    this.notify('Exported items below reorder level and top suppliers (CSV).');
  }

  exportReorder(): void {
    downloadCsv('inventory-items-below-reorder.csv', ['Item Code', 'Item Name', 'Category', 'Warehouse', 'Store', 'Available', 'Reorder Level', 'Lead Time (days)', 'Supplier', 'Risk'],
      this.view.reorderItems.map((r) => [r.code, r.name, r.category, r.warehouseName, r.store, r.available, r.reorderLevel, r.leadTime, r.supplier, r.risk]));
  }

  exportSuppliers(): void {
    downloadCsv('inventory-top-suppliers.csv', ['Supplier', 'Category', 'Items', 'On-Time Delivery %', 'Fill Rate %', 'Open POs'],
      this.view.suppliers.map((s) => [s.name, s.category, s.items, s.onTime, s.fillRate, s.openPos]));
  }

  private exportSeries(file: string, series: ChartSeries[]): void {
    const labels = this.view.window.labels.map((l) => l.replace('\n', ' '));
    downloadCsv(file, ['Period', ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => Math.round(s.values[i] ?? 0))]));
  }

  exportTrend(): void {
    this.exportSeries('inventory-value-trend.csv', this.trendSeries);
  }

  exportCategories(): void {
    this.exportSeries('stock-by-category.csv', this.categorySeries);
  }

  exportConsumption(): void {
    this.exportSeries('inventory-consumption.csv', this.consumptionSeries);
  }

  exportStatus(): void {
    downloadCsv('stock-status.csv', ['Status', 'Items'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportUtilization(): void {
    downloadCsv('warehouse-utilization.csv', ['Code', 'Warehouse', 'Site', 'Utilization %'], this.view.warehouses.map((w) => [w.code, w.name, w.site, w.utilization]));
  }
}
