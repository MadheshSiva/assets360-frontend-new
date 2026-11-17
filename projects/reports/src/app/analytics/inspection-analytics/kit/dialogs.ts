import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { RA_PEOPLE, downloadCsv } from '../../shared/analytics-common';

// Dialogs shared by the Inspection, Compliance and KPI dashboards. Each closes on Escape or a backdrop click.

function isBackdrop(event: MouseEvent): boolean {
  return event.target === event.currentTarget;
}

export interface ActionPlan {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
}

/** "Create action plan" form (title, owner, due date, priority). */
@Component({
  selector: 'app-ra-action-plan-dialog',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="rak-plan-title" (ngSubmit)="submit()">
        <h2 id="rak-plan-title">Create action plan</h2>
        @if (context) { <p>{{ context }}</p> }
        <div class="field" [class.invalid]="tried && !plan.title.trim()">
          <label for="rak-plan-name">Action plan title <span class="req">*</span></label>
          <input id="rak-plan-name" name="title" maxlength="120" [(ngModel)]="plan.title" />
          @if (tried && !plan.title.trim()) { <small>Enter a title.</small> }
        </div>
        <div class="rak-form-grid">
          <div class="field" [class.invalid]="tried && !plan.owner">
            <label for="rak-plan-owner">Owner <span class="req">*</span></label>
            <select id="rak-plan-owner" name="owner" [(ngModel)]="plan.owner">
              <option value="">Select owner</option>
              @for (p of people; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            @if (tried && !plan.owner) { <small>Choose an owner.</small> }
          </div>
          <div class="field" [class.invalid]="tried && dueError">
            <label for="rak-plan-due">Due date <span class="req">*</span></label>
            <input id="rak-plan-due" name="due" type="date" [min]="today" [(ngModel)]="plan.due" />
            @if (tried && dueError) { <small>{{ dueError }}</small> }
          </div>
          <div class="field">
            <label for="rak-plan-priority">Priority</label>
            <select id="rak-plan-priority" name="priority" [(ngModel)]="plan.priority">
              @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
            </select>
          </div>
        </div>
        <div class="field">
          <label for="rak-plan-notes">Notes</label>
          <textarea id="rak-plan-notes" name="notes" maxlength="500" [(ngModel)]="plan.notes"></textarea>
        </div>
        <p class="muted rak-demo">DEMO MODE: the plan is not sent to the corrective action register yet.</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Create action plan</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaActionPlanDialog implements OnInit {
  @Input() context = '';
  @Input() defaultTitle = '';
  @Input() defaultOwner = '';
  @Output() saved = new EventEmitter<ActionPlan>();
  @Output() closed = new EventEmitter<void>();

  readonly people = RA_PEOPLE;
  readonly priorities = ['Critical', 'High', 'Medium', 'Low'];
  readonly today = new Date().toISOString().slice(0, 10);
  plan: ActionPlan = { title: '', owner: '', due: '', priority: 'High', notes: '' };
  tried = false;

  ngOnInit(): void {
    this.plan.title = this.defaultTitle;
    this.plan.owner = this.defaultOwner;
  }

  get dueError(): string {
    if (!this.plan.due) return 'Choose a due date.';
    return this.plan.due < this.today ? 'The due date cannot be in the past.' : '';
  }

  submit(): void {
    this.tried = true;
    if (!this.plan.title.trim() || !this.plan.owner || this.dueError) return;
    this.saved.emit({ ...this.plan, title: this.plan.title.trim() });
  }

  backdrop(event: MouseEvent): void {
    if (isBackdrop(event)) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

/** Read-only table of rows (e.g. "View findings") with CSV export. */
@Component({
  selector: 'app-ra-list-dialog',
  imports: [LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <div class="rak-list-meta">
          <div>
            <h2>{{ title }}</h2>
            @if (subtitle) { <span class="muted">{{ subtitle }}</span> }
          </div>
          <button type="button" class="icon-btn rak-close" aria-label="Close" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="18" /></button>
        </div>
        @if (rows.length) {
          <div class="table-wrap">
            <table class="table">
              <thead><tr>@for (h of header; track $index) { <th>{{ h }}</th> }</tr></thead>
              <tbody>
                @for (r of rows; track $index) {
                  <tr>@for (c of r; track $index) { <td>{{ c }}</td> }</tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty">Nothing matches the current filters.</div>
        }
        <div class="dialog__actions">
          <button type="button" class="btn" [disabled]="!rows.length" (click)="exportCsv()">Export CSV</button>
          <button type="button" class="btn btn--primary" (click)="closed.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaListDialog {
  readonly icons = { X };
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input({ required: true }) header: string[] = [];
  @Input({ required: true }) rows: (string | number)[][] = [];
  @Input() fileName = 'report.csv';
  @Output() closed = new EventEmitter<void>();

  exportCsv(): void {
    downloadCsv(this.fileName, this.header, this.rows);
  }

  backdrop(event: MouseEvent): void {
    if (isBackdrop(event)) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

export interface DetailField {
  label: string;
  value: string;
}

/** Label / value details for one record, with an optional primary action. */
@Component({
  selector: 'app-ra-detail-dialog',
  imports: [LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <div class="rak-list-meta">
          <div>
            <h2>{{ title }}</h2>
            @if (subtitle) { <span class="muted">{{ subtitle }}</span> }
          </div>
          <button type="button" class="icon-btn rak-close" aria-label="Close" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="18" /></button>
        </div>
        <ng-content />
        <dl class="rak-detail">
          @for (f of fields; track f.label) {
            <div><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div>
          }
        </dl>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Close</button>
          @if (actionLabel) {
            <button type="button" class="btn btn--primary" (click)="action.emit()">{{ actionLabel }}</button>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaDetailDialog {
  readonly icons = { X };
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input({ required: true }) fields: DetailField[] = [];
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  backdrop(event: MouseEvent): void {
    if (isBackdrop(event)) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

/** Asks for a name before saving the current filters as a view. */
@Component({
  selector: 'app-ra-save-view-dialog',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="rak-save-title" (ngSubmit)="submit()">
        <h2 id="rak-save-title">{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="field" [class.invalid]="tried && !name.trim()">
          <label for="rak-view-name">View name <span class="req">*</span></label>
          <input id="rak-view-name" name="name" maxlength="60" [(ngModel)]="name" />
          @if (tried && !name.trim()) { <small>Enter a name for the view.</small> }
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Save view</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaSaveViewDialog implements OnInit {
  @Input() title = 'Save view';
  @Input() description = 'Saves the current filters so you can return to this view later.';
  @Input() defaultName = '';
  @Output() saved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  name = '';
  tried = false;

  ngOnInit(): void {
    this.name = this.defaultName;
  }

  submit(): void {
    this.tried = true;
    if (this.name.trim()) this.saved.emit(this.name.trim());
  }

  backdrop(event: MouseEvent): void {
    if (isBackdrop(event)) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}

/** Share with people (chips) and copy a link. */
@Component({
  selector: 'app-ra-share-dialog',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="rak-share-title" (ngSubmit)="submit()">
        <h2 id="rak-share-title">Share {{ title }}</h2>
        <div class="field" [class.invalid]="tried && !selected.length">
          <label for="rak-share-person">People</label>
          <select id="rak-share-person" name="person" [(ngModel)]="pick" (ngModelChange)="add($event)">
            <option value="">Add a person…</option>
            @for (p of available; track p) { <option [value]="p">{{ p }}</option> }
          </select>
          @if (tried && !selected.length) { <small>Add at least one person.</small> }
        </div>
        @if (selected.length) {
          <div class="rak-chips">
            @for (p of selected; track p) {
              <span class="rak-chip">{{ p }}<button type="button" [attr.aria-label]="'Remove ' + p" (click)="remove(p)"><lucide-icon [img]="icons.X" [size]="12" /></button></span>
            }
          </div>
        }
        <div class="field">
          <label for="rak-share-access">Access</label>
          <select id="rak-share-access" name="access" [(ngModel)]="access">
            <option>Can view</option>
            <option>Can comment</option>
            <option>Can edit layout</option>
          </select>
        </div>
        <div class="field">
          <span>Link</span>
          <div class="rak-link-row">
            <input name="link" [value]="link" readonly aria-label="Share link" />
            <button type="button" class="btn" (click)="copy()">Copy link</button>
          </div>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Share</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaShareDialog {
  readonly icons = { X };
  @Input() title = 'dashboard';
  @Input() link = '';
  /** Toast text for the page (copy confirmations and the final share) */
  @Output() notify = new EventEmitter<string>();
  @Output() shared = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  selected: string[] = [];
  pick = '';
  access = 'Can view';
  tried = false;

  get available(): string[] {
    return RA_PEOPLE.filter((p) => !this.selected.includes(p));
  }

  add(person: string): void {
    if (person && !this.selected.includes(person)) this.selected = [...this.selected, person];
    setTimeout(() => (this.pick = ''));
  }

  remove(person: string): void {
    this.selected = this.selected.filter((p) => p !== person);
  }

  copy(): void {
    const done = () => this.notify.emit('Link copied to the clipboard.');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.link).then(done, () => this.notify.emit('Copy failed — select the link and copy it manually.'));
    } else {
      this.notify.emit('Copy is not available here — select the link and copy it manually.');
    }
  }

  submit(): void {
    this.tried = true;
    if (!this.selected.length) return;
    const who = this.selected.length === 1 ? this.selected[0] : `${this.selected.length} people`;
    this.shared.emit(`Shared with ${who} (${this.access.toLowerCase()}).`);
  }

  backdrop(event: MouseEvent): void {
    if (isBackdrop(event)) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
