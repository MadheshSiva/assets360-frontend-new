import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  ChevronRight,
  History,
  Info,
  PenLine,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { Inspection, SignatureAndStamp } from '../shared/inspection.models';
import { fmtDate, fmtTime, initials, pillClass } from '../shared/insp-utils';
import { POSITIONS, ReportPlacement } from './report-placement';
import { SignaturePad } from './signature-pad';
import { SignoffPanel } from './signoff-panel';
import { SignoffRules } from './signoff-rules';
import { SigningHistory } from './signing-history';
import { StampSeal } from './stamp-seal';

type Tab = 'signatures' | 'rules' | 'history';

@Component({
  selector: 'app-insp-signatures-stamps',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, StampSeal, SignaturePad, SignoffPanel, ReportPlacement, SignoffRules, SigningHistory],
  templateUrl: './signatures-stamps.html',
  styleUrls: ['../shared/insp-page.css', './signatures-stamps.css']
})
export class SignaturesStampsPage implements OnInit {
  readonly icons = { ChevronRight, History, Info, PenLine, Pencil, Plus, Search, Trash2, Upload, X };
  readonly api = inject(InspectionApi);
  readonly store = this.api.signatures;
  readonly pillClass = pillClass;
  readonly initials = initials;
  readonly fmtDate = fmtDate;
  readonly subtabs: { key: Tab; label: string }[] = [
    { key: 'signatures', label: 'Signatures & Stamps' },
    { key: 'rules', label: 'Sign-off Rules' },
    { key: 'history', label: 'Signing History' }
  ];
  readonly roles = ['Inspector', 'Supervisor', 'Approver', 'Quality Manager', 'Site Manager'];

  tab: Tab = 'signatures';
  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly signatures = computed(() => this.store.items().filter((r) => r.kind !== 'Stamp'));
  readonly stamps = computed(() => this.store.items().filter((r) => r.kind === 'Stamp'));
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.signatures().filter(
      (s) => !q || `${s.user} ${s.signatureName} ${s.role} ${s.authorizedRole} ${s.department}`.toLowerCase().includes(q)
    );
  });
  /** Most recent inspection that carries sign-off steps. */
  readonly signOffInspection = computed<Inspection | undefined>(() => {
    const stamp = (i: Inspection) => i.completedAt || i.updatedAt || i.startedAt || i.dueDate || i.createdAt || '';
    return this.api.inspections
      .items()
      .filter((i) => i.signOff?.length)
      .sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
  });

  draft: SignatureAndStamp | null = null;
  dirty = false;
  saving = false;
  mode: 'draw' | 'upload' = 'upload';
  padOpen = false;
  lastSynced = '';
  /** Drawer working copy: add or edit a signature / stamp. */
  form: SignatureAndStamp | null = null;
  formTitle = '';
  confirmDelete = false;
  readonly toast = signal<string | null>(null);

  constructor() {
    effect(() => {
      const first = this.signatures()[0];
      if (first && this.selectedId() === null) this.select(first);
    });
  }

  ngOnInit(): void {
    this.store.load();
    this.api.inspections.load();
    this.lastSynced = fmtTime(new Date().toISOString());
  }

  select(s: SignatureAndStamp): void {
    this.selectedId.set(s.id);
    const d = structuredClone(s);
    d.signaturePosition = d.signaturePosition || POSITIONS[0]!;
    d.stampPosition = d.stampPosition || POSITIONS[2]!;
    this.draft = d;
    this.dirty = false;
    this.padOpen = false;
    this.mode = 'upload';
  }

  touch(): void {
    this.dirty = true;
  }

  stampFor(code: string | null | undefined): SignatureAndStamp | undefined {
    return code ? this.stamps().find((s) => s.signatureCode === code) : undefined;
  }

  displayName(s: SignatureAndStamp): string {
    return s.user || s.signatureName;
  }

  // ===== Specimen =====
  setMode(m: 'draw' | 'upload'): void {
    this.mode = m;
    this.padOpen = m === 'draw';
  }

  onDrawn(dataUrl: string): void {
    if (!this.draft) return;
    this.draft.signatureImage = dataUrl;
    this.padOpen = false;
    this.dirty = true;
  }

  replace(fileInput: HTMLInputElement): void {
    if (this.mode === 'draw') this.padOpen = true;
    else fileInput.click();
  }

  /** PNG / SVG -> data URL into the given field of the given record. */
  readImage(event: Event, target: SignatureAndStamp | null, field: 'signatureImage' | 'stampImage'): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file || !target) return;
    if (!/image\/(png|svg\+xml)/.test(file.type)) {
      this.flash('Accepted formats are PNG and SVG.');
      return;
    }
    if (file.size > 1024 * 1024) {
      this.flash('Image must be 1 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      target[field] = String(reader.result);
      if (target === this.draft) this.dirty = true;
    };
    reader.readAsDataURL(file);
  }

  clearSpecimen(): void {
    if (!this.draft) return;
    this.draft.signatureImage = '';
    this.dirty = true;
  }

  // ===== Drawers =====
  private blank(kind: string): SignatureAndStamp {
    return {
      id: '',
      status: 'Active',
      createdBy: null,
      createdAt: null,
      updatedBy: null,
      updatedAt: null,
      clientId: null,
      tenantId: null,
      signatureCode: this.nextCode(kind),
      kind,
      user: '',
      signatureName: '',
      role: '',
      department: '',
      authorizedRole: '',
      signatureImage: '',
      stampImage: '',
      assignedStampCode: '',
      effectiveDate: new Date().toISOString().slice(0, 10),
      expiryDate: null,
      signaturePosition: POSITIONS[0]!,
      stampPosition: POSITIONS[2]!,
      includeSignerNameDate: true,
      requirePasswordConfirmationBeforeSigning: true,
      isActive: true
    };
  }

  private nextCode(kind: string): string {
    const prefix = kind === 'Stamp' ? 'STP' : 'SIG';
    const max = this.store
      .items()
      .map((r) => new RegExp(`^${prefix}-(\\d+)$`).exec(r.signatureCode ?? ''))
      .reduce((m, x) => Math.max(m, x ? +x[1]! : 0), 0);
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  openAdd(kind: 'Signature' | 'Stamp'): void {
    this.form = this.blank(kind);
    this.formTitle = 'Add Signature / Stamp';
    this.confirmDelete = false;
  }

  setFormKind(kind: string): void {
    if (!this.form || this.form.id) return;
    const keep = { user: this.form.user, signatureName: this.form.signatureName, department: this.form.department };
    this.form = { ...this.blank(kind), ...keep };
  }

  editProfile(): void {
    if (!this.draft) return;
    this.form = structuredClone(this.draft);
    this.form.effectiveDate = this.form.effectiveDate?.slice(0, 10) ?? null;
    this.form.expiryDate = this.form.expiryDate?.slice(0, 10) ?? null;
    this.formTitle = 'Edit Profile';
    this.confirmDelete = false;
  }

  editStamp(s: SignatureAndStamp): void {
    this.form = structuredClone(s);
    this.form.effectiveDate = this.form.effectiveDate?.slice(0, 10) ?? null;
    this.form.expiryDate = this.form.expiryDate?.slice(0, 10) ?? null;
    this.formTitle = 'Edit Stamp';
    this.confirmDelete = false;
  }

  formValid(f: SignatureAndStamp): boolean {
    return f.kind === 'Stamp' ? !!f.signatureName.trim() : !!f.user.trim() && (!!f.id || (!!f.role && !!f.authorizedRole));
  }

  saveForm(): void {
    const f = this.form;
    if (!f || !this.formValid(f) || this.saving) return;
    if (f.kind !== 'Stamp' && !f.signatureName.trim()) f.signatureName = f.user;
    f.status = f.isActive ? 'Active' : 'Inactive';
    // Editing the selected profile keeps unsaved specimen / placement edits from the page
    const record: SignatureAndStamp =
      this.draft && f.id && f.id === this.draft.id
        ? {
            ...f,
            signatureImage: this.draft.signatureImage,
            assignedStampCode: this.draft.assignedStampCode,
            signaturePosition: this.draft.signaturePosition,
            stampPosition: this.draft.stampPosition,
            includeSignerNameDate: this.draft.includeSignerNameDate
          }
        : f;
    const { id, ...rest } = record;
    this.saving = true;
    this.store.save(id ? record : rest).subscribe({
      next: (saved) => {
        this.saving = false;
        this.form = null;
        if (saved.kind !== 'Stamp' && (!id || id === this.draft?.id)) this.select(saved);
        this.synced();
        this.flash(id ? 'Changes saved.' : `${saved.kind === 'Stamp' ? 'Stamp' : 'Signature'} added.`);
      },
      error: (err) => {
        this.saving = false;
        this.flash(apiErrorMessage(err));
      }
    });
  }

  removeForm(): void {
    const f = this.form;
    if (!f?.id) return;
    this.store.remove(f.id).subscribe({
      next: () => {
        this.form = null;
        this.confirmDelete = false;
        if (this.draft?.id === f.id) {
          this.draft = null;
          const first = this.signatures()[0];
          if (first) this.select(first);
          else this.selectedId.set(null);
        }
        if (this.draft?.assignedStampCode === f.signatureCode) this.draft.assignedStampCode = '';
        this.flash('Record deleted.');
      },
      error: (err) => this.flash(apiErrorMessage(err))
    });
  }

  // ===== Footer =====
  cancel(): void {
    const orig = this.store.byId(this.selectedId());
    if (orig) this.select(orig);
  }

  save(): void {
    const d = this.draft;
    if (!d || this.saving) return;
    this.saving = true;
    this.store.save(d).subscribe({
      next: (saved) => {
        this.saving = false;
        this.select(saved);
        this.synced();
        this.flash('Signature settings saved.');
      },
      error: (err) => {
        this.saving = false;
        this.flash(apiErrorMessage(err));
      }
    });
  }

  private synced(): void {
    this.lastSynced = fmtTime(new Date().toISOString());
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3000);
  }
}
