import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowUp, Bookmark, ChartColumn, CircleCheck, ClipboardList, FileText, GitCompareArrows, LucideAngularModule, LucideIconData,
  RefreshCw, Repeat, ShieldCheck, TriangleAlert, Upload, Wrench
} from 'lucide-angular';
import { AnalyticsPage, RA_CATEGORIES, downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, GaugeChart, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaKpiCard, RaListDialog, RaSaveViewDialog, RaWidget
} from './kit';
import {
  COMPLIANCE_TARGET, FINDING_TYPES, INSPECTION_TYPES, INSPECTOR_OPTIONS, InspectionFinding, InspectionView, InspectorRow,
  SAFETY_TARGET, SEVERITY_RANK, Severity, buildInspectionView, recurringAssets
} from './inspection-analytics.data';
import { InspectionFindingsTable } from './findings-table/findings-table';
import { InspectorTable } from './inspector-table/inspector-table';

interface KpiTile {
  key: 'total' | 'rate' | 'open' | 'critical' | 'due';
  label: string;
  value: string;
  delta: string;
  up: boolean;
  good: boolean;
  icon: LucideIconData;
  tone: string;
}

type InsightAction = 'critical' | 'due' | 'recurring' | 'recurring-detail' | 'safety' | 'plan';

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
  finding: InspectionFinding | null;
}

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
const SEVERITY_COLORS: Record<Severity, string> = { Critical: RA_COLORS.red, High: RA_COLORS.pink, Medium: RA_COLORS.orange, Low: RA_COLORS.blue };
const FINDING_HEADER = ['Finding ID', 'Asset ID', 'Asset', 'Location', 'Category', 'Asset Category', 'Inspection Type', 'Severity', 'Due Date', 'Owner', 'Inspector', 'Status'];

/** Reports & Analytics > Inspection Analytics */
@Component({
  selector: 'app-ra-inspection-analytics',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaWidget, RaKpiCard, RaListDialog,
    RaDetailDialog, RaActionPlanDialog, RaSaveViewDialog, InspectionFindingsTable, InspectorTable
  ],
  templateUrl: './inspection-analytics.html',
  styleUrls: ['../shared/analytics-page.css', './inspection-analytics.css']
})
export class InspectionAnalyticsPage extends AnalyticsPage {
  readonly icons = { ArrowUp, Bookmark, GitCompareArrows, RefreshCw, Upload };
  readonly categories = ['All categories', ...RA_CATEGORIES];
  readonly types = INSPECTION_TYPES;
  readonly inspectorOptions = INSPECTOR_OPTIONS;
  readonly complianceTarget = COMPLIANCE_TARGET;
  readonly findingTypes = FINDING_TYPES.map((t) => t);
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  category = this.categories[0];
  type = INSPECTION_TYPES[0];
  inspector = INSPECTOR_OPTIONS[0];
  compare = false;

  view!: InspectionView;
  kpis: KpiTile[] = [];
  insights: Insight[] = [];
  trendSeries: ChartSeries[] = [];
  severitySeries: ChartSeries[] = [];
  statusSlices: ChartSlice[] = [];
  categorySeries: ChartSeries[] = [];
  complianceSeries: ChartSeries[] = [];
  repeatSeries: ChartSeries[] = [];

  list: ListSpec | null = null;
  detail: DetailSpec | null = null;
  plan: { context: string; title: string; owner: string } | null = null;
  saveOpen = false;

  constructor() {
    super();
    this.updatedMinutes = 4;
    this.apply();
  }

  /** Recomputes every widget from the filters. */
  apply(): void {
    const v = buildInspectionView({
      period: this.period,
      organization: this.organization,
      location: this.location,
      category: this.category,
      type: this.type,
      inspector: this.inspector
    });
    this.view = v;
    this.kpis = [
      { key: 'total', label: 'Total Inspections', value: v.totalInspections.toLocaleString('en-US'), delta: '+12.5%', up: true, good: true, icon: ClipboardList, tone: 'purple' },
      { key: 'rate', label: 'Completion Rate', value: percent(v.completionRate), delta: '+3.8%', up: true, good: true, icon: CircleCheck, tone: 'green' },
      { key: 'open', label: 'Open Findings', value: String(v.findings.length), delta: '-9.4%', up: false, good: true, icon: FileText, tone: 'orange' },
      { key: 'critical', label: 'Critical Findings', value: String(v.critical), delta: '-20%', up: false, good: true, icon: TriangleAlert, tone: 'red' },
      { key: 'due', label: 'Corrective Actions Due', value: String(v.actionsDue), delta: '+6.2%', up: true, good: false, icon: Wrench, tone: 'blue' }
    ];
    this.buildTrend();
    this.severitySeries = SEVERITIES.map((s) => ({ name: s, values: v.severity[s], color: SEVERITY_COLORS[s] }));
    this.statusSlices = [
      { name: 'Completed', value: v.status.completed, color: RA_COLORS.green },
      { name: 'In Progress', value: v.status.inProgress, color: RA_COLORS.blue },
      { name: 'Scheduled', value: v.status.scheduled, color: RA_COLORS.violet },
      { name: 'Overdue', value: v.status.overdue, color: RA_COLORS.red }
    ];
    this.categorySeries = [{ name: 'Findings', values: v.byFindingType, color: RA_COLORS.purple }];
    this.complianceSeries = [
      { name: 'Compliance', values: v.rateSeries, color: RA_COLORS.green, area: true },
      { name: 'Target', values: v.rateSeries.map(() => COMPLIANCE_TARGET), color: RA_COLORS.grey, dashed: true }
    ];
    this.repeatSeries = [
      { name: 'Repeated Defects', values: v.repeated, color: RA_COLORS.pink },
      { name: 'Resolved Defects', values: v.resolved, color: RA_COLORS.blue }
    ];
    this.buildInsights();
  }

  resetFilters(): void {
    this.period = this.periods[0];
    this.organization = this.organizations[0];
    this.location = this.locations[0];
    this.category = this.categories[0];
    this.type = INSPECTION_TYPES[0];
    this.inspector = INSPECTOR_OPTIONS[0];
    this.apply();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.buildTrend();
    this.notify(this.compare ? 'Comparing completed inspections with the same months of 2025.' : 'Period comparison turned off.');
  }

  private buildTrend(): void {
    const v = this.view;
    this.trendSeries = [
      { name: 'Planned', values: v.planned, color: RA_COLORS.blue },
      { name: 'Completed', values: v.completed, color: RA_COLORS.green },
      { name: 'Overdue', values: v.overdue, color: RA_COLORS.red, dashed: true }
    ];
    if (this.compare) this.trendSeries.push({ name: 'Completed (2025)', values: v.completedPrevious, color: RA_COLORS.grey, dashed: true });
  }

  private buildInsights(): void {
    const v = this.view;
    const recurring = recurringAssets(v.findings);
    const belowSafety = v.siteSafety.filter((s) => s.safety < SAFETY_TARGET);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    this.insights = [
      {
        tone: 'red', icon: TriangleAlert,
        title: `${plural(v.critical, 'critical finding')} require${v.critical === 1 ? 's' : ''} immediate action`,
        text: 'Critical findings pose high safety and asset risk and need a corrective action owner today.',
        primary: { label: 'View findings', action: 'critical' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        tone: 'orange', icon: ChartColumn,
        title: `${plural(v.actionsDue, 'corrective action')} due within 7 days`,
        text: 'Corrective actions are due soon and may affect inspection compliance if they slip.',
        primary: { label: 'View findings', action: 'due' }, secondary: { label: 'Create action plan', action: 'plan' }
      },
      {
        tone: 'blue', icon: Repeat,
        title: `${plural(recurring.length, 'asset')} ${recurring.length === 1 ? 'has' : 'have'} recurring findings`,
        text: 'These assets have more than one open finding from recent inspection cycles.',
        primary: { label: 'View assets', action: 'recurring' }, secondary: { label: 'Open asset details', action: 'recurring-detail' }
      },
      belowSafety.length
        ? {
            tone: 'purple', icon: ShieldCheck,
            title: `Safety compliance below target in ${plural(belowSafety.length, 'location')}`,
            text: `Safety inspection compliance is below ${SAFETY_TARGET}% at ${belowSafety.map((s) => s.site).join(' and ')}.`,
            primary: { label: 'View details', action: 'safety' }, secondary: { label: 'Create action plan', action: 'plan' }
          }
        : {
            tone: 'green', icon: ShieldCheck,
            title: 'Safety compliance on target',
            text: `Every location in scope is at or above the ${SAFETY_TARGET}% safety inspection target.`,
            primary: { label: 'View details', action: 'safety' }, secondary: { label: 'Create action plan', action: 'plan' }
          }
    ];
  }

  get statusTotal(): string {
    const s = this.view.status;
    return (s.completed + s.inProgress + s.scheduled + s.overdue).toLocaleString('en-US');
  }

  // ===== Header actions =====

  exportAll(): void {
    downloadCsv('inspection-analytics-open-findings.csv', FINDING_HEADER, this.findingRows(this.view.findings));
    this.notify(`Exported ${this.view.findings.length} open findings.`);
  }

  saveNamedView(name: string): void {
    this.saveOpen = false;
    this.saveView(name);
  }

  // ===== KPI cards =====

  kpiAction(kpi: KpiTile, action: string): void {
    if (action === 'Export CSV') {
      downloadCsv(`inspection-${kpi.key}.csv`, ['KPI', 'Value', 'Change vs previous period', 'Period', 'Location'], [[kpi.label, kpi.value, kpi.delta, this.period, this.location]]);
      return;
    }
    const v = this.view;
    const count = (n: number) => n.toLocaleString('en-US');
    let fields: DetailField[];
    switch (kpi.key) {
      case 'total':
        fields = [
          { label: 'Completed', value: count(v.status.completed) },
          { label: 'In progress', value: count(v.status.inProgress) },
          { label: 'Scheduled', value: count(v.status.scheduled) },
          { label: 'Overdue', value: count(v.status.overdue) }
        ];
        break;
      case 'rate':
        fields = [
          { label: 'Definition', value: 'Completed ÷ (completed + overdue + in progress)' },
          { label: 'Target', value: `${COMPLIANCE_TARGET}%` }
        ];
        break;
      case 'open':
        fields = SEVERITIES.map((s) => ({ label: s, value: String(v.findings.filter((r) => r.severity === s).length) }));
        break;
      case 'critical':
        fields = [{ label: 'Earliest due date', value: this.earliestDue(v.findings.filter((r) => r.severity === 'Critical')) }];
        break;
      default:
        fields = [
          { label: 'Window', value: 'Due today up to 7 days ahead' },
          { label: 'Already overdue', value: String(v.findings.filter((r) => r.dueInDays < 0).length) }
        ];
    }
    fields.push({ label: 'Change vs previous period', value: kpi.delta }, { label: 'Period', value: this.period }, { label: 'Location', value: this.location });
    this.detail = { title: kpi.label, subtitle: kpi.value, fields, finding: null };
  }

  private earliestDue(rows: InspectionFinding[]): string {
    return rows.slice().sort((a, b) => a.dueInDays - b.dueInDays)[0]?.due ?? '—';
  }

  // ===== Widget exports =====

  private monthRows(...cols: number[][]): (string | number)[][] {
    return this.view.labels.map((l, i) => [l.replace('\n', ' '), ...cols.map((c) => c[i])]);
  }

  exportTrend(): void {
    const v = this.view;
    downloadCsv('inspection-completion-trend.csv', ['Month', 'Planned', 'Completed', 'Overdue', 'Completed (2025)'], this.monthRows(v.planned, v.completed, v.overdue, v.completedPrevious));
  }

  exportSeverity(): void {
    const s = this.view.severity;
    downloadCsv('findings-by-severity.csv', ['Month', ...SEVERITIES], this.monthRows(s.Critical, s.High, s.Medium, s.Low));
  }

  exportStatus(): void {
    downloadCsv('inspection-status.csv', ['Status', 'Inspections'], this.statusSlices.map((s) => [s.name, s.value]));
  }

  exportCategories(): void {
    downloadCsv('findings-by-category.csv', ['Category', 'Findings'], FINDING_TYPES.map((t, i) => [t, this.view.byFindingType[i]]));
  }

  exportCompliance(): void {
    const v = this.view;
    downloadCsv('inspection-compliance.csv', ['Month', 'Compliance %', 'Target %'], this.monthRows(v.rateSeries, v.rateSeries.map(() => COMPLIANCE_TARGET)));
  }

  exportRepeat(): void {
    downloadCsv('repeat-findings.csv', ['Month', 'Repeated', 'Resolved'], this.monthRows(this.view.repeated, this.view.resolved));
  }

  exportFindings(): void {
    downloadCsv('open-inspection-findings.csv', FINDING_HEADER, this.findingRows(this.view.findings));
  }

  exportInspectors(): void {
    downloadCsv('inspector-performance.csv', ['Inspector', 'Inspections Completed', 'Avg Duration (hrs)', 'Finding Rate %', 'Closure Rate %'],
      this.view.inspectors.map((r) => [r.name, r.inspections, r.avgHours, r.findingRate, r.closureRate]));
  }

  // ===== Tables =====

  openFinding(row: InspectionFinding): void {
    this.detail = {
      title: row.id,
      subtitle: `${row.assetName} · ${row.site}`,
      finding: row,
      fields: [
        { label: 'Asset ID', value: row.assetId },
        { label: 'Asset', value: row.assetName },
        { label: 'Asset category', value: row.category },
        { label: 'Location', value: row.site },
        { label: 'Finding category', value: row.findingType },
        { label: 'Inspection type', value: row.inspectionType },
        { label: 'Severity', value: row.severity },
        { label: 'Status', value: row.status },
        { label: 'Due date', value: row.dueInDays < 0 ? `${row.due} (overdue)` : row.due },
        { label: 'Owner', value: row.owner },
        { label: 'Inspector', value: row.inspector }
      ]
    };
  }

  planFor(row: InspectionFinding): void {
    this.detail = null;
    this.plan = {
      context: `${row.id} · ${row.severity} ${row.findingType.toLowerCase()} finding on ${row.assetName} (${row.site}).`,
      title: `Corrective action for ${row.id}`,
      owner: row.owner
    };
  }

  markInProgress(row: InspectionFinding): void {
    row.status = 'In Progress';
    this.view = { ...this.view, findings: [...this.view.findings] };
    this.notify(`${row.id} marked as in progress.`);
  }

  viewAllFindings(): void {
    this.showFindings('Open inspection findings', this.view.findings);
  }

  openInspector(row: InspectorRow): void {
    const open = this.view.findings.filter((f) => f.inspector === row.name);
    this.detail = {
      title: row.name,
      subtitle: 'Inspector performance',
      finding: null,
      fields: [
        { label: 'Inspections completed', value: row.inspections.toLocaleString('en-US') },
        { label: 'Average duration', value: `${row.avgHours} hrs` },
        { label: 'Finding rate', value: `${row.findingRate}%` },
        { label: 'Closure rate', value: `${row.closureRate}%` },
        { label: 'Open findings raised', value: String(open.length) },
        { label: 'Critical open findings', value: String(open.filter((f) => f.severity === 'Critical').length) }
      ]
    };
  }

  detailAction(): void {
    if (this.detail?.finding) this.planFor(this.detail.finding);
  }

  // ===== Insights =====

  insightAction(insight: Insight, action: InsightAction): void {
    const v = this.view;
    switch (action) {
      case 'critical':
        this.showFindings('Critical findings', v.findings.filter((r) => r.severity === 'Critical'));
        break;
      case 'due':
        this.showFindings('Corrective actions due within 7 days', v.findings.filter((r) => r.dueInDays >= 0 && r.dueInDays <= 7));
        break;
      case 'recurring':
        this.list = {
          title: 'Assets with recurring findings',
          subtitle: 'Assets with more than one open finding',
          header: ['Asset ID', 'Asset', 'Location', 'Open findings'],
          rows: recurringAssets(v.findings).map((a) => [a.assetId, a.assetName, a.site, a.count]),
          fileName: 'recurring-findings-assets.csv'
        };
        break;
      case 'recurring-detail':
        this.openRecurringAsset();
        break;
      case 'safety':
        this.list = {
          title: 'Safety inspection compliance by location',
          subtitle: `Target ${SAFETY_TARGET}%`,
          header: ['Location', 'Safety compliance %', 'Status'],
          rows: v.siteSafety.map((s) => [s.site, s.safety, s.safety < SAFETY_TARGET ? 'Below target' : 'On target']),
          fileName: 'safety-compliance-by-location.csv'
        };
        break;
      case 'plan':
        this.plan = { context: insight.title + '.', title: insight.title, owner: '' };
        break;
    }
  }

  private openRecurringAsset(): void {
    const top = recurringAssets(this.view.findings)[0];
    if (!top) {
      this.notify('No assets with recurring findings for the current filters.');
      return;
    }
    const rows = this.view.findings.filter((r) => r.assetId === top.assetId);
    const worst = rows.slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    this.detail = {
      title: top.assetName,
      subtitle: `${top.assetId} · ${top.site}`,
      finding: null,
      fields: [
        { label: 'Open findings', value: String(top.count) },
        { label: 'Highest severity', value: worst.severity },
        { label: 'Finding IDs', value: rows.map((r) => r.id).join(', ') },
        { label: 'Categories', value: [...new Set(rows.map((r) => r.findingType))].join(', ') }
      ]
    };
  }

  private showFindings(title: string, rows: InspectionFinding[]): void {
    this.list = {
      title,
      subtitle: `${rows.length} finding${rows.length === 1 ? '' : 's'} · ${this.location} · ${this.period}`,
      header: FINDING_HEADER,
      rows: this.findingRows(rows),
      fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    };
  }

  private findingRows(rows: InspectionFinding[]): (string | number)[][] {
    return rows.map((r) => [r.id, r.assetId, r.assetName, r.site, r.findingType, r.category, r.inspectionType, r.severity, r.due, r.owner, r.inspector, r.status]);
  }

  planSaved(plan: ActionPlan): void {
    this.plan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created for ${plan.owner}, due ${plan.due}.`);
  }
}
