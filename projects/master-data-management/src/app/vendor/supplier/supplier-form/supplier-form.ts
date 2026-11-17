import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { CategoryService } from '../../../asset/category-subcategory/category.service';
import { ManufacturerService } from '../../../asset/manufacturer/manufacturer.service';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { nowStamp } from '../../../people/people.data';
import { BASE_TAB_OF, VendorAddressFields, VendorBasic, VendorDocuments, VendorErrors, cleanVendorBase, validateVendorBase } from '../../vendor-fields/vendor-fields';
import { VENDOR_COUNTRIES } from '../../vendor.data';
import { PAYMENT_TERMS, SUPPLIER_CATEGORIES, blankSupplier } from '../supplier.data';
import { SupplierRecord } from '../supplier.model';
import { SupplierService } from '../supplier.service';

type FormTab = 'basic' | 'address' | 'products' | 'financial' | 'documents' | 'settings';

const TAB_OF: Record<string, FormTab> = { ...BASE_TAB_OF, category: 'basic', country: 'basic', creditLimit: 'financial', iban: 'financial', rating: 'settings' };

/** Right-hand "Add / Edit Supplier" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-supplier-form',
  imports: [FormsModule, LucideAngularModule, VendorBasic, VendorAddressFields, VendorDocuments],
  templateUrl: './supplier-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class SupplierForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() supplier: SupplierRecord | null = null;
  @Output() saved = new EventEmitter<{ record: SupplierRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(SupplierService);
  readonly assetCategories = inject(CategoryService);
  readonly manufacturers = inject(ManufacturerService);
  readonly icons = { X, Plus, Trash2 };
  readonly categories = SUPPLIER_CATEGORIES;
  readonly countries = VENDOR_COUNTRIES;
  readonly currencies = CURRENCIES;
  readonly paymentTerms = PAYMENT_TERMS;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'address', label: 'Address & Contact' },
    { id: 'products', label: 'Products & Categories' },
    { id: 'financial', label: 'Financial' },
    { id: 'documents', label: 'Documents' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: SupplierRecord = blankSupplier();
  brandSearch = '';
  errors: VendorErrors = {};
  private original: SupplierRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.supplier : null;
    this.form = this.supplier ? structuredClone(this.supplier) : blankSupplier();
    this.brandSearch = '';
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get categoryNames(): string[] {
    return this.assetCategories.all().map((c) => c.name);
  }

  get brandOptions(): string[] {
    const term = this.brandSearch.trim().toLowerCase();
    // Active manufacturers plus brands already chosen
    const names = [...new Set([...this.manufacturers.activeNames(), ...this.form.brands])];
    return names.filter((b) => !term || b.toLowerCase().includes(term));
  }

  // The address country follows the supplier's country until it is set separately
  setCountry(country: string): void {
    if (!this.form.address.country || this.form.address.country === this.form.country) this.form.address.country = country;
    this.form.country = country;
  }

  toggle(list: 'assetCategories' | 'brands', value: string): void {
    const current = this.form[list];
    this.form[list] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  addProduct(): void {
    this.form.products = [...this.form.products, ''];
  }

  removeProduct(index: number): void {
    this.form.products = this.form.products.filter((_, i) => i !== index);
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
    const errors = validateVendorBase(f, { code: this.service.isCodeTaken(f.code, code), name: this.service.isNameTaken(f.name, code) }, 'Supplier');
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.country) errors['country'] = 'Select a country.';
    if (f.creditLimit !== null && !(f.creditLimit >= 0)) errors['creditLimit'] = 'Enter 0 or more.';
    if (f.iban.trim() && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/i.test(f.iban.trim())) errors['iban'] = 'Enter a valid IBAN, e.g. AE07 0331 2345 6789 0123 456.';
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
        products: f.products.map((p) => p.trim()).filter(Boolean),
        iban: f.iban.trim().toUpperCase(),
        rating: Math.round(f.rating * 10) / 10,
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: code
    });
  }
}
