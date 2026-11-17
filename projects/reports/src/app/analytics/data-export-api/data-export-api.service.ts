import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { apiErrorMessage, saveBlob, toParams } from '../asset-performance/kit/api-utils';
import { emptyRunStats, emptySummary } from './data-export-api.data';
import {
  AccessLog, ApiConnection, ConnectionType, Dataset, DatasetField, DatasetSample, ExportDraft, ExportFormat, ExportJob, ExportRun, ExportStatus,
  ExportSummary, LogResult, RunStats
} from './data-export-api.model';

/** New-connection form. The secret is sent once to the API, which keeps only a masked form of it. */
export interface ConnectionForm {
  name: string;
  type: ConnectionType;
  baseUrl: string;
  auth: string;
  clientId: string;
  secret: string;
}

export const DESTINATION_LABEL: Record<string, string> = { S3: 'S3', 'Secure FTP': 'SFTP', Email: 'Email', API: 'API' };

// ----- API shapes (/api/data-export) -----

interface OptionsDto {
  formats: string[];
  authMethods: string[];
  defaultTimeZone: string;
  deliveryNote: string;
}

interface JobDto extends Omit<ExportJob, 'lastError'> {
  lastError: string | null;
}

type RunDto = ExportRun;
type ConnectionDto = ApiConnection;
type StatsDto = RunStats;

interface OverviewDto {
  generatedAt: string;
  timeZone: string;
  summary: ExportSummary;
  jobs: JobDto[];
  connections: ConnectionDto[];
  datasets: Dataset[];
  stats7: StatsDto;
  stats30: StatsDto;
  logs: AccessLog[];
  logsTotal: number;
}

interface PreviewDto {
  datasetId: string;
  header: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  truncated: boolean;
}

interface RunResultDto {
  job: JobDto;
  run: RunDto;
}

/** Filters of the Access Logs tab, for the server-side CSV export. */
export interface LogExportFilters {
  search: string;
  result: '' | LogResult;
  resource: string;
}

const TIME_ZONE = 'Asia/Dubai';

const toJob = (dto: JobDto): ExportJob => ({ ...dto, lastError: dto.lastError ?? undefined, fields: dto.fields ?? [], filters: dto.filters ?? [] });

const toStats = (dto: StatsDto | null | undefined, days: number): RunStats =>
  dto && dto.labels?.length
    ? {
        labels: dto.labels,
        success: dto.success ?? [],
        failed: dto.failed ?? [],
        generatedBytes: dto.generatedBytes ?? [],
        accessOk: dto.accessOk ?? [],
        accessFailed: dto.accessFailed ?? [],
        successRate: dto.successRate ?? null
      }
    : emptyRunStats(days);

/**
 * Data Export / API from the Report Analytics API (/api/data-export): export jobs, run-now (the file is generated from the live
 * dataset and kept with the run; delivery is not configured), API connections, datasets and access logs.
 * The page holds the latest overview here; every change goes to the API and then reloads the overview.
 */
@Injectable()
export class DataExportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/data-export`;

  datasets: Dataset[] = [];
  jobs: ExportJob[] = [];
  connections: ApiConnection[] = [];
  logs: AccessLog[] = [];
  logsTotal = 0;
  stats7: RunStats = emptyRunStats(7);
  stats30: RunStats = emptyRunStats(30);
  summary: ExportSummary = emptySummary();
  formats: ExportFormat[] = ['CSV', 'XLSX', 'JSON'];
  authMethods: string[] = [];
  deliveryNote = 'not delivered: no transport configured';

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  /** Bumped whenever new figures arrive, so charts rebuild */
  readonly version = signal(0);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Data Export')));

  private scope(extra: Record<string, string | number | boolean | null | undefined> = {}) {
    return toParams({ tenantId: environment.tenantId, clientId: environment.clientId, timeZone: TIME_ZONE, ...extra });
  }

  private get body() {
    return { tenantId: environment.tenantId, clientId: environment.clientId, timeZone: TIME_ZONE };
  }

  // ----- Loading -----

  /** GET /options: file formats, authentication methods and the delivery note. */
  loadOptions(): Observable<void> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const formats = (dto.formats ?? []).filter((f): f is ExportFormat => f === 'CSV' || f === 'XLSX' || f === 'JSON');
        if (formats.length) this.formats = formats;
        if (dto.authMethods?.length) this.authMethods = dto.authMethods;
        if (dto.deliveryNote) this.deliveryNote = dto.deliveryNote;
      }),
      catchError(this.fail)
    );
  }

  /** GET /overview: jobs, connections, datasets, run stats (7 / 30 days), headline figures and the latest access logs. */
  loadOverview(): Observable<void> {
    this.loading.set(true);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params: this.scope() }).pipe(
      map((dto) => {
        // Keep the "Testing" / "Running" state of anything still waiting for the API
        const running = new Set(this.jobs.filter((j) => j.status === 'Running').map((j) => j.id));
        const testing = new Set(this.connections.filter((c) => c.status === 'Testing').map((c) => c.id));
        this.jobs = (dto.jobs ?? []).map(toJob).map((j) => (running.has(j.id) ? { ...j, status: 'Running' as ExportStatus } : j));
        this.connections = (dto.connections ?? []).map((c) => (testing.has(c.id) ? { ...c, status: 'Testing' as const } : c));
        this.datasets = dto.datasets ?? [];
        this.logs = dto.logs ?? [];
        this.logsTotal = dto.logsTotal ?? this.logs.length;
        this.stats7 = toStats(dto.stats7, 7);
        this.stats30 = toStats(dto.stats30, 30);
        this.summary = dto.summary ?? emptySummary();
        if (dto.summary?.deliveryNote) this.deliveryNote = dto.summary.deliveryNote;
        this.loaded.set(true);
        this.error.set(null);
        this.version.update((v) => v + 1);
      }),
      catchError((err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err, 'Data Export'));
        return this.fail(err);
      }),
      finalize(() => this.loading.set(false))
    );
  }

  /** Reloads the overview after a change (new access logs, stats, dataset export counts). Errors are left to the next refresh. */
  private reload(): void {
    this.loadOverview().subscribe({ error: () => undefined });
  }

  // ----- Lookups -----

  dataset(id: string): Dataset | undefined {
    return this.datasets.find((d) => d.id === id);
  }

  fields(datasetId: string): DatasetField[] {
    return this.dataset(datasetId)?.fields ?? [];
  }

  /** Quick check for the builder; the API checks again when saving. */
  nameTaken(name: string, exceptId: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.jobs.some((j) => j.id !== exceptId && j.name.toLowerCase() === n);
  }

  connectionNameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.connections.some((c) => c.name.toLowerCase() === n);
  }

  // ----- Export jobs -----

  /** POST /jobs or PUT /jobs/{id} from the Export Builder. */
  saveJob(draft: ExportDraft, status: 'Draft' | 'Scheduled'): Observable<ExportJob> {
    const payload = {
      name: draft.name.trim(),
      datasetId: draft.datasetId,
      format: draft.format,
      fields: draft.fields.slice(),
      filters: draft.filters.map((x) => ({ field: x.field, operator: x.operator, value: x.value.trim() })),
      delivery: draft.delivery,
      target: draft.target.trim(),
      frequency: draft.frequency,
      time: draft.time,
      encrypted: draft.encrypted,
      status,
      ...this.body
    };
    const request = draft.id
      ? this.http.put<JobDto>(`${this.apiUrl}/jobs/${encodeURIComponent(draft.id)}`, payload)
      : this.http.post<JobDto>(`${this.apiUrl}/jobs`, payload);
    return request.pipe(
      map(toJob),
      tap((job) => {
        this.upsertJob(job);
        this.reload();
      }),
      catchError(this.fail)
    );
  }

  /** POST /jobs/{id}/run: generates the file from the live dataset and records the run. */
  runJob(job: ExportJob): Observable<{ job: ExportJob; run: ExportRun }> {
    const before = job.status;
    this.patchJob(job.id, { status: 'Running', lastError: undefined });
    return this.http.post<RunResultDto>(`${this.apiUrl}/jobs/${encodeURIComponent(job.id)}/run`, null, { params: this.scope() }).pipe(
      map((dto) => ({ job: toJob(dto.job), run: dto.run })),
      tap(({ job: updated }) => {
        this.upsertJob(updated);
        this.reload();
      }),
      catchError((err: HttpErrorResponse) => {
        this.patchJob(job.id, { status: before });
        return this.fail(err);
      })
    );
  }

  pause(job: ExportJob): Observable<ExportJob> {
    return this.jobAction(job, 'pause');
  }

  resume(job: ExportJob): Observable<ExportJob> {
    return this.jobAction(job, 'resume');
  }

  deleteJob(job: ExportJob): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/jobs/${encodeURIComponent(job.id)}`, { params: this.scope() }).pipe(
      tap(() => {
        this.jobs = this.jobs.filter((j) => j.id !== job.id);
        this.reload();
      }),
      catchError(this.fail)
    );
  }

  /** The file of the job's latest successful run, or (before any) a 25-row CSV sample. Says which one was downloaded. */
  downloadJob(job: ExportJob): Observable<'file' | 'sample'> {
    const hasFile = !!job.lastRunId && !!job.lastSizeBytes && job.status !== 'Failed';
    const url = hasFile
      ? `${this.apiUrl}/runs/${encodeURIComponent(job.lastRunId!)}/file`
      : `${this.apiUrl}/jobs/${encodeURIComponent(job.id)}/sample`;
    const params = hasFile ? this.scope() : this.scope({ rows: 25 });
    return this.http.get(url, { params, observe: 'response', responseType: 'blob' }).pipe(
      tap((res) => {
        saveBlob(res, hasFile ? `${job.id}.${job.format.toLowerCase()}` : `${job.id}-sample.csv`);
        this.reload();
      }),
      map(() => (hasFile ? 'file' : 'sample') as 'file' | 'sample'),
      catchError(this.fail)
    );
  }

  private jobAction(job: ExportJob, action: 'pause' | 'resume'): Observable<ExportJob> {
    return this.http.post<JobDto>(`${this.apiUrl}/jobs/${encodeURIComponent(job.id)}/${action}`, null, { params: this.scope() }).pipe(
      map(toJob),
      tap((updated) => {
        this.upsertJob(updated);
        this.reload();
      }),
      catchError(this.fail)
    );
  }

  private upsertJob(job: ExportJob): void {
    const i = this.jobs.findIndex((j) => j.id === job.id);
    this.jobs = i >= 0 ? this.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...this.jobs];
  }

  private patchJob(id: string, patch: Partial<ExportJob>): void {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  }

  // ----- Datasets -----

  /** GET /datasets/{id}/preview: the newest rows of the live collection. */
  preview(datasetId: string, rows = 10): Observable<DatasetSample> {
    return this.http.get<PreviewDto>(`${this.apiUrl}/datasets/${encodeURIComponent(datasetId)}/preview`, { params: this.scope({ rows }) }).pipe(
      map((dto) => ({ header: dto.header ?? [], rows: dto.rows ?? [], totalRows: dto.totalRows ?? 0 })),
      catchError(this.fail)
    );
  }

  /** GET /datasets/{id}/sample: a CSV of the newest rows (recorded in the access logs). */
  downloadDatasetSample(d: Dataset, rows = 25): Observable<void> {
    return this.http
      .get(`${this.apiUrl}/datasets/${encodeURIComponent(d.id)}/sample`, { params: this.scope({ rows }), observe: 'response', responseType: 'blob' })
      .pipe(
        tap((res) => {
          saveBlob(res, `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-sample.csv`);
          this.reload();
        }),
        map(() => undefined),
        catchError(this.fail)
      );
  }

  // ----- Connections -----

  /** POST /connections: saved and tested right away. The secret is sent once and only its mask is stored. */
  addConnection(form: ConnectionForm): Observable<ApiConnection> {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
      auth: form.auth,
      authClientId: form.clientId.trim() || null,
      secret: form.secret,
      testNow: true,
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<ConnectionDto>(`${this.apiUrl}/connections`, payload, { params: toParams({ timeZone: TIME_ZONE }) }).pipe(
      tap((con) => {
        this.connections = [...this.connections, con];
        this.reload();
      }),
      catchError(this.fail)
    );
  }

  deleteConnection(con: ApiConnection): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/connections/${encodeURIComponent(con.id)}`, { params: this.scope() }).pipe(
      tap(() => {
        this.connections = this.connections.filter((c) => c.id !== con.id);
        this.reload();
      }),
      catchError(this.fail)
    );
  }

  /** POST /connections/{id}/test: calls the base URL over HTTPS and reads its certificate. */
  testConnection(con: ApiConnection): Observable<ApiConnection> {
    const before = con.status;
    this.patchConnection(con.id, { status: 'Testing' });
    return this.http.post<ConnectionDto>(`${this.apiUrl}/connections/${encodeURIComponent(con.id)}/test`, null, { params: this.scope() }).pipe(
      tap((updated) => {
        this.connections = this.connections.map((c) => (c.id === updated.id ? updated : c));
        this.reload();
      }),
      catchError((err: HttpErrorResponse) => {
        this.patchConnection(con.id, { status: before });
        return this.fail(err);
      })
    );
  }

  private patchConnection(id: string, patch: Partial<ApiConnection>): void {
    this.connections = this.connections.map((c) => (c.id === id ? { ...c, ...patch } : c));
  }

  // ----- Access logs -----

  /** GET /export?section=access-logs: CSV of the access logs matching the tab's filters. */
  exportLogs(f: LogExportFilters): Observable<void> {
    const params = this.scope({ section: 'access-logs', format: 'csv', search: f.search.trim(), result: f.result, resource: f.resource });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      tap((res) => saveBlob(res, 'reporting-access-logs.csv')),
      map(() => undefined),
      catchError(this.fail)
    );
  }

  // ----- Headline figures -----

  get activeExports(): number {
    return this.jobs.filter((j) => j.status !== 'Paused' && j.status !== 'Draft').length;
  }

  get scheduledJobs(): number {
    return this.jobs.filter((j) => j.frequency !== 'On demand' && j.status !== 'Paused' && j.status !== 'Draft').length;
  }

  /** Share of successful runs over the last 30 days; null when nothing ran */
  get successRate(): number | null {
    return this.stats30.successRate ?? this.summary.successRate30;
  }
}
