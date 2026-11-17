import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, forkJoin, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { ChartSeries, ChartSlice, RA_COLORS } from '../shared/charts';
import { ALL_CATEGORIES } from '../asset-performance/kit/asset-universe';
import {
  DashboardPeriodDto, FilterOptionsDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, parseQuery, saveBlob,
  seriesValues, toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_LOCATIONS, ALL_MAINTENANCE_TYPES, ALL_MAINTENANCE_VIEW, ALL_ORGANIZATIONS, MA_DEFAULT_PERIOD, MA_FALLBACK_PERIODS, MA_FALLBACK_TYPES, MaInsight,
  MaKpiValue, MaWorkOrder, MaintenanceView, PM_TARGET, TechnicianRow, emptyMaintenance
} from './maintenance-analytics.data';

// ----- API shapes (/api/maintenance-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  maintenanceType: string | null;
  complianceTarget: number;
  emergencyCostTarget: number | null;
  failureHealthThreshold: number;
}

interface SummaryDto {
  maintenanceCost: KpiWidgetDto;
  openWorkOrders: KpiWidgetDto;
  preventiveCompliance: KpiWidgetDto;
  mttr: KpiWidgetDto;
  mtbf: KpiWidgetDto;
}

interface CostTrendDto {
  trend: PerformanceSeriesDto;
  totals: {
    planned: number;
    corrective: number;
    emergency: number;
    unassigned: number;
    total: number;
    laborCost: number;
    sparePartsCost: number;
    budget: number | null;
  };
}

interface CountBreakdownDto {
  total: number;
  items: { label: string; count: number; percentage: number }[];
}

interface PreventiveComplianceDto {
  value: number | null;
  target: number;
  meetsTarget: boolean | null;
  previousValue: number | null;
  change: number | null;
  completed: number;
  due: number;
  trend: PerformanceSeriesDto;
}

interface ReliabilityDto {
  mtbf: KpiWidgetDto;
  mttr: KpiWidgetDto;
  trend: PerformanceSeriesDto;
}

interface DowntimeByCauseDto {
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
  workOrders: { id: string; workOrderId: string | null; assetId: string | null; assetName: string | null; priority: string | null; status: string; reasons: string[] }[];
  assets: { id: string; assetId: string | null; assetName: string | null; location: string | null; healthScore: number | null; reasons: string[] }[];
  parts: string[];
  actions: string[];
  query: string;
}

interface BacklogRowDto {
  id: string;
  workOrderId: string | null;
  workType: string;
  priority: string;
  assetRecordId: string | null;
  assetId: string | null;
  assetName: string | null;
  location: string | null;
  ageDays: number | null;
  assignedTo: string | null;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  partsShortage: boolean;
}

interface TechnicianRowDto {
  technician: string;
  technicianId: string | null;
  assigned: number;
  completed: number;
  firstTimeFixRate: number | null;
  avgResponseHours: number | null;
  slaCompliance: number | null;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  costTrend: CostTrendDto;
  workOrdersByType: CountBreakdownDto;
  workOrderStatus: CountBreakdownDto;
  insights: InsightDto[];
  preventiveCompliance: PreventiveComplianceDto;
  reliability: ReliabilityDto;
  downtimeByCause: DowntimeByCauseDto;
  backlog: BacklogRowDto[];
  backlogTotal: number;
  technicians: TechnicianRowDto[];
}

interface SectionDto<T> {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  data: T;
}

interface BacklogDto {
  items: BacklogRowDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface ComparisonDto {
  generatedAt: string;
  period: DashboardPeriodDto;
  comparePeriod: DashboardPeriodDto;
  metrics: { metric: string; format: string; value: number | null; compareValue: number | null; change: number | null; changeUnit: string; trend: string }[];
  costTrend: PerformanceSeriesDto;
  compareCostTrend: PerformanceSeriesDto;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  maintenanceTypes: string[];
  statuses: string[];
  priorities: string[];
  downtimeCauses: string[];
  backlogSortFields: string[];
  exportFormats: string[];
  defaultComplianceTarget: number;
  defaultFailureHealthThreshold: number;
}

interface ViewFiltersDto {
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  maintenanceType: string | null;
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
    organization: string | null;
    location: string | null;
    category: string | null;
    assetType: string | null;
    maintenanceType: string | null;
    datePreset: string;
    timeZone: string;
  };
  tenantId?: string;
  clientId?: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface MaFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  maintenanceType: string;
}

export interface MaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface MaOptions {
  periods: string[];
  defaultPeriod: string;
  maintenanceTypes: string[];
  complianceTarget: number;
}

export interface MaFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
}

/** Previous-period lines for Compare Periods. */
export interface MaPreviousTrends {
  totalCost: number[];
  emergency: number[];
  pm: number[];
}

const TIME_ZONE = 'UTC';
/** The overview returns this many backlog rows and technicians, so the tables can be sorted in the browser. */
const BACKLOG_ROWS = 200;
const TECHNICIAN_ROWS = 100;

const COST_COLORS: Record<string, string> = {
  Planned: RA_COLORS.blue, Corrective: RA_COLORS.orange, Emergency: RA_COLORS.red, Unassigned: RA_COLORS.grey, 'Total Cost': RA_COLORS.purple
};
const TYPE_COLORS: Record<string, string> = {
  Preventive: RA_COLORS.blue, Corrective: RA_COLORS.orange, Emergency: RA_COLORS.red, Inspection: RA_COLORS.violet, Other: RA_COLORS.grey
};
const STATUS_COLORS: Record<string, string> = {
  Open: RA_COLORS.blue, 'In Progress': RA_COLORS.orange, 'On Hold': RA_COLORS.pink, Completed: RA_COLORS.green, Overdue: RA_COLORS.red, Cancelled: RA_COLORS.grey
};
const CAUSE_COLORS = [RA_COLORS.red, RA_COLORS.orange, RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.teal, RA_COLORS.grey, RA_COLORS.pink];

const kpi = (dto: KpiWidgetDto | null | undefined, unit = 'percent'): MaKpiValue => ({
  value: dto?.value ?? null,
  change: num(dto?.change),
  unit: dto?.changeUnit || unit
});

function toWorkOrder(dto: BacklogRowDto): MaWorkOrder {
  return {
    key: dto.id,
    id: dto.workOrderId || dto.id,
    type: dto.workType,
    priority: dto.priority,
    assetId: dto.assetId ?? '—',
    asset: dto.assetName || dto.assetId || '—',
    location: dto.location ?? '—',
    ageDays: dto.ageDays,
    technician: dto.assignedTo ?? 'Unassigned',
    status: dto.status,
    dueDate: dto.dueDate ? dto.dueDate.slice(0, 10) : null,
    overdue: dto.isOverdue,
    partsShortage: dto.partsShortage
  };
}

function toTechnician(dto: TechnicianRowDto): TechnicianRow {
  return {
    name: dto.technician,
    assigned: num(dto.assigned),
    completed: num(dto.completed),
    firstTimeFix: dto.firstTimeFixRate,
    response: dto.avgResponseHours,
    sla: dto.slaCompliance
  };
}

function toInsight(dto: InsightDto): MaInsight {
  return {
    key: dto.key,
    severity: dto.severity,
    title: dto.title,
    message: dto.message,
    count: dto.count,
    workOrders: (dto.workOrders ?? []).map((w) => ({
      key: w.id,
      id: w.workOrderId || w.id,
      assetId: w.assetId ?? '—',
      asset: w.assetName || w.assetId || '—',
      priority: w.priority ?? 'Unspecified',
      status: w.status,
      reasons: w.reasons ?? []
    })),
    assets: (dto.assets ?? []).map((a) => ({
      key: a.id,
      id: a.assetId || a.id,
      name: a.assetName || a.assetId || a.id,
      location: a.location ?? '—',
      health: a.healthScore,
      reasons: a.reasons ?? []
    })),
    parts: dto.parts ?? [],
    actions: dto.actions ?? [],
    query: dto.query ?? ''
  };
}

/** Planned / Corrective / Emergency bars (Unassigned when the API sends it) and the Total Cost line. */
function costSeries(dto: PerformanceSeriesDto | null | undefined): ChartSeries[] {
  return (dto?.series ?? []).map((s) => ({
    name: s.name,
    values: s.values.map(num),
    color: COST_COLORS[s.name] ?? RA_COLORS.teal,
    type: s.name === 'Total Cost' ? 'line' : 'bar'
  }));
}

function pmValues(dto: PerformanceSeriesDto | null | undefined): number[] {
  return seriesValues(dto, 'Compliance (%)');
}

function toView(dto: OverviewDto, maintenanceType: string): MaintenanceView {
  const summary = dto.summary;
  const pm = dto.preventiveCompliance;
  const target = pm?.target ?? dto.filters?.complianceTarget ?? PM_TARGET;
  const labels = (dto.costTrend?.trend?.categories ?? []).map(monthLabel);

  // One coloured column per type: each series only fills its own column (just the selected type when filtered)
  const types = (dto.workOrdersByType?.items ?? []).filter((i) => maintenanceType === ALL_MAINTENANCE_TYPES || i.label === maintenanceType);
  const typeSeries: ChartSeries[] = types.map((t, i) => ({
    name: t.label,
    values: types.map((_, j) => (i === j ? t.count : 0)),
    color: TYPE_COLORS[t.label] ?? RA_COLORS.teal
  }));
  const statusSlices: ChartSlice[] = (dto.workOrderStatus?.items ?? []).map((s) => ({ name: s.label, value: s.count, color: STATUS_COLORS[s.label] ?? RA_COLORS.grey }));

  const downtime = dto.downtimeByCause?.trend;
  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    complianceTarget: target,
    cost: kpi(summary?.maintenanceCost),
    open: kpi(summary?.openWorkOrders),
    pmCompliance: kpi(summary?.preventiveCompliance, 'points'),
    mttr: kpi(dto.reliability?.mttr ?? summary?.mttr),
    mtbf: kpi(dto.reliability?.mtbf ?? summary?.mtbf),
    labels,
    costTrend: costSeries(dto.costTrend?.trend),
    monthlyEmergency: seriesValues(dto.costTrend?.trend, 'Emergency'),
    monthlyTotal: seriesValues(dto.costTrend?.trend, 'Total Cost'),
    emergencyCost: num(dto.costTrend?.totals?.emergency),
    totalCost: num(dto.costTrend?.totals?.total),
    workOrders: num(dto.workOrderStatus?.total),
    typeSeries,
    statusSlices,
    pmCompleted: num(pm?.completed),
    pmDue: num(pm?.due),
    pmTrend: [
      { name: 'PM Compliance', values: pmValues(pm?.trend), color: RA_COLORS.green, area: true },
      { name: `Target ${target}%`, values: labels.map(() => target), color: RA_COLORS.grey, dashed: true }
    ],
    reliability: [
      { name: 'MTTR (hrs)', values: seriesValues(dto.reliability?.trend, 'MTTR (hrs)'), color: RA_COLORS.purple },
      { name: 'MTBF (hrs)', values: seriesValues(dto.reliability?.trend, 'MTBF (hrs)'), color: RA_COLORS.blue, axis: 'right' }
    ],
    downtimeByCause: (downtime?.series ?? []).map((s, i) => ({ name: s.name, values: s.values.map(num), color: CAUSE_COLORS[i % CAUSE_COLORS.length] })),
    downtimeHours: num(dto.downtimeByCause?.totalHours),
    backlog: (dto.backlog ?? []).map(toWorkOrder),
    backlogTotal: num(dto.backlogTotal),
    technicians: (dto.technicians ?? []).map(toTechnician),
    insights: (dto.insights ?? []).map(toInsight)
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

function viewFilters(dto: ViewFiltersDto, periods: string[]): Record<string, string> {
  return {
    // Custom ranges can't be shown in the period dropdown; such views open on the default period
    period: dto.datePreset && periods.includes(dto.datePreset) ? dto.datePreset : MA_DEFAULT_PERIOD,
    organization: dto.organization ?? ALL_ORGANIZATIONS,
    location: dto.location ?? ALL_LOCATIONS,
    category: dto.category ?? ALL_CATEGORIES,
    maintenanceType: dto.maintenanceType ?? ALL_MAINTENANCE_TYPES
  };
}

/** Maintenance Analytics figures, filters and saved views from the Report Analytics API (/api/maintenance-analytics). */
@Injectable()
export class MaintenanceAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/maintenance-analytics`;

  readonly view = signal<MaintenanceView>(emptyMaintenance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(MA_FALLBACK_PERIODS);
  readonly views = signal<MaSavedView[]>([]);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Maintenance Analytics')));

  private query(f: MaFilters): Record<string, string | null> {
    return {
      datePreset: f.period || MA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      maintenanceType: pick(f.maintenanceType, ALL_MAINTENANCE_TYPES),
      timeZone: TIME_ZONE,
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
  }

  /** GET /options: period presets (Custom left out), maintenance types and the default compliance target. */
  loadOptions(): Observable<MaOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : MA_FALLBACK_PERIODS;
        this.periods.set(list);
        const types = dto.maintenanceTypes?.length ? dto.maintenanceTypes : MA_FALLBACK_TYPES;
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : MA_DEFAULT_PERIOD,
          maintenanceTypes: [ALL_MAINTENANCE_TYPES, ...types],
          complianceTarget: dto.defaultComplianceTarget ?? PM_TARGET
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location and Asset Category values (labels; the API matches names). */
  loadFilters(): Observable<MaFilterLists> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: MaFilters): Observable<MaintenanceView> {
    this.loading.set(true);
    const params = toParams({ ...this.query(f), backlogSize: BACKLOG_ROWS, technicianLimit: TECHNICIAN_ROWS });
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params }).pipe(
      map((dto) => toView(dto, f.maintenanceType)),
      tap((v) => {
        this.view.set(v);
        this.loaded.set(true);
      }),
      catchError(this.fail),
      finalize(() => this.loading.set(false))
    );
  }

  /**
   * Compare Periods: the cost lines of the previous period of the same length (GET /compare-periods) and its PM compliance
   * (GET /preventive-compliance over a custom range), plotted against the current months.
   */
  loadPrevious(f: MaFilters, range: { from: string; to: string }): Observable<MaPreviousTrends> {
    const params = toParams(this.query(f));
    const pmParams = toParams({ ...this.query(f), datePreset: 'Custom', from: range.from, to: range.to });
    return forkJoin({
      compare: this.http.get<ComparisonDto>(`${this.apiUrl}/compare-periods`, { params }),
      pm: this.http.get<SectionDto<PreventiveComplianceDto>>(`${this.apiUrl}/preventive-compliance`, { params: pmParams })
    }).pipe(
      map(({ compare, pm }) => ({
        totalCost: seriesValues(compare.compareCostTrend, 'Total Cost'),
        emergency: seriesValues(compare.compareCostTrend, 'Emergency'),
        pm: pmValues(pm.data?.trend)
      })),
      catchError(this.fail)
    );
  }

  /** GET /compare-periods: the previous period's monthly emergency cost (Emergency insight → View details). */
  loadPreviousEmergency(f: MaFilters): Observable<{ labels: string[]; values: number[] }> {
    return this.http.get<ComparisonDto>(`${this.apiUrl}/compare-periods`, { params: toParams(this.query(f)) }).pipe(
      map((dto) => ({ labels: dto.compareCostTrend?.categories ?? [], values: seriesValues(dto.compareCostTrend, 'Emergency') })),
      catchError(this.fail)
    );
  }

  /** GET /backlog with extra filters (an insight's query, assignedTo, …), most urgent first. */
  loadBacklog(f: MaFilters, extra: Record<string, string> = {}): Observable<{ items: MaWorkOrder[]; total: number }> {
    const params = toParams({ ...this.query(f), ...extra, page: 1, pageSize: BACKLOG_ROWS });
    return this.http.get<BacklogDto>(`${this.apiUrl}/backlog`, { params }).pipe(
      map((dto) => ({ items: (dto.items ?? []).map(toWorkOrder), total: dto.totalCount ?? 0 })),
      catchError(this.fail)
    );
  }

  /** GET /backlog with an insight's query string (status=Overdue or partsShortage=true). */
  loadInsightOrders(f: MaFilters, insight: MaInsight): Observable<{ items: MaWorkOrder[]; total: number }> {
    return this.loadBacklog(f, parseQuery(insight.query));
  }

  /** GET /export: the Excel workbook for the filter bar. */
  export(f: MaFilters): Observable<void> {
    const params = toParams({ ...this.query(f), format: 'xlsx' });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'maintenance-analytics.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Maintenance view, then the user's own. */
  loadViews(): Observable<MaSavedView[]> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params }).pipe(
      map((rows) => {
        const list = rows.map((v) => this.toSavedView(v));
        if (!list.some((v) => v.builtIn)) list.unshift(this.allMaintenanceView());
        this.views.set(list);
        return list;
      }),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: MaFilters, isDefault = false): Observable<MaSavedView> {
    const body: SaveViewRequest = { ...this.toRequest(name, f, isDefault), tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => [...list, saved])),
      catchError(this.fail)
    );
  }

  /** PUT /views/{viewId}. */
  updateView(viewId: string, name: string, f: MaFilters, isDefault = false): Observable<MaSavedView> {
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

  allMaintenanceView(): MaSavedView {
    return {
      viewId: 'all-maintenance', name: ALL_MAINTENANCE_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: MA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, maintenanceType: ALL_MAINTENANCE_TYPES
      }
    };
  }

  private toSavedView(dto: ViewDto): MaSavedView {
    return { viewId: dto.viewId, name: dto.viewName, builtIn: dto.isBuiltIn, isDefault: dto.isDefault, filters: viewFilters(dto.filters, this.periods()) };
  }

  private toRequest(name: string, f: MaFilters, isDefault: boolean): SaveViewRequest {
    return {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        category: pick(f.category, ALL_CATEGORIES),
        // The page has no Asset Type filter
        assetType: null,
        maintenanceType: pick(f.maintenanceType, ALL_MAINTENANCE_TYPES),
        datePreset: f.period || MA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      }
    };
  }
}
