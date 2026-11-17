import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { CellState, PermAction, RoleRecord, RoleStatus, RoleType, blankRole } from './role-access.data';

/** Permission matrix as the API stores it: module -> action -> full | partial | none | na. */
type PermissionsDto = Record<string, Partial<Record<PermAction, CellState>>>;

/** Request body for POST {administrationApiUrl}api/roles */
interface CreateRoleRequest {
  roleName: string;
  roleCode: string;
  description: string | null;
  roleType: RoleType;
  status: RoleStatus;
  createdBy: string | null;
  tenantId: string;
  clientId: string;
  /** Drives which modules users with this role may open (role-based access) */
  permissions: PermissionsDto;
}

/** Request body for PUT {administrationApiUrl}api/roles/{roleId} */
type UpdateRoleRequest = Pick<CreateRoleRequest, 'roleName' | 'roleCode' | 'description' | 'roleType' | 'status' | 'permissions'>;

/** Raw shape returned by the roles API. */
interface RoleDto {
  roleId: string;
  roleName: string;
  roleCode: string;
  description: string | null;
  roleType: string;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
  permissions?: PermissionsDto | null;
}

/**
 * Maps a RoleDto onto the page model. The API only stores the role header (name, code, type, status, audit);
 * the permission matrix, data scope, approvals, security settings and user count have no backend fields yet,
 * so they come from `extras` (the client-side copy) or the blank-role defaults.
 */
function toAppRole(dto: RoleDto, extras?: RoleRecord): RoleRecord {
  const base = extras ? structuredClone(extras) : blankRole();
  // The stored matrix wins; modules it doesn't mention keep the page's defaults
  if (dto.permissions && Object.keys(dto.permissions).length) {
    for (const [module, actions] of Object.entries(base.permissions)) {
      const stored = dto.permissions[module];
      if (!stored) continue;
      for (const action of Object.keys(actions) as PermAction[]) {
        const state = stored[action];
        if (state && actions[action] !== 'na') actions[action] = state;
      }
    }
  }
  return {
    ...base,
    id: dto.roleId,
    name: dto.roleName,
    code: dto.roleCode,
    description: dto.description ?? '',
    type: dto.roleType === 'System' ? 'System' : 'Custom',
    status: dto.status === 'Inactive' ? 'Inactive' : 'Active',
    icon: extras?.icon ?? (dto.roleType === 'System' ? 'shield' : 'settings'),
    createdOn: (dto.createdAt ?? '').slice(0, 10),
    createdBy: dto.createdBy ?? '',
    updatedOn: (dto.updatedAt ?? dto.createdAt ?? '').slice(0, 10)
  };
}

/** Readable message for a failed Administration API call (validation problem, conflict or network error). */
export function adminApiError(err: unknown, service: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body?.errors) {
      const first = Object.values(body.errors as Record<string, string[]>)[0];
      if (first?.length) return first[0];
    }
    if (body?.message) return body.message;
    if (typeof body === 'string' && body.trim() && body.length < 200) return body;
    switch (err.status) {
      case 0: return `The ${service} service is unreachable. Check that the backend is running.`;
      case 401: return 'Your session has expired. Sign in again.';
      case 403: return `You don't have permission to change ${service}.`;
      case 404: return `It no longer exists on the server (404).`;
      case 405: return `The server doesn't support this action for ${service} yet (405).`;
      case 409: return `It conflicts with existing data (409).`;
    }
    if (err.status >= 500) return `The ${service} service had an internal error (${err.status}).`;
    if (err.status) return `The ${service} service rejected the request (${err.status}).`;
  }
  return `The ${service} service returned an error.`;
}

/** Roles from the Administration API (GET / POST / PUT / DELETE api/roles). */
@Injectable({ providedIn: 'root' })
export class RoleAccessService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.administrationApiUrl}api/roles`;

  private readonly roles = signal<RoleRecord[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private request: Observable<RoleRecord[]> | null = null;

  all(): RoleRecord[] {
    return this.roles();
  }

  byId(id: string): RoleRecord | undefined {
    return this.roles().find((r) => r.id === id);
  }

  /** GET /api/roles — replaces the list; client-only fields of roles already loaded are kept. */
  load(): Observable<RoleRecord[]> {
    this.loading.set(true);
    this.error.set(null);
    this.request = this.http.get<RoleDto[]>(this.apiUrl).pipe(
      map((list) => list.map((dto) => toAppRole(dto, this.byId(dto.roleId)))),
      tap({
        next: (roles) => this.roles.set(roles),
        error: (err) => {
          this.error.set(adminApiError(err, 'roles'));
          this.request = null;
        }
      }),
      finalize(() => this.loading.set(false)),
      shareReplay(1)
    );
    return this.request;
  }

  /** Loads once for pages that only need the role list (e.g. Module Access). */
  ensureLoaded(): Observable<RoleRecord[]> {
    return this.request ?? this.load();
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

  /** New roles: POST /api/roles; existing roles: PUT /api/roles/{roleId}. Emits the stored copy. */
  save(role: RoleRecord): Observable<RoleRecord> {
    if (role.id) {
      const update: UpdateRoleRequest = {
        roleName: role.name.trim(),
        roleCode: role.code.trim().toUpperCase(),
        description: role.description.trim() || null,
        roleType: role.type,
        status: role.status,
        permissions: role.permissions
      };
      return this.http.put<RoleDto>(`${this.apiUrl}/${encodeURIComponent(role.id)}`, update).pipe(
        map((dto) => toAppRole(dto, role)),
        tap((stored) => this.roles.update((list) => list.map((r) => (r.id === stored.id ? stored : r))))
      );
    }
    const request: CreateRoleRequest = {
      roleName: role.name.trim(),
      roleCode: role.code.trim().toUpperCase(),
      description: role.description.trim() || null,
      roleType: role.type,
      status: role.status,
      createdBy: this.auth.getUserEmail(),
      tenantId: environment.tenantId,
      clientId: environment.clientId,
      permissions: role.permissions
    };
    return this.http.post<RoleDto>(this.apiUrl, request).pipe(
      map((dto) => toAppRole(dto, role)),
      tap((stored) => this.roles.update((list) => [...list, stored]))
    );
  }

  /** DELETE /api/roles/{roleId} (soft delete). Fails with 409 while an access policy still uses the role. */
  remove(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`)
      .pipe(tap(() => this.roles.update((list) => list.filter((r) => r.id !== id))));
  }
}
