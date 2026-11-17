import { Component, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Search, X } from 'lucide-angular';
import { InspectionApi } from '../shared/inspection-api';
import { InspectionTask } from '../shared/inspection.models';

/** Inline panel for picking library tasks into a checklist section. */
@Component({
  selector: 'app-checklist-task-picker',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="picker-head">
      <strong class="grow">Add tasks from the library</strong>
      <label class="sec">Into
        <select class="ctl" aria-label="Target section" [ngModel]="section()" (ngModelChange)="section.set($event)">
          <option [ngValue]="null" disabled>Select Target Section</option>
          @for (s of sectionNames(); track $index) { <option [ngValue]="$index">{{ s }}</option> }
        </select>
      </label>
      <button type="button" class="ib" aria-label="Close task picker" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="16"></lucide-icon></button>
    </div>
    <label class="find"><lucide-icon [img]="icons.Search" [size]="15"></lucide-icon>
      <input class="ctl" type="search" placeholder="Search tasks..." aria-label="Search tasks" [(ngModel)]="query" /></label>
    <ul>
      @for (t of pickable(); track t.id) {
        <li><span class="code">{{ t.taskCode }}</span><span class="grow">{{ t.taskTitle }} <span class="muted">· {{ t.taskCategory }}</span></span>
          <button type="button" class="add" [disabled]="section() === null" [title]="section() === null ? 'Select a target section first' : ''" (click)="add.emit(t)"><lucide-icon [img]="icons.Plus" [size]="14"></lucide-icon>Add</button></li>
      } @empty {
        <li class="muted">{{ api.tasks.loading() ? 'Loading tasks…' : 'No more active tasks to add.' }}</li>
      }
    </ul>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #cdbcfa; border-radius: 10px; font-size: 13px; }
    .picker-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .grow { flex: 1; min-width: 0; }
    .muted { color: #6b6880; }
    .sec { display: inline-flex; align-items: center; gap: 6px; }
    .ctl { height: 32px; padding: 0 8px; border: 1px solid #d6d3e0; border-radius: 8px; font: inherit; background: #fff; }
    .find { position: relative; display: flex; align-items: center; }
    .find lucide-icon { position: absolute; left: 10px; color: #6b6880; }
    .find .ctl { width: 100%; padding-left: 32px; }
    .ib { display: inline-flex; border: 0; background: none; padding: 6px; border-radius: 6px; cursor: pointer; color: #6b6880; }
    ul { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
    li { display: flex; align-items: center; gap: 10px; padding: 4px 6px; border-radius: 6px; }
    li:hover { background: #f7f6fb; }
    .code { color: #5b21e6; font-weight: 700; white-space: nowrap; }
    .add { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border: 1px solid #d6d3e0; border-radius: 6px; background: #fff; font: inherit; font-size: 12.5px; cursor: pointer; }
    .add:hover { border-color: #5b21e6; color: #5b21e6; }
  `
})
export class ChecklistTaskPicker {
  readonly api = inject(InspectionApi);
  readonly icons = { Plus, Search, X };
  readonly sectionNames = input.required<string[]>();
  /** Task codes already in the checklist. */
  readonly usedCodes = input.required<string[]>();
  readonly section = model<number | null>(null);
  readonly add = output<InspectionTask>();
  readonly closed = output<void>();
  query = '';

  pickable(): InspectionTask[] {
    const used = new Set(this.usedCodes());
    const q = this.query.trim().toLowerCase();
    return this.api.tasks
      .items()
      .filter((t) => t.isActive && !used.has(t.taskCode) && (!q || `${t.taskCode} ${t.taskTitle} ${t.taskCategory}`.toLowerCase().includes(q)))
      .slice(0, 40);
  }
}
