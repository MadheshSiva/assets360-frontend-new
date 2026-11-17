import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { TRACKING_METHODS, hasRunningNumber, sampleTag } from '../../asset-model/asset-model.data';
import { MODEL_ICONS, MODEL_ICON_KEYS } from '../../asset-model/asset-model.icons';
import { ASSET_CLASSES, CUSTOM_FIELD_TYPES, MAINTENANCE_TYPES, blankAssetType } from '../asset-type.data';
import { AssetTypeRecord } from '../asset-type.model';
import { AssetTypeService } from '../asset-type.service';

/** A new asset type starts with every dropdown empty so the user picks each value. */
function newAssetType(): AssetTypeRecord {
  return {
    ...blankAssetType(),
    maintenanceType: '' as AssetTypeRecord['maintenanceType'],
    depreciationMethod: '' as AssetTypeRecord['depreciationMethod'],
    currency: '',
    defaultCondition: '' as AssetTypeRecord['defaultCondition'],
    trackingMethod: '' as AssetTypeRecord['trackingMethod']
  };
}

export type TypeFormTab = 'basic' | 'classification' | 'lifecycle' | 'financial' | 'defaults' | 'fields';
type FieldKey =
  | 'name'
  | 'code'
  | 'category'
  | 'image'
  | 'taggingFormat'
  | 'lifecycleYears'
  | 'warrantyMonths'
  | 'usefulLifeMonths'
  | 'residualPercent'
  | 'capitalizationThreshold'
  | 'customFields';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TAB_OF: Record<FieldKey, TypeFormTab> = {
  name: 'basic',
  code: 'basic',
  category: 'basic',
  image: 'basic',
  taggingFormat: 'classification',
  lifecycleYears: 'lifecycle',
  warrantyMonths: 'lifecycle',
  usefulLifeMonths: 'financial',
  residualPercent: 'financial',
  capitalizationThreshold: 'financial',
  customFields: 'fields'
};

/** Right-hand "Add / Edit Asset Type" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-type-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './type-form.html',
  styleUrls: [
    '../../../shared/styles/mdm-drawer.css',
    '../../../shared/styles/mdm-drawer-extras.css',
    '../../asset-model/model-form/model-form.css',
    './type-form.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class TypeForm implements OnChanges {
  // 'edit' changes `type`; 'add' creates a new one, pre-filled from `type` if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() type: AssetTypeRecord | null = null;
  @Input() startTab: TypeFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: AssetTypeRecord; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(AssetTypeService);
  readonly icons = { X, Plus, Trash2 };
  readonly typeIcons = MODEL_ICONS;
  readonly iconKeys = MODEL_ICON_KEYS;
  readonly classes = ASSET_CLASSES;
  readonly maintenanceTypes = MAINTENANCE_TYPES;
  readonly fieldTypes = CUSTOM_FIELD_TYPES;
  readonly currencies = CURRENCIES;
  readonly trackingMethods = TRACKING_METHODS;
  readonly tabs: { id: TypeFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'classification', label: 'Classification' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'financial', label: 'Financial' },
    { id: 'defaults', label: 'Defaults' },
    { id: 'fields', label: 'Custom Fields' }
  ];

  tab: TypeFormTab = 'basic';
  form: AssetTypeRecord = newAssetType();
  newSubcategory = '';
  errors: Partial<Record<FieldKey, string>> = {};
  private original: AssetTypeRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.type : null;
    this.form = this.type ? structuredClone(this.type) : newAssetType();
    this.newSubcategory = '';
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get sample(): string {
    return this.form.taggingFormat ? sampleTag(this.form.taggingFormat) : '-';
  }

  get currencyCode(): string {
    return this.form.currency.slice(0, 3);
  }

  // Cost centers already used on asset types, plus the current value
  get costCenters(): string[] {
    return [...new Set([this.form.costCenter, ...this.service.all().map((r) => r.costCenter)].filter(Boolean))];
  }

  // Service providers already used on asset types, plus the current value
  get providers(): string[] {
    return [...new Set([this.form.serviceProvider, ...this.service.all().map((r) => r.serviceProvider)].filter(Boolean))];
  }

  // Suggest a tagging format from the code (AT-LAP-001 gives LAP-{YY}-{0000}) until one is typed
  onCodeChange(): void {
    const part = this.form.code.trim().toUpperCase().split('-').filter(Boolean);
    const prefix = part.length > 1 ? part[1] : part[0];
    if (!prefix) return;
    const current = this.form.taggingFormat;
    if (!current || /^[A-Z0-9]*-\{YY\}-\{0000\}$/.test(current)) this.form.taggingFormat = `${prefix}-{YY}-{0000}`;
    if (!this.form.maintenancePlan || /-STD$/.test(this.form.maintenancePlan)) {
      this.form.maintenancePlan = `${(this.form.costCenter.split('-')[0] || 'GEN').toUpperCase()}-${prefix}-STD`;
    }
  }

  // Useful life follows the lifecycle until it is changed by hand
  setLifecycle(years: number): void {
    if (this.form.usefulLifeMonths === this.form.lifecycleYears * 12 && Number.isInteger(years) && years > 0) {
      this.form.usefulLifeMonths = years * 12;
    }
    this.form.lifecycleYears = years;
  }

  addSubcategory(): void {
    const value = this.newSubcategory.trim();
    if (value && !this.form.subcategories.some((s) => s.toLowerCase() === value.toLowerCase())) {
      this.form.subcategories = [...this.form.subcategories, value];
    }
    this.newSubcategory = '';
  }

  removeSubcategory(name: string): void {
    this.form.subcategories = this.form.subcategories.filter((s) => s !== name);
  }

  addField(): void {
    this.form.customFields = [...this.form.customFields, { name: '', type: '' as AssetTypeRecord['customFields'][number]['type'], required: false }];
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
    if (!f.name.trim()) errors.name = 'Enter an asset type name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.category) errors.category = 'Select a category.';
    if (!f.taggingFormat.trim()) errors.taggingFormat = 'Enter a tagging format.';
    else if (!hasRunningNumber(f.taggingFormat)) errors.taggingFormat = 'Include a running number, e.g. {0000}.';
    if (!Number.isInteger(f.lifecycleYears) || f.lifecycleYears < 1 || f.lifecycleYears > 50) errors.lifecycleYears = 'Enter 1 to 50 years.';
    if (!Number.isInteger(f.warrantyMonths) || f.warrantyMonths < 0 || f.warrantyMonths > 240) errors.warrantyMonths = 'Enter 0 to 240 months.';
    if (!Number.isInteger(f.usefulLifeMonths) || f.usefulLifeMonths < 1 || f.usefulLifeMonths > 600) errors.usefulLifeMonths = 'Enter 1 to 600 months.';
    if (!(f.residualPercent >= 0 && f.residualPercent <= 100)) errors.residualPercent = 'Enter 0 to 100.';
    if (!(f.capitalizationThreshold >= 0)) errors.capitalizationThreshold = 'Enter 0 or more.';
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
        description: f.description.trim(),
        taggingFormat: f.taggingFormat.trim(),
        customFields: f.customFields.map((c) => ({ ...c, name: c.name.trim() })),
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? '',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
