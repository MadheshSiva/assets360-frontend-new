import { Observable, delay, of, throwError } from 'rxjs';

/**
 * Helpers for the static demo services. Nothing in Tracking & IoT calls a backend: every service answers from the
 * in-memory demo records (the `*.data.ts` files next to it). Changes live until the page is reloaded.
 */

/** Simulated network latency of the demo services, ms. */
export const DEMO_LATENCY_MS = 150;

/** Deep copy, so callers never mutate the in-memory demo records by accident. */
export function clone<T>(value: T): T {
  return value === undefined || value === null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** A copy of `value`, delivered after the demo latency. */
export function demo<T>(value: T, ms = DEMO_LATENCY_MS): Observable<T> {
  return of(clone(value)).pipe(delay(ms));
}

/** A failed demo call with a readable message. */
export function demoError(message: string): Observable<never> {
  return throwError(() => new Error(message));
}

/** ISO timestamp `minutes` before now. */
export function isoMinutesAgo(minutes: number, now = Date.now()): string {
  return new Date(now - minutes * 60_000).toISOString();
}

/** ISO timestamp `days` before now (fractions allowed). */
export function isoDaysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * 86_400_000).toISOString();
}

/** UTC midnight `days` from today (negative = in the past), as ISO. */
export function isoUtcDay(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Next id in a sequence like DM000012: `prefix` + the highest existing number + 1, zero padded. */
export function nextSequenceId(prefix: string, ids: string[], width = 6): string {
  const max = ids.reduce((m, id) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return prefix + String(max + 1).padStart(width, '0');
}

/** A random-looking unique record id (24 hex chars, like a Mongo ObjectId). */
export function newRecordId(): string {
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
  return Date.now().toString(16).slice(-8).padStart(8, '0') + hex(8) + hex(8);
}

/** Deterministic hash of a string (FNV-1a), for stable pseudo-random demo values. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic value in [0, 1) for a seed. */
export function seeded(seed: string): number {
  return (hashOf(seed) % 100_000) / 100_000;
}

/** Name shown as the author of demo changes when nobody is signed in. */
export const DEMO_USER = 'demo.user';

/** Readable message for a failed call. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
