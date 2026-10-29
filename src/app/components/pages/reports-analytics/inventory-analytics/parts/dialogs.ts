import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Download, LucideAngularModule, X } from 'lucide-angular';
import { downloadCsv } from '../../shared/analytics-common';
import { DetailsDialogData, FormDialogData, FormField, ListDialogData } from './ra-parts';

/** Wide dialog listing the rows behind an insight or KPI, with CSV download. */
@Component({
  selector: 'ra-c-list-dialog',
  imports: [LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <section class="dialog dialog--wide" role="dialog" aria-modal="true" [attr.aria-label]="data.title">
        <header class="rac-dialog-head">
          <div>
            <h2>{{ data.title }}</h2>
            @if (data.subtitle) { <p class="muted">{{ data.subtitle }}</p> }
          </div>
          <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()">
            <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
          </button>
        </header>
        <div class="table-wrap rac-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                @for (c of data.columns; track $index) {
                  <th [class.num]="isNum($index)">{{ c }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of data.rows; track $index; let ri = $index) {
                <tr>
                  <td class="muted">{{ ri + 1 }}</td>
                  @for (v of r; track $index) {
                    <td [class.num]="isNum($index)">{{ v }}</td>
                  }
                </tr>
              } @empty {
                <tr><td class="empty" [attr.colspan]="data.columns.length + 1">No rows for the current filters.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="dialog__actions">
          <span class="muted rac-grow">{{ data.rows.length }} rows</span>
          <button type="button" class="btn" (click)="exportRows()" [disabled]="!data.rows.length">
            <lucide-icon [img]="icons.Download" [size]="16"></lucide-icon> Export CSV
          </button>
          <button type="button" class="btn btn--primary" (click)="closed.emit()">Close</button>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaListDialog {
  @Input({ required: true }) data!: ListDialogData;
  @Output() closed = new EventEmitter<void>();

  readonly icons = { X, Download };

  isNum(i: number): boolean {
    return !!this.data.numeric?.includes(i);
  }

  exportRows(): void {
    downloadCsv(this.data.fileName, this.data.columns, this.data.rows);
  }

  backdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

/** Small read-only dialog with label / value pairs (a KPI, an asset, an order). */
@Component({
  selector: 'ra-c-details-dialog',
  imports: [LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="data.title">
        <header class="rac-dialog-head">
          <div>
            <h2>{{ data.title }}</h2>
            @if (data.subtitle) { <p class="muted">{{ data.subtitle }}</p> }
          </div>
          <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()">
            <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
          </button>
        </header>
        <dl class="rac-details">
          @for (it of data.items; track it.label) {
            <dt>{{ it.label }}</dt>
            <dd>{{ it.value }}</dd>
          }
        </dl>
        <div class="dialog__actions">
          <button type="button" class="btn btn--primary" (click)="closed.emit()">Close</button>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaDetailsDialog {
  @Input({ required: true }) data!: DetailsDialogData;
  @Output() closed = new EventEmitter<void>();

  readonly icons = { X };

  backdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

/** Form dialog (purchase request, action plan, approval, save view). Required fields are checked on submit. */
@Component({
  selector: 'ra-c-form-dialog',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <form class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="data.title" (ngSubmit)="submit()" novalidate>
        <header class="rac-dialog-head">
          <div>
            <h2>{{ data.title }}</h2>
            @if (data.intro) { <p class="muted">{{ data.intro }}</p> }
          </div>
          <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()">
            <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
          </button>
        </header>
        <div class="rac-form-grid">
          @for (f of fields; track f.key) {
            <div class="field" [class.invalid]="tried && error(f)" [class.rac-wide]="f.type === 'textarea'">
              <label [attr.for]="'rac-' + f.key">{{ f.label }} @if (f.required) { <span class="req">*</span> }</label>
              @switch (f.type) {
                @case ('select') {
                  <select [id]="'rac-' + f.key" [name]="f.key" [(ngModel)]="f.value">
                    @for (o of f.options; track o) { <option [value]="o">{{ o }}</option> }
                  </select>
                }
                @case ('textarea') {
                  <textarea [id]="'rac-' + f.key" [name]="f.key" [(ngModel)]="f.value" rows="3"></textarea>
                }
                @case ('number') {
                  <input [id]="'rac-' + f.key" [name]="f.key" type="number" min="1" [(ngModel)]="f.value" />
                }
                @case ('date') {
                  <input [id]="'rac-' + f.key" [name]="f.key" type="date" [(ngModel)]="f.value" />
                }
                @default {
                  <input [id]="'rac-' + f.key" [name]="f.key" type="text" [(ngModel)]="f.value" />
                }
              }
              @if (tried && error(f)) {
                <small>{{ error(f) }}</small>
              } @else if (f.hint) {
                <small>{{ f.hint }}</small>
              }
            </div>
          }
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">{{ data.submitLabel }}</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaFormDialog implements OnChanges {
  @Input({ required: true }) data!: FormDialogData;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<Record<string, string | number>>();

  readonly icons = { X };
  fields: FormField[] = [];
  tried = false;

  ngOnChanges(): void {
    // Work on a copy so cancelling leaves the caller's defaults untouched
    this.fields = this.data.fields.map((f) => ({ ...f }));
    this.tried = false;
  }

  error(f: FormField): string {
    const v = f.value;
    if (f.required && (v === null || v === undefined || String(v).trim() === '')) return `${f.label} is required.`;
    if (f.type === 'number' && v !== '' && v !== null && !(Number(v) > 0)) return `${f.label} must be greater than 0.`;
    return '';
  }

  submit(): void {
    this.tried = true;
    if (this.fields.some((f) => this.error(f))) return;
    const values: Record<string, string | number> = {};
    for (const f of this.fields) values[f.key] = typeof f.value === 'string' ? f.value.trim() : f.value;
    this.submitted.emit(values);
  }

  backdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
