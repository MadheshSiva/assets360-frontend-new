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
    this.top = this.max ?? niceMax(Math.max(1, ...this.rows.map((r) => Math.max(r.value, r.target ?? 0))));
  }

  pct(value: number): number {
    return Math.min(100, (value / this.top) * 100);
  }
}
