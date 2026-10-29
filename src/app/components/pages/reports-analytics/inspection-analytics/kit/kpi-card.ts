import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { ArrowDown, ArrowUp, Ellipsis, LucideAngularModule, LucideIconData } from 'lucide-angular';

/** Headline KPI card: icon, value, change vs previous period and a ⋯ menu. */
@Component({
  selector: 'app-ra-kpi-card',
  imports: [LucideAngularModule],
  template: `
    <div class="kpi rak-fill">
      <span class="kpi__icon" [attr.data-tone]="tone"><lucide-icon [img]="icon" [size]="24" /></span>
      <div class="kpi__body">
        <span class="kpi__label">{{ label }}</span>
        <strong class="kpi__value">{{ value }}</strong>
        @if (delta) {
          <span class="kpi__delta" [class.kpi__delta--bad]="!good">
            <lucide-icon [img]="up ? icons.ArrowUp : icons.ArrowDown" [size]="13" />{{ delta }}
            <small>{{ hint }}</small>
          </span>
        }
      </div>
      <div class="kpi__menu row-menu">
        <button type="button" class="icon-btn" [attr.aria-label]="label + ' options'" [attr.aria-expanded]="menuOpen" (click)="menuOpen = !menuOpen">
          <lucide-icon [img]="icons.Ellipsis" [size]="18" />
        </button>
        @if (menuOpen) {
          <div class="menu" role="menu">
            @for (item of menuItems; track item) {
              <button type="button" role="menuitem" (click)="choose(item)">{{ item }}</button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaKpiCard {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ArrowDown, ArrowUp, Ellipsis };

  @Input({ required: true }) icon!: LucideIconData;
  @Input() tone = 'purple';
  @Input({ required: true }) label = '';
  @Input({ required: true }) value = '';
  /** e.g. "+12.5%" */
  @Input() delta = '';
  /** Arrow direction */
  @Input() up = true;
  /** Green when the change is good for the business, red otherwise */
  @Input() good = true;
  @Input() hint = 'vs. previous period';
  @Input() menuItems = ['View details', 'Export CSV'];
  @Output() action = new EventEmitter<string>();

  menuOpen = false;

  choose(item: string): void {
    this.menuOpen = false;
    this.action.emit(item);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen = false;
  }
}
