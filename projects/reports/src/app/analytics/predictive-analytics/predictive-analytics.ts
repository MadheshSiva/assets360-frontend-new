import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, CircleCheck, Database, Download, GitCompareArrows, GripVertical, House, Info, LucideAngularModule,
  RefreshCw, Settings, Sparkles, Target, TriangleAlert
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { downloadCsv, money, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import { ALL_CATEGORIES, ALL_TYPES } from '../asset-performance/kit/asset-universe';
import { alignTo, previousRange } from '../asset-performance/kit/api-utils';
import { RaInsight, RaInsightCard, RaKpiCard } from '../asset-performance/kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from '../asset-performance/kit/ra-dialogs';
import { RaMenu } from '../asset-performance/kit/ra-menu';
import { ScopedAnalyticsPage, SortDir } from '../asset-performance/kit/scoped-page';
import {
  ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_PREDICTIONS_VIEW, ALL_RISK_LEVELS, ModelRow, PA_DEFAULT_PERIOD, PA_FALLBACK_PERIODS, PaAsset, PaInsight,
  PredictiveView, RISK_OPTIONS, failureWindow
} from './predictive-analytics.data';
import { PaFilterLists, PaFilters, PaOptions, PaSavedView, PredictiveAnalyticsService } from './predictive-analytics.service';

type ActionSortKey = 'id' | 'name' | 'location' | 'riskScore' | 'rulHours' | 'owner';
type ModelSortKey = 'type' | 'monitored' | 'accuracy' | 'precision' | 'recall' | 'status';

const RISK_TONES: Record<string, string> = { Critical: 'red', High: 'orange', Medium: 'blue', Low: 'green' };

const dash = (v: number | null | undefined, suffix = ''): string => (v === null || v === undefined ? '—' : `${v.toLocaleString('en-US')}${suffix}`);

/** Sorts a copy of `rows`; rows without a value go last either way. */
function sortNullable<T>(rows: T[], value: (row: T) => string | number | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
  });
}

/** Reports & Analytics > Predictive Analytics: failure risk, remaining useful life, anomalies and model accuracy. */
@Component({
  standalone: true,
  selector: 'app-ra-predictive-analytics',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  providers: [PredictiveAnalyticsService],
  templateUrl: './predictive-analytics.html',
  styleUrls: ['../shared/analytics-page.css', '../asset-performance/kit/ra-page.css', './predictive-analytics.css']
})
export class PredictiveAnalyticsPage extends ScopedAnalyticsPage {
  private readonly api = inject(PredictiveAnalyticsService);
  readonly icons = { House, RefreshCw, GitCompareArrows, Download, Bookmark, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown, Sparkles };
  readonly colors = RA_COLORS;
  readonly rowMenu = ['View details', 'Create work order'];
  readonly costFormat = (v: number) => `AED ${compactNumber(v)}`;
  readonly hoursFormat = (v: number) => compactNumber(v);
  readonly dash = dash;
  protected readonly fileStem = 'predictive-analytics';

  // Filter values come from /options and /filters
  override periods: string[] = PA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override categories: string[] = [ALL_CATEGORIES];
  override assetTypes: string[] = [ALL_TYPES];
  override period = PA_DEFAULT_PERIOD;
  riskOptions: string[] = RISK_OPTIONS;
  riskLevel = ALL_RISK_LEVELS;

  insights: RaInsight[] = [];
  currentView = ALL_PREDICTIONS_VIEW;
  actionSort: ActionSortKey = 'riskScore';
  actionDir: SortDir = -1;
  modelSort: ModelSortKey = 'monitored';
  modelDir: SortDir = -1;
  /** Previous period's High Risk line while Compare Periods is on */
  private previousRisk: number[] | null = null;
  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  constructor() {
    super();
    this.views = [this.api.allPredictionsView()];
    this.init();
  }

  get view(): PredictiveView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get accuracyTarget(): number {
    return this.view.accuracyTarget;
  }

  get reviewConfidence(): number {
    return this.view.reviewConfidence;
  }

  /** No monitored assets for the filters. */
  get empty(): boolean {
    return this.loaded && !this.view.predictionTotal;
  }

  /** Risk trend, plus the previous period's High Risk line when comparing. */
  get riskSeries(): ChartSeries[] {
    const list = this.view.riskTrend;
    if (!this.compare || !this.previousRisk || !list.length) return list;
    const high = list.find((s) => s.name === 'High Risk') ?? list[0];
    return [...list, { name: 'High Risk (previous period)', values: alignTo(this.previousRisk, this.view.labels.length), color: high.color, dashed: true }];
  }

  override get updatedText(): string {
    if (!this.lastUpdated) return 'AI model not loaded yet';
    if (this.updatedMinutes === 0) return 'AI model updated just now';
    return this.updatedMinutes >= 60 ? `AI model updated ${Math.round(this.updatedMinutes / 60)} hours ago` : `AI model updated ${this.updatedMinutes} min ago`;
  }

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<PaOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<PaFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<PaSavedView[]>([this.api.allPredictionsView()]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.riskOptions = options.riskLevels;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.categories = filters.categories;
        this.assetTypes = filters.assetTypes;
      }
      this.views = views;
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) {
        this.currentView = preferred.name;
        this.restoreFilters(preferred.filters);
      }
      if (errors.length) this.notify(errors[0]);
      this.recompute();
    });
  }

  private filters(): PaFilters {
    return {
      period: this.period, organization: this.organization, location: this.location, category: this.category, assetType: this.assetType,
      riskLevel: this.riskLevel
    };
  }

  /** Reloads the page from GET /overview (and the previous period's risk line when comparing). */
  recompute(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    const f = this.filters();
    this.loadSub = this.api.loadOverview(f).pipe(
      switchMap((v) => {
        if (!this.compare || !v.previousFromUtc || !v.previousToUtc) return of({ v, previous: null });
        return this.api.loadPreviousRisk(f, previousRange(v.previousFromUtc, v.previousToUtc)).pipe(
          map((previous) => ({ v, previous: previous as number[] | null })),
          catchError((err: Error) => {
            this.notify(err.message);
            return of({ v, previous: null });
          })
        );
      })
    ).subscribe({
      next: ({ v, previous }) => {
        this.previousRisk = previous;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.recompute('Predictions refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  private build(v: PredictiveView): void {
    this.kpis = [
      { id: 'monitored', label: 'Assets Monitored', value: dash(v.monitoredKpi.value), delta: v.monitoredKpi.change, icon: Database, tone: 'blue' },
      { id: 'highRisk', label: 'High-Risk Assets', value: dash(v.highRiskKpi.value), delta: v.highRiskKpi.change, lowerIsBetter: true, icon: TriangleAlert, tone: 'red' },
      { id: 'failures', label: 'Predicted Failures', value: dash(v.failuresKpi.value), delta: v.failuresKpi.change, lowerIsBetter: true, icon: Settings, tone: 'purple' },
      { id: 'accuracy', label: 'Prediction Accuracy', value: v.accuracyKpi.value === null ? '—' : percent(v.accuracyKpi.value), delta: v.accuracyKpi.change, icon: Target, tone: 'blue' }
    ];
    this.insights = this.buildInsights(v);
  }

  private insight(key: string): PaInsight | undefined {
    return this.view.insights.find((i) => i.key === key);
  }

  /** Card text comes from the API (GET /insights); the buttons stay the page's own. */
  private buildInsights(v: PredictiveView): RaInsight[] {
    const failures = this.insight('predicted_failures');
    const vibration = this.insight('abnormal_vibration');
    const avoided = this.insight('downtime_cost_avoided');
    const review = this.insight('engineer_review');
    const count = (i: PaInsight | undefined) => i?.count ?? 0;
    return [
      {
        id: 'failures', tone: count(failures) ? 'red' : 'green', icon: TriangleAlert,
        title: failures?.title ?? `${v.failures.length} predicted failures within ${v.failureWindowDays} days`, text: failures?.message ?? '',
        actions: [{ id: 'failures-view', label: 'View predictions' }, { id: 'failures-wo', label: 'Create work order', primary: true }]
      },
      {
        id: 'vibration', tone: count(vibration) ? 'orange' : 'green', icon: TriangleAlert,
        title: vibration?.title ?? `${v.vibration.length} assets show abnormal vibration patterns`, text: vibration?.message ?? '',
        actions: [{ id: 'vibration-view', label: 'Open asset details' }, { id: 'vibration-wo', label: 'Create work order', primary: true }]
      },
      {
        id: 'avoided', tone: 'green', icon: CircleCheck, title: `${money(v.avoided)} potential downtime cost avoided`, text: avoided?.message ?? '',
        actions: [{ id: 'avoided-view', label: 'View details' }]
      },
      {
        id: 'review', tone: count(review) ? 'red' : 'green', icon: TriangleAlert,
        title: review?.title ?? `${v.review.length} predictions require engineer review`, text: review?.message ?? '',
        actions: [{ id: 'review-view', label: 'View predictions' }, { id: 'review-details', label: 'Open asset details', primary: true }]
      }
    ];
  }

  // ----- Filters and saved views (GET/POST /views; the view includes the risk level) -----
  protected override snapshot(): Record<string, string> {
    return { ...super.snapshot(), riskLevel: this.riskLevel };
  }

  protected override restoreFilters(f: Record<string, string>): void {
    const period = f['period'];
    this.period = period && this.periods.includes(period) ? period : PA_DEFAULT_PERIOD;
    this.organization = this.keep('organizations', f['organization'] ?? ALL_ORGANIZATIONS);
    this.location = this.keep('locations', f['location'] ?? ALL_LOCATIONS);
    this.category = this.keep('categories', f['category'] ?? ALL_CATEGORIES);
    this.assetType = this.keep('assetTypes', f['assetType'] ?? ALL_TYPES);
    this.riskLevel = this.keep('riskOptions', f['riskLevel'] ?? ALL_RISK_LEVELS);
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private keep(list: 'organizations' | 'locations' | 'categories' | 'assetTypes' | 'riskOptions', value: string): string {
    if (!this[list].includes(value)) this[list] = [...this[list], value];
    return value;
  }

  override resetFilters(): void {
    this.currentView = ALL_PREDICTIONS_VIEW;
    this.restoreFilters({});
    this.recompute();
  }

  override applyView(name: string): void {
    const view = this.views.find((v) => v.name === name);
    this.restoreFilters(view ? view.filters : {});
    this.recompute();
  }

  override confirmSaveView(name: string): void {
    this.savingView = false;
    this.api.createView(name, this.filters()).subscribe({
      next: (saved) => {
        this.views = this.api.views();
        this.currentView = saved.name;
        this.notify(`View “${saved.name}” saved with the current filters.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ----- Tables (sorted in the browser: the overview returns every monitored asset) -----
  get actionRows(): PaAsset[] {
    const key = this.actionSort;
    return sortNullable(this.view.actionList, (a) => a[key], this.actionDir).slice(0, 5);
  }

  get modelRows(): ModelRow[] {
    const key = this.modelSort;
    return sortNullable(this.view.models, (m) => m[key], this.modelDir);
  }

  sortActions(key: ActionSortKey): void {
    this.actionDir = this.actionSort === key ? (this.actionDir === 1 ? -1 : 1) : key === 'riskScore' ? -1 : 1;
    this.actionSort = key;
  }

  sortModels(key: ModelSortKey): void {
    this.modelDir = this.modelSort === key ? (this.modelDir === 1 ? -1 : 1) : key === 'type' || key === 'status' ? 1 : -1;
    this.modelSort = key;
  }

  actionIcon(key: ActionSortKey) {
    return this.actionSort !== key ? this.icons.ArrowUpDown : this.actionDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  modelIcon(key: ModelSortKey) {
    return this.modelSort !== key ? this.icons.ArrowUpDown : this.modelDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  riskTone(risk: string | null): string {
    return risk ? (RISK_TONES[risk] ?? 'grey') : 'grey';
  }

  /** Red at or above the API's high-risk score, orange within 20 points of it. */
  scoreTone(score: number | null): string {
    const threshold = this.view.highRiskScore;
    return score === null ? 'grey' : score >= threshold ? 'red' : score >= threshold - 20 ? 'orange' : 'green';
  }

  windowText(a: PaAsset): string {
    return failureWindow(a);
  }

  recommendation(a: PaAsset): string {
    return a.action;
  }

  private context(a: PaAsset): string {
    return `${a.id} · ${a.location} · risk score ${dash(a.riskScore)}`;
  }

  rowAction(item: string, a: PaAsset): void {
    if (item === 'Create work order') this.openAction('Work order', `${a.action} – ${a.name}`, this.context(a), a.risk === 'Critical' ? 'Critical' : 'High');
    else this.showAsset(a);
  }

  showAsset(a: PaAsset): void {
    this.openDetail(
      {
        title: a.name,
        subtitle: `${a.id} · ${a.location}`,
        fields: [
          { label: 'Risk level', value: a.risk },
          { label: 'Risk score', value: a.riskScore === null ? '—' : `${a.riskScore} / 100` },
          { label: 'Predicted failure window', value: failureWindow(a) },
          { label: 'Predicted failure date', value: a.predictedFailureDate ?? '—' },
          { label: 'Predicted issue', value: a.issue ?? '—' },
          { label: 'Remaining useful life', value: dash(a.rulHours, ' hrs') },
          { label: 'Model confidence', value: dash(a.confidence, '%') },
          { label: 'Vibration anomaly (7 days)', value: a.vibrationAnomaly ? 'Yes' : 'No' },
          { label: 'Recommended action', value: a.action },
          { label: 'Health score', value: dash(a.health) },
          { label: 'Model / sensor', value: `${a.model ?? '—'} · ${a.sensor ?? '—'}` },
          { label: 'Category / type', value: `${a.category} · ${a.type}` },
          { label: 'Alert status', value: a.alertStatus },
          { label: 'Owner', value: a.owner }
        ],
        primary: 'Create work order'
      },
      { kind: 'Work order', title: `${a.action} – ${a.name}`, context: this.context(a), priority: a.risk === 'Critical' ? 'Critical' : 'High' }
    );
  }

  showModel(m: ModelRow): void {
    this.openDetail({
      title: `${m.type} model`,
      subtitle: `Status: ${m.status}`,
      fields: [
        { label: 'Assets monitored', value: m.monitored },
        { label: 'Models', value: m.models.join(', ') || '—' },
        { label: 'Predictions evaluated', value: m.evaluated },
        { label: 'Accuracy', value: m.accuracy === null ? '—' : percent(m.accuracy) },
        { label: 'Precision', value: m.precision === null ? '—' : percent(m.precision) },
        { label: 'Recall', value: m.recall === null ? '—' : percent(m.recall) },
        { label: 'Target accuracy', value: `${this.accuracyTarget}%` }
      ]
    });
  }

  openActionList(): void {
    this.withList('high-risk', this.view.actionList, (list) =>
      (this.records = this.predictionRecords('High-risk assets requiring action', 'Critical and high risk, highest risk score first.', list, 'high-risk-assets.csv')));
  }

  /** The overview's rows, or GET /predictions?list=… when the overview was capped. */
  private withList(list: string, rows: PaAsset[], show: (rows: PaAsset[]) => void): void {
    if (this.view.predictionTotal <= this.view.predictions.length) {
      show(rows);
      return;
    }
    this.api.loadList(this.filters(), list).subscribe({ next: ({ items }) => show(items), error: (err: Error) => this.notify(err.message) });
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const v = this.view;
    switch (id) {
      case 'failures-view':
        this.withList('failures', v.failures, (list) =>
          (this.records = this.predictionRecords(`Predicted failures within ${v.failureWindowDays} days`, 'Soonest predicted failure first.', list, 'predicted-failures.csv')));
        break;
      case 'failures-wo':
        this.openAction('Work order', `Prevent ${v.failures.length} predicted failures`, this.names(v.failures), 'Critical');
        break;
      case 'vibration-view':
        this.withList('vibration', v.vibration, (list) =>
          (this.records = this.predictionRecords('Abnormal vibration patterns (last 7 days)', 'Assets with vibration anomalies detected in the last 7 days.', list, 'vibration-anomalies.csv')));
        break;
      case 'vibration-wo':
        this.openAction('Work order', `Vibration inspection – ${v.vibration.length} assets`, this.names(v.vibration), 'High');
        break;
      case 'avoided-view':
        this.records = {
          title: 'Downtime cost avoided',
          subtitle: `${v.preventedFailures} predicted failures prevented by maintenance in the period: ${money(v.avoided)}.`,
          columns: [{ key: 'month', label: 'Month' }, { key: 'avoided', label: 'Avoided cost (AED)', num: true }],
          rows: v.labels.map((l, i) => ({ month: l.replace('\n', ' '), avoided: v.avoidedByMonth[i] ?? 0 })),
          file: 'downtime-cost-avoided.csv'
        };
        break;
      case 'review-view':
        this.withList('review', v.review, (list) =>
          (this.records = this.predictionRecords('Predictions requiring engineer review', `Model confidence below ${this.reviewConfidence}% or not recorded.`, list, 'predictions-for-review.csv')));
        break;
      case 'review-details':
        if (v.review.length) this.showAsset(v.review[0]);
        else this.notify('No predictions need review for the current filters.');
        break;
    }
  }

  private names(list: PaAsset[]): string {
    const names = list.slice(0, 4).map((a) => a.name).join(', ');
    return list.length > 4 ? `${names} and ${list.length - 4} more.` : names ? `${names}.` : 'No assets in this view.';
  }

  private predictionRecords(title: string, subtitle: string, list: PaAsset[], file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'risk', label: 'Risk' },
        { key: 'score', label: 'Risk Score', num: true }, { key: 'window', label: 'Failure Window' }, { key: 'rul', label: 'Remaining Life (hrs)', num: true },
        { key: 'confidence', label: 'Confidence %', num: true }, { key: 'action', label: 'Recommended Action' }, { key: 'owner', label: 'Owner' }
      ],
      rows: list.map((a) => ({
        id: a.id, name: a.name, location: a.location, risk: a.risk, score: a.riskScore ?? '—', window: failureWindow(a), rul: a.rulHours ?? '—',
        confidence: a.confidence ?? '—', action: a.action, owner: a.owner
      })),
      file
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { monitored: 'pa-distribution', highRisk: 'pa-actions', failures: 'pa-actions', accuracy: 'pa-accuracy' };
    return targets[id] ?? 'pa-risk';
  }

  /** GET /export: the API's Excel workbook (summary, trends, accuracy, high-risk assets, models, insights and every prediction). */
  exportPage(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Predictive analytics workbook exported.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** One widget's figures as CSV, built in the browser from the data already loaded (the API exports whole pages only). */
  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    const series = (file: string, list: ChartSeries[]) =>
      downloadCsv(file, ['Month', ...list.map((s) => s.name)], months.map((m, i) => [m, ...list.map((s) => s.values[i] ?? 0)]));
    const opt = (n: number | null) => (n === null ? '' : n);
    switch (id) {
      case 'risk':
        series('failure-risk-trend.csv', this.riskSeries);
        break;
      case 'rul':
        series('remaining-useful-life.csv', v.rulForecast);
        break;
      case 'distribution':
        downloadCsv('risk-distribution.csv', ['Risk Level', 'Assets'], v.riskSlices.map((s) => [s.name, s.value]));
        break;
      case 'anomalies':
        series('anomaly-detection-events.csv', v.anomalies);
        break;
      case 'accuracy':
        downloadCsv('prediction-accuracy.csv', ['Metric', 'Value %'],
          [['Accuracy', opt(v.accuracy)], ['Precision', opt(v.precision)], ['Recall', opt(v.recall)], ['False Positive Rate', opt(v.falsePositiveRate)]]);
        break;
      case 'cost':
        series('predicted-maintenance-cost.csv', v.costForecast);
        break;
      case 'actions':
        downloadCsv('high-risk-assets.csv', ['Asset ID', 'Asset Name', 'Location', 'Risk Score', 'Failure Window', 'Remaining Life (hrs)', 'Recommended Action', 'Owner', 'Status'],
          v.actionList.map((a) => [a.id, a.name, a.location, opt(a.riskScore), failureWindow(a), opt(a.rulHours), a.action, a.owner, a.risk]));
        break;
      case 'models':
        downloadCsv('model-performance-by-asset-type.csv', ['Asset Type', 'Monitored', 'Accuracy %', 'Precision %', 'Recall %', 'Model Status'],
          this.modelRows.map((m) => [m.type, m.monitored, opt(m.accuracy), opt(m.precision), opt(m.recall), m.status]));
        break;
    }
  }
}
