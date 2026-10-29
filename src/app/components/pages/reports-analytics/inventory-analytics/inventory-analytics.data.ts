import { RA_COLORS } from '../shared/charts/chart-utils';
import { RA_METRICS } from '../shared/analytics-metrics';
import { PeriodWindow, flowSeries, levelSeries, periodWindow, seeded, siteInScope, splitTotal, sumOf } from './parts/ra-parts';

// DEMO MODE: inventory analytics computed from seeded per-warehouse sample data (no Math.random, same on every load).
// Group totals at "All" filters for 01 Jan – 28 Oct 2026 match RA_METRICS.inventory.

export const INV_CATEGORIES = ['Spare Parts', 'Consumables', 'Tools', 'Safety & PPE', 'Raw Materials'];
export const INV_CATEGORY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.green];
/** Share of units on hand and of stock value per category */
const CAT_UNIT_SHARE = [0.38, 0.24, 0.14, 0.12, 0.12];
const CAT_VALUE_SHARE = [0.46, 0.12, 0.14, 0.08, 0.2];
/** Consumables turn fastest, tools slowest */
const CAT_TURNOVER = [0.8, 1.45, 0.7, 1.2, 1.1];

export const STOCK_STATUSES = ['Available', 'Reserved', 'On Order', 'Quarantined', 'Obsolete'];
export const STOCK_STATUS_COLORS = [RA_COLORS.green, RA_COLORS.blue, RA_COLORS.violet, RA_COLORS.orange, RA_COLORS.red];
const STATUS_COUNTS = [5227, 1516, 842, 505, 336];
const TOTAL_ITEMS = sumOf(STATUS_COUNTS); // 8,426

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

export const WAREHOUSES: Warehouse[] = [
  { code: 'WH-001', name: 'Main Warehouse', site: 'Dubai HQ', share: 0.3, utilization: 72, accuracy: 97.9, turnover: 1.05, belowReorder: 56, keeper: 'Ahmed Khan' },
  { code: 'WH-002', name: 'Spare Parts Warehouse', site: 'Jebel Ali Warehouse', share: 0.24, utilization: 88, accuracy: 96.8, turnover: 0.85, belowReorder: 45, keeper: 'Rahul Mehta' },
  { code: 'WH-003', name: 'Maintenance Warehouse', site: 'Abu Dhabi Office', share: 0.18, utilization: 92, accuracy: 97.6, turnover: 1.1, belowReorder: 33, keeper: 'Omar Hassan' },
  { code: 'WH-004', name: 'Project Site Warehouse', site: 'Sharjah Facility', share: 0.12, utilization: 68, accuracy: 97.2, turnover: 1, belowReorder: 22, keeper: 'Priya Sharma' },
  { code: 'WH-005', name: 'Riyadh Central Store', site: 'Riyadh Office', share: 0.1, utilization: 64, accuracy: 96.9, turnover: 0.95, belowReorder: 19, keeper: 'Mohammed Ali' },
  { code: 'WH-006', name: 'Al Ain Depot Store', site: 'Al Ain Depot', share: 0.06, utilization: 58, accuracy: 98.1, turnover: 1, belowReorder: 11, keeper: 'Fatima Noor' }
];

export interface Store {
  code: string;
  name: string;
  warehouse: string;
  /** Share of the warehouse's stock */
  share: number;
}

export const STORES: Store[] = [
  { code: 'ST-001', name: 'Electrical Store', warehouse: 'WH-001', share: 0.35 },
  { code: 'ST-002', name: 'Mechanical Store', warehouse: 'WH-001', share: 0.4 },
  { code: 'ST-003', name: 'Consumables Store', warehouse: 'WH-001', share: 0.25 },
  { code: 'ST-006', name: 'Rotating Spares Store', warehouse: 'WH-002', share: 0.55 },
  { code: 'ST-007', name: 'Critical Spares Store', warehouse: 'WH-002', share: 0.45 },
  { code: 'ST-009', name: 'Tools Crib', warehouse: 'WH-003', share: 0.4 },
  { code: 'ST-011', name: 'HVAC Store', warehouse: 'WH-003', share: 0.6 },
  { code: 'ST-013', name: 'Site Store A', warehouse: 'WH-004', share: 0.5 },
  { code: 'ST-014', name: 'Site Store B', warehouse: 'WH-004', share: 0.5 },
  { code: 'ST-015', name: 'Riyadh Main Store', warehouse: 'WH-005', share: 1 },
  { code: 'ST-016', name: 'Al Ain Store', warehouse: 'WH-006', share: 1 }
];

// ===== 12-month group series (Nov 2025 – Oct 2026) =====

/** Month-end stock value, AED */
const CLOSING = [3.86, 3.94, 4.02, 4.08, 4.15, 4.22, 4.3, 4.38, 4.47, 4.58, 4.7, 4.82].map((v) => v * 1_000_000);
const OPENING = [3_790_000, ...CLOSING.slice(0, 11)];
/** Seasonal shape of issues; scaled so Jan – Oct turnover is exactly RA_METRICS.inventory.turnover */
const ISSUE_SHAPE = [0.96, 0.9, 0.94, 0.97, 1.02, 1, 0.98, 1.03, 1.01, 1.04, 1.06, 1.09];
const YTD = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ISSUES = (() => {
  const avgStock = sumOf(YTD.map((m) => CLOSING[m])) / YTD.length;
  const avgShape = sumOf(YTD.map((m) => ISSUE_SHAPE[m])) / YTD.length;
  return ISSUE_SHAPE.map((s) => ((RA_METRICS.inventory.turnover * avgStock) / 12) * (s / avgShape));
})();
const RECEIPTS = CLOSING.map((c, m) => c - OPENING[m] + ISSUES[m]);
/** Units on hand at month end */
const UNITS = [7480, 7560, 7640, 7710, 7790, 7860, 7950, 8040, 8130, 8230, 8330, TOTAL_ITEMS];
/** Units issued per month by consuming department */
const CONSUMPTION = {
  Maintenance: [980, 1010, 1040, 1090, 1120, 1180, 1230, 1290, 1340, 1400, 1470, 1540],
  Production: [760, 790, 820, 850, 890, 920, 960, 1000, 1050, 1090, 1140, 1190],
  Operations: [560, 570, 590, 600, 620, 640, 660, 680, 700, 720, 750, 770]
};

// ===== Item-level rows =====

const ITEM_NAMES: string[][] = [
  ['Hydraulic Pump HP-20', 'Ball Bearing 6205', 'Mechanical Seal Kit', 'V-Belt B-52', 'Gear Coupling GC-40', 'Contactor 32A', 'Pressure Switch PS-10', 'Impeller 150 mm', 'Motor Starter 15 kW', 'Gate Valve 2"'],
  ['Air Filter Element', 'Oil Filter OF-12', 'Cutting Oil 20 L', 'Hydraulic Oil 46', 'Cleaning Chemical', 'Welding Rods E6013', 'Grease Cartridge', 'Cable Ties 300 mm'],
  ['Drill Bit Set', 'Torque Wrench 1/2"', 'Insulated Screwdriver Set', 'Digital Multimeter', 'Pipe Wrench 18"', 'Socket Set 3/8"'],
  ['Safety Gloves', 'Safety Helmet', 'Safety Goggles', 'Hi-Vis Vest', 'Ear Plugs (box)', 'Safety Harness'],
  ['Steel Plate 6 mm', 'Copper Wire 2.5 mm²', 'Aluminium Sheet 2 mm', 'PVC Pipe 4"', 'Stainless Rod 12 mm', 'Paint Primer 20 L']
];
const ITEM_PREFIX = ['SP', 'CM', 'TL', 'SF', 'RM'];
const CAT_SUPPLIERS: string[][] = [
  ['Gulf HydraTech LLC', 'Arabian IndusParts'],
  ['Emirates FiltraMax', 'Delta Lubricants FZE'],
  ['Al Noor ToolPro Trading'],
  ['SafeWork Middle East'],
  ['Arabian IndusParts', 'Gulf Metals Trading']
];

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

function pickWeighted(r: number, weights: number[]): number {
  let acc = 0;
  const total = sumOf(weights);
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return i;
  }
  return weights.length - 1;
}

function storesOf(wh: string): Store[] {
  return STORES.filter((s) => s.warehouse === wh);
}

/** 186 items below reorder level spread across the warehouses */
export const REORDER_ITEMS: ReorderItem[] = (() => {
  const rnd = seeded(2026);
  const rows: ReorderItem[] = [];
  let n = 0;
  for (const wh of WAREHOUSES) {
    const stores = storesOf(wh.code);
    for (let k = 0; k < wh.belowReorder; k++, n++) {
      const c = pickWeighted(rnd(), CAT_UNIT_SHARE);
      const names = ITEM_NAMES[c];
      const name = names[Math.floor(rnd() * names.length)];
      const store = stores[pickWeighted(rnd(), stores.map((s) => s.share))];
      const reorderLevel = [10, 15, 20, 25, 30, 40, 50][Math.floor(rnd() * 7)];
      const available = Math.floor(reorderLevel * rnd() * 0.9);
      const leadTime = [5, 7, 10, 14, 21, 28][Math.floor(rnd() * 6)];
      const dailyUse = Math.max(0.5, (reorderLevel / leadTime) * (0.6 + rnd() * 0.6));
      const daysCover = Math.round((available / dailyUse) * 10) / 10;
      const risk: Risk = daysCover < leadTime * 0.5 ? 'High' : daysCover < leadTime ? 'Medium' : 'Low';
      const suppliers = CAT_SUPPLIERS[c];
      rows.push({
        code: `${ITEM_PREFIX[c]}-${String(1040 + ((n * 37) % 8900)).padStart(6, '0')}`,
        name,
        category: INV_CATEGORIES[c],
        warehouse: wh.code,
        warehouseName: wh.name,
        store: store.name,
        site: wh.site,
        available,
        reorderLevel,
        leadTime,
        supplier: suppliers[Math.floor(rnd() * suppliers.length)],
        daysCover,
        risk,
        riskRank: risk === 'High' ? 0 : risk === 'Medium' ? 1 : 2,
        critical: c === 0 && n % 5 === 2,
        unitCost: Math.round(40 + rnd() * 2400)
      });
    }
  }
  return rows;
})();

/** 412 items not issued for 180+ days, worth AED 240K in total */
export const SLOW_ITEMS: SlowItem[] = (() => {
  const rnd = seeded(180);
  const counts = splitTotal(412, WAREHOUSES.map((w) => w.share));
  const draft: (Omit<SlowItem, 'value'> & { w: number })[] = [];
  WAREHOUSES.forEach((wh, i) => {
    const stores = storesOf(wh.code);
    for (let k = 0; k < counts[i]; k++) {
      const c = pickWeighted(rnd(), CAT_UNIT_SHARE);
      const names = ITEM_NAMES[c];
      draft.push({
        code: `${ITEM_PREFIX[c]}-${String(2300 + ((draft.length * 53) % 7600)).padStart(6, '0')}`,
        name: names[Math.floor(rnd() * names.length)],
        category: INV_CATEGORIES[c],
        warehouseName: wh.name,
        store: stores[Math.floor(rnd() * stores.length)].name,
        site: wh.site,
        quantity: 1 + Math.floor(rnd() * 24),
        daysSinceIssue: 180 + Math.floor(rnd() * 360),
        w: 0.3 + rnd() * 1.4
      });
    }
  });
  const values = splitTotal(240_000, draft.map((d) => d.w));
  return draft.map((d, i) => ({
    code: d.code, name: d.name, category: d.category, warehouseName: d.warehouseName, store: d.store, site: d.site,
    quantity: d.quantity, daysSinceIssue: d.daysSinceIssue, value: values[i]
  }));
})();

export interface Supplier {
  name: string;
  category: string;
  items: number;
  onTime: number;
  fillRate: number;
  openPos: number;
}

const SUPPLIERS: Supplier[] = [
  { name: 'Gulf HydraTech LLC', category: 'Spare Parts', items: 1245, onTime: 98, fillRate: 96, openPos: 12 },
  { name: 'Emirates FiltraMax', category: 'Consumables', items: 982, onTime: 95, fillRate: 92, openPos: 8 },
  { name: 'Al Noor ToolPro Trading', category: 'Tools', items: 864, onTime: 94, fillRate: 90, openPos: 15 },
  { name: 'SafeWork Middle East', category: 'Safety & PPE', items: 621, onTime: 97, fillRate: 93, openPos: 6 },
  { name: 'Arabian IndusParts', category: 'Raw Materials', items: 498, onTime: 91, fillRate: 88, openPos: 9 },
  { name: 'Delta Lubricants FZE', category: 'Consumables', items: 412, onTime: 89, fillRate: 85, openPos: 5 }
];

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
  const storeShare = (wh: Warehouse) => (store ? (store.warehouse === wh.code ? store.share : 0) : 1);
  const share = sumOf(whs.map((x) => x.share * storeShare(x)));

  const c = INV_CATEGORIES.indexOf(f.category);
  const s = STOCK_STATUSES.indexOf(f.status);
  const statusF = s < 0 ? 1 : STATUS_COUNTS[s] / TOTAL_ITEMS;
  const valueF = share * (c < 0 ? 1 : CAT_VALUE_SHARE[c]) * statusF;
  const unitF = share * (c < 0 ? 1 : CAT_UNIT_SHARE[c]) * statusF;

  // Value flow: opening + receipts − issues = closing
  const closing = levelSeries(CLOSING, w, valueF);
  const firstOpening = w.weekly ? CLOSING[w.months[0] - 1] * valueF : OPENING[w.months[0]] * valueF;
  const opening = closing.map((_, i) => (i === 0 ? firstOpening : closing[i - 1]));
  const issues = flowSeries(ISSUES, w, valueF);
  const receipts = w.weekly ? closing.map((v, i) => v - opening[i] + issues[i]) : flowSeries(RECEIPTS, w, valueF);

  // Turnover = annualised issues / average stock, tilted by warehouse and category mix
  const avgStock = sumOf(closing) / Math.max(1, closing.length);
  const baseTurn = avgStock ? ((sumOf(issues) / w.monthCount) * 12) / avgStock : 0;
  const whTilt = weighted(whs, (x) => x.turnover) / weighted(WAREHOUSES, (x) => x.turnover);
  const catAvg = sumOf(CAT_TURNOVER.map((t, i) => t * CAT_VALUE_SHARE[i]));
  const catTilt = c < 0 ? 1 : CAT_TURNOVER[c] / catAvg;
  const turnover = whs.length && share ? baseTurn * whTilt * catTilt : 0;

  // Units by category; the last column is the stock-items KPI and the status donut total
  const catWeights = INV_CATEGORIES.map((_, i) => (c < 0 || c === i ? CAT_UNIT_SHARE[i] : 0));
  const unitTotals = levelSeries(UNITS, w).map((u) => Math.round(u * unitF));
  const columns = unitTotals.map((t) => splitTotal(t, catWeights));
  const categoryStacks = INV_CATEGORIES.map((_, i) => columns.map((col) => col[i]));
  const stockItems = unitTotals[unitTotals.length - 1] ?? 0;
  const statusCounts = splitTotal(stockItems, STATUS_COUNTS.map((n, i) => (s < 0 || s === i ? n : 0)));

  const consumptionF = share * (c < 0 ? 1 : CAT_UNIT_SHARE[c]);
  const consumption = Object.entries(CONSUMPTION).map(([name, base]) => ({ name, values: flowSeries(base, w, consumptionF).map(Math.round) }));

  const inScope = (row: { site: string; category: string; store: string; warehouseName?: string }) =>
    whs.some((x) => x.site === row.site) && (c < 0 || row.category === f.category) && (!store || row.store === store.name);
  const reorderItems = REORDER_ITEMS.filter(inScope);
  const slowItems = SLOW_ITEMS.filter(inScope);

  const suppliers = SUPPLIERS.filter((x) => c < 0 || x.category === f.category)
    .map((x) => ({ ...x, items: Math.round(x.items * share * statusF), openPos: share ? Math.max(1, Math.round(x.openPos * share)) : 0 }))
    .filter((x) => x.items > 0);

  return {
    window: w,
    hasScope: share > 0,
    totalValue: closing[closing.length - 1] ?? 0,
    stockItems,
    turnover,
    belowReorder: reorderItems.length,
    accuracy: weighted(whs, (x) => x.accuracy),
    opening,
    receipts,
    issues,
    closing,
    categoryStacks,
    categories: INV_CATEGORIES,
    categoryColors: INV_CATEGORY_COLORS,
    statusCounts,
    statuses: STOCK_STATUSES,
    statusColors: STOCK_STATUS_COLORS,
    consumption,
    warehouses: whs,
    reorderItems,
    slowItems,
    slowValue: sumOf(slowItems.map((x) => x.value)),
    criticalAtRisk: reorderItems.filter((x) => x.critical && x.daysCover < 7),
    suppliers
  };
}
