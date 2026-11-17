import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { MasterForm } from '../../form-base';
import { MaintenanceTypeService } from '../../maintenance-type/maintenance-type.service';
import { blankTaskTemplate } from '../task-template.data';
import { TaskTemplateRecord } from '../task-template.model';
import { TaskTemplateService } from '../task-template.service';

type Tab = 'basic' | 'tasks';

/** Right-hand "Add / Edit Task Template" panel. */
@Component({
  selector: 'app-task-template-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './task-template-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class TaskTemplateForm extends MasterForm<TaskTemplateRecord, Tab> {
  protected readonly store = inject(TaskTemplateService);
  private readonly types = inject(MaintenanceTypeService);
  readonly icons = { X, Plus, Trash2 };
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'tasks', label: 'Tasks' }
  ];

  constructor() {
    super();
    this.types.ensureLoaded();
  }

  protected blank(): TaskTemplateRecord {
    return blankTaskTemplate();
  }

  get typeOptions(): string[] {
    return this.types.activeNames(this.form.maintenanceType);
  }

  /** Sum of the task minutes, in hours to two decimals. */
  get taskHours(): number {
    const minutes = this.form.tasks.reduce((sum, t) => sum + (Number(t.minutes) || 0), 0);
    return Math.round((minutes / 60) * 100) / 100;
  }

  addTask(): void {
    this.form.tasks = [...this.form.tasks, { description: '', minutes: 15, required: true }];
  }

  removeTask(index: number): void {
    this.form.tasks = this.form.tasks.filter((_, i) => i !== index);
  }

  protected validate(f: TaskTemplateRecord) {
    const errors: Record<string, string> = {};
    if (!f.maintenanceType) errors['maintenanceType'] = 'Select a maintenance type.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (!(f.estimatedHours > 0)) errors['hours'] = 'Enter a duration above 0.';
    if (Object.keys(errors).length) return { errors, tab: 'basic' as Tab };
    if (!f.tasks.length) errors['tasks'] = 'Add at least one task.';
    else if (f.tasks.some((t) => !t.description.trim() || !(Number(t.minutes) > 0))) errors['tasks'] = 'Every task needs a description and minutes.';
    return { errors, tab: 'tasks' as Tab };
  }

  protected override tidy(f: TaskTemplateRecord): TaskTemplateRecord {
    return { ...f, description: f.description.trim(), tasks: f.tasks.map((t) => ({ ...t, description: t.description.trim(), minutes: Number(t.minutes) })) };
  }
}
