import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { Download, LucideAngularModule, X } from 'lucide-angular';
import { CartesianChart, ChartSeries, RA_COLORS, ValueFormat, compactNumber } from '../shared/charts';
import { StandardReport, SR_TIME_ZONES } from './standard-reports.data';
import { PreviewRow, StandardReportsService } from './standard-reports.service';
import { formatPeriod, formatStamp } from './standard-reports.util';

/** Read-only viewer: headline figure, a small chart and the breakdown table generated from the report's data. */
@Component({
  selector: 'app-sr-report-viewer',
  standalone: true,
  imports: [LucideAngularModule, CartesianChart],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" [attr.aria-label]="report.name" (click)="stop($event)">
        <div class="sr-viewer__head">
          <div>
            <h2>{{ report.name }}</h2>
            <p class="muted sr-viewer__meta">{{ report.id }} · {{ report.module }} · Owner {{ report.owner }}</p>
          </div>
          <button type="button" class="icon-btn" aria-label="Close" (click)="close.emit()">
            <lucide-icon [img]="icons.X" [size]="18" />
          </button>
        </div>
        <p>{{ report.description }}</p>
        <div class="mini-stats">
          <div class="mini-stat"><div><span>{{ headlineLabel }}</span><strong>{{ headline }}</strong></div></div>
          <div class="mini-stat"><div><span>Report period</span><strong class="sr-viewer__small">{{ period }}</strong></div></div>
          <div class="mini-stat"><div><span>Generated on</span><strong class="sr-viewer__small">{{ generated }}</strong></div></div>
          <div class="mini-stat"><div><span>Time zone</span><strong class="sr-viewer__small">{{ timeZone }}</strong></div></div>
        </div>
        <ra-cartesian-chart
          [labels]="labels"
          [series]="series"
          [kind]="kind"
          [height]="220"
          [format]="format"
          [showValues]="kind === 'bar'"
          [legend]="false"
          [ariaLabel]="report.preview.measure + ' by ' + dimensionLabel"
        />
        <div class="table-wrap sr-viewer__table">
          <table class="table">
            <thead>
              <tr>
                <th>{{ dimensionLabel }}</th>
                <th class="num">{{ report.preview.measure }}</th>
                <th class="num">{{ shareLabel }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.label) {
                <tr>
                  <td>{{ r.label }}</td>
                  <td class="num">{{ r.display }}</td>
                  <td class="num">{{ r.share }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted sr-viewer__note">DEMO MODE: sample figures generated from the Asset360 analytics model.</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Close</button>
          <button type="button" class="btn btn--primary" (click)="exportCsv.emit(report)">
            <lucide-icon [img]="icons.Download" [size]="16" /> Export CSV
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportViewerDialog implements OnChanges {
  private readonly service = inject(StandardReportsService);

  @Input({ required: true }) report!: StandardReport;
  @Output() close = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<StandardReport>();

  readonly icons = { X, Download };
  rows: PreviewRow[] = [];
  labels: string[] = [];
  series: ChartSeries[] = [];
  kind: 'bar' | 'line' = 'bar';
  format: ValueFormat = compactNumber;

  get dimensionLabel(): string {
    const d = this.report.preview.dimension;
    return d === 'category' ? 'Asset category' : d === 'site' ? 'Site' : 'Month (2026)';
  }

  get shareLabel(): string {
    return this.report.preview.unit === 'percent' ? 'vs. average' : 'Share';
  }

  get headlineLabel(): string {
    return this.report.preview.unit === 'percent' ? `Average ${this.report.preview.measure.toLowerCase()}` : `Total ${this.report.preview.measure.toLowerCase()}`;
  }

  get headline(): string {
    return this.service.formatValue(this.report, this.report.preview.total);
  }

  get period(): string {
    return formatPeriod(this.report.period);
  }

  get generated(): string {
    return formatStamp(this.report.generatedOn);
  }

  get timeZone(): string {
    return SR_TIME_ZONES.find((z) => z.value === this.report.period.timeZone)?.label ?? this.report.period.timeZone;
  }

  ngOnChanges(): void {
    this.rows = this.service.previewRows(this.report);
    this.labels = this.rows.map((r) => r.label);
    this.kind = this.report.preview.dimension === 'month' ? 'line' : 'bar';
    const unit = this.report.preview.unit;
    this.format = unit === 'percent' ? (v: number) => `${Math.round(v)}%` : compactNumber;
    this.series = [{ name: this.report.preview.measure, values: this.rows.map((r) => r.value), color: RA_COLORS.purple, area: this.kind === 'line' }];
  }

  stop(event: Event): void {
    event.stopPropagation();
  }
}
