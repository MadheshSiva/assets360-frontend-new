import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import { RA_COLORS } from '../shared/charts';
import {
  DashboardPeriodDto, FilterOptionsDto, KpiWidgetDto, PerformanceSeriesDto, alignTo, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, seriesValues,
  toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_CATEGORIES, ALL_COST_CENTERS, ALL_LOCATIONS, ALL_ORGANIZATIONS, BUDGET_TARGET, CATEGORY_COLORS, CapexRequest, CategoryCost, CostAsset, FA_DEFAULT_PERIOD,
  FA_FALLBACK_PERIODS, FinancialKpi, FinancialView, MAINTENANCE_RATIO_LIMIT, TCO_COMPONENTS, emptyFinancial
} from './financial-analytics.data';

// ----- API shapes (/api/financial-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  category: string | null;
  costCenter: string | null;
  currency: string;
  budgetTarget: number;
  defaultUsefulLifeYears: number;
  maintenanceRatioLimit: number;
  utilizationThreshold: number;
}

interface SummaryDto {
  totalAssetValue: KpiWidgetDto;
  maintenanceSpend: KpiWidgetDto;
  capex: KpiWidgetDto;
  opex: KpiWidgetDto;
  netBookValue: KpiWidgetDto;
}

interface TcoTrendDto {
  trend: PerformanceSeriesDto;
  previousTrend: PerformanceSeriesDto;
  acquisition: number;
  maintenance: number;
  total: number;
}

interface CategoryCostsDto {
  total: number;
  items: { category: string; acquisition: number; maintenance: number; total: number; percentage: number }[];
}

interface DepreciationDto {
  trend: PerformanceSeriesDto;
  previousTrend: PerformanceSeriesDto;
  periodDepreciation: number;
  accumulated: number;
}

interface CostCenterRowDto {
  code: string;
  name: string;
  budget: number;
  budgetSource: string;
  actual: number;
  maintenance: number;
  capex: number;
  variance: number;
  utilization: number | null;
  status: string;
}

interface BudgetUtilizationDto {
  spend: number;
  budget: number;
  remaining: number;
  utilization: number | null;
  target: number;
  meetsTarget: boolean | null;
}

interface SiteMaintenanceDto {
  site: string;
  labour: number;
  parts: number;
  contractor: number;
  total: number;
}

interface AssetRowDto {
  key: string;
  assetRecordId: string | null;
  assetId: string | null;
  assetName: string | null;
  category: string | null;
  location: string | null;
  costCenter: string | null;
  acquisition: number;
  maintenance: number;
  periodMaintenance: number;
  depreciation: number;
  netBookValue: number;
  tco: number;
  operatingHours: number | null;
  costPerHour: number | null;
  maintenanceRatio: number | null;
  usefulLifeMonths: number | null;
  usefulLifeSource: string;
}

interface CapexRequestDto {
  requestId: string;
  title: string;
  assetId: string | null;
  assetName: string | null;
  location: string | null;
  category: string | null;
  costCenter: string | null;
  amount: number;
  currency: string | null;
  justification: string | null;
  requestedBy: string | null;
  submittedAt: string;
  status: string;
}

interface DisposalCandidateDto {
  key: string;
  assetRecordId: string | null;
  assetId: string | null;
  assetName: string | null;
  category: string | null;
  location: string | null;
  utilization: number;
  recoverableValue: number;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  tcoTrend: TcoTrendDto;
  categoryCosts: CategoryCostsDto;
  depreciation: DepreciationDto;
  costCenters: CostCenterRowDto[];
  budgetUtilization: BudgetUtilizationDto;
  siteMaintenance: SiteMaintenanceDto[];
  assets: AssetRowDto[];
  assetTotal: number;
  capexRequests: CapexRequestDto[];
  disposalCandidates: DisposalCandidateDto[];
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  baseCurrency: string;
  defaultBudgetTarget: number;
}

interface CostCenterOptionDto {
  value: string;
  label: string;
  annualBudget: number | null;
}

interface ViewDto {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter; costCenter is a cost center code). */
export interface FaFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  costCenter: string | null;
}

export interface FaOptions {
  periods: string[];
  defaultPeriod: string;
  budgetTarget: number;
}

export interface FaFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
}

export interface FaCostCenterOption {
  value: string;
  label: string;
}

const TIME_ZONE = 'UTC';
/** The overview returns this many asset rows, so the table can be sorted and the threshold insight listed in the browser. */
const ASSET_ROWS = 500;
/** The donut shows the biggest categories; the rest are grouped as "Other". */
const TOP_CATEGORIES = 4;

const kpi = (dto: KpiWidgetDto | null | undefined): FinancialKpi => ({
  value: num(dto?.value),
  previous: num(dto?.previousValue),
  change: typeof dto?.change === 'number' ? dto.change : null
});

function categoryCosts(dto: CategoryCostsDto | null | undefined): CategoryCost[] {
  const items = [...(dto?.items ?? [])].sort((a, b) => b.total - a.total);
  const top = items.slice(0, TOP_CATEGORIES).map((c, i) => ({ name: c.category, value: num(c.total), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  const rest = items.slice(TOP_CATEGORIES).reduce((s, c) => s + num(c.total), 0);
  return rest > 0 ? [...top, { name: 'Other', value: rest, color: RA_COLORS.pink }] : top;
}

function toAsset(dto: AssetRowDto): CostAsset {
  return {
    key: dto.key,
    id: dto.assetId || dto.key,
    name: dto.assetName || dto.assetId || '—',
    category: dto.category ?? '—',
    site: dto.location ?? '—',
    acquisition: num(dto.acquisition),
    maintenance: num(dto.maintenance),
    depreciation: num(dto.depreciation),
    netBookValue: num(dto.netBookValue),
    tco: num(dto.tco),
    hours: dto.operatingHours,
    costPerHour: dto.costPerHour,
    maintenanceRatio: dto.maintenanceRatio
  };
}

function toCapex(dto: CapexRequestDto): CapexRequest {
  return {
    ref: dto.requestId,
    title: dto.title,
    site: dto.location ?? '—',
    category: dto.category ?? '—',
    amount: num(dto.amount),
    requestedBy: dto.requestedBy ?? '—',
    submitted: (dto.submittedAt ?? '').slice(0, 10),
    status: dto.status
  };
}

function caption(period: DashboardPeriodDto | null | undefined): string {
  if (!period) return '';
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return period.from === period.to ? fmt(period.from) : `${fmt(period.from)} – ${fmt(period.to)}`;
}

function toView(dto: OverviewDto): FinancialView {
  const trend = dto.tcoTrend?.trend;
  const labels = (trend?.categories ?? []).map(monthLabel);
  const budget = dto.budgetUtilization;
  return {
    generatedAt: dto.generatedAt,
    labels,
    caption: caption(dto.period),
    totalAssetValue: kpi(dto.summary?.totalAssetValue),
    maintenance: kpi(dto.summary?.maintenanceSpend),
    capex: kpi(dto.summary?.capex),
    opex: kpi(dto.summary?.opex),
    netBookValue: kpi(dto.summary?.netBookValue),
    tco: TCO_COMPONENTS.map((name) => seriesValues(trend, name)),
    tcoCumulative: seriesValues(trend, 'Total TCO (cumulative)'),
    tcoCumulativePrevious: alignTo(seriesValues(dto.tcoTrend?.previousTrend, 'Total TCO (cumulative)'), labels.length),
    tcoTotal: num(dto.tcoTrend?.total),
    categoryCosts: categoryCosts(dto.categoryCosts),
    depreciation: seriesValues(dto.depreciation?.trend, 'Monthly Depreciation'),
    accumulated: seriesValues(dto.depreciation?.trend, 'Accumulated Depreciation'),
    depreciationPrevious: alignTo(seriesValues(dto.depreciation?.previousTrend, 'Monthly Depreciation'), labels.length),
    costCenters: (dto.costCenters ?? []).map((c) => ({
      code: c.code, name: c.name, budget: num(c.budget), actual: num(c.actual), variance: num(c.variance), utilization: c.utilization, status: c.status
    })),
    budget: num(budget?.budget),
    spend: num(budget?.spend),
    budgetUtilization: budget?.utilization ?? null,
    budgetTarget: budget?.target ?? dto.filters?.budgetTarget ?? BUDGET_TARGET,
    maintenanceRatioLimit: dto.filters?.maintenanceRatioLimit ?? MAINTENANCE_RATIO_LIMIT,
    utilizationThreshold: dto.filters?.utilizationThreshold ?? 25,
    siteMaintenance: (dto.siteMaintenance ?? []).map((s) => ({ site: s.site, labour: num(s.labour), parts: num(s.parts), contractor: num(s.contractor), total: num(s.total) })),
    assets: (dto.assets ?? []).map(toAsset),
    assetTotal: num(dto.assetTotal),
    capexRequests: (dto.capexRequests ?? []).map(toCapex),
    disposals: (dto.disposalCandidates ?? []).map((d) => ({
      id: d.assetId || d.key, name: d.assetName || d.assetId || '—', category: d.category ?? '—', site: d.location ?? '—',
      utilization: num(d.utilization), recoverable: num(d.recoverableValue)
    }))
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

/** Financial Analytics figures, filters, saved views and CAPEX approvals from the Report Analytics API (/api/financial-analytics). */
@Injectable()
export class FinancialAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/financial-analytics`;

  readonly view = signal<FinancialView>(emptyFinancial());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Financial Analytics')));

  private scope(): Record<string, string | undefined> {
    return { tenantId: environment.tenantId, clientId: environment.clientId };
  }

  private query(f: FaFilters): Record<string, string | null | undefined> {
    return {
      datePreset: f.period || FA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      category: pick(f.category, ALL_CATEGORIES),
      costCenter: f.costCenter,
      timeZone: TIME_ZONE,
      ...this.scope()
    };
  }

  /** GET /options: period presets (Custom left out) and the budget utilization target. */
  loadOptions(): Observable<FaOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : FA_FALLBACK_PERIODS;
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : FA_DEFAULT_PERIOD,
          budgetTarget: dto.defaultBudgetTarget ?? BUDGET_TARGET
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location and Asset Category values (labels; the API matches names). */
  loadFilters(): Observable<FaFilterLists> {
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params: toParams(this.scope()) }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        categories: optionLabels(ALL_CATEGORIES, dto.assetCategories)
      })),
      catchError(this.fail)
    );
  }

  /** GET /cost-centers: Master Data departments and the cost centers recorded on assets. */
  loadCostCenters(): Observable<FaCostCenterOption[]> {
    return this.http.get<CostCenterOptionDto[]>(`${this.apiUrl}/cost-centers`, { params: toParams(this.scope()) }).pipe(
      map((rows) => [{ value: '', label: ALL_COST_CENTERS }, ...rows.map((r) => ({ value: r.value, label: r.label }))]),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: FaFilters): Observable<FinancialView> {
    this.loading.set(true);
    return this.http.get<OverviewDto>(`${this.apiUrl}/overview`, { params: toParams({ ...this.query(f), assetLimit: ASSET_ROWS }) }).pipe(
      map(toView),
      tap((v) => {
        this.view.set(v);
        this.loaded.set(true);
      }),
      catchError(this.fail),
      finalize(() => this.loading.set(false))
    );
  }

  /** POST /capex-requests/decisions: Approve, Reject or Request more information for the given requests. */
  decideCapex(requestIds: string[], decision: string, approver: string, comments: string): Observable<{ status: string; count: number }> {
    return this.http.post<{ decision: string; status: string; requests: unknown[] }>(`${this.apiUrl}/capex-requests/decisions`, { requestIds, decision, approver, comments }).pipe(
      map((dto) => ({ status: dto.status, count: dto.requests?.length ?? requestIds.length })),
      catchError(this.fail)
    );
  }

  /** POST /views: Save View with the period, organization, location and category (cost center and currency are not stored). */
  createView(name: string, f: FaFilters): Observable<ViewDto> {
    const body = {
      viewName: name.trim(),
      isDefault: false,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        category: pick(f.category, ALL_CATEGORIES),
        datePreset: f.period || FA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      },
      ...this.scope()
    };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(catchError(this.fail));
  }

  /** GET /export: the Excel workbook for the filter bar (amounts in the base currency). */
  export(f: FaFilters): Observable<void> {
    return this.http.get(`${this.apiUrl}/export`, { params: toParams({ ...this.query(f), format: 'xlsx' }), observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'financial-analytics.xlsx')),
      catchError(this.fail)
    );
  }
}
