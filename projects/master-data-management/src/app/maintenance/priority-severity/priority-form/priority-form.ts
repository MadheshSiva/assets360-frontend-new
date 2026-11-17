import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../form-base';
import { APPLIES_TO, LEVEL_COLORS, blankPriority } from '../priority-severity.data';
import { PriorityRecord } from '../priority-severity.model';
import { PriorityService } from '../priority-severity.service';

type Tab = 'basic' | 'rules';

/** Right-hand "Add / Edit Priority / Severity" panel. */
@Component({
  selector: 'app-priority-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './priority-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class PriorityForm extends MasterForm<PriorityRecord, Tab> {
  protected readonly store = inject(PriorityService);
  readonly icons = { X };
  readonly colors = LEVEL_COLORS;
  readonly appliesTo = APPLIES_TO;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'rules', label: 'Usage Rules' }
  ];

  protected blank(): PriorityRecord {
    return blankPriority();
  }

  // "Critical" can be both a priority and a severity
  protected override nameTaken(f: PriorityRecord): boolean {
    return this.store.isNameTakenIn(f.kind, f.name, this.original?.code ?? null);
  }

  toggleApplies(a: string): void {
    this.form.appliesTo = this.form.appliesTo.includes(a) ? this.form.appliesTo.filter((x) => x !== a) : [...this.form.appliesTo, a];
  }

  protected validate(f: PriorityRecord) {
    const errors: Record<string, string> = {};
    if (!f.status) errors['status'] = 'Select a status.';
    if (!f.appliesTo.length) errors['appliesTo'] = 'Pick at least one place this level is used.';
    if (f.escalateAfterHours !== null && !(Number.isInteger(f.escalateAfterHours) && f.escalateAfterHours > 0)) errors['escalate'] = 'Enter whole hours, or leave empty.';
    return { errors, tab: (errors['status'] ? 'basic' : 'rules') as Tab };
  }

  protected override tidy(f: PriorityRecord): PriorityRecord {
    return { ...f, responseTime: f.responseTime.trim(), description: f.description.trim() };
  }
}
