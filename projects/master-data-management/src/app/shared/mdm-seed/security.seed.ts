import { initialModules, initialPermissions, initialRoles, initialUsers } from './legacy/security.legacy';
import { departmentRef } from './people.seed';
import { SeedRow, audit, idFor, once } from './seed-utils';

const modules = once(initialModules);
const permissions = once(initialPermissions);
const roles = once(initialRoles);
const users = once(initialUsers);

function ref(resource: string, list: { code: string; name: string }[], code: string): { id: string | null; name: string } {
  const hit = list.find((r) => r.code === code);
  return hit ? { id: idFor(resource, hit.code), name: hit.name } : { id: null, name: code };
}

/** Seeds of the Security masters, keyed by resource path. */
export const SECURITY_SEED: Record<string, () => SeedRow[]> = {
  modules: () =>
    modules().map((r) => ({ ...audit('modules', r.code, r), moduleName: r.name, code: r.code, category: r.category, description: r.description, icon: r.icon })),

  permissions: () =>
    permissions().map((r) => ({
      ...audit('permissions', r.code, r),
      permissionName: r.name,
      code: r.code,
      module: ref('modules', modules(), r.module),
      type: r.type,
      description: r.description
    })),

  roles: () =>
    roles().map((r) => ({
      ...audit('roles', r.code, r),
      roleName: r.name,
      code: r.code,
      type: r.type,
      description: r.description,
      permissions: r.permissions.map((c) => ref('permissions', permissions(), c)),
      moduleAccess: r.modules.map((c) => ref('modules', modules(), c)),
      userCount: users().filter((u) => u.primaryRole === r.code || u.additionalRoles.includes(r.code)).length
    })),

  users: () =>
    users().map((u) => ({
      ...audit('users', u.code, u),
      code: u.code,
      fullName: u.name,
      username: u.username,
      email: u.email,
      department: departmentRef(u.department),
      primaryRole: u.primaryRole ? ref('roles', roles(), u.primaryRole) : null,
      additionalRoles: u.additionalRoles.map((c) => ref('roles', roles(), c)),
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
      lastLoginAt: u.lastLogin ? new Date(u.lastLogin).toISOString() : null
    }))
};
