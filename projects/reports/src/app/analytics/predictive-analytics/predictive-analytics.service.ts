import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { downloadCsv } from '../shared/analytics-common';
import { ChartSeries, RA_COLORS } from '../shared/charts';
import { ALL_CATEGORIES, ALL_TYPES } from '../asset-performance/kit/asset-universe';
import { monthLabel } from '../asset-performance/kit/api-utils';
import {
  ACCURACY_TARGET, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_PREDICTIONS_VIEW, ALL_RISK_LEVELS, ANOMALY_SIGNALS, DAY_MS, FAILURE_WINDOW_DAYS,
  HIGH_RISK_SCORE, ModelRow, PA_ASSET_TYPES, PA_AVG_CORRECTIVE_COST, PA_CATEGORIES, PA_DEFAULT_PERIOD, PA_DEMO, PA_FALLBACK_PERIODS, PA_GROUP,
  PA_MODELS, PA_ORGANIZATIONS, PA_SITES, PA_TODAY, PaAsset, PaDemoAsset, PaInsight, PredictiveView, REVIEW_CONFIDENCE, RISK_COLORS, RISK_LEVELS,
  emptyPredictive, failureWindow, monthCategory, monthStart, periodOffsets, riskLevel, rulHours
} from './predictive-analytics.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface PaFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  assetType: string;
  riskLevel: string;
}

export interface PaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: Record<string, string>;
}

export interface PaOptions {
  periods: string[];
  defaultPeriod: string;
  riskLevels: string[];
}

export interface PaFilterLists {
  organizations: string[];
  locations: string[];
  categories: string[];
  assetTypes: string[];
}

const BAND_COLORS: Record<string, string> = { 'High Risk': RA_COLORS.red, 'Medium Risk': RA_COLORS.orange, 'Low Risk': RA_COLORS.green };
const ANOMALY_COLORS = [RA_COLORS.red, RA_COLORS.blue, RA_COLORS.orange, RA_COLORS.violet, RA_COLORS.teal];
const ALERT_STATUSES = ['Open', 'Acknowledged', 'In Progress'];

const round1 = (v: number) => Math.round(v * 10) / 10;
const sum = (list: number[]) => list.reduce((s, v) => s + v, 0);
const mean = (list: number[]) => (list.length ? sum(list) / list.length : null);
const iso = (ms: number) => new Date(ms).toISOString();
/** Relative change in %, one decimal. */
const change = (now: number | null, before: number | null) => (now === null || !before ? 0 : round1(((now - before) / before) * 100));
const all = (value: string, everything: string) => !value || value === everything;
const monitoredAt = (a: PaDemoAsset, m: number) => a.monitoredSince >= m;

function inScope(a: PaDemoAsset, f: PaFilters): boolean {
  return (all(f.organization, ALL_ORGANIZATIONS) || f.organization === PA_GROUP || a.organization === f.organization)
    && (all(f.location, ALL_LOCATIONS) || a.location === f.location)
    && (all(f.category, ALL_CATEGORIES) || a.category === f.category)
    && (all(f.assetType, ALL_TYPES) || a.type === f.assetType)
    && (all(f.riskLevel, ALL_RISK_LEVELS) || riskLevel(a.scores[0]) === f.riskLevel);
}

/** The asset's current prediction as the page shows it. */
function toAsset(a: PaDemoAsset, index: number): PaAsset {
  const score = a.scores[0];
  const risk = riskLevel(score);
  const rul = rulHours(score, 0.85 + ((index * 37) % 30) / 100);
  const days = Math.ceil(rul / 24);
  const predicted = days <= 90;
  const vibration = (a.sensor === 'Vibration' && score >= 45) || (a.anomalies[0]['Vibration'] ?? 0) > 0;
  return {
    key: a.key,
    id: a.id,
    name: a.name,
    location: a.location,
    category: a.category,
    type: a.type,
    risk,
    riskScore: score,
    health: 100 - score,
    confidence: a.confidence,
    failureWindowDays: predicted ? days : null,
    rulHours: rul,
    predictedFailureDate: predicted ? new Date(PA_TODAY + days * DAY_MS).toISOString().slice(0, 10) : null,
    issue: score >= 35 ? a.issue : null,
    model: a.model,
    sensor: a.sensor,
    action: score >= 35 ? a.action : 'Continue routine monitoring',
    vibrationAnomaly: vibration,
    owner: a.owner ?? 'Unassigned',
    alertStatus: score >= HIGH_RISK_SCORE ? ALERT_STATUSES[index % ALERT_STATUSES.length] : score >= 35 ? 'Watch' : 'No alert'
  };
}

/** Accuracy figures from evaluated predictions (precision, recall and false positives derived from the match rate). */
function accuracyOf(list: PaDemoAsset[], months: number[]): { accuracy: number | null; evaluated: number } {
  const evaluated = sum(list.flatMap((a) => months.map((m) => a.evaluated[m])));
  const correct = sum(list.flatMap((a) => months.map((m) => a.correct[m])));
  return { accuracy: evaluated ? round1((correct / evaluated) * 100) : null, evaluated };
}

/** Predictive Analytics figures, filters and saved views, computed in the browser from the static demo dataset. */
@Injectable()
export class PredictiveAnalyticsService {
  readonly view = signal<PredictiveView>(emptyPredictive());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(PA_FALLBACK_PERIODS);
  readonly views = signal<PaSavedView[]>([]);

  private savedViews: PaSavedView[] = [
    {
      viewId: 'view-critical-uae', name: 'Critical – UAE sites', builtIn: false, isDefault: false,
      filters: {
        period: PA_DEFAULT_PERIOD, organization: 'Purple IQ UAE', location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: ALL_TYPES, riskLevel: 'Critical'
      }
    },
    {
      viewId: 'view-rotating', name: 'Rotating equipment', builtIn: false, isDefault: false,
      filters: {
        period: 'Last 6 months', organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: 'Rotating Equipment',
        riskLevel: ALL_RISK_LEVELS
      }
    }
  ];
  private nextViewId = 1;

  /** Period presets and risk levels. */
  loadOptions(): Observable<PaOptions> {
    this.periods.set(PA_FALLBACK_PERIODS);
    return of({ periods: PA_FALLBACK_PERIODS, defaultPeriod: PA_DEFAULT_PERIOD, riskLevels: [ALL_RISK_LEVELS, ...RISK_LEVELS] });
  }

  /** Organization, Location, Asset Category and Asset Type values. */
  loadFilters(): Observable<PaFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...PA_ORGANIZATIONS],
      locations: [ALL_LOCATIONS, ...PA_SITES.map((s) => s.location)],
      categories: [ALL_CATEGORIES, ...PA_CATEGORIES],
      assetTypes: [ALL_TYPES, ...PA_ASSET_TYPES]
    });
  }

  private scoped(f: PaFilters): PaDemoAsset[] {
    return PA_DEMO.filter((a) => inScope(a, f));
  }

  /** Every section for the filter bar in one call. */
  loadOverview(f: PaFilters): Observable<PredictiveView> {
    this.loading.set(true);
    const v = this.build(f);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  /** Average risk score of the assets in a band at each month end. */
  private bandTrend(list: PaDemoAsset[], months: number[], lo: number, hi: number): number[] {
    return months.map((m) => {
      const scores = list.filter((a) => monitoredAt(a, m)).map((a) => a.scores[m]).filter((s) => s >= lo && s < hi);
      return Math.round(mean(scores) ?? 0);
    });
  }

  private build(f: PaFilters): PredictiveView {
    const { current, previous } = periodOffsets(f.period || PA_DEFAULT_PERIOD);
    const list = this.scoped(f);
    const labels = current.map((m) => monthLabel(monthCategory(m)));
    const prevEnd = previous[previous.length - 1];
    const predictions = list.map((a) => toAsset(a, PA_DEMO.indexOf(a))).sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));

    // KPIs now against the end of the previous period
    const monitored = list.length;
    const monitoredBefore = list.filter((a) => monitoredAt(a, prevEnd)).length;
    const highRisk = predictions.filter((p) => (p.riskScore ?? 0) >= HIGH_RISK_SCORE).length;
    const highRiskBefore = list.filter((a) => monitoredAt(a, prevEnd) && a.scores[prevEnd] >= HIGH_RISK_SCORE).length;
    const failures = predictions.filter((p) => p.failureWindowDays !== null && p.failureWindowDays <= FAILURE_WINDOW_DAYS)
      .sort((a, b) => (a.failureWindowDays ?? 0) - (b.failureWindowDays ?? 0));
    const failuresBefore = list.filter((a) => monitoredAt(a, prevEnd) && rulHours(a.scores[prevEnd]) <= FAILURE_WINDOW_DAYS * 24).length;
    const acc = accuracyOf(list, current);
    const accBefore = accuracyOf(list, previous);

    // Accuracy breakdown: precision and recall sit either side of the match rate
    const accuracy = acc.accuracy;
    const precision = accuracy === null ? null : round1(Math.min(99, accuracy - 2.6));
    const recall = accuracy === null ? null : round1(Math.min(99, accuracy + 1.4));
    const falsePositiveRate = precision === null ? null : round1((100 - precision) * 0.62);

    // Remaining useful life at each month end
    const rulAt = (m: number, lo: number, hi: number) => {
      const hours = list.filter((a) => monitoredAt(a, m) && a.scores[m] >= lo && a.scores[m] < hi).map((a) => rulHours(a.scores[m]));
      return Math.round(mean(hours) ?? 0);
    };
    const highRul = current.map((m) => rulAt(m, HIGH_RISK_SCORE, 101));
    const spread = 1 - (mean(list.filter((a) => a.scores[0] >= HIGH_RISK_SCORE).map((a) => a.confidence)) ?? 85) / 100;

    // Cost and avoided downtime
    const monthSum = (pick: (a: PaDemoAsset, m: number) => number) => current.map((m) => sum(list.map((a) => pick(a, m))));
    const preventedByMonth = monthSum((a, m) => a.prevented[m]);
    const avoidedByMonth = preventedByMonth.map((p) => p * PA_AVG_CORRECTIVE_COST);
    const prevented = sum(preventedByMonth);

    const actionList = predictions.filter((p) => p.risk === 'Critical' || p.risk === 'High');
    const vibration = predictions.filter((p) => p.vibrationAnomaly && (p.riskScore ?? 0) >= 35);
    const review = predictions.filter((p) => p.confidence === null || p.confidence < REVIEW_CONFIDENCE)
      .filter((p) => (p.riskScore ?? 0) >= 35);
    const avoided = sum(avoidedByMonth);

    const models: ModelRow[] = PA_ASSET_TYPES.map((type) => {
      const mine = list.filter((a) => a.type === type);
      const a = accuracyOf(mine, current);
      return {
        type,
        monitored: mine.length,
        accuracy: a.accuracy,
        precision: a.accuracy === null ? null : round1(Math.min(99, a.accuracy - 2.4)),
        recall: a.accuracy === null ? null : round1(Math.min(99, a.accuracy + 1.2)),
        evaluated: a.evaluated,
        status: type === 'IT & Electronics' ? 'Inactive' : 'Online',
        models: PA_MODELS[type] ?? []
      };
    }).filter((m) => m.monitored > 0);

    const aed = (v: number) => `AED ${Math.round(v).toLocaleString('en-US')}`;
    const insights: PaInsight[] = [
      {
        key: 'predicted_failures',
        severity: failures.length ? 'critical' : 'success',
        title: `${failures.length} predicted failures within ${FAILURE_WINDOW_DAYS} days`,
        message: failures.length
          ? `${failures[0].name} at ${failures[0].location} is expected to fail within ${failures[0].failureWindowDays} days (${failures[0].issue ?? 'degradation'}).`
          : 'No monitored asset is expected to fail in the next 30 days.',
        count: failures.length,
        amount: null,
        assetKeys: failures.map((p) => p.key)
      },
      {
        key: 'abnormal_vibration',
        severity: vibration.length ? 'warning' : 'success',
        title: `${vibration.length} assets show abnormal vibration patterns`,
        message: vibration.length
          ? `Vibration anomalies in the last 7 days, mostly on ${[...new Set(vibration.map((p) => p.type))].slice(0, 2).join(' and ')}.`
          : 'No vibration anomalies in the last 7 days.',
        count: vibration.length,
        amount: null,
        assetKeys: vibration.map((p) => p.key)
      },
      {
        key: 'downtime_cost_avoided',
        severity: 'success',
        title: `${aed(avoided)} potential downtime cost avoided`,
        message: `${prevented} predicted failures were prevented by planned maintenance in the period, at an average corrective cost of ${aed(PA_AVG_CORRECTIVE_COST)}.`,
        count: prevented,
        amount: avoided,
        assetKeys: []
      },
      {
        key: 'engineer_review',
        severity: review.length ? 'warning' : 'success',
        title: `${review.length} predictions require engineer review`,
        message: review.length
          ? `Model confidence is below ${REVIEW_CONFIDENCE}% on these predictions; confirm them before raising work orders.`
          : `Every prediction has at least ${REVIEW_CONFIDENCE}% model confidence.`,
        count: review.length,
        amount: null,
        assetKeys: review.map((p) => p.key)
      }
    ];

    return {
      generatedAt: new Date().toISOString(),
      previousFromUtc: iso(monthStart(previous[0])),
      previousToUtc: iso(monthStart(prevEnd - 1)),
      accuracyTarget: ACCURACY_TARGET,
      reviewConfidence: REVIEW_CONFIDENCE,
      highRiskScore: HIGH_RISK_SCORE,
      failureWindowDays: FAILURE_WINDOW_DAYS,
      monitoredKpi: { value: monitored, change: change(monitored, monitoredBefore) },
      highRiskKpi: { value: highRisk, change: change(highRisk, highRiskBefore) },
      failuresKpi: { value: failures.length, change: change(failures.length, failuresBefore) },
      accuracyKpi: { value: accuracy, change: accuracy !== null && accBefore.accuracy !== null ? round1(accuracy - accBefore.accuracy) : 0 },
      accuracy,
      precision,
      recall,
      falsePositiveRate,
      evaluated: acc.evaluated,
      labels,
      riskTrend: [
        { name: 'High Risk', values: this.bandTrend(list, current, HIGH_RISK_SCORE, 101), color: BAND_COLORS['High Risk'] },
        { name: 'Medium Risk', values: this.bandTrend(list, current, 35, HIGH_RISK_SCORE), color: BAND_COLORS['Medium Risk'] },
        { name: 'Low Risk', values: this.bandTrend(list, current, 0, 35), color: BAND_COLORS['Low Risk'] },
        { name: 'High Risk Threshold', values: labels.map(() => HIGH_RISK_SCORE), color: RA_COLORS.grey, dashed: true }
      ],
      rulForecast: [
        { name: 'High Risk Assets', values: highRul, color: RA_COLORS.purple, area: true },
        { name: 'Medium Risk Assets', values: current.map((m) => rulAt(m, 35, HIGH_RISK_SCORE)), color: RA_COLORS.blue },
        { name: 'All Monitored', values: current.map((m) => rulAt(m, 0, 101)), color: RA_COLORS.green },
        { name: 'Confidence band (upper)', values: highRul.map((h) => Math.round(h * (1 + spread))), color: RA_COLORS.lavender, dashed: true },
        { name: 'Confidence band (lower)', values: highRul.map((h) => Math.round(h * (1 - spread))), color: RA_COLORS.lavender, dashed: true }
      ],
      riskSlices: RISK_LEVELS.map((r) => ({ name: r, value: predictions.filter((p) => p.risk === r).length, color: RISK_COLORS[r] })).filter((s) => s.value > 0),
      anomalies: ANOMALY_SIGNALS.map((signal, i) => ({
        name: signal,
        values: current.map((m) => sum(list.map((a) => a.anomalies[m][signal] ?? 0))),
        color: ANOMALY_COLORS[i % ANOMALY_COLORS.length]
      })),
      costForecast: [
        { name: 'Preventive', values: monthSum((a, m) => a.preventiveCost[m]), color: RA_COLORS.violet },
        { name: 'Corrective', values: monthSum((a, m) => a.correctiveCost[m]), color: RA_COLORS.blue },
        { name: 'Avoided Cost', values: avoidedByMonth, color: RA_COLORS.green }
      ],
      avoided,
      avoidedByMonth,
      preventedFailures: prevented,
      predictions,
      predictionTotal: predictions.length,
      actionList,
      failures,
      vibration,
      review,
      models,
      insights
    };
  }

  /** Compare Periods: the previous period's High Risk line. */
  loadPreviousRisk(f: PaFilters, _range?: { from: string; to: string }): Observable<number[]> {
    const { previous } = periodOffsets(f.period || PA_DEFAULT_PERIOD);
    return of(this.bandTrend(this.scoped(f), previous, HIGH_RISK_SCORE, 101));
  }

  /** Every row of a list: high-risk, failures, vibration or review. */
  loadList(f: PaFilters, list: string): Observable<{ items: PaAsset[]; total: number }> {
    const v = this.build(f);
    const items = list === 'failures' ? v.failures : list === 'vibration' ? v.vibration : list === 'review' ? v.review
      : list === 'high-risk' ? v.actionList : v.predictions;
    return of({ items, total: items.length });
  }

  /** Every prediction for the filter bar, as a CSV download. */
  export(f: PaFilters, _format: 'xlsx' | 'csv' = 'csv'): Observable<void> {
    const v = this.build(f);
    const opt = (n: number | null) => (n === null ? '' : n);
    downloadCsv('predictive-analytics.csv',
      ['Asset ID', 'Asset Name', 'Location', 'Category', 'Asset Type', 'Risk Level', 'Risk Score', 'Health', 'Confidence %', 'Failure Window',
        'Predicted Failure Date', 'Remaining Life (hrs)', 'Predicted Issue', 'Recommended Action', 'Model', 'Sensor', 'Owner', 'Alert Status'],
      v.predictions.map((a) => [
        a.id, a.name, a.location, a.category, a.type, a.risk, opt(a.riskScore), opt(a.health), opt(a.confidence), failureWindow(a),
        a.predictedFailureDate ?? '', opt(a.rulHours), a.issue ?? '', a.action, a.model ?? '', a.sensor ?? '', a.owner, a.alertStatus
      ]));
    return of(undefined);
  }

  // ----- Saved views (kept in memory for the session) -----

  /** The built-in All Predictions view, then the user's own. */
  loadViews(): Observable<PaSavedView[]> {
    const list = [this.allPredictionsView(), ...this.savedViews];
    this.views.set(list);
    return of(list);
  }

  createView(name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const saved: PaSavedView = { viewId: `view-${Date.now()}-${this.nextViewId++}`, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = [...this.savedViews, saved];
    this.views.update((list) => [...list, saved]);
    return of(saved);
  }

  updateView(viewId: string, name: string, f: PaFilters, isDefault = false): Observable<PaSavedView> {
    const saved: PaSavedView = { viewId, name: name.trim(), builtIn: false, isDefault, filters: this.toFilters(f) };
    this.savedViews = this.savedViews.map((v) => (v.viewId === viewId ? saved : v));
    this.views.update((list) => list.map((v) => (v.viewId === viewId ? saved : v)));
    return of(saved);
  }

  deleteView(viewId: string): Observable<void> {
    this.savedViews = this.savedViews.filter((v) => v.viewId !== viewId);
    this.views.update((list) => list.filter((v) => v.viewId !== viewId));
    return of(undefined);
  }

  allPredictionsView(): PaSavedView {
    return {
      viewId: 'all-predictions', name: ALL_PREDICTIONS_VIEW, builtIn: true, isDefault: false,
      filters: {
        period: PA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, category: ALL_CATEGORIES, assetType: ALL_TYPES,
        riskLevel: ALL_RISK_LEVELS
      }
    };
  }

  private toFilters(f: PaFilters): Record<string, string> {
    return {
      period: f.period && this.periods().includes(f.period) ? f.period : PA_DEFAULT_PERIOD,
      organization: f.organization || ALL_ORGANIZATIONS,
      location: f.location || ALL_LOCATIONS,
      category: f.category || ALL_CATEGORIES,
      assetType: f.assetType || ALL_TYPES,
      riskLevel: f.riskLevel || ALL_RISK_LEVELS
    };
  }
}
