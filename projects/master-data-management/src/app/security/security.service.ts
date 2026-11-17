import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concat, map, of, switchMap, tap, toArray } from 'rxjs';
import { ApiCodeStore } from '../shared/code-store';
import { MdmAudit, inSequence } from '../shared/mdm-api';
import { ModuleRecord, PermissionRecord, PermissionType, RoleRecord, RoleType, SecurityStatus, UserRecord } from './security.model';

/*
 * Security masters backed by /api/master-data/{modules,permissions,roles,users}.
 * Permissions point at modules, roles at permissions and modules, users at roles. The pages work
 * with codes; the API links records by Mongo id ({ id, name }), so each store converts between them.
 * Load order matters for that: modules, then permissions, then roles, then users (see SecurityLoader).
 */

interface RefDto {
  id: string | null;
  name: string;
}

interface ModuleDto extends MdmAudit {
  moduleName: string;
  code: string;
  category: string;
  description: string | null;
  icon: string | null;
}

interface PermissionDto extends MdmAudit {
  permissionName: string;
  code: string;
  module: RefDto | null;
  type: string;
  description: string | null;
}

interface RoleDto extends MdmAudit {
  roleName: string;
  code: string;
  type: string;
  description: string | null;
  permissions: RefDto[];
  moduleAccess: RefDto[];
  userCount: number;
}

interface UserDto extends MdmAudit {
  code: string | null;
  fullName: string;
  username: string;
  email: string;
  department: RefDto | null;
  primaryRole: RefDto | null;
  additionalRoles: RefDto[];
  phone: string | null;
  photoUrl: string | null;
  employeeId: string | null;
  sites: string[];
  accountExpiry: string | null;
  mfaRequired: boolean;
  mustChangePassword: boolean;
  sendInvite: boolean;
  language: string | null;
  timeZone: string | null;
  dateFormat: string | null;
  emailNotifications: boolean;
  smsNotifications: boolean;
  lastLoginAt: string | null;
}

interface DepartmentDto {
  id: string;
  departmentName: string;
  status: string | null;
}

const stamp = (value: string | null | undefined) => (value ?? '').slice(0, 16);
const status = (value: string | null | undefined): SecurityStatus => (value === 'Inactive' ? 'Inactive' : 'Active');

/** Code-keyed store over the API, plus id <-> code lookups and the status PATCH. */
abstract class SecurityStore<T extends { code: string; name: string; status: SecurityStatus }, TDto extends MdmAudit> extends ApiCodeStore<T, TDto> {
  nameOf(code: string): string {
    return this.find(code)?.name ?? code;
  }

  /** Code of the loaded record with this Mongo id. */
  codeOf(id: string | null | undefined): string | undefined {
    return id ? this.records.find((r) => this.idOf(r.code) === id)?.code : undefined;
  }

  /** Codes of the referenced records that are loaded; unknown ids are dropped. */
  codesOf(refs: RefDto[] | null | undefined): string[] {
    return (refs ?? []).map((r) => this.codeOf(r.id)).filter((c): c is string => !!c);
  }

  /** Reference body the API expects for a linked record. */
  ref(code: string): RefDto {
    return { id: this.idOf(code) ?? null, name: this.find(code)?.name ?? code };
  }

  setStatus(code: string, value: SecurityStatus): Observable<T> {
    return this.api.setStatus<TDto>(this.resource, this.idOf(code) ?? '', value).pipe(
      map((dto) => {
        const saved = this.toRecord(dto);
        this.save(saved, code);
        return saved;
      })
    );
  }
}

@Injectable({ providedIn: 'root' })
export class ModuleService extends SecurityStore<ModuleRecord, ModuleDto> {
  protected readonly resource = 'modules';

  constructor() {
    super();
  }

  protected toRecord(dto: ModuleDto): ModuleRecord {
    return {
      code: dto.code,
      name: dto.moduleName,
      category: dto.category,
      description: dto.description ?? '',
      icon: dto.icon ?? 'box',
      status: status(dto.status),
      createdOn: stamp(dto.createdAt),
      updatedOn: stamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: ModuleRecord): object {
    return { moduleName: r.name, code: r.code, category: r.category, description: r.description, icon: r.icon, status: r.status };
  }
}

@Injectable({ providedIn: 'root' })
export class PermissionService extends SecurityStore<PermissionRecord, PermissionDto> {
  protected readonly resource = 'permissions';
  private readonly modules = inject(ModuleService);

  constructor() {
    super();
  }

  protected toRecord(dto: PermissionDto): PermissionRecord {
    return {
      code: dto.code,
      name: dto.permissionName,
      module: this.modules.codeOf(dto.module?.id) ?? '',
      type: dto.type as PermissionType,
      description: dto.description ?? '',
      status: status(dto.status),
      createdOn: stamp(dto.createdAt),
      updatedOn: stamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: PermissionRecord): object {
    return { permissionName: r.name, code: r.code, module: this.modules.ref(r.module), type: r.type, description: r.description, status: r.status };
  }

  ofModule(code: string): PermissionRecord[] {
    return this.records.filter((r) => r.module === code);
  }

  /** Name must be unique within its module only. */
  isNameTakenIn(module: string, name: string, exceptCode: string | null): boolean {
    const wanted = name.trim().toLowerCase();
    return this.records.some((r) => r.module === module && r.name.toLowerCase() === wanted && r.code !== exceptCode);
  }

  /** Carries a renamed module code into the permissions (the API links by id, so this is local only). */
  recodeModule(from: string, to: string): void {
    if (from === to) return;
    this.records = this.records.map((r) => (r.module === from ? { ...r, module: to } : r));
  }
}

@Injectable({ providedIn: 'root' })
export class RoleService extends SecurityStore<RoleRecord, RoleDto> {
  protected readonly resource = 'roles';
  private readonly modules = inject(ModuleService);
  private readonly permissions = inject(PermissionService);

  constructor() {
    super();
  }

  protected toRecord(dto: RoleDto): RoleRecord {
    return {
      code: dto.code,
      name: dto.roleName,
      type: dto.type as RoleType,
      description: dto.description ?? '',
      status: status(dto.status),
      permissions: this.permissions.codesOf(dto.permissions),
      modules: this.modules.codesOf(dto.moduleAccess),
      createdOn: stamp(dto.createdAt),
      updatedOn: stamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: RoleRecord): object {
    return {
      roleName: r.name,
      code: r.code,
      type: r.type,
      description: r.description,
      permissions: r.permissions.map((c) => this.permissions.ref(c)),
      moduleAccess: r.modules.map((c) => this.modules.ref(c)),
      status: r.status
    };
  }

  withPermission(code: string): RoleRecord[] {
    return this.records.filter((r) => r.permissions.includes(code));
  }

  withModule(code: string): RoleRecord[] {
    return this.records.filter((r) => r.modules.includes(code));
  }

  /** Carries a renamed permission or module code into every role (the API links by id, so this is local only). */
  recode(field: 'permissions' | 'modules', from: string, to: string): void {
    if (from === to) return;
    this.records = this.records.map((r) => (r[field].includes(from) ? { ...r, [field]: r[field].map((c) => (c === from ? to : c)) } : r));
  }

  /** Saves several roles one after another, e.g. after granting them a module. */
  persistAll(roles: RoleRecord[]): Observable<RoleRecord[]> {
    return inSequence(roles.map((r) => this.persist(r, r.code)));
  }
}

@Injectable({ providedIn: 'root' })
export class UserService extends SecurityStore<UserRecord, UserDto> {
  protected readonly resource = 'users';
  private readonly roles = inject(RoleService);
  // Departments from the master data department list, for the user form
  private departmentList: { id: string; name: string; active: boolean }[] = [];

  constructor() {
    super();
  }

  /** The signed-in user (matched by email); they can't remove or deactivate themselves. */
  get currentUser(): string {
    const email = this.api.actor().toLowerCase();
    return this.records.find((u) => u.email.toLowerCase() === email)?.code ?? '';
  }

  /** Reads the department list; a failure leaves it empty rather than blocking the users. */
  loadDepartments(): Observable<unknown> {
    return this.api.list<DepartmentDto>('departments').pipe(
      tap((dtos) => (this.departmentList = dtos.map((d) => ({ id: d.id, name: d.departmentName, active: d.status !== 'Inactive' })))),
      catchError(() => of([]))
    );
  }

  /** Active department names, plus `keep` when a user already has an inactive or unknown one. */
  departmentNames(keep = ''): string[] {
    const names = this.departmentList.filter((d) => d.active || d.name === keep).map((d) => d.name);
    return keep && !names.includes(keep) ? [...names, keep] : names;
  }

  protected toRecord(dto: UserDto): UserRecord {
    return {
      code: dto.code || dto.id,
      name: dto.fullName,
      username: dto.username,
      email: dto.email,
      department: dto.department?.name ?? '',
      primaryRole: this.roles.codeOf(dto.primaryRole?.id) ?? '',
      additionalRoles: this.roles.codesOf(dto.additionalRoles),
      phone: dto.phone ?? '',
      photo: dto.photoUrl || null,
      status: status(dto.status),
      employeeId: dto.employeeId ?? '',
      sites: dto.sites ?? [],
      accountExpiry: (dto.accountExpiry ?? '').slice(0, 10),
      mfaRequired: dto.mfaRequired,
      mustChangePassword: dto.mustChangePassword,
      sendInvite: dto.sendInvite,
      language: dto.language ?? '',
      timeZone: dto.timeZone ?? '',
      dateFormat: dto.dateFormat ?? '',
      emailNotifications: dto.emailNotifications,
      smsNotifications: dto.smsNotifications,
      lastLogin: stamp(dto.lastLoginAt),
      createdOn: stamp(dto.createdAt),
      updatedOn: stamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(u: UserRecord): object {
    const department = this.departmentList.find((d) => d.name === u.department);
    return {
      code: u.code,
      fullName: u.name,
      username: u.username,
      email: u.email,
      department: u.department ? { id: department?.id ?? null, name: u.department } : null,
      primaryRole: u.primaryRole ? this.roles.ref(u.primaryRole) : null,
      additionalRoles: u.additionalRoles.map((c) => this.roles.ref(c)),
      phone: u.phone,
      photoUrl: u.photo,
      employeeId: u.employeeId,
      sites: u.sites,
      accountExpiry: u.accountExpiry || null,
      mfaRequired: u.mfaRequired,
      mustChangePassword: u.mustChangePassword,
      sendInvite: u.sendInvite,
      language: u.language || null,
      timeZone: u.timeZone || null,
      dateFormat: u.dateFormat || null,
      emailNotifications: u.emailNotifications,
      smsNotifications: u.smsNotifications,
      status: u.status
    };
  }

  /** Users holding the role, as primary or additional role. */
  withRole(code: string): UserRecord[] {
    return this.records.filter((u) => u.primaryRole === code || u.additionalRoles.includes(code));
  }

  isUsernameTaken(username: string, exceptCode: string | null): boolean {
    const wanted = username.trim().toLowerCase();
    return this.records.some((u) => u.username.toLowerCase() === wanted && u.code !== exceptCode);
  }

  isEmailTaken(email: string, exceptCode: string | null): boolean {
    const wanted = email.trim().toLowerCase();
    return this.records.some((u) => u.email.toLowerCase() === wanted && u.code !== exceptCode);
  }

  nextCode(): string {
    const max = this.records.reduce((m, r) => (r.code.startsWith('USR-') ? Math.max(m, Number(r.code.replace(/\D/g, '')) || 0) : m), 0);
    return `USR-${String(max + 1).padStart(3, '0')}`;
  }

  /** Carries a renamed role code into the users (the API links by id, so this is local only). */
  recodeRole(from: string, to: string): void {
    if (from === to) return;
    this.records = this.records.map((u) =>
      u.primaryRole === from || u.additionalRoles.includes(from)
        ? { ...u, primaryRole: u.primaryRole === from ? to : u.primaryRole, additionalRoles: u.additionalRoles.map((c) => (c === from ? to : c)) }
        : u
    );
  }
}

/**
 * Loads every security master in dependency order, since each one maps the earlier ones' ids to
 * codes. Every security page calls this when it opens.
 */
@Injectable({ providedIn: 'root' })
export class SecurityLoader {
  private readonly modules = inject(ModuleService);
  private readonly permissions = inject(PermissionService);
  private readonly roles = inject(RoleService);
  private readonly users = inject(UserService);

  load(): Observable<unknown> {
    return concat(this.modules.load(), this.users.loadDepartments(), this.permissions.load()).pipe(
      toArray(),
      switchMap(() => this.roles.load()),
      switchMap(() => this.users.load())
    );
  }
}
