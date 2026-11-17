import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { TRACKING_METHODS, hasRunningNumber, sampleTag } from '../../asset-model/asset-model.data';
import { MODEL_ICONS, MODEL_ICON_KEYS } from '../../asset-model/asset-model.icons';
import { CUSTOM_FIELD_TYPES, MAINTENANCE_TYPES } from '../../asset-type/asset-type.data';
import { blankAssetSubType } from '../asset-sub-type.data';
import { AssetSubTypeRecord } from '../asset-sub-type.model';
import { AssetSubTypeService } from '../asset-sub-type.service';

/** A new sub type starts with every dropdown empty so the user picks each value. */
function newAssetSubType(): AssetSubTypeRecord {
  return {
    ...blankAssetSubType(),
    maintenanceType: '' as AssetSubTypeRecord['maintenanceType'],
    defaultCondition: '' as AssetSubTypeRecord['defaultCondition'],
    trackingMethod: '' as AssetSubTypeRecord['trackingMethod']
  };
}

export type SubTypeFormTab = 'basic' | 'specifications' | 'lifecycle' | 'defaults' | 'fields';
type FieldKey = 'name' | 'code' | 'assetType' | 'image' | 'taggingFormat' | 'specifications' | 'lifecycleYears' | 'maintenanceFrequencyDays' | 'warrantyMonths' | 'customFields';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TAB_OF: Record<FieldKey, SubTypeFormTab> = {
  name: 'basic',
  code: 'basic',
  assetType: 'basic',
  image: 'basic',
  taggingFormat: 'basic',
  specifications: 'specifications',
  lifecycleYears: 'lifecycle',
  maintenanceFrequencyDays: 'lifecycle',
  warrantyMonths: 'lifecycle',
  customFields: 'fields'
};

/** Right-hand "Add / Edit Asset Sub Type" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-sub-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './sub-type-form.html',
  styleUrls: [
    '../../../shared/styles/mdm-drawer.css',
    '../../../shared/styles/mdm-drawer-extras.css',
    '../../asset-model/model-form/model-form.css',
    '../../asset-type/type-form/type-form.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class SubTypeForm implements OnChanges {
  // 'edit' changes `subType`; 'add' creates a new one, pre-filled from `subType` if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() subType: AssetSubTypeRecord | null = null;
  @Input() startTab: SubTypeFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: AssetSubTypeRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(AssetSubTypeService);
  readonly icons = { X, Plus, Trash2 };
  readonly typeIcons = MODEL_ICONS;
  readonly iconKeys = MODEL_ICON_KEYS;
  readonly maintenanceTypes = MAINTENANCE_TYPES;
  readonly fieldTypes = CUSTOM_FIELD_TYPES;
  readonly trackingMethods = TRACKING_METHODS;
  readonly tabs: { id: SubTypeFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'defaults', label: 'Defaults' },
    { id: 'fields', label: 'Custom Fields' }
  ];

  tab: SubTypeFormTab = 'basic';
  form: AssetSubTypeRecord = newAssetSubType();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: AssetSubTypeRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.subType : null;
    this.form = this.subType ? structuredClone(this.subType) : newAssetSubType();
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get sample(): string {
    return this.form.taggingFormat ? sampleTag(this.form.taggingFormat) : '-';
  }

  get subcategories(): string[] {
    return this.service.subcategoriesOf(this.form.assetType);
  }

  // Category and subcategory follow the parent asset type
  onTypeChange(): void {
    this.form.category = this.service.categoryOf(this.form.assetType);
    const subs = this.subcategories;
    if (!subs.includes(this.form.subcategory)) this.form.subcategory = '';
  }

  // Suggest a tagging format from the code (AST-DG-STB gives STB-{YY}-{0000}) until one is typed
  onCodeChange(): void {
    const parts = this.form.code.trim().toUpperCase().split('-').filter(Boolean);
    const prefix = parts[parts.length - 1];
    if (!prefix) return;
    const current = this.form.taggingFormat;
    if (!current || /^[A-Z0-9]*-\{YY\}-\{0000\}$/.test(current)) this.form.taggingFormat = `${prefix}-{YY}-{0000}`;
  }

  addSpec(): void {
    this.form.specifications = [...this.form.specifications, { name: '', unit: '', required: false }];
  }

  removeSpec(index: number): void {
    this.form.specifications = this.form.specifications.filter((_, i) => i !== index);
  }

  addField(): void {
    this.form.customFields = [...this.form.customFields, { name: '', type: '' as AssetSubTypeRecord['customFields'][number]['type'], required: false }];
  }

  removeField(index: number): void {
    this.form.customFields = this.form.customFields.filter((_, i) => i !== index);
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

  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!f.assetType) errors.assetType = 'Select a parent asset type.';
    if (!f.name.trim()) errors.name = 'Enter a sub type name.';
    else if (this.service.isNameTaken(f.name, f.assetType, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists under ${f.assetType}.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.taggingFormat.trim()) errors.taggingFormat = 'Enter a tagging format.';
    else if (!hasRunningNumber(f.taggingFormat)) errors.taggingFormat = 'Include a running number, e.g. {0000}.';
    const specs = f.specifications.map((s) => s.name.trim().toLowerCase());
    if (specs.some((n) => !n)) errors.specifications = 'Every specification needs a name.';
    else if (new Set(specs).size !== specs.length) errors.specifications = 'Specification names must be unique.';
    if (!Number.isInteger(f.lifecycleYears) || f.lifecycleYears < 1 || f.lifecycleYears > 50) errors.lifecycleYears = 'Enter 1 to 50 years.';
    if (!Number.isInteger(f.maintenanceFrequencyDays) || f.maintenanceFrequencyDays < 1 || f.maintenanceFrequencyDays > 3650) errors.maintenanceFrequencyDays = 'Enter 1 to 3650 days.';
    if (!Number.isInteger(f.warrantyMonths) || f.warrantyMonths < 0 || f.warrantyMonths > 240) errors.warrantyMonths = 'Enter 0 to 240 months.';
    const names = f.customFields.map((c) => c.name.trim().toLowerCase());
    if (names.some((n) => !n)) errors.customFields = 'Every custom field needs a name.';
    else if (new Set(names).size !== names.length) errors.customFields = 'Custom field names must be unique.';
    else if (f.customFields.some((c) => !c.type)) errors.customFields = 'Every custom field needs a type.';
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))!.id;
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
        taggingFormat: f.taggingFormat.trim(),
        specifications: f.specifications.map((s) => ({ ...s, name: s.name.trim(), unit: s.unit.trim() })),
        customFields: f.customFields.map((c) => ({ ...c, name: c.name.trim() })),
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? 'admin',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
