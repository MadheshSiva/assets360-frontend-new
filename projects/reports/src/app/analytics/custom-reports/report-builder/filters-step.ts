import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { availableFields, fieldOf, filterError, isNumeric, needsList, needsNoValue, operatorLabel } from '../custom-reports.engine';
import { CustomReport, FieldDef, FilterOperator, ReportCatalog, ReportFilter } from '../custom-reports.model';
import { CustomReportsService } from '../custom-reports.service';

/** Builder step 3: filter rows (field, operator, value), combined with And / Or. */
@Component({
  selector: 'cr-filters-step',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="cr-step-head cr-step-head--row">
      <div>
        <h3>Filters</h3>
        <p class="muted">Only records matching the filters are included. Incomplete filters are ignored in the preview.</p>
      </div>
      @if (report.filters.length > 1) {
        <label class="cr-inline-field">
          <span>Match</span>
          <select class="select" [(ngModel)]="report.filterLogic" aria-label="Combine filters">
            <option value="And">All filters (AND)</option>
            <option value="Or">Any filter (OR)</option>
          </select>
        </label>
      }
    </div>

    @for (f of report.filters; track $index; let i = $index) {
      <div class="cr-filter" [class.cr-filter--invalid]="errorOf(f)">
        <select class="select" [ngModel]="f.field" (ngModelChange)="setField(f, $event)" [attr.aria-label]="'Filter ' + (i + 1) + ' field'">
          <option value="">Field…</option>
          @for (fd of fields; track fd.key) { <option [value]="fd.key">{{ fd.label }}</option> }
        </select>
        <select class="select" [ngModel]="f.op" (ngModelChange)="setOperator(f, $event)" [attr.aria-label]="'Filter ' + (i + 1) + ' operator'">
          @for (o of operatorsOf(f); track o) { <option [value]="o">{{ labelOf(f, o) }}</option> }
        </select>
        @if (!noValue(f)) {
          <input class="select" [type]="inputType(f)" [(ngModel)]="f.value" [attr.list]="'cr-values-' + i" [placeholder]="placeholder(f)"
            [attr.aria-label]="'Filter ' + (i + 1) + ' value'" />
          @if (f.op === 'between') {
            <input class="select" [type]="inputType(f)" [(ngModel)]="f.valueTo" placeholder="and"
              [attr.aria-label]="'Filter ' + (i + 1) + ' upper bound'" />
          }
          <datalist [id]="'cr-values-' + i">
            @for (v of suggestions(f); track v) { <option [value]="v"></option> }
          </datalist>
        }
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

  private readonly service = inject(CustomReportsService);
  readonly Plus = Plus;
  readonly Trash2 = Trash2;

  private get catalog(): ReportCatalog {
    return this.service.catalog();
  }

  get fields(): FieldDef[] {
    return availableFields(this.catalog, this.report);
  }

  private fieldFor(f: ReportFilter): FieldDef | undefined {
    return fieldOf(this.catalog, this.report, f.field);
  }

  operatorsOf(f: ReportFilter): FilterOperator[] {
    const field = this.fieldFor(f);
    return field?.operators.length ? field.operators : ['equals'];
  }

  labelOf(f: ReportFilter, op: FilterOperator): string {
    return operatorLabel(this.fieldFor(f)?.kind, op);
  }

  noValue(f: ReportFilter): boolean {
    return needsNoValue(f.op);
  }

  inputType(f: ReportFilter): string {
    const kind = this.fieldFor(f)?.kind;
    if (needsList(f.op) || f.op === 'inLastDays') return 'text';
    if (kind === 'date') return 'date';
    return kind && isNumeric(kind) ? 'number' : 'text';
  }

  placeholder(f: ReportFilter): string {
    if (needsList(f.op)) return 'Values, separated by commas';
    if (f.op === 'inLastDays') return 'Days';
    return 'Value';
  }

  suggestions(f: ReportFilter): string[] {
    return this.fieldFor(f)?.values ?? [];
  }

  errorOf(f: ReportFilter): string {
    return filterError(this.catalog, this.report, f);
  }

  setField(f: ReportFilter, key: string): void {
    f.field = key;
    f.op = this.operatorsOf(f)[0];
    f.value = '';
    f.valueTo = '';
  }

  setOperator(f: ReportFilter, op: FilterOperator): void {
    f.op = op;
    if (needsNoValue(op)) f.value = '';
    if (op !== 'between') f.valueTo = '';
  }

  add(): void {
    this.report.filters = [...this.report.filters, { field: '', op: 'equals', value: '' }];
  }

  remove(i: number): void {
    this.report.filters = this.report.filters.filter((_, idx) => idx !== i);
  }
}
