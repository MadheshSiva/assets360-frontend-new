import { AP_REGISTER, ApRegisterAsset } from '../asset-performance/asset-performance.data';
import { CURRENT, DEMO_PERIODS, HISTORY, rnd, rndInt } from '../asset-performance/kit/demo-data';
import { money } from '../shared/analytics-common';
import { RA_COLORS } from '../shared/charts/chart-utils';

// Financial Analytics view model and its DEMO MODE cost register (aggregated in financial-analytics.service.ts).
// Amounts are held in the base currency (AED) and converted for display.

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

/** TCO components reported month by month (acquisition / CAPEX and maintenance spend). */
export const TCO_COMPONENTS = ['Acquisition', 'Maintenance'];
export const TCO_COLORS = [RA_COLORS.blue, RA_COLORS.green];
export const CATEGORY_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal, RA_COLORS.grey];

export const BUDGET_TARGET = 90;
/** Maintenance to date above this share of acquisition cost flags an asset for repair-vs-replace review. */
export const MAINTENANCE_RATIO_LIMIT = 50;

export const ALL_CATEGORIES = 'All categories';
export const ALL_COST_CENTERS = 'All cost centers';
export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const FA_DEFAULT_PERIOD = 'This year';
export const FA_FALLBACK_PERIODS = DEMO_PERIODS;

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

/** The page before the first load: no figures. */
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
    utilizationThreshold: 35,
    siteMaintenance: [],
    assets: [],
    assetTotal: 0,
    capexRequests: [],
    disposals: []
  };
}

// ----- DEMO MODE cost register -----

export interface CostCenterDef {
  code: string;
  name: string;
  /** Annual budget as a share of the cost center's 12-month spend (above 1 = headroom) */
  budgetFactor: number;
}

export const COST_CENTERS: CostCenterDef[] = [
  { code: 'CC-1100', name: 'Fleet & Logistics', budgetFactor: 0.96 },
  { code: 'CC-1200', name: 'Plant & Machinery', budgetFactor: 1.08 },
  { code: 'CC-1300', name: 'Facilities Management', budgetFactor: 1.14 },
  { code: 'CC-1400', name: 'IT Infrastructure', budgetFactor: 1.02 },
  { code: 'CC-1500', name: 'Power & Utilities', budgetFactor: 1.22 },
  { code: 'CC-1600', name: 'HSE', budgetFactor: 0.91 }
];

const COST_CENTER_OF: Record<string, string> = {
  Vehicles: 'CC-1100', Machinery: 'CC-1200', Facilities: 'CC-1300', HVAC: 'CC-1300', 'IT Equipment': 'CC-1400', 'Power & Electrical': 'CC-1500', 'Safety & PPE': 'CC-1600'
};

/** Acquisition cost range (AED), useful life (months) and monthly maintenance as a share of acquisition cost, per category. */
const CATEGORY_FINANCE: Record<string, { min: number; max: number; life: number; maintenance: number }> = {
  Vehicles: { min: 95_000, max: 260_000, life: 84, maintenance: 0.0055 },
  Machinery: { min: 120_000, max: 480_000, life: 120, maintenance: 0.0045 },
  Facilities: { min: 180_000, max: 650_000, life: 240, maintenance: 0.0016 },
  'IT Equipment': { min: 18_000, max: 140_000, life: 60, maintenance: 0.002 },
  HVAC: { min: 220_000, max: 900_000, life: 180, maintenance: 0.003 },
  'Power & Electrical': { min: 150_000, max: 750_000, life: 180, maintenance: 0.0025 },
  'Safety & PPE': { min: 6_000, max: 45_000, life: 60, maintenance: 0.0035 }
};

/** An asset's costs: acquisition, depreciation schedule and monthly maintenance over the demo timeline. */
export interface FinanceAsset {
  asset: ApRegisterAsset;
  costCenter: string;
  acquisition: number;
  /** Timeline month it was bought (negative = before the timeline starts) */
  acquiredIndex: number;
  usefulLifeMonths: number;
  /** Maintenance spent before the timeline starts */
  priorMaintenance: number;
  /** Maintenance per timeline month (0 before it was bought) */
  monthlyMaintenance: number[];
}

function buildFinance(): FinanceAsset[] {
  return AP_REGISTER.map((asset, k) => {
    const c = CATEGORY_FINANCE[asset.category];
    const acquisition = Math.round((c.min + rnd(k, 81) * (c.max - c.min)) / 500) * 500;
    // About a quarter of the register was bought during the last two years
    const ago = rnd(k, 82) < 0.27 ? rndInt(k, 83, 0, HISTORY - 1) : rndInt(k, 84, HISTORY, Math.min(c.life + 30, 130));
    const acquiredIndex = CURRENT - ago;
    const wear = 1 + Math.max(0, 70 - (asset.health ?? 70)) / 35;
    const base = acquisition * c.maintenance * wear;
    const monthlyMaintenance = Array.from({ length: HISTORY }, (_, m) =>
      m < acquiredIndex ? 0 : Math.round(base * (0.7 + rnd(k * 31 + m, 85) * 0.6) * (1 + Math.max(0, m - acquiredIndex) / 240)));
    const priorMonths = Math.max(0, -acquiredIndex);
    return {
      asset,
      costCenter: COST_CENTER_OF[asset.category],
      acquisition,
      acquiredIndex,
      usefulLifeMonths: c.life,
      priorMaintenance: Math.round(base * priorMonths * 0.9),
      monthlyMaintenance
    };
  });
}

export const FINANCE_REGISTER: FinanceAsset[] = buildFinance();

/** CAPEX requests waiting for approval. Submitted = days before today. */
export const CAPEX_REQUESTS: (Omit<CapexRequest, 'submitted' | 'status'> & { costCenter: string; daysAgo: number })[] = [
  { ref: 'CPX-2026-0142', title: 'Replace Carrier chiller CH-02', site: 'Dubai HQ', category: 'HVAC', costCenter: 'CC-1300', amount: 685_000, requestedBy: 'Omar Hassan', daysAgo: 4 },
  { ref: 'CPX-2026-0145', title: 'Five electric forklifts for Jebel Ali', site: 'Jebel Ali Warehouse', category: 'Machinery', costCenter: 'CC-1200', amount: 940_000, requestedBy: 'Aisha Rahman', daysAgo: 6 },
  { ref: 'CPX-2026-0147', title: 'Fleet renewal – 4 pickups', site: 'Al Ain Depot', category: 'Vehicles', costCenter: 'CC-1100', amount: 612_000, requestedBy: 'Mohammed Ali', daysAgo: 9 },
  { ref: 'CPX-2026-0151', title: 'Core network switch refresh', site: 'Abu Dhabi Office', category: 'IT Equipment', costCenter: 'CC-1400', amount: 238_500, requestedBy: 'Daniel Kim', daysAgo: 11 },
  { ref: 'CPX-2026-0153', title: '1 MVA standby generator', site: 'Riyadh Office', category: 'Power & Electrical', costCenter: 'CC-1500', amount: 529_000, requestedBy: 'Rahul Mehta', daysAgo: 14 },
  { ref: 'CPX-2026-0156', title: 'Fire alarm panel upgrade', site: 'Sharjah Facility', category: 'Safety & PPE', costCenter: 'CC-1600', amount: 164_000, requestedBy: 'Fatima Noor', daysAgo: 17 },
  { ref: 'CPX-2026-0158', title: 'Passenger lift modernisation', site: 'London Office', category: 'Facilities', costCenter: 'CC-1300', amount: 412_000, requestedBy: 'James Wilson', daysAgo: 21 }
];
