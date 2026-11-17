import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import { ChartSeries, ValueFormat, compactNumber, niceMax } from './chart-utils';

interface Tick {
  y: number;
  label: string;
}

interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string | null;
}

interface LinePath {
  d: string;
  area: string | null;
  color: string;
  dashed: boolean;
  points: { x: number; y: number }[];
}


/**
 * SVG bar / line / combo chart with optional stacking and a right-hand axis.
 * Hovering a column shows every series' value for that label.
 */
@Component({
  selector: 'ra-cartesian-chart',
  standalone: true,
  template: `
    <div class="chart" (mouseleave)="hover = null">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" [attr.height]="height" role="img" [attr.aria-label]="ariaLabel">
        @for (t of ticks; track $index) {
          <line class="gridline" [attr.x1]="padL" [attr.x2]="width - padR" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="axis" [attr.x]="padL - 6" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
        }
        @for (t of rightTicks; track $index) {
          <text class="axis" [attr.x]="width - padR + 6" [attr.y]="t.y + 3">{{ t.label }}</text>
        }
        @if (yTitle) {
          <text class="axis-title" [attr.transform]="'translate(10 ' + (padT + plotH / 2) + ') rotate(-90)'" text-anchor="middle">{{ yTitle }}</text>
        }
        @for (b of bars; track $index) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.fill]="b.color" rx="2" />
          @if (b.label) {
            <text class="value" [attr.x]="b.x + b.w / 2" [attr.y]="b.y - 5" text-anchor="middle">{{ b.label }}</text>
          }
        }
        @for (l of lines; track $index) {
          @if (l.area) {
            <path [attr.d]="l.area" [attr.fill]="l.color" fill-opacity="0.12" stroke="none" />
          }
          <path [attr.d]="l.d" fill="none" [attr.stroke]="l.color" stroke-width="2.2" [attr.stroke-dasharray]="l.dashed ? '6 4' : null" />
          @for (p of l.points; track $index) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.4" [attr.fill]="l.color" stroke="#fff" stroke-width="1.2" />
          }
        }
        @for (x of labelX; track $index) {
          @for (part of labelParts[$index]; track $index; let pi = $index) {
            <text class="axis" [attr.x]="x" [attr.y]="height - padB + 14 + pi * 11" text-anchor="middle">{{ part }}</text>
          }
        }
        @if (hover !== null) {
          <line class="guide" [attr.x1]="labelX[hover]" [attr.x2]="labelX[hover]" [attr.y1]="padT" [attr.y2]="padT + plotH" />
        }
        @for (x of labelX; track $index) {
          <rect class="hit" [attr.x]="x - bandW / 2" [attr.y]="padT" [attr.width]="bandW" [attr.height]="plotH" (mouseenter)="hover = $index" />
        }
      </svg>
      @if (hover !== null) {
        <div class="tip" [style.left.%]="tipLeft" [class.tip--left]="tipLeft > 60">
          <strong>{{ labels[hover] }}</strong>
          @for (s of series; track s.name) {
            <span><i [style.background]="s.color"></i>{{ s.name }}<b>{{ tipValue(s, hover) }}</b></span>
          }
        </div>
      }
    </div>
    @if (legend) {
      <div class="legend">
        @for (s of series; track s.name) {
          <span><i [class.line]="isLine(s)" [class.dashed]="s.dashed" [style.background]="s.color" [style.border-color]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
  `,
  styleUrls: ['./charts.css']
})
export class CartesianChart implements OnChanges, AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private observer: ResizeObserver | null = null;

  @Input({ required: true }) labels: string[] = [];
  @Input({ required: true }) series: ChartSeries[] = [];
  /** Default mark for series without a `type` */
  @Input() kind: 'bar' | 'line' = 'line';
  @Input() stacked = false;
  @Input() height = 220;
  @Input() min = 0;
  @Input() max: number | null = null;
  @Input() rightMin = 0;
  @Input() rightMax: number | null = null;
  @Input() format: ValueFormat = compactNumber;
  @Input() rightFormat: ValueFormat = compactNumber;
  @Input() yTitle = '';
  /** Print the value above each bar (or stack) */
  @Input() showValues = false;
  @Input() legend = true;
  @Input() ariaLabel = 'Chart';

  // Drawn at the real pixel width so text keeps its size in narrow widgets
  width = 600;
  padL = 46;
  padR = 12;
  readonly padT = 16;
  padB = 30;
  plotH = 0;
  bandW = 0;
  ticks: Tick[] = [];
  rightTicks: Tick[] = [];
  bars: BarRect[] = [];
  lines: LinePath[] = [];
  labelX: number[] = [];
  labelParts: string[][] = [];
  hover: number | null = null;

  get tipLeft(): number {
    return this.hover === null ? 0 : (this.labelX[this.hover] / this.width) * 100;
  }

  isLine(s: ChartSeries): boolean {
    return (s.type ?? this.kind) === 'line';
  }

  tipValue(s: ChartSeries, i: number): string {
    return (s.axis === 'right' ? this.rightFormat : this.format)(s.values[i] ?? 0);
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0 && w !== this.width) this.zone.run(() => {
        this.width = w;
        this.ngOnChanges();
      });
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  ngOnChanges(): void {
    const hasRight = this.series.some((s) => s.axis === 'right');
    this.padL = this.yTitle ? 52 : 44;
    this.padR = hasRight ? 44 : 12;
    this.labelParts = this.labels.map((l) => l.split('\n'));
    const lineCount = Math.max(1, ...this.labelParts.map((p) => p.length));
    this.padB = 18 + lineCount * 11;
    this.plotH = this.height - this.padT - this.padB;
    const plotW = this.width - this.padL - this.padR;
    const n = Math.max(1, this.labels.length);
    this.bandW = plotW / n;
    this.labelX = this.labels.map((_, i) => this.padL + this.bandW * (i + 0.5));

    const left = this.series.filter((s) => s.axis !== 'right');
    const right = this.series.filter((s) => s.axis === 'right');
    const barSeries = left.filter((s) => !this.isLine(s));
    const peak = (list: ChartSeries[], stack: boolean) =>
      stack && list.length
        ? Math.max(0, ...this.labels.map((_, i) => list.reduce((a, s) => a + (s.values[i] ?? 0), 0)))
        : Math.max(0, ...list.flatMap((s) => s.values));
    const leftMax = this.max ?? niceMax(Math.max(peak(barSeries, this.stacked), peak(left.filter((s) => this.isLine(s)), false)) * 1.08);
    const rightMax = this.rightMax ?? niceMax(peak(right, false) * 1.08);
    const yLeft = (v: number) => this.padT + this.plotH - ((v - this.min) / (leftMax - this.min || 1)) * this.plotH;
    const yRight = (v: number) => this.padT + this.plotH - ((v - this.rightMin) / (rightMax - this.rightMin || 1)) * this.plotH;

    this.ticks = [0, 1, 2, 3, 4].map((k) => {
      const v = this.min + ((leftMax - this.min) * k) / 4;
      return { y: yLeft(v), label: this.format(v) };
    });
    this.rightTicks = right.length
      ? [0, 1, 2, 3, 4].map((k) => {
          const v = this.rightMin + ((rightMax - this.rightMin) * k) / 4;
          return { y: yRight(v), label: this.rightFormat(v) };
        })
      : [];

    // Bars: stacked share one column, otherwise grouped side by side
    this.bars = [];
    const groupW = this.bandW * (this.stacked ? 0.5 : 0.72);
    this.labels.forEach((_, i) => {
      const x0 = this.labelX[i] - groupW / 2;
      let base = this.min;
      barSeries.forEach((s, k) => {
        const v = s.values[i] ?? 0;
        if (this.stacked) {
          const top = yLeft(base + v);
          const isTop = k === barSeries.length - 1;
          this.bars.push({ x: x0, y: top, w: groupW, h: Math.max(0, yLeft(base) - top), color: s.color, label: this.showValues && isTop ? this.format(base + v) : null });
          base += v;
        } else {
          const w = groupW / barSeries.length;
          const top = yLeft(Math.max(v, this.min));
          this.bars.push({ x: x0 + k * w + 1, y: top, w: Math.max(1, w - 2), h: Math.max(0, yLeft(this.min) - top), color: s.color, label: this.showValues ? this.format(v) : null });
        }
      });
    });

    this.lines = this.series
      .filter((s) => this.isLine(s))
      .map((s) => {
        const y = s.axis === 'right' ? yRight : yLeft;
        const points = s.values.map((v, i) => ({ x: this.labelX[i], y: y(v) }));
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const base = this.padT + this.plotH;
        const area = s.area && points.length ? `${d} L${points[points.length - 1].x.toFixed(1)} ${base} L${points[0].x.toFixed(1)} ${base} Z` : null;
        return { d, area, color: s.color, dashed: !!s.dashed, points };
      });
  }
}
