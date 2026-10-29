import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Calendar, Download, File, FileText, Funnel, LucideAngularModule, Plus, Search, Upload } from 'lucide-angular';
import { AnalyticsPage, CURRENT_USER } from '../shared/analytics-common';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import { ReportBuilder } from './report-builder/report-builder';
import { ReportConfig } from './report-config/report-config';
import { LibrarySort, ReportLibrary } from './report-library/report-library';
import { DATA_SOURCES, RA_MODULES, SCHEDULES, VISIBILITIES, blankDefinition } from './custom-reports.data';
import { applySource } from './custom-reports.engine';
import { Aggregate, CalcOperator, CustomReport, FilterOperator, ReportStatus, ReportVisibility, VizType } from './custom-reports.model';
import { CustomReportsService, cloneReport, dubaiNow } from './custom-reports.service';

type UpdatedRange = 'any' | '1' | '7' | '30' | 'older';

const MAX_IMPORT_BYTES = 1_000_000;
const NOT_SCHEDULED = SCHEDULES[0];
const CALC_OPS: CalcOperator[] = ['+', '-', '×', '÷'];
const AGGREGATES: Aggregate[] = ['Sum', 'Average', 'Min', 'Max'];
const VIZ_TYPES: VizType[] = ['Table', 'Bar', 'Line', 'Donut'];

/** Reports & Analytics > Custom Reports */
@Component({
  selector: 'app-ra-custom-reports',
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportLibrary, ReportBuilder, ReportConfig, ConfirmDialog],
  templateUrl: './custom-reports.html',
  styleUrls: ['../shared/analytics-page.css', './custom-reports.css']
})
export class CustomReportsPage extends AnalyticsPage {
  private readonly service = inject(CustomReportsService);
  @ViewChild(ReportBuilder) builder?: ReportBuilder;
  @ViewChild('builderAnchor') builderAnchor?: ElementRef<HTMLElement>;
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  readonly icons = { FileText, Funnel, Calendar, File, Plus, Upload, Download, Search };
  readonly modules = RA_MODULES;
  readonly statuses: ReportStatus[] = ['Draft', 'Published', 'Scheduled'];
  readonly updatedRanges: { key: UpdatedRange; label: string }[] = [
    { key: 'any', label: 'Any time' },
    { key: '1', label: 'Last 24 hours' },
    { key: '7', label: 'Last 7 days' },
    { key: '30', label: 'Last 30 days' },
    { key: 'older', label: 'Older than 30 days' }
  ];

  // Filters
  search = '';
  owner = '';
  module = '';
  status: '' | ReportStatus = '';
  updated: UpdatedRange = 'any';
  librarySort: LibrarySort = 'updated';
  filtered: CustomReport[] = [];
  owners: string[] = [];

  /** The report in the builder (a working copy until saved) */
  draft: CustomReport;
  showErrors = false;
  confirmDelete: CustomReport | null = null;

  constructor() {
    super();
    this.draft = cloneReport(this.service.reports[0]);
    this.refilter();
  }

  get stats() {
    return this.service.stats;
  }

  get nameError(): string {
    const n = this.draft.name.trim();
    if (!n) return 'Report name is required.';
    if (n.length < 3) return 'Use at least 3 characters.';
    if (this.service.isNameTaken(n, this.draft.id)) return 'Another custom report already uses this name.';
    return '';
  }

  // ----- Library -----

  refilter(): void {
    const q = this.search.trim().toLowerCase();
    const now = new Date(`${dubaiNow()}:00Z`).getTime();
    const list = this.service.reports.filter((r) => {
      if (q && !`${r.name} ${r.description} ${r.owner} ${r.module}`.toLowerCase().includes(q)) return false;
      if (this.owner && r.owner !== this.owner) return false;
      if (this.module && r.module !== this.module) return false;
      if (this.status && r.status !== this.status) return false;
      if (this.updated !== 'any') {
        const days = (now - new Date(`${r.updatedAt}:00Z`).getTime()) / 86_400_000;
        if (this.updated === 'older' ? days <= 30 : days > Number(this.updated)) return false;
      }
      return true;
    });
    const byUpdated = (a: CustomReport, b: CustomReport) => b.updatedAt.localeCompare(a.updatedAt);
    if (this.librarySort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (this.librarySort === 'favourites') list.sort((a, b) => Number(b.favourite) - Number(a.favourite) || byUpdated(a, b));
    else list.sort(byUpdated);
    this.filtered = list;
    this.owners = [...new Set(this.service.reports.map((r) => r.owner))].sort();
  }

  get hasFilters(): boolean {
    return !!(this.search || this.owner || this.module || this.status || this.updated !== 'any');
  }

  clearFilters(): void {
    this.search = '';
    this.owner = '';
    this.module = '';
    this.status = '';
    this.updated = 'any';
    this.refilter();
  }

  setSort(sort: LibrarySort): void {
    this.librarySort = sort;
    this.refilter();
  }

  openReport(r: CustomReport): void {
    this.draft = cloneReport(r);
    this.showErrors = false;
    this.builder?.goTo(1);
    this.notify(`“${r.name}” opened in the Report Builder.`);
  }

  toggleFavourite(r: CustomReport): void {
    this.service.toggleFavourite(r.id);
    if (this.draft.id === r.id) this.draft.favourite = r.favourite;
    this.refilter();
    this.notify(r.favourite ? `“${r.name}” added to favourites.` : `“${r.name}” removed from favourites.`);
  }

  duplicate(r: CustomReport): void {
    const copy = this.service.duplicate(r.id);
    if (!copy) return;
    this.refilter();
    this.notify(`Duplicated as “${copy.name}” (draft).`);
  }

  askDelete(r: CustomReport): void {
    this.confirmDelete = r;
  }

  confirmRemove(): void {
    const r = this.confirmDelete;
    this.confirmDelete = null;
    if (!r) return;
    this.service.remove(r.id);
    if (this.draft.id === r.id) this.newReport(false);
    this.refilter();
    this.notify(`“${r.name}” deleted.`);
  }

  togglePublish(r: CustomReport): void {
    if (r.status === 'Published') {
      const next: ReportStatus = r.schedule !== NOT_SCHEDULED ? 'Scheduled' : 'Draft';
      this.service.setStatus(r.id, next);
      this.notify(`“${r.name}” unpublished (${next}).`);
    } else {
      if (!r.fields.length) {
        this.notify(`“${r.name}” has no fields yet — open it in the builder before publishing.`);
        return;
      }
      this.service.setStatus(r.id, 'Published');
      this.notify(`“${r.name}” published (${audience(r.visibility)}).`);
    }
    if (this.draft.id === r.id) {
      this.draft.status = r.status;
      this.draft.updatedAt = r.updatedAt;
    }
    this.refilter();
  }

  // ----- Builder + configuration -----

  newReport(announce = true): void {
    this.draft = this.service.blank();
    this.showErrors = false;
    this.builder?.goTo(0);
    if (announce) {
      this.builderAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.notify('New blank report — start by choosing a data source.');
    }
  }

  private store(status: ReportStatus, message: string): void {
    this.draft.name = this.draft.name.trim();
    this.draft.status = status;
    const stored = this.service.save(this.draft);
    this.draft = cloneReport(stored);
    this.showErrors = false;
    this.refilter();
    this.notify(message);
  }

  /** A draft only needs a valid name. */
  saveDraft(): void {
    this.showErrors = true;
    if (this.nameError) {
      this.notify(this.nameError);
      return;
    }
    this.store('Draft', `“${this.draft.name.trim()}” saved as a draft.`);
  }

  /** Save / publish need a valid name, at least one field and complete filters. */
  private validateAll(): boolean {
    this.showErrors = true;
    const problem = this.nameError || (this.draft.fields.length ? '' : 'Select at least one field.') || this.builder?.firstProblem || '';
    if (problem) {
      this.notify(problem);
      return false;
    }
    return true;
  }

  saveReport(): void {
    if (!this.validateAll()) return;
    const scheduled = this.draft.schedule !== NOT_SCHEDULED;
    const status: ReportStatus = scheduled ? 'Scheduled' : this.draft.status === 'Published' ? 'Published' : 'Draft';
    const name = this.draft.name.trim();
    this.store(status, scheduled ? `“${name}” saved and scheduled (${this.draft.schedule}).` : `“${name}” saved.`);
  }

  publish(): void {
    if (!this.validateAll()) return;
    const name = this.draft.name.trim();
    if (this.draft.status === 'Published') {
      this.store(this.draft.schedule !== NOT_SCHEDULED ? 'Scheduled' : 'Draft', `“${name}” unpublished.`);
    } else {
      this.store('Published', `“${name}” published (${audience(this.draft.visibility)}).`);
    }
  }

  previewReport(): void {
    this.builder?.goTo(5);
    this.builderAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- Import / export -----

  chooseImport(): void {
    this.importInput?.nativeElement.click();
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      this.notify('Choose a .json report template.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.notify('Template is larger than 1 MB.');
      return;
    }
    file.text().then((text) => this.importText(text), () => this.notify('The file could not be read.'));
  }

  private importText(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.notify('The file is not valid JSON.');
      return;
    }
    const raw: unknown[] = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed['reports']) ? parsed['reports'] : [parsed];
    const reports = raw.map((r) => this.fromTemplate(r)).filter((r): r is CustomReport => !!r);
    if (!reports.length) {
      this.notify('No valid report templates found (each needs a name and a known data source).');
      return;
    }
    const added = this.service.importReports(reports);
    const skipped = raw.length - added;
    this.refilter();
    this.notify(`Imported ${added} template${added === 1 ? '' : 's'} as draft${skipped ? `; ${skipped} skipped` : ''}.`);
  }

  /** Copies only known properties and values from an imported template. */
  private fromTemplate(value: unknown): CustomReport | null {
    if (!isRecord(value)) return null;
    const name = str(value['name']).trim().slice(0, 80);
    const sourceKey = str(value['sourceKey']);
    if (!name || !DATA_SOURCES.some((s) => s.key === sourceKey)) return null;

    const r = this.service.blank();
    r.name = name;
    r.description = str(value['description']).slice(0, 300);
    const visibility = VISIBILITIES.find((v) => v === value['visibility']);
    if (visibility) r.visibility = visibility;
    const schedule = SCHEDULES.find((s) => s === value['schedule']);
    if (schedule) r.schedule = schedule;

    const def = blankDefinition(sourceKey);
    def.calcFields = list(value['calcFields']).flatMap((c) => {
      const op = CALC_OPS.find((o) => o === c['op']);
      const key = str(c['key']);
      return op && key.startsWith('calc:') && str(c['label'])
        ? [{ key, label: str(c['label']).slice(0, 60), left: str(c['left']), op, right: str(c['right']) }]
        : [];
    });
    def.fields = Array.isArray(value['fields']) ? (value['fields'] as unknown[]).filter((f): f is string => typeof f === 'string') : [];
    def.filters = list(value['filters']).map((f) => ({ field: str(f['field']), op: (str(f['op']) || 'equals') as FilterOperator, value: str(f['value']).slice(0, 100) }));
    def.groupBy = str(value['groupBy']);
    def.sortBy = str(value['sortBy']);
    def.sortDir = value['sortDir'] === 'asc' ? 'asc' : 'desc';
    def.aggregate = AGGREGATES.find((a) => a === value['aggregate']) ?? 'Sum';
    def.rowLimit = [10, 25, 50, 100].includes(Number(value['rowLimit'])) ? Number(value['rowLimit']) : 25;
    def.viz = VIZ_TYPES.find((v) => v === value['viz']) ?? 'Table';
    def.chartValue = str(value['chartValue']);
    // Drop fields, filters and grouping the data source doesn't have
    applySource(def, sourceKey);
    return { ...r, ...def };
  }

  exportReports(): void {
    const reports = this.filtered;
    if (!reports.length) {
      this.notify('No reports to export with the current filters.');
      return;
    }
    const payload = {
      exportedAt: dubaiNow(),
      exportedBy: CURRENT_USER.name,
      reports: reports.map((r) => ({
        name: r.name, description: r.description, module: r.module, status: r.status, owner: r.owner, visibility: r.visibility,
        schedule: r.schedule, sourceKey: r.sourceKey, fields: r.fields, calcFields: r.calcFields, filters: r.filters, groupBy: r.groupBy,
        aggregate: r.aggregate, sortBy: r.sortBy, sortDir: r.sortDir, rowLimit: r.rowLimit, viz: r.viz, chartValue: r.chartValue
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-reports-${dubaiNow().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`Exported ${reports.length} report${reports.length === 1 ? '' : 's'} as JSON (current filters).`);
  }
}

function audience(v: ReportVisibility): string {
  return v === 'Only me' ? 'visible to you only' : v === 'My team' ? 'visible to your team' : 'visible to the organization';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}
