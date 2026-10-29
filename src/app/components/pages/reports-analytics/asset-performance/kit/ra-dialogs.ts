import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, LucideAngularModule, X } from 'lucide-angular';
import { RA_PEOPLE, downloadCsv } from '../../shared/analytics-common';

export interface RaColumn {
  key: string;
  label: string;
  num?: boolean;
}

export type RaRow = Record<string, string | number>;

export interface RaRecords {
  title: string;
  subtitle?: string;
  columns: RaColumn[];
  rows: RaRow[];
  /** CSV file name for the export button */
  file: string;
}

export interface RaDetailField {
  label: string;
  value: string | number;
}

export interface RaDetail {
  title: string;
  subtitle?: string;
  fields: RaDetailField[];
  /** Label of an optional follow-up action, e.g. "Create work order" */
  primary?: string;
}

export type RaActionKind = 'Work order' | 'Action plan';

export interface RaActionRequest {
  kind: RaActionKind;
  title: string;
  context: string;
  priority?: string;
}

export interface RaActionForm {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
}

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

/** Wide dialog listing records behind a KPI or insight, sortable and exportable. */
@Component({
  selector: 'ra-records-dialog',
  standalone: true,
  imports: [LucideAngularModule],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" [attr.aria-label]="data.title" (click)="$event.stopPropagation()">
        <h2>{{ data.title }}</h2>
        @if (data.subtitle) { <p>{{ data.subtitle }}</p> }
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                @for (c of data.columns; track c.key) {
                  <th [class.num]="c.num">
                    <button type="button" class="sort" (click)="sortBy(c.key)">
                      {{ c.label }} <lucide-icon [img]="sortIcon(c.key)" [size]="12" />
                    </button>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track $index) {
                <tr>
                  @for (c of data.columns; track c.key) {
                    <td [class.num]="c.num">{{ r[c.key] }}</td>
                  }
                </tr>
              } @empty {
                <tr><td class="empty" [attr.colspan]="data.columns.length">No records for the current filters.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="dialog__actions">
          <span class="muted ra-count">{{ data.rows.length }} records</span>
          <button type="button" class="btn" (click)="exportCsv()" [disabled]="!data.rows.length">
            <lucide-icon [img]="icons.Download" [size]="16" /> Export CSV
          </button>
          <button type="button" class="btn btn--primary" (click)="close.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: ['.ra-count { margin-right: auto; align-self: center; }']
})
export class RaRecordsDialog implements OnChanges {
  readonly icons = { Download, ArrowUp, ArrowDown, ArrowUpDown };
  @Input({ required: true }) data!: RaRecords;
  @Output() close = new EventEmitter<void>();
  sortKey = '';
  sortDir: 1 | -1 = 1;
  rows: RaRow[] = [];

  ngOnChanges(): void {
    this.sortKey = '';
    this.rows = this.data.rows;
  }

  sortBy(key: string): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : 1;
    this.sortKey = key;
    const dir = this.sortDir;
    this.rows = [...this.data.rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
  }

  sortIcon(key: string) {
    return this.sortKey !== key ? this.icons.ArrowUpDown : this.sortDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  exportCsv(): void {
    downloadCsv(this.data.file, this.data.columns.map((c) => c.label), this.rows.map((r) => this.data.columns.map((c) => r[c.key])));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

/** Key/value detail of one row (asset, work order, location). */
@Component({
  selector: 'ra-detail-dialog',
  standalone: true,
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="data.title" (click)="$event.stopPropagation()">
        <h2>{{ data.title }}</h2>
        @if (data.subtitle) { <p>{{ data.subtitle }}</p> }
        <dl class="ra-fields">
          @for (f of data.fields; track f.label) {
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          }
        </dl>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Close</button>
          @if (data.primary) {
            <button type="button" class="btn btn--primary" (click)="primary.emit()">{{ data.primary }}</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `.ra-fields { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 8px 14px; margin: 14px 0 0; }
     .ra-fields dt { color: var(--ra-muted); }
     .ra-fields dd { margin: 0; font-weight: 600; }`
  ]
})
export class RaDetailDialog {
  @Input({ required: true }) data!: RaDetail;
  @Output() close = new EventEmitter<void>();
  @Output() primary = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

/** "Create work order" / "Create action plan" form (DEMO MODE: nothing is saved). */
@Component({
  selector: 'ra-action-dialog',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="close.emit()">
      <form class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="heading" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate>
        <h2>{{ heading }}</h2>
        <p>{{ request.context }}</p>
        <div class="field" [class.invalid]="tried && !form.title.trim()">
          <label for="ra-action-title">Title <span class="req">*</span></label>
          <input id="ra-action-title" name="title" [(ngModel)]="form.title" maxlength="120" />
          @if (tried && !form.title.trim()) { <small>Enter a title.</small> }
        </div>
        <div class="ra-grid">
          <div class="field" [class.invalid]="tried && !form.owner">
            <label for="ra-action-owner">{{ request.kind === 'Work order' ? 'Assign to' : 'Owner' }} <span class="req">*</span></label>
            <select id="ra-action-owner" name="owner" [(ngModel)]="form.owner">
              <option value="">Select a person</option>
              @for (p of people; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            @if (tried && !form.owner) { <small>Choose who owns this.</small> }
          </div>
          <div class="field" [class.invalid]="tried && dueError">
            <label for="ra-action-due">Due date <span class="req">*</span></label>
            <input id="ra-action-due" name="due" type="date" [min]="today" [(ngModel)]="form.due" />
            @if (tried && dueError) { <small>{{ dueError }}</small> }
          </div>
          <div class="field">
            <label for="ra-action-priority">Priority <span class="req">*</span></label>
            <select id="ra-action-priority" name="priority" [(ngModel)]="form.priority">
              @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
            </select>
          </div>
        </div>
        <div class="field">
          <label for="ra-action-notes">Notes</label>
          <textarea id="ra-action-notes" name="notes" [(ngModel)]="form.notes" maxlength="500"></textarea>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Create {{ request.kind.toLowerCase() }}</button>
        </div>
      </form>
    </div>
  `,
  styles: ['.ra-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0 12px; }']
})
export class RaActionDialog implements OnChanges {
  readonly people = RA_PEOPLE;
  readonly priorities = PRIORITIES;
  readonly today = new Date().toISOString().slice(0, 10);
  @Input({ required: true }) request!: RaActionRequest;
  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<RaActionForm>();
  form: RaActionForm = { title: '', owner: '', due: '', priority: 'High', notes: '' };
  tried = false;

  get heading(): string {
    return `Create ${this.request.kind.toLowerCase()}`;
  }

  get dueError(): string {
    if (!this.form.due) return 'Pick a due date.';
    return this.form.due < this.today ? 'The due date can’t be in the past.' : '';
  }

  ngOnChanges(): void {
    this.tried = false;
    this.form = { title: this.request.title, owner: '', due: '', priority: this.request.priority ?? 'High', notes: '' };
  }

  submit(): void {
    this.tried = true;
    if (!this.form.title.trim() || !this.form.owner || this.dueError) return;
    this.submitted.emit({ ...this.form, title: this.form.title.trim() });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

/** Asks for a name for the current filters. */
@Component({
  selector: 'ra-save-view-dialog',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="close.emit()">
      <form class="dialog" role="dialog" aria-modal="true" aria-label="Save view" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate>
        <h2>Save view</h2>
        <p>Save the current filters so you can come back to this view later.</p>
        <div class="field" [class.invalid]="!!error">
          <label for="ra-view-name">View name <span class="req">*</span></label>
          <input id="ra-view-name" name="name" [(ngModel)]="name" maxlength="60" placeholder="e.g. Dubai HQ – Machinery" />
          @if (error) { <small>{{ error }}</small> }
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Save view</button>
        </div>
      </form>
    </div>
  `
})
export class RaSaveViewDialog {
  /** Names already in use */
  @Input() taken: string[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<string>();
  name = '';
  error = '';

  submit(): void {
    const name = this.name.trim();
    const lower = name.toLowerCase();
    this.error = !name ? 'Enter a name for the view.' : this.taken.some((t) => t.toLowerCase() === lower) ? 'A view with this name already exists.' : '';
    if (!this.error) this.save.emit(name);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

/** A widget shown large in a wide dialog; the page projects the widget body. */
@Component({
  selector: 'ra-expand-dialog',
  standalone: true,
  imports: [LucideAngularModule],
  styleUrls: ['../../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" [attr.aria-label]="title" (click)="$event.stopPropagation()">
        <div class="widget__head">
          <h2>{{ title }}</h2>
          <button type="button" class="icon-btn" aria-label="Close" (click)="close.emit()"><lucide-icon [img]="icons.X" [size]="18" /></button>
        </div>
        <ng-content />
      </div>
    </div>
  `
})
export class RaExpandDialog {
  readonly icons = { X };
  @Input() title = '';
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}
