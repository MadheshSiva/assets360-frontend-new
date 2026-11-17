import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArrowRight, ArrowUp, Box, Building2, ChevronDown, Copy, Ellipsis, Layers, LucideAngularModule, Pencil, Plus, Wrench, X } from 'lucide-angular';
import { formatDateTime } from '../../../organization/location/location.format';
import { apiErrorMessage } from '../../../shared/mdm-api';
import { MODEL_ICONS, MODEL_ICON_KEYS } from '../../asset-model/asset-model.icons';
import { subcategoryCode } from '../category.data';
import { CategoryRecord, SubcategoryRecord } from '../category.model';
import { CategoryService } from '../category.service';
import { CatFormTab } from '../cat-form/cat-form';

type DetailTab = 'overview' | 'subcategories' | 'assets' | 'fields' | 'defaults' | 'documents' | 'activity';

interface HierarchyRow {
  key: string;
  label: string;
  level: number;
  kind: 'root' | 'category' | 'current' | 'sub';
  code: string | null;
  icon: SubcategoryRecord['icon'] | null;
}

/** Panel under the list showing the selected category, with its subcategories. */
@Component({
  selector: 'app-cat-detail',
  imports: [DecimalPipe, NgTemplateOutlet, FormsModule, LucideAngularModule],
  templateUrl: './cat-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../../shared/styles/mdm-drawer-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    '../../level-detail.css',
    './cat-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class CatDetail implements OnChanges {
  @Input({ required: true }) category!: CategoryRecord;
  @Output() edit = new EventEmitter<{ category: CategoryRecord; tab?: CatFormTab }>();
  @Output() duplicate = new EventEmitter<CategoryRecord>();
  @Output() addChild = new EventEmitter<CategoryRecord>();
  @Output() toggleStatus = new EventEmitter<CategoryRecord>();
  @Output() remove = new EventEmitter<CategoryRecord>();
  @Output() select = new EventEmitter<string>();
  @Output() notify = new EventEmitter<string>();

  readonly service = inject(CategoryService);
  readonly typeIcons = MODEL_ICONS;
  readonly iconKeys = MODEL_ICON_KEYS;
  readonly icons = { Pencil, Copy, ChevronDown, Layers, Box, Wrench, ArrowRight, ArrowUp, Plus, Ellipsis, Building2, X };
  readonly formatDateTime = formatDateTime;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'subcategories', label: 'Subcategories' },
    { id: 'assets', label: 'Assets' },
    { id: 'fields', label: 'Custom Fields' },
    { id: 'defaults', label: 'Default Values' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;
  subMenuFor: string | null = null;
  subSort: 1 | -1 | 0 = 1;
  picked = new Set<string>();

  // Subcategory dialog
  subForm: SubcategoryRecord | null = null;
  subOriginal: string | null = null;
  subErrors: { name?: string; code?: string } = {};
  subSaving = false;

  ngOnChanges(): void {
    this.moreOpen = false;
    this.subMenuFor = null;
    this.picked.clear();
  }

  get parent(): CategoryRecord | undefined {
    return this.service.find(this.category.parentCode);
  }

  get assetCount(): number {
    return this.service.assetsOf(this.category);
  }

  get subs(): SubcategoryRecord[] {
    const list = this.category.subcategories;
    return this.subSort ? [...list].sort((a, b) => this.subSort * a.name.localeCompare(b.name)) : list;
  }

  get allPicked(): boolean {
    return this.subs.length > 0 && this.subs.every((s) => this.picked.has(s.code));
  }

  /** All Assets > parent categories > this category > its child categories and subcategories. */
  get hierarchy(): HierarchyRow[] {
    const rows: HierarchyRow[] = [{ key: 'root', label: 'All Assets', level: 0, kind: 'root', code: null, icon: null }];
    this.service.ancestry(this.category.parentCode).forEach((c) =>
      rows.push({ key: c.code, label: `${c.name} (${c.code})`, level: rows.length, kind: 'category', code: c.code, icon: null })
    );
    const level = rows.length;
    rows.push({ key: this.category.code, label: `${this.category.name} (${this.category.code})`, level, kind: 'current', code: null, icon: null });
    this.service.children(this.category.code).forEach((c) =>
      rows.push({ key: c.code, label: `${c.name} (${c.code})`, level: level + 1, kind: 'category', code: c.code, icon: null })
    );
    this.category.subcategories.forEach((s) =>
      rows.push({ key: s.code, label: `${s.name} (${s.code})`, level: level + 1, kind: 'sub', code: null, icon: s.icon })
    );
    return rows;
  }

  share(s: SubcategoryRecord): number {
    return this.assetCount ? (s.assets / this.assetCount) * 100 : 0;
  }

  toggleSort(): void {
    this.subSort = this.subSort === 1 ? -1 : this.subSort === -1 ? 0 : 1;
  }

  togglePick(code: string): void {
    if (this.picked.has(code)) {
      this.picked.delete(code);
    } else {
      this.picked.add(code);
    }
  }

  togglePickAll(): void {
    const all = !this.allPicked;
    this.subs.forEach((s) => (all ? this.picked.add(s.code) : this.picked.delete(s.code)));
  }

  // Documents and the audit log are owned by other modules; empty until those APIs are wired
  readonly documentRows: { name: string; kind: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  editAt(tab: CatFormTab): void {
    this.edit.emit({ category: this.category, tab });
  }

  openSubForm(sub: SubcategoryRecord | null): void {
    this.subMenuFor = null;
    this.subOriginal = sub?.code ?? null;
    this.subForm = sub ? { ...sub } : { code: '', name: '', icon: this.category.icon, color: this.category.color, status: 'Active', assets: 0 };
    this.subErrors = {};
  }

  // Suggest SUB-<category>-<first letters> while the code is still the suggestion
  onSubNameChange(): void {
    const f = this.subForm;
    if (!f || this.subOriginal) return;
    const taken = this.service.allSubCodes();
    const suggestion = f.name.trim() ? subcategoryCode(this.category.code, f.name.trim(), taken) : '';
    if (!f.code || f.code.startsWith(`SUB-${this.category.code.replace(/^CAT-/, '')}-`)) f.code = suggestion;
  }

  saveSub(): void {
    const f = this.subForm;
    if (!f) return;
    const errors: { name?: string; code?: string } = {};
    const name = f.name.trim();
    if (!name) errors.name = 'Enter a subcategory name.';
    else if (this.category.subcategories.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.code !== this.subOriginal)) {
      errors.name = `${this.category.name} already has ${name}.`;
    }
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isSubCodeTaken(f.code, this.subOriginal)) errors.code = `${f.code.trim()} is already used.`;
    this.subErrors = errors;
    if (errors.name || errors.code || this.subSaving) return;
    this.subSaving = true;
    this.service.saveSubcategory(this.category.code, { ...f, name, code: f.code.trim().toUpperCase() }, this.subOriginal).subscribe({
      next: () => {
        this.subSaving = false;
        this.notify.emit(`${name} ${this.subOriginal ? 'updated' : 'added'}.`);
        this.subForm = null;
      },
      error: (err) => {
        this.subSaving = false;
        this.notify.emit(apiErrorMessage(err));
      }
    });
  }

  toggleSubStatus(s: SubcategoryRecord): void {
    this.subMenuFor = null;
    const status = s.status === 'Active' ? 'Inactive' : 'Active';
    this.service.saveSubcategory(this.category.code, { ...s, status }, s.code).subscribe({
      next: () => this.notify.emit(`${s.name} marked ${status}.`),
      error: (err) => this.notify.emit(apiErrorMessage(err))
    });
  }

  // Subcategories with assets can't be deleted
  removeSubs(codes: string[]): void {
    this.subMenuFor = null;
    const used = this.category.subcategories.find((s) => codes.includes(s.code) && s.assets > 0);
    if (used) {
      this.notify.emit(`${used.name} has ${used.assets} assets. Mark it Inactive instead.`);
      return;
    }
    this.service.removeSubcategories(this.category.code, codes).subscribe({
      next: () => {
        codes.forEach((c) => this.picked.delete(c));
        this.notify.emit(codes.length === 1 ? 'Subcategory deleted.' : `${codes.length} subcategories deleted.`);
      },
      error: (err) => this.notify.emit(apiErrorMessage(err))
    });
  }

  removePicked(): void {
    this.removeSubs([...this.picked]);
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
    this.subMenuFor = null;
  }
}
