import { RA_CATEGORIES, RA_PERIODS } from '../../shared/analytics-common';

// The asset register and work order history behind Asset Performance, Maintenance Analytics and Predictive
// Analytics come from the asset / maintenance APIs (not wired yet), so they start empty.

export interface RaSite {
  name: string;
  code: string;
  org: string;
  assets: number;
}

/** Sites with their asset counts. */
export const RA_SITES: RaSite[] = [];

export const ALL_CATEGORIES = 'All categories';
export const ALL_TYPES = 'All asset types';
/** Asset types from Master Data Management. */
export const RA_ASSET_TYPES: string[] = [];
export const CATEGORY_OPTIONS = [ALL_CATEGORIES, ...RA_CATEGORIES];
export const TYPE_OPTIONS = [ALL_TYPES, ...RA_ASSET_TYPES];

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const RISK_LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];

export type WoType = 'Preventive' | 'Corrective' | 'Emergency' | 'Inspection';
export type WoStatus = 'Open' | 'In Progress' | 'On Hold' | 'Completed' | 'Overdue';
export type WoPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type DowntimeCause = 'Mechanical' | 'Electrical' | 'Operational' | 'Parts Unavailable';
export const WO_TYPES: WoType[] = ['Preventive', 'Corrective', 'Emergency', 'Inspection'];
export const WO_STATUSES: WoStatus[] = ['Open', 'In Progress', 'On Hold', 'Completed', 'Overdue'];
export const DOWNTIME_CAUSES: DowntimeCause[] = ['Mechanical', 'Electrical', 'Operational', 'Parts Unavailable'];
export const TECHNICIANS: string[] = [];

export interface RaAsset {
  id: string;
  name: string;
  site: RaSite;
  category: string;
  type: string;
  owner: string;
  /** 0–100 */
  health: number;
  /** % of available hours in use */
  utilization: number;
  availability: number;
  mtbf: number;
  /** Connected to IoT telemetry and scored by the predictive model */
  monitored: boolean;
  risk: RiskLevel | null;
  riskScore: number;
  rulHours: number;
  /** Days until the predicted failure, for the assets the model expects to fail */
  failureWindowDays: number | null;
  /** Model confidence in % */
  confidence: number;
  vibrationAnomaly: boolean;
}

export interface RaWorkOrder {
  id: string;
  type: WoType;
  status: WoStatus;
  priority: WoPriority;
  asset: RaAsset;
  /** 0 = Jan 2026 … 9 = Oct 2026 */
  month: number;
  created: string;
  ageDays: number;
  cost: number;
  repairHours: number;
  downtimeHours: number;
  cause: DowntimeCause;
  technician: string;
  firstTimeFix: boolean;
  responseHours: number;
  slaMet: boolean;
}

export interface RaScope {
  organization: string;
  location: string;
  category: string;
  type: string;
}

/** Deterministic noise in [0, 1). */
export function rnd(k: number, salt = 0): number {
  const x = Math.sin((k + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Splits a whole number by weights (largest remainder), so the parts always add up to the total. */
export function distribute(total: number, weights: number[]): number[] {
  const w = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((x) => (total * x) / w);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (let j = 0; left > 0 && order.length; j = (j + 1) % order.length, left--) parts[order[j].i]++;
  return parts;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Month indexes (0 = Jan 2026) covered by a period from RA_PERIODS. Data starts in Jan 2026. */
export function periodMonths(period: string): number[] {
  switch (RA_PERIODS.indexOf(period)) {
    case 1:
    case 3:
      return [9];
    case 2:
      return [6, 7, 8];
    default:
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }
}

export function inScope(a: RaAsset, s: RaScope): boolean {
  if (s.organization && s.organization !== 'All organizations' && a.site.org !== s.organization) return false;
  if (s.location && s.location !== 'All locations' && a.site.name !== s.location) return false;
  if (s.category && s.category !== ALL_CATEGORIES && a.category !== s.category) return false;
  if (s.type && s.type !== ALL_TYPES && a.type !== s.type) return false;
  return true;
}

export function scopeSites(s: RaScope): RaSite[] {
  return RA_SITES.filter((site) => RA_ASSETS.some((a) => a.site === site && inScope(a, s)));
}

export const RA_ASSETS: RaAsset[] = [];

export const RA_WORK_ORDERS: RaWorkOrder[] = [];

export function isActive(o: RaWorkOrder): boolean {
  return o.status !== 'Completed';
}
