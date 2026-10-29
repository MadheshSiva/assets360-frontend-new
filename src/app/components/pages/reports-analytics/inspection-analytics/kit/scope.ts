import { RA_LOCATIONS, RA_ORGANIZATIONS, RA_PERIODS } from '../../shared/analytics-common';

// DEMO MODE: site weights used to scale the group-wide sample data down to a filtered scope.
// Shared by Inspection Analytics, Compliance Analytics and the KPI Dashboard so a location reads the same on each.

export interface RaSite {
  name: string;
  /** Short code used in asset IDs (AST-2026-DXB-000247) */
  code: string;
  org: string;
  /** Share of the group's activity (all weights add up to 1) */
  weight: number;
}

export const RA_SITES: RaSite[] = [
  { name: 'Dubai HQ', code: 'DXB', org: 'Purple IQ UAE', weight: 0.22 },
  { name: 'Abu Dhabi Office', code: 'AUH', org: 'Purple IQ UAE', weight: 0.16 },
  { name: 'Sharjah Facility', code: 'SHJ', org: 'Purple IQ UAE', weight: 0.14 },
  { name: 'Riyadh Office', code: 'RUH', org: 'Purple IQ KSA', weight: 0.12 },
  { name: 'London Office', code: 'LON', org: 'Purple IQ Group', weight: 0.06 },
  { name: 'Singapore Office', code: 'SIN', org: 'Purple IQ Group', weight: 0.05 },
  { name: 'Jebel Ali Warehouse', code: 'JEA', org: 'Purple IQ UAE', weight: 0.15 },
  { name: 'Al Ain Depot', code: 'AAN', org: 'Purple IQ UAE', weight: 0.1 }
];

/** Sites matching the Organization and Location filters. The group organization covers every site. */
export function sitesInScope(organization: string, location: string): RaSite[] {
  const allOrgs = organization === RA_ORGANIZATIONS[0] || organization === 'Purple IQ Group';
  return RA_SITES.filter((s) => (location === RA_LOCATIONS[0] || s.name === location) && (allOrgs || s.org === organization));
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

/** Deterministic pseudo-random numbers (mulberry32) so sample data is identical on every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Repeats each value by its count, then shuffles deterministically: spread([['A', 2], ['B', 1]], 7). */
export function spread<T>(counts: [T, number][], seed: number): T[] {
  const items: T[] = [];
  counts.forEach(([value, n]) => {
    for (let i = 0; i < n; i++) items.push(value);
  });
  const rnd = seededRandom(seed);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function scale(values: number[], factor: number): number[] {
  return values.map((v) => Math.round(v * factor));
}

export function total(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** The data runs to 28 Oct 2026; due dates are relative to that day. */
export const RA_AS_OF = new Date(2026, 9, 28);

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
