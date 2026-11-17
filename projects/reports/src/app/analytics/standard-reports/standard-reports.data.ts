// Standard reports for the static demo (seeded below, kept in memory by standard-reports.service.ts).
// Dates are wall-clock strings in the report's time zone ('YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm').

/** Report categories. */
export const SR_MODULES = [
  'Assets', 'Tracking & IoT', 'Movement & Custody', 'Maintenance', 'Inspection', 'Inventory', 'WIP / Operations',
  'Audit & Compliance', 'Contracts & Warranty', 'Financial'
] as const;
export type ReportModule = (typeof SR_MODULES)[number];

export type ReportStatus = 'Ready' | 'Scheduled' | 'Needs review' | 'Draft';
export type ReportFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'On demand';
export type ReportFormat = 'PDF' | 'Excel' | 'CSV';

/** Frequencies the schedule dialog can compute a next run for (Yearly and On demand are not offered there). */
export const SR_SCHEDULE_FREQUENCIES: ReportFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

export const SR_FORMATS: ReportFormat[] = ['PDF', 'Excel', 'CSV'];

/** Page default time zone. */
export const SR_DEFAULT_TIME_ZONE = 'Asia/Dubai';

export const SR_TIME_ZONES = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
  { value: 'Asia/Qatar', label: 'Asia/Qatar (AST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'UTC', label: 'UTC' }
];

export interface ReportPeriod {
  /** Empty when the report has no date filter */
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

/** One row of a report's output. */
export interface ReportOutputRow {
  label: string;
  value: number;
  /** Percent of the total; null for averaged measures (percent unit) */
  share: number | null;
}

/** What the report viewer plots: a measure broken down by category, site or month. */
export interface ReportOutput {
  reportId: string;
  measure: string;
  dimension: 'category' | 'site' | 'month';
  unit: 'money' | 'count' | 'percent';
  /** Sum of the rows (count / money) or the overall average (percent); null when there is no data */
  total: number | null;
  aggregate: 'sum' | 'average';
  periodFrom: string;
  periodTo: string;
  timeZone: string;
  /** True when the report has no period of its own and this year is used */
  defaultPeriod: boolean;
  rows: ReportOutputRow[];
  note: string | null;
  generatedAt: string;
}

export interface StandardReport {
  id: string;
  name: string;
  module: ReportModule;
  description: string;
  owner: string;
  period: ReportPeriod;
  generatedOn: string | null;
  nextScheduled: string | null;
  reviewDue: string | null;
  frequency: ReportFrequency;
  status: ReportStatus;
  /** The report has a reporting period set */
  hasDateFilter: boolean;
  /** Last change to the report definition */
  updatedOn: string;
  schedule: ReportSchedule | null;
}

/** Day markers on the report calendar, keyed by 'YYYY-MM-DD'. */
export interface CalendarCounts {
  generated: number;
  scheduled: number;
  review: number;
}

// ----- Demo catalogue -----

/** How a report's output is built: a measure over a dimension, scaled around `base` (per 30 days for count / money). */
export interface OutputSpec {
  measure: string;
  dimension: ReportOutput['dimension'];
  unit: ReportOutput['unit'];
  aggregate: ReportOutput['aggregate'];
  base: number;
  /** Relative spread between rows (0.3 = ±30%) */
  spread: number;
  note?: string;
}

/** A seeded standard report; day offsets are relative to today, times are Asia/Dubai. */
export interface StandardReportSeed {
  id: string;
  name: string;
  module: ReportModule;
  description: string;
  owner: string;
  frequency: ReportFrequency;
  status: ReportStatus;
  hasDateFilter: boolean;
  /** Days ago + time of the last run (null: never generated) */
  generated: [number, string] | null;
  /** Days ahead + time of the next run (null: not scheduled) */
  next: [number, string] | null;
  /** Days ahead of the review due date */
  review: number | null;
  /** Days since the definition changed */
  updated: number;
  output: OutputSpec;
}

export const SR_SEEDS: StandardReportSeed[] = [
  {
    id: 'SR-0001', name: 'Asset Register Summary', module: 'Assets', owner: 'Sarah Ahmed', frequency: 'Monthly', status: 'Scheduled',
    description: 'Active assets by category with additions and disposals.', hasDateFilter: true, generated: [16, '08:00'], next: [14, '08:00'], review: null, updated: 9,
    output: { measure: 'Active assets', dimension: 'category', unit: 'count', aggregate: 'sum', base: 180, spread: 0.6 }
  },
  {
    id: 'SR-0002', name: 'Asset Utilization by Site', module: 'Tracking & IoT', owner: 'James Tan', frequency: 'Weekly', status: 'Scheduled',
    description: 'Average utilization from telematics and hour meters per site.', hasDateFilter: true, generated: [1, '07:30'], next: [6, '07:30'], review: null, updated: 21,
    output: { measure: 'Utilization', dimension: 'site', unit: 'percent', aggregate: 'average', base: 74, spread: 0.18 }
  },
  {
    id: 'SR-0003', name: 'Asset Movement Log', module: 'Movement & Custody', owner: 'Aisha Rahman', frequency: 'Daily', status: 'Scheduled',
    description: 'Transfers, check-outs and check-ins recorded per site.', hasDateFilter: true, generated: [0, '06:00'], next: [1, '06:00'], review: null, updated: 40,
    output: { measure: 'Movements', dimension: 'site', unit: 'count', aggregate: 'sum', base: 64, spread: 0.5 }
  },
  {
    id: 'SR-0004', name: 'Maintenance Cost Analysis', module: 'Maintenance', owner: 'Omar Hassan', frequency: 'Monthly', status: 'Needs review',
    description: 'Preventive and corrective maintenance spend by asset category.', hasDateFilter: true, generated: [3, '09:15'], next: [13, '09:00'], review: 2, updated: 3,
    output: { measure: 'Maintenance cost', dimension: 'category', unit: 'money', aggregate: 'sum', base: 86_000, spread: 0.55 }
  },
  {
    id: 'SR-0005', name: 'Work Order Backlog', module: 'Maintenance', owner: 'Rahul Mehta', frequency: 'Weekly', status: 'Scheduled',
    description: 'Open work orders by site, including overdue and on-hold orders.', hasDateFilter: true, generated: [4, '08:00'], next: [3, '08:00'], review: null, updated: 15,
    output: { measure: 'Open work orders', dimension: 'site', unit: 'count', aggregate: 'sum', base: 28, spread: 0.6 }
  },
  {
    id: 'SR-0006', name: 'PM Compliance Trend', module: 'Maintenance', owner: 'Omar Hassan', frequency: 'Monthly', status: 'Ready',
    description: 'Preventive maintenance completed on time, month by month.', hasDateFilter: true, generated: [6, '10:40'], next: null, review: null, updated: 33,
    output: { measure: 'PM compliance', dimension: 'month', unit: 'percent', aggregate: 'average', base: 91, spread: 0.06 }
  },
  {
    id: 'SR-0007', name: 'Inspection Pass Rate', module: 'Inspection', owner: 'Fatima Noor', frequency: 'Weekly', status: 'Scheduled',
    description: 'Share of inspections passed first time per asset category.', hasDateFilter: true, generated: [2, '07:00'], next: [5, '07:00'], review: null, updated: 11,
    output: { measure: 'Pass rate', dimension: 'category', unit: 'percent', aggregate: 'average', base: 88, spread: 0.1 }
  },
  {
    id: 'SR-0008', name: 'Overdue Inspections', module: 'Inspection', owner: 'Fatima Noor', frequency: 'Daily', status: 'Needs review',
    description: 'Inspections past their due date by site.', hasDateFilter: false, generated: [0, '07:00'], next: [1, '07:00'], review: 0, updated: 5,
    output: { measure: 'Overdue inspections', dimension: 'site', unit: 'count', aggregate: 'sum', base: 9, spread: 0.7, note: 'Counts inspections that were open at the end of the period.' }
  },
  {
    id: 'SR-0009', name: 'Stock Valuation', module: 'Inventory', owner: 'Lisa Wong', frequency: 'Monthly', status: 'Ready',
    description: 'Spare parts and consumables on hand, valued at average cost.', hasDateFilter: true, generated: [10, '18:00'], next: null, review: null, updated: 27,
    output: { measure: 'Stock value', dimension: 'site', unit: 'money', aggregate: 'sum', base: 410_000, spread: 0.5 }
  },
  {
    id: 'SR-0010', name: 'Reorder Alerts', module: 'Inventory', owner: 'Lisa Wong', frequency: 'Daily', status: 'Scheduled',
    description: 'Items at or below their reorder level per warehouse.', hasDateFilter: false, generated: [0, '05:30'], next: [1, '05:30'], review: null, updated: 52,
    output: { measure: 'Items below reorder level', dimension: 'site', unit: 'count', aggregate: 'sum', base: 14, spread: 0.6 }
  },
  {
    id: 'SR-0011', name: 'Production Output', module: 'WIP / Operations', owner: 'Michael Chen', frequency: 'Weekly', status: 'Ready',
    description: 'Units produced per month across production lines.', hasDateFilter: true, generated: [5, '16:00'], next: null, review: null, updated: 19,
    output: { measure: 'Output units', dimension: 'month', unit: 'count', aggregate: 'sum', base: 12_400, spread: 0.15 }
  },
  {
    id: 'SR-0012', name: 'Downtime Analysis', module: 'WIP / Operations', owner: 'Michael Chen', frequency: 'Monthly', status: 'Draft',
    description: 'Unplanned downtime hours by asset category.', hasDateFilter: true, generated: null, next: null, review: null, updated: 2,
    output: { measure: 'Downtime hours', dimension: 'category', unit: 'count', aggregate: 'sum', base: 46, spread: 0.6 }
  },
  {
    id: 'SR-0013', name: 'Audit Findings Summary', module: 'Audit & Compliance', owner: 'Ahmed Al Marri', frequency: 'Quarterly', status: 'Needs review',
    description: 'Open audit findings by site, including overdue corrective actions.', hasDateFilter: true, generated: [8, '11:20'], next: [44, '09:00'], review: 4, updated: 8,
    output: { measure: 'Open findings', dimension: 'site', unit: 'count', aggregate: 'sum', base: 12, spread: 0.6 }
  },
  {
    id: 'SR-0014', name: 'Certificate Expiry Tracker', module: 'Audit & Compliance', owner: 'Ahmed Al Marri', frequency: 'Monthly', status: 'Scheduled',
    description: 'Statutory certificates expiring in the next 90 days.', hasDateFilter: false, generated: [16, '08:30'], next: [14, '08:30'], review: null, updated: 61,
    output: { measure: 'Certificates expiring', dimension: 'category', unit: 'count', aggregate: 'sum', base: 4, spread: 0.8 }
  },
  {
    id: 'SR-0015', name: 'Warranty Expiry Report', module: 'Contracts & Warranty', owner: 'Priya Sharma', frequency: 'Monthly', status: 'Ready',
    description: 'Assets whose warranty ends within the next six months.', hasDateFilter: false, generated: [12, '09:00'], next: null, review: null, updated: 70,
    output: { measure: 'Warranties expiring', dimension: 'category', unit: 'count', aggregate: 'sum', base: 7, spread: 0.7 }
  },
  {
    id: 'SR-0016', name: 'Vendor Contract Spend', module: 'Contracts & Warranty', owner: 'Priya Sharma', frequency: 'Quarterly', status: 'Scheduled',
    description: 'Service contract spend by site against contract value.', hasDateFilter: true, generated: [47, '10:00'], next: [44, '10:00'], review: null, updated: 47,
    output: { measure: 'Contract spend', dimension: 'site', unit: 'money', aggregate: 'sum', base: 132_000, spread: 0.5 }
  },
  {
    id: 'SR-0017', name: 'Depreciation Schedule', module: 'Financial', owner: 'Daniel Kim', frequency: 'Monthly', status: 'Scheduled',
    description: 'Depreciation charge for the period by asset category.', hasDateFilter: true, generated: [16, '07:00'], next: [14, '07:00'], review: null, updated: 24,
    output: { measure: 'Depreciation', dimension: 'category', unit: 'money', aggregate: 'sum', base: 145_000, spread: 0.55 }
  },
  {
    id: 'SR-0018', name: 'Total Cost of Ownership', module: 'Financial', owner: 'Daniel Kim', frequency: 'Quarterly', status: 'Ready',
    description: 'Purchase, maintenance and operating cost per asset category.', hasDateFilter: true, generated: [21, '15:10'], next: null, review: null, updated: 21,
    output: { measure: 'Total cost of ownership', dimension: 'category', unit: 'money', aggregate: 'sum', base: 520_000, spread: 0.5 }
  },
  {
    id: 'SR-0019', name: 'Capex vs Budget', module: 'Financial', owner: 'Sarah Ahmed', frequency: 'Monthly', status: 'Draft',
    description: 'Capital expenditure per month against the approved budget.', hasDateFilter: true, generated: null, next: null, review: null, updated: 1,
    output: { measure: 'Capital expenditure', dimension: 'month', unit: 'money', aggregate: 'sum', base: 610_000, spread: 0.3 }
  },
  {
    id: 'SR-0020', name: 'Idle Asset Report', module: 'Tracking & IoT', owner: 'James Tan', frequency: 'On demand', status: 'Ready',
    description: 'Assets with no recorded usage in the period, by site.', hasDateFilter: true, generated: [7, '13:45'], next: null, review: null, updated: 36,
    output: { measure: 'Idle assets', dimension: 'site', unit: 'count', aggregate: 'sum', base: 11, spread: 0.6 }
  },
  {
    id: 'SR-0021', name: 'Custody Acknowledgement Status', module: 'Movement & Custody', owner: 'Aisha Rahman', frequency: 'Weekly', status: 'Scheduled',
    description: 'Custody handovers acknowledged by the receiving employee, per site.', hasDateFilter: true, generated: [3, '09:00'], next: [4, '09:00'], review: null, updated: 13,
    output: { measure: 'Acknowledged handovers', dimension: 'site', unit: 'percent', aggregate: 'average', base: 93, spread: 0.07 }
  },
  {
    id: 'SR-0022', name: 'Asset Additions and Disposals', module: 'Assets', owner: 'Sarah Ahmed', frequency: 'Yearly', status: 'Ready',
    description: 'Assets added to the register month by month.', hasDateFilter: true, generated: [30, '12:00'], next: null, review: null, updated: 30,
    output: { measure: 'Assets added', dimension: 'month', unit: 'count', aggregate: 'sum', base: 38, spread: 0.35 }
  }
];

/** Sites and months used for report outputs. */
export const SR_SITES = ['Dubai HQ', 'Abu Dhabi Office', 'Sharjah Facility', 'Riyadh Office', 'Jebel Ali Warehouse', 'Al Ain Depot'];
export const SR_CATEGORIES = ['Vehicles', 'Machinery', 'Facilities', 'IT Equipment', 'HVAC', 'Power & Electrical', 'Safety & PPE'];

/** Delivery recipients for the seeded schedules. */
export const SR_DEFAULT_RECIPIENTS = ['ops.managers@purpleiq.com'];
