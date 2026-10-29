import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { availableFields, fieldOf, filterError, operatorsFor } from '../custom-reports.engine';
import { CustomReport, FieldDef, FilterOperator, ReportFilter } from '../custom-reports.model';

/** Builder step 3: filter rows (field, operator, value). Rows are combined with AND. */
@Component({
  selector: 'cr-filters-step',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="cr-step-head">
      <h3>Filters</h3>
      <p class="muted">Only records matching every filter are included. Incomplete filters are ignored in the preview.</p>
    </div>

    @for (f of report.filters; track $index; let i = $index) {
      <div class="cr-filter" [class.cr-filter--invalid]="errorOf(f)">
        <select class="select" [ngModel]="f.field" (ngModelChange)="setField(f, $event)" [attr.aria-label]="'Filter ' + (i + 1) + ' field'">
          <option value="">Field…</option>
          @for (fd of fields; track fd.key) { <option [value]="fd.key">{{ fd.label }}</option> }
        </select>
        <select class="select" [(ngModel)]="f.op" [attr.aria-label]="'Filter ' + (i + 1) + ' operator'">
          @for (o of operatorsOf(f); track o) { <option [value]="o">{{ o }}</option> }
        </select>
        <input class="select" [type]="inputType(f)" [(ngModel)]="f.value" [attr.list]="'cr-values-' + i" placeholder="Value"
          [attr.aria-label]="'Filter ' + (i + 1) + ' value'" />
        <datalist [id]="'cr-values-' + i">
          @for (v of suggestions(f); track v) { <option [value]="v"></option> }
        </datalist>
        <button type="button" class="icon-btn" (click)="remove(i)" [attr.aria-label]="'Remove filter ' + (i + 1)">
          <lucide-icon [img]="Trash2" [size]="15" />
        </button>
        @if (errorOf(f)) { <small class="cr-error">{{ errorOf(f) }}</small> }
      </div>
    } @empty {
      <p class="empty">No filters — all records are included.</p>
    }

    <button type="button" class="btn btn--outline btn--sm" (click)="add()">
      <lucide-icon [img]="Plus" [size]="14" /> Add filter
    </button>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class FiltersStep {
  @Input({ required: true }) report!: CustomReport;

  readonly Plus = Plus;
  readonly Trash2 = Trash2;

  get fields(): FieldDef[] {
    return availableFields(this.report);
  }

  operatorsOf(f: ReportFilter): FilterOperator[] {
    const field = fieldOf(this.report, f.field);
    return field ? operatorsFor(field.kind) : ['equals'];
  }

  inputType(f: ReportFilter): string {
    const kind = fieldOf(this.report, f.field)?.kind;
    return kind === 'date' ? 'date' : 'text';
  }

  suggestions(f: ReportFilter): string[] {
    return fieldOf(this.report, f.field)?.values ?? [];
  }

  errorOf(f: ReportFilter): string {
    return filterError(this.report, f);
  }

  setField(f: ReportFilter, key: string): void {
    f.field = key;
    const field = fieldOf(this.report, key);
    f.op = field ? operatorsFor(field.kind)[0] : 'equals';
    f.value = '';
  }

  add(): void {
    this.report.filters = [...this.report.filters, { field: '', op: 'equals', value: '' }];
  }

  remove(i: number): void {
    this.report.filters = this.report.filters.filter((_, idx) => idx !== i);
  }
}
