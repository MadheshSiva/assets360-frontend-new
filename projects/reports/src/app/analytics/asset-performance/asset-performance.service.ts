import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, forkJoin, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { ChartSeries, HBarRow, RA_COLORS } from '../shared/charts';
import {
  AP_DEFAULT_PERIOD, AP_FALLBACK_PERIODS, ALL_ASSETS_VIEW, ALL_LOCATIONS, ALL_ORGANIZATIONS, ApAssetRow, ApInsight, ApKpiValue, ApLocationRow,
  AssetPerformanceView, emptyAssetPerformance
} from './asset-performance.data';
import { ALL_CATEGORIES, ALL_TYPES } from './kit/asset-universe';
import {
  DashboardPeriodDto, FilterOptionsDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, parseQuery, saveBlob,
  seriesValues, toParams
} from './kit/api-utils';

// ----- API shapes (/api/asset-performance) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  healthThreshold: number;
  utilizationTarget: number;
}

interface AssetRowDto {
  id: string;
  assetId: string | null;
  assetName: string | null;
  category: string | null;
  assetType: string | null;
  location: string | null;
  healthScore: number | null;
  healthStatus: string | null;
  utilization: number | null;
  availability: number | null;
  mtbfHours: number | null;
  mttrHours: number | null;
  downtimeHours: number;
  plannedDowntimeHours: number;
  unplannedDowntimeHours: number;
  failures: number;
  performanceScore: number | null;
  performanceBand: string | null;
  status: string;
}

interface LocationRowDto {
  location: string;
  assetCount: number;
  averageHealthScore: number | null;
  utilization: number | null;
  availability: number | null;
  performanceScore: number | null;
  status: string;
}

interface InsightDto {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  assets: { id: string; assetId: string | null; assetName: string | null; location: string | null; healthScore: number | null; reasons: string[] }[];
  locations: string[];
  actions: string[];
  query: string;
}

interface SummaryDto {
  totalAssets: KpiWidgetDto;
  averageHealthScore: KpiWidgetDto;
  utilizationRate: KpiWidgetDto;
  availability: KpiWidgetDto;
  mtbf: KpiWidgetDto;
  mttr: KpiWidgetDto;
}

interface ReliabilityDto {
  mtbf: KpiWidgetDto;
  mttr: KpiWidgetDto;
  trend: PerformanceSeriesDto;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  healthTrend: PerformanceSeriesDto;
  utilizationByCategory: { category: string; assetCount: number; active: number; idle: number; maintenance: number; utilization: number }[];
  insights: InsightDto[];
  scoreDistribution: { bands: { band: string; min: number; max: number; count: number; percentage: number }[]; ratedAssets: number; notRated: number };
  reliability: ReliabilityDto;
  downtime: { plannedHours: number; unplannedHours: number; totalHours: number; events: number; trend: PerformanceSeriesDto };
  topBottom: { top: AssetRowDto[]; bottom: AssetRowDto[] };
  locations: LocationRowDto[];
}

interface SectionDto<T> {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  data: T;
}

interface AssetListDto {
  items: AssetRowDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  defaultHealthThreshold: number;
  defaultUtilizationTarget: number;
}

interface ViewFiltersDto {
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
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
  filters: { organization: string | null; location: string | null; category: string | null; assetType: string | null; datePreset: string; timeZone: string };
  tenantId?: string;
  clientId?: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface ApFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  assetType: string;
}

export interface ApSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface ApFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  assetTypes: string[];
}

export interface ApPreviousTrends {
  healthy: number[];
  mtbf: number[];
}

const TIME_ZONE = 'UTC';

const kpi = (dto: KpiWidgetDto | null | undefined): ApKpiValue => ({ value: dto?.value ?? null, change: num(dto?.change) });

function toAssetRow(dto: AssetRowDto): ApAssetRow {
  return {
    key: dto.id,
    id: dto.assetId || dto.id,
    name: dto.assetName || dto.assetId || dto.id,
    category: dto.category ?? '—',
    type: dto.assetType ?? '—',
    location: dto.location ?? '—',
    health: dto.healthScore,
    utilization: dto.utilization,
    availability: dto.availability,
    mtbf: dto.mtbfHours,
    mttr: dto.mttrHours,
    downtime: num(dto.downtimeHours),
    failures: num(dto.failures),
    score: dto.performanceScore,
    band: dto.performanceBand,
    status: dto.status
  };
}

function toLocationRow(dto: LocationRowDto): ApLocationRow {
  return {
    name: dto.location,
    assets: dto.assetCount,
    health: dto.averageHealthScore,
    utilization: dto.utilization,
    availability: dto.availability,
    score: dto.performanceScore,
    status: dto.status
  };
}

function toInsight(dto: InsightDto): ApInsight {
  return {
    key: dto.key,
    severity: dto.severity,
    title: dto.title,
    message: dto.message,
    count: dto.count,
    assets: (dto.assets ?? []).map((a) => ({
      key: a.id,
      id: a.assetId || a.id,
      name: a.assetName || a.assetId || a.id,
      location: a.location ?? '—',
      health: a.healthScore,
      reasons: a.reasons ?? []
    })),
    locations: dto.locations ?? [],
    actions: dto.actions ?? [],
    query: dto.query ?? ''
  };
}

/** Assets per health state each month, as a share of the assessed assets (the API counts them). */
function healthShares(dto: PerformanceSeriesDto): ChartSeries[] {
  const healthy = seriesValues(dto, 'Healthy');
  const atRisk = seriesValues(dto, 'At Risk');
  const critical = seriesValues(dto, 'Critical');
  const share = (list: number[]) => list.map((v, i) => {
    const total = healthy[i] + atRisk[i] + critical[i];
    return total ? Math.round((v / total) * 1000) / 10 : 0;
  });
  return [
    { name: 'Healthy', values: share(healthy), color: RA_COLORS.green, area: true },
    { name: 'At Risk', values: share(atRisk), color: RA_COLORS.orange },
    { name: 'Critical', values: share(critical), color: RA_COLORS.red }
  ];
}

const BAND_COLORS: Record<string, string> = { Excellent: RA_COLORS.green, Good: RA_COLORS.blue, Watch: RA_COLORS.orange, Critical: RA_COLORS.red };

function toView(dto: OverviewDto): AssetPerformanceView {
  const categories = dto.utilizationByCategory ?? [];
  const distribution: HBarRow[] = (dto.scoreDistribution?.bands ?? []).map((b) => ({
    label: `${b.band} (${b.min}–${b.max})`,
    value: b.count,
    display: `${b.count} (${Math.round(b.percentage)}%)`,
    color: BAND_COLORS[b.band] ?? RA_COLORS.purple
  }));
  const summary = dto.summary;
  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    healthThreshold: dto.filters?.healthThreshold ?? 60,
    utilizationTarget: dto.filters?.utilizationTarget ?? 60,
    total: num(summary?.totalAssets?.value),
    totalChange: num(summary?.totalAssets?.change),
    health: kpi(summary?.averageHealthScore),
    utilization: kpi(summary?.utilizationRate),
    availability: kpi(summary?.availability),
    mtbf: kpi(dto.reliability?.mtbf ?? summary?.mtbf),
    mttr: kpi(dto.reliability?.mttr ?? summary?.mttr),
    labels: (dto.healthTrend?.categories ?? []).map(monthLabel),
    healthTrend: healthShares(dto.healthTrend ?? { categories: [], series: [] }),
    categoryLabels: categories.map((c) => `${c.category}\n${Math.round(c.active)}%`),
    categoryUtilization: [
      { name: 'Active', values: categories.map((c) => num(c.active)), color: RA_COLORS.purple },
      { name: 'Idle', values: categories.map((c) => num(c.idle)), color: RA_COLORS.sky },
      { name: 'Maintenance', values: categories.map((c) => num(c.maintenance)), color: RA_COLORS.orange }
    ],
    distribution,
    ratedAssets: num(dto.scoreDistribution?.ratedAssets),
    notRated: num(dto.scoreDistribution?.notRated),
    reliability: [
      { name: 'MTBF (hrs)', values: seriesValues(dto.reliability?.trend, 'MTBF (hrs)'), color: RA_COLORS.purple, area: true },
      { name: 'MTTR (hrs)', values: seriesValues(dto.reliability?.trend, 'MTTR (hrs)'), color: RA_COLORS.blue, axis: 'right' }
    ],
    downtime: [
      { name: 'Planned', values: seriesValues(dto.downtime?.trend, 'Planned'), color: RA_COLORS.blue },
      { name: 'Unplanned', values: seriesValues(dto.downtime?.trend, 'Unplanned'), color: RA_COLORS.pink }
    ],
    downtimeHours: Math.round(num(dto.downtime?.totalHours)),
    topBottom: [...(dto.topBottom?.top ?? []), ...(dto.topBottom?.bottom ?? [])].map(toAssetRow),
    locations: (dto.locations ?? []).map(toLocationRow),
    insights: (dto.insights ?? []).map(toInsight)
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

function viewFilters(dto: ViewFiltersDto, periods: string[]): Record<string, string> {
  return {
    // Custom ranges can't be shown in the period dropdown; such views open on the default period
    period: dto.datePreset && periods.includes(dto.datePreset) ? dto.datePreset : AP_DEFAULT_PERIOD,
    organization: dto.organization ?? ALL_ORGANIZATIONS,
    location: dto.location ?? ALL_LOCATIONS,
    category: dto.category ?? ALL_CATEGORIES,
    assetType: dto.assetType ?? ALL_TYPES
  };
}

/** Asset Performance figures, filters and saved views from the Report Analytics API (/api/asset-performance). */
@Injectable()
export class AssetPerformanceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/asset-performance`;

  readonly view = signal<AssetPerformanceView>(emptyAssetPerformance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(AP_FALLBACK_PERIODS);
  readonly views = signal<ApSavedView[]>([]);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Asset Performance')));

  private query(f: ApFilters): Record<string, string | null> {
    return {
      datePreset: f.period || AP_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      assetType: pick(f.assetType, ALL_TYPES),
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
        const list = periods.length ? periods : AP_FALLBACK_PERIODS;
        this.periods.set(list);
        return { periods: list, defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : AP_DEFAULT_PERIOD };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location, Category and Asset Type values (labels; the API matches names). */
  loadFilters(): Observable<ApFilterLists> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories),
        assetTypes: optionLabels(ALL_TYPES, dto.assetTypes)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: ApFilters): Observable<AssetPerformanceView> {
    this.loading.set(true);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params: toParams(this.query(f)) }).pipe(
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
   * Compare Periods: the Healthy share and MTBF lines of the previous period (GET /health-trend and /reliability over a custom range),
   * plotted against the current months.
   */
  loadPrevious(f: ApFilters, range: { from: string; to: string }): Observable<ApPreviousTrends> {
    const params = toParams({ ...this.query(f), datePreset: 'Custom', from: range.from, to: range.to });
    return forkJoin({
      health: this.http.get<SectionDto<PerformanceSeriesDto>>(`${this.apiUrl}/health-trend`, { params }),
      reliability: this.http.get<SectionDto<ReliabilityDto>>(`${this.apiUrl}/reliability`, { params })
    }).pipe(
      map(({ health, reliability }) => ({
        healthy: healthShares(health.data)[0].values,
        mtbf: seriesValues(reliability.data.trend, 'MTBF (hrs)')
      })),
      catchError(this.fail)
    );
  }

  /** GET /assets with an insight's query (e.g. healthBelow=60 or interventionOnly=true), worst first. */
  loadAssets(f: ApFilters, query: string): Observable<{ items: ApAssetRow[]; total: number }> {
    const params = toParams({ ...this.query(f), ...parseQuery(query), sortBy: 'healthScore', sortDirection: 'asc', page: 1, pageSize: 200 });
    return this.http.get<AssetListDto>(`${this.apiUrl}/assets`, { params }).pipe(
      map((dto) => ({ items: (dto.items ?? []).map(toAssetRow), total: dto.totalCount ?? 0 })),
      catchError(this.fail)
    );
  }

  /** GET /export: the Excel workbook for the filter bar. */
  export(f: ApFilters): Observable<void> {
    const params = toParams({ ...this.query(f), format: 'xlsx' });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'asset-performance.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Assets view, then the user's own. */
  loadViews(): Observable<ApSavedView[]> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params }).pipe(
      map((rows) => {
        const list = rows.map((v) => this.toSavedView(v));
        if (!list.some((v) => v.builtIn)) list.unshift(this.allAssetsView());
        this.views.set(list);
        return list;
      }),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: ApFilters, isDefault = false): Observable<ApSavedView> {
    const body: SaveViewRequest = { ...this.toRequest(name, f, isDefault), tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => [...list, saved])),
      catchError(this.fail)
    );
  }

  /** PUT /views/{viewId}. */
  updateView(viewId: string, name: string, f: ApFilters, isDefault = false): Observable<ApSavedView> {
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

  allAssetsView(): ApSavedView {
    return {
      viewId: 'all-assets', name: ALL_ASSETS_VIEW, builtIn: true, isDefault: false,
      filters: { period: AP_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: ALL_TYPES }
    };
  }

  private toSavedView(dto: ViewDto): ApSavedView {
    return { viewId: dto.viewId, name: dto.viewName, builtIn: dto.isBuiltIn, isDefault: dto.isDefault, filters: viewFilters(dto.filters, this.periods()) };
  }

  private toRequest(name: string, f: ApFilters, isDefault: boolean): SaveViewRequest {
    return {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        category: pick(f.category, ALL_CATEGORIES),
        assetType: pick(f.assetType, ALL_TYPES),
        datePreset: f.period || AP_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      }
    };
  }
}
