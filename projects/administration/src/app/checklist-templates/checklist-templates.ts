import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { RouterLink } from '@angular/router';
import {
  BookOpen, Building2, ChartNoAxesColumnIncreasing, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck,
  ClipboardList, Download, EllipsisVertical, Eye, FileText, Flame, Droplets, HardHat, ListChecks, LucideAngularModule, Plus, Save, Search,
  Send, Server, Settings, ShieldCheck, Truck, Upload, X, Zap
} from 'lucide-angular';
import { ADMIN_LOCATIONS, ADMIN_PEOPLE, AdminPage, CURRENT_USER, formatDate, todayIso } from '../shared/admin-common';
import { ChecklistPreview } from './checklist-preview/checklist-preview';
import { ChecklistSections, DeleteRequest, ItemRef } from './checklist-sections/checklist-sections';
import { LIBRARY, LibraryEntry, categoryAssets, categoryTeam, librarySections } from './checklist-templates.data';
import {
  ASSET_TYPES, CATEGORIES, ChecklistItem, ChecklistSection, ChecklistTemplate, FREQUENCIES, STATUSES, TEAMS, TemplateIcon, TemplateStatus,
  blankItem, itemCount, itemErrors, maxScore, statusTone, templateErrors
} from './checklist-templates.model';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ItemDrawer, ItemSave } from './item-drawer/item-drawer';

type Tab = 'items' | 'settings' | 'history';

interface DrawerState {
  sectionId: string;
  item: ChecklistItem;
  isNew: boolean;
}

/** Persisted items grouped by their section name, offered in the Template Library. */
interface SavedSection {
  title: string;
  items: ChecklistItem[];
}

interface ConfirmState {
  title: string;
  message: string;
  action: 'template' | 'item' | 'section';
  ref?: DeleteRequest;
}

const PAGE_SIZE = 10;

/** Administration > Checklist Templates: template list, section/item builder and item settings drawer. */
@Component({
  standalone: true,
  selector: 'app-admin-checklist-templates',
  imports: [FormsModule, RouterLink, LucideAngularModule, ChecklistSections, ItemDrawer, ChecklistPreview],
  templateUrl: './checklist-templates.html',
  styleUrls: ['../shared/admin-workspace.css', './checklist-templates.css']
})
export class ChecklistTemplatesPage extends AdminPage {
  private readonly service = inject(ChecklistTemplatesService);
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;
  @ViewChild(ChecklistSections) sectionsView?: ChecklistSections;

  readonly icons = {
    BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, Download,
    EllipsisVertical, Eye, FileText, ListChecks, Plus, Save, Search, Send, Settings, Upload, X
  };
  private readonly templateIcons: Record<TemplateIcon, typeof FileText> = {
    file: FileText, flame: Flame, settings: Settings, hardhat: HardHat, shield: ShieldCheck, clipboard: ClipboardList, truck: Truck,
    server: Server, building: Building2, zap: Zap, droplets: Droplets
  };
  readonly categories = CATEGORIES;
  readonly statuses = STATUSES;
  readonly frequencies = FREQUENCIES;
  readonly assetTypes = ASSET_TYPES;
  readonly locations = ADMIN_LOCATIONS;
  readonly teams = TEAMS;
  readonly library = LIBRARY;
  readonly formatDate = formatDate;

  search = '';
  listSearch = '';
  categoryFilter = '';
  statusFilter = '';
  page = 1;
  listCollapsed = false;

  selectedId: string | null = null;
  /** Working copy; the builder, settings and drawer edit it and Save Draft / Publish store it */
  draft!: ChecklistTemplate;
  isNew = false;
  dirty = false;
  showErrors = false;
  tab: Tab = 'items';
  drawer: DrawerState | null = null;

  headMenu = false;
  bulkOpen = false;
  scoringOpen = false;
  previewOpen = false;
  libraryOpen = false;
  confirm: ConfirmState | null = null;
  savingItem = false;

  constructor() {
    super();
    const first = this.service.templates()[0];
    if (first) {
      this.selectedId = first.id;
      this.draft = structuredClone(first);
    } else {
      // No templates yet: start on a blank, unsaved draft
      this.createTemplate();
      this.dirty = false;
      this.toast = null;
    }
    this.service.loadItems().subscribe({ error: (err: Error) => this.notify(`Saved checklist items could not be loaded. ${err.message}`) });
  }

  // ===== Stats =====
  get all(): ChecklistTemplate[] {
    return this.service.templates();
  }

  count(status: TemplateStatus): number {
    return this.all.filter((t) => t.status === status).length;
  }

  get totalUses(): number {
    return this.all.reduce((sum, t) => sum + t.uses, 0);
  }

  // ===== List =====
  get filtered(): ChecklistTemplate[] {
    const terms = (this.search + ' ' + this.listSearch).trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.all.filter((t) => {
      if (this.categoryFilter && t.category !== this.categoryFilter) return false;
      if (this.statusFilter && t.status !== this.statusFilter) return false;
      const hay = `${t.name} ${t.code} ${t.category} ${t.owner}`.toLowerCase();
      return terms.every((q) => hay.includes(q));
    });
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i + 1);
  }

  get paged(): ChecklistTemplate[] {
    const page = Math.min(this.page, this.pageCount);
    return this.filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  goTo(page: number): void {
    this.page = Math.min(Math.max(page, 1), this.pageCount);
  }

  onFilter(): void {
    this.page = 1;
  }

  get hasFilters(): boolean {
    return !!(this.search || this.listSearch || this.categoryFilter || this.statusFilter);
  }

  clearFilters(): void {
    this.search = '';
    this.listSearch = '';
    this.categoryFilter = '';
    this.statusFilter = '';
    this.page = 1;
  }

  iconFor(t: ChecklistTemplate) {
    return this.templateIcons[t.icon];
  }

  templateIcon(icon: TemplateIcon) {
    return this.templateIcons[icon];
  }

  tone(status: TemplateStatus): string {
    return statusTone(status);
  }

  items(t: ChecklistTemplate): number {
    return itemCount(t);
  }

  select(t: ChecklistTemplate): void {
    this.selectedId = t.id;
    this.draft = structuredClone(t);
    this.isNew = false;
    this.dirty = false;
    this.showErrors = false;
    this.drawer = null;
    this.closeMenus();
  }

  // ===== Header =====
  get owners(): string[] {
    const set = new Set(ADMIN_PEOPLE);
    this.all.forEach((t) => set.add(t.owner));
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  get draftMaxScore(): number {
    return maxScore(this.draft);
  }

  get draftItems(): number {
    return itemCount(this.draft);
  }

  markDirty(): void {
    this.dirty = true;
  }

  closeMenus(): void {
    this.headMenu = false;
    this.bulkOpen = false;
    this.scoringOpen = false;
  }

  get errors(): Record<string, string> {
    return templateErrors(this.draft, this.service.codeTaken(this.draft.code, this.isNew ? null : this.draft.id));
  }

  err(field: string): string | null {
    return this.showErrors ? (this.errors[field] ?? null) : null;
  }

  /** Validates and stores the draft. 'draft' → Draft status, 'publish' → Active + new version, 'settings' → status unchanged. */
  commit(mode: 'draft' | 'publish' | 'settings'): void {
    this.closeMenus();
    this.showErrors = true;
    const errs = Object.values(this.errors);
    if (errs.length) {
      this.tab = 'settings';
      this.notify(errs[0]);
      return;
    }
    if (mode === 'publish') {
      if (!this.draftItems) {
        this.notify('Add at least one checklist item before publishing.');
        return;
      }
      for (const s of this.draft.sections) {
        const bad = s.items.find((i) => Object.keys(itemErrors(i)).length);
        if (bad) {
          this.tab = 'items';
          this.drawer = { sectionId: s.id, item: bad, isNew: false };
          this.notify(`Fix "${bad.text || 'untitled item'}" before publishing.`);
          return;
        }
      }
    }
    const wasNew = this.isNew;
    const saved = this.service.save(this.draft, mode);
    const openItemId = this.drawer && !this.drawer.isNew ? this.drawer.item.id : null;
    this.selectedId = saved.id;
    this.draft = structuredClone(saved);
    this.isNew = false;
    this.dirty = false;
    this.showErrors = false;
    this.drawer = openItemId ? this.findDrawer(openItemId) : null;
    if (mode === 'publish') this.notify(`${saved.name} published as ${saved.version}.`);
    else if (mode === 'draft') this.notify(wasNew ? `${saved.name} created as a draft.` : `${saved.name} saved as draft.`);
    else this.notify(`Settings saved for ${saved.name}.`);
  }

  private findDrawer(itemId: string): DrawerState | null {
    for (const s of this.draft.sections) {
      const item = s.items.find((i) => i.id === itemId);
      if (item) return { sectionId: s.id, item, isNew: false };
    }
    return null;
  }

  discard(): void {
    const saved = this.selectedId ? this.service.get(this.selectedId) : null;
    const fallback = saved ?? this.all[0];
    if (fallback) this.select(fallback);
    this.notify('Changes discarded.');
  }

  createTemplate(): void {
    this.closeMenus();
    this.selectedId = null;
    this.isNew = true;
    this.dirty = true;
    this.showErrors = false;
    this.drawer = null;
    this.tab = 'settings';
    this.draft = {
      id: '',
      name: '',
      code: this.service.nextCode(''),
      version: 'v1.0',
      category: '',
      owner: '',
      updated: todayIso(),
      status: 'Draft',
      icon: 'file',
      tone: 'purple',
      description: '',
      frequency: '',
      assetTypes: [],
      locations: [],
      teams: [],
      requireApproval: false,
      passThreshold: 80,
      scoringMethod: 'Weighted',
      failOnCritical: true,
      sections: [{ id: this.service.newId('S'), title: 'General', items: [] }],
      uses: 0,
      versions: [],
      executions: []
    };
    this.notify('Name the template, then add sections and items.');
  }

  /** Keeps the code prefix in line with the category for unsaved templates */
  onCategoryChange(): void {
    this.markDirty();
    if (this.isNew) this.draft.code = this.service.nextCode(this.draft.category);
  }

  duplicateTemplate(): void {
    this.closeMenus();
    const source = this.selectedId ? this.service.get(this.selectedId) : null;
    if (!source) return;
    this.selectedId = null;
    this.draft = this.service.cloneOf(source);
    this.isNew = true;
    this.dirty = true;
    this.drawer = null;
    this.notify(`Duplicated ${source.name}. Save Draft to keep it.`);
  }

  setStatus(status: TemplateStatus): void {
    this.closeMenus();
    if (this.isNew || !this.selectedId) return;
    this.service.setStatus(this.selectedId, status);
    this.draft.status = status;
    this.notify(`${this.draft.name} is now ${status}.`);
  }

  askDeleteTemplate(): void {
    this.closeMenus();
    if (this.isNew) {
      this.discard();
      return;
    }
    this.confirm = {
      title: 'Delete template?',
      message: `${this.draft.name} (${this.draft.code}) will be removed. Completed checklists keep their results.`,
      action: 'template'
    };
  }

  // ===== Template library =====
  useLibrary(entry: LibraryEntry, index: number): void {
    this.libraryOpen = false;
    this.createTemplate();
    this.tab = 'items';
    Object.assign(this.draft, {
      name: entry.name,
      category: entry.category,
      code: this.service.nextCode(entry.category),
      icon: entry.icon,
      tone: entry.tone,
      description: entry.description,
      frequency: entry.frequency,
      assetTypes: categoryAssets(entry.category),
      teams: [categoryTeam(entry.category)],
      sections: librarySections(this.service.newId('LIB'), entry, index)
    });
    this.notify(`${entry.name} added from the library as a draft. Save Draft to keep it.`);
  }

  /** Server-backed items grouped by section, in the order the API returns them. */
  get savedSections(): SavedSection[] {
    const groups = new Map<string, SavedSection>();
    for (const { section, item } of this.service.savedItems()) {
      const key = section.toLowerCase();
      if (!groups.has(key)) groups.set(key, { title: section, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()];
  }

  /** Adds a saved section's items to the current draft, merging into a section with the same title. */
  useSavedSection(saved: SavedSection): void {
    this.libraryOpen = false;
    this.tab = 'items';
    const present = new Set(this.draft.sections.flatMap((s) => s.items.map((i) => i.id)));
    const items = saved.items.filter((i) => !present.has(i.id)).map((i) => ({ ...i }));
    if (!items.length) {
      this.notify(`All items from ${saved.title} are already in this template.`);
      return;
    }
    let section = this.draft.sections.find((s) => s.title.trim().toLowerCase() === saved.title.toLowerCase());
    if (section) section.items.push(...items);
    else {
      section = { id: this.service.newId('S'), title: saved.title, items };
      this.draft.sections.push(section);
    }
    this.markDirty();
    this.sectionsView?.expand(section.id);
    this.notify(`${items.length} saved ${items.length === 1 ? 'item' : 'items'} added to ${section.title}. Save Draft or Publish to keep them in this template.`);
  }

  // ===== Items & sections =====
  openItem(ref: ItemRef): void {
    const section = this.draft.sections.find((s) => s.id === ref.sectionId);
    const item = section?.items.find((i) => i.id === ref.itemId);
    if (section && item) this.drawer = { sectionId: section.id, item, isNew: false };
  }

  addSection(): void {
    const section: ChecklistSection = { id: this.service.newId('S'), title: 'New Section', items: [] };
    this.draft.sections.push(section);
    this.markDirty();
    this.sectionsView?.startRename(section);
  }

  addItem(sectionId?: string): void {
    if (!this.draft.sections.length) this.addSection();
    const target = sectionId ?? this.drawer?.sectionId ?? this.draft.sections[this.draft.sections.length - 1].id;
    this.drawer = { sectionId: target, item: blankItem(this.service.newId('I')), isNew: true };
    this.sectionsView?.expand(target);
  }

  /**
   * New items are created through the API; edits to server-backed items go through PUT. Items seeded
   * with the demo templates have no server itemId, so their edits stay in the draft.
   */
  onItemSave(e: ItemSave): void {
    const target = this.draft.sections.find((s) => s.id === e.sectionId);
    if (!target) return;
    const isNew = !!this.drawer?.isNew;
    if (!isNew && !this.service.isPersisted(e.item.id)) {
      this.storeItem(e, false);
      return;
    }
    if (this.savingItem) return;
    this.savingItem = true;
    const request = isNew ? this.service.createItem(e.item, target.title) : this.service.updateItem(e.item, target.title);
    request.subscribe({
      next: (saved) => {
        this.savingItem = false;
        this.storeItem({ ...e, item: saved }, isNew);
      },
      error: (err: Error) => {
        this.savingItem = false;
        this.notify(`${isNew ? 'Item not added' : 'Item not updated'}. ${err.message}`);
      }
    });
  }

  private storeItem(e: ItemSave, wasNew: boolean): void {
    const target = this.draft.sections.find((s) => s.id === e.sectionId);
    if (!target) return;
    const from = this.draft.sections.find((s) => s.items.some((i) => i.id === e.item.id));
    if (from && from.id === target.id) {
      const idx = from.items.findIndex((i) => i.id === e.item.id);
      from.items[idx] = e.item;
    } else {
      if (from) from.items = from.items.filter((i) => i.id !== e.item.id);
      target.items.push(e.item);
    }
    this.drawer = { sectionId: target.id, item: e.item, isNew: false };
    this.markDirty();
    this.notify(wasNew ? 'Item created. Save Draft or Publish to keep it in this template.' : 'Item updated. Save Draft or Publish to keep it.');
  }

  duplicateItem(ref: ItemRef): void {
    const section = this.draft.sections.find((s) => s.id === ref.sectionId);
    if (!section) return;
    const idx = section.items.findIndex((i) => i.id === ref.itemId);
    if (idx < 0) return;
    const copy: ChecklistItem = { ...section.items[idx], id: this.service.newId('I'), text: `${section.items[idx].text} (copy)` };
    section.items.splice(idx + 1, 0, copy);
    this.markDirty();
    this.notify('Item duplicated.');
  }

  askDelete(ref: DeleteRequest): void {
    const section = this.draft.sections.find((s) => s.id === ref.sectionId);
    if (!section) return;
    if (ref.kind === 'section') {
      const saved = section.items.filter((i) => this.service.isPersisted(i.id)).length;
      this.confirm = {
        title: 'Delete section?',
        message:
          `"${section.title}" and its ${section.items.length} items will be removed from this template.` +
          (saved ? ` ${saved} saved ${saved === 1 ? 'item is' : 'items are'} deleted permanently.` : ''),
        action: 'section',
        ref
      };
    } else {
      const item = section.items.find((i) => i.id === ref.itemId);
      this.confirm = { title: 'Delete item?', message: `"${item?.text ?? ''}" will be removed from ${section.title}.`, action: 'item', ref };
    }
  }

  confirmAction(): void {
    const c = this.confirm;
    this.confirm = null;
    if (!c) return;
    if (c.action === 'template') {
      const name = this.draft.name;
      this.service.remove(this.draft.id);
      const next = this.all[0];
      if (next) this.select(next);
      this.goTo(this.page);
      this.notify(`${name} deleted.`);
      return;
    }
    const ref = c.ref;
    if (!ref) return;
    const section = this.draft.sections.find((s) => s.id === ref.sectionId);
    if (!section) return;
    // Server-backed items are deleted through the API first; the draft only changes once that succeeds.
    const ids = c.action === 'section' ? section.items.map((i) => i.id) : [ref.itemId ?? ''];
    this.deleteSaved(ids).subscribe({
      next: () => {
        if (c.action === 'section') {
          this.draft.sections = this.draft.sections.filter((s) => s.id !== ref.sectionId);
          if (this.drawer?.sectionId === ref.sectionId) this.drawer = null;
          this.notify('Section deleted.');
        } else {
          section.items = section.items.filter((i) => i.id !== ref.itemId);
          if (this.drawer?.item.id === ref.itemId) this.drawer = null;
          this.notify('Item deleted.');
        }
        this.markDirty();
      },
      error: (err: Error) => this.notify(`${c.action === 'section' ? 'Section' : 'Item'} not deleted. ${err.message}`)
    });
  }

  /** DELETE every server-backed id in the list; completes immediately when none are. */
  private deleteSaved(ids: string[]): Observable<unknown> {
    const saved = ids.filter((id) => this.service.isPersisted(id));
    return saved.length ? forkJoin(saved.map((id) => this.service.deleteItem(id))) : of(null);
  }

  // ===== Bulk actions / scoring =====
  bulk(action: 'required' | 'optional' | 'clearCritical' | 'score10' | 'collapse' | 'expand'): void {
    this.bulkOpen = false;
    if (action === 'collapse') {
      this.sectionsView?.collapseAll();
      return;
    }
    if (action === 'expand') {
      this.sectionsView?.expandAll();
      return;
    }
    const change: Partial<ChecklistItem> =
      action === 'required' ? { required: true } : action === 'optional' ? { required: false } : action === 'clearCritical' ? { critical: false } : { score: 10 };
    const all = this.draft.sections.flatMap((s) => s.items);
    // Server-backed items are updated through PUT; the rest only change in the draft.
    const updates = this.draft.sections.flatMap((s) =>
      s.items.filter((i) => this.service.isPersisted(i.id)).map((i) => this.service.updateItem({ ...i, ...change }, s.title))
    );
    const done: Observable<unknown> = updates.length ? forkJoin(updates) : of(null);
    done.subscribe({
      next: () => {
        all.forEach((i) => Object.assign(i, change));
        this.markDirty();
        this.notify(`Applied to ${all.length} items.`);
      },
      error: (err: Error) => this.notify(`Bulk change not applied. ${err.message}`)
    });
  }

  toggleBulk(): void {
    this.bulkOpen = !this.bulkOpen;
    this.scoringOpen = false;
  }

  toggleScoring(): void {
    this.scoringOpen = !this.scoringOpen;
    this.bulkOpen = false;
  }

  toggleHeadMenu(): void {
    this.headMenu = !this.headMenu;
  }

  // ===== Settings tab =====
  hasValue(list: string[], value: string): boolean {
    return list.includes(value);
  }

  toggleValue(list: string[], value: string): void {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
    else list.push(value);
    this.markDirty();
  }

  // ===== Usage =====
  get passRate(): number {
    const ex = this.draft.executions;
    return ex.length ? Math.round((ex.filter((e) => e.result === 'Passed').length / ex.length) * 100) : 0;
  }

  // ===== Import / export (JSON keeps sections and items intact) =====
  exportJson(only?: ChecklistTemplate): void {
    this.closeMenus();
    const data = only ? [only] : this.filtered;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = only ? `${only.code}.json` : `checklist-templates-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`Exported ${data.length} ${data.length === 1 ? 'template' : 'templates'}.`);
  }

  openImport(): void {
    this.importInput?.nativeElement.click();
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let rows: unknown;
      try {
        rows = JSON.parse(text);
      } catch {
        this.notify('That file is not valid JSON. Use a file from Export.');
        return;
      }
      const list = (Array.isArray(rows) ? rows : [rows]) as Partial<ChecklistTemplate>[];
      let added = 0;
      for (const row of list) {
        if (!row || typeof row.name !== 'string' || !Array.isArray(row.sections) || !row.category || !CATEGORIES.includes(row.category)) continue;
        const source: ChecklistTemplate = {
          ...(row as ChecklistTemplate),
          icon: row.icon ?? 'file',
          tone: row.tone ?? 'purple',
          assetTypes: row.assetTypes ?? [],
          locations: row.locations ?? [],
          teams: row.teams ?? [],
          passThreshold: row.passThreshold ?? 80,
          versions: [],
          executions: []
        };
        const copy = this.service.cloneOf(source, row.name);
        this.service.save(copy, 'draft');
        added++;
      }
      this.notify(added ? `Imported ${added} ${added === 1 ? 'template' : 'templates'} as drafts.` : 'No valid templates found in that file.');
    });
  }
}
