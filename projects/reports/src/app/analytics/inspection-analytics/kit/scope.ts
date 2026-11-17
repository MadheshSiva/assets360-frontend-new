import { RA_LOCATIONS, RA_ORGANIZATIONS, RA_PERIODS } from '../../shared/analytics-common';

// Sites (with their activity weights) used to scale group-wide figures down to a filtered scope.
// They come from the Administration API (not wired yet).
// Shared by Inspection Analytics, Compliance Analytics and the KPI Dashboard so a location reads the same on each.

export interface RaSite {
  name: string;
  /** Short site code used in asset IDs */
  code: string;
  org: string;
  /** Share of the group's activity (all weights add up to 1) */
  weight: number;
}

export const RA_SITES: RaSite[] = [];

/** Sites matching the Organization and Location filters. The group organization covers every site. */
export function sitesInScope(organization: string, location: string): RaSite[] {
  const allOrgs = !organization || organization === RA_ORGANIZATIONS[0];
  return RA_SITES.filter((s) => (!location || location === RA_LOCATIONS[0] || s.name === location) && (allOrgs || s.org === organization));
}

export function siteWeight(sites: RaSite[]): number {
  return sites.reduce((a, s) => a + s.weight, 0);
}

/** Average of a per-site value, weighted by site activity (0 when nothing is in scope). */
export function weightedAverage(sites: RaSite[], valueOf: (site: RaSite) => number): number {
  const w = siteWeight(sites);
  return w ? sites.reduce((a, s) => a + valueOf(s) * s.weight, 0) / w : 0;
}

/** Month window [start, end) into RA_MONTHS for a period filter value. */
export function periodWindow(period: string): { start: number; end: number } {
  switch (RA_PERIODS.indexOf(period)) {
    case 1:
    case 3:
      return { start: 9, end: 10 };
    case 2:
      return { start: 6, end: 9 };
    default:
      return { start: 0, end: 10 };
  }
}

export function scale(values: number[], factor: number): number[] {
  return values.map((v) => Math.round(v * factor));
}

export function total(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Due dates are relative to today. */
export const RA_AS_OF = new Date();

export function dateFromOffset(days: number): Date {
  const d = new Date(RA_AS_OF);
  d.setDate(d.getDate() + days);
  return d;
}

/** 02 Nov 2026 */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function signed(value: number, digits = 1, suffix = '%'): string {
  const v = Number(value.toFixed(digits));
  return `${v > 0 ? '+' : ''}${v}${suffix}`;
}
