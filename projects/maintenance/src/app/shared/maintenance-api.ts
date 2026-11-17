import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AuthService } from 'shared-ui';
import { MaintenanceAudit, PredictiveMaintenance, PreventiveMaintenance, ServiceRequest, WorkOrder } from './maintenance.models';
import { PREDICTIVE_SEED, PREVENTIVE_SEED, SERVICE_REQUEST_SEED, WORK_ORDER_SEED, withWorkOrderTotals } from './maintenance-seed.data';

/** Readable message for a failed call. */
export function apiErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
let idSeq = 0;
const newId = (resource: string) => `${resource}-${Date.now().toString(36)}-${(++idSeq).toString(36)}`;

/**
 * In-memory copy of one Maintenance resource (static demo: seeded data, no backend). Pages read `items()` and
 * call `load()` on init; `save()` creates when the record has no id, otherwise updates, and `remove()` deletes.
 * Changes last for the browser session.
 */
export class ResourceStore<T extends MaintenanceAudit> {
  readonly items = signal<T[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly count = computed(() => this.items().length);

  constructor(
    private readonly auth: AuthService,
    readonly resource: string,
    private readonly seed: T[],
    /** Server-side rules applied on every save (e.g. work order totals and history). */
    private readonly prepare: (row: T, previous: T | undefined, actor: string) => T = (row) => row
  ) {}

  /** Fills the list from the seed once; later calls keep the in-memory changes. */
  load(_force = false): void {
    if (this.loaded()) return;
    this.items.set(clone(this.seed).filter((r) => !r.isDeleted));
    this.loaded.set(true);
  }

  byId(id: string | null | undefined): T | undefined {
    return id ? this.items().find((r) => r.id === id) : undefined;
  }

  save(record: Partial<T>): Observable<T> {
    this.load();
    const actor = currentUserName(this.auth);
    const now = new Date().toISOString();
    const previous = record.id ? this.byId(record.id) : undefined;
    if (previous) {
      const saved = this.prepare({ ...previous, ...clone(record), updatedBy: actor, updatedAt: now } as T, previous, actor);
      this.items.update((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      return of(clone(saved));
    }
    const user = this.auth.getUser();
    const created = this.prepare(
      {
        ...clone(record),
        id: newId(this.resource),
        createdBy: actor,
        createdAt: now,
        updatedBy: actor,
        updatedAt: now,
        clientId: user?.clientId ?? null,
        tenantId: user?.tenantId ?? null,
        isDeleted: false
      } as T,
      undefined,
      actor
    );
    this.items.update((rows) => [created, ...rows]);
    return of(clone(created));
  }

  remove(id: string): Observable<unknown> {
    this.items.update((rows) => rows.filter((r) => r.id !== id));
    return of(null);
  }
}

/** Work order rules the Maintenance service applies: defaults, start / end stamps, costs and history. */
function prepareWorkOrder(w: WorkOrder, previous: WorkOrder | undefined, actor: string): WorkOrder {
  const now = new Date().toISOString();
  const status = w.status || 'Open';
  const next: WorkOrder = {
    ...w,
    status,
    tasks: w.tasks ?? [],
    parts: w.parts ?? [],
    labour: w.labour ?? [],
    documents: w.documents ?? [],
    history: w.history ?? [],
    additionalCost: Number(w.additionalCost) || 0,
    progress: status === 'Completed' ? 100 : Number(w.progress) || 0,
    actualStartDate: w.actualStartDate ?? (['In Progress', 'Completed'].includes(status) ? now : null),
    actualEndDate: status === 'Completed' ? w.actualEndDate ?? now : w.actualEndDate ?? null
  };
  const entry = !previous
    ? { at: now, by: actor, action: 'Created', details: next.source && next.source !== 'Manual' ? `Raised from ${next.source}${next.sourceReference ? ` ${next.sourceReference}` : ''}` : null }
    : previous.status !== status
      ? { at: now, by: actor, action: 'Status changed', details: `${previous.status ?? 'Open'} → ${status}` }
      : { at: now, by: actor, action: 'Updated', details: null };
  next.history = [entry, ...next.history];
  return withWorkOrderTotals(next);
}

/** Display name of the signed-in user (user name, else email). */
export function currentUserName(auth: AuthService): string {
  return auth.getUser()?.userName || auth.getUserEmail() || 'unknown';
}

/** One store per Maintenance resource, shared by every page so data loads once per session. */
@Injectable({ providedIn: 'root' })
export class MaintenanceApi {
  private readonly auth = inject(AuthService);

  readonly preventive = new ResourceStore<PreventiveMaintenance>(this.auth, 'preventive-maintenance', PREVENTIVE_SEED);
  readonly predictive = new ResourceStore<PredictiveMaintenance>(this.auth, 'predictive-maintenance', PREDICTIVE_SEED);
  readonly serviceRequests = new ResourceStore<ServiceRequest>(this.auth, 'issue-reports', SERVICE_REQUEST_SEED);
  readonly workOrders = new ResourceStore<WorkOrder>(this.auth, 'work-orders', WORK_ORDER_SEED, prepareWorkOrder);

  /** True when `name` is the signed-in user (matches user name or email, case-insensitive). */
  isMe(name: string | null | undefined): boolean {
    const n = (name ?? '').trim().toLowerCase();
    if (!n) return false;
    const user = this.auth.getUser();
    return [user?.userName, user?.email, this.auth.getUserEmail()].some((v) => !!v && v.toLowerCase() === n);
  }
}

/**
 * Next running number for a code series, e.g. nextCode('WO', ['WO-2026-007']) -> 'WO-2026-008'.
 * Codes from other years are ignored so each year restarts at 001.
 */
export function nextCode(prefix: string, existing: (string | null | undefined)[]): string {
  const year = new Date().getFullYear();
  const head = `${prefix}-${year}-`;
  const max = existing.reduce((m, c) => {
    if (!c?.startsWith(head)) return m;
    const n = parseInt(c.slice(head.length), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${head}${String(max + 1).padStart(3, '0')}`;
}
