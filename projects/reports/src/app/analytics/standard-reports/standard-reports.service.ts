import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { money, percent } from '../shared/analytics-common';
import {
  CalendarCounts, ReportFormat, ReportOutput, ReportPeriod, ReportSchedule, SR_CATEGORIES, SR_DEFAULT_RECIPIENTS, SR_DEFAULT_TIME_ZONE,
  SR_SCHEDULE_FREQUENCIES, SR_SEEDS, SR_SITES, StandardReport, StandardReportSeed
} from './standard-reports.data';
import { addDays, isoDay, nextRun, pad, parseDay, zonedParts } from './standard-reports.util';

/** A report output row ready for the viewer table and the CSV. */
export interface PreviewRow {
  label: string;
  value: number;
  display: string;
  /** Share of the total (count / money), or the gap to the average in points (percent) */
  share: string;
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

/** Largest page the list returns. */
export const SR_MAX_PAGE_SIZE = 200;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Wall-clock 'YYYY-MM-DD' and 'HH:mm' now in a time zone. */
function nowIn(timeZone: string): { date: string; time: string } {
  return zonedParts(new Date().toISOString(), timeZone);
}

/** Deterministic pseudo-random numbers per report, so figures are stable between views. */
function seeded(text: string): () => number {
  let a = [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86_400_000) + 1;
}

/** Schedule dialog values read back from the next run. */
function scheduleFrom(r: Pick<StandardReport, 'frequency' | 'nextScheduled'>, recipients: string[], format: ReportFormat): ReportSchedule | null {
  if (!r.nextScheduled || !SR_SCHEDULE_FREQUENCIES.includes(r.frequency)) return null;
  const d = parseDay(r.nextScheduled);
  return {
    frequency: r.frequency,
    day: r.frequency === 'Weekly' ? d.getDay() : Math.min(d.getDate(), 28),
    time: r.nextScheduled.slice(11, 16),
    recipients: [...recipients],
    format
  };
}

/** Standard reports for the static demo: seeded catalogue kept in memory, outputs generated in the browser. */
@Injectable({ providedIn: 'root' })
export class StandardReportsService {
  /** Rows from the last list call (one page, or up to SR_MAX_PAGE_SIZE rows while a calendar day is picked). */
  readonly reports = signal<StandardReport[]>([]);
  /** Total matching the last list call, across all pages. */
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<ReportSummary>({ totalReports: 0, withDateFilters: 0, scheduled: 0, updatedThisMonth: 0 });
  readonly calendarDays = signal<Record<string, CalendarCounts>>({});
  /** "Today" in the page time zone. */
  readonly today = signal(nowIn(SR_DEFAULT_TIME_ZONE).date);
  /** Frequencies offered in the schedule dialog. */
  readonly scheduleFrequencies = signal(SR_SCHEDULE_FREQUENCIES);

  /** Every report (the in-memory store). */
  private store: StandardReport[] = this.seed();

  loadOptions(): Observable<void> {
    return of(undefined);
  }

  /** Sets today in the zone. */
  loadToday(timeZone = SR_DEFAULT_TIME_ZONE): Observable<string> {
    const today = nowIn(timeZone).date;
    this.today.set(today);
    return of(today);
  }

  /** A quick range button (Today, This week, …) resolved to dates in the zone. */
  resolvePeriod(preset: string, timeZone: string): Observable<{ start: string; end: string }> {
    const today = nowIn(timeZone).date;
    const d = parseDay(today);
    const y = d.getFullYear();
    const m = d.getMonth();
    switch (preset) {
      case 'Today':
        return of({ start: today, end: today });
      case 'This week': {
        // Weeks start on Monday
        const start = addDays(today, -((d.getDay() + 6) % 7));
        return of({ start, end: addDays(start, 6) });
      }
      case 'This month':
        return of({ start: isoDay(new Date(y, m, 1)), end: isoDay(new Date(y, m + 1, 0)) });
      case 'This quarter': {
        const q = m - (m % 3);
        return of({ start: isoDay(new Date(y, q, 1)), end: isoDay(new Date(y, q + 3, 0)) });
      }
      case 'This year':
        return of({ start: `${y}-01-01`, end: `${y}-12-31` });
      default:
        return throwError(() => new Error(`Unknown period “${preset}”.`));
    }
  }

  /** The four stat tiles. */
  loadSummary(timeZone = SR_DEFAULT_TIME_ZONE): Observable<ReportSummary> {
    const month = nowIn(timeZone).date.slice(0, 7);
    const summary: ReportSummary = {
      totalReports: this.store.length,
      withDateFilters: this.store.filter((r) => r.hasDateFilter).length,
      scheduled: this.store.filter((r) => !!r.nextScheduled).length,
      updatedThisMonth: this.store.filter((r) => r.updatedOn.startsWith(month)).length
    };
    this.summary.set(summary);
    return of(summary);
  }

  /** Generated, scheduled and review-due markers for a month (0-based, like Date). */
  loadCalendar(year: number, month: number, _timeZone = SR_DEFAULT_TIME_ZONE): Observable<Record<string, CalendarCounts>> {
    const prefix = `${year}-${pad(month + 1)}`;
    const days: Record<string, CalendarCounts> = {};
    const bump = (day: string | null, key: keyof CalendarCounts) => {
      if (!day || !day.startsWith(prefix)) return;
      const k = day.slice(0, 10);
      days[k] ??= { generated: 0, scheduled: 0, review: 0 };
      days[k][key]++;
    };
    for (const r of this.store) {
      bump(r.generatedOn, 'generated');
      bump(r.nextScheduled, 'scheduled');
      bump(r.reviewDue, 'review');
    }
    this.calendarDays.set(days);
    return of(days);
  }

  /** The list with search, sort and paging. Replaces the loaded rows. */
  loadReports(query: ReportListQuery): Observable<StandardReport[]> {
    this.loading.set(true);
    this.error.set(null);
    const search = query.search.trim().toLowerCase();
    const matching = this.store.filter(
      (r) => !search || [r.name, r.module, r.description, r.owner].some((v) => v.toLowerCase().includes(search))
    );
    const dir = query.sortDirection === 'desc' ? -1 : 1;
    const key = (r: StandardReport): string => {
      switch (query.sortBy) {
        case 'category': return r.module;
        case 'reportPeriod': return r.period.start;
        case 'generatedOn': return r.generatedOn ?? '';
        case 'nextScheduled': return r.nextScheduled ?? '';
        case 'frequency': return r.frequency;
        case 'status': return r.status;
        default: return r.name;
      }
    };
    matching.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      // Empty values last in either direction, then by name
      if (!x || !y) return x === y ? a.name.localeCompare(b.name) : x ? -1 : 1;
      return x.localeCompare(y) * dir || a.name.localeCompare(b.name);
    });
    const size = Math.max(1, Math.min(query.pageSize, SR_MAX_PAGE_SIZE));
    const rows = matching.slice((query.page - 1) * size, query.page * size).map((r) => this.copy(r));
    this.reports.set(rows);
    this.totalCount.set(matching.length);
    this.loading.set(false);
    return of(rows);
  }

  /** Applies the reporting period to every report with a date filter. Returns how many reports were updated. */
  applyPeriod(period: ReportPeriod): Observable<number> {
    const timed = !!(period.startTime && period.endTime);
    const today = this.today();
    let count = 0;
    this.store = this.store.map((r) => {
      if (!r.hasDateFilter) return r;
      count++;
      return {
        ...r,
        period: { ...period, startTime: timed ? period.startTime : null, endTime: timed ? period.endTime : null },
        updatedOn: today
      };
    });
    return of(count);
  }

  /** Stores the schedule; the next run is worked out from the dialog's day and time. */
  saveSchedule(report: StandardReport, schedule: ReportSchedule): Observable<StandardReport> {
    return this.update(report.id, (r) => {
      r.frequency = schedule.frequency;
      r.nextScheduled = nextRun(schedule, this.today());
      r.schedule = { ...schedule, recipients: [...schedule.recipients] };
      if (r.status !== 'Needs review') r.status = 'Scheduled';
      r.updatedOn = this.today();
    });
  }

  /** Records a run now. */
  runNow(id: string): Observable<StandardReport> {
    return this.update(id, (r) => {
      const now = nowIn(r.period.timeZone || SR_DEFAULT_TIME_ZONE);
      r.generatedOn = `${now.date}T${now.time}`;
      if (r.status === 'Draft') r.status = r.nextScheduled ? 'Scheduled' : 'Ready';
    });
  }

  /** Clears the review date and sets the status back. */
  markReviewed(report: StandardReport): Observable<StandardReport> {
    return this.update(report.id, (r) => {
      r.reviewDue = null;
      r.status = r.nextScheduled ? 'Scheduled' : 'Ready';
      r.updatedOn = this.today();
    });
  }

  /** The report's measure broken down by category, site or month over the report's period. */
  output(report: StandardReport): Observable<ReportOutput> {
    const stored = this.store.find((r) => r.id === report.id);
    const seed = SR_SEEDS.find((s) => s.id === report.id);
    if (!stored || !seed) return throwError(() => new Error('This report no longer exists.'));
    return of(this.buildOutput(stored, seed));
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

  // ----- Helpers -----

  private copy(r: StandardReport): StandardReport {
    return JSON.parse(JSON.stringify(r)) as StandardReport;
  }

  /** Changes a stored report and swaps it into the loaded rows. */
  private update(id: string, edit: (r: StandardReport) => void): Observable<StandardReport> {
    const found = this.store.find((r) => r.id === id);
    if (!found) return throwError(() => new Error('This report no longer exists.'));
    const next = this.copy(found);
    edit(next);
    this.store = this.store.map((r) => (r.id === id ? next : r));
    const saved = this.copy(next);
    this.reports.update((rows) => rows.map((r) => (r.id === id ? saved : r)));
    return of(this.copy(next));
  }

  private seed(): StandardReport[] {
    const today = nowIn(SR_DEFAULT_TIME_ZONE).date;
    const t = parseDay(today);
    const period: ReportPeriod = {
      start: isoDay(new Date(t.getFullYear(), t.getMonth(), 1)),
      end: isoDay(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
      startTime: null,
      endTime: null,
      timeZone: SR_DEFAULT_TIME_ZONE
    };
    return SR_SEEDS.map((s: StandardReportSeed) => {
      const nextScheduled = s.next ? `${addDays(today, s.next[0])}T${s.next[1]}` : null;
      const report: StandardReport = {
        id: s.id,
        name: s.name,
        module: s.module,
        description: s.description,
        owner: s.owner,
        period: s.hasDateFilter ? { ...period } : { start: '', end: '', startTime: null, endTime: null, timeZone: SR_DEFAULT_TIME_ZONE },
        generatedOn: s.generated ? `${addDays(today, -s.generated[0])}T${s.generated[1]}` : null,
        nextScheduled,
        reviewDue: s.review === null ? null : addDays(today, s.review),
        frequency: s.frequency,
        status: s.status,
        hasDateFilter: s.hasDateFilter,
        updatedOn: addDays(today, -s.updated),
        schedule: null
      };
      report.schedule = scheduleFrom(report, SR_DEFAULT_RECIPIENTS, s.module === 'Financial' ? 'Excel' : 'PDF');
      return report;
    });
  }

  private buildOutput(r: StandardReport, seed: StandardReportSeed): ReportOutput {
    const spec = seed.output;
    const timeZone = r.period.timeZone || SR_DEFAULT_TIME_ZONE;
    const today = nowIn(timeZone).date;
    const defaultPeriod = !r.period.start || !r.period.end;
    const periodFrom = defaultPeriod ? `${today.slice(0, 4)}-01-01` : r.period.start;
    const periodTo = defaultPeriod ? today : r.period.end;
    const rnd = seeded(`${r.id}|${periodFrom}|${periodTo}`);

    let labels: string[];
    if (spec.dimension === 'category') labels = SR_CATEGORIES;
    else if (spec.dimension === 'site') labels = SR_SITES;
    else {
      // Months of the period, or the six months up to its end for short periods (at most twelve)
      const end = parseDay(periodTo);
      const start = parseDay(periodFrom);
      let count = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
      count = Math.min(12, count < 3 ? 6 : count);
      labels = Array.from({ length: count }, (_, i) => {
        const d = new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1);
        return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      });
    }

    // Counts and amounts scale with the period length (base is per 30 days); a monthly row is one month
    const scale = spec.unit === 'percent' || spec.dimension === 'month' ? 1 : Math.max(1, daysBetween(periodFrom, periodTo)) / 30;
    const values = labels.map((_, i) => {
      const trend = spec.dimension === 'month' ? 1 + (i - labels.length / 2) * 0.015 : 1;
      const v = spec.base * trend * (1 + (rnd() * 2 - 1) * spec.spread) * scale;
      if (spec.unit === 'percent') return Math.min(100, Math.round(v * 10) / 10);
      if (spec.unit === 'money') return Math.round(v / 100) * 100;
      return Math.max(0, Math.round(v));
    });

    const sum = values.reduce((a, b) => a + b, 0);
    const average = spec.aggregate === 'average';
    const total = values.length ? (average ? Math.round((sum / values.length) * 10) / 10 : sum) : null;
    let rows = labels.map((label, i) => ({
      label,
      value: values[i],
      share: average || !sum ? null : Math.round((values[i] / sum) * 1000) / 10
    }));
    if (spec.dimension !== 'month') rows = rows.sort((a, b) => b.value - a.value);

    return {
      reportId: r.id,
      measure: spec.measure,
      dimension: spec.dimension,
      unit: spec.unit,
      total,
      aggregate: spec.aggregate,
      periodFrom,
      periodTo,
      timeZone,
      defaultPeriod,
      rows,
      note: spec.note ?? null,
      generatedAt: new Date().toISOString()
    };
  }
}
