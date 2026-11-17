import { Component, Input, OnChanges } from '@angular/core';
import { ChartSlice, ValueFormat, sum } from './chart-utils';

interface Arc {
  slice: ChartSlice;
  dash: string;
  offset: number;
  pct: number;
  labelX: number;
  labelY: number;
}

const R = 70;
const C = 2 * Math.PI * R;

/** Donut with the total (or any text) in the middle and an optional legend with value and share. */
@Component({
  selector: 'ra-donut-chart',
  standalone: true,
  template: `
    <div class="donut" [class.donut--bottom]="legend === 'bottom'">
      <div class="donut__ring" [style.width.px]="size" [style.height.px]="size">
        <svg viewBox="0 0 200 200" role="img" [attr.aria-label]="ariaLabel">
          <circle cx="100" cy="100" [attr.r]="r" fill="none" stroke="#eef0f5" [attr.stroke-width]="thickness" />
          @for (a of arcs; track a.slice.name) {
            <circle cx="100" cy="100" [attr.r]="r" fill="none" [attr.stroke]="a.slice.color" [attr.stroke-width]="thickness"
              [attr.stroke-dasharray]="a.dash" [attr.stroke-dashoffset]="a.offset" transform="rotate(-90 100 100)" />
          }
          @if (showPercent) {
            @for (a of arcs; track a.slice.name) {
              @if (a.pct >= 4) {
                <text class="donut__pct" [attr.x]="a.labelX" [attr.y]="a.labelY" text-anchor="middle" dominant-baseline="middle">{{ a.pct }}%</text>
              }
            }
          }
        </svg>
        <div class="donut__center">
          <strong>{{ centerValue ?? format(total) }}</strong>
          @if (centerLabel) { <span>{{ centerLabel }}</span> }
        </div>
      </div>
      @if (legend !== 'none') {
        <ul class="donut__legend">
          @for (a of arcs; track a.slice.name) {
            <li>
              <i [style.background]="a.slice.color"></i>
              <span class="donut__name">{{ a.slice.name }}</span>
              @if (legendValues) { <b>{{ format(a.slice.value) }}</b> }
              <em>{{ a.pct }}%</em>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrls: ['./charts.css']
})
export class DonutChart implements OnChanges {
  @Input({ required: true }) slices: ChartSlice[] = [];
  @Input() centerValue: string | null = null;
  @Input() centerLabel = '';
  @Input() size = 170;
  @Input() thickness = 30;
  @Input() legend: 'right' | 'bottom' | 'none' = 'right';
  @Input() legendValues = true;
  @Input() showPercent = true;
  @Input() format: ValueFormat = (v) => v.toLocaleString('en-US');
  @Input() ariaLabel = 'Donut chart';

  readonly r = R;
  total = 0;
  arcs: Arc[] = [];

  ngOnChanges(): void {
    this.total = sum(this.slices.map((s) => s.value));
    let start = 0;
    this.arcs = this.slices.map((slice) => {
      const share = this.total ? slice.value / this.total : 0;
      const len = share * C;
      const mid = (start + share / 2) * 2 * Math.PI - Math.PI / 2;
      const arc: Arc = {
        slice,
        dash: `${len} ${C - len}`,
        offset: -start * C,
        pct: Math.round(share * 100),
        labelX: 100 + Math.cos(mid) * R,
        labelY: 100 + Math.sin(mid) * R
      };
      start += share;
      return arc;
    });
  }
}
