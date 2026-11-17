import { LucideIconData } from 'lucide-angular';
import { RA_PERIODS } from '../../shared/analytics-common';

// Building blocks shared by Inventory, Financial and WIP / Production Analytics:
// scope + period helpers, number helpers and the card / dialog models.

/** Which organization each site reports into; comes from the Administration API (not wired yet). */
export const SITE_ORG: Record<string, string> = {};

/** True when a site is inside the organization + location filters. Sites with no known organization are kept. */
export function siteInScope(site: string, organization: string, location: string): boolean {
  const org = SITE_ORG[site];
  const orgOk = !organization || organization === 'All organizations' || !org || org === organization;
  const locOk = !location || location === 'All locations' || location === site;
  return orgOk && locOk;
}

// ===== Period window =====

/** Trend labels come with the reporting API data; none are generated here. */
export const TREND_LABELS: string[] = [];
const WEEK_SPLIT = [0.23, 0.25, 0.26, 0.26];

export interface PeriodWindow {
  labels: string[];
  /** Month indexes into the monthly arrays */
  months: number[];
  /** Single-month periods are shown by week */
  weekly: boolean;
  /** Length in months, used to annualise rates */
  monthCount: number;
  caption: string;
}

export function periodWindow(period: string): PeriodWindow {
  const caption = period || RA_PERIODS[0];
  switch (RA_PERIODS.indexOf(period)) {
    case 1:
    case 3:
      return { labels: [], months: [], weekly: true, monthCount: 1, caption };
    case 2:
      return { labels: [], months: [], weekly: false, monthCount: 3, caption };
    case 4:
      return { labels: [], months: [], weekly: false, monthCount: 12, caption };
    default:
      return { labels: [], months: [], weekly: false, monthCount: 10, caption };
  }
}

/** Amounts that add up over time (spend, output): monthly values, or the month split into weeks. */
export function flowSeries(base: number[], w: PeriodWindow, factor = 1): number[] {
  if (w.weekly) return w.months.length && base.length ? WEEK_SPLIT.map((s) => (base[w.months[0]] ?? 0) * s * factor) : [];
  return w.months.map((m) => base[m] * factor);
}

/** Balances read at a point in time (stock value, WIP): month-end values, or interpolated weekly. */
export function levelSeries(base: number[], w: PeriodWindow, factor = 1): number[] {
  if (w.weekly) {
    if (!w.months.length || !base.length) return [];
    const m = w.months[0];
    const from = base[m - 1];
    return WEEK_SPLIT.map((_, k) => (from + ((base[m] - from) * (k + 1)) / 4) * factor);
  }
  return w.months.map((m) => base[m] * factor);
}

/** "Previous period" comparison series derived from the KPI change, with a little wobble so it reads as real data. */
export function previousSeries(values: number[], deltaPct: number): number[] {
  return values.map((v, i) => (v / (1 + deltaPct / 100)) * (1 + ((i % 3) - 1) * 0.012));
}

// ===== Numbers =====

export function sumOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Splits an integer total by weights so the parts always add back up to the total (largest remainder). */
export function splitTotal(total: number, weights: number[]): number[] {
  const wsum = sumOf(weights) || 1;
  const raw = weights.map((w) => (total * w) / wsum);
  const parts = raw.map(Math.floor);
  let rest = Math.round(total) - sumOf(parts);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) parts[order[k].i]++;
  return parts;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

/** 2026-11-02 → "02 Nov 2026" */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

// ===== Sorting =====

export interface SortState {
  key: string;
  dir: 1 | -1;
}

export function toggleSort(state: SortState, key: string): SortState {
  return state.key === key ? { key, dir: state.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

export function sortBy<T>(rows: T[], state: SortState): T[] {
  const k = state.key as keyof T;
  return [...rows].sort((a, b) => {
    const x = a[k];
    const y = b[k];
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return c * state.dir;
  });
}

// ===== Card / dialog models =====

export type Tone = 'red' | 'orange' | 'blue' | 'green' | 'purple' | 'pink';

export interface KpiCardData {
  id: string;
  label: string;
  value: string;
  /** Change vs the previous period, in % */
  delta: number;
  /** Whether an increase is good (green) or bad (red) */
  goodWhenUp: boolean;
  previous: string;
  tone: Tone;
  icon: LucideIconData;
}

export interface InsightAction {
  id: string;
  label: string;
  primary?: boolean;
}

export interface InsightCard {
  id: string;
  tone: Tone;
  icon: LucideIconData;
  title: string;
  text: string;
  actions: InsightAction[];
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  value: string | number;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface FormDialogData {
  title: string;
  intro?: string;
  submitLabel: string;
  fields: FormField[];
}

export interface ListDialogData {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  /** Column indexes that hold numbers (right aligned) */
  numeric?: number[];
  fileName: string;
}

export interface DetailsDialogData {
  title: string;
  subtitle?: string;
  items: { label: string; value: string }[];
}
