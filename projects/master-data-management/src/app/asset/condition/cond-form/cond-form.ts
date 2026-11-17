import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { HEX_COLOR, LEVEL_ICONS, LEVEL_ICON_KEYS } from '../../level-icons';
import { CONDITION_TYPES, blankCondition } from '../condition.data';
import { ConditionRecord } from '../condition.model';
import { ConditionService } from '../condition.service';

/** A new condition starts with its Type dropdown empty so the user picks it. */
function newCondition(): ConditionRecord {
  return { ...blankCondition(), type: '' as ConditionRecord['type'] };
}

export type CondFormTab = 'basic' | 'health' | 'usage' | 'settings';
type FieldKey = 'name' | 'code' | 'type' | 'color' | 'image' | 'isDefault' | 'healthScore' | 'displayOrder';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TAB_OF: Record<FieldKey, CondFormTab> = {
  name: 'basic',
  code: 'basic',
  type: 'basic',
  color: 'basic',
  image: 'basic',
  isDefault: 'basic',
  healthScore: 'health',
  displayOrder: 'health'
};

/** Right-hand "Add / Edit Condition" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-cond-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cond-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../level-form.css', './cond-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class CondForm implements OnChanges {
  // 'edit' changes `condition`; 'add' creates a new one, pre-filled from it if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() condition: ConditionRecord | null = null;
  @Input() startTab: CondFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: ConditionRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(ConditionService);
  readonly icons = { X };
  readonly levelIcons = LEVEL_ICONS;
  readonly iconKeys = LEVEL_ICON_KEYS;
  readonly types = CONDITION_TYPES;
  readonly characteristicFields: { key: keyof ConditionRecord['characteristics']; label: string }[] = [
    { key: 'physicalState', label: 'Physical State' },
    { key: 'functionality', label: 'Functionality' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'maintenanceNeed', label: 'Maintenance Need' },
    { key: 'expectedRemainingLife', label: 'Expected Remaining Life' }
  ];
  readonly tabs: { id: CondFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'health', label: 'Health & Visual' },
    { id: 'usage', label: 'Usage & Rules' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: CondFormTab = 'basic';
  form: ConditionRecord = newCondition();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: ConditionRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.condition : null;
    this.form = this.condition ? structuredClone(this.condition) : newCondition();
    if (!this.form.displayOrder) this.form.displayOrder = this.service.all().length + 1;
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get pickerColor(): string {
    return HEX_COLOR.test(this.form.color) ? this.form.color.toLowerCase() : '#000000';
  }

  /** Every other condition, for the "can move from / to" lists. */
  get others() {
    return this.service.all().filter((c) => c.code !== this.original?.code);
  }

  hasRule(list: 'canMoveFrom' | 'canMoveTo', code: string): boolean {
    return this.form[list].includes(code);
  }

  toggleRule(list: 'canMoveFrom' | 'canMoveTo', code: string): void {
    const current = this.form[list];
    this.form[list] = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
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
    if (!f.name.trim()) errors.name = 'Enter a condition name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.type) errors.type = 'Select a type.';
    if (!HEX_COLOR.test(f.color.trim())) errors.color = 'Enter a colour like #4CAF50.';
    if (this.original?.isDefault && !f.isDefault) errors.isDefault = 'Make another condition the default instead.';
    else if (f.isDefault && f.status !== 'Active') errors.isDefault = 'The default condition must be active.';
    if (!Number.isInteger(f.healthScore) || f.healthScore < 0 || f.healthScore > 100) errors.healthScore = 'Enter 0 to 100.';
    if (!Number.isInteger(f.displayOrder) || f.displayOrder < 1) errors.displayOrder = 'Enter 1 or more.';
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
        triggerCriteria: f.triggerCriteria.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? '',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
