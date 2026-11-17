// Option lists and defaults for Role & Access Control. Roles come from the Administration API (role-access.service.ts);
// the permission matrix, data scope, approvals and security settings have no backend fields yet and stay client-side.

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
/** Asset categories come from Master Data (empty until wired). */
export const ASSET_CATEGORIES: string[] = [];
export const SESSION_TIMEOUTS = ['30 minutes', '1 hour', '2 hours', '4 hours', '8 hours', '12 hours'];
export const APPROVAL_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Final'];

/** Users counted last month, for the "Users Assigned" trend (no history API yet) */
export const USERS_LAST_MONTH = 0;

const APPROVAL_TYPES: { type: string; module: string; monetary: boolean }[] = [
  { type: 'Asset Purchase Request', module: 'Assets', monetary: true },
  { type: 'Asset Disposal', module: 'Assets', monetary: true },
  { type: 'Asset Transfer', module: 'Movement & Custody', monetary: false },
  { type: 'Work Order Completion', module: 'Maintenance', monetary: true },
  { type: 'Inventory Adjustment', module: 'Inventory', monetary: true },
  { type: 'Contract Renewal', module: 'Contracts & Warranty', monetary: true },
  { type: 'Audit Finding Closure', module: 'Compliance', monetary: false }
];

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
