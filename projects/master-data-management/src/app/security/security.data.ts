import { ModuleRecord, PermissionRecord, PermissionType, RoleRecord, RoleType, SecurityStatus, UserRecord } from './security.model';

// Option lists for the security masters; the records themselves come from the API.

export const MODULE_CATEGORIES = [
  'General', 'Asset Management', 'Maintenance', 'Inspection', 'Inventory', 'Operations', 'Compliance', 'Analytics',
  'Tracking', 'Finance', 'Administration', 'Configuration'
];
export const PERMISSION_TYPES: PermissionType[] = ['Read', 'Create', 'Update', 'Delete', 'Approve', 'Manage', 'Execute'];
export const ROLE_TYPES: RoleType[] = ['System', 'Business', 'Operational', 'Read Only'];
export const LANGUAGES = ['English', 'Arabic', 'Hindi'];
export const TIME_ZONES = ['(GMT+04:00) Dubai', '(GMT+03:00) Riyadh', '(GMT+05:30) Kolkata', '(GMT+00:00) London'];
export const DATE_FORMATS = ['DD-MMM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
export function blankModule(): ModuleRecord {
  return { code: '', name: '', category: '', description: '', icon: 'box', status: '' as SecurityStatus, createdOn: '', updatedOn: '' };
}

export function blankPermission(): PermissionRecord {
  return { code: '', name: '', module: '', type: '' as PermissionType, description: '', status: '' as SecurityStatus, createdOn: '', updatedOn: '' };
}

export function blankRole(): RoleRecord {
  return { code: '', name: '', type: '' as RoleType, description: '', status: '' as SecurityStatus, permissions: [], modules: [], createdOn: '', updatedOn: '' };
}

export function blankUser(): UserRecord {
  return {
    code: '',
    name: '',
    username: '',
    email: '',
    department: '',
    primaryRole: '',
    additionalRoles: [],
    phone: '',
    photo: null,
    status: '' as SecurityStatus,
    employeeId: '',
    sites: [],
    accountExpiry: '',
    mfaRequired: false,
    mustChangePassword: true,
    sendInvite: true,
    language: '',
    timeZone: '',
    dateFormat: '',
    emailNotifications: true,
    smsNotifications: false,
    lastLogin: '',
    createdOn: '',
    updatedOn: ''
  };
}
