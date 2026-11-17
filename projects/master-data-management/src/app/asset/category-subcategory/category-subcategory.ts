import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, Box, ChevronLeft, ChevronRight, Ellipsis, Layers, LucideAngularModule, MapPin, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { apiErrorMessage } from '../../shared/mdm-api';
import { MODEL_ICONS } from '../asset-model/asset-model.icons';
import { CatDetail } from './cat-detail/cat-detail';
import { CatForm, CatFormTab } from './cat-form/cat-form';
import { blankCategory } from './category.data';
import { CategoryFilters, CategoryRecord } from './category.model';
import { CategoryService } from './category.service';

type SortKey = 'name' | 'code' | 'subcategories' | 'assets';

const EMPTY_FILTERS: CategoryFilters = { search: '', status: '', assetType: '' };

/** Master Data Management > Asset > Category / Subcategory */
@Component({
  selector: 'app-mdm-asset-category-subcategory',
  imports: [FormsModule, RouterLink, DecimalPipe, LucideAngularModule, CatForm, CatDetail],
  templateUrl: './category-subcategory.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../asset-model/asset-model.css', '../../shared/styles/mdm-purple-theme.css']
})
export class CategorySubcategoryPage implements OnInit {
  readonly service = inject(CategoryService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly typeIcons = MODEL_ICONS;
  readonly icons = { MapPin, Layers, Box, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  readonly pageSizes = [10, 20, 50];

  @ViewChild('detailEl') detailEl?: ElementRef<HTMLElement>;
  @ViewChild('formEl', { read: ElementRef }) formEl?: ElementRef<HTMLElement>;

  draft: CategoryFilters = { ...EMPTY_FILTERS };
  applied: CategoryFilters = { ...EMPTY_FILTERS };

  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  selected = new Set<string>();
  menuFor: string | null = null;

  selectedCode: string | null = null;
  formOpen = false;
  formMode: 'add' | 'edit' = 'add';
  formRecord: CategoryRecord | null = null;
  formTab: CatFormTab = 'basic';

  pendingDelete: CategoryRecord[] = [];
  saving = false;
  deleting = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.service.reload().subscribe({
      next: (list) => {
        if (!this.service.find(this.selectedCode)) this.selectedCode = list[0]?.code ?? null;
      },
      error: (err) => this.notify(`Could not load asset categories: ${apiErrorMessage(err)}`)
    });
  }

  get stats() {
    const all = this.service.all();
    return {
      total: all.length,
      subcategories: all.reduce((sum, r) => sum + r.subcategories.length, 0),
      assets: all.reduce((sum, r) => sum + this.service.assetsOf(r), 0),
      active: all.filter((r) => r.status === 'Active').length
    };
  }

  get rows(): CategoryRecord[] {
    const rows = this.service.filter(this.applied);
    const key = this.sortKey;
    if (!key) return rows;
    const value = (r: CategoryRecord) => (key === 'subcategories' ? r.subcategories.length : this.service.assetsOf(r));
    return [...rows].sort((a, b) =>
      this.sortDir * (key === 'name' || key === 'code' ? a[key].localeCompare(b[key], undefined, { numeric: true }) : value(a) - value(b))
    );
  }

  get pageRows(): CategoryRecord[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get pageNumbers(): number[] {
    const count = this.pageCount;
    const start = Math.max(0, Math.min(this.page - 2, count - 5));
    return Array.from({ length: Math.min(5, count) }, (_, i) => start + i);
  }

  get showingFrom(): number {
    return this.rows.length ? this.page * this.pageSize + 1 : 0;
  }

  get showingTo(): number {
    return Math.min((this.page + 1) * this.pageSize, this.rows.length);
  }

  get allOnPageSelected(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((r) => this.selected.has(r.code));
  }

  get selectedCategory(): CategoryRecord | undefined {
    return this.service.find(this.selectedCode);
  }

  apply(): void {
    this.applied = { ...this.draft };
    this.page = 0;
  }

  clear(): void {
    this.draft = { ...EMPTY_FILTERS };
    this.apply();
  }

  sortBy(key: SortKey): void {
    if (this.sortKey !== key) {
      this.sortKey = key;
      this.sortDir = 1;
    } else if (this.sortDir === 1) {
      this.sortDir = -1;
    } else {
      this.sortKey = null;
    }
    this.page = 0;
  }

  goTo(page: number): void {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
  }

  toggleRow(code: string): void {
    if (this.selected.has(code)) {
      this.selected.delete(code);
    } else {
      this.selected.add(code);
    }
  }

  togglePage(): void {
    const select = !this.allOnPageSelected;
    this.pageRows.forEach((r) => (select ? this.selected.add(r.code) : this.selected.delete(r.code)));
  }

  open(code: string, scroll = true): void {
    this.selectedCode = code;
    this.menuFor = null;
    if (scroll) setTimeout(() => this.detailEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  toggleMenu(code: string): void {
    this.menuFor = this.menuFor === code ? null : code;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuFor = null;
  }

  openAdd(prefill: CategoryRecord | null = null): void {
    this.menuFor = null;
    this.formMode = 'add';
    this.formRecord = prefill;
    this.formTab = 'basic';
    this.formOpen = true;
    this.revealForm();
  }

  // A copy keeps the defaults and custom fields but starts without subcategories
  duplicate(c: CategoryRecord): void {
    this.openAdd({ ...structuredClone(c), code: '', name: `${c.name} (Copy)`, status: 'Active', subcategories: [], openWorkOrders: 0, documents: 0 });
  }

  // A child category starts with its parent's accounting defaults
  addChild(parent: CategoryRecord): void {
    const { assetType, icon, color, depreciationMethod, usefulLifeYears, costCenter, trackingMethod, defaultCondition } = parent;
    this.openAdd({ ...blankCategory(), parentCode: parent.code, assetType, icon, color, depreciationMethod, usefulLifeYears, costCenter, trackingMethod, defaultCondition });
  }

  openEdit(event: { category: CategoryRecord; tab?: CatFormTab }): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = event.category;
    this.formTab = event.tab ?? 'basic';
    this.formOpen = true;
    this.revealForm();
  }

  // The drawer sits at the top of the page; bring it into view when opened from further down
  private revealForm(): void {
    setTimeout(() => this.formEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  closeForm(): void {
    this.formOpen = false;
    this.formRecord = null;
  }

  onSaved(event: { record: CategoryRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        if (event.originalCode && this.selected.delete(event.originalCode)) this.selected.add(saved.code);
        this.open(saved.code, false);
        this.notify(`${saved.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }


  toggleStatus(c: CategoryRecord): void {
    this.menuFor = null;
    const status = c.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(c, status).subscribe({
      next: () => this.notify(`${c.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // Categories with assets, or with child categories that stay, can't be deleted
  askDelete(list: CategoryRecord[]): void {
    this.menuFor = null;
    const used = list.find((c) => this.service.assetsOf(c) > 0);
    if (used) {
      this.notify(`${used.name} has ${this.service.assetsOf(used).toLocaleString('en-US')} assets. Mark it Inactive instead.`);
      return;
    }
    const codes = new Set(list.map((c) => c.code));
    const parent = list.find((c) => this.service.children(c.code).some((child) => !codes.has(child.code)));
    if (parent) {
      this.notify(`${parent.name} has child categories. Delete or move them first.`);
      return;
    }
    this.pendingDelete = list;
  }

  askDeleteSelected(): void {
    this.askDelete(this.service.all().filter((r) => this.selected.has(r.code)));
  }

  confirmDelete(): void {
    if (this.deleting) return;
    const list = this.pendingDelete;
    const codes = list.map((r) => r.code);
    const done = (message: string) => {
      // Records deleted before a failure are gone too
      const gone = codes.filter((c) => !this.service.find(c));
      gone.forEach((c) => this.selected.delete(c));
      if (this.selectedCode && gone.includes(this.selectedCode)) this.selectedCode = this.service.all()[0]?.code ?? null;
      if (this.formMode === 'edit' && this.formRecord && gone.includes(this.formRecord.code)) this.closeForm();
      this.notify(message);
      this.pendingDelete = [];
      this.deleting = false;
      this.goTo(this.page);
    };
    this.deleting = true;
    this.service.deleteCategories(codes).subscribe({
      complete: () => done(codes.length === 1 ? `${list[0].name} deleted.` : `${codes.length} categories deleted.`),
      error: (err) => done(`Delete failed: ${apiErrorMessage(err)}`)
    });
  }


  cancelDelete(): void {
    this.pendingDelete = [];
  }

  notify(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
