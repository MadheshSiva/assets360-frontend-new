import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { STANDARD_CATEGORIES, STANDARD_ORGANIZATIONS, blankStandard } from '../../compliance.data';
import { StandardRecord } from '../../compliance.model';
import { CertificationTypeService, RegulationService, StandardService } from '../../compliance.service';

type Tab = 'basic' | 'details';

const WEB_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;

/** Right-hand "Add / Edit Standard" panel. */
@Component({
  selector: 'app-standard-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './standard-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class StandardForm extends MasterForm<StandardRecord, Tab> {
  protected readonly store = inject(StandardService);
  private readonly certifications = inject(CertificationTypeService);
  private readonly regulations = inject(RegulationService);
  readonly icons = { X };
  readonly organizations = STANDARD_ORGANIZATIONS;
  readonly categories = STANDARD_CATEGORIES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'details', label: 'Details' }
  ];

  protected blank(): StandardRecord {
    return blankStandard();
  }

  /** Certification types and regulations that refer to this standard. */
  get usedBy(): string[] {
    if (!this.original) return [];
    const code = this.original.code;
    return [...this.certifications.usingStandard(code).map((c) => `${c.name} (certification type)`), ...this.regulations.usingStandard(code).map((r) => `${r.name} (regulation)`)];
  }

  protected validate(f: StandardRecord) {
    const errors: Record<string, string> = {};
    if (!f.organization) errors['organization'] = 'Select an organization.';
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (errors['organization'] || errors['category'] || errors['status']) return { errors, tab: 'basic' as Tab };
    if (f.url.trim() && !WEB_URL.test(f.url.trim())) errors['url'] = 'Enter a full URL, e.g. https://www.iso.org';
    if (f.publishedOn && f.nextReview && f.nextReview <= f.publishedOn) errors['nextReview'] = 'Must be after the publication date.';
    return { errors, tab: 'details' as Tab };
  }

  protected override tidy(f: StandardRecord): StandardRecord {
    return { ...f, version: f.version.trim(), description: f.description.trim(), title: f.title.trim(), url: f.url.trim() };
  }
}
