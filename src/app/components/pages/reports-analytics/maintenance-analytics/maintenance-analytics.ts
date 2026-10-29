import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChartColumn, Clock, Download, FileText, GitCompareArrows, GripVertical, House, Info,
  LucideAngularModule, Package, RefreshCw, Settings, ShieldCheck, TriangleAlert, Wrench
} from 'lucide-angular';
import { downloadCsv, money, percent } from '../shared/analytics-common';
import { CartesianChart, DonutChart, GaugeChart, RA_COLORS, compactNumber } from '../shared/charts';
import { RaAsset, RaWorkOrder } from '../asset-performance/kit/asset-universe';
import { RaInsight, RaInsightCard, RaKpiCard } from '../asset-performance/kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from '../asset-performance/kit/ra-dialogs';
import { RaMenu } from '../asset-performance/kit/ra-menu';
import { ScopedAnalyticsPage, SortDir, sortRows } from '../asset-performance/kit/scoped-page';
import { ALL_MAINTENANCE_TYPES, MAINTENANCE_TYPES, MA_DELTAS, MaintenanceView, PM_TARGET, PRIORITY_RANK, TechnicianRow, buildMaintenance } from './maintenance-analytics.data';

type BacklogSortKey = 'priority' | 'id' | 'asset' | 'location' | 'age' | 'technician' | 'status';
type TechSortKey = 'name' | 'completed' | 'firstTimeFix' | 'response' | 'sla';

const PRIORITY_TONES: Record<string, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };
const STATUS_TONES: Record<string, string> = { Open: 'blue', 'In Progress': 'orange', 'On Hold': 'pink', Completed: 'green', Overdue: 'red' };

/** Reports & Analytics > Maintenance Analytics: cost, work orders, PM compliance, reliability, backlog and technicians. */
@Component({
  standalone: true,
  selector: 'app-ra-maintenance-analytics',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, GaugeChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  templateUrl: './maintenance-analytics.html',
  styleUrls: ['../shared/analytics-page.css', '../asset-performance/kit/ra-page.css', './maintenance-analytics.css']
})
export class MaintenanceAnalyticsPage extends ScopedAnalyticsPage {
  private readonly router = inject(Router);
  readonly icons = { House, RefreshCw, GitCompareArrows, Download, Bookmark, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown };
  readonly maintenanceTypes = MAINTENANCE_TYPES;
  readonly pmTarget = PM_TARGET;
  readonly deltas = MA_DELTAS;
  readonly colors = RA_COLORS;
  readonly rowMenu = ['View details', 'Escalate'];
  readonly costFormat = (v: number) => `AED ${compactNumber(v)}`;
  readonly percentFormat = (v: number) => `${v}%`;
  protected readonly fileStem = 'maintenance-analytics';

  maintenanceType = ALL_MAINTENANCE_TYPES;
  view!: MaintenanceView;
  insights: RaInsight[] = [];
  backlogSort: BacklogSortKey = 'priority';
  backlogDir: SortDir = -1;
  techSort: TechSortKey = 'completed';
  techDir: SortDir = -1;

  constructor() {
    super();
    this.recompute();
  }

  recompute(): void {
    const v = buildMaintenance(this.scope, this.period, this.maintenanceType, this.compare);
    this.view = v;
    this.kpis = [
      { id: 'cost', label: 'Maintenance Cost', value: money(v.cost), delta: MA_DELTAS.cost, lowerIsBetter: true, icon: Wrench, tone: 'purple' },
      { id: 'open', label: 'Open Work Orders', value: String(v.open), delta: MA_DELTAS.open, lowerIsBetter: true, icon: FileText, tone: 'blue' },
      { id: 'pm', label: 'Preventive Compliance', value: percent(v.pmCompliance), delta: MA_DELTAS.pm, icon: ShieldCheck, tone: 'green' },
      { id: 'mttr', label: 'MTTR', value: `${v.mttr} hrs`, delta: MA_DELTAS.mttr, lowerIsBetter: true, icon: Clock, tone: 'orange' },
      { id: 'mtbf', label: 'MTBF', value: `${v.mtbf.toLocaleString('en-US')} hrs`, delta: MA_DELTAS.mtbf, icon: Settings, tone: 'purple' }
    ];
    this.insights = this.buildInsights(v);
  }

  private buildInsights(v: MaintenanceView): RaInsight[] {
    const overrun = v.emergencyTarget ? Math.round((v.emergencyCost / v.emergencyTarget - 1) * 100) : 0;
    return [
      {
        id: 'overdue', tone: v.overdue.length ? 'red' : 'green', icon: TriangleAlert, title: `${v.overdue.length} overdue work orders`,
        text: v.overdue.length ? 'Work orders are past due and require immediate attention.' : 'Nothing is past its due date.',
        actions: [{ id: 'overdue-view', label: 'View work orders' }, { id: 'overdue-plan', label: 'Create action plan', primary: true }]
      },
      {
        id: 'emergency', tone: overrun > 0 ? 'orange' : 'green', icon: ChartColumn,
        title: overrun > 0 ? `Emergency maintenance cost is ${overrun}% above target` : 'Emergency maintenance cost is within target',
        text: `Current period emergency costs are ${money(v.emergencyCost)} against a target of ${money(v.emergencyTarget)}.`,
        actions: [{ id: 'emergency-view', label: 'View details' }, { id: 'emergency-plan', label: 'Create action plan', primary: true }]
      },
      {
        id: 'failure', tone: 'purple', icon: Settings, title: `${v.nearFailure.length} assets approaching failure threshold`,
        text: 'Assets show high risk of failure within 7 days based on condition and maintenance history.',
        actions: [{ id: 'failure-view', label: 'View assets' }, { id: 'failure-plan', label: 'Create action plan', primary: true }]
      },
      {
        id: 'parts', tone: 'blue', icon: Package, title: `Spare parts availability affecting ${v.waitingParts.length} work orders`,
        text: 'Required parts are unavailable, causing delays in maintenance completion.',
        actions: [{ id: 'parts-view', label: 'View work orders' }, { id: 'parts-inventory', label: 'Open inventory', primary: true }]
      }
    ];
  }

  // ----- Saved views include the maintenance type -----
  protected override snapshot(): Record<string, string> {
    return { ...super.snapshot(), maintenanceType: this.maintenanceType };
  }

  protected override restoreFilters(f: Record<string, string>): void {
    super.restoreFilters(f);
    this.maintenanceType = f['maintenanceType'] ?? ALL_MAINTENANCE_TYPES;
  }

  override resetFilters(): void {
    this.maintenanceType = ALL_MAINTENANCE_TYPES;
    super.resetFilters();
  }

  get typeLabels(): string[] {
    return this.view.typeSeries.map((s) => s.name);
  }

  // ----- Tables -----
  get backlogRows(): RaWorkOrder[] {
    const dir = this.backlogDir;
    const key = this.backlogSort;
    const value = (o: RaWorkOrder): string | number =>
      key === 'priority' ? PRIORITY_RANK[o.priority] * 1000 + o.ageDays : key === 'age' ? o.ageDays : key === 'asset' ? o.asset.name
        : key === 'location' ? o.asset.site.name : key === 'technician' ? o.technician : key === 'status' ? o.status : o.id;
    return [...this.view.backlog]
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
      })
      .slice(0, 5);
  }

  get technicianRows(): TechnicianRow[] {
    return sortRows(this.view.technicians, this.techSort, this.techDir).slice(0, 5);
  }

  sortBacklog(key: BacklogSortKey): void {
    this.backlogDir = this.backlogSort === key ? (this.backlogDir === 1 ? -1 : 1) : key === 'priority' || key === 'age' ? -1 : 1;
    this.backlogSort = key;
  }

  sortTechs(key: TechSortKey): void {
    this.techDir = this.techSort === key ? (this.techDir === 1 ? -1 : 1) : key === 'name' || key === 'response' ? 1 : -1;
    this.techSort = key;
  }

  backlogIcon(key: BacklogSortKey) {
    return this.backlogSort !== key ? this.icons.ArrowUpDown : this.backlogDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  techIcon(key: TechSortKey) {
    return this.techSort !== key ? this.icons.ArrowUpDown : this.techDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  priorityTone(p: string): string {
    return PRIORITY_TONES[p] ?? 'grey';
  }

  statusTone(s: string): string {
    return STATUS_TONES[s] ?? 'grey';
  }

  ageTone(days: number): string {
    return days > 14 ? 'red' : days > 7 ? 'orange' : 'green';
  }

  rateColor(v: number): string {
    return v >= 85 ? '#10b981' : v >= 75 ? '#f59e0b' : '#ef4444';
  }

  rowAction(item: string, o: RaWorkOrder): void {
    if (item === 'Escalate') this.openAction('Action plan', `Escalate ${o.id} – ${o.asset.name}`, `${o.type} · ${o.status} · ${o.ageDays} days old · assigned to ${o.technician}`, 'High');
    else this.showOrder(o);
  }

  showOrder(o: RaWorkOrder): void {
    this.openDetail(
      {
        title: o.id,
        subtitle: `${o.type} maintenance · ${o.asset.name}`,
        fields: [
          { label: 'Asset', value: `${o.asset.name} (${o.asset.id})` },
          { label: 'Location', value: o.asset.site.name },
          { label: 'Priority', value: o.priority },
          { label: 'Status', value: o.status },
          { label: 'Created', value: o.created },
          { label: 'Age', value: `${o.ageDays} days` },
          { label: 'Assigned to', value: o.technician },
          { label: 'Cost', value: money(o.cost) },
          { label: 'Downtime', value: `${o.downtimeHours} hrs (${o.cause})` }
        ],
        primary: o.status === 'Completed' ? undefined : 'Escalate'
      },
      { kind: 'Action plan', title: `Escalate ${o.id} – ${o.asset.name}`, context: `${o.type} · ${o.status} · ${o.ageDays} days old`, priority: 'High' }
    );
  }

  showTechnician(t: TechnicianRow): void {
    const done = this.view.orders.filter((o) => o.status === 'Completed' && o.technician === t.name);
    this.records = this.orderRecords(`Completed by ${t.name}`, `First-time fix ${t.firstTimeFix}% · SLA compliance ${t.sla}%`, done,
      `work-orders-${t.name.toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  openBacklog(): void {
    this.records = this.orderRecords('Maintenance backlog', 'All work orders not yet completed, highest priority first.', this.view.backlog, 'maintenance-backlog.csv');
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const v = this.view;
    switch (id) {
      case 'overdue-view':
        this.records = this.orderRecords('Overdue work orders', 'Past their due date, oldest first.', v.overdue, 'overdue-work-orders.csv');
        break;
      case 'overdue-plan':
        this.openAction('Action plan', `Clear ${v.overdue.length} overdue work orders`, this.orderList(v.overdue), 'Critical');
        break;
      case 'emergency-view':
        this.records = this.emergencyRecords();
        break;
      case 'emergency-plan':
        this.openAction('Action plan', 'Reduce emergency maintenance spend', `Emergency cost ${money(v.emergencyCost)} vs target ${money(v.emergencyTarget)}.`, 'High');
        break;
      case 'failure-view':
        this.records = this.assetRecords(v.nearFailure);
        break;
      case 'failure-plan':
        this.openAction('Action plan', `Prevent failure of ${v.nearFailure.length} high-risk assets`, v.nearFailure.map((a) => a.name).join(', ') || 'No assets in this view.', 'Critical');
        break;
      case 'parts-view':
        this.records = this.orderRecords('Work orders waiting for spare parts', 'On hold until the required parts arrive.', v.waitingParts, 'work-orders-waiting-for-parts.csv');
        break;
      case 'parts-inventory':
        this.router.navigate([this.basePath, 'inventory-analytics']);
        break;
    }
  }

  private orderList(list: RaWorkOrder[]): string {
    const ids = list.slice(0, 5).map((o) => o.id).join(', ');
    return list.length > 5 ? `${ids} and ${list.length - 5} more.` : ids ? `${ids}.` : 'No work orders in this view.';
  }

  private orderRecords(title: string, subtitle: string, list: RaWorkOrder[], file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Work Order' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'asset', label: 'Asset' },
        { key: 'location', label: 'Location' }, { key: 'age', label: 'Age (days)', num: true }, { key: 'technician', label: 'Assigned To' },
        { key: 'status', label: 'Status' }, { key: 'cost', label: 'Cost (AED)', num: true }
      ],
      rows: list.map((o) => ({
        id: o.id, type: o.type, priority: o.priority, asset: o.asset.name, location: o.asset.site.name, age: o.ageDays, technician: o.technician, status: o.status, cost: o.cost
      })),
      file
    };
  }

  private assetRecords(list: RaAsset[]): RaRecords {
    return {
      title: `Assets approaching failure threshold (${list.length})`,
      subtitle: 'Predicted to fail within 7 days by the predictive model.',
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'risk', label: 'Risk Score', num: true },
        { key: 'rul', label: 'Remaining Life (hrs)', num: true }, { key: 'health', label: 'Health', num: true }, { key: 'owner', label: 'Owner' }
      ],
      rows: list.map((a) => ({ id: a.id, name: a.name, location: a.site.name, risk: a.riskScore, rul: a.rulHours, health: a.health, owner: a.owner })),
      file: 'assets-approaching-failure.csv'
    };
  }

  private emergencyRecords(): RaRecords {
    const v = this.view;
    const emergency = v.monthlyEmergency;
    const totals = v.monthlyTotal;
    const ratio = v.emergencyCost ? v.emergencyTarget / v.emergencyCost : 0;
    return {
      title: 'Emergency maintenance cost vs target',
      subtitle: `Period total ${money(v.emergencyCost)} against a target of ${money(v.emergencyTarget)}.`,
      columns: [
        { key: 'month', label: 'Month' }, { key: 'emergency', label: 'Emergency (AED)', num: true }, { key: 'target', label: 'Target (AED)', num: true },
        { key: 'share', label: 'Share of spend %', num: true }
      ],
      rows: v.labels.map((l, i) => ({
        month: l.replace('\n', ' '),
        emergency: emergency[i],
        target: Math.round(emergency[i] * ratio),
        share: totals[i] ? Math.round((emergency[i] / totals[i]) * 1000) / 10 : 0
      })),
      file: 'emergency-cost-vs-target.csv'
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { cost: 'ma-cost', open: 'ma-status', pm: 'ma-pm', mttr: 'ma-reliability', mtbf: 'ma-reliability' };
    return targets[id] ?? 'ma-cost';
  }

  exportPage(): void {
    downloadCsv(
      'maintenance-work-orders.csv',
      ['Work Order', 'Type', 'Priority', 'Status', 'Asset ID', 'Asset', 'Location', 'Created', 'Age (days)', 'Assigned To', 'Cost (AED)', 'Repair (hrs)', 'Downtime (hrs)', 'Cause'],
      this.view.orders.map((o) => [
        o.id, o.type, o.priority, o.status, o.asset.id, o.asset.name, o.asset.site.name, o.created, o.ageDays, o.technician, o.cost, o.repairHours, o.downtimeHours, o.cause
      ])
    );
    this.notify(`Exported ${this.view.orders.length} work orders.`);
  }

  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    const series = (file: string, list: { name: string; values: number[] }[]) =>
      downloadCsv(file, ['Month', ...list.map((s) => s.name)], months.map((m, i) => [m, ...list.map((s) => s.values[i])]));
    switch (id) {
      case 'cost':
        series('maintenance-cost-trend.csv', v.costTrend);
        break;
      case 'types':
        downloadCsv('work-orders-by-type.csv', ['Type', 'Work Orders'], v.typeSeries.map((s, i) => [s.name, s.values[i]]));
        break;
      case 'status':
        downloadCsv('work-order-status.csv', ['Status', 'Work Orders'], v.statusSlices.map((s) => [s.name, s.value]));
        break;
      case 'pm':
        series('preventive-maintenance-compliance.csv', v.pmTrend);
        break;
      case 'reliability':
        series('mttr-vs-mtbf.csv', v.reliability);
        break;
      case 'downtime':
        series('downtime-by-cause.csv', v.downtimeByCause);
        break;
      case 'backlog':
        downloadCsv('maintenance-backlog.csv', ['Priority', 'Work Order', 'Asset', 'Location', 'Age (days)', 'Assigned To', 'Status'],
          v.backlog.map((o) => [o.priority, o.id, o.asset.name, o.asset.site.name, o.ageDays, o.technician, o.status]));
        break;
      case 'technicians':
        downloadCsv('technician-performance.csv', ['Technician', 'Completed', 'First-Time Fix %', 'Avg. Response (hrs)', 'SLA Compliance %'],
          v.technicians.map((t) => [t.name, t.completed, t.firstTimeFix, t.response, t.sla]));
        break;
    }
  }
}
