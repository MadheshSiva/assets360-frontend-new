import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Award, Bookmark, ClipboardCheck, FileSearch, GitCompareArrows, LucideAngularModule, LucideIconData, RefreshCw, ShieldCheck,
  TriangleAlert, Upload
} from 'lucide-angular';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { AnalyticsPage, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaKpiCard, RaListDialog, RaSaveViewDialog, RaWidget
} from '../inspection-analytics/kit';
import {
  ALL_AREAS, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_REGULATIONS, ALL_RISK_LEVELS, CA_DEFAULT_PERIOD, CA_FALLBACK_PERIODS, COMPLIANCE_AREAS, CaKpiValue,
  CapaAction, ComplianceFinding, ComplianceView, ExpiringItem, LocationRow, RISK_LEVEL_VALUES, RiskLevel
} from './compliance-analytics.data';
import { CaActionPlanRequest, CaFilterLists, CaFilters, CaOptions, CaSavedView, ComplianceAnalyticsService } from './compliance-analytics.service';
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
  key: string;
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

interface PlanSpec {
  context: string;
  title: string;
  owner: string;
  sourceType: CaActionPlanRequest['sourceType'];
  sourceId: string | null;
  location: string | null;
  regulation: string | null;
}

const LEVELS: RiskLevel[] = RISK_LEVEL_VALUES;
const LEVEL_COLORS: Record<RiskLevel, string> = { Critical: RA_COLORS.red, High: RA_COLORS.pink, Medium: RA_COLORS.orange, Low: RA_COLORS.blue };
const EXPIRY_COLORS = [RA_COLORS.purple, RA_COLORS.blue, RA_COLORS.green, RA_COLORS.orange];
const FINDING_HEADER = ['Finding ID', 'Requirement', 'Regulation', 'Area', 'Asset ID', 'Asset', 'Location', 'Severity', 'Due Date', 'Owner', 'Status'];
const CAPA_HEADER = ['CAPA ID', 'Action', 'Finding ID', 'Location', 'Owner', 'Due Date', 'Days Overdue'];
const EXPIRY_HEADER = ['ID', 'Item', 'Type', 'Source', 'Location', 'Expires', 'Days Left'];

/** "+2.4%" / "-1.2 pts" for a KPI change; "—" when there is nothing to compare. */
function deltaText(k: CaKpiValue): string {
  if (k.change === null) return '—';
  const v = Number(k.change.toFixed(1));
  return `${v > 0 ? '+' : ''}${v}${k.unit === 'points' ? ' pts' : '%'}`;
}

/** Reports & Analytics > Compliance Analytics: figures from GET /api/compliance-analytics/overview. */
@Component({
  selector: 'app-ra-compliance-analytics',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaWidget, RaKpiCard, RaListDialog,
    RaDetailDialog, RaActionPlanDialog, RaSaveViewDialog, ComplianceFindingsTable, ComplianceLocationTable
  ],
  providers: [ComplianceAnalyticsService],
  templateUrl: './compliance-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './compliance-analytics.css']
})
export class ComplianceAnalyticsPage extends AnalyticsPage {
  private readonly api = inject(ComplianceAnalyticsService);
  readonly icons = { Bookmark, GitCompareArrows, RefreshCw, Upload };
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  // Filter values come from /options and /filters
  override periods: string[] = CA_FALLBACK_PERIODS;
  override organizations: string[] = [ALL_ORGANIZATIONS];
  override locations: string[] = [ALL_LOCATIONS];
  override period = CA_DEFAULT_PERIOD;
  areas: string[] = [ALL_AREAS, ...COMPLIANCE_AREAS];
  regulations: string[] = [ALL_REGULATIONS];
  riskLevels: string[] = [ALL_RISK_LEVELS, ...RISK_LEVEL_VALUES];

  area = ALL_AREAS;
  regulation = ALL_REGULATIONS;
  risk = ALL_RISK_LEVELS;
  compare = false;

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
  plan: PlanSpec | null = null;
  saveOpen = false;
  /** Message of the last failed load; the page keeps the previous figures */
  loadError: string | null = null;

  private loadSub: Subscription | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  constructor() {
    super();
    this.updatedMinutes = 0;
    this.build(this.view);
    this.init();
  }

  get view(): ComplianceView {
    return this.api.view();
  }

  get loaded(): boolean {
    return this.api.loaded();
  }

  get loading(): boolean {
    return this.api.loading();
  }

  get areaLabels(): string[] {
    return this.view.areas;
  }

  get expiryLabels(): string[] {
    return this.view.expiryLabels;
  }

  get capaTarget(): number {
    return this.view.capaTarget;
  }

  /** Nothing recorded for the filters: no inspections, findings, CAPA, expiring items, risks or assessed assets. */
  get empty(): boolean {
    const v = this.view;
    const s = v.status;
    return this.loaded && v.score === null && !v.findingsTotal && !v.capaOpen.length && !v.capaClosed && !v.expiring.length && !v.risks.length
      && !s.compliant && !s.partial && !s.nonCompliant && !s.notAssessed;
  }

  // ===== Loading =====

  /** Options, filter values and saved views, then the figures (opening the user's default view if there is one). */
  private init(): void {
    const errors: string[] = [];
    const soft = <T>(fallback: T) => catchError<T, Observable<T>>((err: Error) => {
      errors.push(err.message);
      return of(fallback);
    });
    forkJoin({
      options: this.api.loadOptions().pipe(soft<CaOptions | null>(null)),
      filters: this.api.loadFilters().pipe(soft<CaFilterLists | null>(null)),
      views: this.api.loadViews().pipe(soft<CaSavedView[]>([]))
    }).subscribe(({ options, filters, views }) => {
      if (options) {
        this.periods = options.periods;
        this.period = options.defaultPeriod;
        this.areas = options.areas;
        this.riskLevels = options.riskLevels;
      }
      if (filters) {
        this.organizations = filters.organizations;
        this.locations = filters.locations;
        this.regulations = filters.regulations;
      }
      const preferred = views.find((v) => v.isDefault && !v.builtIn);
      if (preferred) this.restore(preferred.filters);
      if (errors.length) this.notify(errors[0]);
      this.apply();
    });
  }

  private filters(): CaFilters {
    return { period: this.period, organization: this.organization, location: this.location, area: this.area, regulation: this.regulation, risk: this.risk };
  }

  /** A saved value no longer offered by /filters stays selectable so the view still opens as saved. */
  private restore(f: CaFilters): void {
    const keep = (list: 'organizations' | 'locations' | 'areas' | 'regulations' | 'riskLevels', value: string) => {
      if (!this[list].includes(value)) this[list] = [...this[list], value];
      return value;
    };
    this.period = this.periods.includes(f.period) ? f.period : CA_DEFAULT_PERIOD;
    this.organization = keep('organizations', f.organization);
    this.location = keep('locations', f.location);
    this.area = keep('areas', f.area);
    this.regulation = keep('regulations', f.regulation);
    this.risk = keep('riskLevels', f.risk);
  }

  /** Reloads every widget from GET /overview for the filters. */
  apply(announce?: string): void {
    this.loadSub?.unsubscribe();
    this.refreshing = true;
    this.loadSub = this.api.loadOverview(this.filters()).subscribe({
      next: (v) => {
        this.loadError = null;
        this.build(v);
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.loadError = err.message;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.apply('Data refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    this.loadSub?.unsubscribe();
    super.ngOnDestroy();
  }

  /** Rebuilds the KPI tiles, charts and insights from the API's figures. */
  private build(v: ComplianceView): void {
    const tile = (key: KpiTile['key'], label: string, value: string, k: CaKpiValue, lowerIsBetter: boolean, icon: LucideIconData, tone: string): KpiTile => {
      const up = (k.change ?? 0) > 0;
      return { key, label, value, delta: deltaText(k), up, good: !k.change ? true : lowerIsBetter ? !up : up, icon, tone };
    };
    const count = (k: CaKpiValue) => (k.value === null ? '—' : String(k.value));
    this.kpis = [
      tile('score', 'Overall Compliance Score', v.score === null ? '—' : percent(v.score), v.kpi.score, false, ShieldCheck, 'green'),
      tile('findings', 'Open Audit Findings', count(v.kpi.findings), v.kpi.findings, true, FileSearch, 'pink'),
      tile('expiring', 'Expiring Certifications', count(v.kpi.expiring), v.kpi.expiring, true, Award, 'blue'),
      tile('capa', 'Overdue CAPA Actions', count(v.kpi.capa), v.kpi.capa, true, ClipboardCheck, 'orange'),
      tile('risks', 'Active Compliance Risks', count(v.kpi.risks), v.kpi.risks, true, TriangleAlert, 'red')
    ];
    this.buildScoreSeries();
    this.severitySeries = LEVELS.map((l) => ({ name: l, values: v.raised[l], color: LEVEL_COLORS[l] }));
    this.statusSlices = [
      { name: 'Compliant', value: v.status.compliant, color: RA_COLORS.green },
      { name: 'Partially Compliant', value: v.status.partial, color: RA_COLORS.orange },
      { name: 'Non-Compliant', value: v.status.nonCompliant, color: RA_COLORS.red },
      { name: 'Not Assessed', value: v.status.notAssessed, color: RA_COLORS.grey }
    ];
    this.areaSeries = [{ name: 'Open findings', values: v.areaCounts, color: RA_COLORS.purple }];
    this.capaSeries = [
      { name: 'Closure rate', values: v.capaSeries, color: RA_COLORS.purple },
      { name: 'Target', values: v.capaSeries.map(() => v.capaTarget), color: RA_COLORS.grey, dashed: true }
    ];
    this.expirySeries = v.expiryTypes.map((t, k) => ({
      name: t,
      values: v.expiryLabels.map((_, m) => v.expiring.filter((e) => e.type === t && e.monthIndex === m).length),
      color: EXPIRY_COLORS[k % EXPIRY_COLORS.length]
    }));
    this.buildInsights();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.buildScoreSeries();
    this.notify(this.compare ? 'Comparing the overall score with the previous period of the same length.' : 'Period comparison turned off.');
  }

  private buildScoreSeries(): void {
    const s = this.view.scoreSeries;
    this.scoreSeries = [
      { name: 'Overall', values: s.overall, color: RA_COLORS.purple },
      { name: 'Regulatory', values: s.regulatory, color: RA_COLORS.blue },
      { name: 'Safety', values: s.safety, color: RA_COLORS.green },
      { name: 'Environmental', values: s.environmental, color: RA_COLORS.orange }
    ];
    if (this.compare) this.scoreSeries.push({ name: 'Overall (previous period)', values: s.previous, color: RA_COLORS.grey, dashed: true });
  }

  private buildInsights(): void {
    const v = this.view;
    const target = v.scoreTarget;
    const critical = v.findings.filter((f) => f.severity === 'Critical').length;
    const soonSites = new Set(v.expiringSoon.map((e) => e.site).filter((s) => s !== '—')).size;
    const envScored = v.environmental.filter((e) => e.score !== null);
    const envBelow = envScored.filter((e) => (e.score ?? 0) < target);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    this.insights = [
      {
        key: 'overdue_capa', tone: v.capaOverdue.length ? 'red' : 'green', icon: TriangleAlert,
        title: `${plural(v.capaOverdue.length, 'CAPA action')} overdue`,
        text: v.capaOverdue.length
          ? `${plural(v.capaOverdue.length, 'corrective action')} ${v.capaOverdue.length === 1 ? 'is' : 'are'} past due and need attention to maintain compliance.`
          : 'No corrective actions are past due.',
        primary: { label: 'View actions', action: 'capa' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        key: 'expiring_items', tone: v.expiringSoon.length ? 'orange' : 'green', icon: Award,
        title: `${v.expiringSoon.length} permits or certifications expire within 90 days`,
        text: `${v.expiringSoon.length} permits or certifications will expire in the next 90 days across ${plural(soonSites, 'location')}.`,
        primary: { label: 'Open register', action: 'register' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        key: 'critical_findings', tone: critical ? 'red' : 'green', icon: FileSearch,
        title: `${plural(critical, 'critical finding')} require${critical === 1 ? 's' : ''} management review`,
        text: critical
          ? 'Critical audit findings are open and need management review and approval of corrective actions.'
          : 'No critical audit findings are open for the current filters.',
        primary: { label: 'View actions', action: 'critical' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      envBelow.length
        ? {
            key: 'environmental_compliance', tone: 'orange', icon: ShieldCheck,
            title: `Environmental compliance below target in ${plural(envBelow.length, 'location')}`,
            text: `Environmental compliance is below the ${target}% target at ${envBelow.map((e) => e.site).join(' and ')}.`,
            primary: { label: 'View details', action: 'environmental' }, secondary: { label: 'Create action plan', action: 'plan' }
          }
        : {
            key: 'environmental_compliance', tone: 'green', icon: ShieldCheck,
            title: envScored.length ? 'Environmental compliance on target' : 'No environmental checks due',
            text: envScored.length
              ? `Every location with environmental checks in scope meets the ${target}% environmental compliance target.`
              : 'No environmental compliance inspections fell due for the current filters.',
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

  get capaRate(): number {
    return this.view.capaRate ?? 0;
  }

  get capaDisplay(): string {
    return this.view.capaRate === null ? '—' : percent(this.view.capaRate);
  }

  // ===== Header actions =====

  /** GET /export: the Excel workbook for the filter bar. */
  exportAll(): void {
    this.api.export(this.filters()).subscribe({
      next: () => this.notify('Compliance Analytics exported.'),
      error: (err: Error) => this.notify(err.message)
    });
  }

  /** POST /views. */
  saveNamedView(name: string): void {
    this.saveOpen = false;
    this.api.createView(name, this.filters()).subscribe({
      next: (saved) => this.notify(`View “${saved.name}” saved with the current filters.`),
      error: (err: Error) => this.notify(err.message)
    });
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
          { label: 'Target', value: `${v.scoreTarget}%` },
          { label: 'Assets compliant', value: `${v.status.compliant.toLocaleString('en-US')} of ${this.statusTotal}` }
        ];
        break;
      case 'findings':
        fields = LEVELS.map((l) => ({ label: l, value: String(v.findings.filter((f) => f.severity === l).length) }));
        break;
      case 'expiring':
        fields = v.expiryTypes.map((t) => ({ label: t, value: String(v.expiringSoon.filter((e) => e.type === t).length) }));
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
    return labels.map((l, i) => [l.replace('\n', ' '), ...cols.map((c) => c[i] ?? 0)]);
  }

  exportScore(): void {
    const s = this.view.scoreSeries;
    downloadCsv('compliance-score-trend.csv', ['Month', 'Overall %', 'Regulatory %', 'Safety %', 'Environmental %', 'Overall previous period %'],
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
    downloadCsv('findings-by-compliance-area.csv', ['Area', 'Open findings'], this.view.areas.map((a, i) => [a, this.view.areaCounts[i] ?? 0]));
  }

  exportCapa(): void {
    downloadCsv('capa-closure-rate.csv', ['Month', 'Closure rate %', 'Target %'],
      this.monthRows(this.view.labels, this.view.capaSeries, this.view.capaSeries.map(() => this.view.capaTarget)));
  }

  exportExpiry(): void {
    downloadCsv('permit-certification-expiry.csv', EXPIRY_HEADER, this.expiryRows(this.view.expiring));
  }

  exportFindings(): void {
    downloadCsv('open-compliance-findings.csv', FINDING_HEADER, this.findingRows(this.view.findings));
  }

  exportLocations(): void {
    downloadCsv('regulatory-compliance-by-location.csv', ['Location', 'Score %', 'Open Findings', 'Expiring Items (90 days)', 'Risk', 'Status'],
      this.view.locations.map((r) => [r.site, r.score ?? '—', r.openFindings, r.expiring, r.risk, r.status]));
  }

  // ===== Tables =====

  openFinding(row: ComplianceFinding): void {
    const capa = this.view.capaOpen.find((c) => c.findingId === row.id);
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
        { label: 'Due date', value: row.dueInDays !== null && row.dueInDays < 0 ? `${row.due} (overdue)` : row.due },
        { label: 'Owner', value: row.owner },
        { label: 'Inspection', value: row.inspectionId ?? '—' },
        { label: 'Corrective action', value: capa ? `${capa.title} · ${capa.id} · due ${capa.due}` : row.correctiveAction ?? 'Not raised yet' }
      ]
    };
  }

  viewAllFindings(): void {
    this.showFindings('Open compliance findings', this.view.findings);
  }

  openLocation(row: LocationRow): void {
    this.detail = {
      title: row.site,
      subtitle: 'Regulatory compliance',
      finding: null,
      fields: [
        { label: 'Compliance score', value: row.score === null ? '—' : `${row.score}%` },
        { label: 'Environmental score', value: row.environmental === null ? '—' : `${row.environmental}%` },
        { label: 'Open findings', value: String(row.openFindings) },
        { label: 'Critical findings', value: String(row.critical) },
        { label: 'Items expiring within 90 days', value: String(row.expiring) },
        { label: 'Active risks', value: String(row.risks) },
        { label: 'Risk', value: row.risk },
        { label: 'Status', value: row.status }
      ]
    };
  }

  detailAction(): void {
    const f = this.detail?.finding;
    if (!f) return;
    this.detail = null;
    this.plan = {
      context: `${f.id} · ${f.severity} finding: ${f.requirement} (${f.regulation}, ${f.site}).`,
      title: `Corrective action for ${f.id}`,
      owner: f.owner === 'Unassigned' ? '' : f.owner,
      sourceType: 'finding',
      sourceId: f.id,
      location: f.site === '—' ? null : f.site,
      regulation: f.regulation === '—' ? null : f.regulation
    };
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
          subtitle: `Target ${v.scoreTarget}%`,
          header: ['Location', 'Environmental score %', 'Status'],
          rows: v.environmental.map((e) => [e.site, e.score ?? '—', e.score === null ? 'Not assessed' : e.score < v.scoreTarget ? 'Below target' : 'On target']),
          fileName: 'environmental-compliance-by-location.csv'
        };
        break;
      case 'plan':
        this.plan = {
          context: insight.title + '.',
          title: insight.title,
          owner: '',
          sourceType: 'insight',
          sourceId: insight.key,
          location: this.location === ALL_LOCATIONS ? null : this.location,
          regulation: this.regulation === ALL_REGULATIONS ? null : this.regulation
        };
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
    return rows.map((c) => [c.id, c.title, c.findingId, c.site, c.owner, c.due, c.daysOverdue]);
  }

  private expiryRows(rows: ExpiringItem[]): (string | number)[][] {
    return rows.map((e) => [e.id, e.name, e.type, e.source, e.site, e.expires, e.daysLeft]);
  }

  /** POST /action-plans: stores the plan in the compliance action plan register. */
  planSaved(form: ActionPlan): void {
    const spec = this.plan;
    this.plan = null;
    if (!spec) return;
    this.api.createActionPlan({ ...form, context: spec.context, sourceType: spec.sourceType, sourceId: spec.sourceId, location: spec.location, regulation: spec.regulation })
      .subscribe({
        next: (saved) => this.notify(`Action plan ${saved.id} “${saved.title}” created for ${saved.owner}, due ${saved.due}.`),
        error: (err: Error) => this.notify(err.message)
      });
  }
}
