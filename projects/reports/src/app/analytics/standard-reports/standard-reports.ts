import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Box, CalendarClock, CalendarDays, CircleDollarSign, ClipboardCheck, Ellipsis, Eye, Factory,
  FileCheck, FileText, Funnel, LucideAngularModule, MapPin, Package, Radio, RefreshCw, Search, ShieldCheck, Upload, Wrench, X
} from 'lucide-angular';
import { AnalyticsPage, downloadCsv } from '../shared/analytics-common';
import { CustomReportsService } from '../custom-reports/custom-reports.service';
import { ReportCalendar } from './report-calendar';
import { ReportScheduleDialog } from './report-schedule-dialog';
import { ReportViewerDialog } from './report-viewer-dialog';
import { ReportingPeriodPanel } from './reporting-period-panel';
import { ReportFrequency, ReportModule, ReportPeriod, ReportSchedule, ReportStatus, SR_DEFAULT_TIME_ZONE, StandardReport } from './standard-reports.data';
import { ReportListQuery, ReportSortField, SR_MAX_PAGE_SIZE, StandardReportsService } from './standard-reports.service';
import { formatDay, formatPeriod, formatStamp, parseDay } from './standard-reports.util';

type SortKey = 'name' | 'module' | 'period' | 'generatedOn' | 'nextScheduled' | 'frequency' | 'status';

const PAGE_SIZE = 10;

const MODULE_STYLE: Record<ReportModule, { icon: typeof Box; tone: string }> = {
  Assets: { icon: Box, tone: 'green' },
  'Tracking & IoT': { icon: Radio, tone: 'blue' },
  'Movement & Custody': { icon: MapPin, tone: 'purple' },
  Maintenance: { icon: Wrench, tone: 'orange' },
  Inspection: { icon: ClipboardCheck, tone: 'purple' },
  Inventory: { icon: Package, tone: 'blue' },
  'WIP / Operations': { icon: Factory, tone: 'blue' },
  'Audit & Compliance': { icon: ShieldCheck, tone: 'pink' },
  'Contracts & Warranty': { icon: FileCheck, tone: 'pink' },
  Financial: { icon: CircleDollarSign, tone: 'orange' }
};

const STATUS_TONES: Record<ReportStatus, string> = { Ready: 'green', Scheduled: 'blue', 'Needs review': 'pink', Draft: 'orange' };
const FREQUENCY_TONES: Record<ReportFrequency, string> = {
  Daily: 'green', Weekly: 'blue', Monthly: 'blue', Quarterly: 'purple', Yearly: 'purple', 'On demand': 'purple'
};

/** Table column → sortBy accepted by GET /api/standard-reports. */
const SORT_FIELDS: Record<SortKey, ReportSortField> = {
  name: 'reportName',
  module: 'category',
  period: 'reportPeriod',
  generatedOn: 'generatedOn',
  nextScheduled: 'nextScheduled',
  frequency: 'frequency',
  status: 'status'
};

const NO_PERIOD: ReportPeriod = { start: '', end: '', startTime: null, endTime: null, timeZone: SR_DEFAULT_TIME_ZONE };

/** Reports & Analytics > Standard Reports: reporting period, report calendar and the standard report catalogue. */
@Component({
  selector: 'app-ra-standard-reports',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportingPeriodPanel, ReportCalendar, ReportViewerDialog, ReportScheduleDialog],
  templateUrl: './standard-reports.html',
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class StandardReportsPage extends AnalyticsPage implements OnInit {
  readonly service = inject(StandardReportsService);
  private readonly customReports = inject(CustomReportsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly icons = { FileText, Funnel, CalendarDays, RefreshCw, Search, Eye, CalendarClock, Upload, Ellipsis, X };
  readonly columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Report Name' },
    { key: 'module', label: 'Category' },
    { key: 'period', label: 'Report Period' },
    { key: 'generatedOn', label: 'Generated On' },
    { key: 'nextScheduled', label: 'Next Scheduled' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'status', label: 'Status' }
  ];

  /** Summary, calendar and "today" are read in this zone. */
  readonly timeZone = SR_DEFAULT_TIME_ZONE;

  search = '';
  dayFilter: string | null = null;
  sortKey: SortKey = 'name';
  sortDir: 1 | -1 = 1;
  page = 1;
  menuId: string | null = null;
  viewing: StandardReport | null = null;
  scheduling: StandardReport | null = null;
  applying = false;
  savingSchedule = false;
  /** The period shown in the panel: the one stored on the reports (every report shares the applied period). */
  reportingPeriod: ReportPeriod = NO_PERIOD;

  private calendarMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
  private listSub: Subscription | null = null;
  private calendarSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // The schedule dialog falls back to its built-in frequencies if /options is unavailable
    this.service.loadOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
    this.service.loadToday(this.timeZone).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (today) => {
        const t = parseDay(today);
        this.calendarMonth = { year: t.getFullYear(), month: t.getMonth() };
        this.loadCalendar();
      },
      error: () => this.loadCalendar()
    });
    this.loadSummary();
    this.loadList();
    this.updatedMinutes = 0;
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  // ===== Stat tiles (GET /summary) =====
  get total(): number {
    return this.service.summary().totalReports;
  }

  get withDateFilters(): number {
    return this.service.summary().withDateFilters;
  }

  get scheduledCount(): number {
    return this.service.summary().scheduled;
  }

  get updatedThisMonth(): number {
    return this.service.summary().updatedThisMonth;
  }

  // ===== Table =====
  /**
   * Rows for the picked calendar day. The API has no generated/scheduled-on-day filter, so while a day is
   * picked the page loads up to SR_MAX_PAGE_SIZE matching reports and filters and pages them here.
   */
  private get dayRows(): StandardReport[] {
    const day = this.dayFilter;
    if (!day) return this.service.reports();
    return this.service.reports().filter((r) => (r.generatedOn ?? '').startsWith(day) || (r.nextScheduled ?? '').startsWith(day));
  }

  private get rowCount(): number {
    return this.dayFilter ? this.dayRows.length : this.service.totalCount();
  }

  get loading(): boolean {
    return this.service.loading();
  }

  get loadError(): string | null {
    return this.service.error();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rowCount / PAGE_SIZE));
  }

  get currentPage(): number {
    return Math.min(this.page, this.pageCount);
  }

  get pageRows(): StandardReport[] {
    if (!this.dayFilter) return this.service.reports();
    return this.dayRows.slice((this.currentPage - 1) * PAGE_SIZE, this.currentPage * PAGE_SIZE);
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i + 1);
  }

  get rangeText(): string {
    const n = this.rowCount;
    if (n === 0) return '0 reports';
    return `${(this.currentPage - 1) * PAGE_SIZE + 1}–${Math.min(this.currentPage * PAGE_SIZE, n)} of ${n} reports`;
  }

  get dayFilterText(): string {
    return this.dayFilter ? formatDay(this.dayFilter) : '';
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 1 ? -1 : 1;
    } else {
      this.sortKey = key;
      this.sortDir = 1;
    }
    this.loadList();
  }

  sortIcon(key: SortKey): typeof ArrowUp {
    return this.sortKey !== key ? ArrowUpDown : this.sortDir === 1 ? ArrowUp : ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  searchChanged(): void {
    this.page = 1;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadList(), 300);
  }

  goTo(page: number): void {
    const next = Math.min(Math.max(1, page), this.pageCount);
    if (next === this.currentPage) return;
    this.page = next;
    // With a day picked all matching rows are already loaded
    if (!this.dayFilter) this.loadList();
  }

  selectDay(day: string | null): void {
    this.dayFilter = day;
    this.page = 1;
    this.loadList();
  }

  calendarMoved(month: { year: number; month: number }): void {
    this.calendarMonth = month;
    this.loadCalendar();
  }

  // ===== Display helpers =====
  moduleIcon(r: StandardReport): typeof Box {
    return (MODULE_STYLE[r.module] ?? MODULE_STYLE.Assets).icon;
  }

  moduleTone(r: StandardReport): string {
    return (MODULE_STYLE[r.module] ?? MODULE_STYLE.Assets).tone;
  }

  statusTone(r: StandardReport): string {
    return STATUS_TONES[r.status];
  }

  frequencyTone(r: StandardReport): string {
    return FREQUENCY_TONES[r.frequency];
  }

  periodText(r: StandardReport): string {
    return formatPeriod(r.period);
  }

  stamp(value: string | null): string {
    return formatStamp(value);
  }

  // ===== Data =====
  override refresh(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.listSub?.unsubscribe();
    forkJoin([
      this.service.loadSummary(this.timeZone),
      this.service.loadCalendar(this.calendarMonth.year, this.calendarMonth.month, this.timeZone),
      this.service.loadReports(this.listQuery())
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshing = false;
          this.updatedMinutes = 0;
          this.syncPeriod();
          this.notify('Data refreshed.');
        },
        error: (err: Error) => {
          this.refreshing = false;
          this.notify(err.message);
        }
      });
  }

  private listQuery(): ReportListQuery {
    return {
      search: this.search,
      sortBy: SORT_FIELDS[this.sortKey],
      sortDirection: this.sortDir === 1 ? 'asc' : 'desc',
      page: this.dayFilter ? 1 : this.page,
      pageSize: this.dayFilter ? SR_MAX_PAGE_SIZE : PAGE_SIZE
    };
  }

  /** GET /api/standard-reports for the current search, sort and page. A newer call cancels an older one. */
  private loadList(): void {
    this.listSub?.unsubscribe();
    this.listSub = this.service
      .loadReports(this.listQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.syncPeriod();
          // The last page can disappear after a delete elsewhere; step back to the new last page
          if (!this.dayFilter && this.page > this.pageCount) {
            this.page = this.pageCount;
            this.loadList();
          }
        },
        error: (err: Error) => this.notify(err.message)
      });
  }

  private loadSummary(): void {
    this.service.loadSummary(this.timeZone).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: (err: Error) => this.notify(err.message) });
  }

  private loadCalendar(): void {
    this.calendarSub?.unsubscribe();
    this.calendarSub = this.service
      .loadCalendar(this.calendarMonth.year, this.calendarMonth.month, this.timeZone)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: (err: Error) => this.notify(err.message) });
  }

  /** Show the period stored on the loaded reports; keep the panel's object when nothing changed so edits are not reset. */
  private syncPeriod(): void {
    const stored = this.service.reports().find((r) => r.period.start)?.period;
    if (stored && JSON.stringify(stored) !== JSON.stringify(this.reportingPeriod)) this.reportingPeriod = { ...stored };
  }

  // ===== Actions =====
  applyPeriod(period: ReportPeriod): void {
    if (this.applying) return;
    this.applying = true;
    this.service.applyPeriod(period).subscribe({
      next: (count) => {
        this.applying = false;
        this.reportingPeriod = { ...period };
        this.notify(`Reporting period ${formatPeriod(period)} applied to ${count} reports.`);
        this.loadList();
        this.loadSummary();
      },
      error: (err: Error) => {
        this.applying = false;
        this.notify(err.message);
      }
    });
  }

  view(r: StandardReport): void {
    this.menuId = null;
    this.viewing = r;
  }

  openSchedule(r: StandardReport): void {
    this.menuId = null;
    this.scheduling = r;
  }

  saveSchedule(schedule: ReportSchedule): void {
    if (!this.scheduling || this.savingSchedule) return;
    this.savingSchedule = true;
    this.service.saveSchedule(this.scheduling, schedule).subscribe({
      next: (updated) => {
        this.savingSchedule = false;
        this.scheduling = null;
        this.notify(`“${updated.name}” scheduled ${schedule.frequency.toLowerCase()}, next run ${formatStamp(updated.nextScheduled)}.`);
        this.loadSummary();
        this.loadCalendar();
      },
      // Keep the dialog open so the user can correct and retry
      error: (err: Error) => {
        this.savingSchedule = false;
        this.notify(err.message);
      }
    });
  }

  /** Downloads one report's output (GET /{id}/output) as CSV. The API's /export covers the table listing. */
  exportCsv(r: StandardReport): void {
    this.service.output(r).subscribe({
      next: (out) => {
        const rows = this.service.outputRows(out);
        const dimension = out.dimension === 'category' ? 'Category' : out.dimension === 'site' ? 'Site' : 'Month';
        const file = `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${out.periodFrom}_${out.periodTo}.csv`;
        downloadCsv(file, [dimension, out.measure, 'Formatted', out.unit === 'percent' ? 'vs. average' : 'Share'], rows.map((x) => [x.label, x.value, x.display, x.share]));
        this.notify(`Exported “${r.name}” as CSV.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.menuId = this.menuId === id ? null : id;
  }

  runNow(r: StandardReport): void {
    this.menuId = null;
    this.service.runNow(r.id).subscribe({
      next: (updated) => {
        this.notify(`“${updated.name}” generated ${formatStamp(updated.generatedOn)}.`);
        this.loadSummary();
        this.loadCalendar();
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // Copies into Custom Reports through that page's service (not part of the standard reports API)
  duplicate(r: StandardReport): void {
    this.menuId = null;
    const name = this.customReports.addFromStandard({ name: r.name, module: r.module, description: r.description });
    this.notify(`Copied to Custom Reports as draft “${name}”.`);
  }

  markReviewed(r: StandardReport): void {
    this.menuId = null;
    if (r.status !== 'Needs review') return;
    this.service.markReviewed(r).subscribe({
      next: (updated) => {
        this.notify(`“${updated.name}” marked as reviewed.`);
        this.loadSummary();
        this.loadCalendar();
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuId = null;
  }

  @HostListener('document:keydown.escape')
  closeDialogs(): void {
    this.menuId = null;
    this.viewing = null;
    this.scheduling = null;
  }
}
