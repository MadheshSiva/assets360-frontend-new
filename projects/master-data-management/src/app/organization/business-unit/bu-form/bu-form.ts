import { Component, EventEmitter, Input, OnChanges, Output, inject, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, User, X } from 'lucide-angular';
import { COUNTRIES, CURRENCIES } from '../../organization/organization.data';
import { DepartmentService } from '../../department/department.service';
import { OrganizationService } from '../../organization/organization.service';
import { blankBusinessUnit } from '../business-unit.data';
import { MASTER_ICONS, MASTER_ICON_KEYS } from '../../../shared/master-icons';
import { BusinessUnitRecord } from '../business-unit.model';
import { BusinessUnitService } from '../business-unit.service';

type FormTab = 'basic' | 'hierarchy' | 'contact' | 'settings';
type FieldKey = 'name' | 'code' | 'organizationCode' | 'logo' | 'parentCode' | 'email' | 'effectiveTo';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Right-hand "Add / Edit Business Unit" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-bu-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './bu-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class BuForm implements OnChanges {
  // 'edit' changes `unit`; 'add' creates a new one, pre-filled from `unit` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() unit: BusinessUnitRecord | null = null;
  @Input() saving = false;
  @Output() saved = new EventEmitter<{ record: BusinessUnitRecord; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(BusinessUnitService);
  readonly organizations = inject(OrganizationService);
  readonly departments = inject(DepartmentService);
  readonly icons = { X, User };
  readonly logoIcons = MASTER_ICONS;
  readonly logoKeys = MASTER_ICON_KEYS;
  // Employee suggestions for the head field; free text until the employee list is wired here
  readonly employees: string[] = [];
  readonly currencies = CURRENCIES;
  readonly countries = COUNTRIES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'contact', label: 'Address & Contact' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: BusinessUnitRecord = blankBusinessUnit();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: BusinessUnitRecord | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['unit']) return;
    this.original = this.mode === 'edit' ? this.unit : null;
    this.form = this.unit ? structuredClone(this.unit) : blankBusinessUnit();
    this.errors = {};
    this.tab = 'basic';
  }

  // Cost centers already used on business units, plus the current value
  get costCenters(): string[] {
    return [...new Set([this.form.costCenter, ...this.service.all().map((r) => r.costCenter)].filter(Boolean))];
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Sub-units must belong to the same organization and can't sit under themselves
  get parentOptions(): BusinessUnitRecord[] {
    const blocked = this.original ? this.service.descendantCodes(this.original.code) : new Set<string>();
    return this.service.all().filter((r) => !blocked.has(r.code) && (!this.form.organizationCode || r.organizationCode === this.form.organizationCode));
  }

  get path(): string {
    const parts = this.organizations.ancestry(this.form.organizationCode || null).map((o) => o.name);
    const chain: string[] = [];
    for (let p = this.service.find(this.form.parentCode); p && chain.length < 10; p = this.service.find(p.parentCode)) chain.unshift(p.name);
    return [...parts, ...chain, this.form.name.trim() || 'New business unit'].join(' > ');
  }

  get level(): number {
    return this.path.split(' > ').length;
  }

  onOrganizationChange(): void {
    const parent = this.service.find(this.form.parentCode);
    if (parent && parent.organizationCode !== this.form.organizationCode) this.form.parentCode = null;
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
    if (!f.name.trim()) errors.name = 'Enter a business unit name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.organizationCode) errors.organizationCode = 'Select an organization.';
    if (f.contactEmail.trim() && !EMAIL.test(f.contactEmail.trim())) errors.email = 'Enter a valid email address.';
    if (f.effectiveTo && f.effectiveFrom && f.effectiveTo < f.effectiveFrom) errors.effectiveTo = 'Must be on or after Effective From.';
    this.errors = errors;

    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = keys.some((k) => ['name', 'code', 'organizationCode', 'logo'].includes(k)) ? 'basic' : errors.email ? 'contact' : 'settings';
      return;
    }

    const now = new Date();
    const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    this.saved.emit({
      record: {
        ...f,
        name: f.name.trim(),
        code: f.code.trim(),
        description: f.description.trim(),
        contactEmail: f.contactEmail.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
