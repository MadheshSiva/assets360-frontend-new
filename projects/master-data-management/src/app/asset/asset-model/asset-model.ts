import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, Box, ChevronLeft, ChevronRight, Ellipsis, Factory, Layers, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { apiErrorMessage } from '../../shared/mdm-api';
import { AssetTypeService } from '../asset-type/asset-type.service';
import { MODEL_ICONS } from './asset-model.icons';
import { AssetModelFilters, AssetModelRecord } from './asset-model.model';
import { AssetModelService } from './asset-model.service';
import { ModelDetail } from './model-detail/model-detail';
import { ModelForm, ModelFormTab } from './model-form/model-form';

type SortKey = 'name' | 'code' | 'manufacturer' | 'lifecycleYears';

const EMPTY_FILTERS: AssetModelFilters = { search: '', manufacturer: '', assetType: '', status: '' };

/** Master Data Management > Asset > Asset Model */
@Component({
  selector: 'app-mdm-asset-asset-model',
  imports: [FormsModule, RouterLink, LucideAngularModule, ModelForm, ModelDetail],
  templateUrl: './asset-model.html',
  styleUrls: ['../../shared/styles/mdm-page.css', './asset-model.css', '../../shared/styles/mdm-purple-theme.css']
})
export class AssetModelPage implements OnInit {
  readonly service = inject(AssetModelService);
  readonly types = inject(AssetTypeService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly modelIcons = MODEL_ICONS;
  readonly icons = { Box, Factory, Layers, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  readonly pageSizes = [10, 20, 50, 100];
  private readonly route = inject(ActivatedRoute);

  @ViewChild('detailEl') detailEl?: ElementRef<HTMLElement>;
  @ViewChild('formEl', { read: ElementRef }) formEl?: ElementRef<HTMLElement>;

  draft: AssetModelFilters = { ...EMPTY_FILTERS };
  applied: AssetModelFilters = { ...EMPTY_FILTERS };

  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  selected = new Set<string>();
  menuFor: string | null = null;

  selectedCode: string | null = null;
  formOpen = false;
  formMode: 'add' | 'edit' = 'add';
  formRecord: AssetModelRecord | null = null;
  formTab: ModelFormTab = 'basic';

  pendingDelete: AssetModelRecord[] = [];
  saving = false;
  deleting = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // "View Models" on the Manufacturer page links here with ?manufacturer=Dell
    const manufacturer = this.route.snapshot.queryParamMap.get('manufacturer');
    if (manufacturer) {
      this.draft.manufacturer = manufacturer;
      this.apply();
    }
  }

  ngOnInit(): void {
    this.service.reload().subscribe({
      next: (list) => {
        // With the ?manufacturer= filter, open its first model
        if (!this.service.find(this.selectedCode)) this.selectedCode = this.rows[0]?.code ?? list[0]?.code ?? null;
      },
      error: (err) => this.notify(`Could not load asset models: ${apiErrorMessage(err)}`)
    });
  }

  get stats() {
    const all = this.service.all();
    const active = all.filter((r) => r.status === 'Active').length;
    return {
      total: all.length,
      active,
      inactive: all.length - active,
      manufacturers: this.service.manufacturers().length,
      types: this.service.usedTypes().length
    };
  }

  get rows(): AssetModelRecord[] {
    const rows = this.service.filter(this.applied);
    const key = this.sortKey;
    if (!key) return rows;
    return [...rows].sort((a, b) =>
      this.sortDir * (key === 'lifecycleYears' ? a.lifecycleYears - b.lifecycleYears : a[key].localeCompare(b[key], undefined, { numeric: true }))
    );
  }

  get pageRows(): AssetModelRecord[] {
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

  get selectedModel(): AssetModelRecord | undefined {
    return this.service.find(this.selectedCode);
  }

  iconFor(r: AssetModelRecord) {
    return this.modelIcons[this.types.iconFor(r.assetType)];
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

  openAdd(prefill: AssetModelRecord | null = null): void {
    this.menuFor = null;
    this.formMode = 'add';
    this.formRecord = prefill;
    this.formTab = 'basic';
    this.formOpen = true;
    this.revealForm();
  }

  // A copy keeps the specifications and defaults; the code must be new and it starts with no assets
  duplicate(m: AssetModelRecord): void {
    this.openAdd({ ...structuredClone(m), code: '', name: `${m.name} (Copy)`, assetCount: 0, status: 'Active' });
  }

  openEdit(event: { model: AssetModelRecord; tab?: ModelFormTab }): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = event.model;
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

  onSaved(event: { record: AssetModelRecord; originalCode: string | null }): void {
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


  toggleStatus(m: AssetModelRecord): void {
    this.menuFor = null;
    const status = m.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(m, status).subscribe({
      next: () => this.notify(`${m.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // Models with registered assets can't be deleted; they can be marked inactive instead
  askDelete(list: AssetModelRecord[]): void {
    this.menuFor = null;
    const blocked = list.find((m) => m.assetCount > 0);
    if (blocked) {
      const count = blocked.assetCount;
      this.notify(`${blocked.name} has ${count} asset${count === 1 ? '' : 's'}. Mark it Inactive instead.`);
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
    this.service.delete(codes).subscribe({
      complete: () => done(codes.length === 1 ? `${list[0].name} deleted.` : `${codes.length} models deleted.`),
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
