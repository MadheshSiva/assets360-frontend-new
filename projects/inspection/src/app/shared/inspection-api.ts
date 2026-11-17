import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import {
  CalibrationInstrument,
  Checklist,
  Inspection,
  InspectionAudit,
  InspectionFinding,
  InspectionPlan,
  InspectionTask,
  InspectionType,
  NotificationTemplate,
  NumberingSequence,
  ReportTemplate,
  SignatureAndStamp,
  TaskCategory,
  WorkingCalendar
} from './inspection.models';
import { INSPECTION_SEED } from './inspection-seed.data';

/** Readable message for a failed store call. */
export function apiErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}

let nextId = 1;
const newId = () => `local-${Date.now().toString(36)}-${nextId++}`;

/**
 * In-memory copy of one Inspection resource, seeded with the static demo data. Pages read `items()` and call
 * `load()` on init; `save()` creates when the record has no id, otherwise updates. Changes last for the session.
 */
export class ResourceStore<T extends InspectionAudit> {
  readonly items = signal<T[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly count = computed(() => this.items().length);

  constructor(
    private readonly auth: AuthService,
    readonly resource: string
  ) {
    // Seeded up front so cross-references (e.g. sites from calendars) resolve even before a page calls load().
    this.load();
  }

  /** Fills the list from the seed once; `force` re-reads the seed (dropping session changes). */
  load(force = false): void {
    if (this.loaded() && !force) return;
    this.items.set(structuredClone((INSPECTION_SEED[this.resource] ?? []) as T[]));
    this.error.set(null);
    this.loaded.set(true);
  }

  byId(id: string | null | undefined): T | undefined {
    return id ? this.items().find((r) => r.id === id) : undefined;
  }

  save(record: Partial<T>): Observable<T> {
    const actor = this.auth.getUserEmail() || 'unknown';
    const now = new Date().toISOString();
    if (record.id) {
      const existing = this.byId(record.id);
      if (!existing) return throwError(() => new Error('Record not found.'));
      const saved = { ...existing, ...record, updatedBy: actor, updatedAt: now } as T;
      this.items.update((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      return of(structuredClone(saved));
    }
    const saved = {
      ...record,
      id: newId(),
      status: record.status ?? 'Active',
      createdBy: actor,
      createdAt: now,
      updatedBy: null,
      updatedAt: null,
      clientId: environment.clientId,
      tenantId: environment.tenantId
    } as T;
    this.items.update((rows) => [saved, ...rows]);
    return of(structuredClone(saved));
  }

  remove(id: string): Observable<unknown> {
    this.items.update((rows) => rows.filter((r) => r.id !== id));
    return of(null);
  }
}

/** One store per Inspection resource, shared by every page so data loads once per session. */
@Injectable({ providedIn: 'root' })
export class InspectionApi {
  private readonly auth = inject(AuthService);

  readonly types = this.store<InspectionType>('inspection-types');
  readonly taskCategories = this.store<TaskCategory>('task-categories');
  readonly tasks = this.store<InspectionTask>('inspection-tasks');
  readonly checklists = this.store<Checklist>('checklists');
  readonly plans = this.store<InspectionPlan>('inspection-plans');
  readonly inspections = this.store<Inspection>('inspections');
  readonly findings = this.store<InspectionFinding>('inspection-findings');
  readonly instruments = this.store<CalibrationInstrument>('calibration-instruments');
  readonly signatures = this.store<SignatureAndStamp>('signatures-and-stamps');
  readonly notificationTemplates = this.store<NotificationTemplate>('notification-templates');
  readonly reportTemplates = this.store<ReportTemplate>('report-templates');
  readonly sequences = this.store<NumberingSequence>('numbering-sequences');
  readonly calendars = this.store<WorkingCalendar>('holiday-and-working-calendars');

  private store<T extends InspectionAudit>(resource: string): ResourceStore<T> {
    return new ResourceStore<T>(this.auth, resource);
  }
}
