import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { badgeInk, badgeText } from '../../asset/manufacturer/manufacturer.data';
import { EMAIL, readPhoto } from '../../people/people.data';
import { DOCUMENT_TYPES, VENDOR_COUNTRIES, VENDOR_PALETTE, WEB_URL } from '../vendor.data';
import { VendorBase } from '../vendor.model';

export type VendorErrors = Partial<Record<string, string>>;

const FIELD_STYLES = ['../../shared/styles/mdm-drawer.css', '../../shared/styles/mdm-drawer-extras.css', '../../people/people-form.css', './vendor-fields.css'];

/**
 * Basic Information tab shared by the vendor drawers: logo, name, code, website, contact and
 * status. Type-specific fields (category, service type, contract…) are projected into the
 * middle column.
 */
@Component({
  selector: 'app-vendor-basic',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './vendor-basic.html',
  styleUrls: FIELD_STYLES
})
export class VendorBasic {
  @Input({ required: true }) vendor!: VendorBase;
  @Input({ required: true }) errors!: VendorErrors;
  @Input() noun = 'Vendor';

  readonly icons = { Camera };
  readonly palette = VENDOR_PALETTE;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;

  onLogoPicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.vendor.logo = url;
        delete this.errors['logo'];
      },
      (message) => (this.errors['logo'] = message)
    );
  }
}

/** Address & Contact tab: address plus an alternate contact. */
@Component({
  selector: 'app-vendor-address',
  imports: [FormsModule],
  templateUrl: './vendor-address.html',
  styleUrls: FIELD_STYLES
})
export class VendorAddressFields {
  @Input({ required: true }) vendor!: VendorBase;
  @Input({ required: true }) errors!: VendorErrors;

  readonly countries = VENDOR_COUNTRIES;
}

/** Documents tab: trade licence, insurance and other papers with expiry dates. */
@Component({
  selector: 'app-vendor-documents',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './vendor-documents.html',
  styleUrls: FIELD_STYLES
})
export class VendorDocuments {
  @Input({ required: true }) vendor!: VendorBase;
  @Input({ required: true }) errors!: VendorErrors;

  readonly icons = { Plus, Trash2 };
  readonly types = DOCUMENT_TYPES;
  readonly today = new Date().toISOString().slice(0, 10);

  add(): void {
    this.vendor.documents = [...this.vendor.documents, { name: '', type: '', expiry: '' }];
  }

  remove(index: number): void {
    this.vendor.documents = this.vendor.documents.filter((_, i) => i !== index);
  }

  // Expires within 30 days
  expiringSoon(expiry: string): boolean {
    if (!expiry || expiry < this.today) return false;
    return new Date(expiry).getTime() - Date.now() < 30 * 86400000;
  }
}

/**
 * Checks shared by every vendor type. `isCodeTaken` / `isNameTaken` come from the type's service.
 * Returns errors keyed by field, plus the tab each belongs to via `tabOf`.
 */
export function validateVendorBase(f: VendorBase, taken: { code: boolean; name: boolean }, noun: string): VendorErrors {
  const errors: VendorErrors = {};
  if (!f.name.trim()) errors['name'] = `Enter the ${noun.toLowerCase()} name.`;
  else if (taken.name) errors['name'] = `${f.name.trim()} already exists.`;
  if (!f.code.trim()) errors['code'] = 'Enter a code.';
  else if (taken.code) errors['code'] = `${f.code.trim()} is already used.`;
  if (!f.status) errors['status'] = 'Select a status.';
  if (f.website.trim() && !WEB_URL.test(f.website.trim())) errors['website'] = 'Enter a full URL, e.g. https://www.example.com';
  if (f.email.trim() && !EMAIL.test(f.email.trim())) errors['email'] = 'Enter a valid email address.';
  if (f.alternateEmail.trim() && !EMAIL.test(f.alternateEmail.trim())) errors['alternateEmail'] = 'Enter a valid email address.';
  if (f.documents.some((d) => !d.name.trim())) errors['documents'] = 'Name every document or remove the empty ones.';
  else if (f.documents.some((d) => !d.type)) errors['documents'] = 'Select a type for every document.';
  return errors;
}

/** Trims the shared text fields before saving. */
export function cleanVendorBase<T extends VendorBase>(f: T): T {
  return {
    ...f,
    name: f.name.trim(),
    code: f.code.trim().toUpperCase(),
    website: f.website.trim(),
    contactPerson: f.contactPerson.trim(),
    email: f.email.trim().toLowerCase(),
    phone: f.phone.trim(),
    alternateEmail: f.alternateEmail.trim().toLowerCase(),
    documents: f.documents.map((d) => ({ ...d, name: d.name.trim() }))
  };
}

export const BASE_TAB_OF: Record<string, 'basic' | 'address' | 'documents'> = {
  name: 'basic',
  code: 'basic',
  website: 'basic',
  email: 'basic',
  logo: 'basic',
  status: 'basic',
  alternateEmail: 'address',
  documents: 'documents'
};
