import { Injectable, signal } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { downloadCsv } from '../shared/analytics-common';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, ALL_STORES, ALL_WAREHOUSES, IA_DEFAULT_PERIOD, IA_PERIODS, InventoryView,
  STOCK_STATUSES, buildDemoInventory, buildDemoPrevious, demoFilterLists, emptyInventory
} from './inventory-analytics.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface IaFilters {
  period: string;
  organization: string;
  location: string;
  warehouse: string;
  store: string;
  category: string;
  status: string;
}

export interface IaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: IaFilters;
}

export interface IaFilterLists {
  organizations: string[];
  warehouses: { name: string; code: string; site: string }[];
  stores: string[];
  categories: string[];
  statuses: string[];
}

/** A purchase request or an action plan. */
export interface IaActionRequest {
  requestType: 'Purchase Request' | 'Action Plan';
  title: string;
  itemCodes: string[];
  quantity: number | null;
  supplier: string | null;
  dueDate: string | null;
  priority: string;
  assignee: string | null;
  notes: string | null;
  source: string | null;
  warehouse: string | null;
}

const ALL_FILTERS: IaFilters = {
  period: IA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, warehouse: ALL_WAREHOUSES, store: ALL_STORES,
  category: ALL_CATEGORIES, status: ALL_STATUSES
};

/** Inventory Analytics figures, filters, saved views and requests from static demo data (inventory-analytics.data.ts). */
@Injectable()
export class InventoryAnalyticsService {
  readonly view = signal<InventoryView>(emptyInventory());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(IA_PERIODS);

  /** Saved views and requests live in memory for the demo */
  private views: IaSavedView[] = [
    { viewId: 'all-inventory', name: 'All Inventory', builtIn: true, isDefault: true, filters: { ...ALL_FILTERS } },
    {
      viewId: 'view-dxb-spares', name: 'Dubai spares – this quarter', builtIn: false, isDefault: false,
      filters: { ...ALL_FILTERS, period: 'This quarter', organization: 'Purple IQ UAE', warehouse: 'Dubai Main Warehouse', category: 'Spare Parts' }
    }
  ];
  private requestSeq = { 'Purchase Request': 1186, 'Action Plan': 342 };
  private viewSeq = 1;

  /** Period presets and stock statuses. */
  loadOptions(): Observable<{ periods: string[]; defaultPeriod: string; statuses: string[] }> {
    this.periods.set(IA_PERIODS);
    return of({ periods: IA_PERIODS, defaultPeriod: IA_DEFAULT_PERIOD, statuses: STOCK_STATUSES });
  }

  /** Organizations and categories, plus the warehouses in the organization and the stores of the picked warehouse. */
  loadFilters(f: IaFilters): Observable<IaFilterLists> {
    return defer(() => of(demoFilterLists(f)));
  }

  /** Every section for the filter bar in one call. */
  loadOverview(f: IaFilters): Observable<InventoryView> {
    return defer(() => {
      this.loading.set(true);
      const v = buildDemoInventory(f);
      this.view.set(v);
      this.loaded.set(true);
      this.loading.set(false);
      return of(v);
    });
  }

  /** The previous period's issue value per bucket and turnover. */
  loadPrevious(f: IaFilters): Observable<{ issues: number[]; turnover: number | null }> {
    return defer(() => of(buildDemoPrevious(f)));
  }

  /** CSV download with every section for the filter bar. */
  export(f: IaFilters): Observable<void> {
    return defer(() => {
      const v = buildDemoInventory(f);
      const rows: (string | number)[][] = [
        ['KPI', 'Total Inventory Value (AED)', v.totalValueKpi.value ?? ''],
        ['KPI', 'Stock Items', v.stockItemsKpi.value ?? ''],
        ['KPI', 'Inventory Turnover', v.turnoverKpi.value ?? ''],
        ['KPI', 'Items Below Reorder', v.belowReorderKpi.value ?? ''],
        ['KPI', 'Stock Accuracy %', v.accuracyKpi.value ?? ''],
        ...v.labels.map((l, i) => ['Issues (AED)', l.replace('\n', ' '), v.issues[i]]),
        ...v.categories.map((c) => ['Stock by category', c.name, `${c.items} items · ${c.units} units · AED ${c.value}`]),
        ...v.statusCounts.map((s) => ['Stock status', s.name, s.count]),
        ...v.warehouses.map((w) => ['Warehouse utilization %', `${w.code} ${w.name}`, w.utilization ?? '']),
        ...v.reorderItems.map((r) => ['Below reorder', `${r.code} ${r.name} (${r.warehouseName})`, `${r.available} / ${r.reorderLevel} · ${r.risk}`]),
        ...v.slowItems.map((x) => ['Slow-moving', `${x.code} ${x.name} (${x.warehouseName})`, `AED ${x.value} · ${x.daysSinceIssue} days`]),
        ...v.suppliers.map((s) => ['Supplier', s.name, `AED ${Math.round(s.stockValue)} · ${s.belowReorder} below reorder`])
      ];
      downloadCsv(`inventory-analytics-${new Date().toISOString().slice(0, 10)}.csv`, ['Section', 'Item', 'Value'], rows);
      return of(undefined);
    });
  }

  // ----- Saved views -----

  /** The built-in All Inventory view, then the user's own. */
  loadViews(): Observable<IaSavedView[]> {
    return of(this.views.map((v) => ({ ...v, filters: { ...v.filters } })));
  }

  createView(name: string, f: IaFilters, isDefault: boolean): Observable<IaSavedView> {
    const saved: IaSavedView = { viewId: `view-${this.viewSeq++}`, name: name.trim(), builtIn: false, isDefault, filters: { ...f } };
    if (isDefault) this.views = this.views.map((v) => ({ ...v, isDefault: false }));
    this.views = [...this.views, saved];
    return of(saved);
  }

  // ----- Purchase requests and action plans -----

  /** Returns the reference number (PR-… or AP-…). */
  createRequest(request: IaActionRequest): Observable<string> {
    const n = ++this.requestSeq[request.requestType];
    const prefix = request.requestType === 'Purchase Request' ? 'PR' : 'AP';
    return of(`${prefix}-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`);
  }
}
