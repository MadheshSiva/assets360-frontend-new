/** View models for Inspection Analytics. The figures come from /api/inspection-analytics (see inspection-analytics.service.ts). */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
export const SEVERITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export const SEVERITY_TONE: Record<string, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_CATEGORIES = 'All categories';
export const ALL_TYPES = 'All inspection types';
export const ALL_INSPECTORS = 'All inspectors';

/** One open finding (FindingRow). */
export interface InspectionFinding {
  /** Record id */
  key: string;
  /** Finding number shown to users (falls back to the record id) */
  id: string;
  assetId: string;
  assetName: string;
  site: string;
  /** Finding category */
  findingType: string;
  severity: string;
  description: string;
  raised: string;
  /** Days until due; negative when overdue, null without a due date */
  dueInDays: number | null;
  due: string;
  owner: string;
  status: string;
  overdue: boolean;
  ageDays: number | null;
}

export interface InspectorRow {
  name: string;
  inspections: number;
  completed: number;
  avgHours: number | null;
  findingRate: number | null;
  closureRate: number | null;
}

export interface KpiFigure {
  value: number | null;
  previous: number | null;
  change: number | null;
  /** 'percent' (relative change) or 'points' */
  changeUnit: string;
  trend: string;
}

export interface InsightCardModel {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  findings: { id: string; assetId: string; assetName: string; severity: string; category: string; due: string; reasons: string }[];
  assets: { assetId: string; assetName: string; site: string; reasons: string }[];
  locations: string[];
  actions: string[];
  query: string;
}

export interface InspectionView {
  generatedAt: Date;
  periodLabel: string;
  labels: string[];
  planned: number[];
  completed: number[];
  overdue: number[];
  /** Completed per month in the comparison period (Compare Periods) */
  completedPrevious: number[];
  status: { name: string; value: number }[];
  statusTotal: number;
  kpis: {
    total: KpiFigure;
    rate: KpiFigure;
    open: KpiFigure;
    critical: KpiFigure;
    due: KpiFigure;
  };
  severity: { name: string; values: number[] }[];
  categories: string[];
  byCategory: number[];
  compliance: {
    value: number | null;
    target: number;
    change: number | null;
    compliantAssets: number;
    scheduledAssets: number;
    series: number[];
  };
  repeated: number[];
  resolved: number[];
  findings: InspectionFinding[];
  findingsTotal: number;
  inspectors: InspectorRow[];
  insights: InsightCardModel[];
  dueWithinDays: number;
}

/** Blank page while loading or when the API is unreachable: zeros and empty tables. */
export function emptyInspectionView(): InspectionView {
  const kpi: KpiFigure = { value: null, previous: null, change: null, changeUnit: 'percent', trend: 'flat' };
  return {
    generatedAt: new Date(),
    periodLabel: '',
    labels: [],
    planned: [],
    completed: [],
    overdue: [],
    completedPrevious: [],
    status: [],
    statusTotal: 0,
    kpis: { total: kpi, rate: kpi, open: kpi, critical: kpi, due: kpi },
    severity: [],
    categories: [],
    byCategory: [],
    compliance: { value: null, target: 90, change: null, compliantAssets: 0, scheduledAssets: 0, series: [] },
    repeated: [],
    resolved: [],
    findings: [],
    findingsTotal: 0,
    inspectors: [],
    insights: [],
    dueWithinDays: 7
  };
}
