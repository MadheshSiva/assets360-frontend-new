import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, Box, ChevronLeft, ChevronRight, Ellipsis, List, LucideAngularModule, Plus, Search, Settings, Star } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { apiErrorMessage } from '../../shared/mdm-api';
import { CondDetail } from './cond-detail/cond-detail';
import { CondForm, CondFormTab } from './cond-form/cond-form';
import { CONDITION_TYPES } from './condition.data';
import { ConditionFilters, ConditionRecord } from './condition.model';
import { ConditionService } from './condition.service';

type SortKey = 'name' | 'code' | 'healthScore';

const EMPTY_FILTERS: ConditionFilters = { search: '', status: '', type: '' };

/** Master Data Management > Asset > Condition */
@Component({
  selector: 'app-mdm-asset-condition',
  imports: [FormsModule, RouterLink, LucideAngularModule, CondForm, CondDetail],
  templateUrl: './condition.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../level-page.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ConditionPage implements OnInit {
  readonly service = inject(ConditionService);
  readonly types = CONDITION_TYPES;
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly icons = { Settings, List, Box, Star, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  readonly pageSizes = [10, 20, 50];

  @ViewChild('detailEl') detailEl?: ElementRef<HTMLElement>;
  @ViewChild('formEl', { read: ElementRef }) formEl?: ElementRef<HTMLElement>;

  draft: ConditionFilters = { ...EMPTY_FILTERS };
  applied: ConditionFilters = { ...EMPTY_FILTERS };

  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  selected = new Set<string>();
  menuFor: string | null = null;

  selectedCode: string | null = null;
  formOpen = false;
  formMode: 'add' | 'edit' = 'add';
  formRecord: ConditionRecord | null = null;
  formTab: CondFormTab = 'basic';

  pendingDelete: ConditionRecord[] = [];
  saving = false;
  deleting = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.service.reload().subscribe({
      next: (list) => {
        if (!this.service.find(this.selectedCode)) this.selectedCode = list[0]?.code ?? null;
      },
      error: (err) => this.notify(`Could not load conditions: ${apiErrorMessage(err)}`)
    });
  }

  get stats() {
    const all = this.service.all();
    const active = all.filter((r) => r.status === 'Active').length;
    return {
      total: all.length,
      active,
      inactive: all.length - active,
      inUse: all.filter((r) => r.usage.assets > 0).length,
      defaults: all.filter((r) => r.isDefault).length
    };
  }

  get rows(): ConditionRecord[] {
    const rows = this.service.filter(this.applied);
    const key = this.sortKey;
    if (!key) return rows;
    return [...rows].sort((a, b) =>
      this.sortDir * (key === 'healthScore' ? a.healthScore - b.healthScore : a[key].localeCompare(b[key], undefined, { numeric: true }))
    );
  }

  get pageRows(): ConditionRecord[] {
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

  get selectedCondition(): ConditionRecord | undefined {
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

  openAdd(prefill: ConditionRecord | null = null): void {
    this.menuFor = null;
    this.formMode = 'add';
    this.formRecord = prefill;
    this.formTab = 'basic';
    this.formOpen = true;
    this.revealForm();
  }

  // A copy keeps the rules and characteristics; it is never the default and has no assets
  duplicate(c: ConditionRecord): void {
    const usage = { assets: 0, openWorkOrders: 0, slaBreaches: 0, underWarranty: 0 };
    this.openAdd({ ...structuredClone(c), code: '', name: `${c.name} (Copy)`, isDefault: false, status: 'Active', usage, documents: 0 });
  }

  openEdit(event: { condition: ConditionRecord; tab?: CondFormTab }): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = event.condition;
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

  onSaved(event: { record: ConditionRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.saveWithRules(event.record, event.originalCode).subscribe({
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


  makeDefault(c: ConditionRecord): void {
    this.menuFor = null;
    if (c.status !== 'Active') {
      this.notify(`Activate ${c.name} before making it the default.`);
      return;
    }
    this.service.persist({ ...c, isDefault: true }, c.code).subscribe({
      next: () => this.notify(`${c.name} is now the default condition.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // The default condition must stay active
  toggleStatus(c: ConditionRecord): void {
    this.menuFor = null;
    if (c.isDefault && c.status === 'Active') {
      this.notify(`${c.name} is the default. Make another condition the default first.`);
      return;
    }
    const status = c.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(c, status).subscribe({
      next: () => this.notify(`${c.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // The default condition and conditions still on assets can't be deleted
  askDelete(list: ConditionRecord[]): void {
    this.menuFor = null;
    const isDefault = list.find((c) => c.isDefault);
    if (isDefault) {
      this.notify(`${isDefault.name} is the default. Make another condition the default first.`);
      return;
    }
    const used = list.find((c) => c.usage.assets > 0);
    if (used) {
      this.notify(`${used.name} is set on ${used.usage.assets} assets. Mark it Inactive instead.`);
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
    this.service.deleteWithRules(codes).subscribe({
      complete: () => done(codes.length === 1 ? `${list[0].name} deleted.` : `${codes.length} conditions deleted.`),
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
