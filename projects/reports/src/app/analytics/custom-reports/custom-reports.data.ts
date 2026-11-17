import { ADMIN_LOCATIONS, CURRENT_USER } from '../shared/admin-common';
import { RA_CATEGORIES, assetId } from '../shared/analytics-common';
import {
  CustomReport, FieldKind, FilterOperator, ReportDefinition, ReportRow, ReportScheduleDto, ReportStatus, ReportVisibility
} from './custom-reports.model';

// Static demo data for Custom Reports: the field catalog, the asset rows reports run against and the
// saved reports of the library. Everything runs in the browser (see custom-reports.service.ts).

/** Library Module filter. */
export const RA_MODULES = [
  'Assets', 'WIP / Operations', 'Maintenance', 'Inspection', 'Inventory', 'Movement & Custody', 'Audit & Compliance', 'Financial'
];

/** Visibility options ("Only me" is a private report). */
export const VISIBILITIES: ReportVisibility[] = ['Only me', 'My team', 'Organization'];

export const NOT_SCHEDULED = 'Not scheduled';

/** Schedule presets offered in Report Configuration. Times are Asia/Dubai. */
export const SCHEDULES = [
  NOT_SCHEDULED,
  'Daily – 07:00',
  'Weekly – Monday, 08:00',
  'Monthly – 1st day, 08:00',
  'Quarterly – 1st day, 08:00'
];

export const SCHEDULE_TIME_ZONE = 'Asia/Dubai';

/** Row limits offered on Group & Sort. */
export const ROW_LIMITS = [10, 25, 50, 100, 500, 1000];

/** Readable operator names; numeric and date fields use symbols / words that read naturally. */
export const FILTER_OPERATOR_LABELS: Record<'text' | 'number' | 'date', Partial<Record<FilterOperator, string>>> = {
  text: {
    equals: 'equals', notEquals: 'not equals', contains: 'contains', notContains: 'does not contain', startsWith: 'starts with',
    in: 'is one of', notIn: 'is not one of', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  },
  number: {
    equals: '=', notEquals: '≠', greaterThan: '>', greaterOrEqual: '≥', lessThan: '<', lessOrEqual: '≤', between: 'between',
    in: 'is one of', notIn: 'is not one of', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  },
  date: {
    equals: 'on', notEquals: 'not on', greaterThan: 'after', greaterOrEqual: 'on or after', lessThan: 'before', lessOrEqual: 'on or before',
    between: 'between', inLastDays: 'in the last (days)', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  }
};

/** Module for each Standard Reports category when a standard report is copied, and the fields it starts with. */
export const STANDARD_COPY_FIELDS: Record<string, { sources: string[]; fields: string[] }> = {
  'Maintenance': { sources: ['assets', 'maintenance'], fields: ['asset_id', 'asset_name', 'location', 'maintenance_cost', 'open_work_orders'] },
  'Inspection': { sources: ['assets', 'inspection'], fields: ['asset_id', 'location', 'last_inspection_result', 'failed_inspections', 'next_inspection_date'] },
  'Financial': { sources: ['assets'], fields: ['asset_id', 'asset_name', 'asset_category', 'purchase_date', 'purchase_cost'] }
};
export const DEFAULT_COPY_FIELDS = { sources: ['assets'], fields: ['asset_id', 'asset_name', 'asset_category', 'location', 'condition'] };

export function blankDefinition(sourceKey = 'assets'): ReportDefinition {
  return {
    sourceKey,
    fields: [],
    calcFields: [],
    filters: [],
    filterLogic: 'And',
    groupBy: '',
    aggregate: 'Sum',
    sortBy: '',
    sortDir: 'desc',
    rowLimit: 25,
    viz: 'Table',
    chartValue: ''
  };
}

// ----- Field catalog -----

const TEXT_OPS: FilterOperator[] = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'in', 'notIn', 'isEmpty', 'isNotEmpty'];
const NUMBER_OPS: FilterOperator[] = [
  'equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'in', 'notIn', 'isEmpty', 'isNotEmpty'
];
const DATE_OPS: FilterOperator[] = [
  'equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'inLastDays', 'isEmpty', 'isNotEmpty'
];

export function operatorsFor(kind: FieldKind): FilterOperator[] {
  if (kind === 'date') return DATE_OPS;
  return kind === 'text' ? TEXT_OPS : NUMBER_OPS;
}

/** A data source the reports join on the asset; assets is always included. */
export interface SourceSpec { key: string; label: string; description: string; required: boolean }
export interface FieldSpec { key: string; label: string; kind: FieldKind; dataSource: string; values?: string[] }
export interface FieldGroupSpec { group: string; fields: FieldSpec[] }

export const SOURCE_SPECS: SourceSpec[] = [
  { key: 'assets', label: 'Assets', description: 'Asset register: category, location, condition, status and cost', required: true },
  { key: 'maintenance', label: 'Maintenance', description: 'Work orders, maintenance cost and reliability (MTBF / MTTR)', required: false },
  { key: 'inspection', label: 'Inspection', description: 'Inspection results, scores, findings and the next due date', required: false }
];

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];
const ASSET_STATUSES = ['Active', 'Under Maintenance', 'Idle', 'Retired'];
const RESULTS = ['Pass', 'Pass with findings', 'Fail'];
const SITES = [...ADMIN_LOCATIONS.slice(0, 4), 'Jebel Ali Warehouse', 'Al Ain Depot'];

export const FIELD_GROUP_SPECS: FieldGroupSpec[] = [
  {
    group: 'Asset Information',
    fields: [
      { key: 'asset_id', label: 'Asset ID', kind: 'text', dataSource: 'assets' },
      { key: 'asset_name', label: 'Asset Name', kind: 'text', dataSource: 'assets' },
      { key: 'asset_category', label: 'Asset Category', kind: 'text', dataSource: 'assets', values: RA_CATEGORIES },
      { key: 'location', label: 'Location', kind: 'text', dataSource: 'assets', values: SITES },
      { key: 'condition', label: 'Condition', kind: 'text', dataSource: 'assets', values: CONDITIONS },
      { key: 'asset_status', label: 'Asset Status', kind: 'text', dataSource: 'assets', values: ASSET_STATUSES },
      { key: 'manufacturer', label: 'Manufacturer', kind: 'text', dataSource: 'assets' },
      { key: 'purchase_date', label: 'Purchase Date', kind: 'date', dataSource: 'assets' }
    ]
  },
  {
    group: 'Financial',
    fields: [
      { key: 'purchase_cost', label: 'Purchase Cost', kind: 'money', dataSource: 'assets' },
      { key: 'book_value', label: 'Net Book Value', kind: 'money', dataSource: 'assets' },
      { key: 'depreciation_ytd', label: 'Depreciation (YTD)', kind: 'money', dataSource: 'assets' },
      { key: 'utilization_pct', label: 'Utilization', kind: 'percent', dataSource: 'assets' }
    ]
  },
  {
    group: 'Maintenance',
    fields: [
      { key: 'maintenance_cost', label: 'Maintenance Cost', kind: 'money', dataSource: 'maintenance' },
      { key: 'open_work_orders', label: 'Open Work Orders', kind: 'number', dataSource: 'maintenance' },
      { key: 'total_work_orders', label: 'Total Work Orders', kind: 'number', dataSource: 'maintenance' },
      { key: 'last_service_date', label: 'Last Service Date', kind: 'date', dataSource: 'maintenance' },
      { key: 'mtbf_hours', label: 'MTBF (hours)', kind: 'number', dataSource: 'maintenance' },
      { key: 'mttr_hours', label: 'MTTR (hours)', kind: 'number', dataSource: 'maintenance' },
      { key: 'pm_compliance', label: 'PM Compliance', kind: 'percent', dataSource: 'maintenance' },
      { key: 'technician', label: 'Assigned Technician', kind: 'text', dataSource: 'maintenance' }
    ]
  },
  {
    group: 'Inspection',
    fields: [
      { key: 'last_inspection_date', label: 'Last Inspection Date', kind: 'date', dataSource: 'inspection' },
      { key: 'last_inspection_result', label: 'Last Inspection Result', kind: 'text', dataSource: 'inspection', values: RESULTS },
      { key: 'inspection_score', label: 'Inspection Score', kind: 'percent', dataSource: 'inspection' },
      { key: 'failed_inspections', label: 'Failed Inspections', kind: 'number', dataSource: 'inspection' },
      { key: 'open_findings', label: 'Open Findings', kind: 'number', dataSource: 'inspection' },
      { key: 'next_inspection_date', label: 'Next Inspection Date', kind: 'date', dataSource: 'inspection' },
      { key: 'inspector', label: 'Inspector', kind: 'text', dataSource: 'inspection' }
    ]
  }
];

// ----- Asset rows (one per asset; maintenance and inspection figures are per asset) -----

/** Deterministic pseudo-random numbers so the demo shows the same data on every load. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

const CATALOG_MODELS: Record<string, { names: string[]; makers: string[]; cost: [number, number]; life: number }> = {
  'Vehicles': { names: ['Toyota Hilux Pickup', 'Forklift 3T', 'Nissan Urvan Van', 'Mitsubishi Canter Truck'], makers: ['Toyota', 'Nissan', 'Mitsubishi', 'Hyster'], cost: [85_000, 240_000], life: 8 },
  'Machinery': { names: ['CNC Lathe', 'Air Compressor 75kW', 'Hydraulic Press', 'Industrial Mixer'], makers: ['Atlas Copco', 'Haas', 'Bosch Rexroth', 'Siemens'], cost: [120_000, 650_000], life: 12 },
  'Facilities': { names: ['Passenger Lift', 'Fire Pump Set', 'Loading Dock Leveller', 'Water Tank System'], makers: ['Otis', 'Grundfos', 'Kone', 'Schindler'], cost: [60_000, 420_000], life: 20 },
  'IT Equipment': { names: ['Core Network Switch', 'Rack Server', 'UPS 20kVA', 'Storage Array'], makers: ['Cisco', 'Dell', 'HPE', 'APC'], cost: [18_000, 160_000], life: 5 },
  'HVAC': { names: ['Chiller Unit 250TR', 'AHU-04', 'Cooling Tower', 'Split AC Package'], makers: ['Carrier', 'Daikin', 'Trane', 'York'], cost: [45_000, 780_000], life: 15 },
  'Power & Electrical': { names: ['Diesel Generator 500kVA', 'Main LV Panel', 'Transformer 1MVA', 'Solar Inverter'], makers: ['Caterpillar', 'ABB', 'Schneider', 'Cummins'], cost: [70_000, 520_000], life: 18 },
  'Safety & PPE': { names: ['Gas Detector Kit', 'Breathing Apparatus', 'Fall Arrest System', 'Fire Suppression Unit'], makers: ['Dräger', 'MSA', '3M', 'Honeywell'], cost: [6_000, 48_000], life: 6 }
};

const SITE_CODES: Record<string, string> = {
  'Dubai HQ': 'DXB', 'Abu Dhabi Office': 'AUH', 'Sharjah Facility': 'SHJ', 'Riyadh Office': 'RUH', 'Jebel Ali Warehouse': 'JEA', 'Al Ain Depot': 'AAN'
};

const TECHNICIANS = ['Rahul Mehta', 'Ahmed Khan', 'John Mathew', 'Omar Khalid', 'Michael Chen', 'Daniel Tan'];
const INSPECTORS = ['Fatima Noor', 'Mohammed Ali', 'Lisa Wong', 'Priya Nair', 'Ahmed Al Marri'];

function buildAssetRows(count: number): ReportRow[] {
  const rnd = seeded(20260417);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const between = (min: number, max: number) => min + rnd() * (max - min);
  const rows: ReportRow[] = [];
  for (let i = 0; i < count; i++) {
    const category = RA_CATEGORIES[i % RA_CATEGORIES.length];
    const model = CATALOG_MODELS[category];
    const site = SITES[(i * 5 + Math.floor(i / 7)) % SITES.length];
    const ageDays = Math.round(between(120, 365 * 7));
    const purchaseCost = Math.round(between(model.cost[0], model.cost[1]) / 100) * 100;
    const ageYears = ageDays / 365;
    const bookValue = Math.max(Math.round(purchaseCost * (1 - Math.min(ageYears / model.life, 0.95)) / 100) * 100, Math.round(purchaseCost * 0.05));
    const depreciationYtd = Math.round((purchaseCost / model.life) * (10.5 / 12) / 100) * 100;
    const conditionIndex = Math.min(3, Math.floor(ageYears / 2 + rnd() * 1.4));
    const condition = CONDITIONS[conditionIndex];
    const status = conditionIndex === 3 && rnd() < 0.4 ? 'Under Maintenance' : ageYears > 6.5 && rnd() < 0.3 ? 'Retired' : rnd() < 0.1 ? 'Idle' : 'Active';
    const totalWo = Math.round(between(2, 10) + conditionIndex * between(2, 6));
    const openWo = Math.min(totalWo, Math.round(rnd() * (1 + conditionIndex * 1.6)));
    const maintenanceCost = Math.round(purchaseCost * between(0.015, 0.05) * (1 + conditionIndex * 0.6) / 10) * 10;
    const failed = conditionIndex >= 2 ? Math.round(between(0, conditionIndex + 1)) : rnd() < 0.15 ? 1 : 0;
    const score = Math.round((97 - conditionIndex * 9 - failed * 3 - rnd() * 6) * 10) / 10;
    const result = failed > 1 || score < 70 ? 'Fail' : score < 85 ? 'Pass with findings' : 'Pass';
    rows.push({
      asset_id: assetId(SITE_CODES[site], 101 + i * 7),
      asset_name: `${pick(model.names)} ${String.fromCharCode(65 + (i % 6))}-${10 + (i % 23)}`,
      asset_category: category,
      location: site,
      condition,
      asset_status: status,
      manufacturer: pick(model.makers),
      purchase_date: daysFromToday(-ageDays),
      purchase_cost: purchaseCost,
      book_value: bookValue,
      depreciation_ytd: status === 'Retired' ? 0 : depreciationYtd,
      utilization_pct: status === 'Active' ? Math.round(between(58, 94) * 10) / 10 : Math.round(between(5, 40) * 10) / 10,
      maintenance_cost: maintenanceCost,
      open_work_orders: openWo,
      total_work_orders: totalWo,
      last_service_date: daysFromToday(-Math.round(between(3, 120))),
      mtbf_hours: Math.round(between(1400, 4200) / (1 + conditionIndex * 0.45)),
      mttr_hours: Math.round(between(2, 7) * (1 + conditionIndex * 0.5) * 10) / 10,
      pm_compliance: Math.round(Math.min(100, between(82, 100) - conditionIndex * between(2, 7)) * 10) / 10,
      technician: TECHNICIANS[(i * 3) % TECHNICIANS.length],
      last_inspection_date: daysFromToday(-Math.round(between(5, 170))),
      last_inspection_result: result,
      inspection_score: score,
      failed_inspections: failed,
      open_findings: result === 'Pass' ? (rnd() < 0.2 ? 1 : 0) : Math.round(between(1, 6)),
      next_inspection_date: daysFromToday(Math.round(between(2, 120))),
      inspector: INSPECTORS[(i * 2) % INSPECTORS.length]
    });
  }
  return rows;
}

/** The asset rows every custom report runs against. */
export const ASSET_ROWS: ReportRow[] = buildAssetRows(84);

// ----- Saved reports -----

/** Owners of the seeded reports; reports of other owners open read-only. */
export const DEMO_OWNERS = [
  { id: CURRENT_USER.id, name: CURRENT_USER.name },
  { id: 'USR-000134', name: 'Omar Hassan' },
  { id: 'USR-000142', name: 'Aisha Rahman' },
  { id: 'USR-000157', name: 'James Tan' },
  { id: 'USR-000163', name: 'Priya Sharma' }
];

/** Schedule preset → stored schedule. */
export function scheduleOf(text: string, recipients: string[] = []): ReportScheduleDto | null {
  if (!text || text === NOT_SCHEDULED) return null;
  const base = { dayOfWeek: null, dayOfMonth: null, timeZone: SCHEDULE_TIME_ZONE, recipients };
  let m = /^Daily – (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: 'Daily', time: m[1] };
  m = /^Weekly – (\w+), (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: 'Weekly', dayOfWeek: m[1], time: m[2] };
  m = /^(Monthly|Quarterly) – (\d+)\w* day, (\d{2}:\d{2})$/.exec(text);
  if (m) return { ...base, frequency: m[1], dayOfMonth: Number(m[2]), time: m[3] };
  return null;
}

/** 'YYYY-MM-DDTHH:mm' in Asia/Dubai (UTC+4), `days` / `hours` from now. */
export function dubaiStamp(days = 0, hours = 0): string {
  return new Date(Date.now() + days * 86_400_000 + (hours + 4) * 3_600_000).toISOString().slice(0, 16);
}

interface Seed {
  id: string;
  name: string;
  description: string;
  owner: number;
  module: string;
  status: ReportStatus;
  visibility: ReportVisibility;
  schedule?: string;
  favourite?: boolean;
  /** Days since the last change */
  updated: number;
  step: number;
  def: Partial<ReportDefinition>;
}

const SEEDS: Seed[] = [
  {
    id: 'CR-1001', name: 'Maintenance Cost by Category', owner: 0, module: 'Maintenance', status: 'Scheduled', visibility: 'Organization',
    description: 'Total maintenance spend and open work orders per asset category.', schedule: 'Monthly – 1st day, 08:00', favourite: true, updated: 1.2, step: 6,
    def: {
      sourceKey: 'assets+maintenance', fields: ['asset_category', 'maintenance_cost', 'open_work_orders'], groupBy: 'asset_category',
      sortBy: 'maintenance_cost', sortDir: 'desc', viz: 'Bar', chartValue: 'maintenance_cost'
    }
  },
  {
    id: 'CR-1002', name: 'Failed Inspections by Location', owner: 0, module: 'Inspection', status: 'Published', visibility: 'My team',
    description: 'Failed inspections and open findings per site.', favourite: true, updated: 3.5, step: 6,
    def: {
      sourceKey: 'assets+inspection', fields: ['location', 'failed_inspections', 'open_findings'], groupBy: 'location',
      sortBy: 'failed_inspections', sortDir: 'desc', viz: 'Bar', chartValue: 'failed_inspections'
    }
  },
  {
    id: 'CR-1003', name: 'Assets in Fair or Poor Condition', owner: 1, module: 'Assets', status: 'Published', visibility: 'Organization',
    description: 'Ageing assets that are candidates for overhaul or replacement.', updated: 6.1, step: 6,
    def: {
      sourceKey: 'assets', fields: ['asset_id', 'asset_name', 'asset_category', 'location', 'condition', 'purchase_date'],
      filters: [{ field: 'condition', op: 'in', value: 'Fair, Poor', valueTo: '' }], sortBy: 'purchase_date', sortDir: 'asc', rowLimit: 50
    }
  },
  {
    id: 'CR-1004', name: 'Net Book Value by Category', owner: 0, module: 'Financial', status: 'Scheduled', visibility: 'Organization',
    description: 'Purchase cost against current net book value for each category.', schedule: 'Quarterly – 1st day, 08:00', updated: 9.4, step: 6,
    def: {
      sourceKey: 'assets', fields: ['asset_category', 'purchase_cost', 'book_value'], groupBy: 'asset_category',
      sortBy: 'book_value', sortDir: 'desc', viz: 'Donut', chartValue: 'book_value'
    }
  },
  {
    id: 'CR-1005', name: 'Assets with 3+ Open Work Orders', owner: 2, module: 'Maintenance', status: 'Draft', visibility: 'My team',
    description: 'Backlog hotspots by asset and technician.', updated: 12.3, step: 4,
    def: {
      sourceKey: 'assets+maintenance', fields: ['asset_id', 'asset_name', 'location', 'open_work_orders', 'technician'],
      filters: [{ field: 'open_work_orders', op: 'greaterOrEqual', value: '3', valueTo: '' }], sortBy: 'open_work_orders', sortDir: 'desc'
    }
  },
  {
    id: 'CR-1006', name: 'Inspections Due in the Next 30 Days', owner: 0, module: 'Inspection', status: 'Scheduled', visibility: 'My team',
    description: 'Upcoming inspections with the last result and the assigned inspector.', schedule: 'Weekly – Monday, 08:00', updated: 2.7, step: 6,
    def: {
      sourceKey: 'assets+inspection', fields: ['asset_id', 'asset_name', 'location', 'next_inspection_date', 'last_inspection_result', 'inspector'],
      filters: [{ field: 'next_inspection_date', op: 'between', value: daysFromToday(0), valueTo: daysFromToday(30) }],
      sortBy: 'next_inspection_date', sortDir: 'asc', rowLimit: 50
    }
  },
  {
    id: 'CR-1007', name: 'Maintenance Cost per Work Order', owner: 0, module: 'Maintenance', status: 'Draft', visibility: 'Only me',
    description: 'Average cost of each work order, highest first.', updated: 0.3, step: 5,
    def: {
      sourceKey: 'assets+maintenance',
      calcFields: [{ key: 'calc_cost_per_work_order', label: 'Cost per Work Order', left: 'maintenance_cost', op: '÷', right: 'total_work_orders' }],
      fields: ['asset_id', 'asset_name', 'asset_category', 'maintenance_cost', 'total_work_orders', 'calc_cost_per_work_order'],
      sortBy: 'calc_cost_per_work_order', sortDir: 'desc'
    }
  },
  {
    id: 'CR-1008', name: 'PM Compliance and MTTR by Location', owner: 3, module: 'Maintenance', status: 'Published', visibility: 'Organization',
    description: 'Average preventive maintenance compliance and repair time per site.', updated: 18.6, step: 6,
    def: {
      sourceKey: 'assets+maintenance', fields: ['location', 'pm_compliance', 'mttr_hours'], groupBy: 'location', aggregate: 'Average',
      sortBy: 'pm_compliance', sortDir: 'desc', viz: 'Bar', chartValue: 'pm_compliance'
    }
  },
  {
    id: 'CR-1009', name: 'Asset Health Overview', owner: 0, module: 'Assets', status: 'Published', visibility: 'Organization',
    description: 'Condition, maintenance spend and inspection score for every asset.', favourite: true, updated: 22.1, step: 6,
    def: {
      sourceKey: 'assets+maintenance+inspection',
      fields: ['asset_id', 'asset_name', 'condition', 'maintenance_cost', 'inspection_score', 'last_inspection_result'],
      sortBy: 'inspection_score', sortDir: 'asc', rowLimit: 100
    }
  },
  {
    id: 'CR-1010', name: 'Depreciation YTD by Category', owner: 4, module: 'Financial', status: 'Draft', visibility: 'My team',
    description: 'Year-to-date depreciation charge split by asset category.', updated: 31.8, step: 5,
    def: {
      sourceKey: 'assets', fields: ['asset_category', 'depreciation_ytd'], groupBy: 'asset_category',
      sortBy: 'depreciation_ytd', sortDir: 'desc', viz: 'Donut', chartValue: 'depreciation_ytd'
    }
  },
  {
    id: 'CR-1011', name: 'Assets Purchased in the Last 2 Years', owner: 0, module: 'Assets', status: 'Draft', visibility: 'Only me',
    description: 'Recent acquisitions with manufacturer and purchase cost.', updated: 44.5, step: 3,
    def: {
      sourceKey: 'assets', fields: ['asset_id', 'asset_name', 'manufacturer', 'purchase_date', 'purchase_cost'],
      filters: [{ field: 'purchase_date', op: 'inLastDays', value: '730', valueTo: '' }], sortBy: 'purchase_date', sortDir: 'desc'
    }
  },
  {
    id: 'CR-1012', name: 'Monthly Utilization by Category', owner: 1, module: 'Assets', status: 'Scheduled', visibility: 'Organization',
    description: 'Average utilization of active assets per category.', schedule: 'Daily – 07:00', updated: 58.2, step: 6,
    def: {
      sourceKey: 'assets', fields: ['asset_category', 'utilization_pct'], groupBy: 'asset_category', aggregate: 'Average',
      filters: [{ field: 'asset_status', op: 'equals', value: 'Active', valueTo: '' }],
      sortBy: 'utilization_pct', sortDir: 'desc', viz: 'Line', chartValue: 'utilization_pct'
    }
  }
];

const RECIPIENTS = ['ops.managers@purpleiq.com', 'finance.reporting@purpleiq.com'];

/** The saved custom reports the library starts with. */
export function seedReports(): CustomReport[] {
  return SEEDS.map((s) => {
    const owner = DEMO_OWNERS[s.owner];
    const schedule = s.schedule ?? NOT_SCHEDULED;
    return {
      ...blankDefinition(s.def.sourceKey),
      ...s.def,
      id: s.id,
      name: s.name,
      description: s.description,
      owner: owner.name,
      ownerId: owner.id,
      module: s.module,
      status: s.status,
      favourite: !!s.favourite,
      updatedAt: dubaiStamp(-s.updated),
      visibility: s.visibility,
      schedule,
      scheduleDetail: scheduleOf(schedule, RECIPIENTS.slice(0, 1 + (s.owner % 2))),
      canEdit: owner.id === CURRENT_USER.id,
      currentStep: s.step,
      loaded: true
    };
  });
}
