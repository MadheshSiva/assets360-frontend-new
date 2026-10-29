import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule, LucideIconData } from 'lucide-angular';
import { KPI_MENU, RaMenu } from './ra-menu';

export type RaTone = 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'pink';

export interface RaKpi {
  id: string;
  label: string;
  value: string;
  /** Change vs the previous period, in % */
  delta: number;
  /** A falling value is good news (e.g. open work orders, MTTR) */
  lowerIsBetter?: boolean;
  icon: LucideIconData;
  tone: RaTone;
}

export interface RaInsightAction {
  id: string;
  label: string;
  primary?: boolean;
}

export interface RaInsight {
  id: string;
  tone: RaTone;
  icon: LucideIconData;
  title: string;
  text: string;
  actions: RaInsightAction[];
}

/** KPI card: icon, value, change vs previous period and a ⋯ menu. */
@Component({
  selector: 'ra-kpi-card',
  standalone: true,
  imports: [LucideAngularModule, RaMenu],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="kpi">
      <span class="kpi__icon" [attr.data-tone]="kpi.tone"><lucide-icon [img]="kpi.icon" [size]="24" /></span>
      <div class="kpi__body">
        <span class="kpi__label">{{ kpi.label }}</span>
        <strong class="kpi__value">{{ kpi.value }}</strong>
        <span class="kpi__delta" [class.kpi__delta--bad]="!good">
          <lucide-icon [img]="kpi.delta < 0 ? icons.ArrowDown : icons.ArrowUp" [size]="13" />
          {{ deltaText }} <small>vs. previous period</small>
        </span>
      </div>
      <ra-menu class="kpi__menu" [items]="menu" [label]="kpi.label + ' actions'" (select)="action.emit($event)" />
    </div>
  `
})
export class RaKpiCard {
  readonly icons = { ArrowDown, ArrowUp };
  readonly menu = KPI_MENU;
  @Input({ required: true }) kpi!: RaKpi;
  @Output() action = new EventEmitter<string>();

  get good(): boolean {
    return this.kpi.lowerIsBetter ? this.kpi.delta <= 0 : this.kpi.delta >= 0;
  }

  get deltaText(): string {
    return `${this.kpi.delta > 0 ? '+' : ''}${Number(this.kpi.delta.toFixed(1))}%`;
  }
}

/** One card in the insights column. */
@Component({
  selector: 'ra-insight-card',
  standalone: true,
  imports: [LucideAngularModule],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <article class="insight" [attr.data-tone]="insight.tone">
      <div class="insight__head">
        <lucide-icon class="insight__icon" [img]="insight.icon" [size]="26" />
        <div>
          <h3>{{ insight.title }}</h3>
          <p>{{ insight.text }}</p>
        </div>
      </div>
      <div class="insight__actions">
        @for (a of insight.actions; track a.id) {
          <button type="button" class="btn btn--sm" [class.btn--primary]="a.primary" [class.btn--outline]="!a.primary" (click)="action.emit(a.id)">
            {{ a.label }}
          </button>
        }
      </div>
    </article>
  `
})
export class RaInsightCard {
  @Input({ required: true }) insight!: RaInsight;
  @Output() action = new EventEmitter<string>();
}
