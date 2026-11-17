import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  Archive,
  Bell,
  Box,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CirclePause,
  CirclePlay,
  ClipboardList,
  Cog,
  Database,
  ExternalLink,
  Factory,
  FileText,
  FileUp,
  HardHat,
  Heart,
  HeartPulse,
  House,
  Lightbulb,
  MapPin,
  Monitor,
  PieChart,
  Plus,
  Power,
  Settings,
  Trash2,
  TriangleAlert,
  Truck,
  Upload,
  Users,
  Radio,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-angular';
import { AGE_BANDS, CATEGORIES, HEALTH_COLORS, HealthBand, PORTFOLIO, PortfolioAsset, PortfolioStatus, STATUSES, STATUS_COLORS, ageYears, healthBand, isoDate } from './asset-overview-data';
import { DrillDialog } from '../shared/drill-dialog/drill-dialog';
import { Drill, DrillColumn, DrillRow, DrillValue, pct } from '../shared/drill-dialog/drill';
import { AssetQuickView, QuickViewAsset, connectedAssetDrill, qvDate, qvDateTime, statusKey } from '../shared/asset-quick-view/quick-view';
import { AssetDashboardCategories, AssetDashboardKpis, AssetPerformanceSummary, AssetStatusCounts, AssetTypeOption, InsightAsset, InsightAssetList, InsightEndpoint, ConnectedAssetDetail, Dashboard, LocationUpdateTag, LocationUpdates, SiteOption, TopSite } from '../services/dashboard/dashboard';

/** KPI window: "Last 30 days" for api/asset-performance/summary (vs. previous 30 days) and days=30 for api/asset-dashboard/kpis. */
const KPI_DAYS = 30;

type KpiKind = 'total' | 'active' | 'maintenance' | 'critical' | 'health';
type KpiState = 'loading' | 'ok' | 'error';

type AsOf = 'today' | '30' | '90';
type Insight = '' | 'critical' | 'maintenance' | 'owner' | 'documents';
type QuickTab = 'overview' | 'location' | 'maintenance' | 'financial' | 'documents';

/** A site on "Asset Distribution by Site": counts from GET api/asset-dashboard/locations, movement from
 * GET api/asset-dashboard/location-updates?siteId=, position from the master-data site (null when it has none). */
interface SiteMapRow {
  siteId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  totalAssets: number;
  onlinePercent: number;
  /** Location updates in the last KPI_DAYS days. */
  updates: number;
  tags: LocationUpdateTag[];
  /** Which side of the pin the card sits on. */
  card: 'left' | 'right';
}

/** [lat, lng] when both are real coordinates (0,0 counts as unset). */
function point(lat: number | null | undefined, lng: number | null | undefined): [number, number] | null {
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? [a, b] : null;
}

/** Average of the given points; null when there are none. */
function centre(points: ([number, number] | null)[]): [number, number] | null {
  const ok = points.filter((p): p is [number, number] => !!p);
  if (!ok.length) return null;
  return [ok.reduce((s, p) => s + p[0], 0) / ok.length, ok.reduce((s, p) => s + p[1], 0) / ok.length];
}

/** One asset as it stood on the selected date. */
interface Snapshot extends PortfolioAsset {
  st: PortfolioStatus;
  hp: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;
const HIGH_VALUE = 500_000;
const DUE_DAYS = 30;
const TYPE_IMAGES: Record<string, string> = {
  Generator: '/asset-generator.svg',
  Forklift: '/asset-images/forklift-overview.svg',
  'HVAC Unit': '/asset-images/ahu-overview.svg',
  Transformer: '/asset-images/transformer-overview.svg',
  UPS: '/asset-images/ups-overview.svg',
  'Fire System': '/asset-images/firepump-overview.svg',
};
// Aging chart geometry (SVG user units); the width follows the card's width (1 unit = 1px)
const AW = 230;
const AW_MIN = 180;
const AH = 210;
const AP = { l: 36, r: 6, t: 22, b: 8 };

@Component({
  selector: 'app-asset-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule, DrillDialog],
  templateUrl: './asset-overview.html',
  // header, filters, KPI cards, menus, tables and quick view come from the IoT overview
  styleUrls: ['../iot-tracking-overview/iot-tracking-overview.css', '../iot-tracking-overview/iot-tracking-overview-panels.css', './asset-overview.css'],
})
export class AssetOverview implements AfterViewInit, OnDestroy {
  readonly icons = {
    ArrowDown, ArrowUp, Archive, Bell, Box, Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CirclePause, CirclePlay, ClipboardList, Cog, Database,
    ExternalLink, Factory, FileText, FileUp, HardHat, Heart, HeartPulse, House, Lightbulb, MapPin, Monitor, PieChart, Plus, Power, Radio, Settings, Trash2, TriangleAlert, Truck, Upload,
    Users, Wifi, WifiOff, Wrench,
  };
  readonly categoryIcons: Record<string, typeof Factory> = { factory: Factory, truck: Truck, building: Building2, monitor: Monitor, wrench: Wrench, 'hard-hat': HardHat };
  readonly statusIcons: Record<PortfolioStatus, typeof Factory> = {
    Active: CirclePlay, Idle: CirclePause, 'In Transit': Truck, 'Under Maintenance': Wrench, Retired: Archive, Disposed: Trash2,
  };
  readonly categories = CATEGORIES;
  /** "Site" dropdown, from GET api/master-data/sites?clientId=. */
  sites: string[] = [];
  /** Rows of GET api/master-data/asset-types behind the "Asset Type" dropdown. */
  private assetTypes: AssetTypeOption[] = [];
  readonly statuses = STATUSES;
  readonly statusColors = STATUS_COLORS;
  readonly healthColors = HEALTH_COLORS;
  readonly healthBand = healthBand;
  aw = AW;
  readonly ah = AH;
  readonly ap = AP;

  // Filters
  asOf: AsOf = 'today';
  asOfOpen = false;
  site = '';
  category = '';
  type = '';
  status: PortfolioStatus | '' = '';

  // Cards
  hoverHealth: HealthBand | null = null;
  hoverAge: number | null = null;
  insight: Insight = '';
  showAllRows = false;
  rowPage = 0;
  readonly rowPageSize = 8;
  showAllSites = false;
  selectedId = '';
  quickTab: QuickTab = 'overview';
  menuOpen = '';
  /** Drill-down popup for the clicked widget element. */
  drill: Drill | null = null;

  /** Assets on the selected date that pass the filters; rebuilt by apply(). */
  assets: Snapshot[] = [];

  @ViewChild('mapEl') private mapEl?: ElementRef<HTMLDivElement>;
  @ViewChild('agingEl') private agingEl?: ElementRef<HTMLDivElement>;
  private map?: L.Map;
  private siteLayer?: L.LayerGroup;
  private mapResize?: ResizeObserver;
  private agingResize?: ResizeObserver;
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly today = new Date();
  private readonly dashboardApi = inject(Dashboard);
  private readonly destroyRef = inject(DestroyRef);
  /** Asset Quick View: registered assets from GET api/asset-registrations, one at a time. */
  readonly qv = new AssetQuickView(this.dashboardApi, this.destroyRef);
  readonly statusKey = statusKey;
  readonly qvDate = qvDate;
  readonly qvDateTime = qvDateTime;

  readonly kpiDays = KPI_DAYS;
  // KPI cards, each from an existing API; a source is null until it answers and 'error' when it failed.
  /** Total / Active / Under Maintenance: GET api/asset-dashboard/statuses?includeAssets=false (Asset service). */
  statusData: AssetStatusCounts | null | 'error' = null;
  /** Total Assets change and Avg Asset Health Score: GET api/asset-performance/summary?datePreset=Last 30 days (Report Analytics). */
  performance: AssetPerformanceSummary | null | 'error' = null;
  /** GET api/asset-dashboard/kpis: only its connected assets are used here (Quick View connectivity). */
  kpiData: AssetDashboardKpis | null = null;
  /** "Asset Portfolio by Category" from GET api/asset-dashboard/categories; null until the first response. */
  categoryData: AssetDashboardCategories | null = null;
  categoryLoading = false;
  /** Quick Insights lists from the API, by insight; missing until loaded. */
  insightData: Partial<Record<Insight, InsightAssetList>> = {};
  /** GET api/asset-dashboard/critical-assets failed (Critical Assets card shows "Could not load"). */
  criticalFailed = false;
  /** "Asset Distribution by Site", one row per site the dashboard API knows. */
  siteRows: SiteMapRow[] = [];
  sitesLoading = false;
  readonly siteDays = KPI_DAYS;
  private siteSub?: Subscription;
  /** Asset type the site rows were fetched for; null before the first fetch. */
  private siteMapType: string | null = null;

  constructor() {
    this.loadKpiSources();
    this.loadConnected();
    this.loadFilterOptions();
    this.loadCategories();
    this.loadInsights();
    this.qv.load();
    this.apply();
    const first = [...this.assets].filter((a) => a.criticality === 'Critical').sort((a, b) => b.value - a.value)[0] ?? this.assets[0];
    this.selectedId = first?.id ?? '';
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.observeAging();
  }

  ngOnDestroy(): void {
    this.mapResize?.disconnect();
    this.agingResize?.disconnect();
    this.map?.remove();
  }

  // ===== Filters =====

  get asOfDate(): Date {
    return this.asOf === 'today' ? this.today : new Date(this.today.getTime() - Number(this.asOf) * DAY);
  }

  get asOfLabel(): string {
    return this.asOf === 'today' ? 'As of Today' : `As of ${this.fmtDate(isoDate(this.asOfDate))}`;
  }

  setAsOf(v: AsOf): void {
    this.asOf = v;
    this.asOfOpen = false;
    this.apply();
  }

  /** Types offered in the dropdown: the API types of the chosen category, or all when none belong to it. */
  get types(): string[] {
    const inCategory = this.assetTypes.filter((t) => t.category?.name === this.category);
    const list = this.category && inCategory.length ? inCategory : this.assetTypes;
    return [...new Set(list.map((t) => t.assetTypeName))].sort((a, b) => a.localeCompare(b));
  }

  onCategory(): void {
    if (this.type && !this.types.includes(this.type)) this.type = '';
    this.apply();
  }

  apply(): void {
    this.assets = this.snapshot(this.asOfDate, this.asOf === 'today');
    this.rowPage = 0;
    // location-updates filters by asset type; site / category / status only highlight on the map
    if (this.siteMapType !== this.type) {
      this.siteMapType = this.type;
      this.loadSiteMap();
    }
    this.drawSites();
  }

  /** Assets owned on `date`; history before today uses the recorded earlier status and health. */
  private snapshot(date: Date, current: boolean): Snapshot[] {
    const day = isoDate(date);
    return PORTFOLIO.filter((a) => a.acquired <= day)
      .map((a) => ({ ...a, st: current ? a.status : a.prevStatus, hp: current ? a.health : a.prevHealth }))
      .filter((a) => (!this.site || a.site === this.site) && (!this.category || a.category === this.category) && (!this.type || a.type === this.type) && (!this.status || a.st === this.status));
  }

  get filtered(): boolean {
    return !!(this.site || this.category || this.type || this.status);
  }

  // ===== KPIs =====

  /** Fills the Site and Asset Type dropdowns from master data (active, non-deleted rows). */
  loadFilterOptions(): void {
    const live = <T extends { status: string; isDeleted: boolean }>(rows: T[] | null) => (rows ?? []).filter((r) => !r.isDeleted && r.status !== 'Inactive');
    this.dashboardApi
      .getSites()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => (this.sites = [...new Set(live(res).map((s) => s.siteName).filter(Boolean))].sort((a, b) => a.localeCompare(b))),
        error: () => (this.sites = []),
      });
    this.dashboardApi
      .getAssetTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => (this.assetTypes = live(res).filter((t) => !!t.assetTypeName)),
        error: () => (this.assetTypes = []),
      });
  }

  /** Fetches the Quick Insights lists that have an API (due-for-maintenance is still local). */
  loadInsights(): void {
    const endpoints: [Insight, InsightEndpoint][] = [['critical', 'critical-assets'], ['owner', 'assets-without-custodian'], ['documents', 'assets-without-documents']];
    for (const [key, endpoint] of endpoints) {
      // critical-assets also drives the health donut's Critical band
      const req = key === 'critical' ? this.dashboardApi.getCriticalAssets() : this.dashboardApi.getInsightAssets(endpoint);
      req
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => (this.insightData = { ...this.insightData, [key]: res }),
          // critical stays unset on error so the health donut falls back to local data (Quick Insights shows 0 either way)
          error: () => {
            if (key === 'critical') this.criticalFailed = true;
            else this.insightData = { ...this.insightData, [key]: { count: 0, totalAssets: 0, assets: [] } };
          },
        });
    }
  }

  /** Fetches the asset counts per category once, when the page opens. */
  loadCategories(): void {
    this.categoryLoading = true;
    this.dashboardApi
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.categoryData = res;
          this.categoryLoading = false;
        },
        error: () => {
          this.categoryData = null;
          this.categoryLoading = false;
        },
      });
  }

  /** Fetches the KPI cards' sources: asset statuses (Asset service) and the asset performance summary (Report Analytics). */
  loadKpiSources(): void {
    this.dashboardApi
      .getStatusCounts(undefined, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => (this.statusData = res), error: () => (this.statusData = 'error') });
    this.dashboardApi
      .getAssetPerformanceSummary(`Last ${KPI_DAYS} days`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => (this.performance = res), error: () => (this.performance = 'error') });
  }

  /** Connected assets (GET api/asset-dashboard/kpis) for the Quick View's connectivity; not shown as cards here. */
  loadConnected(): void {
    this.dashboardApi
      .getKpis(KPI_DAYS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.kpiData = res;
          this.qv.setConnected(res?.connectedAssetDetails ?? []);
        },
        error: () => (this.kpiData = null),
      });
  }

  /**
   * The KPI cards' figures from the existing APIs. A figure is null while its source loads or when it failed;
   * the matching *State says which ('loading' shows …, 'error' shows – with "Could not load").
   * Lifecycle Value has no API in any service yet, so it is not here.
   */
  get kpis() {
    const st = this.statusData === 'error' ? null : this.statusData;
    const perf = this.performance === 'error' ? null : this.performance?.data ?? null;
    const crit = this.insightData.critical;
    const state = (src: unknown, failed: boolean): KpiState => (src ? 'ok' : failed ? 'error' : 'loading');
    const statusState = state(st, this.statusData === 'error');
    const perfState = state(perf, this.performance === 'error');
    const count = (status: string) => st?.statuses.find((s) => s.status.toLowerCase() === status.toLowerCase())?.count ?? 0;
    const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
    const active = st ? count('Active') : null;
    const maintenance = st ? count('Under Maintenance') : null;
    const health = perf?.averageHealthScore;
    return {
      total: st?.totalAssets ?? null, totalState: statusState,
      // Report Analytics: assets in service vs. the previous 30 days
      totalChange: round(perf?.totalAssets.change),
      active, activePct: st && active !== null ? pct(active, st.totalAssets) : 0, activeState: statusState,
      maintenance, maintenancePct: st && maintenance !== null ? pct(maintenance, st.totalAssets) : 0, maintenanceState: statusState,
      critical: crit?.count ?? null, criticalPct: crit ? pct(crit.count, crit.totalAssets) : 0, criticalState: state(crit, this.criticalFailed),
      // null value with the summary loaded = no asset has a condition assessment yet
      health: round(health?.value), healthState: perfState,
      healthChange: round(health?.change), healthUnit: health?.changeUnit === 'points' ? ' pts' : '%',
    };
  }

  /** Placeholder for a figure that is not there: … while loading, – when it could not be loaded or has no data. */
  blank(s: KpiState): string {
    return s === 'loading' ? '…' : '–';
  }

  /** Connected assets returned with the KPIs. */
  get connectedAssets(): ConnectedAssetDetail[] {
    return this.kpiData?.connectedAssetDetails ?? [];
  }

  // ===== Portfolio, health, status =====

  get byCategory() {
    const rows = this.categoryData?.categories ?? [];
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r, i) => {
      // icon and colour from the local catalogue when the name matches, else cycle through it
      const local = CATEGORIES.find((c) => c.name.toLowerCase() === r.category.toLowerCase()) ?? CATEGORIES[i % CATEGORIES.length];
      return {
        name: r.category, color: local.color, icon: local.icon, count: r.count,
        pct: Math.round(r.percent * 10) / 10, bar: (r.count / max) * 100, subCategories: r.subCategories ?? [],
        // sub-category lines under the row: bar on the same scale as categories, % is the share of this category
        subs: (r.subCategories ?? []).map((sc) => ({ name: sc.subCategory, count: sc.count, pct: pct(sc.count, r.count), bar: (sc.count / max) * 100 })),
      };
    });
  }

  pickCategory(name: string): void {
    this.category = this.category === name ? '' : name;
    this.onCategory();
  }

  /** Assets per health band; Critical comes from GET api/asset-dashboard/critical-assets once loaded, the rest from the local portfolio. */
  private healthCount(b: HealthBand): number {
    const api = this.insightData.critical;
    if (b === 'Critical' && api) return api.count;
    return this.assets.filter((a) => healthBand(a.hp) === b).length;
  }

  get health() {
    const bands: HealthBand[] = ['Healthy', 'Warning', 'Critical', 'Unknown'];
    const counts = bands.map((b) => this.healthCount(b));
    const total = counts.reduce((s, n) => s + n, 0);
    const C = 2 * Math.PI * 46;
    let acc = 0;
    const rows = bands.map((b, i) => {
      const count = counts[i];
      const len = total ? (count / total) * C : 0;
      const mid = (acc + len / 2) / C;
      const row = {
        band: b, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0, color: HEALTH_COLORS[b], dash: `${Math.max(0, len - (count ? 2 : 0))} ${C}`, offset: -acc,
        // label position just outside the ring, at the segment's middle
        lx: 70 + 64 * Math.sin(mid * 2 * Math.PI), ly: 70 - 64 * Math.cos(mid * 2 * Math.PI) + 3,
      };
      acc += len;
      return row;
    });
    return { total, rows };
  }

  get byStatus() {
    const total = this.assets.length || 1;
    return STATUSES.map((s) => {
      const count = this.assets.filter((a) => a.st === s).length;
      return { status: s, count, pct: Math.round((count / total) * 1000) / 10, color: STATUS_COLORS[s] };
    });
  }

  pickStatus(s: PortfolioStatus): void {
    this.status = this.status === s ? '' : s;
    this.apply();
  }

  // ===== Insights =====

  private dueSoon(a: Snapshot): boolean {
    const limit = isoDate(new Date(this.asOfDate.getTime() + DUE_DAYS * DAY));
    return a.st !== 'Disposed' && a.st !== 'Retired' && a.nextService <= limit;
  }

  get insights(): { key: Insight; count: number; label: string; icon: typeof Factory; tone: string }[] {
    return [
      { key: 'critical', count: this.insightData.critical?.count ?? 0, label: 'critical assets', icon: TriangleAlert, tone: 'red' },
      { key: 'maintenance', count: this.assets.filter((a) => this.dueSoon(a)).length, label: 'due for maintenance', icon: Wrench, tone: 'amber' },
      { key: 'owner', count: this.insightData.owner?.count ?? 0, label: 'assets without custodian', icon: Users, tone: 'blue' },
      { key: 'documents', count: this.insightData.documents?.count ?? 0, label: 'assets with missing documents', icon: FileText, tone: 'violet' },
    ];
  }

  openInsight(key: Insight): void {
    this.insight = this.insight === key ? '' : key;
    this.showAllRows = !!this.insight;
    this.rowPage = 0;
  }

  get tableTitle(): string {
    return {
      '': 'Critical & High-Value Assets', critical: 'Critical Assets', maintenance: `Due for Maintenance (next ${DUE_DAYS} days)`, owner: 'Assets Without Owner', documents: 'Assets With Missing Documents',
    }[this.insight];
  }

  get tableRows(): Snapshot[] {
    return this.insightList(this.insight);
  }

  private insightList(insight: Insight): Snapshot[] {
    const list = this.assets;
    switch (insight) {
      case 'critical': return list.filter((a) => a.criticality === 'Critical').sort((a, b) => b.value - a.value);
      case 'maintenance': return list.filter((a) => this.dueSoon(a)).sort((a, b) => a.nextService.localeCompare(b.nextService));
      case 'owner': return list.filter((a) => !a.owner).sort((a, b) => b.value - a.value);
      case 'documents': return list.filter((a) => !a.documents).sort((a, b) => b.value - a.value);
      default: return list.filter((a) => a.criticality === 'Critical' || a.value >= HIGH_VALUE).sort((a, b) => b.value - a.value);
    }
  }

  /** Default and "Critical Assets" views list GET api/asset-dashboard/critical-assets once it has loaded; other insights stay local. */
  get apiTable(): boolean {
    return (this.insight === '' || this.insight === 'critical') && !!this.insightData.critical;
  }

  /** Critical assets from the API, narrowed by the Site / Category / Type filters (matched by name, case-insensitive). */
  get apiRows(): InsightAsset[] {
    const same = (v: string | null, f: string) => !f || (v ?? '').toLowerCase() === f.toLowerCase();
    return (this.insightData.critical?.assets ?? []).filter((a) => same(a.siteName, this.site) && same(a.category, this.category) && same(a.assetType, this.type));
  }

  /** Row count of whichever list the table shows. */
  get tableCount(): number {
    return this.apiTable ? this.apiRows.length : this.tableRows.length;
  }

  private page<T>(list: T[]): T[] {
    return this.showAllRows ? list.slice(this.rowPage * this.rowPageSize, (this.rowPage + 1) * this.rowPageSize) : list.slice(0, 5);
  }

  get pageRows(): Snapshot[] {
    return this.page(this.tableRows);
  }

  get pageApiRows(): InsightAsset[] {
    return this.page(this.apiRows);
  }

  get rowPages(): number {
    return Math.max(1, Math.ceil(this.tableCount / this.rowPageSize));
  }

  /** Pill class for an API criticality (Critical / High / Medium / Low). */
  critClass(c: string | null): string {
    return { critical: 'sev--critical', high: 'sev--warning', medium: 'sev--info' }[(c ?? '').toLowerCase()] ?? 'sev--low';
  }

  /** Details popup for a row of the critical-assets API. */
  openCriticalAsset(a: InsightAsset): void {
    this.drill = this.insightAssetDrill(a);
  }

  /** Details of one dashboard-API asset row (also opened from the KPI card lists); shows it in Quick View too. */
  private insightAssetDrill(a: InsightAsset): Drill {
    this.showQuick(a.assetRegistrationId);
    return {
      title: `${a.assetTag} · ${a.assetName}`,
      subtitle: [[a.category, a.subCategory].filter(Boolean).join(' / '), a.assetType, a.siteName].filter(Boolean).join(' · ') || 'Asset',
      stats: [
        { label: 'Criticality', value: a.criticality ?? '-', color: (a.criticality ?? '').toLowerCase() === 'critical' ? '#dc2626' : undefined },
        { label: 'Status', value: a.assetStatus ?? '-' },
        { label: 'Documents', value: a.documentCount },
      ],
      columns: [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }],
      rows: [
        ['Asset Tag', a.assetTag], ['Asset Name', a.assetName], ['Category', a.category], ['Sub-category', a.subCategory], ['Asset Type', a.assetType],
        ['Site', a.siteName], ['Location', a.locationPath],
        ['Custodian', a.custodianName ? `${a.custodianName}${a.custodianDepartment ? ' (' + a.custodianDepartment + ')' : ''}` : 'Not assigned'],
      ].map(([field, value]) => ({ cells: { field: field as string, value: (value as string | null) || '-' } })),
    };
  }

  // ===== Aging =====

  get aging() {
    const total = this.assets.length || 1;
    const counts = AGE_BANDS.map((b) => this.assets.filter((a) => {
      const y = ageYears(a.acquired, this.asOfDate);
      return y >= b.min && y < b.max;
    }).length);
    const max = Math.max(1, ...counts);
    const step = max > 1200 ? 400 : max > 600 ? 200 : max > 120 ? 50 : 10;
    const top = Math.ceil(max / step) * step;
    const plotH = AH - AP.t - AP.b;
    const slot = (this.aw - AP.l - AP.r) / AGE_BANDS.length;
    const barW = slot * 0.66;
    const bars = AGE_BANDS.map((b, i) => {
      const h = (counts[i] / top) * plotH;
      return { ...b, count: counts[i], pct: Math.round((counts[i] / total) * 1000) / 10, x: AP.l + slot * i + (slot - barW) / 2, y: AH - AP.b - h, h };
    });
    const ticks = Array.from({ length: top / step + 1 }, (_, i) => ({ y: AH - AP.b - (i * step / top) * plotH, label: (i * step).toLocaleString() }));
    return { bars, ticks, barW };
  }

  /** Redraws the aging chart at its card's width as the grid columns change (window, breakpoints, sidebar). */
  private observeAging(): void {
    const el = this.agingEl?.nativeElement;
    if (!el) return;
    this.agingResize = new ResizeObserver(() => {
      if (!el.clientWidth) return;
      const aw = Math.max(AW_MIN, Math.round(el.clientWidth));
      // ResizeObserver callbacks run outside Angular's zone
      if (aw !== this.aw) this.zone.run(() => (this.aw = aw));
    });
    this.agingResize.observe(el);
  }

  // ===== Sites & map =====

  /** Sites that can be pinned on the map. */
  get pinnedSites(): SiteMapRow[] {
    return this.siteRows.filter((r) => r.lat !== null && r.lng !== null);
  }

  /**
   * Sites (GET api/asset-dashboard/locations) with their location updates for the last KPI_DAYS days
   * (GET api/asset-dashboard/location-updates?siteId=, one call per site) and map position (master-data sites).
   */
  loadSiteMap(): void {
    this.siteSub?.unsubscribe();
    this.sitesLoading = true;
    const assetType = this.type || undefined;
    this.siteSub = forkJoin({
      master: this.dashboardApi.getSites().pipe(catchError(() => of([] as SiteOption[]))),
      locations: this.dashboardApi.getLocations().pipe(catchError(() => of(null))),
    })
      .pipe(
        switchMap(({ master, locations }) => {
          const sites = locations?.topSites ?? [];
          if (!sites.length) return of([] as SiteMapRow[]);
          return forkJoin(
            sites.map((site) =>
              this.dashboardApi.getLocationUpdates(KPI_DAYS, { siteId: site.siteId, assetType }).pipe(
                catchError(() => of(null)),
                map((u) => this.siteRow(site, u, master ?? [])),
              ),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        // cards sit right of their pin, except the easternmost site's, which opens to the left
        const east = rows.filter((r) => r.lng !== null).sort((a, b) => b.lng! - a.lng!)[0];
        if (east && rows.filter((r) => r.lng !== null).length > 1) east.card = 'left';
        this.siteRows = rows.sort((a, b) => b.totalAssets - a.totalAssets || a.name.localeCompare(b.name));
        this.sitesLoading = false;
        this.fitSites();
        this.drawSites();
      });
  }

  private siteRow(site: TopSite, u: LocationUpdates | null, master: SiteOption[]): SiteMapRow {
    const name = site.siteName || site.siteId;
    const m = master.find((x) => x.id === site.siteId) ?? master.find((x) => x.siteName?.trim().toLowerCase() === name.trim().toLowerCase());
    const tags = u?.tags ?? [];
    // the master-data site's position; without one, the centre of where the site's tags last moved to
    const pos = point(m?.latitude, m?.longitude) ?? centre(tags.map((t) => point(t.lastToLatitude, t.lastToLongitude)));
    return {
      siteId: site.siteId, name, lat: pos?.[0] ?? null, lng: pos?.[1] ?? null,
      totalAssets: site.totalAssets ?? 0, onlinePercent: Math.round((site.onlinePercent ?? 0) * 10) / 10,
      updates: u?.totalCount ?? 0, tags, card: 'right',
    };
  }

  private initMap(): void {
    const el = this.mapEl?.nativeElement;
    if (!el) return;
    this.map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.siteLayer = L.layerGroup().addTo(this.map);
    this.fitSites();
    this.drawSites();
    // Leaflet only measures on init: refit whenever the card is resized or un-hidden.
    this.mapResize = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      this.map?.invalidateSize();
      this.fitSites();
    });
    this.mapResize.observe(el);
  }

  /** Fits all pinned sites, with padding scaled to the map so small cards still get a usable zoom. */
  private fitSites(): void {
    const size = this.map?.getSize();
    if (!this.map || !size?.x || !size.y) return;
    const pins = this.pinnedSites;
    // No sites with coordinates: show a world view instead of fitting empty (invalid) bounds
    if (!pins.length) {
      this.map.setView([20, 0], 2);
      return;
    }
    const pad: [number, number] = [Math.min(120, size.x * 0.2), Math.min(70, size.y * 0.2)];
    this.map.fitBounds(L.latLngBounds(pins.map((s) => [s.lat!, s.lng!] as [number, number])), { padding: pad, maxZoom: 12 });
  }

  /** Each site: a pin plus a card with its asset count and online share (location updates are in the site popup). */
  private drawSites(): void {
    if (!this.map || !this.siteLayer) return;
    this.siteLayer.clearLayers();
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    for (const s of this.pinnedSites) {
      const on = this.site === s.name;
      const dim = !!this.site && !on;
      const C = 2 * Math.PI * 9;
      const ring = `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="#e5e7eb" stroke-width="4"/><circle cx="12" cy="12" r="9" fill="none" stroke="#16a34a" stroke-width="4" stroke-dasharray="${(C * s.onlinePercent) / 100} ${C}" transform="rotate(-90 12 12)"/></svg>`;
      const html = `<div class="ao-site-card ao-site-card--${s.card}${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}">
          <strong>${esc(s.name)}</strong><span>${s.totalAssets.toLocaleString()} assets</span>
          <span class="ao-site-health">${ring}<b>${s.onlinePercent}%</b> Online</span></div><i class="ao-site-pin"></i>`;
      L.marker([s.lat!, s.lng!], { icon: L.divIcon({ className: 'ao-site', html, iconSize: [0, 0] }), keyboard: true, title: s.name })
        .on('click', () => this.zone.run(() => this.openSite(s)))
        .addTo(this.siteLayer);
    }
  }

  pickSite(name: string): void {
    this.site = this.site === name ? '' : name;
    this.apply();
  }

  // ===== Quick view =====

  get selected(): Snapshot | null {
    return this.assets.find((a) => a.id === this.selectedId) ?? null;
  }

  /** Highlights the row and shows the asset in the Quick View when it is registered under the same tag. */
  select(a: Snapshot): void {
    this.selectedId = a.id;
    if (this.qv.showTag(a.id)) this.quickTab = 'overview';
  }

  /** Shows a registered asset in the Quick View. */
  showQuick(assetRegistrationId: string): void {
    this.quickTab = 'overview';
    this.qv.show(assetRegistrationId);
  }

  imageOf(a: PortfolioAsset): string | null {
    return TYPE_IMAGES[a.type] ?? null;
  }

  ageOf(a: PortfolioAsset): string {
    return ageYears(a.acquired, this.asOfDate).toFixed(1);
  }

  // ===== Drill-down popup =====

  private get scope(): string {
    return `${this.asOfLabel} · ${[this.site, this.category, this.type, this.status].filter(Boolean).join(' · ') || 'All sites, categories, types and statuses'}`;
  }

  private assetColumns(...extra: DrillColumn[]): DrillColumn[] {
    return [
      { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'category', label: 'Category' }, { key: 'site', label: 'Site' },
      { key: 'status', label: 'Status', pill: STATUS_COLORS }, ...extra, { key: 'health', label: 'Health %', num: true }, { key: 'value', label: 'Value (USD)', num: true },
    ];
  }

  private assetRows(list: Snapshot[], extra: (a: Snapshot) => Record<string, DrillValue> = () => ({})): DrillRow[] {
    return list.map((a) => ({
      cells: { id: a.id, name: a.name, category: a.category, site: a.site, status: a.st, health: a.hp ?? '', value: a.value, ...extra(a) },
      open: () => this.assetDrill(a),
    }));
  }

  private statusStats(list: Snapshot[]) {
    return STATUSES.map((s) => ({ label: s, value: list.filter((a) => a.st === s).length, color: STATUS_COLORS[s] }));
  }

  private valueOf(list: Snapshot[]): string {
    return this.money(list.filter((a) => a.st !== 'Disposed').reduce((s, a) => s + a.value, 0));
  }

  private assetDrill(a: Snapshot): Drill {
    const band = healthBand(a.hp);
    return {
      title: `${a.id} · ${a.name}`,
      subtitle: `${a.category} · ${a.type} · ${a.site}`,
      stats: [
        { label: 'Status', value: a.st, color: STATUS_COLORS[a.st] },
        { label: 'Health Score', value: a.hp === null ? '-' : `${a.hp}%`, color: HEALTH_COLORS[band] },
        { label: 'Criticality', value: a.criticality, color: a.criticality === 'Critical' ? '#dc2626' : undefined },
        { label: 'Book Value', value: this.money(a.value) },
      ],
      fields: [
        { label: 'Manufacturer', value: a.manufacturer }, { label: 'Model', value: a.model },
        { label: 'Serial Number', value: a.serial }, { label: 'Department', value: a.department },
        { label: 'Owner', value: a.owner || 'Not assigned', color: a.owner ? undefined : '#dc2626' }, { label: 'Documents', value: a.documents || 'None on file', color: a.documents ? undefined : '#dc2626' },
        { label: 'Acquired', value: this.fmtDate(a.acquired) }, { label: 'Age', value: `${this.ageOf(a)} years` },
        { label: 'Last Service', value: this.fmtDate(a.lastService) }, { label: 'Next Service', value: this.fmtDate(a.nextService) },
        { label: 'Connectivity', value: a.connected ? 'Online' : 'Not connected' }, { label: 'Last Update', value: this.fmtDateTime(a.lastUpdate) },
      ],
      actions: this.qv.hasTag(a.id) ? [{ label: 'Show in Quick View', run: () => this.select(a) }] : [],
    };
  }

  /** Drill-down of a KPI card; asset lists come from GET api/asset-dashboard/statuses and /critical-assets. */
  openKpi(kind: KpiKind): void {
    const k = this.kpis;
    const change = (v: number | null, unit = '%') => (v === null ? [] : [{ label: `vs. previous ${KPI_DAYS} days`, value: `${v > 0 ? '+' : ''}${v}${unit}` }]);
    const columns: DrillColumn[] = [
      { key: 'tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name' }, { key: 'category', label: 'Category' }, { key: 'type', label: 'Type' },
      { key: 'site', label: 'Site' }, { key: 'criticality', label: 'Criticality' }, { key: 'status', label: 'Status' },
    ];
    const rows = (list: InsightAsset[]): DrillRow[] => list.map((a) => ({
      cells: {
        tag: a.assetTag, name: a.assetName, category: a.category ?? '-', type: a.assetType ?? '-', site: a.siteName ?? '-',
        criticality: a.criticality ?? '-', status: a.assetStatus ?? '-',
      },
      open: () => this.insightAssetDrill(a),
    }));
    // asset list of one status, fetched when the card is opened
    const byStatus = (title: string, status: string, stats: Drill['stats']) => {
      this.drill = { title, subtitle: 'Registered assets by status', stats, tableTitle: `${status} assets`, columns, rows: [], empty: 'Loading assets…' };
      this.dashboardApi
        .getStatusCounts(status)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            if (this.drill?.title !== title) return;
            const assets = res.statuses.find((s) => s.status.toLowerCase() === status.toLowerCase())?.assets ?? [];
            this.drill = { ...this.drill, rows: rows(assets), empty: `No ${status.toLowerCase()} assets.` };
          },
          error: () => this.drill?.title === title && (this.drill = { ...this.drill, empty: 'Could not load the assets.' }),
        });
    };

    if (kind === 'total') {
      this.drill = {
        title: 'Total Assets', subtitle: 'Registered assets by status',
        stats: [{ label: 'Registered', value: k.total ?? '-' }, ...change(k.totalChange)],
        tableTitle: 'Assets by status',
        columns: [{ key: 'status', label: 'Status' }, { key: 'count', label: 'Assets', num: true }, { key: 'pct', label: 'Of total', num: true }],
        rows: [], empty: 'Loading statuses…',
      };
      this.dashboardApi
        .getStatusCounts(undefined, false)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            if (this.drill?.title !== 'Total Assets') return;
            this.drill = { ...this.drill, rows: res.statuses.map((s) => ({ cells: { status: s.status, count: s.count, pct: `${s.percent}%` } })), empty: 'No assets.' };
          },
          error: () => this.drill?.title === 'Total Assets' && (this.drill = { ...this.drill, empty: 'Could not load the statuses.' }),
        });
    } else if (kind === 'active') {
      byStatus('Active Assets', 'Active', [{ label: 'Active', value: k.active ?? '-', color: '#16a34a' }, { label: 'Of total assets', value: `${k.activePct}%` }]);
    } else if (kind === 'maintenance') {
      byStatus('Assets Under Maintenance', 'Under Maintenance', [{ label: 'Under maintenance', value: k.maintenance ?? '-', color: '#d97706' }, { label: 'Of total assets', value: `${k.maintenancePct}%` }]);
    } else if (kind === 'critical') {
      this.drill = {
        title: 'Critical Assets', subtitle: 'Assets with criticality Critical',
        stats: [{ label: 'Critical', value: k.critical ?? '-', color: '#dc2626' }, { label: 'Of total assets', value: `${k.criticalPct}%` }],
        tableTitle: 'Critical assets', columns, rows: rows(this.insightData.critical?.assets ?? []), empty: 'No critical assets.',
      };
    } else {
      this.drill = {
        title: 'Avg Asset Health Score', subtitle: `Latest condition assessment of each asset · last ${KPI_DAYS} days`,
        stats: [{ label: 'Average score', value: k.health === null ? '-' : `${k.health}%` }, ...change(k.healthChange, k.healthUnit)],
      };
    }
  }

  openCategory(name: string): void {
    const c = this.byCategory.find((r) => r.name === name);
    if (!c) return;
    const on = this.category === name;
    this.drill = {
      title: name, subtitle: 'Asset category',
      stats: [{ label: 'Assets', value: c.count }, { label: 'Of portfolio', value: `${c.pct}%` }, { label: 'Sub-categories', value: c.subCategories.length }],
      tableTitle: 'Sub-categories',
      columns: [{ key: 'sub', label: 'Sub-category' }, { key: 'count', label: 'Assets', num: true }, { key: 'pct', label: 'Of category', num: true }],
      rows: c.subCategories.map((s) => ({ cells: { sub: s.subCategory, count: s.count, pct: `${pct(s.count, c.count)}%` } })),
      empty: 'No sub-categories.',
      actions: [{ label: on ? 'Clear category filter' : `Filter dashboard to ${name}`, run: () => this.pickCategory(name) }],
    };
  }

  openHealthBand(band: HealthBand): void {
    if (band === 'Critical' && this.insightData.critical) {
      this.openInsightDrill('critical');
      return;
    }
    const list = this.assets.filter((a) => healthBand(a.hp) === band).sort((a, b) => (a.hp ?? 0) - (b.hp ?? 0));
    this.drill = {
      title: `${band} Assets`, subtitle: `Asset health distribution · ${this.scope}`,
      stats: [{ label: band, value: list.length, color: HEALTH_COLORS[band] }, { label: 'Of portfolio', value: `${pct(list.length, this.assets.length)}%` }, { label: 'Value', value: this.valueOf(list) }],
      columns: this.assetColumns(), rows: this.assetRows(list),
    };
  }

  openStatus(s: PortfolioStatus): void {
    const list = this.assets.filter((a) => a.st === s);
    const on = this.status === s;
    this.drill = {
      title: `${s} Assets`, subtitle: `Asset status · ${this.scope}`,
      stats: [{ label: s, value: list.length, color: STATUS_COLORS[s] }, { label: 'Of portfolio', value: `${pct(list.length, this.assets.length)}%` }, { label: 'Value', value: this.valueOf(list) }],
      columns: this.assetColumns(), rows: this.assetRows(list),
      actions: [{ label: on ? 'Clear status filter' : `Filter dashboard to ${s}`, run: () => this.pickStatus(s) }],
    };
  }

  openInsightDrill(key: Insight): void {
    const i = this.insights.find((x) => x.key === key);
    const api = this.insightData[key];
    if (key !== 'maintenance') {
      const list: InsightAsset[] = api?.assets ?? [];
      this.drill = {
        title: this.capitalize(i?.label ?? ''), subtitle: 'All registered assets',
        stats: [{ label: 'Assets', value: api?.count ?? 0 }, { label: 'Of portfolio', value: `${pct(api?.count ?? 0, api?.totalAssets ?? 0)}%` }],
        columns: [
          { key: 'tag', label: 'Asset Tag' }, { key: 'name', label: 'Asset Name' }, { key: 'category', label: 'Category' }, { key: 'type', label: 'Type' },
          { key: 'site', label: 'Site' }, { key: 'criticality', label: 'Criticality', pill: { Critical: '#dc2626', High: '#f59e0b', Medium: '#2563eb', Low: '#16a34a' } },
          { key: 'custodian', label: 'Custodian' }, { key: 'docs', label: 'Documents', num: true },
        ],
        rows: list.map((a) => ({
          cells: {
            tag: a.assetTag, name: a.assetName, category: [a.category, a.subCategory].filter(Boolean).join(' / ') || '-', type: a.assetType ?? '-',
            site: a.siteName ?? '-', criticality: a.criticality ?? '-',
            custodian: a.custodianName ? `${a.custodianName}${a.custodianDepartment ? ' (' + a.custodianDepartment + ')' : ''}` : 'Not assigned', docs: a.documentCount,
          },
        })),
        empty: 'No assets.',
      };
      return;
    }
    const list = this.insightList(key);
    const service = key === 'maintenance';
    this.drill = {
      title: this.capitalize(i?.label ?? ''), subtitle: this.scope,
      stats: [{ label: 'Assets', value: list.length }, { label: 'Of portfolio', value: `${pct(list.length, this.assets.length)}%` }, { label: 'Value', value: this.valueOf(list) }],
      columns: this.assetColumns(...(service ? [{ key: 'next', label: 'Next Service' }] : [{ key: 'owner', label: 'Owner' }])),
      rows: this.assetRows(list, (a): Record<string, DrillValue> => (service ? { next: a.nextService } : { owner: a.owner || 'Not assigned' })),
      actions: [{ label: this.insight === key ? 'Clear table filter' : 'Show in table', run: () => this.openInsight(key) }],
    };
  }

  openSite(s: SiteMapRow): void {
    const on = this.site === s.name;
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '-');
    this.drill = {
      title: s.name, subtitle: `Site · last ${KPI_DAYS} days${this.type ? ` · ${this.type}` : ''}`,
      stats: [
        { label: 'Assets', value: s.totalAssets }, { label: 'Online', value: `${s.onlinePercent}%`, color: HEALTH_COLORS.Healthy },
        { label: 'Location Updates', value: s.updates }, { label: 'Tags Moved', value: s.tags.length },
      ],
      tableTitle: 'Location updates per tag',
      columns: [
        { key: 'tag', label: 'Tag ID' }, { key: 'count', label: 'Updates', num: true }, { key: 'at', label: 'Last Moved' },
        { key: 'from', label: 'From Gateway' }, { key: 'to', label: 'To Gateway' }, { key: 'pos', label: 'Last Position' },
      ],
      rows: [...s.tags].sort((a, b) => b.count - a.count).map((t) => ({
        cells: {
          tag: t.tagId, count: t.count, at: fmt(t.lastChangedAt), from: t.lastFromGatewayId ?? '-', to: t.lastToGatewayId ?? '-',
          pos: point(t.lastToLatitude, t.lastToLongitude)?.map((v) => v.toFixed(5)).join(', ') ?? '-',
        },
      })),
      empty: `No location updates in the last ${KPI_DAYS} days.`,
      actions: [{ label: on ? 'Clear site filter' : `Filter dashboard to ${s.name}`, run: () => this.pickSite(s.name) }],
    };
  }

  openAge(i: number): void {
    const b = AGE_BANDS[i];
    if (!b) return;
    const list = this.assets.filter((a) => {
      const y = ageYears(a.acquired, this.asOfDate);
      return y >= b.min && y < b.max;
    }).sort((x, y) => x.acquired.localeCompare(y.acquired));
    this.drill = {
      title: `${b.band} Assets (${b.label})`, subtitle: `Asset lifecycle aging · ${this.scope}`,
      stats: [{ label: 'Assets', value: list.length, color: b.color }, { label: 'Of portfolio', value: `${pct(list.length, this.assets.length)}%` }, { label: 'Value', value: this.valueOf(list) }],
      columns: this.assetColumns({ key: 'acquired', label: 'Acquired' }, { key: 'age', label: 'Age (yrs)', num: true }),
      rows: this.assetRows(list, (a) => ({ acquired: a.acquired, age: Number(this.ageOf(a)) })),
    };
  }

  openAsset(a: Snapshot): void {
    this.select(a);
    this.drill = this.assetDrill(a);
  }

  private capitalize(v: string): string {
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  // ===== Navigation, export =====

  go(path: string): void {
    this.router.navigate([path]);
  }

  /** Opens the asset's detail page in the Assets app. */
  openDetails(a: QuickViewAsset): void {
    this.router.navigate(['/assets/overview'], { queryParams: { id: a.registrationId, tag: a.tag } });
  }

  exportReport(): void {
    const k = this.kpis;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { Metric: 'As of', Value: isoDate(this.asOfDate) },
      { Metric: 'Filters', Value: `Site: ${this.site || 'All'}; Category: ${this.category || 'All'}; Type: ${this.type || 'All'}; Status: ${this.status || 'All'}` },
      { Metric: `KPI window`, Value: `Last ${KPI_DAYS} days` },
      { Metric: 'Total Assets', Value: k.total ?? '' }, { Metric: 'Active Assets', Value: k.active ?? '' },
      { Metric: 'Assets Under Maintenance', Value: k.maintenance ?? '' }, { Metric: 'Critical Assets', Value: k.critical ?? '' },
      { Metric: 'Avg Asset Health Score %', Value: k.health ?? '' },
    ]), 'Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.byCategory.map((c) => ({ Category: c.name, Assets: c.count, '%': c.pct }))), 'By Category');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.byStatus.map((s) => ({ Status: s.status, Assets: s.count, '%': s.pct }))), 'By Status');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.siteRows.map((s) => ({ Site: s.name, Assets: s.totalAssets, 'Online %': s.onlinePercent, [`Location Updates (${KPI_DAYS}d)`]: s.updates }))), 'By Site');
    const tableSheet = this.apiTable
      ? this.apiRows.map((a) => ({
          'Asset Tag': a.assetTag, 'Asset Name': a.assetName, Category: a.category ?? '', 'Sub-category': a.subCategory ?? '', 'Asset Type': a.assetType ?? '',
          Site: a.siteName ?? '', Criticality: a.criticality ?? '', Status: a.assetStatus ?? '',
        }))
      : this.tableRows.map((a) => ({
          'Asset ID': a.id, 'Asset Name': a.name, Category: a.category, Site: a.site, Health: a.hp ?? '', Criticality: a.criticality, 'Value (USD)': a.value, Status: a.st,
        }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(tableSheet), this.tableTitle.slice(0, 31));
    XLSX.writeFile(book, `Asset_Overview_${isoDate(this.asOfDate)}.xlsx`);
  }

  // ===== Formatting =====

  money(v: number): string {
    return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${v}`;
  }

  fmtDate(iso: string): string {
    return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
  }

  fmtDateTime(v: string): string {
    return `${this.fmtDate(v.slice(0, 10))} ${v.slice(11, 16)}`;
  }

  sevClass(a: Snapshot): string {
    return 'sev--' + healthBand(a.hp).toLowerCase();
  }

  stClass(s: PortfolioStatus | string): string {
    return 'st--' + s.toLowerCase().replace(/ /g, '-');
  }

  toggleMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
    this.asOfOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
  }
}
