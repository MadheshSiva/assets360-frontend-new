import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { RA_CATEGORIES, RA_LOCATIONS, RA_ORGANIZATIONS, RA_PEOPLE, downloadCsv } from '../shared/analytics-common';
import {
  ALL_CATEGORIES, ALL_LOCATIONS, ALL_ORGANIZATIONS, KD_DEFAULT_PERIOD, KD_FALLBACK_PERIODS, KPI_MODULES, KPI_SEEDS, KPI_VIEW_SEEDS,
  KpiDashboardVm, KpiDef, KpiDirection, KpiInsightVm, KpiMetric, KpiModule, KpiSeed, KpiState, KpiStatus, KpiTrendVm, KpiUnit, KpiViewDef,
  emptyKpiDashboard, formatKpi, signedText, targetLabel
} from './kpi-dashboard.data';

/** What Create / Edit KPI saves. */
export interface SaveKpiBody {
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  direction: KpiDirection;
  target: number;
  owner: string;
  /** Catalogue metric; null = manual value */
  metric: string | null;
  value: number | null;
  reviewDueDate: string | null;
  /** Create only: also add the KPI as a tile on this view */
  viewKey?: string;
}

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface KdFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  viewKey: string;
  granularity: string;
}

export interface KdOptions {
  periods: string[];
  defaultPeriod: string;
  metrics: KpiMetric[];
  owners: string[];
}

export interface KdFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
}

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Months of history generated per metric (index 0 = current month) */
const HISTORY = 26;

// ----- In-memory store (kept for the browser session, so created KPIs and views survive navigation) -----

interface Store {
  defs: KpiDef[];
  views: KpiViewDef[];
  seq: number;
}

let store: Store | null = null;

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedDef(s: KpiSeed): KpiDef {
  return {
    id: s.id, name: s.name, module: s.module, unit: s.unit, target: s.target, direction: s.direction, owner: s.owner, info: s.info, metric: s.id,
    manualValue: null, flow: !!s.flow, history: s.history !== false, source: s.source, reviewDue: isoDay(s.reviewIn), custom: false
  };
}

function getStore(): Store {
  if (!store) {
    store = {
      defs: KPI_SEEDS.map(seedDef),
      views: KPI_VIEW_SEEDS.map((v) => ({
        key: v.key, label: v.label, dashboard: v.dashboard, custom: v.custom, items: v.ids.map((id) => ({ id, visible: true })), defaultIds: v.ids.slice()
      })),
      seq: 1
    };
  }
  return store;
}

// ----- Figures -----

/** Deterministic 0..1 from a string. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Monthly values of a metric, index 0 = current month. Flow metrics give the monthly spend. */
function history(seed: KpiSeed): number[] {
  const out: number[] = [];
  for (let m = 0; m < HISTORY; m++) {
    const wave = Math.sin((m + seed.id.length) * 1.3) * 0.5 + (hash(`${seed.id}:${m}`) - 0.5);
    let v: number;
    if (seed.flow) v = (seed.target / 12) * seed.value * (1 + wave * 0.08);
    else if (seed.unit === '%') v = Math.min(99.9, seed.value - (seed.direction === 'higher' ? 0.12 : -0.12) * m + wave * 0.9);
    else {
      const drift = seed.direction === 'higher' ? -0.006 : 0.008;
      v = seed.value * (1 + drift * m + wave * 0.05);
    }
    out.push(m === 0 ? (seed.flow ? (seed.target / 12) * seed.value : seed.value) : v);
  }
  return out;
}

const SEED_HISTORY = new Map(KPI_SEEDS.map((s) => [s.id, history(s)]));

/** Months covered by a period: [monthsBack, weight] pairs, oldest first. */
function periodWeights(period: string, shift = 0): [number, number][] {
  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const part = now.getDate() / dim;
  let w: [number, number][];
  switch (period) {
    case 'Today':
      w = [[0, 1 / dim]];
      break;
    case 'Last 7 days':
      w = [[0, Math.min(1, 7 / dim)]];
      break;
    case 'Last 30 days':
      w = now.getDate() >= 30 ? [[0, 1]] : [[1, (30 - now.getDate()) / 30], [0, part]];
      break;
    case 'This month':
      w = [[0, part]];
      break;
    case 'Last month':
      w = [[1, 1]];
      break;
    case 'This quarter': {
      const q = now.getMonth() % 3;
      w = Array.from({ length: q }, (_, i): [number, number] => [q - i, 1]);
      w.push([0, part]);
      break;
    }
    default: {
      // This year
      const m = now.getMonth();
      w = Array.from({ length: m }, (_, i): [number, number] => [m - i, 1]);
      w.push([0, part]);
    }
  }
  return w.map(([back, weight]) => [back + shift, weight]);
}

/** Months between two periods of the same preset (for "change vs previous period"). */
function periodShift(period: string): number {
  if (period === 'This year') return 12;
  if (period === 'This quarter') return 3;
  return 1;
}

/** Month label "Nov\n2026" for a number of months back. */
function monthLabelOf(back: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${MONTHS[d.getMonth()]}\n${d.getFullYear()}`;
}

interface Scope {
  /** Share of counts / amounts in scope */
  share: number;
  /** Points added to percentages */
  offset: number;
}

function scopeOf(f: KdFilters): Scope {
  let share = 1;
  let offset = 0;
  const apply = (value: string, all: string, min: number, span: number) => {
    if (!value || value === all) return;
    const h = hash(value);
    share *= min + h * span;
    offset += (h - 0.55) * 4;
  };
  apply(f.organization, ALL_ORGANIZATIONS, 0.3, 0.4);
  apply(f.location, ALL_LOCATIONS, 0.08, 0.2);
  apply(f.category, ALL_CATEGORIES, 0.1, 0.2);
  return { share, offset };
}

interface Figures {
  value: number;
  target: number;
}

/** Value and target of a KPI for weighted months, in scope. */
function figures(def: KpiDef, weights: [number, number][], scope: Scope): Figures | null {
  const series = def.metric ? SEED_HISTORY.get(def.metric) : null;
  if (!series) {
    if (def.manualValue === null) return null;
    return { value: def.manualValue, target: def.target };
  }
  const amount = def.unit === 'count' || def.unit === 'AED';
  const at = (back: number) => series[Math.min(back, series.length - 1)];
  const totalWeight = weights.reduce((a, [, w]) => a + w, 0) || 1;
  let value: number;
  let target = def.target;
  if (def.flow) {
    value = weights.reduce((a, [b, w]) => a + at(b) * w, 0);
    target = (def.target / 12) * totalWeight;
  } else if (!def.history || def.unit === 'count' || def.unit === 'AED') {
    // Point-in-time figures: the value at the end of the period
    value = at(Math.min(...weights.map(([b]) => b)));
  } else {
    value = weights.reduce((a, [b, w]) => a + at(b) * w, 0) / totalWeight;
  }
  if (amount) {
    value *= scope.share;
    target *= scope.share;
    if (def.unit === 'count') value = Math.round(value);
  } else if (def.unit === '%') {
    value = Math.max(0, Math.min(99.9, value + scope.offset));
  } else {
    value *= 1 + (scope.offset / 100) * (def.direction === 'higher' ? 1 : -1);
  }
  return { value, target };
}

function kpiStatus(value: number, target: number, direction: KpiDirection, unit: KpiUnit): KpiStatus {
  if (direction === 'higher') return value >= target ? 'On Track' : value >= target * 0.97 ? 'Watch' : 'At Risk';
  if (value <= target) return 'On Track';
  if (unit === 'AED') return 'Over Budget';
  return value <= target * 1.05 ? 'Watch' : 'At Risk';
}

/** Attainment vs target in % (100 = on target), for both directions */
function attainment(value: number, target: number, direction: KpiDirection): number {
  if (direction === 'higher') return target ? Math.min(130, (value / target) * 100) : 0;
  return value ? Math.min(130, (target / value) * 100) : 130;
}

function varianceText(def: KpiDef, value: number, target: number): string {
  switch (def.unit) {
    case '%':
      return signedText(value - target, 1, '%');
    case 'count':
      return signedText(Math.round(value) - Math.round(target), 0, '');
    case 'x':
      return signedText(value - target, 1, 'x');
    default:
      return signedText(((value - target) / (target || 1)) * 100, 0, '%');
  }
}

/** Days from today (local) to a yyyy-MM-dd date. */
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
}

function formatDay(date: string | null): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function evaluate(def: KpiDef, f: KdFilters, scope: Scope): KpiState {
  const weights = periodWeights(f.period || KD_DEFAULT_PERIOD);
  const now = figures(def, weights, scope);
  const before = figures(def, periodWeights(f.period || KD_DEFAULT_PERIOD, periodShift(f.period)), scope);
  const due = { due: formatDay(def.reviewDue), dueInDays: daysUntil(def.reviewDue) };
  if (!now) {
    return {
      def, value: null, target: def.target, status: 'No Data', valueText: '—', targetText: targetLabel(def, def.target, def.flow ? 'budget' : 'target'),
      varianceText: '—', changeText: '—', changeUp: true, changeGood: true, spark: [], monthly: [], attainment: 0, ...due
    };
  }
  const { value, target } = now;
  let change: number | null = null;
  if (before && def.metric) change = def.unit === '%' ? value - before.value : before.value ? ((value - before.value) / before.value) * 100 : null;
  const series = def.metric ? SEED_HISTORY.get(def.metric) : null;
  const scaled = (v: number) => (def.unit === 'count' || def.unit === 'AED' ? v * scope.share : def.unit === '%' ? Math.min(99.9, v + scope.offset) : v);
  const spark = series && def.history ? series.slice(0, 12).reverse().map((v) => Number(scaled(v).toFixed(2))) : [before?.value ?? value, value];
  return {
    def,
    value,
    target,
    status: kpiStatus(value, target, def.direction, def.unit),
    valueText: formatKpi(value, def.unit),
    targetText: targetLabel(def, target, def.flow ? 'budget' : 'target'),
    varianceText: varianceText(def, value, target),
    changeText: change === null ? '—' : signedText(change, 1, def.unit === '%' ? ' pts' : '%'),
    changeUp: (change ?? 0) >= 0,
    changeGood: change === null ? true : def.direction === 'higher' ? change >= 0 : change <= 0,
    spark,
    monthly: series && def.history ? weights.map(([b, w]) => Number(scaled(series[b] * (def.flow ? w : 1)).toFixed(2))) : [],
    attainment: Math.round(attainment(value, target, def.direction) * 10) / 10,
    ...due
  };
}

/** Overall score per month = average attainment of the view's KPIs with history (100 = on target). */
function trendOf(defs: KpiDef[], f: KdFilters, scope: Scope): KpiTrendVm {
  const end = f.period === 'Last month' ? 1 : 0;
  const withHistory = defs.filter((d) => d.history && d.metric && SEED_HISTORY.has(d.metric));
  const score = (back: number): number => {
    const list = withHistory.map((d) => {
      const fig = figures(d, [[back, 1]], scope)!;
      return attainment(fig.value, fig.target, d.direction);
    });
    return list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)) : 0;
  };
  const months = Array.from({ length: 12 }, (_, i) => end + 11 - i);
  if (f.granularity === 'Quarterly') {
    const groups = new Map<string, number[]>();
    for (const back of months) {
      const d = new Date(new Date().getFullYear(), new Date().getMonth() - back, 1);
      const key = `Q${Math.floor(d.getMonth() / 3) + 1}\n${d.getFullYear()}`;
      groups.set(key, [...(groups.get(key) ?? []), back]);
    }
    const avg = (backs: number[], shift: number) => Number((backs.reduce((a, b) => a + score(b + shift), 0) / backs.length).toFixed(1));
    const keys = [...groups.keys()];
    return {
      labels: keys,
      overall: keys.map((k) => avg(groups.get(k)!, 0)),
      target: keys.map(() => 100),
      prior: keys.map((k) => avg(groups.get(k)!, 12))
    };
  }
  return {
    labels: months.map(monthLabelOf),
    overall: months.map((b) => score(b)),
    target: months.map(() => 100),
    prior: months.map((b) => score(b + 12))
  };
}

function insightsOf(states: KpiState[]): KpiInsightVm[] {
  const out: KpiInsightVm[] = [];
  const atRisk = states.filter((s) => s.status === 'At Risk');
  if (atRisk.length) {
    out.push({
      key: 'at-risk', tone: 'red', title: `${atRisk.length} KPI${atRisk.length > 1 ? 's are' : ' is'} at risk`,
      text: atRisk.map((s) => `${s.def.name} (${s.valueText} vs ${s.targetText.replace(/^(Target|Budget) /, '')})`).join(' · '),
      actionLabel: 'View exceptions', action: 'exceptions', kpiId: atRisk[0].def.id, kpiIds: atRisk.map((s) => s.def.id)
    });
  }
  const over = states.filter((s) => s.status === 'Over Budget').sort((a, b) => a.attainment - b.attainment)[0];
  if (over) {
    out.push({
      key: 'over-budget', tone: 'orange', title: `${over.def.name} is over budget`,
      text: `${over.valueText} against ${over.targetText.replace(/^Budget /, '')} (${over.varianceText}). Owner: ${over.def.owner || 'unassigned'}.`,
      actionLabel: 'Create action plan', action: 'plan', kpiId: over.def.id, kpiIds: [over.def.id]
    });
  }
  const dueWeek = states.filter((s) => s.dueInDays !== null && s.dueInDays <= 7 && s.status !== 'On Track');
  if (dueWeek.length) {
    out.push({
      key: 'due-week', tone: 'orange', title: `${dueWeek.length} KPI review${dueWeek.length > 1 ? 's' : ''} due this week`,
      text: dueWeek.map((s) => `${s.def.name} (${s.due})`).join(' · '),
      actionLabel: 'View actions', action: 'due-week', kpiId: null, kpiIds: dueWeek.map((s) => s.def.id)
    });
  }
  const unowned = states.find((s) => !s.def.owner);
  if (unowned) {
    out.push({
      key: 'owner', tone: 'blue', title: `${unowned.def.name} has no owner`, text: 'Assign an owner so reviews and actions are followed up.',
      actionLabel: 'Assign owner', action: 'settings', kpiId: unowned.def.id, kpiIds: [unowned.def.id]
    });
  }
  const onTrack = states.filter((s) => s.status === 'On Track');
  out.push({
    key: 'on-track', tone: 'green', title: `${onTrack.length} of ${states.length} KPIs on track`,
    text: onTrack.length ? `Best: ${[...onTrack].sort((a, b) => b.attainment - a.attainment).slice(0, 3).map((s) => s.def.name).join(', ')}` : 'No KPI meets its target yet.',
    actionLabel: 'View exceptions', action: 'exceptions', kpiId: null, kpiIds: []
  });
  return out;
}

/** KPI Dashboard figures, KPI library and views (static demo data, worked out in the browser). */
@Injectable()
export class KpiDashboardService {
  readonly dashboard = signal<KpiDashboardVm>(emptyKpiDashboard());
  readonly loading = signal(false);
  readonly loaded = signal(false);

  /** Period presets, the metric catalogue and KPI owners. */
  loadOptions(): Observable<KdOptions> {
    return of({
      periods: KD_FALLBACK_PERIODS,
      defaultPeriod: KD_DEFAULT_PERIOD,
      metrics: KPI_SEEDS.map((s) => ({
        id: s.id, name: s.name, module: s.module, unit: s.unit, direction: s.direction, history: s.history !== false, source: s.source, info: s.info
      })),
      owners: [...RA_PEOPLE].sort()
    });
  }

  /** Organization, Location and Asset Category values. */
  loadFilters(): Observable<KdFilterLists> {
    return of({
      organizations: RA_ORGANIZATIONS.slice(),
      locations: RA_LOCATIONS.slice(),
      categories: [ALL_CATEGORIES, ...RA_CATEGORIES]
    });
  }

  /** Tiles, trend, targets, exceptions, insights, library and views for the filter bar. */
  loadOverview(f: KdFilters): Observable<KpiDashboardVm> {
    const s = getStore();
    const view = s.views.find((v) => v.key === f.viewKey);
    if (!view) return throwError(() => new Error(`View '${f.viewKey}' was not found.`));
    this.loading.set(true);
    const scope = scopeOf(f);
    const kpis = s.defs.map((d) => evaluate(d, f, scope));
    const byId = new Map(kpis.map((k) => [k.def.id, k]));
    const tiles = view.items.filter((i) => i.visible).map((i) => byId.get(i.id)).filter((k): k is KpiState => !!k);
    const modules = KPI_MODULES.filter((m) => tiles.some((t) => t.def.module === m && t.status !== 'No Data'));
    const d: KpiDashboardVm = {
      generatedAt: new Date().toISOString(),
      monthLabels: periodWeights(f.period || KD_DEFAULT_PERIOD).map(([b]) => monthLabelOf(b).replace('\n', ' ')),
      views: s.views.map((v) => ({ ...v, items: v.items.map((i) => ({ ...i })), defaultIds: v.defaultIds.slice() })),
      viewKey: view.key,
      tiles,
      kpis,
      trend: trendOf(tiles.map((t) => t.def), f, scope),
      targets: modules.map((m) => {
        const list = tiles.filter((t) => t.def.module === m && t.status !== 'No Data');
        return { module: m, value: Math.round(list.reduce((a, t) => a + t.attainment, 0) / list.length) };
      }),
      exceptions: tiles.filter((t) => t.status === 'Watch' || t.status === 'At Risk' || t.status === 'Over Budget').sort((a, b) => a.attainment - b.attainment),
      insights: insightsOf(tiles),
      library: KPI_MODULES.map((module) => ({ module, count: s.defs.filter((x) => x.module === module).length }))
    };
    this.dashboard.set(d);
    this.loaded.set(true);
    this.loading.set(false);
    return of(d);
  }

  /** The KPI Performance Trend for another granularity. */
  loadTrend(f: KdFilters): Observable<KpiTrendVm> {
    const s = getStore();
    const view = s.views.find((v) => v.key === f.viewKey);
    const ids = new Set((view?.items ?? []).filter((i) => i.visible).map((i) => i.id));
    const trend = trendOf(s.defs.filter((d) => ids.has(d.id)), f, scopeOf(f));
    this.dashboard.update((d) => ({ ...d, trend }));
    return of(trend);
  }

  /** The view's tiles as a CSV download. */
  export(f: KdFilters): Observable<void> {
    const d = this.dashboard().viewKey === f.viewKey && this.loaded() ? this.dashboard() : null;
    const tiles = d?.tiles ?? [];
    downloadCsv(
      `kpi-dashboard-${f.viewKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
      ['KPI', 'Module', 'Current', 'Target', 'Variance', 'Change vs previous period', 'Status', 'Owner', 'Due Date', 'Period', 'Organization', 'Location', 'Category'],
      tiles.map((s) => [
        s.def.name, s.def.module, s.valueText, s.targetText, s.varianceText, s.changeText, s.status, s.def.owner || 'Unassigned', s.due, f.period,
        f.organization, f.location, f.category
      ])
    );
    return of(undefined);
  }

  // ----- KPI library -----

  /** A custom KPI (added as a tile on body.viewKey). */
  createKpi(body: SaveKpiBody): Observable<KpiDef> {
    const s = getStore();
    const name = body.name.trim();
    if (s.defs.some((d) => d.name.toLowerCase() === name.toLowerCase())) return throwError(() => new Error('A KPI with this name already exists.'));
    const metric = body.metric ? KPI_SEEDS.find((m) => m.id === body.metric) : undefined;
    const def: KpiDef = {
      id: `custom-${s.seq++}`,
      name,
      module: body.module,
      unit: metric?.unit ?? body.unit,
      target: body.target,
      direction: metric?.direction ?? body.direction,
      owner: body.owner.trim(),
      info: metric ? `Custom KPI measuring ${metric.name.toLowerCase()}` : 'Custom KPI with a manually reported value',
      metric: metric?.id ?? null,
      manualValue: metric ? null : body.value,
      flow: !!metric?.flow,
      history: metric ? metric.history !== false : false,
      source: metric?.source ?? 'Manual',
      reviewDue: body.reviewDueDate,
      custom: true
    };
    s.defs = [...s.defs, def];
    const view = s.views.find((v) => v.key === body.viewKey);
    if (view) view.items = [...view.items, { id: def.id, visible: true }];
    return of(def);
  }

  /** Built-in KPIs keep their module, unit and metric. */
  updateKpi(kpiId: string, body: SaveKpiBody): Observable<KpiDef> {
    const s = getStore();
    const current = s.defs.find((d) => d.id === kpiId);
    if (!current) return throwError(() => new Error('KPI not found.'));
    const metric = current.custom && body.metric ? KPI_SEEDS.find((m) => m.id === body.metric) : undefined;
    const def: KpiDef = current.custom
      ? {
          ...current, name: body.name.trim(), module: body.module, unit: metric?.unit ?? body.unit, direction: metric?.direction ?? body.direction,
          target: body.target, owner: body.owner.trim(), metric: metric?.id ?? null, manualValue: metric ? null : body.value, flow: !!metric?.flow,
          history: metric ? metric.history !== false : false, source: metric?.source ?? 'Manual', reviewDue: body.reviewDueDate
        }
      : { ...current, name: body.name.trim(), direction: body.direction, target: body.target, owner: body.owner.trim(), reviewDue: body.reviewDueDate };
    s.defs = s.defs.map((d) => (d.id === kpiId ? def : d));
    return of(def);
  }

  // ----- Views -----

  /** Save current tiles as a custom view. */
  createView(label: string, ids: string[]): Observable<KpiViewDef> {
    const s = getStore();
    const name = label.trim();
    if (s.views.some((v) => v.label.toLowerCase() === name.toLowerCase())) return throwError(() => new Error(`A view named “${name}” already exists.`));
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view';
    let key = `custom:${slug}`;
    for (let i = 2; s.views.some((v) => v.key === key); i++) key = `custom:${slug}-${i}`;
    const view: KpiViewDef = { key, label: name, dashboard: `${name} (custom)`, custom: true, items: ids.map((id) => ({ id, visible: true })), defaultIds: ids.slice() };
    s.views = [...s.views, view];
    return of(view);
  }

  /** The tiles of a view in order, with their visibility. */
  saveLayout(viewKey: string, items: { id: string; visible: boolean }[]): Observable<KpiViewDef> {
    return this.updateView(viewKey, (v) => ({ ...v, items: items.map((i) => ({ ...i })) }));
  }

  /** Back to the default tiles. */
  resetView(viewKey: string): Observable<KpiViewDef> {
    return this.updateView(viewKey, (v) => ({ ...v, items: v.defaultIds.map((id) => ({ id, visible: true })) }));
  }

  /** Custom views only. */
  deleteView(viewKey: string): Observable<void> {
    const s = getStore();
    const view = s.views.find((v) => v.key === viewKey);
    if (!view) return throwError(() => new Error(`View '${viewKey}' was not found.`));
    if (!view.custom) return throwError(() => new Error('Standard views cannot be deleted.'));
    s.views = s.views.filter((v) => v.key !== viewKey);
    return of(undefined);
  }

  private updateView(viewKey: string, change: (v: KpiViewDef) => KpiViewDef): Observable<KpiViewDef> {
    const s = getStore();
    const view = s.views.find((v) => v.key === viewKey);
    if (!view) return throwError(() => new Error(`View '${viewKey}' was not found.`));
    const updated = change(view);
    s.views = s.views.map((v) => (v.key === viewKey ? updated : v));
    return of(updated);
  }
}
