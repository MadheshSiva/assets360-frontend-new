import { Directive, OnDestroy } from '@angular/core';
import { ADMIN_LOCATIONS, ADMIN_PEOPLE, CURRENT_USER, ORGANIZATIONS } from './admin-common';

// Entity lists (organizations, locations, categories, people) and figures come from the APIs (not wired yet).

export { ADMIN_PEOPLE as RA_PEOPLE, CURRENT_USER };

export const RA_BASE_PATH = '/reports-analytics';

export const RA_ORGANIZATIONS = ['All organizations', ...ORGANIZATIONS];

/** Sites used across Asset360 (same as Administration > Organization). */
export const RA_LOCATIONS = ['All locations', ...ADMIN_LOCATIONS];

/** Asset categories from Master Data Management. */
export const RA_CATEGORIES: string[] = [];

/** Reporting months for trend charts come with the API data. */
export const RA_MONTHS: string[] = [];
export const RA_MONTH_LABELS: string[] = [];

export const RA_PERIODS = ['Year to date', 'This month', 'Last quarter', 'Last 30 days', 'Last 12 months'];

/** Amounts are reported in UAE Dirham (the group's base currency). */
export const RA_CURRENCY = 'AED';

/** 1860000 → "AED 1.86M" */
export function money(value: number, digits = 2): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${RA_CURRENCY} ${(abs / 1_000_000).toFixed(digits).replace(/\.?0+$/, '')}M`;
  if (abs >= 1_000) return `${sign}${RA_CURRENCY} ${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `${sign}${RA_CURRENCY} ${abs.toLocaleString('en-US')}`;
}

export function percent(value: number, digits = 1): string {
  return `${Number(value.toFixed(digits))}%`;
}

/** Writes rows to a CSV download. Cells are quoted and formula-looking cells are neutralised. */
export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]): void {
  const cell = (v: string | number) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Base for the Reports & Analytics pages: "Updated n min ago" + refresh, saved views and the toast.
 * Pages add their own filter fields.
 */
@Directive()
export abstract class AnalyticsPage implements OnDestroy {
  readonly basePath = RA_BASE_PATH;
  readonly organizations = RA_ORGANIZATIONS;
  readonly locations = RA_LOCATIONS;
  readonly periods = RA_PERIODS;
  /** Filter values start empty ('' = no filter; an empty period reads as the default, Year to date). */
  period = '';
  organization = '';
  location = '';

  /** Period used for captions and exports: the selected one, or the default when none is picked. */
  get periodLabel(): string {
    return this.period || RA_PERIODS[0];
  }

  get organizationLabel(): string {
    return this.organization || RA_ORGANIZATIONS[0];
  }

  get locationLabel(): string {
    return this.location || RA_LOCATIONS[0];
  }

  /** Minutes since the data was refreshed */
  updatedMinutes = 0;
  refreshing = false;
  toast: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  get updatedText(): string {
    return this.updatedMinutes === 0 ? 'Updated just now' : `Updated ${this.updatedMinutes} min ago`;
  }

  /** Pages reload their data from the reporting API here once it exists. */
  refresh(): void {
    if (this.refreshing) return;
    this.updatedMinutes = 0;
  }

  saveView(name: string): void {
    this.notify(`View “${name}” saved with the current filters.`);
  }

  notify(message: string): void {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3200);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
