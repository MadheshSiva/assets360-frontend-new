import { RA_COLORS } from '../shared/charts/chart-utils';
import { PeriodWindow, periodWindow, siteInScope, sumOf } from './parts/ra-parts';

// Inventory analytics: warehouses, stores, item rows, suppliers and the monthly value / unit series come from the
// inventory API. No data source is wired yet, so everything starts empty and each widget shows its empty state.

export const INV_CATEGORIES = ['Spare Parts', 'Consumables', 'Tools', 'Safety & PPE', 'Raw Materials'];
export const INV_CATEGORY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.green];
export const STOCK_STATUSES = ['Available', 'Reserved', 'On Order', 'Quarantined', 'Obsolete'];
export const STOCK_STATUS_COLORS = [RA_COLORS.green, RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.red];
export interface Warehouse {
  code: string;
  name: string;
  site: string;
  /** Share of group stock held here */
  share: number;
  utilization: number;
  accuracy: number;
  turnover: number;
  belowReorder: number;
  keeper: string;
}

export const WAREHOUSES: Warehouse[] = [];

export interface Store {
  code: string;
  name: string;
  warehouse: string;
  /** Share of the warehouse's stock */
  share: number;
}

export const STORES: Store[] = [];

export type Risk = 'High' | 'Medium' | 'Low';

export interface ReorderItem {
  code: string;
  name: string;
  category: string;
  warehouse: string;
  warehouseName: string;
  store: string;
  site: string;
  available: number;
  reorderLevel: number;
  leadTime: number;
  supplier: string;
  daysCover: number;
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
  daysSinceIssue: number;
}

/** Items below reorder level */
export const REORDER_ITEMS: ReorderItem[] = [];

/** Items not issued for 180+ days */
export const SLOW_ITEMS: SlowItem[] = [];

export interface Supplier {
  name: string;
  category: string;
  items: number;
  onTime: number;
  fillRate: number;
  openPos: number;
}

const SUPPLIERS: Supplier[] = [];

// ===== View for the current filters =====

export interface InventoryFilters {
  period: string;
  organization: string;
  location: string;
  warehouse: string;
  store: string;
  category: string;
  status: string;
}

export interface InventoryView {
  window: PeriodWindow;
  hasScope: boolean;
  totalValue: number;
  stockItems: number;
  turnover: number;
  belowReorder: number;
  accuracy: number;
  opening: number[];
  receipts: number[];
  issues: number[];
  closing: number[];
  /** Units per category per period point */
  categoryStacks: number[][];
  categories: string[];
  categoryColors: string[];
  statusCounts: number[];
  statuses: string[];
  statusColors: string[];
  consumption: { name: string; values: number[] }[];
  warehouses: Warehouse[];
  reorderItems: ReorderItem[];
  slowItems: SlowItem[];
  slowValue: number;
  criticalAtRisk: ReorderItem[];
  suppliers: Supplier[];
}

export const ALL_WAREHOUSES = 'All warehouses';
export const ALL_STORES = 'All stores / bins';
export const ALL_CATEGORIES = 'All categories';
export const ALL_STATUSES = 'All stock status';

function weighted(list: Warehouse[], pick: (w: Warehouse) => number): number {
  const total = sumOf(list.map((w) => w.share));
  return total ? sumOf(list.map((w) => w.share * pick(w))) / total : 0;
}

export function buildInventoryView(f: InventoryFilters): InventoryView {
  const w = periodWindow(f.period);
  const whs = WAREHOUSES.filter((x) => siteInScope(x.site, f.organization, f.location) && (f.warehouse === ALL_WAREHOUSES || f.warehouse === x.name));
  const store = STORES.find((s) => s.name === f.store) ?? null;
  const c = INV_CATEGORIES.indexOf(f.category);

  // Value flow, unit and consumption series are not available until a data source is wired
  const closing: number[] = [];
  const categoryStacks = INV_CATEGORIES.map(() => [] as number[]);
  const statusCounts = STOCK_STATUSES.map(() => 0);
  const stockItems = 0;

  const inScope = (row: { site: string; category: string; store: string }) =>
    whs.some((x) => x.site === row.site) && (c < 0 || row.category === f.category) && (!store || row.store === store.name);
  const reorderItems = REORDER_ITEMS.filter(inScope);
  const slowItems = SLOW_ITEMS.filter(inScope);
  const suppliers = SUPPLIERS.filter((x) => c < 0 || x.category === f.category);

  return {
    window: w,
    hasScope: whs.length > 0,
    totalValue: closing[closing.length - 1] ?? 0,
    stockItems,
    turnover: 0,
    belowReorder: reorderItems.length,
    accuracy: weighted(whs, (x) => x.accuracy),
    opening: [],
    receipts: [],
    issues: [],
    closing,
    categoryStacks,
    categories: INV_CATEGORIES,
    categoryColors: INV_CATEGORY_COLORS,
    statusCounts,
    statuses: STOCK_STATUSES,
    statusColors: STOCK_STATUS_COLORS,
    consumption: [],
    warehouses: whs,
    reorderItems,
    slowItems,
    slowValue: sumOf(slowItems.map((x) => x.value)),
    criticalAtRisk: reorderItems.filter((x) => x.critical && x.daysCover < 7),
    suppliers
  };
}
