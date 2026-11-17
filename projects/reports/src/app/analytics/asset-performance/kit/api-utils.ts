import { HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';

// Small helpers shared by the Reports & Analytics API services (Asset Performance, Maintenance Analytics).

/** KpiWidgetData: a figure, the previous period's figure and the change between them. */
export interface KpiWidgetDto {
  value: number | null;
  format: string;
  previousValue: number | null;
  change: number | null;
  /** "percent" (relative change) or "points" (difference of two rates) */
  changeUnit: string;
  trend: string;
  comparisonLabel: string;
}

/** DashboardPeriodResponse: the resolved date range and the previous one of the same length (UTC, end exclusive). */
export interface DashboardPeriodDto {
  preset: string;
  from: string;
  to: string;
  timeZone: string;
  fromUtc: string;
  toUtc: string;
  previousFromUtc: string;
  previousToUtc: string;
}

/** PerformanceSeries: month labels ("Jan 2026") and one line per series; null = nothing to measure that month. */
export interface PerformanceSeriesDto {
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
}

/** /filters: DashboardFilterOptions. */
export interface FilterOptionsDto {
  organizations: { value: string; label: string }[];
  locations: { value: string; label: string }[];
  assetCategories: { value: string; label: string }[];
  assetTypes: { value: string; label: string }[];
}

/** Readable message from an API error (validation problem, 401/404 or network failure). */
export function apiErrorMessage(err: HttpErrorResponse, service: string): string {
  const errors = err.error?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (err.status === 0) return `The ${service} service could not be reached.`;
  if (err.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (err.status === 403) return 'You do not have permission to do this.';
  if (err.status === 404) return 'This item no longer exists.';
  return err.error?.message || err.error?.detail || err.error?.title || `The ${service} service returned an error (${err.status}).`;
}

/** Query parameters without the empty ones. */
export function toParams(values: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
  }
  return params;
}

/** Parses "a=1&b=two" (an insight's query) into parameters. */
export function parseQuery(query: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (query ?? '').split('&')) {
    const [key, value] = part.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  }
  return result;
}

/** Saves a file response, named after its Content-Disposition when the gateway exposes it. */
export function saveBlob(response: HttpResponse<Blob>, fallbackName: string): void {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(response.body ?? new Blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Jan 2026" → "Jan\n2026" (two-line axis label). */
export function monthLabel(category: string): string {
  return category.replace(' ', '\n');
}

/** A chart value: missing measurements plot as 0. */
export function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A series' values by name, as chart numbers. */
export function seriesValues(dto: PerformanceSeriesDto | null | undefined, name: string): number[] {
  const line = dto?.series.find((s) => s.name === name);
  return (line?.values ?? dto?.categories.map(() => null) ?? []).map(num);
}

/** yyyy-MM-dd range of the previous period (the API's end is exclusive), for Compare Periods requests. */
export function previousRange(previousFromUtc: string, previousToUtc: string): { from: string; to: string } {
  const end = new Date(new Date(previousToUtc).getTime() - 1);
  return { from: previousFromUtc.slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Pads or trims a previous-period series to the current period's month count. */
export function alignTo(values: number[], length: number): number[] {
  return Array.from({ length }, (_, i) => values[i] ?? 0);
}

/** Labels of a filter list, with the "All …" entry first. */
export function optionLabels(all: string, options: { label: string }[] | null | undefined): string[] {
  return [all, ...(options ?? []).map((o) => o.label).filter((l) => !!l && l !== all)];
}
