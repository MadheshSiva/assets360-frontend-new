import { money, percent } from '../shared/analytics-common';
import { ChartSeries, ChartSlice, HBarRow, RA_COLORS, compactNumber } from '../shared/charts';
import { IOT_SITES } from '../iot-utilization-analytics/iot-utilization.data';
import { MapPoint } from '../iot-utilization-analytics/iot-site-map/iot-site-map';

// UI models for Interactive Dashboards and the mapping from the Report Analytics API
// (/api/interactive-dashboards) onto them. Dashboards, the metric catalog and every widget value come from the API.

export type WidgetType = 'kpi' | 'line' | 'bar' | 'donut' | 'table' | 'map' | 'heatmap';
/** Columns on the 12-column grid (the API's position.w). */
export type WidgetSpan = number;

/** Metric keys come from GET /options (total_assets, maintenance_cost_by_category, ...). */
export type MetricKey = string;

export interface WidgetSettings {
  limit: number | null;
  months: number | null;
  showComparison: boolean;
  orientation: string | null;
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  metric: MetricKey;
  title: string;
  span: WidgetSpan;
  /** Grid position kept so layout saves send back what the API stored. */
  x: number;
  y: number;
  h: number;
  settings: WidgetSettings;
}

export type Sharing = 'private' | 'people' | 'organization';
export type DashboardRole = 'Owner' | 'Editor' | 'Viewer';

export interface ShareEntry {
  id: string;
  name: string;
  permission: string;
}

export interface DashboardDefaultFilters {
  organization: string | null;
  location: string | null;
  assetCategory: string | null;
  datePreset: string;
  dateFrom: string | null;
  dateTo: string | null;
  timeZone: string;
}

export interface Dashboard {
  /** Business id, e.g. DSH-0001 */
  id: string;
  name: string;
  description: string;
  owner: string;
  sharing: Sharing;
  sharedWith: string[];
  groups: string[];
  sharedUsers: ShareEntry[];
  sharedGroups: ShareEntry[];
  sharedSummary: string;
  role: DashboardRole;
  canEdit: boolean;
  canShare: boolean;
  favorite: boolean;
  updatedAt: string;
  audienceRole: string | null;
  defaultFilters: DashboardDefaultFilters | null;
  widgetCount: number;
  widgets: WidgetConfig[];
  /** False for list items (GET /) until GET /{id} has filled in the widgets and sharing. */
  loaded: boolean;
}

export interface DashFilters {
  /** API date preset (This month, Last 30 days, ...) */
  period: string;
  /** Option values from GET /filters; '' means all */
  organization: string;
  location: string;
  category: string;
  compare: boolean;
}

export interface MetricDef {
  key: MetricKey;
  label: string;
  description: string;
  module: string;
  types: WidgetType[];
}

export interface WidgetTypeDef {
  type: WidgetType;
  label: string;
  span: WidgetSpan;
  height: number;
}

export interface DashboardTemplate {
  key: string;
  name: string;
  description: string;
  widgetCount: number;
}

// ===== Widget types: UI keys <-> API keys =====

const API_TYPES: Record<WidgetType, string> = {
  kpi: 'kpi_card', line: 'line_chart', bar: 'bar_chart', donut: 'donut_chart', table: 'table', map: 'map', heatmap: 'heatmap'
};

export function toApiType(type: WidgetType): string {
  return API_TYPES[type];
}

export function fromApiType(key: string | null | undefined): WidgetType | null {
  const entry = Object.entries(API_TYPES).find(([, v]) => v === key);
  return entry ? (entry[0] as WidgetType) : null;
}

/** Used until GET /options answers (labels and default sizes match the API catalog). */
export const WIDGET_TYPES: WidgetTypeDef[] = [
  { type: 'kpi', label: 'KPI Card', span: 3, height: 2 },
  { type: 'line', label: 'Line Chart', span: 7, height: 4 },
  { type: 'bar', label: 'Bar Chart', span: 5, height: 4 },
  { type: 'donut', label: 'Donut Chart', span: 4, height: 4 },
  { type: 'table', label: 'Table', span: 12, height: 4 },
  { type: 'map', label: 'Map', span: 4, height: 4 },
  { type: 'heatmap', label: 'Heatmap', span: 6, height: 4 }
];

/** Size choices in the Add Widget dialog (UI only). */
export const WIDGET_SIZES: { span: WidgetSpan; label: string }[] = [
  { span: 3, label: 'Small (1/4 width)' },
  { span: 4, label: 'Medium (1/3 width)' },
  { span: 6, label: 'Half width' },
  { span: 8, label: 'Large (2/3 width)' },
  { span: 12, label: 'Full width' }
];

/**
 * Share dialog groups. The Report Analytics API stores whatever ids it is given and has no group directory,
 * so the pick list stays client-side.
 */
export const DASHBOARD_GROUPS = ['Executive Team', 'Maintenance Team', 'Finance Team', 'Operations Managers', 'Site Supervisors'];

export const GRID_COLUMNS = 12;

/** Lays widgets out left to right in list order, wrapping at 12 columns (the order the CSS grid shows them in). */
export function packLayout(widgets: WidgetConfig[]): WidgetConfig[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return widgets.map((w) => {
    const span = Math.min(GRID_COLUMNS, Math.max(1, Math.round(w.span)));
    if (x + span > GRID_COLUMNS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    const placed = { ...w, span, x, y };
    x += span;
    rowH = Math.max(rowH, w.h || 1);
    return placed;
  });
}

/** Grid order: top to bottom, then left to right. */
export function byPosition(a: WidgetConfig, b: WidgetConfig): number {
  return a.y - b.y || a.x - b.x;
}

// ===== Widget data (what a widget draws) =====

export interface KpiData {
  value: string;
  prev: string;
  delta: number | null;
  /** '%' for percent change, ' pts' for rates (percentage points) */
  unit: string;
  good: boolean;
  tone: string;
}

export interface AttentionAsset {
  /** Asset record id (always present) */
  key: string;
  /** Asset ID shown to users, e.g. AST-2026-DXB-000247 */
  id: string;
  name: string;
  site: string;
  score: number | null;
  status: string;
  issue: string;
  issues: string[];
}

export interface WidgetData {
  empty: boolean;
  loading?: boolean;
  error?: string;
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
  heat?: { rows: string[]; cols: string[]; values: number[][]; max: number };
}

export const LOADING_DATA: WidgetData = { empty: true, loading: true };

// ===== API widget data (GET /{id}/data, /{id}/widgets/{widgetId}/data) =====

interface KpiDto {
  value: number | null;
  format: string;
  previousValue: number | null;
  change: number | null;
  changeUnit: string;
  trend: string;
}
interface CategoryDto {
  total: number;
  format: string;
  items: { label: string; value: number; percentage: number }[];
}
interface SeriesDto {
  categories: string[];
  series: { name: string; values: number[] }[];
}
interface TableDto {
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, unknown>[];
  totalRows: number;
}
interface MapDto {
  locations: { location: string; latitude: number | null; longitude: number | null; state: string; totalAssets: number; assetsByState: Record<string, number> }[];
  legend: { label: string; value: number; percentage: number }[];
}
interface MatrixDto {
  rows: string[];
  columns: string[];
  values: number[][];
  max: number;
}

export interface WidgetDataDto {
  widgetId: string;
  widgetType: string;
  metric: string;
  title: string;
  shape: string;
  data: unknown;
  error: string | null;
}

const KPI_TONES: Record<string, string> = {
  total_assets: 'purple', active_work_orders: 'blue', preventive_compliance: 'green', inventory_value: 'orange', maintenance_cost: 'pink'
};

/** KPIs where a fall is good news. */
const LOWER_IS_BETTER = ['active_work_orders', 'maintenance_cost'];

const NAMED_COLORS: Record<string, string> = {
  critical: RA_COLORS.red, high: RA_COLORS.orange, medium: RA_COLORS.blue, low: RA_COLORS.green,
  healthy: RA_COLORS.green, 'at risk': RA_COLORS.orange,
  active: RA_COLORS.green, operational: RA_COLORS.green, maintenance: RA_COLORS.orange, 'under maintenance': RA_COLORS.blue,
  inspection: RA_COLORS.blue, retired: RA_COLORS.grey, inactive: RA_COLORS.grey, missing: RA_COLORS.pink, other: RA_COLORS.grey
};

const PALETTE = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.violet, RA_COLORS.teal, RA_COLORS.sky];

function colorFor(label: string, index: number, named: boolean): string {
  return (named && NAMED_COLORS[label.trim().toLowerCase()]) || PALETTE[index % PALETTE.length];
}

function formatter(format: string | null | undefined): (v: number) => string {
  if (format === 'currency') return (v) => money(v);
  if (format === 'percent') return (v) => percent(v);
  return (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : compactNumber(v));
}

function categorical(type: WidgetType, items: { name: string; value: number; color: string }[], format: (v: number) => string, center: string, horizontal = false): WidgetData {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!items.length || !total) return { empty: true };
  if (type === 'donut') return { empty: false, slices: items, centerValue: format(total), centerLabel: center, format };
  if (type === 'table') {
    return { empty: false, table: { columns: ['Item', 'Value', 'Share'], rows: [...items.map((i) => [i.name, format(i.value), percent((i.value / total) * 100)]), ['Total', format(total), '100%']] } };
  }
  if (horizontal) return { empty: false, hbars: items.map((i) => ({ label: i.name, value: i.value, display: format(i.value), color: i.color })) };
  return { empty: false, labels: items.map((i) => i.name), series: [{ name: center, values: items.map((i) => i.value), color: RA_COLORS.purple }], format };
}

function timeSeries(type: WidgetType, labels: string[], series: ChartSeries[], format: (v: number) => string, stacked = false): WidgetData {
  if (!labels.length) return { empty: true };
  if (type === 'table') {
    return { empty: false, table: { columns: ['Period', ...series.map((s) => s.name)], rows: labels.map((l, i) => [l, ...series.map((s) => format(s.values[i]))]) } };
  }
  if (type === 'bar') return { empty: false, labels, series: series.map((s) => ({ ...s, type: 'bar' as const, dashed: false, area: false })), format, stacked };
  return { empty: false, labels, series, format };
}

function text(value: unknown, fallback = '—'): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

const SITE_COORDS = new Map(IOT_SITES.map((s) => [s.name.toLowerCase(), { lat: s.lat, lng: s.lng }]));

/** Turns one widget's API data into what the widget draws. */
export function toWidgetData(config: WidgetConfig, dto: WidgetDataDto | undefined): WidgetData {
  if (!dto) return LOADING_DATA;
  if (dto.error || dto.data === null || dto.data === undefined) return { empty: true, error: dto.error ?? undefined };
  const type = config.type;

  switch (dto.shape) {
    case 'kpi': {
      const d = dto.data as KpiDto;
      const format = formatter(d.format);
      const lowerBetter = LOWER_IS_BETTER.includes(config.metric);
      const change = d.change;
      return {
        empty: false,
        kpi: {
          value: d.value === null ? '—' : format(d.value),
          prev: d.previousValue === null ? '—' : format(d.previousValue),
          delta: change,
          unit: d.changeUnit === 'points' ? ' pts' : '%',
          good: change === null || change === 0 || (lowerBetter ? change < 0 : change > 0),
          tone: KPI_TONES[config.metric] ?? 'purple'
        }
      };
    }
    case 'category': {
      const d = dto.data as CategoryDto;
      const items = d.items.map((i, k) => ({ name: i.label, value: i.value, color: colorFor(i.label, k, true) }));
      const center = config.metric === 'maintenance_cost_by_category' ? 'Maintenance Cost' : config.metric === 'open_work_orders_by_priority' ? 'Open Work Orders' : 'Assets';
      return categorical(type, items, formatter(d.format), center, type === 'bar' && config.settings.orientation === 'horizontal');
    }
    case 'series': {
      const d = dto.data as SeriesDto;
      const series: ChartSeries[] = d.series.map((s, k) => ({ name: s.name, values: s.values, color: colorFor(s.name, k, true), area: k === 0 && type === 'line' }));
      return timeSeries(type, d.categories, series, formatter('number'), type === 'bar');
    }
    case 'table': {
      const d = dto.data as TableDto;
      if (!d.rows.length) return { empty: true };
      if (config.metric === 'assets_requiring_attention') {
        return {
          empty: false,
          attention: d.rows.map((r) => ({
            key: text(r['id'], text(r['asset_id'])),
            id: text(r['asset_id']),
            name: text(r['asset_name']),
            site: text(r['location']),
            score: typeof r['health_score'] === 'number' ? Math.round(r['health_score'] as number) : null,
            status: text(r['health_status'], 'Not assessed'),
            issue: text(r['issue']),
            issues: Array.isArray(r['issues']) ? (r['issues'] as string[]) : []
          }))
        };
      }
      return { empty: false, table: { columns: d.columns.map((c) => c.label), rows: d.rows.map((r) => d.columns.map((c) => text(r[c.key]))) } };
    }
    case 'map': {
      const d = dto.data as MapDto;
      if (!d.locations.length) return { empty: true };
      const fmt = formatter('number');
      if (type === 'table') {
        return { empty: false, table: { columns: ['Location', 'State', 'Assets'], rows: d.locations.map((l) => [l.location, l.state, fmt(l.totalAssets)]) } };
      }
      const legend = d.legend.map((l, k) => ({ label: l.label, color: colorFor(l.label, k, true), count: l.value }));
      // The API has no coordinates yet; known sites are placed by name
      const points: MapPoint[] = [];
      d.locations.forEach((l, k) => {
        const pos = l.latitude !== null && l.longitude !== null ? { lat: l.latitude, lng: l.longitude } : SITE_COORDS.get(l.location.toLowerCase());
        if (pos) points.push({ lat: pos.lat, lng: pos.lng, color: colorFor(l.state, k, true), label: `${l.location}: ${fmt(l.totalAssets)} assets (${l.state})` });
      });
      if (!points.length) {
        // Nothing can be pinned: show assets per location instead of an empty map
        return { empty: false, hbars: d.locations.map((l, k) => ({ label: l.location, value: l.totalAssets, display: fmt(l.totalAssets), color: colorFor(l.state, k, true) })) };
      }
      return { empty: false, points, legend };
    }
    case 'matrix': {
      const d = dto.data as MatrixDto;
      if (!d.rows.length || !d.columns.length) return { empty: true };
      if (type === 'table') {
        return { empty: false, table: { columns: ['Location', ...d.columns], rows: d.rows.map((r, i) => [r, ...d.values[i]]) } };
      }
      return { empty: false, heat: { rows: d.rows, cols: d.columns, values: d.values, max: d.max || 1 } };
    }
  }
  return { empty: true };
}

/** Rows for a widget's CSV export. */
export function widgetCsv(config: WidgetConfig, data: WidgetData): { header: string[]; rows: (string | number)[][] } {
  if (data.kpi) return { header: ['Metric', 'Value', 'Previous Period', `Change${data.kpi.unit.trim() === '%' ? ' %' : ' (pts)'}`], rows: [[config.title, data.kpi.value, data.kpi.prev, data.kpi.delta ?? '']] };
  if (data.table) return { header: data.table.columns, rows: data.table.rows };
  if (data.attention) {
    return { header: ['Asset ID', 'Asset Name', 'Location', 'Health Score', 'Issue'], rows: data.attention.map((a) => [a.id, a.name, a.site, a.score ?? '', a.issue]) };
  }
  if (data.slices) return { header: ['Item', 'Value'], rows: data.slices.map((x) => [x.name, x.value]) };
  if (data.hbars) return { header: ['Item', 'Value'], rows: data.hbars.map((x) => [x.label, x.value]) };
  if (data.legend) return { header: ['State', 'Locations'], rows: data.legend.map((x) => [x.label, x.count]) };
  if (data.heat) {
    const heat = data.heat;
    return { header: ['Location', ...heat.cols], rows: heat.rows.map((r, i) => [r, ...heat.values[i]]) };
  }
  if (data.labels && data.series) {
    const series = data.series;
    return { header: ['Label', ...series.map((x) => x.name)], rows: data.labels.map((l, i) => [l, ...series.map((x) => x.values[i])]) };
  }
  return { header: ['Message'], rows: [[data.error ?? 'No data for the current filters']] };
}
