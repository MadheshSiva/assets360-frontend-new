/** Helpers for the static demo master data (see mdm-seed.ts). */

export type SeedRow = Record<string, unknown> & { id: string };

const CLIENT_ID = 'demo-client';
const TENANT_ID = 'demo-tenant';
const DEFAULT_CREATED = '2024-01-12T10:30';

/** Stable id of a seeded record, so records can reference each other. */
export function idFor(resource: string, key: string): string {
  return `${resource}-${key}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Local 'YYYY-MM-DDTHH:mm' (or a date) -> ISO date-time; null when empty. */
export function isoOf(local: string | null | undefined): string | null {
  if (!local) return null;
  const date = new Date(local.length === 10 ? `${local}T09:00` : local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Audit fields of a seeded record keyed by `key` (usually its code). */
export function audit(
  resource: string,
  key: string,
  r: { status?: string | null; createdOn?: string | null; createdBy?: string | null; updatedOn?: string | null } = {}
): SeedRow & { status: string | null } {
  return {
    id: idFor(resource, key),
    status: r.status ?? 'Active',
    createdBy: r.createdBy || 'Rex Kumar',
    createdAt: isoOf(r.createdOn) ?? isoOf(DEFAULT_CREATED),
    updatedBy: r.updatedOn ? r.createdBy || 'Rex Kumar' : null,
    updatedAt: isoOf(r.updatedOn),
    clientId: CLIENT_ID,
    tenantId: TENANT_ID
  };
}

/** `{ id, name }` reference to the record of `resource` with this name, or null when there is none. */
export function refByName<T extends { code: string; name: string }>(resource: string, list: T[], name: string | null | undefined): { id: string; name: string } | null {
  const hit = name ? list.find((r) => r.name === name) : undefined;
  return hit ? { id: idFor(resource, hit.code), name: hit.name } : null;
}

/** `{ id, name }` reference to the record of `resource` with this code, or null when there is none. */
export function refByCode<T extends { code: string; name?: string }>(resource: string, list: T[], code: string | null | undefined): { id: string; name: string } | null {
  const hit = code ? list.find((r) => r.code === code) : undefined;
  return hit ? { id: idFor(resource, hit.code), name: hit.name ?? hit.code } : null;
}

/** Memoises a seed builder so related resources share one generated list. */
export function once<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}
