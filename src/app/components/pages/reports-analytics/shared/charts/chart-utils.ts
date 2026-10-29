/** Asset360 / Purple IQ chart palette. Use these instead of ad-hoc colours so every report matches. */
export const RA_COLORS = {
  purple: '#5b2aa8',
  violet: '#8b5cf6',
  lavender: '#c4b5fd',
  blue: '#2563eb',
  sky: '#60a5fa',
  pink: '#ec4899',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  teal: '#14b8a6',
  grey: '#94a3b8'
} as const;

/** Default order for multi-series charts. */
export const RA_SERIES_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange, RA_COLORS.pink, RA_COLORS.violet, RA_COLORS.teal];

export interface ChartSeries {
  name: string;
  values: number[];
  color: string;
  /** Cartesian charts: draw as bars (default for bar charts) or a line */
  type?: 'bar' | 'line';
  dashed?: boolean;
  /** Fill under a line */
  area?: boolean;
  /** Plot against the right-hand axis */
  axis?: 'left' | 'right';
}

export interface ChartSlice {
  name: string;
  value: number;
  color: string;
}

export type ValueFormat = (value: number) => string;

/** 1250 → 1.3K, 1860000 → 1.86M */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return trim(value / 1_000_000_000) + 'B';
  if (abs >= 1_000_000) return trim(value / 1_000_000) + 'M';
  if (abs >= 1_000) return trim(value / 1_000) + 'K';
  return trim(value);
}

function trim(value: number): string {
  return Number(value.toFixed(value % 1 === 0 ? 0 : Math.abs(value) < 10 ? 2 : 1)).toString();
}

/** Rounds a maximum up to a tidy axis end (e.g. 437 → 500). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 1.2 ? 1.2 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
  return nice * exp;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
