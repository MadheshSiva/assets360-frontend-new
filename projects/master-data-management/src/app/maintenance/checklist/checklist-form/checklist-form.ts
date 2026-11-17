import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { MasterForm } from '../../form-base';
import { CHECKLIST_CATEGORIES, CHECKLIST_TYPES, RESPONSE_TYPES, blankChecklist } from '../checklist.data';
import { ChecklistRecord, ResponseType } from '../checklist.model';
import { ChecklistService } from '../checklist.service';

type Tab = 'basic' | 'items';

/** Right-hand "Add / Edit Checklist" panel. */
@Component({
  selector: 'app-checklist-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './checklist-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ChecklistForm extends MasterForm<ChecklistRecord, Tab> {
  protected readonly store = inject(ChecklistService);
  readonly icons = { X, Plus, Trash2 };
  readonly types = CHECKLIST_TYPES;
  readonly categories = CHECKLIST_CATEGORIES;
  readonly responseTypes = RESPONSE_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'items', label: 'Checklist Items' }
  ];

  protected blank(): ChecklistRecord {
    return blankChecklist();
  }

  addItem(): void {
    this.form.items = [...this.form.items, { question: '', response: '' as ResponseType, required: true }];
  }

  removeItem(index: number): void {
    this.form.items = this.form.items.filter((_, i) => i !== index);
  }

  protected validate(f: ChecklistRecord) {
    const errors: Record<string, string> = {};
    if (!f.checklistType) errors['checklistType'] = 'Select a type.';
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (Object.keys(errors).length) return { errors, tab: 'basic' as Tab };
    if (!f.items.length) errors['items'] = 'Add at least one item.';
    else if (f.items.some((i) => !i.question.trim())) errors['items'] = 'Fill in every item or remove the empty ones.';
    else if (f.items.some((i) => !i.response)) errors['items'] = 'Select a response type for every item.';
    return { errors, tab: 'items' as Tab };
  }

  protected override tidy(f: ChecklistRecord): ChecklistRecord {
    return { ...f, description: f.description.trim(), items: f.items.map((i) => ({ ...i, question: i.question.trim() })) };
  }
}
