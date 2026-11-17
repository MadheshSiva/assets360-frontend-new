import { ADMIN_DEPARTMENTS, ADMIN_LOCATIONS, todayIso } from '../shared/admin-common';

// Static demo data for Role & Access Control: option lists, defaults and the seeded roles (role-access.service.ts keeps them in memory)

export type RoleType = 'System' | 'Custom';
export type RoleStatus = 'Active' | 'Inactive';
export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
/** full = granted, partial = granted on own / assigned records only, none = denied, na = not applicable */
export type CellState = 'full' | 'partial' | 'none' | 'na';
export type DataScope = 'All Locations' | 'Assigned Locations' | 'Own Department' | 'Own Records';
export type RoleIcon = 'crown' | 'settings' | 'wrench' | 'box' | 'shield' | 'chart' | 'briefcase' | 'coins' | 'search' | 'server' | 'lock' | 'headset' | 'hammer' | 'warehouse' | 'cart' | 'truck' | 'file' | 'eye';

export interface ApprovalRule {
  type: string;
  module: string;
  /** Monetary approvals carry a limit; the others are yes/no */
  monetary: boolean;
  enabled: boolean;
  limit: number;
  level: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  type: RoleType;
  status: RoleStatus;
  icon: RoleIcon;
  /** Template the locked (inherited) permissions come from, '' when none */
  template: string;
  users: number;
  /** module -> action -> state */
  permissions: Record<string, Record<PermAction, CellState>>;
  /** "Module|action" keys inherited from the template and not editable here */
  locked: string[];
  dataScope: DataScope;
  locations: string[];
  departments: string[];
  categories: string[];
  includeChildLocations: boolean;
  approvals: ApprovalRule[];
  approvalLimit: number;
  mfaRequired: boolean;
  sessionTimeout: string;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export const PERM_ACTIONS: { id: PermAction; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
  { id: 'approve', label: 'Approve' },
  { id: 'export', label: 'Export' }
];

/** Modules in the permission matrix, with the actions that don't apply to them. */
export const ROLE_MODULES: { name: string; na: PermAction[] }[] = [
  { name: 'Dashboard', na: ['create', 'edit', 'delete', 'approve'] },
  { name: 'Assets', na: [] },
  { name: 'Tracking & IoT', na: [] },
  { name: 'Movement & Custody', na: [] },
  { name: 'Maintenance', na: [] },
  { name: 'Inspection', na: [] },
  { name: 'Inventory', na: [] },
  { name: 'WIP / Operations', na: [] },
  { name: 'Compliance', na: [] },
  { name: 'Contracts & Warranty', na: [] },
  { name: 'Financial', na: [] },
  { name: 'Reports & Analytics', na: ['approve'] },
  { name: 'Administration', na: ['approve'] },
  { name: 'Master Data Management', na: [] }
];

export const ROLE_TYPES: RoleType[] = ['Custom', 'System'];
export const DATA_SCOPES: { id: DataScope; hint: string }[] = [
  { id: 'All Locations', hint: 'Every location in the organization' },
  { id: 'Assigned Locations', hint: 'Only the locations selected below' },
  { id: 'Own Department', hint: "Records owned by the user's department" },
  { id: 'Own Records', hint: 'Only records the user created or holds' }
];
export const ASSET_CATEGORIES = ['IT Equipment', 'Vehicles', 'Furniture', 'Machinery', 'Medical Equipment', 'HVAC', 'Tools', 'Facilities'];
export const SESSION_TIMEOUTS = ['30 minutes', '1 hour', '2 hours', '4 hours', '8 hours', '12 hours'];
export const APPROVAL_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Final'];

/** Users counted last month, for the "Users Assigned" trend */
export const USERS_LAST_MONTH = 221;

const APPROVAL_TYPES: { type: string; module: string; monetary: boolean }[] = [
  { type: 'Asset Purchase Request', module: 'Assets', monetary: true },
  { type: 'Asset Disposal', module: 'Assets', monetary: true },
  { type: 'Asset Transfer', module: 'Movement & Custody', monetary: false },
  { type: 'Work Order Completion', module: 'Maintenance', monetary: true },
  { type: 'Inventory Adjustment', module: 'Inventory', monetary: true },
  { type: 'Contract Renewal', module: 'Contracts & Warranty', monetary: true },
  { type: 'Audit Finding Closure', module: 'Compliance', monetary: false }
];

const FIRST = ['Ali', 'Maya', 'Hassan', 'Nadia', 'Ravi', 'Grace', 'Yusuf', 'Leena', 'Carlos', 'Hana', 'Tariq', 'Sofia', 'Imran', 'Elena', 'Kareem', 'Anjali', 'Victor', 'Noura', 'Sam', 'Zara'];
const LAST = ['Haddad', 'Pereira', 'Qureshi', 'Saleh', 'Iyer', 'Okafor', 'Farouk', 'Menon', 'Ortiz', 'Suzuki', 'Rashid', 'Costa', 'Malik', 'Petrova', 'Nasser', 'Kapoor'];

/** Deterministic demo user names for a role or policy. */
export function demoUsers(seed: string, count: number): string[] {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = h + i * 7;
    names.push(`${FIRST[n % FIRST.length]} ${LAST[Math.floor(n / FIRST.length + i) % LAST.length]}`);
  }
  return names;
}

/** "2026-10-03" style date in the current month, so "this month" stats stay true. */
function thisMonth(day: number): string {
  return `${todayIso().slice(0, 7)}-${String(day).padStart(2, '0')}`;
}
type Level = 'admin' | 'manager' | 'lead' | 'operator' | 'viewer' | 'none';

/** Builds the matrix for a role from a coarse level per module (overrides tweak single cells). */
function matrix(levels: Record<string, Level>, overrides: Record<string, CellState> = {}): Record<string, Record<PermAction, CellState>> {
  const out: Record<string, Record<PermAction, CellState>> = {};
  for (const m of ROLE_MODULES) {
    const level = levels[m.name] ?? 'none';
    const grant: Record<Level, PermAction[]> = {
      admin: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      manager: ['view', 'create', 'edit', 'approve', 'export'],
      lead: ['view', 'create', 'edit', 'export'],
      operator: ['view', 'create', 'edit'],
      viewer: ['view', 'export'],
      none: []
    };
    const row = {} as Record<PermAction, CellState>;
    for (const a of PERM_ACTIONS) {
      const key = `${m.name}|${a.id}`;
      row[a.id] = m.na.includes(a.id) ? 'na' : overrides[key] ?? (grant[level].includes(a.id) ? 'full' : 'none');
    }
    out[m.name] = row;
  }
  return out;
}

function approvals(limit: number, enabledTypes: string[]): ApprovalRule[] {
  return APPROVAL_TYPES.map((t, i) => ({
    ...t,
    enabled: enabledTypes.includes(t.type),
    limit: t.monetary && enabledTypes.includes(t.type) ? Math.min(limit, [50000, 25000, 0, 15000, 20000, 50000, 0][i]) : 0,
    level: i % 3 === 0 ? 'Level 2' : 'Level 1'
  }));
}

export function blankApprovals(): ApprovalRule[] {
  return approvals(0, []);
}

const ALL = (level: Level): Record<string, Level> => Object.fromEntries(ROLE_MODULES.map((m) => [m.name, level]));

interface Seed {
  name: string;
  code: string;
  type: RoleType;
  icon: RoleIcon;
  users: number;
  status?: RoleStatus;
  description: string;
  levels: Record<string, Level>;
  overrides?: Record<string, CellState>;
  locked?: string[];
  scope: DataScope;
  locations: string[];
  departments: string[];
  limit: number;
  approvalTypes: string[];
  mfa: boolean;
  timeout: string;
  template?: string;
  created: string;
}

const SEEDS: Seed[] = [
  {
    name: 'System Administrator', code: 'SYS_ADMIN', type: 'System', icon: 'crown', users: 28,
    description: 'Full access to every Asset360 module, configuration and security setting.',
    levels: ALL('admin'), locked: ROLE_MODULES.flatMap((m) => ['view', 'create', 'edit', 'delete', 'approve', 'export'].map((a) => `${m.name}|${a}`)),
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ADMIN_DEPARTMENTS, limit: 1000000,
    approvalTypes: APPROVAL_TYPES.map((t) => t.type), mfa: true, timeout: '4 hours', template: 'System Administrator', created: '2024-01-08'
  },
  {
    name: 'Operations Manager', code: 'OPS_MANAGER', type: 'Custom', icon: 'settings', users: 42,
    description: 'Manages day-to-day operations across assets, maintenance and inventory with approval rights within defined limits.',
    levels: { Dashboard: 'viewer', Assets: 'lead', 'Tracking & IoT': 'lead', 'Movement & Custody': 'manager', Maintenance: 'manager', Inspection: 'manager', Inventory: 'lead', 'WIP / Operations': 'manager', Compliance: 'manager', 'Reports & Analytics': 'viewer' },
    overrides: { 'Tracking & IoT|create': 'partial', 'Compliance|create': 'partial', 'Reports & Analytics|create': 'none' },
    scope: 'Assigned Locations', locations: ['Dubai HQ', 'Abu Dhabi Office'], departments: ['Operations', 'Maintenance'], limit: 50000,
    approvalTypes: ['Asset Purchase Request', 'Asset Transfer', 'Work Order Completion', 'Inventory Adjustment'], mfa: true, timeout: '8 hours', template: 'Operations Manager', created: '2024-03-12'
  },
  {
    name: 'Maintenance Lead', code: 'MAINT_LEAD', type: 'Custom', icon: 'wrench', users: 24,
    description: 'Plans and approves maintenance work orders and inspections for assigned sites.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Maintenance: 'manager', Inspection: 'manager', Inventory: 'operator', 'Reports & Analytics': 'viewer' },
    overrides: { 'Inventory|edit': 'partial' }, locked: ['Dashboard|view'],
    scope: 'Assigned Locations', locations: ['Dubai HQ', 'Sharjah Facility'], departments: ['Maintenance'], limit: 15000,
    approvalTypes: ['Work Order Completion'], mfa: false, timeout: '8 hours', template: 'Maintenance Lead', created: '2024-04-02'
  },
  {
    name: 'Inventory Manager', code: 'INV_MANAGER', type: 'Custom', icon: 'box', users: 18,
    description: 'Owns stock levels, adjustments and store transfers.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Inventory: 'admin', 'Movement & Custody': 'operator', 'Reports & Analytics': 'viewer' },
    scope: 'Assigned Locations', locations: ['Dubai HQ', 'Riyadh Office'], departments: ['Inventory', 'Procurement'], limit: 20000,
    approvalTypes: ['Inventory Adjustment'], mfa: false, timeout: '8 hours', template: 'Inventory Manager', created: '2024-04-18'
  },
  {
    name: 'Compliance Officer', code: 'COMPLIANCE_OFF', type: 'Custom', icon: 'shield', users: 16,
    description: 'Runs audits, tracks findings and reviews compliance evidence.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Inspection: 'viewer', Compliance: 'admin', 'Contracts & Warranty': 'viewer', 'Reports & Analytics': 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Compliance'], limit: 0,
    approvalTypes: ['Audit Finding Closure'], mfa: true, timeout: '4 hours', template: 'Compliance Officer', created: '2024-05-06'
  },
  {
    name: 'Report Viewer', code: 'REPORT_VIEWER', type: 'Custom', icon: 'chart', users: 12,
    description: 'Read-only access to dashboards and reports.',
    levels: { Dashboard: 'viewer', 'Reports & Analytics': 'viewer' }, locked: ['Dashboard|view', 'Reports & Analytics|view'],
    scope: 'Own Department', locations: [], departments: ['Finance'], limit: 0,
    approvalTypes: [], mfa: false, timeout: '2 hours', template: 'Report Viewer', created: '2024-06-11'
  },
  {
    name: 'Asset Manager', code: 'ASSET_MANAGER', type: 'System', icon: 'briefcase', users: 14,
    description: 'Registers, updates and retires assets across the organization.',
    levels: { Dashboard: 'viewer', Assets: 'admin', 'Tracking & IoT': 'lead', 'Movement & Custody': 'manager', 'Contracts & Warranty': 'lead', 'Reports & Analytics': 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Operations'], limit: 75000,
    approvalTypes: ['Asset Purchase Request', 'Asset Disposal', 'Asset Transfer'], mfa: true, timeout: '8 hours', created: '2024-01-08'
  },
  {
    name: 'Finance Controller', code: 'FIN_CONTROLLER', type: 'System', icon: 'coins', users: 8,
    description: 'Manages depreciation, asset valuation and financial approvals.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Financial: 'admin', 'Contracts & Warranty': 'manager', 'Reports & Analytics': 'lead' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Finance'], limit: 250000,
    approvalTypes: ['Asset Purchase Request', 'Asset Disposal', 'Contract Renewal'], mfa: true, timeout: '4 hours', created: '2024-01-08'
  },
  {
    name: 'Auditor', code: 'AUDITOR', type: 'System', icon: 'search', users: 6,
    description: 'Independent read access for internal and external audits.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Inventory: 'viewer', Compliance: 'viewer', Financial: 'viewer', 'Reports & Analytics': 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Compliance', 'Finance'], limit: 0,
    approvalTypes: [], mfa: true, timeout: '2 hours', created: '2024-01-08'
  },
  {
    name: 'IT Administrator', code: 'IT_ADMIN', type: 'System', icon: 'server', users: 5,
    description: 'Maintains integrations, devices and technical configuration.',
    levels: { Dashboard: 'viewer', 'Tracking & IoT': 'admin', Administration: 'lead', 'Reports & Analytics': 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['IT'], limit: 0,
    approvalTypes: [], mfa: true, timeout: '4 hours', created: '2024-01-08'
  },
  {
    name: 'Security Officer', code: 'SECURITY_OFF', type: 'System', icon: 'lock', users: 4,
    description: 'Monitors custody, access events and security alerts.',
    levels: { Dashboard: 'viewer', 'Tracking & IoT': 'viewer', 'Movement & Custody': 'lead', Compliance: 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Operations'], limit: 0,
    approvalTypes: ['Asset Transfer'], mfa: true, timeout: '1 hour', created: '2024-01-08'
  },
  {
    name: 'Help Desk Agent', code: 'HELPDESK', type: 'System', icon: 'headset', users: 9,
    description: 'Logs service requests and checks asset status for end users.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Maintenance: 'operator' },
    overrides: { 'Maintenance|edit': 'partial' },
    scope: 'Assigned Locations', locations: ['Dubai HQ'], departments: ['IT'], limit: 0,
    approvalTypes: [], mfa: false, timeout: '8 hours', created: '2024-01-08'
  },
  {
    name: 'Field Technician', code: 'FIELD_TECH', type: 'Custom', icon: 'hammer', users: 22,
    description: 'Executes work orders and inspections on assigned assets.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', Maintenance: 'operator', Inspection: 'operator' },
    overrides: { 'Maintenance|create': 'partial', 'Inspection|edit': 'partial' }, locked: ['Dashboard|view'],
    scope: 'Own Records', locations: ['Dubai HQ', 'Sharjah Facility'], departments: ['Maintenance'], limit: 0,
    approvalTypes: [], mfa: false, timeout: '12 hours', template: 'Maintenance Lead', created: '2024-07-21'
  },
  {
    name: 'Storekeeper', code: 'STOREKEEPER', type: 'Custom', icon: 'warehouse', users: 10,
    description: 'Receives, issues and counts stock in the stores.',
    levels: { Dashboard: 'viewer', Inventory: 'operator' },
    scope: 'Assigned Locations', locations: ['Sharjah Facility'], departments: ['Inventory'], limit: 0,
    approvalTypes: [], mfa: false, timeout: '12 hours', template: 'Inventory Manager', created: '2024-08-14'
  },
  {
    name: 'Procurement Officer', code: 'PROCUREMENT', type: 'Custom', icon: 'cart', users: 7,
    description: 'Raises purchase requests and manages supplier contracts.',
    levels: { Dashboard: 'viewer', Assets: 'operator', Inventory: 'viewer', 'Contracts & Warranty': 'lead', Financial: 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Procurement'], limit: 30000,
    approvalTypes: ['Asset Purchase Request', 'Contract Renewal'], mfa: true, timeout: '8 hours', created: thisMonth(3)
  },
  {
    name: 'Fleet Coordinator', code: 'FLEET_COORD', type: 'Custom', icon: 'truck', users: 3, status: 'Inactive',
    description: 'Coordinates vehicle bookings and movements (pilot, paused).',
    levels: { Dashboard: 'viewer', Assets: 'viewer', 'Tracking & IoT': 'viewer', 'Movement & Custody': 'operator' },
    scope: 'Assigned Locations', locations: ['Abu Dhabi Office'], departments: ['Operations'], limit: 0,
    approvalTypes: [], mfa: false, timeout: '8 hours', created: '2025-02-19'
  },
  {
    name: 'Contract Manager', code: 'CONTRACT_MGR', type: 'Custom', icon: 'file', users: 15,
    description: 'Manages warranties, AMC contracts and renewals.',
    levels: { Dashboard: 'viewer', Assets: 'viewer', 'Contracts & Warranty': 'admin', 'Reports & Analytics': 'viewer' },
    scope: 'All Locations', locations: ADMIN_LOCATIONS, departments: ['Procurement', 'Finance'], limit: 100000,
    approvalTypes: ['Contract Renewal'], mfa: true, timeout: '8 hours', created: thisMonth(9)
  },
  {
    name: 'Guest Viewer', code: 'GUEST_VIEWER', type: 'Custom', icon: 'eye', users: 5, status: 'Inactive',
    description: 'Temporary read-only access for visitors and consultants.',
    levels: { Dashboard: 'viewer' }, overrides: { 'Dashboard|export': 'none' },
    scope: 'Own Records', locations: [], departments: [], limit: 0,
    approvalTypes: [], mfa: true, timeout: '30 minutes', created: '2025-06-30'
  }
];

export function seedRoles(): RoleRecord[] {
  return SEEDS.map((s, i) => ({
    id: `ROLE-${String(i + 1).padStart(3, '0')}`,
    name: s.name,
    code: s.code,
    description: s.description,
    type: s.type,
    status: s.status ?? 'Active',
    icon: s.icon,
    template: s.template ?? '',
    users: s.users,
    permissions: matrix(s.levels, s.overrides),
    locked: s.locked ?? [],
    dataScope: s.scope,
    locations: [...s.locations],
    departments: [...s.departments],
    categories: s.scope === 'All Locations' ? [...ASSET_CATEGORIES] : ASSET_CATEGORIES.slice(i % 4, (i % 4) + 3),
    includeChildLocations: s.scope !== 'Own Records',
    approvals: approvals(s.limit, s.approvalTypes),
    approvalLimit: s.limit,
    mfaRequired: s.mfa,
    sessionTimeout: s.timeout,
    createdOn: s.created,
    createdBy: i < 12 ? 'System' : 'Sarah Ahmed',
    updatedOn: s.created
  }));
}
export function blankRole(): RoleRecord {
  return {
    id: '',
    name: '',
    code: '',
    description: '',
    type: 'Custom',
    status: 'Active',
    icon: 'settings',
    template: '',
    users: 0,
    permissions: matrix({}),
    locked: [],
    dataScope: 'Assigned Locations',
    locations: [],
    departments: [],
    categories: [],
    includeChildLocations: true,
    approvals: blankApprovals(),
    approvalLimit: 0,
    mfaRequired: false,
    sessionTimeout: '8 hours',
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}
