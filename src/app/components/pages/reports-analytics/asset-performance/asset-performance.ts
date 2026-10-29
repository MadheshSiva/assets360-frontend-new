import { Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Box, Calendar, ChartColumn, Clock, Download, GitCompareArrows, GripVertical, Heart, House, Info,
  LucideAngularModule, RefreshCw, Settings, ShieldCheck, TriangleAlert, Wrench
} from 'lucide-angular';
import { downloadCsv, percent } from '../shared/analytics-common';
import { CartesianChart, HBarChart } from '../shared/charts';
import { RaAsset } from './kit/asset-universe';
import { RaInsight, RaInsightCard, RaKpiCard } from './kit/ra-cards';
import { RaActionDialog, RaDetailDialog, RaExpandDialog, RaRecords, RaRecordsDialog, RaSaveViewDialog } from './kit/ra-dialogs';
import { RaMenu } from './kit/ra-menu';
import { ScopedAnalyticsPage, SortDir, sortRows } from './kit/scoped-page';
import { AP_DELTAS, ApAssetRow, ApLocationRow, AssetPerformanceView, UTILIZATION_TARGET, buildAssetPerformance } from './asset-performance.data';

type AssetSortKey = 'id' | 'name' | 'location' | 'health' | 'utilization' | 'availability';
type LocationSortKey = 'name' | 'health' | 'utilization' | 'availability';

const ALL_ASSETS_VIEW = 'All Assets';

/** Reports & Analytics > Asset Performance: health, utilization, reliability, downtime and asset ranking. */
@Component({
  standalone: true,
  selector: 'app-ra-asset-performance',
  imports: [
    FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, CartesianChart, HBarChart, RaMenu, RaKpiCard, RaInsightCard,
    RaRecordsDialog, RaDetailDialog, RaActionDialog, RaSaveViewDialog, RaExpandDialog
  ],
  templateUrl: './asset-performance.html',
  styleUrls: ['../shared/analytics-page.css', './kit/ra-page.css', './asset-performance.css']
})
export class AssetPerformancePage extends ScopedAnalyticsPage {
  readonly icons = {
    House, RefreshCw, GitCompareArrows, Download, Bookmark, ChartColumn, Calendar, GripVertical, Info, ArrowUp, ArrowDown, ArrowUpDown, Settings, Clock
  };
  readonly rowMenu = ['View details', 'Create work order'];
  readonly percentFormat = (v: number) => `${v}%`;
  readonly utilizationTarget = UTILIZATION_TARGET;
  readonly deltas = AP_DELTAS;
  protected readonly fileStem = 'asset-performance';

  view!: AssetPerformanceView;
  insights: RaInsight[] = [];
  currentView = ALL_ASSETS_VIEW;
  assetSort: AssetSortKey = 'health';
  assetDir: SortDir = -1;
  locationSort: LocationSortKey = 'health';
  locationDir: SortDir = -1;

  constructor() {
    super();
    this.views = [{ name: ALL_ASSETS_VIEW, filters: this.snapshot() }];
    this.recompute();
  }

  recompute(): void {
    const v = buildAssetPerformance(this.scope, this.period, this.compare);
    this.view = v;
    this.kpis = [
      { id: 'total', label: 'Total Assets', value: v.total.toLocaleString('en-US'), delta: AP_DELTAS.total, icon: Box, tone: 'purple' },
      { id: 'health', label: 'Average Health Score', value: `${v.health}%`, delta: AP_DELTAS.health, icon: Heart, tone: 'blue' },
      { id: 'utilization', label: 'Utilization Rate', value: `${v.utilization}%`, delta: AP_DELTAS.utilization, icon: ChartColumn, tone: 'orange' },
      { id: 'availability', label: 'Availability', value: percent(v.availability), delta: AP_DELTAS.availability, icon: ShieldCheck, tone: 'green' },
      { id: 'mtbf', label: 'MTBF', value: `${v.mtbf.toLocaleString('en-US')} hrs`, delta: AP_DELTAS.mtbf, icon: Settings, tone: 'purple' }
    ];
    this.insights = this.buildInsights(v);
  }

  private buildInsights(v: AssetPerformanceView): RaInsight[] {
    const low = v.lowUtilization;
    return [
      v.critical.length
        ? {
            id: 'critical', tone: 'red', icon: TriangleAlert, title: `${v.critical.length} assets below health threshold`,
            text: 'Assets with health score < 40 require immediate attention.',
            actions: [{ id: 'critical-view', label: 'View assets' }, { id: 'critical-wo', label: 'Create work order', primary: true }]
          }
        : { id: 'critical', tone: 'green', icon: ShieldCheck, title: 'No assets below health threshold', text: 'Every asset in this view scores 40 or more.', actions: [] },
      v.intervention.length
        ? {
            id: 'intervention', tone: 'orange', icon: Wrench, title: `Maintenance intervention recommended for ${v.intervention.length} asset${v.intervention.length === 1 ? '' : 's'}`,
            text: 'Based on usage, condition and predicted failures: health 40–49 while running above 80% utilization.',
            actions: [{ id: 'intervention-view', label: 'View assets' }, { id: 'intervention-wo', label: 'Create work order', primary: true }]
          }
        : { id: 'intervention', tone: 'green', icon: Wrench, title: 'No maintenance intervention needed', text: 'No heavily used asset in this view is losing condition.', actions: [] },
      low.length
        ? {
            id: 'utilization', tone: 'blue', icon: ChartColumn, title: `Utilization below target in ${low.length} location${low.length === 1 ? '' : 's'}`,
            text: `Average utilization is below ${UTILIZATION_TARGET}% in ${this.joinNames(low.map((l) => l.name))}.`,
            actions: [{ id: 'utilization-view', label: 'View locations' }]
          }
        : {
            id: 'utilization', tone: 'green', icon: ChartColumn, title: 'All locations meet the utilization target',
            text: `Every location in this view averages ${UTILIZATION_TARGET}% utilization or more.`, actions: [{ id: 'utilization-view', label: 'View locations' }]
          }
    ];
  }

  private joinNames(names: string[]): string {
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  }

  // ----- Saved views -----
  override confirmSaveView(name: string): void {
    super.confirmSaveView(name);
    this.currentView = name;
  }

  // ----- Tables -----
  get assetRows(): ApAssetRow[] {
    return sortRows(this.view.topBottom, this.assetSort, this.assetDir);
  }

  get locationRows(): ApLocationRow[] {
    return sortRows(this.view.locations, this.locationSort, this.locationDir);
  }

  sortAssets(key: AssetSortKey): void {
    this.assetDir = this.assetSort === key ? (this.assetDir === 1 ? -1 : 1) : key === 'id' || key === 'name' || key === 'location' ? 1 : -1;
    this.assetSort = key;
  }

  sortLocations(key: LocationSortKey): void {
    this.locationDir = this.locationSort === key ? (this.locationDir === 1 ? -1 : 1) : key === 'name' ? 1 : -1;
    this.locationSort = key;
  }

  assetSortIcon(key: AssetSortKey) {
    return this.assetSort !== key ? this.icons.ArrowUpDown : this.assetDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  locationSortIcon(key: LocationSortKey) {
    return this.locationSort !== key ? this.icons.ArrowUpDown : this.locationDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  scoreTone(score: number): string {
    return score >= 60 ? 'green' : score >= 40 ? 'orange' : 'red';
  }

  scoreColor(score: number): string {
    return score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : score >= 40 ? '#d97706' : '#dc2626';
  }

  meterColor(utilization: number): string {
    return utilization >= UTILIZATION_TARGET ? '#10b981' : utilization >= 65 ? '#f59e0b' : '#ef4444';
  }

  rowAction(item: string, row: ApAssetRow): void {
    if (item === 'Create work order') this.openAction('Work order', `Performance review – ${row.name}`, `${row.id} · ${row.location}`, row.health < 40 ? 'Critical' : 'Medium');
    else this.showAsset(row.asset);
  }

  showAsset(a: RaAsset): void {
    this.openDetail(
      {
        title: a.name,
        subtitle: `${a.id} · ${a.site.name}`,
        fields: [
          { label: 'Category', value: a.category },
          { label: 'Asset type', value: a.type },
          { label: 'Health score', value: `${a.health} / 100` },
          { label: 'Utilization', value: percent(a.utilization) },
          { label: 'Availability', value: percent(a.availability) },
          { label: 'MTBF', value: `${a.mtbf.toLocaleString('en-US')} hrs` },
          { label: 'Predictive risk', value: a.risk ? `${a.risk} (score ${a.riskScore})` : 'Not monitored' },
          { label: 'Owner', value: a.owner }
        ],
        primary: 'Create work order'
      },
      { kind: 'Work order', title: `Performance review – ${a.name}`, context: `${a.id} · ${a.site.name}`, priority: a.health < 40 ? 'Critical' : 'Medium' }
    );
  }

  showLocation(l: ApLocationRow): void {
    this.openDetail({
      title: l.name,
      subtitle: `${l.site.org} · site code ${l.site.code}`,
      fields: [
        { label: 'Assets', value: l.assets.toLocaleString('en-US') },
        { label: 'Average health score', value: l.health },
        { label: 'Utilization', value: `${l.utilization}% (target ${UTILIZATION_TARGET}%)` },
        { label: 'Availability', value: percent(l.availability) }
      ]
    });
  }

  // ----- Insights -----
  insightAction(id: string): void {
    const v = this.view;
    switch (id) {
      case 'critical-view':
        this.records = this.assetRecords('Assets below health threshold', 'Health score < 40, lowest first.', v.critical, 'assets-below-health-threshold.csv');
        break;
      case 'critical-wo':
        this.openAction('Work order', `Condition assessment – ${v.critical.length} critical assets`, this.assetList(v.critical), 'Critical');
        break;
      case 'intervention-view':
        this.records = this.assetRecords('Maintenance intervention recommended', 'Health 40–49 while running above 80% utilization.', v.intervention, 'maintenance-intervention.csv');
        break;
      case 'intervention-wo':
        this.openAction('Work order', `Preventive service – ${v.intervention.length} assets`, this.assetList(v.intervention), 'High');
        break;
      case 'utilization-view':
        this.records = {
          title: 'Utilization by location',
          subtitle: `Target ${UTILIZATION_TARGET}%. Lowest utilization first.`,
          columns: [
            { key: 'location', label: 'Location' }, { key: 'assets', label: 'Assets', num: true }, { key: 'utilization', label: 'Utilization %', num: true },
            { key: 'gap', label: 'Gap to target (pts)', num: true }, { key: 'availability', label: 'Availability %', num: true }
          ],
          rows: sortRows(v.locations, 'utilization', 1).map((l) => ({
            location: l.name, assets: l.assets, utilization: l.utilization, gap: l.utilization - UTILIZATION_TARGET, availability: l.availability
          })),
          file: 'utilization-by-location.csv'
        };
        break;
    }
  }

  private assetList(list: RaAsset[]): string {
    const names = list.slice(0, 4).map((a) => a.name).join(', ');
    return list.length > 4 ? `${names} and ${list.length - 4} more.` : `${names}.`;
  }

  private assetRecords(title: string, subtitle: string, list: RaAsset[], file: string): RaRecords {
    return {
      title: `${title} (${list.length})`,
      subtitle,
      columns: [
        { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Asset Name' }, { key: 'location', label: 'Location' }, { key: 'category', label: 'Category' },
        { key: 'health', label: 'Health', num: true }, { key: 'utilization', label: 'Utilization %', num: true }, { key: 'availability', label: 'Availability %', num: true },
        { key: 'owner', label: 'Owner' }
      ],
      rows: list.map((a) => ({
        id: a.id, name: a.name, location: a.site.name, category: a.category, health: a.health, utilization: a.utilization, availability: a.availability, owner: a.owner
      })),
      file
    };
  }

  // ----- Export -----
  protected kpiTarget(id: string): string {
    const targets: Record<string, string> = { total: 'ap-distribution', health: 'ap-trend', utilization: 'ap-category', availability: 'ap-reliability', mtbf: 'ap-reliability' };
    return targets[id] ?? 'ap-trend';
  }

  exportPage(): void {
    this.exportAssets();
    this.notify(`Exported ${this.view.total.toLocaleString('en-US')} assets.`);
  }

  private exportAssets(): void {
    const ranked = [...this.view.assets].sort((a, b) => b.health - a.health);
    downloadCsv(
      'asset-performance.csv',
      ['Rank', 'Asset ID', 'Asset Name', 'Location', 'Category', 'Asset Type', 'Health Score', 'Utilization %', 'Availability %', 'MTBF (hrs)'],
      ranked.map((a, i) => [i + 1, a.id, a.name, a.site.name, a.category, a.type, a.health, a.utilization, a.availability, a.mtbf])
    );
  }

  exportWidget(id: string): void {
    const v = this.view;
    const months = v.labels.map((l) => l.replace('\n', ' '));
    switch (id) {
      case 'trend':
        downloadCsv('asset-health-trend.csv', ['Month', ...v.healthTrend.map((s) => `${s.name} (%)`)], months.map((m, i) => [m, ...v.healthTrend.map((s) => s.values[i])]));
        break;
      case 'category':
        downloadCsv('utilization-by-category.csv', ['Category', ...v.categoryUtilization.map((s) => `${s.name} (%)`)],
          v.categoryLabels.map((l, i) => [l.split('\n')[0], ...v.categoryUtilization.map((s) => s.values[i])]));
        break;
      case 'distribution':
        downloadCsv('performance-score-distribution.csv', ['Band', 'Assets', 'Share'], v.distribution.map((r) => [r.label, r.value, r.display ?? '']));
        break;
      case 'reliability':
        downloadCsv('reliability-availability.csv', ['Month', ...v.reliability.map((s) => s.name)], months.map((m, i) => [m, ...v.reliability.map((s) => s.values[i])]));
        break;
      case 'downtime':
        downloadCsv('downtime-analysis.csv', ['Month', 'Planned (hrs)', 'Unplanned (hrs)'], months.map((m, i) => [m, v.downtime[0].values[i], v.downtime[1].values[i]]));
        break;
      case 'assets':
        this.exportAssets();
        break;
      case 'locations':
        downloadCsv('asset-performance-by-location.csv', ['Location', 'Assets', 'Avg Health Score', 'Utilization %', 'Availability %'],
          this.locationRows.map((l) => [l.name, l.assets, l.health, l.utilization, l.availability]));
        break;
    }
  }
}
