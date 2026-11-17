import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { MODULE_ICONS, MODULE_ICON_KEYS, moduleIcon } from '../../security-icons';
import { MODULE_CATEGORIES, blankModule } from '../../security.data';
import { ModuleRecord } from '../../security.model';
import { ModuleService } from '../../security.service';

type Tab = 'basic';

/** Right-hand "Add / Edit Module Access" panel. */
@Component({
  selector: 'app-module-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './module-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ModuleForm extends MasterForm<ModuleRecord, Tab> {
  // Permissions and roles using the module being edited
  @Input() usage: { permissions: number; roles: number } | null = null;

  protected readonly store = inject(ModuleService);
  readonly icons = { X };
  readonly moduleIcons = MODULE_ICONS;
  readonly iconKeys = MODULE_ICON_KEYS;
  readonly moduleIcon = moduleIcon;
  readonly categories = MODULE_CATEGORIES;
  readonly tabs: { id: Tab; label: string }[] = [{ id: 'basic', label: 'Basic Information' }];
  iconPickerOpen = false;

  protected blank(): ModuleRecord {
    return blankModule();
  }

  protected validate(f: ModuleRecord) {
    const errors: Record<string, string> = {};
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: ModuleRecord): ModuleRecord {
    return { ...f, description: f.description.trim() };
  }
}
