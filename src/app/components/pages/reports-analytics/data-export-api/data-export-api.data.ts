import { CURRENT_USER, RA_CATEGORIES, RA_LOCATIONS, RA_PEOPLE, assetId } from '../shared/analytics-common';
import { AccessLog, ApiConnection, Dataset, DatasetField, ExportJob, FieldType, Frequency } from './data-export-api.model';

// DEMO MODE: deterministic seed for the Data Export / API page (period ending 29 Oct 2026, Asia/Dubai)

function f(group: string, name: string, type: FieldType): DatasetField {
  return { group, name, type };
}

/** Fields per data group; datasets combine one or more groups. */
export const FIELD_GROUPS: Record<string, DatasetField[]> = {
  Assets: [
    f('Assets', 'Asset ID', 'id'), f('Assets', 'Asset Name', 'text'), f('Assets', 'Category', 'text'), f('Assets', 'Location', 'text'),
    f('Assets', 'Status', 'text'), f('Assets', 'Condition', 'text'), f('Assets', 'Purchase Date', 'date'),
    f('Assets', 'Purchase Cost', 'money'), f('Assets', 'Custodian', 'text')
  ],
  Maintenance: [
    f('Maintenance', 'Work Order ID', 'id'), f('Maintenance', 'Work Type', 'text'), f('Maintenance', 'Priority', 'text'),
    f('Maintenance', 'Opened On', 'date'), f('Maintenance', 'Labour Hours', 'number'), f('Maintenance', 'Maintenance Cost', 'money'),
    f('Maintenance', 'Technician', 'text')
  ],
  Inspection: [
    f('Inspection', 'Inspection ID', 'id'), f('Inspection', 'Checklist', 'text'), f('Inspection', 'Result', 'text'),
    f('Inspection', 'Score', 'percent'), f('Inspection', 'Findings', 'number'), f('Inspection', 'Inspected On', 'date'),
    f('Inspection', 'Inspector', 'text')
  ],
  Inventory: [
    f('Inventory', 'Item Code', 'id'), f('Inventory', 'Item Name', 'text'), f('Inventory', 'Warehouse', 'text'),
    f('Inventory', 'On Hand', 'number'), f('Inventory', 'Reorder Level', 'number'), f('Inventory', 'Unit Cost', 'money'),
    f('Inventory', 'Last Movement', 'date')
  ],
  Financial: [
    f('Financial', 'Cost Center', 'text'), f('Financial', 'Capex', 'money'), f('Financial', 'Opex', 'money'),
    f('Financial', 'Depreciation', 'money'), f('Financial', 'Net Book Value', 'money'), f('Financial', 'Period', 'text')
  ],
  'Tracking & IoT': [
    f('Tracking & IoT', 'Device ID', 'id'), f('Tracking & IoT', 'Signal', 'text'), f('Tracking & IoT', 'Battery', 'percent'),
    f('Tracking & IoT', 'Utilization', 'percent'), f('Tracking & IoT', 'Last Seen', 'date')
  ],
  'Audit & Compliance': [
    f('Audit & Compliance', 'Audit ID', 'id'), f('Audit & Compliance', 'Standard', 'text'), f('Audit & Compliance', 'Site', 'text'),
    f('Audit & Compliance', 'Open Findings', 'number'), f('Audit & Compliance', 'Compliance Score', 'percent'),
    f('Audit & Compliance', 'Due Date', 'date')
  ],
  'WIP / Operations': [
    f('WIP / Operations', 'Job ID', 'id'), f('WIP / Operations', 'Production Line', 'text'), f('WIP / Operations', 'Stage', 'text'),
    f('WIP / Operations', 'Output Units', 'number'), f('WIP / Operations', 'On-time Completion', 'percent'),
    f('WIP / Operations', 'Planned Finish', 'date')
  ],
  'Movement & Custody': [
    f('Movement & Custody', 'Transfer ID', 'id'), f('Movement & Custody', 'From Site', 'text'), f('Movement & Custody', 'To Site', 'text'),
    f('Movement & Custody', 'Moved On', 'date'), f('Movement & Custody', 'Custodian', 'text')
  ],
  'Contracts & Warranty': [
    f('Contracts & Warranty', 'Contract ID', 'id'), f('Contracts & Warranty', 'Vendor', 'text'),
    f('Contracts & Warranty', 'Contract Value', 'money'), f('Contracts & Warranty', 'Warranty End', 'date')
  ]
};

export const DATASETS: Dataset[] = [
  { id: 'DS-01', name: 'Assets', modules: ['Assets'], groups: ['Assets'], rows: 1248, sizeGb: 0.4, refreshed: '2026-10-29T01:00', owner: 'Michael Chen' },
  { id: 'DS-02', name: 'Maintenance', modules: ['Maintenance'], groups: ['Assets', 'Maintenance'], rows: 4862, sizeGb: 1.2, refreshed: '2026-10-29T06:00', owner: 'Priya Sharma' },
  { id: 'DS-03', name: 'Inspection', modules: ['Inspection'], groups: ['Assets', 'Inspection'], rows: 3486, sizeGb: 0.9, refreshed: '2026-10-29T10:00', owner: 'James Wilson' },
  { id: 'DS-04', name: 'Inventory', modules: ['Inventory'], groups: ['Inventory'], rows: 8426, sizeGb: 0.7, refreshed: '2026-10-29T02:00', owner: 'Sarah Khan' },
  { id: 'DS-05', name: 'Financial', modules: ['Financial'], groups: ['Assets', 'Financial'], rows: 1248, sizeGb: 0.3, refreshed: '2026-10-26T08:00', owner: 'Daniel Kim' },
  { id: 'DS-06', name: 'Tracking & IoT', modules: ['Tracking & IoT'], groups: ['Assets', 'Tracking & IoT'], rows: 1_842_600, sizeGb: 38.6, refreshed: '2026-10-29T10:32', owner: 'Fatima Noor' },
  { id: 'DS-07', name: 'Audit & Compliance', modules: ['Audit & Compliance'], groups: ['Audit & Compliance'], rows: 642, sizeGb: 0.1, refreshed: '2026-10-28T04:00', owner: 'Lisa Wong' },
  { id: 'DS-08', name: 'WIP / Operations', modules: ['WIP / Operations'], groups: ['WIP / Operations'], rows: 48_620, sizeGb: 2.4, refreshed: '2026-10-29T10:15', owner: 'Rahul Mehta' },
  { id: 'DS-09', name: 'Movement & Custody', modules: ['Movement & Custody'], groups: ['Assets', 'Movement & Custody'], rows: 2_318, sizeGb: 0.2, refreshed: '2026-10-28T22:00', owner: 'Omar Hassan' },
  { id: 'DS-10', name: 'Contracts & Warranty', modules: ['Contracts & Warranty'], groups: ['Assets', 'Contracts & Warranty'], rows: 914, sizeGb: 0.1, refreshed: '2026-10-27T09:00', owner: 'Aisha Rahman' },
  {
    id: 'DS-11', name: 'Asset + Maintenance + Inspection', modules: ['Assets', 'Maintenance', 'Inspection'],
    groups: ['Assets', 'Maintenance', 'Inspection'], rows: 9_596, sizeGb: 2.6, refreshed: '2026-10-29T06:00', owner: CURRENT_USER.name
  }
];

export function datasetFields(ds: Dataset): DatasetField[] {
  const out: DatasetField[] = [];
  for (const g of ds.groups) {
    // A field name appears once per dataset (e.g. Custodian lives in Assets and Movement & Custody)
    for (const fl of FIELD_GROUPS[g] ?? []) if (!out.some((x) => x.name === fl.name)) out.push(fl);
  }
  return out;
}

const TEXT_VALUES: Record<string, string[]> = {
  'Asset Name': ['Forklift FL-12', 'Chiller CH-03', 'Generator GN-07', 'Delivery Van DV-21', 'CNC Lathe CL-02', 'Air Handler AH-14'],
  Category: RA_CATEGORIES,
  Location: RA_LOCATIONS.slice(1),
  Site: RA_LOCATIONS.slice(1),
  Warehouse: ['Jebel Ali Warehouse', 'Al Ain Depot', 'Sharjah Facility'],
  'From Site': RA_LOCATIONS.slice(1),
  'To Site': RA_LOCATIONS.slice(2),
  Status: ['Active', 'Active', 'Under maintenance', 'Active', 'Retired'],
  Condition: ['Good', 'Excellent', 'Fair', 'Good', 'Poor'],
  Custodian: RA_PEOPLE,
  Technician: RA_PEOPLE.slice(3),
  Inspector: RA_PEOPLE.slice(6),
  Priority: ['High', 'Medium', 'Low', 'Critical', 'Medium'],
  'Work Type': ['Preventive', 'Corrective', 'Preventive', 'Predictive'],
  Checklist: ['Fire safety', 'HVAC monthly', 'Vehicle pre-trip', 'Electrical panel'],
  Result: ['Pass', 'Pass', 'Pass with findings', 'Fail', 'Pass'],
  'Item Name': ['Air filter 24x24', 'Hydraulic oil 20L', 'V-belt B52', 'LED panel 60W', 'Bearing 6205'],
  'Cost Center': ['CC-OPS-100', 'CC-MNT-210', 'CC-FAC-300', 'CC-IT-410'],
  Period: ['Oct 2026'],
  Signal: ['Strong', 'Good', 'Strong', 'Weak'],
  Standard: ['ISO 55001', 'ISO 45001', 'ISO 9001', 'Civil Defence'],
  'Production Line': ['Line A', 'Line B', 'Line C'],
  Stage: ['Cutting', 'Assembly', 'QA', 'Packing'],
  Vendor: ['Al Futtaim Engineering', 'Emirates Facilities', 'Gulf Power Systems', 'Carrier Middle East']
};

const ID_PREFIX: Record<string, string> = {
  'Work Order ID': 'WO-2026-', 'Inspection ID': 'INS-2026-', 'Item Code': 'ITM-', 'Device ID': 'TAG-', 'Audit ID': 'AUD-2026-',
  'Job ID': 'JOB-', 'Transfer ID': 'TRF-2026-', 'Contract ID': 'CON-2026-'
};

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Deterministic sample value for row `i` of a field (used by previews and sample downloads). */
export function sampleValue(field: DatasetField, i: number): string | number {
  const h = hash(field.name);
  switch (field.type) {
    case 'id':
      return field.name === 'Asset ID' ? assetId('DXB', 241 + i) : `${ID_PREFIX[field.name] ?? 'ID-'}${String(1840 + i * 7).padStart(5, '0')}`;
    case 'number':
      return ((h % 37) + i * 13) % 180 + 2;
    case 'money':
      return 1200 + ((h % 50) + i * 37) % 90 * 450;
    case 'percent':
      return 72 + ((h % 11) + i * 7) % 27;
    case 'date':
      return `2026-10-${String(1 + ((h % 9) + i * 3) % 28).padStart(2, '0')}`;
    default: {
      const list = TEXT_VALUES[field.name];
      return list ? list[(h + i) % list.length] : `${field.name} ${i + 1}`;
    }
  }
}

export const NEXT_BY_FREQUENCY: Record<Frequency, number> = {
  'Real-time': 0,
  Hourly: 3600_000,
  Daily: 86_400_000,
  Weekly: 7 * 86_400_000,
  Monthly: 30 * 86_400_000,
  'On demand': -1
};

export function buildJobs(): ExportJob[] {
  const job = (j: Omit<ExportJob, 'fields' | 'filters' | 'encrypted'> & Partial<ExportJob>): ExportJob => {
    const ds = DATASETS.find((d) => d.id === j.datasetId) ?? DATASETS[0];
    return { fields: datasetFields(ds).slice(0, 6).map((x) => x.name), filters: [], encrypted: true, ...j };
  };
  return [
    job({ id: 'EXP-1001', name: 'Daily Asset Register', module: 'Assets', datasetId: 'DS-01', format: 'CSV', delivery: 'S3', target: 's3://piq-asset360-exports/asset-register/', destination: 'S3', frequency: 'Daily', time: '01:00', lastRun: '2026-10-29T01:00', nextRun: '2026-10-30T01:00', status: 'Success', owner: 'Michael Chen', sizeGb: 0.4 }),
    job({ id: 'EXP-1002', name: 'Maintenance Cost Feed', module: 'Maintenance', datasetId: 'DS-02', format: 'XLSX', delivery: 'Secure FTP', target: 'sftp.purpleiq.com/finance/in', destination: 'SFTP', frequency: 'Daily', time: '06:00', lastRun: '2026-10-29T06:00', nextRun: '2026-10-30T06:00', status: 'Success', owner: 'Priya Sharma', sizeGb: 1.2, filters: [{ field: 'Opened On', operator: 'in last', value: '30 days' }] }),
    job({ id: 'EXP-1003', name: 'Inspection Findings Feed', module: 'Inspection', datasetId: 'DS-03', format: 'JSON', delivery: 'API', target: 'SAP ERP', destination: 'API', frequency: 'Hourly', time: '00', lastRun: '2026-10-29T10:00', nextRun: '2026-10-29T11:00', status: 'Success', owner: 'James Wilson', sizeGb: 0.05 }),
    job({ id: 'EXP-1004', name: 'Inventory Snapshot', module: 'Inventory', datasetId: 'DS-04', format: 'Parquet', delivery: 'API', target: 'Snowflake Warehouse', destination: 'Snowflake', frequency: 'Daily', time: '02:00', lastRun: '2026-10-29T02:00', nextRun: '2026-10-30T02:00', status: 'Failed', owner: 'Sarah Khan', sizeGb: 0.7, lastError: 'JDBC handshake failed: certificate chain could not be verified.' }),
    job({ id: 'EXP-1005', name: 'Financial Cost Export', module: 'Financial', datasetId: 'DS-05', format: 'CSV', delivery: 'Email', target: 'finance@purpleiq.com', destination: 'Email', frequency: 'Weekly', time: 'Mon 08:00', lastRun: '2026-10-26T08:00', nextRun: '2026-11-02T08:00', status: 'Success', owner: 'Daniel Kim', sizeGb: 0.02 }),
    job({ id: 'EXP-1006', name: 'IoT Telemetry Stream', module: 'Tracking & IoT', datasetId: 'DS-06', format: 'JSON', delivery: 'API', target: 'Azure Data Lake', destination: 'Azure', frequency: 'Real-time', time: 'Continuous', lastRun: '2026-10-29T10:32', nextRun: null, status: 'Scheduled', owner: 'Fatima Noor', sizeGb: 2.1 }),
    job({ id: 'EXP-1007', name: 'Compliance Data Extract', module: 'Audit & Compliance', datasetId: 'DS-07', format: 'XLSX', delivery: 'S3', target: 's3://piq-asset360-exports/compliance/', destination: 'S3', frequency: 'Daily', time: '04:00', lastRun: '2026-10-28T04:00', nextRun: '2026-10-29T04:00', status: 'Paused', owner: 'Lisa Wong', sizeGb: 0.1, lastError: 'Paused by owner during the ISO 45001 audit window.' }),
    job({ id: 'EXP-1008', name: 'Production KPI Feed', module: 'WIP / Operations', datasetId: 'DS-08', format: 'API', delivery: 'API', target: 'Power BI Analytics', destination: 'Power BI', frequency: 'Hourly', time: '15', lastRun: '2026-10-29T10:15', nextRun: '2026-10-29T11:15', status: 'Success', owner: 'Rahul Mehta', sizeGb: 0.08 })
  ];
}

export function buildConnections(): ApiConnection[] {
  return [
    { id: 'CON-01', name: 'Power BI Analytics', type: 'REST', baseUrl: 'https://api.powerbi.com/v1.0/myorg', auth: 'OAuth 2.0 (client credentials)', status: 'Connected', uptime: 99.8, lastTested: '2026-10-29T09:40', secretStored: true, certExpiresInDays: 214, syncDelayMin: 18, owner: 'Rahul Mehta' },
    { id: 'CON-02', name: 'SAP ERP', type: 'OData', baseUrl: 'https://sap.purpleiq.com/odata/v4', auth: 'Basic', status: 'Connected', uptime: 99.5, lastTested: '2026-10-29T08:10', secretStored: true, certExpiresInDays: 160, syncDelayMin: 0, owner: 'James Wilson' },
    { id: 'CON-03', name: 'Snowflake Warehouse', type: 'JDBC', baseUrl: 'https://purpleiq.snowflakecomputing.com', auth: 'Key pair', status: 'Warning', uptime: 97.2, lastTested: '2026-10-29T02:05', secretStored: true, certExpiresInDays: 21, syncDelayMin: 0, owner: 'Sarah Khan' },
    { id: 'CON-04', name: 'Azure Data Lake', type: 'REST', baseUrl: 'https://piqdatalake.dfs.core.windows.net', auth: 'Service principal', status: 'Connected', uptime: 99.9, lastTested: '2026-10-29T10:30', secretStored: true, certExpiresInDays: 300, syncDelayMin: 0, owner: 'Fatima Noor' },
    { id: 'CON-05', name: 'Tableau Server', type: 'REST', baseUrl: 'https://tableau.purpleiq.com/api/3.21', auth: 'Personal access token', status: 'Disconnected', uptime: 0, lastTested: '2026-10-28T17:20', secretStored: true, certExpiresInDays: 95, syncDelayMin: 0, owner: 'Daniel Kim' }
  ];
}

const LOG_ACTIONS: { action: string; resource: string; client: string; result: AccessLog['result'] }[] = [
  { action: 'Export delivered', resource: 'Daily Asset Register', client: 'S3 / piq-asset360-exports', result: 'Success' },
  { action: 'API request GET /reports/export', resource: 'Production KPI Feed', client: 'Power BI Analytics', result: 'Success' },
  { action: 'Export failed', resource: 'Inventory Snapshot', client: 'Snowflake Warehouse', result: 'Failed' },
  { action: 'Export delivered', resource: 'Maintenance Cost Feed', client: 'Secure FTP', result: 'Success' },
  { action: 'API request GET /datasets', resource: 'Inspection', client: 'SAP ERP', result: 'Success' },
  { action: 'API key rejected', resource: 'Financial', client: '185.22.14.9 (not allowlisted)', result: 'Denied' },
  { action: 'Connection test', resource: 'Tableau Server', client: 'Tableau Server', result: 'Failed' },
  { action: 'Sample downloaded', resource: 'Assets', client: 'Web console', result: 'Success' },
  { action: 'Stream batch delivered', resource: 'IoT Telemetry Stream', client: 'Azure Data Lake', result: 'Success' },
  { action: 'Export paused', resource: 'Compliance Data Extract', client: 'Web console', result: 'Success' }
];
const LOG_ACTORS = ['svc-powerbi', 'svc-sap', 'Michael Chen', 'Priya Sharma', 'svc-scheduler', 'unknown', 'Daniel Kim', 'Sarah Ahmed', 'svc-azure', 'Lisa Wong'];

/** Date → "2026-10-29T10:40" in local time */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-10-29T10:40" → "29 Oct 2026, 10:40" */
export function formatStamp(stamp: string | null): string {
  if (!stamp) return '—';
  const [date, time] = stamp.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '';
  return `${String(d).padStart(2, '0')} ${month} ${y}${time ? ', ' + time : ''}`;
}

export function buildLogs(): AccessLog[] {
  const out: AccessLog[] = [];
  for (let i = 0; i < 28; i++) {
    const a = LOG_ACTIONS[i % LOG_ACTIONS.length];
    // 28 entries spread back from 29 Oct 2026 10:40, 47 minutes apart
    const at = new Date(2026, 9, 29, 10, 40 - i * 47);
    out.push({
      id: `LOG-${String(5280 - i)}`,
      at: localStamp(at),
      actor: LOG_ACTORS[i % LOG_ACTORS.length],
      action: a.action,
      resource: a.resource,
      client: a.client,
      ip: a.result === 'Denied' ? '185.22.14.9' : `10.20.${(i * 7) % 40}.${12 + ((i * 13) % 200)}`,
      result: a.result
    });
  }
  return out;
}

/** Daily export runs and API volume for the health charts (oldest first, ending 29 Oct 2026). */
export function buildRunStats(days: number): { labels: string[]; success: number[]; failed: number[]; apiOk: number[]; apiFailed: number[] } {
  const labels: string[] = [];
  const success: number[] = [];
  const failed: number[] = [];
  const apiOk: number[] = [];
  const apiFailed: number[] = [];
  const end = new Date(2026, 9, 29);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000);
    labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const k = days - 1 - i;
    success.push(11 + ((k * 7 + 3) % 7));
    failed.push(k % 5 === 2 ? 2 : k % 3 === 0 ? 1 : 0);
    apiOk.push(20_000 + k * (15_000 / days) + ((k * 37) % 9) * 450);
    apiFailed.push(300 + ((k * 53) % 7) * 45);
  }
  return { labels, success, failed, apiOk: apiOk.map(Math.round), apiFailed };
}
