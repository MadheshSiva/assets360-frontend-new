import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, from, map, mergeMap, toArray } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BellRing,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  Heart,
  House,
  Maximize,
  MapPin,
  Minus,
  Plus,
  Power,
  Radio,
  TriangleAlert,
  Warehouse,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-angular';
import {
  ALERTS,
  ASSET_TYPES,
  DEVICES,
  Device,
  DeviceStatus,
  EventSeries,
  HEALTH_COLORS,
  HealthBand,
  IotAlert,
  LATEST_FIRMWARE,
  SERIES,
  EventDay,
  dailyLocationUpdates,
  SITES,
  STATUSES,
  STATUS_COLORS,
  healthBand,
} from './iot-overview-data';
import { DrillDialog } from '../shared/drill-dialog/drill-dialog';
import { Drill, DrillColumn, DrillRow, DrillValue, pct } from '../shared/drill-dialog/drill';
import { AssetQuickView, QuickViewAsset, connectedAssetDrill, qvDate, qvDateTime, statusKey } from '../shared/asset-quick-view/quick-view';
import { AssetDashboardKpis, ConnectedAssetDetail, Dashboard, DeviceConnectivity, InsightAssetList, SiteAsset, TopSite } from '../services/dashboard/dashboard';

type Period = '7' | '30' | '90';
type QuickTab = 'overview' | 'location' | 'telemetry' | 'maintenance';
type AlertSort = 'time' | 'asset';

interface AlertRow extends IotAlert {
  device: Device;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_IMAGES: Record<string, string> = {
  Generators: '/asset-generator.svg',
  Forklifts: '/asset-images/forklift-overview.svg',
  'HVAC Units': '/asset-images/ahu-overview.svg',
  Compressors: '/asset-images/chiller-compressor.svg',
};
// Event timeline geometry (SVG user units); the width follows the card's width (1 unit = 1px)
const TW = 520;
const TW_MIN = 280;
const TH = 170;
const TP = { l: 30, r: 8, t: 10, b: 22 };
/** Coverage: located within the last day. Freshness: reporting devices that updated within the hour. */
const COVERAGE_MIN = 24 * 60;
const FRESH_MIN = 60;
const SEVERITY_COLORS: Record<string, string> = { Critical: '#dc2626', Warning: '#d97706', Info: '#2563eb' };
const YES_NO: Record<string, string> = { Yes: '#16a34a', No: '#dc2626' };

@Component({
  selector: 'app-iot-tracking-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule, DrillDialog],
  templateUrl: './iot-tracking-overview.html',
  styleUrls: ['./iot-tracking-overview.css', './iot-tracking-overview-panels.css'],
})
export class IotTrackingOverview implements AfterViewInit, OnDestroy {
  readonly icons = {
    ArrowDown, ArrowUp, ArrowUpDown, Bell, BellRing, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Cog, Database, Download, Ellipsis, ExternalLink, FileText,
    Heart, House, Maximize, MapPin, Minus, Plus, Power, Radio, TriangleAlert, Warehouse, Wifi, WifiOff, Zap,
  };
  /** "Site" dropdown, from GET api/master-data/sites?clientId=. */
  sites: string[] = [];
  /** "Asset Type" dropdown, from GET api/master-data/asset-types. */
  types: string[] = [];
  readonly statuses = STATUSES;
  readonly statusColors = STATUS_COLORS;
  readonly healthColors = HEALTH_COLORS;
  readonly series = SERIES;
  readonly latestFirmware = LATEST_FIRMWARE;
  readonly healthBand = healthBand;
  tw = TW;
  readonly th = TH;
  readonly tp = TP;
  readonly Math = Math;

  // Filters
  period: Period = '30';
  site = '';
  type = '';
  status: DeviceStatus | '' = '';
  periodOpen = false;

  // Cards
  showAllSites = false;
  hiddenSeries = new Set<EventSeries>();
  timelinePeriod: Period = '30';
  hoverDay: number | null = null;
  hoverStatus: DeviceStatus | null = null;
  hoverHealth: HealthBand | null = null;
  alertSort: AlertSort = 'time';
  alertDesc = true;
  showAllAlerts = false;
  alertPage = 0;
  readonly alertPageSize = 10;
  menuOpen = '';
  selectedId = '';
  quickTab: QuickTab = 'overview';
  toast = '';
  /** Drill-down popup for the clicked widget element. */
  drill: Drill | null = null;

  @ViewChild('mapEl') private mapEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chartEl') private chartEl?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;
  private selectedRing?: L.CircleMarker;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly now = new Date();
  private readonly dashboardApi = inject(Dashboard);
  private readonly destroyRef = inject(DestroyRef);
  /** Asset Quick View: registered assets from GET api/asset-registrations, one at a time. */
  readonly qv = new AssetQuickView(this.dashboardApi, this.destroyRef);
  readonly statusKey = statusKey;
  readonly qvDate = qvDate;
  readonly qvDateTime = qvDateTime;

  /** KPI cards from GET api/asset-dashboard/kpis; null until the first response. */
  kpiData: AssetDashboardKpis | null = null;
  kpiLoading = false;
  kpiError = '';

  /** Donut from GET api/asset-dashboard/device-connectivity; null until the first response. */
  connectivityData: DeviceConnectivity | null = null;
  connectivityLoading = false;

  /** IoT Events Timeline: daily location updates derived from GET api/asset-dashboard/location-updates; null on error. */
  eventDays: EventDay[] | null = null;
  /** Series the timeline has data for; the API only reports location updates. */
  eventSeries: EventSeries[] = [];
  /** Each day's location updates per tag, for the day popup. */
  private dayTags = new Map<string, { tagId: string; count: number }[]>();
  private timelineSub?: Subscription;
  timelineLoading = false;

  /** Sites ranked by the API (GET api/asset-dashboard/locations). */
  topSites: TopSite[] = [];
  sitesLoading = false;

  /** Critical health band from GET api/asset-dashboard/critical-assets; null until loaded or on error (falls back to local). */
  criticalData: InsightAssetList | null = null;

  /** Filtered fleet; rebuilt by apply() whenever a filter changes. */
  devices: Device[] = DEVICES;

  constructor() {
    // open on the device behind the latest critical alert
    const first = ALERTS.find((a) => a.severity === 'Critical') ?? ALERTS[0];
    this.selectedId = first?.deviceId ?? DEVICES[0]?.id ?? '';
    this.loadKpis();
    this.loadConnectivity();
    this.loadTimeline();
    this.loadSites();
    this.loadAssetTypes();
    this.loadSiteOptions();
    this.loadCriticalAssets();
    this.qv.load();
  }

  /** Fetches the critical assets that feed the Critical band of the health donut. */
  loadCriticalAssets(): void {
    this.dashboardApi
      .getCriticalAssets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => (this.criticalData = res),
        error: () => (this.criticalData = null),
      });
  }

  /** Fills the Site dropdown with the client's active, non-deleted sites, sorted by name. */
  loadSiteOptions(): void {
    this.dashboardApi
      .getSites()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const names = (res ?? []).filter((s) => !s.isDeleted && s.status !== 'Inactive').map((s) => s.siteName).filter(Boolean);
          this.sites = [...new Set(names)].sort((a, b) => a.localeCompare(b));
        },
        error: () => {
          this.sites = [];
          this.showToast('Could not load site list');
        },
      });
  }

  /** Fills the Asset Type dropdown with the active, non-deleted types, sorted by name. */
  loadAssetTypes(): void {
    this.dashboardApi
      .getAssetTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const names = (res ?? []).filter((t) => !t.isDeleted && t.status !== 'Inactive').map((t) => t.assetTypeName).filter(Boolean);
          this.types = [...new Set(names)].sort((a, b) => a.localeCompare(b));
        },
        error: () => {
          this.types = [];
          this.showToast('Could not load asset types');
        },
      });
  }

  /** Fetches every site for "Top Active Sites"; the widget shows the first 3 until View All. */
  loadSites(): void {
    this.sitesLoading = true;
    this.dashboardApi
      .getLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.topSites = res.topSites ?? [];
          this.sitesLoading = false;
        },
        error: () => {
          this.topSites = [];
          this.sitesLoading = false;
          this.showToast('Could not load sites');
        },
      });
  }

  /** Fetches the Device Connectivity donut for the selected period. */
  loadConnectivity(): void {
    this.connectivityLoading = true;
    this.dashboardApi
      .getDeviceConnectivity(Number(this.period))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.connectivityData = res;
          this.connectivityLoading = false;
        },
        error: () => {
          this.connectivityData = null;
          this.connectivityLoading = false;
          this.showToast('Could not load device connectivity');
        },
      });
  }

  /** Fetches the IoT Events Timeline for its period and the dashboard's Site / Type / Status filters. */
  loadTimeline(): void {
    const n = Number(this.timelinePeriod);
    // the API filters by site id; the Site dropdown holds names, so match them against the ranked sites
    const siteId = this.site ? this.topSites.find((s) => s.siteName === this.site)?.siteId : undefined;
    const filters = { siteId, assetType: this.type || undefined, status: this.status || undefined };
    // the API has no daily split: fetch the "last k days" totals for k = 1..n and take the differences
    this.timelineSub?.unsubscribe();
    this.timelineLoading = true;
    this.timelineSub = from(Array.from({ length: n }, (_, i) => i + 1))
      .pipe(
        mergeMap((k) => this.dashboardApi.getLocationUpdates(k, filters).pipe(map((res) => ({ k, res }))), 6),
        toArray(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (list) => {
          const windows = list.sort((a, b) => a.k - b.k).map(({ res }) => ({ from: res?.from ?? '', totalCount: res?.totalCount ?? 0, tags: res?.tags ?? [] }));
          const daily = dailyLocationUpdates(windows);
          this.eventDays = daily.days;
          this.dayTags = daily.tagsByDay;
          this.eventSeries = ['location'];
          this.hoverDay = null;
          this.timelineLoading = false;
        },
        error: () => {
          this.eventDays = null;
          this.dayTags.clear();
          this.eventSeries = [];
          this.timelineLoading = false;
          this.showToast('Could not load location updates');
        },
      });
  }

  /** Fetches the KPI cards for the selected period. */
  loadKpis(): void {
    this.kpiLoading = true;
    this.kpiError = '';
    this.dashboardApi
      .getKpis(Number(this.period))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.kpiData = res;
          this.kpiLoading = false;
          this.qv.setConnected(res?.connectedAssetDetails ?? []);
        },
        error: () => {
          this.kpiData = null;
          this.kpiLoading = false;
          this.kpiError = 'Could not load KPIs';
          this.showToast(this.kpiError);
        },
      });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.observeSizes();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  /** The grid columns change width on window resize, breakpoints and sidebar collapse: keep the map tiles and the timeline in step. */
  private observeSizes(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize();
      const width = this.chartEl?.nativeElement.clientWidth;
      if (!width) return;
      const tw = Math.max(TW_MIN, Math.round(width));
      // ResizeObserver callbacks run outside Angular's zone
      if (tw !== this.tw) this.zone.run(() => (this.tw = tw));
    });
    if (this.mapEl) this.resizeObserver.observe(this.mapEl.nativeElement);
    if (this.chartEl) this.resizeObserver.observe(this.chartEl.nativeElement);
  }

  apply(): void {
    this.devices = DEVICES.filter((d) => (!this.site || d.site === this.site) && (!this.type || d.type === this.type) && (!this.status || d.status === this.status));
    this.alertPage = 0;
    this.drawMarkers();
    this.fitToFilter();
    this.loadTimeline();
  }

  setPeriod(p: Period): void {
    this.period = p;
    this.timelinePeriod = p;
    this.periodOpen = false;
    this.alertPage = 0;
    // alert markers follow the period
    this.drawMarkers();
    this.loadKpis();
    this.loadConnectivity();
    this.loadTimeline();
  }

  get periodLabel(): string {
    return `Last ${this.period} Days`;
  }

  get filtered(): boolean {
    return !!(this.site || this.type || this.status);
  }

  private minutesSince(v: string): number {
    return (this.now.getTime() - new Date(v).getTime()) / 60_000;
  }

  /** Local yyyy-MM-ddTHH:mm, comparable with the alert timestamps. */
  private sinceIso(days: number): string {
    const d = new Date(this.now.getTime() - days * 86_400_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ===== KPIs =====

  get kpis() {
    const api = this.kpiData;
    const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
    return {
      connected: api?.connectedAssets.value ?? 0,
      connectedChange: round(api?.connectedAssets.changePercent),
      online: api?.onlineNow.value ?? 0,
      onlinePct: round(api?.onlineNow.percent) ?? 0,
      alerts: api?.alerts.value ?? 0,
      // the API has no severity split yet: critical count comes from the alert list
      critical: this.periodAlerts.filter((a) => a.severity === 'Critical').length,
      coverage: round(api?.coverage.percent) ?? 0,
      coverageChange: round(api?.coverage.changePercent),
      freshness: round(api?.dataFreshness.percent) ?? 0,
      freshnessChange: round(api?.dataFreshness.changePercent),
    };
  }

  /** Connected assets returned with the KPIs. */
  get connectedAssets(): ConnectedAssetDetail[] {
    return this.kpiData?.connectedAssetDetails ?? [];
  }

  private connectedColumns(): DrillColumn[] {
    return [
      { key: 'tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name' }, { key: 'type', label: 'Type' }, { key: 'site', label: 'Site' },
      { key: 'network', label: 'Network', pill: { online: STATUS_COLORS.Online, offline: STATUS_COLORS.Offline } },
      { key: 'gateway', label: 'Gateway' }, { key: 'lastSeen', label: 'Last Seen' }, { key: 'readings', label: 'Readings', num: true },
    ];
  }

  private connectedRows(list: ConnectedAssetDetail[]): DrillRow[] {
    return list.map((a) => ({
      cells: {
        tag: a.assetTag, name: a.assetName, type: a.assetType, site: a.siteName, network: a.networkStatus,
        gateway: a.gatewayId, lastSeen: a.lastSeenAt ? this.fmtDateTime(a.lastSeenAt) : '-', readings: a.readingCount,
      },
      open: () => connectedAssetDrill(a, (id) => this.showQuick(id)),
    }));
  }

  // ===== Sites =====

  get siteStats() {
    const rows = this.topSites.map((t) => {
      // icon and colour come from the local site catalogue when the names match
      const local = SITES.find((s) => s.name.toLowerCase() === t.siteName.toLowerCase());
      return {
        site: { id: t.siteId, name: t.siteName, color: local?.color ?? '#2563eb', image: local?.image ?? 'warehouse' },
        total: t.totalAssets, online: t.online, idle: t.idle, offline: t.offline + t.unknown,
        onlinePct: Math.round(t.onlinePercent * 10) / 10,
      };
    });
    return this.showAllSites ? rows : rows.slice(0, 3);
  }

  filterSite(name: string): void {
    this.site = this.site === name ? '' : name;
    this.apply();
  }

  // ===== Tracking health =====

  get connectivity() {
    const api = this.connectivityData;
    const bands = api?.bands ?? [];
    const total = api?.total ?? 0;
    const C = 2 * Math.PI * 48;
    let acc = 0;
    // keep the fixed status order; any extra band from the API goes last
    const names = [...STATUSES, ...bands.map((b) => b.name).filter((n) => !STATUSES.includes(n as DeviceStatus))];
    const rows = names.map((s) => {
      const band = bands.find((b) => b.name.toLowerCase() === s.toLowerCase());
      const count = band?.count ?? 0;
      const percent = band?.percent ?? 0;
      const len = total ? (count / total) * C : 0;
      const color = STATUS_COLORS[s as DeviceStatus] ?? '#94a3b8';
      const row = { status: s as DeviceStatus, count, percent, color, dash: `${Math.max(0, len - (count ? 2 : 0))} ${C}`, offset: -acc };
      acc += len;
      return row;
    });
    return { total, centrePercent: Math.round((api?.centrePercent ?? 0) * 10) / 10, rows };
  }

  get firmware() {
    const total = this.devices.length;
    const latest = this.devices.filter((d) => d.firmwareLatest).length;
    return { total, latest, pct: total ? Math.round((latest / total) * 100) : 0 };
  }

  get attention(): number {
    return this.devices.filter((d) => d.abnormal).length;
  }

  // ===== Asset health & utilization =====

  /** Assets per health band; Critical comes from the critical-assets API once loaded, the rest from the local fleet. */
  private healthCount(b: HealthBand): number {
    if (b === 'Critical' && this.criticalData) return this.criticalData.count;
    return this.devices.filter((d) => healthBand(d.health) === b).length;
  }

  get health() {
    const bands: HealthBand[] = ['Healthy', 'Warning', 'Critical', 'Unknown'];
    const counts = bands.map((b) => this.healthCount(b));
    const total = counts.reduce((s, n) => s + n, 0);
    const C = 2 * Math.PI * 48;
    let acc = 0;
    const rows = bands.map((b, i) => {
      const count = counts[i];
      const len = total ? (count / total) * C : 0;
      const row = { band: b, count, pct: total ? Math.round((count / total) * 100) : 0, color: HEALTH_COLORS[b], dash: `${Math.max(0, len - (count ? 2 : 0))} ${C}`, offset: -acc };
      acc += len;
      return row;
    });
    return { total, rows, healthyPct: rows[0].pct };
  }

  /** Health donut needs fleet devices; the Critical count alone (critical-assets API) would draw a misleading 100% Critical ring. */
  get hasHealthData(): boolean {
    return this.devices.length > 0 && this.health.total > 0;
  }

  /** Running share (blue) and idle share (amber) per asset type. */
  get utilization() {
    return ASSET_TYPES.map((t) => {
      const list = this.devices.filter((d) => d.type === t);
      const n = list.length || 1;
      const running = Math.round(list.reduce((s, d) => s + d.utilization, 0) / n);
      const idle = Math.min(100 - running, Math.round((list.filter((d) => d.status === 'Idle').length / n) * 100 + (list.length ? 12 : 0)));
      return { type: t, running, idle: list.length ? idle : 0, count: list.length };
    });
  }

  /** Utilization rows for asset types that have assets; empty means the widget shows "No data". */
  get utilizationRows() {
    return this.utilization.filter((u) => u.count > 0);
  }

  // ===== Events timeline =====

  /** Legend entries: only the series the API returned. */
  get timelineSeries() {
    return SERIES.filter((s) => this.eventSeries.includes(s.key));
  }

  /** Chart geometry; null while there is nothing to draw (no response, no dated rows, or no updates in the window). */
  get timeline() {
    const vals = this.eventDays ?? [];
    const shown = this.timelineSeries;
    if (!vals.length || !shown.length || vals.every((v) => shown.every((s) => !v[s.key]))) return null;
    const visible = shown.filter((s) => !this.hiddenSeries.has(s.key));
    const max = Math.max(10, ...vals.flatMap((v) => visible.map((s) => v[s.key])));
    const step = max > 150 ? 50 : max > 60 ? 20 : 10;
    const top = Math.ceil(max / step) * step;
    const plotW = this.tw - TP.l - TP.r;
    const plotH = TH - TP.t - TP.b;
    const x = (i: number) => TP.l + (vals.length > 1 ? (i / (vals.length - 1)) * plotW : plotW / 2);
    const y = (v: number) => TH - TP.b - (v / top) * plotH;
    const lines = visible.map((s) => ({ ...s, d: vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v[s.key]).toFixed(1)}`).join(''), pts: vals.map((v, i) => ({ x: x(i), y: y(v[s.key]) })) }));
    const ticks = Array.from({ length: top / step + 1 }, (_, i) => ({ y: y(i * step), label: String(i * step) }));
    const every = Math.max(1, Math.round(vals.length / 7));
    const labels = vals.map((v, i) => ({ x: x(i), label: this.shortDate(v.date), show: i % every === 0 })).filter((l) => l.show);
    const slot = plotW / Math.max(1, vals.length - 1);
    return { vals, lines, ticks, labels, x, slot };
  }

  toggleSeries(key: EventSeries): void {
    this.hiddenSeries.has(key) ? this.hiddenSeries.delete(key) : this.hiddenSeries.add(key);
    // keep at least one line
    if (this.timelineSeries.every((s) => this.hiddenSeries.has(s.key))) this.hiddenSeries.delete(key);
  }

  // ===== Alerts =====

  get periodAlerts(): AlertRow[] {
    const since = this.sinceIso(Number(this.period));
    const ids = new Set(this.devices.map((d) => d.id));
    const byId = new Map(DEVICES.map((d) => [d.id, d]));
    return ALERTS.filter((a) => a.at >= since && ids.has(a.deviceId)).map((a) => ({ ...a, device: byId.get(a.deviceId)! }));
  }

  get alertRows(): AlertRow[] {
    const dir = this.alertDesc ? -1 : 1;
    return [...this.periodAlerts].sort((a, b) => dir * (this.alertSort === 'time' ? a.at.localeCompare(b.at) : a.device.assetId.localeCompare(b.device.assetId)));
  }

  get alertPageRows(): AlertRow[] {
    return this.showAllAlerts ? this.alertRows.slice(this.alertPage * this.alertPageSize, (this.alertPage + 1) * this.alertPageSize) : this.alertRows.slice(0, 5);
  }

  get alertPages(): number {
    return Math.max(1, Math.ceil(this.alertRows.length / this.alertPageSize));
  }

  sortAlerts(by: AlertSort): void {
    if (this.alertSort === by) this.alertDesc = !this.alertDesc;
    else {
      this.alertSort = by;
      this.alertDesc = by === 'time';
    }
    this.alertPage = 0;
  }

  setAlertStatus(a: AlertRow, status: IotAlert['status']): void {
    this.menuOpen = '';
    const src = ALERTS.find((x) => x.id === a.id);
    if (src) src.status = status;
    this.showToast(`${a.event} on ${a.device.assetId} marked ${status.toLowerCase()}.`);
  }

  // ===== Quick view =====

  get selected(): Device | null {
    return DEVICES.find((d) => d.id === this.selectedId) ?? null;
  }

  select(id: string, pan = false): void {
    this.menuOpen = '';
    this.selectedId = id;
    this.markSelected(pan);
    // the Quick View follows when the device's asset is registered under the same tag
    if (this.qv.showTag(DEVICES.find((d) => d.id === id)?.assetId)) this.quickTab = 'overview';
  }

  /** Shows a registered asset in the Quick View. */
  showQuick(assetRegistrationId: string): void {
    this.quickTab = 'overview';
    this.qv.show(assetRegistrationId);
  }

  /** Pill colour of a registration status. */
  pillOf(status: string): string {
    const k = statusKey(status);
    return k === 'active' ? 'online' : /maintenance|repair|idle|transit/.test(k) ? 'idle' : /disposed|retired|inactive/.test(k) ? 'offline' : 'unknown';
  }

  /** Opens the asset's detail page in the Assets app. */
  openDetails(a: QuickViewAsset): void {
    this.router.navigate(['/assets/overview'], { queryParams: { id: a.registrationId, tag: a.tag } });
  }

  imageOf(d: Device): string | null {
    return TYPE_IMAGES[d.type] ?? null;
  }

  alertsOf(d: Device): AlertRow[] {
    return ALERTS.filter((a) => a.deviceId === d.id).map((a) => ({ ...a, device: d }));
  }

  locate(d: Device): void {
    this.select(d.id, true);
    this.mapEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ===== Map =====

  private initMap(): void {
    const el = this.mapEl?.nativeElement;
    if (!el) return;
    this.map = L.map(el, { zoomControl: false, attributionControl: true, preferCanvas: true, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagery &copy; Esri',
    }).addTo(this.map);
    for (const s of SITES) {
      L.polygon(s.zone, { color: s.color, weight: 2, dashArray: '6 5', fillColor: s.color, fillOpacity: 0.16 })
        .addTo(this.map)
        .bindTooltip(s.name, { permanent: true, direction: 'center', className: 'iot-zone-label' })
        .on('click', () => this.openSite(s.name));
    }
    this.markerLayer = L.layerGroup().addTo(this.map);
    this.drawMarkers();
    this.fitToFilter();
    // the card can resize after first paint (fonts, sidebar)
    setTimeout(() => this.map?.invalidateSize());
  }

  private drawMarkers(): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();
    const alerting = new Set(this.periodAlerts.filter((a) => a.status !== 'Resolved' && a.severity === 'Critical').map((a) => a.deviceId));
    for (const d of this.devices) {
      const alert = alerting.has(d.id);
      L.circleMarker([d.lat, d.lng], {
        radius: alert ? 7 : 5, weight: alert ? 2 : 1.5, color: '#fff', fillColor: alert ? '#f59e0b' : STATUS_COLORS[d.status], fillOpacity: 1,
      })
        .bindTooltip(`<strong>${d.assetId}</strong><br>${d.name}<br>${d.status}${alert ? ' · Alert' : ''}`, { direction: 'top' })
        .on('click', () => this.openDevice(d.id))
        .addTo(this.markerLayer);
    }
    this.markSelected(false);
  }

  private markSelected(pan: boolean): void {
    const d = this.selected;
    if (!this.map || !d) return;
    this.selectedRing?.remove();
    this.selectedRing = L.circleMarker([d.lat, d.lng], { radius: 12, weight: 3, color: '#4f2bd8', fill: false, interactive: false }).addTo(this.map);
    if (pan) this.map.setView([d.lat, d.lng], Math.max(this.map.getZoom(), 18));
  }

  private fitToFilter(): void {
    if (!this.map) return;
    const zones = SITES.filter((s) => !this.site || s.name === this.site).flatMap((s) => s.zone);
    if (!zones.length) {
      this.map.setView([20, 0], 2);
      return;
    }
    this.map.fitBounds(L.latLngBounds(zones), { padding: [16, 16] });
  }

  zoom(delta: number): void {
    delta > 0 ? this.map?.zoomIn() : this.map?.zoomOut();
  }

  resetView(): void {
    this.site = '';
    this.apply();
  }

  get legend() {
    const alerts = new Set(this.periodAlerts.filter((a) => a.status !== 'Resolved' && a.severity === 'Critical').map((a) => a.deviceId)).size;
    return [...(['Online', 'Idle', 'Offline'] as DeviceStatus[]).map((s) => ({ label: s, count: this.devices.filter((d) => d.status === s).length, color: STATUS_COLORS[s], alert: false })), { label: 'Alert', count: alerts, color: '#f59e0b', alert: true }];
  }

  // ===== Drill-down popup =====

  private get scope(): string {
    return `${this.periodLabel} · ${[this.site, this.type, this.status].filter(Boolean).join(' · ') || 'All sites, types and statuses'}`;
  }

  private deviceColumns(...extra: DrillColumn[]): DrillColumn[] {
    return [
      { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'type', label: 'Type' }, { key: 'site', label: 'Site' },
      { key: 'status', label: 'Status', pill: STATUS_COLORS }, ...extra, { key: 'updated', label: 'Last Update' },
    ];
  }

  private deviceRows(list: Device[], extra: (d: Device) => Record<string, DrillValue> = () => ({})): DrillRow[] {
    return list.map((d) => ({
      cells: { id: d.assetId, name: d.name, type: d.type, site: d.site, status: d.status, updated: d.lastUpdate.replace('T', ' '), ...extra(d) },
      open: () => this.deviceDrill(d),
    }));
  }

  private statusStats(list: Device[]) {
    return STATUSES.map((s) => ({ label: s, value: list.filter((d) => d.status === s).length, color: STATUS_COLORS[s] }));
  }

  private alertColumns(withAsset: boolean): DrillColumn[] {
    return [
      { key: 'time', label: 'Time' },
      ...(withAsset ? [{ key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'site', label: 'Site' }] : []),
      { key: 'event', label: 'Event Type' }, { key: 'severity', label: 'Severity', pill: SEVERITY_COLORS }, { key: 'status', label: 'Status' },
    ];
  }

  private alertRowsOf(list: AlertRow[]): DrillRow[] {
    return [...list].sort((a, b) => b.at.localeCompare(a.at)).map((a) => ({
      cells: { time: a.at.replace('T', ' '), id: a.device.assetId, name: a.device.name, site: a.device.site, event: a.event, severity: a.severity, status: a.status },
      open: () => this.alertDrill(a),
    }));
  }

  private alertStats(list: AlertRow[]) {
    return [
      { label: 'Alerts', value: list.length },
      ...(['Critical', 'Warning', 'Info'] as const).map((s) => ({ label: s, value: list.filter((a) => a.severity === s).length, color: SEVERITY_COLORS[s] })),
      { label: 'Unresolved', value: list.filter((a) => a.status !== 'Resolved').length },
    ];
  }

  private deviceDrill(d: Device): Drill {
    const alerts = this.alertsOf(d);
    return {
      title: `${d.assetId} · ${d.name}`,
      subtitle: `${d.type} · ${d.site}`,
      stats: [
        { label: 'Status', value: d.status, color: STATUS_COLORS[d.status] },
        { label: 'Health Score', value: d.health === null ? '-' : `${d.health}%`, color: HEALTH_COLORS[healthBand(d.health)] },
        { label: 'Utilization', value: `${d.utilization}%` },
        { label: 'Alerts', value: alerts.length },
      ],
      fields: [
        { label: 'Manufacturer', value: d.manufacturer }, { label: 'Model', value: d.model },
        { label: 'Serial Number', value: d.serial }, { label: 'Firmware', value: `${d.firmware}${d.firmwareLatest ? ' (latest)' : ' (update available)'}`, color: d.firmwareLatest ? undefined : '#dc2626' },
        { label: 'Temperature', value: `${d.temperature} °C` }, { label: 'Vibration', value: `${d.vibration} mm/s`, color: d.abnormal ? '#dc2626' : undefined },
        { label: 'Battery', value: `${d.battery}%` }, { label: 'Signal', value: d.signal ? `${d.signal} dBm` : '-' },
        { label: 'Last Update', value: this.fmtDateTime(d.lastUpdate) }, { label: 'Commissioned', value: this.fmtDate(d.commissioned) },
        { label: 'Last Service', value: this.fmtDate(d.lastService) }, { label: 'Next Service', value: this.fmtDate(d.nextService) },
      ],
      tableTitle: 'Alert history',
      columns: this.alertColumns(false),
      rows: this.alertRowsOf(alerts),
      empty: 'No alerts recorded.',
      actions: [{ label: 'Show on map', run: () => this.locate(d) }],
    };
  }

  private alertDrill(a: AlertRow): Drill {
    const d = a.device;
    return {
      title: a.event,
      subtitle: `${d.assetId} · ${d.name} · ${d.site}`,
      stats: [
        { label: 'Severity', value: a.severity, color: SEVERITY_COLORS[a.severity] },
        { label: 'Status', value: a.status },
        { label: 'Raised', value: this.ago(a.at) },
      ],
      fields: [
        { label: 'Time', value: this.fmtDateTime(a.at) }, { label: 'Asset Type', value: d.type },
        { label: 'Device Status', value: d.status, color: STATUS_COLORS[d.status] }, { label: 'Health Score', value: d.health === null ? '-' : `${d.health}%` },
        { label: 'Temperature', value: `${d.temperature} °C` }, { label: 'Vibration', value: `${d.vibration} mm/s`, color: d.abnormal ? '#dc2626' : undefined },
      ],
      tableTitle: `Other alerts on ${d.assetId}`,
      columns: this.alertColumns(false),
      rows: this.alertRowsOf(this.alertsOf(d).filter((x) => x.id !== a.id)),
      empty: 'No other alerts on this asset.',
      actions: [
        ...(a.status !== 'Resolved' ? [{ label: 'Mark resolved', run: () => this.setAlertStatus(a, 'Resolved') }] : []),
        { label: 'Show asset', run: () => this.select(d.id, true) },
      ],
    };
  }

  openKpi(kind: 'connected' | 'online' | 'alerts' | 'coverage' | 'freshness'): void {
    const list = this.devices;
    const k = this.kpis;
    if (kind === 'connected') {
      const assets = this.connectedAssets;
      this.drill = {
        title: 'Connected Assets', subtitle: this.kpiData?.connectedAssets.note ?? this.scope,
        stats: [{ label: 'Connected', value: k.connected }, { label: 'Registered', value: this.kpiData?.totalAssets ?? 0 }],
        columns: this.connectedColumns(), rows: this.connectedRows(assets), empty: 'No connected assets.',
      };
    } else if (kind === 'online') {
      const online = this.connectedAssets.filter((a) => a.networkStatus?.toLowerCase() === 'online');
      this.drill = {
        title: 'Online Now', subtitle: this.kpiData?.onlineNow.note ?? this.scope,
        stats: [{ label: 'Online', value: k.online, color: STATUS_COLORS.Online }, { label: 'Of connected assets', value: `${k.onlinePct}%` }],
        columns: this.connectedColumns(), rows: this.connectedRows(online), empty: 'No assets online.',
      };
    } else if (kind === 'alerts') {
      this.drill = { title: 'Alerts', subtitle: this.scope, stats: this.alertStats(this.periodAlerts), columns: this.alertColumns(true), rows: this.alertRowsOf(this.periodAlerts), empty: 'No alerts in this period.' };
    } else if (kind === 'coverage') {
      const located = (d: Device) => this.minutesSince(d.lastUpdate) <= COVERAGE_MIN;
      const n = list.filter(located).length;
      this.drill = {
        title: 'Coverage', subtitle: `Assets located within the last 24 hours · ${this.scope}`,
        stats: [{ label: 'Coverage', value: `${k.coverage}%` }, { label: 'Located', value: n, color: '#16a34a' }, { label: 'Not located', value: list.length - n, color: '#dc2626' }],
        columns: this.deviceColumns({ key: 'located', label: 'Located', pill: YES_NO }),
        rows: this.deviceRows([...list].sort((a, b) => Number(located(a)) - Number(located(b))), (d) => ({ located: located(d) ? 'Yes' : 'No' })),
      };
    } else {
      const reporting = list.filter((d) => d.status === 'Online' || d.status === 'Idle');
      const fresh = (d: Device) => this.minutesSince(d.lastUpdate) <= FRESH_MIN;
      const n = reporting.filter(fresh).length;
      this.drill = {
        title: 'Data Freshness', subtitle: `Reporting assets updated within the last hour · ${this.scope}`,
        stats: [{ label: 'Freshness', value: `${k.freshness}%` }, { label: 'Fresh', value: n, color: '#16a34a' }, { label: 'Stale', value: reporting.length - n, color: '#dc2626' }],
        columns: this.deviceColumns({ key: 'fresh', label: 'Within SLA', pill: YES_NO }),
        rows: this.deviceRows([...reporting].sort((a, b) => Number(fresh(a)) - Number(fresh(b))), (d) => ({ fresh: fresh(d) ? 'Yes' : 'No' })),
      };
    }
  }

  /** Site popup: from GET api/asset-dashboard/sites/{siteId} when the id is known, else from the local fleet (map markers). */
  openSite(name: string, siteId?: string): void {
    const on = this.site === name;
    const action = { label: on ? 'Clear site filter' : `Filter dashboard to ${name}`, run: () => this.filterSite(name) };
    if (!siteId) {
      const list = this.devices.filter((d) => d.site === name);
      this.drill = {
        title: name, subtitle: `Site · ${this.scope}`,
        stats: [{ label: 'Assets', value: list.length }, ...this.statusStats(list), { label: 'Online %', value: `${pct(list.filter((d) => d.status === 'Online').length, list.length)}%` }],
        columns: this.deviceColumns({ key: 'health', label: 'Health %', num: true }),
        rows: this.deviceRows(list, (d) => ({ health: d.health ?? '' })),
        actions: [action],
      };
      return;
    }
    this.dashboardApi
      .getSite(siteId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const assets: SiteAsset[] = res.statuses.flatMap((s) => s.assets);
          const where = [res.siteType, res.city, res.country].filter(Boolean).join(' · ');
          this.drill = {
            title: res.siteName, subtitle: `Site${where ? ' · ' + where : ''}`,
            stats: [
              { label: 'Assets', value: res.totalAssets },
              ...STATUSES.map((st) => ({ label: st, value: res.statuses.find((x) => x.status === st)?.count ?? 0, color: STATUS_COLORS[st] })),
              { label: 'Online %', value: `${Math.round(res.onlinePercent * 10) / 10}%` },
            ],
            columns: [
              { key: 'tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name' }, { key: 'type', label: 'Type' },
              { key: 'network', label: 'Network', pill: STATUS_COLORS }, { key: 'location', label: 'Location' },
              { key: 'gateway', label: 'Gateway' }, { key: 'lastSeen', label: 'Last Seen' },
            ],
            rows: assets.map((a) => ({
              cells: {
                tag: a.assetTag, name: a.assetName, type: a.assetType, network: a.networkStatus,
                location: [a.buildingName, a.floorName, a.zoneName].filter(Boolean).join(' / ') || '-',
                gateway: a.gatewayId ?? '-', lastSeen: a.lastSeenAt ? this.fmtDateTime(a.lastSeenAt) : '-',
              },
            })),
            empty: 'No assets at this site.',
            actions: [action],
          };
        },
        error: () => this.showToast(`Could not load ${name}`),
      });
  }

  openStatus(s: DeviceStatus): void {
    const list = this.devices.filter((d) => d.status === s);
    const on = this.status === s;
    this.drill = {
      title: `${s} Devices`, subtitle: this.scope,
      stats: [{ label: s, value: list.length, color: STATUS_COLORS[s] }, { label: 'Of connected assets', value: `${pct(list.length, this.devices.length)}%` }],
      columns: this.deviceColumns({ key: 'battery', label: 'Battery %', num: true }),
      rows: this.deviceRows(list, (d) => ({ battery: d.battery })),
      actions: [{ label: on ? 'Clear status filter' : `Filter dashboard to ${s}`, run: () => { this.status = on ? '' : s; this.apply(); } }],
    };
  }

  /** Map legend "Alert": devices with an unresolved critical alert in the period. */
  openAlerting(): void {
    const list = this.periodAlerts.filter((a) => a.status !== 'Resolved' && a.severity === 'Critical');
    this.drill = { title: 'Unresolved Critical Alerts', subtitle: this.scope, stats: this.alertStats(list), columns: this.alertColumns(true), rows: this.alertRowsOf(list), empty: 'No unresolved critical alerts.' };
  }

  openFirmware(): void {
    const f = this.firmware;
    this.drill = {
      title: 'Firmware Updates', subtitle: LATEST_FIRMWARE ? `Latest firmware ${LATEST_FIRMWARE} · ${this.scope}` : this.scope,
      stats: [{ label: 'On latest', value: f.latest, color: '#16a34a' }, { label: 'Update available', value: f.total - f.latest, color: '#dc2626' }, { label: 'Up to date', value: `${f.pct}%` }],
      columns: this.deviceColumns({ key: 'firmware', label: 'Firmware' }, { key: 'latest', label: 'Latest', pill: YES_NO }),
      rows: this.deviceRows([...this.devices].sort((a, b) => Number(a.firmwareLatest) - Number(b.firmwareLatest)), (d) => ({ firmware: d.firmware, latest: d.firmwareLatest ? 'Yes' : 'No' })),
    };
  }

  openAttention(): void {
    const list = this.devices.filter((d) => d.abnormal);
    this.drill = {
      title: 'Sensors Requiring Attention', subtitle: `Sensors with abnormal readings · ${this.scope}`,
      stats: [{ label: 'Sensors', value: list.length, color: '#ea580c' }],
      columns: this.deviceColumns({ key: 'temp', label: 'Temp °C', num: true }, { key: 'vib', label: 'Vibration mm/s', num: true }),
      rows: this.deviceRows(list, (d) => ({ temp: d.temperature, vib: d.vibration })),
      empty: 'No sensors with abnormal readings.',
    };
  }

  openHealth(band: HealthBand): void {
    const api = this.criticalData;
    if (band === 'Critical' && api) {
      this.drill = {
        title: 'Critical Assets', subtitle: 'Asset health score · All registered assets',
        stats: [{ label: band, value: api.count, color: HEALTH_COLORS[band] }, { label: 'Of portfolio', value: `${pct(api.count, api.totalAssets)}%` }],
        columns: [
          { key: 'tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name' }, { key: 'category', label: 'Category' }, { key: 'type', label: 'Type' },
          { key: 'site', label: 'Site' }, { key: 'criticality', label: 'Criticality', pill: { Critical: '#dc2626', High: '#f59e0b', Medium: '#2563eb', Low: '#16a34a' } },
          { key: 'status', label: 'Status' },
        ],
        rows: (api.assets ?? []).map((a) => ({
          cells: {
            tag: a.assetTag, name: a.assetName, category: [a.category, a.subCategory].filter(Boolean).join(' / ') || '-', type: a.assetType ?? '-',
            site: a.siteName ?? '-', criticality: a.criticality ?? '-', status: a.assetStatus ?? '-',
          },
        })),
        empty: 'No critical assets.',
      };
      return;
    }
    const list = this.devices.filter((d) => healthBand(d.health) === band);
    this.drill = {
      title: `${band} Assets`, subtitle: `Asset health score · ${this.scope}`,
      stats: [{ label: band, value: list.length, color: HEALTH_COLORS[band] }, { label: 'Of connected assets', value: `${pct(list.length, this.devices.length)}%` }],
      columns: this.deviceColumns({ key: 'health', label: 'Health %', num: true }),
      rows: this.deviceRows([...list].sort((a, b) => (a.health ?? 0) - (b.health ?? 0)), (d) => ({ health: d.health ?? '' })),
    };
  }

  openType(t: string): void {
    const u = this.utilization.find((x) => x.type === t);
    const list = this.devices.filter((d) => d.type === t);
    const on = this.type === t;
    this.drill = {
      title: t, subtitle: `Utilization by asset type · ${this.scope}`,
      stats: [{ label: 'Assets', value: list.length }, { label: 'Running', value: `${u?.running ?? 0}%`, color: '#2f6fe4' }, { label: 'Idle', value: `${u?.idle ?? 0}%`, color: '#d97706' }],
      columns: this.deviceColumns({ key: 'util', label: 'Utilization %', num: true }),
      rows: this.deviceRows([...list].sort((a, b) => b.utilization - a.utilization), (d) => ({ util: d.utilization })),
      actions: [{ label: on ? 'Clear type filter' : `Filter dashboard to ${t}`, run: () => { this.type = on ? '' : t; this.apply(); } }],
    };
  }

  openDay(i: number): void {
    const v = this.timeline?.vals[i];
    if (!v) return;
    const tags = this.dayTags.get(v.date) ?? [];
    this.drill = {
      title: `IoT Events · ${this.fmtDate(v.date)}`, subtitle: this.scope,
      stats: [...this.timelineSeries.map((s) => ({ label: s.label, value: v[s.key], color: s.color })), { label: 'Tags Moved', value: tags.length }],
      tableTitle: 'Location updates per tag',
      columns: [{ key: 'tag', label: 'Tag ID' }, { key: 'count', label: 'Location Updates', num: true }],
      rows: tags.map((t) => ({ cells: { tag: t.tagId, count: t.count } })),
      empty: 'No location updates this day.',
    };
  }

  openDevice(id: string): void {
    const d = DEVICES.find((x) => x.id === id);
    if (!d) return;
    this.select(id);
    this.drill = this.deviceDrill(d);
  }

  openAlert(a: AlertRow): void {
    this.select(a.deviceId);
    this.drill = this.alertDrill(a);
  }

  // ===== Navigation, export =====

  go(path: string): void {
    this.router.navigate([path]);
  }

  exportReport(): void {
    const k = this.kpis;
    const book = XLSX.utils.book_new();
    const filters = `Period: ${this.periodLabel}; Site: ${this.site || 'All'}; Type: ${this.type || 'All'}; Status: ${this.status || 'All'}`;
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { Metric: 'Filters', Value: filters },
      { Metric: 'Connected Assets', Value: k.connected }, { Metric: 'Online Now', Value: k.online }, { Metric: 'Online %', Value: k.onlinePct },
      { Metric: 'Alerts', Value: k.alerts }, { Metric: 'Critical Alerts', Value: k.critical }, { Metric: 'Coverage %', Value: k.coverage }, { Metric: 'Data Freshness %', Value: k.freshness },
      { Metric: 'Devices on latest firmware', Value: `${this.firmware.latest} / ${this.firmware.total}` }, { Metric: 'Sensors requiring attention', Value: this.attention },
    ]), 'Summary');
    const showAll = this.showAllSites;
    this.showAllSites = true;
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.siteStats.map((s) => ({ Site: s.site.name, Assets: s.total, Online: s.online, Idle: s.idle, 'Offline / Unknown': s.offline, 'Online %': s.onlinePct }))), 'Sites');
    this.showAllSites = showAll;
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.alertRows.map((a) => ({ Time: a.at.replace('T', ' '), 'Asset ID': a.device.assetId, 'Asset Name': a.device.name, Site: a.device.site, 'Event Type': a.event, Severity: a.severity, Status: a.status }))), 'Alerts');
    XLSX.writeFile(book, `IoT_Tracking_Overview_${this.sinceIso(0).slice(0, 10)}.xlsx`);
  }

  // ===== Formatting =====

  shortDate(iso: string): string {
    return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  }

  fmtDateTime(v: string): string {
    return `${MONTHS[Number(v.slice(5, 7)) - 1]} ${Number(v.slice(8, 10))}, ${v.slice(0, 4)} ${v.slice(11, 16)}`;
  }

  fmtDate(iso: string): string {
    return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
  }

  ago(v: string): string {
    const m = Math.round(this.minutesSince(v));
    return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  }

  sevClass(s: string): string {
    return 'sev--' + s.toLowerCase();
  }

  toggleMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
    this.periodOpen = false;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
    this.periodOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
