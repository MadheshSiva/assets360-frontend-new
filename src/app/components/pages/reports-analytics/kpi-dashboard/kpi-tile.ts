import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { ArrowDown, ArrowUp, Ellipsis, Info, LucideAngularModule, LucideIconData } from 'lucide-angular';
import { Sparkline } from '../shared/charts';
import { KpiState, STATUS_TONE } from './kpi-dashboard.data';

const SPARK_COLORS: Record<string, string> = { green: '#10b981', orange: '#f59e0b', red: '#ef4444', pink: '#ec4899', grey: '#94a3b8' };

/** KPI tile: value, target and variance, sparkline, change vs previous period and status. */
@Component({
  selector: 'app-ra-kpi-tile',
  imports: [LucideAngularModule, Sparkline],
  template: `
    <article class="kd-tile">
      <div class="kd-tile__top">
        <span class="kpi__icon" [attr.data-tone]="tone"><lucide-icon [img]="icon" [size]="22" /></span>
        <div class="kd-tile__main">
          <span class="kd-tile__name">
            {{ state.def.name }}
            <span class="widget__info" [title]="state.def.info"><lucide-icon [img]="icons.Info" [size]="13" /></span>
          </span>
          <strong class="kd-tile__value">{{ state.valueText }}</strong>
          <span class="kd-tile__target">{{ state.targetText }} <span class="muted">|</span> <b [class.kd-bad]="!onTarget">{{ state.varianceText }}</b></span>
        </div>
        <div class="row-menu kd-tile__menu">
          <button type="button" class="icon-btn" [attr.aria-label]="state.def.name + ' options'" [attr.aria-expanded]="menuOpen" (click)="menuOpen = !menuOpen">
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
      <div class="kd-tile__spark"><ra-sparkline [values]="state.spark" [color]="sparkColor" [width]="96" [height]="30" [area]="true" /></div>
      <div class="kd-tile__foot">
        <span class="kpi__delta" [class.kpi__delta--bad]="!state.changeGood">
          <lucide-icon [img]="state.changeUp ? icons.ArrowUp : icons.ArrowDown" [size]="13" />{{ state.changeText }}
          <small>vs. previous period</small>
        </span>
        <span class="pill" [attr.data-tone]="statusTone"><i></i>{{ state.status }}</span>
      </div>
    </article>
  `,
  styleUrls: ['../shared/analytics-page.css', './kpi-dashboard.css']
})
export class KpiTile {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ArrowDown, ArrowUp, Ellipsis, Info };
  readonly menuItems = ['View details', 'Edit KPI', 'Hide tile', 'Export CSV'];

  @Input({ required: true }) state!: KpiState;
  @Input({ required: true }) icon!: LucideIconData;
  @Input() tone = 'purple';
  @Output() action = new EventEmitter<string>();

  menuOpen = false;

  get onTarget(): boolean {
    return this.state.status === 'On Track';
  }

  get statusTone(): string {
    return STATUS_TONE[this.state.status];
  }

  get sparkColor(): string {
    return SPARK_COLORS[this.statusTone] ?? '#5b2aa8';
  }

  choose(item: string): void {
    this.menuOpen = false;
    this.action.emit(item);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen = false;
  }
}
