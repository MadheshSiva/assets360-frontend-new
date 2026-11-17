import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import {
  DEFAULT_COPY_FIELDS, NOT_SCHEDULED, RA_MODULES, SCHEDULE_TIME_ZONE, STANDARD_COPY_FIELDS, blankDefinition
} from './custom-reports.data';
import {
  AGGREGATE_FUNCTIONS, COUNT_KEY, EMPTY_CATALOG, aggregateLabel, aggregatedFields, apiColumnKey, chartAxes, filterError, isNumeric,
  kindOf, listValues, needsList, needsNoValue, sourceKeyFor, sourceOf, uiColumnKey
} from './custom-reports.engine';
import {
  Aggregate, CalcField, CalcOperator, CustomReport, CustomReportStats, DataSource, FieldDef, FieldGroup, FilterOperator, PreviewColumn,
  PreviewResult, ReportCatalog, ReportDefinition, ReportOwner, ReportRow, ReportScheduleDto, ReportStatus, ReportVisibility, VizType
} from './custom-reports.model';

// ----- API shapes (/api/custom-reports) -----

interface DataSourceDto { key: string; label: string; description: string; required: boolean; fieldCount: number }
interface FieldDto { key: string; label: string; dataType: string; dataSource: string; filterOperators: string[] }
interface FieldGroupDto { group: string; fields: FieldDto[] }

interface CalculatedFieldDto {
  key: string; label: string; leftOperand: string; operator: string; rightOperand: string | null; dataType: string; decimals: number;
}
interface FilterDto { field: string; operator: string; value: string | null; values: string[] | null; valueTo: string | null }
interface AggregationDto { field: string | null; function: string; label: string | null }
interface SortDto { field: string; direction: string }
interface VisualizationDto {
  chartType: string; title: string | null; xAxisField: string | null; yAxisField: string | null; defaultView: string;
  showDataLabels: boolean; maxCategories: number;
}
interface DefinitionDto {
  dataSources: string[]; selectedFields: string[]; calculatedFields: CalculatedFieldDto[]; filters: FilterDto[]; filterLogic: string;
  groupBy: string[]; aggregations: AggregationDto[]; sorts: SortDto[]; rowLimit: number; visualization: VisualizationDto | null;
}

interface CustomReportDto {
  reportId: string; reportName: string; description: string | null; module: string; ownerId: string | null; ownerName: string | null;
  visibility: string; status: string | null; currentStep: number; isFavorite: boolean; canEdit: boolean; definition: DefinitionDto | null;
  schedule: ReportScheduleDto | null; scheduleSummary: string | null; createdBy: string | null; createdAt: string | null;
  updatedBy: string | null; updatedAt: string | null;
}

interface CustomReportListItemDto {
  reportId: string; reportName: string; description: string | null; ownerId: string | null; ownerName: string | null; module: string;
  status: string | null; visibility: string; chartType: string; isFavorite: boolean; updatedAt: string | null; scheduleSummary: string | null;
}

interface ListResponseDto { items: CustomReportListItemDto[]; totalCount: number; page: number; pageSize: number }
interface SummaryDto { customReports: number; published: number; scheduled: number; drafts: number }
interface OwnerDto { ownerId: string; ownerName: string | null }
interface OptionsDto { modules: string[]; lastUpdated: string[]; statuses: string[] }

interface ColumnDto { key: string; label: string; dataType: string }
interface PreviewDto {
  columns: ColumnDto[]; rows: ReportRow[]; totalRows: number; rowLimit: number; isTruncated: boolean; defaultView: string;
  chart: { chartType: string; title: string; xAxisField: string; yAxisField: string; points: { label: string; value: number }[] } | null;
}

interface ImportResponseDto {
  created: CustomReportListItemDto[];
  failed: { index: number; reportName: string | null; errors: Record<string, string[]> }[];
}

/** Body of POST / PUT /api/custom-reports (POST also takes tenantId / clientId). */
interface ReportRequest {
  reportName: string;
  description: string | null;
  module: string;
  visibility: string;
  currentStep: number;
  definition: DefinitionRequest;
  schedule: ReportScheduleDto | null;
  tenantId?: string;
  clientId?: string;
}

interface DefinitionRequest {
  dataSources: string[];
  selectedFields: string[];
  calculatedFields: CalculatedFieldDto[];
  filters: { field: string; operator: string; value: string | null; values: string[]; valueTo: string | null }[];
  filterLogic: string;
  groupBy: string[];
  aggregations: AggregationDto[];
  sorts: SortDto[];
  rowLimit: number;
  visualization: VisualizationDto;
}

/** Library filters, sent as query parameters. */
export interface LibraryQuery {
  search: string;
  ownerId: string;
  module: string;
  status: string;
  lastUpdated: string;
  sortBy: 'updatedAt' | 'reportName';
}

export interface ImportResult {
  created: number;
  failed: { name: string; message: string }[];
}

// ----- Mapping -----

const CALC_TO_API: Record<CalcOperator, string> = { '+': '+', '-': '-', '×': '*', '÷': '/' };
const CALC_FROM_API: Record<string, CalcOperator> = { '+': '+', '-': '-', '*': '×', '/': '÷' };
const AGGREGATE_FROM_API: Record<string, Aggregate> = { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max' };
const VIZ_FROM_API: Record<string, VizType> = {
  'Table': 'Table', 'Bar': 'Bar', 'Horizontal bar': 'Bar', 'Line': 'Line', 'Area': 'Line', 'Pie': 'Donut', 'Donut': 'Donut'
};
const STATUSES: ReportStatus[] = ['Draft', 'Published', 'Scheduled'];
const LIBRARY_PAGE_SIZE = 200;
const LIBRARY_TIME_ZONE = 'Asia/Dubai';
const PREVIEW_MAX = 500;

function toApiVisibility(v: ReportVisibility): string {
  return v === 'Only me' ? 'Private' : v;
}

function fromApiVisibility(v: string | null | undefined): ReportVisibility {
  if (v === 'Private') return 'Only me';
  return v === 'Organization' ? 'Organization' : 'My team';
}

function toStatus(s: string | null | undefined): ReportStatus {
  return STATUSES.includes(s as ReportStatus) ? (s as ReportStatus) : 'Draft';
}

/** UTC ISO → 'YYYY-MM-DDTHH:mm' in Asia/Dubai (UTC+4), the format the library shows. */
function toDubai(iso: string | null | undefined): string {
  const t = iso ? new Date(iso).getTime() : Date.now();
  return new Date((Number.isNaN(t) ? Date.now() : t) + 4 * 3600_000).toISOString().slice(0, 16);
}

/** Current date-time in Asia/Dubai (UTC+4) as 'YYYY-MM-DDTHH:mm'. */
export function dubaiNow(): string {
  return toDubai(null);
}

export function cloneReport(r: CustomReport): CustomReport {
  return JSON.parse(JSON.stringify(r)) as CustomReport;
}

/** First ValidationProblem error, else message / title, else a status-based fallback. */
function errorMessage(err: HttpErrorResponse): string {
  const body = typeof err.error === 'object' && err.error !== null && !(err.error instanceof Blob) ? err.error : null;
  const errors = body?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (body?.message || body?.title) return body.message || body.title;
  if (err.status === 404) return 'This custom report no longer exists.';
  if (err.status === 403) return 'Only the report owner can change this report.';
  if (err.status === 401) return 'Sign in again to continue.';
  return 'The reporting service could not be reached.';
}

function fail(err: HttpErrorResponse): Observable<never> {
  return throwError(() => new Error(errorMessage(err)));
}

/** Reads the file name from Content-Disposition (may be hidden by CORS), else uses the fallback. */
function fileNameOf(res: HttpResponse<Blob>, fallback: string): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parses a schedule preset ("Weekly – Monday, 08:00") into the API's schedule. */
function parseSchedule(text: string): ReportScheduleDto | null {
  if (!text || text === NOT_SCHEDULED) return null;
  const base = { dayOfWeek: null, dayOfMonth: null, timeZone: SCHEDULE_TIME_ZONE, recipients: [] };
  let m = /^Daily – (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: 'Daily', time: m[1] };
  m = /^Weekly – (\w+), (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: 'Weekly', dayOfWeek: m[1], time: m[2] };
  m = /^(Monthly|Quarterly) – (\d+)\w* day, (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: m[1], dayOfMonth: Number(m[2]), time: m[3] };
  return null;
}

function sameSchedule(a: ReportScheduleDto, b: ReportScheduleDto): boolean {
  return a.frequency === b.frequency && (a.dayOfWeek ?? null) === (b.dayOfWeek ?? null)
    && (a.dayOfMonth ?? null) === (b.dayOfMonth ?? null) && (a.time ?? '08:00') === (b.time ?? '08:00');
}

/** Custom reports, stored and run by the Report Analytics API (/api/custom-reports). */
@Injectable({ providedIn: 'root' })
export class CustomReportsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/custom-reports`;

  /** Library rows for the current filters. */
  readonly reports = signal<CustomReport[]>([]);
  readonly stats = signal<CustomReportStats>({ total: 0, published: 0, scheduled: 0, drafts: 0 });
  readonly owners = signal<ReportOwner[]>([]);
  readonly modules = signal<string[]>(RA_MODULES);
  readonly lastUpdatedOptions = signal<string[]>(['Any time', 'Today', 'Last 7 days', 'Last 30 days', 'Last 90 days']);
  /** Data sources and fields from the builder endpoints. */
  readonly catalog = signal<ReportCatalog>(EMPTY_CATALOG);
  readonly loading = signal(false);

  // ----- Page furniture -----

  /** GET /options (modules, Last Updated ranges). */
  loadOptions(): Observable<void> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((o) => {
        if (o.modules?.length) this.modules.set(o.modules);
        if (o.lastUpdated?.length) this.lastUpdatedOptions.set(o.lastUpdated);
      }),
      catchError(fail)
    );
  }

  /** GET /data-sources + GET /fields → source cards and the field tree. */
  loadCatalog(): Observable<ReportCatalog> {
    return forkJoin({
      sources: this.http.get<DataSourceDto[]>(`${this.apiUrl}/data-sources`),
      groups: this.http.get<FieldGroupDto[]>(`${this.apiUrl}/fields`)
    }).pipe(
      map(({ sources, groups }) => {
        const catalog = buildCatalog(sources, groups);
        this.catalog.set(catalog);
        return catalog;
      }),
      catchError(fail)
    );
  }

  /** GET /summary (the four cards). */
  loadSummary(): Observable<CustomReportStats> {
    return this.http.get<SummaryDto>(`${this.apiUrl}/summary`, { params: this.scopeParams() }).pipe(
      map((s) => {
        const stats = { total: s.customReports, published: s.published, scheduled: s.scheduled, drafts: s.drafts };
        this.stats.set(stats);
        return stats;
      }),
      catchError(fail)
    );
  }

  /** GET /owners (Owner filter). */
  loadOwners(): Observable<ReportOwner[]> {
    return this.http.get<OwnerDto[]>(`${this.apiUrl}/owners`, { params: this.scopeParams() }).pipe(
      map((rows) => {
        const owners = rows.map((o) => ({ id: o.ownerId, name: o.ownerName || o.ownerId })).sort((a, b) => a.name.localeCompare(b.name));
        this.owners.set(owners);
        return owners;
      }),
      catchError(fail)
    );
  }

  // ----- Library -----

  /** GET / with the library filters (one page of up to 200 reports). */
  loadLibrary(query: LibraryQuery): Observable<CustomReport[]> {
    this.loading.set(true);
    const params = this.libraryParams(query).set('page', 1).set('pageSize', LIBRARY_PAGE_SIZE);
    return this.http.get<ListResponseDto>(this.apiUrl, { params }).pipe(
      map((res) => {
        const list = (res.items ?? []).map((item) => this.fromListItem(item));
        this.reports.set(list);
        this.loading.set(false);
        return list;
      }),
      catchError((err: HttpErrorResponse) => {
        this.loading.set(false);
        return fail(err);
      })
    );
  }

  /** GET /{id}: the full report with its definition. */
  get(id: string): Observable<CustomReport> {
    return this.http.get<CustomReportDto>(`${this.apiUrl}/${encodeURIComponent(id)}`).pipe(
      map((dto) => this.fromDto(dto)),
      catchError(fail)
    );
  }

  isNameTaken(name: string, exceptId = ''): boolean {
    // The API does not enforce unique names; this checks the loaded library only.
    const n = name.trim().toLowerCase();
    return this.reports().some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === n);
  }

  /** "Name (copy)", "Name (copy 2)"… until free. */
  uniqueName(name: string, suffix = 'copy'): string {
    if (!this.isNameTaken(name)) return name;
    let i = 1;
    let candidate = `${name} (${suffix})`;
    while (this.isNameTaken(candidate)) candidate = `${name} (${suffix} ${++i})`;
    return candidate;
  }

  blank(): CustomReport {
    return {
      ...blankDefinition(sourceKeyFor(this.catalog(), ['assets'])),
      id: '',
      name: '',
      description: '',
      owner: '',
      ownerId: '',
      module: 'Assets',
      status: 'Draft',
      favourite: false,
      updatedAt: dubaiNow(),
      visibility: 'My team',
      schedule: NOT_SCHEDULED,
      scheduleDetail: null,
      canEdit: true,
      currentStep: 1,
      loaded: true
    };
  }

  /** POST / (new report, always a Draft) or PUT /{id}. Returns the stored report. */
  save(report: CustomReport, step: number): Observable<CustomReport> {
    const body = this.toRequest(report, step);
    const request$ = report.id
      ? this.http.put<CustomReportDto>(`${this.apiUrl}/${encodeURIComponent(report.id)}`, body)
      : this.http.post<CustomReportDto>(this.apiUrl, { ...body, tenantId: environment.tenantId, clientId: environment.clientId });
    return request$.pipe(map((dto) => this.store(dto)), catchError(fail));
  }

  /** POST /{id}/publish: Published, or Scheduled when the report has a schedule. */
  publish(id: string): Observable<CustomReport> {
    return this.http.post<CustomReportDto>(`${this.apiUrl}/${encodeURIComponent(id)}/publish`, null).pipe(
      map((dto) => this.store(dto)),
      catchError(fail)
    );
  }

  /** POST /{id}/unpublish: back to Draft (a schedule is kept but stops running). */
  unpublish(id: string): Observable<CustomReport> {
    return this.http.post<CustomReportDto>(`${this.apiUrl}/${encodeURIComponent(id)}/unpublish`, null).pipe(
      map((dto) => this.store(dto)),
      catchError(fail)
    );
  }

  /** POST /{id}/duplicate: a new Draft owned by the current user. */
  duplicate(id: string, name: string): Observable<CustomReport> {
    return this.http.post<CustomReportDto>(`${this.apiUrl}/${encodeURIComponent(id)}/duplicate`, { reportName: name }).pipe(
      map((dto) => this.store(dto)),
      catchError(fail)
    );
  }

  /** PUT /{id}/favorite. Favourites are per user, so this needs a signed-in user. */
  setFavourite(id: string, favourite: boolean): Observable<void> {
    return this.http.put<unknown>(`${this.apiUrl}/${encodeURIComponent(id)}/favorite`, { isFavorite: favourite }).pipe(
      map(() => {
        this.reports.update((list) => list.map((r) => (r.id === id ? { ...r, favourite } : r)));
      }),
      catchError(fail)
    );
  }

  /** DELETE /{id}. */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`).pipe(
      map(() => {
        this.reports.update((list) => list.filter((r) => r.id !== id));
      }),
      catchError(fail)
    );
  }

  // ----- Import / export -----

  /** GET /export?format=json with the library filters: report templates that Import Template accepts. */
  exportLibrary(query: LibraryQuery): Observable<string> {
    const params = this.libraryParams(query).set('format', 'json');
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => {
        const name = fileNameOf(res, `custom-reports-${dubaiNow().slice(0, 10)}.json`);
        download(res.body ?? new Blob(), name);
        return name;
      }),
      catchError((err: HttpErrorResponse) => this.blobError(err))
    );
  }

  /** GET /{id}/export?format=xlsx|csv: the report's data, every row up to its row limit. */
  exportData(report: CustomReport, format: 'xlsx' | 'csv'): Observable<string> {
    const params = new HttpParams().set('format', format);
    return this.http.get(`${this.apiUrl}/${encodeURIComponent(report.id)}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => {
        const name = fileNameOf(res, `${report.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'custom-report'}.${format}`);
        download(res.body ?? new Blob(), name);
        return name;
      }),
      catchError((err: HttpErrorResponse) => this.blobError(err))
    );
  }

  /** POST /import (multipart): each template becomes a Draft. */
  importTemplates(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResponseDto>(`${this.apiUrl}/import`, form).pipe(
      map((res) => ({
        created: res.created?.length ?? 0,
        failed: (res.failed ?? []).map((f) => ({
          name: f.reportName || `Template ${f.index + 1}`,
          message: Object.values(f.errors ?? {})[0]?.[0] ?? 'Invalid template'
        }))
      })),
      catchError(fail)
    );
  }

  // ----- Preview -----

  /** POST /preview: runs an unsaved definition against live data. */
  preview(def: ReportDefinition, limit: number): Observable<PreviewResult> {
    const catalog = this.catalog();
    const body = {
      definition: toDefinitionRequest(catalog, def, true),
      limit: Math.max(1, Math.min(limit, PREVIEW_MAX)),
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<PreviewDto>(`${this.apiUrl}/preview`, body).pipe(
      map((res) => toPreview(res, !!def.groupBy)),
      catchError(fail)
    );
  }

  // ----- Standard Reports > "Duplicate to custom report" -----

  /** Creates a Draft from a standard report (POST /). */
  createFromStandard(input: { name: string; module: string; description: string }): Observable<CustomReport> {
    const preset = STANDARD_COPY_FIELDS[input.module] ?? DEFAULT_COPY_FIELDS;
    const report = this.blank();
    report.name = this.uniqueName(input.name.trim() || 'Untitled report');
    report.description = input.description;
    report.module = this.modules().includes(input.module) ? input.module : 'Assets';
    report.sourceKey = sourceKeyFor(this.catalog(), preset.sources);
    // Start with a few fields of the source so the copy previews straight away
    report.fields = [...preset.fields];
    return this.save(report, 1);
  }

  /** Kept for Standard Reports, which expects the final name right away; the draft is created in the background. */
  addFromStandard(input: { name: string; module: string; description: string }): string {
    const name = this.uniqueName(input.name.trim() || 'Untitled report');
    this.createFromStandard({ ...input, name }).subscribe({
      next: () => this.loadSummary().subscribe({ error: () => undefined }),
      error: (e: Error) => console.error('Copy to Custom Reports failed:', e.message)
    });
    return name;
  }

  // ----- Helpers -----

  private scopeParams(): HttpParams {
    return new HttpParams().set('tenantId', environment.tenantId).set('clientId', environment.clientId);
  }

  private libraryParams(q: LibraryQuery): HttpParams {
    let p = this.scopeParams().set('timeZone', LIBRARY_TIME_ZONE).set('sortBy', q.sortBy);
    p = p.set('sortDirection', q.sortBy === 'reportName' ? 'asc' : 'desc');
    if (q.search.trim()) p = p.set('search', q.search.trim());
    if (q.ownerId) p = p.set('owner', q.ownerId);
    if (q.module) p = p.set('module', q.module);
    if (q.status) p = p.set('status', q.status);
    if (q.lastUpdated && q.lastUpdated !== 'Any time') p = p.set('lastUpdated', q.lastUpdated);
    return p;
  }

  /** Error bodies of blob requests arrive as a Blob; read the JSON inside for the message. */
  private blobError(err: HttpErrorResponse): Observable<never> {
    if (!(err.error instanceof Blob)) return fail(err);
    return new Observable<never>((sub) => {
      err.error.text().then(
        (text: string) => {
          let body: unknown = null;
          try { body = JSON.parse(text); } catch { /* not JSON */ }
          sub.error(new Error(errorMessage(new HttpErrorResponse({ error: body, status: err.status }))));
        },
        () => sub.error(new Error(errorMessage(err)))
      );
    });
  }

  /** Maps a saved report and puts it into the loaded library. */
  private store(dto: CustomReportDto): CustomReport {
    const saved = this.fromDto(dto);
    this.reports.update((list) =>
      list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list]
    );
    return saved;
  }

  private toRequest(report: CustomReport, step: number): ReportRequest {
    const catalog = this.catalog();
    return {
      reportName: report.name.trim(),
      description: report.description.trim() || null,
      module: report.module || sourceOf(catalog, report.sourceKey).module,
      visibility: toApiVisibility(report.visibility),
      currentStep: Math.max(1, Math.min(6, step)),
      definition: toDefinitionRequest(catalog, report, false),
      schedule: this.toSchedule(report)
    };
  }

  /** Keeps the stored schedule (time zone, recipients) when the preset is unchanged. */
  private toSchedule(report: CustomReport): ReportScheduleDto | null {
    const parsed = parseSchedule(report.schedule);
    if (!parsed) return null;
    const stored = report.scheduleDetail;
    if (stored && sameSchedule(stored, parsed)) return { ...stored, nextRunAt: undefined };
    return { ...parsed, recipients: stored?.recipients ?? [] };
  }

  private fromListItem(item: CustomReportListItemDto): CustomReport {
    return {
      ...blankDefinition(sourceKeyFor(this.catalog(), ['assets'])),
      viz: VIZ_FROM_API[item.chartType] ?? 'Table',
      id: item.reportId,
      name: item.reportName,
      description: item.description ?? '',
      owner: item.ownerName ?? '—',
      ownerId: item.ownerId ?? '',
      module: item.module,
      status: toStatus(item.status),
      favourite: item.isFavorite,
      updatedAt: toDubai(item.updatedAt),
      visibility: fromApiVisibility(item.visibility),
      schedule: item.scheduleSummary ?? NOT_SCHEDULED,
      scheduleDetail: null,
      // The list does not say; GET /{id} does when the report is opened
      canEdit: true,
      currentStep: 1,
      loaded: false
    };
  }

  private fromDto(dto: CustomReportDto): CustomReport {
    return {
      ...fromDefinition(this.catalog(), dto.definition),
      id: dto.reportId,
      name: dto.reportName,
      description: dto.description ?? '',
      owner: dto.ownerName ?? dto.createdBy ?? '—',
      ownerId: dto.ownerId ?? '',
      module: dto.module,
      status: toStatus(dto.status),
      favourite: dto.isFavorite,
      updatedAt: toDubai(dto.updatedAt ?? dto.createdAt),
      visibility: fromApiVisibility(dto.visibility),
      schedule: dto.scheduleSummary ?? NOT_SCHEDULED,
      scheduleDetail: dto.schedule,
      canEdit: dto.canEdit,
      currentStep: dto.currentStep || 1,
      loaded: true
    };
  }
}

// ----- Catalog -----

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

/** Source cards: the required source alone, then with each combination of the optional ones. */
function buildCatalog(sources: DataSourceDto[], groupDtos: FieldGroupDto[]): ReportCatalog {
  const groups: FieldGroup[] = groupDtos.map((g) => ({
    key: slug(g.group),
    label: g.group,
    fields: g.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: kindOf(f.dataType),
      group: slug(g.group),
      dataSource: f.dataSource,
      operators: f.filterOperators as FilterOperator[]
    }))
  }));
  const fields: FieldDef[] = groups.flatMap((g) => g.fields);

  const required = sources.filter((s) => s.required);
  const optional = sources.filter((s) => !s.required);
  const cards: DataSource[] = [];
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const extra = optional.filter((_, i) => mask & (1 << i));
    const parts = [...required, ...extra];
    if (!parts.length) continue;
    const keys = parts.map((p) => p.key);
    const keySet = new Set(keys);
    cards.push({
      key: keys.join('+'),
      label: parts.map((p) => p.label).join(' + '),
      // Library module: the joined module when exactly one is added, else Assets
      module: extra.length === 1 ? extra[0].label : 'Assets',
      groups: groups.filter((g) => g.fields.some((f) => keySet.has(f.dataSource))).map((g) => g.key),
      description: extra.length ? `${parts[0].label} joined with ${extra.map((e) => e.description.charAt(0).toLowerCase() + e.description.slice(1)).join('; ')}.` : `${parts[0].description}.`,
      sources: keys,
      fieldCount: parts.reduce((n, p) => n + p.fieldCount, 0)
    });
  }
  return { sources: cards, groups, fields };
}

// ----- Definition mapping -----

function toDefinitionRequest(catalog: ReportCatalog, def: ReportDefinition, forPreview: boolean): DefinitionRequest {
  const grouped = !!def.groupBy;
  const filters = def.filters
    // The preview skips incomplete filters; a save sends every filter with a field so the API can report problems
    .filter((f) => (forPreview ? !filterError(catalog, def, f) : !!f.field))
    .map((f) => ({
      field: f.field,
      operator: f.op,
      value: needsNoValue(f.op) || needsList(f.op) ? null : f.value.trim(),
      values: needsList(f.op) ? listValues(f.value) : [],
      valueTo: f.op === 'between' ? (f.valueTo ?? '').trim() : null
    }));

  const fn = AGGREGATE_FUNCTIONS[def.aggregate];
  const aggregations: AggregationDto[] = grouped
    ? [
        { field: null, function: 'count', label: 'Records' },
        ...aggregatedFields(catalog, def).map((f) => ({ field: f.key, function: fn, label: aggregateLabel(f.label, def.aggregate) }))
      ]
    : [];

  const sortKey = def.sortBy ? apiColumnKey(def, def.sortBy) : '';
  const axes = chartAxes(catalog, def);
  const charted = def.viz !== 'Table' && !!axes;
  // An incomplete chart previews as a table; a save keeps the chart type so the API can say what is missing
  const chartType = charted || !forPreview ? def.viz : 'Table';

  return {
    dataSources: sourceOf(catalog, def.sourceKey).sources,
    selectedFields: def.fields.filter((k) => k !== COUNT_KEY),
    calculatedFields: def.calcFields.map((c: CalcField) => ({
      key: c.key, label: c.label, leftOperand: c.left, operator: CALC_TO_API[c.op], rightOperand: c.right, dataType: 'number', decimals: 2
    })),
    filters,
    filterLogic: def.filterLogic,
    groupBy: grouped ? [def.groupBy] : [],
    aggregations,
    sorts: sortKey ? [{ field: sortKey, direction: def.sortDir }] : [],
    rowLimit: def.rowLimit,
    visualization: {
      chartType,
      title: null,
      xAxisField: charted && axes ? apiColumnKey(def, axes.x) : null,
      yAxisField: charted && axes ? apiColumnKey(def, axes.y) : null,
      defaultView: charted ? 'Chart' : 'Table',
      showDataLabels: true,
      maxCategories: def.viz === 'Donut' ? 7 : 10
    }
  };
}

function fromDefinition(catalog: ReportCatalog, d: DefinitionDto | null): ReportDefinition {
  const def = blankDefinition(sourceKeyFor(catalog, d?.dataSources ?? []));
  if (!d) return def;
  const grouped = (d.groupBy ?? []).length > 0;
  def.fields = [...(d.selectedFields ?? [])];
  // Only + - * / map onto the builder's operators; other calculated fields (daysSince) are not editable here
  def.calcFields = (d.calculatedFields ?? [])
    .filter((c) => CALC_FROM_API[c.operator] && c.rightOperand)
    .map((c) => ({ key: c.key, label: c.label, left: c.leftOperand, op: CALC_FROM_API[c.operator], right: c.rightOperand ?? '' }));
  def.filters = (d.filters ?? []).map((f) => ({
    field: f.field,
    op: f.operator as FilterOperator,
    value: needsList(f.operator as FilterOperator) ? (f.values ?? []).join(', ') : (f.value ?? ''),
    valueTo: f.valueTo ?? ''
  }));
  def.filterLogic = d.filterLogic === 'Or' ? 'Or' : 'And';
  def.groupBy = d.groupBy?.[0] ?? '';
  const measure = (d.aggregations ?? []).find((a) => AGGREGATE_FROM_API[a.function]);
  def.aggregate = measure ? AGGREGATE_FROM_API[measure.function] : 'Sum';
  const sort = d.sorts?.[0];
  def.sortBy = uiColumnKey(grouped, sort?.field);
  def.sortDir = sort?.direction === 'asc' ? 'asc' : 'desc';
  def.rowLimit = d.rowLimit || 25;
  def.viz = VIZ_FROM_API[d.visualization?.chartType ?? 'Table'] ?? 'Table';
  def.chartValue = uiColumnKey(grouped, d.visualization?.yAxisField);
  return def;
}

function toPreview(res: PreviewDto, grouped: boolean): PreviewResult {
  const columns: PreviewColumn[] = (res.columns ?? []).map((c) => ({ key: c.key, label: c.label, kind: kindOf(c.dataType) }));
  let labelKey = res.chart?.xAxisField ?? '';
  let valueKey = res.chart?.yAxisField ?? '';
  if (!res.chart) {
    labelKey = (grouped ? columns[0] : columns.find((c) => !isNumeric(c.kind)))?.key ?? '';
    valueKey = columns.find((c) => isNumeric(c.kind) && c.key !== labelKey)?.key ?? '';
  }
  const labelCol = columns.find((c) => c.key === labelKey);
  const valueCol = columns.find((c) => c.key === valueKey);
  const title = res.chart?.title
    ?? (labelCol && valueCol ? `${valueCol.label.replace(/ \((sum|average|min|max)\)$/, '')} by ${labelCol.label}` : 'Report preview');
  return {
    columns,
    rows: res.rows ?? [],
    matched: res.totalRows ?? 0,
    labelKey,
    valueKey,
    title,
    points: res.chart ? res.chart.points : null
  };
}
