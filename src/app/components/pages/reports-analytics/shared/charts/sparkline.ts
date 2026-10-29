import { Component, Input, OnChanges } from '@angular/core';
import { RA_COLORS } from './chart-utils';

/** Tiny trend line for KPI cards. */
@Component({
  selector: 'ra-sparkline',
  standalone: true,
  template: `
    <svg class="spark" [attr.width]="width" [attr.height]="height" [attr.viewBox]="'0 0 ' + width + ' ' + height" aria-hidden="true">
      @if (area) { <path [attr.d]="areaPath" [attr.fill]="color" fill-opacity="0.12" /> }
      <path [attr.d]="path" fill="none" [attr.stroke]="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `,
  styles: [':host { display: inline-block; line-height: 0; }']
})
export class Sparkline implements OnChanges {
  @Input({ required: true }) values: number[] = [];
  @Input() color: string = RA_COLORS.purple;
  @Input() width = 80;
  @Input() height = 28;
  @Input() area = false;

  path = '';
  areaPath = '';

  ngOnChanges(): void {
    const min = Math.min(...this.values);
    const max = Math.max(...this.values);
    const span = max - min || 1;
    const step = this.values.length > 1 ? (this.width - 4) / (this.values.length - 1) : 0;
    const pts = this.values.map((v, i) => [2 + i * step, this.height - 3 - ((v - min) / span) * (this.height - 6)]);
    this.path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    this.areaPath = pts.length ? `${this.path} L${pts[pts.length - 1][0].toFixed(1)} ${this.height} L2 ${this.height} Z` : '';
  }
}
