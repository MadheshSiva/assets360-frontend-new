import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RowActions } from 'shared-ui';
import { MasterDataStore } from './master-data.store';
import { MasterField, MasterRecord, MasterTableConfig, MasterValue } from './master-table.model';

/**
 * List page shared by every master data screen: search, paging, add/edit dialog and
 * delete with confirmation. Each page only passes its own `config`.
 */
@Component({
  selector: 'app-master-table',
  imports: [FormsModule, RowActions],
  templateUrl: './master-table.html',
  styleUrls: ['./master-table.css', '../styles/mdm-purple-theme.css']
})
export class MasterTable implements OnInit {
  @Input({ required: true }) config!: MasterTableConfig;

  private readonly store = inject(MasterDataStore);

  readonly pageSize = 10;
  readonly statuses: MasterRecord['status'][] = ['Active', 'Inactive'];

  rows: MasterRecord[] = [];
  searchTerm = '';
  page = 0;
  selected = new Set<string>();

  // Add / edit dialog; `editingCode` is null when adding
  showForm = false;
  editingCode: string | null = null;
  form: MasterRecord = this.emptyRecord();
  formError = '';

  // Codes waiting for the delete confirmation
  pendingDelete: string[] = [];

  ngOnInit(): void {
    this.reload();
  }

  get tableFields(): MasterField[] {
    return this.config.fields.filter((f) => !f.hideInTable);
  }

  get filteredRows(): MasterRecord[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.rows;
    return this.rows.filter((r) =>
      Object.values(r).some((v) => v !== null && String(v).toLowerCase().includes(term))
    );
  }

  get pageRows(): MasterRecord[] {
    return this.filteredRows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get rangeLabel(): string {
    const total = this.filteredRows.length;
    if (!total) return '0 of 0';
    const start = this.page * this.pageSize + 1;
    return `${start}–${Math.min(start + this.pageSize - 1, total)} of ${total}`;
  }

  get allPageSelected(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((r) => this.selected.has(r.code));
  }

  onSearch(): void {
    this.page = 0;
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
  }

  toggleRow(code: string): void {
    if (this.selected.has(code)) {
      this.selected.delete(code);
    } else {
      this.selected.add(code);
    }
  }

  selectedCodes(): string[] {
    return [...this.selected];
  }

  togglePage(): void {
    const select = !this.allPageSelected;
    this.pageRows.forEach((r) => (select ? this.selected.add(r.code) : this.selected.delete(r.code)));
  }

  display(value: MasterValue | undefined, field: MasterField): string {
    if (field.type === 'boolean') return value ? 'Yes' : 'No';
    return value === null || value === undefined || value === '' ? '-' : String(value);
  }

  openAdd(): void {
    this.editingCode = null;
    this.form = this.emptyRecord();
    this.formError = '';
    this.showForm = true;
  }

  openEdit(row: MasterRecord): void {
    this.editingCode = row.code;
    this.form = { ...row };
    this.formError = '';
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
  }

  submitForm(): void {
    const missing = this.config.fields.find((f) => f.required && this.isBlank(this.form[f.key]));
    if (missing) {
      this.formError = `${missing.label} is required.`;
      return;
    }
    if (!this.form.status) {
      this.formError = 'Status is required.';
      return;
    }
    const record: MasterRecord = { ...this.form, code: String(this.form.code ?? '').trim() || this.nextCode() };
    const clash = this.rows.some((r) => r.code === record.code && r.code !== this.editingCode);
    if (clash) {
      this.formError = `Code ${record.code} is already used.`;
      return;
    }
    this.store.save(this.config.key, record, this.editingCode);
    if (this.editingCode !== null && this.editingCode !== record.code) {
      this.selected.delete(this.editingCode);
    }
    this.reload();
    this.showForm = false;
  }

  askDelete(codes: string[]): void {
    this.pendingDelete = codes;
  }

  confirmDelete(): void {
    this.store.remove(this.config.key, this.pendingDelete);
    this.pendingDelete.forEach((code) => this.selected.delete(code));
    this.pendingDelete = [];
    this.reload();
    this.goToPage(this.page);
  }

  cancelDelete(): void {
    this.pendingDelete = [];
  }

  private reload(): void {
    this.rows = [...this.store.list(this.config.key, this.config.rows)];
  }

  private emptyRecord(): MasterRecord {
    const record: MasterRecord = { code: '', status: '' as MasterRecord['status'] };
    for (const field of this.config?.fields ?? []) {
      record[field.key] = field.type === 'boolean' ? false : '';
    }
    return record;
  }

  // Next free code after the highest existing one, e.g. SITE-0004
  private nextCode(): string {
    const prefix = `${this.config.codePrefix}-`;
    const highest = this.rows
      .map((r) => (r.code.startsWith(prefix) ? Number(r.code.slice(prefix.length)) : 0))
      .filter((n) => Number.isFinite(n))
      .reduce((max, n) => Math.max(max, n), 0);
    return prefix + String(highest + 1).padStart(4, '0');
  }

  private isBlank(value: MasterValue | undefined): boolean {
    return value === null || value === undefined || String(value).trim() === '';
  }
}
