import { Directive, TemplateRef } from '@angular/core';
import { AnalyticsPage, downloadCsv } from '../../shared/analytics-common';
import { ALL_CATEGORIES, ALL_TYPES, CATEGORY_OPTIONS, RaScope, TYPE_OPTIONS } from './asset-universe';
import { RaKpi } from './ra-cards';
import { RaActionForm, RaActionKind, RaActionRequest, RaDetail, RaRecords } from './ra-dialogs';

export type SortDir = 1 | -1;

export interface SavedView {
  name: string;
  filters: Record<string, string>;
}

/** Sorts a copy of `rows` by a string or number field. */
export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
  });
}

/**
 * Shared behaviour of the asset-scoped analytics pages (Asset Performance, Maintenance, Predictive):
 * the category / asset type filters, Compare Periods, saved views, KPI + widget menus and the dialogs.
 */
@Directive()
export abstract class ScopedAnalyticsPage extends AnalyticsPage {
  readonly categories = CATEGORY_OPTIONS;
  readonly assetTypes = TYPE_OPTIONS;
  category = ALL_CATEGORIES;
  assetType = ALL_TYPES;
  compare = false;

  kpis: RaKpi[] = [];
  views: SavedView[] = [];
  savingView = false;
  records: RaRecords | null = null;
  detail: RaDetail | null = null;
  action: RaActionRequest | null = null;
  expanded: { title: string; tpl: TemplateRef<unknown> } | null = null;
  /** Page-specific follow-up for the detail dialog's primary button */
  protected detailAction: RaActionRequest | null = null;

  /** Rebuilds KPIs, charts, tables and insights from the current filters. */
  abstract recompute(): void;
  /** CSV of one widget's data. */
  abstract exportWidget(id: string): void;
  /** Page section a KPI's "View details" scrolls to. */
  protected abstract kpiTarget(kpiId: string): string;
  /** Short page name used in file names */
  protected abstract readonly fileStem: string;

  get scope(): RaScope {
    return { organization: this.organization, location: this.location, category: this.category, type: this.assetType };
  }

  get viewNames(): string[] {
    return this.views.map((v) => v.name);
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.recompute();
  }

  resetFilters(): void {
    this.restoreFilters(this.defaultFilters());
    this.recompute();
  }

  // ----- Saved views -----
  protected snapshot(): Record<string, string> {
    return { period: this.period, organization: this.organization, location: this.location, category: this.category, assetType: this.assetType };
  }

  protected restoreFilters(f: Record<string, string>): void {
    this.period = f['period'] ?? this.periods[0];
    this.organization = f['organization'] ?? this.organizations[0];
    this.location = f['location'] ?? this.locations[0];
    this.category = f['category'] ?? ALL_CATEGORIES;
    this.assetType = f['assetType'] ?? ALL_TYPES;
  }

  private defaultFilters(): Record<string, string> {
    return { period: this.periods[0], organization: this.organizations[0], location: this.locations[0], category: ALL_CATEGORIES, assetType: ALL_TYPES };
  }

  confirmSaveView(name: string): void {
    this.savingView = false;
    this.views = [...this.views, { name, filters: this.snapshot() }];
    this.saveView(name);
  }

  applyView(name: string): void {
    const view = this.views.find((v) => v.name === name);
    this.restoreFilters(view ? view.filters : this.defaultFilters());
    this.recompute();
  }

  // ----- Menus -----
  kpiAction(item: string, kpi: RaKpi): void {
    if (item === 'Export') {
      this.exportKpis();
      return;
    }
    this.scrollTo(this.kpiTarget(kpi.id));
  }

  widgetAction(item: string, id: string, title: string, tpl: TemplateRef<unknown>): void {
    if (item === 'Expand') this.expanded = { title, tpl };
    else this.exportWidget(id);
  }

  exportKpis(): void {
    downloadCsv(`${this.fileStem}-kpis.csv`, ['KPI', 'Value', 'Change vs previous period (%)', 'Period'], this.kpis.map((k) => [k.label, k.value, k.delta, this.period]));
    this.notify('KPI summary exported.');
  }

  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ra-flash');
    setTimeout(() => el.classList.remove('ra-flash'), 1400);
  }

  // ----- Dialogs -----
  openAction(kind: RaActionKind, title: string, context: string, priority?: string): void {
    this.detail = null;
    this.action = { kind, title, context, priority };
  }

  openDetail(detail: RaDetail, follow: RaActionRequest | null = null): void {
    this.detail = detail;
    this.detailAction = follow;
  }

  detailPrimary(): void {
    const follow = this.detailAction;
    this.detail = null;
    if (follow) this.action = follow;
  }

  submitAction(form: RaActionForm): void {
    const kind = this.action?.kind ?? 'Work order';
    this.action = null;
    // DEMO MODE: the Maintenance module API isn't connected yet
    this.notify(`DEMO MODE: ${kind} “${form.title}” created for ${form.owner}, due ${form.due} (${form.priority}).`);
  }
}
