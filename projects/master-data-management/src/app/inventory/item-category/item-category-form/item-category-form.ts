import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { VALUATION_METHODS, blankItemCategory } from '../../inventory.data';
import { ItemCategoryRecord } from '../../inventory.model';
import { ItemCategoryService, UomService } from '../../inventory.service';

type Tab = 'basic' | 'hierarchy' | 'settings';

/** Right-hand "Add / Edit Category" panel for item categories. */
@Component({
  selector: 'app-item-category-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './item-category-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ItemCategoryForm extends MasterForm<ItemCategoryRecord, Tab> {
  // Items in the category being edited, shown on the Hierarchy tab
  @Input() itemCount = 0;

  protected readonly store = inject(ItemCategoryService);
  readonly uoms = inject(UomService);
  readonly icons = { X };
  readonly valuationMethods = VALUATION_METHODS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): ItemCategoryRecord {
    return blankItemCategory();
  }

  // A category can't sit under itself or one of its own sub-categories
  get parentOptions(): ItemCategoryRecord[] {
    const blocked = this.original ? this.store.descendantCodes(this.original.code) : new Set<string>();
    return this.store.all().filter((c) => !blocked.has(c.code));
  }

  get path(): string {
    return [...this.store.ancestry(this.form.parentCode).map((c) => c.name), this.form.name.trim() || 'New category'].join(' > ');
  }

  get children(): ItemCategoryRecord[] {
    return this.original ? this.store.children(this.original.code) : [];
  }

  protected validate(f: ItemCategoryRecord) {
    const errors: Record<string, string> = {};
    if (!f.status) errors['status'] = 'Select a status.';
    if (f.status === 'Active' && f.parentCode && this.store.find(f.parentCode)?.status === 'Inactive') {
      errors['parentCode'] = 'The parent category is inactive.';
    }
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: ItemCategoryRecord): ItemCategoryRecord {
    return { ...f, description: f.description.trim() };
  }
}
