import { Injectable, signal } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { CURRENT_USER } from '../shared/admin-common';
import { downloadCsv } from '../shared/analytics-common';
import {
  ASSET_ROWS, DEFAULT_COPY_FIELDS, DEMO_OWNERS, FIELD_GROUP_SPECS, FieldGroupSpec, NOT_SCHEDULED, RA_MODULES, SOURCE_SPECS,
  STANDARD_COPY_FIELDS, SourceSpec, VISIBILITIES, blankDefinition, dubaiStamp, operatorsFor, scheduleOf, seedReports
} from './custom-reports.data';
import { EMPTY_CATALOG, formatCell, runReport, sourceKeyFor } from './custom-reports.engine';
import {
  CustomReport, CustomReportStats, DataSource, FieldDef, FieldGroup, PreviewResult, ReportCatalog, ReportDefinition, ReportOwner,
  ReportScheduleDto
} from './custom-reports.model';

/** Library filters. */
export interface LibraryQuery {
  search: string;
  ownerId: string;
  module: string;
  status: string;
  lastUpdated: string;
  sortBy: 'updatedAt' | 'reportName';
}

export interface ImportResult {
  created: number;
  failed: { name: string; message: string }[];
}

/** A report template as Export writes it and Import Template reads it. */
interface ReportTemplate {
  reportName: string;
  description?: string;
  module?: string;
  visibility?: string;
  definition?: Partial<ReportDefinition>;
}

const PREVIEW_MAX = 500;
const LAST_UPDATED_DAYS: Record<string, number> = { 'Today': 0, 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90 };

/** Current date-time in Asia/Dubai (UTC+4) as 'YYYY-MM-DDTHH:mm'. */
export function dubaiNow(): string {
  return dubaiStamp();
}

export function cloneReport(r: CustomReport): CustomReport {
  return JSON.parse(JSON.stringify(r)) as CustomReport;
}

function fileSlug(name: string): string {
  return name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'custom-report';
}

function sameSchedule(a: ReportScheduleDto, b: ReportScheduleDto): boolean {
  return a.frequency === b.frequency && (a.dayOfWeek ?? null) === (b.dayOfWeek ?? null)
    && (a.dayOfMonth ?? null) === (b.dayOfMonth ?? null) && (a.time ?? '08:00') === (b.time ?? '08:00');
}

/** Custom reports for the static demo: stored in memory and run in the browser against the demo asset rows. */
@Injectable({ providedIn: 'root' })
export class CustomReportsService {
  /** Every saved report (the in-memory store) */
  private store: CustomReport[] = seedReports();
  private nextId = 1013;

  /** Library rows for the current filters. */
  readonly reports = signal<CustomReport[]>([]);
  readonly stats = signal<CustomReportStats>({ total: 0, published: 0, scheduled: 0, drafts: 0 });
  readonly owners = signal<ReportOwner[]>([]);
  readonly modules = signal<string[]>(RA_MODULES);
  readonly lastUpdatedOptions = signal<string[]>(['Any time', 'Today', 'Last 7 days', 'Last 30 days', 'Last 90 days']);
  /** Data sources and fields of the builder. */
  readonly catalog = signal<ReportCatalog>(EMPTY_CATALOG);
  readonly loading = signal(false);

  // ----- Page furniture -----

  /** Modules and Last Updated ranges are static. */
  loadOptions(): Observable<void> {
    return of(undefined);
  }

  /** Source cards and the field tree. */
  loadCatalog(): Observable<ReportCatalog> {
    const catalog = buildCatalog(SOURCE_SPECS, FIELD_GROUP_SPECS);
    this.catalog.set(catalog);
    return of(catalog);
  }

  /** The four cards. */
  loadSummary(): Observable<CustomReportStats> {
    const all = this.store;
    const stats = {
      total: all.length,
      published: all.filter((r) => r.status === 'Published').length,
      scheduled: all.filter((r) => r.status === 'Scheduled').length,
      drafts: all.filter((r) => r.status === 'Draft').length
    };
    this.stats.set(stats);
    return of(stats);
  }

  /** Owner filter: everyone who owns a report. */
  loadOwners(): Observable<ReportOwner[]> {
    const ids = new Set(this.store.map((r) => r.ownerId));
    const owners = DEMO_OWNERS.filter((o) => ids.has(o.id)).map((o) => ({ ...o })).sort((a, b) => a.name.localeCompare(b.name));
    this.owners.set(owners);
    return of(owners);
  }

  // ----- Library -----

  /** The saved reports matching the library filters. */
  loadLibrary(query: LibraryQuery): Observable<CustomReport[]> {
    this.loading.set(true);
    const list = this.matching(query).map(cloneReport);
    this.reports.set(list);
    this.loading.set(false);
    return of(list);
  }

  /** The full report with its definition. */
  get(id: string): Observable<CustomReport> {
    const found = this.find(id);
    return found ? of(cloneReport(found)) : throwError(() => new Error('This custom report no longer exists.'));
  }

  isNameTaken(name: string, exceptId = ''): boolean {
    const n = name.trim().toLowerCase();
    return this.store.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === n);
  }

  /** "Name (copy)", "Name (copy 2)"… until free. */
  uniqueName(name: string, suffix = 'copy'): string {
    if (!this.isNameTaken(name)) return name;
    let i = 1;
    let candidate = `${name} (${suffix})`;
    while (this.isNameTaken(candidate)) candidate = `${name} (${suffix} ${++i})`;
    return candidate;
  }

  blank(): CustomReport {
    return {
      ...blankDefinition(sourceKeyFor(this.catalog(), ['assets'])),
      id: '',
      name: '',
      description: '',
      owner: CURRENT_USER.name,
      ownerId: CURRENT_USER.id,
      module: 'Assets',
      status: 'Draft',
      favourite: false,
      updatedAt: dubaiNow(),
      visibility: 'My team',
      schedule: NOT_SCHEDULED,
      scheduleDetail: null,
      canEdit: true,
      currentStep: 1,
      loaded: true
    };
  }

  /** Creates a report (always a Draft) or updates one. Returns the stored report. */
  save(report: CustomReport, step: number): Observable<CustomReport> {
    const existing = report.id ? this.find(report.id) : undefined;
    if (report.id && !existing) return throwError(() => new Error('This custom report no longer exists.'));
    if (existing && !existing.canEdit) return this.notOwner();
    const name = report.name.trim();
    if (!name) return throwError(() => new Error('Report name is required.'));
    const saved: CustomReport = {
      ...cloneReport(report),
      id: existing?.id ?? this.newId(),
      name,
      description: report.description.trim(),
      owner: existing?.owner ?? CURRENT_USER.name,
      ownerId: existing?.ownerId ?? CURRENT_USER.id,
      status: existing?.status ?? 'Draft',
      favourite: existing?.favourite ?? false,
      updatedAt: dubaiNow(),
      scheduleDetail: this.toSchedule(report),
      canEdit: true,
      currentStep: Math.max(1, Math.min(6, step)),
      loaded: true
    };
    // A report without a schedule cannot stay Scheduled
    if (saved.status === 'Scheduled' && !saved.scheduleDetail) saved.status = 'Published';
    return of(this.put(saved));
  }

  /** Published, or Scheduled when the report has a schedule. */
  publish(id: string): Observable<CustomReport> {
    return this.change(id, (r) => {
      if (!r.fields.length) throw new Error('Select at least one field before publishing.');
      r.status = r.schedule !== NOT_SCHEDULED ? 'Scheduled' : 'Published';
    });
  }

  /** Back to Draft (a schedule is kept but stops running). */
  unpublish(id: string): Observable<CustomReport> {
    return this.change(id, (r) => (r.status = 'Draft'));
  }

  /** A new Draft owned by the current user. */
  duplicate(id: string, name: string): Observable<CustomReport> {
    const source = this.find(id);
    if (!source) return throwError(() => new Error('This custom report no longer exists.'));
    const copy: CustomReport = {
      ...cloneReport(source),
      id: this.newId(),
      name: this.uniqueName(name.trim() || source.name),
      owner: CURRENT_USER.name,
      ownerId: CURRENT_USER.id,
      status: 'Draft',
      favourite: false,
      updatedAt: dubaiNow(),
      visibility: 'Only me',
      canEdit: true
    };
    return of(this.put(copy));
  }

  setFavourite(id: string, favourite: boolean): Observable<void> {
    const r = this.find(id);
    if (!r) return throwError(() => new Error('This custom report no longer exists.'));
    r.favourite = favourite;
    this.reports.update((list) => list.map((x) => (x.id === id ? { ...x, favourite } : x)));
    return of(undefined);
  }

  remove(id: string): Observable<void> {
    const r = this.find(id);
    if (!r) return throwError(() => new Error('This custom report no longer exists.'));
    if (!r.canEdit) return this.notOwner();
    this.store = this.store.filter((x) => x.id !== id);
    this.reports.update((list) => list.filter((x) => x.id !== id));
    return of(undefined);
  }

  // ----- Import / export -----

  /** Downloads the reports matching the library filters as report templates (JSON) that Import Template accepts. */
  exportLibrary(query: LibraryQuery): Observable<string> {
    const templates: ReportTemplate[] = this.matching(query).map((r) => ({
      reportName: r.name,
      description: r.description,
      module: r.module,
      visibility: r.visibility,
      definition: {
        sourceKey: r.sourceKey, fields: r.fields, calcFields: r.calcFields, filters: r.filters, filterLogic: r.filterLogic, groupBy: r.groupBy,
        aggregate: r.aggregate, sortBy: r.sortBy, sortDir: r.sortDir, rowLimit: r.rowLimit, viz: r.viz, chartValue: r.chartValue
      }
    }));
    const name = `custom-reports-${dubaiNow().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return of(name);
  }

  /** Downloads the report's data (every row up to its row limit) as CSV. */
  exportData(report: CustomReport, _format: 'xlsx' | 'csv'): Observable<string> {
    const result = runReport(this.catalog(), report, ASSET_ROWS, Math.min(report.rowLimit, 10_000));
    const name = `${fileSlug(report.name)}.csv`;
    downloadCsv(
      name,
      result.columns.map((c) => c.label),
      result.rows.map((row) => result.columns.map((c) => {
        const v = row[c.key];
        return c.kind === 'date' || c.kind === 'text' ? formatCell(c.kind, v) : v === null || v === undefined ? '' : Number(v);
      }))
    );
    return of(name);
  }

  /** Reads a JSON template file; each template becomes a Draft. */
  importTemplates(file: File): Observable<ImportResult> {
    return from(file.text()).pipe(
      map((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('The file is not valid JSON.');
        }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const result: ImportResult = { created: 0, failed: [] };
        list.forEach((t, i) => {
          const problem = this.importOne(t as ReportTemplate);
          if (problem) result.failed.push({ name: (t as ReportTemplate)?.reportName || `Template ${i + 1}`, message: problem });
          else result.created++;
        });
        return result;
      })
    );
  }

  // ----- Preview -----

  /** Runs an unsaved definition against the demo rows. */
  preview(def: ReportDefinition, limit: number): Observable<PreviewResult> {
    return of(runReport(this.catalog(), def, ASSET_ROWS, Math.max(1, Math.min(limit, PREVIEW_MAX))));
  }

  // ----- Standard Reports > "Duplicate to custom report" -----

  /** Creates a Draft from a standard report. */
  createFromStandard(input: { name: string; module: string; description: string }): Observable<CustomReport> {
    if (!this.catalog().sources.length) this.loadCatalog();
    const preset = STANDARD_COPY_FIELDS[input.module] ?? DEFAULT_COPY_FIELDS;
    const report = this.blank();
    report.name = this.uniqueName(input.name.trim() || 'Untitled report');
    report.description = input.description;
    report.module = this.modules().includes(input.module) ? input.module : 'Assets';
    report.sourceKey = sourceKeyFor(this.catalog(), preset.sources);
    // Start with a few fields of the source so the copy previews straight away
    report.fields = [...preset.fields];
    return this.save(report, 1);
  }

  /** Kept for Standard Reports, which expects the final name right away. */
  addFromStandard(input: { name: string; module: string; description: string }): string {
    const name = this.uniqueName(input.name.trim() || 'Untitled report');
    this.createFromStandard({ ...input, name }).subscribe({
      next: () => this.loadSummary().subscribe(),
      error: (e: Error) => console.error('Copy to Custom Reports failed:', e.message)
    });
    return name;
  }

  // ----- Helpers -----

  private find(id: string): CustomReport | undefined {
    return this.store.find((r) => r.id === id);
  }

  private newId(): string {
    return `CR-${this.nextId++}`;
  }

  private notOwner(): Observable<never> {
    return throwError(() => new Error('Only the report owner can change this report.'));
  }

  /** Stores a report and puts it into the loaded library. */
  private put(report: CustomReport): CustomReport {
    this.store = this.store.some((r) => r.id === report.id)
      ? this.store.map((r) => (r.id === report.id ? report : r))
      : [report, ...this.store];
    const copy = cloneReport(report);
    this.reports.update((list) =>
      list.some((r) => r.id === copy.id) ? list.map((r) => (r.id === copy.id ? copy : r)) : [copy, ...list]
    );
    return cloneReport(report);
  }

  private change(id: string, edit: (r: CustomReport) => void): Observable<CustomReport> {
    const found = this.find(id);
    if (!found) return throwError(() => new Error('This custom report no longer exists.'));
    if (!found.canEdit) return this.notOwner();
    const next = cloneReport(found);
    try {
      edit(next);
    } catch (e) {
      return throwError(() => e);
    }
    next.updatedAt = dubaiNow();
    return of(this.put(next));
  }

  /** Keeps the stored schedule (time zone, recipients) when the preset is unchanged. */
  private toSchedule(report: CustomReport): ReportScheduleDto | null {
    const parsed = scheduleOf(report.schedule);
    if (!parsed) return null;
    const stored = report.scheduleDetail;
    if (stored && sameSchedule(stored, parsed)) return { ...stored };
    return { ...parsed, recipients: stored?.recipients ?? [] };
  }

  private matching(q: LibraryQuery): CustomReport[] {
    const search = q.search.trim().toLowerCase();
    const days = LAST_UPDATED_DAYS[q.lastUpdated];
    const since = days === undefined ? '' : days === 0 ? dubaiNow().slice(0, 10) : dubaiStamp(-days);
    const list = this.store.filter(
      (r) =>
        (!search || r.name.toLowerCase().includes(search) || r.description.toLowerCase().includes(search)) &&
        (!q.ownerId || r.ownerId === q.ownerId) &&
        (!q.module || r.module === q.module) &&
        (!q.status || r.status === q.status) &&
        (!since || r.updatedAt >= since)
    );
    return q.sortBy === 'reportName'
      ? list.sort((a, b) => a.name.localeCompare(b.name))
      : list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Validates a template and stores it as a Draft; returns the problem, or '' when created. */
  private importOne(t: ReportTemplate): string {
    if (!t || typeof t !== 'object') return 'Invalid template';
    const name = String(t.reportName ?? '').trim();
    if (name.length < 3) return 'Report name must have at least 3 characters.';
    const catalog = this.catalog();
    const def = { ...blankDefinition(sourceKeyFor(catalog, ['assets'])), ...(t.definition ?? {}) };
    if (!catalog.sources.some((s) => s.key === def.sourceKey)) return `Unknown data source “${def.sourceKey}”.`;
    const known = new Set([...catalog.fields.map((f) => f.key), ...(def.calcFields ?? []).map((c) => c.key)]);
    if (!Array.isArray(def.fields) || !def.fields.length) return 'Select at least one field.';
    const unknown = def.fields.find((k) => !known.has(k));
    if (unknown) return `Unknown field “${unknown}”.`;
    const report: CustomReport = {
      ...this.blank(),
      ...def,
      name: this.uniqueName(name),
      description: String(t.description ?? ''),
      module: t.module && this.modules().includes(t.module) ? t.module : 'Assets',
      visibility: VISIBILITIES.find((v) => v === t.visibility) ?? 'My team',
      schedule: NOT_SCHEDULED,
      currentStep: 6
    };
    this.save(report, 6).subscribe();
    return '';
  }
}

// ----- Catalog -----

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

/** Source cards: the required source alone, then with each combination of the optional ones. */
function buildCatalog(sources: SourceSpec[], groupSpecs: FieldGroupSpec[]): ReportCatalog {
  const groups: FieldGroup[] = groupSpecs.map((g) => ({
    key: slug(g.group),
    label: g.group,
    fields: g.fields.map((f): FieldDef => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      group: slug(g.group),
      dataSource: f.dataSource,
      operators: operatorsFor(f.kind),
      values: f.values
    }))
  }));
  const fields: FieldDef[] = groups.flatMap((g) => g.fields);
  const fieldCount = (key: string) => fields.filter((f) => f.dataSource === key).length;

  const required = sources.filter((s) => s.required);
  const optional = sources.filter((s) => !s.required);
  const cards: DataSource[] = [];
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const extra = optional.filter((_, i) => mask & (1 << i));
    const parts = [...required, ...extra];
    if (!parts.length) continue;
    const keys = parts.map((p) => p.key);
    const keySet = new Set(keys);
    cards.push({
      key: keys.join('+'),
      label: parts.map((p) => p.label).join(' + '),
      // Library module: the joined module when exactly one is added, else Assets
      module: extra.length === 1 ? extra[0].label : 'Assets',
      groups: groups.filter((g) => g.fields.some((f) => keySet.has(f.dataSource))).map((g) => g.key),
      description: extra.length ? `${parts[0].label} joined with ${extra.map((e) => e.description.charAt(0).toLowerCase() + e.description.slice(1)).join('; ')}.` : `${parts[0].description}.`,
      sources: keys,
      fieldCount: parts.reduce((n, p) => n + fieldCount(p.key), 0)
    });
  }
  return { sources: cards, groups, fields };
}
