import { Component, HostListener, inject } from '@angular/core';
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
import { ReportFrequency, ReportModule, ReportPeriod, ReportSchedule, ReportStatus, StandardReport } from './standard-reports.data';
import { StandardReportsService } from './standard-reports.service';
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
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportingPeriodPanel, ReportCalendar, ReportViewerDialog, ReportScheduleDialog],
  templateUrl: './standard-reports.html',
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class StandardReportsPage extends AnalyticsPage {
  readonly service = inject(StandardReportsService);
  private readonly customReports = inject(CustomReportsService);

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

  search = '';
  dayFilter: string | null = null;
  sortKey: SortKey = 'name';
  sortDir: 1 | -1 = 1;
  page = 1;
  menuId: string | null = null;
  viewing: StandardReport | null = null;
  scheduling: StandardReport | null = null;

  // ===== Stat tiles =====
  get total(): number {
    return this.service.reports.length;
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
    return this.service.reports[0].period;
  }

  // ===== Table =====
  get filtered(): StandardReport[] {
    const q = this.search.trim().toLowerCase();
    const day = this.dayFilter;
    const rows = this.service.reports.filter((r) => {
      if (q && !`${r.name} ${r.module} ${r.status} ${r.frequency} ${r.owner}`.toLowerCase().includes(q)) return false;
      if (day && !r.generatedOn.startsWith(day) && !(r.nextScheduled ?? '').startsWith(day)) return false;
      return true;
    });
    return rows.sort((a, b) => this.sortValue(a).localeCompare(this.sortValue(b)) * this.sortDir);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get currentPage(): number {
    return Math.min(this.page, this.pageCount);
  }

  get pageRows(): StandardReport[] {
    return this.filtered.slice((this.currentPage - 1) * PAGE_SIZE, this.currentPage * PAGE_SIZE);
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i + 1);
  }

  get rangeText(): string {
    const n = this.filtered.length;
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
  }

  sortIcon(key: SortKey): typeof ArrowUp {
    return this.sortKey !== key ? ArrowUpDown : this.sortDir === 1 ? ArrowUp : ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  searchChanged(): void {
    this.page = 1;
  }

  goTo(page: number): void {
    this.page = Math.min(Math.max(1, page), this.pageCount);
  }

  selectDay(day: string | null): void {
    this.dayFilter = day;
    this.page = 1;
  }

  // ===== Display helpers =====
  moduleIcon(r: StandardReport): typeof Box {
    return MODULE_STYLE[r.module].icon;
  }

  moduleTone(r: StandardReport): string {
    return MODULE_STYLE[r.module].tone;
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

  // ===== Actions =====
  applyPeriod(period: ReportPeriod): void {
    this.service.applyPeriod(period);
    this.notify(`Reporting period ${formatPeriod(period)} applied to ${this.total} reports.`);
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
