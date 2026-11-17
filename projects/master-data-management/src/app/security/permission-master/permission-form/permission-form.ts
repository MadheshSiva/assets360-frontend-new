import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { PERMISSION_TYPES, blankPermission } from '../../security.data';
import { PermissionRecord } from '../../security.model';
import { ModuleService, PermissionService } from '../../security.service';

type Tab = 'basic';

/** Right-hand "Add / Edit Permission" panel. */
@Component({
  selector: 'app-permission-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './permission-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class PermissionForm extends MasterForm<PermissionRecord, Tab> {
  // Roles that grant the permission being edited
  @Input() roleCount = 0;

  protected readonly store = inject(PermissionService);
  readonly modules = inject(ModuleService);
  readonly icons = { X };
  readonly types = PERMISSION_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [{ id: 'basic', label: 'Basic Information' }];

  protected blank(): PermissionRecord {
    return blankPermission();
  }

  // Active modules, plus the current one whatever its status
  get moduleOptions() {
    return this.modules.all().filter((m) => m.status === 'Active' || m.code === this.form.module);
  }

  // Names only need to be unique within a module (e.g. "View" in two modules)
  protected override nameTaken(f: PermissionRecord): boolean {
    return this.store.isNameTakenIn(f.module, f.name, this.original?.code ?? null);
  }

  protected validate(f: PermissionRecord) {
    const errors: Record<string, string> = {};
    if (!f.module) errors['module'] = 'Select a module.';
    if (!f.type) errors['type'] = 'Select a permission type.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: PermissionRecord): PermissionRecord {
    return { ...f, description: f.description.trim() };
  }
}
