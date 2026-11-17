import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import {
  DashboardPeriodDto, FilterOptionsDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, seriesValues,
  toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_CATEGORIES, ALL_DEVICE_TYPES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, AlertSeverity, CONNECTIVITY, Connectivity, IOT_DEFAULT_PERIOD,
  IOT_FALLBACK_PERIODS, IotAlert, IotAsset, IotKpiValue, IotView, SENSOR_HEALTH_TARGET, SensorHealth, emptyIot
} from './iot-utilization.data';

// ----- API shapes (/api/iot-utilization-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  category: string | null;
  deviceType: string | null;
  connectivity: string | null;
  utilizationTarget: number;
}

interface AssetRowDto {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  deviceType: string;
  assetRecordId: string | null;
  assetId: string | null;
  assetName: string | null;
  category: string | null;
  location: string | null;
  organization: string | null;
  connectivity: string;
  sensorHealth: string | null;
  utilization: number | null;
  target: number;
  variance: number | null;
  telemetryAvailability: number | null;
  signalDbm: number | null;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  minutesSinceLastSeen: number | null;
}

interface AlertRowDto {
  id: string;
  assetRowId: string;
  deviceId: string | null;
  assetId: string | null;
  assetName: string | null;
  location: string | null;
  type: string;
  sensorType: string | null;
  severity: string;
  reading: string;
  minutesAgo: number | null;
}

interface InsightDto {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  assetCount: number;
  assetRowIds: string[];
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: { connectedAssets: KpiWidgetDto; averageUtilization: KpiWidgetDto; telemetryAvailability: KpiWidgetDto; activeAlerts: KpiWidgetDto };
  utilizationTrend: { trend: PerformanceSeriesDto };
  telemetry: { trend: PerformanceSeriesDto };
  connectivity: { total: number; items: { label: string; count: number }[] };
  categoryUtilization: { category: string; utilization: number; target: number }[];
  sensorHealth: { healthy: number; warning: number; failed: number; score: number | null; target: number };
  events: { trend: PerformanceSeriesDto };
  locations: {
    location: string; latitude: number | null; longitude: number | null; connected: number; online: number; intermittent: number; offline: number;
    utilization: number | null; telemetryAvailability: number | null; activeAlerts: number;
  }[];
  devices: { deviceType: string; connected: number; telemetryAvailability: number | null; avgSignalDbm: number | null; failedSensors: number }[];
  insights: InsightDto[];
  alerts: AlertRowDto[];
  assets: AssetRowDto[];
  assetTotal: number;
}

interface ComparisonDto {
  compareUtilizationTrend: PerformanceSeriesDto;
}

interface HistoryDto {
  history: PerformanceSeriesDto;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  connectivityStatuses: string[];
  defaultUtilizationTarget: number;
  autoRefreshSeconds: number;
  actionPlanPriorities: string[];
}

interface FiltersDto extends FilterOptionsDto {
  deviceTypes: { value: string; label: string }[];
  owners: string[];
}

interface ViewDto {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: {
    organization: string | null;
    location: string | null;
    category: string | null;
    deviceType: string | null;
    connectivity: string | null;
    datePreset: string;
  };
}

interface ActionPlanDto {
  planId: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface IotFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  deviceType: string;
  connectivity: string;
}

export interface IotOptions {
  periods: string[];
  defaultPeriod: string;
  statuses: string[];
  autoRefreshSeconds: number;
  priorities: string[];
}

export interface IotFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  deviceTypes: string[];
  owners: string[];
}

export interface IotSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: IotFilters;
}

/** Body of POST /action-plans. */
export interface IotActionPlanRequest {
  title: string;
  owner: string;
  dueDate: string;
  priority: string;
  notes: string;
  insightKey: string | null;
  context: string;
  deviceIds: string[];
}

const TIME_ZONE = 'UTC';

const kpi = (dto: KpiWidgetDto | null | undefined): IotKpiValue => ({
  value: dto?.value ?? null,
  previous: dto?.previousValue ?? null,
  change: num(dto?.change),
  unit: dto?.changeUnit || 'percent'
});

const asConnectivity = (value: string): Connectivity => ((CONNECTIVITY as string[]).includes(value) ? (value as Connectivity) : 'Offline');
const asHealth = (value: string | null): SensorHealth | null => (value === 'Healthy' || value === 'Warning' || value === 'Failed' ? value : null);

function toAsset(dto: AssetRowDto): IotAsset {
  return {
    key: dto.id,
    id: dto.assetId || dto.deviceId || dto.id,
    name: dto.assetName || dto.deviceName || dto.deviceId || '—',
    category: dto.category ?? '—',
    site: dto.location ?? '—',
    org: dto.organization ?? '—',
    deviceType: dto.deviceType,
    deviceId: dto.deviceId ?? '—',
    status: asConnectivity(dto.connectivity),
    health: asHealth(dto.sensorHealth),
    utilization: dto.utilization,
    target: dto.target,
    variance: dto.variance,
    availability: dto.telemetryAvailability,
    signal: dto.signalDbm,
    lastSeen: dto.lastSeenAt,
    lastSeenMin: dto.minutesSinceLastSeen
  };
}

function toAlert(dto: AlertRowDto): IotAlert {
  return {
    id: dto.id,
    assetKey: dto.assetRowId,
    assetId: dto.assetId || dto.deviceId || '—',
    assetName: dto.assetName || dto.deviceId || '—',
    site: dto.location ?? '—',
    sensorType: dto.sensorType,
    type: dto.type,
    severity: (dto.severity === 'Critical' ? 'Critical' : 'Warning') as AlertSeverity,
    reading: dto.reading,
    raisedMin: dto.minutesAgo
  };
}

function toView(dto: OverviewDto): IotView {
  const trend = dto.utilizationTrend?.trend;
  const events = dto.events?.trend;
  const counts = emptyIot().connectivity;
  for (const item of dto.connectivity?.items ?? []) {
    if (item.label in counts) counts[item.label as Connectivity] = item.count;
  }
  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    utilizationTarget: dto.filters?.utilizationTarget ?? 60,
    connected: kpi(dto.summary?.connectedAssets),
    utilization: kpi(dto.summary?.averageUtilization),
    availability: kpi(dto.summary?.telemetryAvailability),
    alertCount: kpi(dto.summary?.activeAlerts),
    labels: (trend?.categories ?? []).map(monthLabel),
    production: seriesValues(trend, 'Production'),
    idle: seriesValues(trend, 'Idle'),
    maintenance: seriesValues(trend, 'Maintenance'),
    offline: seriesValues(trend, 'Offline'),
    telemetry: (dto.telemetry?.trend?.series ?? []).map((s) => ({ name: s.name, values: s.values.map(num) })),
    critical: seriesValues(events, 'Critical'),
    warning: seriesValues(events, 'Warning'),
    informational: seriesValues(events, 'Informational'),
    connectivity: counts,
    categories: (dto.categoryUtilization ?? []).map((c) => ({ category: c.category, utilization: c.utilization, target: c.target })),
    health: {
      healthy: num(dto.sensorHealth?.healthy),
      warning: num(dto.sensorHealth?.warning),
      failed: num(dto.sensorHealth?.failed),
      score: dto.sensorHealth?.score ?? null,
      target: dto.sensorHealth?.target ?? SENSOR_HEALTH_TARGET
    },
    sites: (dto.locations ?? []).map((l) => ({
      site: l.location, lat: l.latitude, lng: l.longitude, connected: l.connected, online: l.online, intermittent: l.intermittent, offline: l.offline,
      utilization: l.utilization, availability: l.telemetryAvailability, alerts: l.activeAlerts
    })),
    devices: (dto.devices ?? []).map((d) => ({
      type: d.deviceType, connected: d.connected, availability: d.telemetryAvailability, signal: d.avgSignalDbm, failed: d.failedSensors
    })),
    insights: (dto.insights ?? []).map((i) => ({ key: i.key, severity: i.severity, title: i.title, message: i.message, count: i.count, assetKeys: i.assetRowIds ?? [] })),
    alerts: (dto.alerts ?? []).map(toAlert),
    assets: (dto.assets ?? []).map(toAsset),
    assetTotal: num(dto.assetTotal)
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

/** IoT / Utilization Analytics figures, filters, saved views and action plans from the Report Analytics API. */
@Injectable()
export class IotUtilizationAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/iot-utilization-analytics`;

  readonly view = signal<IotView>(emptyIot());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly periods = signal<string[]>(IOT_FALLBACK_PERIODS);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'IoT / Utilization Analytics')));

  private scopeParams(): Record<string, string | undefined> {
    return { tenantId: environment.tenantId, clientId: environment.clientId };
  }

  private query(f: IotFilters): Record<string, string | null | undefined> {
    return {
      datePreset: f.period || IOT_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      deviceType: pick(f.deviceType, ALL_DEVICE_TYPES),
      connectivity: pick(f.connectivity, ALL_STATUSES),
      timeZone: TIME_ZONE,
      ...this.scopeParams()
    };
  }

  /** GET /options: period presets (Custom left out), connectivity statuses and the auto refresh interval. */
  loadOptions(): Observable<IotOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : IOT_FALLBACK_PERIODS;
        this.periods.set(list);
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : IOT_DEFAULT_PERIOD,
          statuses: [ALL_STATUSES, ...(dto.connectivityStatuses?.length ? dto.connectivityStatuses : CONNECTIVITY)],
          autoRefreshSeconds: dto.autoRefreshSeconds || 30,
          priorities: dto.actionPlanPriorities?.length ? dto.actionPlanPriorities : ['Critical', 'High', 'Medium', 'Low']
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location, Asset Category and Device Type values, and the action plan owners. */
  loadFilters(): Observable<IotFilterLists> {
    return this.http.get<FiltersDto>(`${this.apiUrl}/filters`, { params: toParams(this.scopeParams()) }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories),
        deviceTypes: optionLabels(ALL_DEVICE_TYPES, dto.deviceTypes),
        owners: dto.owners ?? []
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: IotFilters): Observable<IotView> {
    this.loading.set(true);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params: toParams(this.query(f)) }).pipe(
      map(toView),
      tap((v) => {
        this.view.set(v);
        this.loaded.set(true);
        this.error.set(null);
      }),
      catchError((err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err, 'IoT / Utilization Analytics'));
        return this.fail(err);
      }),
      finalize(() => this.loading.set(false))
    );
  }

  /** GET /compare-periods: the previous period's Production line (same length, just before the selected one). */
  loadPreviousProduction(f: IotFilters): Observable<number[]> {
    return this.http.get<ComparisonDto>(`${this.apiUrl}/compare-periods`, { params: toParams(this.query(f)) }).pipe(
      map((dto) => seriesValues(dto.compareUtilizationTrend, 'Production')),
      catchError(this.fail)
    );
  }

  /** GET /assets/{key}/utilization-history: weekly utilization over the last 12 weeks. */
  loadHistory(f: IotFilters, assetKey: string): Observable<number[]> {
    return this.http.get<HistoryDto>(`${this.apiUrl}/assets/${encodeURIComponent(assetKey)}/utilization-history`, { params: toParams(this.query(f)) }).pipe(
      map((dto) => seriesValues(dto.history, 'Production')),
      catchError(this.fail)
    );
  }

  /** GET /export?format=csv: the connected assets for the filter bar. */
  exportAssets(f: IotFilters): Observable<void> {
    const params = toParams({ ...this.query(f), format: 'csv' });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'iot-utilization-assets.csv')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in view, then the user's own. */
  loadViews(): Observable<IotSavedView[]> {
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params: toParams(this.scopeParams()) }).pipe(
      map((rows) => rows.map((v) => this.toSavedView(v))),
      catchError(this.fail)
    );
  }

  /** POST /views. The owner is the signed-in user (from the access token). */
  createView(name: string, f: IotFilters): Observable<IotSavedView> {
    const body = {
      viewName: name.trim(),
      isDefault: false,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        category: pick(f.category, ALL_CATEGORIES),
        deviceType: pick(f.deviceType, ALL_DEVICE_TYPES),
        connectivity: pick(f.connectivity, ALL_STATUSES),
        datePreset: f.period || IOT_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      },
      ...this.scopeParams()
    };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(map((dto) => this.toSavedView(dto)), catchError(this.fail));
  }

  private toSavedView(dto: ViewDto): IotSavedView {
    const periods = this.periods();
    return {
      viewId: dto.viewId,
      name: dto.viewName,
      builtIn: dto.isBuiltIn,
      isDefault: dto.isDefault,
      filters: {
        // Custom ranges can't be shown in the period dropdown; such views open on the default period
        period: dto.filters?.datePreset && periods.includes(dto.filters.datePreset) ? dto.filters.datePreset : IOT_DEFAULT_PERIOD,
        organization: dto.filters?.organization ?? ALL_ORGANIZATIONS,
        location: dto.filters?.location ?? ALL_LOCATIONS,
        category: dto.filters?.category ?? ALL_CATEGORIES,
        deviceType: dto.filters?.deviceType ?? ALL_DEVICE_TYPES,
        connectivity: dto.filters?.connectivity ?? ALL_STATUSES
      }
    };
  }

  // ----- Action plans -----

  /** POST /action-plans. */
  createActionPlan(plan: IotActionPlanRequest): Observable<ActionPlanDto> {
    return this.http.post<ActionPlanDto>(`${this.apiUrl}/action-plans`, { ...plan, ...this.scopeParams() }).pipe(catchError(this.fail));
  }
}
