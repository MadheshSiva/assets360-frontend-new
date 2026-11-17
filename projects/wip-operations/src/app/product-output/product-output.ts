import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Box,
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock,
  Cog,
  Download,
  FileText,
  GitBranch,
  Info,
  PackageCheck,
  Paperclip,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Warehouse,
  Wrench,
  X,
} from 'lucide-angular';
import {
  Disposition,
  HANDOVERS,
  OUTPUTS,
  OUTPUT_COMPONENTS,
  OUTPUT_JOB,
  OUTPUT_LISTS,
  OutputUnit,
  nowStamp,
  handoverState,
} from './output-store';

type Tab = 'summary' | 'records' | 'quality' | 'trace' | 'handover';

interface RecordForm {
  stage: string;
  quantity: number;
  batch: string;
  serial: string;
  producedAt: string;
  operator: string;
  disposition: Disposition;
  location: string;
  notes: string;
  files: string[];
  rejectReason: string;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
const PAGE_SIZE_OPTIONS = [10, 25, 50];

@Component({
  selector: 'app-product-output',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './product-output.html',
  // Buttons, controls, tabs, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './product-output.css', '../shared/wip-purple-theme.css'],
})
export class ProductOutput implements OnDestroy {
  readonly icons = {
    ArrowRight, Box, CalendarDays, CircleCheck, CircleX, Clock, Cog, Download, FileText, GitBranch, Info, PackageCheck, Paperclip, Plus, Route, Search, ShieldCheck,
    Warehouse, Wrench, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Output Summary' },
    { key: 'records', label: 'Output Records' },
    { key: 'quality', label: 'Quality & Rework' },
    { key: 'trace', label: 'Batch & Serial Traceability' },
    { key: 'handover', label: 'Handover & Inventory' },
  ];
  readonly job = OUTPUT_JOB;
  readonly lists = OUTPUT_LISTS;
  readonly components = OUTPUT_COMPONENTS;
  readonly dispositions: Disposition[] = ['Accepted', 'Awaiting QC', 'Rework', 'Rejected'];
  /** A new unit cannot be accepted directly: acceptance requires inspection approval. */
  readonly initialDispositions: Disposition[] = ['Awaiting QC', 'Rework', 'Rejected'];
  readonly pageSizes = PAGE_SIZE_OPTIONS;

  outputs = OUTPUTS;
  handovers = HANDOVERS;
  tab: Tab = 'summary';

  // Register
  search = '';
  dispositionFilter: Disposition | '' = '';
  stageFilter = '';
  sortAsc = true;
  pageSize = 10;
  page = 0;
  readonly checked = new Set<string>();
  selectedSerial = OUTPUTS[0]?.serial ?? '';

  // Record output
  form: RecordForm = this.blankForm();
  formError = '';
  draftSaved = '';

  // Handover
  store = OUTPUT_LISTS.stores[0] ?? '';
  receiptRef = this.nextReceipt();

  // Dialogs
  rejectFor: OutputUnit | null = null;
  rejectReason = '';
  rejectBy = '';
  genealogyOpen = false;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?serial=P-003 opens a unit (links from the Progress Log)
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const s = p.get('serial');
        if (s && this.unit(s)) this.selectedSerial = s;
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  get now(): string {
    return nowStamp();
  }

  unit(serial: string): OutputUnit | undefined {
    return this.outputs.find((o) => o.serial === serial);
  }

  handover(u: OutputUnit): string {
    return handoverState(u);
  }

  dispClass(d: Disposition): string {
    return { Accepted: 'pill--green', 'Awaiting QC': 'pill--amber', Rework: 'pill--orange', Rejected: 'pill--red' }[d];
  }

  handoverClass(u: OutputUnit): string {
    const h = handoverState(u);
    return h === 'Received' ? 'pill--green' : h === 'Pending' ? 'pill--amber' : 'pill--grey';
  }

  // ===== KPIs & progress =====

  count(d: Disposition): number {
    return this.outputs.filter((o) => o.disposition === d).length;
  }

  get produced(): number {
    return this.outputs.length;
  }

  get remaining(): number {
    return Math.max(0, this.job.planned - this.produced);
  }

  pct(n: number): number {
    return this.job.planned ? Math.round((n / this.job.planned) * 100) : 0;
  }

  get receivedCount(): number {
    return this.outputs.filter((o) => handoverState(o) === 'Received').length;
  }

  get pendingHandover(): OutputUnit[] {
    return this.outputs.filter((o) => handoverState(o) === 'Pending');
  }

  // ===== Register =====

  get filtered(): OutputUnit[] {
    const q = this.search.trim().toLowerCase();
    const list = this.outputs.filter(
      (o) =>
        (!this.dispositionFilter || o.disposition === this.dispositionFilter) &&
        (!this.stageFilter || o.stage === this.stageFilter) &&
        (!q || `${o.serial} ${this.job.batch} ${o.location} ${o.operator}`.toLowerCase().includes(q)),
    );
    return list.sort((a, b) => (this.sortAsc ? 1 : -1) * (a.producedAt.localeCompare(b.producedAt) || a.serial.localeCompare(b.serial)));
  }

  get pageRows(): OutputUnit[] {
    const start = this.page * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }

  get rangeLabel(): string {
    const total = this.filtered.length;
    if (!total) return '0 of 0';
    const start = this.page * this.pageSize;
    return `${start + 1}–${Math.min(total, start + this.pageSize)} of ${total}`;
  }

  setPage(p: number): void {
    this.page = Math.min(Math.max(0, p), this.pageCount - 1);
  }

  onFilter(): void {
    this.page = 0;
  }

  toggleCheck(o: OutputUnit, on: boolean): void {
    if (on) this.checked.add(o.serial);
    else this.checked.delete(o.serial);
    if (on) this.selectedSerial = o.serial;
  }

  get allChecked(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((o) => this.checked.has(o.serial));
  }

  toggleAll(on: boolean): void {
    for (const o of this.pageRows) on ? this.checked.add(o.serial) : this.checked.delete(o.serial);
  }

  select(o: OutputUnit): void {
    this.selectedSerial = o.serial;
  }

  get selected(): OutputUnit | undefined {
    return this.unit(this.selectedSerial);
  }

  // ===== Record output =====

  private nextSerial(after = 0): string {
    const max = Math.max(0, ...this.outputs.map((o) => Number(o.serial.slice(2)) || 0));
    return `P-${String(max + 1 + after).padStart(3, '0')}`;
  }

  private blankForm(): RecordForm {
    return {
      stage: OUTPUT_LISTS.stages[0] ?? '', quantity: 1, batch: OUTPUT_JOB.batch, serial: this.nextSerial(), producedAt: nowStamp(), operator: CURRENT_USER,
      disposition: 'Awaiting QC', location: OUTPUT_LISTS.locations[0] ?? '', notes: '', files: [], rejectReason: '',
    };
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const ok = files.filter((f) => /\.(jpe?g|png|pdf)$/i.test(f.name) && f.size <= 10 * 1024 * 1024);
    if (ok.length < files.length) this.showToast('Only JPG, PNG or PDF files up to 10 MB are attached.', true);
    this.form.files = [...this.form.files, ...ok.map((f) => f.name)];
  }

  removeFile(name: string): void {
    this.form.files = this.form.files.filter((f) => f !== name);
  }

  /** Serials the form will create (quantity > 1 numbers them on from the first). */
  get formSerials(): string[] {
    const qty = Math.floor(Number(this.form.quantity)) || 0;
    const m = /^(.*?)(\d+)$/.exec(this.form.serial.trim());
    if (qty <= 1 || !m) return [this.form.serial.trim().toUpperCase()];
    return Array.from({ length: qty }, (_, i) => `${m[1]}${String(Number(m[2]) + i).padStart(m[2].length, '0')}`.toUpperCase());
  }

  saveDraft(): void {
    this.draftSaved = this.now;
    this.showToast('Draft saved. It is not counted as output until submitted.');
  }

  submitOutput(): void {
    const f = this.form;
    const qty = Math.floor(Number(f.quantity));
    if (!f.serial.trim() || !f.batch.trim() || !f.producedAt || !f.operator || !f.location) return void (this.formError = 'Fill in all required fields.');
    if (!(qty >= 1)) return void (this.formError = 'Quantity must be at least 1.');
    if (this.produced + qty > this.job.planned) return void (this.formError = `Only ${this.remaining} unit(s) remain of the planned ${this.job.planned}.`);
    if (f.producedAt > this.now) return void (this.formError = 'Produced At cannot be in the future.');
    const serials = this.formSerials;
    const dup = serials.find((s) => this.unit(s));
    if (dup) return void (this.formError = `${dup} is already recorded. Rework updates the existing serial instead of recording it again.`);
    if (f.disposition === 'Rejected' && !f.rejectReason.trim()) return void (this.formError = 'Rejecting requires a reason.');
    this.formError = '';
    const inspection = f.disposition === 'Awaiting QC' ? 'Scheduled' : f.disposition === 'Rework' ? 'QC Failed' : 'Rejected';
    for (const serial of serials) {
      this.outputs.push({
        serial, stage: f.stage, producedAt: f.producedAt, operator: f.operator, disposition: f.disposition, inspection, inspectionRef: '', location: f.location,
        handoverRef: '', assetTag: '', notes: f.notes.trim(), evidence: f.files.length, reworkCount: f.disposition === 'Rework' ? 1 : 0, rejectReason: f.rejectReason.trim(),
        history: [{ at: this.now, by: CURRENT_USER, text: `Output recorded (${f.disposition})` }],
      });
    }
    this.selectedSerial = serials[serials.length - 1];
    this.checked.clear();
    this.checked.add(this.selectedSerial);
    this.page = this.pageCount - 1;
    this.form = this.blankForm();
    this.draftSaved = '';
    this.showToast(`${serials.length} unit${serials.length > 1 ? 's' : ''} recorded (${serials.join(', ')}).`);
  }

  // ===== Quality =====

  private log(u: OutputUnit, text: string): void {
    u.history.push({ at: this.now, by: CURRENT_USER, text });
  }

  qcPass(u: OutputUnit): void {
    u.disposition = 'Accepted';
    u.inspection = 'QC Passed';
    u.location = u.location === 'Inspection Bay' ? 'Packing Area' : u.location;
    this.log(u, 'QC passed; accepted');
    this.showToast(`${u.serial} accepted and ready for handover.`);
  }

  qcFail(u: OutputUnit): void {
    u.disposition = 'Rework';
    u.inspection = 'QC Failed';
    u.reworkCount++;
    this.log(u, 'QC failed; sent to rework (same serial)');
    this.showToast(`${u.serial} sent to rework. The serial is kept.`);
  }

  reworkDone(u: OutputUnit): void {
    u.disposition = 'Awaiting QC';
    u.inspection = 'Scheduled';
    u.location = 'Inspection Bay';
    this.log(u, `Rework ${u.reworkCount} complete; re-inspection scheduled`);
    this.showToast(`${u.serial} back to Awaiting QC.`);
  }

  openReject(u: OutputUnit): void {
    this.rejectFor = u;
    this.rejectReason = '';
    this.rejectBy = '';
  }

  saveReject(): void {
    const u = this.rejectFor;
    if (!u || !this.rejectReason.trim() || !this.rejectBy) return;
    u.disposition = 'Rejected';
    u.inspection = 'Rejected';
    u.rejectReason = this.rejectReason.trim();
    u.location = 'Quarantine';
    this.log(u, `Rejected: ${u.rejectReason} (authorized by ${this.rejectBy})`);
    this.rejectFor = null;
    this.showToast(`${u.serial} rejected and moved to quarantine.`, true);
  }

  get qualityQueue(): OutputUnit[] {
    return this.outputs.filter((o) => o.disposition === 'Awaiting QC' || o.disposition === 'Rework');
  }

  registerAsset(u: OutputUnit): void {
    if (u.disposition !== 'Accepted') return this.showToast('Only accepted serialized units can be registered as assets.', true);
    if (u.assetTag) return;
    u.assetTag = `PA100-${u.serial.replace('P-', '')}`;
    this.log(u, `Registered as asset ${u.assetTag}`);
    this.showToast(`${u.serial} registered as asset ${u.assetTag}.`);
  }

  // ===== Handover =====

  private nextReceipt(): string {
    const max = Math.max(0, ...HANDOVERS.map((h) => Number(h.ref.slice(3)) || 0));
    return `GR-${String(max + 1).padStart(5, '0')}`;
  }

  /** Units the next handover covers: ticked accepted units, or every unit waiting for handover. */
  get handoverUnits(): OutputUnit[] {
    const ticked = this.pendingHandover.filter((o) => this.checked.has(o.serial));
    return ticked.length ? ticked : this.pendingHandover;
  }

  get handoverSerials(): string {
    return this.handoverUnits.map((u) => u.serial).join(', ');
  }

  get pendingSerials(): string {
    return this.pendingHandover.map((u) => u.serial).join(', ');
  }

  createHandover(): void {
    const units = this.handoverUnits;
    if (!units.length) return this.showToast('No accepted units are waiting for handover.', true);
    const ref = this.receiptRef.trim().toUpperCase();
    if (!ref) return this.showToast('Enter the receipt reference.', true);
    if (this.handovers.some((h) => h.ref === ref)) return this.showToast(`${ref} is already used.`, true);
    this.handovers.push({ ref, store: this.store, at: this.now, by: CURRENT_USER, serials: units.map((u) => u.serial) });
    for (const u of units) {
      u.handoverRef = ref;
      u.location = 'Finished Goods';
      this.log(u, `Received into ${this.store} (${ref})`);
    }
    this.receiptRef = this.nextReceipt();
    this.showToast(`${ref}: ${units.map((u) => u.serial).join(', ')} received into ${this.store}.`);
  }

  // ===== Export =====

  export(): void {
    const rows = this.outputs.map((o) => ({
      Serial: o.serial, Job: this.job.code, Item: this.job.item, Batch: this.job.batch, Stage: o.stage, 'Produced At': o.producedAt.replace('T', ' '), Operator: o.operator,
      Disposition: o.disposition, Inspection: o.inspection, 'Inspection Ref': o.inspectionRef, Location: o.location, Handover: handoverState(o), Receipt: o.handoverRef,
      'Asset Tag': o.assetTag, 'Reject Reason': o.rejectReason, Notes: o.notes,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Output');
    XLSX.writeFile(book, `Output_${this.job.code}.xlsx`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.rejectFor = null;
    this.genealogyOpen = false;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
}
