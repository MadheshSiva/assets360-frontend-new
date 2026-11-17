import { RA_COLORS } from '../shared/charts/chart-utils';

// View models and static demo data for the Inventory Analytics page. Figures are generated in the browser and follow the filter bar.

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

// ===================== Static demo data =====================

export const IA_PERIODS = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'This year', 'Last 12 months'];

/** The filter bar ("All …" means no filter); same shape as IaFilters in the service. */
export interface DemoInventoryFilters {
  period: string;
  organization: string;
  location: string;
  warehouse: string;
  store: string;
  category: string;
  status: string;
}

interface DemoWarehouse {
  code: string;
  name: string;
  site: string;
  org: string;
  /** Share of the group's stock lines */
  weight: number;
  utilization: number;
  keeper: string;
  stores: string[];
  accuracy: number;
}

const DEMO_WAREHOUSES: DemoWarehouse[] = [
  { code: 'WH-DXB-01', name: 'Dubai Main Warehouse', site: 'Dubai HQ', org: 'Purple IQ UAE', weight: 0.27, utilization: 92.4, keeper: 'Omar Hassan', stores: ['DXB-A Main Store', 'DXB-B Bulk Store', 'DXB-C Bin Racks'], accuracy: 97.6 },
  { code: 'WH-JAF-01', name: 'Jebel Ali Warehouse', site: 'Jebel Ali Warehouse', org: 'Purple IQ UAE', weight: 0.22, utilization: 87.1, keeper: 'Ahmed Khan', stores: ['JAF-A Spares Store', 'JAF-B Pallet Racks', 'JAF-C Yard Store'], accuracy: 96.2 },
  { code: 'WH-SHJ-01', name: 'Sharjah Spares Store', site: 'Sharjah Facility', org: 'Purple IQ UAE', weight: 0.16, utilization: 78.5, keeper: 'Mohammed Ali', stores: ['SHJ-A Workshop Store', 'SHJ-B Tool Crib'], accuracy: 95.1 },
  { code: 'WH-AUH-01', name: 'Abu Dhabi Store', site: 'Abu Dhabi Office', org: 'Purple IQ UAE', weight: 0.13, utilization: 64.2, keeper: 'Fatima Noor', stores: ['AUH-A Main Store', 'AUH-B Facilities Store'], accuracy: 98.3 },
  { code: 'WH-RUH-01', name: 'Riyadh Warehouse', site: 'Riyadh Office', org: 'Purple IQ KSA', weight: 0.14, utilization: 81.0, keeper: 'Ahmed Al Marri', stores: ['RUH-A Main Store', 'RUH-B Bin Racks'], accuracy: 96.9 },
  { code: 'WH-DOH-01', name: 'Doha Store', site: 'Doha Office', org: 'Purple IQ Qatar', weight: 0.08, utilization: 55.3, keeper: 'Rahul Mehta', stores: ['DOH-A Main Store'], accuracy: 97.8 }
];

/** Item category → share of stock lines, average units per line and average unit cost (AED). */
const DEMO_CATEGORIES: { name: string; weight: number; unitsPerLine: number; unitCost: number; items: string[]; supplier: string }[] = [
  { name: 'Spare Parts', weight: 0.31, unitsPerLine: 14, unitCost: 420, supplier: 'Gulf Industrial Supplies', items: ['Hydraulic Pump Seal Kit', 'Bearing 6205-2RS', 'Drive Belt B-52', 'Chiller Compressor Valve', 'Forklift Brake Pad Set', 'Gearbox Oil Seal', 'Crane Limit Switch', 'Generator Fuel Filter'] },
  { name: 'Consumables', weight: 0.22, unitsPerLine: 60, unitCost: 38, supplier: 'Emirates Trading Co.', items: ['Cable Ties 300mm', 'Shop Towels (box)', 'Degreaser 5L', 'Welding Rods E6013', 'Masking Tape 48mm', 'Cleaning Solvent 20L'] },
  { name: 'Electrical', weight: 0.14, unitsPerLine: 22, unitCost: 165, supplier: 'Al Masaood Electrical', items: ['MCB 32A Type C', 'Contactor 40A', 'LED Panel 60x60', 'Cable 4mm² (100m)', 'Control Relay 24V', 'UPS Battery 12V 9Ah'] },
  { name: 'Tools', weight: 0.1, unitsPerLine: 6, unitCost: 310, supplier: 'Tools World LLC', items: ['Torque Wrench 40-200Nm', 'Insulated Screwdriver Set', 'Digital Multimeter', 'Cordless Drill 18V'] },
  { name: 'Safety & PPE', weight: 0.11, unitsPerLine: 40, unitCost: 55, supplier: 'SafeGuard Middle East', items: ['Safety Helmet (white)', 'Cut-resistant Gloves', 'Safety Harness', 'Ear Defenders', 'Hi-vis Vest'] },
  { name: 'Lubricants', weight: 0.07, unitsPerLine: 18, unitCost: 120, supplier: 'ENOC Lubricants', items: ['Hydraulic Oil ISO 46 (20L)', 'Gear Oil EP 220 (20L)', 'Multipurpose Grease 18kg', 'Compressor Oil (5L)'] },
  { name: 'Raw Materials', weight: 0.05, unitsPerLine: 85, unitCost: 26, supplier: 'Union Steel Trading', items: ['Steel Plate 6mm', 'Copper Pipe 15mm', 'Aluminium Angle 40x40', 'PVC Conduit 25mm'] }
];

const DEMO_SUPPLIERS: { name: string; code: string; category: string; rating: number; preferred: boolean }[] = [
  { name: 'Gulf Industrial Supplies', code: 'SUP-0012', category: 'Spare Parts', rating: 4.6, preferred: true },
  { name: 'Emirates Trading Co.', code: 'SUP-0031', category: 'Consumables', rating: 4.2, preferred: true },
  { name: 'Al Masaood Electrical', code: 'SUP-0018', category: 'Electrical', rating: 4.4, preferred: true },
  { name: 'Tools World LLC', code: 'SUP-0047', category: 'Tools', rating: 3.9, preferred: false },
  { name: 'SafeGuard Middle East', code: 'SUP-0053', category: 'Safety & PPE', rating: 4.5, preferred: true },
  { name: 'ENOC Lubricants', code: 'SUP-0024', category: 'Lubricants', rating: 4.1, preferred: false },
  { name: 'Union Steel Trading', code: 'SUP-0066', category: 'Raw Materials', rating: 3.7, preferred: false }
];

const DEPARTMENTS = [
  { name: 'Maintenance', weight: 0.42 },
  { name: 'Production', weight: 0.24 },
  { name: 'Facilities', weight: 0.16 },
  { name: 'Fleet', weight: 0.12 },
  { name: 'IT', weight: 0.06 }
];

const GROUP_STOCK_LINES = 1860;
/** Value issued per month across the group (AED) */
const GROUP_MONTHLY_ISSUES = 1_180_000;
const SLOW_DAYS = 180;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0..1, the same for the same key. */
const jitter = (key: string) => (hashOf(key) % 10_000) / 10_000;

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ----- Item-level fixtures (rows that appear in tables and lists) -----

interface DemoStockRow {
  code: string;
  name: string;
  category: string;
  warehouse: DemoWarehouse;
  store: string;
  available: number;
  reorderLevel: number;
  dailyUsage: number | null;
  unitCost: number;
  supplier: string;
  critical: boolean;
}

interface DemoSlowRow {
  code: string;
  name: string;
  category: string;
  warehouse: DemoWarehouse;
  store: string;
  quantity: number;
  value: number;
  daysSinceIssue: number;
}

function buildRows(): { reorder: DemoStockRow[]; slow: DemoSlowRow[] } {
  const r = seeded(4242);
  const pickWeighted = <T extends { weight: number }>(list: T[]): T => {
    let x = r();
    for (const item of list) {
      x -= item.weight;
      if (x < 0) return item;
    }
    return list[list.length - 1];
  };
  const reorder: DemoStockRow[] = [];
  for (let i = 0; i < 52; i++) {
    const wh = pickWeighted(DEMO_WAREHOUSES);
    const cat = pickWeighted(DEMO_CATEGORIES);
    const reorderLevel = Math.max(4, Math.round(cat.unitsPerLine * (0.5 + r())));
    const outOfStock = r() < 0.18;
    const available = outOfStock ? 0 : Math.max(1, Math.floor(reorderLevel * (0.15 + r() * 0.85)));
    const dailyUsage = r() < 0.1 ? null : Math.round(Math.max(0.2, reorderLevel / (6 + r() * 22)) * 10) / 10;
    reorder.push({
      code: `ITM-${cat.name.slice(0, 2).toUpperCase()}-${String(1040 + i * 13).padStart(5, '0')}`,
      name: cat.items[Math.floor(r() * cat.items.length)],
      category: cat.name,
      warehouse: wh,
      store: wh.stores[Math.floor(r() * wh.stores.length)],
      available,
      reorderLevel,
      dailyUsage,
      unitCost: Math.round(cat.unitCost * (0.6 + r() * 0.9)),
      supplier: r() < 0.85 ? cat.supplier : DEMO_SUPPLIERS[Math.floor(r() * DEMO_SUPPLIERS.length)].name,
      critical: (cat.name === 'Spare Parts' || cat.name === 'Electrical') && r() < 0.55
    });
  }
  const slow: DemoSlowRow[] = [];
  for (let i = 0; i < 38; i++) {
    const wh = pickWeighted(DEMO_WAREHOUSES);
    const cat = pickWeighted(DEMO_CATEGORIES);
    const quantity = Math.max(1, Math.round(cat.unitsPerLine * (0.4 + r() * 2.2)));
    slow.push({
      code: `ITM-${cat.name.slice(0, 2).toUpperCase()}-${String(2210 + i * 17).padStart(5, '0')}`,
      name: cat.items[Math.floor(r() * cat.items.length)],
      category: cat.name,
      warehouse: wh,
      store: wh.stores[Math.floor(r() * wh.stores.length)],
      quantity,
      value: Math.round(quantity * cat.unitCost * (0.7 + r() * 1.2)),
      daysSinceIssue: SLOW_DAYS + Math.floor(r() * 540)
    });
  }
  return { reorder, slow };
}

const DEMO_ROWS = buildRows();

// ----- Filtering -----

const isAll = (v: string | null | undefined) => !v || v.startsWith('All ');
const same = (a: string, b: string) => isAll(b) || a.toLowerCase() === b.toLowerCase();

function scopedWarehouses(f: DemoInventoryFilters): DemoWarehouse[] {
  return DEMO_WAREHOUSES.filter((w) => same(w.org, f.organization) && same(w.site, f.location) && same(w.name, f.warehouse));
}

function scopedCategories(f: DemoInventoryFilters) {
  return DEMO_CATEGORIES.filter((c) => same(c.name, f.category));
}

/** Share of a warehouse's stock held in the picked store. */
function storeShare(w: DemoWarehouse, f: DemoInventoryFilters): number {
  if (isAll(f.store)) return 1;
  return w.stores.includes(f.store) ? 1 / w.stores.length : 0;
}

function rowInScope(row: { warehouse: DemoWarehouse; store: string; category: string }, f: DemoInventoryFilters): boolean {
  return scopedWarehouses(f).includes(row.warehouse) && same(row.store, f.store) && same(row.category, f.category);
}

// ----- Period buckets -----

interface DemoBucket {
  label: string;
  /** Fraction of a month */
  weight: number;
  month: number;
}

function demoBuckets(period: string, previous = false): DemoBucket[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const months = (from: Date, count: number): DemoBucket[] =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      const current = !previous && d.getFullYear() === y && d.getMonth() === m;
      return { label: `${MONTH_NAMES[d.getMonth()]}\n${d.getFullYear()}`, weight: current ? now.getDate() / 30 : 1, month: d.getMonth() };
    });
  const weeks = (from: Date, to: Date): DemoBucket[] => {
    const list: DemoBucket[] = [];
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 7 * DAY)) {
      const days = Math.min(7, Math.ceil((to.getTime() - d.getTime()) / DAY));
      list.push({ label: `${String(d.getDate()).padStart(2, '0')} ${MONTH_NAMES[d.getMonth()]}\n${d.getFullYear()}`, weight: days / 30, month: d.getMonth() });
    }
    return list;
  };
  const today = new Date(y, m, now.getDate());
  const tomorrow = new Date(today.getTime() + DAY);
  switch (period) {
    case 'Last 30 days': {
      const from = new Date(today.getTime() - (previous ? 59 : 29) * DAY);
      return weeks(from, previous ? new Date(today.getTime() - 29 * DAY) : tomorrow);
    }
    case 'This month':
      return previous ? weeks(new Date(y, m - 1, 1), new Date(y, m, 1)) : weeks(new Date(y, m, 1), tomorrow);
    case 'Last month':
      return weeks(new Date(y, m - (previous ? 2 : 1), 1), new Date(y, m - (previous ? 1 : 0), 1));
    case 'This quarter': {
      const q = Math.floor(m / 3) * 3;
      return previous ? weeks(new Date(y, q - 3, 1), new Date(y, q, 1)) : weeks(new Date(y, q, 1), tomorrow);
    }
    case 'Last 12 months':
      return months(new Date(y, m - 11 - (previous ? 12 : 0), 1), 12);
    default:
      return months(new Date(y - (previous ? 1 : 0), 0, 1), m + 1);
  }
}

const SEASONALITY = [0.94, 0.97, 1.05, 1.03, 1.0, 0.91, 0.86, 0.9, 1.04, 1.08, 1.1, 0.98];

// ----- Builders -----

const kpiOf = (value: number, previous: number, points = false): IaKpi => ({
  value,
  previous,
  change: points ? Math.round((value - previous) * 10) / 10 : previous ? Math.round(((value - previous) / previous) * 1000) / 10 : null
});

function toReorderItem(row: DemoStockRow): ReorderItem {
  const daysCover = row.dailyUsage ? Math.floor(row.available / row.dailyUsage) : null;
  const risk: Risk = row.available === 0 || (daysCover !== null && daysCover < 7) ? 'High' : daysCover !== null && daysCover < 15 ? 'Medium' : 'Low';
  const target = row.reorderLevel * 2;
  return {
    key: `${row.warehouse.code}:${row.code}`,
    code: row.code,
    name: row.name,
    category: row.category,
    warehouse: row.warehouse.code,
    warehouseName: row.warehouse.name,
    store: row.store,
    site: row.warehouse.site,
    available: row.available,
    reorderLevel: row.reorderLevel,
    suggestedQty: Math.max(1, target - row.available),
    dailyUsage: row.dailyUsage,
    daysCover,
    coverRank: daysCover ?? Number.MAX_SAFE_INTEGER,
    supplier: row.supplier,
    risk,
    riskRank: risk === 'High' ? 1 : risk === 'Medium' ? 2 : 3,
    critical: row.critical,
    unitCost: row.unitCost
  };
}

function toSlowItem(row: DemoSlowRow): SlowItem {
  return {
    code: row.code, name: row.name, category: row.category, warehouseName: row.warehouse.name, store: row.store, site: row.warehouse.site,
    quantity: row.quantity, value: row.value, daysSinceIssue: row.daysSinceIssue
  };
}

/** Monthly (or weekly) value issued for the filters. */
function issueSeries(f: DemoInventoryFilters, scale: number, previous = false): number[] {
  return demoBuckets(f.period, previous).map((b) =>
    Math.round(GROUP_MONTHLY_ISSUES * scale * b.weight * SEASONALITY[b.month] * (0.9 + jitter(`${f.warehouse}|${f.category}|${b.label}|${previous}`) * 0.2) * (previous ? 0.93 : 1))
  );
}

/** Stock-line share of the filters (warehouse × store × category). */
function stockScale(f: DemoInventoryFilters): number {
  const wh = scopedWarehouses(f).reduce((s, w) => s + w.weight * storeShare(w, f), 0);
  const cat = scopedCategories(f).reduce((s, c) => s + c.weight, 0);
  return wh * cat;
}

export function buildDemoInventory(f: DemoInventoryFilters): InventoryView {
  const warehouses = scopedWarehouses(f);
  const cats = scopedCategories(f);
  const scale = stockScale(f);

  // Item rows in scope
  let reorderRows = DEMO_ROWS.reorder.filter((r) => rowInScope(r, f)).map(toReorderItem);
  const outOfStock = reorderRows.filter((r) => r.available === 0).length;
  const below = reorderRows.length - outOfStock;
  if (f.status === 'Out of Stock') reorderRows = reorderRows.filter((r) => r.available === 0);
  else if (f.status === 'Below Reorder') reorderRows = reorderRows.filter((r) => r.available > 0);
  else if (!isAll(f.status)) reorderRows = [];
  const slowRows = isAll(f.status) || f.status === 'Overstocked' || f.status === 'In Stock'
    ? DEMO_ROWS.slow.filter((r) => rowInScope(r, f)).map(toSlowItem).sort((a, b) => (b.daysSinceIssue ?? 0) - (a.daysSinceIssue ?? 0))
    : [];

  // Category breakdown
  const categories = cats.map((c) => {
    const items = Math.round(GROUP_STOCK_LINES * c.weight * warehouses.reduce((s, w) => s + w.weight * storeShare(w, f), 0));
    const units = Math.round(items * c.unitsPerLine * (0.9 + jitter(`${f.warehouse}|units|${c.name}`) * 0.2));
    return { name: c.name, items, units, value: Math.round(units * c.unitCost) };
  }).filter((c) => c.items > 0);
  const allItems = categories.reduce((s, c) => s + c.items, 0);
  const overstocked = Math.round(allItems * 0.07);
  const inStock = Math.max(0, allItems - below - outOfStock - overstocked);
  const statusCounts = [
    { name: 'In Stock', count: inStock },
    { name: 'Below Reorder', count: below },
    { name: 'Out of Stock', count: outOfStock },
    { name: 'Overstocked', count: overstocked }
  ];
  const statusItems = isAll(f.status) ? allItems : statusCounts.find((s) => s.name === f.status)?.count ?? 0;
  const statusShare = allItems ? statusItems / allItems : 0;
  const totalValue = Math.round(categories.reduce((s, c) => s + c.value, 0) * statusShare);
  const totalUnits = Math.round(categories.reduce((s, c) => s + c.units, 0) * statusShare);

  // Issues and consumption
  const issues = issueSeries(f, scale);
  const prevIssues = issueSeries(f, scale, true);
  const issuedValue = issues.reduce((a, b) => a + b, 0);
  const months = demoBuckets(f.period).reduce((s, b) => s + b.weight, 0) || 1;
  const annualIssues = (issuedValue / months) * 12;
  const fullValue = categories.reduce((s, c) => s + c.value, 0);
  const turnover = fullValue ? Math.round((annualIssues / fullValue) * 10) / 10 : 0;
  const prevTurnover = Math.round(turnover * 0.93 * 10) / 10;
  const avgUnitCost = totalUnits ? Math.max(20, fullValue / Math.max(1, categories.reduce((s, c) => s + c.units, 0))) : 100;
  const consumption = DEPARTMENTS.map((d) => ({
    name: d.name,
    values: issues.map((v, i) => Math.round(((v / avgUnitCost) * d.weight) * (0.88 + jitter(`${d.name}|${i}|${f.category}`) * 0.24)))
  }));

  const accuracy = warehouses.length
    ? Math.round((warehouses.reduce((s, w) => s + w.accuracy * w.weight, 0) / warehouses.reduce((s, w) => s + w.weight, 0)) * 10) / 10
    : 0;

  // Warehouses
  const allReorder = DEMO_ROWS.reorder.filter((r) => rowInScope(r, f));
  const whRows: Warehouse[] = warehouses.map((w) => {
    const share = w.weight * storeShare(w, f) * cats.reduce((s, c) => s + c.weight, 0);
    const items = Math.round(GROUP_STOCK_LINES * share);
    const units = Math.round(cats.reduce((s, c) => s + GROUP_STOCK_LINES * w.weight * storeShare(w, f) * c.weight * c.unitsPerLine, 0));
    return {
      code: w.code,
      name: w.name,
      site: w.site,
      utilization: w.utilization,
      utilizationBasis: 'bin capacity',
      items,
      units,
      value: Math.round(cats.reduce((s, c) => s + GROUP_STOCK_LINES * w.weight * storeShare(w, f) * c.weight * c.unitsPerLine * c.unitCost, 0)),
      belowReorder: allReorder.filter((r) => r.warehouse === w).length,
      stores: isAll(f.store) ? w.stores : w.stores.filter((s) => s === f.store),
      keeper: w.keeper
    };
  }).filter((w) => w.items > 0);

  // Suppliers
  const suppliers: Supplier[] = DEMO_SUPPLIERS.filter((s) => cats.some((c) => c.name === s.category)).map((s) => {
    const cat = categories.find((c) => c.name === s.category);
    return {
      name: s.name,
      code: s.code,
      category: s.category,
      items: cat?.items ?? 0,
      stockValue: cat?.value ?? 0,
      belowReorder: allReorder.filter((r) => r.supplier === s.name).length,
      rating: s.rating,
      preferred: s.preferred
    };
  }).filter((s) => s.items > 0).sort((a, b) => b.stockValue - a.stockValue);

  const reorderTotal = reorderRows.length;
  const criticalAtRisk = reorderRows.filter((r) => r.critical && (r.available === 0 || (r.daysCover !== null && r.daysCover < 7)));
  const slowValue = slowRows.reduce((s, x) => s + x.value, 0);
  const now = new Date();

  return {
    generatedAt: new Date(now.getTime() - 3 * 60_000).toISOString(),
    previousFromUtc: null,
    previousToUtc: null,
    labels: demoBuckets(f.period).map((b) => b.label),
    totalValueKpi: kpiOf(totalValue, Math.round(totalValue * 0.955)),
    stockItemsKpi: kpiOf(statusItems, Math.round(statusItems * 0.97)),
    turnoverKpi: kpiOf(turnover, prevTurnover),
    belowReorderKpi: kpiOf(reorderTotal, Math.round(reorderTotal * 1.18) + (reorderTotal ? 1 : 0)),
    accuracyKpi: kpiOf(accuracy, Math.round((accuracy - 0.8) * 10) / 10, true),
    stockItems: statusItems,
    totalUnits,
    issues,
    issuedValue,
    categories,
    statusCounts,
    consumption,
    warehouses: whRows,
    reorderItems: reorderRows,
    reorderTotal,
    criticalAtRisk,
    slowItems: slowRows,
    slowTotal: slowRows.length,
    slowValue,
    slowDays: SLOW_DAYS,
    suppliers
  };
}

/** Previous period: issue value per bucket and turnover. */
export function buildDemoPrevious(f: DemoInventoryFilters): { issues: number[]; turnover: number | null } {
  const view = buildDemoInventory(f);
  return { issues: issueSeries(f, stockScale(f), true), turnover: view.turnoverKpi.previous };
}

/** Filter dropdowns: warehouses follow the organization / location, stores follow the warehouse. */
export function demoFilterLists(f: DemoInventoryFilters): {
  organizations: string[];
  warehouses: { name: string; code: string; site: string }[];
  stores: string[];
  categories: string[];
  statuses: string[];
} {
  const whs = DEMO_WAREHOUSES.filter((w) => same(w.org, f.organization) && same(w.site, f.location));
  const picked = whs.filter((w) => same(w.name, f.warehouse));
  return {
    organizations: [ALL_ORGANIZATIONS, ...new Set(DEMO_WAREHOUSES.map((w) => w.org))],
    warehouses: whs.map((w) => ({ name: w.name, code: w.code, site: w.site })),
    stores: [ALL_STORES, ...picked.flatMap((w) => w.stores)],
    categories: [ALL_CATEGORIES, ...DEMO_CATEGORIES.map((c) => c.name)],
    statuses: [ALL_STATUSES, ...STOCK_STATUSES]
  };
}
