import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Box, Calendar, ChartColumn, Clock, Download, GitCompareArrows, GripVertical, Heart, House, Info,
  LucideAngularModule, LucideIconData, RefreshCw, Settings, ShieldCheck, TriangleAlert, Wrench
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, HBarChart, RA_COLORS } from '../shared/charts';
import { ALL_CATEGORIES, ALL_TYPES } from './kit/asset-universe';
import { alignTo, previousRange } from './kit/api-utils';
import { RaInsight, RaInsightAction, RaInsightCard, RaKpiCard, RaTone } from './kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from './kit/ra-dialogs';
import { RaMenu } from './kit/ra-menu';
import { ScopedAnalyticsPage, SortDir } from './kit/scoped-page';
import {
  AP_DEFAULT_PERIOD, AP_FALLBACK_PERIODS, ALL_ASSETS_VIEW, ALL_LOCATIONS, ALL_ORGANIZATIONS, ApAssetRow, ApInsight, ApInsightAsset, ApLocationRow,
  AssetPerformanceView
} from './asset-performance.data';
import { ApFilterLists, ApFilters, ApPreviousTrends, ApSavedView, AssetPerformanceService } from './asset-performance.service';

type AssetSortKey = 'id' | 'name' | 'location' | 'health' | 'utilization' | 'availability';
type LocationSortKey = 'name' | 'health' | 'utilization' | 'availability';

/** Sorts a copy of `rows`; rows without a value go last either way. */
function sortNullable<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
  });
}

const dash = (v: number | null | undefined, suffix = ''): string => (v === null || v === undefined ? '—' : `${v.toLocaleString('en-US')}${suffix}`);

/** Insight cards by API key: action button ids, icon and tone. */
const INSIGHT_STYLE: Record<string, { id: string; icon: LucideIconData; tone: RaTone }> = {
  below_health_threshold: { id: 'critical', icon: TriangleAlert, tone: 'red' },
  maintenance_intervention: { id: 'intervention', icon: Wrench, tone: 'orange' },
  utilization_below_target: { id: 'utilization', icon: ChartColumn, tone: 'blue' }
};
const ACTION_LABELS: Record<string, { suffix: string; label: string; primary?: boolean }> = {
  view_assets: { suffix: 'view', label: 'View assets' },
  view_locations: { suffix: 'view', label: 'View locations' },
  create_work_order: { suffix: 'wo', label: 'Create work order', primary: true }
};

/** Reports & Analytics > Asset Performance: health, utilization, reliability, downtime and asset ranking. */
@Component({
  standalone: true,
  selector: 'app-ra-asset-performance',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, HBarChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  providers: [AssetPerformanceService],
  templateUrl: './asset-performance.html',
  styleUrls: ['../shared/analytics-page.css', './kit/ra-page.css', './asset-performance.css']
})
export class AssetPerformancePage extends ScopedAnalyticsPage {
  private readonly api = inject(AssetPerformanceService);
  readonly icons = {
    House, RefreshCw, GitCompareArrows, Download, Bookmark, ChartColumn, Calendar, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown, Settings, Clock
  };
  readonly rowMenu = ['View details', 'Create work order'];
  readonly percentFormat = (v: number) => `${v}%`;
  readonly dash = dash;
  protected readonly fileStem = 'asset-performance';

  // Filter values come from /options and /filters
  override periods: string[] = AP_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override categories: string[] = [ALL_CATEGORIES];
  override assetTypes: string[] = [ALL_TYPES];
  override period = AP_DEFAULT_PERIOD;

  insights: RaInsight[] = [];
  currentView = ALL_ASSETS_VIEW;
  assetSort: AssetSortKey = 'health';
  assetDir: SortDir = -1;
  locationSort: LocationSortKey = 'health';
  locationDir: SortDir = -1;
  /** Previous-period lines while Compare Periods is on */
  private previous: ApPreviousTrends | null = null;
  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  constructor() {
    super();
    this.views = [this.api.allAssetsView()];
    this.init();
  }

  get view(): AssetPerformanceView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get utilizationTarget(): number {
    return this.view.utilizationTarget;
  }

  get healthThreshold(): number {
    return this.view.healthThreshold;
  }

  /** Health trend, plus the previous period's Healthy share when comparing. */
  get healthSeries(): ChartSeries[] {
    const list = this.view.healthTrend;
    if (!this.compare || !this.previous) return list;
    return [...list, { name: 'Healthy (previous period)', values: alignTo(this.previous.healthy, this.view.labels.length), color: RA_COLORS.green, dashed: true }];
  }

  get reliabilitySeries(): ChartSeries[] {
    const list = this.view.reliability;
    if (!this.compare || !this.previous) return list;
    return [...list, { name: 'MTBF (previous period)', values: alignTo(this.previous.mtbf, this.view.labels.length), color: RA_COLORS.purple, dashed: true }];
  }

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<{ periods: string[]; defaultPeriod: string } | null>(null)),
      filters: this.api.loadFilters().pipe(soft<ApFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<ApSavedView[]>([this.api.allAssetsView()]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
        this.assetTypes = filters.assetTypes;
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

  private filters(): ApFilters {
    return { period: this.period, organization: this.organization, location: this.location, category: this.category, assetType: this.assetType };
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
          map((previous) => ({ v, previous: previous as ApPreviousTrends | null })),
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

  private build(v: AssetPerformanceView): void {
    this.kpis = [
      { id: 'total', label: 'Total Assets', value: v.total.toLocaleString('en-US'), delta: v.totalChange, icon: Box, tone: 'purple' },
      { id: 'health', label: 'Average Health Score', value: dash(v.health.value, '%'), delta: v.health.change, icon: Heart, tone: 'blue' },
      { id: 'utilization', label: 'Utilization Rate', value: dash(v.utilization.value, '%'), delta: v.utilization.change, icon: ChartColumn, tone: 'orange' },
      {
        id: 'availability', label: 'Availability', value: v.availability.value === null ? '—' : percent(v.availability.value),
        delta: v.availability.change, icon: ShieldCheck, tone: 'green'
      },
      { id: 'mtbf', label: 'MTBF', value: dash(v.mtbf.value, ' hrs'), delta: v.mtbf.change, icon: Settings, tone: 'purple' }
    ];
    this.insights = v.insights.map((i) => this.toCard(i));
  }

  private toCard(i: ApInsight): RaInsight {
    const style = INSIGHT_STYLE[i.key] ?? { id: i.key, icon: Info, tone: (i.severity === 'critical' ? 'red' : i.severity === 'warning' ? 'orange' : 'blue') as RaTone };
    const clear = i.count === 0;
    const actions: RaInsightAction[] = i.actions
      .filter((a) => ACTION_LABELS[a] && !(clear && a !== 'view_locations'))
      .map((a) => ({ id: `${style.id}-${ACTION_LABELS[a].suffix}`, label: ACTION_LABELS[a].label, primary: ACTION_LABELS[a].primary }));
    return { id: style.id, tone: clear ? 'green' : style.tone, icon: clear && style.id === 'critical' ? ShieldCheck : style.icon, title: i.title, text: i.message, actions };
  }

  private insight(id: string): ApInsight | undefined {
    const key = Object.keys(INSIGHT_STYLE).find((k) => INSIGHT_STYLE[k].id === id) ?? id;
    return this.view.insights.find((i) => i.key === key);
  }

  // ----- Filters and saved views (GET/POST /views) -----
  protected override restoreFilters(f: Record<string, string>): void {
    const period = f['period'];
    this.period = period && this.periods.includes(period) ? period : AP_DEFAULT_PERIOD;
    this.organization = this.keep('organizations', f['organization'] ?? ALL_ORGANIZATIONS);
    this.location = this.keep('locations', f['location'] ?? ALL_LOCATIONS);
    this.category = this.keep('categories', f['category'] ?? ALL_CATEGORIES);
    this.assetType = this.keep('assetTypes', f['assetType'] ?? ALL_TYPES);
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private keep(list: 'organizations' | 'locations' | 'categories' | 'assetTypes', value: string): string {
    if (!this[list].includes(value)) this[list] = [...this[list], value];
    return value;
  }

  override resetFilters(): void {
    this.currentView = ALL_ASSETS_VIEW;
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

  // ----- Tables (sorted in the browser: the overview returns every row these tables show) -----
  get assetRows(): ApAssetRow[] {
    return sortNullable(this.view.topBottom, this.assetSort, this.assetDir);
  }

  get locationRows(): ApLocationRow[] {
    return sortNullable(this.view.locations, this.locationSort, this.locationDir);
  }

  sortAssets(key: AssetSortKey): void {
    this.assetDir = this.assetSort === key ? (this.assetDir === 1 ? -1 : 1) : key === 'id' || key === 'name' || key === 'location' ? 1 : -1;
    this.assetSort = key;
  }

  sortLocations(key: LocationSortKey): void {
    this.locationDir = this.locationSort === key ? (this.locationDir === 1 ? -1 : 1) : key === 'name' ? 1 : -1;
    this.locationSort = key;
  }

  assetSortIcon(key: AssetSortKey) {
    return this.assetSort !== key ? this.icons.ArrowUpDown : this.assetDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  locationSortIcon(key: LocationSortKey) {
    return this.locationSort !== key ? this.icons.ArrowUpDown : this.locationDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  scoreTone(score: number | null): string {
    return score === null ? 'grey' : score >= 60 ? 'green' : score >= 40 ? 'orange' : 'red';
  }

  scoreColor(score: number | null): string {
    return score === null ? '#64748b' : score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : score >= 40 ? '#d97706' : '#dc2626';
  }

  meterColor(utilization: number | null): string {
    const u = utilization ?? 0;
    return u >= this.utilizationTarget ? '#10b981' : u >= this.utilizationTarget - 10 ? '#f59e0b' : '#ef4444';
  }

  statusTone(status: string): string {
    return status === 'Top Performer' ? 'green' : status === 'On Track' ? 'blue' : status === 'Underperforming' ? 'red' : 'grey';
  }

  private priorityOf(health: number | null): string {
    return health !== null && health < 40 ? 'Critical' : 'Medium';
  }

  rowAction(item: string, row: ApAssetRow): void {
    if (item === 'Create work order') this.openAction('Work order', `Performance review – ${row.name}`, `${row.id} · ${row.location}`, this.priorityOf(row.health));
    else this.showAsset(row);
  }

  showAsset(a: ApAssetRow): void {
    this.openDetail(
      {
        title: a.name,
        subtitle: `${a.id} · ${a.location}`,
        fields: [
          { label: 'Category', value: a.category },
          { label: 'Asset type', value: a.type },
          { label: 'Health score', value: a.health === null ? 'Not assessed' : `${a.health} / 100` },
          { label: 'Utilization', value: a.utilization === null ? '—' : percent(a.utilization) },
          { label: 'Availability', value: a.availability === null ? '—' : percent(a.availability) },
          { label: 'MTBF', value: dash(a.mtbf, ' hrs') },
          { label: 'MTTR', value: dash(a.mttr, ' hrs') },
          { label: 'Downtime', value: `${a.downtime.toLocaleString('en-US')} hrs · ${a.failures} failure${a.failures === 1 ? '' : 's'}` },
          { label: 'Performance score', value: a.score === null ? 'Not rated' : `${a.score} (${a.band ?? a.status})` }
        ],
        primary: 'Create work order'
      },
      { kind: 'Work order', title: `Performance review – ${a.name}`, context: `${a.id} · ${a.location}`, priority: this.priorityOf(a.health) }
    );
  }

  showLocation(l: ApLocationRow): void {
    this.openDetail({
      title: l.name,
      subtitle: `${l.assets.toLocaleString('en-US')} assets · ${l.status}`,
      fields: [
        { label: 'Assets', value: l.assets.toLocaleString('en-US') },
        { label: 'Average health score', value: dash(l.health) },
        { label: 'Utilization', value: `${dash(l.utilization, '%')} (target ${this.utilizationTarget}%)` },
        { label: 'Availability', value: dash(l.availability, '%') },
        { label: 'Performance score', value: dash(l.score) }
      ]
    });
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const [card, action] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)];
    const insight = this.insight(card);
    if (!insight) return;
    if (card === 'utilization') {
      this.records = this.locationRecords();
      return;
    }
    if (action === 'wo') {
      const critical = card === 'critical';
      this.openAction(
        'Work order',
        critical ? `Condition assessment – ${insight.count} critical assets` : `Preventive service – ${insight.count} assets`,
        this.assetList(insight.assets),
        critical ? 'Critical' : 'High'
      );
      return;
    }
    // "View assets": GET /assets with the insight's query (healthBelow=… or interventionOnly=true)
    this.api.loadAssets(this.filters(), insight.query).subscribe({
      next: ({ items }) => {
        const reasons = new Map(insight.assets.map((a) => [a.key, a.reasons.join('; ')]));
        this.records = card === 'critical'
          ? this.assetRecords('Assets below health threshold', `Health score < ${this.healthThreshold}, lowest first.`, items, reasons, 'assets-below-health-threshold.csv')
          : this.assetRecords('Maintenance intervention recommended', insight.message, items, reasons, 'maintenance-intervention.csv');
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  private locationRecords(): RaRecords {
    const target = this.utilizationTarget;
    return {
      title: 'Utilization by location',
      subtitle: `Target ${target}%. Lowest utilization first.`,
      columns: [
        { key: 'location', label: 'Location' }, { key: 'assets', label: 'Assets', num: true }, { key: 'utilization', label: 'Utilization %', num: true },
        { key: 'gap', label: 'Gap to target (pts)', num: true }, { key: 'availability', label: 'Availability %', num: true }
      ],
      rows: sortNullable(this.view.locations, 'utilization', 1).map((l) => ({
        location: l.name,
        assets: l.assets,
        utilization: l.utilization ?? '—',
        gap: l.utilization === null ? '—' : Math.round((l.utilization - target) * 10) / 10,
        availability: l.availability ?? '—'
      })),
      file: 'utilization-by-location.csv'
    };
  }

  private assetList(list: ApInsightAsset[]): string {
    if (!list.length) return 'No assets in this view.';
    const names = list.slice(0, 4).map((a) => a.name).join(', ');
    return list.length > 4 ? `${names} and ${list.length - 4} more.` : `${names}.`;
  }

  private assetRecords(title: string, subtitle: string, list: ApAssetRow[], reasons: Map<string, string>, file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'category', label: 'Category' },
        { key: 'health', label: 'Health', num: true }, { key: 'utilization', label: 'Utilization %', num: true }, { key: 'availability', label: 'Availability %', num: true },
        { key: 'reasons', label: 'Reasons' }
      ],
      rows: list.map((a) => ({
        id: a.id, name: a.name, location: a.location, category: a.category, health: a.health ?? '—', utilization: a.utilization ?? '—',
        availability: a.availability ?? '—', reasons: reasons.get(a.key) ?? ''
      })),
      file
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { total: 'ap-distribution', health: 'ap-trend', utilization: 'ap-category', availability: 'ap-reliability', mtbf: 'ap-reliability' };
    return targets[id] ?? 'ap-trend';
  }

  /** GET /export: the API's Excel workbook (summary, assets, locations, categories, trends and insights). */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Asset performance workbook exported.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** One widget's figures as CSV, built in the browser from the data already loaded (the API exports whole pages only). */
  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    const lines = (file: string, list: ChartSeries[], unit = '') =>
      downloadCsv(file, ['Month', ...list.map((s) => `${s.name}${unit}`)], months.map((m, i) => [m, ...list.map((s) => s.values[i] ?? 0)]));
    switch (id) {
      case 'trend':
        lines('asset-health-trend.csv', this.healthSeries, ' (%)');
        break;
      case 'category':
        downloadCsv('utilization-by-category.csv', ['Category', ...v.categoryUtilization.map((s) => `${s.name} (%)`)],
          v.categoryLabels.map((l, i) => [l.split('\n')[0], ...v.categoryUtilization.map((s) => s.values[i])]));
        break;
      case 'distribution':
        downloadCsv('performance-score-distribution.csv', ['Band', 'Assets', 'Share'], v.distribution.map((r) => [r.label, r.value, r.display ?? '']));
        break;
      case 'reliability':
        lines('reliability-availability.csv', this.reliabilitySeries);
        break;
      case 'downtime':
        lines('downtime-analysis.csv', v.downtime, ' (hrs)');
        break;
      case 'assets':
        downloadCsv('top-bottom-assets.csv', ['Asset ID', 'Asset Name', 'Location', 'Health Score', 'Utilization %', 'Availability %', 'Performance Score', 'Status'],
          this.assetRows.map((a) => [a.id, a.name, a.location, a.health ?? '', a.utilization ?? '', a.availability ?? '', a.score ?? '', a.status]));
        break;
      case 'locations':
        downloadCsv('asset-performance-by-location.csv', ['Location', 'Assets', 'Avg Health Score', 'Utilization %', 'Availability %'],
          this.locationRows.map((l) => [l.name, l.assets, l.health ?? '', l.utilization ?? '', l.availability ?? '']));
        break;
    }
  }
}
