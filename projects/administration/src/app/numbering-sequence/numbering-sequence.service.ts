import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CURRENT_USER, todayIso } from '../shared/admin-common';
import { SEQUENCES } from './numbering-sequence.data';
import { NumberSequence, bumpVersion, cloneSequence } from './numbering-sequence.model';

/** Readable message for a failed save or delete. */
export function apiErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

/** DEMO MODE: numbering sequences live in memory, seeded from numbering-sequence.data.ts. */
@Injectable({ providedIn: 'root' })
export class NumberingSequenceService {
  private readonly store = signal<NumberSequence[]>(SEQUENCES.map(cloneSequence));
  readonly sequences = this.store.asReadonly();
  private seq = SEQUENCES.length;

  get(id: string): NumberSequence | undefined {
    return this.store().find((s) => s.id === id);
  }

  codeTaken(code: string, exceptId: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.store().some((s) => s.id !== exceptId && s.code.toUpperCase() === c);
  }

  /** The stored sequences. */
  load(): Observable<NumberSequence[]> {
    return of(this.store());
  }

  /** Adds a new sequence to the top of the list. */
  create(draft: NumberSequence, change: string): Observable<NumberSequence> {
    const saved = cloneSequence(draft);
    this.seq += 1;
    saved.id = `SEQ-${String(this.seq).padStart(3, '0')}`;
    saved.code = saved.code.trim().toUpperCase();
    saved.name = saved.name.trim();
    saved.createdOn = todayIso();
    saved.updatedOn = saved.createdOn;
    saved.version = 'v1.0';
    saved.changes = [{ date: saved.createdOn, version: saved.version, user: CURRENT_USER.name, change }];
    this.store.update((list) => [saved, ...list]);
    return of(saved);
  }

  /** Updates a stored sequence; logs the change and optionally bumps the version (publish). */
  update(draft: NumberSequence, change: string, publish = false): Observable<NumberSequence> {
    const saved = cloneSequence(draft);
    saved.code = saved.code.trim().toUpperCase();
    saved.name = saved.name.trim();
    saved.updatedOn = todayIso();
    if (publish) saved.version = bumpVersion(saved.version);
    saved.changes = [{ date: todayIso(), version: saved.version, user: CURRENT_USER.name, change }, ...saved.changes];
    this.store.update((list) => list.map((s) => (s.id === saved.id ? saved : s)));
    return of(saved);
  }

  /** Deletes a sequence. */
  remove(id: string): Observable<void> {
    this.store.update((list) => list.filter((s) => s.id !== id));
    return of(undefined);
  }

  /** Copy with a unique "-COPY" code; returned unsaved so the user can review it first. */
  cloneOf(source: NumberSequence): NumberSequence {
    const copy = cloneSequence(source);
    copy.id = '';
    copy.name = `${source.name} (Copy)`;
    let code = `${source.code}-COPY`.slice(0, 20);
    let n = 2;
    while (this.codeTaken(code, null)) code = `${source.code}-C${n++}`.slice(0, 20);
    copy.code = code;
    copy.currentNumber = copy.startNumber;
    copy.usage = [];
    copy.changes = [];
    return copy;
  }

  /** Creates imported sequences, skipping codes that already exist. Emits how many were added. */
  importMany(rows: NumberSequence[]): Observable<number> {
    const fresh = rows.filter((r, i) => r.code && !this.codeTaken(r.code, null) && rows.findIndex((x) => x.code === r.code) === i);
    fresh.forEach((row) => this.create({ ...row, id: '' }, 'Imported sequence'));
    return of(fresh.length);
  }
}
