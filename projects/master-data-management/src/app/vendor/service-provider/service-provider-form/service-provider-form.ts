import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { nowStamp } from '../../../people/people.data';
import { SkillService } from '../../../people/skill/skill.service';
import { BASE_TAB_OF, VendorAddressFields, VendorBasic, VendorDocuments, VendorErrors, cleanVendorBase, validateVendorBase } from '../../vendor-fields/vendor-fields';
import { VENDOR_COUNTRIES } from '../../vendor.data';
import { COVERAGE_AREAS, SERVICE_TYPES, blankServiceProvider } from '../service-provider.data';
import { ServiceProviderRecord } from '../service-provider.model';
import { ServiceProviderService } from '../service-provider.service';

type FormTab = 'basic' | 'services' | 'address' | 'compliance' | 'documents' | 'settings';
type ListKey = 'services' | 'skills' | 'coverage';

const TAB_OF: Record<string, FormTab> = {
  ...BASE_TAB_OF,
  serviceType: 'basic',
  country: 'basic',
  technicians: 'services',
  responseHours: 'services',
  licenceExpiry: 'compliance',
  rating: 'settings'
};

/** Right-hand "Add / Edit Service Provider" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-service-provider-form',
  imports: [FormsModule, LucideAngularModule, VendorBasic, VendorAddressFields, VendorDocuments],
  templateUrl: './service-provider-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ServiceProviderForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() provider: ServiceProviderRecord | null = null;
  @Output() saved = new EventEmitter<{ record: ServiceProviderRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(ServiceProviderService);
  readonly skillService = inject(SkillService);
  readonly icons = { X };
  readonly serviceTypes = SERVICE_TYPES;
  readonly coverageAreas = COVERAGE_AREAS;
  readonly countries = VENDOR_COUNTRIES;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'services', label: 'Services & Capabilities' },
    { id: 'address', label: 'Address & Contact' },
    { id: 'compliance', label: 'Qualification & Compliance' },
    { id: 'documents', label: 'Documents' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: ServiceProviderRecord = blankServiceProvider();
  errors: VendorErrors = {};
  private original: ServiceProviderRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.provider : null;
    this.form = this.provider ? structuredClone(this.provider) : blankServiceProvider();
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get skillOptions(): string[] {
    return this.skillService.activeNames(this.form.skills);
  }

  setCountry(country: string): void {
    if (!this.form.address.country || this.form.address.country === this.form.country) this.form.address.country = country;
    this.form.country = country;
  }

  // The main service type is always one of the services offered
  setServiceType(type: string): void {
    this.form.serviceType = type;
    if (type && !this.form.services.includes(type)) this.form.services = [type, ...this.form.services];
  }

  has(list: ListKey, value: string): boolean {
    return this.form[list].includes(value);
  }

  toggle(list: ListKey, value: string): void {
    if (list === 'services' && value === this.form.serviceType) return;
    const current = this.form[list];
    this.form[list] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  expired(date: string): boolean {
    return !!date && date < this.today;
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
    const code = this.original?.code ?? null;
    const errors = validateVendorBase(f, { code: this.service.isCodeTaken(f.code, code), name: this.service.isNameTaken(f.name, code) }, 'Service Provider');
    if (!f.serviceType) errors['serviceType'] = 'Select a service type.';
    if (!f.country) errors['country'] = 'Select a country.';
    if (!Number.isInteger(f.technicians) || f.technicians < 0) errors['technicians'] = 'Enter 0 or more.';
    if (!Number.isInteger(f.responseHours) || f.responseHours < 1 || f.responseHours > 720) errors['responseHours'] = 'Enter 1 to 720 hours.';
    if (f.status === 'Active' && this.expired(f.licenceExpiry)) errors['licenceExpiry'] = 'The trade licence has expired; renew it or mark the provider Inactive.';
    if (!(f.rating >= 0 && f.rating <= 5)) errors['rating'] = 'Enter 0 to 5.';
    this.errors = errors;

    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))?.id ?? 'basic';
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...cleanVendorBase(f),
        licenceNo: f.licenceNo.trim(),
        insurancePolicy: f.insurancePolicy.trim(),
        rating: Math.round(f.rating * 10) / 10,
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: code
    });
  }
}
