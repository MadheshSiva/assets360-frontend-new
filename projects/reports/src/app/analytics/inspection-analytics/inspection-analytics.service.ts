import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import {
  InspectionFinding, InspectionView, InspectorRow, InsightCardModel, KpiFigure, SEVERITIES, emptyInspectionView
} from './inspection-analytics.model';

// ===== DTOs returned by /api/inspection-analytics =====

interface KpiDto {
  value: number | null;
  format: string;
  previousValue: number | null;
  change: number | null;
  changeUnit: string;
  trend: string;
  comparisonLabel: string;
}

interface SeriesDto {
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
}

interface CountBreakdownDto {
  total: number;
  items: { label: string; count: number; percentage: number }[];
}

interface PeriodDto {
  preset: string;
  from: string;
  to: string;
  timeZone: string;
}

interface AppliedFiltersDto {
  viewId: string | null;
  complianceTarget: number;
  dueWithinDays: number;
  repeatWindowDays: number;
}

interface FindingRowDto {
  id: string;
  findingId: string | null;
  assetRecordId: string | null;
  assetId: string | null;
  assetName: string | null;
  location: string | null;
  category: string;
  severity: string;
  description: string | null;
  raisedAt: string | null;
  dueDate: string | null;
  owner: string | null;
  status: string;
  isOverdue: boolean;
  ageDays: number | null;
  inspectionId: string | null;
}

interface InspectorDto {
  inspector: string;
  inspections: number;
  completed: number;
  avgDurationHours: number | null;
  findingRate: number | null;
  closureRate: number | null;
}

interface InsightDto {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  findings: { id: string; findingId: string | null; assetId: string | null; assetName: string | null; severity: string; category: string | null; dueDate: string | null; reasons: string[] }[];
  assets: { id: string; assetId: string | null; assetName: string | null; location: string | null; reasons: string[] }[];
  locations: string[];
  actions: string[];
  query: string;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: PeriodDto;
  summary: {
    totalInspections: KpiDto;
    completionRate: KpiDto;
    openFindings: KpiDto;
    criticalFindings: KpiDto;
    correctiveActionsDue: KpiDto;
  };
  completionTrend: SeriesDto;
  findingsBySeverity: SeriesDto;
  inspectionStatus: CountBreakdownDto;
  findingsByCategory: CountBreakdownDto;
  insights: InsightDto[];
  compliance: {
    value: number | null;
    target: number;
    meetsTarget: boolean | null;
    previousValue: number | null;
    change: number | null;
    compliantAssets: number;
    scheduledAssets: number;
    trend: SeriesDto;
  };
  repeatFindingsTrend: SeriesDto;
  openFindings: FindingRowDto[];
  openFindingsTotal: number;
  inspectors: InspectorDto[];
}

interface FindingsDto {
  items: FindingRowDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface CompareDto {
  completionTrend: SeriesDto;
  compareCompletionTrend: SeriesDto;
  comparePeriod: PeriodDto;
}

interface DashboardOption {
  value: string;
  label: string;
}

export interface InspectionFilterOptions {
  organizations: DashboardOption[];
  locations: DashboardOption[];
  assetCategories: DashboardOption[];
  assetTypes: DashboardOption[];
  inspectionTypes: DashboardOption[];
  inspectors: DashboardOption[];
}

export interface InspectionOptions {
  datePresets: string[];
  defaultDatePreset: string;
  severities: string[];
  findingSortFields: string[];
  defaultComplianceTarget: number;
  defaultDueWithinDays: number;
}

export interface InspectionSavedFilters {
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  inspectionType: string | null;
  inspector: string | null;
  datePreset: string;
  dateFrom: string | null;
  dateTo: string | null;
  timeZone: string;
}

export interface InspectionSavedView {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: InspectionSavedFilters;
  updatedAt: string | null;
}

/** Filter bar values sent to every data endpoint. Empty fields mean "all". */
export interface InspectionQuery {
  datePreset: string;
  organization?: string | null;
  location?: string | null;
  category?: string | null;
  inspectionType?: string | null;
  inspector?: string | null;
}

/** Extra /findings arguments (insight buttons, table sorting, "View all"). */
export interface FindingsQuery {
  /** Matches finding ID, asset ID / name, location, owner or description */
  search?: string;
  severity?: string;
  dueWithinDays?: number;
  repeatOnly?: boolean;
  overdueOnly?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface FindingsPage {
  rows: InspectionFinding[];
  total: number;
}

/** Most rows the API returns in one page (InspectionAnalyticsOptions.MaxPageSize). */
export const MAX_PAGE_SIZE = 200;

// ===== Mapping =====

const DAY_MS = 86_400_000;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "Jan 2026" → "Jan\n2026" so the axis label wraps like the rest of the page. */
function axisLabels(series: SeriesDto | null | undefined): string[] {
  return (series?.categories ?? []).map((c) => c.replace(' ', '\n'));
}

function line(series: SeriesDto | null | undefined, name: string): number[] {
  const found = series?.series?.find((s) => s.name === name);
  return (found?.values ?? axisLabels(series).map(() => 0)).map((v) => v ?? 0);
}

function kpi(dto: KpiDto | null | undefined): KpiFigure {
  return {
    value: dto?.value ?? null,
    previous: dto?.previousValue ?? null,
    change: dto?.change ?? null,
    changeUnit: dto?.changeUnit ?? 'percent',
    trend: dto?.trend ?? 'flat'
  };
}

function toFinding(dto: FindingRowDto): InspectionFinding {
  const dueMs = dto.dueDate ? new Date(dto.dueDate).getTime() : NaN;
  return {
    key: dto.id,
    id: dto.findingId || dto.id,
    assetId: dto.assetId ?? '—',
    assetName: dto.assetName ?? '—',
    site: dto.location ?? '—',
    findingType: dto.category ?? '—',
    severity: dto.severity,
    description: dto.description ?? '',
    raised: formatDate(dto.raisedAt),
    dueInDays: isNaN(dueMs) ? null : Math.floor((dueMs - Date.now()) / DAY_MS),
    due: formatDate(dto.dueDate),
    owner: dto.owner ?? '—',
    status: dto.status,
    overdue: dto.isOverdue,
    ageDays: dto.ageDays
  };
}

function toInspector(dto: InspectorDto): InspectorRow {
  return {
    name: dto.inspector,
    inspections: dto.inspections,
    completed: dto.completed,
    avgHours: dto.avgDurationHours,
    findingRate: dto.findingRate,
    closureRate: dto.closureRate
  };
}

function toInsight(dto: InsightDto): InsightCardModel {
  return {
    key: dto.key,
    severity: dto.severity,
    title: dto.title,
    message: dto.message,
    count: dto.count,
    findings: (dto.findings ?? []).map((f) => ({
      id: f.findingId || f.id,
      assetId: f.assetId ?? '—',
      assetName: f.assetName ?? '—',
      severity: f.severity,
      category: f.category ?? '—',
      due: formatDate(f.dueDate),
      reasons: (f.reasons ?? []).join(', ')
    })),
    assets: (dto.assets ?? []).map((a) => ({
      assetId: a.assetId || a.id,
      assetName: a.assetName ?? '—',
      site: a.location ?? '—',
      reasons: (a.reasons ?? []).join(', ')
    })),
    locations: dto.locations ?? [],
    actions: dto.actions ?? [],
    query: dto.query ?? ''
  };
}

function toView(dto: OverviewDto): InspectionView {
  const empty = emptyInspectionView();
  const trend = dto.completionTrend;
  const severityNames = (dto.findingsBySeverity?.series ?? []).map((s) => s.name);
  const status = (dto.inspectionStatus?.items ?? []).map((i) => ({ name: i.label, value: i.count }));
  return {
    generatedAt: new Date(dto.generatedAt),
    periodLabel: dto.period ? `${formatDate(dto.period.from)} – ${formatDate(dto.period.to)}` : '',
    labels: axisLabels(trend),
    planned: line(trend, 'Planned'),
    completed: line(trend, 'Completed'),
    overdue: line(trend, 'Overdue'),
    completedPrevious: [],
    status,
    statusTotal: dto.inspectionStatus?.total ?? 0,
    kpis: {
      total: kpi(dto.summary?.totalInspections),
      rate: kpi(dto.summary?.completionRate),
      open: kpi(dto.summary?.openFindings),
      critical: kpi(dto.summary?.criticalFindings),
      due: kpi(dto.summary?.correctiveActionsDue)
    },
    // Keep the usual Critical → Low order, then anything else the API reports
    severity: [...SEVERITIES.filter((s) => severityNames.includes(s)), ...severityNames.filter((s) => !SEVERITIES.includes(s as never))]
      .map((name) => ({ name, values: line(dto.findingsBySeverity, name) })),
    categories: (dto.findingsByCategory?.items ?? []).map((i) => i.label),
    byCategory: (dto.findingsByCategory?.items ?? []).map((i) => i.count),
    compliance: {
      value: dto.compliance?.value ?? null,
      target: dto.compliance?.target ?? empty.compliance.target,
      change: dto.compliance?.change ?? null,
      compliantAssets: dto.compliance?.compliantAssets ?? 0,
      scheduledAssets: dto.compliance?.scheduledAssets ?? 0,
      series: line(dto.compliance?.trend, 'Compliance (%)')
    },
    repeated: line(dto.repeatFindingsTrend, 'Repeated Defects'),
    resolved: line(dto.repeatFindingsTrend, 'Resolved Defects'),
    findings: (dto.openFindings ?? []).map(toFinding),
    findingsTotal: dto.openFindingsTotal ?? 0,
    inspectors: (dto.inspectors ?? []).map(toInspector),
    insights: (dto.insights ?? []).map(toInsight),
    dueWithinDays: dto.filters?.dueWithinDays ?? empty.dueWithinDays
  };
}

function errorMessage(err: HttpErrorResponse): string {
  const errors = err.error?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (err.status === 0) return 'The inspection analytics service could not be reached.';
  if (err.status === 401) return 'Sign in again to use saved views.';
  if (err.status === 404) return 'This view no longer exists.';
  return err.error?.message || err.error?.title || 'The inspection analytics service could not be reached.';
}

function fail(err: HttpErrorResponse): Observable<never> {
  return throwError(() => new Error(errorMessage(err)));
}

/** Reports & Analytics > Inspection Analytics, backed by /api/inspection-analytics. */
@Injectable({ providedIn: 'root' })
export class InspectionAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/inspection-analytics`;

  readonly loading = signal(false);
  readonly options = signal<InspectionOptions | null>(null);
  readonly filterOptions = signal<InspectionFilterOptions | null>(null);
  /** Built-in "All Inspections" first, then the user's saved views */
  readonly views = signal<InspectionSavedView[]>([]);

  /** GET /options: date presets, severities, sort fields and defaults. */
  loadOptions(): Observable<InspectionOptions> {
    return this.http.get<InspectionOptions>(`${this.apiUrl}/options`).pipe(
      map((o) => {
        this.options.set(o);
        return o;
      }),
      catchError(fail)
    );
  }

  /** GET /filters: Organization / Location / Asset Category / Inspection Type / Inspector dropdowns. */
  loadFilters(): Observable<InspectionFilterOptions> {
    return this.http.get<InspectionFilterOptions>(`${this.apiUrl}/filters`, { params: this.tenantParams() }).pipe(
      map((f) => {
        const list = (v: DashboardOption[] | null | undefined) => v ?? [];
        const value: InspectionFilterOptions = {
          organizations: list(f.organizations),
          locations: list(f.locations),
          assetCategories: list(f.assetCategories),
          assetTypes: list(f.assetTypes),
          inspectionTypes: list(f.inspectionTypes),
          inspectors: list(f.inspectors)
        };
        this.filterOptions.set(value);
        return value;
      }),
      catchError(fail)
    );
  }

  /** GET /overview: every widget for the filter bar in one call. */
  overview(query: InspectionQuery): Observable<InspectionView> {
    this.loading.set(true);
    // The tables show every inspector and sort findings on the server, so ask for all inspectors and the first page of findings
    const params = this.params(query).set('findingsSize', 10).set('inspectorLimit', 100);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params }).pipe(
      map((dto) => {
        this.loading.set(false);
        return toView(dto);
      }),
      catchError((err: HttpErrorResponse) => {
        this.loading.set(false);
        return fail(err);
      })
    );
  }

  /** GET /findings: open findings, filtered / sorted / paged on the server. */
  findings(query: InspectionQuery, extra: FindingsQuery = {}): Observable<FindingsPage> {
    let params = this.params(query);
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<FindingsDto>(`${this.apiUrl}/findings`, { params }).pipe(
      map((dto) => ({ rows: (dto.items ?? []).map(toFinding), total: dto.totalCount ?? 0 })),
      catchError(fail)
    );
  }

  /** GET /compare-periods: completed inspections per month in the previous period of the same length. */
  compareCompleted(query: InspectionQuery): Observable<{ completed: number[]; label: string }> {
    return this.http.get<CompareDto>(`${this.apiUrl}/compare-periods`, { params: this.params(query) }).pipe(
      map((dto) => ({
        completed: line(dto.compareCompletionTrend, 'Completed'),
        label: dto.comparePeriod ? `${formatDate(dto.comparePeriod.from)} – ${formatDate(dto.comparePeriod.to)}` : 'previous period'
      })),
      catchError(fail)
    );
  }

  /** GET /export: Excel workbook with a sheet per section. */
  export(query: InspectionQuery): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export`, { params: this.params(query).set('format', 'xlsx'), responseType: 'blob' }).pipe(
      catchError((err: HttpErrorResponse) => fail(err))
    );
  }

  // ===== Saved views =====

  loadViews(): Observable<InspectionSavedView[]> {
    return this.http.get<InspectionSavedView[]>(`${this.apiUrl}/views`, { params: this.tenantParams() }).pipe(
      map((list) => {
        this.views.set(list ?? []);
        return this.views();
      }),
      catchError(fail)
    );
  }

  /** POST /views with the current filter bar. */
  createView(name: string, filters: InspectionSavedFilters, isDefault = false): Observable<InspectionSavedView> {
    const body = {
      viewName: name.trim(),
      isDefault,
      filters: this.filtersBody(filters),
      createdBy: this.auth.getUserEmail(),
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<InspectionSavedView>(`${this.apiUrl}/views`, body).pipe(
      map((saved) => {
        this.views.update((list) => [...list, saved]);
        return saved;
      }),
      catchError(fail)
    );
  }

  /** PUT /views/{viewId}: rename / replace the saved filters. */
  updateView(viewId: string, name: string, filters: InspectionSavedFilters, isDefault?: boolean): Observable<InspectionSavedView> {
    const body = { viewName: name.trim(), isDefault: isDefault ?? null, filters: this.filtersBody(filters), updatedBy: this.auth.getUserEmail() };
    return this.http.put<InspectionSavedView>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`, body).pipe(
      map((saved) => {
        this.views.update((list) => list.map((v) => (v.viewId === saved.viewId ? saved : v)));
        return saved;
      }),
      catchError(fail)
    );
  }

  /** DELETE /views/{viewId}. */
  deleteView(viewId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`).pipe(
      map(() => this.views.update((list) => list.filter((v) => v.viewId !== viewId))),
      catchError(fail)
    );
  }

  // ===== Helpers =====

  private tenantParams(): HttpParams {
    return new HttpParams().set('tenantId', environment.tenantId).set('clientId', environment.clientId);
  }

  private params(query: InspectionQuery): HttpParams {
    let params = this.tenantParams().set('datePreset', query.datePreset).set('timeZone', browserTimeZone());
    const add = (key: string, value: string | null | undefined) => {
      if (value) params = params.set(key, value);
    };
    add('organization', query.organization);
    add('location', query.location);
    add('category', query.category);
    add('inspectionType', query.inspectionType);
    add('inspector', query.inspector);
    return params;
  }

  private filtersBody(f: InspectionSavedFilters) {
    return {
      organization: f.organization,
      location: f.location,
      category: f.category,
      assetType: f.assetType,
      inspectionType: f.inspectionType,
      inspector: f.inspector,
      datePreset: f.datePreset,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      timeZone: f.timeZone
    };
  }
}

/** The viewer's IANA time zone, so months and "today" match their calendar (UTC when unknown). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
