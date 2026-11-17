import { RA_CATEGORIES } from '../shared/analytics-common';
import { CustomReport, DataSource, FieldGroup, ReportDefinition, ReportVisibility } from './custom-reports.model';

// Field catalogue and data sources (UI config). Saved reports and report rows come from the reporting API.

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
      { key: 'assetId', label: 'Asset ID', kind: 'text', group: 'asset' },
      { key: 'assetName', label: 'Asset Name', kind: 'text', group: 'asset' },
      { key: 'category', label: 'Asset Category', kind: 'text', group: 'asset', values: RA_CATEGORIES },
      { key: 'location', label: 'Location', kind: 'text', group: 'asset' },
      { key: 'condition', label: 'Condition', kind: 'text', group: 'asset', values: ['Excellent', 'Good', 'Fair', 'Poor'] },
      { key: 'purchaseDate', label: 'Purchase Date', kind: 'date', group: 'asset' },
      { key: 'assetStatus', label: 'Asset Status', kind: 'text', group: 'asset', values: ['Active', 'Under Maintenance', 'Idle', 'Retired'] },
      { key: 'manufacturer', label: 'Manufacturer', kind: 'text', group: 'asset' }
    ]
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    fields: [
      { key: 'maintenanceCost', label: 'Maintenance Cost', kind: 'money', group: 'maintenance' },
      { key: 'lastServiceDate', label: 'Last Service Date', kind: 'date', group: 'maintenance' },
      { key: 'openWorkOrders', label: 'Open Work Orders', kind: 'number', group: 'maintenance' },
      { key: 'totalWorkOrders', label: 'Total Work Orders', kind: 'number', group: 'maintenance' },
      { key: 'mtbf', label: 'Mean Time Between Failure (MTBF)', kind: 'number', group: 'maintenance' },
      { key: 'mttr', label: 'Mean Time To Repair (MTTR)', kind: 'number', group: 'maintenance' },
      { key: 'pmCompliance', label: 'PM Compliance', kind: 'percent', group: 'maintenance' },
      { key: 'technician', label: 'Assigned Technician', kind: 'text', group: 'maintenance' },
      { key: 'slaBreaches', label: 'SLA Breaches', kind: 'number', group: 'maintenance' }
    ]
  },
  {
    key: 'inspection',
    label: 'Inspection',
    fields: [
      { key: 'lastInspectionDate', label: 'Last Inspection Date', kind: 'date', group: 'inspection' },
      { key: 'inspectionResult', label: 'Inspection Result', kind: 'text', group: 'inspection', values: ['Pass', 'Pass with findings', 'Fail'] },
      { key: 'inspectionScore', label: 'Inspection Score', kind: 'percent', group: 'inspection' },
      { key: 'openFindings', label: 'Open Findings', kind: 'number', group: 'inspection' },
      { key: 'criticalFindings', label: 'Critical Findings', kind: 'number', group: 'inspection' },
      { key: 'inspector', label: 'Inspector', kind: 'text', group: 'inspection' }
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory',
    fields: [
      { key: 'itemCode', label: 'Item Code', kind: 'text', group: 'inventory' },
      { key: 'itemName', label: 'Item Name', kind: 'text', group: 'inventory' },
      { key: 'warehouse', label: 'Warehouse', kind: 'text', group: 'inventory' },
      { key: 'quantityOnHand', label: 'Quantity On Hand', kind: 'number', group: 'inventory' },
      { key: 'reorderLevel', label: 'Reorder Level', kind: 'number', group: 'inventory' },
      { key: 'unitCost', label: 'Unit Cost', kind: 'money', group: 'inventory' },
      { key: 'monthlyUsage', label: 'Monthly Usage', kind: 'number', group: 'inventory' },
      { key: 'stockStatus', label: 'Stock Status', kind: 'text', group: 'inventory', values: ['In stock', 'Below reorder', 'Out of stock', 'Overstock'] }
    ]
  },
  {
    key: 'financial',
    label: 'Financial',
    fields: [
      { key: 'purchaseCost', label: 'Purchase Cost', kind: 'money', group: 'financial' },
      { key: 'bookValue', label: 'Net Book Value', kind: 'money', group: 'financial' },
      { key: 'depreciation', label: 'Depreciation (YTD)', kind: 'money', group: 'financial' },
      { key: 'operatingCost', label: 'Operating Cost', kind: 'money', group: 'financial' },
      { key: 'costCenter', label: 'Cost Center', kind: 'text', group: 'financial' }
    ]
  },
  {
    key: 'contract',
    label: 'Contracts & Warranty',
    fields: [
      { key: 'contractNo', label: 'Contract No.', kind: 'text', group: 'contract' },
      { key: 'vendor', label: 'Vendor', kind: 'text', group: 'contract' },
      { key: 'contractValue', label: 'Contract Value', kind: 'money', group: 'contract' },
      { key: 'warrantyExpiry', label: 'Warranty Expiry', kind: 'date', group: 'contract' },
      { key: 'contractStatus', label: 'Contract Status', kind: 'text', group: 'contract', values: ['Active', 'Expiring', 'Expired', 'Renewal in progress'] }
    ]
  },
  {
    key: 'operations',
    label: 'WIP / Operations',
    fields: [
      { key: 'workOrderNo', label: 'Production Order', kind: 'text', group: 'operations' },
      { key: 'productionLine', label: 'Production Line', kind: 'text', group: 'operations' },
      { key: 'outputUnits', label: 'Output Units', kind: 'number', group: 'operations' },
      { key: 'wipValue', label: 'WIP Value', kind: 'money', group: 'operations' },
      { key: 'onTimePct', label: 'On-time Completion', kind: 'percent', group: 'operations' },
      { key: 'downtimeHours', label: 'Downtime Hours', kind: 'number', group: 'operations' }
    ]
  },
  {
    key: 'compliance',
    label: 'Audit & Compliance',
    fields: [
      { key: 'auditName', label: 'Audit', kind: 'text', group: 'compliance' },
      { key: 'standard', label: 'Standard', kind: 'text', group: 'compliance' },
      { key: 'complianceScore', label: 'Compliance Score', kind: 'percent', group: 'compliance' },
      { key: 'auditFindings', label: 'Audit Findings', kind: 'number', group: 'compliance' },
      { key: 'certificateExpiry', label: 'Certificate Expiry', kind: 'date', group: 'compliance' }
    ]
  },
  {
    key: 'iot',
    label: 'Tracking & IoT',
    fields: [
      { key: 'tagId', label: 'Tag ID', kind: 'text', group: 'iot' },
      { key: 'sensorType', label: 'Sensor Type', kind: 'text', group: 'iot', values: ['GPS', 'Temperature', 'Vibration', 'Hour Meter', 'BLE Tag'] },
      { key: 'utilizationPct', label: 'Utilization', kind: 'percent', group: 'iot' },
      { key: 'runHours', label: 'Run Hours', kind: 'number', group: 'iot' },
      { key: 'iotAlerts', label: 'Alerts', kind: 'number', group: 'iot' }
    ]
  },
  {
    key: 'movement',
    label: 'Movement & Custody',
    fields: [
      { key: 'movementNo', label: 'Movement No.', kind: 'text', group: 'movement' },
      { key: 'movementType', label: 'Movement Type', kind: 'text', group: 'movement', values: ['Transfer', 'Check-out', 'Check-in', 'Disposal'] },
      { key: 'toLocation', label: 'Destination', kind: 'text', group: 'movement' },
      { key: 'custodian', label: 'Custodian', kind: 'text', group: 'movement' },
      { key: 'movementDate', label: 'Movement Date', kind: 'date', group: 'movement' },
      { key: 'transitDays', label: 'Transit Days', kind: 'number', group: 'movement' }
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

/** Saved custom reports (populated from the reporting API). */
export const CUSTOM_REPORT_SEED: CustomReport[] = [];
