import { Injectable, inject } from '@angular/core';
import { Observable, concat, forkJoin, of, throwError, toArray } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { MDM_SEED } from './mdm-seed/mdm-seed';

/** Fields every master data entity carries. */
export interface MdmAudit {
  id: string;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** Readable message for a failed call. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong.';
}

/** Runs requests one after another and emits all results once. */
export function inSequence<T>(calls: Observable<T>[]): Observable<T[]> {
  return calls.length ? concat(...calls).pipe(toArray()) : of([]);
}

/** Runs requests in parallel and emits all results once. */
export function inParallel<T>(calls: Observable<T>[]): Observable<T[]> {
  return calls.length ? forkJoin(calls) : of([]);
}

type Row = Record<string, unknown> & { id: string };

/** STATIC DEMO: every master data resource lives in memory, seeded from MDM_SEED on first use. */
const TABLES = new Map<string, Row[]>();
let sequence = 0;

function table(resource: string): Row[] {
  let rows = TABLES.get(resource);
  if (!rows) {
    rows = structuredClone((MDM_SEED[resource]?.() ?? []) as Row[]);
    TABLES.set(resource, rows);
  }
  return rows;
}

function newId(): string {
  sequence += 1;
  return `demo${Date.now().toString(16)}${sequence.toString(16).padStart(4, '0')}`;
}

const copy = <T>(value: unknown): T => structuredClone(value) as T;
const notFound = () => throwError(() => new Error('Record not found.'));

/** `asset-categories/{id}/custom-fields` -> the parent resource and id. */
function nested(resource: string): { parent: string; id: string; field: string } | null {
  const m = /^(.+)\/([^/]+)\/([^/]+)$/.exec(resource);
  return m ? { parent: m[1], id: m[2], field: m[3] === 'custom-fields' ? 'customFields' : m[3] } : null;
}

/**
 * Master data store for `{resource}` paths (GET list, GET /{id}, POST, PUT /{id}, PATCH status, DELETE /{id}).
 * STATIC DEMO: no backend; records are kept in memory for the session.
 */
@Injectable({ providedIn: 'root' })
export class MdmApi {
  private readonly auth = inject(AuthService);

  /** Signed-in user for createdBy / updatedBy. */
  actor(): string {
    return this.auth.getUserEmail() || 'demo.user@purpleiq.ai';
  }

  /** Fields a created record gets alongside the body. */
  createStamp(): { createdBy: string; clientId: string; tenantId: string } {
    return { createdBy: this.actor(), clientId: environment.clientId, tenantId: environment.tenantId };
  }

  updateStamp(): { updatedBy: string } {
    return { updatedBy: this.actor() };
  }

  list<T>(resource: string, _query: Record<string, string | number | boolean | null | undefined> = {}): Observable<T[]> {
    return of(copy<T[]>(table(resource)));
  }

  get<T>(resource: string, id: string): Observable<T> {
    const row = table(resource).find((r) => r.id === id);
    return row ? of(copy<T>(row)) : notFound();
  }

  create<T>(resource: string, body: object): Observable<T> {
    const now = new Date().toISOString();
    const sub = nested(resource);
    if (sub) {
      const parent = table(sub.parent).find((r) => r.id === sub.id);
      if (!parent) return notFound();
      const child = { inherited: false, ...body, id: newId() };
      parent[sub.field] = [...((parent[sub.field] as unknown[]) ?? []), child];
      return of(copy<T>(child));
    }
    const row: Row = { status: 'Active', updatedBy: null, updatedAt: null, ...body, ...this.createStamp(), id: newId(), createdAt: now };
    table(resource).push(row);
    return of(copy<T>(row));
  }

  update<T>(resource: string, id: string, body: object): Observable<T> {
    const rows = table(resource);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return notFound();
    rows[index] = { ...rows[index], ...body, ...this.updateStamp(), id, updatedAt: new Date().toISOString() };
    return of(copy<T>(rows[index]));
  }

  setStatus<T>(resource: string, id: string, status: string): Observable<T> {
    return this.update<T>(resource, id, { status });
  }

  remove(resource: string, id: string): Observable<unknown> {
    const sub = nested(resource);
    if (sub) {
      const parent = table(sub.parent).find((r) => r.id === sub.id);
      if (parent) parent[sub.field] = ((parent[sub.field] as { id: string }[]) ?? []).filter((f) => f.id !== id);
      return of(null);
    }
    const rows = table(resource);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return notFound();
    rows.splice(index, 1);
    return of(null);
  }
}

/**
 * Store for resources the Asset service owns (asset categories), shared by the Assets pages and Master Data.
 * STATIC DEMO: same in-memory tables as MdmApi.
 */
@Injectable({ providedIn: 'root' })
export class AssetServiceApi extends MdmApi {}
