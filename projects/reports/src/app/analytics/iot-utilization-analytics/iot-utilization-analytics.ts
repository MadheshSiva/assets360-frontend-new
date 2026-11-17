import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Download, Ellipsis, GitCompareArrows, GripVertical, Info,
  LucideAngularModule, Maximize2, RadioTower, RefreshCw, Signal, TriangleAlert, Wifi, X
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AnalyticsPage, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS, Sparkline } from '../shared/charts';
import { alignTo } from '../asset-performance/kit/api-utils';
import { IotActionPlanDialog, ActionPlan } from './iot-action-plan/iot-action-plan';
import { IotSiteMap, MapPoint } from './iot-site-map/iot-site-map';
import {
  ALL_CATEGORIES, ALL_DEVICE_TYPES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, CONNECTIVITY, Connectivity, IOT_DEFAULT_PERIOD, IOT_FALLBACK_PERIODS,
  IotAlert, IotAsset, IotDeviceRow, IotKpiValue, IotSiteRow, IotView, agoText, telemetryTime
} from './iot-utilization.data';
import { IotFilterLists, IotFilters, IotOptions, IotSavedView, IotUtilizationAnalyticsService } from './iot-utilization-analytics.service';

type KpiKey = 'connected' | 'utilization' | 'availability' | 'alerts';
export type WidgetKey = 'trend' | 'telemetry' | 'connectivity' | 'category' | 'health' | 'events' | 'map' | 'variance' | 'devices';
type VarianceSort = 'id' | 'name' | 'site' | 'utilization' | 'target' | 'variance' | 'lastSeen' | 'status';
type DeviceSort = 'type' | 'connected' | 'availability' | 'signal' | 'failed';
type ListKind = 'alerts' | 'assets' | 'devices';

interface Kpi {
  key: KpiKey;
  label: string;
  value: string;
  prev: string;
  delta: number;
  /** "%" for a relative change, " pts" for the difference of two rates */
  unit: string;
  /** Is the change an improvement? (fewer alerts is good) */
  good: boolean;
  tone: string;
  icon: typeof Wifi;
}

/** An asset row with the utilization for the selected period (only assets with a utilization figure) */
interface UtilRow {
  asset: IotAsset;
  utilization: number;
  variance: number;
}

interface Insight {
  key: string;
  tone: string;
  title: string;
  text: string;
  view: string;
  assetKeys: string[];
}

interface ListDialog {
  kind: ListKind;
  title: string;
  subtitle: string;
  alerts: IotAlert[];
  rows: UtilRow[];
  assets: IotAsset[];
}

const STATUS_TONES: Record<Connectivity, string> = { Online: 'green', Intermittent: 'orange', Offline: 'red', 'Never Connected': 'grey' };
const STATUS_COLORS: Record<Connectivity, string> = {
  Online: RA_COLORS.green, Intermittent: RA_COLORS.orange, Offline: RA_COLORS.red, 'Never Connected': RA_COLORS.grey
};
const TELEMETRY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange];
const WIDGET_TITLES: Record<WidgetKey, string> = {
  trend: 'Utilization Trend',
  telemetry: 'Telemetry Overview',
  connectivity: 'Connectivity Status',
  category: 'Utilization by Asset Category',
  health: 'Sensor Health',
  events: 'IoT Events & Alerts',
  map: 'Connected Asset Locations',
  variance: 'Top Utilization Variance Assets',
  devices: 'Device & Sensor Performance'
};
/** Insight cards by API key: tone and the label of their "View …" button. */
const INSIGHT_STYLE: Record<string, { tone: string; view: string }> = {
  alerts: { tone: 'red', view: 'View alerts' },
  below_target: { tone: 'orange', view: 'Open asset details' },
  abnormal_vibration: { tone: 'red', view: 'View sensors' },
  offline_devices: { tone: 'orange', view: 'View devices' }
};
const DEFAULT_REFRESH_MS = 30_000;
const VARIANCE_ROWS = 8;

const dash = (v: number | null | undefined, suffix = ''): string => (v === null || v === undefined ? '—' : `${v}${suffix}`);

/** Reports & Analytics > IoT / Utilization Analytics */
@Component({
  selector: 'app-ra-iot-utilization-analytics',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, Sparkline, IotSiteMap, IotActionPlanDialog],
  providers: [IotUtilizationAnalyticsService],
  templateUrl: './iot-utilization-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './iot-utilization-analytics.css']
})
export class IotUtilizationAnalyticsPage extends AnalyticsPage implements OnInit {
  private readonly api = inject(IotUtilizationAnalyticsService);
  readonly icons = {
    ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Download, Ellipsis, GitCompareArrows, GripVertical, Info, Maximize2,
    RadioTower, RefreshCw, Signal, TriangleAlert, Wifi, X
  };
  readonly colors = RA_COLORS;
  readonly titles = WIDGET_TITLES;
  readonly telemetryTime = telemetryTime;
  readonly agoText = agoText;
  readonly percent = percent;
  readonly dash = dash;

  // Filter values come from /options and /filters
  override periods: string[] = IOT_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override period = IOT_DEFAULT_PERIOD;
  override organization = ALL_ORGANIZATIONS;
  override location = ALL_LOCATIONS;
  categories: string[] = [ALL_CATEGORIES];
  deviceTypes: string[] = [ALL_DEVICE_TYPES];
  statuses: string[] = [ALL_STATUSES, ...CONNECTIVITY];
  owners: string[] = [];
  priorities = ['Critical', 'High', 'Medium', 'Low'];
  category = ALL_CATEGORIES;
  deviceType = ALL_DEVICE_TYPES;
  connectivity = ALL_STATUSES;
  compare = false;

  // Live data: "Updated n sec ago" ticks every second; auto refresh reloads the overview
  autoRefresh = true;
  updatedSeconds = 0;
  private refreshMs = DEFAULT_REFRESH_MS;
  private lastUpdated = 0;
  private secondTimer: ReturnType<typeof setInterval> | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private loadSub: Subscription | null = null;
  private historySub: Subscription | null = null;
  /** Previous period's Production line while Compare Periods is on */
  private previousProduction: number[] | null = null;

  // View model, rebuilt from each overview
  assets: IotAsset[] = [];
  alerts: IotAlert[] = [];
  utilRows: UtilRow[] = [];
  kpis: Kpi[] = [];
  trendLabels: string[] = [];
  trendSeries: ChartSeries[] = [];
  telemetrySeries: ChartSeries[] = [];
  eventSeries: ChartSeries[] = [];
  categoryLabels: string[] = [];
  categorySeries: ChartSeries[] = [];
  connectivitySlices: ChartSlice[] = [];
  healthCounts = { Healthy: 0, Warning: 0, Failed: 0 };
  sensorHealth = 0;
  sensorHealthKnown = false;
  sensorHealthTarget = 95;
  mapPoints: MapPoint[] = [];
  mapLegend = { online: 0, intermittent: 0, offline: 0 };
  deviceRows: IotDeviceRow[] = [];
  siteRows: IotSiteRow[] = [];
  insights: Insight[] = [];

  // Tables
  varianceSort: VarianceSort = 'variance';
  varianceAsc = true;
  deviceSort: DeviceSort = 'connected';
  deviceAsc = false;

  // Menus and dialogs
  menu: string | null = null;
  expanded: WidgetKey | null = null;
  breakdown: Kpi | null = null;
  list: ListDialog | null = null;
  detail: UtilRow | null = null;
  /** The detail dialog's 12-week utilization (null while loading or without data) */
  detailSpark: number[] | null = null;
  actionPlan: { title: string; context: string; key: string; assetKeys: string[] } | null = null;
  savingPlan = false;
  saveViewOpen = false;
  viewName = '';
  viewTried = false;

  get loading(): boolean {
    return this.api.loading();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get loadError(): string | null {
    return this.api.error();
  }

  get view(): IotView {
    return this.api.view();
  }

  ngOnInit(): void {
    this.secondTimer = setInterval(() => {
      if (this.lastUpdated) this.updatedSeconds = Math.floor((Date.now() - this.lastUpdated) / 1000);
    }, 1000);
    this.init();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.secondTimer) clearInterval(this.secondTimer);
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.loadSub?.unsubscribe();
    this.historySub?.unsubscribe();
  }

  override get updatedText(): string {
    if (!this.lastUpdated) return this.loading ? 'Loading…' : 'Not loaded yet';
    if (this.updatedSeconds < 5) return 'Updated just now';
    if (this.updatedSeconds < 60) return `Updated ${this.updatedSeconds} sec ago`;
    return `Updated ${Math.floor(this.updatedSeconds / 60)} min ago`;
  }

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<IotOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<IotFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<IotSavedView[]>([]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.statuses = options.statuses;
        this.priorities = options.priorities;
        this.refreshMs = options.autoRefreshSeconds * 1000;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
        this.deviceTypes = filters.deviceTypes;
        this.owners = filters.owners;
      }
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) this.restoreFilters(preferred.filters);
      if (errors.length) this.notify(errors[0]);
      this.recompute();
      this.setAutoRefresh(this.autoRefresh);
    });
  }

  private filters(): IotFilters {
    return {
      period: this.period, organization: this.organization, location: this.location, category: this.category, deviceType: this.deviceType,
      connectivity: this.connectivity
    };
  }

  private restoreFilters(f: IotFilters): void {
    this.period = this.periods.includes(f.period) ? f.period : IOT_DEFAULT_PERIOD;
    this.organization = this.keep('organizations', f.organization);
    this.location = this.keep('locations', f.location);
    this.category = this.keep('categories', f.category);
    this.deviceType = this.keep('deviceTypes', f.deviceType);
    this.connectivity = this.keep('statuses', f.connectivity);
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private keep(list: 'organizations' | 'locations' | 'categories' | 'deviceTypes' | 'statuses', value: string): string {
    if (!this[list].includes(value)) this[list] = [...this[list], value];
    return value;
  }

  /** Reloads the page from GET /overview (and the previous period's Production line when comparing). */
  private recompute(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    const f = this.filters();
    this.loadSub = this.api.loadOverview(f).pipe(
      switchMap((v) => {
        if (!this.compare) return of({ v, previous: null as number[] | null });
        return this.api.loadPreviousProduction(f).pipe(
          map((previous) => ({ v, previous: previous as number[] | null })),
          catchError((err: Error) => {
            this.notify(err.message);
            return of({ v, previous: null as number[] | null });
          })
        );
      })
    ).subscribe({
      next: ({ v, previous }) => {
        this.previousProduction = previous;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedSeconds = 0;
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

  setAutoRefresh(on: boolean): void {
    this.autoRefresh = on;
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = on ? setInterval(() => {
      if (!this.refreshing) this.recompute();
    }, this.refreshMs) : null;
  }

  onFilterChange(): void {
    this.recompute();
  }

  resetFilters(): void {
    this.period = this.periods.includes(IOT_DEFAULT_PERIOD) ? IOT_DEFAULT_PERIOD : this.periods[0];
    this.organization = ALL_ORGANIZATIONS;
    this.location = ALL_LOCATIONS;
    this.category = ALL_CATEGORIES;
    this.deviceType = ALL_DEVICE_TYPES;
    this.connectivity = ALL_STATUSES;
    this.recompute();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.recompute();
  }

  private build(v: IotView): void {
    this.assets = v.assets;
    this.alerts = v.alerts;
    this.utilRows = v.assets
      .filter((a) => a.utilization !== null)
      .map((a) => ({ asset: a, utilization: a.utilization ?? 0, variance: a.variance ?? 0 }));

    const kpi = (key: KpiKey, label: string, k: IotKpiValue, format: (n: number) => string, tone: string, icon: typeof Wifi, lowerIsBetter = false): Kpi => ({
      key, label, tone, icon,
      value: k.value === null ? '—' : format(k.value),
      prev: k.previous === null ? '—' : format(k.previous),
      delta: k.change,
      unit: k.unit === 'points' ? ' pts' : '%',
      good: lowerIsBetter ? k.change <= 0 : k.change >= 0
    });
    this.kpis = [
      kpi('connected', 'Connected Assets', v.connected, (n) => this.num(n), 'green', Wifi),
      kpi('utilization', 'Average Utilization', v.utilization, (n) => percent(n), 'pink', ChartColumn),
      kpi('availability', 'Telemetry Availability', v.availability, (n) => percent(n), 'blue', RadioTower),
      kpi('alerts', 'Active IoT Alerts', v.alertCount, (n) => String(n), 'red', TriangleAlert, true)
    ];

    this.trendLabels = v.labels;
    this.trendSeries = [
      { name: 'Production', values: v.production, color: RA_COLORS.purple },
      { name: 'Idle', values: v.idle, color: RA_COLORS.blue },
      { name: 'Maintenance', values: v.maintenance, color: RA_COLORS.orange },
      { name: 'Offline', values: v.offline, color: RA_COLORS.red }
    ];
    if (this.compare && this.previousProduction) {
      this.trendSeries.push({
        name: 'Production (previous period)', values: alignTo(this.previousProduction, v.labels.length), color: RA_COLORS.lavender, dashed: true
      });
    }
    this.telemetrySeries = v.telemetry.map((t, i) => ({ name: t.name, values: t.values, color: TELEMETRY_COLORS[i % TELEMETRY_COLORS.length] }));
    this.eventSeries = [
      { name: 'Critical', values: v.critical, color: RA_COLORS.red },
      { name: 'Warning', values: v.warning, color: RA_COLORS.orange },
      { name: 'Informational', values: v.informational, color: RA_COLORS.blue }
    ];

    this.connectivitySlices = CONNECTIVITY.map((s) => ({ name: s, value: v.connectivity[s], color: STATUS_COLORS[s] }));
    this.categoryLabels = v.categories.map((c) => c.category);
    this.categorySeries = [
      { name: 'Utilization', values: v.categories.map((c) => c.utilization), color: RA_COLORS.purple, type: 'bar' },
      { name: 'Target', values: v.categories.map((c) => c.target), color: RA_COLORS.green, type: 'line', dashed: true }
    ];
    this.healthCounts = { Healthy: v.health.healthy, Warning: v.health.warning, Failed: v.health.failed };
    this.sensorHealthKnown = v.health.score !== null;
    this.sensorHealth = v.health.score ?? 0;
    this.sensorHealthTarget = v.health.target;

    this.buildMap(v.sites);
    this.siteRows = v.sites;
    this.deviceRows = v.devices;
    this.insights = v.insights.map((i) => ({
      key: i.key, title: i.title, text: i.message, assetKeys: i.assetKeys,
      tone: INSIGHT_STYLE[i.key]?.tone ?? (i.severity === 'critical' ? 'red' : 'orange'),
      view: INSIGHT_STYLE[i.key]?.view ?? 'View details'
    }));
  }

  /** One pin per status cluster at each site with coordinates, nudged apart so they don't overlap. */
  private buildMap(sites: IotSiteRow[]): void {
    const points: MapPoint[] = [];
    const legend = { online: 0, intermittent: 0, offline: 0 };
    sites.forEach((site) => {
      legend.online += site.online;
      legend.intermittent += site.intermittent;
      legend.offline += site.offline;
      if (site.lat === null || site.lng === null) return;
      if (site.online) points.push({ lat: site.lat, lng: site.lng, color: RA_COLORS.green, label: `${site.site}: ${site.online} online` });
      if (site.intermittent) points.push({ lat: site.lat + 0.09, lng: site.lng + 0.1, color: RA_COLORS.orange, label: `${site.site}: ${site.intermittent} intermittent` });
      if (site.offline) points.push({ lat: site.lat - 0.08, lng: site.lng + 0.12, color: RA_COLORS.red, label: `${site.site}: ${site.offline} offline` });
    });
    this.mapPoints = points;
    this.mapLegend = legend;
  }

  /** Sites in scope that have no coordinates in master data (their assets are counted but not pinned). */
  get unmappedSites(): number {
    return this.siteRows.filter((s) => s.lat === null || s.lng === null).length;
  }

  get belowTarget(): UtilRow[] {
    return this.utilRows.filter((r) => r.variance < 0).sort((a, b) => a.variance - b.variance);
  }

  get offline24h(): IotAsset[] {
    return this.assets.filter((a) => a.status === 'Offline' && (a.lastSeenMin ?? 0) > 24 * 60).sort((a, b) => (b.lastSeenMin ?? 0) - (a.lastSeenMin ?? 0));
  }

  // ===== Tables =====

  /** The assets furthest below target, ordered by the chosen column */
  get varianceRows(): UtilRow[] {
    const top = this.belowTarget.slice(0, VARIANCE_ROWS);
    const dir = this.varianceAsc ? 1 : -1;
    const key = this.varianceSort;
    const value = (r: UtilRow): string | number => {
      switch (key) {
        case 'id': return r.asset.id;
        case 'name': return r.asset.name;
        case 'site': return r.asset.site;
        case 'utilization': return r.utilization;
        case 'target': return r.asset.target;
        case 'lastSeen': return r.asset.lastSeenMin ?? Number.MAX_SAFE_INTEGER;
        case 'status': return r.asset.status;
        default: return r.variance;
      }
    };
    return top.sort((a, b) => (value(a) > value(b) ? dir : value(a) < value(b) ? -dir : 0));
  }

  /** Rows without a value go last either way. */
  get sortedDevices(): IotDeviceRow[] {
    const dir = this.deviceAsc ? 1 : -1;
    const key = this.deviceSort;
    return [...this.deviceRows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x === null) return y === null ? 0 : 1;
      if (y === null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }

  sortVariance(key: VarianceSort): void {
    this.varianceAsc = this.varianceSort === key ? !this.varianceAsc : true;
    this.varianceSort = key;
  }

  sortDevices(key: DeviceSort): void {
    this.deviceAsc = this.deviceSort === key ? !this.deviceAsc : key === 'type';
    this.deviceSort = key;
  }

  sortIcon(active: boolean, asc: boolean): typeof ArrowUp {
    return !active ? ArrowUpDown : asc ? ArrowUp : ArrowDown;
  }

  statusTone(s: Connectivity): string {
    return STATUS_TONES[s];
  }

  signalTone(dbm: number | null): string {
    if (dbm === null) return 'grey';
    return dbm >= -70 ? 'green' : dbm >= -75 ? 'orange' : 'red';
  }

  num(v: number): string {
    return v.toLocaleString('en-US');
  }

  share(v: number, total: number): string {
    return total ? `${Math.round((v / total) * 100)}%` : '0%';
  }

  // ===== Menus =====

  toggleMenu(key: string, event: Event): void {
    event.stopPropagation();
    this.menu = this.menu === key ? null : key;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menu = null;
  }

  @HostListener('document:keydown.escape')
  closeDialogs(): void {
    this.menu = null;
    this.expanded = null;
    this.breakdown = null;
    this.list = null;
    this.closeDetail();
    this.actionPlan = null;
    this.saveViewOpen = false;
  }

  titleOf(key: WidgetKey): string {
    return WIDGET_TITLES[key];
  }

  expand(key: WidgetKey): void {
    this.menu = null;
    this.expanded = key;
  }

  // ===== KPI breakdown =====

  openBreakdown(k: Kpi): void {
    this.menu = null;
    this.breakdown = k;
  }

  exportKpi(k: Kpi): void {
    this.menu = null;
    downloadCsv(`iot-${k.key}-by-location.csv`, ['Location', 'Connected Assets', 'Average Utilization %', 'Telemetry Availability %', 'Active Alerts'],
      this.siteRows.map((r) => [r.site, r.connected, r.utilization ?? '', r.availability ?? '', r.alerts]));
  }

  // ===== Insights =====

  openInsight(i: Insight): void {
    if (i.key === 'alerts') this.openList('alerts', 'Active IoT alerts', `${this.alerts.length} alerts, newest first`);
    else if (i.key === 'below_target') this.openList('assets', 'Assets below utilization target', `${this.belowTarget.length} assets, largest shortfall first`);
    else if (i.key === 'abnormal_vibration') this.openList('alerts', 'Abnormal vibration readings', 'Vibration sensors beyond their alarm threshold', 'vibration');
    else this.openList('devices', 'Devices offline for more than 24 hours', `${this.offline24h.length} devices, longest offline first`);
  }

  /** sensorType narrows the alerts list (e.g. vibration). */
  openList(kind: ListKind, title: string, subtitle: string, sensorType = ''): void {
    this.list = {
      kind, title, subtitle,
      alerts: kind === 'alerts' ? this.alerts.filter((a) => !sensorType || (a.sensorType ?? '').toLowerCase().includes(sensorType)) : [],
      rows: kind === 'assets' ? this.belowTarget : [],
      assets: kind === 'devices' ? this.offline24h : []
    };
  }

  planFor(i: Insight): void {
    this.actionPlan = { title: `Resolve: ${i.title}`, context: i.text, key: i.key, assetKeys: i.assetKeys };
  }

  /** POST /action-plans with the devices the insight named. */
  onPlanSaved(plan: ActionPlan): void {
    const source = this.actionPlan;
    if (!source || this.savingPlan) return;
    const deviceIds = source.assetKeys
      .map((key) => this.assets.find((a) => a.key === key)?.deviceId)
      .filter((id): id is string => !!id && id !== '—');
    this.savingPlan = true;
    this.api.createActionPlan({
      title: plan.title, owner: plan.owner, dueDate: plan.due, priority: plan.priority, notes: plan.notes,
      insightKey: source.key, context: source.context, deviceIds
    }).subscribe({
      next: (saved) => {
        this.savingPlan = false;
        this.actionPlan = null;
        this.notify(`Action plan ${saved.planId} “${saved.title}” created and assigned to ${saved.owner} (due ${saved.dueDate}).`);
      },
      error: (err: Error) => {
        this.savingPlan = false;
        this.notify(err.message);
      }
    });
  }

  openDetailFor(asset: IotAsset): void {
    const row = this.utilRows.find((r) => r.asset.key === asset.key);
    this.list = null;
    this.detail = row ?? { asset, utilization: 0, variance: 0 };
    this.detailSpark = null;
    this.historySub?.unsubscribe();
    if (asset.utilization === null) return;
    this.historySub = this.api.loadHistory(this.filters(), asset.key).subscribe({
      next: (values) => (this.detailSpark = values.length ? values : null),
      error: () => (this.detailSpark = null)
    });
  }

  openDetailByKey(key: string): void {
    const asset = this.assets.find((a) => a.key === key);
    if (asset) this.openDetailFor(asset);
  }

  closeDetail(): void {
    this.detail = null;
    this.detailSpark = null;
    this.historySub?.unsubscribe();
  }

  alertsFor(asset: IotAsset): IotAlert[] {
    return this.alerts.filter((a) => a.assetKey === asset.key);
  }

  // ===== Export / save view =====

  /** GET /export?format=csv: every connected asset for the filters. */
  exportAll(): void {
    this.api.exportAssets(this.filters()).subscribe({
      next: () => this.notify(`Exported ${this.num(this.view.assetTotal)} assets to CSV.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  exportWidget(key: WidgetKey): void {
    this.menu = null;
    const file = `iot-${key}.csv`;
    const series = (labels: string[], list: ChartSeries[]) =>
      downloadCsv(file, ['Label', ...list.map((s) => s.name)], labels.map((l, i) => [l.replace('\n', ' '), ...list.map((s) => s.values[i])]));
    switch (key) {
      case 'trend': return series(this.trendLabels, this.trendSeries);
      case 'telemetry': return series(this.trendLabels, this.telemetrySeries);
      case 'events': return series(this.trendLabels, this.eventSeries);
      case 'category': return series(this.categoryLabels, this.categorySeries);
      case 'connectivity': return downloadCsv(file, ['Status', 'Assets'], this.connectivitySlices.map((s) => [s.name, s.value]));
      case 'health': return downloadCsv(file, ['Sensor Health', 'Sensors'], [['Healthy', this.healthCounts.Healthy], ['Warning', this.healthCounts.Warning], ['Failed', this.healthCounts.Failed]]);
      case 'map': return downloadCsv(file, ['Location', 'Connected', 'Avg Utilization %', 'Availability %', 'Active Alerts'],
        this.siteRows.map((r) => [r.site, r.connected, r.utilization ?? '', r.availability ?? '', r.alerts]));
      case 'variance': return downloadCsv(file, ['Asset ID', 'Asset Name', 'Location', 'Utilization %', 'Target %', 'Variance (pts)', 'Last Telemetry', 'Status'],
        this.belowTarget.map((r) => [r.asset.id, r.asset.name, r.asset.site, r.utilization, r.asset.target, r.variance, telemetryTime(r.asset.lastSeen), r.asset.status]));
      case 'devices': return downloadCsv(file, ['Device Type', 'Connected', 'Availability %', 'Avg Signal (dBm)', 'Failed Sensors'],
        this.deviceRows.map((r) => [r.type, r.connected, r.availability ?? '', r.signal ?? '', r.failed]));
    }
  }

  openSaveView(): void {
    this.viewName = '';
    this.viewTried = false;
    this.saveViewOpen = true;
  }

  /** POST /views with the current filters. */
  confirmSaveView(): void {
    this.viewTried = true;
    if (!this.viewName.trim()) return;
    this.saveViewOpen = false;
    this.api.createView(this.viewName.trim(), this.filters()).subscribe({
      next: (saved) => this.notify(`View “${saved.name}” saved with the current filters.`),
      error: (err: Error) => this.notify(err.message)
    });
  }
}
