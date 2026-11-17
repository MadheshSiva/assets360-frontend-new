import { Component, EventEmitter, Input, OnChanges, Output, inject, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Building2, LucideAngularModule, X } from 'lucide-angular';
import { COUNTRIES, TIME_ZONES } from '../../organization/organization.data';
import { OrganizationService } from '../../organization/organization.service';
import { blankSite } from '../site.data';
import { BusinessUnitService } from '../../business-unit/business-unit.service';
import { DepartmentService } from '../../department/department.service';
import { SITE_TYPES, SiteRecord, WEEK_DAYS } from '../site.model';
import { SiteService } from '../site.service';

export type SiteFormTab = 'basic' | 'address' | 'hierarchy' | 'contacts' | 'settings';
type FieldKey = 'name' | 'code' | 'siteType' | 'image' | 'lat' | 'lng' | 'managerEmail' | 'emergencyEmail' | 'hours';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Right-hand "Add / Edit Site" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-site-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './site-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', './site-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class SiteForm implements OnChanges {
  // 'edit' changes `site`; 'add' creates a new one, pre-filled from `site` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() site: SiteRecord | null = null;
  @Input() saving = false;
  @Input() initialTab: SiteFormTab = 'basic';
  @Output() saved = new EventEmitter<SiteRecord>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(SiteService);
  readonly organizations = inject(OrganizationService);
  readonly icons = { Building2, X };
  readonly siteTypes = SITE_TYPES;
  readonly businessUnits = inject(BusinessUnitService);
  readonly departmentService = inject(DepartmentService);
  readonly timeZones = TIME_ZONES;
  readonly countries = COUNTRIES;
  readonly weekDays = WEEK_DAYS;
  readonly tabs: { id: SiteFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'address', label: 'Address & Location' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: SiteFormTab = 'basic';
  form: SiteRecord = blankSite();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: SiteRecord | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['site'] && !changes['initialTab']) return;
    this.original = this.mode === 'edit' ? this.site : null;
    this.form = this.site ? structuredClone(this.site) : blankSite();
    this.errors = {};
    this.tab = this.initialTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get parentOptions(): SiteRecord[] {
    const blocked = this.original ? this.service.descendantIds(this.original.id) : new Set<string>();
    return this.service.all().filter((r) => !blocked.has(r.id));
  }

  get path(): string {
    const f = this.form;
    return [
      this.service.organizationName(f.organizationCode),
      f.businessUnit || 'Business unit',
      f.department || 'Department',
      ...(f.parentId ? [this.service.find(f.parentId)?.name ?? ''] : []),
      f.name.trim() || 'New site'
    ].join(' > ');
  }

  // Departments of the chosen business unit, plus the current value so an old pick still shows
  get departments(): string[] {
    const unit = this.businessUnits.findByName(this.form.businessUnit);
    const names = this.departmentService.names(unit?.code ?? '');
    return this.form.department && !names.includes(this.form.department) ? [this.form.department, ...names] : names;
  }

  dial(country: string): string {
    return COUNTRIES.find((c) => c.name === country)?.dial ?? '';
  }

  toggleDay(day: string): void {
    const days = this.form.workingDays;
    this.form.workingDays = days.includes(day) ? days.filter((d) => d !== day) : WEEK_DAYS.filter((d) => d === day || days.includes(d));
  }

  onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.errors = { ...this.errors, image: 'Use a PNG or JPG image.' };
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.errors = { ...this.errors, image: 'Image must be 2 MB or smaller.' };
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.form.image = String(reader.result);
      const { image, ...rest } = this.errors;
      this.errors = rest;
    };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.form.image = null;
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
    if (!f.name.trim()) errors.name = 'Enter a site name.';
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.id ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.siteType) errors.siteType = 'Select a site type.';
    if (f.lat !== null && (f.lat < -90 || f.lat > 90)) errors.lat = 'Latitude must be between -90 and 90.';
    if (f.lng !== null && (f.lng < -180 || f.lng > 180)) errors.lng = 'Longitude must be between -180 and 180.';
    if (f.manager.email.trim() && !EMAIL.test(f.manager.email.trim())) errors.managerEmail = 'Enter a valid email address.';
    if (f.emergency.email.trim() && !EMAIL.test(f.emergency.email.trim())) errors.emergencyEmail = 'Enter a valid email address.';
    if (!f.open24x7 && f.openTime && f.closeTime && f.closeTime <= f.openTime) errors.hours = 'Closing time must be after opening time.';
    this.errors = errors;

    // Show the first tab that has a problem
    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = keys.some((k) => ['name', 'code', 'siteType', 'image'].includes(k))
        ? 'basic'
        : errors.lat || errors.lng
          ? 'address'
          : errors.managerEmail || errors.emergencyEmail
            ? 'contacts'
            : 'settings';
      return;
    }

    const now = new Date();
    const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    this.saved.emit({
      ...f,
      id: this.original?.id ?? this.service.nextId(),
      name: f.name.trim(),
      code: f.code.trim(),
      description: f.description.trim(),
      createdOn: this.original?.createdOn ?? stamp,
      updatedOn: stamp
    });
  }
}
