import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { nowStamp } from '../../../people/people.data';
import { BIN_TYPES, blankBin } from '../../inventory.data';
import { BinRecord } from '../../inventory.model';
import { BinService, StoreService } from '../../inventory.service';

type Tab = 'basic' | 'settings';

/** Right-hand "Add / Edit Bin" panel. Bins are named by their code, e.g. 001-A1. */
@Component({
  selector: 'app-bin-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './bin-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class BinForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() bin: BinRecord | null = null;
  @Output() saved = new EventEmitter<{ record: BinRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(BinService);
  readonly stores = inject(StoreService);
  readonly icons = { X };
  readonly binTypes = BIN_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: Tab = 'basic';
  form: BinRecord = blankBin();
  errors: Record<string, string> = {};
  private original: BinRecord | null = null;
  // The code follows store / rack / shelf until it is typed by hand
  private codeTouched = false;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.bin : null;
    this.form = this.bin ? structuredClone(this.bin) : blankBin();
    this.codeTouched = this.isEdit;
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get storeOptions() {
    return this.stores.all().filter((s) => s.status === 'Active' || s.code === this.form.storeCode);
  }

  /** 001-A1 for rack A shelf 1 in ST-001. */
  get suggestedCode(): string {
    const store = this.form.storeCode.replace(/^\D+-?/, '');
    return store && this.form.rack.trim() ? `${store}-${this.form.rack.trim().toUpperCase()}${this.form.shelf.trim()}` : '';
  }

  onLocationChange(): void {
    if (!this.codeTouched) this.form.code = this.suggestedCode;
  }

  onCodeInput(): void {
    this.codeTouched = true;
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
    if (!f.storeCode) errors['storeCode'] = 'Select a store.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (!f.code.trim()) errors['code'] = 'Enter a bin code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors['code'] = `${f.code.trim()} is already used.`;
    if (f.capacity !== null && !(f.capacity > 0)) errors['capacity'] = 'Enter a capacity greater than 0.';
    this.errors = errors;
    if (Object.keys(errors).length) {
      this.tab = 'basic';
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...f,
        code: f.code.trim().toUpperCase(),
        rack: f.rack.trim().toUpperCase(),
        shelf: f.shelf.trim(),
        description: f.description.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
