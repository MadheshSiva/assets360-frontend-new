import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowUp, Box, Building2, Calendar, ChartColumn, ChevronRight, ClipboardList, Copy, Database, Download, Ellipsis, FileText, Hash,
  KeyRound, LucideAngularModule, MapPin, Package, Play, Plus, Receipt, Search, Settings, ShieldCheck, ShoppingCart, Tag, Trash2,
  TriangleAlert, Truck, Upload, User, Users, Wrench, Zap
} from 'lucide-angular';
import { ASSET360_MODULES, AdminPage, formatDate, todayIso } from '../shared/admin-common';
import { FormatBuilder } from './format-builder/format-builder';
import {
  MODULE_ICONS, NumberSequence, RESET_RULES, SCOPES, SequenceIcon, SequenceStatus, cloneSequence, formatErrors, formatNumber, formatSample,
  isNearLimit, maxNumber, nextNumbers, prefixPreview, sequenceStatus, settingErrors, statusTone
} from './numbering-sequence.model';
import { NumberingSequenceService, apiErrorMessage } from './numbering-sequence.service';
import { SequenceDrawer } from './sequence-drawer/sequence-drawer';

type Tab = 'config' | 'preview' | 'usage' | 'changes';

interface ConfirmState {
  title: string;
  message: string;
  action: 'delete' | 'reset';
}

/** Administration > Numbering Sequence: list of sequences, format builder and the settings drawer. */
@Component({
  standalone: true,
  selector: 'app-admin-numbering-sequence',
  imports: [FormsModule, RouterLink, LucideAngularModule, FormatBuilder, SequenceDrawer],
  templateUrl: './numbering-sequence.html',
  styleUrls: ['../shared/admin-workspace.css', './numbering-sequence.css']
})
export class NumberingSequencePage extends AdminPage {
  private readonly service = inject(NumberingSequenceService);
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  readonly icons = {
    ArrowUp, ChevronRight, Copy, Database, Download, Ellipsis, FileText, Hash, Play, Plus, Search, Settings, Tag, Trash2, TriangleAlert, Upload
  };
  private readonly listIcons: Record<SequenceIcon, typeof Box> = {
    box: Box, wrench: Wrench, clipboard: ClipboardList, package: Package, cart: ShoppingCart, users: Users, user: User, truck: Truck,
    key: KeyRound, trash: Trash2, receipt: Receipt, file: FileText, shield: ShieldCheck, chart: ChartColumn, tag: Tag, map: MapPin,
    building: Building2, calendar: Calendar, zap: Zap
  };
  readonly modules = ASSET360_MODULES;
  readonly statuses: SequenceStatus[] = ['Active', 'Near Limit', 'Inactive'];
  readonly scopes = SCOPES;
  readonly resetRules = RESET_RULES;
  readonly formatDate = formatDate;

  search = '';
  listSearch = '';
  moduleFilter = '';
  statusFilter = '';

  selectedId: string | null = null;
  /** Working copy edited by the format builder, settings and drawer; stored on Save / Publish */
  draft: NumberSequence;
  isNew = false;
  dirty = false;
  /** True while a save or delete request is in flight. */
  saving = false;
  showErrors = false;
  drawerOpen = true;
  tab: Tab = 'config';
  menuOpen = false;
  confirm: ConfirmState | null = null;

  testCount = 10;
  testDate = todayIso();
  testResults: string[] = [];

  constructor() {
    super();
    // Blank until the list arrives; then the first stored sequence opens (blank only when there are none)
    this.draft = this.blank();
    this.isNew = true;
    this.service.load().subscribe({
      next: (list) => {
        if (this.isNew && !this.dirty && list[0]) this.select(list[0]);
      },
      error: (err) => this.notify(`Could not load sequences: ${apiErrorMessage(err)}`)
    });
  }

  // ===== Stats =====
  get all(): NumberSequence[] {
    return this.service.sequences();
  }

  get activeCount(): number {
    return this.all.filter((s) => s.active).length;
  }

  get newThisMonth(): number {
    const month = todayIso().slice(0, 7);
    return this.all.filter((s) => s.createdOn.startsWith(month)).length;
  }

  get recordsNumbered(): number {
    return this.all.reduce((sum, s) => sum + s.currentNumber, 0);
  }

  /** Static codes in use: every prefix, location code and suffix across all sequences */
  get prefixCount(): number {
    return this.all.reduce((sum, s) => sum + s.tokens.filter((t) => t.kind !== 'number' && t.kind !== 'date' && t.value.trim()).length, 0);
  }

  get nearLimitCount(): number {
    return this.all.filter((s) => s.active && isNearLimit(s)).length;
  }

  // ===== List =====
  get filtered(): NumberSequence[] {
    const q = (this.search + ' ' + this.listSearch).trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return this.all.filter((s) => {
      if (this.moduleFilter && s.module !== this.moduleFilter) return false;
      if (this.statusFilter && sequenceStatus(s) !== this.statusFilter) return false;
      const hay = `${s.name} ${s.code} ${s.module} ${formatSample(s)}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  get hasFilters(): boolean {
    return !!(this.search || this.listSearch || this.moduleFilter || this.statusFilter);
  }

  iconFor(s: NumberSequence) {
    return this.listIcons[s.icon];
  }

  status(s: NumberSequence): SequenceStatus {
    return sequenceStatus(s);
  }

  tone(s: NumberSequence): string {
    return statusTone(sequenceStatus(s));
  }

  sample(s: NumberSequence): string {
    return formatSample(s);
  }

  select(s: NumberSequence): void {
    this.selectedId = s.id;
    this.draft = cloneSequence(s);
    this.isNew = false;
    this.dirty = false;
    this.showErrors = false;
    this.menuOpen = false;
    this.testResults = [];
    if (this.tab === 'preview') this.generateTest();
  }

  showNearLimit(): void {
    this.statusFilter = 'Near Limit';
    this.moduleFilter = '';
    this.search = '';
    this.listSearch = '';
    const first = this.filtered[0];
    if (first) this.select(first);
  }

  clearFilters(): void {
    this.search = '';
    this.listSearch = '';
    this.moduleFilter = '';
    this.statusFilter = '';
  }

  // ===== Draft =====
  markDirty(): void {
    this.dirty = true;
  }

  get draftStatus(): SequenceStatus {
    return sequenceStatus(this.draft);
  }

  get draftTone(): string {
    return statusTone(this.draftStatus);
  }

  get draftIcon() {
    return this.listIcons[this.isNew ? (MODULE_ICONS[this.draft.module] ?? 'box') : this.draft.icon];
  }

  get fieldErrors(): Record<string, string> {
    return settingErrors(this.draft, this.service.codeTaken(this.draft.code, this.isNew ? null : this.draft.id));
  }

  fieldError(field: string): string | null {
    return this.showErrors ? (this.fieldErrors[field] ?? null) : null;
  }

  get prefixPreview(): string {
    return prefixPreview(this.draft);
  }

  /** Share of the number range already used, in % */
  get rangeUsed(): number {
    if (!this.draft.numberLength) return 0;
    return Math.min(100, Math.round((this.draft.currentNumber / maxNumber(this.draft)) * 1000) / 10);
  }

  createSequence(): void {
    this.selectedId = null;
    // New sequences open with their dropdowns unselected (blank() also backs CSV import and the empty-state draft)
    this.draft = {
      ...this.blank(),
      module: '',
      recordType: '',
      numberLength: null as unknown as number,
      scope: '' as NumberSequence['scope'],
      resetRule: '' as NumberSequence['resetRule']
    };
    this.isNew = true;
    this.dirty = true;
    this.showErrors = false;
    this.drawerOpen = true;
    this.tab = 'config';
    this.notify('Fill in the sequence settings and save to create it.');
  }

  cloneSelected(): void {
    const source = this.selectedId ? this.service.get(this.selectedId) : null;
    this.menuOpen = false;
    if (!source) {
      this.notify('Select a saved sequence to clone.');
      return;
    }
    this.selectedId = null;
    this.draft = this.service.cloneOf(source);
    this.isNew = true;
    this.dirty = true;
    this.showErrors = false;
    this.drawerOpen = true;
    this.notify(`Cloned ${source.name}. Review the code and save.`);
  }

  private blank(): NumberSequence {
    let n = this.all.length + 1;
    while (this.service.codeTaken(`SEQ-${String(n).padStart(3, '0')}`, null)) n++;
    return {
      id: '',
      name: '',
      code: `SEQ-${String(n).padStart(3, '0')}`,
      module: 'Assets',
      recordType: 'Physical Asset',
      icon: 'box',
      tone: 'purple',
      description: '',
      tokens: [
        { kind: 'prefix', value: 'NEW' },
        { kind: 'date', value: 'YYYY' },
        { kind: 'number', value: '' }
      ],
      separator: '-',
      numberLength: 6,
      startNumber: 1,
      currentNumber: 1,
      incrementBy: 1,
      scope: 'Organization',
      resetRule: 'Never',
      resetDate: '',
      duplicatePrevention: true,
      manualOverride: false,
      active: true,
      version: 'v1.0',
      createdOn: todayIso(),
      updatedOn: todayIso(),
      usage: [],
      changes: []
    };
  }

  /** Validates and stores the draft (POST when new, PUT otherwise); publish also bumps the version. */
  commit(publish: boolean): void {
    if (this.saving) return;
    this.showErrors = true;
    const fieldErrors = Object.values(this.fieldErrors);
    if (fieldErrors.length) {
      this.drawerOpen = true;
      this.notify(fieldErrors[0]);
      return;
    }
    const fmt = formatErrors(this.draft);
    if (fmt.length) {
      this.tab = 'config';
      this.notify(fmt[0]);
      return;
    }
    if (this.isNew) this.draft.icon = MODULE_ICONS[this.draft.module] ?? 'box';
    const isNew = this.isNew;
    this.saving = true;
    const request = isNew
      ? this.service.create(this.draft, 'Created sequence')
      : this.service.update(this.draft, publish ? 'Published format and settings' : 'Saved configuration changes', publish);
    request.subscribe({
      next: (saved) => {
        this.saving = false;
        this.afterSave(saved);
        this.notify(isNew ? `${saved.name} created.` : publish ? `${saved.name} published as ${saved.version}.` : `${saved.name} saved.`);
      },
      error: (err) => {
        this.saving = false;
        this.notify(`Could not save: ${apiErrorMessage(err)}`);
      }
    });
  }

  private afterSave(saved: NumberSequence): void {
    this.selectedId = saved.id;
    this.draft = cloneSequence(saved);
    this.isNew = false;
    this.dirty = false;
    this.showErrors = false;
  }

  cancelEdit(): void {
    const saved = this.selectedId ? this.service.get(this.selectedId) : null;
    const fallback = saved ?? this.all[0];
    if (fallback) this.select(fallback);
    this.notify('Changes discarded.');
  }

  // ===== Preview & Test =====
  testPreview(): void {
    this.tab = 'preview';
    this.generateTest();
  }

  generateTest(): void {
    const count = Math.min(Math.max(Math.floor(Number(this.testCount)) || 1, 1), 50);
    this.testCount = count;
    const date = this.testDate ? new Date(this.testDate) : new Date();
    this.testResults = nextNumbers(this.draft, count, date);
  }

  testOverflows(index: number): boolean {
    return this.draft.currentNumber + index * this.draft.incrementBy > maxNumber(this.draft);
  }

  get testFormatErrors(): string[] {
    return formatErrors(this.draft);
  }

  // ===== Header menu =====
  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleActive(): void {
    this.menuOpen = false;
    this.draft.active = !this.draft.active;
    this.markDirty();
    if (!this.isNew) this.commit(false);
  }

  askReset(): void {
    this.menuOpen = false;
    this.confirm = {
      title: 'Reset counter?',
      message: `The next number for ${this.draft.name} will go back to ${formatNumber(this.draft, this.draft.startNumber)}. Duplicate prevention still applies.`,
      action: 'reset'
    };
  }

  askDelete(): void {
    this.menuOpen = false;
    if (this.isNew) {
      this.cancelEdit();
      return;
    }
    this.confirm = {
      title: 'Delete sequence?',
      message: `${this.draft.name} (${this.draft.code}) will be removed. Records already numbered keep their numbers.`,
      action: 'delete'
    };
  }

  confirmAction(): void {
    const c = this.confirm;
    this.confirm = null;
    if (!c) return;
    if (c.action === 'reset') {
      this.draft.currentNumber = this.draft.startNumber;
      this.commit(false);
      return;
    }
    if (this.saving) return;
    const name = this.draft.name;
    this.saving = true;
    this.service.remove(this.draft.id).subscribe({
      next: () => {
        this.saving = false;
        const next = this.all[0];
        if (next) this.select(next);
        else this.createSequence();
        this.notify(`${name} deleted.`);
      },
      error: (err) => {
        this.saving = false;
        this.notify(`Could not delete: ${apiErrorMessage(err)}`);
      }
    });
  }

  // ===== Import / export =====
  exportCsv(): void {
    const header = [
      'Name', 'Code', 'Module', 'Record Type', 'Prefix', 'Separator', 'Number Length', 'Start Number', 'Current Number', 'Increment By',
      'Reset Rule', 'Scope', 'Status', 'Format', 'Version'
    ];
    const rows = this.filtered.map((s) => [
      s.name, s.code, s.module, s.recordType, s.tokens.find((t) => t.kind === 'prefix')?.value ?? '', s.separator, s.numberLength,
      s.startNumber, s.currentNumber, s.incrementBy, s.resetRule, s.scope, sequenceStatus(s), formatSample(s), s.version
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `numbering-sequences-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`Exported ${rows.length} sequences.`);
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
      const rows = this.parseCsv(text);
      if (!rows.length) {
        this.notify('No sequences found. Use the CSV layout from Export.');
        return;
      }
      this.service.importMany(rows).subscribe((added) =>
        this.notify(`Imported ${added} of ${rows.length} sequences${added < rows.length ? ' (duplicates and rejected rows skipped)' : ''}.`)
      );
    });
  }

  /** Reads the CSV layout produced by Export */
  private parseCsv(text: string): NumberSequence[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const split = (line: string) =>
      (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const head = split(lines[0]).map((h) => h.trim().toLowerCase());
    const col = (cells: string[], name: string) => cells[head.indexOf(name)] ?? '';
    const out: NumberSequence[] = [];
    for (const line of lines.slice(1)) {
      const cells = split(line);
      const seq = this.blank();
      seq.name = col(cells, 'name').trim();
      seq.code = col(cells, 'code').trim().toUpperCase();
      if (!seq.name || !seq.code) continue;
      seq.module = col(cells, 'module') || seq.module;
      seq.recordType = col(cells, 'record type') || seq.recordType;
      seq.tokens[0].value = col(cells, 'prefix') || seq.code.split('-')[0];
      seq.separator = head.includes('separator') ? col(cells, 'separator') : '-';
      seq.numberLength = Number(col(cells, 'number length')) || 6;
      seq.startNumber = Number(col(cells, 'start number')) || 1;
      seq.currentNumber = Math.max(Number(col(cells, 'current number')) || seq.startNumber, seq.startNumber);
      seq.incrementBy = Number(col(cells, 'increment by')) || 1;
      seq.icon = MODULE_ICONS[seq.module] ?? 'box';
      out.push(seq);
    }
    return out;
  }
}
