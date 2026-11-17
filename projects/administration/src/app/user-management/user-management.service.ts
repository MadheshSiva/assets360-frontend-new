import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { adminApiError } from '../role-access-control/role-access.service';
import { CURRENT_USER } from '../shared/admin-common';
import { AdminUser, UserStatus } from './user-management.model';
import { ALL_LOCATIONS, roleModules } from './user-management.data';

/** UserResponse from the Administration API. */
interface UserDto {
  userId: string;
  name: string;
  username: string;
  image: string | null;
  email: string;
  employeeId: string | null;
  department: string | null;
  jobTitle: string | null;
  phone: string | null;
  location: string | null;
  timeZone: string | null;
  primaryRole: string;
  secondaryRoles: string[];
  accessScope: string | null;
  mfaEnabled: boolean;
  moduleAccess: string[];
  accountStatus: string | null;
  lastLoginAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
}

/** Request body for POST {administrationApiUrl}api/users */
interface CreateUserRequest {
  name: string;
  username: string;
  image: string | null;
  email: string;
  employeeId: string;
  department: string;
  jobTitle: string;
  phone: string;
  location: string;
  timeZone: string;
  primaryRole: string;
  secondaryRoles: string[];
  accessScope: string;
  mfaEnabled: boolean;
  moduleAccess: string[];
  accountStatus: UserStatus;
  createdBy: string;
  tenantId: string;
  clientId: string;
  /** Sign-in password; the API hands it to the UserAccount service (hashed there) and never returns it */
  password?: string;
}

/** Request body for PUT {administrationApiUrl}api/users/{userId}; a missing password keeps the current one */
type UpdateUserRequest = Omit<CreateUserRequest, 'createdBy' | 'tenantId' | 'clientId'>;

const STATUSES: UserStatus[] = ['Active', 'Pending', 'Suspended'];

function toAppUser(dto: UserDto): AdminUser {
  const status = STATUSES.find((s) => s.toLowerCase() === dto.accountStatus?.toLowerCase()) ?? 'Pending';
  const created = dto.createdAt ?? '';
  return {
    id: dto.userId,
    name: dto.name,
    email: dto.email,
    employeeId: dto.employeeId ?? '',
    department: dto.department ?? '',
    jobTitle: dto.jobTitle ?? '',
    phone: dto.phone ?? '',
    location: dto.location ?? '',
    timeZone: dto.timeZone ?? '',
    photo: dto.image,
    primaryRole: dto.primaryRole,
    secondaryRoles: dto.secondaryRoles ?? [],
    accessScope: dto.accessScope ?? ALL_LOCATIONS,
    mfa: dto.mfaEnabled,
    status,
    // Not stored by the API: the suspension reason, and the invitation date is taken as the creation date
    suspendReason: '',
    lastLogin: dto.lastLoginAt,
    created,
    invitedAt: status === 'Pending' && created ? created : null,
    modules: dto.moduleAccess?.length ? dto.moduleAccess : roleModules([dto.primaryRole, ...(dto.secondaryRoles ?? [])])
  };
}

/** The editable fields shared by create and update. The API needs a username the UI doesn't collect, so the email is used. */
function toFields(user: AdminUser): UpdateUserRequest {
  return {
    name: user.name,
    username: user.email,
    image: user.photo,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    jobTitle: user.jobTitle,
    phone: user.phone,
    location: user.location,
    timeZone: user.timeZone,
    primaryRole: user.primaryRole,
    secondaryRoles: user.secondaryRoles,
    accessScope: user.accessScope,
    mfaEnabled: user.mfa,
    moduleAccess: user.modules,
    accountStatus: user.status
  };
}

/** A readable message from a validation problem, a conflict or a network failure. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body?.errors) return (Object.values(body.errors) as string[][]).flat().join(' ');
    if (body?.message) return body.message;
    if (err.status === 0) return 'The Administration service could not be reached. Check that the backend is running.';
    // say why the server refused it, e.g. an endpoint the backend doesn't have yet (405)
    if (err.status) return `${fallback} ${adminApiError(err, 'users')}`;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.administrationApiUrl}api/users`;

  private readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  /** The signed-in administrator's account, matched by email. */
  get currentUserId(): string | null {
    const email = (this.auth.getUserEmail() || CURRENT_USER.email).toLowerCase();
    return this.users().find((u) => u.email.toLowerCase() === email)?.id ?? null;
  }

  /** GET /api/users for this tenant, newest first. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<UserDto[]>(this.apiUrl, { params: { tenantId: environment.tenantId, clientId: environment.clientId } }).subscribe({
      next: (list) => {
        this.users.set(list.map(toAppUser).sort((a, b) => b.created.localeCompare(a.created)));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Users could not be loaded from the Administration service.'));
        this.loading.set(false);
      }
    });
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

  /** POST /api/users. With a password the user also gets a sign-in account (email + password). */
  create(user: AdminUser, password?: string): Observable<AdminUser> {
    const request: CreateUserRequest = {
      ...toFields(user),
      createdBy: this.auth.getUserEmail() || 'unknown',
      tenantId: environment.tenantId,
      clientId: environment.clientId,
      ...(password ? { password } : {})
    };
    return this.http.post<UserDto>(this.apiUrl, request).pipe(
      map(toAppUser),
      tap((saved) => this.users.update((list) => [saved, ...list]))
    );
  }

  /**
   * PUT /api/users/{id}; the username follows the email as on create. The suspension reason and invitation date
   * aren't stored by the API, so the values sent are kept on the returned copy for this session.
   */
  update(user: AdminUser, password?: string): Observable<AdminUser> {
    const request: UpdateUserRequest = { ...toFields(user), ...(password ? { password } : {}) };
    return this.http.put<UserDto>(`${this.apiUrl}/${user.id}`, request).pipe(
      map((dto) => {
        const saved = toAppUser(dto);
        return { ...saved, suspendReason: user.suspendReason, invitedAt: user.invitedAt ?? saved.invitedAt };
      }),
      tap((saved) => this.users.update((list) => list.map((u) => (u.id === saved.id ? saved : u))))
    );
  }

  /** Changes only client-side details the API doesn't store (e.g. the invitation date after a resend). */
  patchLocal(user: AdminUser): void {
    this.users.update((list) => list.map((u) => (u.id === user.id ? user : u)));
  }

  /** DELETE /api/users/{id}; the user leaves the list once the server confirms. */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(tap(() => this.users.update((list) => list.filter((u) => u.id !== id))));
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
