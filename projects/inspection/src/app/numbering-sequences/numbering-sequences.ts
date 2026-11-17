import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Download,
  Ellipsis,
  FileText,
  Info,
  Plus,
  Search,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { NumberingSequence, SequenceAllocation } from '../shared/inspection.models';
import { downloadCsv, fmtDate, fmtDateTime, pillClass } from '../shared/insp-utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ValidationRow {
  ok: boolean;
  text: string;
}

interface LogRow extends SequenceAllocation {
  sequenceName: string;
}

@Component({
  selector: 'app-insp-numbering-sequences',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './numbering-sequences.html',
  styleUrls: ['../shared/insp-page.css', './numbering-sequences.css']
})
export class NumberingSequencesPage implements OnInit {
  readonly icons = { ArrowRight, CircleAlert, CircleCheck, Download, Ellipsis, FileText, Info, Plus, Search, X };
  readonly api = inject(InspectionApi);
  readonly store = this.api.sequences;
  readonly pillClass = pillClass;
  readonly fmtDateTime = fmtDateTime;

  readonly recordTypes = ['Inspection', 'Plan', 'Finding', 'Report', 'Calibration'];
  readonly separators = [
    { value: '-', label: 'Hyphen (-)' },
    { value: '/', label: 'Slash (/)' },
    { value: '', label: 'None' }
  ];
  readonly yearFormats = [
    { value: 'YYYY', label: 'YYYY' },
    { value: 'YY', label: 'YY' },
    { value: '', label: 'No year' }
  ];
  readonly digitOptions = [3, 4, 5, 6];
  readonly resetRules = ['Annually', 'Monthly', 'Never'];
  readonly scopes = ['Tenant-wide', 'Site-wide'];
  readonly timezones = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'UTC'];

  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.store
      .items()
      .filter((s) => !q || `${s.sequenceName} ${s.format} ${s.numberType}`.toLowerCase().includes(q));
  });

  draft: NumberingSequence | null = null;
  dirty = false;
  saving = false;
  menuFor: string | null = null;
  confirmDelete: string | null = null;
  showTokens = false;
  showLog = false;
  readonly toast = signal<string | null>(null);

  constructor() {
    // Select the first sequence once the list arrives
    effect(() => {
      const first = this.store.items()[0];
      if (first && this.selectedId() === null) this.select(first);
    });
  }

  ngOnInit(): void {
    this.store.load();
  }

  select(s: NumberingSequence): void {
    this.selectedId.set(s.id);
    this.draft = structuredClone(s);
    this.dirty = false;
    this.menuFor = null;
  }

  newSequence(): void {
    this.selectedId.set('');
    this.draft = {
      id: '',
      status: 'Active',
      createdBy: null,
      createdAt: null,
      updatedBy: null,
      updatedAt: null,
      clientId: null,
      tenantId: null,
      sequenceCode: '',
      sequenceName: 'New Sequence',
      numberType: '',
      prefix: 'NEW',
      separator: '-',
      yearFormat: 'YYYY',
      sequenceDigits: null as unknown as number,
      startingNumber: 1,
      runningNumber: 1,
      resetFrequency: '',
      scope: '',
      timezone: '',
      format: 'NEW-{YYYY}-{SEQ}',
      generateOnFinalCreation: true,
      doNotReuse: true,
      allowManualOverride: false,
      lastAllocated: '',
      assignedThisYear: 0,
      allocations: [],
      isActive: true
    };
    this.dirty = true;
  }

  touch(): void {
    this.dirty = true;
  }

  /** Prefix / separator / year changed: rebuild the format string. */
  rebuild(): void {
    const d = this.draft;
    if (!d) return;
    d.format = [d.prefix, d.yearFormat ? `{${d.yearFormat}}` : '', '{SEQ}'].filter(Boolean).join(d.separator);
    this.dirty = true;
  }

  setStarting(): void {
    const d = this.draft;
    if (!d) return;
    if (!d.allocations.length) d.runningNumber = d.startingNumber;
    this.dirty = true;
  }

  toggleActive(): void {
    if (!this.draft) return;
    this.draft.isActive = !this.draft.isActive;
    this.draft.status = this.draft.isActive ? 'Active' : 'Inactive';
    this.dirty = true;
  }

  render(d: NumberingSequence, n: number, date = new Date()): string {
    const y = String(date.getFullYear());
    return (d.format || '')
      .replace(/\{YYYY\}/g, y)
      .replace(/\{YY\}/g, y.slice(2))
      .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
      .replace(/\{PREFIX\}/g, d.prefix)
      .replace(/\{SEQ\}/g, String(Math.max(0, n || 0)).padStart(d.sequenceDigits || 1, '0'));
  }

  counter(d: NumberingSequence): string {
    return String(d.runningNumber).padStart(d.sequenceDigits || 1, '0');
  }

  nextThree(d: NumberingSequence): string[] {
    return [0, 1, 2].map((i) => this.render(d, d.runningNumber + i));
  }

  resetDate(d: NumberingSequence): Date | null {
    const now = new Date();
    if (d.resetFrequency === 'Annually') return new Date(now.getFullYear() + 1, 0, 1);
    if (d.resetFrequency === 'Monthly') return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return null;
  }

  resetLabel(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  tokens(d: NumberingSequence): { label: string; cls: string }[] {
    const out = [{ label: `Prefix: ${d.prefix || '—'}`, cls: 'tok tok--p' }];
    if (d.yearFormat) out.push({ label: `Year: {${d.yearFormat}}`, cls: 'tok tok--y' });
    out.push({ label: 'Sequence: {SEQ}', cls: 'tok tok--s' });
    return out;
  }

  validation(d: NumberingSequence): ValidationRow[] {
    const formatOk = /\{SEQ\}/.test(d.format);
    const conflict = d.isActive
      ? this.store.items().find((s) => s.isActive && s.numberType === d.numberType && s.id !== d.id)
      : undefined;
    const per = d.scope === 'Site-wide' ? 'site' : 'tenant';
    const missing = [
      !d.numberType && 'record type',
      !d.sequenceDigits && 'sequence digits',
      !d.resetFrequency && 'reset rule',
      !d.scope && 'scope',
      !d.timezone && 'timezone'
    ].filter(Boolean);
    return [
      ...(missing.length ? [{ ok: false, text: `Select ${missing.join(', ')}` }] : []),
      { ok: formatOk, text: formatOk ? 'Format valid' : 'Format must contain {SEQ}' },
      {
        ok: !conflict,
        text: conflict ? `Conflicts with active sequence "${conflict.sequenceName}"` : 'No conflicting active sequence'
      },
      { ok: !!d.prefix.trim(), text: d.prefix.trim() ? `Uniqueness enforced per ${per}` : 'Prefix is required for uniqueness' }
    ];
  }

  isValid(d: NumberingSequence): boolean {
    return this.validation(d).every((v) => v.ok) && !!d.sequenceName.trim();
  }

  recent(d: NumberingSequence): SequenceAllocation[] {
    return [...d.allocations].sort((a, b) => b.allocatedAt.localeCompare(a.allocatedAt)).slice(0, 5);
  }

  get logRows(): LogRow[] {
    return this.store
      .items()
      .flatMap((s) => (s.allocations ?? []).map((a) => ({ ...a, sequenceName: s.sequenceName })))
      .sort((a, b) => b.allocatedAt.localeCompare(a.allocatedAt));
  }

  exportLog(): void {
    downloadCsv(
      'allocation-log.csv',
      this.logRows.map((r) => ({
        Reference: r.reference,
        Record: r.record,
        Sequence: r.sequenceName,
        'Allocated At': fmtDateTime(r.allocatedAt),
        Status: r.state
      }))
    );
  }

  cancel(): void {
    const orig = this.store.byId(this.selectedId());
    if (orig) this.select(orig);
    else {
      this.draft = null;
      const first = this.store.items()[0];
      if (first) this.select(first);
      else this.selectedId.set(null);
    }
  }

  save(): void {
    const d = this.draft;
    if (!d || this.saving) return;
    if (!this.isValid(d)) {
      this.flash('Fix the validation issues before saving.');
      return;
    }
    this.saving = true;
    const { id, ...rest } = d;
    this.store.save(id ? d : rest).subscribe({
      next: (saved) => {
        this.saving = false;
        this.select(saved);
        this.flash('Sequence saved.');
      },
      error: (err) => {
        this.saving = false;
        this.flash(apiErrorMessage(err));
      }
    });
  }

  duplicate(s: NumberingSequence): void {
    this.menuFor = null;
    this.selectedId.set('');
    this.draft = {
      ...structuredClone(s),
      id: '',
      sequenceCode: '',
      sequenceName: `${s.sequenceName} (copy)`,
      isActive: false,
      status: 'Inactive',
      allocations: [],
      lastAllocated: '',
      assignedThisYear: 0,
      runningNumber: s.startingNumber
    };
    this.dirty = true;
  }

  remove(s: NumberingSequence): void {
    this.confirmDelete = null;
    this.menuFor = null;
    this.store.remove(s.id).subscribe({
      next: () => {
        if (this.selectedId() === s.id) {
          this.draft = null;
          const first = this.store.items()[0];
          if (first) this.select(first);
          else this.selectedId.set(null);
        }
        this.flash('Sequence deleted.');
      },
      error: (err) => this.flash(apiErrorMessage(err))
    });
  }

  lastEdited(d: NumberingSequence): string {
    return fmtDate(d.updatedAt || d.createdAt);
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3000);
  }
}
