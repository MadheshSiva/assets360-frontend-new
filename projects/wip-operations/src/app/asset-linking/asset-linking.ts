import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Box,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardList,
  Database,
  Download,
  EllipsisVertical,
  ExternalLink,
  Factory,
  FileText,
  House,
  Info,
  Layers,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
  Unlink,
  UserRound,
  Wrench,
  X,
} from 'lucide-angular';
import { Allocation, AssetLink, JobRef, LinkHistory, RegisterAsset } from './asset-link.model';

type Tab = 'linked' | 'available' | 'history' | 'readiness';

interface Check {
  label: string;
  detail: string;
  ok: boolean;
}

interface LinkForm {
  query: string;
  role: string;
  stage: string;
  task: string;
  start: string;
  end: string;
}

interface ConfigDraft {
  role: string;
  stage: string;
  task: string;
  start: string;
  end: string;
  allocation: Allocation;
  requiredForStart: boolean;
  releaseOnCompletion: boolean;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];
/** Capabilities each stage needs from linked assets; filled from the template/routing API once wired. */
const STAGE_NEEDS: Record<string, string[]> = {};

/** Asset register, links, history and job list are kept in memory; empty until the asset register and WIP APIs are wired up. */
const ASSETS: RegisterAsset[] = [];
let LINKS: AssetLink[] = [];
const HISTORY: LinkHistory[] = [];
const JOB_LIST: JobRef[] = [];
/** Placeholder job while no job orders exist. */
const NO_JOB: JobRef = { code: '', name: '', status: '', site: '', templateCode: '', templateVersion: '', stages: [] };

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

const addDays = (date: string, days: number) => {
  const d = parseLocal(date);
  return stamp(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)).slice(0, 10);
};

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;

@Component({
  selector: 'app-asset-linking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './asset-linking.html',
  // Buttons, controls, tabs, switches, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './asset-linking.css', '../shared/wip-purple-theme.css'],
})
export class AssetLinking implements OnDestroy {
  readonly icons = {
    Box, CalendarClock, ChevronDown, ChevronRight, CircleCheck, CircleX, ClipboardList, Database, Download, EllipsisVertical, ExternalLink, Factory, FileText, House, Info, Layers, Link2, MapPin, Pencil,
    Plus, Search, TriangleAlert, Unlink, UserRound, Wrench, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'linked', label: 'Linked Assets' },
    { key: 'available', label: 'Available Assets' },
    { key: 'history', label: 'Assignment History' },
    { key: 'readiness', label: 'Readiness & Conflicts' },
  ];
  readonly roles = ['Production Equipment', 'Tool', 'Test Equipment', 'Handling Equipment', 'Measuring Equipment'];
  readonly jobs = JOB_LIST;
  readonly assets = ASSETS;

  @ViewChild('assetInput') assetInput?: ElementRef<HTMLInputElement>;

  jobCode = JOB_LIST[0]?.code ?? '';
  tab: Tab = 'linked';

  // Linked table filters
  search = '';
  stageFilter = '';
  roleFilter = '';
  // Available tab filters
  availSearch = '';
  availCategory = '';

  selectedId = 0;
  draft: ConfigDraft = { role: '', stage: '', task: '', start: '', end: '', allocation: 'Exclusive', requiredForStart: false, releaseOnCompletion: true };
  configError = '';
  /** Link Configuration shows values until Edit is clicked. */
  editingConfig = false;
  /** Link whose row menu is open. */
  menuFor: number | null = null;
  readonly collapsed = new Set<string>();

  form: LinkForm = this.blankForm();
  formError = '';
  /** Result of "Check Availability" for the form (null until checked). */
  formChecks: Check[] | null = null;

  profileOf: RegisterAsset | null = null;
  inspectionOf: RegisterAsset | null = null;
  inspectionForm = { certificate: '', validTo: '', inspectedBy: '' };
  inspectionError = '';
  confirmUnlink = false;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?asset=PTB-003 (and optional ?job=) opens a link (links from other pages)
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const job = p.get('job');
        if (job && this.jobs.some((j) => j.code === job)) this.setJob(job);
        const tag = p.get('asset');
        if (!tag) return;
        const l = this.links.find((x) => x.asset === tag) ?? LINKS.find((x) => x.asset === tag);
        if (l) {
          if (l.job !== this.jobCode) this.setJob(l.job);
          this.select(l);
        } else if (this.asset(tag)) {
          this.tab = 'available';
          this.availSearch = tag;
        }
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  get now(): string {
    return stamp(new Date());
  }

  isKnownJob(job: string): boolean {
    return KNOWN_JOBS.includes(job);
  }

  // ===== Job =====

  get job(): JobRef {
    return this.jobs.find((j) => j.code === this.jobCode) ?? this.jobs[0] ?? NO_JOB;
  }

  setJob(code: string): void {
    this.jobCode = code;
    this.stageFilter = this.roleFilter = this.search = '';
    this.form = this.blankForm();
    this.formChecks = null;
    const first = this.links[0];
    if (first) this.select(first);
    else this.selectedId = 0;
  }

  get stageNames(): string[] {
    return this.job.stages.map((s) => s.name);
  }

  tasksOf(stage: string): string[] {
    return this.job.stages.find((s) => s.name === stage)?.tasks.map((t) => t.name) ?? [];
  }

  stageStatus(stage: string): string {
    return this.job.stages.find((s) => s.name === stage)?.status ?? '';
  }

  // ===== Lookups =====

  asset(tag: string): RegisterAsset | undefined {
    return this.assets.find((a) => a.tag === tag);
  }

  link(id: number): AssetLink | undefined {
    return LINKS.find((l) => l.id === id);
  }

  get links(): AssetLink[] {
    return LINKS.filter((l) => l.job === this.jobCode);
  }

  get selected(): AssetLink | undefined {
    const l = this.link(this.selectedId);
    return l && l.job === this.jobCode ? l : undefined;
  }

  get selectedAsset(): RegisterAsset | undefined {
    return this.selected && this.asset(this.selected.asset);
  }

  get rows(): AssetLink[] {
    const q = this.search.trim().toLowerCase();
    return this.links.filter((l) => {
      const a = this.asset(l.asset);
      return (!this.stageFilter || l.stage === this.stageFilter) && (!this.roleFilter || l.role === this.roleFilter) && (!q || `${l.asset} ${a?.name} ${l.task} ${a?.location}`.toLowerCase().includes(q));
    });
  }

  /** Stages that have links, in job order, for the association tree. */
  get tree(): { stage: string; status: string; links: AssetLink[] }[] {
    return this.job.stages.map((s) => ({ stage: s.name, status: s.status, links: this.links.filter((l) => l.stage === s.name) })).filter((n) => n.links.length);
  }

  toggleNode(stage: string): void {
    if (this.collapsed.has(stage)) this.collapsed.delete(stage);
    else this.collapsed.add(stage);
  }

  // ===== Readiness =====

  private capabilityFor(a: RegisterAsset, stage: string): string {
    const needs = STAGE_NEEDS[stage] ?? [];
    return needs.find((n) => a.capabilities.includes(n)) ?? needs[0] ?? '';
  }

  private fmtDate(date: string): string {
    return parseLocal(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmtBooking(start: string, end: string): string {
    if (!start || !end) return '—';
    const mins = Math.round((parseLocal(end).getTime() - parseLocal(start).getTime()) / 60_000);
    const len = mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : mins > 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    const sameDay = start.slice(0, 10) === end.slice(0, 10);
    return `${this.fmtDate(start)} ${start.slice(11)} – ${sameDay ? '' : this.fmtDate(end) + ' '}${end.slice(11)} (${len})`;
  }

  /** Bookings on the asset that clash with [start, end], ignoring `exceptId`. */
  conflictsFor(tag: string, start: string, end: string, allocation: Allocation, exceptId = 0): string[] {
    const a = this.asset(tag);
    if (!a) return [];
    const range = { start, end };
    const out = a.bookings.filter((b) => overlaps(b, range)).map((b) => `${b.label} ${b.start.slice(11)}–${b.end.slice(11)}`);
    for (const l of LINKS) {
      if (l.id === exceptId || l.asset !== tag || !overlaps(l, range)) continue;
      if (allocation === 'Shared' && l.allocation === 'Shared') continue;
      out.push(`${l.job} · ${l.stage} ${l.start.slice(11)}–${l.end.slice(11)}`);
    }
    return out;
  }

  checksFor(a: RegisterAsset, stage: string, capability: string, start: string, end: string, allocation: Allocation, exceptId = 0): Check[] {
    const endDay = (end || start).slice(0, 10);
    const nextService = addDays(a.lastServiced, a.serviceIntervalDays);
    const checks: Check[] = [];
    if (a.status === 'Under Maintenance') checks.push({ label: 'Asset under maintenance', detail: 'Not available for job use', ok: false });
    checks.push(
      nextService >= endDay
        ? { label: 'Maintenance up to date', detail: `Last serviced ${this.fmtDate(a.lastServiced)}`, ok: true }
        : { label: 'Maintenance overdue', detail: `Service was due ${this.fmtDate(nextService)}`, ok: false },
    );
    if (a.calibrationValidTo) {
      checks.push(
        a.calibrationValidTo >= endDay
          ? { label: `Calibration valid to ${this.fmtDate(a.calibrationValidTo)}`, detail: a.calibratedOn ? `Calibrated on ${this.fmtDate(a.calibratedOn)}` : 'Calibration certificate on file', ok: true }
          : { label: 'Calibration expired', detail: `Expired ${this.fmtDate(a.calibrationValidTo)}`, ok: false },
      );
    }
    if (a.inspection) {
      checks.push(
        a.inspection.validTo >= endDay
          ? { label: 'Inspection certificate valid', detail: `${a.inspection.certificate}, valid to ${this.fmtDate(a.inspection.validTo)}`, ok: true }
          : { label: 'Inspection certificate expired', detail: `${a.inspection.certificate} expired ${this.fmtDate(a.inspection.validTo)}`, ok: false },
      );
    }
    if (capability) {
      checks.push(
        a.capabilities.includes(capability)
          ? { label: 'Required capability matched', detail: capability, ok: true }
          : { label: 'Required capability missing', detail: `${stage} needs ${capability}`, ok: false },
      );
    }
    const clashes = start && end ? this.conflictsFor(a.tag, start, end, allocation, exceptId) : [];
    checks.push(
      clashes.length
        ? { label: 'Booking conflict', detail: clashes.join('; '), ok: false }
        : { label: 'No booking conflict for selected period', detail: this.fmtBooking(start, end), ok: true },
    );
    return checks;
  }

  linkChecks(l: AssetLink): Check[] {
    const a = this.asset(l.asset);
    return a ? this.checksFor(a, l.stage, l.capability, l.start, l.end, l.allocation, l.id) : [];
  }

  isReady(l: AssetLink): boolean {
    return this.linkChecks(l).every((c) => c.ok);
  }

  failing(l: AssetLink): Check[] {
    return this.linkChecks(l).filter((c) => !c.ok);
  }

  get kpiReady(): number {
    return this.links.filter((l) => this.isReady(l)).length;
  }

  get reviewLinks(): AssetLink[] {
    return this.links.filter((l) => !this.isReady(l));
  }

  /** Review alert text, e.g. "LH-004 inspection certificate expired. Resolve before use." */
  reviewText(l: AssetLink): string {
    const f = this.failing(l)[0];
    return f ? `${l.asset} ${f.label.charAt(0).toLowerCase() + f.label.slice(1)}. Resolve before use.` : '';
  }

  needsInspection(l: AssetLink): boolean {
    return this.failing(l).some((c) => c.label.startsWith('Inspection'));
  }

  // ===== Selection & configuration =====

  private toDraft(l: AssetLink): ConfigDraft {
    return { role: l.role, stage: l.stage, task: l.task, start: l.start, end: l.end, allocation: l.allocation, requiredForStart: l.requiredForStart, releaseOnCompletion: l.releaseOnCompletion };
  }

  select(l: AssetLink): void {
    if (l.id !== this.selectedId && this.configDirty) this.showToast(`Unsaved changes to ${this.selected?.asset} were discarded.`);
    this.selectedId = l.id;
    this.draft = this.toDraft(l);
    this.configError = '';
    this.confirmUnlink = false;
    this.editingConfig = false;
  }

  // ===== Row menu & look =====

  /** Picture for an asset; register photos are not wired up yet, so each category has an illustration. */
  imageOf(tag: string): string {
    const c = this.asset(tag)?.category ?? '';
    const file = { 'Production Equipment': 'fixture', Tool: 'torque-tool', 'Test Equipment': 'test-bench', 'Handling Equipment': 'hoist' }[c] ?? 'fixture';
    return `wip/assets/${file}.svg`;
  }

  /** Card colour for a stage in the association diagram. */
  stageTone(stage: string): string {
    return { Preparation: 'tone--amber', Assembly: 'tone--blue', Testing: 'tone--purple', Inspection: 'tone--green', Packing: 'tone--grey' }[stage] ?? 'tone--grey';
  }

  toggleMenu(l: AssetLink, event: Event): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === l.id ? null : l.id;
  }

  rowAction(l: AssetLink, action: 'view' | 'edit' | 'profile' | 'unlink'): void {
    this.menuFor = null;
    this.select(l);
    if (action === 'edit') this.editingConfig = true;
    if (action === 'profile') {
      const a = this.asset(l.asset);
      if (a) this.openProfile(a);
    }
    if (action === 'unlink') this.confirmUnlink = true;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuFor = null;
  }

  cancelEdit(): void {
    const l = this.selected;
    if (l) this.draft = this.toDraft(l);
    this.editingConfig = false;
    this.configError = '';
  }

  get configDirty(): boolean {
    const l = this.selected;
    return !!l && JSON.stringify(this.draft) !== JSON.stringify(this.toDraft(l));
  }

  onDraftStage(): void {
    const tasks = this.tasksOf(this.draft.stage);
    if (!tasks.includes(this.draft.task)) this.draft.task = '';
  }

  /** Checks for the draft configuration (what Save Changes would give). */
  get draftChecks(): Check[] {
    const l = this.selected;
    const a = this.selectedAsset;
    if (!l || !a) return [];
    const cap = this.draft.stage === l.stage ? l.capability : this.capabilityFor(a, this.draft.stage);
    return this.checksFor(a, this.draft.stage, cap, this.draft.start, this.draft.end, this.draft.allocation, l.id);
  }

  saveConfig(): void {
    const l = this.selected;
    const a = this.selectedAsset;
    const d = this.draft;
    if (!l || !a) return;
    if (!d.start || !d.end || d.end <= d.start) return void (this.configError = 'The booking end must be after the start.');
    const clash = this.conflictsFor(a.tag, d.start, d.end, d.allocation, l.id);
    if (clash.length) return void (this.configError = `Booking conflict: ${clash.join('; ')}.`);
    if (!this.configDirty) return this.showToast('No changes to save.');
    this.configError = '';
    const capability = d.stage === l.stage ? l.capability : this.capabilityFor(a, d.stage);
    Object.assign(l, d, { capability });
    HISTORY.unshift({ at: this.now, job: l.job, asset: l.asset, action: 'Updated', by: CURRENT_USER, note: `${l.stage}${l.task ? ' · ' + l.task : ''} · ${this.fmtBooking(l.start, l.end)}` });
    this.editingConfig = false;
    this.showToast(`${a.name} ${a.tag} link updated.`);
  }

  unlink(): void {
    const l = this.selected;
    if (!l) return;
    if (!this.confirmUnlink) {
      this.confirmUnlink = true;
      return;
    }
    LINKS = LINKS.filter((x) => x !== l);
    HISTORY.unshift({ at: this.now, job: l.job, asset: l.asset, action: 'Unlinked', by: CURRENT_USER, note: `${l.stage} booking released` });
    this.confirmUnlink = false;
    const next = this.links[0];
    if (next) this.select(next);
    else this.selectedId = 0;
    this.showToast(`${l.asset} unlinked from ${l.job}. Asset ownership and custody are unchanged.`);
  }

  // ===== Link existing asset =====

  private blankForm(): LinkForm {
    const testing = this.stageNamesOf(this.jobCode).includes('Testing') ? 'Testing' : this.stageNamesOf(this.jobCode)[0] ?? '';
    const date = stamp(new Date()).slice(0, 10);
    return { query: '', role: '', stage: testing, task: '', start: `${date}T12:30`, end: `${date}T14:30` };
  }

  private stageNamesOf(code: string): string[] {
    return JOB_LIST.find((j) => j.code === code)?.stages.map((s) => s.name) ?? [];
  }

  /** Register assets at the job's site, shown in the asset search. */
  get siteAssets(): RegisterAsset[] {
    return this.assets.filter((a) => a.site === this.job.site);
  }

  /** The asset the search box names ("PTB-003" or "PTB-003 · Pump Test Bench"). */
  get formAsset(): RegisterAsset | undefined {
    const q = this.form.query.trim().toLowerCase();
    if (!q) return undefined;
    const tag = q.split(/\s*·\s*/)[0];
    return this.siteAssets.find((a) => a.tag.toLowerCase() === tag) ?? (this.siteAssets.filter((a) => `${a.tag} ${a.name}`.toLowerCase().includes(q)).length === 1 ? this.siteAssets.find((a) => `${a.tag} ${a.name}`.toLowerCase().includes(q)) : undefined);
  }

  onFormAsset(): void {
    this.formChecks = null;
    const a = this.formAsset;
    if (a && !this.form.role) this.form.role = this.roles.includes(a.category) ? a.category : this.roles[0];
  }

  onFormStage(): void {
    this.formChecks = null;
    if (!this.tasksOf(this.form.stage).includes(this.form.task)) this.form.task = '';
  }

  private fail(message: string): null {
    this.formError = message;
    return null;
  }

  private validateForm(): RegisterAsset | null {
    const f = this.form;
    const a = this.formAsset;
    if (!a) return this.fail('Choose an asset from the register.');
    if (!f.role || !f.stage || !f.start || !f.end) return this.fail('Fill in the link role, stage and booking times.');
    if (f.end <= f.start) return this.fail('The booking end must be after the start.');
    if (this.links.some((l) => l.asset === a.tag && l.stage === f.stage)) return this.fail(`${a.tag} is already linked to ${f.stage}.`);
    this.formError = '';
    return a;
  }

  checkAvailability(): void {
    const a = this.validateForm();
    if (!a) return;
    this.formChecks = this.checksFor(a, this.form.stage, this.capabilityFor(a, this.form.stage), this.form.start, this.form.end, 'Exclusive');
  }

  get formReady(): boolean {
    return !!this.formChecks && this.formChecks.every((c) => c.ok);
  }

  linkAsset(): void {
    const a = this.validateForm();
    if (!a) return;
    const f = this.form;
    const clash = this.conflictsFor(a.tag, f.start, f.end, 'Exclusive');
    if (clash.length) {
      this.formChecks = this.checksFor(a, f.stage, this.capabilityFor(a, f.stage), f.start, f.end, 'Exclusive');
      return void (this.formError = `Booking conflict: ${clash.join('; ')}. Choose another time or asset.`);
    }
    const id = Math.max(0, ...LINKS.map((l) => l.id)) + 1;
    const l: AssetLink = {
      id, job: this.jobCode, asset: a.tag, role: f.role, stage: f.stage, task: f.task, capability: this.capabilityFor(a, f.stage), start: f.start, end: f.end,
      allocation: 'Exclusive', requiredForStart: false, releaseOnCompletion: true, linkedAt: this.now, by: CURRENT_USER,
    };
    LINKS = [...LINKS, l];
    HISTORY.unshift({ at: this.now, job: l.job, asset: l.asset, action: 'Linked', by: CURRENT_USER, note: `${l.stage} · ${this.fmtBooking(l.start, l.end)}` });
    this.form = this.blankForm();
    this.formChecks = null;
    this.tab = 'linked';
    this.stageFilter = this.roleFilter = this.search = '';
    this.select(l);
    const issues = this.failing(l);
    this.showToast(issues.length ? `${a.tag} linked; it needs review: ${issues[0].label.toLowerCase()}.` : `${a.name} ${a.tag} linked to ${l.stage}.`, issues.length > 0);
  }

  /** Header "Link Asset" and the Available tab's Link buttons: fill the form and focus it. */
  startLink(a?: RegisterAsset): void {
    this.tab = 'linked';
    if (a) {
      this.form.query = `${a.tag} · ${a.name}`;
      this.form.role = '';
      this.onFormAsset();
    }
    setTimeout(() => {
      const el = this.assetInput?.nativeElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
    });
  }

  // ===== Available assets =====

  get categories(): string[] {
    return [...new Set(this.siteAssets.map((a) => a.category))];
  }

  get available(): RegisterAsset[] {
    const q = this.availSearch.trim().toLowerCase();
    return this.siteAssets.filter((a) => (!this.availCategory || a.category === this.availCategory) && (!q || `${a.tag} ${a.name} ${a.location} ${a.capabilities.join(' ')}`.toLowerCase().includes(q)));
  }

  linkedTo(a: RegisterAsset): AssetLink[] {
    return LINKS.filter((l) => l.asset === a.tag);
  }

  isLinkedHere(a: RegisterAsset): boolean {
    return this.links.some((l) => l.asset === a.tag);
  }

  /** Asset-level readiness (no booking window): maintenance, calibration, inspection, status. */
  assetIssues(a: RegisterAsset): string[] {
    const day = this.now.slice(0, 10);
    return this.checksFor(a, '', '', `${day}T00:00`, `${day}T00:00`, 'Shared')
      .filter((c) => !c.ok && c.label !== 'Booking conflict')
      .map((c) => c.label);
  }

  // ===== History & readiness tabs =====

  get history(): LinkHistory[] {
    return HISTORY.filter((h) => h.job === this.jobCode);
  }

  get allConflicts(): { link: AssetLink; clashes: string[] }[] {
    return this.links.map((link) => ({ link, clashes: this.conflictsFor(link.asset, link.start, link.end, link.allocation, link.id) })).filter((x) => x.clashes.length);
  }

  // ===== Dialogs =====

  openProfile(a: RegisterAsset): void {
    this.profileOf = a;
  }

  openInspection(tag: string): void {
    const a = this.asset(tag);
    if (!a) return;
    this.inspectionOf = a;
    this.inspectionError = '';
    this.inspectionForm = { certificate: '', validTo: '', inspectedBy: a.inspection?.inspectedBy ?? '' };
  }

  saveInspection(): void {
    const a = this.inspectionOf;
    const f = this.inspectionForm;
    if (!a) return;
    if (!f.certificate.trim() || !f.validTo || !f.inspectedBy.trim()) return void (this.inspectionError = 'Enter the certificate number, valid-to date and inspector.');
    if (f.validTo <= this.now.slice(0, 10)) return void (this.inspectionError = 'The new certificate must be valid after today.');
    a.inspection = { certificate: f.certificate.trim(), validTo: f.validTo, inspectedBy: f.inspectedBy.trim() };
    for (const l of this.linkedTo(a)) HISTORY.unshift({ at: this.now, job: l.job, asset: a.tag, action: 'Inspection recorded', by: CURRENT_USER, note: `${a.inspection.certificate}, valid to ${this.fmtDate(f.validTo)}` });
    this.inspectionOf = null;
    this.showToast(`Inspection ${a.inspection.certificate} recorded for ${a.tag}.`);
  }

  // ===== Export =====

  export(): void {
    const rows = this.links.map((l) => {
      const a = this.asset(l.asset);
      return {
        Job: l.job, Asset: l.asset, Name: a?.name ?? '', Category: a?.category ?? '', Role: l.role, Stage: l.stage, Task: l.task, Location: a?.location ?? '',
        'Booking Start': l.start.replace('T', ' '), 'Booking End': l.end.replace('T', ' '), Allocation: l.allocation, 'Required for Start': l.requiredForStart ? 'Yes' : 'No',
        Status: this.isReady(l) ? 'Ready' : 'Review', Issues: this.failing(l).map((c) => c.label).join('; '),
      };
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Linked Assets');
    XLSX.writeFile(book, `Asset_Links_${this.jobCode}.xlsx`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.profileOf = this.inspectionOf = null;
    this.confirmUnlink = false;
    this.menuFor = null;
    if (this.editingConfig) this.cancelEdit();
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
}
