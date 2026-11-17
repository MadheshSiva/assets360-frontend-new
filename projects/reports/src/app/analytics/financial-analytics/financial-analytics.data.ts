import { money } from '../shared/analytics-common';
import { RA_COLORS } from '../shared/charts/chart-utils';

// Financial Analytics view model. Figures come from the Report Analytics API (/api/financial-analytics, see financial-analytics.service.ts)
// in the register's base currency (AED) and are converted for display.

export type Currency = 'AED' | 'USD' | 'SAR';
export const CURRENCIES: Currency[] = ['AED', 'USD', 'SAR'];
/** DEMO MODE: fixed display rates (AED per one unit of the currency); no exchange-rate service exists yet. */
const AED_PER: Record<Currency, number> = { AED: 1, USD: 3.6725, SAR: 0.979 };

export function toCurrency(aed: number, cur: Currency): number {
  return aed / AED_PER[cur];
}

/** 1860000 AED → "USD 506.5K" */
export function moneyIn(aed: number, cur: Currency, digits = 2): string {
  return money(toCurrency(aed, cur), digits).replace('AED', cur);
}

/** TCO components the API reports month by month (acquisition / CAPEX and maintenance spend). */
export const TCO_COMPONENTS = ['Acquisition', 'Maintenance'];
export const TCO_COLORS = [RA_COLORS.blue, RA_COLORS.green];
export const CATEGORY_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal, RA_COLORS.grey];

export const BUDGET_TARGET = 90;
/** Maintenance to date above this share of acquisition cost flags an asset for repair-vs-replace review (API default). */
export const MAINTENANCE_RATIO_LIMIT = 50;

export const ALL_CATEGORIES = 'All categories';
export const ALL_COST_CENTERS = 'All cost centers';
export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const FA_DEFAULT_PERIOD = 'This year';
export const FA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];

export interface CostAsset {
  /** Row key (asset record id, or the asset id work orders use) */
  key: string;
  id: string;
  name: string;
  category: string;
  site: string;
  acquisition: number;
  /** Maintenance to the end of the period */
  maintenance: number;
  /** Accumulated depreciation at the end of the period */
  depreciation: number;
  netBookValue: number;
  /** Acquisition + maintenance to date */
  tco: number;
  hours: number | null;
  costPerHour: number | null;
  /** Maintenance to date as a % of acquisition cost; null without an acquisition cost */
  maintenanceRatio: number | null;
}

export interface CapexRequest {
  ref: string;
  title: string;
  site: string;
  category: string;
  amount: number;
  requestedBy: string;
  submitted: string;
  status: string;
}

export interface DisposalCandidate {
  id: string;
  name: string;
  category: string;
  site: string;
  utilization: number;
  /** Net book value */
  recoverable: number;
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
  /** Actual ÷ budget in %; null when the cost center has no budget */
  utilization: number | null;
  status: string;
}

export interface CategoryCost {
  name: string;
  value: number;
  color: string;
}

/** A KPI's value, previous-period value and % change (null when there is nothing to compare with). */
export interface FinancialKpi {
  value: number;
  previous: number;
  change: number | null;
}

/** All amounts in AED; the page converts for display */
export interface FinancialView {
  generatedAt: string | null;
  /** Month labels of the period ("Jan\n2026") */
  labels: string[];
  caption: string;
  totalAssetValue: FinancialKpi;
  maintenance: FinancialKpi;
  capex: FinancialKpi;
  opex: FinancialKpi;
  netBookValue: FinancialKpi;
  /** One monthly series per TCO_COMPONENTS entry */
  tco: number[][];
  tcoCumulative: number[];
  tcoCumulativePrevious: number[];
  tcoTotal: number;
  categoryCosts: CategoryCost[];
  depreciation: number[];
  accumulated: number[];
  depreciationPrevious: number[];
  costCenters: CostCenterRow[];
  budget: number;
  spend: number;
  budgetUtilization: number | null;
  budgetTarget: number;
  maintenanceRatioLimit: number;
  utilizationThreshold: number;
  siteMaintenance: SiteMaintenance[];
  assets: CostAsset[];
  assetTotal: number;
  capexRequests: CapexRequest[];
  disposals: DisposalCandidate[];
}

const emptyKpi = (): FinancialKpi => ({ value: 0, previous: 0, change: null });

/** The page before the first response (and after a failed one): no figures. */
export function emptyFinancial(): FinancialView {
  return {
    generatedAt: null,
    labels: [],
    caption: '',
    totalAssetValue: emptyKpi(),
    maintenance: emptyKpi(),
    capex: emptyKpi(),
    opex: emptyKpi(),
    netBookValue: emptyKpi(),
    tco: TCO_COMPONENTS.map(() => []),
    tcoCumulative: [],
    tcoCumulativePrevious: [],
    tcoTotal: 0,
    categoryCosts: [],
    depreciation: [],
    accumulated: [],
    depreciationPrevious: [],
    costCenters: [],
    budget: 0,
    spend: 0,
    budgetUtilization: null,
    budgetTarget: BUDGET_TARGET,
    maintenanceRatioLimit: MAINTENANCE_RATIO_LIMIT,
    utilizationThreshold: 25,
    siteMaintenance: [],
    assets: [],
    assetTotal: 0,
    capexRequests: [],
    disposals: []
  };
}
