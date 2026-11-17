import { Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Info, LucideAngularModule } from 'lucide-angular';
import { CartesianChart, ChartSeries, RA_COLORS } from '../shared/charts';
import { DataExportService } from './data-export-api.service';

/** Data Delivery & Integration Health: export run success rate and API request volume. */
@Component({
  standalone: true,
  selector: 'dx-delivery-health',
  imports: [FormsModule, LucideAngularModule, CartesianChart],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget dx-health">
      <div class="widget__head">
        <h2>
          Data Delivery &amp; Integration Health
          <lucide-icon class="widget__info" [img]="icons.Info" [size]="14" title="Export runs (run history) and logged data access per day (Asia/Dubai)"></lucide-icon>
        </h2>
        <select class="select dx-select-sm" [(ngModel)]="range" (ngModelChange)="build()" aria-label="Range">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>
      <div class="dx-health-grid">
        <div>
          <h3 class="dx-h3">Export Run Success Rate</h3>
          <ra-cartesian-chart
            [labels]="labels"
            [series]="runSeries"
            kind="bar"
            [stacked]="true"
            [height]="210"
            [rightMin]="0"
            [rightMax]="100"
            [rightFormat]="pct"
            yTitle="Number of runs"
            ariaLabel="Export runs per day with success rate"
          ></ra-cartesian-chart>
        </div>
        <div>
          <h3 class="dx-h3">Data Access Requests</h3>
          <ra-cartesian-chart
            [labels]="labels"
            [series]="apiSeries"
            kind="line"
            [height]="210"
            ariaLabel="Logged data access requests per day"
          ></ra-cartesian-chart>
        </div>
      </div>
    </section>
  `
})
export class DeliveryHealth implements OnChanges {
  // Data comes from DataExportService (run history and access logs); the page bumps version when it reloads
  private readonly service = inject(DataExportService);
  /** Bumped by the page after a run so the charts pick up the new counts */
  @Input() version = 0;

  readonly icons = { Info };
  range: '7' | '30' = '7';
  labels: string[] = [];
  runSeries: ChartSeries[] = [];
  apiSeries: ChartSeries[] = [];

  pct(v: number): string {
    return `${Math.round(v)}%`;
  }

  constructor() {
    this.build();
  }

  ngOnChanges(): void {
    this.build();
  }

  build(): void {
    const s = this.range === '7' ? this.service.stats7 : this.service.stats30;
    this.labels = this.range === '7' ? s.labels.slice() : s.labels.map((l, i) => (i % 5 === 4 || i === 0 ? l : l.slice(0, 2)));
    // Days without runs have no rate; they plot at 0
    const rate = s.success.map((v, i) => (v + (s.failed[i] ?? 0) ? Number(((v / (v + s.failed[i])) * 100).toFixed(1)) : 0));
    this.runSeries = [
      { name: 'Successful', values: s.success.slice(), color: RA_COLORS.green, type: 'bar' },
      { name: 'Failed', values: s.failed.slice(), color: RA_COLORS.red, type: 'bar' },
      { name: 'Success rate', values: rate, color: RA_COLORS.purple, type: 'line', axis: 'right' }
    ];
    this.apiSeries = [
      { name: 'Successful', values: s.accessOk.slice(), color: RA_COLORS.blue, type: 'line', area: true },
      { name: 'Failed / denied', values: s.accessFailed.slice(), color: RA_COLORS.red, type: 'line' }
    ];
  }
}
