import { Component, Input, OnChanges } from '@angular/core';
import { RA_COLORS } from './chart-utils';

/** Half-circle gauge (0–100%) with the value, a caption and an optional target. */
@Component({
  selector: 'ra-gauge-chart',
  standalone: true,
  template: `
    <div class="gauge" [style.width.px]="size">
      <svg viewBox="0 0 200 110" role="img" [attr.aria-label]="caption + ' ' + value + '%'">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#eef0f5" stroke-width="18" stroke-linecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" [attr.stroke]="color" stroke-width="18" stroke-linecap="round"
          [attr.stroke-dasharray]="dash" />
        @if (target !== null) {
          <line [attr.x1]="targetX1" [attr.y1]="targetY1" [attr.x2]="targetX2" [attr.y2]="targetY2" stroke="#0f172a" stroke-width="2" />
        }
      </svg>
      <div class="gauge__center">
        <strong>{{ display ?? value + '%' }}</strong>
        @if (caption) { <span>{{ caption }}</span> }
        @if (target !== null) { <em>Target {{ target }}%</em> }
      </div>
    </div>
  `,
  styleUrls: ['./charts.css']
})
export class GaugeChart implements OnChanges {
  @Input({ required: true }) value = 0;
  @Input() target: number | null = null;
  @Input() caption = '';
  @Input() display: string | null = null;
  @Input() color: string = RA_COLORS.purple;
  @Input() size = 220;

  dash = '0 252';
  targetX1 = 0;
  targetY1 = 0;
  targetX2 = 0;
  targetY2 = 0;

  ngOnChanges(): void {
    const len = Math.PI * 80;
    const share = Math.min(100, Math.max(0, this.value)) / 100;
    this.dash = `${share * len} ${len}`;
    if (this.target !== null) {
      const a = Math.PI - (Math.min(100, Math.max(0, this.target)) / 100) * Math.PI;
      this.targetX1 = 100 + Math.cos(a) * 68;
      this.targetY1 = 100 - Math.sin(a) * 68;
      this.targetX2 = 100 + Math.cos(a) * 92;
      this.targetY2 = 100 - Math.sin(a) * 92;
    }
  }
}
