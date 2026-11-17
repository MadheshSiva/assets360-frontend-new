import { Component, EventEmitter, Input, OnChanges, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { AssetTypeService } from '../../asset-type/asset-type.service';
import { CategoryService } from '../../category-subcategory/category.service';
import { ManufacturerService } from '../../manufacturer/manufacturer.service';
import { CRITICALITIES, PM_FREQUENCIES, TRACKING_METHODS, blankAssetModel, hasRunningNumber, sampleTag, specsFor } from '../asset-model.data';
import { MODEL_ICONS } from '../asset-model.icons';
import { AssetModelRecord } from '../asset-model.model';

/** A new model starts with every dropdown empty so the user picks each value. */
function newAssetModel(): AssetModelRecord {
  return {
    ...blankAssetModel(),
    pmFrequency: '' as AssetModelRecord['pmFrequency'],
    maintenanceStrategy: '' as AssetModelRecord['maintenanceStrategy'],
    criticality: '' as AssetModelRecord['criticality'],
    currency: '',
    depreciationMethod: '' as AssetModelRecord['depreciationMethod'],
    trackingMethod: '' as AssetModelRecord['trackingMethod'],
    defaultCondition: '' as AssetModelRecord['defaultCondition']
  };
}
import { AssetModelService } from '../asset-model.service';

export type ModelFormTab = 'basic' | 'specs' | 'lifecycle' | 'financial' | 'defaults';
type FieldKey =
  | 'name'
  | 'code'
  | 'manufacturer'
  | 'assetType'
  | 'category'
  | 'image'
  | 'specs'
  | 'lifecycleYears'
  | 'warrantyMonths'
  | 'purchasePrice'
  | 'salvagePercent'
  | 'taggingFormat';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TAB_OF: Record<FieldKey, ModelFormTab> = {
  name: 'basic',
  code: 'basic',
  manufacturer: 'basic',
  assetType: 'basic',
  category: 'basic',
  image: 'basic',
  specs: 'specs',
  lifecycleYears: 'lifecycle',
  warrantyMonths: 'lifecycle',
  purchasePrice: 'financial',
  salvagePercent: 'financial',
  taggingFormat: 'defaults'
};

/** Right-hand "Add / Edit Asset Model" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-model-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './model-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', './model-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ModelForm implements OnInit, OnChanges {
  // 'edit' changes `model`; 'add' creates a new one, pre-filled from `model` if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() model: AssetModelRecord | null = null;
  @Input() startTab: ModelFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: AssetModelRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(AssetModelService);
  readonly types = inject(AssetTypeService);
  readonly makers = inject(ManufacturerService);
  private readonly categoryStore = inject(CategoryService);
  readonly icons = { X, Plus, Trash2 };
  readonly modelIcons = MODEL_ICONS;
  readonly currencies = CURRENCIES;
  readonly pmFrequencies = PM_FREQUENCIES;
  readonly criticalities = CRITICALITIES;
  readonly trackingMethods = TRACKING_METHODS;
  readonly strategies = ['Preventive', 'Predictive', 'Condition Based', 'Run to Failure'] as const;
  readonly tabs: { id: ModelFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'specs', label: 'Specifications' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'financial', label: 'Financial' },
    { id: 'defaults', label: 'Defaults' }
  ];

  tab: ModelFormTab = 'basic';
  form: AssetModelRecord = newAssetModel();
  subcategoriesText = '';
  errors: Partial<Record<FieldKey, string>> = {};
  private original: AssetModelRecord | null = null;

  /**
   * Refreshes the Basic Information lists every time the form opens. The stores otherwise load once per session,
   * so a first load that failed (e.g. before the token was ready) or masters added since would leave them empty or stale.
   */
  ngOnInit(): void {
    // A failed load leaves the list as it was; the store records the error
    const ignoreError = { error: () => undefined };
    this.types.reload().subscribe(ignoreError);
    this.makers.reload().subscribe(ignoreError);
    this.categoryStore.reload().subscribe(ignoreError);
  }

  get listsLoading(): boolean {
    return this.types.loading() || this.makers.loading() || this.categoryStore.loading();
  }

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.model : null;
    this.form = this.model ? structuredClone(this.model) : newAssetModel();
    this.subcategoriesText = this.form.subcategories.join(', ');
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get typeIcon() {
    return this.modelIcons[this.types.iconFor(this.form.assetType)];
  }

  // Active manufacturers from the Manufacturer master; the current one stays listed
  get manufacturers(): string[] {
    return this.makers.activeNames(this.original?.manufacturer ?? this.model?.manufacturer ?? '');
  }

  get categories(): string[] {
    return [...new Set([...this.types.categories(), ...this.service.all().map((r) => r.category)])];
  }

  // Active types from the Asset Type master; the current one stays listed even if it was deactivated
  get typesInCategory() {
    return this.types.all().filter((t) => (t.status === 'Active' || t.name === this.form.assetType) && (!this.form.category || !t.category || t.category === this.form.category));
  }

  get sample(): string {
    return this.form.taggingFormat ? sampleTag(this.form.taggingFormat) : '-';
  }

  get currencyCode(): string {
    return this.form.currency.slice(0, 3);
  }

  /** Picking a type fills its category and the defaults set on the Asset Type master. */
  onTypeChange(): void {
    const type = this.types.findByName(this.form.assetType);
    if (!type) return;
    this.form.category = type.category;
    // Only replace a format that is still some type's default
    const format = this.form.taggingFormat;
    if (!format || this.types.all().some((t) => t.taggingFormat === format)) this.form.taggingFormat = type.taggingFormat;
    if (!this.isEdit) {
      this.form.lifecycleYears = type.lifecycleYears;
      this.form.warrantyMonths = type.warrantyMonths;
      this.form.costCenter = type.costCenter || this.form.costCenter;
      this.form.currency = type.currency;
      this.form.depreciationMethod = type.depreciationMethod;
      this.form.salvagePercent = type.residualPercent;
      this.form.procurementType = type.procurementType;
      this.form.trackingMethod = type.trackingMethod;
      this.form.defaultCondition = type.defaultCondition;
      this.form.serialRequired = type.serialRequired;
      this.form.assignable = type.assignable;
    }
    if (!this.form.specs.length) this.loadTemplate();
  }

  // Cost centers already used on asset models, plus the current value
  get costCenters(): string[] {
    return [...new Set([this.form.costCenter, ...this.service.all().map((r) => r.costCenter)].filter(Boolean))];
  }

  // A category that no longer fits the chosen type clears the type
  onCategoryChange(): void {
    const type = this.types.findByName(this.form.assetType);
    if (type && type.category !== this.form.category) this.form.assetType = '';
  }

  loadTemplate(): void {
    const type = this.types.findByName(this.form.assetType);
    if (!type) return;
    const existing = new Set(this.form.specs.map((s) => s.label.toLowerCase()));
    const rows = specsFor(type, 0)
      .filter((s) => !existing.has(s.label.toLowerCase()))
      .map((s) => ({ label: s.label, value: '' }));
    this.form.specs = [...this.form.specs, ...rows];
  }

  addSpec(): void {
    this.form.specs = [...this.form.specs, { label: '', value: '' }];
  }

  removeSpec(index: number): void {
    this.form.specs = this.form.specs.filter((_, i) => i !== index);
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
    if (!f.name.trim()) errors.name = 'Enter a model name.';
    else if (f.manufacturer && this.service.isModelNameTaken(f.name, f.manufacturer, this.original?.code ?? null)) {
      errors.name = `${f.manufacturer} already has a model named ${f.name.trim()}.`;
    }
    if (!f.code.trim()) errors.code = 'Enter a model code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.manufacturer) errors.manufacturer = 'Select a manufacturer.';
    if (!f.assetType) errors.assetType = 'Select an asset type.';
    if (!f.category) errors.category = 'Select a category.';
    if (f.specs.some((s) => !s.label.trim() && s.value.trim())) errors.specs = 'Every value needs a specification name.';
    if (!Number.isInteger(f.lifecycleYears) || f.lifecycleYears < 1 || f.lifecycleYears > 50) errors.lifecycleYears = 'Enter 1 to 50 years.';
    if (!Number.isInteger(f.warrantyMonths) || f.warrantyMonths < 0 || f.warrantyMonths > 240) errors.warrantyMonths = 'Enter 0 to 240 months.';
    if (f.purchasePrice !== null && !(f.purchasePrice >= 0)) errors.purchasePrice = 'Price can’t be negative.';
    if (!(f.salvagePercent >= 0 && f.salvagePercent <= 100)) errors.salvagePercent = 'Enter 0 to 100.';
    if (!f.taggingFormat.trim()) errors.taggingFormat = 'Enter a tagging format.';
    else if (!hasRunningNumber(f.taggingFormat)) errors.taggingFormat = 'Include a running number, e.g. (0000).';
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
        specs: f.specs.filter((s) => s.label.trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
        subcategories: this.subcategoriesText.split(',').map((s) => s.trim()).filter(Boolean),
        taggingFormat: f.taggingFormat.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
