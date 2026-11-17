import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CURRENT_USER, todayIso } from '../shared/admin-common';
import { SAVED_ITEMS, TEMPLATES } from './checklist-templates.data';
import { CATEGORY_CODES, ChecklistItem, ChecklistTemplate, TemplateStatus, bumpVersion } from './checklist-templates.model';

/** An item from the organization's item bank with the section it was saved under. */
export interface SavedChecklistItem {
  section: string;
  item: ChecklistItem;
}

/*
 * DEMO MODE: templates, their versions and executions and the saved item bank all live in memory,
 * seeded from checklist-templates.data.ts. Changes last for the session.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistTemplatesService {
  private readonly store = signal<ChecklistTemplate[]>(structuredClone(TEMPLATES));
  readonly templates = this.store.asReadonly();
  private seq = TEMPLATES.length;
  private idSeq = 1000;
  private itemSeq = SAVED_ITEMS.length;
  private readonly savedStore = signal<SavedChecklistItem[]>(structuredClone(SAVED_ITEMS));
  /** Items in the saved item bank, ordered by section. */
  readonly savedItems = this.savedStore.asReadonly();

  /** The saved item bank. */
  loadItems(): Observable<SavedChecklistItem[]> {
    return of(this.savedStore());
  }

  /** True when the item is in the saved item bank. */
  isPersisted(id: string): boolean {
    return this.savedStore().some((s) => s.item.id === id);
  }

  get(id: string): ChecklistTemplate | undefined {
    return this.store().find((t) => t.id === id);
  }

  /** Unique id for new sections / items */
  newId(prefix: string): string {
    this.idSeq += 1;
    return `${prefix}-${this.idSeq}`;
  }

  /** Adds the item to the saved item bank with a new ITM-nnnn id. */
  createItem(item: ChecklistItem, sectionTitle: string): Observable<ChecklistItem> {
    this.itemSeq += 1;
    const saved = { section: sectionTitle.trim() || 'General', item: { ...item, text: item.text.trim(), id: `ITM-${String(this.itemSeq).padStart(4, '0')}` } };
    this.savedStore.update((list) => [...list, saved]);
    return of(saved.item);
  }

  /** Updates an item in the saved item bank. */
  updateItem(item: ChecklistItem, sectionTitle: string): Observable<ChecklistItem> {
    const saved = { section: sectionTitle.trim() || 'General', item: { ...item, text: item.text.trim() } };
    this.savedStore.update((list) => list.map((s) => (s.item.id === saved.item.id ? saved : s)));
    return of(saved.item);
  }

  /** Removes an item from the saved item bank. */
  deleteItem(id: string): Observable<void> {
    this.savedStore.update((list) => list.filter((s) => s.item.id !== id));
    return of(undefined);
  }

  codeTaken(code: string, exceptId: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.store().some((t) => t.id !== exceptId && t.code.toUpperCase() === c);
  }

  /** Next free CHK-<CAT>-nnn code for a category */
  nextCode(category: string): string {
    const prefix = `CHK-${CATEGORY_CODES[category] ?? 'GEN'}-`;
    let n = 1;
    while (this.codeTaken(prefix + String(n).padStart(3, '0'), null)) n++;
    return prefix + String(n).padStart(3, '0');
  }

  /**
   * Insert or update. Saving a draft marks the template Draft; publishing makes it Active and
   * bumps the version. Both add a version-history row.
   */
  save(draft: ChecklistTemplate, mode: 'draft' | 'publish' | 'settings'): ChecklistTemplate {
    const copy = structuredClone(draft);
    copy.name = copy.name.trim();
    copy.code = copy.code.trim().toUpperCase();
    copy.updated = todayIso();
    const isNew = !copy.id;
    if (isNew) {
      this.seq += 1;
      copy.id = `CHT-${String(this.seq).padStart(3, '0')}`;
    }
    if (mode === 'publish') {
      if (!isNew) copy.version = bumpVersion(copy.version);
      copy.status = 'Active';
    } else if (mode === 'draft') {
      copy.status = 'Draft';
    }
    if (mode !== 'settings' || isNew) {
      // Older published versions are superseded
      const retired: TemplateStatus = 'Inactive';
      const note = mode === 'publish' ? 'Published' : isNew ? 'Created template' : 'Draft saved';
      const history = copy.versions.filter((v) => v.version !== copy.version).map((v) => (v.status === 'Active' ? { ...v, status: retired } : v));
      copy.versions = [{ version: copy.version, date: copy.updated, user: CURRENT_USER.name, status: copy.status, note }, ...history];
    }
    this.store.update((list) => (isNew ? [copy, ...list] : list.map((t) => (t.id === copy.id ? copy : t))));
    return copy;
  }

  setStatus(id: string, status: TemplateStatus): void {
    this.store.update((list) => list.map((t) => (t.id === id ? { ...t, status, updated: todayIso() } : t)));
  }

  remove(id: string): void {
    this.store.update((list) => list.filter((t) => t.id !== id));
  }

  /** Copy as a new draft with a fresh code; not stored until saved */
  cloneOf(source: ChecklistTemplate, name = `${source.name} (Copy)`): ChecklistTemplate {
    const copy = structuredClone(source);
    copy.id = '';
    copy.name = name;
    copy.code = this.nextCode(source.category);
    copy.version = 'v1.0';
    copy.status = 'Draft';
    copy.owner = CURRENT_USER.name;
    copy.uses = 0;
    copy.executions = [];
    copy.versions = [];
    copy.sections.forEach((s) => {
      s.id = this.newId('S');
      s.items.forEach((i) => (i.id = this.newId('I')));
    });
    return copy;
  }
}
