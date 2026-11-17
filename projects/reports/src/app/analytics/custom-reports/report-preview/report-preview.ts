import { Component, DoCheck, Input } from '@angular/core';
import { ChartColumn, ChartLine, ChartPie, LucideAngularModule, Table } from 'lucide-angular';
import { CartesianChart, ChartSeries, ChartSlice, DonutChart, RA_COLORS, RA_SERIES_COLORS, ValueFormat, compactNumber } from '../../shared/charts';
import { formatCell, runReport } from '../custom-reports.engine';
import { FieldKind, PreviewColumn, PreviewResult, ReportDefinition, ReportRow, VizType } from '../custom-reports.model';

/**
 * Renders a report definition as a table or chart from generated sample rows.
 * Recomputes only when the definition changes (checked by signature) so chart inputs stay stable.
 */
@Component({
  selector: 'cr-report-preview',
  imports: [LucideAngularModule, CartesianChart, DonutChart],
  template: `
    <div class="cr-panel__head">
      <h3>{{ heading }}</h3>
      <div class="seg cr-seg-sm" role="group" aria-label="Preview type">
        <button type="button" [class.active]="mode === 'Table'" (click)="setMode('Table')"><lucide-icon [img]="Table" [size]="13" /> Table view</button>
        <button type="button" [class.active]="mode !== 'Table'" (click)="setMode(chartMode)"><lucide-icon [img]="chartIcon" [size]="13" /> {{ chartMode }} chart</button>
      </div>
    </div>

    @if (!result.columns.length) {
      <p class="empty">Select fields to see a preview.</p>
    } @else {
      <p class="cr-preview__title">{{ mode === 'Table' ? reportName || 'Report preview' : result.title }}</p>
      @if (mode === 'Table') {
        <div class="table-wrap" [style.max-height.px]="compact ? 230 : 460">
          <table class="table">
            <thead>
              <tr>
                @for (c of result.columns; track c.key) { <th [class.num]="isNum(c)">{{ c.label }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (r of result.rows; track $index) {
                <tr>
                  @for (c of result.columns; track c.key) { <td [class.num]="isNum(c)">{{ cell(c, r) }}</td> }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="result.columns.length" class="empty">No records match the filters.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!canChart) {
        <p class="empty">A chart needs one text column and one numeric column. Add fields or group the report.</p>
      } @else if (mode === 'Donut') {
        <ra-donut-chart [slices]="slices" [size]="compact ? 150 : 200" [thickness]="compact ? 24 : 32" [format]="valueFormat" [centerLabel]="valueLabel" />
      } @else {
        <ra-cartesian-chart [labels]="labels" [series]="series" [kind]="mode === 'Line' ? 'line' : 'bar'" [height]="compact ? 200 : 300"
          [showValues]="mode === 'Bar'" [legend]="false" [format]="valueFormat" [ariaLabel]="result.title" />
      }
      <p class="muted cr-preview__foot">DEMO MODE · sample data · showing {{ result.rows.length }} of {{ result.matched }} {{ grouped ? 'groups' : 'records' }}</p>
    }
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class ReportPreview implements DoCheck {
  @Input({ required: true }) definition!: ReportDefinition;
  @Input() reportName = '';
  @Input() heading = 'Preview';
  /** Smaller table/chart for the side panel */
  @Input() compact = false;

  readonly Table = Table;

  result: PreviewResult = { columns: [], rows: [], matched: 0, labelKey: '', valueKey: '', title: '' };
  labels: string[] = [];
  series: ChartSeries[] = [];
  slices: ChartSlice[] = [];
  valueFormat: ValueFormat = compactNumber;
  valueLabel = '';
  grouped = false;
  /** Local override of the visualization (Table view / chart toggle) */
  private override: VizType | null = null;
  private signature = '';

  get mode(): VizType {
    return this.override ?? this.definition.viz;
  }

  get chartMode(): VizType {
    return this.definition.viz === 'Table' ? 'Bar' : this.definition.viz;
  }

  get chartIcon(): typeof Table {
    return this.chartMode === 'Line' ? ChartLine : this.chartMode === 'Donut' ? ChartPie : ChartColumn;
  }

  get canChart(): boolean {
    return !!this.result.labelKey && !!this.result.valueKey && this.result.rows.length > 0;
  }

  setMode(mode: VizType): void {
    this.override = mode === this.definition.viz ? null : mode;
  }

  ngDoCheck(): void {
    const sig = JSON.stringify(this.definition);
    if (sig === this.signature) return;
    // A new visualization chosen in the builder wins over the local toggle
    if (this.signature && JSON.parse(this.signature).viz !== this.definition.viz) this.override = null;
    this.signature = sig;
    this.recompute();
  }

  private recompute(): void {
    const r = runReport(this.definition);
    this.result = r;
    this.grouped = !!this.definition.groupBy;
    const valueCol = r.columns.find((c) => c.key === r.valueKey);
    const kind: FieldKind = valueCol?.kind ?? 'number';
    this.valueLabel = valueCol?.label ?? '';
    this.valueFormat = kind === 'money' ? moneyShort : kind === 'percent' ? pct : compactNumber;
    // Charts read best with a handful of categories
    const top = r.rows.slice(0, 10);
    this.labels = top.map((row) => shorten(String(row[r.labelKey] ?? '')));
    this.series = [{ name: this.valueLabel, values: top.map((row) => Number(row[r.valueKey]) || 0), color: RA_COLORS.purple }];
    const pie: ChartSlice[] = r.rows.slice(0, 6).map((row, i) => ({ name: String(row[r.labelKey] ?? ''), value: Number(row[r.valueKey]) || 0, color: RA_SERIES_COLORS[i % RA_SERIES_COLORS.length] }));
    const rest = r.rows.slice(6).reduce((sum, row) => sum + (Number(row[r.valueKey]) || 0), 0);
    if (rest > 0) pie.push({ name: 'Other', value: rest, color: RA_COLORS.grey });
    this.slices = pie;
  }

  isNum(c: PreviewColumn): boolean {
    return c.kind === 'number' || c.kind === 'money' || c.kind === 'percent';
  }

  cell(c: PreviewColumn, row: ReportRow): string {
    return formatCell(c.kind, row[c.key]);
  }
}

function moneyShort(v: number): string {
  return `AED ${compactNumber(v)}`;
}

function pct(v: number): string {
  return `${compactNumber(v)}%`;
}

function shorten(s: string): string {
  return s.length > 16 ? `${s.slice(0, 15)}…` : s;
}
