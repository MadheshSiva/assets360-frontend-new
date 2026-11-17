import { ChartSeries, ChartSlice } from '../shared/charts';

// View models for the Maintenance Analytics page. Every figure comes from /api/maintenance-analytics (maintenance-analytics.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_MAINTENANCE_TYPES = 'All maintenance types';
export const ALL_MAINTENANCE_VIEW = 'All Maintenance';

/** Maintenance types used until /options answers (MaintenanceAnalyticsCalculator.WorkTypes). */
export const MA_FALLBACK_TYPES = ['Preventive', 'Corrective', 'Emergency', 'Inspection'];

/** Period presets used until /options answers. "Custom" is left out: the filter bar has no date pickers. */
export const MA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const MA_DEFAULT_PERIOD = 'This year';

/** Preventive compliance target used until the API reports the one it applied (%). */
export const PM_TARGET = 90;

/** Backlog sort order, most urgent first (the API's MaintenanceAnalyticsCalculator.Priorities). */
export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

/** A KPI value with its change against the previous period (0 when there is nothing to compare). */
export interface MaKpiValue {
  value: number | null;
  change: number;
  /** "percent" (relative change) or "points" (difference of two rates) */
  unit: string;
}

/** An unfinished work order (API BacklogRow). */
export interface MaWorkOrder {
  /** Record id */
  key: string;
  /** Work order number shown to users (falls back to the record id) */
  id: string;
  type: string;
  priority: string;
  assetId: string;
  asset: string;
  location: string;
  /** Days since it was raised; null when no date is recorded */
  ageDays: number | null;
  technician: string;
  status: string;
  dueDate: string | null;
  overdue: boolean;
  partsShortage: boolean;
}

export interface TechnicianRow {
  name: string;
  assigned: number;
  completed: number;
  /** Missing measurements are null */
  firstTimeFix: number | null;
  response: number | null;
  sla: number | null;
}

/** A work order named on an insight card. */
export interface MaInsightOrder {
  key: string;
  id: string;
  assetId: string;
  asset: string;
  priority: string;
  status: string;
  reasons: string[];
}

/** An asset named on the "approaching failure" insight. */
export interface MaInsightAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  health: number | null;
  reasons: string[];
}

export interface MaInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  workOrders: MaInsightOrder[];
  assets: MaInsightAsset[];
  parts: string[];
  actions: string[];
  /** Query for /backlog behind "View work orders", e.g. status=Overdue or partsShortage=true */
  query: string;
}

export interface MaintenanceView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  complianceTarget: number;
  cost: MaKpiValue;
  open: MaKpiValue;
  pmCompliance: MaKpiValue;
  mttr: MaKpiValue;
  mtbf: MaKpiValue;
  labels: string[];
  costTrend: ChartSeries[];
  monthlyEmergency: number[];
  monthlyTotal: number[];
  /** Period cost totals */
  emergencyCost: number;
  totalCost: number;
  /** Work orders raised in the period */
  workOrders: number;
  typeSeries: ChartSeries[];
  statusSlices: ChartSlice[];
  pmCompleted: number;
  pmDue: number;
  pmTrend: ChartSeries[];
  reliability: ChartSeries[];
  downtimeByCause: ChartSeries[];
  downtimeHours: number;
  /** Most urgent unfinished work orders (first page) and how many there are in all */
  backlog: MaWorkOrder[];
  backlogTotal: number;
  technicians: TechnicianRow[];
  insights: MaInsight[];
}

const none = (unit = 'percent'): MaKpiValue => ({ value: null, change: 0, unit });

/** What the page shows before the first response. */
export function emptyMaintenance(): MaintenanceView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    complianceTarget: PM_TARGET,
    cost: none(),
    open: none(),
    pmCompliance: none('points'),
    mttr: none(),
    mtbf: none(),
    labels: [],
    costTrend: [],
    monthlyEmergency: [],
    monthlyTotal: [],
    emergencyCost: 0,
    totalCost: 0,
    workOrders: 0,
    typeSeries: [],
    statusSlices: [],
    pmCompleted: 0,
    pmDue: 0,
    pmTrend: [],
    reliability: [],
    downtimeByCause: [],
    downtimeHours: 0,
    backlog: [],
    backlogTotal: 0,
    technicians: [],
    insights: []
  };
}
