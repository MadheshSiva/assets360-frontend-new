import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { ArrowDown, ArrowUp, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { KpiCardData } from './ra-parts';

export type KpiMenuAction = 'details' | 'export';

/** KPI card: icon, value, change vs previous period and a ⋯ menu (View details / Export CSV). */
@Component({
  selector: 'ra-c-kpi',
  imports: [LucideAngularModule],
  template: `
    <article class="kpi">
      <span class="kpi__icon" [attr.data-tone]="kpi.tone">
        <lucide-icon [img]="kpi.icon" [size]="24"></lucide-icon>
      </span>
      <div class="kpi__body">
        <span class="kpi__label">{{ kpi.label }}</span>
        <strong class="kpi__value">{{ kpi.value }}</strong>
        <span class="kpi__delta" [class.kpi__delta--bad]="isBad">
          <lucide-icon [img]="kpi.delta < 0 ? icons.ArrowDown : icons.ArrowUp" [size]="13"></lucide-icon>
          {{ deltaText }}
          <small>vs. previous period</small>
        </span>
        @if (compare) {
          <span class="rac-kpi-prev">Previous: {{ kpi.previous }}</span>
        }
      </div>
      <div class="kpi__menu row-menu">
        <button type="button" class="icon-btn" [attr.aria-label]="kpi.label + ' options'" [attr.aria-expanded]="menuOpen" (click)="menuOpen = !menuOpen">
          <lucide-icon [img]="icons.Ellipsis" [size]="16"></lucide-icon>
        </button>
        @if (menuOpen) {
          <div class="menu" role="menu">
            <button type="button" role="menuitem" (click)="pick('details')">View details</button>
            <button type="button" role="menuitem" (click)="pick('export')">Export CSV</button>
          </div>
        }
      </div>
    </article>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaKpiCard {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) kpi!: KpiCardData;
  @Input() compare = false;
  @Output() action = new EventEmitter<KpiMenuAction>();

  readonly icons = { ArrowUp, ArrowDown, Ellipsis };
  menuOpen = false;

  get isBad(): boolean {
    return this.kpi.delta !== 0 && this.kpi.delta > 0 !== this.kpi.goodWhenUp;
  }

  get deltaText(): string {
    return `${this.kpi.delta > 0 ? '+' : ''}${this.kpi.delta.toFixed(1)}%`;
  }

  pick(a: KpiMenuAction): void {
    this.menuOpen = false;
    this.action.emit(a);
  }

  @HostListener('document:click', ['$event'])
  closeOutside(e: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(e.target as Node)) this.menuOpen = false;
  }
}
