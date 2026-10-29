import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Banknote, Box, ChartColumn, ChevronDown, CirclePlus, ClipboardCheck, ClipboardList, Cog, Database, Factory, FileText, Gauge,
  HeartPulse, LucideAngularModule, LucideIconData, Package, RefreshCw, Settings, Share2, Shield, ShieldCheck, Target, TriangleAlert,
  Upload, Users, Wrench
} from 'lucide-angular';
import { AnalyticsPage, RA_MONTH_LABELS, downloadCsv, money } from '../shared/analytics-common';
import { CartesianChart, ChartSeries, HBarChart, HBarRow, RA_COLORS } from '../shared/charts';
import {
  ActionPlan, DetailField, RaActionPlanDialog, RaDetailDialog, RaListDialog, RaSaveViewDialog, RaShareDialog, RaWidget
} from '../inspection-analytics/kit';
import {
  BUSINESS_UNITS, KPI_CATALOG, KPI_MODULES, KPI_VIEWS, KpiDef, KpiModule, KpiState, KpiViewDef, attainment, evaluateKpi, kpiScope
} from './kpi-dashboard.data';
import { KpiTile } from './kpi-tile';
import { KpiLayoutDialog, LayoutItem } from './kpi-layout-dialog';
import { KpiFormDialog, KpiFormValue } from './kpi-form-dialog';
import { KpiExceptionsTable } from './kpi-exceptions-table';

interface TileVm {
  state: KpiState;
  icon: LucideIconData;
  tone: string;
}

type InsightAction = 'exceptions' | 'plan' | 'settings' | 'due-week';

interface Insight {
  tone: string;
  icon: LucideIconData;
  title: string;
  text: string;
  action: { label: string; key: InsightAction };
  kpi: KpiState | null;
}

interface ListSpec {
  title: string;
  subtitle: string;
  header: string[];
  rows: (string | number)[][];
  fileName: string;
}

const KPI_ICONS: Record<string, LucideIconData> = {
  health: HeartPulse, pm: ShieldCheck, utilization: ChartColumn, cost: Database, openWo: FileText, inspection: ClipboardCheck,
  turnover: Box, oee: Cog, compliance: ShieldCheck, onTime: Factory, prediction: Target, capa: ClipboardList, availability: Gauge,
  mttr: Wrench, overdueWo: TriangleAlert, capex: Banknote, opex: Banknote, inventoryValue: Package, wip: Factory
};
const MODULE_ICONS: Record<KpiModule, LucideIconData> = {
  Asset: Box, Maintenance: Wrench, Inspection: ClipboardCheck, Inventory: Package, Operations: Factory, Compliance: Shield, Financial: Banknote
};
const MODULE_TONES: Record<KpiModule, string> = {
  Asset: 'green', Maintenance: 'blue', Inspection: 'purple', Inventory: 'blue', Operations: 'purple', Compliance: 'green', Financial: 'red'
};
const EXCEPTION_STATUSES = ['All Statuses', 'Watch', 'At Risk', 'Over Budget'];
const EXPORT_HEADER = ['KPI', 'Module', 'Current', 'Target', 'Variance', 'Change vs previous period', 'Status', 'Owner', 'Due Date'];

/** Reports & Analytics > KPI Dashboard */
@Component({
  selector: 'app-ra-kpi-dashboard',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, CartesianChart, HBarChart, RaWidget, RaListDialog, RaDetailDialog, RaActionPlanDialog,
    RaSaveViewDialog, RaShareDialog, KpiTile, KpiLayoutDialog, KpiFormDialog, KpiExceptionsTable
  ],
  templateUrl: './kpi-dashboard.html',
  styleUrls: ['../shared/analytics-page.css', './kpi-dashboard.css']
})
export class KpiDashboardPage extends AnalyticsPage {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ChartColumn, ChevronDown, CirclePlus, RefreshCw, Settings, Share2, Upload };
  readonly moduleIcons = MODULE_ICONS;
  readonly businessUnits = BUSINESS_UNITS;
  readonly exceptionStatuses = EXCEPTION_STATUSES;
  readonly granularities = ['Monthly', 'Quarterly'];
  readonly percentFormat = (v: number) => `${Math.round(v)}%`;

  /** Session copies so created / edited KPIs and custom views survive filter changes */
  catalog: KpiDef[] = KPI_CATALOG.map((k) => ({ ...k }));
  views: KpiViewDef[] = KPI_VIEWS.map((v) => ({ ...v, ids: [...v.ids] }));
  layouts: Record<string, { id: string; visible: boolean }[]> = {};
  activeKey = 'executive';
  businessUnit = BUSINESS_UNITS[0];
  granularity = 'Monthly';
  exceptionStatus = EXCEPTION_STATUSES[0];

  states = new Map<string, KpiState>();
  tiles: TileVm[] = [];
  trendLabels: string[] = [];
  trendSeries: ChartSeries[] = [];
  targetRows: HBarRow[] = [];
  viewExceptions: KpiState[] = [];
  exceptions: KpiState[] = [];
  insights: Insight[] = [];
  library: { module: KpiModule; count: number }[] = [];

  customMenuOpen = false;
  layoutOpen = false;
  shareOpen = false;
  saveCustomOpen = false;
  /** 'new' for Create KPI, a KPI for Edit KPI */
  form: KpiDef | 'new' | null = null;
  list: ListSpec | null = null;
  detail: { title: string; subtitle: string; fields: DetailField[]; kpi: KpiState | null } | null = null;
  plan: { context: string; title: string; owner: string } | null = null;

  constructor() {
    super();
    this.updatedMinutes = 2;
    this.views.forEach((v) => (this.layouts[v.key] = v.ids.map((id) => ({ id, visible: true }))));
    this.apply();
  }

  // ===== Views =====

  get activeView(): KpiViewDef {
    return this.views.find((v) => v.key === this.activeKey) ?? this.views[0];
  }

  get standardViews(): KpiViewDef[] {
    return this.views.filter((v) => !v.custom);
  }

  get customViews(): KpiViewDef[] {
    return this.views.filter((v) => v.custom);
  }

  get customLabel(): string {
    return this.activeView.custom ? this.activeView.label : 'Custom Views';
  }

  selectView(key: string): void {
    this.activeKey = key;
    this.customMenuOpen = false;
    this.apply();
  }

  get shareLink(): string {
    const origin = typeof location === 'undefined' ? '' : location.origin;
    return `${origin}${this.basePath}/kpi-dashboard?view=${encodeURIComponent(this.activeKey)}`;
  }

  // ===== Data =====

  /** Re-evaluates every KPI against the filters and rebuilds the tiles, charts, exceptions and insights. */
  apply(): void {
    const scope = kpiScope(this.period, this.organization, this.location, this.businessUnit);
    this.states = new Map(this.catalog.map((d) => [d.id, evaluateKpi(d, scope)]));
    const layout = this.layouts[this.activeKey] ?? [];
    this.tiles = layout
      .filter((l) => l.visible && this.states.has(l.id))
      .map((l) => {
        const state = this.states.get(l.id) as KpiState;
        return { state, icon: KPI_ICONS[l.id] ?? MODULE_ICONS[state.def.module], tone: MODULE_TONES[state.def.module] };
      });
    const shown = this.tiles.map((t) => t.state).filter((s) => s.status !== 'No Data');
    this.viewExceptions = shown.filter((s) => s.status !== 'On Track');
    this.filterExceptions();
    this.buildTrend(shown);
    this.buildTargets(shown);
    this.buildInsights();
    this.library = KPI_MODULES.map((m) => ({ module: m, count: this.catalog.filter((k) => k.module === m).length }));
  }

  filterExceptions(): void {
    this.exceptions = this.exceptionStatus === EXCEPTION_STATUSES[0] ? this.viewExceptions : this.viewExceptions.filter((s) => s.status === this.exceptionStatus);
  }

  setGranularity(): void {
    this.buildTrend(this.tiles.map((t) => t.state).filter((s) => s.status !== 'No Data'));
  }

  /** Overall score = average attainment vs target of the KPIs shown (100% = on target). */
  private buildTrend(shown: KpiState[]): void {
    const monthly = RA_MONTH_LABELS.map((_, i) =>
      shown.length ? Number((shown.reduce((a, s) => a + Math.min(120, attainment(s.spark[i], s.target, s.def.direction)), 0) / shown.length).toFixed(1)) : 0
    );
    // Prior period: the same KPIs before this period's change
    const prior = RA_MONTH_LABELS.map((_, i) =>
      shown.length
        ? Number((shown.reduce((a, s) => a + Math.min(120, attainment(s.spark[i] / (1 + s.def.change / 100), s.target, s.def.direction)), 0) / shown.length).toFixed(1))
        : 0
    );
    let labels = RA_MONTH_LABELS;
    let overall = monthly;
    let previous = prior;
    if (this.granularity === 'Quarterly') {
      const quarters: [number, number][] = [[0, 3], [3, 6], [6, 9], [9, 10]];
      const avg = (values: number[], [a, b]: [number, number]) => Number((values.slice(a, b).reduce((x, y) => x + y, 0) / (b - a)).toFixed(1));
      labels = ['Q1\n2026', 'Q2\n2026', 'Q3\n2026', 'Q4 (QTD)\n2026'];
      overall = quarters.map((q) => avg(monthly, q));
      previous = quarters.map((q) => avg(prior, q));
    }
    this.trendLabels = labels;
    this.trendSeries = [
      { name: 'Overall Score', values: overall, color: RA_COLORS.purple, area: true },
      { name: 'Target', values: overall.map(() => 100), color: RA_COLORS.grey, dashed: true },
      { name: 'Prior Period', values: previous, color: RA_COLORS.blue }
    ];
  }

  /** Average attainment per module of the KPIs shown */
  private buildTargets(shown: KpiState[]): void {
    this.targetRows = KPI_MODULES.filter((m) => shown.some((s) => s.def.module === m)).map((m) => {
      const list = shown.filter((s) => s.def.module === m);
      const value = Number((list.reduce((a, s) => a + s.attainment, 0) / list.length).toFixed(1));
      return {
        label: m,
        value,
        display: `${value}%`,
        color: value >= 100 ? RA_COLORS.green : value >= 97 ? RA_COLORS.orange : RA_COLORS.red,
        target: 100,
        targetDisplay: '100%'
      };
    });
  }

  private buildInsights(): void {
    const ex = this.viewExceptions;
    const below = ex.filter((s) => s.status !== 'Over Budget');
    const over = ex.filter((s) => s.status === 'Over Budget').sort((a, b) => b.value - b.target - (a.value - a.target))[0];
    const atRisk = ex.filter((s) => s.status === 'At Risk').sort((a, b) => a.attainment - b.attainment)[0];
    const dueWeek = ex.filter((s) => s.def.dueInDays <= 7);
    const owners = new Set(dueWeek.map((s) => s.def.owner)).size;
    const names = (list: KpiState[]) => {
      const n = list.map((s) => s.def.name);
      return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
    };
    const insights: Insight[] = [];
    insights.push(
      below.length
        ? {
            tone: 'red', icon: TriangleAlert, kpi: null,
            title: `${below.length} KPI${below.length === 1 ? '' : 's'} below target`,
            text: `${names(below)} ${below.length === 1 ? 'is' : 'are'} below target.`,
            action: { label: 'View exceptions', key: 'exceptions' }
          }
        : {
            tone: 'green', icon: ShieldCheck, kpi: null,
            title: 'All KPIs on target',
            text: 'Every KPI in this view meets its target for the selected filters.',
            action: { label: 'View exceptions', key: 'exceptions' }
          }
    );
    if (over) {
      insights.push({
        tone: 'red', icon: TriangleAlert, kpi: over,
        title: `${over.def.name} is ${money(over.value - over.target)} over budget`,
        text: `${over.def.name} is ${over.varianceText} over budget, driven by higher spend than planned this period.`,
        action: { label: 'Create action plan', key: 'plan' }
      });
    }
    if (atRisk) {
      const gap = Number((100 - atRisk.attainment).toFixed(1));
      insights.push({
        tone: 'orange', icon: TriangleAlert, kpi: atRisk,
        title: `${atRisk.def.name} requires attention`,
        text: `${atRisk.def.name} is ${gap}% off target${atRisk.changeGood ? '' : ' and trending the wrong way'} over the last periods.`,
        action: { label: 'Open KPI settings', key: 'settings' }
      });
    }
    insights.push({
      tone: 'blue', icon: Users, kpi: null,
      title: `${owners} KPI owner${owners === 1 ? ' has' : 's have'} actions due this week`,
      text: `There ${dueWeek.length === 1 ? 'is' : 'are'} ${dueWeek.length} open action${dueWeek.length === 1 ? '' : 's'} for KPI owners due within the next 7 days.`,
      action: { label: 'View exceptions', key: 'due-week' }
    });
    this.insights = insights;
  }

  // ===== Header actions =====

  exportAll(): void {
    const rows = this.tiles.map((t) => this.exportRow(t.state));
    downloadCsv(`kpi-dashboard-${this.activeKey.replace(/[^a-z0-9]+/gi, '-')}.csv`, EXPORT_HEADER, rows);
    this.notify(`Exported ${rows.length} KPIs from ${this.activeView.dashboard}.`);
  }

  private exportRow(s: KpiState): (string | number)[] {
    return [s.def.name, s.def.module, s.valueText, s.targetText, s.varianceText, s.changeText, s.status, s.def.owner, s.due];
  }

  shared(message: string): void {
    this.shareOpen = false;
    this.notify(message);
  }

  // ===== Layout =====

  get layoutItems(): LayoutItem[] {
    return (this.layouts[this.activeKey] ?? []).map((l) => {
      const def = this.catalog.find((k) => k.id === l.id);
      return { id: l.id, name: def?.name ?? l.id, module: def?.module ?? '', visible: l.visible };
    });
  }

  saveLayout(items: LayoutItem[]): void {
    this.layouts[this.activeKey] = items.map((i) => ({ id: i.id, visible: i.visible }));
    this.layoutOpen = false;
    this.apply();
    this.notify(`Layout saved for ${this.activeView.dashboard}.`);
  }

  resetLayout(): void {
    this.layouts[this.activeKey] = this.activeView.ids.map((id) => ({ id, visible: true }));
    this.layoutOpen = false;
    this.apply();
    this.notify('Layout reset to the default tiles.');
  }

  saveCustomView(name: string): void {
    const key = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${this.views.length}`;
    const ids = this.tiles.map((t) => t.state.def.id);
    this.views = [...this.views, { key, label: name, dashboard: `${name} (custom)`, ids, custom: true }];
    this.layouts[key] = ids.map((id) => ({ id, visible: true }));
    this.saveCustomOpen = false;
    this.selectView(key);
    this.notify(`Custom view “${name}” saved with ${ids.length} KPIs.`);
  }

  // ===== KPI create / edit =====

  get takenNames(): string[] {
    return this.catalog.map((k) => k.name);
  }

  get formKpi(): KpiDef | null {
    return this.form === 'new' ? null : this.form;
  }

  get formModule(): KpiModule {
    return this.activeView.key === 'finance' ? 'Financial' : this.activeView.key === 'maintenance' ? 'Maintenance' : this.activeView.key === 'operations' ? 'Operations' : 'Asset';
  }

  saveKpi(value: KpiFormValue): void {
    const editing = this.formKpi;
    if (editing) {
      Object.assign(editing, { name: value.name, target: value.target as number, direction: value.direction, owner: value.owner });
      this.notify(`${value.name} updated.`);
    } else {
      const id = `custom-${this.catalog.length + 1}`;
      this.catalog = [
        ...this.catalog,
        {
          id, name: value.name, module: value.module, unit: value.unit, value: value.value as number, target: value.target as number,
          direction: value.direction, owner: value.owner, change: 0, dueInDays: 14, info: 'Custom KPI', custom: true
        }
      ];
      this.layouts[this.activeKey] = [...(this.layouts[this.activeKey] ?? []), { id, visible: true }];
      this.notify(`DEMO MODE: KPI “${value.name}” added to ${value.module} and to ${this.activeView.dashboard}.`);
    }
    this.form = null;
    this.apply();
  }

  // ===== Tiles =====

  tileAction(tile: TileVm, action: string): void {
    const s = tile.state;
    switch (action) {
      case 'View details':
        this.openDetail(s);
        break;
      case 'Edit KPI':
        this.form = s.def;
        break;
      case 'Hide tile':
        this.layouts[this.activeKey] = (this.layouts[this.activeKey] ?? []).map((l) => (l.id === s.def.id ? { ...l, visible: false } : l));
        this.apply();
        this.notify(`${s.def.name} hidden. Use Edit KPI Layout to show it again.`);
        break;
      default:
        downloadCsv(`kpi-${s.def.id}.csv`, ['Month', s.def.name], RA_MONTH_LABELS.map((l, i) => [l.replace('\n', ' '), s.spark[i]]));
    }
  }

  openDetail(s: KpiState): void {
    this.detail = {
      title: s.def.name,
      subtitle: `${s.def.module} · ${s.def.info}`,
      kpi: s,
      fields: [
        { label: 'Current value', value: s.valueText },
        { label: s.def.unit === 'AED' ? 'Budget' : 'Target', value: s.targetText.replace(/^(Budget|Target) /, '') },
        { label: 'Variance vs target', value: s.varianceText },
        { label: 'Direction', value: s.def.direction === 'higher' ? 'Higher is better' : 'Lower is better' },
        { label: 'Status', value: s.status },
        { label: 'Change vs previous period', value: s.changeText },
        { label: 'Owner', value: s.def.owner },
        { label: 'Next review due', value: s.due },
        { label: 'Scope', value: `${this.location} · ${this.businessUnit}` },
        { label: 'Period', value: this.period }
      ]
    };
  }

  editFromDetail(): void {
    const kpi = this.detail?.kpi;
    this.detail = null;
    if (kpi) this.form = kpi.def;
  }

  // ===== Widgets =====

  exportTrend(): void {
    const [overall, target, prior] = this.trendSeries;
    downloadCsv('kpi-performance-trend.csv', ['Period', 'Overall Score %', 'Target %', 'Prior Period %'],
      this.trendLabels.map((l, i) => [l.replace('\n', ' '), overall.values[i], target.values[i], prior.values[i]]));
  }

  exportTargets(): void {
    downloadCsv('kpi-target-vs-actual.csv', ['Module', 'Attainment %', 'Target %'], this.targetRows.map((r) => [r.label, r.value, 100]));
  }

  exportExceptions(): void {
    downloadCsv('kpi-exceptions.csv', EXPORT_HEADER, this.exceptions.map((s) => this.exportRow(s)));
  }

  // ===== Insights & library =====

  insightAction(ins: Insight): void {
    switch (ins.action.key) {
      case 'exceptions':
        this.showExceptions('KPI exceptions', this.viewExceptions);
        break;
      case 'due-week':
        this.showExceptions('KPI actions due this week', this.viewExceptions.filter((s) => s.def.dueInDays <= 7));
        break;
      case 'settings':
        if (ins.kpi) this.form = ins.kpi.def;
        break;
      case 'plan':
        this.plan = {
          context: ins.title + '.',
          title: ins.kpi ? `Bring ${ins.kpi.def.name.toLowerCase()} back within budget` : ins.title,
          owner: ins.kpi?.def.owner ?? ''
        };
        break;
    }
  }

  private showExceptions(title: string, rows: KpiState[]): void {
    this.list = {
      title,
      subtitle: `${rows.length} KPI${rows.length === 1 ? '' : 's'} · ${this.activeView.dashboard}`,
      header: EXPORT_HEADER,
      rows: rows.map((s) => this.exportRow(s)),
      fileName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    };
  }

  openLibrary(module: KpiModule): void {
    const defs = this.catalog.filter((k) => k.module === module);
    this.list = {
      title: `${module} KPIs`,
      subtitle: `${defs.length} KPI${defs.length === 1 ? '' : 's'} in the library`,
      header: ['KPI', 'Current', 'Target', 'Status', 'Owner', 'On this view'],
      rows: defs.map((d) => {
        const s = this.states.get(d.id) as KpiState;
        return [d.name, s.valueText, s.targetText, s.status, d.owner, this.tiles.some((t) => t.state.def.id === d.id) ? 'Yes' : 'No'];
      }),
      fileName: `kpi-library-${module.toLowerCase()}.csv`
    };
  }

  planSaved(plan: ActionPlan): void {
    this.plan = null;
    this.notify(`DEMO MODE: action plan “${plan.title}” created for ${plan.owner}, due ${plan.due}.`);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.customMenuOpen) return;
    const menu = this.host.nativeElement.querySelector('.kd-custom');
    if (menu && !menu.contains(event.target as Node)) this.customMenuOpen = false;
  }
}
