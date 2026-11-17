import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { WidgetDragHandle } from '../shared/widget-drag-handle/widget-drag-handle';
import { loadOrder, saveOrder, reorderByKey, moveWithinVisible } from '../shared/dashboard-widgets/widget-order.util';

interface WipStatCard {
  label: string;
  value: number;
  icon: string;
  trend: 'up' | 'down' | 'neutral';
  delta: string;
}

interface WipStatusDistribution {
  label: string;
  percent: number;
  color: string;
}

interface WipAlert {
  title: string;
  subtitle: string;
  time: string;
  type: 'warning' | 'danger';
}

interface WipActiveJob {
  id: string;
  asset: string;
  status: string;
  statusClass: string;
  progress: number;
  assignedTo: string;
  eta: string;
}

@Component({
  standalone: true,
  selector: 'app-wip-dashboard',
  imports: [CommonModule, DragDropModule, WidgetDragHandle],
  templateUrl: './wip-dashboard.html',
  styleUrls: ['./wip-dashboard.css'],
})
export class WipDashboard {
  /** Widget ids (see WIDGET_CATALOG 'wip') the user chose to show. */
  @Input() selected: string[] = [];

  // ===== Widget drag-and-drop ordering =====
  readonly midOrder: string[] = loadOrder('piq.dashboard.wip.midOrder', ['donut', 'trend']);
  readonly bottomOrder: string[] = loadOrder('piq.dashboard.wip.bottomOrder', ['alerts', 'jobs']);

  trackByWidgetId = (_: number, id: string) => id;

  has(id: string): boolean {
    return this.selected.includes(id);
  }

  visible(order: string[]): string[] {
    return order.filter((id) => this.has(id));
  }

  get visibleStatCards(): WipStatCard[] {
    return this.wipStatCards.filter((c) => this.has('stat:' + c.label));
  }

  onStatCardDrop(event: CdkDragDrop<WipStatCard[]>): void {
    moveWithinVisible(this.wipStatCards, (c) => this.has('stat:' + c.label), event.previousIndex, event.currentIndex);
    saveOrder('piq.dashboard.wip.statOrder', this.wipStatCards.map((c) => c.label));
  }

  onMidDrop(event: CdkDragDrop<string[]>): void {
    moveWithinVisible(this.midOrder, (id) => this.has(id), event.previousIndex, event.currentIndex);
    saveOrder('piq.dashboard.wip.midOrder', this.midOrder);
  }

  onBottomDrop(event: CdkDragDrop<string[]>): void {
    moveWithinVisible(this.bottomOrder, (id) => this.has(id), event.previousIndex, event.currentIndex);
    saveOrder('piq.dashboard.wip.bottomOrder', this.bottomOrder);
  }

  /** Stat card layout (labels, icons); values stay 0 until the WIP API is wired. */
  wipStatCards: WipStatCard[] = reorderByKey([
    { label: 'Total Jobs', value: 0, icon: 'jobs', trend: 'neutral', delta: '' },
    { label: 'In Progress', value: 0, icon: 'progress', trend: 'neutral', delta: '' },
    { label: 'Completed today', value: 0, icon: 'completed', trend: 'neutral', delta: '' },
    { label: 'SLA Breached', value: 0, icon: 'sla', trend: 'neutral', delta: '' },
    { label: 'Planned', value: 0, icon: 'planned', trend: 'neutral', delta: '' },
  ], 'piq.dashboard.wip.statOrder', (c) => c.label);

  wipTotalJobs = 0;

  private readonly iconClassMap: Record<string, string> = {
    jobs: 'icon-purple',
    progress: 'icon-blue',
    completed: 'icon-green',
    sla: 'icon-red',
    planned: 'icon-orange',
  };

  getIconClass(icon: string): string {
    return this.iconClassMap[icon] || 'icon-purple';
  }

  wipStatusDistribution: WipStatusDistribution[] = [];

  /** Completion trend as SVG points in the 420x180 chart (y = 0 is 100%). Empty until the WIP API is wired. */
  wipTrendPoints: { x: number; y: number }[] = [];

  wipAlerts: WipAlert[] = [];

  wipActiveJobs: WipActiveJob[] = [];

  /** Donut segments from the distribution; grey ring when there is no data. */
  get donutGradient(): string {
    let acc = 0;
    const stops = this.wipStatusDistribution.map((s) => {
      const stop = `${s.color} ${acc}% ${acc + s.percent}%`;
      acc += s.percent;
      return stop;
    });
    return acc > 0 ? `conic-gradient(${stops.join(', ')}, #ede9f4 ${acc}% 100%)` : '#ede9f4';
  }

  get trendLine(): string {
    return this.wipTrendPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  }

  get trendArea(): string {
    const pts = this.wipTrendPoints;
    return pts.length ? `${this.trendLine} L${pts[pts.length - 1].x},180 L${pts[0].x},180 Z` : '';
  }
}
