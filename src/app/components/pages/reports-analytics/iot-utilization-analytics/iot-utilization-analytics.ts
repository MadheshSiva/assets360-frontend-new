import { Component, HostListener, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Download, Ellipsis, GitCompareArrows, GripVertical, Info,
  LucideAngularModule, Maximize2, RadioTower, RefreshCw, Signal, TriangleAlert, Wifi, X
} from 'lucide-angular';
import { AnalyticsPage, RA_CATEGORIES, RA_PERIODS, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS, Sparkline } from '../shared/charts';
import { IotActionPlanDialog, ActionPlan } from './iot-action-plan/iot-action-plan';
import { IotSiteMap, MapPoint } from './iot-site-map/iot-site-map';
import {
  CONNECTIVITY, Connectivity, DEVICE_TYPES, IOT_ALERTS, IOT_ASSETS, IOT_SITES, IotAlert, IotAsset, LIVE_AVAIL_STEPS, LIVE_UTIL_STEPS,
  PERIOD_AVAIL_OFFSET, PERIOD_DELTAS, PERIOD_UTIL_OFFSET, agoText, hashUnit, periodWindow, telemetryTime
} from './iot-utilization.data';

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
  /** Is the change an improvement? (fewer alerts is good) */
  good: boolean;
  tone: string;
  icon: typeof Wifi;
}

/** An asset row with the utilization for the selected period */
interface UtilRow {
  asset: IotAsset;
  utilization: number;
  variance: number;
}

interface DeviceRow {
  type: string;
  connected: number;
  availability: number;
  signal: number;
  failed: number;
}

interface Insight {
  key: 'alerts' | 'below' | 'vibration' | 'offline';
  tone: string;
  title: string;
  text: string;
  view: string;
}

interface SiteRow {
  site: string;
  connected: number;
  utilization: number;
  availability: number;
  alerts: number;
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
const AUTO_REFRESH_MS = 30_000;

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Reports & Analytics > IoT / Utilization Analytics */
@Component({
  selector: 'app-ra-iot-utilization-analytics',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, Sparkline, IotSiteMap, IotActionPlanDialog],
  templateUrl: './iot-utilization-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './iot-utilization-analytics.css']
})
export class IotUtilizationAnalyticsPage extends AnalyticsPage implements OnInit {
  readonly icons = {
    ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Download, Ellipsis, GitCompareArrows, GripVertical, Info, Maximize2,
    RadioTower, RefreshCw, Signal, TriangleAlert, Wifi, X
  };
  readonly colors = RA_COLORS;
  readonly categories = ['All categories', ...RA_CATEGORIES];
  readonly deviceTypes = ['All device types', ...DEVICE_TYPES];
  readonly statuses = ['All statuses', ...CONNECTIVITY];
  readonly titles = WIDGET_TITLES;
  readonly telemetryTime = telemetryTime;
  readonly agoText = agoText;
  readonly percent = percent;

  category = this.categories[0];
  deviceType = this.deviceTypes[0];
  connectivity = this.statuses[0];
  compare = false;

  // Live data: "Updated n sec ago" ticks every second; auto refresh nudges the live numbers every 30 s
  autoRefresh = true;
  updatedSeconds = 30;
  private liveStep = 0;
  private liveUtil = 0;
  private liveAvail = 0;
  private secondTimer: ReturnType<typeof setInterval> | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;

  // View model, rebuilt when filters change
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
  mapPoints: MapPoint[] = [];
  mapLegend = { online: 0, intermittent: 0, offline: 0 };
  deviceRows: DeviceRow[] = [];
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
  actionPlan: { title: string; context: string } | null = null;
  saveViewOpen = false;
  viewName = '';
  viewTried = false;

  ngOnInit(): void {
    this.recompute();
    this.secondTimer = setInterval(() => this.updatedSeconds++, 1000);
    this.setAutoRefresh(this.autoRefresh);
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.secondTimer) clearInterval(this.secondTimer);
    if (this.autoTimer) clearInterval(this.autoTimer);
  }

  override get updatedText(): string {
    if (this.updatedSeconds < 5) return 'Updated just now';
    if (this.updatedSeconds < 60) return `Updated ${this.updatedSeconds} sec ago`;
    return `Updated ${Math.floor(this.updatedSeconds / 60)} min ago`;
  }

  override refresh(): void {
    super.refresh();
    this.liveTick();
  }

  setAutoRefresh(on: boolean): void {
    this.autoRefresh = on;
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = on ? setInterval(() => this.liveTick(), AUTO_REFRESH_MS) : null;
  }

  // DEMO MODE: a new telemetry batch moves the live numbers a little (deterministic sequence)
  private liveTick(): void {
    this.liveUtil = round1(this.liveUtil + LIVE_UTIL_STEPS[this.liveStep % LIVE_UTIL_STEPS.length]);
    this.liveAvail = round1(this.liveAvail + LIVE_AVAIL_STEPS[this.liveStep % LIVE_AVAIL_STEPS.length]);
    this.liveStep++;
    this.updatedSeconds = 0;
    this.recompute();
  }

  onFilterChange(): void {
    this.recompute();
  }

  resetFilters(): void {
    this.period = RA_PERIODS[0];
    this.organization = this.organizations[0];
    this.location = this.locations[0];
    this.category = this.categories[0];
    this.deviceType = this.deviceTypes[0];
    this.connectivity = this.statuses[0];
    this.recompute();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.recompute();
  }

  // "Purple IQ Group" is the parent company, so it covers every site
  private matches(a: IotAsset): boolean {
    return (this.organization === this.organizations[0] || this.organization === 'Purple IQ Group' || a.org === this.organization)
      && (this.location === this.locations[0] || a.site === this.location)
      && (this.category === this.categories[0] || a.category === this.category)
      && (this.deviceType === this.deviceTypes[0] || a.deviceType === this.deviceType)
      && (this.connectivity === this.statuses[0] || a.status === this.connectivity);
  }

  private get periodIndex(): number {
    return Math.max(0, RA_PERIODS.indexOf(this.period));
  }

  private recompute(): void {
    const pi = this.periodIndex;
    this.assets = IOT_ASSETS.filter((a) => this.matches(a));
    const inScope = new Set(this.assets);
    this.alerts = IOT_ALERTS.filter((al) => inScope.has(al.asset));
    this.utilRows = this.assets
      .filter((a) => a.utilization !== null)
      .map((a) => {
        const utilization = round1(Math.min(99.5, Math.max(0, (a.utilization ?? 0) + PERIOD_UTIL_OFFSET[pi])));
        return { asset: a, utilization, variance: round1(utilization - a.target) };
      });

    const avgUtil = round1(avg(this.utilRows.map((r) => r.utilization)) + this.liveUtil);
    const avgAvail = this.availabilityOf(this.assets);
    const [dConn, dUtil, dAvail, dAlerts] = PERIOD_DELTAS[pi];
    const none = this.assets.length === 0;
    const prev = (v: number, d: number) => v / (1 + d / 100);
    this.kpis = [
      { key: 'connected', label: 'Connected Assets', value: this.num(this.assets.length), prev: this.num(Math.round(prev(this.assets.length, dConn))), delta: dConn, good: dConn >= 0, tone: 'green', icon: Wifi },
      { key: 'utilization', label: 'Average Utilization', value: none ? '—' : percent(avgUtil), prev: percent(prev(avgUtil, dUtil)), delta: dUtil, good: dUtil >= 0, tone: 'pink', icon: ChartColumn },
      { key: 'availability', label: 'Telemetry Availability', value: none ? '—' : percent(avgAvail), prev: percent(prev(avgAvail, dAvail)), delta: dAvail, good: dAvail >= 0, tone: 'blue', icon: RadioTower },
      { key: 'alerts', label: 'Active IoT Alerts', value: String(this.alerts.length), prev: String(Math.round(prev(this.alerts.length, dAlerts))), delta: dAlerts, good: dAlerts <= 0, tone: 'red', icon: TriangleAlert }
    ];

    this.buildTrends(avgUtil, dUtil);
    this.buildDistribution();
    this.buildMap();
    this.buildDevices();
    this.buildInsights();
  }

  private availabilityOf(assets: IotAsset[]): number {
    const values = assets.filter((a) => a.availability !== null).map((a) => a.availability ?? 0);
    if (!values.length) return 0;
    return round1(Math.min(100, avg(values) + PERIOD_AVAIL_OFFSET[this.periodIndex] + this.liveAvail));
  }

  private get filterKey(): string {
    return [this.organization, this.location, this.category, this.deviceType, this.connectivity].join('|');
  }

  /** Utilization, telemetry and event trends for the period window; the last utilization point equals the KPI. */
  private buildTrends(avgUtil: number, dUtil: number): void {
    const win = periodWindow(this.period);
    const h = hashUnit(this.filterKey);
    // Position on the 12-month timeline (weeks of October sit just before index 11)
    const t = win.months.map((m, i) => (win.weekly ? 11 - (win.months.length - 1 - i) * 0.23 : m));
    const wave = (x: number) => Math.sin(x * 1.3 + h * 6) * 1.2;
    const offlineShare = this.assets.length
      ? (this.assets.filter((a) => a.status === 'Offline' || a.status === 'Never Connected').length / this.assets.length) * 100
      : 0;

    // Production + idle + maintenance + offline = 100% of the scheduled hours
    const production = t.map((x) => round1(Math.max(0, avgUtil - (11 - x) * 0.6 + wave(x) - wave(11))));
    const maintenance = production.map((p, i) => round1((100 - p) * (0.26 + 0.03 * Math.sin(t[i] + h))));
    const offline = production.map((p, i) => round1(Math.max(0, Math.min((100 - p - maintenance[i]) * 0.5, offlineShare * 0.35 + Math.cos(t[i] * 0.8) * 0.6))));
    const idle = production.map((p, i) => round1(100 - p - maintenance[i] - offline[i]));
    this.trendLabels = win.labels;
    this.trendSeries = [
      { name: 'Production', values: production, color: RA_COLORS.purple },
      { name: 'Idle', values: idle, color: RA_COLORS.blue },
      { name: 'Maintenance', values: maintenance, color: RA_COLORS.orange },
      { name: 'Offline', values: offline, color: RA_COLORS.red }
    ];
    if (this.compare) {
      this.trendSeries.push({ name: 'Production (previous period)', values: production.map((p) => round1(p / (1 + dUtil / 100))), color: RA_COLORS.lavender, dashed: true });
    }

    const season = (x: number) => Math.cos(((x - 9) / 12) * 2 * Math.PI);
    this.telemetrySeries = [
      { name: 'Temperature', values: t.map((x) => round1(52 + 16 * season(x) + h * 4)), color: RA_COLORS.purple },
      { name: 'Vibration', values: t.map((x) => round1(34 + 3 * Math.sin(x * 0.9 + h * 5) + (x - 2) * 0.5)), color: RA_COLORS.blue },
      { name: 'Energy', values: t.map((x) => round1(60 + 12 * season(x) + x * 0.3)), color: RA_COLORS.green },
      { name: 'Pressure', values: t.map((x) => round1(26 + 4 * Math.sin(x * 0.7 + h * 3))), color: RA_COLORS.orange }
    ];

    // Event volume scales with the number of assets in scope
    const scale = this.assets.length / IOT_ASSETS.length;
    const per = win.weekly ? 1 / 4.3 : 1;
    const count = (v: number) => Math.max(0, Math.round(v * scale * per));
    this.eventSeries = [
      { name: 'Critical', values: t.map((x) => count(6 + 3 * Math.sin(x * 1.1 + h * 4) + (x >= 8 ? 2 : 0))), color: RA_COLORS.red },
      { name: 'Warning', values: t.map((x) => count(18 + 6 * Math.sin(x * 0.8 + 1 + h * 3) + x * 0.6)), color: RA_COLORS.orange },
      { name: 'Informational', values: t.map((x) => count(22 + 8 * Math.sin(x * 0.6 + 2) + x * 0.9)), color: RA_COLORS.blue }
    ];
  }

  private buildDistribution(): void {
    this.connectivitySlices = CONNECTIVITY.map((s) => ({ name: s, value: this.assets.filter((a) => a.status === s).length, color: STATUS_COLORS[s] }));

    const cats = RA_CATEGORIES.filter((c) => this.utilRows.some((r) => r.asset.category === c));
    this.categoryLabels = cats;
    this.categorySeries = [
      { name: 'Utilization', values: cats.map((c) => round1(avg(this.utilRows.filter((r) => r.asset.category === c).map((r) => r.utilization)))), color: RA_COLORS.purple, type: 'bar' },
      { name: 'Target', values: cats.map((c) => this.assets.find((a) => a.category === c)?.target ?? 0), color: RA_COLORS.green, type: 'line', dashed: true }
    ];

    this.healthCounts = {
      Healthy: this.assets.filter((a) => a.health === 'Healthy').length,
      Warning: this.assets.filter((a) => a.health === 'Warning').length,
      Failed: this.assets.filter((a) => a.health === 'Failed').length
    };
    // Sensor health = share of sensors still reporting usable readings (healthy or warning)
    this.sensorHealth = this.assets.length ? round1(((this.healthCounts.Healthy + this.healthCounts.Warning) / this.assets.length) * 100) : 0;
  }

  private buildMap(): void {
    const points: MapPoint[] = [];
    const legend = { online: 0, intermittent: 0, offline: 0 };
    IOT_SITES.forEach((site) => {
      const here = this.assets.filter((a) => a.site === site.name);
      const online = here.filter((a) => a.status === 'Online').length;
      const intermittent = here.filter((a) => a.status === 'Intermittent').length;
      const offline = here.filter((a) => a.status === 'Offline').length;
      legend.online += online;
      legend.intermittent += intermittent;
      legend.offline += offline;
      // One pin per status cluster, nudged apart so they don't overlap
      if (online) points.push({ lat: site.lat, lng: site.lng, color: RA_COLORS.green, label: `${site.name}: ${online} online` });
      if (intermittent) points.push({ lat: site.lat + 0.09, lng: site.lng + 0.1, color: RA_COLORS.orange, label: `${site.name}: ${intermittent} intermittent` });
      if (offline) points.push({ lat: site.lat - 0.08, lng: site.lng + 0.12, color: RA_COLORS.red, label: `${site.name}: ${offline} offline` });
    });
    this.mapPoints = points;
    this.mapLegend = legend;
  }

  private buildDevices(): void {
    this.deviceRows = DEVICE_TYPES.map((type) => {
      const list = this.assets.filter((a) => a.deviceType === type);
      const signals = list.filter((a) => a.signal !== null).map((a) => a.signal ?? 0);
      return {
        type,
        connected: list.length,
        availability: this.availabilityOf(list),
        signal: Math.round(avg(signals)),
        failed: list.filter((a) => a.health === 'Failed').length
      };
    }).filter((r) => r.connected > 0);
  }

  private buildInsights(): void {
    const alertAssets = new Set(this.alerts.map((a) => a.asset)).size;
    const below = this.belowTarget;
    const belowCats = new Set(below.map((r) => r.asset.category)).size;
    const vib = this.alerts.filter((a) => a.type === 'Abnormal vibration');
    const vibAssets = new Set(vib.map((a) => a.asset)).size;
    const offline = this.offline24h.length;
    const list: Insight[] = [];
    if (this.alerts.length) list.push({ key: 'alerts', tone: 'red', view: 'View alerts', title: `${this.alerts.length} active IoT alerts require review`, text: `${this.alerts.length} active alerts across ${alertAssets} assets including critical temperature, vibration and connectivity issues.` });
    if (below.length) list.push({ key: 'below', tone: 'orange', view: 'Open asset details', title: `${below.length} assets below utilization target`, text: `${below.length} assets are operating below their category utilization target across ${belowCats} asset ${belowCats === 1 ? 'category' : 'categories'}.` });
    if (vib.length) list.push({ key: 'vibration', tone: 'red', view: 'View sensors', title: `${vib.length} sensors reporting abnormal vibration`, text: `${vib.length} vibration readings across ${vibAssets} assets are above the 7.1 mm/s alarm threshold.` });
    if (offline) list.push({ key: 'offline', tone: 'orange', view: 'View devices', title: `${offline} devices offline for more than 24 hours`, text: `${offline} IoT devices have been offline for more than 24 hours and may require investigation.` });
    this.insights = list;
  }

  get belowTarget(): UtilRow[] {
    return this.utilRows.filter((r) => r.variance < 0).sort((a, b) => a.variance - b.variance);
  }

  get offline24h(): IotAsset[] {
    return this.assets.filter((a) => a.status === 'Offline' && (a.lastSeenMin ?? 0) > 24 * 60).sort((a, b) => (b.lastSeenMin ?? 0) - (a.lastSeenMin ?? 0));
  }

  // ===== Tables =====

  /** The 8 assets furthest below target, ordered by the chosen column */
  get varianceRows(): UtilRow[] {
    const top = this.belowTarget.slice(0, 8);
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

  get sortedDevices(): DeviceRow[] {
    const dir = this.deviceAsc ? 1 : -1;
    const key = this.deviceSort;
    return [...this.deviceRows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
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

  signalTone(dbm: number): string {
    return dbm >= -70 ? 'green' : dbm >= -75 ? 'orange' : 'red';
  }

  /** 12 weeks of utilization for the detail dialog, ending at the asset's current figure */
  sparkFor(row: UtilRow): number[] {
    const h = hashUnit(row.asset.id);
    return Array.from({ length: 12 }, (_, i) => round1(Math.max(0, row.utilization + (11 - i) * (h - 0.4) * 1.5 + Math.sin(i * 1.7 + h * 9) * 3 - Math.sin(11 * 1.7 + h * 9) * 3)));
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
    this.detail = null;
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

  get siteRows(): SiteRow[] {
    return IOT_SITES.map((s) => {
      const list = this.assets.filter((a) => a.site === s.name);
      return {
        site: s.name,
        connected: list.length,
        utilization: round1(avg(this.utilRows.filter((r) => r.asset.site === s.name).map((r) => r.utilization))),
        availability: this.availabilityOf(list),
        alerts: this.alerts.filter((a) => a.asset.site === s.name).length
      };
    }).filter((r) => r.connected > 0);
  }

  exportKpi(k: Kpi): void {
    this.menu = null;
    downloadCsv(`iot-${k.key}-by-location.csv`, ['Location', 'Connected Assets', 'Average Utilization %', 'Telemetry Availability %', 'Active Alerts'],
      this.siteRows.map((r) => [r.site, r.connected, r.utilization, r.availability, r.alerts]));
  }

  // ===== Insights =====

  openInsight(i: Insight): void {
    if (i.key === 'alerts') this.openList('alerts', 'Active IoT alerts', `${this.alerts.length} alerts, newest first`);
    else if (i.key === 'below') this.openList('assets', 'Assets below utilization target', `${this.belowTarget.length} assets, largest shortfall first`);
    else if (i.key === 'vibration') this.openList('alerts', 'Abnormal vibration readings', 'Vibration sensors above the 7.1 mm/s alarm threshold', 'Abnormal vibration');
    else this.openList('devices', 'Devices offline for more than 24 hours', `${this.offline24h.length} devices, longest offline first`);
  }

  openList(kind: ListKind, title: string, subtitle: string, alertType = ''): void {
    this.list = {
      kind, title, subtitle,
      alerts: kind === 'alerts' ? this.alerts.filter((a) => !alertType || a.type === alertType) : [],
      rows: kind === 'assets' ? this.belowTarget : [],
      assets: kind === 'devices' ? this.offline24h : []
    };
  }

  planFor(i: Insight): void {
    this.actionPlan = { title: `Resolve: ${i.title}`, context: i.text };
  }

  onPlanSaved(plan: ActionPlan): void {
    this.actionPlan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created and assigned to ${plan.owner} (due ${plan.due}).`);
  }

  openDetailFor(asset: IotAsset): void {
    const row = this.utilRows.find((r) => r.asset === asset);
    this.list = null;
    this.detail = row ?? { asset, utilization: 0, variance: 0 };
  }

  alertsFor(asset: IotAsset): IotAlert[] {
    return this.alerts.filter((a) => a.asset === asset);
  }

  // ===== Export / save view =====

  exportAll(): void {
    downloadCsv('iot-utilization-assets.csv',
      ['Asset ID', 'Asset Name', 'Category', 'Location', 'Device Type', 'Device ID', 'Connectivity', 'Sensor Health', 'Utilization %', 'Target %', 'Variance (pts)', 'Telemetry Availability %', 'Avg Signal (dBm)', 'Last Telemetry'],
      this.assets.map((a) => {
        const r = this.utilRows.find((u) => u.asset === a);
        return [a.id, a.name, a.category, a.site, a.deviceType, a.deviceId, a.status, a.health, r ? r.utilization : '', a.target, r ? r.variance : '',
          a.availability ?? '', a.signal ?? '', telemetryTime(a.lastSeenMin)];
      }));
    this.notify(`Exported ${this.num(this.assets.length)} assets to CSV.`);
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
      case 'map': return downloadCsv(file, ['Location', 'Connected', 'Avg Utilization %', 'Availability %', 'Active Alerts'], this.siteRows.map((r) => [r.site, r.connected, r.utilization, r.availability, r.alerts]));
      case 'variance': return downloadCsv(file, ['Asset ID', 'Asset Name', 'Location', 'Utilization %', 'Target %', 'Variance (pts)', 'Last Telemetry', 'Status'],
        this.belowTarget.map((r) => [r.asset.id, r.asset.name, r.asset.site, r.utilization, r.asset.target, r.variance, telemetryTime(r.asset.lastSeenMin), r.asset.status]));
      case 'devices': return downloadCsv(file, ['Device Type', 'Connected', 'Availability %', 'Avg Signal (dBm)', 'Failed Sensors'],
        this.deviceRows.map((r) => [r.type, r.connected, r.availability, r.signal, r.failed]));
    }
  }

  openSaveView(): void {
    this.viewName = '';
    this.viewTried = false;
    this.saveViewOpen = true;
  }

  confirmSaveView(): void {
    this.viewTried = true;
    if (!this.viewName.trim()) return;
    this.saveViewOpen = false;
    this.saveView(this.viewName.trim());
  }
}
