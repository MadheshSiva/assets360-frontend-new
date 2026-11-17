import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  ArrowDown, ArrowUp, Box, Coins, Database, Ellipsis, GripVertical, LucideAngularModule, Minus, ShieldCheck, Wrench, X
} from 'lucide-angular';
import { CartesianChart, DonutChart, HBarChart, compactNumber } from '../../shared/charts';
import { IotSiteMap } from '../../iot-utilization-analytics/iot-site-map/iot-site-map';
import { AttentionAsset, LOADING_DATA, MetricKey, WidgetConfig, WidgetData } from '../interactive-dashboards.data';

const KPI_ICONS: Record<MetricKey, typeof Box> = {
  total_assets: Box,
  active_work_orders: Wrench,
  preventive_compliance: ShieldCheck,
  inventory_value: Database,
  maintenance_cost: Coins
};

/** One dashboard widget: renders the values the API worked out for it as a KPI card, chart, table, map or heatmap. */
@Component({
  selector: 'app-idb-widget',
  standalone: true,
  imports: [NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, HBarChart, IotSiteMap],
  templateUrl: './dashboard-widget.html',
  styleUrls: ['../../shared/analytics-page.css', './dashboard-widget.css']
})
export class DashboardWidget implements OnChanges {
  @Input({ required: true }) config!: WidgetConfig;
  /** Mapped from GET /{id}/data by the page; LOADING_DATA until it arrives */
  @Input() widgetData: WidgetData = LOADING_DATA;
  /** Compare Periods: show the previous-period figure on KPI cards */
  @Input() compare = false;
  @Input() editMode = false;
  /** Chart height; the Expand dialog renders the same widget larger */
  @Input() height = 220;
  /** Hide the head menu (used inside the Expand dialog) */
  @Input() bare = false;

  @Output() expand = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  @Output() resize = new EventEmitter<number>();
  @Output() viewAsset = new EventEmitter<AttentionAsset>();
  @Output() notice = new EventEmitter<string>();

  readonly icons = { ArrowDown, ArrowUp, Ellipsis, GripVertical, Minus, X };
  data: WidgetData = { empty: true };
  menuOpen = false;
  rowMenu: string | null = null;

  ngOnChanges(): void {
    const data = this.widgetData ?? LOADING_DATA;
    // KPI cards keep their card shape while loading or when the figure could not be worked out
    this.data = this.config.type === 'kpi' && !data.kpi
      ? { ...data, kpi: { value: data.loading ? '…' : '—', prev: '—', delta: null, unit: '%', good: true, tone: 'purple' } }
      : data;
  }

  get kpiIcon(): typeof Box {
    return KPI_ICONS[this.config.metric] ?? Box;
  }

  get format(): (v: number) => string {
    return this.data.format ?? compactNumber;
  }

  get heatColumns(): string {
    return `minmax(110px, 1.4fr) repeat(${this.data.heat?.cols.length ?? 1}, minmax(34px, 1fr))`;
  }

  /** Purple scale relative to the largest count: 0 → pale, max → full brand purple */
  private heatAlpha(v: number): number {
    const max = this.data.heat?.max || 1;
    return Math.max(0.06, Math.min(1, v / max));
  }

  heatBackground(v: number): string {
    return `rgba(91, 42, 168, ${this.heatAlpha(v).toFixed(2)})`;
  }

  heatText(v: number): string {
    return this.heatAlpha(v) >= 0.55 ? '#fff' : '#1e1b2e';
  }

  scoreTone(score: number | null): string {
    if (score === null) return 'grey';
    return score < 40 ? 'red' : score < 70 ? 'orange' : 'green';
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.rowMenu = null;
    this.menuOpen = !this.menuOpen;
  }

  toggleRowMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = false;
    this.rowMenu = this.rowMenu === id ? null : id;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = false;
    this.rowMenu = null;
  }

  act(kind: 'expand' | 'export' | 'remove' | 'wider' | 'narrower'): void {
    this.menuOpen = false;
    if (kind === 'expand') this.expand.emit();
    else if (kind === 'export') this.exportCsv.emit();
    else if (kind === 'remove') this.remove.emit();
    else this.resize.emit(kind === 'wider' ? 1 : -1);
  }

  rowAction(a: AttentionAsset, action: string): void {
    this.rowMenu = null;
    // No work order / inspection endpoint in the Report Analytics API: stays a client-side notice
    this.notice.emit(`DEMO MODE: ${action} for ${a.name} (${a.id}).`);
  }
}
