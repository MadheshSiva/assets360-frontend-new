import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fieldOf, isNumeric, outputColumns } from '../custom-reports.engine';
import { Aggregate, CustomReport, FieldDef, PreviewColumn } from '../custom-reports.model';

/** Builder step 4: group by a text/date field (with an aggregate for numbers), sort and row limit. */
@Component({
  selector: 'cr-group-sort-step',
  imports: [FormsModule],
  template: `
    <div class="cr-step-head">
      <h3>Group &amp; Sort</h3>
      <p class="muted">Grouping summarises records per value: a record count plus the chosen aggregate of each numeric field.</p>
    </div>
    <div class="cr-form-grid">
      <div class="field">
        <label for="cr-group">Group by</label>
        <select id="cr-group" [(ngModel)]="report.groupBy">
          <option value="">No grouping (one row per record)</option>
          @for (f of groupable; track f.key) { <option [value]="f.key">{{ f.label }}</option> }
        </select>
        @if (!groupable.length) { <small>Select a text or date field to group by.</small> }
      </div>
      <div class="field">
        <label for="cr-agg">Aggregate numeric fields</label>
        <select id="cr-agg" [(ngModel)]="report.aggregate" [disabled]="!report.groupBy">
          @for (a of aggregates; track a) { <option [value]="a">{{ a }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="cr-sort">Sort by</label>
        <select id="cr-sort" [(ngModel)]="report.sortBy">
          <option value="">Default order</option>
          @for (c of columns; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
        </select>
      </div>
      <div class="field">
        <span>Direction</span>
        <div class="seg" role="group" aria-label="Sort direction">
          <button type="button" [class.active]="report.sortDir === 'asc'" (click)="report.sortDir = 'asc'">Ascending</button>
          <button type="button" [class.active]="report.sortDir === 'desc'" (click)="report.sortDir = 'desc'">Descending</button>
        </div>
      </div>
      <div class="field">
        <label for="cr-limit">Row limit</label>
        <select id="cr-limit" [(ngModel)]="report.rowLimit">
          @for (n of limits; track n) { <option [ngValue]="n">{{ n }} rows</option> }
        </select>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class GroupSortStep {
  @Input({ required: true }) report!: CustomReport;

  readonly aggregates: Aggregate[] = ['Sum', 'Average', 'Min', 'Max'];
  readonly limits = [10, 25, 50, 100];

  get groupable(): FieldDef[] {
    return this.report.fields
      .map((k) => fieldOf(this.report, k))
      .filter((f): f is FieldDef => !!f && !isNumeric(f.kind));
  }

  get columns(): PreviewColumn[] {
    return outputColumns(this.report);
  }
}
