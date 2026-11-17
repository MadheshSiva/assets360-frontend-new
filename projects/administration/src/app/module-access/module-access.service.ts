import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { demoUsers } from '../role-access-control/role-access.data';
import { RoleAccessService } from '../role-access-control/role-access.service';
import { CURRENT_USER } from '../shared/admin-common';
import { PolicyRecord, seedPolicies } from './module-access.data';

/** DEMO MODE: access policies live in memory, seeded from module-access.data.ts; changes last for the session. */
@Injectable({ providedIn: 'root' })
export class ModuleAccessService {
  private readonly roles = inject(RoleAccessService);

  // seeded user counts follow the users holding the policy's roles
  private readonly policies = signal<PolicyRecord[]>(seedPolicies().map((p) => ({ ...p, users: this.members(p).length })));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  all(): PolicyRecord[] {
    return this.policies();
  }

  byId(id: string): PolicyRecord | undefined {
    return this.policies().find((p) => p.id === id);
  }

  load(): Observable<PolicyRecord[]> {
    return of(this.policies());
  }

  /**
   * Names of the users a policy covers: everyone holding one of its roles. Policies without roles
   * (named-user policies such as contractors) list their own named people.
   */
  members(policy: PolicyRecord): string[] {
    if (!policy.roles.length) return demoUsers(policy.id || policy.name, policy.users);
    return [...new Set(policy.roles.flatMap((r) => this.roles.members(r)))];
  }

  codeTaken(code: string, exceptId: string): boolean {
    const c = code.trim().toUpperCase();
    return this.policies().some((p) => p.id !== exceptId && p.code.toUpperCase() === c);
  }

  /** A free code from the base, e.g. OPS-MGR-001-COPY, OPS-MGR-001-COPY-2 */
  uniqueCode(base: string): string {
    let code = base;
    for (let n = 2; this.codeTaken(code, ''); n++) code = `${base}-${n}`;
    return code;
  }

  nameTaken(name: string, exceptId: string): boolean {
    const n = name.trim().toLowerCase();
    return this.policies().some((p) => p.id !== exceptId && p.name.toLowerCase() === n);
  }

  /** Adds a new policy or replaces an existing one. Emits the stored copy. */
  save(policy: PolicyRecord): Observable<PolicyRecord> {
    const stored: PolicyRecord = {
      ...structuredClone(policy),
      name: policy.name.trim(),
      code: policy.code.trim().toUpperCase(),
      description: policy.description.trim(),
      updatedAt: new Date().toISOString().slice(0, 19),
      updatedBy: CURRENT_USER.name
    };
    if (!stored.id || !this.byId(stored.id)) {
      const max = this.policies().reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, '')) || 0), 0);
      stored.id = `POL-${String(max + 1).padStart(3, '0')}`;
    }
    if (stored.roles.length) stored.users = this.members(stored).length;
    this.policies.update((list) =>
      list.some((p) => p.id === stored.id) ? list.map((p) => (p.id === stored.id ? stored : p)) : [...list, stored]
    );
    return of(stored);
  }

  remove(id: string): Observable<void> {
    this.policies.update((list) => list.filter((p) => p.id !== id));
    return of(undefined);
  }
}
