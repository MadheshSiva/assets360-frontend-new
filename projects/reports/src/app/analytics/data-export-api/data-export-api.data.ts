import { Dataset, DatasetField, FieldType, Frequency } from './data-export-api.model';

// Data Export / API configuration: field groups and dataset definitions. Export jobs, connections, access logs
// and run statistics come from the API (nothing is seeded here).

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

/** Dataset definitions (which field groups make up each feed). Row counts, size, refresh time and owner come from the API. */
const ds = (id: string, name: string, modules: string[], groups: string[]): Dataset => ({ id, name, modules, groups, rows: 0, sizeGb: 0, refreshed: null, owner: '' });

export const DATASETS: Dataset[] = [
  ds('DS-01', 'Assets', ['Assets'], ['Assets']),
  ds('DS-02', 'Maintenance', ['Maintenance'], ['Assets', 'Maintenance']),
  ds('DS-03', 'Inspection', ['Inspection'], ['Assets', 'Inspection']),
  ds('DS-04', 'Inventory', ['Inventory'], ['Inventory']),
  ds('DS-05', 'Financial', ['Financial'], ['Assets', 'Financial']),
  ds('DS-06', 'Tracking & IoT', ['Tracking & IoT'], ['Assets', 'Tracking & IoT']),
  ds('DS-07', 'Audit & Compliance', ['Audit & Compliance'], ['Audit & Compliance']),
  ds('DS-08', 'WIP / Operations', ['WIP / Operations'], ['WIP / Operations']),
  ds('DS-09', 'Movement & Custody', ['Movement & Custody'], ['Assets', 'Movement & Custody']),
  ds('DS-10', 'Contracts & Warranty', ['Contracts & Warranty'], ['Assets', 'Contracts & Warranty']),
  ds('DS-11', 'Asset + Maintenance + Inspection', ['Assets', 'Maintenance', 'Inspection'], ['Assets', 'Maintenance', 'Inspection'])
];

export function datasetFields(ds: Dataset): DatasetField[] {
  const out: DatasetField[] = [];
  for (const g of ds.groups) {
    // A field name appears once per dataset (e.g. Custodian lives in Assets and Movement & Custody)
    for (const fl of FIELD_GROUPS[g] ?? []) if (!out.some((x) => x.name === fl.name)) out.push(fl);
  }
  return out;
}

export const NEXT_BY_FREQUENCY: Record<Frequency, number> = {
  'Real-time': 0,
  Hourly: 3600_000,
  Daily: 86_400_000,
  Weekly: 7 * 86_400_000,
  Monthly: 30 * 86_400_000,
  'On demand': -1
};

/** Date → "YYYY-MM-DDTHH:mm" in local time */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → "DD Mon YYYY, HH:mm" */
export function formatStamp(stamp: string | null): string {
  if (!stamp) return '—';
  const [date, time] = stamp.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '';
  return `${String(d).padStart(2, '0')} ${month} ${y}${time ? ', ' + time : ''}`;
}

export interface RunStats {
  labels: string[];
  success: number[];
  failed: number[];
  apiOk: number[];
  apiFailed: number[];
}

/** Daily export runs and API volume for the health charts. Empty until the API supplies run history. */
export function emptyRunStats(): RunStats {
  return { labels: [], success: [], failed: [], apiOk: [], apiFailed: [] };
}
