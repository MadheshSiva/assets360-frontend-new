import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import {
  DashboardPeriodDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, seriesValues, toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, ALL_STORES, ALL_WAREHOUSES, IA_DEFAULT_PERIOD, IA_FALLBACK_PERIODS, IaKpi,
  InventoryView, ReorderItem, Risk, STOCK_STATUSES, Warehouse, emptyInventory
} from './inventory-analytics.data';

// ----- API shapes (/api/inventory-analytics) -----

interface SummaryDto {
  totalValue: KpiWidgetDto;
  stockItems: KpiWidgetDto;
  turnover: KpiWidgetDto;
  belowReorder: KpiWidgetDto;
  stockAccuracy: KpiWidgetDto;
  totalUnits: number;
}

interface ReorderRowDto {
  id: string;
  source: string;
  code: string;
  name: string;
  category: string;
  warehouseCode: string | null;
  warehouseName: string | null;
  store: string | null;
  site: string | null;
  available: number;
  reorderLevel: number;
  suggestedQuantity: number;
  dailyUsage: number | null;
  daysCover: number | null;
  supplier: string | null;
  risk: string;
  riskRank: number;
  critical: boolean;
  unitCost: number;
}

interface SlowRowDto {
  id: string;
  code: string;
  name: string;
  category: string;
  warehouseName: string | null;
  store: string | null;
  site: string | null;
  quantity: number;
  value: number;
  daysSinceIssue: number | null;
  lastIssuedAt: string | null;
}

interface WarehouseRowDto {
  id: string;
  code: string;
  name: string;
  site: string | null;
  utilization: number | null;
  utilizationBasis: string | null;
  items: number;
  units: number;
  value: number;
  belowReorder: number;
  stores: string[];
  keeper: string | null;
  stockAccuracy: number | null;
}

interface SupplierRowDto {
  name: string;
  code: string | null;
  category: string;
  items: number;
  stockValue: number;
  belowReorder: number;
  rating: number | null;
  preferred: boolean;
}

interface OverviewDto {
  generatedAt: string;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  valueTrend: { trend: PerformanceSeriesDto; issuedValue: number; issuedUnits: number; currentValue: number };
  stockByCategory: { totalUnits: number; totalValue: number; categories: { category: string; items: number; units: number; value: number }[] };
  stockStatus: { total: number; items: { label: string; count: number; percentage: number }[] };
  consumptionTrend: { trend: PerformanceSeriesDto; departments: { department: string; units: number; value: number }[] };
  warehouses: WarehouseRowDto[];
  reorder: ReorderRowDto[];
  reorderTotal: number;
  criticalAtRisk: ReorderRowDto[];
  slowMoving: { total: number; value: number; thresholdDays: number; items: SlowRowDto[] };
  suppliers: SupplierRowDto[];
}

interface ComparisonDto {
  metrics: { metric: string; value: number | null; compareValue: number | null; change: number | null }[];
  valueTrend: PerformanceSeriesDto;
  compareValueTrend: PerformanceSeriesDto;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  stockStatuses: string[];
}

interface FilterOptionsDto {
  organizations: { value: string; label: string }[];
  locations: { value: string; label: string }[];
  warehouses: { value: string; label: string; code: string; site: string | null }[];
  stores: { value: string; label: string; code: string; warehouse: string | null }[];
  categories: { value: string; label: string }[];
  stockStatuses: string[];
}

interface ViewFiltersDto {
  organization: string | null;
  location: string | null;
  warehouse: string | null;
  store: string | null;
  category: string | null;
  stockStatus: string | null;
  datePreset: string;
}

interface ViewDto {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: ViewFiltersDto;
}

interface ActionRequestDto {
  requestId: string;
  requestType: string;
  title: string;
  status: string;
}

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

/** Body of POST /requests: a purchase request or an action plan. */
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

const TIME_ZONE = 'UTC';
/** The overview returns this many reorder and slow-moving rows, so the tables and lists can be sorted in the browser. */
const OVERVIEW_ROWS = 500;

const kpi = (dto: KpiWidgetDto | null | undefined): IaKpi => ({
  value: dto?.value ?? null,
  previous: dto?.previousValue ?? null,
  change: dto?.change ?? null
});

const RISKS: Risk[] = ['High', 'Medium', 'Low'];

function toReorder(dto: ReorderRowDto): ReorderItem {
  const risk = (RISKS.includes(dto.risk as Risk) ? dto.risk : 'Low') as Risk;
  return {
    key: dto.id,
    code: dto.code,
    name: dto.name,
    category: dto.category,
    warehouse: dto.warehouseCode ?? '',
    warehouseName: dto.warehouseName ?? '—',
    store: dto.store ?? '—',
    site: dto.site ?? '—',
    available: num(dto.available),
    reorderLevel: num(dto.reorderLevel),
    suggestedQty: num(dto.suggestedQuantity),
    dailyUsage: dto.dailyUsage,
    daysCover: dto.daysCover,
    coverRank: dto.daysCover ?? Number.MAX_SAFE_INTEGER,
    supplier: dto.supplier ?? '—',
    risk,
    riskRank: dto.riskRank,
    critical: dto.critical,
    unitCost: num(dto.unitCost)
  };
}

function toWarehouse(dto: WarehouseRowDto): Warehouse {
  return {
    code: dto.code,
    name: dto.name,
    site: dto.site ?? '—',
    utilization: dto.utilization,
    utilizationBasis: dto.utilizationBasis,
    items: num(dto.items),
    units: num(dto.units),
    value: num(dto.value),
    belowReorder: num(dto.belowReorder),
    stores: dto.stores ?? [],
    keeper: dto.keeper ?? '—'
  };
}

function toView(dto: OverviewDto): InventoryView {
  const s = dto.summary;
  const trend = dto.valueTrend?.trend;
  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    labels: (trend?.categories ?? []).map(monthLabel),
    totalValueKpi: kpi(s?.totalValue),
    stockItemsKpi: kpi(s?.stockItems),
    turnoverKpi: kpi(s?.turnover),
    belowReorderKpi: kpi(s?.belowReorder),
    accuracyKpi: kpi(s?.stockAccuracy),
    stockItems: num(s?.stockItems?.value),
    totalUnits: num(s?.totalUnits),
    issues: seriesValues(trend, 'Issues'),
    issuedValue: num(dto.valueTrend?.issuedValue),
    categories: (dto.stockByCategory?.categories ?? []).map((c) => ({ name: c.category, items: num(c.items), units: num(c.units), value: num(c.value) })),
    statusCounts: (dto.stockStatus?.items ?? []).map((i) => ({ name: i.label, count: num(i.count) })),
    consumption: (dto.consumptionTrend?.trend?.series ?? []).map((line) => ({ name: line.name, values: line.values.map(num) })),
    warehouses: (dto.warehouses ?? []).map(toWarehouse),
    reorderItems: (dto.reorder ?? []).map(toReorder),
    reorderTotal: num(dto.reorderTotal),
    criticalAtRisk: (dto.criticalAtRisk ?? []).map(toReorder),
    slowItems: (dto.slowMoving?.items ?? []).map((x) => ({
      code: x.code, name: x.name, category: x.category, warehouseName: x.warehouseName ?? '—', store: x.store ?? '—', site: x.site ?? '—',
      quantity: num(x.quantity), value: num(x.value), daysSinceIssue: x.daysSinceIssue
    })),
    slowTotal: num(dto.slowMoving?.total),
    slowValue: num(dto.slowMoving?.value),
    slowDays: dto.slowMoving?.thresholdDays ?? 180,
    suppliers: (dto.suppliers ?? []).map((x) => ({
      name: x.name, code: x.code ?? '', category: x.category, items: num(x.items), stockValue: num(x.stockValue), belowReorder: num(x.belowReorder),
      rating: x.rating, preferred: x.preferred
    }))
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

/** Inventory Analytics figures, filters, saved views and requests from the Report Analytics API (/api/inventory-analytics). */
@Injectable()
export class InventoryAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/inventory-analytics`;

  readonly view = signal<InventoryView>(emptyInventory());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(IA_FALLBACK_PERIODS);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Inventory Analytics')));

  private scope(): Record<string, string | undefined> {
    return { tenantId: environment.tenantId, clientId: environment.clientId };
  }

  private query(f: IaFilters): Record<string, string | null | undefined> {
    return {
      datePreset: f.period || IA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      warehouse: pick(f.warehouse, ALL_WAREHOUSES),
      store: pick(f.store, ALL_STORES),
      category: pick(f.category, ALL_CATEGORIES),
      stockStatus: pick(f.status, ALL_STATUSES),
      timeZone: TIME_ZONE,
      ...this.scope()
    };
  }

  /** GET /options: period presets (Custom left out) and stock statuses. */
  loadOptions(): Observable<{ periods: string[]; defaultPeriod: string; statuses: string[] }> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : IA_FALLBACK_PERIODS;
        this.periods.set(list);
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : IA_DEFAULT_PERIOD,
          statuses: dto.stockStatuses?.length ? dto.stockStatuses : STOCK_STATUSES
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: organizations and categories, plus the warehouses in the organization and the stores of the picked warehouse. */
  loadFilters(f: IaFilters): Observable<IaFilterLists> {
    const params = toParams({
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      warehouse: pick(f.warehouse, ALL_WAREHOUSES),
      ...this.scope()
    });
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        warehouses: (dto.warehouses ?? []).map((w) => ({ name: w.label, code: w.code, site: w.site ?? '—' })),
        stores: optionLabels(ALL_STORES, dto.stores),
        categories: optionLabels(ALL_CATEGORIES, dto.categories),
        statuses: [ALL_STATUSES, ...(dto.stockStatuses?.length ? dto.stockStatuses : STOCK_STATUSES)]
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: IaFilters): Observable<InventoryView> {
    this.loading.set(true);
    const params = toParams({ ...this.query(f), reorderSize: OVERVIEW_ROWS, slowSize: OVERVIEW_ROWS });
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params }).pipe(
      map(toView),
      tap((v) => {
        this.view.set(v);
        this.loaded.set(true);
      }),
      catchError(this.fail),
      finalize(() => this.loading.set(false))
    );
  }

  /** GET /compare-periods: the previous period's monthly issue value and turnover. */
  loadPrevious(f: IaFilters): Observable<{ issues: number[]; turnover: number | null }> {
    return this.http.get<ComparisonDto>(`${this.apiUrl}/compare-periods`, { params: toParams(this.query(f)) }).pipe(
      map((dto) => ({
        issues: seriesValues(dto.compareValueTrend, 'Issues'),
        turnover: dto.metrics?.find((m) => m.metric === 'Inventory Turnover')?.compareValue ?? null
      })),
      catchError(this.fail)
    );
  }

  /** GET /export: the Excel workbook for the filter bar. */
  export(f: IaFilters): Observable<void> {
    const params = toParams({ ...this.query(f), format: 'xlsx' });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'inventory-analytics.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Inventory view, then the user's own. */
  loadViews(): Observable<IaSavedView[]> {
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params: toParams(this.scope()) }).pipe(
      map((rows) => rows.map((v) => this.toSavedView(v))),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: IaFilters, isDefault: boolean): Observable<IaSavedView> {
    const body = {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        warehouse: pick(f.warehouse, ALL_WAREHOUSES),
        store: pick(f.store, ALL_STORES),
        category: pick(f.category, ALL_CATEGORIES),
        stockStatus: pick(f.status, ALL_STATUSES),
        datePreset: f.period || IA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      },
      ...this.scope()
    };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(map((dto) => this.toSavedView(dto)), catchError(this.fail));
  }

  // ----- Purchase requests and action plans -----

  /** POST /requests: returns the reference number (PR-… or AP-…). */
  createRequest(request: IaActionRequest): Observable<string> {
    return this.http.post<ActionRequestDto>(`${this.apiUrl}/requests`, { ...request, ...this.scope() }).pipe(
      map((dto) => dto.requestId),
      catchError(this.fail)
    );
  }

  private toSavedView(dto: ViewDto): IaSavedView {
    const f = dto.filters;
    const periods = this.periods();
    return {
      viewId: dto.viewId,
      name: dto.viewName,
      builtIn: dto.isBuiltIn,
      isDefault: dto.isDefault,
      filters: {
        // Custom ranges can't be shown in the period dropdown; such views open on the default period
        period: f?.datePreset && periods.includes(f.datePreset) ? f.datePreset : IA_DEFAULT_PERIOD,
        organization: f?.organization ?? ALL_ORGANIZATIONS,
        location: f?.location ?? ALL_LOCATIONS,
        warehouse: f?.warehouse ?? ALL_WAREHOUSES,
        store: f?.store ?? ALL_STORES,
        category: f?.category ?? ALL_CATEGORIES,
        status: f?.stockStatus ?? ALL_STATUSES
      }
    };
  }
}
