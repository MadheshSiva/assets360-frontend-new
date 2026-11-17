import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  ArrowDown, ArrowUp, Box, Coins, Database, Ellipsis, GripVertical, HeartPulse, LucideAngularModule, ShieldCheck, Wifi, Wrench, X
} from 'lucide-angular';
import { CartesianChart, DonutChart, HBarChart, compactNumber } from '../../shared/charts';
import { IotSiteMap } from '../../iot-utilization-analytics/iot-site-map/iot-site-map';
import { AttentionAsset, DashFilters, MetricKey, WidgetConfig, WidgetData, buildWidgetData } from '../interactive-dashboards.data';

const KPI_ICONS: Partial<Record<MetricKey, typeof Box>> = {
  'total-assets': Box,
  'active-work-orders': Wrench,
  'pm-compliance': ShieldCheck,
  'inventory-value': Database,
  'maintenance-cost': Coins,
  'health-score': HeartPulse,
  'connected-assets': Wifi,
  'compliance-score': ShieldCheck
};

/** One dashboard widget: renders its data source as a KPI card, chart, table, map or heatmap. */
@Component({
  selector: 'app-idb-widget',
  standalone: true,
  imports: [NgTemplateOutlet, LucideAngularModule, CartesianChart, DonutChart, HBarChart, IotSiteMap],
  templateUrl: './dashboard-widget.html',
  styleUrls: ['../../shared/analytics-page.css', './dashboard-widget.css']
})
export class DashboardWidget implements OnChanges {
  @Input({ required: true }) config!: WidgetConfig;
  @Input({ required: true }) filters!: DashFilters;
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

  readonly icons = { ArrowDown, ArrowUp, Ellipsis, GripVertical, X };
  data: WidgetData = { empty: true };
  menuOpen = false;
  rowMenu: string | null = null;

  ngOnChanges(): void {
    this.data = buildWidgetData(this.config, this.filters);
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

  /** Purple scale: 50% → pale, 100% → full brand purple */
  heatBackground(v: number): string {
    const alpha = Math.max(0.08, Math.min(1, (v - 50) / 50));
    return `rgba(91, 42, 168, ${alpha.toFixed(2)})`;
  }

  heatText(v: number): string {
    return v >= 78 ? '#fff' : '#1e1b2e';
  }

  scoreTone(score: number): string {
    return score < 50 ? 'red' : score < 65 ? 'orange' : 'green';
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
    this.notice.emit(`DEMO MODE: ${action} for ${a.name} (${a.id}).`);
  }
}
