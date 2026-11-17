import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { ChartSeries, RA_COLORS } from '../shared/charts';
import { ALL_CATEGORIES, ALL_TYPES } from '../asset-performance/kit/asset-universe';
import {
  DashboardPeriodDto, FilterOptionsDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, seriesValues, toParams
} from '../asset-performance/kit/api-utils';
import {
  ACCURACY_TARGET, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_PREDICTIONS_VIEW, ALL_RISK_LEVELS, FAILURE_WINDOW_DAYS, HIGH_RISK_SCORE, ModelRow,
  PA_DEFAULT_PERIOD, PA_FALLBACK_PERIODS, PaAsset, PaInsight, PaKpiValue, PredictiveView, REVIEW_CONFIDENCE, RISK_COLORS, RISK_LEVELS, emptyPredictive
} from './predictive-analytics.data';

// ----- API shapes (/api/predictive-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  riskLevel: string | null;
  accuracyTarget: number;
  reviewConfidence: number;
  failureWindowDays: number;
  toleranceDays: number;
  highRiskScore: number;
}

interface PredictionDto {
  key: string;
  assetId: string;
  assetName: string;
  location: string | null;
  category: string | null;
  assetType: string | null;
  riskLevel: string;
  riskScore: number | null;
  healthScore: number | null;
  confidence: number | null;
  failureWindowDays: number | null;
  remainingUsefulLifeHours: number | null;
  predictedFailureDate: string | null;
  predictedIssue: string | null;
  modelName: string | null;
  sensorType: string | null;
  recommendedAction: string;
  vibrationAnomaly: boolean;
  recentAnomalies: number;
  owner: string | null;
  alertStatus: string | null;
  resolved: boolean;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: { assetsMonitored: KpiWidgetDto; highRiskAssets: KpiWidgetDto; predictedFailures: KpiWidgetDto; predictionAccuracy: KpiWidgetDto };
  riskTrend: { trend: PerformanceSeriesDto; highRiskThreshold: number };
  remainingLife: { forecast: PerformanceSeriesDto; currentHighRiskHours: number | null };
  riskDistribution: { total: number; items: { label: string; count: number; percentage: number }[] };
  anomalies: { total: number; trend: PerformanceSeriesDto };
  accuracy: {
    accuracy: number | null; precision: number | null; recall: number | null; falsePositiveRate: number | null; target: number; evaluated: number;
  };
  maintenanceCost: { trend: PerformanceSeriesDto; avoidedCost: number; preventedFailures: number; averageCorrectiveCost: number | null };
  modelPerformance: {
    assetType: string; monitored: number; accuracy: number | null; precision: number | null; recall: number | null; evaluated: number; status: string; models: string[];
  }[];
  insights: { key: string; severity: string; title: string; message: string; count: number; amount: number | null; assetIds: string[] }[];
  predictions: PredictionDto[];
  predictionTotal: number;
}

interface SectionDto<T> {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  data: T;
}

interface PredictionListDto {
  items: PredictionDto[];
  totalCount: number;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  riskLevels: string[];
  defaultAccuracyTarget: number;
}

interface ViewFiltersDto {
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  riskLevel: string | null;
  datePreset: string;
}

interface ViewDto {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: ViewFiltersDto;
}

/** Body of POST /views and PUT /views/{viewId}. The owner is the signed-in user (from the access token). */
interface SaveViewRequest {
  viewName: string;
  isDefault: boolean;
  filters: {
    organization: string | null;
    location: string | null;
    category: string | null;
    assetType: string | null;
    riskLevel: string | null;
    datePreset: string;
    timeZone: string;
  };
  tenantId?: string;
  clientId?: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface PaFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  assetType: string;
  riskLevel: string;
}

export interface PaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface PaOptions {
  periods: string[];
  defaultPeriod: string;
  riskLevels: string[];
}

export interface PaFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  assetTypes: string[];
}

const TIME_ZONE = 'UTC';
/** The overview returns up to this many monitored assets, so the tables and lists can be sorted in the browser. */
const PREDICTION_ROWS = 500;

const BAND_COLORS: Record<string, string> = { 'High Risk': RA_COLORS.red, 'Medium Risk': RA_COLORS.orange, 'Low Risk': RA_COLORS.green, 'High Risk Threshold': RA_COLORS.grey };
const RUL_COLORS: Record<string, string> = {
  'High Risk Assets': RA_COLORS.purple, 'Medium Risk Assets': RA_COLORS.blue, 'All Monitored': RA_COLORS.green,
  'Confidence band (upper)': RA_COLORS.lavender, 'Confidence band (lower)': RA_COLORS.lavender
};
const COST_COLORS: Record<string, string> = { Preventive: RA_COLORS.violet, Corrective: RA_COLORS.blue, Other: RA_COLORS.grey, 'Avoided Cost': RA_COLORS.green };
const ANOMALY_COLORS = [RA_COLORS.red, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.teal, RA_COLORS.pink, RA_COLORS.grey];

const kpi = (dto: KpiWidgetDto | null | undefined): PaKpiValue => ({ value: dto?.value ?? null, change: num(dto?.change) });

function toAsset(dto: PredictionDto): PaAsset {
  return {
    key: dto.key,
    id: dto.assetId,
    name: dto.assetName || dto.assetId,
    location: dto.location ?? '—',
    category: dto.category ?? '—',
    type: dto.assetType ?? '—',
    risk: dto.riskLevel,
    riskScore: dto.riskScore,
    health: dto.healthScore,
    confidence: dto.confidence,
    failureWindowDays: dto.failureWindowDays,
    rulHours: dto.remainingUsefulLifeHours,
    predictedFailureDate: dto.predictedFailureDate ? dto.predictedFailureDate.slice(0, 10) : null,
    issue: dto.predictedIssue,
    model: dto.modelName,
    sensor: dto.sensorType,
    action: dto.recommendedAction,
    vibrationAnomaly: dto.vibrationAnomaly,
    owner: dto.owner ?? 'Unassigned',
    alertStatus: dto.alertStatus ?? '—'
  };
}

function series(dto: PerformanceSeriesDto | null | undefined, colors: Record<string, string>, extra: (name: string) => Partial<ChartSeries> = () => ({})): ChartSeries[] {
  return (dto?.series ?? []).map((s, i) => ({
    name: s.name,
    values: s.values.map(num),
    color: colors[s.name] ?? ANOMALY_COLORS[i % ANOMALY_COLORS.length],
    ...extra(s.name)
  }));
}

function toView(dto: OverviewDto): PredictiveView {
  const predictions = (dto.predictions ?? []).map(toAsset);
  const byKey = new Map(predictions.map((p) => [p.key, p]));
  const insights: PaInsight[] = (dto.insights ?? []).map((i) => ({
    key: i.key, severity: i.severity, title: i.title, message: i.message, count: i.count, amount: i.amount, assetKeys: i.assetIds ?? []
  }));
  const listOf = (key: string) => (insights.find((i) => i.key === key)?.assetKeys ?? []).map((k) => byKey.get(k)).filter((a): a is PaAsset => !!a);
  const cost = dto.maintenanceCost;
  const avoidedByMonth = seriesValues(cost?.trend, 'Avoided Cost');
  const models: ModelRow[] = (dto.modelPerformance ?? []).map((m) => ({
    type: m.assetType, monitored: m.monitored, accuracy: m.accuracy, precision: m.precision, recall: m.recall, evaluated: m.evaluated, status: m.status,
    models: m.models ?? []
  }));

  return {
    generatedAt: dto.generatedAt,
    previousFromUtc: dto.period?.previousFromUtc ?? null,
    previousToUtc: dto.period?.previousToUtc ?? null,
    accuracyTarget: dto.accuracy?.target ?? dto.filters?.accuracyTarget ?? ACCURACY_TARGET,
    reviewConfidence: dto.filters?.reviewConfidence ?? REVIEW_CONFIDENCE,
    highRiskScore: dto.riskTrend?.highRiskThreshold ?? dto.filters?.highRiskScore ?? HIGH_RISK_SCORE,
    failureWindowDays: dto.filters?.failureWindowDays ?? FAILURE_WINDOW_DAYS,
    monitoredKpi: kpi(dto.summary?.assetsMonitored),
    highRiskKpi: kpi(dto.summary?.highRiskAssets),
    failuresKpi: kpi(dto.summary?.predictedFailures),
    accuracyKpi: kpi(dto.summary?.predictionAccuracy),
    accuracy: dto.accuracy?.accuracy ?? null,
    precision: dto.accuracy?.precision ?? null,
    recall: dto.accuracy?.recall ?? null,
    falsePositiveRate: dto.accuracy?.falsePositiveRate ?? null,
    evaluated: num(dto.accuracy?.evaluated),
    labels: (dto.riskTrend?.trend?.categories ?? []).map(monthLabel),
    riskTrend: series(dto.riskTrend?.trend, BAND_COLORS, (name) => (name === 'High Risk Threshold' ? { dashed: true } : {})),
    rulForecast: series(dto.remainingLife?.forecast, RUL_COLORS, (name) =>
      name.startsWith('Confidence band') ? { dashed: true } : name === 'High Risk Assets' ? { area: true } : {}),
    riskSlices: (dto.riskDistribution?.items ?? []).map((s) => ({ name: s.label, value: s.count, color: RISK_COLORS[s.label] ?? RA_COLORS.grey })),
    anomalies: series(dto.anomalies?.trend, {}),
    costForecast: series(cost?.trend, COST_COLORS),
    avoided: num(cost?.avoidedCost),
    avoidedByMonth,
    preventedFailures: num(cost?.preventedFailures),
    predictions,
    predictionTotal: num(dto.predictionTotal),
    actionList: predictions.filter((p) => p.risk === 'Critical' || p.risk === 'High'),
    failures: listOf('predicted_failures'),
    vibration: listOf('abnormal_vibration'),
    review: listOf('engineer_review'),
    models,
    insights
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

function viewFilters(dto: ViewFiltersDto, periods: string[]): Record<string, string> {
  return {
    // Custom ranges can't be shown in the period dropdown; such views open on the default period
    period: dto.datePreset && periods.includes(dto.datePreset) ? dto.datePreset : PA_DEFAULT_PERIOD,
    organization: dto.organization ?? ALL_ORGANIZATIONS,
    location: dto.location ?? ALL_LOCATIONS,
    category: dto.category ?? ALL_CATEGORIES,
    assetType: dto.assetType ?? ALL_TYPES,
    riskLevel: dto.riskLevel ?? ALL_RISK_LEVELS
  };
}

/** Predictive Analytics figures, filters and saved views from the Report Analytics API (/api/predictive-analytics). */
@Injectable()
export class PredictiveAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/predictive-analytics`;

  readonly view = signal<PredictiveView>(emptyPredictive());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(PA_FALLBACK_PERIODS);
  readonly views = signal<PaSavedView[]>([]);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Predictive Analytics')));

  private query(f: PaFilters): Record<string, string | null> {
    return {
      datePreset: f.period || PA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      assetType: pick(f.assetType, ALL_TYPES),
      riskLevel: pick(f.riskLevel, ALL_RISK_LEVELS),
      timeZone: TIME_ZONE,
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
  }

  /** GET /options: period presets (Custom left out) and risk levels. */
  loadOptions(): Observable<PaOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : PA_FALLBACK_PERIODS;
        this.periods.set(list);
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : PA_DEFAULT_PERIOD,
          riskLevels: [ALL_RISK_LEVELS, ...(dto.riskLevels?.length ? dto.riskLevels : RISK_LEVELS)]
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location, Asset Category and Asset Type values (labels; the API matches names). */
  loadFilters(): Observable<PaFilterLists> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories),
        assetTypes: optionLabels(ALL_TYPES, dto.assetTypes)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: PaFilters): Observable<PredictiveView> {
    this.loading.set(true);
    const params = toParams({ ...this.query(f), predictionLimit: PREDICTION_ROWS });
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params }).pipe(
      map(toView),
      tap((v) => {
        this.view.set(v);
        this.loaded.set(true);
      }),
      catchError(this.fail),
      finalize(() => this.loading.set(false))
    );
  }

  /** Compare Periods: the previous period's High Risk line (GET /risk-trend over a custom range). */
  loadPreviousRisk(f: PaFilters, range: { from: string; to: string }): Observable<number[]> {
    const params = toParams({ ...this.query(f), datePreset: 'Custom', from: range.from, to: range.to });
    return this.http.get<SectionDto<{ trend: PerformanceSeriesDto }>>(`${this.apiUrl}/risk-trend`, { params }).pipe(
      map((dto) => seriesValues(dto.data?.trend, 'High Risk')),
      catchError(this.fail)
    );
  }

  /** GET /predictions?list=…: every row of a list (when the overview was capped). */
  loadList(f: PaFilters, list: string): Observable<{ items: PaAsset[]; total: number }> {
    const params = toParams({ ...this.query(f), list, page: 1, pageSize: PREDICTION_ROWS });
    return this.http.get<PredictionListDto>(`${this.apiUrl}/predictions`, { params }).pipe(
      map((dto) => ({ items: (dto.items ?? []).map(toAsset), total: dto.totalCount ?? 0 })),
      catchError(this.fail)
    );
  }

  /** GET /export: the Excel workbook (or CSV) for the filter bar. */
  export(f: PaFilters, format: 'xlsx' | 'csv' = 'xlsx'): Observable<void> {
    const params = toParams({ ...this.query(f), format });
    return this.http.get(`${this.apiUrl}/export`, { params, observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, `predictive-analytics.${format}`)),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Predictions view, then the user's own. */
  loadViews(): Observable<PaSavedView[]> {
    const params = toParams({ tenantId: environment.tenantId, clientId: environment.clientId });
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params }).pipe(
      map((rows) => {
        const list = rows.map((v) => this.toSavedView(v));
        if (!list.some((v) => v.builtIn)) list.unshift(this.allPredictionsView());
        this.views.set(list);
        return list;
      }),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const body: SaveViewRequest = { ...this.toRequest(name, f, isDefault), tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => [...list, saved])),
      catchError(this.fail)
    );
  }

  /** PUT /views/{viewId}. */
  updateView(viewId: string, name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    return this.http.put<ViewDto>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`, this.toRequest(name, f, isDefault)).pipe(
      map((dto) => this.toSavedView(dto)),
      tap((saved) => this.views.update((list) => list.map((v) => (v.viewId === saved.viewId ? saved : v)))),
      catchError(this.fail)
    );
  }

  /** DELETE /views/{viewId}. */
  deleteView(viewId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/views/${encodeURIComponent(viewId)}`).pipe(
      tap(() => this.views.update((list) => list.filter((v) => v.viewId !== viewId))),
      catchError(this.fail)
    );
  }

  allPredictionsView(): PaSavedView {
    return {
      viewId: 'all-predictions', name: ALL_PREDICTIONS_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: PA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: ALL_TYPES,
        riskLevel: ALL_RISK_LEVELS
      }
    };
  }

  private toSavedView(dto: ViewDto): PaSavedView {
    return { viewId: dto.viewId, name: dto.viewName, builtIn: dto.isBuiltIn, isDefault: dto.isDefault, filters: viewFilters(dto.filters, this.periods()) };
  }

  private toRequest(name: string, f: PaFilters, isDefault: boolean): SaveViewRequest {
    return {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        category: pick(f.category, ALL_CATEGORIES),
        assetType: pick(f.assetType, ALL_TYPES),
        riskLevel: pick(f.riskLevel, ALL_RISK_LEVELS),
        datePreset: f.period || PA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      }
    };
  }
}
