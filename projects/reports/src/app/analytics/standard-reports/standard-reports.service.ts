import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { AuthService } from 'shared-ui';
import { CURRENT_USER, money, percent } from '../shared/analytics-common';
import {
  ReportFrequency, ReportModule, ReportPeriod, ReportSchedule, ReportStatus, SR_MODULES, SR_STATUSES, SR_TODAY, StandardReport,
  defaultReportPeriod
} from './standard-reports.data';
import { nextRun, pad } from './standard-reports.util';

export interface PreviewRow {
  label: string;
  value: number;
  display: string;
  /** Share of the total (count / money / hours), or the gap to the average (percent) */
  share: string;
}

/** Filters, sorting and paging for the report list. */
export interface StandardReportQuery {
  search?: string;
  category?: string;
  frequency?: string;
  status?: string;
  periodFrom?: string;
  periodTo?: string;
  timeZone?: string;
  includeTime?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Report fields in the shape the old API used. */
export interface CreateStandardReportRequest {
  reportName: string;
  description: string;
  category: string;
  reportPeriodFrom: string | null;
  reportPeriodTo: string | null;
  timeZone: string;
  includeTime: boolean;
  frequency: string;
  nextScheduledOn: string | null;
  reviewDueOn: string | null;
  status: string;
  createdBy: string;
  tenantId: string;
  clientId: string;
  reportType: string;
}

/** What the "New report" dialog collects. Dates are wall-clock 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'. */
export interface NewStandardReport {
  name: string;
  description: string;
  module: ReportModule;
  reportType: string;
  period: ReportPeriod;
  frequency: ReportFrequency;
  status: ReportStatus;
  nextScheduled: string | null;
  reviewDue: string | null;
}

/** Report record in the shape the old API used (every field optional). */
type StandardReportDto = Record<string, unknown>;

/** 'YYYY-MM-DDTHH:mm', n days from today, so the demo list always looks current. */
function daysFromToday(n: number, time = '08:00'): string {
  const d = new Date(`${SR_TODAY}T00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
}

/** Static demo reports. */
const SEED_REPORTS: StandardReportDto[] = [
  { reportId: 'SR-1001', reportName: 'Asset Register Summary', description: 'All registered assets by category, site and status.', category: 'Assets', reportType: 'Assets', frequency: 'Monthly', status: 'Ready', createdBy: 'priya.sharma@assets360.com', reportPeriodFrom: daysFromToday(-30, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-1, '07:30'), nextScheduledOn: daysFromToday(29), createdAt: daysFromToday(-90) },
  { reportId: 'SR-1002', reportName: 'Preventive Maintenance Compliance', description: 'PM work orders completed on time vs. scheduled.', category: 'Maintenance', reportType: 'Work orders', frequency: 'Weekly', status: 'Scheduled', createdBy: 'rahul.verma@assets360.com', reportPeriodFrom: daysFromToday(-7, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-7, '06:00'), nextScheduledOn: daysFromToday(1, '06:00'), createdAt: daysFromToday(-60) },
  { reportId: 'SR-1003', reportName: 'Inspection Findings by Site', description: 'Open and closed findings with severity breakdown.', category: 'Inspection', reportType: 'Findings', frequency: 'Monthly', status: 'Needs review', createdBy: 'anita.nair@assets360.com', reportPeriodFrom: daysFromToday(-30, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-2, '09:15'), reviewDueOn: daysFromToday(3, '00:00'), createdAt: daysFromToday(-45) },
  { reportId: 'SR-1004', reportName: 'Asset Depreciation Schedule', description: 'Book value and depreciation by asset class.', category: 'Financial', reportType: 'Depreciation', frequency: 'Quarterly', status: 'Ready', createdBy: 'vikram.iyer@assets360.com', reportPeriodFrom: daysFromToday(-90, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-5, '10:00'), nextScheduledOn: daysFromToday(85), createdAt: daysFromToday(-180) },
  { reportId: 'SR-1005', reportName: 'Spare Parts Stock Levels', description: 'Stock on hand, reorder points and stock-outs.', category: 'Inventory', reportType: 'Stock', frequency: 'Weekly', status: 'Scheduled', createdBy: 'meera.pillai@assets360.com', reportPeriodFrom: daysFromToday(-7, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-7, '05:30'), nextScheduledOn: daysFromToday(2, '05:30'), createdAt: daysFromToday(-30) },
  { reportId: 'SR-1006', reportName: 'Certificate Expiry Tracker', description: 'Compliance certificates expiring in the next 90 days.', category: 'Audit & Compliance', reportType: 'Certificates', frequency: 'Monthly', status: 'Ready', createdBy: 'arjun.menon@assets360.com', reportPeriodFrom: daysFromToday(0, '00:00'), reportPeriodTo: daysFromToday(90, '23:59'), generatedOn: daysFromToday(-3, '08:45'), nextScheduledOn: daysFromToday(27), createdAt: daysFromToday(-120) },
  { reportId: 'SR-1007', reportName: 'Production Throughput', description: 'Jobs completed, cycle time and delays by line.', category: 'WIP / Operations', reportType: 'Throughput', frequency: 'Daily', status: 'Ready', createdBy: 'karthik.raj@assets360.com', reportPeriodFrom: daysFromToday(-1, '00:00'), reportPeriodTo: daysFromToday(-1, '23:59'), generatedOn: daysFromToday(0, '06:00'), nextScheduledOn: daysFromToday(1, '06:00'), createdAt: daysFromToday(-20) },
  { reportId: 'SR-1008', reportName: 'IoT Device Health', description: 'Offline devices, battery levels and signal quality.', category: 'Tracking & IoT', reportType: 'Devices', frequency: 'Daily', status: 'Scheduled', createdBy: 'sneha.reddy@assets360.com', reportPeriodFrom: daysFromToday(-1, '00:00'), reportPeriodTo: daysFromToday(-1, '23:59'), generatedOn: daysFromToday(0, '05:00'), nextScheduledOn: daysFromToday(1, '05:00'), createdAt: daysFromToday(-15) },
  { reportId: 'SR-1009', reportName: 'Asset Movement Log', description: 'Transfers and custody changes between sites.', category: 'Movement & Custody', reportType: 'Transfers', frequency: 'Weekly', status: 'Draft', createdBy: 'rahul.verma@assets360.com', reportPeriodFrom: daysFromToday(-7, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), createdAt: daysFromToday(-2) },
  { reportId: 'SR-1010', reportName: 'Warranty Expiry Summary', description: 'Contracts and warranties ending this quarter.', category: 'Contracts & Warranty', reportType: 'Warranties', frequency: 'On demand', status: 'Ready', createdBy: 'priya.sharma@assets360.com', reportPeriodFrom: daysFromToday(-14, '00:00'), reportPeriodTo: daysFromToday(0, '23:59'), generatedOn: daysFromToday(-1, '16:20'), createdAt: daysFromToday(-10) }
];

const FREQUENCIES: ReportFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'On demand'];

/** Table column key → API sortBy field. */
export const SR_SORT_FIELDS: Record<string, string> = {
  name: 'reportName',
  module: 'category',
  period: 'reportPeriodFrom',
  generatedOn: 'generatedOn',
  nextScheduled: 'nextScheduledOn',
  frequency: 'frequency',
  status: 'status'
};

/** Standard reports (static demo data, kept in memory). */
@Injectable({ providedIn: 'root' })
export class StandardReportsService {
  private readonly auth = inject(AuthService);

  /** Reports on the current page. */
  reports: StandardReport[] = [];
  /** Total matching reports on the server (all pages). */
  totalCount = 0;
  /** The applied reporting period (sent as periodFrom / periodTo). */
  period: ReportPeriod = defaultReportPeriod();
  /** Every demo report (all pages); `reports` holds the current page. Built after `period`, which toReport uses. */
  private all: StandardReport[] = SEED_REPORTS.map((dto) => this.toReport(dto));

  get today(): string {
    return SR_TODAY;
  }

  find(id: string): StandardReport | undefined {
    return this.reports.find((r) => r.id === id);
  }

  /** Demo: filters, sorts and pages the static report list (no Report Analytics API). */
  load(query: StandardReportQuery): Observable<StandardReport[]> {
    const q = (query.search ?? '').trim().toLowerCase();
    let list = this.all.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)) &&
        (!query.category || r.module === query.category) &&
        (!query.frequency || r.frequency === query.frequency) &&
        (!query.status || r.status === query.status)
    );
    const field = Object.entries(SR_SORT_FIELDS).find(([, api]) => api === query.sortBy)?.[0] as keyof StandardReport | undefined;
    if (field) {
      const dir = query.sortDirection === 'desc' ? -1 : 1;
      const key = (r: StandardReport) => (field === 'period' ? r.period.start : String(r[field] ?? ''));
      list = [...list].sort((x, y) => key(x).localeCompare(key(y)) * dir);
    }
    this.totalCount = list.length;
    const size = query.pageSize ?? list.length;
    const page = Math.max(1, query.page ?? 1);
    this.reports = list.slice((page - 1) * size, page * size);
    return of(this.reports).pipe(delay(150));
  }

  /** Demo: adds the report to the in-memory list; emits the created report. */
  create(form: NewStandardReport): Observable<StandardReport> {
    const p = form.period;
    const includeTime = !!(p.startTime && p.endTime);
    const report = this.toReport({
      reportId: `SR-${String(this.all.length + 1001)}`,
      reportName: form.name.trim(),
      description: form.description.trim(),
      category: form.module,
      reportPeriodFrom: toApiDate(p.start, p.startTime ?? '00:00'),
      reportPeriodTo: toApiDate(p.end, p.endTime ?? '23:59'),
      timeZone: p.timeZone,
      includeTime,
      frequency: form.frequency,
      nextScheduledOn: form.nextScheduled ? toApiDate(form.nextScheduled.slice(0, 10), form.nextScheduled.slice(11, 16) || '00:00') : '',
      reviewDueOn: form.reviewDue ? toApiDate(form.reviewDue, '00:00') : '',
      status: form.status,
      createdBy: this.auth.getUserEmail() || CURRENT_USER.email || 'unknown',
      createdAt: `${SR_TODAY}T09:00`,
      reportType: form.reportType.trim()
    });
    this.all = [report, ...this.all];
    return of(report).pipe(delay(150));
  }
  /** Remember the applied reporting period; the page reloads with it. */
  applyPeriod(period: ReportPeriod): void {
    this.period = { ...period };
  }

  saveSchedule(id: string, schedule: ReportSchedule): StandardReport | undefined {
    return this.update(id, (r) => ({
      ...r,
      schedule: { ...schedule, recipients: [...schedule.recipients] },
      frequency: schedule.frequency,
      nextScheduled: nextRun(schedule, SR_TODAY),
      status: r.status === 'Needs review' ? r.status : 'Scheduled',
      updatedOn: SR_TODAY
    }));
  }

  runNow(id: string): StandardReport | undefined {
    const now = new Date();
    return this.update(id, (r) => ({
      ...r,
      generatedOn: `${SR_TODAY}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
      status: r.status === 'Needs review' ? r.status : 'Ready'
    }));
  }

  markReviewed(id: string): StandardReport | undefined {
    return this.update(id, (r) => ({ ...r, status: r.schedule ? 'Scheduled' : 'Ready', reviewDue: null, updatedOn: SR_TODAY }));
  }

  /** Breakdown rows for the viewer and CSV export. Empty until the reporting API supplies report data. */
  previewRows(_report: StandardReport): PreviewRow[] {
    return [];
  }

  formatValue(report: StandardReport, value: number): string {
    switch (report.preview.unit) {
      case 'money':
        return money(value);
      case 'percent':
        return percent(value);
      case 'hours':
        return `${value.toLocaleString('en-US')} h`;
      default:
        return value.toLocaleString('en-US');
    }
  }

  private update(id: string, change: (r: StandardReport) => StandardReport): StandardReport | undefined {
    let updated: StandardReport | undefined;
    this.reports = this.reports.map((r) => {
      if (r.id !== id) return r;
      updated = change(r);
      return updated;
    });
    return updated;
  }

  private toReport(dto: StandardReportDto): StandardReport {
    const from = str(dto, 'reportPeriodFrom', 'periodFrom');
    const to = str(dto, 'reportPeriodTo', 'periodTo');
    const includeTime = dto['includeTime'] === true;
    const updatedOn = str(dto, 'updatedAt', 'updatedOn', 'modifiedAt', 'createdAt', 'createdOn');
    return {
      id: str(dto, 'reportId', 'id', 'standardReportId') || `SR-${Math.random().toString(36).slice(2, 8)}`,
      name: str(dto, 'reportName', 'name') || 'Untitled report',
      module: pick(SR_MODULES, str(dto, 'category'), 'Assets'),
      description: str(dto, 'description'),
      owner: str(dto, 'owner', 'createdBy') || '—',
      period: {
        start: (from || this.period.start).slice(0, 10),
        end: (to || this.period.end).slice(0, 10),
        startTime: includeTime && from.length > 10 ? from.slice(11, 16) : null,
        endTime: includeTime && to.length > 10 ? to.slice(11, 16) : null,
        timeZone: str(dto, 'timeZone') || this.period.timeZone
      },
      generatedOn: wallClock(str(dto, 'generatedOn', 'lastGeneratedOn', 'generatedAt')) ?? '',
      nextScheduled: wallClock(str(dto, 'nextScheduledOn', 'nextScheduled')),
      reviewDue: wallClock(str(dto, 'reviewDueOn', 'reviewDue'))?.slice(0, 10) ?? null,
      frequency: pick(FREQUENCIES, str(dto, 'frequency'), 'On demand'),
      status: pick(SR_STATUSES, str(dto, 'status'), 'Draft'),
      hasDateFilter: !!(from || to),
      updatedOn: (wallClock(updatedOn) ?? '').slice(0, 10),
      schedule: null,
      preview: { dimension: 'category', measure: str(dto, 'reportType') || 'Records', unit: 'count', total: 0 }
    };
  }
}

function str(dto: StandardReportDto, ...keys: string[]): string {
  for (const k of keys) {
    const v = dto[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

/** Case-insensitive match against a known list ("needs_review" / "NeedsReview" → "Needs review"). */
function pick<T extends string>(list: readonly T[], value: string, fallback: T): T {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return list.find((x) => norm(x) === norm(value)) ?? fallback;
}

/** API timestamp → 'YYYY-MM-DDTHH:mm' (or 'YYYY-MM-DD'), as the wall-clock time that was stored. */
function wallClock(value: string): string | null {
  if (!value || value.startsWith('0001-01-01')) return null;
  return value.length > 10 ? value.slice(0, 16) : value.slice(0, 10);
}

/**
 * Wall-clock date/time → ISO string for the API. The report's time zone is sent separately (timeZone),
 * so the wall-clock value is written as-is with a 'Z' suffix and read back the same way.
 */
export function toApiDate(day: string, time: string): string {
  return `${day}T${time}:00.000Z`;
}
