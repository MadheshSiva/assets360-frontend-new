import { Component, EventEmitter, Input, OnChanges, Output, inject, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, User, X } from 'lucide-angular';
import { MASTER_ICONS, MASTER_ICON_KEYS } from '../../../shared/master-icons';
import { BusinessUnitService } from '../../business-unit/business-unit.service';
import { COUNTRIES, CURRENCIES } from '../../organization/organization.data';
import { blankDepartment } from '../department.data';
import { DEPARTMENT_TYPES, DepartmentRecord } from '../department.model';
import { DepartmentService } from '../department.service';

type FormTab = 'basic' | 'hierarchy' | 'people' | 'finance' | 'settings';
type FieldKey = 'name' | 'code' | 'businessUnitCode' | 'type' | 'logo' | 'email' | 'budget' | 'approvalLimit' | 'effectiveTo';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Right-hand "Add / Edit Department" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-dept-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './dept-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class DeptForm implements OnChanges {
  // 'edit' changes `department`; 'add' creates a new one, pre-filled from `department` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() department: DepartmentRecord | null = null;
  @Input() saving = false;
  @Output() saved = new EventEmitter<{ record: DepartmentRecord; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(DepartmentService);
  readonly businessUnits = inject(BusinessUnitService);
  readonly icons = { X, User };
  readonly logoIcons = MASTER_ICONS;
  readonly logoKeys = MASTER_ICON_KEYS;
  readonly types = DEPARTMENT_TYPES;
  // Employee suggestions for the head and deputy fields; free text until the employee list is wired here
  readonly employees: string[] = [];
  readonly currencies = CURRENCIES;
  readonly countries = COUNTRIES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'people', label: 'People' },
    { id: 'finance', label: 'Cost & Finance' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: DepartmentRecord = blankDepartment();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: DepartmentRecord | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['department']) return;
    this.original = this.mode === 'edit' ? this.department : null;
    this.form = this.department ? structuredClone(this.department) : blankDepartment();
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Same business unit, and not itself or anything under it
  get parentOptions(): DepartmentRecord[] {
    const blocked = this.original ? this.service.descendantCodes(this.original.code) : new Set<string>();
    return this.service.all().filter((r) => !blocked.has(r.code) && (!this.form.businessUnitCode || r.businessUnitCode === this.form.businessUnitCode));
  }

  // The unit's own cost center plus the existing department ones
  get costCenters(): string[] {
    const ownUnit = this.businessUnits.find(this.form.businessUnitCode)?.costCenter;
    const fromDepartments = this.service.ofBusinessUnit(this.form.businessUnitCode).map((d) => d.costCenter);
    const suggested = this.form.businessUnitCode && this.form.code ? [`CC-${this.form.businessUnitCode}-${this.form.code.trim().toUpperCase()}`] : [];
    return [...new Set([...suggested, ...(ownUnit ? [ownUnit] : []), ...fromDepartments, this.form.costCenter].filter(Boolean))];
  }

  get path(): string {
    const unit = this.businessUnits.find(this.form.businessUnitCode);
    return [
      unit ? `${unit.name} (${unit.code})` : 'Business unit',
      ...this.service.ancestry(this.form.parentCode).map((d) => `${d.name} (${d.code})`),
      `${this.form.name.trim() || 'New department'}${this.form.code.trim() ? ' (' + this.form.code.trim() + ')' : ''}`
    ].join(' > ');
  }

  get level(): number {
    return this.path.split(' > ').length;
  }

  onBusinessUnitChange(): void {
    const parent = this.service.find(this.form.parentCode);
    if (parent && parent.businessUnitCode !== this.form.businessUnitCode) this.form.parentCode = null;
    const unit = this.businessUnits.find(this.form.businessUnitCode);
    if (unit) this.form.currency = unit.currency;
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
    if (!f.name.trim()) errors.name = 'Enter a department name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.businessUnitCode) errors.businessUnitCode = 'Select a business unit.';
    if (!f.type) errors.type = 'Select a department type.';
    if (f.email.trim() && !EMAIL.test(f.email.trim())) errors.email = 'Enter a valid email address.';
    if (f.annualBudget !== null && f.annualBudget < 0) errors.budget = 'Budget cannot be negative.';
    if (f.approvalLimit !== null && f.approvalLimit < 0) errors.approvalLimit = 'Approval limit cannot be negative.';
    if (f.effectiveTo && f.effectiveFrom && f.effectiveTo < f.effectiveFrom) errors.effectiveTo = 'Must be on or after Effective From.';
    this.errors = errors;

    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = keys.some((k) => ['name', 'code', 'businessUnitCode', 'type', 'logo'].includes(k))
        ? 'basic'
        : errors.email
          ? 'people'
          : errors.budget || errors.approvalLimit
            ? 'finance'
            : 'settings';
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
        email: f.email.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
