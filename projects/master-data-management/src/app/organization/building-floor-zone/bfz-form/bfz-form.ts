import { Component, EventEmitter, Input, OnChanges, Output, inject, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Building2, LucideAngularModule, X } from 'lucide-angular';
import { COUNTRIES, FLOOR_NAMES, ZONE_COLORS, blankBfz } from '../bfz.data';
import { BUILDING_CATEGORIES, BfzRecord, BfzType, ZONE_CATEGORIES } from '../bfz.model';
import { BfzService } from '../bfz.service';

type FormTab = 'basic' | 'hierarchy' | 'address' | 'settings';
type FieldKey = 'name' | 'code' | 'siteId' | 'buildingCode' | 'floorCode' | 'capacity' | 'area' | 'image' | 'lat' | 'lng';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Right-hand "Add / Edit Building / Floor / Zone" panel. The Type radios decide which parent
 * fields show: a floor picks its building, a zone picks its building and floor; the site
 * always follows the building.
 */
@Component({
  selector: 'app-bfz-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './bfz-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', './bfz-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class BfzForm implements OnChanges {
  // 'edit' changes `record`; 'add' creates a new one, pre-filled from `record` if given
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() record: BfzRecord | null = null;
  @Input() saving = false;
  @Output() saved = new EventEmitter<{ record: BfzRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(BfzService);
  readonly icons = { Building2, X };
  readonly types: BfzType[] = ['Building', 'Floor', 'Zone'];
  readonly buildingCategories = BUILDING_CATEGORIES;
  readonly zoneCategories = ZONE_CATEGORIES;
  readonly countries = COUNTRIES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'hierarchy', label: 'Hierarchy & Type' },
    { id: 'address', label: 'Address / Location' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: BfzRecord = blankBfz();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: BfzRecord | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new record (or mode) resets the form; `saving` flips must keep the user's edits
    if (!changes['mode'] && !changes['record']) return;
    this.original = this.mode === 'edit' ? this.record : null;
    this.form = this.record ? structuredClone(this.record) : blankBfz();
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get title(): string {
    return `${this.isEdit ? 'Edit' : 'Add'} ${this.isEdit ? this.form.type : 'Building / Floor / Zone'}`;
  }

  get building(): BfzRecord | undefined {
    return this.service.find(this.form.buildingCode);
  }

  get floorOptions(): BfzRecord[] {
    return this.service.floorsOf(this.form.buildingCode);
  }

  get path(): string {
    const parts = [this.service.siteName(this.form.siteId) || 'Site'];
    if (this.form.type !== 'Building') parts.push(this.building ? this.service.label(this.building) : 'Building');
    if (this.form.type === 'Zone') {
      const floor = this.service.find(this.form.floorCode);
      parts.push(floor ? this.service.label(floor) : 'Floor');
    }
    parts.push(this.form.name.trim() || `New ${this.form.type.toLowerCase()}`);
    return parts.join(' > ');
  }

  // Changing type clears parents that no longer apply
  onTypeChange(): void {
    const f = this.form;
    if (f.type === 'Building') {
      f.buildingCode = null;
      f.floorCode = null;
    } else if (f.type === 'Floor') {
      f.floorCode = null;
      f.levelNumber ??= this.nextLevel();
    } else {
      f.color = f.color || ZONE_COLORS[0];
    }
    const { buildingCode, floorCode, siteId, ...rest } = this.errors;
    this.errors = rest;
  }

  onBuildingChange(): void {
    this.form.floorCode = null;
    this.form.siteId = this.building?.siteId ?? '';
    if (this.form.type === 'Floor' && !this.isEdit) this.form.levelNumber = this.nextLevel();
    // A new floor or zone starts at its building's position
    if (!this.isEdit && this.form.lat === null && this.form.lng === null) this.usePosition();
  }

  /** Where "Use … position" copies from: the building for floors and zones, the site for buildings. */
  get positionSource(): { label: string; lat: number; lng: number } | null {
    if (this.form.type !== 'Building') {
      const b = this.building;
      return b && b.lat !== null && b.lng !== null ? { label: 'building', lat: b.lat, lng: b.lng } : null;
    }
    const site = this.service.sites().find((s) => s.id === this.form.siteId);
    return site && site.lat !== null && site.lng !== null ? { label: 'site', lat: site.lat, lng: site.lng } : null;
  }

  usePosition(): void {
    const src = this.positionSource;
    if (!src) return;
    this.form.lat = src.lat;
    this.form.lng = src.lng;
    const { lat, lng, ...rest } = this.errors;
    this.errors = rest;
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
    if (!f.name.trim()) errors.name = 'Enter a name.';
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (f.type !== 'Building' && !f.buildingCode) errors.buildingCode = 'Select a building.';
    if (f.type === 'Zone' && !f.floorCode) errors.floorCode = 'Select a floor.';
    if (!f.siteId) errors.siteId = 'Select a site.';
    if (f.capacity !== null && f.capacity < 0) errors.capacity = 'Capacity cannot be negative.';
    if (f.area !== null && f.area < 0) errors.area = 'Area cannot be negative.';
    if (f.lat !== null && (f.lat < -90 || f.lat > 90)) errors.lat = 'Latitude must be between -90 and 90.';
    else if (f.lat === null && f.lng !== null) errors.lat = 'Enter the latitude too.';
    if (f.lng !== null && (f.lng < -180 || f.lng > 180)) errors.lng = 'Longitude must be between -180 and 180.';
    else if (f.lng === null && f.lat !== null) errors.lng = 'Enter the longitude too.';
    this.errors = errors;

    if (Object.keys(errors).length) {
      this.tab = 'basic';
      return;
    }

    const now = new Date();
    const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const isBuilding = f.type === 'Building';
    this.saved.emit({
      record: {
        ...f,
        name: f.name.trim(),
        code: f.code.trim(),
        description: f.description.trim(),
        buildingCode: isBuilding ? null : f.buildingCode,
        floorCode: f.type === 'Zone' ? f.floorCode : null,
        // Floors and zones sit at their building's address
        address: isBuilding ? f.address : { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' },
        lat: f.lat,
        lng: f.lng,
        levelNumber: f.type === 'Floor' ? f.levelNumber : null,
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }

  floorNameFor(level: number | null): string {
    return FLOOR_NAMES.find((f) => f.level === level)?.name ?? (level === null ? '-' : `Level ${level}`);
  }

  private nextLevel(): number {
    const floors = this.service.floorsOf(this.form.buildingCode);
    return floors.length ? Math.max(...floors.map((x) => x.levelNumber ?? 0)) + 1 : 0;
  }
}
