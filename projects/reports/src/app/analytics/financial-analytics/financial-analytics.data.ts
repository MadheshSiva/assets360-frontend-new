import { RA_CATEGORIES, money } from '../shared/analytics-common';
import { RA_COLORS } from '../shared/charts/chart-utils';
import { PeriodWindow, periodWindow, siteInScope, sumOf } from '../inventory-analytics/parts/ra-parts';

// Financial analytics: site cost splits, monthly TCO series, cost centers, asset costs, CAPEX requests and disposal
// candidates come from the finance system. No data source is wired yet, so everything starts empty.
// Amounts are held in AED and converted for display.

export type Currency = 'AED' | 'USD' | 'SAR';
export const CURRENCIES: Currency[] = ['AED', 'USD', 'SAR'];
/** Fixed demo rates: AED per one unit of the currency */
const AED_PER: Record<Currency, number> = { AED: 1, USD: 3.6725, SAR: 0.979 };

export function toCurrency(aed: number, cur: Currency): number {
  return aed / AED_PER[cur];
}

/** 1860000 AED → "USD 506.5K" */
export function moneyIn(aed: number, cur: Currency, digits = 2): string {
  return money(toCurrency(aed, cur), digits).replace('AED', cur);
}

interface SiteCost {
  site: string;
  /** Share of group asset base and spend */
  share: number;
  /** Maintenance mix: labour, parts, contractor */
  mix: [number, number, number];
}

const SITES: SiteCost[] = [];

export const CATEGORY_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal, RA_COLORS.grey];

export const TCO_COMPONENTS = ['Acquisition', 'Maintenance', 'Operating & Energy', 'Depreciation', 'Downtime', 'Disposal'];
export const TCO_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal];

// ===== Cost centers =====

export interface CostCenter {
  code: string;
  name: string;
  /** Budget and actual for the period, AED */
  budget: number;
  actual: number;
  /** TCO component the actual follows month by month (-1 = flat) */
  driver: number;
}

export const COST_CENTERS: CostCenter[] = [];
export const BUDGET_TARGET = 90;

// ===== Asset-level rows =====

export interface CostAsset {
  id: string;
  name: string;
  category: string;
  site: string;
  acquisition: number;
  maintenance: number;
  depreciation: number;
  tco: number;
  hours: number;
  costPerHour: number;
  /** Expected lifecycle cost to date */
  plannedTco: number;
  lifecyclePct: number;
}

export const COST_ASSETS: CostAsset[] = [];
export const LIFECYCLE_LIMIT = 120;

export interface CapexRequest {
  ref: string;
  title: string;
  site: string;
  category: string;
  amount: number;
  requestedBy: string;
  submitted: string;
}

export const CAPEX_REQUESTS: CapexRequest[] = [];

export interface DisposalCandidate {
  id: string;
  name: string;
  category: string;
  site: string;
  utilization: number;
  recoverable: number;
}

export const DISPOSAL_CANDIDATES: DisposalCandidate[] = [];

// ===== View for the current filters =====

export const ALL_CATEGORIES = 'All categories';
export const ALL_COST_CENTERS = 'All cost centers';

export interface FinancialFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  costCenter: string;
}

export interface SiteMaintenance {
  site: string;
  labour: number;
  parts: number;
  contractor: number;
  total: number;
}

export interface CostCenterRow {
  code: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
  utilization: number;
  status: 'Over Budget' | 'At Risk' | 'On Track';
}

export interface CategoryCost {
  name: string;
  value: number;
  color: string;
}

/** All amounts in AED; the page converts for display */
export interface FinancialView {
  window: PeriodWindow;
  hasScope: boolean;
  totalAssetValue: number;
  maintenance: number;
  capex: number;
  opex: number;
  netBookValue: number;
  tco: number[][];
  tcoCumulative: number[];
  tcoTotal: number;
  categoryCosts: CategoryCost[];
  depreciation: number[];
  accumulated: number[];
  costCenters: CostCenterRow[];
  budget: number;
  spend: number;
  siteMaintenance: SiteMaintenance[];
  assets: CostAsset[];
  capexRequests: CapexRequest[];
  disposals: DisposalCandidate[];
}

export function buildFinancialView(f: FinancialFilters): FinancialView {
  const w = periodWindow(f.period);
  const sites = SITES.filter((s) => siteInScope(s.site, f.organization, f.location));
  const siteShare = sumOf(sites.map((s) => s.share));
  const c = RA_CATEGORIES.indexOf(f.category);

  // Monthly TCO components, category split and depreciation are not available until a data source is wired
  const tco: number[][] = TCO_COMPONENTS.map(() => []);
  const tcoCumulative: number[] = [];
  const tcoTotal = 0;
  const categoryCosts: CategoryCost[] = [];
  const acc: number[] = [];

  const costCenters: CostCenterRow[] = COST_CENTERS.filter((cc) => f.costCenter === ALL_COST_CENTERS || f.costCenter === `${cc.code} ${cc.name}`).map((cc) => {
    const utilization = cc.budget ? (cc.actual / cc.budget) * 100 : 0;
    return {
      code: cc.code, name: cc.name, budget: cc.budget, actual: cc.actual, variance: cc.actual - cc.budget, utilization,
      status: utilization > 105 ? 'Over Budget' : utilization > 100 ? 'At Risk' : 'On Track'
    };
  });

  const maintenanceTotal = sumOf(tco[1]);
  const siteMaintenance = sites.map((s) => {
    const total = siteShare ? (maintenanceTotal * s.share) / siteShare : 0;
    return { site: s.site, labour: total * s.mix[0], parts: total * s.mix[1], contractor: total * s.mix[2], total };
  });

  const assetInScope = (a: { site: string; category: string }) => sites.some((s) => s.site === a.site) && (c < 0 || a.category === f.category);

  return {
    window: w,
    hasScope: sites.length > 0,
    totalAssetValue: 0,
    maintenance: maintenanceTotal,
    capex: sumOf(tco[0]),
    opex: sumOf(tco[2]),
    netBookValue: 0,
    tco,
    tcoCumulative,
    tcoTotal,
    categoryCosts,
    depreciation: tco[3],
    accumulated: acc,
    costCenters,
    budget: sumOf(costCenters.map((x) => x.budget)),
    spend: sumOf(costCenters.map((x) => x.actual)),
    siteMaintenance,
    assets: COST_ASSETS.filter(assetInScope),
    capexRequests: CAPEX_REQUESTS.filter(assetInScope),
    disposals: DISPOSAL_CANDIDATES.filter(assetInScope)
  };
}
