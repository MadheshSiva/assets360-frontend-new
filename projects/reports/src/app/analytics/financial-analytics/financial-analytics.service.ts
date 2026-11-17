import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  DEMO_ORGANIZATIONS, DEMO_SITES, dayFromToday, formatDate, monthAxisLabel, pctChange, periodMonths, periodRange, periodWeight, previousMonths, rnd, round1,
  siteInScope, sum
} from '../asset-performance/kit/demo-data';
import { RA_CATEGORIES, downloadCsv } from '../shared/analytics-common';
import { RA_COLORS } from '../shared/charts';
import {
  ALL_CATEGORIES, ALL_COST_CENTERS, ALL_LOCATIONS, ALL_ORGANIZATIONS, BUDGET_TARGET, CAPEX_REQUESTS, CATEGORY_COLORS, COST_CENTERS, CapexRequest, CategoryCost,
  CostAsset, CostCenterRow, FA_DEFAULT_PERIOD, FA_FALLBACK_PERIODS, FINANCE_REGISTER, FinanceAsset, FinancialKpi, FinancialView, MAINTENANCE_RATIO_LIMIT,
  emptyFinancial
} from './financial-analytics.data';

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

export interface FaSavedView {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
}

/** The donut shows the biggest categories; the rest are grouped as "Other". */
const TOP_CATEGORIES = 4;
/** Assets used less than this (%) with book value left are disposal candidates. */
const UTILIZATION_THRESHOLD = 35;
/** Running costs besides maintenance (energy, insurance, licences) per month, as a share of acquisition cost. */
const RUNNING_COST_RATE = 0.0012;
/** Operating hours in a month at 100% utilization. */
const MONTH_HOURS = 730;

function inScope(x: FinanceAsset, f: FaFilters): boolean {
  if (!siteInScope(x.asset.site.name, f.organization, f.location)) return false;
  if (f.category && f.category !== ALL_CATEGORIES && x.asset.category !== f.category) return false;
  if (f.costCenter && x.costCenter !== f.costCenter) return false;
  return true;
}

const owned = (x: FinanceAsset, month: number) => x.acquiredIndex <= month;
const monthlyDepreciation = (x: FinanceAsset) => x.acquisition / x.usefulLifeMonths;

/** Depreciation charged in a month (none before purchase or once fully depreciated). */
function depreciationIn(x: FinanceAsset, month: number): number {
  const age = month - x.acquiredIndex + 1;
  return age >= 1 && age <= x.usefulLifeMonths ? monthlyDepreciation(x) : 0;
}

function accumulatedAt(x: FinanceAsset, month: number): number {
  return owned(x, month) ? monthlyDepreciation(x) * Math.min(x.usefulLifeMonths, month - x.acquiredIndex + 1) : 0;
}

function maintenanceToDate(x: FinanceAsset, month: number): number {
  return x.priorMaintenance + sum(x.monthlyMaintenance.slice(0, month + 1));
}

/** Spend of one asset over some months: maintenance, CAPEX (its purchase) and other running costs. */
function spend(x: FinanceAsset, months: number[], weight: number) {
  const maintenance = sum(months.map((m) => x.monthlyMaintenance[m] ?? 0)) * weight;
  const capex = months.includes(x.acquiredIndex) ? x.acquisition * weight : 0;
  const running = months.filter((m) => owned(x, m)).length * x.acquisition * RUNNING_COST_RATE * weight;
  return { maintenance, capex, running };
}

const kpi = (value: number, previous: number): FinancialKpi => ({ value: Math.round(value), previous: Math.round(previous), change: previous ? pctChange(value, previous) : null });

function caption(period: string): string {
  const { from, to } = periodRange(period);
  return from.getTime() === to.getTime() ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

function buildView(f: FaFilters, decided: Set<string>): FinancialView {
  const months = periodMonths(f.period);
  const previous = previousMonths(f.period);
  const weight = periodWeight(f.period);
  const end = months[months.length - 1];
  const prevEnd = previous.length ? previous[previous.length - 1] : -1;
  const register = FINANCE_REGISTER.filter((x) => inScope(x, f));
  const assets = register.filter((x) => owned(x, end));

  const total = (list: FinanceAsset[], m: number[]) => {
    const s = list.map((x) => spend(x, m, weight));
    return { maintenance: sum(s.map((x) => x.maintenance)), capex: sum(s.map((x) => x.capex)), running: sum(s.map((x) => x.running)) };
  };
  const now = total(register, months);
  const before = total(register, previous);
  const value = (month: number) => sum(register.filter((x) => owned(x, month)).map((x) => x.acquisition));
  const nbv = (month: number) => sum(register.filter((x) => owned(x, month)).map((x) => x.acquisition - accumulatedAt(x, month)));

  // TCO trend: acquisitions and maintenance per month, and the running total
  const acquisitionByMonth = months.map((m) => sum(register.filter((x) => x.acquiredIndex === m).map((x) => x.acquisition)) * weight);
  const maintenanceByMonth = months.map((m) => sum(register.map((x) => x.monthlyMaintenance[m] ?? 0)) * weight);
  const cumulative = (a: number[], b: number[]) => {
    let running = 0;
    return a.map((v, i) => (running += v + b[i]));
  };
  const prevAcquisition = previous.map((m) => sum(register.filter((x) => x.acquiredIndex === m).map((x) => x.acquisition)) * weight);
  const prevMaintenance = previous.map((m) => sum(register.map((x) => x.monthlyMaintenance[m] ?? 0)) * weight);
  const prevCumulative = cumulative(prevAcquisition, prevMaintenance);

  // Cost by category over the period
  const byCategory = RA_CATEGORIES.map((c) => {
    const s = total(register.filter((x) => x.asset.category === c), months);
    return { name: c, value: s.capex + s.maintenance };
  }).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const rest = sum(byCategory.slice(TOP_CATEGORIES).map((c) => c.value));
  const categoryCosts: CategoryCost[] = byCategory.slice(0, TOP_CATEGORIES).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  if (rest > 0) categoryCosts.push({ name: 'Other', value: rest, color: RA_COLORS.pink });

  // Depreciation
  const depreciation = months.map((m) => sum(register.map((x) => depreciationIn(x, m))) * weight);
  const accumulated = months.map((m) => sum(register.map((x) => accumulatedAt(x, m))));
  const depreciationPrevious = months.map((_, i) => (previous[i] === undefined ? 0 : sum(register.map((x) => depreciationIn(x, previous[i]))) * weight));

  // Cost centers: budget is the cost center's annual plan for the scope, pro-rated to the period
  const last12 = Array.from({ length: 12 }, (_, i) => end - 11 + i).filter((m) => m >= 0);
  const costCenters: CostCenterRow[] = COST_CENTERS.map((cc) => {
    const list = register.filter((x) => x.costCenter === cc.code);
    if (!list.length) return null;
    const year = total(list, last12);
    const budget = Math.round(((year.maintenance + year.capex) / (weight || 1)) * cc.budgetFactor * (months.length / 12) * weight);
    const s = total(list, months);
    const actual = Math.round(s.maintenance + s.capex);
    const utilization = budget ? round1((actual / budget) * 100) : null;
    return {
      code: cc.code, name: cc.name, budget, actual, variance: actual - budget, utilization,
      status: utilization === null ? 'No Budget' : utilization > 100 ? 'Over Budget' : utilization >= BUDGET_TARGET ? 'At Risk' : 'On Track'
    };
  }).filter((c): c is CostCenterRow => c !== null);
  const budget = sum(costCenters.map((c) => c.budget));
  const spent = sum(costCenters.map((c) => c.actual));

  // Maintenance by location, split into labour, parts and contractor costs
  const siteMaintenance = DEMO_SITES.filter((s) => register.some((x) => x.asset.site === s)).map((s, i) => {
    const t = Math.round(total(register.filter((x) => x.asset.site === s), months).maintenance);
    const labour = Math.round(t * (0.42 + rnd(i, 91) * 0.08));
    const parts = Math.round(t * (0.3 + rnd(i, 92) * 0.08));
    return { site: s.name, labour, parts, contractor: t - labour - parts, total: t };
  }).filter((s) => s.total > 0);

  const rows: CostAsset[] = assets.map((x) => {
    const s = spend(x, months, weight);
    const maintenance = Math.round(maintenanceToDate(x, end));
    const depreciationToDate = Math.round(accumulatedAt(x, end));
    const ownedMonths = months.filter((m) => owned(x, m)).length;
    const hours = Math.round(x.asset.utilization / 100 * MONTH_HOURS * ownedMonths * weight);
    const periodDepreciation = sum(months.map((m) => depreciationIn(x, m))) * weight;
    return {
      key: x.asset.key,
      id: x.asset.id,
      name: x.asset.name,
      category: x.asset.category,
      site: x.asset.site.name,
      acquisition: x.acquisition,
      maintenance,
      depreciation: depreciationToDate,
      netBookValue: Math.round(x.acquisition - depreciationToDate),
      tco: x.acquisition + maintenance,
      hours,
      costPerHour: hours ? round1((s.maintenance + s.running + periodDepreciation) / hours) : null,
      maintenanceRatio: x.acquisition ? round1((maintenance / x.acquisition) * 100) : null
    };
  });

  const capexRequests: CapexRequest[] = CAPEX_REQUESTS
    .filter((r) => !decided.has(r.ref) && siteInScope(r.site, f.organization, f.location)
      && (!f.category || f.category === ALL_CATEGORIES || r.category === f.category) && (!f.costCenter || r.costCenter === f.costCenter))
    .map((r) => ({
      ref: r.ref, title: r.title, site: r.site, category: r.category, amount: r.amount, requestedBy: r.requestedBy,
      submitted: dayFromToday(-r.daysAgo).slice(0, 10), status: 'Pending Approval'
    }));

  const disposals = rows
    .filter((a) => {
      const x = assets.find((y) => y.asset.key === a.key);
      return x && x.asset.utilization < UTILIZATION_THRESHOLD && a.netBookValue > 0;
    })
    .map((a) => ({
      id: a.id, name: a.name, category: a.category, site: a.site,
      utilization: assets.find((y) => y.asset.key === a.key)?.asset.utilization ?? 0, recoverable: a.netBookValue
    }))
    .sort((a, b) => b.recoverable - a.recoverable);

  return {
    generatedAt: new Date().toISOString(),
    labels: months.map(monthAxisLabel),
    caption: caption(f.period),
    totalAssetValue: kpi(value(end), prevEnd >= 0 ? value(prevEnd) : 0),
    maintenance: kpi(now.maintenance, before.maintenance),
    capex: kpi(now.capex, before.capex),
    opex: kpi(now.maintenance + now.running, before.maintenance + before.running),
    netBookValue: kpi(nbv(end), prevEnd >= 0 ? nbv(prevEnd) : 0),
    tco: [acquisitionByMonth, maintenanceByMonth],
    tcoCumulative: cumulative(acquisitionByMonth, maintenanceByMonth),
    tcoCumulativePrevious: months.map((_, i) => prevCumulative[i] ?? 0),
    tcoTotal: Math.round(now.capex + now.maintenance),
    categoryCosts,
    depreciation,
    accumulated,
    depreciationPrevious,
    costCenters,
    budget,
    spend: spent,
    budgetUtilization: budget ? round1((spent / budget) * 100) : null,
    budgetTarget: BUDGET_TARGET,
    maintenanceRatioLimit: MAINTENANCE_RATIO_LIMIT,
    utilizationThreshold: UTILIZATION_THRESHOLD,
    siteMaintenance,
    assets: rows,
    assetTotal: rows.length,
    capexRequests,
    disposals
  };
}

const DECISION_STATUS: Record<string, string> = { Approve: 'Approved', Reject: 'Rejected', 'Request more information': 'More Information Requested' };

/** DEMO MODE: Financial Analytics figures, filters, saved views and CAPEX approvals built in the browser from the static cost register. */
@Injectable()
export class FinancialAnalyticsService {
  readonly view = signal<FinancialView>(emptyFinancial());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  /** CAPEX requests approved or rejected in this session */
  private readonly decided = new Set<string>();
  private views: FaSavedView[] = [];

  /** Period presets and the budget utilization target. */
  loadOptions(): Observable<FaOptions> {
    return of({ periods: FA_FALLBACK_PERIODS, defaultPeriod: FA_DEFAULT_PERIOD, budgetTarget: BUDGET_TARGET });
  }

  /** Organization, Location and Asset Category values. */
  loadFilters(): Observable<FaFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...DEMO_ORGANIZATIONS],
      locations: [ALL_LOCATIONS, ...DEMO_SITES.map((s) => s.name)],
      categories: [ALL_CATEGORIES, ...RA_CATEGORIES]
    });
  }

  /** Cost centers recorded on the assets. */
  loadCostCenters(): Observable<FaCostCenterOption[]> {
    return of([{ value: '', label: ALL_COST_CENTERS }, ...COST_CENTERS.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` }))]);
  }

  /** Every section for the filter bar. */
  loadOverview(f: FaFilters): Observable<FinancialView> {
    const v = buildView(f, this.decided);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  /** Approve, Reject or Request more information for the given requests (approved and rejected ones leave the queue). */
  decideCapex(requestIds: string[], decision: string, _approver: string, _comments: string): Observable<{ status: string; count: number }> {
    const status = DECISION_STATUS[decision] ?? decision;
    if (decision === 'Approve' || decision === 'Reject') requestIds.forEach((id) => this.decided.add(id));
    return of({ status, count: requestIds.length });
  }

  /** Save View with the period, organization, location and category (kept in memory). */
  createView(name: string, _f: FaFilters): Observable<FaSavedView> {
    const saved: FaSavedView = { viewId: `view-${Date.now()}`, viewName: name.trim(), isBuiltIn: false, isDefault: false };
    this.views = [...this.views, saved];
    return of(saved);
  }

  /** The assets for the filter bar as a CSV download (amounts in AED). */
  export(f: FaFilters): Observable<void> {
    const v = buildView(f, this.decided);
    downloadCsv('financial-analytics.csv',
      ['Asset ID', 'Asset Name', 'Category', 'Location', 'Acquisition (AED)', 'Maintenance to Date (AED)', 'Accumulated Depreciation (AED)', 'Net Book Value (AED)',
        'TCO (AED)', 'Operating Hours', 'Cost per Hour (AED)', 'Maintenance / Acquisition %'],
      [...v.assets].sort((a, b) => b.tco - a.tco).map((a) => [a.id, a.name, a.category, a.site, a.acquisition, a.maintenance, a.depreciation, a.netBookValue, a.tco,
        a.hours ?? '', a.costPerHour ?? '', a.maintenanceRatio ?? '']));
    return of(undefined);
  }
}
