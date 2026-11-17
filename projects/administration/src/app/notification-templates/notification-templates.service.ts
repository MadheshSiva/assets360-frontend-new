import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { seedTemplates } from './notification-templates.data';
import { NotificationTemplate } from './notification-templates.model';

/** Readable message for a failed save or delete. */
export function apiErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

/**
 * DEMO MODE: notification templates live in memory, seeded from notification-templates.data.ts.
 * New drafts stay local until their first save (create); saved templates are updated and deleted in memory.
 */
@Injectable({ providedIn: 'root' })
export class NotificationTemplateService {
  private readonly store = signal<NotificationTemplate[]>(seedTemplates(Date.now()));
  readonly templates = this.store.asReadonly();
  /** Ids of saved templates (drafts created with New / Library are not saved until their first save). */
  private readonly persisted = new Set<string>(this.store().map((t) => t.id));
  private nextId = 1;
  private savedSeq = this.store().length;

  all(): NotificationTemplate[] {
    return this.store();
  }

  get(id: string): NotificationTemplate | undefined {
    return this.store().find((t) => t.id === id);
  }

  isPersisted(id: string): boolean {
    return this.persisted.has(id);
  }

  codeTaken(code: string, exceptId: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.store().some((t) => t.code.toUpperCase() === c && t.id !== exceptId);
  }

  /** Temporary id for a draft that has not been saved yet. */
  newId(): string {
    return `NEW-${String(this.nextId++).padStart(4, '0')}`;
  }

  /** The stored templates. */
  load(): Observable<NotificationTemplate[]> {
    return of(this.store());
  }

  /** Insert or replace (by id) locally; new templates go to the top. */
  save(t: NotificationTemplate): NotificationTemplate {
    const copy = structuredClone(t);
    this.store.update((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? copy : x)) : [copy, ...list]));
    return copy;
  }

  /** Saves a local draft for the first time; it gets a permanent NT-nnnn id. */
  create(t: NotificationTemplate): Observable<NotificationTemplate> {
    this.savedSeq += 1;
    const saved: NotificationTemplate = { ...structuredClone(t), id: `NT-${String(this.savedSeq).padStart(4, '0')}` };
    this.persisted.add(saved.id);
    this.store.update((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? saved : x)) : [saved, ...list]));
    return of(saved);
  }

  /** Updates a saved template. */
  update(t: NotificationTemplate): Observable<NotificationTemplate> {
    const saved = structuredClone(t);
    this.store.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
    return of(saved);
  }

  /** Deletes a template (saved or draft). */
  remove(id: string): Observable<void> {
    this.persisted.delete(id);
    this.store.update((list) => list.filter((t) => t.id !== id));
    return of(undefined);
  }
}
