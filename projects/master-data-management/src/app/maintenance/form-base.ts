import { Directive, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CodeStore } from '../shared/code-store';
import { nowStamp } from '../people/people.data';

/**
 * Add/edit drawer behaviour shared by the Maintenance masters: copy the record in, check the
 * required name and code, stamp dates and emit. Subclasses add their own fields and checks.
 */
@Directive()
export abstract class MasterForm<T extends { code: string; name: string; createdOn: string; updatedOn: string }, Tab extends string> implements OnChanges {
  // 'edit' changes `record`; 'add' creates a new one, pre-filled from it if given (Duplicate)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() record: T | null = null;
  @Output() saved = new EventEmitter<{ record: T; originalCode: string | null; originalName: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  abstract readonly tabs: { id: Tab; label: string }[];
  tab!: Tab;
  form!: T;
  errors: Record<string, string> = {};
  protected original: T | null = null;

  protected abstract store: CodeStore<T>;
  protected abstract blank(): T;
  /** Extra checks; return the error messages keyed by field, with the tab each one is on. */
  protected abstract validate(f: T): { errors: Record<string, string>; tab?: Tab };
  /** Clean-up before saving (trimming, dropping empty rows). */
  protected tidy(f: T): T {
    return f;
  }

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.record : null;
    this.form = this.record ? structuredClone(this.record) : this.blank();
    this.errors = {};
    this.tab = this.tabs[0].id;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Overridden where names only need to be unique within a group
  protected nameTaken(f: T): boolean {
    return this.store.isNameTaken(f.name, this.original?.code ?? null);
  }

  /** True on the final tab, where the primary button saves instead of advancing. */
  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  /** Move to the next tab. */
  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    // Enter key / primary button on earlier tabs just advances
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const errors: Record<string, string> = {};
    if (!f.name.trim()) errors['name'] = 'Enter a name.';
    else if (this.nameTaken(f)) errors['name'] = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors['code'] = 'Enter a code.';
    else if (this.store.isCodeTaken(f.code, this.original?.code ?? null)) errors['code'] = `${f.code.trim()} is already used.`;
    const extra = this.validate(f);
    this.errors = { ...errors, ...extra.errors };
    if (Object.keys(errors).length) {
      this.tab = this.tabs[0].id;
      return;
    }
    if (Object.keys(extra.errors).length) {
      this.tab = extra.tab ?? this.tabs[0].id;
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: this.tidy({ ...f, name: f.name.trim(), code: f.code.trim().toUpperCase(), createdOn: this.original?.createdOn ?? stamp, updatedOn: stamp }),
      originalCode: this.original?.code ?? null,
      originalName: this.original?.name ?? null
    });
  }
}
