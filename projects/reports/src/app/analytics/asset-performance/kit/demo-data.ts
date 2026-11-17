// DEMO MODE: building blocks for the static Reports & Analytics data (no Report Analytics API in the demo).
// Shared by Asset Performance, Compliance Analytics and Financial Analytics.

/** Period presets offered by the filter bars. */
export const DEMO_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year', 'Last 12 months'];

export const DEMO_ALL_ORGANIZATIONS = 'All organizations';
export const DEMO_ALL_LOCATIONS = 'All locations';

export interface DemoSite {
  name: string;
  code: string;
  org: string;
}

/** Sites with their organization; the location filter offers these. */
export const DEMO_SITES: DemoSite[] = [
  { name: 'Dubai HQ', code: 'DXB', org: 'Purple IQ UAE' },
  { name: 'Abu Dhabi Office', code: 'AUH', org: 'Purple IQ UAE' },
  { name: 'Sharjah Facility', code: 'SHJ', org: 'Purple IQ UAE' },
  { name: 'Jebel Ali Warehouse', code: 'JAW', org: 'Purple IQ UAE' },
  { name: 'Al Ain Depot', code: 'AAN', org: 'Purple IQ UAE' },
  { name: 'Riyadh Office', code: 'RUH', org: 'Purple IQ KSA' },
  { name: 'Doha Office', code: 'DOH', org: 'Purple IQ Qatar' },
  { name: 'London Office', code: 'LON', org: 'Purple IQ Group' },
  { name: 'Singapore Office', code: 'SIN', org: 'Purple IQ Group' }
];

export const DEMO_ORGANIZATIONS = [...new Set(DEMO_SITES.map((s) => s.org))];

export function siteByName(name: string): DemoSite | undefined {
  return DEMO_SITES.find((s) => s.name === name);
}

/** True when the site passes the organization and location filters ("All …" = no filter). */
export function siteInScope(site: string, organization: string, location: string): boolean {
  if (location && location !== DEMO_ALL_LOCATIONS && site !== location) return false;
  if (organization && organization !== DEMO_ALL_ORGANIZATIONS && siteByName(site)?.org !== organization) return false;
  return true;
}

/** Deterministic noise in [0, 1). */
export function rnd(k: number, salt = 0): number {
  const x = Math.sin((k + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Integer in [min, max]. */
export function rndInt(k: number, salt: number, min: number, max: number): number {
  return min + Math.floor(rnd(k, salt) * (max - min + 1));
}

export function pickOf<T>(list: T[], k: number, salt = 0): T {
  return list[Math.floor(rnd(k, salt) * list.length) % list.length];
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** % change from `previous` to `current`, one decimal (0 when there is no previous value). */
export function pctChange(current: number, previous: number): number {
  return previous ? round1(((current - previous) / Math.abs(previous)) * 100) : 0;
}

// ----- Timeline -----

/** Months of history the demo holds; index HISTORY - 1 is the current month. */
export const HISTORY = 24;
export const CURRENT = HISTORY - 1;

const today = (): Date => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** First day (UTC) of the month at a timeline index. */
export function monthStart(index: number): Date {
  const t = today();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (CURRENT - index), 1));
}

/** "Jan\n2026" axis label for a timeline index. */
export function monthAxisLabel(index: number): string {
  const d = monthStart(index);
  return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}\n${d.getUTCFullYear()}`;
}

/** Timeline indexes covered by a period preset (trend charts show whole months). */
export function periodMonths(period: string): number[] {
  const range = (from: number) => Array.from({ length: CURRENT - from + 1 }, (_, i) => from + i);
  switch (period) {
    case 'Today':
    case 'Last 7 days':
    case 'This month':
      return [CURRENT];
    case 'Last 30 days':
      return [CURRENT - 1, CURRENT];
    case 'Last month':
      return [CURRENT - 1];
    case 'This quarter':
      return range(CURRENT - (monthStart(CURRENT).getUTCMonth() % 3));
    case 'Last 12 months':
      return range(CURRENT - 11);
    default: // This year
      return range(CURRENT - monthStart(CURRENT).getUTCMonth());
  }
}

/** The same number of months immediately before the period. */
export function previousMonths(period: string): number[] {
  const months = periodMonths(period);
  return months.map((m) => m - months.length).filter((m) => m >= 0);
}

/** Share of a month the period covers, for counts in short periods (Today, Last 7 days …). */
export function periodWeight(period: string): number {
  switch (period) {
    case 'Today':
      return 1 / 30;
    case 'Last 7 days':
      return 7 / 30;
    default:
      return 1;
  }
}

/** Resolved date range of a period (end inclusive). */
export function periodRange(period: string): { from: Date; to: Date } {
  const t = today();
  const day = 86_400_000;
  switch (period) {
    case 'Today':
      return { from: t, to: t };
    case 'Last 7 days':
      return { from: new Date(t.getTime() - 6 * day), to: t };
    case 'Last 30 days':
      return { from: new Date(t.getTime() - 29 * day), to: t };
    case 'Last month':
      return { from: monthStart(CURRENT - 1), to: new Date(monthStart(CURRENT).getTime() - day) };
    default:
      return { from: monthStart(periodMonths(period)[0]), to: t };
  }
}

/** Previous period range as ISO strings (end exclusive), the shape Compare Periods expects. */
export function previousRangeUtc(period: string): { fromUtc: string; toUtc: string } {
  const { from, to } = periodRange(period);
  const length = to.getTime() - from.getTime() + 86_400_000;
  return { fromUtc: new Date(from.getTime() - length).toISOString(), toUtc: from.toISOString() };
}

/** Today plus `days` as an ISO date. */
export function dayFromToday(days: number): string {
  return new Date(today().getTime() + days * 86_400_000).toISOString();
}

/** "24 Oct 2026" */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Slowly improving monthly value: `current` at the latest month, `drift` lower per month going back, plus some noise. */
export function drifted(current: number, index: number, drift: number, noise: number, salt: number): number {
  return current - (CURRENT - index) * drift + (rnd(index, salt) - 0.5) * 2 * noise;
}
