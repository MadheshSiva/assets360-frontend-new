import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CURRENT_USER, RA_CATEGORIES, RA_LOCATIONS, RA_ORGANIZATIONS } from '../shared/analytics-common';
import {
  CategoryDto, DashFilters, Dashboard, DashboardDefaultFilters, DashboardTemplate, KpiDto, MapDto, MatrixDto, MetricDef, SeriesDto, ShareEntry,
  Sharing, TableDto, WIDGET_TYPES, WidgetConfig, WidgetDataDto, WidgetSettings, WidgetType, WidgetTypeDef, packLayout, toApiType, toWidgetData,
  widgetCsv
} from './interactive-dashboards.data';

export interface FilterOption {
  value: string;
  label: string;
}

export interface DashboardData {
  generatedAt: Date;
  widgets: Record<string, WidgetDataDto>;
}

export interface NewWidgetRequest {
  type: WidgetType;
  metric: string;
  title: string;
  span: number;
}

// ===== Static demo catalog =====

type Shape = 'kpi' | 'category' | 'series' | 'table' | 'map' | 'matrix';

interface MetricSeed extends MetricDef {
  shape: Shape;
}

const m = (key: string, label: string, module: string, description: string, shape: Shape, types: WidgetType[]): MetricSeed => ({
  key, label, module, description, shape, types
});

const METRICS: MetricSeed[] = [
  m('total_assets', 'Total Assets', 'Assets', 'Assets in the register', 'kpi', ['kpi']),
  m('active_work_orders', 'Active Work Orders', 'Maintenance', 'Open work orders right now', 'kpi', ['kpi']),
  m('preventive_compliance', 'PM Compliance', 'Maintenance', 'Preventive maintenance done on time', 'kpi', ['kpi']),
  m('inventory_value', 'Inventory Value', 'Inventory', 'Value of stock on hand', 'kpi', ['kpi']),
  m('maintenance_cost', 'Maintenance Cost', 'Maintenance', 'Maintenance spend for the period', 'kpi', ['kpi']),
  m('average_health_score', 'Average Health Score', 'Assets', 'Average asset health (0–100)', 'kpi', ['kpi']),
  m('connected_iot_assets', 'Connected IoT Assets', 'Tracking & IoT', 'Assets reporting telemetry', 'kpi', ['kpi']),
  m('compliance_score', 'Compliance Score', 'Audit & Compliance', 'Audit and certification compliance', 'kpi', ['kpi']),
  m('asset_health_trend', 'Asset Health Trend', 'Assets', 'Healthy / at risk / critical assets by month', 'series', ['line', 'bar', 'table']),
  m('work_orders_created_vs_completed', 'Work Orders Created vs Completed', 'Maintenance', 'Work order flow by month', 'series', ['line', 'bar', 'table']),
  m('maintenance_cost_by_category', 'Maintenance Cost by Category', 'Maintenance', 'Spend split by asset category', 'category', ['bar', 'donut', 'table']),
  m('asset_status_distribution', 'Asset Status Distribution', 'Assets', 'Active, under maintenance, retired, missing', 'category', ['donut', 'bar', 'table']),
  m('open_work_orders_by_priority', 'Open Work Orders by Priority', 'Maintenance', 'Open work orders by priority', 'category', ['bar', 'donut', 'table']),
  m('inventory_value_by_category', 'Inventory Value by Category', 'Inventory', 'Stock value per asset category', 'category', ['bar', 'donut', 'table']),
  m('assets_requiring_attention', 'Assets Requiring Attention', 'Assets', 'Lowest health scores and open issues', 'table', ['table']),
  m('upcoming_preventive_maintenance', 'Upcoming Preventive Maintenance', 'Maintenance', 'Preventive work due in the next 14 days', 'table', ['table']),
  m('asset_locations', 'Asset Locations', 'Assets', 'Assets per site by health state', 'map', ['map', 'table']),
  m('utilization_by_site_month', 'Utilization by Site and Month', 'Tracking & IoT', 'Average utilization heatmap', 'matrix', ['heatmap', 'table'])
];

const DATE_PRESETS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
const DEFAULT_PRESET = 'This month';

type WidgetSeed = [WidgetType, string, string, number?];

const TEMPLATE_SEEDS: (DashboardTemplate & { widgets: WidgetSeed[] })[] = [
  {
    key: 'executive', name: 'Executive Overview', description: 'Headline KPIs, health and cost trends, assets needing attention', widgetCount: 0,
    widgets: [
      ['kpi', 'total_assets', 'Total Assets'], ['kpi', 'active_work_orders', 'Active Work Orders'], ['kpi', 'preventive_compliance', 'PM Compliance'],
      ['kpi', 'maintenance_cost', 'Maintenance Cost'], ['line', 'asset_health_trend', 'Asset Health Trend'],
      ['bar', 'maintenance_cost_by_category', 'Maintenance Cost by Category'], ['donut', 'asset_status_distribution', 'Asset Status'],
      ['map', 'asset_locations', 'Asset Locations'], ['bar', 'open_work_orders_by_priority', 'Open Work Orders by Priority', 4],
      ['table', 'assets_requiring_attention', 'Assets Requiring Attention']
    ]
  },
  {
    key: 'maintenance', name: 'Maintenance Operations', description: 'Work order flow, priorities, PM compliance and upcoming work', widgetCount: 0,
    widgets: [
      ['kpi', 'active_work_orders', 'Active Work Orders'], ['kpi', 'preventive_compliance', 'PM Compliance'], ['kpi', 'maintenance_cost', 'Maintenance Cost'],
      ['kpi', 'average_health_score', 'Average Health Score'], ['bar', 'work_orders_created_vs_completed', 'Work Orders Created vs Completed', 8],
      ['donut', 'open_work_orders_by_priority', 'Open Work Orders by Priority'], ['table', 'upcoming_preventive_maintenance', 'Upcoming Preventive Maintenance']
    ]
  },
  {
    key: 'inventory-finance', name: 'Inventory & Finance', description: 'Stock value and maintenance spend by category', widgetCount: 0,
    widgets: [
      ['kpi', 'inventory_value', 'Inventory Value', 4], ['kpi', 'maintenance_cost', 'Maintenance Cost', 4], ['kpi', 'total_assets', 'Total Assets', 4],
      ['bar', 'inventory_value_by_category', 'Inventory Value by Category', 6], ['donut', 'maintenance_cost_by_category', 'Maintenance Cost Split', 6],
      ['table', 'maintenance_cost_by_category', 'Maintenance Cost by Category (table)']
    ]
  },
  {
    key: 'iot', name: 'Site Utilization', description: 'Connected assets, site map and utilization heatmap', widgetCount: 0,
    widgets: [
      ['kpi', 'connected_iot_assets', 'Connected IoT Assets', 4], ['kpi', 'total_assets', 'Total Assets', 4], ['kpi', 'average_health_score', 'Average Health Score', 4],
      ['heatmap', 'utilization_by_site_month', 'Utilization by Site and Month', 8], ['map', 'asset_locations', 'Asset Locations'],
      ['table', 'asset_locations', 'Assets per Site']
    ]
  }
];

const TEMPLATES = TEMPLATE_SEEDS.map((t) => ({ ...t, widgetCount: t.widgets.length }));

// ===== Helpers =====

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SITES = ['Dubai HQ', 'Jebel Ali Warehouse', 'Sharjah Facility', 'Abu Dhabi Office', 'Al Ain Depot', 'Riyadh Office', 'London Office', 'Singapore Office'];
const SITE_CODES: Record<string, string> = {
  'Dubai HQ': 'DXB', 'Jebel Ali Warehouse': 'JAW', 'Sharjah Facility': 'SHJ', 'Abu Dhabi Office': 'AUH', 'Al Ain Depot': 'AAN', 'Riyadh Office': 'RUH',
  'London Office': 'LON', 'Singapore Office': 'SIN'
};
const SITE_ASSETS: Record<string, number> = {
  'Dubai HQ': 3_412, 'Jebel Ali Warehouse': 2_286, 'Sharjah Facility': 1_954, 'Abu Dhabi Office': 1_538, 'Al Ain Depot': 1_206, 'Riyadh Office': 1_164,
  'London Office': 512, 'Singapore Office': 414
};
const TOTAL_ASSETS = Object.values(SITE_ASSETS).reduce((a, b) => a + b, 0);

/** Deterministic 0..1 from a string. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function dateText(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ago(minutes: number): string {
  return dateText(new Date(Date.now() - minutes * 60_000));
}

function newSettings(): WidgetSettings {
  return { limit: null, months: null, showComparison: true, orientation: null };
}

let widgetSeq = 1;

function widget(type: WidgetType, metric: string, title: string, span?: number): WidgetConfig {
  const def = WIDGET_TYPES.find((t) => t.type === type)!;
  return { id: `W-${String(widgetSeq++).padStart(4, '0')}`, type, metric, title, span: span ?? def.span, x: 0, y: 0, h: def.height, settings: newSettings() };
}

function fromTemplate(key: string): WidgetConfig[] {
  const t = TEMPLATES.find((x) => x.key === key);
  return packLayout((t?.widgets ?? []).map(([type, metric, title, span]) => widget(type, metric, title, span)));
}

function summary(sharing: Sharing, users: ShareEntry[], groups: ShareEntry[]): string {
  if (sharing === 'organization') return 'Everyone in the organization can view';
  if (sharing === 'private') return 'Only you';
  const parts = [];
  if (users.length) parts.push(`${users.length} ${users.length === 1 ? 'person' : 'people'}`);
  if (groups.length) parts.push(`${groups.length} group${groups.length === 1 ? '' : 's'}`);
  return parts.length ? `Shared with ${parts.join(' and ')}` : 'Only you';
}

function entries(names: string[], existing: ShareEntry[] = []): ShareEntry[] {
  return names.map((name) => existing.find((e) => e.name === name) ?? { id: name, name, permission: 'View' });
}

interface DashSeed {
  id: string;
  name: string;
  description: string;
  owner: string;
  sharing: Sharing;
  people: string[];
  groups: string[];
  favorite: boolean;
  updatedAgoMin: number;
  template: string;
  defaults?: Partial<DashboardDefaultFilters>;
}

function build(s: DashSeed): Dashboard {
  const mine = s.owner === CURRENT_USER.name;
  const role = mine ? 'Owner' : s.sharing === 'organization' ? 'Viewer' : 'Editor';
  const users = entries(s.people);
  const groups = entries(s.groups);
  const widgets = fromTemplate(s.template);
  return {
    id: s.id, name: s.name, description: s.description, owner: s.owner, sharing: s.sharing, sharedWith: s.people, groups: s.groups,
    sharedUsers: users, sharedGroups: groups, sharedSummary: summary(s.sharing, users, groups), role, canEdit: role !== 'Viewer', canShare: role === 'Owner',
    favorite: s.favorite, updatedAt: ago(s.updatedAgoMin), audienceRole: null,
    defaultFilters: s.defaults
      ? { organization: null, location: null, assetCategory: null, datePreset: DEFAULT_PRESET, dateFrom: null, dateTo: null, timeZone: 'Asia/Dubai', ...s.defaults }
      : null,
    widgetCount: widgets.length, widgets, loaded: true
  };
}

function seedDashboards(): Dashboard[] {
  const seeds: DashSeed[] = [
    {
      id: 'DSH-0001', name: 'Executive Overview', description: 'Group-wide asset, maintenance and cost picture for the leadership team.',
      owner: CURRENT_USER.name, sharing: 'organization', people: [], groups: [], favorite: true, updatedAgoMin: 95, template: 'executive',
      defaults: { datePreset: 'This month' }
    },
    {
      id: 'DSH-0002', name: 'Maintenance Operations', description: 'Daily work order flow and preventive maintenance for supervisors.',
      owner: CURRENT_USER.name, sharing: 'people', people: ['Aisha Rahman', 'Ahmed Khan'], groups: ['Maintenance Team'], favorite: false,
      updatedAgoMin: 1_440 + 210, template: 'maintenance', defaults: { datePreset: 'Last 30 days' }
    },
    {
      id: 'DSH-0003', name: 'Inventory & Finance', description: 'Stock value and maintenance spend by asset category.',
      owner: CURRENT_USER.name, sharing: 'private', people: [], groups: [], favorite: false, updatedAgoMin: 3 * 1_440 + 40, template: 'inventory-finance'
    },
    {
      id: 'DSH-0004', name: 'UAE Site Utilization', description: 'Connected assets and utilization across the UAE sites.',
      owner: 'Daniel Kim', sharing: 'people', people: [CURRENT_USER.name, 'James Tan'], groups: ['Operations Managers'], favorite: true,
      updatedAgoMin: 2 * 1_440 + 300, template: 'iot', defaults: { organization: 'Purple IQ UAE', datePreset: 'This quarter' }
    },
    {
      id: 'DSH-0005', name: 'Compliance Board Pack', description: 'Monthly pack for the compliance board.',
      owner: 'Fatima Noor', sharing: 'organization', people: [], groups: [], favorite: false, updatedAgoMin: 6 * 1_440 + 120, template: 'executive',
      defaults: { datePreset: 'Last month' }
    }
  ];
  return seeds.map(build);
}

// ===== Widget data =====

interface Scope {
  /** Share of assets / amounts in the filters */
  share: number;
  /** Points added to rates */
  offset: number;
  /** Months the period covers (amounts accumulate) */
  months: number;
  /** Sites in scope */
  sites: string[];
  seed: string;
}

function periodMonths(period: string): number {
  const day = new Date().getDate();
  switch (period) {
    case 'Today':
      return 1 / 30;
    case 'Last 7 days':
      return 7 / 30;
    case 'Last 30 days':
    case 'Last month':
      return 1;
    case 'This quarter':
      return (new Date().getMonth() % 3) + day / 30;
    case 'This year':
      return new Date().getMonth() + day / 30;
    default:
      return day / 30;
  }
}

function scopeOf(f: DashFilters): Scope {
  const ORG_SITES: Record<string, string[]> = {
    'Purple IQ UAE': ['Dubai HQ', 'Jebel Ali Warehouse', 'Sharjah Facility', 'Abu Dhabi Office', 'Al Ain Depot'],
    'Purple IQ KSA': ['Riyadh Office'],
    'Purple IQ Qatar': ['Dubai HQ']
  };
  let sites = SITES.slice();
  if (f.organization && ORG_SITES[f.organization]) sites = sites.filter((s) => ORG_SITES[f.organization].includes(s));
  if (f.location) sites = SITES.includes(f.location) ? sites.filter((s) => s === f.location) : sites.slice(0, 1);
  if (!sites.length) sites = [SITES[0]];
  let share = sites.reduce((a, s) => a + SITE_ASSETS[s], 0) / TOTAL_ASSETS;
  if (f.category) share *= 0.08 + hash(f.category) * 0.2;
  const seed = `${f.organization}|${f.location}|${f.category}|${f.period}`;
  const offset = f.organization || f.location || f.category ? (hash(seed) - 0.5) * 6 : 0;
  return { share, offset, months: periodMonths(f.period), sites, seed };
}

function monthLabels(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });
}

function wave(key: string, i: number): number {
  return Math.sin(i * 1.1 + hash(key) * 6) * 0.5 + (hash(`${key}:${i}`) - 0.5) * 0.6;
}

function kpi(value: number, previous: number, format: string, points = false): KpiDto {
  const change = points ? Number((value - previous).toFixed(1)) : previous ? Number((((value - previous) / previous) * 100).toFixed(1)) : null;
  return { value, format, previousValue: previous, change, changeUnit: points ? 'points' : 'percent', trend: (change ?? 0) >= 0 ? 'up' : 'down' };
}

function category(format: string, items: [string, number][]): CategoryDto {
  const total = items.reduce((a, [, v]) => a + v, 0);
  return { total, format, items: items.map(([label, value]) => ({ label, value, percentage: total ? Number(((value / total) * 100).toFixed(1)) : 0 })) };
}

function metricData(metric: string, w: WidgetConfig, s: Scope): unknown {
  const n = (v: number) => Math.max(0, Math.round(v * s.share));
  const amount = (perMonth: number) => Math.round(perMonth * s.share * s.months);
  const rate = (v: number) => Number(Math.max(0, Math.min(99.9, v + s.offset)).toFixed(1));
  const months = w.settings.months ?? 6;
  switch (metric) {
    case 'total_assets':
      return kpi(n(TOTAL_ASSETS), n(TOTAL_ASSETS - 186), 'number');
    case 'active_work_orders':
      return kpi(n(642), n(688), 'number');
    case 'preventive_compliance':
      return kpi(rate(92.4), rate(90.8), 'percent', true);
    case 'inventory_value':
      return kpi(n(3_482_600), n(3_390_100), 'currency');
    case 'maintenance_cost':
      return kpi(amount(186_400), amount(172_900), 'currency');
    case 'average_health_score':
      return kpi(rate(84.6), rate(83.9), 'number', true);
    case 'connected_iot_assets':
      return kpi(n(8_914), n(8_602), 'number');
    case 'compliance_score':
      return kpi(rate(93.1), rate(91.7), 'percent', true);
    case 'asset_health_trend': {
      const labels = monthLabels(months);
      const total = n(TOTAL_ASSETS);
      const critical = labels.map((_, i) => Math.round(total * (0.032 - i * 0.0012 + wave('crit', i) * 0.004)));
      const risk = labels.map((_, i) => Math.round(total * (0.118 - i * 0.003 + wave('risk', i) * 0.01)));
      return {
        categories: labels,
        series: [
          { name: 'Healthy', values: labels.map((_, i) => total - critical[i] - risk[i]) },
          { name: 'At Risk', values: risk },
          { name: 'Critical', values: critical }
        ]
      } satisfies SeriesDto;
    }
    case 'work_orders_created_vs_completed': {
      const labels = monthLabels(months);
      const created = labels.map((_, i) => n(1_180 + wave('wo-c', i) * 160 + i * 12));
      return {
        categories: labels,
        series: [
          { name: 'Created', values: created },
          { name: 'Completed', values: created.map((c, i) => Math.round(c * (0.94 + wave('wo-d', i) * 0.06))) }
        ]
      } satisfies SeriesDto;
    }
    case 'maintenance_cost_by_category':
      return category('currency', [
        ['Vehicles', amount(52_300)], ['Machinery', amount(44_800)], ['HVAC', amount(31_600)], ['Power & Electrical', amount(24_900)],
        ['Facilities', amount(18_700)], ['IT Equipment', amount(9_600)], ['Safety & PPE', amount(4_500)]
      ]);
    case 'asset_status_distribution': {
      const total = n(TOTAL_ASSETS);
      const maint = Math.round(total * 0.071);
      const inspection = Math.round(total * 0.034);
      const retired = Math.round(total * 0.046);
      const missing = Math.round(total * 0.0029);
      return category('number', [
        ['Active', total - maint - inspection - retired - missing], ['Under Maintenance', maint], ['Inspection', inspection], ['Retired', retired], ['Missing', missing]
      ]);
    }
    case 'open_work_orders_by_priority':
      return category('number', [['Critical', n(38)], ['High', n(146)], ['Medium', n(291)], ['Low', n(167)]]);
    case 'inventory_value_by_category':
      return category('currency', [
        ['Vehicles', n(812_400)], ['Machinery', n(946_300)], ['HVAC', n(503_900)], ['Power & Electrical', n(612_800)], ['IT Equipment', n(377_200)],
        ['Facilities', n(148_600)], ['Safety & PPE', n(81_400)]
      ]);
    case 'assets_requiring_attention': {
      const rows = [
        ['Cummins C550 Generator', 'Power & Electrical', 31, 'Critical', 'Coolant temperature above limit', ['Overdue PM', 'Open critical finding']],
        ['Carrier 30XA Chiller #2', 'HVAC', 38, 'Critical', 'Compressor vibration trending up', ['Vibration alarm', '2 open work orders']],
        ['Caterpillar 320 Excavator', 'Machinery', 44, 'At Risk', 'Hydraulic leak reported', ['Open corrective work order']],
        ['Toyota Hilux 2.8 4x4 (D 48213)', 'Vehicles', 49, 'At Risk', 'Brake pads below 20%', ['Inspection failed']],
        ['Atlas Copco GA37 Compressor', 'Machinery', 52, 'At Risk', 'Service interval exceeded by 140 h', ['Overdue PM']],
        ['Schneider Galaxy VS UPS', 'Power & Electrical', 55, 'At Risk', 'Battery capacity at 71%', ['Battery replacement due']],
        ['Hyster H3.0FT Forklift', 'Vehicles', 58, 'At Risk', 'Mast chain wear', ['Open finding']],
        ['Dell PowerEdge R750 (Rack B4)', 'IT Equipment', 61, 'At Risk', 'Warranty expires in 21 days', ['Warranty expiring']]
      ] as const;
      const limit = w.settings.limit ?? 6;
      return {
        columns: [
          { key: 'asset_id', label: 'Asset ID', type: 'text' }, { key: 'asset_name', label: 'Asset Name', type: 'text' },
          { key: 'location', label: 'Location', type: 'text' }, { key: 'health_score', label: 'Health Score', type: 'number' },
          { key: 'issue', label: 'Issue', type: 'text' }
        ],
        rows: rows.slice(0, limit).map((r, i) => {
          const site = s.sites[i % s.sites.length];
          const id = `AST-2026-${SITE_CODES[site]}-${String(247 + i * 389).padStart(6, '0')}`;
          return {
            id, asset_id: id, asset_name: r[0], category: r[1], location: site, health_score: Math.max(5, Math.round(r[2] + s.offset)),
            health_status: r[3], issue: r[4], issues: [...r[5]]
          };
        }),
        totalRows: rows.length
      } satisfies TableDto;
    }
    case 'upcoming_preventive_maintenance': {
      const tasks = [
        ['HVAC quarterly service', 'Carrier 30XA Chiller #1', 'Rahul Mehta', 6.5], ['Generator load bank test', 'Cummins C550 Generator', 'Ahmed Khan', 4],
        ['Forklift 500 h service', 'Hyster H3.0FT Forklift', 'John Mathew', 3], ['Fire pump weekly run', 'Grundfos Fire Pump Set', 'Omar Khalid', 1],
        ['Vehicle 20,000 km service', 'Toyota Hilux 2.8 4x4 (D 51877)', 'Michael Chen', 2.5], ['UPS battery inspection', 'Schneider Galaxy VS UPS', 'Ahmed Khan', 1.5],
        ['Compressor oil change', 'Atlas Copco GA37 Compressor', 'Rahul Mehta', 2]
      ] as const;
      const day = 86_400_000;
      return {
        columns: [
          { key: 'due', label: 'Due', type: 'date' }, { key: 'task', label: 'Task', type: 'text' }, { key: 'asset', label: 'Asset', type: 'text' },
          { key: 'location', label: 'Location', type: 'text' }, { key: 'technician', label: 'Technician', type: 'text' }, { key: 'hours', label: 'Est. Hours', type: 'number' }
        ],
        rows: tasks.slice(0, w.settings.limit ?? tasks.length).map((t, i) => {
          const d = new Date(Date.now() + (1 + i * 2) * day);
          return {
            due: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, task: t[0], asset: t[1],
            location: s.sites[i % s.sites.length], technician: t[2], hours: t[3]
          };
        }),
        totalRows: tasks.length
      } satisfies TableDto;
    }
    case 'asset_locations': {
      const states = s.sites.map((site) => {
        const h = hash(`${site}|${s.seed}`);
        return h < 0.15 ? 'Critical' : h < 0.45 ? 'At Risk' : 'Healthy';
      });
      const scale = s.share / (s.sites.reduce((a, x) => a + SITE_ASSETS[x], 0) / TOTAL_ASSETS);
      const locations = s.sites.map((site, i) => {
        const total = Math.max(1, Math.round(SITE_ASSETS[site] * scale));
        const critical = Math.round(total * 0.03);
        const risk = Math.round(total * 0.11);
        return {
          location: site, latitude: null, longitude: null, state: states[i], totalAssets: total,
          assetsByState: { Healthy: total - critical - risk, 'At Risk': risk, Critical: critical }
        };
      });
      const legend = ['Healthy', 'At Risk', 'Critical'].map((label) => {
        const value = states.filter((x) => x === label).length;
        return { label, value, percentage: Number(((value / states.length) * 100).toFixed(1)) };
      });
      return { locations, legend: legend.filter((l) => l.value > 0) } satisfies MapDto;
    }
    case 'utilization_by_site_month': {
      const cols = monthLabels(months).map((l) => l.slice(0, 3));
      const values = s.sites.map((site) => cols.map((_, i) => Math.round(Math.max(35, Math.min(96, 58 + hash(site) * 28 + wave(site, i) * 12 + s.offset)))));
      return { rows: s.sites, columns: cols, values, max: 100 } satisfies MatrixDto;
    }
  }
  return null;
}

function dataFor(w: WidgetConfig, s: Scope): WidgetDataDto {
  const def = METRICS.find((x) => x.key === w.metric);
  const data = def ? metricData(def.key, w, s) : null;
  return {
    widgetId: w.id, widgetType: toApiType(w.type), metric: w.metric, title: w.title, shape: def?.shape ?? 'kpi', data,
    error: data === null ? 'This metric is not available.' : null
  };
}

function csvCell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Interactive Dashboards (static demo): dashboards, layouts, sharing and generated widget data held in memory. */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  /** Every dashboard the user can open. */
  private readonly list = signal<Dashboard[]>(seedDashboards());
  readonly loading = signal(false);
  readonly metrics = signal<MetricDef[]>(METRICS.map(({ key, label, description, module, types }) => ({ key, label, description, module, types })));
  readonly widgetTypes = signal<WidgetTypeDef[]>(WIDGET_TYPES);
  readonly templates = signal<DashboardTemplate[]>(TEMPLATES.map(({ key, name, description, widgetCount }) => ({ key, name, description, widgetCount })));
  readonly datePresets = signal<string[]>(DATE_PRESETS);
  readonly defaultDatePreset = signal(DEFAULT_PRESET);
  readonly organizations = signal<FilterOption[]>([]);
  readonly locations = signal<FilterOption[]>([]);
  readonly categories = signal<FilterOption[]>([]);

  private dashSeq = 6;

  get dashboards(): Dashboard[] {
    return this.list();
  }

  get(id: string): Dashboard | undefined {
    return this.list().find((d) => d.id === id);
  }

  nameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.list().some((d) => d.name.toLowerCase() === n);
  }

  private replace(d: Dashboard): void {
    this.list.update((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]));
  }

  /** Stores a change to a dashboard and stamps it as updated now. */
  private touch(id: string, change: (d: Dashboard) => Partial<Dashboard>): Dashboard | null {
    const d = this.get(id);
    if (!d) return null;
    const next = { ...d, ...change(d), updatedAt: dateText(new Date()) };
    next.widgetCount = next.widgets.length;
    this.replace(next);
    return next;
  }

  private missing<T>(): Observable<T> {
    return throwError(() => new Error('This dashboard no longer exists.'));
  }

  // ===== Page furniture =====

  /** Date presets, widget types, metric catalog and templates (static). */
  loadOptions(): Observable<void> {
    return of(undefined);
  }

  /** Organization, Location and Asset Category values. */
  loadFilters(): Observable<void> {
    const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));
    this.organizations.set(opts(RA_ORGANIZATIONS.slice(1)));
    this.locations.set(opts(RA_LOCATIONS.slice(1)));
    this.categories.set(opts(RA_CATEGORIES));
    return of(undefined);
  }

  // ===== Dashboards =====

  /** My Dashboards, Shared with me and Favorites are split from this list on the page. */
  load(): Observable<Dashboard[]> {
    this.loading.set(false);
    return of(this.list());
  }

  open(id: string): Observable<Dashboard> {
    const d = this.get(id);
    return d ? of(d) : this.missing<Dashboard>();
  }

  /** Blank, from a template, or with a copy of another dashboard's widgets. */
  create(name: string, description: string, sharing: Sharing, start: { widgets?: WidgetConfig[]; templateKey?: string }): Observable<Dashboard> {
    const n = name.trim();
    if (this.nameTaken(n)) return throwError(() => new Error('A dashboard with this name already exists.'));
    const widgets = start.widgets?.length
      ? packLayout(start.widgets.map((w) => ({ ...w, id: widget(w.type, w.metric, w.title).id, settings: { ...w.settings } })))
      : start.templateKey
        ? fromTemplate(start.templateKey)
        : [];
    const d: Dashboard = {
      id: `DSH-${String(this.dashSeq++).padStart(4, '0')}`, name: n, description: description.trim(), owner: CURRENT_USER.name, sharing,
      sharedWith: [], groups: [], sharedUsers: [], sharedGroups: [], sharedSummary: summary(sharing, [], []), role: 'Owner', canEdit: true, canShare: true,
      favorite: false, updatedAt: dateText(new Date()), audienceRole: null, defaultFilters: null, widgetCount: widgets.length, widgets, loaded: true
    };
    this.replace(d);
    return of(d);
  }

  /** A private copy owned by the user. */
  duplicate(d: Dashboard): Observable<Dashboard> {
    const source = this.get(d.id) ?? d;
    let name = `${source.name} (Copy)`;
    for (let i = 2; this.nameTaken(name); i++) name = `${source.name} (Copy ${i})`;
    return this.create(name, source.description, 'private', { widgets: source.widgets });
  }

  /** Owner only. */
  remove(d: Dashboard): Observable<void> {
    const current = this.get(d.id);
    if (!current) return this.missing<void>();
    if (current.role !== 'Owner') return throwError(() => new Error('Only the owner can delete this dashboard.'));
    this.list.update((list) => list.filter((x) => x.id !== d.id));
    return of(undefined);
  }

  setFavorite(d: Dashboard, isFavorite: boolean): Observable<Dashboard> {
    const current = this.get(d.id);
    if (!current) return this.missing<Dashboard>();
    const next = { ...current, favorite: isFavorite };
    this.replace(next);
    return of(next);
  }

  /** People and groups are picked by name; existing entries keep their id and permission. */
  share(d: Dashboard, sharing: Sharing, people: string[], groups: string[]): Observable<Dashboard> {
    const next = this.touch(d.id, (x) => {
      const users = entries(people, x.sharedUsers);
      const grps = entries(groups, x.sharedGroups);
      return {
        sharing, sharedUsers: users, sharedGroups: grps, sharedWith: users.map((u) => u.name), groups: grps.map((g) => g.name),
        sharedSummary: summary(sharing, users, grps)
      };
    });
    return next ? of(next) : this.missing<Dashboard>();
  }

  // ===== Widgets and layout =====

  /** Grid position of every widget, packed in the given order. */
  saveLayout(d: Dashboard, widgets: WidgetConfig[]): Observable<Dashboard> {
    const next = this.touch(d.id, () => ({ widgets: packLayout(widgets) }));
    return next ? of(next) : this.missing<Dashboard>();
  }

  /** Placed below the others at the chosen width. */
  addWidget(d: Dashboard, n: NewWidgetRequest): Observable<WidgetConfig> {
    const current = this.get(d.id);
    if (!current) return this.missing<WidgetConfig>();
    if (current.widgets.length >= 30) return throwError(() => new Error('A dashboard can hold up to 30 widgets.'));
    const w = widget(n.type, n.metric, n.title.trim(), n.span);
    const bottom = current.widgets.reduce((a, x) => Math.max(a, x.y + x.h), 0);
    const placed = { ...w, x: 0, y: bottom };
    this.touch(d.id, (x) => ({ widgets: [...x.widgets, placed] }));
    return of(placed);
  }

  removeWidget(d: Dashboard, widgetId: string): Observable<void> {
    const next = this.touch(d.id, (x) => ({ widgets: x.widgets.filter((w) => w.id !== widgetId) }));
    return next ? of(undefined) : this.missing<void>();
  }

  /** Replaces the widget list (used by "Discard changes" to restore the layout from before editing). */
  replaceWidgets(d: Dashboard, widgets: WidgetConfig[]): Observable<Dashboard> {
    const next = this.touch(d.id, () => ({ widgets: widgets.map((w) => ({ ...w, settings: { ...w.settings } })) }));
    return next ? of(next) : this.missing<Dashboard>();
  }

  // ===== Data =====

  private widgetsOf(d: Dashboard): WidgetConfig[] {
    const stored = this.get(d.id)?.widgets ?? [];
    return [...d.widgets, ...stored.filter((w) => !d.widgets.some((x) => x.id === w.id))];
  }

  /** Every widget's values for the filter bar. */
  loadData(d: Dashboard, f: DashFilters): Observable<DashboardData> {
    const s = scopeOf(f);
    return of({ generatedAt: new Date(), widgets: Object.fromEntries(this.widgetsOf(d).map((w) => [w.id, dataFor(w, s)])) });
  }

  /** One widget, e.g. right after it was added. */
  loadWidgetData(d: Dashboard, widgetId: string, f: DashFilters): Observable<DashboardData> {
    const w = this.widgetsOf(d).find((x) => x.id === widgetId);
    if (!w) return throwError(() => new Error('This widget no longer exists.'));
    return of({ generatedAt: new Date(), widgets: { [w.id]: dataFor(w, scopeOf(f)) } });
  }

  /** CSV with the filters and one section per widget. */
  export(d: Dashboard, f: DashFilters): Observable<{ blob: Blob; fileName: string }> {
    const s = scopeOf(f);
    const lines: (string | number)[][] = [
      ['Dashboard', d.name],
      ['Period', f.period],
      ['Organization', f.organization || 'All organizations'],
      ['Location', f.location || 'All locations'],
      ['Asset category', f.category || 'All categories'],
      ['Generated', dateText(new Date())]
    ];
    for (const w of this.widgetsOf(d)) {
      const csv = widgetCsv(w, toWidgetData(w, dataFor(w, s)));
      lines.push([], [w.title], csv.header, ...csv.rows);
    }
    const text = lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return of({ blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), fileName: `${slug || d.id.toLowerCase()}.csv` });
  }
}
