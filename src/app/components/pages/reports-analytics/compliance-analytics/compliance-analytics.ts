import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Award, Bookmark, ClipboardCheck, FileSearch, GitCompareArrows, LucideAngularModule, LucideIconData, RefreshCw, ShieldCheck,
  TriangleAlert, Upload
} from 'lucide-angular';
import { AnalyticsPage, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaKpiCard, RaListDialog, RaSaveViewDialog, RaWidget
} from '../inspection-analytics/kit';
import {
  AREA_OPTIONS, CAPA_TARGET, COMPLIANCE_AREAS, CapaAction, ComplianceFinding, ComplianceView, EXPIRY_LABELS, EXPIRY_TYPES,
  ExpiringItem, LocationRow, REGULATION_OPTIONS, RISK_LEVELS, RiskLevel, SCORE_TARGET, buildComplianceView
} from './compliance-analytics.data';
import { ComplianceFindingsTable, ComplianceLocationTable } from './compliance-tables';

interface KpiTile {
  key: 'score' | 'findings' | 'expiring' | 'capa' | 'risks';
  label: string;
  value: string;
  delta: string;
  up: boolean;
  good: boolean;
  icon: LucideIconData;
  tone: string;
}

type InsightAction = 'capa' | 'register' | 'critical' | 'environmental' | 'plan';

interface Insight {
  tone: string;
  icon: LucideIconData;
  title: string;
  text: string;
  primary: { label: string; action: InsightAction };
  secondary: { label: string; action: InsightAction };
}

interface ListSpec {
  title: string;
  subtitle: string;
  header: string[];
  rows: (string | number)[][];
  fileName: string;
}

interface DetailSpec {
  title: string;
  subtitle: string;
  fields: DetailField[];
  finding: ComplianceFinding | null;
}

const LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];
const LEVEL_COLORS: Record<RiskLevel, string> = { Critical: RA_COLORS.red, High: RA_COLORS.pink, Medium: RA_COLORS.orange, Low: RA_COLORS.blue };
const EXPIRY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange];
const FINDING_HEADER = ['Finding ID', 'Requirement', 'Regulation', 'Area', 'Asset ID', 'Asset', 'Location', 'Severity', 'Due Date', 'Owner', 'Status'];
const CAPA_HEADER = ['CAPA ID', 'Action', 'Finding ID', 'Location', 'Owner', 'Due Date', 'Days Overdue'];
const EXPIRY_HEADER = ['ID', 'Item', 'Type', 'Regulation', 'Location', 'Expires', 'Days Left'];

/** Reports & Analytics > Compliance Analytics */
@Component({
  selector: 'app-ra-compliance-analytics',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaWidget, RaKpiCard, RaListDialog,
    RaDetailDialog, RaActionPlanDialog, RaSaveViewDialog, ComplianceFindingsTable, ComplianceLocationTable
  ],
  templateUrl: './compliance-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './compliance-analytics.css']
})
export class ComplianceAnalyticsPage extends AnalyticsPage {
  readonly icons = { Bookmark, GitCompareArrows, RefreshCw, Upload };
  readonly areas = AREA_OPTIONS;
  readonly regulations = REGULATION_OPTIONS;
  readonly riskLevels = RISK_LEVELS;
  readonly areaLabels = COMPLIANCE_AREAS;
  readonly expiryLabels = EXPIRY_LABELS;
  readonly capaTarget = CAPA_TARGET;
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  area = AREA_OPTIONS[0];
  regulation = REGULATION_OPTIONS[0];
  risk = RISK_LEVELS[0];
  compare = false;

  view!: ComplianceView;
  kpis: KpiTile[] = [];
  insights: Insight[] = [];
  scoreSeries: ChartSeries[] = [];
  severitySeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  areaSeries: ChartSeries[] = [];
  capaSeries: ChartSeries[] = [];
  expirySeries: ChartSeries[] = [];

  list: ListSpec | null = null;
  detail: DetailSpec | null = null;
  plan: { context: string; title: string; owner: string } | null = null;
  saveOpen = false;

  constructor() {
    super();
    this.updatedMinutes = 8;
    this.apply();
  }

  /** Recomputes every widget from the filters. */
  apply(): void {
    const v = buildComplianceView({
      period: this.period,
      organization: this.organization,
      location: this.location,
      area: this.area,
      regulation: this.regulation,
      risk: this.risk
    });
    this.view = v;
    this.kpis = [
      { key: 'score', label: 'Overall Compliance Score', value: percent(v.score), delta: '+2.4%', up: true, good: true, icon: ShieldCheck, tone: 'green' },
      { key: 'findings', label: 'Open Audit Findings', value: String(v.findings.length), delta: '-18%', up: false, good: true, icon: FileSearch, tone: 'pink' },
      { key: 'expiring', label: 'Expiring Certifications', value: String(v.expiringSoon.length), delta: '+6%', up: true, good: false, icon: Award, tone: 'blue' },
      { key: 'capa', label: 'Overdue CAPA Actions', value: String(v.capaOverdue.length), delta: '-25%', up: false, good: true, icon: ClipboardCheck, tone: 'orange' },
      { key: 'risks', label: 'Active Compliance Risks', value: String(v.risks.length), delta: '-12%', up: false, good: true, icon: TriangleAlert, tone: 'red' }
    ];
    this.buildScoreSeries();
    this.severitySeries = LEVELS.map((l) => ({ name: l, values: v.raised[l], color: LEVEL_COLORS[l] }));
    this.statusSlices = [
      { name: 'Compliant', value: v.status.compliant, color: RA_COLORS.green },
      { name: 'Partially Compliant', value: v.status.partial, color: RA_COLORS.orange },
      { name: 'Non-Compliant', value: v.status.nonCompliant, color: RA_COLORS.red },
      { name: 'Not Assessed', value: v.status.notAssessed, color: RA_COLORS.grey }
    ];
    this.areaSeries = [{ name: 'Open findings', values: COMPLIANCE_AREAS.map((a) => v.findings.filter((f) => f.area === a).length), color: RA_COLORS.purple }];
    this.capaSeries = [
      { name: 'Closure rate', values: v.capaSeries, color: RA_COLORS.purple },
      { name: 'Target', values: v.capaSeries.map(() => CAPA_TARGET), color: RA_COLORS.grey, dashed: true }
    ];
    this.expirySeries = EXPIRY_TYPES.map((t, k) => ({
      name: t,
      values: EXPIRY_LABELS.map((_, m) => v.expiring.filter((e) => e.type === t && e.monthIndex === m).length),
      color: EXPIRY_COLORS[k]
    }));
    this.buildInsights();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.buildScoreSeries();
    this.notify(this.compare ? 'Comparing the overall score with the same months of 2025.' : 'Period comparison turned off.');
  }

  private buildScoreSeries(): void {
    const s = this.view.scoreSeries;
    this.scoreSeries = [
      { name: 'Overall', values: s.overall, color: RA_COLORS.purple },
      { name: 'Regulatory', values: s.regulatory, color: RA_COLORS.blue },
      { name: 'Safety', values: s.safety, color: RA_COLORS.green },
      { name: 'Environmental', values: s.environmental, color: RA_COLORS.orange }
    ];
    if (this.compare) this.scoreSeries.push({ name: 'Overall (2025)', values: s.previous, color: RA_COLORS.grey, dashed: true });
  }

  private buildInsights(): void {
    const v = this.view;
    const critical = v.findings.filter((f) => f.severity === 'Critical').length;
    const soonSites = new Set(v.expiringSoon.map((e) => e.site)).size;
    const envBelow = v.environmental.filter((e) => e.score < SCORE_TARGET);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    this.insights = [
      {
        tone: 'red', icon: TriangleAlert,
        title: `${plural(v.capaOverdue.length, 'CAPA action')} overdue`,
        text: `${plural(v.capaOverdue.length, 'corrective action')} ${v.capaOverdue.length === 1 ? 'is' : 'are'} past due and need attention to maintain compliance.`,
        primary: { label: 'View actions', action: 'capa' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        tone: 'orange', icon: Award,
        title: `${v.expiringSoon.length} permits or certifications expire within 90 days`,
        text: `${v.expiringSoon.length} permits or certifications will expire in the next 90 days across ${plural(soonSites, 'location')}.`,
        primary: { label: 'Open register', action: 'register' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        tone: 'red', icon: FileSearch,
        title: `${plural(critical, 'critical finding')} require${critical === 1 ? 's' : ''} management review`,
        text: 'Critical audit findings are open and need management review and approval of corrective actions.',
        primary: { label: 'View actions', action: 'critical' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      envBelow.length
        ? {
            tone: 'orange', icon: ShieldCheck,
            title: `Environmental compliance below target in ${plural(envBelow.length, 'location')}`,
            text: `Environmental compliance is below the ${SCORE_TARGET}% target at ${envBelow.map((e) => e.site).join(' and ')}.`,
            primary: { label: 'View details', action: 'environmental' }, secondary: { label: 'Create action plan', action: 'plan' }
          }
        : {
            tone: 'green', icon: ShieldCheck,
            title: 'Environmental compliance on target',
            text: `Every location in scope meets the ${SCORE_TARGET}% environmental compliance target.`,
            primary: { label: 'View details', action: 'environmental' }, secondary: { label: 'Create action plan', action: 'plan' }
          }
    ];
  }

  get statusTotal(): string {
    const s = this.view.status;
    return (s.compliant + s.partial + s.nonCompliant + s.notAssessed).toLocaleString('en-US');
  }

  get capaTotal(): number {
    return this.view.capaClosed + this.view.capaOpen.length;
  }

  get capaDisplay(): string {
    return percent(this.view.capaRate);
  }

  // ===== Header actions =====

  exportAll(): void {
    downloadCsv('compliance-analytics-open-findings.csv', FINDING_HEADER, this.findingRows(this.view.findings));
    this.notify(`Exported ${this.view.findings.length} open compliance findings.`);
  }

  saveNamedView(name: string): void {
    this.saveOpen = false;
    this.saveView(name);
  }

  // ===== KPI cards =====

  kpiAction(kpi: KpiTile, action: string): void {
    if (action === 'Export CSV') {
      downloadCsv(`compliance-${kpi.key}.csv`, ['KPI', 'Value', 'Change vs previous period', 'Period', 'Location'], [[kpi.label, kpi.value, kpi.delta, this.period, this.location]]);
      return;
    }
    const v = this.view;
    let fields: DetailField[];
    switch (kpi.key) {
      case 'score':
        fields = [
          { label: 'Target', value: `${SCORE_TARGET}%` },
          { label: 'Assets compliant', value: `${v.status.compliant.toLocaleString('en-US')} of ${this.statusTotal}` }
        ];
        break;
      case 'findings':
        fields = LEVELS.map((l) => ({ label: l, value: String(v.findings.filter((f) => f.severity === l).length) }));
        break;
      case 'expiring':
        fields = EXPIRY_TYPES.map((t) => ({ label: t, value: String(v.expiringSoon.filter((e) => e.type === t).length) }));
        break;
      case 'capa':
        fields = [
          { label: 'Open CAPA', value: String(v.capaOpen.length) },
          { label: 'Closed CAPA', value: String(v.capaClosed) },
          { label: 'Closure rate', value: this.capaDisplay }
        ];
        break;
      default:
        fields = LEVELS.map((l) => ({ label: l, value: String(v.risks.filter((r) => r.level === l).length) }));
    }
    fields.push({ label: 'Change vs previous period', value: kpi.delta }, { label: 'Period', value: this.period }, { label: 'Location', value: this.location });
    this.detail = { title: kpi.label, subtitle: kpi.value, fields, finding: null };
  }

  // ===== Widget exports =====

  private monthRows(labels: string[], ...cols: number[][]): (string | number)[][] {
    return labels.map((l, i) => [l.replace('\n', ' '), ...cols.map((c) => c[i])]);
  }

  exportScore(): void {
    const s = this.view.scoreSeries;
    downloadCsv('compliance-score-trend.csv', ['Month', 'Overall %', 'Regulatory %', 'Safety %', 'Environmental %', 'Overall 2025 %'],
      this.monthRows(this.view.labels, s.overall, s.regulatory, s.safety, s.environmental, s.previous));
  }

  exportSeverity(): void {
    const r = this.view.raised;
    downloadCsv('audit-findings-by-severity.csv', ['Month', ...LEVELS], this.monthRows(this.view.labels, r.Critical, r.High, r.Medium, r.Low));
  }

  exportStatus(): void {
    downloadCsv('compliance-status.csv', ['Status', 'Assets'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportAreas(): void {
    downloadCsv('findings-by-compliance-area.csv', ['Area', 'Open findings'], COMPLIANCE_AREAS.map((a, i) => [a, this.areaSeries[0].values[i]]));
  }

  exportCapa(): void {
    downloadCsv('capa-closure-rate.csv', ['Month', 'Closure rate %', 'Target %'], this.monthRows(this.view.labels, this.view.capaSeries, this.view.capaSeries.map(() => CAPA_TARGET)));
  }

  exportExpiry(): void {
    downloadCsv('permit-certification-expiry.csv', EXPIRY_HEADER, this.expiryRows(this.view.expiring));
  }

  exportFindings(): void {
    downloadCsv('open-compliance-findings.csv', FINDING_HEADER, this.findingRows(this.view.findings));
  }

  exportLocations(): void {
    downloadCsv('regulatory-compliance-by-location.csv', ['Location', 'Score %', 'Open Findings', 'Expiring Items (90 days)', 'Risk', 'Status'],
      this.view.locations.map((r) => [r.site, r.score, r.openFindings, r.expiring, r.risk, r.status]));
  }

  // ===== Tables =====

  openFinding(row: ComplianceFinding): void {
    const capa = this.view.capaOpen.find((c) => c.finding.id === row.id);
    this.detail = {
      title: row.id,
      subtitle: `${row.requirement} · ${row.site}`,
      finding: row,
      fields: [
        { label: 'Regulation / standard', value: row.regulation },
        { label: 'Compliance area', value: row.area },
        { label: 'Asset', value: `${row.asset} (${row.assetId})` },
        { label: 'Location', value: row.site },
        { label: 'Severity', value: row.severity },
        { label: 'Status', value: row.status },
        { label: 'Due date', value: row.dueInDays < 0 ? `${row.due} (overdue)` : row.due },
        { label: 'Owner', value: row.owner },
        { label: 'Corrective action', value: capa ? `${capa.id} · due ${capa.due}` : 'Not raised yet' }
      ]
    };
  }

  viewAllFindings(): void {
    this.showFindings('Open compliance findings', this.view.findings);
  }

  openLocation(row: LocationRow): void {
    const env = this.view.environmental.find((e) => e.site === row.site);
    this.detail = {
      title: row.site,
      subtitle: 'Regulatory compliance',
      finding: null,
      fields: [
        { label: 'Compliance score', value: `${row.score}%` },
        { label: 'Environmental score', value: env ? `${env.score}%` : '—' },
        { label: 'Open findings', value: String(row.openFindings) },
        { label: 'Critical findings', value: String(row.critical) },
        { label: 'Items expiring within 90 days', value: String(row.expiring) },
        { label: 'Active risks', value: String(this.view.risks.filter((r) => r.site === row.site).length) },
        { label: 'Risk', value: row.risk },
        { label: 'Status', value: row.status }
      ]
    };
  }

  detailAction(): void {
    const f = this.detail?.finding;
    if (!f) return;
    this.detail = null;
    this.plan = { context: `${f.id} · ${f.severity} finding: ${f.requirement} (${f.regulation}, ${f.site}).`, title: `Corrective action for ${f.id}`, owner: f.owner };
  }

  // ===== Insights =====

  insightAction(insight: Insight, action: InsightAction): void {
    const v = this.view;
    switch (action) {
      case 'capa':
        this.list = {
          title: 'Overdue CAPA actions',
          subtitle: `${v.capaOverdue.length} overdue · ${this.location}`,
          header: CAPA_HEADER,
          rows: this.capaRows(v.capaOverdue),
          fileName: 'overdue-capa-actions.csv'
        };
        break;
      case 'register':
        this.list = {
          title: 'Permits & certifications expiring within 90 days',
          subtitle: `${v.expiringSoon.length} items · ${this.location}`,
          header: EXPIRY_HEADER,
          rows: this.expiryRows(v.expiringSoon),
          fileName: 'expiring-certifications.csv'
        };
        break;
      case 'critical':
        this.showFindings('Critical findings for management review', v.findings.filter((f) => f.severity === 'Critical'));
        break;
      case 'environmental':
        this.list = {
          title: 'Environmental compliance by location',
          subtitle: `Target ${SCORE_TARGET}%`,
          header: ['Location', 'Environmental score %', 'Status'],
          rows: v.environmental.map((e) => [e.site, e.score, e.score < SCORE_TARGET ? 'Below target' : 'On target']),
          fileName: 'environmental-compliance-by-location.csv'
        };
        break;
      case 'plan':
        this.plan = { context: insight.title + '.', title: insight.title, owner: '' };
        break;
    }
  }

  private showFindings(title: string, rows: ComplianceFinding[]): void {
    this.list = {
      title,
      subtitle: `${rows.length} finding${rows.length === 1 ? '' : 's'} · ${this.location} · ${this.period}`,
      header: FINDING_HEADER,
      rows: this.findingRows(rows),
      fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    };
  }

  private findingRows(rows: ComplianceFinding[]): (string | number)[][] {
    return rows.map((r) => [r.id, r.requirement, r.regulation, r.area, r.assetId, r.asset, r.site, r.severity, r.due, r.owner, r.status]);
  }

  private capaRows(rows: CapaAction[]): (string | number)[][] {
    return rows.map((c) => [c.id, c.title, c.finding.id, c.finding.site, c.owner, c.due, Math.max(0, -c.dueInDays)]);
  }

  private expiryRows(rows: ExpiringItem[]): (string | number)[][] {
    return rows.map((e) => [e.id, e.name, e.type, e.regulation, e.site, e.expires, e.daysLeft]);
  }

  planSaved(plan: ActionPlan): void {
    this.plan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created for ${plan.owner}, due ${plan.due}.`);
  }
}
