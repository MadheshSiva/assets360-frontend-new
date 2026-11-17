import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { CategoryService } from '../../../asset/category-subcategory/category.service';
import { MasterForm } from '../../form-base';
import { FAILURE_CATEGORIES, FAILURE_SEVERITIES, blankFailureCode } from '../failure-code.data';
import { FailureCodeRecord } from '../failure-code.model';
import { FailureCodeService } from '../failure-code.service';

type Tab = 'basic' | 'classification';

/** Right-hand "Add / Edit Failure Code" panel. */
@Component({
  selector: 'app-failure-code-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './failure-code-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../maintenance-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class FailureCodeForm extends MasterForm<FailureCodeRecord, Tab> {
  protected readonly store = inject(FailureCodeService);
  readonly icons = { X, Plus, Trash2 };
  readonly categories = FAILURE_CATEGORIES;
  readonly severities = FAILURE_SEVERITIES;
  private readonly categoryService = inject(CategoryService);
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'classification', label: 'Classification' }
  ];

  // Asset category names from the categories API, plus any already picked on this record
  get assetCategories(): string[] {
    const names = this.categoryService.all().map((c) => c.name);
    return [...new Set([...names, ...(this.form?.assetCategories ?? [])])];
  }

  protected blank(): FailureCodeRecord {
    return blankFailureCode();
  }

  toggleCategory(c: string): void {
    const list = this.form.assetCategories;
    this.form.assetCategories = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
  }

  addLine(list: 'causes' | 'actions'): void {
    this.form[list] = [...this.form[list], ''];
  }

  removeLine(list: 'causes' | 'actions', index: number): void {
    this.form[list] = this.form[list].filter((_, i) => i !== index);
  }

  protected validate(f: FailureCodeRecord) {
    const errors: Record<string, string> = {};
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.severity) errors['severity'] = 'Select a severity.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: FailureCodeRecord): FailureCodeRecord {
    const clean = (list: string[]) => list.map((x) => x.trim()).filter(Boolean);
    return { ...f, description: f.description.trim(), causes: clean(f.causes), actions: clean(f.actions) };
  }
}
