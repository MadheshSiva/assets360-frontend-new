import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { TRACKING_METHODS } from '../../asset-model/asset-model.data';
import { MODEL_ICONS, MODEL_ICON_KEYS } from '../../asset-model/asset-model.icons';
import { CUSTOM_FIELD_TYPES } from '../../asset-type/asset-type.data';
import { AssetTypeService } from '../../asset-type/asset-type.service';
import { HEX_COLOR } from '../../level-icons';
import { CATEGORY_TYPE_DEFAULTS, blankCategory } from '../category.data';
import { CategoryRecord } from '../category.model';
import { CategoryService } from '../category.service';

/** A new category starts with every dropdown empty so the user picks each value. */
function newCategory(): CategoryRecord {
  return {
    ...blankCategory(),
    depreciationMethod: '' as CategoryRecord['depreciationMethod'],
    trackingMethod: '' as CategoryRecord['trackingMethod'],
    defaultCondition: '' as CategoryRecord['defaultCondition']
  };
}

export type CatFormTab = 'basic' | 'defaults' | 'fields' | 'settings';
type FieldKey = 'name' | 'code' | 'assetType' | 'image' | 'color' | 'usefulLifeYears' | 'tagPrefix' | 'customFields';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TAB_OF: Record<FieldKey, CatFormTab> = {
  name: 'basic',
  code: 'basic',
  assetType: 'basic',
  image: 'basic',
  color: 'basic',
  usefulLifeYears: 'defaults',
  tagPrefix: 'defaults',
  customFields: 'fields'
};

/** Right-hand "Add / Edit Category" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-cat-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cat-form.html',
  styleUrls: [
    '../../../shared/styles/mdm-drawer.css',
    '../../../shared/styles/mdm-drawer-extras.css',
    '../../asset-model/model-form/model-form.css',
    '../../asset-type/type-form/type-form.css',
    '../../level-form.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class CatForm implements OnChanges {
  // 'edit' changes `category`; 'add' creates a new one, pre-filled from it if given (Duplicate, child)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() category: CategoryRecord | null = null;
  @Input() startTab: CatFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: CategoryRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(CategoryService);
  readonly icons = { X, Plus, Trash2 };
  readonly typeIcons = MODEL_ICONS;
  readonly iconKeys = MODEL_ICON_KEYS;
  // Asset types from GET /api/master-data/asset-types?clientId=...
  private readonly typeStore = inject(AssetTypeService);
  readonly trackingMethods = TRACKING_METHODS;
  readonly fieldTypes = CUSTOM_FIELD_TYPES;
  readonly tabs: { id: CatFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'defaults', label: 'Asset Type & Defaults' },
    { id: 'fields', label: 'Custom Fields' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: CatFormTab = 'basic';
  form: CategoryRecord = newCategory();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: CategoryRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.category : null;
    this.form = this.category ? structuredClone(this.category) : newCategory();
    this.errors = {};
    this.tab = this.startTab;
  }

  /** Active asset type names from Master Data, plus the category's current value so an edit keeps it. */
  get assetTypes(): string[] {
    const names = this.typeStore.active().map((t) => t.name);
    return [...new Set([...names, this.form.assetType].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get pickerColor(): string {
    return HEX_COLOR.test(this.form.color) ? this.form.color.toLowerCase() : '#000000';
  }

  // A category can't sit under itself or one of its own children
  get parentOptions(): CategoryRecord[] {
    const blocked = this.original ? this.service.descendantCodes(this.original.code) : new Set<string>();
    return this.service.all().filter((c) => !blocked.has(c.code));
  }

  // Cost centers already used on categories, plus the current value
  get costCenters(): string[] {
    return [...new Set([this.form.costCenter, ...this.service.all().map((r) => r.costCenter)].filter(Boolean))];
  }

  // New categories pick up the usual accounting defaults for their asset type
  onAssetTypeChange(): void {
    if (this.isEdit) return;
    const type = this.typeStore.findByName(this.form.assetType);
    if (type) {
      this.form.depreciationMethod = type.depreciationMethod;
      this.form.usefulLifeYears = type.lifecycleYears;
      this.form.trackingMethod = type.trackingMethod;
      return;
    }
    const d = CATEGORY_TYPE_DEFAULTS[this.form.assetType];
    if (d) [this.form.depreciationMethod, this.form.usefulLifeYears, this.form.trackingMethod] = d;
  }

  // Suggest the tag prefix from the code (CAT-IT gives IT) until one is typed
  onCodeChange(): void {
    const suggested = this.form.code.trim().toUpperCase().replace(/^CAT-/, '');
    const previous = (this.original?.code ?? '').toUpperCase().replace(/^CAT-/, '');
    if (!this.form.tagPrefix || this.form.tagPrefix === previous || suggested.startsWith(this.form.tagPrefix)) this.form.tagPrefix = suggested;
  }

  addField(): void {
    this.form.customFields = [...this.form.customFields, { name: '', type: '' as CategoryRecord['customFields'][number]['type'], required: false }];
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
    if (!f.name.trim()) errors.name = 'Enter a category name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.assetType) errors.assetType = 'Select an asset type.';
    if (!HEX_COLOR.test(f.color.trim())) errors.color = 'Enter a colour like #1D4ED8.';
    if (!Number.isInteger(f.usefulLifeYears) || f.usefulLifeYears < 1 || f.usefulLifeYears > 50) errors.usefulLifeYears = 'Enter 1 to 50 years.';
    if (!/^[A-Z0-9]{1,6}$/i.test(f.tagPrefix.trim())) errors.tagPrefix = 'Use 1 to 6 letters or digits.';
    const names = f.customFields.map((c) => c.name.trim().toLowerCase());
    if (names.some((n) => !n)) errors.customFields = 'Every custom field needs a name.';
    else if (new Set(names).size !== names.length) errors.customFields = 'Custom field names must be unique.';
    else if (f.customFields.some((c) => !c.type)) errors.customFields = 'Every custom field needs a type.';
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      // Show the first tab that has a problem
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
        color: f.color.trim().toUpperCase(),
        description: f.description.trim(),
        tagPrefix: f.tagPrefix.trim().toUpperCase(),
        customFields: f.customFields.map((c) => ({ ...c, name: c.name.trim() })),
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? '',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
