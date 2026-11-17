import { ChartSeries, ChartSlice, HBarRow } from '../shared/charts';
import { MapPoint } from '../iot-utilization-analytics/iot-site-map/iot-site-map';

// Dashboard definitions and widget data. Saved dashboards and widget figures come from the dashboard / analytics
// APIs; until those exist there are no seed dashboards and every widget renders its empty state.

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

// ===== Saved dashboards =====

/** Groups a dashboard can be shared with (populated from the API). */
export const DASHBOARD_GROUPS: string[] = [];

/** Dashboards available before the user creates any (populated from the API). */
export const SEED_DASHBOARDS: Dashboard[] = [];

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

/** Builds what a widget shows for its data source, widget type and the page filters. No data source yet: always empty. */
export function buildWidgetData(_config: WidgetConfig, _f: DashFilters): WidgetData {
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
