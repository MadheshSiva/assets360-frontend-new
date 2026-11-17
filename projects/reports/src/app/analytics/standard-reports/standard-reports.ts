import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Box, CalendarClock, CalendarDays, CircleDollarSign, ClipboardCheck, Ellipsis, Eye, Factory,
  FileCheck, FileText, Funnel, LucideAngularModule, MapPin, Package, Plus, Radio, RefreshCw, Search, ShieldCheck, Upload, Wrench, X
} from 'lucide-angular';
import { AnalyticsPage, downloadCsv } from '../shared/analytics-common';
import { CustomReportsService } from '../custom-reports/custom-reports.service';
import { ReportCalendar } from './report-calendar';
import { ReportCreateDialog } from './report-create-dialog';
import { ReportScheduleDialog } from './report-schedule-dialog';
import { ReportViewerDialog } from './report-viewer-dialog';
import { ReportingPeriodPanel } from './reporting-period-panel';
import {
  ReportFrequency, ReportModule, ReportPeriod, ReportSchedule, ReportStatus, SR_MODULES, SR_STATUSES, StandardReport
} from './standard-reports.data';
import { NewStandardReport, SR_SORT_FIELDS, StandardReportsService, toApiDate } from './standard-reports.service';
import { formatDay, formatPeriod, formatStamp } from './standard-reports.util';

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
const FREQUENCY_TONES: Record<ReportFrequency, string> = { Daily: 'green', Weekly: 'blue', Monthly: 'blue', Quarterly: 'purple', 'On demand': 'purple' };
const FREQUENCY_ORDER: ReportFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'On demand'];

/** Reports & Analytics > Standard Reports: reporting period, report calendar and the standard report catalogue. */
@Component({
  selector: 'app-ra-standard-reports',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportingPeriodPanel, ReportCalendar, ReportViewerDialog, ReportScheduleDialog, ReportCreateDialog],
  templateUrl: './standard-reports.html',
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class StandardReportsPage extends AnalyticsPage implements OnInit, OnDestroy {
  readonly service = inject(StandardReportsService);
  private readonly customReports = inject(CustomReportsService);

  readonly icons = { FileText, Funnel, CalendarDays, RefreshCw, Search, Eye, CalendarClock, Upload, Ellipsis, X, Plus };
  readonly categoryOptions = SR_MODULES;
  readonly frequencyOptions = FREQUENCY_ORDER;
  readonly statusOptions = SR_STATUSES;
  readonly columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Report Name' },
    { key: 'module', label: 'Category' },
    { key: 'period', label: 'Report Period' },
    { key: 'generatedOn', label: 'Generated On' },
    { key: 'nextScheduled', label: 'Next Scheduled' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'status', label: 'Status' }
  ];

  search = '';
  dayFilter: string | null = null;
  sortKey: SortKey = 'name';
  sortDir: 1 | -1 = 1;
  page = 1;
  menuId: string | null = null;
  viewing: StandardReport | null = null;
  scheduling: StandardReport | null = null;

  // Server-side filters (GET /api/standard-reports)
  categoryFilter = '';
  frequencyFilter = '';
  statusFilter = '';
  loading = false;
  loadError = '';

  // New report dialog (POST /api/standard-reports)
  creating = false;
  saving = false;
  createError = '';

  private loadSub: Subscription | null = null;
  private readonly searchInput = new Subject<void>();
  private readonly searchSub = this.searchInput.pipe(debounceTime(300)).subscribe(() => this.load());

  ngOnInit(): void {
    this.load();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.searchSub.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  /** GET /api/standard-reports with the search, filters, period, sort and page. */
  load(): void {
    const p = this.service.period;
    const includeTime = !!(p.startTime && p.endTime);
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.loadSub = this.service
      .load({
        search: this.search.trim(),
        category: this.categoryFilter,
        frequency: this.frequencyFilter,
        status: this.statusFilter,
        periodFrom: toApiDate(p.start, p.startTime ?? '00:00'),
        periodTo: toApiDate(p.end, p.endTime ?? '23:59'),
        timeZone: p.timeZone,
        includeTime,
        sortBy: SR_SORT_FIELDS[this.sortKey],
        sortDirection: this.sortDir === 1 ? 'asc' : 'desc',
        page: this.page,
        pageSize: PAGE_SIZE
      })
      .subscribe({
        next: () => {
          this.loading = false;
          this.updatedMinutes = 0;
          // Page emptied (e.g. after a filter change): step back
          if (this.page > this.pageCount) {
            this.page = this.pageCount;
            this.load();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading = false;
          this.service.reports = [];
          this.service.totalCount = 0;
          this.loadError = apiMessage(err, 'Could not load standard reports.');
        }
      });
  }

  override refresh(): void {
    if (this.loading) return;
    this.load();
  }

  filterChanged(): void {
    this.page = 1;
    this.load();
  }

  openCreate(): void {
    this.createError = '';
    this.creating = true;
  }

  createReport(form: NewStandardReport): void {
    this.saving = true;
    this.createError = '';
    this.service.create(form).subscribe({
      next: (r) => {
        this.saving = false;
        this.creating = false;
        this.notify(`Report “${r.name}” created.`);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.createError = apiMessage(err, 'Could not create the report.');
      }
    });
  }

  // ===== Stat tiles =====
  get total(): number {
    return this.service.totalCount;
  }

  get withDateFilters(): number {
    return this.service.reports.filter((r) => r.hasDateFilter).length;
  }

  get scheduledCount(): number {
    return this.service.reports.filter((r) => r.status === 'Scheduled').length;
  }

  get updatedThisMonth(): number {
    const month = this.service.today.slice(0, 7);
    return this.service.reports.filter((r) => r.updatedOn.startsWith(month)).length;
  }

  /** Every report shares the applied reporting period. */
  get reportingPeriod(): ReportPeriod {
    return this.service.period;
  }

  // ===== Table =====
  /** Current server page, sorted the same way the API was asked to (keeps order if the API ignores sortBy). */
  get filtered(): StandardReport[] {
    const day = this.dayFilter;
    const rows = this.service.reports.filter((r) => !day || r.generatedOn.startsWith(day) || (r.nextScheduled ?? '').startsWith(day));
    return rows.sort((a, b) => this.sortValue(a).localeCompare(this.sortValue(b)) * this.sortDir);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.service.totalCount / PAGE_SIZE));
  }

  get currentPage(): number {
    return Math.min(this.page, this.pageCount);
  }

  get pageRows(): StandardReport[] {
    // The API may ignore paging and return everything: slice locally in that case
    const rows = this.filtered;
    return rows.length > PAGE_SIZE ? rows.slice((this.currentPage - 1) * PAGE_SIZE, this.currentPage * PAGE_SIZE) : rows;
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i + 1);
  }

  get rangeText(): string {
    const n = this.service.totalCount;
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
    this.page = 1;
    this.load();
  }

  sortIcon(key: SortKey): typeof ArrowUp {
    return this.sortKey !== key ? ArrowUpDown : this.sortDir === 1 ? ArrowUp : ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  searchChanged(): void {
    this.page = 1;
    this.searchInput.next();
  }

  goTo(page: number): void {
    const next = Math.min(Math.max(1, page), this.pageCount);
    if (next === this.page) return;
    this.page = next;
    // Reload unless the API returned every row at once (then the pager slices locally)
    if (this.service.reports.length <= PAGE_SIZE) this.load();
  }

  selectDay(day: string | null): void {
    this.dayFilter = day;
    this.page = 1;
  }

  // ===== Display helpers =====
  moduleIcon(r: StandardReport): typeof Box {
    return (MODULE_STYLE[r.module] ?? MODULE_STYLE.Assets).icon;
  }

  moduleTone(r: StandardReport): string {
    return (MODULE_STYLE[r.module] ?? MODULE_STYLE.Assets).tone;
  }

  statusTone(r: StandardReport): string {
    return STATUS_TONES[r.status] ?? 'purple';
  }

  frequencyTone(r: StandardReport): string {
    return FREQUENCY_TONES[r.frequency] ?? 'purple';
  }

  periodText(r: StandardReport): string {
    return formatPeriod(r.period);
  }

  stamp(value: string | null): string {
    return formatStamp(value);
  }

  // ===== Actions =====
  applyPeriod(period: ReportPeriod): void {
    this.service.applyPeriod(period);
    this.page = 1;
    this.load();
    this.notify(`Reporting period ${formatPeriod(period)} applied.`);
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
    if (!this.scheduling) return;
    const updated = this.service.saveSchedule(this.scheduling.id, schedule);
    this.scheduling = null;
    if (updated) this.notify(`“${updated.name}” scheduled ${schedule.frequency.toLowerCase()}, next run ${formatStamp(updated.nextScheduled)}.`);
  }

  exportCsv(r: StandardReport): void {
    const rows = this.service.previewRows(r);
    const dimension = r.preview.dimension === 'category' ? 'Asset category' : r.preview.dimension === 'site' ? 'Site' : 'Month';
    const file = `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${r.period.start}_${r.period.end}.csv`;
    downloadCsv(file, [dimension, r.preview.measure, 'Formatted', r.preview.unit === 'percent' ? 'vs. average' : 'Share'], rows.map((x) => [x.label, x.value, x.display, x.share]));
    this.notify(`Exported “${r.name}” as CSV.`);
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.menuId = this.menuId === id ? null : id;
  }

  runNow(r: StandardReport): void {
    this.menuId = null;
    const updated = this.service.runNow(r.id);
    if (updated) this.notify(`“${updated.name}” generated ${formatStamp(updated.generatedOn)}.`);
  }

  duplicate(r: StandardReport): void {
    this.menuId = null;
    const name = this.customReports.addFromStandard({ name: r.name, module: r.module, description: r.description });
    this.notify(`Copied to Custom Reports as draft “${name}”.`);
  }

  markReviewed(r: StandardReport): void {
    this.menuId = null;
    if (r.status !== 'Needs review') return;
    const updated = this.service.markReviewed(r.id);
    if (updated) this.notify(`“${updated.name}” marked as reviewed.`);
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
    if (!this.saving) this.creating = false;
  }

  private sortValue(r: StandardReport): string {
    switch (this.sortKey) {
      case 'module':
        return r.module;
      case 'period':
        return r.period.start + r.period.end;
      case 'generatedOn':
        return r.generatedOn;
      case 'nextScheduled':
        // Unscheduled reports sort last
        return r.nextScheduled ?? '9999';
      case 'frequency':
        return String(FREQUENCY_ORDER.indexOf(r.frequency));
      case 'status':
        return r.status;
      default:
        return r.name;
    }
  }
}

function apiMessage(err: HttpErrorResponse, fallback: string): string {
  if (err.status === 0) return `${fallback} The Report Analytics service is not reachable.`;
  if (err.status === 401) return 'Sign in to continue.';
  if (err.status === 403) return 'You do not have permission for standard reports.';
  const body = err.error as { message?: string; title?: string; errors?: Record<string, string[]> } | string | null;
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object') {
    const first = body.errors ? Object.values(body.errors).flat()[0] : '';
    return body.message || first || body.title || fallback;
  }
  return fallback;
}
