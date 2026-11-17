import { Component, Input, OnChanges } from '@angular/core';
import { RA_COLORS, niceMax } from './chart-utils';

export interface HBarRow {
  label: string;
  value: number;
  /** Text after the bar, e.g. "562 (45%)"; defaults to the value */
  display?: string;
  color?: string;
  /** Optional target drawn as a light track behind the bar */
  target?: number;
  targetDisplay?: string;
}

/** Horizontal bars with labels on the left and values on the right (distribution, target vs actual). */
@Component({
  selector: 'ra-hbar-chart',
  standalone: true,
  template: `
    <div class="hbars" [style.--label-w.px]="labelWidth">
      @for (r of rows; track r.label) {
        <div class="hbars__row">
          <span class="hbars__label">{{ r.label }}</span>
          <span class="hbars__track">
            @if (r.target !== undefined) {
              <i class="hbars__target" [style.width.%]="pct(r.target)"></i>
            }
            <i class="hbars__bar" [style.width.%]="pct(r.value)" [style.background]="r.color ?? color"></i>
          </span>
          <span class="hbars__value">
            {{ r.display ?? r.value }}
            @if (r.targetDisplay) { <em>{{ r.targetDisplay }}</em> }
          </span>
        </div>
      } @empty {
        <p class="chart__empty chart__empty--inline">No data</p>
      }
    </div>
  `,
  styleUrls: ['./charts.css']
})
export class HBarChart implements OnChanges {
  @Input({ required: true }) rows: HBarRow[] = [];
  @Input() max: number | null = null;
  @Input() color: string = RA_COLORS.purple;
  @Input() labelWidth = 110;

  private top = 1;

  ngOnChanges(): void {
    this.rows = this.rows ?? [];
    const top = this.max ?? niceMax(Math.max(1, ...this.rows.map((r) => Math.max(r.value || 0, r.target || 0))));
    this.top = Number.isFinite(top) && top > 0 ? top : 1;
  }

  pct(value: number): number {
    const pct = ((value || 0) / this.top) * 100;
    return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  }
}
