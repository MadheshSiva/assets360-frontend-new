import { Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, Boxes, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Network, Plus, Search, Users } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { apiErrorMessage, inParallel } from '../../shared/mdm-api';
import { MASTER_ICONS } from '../../shared/master-icons';
import { BusinessUnitService } from '../business-unit/business-unit.service';
import { SiteService } from '../site/site.service';
import { DeptDetail } from './dept-detail/dept-detail';
import { DeptForm } from './dept-form/dept-form';
import { blankDepartment } from './department.data';
import { DepartmentFilters, DepartmentRecord } from './department.model';
import { DepartmentService } from './department.service';

type SortKey = 'name' | 'code';

const EMPTY_FILTERS: DepartmentFilters = { search: '', businessUnitCode: '', status: '' };

/** Master Data Management > Organization > Department */
@Component({
  selector: 'app-mdm-organization-department',
  imports: [FormsModule, RouterLink, DecimalPipe, LucideAngularModule, DeptForm, DeptDetail],
  templateUrl: './department.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../shared/styles/mdm-purple-theme.css']
})
export class DepartmentPage {
  readonly service = inject(DepartmentService);
  readonly businessUnits = inject(BusinessUnitService);
  readonly sites = inject(SiteService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly logoIcons = MASTER_ICONS;
  readonly icons = { Network, Users, Boxes, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  readonly pageSizes = [10, 20, 50, 100];

  @ViewChild('detailEl') detailEl?: ElementRef<HTMLElement>;
  @ViewChild('formEl', { read: ElementRef }) formEl?: ElementRef<HTMLElement>;

  draft: DepartmentFilters = { ...EMPTY_FILTERS };
  applied: DepartmentFilters = { ...EMPTY_FILTERS };

  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  selected = new Set<string>();
  menuFor: string | null = null;

  selectedCode: string | null = null;
  formOpen = false;
  formMode: 'add' | 'edit' = 'add';
  formRecord: DepartmentRecord | null = null;

  pendingDelete: DepartmentRecord[] = [];
  saving = false;
  deleting = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Sites are needed for the site counts and the delete check
    inParallel<unknown>([this.service.load(), this.sites.ensureLoaded()]).subscribe({
      next: () => {
        if (!this.service.find(this.selectedCode)) this.selectedCode = this.service.all()[0]?.code ?? null;
      },
      error: (err) => this.notify(`Could not load departments: ${apiErrorMessage(err)}`)
    });
  }

  get stats() {
    const all = this.service.all();
    const active = all.filter((r) => r.status === 'Active').length;
    return {
      total: all.length,
      active,
      inactive: all.length - active,
      employees: all.reduce((sum, r) => sum + r.employees, 0),
      assets: all.reduce((sum, r) => sum + r.assets, 0)
    };
  }

  get rows(): DepartmentRecord[] {
    const rows = this.service.filter(this.applied, (code) => this.unitName(code));
    if (!this.sortKey) return rows;
    const key = this.sortKey;
    return [...rows].sort((a, b) => this.sortDir * a[key].localeCompare(b[key], undefined, { numeric: true }));
  }

  get pageRows(): DepartmentRecord[] {
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

  get selectedDepartment(): DepartmentRecord | undefined {
    return this.service.find(this.selectedCode);
  }

  unitName(code: string): string {
    return this.businessUnits.find(code)?.name ?? code;
  }

  siteCount(d: DepartmentRecord): number {
    return this.sites.all().filter((s) => s.department === d.name).length;
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

  openAdd(prefill: DepartmentRecord | null = null): void {
    this.menuFor = null;
    this.formMode = 'add';
    this.formRecord = prefill;
    this.formOpen = true;
    this.revealForm();
  }

  addSub(parent: DepartmentRecord): void {
    this.openAdd({ ...blankDepartment(), businessUnitCode: parent.businessUnitCode, parentCode: parent.code, currency: parent.currency, type: parent.type });
  }

  openEdit(d: DepartmentRecord): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = d;
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

  onSaved(event: { record: DepartmentRecord; originalCode: string | null; originalName: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        // Sites refer to the department by name
        if (event.originalName) this.sites.renameDepartment(event.originalName, saved.name);
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

  toggleStatus(d: DepartmentRecord): void {
    this.menuFor = null;
    const status = d.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(d, status).subscribe({
      next: () => this.notify(`${d.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // Departments still used by sites, or with sub-departments not being deleted too, can't be deleted
  askDelete(list: DepartmentRecord[]): void {
    this.menuFor = null;
    const blocked = list.find((d) => this.siteCount(d));
    if (blocked) {
      const count = this.siteCount(blocked);
      this.notify(`${blocked.name} is used by ${count} site${count === 1 ? '' : 's'}. Change ${count === 1 ? 'it' : 'them'} on the Site page first.`);
      return;
    }
    const codes = new Set(list.map((d) => d.code));
    const parent = list.find((d) => this.service.children(d.code).some((c) => !codes.has(c.code)));
    if (parent) {
      const count = this.service.children(parent.code).length;
      this.notify(`${parent.name} has ${count} sub-department${count === 1 ? '' : 's'}. Move or delete ${count === 1 ? 'it' : 'them'} first.`);
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
      const remaining = new Set(this.service.all().map((r) => r.code));
      codes.filter((c) => !remaining.has(c)).forEach((c) => this.selected.delete(c));
      if (this.selectedCode && !remaining.has(this.selectedCode)) this.selectedCode = this.service.all()[0]?.code ?? null;
      if (this.formMode === 'edit' && this.formRecord && !remaining.has(this.formRecord.code)) this.closeForm();
      this.notify(message);
      this.pendingDelete = [];
      this.deleting = false;
      this.goTo(this.page);
    };
    this.deleting = true;
    this.service.deleteNested(codes).subscribe({
      complete: () => done(codes.length === 1 ? `${list[0].name} deleted.` : `${codes.length} departments deleted.`),
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
