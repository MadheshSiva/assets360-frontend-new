import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concat, forkJoin, of, toArray } from 'rxjs';
import { AuthService, environment } from 'shared-ui';

/** Base of every master data resource, e.g. `${MDM_API}criticalities`. Calls go through the API gateway. */
export const MDM_API = `${environment.masterDataApiUrl}api/master-data/`;

/** Fields every master data entity carries on the API side. */
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

/** Readable message for a failed call: first validation error, the server's `message`, or the status. */
export function apiErrorMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'Something went wrong.';
  if (err.status === 0) return 'Master data service is unreachable.';
  const body = err.error;
  if (body?.errors && typeof body.errors === 'object') {
    const first = Object.values(body.errors as Record<string, string[]>).flat()[0];
    if (first) return first;
  }
  if (typeof body?.message === 'string') return body.message;
  if (typeof body?.title === 'string') return body.title;
  if (err.status === 404) return 'Record not found.';
  if (err.status === 409) return 'A record with this code already exists.';
  return `Request failed (${err.status}).`;
}

/** Runs requests one after another and emits all results once, so bulk actions don't flood the API. */
export function inSequence<T>(calls: Observable<T>[]): Observable<T[]> {
  return calls.length ? concat(...calls).pipe(toArray()) : of([]);
}

/** Runs requests in parallel and emits all results once. */
export function inParallel<T>(calls: Observable<T>[]): Observable<T[]> {
  return calls.length ? forkJoin(calls) : of([]);
}

/**
 * Thin HttpClient wrapper for `/api/master-data/{resource}`. Every resource follows the same shape:
 * GET list, GET /{id}, POST, PUT /{id}, PATCH /{id}/status (most), DELETE /{id}; ids are Mongo ids.
 */
@Injectable({ providedIn: 'root' })
export class MdmApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  /** Where the resources live; a subclass can point a store at another service (see AssetServiceApi). */
  protected readonly base: string = MDM_API;

  /** Signed-in user for createdBy / updatedBy. */
  actor(): string {
    return this.auth.getUserEmail() || 'unknown';
  }

  /** Fields the create requests expect alongside the record. */
  createStamp(): { createdBy: string; clientId: string; tenantId: string } {
    return { createdBy: this.actor(), clientId: environment.clientId, tenantId: environment.tenantId };
  }

  updateStamp(): { updatedBy: string } {
    return { updatedBy: this.actor() };
  }

  list<T>(resource: string, query: Record<string, string | number | boolean | null | undefined> = {}): Observable<T[]> {
    let params = new HttpParams().set('clientId', environment.clientId);
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<T[]>(this.base + resource, { params });
  }

  get<T>(resource: string, id: string): Observable<T> {
    return this.http.get<T>(`${this.base}${resource}/${id}`);
  }

  create<T>(resource: string, body: object): Observable<T> {
    return this.http.post<T>(this.base + resource, { ...body, ...this.createStamp() });
  }

  update<T>(resource: string, id: string, body: object): Observable<T> {
    return this.http.put<T>(`${this.base}${resource}/${id}`, { ...body, ...this.updateStamp() });
  }

  setStatus<T>(resource: string, id: string, status: string): Observable<T> {
    return this.http.patch<T>(`${this.base}${resource}/${id}/status`, { status, ...this.updateStamp() });
  }

  remove(resource: string, id: string): Observable<unknown> {
    return this.http.delete(`${this.base}${resource}/${id}`);
  }
}

/**
 * MdmApi for resources the Asset service owns: `${assetApiUrl}api/{resource}`. Asset categories live there, so the
 * Assets pages, Asset Registration and Master Data all share one list.
 */
@Injectable({ providedIn: 'root' })
export class AssetServiceApi extends MdmApi {
  protected override readonly base = `${environment.assetApiUrl}api/`;
}
