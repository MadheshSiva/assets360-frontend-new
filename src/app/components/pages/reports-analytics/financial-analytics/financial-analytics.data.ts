import { RA_CATEGORIES, assetId, money } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { RA_COLORS } from '../shared/charts/chart-utils';
import { PeriodWindow, flowSeries, levelSeries, periodWindow, siteInScope, sumOf } from '../inventory-analytics/parts/ra-parts';

// DEMO MODE: financial analytics computed from per-site / per-category sample data. Amounts are held in AED and
// converted for display. At "All" filters for 01 Jan – 28 Oct 2026 the totals match RA_METRICS.financial / .maintenance.

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

// ===== Sites =====

export const SITE_CODES: Record<string, string> = {
  'Dubai HQ': 'DXB', 'Abu Dhabi Office': 'AUH', 'Sharjah Facility': 'SHJ', 'Jebel Ali Warehouse': 'JEA',
  'Riyadh Office': 'RUH', 'Al Ain Depot': 'AAN', 'London Office': 'LON', 'Singapore Office': 'SIN'
};

interface SiteCost {
  site: string;
  /** Share of group asset base and spend */
  share: number;
  /** Maintenance mix: labour, parts, contractor */
  mix: [number, number, number];
}

const SITES: SiteCost[] = [
  { site: 'Dubai HQ', share: 0.28, mix: [0.46, 0.34, 0.2] },
  { site: 'Jebel Ali Warehouse', share: 0.2, mix: [0.4, 0.38, 0.22] },
  { site: 'Abu Dhabi Office', share: 0.18, mix: [0.44, 0.33, 0.23] },
  { site: 'Sharjah Facility', share: 0.15, mix: [0.48, 0.32, 0.2] },
  { site: 'Riyadh Office', share: 0.11, mix: [0.38, 0.3, 0.32] },
  { site: 'Al Ain Depot', share: 0.05, mix: [0.5, 0.35, 0.15] },
  { site: 'London Office', share: 0.02, mix: [0.6, 0.2, 0.2] },
  { site: 'Singapore Office', share: 0.01, mix: [0.6, 0.2, 0.2] }
];

/** Share of cost by asset category (same order as RA_CATEGORIES) */
const CATEGORY_SHARE = [0.32, 0.28, 0.18, 0.12, 0.045, 0.04, 0.015];
export const CATEGORY_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal, RA_COLORS.grey];

// ===== 12-month series (Nov 2025 – Oct 2026) =====

const YTD = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Scales a seasonal shape so Jan – Oct adds up to the year-to-date total. */
function shaped(ytdTotal: number, shape: number[]): number[] {
  const k = ytdTotal / sumOf(YTD.map((m) => shape[m]));
  return shape.map((s) => s * k);
}

export const TCO_COMPONENTS = ['Acquisition', 'Maintenance', 'Operating & Energy', 'Depreciation', 'Downtime', 'Disposal'];
export const TCO_COLORS = [RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.pink, RA_COLORS.teal];
const TCO: number[][] = [
  shaped(RA_METRICS.financial.capex, [0.7, 1.2, 0.6, 0.7, 0.9, 0.8, 1, 1.1, 0.9, 1.2, 1.3, 1.5]),
  shaped(RA_METRICS.maintenance.cost, [0.9, 0.92, 0.88, 0.9, 0.95, 0.97, 1, 1.02, 1.05, 1.07, 1.08, 1.1]),
  shaped(RA_METRICS.financial.opex, [0.95, 0.97, 0.94, 0.96, 0.97, 0.99, 1.02, 1.04, 1.03, 1.01, 1.02, 1.04]),
  shaped(4_620_000, [0.97, 0.98, 0.98, 0.99, 0.99, 1, 1, 1, 1.01, 1.01, 1.02, 1.03]),
  shaped(620_000, [1.1, 0.9, 1, 0.8, 1.2, 0.9, 1.1, 1, 0.9, 1, 1.1, 1]),
  shaped(220_000, [0.5, 2, 0.6, 0.8, 1.4, 0.7, 1, 1.2, 0.6, 1.6, 0.9, 1.2])
];
const DEPRECIATION = TCO[3];

/** Gross asset value at month end */
const ASSET_VALUE = [39.6, 40.1, 40.3, 40.6, 41, 41.3, 41.6, 41.9, 42.1, 42.3, 42.5, 42.8].map((v) => v * 1_000_000);
/** Accumulated depreciation at month end; Oct 2026 = asset value − net book value */
const ACC_DEPRECIATION = (() => {
  const end = RA_METRICS.financial.totalAssetValue - RA_METRICS.financial.netBookValue;
  const out: number[] = [];
  let acc = end;
  for (let m = 11; m >= 0; m--) {
    out[m] = acc;
    acc -= DEPRECIATION[m];
  }
  return out;
})();

// ===== Cost centers =====

export interface CostCenter {
  code: string;
  name: string;
  /** Budget and actual for Jan – Oct 2026, AED */
  budget: number;
  actual: number;
  /** TCO component the actual follows month by month (-1 = flat) */
  driver: number;
}

export const COST_CENTERS: CostCenter[] = [
  { code: 'CC-100', name: 'Maintenance', budget: RA_METRICS.maintenance.budget, actual: RA_METRICS.maintenance.cost, driver: 1 },
  { code: 'CC-200', name: 'Operations', budget: 2_860_000, actual: RA_METRICS.financial.opex, driver: 2 },
  { code: 'CC-300', name: 'Inventory', budget: 2_000_000, actual: 1_800_000, driver: -1 },
  { code: 'CC-400', name: 'Projects', budget: 9_050_000, actual: RA_METRICS.financial.capex, driver: 0 },
  { code: 'CC-500', name: 'Facilities', budget: 2_370_000, actual: 2_460_000, driver: -1 }
];
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

function costAsset(n: number, name: string, category: string, site: string, acquisition: number, maintenance: number, depreciation: number, hours: number, plannedTco: number): CostAsset {
  const tco = acquisition + maintenance + depreciation;
  return {
    id: assetId(SITE_CODES[site], n), name, category, site, acquisition, maintenance, depreciation, tco, hours,
    costPerHour: Math.round((tco / hours) * 100) / 100, plannedTco, lifecyclePct: Math.round((tco / plannedTco) * 100)
  };
}

export const COST_ASSETS: CostAsset[] = [
  costAsset(124, 'Haul Truck HT-01', 'Vehicles', 'Jebel Ali Warehouse', 2_800_000, 620_000, 1_120_000, 77_873, 3_600_000),
  costAsset(356, 'Excavator EX-07', 'Machinery', 'Sharjah Facility', 1_950_000, 480_000, 760_000, 61_229, 2_490_000),
  costAsset(218, 'Generator G3 500 kVA', 'Power & Electrical', 'Dubai HQ', 1_200_000, 310_000, 480_000, 40_862, 2_100_000),
  costAsset(901, 'Main Facility BMS & Chillers', 'Facilities', 'Abu Dhabi Office', 3_500_000, 410_000, 1_260_000, 111_905, 5_400_000),
  costAsset(433, 'Forklift FL-12', 'Vehicles', 'Riyadh Office', 450_000, 120_000, 180_000, 21_186, 820_000),
  costAsset(512, 'CNC Machining Centre CM-02', 'Machinery', 'Sharjah Facility', 1_650_000, 290_000, 560_000, 52_000, 2_700_000),
  costAsset(247, 'Data Centre UPS Cluster', 'IT Equipment', 'Dubai HQ', 980_000, 140_000, 420_000, 70_000, 1_700_000),
  costAsset(318, 'Rooftop Chiller CH-03', 'HVAC', 'Abu Dhabi Office', 760_000, 210_000, 300_000, 43_000, 1_200_000),
  costAsset(605, 'Mobile Crane MC-02', 'Vehicles', 'Al Ain Depot', 1_400_000, 360_000, 590_000, 30_500, 1_900_000),
  costAsset(77, 'Server Rack SR-11', 'IT Equipment', 'London Office', 420_000, 60_000, 210_000, 60_000, 760_000),
  costAsset(689, 'Fire Suppression System', 'Safety & PPE', 'Jebel Ali Warehouse', 380_000, 90_000, 150_000, 45_000, 700_000),
  costAsset(742, 'Air Compressor AC-05', 'Machinery', 'Riyadh Office', 520_000, 160_000, 210_000, 26_000, 960_000)
];
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

export const CAPEX_REQUESTS: CapexRequest[] = [
  { ref: 'CPX-2026-0142', title: 'Haul Truck HT-01 engine replacement', site: 'Jebel Ali Warehouse', category: 'Vehicles', amount: 420_000, requestedBy: 'Omar Hassan', submitted: '2026-10-14' },
  { ref: 'CPX-2026-0145', title: 'Rooftop Chiller CH-03 replacement', site: 'Abu Dhabi Office', category: 'HVAC', amount: 365_000, requestedBy: 'Priya Sharma', submitted: '2026-10-18' },
  { ref: 'CPX-2026-0147', title: 'UPS battery string upgrade', site: 'Dubai HQ', category: 'IT Equipment', amount: 240_000, requestedBy: 'James Tan', submitted: '2026-10-21' },
  { ref: 'CPX-2026-0151', title: 'Forklift FL-12 replacement', site: 'Riyadh Office', category: 'Vehicles', amount: 175_000, requestedBy: 'Mohammed Ali', submitted: '2026-10-24' }
];

export interface DisposalCandidate {
  id: string;
  name: string;
  category: string;
  site: string;
  utilization: number;
  recoverable: number;
}

export const DISPOSAL_CANDIDATES: DisposalCandidate[] = [
  { id: assetId('SHJ', 207), name: 'Forklift FL-07', category: 'Vehicles', site: 'Sharjah Facility', utilization: 18, recoverable: 96_000 },
  { id: assetId('AAN', 114), name: 'Diesel Generator G1', category: 'Power & Electrical', site: 'Al Ain Depot', utilization: 9, recoverable: 112_000 },
  { id: assetId('DXB', 538), name: 'Pickup Truck PT-22', category: 'Vehicles', site: 'Dubai HQ', utilization: 21, recoverable: 74_000 },
  { id: assetId('SHJ', 361), name: 'Lathe Machine LM-03', category: 'Machinery', site: 'Sharjah Facility', utilization: 12, recoverable: 88_000 },
  { id: assetId('AUH', 829), name: 'Desktop Fleet (32 units)', category: 'IT Equipment', site: 'Abu Dhabi Office', utilization: 15, recoverable: 50_000 }
];

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
  const scope = siteShare * (c < 0 ? 1 : CATEGORY_SHARE[c]);

  const tco = TCO.map((series) => flowSeries(series, w, scope));
  const perPoint = tco[0].map((_, i) => sumOf(tco.map((s) => s[i])));
  let run = 0;
  const tcoCumulative = perPoint.map((v) => (run += v));
  const tcoTotal = sumOf(perPoint);

  // Category split of the period's TCO; outside the top four categories is grouped as "Other"
  const shares = RA_CATEGORIES.map((_, i) => (c < 0 || c === i ? CATEGORY_SHARE[i] : 0));
  const shareSum = sumOf(shares) || 1;
  const byCat = RA_CATEGORIES.map((name, i) => ({ name, value: (tcoTotal * shares[i]) / shareSum, color: CATEGORY_COLORS[i] }));
  const categoryCosts = c < 0 ? [...byCat.slice(0, 4), { name: 'Other', value: sumOf(byCat.slice(4).map((x) => x.value)), color: RA_COLORS.pink }] : [byCat[c]];

  // Cost centers follow their driving component through the period; budgets are phased evenly by month
  const ytdOf = (k: number) => sumOf(YTD.map((m) => TCO[k][m]));
  const costCenters: CostCenterRow[] = COST_CENTERS.filter((cc) => f.costCenter === ALL_COST_CENTERS || f.costCenter === `${cc.code} ${cc.name}`).map((cc) => {
    const phase = cc.driver < 0 ? w.monthCount / 10 : sumOf(flowSeries(TCO[cc.driver], w)) / ytdOf(cc.driver);
    const actual = cc.actual * phase * scope;
    const budget = cc.budget * (w.monthCount / 10) * scope;
    const utilization = budget ? (actual / budget) * 100 : 0;
    return {
      code: cc.code, name: cc.name, budget, actual, variance: actual - budget, utilization,
      status: utilization > 105 ? 'Over Budget' : utilization > 100 ? 'At Risk' : 'On Track'
    };
  });

  const maintenanceTotal = sumOf(tco[1]);
  const siteMaintenance = sites.map((s) => {
    const total = siteShare ? (maintenanceTotal * s.share) / siteShare : 0;
    return { site: s.site, labour: total * s.mix[0], parts: total * s.mix[1], contractor: total * s.mix[2], total };
  });

  const assetInScope = (a: { site: string; category: string }) => sites.some((s) => s.site === a.site) && (c < 0 || a.category === f.category);
  const value = levelSeries(ASSET_VALUE, w, scope);
  const acc = levelSeries(ACC_DEPRECIATION, w, scope);

  return {
    window: w,
    hasScope: scope > 0,
    totalAssetValue: value[value.length - 1],
    maintenance: maintenanceTotal,
    capex: sumOf(tco[0]),
    opex: sumOf(tco[2]),
    netBookValue: value[value.length - 1] - acc[acc.length - 1],
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
