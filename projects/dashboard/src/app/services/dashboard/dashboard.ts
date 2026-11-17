import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { AssetRegistrationDetail, AssetRegistrationList } from '../../shared/asset-quick-view/quick-view';
import {
  demoAssetTypes,
  demoCategories,
  demoDeviceConnectivity,
  demoInsightAssets,
  demoKpis,
  demoLocationUpdates,
  demoLocations,
  demoPerformanceSummary,
  demoRegistration,
  demoRegistrations,
  demoSiteDetail,
  demoSites,
  demoStatusCounts,
} from './dashboard.data';

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

/**
 * STATIC DEMO: every method answers from the in-memory demo register (dashboard.data.ts) instead of the
 * Asset / Asset Dashboard / Master Data / Report Analytics services. Signatures match the former API calls.
 */
@Injectable({
  providedIn: 'root',
})
export class Dashboard {
  /** KPI cards for the last `days` days (7 | 30 | 90). */
  getKpis(days: number): Observable<AssetDashboardKpis> {
    return of(demoKpis(days));
  }

  /** Total assets and average health score vs. the previous period. */
  getAssetPerformanceSummary(datePreset = 'Last 30 days'): Observable<AssetPerformanceSummary> {
    return of(demoPerformanceSummary(datePreset));
  }

  /** Assets per status (one status when given); assets listed unless includeAssets is false. */
  getStatusCounts(status?: string, includeAssets = true): Observable<AssetStatusCounts> {
    return of(demoStatusCounts(status, includeAssets));
  }

  /** Asset types of the register. */
  getAssetTypes(): Observable<AssetTypeOption[]> {
    return of(demoAssetTypes());
  }

  /** The client's sites (one demo client, so `clientId` does not narrow the list). */
  getSites(clientId?: string): Observable<SiteOption[]> {
    void clientId;
    return of(demoSites());
  }

  /** Sites ranked by asset count (top omitted: every site). */
  getLocations(top?: number): Observable<AssetDashboardLocations> {
    return of(demoLocations(top));
  }

  /**
   * Location updates per tag for the last `days` days (no per-day split); the IoT Events Timeline derives daily
   * counts from several windows, see dailyLocationUpdates() in iot-overview-data.ts.
   */
  getLocationUpdates(days: number, filters: { siteId?: string; assetType?: string; status?: string } = {}): Observable<LocationUpdates> {
    return of(demoLocationUpdates(days, filters));
  }

  /** One site with its assets grouped by network status. */
  getSite(siteId: string): Observable<SiteDetail> {
    const site = demoSiteDetail(siteId);
    return site ? of(site) : throwError(() => new Error(`Site ${siteId} not found.`));
  }

  /** Quick Insights lists: critical-assets | assets-without-custodian | assets-without-documents. */
  getInsightAssets(endpoint: InsightEndpoint): Observable<InsightAssetList> {
    return of(demoInsightAssets(endpoint));
  }

  /** Assets with criticality Critical; feeds the "Critical" health band and Quick Insights. */
  getCriticalAssets(): Observable<InsightAssetList> {
    return this.getInsightAssets('critical-assets');
  }

  /** Asset counts per category and sub-category. */
  getCategories(): Observable<AssetDashboardCategories> {
    return of(demoCategories());
  }

  /** Device connectivity donut for the last `days` days. */
  getDeviceConnectivity(days: number): Observable<DeviceConnectivity> {
    return of(demoDeviceConnectivity(days));
  }

  /** Registered assets, newest first (pageSize 1-200). */
  getAssetRegistrations(pageSize = 200, search?: string): Observable<AssetRegistrationList> {
    return of(demoRegistrations(pageSize, search));
  }

  /** The full registration of one asset. */
  getAssetRegistration(assetRegistrationId: string): Observable<AssetRegistrationDetail> {
    const dto = demoRegistration(assetRegistrationId);
    return dto ? of(dto) : throwError(() => new Error(`Asset ${assetRegistrationId} not found.`));
  }
}
