import { Injectable, signal } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { RA_PEOPLE, downloadCsv } from '../shared/analytics-common';
import {
  ALL_CATEGORIES, ALL_DEVICE_TYPES, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_STATUSES, CONNECTIVITY, IOT_DEFAULT_PERIOD, IOT_FALLBACK_PERIODS, IotView,
  buildDemoHistory, buildDemoIot, buildDemoPreviousProduction, demoIotAssetRows, demoIotFilterLists, emptyIot
} from './iot-utilization.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface IotFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  deviceType: string;
  connectivity: string;
}

export interface IotOptions {
  periods: string[];
  defaultPeriod: string;
  statuses: string[];
  autoRefreshSeconds: number;
  priorities: string[];
}

export interface IotFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  deviceTypes: string[];
  owners: string[];
}

export interface IotSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: IotFilters;
}

/** A new action plan. */
export interface IotActionPlanRequest {
  title: string;
  owner: string;
  dueDate: string;
  priority: string;
  notes: string;
  insightKey: string | null;
  context: string;
  deviceIds: string[];
}

interface ActionPlanResult {
  planId: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: string;
}

const ALL_FILTERS: IotFilters = {
  period: IOT_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, deviceType: ALL_DEVICE_TYPES,
  connectivity: ALL_STATUSES
};

/** IoT / Utilization Analytics figures, filters, saved views and action plans from static demo data (iot-utilization.data.ts). */
@Injectable()
export class IotUtilizationAnalyticsService {
  readonly view = signal<IotView>(emptyIot());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly periods = signal<string[]>(IOT_FALLBACK_PERIODS);

  /** Saved views and action plans live in memory for the demo */
  private views: IotSavedView[] = [
    { viewId: 'all-iot', name: 'All connected assets', builtIn: true, isDefault: true, filters: { ...ALL_FILTERS } },
    {
      viewId: 'view-uae-vibration', name: 'UAE vibration sensors', builtIn: false, isDefault: false,
      filters: { ...ALL_FILTERS, organization: 'Purple IQ UAE', deviceType: 'Vibration Sensors' }
    }
  ];
  private viewSeq = 1;
  private planSeq = 214;

  /** Period presets, connectivity statuses and the auto refresh interval. */
  loadOptions(): Observable<IotOptions> {
    this.periods.set(IOT_FALLBACK_PERIODS);
    return of({
      periods: IOT_FALLBACK_PERIODS,
      defaultPeriod: IOT_DEFAULT_PERIOD,
      statuses: [ALL_STATUSES, ...CONNECTIVITY],
      autoRefreshSeconds: 30,
      priorities: ['Critical', 'High', 'Medium', 'Low']
    });
  }

  /** Organization, Location, Asset Category and Device Type values, and the action plan owners. */
  loadFilters(): Observable<IotFilterLists> {
    return of({ ...demoIotFilterLists(), owners: RA_PEOPLE.slice(0, 12) });
  }

  /** Every section for the filter bar in one call. */
  loadOverview(f: IotFilters): Observable<IotView> {
    return defer(() => {
      this.loading.set(true);
      const v = buildDemoIot(f);
      this.view.set(v);
      this.loaded.set(true);
      this.error.set(null);
      this.loading.set(false);
      return of(v);
    });
  }

  /** The previous period's Production line (same length, just before the selected one). */
  loadPreviousProduction(f: IotFilters): Observable<number[]> {
    return defer(() => of(buildDemoPreviousProduction(f)));
  }

  /** Weekly utilization over the last 12 weeks. */
  loadHistory(f: IotFilters, assetKey: string): Observable<number[]> {
    return defer(() => of(buildDemoHistory(f, assetKey)));
  }

  /** CSV of the connected assets for the filter bar. */
  exportAssets(f: IotFilters): Observable<void> {
    return defer(() => {
      downloadCsv('iot-utilization-assets.csv',
        ['Asset ID', 'Asset Name', 'Category', 'Location', 'Organization', 'Device Type', 'Device ID', 'Connectivity', 'Sensor Health', 'Utilization %',
          'Target %', 'Variance (pts)', 'Telemetry Availability %', 'Signal (dBm)', 'Last Telemetry'],
        demoIotAssetRows(f));
      return of(undefined);
    });
  }

  // ----- Saved views -----

  /** The built-in view, then the user's own. */
  loadViews(): Observable<IotSavedView[]> {
    return of(this.views.map((v) => ({ ...v, filters: { ...v.filters } })));
  }

  createView(name: string, f: IotFilters): Observable<IotSavedView> {
    const saved: IotSavedView = { viewId: `view-${this.viewSeq++}`, name: name.trim(), builtIn: false, isDefault: false, filters: { ...f } };
    this.views = [...this.views, saved];
    return of(saved);
  }

  // ----- Action plans -----

  createActionPlan(plan: IotActionPlanRequest): Observable<ActionPlanResult> {
    const planId = `AP-IOT-${new Date().getFullYear()}-${String(++this.planSeq).padStart(4, '0')}`;
    return of({ planId, title: plan.title, owner: plan.owner, dueDate: plan.dueDate, priority: plan.priority });
  }
}
