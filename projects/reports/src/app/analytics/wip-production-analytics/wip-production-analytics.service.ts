import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, forkJoin, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import {
  DashboardPeriodDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, parseQuery, saveBlob, seriesValues,
  toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_LINES, ALL_ORGANIZATIONS, ALL_PLANTS, ALL_PRODUCTION_VIEW, ALL_PRODUCTS, ALL_WORK_CENTERS, DOWNTIME_CAUSES, PA_DEFAULT_PERIOD,
  PA_FALLBACK_PERIODS, PaKpiValue, ProductionInsight, ProductionOrder, ProductionView, UTILIZATION_TARGET, WIP_STAGES, WorkCenter,
  emptyProductionView
} from './wip-production-analytics.data';

// ----- API shapes (/api/production-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  plant: string | null;
  productionLine: string | null;
  workCenter: string | null;
  product: string | null;
  utilizationTarget: number;
  outputTarget: number | null;
  atRiskGap: number;
}

interface SummaryDto {
  productionOutput: KpiWidgetDto;
  outputUnit: string;
  wipValue: KpiWidgetDto;
  onTimeCompletion: KpiWidgetDto;
  equipmentUtilization: KpiWidgetDto;
  oee: KpiWidgetDto;
}

interface WipByStageDto {
  currentValue: number;
  current: { label: string; value: number; percentage: number }[];
  trend: PerformanceSeriesDto;
}

interface CountBreakdownDto {
  total: number;
  items: { label: string; count: number; percentage: number }[];
}

interface LineUtilizationDto {
  line: string;
  workCenters: number;
  utilization: number | null;
  target: number;
  meetsTarget: boolean | null;
}

interface DowntimeDto {
  totalHours: number;
  causes: { cause: string; hours: number; percentage: number }[];
  trend: PerformanceSeriesDto;
}

interface InsightDto {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  value: number | null;
  orders: { id: string; orderNo: string | null; product: string; line: string; dueDate: string | null; progress: number; schedule: string }[];
  lines: string[];
  actions: string[];
  query: string;
}

interface OrderRowDto {
  id: string;
  orderNo: string | null;
  product: string;
  plant: string;
  line: string;
  workCenter: string;
  assetId: string | null;
  plannedQty: number | null;
  completedQty: number | null;
  wipQty: number | null;
  unit: string;
  progress: number;
  dueDate: string | null;
  status: string;
  stage: string;
  schedule: string;
  wipValue: number;
  priority: string | null;
}

interface BottleneckDto {
  workCenter: string;
  line: string;
  queue: number;
  inProgress: number;
  avgWaitDays: number | null;
  utilization: number | null;
  risk: string;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  outputTrend: PerformanceSeriesDto;
  wipByStage: WipByStageDto;
  workOrderStatus: CountBreakdownDto;
  utilizationByLine: LineUtilizationDto[];
  insights: InsightDto[];
  downtimeByCause: DowntimeDto;
  efficiencyTrend: PerformanceSeriesDto;
  activeOrders: OrderRowDto[];
  activeOrdersTotal: number;
  bottlenecks: BottleneckDto[];
}

interface SectionDto<T> {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  data: T;
}

interface OrdersDto {
  items: OrderRowDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface CompareDto {
  period: DashboardPeriodDto;
  comparePeriod: DashboardPeriodDto;
  outputUnit: string;
  metrics: { metric: string; format: string; value: number | null; compareValue: number | null; change: number | null; changeUnit: string; trend: string }[];
  outputTrend: PerformanceSeriesDto;
  compareOutputTrend: PerformanceSeriesDto;
}

interface FilterOptionsDto {
  organizations: { value: string; label: string }[];
  plants: string[];
  productionLines: string[];
  workCenters: string[];
  products: string[];
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  defaultUtilizationTarget: number;
}

interface ViewFiltersDto {
  organization: string | null;
  plant: string | null;
  productionLine: string | null;
  workCenter: string | null;
  product: string | null;
  datePreset: string;
  dateFrom: string | null;
  dateTo: string | null;
  timeZone: string;
}

interface ViewDto {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: ViewFiltersDto;
  updatedAt: string | null;
}

/** Body of POST /views and PUT /views/{viewId}. The owner is the signed-in user (from the access token). */
interface SaveViewRequest {
  viewName: string;
  isDefault: boolean;
  filters: {
    organization: string | null; plant: string | null; productionLine: string | null; workCenter: string | null; product: string | null;
    datePreset: string; timeZone: string;
  };
  tenantId?: string;
  clientId?: string;
}

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

const TIME_ZONE = 'UTC';
/** Rows the overview returns for the Active Production Orders table (sorted in the browser) and the bottleneck list. */
const OVERVIEW_ORDERS = 200;
const OVERVIEW_BOTTLENECKS = 10;

const kpi = (dto: KpiWidgetDto | null | undefined): PaKpiValue => ({ value: dto?.value ?? null, previous: dto?.previousValue ?? null, change: num(dto?.change) });

function toOrder(dto: OrderRowDto): ProductionOrder {
  const state = dto.schedule && dto.schedule !== 'On Track' ? dto.schedule : dto.stage === 'Quality Inspection' ? 'Quality Hold' : dto.status;
  return {
    key: dto.id,
    code: dto.orderNo || dto.id,
    product: dto.product,
    line: dto.line,
    site: dto.plant,
    workCenter: dto.workCenter,
    assetId: dto.assetId,
    planned: dto.plannedQty,
    completed: dto.completedQty,
    wip: dto.wipQty,
    unit: dto.unit,
    progress: num(dto.progress),
    due: dto.dueDate ? dto.dueDate.slice(0, 10) : null,
    status: dto.status,
    stage: dto.stage,
    schedule: dto.schedule,
    state,
    wipValue: num(dto.wipValue),
    priority: dto.priority
  };
}

function toWorkCenter(dto: BottleneckDto): WorkCenter {
  return {
    name: dto.workCenter,
    line: dto.line,
    queue: dto.queue,
    inProgress: dto.inProgress,
    avgWait: dto.avgWaitDays,
    utilization: dto.utilization,
    risk: dto.risk
  };
}

function toInsight(dto: InsightDto): ProductionInsight {
  return {
    key: dto.key,
    severity: dto.severity,
    title: dto.title,
    message: dto.message,
    count: dto.count,
    value: dto.value,
    lines: dto.lines ?? [],
    actions: dto.actions ?? [],
    query: dto.query ?? ''
  };
}

function toView(dto: OverviewDto): ProductionView {
  const summary = dto.summary;
  const output = dto.outputTrend ?? { categories: [], series: [] };
  const efficiency = dto.efficiencyTrend ?? { categories: [], series: [] };
  const downtime = dto.downtimeByCause;
  const causes = downtime?.causes?.length ? downtime.causes : DOWNTIME_CAUSES.map((cause) => ({ cause, hours: 0, percentage: 0 }));
  const stageNames = dto.wipByStage?.trend?.series?.length ? dto.wipByStage.trend.series.map((s) => s.name) : WIP_STAGES;
  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    utilizationTarget: dto.filters?.utilizationTarget ?? UTILIZATION_TARGET,
    outputUnit: summary?.outputUnit || 'units',
    output: kpi(summary?.productionOutput),
    wipValue: kpi(summary?.wipValue),
    onTime: kpi(summary?.onTimeCompletion),
    utilization: kpi(summary?.equipmentUtilization),
    oee: kpi(summary?.oee),
    labels: (output.categories ?? []).map(monthLabel),
    actual: seriesValues(output, 'Actual'),
    planned: seriesValues(output, 'Planned'),
    target: output.series?.some((s) => s.name === 'Target') ? seriesValues(output, 'Target') : null,
    stageStacks: stageNames.map((name) => ({ name, values: seriesValues(dto.wipByStage?.trend, name) })),
    workOrderTotal: num(dto.workOrderStatus?.total),
    workOrders: (dto.workOrderStatus?.items ?? []).map((i) => ({ name: i.label, count: num(i.count) })),
    lines: (dto.utilizationByLine ?? []).map((l) => ({
      name: l.line, workCenters: l.workCenters, utilization: l.utilization, target: l.target, meetsTarget: l.meetsTarget
    })),
    downtimeCauses: causes.map((c) => c.cause),
    downtime: causes.map((c) => num(c.hours)),
    downtimeTrend: (downtime?.trend?.series ?? []).map((s) => ({ name: s.name, values: s.values.map(num) })),
    availability: seriesValues(efficiency, 'Availability'),
    performance: seriesValues(efficiency, 'Performance'),
    quality: seriesValues(efficiency, 'Quality'),
    oeeTrend: seriesValues(efficiency, 'OEE'),
    hasEfficiency: (efficiency.series ?? []).some((s) => s.values.some((v) => v !== null)),
    orders: (dto.activeOrders ?? []).map(toOrder),
    ordersTotal: num(dto.activeOrdersTotal),
    workCenters: (dto.bottlenecks ?? []).map(toWorkCenter),
    insights: (dto.insights ?? []).map(toInsight)
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

function viewFilters(dto: ViewFiltersDto, periods: string[]): Record<string, string> {
  return {
    // Custom ranges can't be shown in the period dropdown; such views open on the default period
    period: dto.datePreset && periods.includes(dto.datePreset) ? dto.datePreset : PA_DEFAULT_PERIOD,
    organization: dto.organization ?? ALL_ORGANIZATIONS,
    plant: dto.plant ?? ALL_PLANTS,
    line: dto.productionLine ?? ALL_LINES,
    workCenter: dto.workCenter ?? ALL_WORK_CENTERS,
    product: dto.product ?? ALL_PRODUCTS
  };
}

/** WIP / Production figures, filters and saved views from the Report Analytics API (/api/production-analytics). */
@Injectable()
export class WipProductionAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/production-analytics`;

  readonly view = signal<ProductionView>(emptyProductionView());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(PA_FALLBACK_PERIODS);
  readonly views = signal<PaSavedView[]>([]);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Production Analytics')));

  private query(f: PaFilters): Record<string, string | null> {
    return {
      datePreset: f.period || PA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      plant: pick(f.plant, ALL_PLANTS),
      productionLine: pick(f.line, ALL_LINES),
      workCenter: pick(f.workCenter, ALL_WORK_CENTERS),
      product: pick(f.product, ALL_PRODUCTS),
      timeZone: TIME_ZONE,
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
  }

  /** GET /options: period presets (Custom left out) and the default one. */
  loadOptions(): Observable<{ periods: string[]; defaultPeriod: string }> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : PA_FALLBACK_PERIODS;
        this.periods.set(list);
        return { periods: list, defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : PA_DEFAULT_PERIOD };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: organizations, plus the plants, lines, work centers and products found on production orders. */
  loadFilters(): Observable<PaFilterLists> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    const labels = (all: string, values: string[] | null | undefined) => optionLabels(all, (values ?? []).map((label) => ({ label })));
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        plants: labels(ALL_PLANTS, dto.plants),
        lines: labels(ALL_LINES, dto.productionLines),
        workCenters: labels(ALL_WORK_CENTERS, dto.workCenters),
        products: labels(ALL_PRODUCTS, dto.products)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: PaFilters): Observable<ProductionView> {
    this.loading.set(true);
    const params = toParams({ ...this.query(f), ordersSize: OVERVIEW_ORDERS, bottleneckLimit: OVERVIEW_BOTTLENECKS });
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

  /**
   * Compare Periods: the previous period's Actual output (GET /compare-periods, which defaults to the previous period of the same length)
   * and OEE line (GET /efficiency-trend over that range as a custom period).
   */
  loadPrevious(f: PaFilters, range: { from: string; to: string }): Observable<PaPrevious> {
    const custom = toParams({ ...this.query(f), datePreset: 'Custom', from: range.from, to: range.to });
    return forkJoin({
      compare: this.http.get<CompareDto>(`${this.apiUrl}/compare-periods`, { params: toParams(this.query(f)) }),
      efficiency: this.http.get<SectionDto<PerformanceSeriesDto>>(`${this.apiUrl}/efficiency-trend`, { params: custom })
    }).pipe(
      map(({ compare, efficiency }) => ({
        actual: seriesValues(compare.compareOutputTrend, 'Actual'),
        oee: seriesValues(efficiency.data, 'OEE')
      })),
      catchError(this.fail)
    );
  }

  /** GET /orders, optionally with an insight's query (schedule=…, stage=…, productionLine=…), most urgent first. */
  loadOrders(f: PaFilters, query = ''): Observable<{ items: ProductionOrder[]; total: number }> {
    const params = toParams({ ...this.query(f), ...parseQuery(query), sortBy: 'dueDate', sortDirection: 'asc', page: 1, pageSize: 200 });
    return this.http.get<OrdersDto>(`${this.apiUrl}/orders`, { params }).pipe(
      map((dto) => ({ items: (dto.items ?? []).map(toOrder), total: dto.totalCount ?? 0 })),
      catchError(this.fail)
    );
  }

  /** GET /export: the Excel workbook for the filter bar. */
  export(f: PaFilters): Observable<void> {
    const params = toParams({ ...this.query(f), format: 'xlsx' });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'production-analytics.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Production view, then the user's own. */
  loadViews(): Observable<PaSavedView[]> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params }).pipe(
      map((rows) => {
        const list = rows.map((v) => this.toSavedView(v));
        if (!list.some((v) => v.builtIn)) list.unshift(this.allProductionView());
        this.views.set(list);
        return list;
      }),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const body: SaveViewRequest = { ...this.toRequest(name, f, isDefault), tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => [...list, saved])),
      catchError(this.fail)
    );
  }

  /** PUT /views/{viewId}. */
  updateView(viewId: string, name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    return this.http.put<ViewDto>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`, this.toRequest(name, f, isDefault)).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => list.map((v) => (v.viewId === saved.viewId ? saved : v)))),
      catchError(this.fail)
    );
  }

  /** DELETE /views/{viewId}. */
  deleteView(viewId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`).pipe(
      tap(() => this.views.update((list) => list.filter((v) => v.viewId !== viewId))),
      catchError(this.fail)
    );
  }

  allProductionView(): PaSavedView {
    return {
      viewId: 'all-production', name: ALL_PRODUCTION_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: PA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, plant: ALL_PLANTS, line: ALL_LINES, workCenter: ALL_WORK_CENTERS, product: ALL_PRODUCTS
      }
    };
  }

  private toSavedView(dto: ViewDto): PaSavedView {
    return { viewId: dto.viewId, name: dto.viewName, builtIn: dto.isBuiltIn, isDefault: dto.isDefault, filters: viewFilters(dto.filters, this.periods()) };
  }

  private toRequest(name: string, f: PaFilters, isDefault: boolean): SaveViewRequest {
    return {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        plant: pick(f.plant, ALL_PLANTS),
        productionLine: pick(f.line, ALL_LINES),
        workCenter: pick(f.workCenter, ALL_WORK_CENTERS),
        product: pick(f.product, ALL_PRODUCTS),
        datePreset: f.period || PA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      }
    };
  }
}
