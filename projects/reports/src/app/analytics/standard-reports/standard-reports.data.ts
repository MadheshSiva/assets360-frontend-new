// Standard report types and option lists. Report records come from the reporting API (none are seeded here).
// Dates are local wall-clock times written as 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'.

function localIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The reporting "today" used by quick ranges, the calendar and the stat tiles. */
export const SR_TODAY = localIsoDay(new Date());

/** Default reporting period: the current calendar month. */
export function defaultReportPeriod(): ReportPeriod {
  const now = new Date();
  return {
    start: localIsoDay(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localIsoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    startTime: null,
    endTime: null,
    timeZone: 'Asia/Dubai'
  };
}

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
