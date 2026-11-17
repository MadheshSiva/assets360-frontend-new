// Standard reports are loaded from the Reports & Analytics API (/api/standard-reports).
// The models below are the page's own view of a report: dates are wall-clock strings in the report's
// time zone ('YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'), converted from the UTC values the API returns.

/** Categories the page has a style for. The API's /options lists the ones it accepts (a subset of these). */
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

// Client-side only: the API stores no delivery format for a schedule.
export const SR_FORMATS: ReportFormat[] = ['PDF', 'Excel', 'CSV'];

/** Page default; the API has no list of time zones, so the picker keeps this static list. */
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

/** One row of a report's output (GET /api/standard-reports/{id}/output). */
export interface ReportOutputRow {
  label: string;
  value: number;
  /** Percent of the total; null for averaged measures (percent unit) */
  share: number | null;
}

/** What the report viewer plots: a measure broken down by category, site or month, read live from the API. */
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
  /** True when the report has no period of its own and the API used this year */
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
