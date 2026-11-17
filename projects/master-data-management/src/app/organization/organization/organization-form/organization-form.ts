import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Building2, LucideAngularModule, X } from 'lucide-angular';
import { COUNTRIES, CURRENCIES, DATE_FORMATS, LANGUAGES, TIME_ZONES, blankOrganization } from '../organization.data';
import { ORGANIZATION_TYPES, OrganizationRecord } from '../organization.model';
import { OrganizationService } from '../organization.service';

type FormTab = 'basic' | 'hierarchy' | 'contact' | 'settings';
type FieldKey = 'name' | 'code' | 'type' | 'website' | 'logo' | 'parentCode' | 'email' | 'effectiveTo';

interface StructureRow {
  code: string;
  label: string;
  level: number;
  current: boolean;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const NEW_CODE = '__new__';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/[^\s.]+\.[^\s]+$/i;

/** Right-hand "Add / Edit Organization" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-organization-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './organization-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', './organization-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class OrganizationForm implements OnChanges {
  // 'edit' changes `organization`; 'add' creates a new record, pre-filled from `organization` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() organization: OrganizationRecord | null = null;
  @Input() saving = false;
  @Output() saved = new EventEmitter<{ record: OrganizationRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(OrganizationService);
  readonly icons = { Building2, X };
  readonly types = ORGANIZATION_TYPES;
  readonly countries = COUNTRIES;
  readonly currencies = CURRENCIES;
  readonly timeZones = TIME_ZONES;
  readonly languages = LANGUAGES;
  readonly dateFormats = DATE_FORMATS;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'contact', label: 'Address & Contact' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: OrganizationRecord = blankOrganization();
  errors: Partial<Record<FieldKey, string>> = {};
  // The stored record being edited; null when adding
  private original: OrganizationRecord | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['organization']) return;
    this.original = this.mode === 'edit' ? this.organization : null;
    this.form = this.organization ? structuredClone(this.organization) : blankOrganization();
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Anything except this organization and the ones under it
  get parentOptions(): OrganizationRecord[] {
    const blocked = this.original ? this.service.descendantCodes(this.original.code) : new Set<string>();
    return this.service.all().filter((r) => !blocked.has(r.code));
  }

  get level(): number {
    return this.service.ancestry(this.form.parentCode).length + 1;
  }

  get path(): string {
    return [...this.service.ancestry(this.form.parentCode).map((r) => r.name), this.form.name.trim() || 'New organization'].join(' > ');
  }

  get dialCode(): string {
    return COUNTRIES.find((c) => c.name === this.form.contact.phoneCountry)?.dial ?? '';
  }

  /** The tree this organization will sit in, with the form's (unsaved) parent applied. */
  get structure(): StructureRow[] {
    const selfCode = this.original?.code ?? NEW_CODE;
    const parentOf = (r: { code: string; parentCode: string | null }) => (r.code === selfCode ? this.form.parentCode : r.parentCode);
    const self = { code: selfCode, name: this.form.name.trim() || 'New organization', parentCode: this.form.parentCode };
    // Keep the edited organization in its place among its siblings; a new one goes last
    const nodes = this.service.all().map((r) => (r.code === selfCode ? self : r));
    if (!this.original) nodes.push(self);
    const root = this.service.ancestry(this.form.parentCode)[0]?.code ?? selfCode;
    const rows: StructureRow[] = [];
    const walk = (code: string, level: number) => {
      const node = nodes.find((n) => n.code === code);
      if (!node || level > 10) return;
      rows.push({ code, label: node.name, level, current: code === selfCode });
      nodes.filter((n) => parentOf(n) === code).forEach((child) => walk(child.code, level + 1));
    };
    walk(root, 1);
    return rows;
  }

  clearParent(): void {
    this.form.parentCode = null;
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
    if (!f.name.trim()) errors.name = 'Enter an organization name.';
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.type) errors.type = 'Select a type.';
    if (f.website.trim() && !URL_PATTERN.test(f.website.trim())) errors.website = 'Enter a full address, e.g. https://www.example.com';
    const parent = this.service.find(f.parentCode);
    if (parent && !parent.settings.allowSubOrganizations && parent.code !== this.original?.parentCode) {
      errors.parentCode = `${parent.name} does not allow sub-organizations.`;
    }
    if (f.contact.email.trim() && !EMAIL.test(f.contact.email.trim())) errors.email = 'Enter a valid email address.';
    if (f.settings.effectiveTo && f.settings.effectiveFrom && f.settings.effectiveTo < f.settings.effectiveFrom) {
      errors.effectiveTo = 'Must be on or after Effective From.';
    }
    this.errors = errors;

    // Show the first tab that has a problem
    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = keys.some((k) => ['name', 'code', 'type', 'website', 'logo'].includes(k))
        ? 'basic'
        : errors.parentCode
          ? 'hierarchy'
          : errors.email
            ? 'contact'
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
        website: f.website.trim(),
        description: f.description.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
