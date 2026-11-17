import { Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Factory,
  LucideAngularModule,
  MapPin,
  Plus,
  Search,
  Warehouse
} from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { apiErrorMessage, inParallel } from '../../shared/mdm-api';
import { BfzService } from '../building-floor-zone/bfz.service';
import { DepartmentService } from '../department/department.service';
import { SiteDetail } from './site-detail/site-detail';
import { SiteForm, SiteFormTab } from './site-form/site-form';
import { BusinessUnitService } from '../business-unit/business-unit.service';
import { SITE_TYPES, SiteFilters, SiteRecord } from './site.model';
import { SiteService } from './site.service';

type SortKey = 'name' | 'code';

const EMPTY_FILTERS: SiteFilters = { search: '', status: '', siteType: '', businessUnit: '' };
const COUNTRY_SHORT: Record<string, string> = {
  'United Arab Emirates': 'UAE',
  'Saudi Arabia': 'KSA',
  'United Kingdom': 'UK',
  'United States': 'USA'
};

/** Master Data Management > Organization > Site */
@Component({
  selector: 'app-mdm-organization-site',
  imports: [FormsModule, RouterLink, LucideAngularModule, SiteForm, SiteDetail],
  templateUrl: './site.html',
  styleUrls: ['../../shared/styles/mdm-page.css', './site.css', '../../shared/styles/mdm-purple-theme.css']
})
export class SitePage {
  readonly service = inject(SiteService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly siteTypes = SITE_TYPES;
  readonly businessUnits = inject(BusinessUnitService);
  readonly icons = { MapPin, Building2, Factory, Warehouse, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  readonly pageSizes = [10, 20, 50];

  @ViewChild('detailEl') detailEl?: ElementRef<HTMLElement>;
  @ViewChild('formEl', { read: ElementRef }) formEl?: ElementRef<HTMLElement>;

  draft: SiteFilters = { ...EMPTY_FILTERS };
  applied: SiteFilters = { ...EMPTY_FILTERS };

  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  selected = new Set<string>();
  menuFor: string | null = null;

  selectedId: string | null = null;
  formOpen = false;
  formMode: 'add' | 'edit' = 'add';
  formRecord: SiteRecord | null = null;
  formTab: SiteFormTab = 'basic';

  pendingDelete: SiteRecord[] = [];
  saving = false;
  deleting = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Business units and departments feed the pickers; buildings the counts and delete check
    const bfz = inject(BfzService);
    const departments = inject(DepartmentService);
    inParallel<unknown>([this.service.load(), departments.ensureLoaded(), bfz.ensureLoaded()]).subscribe({
      next: () => {
        if (!this.service.find(this.selectedId)) this.selectedId = this.service.all()[0]?.id ?? null;
      },
      error: (err) => this.notify(`Could not load sites: ${apiErrorMessage(err)}`)
    });
  }

  get stats() {
    return this.service.stats();
  }

  get rows(): SiteRecord[] {
    const rows = this.service.filter(this.applied);
    if (!this.sortKey) return rows;
    const key = this.sortKey;
    return [...rows].sort((a, b) => this.sortDir * a[key].localeCompare(b[key], undefined, { numeric: true }));
  }

  get pageRows(): SiteRecord[] {
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
    return this.pageRows.length > 0 && this.pageRows.every((r) => this.selected.has(r.id));
  }

  get selectedSite(): SiteRecord | undefined {
    return this.service.find(this.selectedId);
  }

  countryShort(country: string): string {
    return COUNTRY_SHORT[country] ?? country;
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

  toggleRow(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
  }

  togglePage(): void {
    const select = !this.allOnPageSelected;
    this.pageRows.forEach((r) => (select ? this.selected.add(r.id) : this.selected.delete(r.id)));
  }

  open(id: string, scroll = true): void {
    this.selectedId = id;
    this.menuFor = null;
    if (scroll) setTimeout(() => this.detailEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  toggleMenu(id: string): void {
    this.menuFor = this.menuFor === id ? null : id;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuFor = null;
  }

  openAdd(): void {
    this.menuFor = null;
    this.formMode = 'add';
    this.formRecord = null;
    this.formTab = 'basic';
    this.formOpen = true;
    this.revealForm();
  }

  openEdit(site: SiteRecord, tab: SiteFormTab = 'basic'): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = site;
    this.formTab = tab;
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

  onSaved(site: SiteRecord): void {
    if (this.saving) return;
    this.saving = true;
    const isNew = !site.id;
    this.service.persist(site).subscribe({
      next: (saved) => {
        this.saving = false;
        this.open(saved.id, false);
        this.notify(`${saved.name} ${isNew ? 'added' : 'updated'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(site: SiteRecord): void {
    this.menuFor = null;
    const status = site.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(site, status).subscribe({
      next: () => this.notify(`${site.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  onAddImage(event: { site: SiteRecord; image: string }): void {
    this.service.persist({ ...event.site, images: [...event.site.images, event.image] }).subscribe({
      next: () => this.notify('Image added.'),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // Sites that still have buildings can't be deleted
  askDelete(sites: SiteRecord[]): void {
    this.menuFor = null;
    const blocked = sites.find((s) => this.service.buildingsOf(s.id).length);
    if (blocked) {
      const count = this.service.buildingsOf(blocked.id).length;
      this.notify(`${blocked.name} has ${count} building${count === 1 ? '' : 's'}. Remove ${count === 1 ? 'it' : 'them'} on the Building / Floor / Zone page first.`);
      return;
    }
    this.pendingDelete = sites;
  }

  askDeleteSelected(): void {
    this.askDelete(this.service.all().filter((r) => this.selected.has(r.id)));
  }

  confirmDelete(): void {
    if (this.deleting) return;
    const list = this.pendingDelete;
    const ids = list.map((r) => r.id);
    const done = (message: string) => {
      const remaining = new Set(this.service.all().map((r) => r.id));
      ids.filter((id) => !remaining.has(id)).forEach((id) => this.selected.delete(id));
      if (this.selectedId && !remaining.has(this.selectedId)) this.selectedId = this.service.all()[0]?.id ?? null;
      if (this.formMode === 'edit' && this.formRecord && !remaining.has(this.formRecord.id)) this.closeForm();
      this.notify(message);
      this.pendingDelete = [];
      this.deleting = false;
      this.goTo(this.page);
    };
    this.deleting = true;
    this.service.delete(ids).subscribe({
      complete: () => done(ids.length === 1 ? `${list[0].name} deleted.` : `${ids.length} sites deleted.`),
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
