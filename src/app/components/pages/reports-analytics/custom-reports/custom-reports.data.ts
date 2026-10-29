import { RA_CATEGORIES, RA_LOCATIONS, RA_PEOPLE } from '../shared/analytics-common';
import { CustomReport, DataSource, FieldGroup, ReportDefinition, ReportStatus, ReportVisibility, VizType } from './custom-reports.model';

// DEMO MODE: field catalogue, data sources and the custom report library are seeded here (deterministic)

const SITES = RA_LOCATIONS.slice(1);

export const RA_MODULES = [
  'Assets', 'Tracking & IoT', 'Movement & Custody', 'Maintenance', 'Inspection', 'Inventory',
  'WIP / Operations', 'Audit & Compliance', 'Contracts & Warranty', 'Financial'
];

export const VISIBILITIES: ReportVisibility[] = ['Only me', 'My team', 'Organization'];

export const SCHEDULES = [
  'Not scheduled',
  'Daily – 07:00',
  'Weekly – Monday, 08:00',
  'Monthly – 1st day, 08:00',
  'Quarterly – 1st day, 08:00'
];

export const FIELD_GROUPS: FieldGroup[] = [
  {
    key: 'asset',
    label: 'Asset Information',
    fields: [
      { key: 'assetId', label: 'Asset ID', kind: 'text', group: 'asset', pattern: 'AST-2026-DXB-{n}', start: 240, pad: 6 },
      {
        key: 'assetName', label: 'Asset Name', kind: 'text', group: 'asset',
        values: ['Forklift FL-12', 'Generator G-04', 'Chiller CH-02', 'Delivery Van DV-07', 'CNC Lathe CL-03', 'Laptop LT-118',
          'Air Compressor AC-05', 'UPS Unit UP-09', 'Pickup Truck PT-02', 'Conveyor CV-01', 'Rooftop AHU-03', 'Fire Pump FP-01']
      },
      { key: 'category', label: 'Asset Category', kind: 'text', group: 'asset', values: RA_CATEGORIES },
      { key: 'location', label: 'Location', kind: 'text', group: 'asset', values: SITES },
      { key: 'condition', label: 'Condition', kind: 'text', group: 'asset', values: ['Excellent', 'Good', 'Fair', 'Poor'] },
      { key: 'purchaseDate', label: 'Purchase Date', kind: 'date', group: 'asset', from: '2019-01-01', span: 2700 },
      { key: 'assetStatus', label: 'Asset Status', kind: 'text', group: 'asset', values: ['Active', 'Under Maintenance', 'Idle', 'Retired'] },
      { key: 'manufacturer', label: 'Manufacturer', kind: 'text', group: 'asset', values: ['Toyota', 'Caterpillar', 'Carrier', 'Siemens', 'Dell', 'Atlas Copco', 'Schneider Electric'] }
    ]
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    fields: [
      { key: 'maintenanceCost', label: 'Maintenance Cost', kind: 'money', group: 'maintenance', min: 2500, max: 48000, step: 100 },
      { key: 'lastServiceDate', label: 'Last Service Date', kind: 'date', group: 'maintenance', from: '2026-06-01', span: 150 },
      { key: 'openWorkOrders', label: 'Open Work Orders', kind: 'number', group: 'maintenance', min: 0, max: 9 },
      { key: 'totalWorkOrders', label: 'Total Work Orders', kind: 'number', group: 'maintenance', min: 4, max: 36 },
      { key: 'mtbf', label: 'Mean Time Between Failure (MTBF)', kind: 'number', group: 'maintenance', min: 640, max: 1900, step: 10 },
      { key: 'mttr', label: 'Mean Time To Repair (MTTR)', kind: 'number', group: 'maintenance', min: 2, max: 14 },
      { key: 'pmCompliance', label: 'PM Compliance', kind: 'percent', group: 'maintenance', min: 72, max: 100 },
      { key: 'technician', label: 'Assigned Technician', kind: 'text', group: 'maintenance', values: RA_PEOPLE.slice(1, 9) },
      { key: 'slaBreaches', label: 'SLA Breaches', kind: 'number', group: 'maintenance', min: 0, max: 6 }
    ]
  },
  {
    key: 'inspection',
    label: 'Inspection',
    fields: [
      { key: 'lastInspectionDate', label: 'Last Inspection Date', kind: 'date', group: 'inspection', from: '2026-07-01', span: 120 },
      { key: 'inspectionResult', label: 'Inspection Result', kind: 'text', group: 'inspection', values: ['Pass', 'Pass with findings', 'Fail'] },
      { key: 'inspectionScore', label: 'Inspection Score', kind: 'percent', group: 'inspection', min: 61, max: 100 },
      { key: 'openFindings', label: 'Open Findings', kind: 'number', group: 'inspection', min: 0, max: 8 },
      { key: 'criticalFindings', label: 'Critical Findings', kind: 'number', group: 'inspection', min: 0, max: 3 },
      { key: 'inspector', label: 'Inspector', kind: 'text', group: 'inspection', values: RA_PEOPLE.slice(9, 15) }
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory',
    fields: [
      { key: 'itemCode', label: 'Item Code', kind: 'text', group: 'inventory', pattern: 'INV-{n}', start: 10420, pad: 5 },
      {
        key: 'itemName', label: 'Item Name', kind: 'text', group: 'inventory',
        values: ['Hydraulic Filter', 'V-Belt B52', 'Bearing 6205', 'Air Filter', 'Brake Pad Set', 'Coolant 20L', 'LED Panel 60W', 'Fuse 32A']
      },
      { key: 'warehouse', label: 'Warehouse', kind: 'text', group: 'inventory', values: ['Jebel Ali Warehouse', 'Dubai HQ Store', 'Al Ain Depot', 'Sharjah Facility Store'] },
      { key: 'quantityOnHand', label: 'Quantity On Hand', kind: 'number', group: 'inventory', min: 0, max: 420 },
      { key: 'reorderLevel', label: 'Reorder Level', kind: 'number', group: 'inventory', min: 20, max: 120, step: 5 },
      { key: 'unitCost', label: 'Unit Cost', kind: 'money', group: 'inventory', min: 12, max: 1850 },
      { key: 'monthlyUsage', label: 'Monthly Usage', kind: 'number', group: 'inventory', min: 5, max: 160 },
      { key: 'stockStatus', label: 'Stock Status', kind: 'text', group: 'inventory', values: ['In stock', 'Below reorder', 'Out of stock', 'Overstock'] }
    ]
  },
  {
    key: 'financial',
    label: 'Financial',
    fields: [
      { key: 'purchaseCost', label: 'Purchase Cost', kind: 'money', group: 'financial', min: 18000, max: 640000, step: 500 },
      { key: 'bookValue', label: 'Net Book Value', kind: 'money', group: 'financial', min: 6000, max: 420000, step: 500 },
      { key: 'depreciation', label: 'Depreciation (YTD)', kind: 'money', group: 'financial', min: 1500, max: 64000, step: 100 },
      { key: 'operatingCost', label: 'Operating Cost', kind: 'money', group: 'financial', min: 3000, max: 92000, step: 100 },
      { key: 'costCenter', label: 'Cost Center', kind: 'text', group: 'financial', values: ['CC-100 Operations', 'CC-200 Facilities', 'CC-300 Fleet', 'CC-400 IT'] }
    ]
  },
  {
    key: 'contract',
    label: 'Contracts & Warranty',
    fields: [
      { key: 'contractNo', label: 'Contract No.', kind: 'text', group: 'contract', pattern: 'CTR-2026-{n}', start: 310, pad: 4 },
      {
        key: 'vendor', label: 'Vendor', kind: 'text', group: 'contract',
        values: ['Al Futtaim Engineering', 'Emirates Technical Services', 'Gulf Facilities Mgmt', 'Siemens Middle East', 'Carrier UAE']
      },
      { key: 'contractValue', label: 'Contract Value', kind: 'money', group: 'contract', min: 24000, max: 380000, step: 1000 },
      { key: 'warrantyExpiry', label: 'Warranty Expiry', kind: 'date', group: 'contract', from: '2026-11-01', span: 540 },
      { key: 'contractStatus', label: 'Contract Status', kind: 'text', group: 'contract', values: ['Active', 'Expiring', 'Expired', 'Renewal in progress'] }
    ]
  },
  {
    key: 'operations',
    label: 'WIP / Operations',
    fields: [
      { key: 'workOrderNo', label: 'Production Order', kind: 'text', group: 'operations', pattern: 'PO-2026-{n}', start: 1180, pad: 5 },
      { key: 'productionLine', label: 'Production Line', kind: 'text', group: 'operations', values: ['Line A – Assembly', 'Line B – Machining', 'Line C – Packaging', 'Line D – Finishing'] },
      { key: 'outputUnits', label: 'Output Units', kind: 'number', group: 'operations', min: 120, max: 2400, step: 10 },
      { key: 'wipValue', label: 'WIP Value', kind: 'money', group: 'operations', min: 8000, max: 180000, step: 500 },
      { key: 'onTimePct', label: 'On-time Completion', kind: 'percent', group: 'operations', min: 78, max: 100 },
      { key: 'downtimeHours', label: 'Downtime Hours', kind: 'number', group: 'operations', min: 0, max: 36 }
    ]
  },
  {
    key: 'compliance',
    label: 'Audit & Compliance',
    fields: [
      { key: 'auditName', label: 'Audit', kind: 'text', group: 'compliance', values: ['ISO 9001 Surveillance', 'ISO 45001 Internal', 'Fire Safety Audit', 'Fleet Compliance Review'] },
      { key: 'standard', label: 'Standard', kind: 'text', group: 'compliance', values: ['ISO 9001', 'ISO 14001', 'ISO 45001', 'Civil Defence', 'RTA Fleet'] },
      { key: 'complianceScore', label: 'Compliance Score', kind: 'percent', group: 'compliance', min: 74, max: 100 },
      { key: 'auditFindings', label: 'Audit Findings', kind: 'number', group: 'compliance', min: 0, max: 7 },
      { key: 'certificateExpiry', label: 'Certificate Expiry', kind: 'date', group: 'compliance', from: '2026-11-01', span: 365 }
    ]
  },
  {
    key: 'iot',
    label: 'Tracking & IoT',
    fields: [
      { key: 'tagId', label: 'Tag ID', kind: 'text', group: 'iot', pattern: 'TAG-{n}', start: 5010, pad: 5 },
      { key: 'sensorType', label: 'Sensor Type', kind: 'text', group: 'iot', values: ['GPS', 'Temperature', 'Vibration', 'Hour Meter', 'BLE Tag'] },
      { key: 'utilizationPct', label: 'Utilization', kind: 'percent', group: 'iot', min: 38, max: 97 },
      { key: 'runHours', label: 'Run Hours', kind: 'number', group: 'iot', min: 40, max: 640, step: 5 },
      { key: 'iotAlerts', label: 'Alerts', kind: 'number', group: 'iot', min: 0, max: 12 }
    ]
  },
  {
    key: 'movement',
    label: 'Movement & Custody',
    fields: [
      { key: 'movementNo', label: 'Movement No.', kind: 'text', group: 'movement', pattern: 'MOV-2026-{n}', start: 820, pad: 5 },
      { key: 'movementType', label: 'Movement Type', kind: 'text', group: 'movement', values: ['Transfer', 'Check-out', 'Check-in', 'Disposal'] },
      { key: 'toLocation', label: 'Destination', kind: 'text', group: 'movement', values: SITES },
      { key: 'custodian', label: 'Custodian', kind: 'text', group: 'movement', values: RA_PEOPLE.slice(3, 11) },
      { key: 'movementDate', label: 'Movement Date', kind: 'date', group: 'movement', from: '2026-08-01', span: 90 },
      { key: 'transitDays', label: 'Transit Days', kind: 'number', group: 'movement', min: 0, max: 9 }
    ]
  }
];

export const DATA_SOURCES: DataSource[] = [
  { key: 'assets', label: 'Assets', module: 'Assets', groups: ['asset'], description: 'Asset register: category, location, condition and status.' },
  { key: 'assets-maint', label: 'Assets + Maintenance', module: 'Maintenance', groups: ['asset', 'maintenance'], description: 'Assets joined with work orders, cost and reliability.' },
  { key: 'assets-maint-insp', label: 'Assets + Maintenance + Inspection', module: 'Assets', groups: ['asset', 'maintenance', 'inspection'], description: 'Full asset health: maintenance history and inspection results.' },
  { key: 'assets-insp', label: 'Assets + Inspection', module: 'Inspection', groups: ['asset', 'inspection'], description: 'Inspection results and findings per asset.' },
  { key: 'assets-fin', label: 'Assets + Financial', module: 'Financial', groups: ['asset', 'financial'], description: 'Purchase cost, book value and depreciation per asset.' },
  { key: 'assets-iot', label: 'Assets + Tracking & IoT', module: 'Tracking & IoT', groups: ['asset', 'iot'], description: 'Telemetry, run hours and utilization from tags and sensors.' },
  { key: 'assets-movement', label: 'Assets + Movement & Custody', module: 'Movement & Custody', groups: ['asset', 'movement'], description: 'Transfers, check-outs and custodians.' },
  { key: 'inventory', label: 'Inventory', module: 'Inventory', groups: ['inventory'], description: 'Stock on hand, reorder levels and usage.' },
  { key: 'inventory-fin', label: 'Inventory + Financial', module: 'Inventory', groups: ['inventory', 'financial'], description: 'Stock valuation with cost centers.' },
  { key: 'operations', label: 'WIP / Operations', module: 'WIP / Operations', groups: ['operations'], description: 'Production orders, output, WIP value and downtime.' },
  { key: 'compliance', label: 'Audit & Compliance', module: 'Audit & Compliance', groups: ['compliance', 'asset'], description: 'Audits, standards, findings and certificate expiry.' },
  { key: 'contracts', label: 'Contracts & Warranty', module: 'Contracts & Warranty', groups: ['contract', 'asset'], description: 'Vendor contracts, values and warranty expiry.' },
  { key: 'financial-contracts', label: 'Financial + Contracts & Warranty', module: 'Financial', groups: ['financial', 'contract'], description: 'Spend by vendor and cost center.' }
];

/** Nearest data source for a module (used when a standard report is duplicated). */
export const MODULE_SOURCES: Record<string, string> = {
  'Assets': 'assets',
  'Tracking & IoT': 'assets-iot',
  'Movement & Custody': 'assets-movement',
  'Maintenance': 'assets-maint',
  'Inspection': 'assets-insp',
  'Inventory': 'inventory',
  'WIP / Operations': 'operations',
  'Audit & Compliance': 'compliance',
  'Contracts & Warranty': 'contracts',
  'Financial': 'assets-fin'
};

export function blankDefinition(sourceKey = 'assets'): ReportDefinition {
  return {
    sourceKey,
    fields: [],
    calcFields: [],
    filters: [],
    groupBy: '',
    aggregate: 'Sum',
    sortBy: '',
    sortDir: 'desc',
    rowLimit: 25,
    viz: 'Table',
    chartValue: ''
  };
}

function seed(
  n: number, name: string, owner: string, sourceKey: string, status: ReportStatus, updatedAt: string, description: string,
  fields: string[], extra: Partial<CustomReport> = {}
): CustomReport {
  const source = DATA_SOURCES.find((s) => s.key === sourceKey) ?? DATA_SOURCES[0];
  return {
    ...blankDefinition(sourceKey),
    id: `CR-${String(n).padStart(4, '0')}`,
    name,
    description,
    owner,
    module: source.module,
    status,
    favourite: false,
    updatedAt,
    visibility: 'My team',
    schedule: status === 'Scheduled' ? 'Monthly – 1st day, 08:00' : 'Not scheduled',
    fields,
    ...extra
  };
}

const bar = (groupBy: string, chartValue: string, viz: VizType = 'Bar'): Partial<CustomReport> => ({ groupBy, chartValue, viz, sortBy: chartValue });

export const CUSTOM_REPORT_SEED: CustomReport[] = [
  seed(1, 'Monthly Asset Performance', 'Sarah Ahmed', 'assets-maint-insp', 'Draft', '2026-10-28T10:32',
    'Analyse asset performance including maintenance costs, condition and open work orders.',
    ['assetId', 'assetName', 'category', 'location', 'condition', 'maintenanceCost', 'lastInspectionDate', 'openWorkOrders'],
    { favourite: true, ...bar('category', 'maintenanceCost') }),
  seed(2, 'Maintenance SLA Breaches', 'Sarah Khan', 'assets-maint', 'Published', '2026-10-27T14:20',
    'Work orders that breached their SLA, by site and technician.',
    ['assetId', 'assetName', 'location', 'technician', 'slaBreaches', 'mttr'],
    { filters: [{ field: 'slaBreaches', op: '>', value: '0' }], ...bar('location', 'slaBreaches') }),
  seed(3, 'Vendor Cost Comparison', 'Michael Chen', 'financial-contracts', 'Scheduled', '2026-10-26T09:15',
    'Contract value and operating cost per vendor.',
    ['vendor', 'contractNo', 'contractValue', 'operatingCost', 'costCenter'],
    { ...bar('vendor', 'contractValue'), visibility: 'Organization' }),
  seed(4, 'Inspection Findings by Location', 'Priya Sharma', 'assets-insp', 'Published', '2026-10-25T16:45',
    'Open and critical findings per site.',
    ['assetId', 'location', 'inspectionResult', 'openFindings', 'criticalFindings', 'inspector'],
    bar('location', 'openFindings')),
  seed(5, 'Inventory Reorder Analysis', 'Ahmed Khan', 'inventory', 'Draft', '2026-10-24T11:20',
    'Items at or below their reorder level with monthly usage.',
    ['itemCode', 'itemName', 'warehouse', 'quantityOnHand', 'reorderLevel', 'monthlyUsage', 'stockStatus'],
    { viz: 'Table', sortBy: 'quantityOnHand', sortDir: 'asc' }),
  seed(6, 'Asset Lifecycle Summary', 'Daniel Kim', 'assets-fin', 'Scheduled', '2026-10-23T13:40',
    'Purchase cost, book value and depreciation by asset category.',
    ['assetId', 'assetName', 'category', 'purchaseDate', 'purchaseCost', 'bookValue', 'depreciation'],
    { ...bar('category', 'bookValue', 'Donut'), schedule: 'Quarterly – 1st day, 08:00' }),
  seed(7, 'PM Compliance by Site', 'Omar Hassan', 'assets-maint', 'Published', '2026-10-22T08:05',
    'Preventive maintenance compliance per location.',
    ['location', 'assetName', 'pmCompliance', 'openWorkOrders'],
    { ...bar('location', 'pmCompliance'), aggregate: 'Average' }),
  seed(8, 'Spare Parts Consumption', 'Fatima Noor', 'inventory-fin', 'Published', '2026-10-21T15:30',
    'Monthly usage and unit cost of spare parts by warehouse.',
    ['itemName', 'warehouse', 'monthlyUsage', 'unitCost', 'costCenter'],
    bar('warehouse', 'monthlyUsage')),
  seed(9, 'Depreciation by Category', 'Michael Chen', 'assets-fin', 'Published', '2026-10-20T10:10',
    'Year-to-date depreciation split by asset category.',
    ['category', 'assetName', 'depreciation', 'bookValue'],
    bar('category', 'depreciation', 'Donut')),
  seed(10, 'Critical Findings Tracker', 'Priya Sharma', 'assets-insp', 'Scheduled', '2026-10-19T09:00',
    'Assets with critical inspection findings, refreshed weekly.',
    ['assetId', 'assetName', 'location', 'criticalFindings', 'lastInspectionDate', 'inspector'],
    { filters: [{ field: 'criticalFindings', op: '≥', value: '1' }], schedule: 'Weekly – Monday, 08:00', sortBy: 'criticalFindings' }),
  seed(11, 'Production Line Throughput', 'James Tan', 'operations', 'Published', '2026-10-18T17:25',
    'Output units and on-time completion per production line.',
    ['productionLine', 'workOrderNo', 'outputUnits', 'onTimePct', 'downtimeHours'],
    bar('productionLine', 'outputUnits')),
  seed(12, 'Audit Findings by Standard', 'Aisha Rahman', 'compliance', 'Draft', '2026-10-17T12:15',
    'Audit findings grouped by compliance standard.',
    ['auditName', 'standard', 'auditFindings', 'complianceScore'],
    bar('standard', 'auditFindings')),
  seed(13, 'Asset Utilization from IoT', 'Rahul Mehta', 'assets-iot', 'Scheduled', '2026-10-16T07:45',
    'Run hours and utilization from tags and hour meters.',
    ['assetId', 'category', 'sensorType', 'runHours', 'utilizationPct'],
    { ...bar('category', 'runHours', 'Line'), schedule: 'Daily – 07:00' }),
  seed(14, 'High-Cost Assets Watchlist', 'Sarah Ahmed', 'assets-fin', 'Draft', '2026-10-15T14:50',
    'Assets with operating cost above AED 50K.',
    ['assetId', 'assetName', 'category', 'operatingCost', 'bookValue'],
    { filters: [{ field: 'operatingCost', op: '>', value: '50000' }], sortBy: 'operatingCost', visibility: 'Only me' }),
  seed(15, 'Warehouse Stock Value', 'Lisa Wong', 'inventory-fin', 'Published', '2026-10-14T11:35',
    'Quantity on hand and unit cost per warehouse.',
    ['warehouse', 'itemName', 'quantityOnHand', 'unitCost'],
    { ...bar('warehouse', 'quantityOnHand'), visibility: 'Organization' }),
  seed(16, 'Technician Workload', 'Omar Hassan', 'assets-maint', 'Draft', '2026-10-12T16:00',
    'Open and total work orders per technician.',
    ['technician', 'openWorkOrders', 'totalWorkOrders', 'mttr'],
    bar('technician', 'openWorkOrders')),
  seed(17, 'Certificate Expiry Outlook', 'Aisha Rahman', 'compliance', 'Scheduled', '2026-10-10T09:30',
    'Certificates expiring in the next 12 months.',
    ['auditName', 'standard', 'certificateExpiry', 'location'],
    { sortBy: 'certificateExpiry', sortDir: 'asc' }),
  seed(18, 'Asset Condition by Location', 'Daniel Kim', 'assets', 'Draft', '2026-10-08T13:05',
    'Count of assets per site, coloured by condition.',
    ['assetId', 'location', 'condition', 'assetStatus'],
    { groupBy: 'location', viz: 'Bar', chartValue: '__count', sortBy: '__count' })
];
