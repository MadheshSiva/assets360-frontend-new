import { Directive, OnDestroy } from '@angular/core';
import { ADMIN_LOCATIONS, ADMIN_PEOPLE, CURRENT_USER, ORGANIZATIONS } from '../../administration/shared/admin-common';

// DEMO MODE: analytics are computed from in-memory sample data until the reporting API exists

export { ADMIN_PEOPLE as RA_PEOPLE, CURRENT_USER };

export const RA_BASE_PATH = '/reports-analytics';

export const RA_ORGANIZATIONS = ['All organizations', ...ORGANIZATIONS];

/** Sites used across Asset360 (same as Administration > Organization). */
export const RA_LOCATIONS = ['All locations', ...ADMIN_LOCATIONS, 'Jebel Ali Warehouse', 'Al Ain Depot'];

/** Asset categories from Master Data Management. */
export const RA_CATEGORIES = ['Vehicles', 'Machinery', 'Facilities', 'IT Equipment', 'HVAC', 'Power & Electrical', 'Safety & PPE'];

/** Reporting months Jan–Oct 2026 for trend charts; '\n' splits the axis label onto two lines. */
export const RA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
export const RA_MONTH_LABELS = RA_MONTHS.map((m) => `${m}\n2026`);

export const RA_PERIODS = ['01 Jan 2026 – 28 Oct 2026', '01 Oct 2026 – 28 Oct 2026', '01 Jul 2026 – 30 Sep 2026', 'Last 30 days', 'Last 12 months'];

/** Asset IDs follow the numbering sequence used by the asset register, e.g. AST-2026-DXB-000247. */
export function assetId(site: string, n: number): string {
  return `AST-2026-${site}-${String(n).padStart(6, '0')}`;
}

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
  period = RA_PERIODS[0];
  organization = RA_ORGANIZATIONS[0];
  location = RA_LOCATIONS[0];

  /** Minutes since the data was refreshed */
  updatedMinutes = 5;
  refreshing = false;
  toast: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  get updatedText(): string {
    return this.updatedMinutes === 0 ? 'Updated just now' : `Updated ${this.updatedMinutes} min ago`;
  }

  // DEMO MODE: pretend to reload from the reporting API
  refresh(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.refreshTimer = setTimeout(() => {
      this.refreshing = false;
      this.updatedMinutes = 0;
      this.notify('Data refreshed.');
    }, 700);
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
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }
}
