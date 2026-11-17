import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Ban,
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  FileCheck2,
  FileText,
  House,
  Info,
  Pause,
  Play,
  Plus,
  Search,
  X,
} from 'lucide-angular';
import { CheckResult, ChecklistItem, Evidence, Permit, PermitEvent, PermitState } from './permit.model';

type Tab = 'register' | 'requirements' | 'risk' | 'approvals' | 'evidence' | 'history';

interface GateRow {
  label: string;
  ok: boolean;
}

interface RequestForm {
  type: string;
  job: string;
  stage: string;
  location: string;
  owner: string;
  validFrom: string;
  validUntil: string;
  scope: string;
  replaces: string;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];
/** A live permit this close to its end shows as "Expiring Soon". */
const EXPIRING_SOON_MIN = 120;
const GOOD_RESULTS: CheckResult[] = ['Verified', 'Valid', 'Complete'];

/** Permits and their history are kept in memory; empty until the permit service is wired up. */
const PERMITS: Permit[] = [];
const HISTORY: PermitEvent[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

const minutesBetween = (a: string, b: string) => Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 60_000);

@Component({
  selector: 'app-permit-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './permit-compliance.html',
  // Buttons, controls, tabs, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './permit-compliance.css', '../shared/wip-purple-theme.css'],
})
export class PermitCompliance implements OnDestroy {
  readonly icons = {
    ArrowRight, Ban, CalendarClock, CalendarPlus, CircleAlert, CircleCheck, CircleX, Clock, Download, FileCheck2, FileText, House, Info, Pause, Play, Plus, Search, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'register', label: 'Permit Register' },
    { key: 'requirements', label: 'Compliance Requirements' },
    { key: 'risk', label: 'Risk & Safety Checks' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'evidence', label: 'Certificates & Evidence' },
    { key: 'history', label: 'History' },
  ];
  readonly states: PermitState[] = ['Active', 'Expiring Soon', 'Expired', 'Awaiting Approval', 'Scheduled', 'Suspended', 'Rejected', 'Closed'];

  permits = PERMITS;
  tab: Tab = 'register';

  // Filters
  site = PERMITS[0]?.site ?? '';
  job = '';
  type = '';
  state: PermitState | '' = '';
  search = '';

  selectedId = PERMITS[0]?.id ?? '';

  // Dialogs
  requestForm: RequestForm | null = null;
  requestError = '';
  suspendFor: Permit | null = null;
  suspendReason = '';
  extendFor: Permit | null = null;
  extendUntil = '';
  extendReason = '';
  extendError = '';
  evidenceView: { permit: Permit; evidence: Evidence } | null = null;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?permit=PTW-00126 or ?job=JO-2026-00438 opens a permit (links from other pages)
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const id = p.get('permit');
        const job = p.get('job');
        const found = (id && this.find(id)) || (job && this.permits.find((x) => x.job === job && this.isLive(x))) || (job && this.permits.find((x) => x.job === job));
        if (found) {
          this.site = found.site;
          this.selectedId = found.id;
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

  find(id: string): Permit | undefined {
    return this.permits.find((p) => p.id === id);
  }

  // ===== State =====

  stateOf(p: Permit): PermitState {
    if (p.status !== 'Approved') return p.status;
    const now = this.now;
    if (p.validUntil <= now) return 'Expired';
    if (p.validFrom > now) return 'Scheduled';
    return minutesBetween(now, p.validUntil) <= EXPIRING_SOON_MIN ? 'Expiring Soon' : 'Active';
  }

  isLive(p: Permit): boolean {
    const s = this.stateOf(p);
    return s === 'Active' || s === 'Expiring Soon';
  }

  stateClass(s: PermitState): string {
    return (
      {
        Active: 'pill--green', 'Expiring Soon': 'pill--amber', Expired: 'pill--red', 'Awaiting Approval': 'pill--amber', Scheduled: 'pill--blue',
        Suspended: 'pill--red', Rejected: 'pill--grey', Closed: 'pill--grey',
      } as Record<PermitState, string>
    )[s];
  }

  resultOk(r: CheckResult): boolean {
    return GOOD_RESULTS.includes(r);
  }

  // ===== Filters =====

  get sites(): string[] {
    return [...new Set(this.permits.map((p) => p.site))];
  }

  private get sitePermits(): Permit[] {
    return this.permits.filter((p) => p.site === this.site);
  }

  get jobs(): string[] {
    return [...new Set(this.sitePermits.map((p) => p.job))].sort();
  }

  get types(): string[] {
    return [...new Set(this.permits.map((p) => p.type))].sort();
  }

  onSite(): void {
    this.job = '';
  }

  get rows(): Permit[] {
    const q = this.search.trim().toLowerCase();
    return this.sitePermits.filter(
      (p) =>
        (!this.job || p.job === this.job) &&
        (!this.type || p.type === this.type) &&
        (!this.state || this.stateOf(p) === this.state) &&
        (!q || `${p.id} ${p.type} ${p.job} ${p.stage} ${p.location} ${p.owner}`.toLowerCase().includes(q)),
    );
  }

  // ===== KPIs =====

  get kpiActive(): number {
    return this.sitePermits.filter((p) => this.isLive(p)).length;
  }

  get kpiAwaiting(): number {
    return this.sitePermits.filter((p) => p.status === 'Awaiting Approval').length;
  }

  get kpiExpiringToday(): number {
    const day = this.now.slice(0, 10);
    return this.sitePermits.filter((p) => this.isLive(p) && p.validUntil.slice(0, 10) === day).length;
  }

  /** Permits whose expiry or suspension stops a job stage (no live replacement of the same type yet). */
  get blocking(): Permit[] {
    return this.sitePermits.filter((p) => {
      const s = this.stateOf(p);
      if (s !== 'Expired' && s !== 'Suspended') return false;
      return !this.sitePermits.some((o) => o !== p && o.job === p.job && o.stage === p.stage && o.type === p.type && (this.isLive(o) || o.status === 'Awaiting Approval'));
    });
  }

  showState(s: PermitState | ''): void {
    this.tab = 'register';
    this.state = s;
    this.job = this.type = this.search = '';
  }

  showBlocked(): void {
    const b = this.blocking[0];
    if (!b) return this.showToast('No jobs are blocked by permits.');
    this.tab = 'register';
    this.state = this.job = this.type = this.search = '';
    this.selectedId = b.id;
  }

  // ===== Selection =====

  get selected(): Permit {
    return this.find(this.selectedId) ?? this.permits[0];
  }

  select(p: Permit): void {
    this.selectedId = p.id;
  }

  open(p: Permit): void {
    this.select(p);
    this.tab = 'register';
    if (!this.rows.includes(p)) {
      this.site = p.site;
      this.state = this.job = this.type = this.search = '';
    }
  }

  /** Job Authorization Gate for the selected permit's job stage. */
  gate(p: Permit): GateRow[] {
    return [
      { label: 'Permit active', ok: this.isLive(p) },
      { label: 'Risk assessment approved', ok: p.gate.riskAssessment && p.risk.status === 'Approved' },
      { label: 'Personnel qualified', ok: p.gate.personnelQualified },
      { label: 'Equipment calibration valid', ok: p.gate.calibrationValid },
      { label: 'Required isolations confirmed', ok: p.gate.isolationsConfirmed },
      { label: 'Supervisor release recorded', ok: p.gate.supervisorRelease },
    ];
  }

  authorized(p: Permit): boolean {
    return this.gate(p).every((g) => g.ok);
  }

  gateMessage(p: Permit): string {
    if (this.authorized(p)) return 'Authorized for the approved scope and validity period.';
    const s = this.stateOf(p);
    if (s === 'Expired') return 'Not authorized: the permit has expired.';
    if (s === 'Suspended') return 'Not authorized: the permit is suspended.';
    if (s === 'Awaiting Approval') return 'Not authorized yet: approvals are pending.';
    if (s === 'Scheduled') return `Not authorized yet: the permit starts ${p.validFrom.replace('T', ' ')}.`;
    return `Not authorized: ${this.gate(p).find((g) => !g.ok)!.label.toLowerCase()} is outstanding.`;
  }

  // ===== Workflow =====

  private log(p: Permit, action: string, note: string): void {
    HISTORY.unshift({ at: this.now, permit: p.id, action, by: CURRENT_USER, note });
  }

  openSuspend(p: Permit): void {
    this.suspendFor = p;
    this.suspendReason = '';
  }

  saveSuspend(): void {
    const p = this.suspendFor;
    if (!p || !this.suspendReason.trim()) return;
    p.status = 'Suspended';
    p.suspendReason = this.suspendReason.trim();
    this.log(p, 'Suspended', p.suspendReason);
    this.suspendFor = null;
    this.showToast(`${p.id} suspended. ${p.job} ${p.stage} is no longer authorized.`, true);
  }

  resume(p: Permit): void {
    if (p.validUntil <= this.now) return this.showToast(`${p.id} has expired; request a replacement permit instead.`, true);
    p.status = 'Approved';
    p.suspendReason = '';
    this.log(p, 'Resumed', 'Conditions reviewed; permit reinstated');
    this.showToast(`${p.id} resumed. Authorization is rechecked at stage start.`);
  }

  openExtend(p: Permit): void {
    this.extendFor = p;
    this.extendError = '';
    this.extendReason = '';
    const until = parseLocal(p.validUntil);
    this.extendUntil = stamp(new Date(until.getTime() + 2 * 3_600_000));
  }

  saveExtend(): void {
    const p = this.extendFor;
    if (!p) return;
    if (!this.extendUntil || this.extendUntil <= p.validUntil) return void (this.extendError = 'The new end must be after the current end.');
    if (minutesBetween(p.validUntil, this.extendUntil) > 24 * 60) return void (this.extendError = 'Extensions are limited to 24 hours; request a new permit for longer work.');
    if (!this.extendReason.trim()) return void (this.extendError = 'Enter the reason for the extension.');
    p.extension = { until: this.extendUntil, reason: this.extendReason.trim(), requestedBy: CURRENT_USER, at: this.now };
    this.log(p, 'Extension requested', `To ${this.extendUntil.replace('T', ' ')}: ${p.extension.reason}`);
    this.extendFor = null;
    this.showToast(`Extension for ${p.id} sent for approval (Approvals tab).`);
  }

  decideExtension(p: Permit, ok: boolean): void {
    const e = p.extension;
    if (!e) return;
    if (ok && p.validUntil <= this.now) {
      p.extension = null;
      this.log(p, 'Extension rejected', 'Permit expired before approval');
      return this.showToast(`${p.id} expired before approval. Expired permits cannot be extended.`, true);
    }
    if (ok) p.validUntil = e.until;
    p.extension = null;
    this.log(p, ok ? 'Extension approved' : 'Extension rejected', ok ? `Valid until ${e.until.replace('T', ' ')}` : e.reason);
    this.showToast(ok ? `${p.id} extended to ${e.until.replace('T', ' ')}.` : `Extension for ${p.id} rejected.`);
  }

  get pendingSteps(): { permit: Permit; step: string }[] {
    return this.sitePermits
      .filter((p) => p.status === 'Awaiting Approval')
      .flatMap((permit) => {
        // Steps are approved in order: show only the first pending one
        const next = permit.approvals.find((a) => a.status === 'Pending');
        return next ? [{ permit, step: next.step }] : [];
      });
  }

  get pendingExtensions(): Permit[] {
    return this.sitePermits.filter((p) => p.extension);
  }

  decideStep(p: Permit, step: string, ok: boolean): void {
    const a = p.approvals.find((x) => x.step === step);
    if (!a) return;
    a.status = ok ? 'Approved' : 'Rejected';
    a.by = CURRENT_USER;
    a.at = this.now;
    if (!ok) {
      p.status = 'Rejected';
      this.log(p, 'Rejected', `${step} rejected`);
      return this.showToast(`${p.id} rejected at ${step}.`, true);
    }
    if (step === 'Safety Review') p.risk = { ...p.risk, status: 'Approved', reviewedBy: CURRENT_USER };
    this.log(p, step, 'Approved');
    if (p.approvals.every((x) => x.status === 'Approved')) {
      p.status = 'Approved';
      p.gate.supervisorRelease = true;
      this.log(p, 'Approved', 'All approvals complete');
      this.showToast(`${p.id} approved. ${this.isLive(p) ? 'It is active now.' : 'It becomes active at ' + p.validFrom.replace('T', ' ') + '.'}`);
    } else {
      this.showToast(`${step} approved for ${p.id}.`);
    }
  }

  closePermit(p: Permit): void {
    const open = p.checklist.filter((c) => !this.resultOk(c.result));
    if (open.length) return this.showToast(`Complete the checklist before closing: ${open.map((c) => c.requirement).join(', ')}.`, true);
    p.status = 'Closed';
    this.log(p, 'Closed', 'Handback checks complete');
    this.showToast(`${p.id} closed after handback checks.`);
  }

  // ===== Checklist & evidence =====

  completeItem(p: Permit, c: ChecklistItem): void {
    c.result = 'Complete';
    this.log(p, 'Checklist', `${c.requirement} marked complete`);
  }

  attachEvidence(p: Permit, c: ChecklistItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    c.evidence = file.name;
    c.result = 'Valid';
    p.evidence = [...p.evidence, { kind: c.requirement, ref: file.name, validTo: '' }];
    if (/calibration|inspection|certificate/i.test(c.requirement)) p.gate.calibrationValid = true;
    this.log(p, 'Evidence', `${file.name} attached for ${c.requirement}`);
    this.showToast(`${file.name} attached to ${p.id}.`);
  }

  evidenceState(e: Evidence): 'No expiry' | 'Valid' | 'Expiring' | 'Expired' {
    if (!e.validTo) return 'No expiry';
    const today = this.now.slice(0, 10);
    if (e.validTo < today) return 'Expired';
    return minutesBetween(today, e.validTo) <= 30 * 24 * 60 ? 'Expiring' : 'Valid';
  }

  get evidenceRows(): { permit: Permit; evidence: Evidence }[] {
    return this.sitePermits.flatMap((permit) => permit.evidence.map((evidence) => ({ permit, evidence })));
  }

  get missingItems(): { permit: Permit; item: ChecklistItem }[] {
    return this.sitePermits.filter((p) => p.status !== 'Closed').flatMap((permit) => permit.checklist.filter((c) => c.result === 'Missing').map((item) => ({ permit, item })));
  }

  // ===== Requirements =====

  /** Requirements per permit type, with how many open permits of that type meet each one. */
  get requirementsByType(): { type: string; permits: number; items: { requirement: string; met: number }[] }[] {
    return this.types.map((type) => {
      const list = this.sitePermits.filter((p) => p.type === type && p.status !== 'Closed' && p.status !== 'Rejected');
      const names = [...new Set(this.permits.filter((p) => p.type === type).flatMap((p) => p.checklist.map((c) => c.requirement)))];
      return {
        type,
        permits: list.length,
        items: names.map((requirement) => ({ requirement, met: list.filter((p) => p.checklist.some((c) => c.requirement === requirement && this.resultOk(c.result))).length })),
      };
    });
  }

  // ===== History =====

  get history(): PermitEvent[] {
    const ids = new Set(this.sitePermits.map((p) => p.id));
    return HISTORY.filter((h) => ids.has(h.permit));
  }

  // ===== Request permit =====

  openRequest(from?: Permit): void {
    this.requestError = '';
    const now = parseLocal(this.now);
    const start = stamp(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0));
    const end = stamp(new Date(parseLocal(start).getTime() + 8 * 3_600_000));
    this.requestForm = {
      type: from?.type ?? this.types[0] ?? '', job: from?.job ?? '', stage: from?.stage ?? '', location: from?.location ?? '', owner: from?.owner ?? CURRENT_USER,
      validFrom: start, validUntil: end, scope: from ? from.scope : '', replaces: from?.id ?? '',
    };
  }

  saveRequest(): void {
    const f = this.requestForm;
    if (!f) return;
    if (!f.job.trim() || !f.stage.trim() || !f.location.trim()) return void (this.requestError = 'Enter the job order, stage and location.');
    if (!f.validFrom || !f.validUntil || f.validUntil <= f.validFrom) return void (this.requestError = 'The validity end must be after the start.');
    if (f.validUntil <= this.now) return void (this.requestError = 'The validity period has already ended.');
    const template = this.permits.find((p) => p.type === f.type);
    const n = Math.max(0, ...this.permits.map((p) => Number(p.id.slice(4)) || 0)) + 1;
    const id = `PTW-${String(n).padStart(5, '0')}`;
    const permit: Permit = {
      id, type: f.type, site: this.site, job: f.job.trim().toUpperCase(), stage: f.stage.trim(), asset: '', location: f.location.trim(), owner: f.owner.trim() || CURRENT_USER,
      issuingAuthority: template?.issuingAuthority ?? 'Safety Supervisor', validFrom: f.validFrom, validUntil: f.validUntil, status: 'Awaiting Approval',
      scope: f.scope.trim() || `${f.type} for ${f.job.trim().toUpperCase()} (${f.stage.trim()}).`, precautions: [...(template?.precautions ?? [])],
      approvals: [
        { step: 'Safety Review', status: 'Pending', by: '', at: '' },
        { step: 'Operations Release', status: 'Pending', by: '', at: '' },
      ],
      evidence: [],
      checklist: (template?.checklist ?? []).map((c) => ({ ...c, evidence: '', result: 'Pending' as CheckResult })),
      gate: { riskAssessment: true, personnelQualified: true, calibrationValid: true, isolationsConfirmed: true, supervisorRelease: false },
      risk: { ref: `RA-${String(n).padStart(5, '0')}`, hazards: [...(template?.risk.hazards ?? [])], controls: [...(template?.risk.controls ?? [])], rating: template?.risk.rating ?? 'Medium', status: 'Pending', reviewedBy: '' },
      extension: null, suspendReason: '', replaces: f.replaces,
    };
    this.permits.push(permit);
    this.log(permit, 'Requested', f.replaces ? `Replacement for ${f.replaces}` : `${f.type} for ${permit.job}`);
    this.requestForm = null;
    this.tab = 'register';
    this.state = this.job = this.type = this.search = '';
    this.selectedId = id;
    this.showToast(`${id} requested and sent for safety review.`);
  }

  // ===== Export =====

  export(): void {
    const rows = this.rows.map((p) => ({
      Permit: p.id, Type: p.type, Site: p.site, Job: p.job, Stage: p.stage, Location: p.location, Owner: p.owner, 'Issuing Authority': p.issuingAuthority,
      'Valid From': p.validFrom.replace('T', ' '), 'Valid Until': p.validUntil.replace('T', ' '), Status: this.stateOf(p), Authorized: this.authorized(p) ? 'Yes' : 'No',
      'Open Checklist Items': p.checklist.filter((c) => !this.resultOk(c.result)).map((c) => c.requirement).join('; '),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Permits');
    XLSX.writeFile(book, `Permits_${this.site.replace(/\s+/g, '_')}_${this.now.slice(0, 10)}.xlsx`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.requestForm = this.suspendFor = this.extendFor = this.evidenceView = null;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
}
