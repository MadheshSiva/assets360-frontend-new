import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RA_PEOPLE } from '../../shared/analytics-common';

export interface ActionPlan {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
}

/** "Create action plan" form opened from an IoT insight. */
@Component({
  selector: 'app-iot-action-plan',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <form class="dialog" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate>
        <h2>Create action plan</h2>
        <p>{{ context }}</p>
        <div class="field" [class.invalid]="tried && !plan.title.trim()">
          <label for="ap-title">Title <span class="req">*</span></label>
          <input id="ap-title" name="title" [(ngModel)]="plan.title" maxlength="120" />
          @if (tried && !plan.title.trim()) { <small>Enter a title.</small> }
        </div>
        <div class="iot-ap-row">
          <div class="field" [class.invalid]="tried && !plan.owner">
            <label for="ap-owner">Owner <span class="req">*</span></label>
            <select id="ap-owner" name="owner" [(ngModel)]="plan.owner">
              <option value="">Select owner</option>
              @for (p of people; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            @if (tried && !plan.owner) { <small>Choose who owns the plan.</small> }
          </div>
          <div class="field" [class.invalid]="tried && dueError">
            <label for="ap-due">Due date <span class="req">*</span></label>
            <input id="ap-due" name="due" type="date" min="2026-10-28" [(ngModel)]="plan.due" />
            @if (tried && dueError) { <small>{{ dueError }}</small> }
          </div>
          <div class="field">
            <label for="ap-priority">Priority</label>
            <select id="ap-priority" name="priority" [(ngModel)]="plan.priority">
              @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
            </select>
          </div>
        </div>
        <div class="field">
          <label for="ap-notes">Notes</label>
          <textarea id="ap-notes" name="notes" [(ngModel)]="plan.notes" maxlength="1000"></textarea>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Create action plan</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css'],
  styles: [
    `
      .iot-ap-row { display: grid; grid-template-columns: 1.3fr 1fr 0.9fr; gap: 10px; }
      @media (max-width: 640px) { .iot-ap-row { grid-template-columns: 1fr; } }
    `
  ]
})
export class IotActionPlanDialog implements OnInit {
  @Input() title = '';
  @Input() context = '';
  @Output() saved = new EventEmitter<ActionPlan>();
  @Output() cancel = new EventEmitter<void>();

  readonly people = RA_PEOPLE;
  readonly priorities = ['Critical', 'High', 'Medium', 'Low'];
  plan: ActionPlan = { title: '', owner: '', due: '', priority: 'High', notes: '' };
  tried = false;

  ngOnInit(): void {
    this.plan.title = this.title;
  }

  get dueError(): string {
    if (!this.plan.due) return 'Pick a due date.';
    return this.plan.due < '2026-10-28' ? 'The due date cannot be in the past.' : '';
  }

  submit(): void {
    this.tried = true;
    if (!this.plan.title.trim() || !this.plan.owner || this.dueError) return;
    this.saved.emit({ ...this.plan, title: this.plan.title.trim() });
  }
}
