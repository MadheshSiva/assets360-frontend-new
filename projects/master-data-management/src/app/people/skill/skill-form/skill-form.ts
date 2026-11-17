import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { MODEL_ICONS, MODEL_ICON_KEYS } from '../../../asset/asset-model/asset-model.icons';
import { DESIGNATIONS, nowStamp } from '../../people.data';
import { DEFAULT_LEVELS, SKILL_CATEGORIES, blankSkill } from '../skill.data';
import { SkillRecord } from '../skill.model';
import { SkillService } from '../skill.service';

type FormTab = 'basic' | 'levels' | 'roles' | 'settings';
type FieldKey = 'name' | 'code' | 'category' | 'status' | 'levels' | 'validity';

/** Right-hand "Add / Edit Skill" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-skill-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './skill-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class SkillForm implements OnChanges {
  // 'edit' changes `skill`; 'add' creates a new one, pre-filled from it if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() skill: SkillRecord | null = null;
  // People holding the skill, shown as a warning when renaming or deactivating
  @Input() usage = 0;
  @Output() saved = new EventEmitter<{ record: SkillRecord; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(SkillService);
  readonly icons = { X, Plus, Trash2 };
  readonly skillIcons = MODEL_ICONS;
  readonly iconKeys = MODEL_ICON_KEYS;
  readonly categories = SKILL_CATEGORIES;
  readonly roles = DESIGNATIONS;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'levels', label: 'Proficiency Levels' },
    { id: 'roles', label: 'Related Roles' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: SkillRecord = blankSkill();
  iconPickerOpen = false;
  errors: Partial<Record<FieldKey, string>> = {};
  private original: SkillRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.skill : null;
    this.form = this.skill ? structuredClone(this.skill) : blankSkill();
    this.errors = {};
    this.tab = 'basic';
    this.iconPickerOpen = false;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  addLevel(): void {
    this.form.levels = [...this.form.levels, ''];
  }

  removeLevel(index: number): void {
    this.form.levels = this.form.levels.filter((_, i) => i !== index);
  }

  moveLevel(index: number, by: -1 | 1): void {
    const levels = [...this.form.levels];
    const target = index + by;
    if (target < 0 || target >= levels.length) return;
    [levels[index], levels[target]] = [levels[target], levels[index]];
    this.form.levels = levels;
  }

  resetLevels(): void {
    this.form.levels = [...DEFAULT_LEVELS];
  }

  hasRole(role: string): boolean {
    return this.form.relatedRoles.includes(role);
  }

  toggleRole(role: string): void {
    this.form.relatedRoles = this.hasRole(role) ? this.form.relatedRoles.filter((r) => r !== role) : [...this.form.relatedRoles, role];
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
    if (!f.name.trim()) errors.name = 'Enter a skill name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.category) errors.category = 'Select a category.';
    if (!f.status) errors.status = 'Select a status.';
    const levels = f.levels.map((l) => l.trim());
    if (levels.some((l) => !l)) errors.levels = 'Name every level or remove the empty ones.';
    else if (new Set(levels.map((l) => l.toLowerCase())).size !== levels.length) errors.levels = 'Level names must be different.';
    if (f.certificationRequired && !(Number.isInteger(f.certificationValidityMonths) && f.certificationValidityMonths > 0)) {
      errors.validity = 'Enter the validity in months.';
    }
    this.errors = errors;

    if (Object.keys(errors).length) {
      this.tab = errors.name || errors.code || errors.category || errors.status ? 'basic' : errors.levels ? 'levels' : 'settings';
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...f,
        name: f.name.trim(),
        code: f.code.trim().toUpperCase(),
        description: f.description.trim(),
        levels,
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
