import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { APPLICABLE_TO, CERT_CATEGORIES, DOCUMENT_OPTIONS, blankCertificationType } from '../../compliance.data';
import { CertificationTypeRecord } from '../../compliance.model';
import { CertificationTypeService, StandardService } from '../../compliance.service';

type Tab = 'basic' | 'requirements' | 'settings';

/** Right-hand "Add / Edit Certification Type" panel. */
@Component({
  selector: 'app-certification-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './certification-type-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class CertificationTypeForm extends MasterForm<CertificationTypeRecord, Tab> {
  protected readonly store = inject(CertificationTypeService);
  readonly standards = inject(StandardService);
  readonly icons = { X };
  readonly categories = CERT_CATEGORIES;
  readonly targets = APPLICABLE_TO;
  readonly documents = DOCUMENT_OPTIONS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'settings', label: 'Settings' }
  ];

  constructor() {
    super();
    this.standards.ensureLoaded();
  }

  protected blank(): CertificationTypeRecord {
    return blankCertificationType();
  }

  toggle(list: 'applicableTo' | 'requiredDocuments', value: string): void {
    const current = this.form[list];
    this.form[list] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  protected validate(f: CertificationTypeRecord) {
    const errors: Record<string, string> = {};
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (!f.applicableTo.length) errors['applicableTo'] = 'Pick at least one.';
    if (!Number.isInteger(f.validityMonths) || f.validityMonths < 1 || f.validityMonths > 120) errors['validityMonths'] = 'Enter 1 to 120 months.';
    if (!Number.isInteger(f.renewalReminderDays) || f.renewalReminderDays < 0) errors['renewalReminderDays'] = 'Enter 0 or more days.';
    else if (f.validityMonths > 0 && f.renewalReminderDays > f.validityMonths * 30) errors['renewalReminderDays'] = 'The reminder can’t be longer than the validity.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: CertificationTypeRecord): CertificationTypeRecord {
    return { ...f, description: f.description.trim(), issuingBody: f.issuingBody.trim(), applicableTo: this.targets.filter((t) => f.applicableTo.includes(t)) };
  }
}
