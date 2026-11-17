import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronLeft, LucideAngularModule, Search, X } from 'lucide-angular';
import { ADMIN_PEOPLE } from '../../shared/admin-common';
import { COUNTRY_CITIES, LOCATION_TYPES, PARENT_TYPE, TIME_ZONES } from '../organization.data';
import { OrgLocation } from '../organization.model';
import { OrganizationService } from '../organization.service';

const CODE = /^[A-Z][A-Z0-9]*-\d{3,}$/;

/** Right "Location Details" drawer: adds or edits one node of the hierarchy. */
@Component({
  standalone: true,
  selector: 'app-location-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './location-form.html',
  styleUrls: ['../../shared/admin-workspace.css', '../organization.css']
})
export class LocationForm implements OnChanges {
  /** Record to edit, or the pre-filled draft of a new one. */
  @Input({ required: true }) record!: OrgLocation;
  @Input() mode: 'add' | 'edit' = 'edit';
  @Output() saved = new EventEmitter<{ record: OrgLocation; originalCode: string | null }>();
  @Output() closed = new EventEmitter<void>();

  private readonly service = inject(OrganizationService);
  readonly icons = { ChevronLeft, X, Search };
  readonly types = LOCATION_TYPES;
  readonly countries = Object.keys(COUNTRY_CITIES);
  readonly timeZones = TIME_ZONES;
  readonly people = ADMIN_PEOPLE;

  form!: OrgLocation;
  errors: Record<string, string> = {};

  ngOnChanges(): void {
    this.form = { ...this.record };
    this.errors = {};
  }

  get isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** A node with children keeps its level, otherwise the children would end up under the wrong type. */
  get typeLocked(): boolean {
    return this.isEdit && this.service.childrenOf(this.record.code).length > 0;
  }

  get parentOptions(): OrgLocation[] {
    const level = PARENT_TYPE[this.form.type];
    return level ? this.service.ofType(level) : [];
  }

  get cities(): string[] {
    return COUNTRY_CITIES[this.form.country] ?? [];
  }

  parentLabel(l: OrgLocation): string {
    const chain = this.service.ancestorsOf(l.code).map((a) => a.name);
    return `${l.name} (${l.code})${chain.length ? ' · ' + chain.join(' › ') : ''}`;
  }

  onTypeChange(): void {
    const level = PARENT_TYPE[this.form.type];
    const parent = this.service.find(this.form.parent);
    if (!level || parent?.type !== level) this.form.parent = null;
    delete this.errors['parent'];
  }

  // A child inherits the country, city and time zone of its parent
  onParentChange(): void {
    const parent = this.service.find(this.form.parent);
    if (parent) {
      this.form.country = parent.country;
      this.form.city = parent.city;
      this.form.timeZone = parent.timeZone;
      if (!this.form.address.trim() && this.form.name.trim()) this.form.address = `${this.form.name.trim()}, ${parent.address}`;
    }
  }

  onCountryChange(): void {
    if (!this.cities.includes(this.form.city)) this.form.city = '';
  }

  private validate(): boolean {
    const f = this.form;
    const e: Record<string, string> = {};
    const code = f.code.trim().toUpperCase();
    const original = this.isEdit ? this.record.code : null;
    if (!code) e['code'] = 'Location code is required.';
    else if (!CODE.test(code)) e['code'] = 'Use a prefix and number, e.g. LOC-012.';
    else if (this.service.codeTaken(code, original)) e['code'] = `${code} is already used.`;
    if (!f.name.trim()) e['name'] = 'Location name is required.';
    else if (this.service.nameTaken(f.name, f.parent, original)) e['name'] = 'Another location under the same parent has this name.';
    if (PARENT_TYPE[f.type] && !f.parent) e['parent'] = `Choose the ${PARENT_TYPE[f.type]!.toLowerCase()} this ${f.type.toLowerCase()} belongs to.`;
    if (!f.country) e['country'] = 'Country is required.';
    if (!f.city) e['city'] = 'City is required.';
    if (!f.timeZone) e['timeZone'] = 'Time zone is required.';
    if (!f.status) e['status'] = 'Status is required.';
    // The Administration API requires a location manager
    if (!f.contact.trim()) e['contact'] = 'Contact person is required.';
    else if (!this.people.includes(f.contact.trim())) e['contact'] = 'Pick a person from the list.';
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  save(): void {
    if (!this.validate()) return;
    const f = this.form;
    this.saved.emit({
      record: { ...f, code: f.code.trim().toUpperCase(), name: f.name.trim(), address: f.address.trim(), contact: f.contact.trim() },
      originalCode: this.isEdit ? this.record.code : null
    });
  }

  close(): void {
    this.closed.emit();
  }
}
