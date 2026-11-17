import { Injectable, computed, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CURRENT_USER } from '../shared/admin-common';
import { DataJob, JobType } from './data-import.model';
import { defaultMapping, defaultRules, manualSchedule, objectDef, seedJobs } from './data-import.data';

const RUN_MS = 2600;
const VALIDATE_MS = 1200;
/** Fields the Import Settings drawer owns. */
const DRAWER_FIELDS: (keyof DataJob)[] = [
  'name', 'dataObject', 'operation', 'fileName', 'fileFormat', 'fileSize', 'uploadedBy', 'uploadedOn', 'duplicateHandling',
  'dateFormat', 'delimiter', 'encoding', 'batchSize', 'schedule', 'recipients', 'active'
];

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

/** Readable message for a failed action. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * DEMO MODE: import and export jobs are held in memory, seeded with static demo data.
 * Run Now and Validate are simulated with timers.
 */
@Injectable({ providedIn: 'root' })
export class DataJobService {
  private readonly jobs = signal<DataJob[]>(seedJobs());

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

  /** The jobs are already in memory; kept as an Observable so the page can wait on it. */
  load(): Observable<DataJob[]> {
    return of(this.jobs());
  }

  isNameTaken(name: string, exceptId: string): boolean {
    const n = name.trim().toLowerCase();
    return this.jobs().some((j) => j.id !== exceptId && j.name.trim().toLowerCase() === n);
  }

  /** Creates (no id) or updates a job; emits the saved copy. */
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
      edited.code = `${prefix}-${objectDef(edited.dataObject).abbr}-${String(next).padStart(4, '0')}`;
      edited.mapping = defaultMapping(edited.dataObject);
      edited.rules = defaultRules(edited.dataObject, edited.code);
      edited.date = nowStamp();
      edited.status = this.restingStatus(edited);
      const created: DataJob = { ...edited, id: edited.code };
      this.jobs.update((list) => [created, ...list]);
      return of(created);
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
    this.replace(job);
    return of(job);
  }

  /** Patch a stored job (mapping, rules, schedule tabs). */
  patch(id: string, change: Partial<DataJob>): Observable<DataJob> {
    const job = this.get(id);
    if (!job) return throwError(() => new Error('Job not found.'));
    const next = { ...job, ...change };
    if (change.schedule) next.status = this.restingStatus(next);
    this.replace(next);
    return of(next);
  }

  remove(id: string): Observable<void> {
    this.jobs.update((list) => list.filter((j) => j.id !== id));
    return of(undefined);
  }

  /** DEMO MODE: Running → Completed after a short delay, adding a run to history. */
  run(id: string, onDone: (job: DataJob) => void): void {
    const job = this.get(id);
    if (!job) return;
    this.replace({ ...job, status: 'Running' });
    setTimeout(() => {
      const current = this.get(id);
      if (!current) return;
      const total = current.records || (current.type === 'Import' ? 1250 : 3400);
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
