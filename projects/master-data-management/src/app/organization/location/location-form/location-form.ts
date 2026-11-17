import { Component, EventEmitter, Input, OnChanges, Output, inject, SimpleChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Building2, LucideAngularModule, X } from 'lucide-angular';
import { LOCATION_TYPES, LocationRecord } from '../location.model';
import { LocationService } from '../location.service';

type FormTab = 'basic' | 'hierarchy' | 'type' | 'map' | 'settings';
type FieldKey = 'name' | 'code' | 'siteId' | 'buildingCode' | 'floorCode' | 'type' | 'image' | 'area' | 'lat' | 'lng';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Right-hand "Add / Edit Location" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-location-form',
  imports: [FormsModule, NgTemplateOutlet, LucideAngularModule],
  templateUrl: './location-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class LocationForm implements OnChanges {
  // 'edit' changes `location`; 'add' creates a new record, pre-filled from `location` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() location: LocationRecord | null = null;
  @Input() saving = false;
  @Output() saved = new EventEmitter<{ record: LocationRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(LocationService);
  readonly icons = { Building2, X };
  readonly types = LOCATION_TYPES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'type', label: 'Type & Attributes' },
    { id: 'map', label: 'Map & Coordinates' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: LocationRecord = this.blank();
  errors: Partial<Record<FieldKey, string>> = {};
  // Coordinates follow the chosen zone until the user types their own
  private coordsEdited = false;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['location']) return;
    this.form = this.location ? { ...this.location } : this.blank();
    this.coordsEdited = !!this.location;
    this.original = this.mode === 'edit' ? this.location : null;
    this.errors = {};
    this.tab = 'basic';
  }

  // The stored record being edited; null when adding
  private original: LocationRecord | null = null;

  get isEdit(): boolean {
    return this.original !== null;
  }

  get parentOptions(): LocationRecord[] {
    if (!this.form.buildingCode || !this.form.floorCode) return [];
    return this.service
      .all()
      .filter(
        (r) =>
          r.code !== this.original?.code &&
          r.buildingCode === this.form.buildingCode &&
          r.floorCode === this.form.floorCode &&
          (!this.form.zoneCode || r.zoneCode === this.form.zoneCode)
      )
      .slice(0, 200);
  }

  get hierarchyPath(): string[] {
    const f = this.form;
    return [
      f.siteId && this.service.siteName(f.siteId),
      f.buildingCode && `${this.service.buildingName(f.buildingCode)} (${f.buildingCode})`,
      f.floorCode && `${this.service.floorName(f.floorCode)} (${f.floorCode})`,
      f.zoneCode && `${this.service.zoneName(f)} (${f.zoneCode})`,
      f.parentCode && this.service.find(f.parentCode)?.name,
      f.name.trim() || 'New location'
    ].filter((p): p is string => !!p);
  }

  onSiteChange(): void {
    this.form.buildingCode = '';
    this.onBuildingChange();
  }

  onBuildingChange(): void {
    this.form.floorCode = '';
    this.onFloorChange();
  }

  onFloorChange(): void {
    this.form.zoneCode = '';
    this.onZoneChange();
  }

  onZoneChange(): void {
    this.form.parentCode = null;
    this.followZone();
  }

  onCoordsInput(): void {
    this.coordsEdited = true;
  }

  useZonePosition(): void {
    this.coordsEdited = false;
    this.followZone();
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
    if (!f.name.trim()) errors.name = 'Enter a location name.';
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.siteId) errors.siteId = 'Select a site.';
    if (!f.buildingCode) errors.buildingCode = 'Select a building.';
    if (!f.floorCode) errors.floorCode = 'Select a floor.';
    if (!f.type) errors.type = 'Select a type.';
    if (f.area !== null && f.area < 0) errors.area = 'Area cannot be negative.';
    if (!Number.isFinite(f.lat) || f.lat < -90 || f.lat > 90) errors.lat = 'Latitude must be between -90 and 90.';
    if (!Number.isFinite(f.lng) || f.lng < -180 || f.lng > 180) errors.lng = 'Longitude must be between -180 and 180.';
    this.errors = errors;

    // Show the first tab that has a problem
    const keys = Object.keys(errors);
    if (keys.length) {
      const basic = keys.some((k) => !['area', 'lat', 'lng'].includes(k));
      this.tab = basic ? 'basic' : keys.includes('area') ? 'type' : 'map';
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
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }

  private followZone(): void {
    if (this.coordsEdited || !this.form.buildingCode || !this.form.floorCode) return;
    const pos = this.service.positionFor(this.form.code || 'NEW', this.form.buildingCode, this.form.floorCode, this.form.zoneCode);
    this.form.lat = Number(pos.lat.toFixed(6));
    this.form.lng = Number(pos.lng.toFixed(6));
  }

  private blank(): LocationRecord {
    return {
      code: '',
      name: '',
      type: '' as LocationRecord['type'],
      environment: 'Indoor',
      siteId: '',
      buildingCode: '',
      floorCode: '',
      zoneCode: '',
      parentCode: null,
      area: null,
      capacity: null,
      description: '',
      status: 'Active',
      image: null,
      lat: 0,
      lng: 0,
      restrictedAccess: false,
      temperatureControlled: false,
      allowAssetAssignment: true,
      enableTracking: true,
      geofenceAlerts: false,
      createdOn: '',
      updatedOn: ''
    };
  }
}
