import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartColumn, ChartLine, ChartPie, LucideAngularModule, Table } from 'lucide-angular';
import { isNumeric, outputColumns } from '../custom-reports.engine';
import { CustomReport, PreviewColumn, VizType } from '../custom-reports.model';

/** Builder step 5: visualization type and the value plotted on charts. */
@Component({
  selector: 'cr-visualize-step',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="cr-step-head">
      <h3>Visualize</h3>
      <p class="muted">Choose how the report is presented. Charts plot one numeric column against the group (or first text) column.</p>
    </div>
    <div class="cr-viz" role="radiogroup" aria-label="Visualization type">
      @for (v of types; track v.type) {
        <button type="button" role="radio" class="cr-viz__card" [class.cr-viz__card--active]="report.viz === v.type"
          [attr.aria-checked]="report.viz === v.type" (click)="report.viz = v.type">
          <lucide-icon [img]="v.icon" [size]="22" />
          <strong>{{ v.type === 'Table' ? 'Table' : v.type + ' chart' }}</strong>
          <small>{{ v.hint }}</small>
        </button>
      }
    </div>
    @if (report.viz !== 'Table') {
      <div class="cr-form-grid">
        <div class="field">
          <label for="cr-chart-value">Value to plot</label>
          <select id="cr-chart-value" [(ngModel)]="report.chartValue" [disabled]="!numericColumns.length">
            <option value="">Automatic (first numeric column)</option>
            @for (c of numericColumns; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
          </select>
          @if (!numericColumns.length) { <small>Add a numeric field or group the report to get a record count.</small> }
        </div>
        <div class="field">
          <span>Category axis</span>
          <p class="cr-readonly">{{ categoryLabel }}</p>
          @if (!report.groupBy) { <small>Tip: group by a field in step 4 for a summarised chart.</small> }
        </div>
      </div>
    }
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class VisualizeStep {
  @Input({ required: true }) report!: CustomReport;

  readonly types: { type: VizType; icon: typeof Table; hint: string }[] = [
    { type: 'Table', icon: Table, hint: 'Rows and columns' },
    { type: 'Bar', icon: ChartColumn, hint: 'Compare categories' },
    { type: 'Line', icon: ChartLine, hint: 'Show a trend' },
    { type: 'Donut', icon: ChartPie, hint: 'Share of a total' }
  ];

  get numericColumns(): PreviewColumn[] {
    return outputColumns(this.report).filter((c) => isNumeric(c.kind));
  }

  get categoryLabel(): string {
    const cols = outputColumns(this.report);
    const col = this.report.groupBy ? cols[0] : cols.find((c) => !isNumeric(c.kind));
    return col?.label ?? 'None — select a text field';
  }
}
