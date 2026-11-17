import { ADMIN_PEOPLE, CURRENT_USER, todayIso } from '../shared/admin-common';
import { AuditCategory, AuditEvent, AuditOutcome, AuditSeverity } from './audit-log.model';

// DEMO MODE: 1,248 deterministic audit events for today (GMT+4)

export const AUDIT_DAY = todayIso();
export const RETENTION_DAYS = 365;

/** Events per category; they add up to 1,248. */
export const CATEGORY_COUNTS: [AuditCategory, number][] = [
  ['User Activity', 432],
  ['Configuration', 184],
  ['Security', 156],
  ['Data Changes', 261],
  ['Integrations', 98],
  ['Workflow', 72],
  ['Imports/Exports', 45]
];

const ROLES = [
  'Administrator', 'Operations Manager', 'Maintenance Supervisor', 'Technician', 'Inventory Controller',
  'Finance Analyst', 'Compliance Officer', 'IT Administrator', 'Asset Manager'
];

const DEVICES = [
  'Windows 11 / Chrome 141.0.0', 'Windows 11 / Edge 141.0', 'macOS 15 / Safari 18.2', 'iOS 18 / Asset360 Mobile 4.2', 'Android 15 / Asset360 Mobile 4.2'
];

const LOCATIONS: [string, string][] = [
  ['Dubai, UAE', 'AE'], ['Dubai, UAE', 'AE'], ['Abu Dhabi, UAE', 'AE'], ['Sharjah, UAE', 'AE'], ['Riyadh, KSA', 'SA'], ['London, UK', 'GB'], ['Singapore', 'SG']
];

const INTEGRATIONS = ['SAP ERP', 'Oracle Fusion', 'ServiceNow', 'Azure AD', 'Microsoft Teams', 'IoT Gateway'];

/** Small deterministic generator (LCG). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rand = () => number;

function pick<T>(r: Rand, list: T[]): T {
  return list[Math.floor(r() * list.length)];
}

function hex(r: Rand, len: number): string {
  let s = '';
  while (s.length < len) s += Math.floor(r() * 0x10000).toString(16).padStart(4, '0');
  return s.slice(0, len);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

interface Actor {
  name: string;
  id: string;
  role: string;
  ip: string;
  device: string;
  location: [string, string];
  mfa: boolean;
}

const ACTORS: Actor[] = ADMIN_PEOPLE.map((name, i) => ({
  name,
  id: name === CURRENT_USER.name ? CURRENT_USER.id : `USR-${String(100 + i * 7).padStart(6, '0')}`,
  role: name === CURRENT_USER.name ? CURRENT_USER.role : ROLES[(i * 5) % ROLES.length],
  ip: `10.20.${(i % 9) + 1}.${(i * 37) % 240 + 10}`,
  device: DEVICES[i % DEVICES.length],
  location: LOCATIONS[i % LOCATIONS.length],
  mfa: i % 6 !== 4
}));

/** What happened, before the actor / time are attached. */
interface Body {
  event: string;
  module: string;
  action: string;
  entityType: string;
  entity: string;
  recordId: string;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  before?: unknown;
  after?: unknown;
}

type Template = (r: Rand) => Body;

function assetCode(r: Rand): string {
  return `AST-2026-${pick(r, ['DXB', 'AUH', 'SHJ', 'RUH'])}-${String(Math.floor(r() * 2000) + 1).padStart(6, '0')}`;
}

function woCode(r: Rand): string {
  return `WO-${10000 + Math.floor(r() * 400)}`;
}

function body(event: string, module: string, action: string, entityType: string, entity: string, recordId: string, severity: AuditSeverity, outcome: AuditOutcome = 'Success'): Body {
  return { event, module, action, entityType, entity, recordId, severity, outcome };
}

function withChange(b: Body, before: unknown, after: unknown): Body {
  return { ...b, before, after };
}

// ----- Everyday events per category (all Success; never Critical) -----
const NORMAL: Record<AuditCategory, Template[]> = {
  'User Activity': [
    () => body('User signed in', 'Dashboard', 'Sign in', 'Session', 'Web portal', 'SES-LOGIN', 'Low'),
    () => body('User signed out', 'Dashboard', 'Sign out', 'Session', 'Web portal', 'SES-LOGOUT', 'Low'),
    (r) => { const d = pick(r, ['Operations Overview', 'Maintenance KPIs', 'Asset Health']); return body('Dashboard viewed', 'Dashboard', 'View', 'Dashboard', d, `DSH-${10 + Math.floor(r() * 20)}`, 'Low'); },
    (r) => { const rep = pick(r, ['Asset Register', 'Depreciation Schedule', 'PM Compliance', 'Stock Valuation']); return body('Report exported', 'Reports & Analytics', 'Export', 'Report', rep, `RPT-${200 + Math.floor(r() * 80)}`, 'Medium'); },
    (r) => { const a = assetCode(r); return body('Asset record viewed', 'Assets', 'View', 'Asset', a, a, 'Low'); },
    (r) => withChange(body('Profile updated', 'Administration', 'Update profile', 'User profile', 'Phone number', `USR-${String(100 + Math.floor(r() * 140)).padStart(6, '0')}`, 'Low'), { phone: '+971 50 *** 1182' }, { phone: '+971 55 *** 4410' })
  ],
  Configuration: [
    (r) => { const t = pick(r, [15, 20, 30]); return withChange(body('System setting updated', 'Administration', 'Update setting', 'System setting', 'Session timeout', 'CFG-SESSION-TIMEOUT', 'Medium'), { sessionTimeoutMinutes: t }, { sessionTimeoutMinutes: t + 15 }); },
    (r) => { const n = 240 + Math.floor(r() * 30); return withChange(body('Numbering sequence changed', 'Administration', 'Update sequence', 'Numbering sequence', 'Work Order', 'SEQ-WO', 'Medium'), { prefix: 'WO-', next: n }, { prefix: 'WO-', next: n, padding: 5 }); },
    (r) => { const t = pick(r, ['Work Order Assigned', 'Warranty Expiry Reminder', 'Low Stock Alert']); return withChange(body('Notification template updated', 'Administration', 'Update template', 'Notification template', t, `NTF-${100 + Math.floor(r() * 40)}`, 'Low'), { channels: ['email'] }, { channels: ['email', 'in-app'] }); },
    (r) => { const m = pick(r, ['Inventory', 'Financial', 'Inspection']); return withChange(body('Module access changed', 'Administration', 'Update access', 'Module access', m, `MOD-${m.slice(0, 3).toUpperCase()}`, 'High'), { module: m, enabled: false }, { module: m, enabled: true }); },
    (r) => withChange(body('Checklist template updated', 'Administration', 'Update template', 'Checklist template', 'HVAC Monthly PM', `CHK-${300 + Math.floor(r() * 50)}`, 'Low'), { items: 14 }, { items: 16 })
  ],
  Security: [
    () => body('Password changed', 'Security', 'Change password', 'User account', 'Own account', 'SELF', 'Medium'),
    () => body('MFA enrolled', 'Security', 'Enroll MFA', 'User account', 'Authenticator app', 'SELF', 'Low'),
    () => body('Session expired', 'Security', 'Expire session', 'Session', 'Idle timeout', 'SES-IDLE', 'Low'),
    (r) => { const p = pick(r, ['Finance Read Only', 'Field Technician', 'Store Keeper']); return body('Access policy reviewed', 'Security', 'Review', 'Access policy', p, `POL-${20 + Math.floor(r() * 30)}`, 'Low'); }
  ],
  'Data Changes': [
    (r) => { const a = assetCode(r); return withChange(body('Asset record edited', 'Assets', 'Update asset', 'Asset', a, a, 'Low'), { status: 'In Store', custodian: null }, { status: 'In Use', custodian: 'USR-000163' }); },
    (r) => { const a = assetCode(r); return withChange(body('Asset created', 'Assets', 'Create asset', 'Asset', a, a, 'Low'), {}, { assetCode: a, status: 'In Store' }); },
    (r) => { const q = 40 + Math.floor(r() * 200); return withChange(body('Inventory adjusted', 'Inventory', 'Adjust stock', 'Inventory item', 'INV-SP-0091', 'INV-SP-0091', 'Medium'), { quantity: q }, { quantity: q - 12 }); },
    (r) => { const v = `VEN-${String(10 + Math.floor(r() * 80)).padStart(4, '0')}`; return withChange(body('Vendor updated', 'Master Data Management', 'Update vendor', 'Vendor', v, v, 'Low'), { paymentTerms: 'Net 30' }, { paymentTerms: 'Net 45' }); },
    (r) => { const a = assetCode(r); return withChange(body('Asset transferred', 'Movement & Custody', 'Transfer', 'Asset', a, a, 'Medium'), { location: 'DXB-HQ-F3' }, { location: 'AUH-OFF-F1' }); },
    (r) => { const c = `CTR-2026-${String(Math.floor(r() * 300)).padStart(4, '0')}`; return withChange(body('Contract renewed', 'Contracts & Warranty', 'Renew', 'Contract', c, c, 'Medium'), { endDate: '2026-12-31' }, { endDate: '2027-12-31' }); }
  ],
  Integrations: [
    (r) => { const i = pick(r, INTEGRATIONS); return body('Integration sync completed', 'Integration & API', 'Sync', 'Integration', i, `INT-${i.replace(/\W+/g, '').toUpperCase()}`, 'Low'); },
    (r) => { const i = pick(r, INTEGRATIONS); return body('API token used', 'Integration & API', 'Authenticate', 'API client', i, `API-${hex(r, 6).toUpperCase()}`, 'Low'); },
    (r) => { const i = pick(r, INTEGRATIONS); return body('Webhook delivered', 'Integration & API', 'Deliver', 'Webhook', i, `WHK-${100 + Math.floor(r() * 50)}`, 'Low'); }
  ],
  Workflow: [
    (r) => { const w = woCode(r); return withChange(body('Work order approval', 'Maintenance', 'Approve', 'Work order', w, w, 'Medium'), { status: 'Pending Approval' }, { status: 'Approved' }); },
    (r) => { const p = `PR-2026-${String(Math.floor(r() * 900)).padStart(4, '0')}`; return withChange(body('Purchase request approved', 'Financial', 'Approve', 'Purchase request', p, p, 'Medium'), { status: 'Submitted' }, { status: 'Approved' }); },
    (r) => { const w = woCode(r); return body('Workflow step escalated', 'Maintenance', 'Escalate', 'Work order', w, w, 'High'); },
    (r) => { const a = assetCode(r); return withChange(body('Disposal request rejected', 'Assets', 'Reject', 'Disposal request', a, a, 'Medium'), { status: 'Pending' }, { status: 'Rejected' }); }
  ],
  'Imports/Exports': [
    (r) => { const j = `IMP-AST-${String(60 + Math.floor(r() * 26)).padStart(4, '0')}`; return body('Data import completed', 'Administration', 'Import', 'Data job', j, j, 'Medium'); },
    (r) => { const j = `EXP-WO-${String(100 + Math.floor(r() * 42)).padStart(4, '0')}`; return body('Data export generated', 'Administration', 'Export', 'Data job', j, j, 'Medium'); }
  ]
};

// ----- Exceptional events, spread through the day at fixed counts -----
const failedLogin: Template = () => body('Failed login attempt', 'Security', 'Sign in', 'User account', 'User account', 'SELF', 'High', 'Failed');
const accessDenied: Template = (r) => { const m = pick(r, ['Financial', 'Administration', 'Audit & Compliance']); return body('Access denied', 'Security', 'Open module', 'Module', m, `MOD-${m.slice(0, 3).toUpperCase()}`, 'High', 'Blocked'); };
const privilegedGrant: Template = (r) => withChange(body('Privileged role granted', 'Security', 'Grant role', 'User account', 'System Administrator', `USR-${String(100 + Math.floor(r() * 140)).padStart(6, '0')}`, 'Critical'), { roles: ['Asset Manager'] }, { roles: ['Asset Manager', 'System Administrator'] });
const credentialsUpdated: Template = (r) => { const i = pick(r, INTEGRATIONS); return withChange(body('Integration credentials updated', 'Integration & API', 'Rotate credentials', 'Integration', i, `INT-${i.replace(/\W+/g, '').toUpperCase()}`, 'Critical'), { clientSecret: '••••••••3f9a', expires: '2026-11-01' }, { clientSecret: '••••••••c41e', expires: '2027-10-28' }); };
const webhookFailed: Template = (r) => { const i = pick(r, INTEGRATIONS); return body('Webhook delivery failed', 'Integration & API', 'Deliver', 'Webhook', i, `WHK-${100 + Math.floor(r() * 50)}`, 'Medium', 'Failed'); };
const importFailed: Template = (r) => { const j = `IMP-INV-${String(40 + Math.floor(r() * 20)).padStart(4, '0')}`; return body('Import validation failed', 'Administration', 'Import', 'Data job', j, j, 'Medium', 'Failed'); };
const configViewed: Template = (r) => { const s = pick(r, ['System Configuration', 'Numbering Sequence', 'Notification Templates', 'Module Access']); return body('Configuration viewed', 'Administration', 'View', 'Configuration', s, 'CFG-VIEW', 'Low'); };

/** Specials per category (after the five design rows): 18 failed, 8 blocked, 5 critical. */
const SPECIALS: Partial<Record<AuditCategory, Template[]>> = {
  Security: [...Array(10).fill(failedLogin), ...Array(8).fill(accessDenied), ...Array(3).fill(privilegedGrant)],
  Integrations: [...Array(4).fill(webhookFailed), ...Array(2).fill(credentialsUpdated)],
  'Imports/Exports': Array(4).fill(importFailed)
};

/** Of the 184 configuration events, 84 change something; the rest are views. */
const CONFIG_CHANGES = 84;

/** The five rows shown in the design, newest first. */
function designRows(): AuditEvent[] {
  const sarah = ACTORS[0];
  const omar = ACTORS[1];
  const aisha = ACTORS[2];
  const base = (a: Actor, t: string, id: string, b: Body, category: AuditCategory, ip: string, extra: Partial<AuditEvent>): AuditEvent => ({
    id, timestamp: `${AUDIT_DAY}T${t}`, event: b.event, category, module: b.module, action: b.action, user: a.name, userId: a.id, role: a.role,
    entityType: b.entityType, entity: b.entity, recordId: b.recordId, ip, device: a.device, location: a.location[0], countryCode: a.location[1],
    requestId: '', severity: b.severity, outcome: b.outcome, mfa: 'Enabled', sessionId: '', authMethod: 'Password + MFA', riskScore: 18,
    before: b.before === undefined ? '' : json(b.before), after: b.after === undefined ? '' : json(b.after), ...extra
  });
  return [
    base(sarah, '14:32:18', `AUD-${AUDIT_DAY.replace(/-/g, '')}-143218-7F3A`,
      withChange(body('User role updated', 'Administration', 'Update role', 'User account', 'Operations Manager', 'USR-000085', 'Medium'),
        { role: 'Technician', permissions: ['assets:view'] },
        { role: 'Operations Manager', permissions: ['assets:view', 'maintenance:approve', 'reports:export'] }),
      'Security', '10.20.4.18',
      { device: 'Windows 11 / Chrome 141.0.0', location: 'Dubai, UAE', countryCode: 'AE', requestId: 'REQ-7f3a9d2e-4b1c-4398', sessionId: 'sess-9a2f7d3e8c4b11f0' }),
    base(omar, '13:17:04', `AUD-${AUDIT_DAY.replace(/-/g, '')}-131704-2C91`, failedLogin(() => 0), 'Security', '10.20.4.22',
      { recordId: omar.id, requestId: 'REQ-2c91be07-77d0-4a1e', sessionId: 'sess-none', authMethod: 'Password', mfa: 'Enabled', riskScore: 64 }),
    base(aisha, '11:05:23', `AUD-${AUDIT_DAY.replace(/-/g, '')}-110523-B4E0`,
      withChange(body('Asset record edited', 'Assets', 'Update asset', 'Asset', 'AST-2026-DXB-000247', 'AST-2026-DXB-000247', 'Low'),
        { location: 'DXB-HQ-F2', custodian: 'USR-000149' }, { location: 'DXB-HQ-F3', custodian: 'USR-000163' }),
      'Data Changes', '10.20.3.15', { requestId: 'REQ-b4e05a11-9c2d-41f7', sessionId: 'sess-b4e05a119c2d41f7', riskScore: 9 }),
    base(sarah, '09:44:12', `AUD-${AUDIT_DAY.replace(/-/g, '')}-094412-E15D`, credentialsUpdated(() => 0), 'Integrations', '10.20.4.18',
      { entity: 'SAP ERP', recordId: 'INT-SAPERP', requestId: 'REQ-e15d0c3a-58b2-4d06', sessionId: 'sess-9a2f7d3e8c4b11f0', riskScore: 72 }),
    base(omar, '08:21:37', `AUD-${AUDIT_DAY.replace(/-/g, '')}-082137-5A08`,
      withChange(body('Work order approval', 'Maintenance', 'Approve', 'Work order', 'WO-10245', 'WO-10245', 'Medium'), { status: 'Pending Approval' }, { status: 'Approved' }),
      'Workflow', '10.20.7.12', { requestId: 'REQ-5a08f6d1-0e47-4c88', sessionId: 'sess-5a08f6d10e474c88', riskScore: 21 })
  ];
}

function riskFor(severity: AuditSeverity, outcome: AuditOutcome, r: Rand): number {
  const base = { Critical: 70, High: 50, Medium: 25, Low: 5 }[severity];
  return Math.min(99, base + (outcome === 'Success' ? 0 : 12) + Math.floor(r() * 15));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Round-robin over the distinct kinds so failures and criticals don't bunch up. */
function interleave(list: Template[]): Template[] {
  const groups = new Map<Template, number>();
  for (const t of list) groups.set(t, (groups.get(t) ?? 0) + 1);
  const out: Template[] = [];
  while (out.length < list.length) {
    groups.forEach((n, t) => {
      if (n > 0) {
        out.push(t);
        groups.set(t, n - 1);
      }
    });
  }
  return out;
}

/** All 1,248 events, newest first. */
export function seedAuditEvents(): AuditEvent[] {
  const r = seeded(1248);
  const seeds = designRows();

  // Remaining slots per category, then a deterministic shuffle
  const remaining = new Map<AuditCategory, number>(CATEGORY_COUNTS);
  for (const s of seeds) remaining.set(s.category, (remaining.get(s.category) ?? 0) - 1);
  const order: AuditCategory[] = [];
  remaining.forEach((n, c) => { for (let i = 0; i < n; i++) order.push(c); });
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Specials sit at evenly spread positions inside their category
  const specialAt = new Map<AuditCategory, Map<number, Template>>();
  for (const [cat, list] of Object.entries(SPECIALS) as [AuditCategory, Template[]][]) {
    const n = remaining.get(cat) ?? 0;
    const slots = new Map<number, Template>();
    const mixed = interleave(list);
    mixed.forEach((t, k) => slots.set(Math.floor(((k + 0.5) * n) / mixed.length), t));
    specialAt.set(cat, slots);
  }

  const seen = new Map<AuditCategory, number>();
  let clock = 8 * 3600 + 21 * 60 + 37; // just before the oldest design row (08:21:37)
  const events: AuditEvent[] = order.map((cat) => {
    const k = seen.get(cat) ?? 0;
    seen.set(cat, k + 1);
    clock -= 4 + Math.floor(r() * 36);
    const time = `${pad(Math.floor(clock / 3600))}:${pad(Math.floor((clock % 3600) / 60))}:${pad(clock % 60)}`;

    let tpl: Template = specialAt.get(cat)?.get(k) ?? pick(r, NORMAL[cat]);
    if (cat === 'Configuration') {
      const isChange = Math.floor(((k + 1) * CONFIG_CHANGES) / (remaining.get(cat) ?? 1)) > Math.floor((k * CONFIG_CHANGES) / (remaining.get(cat) ?? 1));
      tpl = isChange ? pick(r, NORMAL.Configuration) : configViewed;
    }
    const b = tpl(r);
    const a = pick(r, ACTORS);
    const sessionHex = hex(r, 16);
    return {
      id: `AUD-${AUDIT_DAY.replace(/-/g, '')}-${time.replace(/:/g, '')}-${hex(r, 4).toUpperCase()}`,
      timestamp: `${AUDIT_DAY}T${time}`,
      event: b.event,
      category: cat,
      module: b.module,
      action: b.action,
      user: a.name,
      userId: a.id,
      role: a.role,
      entityType: b.entityType,
      entity: b.recordId === 'SELF' ? 'User account' : b.entity,
      recordId: b.recordId === 'SELF' ? a.id : b.recordId,
      ip: r() < 0.8 ? a.ip : `10.20.${1 + Math.floor(r() * 9)}.${10 + Math.floor(r() * 240)}`,
      device: r() < 0.85 ? a.device : pick(r, DEVICES),
      location: a.location[0],
      countryCode: a.location[1],
      requestId: `REQ-${hex(r, 8)}-${hex(r, 4)}-${hex(r, 4)}`,
      severity: b.severity,
      outcome: b.outcome,
      mfa: a.mfa ? 'Enabled' : 'Not enrolled',
      sessionId: b.outcome === 'Failed' && b.module === 'Security' ? 'sess-none' : `sess-${sessionHex}`,
      authMethod: b.module === 'Integration & API' && b.event !== 'Integration credentials updated' ? 'API Key (OAuth 2.0)' : a.mfa ? 'Password + MFA' : 'Password',
      riskScore: riskFor(b.severity, b.outcome, r),
      before: b.before === undefined ? '' : json(b.before),
      after: b.after === undefined ? '' : json(b.after)
    };
  });
  return [...seeds, ...events];
}
