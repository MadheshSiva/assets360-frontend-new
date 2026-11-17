import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CALC_GROUP, availableFields, isNumeric } from '../custom-reports.engine';
import { CalcField, CalcOperator, CustomReport, FieldDef } from '../custom-reports.model';
import { CustomReportsService } from '../custom-reports.service';

/** Add calculated field: name + <numeric field> <operator> <numeric field>. */
@Component({
  selector: 'cr-calc-field-dialog',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="cr-calc-title" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate>
        <h2 id="cr-calc-title">Add calculated field</h2>
        <p>Combine two numeric fields. The result is added to the selected fields and can be filtered, sorted and charted.</p>

        <div class="field" [class.invalid]="submitted && nameError">
          <label for="cr-calc-name">Field name <span class="req">*</span></label>
          <input id="cr-calc-name" name="name" [(ngModel)]="name" maxlength="60" placeholder="e.g. Cost per Work Order" />
          @if (submitted && nameError) { <small>{{ nameError }}</small> }
        </div>

        @if (numericFields.length < 1) {
          <p class="empty">This data source has no numeric fields.</p>
        } @else {
          <div class="cr-calc-row">
            <div class="field" [class.invalid]="submitted && !left">
              <label for="cr-calc-left">Field</label>
              <select id="cr-calc-left" name="left" [(ngModel)]="left">
                <option value="">Select…</option>
                @for (f of numericFields; track f.key) { <option [value]="f.key">{{ f.label }}</option> }
              </select>
            </div>
            <div class="field cr-calc-op">
              <label for="cr-calc-op">Operator</label>
              <select id="cr-calc-op" name="op" [(ngModel)]="op">
                @for (o of operators; track o) { <option [value]="o">{{ o }}</option> }
              </select>
            </div>
            <div class="field" [class.invalid]="submitted && !right">
              <label for="cr-calc-right">Field</label>
              <select id="cr-calc-right" name="right" [(ngModel)]="right">
                <option value="">Select…</option>
                @for (f of numericFields; track f.key) { <option [value]="f.key">{{ f.label }}</option> }
              </select>
            </div>
          </div>
          @if (submitted && exprError) { <p class="cr-error">{{ exprError }}</p> }
          @if (left && right) {
            <p class="cr-formula"><strong>{{ name || 'New field' }}</strong> = {{ labelOf(left) }} {{ op }} {{ labelOf(right) }}
              @if (op === '÷') { <span class="muted">· division by zero shows 0</span> }</p>
          }
        }

        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="numericFields.length < 1">Add field</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class CalcFieldDialog implements OnInit {
  @Input({ required: true }) report!: CustomReport;
  @Output() save = new EventEmitter<CalcField>();
  @Output() close = new EventEmitter<void>();

  private readonly service = inject(CustomReportsService);
  readonly operators: CalcOperator[] = ['+', '-', '×', '÷'];
  numericFields: FieldDef[] = [];
  name = '';
  left = '';
  op: CalcOperator = '÷';
  right = '';
  submitted = false;

  ngOnInit(): void {
    // Calculated fields only combine source fields, not other calculated fields
    this.numericFields = availableFields(this.service.catalog(), this.report).filter((f) => isNumeric(f.kind) && f.group !== CALC_GROUP);
  }

  labelOf(key: string): string {
    return this.numericFields.find((f) => f.key === key)?.label ?? key;
  }

  get nameError(): string {
    const n = this.name.trim();
    if (!n) return 'Enter a field name.';
    if (n.length < 3) return 'Use at least 3 characters.';
    const taken = availableFields(this.service.catalog(), this.report).some((f) => f.label.toLowerCase() === n.toLowerCase());
    return taken ? 'A field with this name already exists.' : '';
  }

  get exprError(): string {
    if (!this.left || !this.right) return 'Choose both fields.';
    if (this.left === this.right && (this.op === '-' || this.op === '÷')) return 'Choose two different fields for this operator.';
    return '';
  }

  submit(): void {
    this.submitted = true;
    if (this.nameError || this.exprError || !this.numericFields.length) return;
    // Same key format the API uses (calc_<snake_case label>), so selected fields still match after a save
    const slug = this.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
    let key = `calc_${slug}`;
    let i = 1;
    while (this.report.calcFields.some((c) => c.key === key)) key = `calc_${slug}_${++i}`;
    this.save.emit({ key, label: this.name.trim(), left: this.left, op: this.op, right: this.right });
  }
}
