import { RoleRecord } from '../role-access-control/role-access.data';
import { ADMIN_LOCATIONS } from '../shared/admin-common';
import { AdminUser, UserRole } from './user-management.model';

// Lookup lists for User Management; the users themselves come from the Administration API

/** The modules shown as access tiles in the user drawer. */
export const USER_MODULES = ['Dashboard', 'Assets', 'Maintenance', 'Inventory', 'Compliance', 'Reports'];

/** Roles offered in the user drawer / invite dialog; filled from GET api/roles by setUserRoles(). */
export const USER_ROLES: UserRole[] = [];

/** User modules whose name differs in the Role & Access Control permission matrix. */
const ROLE_MATRIX_MODULE: Record<string, string> = { Compliance: 'Audit & Compliance', Reports: 'Reports & Analytics' };

/**
 * Replaces USER_ROLES with the active roles from the Role & Access Control API. A role grants a user module when
 * its matrix allows View (full or partial) on that module.
 */
export function setUserRoles(roles: RoleRecord[]): void {
  const mapped = roles
    .filter((r) => r.status === 'Active')
    .map(
      (r): UserRole => ({
        name: r.name,
        short: r.name,
        tone: r.type === 'System' ? 'blue' : 'purple',
        modules: USER_MODULES.filter((m) => {
          const view = r.permissions[ROLE_MATRIX_MODULE[m] ?? m]?.view;
          return view === 'full' || view === 'partial';
        })
      })
    );
  USER_ROLES.splice(0, USER_ROLES.length, ...mapped);
}

export const ALL_LOCATIONS = 'All Locations';

/** Site -> time zone lookup; comes from the locations API (empty until wired). */
export const LOCATION_TIME_ZONES: Record<string, string> = {};

export const TIME_ZONES = ['(GMT+0) London, UK', '(GMT+3) Riyadh, KSA', '(GMT+4) Dubai, UAE', '(GMT+8) Singapore'];

/** Counts at the end of last month, for the "vs last month" trends on the stat cards (no history API yet). */
export const LAST_MONTH = { total: 0, active: 0, pending: 0, suspended: 0 };

export function blankUser(): AdminUser {
  return {
    id: '',
    name: '',
    email: '',
    employeeId: '',
    department: '',
    jobTitle: '',
    phone: '',
    location: ADMIN_LOCATIONS[0] ?? '',
    timeZone: LOCATION_TIME_ZONES[ADMIN_LOCATIONS[0] ?? ''] ?? '',
    photo: null,
    primaryRole: '',
    secondaryRoles: [],
    accessScope: ALL_LOCATIONS,
    mfa: true,
    status: 'Pending',
    suspendReason: '',
    lastLogin: null,
    created: '',
    invitedAt: null,
    modules: []
  };
}

export function roleModules(roles: string[]): string[] {
  const set = new Set(roles.flatMap((r) => USER_ROLES.find((x) => x.name === r)?.modules ?? []));
  return USER_MODULES.filter((m) => set.has(m));
}
