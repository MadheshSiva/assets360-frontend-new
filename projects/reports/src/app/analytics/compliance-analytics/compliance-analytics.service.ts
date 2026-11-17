import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from 'shared-ui';
import {
  DashboardPeriodDto, KpiWidgetDto, PerformanceSeriesDto, apiErrorMessage, monthLabel, num, optionLabels, saveBlob, seriesValues, toParams
} from '../asset-performance/kit/api-utils';
import {
  ALL_AREAS, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_REGULATIONS, ALL_RISK_LEVELS, CA_DEFAULT_PERIOD, CA_FALLBACK_PERIODS, CAPA_TARGET, COMPLIANCE_AREAS,
  CaKpiValue, CapaAction, ComplianceFinding, ComplianceRisk, ComplianceView, EXPIRY_TYPES, ExpiringItem, LocationRow, RISK_LEVEL_VALUES, RiskLevel,
  SCORE_TARGET, emptyCompliance
} from './compliance-analytics.data';

// ----- API shapes (/api/compliance-analytics) -----

interface AppliedFiltersDto {
  viewId: string | null;
  organization: string | null;
  location: string | null;
  area: string | null;
  regulation: string | null;
  riskLevel: string | null;
  scoreTarget: number;
  capaTarget: number;
}

interface SummaryDto {
  complianceScore: KpiWidgetDto;
  openFindings: KpiWidgetDto;
  expiringItems: KpiWidgetDto;
  overdueCapa: KpiWidgetDto;
  activeRisks: KpiWidgetDto;
  scoreTarget: number;
}

interface FindingRowDto {
  id: string;
  findingId: string;
  requirement: string;
  regulation: string | null;
  area: string;
  assetId: string | null;
  assetName: string | null;
  location: string | null;
  severity: string;
  status: string;
  dueDate: string | null;
  dueInDays: number | null;
  isOverdue: boolean;
  owner: string | null;
  inspectionId: string | null;
  correctiveAction: string | null;
  workOrder: string | null;
}

interface CapaRowDto {
  id: string;
  capaId: string;
  action: string;
  findingId: string;
  location: string | null;
  owner: string | null;
  dueDate: string | null;
  dueInDays: number | null;
  daysOverdue: number;
  status: string;
}

interface ExpiryRowDto {
  id: string;
  reference: string;
  name: string;
  type: string;
  source: string;
  location: string | null;
  area: string;
  expiresAt: string;
  daysLeft: number;
  monthIndex: number;
}

interface RiskRowDto {
  id: string;
  title: string;
  source: string;
  regulation: string | null;
  area: string;
  location: string | null;
  level: string;
  owner: string | null;
}

interface LocationRowDto {
  location: string;
  score: number | null;
  environmentalScore: number | null;
  openFindings: number;
  criticalFindings: number;
  expiringItems: number;
  activeRisks: number;
  risk: string;
  status: string;
}

interface OverviewDto {
  generatedAt: string;
  filters: AppliedFiltersDto;
  period: DashboardPeriodDto;
  summary: SummaryDto;
  scoreTrend: { trend: PerformanceSeriesDto; previousTrend: PerformanceSeriesDto; score: number | null; target: number };
  findingsBySeverity: { trend: PerformanceSeriesDto; total: number };
  complianceStatus: { compliant: number; partiallyCompliant: number; nonCompliant: number; notAssessed: number; total: number };
  findingsByArea: { area: string; openFindings: number }[];
  capa: { closureRate: number | null; target: number; total: number; closed: number; open: number; overdue: number; trend: PerformanceSeriesDto; openActions: CapaRowDto[] };
  expiry: { months: string[]; types: string[]; trend: PerformanceSeriesDto; expiringWithin90Days: number; expired: number; items: ExpiryRowDto[] };
  findings: FindingRowDto[];
  findingsTotal: number;
  risks: RiskRowDto[];
  locations: LocationRowDto[];
  environmental: { location: string; score: number | null; meetsTarget: boolean | null }[];
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  complianceAreas: string[];
  riskLevels: string[];
  expiryTypes: string[];
  defaultScoreTarget: number;
  defaultCapaTarget: number;
}

interface FilterOptionsDto {
  organizations: { value: string; label: string }[];
  locations: { value: string; label: string }[];
  regulations: { value: string; label: string }[];
}

interface ViewFiltersDto {
  organization: string | null;
  location: string | null;
  area: string | null;
  regulation: string | null;
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

interface ActionPlanDto {
  actionPlanId: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface CaFilters {
  period: string;
  organization: string;
  location: string;
  area: string;
  regulation: string;
  risk: string;
}

export interface CaOptions {
  periods: string[];
  defaultPeriod: string;
  areas: string[];
  riskLevels: string[];
}

export interface CaFilterLists {
  organizations: string[];
  locations: string[];
  regulations: string[];
}

export interface CaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: CaFilters;
}

/** "Create action plan" form plus what it was raised from. */
export interface CaActionPlanRequest {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
  context: string;
  sourceType: 'finding' | 'insight' | 'location' | 'kpi' | 'other';
  sourceId: string | null;
  location: string | null;
  regulation: string | null;
}

export interface CaActionPlan {
  id: string;
  title: string;
  owner: string;
  due: string;
  priority: string;
  status: string;
}

const TIME_ZONE = 'UTC';
/** The overview returns up to this many open findings so the table can be sorted in the browser. */
const FINDING_ROWS = 200;

/** "2026-10-24T00:00:00Z" → "24 Oct 2026". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const level = (value: string | null | undefined): RiskLevel =>
  (RISK_LEVEL_VALUES as string[]).includes(value ?? '') ? (value as RiskLevel) : 'Medium';

const kpi = (dto: KpiWidgetDto | null | undefined, unit = 'percent'): CaKpiValue => ({
  value: dto?.value ?? null,
  change: dto?.change ?? null,
  unit: dto?.changeUnit || unit
});

function toFinding(dto: FindingRowDto): ComplianceFinding {
  return {
    id: dto.findingId || dto.id,
    requirement: dto.requirement,
    regulation: dto.regulation ?? '—',
    area: dto.area,
    assetId: dto.assetId ?? '—',
    asset: dto.assetName || dto.assetId || '—',
    site: dto.location ?? '—',
    severity: level(dto.severity),
    dueInDays: dto.dueInDays,
    due: formatDay(dto.dueDate),
    owner: dto.owner ?? 'Unassigned',
    status: dto.status,
    inspectionId: dto.inspectionId,
    correctiveAction: dto.correctiveAction,
    workOrder: dto.workOrder
  };
}

function toCapa(dto: CapaRowDto): CapaAction {
  return {
    id: dto.capaId || dto.id,
    findingId: dto.findingId,
    site: dto.location ?? '—',
    title: dto.action,
    owner: dto.owner ?? 'Unassigned',
    dueInDays: dto.dueInDays,
    due: formatDay(dto.dueDate),
    daysOverdue: num(dto.daysOverdue)
  };
}

function toExpiry(dto: ExpiryRowDto): ExpiringItem {
  return {
    id: dto.reference || dto.id,
    name: dto.name,
    type: dto.type,
    source: dto.source,
    area: dto.area,
    site: dto.location ?? '—',
    monthIndex: dto.monthIndex,
    daysLeft: dto.daysLeft,
    expires: formatDay(dto.expiresAt)
  };
}

function toRisk(dto: RiskRowDto): ComplianceRisk {
  return {
    id: dto.id,
    title: dto.title,
    source: dto.source,
    regulation: dto.regulation ?? '—',
    area: dto.area,
    site: dto.location ?? '—',
    level: level(dto.level),
    owner: dto.owner ?? '—'
  };
}

function toLocation(dto: LocationRowDto): LocationRow {
  return {
    site: dto.location,
    score: dto.score,
    environmental: dto.environmentalScore,
    openFindings: num(dto.openFindings),
    critical: num(dto.criticalFindings),
    expiring: num(dto.expiringItems),
    risks: num(dto.activeRisks),
    risk: dto.risk === 'High' || dto.risk === 'Medium' ? dto.risk : 'Low',
    status: dto.status === 'At Risk' ? 'At Risk' : 'Compliant'
  };
}

function toView(dto: OverviewDto): ComplianceView {
  const trend = dto.scoreTrend?.trend;
  const labels = (trend?.categories ?? []).map(monthLabel);
  const align = (values: number[]) => labels.map((_, i) => values[i] ?? 0);
  const severity = dto.findingsBySeverity?.trend;
  const raised = {} as Record<RiskLevel, number[]>;
  RISK_LEVEL_VALUES.forEach((l) => (raised[l] = align(seriesValues(severity, l))));
  const areas = (dto.findingsByArea ?? []).map((a) => a.area);
  const expiry = dto.expiry;
  const expiring = (expiry?.items ?? []).map(toExpiry);
  const capaOpen = (dto.capa?.openActions ?? []).map(toCapa);
  const capaTrend = dto.capa?.trend;

  return {
    generatedAt: dto.generatedAt,
    scoreTarget: dto.scoreTrend?.target ?? dto.filters?.scoreTarget ?? SCORE_TARGET,
    capaTarget: dto.capa?.target ?? dto.filters?.capaTarget ?? CAPA_TARGET,
    labels,
    score: dto.summary?.complianceScore?.value ?? null,
    kpi: {
      score: kpi(dto.summary?.complianceScore, 'points'),
      findings: kpi(dto.summary?.openFindings),
      expiring: kpi(dto.summary?.expiringItems),
      capa: kpi(dto.summary?.overdueCapa),
      risks: kpi(dto.summary?.activeRisks)
    },
    scoreSeries: {
      overall: seriesValues(trend, 'Overall'),
      regulatory: seriesValues(trend, 'Regulatory'),
      safety: seriesValues(trend, 'Safety'),
      environmental: seriesValues(trend, 'Environmental'),
      previous: align(seriesValues(dto.scoreTrend?.previousTrend, 'Overall'))
    },
    raised,
    status: {
      compliant: num(dto.complianceStatus?.compliant),
      partial: num(dto.complianceStatus?.partiallyCompliant),
      nonCompliant: num(dto.complianceStatus?.nonCompliant),
      notAssessed: num(dto.complianceStatus?.notAssessed)
    },
    areas: areas.length ? areas : COMPLIANCE_AREAS,
    areaCounts: areas.length ? dto.findingsByArea.map((a) => num(a.openFindings)) : COMPLIANCE_AREAS.map(() => 0),
    findings: (dto.findings ?? []).map(toFinding),
    findingsTotal: num(dto.findingsTotal),
    capaOpen,
    capaOverdue: capaOpen.filter((c) => c.dueInDays !== null && c.dueInDays < 0),
    capaClosed: num(dto.capa?.closed),
    capaRate: dto.capa?.closureRate ?? null,
    capaSeries: (capaTrend?.categories ?? []).length ? seriesValues(capaTrend, 'Closure rate') : [],
    expiryLabels: (expiry?.months ?? []).map(monthLabel),
    expiryTypes: expiry?.types?.length ? expiry.types : EXPIRY_TYPES,
    expiring,
    expiringSoon: expiring.filter((e) => e.daysLeft <= 90),
    risks: (dto.risks ?? []).map(toRisk),
    locations: (dto.locations ?? []).map(toLocation),
    environmental: (dto.environmental ?? []).map((e) => ({ site: e.location, score: e.score }))
  };
}

/** "All …" in the filter bar is no filter. */
const pick = (value: string, all: string): string | null => (!value || value === all ? null : value);

/** Compliance Analytics figures, filters, saved views and action plans from the Report Analytics API (/api/compliance-analytics). */
@Injectable()
export class ComplianceAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/compliance-analytics`;

  readonly view = signal<ComplianceView>(emptyCompliance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(CA_FALLBACK_PERIODS);

  private fail = (err: HttpErrorResponse) => throwError(() => new Error(apiErrorMessage(err, 'Compliance Analytics')));

  private scope(): Record<string, string> {
    return { tenantId: environment.tenantId, clientId: environment.clientId };
  }

  private query(f: CaFilters): Record<string, string | null> {
    return {
      datePreset: f.period || CA_DEFAULT_PERIOD,
      organization: pick(f.organization, ALL_ORGANIZATIONS),
      location: pick(f.location, ALL_LOCATIONS),
      area: pick(f.area, ALL_AREAS),
      regulation: pick(f.regulation, ALL_REGULATIONS),
      riskLevel: pick(f.risk, ALL_RISK_LEVELS),
      timeZone: TIME_ZONE,
      ...this.scope()
    };
  }

  /** GET /options: period presets (Custom left out), compliance areas and risk levels. */
  loadOptions(): Observable<CaOptions> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`).pipe(
      map((dto) => {
        const periods = (dto.datePresets ?? []).filter((p) => p !== 'Custom');
        const list = periods.length ? periods : CA_FALLBACK_PERIODS;
        this.periods.set(list);
        return {
          periods: list,
          defaultPeriod: list.includes(dto.defaultDatePreset) ? dto.defaultDatePreset : CA_DEFAULT_PERIOD,
          areas: [ALL_AREAS, ...(dto.complianceAreas?.length ? dto.complianceAreas : COMPLIANCE_AREAS)],
          riskLevels: [ALL_RISK_LEVELS, ...(dto.riskLevels?.length ? dto.riskLevels : RISK_LEVEL_VALUES)]
        };
      }),
      catchError(this.fail)
    );
  }

  /** GET /filters: Organization, Location and Regulation values (labels; the API matches names). */
  loadFilters(): Observable<CaFilterLists> {
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params: toParams(this.scope()) }).pipe(
      map((dto) => ({
        organizations: optionLabels(ALL_ORGANIZATIONS, dto.organizations),
        locations: optionLabels(ALL_LOCATIONS, dto.locations),
        regulations: optionLabels(ALL_REGULATIONS, dto.regulations)
      })),
      catchError(this.fail)
    );
  }

  /** GET /overview: every section for the filter bar in one call. */
  loadOverview(f: CaFilters): Observable<ComplianceView> {
    this.loading.set(true);
    const params = toParams({ ...this.query(f), findingsSize: FINDING_ROWS });
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

  /** GET /export: the Excel workbook (a sheet per section) for the filter bar. */
  export(f: CaFilters): Observable<void> {
    return this.http.get(`${this.apiUrl}/export`, { params: toParams({ ...this.query(f), format: 'xlsx' }), observe: 'response', responseType: 'blob' }).pipe(
      map((res) => saveBlob(res, 'compliance-analytics.xlsx')),
      catchError(this.fail)
    );
  }

  // ----- Saved views -----

  /** GET /views: the built-in All Compliance view, then the user's own. */
  loadViews(): Observable<CaSavedView[]> {
    return this.http.get<ViewDto[]>(`${this.apiUrl}/views`, { params: toParams(this.scope()) }).pipe(
      map((rows) => rows.map((v) => this.toSavedView(v))),
      catchError(this.fail)
    );
  }

  /** POST /views. */
  createView(name: string, f: CaFilters, isDefault = false): Observable<CaSavedView> {
    const body = {
      viewName: name.trim(),
      isDefault,
      filters: {
        organization: pick(f.organization, ALL_ORGANIZATIONS),
        location: pick(f.location, ALL_LOCATIONS),
        area: pick(f.area, ALL_AREAS),
        regulation: pick(f.regulation, ALL_REGULATIONS),
        riskLevel: pick(f.risk, ALL_RISK_LEVELS),
        datePreset: f.period || CA_DEFAULT_PERIOD,
        timeZone: TIME_ZONE
      },
      ...this.scope()
    };
    return this.http.post<ViewDto>(`${this.apiUrl}/views`, body).pipe(map((dto) => this.toSavedView(dto)), catchError(this.fail));
  }

  // ----- Action plans -----

  /** POST /action-plans: "Create action plan". */
  createActionPlan(plan: CaActionPlanRequest): Observable<CaActionPlan> {
    const body = {
      title: plan.title.trim(),
      owner: plan.owner,
      dueDate: plan.due,
      priority: plan.priority,
      notes: plan.notes,
      context: plan.context,
      sourceType: plan.sourceType,
      sourceId: plan.sourceId,
      location: plan.location,
      regulation: plan.regulation,
      ...this.scope()
    };
    return this.http.post<ActionPlanDto>(`${this.apiUrl}/action-plans`, body).pipe(
      map((dto) => ({ id: dto.actionPlanId, title: dto.title, owner: dto.owner, due: formatDay(dto.dueDate), priority: dto.priority, status: dto.status })),
      catchError(this.fail)
    );
  }

  private toSavedView(dto: ViewDto): CaSavedView {
    const f = dto.filters;
    const periods = this.periods();
    return {
      viewId: dto.viewId,
      name: dto.viewName,
      builtIn: dto.isBuiltIn,
      isDefault: dto.isDefault,
      filters: {
        period: f?.datePreset && periods.includes(f.datePreset) ? f.datePreset : CA_DEFAULT_PERIOD,
        organization: f?.organization ?? ALL_ORGANIZATIONS,
        location: f?.location ?? ALL_LOCATIONS,
        area: f?.area ?? ALL_AREAS,
        regulation: f?.regulation ?? ALL_REGULATIONS,
        risk: f?.riskLevel ?? ALL_RISK_LEVELS
      }
    };
  }
}
