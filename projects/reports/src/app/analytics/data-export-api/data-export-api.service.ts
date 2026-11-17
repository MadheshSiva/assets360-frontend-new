import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, tap, throwError } from 'rxjs';
import { CURRENT_USER, downloadCsv } from '../shared/analytics-common';
import {
  DELIVERY_NOTE, DESTINATION_LABEL, OLDER_LOG_ENTRIES, fileBytes, localStamp, sampleRows, seedConnections, seedDatasets, seedJobsAndRuns,
  seedLogs, seedStats, seedSummary, seeded
} from './data-export-api.data';
import {
  AccessLog, ApiConnection, ConnectionType, Dataset, DatasetField, DatasetSample, ExportDraft, ExportFormat, ExportJob, ExportRun,
  ExportSummary, Frequency, LogResult, RunStats
} from './data-export-api.model';

/** New-connection form. The secret is never kept: only a masked form of it is stored. */
export interface ConnectionForm {
  name: string;
  type: ConnectionType;
  baseUrl: string;
  auth: string;
  clientId: string;
  secret: string;
}

export { DESTINATION_LABEL };

/** Filters of the Access Logs tab, for the CSV export. */
export interface LogExportFilters {
  search: string;
  result: '' | LogResult;
  resource: string;
}

const DAY = 86_400_000;
/** Short pause so "Running" / "Testing" states are visible in the demo. */
const WORK_MS = 900;

/**
 * Data Export / API (static demo): export jobs, run-now (generates a file of demo rows), API connections, datasets and
 * access logs held in memory. Every change updates this in-memory copy and is recorded in the access logs.
 */
@Injectable()
export class DataExportService {
  datasets: Dataset[] = [];
  jobs: ExportJob[] = [];
  connections: ApiConnection[] = [];
  logs: AccessLog[] = [];
  logsTotal = 0;
  stats7: RunStats = seedStats(7);
  stats30: RunStats = seedStats(30);
  summary: ExportSummary = seedSummary(this.stats30, [], 0);
  formats: ExportFormat[] = ['CSV', 'XLSX', 'JSON'];
  authMethods: string[] = ['OAuth 2.0 (client credentials)', 'API key', 'Basic', 'Key pair', 'Service principal', 'Personal access token'];
  deliveryNote = DELIVERY_NOTE;

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  /** Bumped whenever new figures arrive, so charts rebuild */
  readonly version = signal(0);

  private runs: ExportRun[] = [];
  private jobSeq = 11;
  private runSeq = 4_300;
  private conSeq = 7;
  private logSeq = 9_500;

  constructor() {
    this.datasets = seedDatasets();
    const { jobs, runs } = seedJobsAndRuns(this.datasets);
    this.jobs = jobs;
    this.runs = runs;
    this.connections = seedConnections();
    this.logs = seedLogs();
    this.logsTotal = this.logs.length + OLDER_LOG_ENTRIES;
    this.summary = seedSummary(this.stats30, this.jobs, this.connections.length);
    this.countExports();
  }

  // ----- Loading -----

  /** File formats, authentication methods and the delivery note (static). */
  loadOptions(): Observable<void> {
    return of(undefined);
  }

  /** The current in-memory overview. */
  loadOverview(): Observable<void> {
    this.countExports();
    this.loaded.set(true);
    this.loading.set(false);
    this.error.set(null);
    this.version.update((v) => v + 1);
    return of(undefined);
  }

  // ----- Lookups -----

  dataset(id: string): Dataset | undefined {
    return this.datasets.find((d) => d.id === id);
  }

  fields(datasetId: string): DatasetField[] {
    return this.dataset(datasetId)?.fields ?? [];
  }

  nameTaken(name: string, exceptId: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.jobs.some((j) => j.id !== exceptId && j.name.toLowerCase() === n);
  }

  connectionNameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.connections.some((c) => c.name.toLowerCase() === n);
  }

  // ----- Export jobs -----

  /** Creates or updates a job from the Export Builder. */
  saveJob(draft: ExportDraft, status: 'Draft' | 'Scheduled'): Observable<ExportJob> {
    const name = draft.name.trim();
    if (this.nameTaken(name, draft.id)) return throwError(() => new Error('An export with this name already exists.'));
    const d = this.dataset(draft.datasetId) ?? this.datasets[0];
    const existing = draft.id ? this.jobs.find((j) => j.id === draft.id) : undefined;
    const target = draft.target.trim();
    const job: ExportJob = {
      id: existing?.id ?? `EXP-${String(this.jobSeq++).padStart(4, '0')}`,
      name,
      module: d.modules[d.modules.length - 1],
      datasetId: d.id,
      format: draft.format,
      delivery: draft.delivery,
      target,
      destination: draft.delivery === 'API' ? target : DESTINATION_LABEL[draft.delivery],
      frequency: draft.frequency,
      time: draft.time,
      lastRun: existing?.lastRun ?? null,
      nextRun: status === 'Draft' ? null : nextRun(draft.frequency, draft.time),
      status,
      owner: existing?.owner ?? CURRENT_USER.name,
      fields: draft.fields.slice(),
      filters: draft.filters.map((x) => ({ field: x.field, operator: x.operator, value: x.value.trim() })),
      encrypted: draft.encrypted,
      lastRunId: existing?.lastRunId ?? null,
      lastRowCount: existing?.lastRowCount ?? null,
      lastSizeBytes: existing?.lastSizeBytes ?? null
    };
    this.upsertJob(job);
    this.log(existing ? 'Edited export' : 'Created export', job.name);
    this.changed();
    return of(job);
  }

  /** Run now: generates the file from the dataset's demo rows and records the run. */
  runJob(job: ExportJob): Observable<{ job: ExportJob; run: ExportRun }> {
    const before = job.status;
    this.patchJob(job.id, { status: 'Running', lastError: undefined });
    const con = job.delivery === 'API' ? this.connections.find((c) => c.name === job.target) : undefined;
    const failed = con?.status === 'Disconnected';
    const rows = failed ? 0 : this.rowCount(job);
    const startedAt = localStamp(new Date());
    const size = failed ? 0 : fileBytes(rows, job.fields.length || this.fields(job.datasetId).length, job.format);
    const error = failed ? `${con!.name} is disconnected: ${con!.lastTestMessage ?? 'last test failed'}` : null;
    const run: ExportRun = {
      id: `RUN-${String(this.runSeq++).padStart(6, '0')}`, jobId: job.id, jobName: job.name, status: failed ? 'Failed' : 'Success', startedAt,
      rowCount: rows, sizeBytes: size, fileName: failed ? null : `${job.id}.${job.format.toLowerCase()}`, hasFile: !failed,
      deliveryStatus: failed ? 'Failed' : 'Not delivered', deliveryMessage: failed ? null : this.deliveryNote, error
    };
    const updated: ExportJob = {
      ...(this.jobs.find((j) => j.id === job.id) ?? job),
      status: failed ? 'Failed' : before === 'Paused' ? 'Paused' : 'Success',
      lastRun: startedAt,
      lastError: error ?? undefined,
      lastRunId: run.id,
      lastRowCount: rows,
      lastSizeBytes: failed ? null : size,
      nextRun: before === 'Draft' || before === 'Paused' ? null : nextRun(job.frequency, job.time)
    };
    return of({ job: updated, run }).pipe(
      delay(WORK_MS),
      tap(() => {
        this.runs.unshift(run);
        this.upsertJob(updated);
        this.recordRun(run);
        this.log('Ran export', job.name, failed ? 'Failed' : 'Success');
        this.changed();
      })
    );
  }

  pause(job: ExportJob): Observable<ExportJob> {
    return this.jobAction(job, { status: 'Paused', nextRun: null }, 'Paused export');
  }

  resume(job: ExportJob): Observable<ExportJob> {
    return this.jobAction(job, { status: 'Scheduled', nextRun: nextRun(job.frequency, job.time) }, 'Resumed export');
  }

  deleteJob(job: ExportJob): Observable<void> {
    this.jobs = this.jobs.filter((j) => j.id !== job.id);
    this.log('Deleted export', job.name);
    this.changed();
    return of(undefined);
  }

  /** The file of the job's latest successful run, or (before any) a 25-row CSV sample. Says which one was downloaded. */
  downloadJob(job: ExportJob): Observable<'file' | 'sample'> {
    const hasFile = !!job.lastRunId && !!job.lastSizeBytes && job.status !== 'Failed';
    const fields = this.jobFields(job);
    // The demo file holds at most 500 rows of the run
    const count = hasFile ? Math.min(job.lastRowCount ?? 25, 500) : 25;
    downloadCsv(hasFile ? `${job.id}.csv` : `${job.id}-sample.csv`, fields.map((x) => x.name), sampleRows(fields, count));
    this.log(hasFile ? 'Downloaded file' : 'Downloaded sample', job.name);
    this.changed();
    return of(hasFile ? 'file' : 'sample');
  }

  private jobAction(job: ExportJob, patch: Partial<ExportJob>, action: string): Observable<ExportJob> {
    const current = this.jobs.find((j) => j.id === job.id) ?? job;
    const updated = { ...current, ...patch };
    this.upsertJob(updated);
    this.log(action, job.name);
    this.changed();
    return of(updated);
  }

  private jobFields(job: ExportJob): DatasetField[] {
    const all = this.fields(job.datasetId);
    const picked = all.filter((x) => job.fields.includes(x.name));
    return picked.length ? picked : all;
  }

  /** Rows a run generates: the dataset narrowed by each filter, plus a little growth since the last run. */
  private rowCount(job: ExportJob): number {
    if (job.lastRowCount) return job.lastRowCount + Math.round(seeded(Date.now() % 9_973)() * 40);
    const total = this.dataset(job.datasetId)?.rows ?? 1_000;
    return Math.max(1, Math.round(total * Math.pow(0.42, job.filters.length)));
  }

  private upsertJob(job: ExportJob): void {
    const i = this.jobs.findIndex((j) => j.id === job.id);
    this.jobs = i >= 0 ? this.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...this.jobs];
  }

  private patchJob(id: string, patch: Partial<ExportJob>): void {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  }

  /** Adds the run to today's bucket of both stat ranges. */
  private recordRun(run: ExportRun): void {
    for (const s of [this.stats7, this.stats30]) {
      const last = s.labels.length - 1;
      if (run.status === 'Success') s.success[last]++;
      else s.failed[last]++;
      s.generatedBytes[last] += run.sizeBytes;
      s.accessOk[last]++;
      const ok = s.success.reduce((a, b) => a + b, 0);
      const bad = s.failed.reduce((a, b) => a + b, 0);
      s.successRate = Number(((ok / (ok + bad)) * 100).toFixed(1));
    }
    this.summary = { ...this.summary, successRate30: this.stats30.successRate, generatedBytes30: this.summary.generatedBytes30 + run.sizeBytes };
  }

  // ----- Datasets -----

  /** The newest rows of a dataset (demo rows). */
  preview(datasetId: string, rows = 10): Observable<DatasetSample> {
    const d = this.dataset(datasetId);
    if (!d) return throwError(() => new Error('Dataset not found.'));
    this.log('Previewed dataset', d.name);
    return of({ header: d.fields.map((x) => x.name), rows: sampleRows(d.fields, Math.min(rows, d.rows)), totalRows: d.rows });
  }

  /** A CSV of the newest rows (recorded in the access logs). */
  downloadDatasetSample(d: Dataset, rows = 25): Observable<void> {
    downloadCsv(`${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-sample.csv`, d.fields.map((x) => x.name), sampleRows(d.fields, rows));
    this.log('Downloaded sample', d.name);
    this.changed();
    return of(undefined);
  }

  // ----- Connections -----

  /** Saved and tested right away. Only a mask of the secret is kept. */
  addConnection(form: ConnectionForm): Observable<ApiConnection> {
    const name = form.name.trim();
    if (this.connectionNameTaken(name)) return throwError(() => new Error('A connection with this name already exists.'));
    const tested = testResult(form.baseUrl);
    const con: ApiConnection = {
      id: `CON-${String(this.conSeq++).padStart(3, '0')}`,
      name,
      type: form.type,
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
      auth: form.auth,
      authClientId: form.clientId.trim() || null,
      ...tested,
      uptime: tested.status === 'Disconnected' ? 0 : 100,
      lastTested: localStamp(new Date()),
      secretStored: !!form.secret,
      secretMask: form.secret ? `••••••••${form.secret.slice(-4)}` : null,
      owner: CURRENT_USER.name
    };
    this.connections = [...this.connections, con];
    this.log('Added connection', con.name);
    this.changed();
    return of(con);
  }

  deleteConnection(con: ApiConnection): Observable<void> {
    this.connections = this.connections.filter((c) => c.id !== con.id);
    this.log('Removed connection', con.name);
    this.changed();
    return of(undefined);
  }

  /** Simulated HTTPS test of the base URL and its certificate. */
  testConnection(con: ApiConnection): Observable<ApiConnection> {
    this.patchConnection(con.id, { status: 'Testing' });
    // Re-testing a connection with a known issue gives the same answer; others report healthy
    const result =
      con.status === 'Disconnected' || con.status === 'Warning'
        ? { status: con.status, lastTestMessage: con.lastTestMessage, certExpiresInDays: con.certExpiresInDays }
        : testResult(con.baseUrl);
    const updated: ApiConnection = {
      ...con,
      ...result,
      lastTested: localStamp(new Date()),
      uptime: con.uptime === null ? (result.status === 'Disconnected' ? 0 : 100) : con.uptime
    };
    return of(updated).pipe(
      delay(WORK_MS),
      tap((v) => {
        this.connections = this.connections.map((c) => (c.id === v.id ? v : c));
        this.log('Tested connection', v.name, v.status === 'Disconnected' ? 'Failed' : 'Success');
        this.changed();
      })
    );
  }

  private patchConnection(id: string, patch: Partial<ApiConnection>): void {
    this.connections = this.connections.map((c) => (c.id === id ? { ...c, ...patch } : c));
  }

  // ----- Access logs -----

  /** CSV of the access logs matching the tab's filters. */
  exportLogs(f: LogExportFilters): Observable<void> {
    const q = f.search.trim().toLowerCase();
    const rows = this.logs
      .filter(
        (l) =>
          (!f.result || l.result === f.result) &&
          (!f.resource || l.resource === f.resource) &&
          (!q || `${l.actor} ${l.action} ${l.resource} ${l.client} ${l.ip}`.toLowerCase().includes(q))
      )
      .map((l) => [l.id, l.at.replace('T', ' '), l.actor, l.action, l.resource, l.client, l.ip, l.result]);
    downloadCsv('reporting-access-logs.csv', ['Log ID', 'Time (GST)', 'Actor', 'Action', 'Resource', 'Client', 'IP Address', 'Result'], rows);
    this.log('Exported access logs', 'Access Logs');
    return of(undefined);
  }

  private log(action: string, resource: string, result: LogResult = 'Success'): void {
    this.logs = [
      { id: `LOG-${String(this.logSeq++).padStart(6, '0')}`, at: localStamp(new Date()), actor: CURRENT_USER.name, action, resource, client: 'Asset360 Web', ip: '10.20.14.18', result },
      ...this.logs
    ];
    this.logsTotal++;
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

  private countExports(): void {
    this.datasets = this.datasets.map((d) => ({ ...d, exports: this.jobs.filter((j) => j.datasetId === d.id).length }));
  }

  private changed(): void {
    this.countExports();
    this.version.update((v) => v + 1);
  }
}

/** Next scheduled run for a frequency and its time ("02:00", "Mon 07:00", "15" for hourly). */
function nextRun(frequency: Frequency, time: string): string | null {
  if (frequency === 'Real-time' || frequency === 'On demand') return null;
  const now = new Date();
  const clock = time.split(' ').pop() ?? '00:00';
  const next = new Date(now);
  if (frequency === 'Hourly') {
    next.setMinutes(Number(clock) || 0, 0, 0);
    if (next <= now) next.setTime(next.getTime() + 3_600_000);
    return localStamp(next);
  }
  const [h, m] = clock.split(':').map(Number);
  next.setHours(h || 0, m || 0, 0, 0);
  if (next <= now) next.setTime(next.getTime() + DAY);
  if (frequency === 'Weekly') {
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(time.split(' ')[0]);
    if (day >= 0) while (next.getDay() !== day) next.setTime(next.getTime() + DAY);
  }
  if (frequency === 'Monthly') {
    next.setDate(1);
    next.setMonth(now.getMonth() + 1);
  }
  return localStamp(next);
}

/** Demo connection test: plain-http or "localhost" URLs fail, everything else connects with a valid certificate. */
function testResult(baseUrl: string): Pick<ApiConnection, 'status' | 'lastTestMessage' | 'certExpiresInDays'> {
  const url = baseUrl.trim().toLowerCase();
  if (!url.startsWith('https://') || url.includes('localhost')) {
    return { status: 'Disconnected', lastTestMessage: 'Could not open an HTTPS connection to the base URL', certExpiresInDays: null };
  }
  const days = 60 + Math.round(seeded(url.length * 97)() * 300);
  return { status: 'Connected', lastTestMessage: `HTTPS 200 in ${120 + (url.length % 9) * 23} ms; certificate valid`, certExpiresInDays: days };
}
