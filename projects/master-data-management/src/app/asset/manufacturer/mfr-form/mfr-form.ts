import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Factory, Globe, LucideAngularModule, User, X } from 'lucide-angular';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { BRAND_PALETTE, MANUFACTURER_COUNTRIES, PAYMENT_TERMS, badgeInk, badgeText, blankManufacturer } from '../manufacturer.data';
import { ManufacturerRecord } from '../manufacturer.model';
import { ManufacturerService } from '../manufacturer.service';

/** A new manufacturer starts with every dropdown empty so the user picks each value. */
function newManufacturer(): ManufacturerRecord {
  return { ...blankManufacturer(), defaultCurrency: '', paymentTerms: '' as ManufacturerRecord['paymentTerms'] };
}

export type MfrFormTab = 'basic' | 'contact' | 'support' | 'defaults';
type FieldKey = 'name' | 'code' | 'country' | 'logo' | 'website' | 'email' | 'secondaryEmail' | 'supportPortal' | 'supportEmail' | 'standardWarrantyMonths' | 'slaResponseHours';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
const TAB_OF: Record<FieldKey, MfrFormTab> = {
  name: 'basic',
  code: 'basic',
  country: 'basic',
  logo: 'basic',
  website: 'basic',
  email: 'contact',
  secondaryEmail: 'contact',
  supportPortal: 'support',
  supportEmail: 'support',
  standardWarrantyMonths: 'support',
  slaResponseHours: 'support'
};

/** Right-hand "Add / Edit Manufacturer" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-mfr-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './mfr-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', './mfr-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class MfrForm implements OnChanges {
  // 'edit' changes `manufacturer`; 'add' creates a new one, pre-filled from it if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() manufacturer: ManufacturerRecord | null = null;
  @Input() startTab: MfrFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: ManufacturerRecord; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(ManufacturerService);
  readonly icons = { X, User, Globe, Factory };
  readonly countries = MANUFACTURER_COUNTRIES;
  readonly currencies = CURRENCIES;
  readonly paymentTerms = PAYMENT_TERMS;
  readonly palette = BRAND_PALETTE;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;
  readonly tabs: { id: MfrFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'contact', label: 'Contact & Address' },
    { id: 'support', label: 'Support & Warranty' },
    { id: 'defaults', label: 'Default Settings' }
  ];

  tab: MfrFormTab = 'basic';
  form: ManufacturerRecord = newManufacturer();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: ManufacturerRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.manufacturer : null;
    this.form = this.manufacturer ? structuredClone(this.manufacturer) : newManufacturer();
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // The headquarters country follows the manufacturer's country until it is set separately
  setCountry(country: string): void {
    const previous = this.form.country;
    this.form.country = country;
    if (!this.form.address.country || this.form.address.country === previous) this.form.address.country = country;
  }

  // Support details default to the website and contact details
  fillSupportFromContact(): void {
    const site = this.form.website.trim().replace(/\/$/, '');
    if (!this.form.supportPortal && site) this.form.supportPortal = `${site}/support`;
    if (!this.form.supportEmail) this.form.supportEmail = this.form.email;
    if (!this.form.supportPhone) this.form.supportPhone = this.form.phone;
  }

  onLogoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.errors = { ...this.errors, logo: 'Use a PNG or JPG image.' };
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.errors = { ...this.errors, logo: 'Logo must be 2 MB or smaller.' };
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.form.logo = String(reader.result);
      const { logo, ...rest } = this.errors;
      this.errors = rest;
    };
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.form.logo = null;
  }

  /** True on the final tab, where the primary button saves instead of advancing. */
  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  /** Move to the next tab. */
  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    // Enter key / primary button on earlier tabs just advances
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!f.name.trim()) errors.name = 'Enter a manufacturer name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.country) errors.country = 'Select a country.';
    if (f.website.trim() && !WEB_URL.test(f.website.trim())) errors.website = 'Enter a full URL, e.g. https://www.dell.com';
    if (f.email.trim() && !EMAIL.test(f.email.trim())) errors.email = 'Enter a valid email address.';
    if (f.secondaryEmail.trim() && !EMAIL.test(f.secondaryEmail.trim())) errors.secondaryEmail = 'Enter a valid email address.';
    if (f.supportPortal.trim() && !WEB_URL.test(f.supportPortal.trim())) errors.supportPortal = 'Enter a full URL.';
    if (f.supportEmail.trim() && !EMAIL.test(f.supportEmail.trim())) errors.supportEmail = 'Enter a valid email address.';
    if (!Number.isInteger(f.standardWarrantyMonths) || f.standardWarrantyMonths < 0 || f.standardWarrantyMonths > 240) {
      errors.standardWarrantyMonths = 'Enter 0 to 240 months.';
    }
    if (!Number.isInteger(f.slaResponseHours) || f.slaResponseHours < 1 || f.slaResponseHours > 720) errors.slaResponseHours = 'Enter 1 to 720 hours.';
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      // Show the first tab that has a problem
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))!.id;
      return;
    }

    const now = new Date();
    const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const trim = (v: string) => v.trim();
    this.saved.emit({
      record: {
        ...f,
        name: trim(f.name),
        code: trim(f.code),
        website: trim(f.website),
        description: trim(f.description),
        email: trim(f.email),
        secondaryEmail: trim(f.secondaryEmail),
        supportPortal: trim(f.supportPortal),
        supportEmail: trim(f.supportEmail),
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? '',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
