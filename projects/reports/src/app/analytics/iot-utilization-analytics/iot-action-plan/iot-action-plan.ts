import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ActionPlan {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
}

/** Today as yyyy-MM-dd (local), the earliest due date. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Create action plan" form opened from an IoT insight; the page saves it with POST /action-plans. */
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
          <div class="field" [class.invalid]="tried && !plan.owner.trim()">
            <label for="ap-owner">Owner <span class="req">*</span></label>
            <input id="ap-owner" name="owner" [(ngModel)]="plan.owner" maxlength="100" list="ap-owners" placeholder="Name of the owner" />
            <datalist id="ap-owners">
              @for (p of people; track p) { <option [value]="p"></option> }
            </datalist>
            @if (tried && !plan.owner.trim()) { <small>Enter who owns the plan.</small> }
          </div>
          <div class="field" [class.invalid]="tried && dueError">
            <label for="ap-due">Due date <span class="req">*</span></label>
            <input id="ap-due" name="due" type="date" [min]="minDate" [(ngModel)]="plan.due" />
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
          <button type="submit" class="btn btn--primary" [disabled]="saving">{{ saving ? 'Saving…' : 'Create action plan' }}</button>
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
  /** Technicians from /filters, offered as suggestions; any name can be typed */
  @Input() people: string[] = [];
  @Input() priorities = ['Critical', 'High', 'Medium', 'Low'];
  /** True while the page is saving the plan */
  @Input() saving = false;
  @Output() saved = new EventEmitter<ActionPlan>();
  @Output() cancel = new EventEmitter<void>();

  readonly minDate = today();
  plan: ActionPlan = { title: '', owner: '', due: '', priority: 'High', notes: '' };
  tried = false;

  ngOnInit(): void {
    this.plan.title = this.title;
  }

  get dueError(): string {
    if (!this.plan.due) return 'Pick a due date.';
    return this.plan.due < this.minDate ? 'The due date cannot be in the past.' : '';
  }

  submit(): void {
    this.tried = true;
    if (!this.plan.title.trim() || !this.plan.owner.trim() || this.dueError || this.saving) return;
    this.saved.emit({ ...this.plan, title: this.plan.title.trim(), owner: this.plan.owner.trim() });
  }
}
