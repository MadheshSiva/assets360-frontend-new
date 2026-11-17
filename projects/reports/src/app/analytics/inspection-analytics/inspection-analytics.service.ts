import { Injectable, signal } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { InspectionFinding, InspectionView } from './inspection-analytics.model';
import {
  COMPLIANCE_TARGET, DATE_PRESETS, DEFAULT_DATE_PRESET, DEMO_FILTERS, DUE_WITHIN_DAYS, FINDING_SORT_FIELDS, buildCompare, buildOverview, queryFindings
} from './inspection-analytics.data';

interface DashboardOption {
  value: string;
  label: string;
}

export interface InspectionFilterOptions {
  organizations: DashboardOption[];
  locations: DashboardOption[];
  assetCategories: DashboardOption[];
  assetTypes: DashboardOption[];
  inspectionTypes: DashboardOption[];
  inspectors: DashboardOption[];
}

export interface InspectionOptions {
  datePresets: string[];
  defaultDatePreset: string;
  severities: string[];
  findingSortFields: string[];
  defaultComplianceTarget: number;
  defaultDueWithinDays: number;
}

export interface InspectionSavedFilters {
  organization: string | null;
  location: string | null;
  category: string | null;
  assetType: string | null;
  inspectionType: string | null;
  inspector: string | null;
  datePreset: string;
  dateFrom: string | null;
  dateTo: string | null;
  timeZone: string;
}

export interface InspectionSavedView {
  viewId: string;
  viewName: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  filters: InspectionSavedFilters;
  updatedAt: string | null;
}

/** Filter bar values used by every query. Empty fields mean "all". */
export interface InspectionQuery {
  datePreset: string;
  organization?: string | null;
  location?: string | null;
  category?: string | null;
  inspectionType?: string | null;
  inspector?: string | null;
}

/** Extra findings arguments (insight buttons, table sorting, "View all"). */
export interface FindingsQuery {
  /** Matches finding ID, asset ID / name, location, owner or description */
  search?: string;
  severity?: string;
  dueWithinDays?: number;
  repeatOnly?: boolean;
  overdueOnly?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface FindingsPage {
  rows: InspectionFinding[];
  total: number;
}

/** Most rows returned in one page. */
export const MAX_PAGE_SIZE = 200;

function blankFilters(datePreset: string): InspectionSavedFilters {
  return {
    organization: null, location: null, category: null, assetType: null, inspectionType: null, inspector: null,
    datePreset, dateFrom: null, dateTo: null, timeZone: browserTimeZone()
  };
}

const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Reports & Analytics > Inspection Analytics. Static demo data generated in the browser (see inspection-analytics.data.ts). */
@Injectable({ providedIn: 'root' })
export class InspectionAnalyticsService {
  readonly loading = signal(false);
  readonly options = signal<InspectionOptions | null>(null);
  readonly filterOptions = signal<InspectionFilterOptions | null>(null);
  /** Built-in "All Inspections" first, then the user's saved views (kept in memory for the demo) */
  readonly views = signal<InspectionSavedView[]>([
    {
      viewId: 'all-inspections', viewName: 'All Inspections', isBuiltIn: true, isDefault: true,
      filters: blankFilters(DEFAULT_DATE_PRESET), updatedAt: null
    },
    {
      viewId: 'view-uae-safety', viewName: 'UAE safety inspections', isBuiltIn: false, isDefault: false,
      filters: { ...blankFilters('This quarter'), organization: 'Purple IQ UAE', inspectionType: 'Safety Inspection' },
      updatedAt: '2026-10-02T08:30:00Z'
    }
  ]);
  private nextViewId = 1;

  /** Date presets, severities, sort fields and defaults. */
  loadOptions(): Observable<InspectionOptions> {
    const o: InspectionOptions = {
      datePresets: DATE_PRESETS,
      defaultDatePreset: DEFAULT_DATE_PRESET,
      severities: ['Critical', 'High', 'Medium', 'Low'],
      findingSortFields: FINDING_SORT_FIELDS,
      defaultComplianceTarget: COMPLIANCE_TARGET,
      defaultDueWithinDays: DUE_WITHIN_DAYS
    };
    this.options.set(o);
    return of(o);
  }

  /** Organization / Location / Asset Category / Inspection Type / Inspector dropdowns. */
  loadFilters(): Observable<InspectionFilterOptions> {
    const value: InspectionFilterOptions = { ...DEMO_FILTERS };
    this.filterOptions.set(value);
    return of(value);
  }

  /** Every widget for the filter bar in one call. */
  overview(query: InspectionQuery): Observable<InspectionView> {
    return defer(() => {
      this.loading.set(true);
      const view = buildOverview(query);
      this.loading.set(false);
      return of(view);
    });
  }

  /** Open findings, filtered / sorted / paged. */
  findings(query: InspectionQuery, extra: FindingsQuery = {}): Observable<FindingsPage> {
    return defer(() => of(queryFindings(query, extra)));
  }

  /** Completed inspections per bucket in the previous period of the same length. */
  compareCompleted(query: InspectionQuery): Observable<{ completed: number[]; label: string }> {
    return defer(() => of(buildCompare(query)));
  }

  /** CSV file with a section per widget for the current filters. */
  export(query: InspectionQuery): Observable<Blob> {
    return defer(() => {
      const v = buildOverview(query);
      const findings = queryFindings(query, { pageSize: MAX_PAGE_SIZE }).rows;
      const lines: (string | number)[][] = [
        ['Inspection Analytics', v.periodLabel],
        [],
        ['KPI', 'Value', 'Previous period'],
        ['Total Inspections', v.kpis.total.value ?? '', v.kpis.total.previous ?? ''],
        ['Completion Rate %', v.kpis.rate.value ?? '', v.kpis.rate.previous ?? ''],
        ['Open Findings', v.kpis.open.value ?? '', v.kpis.open.previous ?? ''],
        ['Critical Findings', v.kpis.critical.value ?? '', v.kpis.critical.previous ?? ''],
        ['Corrective Actions Due', v.kpis.due.value ?? '', v.kpis.due.previous ?? ''],
        [],
        ['Period', 'Planned', 'Completed', 'Overdue', 'Compliance %', 'Repeated', 'Resolved'],
        ...v.labels.map((l, i) => [l.replace('\n', ' '), v.planned[i], v.completed[i], v.overdue[i], v.compliance.series[i], v.repeated[i], v.resolved[i]]),
        [],
        ['Inspector', 'Inspections', 'Completed', 'Avg Duration (hrs)', 'Finding Rate %', 'Closure Rate %'],
        ...v.inspectors.map((r) => [r.name, r.inspections, r.completed, r.avgHours ?? '', r.findingRate ?? '', r.closureRate ?? '']),
        [],
        ['Finding ID', 'Asset ID', 'Asset', 'Location', 'Category', 'Severity', 'Raised', 'Due Date', 'Owner', 'Status', 'Description'],
        ...findings.map((r) => [r.id, r.assetId, r.assetName, r.site, r.findingType, r.severity, r.raised, r.due, r.owner, r.status, r.description])
      ];
      const csv = lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
      return of(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    });
  }

  // ===== Saved views (in memory) =====

  loadViews(): Observable<InspectionSavedView[]> {
    return of(this.views());
  }

  createView(name: string, filters: InspectionSavedFilters, isDefault = false): Observable<InspectionSavedView> {
    const saved: InspectionSavedView = {
      viewId: `view-${this.nextViewId++}`,
      viewName: name.trim(),
      isBuiltIn: false,
      isDefault,
      filters: { ...filters },
      updatedAt: new Date().toISOString()
    };
    this.views.update((list) => [...list.map((v) => (isDefault ? { ...v, isDefault: false } : v)), saved]);
    return of(saved);
  }

  updateView(viewId: string, name: string, filters: InspectionSavedFilters, isDefault?: boolean): Observable<InspectionSavedView> {
    const current = this.views().find((v) => v.viewId === viewId);
    const saved: InspectionSavedView = {
      viewId,
      viewName: name.trim(),
      isBuiltIn: current?.isBuiltIn ?? false,
      isDefault: isDefault ?? current?.isDefault ?? false,
      filters: { ...filters },
      updatedAt: new Date().toISOString()
    };
    this.views.update((list) => list.map((v) => (v.viewId === viewId ? saved : isDefault ? { ...v, isDefault: false } : v)));
    return of(saved);
  }

  deleteView(viewId: string): Observable<void> {
    this.views.update((list) => list.filter((v) => v.viewId !== viewId));
    return of(undefined);
  }
}

/** The viewer's IANA time zone, so months and "today" match their calendar (UTC when unknown). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
