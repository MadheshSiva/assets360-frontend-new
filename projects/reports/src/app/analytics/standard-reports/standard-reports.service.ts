import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, expand, forkJoin, map, of, reduce, switchMap, tap, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { money, percent } from '../shared/analytics-common';
import {
  CalendarCounts, ReportFormat, ReportOutput, ReportFrequency, ReportModule, ReportPeriod, ReportSchedule, ReportStatus, SR_DEFAULT_TIME_ZONE,
  SR_SCHEDULE_FREQUENCIES, StandardReport
} from './standard-reports.data';
import { isoDay, nextRun, zonedParts } from './standard-reports.util';

/** A report output row ready for the viewer table and the CSV. */
export interface PreviewRow {
  label: string;
  value: number;
  display: string;
  /** Share of the total (count / money), or the gap to the average in points (percent) */
  share: string;
}

/** Raw report as returned by /api/standard-reports. Dates are UTC. */
interface StandardReportDto {
  reportId: string;
  reportName: string;
  description: string | null;
  category: string;
  reportPeriodFrom: string | null;
  reportPeriodTo: string | null;
  timeZone: string;
  includeTime: boolean;
  hasDateFilter: boolean;
  generatedOn: string | null;
  nextScheduledOn: string | null;
  frequency: string;
  reviewDueOn: string | null;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
}

interface StandardReportListDto {
  items: StandardReportDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface StandardReportSummaryDto {
  totalReports: number;
  withDateFilters: number;
  scheduled: number;
  updatedThisMonth: number;
}

interface StandardReportCalendarDto {
  year: number;
  month: number;
  timeZone: string;
  days: { date: string; generated: number; scheduled: number; reviewDue: number }[];
}

interface StandardReportOptionsDto {
  categories: string[];
  frequencies: string[];
  statuses: string[];
  periodPresets: string[];
  sortFields: string[];
  exportFormats: string[];
  defaultTimeZone: string;
}

interface ReportPeriodDto {
  preset: string;
  from: string;
  to: string;
  timeZone: string;
}

interface ApplyReportPeriodDto {
  updatedCount: number;
  notFound: string[];
}

/** Body of PUT /api/standard-reports/{reportId}. Dates ending in 'Z' are taken as UTC by the API. */
interface UpdateStandardReportRequest {
  reportName: string;
  description: string | null;
  category: string;
  reportPeriodFrom: string | null;
  reportPeriodTo: string | null;
  timeZone: string;
  includeTime: boolean;
  frequency: string;
  nextScheduledOn: string | null;
  reviewDueOn: string | null;
  status: string | null;
  updatedBy: string | null;
}

export type ReportSortField = 'reportName' | 'category' | 'reportPeriod' | 'generatedOn' | 'nextScheduled' | 'frequency' | 'status';

export interface ReportListQuery {
  search: string;
  sortBy: ReportSortField;
  sortDirection: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface ReportSummary {
  totalReports: number;
  withDateFilters: number;
  scheduled: number;
  updatedThisMonth: number;
}

/** Largest page the list endpoint returns. */
export const SR_MAX_PAGE_SIZE = 200;
/** PUT /report-period accepts at most this many ids per call. */
const MAX_APPLY_IDS = 500;

const STATUSES: ReportStatus[] = ['Ready', 'Scheduled', 'Needs review', 'Draft'];
const FREQUENCIES: ReportFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'On demand'];

function stamp(utc: string | null, timeZone: string): string | null {
  if (!utc) return null;
  const p = zonedParts(utc, timeZone);
  return `${p.date}T${p.time}`;
}

function toPeriod(dto: StandardReportDto): ReportPeriod {
  const timeZone = dto.timeZone || 'UTC';
  if (!dto.reportPeriodFrom || !dto.reportPeriodTo) return { start: '', end: '', startTime: null, endTime: null, timeZone };
  const from = zonedParts(dto.reportPeriodFrom, timeZone);
  const to = zonedParts(dto.reportPeriodTo, timeZone);
  return {
    start: from.date,
    end: to.date,
    startTime: dto.includeTime ? from.time : null,
    endTime: dto.includeTime ? to.time : null,
    timeZone
  };
}

function errorMessage(err: HttpErrorResponse): string {
  const errors = err.error?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (err.status === 404) return 'This report no longer exists.';
  return err.error?.message || err.error?.title || 'The reporting service could not be reached.';
}

function fail(err: unknown): Observable<never> {
  return throwError(() => (err instanceof HttpErrorResponse ? new Error(errorMessage(err)) : err));
}

/** Standard reports, served by the Reports & Analytics API (/api/standard-reports). */
@Injectable({ providedIn: 'root' })
export class StandardReportsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/standard-reports`;

  /** Rows from the last list call (one page, or up to SR_MAX_PAGE_SIZE rows while a calendar day is picked). */
  readonly reports = signal<StandardReport[]>([]);
  /** Total matching the last list call, across all pages. */
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<ReportSummary>({ totalReports: 0, withDateFilters: 0, scheduled: 0, updatedThisMonth: 0 });
  readonly calendarDays = signal<Record<string, CalendarCounts>>({});
  /** "Today" in the page time zone, as resolved by the API. */
  readonly today = signal(isoDay(new Date()));
  /** Frequencies offered in the schedule dialog: the API's /options limited to those the dialog can schedule. */
  readonly scheduleFrequencies = signal<ReportFrequency[]>(SR_SCHEDULE_FREQUENCIES);

  /** Raw DTOs of the loaded rows, kept so updates can send the stored UTC values back unchanged. */
  private readonly dtos = new Map<string, StandardReportDto>();

  // Client-side only: the API stores a schedule's frequency and next run, not its recipients or output
  // format, so these are remembered for this session.
  private readonly delivery = new Map<string, { recipients: string[]; format: ReportFormat }>();

  /** GET /options. */
  loadOptions(): Observable<void> {
    return this.http.get<StandardReportOptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const supported = SR_SCHEDULE_FREQUENCIES.filter((f) => dto.frequencies.includes(f));
        if (supported.length) this.scheduleFrequencies.set(supported);
      }),
      catchError(fail)
    );
  }

  /** GET /period?preset=Today, which sets today. */
  loadToday(timeZone = SR_DEFAULT_TIME_ZONE): Observable<string> {
    return this.resolvePeriod('Today', timeZone).pipe(
      map((range) => {
        this.today.set(range.start);
        return range.start;
      })
    );
  }

  /** GET /period: a quick range button (Today, This week, …) resolved to dates in the zone. */
  resolvePeriod(preset: string, timeZone: string): Observable<{ start: string; end: string }> {
    const params = new HttpParams().set('preset', preset).set('timeZone', timeZone);
    return this.http.get<ReportPeriodDto>(`${this.apiUrl}/period`, { params }).pipe(
      map((dto) => ({ start: dto.from, end: dto.to })),
      catchError(fail)
    );
  }

  /** GET /summary: the four stat tiles. */
  loadSummary(timeZone = SR_DEFAULT_TIME_ZONE): Observable<ReportSummary> {
    return this.http.get<StandardReportSummaryDto>(`${this.apiUrl}/summary`, { params: this.scope().set('timeZone', timeZone) }).pipe(
      tap((dto) => this.summary.set(dto)),
      catchError(fail)
    );
  }

  /** GET /calendar for a month (0-based, like Date). */
  loadCalendar(year: number, month: number, timeZone = SR_DEFAULT_TIME_ZONE): Observable<Record<string, CalendarCounts>> {
    const params = this.scope().set('year', year).set('month', month + 1).set('timeZone', timeZone);
    return this.http.get<StandardReportCalendarDto>(`${this.apiUrl}/calendar`, { params }).pipe(
      map((dto) => {
        const days: Record<string, CalendarCounts> = {};
        for (const d of dto.days) days[d.date] = { generated: d.generated, scheduled: d.scheduled, review: d.reviewDue };
        this.calendarDays.set(days);
        return days;
      }),
      catchError(fail)
    );
  }

  /** GET the paged list with search and sort. Replaces the loaded rows on success. */
  loadReports(query: ReportListQuery): Observable<StandardReport[]> {
    this.loading.set(true);
    this.error.set(null);
    return this.http.get<StandardReportListDto>(this.apiUrl, { params: this.listParams(query) }).pipe(
      map((dto) => {
        this.dtos.clear();
        dto.items.forEach((d) => this.dtos.set(d.reportId, d));
        const rows = dto.items.map((d) => this.toReport(d));
        this.reports.set(rows);
        this.totalCount.set(dto.totalCount);
        this.loading.set(false);
        return rows;
      }),
      catchError((err: HttpErrorResponse) => {
        const message = errorMessage(err);
        this.loading.set(false);
        this.error.set(message);
        return throwError(() => new Error(message));
      })
    );
  }

  /**
   * Apply the reporting period to every report: collects all report ids from the list, then
   * PUT /report-period (in batches of 500). Returns how many reports were updated.
   */
  applyPeriod(period: ReportPeriod): Observable<number> {
    const timed = !!(period.startTime && period.endTime);
    const from = timed ? `${period.start}T${period.startTime}:00` : period.start;
    const to = timed ? `${period.end}T${period.endTime}:00` : period.end;
    return this.allReportIds().pipe(
      switchMap((ids) => {
        if (!ids.length) return of(0);
        const batches: string[][] = [];
        for (let i = 0; i < ids.length; i += MAX_APPLY_IDS) batches.push(ids.slice(i, i + MAX_APPLY_IDS));
        return forkJoin(
          batches.map((reportIds) =>
            this.http.put<ApplyReportPeriodDto>(`${this.apiUrl}/report-period`, {
              reportIds,
              reportPeriodFrom: from,
              reportPeriodTo: to,
              timeZone: period.timeZone,
              includeTime: timed,
              updatedBy: this.auth.getUserEmail()
            })
          )
        ).pipe(map((results) => results.reduce((n, r) => n + r.updatedCount, 0)));
      }),
      catchError(fail)
    );
  }

  /** PUT /{reportId}/schedule. The next run is worked out here from the dialog's day and time. */
  saveSchedule(report: StandardReport, schedule: ReportSchedule): Observable<StandardReport> {
    const body = {
      frequency: schedule.frequency,
      // Wall-clock time without an offset: the API reads it in timeZone
      nextScheduledOn: `${nextRun(schedule, this.today())}:00`,
      timeZone: report.period.timeZone,
      updatedBy: this.auth.getUserEmail()
    };
    return this.http.put<StandardReportDto>(`${this.apiUrl}/${encodeURIComponent(report.id)}/schedule`, body).pipe(
      map((dto) => {
        this.delivery.set(dto.reportId, { recipients: [...schedule.recipients], format: schedule.format });
        return this.replace(dto);
      }),
      catchError(fail)
    );
  }

  /** POST /{reportId}/generate: records a run now. */
  runNow(id: string): Observable<StandardReport> {
    return this.http.post<StandardReportDto>(`${this.apiUrl}/${encodeURIComponent(id)}/generate`, null).pipe(
      map((dto) => this.replace(dto)),
      catchError(fail)
    );
  }

  /** PUT /{reportId} with the stored values, clearing the review date and setting the status back. */
  markReviewed(report: StandardReport): Observable<StandardReport> {
    const dto = this.dtos.get(report.id);
    if (!dto) return throwError(() => new Error('Refresh the page and try again.'));
    const body: UpdateStandardReportRequest = {
      reportName: dto.reportName,
      description: dto.description,
      category: dto.category,
      reportPeriodFrom: dto.reportPeriodFrom,
      reportPeriodTo: dto.reportPeriodTo,
      timeZone: dto.timeZone,
      includeTime: dto.includeTime,
      frequency: dto.frequency,
      nextScheduledOn: dto.nextScheduledOn,
      reviewDueOn: null,
      status: dto.nextScheduledOn ? 'Scheduled' : 'Ready',
      updatedBy: this.auth.getUserEmail()
    };
    return this.http.put<StandardReportDto>(`${this.apiUrl}/${encodeURIComponent(report.id)}`, body).pipe(
      map((saved) => this.replace(saved)),
      catchError(fail)
    );
  }

  /** GET /{id}/output: the report's measure broken down by category, site or month, read live over the report's period. */
  output(report: StandardReport): Observable<ReportOutput> {
    return this.http.get<ReportOutput>(`${this.apiUrl}/${encodeURIComponent(report.id)}/output`).pipe(catchError(fail));
  }

  /** Table / CSV rows of an output: formatted value plus share of the total, or the gap to the average for rates. */
  outputRows(output: ReportOutput): PreviewRow[] {
    return output.rows.map((r) => {
      let share = '—';
      if (output.unit === 'percent') {
        if (output.total !== null) {
          const gap = Math.round((r.value - output.total) * 10) / 10;
          share = `${gap >= 0 ? '+' : ''}${gap} pts`;
        }
      } else if (r.share !== null) {
        share = percent(r.share);
      }
      return { label: r.label, value: r.value, display: this.formatValue(output.unit, r.value), share };
    });
  }

  formatValue(unit: ReportOutput['unit'], value: number | null): string {
    if (value === null) return '—';
    switch (unit) {
      case 'money':
        return money(value);
      case 'percent':
        return percent(value);
      default:
        return value.toLocaleString('en-US');
    }
  }

  /** Swaps a saved report into the loaded rows. */
  private replace(dto: StandardReportDto): StandardReport {
    this.dtos.set(dto.reportId, dto);
    const saved = this.toReport(dto);
    this.reports.update((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
    return saved;
  }

  private toReport(dto: StandardReportDto): StandardReport {
    const timeZone = dto.timeZone || 'UTC';
    const frequency = FREQUENCIES.includes(dto.frequency as ReportFrequency) ? (dto.frequency as ReportFrequency) : 'On demand';
    const nextScheduled = stamp(dto.nextScheduledOn, timeZone);
    const module = dto.category as ReportModule;
    const delivery = this.delivery.get(dto.reportId);
    let schedule: ReportSchedule | null = null;
    if (nextScheduled && frequency !== 'On demand') {
      // The API keeps only the next run; the dialog's day and time are read back from it
      const [y, m, d] = nextScheduled.slice(0, 10).split('-').map(Number);
      schedule = {
        frequency,
        day: frequency === 'Weekly' ? new Date(y, m - 1, d).getDay() : Math.min(d, 28),
        time: nextScheduled.slice(11, 16),
        recipients: delivery ? [...delivery.recipients] : [],
        format: delivery?.format ?? 'PDF'
      };
    }
    return {
      id: dto.reportId,
      name: dto.reportName,
      module,
      description: dto.description ?? '',
      owner: dto.createdBy ?? '',
      period: toPeriod(dto),
      generatedOn: stamp(dto.generatedOn, timeZone),
      nextScheduled,
      reviewDue: dto.reviewDueOn ? zonedParts(dto.reviewDueOn, timeZone).date : null,
      frequency,
      status: STATUSES.includes(dto.status as ReportStatus) ? (dto.status as ReportStatus) : 'Draft',
      hasDateFilter: dto.hasDateFilter,
      updatedOn: (dto.updatedAt ?? dto.createdAt ?? '').slice(0, 10),
      schedule
    };
  }

  /** Every report id in this tenant, read page by page. */
  private allReportIds(): Observable<string[]> {
    const fetch = (page: number) =>
      this.http.get<StandardReportListDto>(this.apiUrl, {
        params: this.scope().set('page', page).set('pageSize', SR_MAX_PAGE_SIZE)
      });
    return fetch(1).pipe(
      expand((res) => (res.page * res.pageSize < res.totalCount && res.items.length ? fetch(res.page + 1) : EMPTY)),
      reduce((ids, res) => ids.concat(res.items.map((r) => r.reportId)), [] as string[])
    );
  }

  private listParams(q: ReportListQuery): HttpParams {
    let params = this.scope()
      .set('sortBy', q.sortBy)
      .set('sortDirection', q.sortDirection)
      .set('page', q.page)
      .set('pageSize', q.pageSize);
    if (q.search.trim()) params = params.set('search', q.search.trim());
    return params;
  }

  private scope(): HttpParams {
    return new HttpParams().set('tenantId', environment.tenantId).set('clientId', environment.clientId);
  }
}
