import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sharing } from '../interactive-dashboards.data';

export interface NewDashboard {
  name: string;
  description: string;
  sharing: Sharing;
  copyCurrent: boolean;
}

/** Create Dashboard: name, description, sharing and starting layout. */
@Component({
  selector: 'app-idb-create-dashboard-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <form class="dialog" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate role="dialog" aria-modal="true" aria-label="Create dashboard">
        <h2>Create dashboard</h2>
        <div class="field" [class.invalid]="tried && nameError">
          <label for="cd-name">Name <span class="req">*</span></label>
          <input id="cd-name" name="name" [(ngModel)]="name" maxlength="60" placeholder="e.g. Dubai HQ Operations" />
          @if (tried && nameError) { <small>{{ nameError }}</small> }
        </div>
        <div class="field">
          <label for="cd-desc">Description</label>
          <textarea id="cd-desc" name="description" [(ngModel)]="description" maxlength="240"></textarea>
        </div>
        <fieldset class="field idb-fieldset">
          <legend>Sharing</legend>
          @for (s of sharingOptions; track s.value) {
            <label class="idb-radio">
              <input type="radio" name="sharing" [value]="s.value" [(ngModel)]="sharing" />
              <span><b>{{ s.label }}</b><small>{{ s.hint }}</small></span>
            </label>
          }
        </fieldset>
        <fieldset class="field idb-fieldset">
          <legend>Start with</legend>
          <label class="idb-radio">
            <input type="radio" name="start" [value]="false" [(ngModel)]="copyCurrent" />
            <span><b>Blank dashboard</b><small>Add widgets from the Widget Library.</small></span>
          </label>
          <label class="idb-radio">
            <input type="radio" name="start" [value]="true" [(ngModel)]="copyCurrent" />
            <span><b>Copy of “{{ currentName }}”</b><small>Starts with the same widgets and layout.</small></span>
          </label>
        </fieldset>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Create Dashboard</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css'],
  styles: [
    `
      .idb-fieldset { border: 0; padding: 0; margin: 0 0 12px; gap: 8px; }
      .idb-fieldset legend { font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 6px; }
      .idb-radio { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-weight: 400 !important; }
      .idb-radio span { display: flex; flex-direction: column; }
      .idb-radio b { font-weight: 600; color: #0f172a; }
    `
  ]
})
export class CreateDashboardDialog {
  @Input() currentName = '';
  /** Returns true when a dashboard with this name already exists */
  @Input() nameTaken: (name: string) => boolean = () => false;
  @Output() created = new EventEmitter<NewDashboard>();
  @Output() cancel = new EventEmitter<void>();

  readonly sharingOptions: { value: Sharing; label: string; hint: string }[] = [
    { value: 'private', label: 'Private', hint: 'Only you can see it.' },
    { value: 'people', label: 'Specific people and groups', hint: 'Choose who to share with after creating it.' },
    { value: 'organization', label: 'Everyone in Purple IQ Group', hint: 'All users can view it.' }
  ];
  name = '';
  description = '';
  sharing: Sharing = 'private';
  copyCurrent = false;
  tried = false;

  get nameError(): string {
    if (!this.name.trim()) return 'Enter a dashboard name.';
    return this.nameTaken(this.name) ? 'A dashboard with this name already exists.' : '';
  }

  submit(): void {
    this.tried = true;
    if (this.nameError) return;
    this.created.emit({ name: this.name.trim(), description: this.description.trim(), sharing: this.sharing, copyCurrent: this.copyCurrent });
  }
}
