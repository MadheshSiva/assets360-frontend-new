import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
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

/** Query parameters of GET {reportAnalyticsApiUrl}api/standard-reports. */
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

/** Request body of POST {reportAnalyticsApiUrl}api/standard-reports. */
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

/** Report record as returned by the API (the response schema is not published, so every field is optional). */
type StandardReportDto = Record<string, unknown>;

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

/** Standard reports loaded from the Report Analytics API. */
@Injectable({ providedIn: 'root' })
export class StandardReportsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/standard-reports`;

  /** Reports on the current page. */
  reports: StandardReport[] = [];
  /** Total matching reports on the server (all pages). */
  totalCount = 0;
  /** The applied reporting period (sent as periodFrom / periodTo). */
  period: ReportPeriod = defaultReportPeriod();

  get today(): string {
    return SR_TODAY;
  }

  find(id: string): StandardReport | undefined {
    return this.reports.find((r) => r.id === id);
  }

  /** GET /api/standard-reports with filters, sorting and paging. */
  load(query: StandardReportQuery): Observable<StandardReport[]> {
    let params = new HttpParams().set('tenantId', environment.tenantId).set('clientId', environment.clientId);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    return this.http.get<unknown>(this.apiUrl, { params }).pipe(
      map((body) => {
        const { items, total } = unwrapList(body);
        return { reports: items.map((dto) => this.toReport(dto)), total };
      }),
      tap(({ reports, total }) => {
        this.reports = reports;
        this.totalCount = total ?? reports.length;
      }),
      map(({ reports }) => reports)
    );
  }

  /** POST /api/standard-reports; emits the created report. */
  create(form: NewStandardReport): Observable<StandardReport> {
    const p = form.period;
    const includeTime = !!(p.startTime && p.endTime);
    const request: CreateStandardReportRequest = {
      reportName: form.name.trim(),
      description: form.description.trim(),
      category: form.module,
      reportPeriodFrom: toApiDate(p.start, p.startTime ?? '00:00'),
      reportPeriodTo: toApiDate(p.end, p.endTime ?? '23:59'),
      timeZone: p.timeZone,
      includeTime,
      frequency: form.frequency,
      nextScheduledOn: form.nextScheduled ? toApiDate(form.nextScheduled.slice(0, 10), form.nextScheduled.slice(11, 16) || '00:00') : null,
      reviewDueOn: form.reviewDue ? toApiDate(form.reviewDue, '00:00') : null,
      status: form.status,
      createdBy: this.auth.getUserEmail() || CURRENT_USER.email || 'unknown',
      tenantId: environment.tenantId,
      clientId: environment.clientId,
      reportType: form.reportType.trim()
    };
    return this.http.post<StandardReportDto>(this.apiUrl, request).pipe(
      map((dto) => this.toReport({ ...request, ...(dto && typeof dto === 'object' ? dto : {}) }))
    );
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

/** Accepts a bare array or a paged envelope ({ items | data | results | records, totalCount | total }). */
function unwrapList(body: unknown): { items: StandardReportDto[]; total: number | null } {
  if (Array.isArray(body)) return { items: body as StandardReportDto[], total: null };
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'records', 'reports']) {
      const v = o[key];
      if (Array.isArray(v)) {
        const total = Number(o['totalCount'] ?? o['total'] ?? o['totalItems'] ?? o['totalRecords'] ?? NaN);
        return { items: v as StandardReportDto[], total: Number.isFinite(total) ? total : null };
      }
      // { data: { items, totalCount } }
      if (v && typeof v === 'object' && !Array.isArray(v)) return unwrapList(v);
    }
  }
  return { items: [], total: 0 };
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
