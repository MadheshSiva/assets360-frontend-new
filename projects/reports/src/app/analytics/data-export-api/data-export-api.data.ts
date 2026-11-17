import {
  AccessLog, ApiConnection, Dataset, DatasetField, ExportJob, ExportRun, ExportSummary, FieldType, LogResult, RunStats
} from './data-export-api.model';

// Static demo data for the Data Export / API page: datasets, export jobs, run history, API connections, access logs
// and the daily run / access statistics. Times are relative to "now" so the page always looks current.

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const DELIVERY_NOTE = 'not delivered: no transport configured';

/** Small deterministic generator so the demo looks the same on every load. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Date → "2026-10-29T10:40" in local time */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Stamp of "now" shifted by the given number of milliseconds (negative = in the past). */
export function stampIn(offsetMs: number): string {
  return localStamp(new Date(Date.now() + offsetMs));
}

/** "2026-10-29T10:40" → "29 Oct 2026, 10:40" */
export function formatStamp(stamp: string | null): string {
  if (!stamp) return '—';
  const [date, time] = stamp.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '';
  return `${String(d).padStart(2, '0')} ${month} ${y}${time ? ', ' + time : ''}`;
}

/** 1536 → "1.5 KB"; null → "—" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

// ----- Datasets -----

function f(group: string, name: string, type: FieldType): DatasetField {
  return { group, name, type };
}

/** Fields per data group; datasets combine one or more groups. */
const FIELD_GROUPS: Record<string, DatasetField[]> = {
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

function fieldsOf(groups: string[]): DatasetField[] {
  const out: DatasetField[] = [];
  // A field name appears once per dataset (e.g. Custodian lives in Assets and Movement & Custody)
  for (const g of groups) for (const fl of FIELD_GROUPS[g] ?? []) if (!out.some((x) => x.name === fl.name)) out.push(fl);
  return out;
}

function ds(
  id: string, name: string, description: string, groups: string[], rows: number, sizeBytes: number, refreshedAgoMin: number, owner: string
): Dataset {
  return {
    id, name, description, modules: groups.slice(), groups, fields: fieldsOf(groups), rows, sizeBytes,
    refreshed: stampIn(-refreshedAgoMin * 60_000), owner, exports: 0
  };
}

export function seedDatasets(): Dataset[] {
  return [
    ds('DS-01', 'Assets', 'Asset register: identity, location, status, condition and cost.', ['Assets'], 12_486, 9_640_000, 12, 'Asset Register Service'),
    ds('DS-02', 'Maintenance', 'Work orders with labour and cost, joined to the asset.', ['Assets', 'Maintenance'], 38_214, 31_850_000, 7, 'Maintenance Service'),
    ds('DS-03', 'Inspection', 'Inspection results, scores and findings per asset.', ['Assets', 'Inspection'], 21_907, 17_220_000, 26, 'Inspection Service'),
    ds('DS-04', 'Inventory', 'Spare parts and consumables on hand per warehouse.', ['Inventory'], 4_318, 2_410_000, 41, 'Inventory Service'),
    ds('DS-05', 'Financial', 'Capex, opex, depreciation and net book value per asset.', ['Assets', 'Financial'], 12_486, 11_930_000, 180, 'Finance Integration'),
    ds('DS-06', 'Tracking & IoT', 'Device telemetry: signal, battery, utilisation and last seen.', ['Assets', 'Tracking & IoT'], 286_540, 214_600_000, 1, 'IoT Gateway'),
    ds('DS-07', 'Audit & Compliance', 'Audits by standard and site with open findings.', ['Audit & Compliance'], 1_264, 690_000, 95, 'Audit Service'),
    ds('DS-08', 'WIP / Operations', 'Production jobs by line and stage with output.', ['WIP / Operations'], 8_752, 4_870_000, 18, 'Operations Service'),
    ds('DS-09', 'Movement & Custody', 'Transfers between sites and custodian changes.', ['Assets', 'Movement & Custody'], 15_093, 10_120_000, 33, 'Asset Register Service'),
    ds('DS-10', 'Contracts & Warranty', 'Vendor contracts, values and warranty end dates.', ['Assets', 'Contracts & Warranty'], 3_406, 2_950_000, 240, 'Contracts Service'),
    ds(
      'DS-11', 'Asset + Maintenance + Inspection', 'Combined asset view with maintenance and inspection history.',
      ['Assets', 'Maintenance', 'Inspection'], 12_486, 26_480_000, 12, 'Reporting Service'
    )
  ];
}

// ----- Sample rows -----

const TEXT_VALUES: Record<string, string[]> = {
  'Asset Name': ['Toyota Hilux 2.8 4x4', 'Caterpillar 320 Excavator', 'Carrier 30XA Chiller', 'Dell PowerEdge R750', 'Cummins C550 Generator', 'Atlas Copco GA37 Compressor', 'Hyster H3.0FT Forklift', 'Schneider Galaxy VS UPS'],
  Category: ['Vehicles', 'Machinery', 'HVAC', 'IT Equipment', 'Power & Electrical', 'Machinery', 'Vehicles', 'Power & Electrical'],
  Location: ['Dubai HQ', 'Jebel Ali Warehouse', 'Sharjah Facility', 'Abu Dhabi Office', 'Al Ain Depot', 'Riyadh Office'],
  Status: ['In Use', 'In Use', 'In Use', 'Under Maintenance', 'In Use', 'Idle'],
  Condition: ['Good', 'Excellent', 'Fair', 'Good', 'Poor', 'Good'],
  Custodian: ['Omar Hassan', 'Aisha Rahman', 'James Tan', 'Priya Sharma', 'Fatima Noor', 'Mohammed Ali', 'Daniel Kim'],
  'Work Type': ['Preventive', 'Corrective', 'Preventive', 'Inspection', 'Emergency', 'Preventive'],
  Priority: ['Medium', 'High', 'Low', 'Medium', 'Critical', 'Low'],
  Technician: ['Rahul Mehta', 'Ahmed Khan', 'John Mathew', 'Omar Khalid', 'Michael Chen'],
  Checklist: ['Fire Safety Monthly', 'Vehicle Pre-Trip', 'HVAC Quarterly', 'Electrical Panel Annual', 'Forklift Daily'],
  Result: ['Pass', 'Pass', 'Pass with findings', 'Pass', 'Fail', 'Pass'],
  Inspector: ['Lisa Wong', 'Fatima Ali', 'Priya Nair', 'Daniel Tan'],
  'Item Name': ['Hydraulic Filter HF-35', 'V-Belt B52', 'Air Filter AF-120', 'Brake Pad Set BP-7', 'Refrigerant R410A 11 kg', 'LED Panel 600x600'],
  Warehouse: ['Jebel Ali Warehouse', 'Sharjah Facility', 'Al Ain Depot', 'Riyadh Office'],
  'Cost Center': ['CC-1100 Fleet', 'CC-1200 Facilities', 'CC-1300 IT', 'CC-1400 Production', 'CC-1500 Logistics'],
  Period: ['2026-10', '2026-10', '2026-09', '2026-10', '2026-09'],
  Signal: ['Strong', 'Strong', 'Good', 'Weak', 'Strong', 'Good'],
  Standard: ['ISO 55001', 'ISO 45001', 'ISO 9001', 'ISO 14001', 'Civil Defence UAE'],
  Site: ['Dubai HQ', 'Sharjah Facility', 'Jebel Ali Warehouse', 'Abu Dhabi Office', 'Riyadh Office'],
  'Production Line': ['Line A – Assembly', 'Line B – Packaging', 'Line C – Fabrication', 'Line D – Finishing'],
  Stage: ['Queued', 'In Progress', 'Quality Check', 'Completed', 'In Progress'],
  'From Site': ['Dubai HQ', 'Jebel Ali Warehouse', 'Sharjah Facility', 'Abu Dhabi Office'],
  'To Site': ['Al Ain Depot', 'Dubai HQ', 'Riyadh Office', 'Sharjah Facility'],
  Vendor: ['Al-Futtaim Engineering', 'Emrill Services', 'Johnson Controls', 'Dell Technologies', 'Caterpillar Gulf', 'Siemens Middle East']
};

const ID_PREFIX: Record<string, string> = {
  'Work Order ID': 'WO-2026-', 'Inspection ID': 'INS-2026-', 'Item Code': 'ITM-', 'Device ID': 'TRK-', 'Audit ID': 'AUD-2026-',
  'Job ID': 'JOB-2026-', 'Transfer ID': 'TRF-2026-', 'Contract ID': 'CTR-2026-'
};

const SITE_CODES = ['DXB', 'JAW', 'SHJ', 'AUH', 'AAN', 'RUH'];

/** One deterministic cell value for a field; row 0 is the newest record. */
export function sampleValue(field: DatasetField, row: number): string | number {
  const r = seeded(row * 131 + field.name.length * 17 + field.name.charCodeAt(0));
  r();
  const pick = (list: string[]) => list[row % list.length];
  switch (field.type) {
    case 'id':
      if (field.name === 'Asset ID') return `AST-2026-${pick(SITE_CODES)}-${String(12_486 - row).padStart(6, '0')}`;
      return `${ID_PREFIX[field.name] ?? 'ID-'}${String(48_210 - row * 7).padStart(6, '0')}`;
    case 'text':
      return TEXT_VALUES[field.name] ? pick(TEXT_VALUES[field.name]) : `${field.name} ${row + 1}`;
    case 'number':
      if (field.name === 'Labour Hours') return Number((1 + r() * 11).toFixed(1));
      if (field.name === 'Output Units') return Math.round(120 + r() * 880);
      return Math.round(r() * (field.name === 'On Hand' ? 240 : field.name === 'Reorder Level' ? 60 : 9));
    case 'money': {
      const scale: Record<string, number> = { 'Purchase Cost': 180_000, 'Maintenance Cost': 6_500, 'Unit Cost': 900, 'Contract Value': 420_000, Capex: 260_000 };
      return Math.round((0.15 + r()) * (scale[field.name] ?? 40_000));
    }
    case 'percent':
      return Number((field.name === 'Battery' ? 18 + r() * 82 : 62 + r() * 38).toFixed(1));
    case 'date': {
      const back = field.name === 'Purchase Date' ? 120 + row * 37 : field.name === 'Warranty End' || field.name === 'Due Date' || field.name === 'Planned Finish' ? -(20 + row * 11) : row;
      return localStamp(new Date(Date.now() - back * DAY - Math.round(r() * 8) * HOUR)).slice(0, 10);
    }
  }
}

export function sampleRows(fields: DatasetField[], count: number): (string | number)[][] {
  return Array.from({ length: count }, (_, i) => fields.map((fl) => sampleValue(fl, i)));
}

// ----- Export jobs and runs -----

interface JobSeed {
  id: string;
  name: string;
  datasetId: string;
  format: ExportJob['format'];
  delivery: ExportJob['delivery'];
  target: string;
  frequency: ExportJob['frequency'];
  time: string;
  status: ExportJob['status'];
  owner: string;
  fields: string[] | null;
  filters: ExportJob['filters'];
  encrypted: boolean;
  lastRunAgoMin: number | null;
  nextRunInMin: number | null;
  rows: number;
  lastError?: string;
}

const JOB_SEEDS: JobSeed[] = [
  {
    id: 'EXP-0001', name: 'Daily Asset Register Feed', datasetId: 'DS-01', format: 'CSV', delivery: 'S3', target: 's3://piq-asset360-exports/assets/',
    frequency: 'Daily', time: '02:00', status: 'Success', owner: 'Sarah Ahmed', fields: null, filters: [], encrypted: true,
    lastRunAgoMin: 8 * 60 + 40, nextRunInMin: 15 * 60 + 20, rows: 12_486
  },
  {
    id: 'EXP-0002', name: 'Maintenance Costs to Power BI', datasetId: 'DS-02', format: 'XLSX', delivery: 'API', target: 'Power BI Service',
    frequency: 'Hourly', time: '15', status: 'Success', owner: 'Omar Hassan',
    fields: ['Asset ID', 'Asset Name', 'Location', 'Work Order ID', 'Work Type', 'Opened On', 'Labour Hours', 'Maintenance Cost'],
    filters: [{ field: 'Opened On', operator: 'in last', value: '90 days' }], encrypted: true, lastRunAgoMin: 22, nextRunInMin: 38, rows: 6_942
  },
  {
    id: 'EXP-0003', name: 'Weekly Inspection Results', datasetId: 'DS-03', format: 'CSV', delivery: 'Email', target: 'qhse.team@purpleiq.com, lisa.wong@purpleiq.com',
    frequency: 'Weekly', time: 'Mon 07:00', status: 'Success', owner: 'Aisha Rahman',
    fields: ['Asset ID', 'Asset Name', 'Location', 'Inspection ID', 'Checklist', 'Result', 'Score', 'Findings', 'Inspected On', 'Inspector'],
    filters: [{ field: 'Inspected On', operator: 'in last', value: '7 days' }], encrypted: false, lastRunAgoMin: 2 * 1440 + 180, nextRunInMin: 4 * 1440 + 600, rows: 1_184
  },
  {
    id: 'EXP-0004', name: 'Inventory Snapshot to SAP', datasetId: 'DS-04', format: 'JSON', delivery: 'API', target: 'SAP S/4HANA Finance',
    frequency: 'Daily', time: '01:30', status: 'Failed', owner: 'James Tan', fields: null,
    filters: [{ field: 'On Hand', operator: '>', value: '0' }], encrypted: true, lastRunAgoMin: 9 * 60 + 10, nextRunInMin: 14 * 60 + 50, rows: 0,
    lastError: 'SAP S/4HANA Finance did not answer within 30 s (connection timed out)'
  },
  {
    id: 'EXP-0005', name: 'Monthly Depreciation Extract', datasetId: 'DS-05', format: 'XLSX', delivery: 'Secure FTP', target: 'sftp.purpleiq.com/finance/depreciation',
    frequency: 'Monthly', time: '03:00', status: 'Scheduled', owner: 'Priya Sharma',
    fields: ['Asset ID', 'Asset Name', 'Category', 'Cost Center', 'Capex', 'Depreciation', 'Net Book Value', 'Period'],
    filters: [], encrypted: true, lastRunAgoMin: 17 * 1440 + 300, nextRunInMin: 13 * 1440 + 200, rows: 12_486
  },
  {
    id: 'EXP-0006', name: 'IoT Telemetry Stream', datasetId: 'DS-06', format: 'JSON', delivery: 'API', target: 'Snowflake Data Cloud',
    frequency: 'Real-time', time: 'Continuous', status: 'Success', owner: 'Daniel Kim',
    fields: ['Asset ID', 'Device ID', 'Signal', 'Battery', 'Utilization', 'Last Seen'],
    filters: [{ field: 'Last Seen', operator: 'in last', value: '1 days' }], encrypted: true, lastRunAgoMin: 3, nextRunInMin: null, rows: 18_620
  },
  {
    id: 'EXP-0007', name: 'Audit Findings for Compliance Board', datasetId: 'DS-07', format: 'CSV', delivery: 'Email', target: 'compliance@purpleiq.com',
    frequency: 'Weekly', time: 'Thu 08:00', status: 'Paused', owner: 'Fatima Noor', fields: null,
    filters: [{ field: 'Open Findings', operator: '>', value: '0' }], encrypted: false, lastRunAgoMin: 12 * 1440 + 90, nextRunInMin: null, rows: 214
  },
  {
    id: 'EXP-0008', name: 'Contracts Renewal Watchlist', datasetId: 'DS-10', format: 'XLSX', delivery: 'Email', target: 'procurement@purpleiq.com',
    frequency: 'Monthly', time: '06:00', status: 'Success', owner: 'Mohammed Ali',
    fields: ['Asset ID', 'Asset Name', 'Contract ID', 'Vendor', 'Contract Value', 'Warranty End'],
    filters: [{ field: 'Warranty End', operator: 'before', value: '2027-03-31' }], encrypted: false, lastRunAgoMin: 6 * 1440 + 420, nextRunInMin: 24 * 1440, rows: 386
  },
  {
    id: 'EXP-0009', name: 'Asset Transfers to Data Lake', datasetId: 'DS-09', format: 'CSV', delivery: 'API', target: 'Azure Data Lake',
    frequency: 'Daily', time: '04:00', status: 'Success', owner: 'Rahul Mehta', fields: null, filters: [], encrypted: true,
    lastRunAgoMin: 6 * 60 + 40, nextRunInMin: 17 * 60 + 20, rows: 15_093
  },
  {
    id: 'EXP-0010', name: 'Combined Asset History (ad hoc)', datasetId: 'DS-11', format: 'CSV', delivery: 'S3', target: 's3://piq-asset360-exports/adhoc/',
    frequency: 'On demand', time: 'Manual', status: 'Draft', owner: 'Sarah Ahmed', fields: null, filters: [], encrypted: true,
    lastRunAgoMin: null, nextRunInMin: null, rows: 0
  }
];

export const DESTINATION_LABEL: Record<string, string> = { S3: 'S3', 'Secure FTP': 'SFTP', Email: 'Email', API: 'API' };

/** Approximate size of a generated file. */
export function fileBytes(rows: number, fields: number, format: ExportJob['format']): number {
  const perCell = format === 'JSON' ? 26 : format === 'XLSX' ? 9 : 13;
  return Math.round(rows * fields * perCell + 1_024);
}

export function seedJobsAndRuns(datasets: Dataset[]): { jobs: ExportJob[]; runs: ExportRun[] } {
  const jobs: ExportJob[] = [];
  const runs: ExportRun[] = [];
  JOB_SEEDS.forEach((s, i) => {
    const d = datasets.find((x) => x.id === s.datasetId)!;
    const fields = s.fields ?? d.fields.map((x) => x.name);
    const runId = s.lastRunAgoMin === null ? null : `RUN-${String(4_210 + i).padStart(6, '0')}`;
    const failed = s.status === 'Failed';
    const size = runId && !failed ? fileBytes(s.rows, fields.length, s.format) : null;
    const lastRun = s.lastRunAgoMin === null ? null : stampIn(-s.lastRunAgoMin * 60_000);
    jobs.push({
      id: s.id, name: s.name, module: d.modules[d.modules.length - 1], datasetId: s.datasetId, format: s.format, delivery: s.delivery,
      target: s.target, destination: s.delivery === 'API' ? s.target : DESTINATION_LABEL[s.delivery], frequency: s.frequency, time: s.time,
      lastRun, nextRun: s.nextRunInMin === null ? null : stampIn(s.nextRunInMin * 60_000), status: s.status, owner: s.owner, fields,
      filters: s.filters, encrypted: s.encrypted, lastError: s.lastError, lastRunId: runId, lastRowCount: runId ? (failed ? 0 : s.rows) : null,
      lastSizeBytes: size
    });
    if (runId) {
      runs.push({
        id: runId, jobId: s.id, jobName: s.name, status: failed ? 'Failed' : 'Success', startedAt: lastRun, rowCount: failed ? 0 : s.rows,
        sizeBytes: size ?? 0, fileName: failed ? null : `${s.id}.${s.format.toLowerCase()}`, hasFile: !failed,
        deliveryStatus: failed ? 'Failed' : 'Not delivered', deliveryMessage: failed ? null : DELIVERY_NOTE, error: s.lastError ?? null
      });
    }
  });
  return { jobs, runs };
}

// ----- Connections -----

export function seedConnections(): ApiConnection[] {
  const con = (
    id: string, name: string, type: ApiConnection['type'], baseUrl: string, auth: string, authClientId: string | null,
    status: ApiConnection['status'], uptime: number | null, testedAgoMin: number | null, message: string | null, mask: string | null,
    cert: number | null, owner: string
  ): ApiConnection => ({
    id, name, type, baseUrl, auth, authClientId, status, uptime, lastTested: testedAgoMin === null ? null : stampIn(-testedAgoMin * 60_000),
    lastTestMessage: message, secretStored: !!mask, secretMask: mask, certExpiresInDays: cert, owner
  });
  return [
    con('CON-001', 'Power BI Service', 'REST', 'https://api.powerbi.com/v1.0/myorg', 'OAuth 2.0 (client credentials)', 'a3f1c2d4-asset360-bi',
      'Connected', 99.8, 25, 'HTTPS 200 in 182 ms; certificate valid', '••••••••Qx7m', 214, 'Omar Hassan'),
    con('CON-002', 'Snowflake Data Cloud', 'JDBC', 'https://purpleiq.me-central2.gcp.snowflakecomputing.com', 'Key pair', 'ASSET360_SVC',
      'Connected', 99.4, 6, 'HTTPS 200 in 241 ms; certificate valid', '••••••••k2Pa', 96, 'Daniel Kim'),
    con('CON-003', 'SAP S/4HANA Finance', 'OData', 'https://s4h.purpleiq.com/sap/opu/odata/sap/API_FIXEDASSET_SRV', 'Basic', 'A360_RFC',
      'Warning', 91.2, 9 * 60 + 10, 'Responded in 28.6 s (slow); certificate expires soon', '••••••••r8Lt', 18, 'James Tan'),
    con('CON-004', 'Azure Data Lake', 'REST', 'https://piqdatalake.dfs.core.windows.net/asset360', 'Service principal', 'f81e7c90-piq-dl',
      'Connected', 100, 6 * 60 + 41, 'HTTPS 201 in 96 ms; certificate valid', '••••••••Zw3e', 312, 'Rahul Mehta'),
    con('CON-005', 'Tableau Cloud', 'REST', 'https://prod-uaenorth-a.online.tableau.com/api/3.22', 'Personal access token', 'asset360-reporting',
      'Disconnected', 72.5, 2 * 1440 + 60, 'HTTPS 401 Unauthorized: the access token has expired', '••••••••c9Hd', 141, 'Priya Sharma'),
    con('CON-006', 'Oracle Fusion ERP', 'REST', 'https://erp.purpleiq.com/fscmRestApi/resources/11.13.18.05', 'OAuth 2.0 (client credentials)',
      'oracle-a360', 'Untested', null, null, null, '••••••••t5Nb', null, 'Mohammed Ali')
  ];
}

// ----- Access logs -----

export function seedLogs(): AccessLog[] {
  const entries: [number, string, string, string, string, string, LogResult][] = [
    [3, 'Snowflake ingest', 'Streamed records', 'IoT Telemetry Stream', 'Snowflake Data Cloud', '20.74.198.12', 'Success'],
    [22, 'Power BI gateway', 'Pulled export file', 'Maintenance Costs to Power BI', 'Power BI Service', '52.140.6.44', 'Success'],
    [25, 'Omar Hassan', 'Tested connection', 'Power BI Service', 'Asset360 Web', '10.20.14.31', 'Success'],
    [47, 'Sarah Ahmed', 'Previewed dataset', 'Assets', 'Asset360 Web', '10.20.14.18', 'Success'],
    [82, 'Power BI gateway', 'Pulled export file', 'Maintenance Costs to Power BI', 'Power BI Service', '52.140.6.44', 'Success'],
    [135, 'Unknown client', 'Requested dataset', 'Financial', 'curl/8.4.0', '185.220.101.7', 'Denied'],
    [142, 'Power BI gateway', 'Pulled export file', 'Maintenance Costs to Power BI', 'Power BI Service', '52.140.6.44', 'Success'],
    [210, 'Aisha Rahman', 'Downloaded sample', 'Inspection', 'Asset360 Web', '10.20.15.62', 'Success'],
    [300, 'Tableau extract', 'Requested dataset', 'Inspection', 'Tableau Cloud', '34.166.52.9', 'Denied'],
    [400, 'Scheduler', 'Ran export', 'Asset Transfers to Data Lake', 'Asset360 Scheduler', '10.20.0.5', 'Success'],
    [520, 'Scheduler', 'Ran export', 'Daily Asset Register Feed', 'Asset360 Scheduler', '10.20.0.5', 'Success'],
    [550, 'Scheduler', 'Ran export', 'Inventory Snapshot to SAP', 'Asset360 Scheduler', '10.20.0.5', 'Failed'],
    [551, 'Scheduler', 'Tested connection', 'SAP S/4HANA Finance', 'Asset360 Scheduler', '10.20.0.5', 'Failed'],
    [610, 'James Tan', 'Downloaded file', 'Daily Asset Register Feed', 'Asset360 Web', '10.20.16.7', 'Success'],
    [780, 'Priya Sharma', 'Edited export', 'Monthly Depreciation Extract', 'Asset360 Web', '10.20.14.77', 'Success'],
    [1_210, 'Tableau extract', 'Requested dataset', 'Inspection', 'Tableau Cloud', '34.166.52.9', 'Denied'],
    [1_500, 'Daniel Kim', 'Previewed dataset', 'Tracking & IoT', 'Asset360 Web', '10.20.15.12', 'Success'],
    [1_980, 'Scheduler', 'Ran export', 'Daily Asset Register Feed', 'Asset360 Scheduler', '10.20.0.5', 'Success'],
    [2_100, 'Rahul Mehta', 'Created export', 'Asset Transfers to Data Lake', 'Asset360 Web', '10.20.16.40', 'Success'],
    [2_940, 'Priya Sharma', 'Tested connection', 'Tableau Cloud', 'Asset360 Web', '10.20.14.77', 'Failed'],
    [3_060, 'Scheduler', 'Ran export', 'Weekly Inspection Results', 'Asset360 Scheduler', '10.20.0.5', 'Success'],
    [3_300, 'Fatima Noor', 'Downloaded file', 'Weekly Inspection Results', 'Asset360 Web', '10.20.17.3', 'Success'],
    [4_450, 'Mohammed Ali', 'Added connection', 'Oracle Fusion ERP', 'Asset360 Web', '10.20.15.90', 'Success'],
    [5_800, 'Sarah Ahmed', 'Exported access logs', 'Access Logs', 'Asset360 Web', '10.20.14.18', 'Success'],
    [8_900, 'Scheduler', 'Ran export', 'Contracts Renewal Watchlist', 'Asset360 Scheduler', '10.20.0.5', 'Success'],
    [10_200, 'Unknown client', 'Requested dataset', 'Assets', 'python-requests/2.32', '45.95.147.20', 'Denied'],
    [17_380, 'Fatima Noor', 'Paused export', 'Audit Findings for Compliance Board', 'Asset360 Web', '10.20.17.3', 'Success'],
    [24_780, 'Scheduler', 'Ran export', 'Monthly Depreciation Extract', 'Asset360 Scheduler', '10.20.0.5', 'Success']
  ];
  return entries.map(([ago, actor, action, resource, client, ip, result], i) => ({
    id: `LOG-${String(9_480 - i).padStart(6, '0')}`, at: stampIn(-ago * 60_000), actor, action, resource, client, ip, result
  }));
}

/** Older entries that exist in the full log but are not listed on the page. */
export const OLDER_LOG_ENTRIES = 1_412;

// ----- Statistics -----

/** Daily runs, generated volume and API access counts for the last `days` days (oldest first). */
export function seedStats(days: number): RunStats {
  const rnd = seeded(7_919);
  // The 30-day series is generated once; the 7-day view is its tail so both agree
  const all = Array.from({ length: 30 }, (_, i) => {
    const weekend = new Date(Date.now() - (29 - i) * DAY).getDay() % 6 === 0;
    const success = 46 + Math.round(rnd() * 14) - (weekend ? 10 : 0);
    const failed = rnd() < 0.55 ? Math.round(rnd() * 2) : rnd() < 0.85 ? 0 : 3;
    return {
      label: new Date(Date.now() - (29 - i) * DAY).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      success,
      failed: i === 29 ? 1 : failed,
      bytes: Math.round((380 + rnd() * 160) * 1024 * 1024),
      ok: 1_150 + Math.round(rnd() * 420),
      bad: 4 + Math.round(rnd() * 14)
    };
  });
  const slice = all.slice(30 - days);
  const ok = slice.reduce((a, d) => a + d.success, 0);
  const bad = slice.reduce((a, d) => a + d.failed, 0);
  return {
    labels: slice.map((d) => d.label),
    success: slice.map((d) => d.success),
    failed: slice.map((d) => d.failed),
    generatedBytes: slice.map((d) => d.bytes),
    accessOk: slice.map((d) => d.ok),
    accessFailed: slice.map((d) => d.bad),
    successRate: ok + bad ? Number(((ok / (ok + bad)) * 100).toFixed(1)) : null
  };
}

export function seedSummary(stats30: RunStats, jobs: ExportJob[], connections: number): ExportSummary {
  const active = jobs.filter((j) => j.status !== 'Paused' && j.status !== 'Draft').length;
  const scheduled = jobs.filter((j) => j.frequency !== 'On demand' && j.status !== 'Paused' && j.status !== 'Draft').length;
  const bytes = stats30.generatedBytes.reduce((a, b) => a + b, 0);
  return {
    activeExports: active,
    activeExportsWeekAgo: active - 1,
    connections,
    connectionsWeekAgo: connections - 1,
    scheduledJobs: scheduled,
    scheduledJobsWeekAgo: scheduled - 1,
    successRate30: stats30.successRate,
    successRatePrevious30: 97.6,
    generatedBytes30: bytes,
    generatedBytesPrevious30: Math.round(bytes * 0.88),
    deliveryNote: DELIVERY_NOTE
  };
}
