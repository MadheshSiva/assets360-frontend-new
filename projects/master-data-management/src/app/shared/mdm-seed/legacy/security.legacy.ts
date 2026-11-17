import { ModuleRecord, PermissionRecord, PermissionType, RoleRecord, RoleType, UserRecord } from '../../../security/security.model';

/*
 * DEMO MODE: security masters from the approved designs until the API is wired up.
 * Totals match the designs: 24 modules, 48 permissions, 28 roles, 36 users, and the first
 * roles' user counts (a user can hold more than one role).
 */

export const MODULE_CATEGORIES = [
  'General', 'Asset Management', 'Maintenance', 'Inspection', 'Inventory', 'Operations', 'Compliance', 'Analytics',
  'Tracking', 'Finance', 'Administration', 'Configuration'
];
export const PERMISSION_TYPES: PermissionType[] = ['Read', 'Create', 'Update', 'Delete', 'Approve', 'Manage', 'Execute'];
export const ROLE_TYPES: RoleType[] = ['System', 'Business', 'Operational', 'Read Only'];
export const USER_DEPARTMENTS = ['Management', 'Operations', 'Maintenance', 'Logistics', 'Compliance', 'IT', 'Finance', 'HSE', 'Procurement'];
export const LANGUAGES = ['English', 'Arabic', 'Hindi'];
export const TIME_ZONES = ['(GMT+04:00) Dubai', '(GMT+03:00) Riyadh', '(GMT+05:30) Kolkata', '(GMT+00:00) London'];
export const DATE_FORMATS = ['DD-MMM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
export const ACCESS_SITES = ['Dubai Factory', 'Abu Dhabi Office', 'Sharjah Warehouse', 'Riyadh Plant', 'Doha Office'];

const stamp = (day: number) => new Date(Date.UTC(2024, 0, 3) + day * 86400000).toISOString().slice(0, 16);

// [name, category, description, icon]
const MODULES: [string, string, string, string][] = [
  ['Dashboard', 'General', 'System dashboard and overview', 'dashboard'],
  ['Assets', 'Asset Management', 'Asset registration and tracking', 'box'],
  ['Maintenance', 'Maintenance', 'Work orders and maintenance', 'wrench'],
  ['Inspection', 'Inspection', 'Inspection and checklist', 'clipboard'],
  ['Inventory', 'Inventory', 'Inventory and spare parts', 'package'],
  ['WIP / Operations', 'Operations', 'Work in progress management', 'factory'],
  ['Compliance', 'Compliance', 'Certifications and permits', 'shield'],
  ['Reports & Analytics', 'Analytics', 'Reports and dashboards', 'chart'],
  ['Tracking & IoT', 'Tracking', 'Live location and sensor data', 'radio'],
  ['Movement & Custody', 'Asset Management', 'Asset transfers and custody', 'truck'],
  ['Contracts & Warranty', 'Finance', 'AMC contracts and warranties', 'file'],
  ['Financial', 'Finance', 'Asset values and depreciation', 'wallet'],
  ['Audit', 'Compliance', 'Physical audits and reconciliation', 'clipboard'],
  ['Purchase Requests', 'Inventory', 'Requests for parts and services', 'cart'],
  ['Preventive Maintenance', 'Maintenance', 'Planned maintenance schedules', 'calendar'],
  ['Asset Disposal', 'Asset Management', 'Retirement and write-off', 'trash'],
  ['Documents', 'General', 'Document library and attachments', 'file'],
  ['Notifications', 'General', 'Alerts and reminders', 'bell'],
  ['Help Desk', 'Operations', 'Service requests from staff', 'help'],
  ['Mobile App', 'General', 'Field app for technicians and auditors', 'phone'],
  ['Master Data Management', 'Configuration', 'Reference data for all modules', 'database'],
  ['System Configuration', 'Configuration', 'System settings and integrations', 'settings'],
  ['Security', 'Administration', 'Users, roles and permissions', 'lock'],
  ['Administration', 'Administration', 'Organization and user administration', 'users']
];

export function initialModules(): ModuleRecord[] {
  return MODULES.map(([name, category, description, icon], i) => ({
    code: `MOD-${String(i + 1).padStart(3, '0')}`,
    name,
    category,
    description,
    icon,
    status: name === 'Help Desk' ? 'Inactive' : 'Active',
    createdOn: stamp(i),
    updatedOn: stamp(300 + i * 4)
  }));
}

const MOD = (name: string) => `MOD-${String(MODULES.findIndex((m) => m[0] === name) + 1).padStart(3, '0')}`;

// [name, module, type, description, inactive?]; the first eight are the design rows
const PERMISSIONS: [string, string, PermissionType, string, boolean?][] = [
  ['View Asset', 'Assets', 'Read', 'View asset details'],
  ['Create Asset', 'Assets', 'Create', 'Create new asset'],
  ['Edit Asset', 'Assets', 'Update', 'Modify asset details'],
  ['Delete Asset', 'Assets', 'Delete', 'Delete asset record'],
  ['Approve Work Order', 'Maintenance', 'Approve', 'Approve work orders'],
  ['View Reports', 'Reports & Analytics', 'Read', 'View reports and analytics'],
  ['Manage Users', 'Security', 'Manage', 'Create and manage users', true],
  ['Export Data', 'System Configuration', 'Execute', 'Export data to files'],
  ['Transfer Asset', 'Assets', 'Update', 'Move assets between locations'],
  ['View Work Order', 'Maintenance', 'Read', 'View work orders'],
  ['Create Work Order', 'Maintenance', 'Create', 'Raise work orders'],
  ['Edit Work Order', 'Maintenance', 'Update', 'Update work orders'],
  ['Close Work Order', 'Maintenance', 'Execute', 'Complete and close work orders'],
  ['View Item', 'Inventory', 'Read', 'View inventory items'],
  ['Create Item', 'Inventory', 'Create', 'Add inventory items'],
  ['Edit Item', 'Inventory', 'Update', 'Modify inventory items'],
  ['Issue Stock', 'Inventory', 'Execute', 'Issue stock to work orders'],
  ['Adjust Stock', 'Inventory', 'Approve', 'Approve stock adjustments'],
  ['Schedule Reports', 'Reports & Analytics', 'Create', 'Schedule report emails'],
  ['Export Reports', 'Reports & Analytics', 'Execute', 'Download reports'],
  ['Share Dashboards', 'Reports & Analytics', 'Manage', 'Share dashboards with others'],
  ['View Inspection', 'Inspection', 'Read', 'View inspections'],
  ['Perform Inspection', 'Inspection', 'Execute', 'Carry out inspections'],
  ['Create Checklist', 'Inspection', 'Create', 'Create inspection checklists'],
  ['Approve Inspection', 'Inspection', 'Approve', 'Approve inspection results'],
  ['View Certificates', 'Compliance', 'Read', 'View certificates and permits'],
  ['Manage Certificates', 'Compliance', 'Manage', 'Add and renew certificates'],
  ['Approve Permit', 'Compliance', 'Approve', 'Approve permits to work'],
  ['View Audit Findings', 'Compliance', 'Read', 'View audit findings'],
  ['View Operations', 'WIP / Operations', 'Read', 'View work in progress'],
  ['Update Operations', 'WIP / Operations', 'Update', 'Update work in progress'],
  ['Approve Handover', 'WIP / Operations', 'Approve', 'Approve shift handovers'],
  ['Manage Roles', 'Security', 'Manage', 'Create and manage roles'],
  ['Manage Permissions', 'Security', 'Manage', 'Maintain the permission list'],
  ['View Audit Log', 'Security', 'Read', 'View the security audit log'],
  ['Reset Passwords', 'Security', 'Execute', 'Reset user passwords'],
  ['Unlock Accounts', 'Security', 'Execute', 'Unlock locked user accounts'],
  ['Import Data', 'System Configuration', 'Execute', 'Import data from files'],
  ['Configure Settings', 'System Configuration', 'Manage', 'Change system settings'],
  ['Manage Integrations', 'System Configuration', 'Manage', 'Configure integrations and APIs'],
  ['View Live Tracking', 'Tracking & IoT', 'Read', 'View live asset locations'],
  ['Manage Devices', 'Tracking & IoT', 'Manage', 'Register tags and sensors'],
  ['Configure Geofences', 'Tracking & IoT', 'Update', 'Set geofences and alerts'],
  ['View Asset Values', 'Financial', 'Read', 'View book values'],
  ['Run Depreciation', 'Financial', 'Execute', 'Run the depreciation schedule'],
  ['Approve Disposal', 'Financial', 'Approve', 'Approve asset disposals'],
  ['View Dashboard', 'Dashboard', 'Read', 'View the home dashboard'],
  ['Upload Documents', 'Documents', 'Create', 'Attach documents to records']
];

export function initialPermissions(): PermissionRecord[] {
  return PERMISSIONS.map(([name, module, type, description, inactive], i) => ({
    code: `PERM-${String(i + 1).padStart(3, '0')}`,
    name,
    module: MOD(module),
    type,
    description,
    status: inactive ? 'Inactive' : 'Active',
    createdOn: stamp(i + 30),
    updatedOn: stamp(330 + i * 2)
  }));
}

const PERM = (name: string) => `PERM-${String(PERMISSIONS.findIndex((p) => p[0] === name) + 1).padStart(3, '0')}`;
const ofModules = (...names: string[]) => PERMISSIONS.filter((p) => names.includes(p[1])).map((p) => PERM(p[0]));
const readsOf = (...names: string[]) => PERMISSIONS.filter((p) => names.includes(p[1]) && p[2] === 'Read').map((p) => PERM(p[0]));

// [name, type, description, users, permissions]; the first eight are the design rows
const ROLES: [string, RoleType, string, number, string[]][] = [
  ['System Administrator', 'System', 'Full access to all modules', 5, PERMISSIONS.map((p) => PERM(p[0]))],
  ['Asset Manager', 'Business', 'Manage assets and asset lifecycle', 12, [...ofModules('Assets', 'Reports & Analytics'), PERM('View Asset Values'), PERM('View Dashboard')]],
  ['Maintenance Manager', 'Business', 'Manage maintenance activities', 8, [...ofModules('Maintenance'), ...readsOf('Inventory', 'Assets'), PERM('View Reports'), PERM('View Dashboard')]],
  ['Inspector', 'Operational', 'Perform inspections and audits', 15, [...ofModules('Inspection'), PERM('View Asset'), PERM('View Audit Findings')]],
  ['Inventory Manager', 'Business', 'Manage inventory and stock', 6, [...ofModules('Inventory'), PERM('View Reports'), PERM('View Dashboard')]],
  ['Compliance Officer', 'Business', 'Manage compliance and permits', 4, [...ofModules('Compliance'), PERM('View Reports'), PERM('View Inspection')]],
  ['Report Viewer', 'Read Only', 'View reports and dashboards', 20, [PERM('View Reports'), PERM('View Dashboard'), PERM('View Asset Values')]],
  ['Technician', 'Operational', 'Execute maintenance tasks', 18, [PERM('View Work Order'), PERM('Close Work Order'), PERM('View Asset'), PERM('Issue Stock'), PERM('Perform Inspection')]],
  ['Supervisor', 'Business', 'Supervise crews and approve work', 3, [...ofModules('Maintenance', 'WIP / Operations'), PERM('View Asset')]],
  ['Planner', 'Business', 'Plan and schedule maintenance', 2, [...ofModules('Maintenance'), PERM('View Item')]],
  ['Storekeeper', 'Operational', 'Receive and issue stock', 3, [PERM('View Item'), PERM('Issue Stock'), PERM('Edit Item')]],
  ['Procurement Officer', 'Business', 'Raise and track purchases', 2, [PERM('View Item'), PERM('Create Item'), PERM('View Asset')]],
  ['Finance Manager', 'Business', 'Asset values and depreciation', 2, [...ofModules('Financial'), PERM('View Reports')]],
  ['Auditor', 'Read Only', 'Review records and audit trails', 2, [...readsOf('Assets', 'Inventory', 'Compliance', 'Security'), PERM('View Reports')]],
  ['HSE Officer', 'Operational', 'Health, safety and environment', 2, [...ofModules('Compliance'), PERM('View Inspection')]],
  ['Fleet Manager', 'Business', 'Manage vehicles and drivers', 1, [...ofModules('Tracking & IoT'), PERM('View Asset')]],
  ['Facility Manager', 'Business', 'Run buildings and services', 2, [...ofModules('Maintenance'), PERM('View Asset')]],
  ['IT Administrator', 'System', 'Users, integrations and settings', 2, [...ofModules('Security', 'System Configuration')]],
  ['Site Manager', 'Business', 'Oversee a site', 2, [...readsOf('Assets', 'Maintenance', 'Inventory'), PERM('Approve Work Order')]],
  ['Department Head', 'Business', 'Approve requests for a department', 1, [PERM('Approve Work Order'), PERM('View Reports')]],
  ['Contractor', 'Operational', 'External technicians', 1, [PERM('View Work Order'), PERM('Close Work Order')]],
  ['Vendor User', 'Operational', 'Vendor portal users', 0, [PERM('View Work Order')]],
  ['Help Desk Agent', 'Operational', 'Log and route service requests', 1, [PERM('Create Work Order'), PERM('View Work Order')]],
  ['Data Entry Operator', 'Operational', 'Bulk data entry', 1, [PERM('Create Asset'), PERM('Edit Asset'), PERM('Import Data')]],
  ['Executive Viewer', 'Read Only', 'Executive dashboards', 1, [PERM('View Dashboard'), PERM('View Reports')]],
  ['Calibration Engineer', 'Operational', 'Calibrate instruments', 1, [PERM('Perform Inspection'), PERM('View Asset')]],
  ['Energy Analyst', 'Read Only', 'Energy and utilities analysis', 0, [PERM('View Live Tracking'), PERM('View Reports')]],
  ['Guest', 'Read Only', 'Temporary read-only access', 0, [PERM('View Dashboard')]]
];

export function initialRoles(): RoleRecord[] {
  const perms = initialPermissions();
  return ROLES.map(([name, type, description, , permissions], i) => ({
    code: `ROLE-${String(i + 1).padStart(3, '0')}`,
    name,
    type,
    description,
    status: name === 'Guest' ? 'Inactive' : 'Active',
    permissions,
    // Modules the permissions belong to, plus the dashboard
    modules: [...new Set([MOD('Dashboard'), ...permissions.map((p) => perms.find((x) => x.code === p)!.module)])],
    createdOn: stamp(i + 60),
    updatedOn: stamp(360 + i * 3)
  }));
}

// [name, username, email, department, primary role, inactive?]; the first eight are the design rows
const USERS: [string, string, string, string, string, boolean?][] = [
  ['Rex Kumar', 'rex.kumar', 'rex.kumar@dcs.ae', 'Management', 'System Administrator'],
  ['Sarah Ahmed', 'sarah.ahmed', 'sarah.ahmed@dcs.ae', 'Operations', 'Asset Manager'],
  ['Mohammed Ali', 'mohammed.ali', 'm.ali@dcs.ae', 'Maintenance', 'Maintenance Manager'],
  ['Priya Nair', 'priya.nair', 'priya.nair@dcs.ae', 'Operations', 'Inspector'],
  ['John Smith', 'john.smith', 'john.smith@dcs.ae', 'Logistics', 'Inventory Manager'],
  ['Fatima Khan', 'fatima.khan', 'fatima.khan@dcs.ae', 'Compliance', 'Compliance Officer'],
  ['Rajesh Kumar', 'rajesh.kumar', 'rajesh.kumar@dcs.ae', 'Maintenance', 'Technician'],
  ['Lisa Wong', 'lisa.wong', 'lisa.wong@dcs.ae', 'Management', 'Report Viewer', true]
];
const MORE_NAMES = [
  'Arun Pillai', 'Noura Saeed', 'David Chen', 'Meena Iyer', 'Omar Farouk', 'Grace Thomas', 'Vikram Rao', 'Huda Karim', 'Peter Novak', 'Anil Menon',
  'Sana Qureshi', 'Mark Evans', 'Divya Shetty', 'Khalid Saleh', 'Emily Clark', 'Ravi Shankar', 'Layla Haddad', 'Tom Becker', 'Nisha Gupta', 'Yusuf Hamdan',
  'Carla Ruiz', 'Imran Sheikh', 'Joseph Mathew', 'Aisha Noor', 'Kevin Brown', 'Reem Al Amiri', 'Suresh Babu', 'Hana Lee'
];
const TOTAL_USERS = 36;

export function initialUsers(): UserRecord[] {
  const roles = initialRoles();
  const roleCode = (name: string) => roles.find((r) => r.name === name)!.code;
  const seeds: [string, string, string, string, string, boolean?][] = [...USERS];
  MORE_NAMES.slice(0, TOTAL_USERS - USERS.length).forEach((name, k) => {
    const username = name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, '.');
    // Spread the remaining primary roles over the busiest ones
    const primary = ['Technician', 'Inspector', 'Report Viewer', 'Asset Manager', 'Maintenance Manager', 'Supervisor', 'Storekeeper', 'Planner'][k % 8];
    seeds.push([name, username, `${username}@dcs.ae`, USER_DEPARTMENTS[k % USER_DEPARTMENTS.length], primary, k % 13 === 6]);
  });

  const users: UserRecord[] = seeds.map(([name, username, email, department, primary, inactive], i) => ({
    code: `USR-${String(i + 1).padStart(3, '0')}`,
    name,
    username,
    email,
    department,
    primaryRole: roleCode(primary),
    additionalRoles: [],
    phone: `+971 50 ${String(200 + i * 13).slice(-3)} ${String(4000 + i * 157).slice(-4)}`,
    photo: null,
    status: inactive ? 'Inactive' : 'Active',
    employeeId: '',
    sites: i === 0 ? [...ACCESS_SITES] : [ACCESS_SITES[i % ACCESS_SITES.length]],
    accountExpiry: '',
    mfaRequired: i === 0 || primary === 'System Administrator',
    mustChangePassword: false,
    sendInvite: false,
    language: 'English',
    timeZone: TIME_ZONES[0],
    dateFormat: DATE_FORMATS[0],
    emailNotifications: true,
    smsNotifications: primary === 'Technician',
    lastLogin: inactive ? '2026-03-02T09:10' : new Date(Date.UTC(2026, 9, 27) - (i % 9) * 86400000 + (8 + (i % 9)) * 3600000).toISOString().slice(0, 16),
    createdOn: stamp(i + 90),
    updatedOn: stamp(420 + i * 2)
  }));

  // Give extra roles until each role has the number of users in the design
  ROLES.forEach(([name, , , target], r) => {
    const code = roleCode(name);
    const holders = () => users.filter((u) => u.primaryRole === code || u.additionalRoles.includes(code)).length;
    for (let k = 0; holders() < target && k < users.length * 2; k++) {
      const u = users[(r * 5 + k) % users.length];
      if (u.primaryRole !== code && !u.additionalRoles.includes(code)) u.additionalRoles.push(code);
    }
  });
  return users;
}

export function blankModule(): ModuleRecord {
  return { code: '', name: '', category: '', description: '', icon: 'box', status: 'Active', createdOn: '', updatedOn: '' };
}

export function blankPermission(): PermissionRecord {
  return { code: '', name: '', module: '', type: 'Read', description: '', status: 'Active', createdOn: '', updatedOn: '' };
}

export function blankRole(): RoleRecord {
  return { code: '', name: '', type: 'Business', description: '', status: 'Active', permissions: [], modules: [], createdOn: '', updatedOn: '' };
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
    status: 'Active',
    employeeId: '',
    sites: [],
    accountExpiry: '',
    mfaRequired: false,
    mustChangePassword: true,
    sendInvite: true,
    language: 'English',
    timeZone: TIME_ZONES[0],
    dateFormat: DATE_FORMATS[0],
    emailNotifications: true,
    smsNotifications: false,
    lastLogin: '',
    createdOn: '',
    updatedOn: ''
  };
}
