import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, of, tap, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { CURRENT_USER } from '../shared/admin-common';
import { DataJob, FileFormat, JobOperation, JobSchedule, JobType } from './data-import.model';
import { ENCODINGS, defaultMapping, defaultRules, manualSchedule, objectDef } from './data-import.data';

const RUN_MS = 2600;
const VALIDATE_MS = 1200;
/** Stored in the API's free-text schedule field for manual jobs; other schedules are stored as JSON. */
const MANUAL_SCHEDULE = 'None (Run manually)';

/** Fields the Import Settings drawer owns. */
const DRAWER_FIELDS: (keyof DataJob)[] = [
  'name', 'dataObject', 'operation', 'fileName', 'fileFormat', 'fileSize', 'uploadedBy', 'uploadedOn', 'duplicateHandling',
  'dateFormat', 'delimiter', 'encoding', 'batchSize', 'schedule', 'recipients', 'active'
];

/** Request body for POST {administrationApiUrl}api/administration/data-imports */
interface CreateDataImportJobRequest {
  jobName: string;
  dataObject: string;
  operation: JobOperation;
  sourceFile: string;
  fileFormat: FileFormat;
  duplicateHandling: string;
  dateFormat: string;
  delimiter: string;
  encoding: string;
  batchSize: number;
  schedule: string;
  notificationRecipients: string[];
  status: 'Active' | 'Inactive';
  createdBy: string;
  tenantId: string;
  clientId: string;
}

/** Request body for PUT {administrationApiUrl}api/administration/data-imports/{jobId} */
type UpdateDataImportJobRequest = Omit<CreateDataImportJobRequest, 'createdBy' | 'tenantId' | 'clientId'> & { updatedBy: string };

/** Raw shape returned by the data-imports API. */
interface DataImportJobDto {
  jobId: string;
  jobName: string;
  dataObject: string;
  operation: string;
  sourceFile: string;
  fileFormat: string | null;
  duplicateHandling: string | null;
  dateFormat: string | null;
  delimiter: string | null;
  encoding: string | null;
  batchSize: number;
  schedule: string | null;
  notificationRecipients: string[];
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** yyyy-mm-ddThh:mm in local time. */
function toStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowStamp(): string {
  return toStamp(new Date());
}

/** Deep copy so drawer edits never leak into the list before Save. */
export function cloneJob(job: DataJob): DataJob {
  return JSON.parse(JSON.stringify(job)) as DataJob;
}

function scheduleToApi(s: JobSchedule): string {
  return s.mode === 'manual' ? MANUAL_SCHEDULE : JSON.stringify(s);
}

function scheduleFromApi(value: string | null): JobSchedule {
  if (!value || value === MANUAL_SCHEDULE) return manualSchedule();
  try {
    return { ...manualSchedule(), ...(JSON.parse(value) as Partial<JobSchedule>) };
  } catch {
    return manualSchedule();
  }
}

/**
 * Overlays the API response on the draft that was sent (or the job already held / a blank one when loading):
 * the API owns the id, the stored settings and the audit fields; the drawer-only details (file size,
 * uploaded by / on), code, mapping, rules, runs and results come from the draft.
 * The API upper-cases encodings, so they are matched back onto the option list.
 */
function toAppJob(dto: DataImportJobDto, draft: DataJob): DataJob {
  const encoding = ENCODINGS.find((e) => e.toUpperCase() === dto.encoding?.toUpperCase()) ?? dto.encoding ?? draft.encoding;
  const createdBy = dto.createdBy || draft.createdBy;
  return {
    ...draft,
    id: dto.jobId,
    name: dto.jobName,
    type: 'Import',
    dataObject: dto.dataObject,
    owner: createdBy,
    createdBy,
    active: dto.status !== 'Inactive',
    date: dto.createdAt ? toStamp(new Date(dto.createdAt)) : nowStamp(),
    operation: dto.operation as JobOperation,
    fileName: dto.sourceFile,
    fileFormat: (dto.fileFormat as FileFormat | null) ?? draft.fileFormat,
    duplicateHandling: dto.duplicateHandling ?? draft.duplicateHandling,
    dateFormat: dto.dateFormat ?? draft.dateFormat,
    delimiter: dto.delimiter ?? draft.delimiter,
    encoding,
    batchSize: dto.batchSize,
    schedule: scheduleFromApi(dto.schedule),
    recipients: [...dto.notificationRecipients]
  };
}

/** Readable message from an API error (validation problem or network failure). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;
  if (err.status === 0) return `${fallback} The Administration service is unreachable.`;
  const body = err.error as { message?: string; title?: string; errors?: Record<string, string[]> } | null;
  const first = body?.errors ? Object.values(body.errors).flat()[0] : undefined;
  return first ?? body?.message ?? body?.title ?? fallback;
}

/**
 * Import jobs are loaded, created, updated (settings drawer and schedule tab) and deleted through the
 * Administration API. There is no export-job API, so export jobs stay in memory, as do the field mapping and
 * validation rules (not stored by the API) and the job code (numbered here per type and data object).
 * DEMO MODE: Run Now and Validate are simulated with timers (no invented record counts).
 */
@Injectable({ providedIn: 'root' })
export class DataJobService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.administrationApiUrl}api/administration/data-imports`;
  private readonly jobs = signal<DataJob[]>([]);

  readonly all = this.jobs.asReadonly();
  readonly importCount = computed(() => this.jobs().filter((j) => j.type === 'Import').length);
  readonly exportCount = computed(() => this.jobs().filter((j) => j.type === 'Export').length);
  readonly recordsProcessed = computed(() => this.jobs().reduce((s, j) => s + j.records, 0));
  readonly failedRecords = computed(() => this.jobs().reduce((s, j) => s + j.failed, 0));

  get(id: string): DataJob | undefined {
    return this.jobs().find((j) => j.id === id);
  }

  /** A blank draft for the Import Settings drawer. */
  blank(type: JobType): DataJob {
    const object = 'Asset Master';
    return {
      id: '',
      code: '',
      name: '',
      type,
      dataObject: object,
      owner: CURRENT_USER.name,
      createdBy: CURRENT_USER.name,
      version: 'v1.0',
      status: 'Draft',
      active: true,
      date: nowStamp(),
      records: 0,
      successful: 0,
      failed: 0,
      warnings: 0,
      failureReason: '',
      operation: 'Upsert',
      fileName: '',
      fileFormat: 'XLSX',
      fileSize: '',
      uploadedBy: '',
      uploadedOn: '',
      duplicateHandling: 'Update existing',
      dateFormat: 'DD/MM/YYYY',
      delimiter: 'Comma ( , )',
      encoding: 'UTF-8',
      batchSize: 1000,
      schedule: manualSchedule(),
      recipients: [CURRENT_USER.email],
      mapping: defaultMapping(object),
      rules: defaultRules(object, 'NEW'),
      issues: [],
      runs: []
    };
  }

  /**
   * GET /api/administration/data-imports. Jobs already held keep their code, mapping, rules, runs and results;
   * export jobs (client-side only) stay in the list.
   */
  load(): Observable<DataJob[]> {
    const params = { tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.get<DataImportJobDto[]>(this.apiUrl, { params }).pipe(
      map((dtos) => {
        const used = this.jobs().filter((j) => j.type === 'Import').map((j) => Number(j.code.slice(-4)) || 0);
        let next = Math.max(0, ...used);
        // Oldest first, so codes follow creation order
        const ordered = [...dtos].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
        const imports = ordered.map((dto) => {
          const known = this.get(dto.jobId);
          if (known) {
            const job = { ...toAppJob(dto, known), date: known.date };
            return { ...job, status: this.restingStatus(job) };
          }
          const base = this.blank('Import');
          base.code = `IMP-${objectDef(dto.dataObject).abbr}-${String(++next).padStart(4, '0')}`;
          base.mapping = defaultMapping(dto.dataObject);
          base.rules = defaultRules(dto.dataObject, base.code);
          const job = toAppJob(dto, base);
          job.status = this.restingStatus(job);
          return job;
        });
        const exports = this.jobs().filter((j) => j.type === 'Export');
        return [...imports, ...exports].sort((a, b) => b.date.localeCompare(a.date));
      }),
      tap((list) => this.jobs.set(list))
    );
  }

  isNameTaken(name: string, exceptId: string): boolean {
    const n = name.trim().toLowerCase();
    return this.jobs().some((j) => j.id !== exceptId && j.name.trim().toLowerCase() === n);
  }

  /** Creates (no id) or updates a job; emits the saved copy. Only new import jobs go to the API. */
  save(draft: DataJob): Observable<DataJob> {
    const edited = cloneJob(draft);
    edited.name = edited.name.trim();
    const stored = edited.id ? this.get(edited.id) : undefined;
    if (!stored) {
      const prefix = edited.type === 'Import' ? 'IMP' : 'EXP';
      const used = this.jobs()
        .filter((j) => j.type === edited.type)
        .map((j) => Number(j.code.slice(-4)) || 0);
      const next = Math.max(0, ...used) + 1;
      // The API has no job code; it is numbered here per type and data object
      edited.code = `${prefix}-${objectDef(edited.dataObject).abbr}-${String(next).padStart(4, '0')}`;
      edited.mapping = defaultMapping(edited.dataObject);
      edited.rules = defaultRules(edited.dataObject, edited.code);
      edited.date = nowStamp();
      edited.status = this.restingStatus(edited);
      const created$ = edited.type === 'Import' ? this.post(edited) : of({ ...edited, id: edited.code });
      return created$.pipe(tap((job) => this.jobs.update((list) => [job, ...list])));
    }
    // Only the drawer's settings change; mapping, rules, runs and results stay as stored
    const job: DataJob = { ...stored };
    for (const key of DRAWER_FIELDS) (job as unknown as Record<string, unknown>)[key] = edited[key];
    if (stored.dataObject !== job.dataObject) {
      job.mapping = defaultMapping(job.dataObject);
      job.rules = defaultRules(job.dataObject, job.code);
    }
    const [major, minor] = stored.version.replace('v', '').split('.').map(Number);
    job.version = `v${major || 1}.${(minor || 0) + 1}`;
    job.status = this.restingStatus(job);
    const saved$ = job.type === 'Import' ? this.put(job) : of(job);
    return saved$.pipe(tap((saved) => this.replace(saved)));
  }

  /** POST /api/administration/data-imports */
  private post(job: DataJob): Observable<DataJob> {
    const request: CreateDataImportJobRequest = {
      ...this.settings(job),
      createdBy: this.auth.getUserEmail() || 'unknown',
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<DataImportJobDto>(this.apiUrl, request).pipe(map((dto) => toAppJob(dto, job)));
  }

  /** PUT /api/administration/data-imports/{jobId} */
  private put(job: DataJob): Observable<DataJob> {
    const request: UpdateDataImportJobRequest = { ...this.settings(job), updatedBy: this.auth.getUserEmail() || 'unknown' };
    return this.http
      .put<DataImportJobDto>(`${this.apiUrl}/${encodeURIComponent(job.id)}`, request)
      .pipe(map((dto) => ({ ...toAppJob(dto, job), date: job.date, status: job.status })));
  }

  /** The stored settings shared by POST and PUT. */
  private settings(job: DataJob): Omit<CreateDataImportJobRequest, 'createdBy' | 'tenantId' | 'clientId'> {
    return {
      jobName: job.name,
      dataObject: job.dataObject,
      operation: job.operation,
      // File name of the attached file; the drawer does not upload it to the Media service
      sourceFile: job.fileName,
      fileFormat: job.fileFormat,
      duplicateHandling: job.duplicateHandling,
      dateFormat: job.dateFormat,
      delimiter: job.delimiter,
      encoding: job.encoding,
      batchSize: job.batchSize,
      schedule: scheduleToApi(job.schedule),
      notificationRecipients: [...job.recipients],
      status: job.active ? 'Active' : 'Inactive'
    };
  }

  /**
   * Patch a stored job (mapping, rules, schedule tabs). A schedule change on an import job is saved with PUT;
   * mapping and rules are not stored by the API and change only here.
   */
  patch(id: string, change: Partial<DataJob>): Observable<DataJob> {
    const job = this.get(id);
    if (!job) return throwError(() => new Error('Job not found.'));
    const next = { ...job, ...change };
    if (change.schedule) next.status = this.restingStatus(next);
    const saved$ = change.schedule && next.type === 'Import' ? this.put(next) : of(next);
    return saved$.pipe(tap((saved) => this.replace(saved)));
  }

  /** DELETE /api/administration/data-imports/{jobId} for import jobs; export jobs are only dropped from the list. */
  remove(id: string): Observable<void> {
    const job = this.get(id);
    const drop = () => this.jobs.update((list) => list.filter((j) => j.id !== id));
    if (job?.type !== 'Import') {
      drop();
      return of(undefined);
    }
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`).pipe(tap(drop));
  }

  /** DEMO MODE: Running → Completed after a short delay, adding a run to history. */
  run(id: string, onDone: (job: DataJob) => void): void {
    const job = this.get(id);
    if (!job) return;
    this.replace({ ...job, status: 'Running' });
    setTimeout(() => {
      const current = this.get(id);
      if (!current) return;
      const total = current.records; // real counts come from the import service once wired
      const failed = current.issues.filter((i) => i.severity === 'Error' && i.status === 'Open').length;
      const done: DataJob = {
        ...current,
        status: 'Completed',
        date: nowStamp(),
        records: total,
        successful: total - failed,
        failed,
        failureReason: '',
        runs: [
          {
            id: `${current.code}-R${String(current.runs.length + 1).padStart(3, '0')}`,
            startedAt: nowStamp(),
            durationSec: 30 + Math.round(total / 140),
            runBy: CURRENT_USER.name,
            total,
            successful: total - failed,
            failed,
            status: 'Completed'
          },
          ...current.runs
        ]
      };
      this.replace(done);
      onDone(done);
    }, RUN_MS);
  }

  /** DEMO MODE: re-check the open issues against the enabled rules. */
  validate(id: string, onDone: (errors: number, warnings: number) => void): void {
    setTimeout(() => {
      const job = this.get(id);
      if (!job) return;
      // Warnings only count while at least one warning rule is switched on
      const warningRulesOn = job.rules.some((r) => r.enabled && r.severity === 'Warning');
      const open = job.issues.filter((i) => i.status === 'Open');
      const errors = open.filter((i) => i.severity === 'Error').length;
      const warnings = warningRulesOn ? open.filter((i) => i.severity === 'Warning').length : 0;
      this.replace({ ...job, warnings });
      onDone(errors, warnings);
    }, VALIDATE_MS);
  }

  private restingStatus(job: DataJob): DataJob['status'] {
    if (job.status === 'Running' || job.status === 'Completed' || job.status === 'Failed') return job.status;
    return job.schedule.mode === 'manual' ? 'Draft' : 'Scheduled';
  }

  private replace(job: DataJob): void {
    this.jobs.update((list) => list.map((j) => (j.id === job.id ? job : j)));
  }
}
