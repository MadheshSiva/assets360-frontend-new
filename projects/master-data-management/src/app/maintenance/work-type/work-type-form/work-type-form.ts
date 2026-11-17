import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { SkillService } from '../../../people/skill/skill.service';
import { ChecklistService } from '../../checklist/checklist.service';
import { MasterForm } from '../../form-base';
import { MaintenanceTypeService } from '../../maintenance-type/maintenance-type.service';
import { PriorityService } from '../../priority-severity/priority-severity.service';
import { blankWorkType } from '../work-type.data';
import { WorkTypeRecord } from '../work-type.model';
import { WorkTypeService } from '../work-type.service';

type Tab = 'basic' | 'details';

/** Right-hand "Add / Edit Work Type" panel. */
@Component({
  selector: 'app-work-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './work-type-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class WorkTypeForm extends MasterForm<WorkTypeRecord, Tab> {
  protected readonly store = inject(WorkTypeService);
  private readonly types = inject(MaintenanceTypeService);
  private readonly priorities = inject(PriorityService);
  private readonly skills = inject(SkillService);
  private readonly checklists = inject(ChecklistService);
  readonly icons = { X };
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'details', label: 'Additional Details' }
  ];

  constructor() {
    super();
    this.types.ensureLoaded();
    this.priorities.ensureLoaded();
    this.checklists.ensureLoaded();
  }

  protected blank(): WorkTypeRecord {
    return blankWorkType();
  }

  get typeOptions(): string[] {
    return this.types.activeNames(this.form.maintenanceType);
  }

  get priorityOptions(): string[] {
    return this.priorities.activePriorityNames(this.form.defaultPriority);
  }

  get skillOptions(): string[] {
    return this.skills.activeNames(this.form.requiredSkill ? [this.form.requiredSkill] : []);
  }

  get checklistOptions() {
    return this.checklists.all().filter((c) => c.status === 'Active' || c.code === this.form.checklistCode);
  }

  protected validate(f: WorkTypeRecord) {
    const errors: Record<string, string> = {};
    if (!f.maintenanceType) errors['maintenanceType'] = 'Select a maintenance type.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (!(f.durationHours > 0)) errors['hours'] = 'Enter a duration above 0.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: WorkTypeRecord): WorkTypeRecord {
    return { ...f, description: f.description.trim() };
  }
}
