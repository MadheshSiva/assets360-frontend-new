import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Box,
  ChevronDown,
  CircleCheck,
  Coins,
  Info,
  Network,
  PackagePlus,
  Paperclip,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from 'lucide-angular';
import { JobMaterials, MaterialException, MaterialLine, MaterialTx, TxType } from './material.model';

type Tab = 'summary' | 'transactions' | 'issues' | 'trace' | 'cost';
type Dialog = 'return' | 'issue' | 'scrap' | null;

interface ConsumptionForm {
  code: string;
  stage: string;
  lot: string;
  ref: string;
  qty: number;
  operator: string;
  at: string;
  notes: string;
  photo: File | null;
}

interface MoveForm {
  code: string;
  qty: number;
  lot: string;
  reason: string;
}

const PREFIX: Record<TxType, string> = { Issue: 'MI', Consumption: 'MC', Return: 'RT', Scrap: 'SC' };
/** Operators; filled from master data once the API is wired. */
const OPERATORS: string[] = [];
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];

/** Job material ledgers are kept in memory; empty until the inventory / WIP API is wired up. */
const JOBS: JobMaterials[] = [];
/** Placeholder while no job exists (keeps the bindings safe). */
const NO_JOB: JobMaterials = { job: '', name: '', status: '', stage: '', site: '', store: '', materials: [], transactions: [], traceability: [], exceptions: [] };
/** Evidence photos picked in this session, by transaction ref. */
const PHOTOS = new Map<string, File>();

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

@Component({
  selector: 'app-material-consumption',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './material-consumption.html',
  // Buttons, controls, cards, tabs, menu, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', './material-consumption.css', './material-consumption-panels.css', '../shared/wip-purple-theme.css'],
})
export class MaterialConsumption implements OnDestroy {
  readonly icons = { ArrowRight, Box, ChevronDown, CircleCheck, Coins, Info, Network, PackagePlus, Paperclip, Plus, Search, Trash2, TriangleAlert, Undo2, Upload, X };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Material Summary' },
    { key: 'transactions', label: 'Consumption Transactions' },
    { key: 'issues', label: 'Issues & Returns' },
    { key: 'trace', label: 'Batch & Serial Traceability' },
    { key: 'cost', label: 'Cost Analysis' },
  ];
  readonly operators = OPERATORS;
  readonly txTypes: TxType[] = ['Issue', 'Consumption', 'Return', 'Scrap'];
  readonly jobList = JOBS.map((j) => ({ job: j.job, name: j.name, status: j.status }));

  j: JobMaterials = JOBS[0] ?? NO_JOB;
  tab: Tab = 'summary';
  switcherOpen = false;

  // Ledger filters
  search = '';
  category = '';
  stageFilter = '';
  // Transactions filter
  txType: TxType | '' = '';

  form!: ConsumptionForm;
  formError = '';
  dialog: Dialog = null;
  move: MoveForm = { code: '', qty: 1, lot: '', reason: '' };
  moveError = '';
  reviewing: MaterialException | null = null;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const code = p.get('job');
        this.j = JOBS.find((x) => x.job === code) ?? JOBS[0] ?? NO_JOB;
        this.tab = 'summary';
        this.search = this.category = this.txType = '';
        this.stageFilter = this.j.stage;
        this.dialog = null;
        this.switcherOpen = false;
        this.resetForm();
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  /** Current local time as yyyy-MM-ddTHH:mm. */
  private nowStamp(): string {
    return stamp(new Date());
  }

  openJob(job: string): void {
    this.switcherOpen = false;
    this.router.navigate([], { queryParams: { job } });
  }

  isKnownJob(job: string): boolean {
    return KNOWN_JOBS.includes(job);
  }

  get canRecord(): boolean {
    return this.j.status !== 'Completed' && this.j.status !== 'Planned';
  }

  // ===== Lookups =====

  material(code: string): MaterialLine | undefined {
    return this.j.materials.find((m) => m.code === code);
  }

  /** Issued but not yet used, scrapped or returned. */
  atJob(m: MaterialLine): number {
    return Math.round((m.issued - m.used - m.scrap - m.returned) * 100) / 100;
  }

  get categories(): string[] {
    return [...new Set(this.j.materials.map((m) => m.category))].sort();
  }

  get stages(): string[] {
    return [...new Set([this.j.stage, ...this.j.materials.map((m) => m.stage)])];
  }

  get ledger(): MaterialLine[] {
    const q = this.search.trim().toLowerCase();
    return this.j.materials.filter(
      (m) => (!this.category || m.category === this.category) && (!this.stageFilter || m.stage === this.stageFilter) && (!q || `${m.name} ${m.code}`.toLowerCase().includes(q)),
    );
  }

  get transactions(): MaterialTx[] {
    return this.j.transactions.filter((t) => !this.txType || t.type === this.txType);
  }

  /** Issues, returns and scrap (everything but consumption). */
  get movements(): MaterialTx[] {
    return this.j.transactions.filter((t) => t.type !== 'Consumption');
  }

  get openExceptions(): MaterialException[] {
    return this.j.exceptions.filter((e) => e.status !== 'Closed');
  }

  // ===== Costs =====

  get plannedCost(): number {
    return this.j.materials.reduce((s, m) => s + m.planned * m.unitCost, 0);
  }

  get consumedCost(): number {
    return this.j.materials.reduce((s, m) => s + m.used * m.unitCost, 0);
  }

  get scrapCost(): number {
    return this.j.materials.reduce((s, m) => s + m.scrap * m.unitCost, 0);
  }

  /** Planned budget not yet spent on use or scrap (negative when over budget). */
  remaining(m: MaterialLine): number {
    return (m.planned - m.used - m.scrap) * m.unitCost;
  }

  get remainingCost(): number {
    return this.plannedCost - this.consumedCost - this.scrapCost;
  }

  share(value: number, of: number): number {
    return of ? Math.min(100, (value / of) * 100) : 0;
  }

  // ===== Record consumption =====

  private nextRef(type: TxType): string {
    const prefix = PREFIX[type];
    const all = JOBS.flatMap((x) => x.transactions).filter((t) => t.ref.startsWith(prefix + '-')).map((t) => Number(t.ref.split('-')[1]) || 0);
    return `${prefix}-${String(Math.max(0, ...all) + 1).padStart(5, '0')}`;
  }

  private nextId(): number {
    return Math.max(0, ...this.j.transactions.map((t) => t.id)) + 1;
  }

  resetForm(code?: string): void {
    const m = (code && this.material(code)) || this.j.materials.find((x) => this.atJob(x) > 0) || this.j.materials[0];
    const issue = m ? [...this.j.transactions].find((t) => t.type === 'Issue' && t.code === m.code) : undefined;
    this.form = {
      code: m?.code ?? '', stage: this.j.stage, lot: m?.batches[0]?.lot ?? '', ref: issue?.ref ?? '',
      qty: 1, operator: OPERATORS[0] ?? '', at: this.nowStamp(), notes: '', photo: null,
    };
    this.formError = '';
  }

  onFormMaterial(code: string): void {
    this.resetForm(code);
  }

  get formMaterial(): MaterialLine | undefined {
    return this.material(this.form.code);
  }

  get lineCost(): number {
    return (this.formMaterial?.unitCost ?? 0) * (Number(this.form.qty) || 0);
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      this.formError = 'Attach an image file up to 10 MB.';
      return;
    }
    this.form.photo = file;
  }

  /** Output serials mentioned in the notes (e.g. "SN-P-006") are linked to the batch for traceability. */
  private serialsIn(text: string): string[] {
    return [...new Set(text.toUpperCase().match(/\bSN-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) ?? [])];
  }

  submitConsumption(): void {
    const f = this.form;
    const m = this.formMaterial;
    const qty = Number(f.qty);
    if (!this.canRecord) {
      this.formError = this.j.status === 'Planned' ? 'The job has not started yet.' : 'The job is complete; no more consumption can be recorded.';
      return;
    }
    if (!m || !(qty > 0)) {
      this.formError = 'Choose the material and enter a quantity above zero.';
      return;
    }
    if (qty > this.atJob(m)) {
      this.formError = `Only ${this.atJob(m)} ${m.uom} available at the job. Issue more material first.`;
      return;
    }
    if (!f.at) {
      this.formError = 'Enter the consumption time.';
      return;
    }
    const ref = this.nextRef('Consumption');
    m.used += qty;
    const tx: MaterialTx = { id: this.nextId(), at: f.at, type: 'Consumption', code: m.code, qty, ref, by: f.operator, stage: f.stage, lot: f.lot, notes: f.notes.trim() };
    this.j.transactions = [tx, ...this.j.transactions].sort((a, b) => b.at.localeCompare(a.at));
    if (f.photo) PHOTOS.set(ref, f.photo);
    const batch = m.batches.find((b) => b.lot === f.lot);
    const serials = this.serialsIn(f.notes);
    for (const serial of serials) {
      this.j.traceability = [{ serial, code: m.code, lot: f.lot, supplier: batch?.supplier ?? '', expiry: batch?.expiry ?? '', at: f.at }, ...this.j.traceability];
    }
    this.showToast(`${ref}: ${qty} ${m.uom} of ${m.name} recorded${serials.length ? ` and linked to ${serials.join(', ')}` : ''}.`);
    this.resetForm(m.code);
  }

  hasPhoto(ref: string): boolean {
    return PHOTOS.has(ref);
  }

  viewPhoto(ref: string): void {
    const file = PHOTOS.get(ref);
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  focusForm(): void {
    this.tab = 'summary';
    setTimeout(() => {
      const el = document.getElementById('mc-form');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (el?.querySelector('select, input') as HTMLElement | null)?.focus();
    });
  }

  // ===== Issue / return / scrap =====

  openMove(kind: Exclude<Dialog, null>, code?: string): void {
    const m = (code && this.material(code)) || this.j.materials[0];
    if (!m) return;
    if (this.j.status === 'Completed' && kind !== 'return') {
      this.showToast('The job is complete.', true);
      return;
    }
    this.move = { code: m.code, qty: 1, lot: m.batches[0]?.lot ?? '', reason: kind === 'return' ? 'Surplus material' : kind === 'scrap' ? '' : 'Additional requirement' };
    this.moveError = '';
    this.dialog = kind;
  }

  get moveMaterial(): MaterialLine | undefined {
    return this.material(this.move.code);
  }

  onMoveMaterial(code: string): void {
    this.move.code = code;
    this.move.lot = this.material(code)?.batches[0]?.lot ?? '';
  }

  saveMove(): void {
    const m = this.moveMaterial;
    const qty = Number(this.move.qty);
    const kind = this.dialog;
    if (!m || !kind || !(qty > 0)) {
      this.moveError = 'Enter a quantity above zero.';
      return;
    }
    if ((kind === 'return' || kind === 'scrap') && qty > this.atJob(m)) {
      this.moveError = `Only ${this.atJob(m)} ${m.uom} is at the job.`;
      return;
    }
    if (kind === 'scrap' && !this.move.reason.trim()) {
      this.moveError = 'Give the scrap reason.';
      return;
    }
    const type: TxType = kind === 'return' ? 'Return' : kind === 'scrap' ? 'Scrap' : 'Issue';
    const ref = this.nextRef(type);
    if (type === 'Return') m.returned += qty;
    if (type === 'Scrap') m.scrap += qty;
    if (type === 'Issue') m.issued += qty;
    const at = this.nowStamp();
    this.j.transactions = [
      { id: this.nextId(), at, type, code: m.code, qty, ref, by: type === 'Scrap' ? OPERATORS[0] ?? '' : 'Store Team', stage: this.j.stage, lot: this.move.lot, notes: this.move.reason.trim() },
      ...this.j.transactions,
    ];
    if (type === 'Scrap') {
      const id = Math.max(0, ...this.j.exceptions.map((e) => e.id)) + 1;
      this.j.exceptions = [{ id, code: m.code, text: `${qty} ${m.uom.toLowerCase()} scrapped. Reason: ${this.move.reason.trim()}.`, ref, status: 'Review Required', at }, ...this.j.exceptions];
    }
    this.dialog = null;
    const verb = type === 'Return' ? 'returned to store' : type === 'Scrap' ? 'scrapped — review required' : `issued from ${this.j.store}`;
    this.showToast(`${ref}: ${qty} ${m.uom} of ${m.name} ${verb}.`, type === 'Scrap');
  }

  /** Undoing a posted entry: a reversing transaction is posted instead of editing it. */
  reverse(t: MaterialTx): void {
    const m = this.material(t.code);
    if (!m) return;
    const field = t.type === 'Issue' ? 'issued' : t.type === 'Consumption' ? 'used' : t.type === 'Return' ? 'returned' : 'scrap';
    if (t.type === 'Issue' && this.atJob(m) < t.qty) {
      this.showToast(`Cannot reverse ${t.ref}: only ${this.atJob(m)} ${m.uom} is still at the job.`, true);
      return;
    }
    m[field] -= t.qty;
    const ref = `${t.ref}-R`;
    this.j.transactions = [{ ...t, id: this.nextId(), at: this.nowStamp(), qty: -t.qty, ref, notes: `Reversal of ${t.ref}` }, ...this.j.transactions];
    t.notes = t.notes ? `${t.notes} (reversed)` : 'Reversed';
    this.showToast(`${t.ref} reversed by ${ref}.`);
  }

  isReversed(t: MaterialTx): boolean {
    return t.qty < 0 || this.j.transactions.some((x) => x.ref === `${t.ref}-R`);
  }

  // ===== Exceptions =====

  closeException(e: MaterialException): void {
    e.status = 'Closed';
    this.reviewing = null;
    this.showToast(`Exception for ${e.ref} closed.`);
  }

  // ===== Export =====

  exportXlsx(): void {
    const ledger = XLSX.utils.aoa_to_sheet([
      ['Code', 'Material', 'Category', 'UOM', 'Planned', 'Issued', 'Used', 'Scrap', 'Returned', 'At Job', 'Unit Cost (AED)', 'Consumed Cost (AED)'],
      ...this.j.materials.map((m) => [m.code, m.name, m.category, m.uom, m.planned, m.issued, m.used, m.scrap, m.returned, this.atJob(m), m.unitCost, m.used * m.unitCost]),
    ]);
    const txs = XLSX.utils.aoa_to_sheet([
      ['Time', 'Type', 'Code', 'Material', 'Quantity', 'Reference', 'Lot', 'Stage', 'Recorded By', 'Notes'],
      ...this.j.transactions.map((t) => [t.at.replace('T', ' '), t.type, t.code, this.material(t.code)?.name ?? '', t.qty, t.ref, t.lot, t.stage, t.by, t.notes]),
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, ledger, 'Ledger');
    XLSX.utils.book_append_sheet(book, txs, 'Transactions');
    XLSX.writeFile(book, `${this.j.job}_materials.xlsx`);
  }

  // ===== Misc =====

  txTone(type: TxType): string {
    return type.toLowerCase();
  }

  toggleSwitcher(event: Event): void {
    event.stopPropagation();
    this.switcherOpen = !this.switcherOpen;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.switcherOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    this.dialog = null;
    this.reviewing = null;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
