import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, map, reduce, throwError } from 'rxjs';
import { environment } from 'shared-ui';

/** Full URL of a Tracking service resource, e.g. trackingUrl('tag-ids') → {gateway}api/tag-ids. */
export function trackingUrl(resource: string): string {
  return `${environment.trackingApiUrl}api/${resource}`;
}

/** clientId / tenantId every Tracking call is scoped to, plus any extra query values (empty ones are skipped). */
export function tenantParams(extra: Record<string, string | number | boolean | null | undefined> = {}): HttpParams {
  let params = new HttpParams().set('clientId', environment.clientId).set('tenantId', environment.tenantId);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
  }
  return params;
}

/** One page of a Tracking list endpoint. */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Every row of a list endpoint that returns pages ({ items, page, totalPages }), fetched page by page and joined.
 * A plain array response is still accepted.
 */
export function getAllPages<T>(
  http: HttpClient,
  url: string,
  extra: Record<string, string | number | boolean | null | undefined> = {},
  pageSize = 100,
): Observable<T[]> {
  const page = (n: number) => http.get<PagedResult<T> | T[]>(url, { params: tenantParams({ ...extra, page: n, pageSize }) });
  return page(1).pipe(
    expand((res) => (!Array.isArray(res) && res && res.page < res.totalPages ? page(res.page + 1) : EMPTY)),
    map((res) => (Array.isArray(res) ? res : res?.items ?? [])),
    reduce((all, rows) => all.concat(rows), [] as T[]),
  );
}

/**
 * The record in a successful POST / PUT body read as text: the record itself, or a { data } / { item } wrapper.
 * Null when the body is empty, plain text or has no `key` field (callers then reload the record).
 */
export function savedRecord<T>(body: string, key: keyof T & string): T | null {
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
  const obj = parsed as Record<string, unknown> | null;
  const rec = (obj?.[key] ? obj : obj?.['data'] ?? obj?.['item'] ?? null) as Record<string, unknown> | null;
  return rec?.[key] ? (rec as T) : null;
}

/** Fields every create / update request carries. */
export function tenantBody(): { clientId: string; tenantId: string } {
  return { clientId: environment.clientId, tenantId: environment.tenantId };
}

/** Readable message for an API failure: { message }, ASP.NET validation { errors }, or a network failure. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) return err instanceof Error && err.message ? err.message : fallback;
  if (err.status === 0) return 'Cannot reach the server. Check that the backend is running.';
  const body = err.error;
  const firstError = body?.errors && typeof body.errors === 'object' ? Object.values(body.errors).flat()[0] : undefined;
  if (typeof firstError === 'string') return firstError;
  if (typeof body?.message === 'string') return body.message;
  if (typeof body?.title === 'string') return body.title;
  return fallback;
}

/** catchError handler that rethrows the failure as an Error with a readable message. */
export function apiError(err: unknown, fallback: string): Observable<never> {
  return throwError(() => new Error(apiErrorMessage(err, fallback)));
}
