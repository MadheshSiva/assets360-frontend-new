import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Clock, Download, FileText, GitCompareArrows, GripVertical, House, Info,
  LucideAngularModule, LucideIconData, Package, RefreshCw, Settings, ShieldCheck, TriangleAlert, Wrench
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { downloadCsv, money, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import { ALL_CATEGORIES } from '../asset-performance/kit/asset-universe';
import { alignTo, previousRange } from '../asset-performance/kit/api-utils';
import { RaInsight, RaInsightAction, RaInsightCard, RaKpiCard, RaTone } from '../asset-performance/kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from '../asset-performance/kit/ra-dialogs';
import { RaMenu } from '../asset-performance/kit/ra-menu';
import { ScopedAnalyticsPage, SortDir } from '../asset-performance/kit/scoped-page';
import {
  ALL_LOCATIONS, ALL_MAINTENANCE_TYPES, ALL_MAINTENANCE_VIEW, ALL_ORGANIZATIONS, MA_DEFAULT_PERIOD, MA_FALLBACK_PERIODS, MA_FALLBACK_TYPES, MaInsight,
  MaInsightAsset, MaInsightOrder, MaKpiValue, MaWorkOrder, MaintenanceView, PRIORITY_RANK, TechnicianRow
} from './maintenance-analytics.data';
import { MaFilterLists, MaFilters, MaOptions, MaPreviousTrends, MaSavedView, MaintenanceAnalyticsService } from './maintenance-analytics.service';

type BacklogSortKey = 'priority' | 'id' | 'asset' | 'location' | 'age' | 'technician' | 'status';
type TechSortKey = 'name' | 'completed' | 'firstTimeFix' | 'response' | 'sla';

const PRIORITY_TONES: Record<string, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };
const STATUS_TONES: Record<string, string> = { Open: 'blue', 'In Progress': 'orange', 'On Hold': 'pink', Completed: 'green', Overdue: 'red' };

const dash = (v: number | null | undefined, suffix = ''): string => (v === null || v === undefined ? '—' : `${v.toLocaleString('en-US')}${suffix}`);

/** Insight cards by API key: action button ids, icon and tone. */
const INSIGHT_STYLE: Record<string, { id: string; icon: LucideIconData; tone: RaTone }> = {
  overdue_work_orders: { id: 'overdue', icon: TriangleAlert, tone: 'red' },
  emergency_cost: { id: 'emergency', icon: ChartColumn, tone: 'orange' },
  assets_approaching_failure: { id: 'failure', icon: Settings, tone: 'purple' },
  spare_parts_shortage: { id: 'parts', icon: Package, tone: 'blue' }
};
const ACTION_LABELS: Record<string, { suffix: string; label: string; primary?: boolean }> = {
  view_work_orders: { suffix: 'view', label: 'View work orders' },
  view_details: { suffix: 'view', label: 'View details' },
  view_assets: { suffix: 'view', label: 'View assets' },
  create_action_plan: { suffix: 'plan', label: 'Create action plan', primary: true },
  open_inventory: { suffix: 'inventory', label: 'Open inventory', primary: true }
};
const SEVERITY_TONES: Record<string, RaTone> = { critical: 'red', warning: 'orange', info: 'blue', success: 'green' };

/** Sorts a copy of `rows`; rows without a value go last either way. */
function sortNullable<T>(rows: T[], value: (row: T) => string | number | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
  });
}

/** Reports & Analytics > Maintenance Analytics: cost, work orders, PM compliance, reliability, backlog and technicians. */
@Component({
  standalone: true,
  selector: 'app-ra-maintenance-analytics',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  providers: [MaintenanceAnalyticsService],
  templateUrl: './maintenance-analytics.html',
  styleUrls: ['../shared/analytics-page.css', '../asset-performance/kit/ra-page.css', './maintenance-analytics.css']
})
export class MaintenanceAnalyticsPage extends ScopedAnalyticsPage {
  private readonly router = inject(Router);
  private readonly api = inject(MaintenanceAnalyticsService);
  readonly icons = { House, RefreshCw, GitCompareArrows, Download, Bookmark, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown };
  readonly colors = RA_COLORS;
  readonly rowMenu = ['View details', 'Escalate'];
  readonly costFormat = (v: number) => `AED ${compactNumber(v)}`;
  readonly percentFormat = (v: number) => `${v}%`;
  readonly dash = dash;
  protected readonly fileStem = 'maintenance-analytics';

  // Filter values come from /options and /filters
  override periods: string[] = MA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override categories: string[] = [ALL_CATEGORIES];
  override period = MA_DEFAULT_PERIOD;
  maintenanceTypes: string[] = [ALL_MAINTENANCE_TYPES, ...MA_FALLBACK_TYPES];
  maintenanceType = ALL_MAINTENANCE_TYPES;

  insights: RaInsight[] = [];
  currentView = ALL_MAINTENANCE_VIEW;
  backlogSort: BacklogSortKey = 'priority';
  backlogDir: SortDir = -1;
  techSort: TechSortKey = 'completed';
  techDir: SortDir = -1;
  /** Previous-period lines while Compare Periods is on */
  private previous: MaPreviousTrends | null = null;
  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  constructor() {
    super();
    this.views = [this.api.allMaintenanceView()];
    this.init();
  }

  get view(): MaintenanceView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get pmTarget(): number {
    return this.view.complianceTarget;
  }

  get typeLabels(): string[] {
    return this.view.typeSeries.map((s) => s.name);
  }

  /** Nothing recorded for the filters: no work orders, backlog or cost. */
  get empty(): boolean {
    return this.loaded && !this.view.workOrders && !this.view.backlogTotal && !this.view.totalCost;
  }

  /** Cost trend, plus the previous period's total when comparing. */
  get costSeries(): ChartSeries[] {
    const list = this.view.costTrend;
    if (!this.compare || !this.previous) return list;
    return [...list, { name: 'Total (previous period)', values: alignTo(this.previous.totalCost, this.view.labels.length), color: RA_COLORS.purple, type: 'line', dashed: true }];
  }

  get pmSeries(): ChartSeries[] {
    const list = this.view.pmTrend;
    if (!this.compare || !this.previous) return list;
    return [...list, { name: 'Previous period', values: alignTo(this.previous.pm, this.view.labels.length), color: RA_COLORS.green, dashed: true }];
  }

  /** "+4.2%" or "+4.2 pts" for the gauge. */
  get pmDeltaText(): string {
    const c = this.view.pmCompliance;
    return `${c.change > 0 ? '+' : ''}${Number(c.change.toFixed(1))}${c.unit === 'points' ? ' pts' : '%'}`;
  }

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<MaOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<MaFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<MaSavedView[]>([this.api.allMaintenanceView()]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.maintenanceTypes = options.maintenanceTypes;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
      }
      this.views = views;
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) {
        this.currentView = preferred.name;
        this.restoreFilters(preferred.filters);
      }
      if (errors.length) this.notify(errors[0]);
      this.recompute();
    });
  }

  private filters(): MaFilters {
    return { period: this.period, organization: this.organization, location: this.location, category: this.category, maintenanceType: this.maintenanceType };
  }

  /** Reloads the page from GET /overview (and the previous period's trends when comparing). */
  recompute(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    const f = this.filters();
    this.loadSub = this.api.loadOverview(f).pipe(
      switchMap((v) => {
        if (!this.compare || !v.previousFromUtc || !v.previousToUtc) return of({ v, previous: null });
        return this.api.loadPrevious(f, previousRange(v.previousFromUtc, v.previousToUtc)).pipe(
          map((previous) => ({ v, previous: previous as MaPreviousTrends | null })),
          catchError((err: Error) => {
            this.notify(err.message);
            return of({ v, previous: null });
          })
        );
      })
    ).subscribe({
      next: ({ v, previous }) => {
        this.previous = previous;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.recompute('Data refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  private build(v: MaintenanceView): void {
    const delta = (k: MaKpiValue) => k.change;
    this.kpis = [
      { id: 'cost', label: 'Maintenance Cost', value: v.cost.value === null ? '—' : money(v.cost.value), delta: delta(v.cost), lowerIsBetter: true, icon: Wrench, tone: 'purple' },
      { id: 'open', label: 'Open Work Orders', value: dash(v.open.value), delta: delta(v.open), lowerIsBetter: true, icon: FileText, tone: 'blue' },
      {
        id: 'pm', label: 'Preventive Compliance', value: v.pmCompliance.value === null ? '—' : percent(v.pmCompliance.value), delta: delta(v.pmCompliance),
        icon: ShieldCheck, tone: 'green'
      },
      { id: 'mttr', label: 'MTTR', value: dash(v.mttr.value, ' hrs'), delta: delta(v.mttr), lowerIsBetter: true, icon: Clock, tone: 'orange' },
      { id: 'mtbf', label: 'MTBF', value: dash(v.mtbf.value, ' hrs'), delta: delta(v.mtbf), icon: Settings, tone: 'purple' }
    ];
    this.insights = v.insights.map((i) => this.toCard(i));
  }

  private toCard(i: MaInsight): RaInsight {
    const style = INSIGHT_STYLE[i.key] ?? { id: i.key, icon: Info, tone: SEVERITY_TONES[i.severity] ?? 'blue' };
    // The emergency card's tone follows the API's verdict (above / within the baseline); the others turn green when there is nothing to act on
    const tone: RaTone = i.key === 'emergency_cost' ? (SEVERITY_TONES[i.severity] ?? style.tone) : i.count === 0 ? 'green' : style.tone;
    const actions: RaInsightAction[] = i.actions
      .filter((a) => ACTION_LABELS[a])
      .map((a) => ({ id: `${style.id}-${ACTION_LABELS[a].suffix}`, label: ACTION_LABELS[a].label, primary: ACTION_LABELS[a].primary }));
    return { id: style.id, tone, icon: i.count === 0 && style.id === 'overdue' ? ShieldCheck : style.icon, title: i.title, text: i.message, actions };
  }

  private insight(card: string): MaInsight | undefined {
    const key = Object.keys(INSIGHT_STYLE).find((k) => INSIGHT_STYLE[k].id === card) ?? card;
    return this.view.insights.find((i) => i.key === key);
  }

  // ----- Filters and saved views (GET/POST /views; the view includes the maintenance type) -----
  protected override restoreFilters(f: Record<string, string>): void {
    const period = f['period'];
    this.period = period && this.periods.includes(period) ? period : MA_DEFAULT_PERIOD;
    this.organization = this.keep('organizations', f['organization'] ?? ALL_ORGANIZATIONS);
    this.location = this.keep('locations', f['location'] ?? ALL_LOCATIONS);
    this.category = this.keep('categories', f['category'] ?? ALL_CATEGORIES);
    this.maintenanceType = this.keep('maintenanceTypes', f['maintenanceType'] ?? ALL_MAINTENANCE_TYPES);
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private keep(list: 'organizations' | 'locations' | 'categories' | 'maintenanceTypes', value: string): string {
    if (!this[list].includes(value)) this[list] = [...this[list], value];
    return value;
  }

  override resetFilters(): void {
    this.currentView = ALL_MAINTENANCE_VIEW;
    this.restoreFilters({});
    this.recompute();
  }

  override applyView(name: string): void {
    const view = this.views.find((v) => v.name === name);
    this.restoreFilters(view ? view.filters : {});
    this.recompute();
  }

  override confirmSaveView(name: string): void {
    this.savingView = false;
    this.api.createView(name, this.filters()).subscribe({
      next: (saved) => {
        this.views = this.api.views();
        this.currentView = saved.name;
        this.notify(`View “${saved.name}” saved with the current filters.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ----- Tables (sorted in the browser: the overview returns up to 200 backlog rows and every technician) -----
  get backlogRows(): MaWorkOrder[] {
    const key = this.backlogSort;
    const value = (o: MaWorkOrder): string | number | null =>
      key === 'priority' ? (PRIORITY_RANK[o.priority] ?? 0) * 100_000 + (o.ageDays ?? 0) : key === 'age' ? o.ageDays : key === 'asset' ? o.asset
        : key === 'location' ? o.location : key === 'technician' ? o.technician : key === 'status' ? o.status : o.id;
    return sortNullable(this.view.backlog, value, this.backlogDir).slice(0, 5);
  }

  get technicianRows(): TechnicianRow[] {
    const key = this.techSort;
    return sortNullable(this.view.technicians, (t) => t[key], this.techDir).slice(0, 5);
  }

  sortBacklog(key: BacklogSortKey): void {
    this.backlogDir = this.backlogSort === key ? (this.backlogDir === 1 ? -1 : 1) : key === 'priority' || key === 'age' ? -1 : 1;
    this.backlogSort = key;
  }

  sortTechs(key: TechSortKey): void {
    this.techDir = this.techSort === key ? (this.techDir === 1 ? -1 : 1) : key === 'name' || key === 'response' ? 1 : -1;
    this.techSort = key;
  }

  backlogIcon(key: BacklogSortKey) {
    return this.backlogSort !== key ? this.icons.ArrowUpDown : this.backlogDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  techIcon(key: TechSortKey) {
    return this.techSort !== key ? this.icons.ArrowUpDown : this.techDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  priorityTone(p: string): string {
    return PRIORITY_TONES[p] ?? 'grey';
  }

  statusTone(s: string): string {
    return STATUS_TONES[s] ?? 'grey';
  }

  ageTone(days: number | null): string {
    return days === null ? 'grey' : days > 14 ? 'red' : days > 7 ? 'orange' : 'green';
  }

  rateColor(v: number | null): string {
    return v === null ? '#94a3b8' : v >= 85 ? '#10b981' : v >= 75 ? '#f59e0b' : '#ef4444';
  }

  private age(o: MaWorkOrder): string {
    return o.ageDays === null ? 'age unknown' : `${o.ageDays} days old`;
  }

  rowAction(item: string, o: MaWorkOrder): void {
    if (item === 'Escalate') this.openAction('Action plan', `Escalate ${o.id} – ${o.asset}`, `${o.type} · ${o.status} · ${this.age(o)} · assigned to ${o.technician}`, 'High');
    else this.showOrder(o);
  }

  showOrder(o: MaWorkOrder): void {
    this.openDetail(
      {
        title: o.id,
        subtitle: `${o.type} maintenance · ${o.asset}`,
        fields: [
          { label: 'Asset', value: `${o.asset} (${o.assetId})` },
          { label: 'Location', value: o.location },
          { label: 'Priority', value: o.priority },
          { label: 'Status', value: o.status },
          { label: 'Due', value: o.dueDate ?? '—' },
          { label: 'Age', value: o.ageDays === null ? '—' : `${o.ageDays} days` },
          { label: 'Assigned to', value: o.technician },
          { label: 'Spare parts', value: o.partsShortage ? 'Shortage – required parts are out of stock or below minimum' : 'Available' }
        ],
        primary: o.status === 'Completed' ? undefined : 'Escalate'
      },
      { kind: 'Action plan', title: `Escalate ${o.id} – ${o.asset}`, context: `${o.type} · ${o.status} · ${this.age(o)}`, priority: 'High' }
    );
  }

  /** The technician's open work orders (GET /backlog?assignedTo=…); the API has no list of completed jobs. */
  showTechnician(t: TechnicianRow): void {
    this.api.loadBacklog(this.filters(), { assignedTo: t.name }).subscribe({
      next: ({ items }) => {
        this.records = this.orderRecords(
          `Open work orders assigned to ${t.name}`,
          `${t.completed} of ${t.assigned} completed in the period · first-time fix ${dash(t.firstTimeFix, '%')} · SLA compliance ${dash(t.sla, '%')}`,
          items,
          `work-orders-${t.name.toLowerCase().replace(/\s+/g, '-')}.csv`
        );
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** GET /backlog: every unfinished work order, most urgent first. */
  openBacklog(): void {
    this.api.loadBacklog(this.filters()).subscribe({
      next: ({ items, total }) => {
        const more = total > items.length ? ` Showing the first ${items.length} of ${total}.` : '';
        this.records = this.orderRecords('Maintenance backlog', `All work orders not yet completed, highest priority first.${more}`, items, 'maintenance-backlog.csv');
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const [card, action] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)];
    const insight = this.insight(card);
    if (!insight) return;
    if (action === 'inventory') {
      this.router.navigate([this.basePath, 'inventory-analytics']);
      return;
    }
    if (action === 'plan') {
      this.openPlan(card, insight);
      return;
    }
    switch (card) {
      case 'overdue':
      case 'parts':
        // "View work orders": GET /backlog with the insight's query (status=Overdue or partsShortage=true)
        this.api.loadInsightOrders(this.filters(), insight).subscribe({
          next: ({ items }) => {
            this.records = card === 'overdue'
              ? this.orderRecords('Overdue work orders', 'Past their due date, most urgent first.', items, 'overdue-work-orders.csv')
              : this.orderRecords('Work orders waiting for spare parts',
                insight.parts.length ? `Short parts: ${insight.parts.slice(0, 6).join(', ')}${insight.parts.length > 6 ? '…' : ''}` : insight.message,
                items, 'work-orders-waiting-for-parts.csv');
          },
          error: (err: Error) => this.notify(err.message)
        });
        break;
      case 'emergency':
        this.api.loadPreviousEmergency(this.filters()).subscribe({
          next: (previous) => (this.records = this.emergencyRecords(insight, previous.values)),
          error: (err: Error) => this.notify(err.message)
        });
        break;
      case 'failure':
        this.records = this.assetRecords(insight.assets);
        break;
    }
  }

  private openPlan(card: string, insight: MaInsight): void {
    switch (card) {
      case 'overdue':
        this.openAction('Action plan', `Clear ${insight.count} overdue work orders`, this.orderList(insight.workOrders), 'Critical');
        break;
      case 'emergency':
        this.openAction('Action plan', 'Reduce emergency maintenance spend', `${insight.title}. Emergency cost this period ${money(this.view.emergencyCost)}.`, 'High');
        break;
      case 'failure':
        this.openAction('Action plan', `Prevent failure of ${insight.count} high-risk assets`, this.assetList(insight.assets), 'Critical');
        break;
      default:
        this.openAction('Action plan', insight.title, insight.message, 'High');
    }
  }

  private orderList(list: MaInsightOrder[]): string {
    const ids = list.slice(0, 5).map((o) => o.id).join(', ');
    return list.length > 5 ? `${ids} and ${list.length - 5} more.` : ids ? `${ids}.` : 'No work orders in this view.';
  }

  private assetList(list: MaInsightAsset[]): string {
    if (!list.length) return 'No assets in this view.';
    const names = list.slice(0, 5).map((a) => a.name).join(', ');
    return list.length > 5 ? `${names} and ${list.length - 5} more.` : `${names}.`;
  }

  private orderRecords(title: string, subtitle: string, list: MaWorkOrder[], file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Work Order' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'asset', label: 'Asset' },
        { key: 'location', label: 'Location' }, { key: 'age', label: 'Age (days)', num: true }, { key: 'technician', label: 'Assigned To' },
        { key: 'status', label: 'Status' }, { key: 'due', label: 'Due Date' }
      ],
      rows: list.map((o) => ({
        id: o.id, type: o.type, priority: o.priority, asset: o.asset, location: o.location, age: o.ageDays ?? '—', technician: o.technician, status: o.status,
        due: o.dueDate ?? '—'
      })),
      file
    };
  }

  private assetRecords(list: MaInsightAsset[]): RaRecords {
    return {
      title: `Assets approaching failure threshold (${list.length})`,
      subtitle: 'Low health score, failure predictions or repeated failures, lowest health first.',
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'health', label: 'Health', num: true },
        { key: 'reasons', label: 'Reasons' }
      ],
      rows: list.map((a) => ({ id: a.id, name: a.name, location: a.location, health: a.health ?? '—', reasons: a.reasons.join('; ') })),
      file: 'assets-approaching-failure.csv'
    };
  }

  /** Monthly emergency cost against the previous period's (the API's baseline when no target is set). */
  private emergencyRecords(insight: MaInsight, previous: number[]): RaRecords {
    const v = this.view;
    const before = alignTo(previous, v.labels.length);
    return {
      title: 'Emergency maintenance cost vs previous period',
      subtitle: insight.message,
      columns: [
        { key: 'month', label: 'Month' }, { key: 'emergency', label: 'Emergency (AED)', num: true }, { key: 'previous', label: 'Previous period (AED)', num: true },
        { key: 'share', label: 'Share of spend %', num: true }
      ],
      rows: v.labels.map((l, i) => ({
        month: l.replace('\n', ' '),
        emergency: v.monthlyEmergency[i] ?? 0,
        previous: before[i],
        share: v.monthlyTotal[i] ? Math.round(((v.monthlyEmergency[i] ?? 0) / v.monthlyTotal[i]) * 1000) / 10 : 0
      })),
      file: 'emergency-cost-vs-previous-period.csv'
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { cost: 'ma-cost', open: 'ma-status', pm: 'ma-pm', mttr: 'ma-reliability', mtbf: 'ma-reliability' };
    return targets[id] ?? 'ma-cost';
  }

  /** GET /export: the API's Excel workbook (summary, trends, insights, backlog and technicians). */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Maintenance analytics workbook exported.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** One widget's figures as CSV, built in the browser from the data already loaded (the API exports whole pages only). */
  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    const series = (file: string, list: ChartSeries[]) =>
      downloadCsv(file, ['Month', ...list.map((s) => s.name)], months.map((m, i) => [m, ...list.map((s) => s.values[i] ?? 0)]));
    switch (id) {
      case 'cost':
        series('maintenance-cost-trend.csv', this.costSeries);
        break;
      case 'types':
        downloadCsv('work-orders-by-type.csv', ['Type', 'Work Orders'], v.typeSeries.map((s, i) => [s.name, s.values[i]]));
        break;
      case 'status':
        downloadCsv('work-order-status.csv', ['Status', 'Work Orders'], v.statusSlices.map((s) => [s.name, s.value]));
        break;
      case 'pm':
        series('preventive-maintenance-compliance.csv', this.pmSeries);
        break;
      case 'reliability':
        series('mttr-vs-mtbf.csv', v.reliability);
        break;
      case 'downtime':
        series('downtime-by-cause.csv', v.downtimeByCause);
        break;
      case 'backlog':
        downloadCsv('maintenance-backlog.csv', ['Priority', 'Work Order', 'Type', 'Asset', 'Location', 'Age (days)', 'Assigned To', 'Status', 'Due Date'],
          v.backlog.map((o) => [o.priority, o.id, o.type, o.asset, o.location, o.ageDays ?? '', o.technician, o.status, o.dueDate ?? '']));
        break;
      case 'technicians':
        downloadCsv('technician-performance.csv', ['Technician', 'Assigned', 'Completed', 'First-Time Fix %', 'Avg. Response (hrs)', 'SLA Compliance %'],
          v.technicians.map((t) => [t.name, t.assigned, t.completed, t.firstTimeFix ?? '', t.response ?? '', t.sla ?? '']));
        break;
    }
  }
}
