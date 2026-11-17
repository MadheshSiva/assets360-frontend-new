import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { DashboardPeriodDto, FilterOptionsDto, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, toParams } from '../asset-performance/kit/api-utils';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, KD_DEFAULT_PERIOD, KD_FALLBACK_PERIODS, KPI_MODULES, KpiDashboardVm, KpiDef, KpiDirection,
  KpiInsightVm, KpiMetric, KpiModule, KpiState, KpiStatus, KpiTrendVm, KpiUnit, KpiViewDef, emptyKpiDashboard, formatKpi, signedText, targetLabel
} from './kpi-dashboard.data';

// ----- API shapes (/api/kpi-dashboard) -----

interface KpiDefinitionDto {
  id: string;
  name: string;
  module: string;
  unit: string;
  direction: string;
  target: number;
  targetSet: boolean;
  owner: string | null;
  info: string;
  metric: string | null;
  manualValue: number | null;
  flow: boolean;
  history: boolean;
  source: string;
  reviewDueDate: string | null;
  isBuiltIn: boolean;
  isModified: boolean;
  updatedAt: string | null;
}

interface KpiStateDto {
  kpi: KpiDefinitionDto;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  /** "points" (percent KPIs) or "percent" */
  changeUnit: string;
  target: number;
  /** "target" or "budget" */
  targetBasis: string;
  status: string;
  attainment: number | null;
  variance: number | null;
  /** "points", "count", "x" or "percent" */
  varianceUnit: string;
  spark: (number | null)[];
}

interface ViewDto {
  key: string;
  label: string;
  dashboard: string;
  isCustom: boolean;
  isModified: boolean;
  items: { kpiId: string; visible: boolean }[];
  defaultKpiIds: string[];
  updatedAt: string | null;
}

interface TrendDto {
  granularity: string;
  categories: string[];
  overall: (number | null)[];
  target: (number | null)[];
  prior: (number | null)[];
}

interface InsightDto {
  key: string;
  tone: string;
  title: string;
  text: string;
  actionLabel: string;
  action: string;
  kpiId: string | null;
  kpiIds: string[];
}

interface OverviewDto {
  generatedAt: string;
  period: DashboardPeriodDto;
  view: ViewDto;
  views: ViewDto[];
  monthLabels: string[];
  tiles: KpiStateDto[];
  kpis: KpiStateDto[];
  trend: TrendDto;
  targets: { module: string; kpis: number; attainment: number; target: number }[];
  exceptions: KpiStateDto[];
  insights: InsightDto[];
  library: { module: string; count: number }[];
}

interface SectionDto<T> {
  generatedAt: string;
  data: T;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  metrics: { id: string; name: string; module: string; unit: string; direction: string; flow: boolean; history: boolean; source: string; info: string }[];
  owners: string[];
  defaultViewKey: string;
}

/** Body of POST /kpis and PUT /kpis/{kpiId}. */
export interface SaveKpiBody {
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  direction: KpiDirection;
  target: number;
  owner: string;
  /** Catalogue metric; null = manual value */
  metric: string | null;
  value: number | null;
  reviewDueDate: string | null;
  /** Create only: also add the KPI as a tile on this view */
  viewKey?: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface KdFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  viewKey: string;
  granularity: string;
}

export interface KdOptions {
  periods: string[];
  defaultPeriod: string;
  metrics: KpiMetric[];
  owners: string[];
}

export interface KdFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
}

const TIME_ZONE = 'UTC';
const DAY_MS = 86_400_000;

const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

const asModule = (value: string): KpiModule => ((KPI_MODULES as readonly string[]).includes(value) ? (value as KpiModule) : 'Asset');
const asUnit = (value: string): KpiUnit => (['%', 'count', 'AED', 'x', 'hrs'].includes(value) ? (value as KpiUnit) : 'count');
const asDirection = (value: string): KpiDirection => (value === 'lower' ? 'lower' : 'higher');
const asStatus = (value: string): KpiStatus =>
  (['On Track', 'Watch', 'At Risk', 'Over Budget', 'No Data'].includes(value) ? value : 'No Data') as KpiStatus;

function toDef(dto: KpiDefinitionDto): KpiDef {
  return {
    id: dto.id,
    name: dto.name,
    module: asModule(dto.module),
    unit: asUnit(dto.unit),
    target: num(dto.target),
    direction: asDirection(dto.direction),
    owner: dto.owner ?? '',
    info: dto.info ?? '',
    metric: dto.metric,
    manualValue: dto.manualValue,
    flow: !!dto.flow,
    history: !!dto.history,
    source: dto.source ?? '',
    reviewDue: dto.reviewDueDate ? dto.reviewDueDate.slice(0, 10) : null,
    custom: !dto.isBuiltIn
  };
}

/** Days from today (local) to a yyyy-MM-dd date. */
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
}

function formatDay(date: string | null): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function varianceText(dto: KpiStateDto): string {
  const v = dto.variance;
  if (v === null || v === undefined || dto.value === null) return '—';
  switch (dto.varianceUnit) {
    case 'points':
      return signedText(v, 1, '%');
    case 'count':
      return signedText(v, 0, '');
    case 'x':
      return signedText(v, 1, 'x');
    default:
      return signedText(v, 0, '%');
  }
}

/** Months with nothing to measure are left out; a single value is drawn as a flat line. */
function sparkOf(values: (number | null)[] | null | undefined): number[] {
  const known = (values ?? []).filter((v): v is number => typeof v === 'number');
  return known.length === 1 ? [known[0], known[0]] : known;
}

function toState(dto: KpiStateDto): KpiState {
  const def = toDef(dto.kpi);
  const change = dto.change;
  const noData = dto.value === null || dto.value === undefined;
  return {
    def,
    value: noData ? null : dto.value,
    target: num(dto.target),
    status: asStatus(dto.status),
    valueText: noData ? '—' : formatKpi(dto.value as number, def.unit),
    targetText: targetLabel(def, num(dto.target), dto.targetBasis),
    varianceText: varianceText(dto),
    changeText: change === null || change === undefined ? '—' : signedText(change, 1, dto.changeUnit === 'points' ? ' pts' : '%'),
    changeUp: (change ?? 0) >= 0,
    changeGood: change === null || change === undefined ? true : def.direction === 'higher' ? change >= 0 : change <= 0,
    spark: sparkOf(dto.spark),
    monthly: def.history ? dto.spark ?? [] : [],
    attainment: num(dto.attainment),
    due: formatDay(def.reviewDue),
    dueInDays: daysUntil(def.reviewDue)
  };
}

function toView(dto: ViewDto): KpiViewDef {
  return {
    key: dto.key,
    label: dto.label,
    dashboard: dto.dashboard,
    custom: dto.isCustom,
    items: (dto.items ?? []).map((i) => ({ id: i.kpiId, visible: i.visible })),
    defaultIds: dto.defaultKpiIds ?? []
  };
}

function toTrend(dto: TrendDto | null | undefined): KpiTrendVm {
  return {
    labels: (dto?.categories ?? []).map(monthLabel),
    overall: (dto?.overall ?? []).map(num),
    target: (dto?.target ?? []).map(num),
    prior: (dto?.prior ?? []).map(num)
  };
}

function toInsight(dto: InsightDto): KpiInsightVm {
  const action = (['exceptions', 'plan', 'settings', 'due-week'].includes(dto.action) ? dto.action : 'exceptions') as KpiInsightVm['action'];
  return { key: dto.key, tone: dto.tone, title: dto.title, text: dto.text, actionLabel: dto.actionLabel, action, kpiId: dto.kpiId, kpiIds: dto.kpiIds ?? [] };
}

function toDashboard(dto: OverviewDto): KpiDashboardVm {
  return {
    generatedAt: dto.generatedAt,
    monthLabels: dto.monthLabels ?? [],
    views: (dto.views ?? []).map(toView),
    viewKey: dto.view?.key ?? '',
    tiles: (dto.tiles ?? []).map(toState),
    kpis: (dto.kpis ?? []).map(toState),
    trend: toTrend(dto.trend),
    targets: (dto.targets ?? []).map((t) => ({ module: t.module, value: num(t.attainment) })),
    exceptions: (dto.exceptions ?? []).map(toState),
    insights: (dto.insights ?? []).map(toInsight),
    library: KPI_MODULES.map((module) => ({ module, count: dto.library?.find((l) => l.module === module)?.count ?? 0 }))
  };
}

/** KPI Dashboard figures, KPI library and views from the Report Analytics API (/api/kpi-dashboard). */
@Injectable()
export class KpiDashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/kpi-dashboard`;

  readonly dashboard = signal<KpiDashboardVm>(emptyKpiDashboard());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'KPI Dashboard')));

  private tenant(): Record<string, string | undefined> {
    return { tenantId: environment.tenantId, clientId: environment.clientId };
  }

  private query(f: KdFilters): Record<string, string | null | undefined> {
    return {
      viewKey: f.viewKey,
      datePreset: f.period || KD_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      granularity: f.granularity,
      timeZone: TIME_ZONE,
      ...this.tenant()
    };
  }

  /** GET /options: period presets (Custom left out), the metric catalogue and KPI owners. */
  loadOptions(): Observable<KdOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`, { params: toParams(this.tenant()) }).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : KD_FALLBACK_PERIODS;
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : KD_DEFAULT_PERIOD,
          metrics: (dto.metrics ?? []).map((m) => ({
            id: m.id, name: m.name, module: m.module, unit: asUnit(m.unit), direction: asDirection(m.direction), history: m.history, source: m.source, info: m.info
          })),
          owners: dto.owners ?? []
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location and Asset Category values (labels; the API matches names). */
  loadFilters(): Observable<KdFilterLists> {
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params: toParams(this.tenant()) }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: tiles, trend, targets, exceptions, insights, library and views in one call. */
  loadOverview(f: KdFilters): Observable<KpiDashboardVm> {
    this.loading.set(true);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params: toParams(this.query(f)) }).pipe(
      map(toDashboard),
      tap((d) => {
        this.dashboard.set(d);
        this.loaded.set(true);
      }),
      catchError(this.fail),
      finalize(() => this.loading.set(false))
    );
  }

  /** GET /trend: the KPI Performance Trend for another granularity. */
  loadTrend(f: KdFilters): Observable<KpiTrendVm> {
    return this.http.get<SectionDto<TrendDto>>(`${this.apiUrl}/trend`, { params: toParams(this.query(f)) }).pipe(
      map((dto) => toTrend(dto.data)),
      tap((trend) => this.dashboard.update((d) => ({ ...d, trend }))),
      catchError(this.fail)
    );
  }

  /** GET /export: the Excel workbook of the view for the filter bar. */
  export(f: KdFilters): Observable<void> {
    return this.http.get(`${this.apiUrl}/export`, { params: toParams({ ...this.query(f), format: 'xlsx' }), observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'kpi-dashboard.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- KPI library -----

  /** POST /kpis: a custom KPI (added as a tile on body.viewKey). */
  createKpi(body: SaveKpiBody): Observable<KpiDef> {
    return this.http.post<KpiDefinitionDto>(`${this.apiUrl}/kpis`, { ...body, ...this.tenant() }).pipe(map(toDef), catchError(this.fail));
  }

  /** PUT /kpis/{kpiId}: built-in KPIs keep their module, unit and metric. */
  updateKpi(kpiId: string, body: SaveKpiBody): Observable<KpiDef> {
    return this.http.put<KpiDefinitionDto>(`${this.apiUrl}/kpis/${encodeURIComponent(kpiId)}`, { ...body, ...this.tenant() }).pipe(map(toDef), catchError(this.fail));
  }

  // ----- Views -----

  /** POST /views: Save current tiles as a custom view. */
  createView(label: string, ids: string[]): Observable<KpiViewDef> {
    const body = { label, items: ids.map((kpiId) => ({ kpiId, visible: true })), ...this.tenant() };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(map(toView), catchError(this.fail));
  }

  /** PUT /views/{viewKey}: the tiles of a view in order, with their visibility. */
  saveLayout(viewKey: string, items: { id: string; visible: boolean }[]): Observable<KpiViewDef> {
    const body = { items: items.map((i) => ({ kpiId: i.id, visible: i.visible })), ...this.tenant() };
    return this.http.put<ViewDto>(`${this.apiUrl}/views/${encodeURIComponent(viewKey)}`, body).pipe(map(toView), catchError(this.fail));
  }

  /** POST /views/{viewKey}/reset: back to the default tiles. */
  resetView(viewKey: string): Observable<KpiViewDef> {
    return this.http.post<ViewDto>(`${this.apiUrl}/views/${encodeURIComponent(viewKey)}/reset`, null, { params: toParams(this.tenant()) }).pipe(
      map(toView),
      catchError(this.fail)
    );
  }

  /** DELETE /views/{viewKey}: custom views only. */
  deleteView(viewKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/views/${encodeURIComponent(viewKey)}`, { params: toParams(this.tenant()) }).pipe(catchError(this.fail));
  }
}
