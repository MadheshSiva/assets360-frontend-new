import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { HEX_COLOR, LEVEL_ICONS, LEVEL_ICON_KEYS } from '../../level-icons';
import { INSPECTION_FREQUENCIES, MONITORING, PRIORITIES, SCALE, STRATEGIES, blankCriticality } from '../criticality.data';
import { CriticalityRecord } from '../criticality.model';
import { CriticalityService } from '../criticality.service';

/** A new level starts with every dropdown empty so the user picks each value. */
function newCriticality(): CriticalityRecord {
  return {
    ...blankCriticality(),
    riskLevel: '' as CriticalityRecord['riskLevel'],
    maintenancePriority: '' as CriticalityRecord['maintenancePriority'],
    likelihood: '' as CriticalityRecord['likelihood'],
    impact: '' as CriticalityRecord['impact'],
    inspectionFrequency: '' as CriticalityRecord['inspectionFrequency'],
    conditionMonitoring: '' as CriticalityRecord['conditionMonitoring'],
    sparePartsPriority: '' as CriticalityRecord['sparePartsPriority']
  };
}

export type CritFormTab = 'basic' | 'risk' | 'maintenance' | 'settings';
type FieldKey = 'name' | 'code' | 'riskLevel' | 'maintenancePriority' | 'color' | 'image' | 'isDefault' | 'responseTimeHours';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Right-hand "Add / Edit Criticality" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-crit-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './crit-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../level-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class CritForm implements OnChanges {
  // 'edit' changes `level`; 'add' creates a new one, pre-filled from `level` if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() level: CriticalityRecord | null = null;
  @Input() startTab: CritFormTab = 'basic';
  @Output() saved = new EventEmitter<{ record: CriticalityRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(CriticalityService);
  readonly icons = { X };
  readonly levelIcons = LEVEL_ICONS;
  readonly iconKeys = LEVEL_ICON_KEYS;
  readonly scale = SCALE;
  readonly priorities = PRIORITIES;
  readonly monitoring = MONITORING;
  readonly strategies = STRATEGIES;
  readonly frequencies = INSPECTION_FREQUENCIES;
  readonly impactFields: { key: keyof CriticalityRecord['businessImpact']; label: string }[] = [
    { key: 'safety', label: 'Safety Impact' },
    { key: 'operational', label: 'Operational Impact' },
    { key: 'financial', label: 'Financial Impact' },
    { key: 'regulatory', label: 'Regulatory Impact' },
    { key: 'reputation', label: 'Reputation Impact' },
    { key: 'environmental', label: 'Environmental Impact' }
  ];
  readonly tabs: { id: CritFormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'risk', label: 'Risk & Impact' },
    { id: 'maintenance', label: 'Maintenance & Lifecycle' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: CritFormTab = 'basic';
  form: CriticalityRecord = newCriticality();
  errors: Partial<Record<FieldKey, string>> = {};
  private original: CriticalityRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.level : null;
    this.form = this.level ? structuredClone(this.level) : newCriticality();
    this.errors = {};
    this.tab = this.startTab;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // The colour picker needs lower-case #rrggbb; the text box accepts what is typed
  get pickerColor(): string {
    return HEX_COLOR.test(this.form.color) ? this.form.color.toLowerCase() : '#000000';
  }

  onRiskLevelChange(): void {
    // A new level sits on the matrix diagonal for its risk level until moved
    if (!this.isEdit) {
      this.form.likelihood = this.form.riskLevel;
      this.form.impact = this.form.riskLevel;
    }
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
    if (!f.name.trim()) errors.name = 'Enter a criticality name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.riskLevel) errors.riskLevel = 'Select a risk level.';
    if (!f.maintenancePriority) errors.maintenancePriority = 'Select a maintenance priority.';
    if (!HEX_COLOR.test(f.color.trim())) errors.color = 'Enter a colour like #EF4444.';
    if (this.original?.isDefault && !f.isDefault) errors.isDefault = 'Make another level the default instead.';
    else if (f.isDefault && f.status !== 'Active') errors.isDefault = 'The default level must be active.';
    if (!Number.isInteger(f.responseTimeHours) || f.responseTimeHours < 1 || f.responseTimeHours > 720) errors.responseTimeHours = 'Enter 1 to 720 hours.';
    this.errors = errors;

    if (Object.keys(errors).length) {
      this.tab = errors.responseTimeHours && Object.keys(errors).length === 1 ? 'maintenance' : 'basic';
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
        createdOn: this.original?.createdOn ?? stamp,
        createdBy: this.original?.createdBy ?? '',
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
