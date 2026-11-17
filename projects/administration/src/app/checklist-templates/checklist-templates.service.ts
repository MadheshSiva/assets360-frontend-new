import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { CURRENT_USER, todayIso } from '../shared/admin-common';
import { CATEGORY_CODES, ChecklistItem, ChecklistTemplate, ResponseType, TemplateStatus, bumpVersion } from './checklist-templates.model';

/** Body of POST /api/administration/checklist-items */
interface CreateChecklistItemRequest {
  itemText: string;
  section: string;
  responseType: ResponseType;
  isRequired: boolean;
  isCritical: boolean;
  helpText: string | null;
  expectedValue: string | null;
  attachmentRequired: boolean;
  scoreValue: number;
  failureAction: string | null;
  escalateIssue: boolean;
  createdBy: string | null;
  tenantId: string;
  clientId: string;
}

/** Item fields shared by create and update; tenant, client and creator are immutable. */
type ChecklistItemBody = Omit<CreateChecklistItemRequest, 'createdBy' | 'tenantId' | 'clientId'>;

/** Body of PUT /api/administration/checklist-items/{itemId} */
type UpdateChecklistItemRequest = ChecklistItemBody & { updatedBy: string | null };

/** A persisted item with the section it was saved under (the API has no template, only a section name). */
export interface SavedChecklistItem {
  section: string;
  item: ChecklistItem;
}

/** Raw shape returned by the checklist-items API. */
interface ChecklistItemDto {
  itemId: string;
  itemText: string;
  section: string;
  responseType: string;
  isRequired: boolean;
  isCritical: boolean;
  helpText: string | null;
  expectedValue: string | null;
  attachmentRequired: boolean;
  scoreValue: number;
  failureAction: string | null;
  escalateIssue: boolean;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
}

function toAppItem(dto: ChecklistItemDto): ChecklistItem {
  return {
    id: dto.itemId,
    text: dto.itemText,
    responseType: dto.responseType as ResponseType,
    required: dto.isRequired,
    critical: dto.isCritical,
    score: dto.scoreValue,
    helpText: dto.helpText ?? '',
    expected: dto.expectedValue ?? '',
    attachmentRequired: dto.attachmentRequired,
    failureAction: dto.failureAction ?? 'None',
    escalate: dto.escalateIssue
  };
}

function itemBody(item: ChecklistItem, sectionTitle: string): ChecklistItemBody {
  return {
    itemText: item.text.trim(),
    section: sectionTitle.trim() || 'General',
    responseType: item.responseType,
    isRequired: item.required,
    isCritical: item.critical,
    helpText: item.helpText.trim() || null,
    expectedValue: item.expected.trim() || null,
    attachmentRequired: item.attachmentRequired,
    scoreValue: item.score,
    failureAction: item.failureAction && item.failureAction !== 'None' ? item.failureAction : null,
    escalateIssue: item.escalate
  };
}

function toSaved(dto: ChecklistItemDto): SavedChecklistItem {
  return { section: dto.section, item: toAppItem(dto) };
}

function errorMessage(err: HttpErrorResponse): string {
  const errors = err.error?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  return first || err.error?.message || err.error?.title || 'The checklist service could not be reached.';
}

/*
 * Checklist items are persisted through the Administration API (list, create, update, delete).
 * The API has no template concept, only standalone items tagged with a section name, so
 * DEMO MODE: templates, their section layout, versions and executions still live in memory.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly itemsUrl = `${environment.administrationApiUrl}api/administration/checklist-items`;
  private readonly store = signal<ChecklistTemplate[]>([]); // templates come from the checklist API once wired
  readonly templates = this.store.asReadonly();
  private seq = 0;
  private idSeq = 1000;
  private readonly savedStore = signal<SavedChecklistItem[]>([]);
  /** Items persisted on the server, ordered by section. */
  readonly savedItems = this.savedStore.asReadonly();

  /** GET /api/administration/checklist-items for the current tenant and client. */
  loadItems(): Observable<SavedChecklistItem[]> {
    const params = { tenantId: environment.tenantId, clientId: environment.clientId };
    return this.http.get<ChecklistItemDto[]>(this.itemsUrl, { params }).pipe(
      map((rows) => rows.map(toSaved)),
      tap((rows) => this.savedStore.set(rows)),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  /** True when the item has a server itemId, so edits and deletes go through the API. */
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

  /** POST /api/administration/checklist-items; the returned item carries the server's itemId. */
  createItem(item: ChecklistItem, sectionTitle: string): Observable<ChecklistItem> {
    const request: CreateChecklistItemRequest = {
      ...itemBody(item, sectionTitle),
      createdBy: this.auth.getUserEmail(),
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<ChecklistItemDto>(this.itemsUrl, request).pipe(
      map(toSaved),
      tap((saved) => this.savedStore.update((list) => [...list, saved])),
      map((saved) => saved.item),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  /** PUT /api/administration/checklist-items/{itemId} for an item that has a server itemId. */
  updateItem(item: ChecklistItem, sectionTitle: string): Observable<ChecklistItem> {
    const request: UpdateChecklistItemRequest = { ...itemBody(item, sectionTitle), updatedBy: this.auth.getUserEmail() };
    return this.http.put<ChecklistItemDto>(`${this.itemsUrl}/${encodeURIComponent(item.id)}`, request).pipe(
      map(toSaved),
      tap((saved) => this.savedStore.update((list) => list.map((s) => (s.item.id === saved.item.id ? saved : s)))),
      map((saved) => saved.item),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  /** DELETE /api/administration/checklist-items/{itemId} (soft delete on the server). */
  deleteItem(id: string): Observable<void> {
    return this.http.delete<void>(`${this.itemsUrl}/${encodeURIComponent(id)}`).pipe(
      tap(() => this.savedStore.update((list) => list.filter((s) => s.item.id !== id))),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
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
