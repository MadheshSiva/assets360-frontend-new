import { CURRENT_USER, RA_CATEGORIES, RA_LOCATIONS, RA_ORGANIZATIONS, RA_PERIODS, assetId, money, percent } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import { ChartSeries, ChartSlice, HBarRow, RA_COLORS, compactNumber } from '../shared/charts';
import { IOT_ASSETS, IOT_SITES, hashUnit, periodWindow } from '../iot-utilization-analytics/iot-utilization.data';
import { MapPoint } from '../iot-utilization-analytics/iot-site-map/iot-site-map';

// DEMO MODE: dashboard widgets are computed from RA_METRICS (the same headline figures as the other
// Reports & Analytics pages) scaled to the selected organization, location, category and period.

export type WidgetType = 'kpi' | 'line' | 'bar' | 'donut' | 'table' | 'map' | 'heatmap';
export type WidgetSpan = 3 | 4 | 5 | 6 | 7 | 8 | 12;

export type MetricKey =
  | 'total-assets' | 'active-work-orders' | 'pm-compliance' | 'inventory-value' | 'maintenance-cost' | 'health-score'
  | 'connected-assets' | 'compliance-score' | 'health-trend' | 'work-order-trend' | 'maintenance-cost-by-category'
  | 'asset-status' | 'work-orders-by-priority' | 'assets-attention' | 'asset-locations' | 'utilization-heatmap' | 'inventory-by-category';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  metric: MetricKey;
  title: string;
  span: WidgetSpan;
}

export type Sharing = 'private' | 'people' | 'organization';
export type DashboardRole = 'Owner' | 'Editor' | 'Viewer';

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  owner: string;
  sharing: Sharing;
  sharedWith: string[];
  groups: string[];
  role: DashboardRole;
  favorite: boolean;
  updatedAt: string;
  widgets: WidgetConfig[];
}

export interface DashFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  compare: boolean;
}

export interface MetricDef {
  key: MetricKey;
  label: string;
  description: string;
  types: WidgetType[];
}

export interface WidgetTypeDef {
  type: WidgetType;
  label: string;
  span: WidgetSpan;
}

export const WIDGET_TYPES: WidgetTypeDef[] = [
  { type: 'kpi', label: 'KPI Card', span: 3 },
  { type: 'line', label: 'Line Chart', span: 6 },
  { type: 'bar', label: 'Bar Chart', span: 6 },
  { type: 'donut', label: 'Donut Chart', span: 4 },
  { type: 'table', label: 'Table', span: 12 },
  { type: 'map', label: 'Map', span: 4 },
  { type: 'heatmap', label: 'Heatmap', span: 12 }
];

export const WIDGET_SIZES: { span: WidgetSpan; label: string }[] = [
  { span: 3, label: 'Small (1/4 width)' },
  { span: 4, label: 'Medium (1/3 width)' },
  { span: 6, label: 'Half width' },
  { span: 8, label: 'Large (2/3 width)' },
  { span: 12, label: 'Full width' }
];

/** Data sources a widget can show, and the widget types that suit each one. */
export const METRICS: MetricDef[] = [
  { key: 'total-assets', label: 'Total Assets', description: 'Assets in the register', types: ['kpi'] },
  { key: 'active-work-orders', label: 'Active Work Orders', description: 'Open work orders right now', types: ['kpi'] },
  { key: 'pm-compliance', label: 'PM Compliance', description: 'Preventive maintenance done on time', types: ['kpi', 'line'] },
  { key: 'inventory-value', label: 'Inventory Value', description: 'Value of stock on hand', types: ['kpi'] },
  { key: 'maintenance-cost', label: 'Maintenance Cost', description: 'Maintenance spend for the period', types: ['kpi', 'line', 'bar'] },
  { key: 'health-score', label: 'Average Health Score', description: 'Average asset health (0–100)', types: ['kpi'] },
  { key: 'connected-assets', label: 'Connected IoT Assets', description: 'Assets reporting telemetry', types: ['kpi'] },
  { key: 'compliance-score', label: 'Compliance Score', description: 'Audit and certification compliance', types: ['kpi'] },
  { key: 'health-trend', label: 'Asset Health Trend', description: 'Healthy / at risk / critical share by month', types: ['line', 'bar', 'table'] },
  { key: 'work-order-trend', label: 'Work Orders Created vs Completed', description: 'Work order flow by month', types: ['line', 'bar', 'table'] },
  { key: 'maintenance-cost-by-category', label: 'Maintenance Cost by Category', description: 'Spend split by asset category', types: ['bar', 'donut', 'table'] },
  { key: 'asset-status', label: 'Asset Status Distribution', description: 'Active, under maintenance, retired, missing', types: ['donut', 'bar', 'table'] },
  { key: 'work-orders-by-priority', label: 'Open Work Orders by Priority', description: 'Open work orders by priority', types: ['bar', 'donut', 'table'] },
  { key: 'inventory-by-category', label: 'Inventory Value by Category', description: 'Stock value per asset category', types: ['bar', 'donut', 'table'] },
  { key: 'assets-attention', label: 'Assets Requiring Attention', description: 'Lowest health scores and open issues', types: ['table'] },
  { key: 'asset-locations', label: 'Asset Locations', description: 'Assets per site by status', types: ['map', 'bar', 'table'] },
  { key: 'utilization-heatmap', label: 'Utilization by Site and Month', description: 'Average utilization heatmap', types: ['heatmap', 'table'] }
];

export function metricDef(key: MetricKey): MetricDef | undefined {
  return METRICS.find((m) => m.key === key);
}

// ===== Seed dashboards =====

const w = (id: string, type: WidgetType, metric: MetricKey, title: string, span: WidgetSpan): WidgetConfig => ({ id, type, metric, title, span });

export const DASHBOARD_GROUPS = ['Executive Team', 'Maintenance Team', 'Finance Team', 'Operations Managers', 'Site Supervisors'];

export const SEED_DASHBOARDS: Dashboard[] = [
  {
    id: 'executive-asset-overview',
    name: 'Executive Asset Overview',
    description: 'Executive view of asset performance, maintenance, inspections, inventory and operations.',
    owner: CURRENT_USER.name,
    sharing: 'people',
    sharedWith: ['Omar Hassan', 'Aisha Rahman', 'James Tan', 'Priya Sharma', 'Fatima Noor'],
    groups: ['Executive Team', 'Operations Managers'],
    role: 'Owner',
    favorite: true,
    updatedAt: '28 Oct 2026, 10:32',
    widgets: [
      w('w1', 'kpi', 'total-assets', 'Total Assets', 3),
      w('w2', 'kpi', 'active-work-orders', 'Active Work Orders', 3),
      w('w3', 'kpi', 'pm-compliance', 'Preventive Compliance', 3),
      w('w4', 'kpi', 'inventory-value', 'Inventory Value', 3),
      w('w5', 'line', 'health-trend', 'Asset Health Score Trend', 7),
      w('w6', 'bar', 'maintenance-cost-by-category', 'Maintenance Cost by Category', 5),
      w('w7', 'donut', 'asset-status', 'Asset Status Distribution', 4),
      w('w8', 'bar', 'work-orders-by-priority', 'Open Work Orders by Priority', 4),
      w('w9', 'map', 'asset-locations', 'Asset Locations', 4),
      w('w10', 'table', 'assets-attention', 'Top 5 Assets Requiring Attention', 12)
    ]
  },
  {
    id: 'maintenance-operations',
    name: 'Maintenance Operations',
    description: 'Daily maintenance view: open work orders, spend, PM compliance and assets at risk.',
    owner: CURRENT_USER.name,
    sharing: 'people',
    sharedWith: ['Mohammed Ali', 'Rahul Mehta'],
    groups: ['Maintenance Team'],
    role: 'Owner',
    favorite: false,
    updatedAt: '27 Oct 2026, 16:05',
    widgets: [
      w('w1', 'kpi', 'active-work-orders', 'Active Work Orders', 3),
      w('w2', 'kpi', 'maintenance-cost', 'Maintenance Cost', 3),
      w('w3', 'kpi', 'pm-compliance', 'PM Compliance', 3),
      w('w4', 'kpi', 'health-score', 'Average Health Score', 3),
      w('w5', 'line', 'work-order-trend', 'Work Orders Created vs Completed', 8),
      w('w6', 'donut', 'work-orders-by-priority', 'Open Work Orders by Priority', 4),
      w('w7', 'line', 'maintenance-cost', 'Maintenance Cost Trend', 6),
      w('w8', 'table', 'assets-attention', 'Assets Requiring Attention', 6)
    ]
  },
  {
    id: 'site-utilization',
    name: 'Site Utilization',
    description: 'Connected assets and utilization across Purple IQ sites.',
    owner: 'Omar Hassan',
    sharing: 'organization',
    sharedWith: [CURRENT_USER.name, 'Ahmed Khan', 'Lisa Wong'],
    groups: ['Site Supervisors'],
    role: 'Editor',
    favorite: true,
    updatedAt: '26 Oct 2026, 09:12',
    widgets: [
      w('w1', 'kpi', 'connected-assets', 'Connected IoT Assets', 4),
      w('w2', 'kpi', 'total-assets', 'Total Assets', 4),
      w('w3', 'kpi', 'health-score', 'Average Health Score', 4),
      w('w4', 'heatmap', 'utilization-heatmap', 'Utilization by Site and Month', 12),
      w('w5', 'map', 'asset-locations', 'Asset Locations', 6),
      w('w6', 'bar', 'asset-locations', 'Assets per Site', 6)
    ]
  },
  {
    id: 'finance-inventory',
    name: 'Finance & Inventory',
    description: 'Inventory value and maintenance spend for the finance review.',
    owner: 'Aisha Rahman',
    sharing: 'people',
    sharedWith: [CURRENT_USER.name, 'Daniel Kim', 'Priya Nair'],
    groups: ['Finance Team'],
    role: 'Viewer',
    favorite: false,
    updatedAt: '24 Oct 2026, 14:48',
    widgets: [
      w('w1', 'kpi', 'inventory-value', 'Inventory Value', 6),
      w('w2', 'kpi', 'maintenance-cost', 'Maintenance Cost', 6),
      w('w3', 'bar', 'inventory-by-category', 'Inventory Value by Category', 6),
      w('w4', 'donut', 'maintenance-cost-by-category', 'Maintenance Cost by Category', 6),
      w('w5', 'line', 'maintenance-cost', 'Maintenance Cost Trend', 12)
    ]
  }
];

// ===== Scope (filters → share of the group totals) =====

/** Share of the asset register per site (adds up to 1) and the organization that runs it. */
const SITE_SHARE: Record<string, { share: number; org: string }> = {
  'Dubai HQ': { share: 0.27, org: 'Purple IQ UAE' },
  'Abu Dhabi Office': { share: 0.17, org: 'Purple IQ UAE' },
  'Sharjah Facility': { share: 0.13, org: 'Purple IQ UAE' },
  'Jebel Ali Warehouse': { share: 0.14, org: 'Purple IQ UAE' },
  'Al Ain Depot': { share: 0.07, org: 'Purple IQ UAE' },
  'Riyadh Office': { share: 0.12, org: 'Purple IQ KSA' },
  'London Office': { share: 0.05, org: 'Purple IQ Group' },
  'Singapore Office': { share: 0.05, org: 'Purple IQ Group' }
};

const CATEGORY_SHARE: Record<string, number> = {
  Vehicles: 0.2, Machinery: 0.18, Facilities: 0.16, 'IT Equipment': 0.15, HVAC: 0.12, 'Power & Electrical': 0.1, 'Safety & PPE': 0.09
};

/** Maintenance cost per category for 01 Jan – 28 Oct 2026 (adds up to RA_METRICS.maintenance.cost). */
const COST_BY_CATEGORY: Record<string, number> = {
  Vehicles: 520_000, Machinery: 410_000, Facilities: 260_000, 'IT Equipment': 180_000, HVAC: 240_000, 'Power & Electrical': 160_000, 'Safety & PPE': 90_000
};

const INVENTORY_BY_CATEGORY: Record<string, number> = {
  Vehicles: 1_120_000, Machinery: 1_040_000, Facilities: 620_000, 'IT Equipment': 760_000, HVAC: 540_000, 'Power & Electrical': 480_000, 'Safety & PPE': 260_000
};

/** Flow metrics (cost, work orders raised) scale with the period length; YTD = 1. */
const PERIOD_FLOW = [1, 0.1, 0.3, 0.1, 1.18];

interface Scope {
  sites: string[];
  siteShare: number;
  catShare: number;
  share: number;
  flow: number;
  key: string;
  pi: number;
}

function scopeOf(f: DashFilters): Scope {
  const sites = Object.keys(SITE_SHARE).filter((s) =>
    (f.location === RA_LOCATIONS[0] || f.location === s)
    && (f.organization === RA_ORGANIZATIONS[0] || f.organization === 'Purple IQ Group' || SITE_SHARE[s].org === f.organization));
  const siteShare = sites.reduce((a, s) => a + SITE_SHARE[s].share, 0);
  const catShare = f.category === 'All categories' ? 1 : CATEGORY_SHARE[f.category] ?? 0;
  const pi = Math.max(0, RA_PERIODS.indexOf(f.period));
  return { sites, siteShare, catShare, share: siteShare * catShare, flow: PERIOD_FLOW[pi], key: [f.organization, f.location, f.category].join('|'), pi };
}

/** Splits an integer total by weights so the parts add up exactly (largest remainder). */
function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((wt) => (total * wt) / sumW);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem).forEach(({ i }) => {
    if (left > 0) {
      parts[i]++;
      left--;
    }
  });
  return parts;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A small ±spread offset that is stable for a filter selection (0 for the unfiltered view). */
function wobble(scope: Scope, salt: string, spread: number): number {
  if (scope.key === [RA_ORGANIZATIONS[0], RA_LOCATIONS[0], 'All categories'].join('|')) return 0;
  return round1((hashUnit(scope.key + salt) - 0.5) * 2 * spread);
}

// ===== Widget data =====

export interface KpiData {
  value: string;
  prev: string;
  delta: number;
  good: boolean;
  tone: string;
}

export interface AttentionAsset {
  id: string;
  name: string;
  category: string;
  site: string;
  score: number;
  issue: string;
  lastInspection: string;
  openWorkOrders: number;
}

export interface WidgetData {
  empty: boolean;
  kpi?: KpiData;
  labels?: string[];
  series?: ChartSeries[];
  format?: (v: number) => string;
  max?: number;
  stacked?: boolean;
  slices?: ChartSlice[];
  centerValue?: string;
  centerLabel?: string;
  hbars?: HBarRow[];
  table?: { columns: string[]; rows: (string | number)[][] };
  attention?: AttentionAsset[];
  points?: MapPoint[];
  legend?: { label: string; color: string; count: number }[];
  heat?: { rows: string[]; cols: string[]; values: number[][] };
}

const STATUS_SLICES: [string, number, string][] = [
  ['Active', RA_METRICS.assets.status.active, RA_COLORS.green],
  ['Under Maintenance', RA_METRICS.assets.status.underMaintenance, RA_COLORS.blue],
  ['Retired', RA_METRICS.assets.status.retired, RA_COLORS.orange],
  ['Missing', RA_METRICS.assets.status.missing, RA_COLORS.pink]
];

/** Open work orders by priority; adds up to RA_METRICS.maintenance.openWorkOrders (86). */
const PRIORITY_SLICES: [string, number, string][] = [
  ['Critical', 9, RA_COLORS.red],
  ['High', 21, RA_COLORS.orange],
  ['Medium', 34, RA_COLORS.blue],
  ['Low', 22, RA_COLORS.green]
];

const CATEGORY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.violet, RA_COLORS.teal];

const ATTENTION_POOL: Omit<AttentionAsset, 'id'>[] = [
  { name: 'Generator GEN-02', category: 'Power & Electrical', site: 'Jebel Ali Warehouse', score: 28, issue: 'Overdue maintenance', lastInspection: '02 Sep 2026', openWorkOrders: 3 },
  { name: 'HVAC Unit HV-03', category: 'HVAC', site: 'Dubai HQ', score: 42, issue: 'High temperature alerts', lastInspection: '18 Sep 2026', openWorkOrders: 2 },
  { name: 'Forklift FL-07', category: 'Vehicles', site: 'Jebel Ali Warehouse', score: 55, issue: 'Inspection due soon', lastInspection: '30 Apr 2026', openWorkOrders: 1 },
  { name: 'Pump P-16', category: 'Machinery', site: 'Sharjah Facility', score: 60, issue: 'Vibration levels rising', lastInspection: '11 Aug 2026', openWorkOrders: 1 },
  { name: 'Fire Panel FP-02', category: 'Safety & PPE', site: 'Abu Dhabi Office', score: 62, issue: 'Service due in 7 days', lastInspection: '04 Nov 2025', openWorkOrders: 0 },
  { name: 'Chiller CH-01', category: 'HVAC', site: 'Riyadh Office', score: 64, issue: 'Refrigerant pressure low', lastInspection: '22 Jul 2026', openWorkOrders: 1 },
  { name: 'Server Rack SR-04', category: 'IT Equipment', site: 'Dubai HQ', score: 66, issue: 'UPS battery end of life', lastInspection: '15 Jun 2026', openWorkOrders: 1 },
  { name: 'Delivery Truck DT-11', category: 'Vehicles', site: 'Al Ain Depot', score: 67, issue: 'Brake wear above limit', lastInspection: '09 Oct 2026', openWorkOrders: 1 },
  { name: 'Cold Room CR-02', category: 'Facilities', site: 'Sharjah Facility', score: 69, issue: 'Door seal failing', lastInspection: '28 Aug 2026', openWorkOrders: 1 },
  { name: 'Excavator EX-01', category: 'Machinery', site: 'Al Ain Depot', score: 70, issue: 'Hydraulic leak reported', lastInspection: '01 Oct 2026', openWorkOrders: 2 },
  { name: 'Transformer TR-02', category: 'Power & Electrical', site: 'London Office', score: 71, issue: 'Oil test overdue', lastInspection: '12 Mar 2026', openWorkOrders: 0 },
  { name: 'Network Switch NS-09', category: 'IT Equipment', site: 'Singapore Office', score: 72, issue: 'Firmware out of support', lastInspection: '20 May 2026', openWorkOrders: 0 },
  { name: 'Passenger Lift LF-01', category: 'Facilities', site: 'Riyadh Office', score: 73, issue: 'Certificate expires in 21 days', lastInspection: '07 Nov 2025', openWorkOrders: 0 },
  { name: 'Gas Detector GD-05', category: 'Safety & PPE', site: 'Jebel Ali Warehouse', score: 74, issue: 'Calibration due', lastInspection: '14 Apr 2026', openWorkOrders: 0 }
];

const SITE_CODES: Record<string, string> = Object.fromEntries(IOT_SITES.map((s) => [s.name, s.code]));
export const ATTENTION_ASSETS: AttentionAsset[] = ATTENTION_POOL.map((a, i) => ({ ...a, id: assetId(SITE_CODES[a.site], 1042 - i * 61) }));

const SITE_UTIL_BASE: Record<string, number> = {
  'Dubai HQ': 81, 'Abu Dhabi Office': 77, 'Sharjah Facility': 74, 'Jebel Ali Warehouse': 84, 'Al Ain Depot': 71,
  'Riyadh Office': 76, 'London Office': 68, 'Singapore Office': 70
};

function kpi(value: string, prev: string, delta: number, good: boolean, tone: string): WidgetData {
  return { empty: false, kpi: { value, prev, delta, good, tone } };
}

function categorical(type: WidgetType, items: { name: string; value: number; color: string }[], format: (v: number) => string, center: string, horizontal = false): WidgetData {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return { empty: true };
  if (type === 'donut') return { empty: false, slices: items, centerValue: format(total), centerLabel: center, format };
  if (type === 'table') {
    return { empty: false, table: { columns: ['Item', 'Value', 'Share'], rows: [...items.map((i) => [i.name, format(i.value), percent((i.value / total) * 100)]), ['Total', format(total), '100%']] } };
  }
  if (horizontal) return { empty: false, hbars: items.map((i) => ({ label: i.name, value: i.value, display: format(i.value), color: i.color })) };
  return { empty: false, labels: items.map((i) => i.name), series: [{ name: center, values: items.map((i) => i.value), color: RA_COLORS.purple }], format };
}

function timeSeries(type: WidgetType, labels: string[], series: ChartSeries[], format: (v: number) => string, max?: number, stacked = false): WidgetData {
  if (type === 'table') {
    return { empty: false, table: { columns: ['Period', ...series.map((s) => s.name)], rows: labels.map((l, i) => [l.replace('\n', ' '), ...series.map((s) => format(s.values[i]))]) } };
  }
  if (type === 'bar') return { empty: false, labels, series: series.map((s) => ({ ...s, type: 'bar' as const, dashed: false, area: false })), format, max, stacked };
  return { empty: false, labels, series, format, max };
}

/** Builds what a widget shows for its data source, widget type and the page filters. */
export function buildWidgetData(config: WidgetConfig, f: DashFilters): WidgetData {
  const s = scopeOf(f);
  if (s.share <= 0) return { empty: true };
  const win = periodWindow(f.period);
  const t = win.months.map((m, i) => (win.weekly ? 11 - (win.months.length - 1 - i) * 0.23 : m));
  const per = win.weekly ? 1 / 4.3 : 1;
  const h = hashUnit(s.key);
  const prevOf = (v: number, d: number) => v / (1 + d / 100);
  const M = RA_METRICS;

  switch (config.metric) {
    case 'total-assets': {
      const v = Math.round(M.assets.total * s.share);
      return kpi(v.toLocaleString('en-US'), Math.round(prevOf(v, 8.4)).toLocaleString('en-US'), 8.4, true, 'purple');
    }
    case 'active-work-orders': {
      const v = Math.round(M.maintenance.openWorkOrders * s.share);
      return kpi(String(v), String(Math.round(prevOf(v, -12))), -12, true, 'blue');
    }
    case 'pm-compliance': {
      const v = Math.min(100, M.maintenance.pmCompliance + wobble(s, 'pm', 3));
      if (config.type === 'kpi') return kpi(percent(v), percent(prevOf(v, 4.2)), 4.2, true, 'green');
      const values = t.map((x) => round1(Math.min(100, v - (11 - x) * 0.45 + Math.sin(x * 1.2 + h * 5) - Math.sin(11 * 1.2 + h * 5))));
      const series: ChartSeries[] = [{ name: 'PM Compliance', values, color: RA_COLORS.green, area: true }, { name: 'Target', values: values.map(() => 95), color: RA_COLORS.grey, dashed: true }];
      if (f.compare) series.push({ name: 'Previous period', values: values.map((x) => round1(prevOf(x, 4.2))), color: RA_COLORS.lavender, dashed: true });
      return timeSeries(config.type, win.labels, series, (x) => percent(x, 0), 100);
    }
    case 'inventory-value': {
      const v = M.inventory.value * s.siteShare * s.catShare;
      return kpi(money(v), money(prevOf(v, 6.7)), 6.7, true, 'orange');
    }
    case 'maintenance-cost': {
      const cats = f.category === 'All categories' ? RA_CATEGORIES : [f.category];
      const total = cats.reduce((a, c) => a + (COST_BY_CATEGORY[c] ?? 0), 0) * s.siteShare * s.flow;
      if (config.type === 'kpi') return kpi(money(total), money(prevOf(total, 8.1)), 8.1, false, 'pink');
      // Monthly spend follows a summer peak (HVAC, cooling) and adds up to the period total
      const weights = t.map((x) => 1 + 0.18 * Math.cos(((x - 7.5) / 12) * 2 * Math.PI) + Math.sin(x * 1.7 + h * 4) * 0.05);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const values = weights.map((wt) => Math.round((total * wt) / sumW));
      const budget = values.map(() => Math.round((total / values.length) * (M.maintenance.budget / M.maintenance.cost)));
      const series: ChartSeries[] = [{ name: 'Maintenance Cost', values, color: RA_COLORS.purple, area: true }, { name: 'Budget', values: budget, color: RA_COLORS.green, dashed: true, type: 'line' }];
      if (f.compare) series.push({ name: 'Previous period', values: values.map((x) => Math.round(prevOf(x, 8.1))), color: RA_COLORS.lavender, dashed: true, type: 'line' });
      return timeSeries(config.type, win.labels, series, (x) => money(x));
    }
    case 'health-score': {
      const v = Math.round(M.assets.healthScore + wobble(s, 'hs', 4));
      return kpi(`${v} / 100`, `${Math.round(prevOf(v, 2.1))} / 100`, 2.1, true, 'green');
    }
    case 'connected-assets': {
      const v = IOT_ASSETS.filter((a) => s.sites.includes(a.site) && (f.category === 'All categories' || a.category === f.category)).length;
      return kpi(v.toLocaleString('en-US'), Math.round(prevOf(v, 9.4)).toLocaleString('en-US'), 9.4, true, 'blue');
    }
    case 'compliance-score': {
      const v = Math.min(100, M.compliance.score + wobble(s, 'cs', 3));
      return kpi(percent(v), percent(prevOf(v, 1.8)), 1.8, true, 'purple');
    }
    case 'health-trend': {
      // Healthy + at risk + critical = 100% of assets each month
      const healthy = t.map((x) => round1(70 + (x - 2) * 1.1 + Math.sin(x * 1.3 + h * 6) * 1.5 + wobble(s, 'ht', 3)));
      const critical = t.map((x) => round1(Math.max(2, 6 - (x - 2) * 0.25 + Math.cos(x + h * 3) * 0.8)));
      const risk = healthy.map((hv, i) => round1(100 - hv - critical[i]));
      const series: ChartSeries[] = [
        { name: 'Healthy', values: healthy, color: RA_COLORS.green, area: true },
        { name: 'At Risk', values: risk, color: RA_COLORS.orange },
        { name: 'Critical', values: critical, color: RA_COLORS.red }
      ];
      if (f.compare) series.push({ name: 'Healthy (previous period)', values: healthy.map((x) => round1(prevOf(x, 3.6))), color: RA_COLORS.lavender, dashed: true });
      return timeSeries(config.type, win.labels, series, (x) => percent(x, 0), 100, config.type === 'bar');
    }
    case 'work-order-trend': {
      // 348 work orders raised Jan–Oct; completions trail slightly behind
      const base = (M.maintenance.totalWorkOrders / 10) * s.share * per;
      const created = t.map((x) => Math.round(base * (1 + Math.sin(x * 0.9 + h * 4) * 0.15 + (x - 6) * 0.015)));
      const completed = created.map((c, i) => Math.round(c * (0.9 + Math.cos(t[i] * 1.4) * 0.05)));
      const series: ChartSeries[] = [{ name: 'Created', values: created, color: RA_COLORS.purple }, { name: 'Completed', values: completed, color: RA_COLORS.green }];
      if (f.compare) series.push({ name: 'Created (previous period)', values: created.map((x) => Math.round(prevOf(x, 5.2))), color: RA_COLORS.lavender, dashed: true, type: 'line' });
      return timeSeries(config.type, win.labels, series, (x) => compactNumber(x));
    }
    case 'maintenance-cost-by-category': {
      const cats = f.category === 'All categories' ? RA_CATEGORIES : [f.category];
      const items = cats.map((c) => ({ name: c, value: Math.round((COST_BY_CATEGORY[c] ?? 0) * s.siteShare * s.flow), color: CATEGORY_COLORS[RA_CATEGORIES.indexOf(c) % CATEGORY_COLORS.length] }));
      return categorical(config.type, items, (x) => money(x), 'Maintenance Cost');
    }
    case 'inventory-by-category': {
      const cats = f.category === 'All categories' ? RA_CATEGORIES : [f.category];
      const items = cats.map((c) => ({ name: c, value: Math.round((INVENTORY_BY_CATEGORY[c] ?? 0) * s.siteShare), color: CATEGORY_COLORS[RA_CATEGORIES.indexOf(c) % CATEGORY_COLORS.length] }));
      return categorical(config.type, items, (x) => money(x), 'Inventory Value');
    }
    case 'asset-status': {
      const total = Math.round(M.assets.total * s.share);
      const parts = allocate(total, STATUS_SLICES.map((x) => x[1]));
      return categorical(config.type, STATUS_SLICES.map(([name, , color], i) => ({ name, value: parts[i], color })), (x) => x.toLocaleString('en-US'), 'Total Assets');
    }
    case 'work-orders-by-priority': {
      const total = Math.round(M.maintenance.openWorkOrders * s.share);
      const parts = allocate(total, PRIORITY_SLICES.map((x) => x[1]));
      return categorical(config.type, PRIORITY_SLICES.map(([name, , color], i) => ({ name, value: parts[i], color })), (x) => String(x), 'Open Work Orders', true);
    }
    case 'assets-attention': {
      const list = ATTENTION_ASSETS.filter((a) => s.sites.includes(a.site) && (f.category === 'All categories' || a.category === f.category));
      const top = list.slice(0, config.span >= 8 ? 5 : 4);
      return top.length ? { empty: false, attention: top } : { empty: true };
    }
    case 'asset-locations': {
      const total = Math.round(M.assets.total * s.share);
      const parts = allocate(total, s.sites.map((x) => SITE_SHARE[x].share));
      const statusColors = [RA_COLORS.green, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.pink];
      if (config.type === 'map') {
        const points: MapPoint[] = [];
        const legend = STATUS_SLICES.filter((x) => x[0] !== 'Retired').map(([label, , color]) => ({ label, color, count: 0 }));
        s.sites.forEach((site, i) => {
          const pos = IOT_SITES.find((x) => x.name === site);
          if (!pos) return;
          const [active, maint, , missing] = allocate(parts[i], STATUS_SLICES.map((x) => x[1]));
          [active, maint, missing].forEach((n, k) => {
            legend[k].count += n;
            if (n) points.push({ lat: pos.lat + [0, 0.09, -0.08][k], lng: pos.lng + [0, 0.1, 0.12][k], color: legend[k].color, label: `${site}: ${n} ${legend[k].label.toLowerCase()}` });
          });
        });
        return { empty: false, points, legend };
      }
      const items = s.sites.map((site, i) => ({ name: site, value: parts[i], color: statusColors[i % statusColors.length] }));
      return categorical(config.type, items, (x) => x.toLocaleString('en-US'), 'Assets', config.type === 'bar');
    }
    case 'utilization-heatmap': {
      const cols = win.labels.map((l) => l.replace('\n', ' '));
      const catShift = f.category === 'All categories' ? 0 : (CATEGORY_SHARE[f.category] - 0.14) * 30;
      const values = s.sites.map((site) => t.map((x) => Math.round(Math.min(99, SITE_UTIL_BASE[site] + catShift + (x - 6) * 0.4 + Math.sin(x * 1.1 + hashUnit(site) * 6) * 4))));
      if (config.type === 'table') return { empty: false, table: { columns: ['Site', ...cols], rows: s.sites.map((site, i) => [site, ...values[i].map((v) => `${v}%`)]) } };
      return { empty: false, heat: { rows: s.sites, cols, values } };
    }
  }
  return { empty: true };
}

/** Rows for a widget's CSV export. */
export function widgetCsv(config: WidgetConfig, data: WidgetData): { header: string[]; rows: (string | number)[][] } {
  if (data.kpi) return { header: ['Metric', 'Value', 'Previous Period', 'Change %'], rows: [[config.title, data.kpi.value, data.kpi.prev, data.kpi.delta]] };
  if (data.table) return { header: data.table.columns, rows: data.table.rows };
  if (data.attention) {
    return { header: ['Asset ID', 'Asset Name', 'Category', 'Location', 'Health Score', 'Issue'], rows: data.attention.map((a) => [a.id, a.name, a.category, a.site, a.score, a.issue]) };
  }
  if (data.slices) return { header: ['Item', 'Value'], rows: data.slices.map((x) => [x.name, x.value]) };
  if (data.hbars) return { header: ['Item', 'Value'], rows: data.hbars.map((x) => [x.label, x.value]) };
  if (data.legend) return { header: ['Status', 'Assets'], rows: data.legend.map((x) => [x.label, x.count]) };
  if (data.heat) {
    const heat = data.heat;
    return { header: ['Site', ...heat.cols], rows: heat.rows.map((r, i) => [r, ...heat.values[i]]) };
  }
  if (data.labels && data.series) {
    const series = data.series;
    return { header: ['Label', ...series.map((x) => x.name)], rows: data.labels.map((l, i) => [l.replace('\n', ' '), ...series.map((x) => x.values[i])]) };
  }
  return { header: ['Message'], rows: [['No data for the current filters']] };
}
