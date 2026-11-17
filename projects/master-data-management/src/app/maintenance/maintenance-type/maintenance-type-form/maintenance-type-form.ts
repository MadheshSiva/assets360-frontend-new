import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../form-base';
import { PriorityService } from '../../priority-severity/priority-severity.service';
import { TYPE_COLORS, blankMaintenanceType } from '../maintenance-type.data';
import { MaintenanceTypeRecord } from '../maintenance-type.model';
import { MaintenanceTypeService } from '../maintenance-type.service';

type Tab = 'basic' | 'settings';

/** Right-hand "Add / Edit Maintenance Type" panel. */
@Component({
  selector: 'app-maintenance-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './maintenance-type-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class MaintenanceTypeForm extends MasterForm<MaintenanceTypeRecord, Tab> {
  protected readonly store = inject(MaintenanceTypeService);
  readonly priorities = inject(PriorityService);
  readonly icons = { X };
  readonly colors = TYPE_COLORS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'settings', label: 'Settings' }
  ];

  constructor() {
    super();
    this.priorities.ensureLoaded();
  }

  protected blank(): MaintenanceTypeRecord {
    return blankMaintenanceType();
  }

  protected validate(f: MaintenanceTypeRecord) {
    const errors: Record<string, string> = {};
    if (!f.description.trim()) errors['description'] = 'Enter a description.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: MaintenanceTypeRecord): MaintenanceTypeRecord {
    return { ...f, description: f.description.trim() };
  }
}
