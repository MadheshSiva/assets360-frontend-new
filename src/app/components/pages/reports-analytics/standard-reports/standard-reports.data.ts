import { RA_METRICS } from '../shared/analytics-metrics';

// DEMO MODE: the standard report catalogue is seeded here until the reporting API exists.
// Dates are local Asia/Dubai wall-clock times written as 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'.

/** The reporting "today" used by quick ranges, the calendar and the stat tiles. */
export const SR_TODAY = '2026-10-29';

export const SR_MODULES = [
  'Assets', 'Tracking & IoT', 'Movement & Custody', 'Maintenance', 'Inspection', 'Inventory', 'WIP / Operations',
  'Audit & Compliance', 'Contracts & Warranty', 'Financial'
] as const;
export type ReportModule = (typeof SR_MODULES)[number];

export type ReportStatus = 'Ready' | 'Scheduled' | 'Needs review' | 'Draft';
export type ReportFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'On demand';
export type ReportFormat = 'PDF' | 'Excel' | 'CSV';

export const SR_STATUSES: ReportStatus[] = ['Ready', 'Scheduled', 'Needs review', 'Draft'];
export const SR_SCHEDULE_FREQUENCIES: ReportFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];
export const SR_FORMATS: ReportFormat[] = ['PDF', 'Excel', 'CSV'];

export const SR_TIME_ZONES = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
  { value: 'Asia/Qatar', label: 'Asia/Qatar (AST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'UTC', label: 'UTC' }
];

export interface ReportPeriod {
  start: string;
  end: string;
  /** 'HH:mm' when the period includes time */
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
}

export interface ReportSchedule {
  frequency: ReportFrequency;
  /** Weekly: 0–6 (Sun–Sat). Monthly / Quarterly: day of month 1–28. Daily: unused. */
  day: number;
  time: string;
  recipients: string[];
  format: ReportFormat;
}

/** What the report viewer plots: a measure broken down by category, site or month. */
export interface ReportPreview {
  dimension: 'category' | 'site' | 'month';
  measure: string;
  unit: 'money' | 'count' | 'percent' | 'hours';
  /** Total for count / money / hours, or the average for percent */
  total: number;
}

export interface StandardReport {
  id: string;
  name: string;
  module: ReportModule;
  description: string;
  owner: string;
  period: ReportPeriod;
  generatedOn: string;
  nextScheduled: string | null;
  reviewDue: string | null;
  frequency: ReportFrequency;
  status: ReportStatus;
  /** The report definition exposes date-range parameters */
  hasDateFilter: boolean;
  /** Last change to the report definition */
  updatedOn: string;
  schedule: ReportSchedule | null;
  preview: ReportPreview;
}

const M = RA_METRICS;
const SEPT: ReportPeriod = { start: '2026-09-01', end: '2026-09-30', startTime: null, endTime: null, timeZone: 'Asia/Dubai' };

type Seed = [
  name: string, module: ReportModule, frequency: ReportFrequency, status: ReportStatus, generatedOn: string,
  nextScheduled: string | null, reviewDue: string | null, hasDateFilter: boolean, updatedOn: string, owner: string,
  description: string, preview: ReportPreview
];

const SEEDS: Seed[] = [
  ['Asset Register', 'Assets', 'Monthly', 'Ready', '2026-10-28T09:15', '2026-11-01T08:00', null, true, '2026-10-12', 'Sarah Ahmed',
    'Complete list of registered assets with category, site, status and custodian.',
    { dimension: 'category', measure: 'Assets', unit: 'count', total: M.assets.total }],
  ['Asset Utilization', 'Tracking & IoT', 'Monthly', 'Ready', '2026-10-28T10:32', '2026-11-01T08:00', null, true, '2026-09-18', 'Omar Hassan',
    'Average utilization per asset category from IoT runtime data.',
    { dimension: 'category', measure: 'Utilization', unit: 'percent', total: M.iot.avgUtilization }],
  ['Maintenance Cost Analysis', 'Maintenance', 'Monthly', 'Scheduled', '2026-10-28T09:15', '2026-11-01T08:00', null, true, '2026-10-05', 'Aisha Rahman',
    'Labour, parts and contractor cost of maintenance work orders.',
    { dimension: 'month', measure: 'Maintenance cost', unit: 'money', total: M.maintenance.cost }],
  ['Preventive Maintenance Compliance', 'Maintenance', 'Weekly', 'Needs review', '2026-10-27T14:20', '2026-11-03T08:00', '2026-10-30', false, '2026-08-22', 'James Tan',
    'PM work orders completed on time against plan, per site.',
    { dimension: 'site', measure: 'PM compliance', unit: 'percent', total: M.maintenance.pmCompliance }],
  ['Inspection Findings', 'Inspection', 'On demand', 'Draft', '2026-10-26T16:45', null, null, true, '2026-10-26', 'Priya Sharma',
    'Open and closed inspection findings by severity and site.',
    { dimension: 'site', measure: 'Open findings', unit: 'count', total: M.inspection.openFindings }],
  ['Inventory Stock Status', 'Inventory', 'Daily', 'Ready', '2026-10-28T11:20', '2026-10-30T08:00', null, false, '2026-07-14', 'Fatima Noor',
    'Stock on hand, reorder points and value per store.',
    { dimension: 'site', measure: 'Stock value', unit: 'money', total: M.inventory.value }],
  ['Asset Movement History', 'Movement & Custody', 'Weekly', 'Scheduled', '2026-10-28T12:05', '2026-11-02T08:00', null, true, '2026-09-30', 'Mohammed Ali',
    'Transfers, check-outs and returns between sites.',
    { dimension: 'month', measure: 'Movements', unit: 'count', total: 2964 }],
  ['Audit & Compliance Summary', 'Audit & Compliance', 'Monthly', 'Ready', '2026-10-25T13:40', '2026-11-01T08:00', null, false, '2026-09-02', 'Daniel Kim',
    'Compliance score, open audit findings and overdue CAPA.',
    { dimension: 'site', measure: 'Compliance score', unit: 'percent', total: M.compliance.score }],
  ['Total Cost of Ownership', 'Financial', 'Monthly', 'Needs review', '2026-10-28T09:50', '2026-11-01T08:00', '2026-11-04', true, '2026-10-20', 'Rahul Mehta',
    'Acquisition, operating and maintenance cost over the asset life.',
    { dimension: 'category', measure: 'Total cost', unit: 'money', total: M.financial.capex + M.financial.opex }],
  ['WIP / Production Analytics', 'WIP / Operations', 'Daily', 'Scheduled', '2026-10-28T08:20', '2026-10-30T06:00', null, false, '2026-08-11', 'Ahmed Khan',
    'Work in progress, output units and on-time completion.',
    { dimension: 'month', measure: 'Output units', unit: 'count', total: M.production.outputUnits }],
  ['Asset Depreciation Schedule', 'Financial', 'Monthly', 'Ready', '2026-10-01T07:30', '2026-11-01T07:30', null, true, '2026-09-15', 'Lisa Wong',
    'Straight-line depreciation and net book value by category.',
    { dimension: 'category', measure: 'Net book value', unit: 'money', total: M.financial.netBookValue }],
  ['Work Order Backlog', 'Maintenance', 'Weekly', 'Scheduled', '2026-10-26T07:00', '2026-11-02T07:00', null, false, '2026-09-08', 'John Mathew',
    'Open work orders by age and priority.',
    { dimension: 'site', measure: 'Open work orders', unit: 'count', total: M.maintenance.openWorkOrders }],
  ['IoT Sensor Alerts Summary', 'Tracking & IoT', 'Daily', 'Scheduled', '2026-10-28T06:00', '2026-10-30T06:00', null, false, '2026-08-28', 'Omar Khalid',
    'Threshold and offline alerts raised by connected sensors.',
    { dimension: 'site', measure: 'Active alerts', unit: 'count', total: M.iot.activeAlerts }],
  ['Tag Read Activity', 'Tracking & IoT', 'Weekly', 'Ready', '2026-10-26T09:00', '2026-11-02T09:00', null, false, '2026-07-30', 'Michael Chen',
    'RFID / BLE tag reads per gateway and site.',
    { dimension: 'month', measure: 'Tag reads', unit: 'count', total: 1_284_000 }],
  ['Custody Transfer Log', 'Movement & Custody', 'Monthly', 'Ready', '2026-10-01T10:10', '2026-11-01T10:10', null, true, '2026-09-25', 'Sarah Khan',
    'Custodian changes with acknowledgement status.',
    { dimension: 'site', measure: 'Transfers', unit: 'count', total: 642 }],
  ['Inspection Pass Rate by Site', 'Inspection', 'Monthly', 'Scheduled', '2026-10-01T08:00', '2026-11-01T08:00', null, false, '2026-08-19', 'Ahmed Al Marri',
    'Completion and pass rate of scheduled inspections.',
    { dimension: 'site', measure: 'Completion rate', unit: 'percent', total: M.inspection.completionRate }],
  ['Reorder & Stock-out Report', 'Inventory', 'Weekly', 'Ready', '2026-10-27T11:00', '2026-11-03T11:00', null, false, '2026-10-08', 'Priya Nair',
    'Items below reorder level and stock-outs in the period.',
    { dimension: 'category', measure: 'Items below reorder', unit: 'count', total: M.inventory.belowReorder }],
  ['Certificate Expiry Tracker', 'Audit & Compliance', 'Weekly', 'Needs review', '2026-10-20T08:30', '2026-11-03T08:30', '2026-10-31', false, '2026-09-10', 'Daniel Tan',
    'Statutory certificates and permits expiring in the next 90 days.',
    { dimension: 'site', measure: 'Expiring certificates', unit: 'count', total: M.compliance.expiringCertifications }],
  ['Warranty Expiry Report', 'Contracts & Warranty', 'Monthly', 'Scheduled', '2026-10-01T09:00', '2026-11-01T09:00', null, false, '2026-08-05', 'Fatima Al Mansoori',
    'Asset warranties ending in the next two quarters.',
    { dimension: 'category', measure: 'Warranties expiring', unit: 'count', total: 74 }],
  ['Contract Renewal Pipeline', 'Contracts & Warranty', 'Quarterly', 'Draft', '2026-10-14T15:30', null, null, true, '2026-10-14', 'James Wilson',
    'Service and AMC contracts due for renewal with annual value.',
    { dimension: 'month', measure: 'Contract value', unit: 'money', total: 2_340_000 }],
  ['Production Downtime Report', 'WIP / Operations', 'Weekly', 'Ready', '2026-10-26T18:00', '2026-11-02T18:00', null, false, '2026-09-12', 'Fatima Ali',
    'Unplanned stoppages and lost hours per line.',
    { dimension: 'month', measure: 'Downtime hours', unit: 'hours', total: 1_126 }],
  ['Capex vs Opex Summary', 'Financial', 'Quarterly', 'Scheduled', '2026-10-01T08:00', '2027-01-01T08:00', null, true, '2026-07-01', 'Rahul Mehta',
    'Capital and operating spend against budget.',
    { dimension: 'month', measure: 'Capex', unit: 'money', total: M.financial.capex }],
  ['Asset Lifecycle Summary', 'Assets', 'Quarterly', 'Draft', '2026-10-07T13:20', null, null, false, '2026-09-29', 'Aisha Rahman',
    'Assets by lifecycle stage from commissioning to disposal.',
    { dimension: 'category', measure: 'Assets', unit: 'count', total: M.assets.total }],
  ['Missing & Retired Assets', 'Assets', 'Monthly', 'Ready', '2026-10-28T09:30', '2026-11-01T08:00', null, false, '2026-08-30', 'Omar Hassan',
    'Assets reported missing or retired, with last known location.',
    { dimension: 'site', measure: 'Assets', unit: 'count', total: M.assets.status.missing + M.assets.status.retired }]
];

const RECIPIENTS = ['sarah.ahmed@purpleiq.com', 'reports@purpleiq.com'];

function seedSchedule(frequency: ReportFrequency, nextScheduled: string | null): ReportSchedule | null {
  if (!nextScheduled || frequency === 'On demand') return null;
  const next = new Date(nextScheduled);
  return {
    frequency,
    day: frequency === 'Weekly' ? next.getDay() : next.getDate(),
    time: nextScheduled.slice(11, 16),
    recipients: [...RECIPIENTS],
    format: 'PDF'
  };
}

export function seedStandardReports(): StandardReport[] {
  return SEEDS.map(([name, module, frequency, status, generatedOn, nextScheduled, reviewDue, hasDateFilter, updatedOn, owner, description, preview], i) => ({
    id: `RPT-STD-${String(i + 1).padStart(3, '0')}`,
    name,
    module,
    description,
    owner,
    period: { ...SEPT },
    generatedOn,
    nextScheduled,
    reviewDue,
    frequency,
    status,
    hasDateFilter,
    updatedOn,
    schedule: seedSchedule(frequency, nextScheduled),
    preview
  }));
}
