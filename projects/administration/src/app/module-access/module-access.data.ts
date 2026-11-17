import { ADMIN_PEOPLE, ASSET360_MODULES } from '../shared/admin-common';

// Static demo data for Module Access: option lists, feature catalog, defaults and the seeded access policies
// (module-access.service.ts keeps them in memory).

export type PolicyType = 'Role' | 'Team' | 'User';
export type PolicyStatus = 'Active' | 'Inactive';
export type ModulePerm = 'view' | 'create' | 'edit' | 'approve' | 'export';
export type AccessLevel = 'Full Access' | 'Limited' | 'Read Only' | 'Restricted';
export type ExceptionAccess = 'Full Access' | 'Read Only' | 'No Access';
export type PolicyIcon = 'user' | 'users' | 'wrench' | 'box' | 'shield' | 'eye' | 'coins' | 'server' | 'hammer' | 'badge' | 'search' | 'building';
export type Tone = 'purple' | 'blue' | 'green' | 'pink' | 'orange';

export interface ModuleGrant {
  module: string;
  enabled: boolean;
  /** null = not applicable to the module */
  perms: Record<ModulePerm, boolean | null>;
  /** Permissions inherited from the parent policy (shown with a lock, not editable) */
  locked: ModulePerm[];
  scope: string;
}

export interface AccessException {
  id: string;
  user: string;
  module: string;
  access: ExceptionAccess;
  reason: string;
  /** ISO date, '' = no expiry */
  expires: string;
  addedBy: string;
  addedOn: string;
}

export interface PolicyRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  type: PolicyType;
  status: PolicyStatus;
  icon: PolicyIcon;
  tone: Tone;
  users: number;
  roles: string[];
  grants: ModuleGrant[];
  /** Feature ids switched on for this policy */
  features: string[];
  exceptions: AccessException[];
  dataScope: string;
  landingModule: string;
  sessionTimeout: number;
  mfaRequired: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface FeatureDef {
  id: string;
  module: string;
  name: string;
  restricted: boolean;
}

export const MODULE_PERMS: { id: ModulePerm; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'approve', label: 'Approve' },
  { id: 'export', label: 'Export' }
];

/** Actions that don't exist in a module */
const NOT_APPLICABLE: Record<string, ModulePerm[]> = {
  Dashboard: ['create', 'edit', 'approve'],
  'Tracking & IoT': ['approve'],
  'Master Data Management': ['approve']
};

export const MODULE_SCOPES = ['All Data', 'All Assets', 'Company Locations', 'Assigned Locations', 'Assigned Teams', 'Selected Locations', 'Read Only', 'Restricted'];
export const POLICY_SCOPES = ['All Data', 'Company Locations', 'Assigned Locations', 'Assigned Teams', 'Own Records'];
export const POLICY_TYPES: PolicyType[] = ['Role', 'Team', 'User'];
export const EXCEPTION_ACCESS: ExceptionAccess[] = ['Full Access', 'Read Only', 'No Access'];

export function scopeTone(scope: string): string {
  if (scope === 'All Data' || scope === 'All Assets') return 'green';
  if (scope === 'Read Only') return 'purple';
  if (scope === 'Restricted') return 'pink';
  return 'blue';
}

// ===== Feature catalog: 86 features, 42 restricted =====
const FEATURE_NAMES: Record<string, [string, boolean][]> = {
  Dashboard: [['Executive Overview', true], ['Operations Dashboard', false], ['KPI Widgets', false], ['Custom Dashboards', true], ['Live Alerts Feed', false]],
  Assets: [['Asset Register', false], ['Asset Details', false], ['Bulk Upload', true], ['Asset Transfer', false], ['Asset Disposal', true], ['Asset Revaluation', true], ['QR / Barcode Labels', false], ['Asset Hierarchy', false], ['Delete Assets', true]],
  'Tracking & IoT': [['Live Map', false], ['RFID Readers', true], ['BLE Gateways', true], ['Geofences', false], ['Device Health', false], ['Sensor Telemetry', false], ['Device Provisioning', true]],
  'Movement & Custody': [['Check-out', false], ['Check-in', false], ['Custody Transfer', false], ['Gate Pass', true], ['Movement Approval', true], ['Custody History', false], ['Lost & Found', true]],
  Maintenance: [['Work Orders', false], ['Preventive Schedules', false], ['Service Requests', false], ['Spare Parts Issue', false], ['Vendor Assignment', true], ['Cost Approval', true], ['Downtime Log', false], ['Close Work Orders', true], ['Maintenance Calendar', false]],
  Inspection: [['Inspection Rounds', false], ['Checklists', false], ['Findings', false], ['Photo Evidence', false], ['Inspection Sign-off', true], ['Template Designer', true]],
  Inventory: [['Stock Levels', false], ['Goods Receipt', false], ['Stock Issue', false], ['Stock Transfer', false], ['Stock Adjustment', true], ['Cycle Count', false], ['Stock Write-off', true], ['Reorder Rules', true]],
  'Audit & Compliance': [['Audit Plans', false], ['Audit Execution', false], ['Findings & CAPA', false], ['Compliance Register', true], ['Evidence Vault', true], ['Regulatory Reports', true], ['Audit Sign-off', true]],
  'Contracts & Warranty': [['Contracts', false], ['Warranties', false], ['AMC Schedules', false], ['Renewal Approval', true], ['Contract Values', true], ['Vendor Ratings', false]],
  Financial: [['Depreciation', true], ['Asset Valuation', true], ['Cost Centers', true], ['Budget Tracking', true], ['Invoices', true], ['GL Posting', true], ['Financial Reports', true]],
  'Reports & Analytics': [['Standard Reports', false], ['Report Builder', true], ['Scheduled Reports', false], ['Data Export', true], ['Analytics Workspace', false], ['Share Reports', false]],
  Administration: [['User Management', true], ['Roles & Permissions', true], ['System Settings', true], ['Integrations & API', true], ['Audit Logs', true], ['Workflow Builder', true]],
  'Master Data Management': [['Master Records', false], ['Bulk Import', true], ['Data Approval', false]]
};

let featureNo = 0;
export const FEATURES: FeatureDef[] = ASSET360_MODULES.flatMap((module) =>
  (FEATURE_NAMES[module] ?? []).map(([name, restricted]) => ({ id: `FT-${String(++featureNo).padStart(3, '0')}`, module, name, restricted }))
);

export function featuresOf(module: string): FeatureDef[] {
  return FEATURES.filter((f) => f.module === module);
}

// ===== Access levels =====
type Level = 'full' | 'limited' | 'read' | 'off';

function grant(module: string, level: Level, scope?: string, locked: ModulePerm[] = []): ModuleGrant {
  const na = NOT_APPLICABLE[module] ?? [];
  const perms = {} as Record<ModulePerm, boolean | null>;
  for (const p of MODULE_PERMS) {
    if (na.includes(p.id)) {
      perms[p.id] = null;
      continue;
    }
    perms[p.id] =
      level === 'full' ||
      (level === 'read' && (p.id === 'view' || p.id === 'export')) ||
      (level === 'limited' && p.id !== (na.includes('approve') ? 'export' : 'approve'));
  }
  const fallback = level === 'full' ? 'All Data' : level === 'read' ? 'Read Only' : level === 'limited' ? 'Assigned Locations' : 'Restricted';
  return { module, enabled: level !== 'off', perms, locked, scope: scope ?? fallback };
}

/** Full / Limited / Read Only / Restricted for one module grant. */
export function accessLevel(g: ModuleGrant): AccessLevel {
  if (!g.enabled) return 'Restricted';
  const applicable = MODULE_PERMS.filter((p) => g.perms[p.id] !== null);
  if (applicable.every((p) => g.perms[p.id])) return 'Full Access';
  if (g.perms.view && !g.perms.create && !g.perms.edit && !g.perms.approve) return 'Read Only';
  return 'Limited';
}

export interface AccessSummary {
  enabled: number;
  total: number;
  full: number;
  readOnly: number;
  restricted: number;
}

/** Access Summary box: restricted = everything that is neither full nor read-only (limited or switched off). */
export function accessSummary(p: PolicyRecord): AccessSummary {
  const levels = p.grants.map(accessLevel);
  const full = levels.filter((l) => l === 'Full Access').length;
  const readOnly = levels.filter((l) => l === 'Read Only').length;
  return { enabled: p.grants.filter((g) => g.enabled).length, total: p.grants.length, full, readOnly, restricted: p.grants.length - full - readOnly };
}

export function blankGrants(): ModuleGrant[] {
  return ASSET360_MODULES.map((m) => grant(m, m === 'Dashboard' ? 'read' : 'off', m === 'Dashboard' ? 'All Data' : undefined));
}

/** Default features for a grant: everything for full access, standard features otherwise */
function defaultFeatures(grants: ModuleGrant[]): string[] {
  return grants.flatMap((g) => {
    if (!g.enabled) return [];
    const full = accessLevel(g) === 'Full Access';
    return featuresOf(g.module).filter((f) => full || !f.restricted).map((f) => f.id);
  });
}

// ===== Policies =====
interface Seed {
  name: string;
  code: string;
  type: PolicyType;
  icon: PolicyIcon;
  tone: Tone;
  users: number;
  status?: PolicyStatus;
  description: string;
  roles: string[];
  levels: Partial<Record<string, Level>>;
  scopes?: Partial<Record<string, string>>;
  locked?: Partial<Record<string, ModulePerm[]>>;
  dataScope: string;
  landing: string;
  timeout: number;
  mfa: boolean;
  updated: string;
  by: string;
}

const SEEDS: Seed[] = [
  {
    name: 'Standard Employee', code: 'STD-EMP-001', type: 'Role', icon: 'user', tone: 'blue', users: 48,
    description: 'Baseline access for every employee: dashboards, own assets and service requests.',
    roles: ['Help Desk Agent'], levels: { Dashboard: 'read', Assets: 'read', Maintenance: 'limited', 'Reports & Analytics': 'read' },
    scopes: { Assets: 'Assigned Locations', Maintenance: 'Assigned Teams' },
    dataScope: 'Own Records', landing: 'Dashboard', timeout: 30, mfa: false, updated: '2024-02-20T09:12:00', by: 'Sarah Ahmed'
  },
  {
    name: 'Operations Manager', code: 'OPS-MGR-001', type: 'Role', icon: 'users', tone: 'purple', users: 32,
    description: 'Grants operational management access to core Asset360 modules with full operational permissions and restricted admin.',
    roles: ['Operations Manager'],
    levels: { Dashboard: 'full', Assets: 'full', 'Tracking & IoT': 'full', 'Movement & Custody': 'full', Maintenance: 'full', Inspection: 'limited', Inventory: 'read', 'Audit & Compliance': 'read', 'Reports & Analytics': 'read' },
    scopes: { 'Tracking & IoT': 'All Assets', 'Movement & Custody': 'Company Locations', Maintenance: 'Assigned Locations', Inspection: 'Assigned Teams', Inventory: 'Selected Locations', 'Reports & Analytics': 'All Data' },
    locked: { Administration: ['view'] },
    dataScope: 'Assigned Locations', landing: 'Dashboard', timeout: 60, mfa: true, updated: '2024-03-15T10:24:00', by: 'Sarah Ahmed'
  },
  {
    name: 'Maintenance Team', code: 'MNT-TEAM-001', type: 'Team', icon: 'wrench', tone: 'blue', users: 28,
    description: 'Work orders, preventive maintenance and inspections for the maintenance crews.',
    roles: ['Maintenance Lead', 'Field Technician'], levels: { Dashboard: 'read', Assets: 'read', Maintenance: 'full', Inspection: 'full', Inventory: 'limited', 'Reports & Analytics': 'read' },
    scopes: { Maintenance: 'Assigned Locations', Inspection: 'Assigned Teams', Inventory: 'Selected Locations' },
    dataScope: 'Assigned Teams', landing: 'Maintenance', timeout: 120, mfa: false, updated: '2024-04-02T14:05:00', by: 'Omar Hassan'
  },
  {
    name: 'Inventory Team', code: 'INV-TEAM-001', type: 'Team', icon: 'box', tone: 'green', users: 18,
    description: 'Stores, stock movements and cycle counts.',
    roles: ['Inventory Manager', 'Storekeeper'], levels: { Dashboard: 'read', Assets: 'read', Inventory: 'full', 'Movement & Custody': 'limited', 'Reports & Analytics': 'read' },
    scopes: { Inventory: 'Selected Locations' },
    dataScope: 'Assigned Locations', landing: 'Inventory', timeout: 120, mfa: false, updated: '2024-04-18T11:40:00', by: 'Aisha Rahman'
  },
  {
    name: 'Compliance Team', code: 'CMP-TEAM-001', type: 'Team', icon: 'shield', tone: 'pink', users: 14,
    description: 'Audits, findings and compliance evidence across all locations.',
    roles: ['Compliance Officer'], levels: { Dashboard: 'read', Assets: 'read', Inspection: 'read', 'Audit & Compliance': 'full', 'Contracts & Warranty': 'read', 'Reports & Analytics': 'full' },
    dataScope: 'All Data', landing: 'Audit & Compliance', timeout: 60, mfa: true, updated: '2024-05-06T08:30:00', by: 'Sarah Ahmed'
  },
  {
    name: 'Executive Viewer', code: 'EXEC-VIEW-001', type: 'Role', icon: 'eye', tone: 'purple', users: 12, status: 'Inactive',
    description: 'Read-only executive dashboards and reports (paused pending review).',
    roles: ['Report Viewer'], levels: { Dashboard: 'read', Assets: 'read', Financial: 'read', 'Reports & Analytics': 'read' },
    scopes: { Dashboard: 'All Data' },
    dataScope: 'All Data', landing: 'Dashboard', timeout: 30, mfa: true, updated: '2024-06-11T16:20:00', by: 'James Tan'
  },
  {
    name: 'Finance Team', code: 'FIN-TEAM-001', type: 'Team', icon: 'coins', tone: 'orange', users: 22,
    description: 'Depreciation, valuation, budgets and financial reporting.',
    roles: ['Finance Controller'], levels: { Dashboard: 'read', Assets: 'read', Financial: 'full', 'Contracts & Warranty': 'limited', 'Reports & Analytics': 'full' },
    dataScope: 'All Data', landing: 'Financial', timeout: 60, mfa: true, updated: '2024-07-03T10:00:00', by: 'Priya Sharma'
  },
  {
    name: 'IT Support', code: 'IT-SUP-001', type: 'Team', icon: 'server', tone: 'blue', users: 16,
    description: 'Devices, integrations and technical administration.',
    roles: ['IT Administrator'], levels: { Dashboard: 'read', Assets: 'limited', 'Tracking & IoT': 'full', Administration: 'limited', 'Master Data Management': 'limited' },
    dataScope: 'Company Locations', landing: 'Tracking & IoT', timeout: 60, mfa: true, updated: '2024-07-21T13:15:00', by: 'Daniel Kim'
  },
  {
    name: 'Field Technicians', code: 'FLD-TECH-001', type: 'Team', icon: 'hammer', tone: 'orange', users: 26,
    description: 'Mobile access to assigned work orders and inspections.',
    roles: ['Field Technician'], levels: { Dashboard: 'read', Assets: 'read', Maintenance: 'limited', Inspection: 'limited' },
    scopes: { Maintenance: 'Assigned Teams', Inspection: 'Assigned Teams' },
    dataScope: 'Own Records', landing: 'Maintenance', timeout: 240, mfa: false, updated: '2024-08-14T07:45:00', by: 'Omar Hassan'
  },
  {
    name: 'Contractor Access', code: 'CNTR-USR-001', type: 'User', icon: 'badge', tone: 'pink', users: 9,
    description: 'Named external contractors with time-boxed maintenance access.',
    roles: [], levels: { Dashboard: 'read', Maintenance: 'limited' },
    scopes: { Maintenance: 'Selected Locations' },
    dataScope: 'Own Records', landing: 'Maintenance', timeout: 30, mfa: true, updated: '2024-09-09T12:00:00', by: 'Sarah Ahmed'
  },
  {
    name: 'Auditor Access', code: 'AUD-USR-001', type: 'User', icon: 'search', tone: 'purple', users: 6,
    description: 'Named internal and external auditors with read access to registers and reports.',
    roles: ['Auditor'], levels: { Dashboard: 'read', Assets: 'read', Inventory: 'read', 'Audit & Compliance': 'read', Financial: 'read', 'Reports & Analytics': 'read' },
    dataScope: 'All Data', landing: 'Audit & Compliance', timeout: 60, mfa: true, updated: '2024-10-01T09:30:00', by: 'Fatima Noor'
  },
  {
    name: 'Site Supervisors', code: 'SITE-SUP-001', type: 'Role', icon: 'building', tone: 'green', users: 17,
    description: 'Site-level oversight of assets, custody and maintenance.',
    roles: ['Operations Manager', 'Security Officer'], levels: { Dashboard: 'read', Assets: 'limited', 'Movement & Custody': 'full', Maintenance: 'limited', Inspection: 'read', 'Reports & Analytics': 'read' },
    scopes: { 'Movement & Custody': 'Assigned Locations' },
    dataScope: 'Assigned Locations', landing: 'Dashboard', timeout: 120, mfa: false, updated: '2024-11-12T15:10:00', by: 'Mohammed Ali'
  }
];

const EXCEPTION_REASONS = ['Quarterly budget review', 'Covering for team lead on leave', 'Pending security training', 'Project handover', 'Audit support engagement'];

/** Two or three exceptions per policy, picked deterministically from the people and modules lists */
function seedExceptions(policyIndex: number, grants: ModuleGrant[]): AccessException[] {
  const count = policyIndex % 3 === 0 ? 3 : policyIndex % 3 === 1 ? 2 : 1;
  const out: AccessException[] = [];
  for (let i = 0; i < count; i++) {
    const g = grants[(policyIndex * 5 + i * 4 + 3) % grants.length];
    out.push({
      id: `EXC-${policyIndex + 1}-${i + 1}`,
      user: ADMIN_PEOPLE[(policyIndex * 3 + i * 7 + 1) % ADMIN_PEOPLE.length],
      module: g.module,
      access: g.enabled ? (i % 2 === 0 ? 'No Access' : 'Read Only') : i % 2 === 0 ? 'Read Only' : 'Full Access',
      reason: EXCEPTION_REASONS[(policyIndex + i) % EXCEPTION_REASONS.length],
      expires: i === 1 ? '' : `2027-${String(((policyIndex + i * 4) % 12) + 1).padStart(2, '0')}-28`,
      addedBy: 'Sarah Ahmed',
      addedOn: `2026-${String(((policyIndex + i) % 9) + 1).padStart(2, '0')}-15`
    });
  }
  return out;
}

export function seedPolicies(): PolicyRecord[] {
  return SEEDS.map((s, i) => {
    const grants = ASSET360_MODULES.map((m) => grant(m, s.levels[m] ?? 'off', s.scopes?.[m], s.locked?.[m] ?? []));
    return {
      id: `POL-${String(i + 1).padStart(3, '0')}`,
      name: s.name,
      code: s.code,
      description: s.description,
      type: s.type,
      status: s.status ?? 'Active',
      icon: s.icon,
      tone: s.tone,
      users: s.users,
      roles: [...s.roles],
      grants,
      features: defaultFeatures(grants),
      exceptions: seedExceptions(i, grants),
      dataScope: s.dataScope,
      landingModule: s.landing,
      sessionTimeout: s.timeout,
      mfaRequired: s.mfa,
      updatedAt: s.updated,
      updatedBy: s.by
    };
  });
}

export function blankPolicy(): PolicyRecord {
  const grants = blankGrants();
  return {
    id: '',
    name: '',
    code: '',
    description: '',
    type: 'Role',
    status: 'Active',
    icon: 'users',
    tone: 'purple',
    users: 0,
    roles: [],
    grants,
    features: defaultFeatures(grants),
    exceptions: [],
    dataScope: 'Assigned Locations',
    landingModule: 'Dashboard',
    sessionTimeout: 60,
    mfaRequired: false,
    updatedAt: '',
    updatedBy: ''
  };
}

/** Standard features of a module (switched on when the module is enabled) */
export function standardFeatureIds(module: string): string[] {
  return featuresOf(module).filter((f) => !f.restricted).map((f) => f.id);
}
