import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Banknote, Box, ChartColumn, ChevronDown, CirclePlus, ClipboardCheck, ClipboardList, Cog, Database, Factory, FileText, Gauge,
  HeartPulse, LucideAngularModule, LucideIconData, Package, RefreshCw, Settings, Share2, Shield, ShieldCheck, Target, TriangleAlert,
  Upload, Users, Wrench
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { AnalyticsPage, downloadCsv } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, HBarChart, HBarRow, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaListDialog, RaSaveViewDialog, RaShareDialog, RaWidget
} from '../inspection-analytics/kit';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, KD_DEFAULT_PERIOD, KD_DEFAULT_VIEW, KD_FALLBACK_PERIODS, KpiDashboardVm, KpiDef, KpiInsightVm,
  KpiMetric, KpiModule, KpiState, KpiViewDef
} from './kpi-dashboard.data';
import { KdFilterLists, KdFilters, KdOptions, KpiDashboardService, SaveKpiBody } from './kpi-dashboard.service';
import { KpiTile } from './kpi-tile';
import { KpiLayoutDialog, LayoutItem } from './kpi-layout-dialog';
import { KpiFormDialog, KpiFormValue } from './kpi-form-dialog';
import { KpiExceptionsTable } from './kpi-exceptions-table';

interface TileVm {
  state: KpiState;
  icon: LucideIconData;
  tone: string;
}

interface Insight extends KpiInsightVm {
  icon: LucideIconData;
  kpi: KpiState | null;
}

interface ListSpec {
  title: string;
  subtitle: string;
  header: string[];
  rows: (string | number)[][];
  fileName: string;
}

const KPI_ICONS: Record<string, LucideIconData> = {
  health: HeartPulse, pm: ShieldCheck, utilization: ChartColumn, cost: Database, openWo: FileText, inspection: ClipboardCheck,
  turnover: Box, oee: Cog, compliance: ShieldCheck, onTime: Factory, capa: ClipboardList, availability: Gauge, mtbf: Target,
  mttr: Wrench, overdueWo: TriangleAlert, inventoryValue: Package, wip: Factory, reorder: Package, openFindings: ClipboardList,
  criticalFindings: TriangleAlert, overdueCapa: TriangleAlert, missing: Box
};
const MODULE_ICONS: Record<KpiModule, LucideIconData> = {
  Asset: Box, Maintenance: Wrench, Inspection: ClipboardCheck, Inventory: Package, Operations: Factory, Compliance: Shield, Financial: Banknote
};
const MODULE_TONES: Record<KpiModule, string> = {
  Asset: 'green', Maintenance: 'blue', Inspection: 'purple', Inventory: 'blue', Operations: 'purple', Compliance: 'green', Financial: 'red'
};
const INSIGHT_ICONS: Record<string, LucideIconData> = { red: TriangleAlert, orange: TriangleAlert, green: ShieldCheck, blue: Users };
const EXCEPTION_STATUSES = ['All Statuses', 'Watch', 'At Risk', 'Over Budget'];
const EXPORT_HEADER = ['KPI', 'Module', 'Current', 'Target', 'Variance', 'Change vs previous period', 'Status', 'Owner', 'Due Date'];

/** Reports & Analytics > KPI Dashboard. Figures, KPIs and views come from /api/kpi-dashboard. */
@Component({
  selector: 'app-ra-kpi-dashboard',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, HBarChart, RaWidget, RaListDialog, RaDetailDialog, RaActionPlanDialog,
    RaSaveViewDialog, RaShareDialog, KpiTile, KpiLayoutDialog, KpiFormDialog, KpiExceptionsTable
  ],
  providers: [KpiDashboardService],
  templateUrl: './kpi-dashboard.html',
  styleUrls: ['../shared/analytics-page.css', './kpi-dashboard.css']
})
export class KpiDashboardPage extends AnalyticsPage {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly api = inject(KpiDashboardService);
  readonly icons = { ChartColumn, ChevronDown, CirclePlus, RefreshCw, Settings, Share2, Upload };
  readonly moduleIcons = MODULE_ICONS;
  readonly exceptionStatuses = EXCEPTION_STATUSES;
  readonly granularities = ['Monthly', 'Quarterly'];
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  override periods: string[] = KD_FALLBACK_PERIODS;
  override period = KD_DEFAULT_PERIOD;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  categories: string[] = [ALL_CATEGORIES];
  category = ALL_CATEGORIES;
  metrics: KpiMetric[] = [];
  owners: string[] = [];

  views: KpiViewDef[] = [];
  activeKey = KD_DEFAULT_VIEW;
  granularity = 'Monthly';
  exceptionStatus = EXCEPTION_STATUSES[0];

  states = new Map<string, KpiState>();
  tiles: TileVm[] = [];
  trendLabels: string[] = [];
  trendSeries: ChartSeries[] = [];
  trendMin = 80;
  targetRows: HBarRow[] = [];
  viewExceptions: KpiState[] = [];
  exceptions: KpiState[] = [];
  insights: Insight[] = [];
  library: { module: KpiModule; count: number }[] = [];
  monthLabels: string[] = [];

  /** Message when the last load failed */
  loadError: string | null = null;
  saving = false;
  customMenuOpen = false;
  layoutOpen = false;
  shareOpen = false;
  saveCustomOpen = false;
  /** 'new' for Create KPI, a KPI for Edit KPI */
  form: KpiDef | 'new' | null = null;
  list: ListSpec | null = null;
  detail: { title: string; subtitle: string; fields: DetailField[]; kpi: KpiState | null } | null = null;
  plan: { context: string; title: string; owner: string } | null = null;

  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  constructor() {
    super();
    this.updatedMinutes = 0;
    // Share links open a view: ?view=<key>
    const view = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('view');
    if (view) this.activeKey = view;
    this.init();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  // ===== Views =====

  get activeView(): KpiViewDef {
    return (
      this.views.find((v) => v.key === this.activeKey) ??
      this.views[0] ?? { key: this.activeKey, label: '', dashboard: 'KPI Dashboard', custom: false, items: [], defaultIds: [] }
    );
  }

  get standardViews(): KpiViewDef[] {
    return this.views.filter((v) => !v.custom);
  }

  get customViews(): KpiViewDef[] {
    return this.views.filter((v) => v.custom);
  }

  get customLabel(): string {
    return this.activeView.custom ? this.activeView.label : 'Custom Views';
  }

  selectView(key: string): void {
    this.activeKey = key;
    this.customMenuOpen = false;
    this.apply();
  }

  get shareLink(): string {
    const origin = typeof location === 'undefined' ? '' : location.origin;
    return `${origin}${this.basePath}/kpi-dashboard?view=${encodeURIComponent(this.activeKey)}`;
  }

  // ===== Data =====

  /** Options and filter values, then the figures. */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<KdOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<KdFilterLists | null>(null))
    }).subscribe(({ options, filters }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.metrics = options.metrics;
        this.owners = options.owners;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
      }
      if (errors.length) this.notify(errors[0]);
      this.apply();
    });
  }

  private filters(): KdFilters {
    return {
      period: this.period, organization: this.organization, location: this.location, category: this.category, viewKey: this.activeKey,
      granularity: this.granularity
    };
  }

  /** Reloads the page from GET /overview and rebuilds the tiles, charts, exceptions and insights. */
  apply(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    this.loadSub = this.api.loadOverview(this.filters()).subscribe({
      next: (d) => {
        this.loadError = null;
        this.build(d);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        // An unknown view (old share link, deleted custom view) falls back to the default view
        if (this.activeKey !== KD_DEFAULT_VIEW && /^View '/.test(err.message)) {
          this.activeKey = KD_DEFAULT_VIEW;
          this.apply();
          return;
        }
        this.loadError = err.message;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.apply('Data refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  private build(d: KpiDashboardVm): void {
    this.views = d.views;
    if (d.viewKey) this.activeKey = d.viewKey;
    this.monthLabels = d.monthLabels;
    this.states = new Map(d.kpis.map((s) => [s.def.id, s]));
    this.tiles = d.tiles.map((state) => ({
      state,
      icon: KPI_ICONS[state.def.metric ?? state.def.id] ?? MODULE_ICONS[state.def.module],
      tone: MODULE_TONES[state.def.module]
    }));
    this.viewExceptions = d.exceptions;
    this.filterExceptions();
    this.buildTrend(d);
    this.targetRows = d.targets.map((t) => ({
      label: t.module,
      value: t.value,
      display: `${t.value}%`,
      color: t.value >= 100 ? RA_COLORS.green : t.value >= 97 ? RA_COLORS.orange : RA_COLORS.red,
      target: 100,
      targetDisplay: '100%'
    }));
    this.insights = d.insights.map((i) => ({ ...i, icon: INSIGHT_ICONS[i.tone] ?? TriangleAlert, kpi: i.kpiId ? this.states.get(i.kpiId) ?? null : null }));
    this.library = d.library;
  }

  filterExceptions(): void {
    this.exceptions = this.exceptionStatus === EXCEPTION_STATUSES[0] ? this.viewExceptions : this.viewExceptions.filter((s) => s.status === this.exceptionStatus);
  }

  /** GET /trend for the other granularity. */
  setGranularity(): void {
    this.api.loadTrend(this.filters()).subscribe({
      next: () => this.buildTrend(this.api.dashboard()),
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** Overall score = average attainment vs target of the KPIs shown (100% = on target). */
  private buildTrend(d: KpiDashboardVm): void {
    const t = d.trend;
    this.trendLabels = t.labels;
    this.trendSeries = [
      { name: 'Overall Score', values: t.overall, color: RA_COLORS.purple, area: true },
      { name: 'Target', values: t.target, color: RA_COLORS.grey, dashed: true },
      { name: 'Prior Period', values: t.prior, color: RA_COLORS.blue }
    ];
    // The axis starts at 80% unless a month scored lower
    const known = [...t.overall, ...t.prior].filter((v) => v > 0);
    this.trendMin = known.length ? Math.min(80, Math.floor(Math.min(...known) / 10) * 10) : 80;
  }

  // ===== Header actions =====

  /** GET /export: the view as an Excel workbook. */
  exportAll(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify(`Exported ${this.tiles.length} KPIs from ${this.activeView.dashboard}.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  private exportRow(s: KpiState): (string | number)[] {
    return [s.def.name, s.def.module, s.valueText, s.targetText, s.varianceText, s.changeText, s.status, s.def.owner || 'Unassigned', s.due];
  }

  shared(message: string): void {
    this.shareOpen = false;
    this.notify(message);
  }

  // ===== Layout =====

  get layoutItems(): LayoutItem[] {
    return this.activeView.items.map((l) => {
      const def = this.states.get(l.id)?.def;
      return { id: l.id, name: def?.name ?? l.id, module: def?.module ?? '', visible: l.visible };
    });
  }

  saveLayout(items: LayoutItem[]): void {
    this.layoutOpen = false;
    this.persistLayout(items.map((i) => ({ id: i.id, visible: i.visible })), `Layout saved for ${this.activeView.dashboard}.`);
  }

  private persistLayout(items: { id: string; visible: boolean }[], message: string): void {
    this.api.saveLayout(this.activeKey, items).subscribe({
      next: () => this.apply(message),
      error: (err: Error) => this.notify(err.message)
    });
  }

  resetLayout(): void {
    this.layoutOpen = false;
    this.api.resetView(this.activeKey).subscribe({
      next: () => this.apply('Layout reset to the default tiles.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  saveCustomView(name: string): void {
    const ids = this.tiles.map((t) => t.state.def.id);
    this.api.createView(name, ids).subscribe({
      next: (view) => {
        this.saveCustomOpen = false;
        this.activeKey = view.key;
        this.apply(`Custom view “${name}” saved with ${ids.length} KPIs.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  deleteCustomView(): void {
    const view = this.activeView;
    this.customMenuOpen = false;
    if (!view.custom) return;
    this.api.deleteView(view.key).subscribe({
      next: () => {
        this.activeKey = KD_DEFAULT_VIEW;
        this.apply(`Custom view “${view.label}” deleted.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ===== KPI create / edit =====

  get takenNames(): string[] {
    return [...this.states.values()].map((s) => s.def.name);
  }

  get formKpi(): KpiDef | null {
    return this.form === 'new' ? null : this.form;
  }

  /** The edited KPI's current value for the filter bar */
  get formValue(): number | null {
    const kpi = this.formKpi;
    return kpi ? this.states.get(kpi.id)?.value ?? null : null;
  }

  get formModule(): KpiModule {
    return this.activeView.key === 'finance' ? 'Financial' : this.activeView.key === 'maintenance' ? 'Maintenance' : this.activeView.key === 'operations' ? 'Operations' : 'Asset';
  }

  saveKpi(value: KpiFormValue): void {
    const editing = this.formKpi;
    const body: SaveKpiBody = {
      name: value.name,
      module: value.module,
      unit: value.unit,
      direction: value.direction,
      target: value.target as number,
      owner: value.owner,
      metric: value.metric || null,
      value: value.metric ? null : value.value,
      reviewDueDate: value.reviewDue || null
    };
    this.saving = true;
    const request = editing ? this.api.updateKpi(editing.id, body) : this.api.createKpi({ ...body, viewKey: this.activeKey });
    request.subscribe({
      next: () => {
        this.saving = false;
        this.form = null;
        this.apply(editing ? `${value.name} updated.` : `KPI “${value.name}” added to ${value.module} and to ${this.activeView.dashboard}.`);
      },
      error: (err: Error) => {
        this.saving = false;
        this.notify(err.message);
      }
    });
  }

  // ===== Tiles =====

  tileAction(tile: TileVm, action: string): void {
    const s = tile.state;
    switch (action) {
      case 'View details':
        this.openDetail(s);
        break;
      case 'Edit KPI':
        this.form = s.def;
        break;
      case 'Hide tile':
        this.persistLayout(
          this.activeView.items.map((l) => (l.id === s.def.id ? { ...l, visible: false } : l)),
          `${s.def.name} hidden. Use Edit KPI Layout to show it again.`
        );
        break;
      default: {
        const monthly = s.monthly.length > 0 && s.monthly.length === this.monthLabels.length;
        const rows: (string | number)[][] = monthly ? this.monthLabels.map((l, i) => [l, s.monthly[i] ?? '']) : [['Current', s.value ?? '']];
        downloadCsv(`kpi-${s.def.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, ['Month', s.def.name], rows);
      }
    }
  }

  openDetail(s: KpiState): void {
    this.detail = {
      title: s.def.name,
      subtitle: `${s.def.module} · ${s.def.info}`,
      kpi: s,
      fields: [
        { label: 'Current value', value: s.valueText },
        { label: s.def.unit === 'AED' ? 'Budget' : 'Target', value: s.targetText.replace(/^(Budget|Target) /, '') },
        { label: 'Variance vs target', value: s.varianceText },
        { label: 'Direction', value: s.def.direction === 'higher' ? 'Higher is better' : 'Lower is better' },
        { label: 'Status', value: s.status },
        { label: 'Change vs previous period', value: s.changeText },
        { label: 'Owner', value: s.def.owner || 'Unassigned' },
        { label: 'Next review due', value: s.due },
        { label: 'Source', value: s.def.metric ? s.def.source : 'Manual value' },
        { label: 'Scope', value: `${this.organization} · ${this.location} · ${this.category}` },
        { label: 'Period', value: this.period }
      ]
    };
  }

  editFromDetail(): void {
    const kpi = this.detail?.kpi;
    this.detail = null;
    if (kpi) this.form = kpi.def;
  }

  // ===== Widgets =====

  exportTrend(): void {
    const [overall, target, prior] = this.trendSeries;
    downloadCsv('kpi-performance-trend.csv', ['Period', 'Overall Score %', 'Target %', 'Prior Period %'],
      this.trendLabels.map((l, i) => [l.replace('\n', ' '), overall.values[i], target.values[i], prior.values[i]]));
  }

  exportTargets(): void {
    downloadCsv('kpi-target-vs-actual.csv', ['Module', 'Attainment %', 'Target %'], this.targetRows.map((r) => [r.label, r.value, 100]));
  }

  exportExceptions(): void {
    downloadCsv('kpi-exceptions.csv', EXPORT_HEADER, this.exceptions.map((s) => this.exportRow(s)));
  }

  // ===== Insights & library =====

  insightAction(ins: Insight): void {
    switch (ins.action) {
      case 'exceptions':
        this.showExceptions('KPI exceptions', this.viewExceptions);
        break;
      case 'due-week':
        this.showExceptions('KPI actions due this week', this.viewExceptions.filter((s) => ins.kpiIds.includes(s.def.id)));
        break;
      case 'settings':
        if (ins.kpi) this.form = ins.kpi.def;
        break;
      case 'plan':
        this.plan = {
          context: ins.title + '.',
          title: ins.kpi ? `Bring ${ins.kpi.def.name.toLowerCase()} back within budget` : ins.title,
          owner: ins.kpi?.def.owner ?? ''
        };
        break;
    }
  }

  private showExceptions(title: string, rows: KpiState[]): void {
    this.list = {
      title,
      subtitle: `${rows.length} KPI${rows.length === 1 ? '' : 's'} · ${this.activeView.dashboard}`,
      header: EXPORT_HEADER,
      rows: rows.map((s) => this.exportRow(s)),
      fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    };
  }

  openLibrary(module: KpiModule): void {
    const states = [...this.states.values()].filter((s) => s.def.module === module);
    this.list = {
      title: `${module} KPIs`,
      subtitle: `${states.length} KPI${states.length === 1 ? '' : 's'} in the library`,
      header: ['KPI', 'Current', 'Target', 'Status', 'Owner', 'On this view'],
      rows: states.map((s) => [
        s.def.name, s.valueText, s.targetText, s.status, s.def.owner || 'Unassigned', this.tiles.some((t) => t.state.def.id === s.def.id) ? 'Yes' : 'No'
      ]),
      fileName: `kpi-library-${module.toLowerCase()}.csv`
    };
  }

  // DEMO MODE: action plans are not stored yet (there is no action-plan API)
  planSaved(plan: ActionPlan): void {
    this.plan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created for ${plan.owner}, due ${plan.due}.`);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.customMenuOpen) return;
    const menu = this.host.nativeElement.querySelector('.kd-custom');
    if (menu && !menu.contains(event.target as Node)) this.customMenuOpen = false;
  }
}
