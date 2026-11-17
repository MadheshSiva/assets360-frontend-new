import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, Bookmark, ChartColumn, CircleCheck, ClipboardList, FileText, GitCompareArrows, Info, LucideAngularModule, LucideIconData,
  RefreshCw, Repeat, ShieldCheck, TriangleAlert, Upload, Wrench
} from 'lucide-angular';
import { EMPTY, Observable, Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AnalyticsPage, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaKpiCard, RaListDialog, RaSaveViewDialog, RaWidget
} from './kit';
import {
  ALL_CATEGORIES, ALL_INSPECTORS, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_TYPES, InsightCardModel, InspectionFinding, InspectionView, InspectorRow,
  KpiFigure, SEVERITY_RANK, emptyInspectionView
} from './inspection-analytics.model';
import {
  FindingsQuery, InspectionAnalyticsService, InspectionQuery, InspectionSavedFilters, MAX_PAGE_SIZE, browserTimeZone
} from './inspection-analytics.service';
import { FindingsSort, InspectionFindingsTable } from './findings-table/findings-table';
import { InspectorTable } from './inspector-table/inspector-table';

interface KpiTile {
  key: 'total' | 'rate' | 'open' | 'critical' | 'due';
  label: string;
  value: string;
  delta: string;
  up: boolean;
  good: boolean;
  icon: LucideIconData;
  tone: string;
}

type InsightAction = 'critical' | 'due' | 'recurring' | 'recurring-detail' | 'safety' | 'plan' | 'query';

interface Insight {
  tone: string;
  icon: LucideIconData;
  title: string;
  text: string;
  primary: { label: string; action: InsightAction };
  secondary: { label: string; action: InsightAction };
  model: InsightCardModel;
}

interface ListSpec {
  title: string;
  subtitle: string;
  header: string[];
  rows: (string | number)[][];
  fileName: string;
}

interface DetailSpec {
  title: string;
  subtitle: string;
  fields: DetailField[];
  finding: InspectionFinding | null;
}

type Option = { value: string; label: string };

const SEVERITY_COLORS: Record<string, string> = { Critical: RA_COLORS.red, High: RA_COLORS.pink, Medium: RA_COLORS.orange, Low: RA_COLORS.blue };
const STATUS_COLORS: Record<string, string> = {
  Completed: RA_COLORS.green, 'In Progress': RA_COLORS.blue, Scheduled: RA_COLORS.violet, Overdue: RA_COLORS.red, Cancelled: RA_COLORS.grey
};
const FINDING_HEADER = ['Finding ID', 'Asset ID', 'Asset', 'Location', 'Category', 'Severity', 'Raised', 'Due Date', 'Owner', 'Status', 'Description'];
/** Used until /options answers (InspectionAnalyticsOptions.DefaultDatePreset and the dashboard date presets) */
const DEFAULT_PRESET = 'This year';
const FALLBACK_PRESETS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
/** Rows fetched for the findings table (it shows the first 8 and links to the rest) */
const TABLE_PAGE = 10;

function signedChange(k: KpiFigure): string {
  if (k.change === null || k.change === undefined) return '';
  const v = Number(k.change.toFixed(1));
  return `${v > 0 ? '+' : ''}${v}${k.changeUnit === 'points' ? ' pts' : '%'}`;
}

function count(v: number | null): string {
  return (v ?? 0).toLocaleString('en-US');
}

/** Reports & Analytics > Inspection Analytics, backed by /api/inspection-analytics. */
@Component({
  selector: 'app-ra-inspection-analytics',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaWidget, RaKpiCard, RaListDialog,
    RaDetailDialog, RaActionPlanDialog, RaSaveViewDialog, InspectionFindingsTable, InspectorTable
  ],
  templateUrl: './inspection-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './inspection-analytics.css']
})
export class InspectionAnalyticsPage extends AnalyticsPage implements OnInit {
  private readonly api = inject(InspectionAnalyticsService);
  @ViewChild(InspectionFindingsTable) private findingsTable?: InspectionFindingsTable;

  readonly icons = { ArrowDown, ArrowUp, Bookmark, GitCompareArrows, RefreshCw, Upload };
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  // Filter dropdowns: labels shown in the selects, filled from GET /options and GET /filters
  override periods: string[] = FALLBACK_PRESETS;
  override period = DEFAULT_PRESET;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override organization = ALL_ORGANIZATIONS;
  override location = ALL_LOCATIONS;
  categories: string[] = [ALL_CATEGORIES];
  types: string[] = [ALL_TYPES];
  inspectorOptions: string[] = [ALL_INSPECTORS];
  category = ALL_CATEGORIES;
  type = ALL_TYPES;
  inspector = ALL_INSPECTORS;
  /** label → API value per dropdown */
  private readonly values = {
    organization: new Map<string, string>(),
    location: new Map<string, string>(),
    category: new Map<string, string>(),
    type: new Map<string, string>(),
    inspector: new Map<string, string>()
  };
  compare = false;
  private compareLabel = 'previous period';

  view: InspectionView = emptyInspectionView();
  kpis: KpiTile[] = [];
  insights: Insight[] = [];
  trendSeries: ChartSeries[] = [];
  severitySeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  categorySeries: ChartSeries[] = [];
  complianceSeries: ChartSeries[] = [];
  repeatSeries: ChartSeries[] = [];

  list: ListSpec | null = null;
  detail: DetailSpec | null = null;
  plan: { context: string; title: string; owner: string } | null = null;
  saveOpen = false;

  /** Each emission reloads the page; switchMap drops answers to filters that have since changed. */
  private readonly reload$ = new Subject<boolean>();

  constructor() {
    super();
    this.updatedMinutes = 0;
    this.render();
    this.reload$
      .pipe(
        switchMap((announce) =>
          this.api.overview(this.query()).pipe(
            map((view) => ({ view, announce })),
            catchError((err: Error) => {
              this.refreshing = false;
              this.notify(err.message);
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe(({ view, announce }) => {
        this.view = view;
        this.refreshing = false;
        this.updatedMinutes = Math.max(0, Math.round((Date.now() - view.generatedAt.getTime()) / 60_000));
        this.render();
        if (this.compare) this.loadCompare();
        if (announce) this.notify('Data refreshed.');
      });
  }

  ngOnInit(): void {
    // Dropdowns and saved views first (each may fail on its own), then the data
    const soft = <T>(source: Observable<T>) => source.pipe(catchError(() => of(null)));
    forkJoin([soft(this.api.loadOptions()), soft(this.api.loadFilters()), soft(this.api.loadViews())]).subscribe(([options, filters, views]) => {
      if (options?.datePresets?.length) {
        // Custom needs a from / to range, which this filter bar does not offer
        this.periods = options.datePresets.filter((p) => p !== 'Custom');
        if (!this.periods.includes(this.period)) this.period = options.defaultDatePreset;
      }
      if (filters) {
        this.organizations = this.fill(this.values.organization, ALL_ORGANIZATIONS, filters.organizations);
        this.locations = this.fill(this.values.location, ALL_LOCATIONS, filters.locations);
        this.categories = this.fill(this.values.category, ALL_CATEGORIES, filters.assetCategories);
        this.types = this.fill(this.values.type, ALL_TYPES, filters.inspectionTypes);
        this.inspectorOptions = this.fill(this.values.inspector, ALL_INSPECTORS, filters.inspectors);
      } else {
        this.notify('Filter values could not be loaded; showing all records.');
      }
      const preferred = views?.find((v) => v.isDefault && !v.isBuiltIn);
      if (preferred) this.useSavedFilters(preferred.filters);
      this.load();
    });
  }

  /** Called by every filter select. */
  apply(): void {
    this.findingsTable?.resetSort();
    this.load();
  }

  private load(announce = false): void {
    this.refreshing = true;
    this.reload$.next(announce);
  }

  override refresh(): void {
    if (this.refreshing) return;
    this.load(true);
  }

  resetFilters(): void {
    this.period = this.periods.includes(DEFAULT_PRESET) ? DEFAULT_PRESET : this.periods[0];
    this.organization = ALL_ORGANIZATIONS;
    this.location = ALL_LOCATIONS;
    this.category = ALL_CATEGORIES;
    this.type = ALL_TYPES;
    this.inspector = ALL_INSPECTORS;
    this.apply();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    if (this.compare) {
      this.loadCompare(true);
    } else {
      this.view = { ...this.view, completedPrevious: [] };
      this.buildTrend();
      this.notify('Period comparison turned off.');
    }
  }

  /** GET /compare-periods: completed inspections in the previous period of the same length. */
  private loadCompare(announce = false): void {
    this.api.compareCompleted(this.query()).subscribe({
      next: (c) => {
        this.compareLabel = c.label;
        this.view = { ...this.view, completedPrevious: c.completed };
        this.buildTrend();
        if (announce) this.notify(`Comparing completed inspections with ${c.label}.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ===== Query / filters =====

  private query(): InspectionQuery {
    return {
      datePreset: this.period,
      organization: this.values.organization.get(this.organization) ?? null,
      location: this.values.location.get(this.location) ?? null,
      category: this.values.category.get(this.category) ?? null,
      inspectionType: this.values.type.get(this.type) ?? null,
      inspector: this.values.inspector.get(this.inspector) ?? null
    };
  }

  private fill(values: Map<string, string>, all: string, options: Option[]): string[] {
    values.clear();
    for (const o of options) values.set(o.label || o.value, o.value);
    return [all, ...values.keys()];
  }

  private labelOf(values: Map<string, string>, value: string | null, all: string): string {
    if (!value) return all;
    for (const [label, v] of values) if (v.toLowerCase() === value.toLowerCase()) return label;
    return all;
  }

  private useSavedFilters(f: InspectionSavedFilters): void {
    if (this.periods.includes(f.datePreset)) this.period = f.datePreset;
    this.organization = this.labelOf(this.values.organization, f.organization, ALL_ORGANIZATIONS);
    this.location = this.labelOf(this.values.location, f.location, ALL_LOCATIONS);
    this.category = this.labelOf(this.values.category, f.category, ALL_CATEGORIES);
    this.type = this.labelOf(this.values.type, f.inspectionType, ALL_TYPES);
    this.inspector = this.labelOf(this.values.inspector, f.inspector, ALL_INSPECTORS);
  }

  private savedFilters(): InspectionSavedFilters {
    const q = this.query();
    return {
      organization: q.organization ?? null,
      location: q.location ?? null,
      category: q.category ?? null,
      assetType: null,
      inspectionType: q.inspectionType ?? null,
      inspector: q.inspector ?? null,
      datePreset: this.period,
      dateFrom: null,
      dateTo: null,
      timeZone: browserTimeZone()
    };
  }

  // ===== Widgets =====

  /** Rebuilds every widget input from this.view. */
  private render(): void {
    const v = this.view;
    const tile = (key: KpiTile['key'], label: string, k: KpiFigure, value: string, goodWhenUp: boolean, icon: LucideIconData, tone: string): KpiTile => {
      const change = k.change ?? 0;
      return { key, label, value, delta: signedChange(k), up: change >= 0, good: change === 0 || change > 0 === goodWhenUp, icon, tone };
    };
    this.kpis = [
      tile('total', 'Total Inspections', v.kpis.total, count(v.kpis.total.value), true, ClipboardList, 'purple'),
      tile('rate', 'Completion Rate', v.kpis.rate, v.kpis.rate.value === null ? '—' : percent(v.kpis.rate.value), true, CircleCheck, 'green'),
      tile('open', 'Open Findings', v.kpis.open, count(v.kpis.open.value), false, FileText, 'orange'),
      tile('critical', 'Critical Findings', v.kpis.critical, count(v.kpis.critical.value), false, TriangleAlert, 'red'),
      tile('due', 'Corrective Actions Due', v.kpis.due, count(v.kpis.due.value), false, Wrench, 'blue')
    ];
    this.buildTrend();
    this.severitySeries = v.severity.map((s) => ({ name: s.name, values: s.values, color: SEVERITY_COLORS[s.name] ?? RA_COLORS.grey }));
    this.statusSlices = v.status.map((s) => ({ name: s.name, value: s.value, color: STATUS_COLORS[s.name] ?? RA_COLORS.grey }));
    this.categorySeries = [{ name: 'Findings', values: v.byCategory, color: RA_COLORS.purple }];
    this.complianceSeries = [
      { name: 'Compliance', values: v.compliance.series, color: RA_COLORS.green, area: true },
      { name: 'Target', values: v.compliance.series.map(() => v.compliance.target), color: RA_COLORS.grey, dashed: true }
    ];
    this.repeatSeries = [
      { name: 'Repeated Defects', values: v.repeated, color: RA_COLORS.pink },
      { name: 'Resolved Defects', values: v.resolved, color: RA_COLORS.blue }
    ];
    this.buildInsights();
  }

  private buildTrend(): void {
    const v = this.view;
    this.trendSeries = [
      { name: 'Planned', values: v.planned, color: RA_COLORS.blue },
      { name: 'Completed', values: v.completed, color: RA_COLORS.green },
      { name: 'Overdue', values: v.overdue, color: RA_COLORS.red, dashed: true }
    ];
    if (this.compare && v.completedPrevious.length) {
      this.trendSeries.push({ name: 'Completed (previous period)', values: v.completedPrevious, color: RA_COLORS.grey, dashed: true });
    }
  }

  private buildInsights(): void {
    this.insights = this.view.insights.map((m): Insight => {
      const base = { title: m.title, text: m.message, model: m };
      const plan = { label: 'Create action plan', action: 'plan' as const };
      switch (m.key) {
        case 'critical_findings':
          return { ...base, tone: 'red', icon: TriangleAlert, primary: { label: 'View findings', action: 'critical' }, secondary: plan };
        case 'corrective_actions_due':
          return { ...base, tone: 'orange', icon: ChartColumn, primary: { label: 'View findings', action: 'due' }, secondary: plan };
        case 'recurring_findings':
          return {
            ...base, tone: 'blue', icon: Repeat,
            primary: { label: 'View assets', action: 'recurring' }, secondary: { label: 'Open asset details', action: 'recurring-detail' }
          };
        case 'safety_compliance':
          return {
            ...base, tone: m.severity === 'success' ? 'green' : 'purple', icon: ShieldCheck,
            primary: { label: 'View details', action: 'safety' }, secondary: plan
          };
        default:
          return {
            ...base, tone: m.severity === 'critical' ? 'red' : m.severity === 'warning' ? 'orange' : m.severity === 'success' ? 'green' : 'blue',
            icon: Info, primary: { label: 'View findings', action: 'query' }, secondary: plan
          };
      }
    });
  }

  get statusTotal(): string {
    return this.view.statusTotal.toLocaleString('en-US');
  }

  get complianceText(): string {
    return this.view.compliance.value === null ? '—' : percent(this.view.compliance.value);
  }

  get complianceDelta(): string {
    const c = this.view.compliance.change;
    return c === null ? '—' : `${c > 0 ? '+' : ''}${Number(c.toFixed(1))} pts`;
  }

  /** Bottom of the compliance trend axis: 80% as before, lower when the data or target is below it. */
  get complianceMin(): number {
    const lowest = Math.min(this.view.compliance.target, ...this.view.compliance.series.filter((x) => x > 0));
    return lowest >= 85 ? 80 : Math.max(0, Math.floor((lowest - 5) / 10) * 10);
  }

  // ===== Header actions =====

  /** GET /export: Excel workbook of every section for the current filters. */
  exportAll(): void {
    this.api.export(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inspection-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.notify('Inspection analytics exported.');
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** Save View: updates the user's view of the same name, otherwise creates one (POST / PUT /views). */
  saveNamedView(name: string): void {
    this.saveOpen = false;
    const existing = this.api.views().find((v) => !v.isBuiltIn && v.viewName.toLowerCase() === name.trim().toLowerCase());
    const request = existing
      ? this.api.updateView(existing.viewId, name, this.savedFilters())
      : this.api.createView(name, this.savedFilters());
    request.subscribe({
      next: (v) => this.notify(`View “${v.viewName}” ${existing ? 'updated' : 'saved'} with the current filters.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ===== KPI cards =====

  kpiAction(kpi: KpiTile, action: string): void {
    if (action === 'Export CSV') {
      downloadCsv(`inspection-${kpi.key}.csv`, ['KPI', 'Value', 'Change vs previous period', 'Period', 'Location'], [[kpi.label, kpi.value, kpi.delta, this.period, this.location]]);
      return;
    }
    const v = this.view;
    const figure = v.kpis[kpi.key];
    let fields: DetailField[];
    switch (kpi.key) {
      case 'total':
        fields = v.status.map((s) => ({ label: s.name, value: count(s.value) }));
        break;
      case 'rate':
        fields = [
          { label: 'Definition', value: 'Completed ÷ inspections due in the period' },
          { label: 'Compliance target', value: `${v.compliance.target}%` }
        ];
        break;
      case 'open':
        fields = [{ label: 'Unresolved findings (any date)', value: count(v.findingsTotal) }];
        break;
      case 'critical':
        fields = [{ label: 'Earliest due date', value: this.earliestDue(v.findings.filter((r) => r.severity === 'Critical')) }];
        break;
      default:
        fields = [{ label: 'Window', value: `Due within ${v.dueWithinDays} days, including overdue` }];
    }
    const previous = figure.previous === null ? '—' : kpi.key === 'rate' ? percent(figure.previous) : count(figure.previous);
    fields.push(
      { label: 'Previous period', value: previous },
      { label: 'Change vs previous period', value: kpi.delta || '—' },
      { label: 'Period', value: v.periodLabel ? `${this.period} (${v.periodLabel})` : this.period },
      { label: 'Location', value: this.location }
    );
    this.detail = { title: kpi.label, subtitle: kpi.value, fields, finding: null };
  }

  private earliestDue(rows: InspectionFinding[]): string {
    return rows.filter((r) => r.dueInDays !== null).sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0))[0]?.due ?? '—';
  }

  // ===== Widget exports (CSV of what each widget shows) =====

  private monthRows(...cols: number[][]): (string | number)[][] {
    return this.view.labels.map((l, i) => [l.replace('\n', ' '), ...cols.map((c) => c[i] ?? 0)]);
  }

  exportTrend(): void {
    const v = this.view;
    const header = ['Month', 'Planned', 'Completed', 'Overdue'];
    const cols = [v.planned, v.completed, v.overdue];
    if (v.completedPrevious.length) {
      header.push(`Completed (${this.compareLabel})`);
      cols.push(v.completedPrevious);
    }
    downloadCsv('inspection-completion-trend.csv', header, this.monthRows(...cols));
  }

  exportSeverity(): void {
    const s = this.view.severity;
    downloadCsv('findings-by-severity.csv', ['Month', ...s.map((x) => x.name)], this.monthRows(...s.map((x) => x.values)));
  }

  exportStatus(): void {
    downloadCsv('inspection-status.csv', ['Status', 'Inspections'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportCategories(): void {
    downloadCsv('findings-by-category.csv', ['Category', 'Findings'], this.view.categories.map((t, i) => [t, this.view.byCategory[i]]));
  }

  exportCompliance(): void {
    const c = this.view.compliance;
    downloadCsv('inspection-compliance.csv', ['Month', 'Compliance %', 'Target %'], this.monthRows(c.series, c.series.map(() => c.target)));
  }

  exportRepeat(): void {
    downloadCsv('repeat-findings.csv', ['Month', 'Repeated', 'Resolved'], this.monthRows(this.view.repeated, this.view.resolved));
  }

  /** Every open finding for the filters (GET /findings, up to the API's page limit). */
  exportFindings(): void {
    this.fetchFindings({ pageSize: MAX_PAGE_SIZE }, (rows) => downloadCsv('open-inspection-findings.csv', FINDING_HEADER, this.findingRows(rows)));
  }

  exportInspectors(): void {
    downloadCsv('inspector-performance.csv', ['Inspector', 'Inspections', 'Inspections Completed', 'Avg Duration (hrs)', 'Finding Rate %', 'Closure Rate %'],
      this.view.inspectors.map((r) => [r.name, r.inspections, r.completed, r.avgHours ?? '', r.findingRate ?? '', r.closureRate ?? '']));
  }

  // ===== Tables =====

  /** Table header click: GET /findings sorted by the API. */
  onSort(sort: FindingsSort): void {
    this.api.findings(this.query(), { ...sort, pageSize: TABLE_PAGE }).subscribe({
      next: (page) => (this.view = { ...this.view, findings: page.rows, findingsTotal: page.total }),
      error: (err: Error) => this.notify(err.message)
    });
  }

  openFinding(row: InspectionFinding): void {
    this.detail = {
      title: row.id,
      subtitle: `${row.assetName} · ${row.site}`,
      finding: row,
      fields: [
        { label: 'Asset ID', value: row.assetId },
        { label: 'Asset', value: row.assetName },
        { label: 'Location', value: row.site },
        { label: 'Finding category', value: row.findingType },
        { label: 'Severity', value: row.severity },
        { label: 'Status', value: row.status },
        { label: 'Raised', value: row.raised },
        { label: 'Due date', value: row.overdue ? `${row.due} (overdue)` : row.due },
        { label: 'Age', value: row.ageDays === null ? '—' : `${row.ageDays} days` },
        { label: 'Owner', value: row.owner },
        { label: 'Description', value: row.description || '—' }
      ]
    };
  }

  planFor(row: InspectionFinding): void {
    this.detail = null;
    this.plan = {
      context: `${row.id} · ${row.severity} ${row.findingType.toLowerCase()} finding on ${row.assetName} (${row.site}).`,
      title: `Corrective action for ${row.id}`,
      owner: row.owner === '—' ? '' : row.owner
    };
  }

  // The analytics API is read-only for findings (no status update endpoint), so this only changes the row on screen
  markInProgress(row: InspectionFinding): void {
    this.view = { ...this.view, findings: this.view.findings.map((f) => (f.key === row.key ? { ...f, status: 'In Progress' } : f)) };
    this.notify(`${row.id} marked as in progress on this page (not saved).`);
  }

  viewAllFindings(): void {
    this.fetchFindings({ pageSize: MAX_PAGE_SIZE }, (rows, total) => this.showFindings('Open inspection findings', rows, total));
  }

  openInspector(row: InspectorRow): void {
    this.detail = {
      title: row.name,
      subtitle: 'Inspector performance',
      finding: null,
      fields: [
        { label: 'Inspections', value: row.inspections.toLocaleString('en-US') },
        { label: 'Inspections completed', value: row.completed.toLocaleString('en-US') },
        { label: 'Average duration', value: row.avgHours === null ? '—' : `${row.avgHours} hrs` },
        { label: 'Finding rate', value: row.findingRate === null ? '—' : `${row.findingRate}%` },
        { label: 'Closure rate', value: row.closureRate === null ? '—' : `${row.closureRate}%` }
      ]
    };
  }

  detailAction(): void {
    if (this.detail?.finding) this.planFor(this.detail.finding);
  }

  // ===== Insights =====

  insightAction(insight: Insight, action: InsightAction): void {
    const m = insight.model;
    switch (action) {
      case 'critical':
        this.fetchFindings({ severity: 'Critical', pageSize: MAX_PAGE_SIZE }, (rows, total) => this.showFindings('Critical findings', rows, total));
        break;
      case 'due':
        this.fetchFindings({ dueWithinDays: this.view.dueWithinDays, pageSize: MAX_PAGE_SIZE }, (rows, total) =>
          this.showFindings(`Corrective actions due within ${this.view.dueWithinDays} days`, rows, total));
        break;
      case 'query':
        this.fetchFindings({ ...this.parseQuery(m.query), pageSize: MAX_PAGE_SIZE }, (rows, total) => this.showFindings(m.title, rows, total));
        break;
      case 'recurring':
        this.list = {
          title: 'Assets with recurring findings',
          subtitle: m.message,
          header: ['Asset ID', 'Asset', 'Location', 'Repeat findings'],
          rows: m.assets.map((a) => [a.assetId, a.assetName, a.site, a.reasons]),
          fileName: 'recurring-findings-assets.csv'
        };
        break;
      case 'recurring-detail':
        this.openRecurringAsset(m);
        break;
      case 'safety':
        this.list = {
          title: 'Safety inspection compliance by location',
          subtitle: m.message,
          header: ['Location', 'Status'],
          rows: m.locations.map((l) => [l, 'Below target']),
          fileName: 'safety-compliance-by-location.csv'
        };
        break;
      case 'plan':
        this.plan = { context: insight.title + '.', title: insight.title, owner: '' };
        break;
    }
  }

  /** Insight "query" string (e.g. "severity=Critical") → /findings arguments. */
  private parseQuery(query: string): FindingsQuery {
    const p = new URLSearchParams(query);
    const days = Number(p.get('dueWithinDays'));
    return {
      severity: p.get('severity') ?? undefined,
      dueWithinDays: Number.isFinite(days) && days > 0 ? days : undefined,
      repeatOnly: p.get('repeatOnly') === 'true' || undefined
    };
  }

  private openRecurringAsset(m: InsightCardModel): void {
    const top = m.assets[0];
    if (!top) {
      this.notify('No assets with recurring findings for the current filters.');
      return;
    }
    this.fetchFindings({ search: top.assetId, pageSize: MAX_PAGE_SIZE }, (rows) => {
      const own = rows.filter((r) => r.assetId === top.assetId);
      const worst = own.slice().sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))[0];
      this.detail = {
        title: top.assetName,
        subtitle: `${top.assetId} · ${top.site}`,
        finding: null,
        fields: [
          { label: 'Repeat findings', value: top.reasons || '—' },
          { label: 'Open findings', value: String(own.length) },
          { label: 'Highest open severity', value: worst?.severity ?? '—' },
          { label: 'Open finding IDs', value: own.map((r) => r.id).join(', ') || '—' },
          { label: 'Categories', value: [...new Set(own.map((r) => r.findingType))].join(', ') || '—' }
        ]
      };
    });
  }

  private fetchFindings(extra: FindingsQuery & { search?: string }, done: (rows: InspectionFinding[], total: number) => void): void {
    this.api.findings(this.query(), extra).subscribe({
      next: (page) => done(page.rows, page.total),
      error: (err: Error) => this.notify(err.message)
    });
  }

  private showFindings(title: string, rows: InspectionFinding[], total = rows.length): void {
    const shown = total > rows.length ? `first ${rows.length} of ${total} findings` : `${rows.length} finding${rows.length === 1 ? '' : 's'}`;
    this.list = {
      title,
      subtitle: `${shown} · ${this.location} · ${this.period}`,
      header: FINDING_HEADER,
      rows: this.findingRows(rows),
      fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    };
  }

  private findingRows(rows: InspectionFinding[]): (string | number)[][] {
    return rows.map((r) => [r.id, r.assetId, r.assetName, r.site, r.findingType, r.severity, r.raised, r.due, r.owner, r.status, r.description]);
  }

  // Action plans have no endpoint in the analytics API yet; the dialog only confirms on screen
  planSaved(plan: ActionPlan): void {
    this.plan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created for ${plan.owner}, due ${plan.due}.`);
  }
}
