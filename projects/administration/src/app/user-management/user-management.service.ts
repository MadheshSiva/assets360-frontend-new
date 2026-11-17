import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AuthService } from 'shared-ui';
import { CURRENT_USER } from '../shared/admin-common';
import { AdminUser, UserStatus } from './user-management.model';
import { seedUsers } from './user-management.data';

/** A readable message for a failed user action. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** DEMO MODE: users live in memory, seeded from user-management.data.ts; changes last for the session. */
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly auth = inject(AuthService);

  private readonly users = signal<AdminUser[]>(seedUsers().sort((a, b) => b.created.localeCompare(a.created)));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** The signed-in administrator's account, matched by email (the demo administrator when nobody matches). */
  get currentUserId(): string | null {
    const email = (this.auth.getUserEmail() || '').toLowerCase();
    return this.users().find((u) => u.email.toLowerCase() === email)?.id ?? this.users().find((u) => u.id === CURRENT_USER.id)?.id ?? null;
  }

  load(): void {
    // the list is already in memory
  }

  all(): AdminUser[] {
    return this.users();
  }

  find(id: string | null): AdminUser | undefined {
    return id ? this.users().find((u) => u.id === id) : undefined;
  }

  count(status?: UserStatus): number {
    return status ? this.users().filter((u) => u.status === status).length : this.users().length;
  }

  emailTaken(email: string, exceptId: string | null): boolean {
    const e = email.trim().toLowerCase();
    return this.users().some((u) => u.email.toLowerCase() === e && u.id !== exceptId);
  }

  employeeIdTaken(employeeId: string, exceptId: string | null): boolean {
    const e = employeeId.trim().toUpperCase();
    return this.users().some((u) => u.employeeId.toUpperCase() === e && u.id !== exceptId);
  }

  /** Next free EMP-#### number. */
  nextEmployeeId(): string {
    const max = this.users().reduce((m, u) => Math.max(m, Number(u.employeeId.replace(/\D/g, '')) || 0), 0);
    return `EMP-${String(max + 1).padStart(4, '0')}`;
  }

  /** Adds the user to the in-memory list. The password is accepted but not stored in the demo. */
  create(user: AdminUser, _password?: string): Observable<AdminUser> {
    const max = this.users().reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, '')) || 0), 0);
    const now = new Date().toISOString();
    const saved: AdminUser = {
      ...user,
      id: `USR-${String(max + 1).padStart(6, '0')}`,
      created: user.created || now,
      invitedAt: user.status === 'Pending' ? user.invitedAt ?? now : user.invitedAt
    };
    this.users.update((list) => [saved, ...list]);
    return of(saved);
  }

  update(user: AdminUser, _password?: string): Observable<AdminUser> {
    const saved = { ...user };
    this.users.update((list) => list.map((u) => (u.id === saved.id ? saved : u)));
    return of(saved);
  }

  /** Changes details without a save round-trip (e.g. the invitation date after a resend). */
  patchLocal(user: AdminUser): void {
    this.users.update((list) => list.map((u) => (u.id === user.id ? user : u)));
  }

  remove(id: string): Observable<void> {
    this.users.update((list) => list.filter((u) => u.id !== id));
    return of(undefined);
  }

  /** Why an account can't be suspended or deleted: yourself, or the last active System Administrator. */
  lockoutReason(user: AdminUser, removing: string[] = [user.id]): string | null {
    if (user.id === this.currentUserId) return 'You can’t suspend or delete your own account.';
    const isAdmin = (u: AdminUser) => u.primaryRole === 'System Administrator' || u.secondaryRoles.includes('System Administrator');
    if (isAdmin(user) && user.status === 'Active') {
      const others = this.users().filter((u) => isAdmin(u) && u.status === 'Active' && !removing.includes(u.id));
      if (!others.length) return `${user.name} is the last active System Administrator.`;
    }
    return null;
  }
}
