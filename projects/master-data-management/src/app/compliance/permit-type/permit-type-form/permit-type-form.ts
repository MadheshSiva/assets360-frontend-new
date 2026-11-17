import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { APPROVER_ROLES, PERMIT_CATEGORIES, blankPermitType } from '../../compliance.data';
import { PermitTypeRecord } from '../../compliance.model';
import { PermitTypeService } from '../../compliance.service';

type Tab = 'basic' | 'workflow';

/** Right-hand "Add / Edit Permit Type" panel. */
@Component({
  selector: 'app-permit-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './permit-type-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class PermitTypeForm extends MasterForm<PermitTypeRecord, Tab> {
  protected readonly store = inject(PermitTypeService);
  readonly icons = { X };
  readonly categories = PERMIT_CATEGORIES;
  readonly roles = APPROVER_ROLES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'workflow', label: 'Workflow & Validity' }
  ];

  protected blank(): PermitTypeRecord {
    return blankPermitType();
  }

  toggleRole(role: string): void {
    const roles = this.form.approverRoles;
    this.form.approverRoles = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
  }

  protected validate(f: PermitTypeRecord) {
    const errors: Record<string, string> = {};
    if (!f.category) errors['category'] = 'Select a category.';
    if (!Number.isInteger(f.validDays) || f.validDays < 1 || f.validDays > 365) errors['validDays'] = 'Enter 1 to 365 days.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (errors['category'] || errors['validDays'] || errors['status']) return { errors, tab: 'basic' as Tab };
    if (!Number.isInteger(f.approvalLevels) || f.approvalLevels < 1 || f.approvalLevels > 5) errors['approvalLevels'] = 'Enter 1 to 5.';
    else if (f.approverRoles.length < f.approvalLevels) errors['approverRoles'] = `Pick at least ${f.approvalLevels} approver roles, one per level.`;
    if (!Number.isInteger(f.maxExtensionDays) || f.maxExtensionDays < 0 || f.maxExtensionDays > f.validDays * 2) {
      errors['maxExtensionDays'] = `Enter 0 to ${f.validDays * 2} days (twice the validity at most).`;
    }
    return { errors, tab: 'workflow' as Tab };
  }

  protected override tidy(f: PermitTypeRecord): PermitTypeRecord {
    return { ...f, description: f.description.trim(), approverRoles: this.roles.filter((r) => f.approverRoles.includes(r)) };
  }
}
