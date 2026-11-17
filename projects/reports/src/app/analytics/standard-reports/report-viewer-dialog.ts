import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { Download, LucideAngularModule, X } from 'lucide-angular';
import { CartesianChart, ChartSeries, RA_COLORS, ValueFormat, compactNumber } from '../shared/charts';
import { ReportOutput, StandardReport, SR_TIME_ZONES } from './standard-reports.data';
import { PreviewRow, StandardReportsService } from './standard-reports.service';
import { formatPeriod, formatStamp } from './standard-reports.util';

/** Read-only viewer: headline figure, a small chart and the breakdown table, read live from GET /api/standard-reports/{id}/output. */
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
            <p class="muted sr-viewer__meta">{{ report.id }} · {{ report.module }} · Owner {{ report.owner || '—' }}</p>
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
        @if (loading) {
          <p class="muted">Loading report output…</p>
        } @else if (error) {
          <p class="sr-viewer__note" role="alert">{{ error }} <button type="button" class="btn" (click)="load()">Retry</button></p>
        } @else if (output) {
          @if (rows.length) {
            <ra-cartesian-chart
              [labels]="labels"
              [series]="series"
              [kind]="kind"
              [height]="220"
              [format]="format"
              [showValues]="kind === 'bar'"
              [legend]="false"
              [ariaLabel]="output.measure + ' by ' + dimensionLabel"
            />
            <div class="table-wrap sr-viewer__table">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ dimensionLabel }}</th>
                    <th class="num">{{ output.measure }}</th>
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
          }
          @if (output.note) {
            <p class="muted sr-viewer__note">{{ output.note }}</p>
          }
          @if (output.defaultPeriod) {
            <p class="muted sr-viewer__note">This report has no reporting period, so figures cover {{ output.periodFrom }} to {{ output.periodTo }}.</p>
          }
        }
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Close</button>
          <button type="button" class="btn btn--primary" [disabled]="!rows.length" (click)="exportCsv.emit(report)">
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
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;

  @Input({ required: true }) report!: StandardReport;
  @Output() close = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<StandardReport>();

  readonly icons = { X, Download };
  output: ReportOutput | null = null;
  loading = false;
  error: string | null = null;
  rows: PreviewRow[] = [];
  labels: string[] = [];
  series: ChartSeries[] = [];
  kind: 'bar' | 'line' = 'bar';
  format: ValueFormat = compactNumber;

  get dimensionLabel(): string {
    const d = this.output?.dimension;
    return d === 'category' ? 'Category' : d === 'site' ? 'Site' : 'Month';
  }

  get shareLabel(): string {
    return this.output?.unit === 'percent' ? 'vs. average' : 'Share';
  }

  get headlineLabel(): string {
    if (!this.output) return 'Total';
    const measure = this.output.measure.toLowerCase();
    return this.output.aggregate === 'average' ? `Average ${measure}` : `Total ${measure}`;
  }

  get headline(): string {
    if (this.loading) return '…';
    return this.output ? this.service.formatValue(this.output.unit, this.output.total) : '—';
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
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = null;
    this.output = null;
    this.rows = [];
    this.request = this.service
      .output(this.report)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (out) => {
          this.loading = false;
          this.output = out;
          this.rows = this.service.outputRows(out);
          this.labels = this.rows.map((r) => r.label);
          this.kind = out.dimension === 'month' ? 'line' : 'bar';
          this.format = out.unit === 'percent' ? (v: number) => `${Math.round(v)}%` : compactNumber;
          this.series = [{ name: out.measure, values: this.rows.map((r) => r.value), color: RA_COLORS.purple, area: this.kind === 'line' }];
        },
        error: (err: Error) => {
          this.loading = false;
          this.error = err.message || 'Could not load the report output.';
        }
      });
  }

  stop(event: Event): void {
    event.stopPropagation();
  }
}
