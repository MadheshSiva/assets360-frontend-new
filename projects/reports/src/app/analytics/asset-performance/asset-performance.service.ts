import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { RA_CATEGORIES, downloadCsv } from '../shared/analytics-common';
import { ChartSeries, HBarRow, RA_COLORS } from '../shared/charts';
import {
  AP_DEFAULT_HEALTH_THRESHOLD, AP_DEFAULT_PERIOD, AP_DEFAULT_UTILIZATION_TARGET, AP_FALLBACK_PERIODS, AP_REGISTER, ALL_ASSETS_VIEW, ALL_LOCATIONS,
  ALL_ORGANIZATIONS, ApAssetRow, ApInsight, ApLocationRow, ApRegisterAsset, AssetPerformanceView, emptyAssetPerformance
} from './asset-performance.data';
import { ALL_CATEGORIES, ALL_TYPES, RA_ASSET_TYPES } from './kit/asset-universe';
import {
  CURRENT, DEMO_ORGANIZATIONS, DEMO_SITES, drifted, mean, monthAxisLabel, pctChange, periodMonths, periodWeight, previousMonths, previousRangeUtc, rnd, round1, sum
} from './kit/demo-data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface ApFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  assetType: string;
}

export interface ApSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface ApFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  assetTypes: string[];
}

export interface ApPreviousTrends {
  healthy: number[];
  mtbf: number[];
}

const BANDS = [
  { band: 'Excellent', min: 80, max: 100, color: RA_COLORS.green },
  { band: 'Good', min: 60, max: 79, color: RA_COLORS.blue },
  { band: 'Watch', min: 40, max: 59, color: RA_COLORS.orange },
  { band: 'Critical', min: 0, max: 39, color: RA_COLORS.red }
];

/** Heavily used assets (utilization at or above this) that are drifting toward the watch band need maintenance first. */
const INTERVENTION_UTILIZATION = 75;
const INTERVENTION_HEALTH = 70;

const avg = (list: number[]) => round1(mean(list));
const rated = (list: ApRegisterAsset[]) => list.filter((a) => a.health !== null);

function score(a: ApRegisterAsset): number | null {
  if (a.health === null) return null;
  return Math.round(a.health * 0.5 + a.utilization * 0.3 + Math.min(100, Math.max(0, (a.availability - 80) * 5)) * 0.2);
}

function bandOf(value: number | null): string | null {
  return value === null ? null : BANDS.find((b) => value >= b.min)?.band ?? 'Critical';
}

function statusOf(value: number | null): string {
  return value === null ? 'Not rated' : value >= 80 ? 'Top Performer' : value >= 60 ? 'On Track' : 'Underperforming';
}

function inScope(a: ApRegisterAsset, f: ApFilters): boolean {
  if (f.organization && f.organization !== ALL_ORGANIZATIONS && a.site.org !== f.organization) return false;
  if (f.location && f.location !== ALL_LOCATIONS && a.site.name !== f.location) return false;
  if (f.category && f.category !== ALL_CATEGORIES && a.category !== f.category) return false;
  if (f.assetType && f.assetType !== ALL_TYPES && a.type !== f.assetType) return false;
  return true;
}

/** One asset's figures over the period (downtime and failures scale with its length). */
function toRow(a: ApRegisterAsset, period: string): ApAssetRow {
  const share = (periodMonths(period).length / 12) * periodWeight(period);
  const failures = Math.round(a.failuresYear * share);
  const s = score(a);
  return {
    key: a.key,
    id: a.id,
    name: a.name,
    category: a.category,
    type: a.type,
    location: a.site.name,
    health: a.health,
    utilization: a.utilization,
    availability: a.availability,
    mtbf: a.mtbf,
    mttr: a.mttr,
    downtime: round1(a.plannedHoursYear * share + failures * (a.mttr ?? 0)),
    failures,
    score: s,
    band: bandOf(s),
    status: statusOf(s)
  };
}

/** Parses "a=1&b=two" (an insight's filter). */
function queryParams(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (query ?? '').split('&')) {
    const [key, value] = part.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  }
  return result;
}

function isIntervention(a: ApRegisterAsset, threshold: number): boolean {
  return a.health !== null && a.health >= threshold && a.health < INTERVENTION_HEALTH && a.utilization >= INTERVENTION_UTILIZATION;
}

/** Monthly figures for the scope: health shares, reliability and downtime, with a gentle improvement through the year. */
function monthly(assets: ApRegisterAsset[], months: number[], weight: number) {
  const list = rated(assets);
  const n = list.length || 1;
  const healthyNow = (list.filter((a) => (a.health ?? 0) >= 60).length / n) * 100;
  const criticalNow = (list.filter((a) => (a.health ?? 0) < 40).length / n) * 100;
  const mtbfNow = mean(list.map((a) => a.mtbf ?? 0));
  const mttrNow = mean(list.map((a) => a.mttr ?? 0));
  const planned = sum(assets.map((a) => a.plannedHoursYear)) / 12;
  const unplanned = sum(assets.map((a) => a.failuresYear * (a.mttr ?? 0))) / 12;
  return months.map((m) => {
    const healthy = list.length ? Math.min(100, Math.max(0, drifted(healthyNow, m, 0.55, 0.9, 11))) : 0;
    const critical = list.length ? Math.max(0, drifted(criticalNow, m, -0.18, 0.3, 12)) : 0;
    return {
      healthy: round1(healthy),
      critical: round1(critical),
      atRisk: list.length ? round1(Math.max(0, 100 - healthy - critical)) : 0,
      health: drifted(mean(list.map((a) => a.health ?? 0)), m, 0.3, 0.4, 13),
      utilization: drifted(mean(assets.map((a) => a.utilization)), m, 0.25, 0.8, 14),
      availability: drifted(mean(assets.map((a) => a.availability)), m, 0.04, 0.15, 15),
      mtbf: list.length ? Math.round(drifted(mtbfNow, m, 5, 14, 16)) : 0,
      mttr: list.length ? round1(Math.max(0.5, drifted(mttrNow, m, -0.04, 0.25, 17))) : 0,
      planned: round1(planned * (0.85 + rnd(m, 18) * 0.3) * weight),
      unplanned: round1(unplanned * (1 + (CURRENT - m) * 0.025) * (0.85 + rnd(m, 19) * 0.3) * weight)
    };
  });
}

function buildView(f: ApFilters): AssetPerformanceView {
  const threshold = AP_DEFAULT_HEALTH_THRESHOLD;
  const target = AP_DEFAULT_UTILIZATION_TARGET;
  const assets = AP_REGISTER.filter((a) => inScope(a, f));
  const ratedList = rated(assets);
  const months = periodMonths(f.period);
  const previous = previousMonths(f.period);
  const weight = periodWeight(f.period);
  const now = monthly(assets, months, weight);
  const before = monthly(assets, previous, weight);
  const change = (key: 'health' | 'utilization' | 'availability' | 'mtbf' | 'mttr') =>
    before.length ? pctChange(mean(now.map((x) => x[key])), mean(before.map((x) => x[key]))) : 0;
  const rows = assets.map((a) => toRow(a, f.period));

  // Utilization split per category: in use, out for maintenance (unavailable hours) and idle
  const categories = RA_CATEGORIES.filter((c) => assets.some((a) => a.category === c));
  const split = categories.map((c) => {
    const list = assets.filter((a) => a.category === c);
    const active = Math.round(mean(list.map((a) => a.utilization)));
    const maintenance = Math.round(100 - mean(list.map((a) => a.availability)));
    return { active, maintenance, idle: Math.max(0, 100 - active - maintenance) };
  });

  const scored = rows.filter((r) => r.score !== null);
  const distribution: HBarRow[] = BANDS.map((b) => {
    const count = scored.filter((r) => r.band === b.band).length;
    const pct = scored.length ? Math.round((count / scored.length) * 100) : 0;
    return { label: `${b.band} (${b.min}–${b.max})`, value: count, display: `${count} (${pct}%)`, color: b.color };
  });

  // Five best and five worst assets by performance score
  const ranked = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topBottom = ranked.length > 10 ? [...ranked.slice(0, 5), ...ranked.slice(-5)] : ranked;

  const locations: ApLocationRow[] = DEMO_SITES.filter((s) => assets.some((a) => a.site === s)).map((s) => {
    const list = assets.filter((a) => a.site === s);
    const scores = rows.filter((r) => r.location === s.name && r.score !== null).map((r) => r.score ?? 0);
    const health = rated(list).length ? Math.round(mean(rated(list).map((a) => a.health ?? 0))) : null;
    const utilization = avg(list.map((a) => a.utilization));
    const locationScore = scores.length ? Math.round(mean(scores)) : null;
    return {
      name: s.name,
      assets: list.length,
      health,
      utilization,
      availability: avg(list.map((a) => a.availability)),
      score: locationScore,
      status: locationScore === null ? 'Not rated' : utilization < target || (health ?? 0) < 65 ? 'Underperforming' : locationScore >= 80 ? 'Top Performer' : 'On Track'
    };
  });

  const range = previousRangeUtc(f.period);
  return {
    generatedAt: new Date().toISOString(),
    previousFromUtc: previous.length ? range.fromUtc : null,
    previousToUtc: previous.length ? range.toUtc : null,
    healthThreshold: threshold,
    utilizationTarget: target,
    total: assets.length,
    totalChange: assets.length ? round1(1.2 + months.length * 0.35) : 0,
    health: { value: ratedList.length ? Math.round(mean(ratedList.map((a) => a.health ?? 0))) : null, change: change('health') },
    utilization: { value: assets.length ? Math.round(mean(assets.map((a) => a.utilization))) : null, change: change('utilization') },
    availability: { value: assets.length ? avg(assets.map((a) => a.availability)) : null, change: change('availability') },
    mtbf: { value: ratedList.length ? Math.round(mean(ratedList.map((a) => a.mtbf ?? 0))) : null, change: change('mtbf') },
    mttr: { value: ratedList.length ? avg(ratedList.map((a) => a.mttr ?? 0)) : null, change: change('mttr') },
    labels: months.map(monthAxisLabel),
    healthTrend: [
      { name: 'Healthy', values: now.map((x) => x.healthy), color: RA_COLORS.green, area: true },
      { name: 'At Risk', values: now.map((x) => x.atRisk), color: RA_COLORS.orange },
      { name: 'Critical', values: now.map((x) => x.critical), color: RA_COLORS.red }
    ],
    categoryLabels: categories.map((c, i) => `${c}\n${split[i].active}%`),
    categoryUtilization: [
      { name: 'Active', values: split.map((s) => s.active), color: RA_COLORS.purple },
      { name: 'Idle', values: split.map((s) => s.idle), color: RA_COLORS.sky },
      { name: 'Maintenance', values: split.map((s) => s.maintenance), color: RA_COLORS.orange }
    ],
    distribution,
    ratedAssets: scored.length,
    notRated: rows.length - scored.length,
    reliability: [
      { name: 'MTBF (hrs)', values: now.map((x) => x.mtbf), color: RA_COLORS.purple, area: true },
      { name: 'MTTR (hrs)', values: now.map((x) => x.mttr), color: RA_COLORS.blue, axis: 'right' }
    ],
    downtime: [
      { name: 'Planned', values: now.map((x) => x.planned), color: RA_COLORS.blue },
      { name: 'Unplanned', values: now.map((x) => x.unplanned), color: RA_COLORS.pink }
    ],
    downtimeHours: Math.round(sum(now.map((x) => x.planned + x.unplanned))),
    topBottom,
    locations,
    insights: buildInsights(assets, locations, threshold, target)
  };
}

function buildInsights(assets: ApRegisterAsset[], locations: ApLocationRow[], threshold: number, target: number): ApInsight[] {
  const named = (list: ApRegisterAsset[], reasons: (a: ApRegisterAsset) => string[]) =>
    list.slice(0, 10).map((a) => ({ key: a.key, id: a.id, name: a.name, location: a.site.name, health: a.health, reasons: reasons(a) }));
  const byHealth = (a: ApRegisterAsset, b: ApRegisterAsset) => (a.health ?? 0) - (b.health ?? 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const below = assets.filter((a) => a.health !== null && a.health < threshold).sort(byHealth);
  const intervention = assets.filter((a) => isIntervention(a, threshold)).sort(byHealth);
  const lowSites = locations.filter((l) => l.utilization !== null && l.utilization < target);
  return [
    {
      key: 'below_health_threshold',
      severity: 'critical',
      title: below.length ? `${plural(below.length, 'asset')} below health threshold` : 'All assets above health threshold',
      message: below.length
        ? `${plural(below.length, 'asset')} ${below.length === 1 ? 'has' : 'have'} a health score below ${threshold} and need a condition assessment.`
        : `Every assessed asset has a health score of ${threshold} or more.`,
      count: below.length,
      assets: named(below, (a) => [`Health score ${a.health}`, `Availability ${a.availability}%`, `MTTR ${a.mttr} hrs`]),
      locations: [...new Set(below.map((a) => a.site.name))],
      actions: ['view_assets', 'create_work_order'],
      query: `healthBelow=${threshold}`
    },
    {
      key: 'maintenance_intervention',
      severity: 'warning',
      title: intervention.length ? `Maintenance intervention recommended for ${plural(intervention.length, 'asset')}` : 'No maintenance intervention needed',
      message: intervention.length
        ? `${plural(intervention.length, 'heavily used asset')} (utilization ≥ ${INTERVENTION_UTILIZATION}%) ${intervention.length === 1 ? 'is' : 'are'} trending toward the watch band. Schedule preventive maintenance before ${intervention.length === 1 ? 'it degrades' : 'they degrade'} further.`
        : 'No heavily used assets are trending toward the watch band.',
      count: intervention.length,
      assets: named(intervention, (a) => [`Health score ${a.health}`, `Utilization ${a.utilization}%`]),
      locations: [...new Set(intervention.map((a) => a.site.name))],
      actions: ['view_assets', 'create_work_order'],
      query: 'interventionOnly=true'
    },
    {
      key: 'utilization_below_target',
      severity: 'info',
      title: lowSites.length ? `Utilization below target at ${plural(lowSites.length, 'location')}` : 'Utilization on target at every location',
      message: lowSites.length
        ? `${lowSites.map((l) => `${l.name} (${l.utilization}%)`).join(', ')} ${lowSites.length === 1 ? 'is' : 'are'} below the ${target}% utilization target. Consider redeploying idle assets.`
        : `Every location meets the ${target}% utilization target.`,
      count: lowSites.length,
      assets: [],
      locations: lowSites.map((l) => l.name),
      actions: ['view_locations'],
      query: ''
    }
  ];
}

const DEMO_VIEWS: ApSavedView[] = [
  {
    viewId: 'view-uae-fleet', name: 'UAE Fleet', builtIn: false, isDefault: false,
    filters: { period: AP_DEFAULT_PERIOD, organization: 'Purple IQ UAE', location: ALL_LOCATIONS, category: 'Vehicles', assetType: ALL_TYPES }
  },
  {
    viewId: 'view-dxb-hvac', name: 'Dubai HQ – HVAC', builtIn: false, isDefault: false,
    filters: { period: 'Last 12 months', organization: ALL_ORGANIZATIONS, location: 'Dubai HQ', category: 'HVAC', assetType: ALL_TYPES }
  }
];

/** DEMO MODE: Asset Performance figures, filters and saved views built in the browser from the static asset register. */
@Injectable()
export class AssetPerformanceService {
  readonly view = signal<AssetPerformanceView>(emptyAssetPerformance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(AP_FALLBACK_PERIODS);
  readonly views = signal<ApSavedView[]>([]);
  private nextId = 1;

  /** Period presets and the default one. */
  loadOptions(): Observable<{ periods: string[]; defaultPeriod: string }> {
    return of({ periods: AP_FALLBACK_PERIODS, defaultPeriod: AP_DEFAULT_PERIOD });
  }

  /** Organization, Location, Category and Asset Type values. */
  loadFilters(): Observable<ApFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...DEMO_ORGANIZATIONS],
      locations: [ALL_LOCATIONS, ...DEMO_SITES.map((s) => s.name)],
      categories: [ALL_CATEGORIES, ...RA_CATEGORIES],
      assetTypes: [ALL_TYPES, ...RA_ASSET_TYPES]
    });
  }

  /** Every section for the filter bar. */
  loadOverview(f: ApFilters): Observable<AssetPerformanceView> {
    const v = buildView(f);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  /** Compare Periods: the previous period's Healthy share and MTBF lines, plotted against the current months. */
  loadPrevious(f: ApFilters, _range: { from: string; to: string }): Observable<ApPreviousTrends> {
    const list = monthly(AP_REGISTER.filter((a) => inScope(a, f)), previousMonths(f.period), periodWeight(f.period));
    return of({ healthy: list.map((x) => x.healthy), mtbf: list.map((x) => x.mtbf) });
  }

  /** Assets matching an insight's filter (healthBelow=60 or interventionOnly=true), worst first. */
  loadAssets(f: ApFilters, query: string): Observable<{ items: ApAssetRow[]; total: number }> {
    const q = queryParams(query);
    const below = q['healthBelow'] ? Number(q['healthBelow']) : null;
    const items = AP_REGISTER
      .filter((a) => inScope(a, f))
      .filter((a) => (below === null || (a.health !== null && a.health < below)) && (q['interventionOnly'] !== 'true' || isIntervention(a, AP_DEFAULT_HEALTH_THRESHOLD)))
      .sort((a, b) => (a.health ?? 101) - (b.health ?? 101))
      .map((a) => toRow(a, f.period));
    return of({ items, total: items.length });
  }

  /** Every asset in scope as a CSV download. */
  export(f: ApFilters): Observable<void> {
    const rows = AP_REGISTER.filter((a) => inScope(a, f)).map((a) => toRow(a, f.period));
    downloadCsv('asset-performance.csv',
      ['Asset ID', 'Asset Name', 'Category', 'Asset Type', 'Location', 'Health Score', 'Utilization %', 'Availability %', 'MTBF (hrs)', 'MTTR (hrs)',
        'Downtime (hrs)', 'Failures', 'Performance Score', 'Band', 'Status'],
      rows.map((r) => [r.id, r.name, r.category, r.type, r.location, r.health ?? '', r.utilization ?? '', r.availability ?? '', r.mtbf ?? '', r.mttr ?? '',
        r.downtime, r.failures, r.score ?? '', r.band ?? '', r.status]));
    return of(undefined);
  }

  // ----- Saved views (kept in memory) -----

  /** The built-in All Assets view, then the user's own. */
  loadViews(): Observable<ApSavedView[]> {
    if (!this.views().length) this.views.set([this.allAssetsView(), ...DEMO_VIEWS.map((v) => ({ ...v, filters: { ...v.filters } }))]);
    return of(this.views());
  }

  createView(name: string, f: ApFilters, isDefault = false): Observable<ApSavedView> {
    const saved: ApSavedView = { viewId: `view-${Date.now()}-${this.nextId++}`, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.views.update((list) => [...list, saved]);
    return of(saved);
  }

  updateView(viewId: string, name: string, f: ApFilters, isDefault = false): Observable<ApSavedView> {
    const saved: ApSavedView = { viewId, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.views.update((list) => list.map((v) => (v.viewId === viewId ? saved : v)));
    return of(saved);
  }

  deleteView(viewId: string): Observable<void> {
    this.views.update((list) => list.filter((v) => v.viewId !== viewId));
    return of(undefined);
  }

  allAssetsView(): ApSavedView {
    return {
      viewId: 'all-assets', name: ALL_ASSETS_VIEW, builtIn: true, isDefault: false,
      filters: { period: AP_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: ALL_TYPES }
    };
  }

  private toFilters(f: ApFilters): Record<string, string> {
    return { period: f.period || AP_DEFAULT_PERIOD, organization: f.organization, location: f.location, category: f.category, assetType: f.assetType };
  }
}
