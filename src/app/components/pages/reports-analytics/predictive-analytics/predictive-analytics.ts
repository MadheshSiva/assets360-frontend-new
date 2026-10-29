import { Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, CircleCheck, Database, Download, GitCompareArrows, GripVertical, House, Info, LucideAngularModule,
  RefreshCw, Settings, Sparkles, Target, TriangleAlert
} from 'lucide-angular';
import { downloadCsv, money, percent } from '../shared/analytics-common';
import { CartesianChart, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import { RaAsset } from '../asset-performance/kit/asset-universe';
import { RaInsight, RaInsightCard, RaKpiCard } from '../asset-performance/kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from '../asset-performance/kit/ra-dialogs';
import { RaMenu } from '../asset-performance/kit/ra-menu';
import { ScopedAnalyticsPage, SortDir, sortRows } from '../asset-performance/kit/scoped-page';
import {
  ACCURACY_TARGET, ALL_RISK_LEVELS, ModelRow, PA_DELTAS, PredictiveView, REVIEW_CONFIDENCE, RISK_OPTIONS, buildPredictive, failureWindow,
  recommendedAction
} from './predictive-analytics.data';

type ActionSortKey = 'id' | 'name' | 'location' | 'riskScore' | 'rulHours' | 'owner';
type ModelSortKey = 'type' | 'monitored' | 'accuracy' | 'precision' | 'recall' | 'status';

const RISK_TONES: Record<string, string> = { Critical: 'red', High: 'orange', Medium: 'blue', Low: 'green' };

/** Reports & Analytics > Predictive Analytics: failure risk, remaining useful life, anomalies and model accuracy. */
@Component({
  standalone: true,
  selector: 'app-ra-predictive-analytics',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  templateUrl: './predictive-analytics.html',
  styleUrls: ['../shared/analytics-page.css', '../asset-performance/kit/ra-page.css', './predictive-analytics.css']
})
export class PredictiveAnalyticsPage extends ScopedAnalyticsPage {
  readonly icons = { House, RefreshCw, GitCompareArrows, Download, Bookmark, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown, Sparkles };
  readonly riskOptions = RISK_OPTIONS;
  readonly accuracyTarget = ACCURACY_TARGET;
  readonly colors = RA_COLORS;
  readonly rowMenu = ['View details', 'Create work order'];
  readonly costFormat = (v: number) => `AED ${compactNumber(v)}`;
  readonly hoursFormat = (v: number) => compactNumber(v);
  protected readonly fileStem = 'predictive-analytics';

  riskLevel = ALL_RISK_LEVELS;
  view!: PredictiveView;
  insights: RaInsight[] = [];
  actionSort: ActionSortKey = 'riskScore';
  actionDir: SortDir = -1;
  modelSort: ModelSortKey = 'monitored';
  modelDir: SortDir = -1;

  constructor() {
    super();
    // The model re-scores assets every few hours
    this.updatedMinutes = 120;
    this.recompute();
  }

  override get updatedText(): string {
    if (this.updatedMinutes === 0) return 'AI model updated just now';
    return this.updatedMinutes >= 60 ? `AI model updated ${Math.round(this.updatedMinutes / 60)} hours ago` : `AI model updated ${this.updatedMinutes} min ago`;
  }

  recompute(): void {
    const v = buildPredictive(this.scope, this.period, this.riskLevel, this.compare);
    this.view = v;
    this.kpis = [
      { id: 'monitored', label: 'Assets Monitored', value: v.monitored.length.toLocaleString('en-US'), delta: PA_DELTAS.monitored, icon: Database, tone: 'blue' },
      { id: 'highRisk', label: 'High-Risk Assets', value: String(v.highRisk), delta: PA_DELTAS.highRisk, lowerIsBetter: true, icon: TriangleAlert, tone: 'red' },
      { id: 'failures', label: 'Predicted Failures', value: String(v.failures.length), delta: PA_DELTAS.failures, lowerIsBetter: true, icon: Settings, tone: 'purple' },
      { id: 'accuracy', label: 'Prediction Accuracy', value: percent(v.accuracy), delta: PA_DELTAS.accuracy, icon: Target, tone: 'blue' }
    ];
    this.insights = this.buildInsights(v);
  }

  private buildInsights(v: PredictiveView): RaInsight[] {
    return [
      {
        id: 'failures', tone: v.failures.length ? 'red' : 'green', icon: TriangleAlert, title: `${v.failures.length} predicted failures within 30 days`,
        text: `${v.failures.length} assets have a high probability of failure within the next 30 days based on AI model predictions.`,
        actions: [{ id: 'failures-view', label: 'View predictions' }, { id: 'failures-wo', label: 'Create work order', primary: true }]
      },
      {
        id: 'vibration', tone: 'orange', icon: TriangleAlert, title: `${v.vibration.length} assets show abnormal vibration patterns`,
        text: `${v.vibration.length} assets have unusual vibration patterns detected in the last 7 days that may indicate potential failure.`,
        actions: [{ id: 'vibration-view', label: 'Open asset details' }, { id: 'vibration-wo', label: 'Create work order', primary: true }]
      },
      {
        id: 'avoided', tone: 'green', icon: CircleCheck, title: `${money(v.avoided)} potential downtime cost avoided`,
        text: `AI predictions have enabled preventive maintenance, potentially avoiding ${money(v.avoided)} in downtime costs.`,
        actions: [{ id: 'avoided-view', label: 'View details' }]
      },
      {
        id: 'review', tone: v.review.length ? 'red' : 'green', icon: TriangleAlert, title: `${v.review.length} predictions require engineer review`,
        text: `${v.review.length} model predictions have low confidence (< ${REVIEW_CONFIDENCE}%) or conflicting signals and require engineer review.`,
        actions: [{ id: 'review-view', label: 'View predictions' }, { id: 'review-details', label: 'Open asset details', primary: true }]
      }
    ];
  }

  // ----- Saved views include the risk level -----
  protected override snapshot(): Record<string, string> {
    return { ...super.snapshot(), riskLevel: this.riskLevel };
  }

  protected override restoreFilters(f: Record<string, string>): void {
    super.restoreFilters(f);
    this.riskLevel = f['riskLevel'] ?? ALL_RISK_LEVELS;
  }

  override resetFilters(): void {
    this.riskLevel = ALL_RISK_LEVELS;
    super.resetFilters();
  }

  // ----- Tables -----
  get actionRows(): RaAsset[] {
    const dir = this.actionDir;
    const key = this.actionSort;
    const value = (a: RaAsset): string | number => (key === 'location' ? a.site.name : a[key]);
    return [...this.view.actionList]
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
      })
      .slice(0, 5);
  }

  get modelRows(): ModelRow[] {
    return sortRows(this.view.models, this.modelSort, this.modelDir);
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
    return risk ? RISK_TONES[risk] : 'grey';
  }

  scoreTone(score: number): string {
    return score >= 80 ? 'red' : score >= 60 ? 'orange' : 'green';
  }

  windowText(a: RaAsset): string {
    return failureWindow(a);
  }

  recommendation(a: RaAsset): string {
    return recommendedAction(a);
  }

  rowAction(item: string, a: RaAsset): void {
    if (item === 'Create work order') this.openAction('Work order', `${recommendedAction(a)} – ${a.name}`, `${a.id} · ${a.site.name} · risk score ${a.riskScore}`, a.risk === 'Critical' ? 'Critical' : 'High');
    else this.showAsset(a);
  }

  showAsset(a: RaAsset): void {
    this.openDetail(
      {
        title: a.name,
        subtitle: `${a.id} · ${a.site.name}`,
        fields: [
          { label: 'Risk level', value: a.risk ?? 'Not monitored' },
          { label: 'Risk score', value: `${a.riskScore} / 100` },
          { label: 'Predicted failure window', value: failureWindow(a) },
          { label: 'Remaining useful life', value: `${a.rulHours.toLocaleString('en-US')} hrs` },
          { label: 'Model confidence', value: `${a.confidence}%` },
          { label: 'Vibration anomaly (7 days)', value: a.vibrationAnomaly ? 'Yes' : 'No' },
          { label: 'Recommended action', value: recommendedAction(a) },
          { label: 'Health score', value: a.health },
          { label: 'Category / type', value: `${a.category} · ${a.type}` },
          { label: 'Owner', value: a.owner }
        ],
        primary: 'Create work order'
      },
      { kind: 'Work order', title: `${recommendedAction(a)} – ${a.name}`, context: `${a.id} · ${a.site.name} · risk score ${a.riskScore}`, priority: a.risk === 'Critical' ? 'Critical' : 'High' }
    );
  }

  showModel(m: ModelRow): void {
    this.openDetail({
      title: `${m.type} model`,
      subtitle: `Status: ${m.status}`,
      fields: [
        { label: 'Assets monitored', value: m.monitored },
        { label: 'Accuracy', value: percent(m.accuracy) },
        { label: 'Precision', value: percent(m.precision) },
        { label: 'Recall', value: percent(m.recall) },
        { label: 'Target accuracy', value: `${ACCURACY_TARGET}%` }
      ]
    });
  }

  openActionList(): void {
    this.records = this.predictionRecords('High-risk assets requiring action', 'Critical and high risk, highest risk score first.', this.view.actionList, 'high-risk-assets.csv');
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const v = this.view;
    switch (id) {
      case 'failures-view':
        this.records = this.predictionRecords('Predicted failures within 30 days', 'Soonest predicted failure first.', v.failures, 'predicted-failures.csv');
        break;
      case 'failures-wo':
        this.openAction('Work order', `Prevent ${v.failures.length} predicted failures`, this.names(v.failures), 'Critical');
        break;
      case 'vibration-view':
        this.records = this.predictionRecords('Abnormal vibration patterns (last 7 days)', 'Rotating equipment flagged by the vibration model.', v.vibration, 'vibration-anomalies.csv');
        break;
      case 'vibration-wo':
        this.openAction('Work order', `Vibration inspection – ${v.vibration.length} assets`, this.names(v.vibration), 'High');
        break;
      case 'avoided-view':
        this.records = {
          title: 'Downtime cost avoided',
          subtitle: `Failures prevented by acting on predictions: ${money(v.avoided)} in the period.`,
          columns: [{ key: 'month', label: 'Month' }, { key: 'avoided', label: 'Avoided cost (AED)', num: true }],
          rows: v.labels.map((l, i) => ({ month: l.replace('\n', ' '), avoided: v.avoidedByMonth[i] })),
          file: 'downtime-cost-avoided.csv'
        };
        break;
      case 'review-view':
        this.records = this.predictionRecords('Predictions requiring engineer review', `Model confidence below ${REVIEW_CONFIDENCE}%.`, v.review, 'predictions-for-review.csv');
        break;
      case 'review-details':
        if (v.review.length) this.showAsset(v.review[0]);
        else this.notify('No predictions need review for the current filters.');
        break;
    }
  }

  private names(list: RaAsset[]): string {
    const names = list.slice(0, 4).map((a) => a.name).join(', ');
    return list.length > 4 ? `${names} and ${list.length - 4} more.` : names ? `${names}.` : 'No assets in this view.';
  }

  private predictionRecords(title: string, subtitle: string, list: RaAsset[], file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'risk', label: 'Risk' },
        { key: 'score', label: 'Risk Score', num: true }, { key: 'window', label: 'Failure Window' }, { key: 'rul', label: 'Remaining Life (hrs)', num: true },
        { key: 'confidence', label: 'Confidence %', num: true }, { key: 'action', label: 'Recommended Action' }, { key: 'owner', label: 'Owner' }
      ],
      rows: list.map((a) => ({
        id: a.id, name: a.name, location: a.site.name, risk: a.risk ?? '', score: a.riskScore, window: failureWindow(a), rul: a.rulHours,
        confidence: a.confidence, action: recommendedAction(a), owner: a.owner
      })),
      file
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { monitored: 'pa-distribution', highRisk: 'pa-actions', failures: 'pa-actions', accuracy: 'pa-accuracy' };
    return targets[id] ?? 'pa-risk';
  }

  exportPage(): void {
    const list = [...this.view.monitored].sort((a, b) => b.riskScore - a.riskScore);
    downloadCsv(
      'predictive-analytics.csv',
      ['Asset ID', 'Asset Name', 'Location', 'Category', 'Asset Type', 'Risk Level', 'Risk Score', 'Failure Window', 'Remaining Life (hrs)', 'Confidence %', 'Recommended Action', 'Owner'],
      list.map((a) => [a.id, a.name, a.site.name, a.category, a.type, a.risk ?? '', a.riskScore, failureWindow(a), a.rulHours, a.confidence, recommendedAction(a), a.owner])
    );
    this.notify(`Exported predictions for ${list.length.toLocaleString('en-US')} monitored assets.`);
  }

  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    const series = (file: string, list: { name: string; values: number[] }[]) =>
      downloadCsv(file, ['Month', ...list.map((s) => s.name)], months.map((m, i) => [m, ...list.map((s) => s.values[i])]));
    switch (id) {
      case 'risk':
        series('failure-risk-trend.csv', v.riskTrend);
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
        downloadCsv('prediction-accuracy.csv', ['Metric', 'Value %'], [['Accuracy', v.accuracy], ['Precision', v.precision], ['Recall', v.recall], ['False Positive Rate', v.falsePositiveRate]]);
        break;
      case 'cost':
        series('predicted-maintenance-cost.csv', v.costForecast);
        break;
      case 'actions':
        downloadCsv('high-risk-assets.csv', ['Asset ID', 'Asset Name', 'Location', 'Risk Score', 'Failure Window', 'Remaining Life (hrs)', 'Recommended Action', 'Owner', 'Status'],
          v.actionList.map((a) => [a.id, a.name, a.site.name, a.riskScore, failureWindow(a), a.rulHours, recommendedAction(a), a.owner, a.risk ?? '']));
        break;
      case 'models':
        downloadCsv('model-performance-by-asset-type.csv', ['Asset Type', 'Monitored', 'Accuracy %', 'Precision %', 'Recall %', 'Model Status'],
          this.modelRows.map((m) => [m.type, m.monitored, m.accuracy, m.precision, m.recall, m.status]));
        break;
    }
  }
}
