import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../src/environments/environment';
import type { AssetRegistrationDetail, AssetRegistrationList } from '../../shared/asset-quick-view/quick-view';

/** One tag in GET api/asset-dashboard/location-updates: how often it moved between gateways in the window. */
export interface LocationUpdateTag {
  tagId: string;
  count: number;
  lastChangedAt: string | null;
  lastFromGatewayId: string | null;
  lastToGatewayId: string | null;
  /** Gateway positions of the last move; null when the gateway has none. */
  lastFromLatitude?: number | null;
  lastFromLongitude?: number | null;
  lastToLatitude?: number | null;
  lastToLongitude?: number | null;
}

/** Response of GET api/asset-dashboard/location-updates?days= */
export interface LocationUpdates {
  days: number;
  from: string;
  to: string;
  totalCount: number;
  tagCount: number;
  tags: LocationUpdateTag[];
}

/** One KPI tile from GET api/asset-dashboard/kpis */
export interface KpiMetric {
  value: number;
  percent: number | null;
  changePercent: number | null;
  note: string;
}

/** A connected asset listed under the "Connected Assets" KPI. */
export interface ConnectedAssetDetail {
  assetRegistrationId: string;
  assetTag: string;
  assetName: string;
  assetType: string;
  siteName: string;
  assetStatus: string;
  networkStatus: string;
  gatewayId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  readingCount: number;
}

/** Response of GET api/asset-dashboard/kpis */
export interface AssetDashboardKpis {
  days: number;
  from: string;
  to: string;
  totalAssets: number;
  connectedAssets: KpiMetric;
  onlineNow: KpiMetric;
  alerts: KpiMetric;
  coverage: KpiMetric;
  dataFreshness: KpiMetric;
  connectedAssetDetails: ConnectedAssetDetail[];
}

/** A KPI of the Report Analytics API (KpiWidgetData): value, previous period and the change between them. */
export interface ReportKpi {
  value: number | null;
  format: string;
  previousValue: number | null;
  change: number | null;
  /** "percent" (relative change) or "points" (difference of two percentages). */
  changeUnit: string;
  trend: string;
  comparisonLabel: string;
}

/** Response of GET {reports}api/asset-performance/summary (Report Analytics service, 5480). */
export interface AssetPerformanceSummary {
  generatedAt: string;
  data: {
    totalAssets: ReportKpi;
    averageHealthScore: ReportKpi;
    utilizationRate: ReportKpi;
    availability: ReportKpi;
    mtbf: ReportKpi;
    mttr: ReportKpi;
  };
}

/** One donut band from GET api/asset-dashboard/device-connectivity */
export interface ConnectivityBand {
  name: string;
  count: number;
  percent: number;
}

/** Response of GET api/asset-dashboard/device-connectivity */
export interface DeviceConnectivity {
  total: number;
  centrePercent: number;
  bands: ConnectivityBand[];
}

/** A site row in "Top Active Sites" from GET api/asset-dashboard/locations */
export interface TopSite {
  siteId: string;
  siteName: string;
  siteCode: string | null;
  totalAssets: number;
  onlinePercent: number;
  online: number;
  idle: number;
  offline: number;
  unknown: number;
}

/** Response of GET api/asset-dashboard/locations */
export interface AssetDashboardLocations {
  pins: unknown[];
  legend: Record<string, number>;
  assetsWithoutCoordinates: number;
  topSites: TopSite[];
  totalSites: number;
}

/** An asset listed under a status in GET api/asset-dashboard/sites/{siteId} */
export interface SiteAsset {
  assetRegistrationId: string;
  assetTag: string;
  assetName: string;
  assetType: string;
  assetStatus: string;
  buildingName: string | null;
  floorName: string | null;
  zoneName: string | null;
  locationPath: string | null;
  latitude: number | null;
  longitude: number | null;
  networkStatus: string;
  gatewayId: string | null;
  lastSeenAt: string | null;
}

/** Response of GET api/asset-dashboard/sites/{siteId} */
export interface SiteDetail {
  siteId: string;
  siteName: string;
  siteCode: string | null;
  siteType: string | null;
  city: string | null;
  country: string | null;
  totalAssets: number;
  onlinePercent: number;
  statuses: { status: string; count: number; assets: SiteAsset[] }[];
}

/** One row of GET api/master-data/asset-types (fields the dashboard uses). */
export interface AssetTypeOption {
  id: string;
  assetTypeName: string;
  code: string | null;
  category: { id: string; name: string } | null;
  status: string;
  isDeleted: boolean;
}

/** One row of GET api/master-data/sites (fields the dashboard uses). */
export interface SiteOption {
  id: string;
  siteName: string;
  code: string | null;
  siteType: string | null;
  city: string | null;
  country: string | null;
  /** Map position; null when the site has none. */
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  isDeleted: boolean;
}

/** One category row of GET api/asset-dashboard/categories */
export interface CategoryCount {
  category: string;
  count: number;
  percent: number;
  subCategories: { subCategory: string; count: number }[];
}

/** Response of GET api/asset-dashboard/categories */
export interface AssetDashboardCategories {
  totalAssets: number;
  categories: CategoryCount[];
}

/** An asset row of the Quick Insights lists (critical-assets, assets-without-custodian, assets-without-documents). */
export interface InsightAsset {
  assetRegistrationId: string;
  assetTag: string;
  assetName: string;
  category: string | null;
  subCategory: string | null;
  assetType: string | null;
  criticality: string | null;
  assetStatus: string | null;
  siteId: string | null;
  siteName: string | null;
  locationPath: string | null;
  custodianName: string | null;
  custodianDepartment: string | null;
  documentCount: number;
}

/** Response of the Quick Insights list endpoints. */
export interface InsightAssetList {
  count: number;
  totalAssets: number;
  assets: InsightAsset[];
}

/** Response of GET api/asset-dashboard/statuses: asset count per status (assets listed unless includeAssets=false). */
export interface AssetStatusCounts {
  totalAssets: number;
  totalStatuses: number;
  statuses: { status: string; count: number; percent: number; assets: InsightAsset[] }[];
}

/** Quick Insights endpoints under api/asset-dashboard. */
export type InsightEndpoint = 'critical-assets' | 'assets-without-custodian' | 'assets-without-documents';

@Injectable({
  providedIn: 'root',
})
export class Dashboard {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.assetDashboardApiUrl}api/asset-dashboard`;

  /** GET api/asset-dashboard/kpis?days=7|30|90 */
  getKpis(days: number): Observable<AssetDashboardKpis> {
    const params = new HttpParams().set('days', days);
    return this.http.get<AssetDashboardKpis>(`${this.baseUrl}/kpis`, { params });
  }

  /** GET {reports}api/asset-performance/summary?datePreset= : total assets and average health score vs. the previous period. */
  getAssetPerformanceSummary(datePreset = 'Last 30 days'): Observable<AssetPerformanceSummary> {
    const params = new HttpParams().set('datePreset', datePreset);
    return this.http.get<AssetPerformanceSummary>(`${environment.reportsApiUrl}api/asset-performance/summary`, { params });
  }

  /** GET api/asset-dashboard/statuses?status=&includeAssets= : assets per status (one status when given). */
  getStatusCounts(status?: string, includeAssets = true): Observable<AssetStatusCounts> {
    let params = new HttpParams().set('includeAssets', includeAssets);
    if (status) params = params.set('status', status);
    return this.http.get<AssetStatusCounts>(`${this.baseUrl}/statuses`, { params });
  }

  /** GET api/master-data/asset-types */
  getAssetTypes(): Observable<AssetTypeOption[]> {
    return this.http.get<AssetTypeOption[]>(`${environment.masterDataApiUrl}api/master-data/asset-types`);
  }

  /** GET api/master-data/sites?clientId= (defaults to the environment's client) */
  getSites(clientId: string = environment.clientId): Observable<SiteOption[]> {
    const params = new HttpParams().set('clientId', clientId);
    return this.http.get<SiteOption[]>(`${environment.masterDataApiUrl}api/master-data/sites`, { params });
  }

  /** GET api/asset-dashboard/locations?top=n (top omitted: every site) */
  getLocations(top?: number): Observable<AssetDashboardLocations> {
    let params = new HttpParams();
    if (top) params = params.set('top', top);
    return this.http.get<AssetDashboardLocations>(`${this.baseUrl}/locations`, { params });
  }

  /**
   * GET api/asset-dashboard/location-updates?days=&siteId=&assetType=&status=
   * Returns totals per tag for the last `days` days (no per-day split); the IoT Events Timeline derives daily
   * counts from several windows, see dailyLocationUpdates() in iot-overview-data.ts.
   */
  getLocationUpdates(days: number, filters: { siteId?: string; assetType?: string; status?: string } = {}): Observable<LocationUpdates> {
    let params = new HttpParams().set('days', days);
    if (filters.siteId) params = params.set('siteId', filters.siteId);
    if (filters.assetType) params = params.set('assetType', filters.assetType);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<LocationUpdates>(`${this.baseUrl}/location-updates`, { params });
  }

  /** GET api/asset-dashboard/sites/{siteId} */
  getSite(siteId: string): Observable<SiteDetail> {
    return this.http.get<SiteDetail>(`${this.baseUrl}/sites/${encodeURIComponent(siteId)}`);
  }

  /** GET api/asset-dashboard/critical-assets | assets-without-custodian | assets-without-documents */
  getInsightAssets(endpoint: InsightEndpoint): Observable<InsightAssetList> {
    return this.http.get<InsightAssetList>(`${this.baseUrl}/${endpoint}`);
  }

  /** GET api/asset-dashboard/critical-assets (Asset service, 5401); feeds the "Critical" health band and Quick Insights. */
  getCriticalAssets(): Observable<InsightAssetList> {
    return this.getInsightAssets('critical-assets');
  }

  /** GET api/asset-dashboard/categories */
  getCategories(): Observable<AssetDashboardCategories> {
    return this.http.get<AssetDashboardCategories>(`${this.baseUrl}/categories`);
  }

  /** GET api/asset-dashboard/device-connectivity?days=7|30|90 */
  getDeviceConnectivity(days: number): Observable<DeviceConnectivity> {
    const params = new HttpParams().set('days', days);
    return this.http.get<DeviceConnectivity>(`${this.baseUrl}/device-connectivity`, { params });
  }

  /** GET api/asset-registrations: registered assets, newest first (pageSize 1-200). */
  getAssetRegistrations(pageSize = 200, search?: string): Observable<AssetRegistrationList> {
    let params = new HttpParams().set('page', 1).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<AssetRegistrationList>(`${environment.assetRegistrationApiUrl}api/asset-registrations`, { params });
  }

  /** GET api/asset-registrations/{assetRegistrationId}: the full registration. */
  getAssetRegistration(assetRegistrationId: string): Observable<AssetRegistrationDetail> {
    return this.http.get<AssetRegistrationDetail>(`${environment.assetRegistrationApiUrl}api/asset-registrations/${encodeURIComponent(assetRegistrationId)}`);
  }
}
