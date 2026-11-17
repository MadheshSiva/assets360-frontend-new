import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { todayIso } from '../shared/admin-common';
import { UserAdminService } from '../user-management/user-management.service';
import { RoleRecord, seedRoles } from './role-access.data';

/** Readable message for a failed role / user action. */
export function adminApiError(err: unknown, service: string): string {
  if (err instanceof Error && err.message) return err.message;
  return `The ${service} change could not be saved.`;
}

/** DEMO MODE: roles live in memory, seeded from role-access.data.ts; changes last for the session. */
@Injectable({ providedIn: 'root' })
export class RoleAccessService {
  private readonly userService = inject(UserAdminService);
  // seeded user counts follow the seeded users holding each role
  private readonly roles = signal<RoleRecord[]>(seedRoles().map((r) => ({ ...r, users: this.members(r.name).length })));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  all(): RoleRecord[] {
    return this.roles();
  }

  byId(id: string): RoleRecord | undefined {
    return this.roles().find((r) => r.id === id);
  }

  load(): Observable<RoleRecord[]> {
    return of(this.roles());
  }

  /** Loads once for pages that only need the role list (e.g. Module Access). */
  ensureLoaded(): Observable<RoleRecord[]> {
    return this.load();
  }

  /** Names of the users holding the role (primary or secondary). */
  members(roleName: string): string[] {
    return this.userService
      .all()
      .filter((u) => u.primaryRole === roleName || u.secondaryRoles.includes(roleName))
      .map((u) => u.name);
  }

  /** True when another role already uses the code (case-insensitive). */
  codeTaken(code: string, exceptId: string): boolean {
    const c = code.trim().toUpperCase();
    return this.roles().some((r) => r.id !== exceptId && r.code.toUpperCase() === c);
  }

  /** A free code built from the base, e.g. OPS_MANAGER_COPY, OPS_MANAGER_COPY_2 */
  uniqueCode(base: string): string {
    let code = base;
    for (let n = 2; this.codeTaken(code, ''); n++) code = `${base}_${n}`;
    return code;
  }

  /** Adds a new role or replaces an existing one. Emits the stored copy. */
  save(role: RoleRecord): Observable<RoleRecord> {
    const stored: RoleRecord = {
      ...structuredClone(role),
      name: role.name.trim(),
      code: role.code.trim().toUpperCase(),
      description: role.description.trim(),
      updatedOn: todayIso()
    };
    if (role.id && this.byId(role.id)) {
      this.roles.update((list) => list.map((r) => (r.id === stored.id ? stored : r)));
      return of(stored);
    }
    stored.id = this.nextId();
    stored.createdOn = todayIso();
    stored.createdBy = stored.createdBy || 'Sarah Ahmed';
    this.roles.update((list) => [...list, stored]);
    return of(stored);
  }

  remove(id: string): Observable<void> {
    this.roles.update((list) => list.filter((r) => r.id !== id));
    return of(undefined);
  }

  private nextId(): string {
    const max = this.roles().reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 0);
    return `ROLE-${String(max + 1).padStart(3, '0')}`;
  }
}
