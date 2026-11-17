import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { CategoryService } from '../../../asset/category-subcategory/category.service';
import { MasterForm } from '../../../maintenance/form-base';
import { REGULATION_CATEGORIES, REGULATION_COUNTRIES, blankRegulation } from '../../compliance.data';
import { RegulationRecord } from '../../compliance.model';
import { RegulationService, StandardService } from '../../compliance.service';

type Tab = 'basic' | 'scope';

/** Right-hand "Add / Edit Regulation" panel. */
@Component({
  selector: 'app-regulation-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './regulation-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class RegulationForm extends MasterForm<RegulationRecord, Tab> {
  protected readonly store = inject(RegulationService);
  readonly standards = inject(StandardService);
  readonly assetCategories = inject(CategoryService);
  readonly icons = { X };
  readonly countries = REGULATION_COUNTRIES;
  readonly categories = REGULATION_CATEGORIES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'scope', label: 'Scope & Applicability' }
  ];

  constructor() {
    super();
    this.standards.ensureLoaded();
  }

  protected blank(): RegulationRecord {
    return blankRegulation();
  }

  get categoryNames(): string[] {
    return this.assetCategories.all().map((c) => c.name);
  }

  toggle(list: 'assetCategories' | 'standardCodes', value: string): void {
    const current = this.form[list];
    this.form[list] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  protected validate(f: RegulationRecord) {
    const errors: Record<string, string> = {};
    if (!f.country) errors['country'] = 'Select a country.';
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (errors['country'] || errors['category'] || errors['status']) return { errors, tab: 'basic' as Tab };
    if (!Number.isInteger(f.reviewMonths) || f.reviewMonths < 1 || f.reviewMonths > 120) errors['reviewMonths'] = 'Enter 1 to 120 months.';
    return { errors, tab: 'scope' as Tab };
  }

  protected override tidy(f: RegulationRecord): RegulationRecord {
    return { ...f, description: f.description.trim(), issuingAuthority: f.issuingAuthority.trim(), penalties: f.penalties.trim() };
  }
}
