// Static demo data for Administration > Integration & API. Times are relative to page load.

export type IntegrationStatus = 'Connected' | 'Active' | 'Warning' | 'Disabled';
export type Environment = 'Development' | 'Staging' | 'Production';
export type SyncDirection = 'Inbound' | 'Outbound' | 'Bi-directional';
export type RunStatus = 'Success' | 'Warning' | 'Failed';
export type LogLevel = 'Info' | 'Warning' | 'Error';

export interface SyncRun {
  id: string;
  object: string;
  /** "in" = external system to Asset360, "out" = Asset360 to external system. */
  direction: 'in' | 'out';
  records: number;
  startedAt: string;
  durationSec: number;
  status: RunStatus;
  message: string;
}

export interface FieldMapping {
  id: string;
  object: string;
  source: string;
  target: string;
  transform: string;
  required: boolean;
}

/** API keys keep only a prefix and the last 4 characters; the full secret is shown once at creation. */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  createdAt: string;
  expiresAt: string;
  scopes: string[];
  status: 'Active' | 'Revoked';
  lastUsed: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secretLast4: string;
  lastDelivery: string | null;
  lastStatus: 'Delivered' | 'Failed' | 'Never';
}

export interface LogEntry {
  id: string;
  at: string;
  level: LogLevel;
  event: string;
  message: string;
  actor: string;
}

export interface IntegrationLogo {
  text: string;
  bg: string;
  ink: string;
}

export interface Integration {
  id: string;
  code: string;
  name: string;
  provider: string;
  type: string;
  version: string;
  logo: IntegrationLogo;
  status: IntegrationStatus;
  environment: Environment;
  baseUrl: string;
  authMethod: string;
  clientId: string;
  /** Last 4 characters of the stored secret key; the secret itself is never kept in the UI. */
  secretLast4: string;
  secretRotatedAt: string;
  syncFrequency: string;
  timeout: number;
  retryPolicy: string;
  ipAllowlist: boolean;
  lastTestAt: string;
  lastTestPassed: boolean;
  lastSync: string | null;
  recordsSynced: number;
  syncDirection: SyncDirection;
  dataObjects: string[];
  mappings: FieldMapping[];
  runs: SyncRun[];
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  logs: LogEntry[];
}

export const ENVIRONMENTS: Environment[] = ['Development', 'Staging', 'Production'];
export const AUTH_METHODS = [
  'OAuth 2.0 (Client Credentials)',
  'OAuth 2.0 (Authorization Code)',
  'OpenID Connect',
  'API Key',
  'Basic Authentication',
  'Mutual TLS'
];
export const SYNC_FREQUENCIES = ['Real-time', 'Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes', 'Hourly', 'Every 6 hours', 'Daily', 'Manual'];
export const RETRY_POLICIES = ['No retries', '3 retries (fixed 30s)', '3 retries (exponential backoff)', '5 retries (exponential backoff)'];
export const API_SCOPES = ['assets:read', 'assets:write', 'inventory:read', 'inventory:write', 'workorders:read', 'workorders:write', 'people:read', 'webhooks:manage'];
export const WEBHOOK_EVENTS = [
  'asset.created',
  'asset.updated',
  'asset.deleted',
  'workorder.created',
  'workorder.completed',
  'inventory.low_stock',
  'alert.raised',
  'sync.failed'
];
export const TRANSFORMS = ['None', 'Uppercase', 'Trim', 'Date (ISO 8601)', 'Lookup', 'Currency (AED)', 'Concatenate'];
export const STATUSES: IntegrationStatus[] = ['Connected', 'Active', 'Warning', 'Disabled'];

/** Minutes between scheduled syncs, used for "Next Sync". 0 = not scheduled. */
export const FREQUENCY_MINUTES: Record<string, number> = {
  'Real-time': 1,
  'Every 5 minutes': 5,
  'Every 15 minutes': 15,
  'Every 30 minutes': 30,
  Hourly: 60,
  'Every 6 hours': 360,
  Daily: 1440,
  Manual: 0
};

export interface ProviderInfo {
  type: string;
  logo: IntegrationLogo;
  direction: SyncDirection;
  objects: string[];
}

/** Known providers: integration type, badge and the objects they usually exchange. */
export const PROVIDERS: Record<string, ProviderInfo> = {
  'SAP ERP': { type: 'ERP', logo: { text: 'SAP', bg: '#0a6ed1', ink: '#fff' }, direction: 'Bi-directional', objects: ['Assets', 'Vendors', 'Work Orders', 'Inventory'] },
  'Microsoft Entra ID': { type: 'Identity', logo: { text: 'ID', bg: '#e0edff', ink: '#0b63ce' }, direction: 'Inbound', objects: ['Users', 'Groups'] },
  'IoT Platform': { type: 'IoT', logo: { text: 'IoT', bg: '#e0f2fe', ink: '#0369a1' }, direction: 'Inbound', objects: ['Sensors', 'Telemetry', 'Alerts'] },
  'Microsoft Power BI': { type: 'Analytics', logo: { text: 'BI', bg: '#fef3c7', ink: '#b45309' }, direction: 'Outbound', objects: ['Assets', 'Work Orders', 'Costs'] },
  ServiceNow: { type: 'ITSM', logo: { text: 'SN', bg: '#dcfce7', ink: '#15803d' }, direction: 'Bi-directional', objects: ['Incidents', 'Assets'] },
  'Oracle Fusion': { type: 'Finance', logo: { text: 'O', bg: '#ef4444', ink: '#fff' }, direction: 'Bi-directional', objects: ['Assets', 'Depreciation', 'Purchase Orders'] },
  SendGrid: { type: 'Notification', logo: { text: '@', bg: '#dbeafe', ink: '#1d4ed8' }, direction: 'Outbound', objects: ['Notifications'] },
  Workday: { type: 'HR', logo: { text: 'HR', bg: '#e0e7ff', ink: '#3730a3' }, direction: 'Inbound', objects: ['Employees', 'Departments'] },
  'Microsoft Teams': { type: 'Collaboration', logo: { text: 'T', bg: '#ede9fe', ink: '#5b21b6' }, direction: 'Outbound', objects: ['Notifications', 'Approvals'] },
  Geotab: { type: 'IoT', logo: { text: 'FT', bg: '#ffedd5', ink: '#c2410c' }, direction: 'Inbound', objects: ['Vehicles', 'GPS'] },
  Salesforce: { type: 'CRM', logo: { text: 'SF', bg: '#e0f2fe', ink: '#0284c7' }, direction: 'Bi-directional', objects: ['Customers', 'Contracts'] },
  'Custom REST': { type: 'Custom', logo: { text: 'API', bg: '#f1f5f9', ink: '#334155' }, direction: 'Bi-directional', objects: ['Assets'] }
};

/** Source → target field pairs per data object, used to seed Data Mapping. */
const FIELD_PAIRS: Record<string, [string, string][]> = {
  Assets: [['MATNR', 'asset_code'], ['MAKTX', 'asset_name'], ['ANLKL', 'category'], ['KOSTL', 'cost_center']],
  Vendors: [['LIFNR', 'vendor_code'], ['NAME1', 'vendor_name'], ['STCD1', 'tax_number']],
  'Work Orders': [['AUFNR', 'work_order_no'], ['KTEXT', 'description'], ['GSTRP', 'planned_start']],
  Inventory: [['MATNR', 'item_code'], ['LABST', 'quantity_on_hand'], ['LGORT', 'storage_location']],
  Users: [['userPrincipalName', 'email'], ['displayName', 'full_name'], ['department', 'department']],
  Groups: [['id', 'external_id'], ['displayName', 'role_name']],
  Employees: [['Employee_ID', 'employee_no'], ['Legal_Name', 'full_name'], ['Cost_Center', 'cost_center']]
};

let idSeq = 1;
function nextId(prefix: string): string {
  return `${prefix}-${String(idSeq++).padStart(4, '0')}`;
}

/** ISO time `minutes` before page load. */
export function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

/** ISO time `days` from page load. */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function mappingsFor(objects: string[]): FieldMapping[] {
  return objects.flatMap((object) => {
    const pairs = FIELD_PAIRS[object] ?? [
      ['id', 'external_id'],
      ['name', 'name'],
      ['updated_at', 'last_modified']
    ];
    return pairs.map(([source, target], i) => ({
      id: nextId('MAP'),
      object,
      source,
      target,
      transform: i === 0 ? 'Trim' : target.includes('start') || target.includes('modified') ? 'Date (ISO 8601)' : 'None',
      required: i === 0
    }));
  });
}

interface RunSeed {
  object: string;
  direction: 'in' | 'out';
  records: number;
  minutesAgo: number;
  durationSec: number;
  status?: RunStatus;
  message?: string;
}

function runs(seeds: RunSeed[]): SyncRun[] {
  return seeds.map((r) => ({
    id: nextId('RUN'),
    object: r.object,
    direction: r.direction,
    records: r.records,
    startedAt: ago(r.minutesAgo),
    durationSec: r.durationSec,
    status: r.status ?? 'Success',
    message: r.message ?? (r.status === 'Failed' ? 'Sync failed' : r.status === 'Warning' ? 'Completed with warnings' : 'Completed')
  }));
}

/** A regular history of runs for integrations without hand-written activity. */
function scheduledRuns(objects: string[], direction: SyncDirection, everyMinutes: number, firstAgo: number, failures: number[] = []): SyncRun[] {
  const seeds: RunSeed[] = [];
  for (let i = 0; i < 6; i++) {
    const failed = failures.includes(i);
    seeds.push({
      object: objects[i % objects.length],
      direction: direction === 'Outbound' ? 'out' : direction === 'Inbound' ? 'in' : i % 2 ? 'out' : 'in',
      records: failed ? 0 : ((i + 3) * 137) % 900 + 12,
      minutesAgo: firstAgo + i * Math.max(everyMinutes, 20),
      durationSec: ((i + 2) * 23) % 180 + 9,
      status: failed ? 'Failed' : 'Success',
      message: failed ? 'Upstream returned HTTP 503 Service Unavailable' : undefined
    });
  }
  return runs(seeds);
}

/** Logs derived from the run history, plus a credential test and a config change. */
function logsFor(rs: SyncRun[], testAgo: number, testPassed: boolean): LogEntry[] {
  const fromRuns: LogEntry[] = rs.map((r) => ({
    id: nextId('LOG'),
    at: r.startedAt,
    level: r.status === 'Failed' ? 'Error' : r.status === 'Warning' ? 'Warning' : 'Info',
    event: r.status === 'Failed' ? 'Sync failed' : 'Sync completed',
    message: `${r.object}: ${r.records.toLocaleString('en-US')} records ${r.direction === 'in' ? 'received' : 'sent'} — ${r.message}`,
    actor: 'Scheduler'
  }));
  const extra: LogEntry[] = [
    {
      id: nextId('LOG'),
      at: ago(testAgo),
      level: testPassed ? 'Info' : 'Error',
      event: 'Connection test',
      message: testPassed ? 'Credential test passed (TLS 1.3)' : 'Credential test failed: invalid_client',
      actor: 'Sarah Ahmed'
    },
    { id: nextId('LOG'), at: ago(testAgo + 4320), level: 'Info', event: 'Configuration updated', message: 'Sync frequency updated', actor: 'Omar Hassan' }
  ];
  return [...fromRuns, ...extra].sort((a, b) => b.at.localeCompare(a.at));
}

function key(name: string, prefix: string, last4: string, createdDaysAgo: number, expiresInDays: number, scopes: string[], usedAgo: number | null): ApiKey {
  return {
    id: nextId('KEY'),
    name,
    prefix,
    last4,
    createdAt: ago(createdDaysAgo * 1440),
    expiresAt: inDays(expiresInDays),
    scopes,
    status: 'Active',
    lastUsed: usedAgo === null ? null : ago(usedAgo)
  };
}

function hook(url: string, events: string[], active: boolean, last4: string, deliveredAgo: number | null, failed = false): Webhook {
  return {
    id: nextId('WH'),
    url,
    events,
    active,
    secretLast4: last4,
    lastDelivery: deliveredAgo === null ? null : ago(deliveredAgo),
    lastStatus: deliveredAgo === null ? 'Never' : failed ? 'Failed' : 'Delivered'
  };
}

interface Seed {
  code: string;
  name: string;
  provider: string;
  version: string;
  status: IntegrationStatus;
  environment?: Environment;
  baseUrl: string;
  authMethod: string;
  clientId: string;
  secretLast4: string;
  rotatedDaysAgo: number;
  syncFrequency: string;
  lastSyncAgo: number | null;
  recordsSynced: number;
  runs: SyncRun[];
  apiKeys?: ApiKey[];
  webhooks?: Webhook[];
  testAgo?: number;
  testPassed?: boolean;
}

function integration(s: Seed): Integration {
  const p = PROVIDERS[s.provider];
  const testAgo = s.testAgo ?? 2880;
  const testPassed = s.testPassed ?? true;
  return {
    id: nextId('INT'),
    code: s.code,
    name: s.name,
    provider: s.provider,
    type: p.type,
    version: s.version,
    logo: p.logo,
    status: s.status,
    environment: s.environment ?? 'Production',
    baseUrl: s.baseUrl,
    authMethod: s.authMethod,
    clientId: s.clientId,
    secretLast4: s.secretLast4,
    secretRotatedAt: ago(s.rotatedDaysAgo * 1440),
    syncFrequency: s.syncFrequency,
    timeout: 300,
    retryPolicy: '3 retries (exponential backoff)',
    ipAllowlist: true,
    lastTestAt: ago(testAgo),
    lastTestPassed: testPassed,
    lastSync: s.lastSyncAgo === null ? null : ago(s.lastSyncAgo),
    recordsSynced: s.recordsSynced,
    syncDirection: p.direction,
    dataObjects: [...p.objects],
    mappings: mappingsFor(p.objects),
    runs: s.runs,
    apiKeys: s.apiKeys ?? [],
    webhooks: s.webhooks ?? [],
    logs: logsFor(s.runs, testAgo, testPassed)
  };
}

export function buildIntegrations(): Integration[] {
  idSeq = 1;
  return [
    integration({
      code: 'INT-ERP-001',
      name: 'SAP ERP',
      provider: 'SAP ERP',
      version: 'v2.4',
      status: 'Connected',
      baseUrl: 'https://erp.purpleiq.com/api/v2',
      authMethod: 'OAuth 2.0 (Client Credentials)',
      clientId: 'a360-sap-prod-7f3c2e91',
      secretLast4: '9xQ2',
      rotatedDaysAgo: 66,
      syncFrequency: 'Every 15 minutes',
      lastSyncAgo: 5,
      recordsSynced: 18642,
      runs: runs([
        { object: 'Assets', direction: 'in', records: 124, minutesAgo: 5, durationSec: 84 },
        { object: 'Vendors', direction: 'out', records: 18, minutesAgo: 7, durationSec: 18 },
        { object: 'Inventory', direction: 'in', records: 2480, minutesAgo: 17, durationSec: 192, status: 'Warning', message: '12 items skipped: unknown storage location' },
        { object: 'Work Orders', direction: 'out', records: 56, minutesAgo: 20, durationSec: 41 },
        { object: 'Assets', direction: 'in', records: 98, minutesAgo: 35, durationSec: 77 },
        { object: 'Vendors', direction: 'in', records: 4, minutesAgo: 50, durationSec: 12 },
        { object: 'Inventory', direction: 'in', records: 2391, minutesAgo: 65, durationSec: 186 }
      ]),
      apiKeys: [
        key('SAP PI/PO outbound', 'a360_live_', 'k2Pq', 120, 245, ['assets:read', 'assets:write', 'inventory:write'], 12),
        key('SAP reporting (read-only)', 'a360_live_', '7TzA', 40, 50, ['assets:read', 'workorders:read'], 1440)
      ],
      webhooks: [
        hook('https://erp.purpleiq.com/hooks/asset360/assets', ['asset.created', 'asset.updated'], true, '3f9a', 6),
        hook('https://erp.purpleiq.com/hooks/asset360/workorders', ['workorder.completed'], true, 'b71e', 22),
        hook('https://erp.purpleiq.com/hooks/asset360/stock', ['inventory.low_stock'], true, '04cd', 180)
      ]
    }),
    integration({
      code: 'INT-IDP-001',
      name: 'Microsoft Entra ID',
      provider: 'Microsoft Entra ID',
      version: 'v1.3',
      status: 'Connected',
      baseUrl: 'https://graph.microsoft.com/v1.0',
      authMethod: 'OpenID Connect',
      clientId: '5c1e8a4d-2b7f-4e10-9a63-entra',
      secretLast4: 'Lm8w',
      rotatedDaysAgo: 30,
      syncFrequency: 'Hourly',
      lastSyncAgo: 95,
      recordsSynced: 1284,
      runs: scheduledRuns(['Users', 'Groups'], 'Inbound', 60, 95),
      webhooks: [hook('https://login.purpleiq.com/asset360/provisioning', ['sync.failed'], true, 'e2a0', 2900)]
    }),
    integration({
      code: 'INT-IOT-001',
      name: 'IoT Platform',
      provider: 'IoT Platform',
      version: 'v1.1',
      status: 'Connected',
      baseUrl: 'https://iot.purpleiq.com/api/v1',
      authMethod: 'API Key',
      clientId: 'iot-gateway-dxb-01',
      secretLast4: 'Rr41',
      rotatedDaysAgo: 12,
      syncFrequency: 'Real-time',
      lastSyncAgo: 140,
      recordsSynced: 482310,
      runs: scheduledRuns(['Telemetry', 'Alerts', 'Sensors'], 'Inbound', 20, 140),
      apiKeys: [key('Gateway ingest', 'a360_live_', 'q0Hc', 200, 165, ['assets:read', 'assets:write'], 1)],
      webhooks: [
        hook('https://iot.purpleiq.com/hooks/alerts', ['alert.raised'], true, '77d1', 3),
        hook('https://iot.purpleiq.com/hooks/assets', ['asset.created', 'asset.deleted'], true, 'c5b8', 600),
        hook('https://iot.purpleiq.com/hooks/workorders', ['workorder.created'], true, '19fe', 240)
      ]
    }),
    integration({
      code: 'INT-BI-001',
      name: 'Power BI',
      provider: 'Microsoft Power BI',
      version: 'v1.0',
      status: 'Active',
      baseUrl: 'https://api.powerbi.com/v1.0/myorg',
      authMethod: 'OAuth 2.0 (Authorization Code)',
      clientId: 'pbi-asset360-workspace',
      secretLast4: 'Ty5u',
      rotatedDaysAgo: 80,
      syncFrequency: 'Daily',
      lastSyncAgo: 1040,
      recordsSynced: 96420,
      runs: scheduledRuns(['Assets', 'Work Orders', 'Costs'], 'Outbound', 1440, 1040)
    }),
    integration({
      code: 'INT-ITSM-001',
      name: 'ServiceNow',
      provider: 'ServiceNow',
      version: 'v2.1',
      status: 'Connected',
      baseUrl: 'https://purpleiq.service-now.com/api/now',
      authMethod: 'OAuth 2.0 (Client Credentials)',
      clientId: 'sn-asset360-integration',
      secretLast4: 'Pz0d',
      rotatedDaysAgo: 45,
      syncFrequency: 'Every 30 minutes',
      lastSyncAgo: 210,
      recordsSynced: 7215,
      runs: scheduledRuns(['Incidents', 'Assets'], 'Bi-directional', 30, 210),
      webhooks: [
        hook('https://purpleiq.service-now.com/api/x_a360/incident', ['alert.raised', 'workorder.created'], true, '8a2c', 215),
        hook('https://purpleiq.service-now.com/api/x_a360/cmdb', ['asset.updated'], true, 'f0e9', 400)
      ]
    }),
    integration({
      code: 'INT-FIN-001',
      name: 'Oracle Finance',
      provider: 'Oracle Fusion',
      version: 'v1.8',
      status: 'Warning',
      baseUrl: 'https://fin.purpleiq.com/fscmRestApi/resources/11.13',
      authMethod: 'Basic Authentication',
      clientId: 'svc_asset360_fin',
      secretLast4: 'Wq7n',
      rotatedDaysAgo: 85,
      syncFrequency: 'Every 6 hours',
      lastSyncAgo: 40,
      recordsSynced: 3120,
      runs: scheduledRuns(['Assets', 'Depreciation', 'Purchase Orders'], 'Bi-directional', 360, 40, [0, 1]),
      apiKeys: [key('Finance month-end export', 'a360_live_', 'Ue3s', 300, 12, ['assets:read'], 4320)],
      webhooks: [
        hook('https://fin.purpleiq.com/hooks/asset360/capex', ['asset.created'], true, '6d4b', 45, true),
        hook('https://fin.purpleiq.com/hooks/asset360/legacy', ['asset.deleted'], false, '2c19', null)
      ]
    }),
    integration({
      code: 'INT-NTF-001',
      name: 'Email Service',
      provider: 'SendGrid',
      version: 'v1.0',
      status: 'Active',
      baseUrl: 'https://api.sendgrid.com/v3',
      authMethod: 'API Key',
      clientId: 'asset360-notifications',
      secretLast4: 'Sg9k',
      rotatedDaysAgo: 20,
      syncFrequency: 'Real-time',
      lastSyncAgo: 250,
      recordsSynced: 28410,
      runs: scheduledRuns(['Notifications'], 'Outbound', 20, 250),
      webhooks: [hook('https://api.purpleiq.com/asset360/email-events', ['sync.failed'], true, 'aa31', 250)]
    }),
    integration({
      code: 'INT-HR-001',
      name: 'HR System',
      provider: 'Workday',
      version: 'v1.4',
      status: 'Connected',
      baseUrl: 'https://wd3-impl.workday.com/ccx/api/v1/purpleiq',
      authMethod: 'OAuth 2.0 (Client Credentials)',
      clientId: 'wd-isu-asset360',
      secretLast4: 'Hd2p',
      rotatedDaysAgo: 55,
      syncFrequency: 'Daily',
      lastSyncAgo: 160,
      recordsSynced: 2186,
      runs: scheduledRuns(['Employees', 'Departments'], 'Inbound', 1440, 160),
      webhooks: [hook('https://hr.purpleiq.com/hooks/asset360/custody', ['asset.updated'], true, '5e70', 300)]
    }),
    integration({
      code: 'INT-COL-001',
      name: 'Microsoft Teams',
      provider: 'Microsoft Teams',
      version: 'v1.2',
      status: 'Active',
      baseUrl: 'https://graph.microsoft.com/v1.0/teams',
      authMethod: 'OAuth 2.0 (Client Credentials)',
      clientId: 'teams-asset360-bot',
      secretLast4: 'Tm4x',
      rotatedDaysAgo: 10,
      syncFrequency: 'Real-time',
      lastSyncAgo: 25,
      recordsSynced: 5402,
      runs: scheduledRuns(['Notifications', 'Approvals'], 'Outbound', 20, 25),
      webhooks: [
        hook('https://purpleiq.webhook.office.com/asset360/maintenance', ['workorder.created', 'workorder.completed'], true, '0b8f', 30),
        hook('https://purpleiq.webhook.office.com/asset360/alerts', ['alert.raised', 'sync.failed'], true, 'd4c2', 70)
      ]
    }),
    integration({
      code: 'INT-IOT-002',
      name: 'Fleet Telematics',
      provider: 'Geotab',
      version: 'v0.9',
      status: 'Warning',
      environment: 'Staging',
      baseUrl: 'https://my.geotab.com/apiv1',
      authMethod: 'Basic Authentication',
      clientId: 'asset360-fleet',
      secretLast4: 'Gt6v',
      rotatedDaysAgo: 88,
      syncFrequency: 'Every 5 minutes',
      lastSyncAgo: 15,
      recordsSynced: 61204,
      runs: scheduledRuns(['Vehicles', 'GPS'], 'Inbound', 5, 15, [0]),
      testAgo: 600,
      testPassed: true
    }),
    integration({
      code: 'INT-CRM-001',
      name: 'Salesforce',
      provider: 'Salesforce',
      version: 'v3.0',
      status: 'Disabled',
      environment: 'Staging',
      baseUrl: 'https://purpleiq.my.salesforce.com/services/data/v59.0',
      authMethod: 'OAuth 2.0 (Authorization Code)',
      clientId: '3MVG9-asset360-crm',
      secretLast4: 'Sf1b',
      rotatedDaysAgo: 140,
      syncFrequency: 'Manual',
      lastSyncAgo: 30 * 1440,
      recordsSynced: 812,
      runs: scheduledRuns(['Customers', 'Contracts'], 'Bi-directional', 1440, 30 * 1440),
      webhooks: [hook('https://purpleiq.my.salesforce.com/hooks/asset360', ['asset.created'], false, '9e3d', 30 * 1440)],
      testAgo: 31 * 1440
    }),
    integration({
      code: 'INT-CMMS-001',
      name: 'Legacy CMMS',
      provider: 'Custom REST',
      version: 'v4.2',
      status: 'Disabled',
      environment: 'Development',
      baseUrl: 'https://cmms-legacy.purpleiq.local/api',
      authMethod: 'Basic Authentication',
      clientId: 'cmms_migration',
      secretLast4: 'Cm2r',
      rotatedDaysAgo: 200,
      syncFrequency: 'Manual',
      lastSyncAgo: 75 * 1440,
      recordsSynced: 40213,
      runs: scheduledRuns(['Assets'], 'Inbound', 1440, 75 * 1440),
      testAgo: 76 * 1440
    })
  ];
}
