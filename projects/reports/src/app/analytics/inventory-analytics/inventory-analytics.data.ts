import { RA_COLORS } from '../shared/charts/chart-utils';

// View models for the Inventory Analytics page. Every figure comes from /api/inventory-analytics (inventory-analytics.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_WAREHOUSES = 'All warehouses';
export const ALL_STORES = 'All stores / bins';
export const ALL_CATEGORIES = 'All categories';
export const ALL_STATUSES = 'All stock status';

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const IA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const IA_DEFAULT_PERIOD = 'This year';

/** Stock statuses used until /options answers (InventoryAnalyticsCalculator.StockStatuses, worked out from quantity vs reorder level / max stock). */
export const STOCK_STATUSES = ['In Stock', 'Below Reorder', 'Out of Stock', 'Overstocked'];
export const STOCK_STATUS_COLORS: Record<string, string> = {
  'In Stock': RA_COLORS.green, 'Below Reorder': RA_COLORS.orange, 'Out of Stock': RA_COLORS.red, Overstocked: RA_COLORS.violet
};
export const CATEGORY_PALETTE = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.green, RA_COLORS.teal, RA_COLORS.violet, RA_COLORS.sky, RA_COLORS.grey];

export type Risk = 'High' | 'Medium' | 'Low';

export interface Warehouse {
  code: string;
  name: string;
  site: string;
  /** Units held over bin capacity (or over max stock); null when neither is recorded */
  utilization: number | null;
  utilizationBasis: string | null;
  items: number;
  units: number;
  value: number;
  belowReorder: number;
  stores: string[];
  keeper: string;
}

/** An item at or below its reorder level (API InventoryReorderRow). */
export interface ReorderItem {
  key: string;
  code: string;
  name: string;
  category: string;
  /** Warehouse code */
  warehouse: string;
  warehouseName: string;
  store: string;
  site: string;
  available: number;
  reorderLevel: number;
  suggestedQty: number;
  dailyUsage: number | null;
  /** Days of stock left at the recent usage rate; null without usage history */
  daysCover: number | null;
  /** daysCover for sorting (no usage history sorts last) */
  coverRank: number;
  supplier: string;
  risk: Risk;
  /** Rank for sorting by risk (High first) */
  riskRank: number;
  critical: boolean;
  unitCost: number;
}

export interface SlowItem {
  code: string;
  name: string;
  category: string;
  warehouseName: string;
  store: string;
  site: string;
  quantity: number;
  value: number;
  daysSinceIssue: number | null;
}

export interface Supplier {
  name: string;
  code: string;
  category: string;
  items: number;
  stockValue: number;
  belowReorder: number;
  rating: number | null;
  preferred: boolean;
}

/** A KPI with the previous period's value (null when the API has nothing to compare with). */
export interface IaKpi {
  value: number | null;
  previous: number | null;
  change: number | null;
}

export interface InventoryView {
  generatedAt: string | null;
  previousFromUtc: string | null;
  previousToUtc: string | null;
  /** Month labels of the period ("Jan\n2026") */
  labels: string[];
  totalValueKpi: IaKpi;
  stockItemsKpi: IaKpi;
  turnoverKpi: IaKpi;
  belowReorderKpi: IaKpi;
  accuracyKpi: IaKpi;
  stockItems: number;
  totalUnits: number;
  /** Value issued per month (AED) */
  issues: number[];
  issuedValue: number;
  categories: { name: string; items: number; units: number; value: number }[];
  statusCounts: { name: string; count: number }[];
  /** Units issued per month by consuming department */
  consumption: { name: string; values: number[] }[];
  warehouses: Warehouse[];
  reorderItems: ReorderItem[];
  reorderTotal: number;
  criticalAtRisk: ReorderItem[];
  slowItems: SlowItem[];
  slowTotal: number;
  slowValue: number;
  slowDays: number;
  suppliers: Supplier[];
}

const emptyKpi = (): IaKpi => ({ value: null, previous: null, change: null });

/** The page before the first answer, or when nothing is recorded for the filters. */
export function emptyInventory(): InventoryView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    labels: [],
    totalValueKpi: emptyKpi(),
    stockItemsKpi: emptyKpi(),
    turnoverKpi: emptyKpi(),
    belowReorderKpi: emptyKpi(),
    accuracyKpi: emptyKpi(),
    stockItems: 0,
    totalUnits: 0,
    issues: [],
    issuedValue: 0,
    categories: [],
    statusCounts: [],
    consumption: [],
    warehouses: [],
    reorderItems: [],
    reorderTotal: 0,
    criticalAtRisk: [],
    slowItems: [],
    slowTotal: 0,
    slowValue: 0,
    slowDays: 180,
    suppliers: []
  };
}
