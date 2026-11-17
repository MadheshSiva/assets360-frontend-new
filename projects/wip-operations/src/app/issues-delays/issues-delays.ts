import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowUpRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  House,
  Image as ImageIcon,
  Info,
  KanbanSquare,
  Link2,
  List,
  OctagonAlert,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-angular';
import { ActionStatus, CorrectiveAction, Issue, IssueStatus, Severity } from './issue.model';

type Tab = 'register' | 'delays' | 'actions' | 'escalations' | 'history';

interface ReportForm {
  title: string;
  type: string;
  job: string;
  stage: string;
  task: string;
  asset: string;
  severity: Severity;
  priority: string;
  owner: string;
  responsible: string;
  blocking: boolean;
  description: string;
}

interface ActionForm {
  text: string;
  owner: string;
  due: string;
  mandatory: boolean;
}

interface EscalateForm {
  issue: Issue;
  level: string;
  to: string;
  reason: string;
}

interface DelayRow {
  issue: Issue;
  start: string;
  end: string;
  minutes: number;
}

interface ActionRow {
  issue: Issue;
  action: CorrectiveAction;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
/** Workflow steps shown in the stepper, by status. */
const STEPS: { label: string; status: IssueStatus }[] = [
  { label: 'Reported', status: 'Open' },
  { label: 'Investigating', status: 'Investigating' },
  { label: 'Action', status: 'Action in progress' },
  { label: 'Verification', status: 'Awaiting verification' },
  { label: 'Closed', status: 'Closed' },
];
const OPEN_STATUSES: IssueStatus[] = ['Open', 'Investigating', 'Action in progress', 'Awaiting verification'];
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];
/** Assets on the Asset Linking page; filled from the API once wired. */
const LINKED_ASSETS: string[] = [];

/** Issues are kept in memory; empty until the shared issue service is wired up. */
const ISSUES: Issue[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

const mins = (a: string, b: string) => Math.max(0, Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 60_000));

@Component({
  selector: 'app-issues-delays',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './issues-delays.html',
  // Buttons, controls, tabs, switches, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './issues-delays.css', '../shared/wip-purple-theme.css'],
})
export class IssuesDelays implements OnDestroy {
  readonly icons = {
    ArrowUpRight, CalendarClock, Check, CircleAlert, CircleCheck, Clock, Download, ExternalLink, FileText, House, ImageIcon, Info, KanbanSquare, Link2, List,
    OctagonAlert, Paperclip, Plus, Search, ShieldAlert, Timer, TriangleAlert, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'register', label: 'Issue Register' },
    { key: 'delays', label: 'Delay Analysis' },
    { key: 'actions', label: 'Corrective Actions' },
    { key: 'escalations', label: 'Escalations' },
    { key: 'history', label: 'Resolution History' },
  ];
  readonly steps = STEPS;
  readonly types = ['Equipment issue', 'Material shortage', 'Quality defect', 'Resource delay', 'Process deviation', 'Safety'];
  readonly severities: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
  readonly priorities = ['Urgent', 'High', 'Normal', 'Low'];
  /** Owner teams; filled from master data once the API is wired. */
  readonly teams: string[] = [];
  readonly actionStatuses: ActionStatus[] = ['Pending', 'In progress', 'Done'];
  readonly levels = ['Level 1', 'Level 2', 'Level 3'];

  issues = ISSUES;
  tab: Tab = 'register';
  board = false;

  // Filters
  search = '';
  site = ISSUES[0]?.site ?? '';
  type = '';
  severity: Severity | '' = '';
  /** "open" = every status before Closed. */
  status: IssueStatus | 'open' | '' = 'open';
  overdueOnly = false;
  blockingOnly = false;

  selectedId = ISSUES[0]?.id ?? '';

  // Dialogs and inline forms
  reportForm: ReportForm | null = null;
  reportError = '';
  actionForm: ActionForm | null = null;
  actionError = '';
  pauseFor: Issue | null = null;
  pauseReason = '';
  pauseError = '';
  escalateForm: EscalateForm | null = null;
  editingCause = false;
  causeDraft = '';
  resolutionError = '';

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // ?issue=IS-0087 opens an issue (links from other pages)
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const id = p.get('issue');
        const i = id && this.find(id);
        if (i) {
          this.selectedId = i.id;
          this.status = i.status === 'Closed' ? '' : 'open';
          this.site = i.site;
        }
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  get now(): string {
    return stamp(new Date());
  }

  private get today(): string {
    return this.now.slice(0, 10);
  }

  isKnownJob(job: string): boolean {
    return KNOWN_JOBS.includes(job);
  }

  isLinkedAsset(tag: string): boolean {
    return LINKED_ASSETS.includes(tag);
  }

  find(id: string): Issue | undefined {
    return this.issues.find((i) => i.id === id);
  }

  isOpen(i: Issue): boolean {
    return i.status !== 'Closed';
  }

  // ===== Filters =====

  get sites(): string[] {
    return [...new Set(this.issues.map((i) => i.site))];
  }

  private get siteIssues(): Issue[] {
    return this.issues.filter((i) => i.site === this.site);
  }

  get rows(): Issue[] {
    const q = this.search.trim().toLowerCase();
    return this.siteIssues
      .filter(
        (i) =>
          (!this.type || i.type === this.type) &&
          (!this.severity || i.severity === this.severity) &&
          (!this.blockingOnly || i.blocking) &&
          (!this.status || (this.status === 'open' ? this.isOpen(i) : i.status === this.status)) &&
          (!q || `${i.id} ${i.title} ${i.job} ${i.stage} ${i.owner} ${i.asset}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => this.delayToday(b) - this.delayToday(a) || a.id.localeCompare(b.id));
  }

  /** Board view: open statuses as columns. */
  get columns(): { status: IssueStatus; issues: Issue[] }[] {
    const rows = this.rows;
    return OPEN_STATUSES.map((status) => ({ status, issues: rows.filter((i) => i.status === status) }));
  }

  // ===== KPIs (selected site) =====

  get kpiOpen(): number {
    return this.siteIssues.filter((i) => this.isOpen(i)).length;
  }

  get kpiBlocking(): number {
    return this.siteIssues.filter((i) => this.isOpen(i) && i.blocking).length;
  }

  isOverdue(a: CorrectiveAction): boolean {
    return a.status !== 'Done' && a.due < this.now;
  }

  get kpiOverdue(): number {
    return this.actionRows.filter((r) => this.isOverdue(r.action)).length;
  }

  /** Minutes of delay today, merging overlapping delays on the same job so they count once. */
  get kpiDelayToday(): number {
    const day = this.today;
    const byJob = new Map<string, [number, number][]>();
    for (const i of this.siteIssues) {
      for (const d of i.delays) {
        const s = Math.max(parseLocal(d.start).getTime(), parseLocal(day).getTime());
        const e = parseLocal(d.end || this.now).getTime();
        if (e <= s || d.start.slice(0, 10) > day) continue;
        byJob.set(i.job, [...(byJob.get(i.job) ?? []), [s, e]]);
      }
    }
    let total = 0;
    for (const spans of byJob.values()) {
      spans.sort((a, b) => a[0] - b[0]);
      let [s, e] = spans[0];
      for (const [ns, ne] of spans.slice(1)) {
        if (ns <= e) e = Math.max(e, ne);
        else {
          total += e - s;
          [s, e] = [ns, ne];
        }
      }
      total += e - s;
    }
    return Math.round(total / 60_000);
  }

  showBlocking(): void {
    this.tab = 'register';
    this.status = 'open';
    this.type = this.severity = this.search = '';
    this.blockingOnly = true;
    const first = this.rows[0];
    if (first) this.select(first);
  }

  showOverdue(): void {
    this.tab = 'actions';
    this.overdueOnly = true;
  }

  // ===== Delay =====

  delayMinutes(i: Issue): number {
    return i.delays.reduce((t, d) => t + mins(d.start, d.end || this.now), 0);
  }

  delayToday(i: Issue): number {
    const day = this.today;
    return i.delays.filter((d) => d.start.slice(0, 10) === day).reduce((t, d) => t + mins(d.start, d.end || this.now), 0);
  }

  delayRunning(i: Issue): boolean {
    return i.delays.some((d) => !d.end);
  }

  delayStart(i: Issue): string {
    return i.delays[0]?.start ?? '';
  }

  fmtMin(m: number): string {
    return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
  }

  endDelay(i: Issue): void {
    const d = i.delays.find((x) => !x.end);
    if (!d) return;
    d.end = this.now;
    this.log(i, `Delay ended after ${mins(d.start, d.end)} min`);
    this.showToast(`Delay on ${i.job} ended. Job status is updated by the job order.`);
  }

  startDelay(i: Issue): void {
    if (this.delayRunning(i)) return;
    i.delays.push({ start: this.now, end: '' });
    this.log(i, 'Delay started');
    this.showToast(`Delay started on ${i.job} (${i.stage}).`);
  }

  get delayRows(): DelayRow[] {
    return this.siteIssues
      .flatMap((issue) => issue.delays.map((d) => ({ issue, start: d.start, end: d.end, minutes: mins(d.start, d.end || this.now) })))
      .sort((a, b) => b.start.localeCompare(a.start));
  }

  /** Delay minutes by issue type (last 7 days in the data), largest first. */
  get delayByType(): { type: string; minutes: number; pct: number }[] {
    const totals = new Map<string, number>();
    for (const r of this.delayRows) totals.set(r.issue.type, (totals.get(r.issue.type) ?? 0) + r.minutes);
    const max = Math.max(1, ...totals.values());
    return [...totals].map(([type, minutes]) => ({ type, minutes, pct: Math.round((minutes / max) * 100) })).sort((a, b) => b.minutes - a.minutes);
  }

  get delayTotal(): number {
    return this.delayRows.reduce((t, r) => t + r.minutes, 0);
  }

  // ===== Selection =====

  get selected(): Issue {
    return this.find(this.selectedId) ?? this.issues[0];
  }

  select(i: Issue): void {
    if (i.id === this.selectedId) return;
    this.selectedId = i.id;
    this.actionForm = null;
    this.editingCause = false;
    this.resolutionError = '';
  }

  open(i: Issue): void {
    this.select(i);
    this.tab = 'register';
    if (!this.rows.includes(i)) {
      this.status = this.isOpen(i) ? 'open' : '';
      this.type = this.severity = this.search = '';
    }
  }

  stepIndex(i: Issue): number {
    return STEPS.findIndex((s) => s.status === i.status);
  }

  severityClass(s: Severity): string {
    return s === 'Critical' || s === 'High' ? 'pill--red' : s === 'Medium' ? 'pill--amber' : 'pill--green';
  }

  statusClass(s: IssueStatus): string {
    return { Open: 'pill--grey', Investigating: 'pill--amber', 'Action in progress': 'pill--blue', 'Awaiting verification': 'pill--purple', Closed: 'pill--green' }[s];
  }

  actionClass(s: ActionStatus): string {
    return s === 'Done' ? 'c-good' : s === 'In progress' ? 'c-blue' : 'c-warn';
  }

  /** The job is held while a blocking issue is open. */
  jobOnHold(i: Issue): boolean {
    return this.isOpen(i) && i.blocking;
  }

  slaLabel(i: Issue): string {
    if (!this.isOpen(i)) return 'Stopped';
    if (i.slaPause === 'Approved') return 'Paused';
    return i.slaPause === 'Requested' ? 'Running (pause requested)' : i.slaTimer;
  }

  // ===== Workflow =====

  private log(i: Issue, text: string): void {
    i.history.push({ at: this.now, by: CURRENT_USER, text });
  }

  setActionStatus(i: Issue, a: CorrectiveAction, status: ActionStatus): void {
    a.status = status;
    this.log(i, `Action "${a.text}" set to ${status}`);
    if (status !== 'Pending' && (i.status === 'Open' || i.status === 'Investigating')) {
      i.status = 'Action in progress';
      this.log(i, 'Status changed to Action in progress');
    }
  }

  openAction(): void {
    this.actionError = '';
    this.actionForm = { text: '', owner: this.selected.owner, due: this.now.slice(11, 16), mandatory: true };
  }

  saveAction(): void {
    const f = this.actionForm;
    const i = this.selected;
    if (!f) return;
    if (!f.text.trim() || !f.owner.trim() || !/^\d{2}:\d{2}$/.test(f.due)) {
      this.actionError = 'Enter the action, owner and due time.';
      return;
    }
    const id = Math.max(0, ...this.issues.flatMap((x) => x.actions.map((a) => a.id))) + 1;
    i.actions.push({ id, text: f.text.trim(), owner: f.owner.trim(), due: `${this.today}T${f.due}`, status: 'Pending', mandatory: f.mandatory });
    this.log(i, `Action added: ${f.text.trim()}`);
    this.actionForm = null;
  }

  removeAction(i: Issue, a: CorrectiveAction): void {
    i.actions = i.actions.filter((x) => x !== a);
    this.log(i, `Action removed: ${a.text}`);
  }

  editCause(): void {
    this.causeDraft = this.selected.rootCause === 'Under investigation' ? '' : this.selected.rootCause;
    this.editingCause = true;
  }

  saveCause(): void {
    const i = this.selected;
    i.rootCause = this.causeDraft.trim() || 'Under investigation';
    this.editingCause = false;
    this.log(i, `Root cause: ${i.rootCause}`);
  }

  /** Mandatory actions that must be done before verification (the verifier's own checks come after). */
  private pendingBeforeVerification(i: Issue): CorrectiveAction[] {
    return i.actions.filter((a) => a.mandatory && a.status !== 'Done' && a.owner !== i.verificationOwner);
  }

  saveUpdate(): void {
    const i = this.selected;
    this.resolutionError = '';
    if (i.status === 'Open') {
      i.status = 'Investigating';
      this.log(i, 'Status changed to Investigating');
    }
    this.log(i, 'Resolution details updated');
    this.showToast(`${i.id} updated.`);
  }

  submitForVerification(): void {
    const i = this.selected;
    const pending = this.pendingBeforeVerification(i);
    if (!i.resolution.trim()) return void (this.resolutionError = 'Enter a resolution summary.');
    if (pending.length) return void (this.resolutionError = `Complete the mandatory action${pending.length > 1 ? 's' : ''} first: ${pending.map((a) => a.text).join(', ')}.`);
    this.resolutionError = '';
    i.status = 'Awaiting verification';
    this.log(i, `Submitted for verification to ${i.verificationOwner}`);
    this.showToast(`${i.id} sent to ${i.verificationOwner} for verification.`);
  }

  returnToAction(): void {
    const i = this.selected;
    i.status = 'Action in progress';
    i.retestPassed = i.evidenceReviewed = false;
    this.log(i, 'Verification rejected; returned to action');
    this.showToast(`${i.id} returned to the action owners.`);
  }

  verifyAndClose(): void {
    const i = this.selected;
    if (!i.retestPassed || !i.evidenceReviewed) return void (this.resolutionError = 'Tick "Retest passed" and "Evidence reviewed" to close.');
    const pending = i.actions.filter((a) => a.mandatory && a.status !== 'Done' && a.owner !== i.verificationOwner);
    if (pending.length) return void (this.resolutionError = 'All mandatory actions must be done before closing.');
    for (const a of i.actions) if (a.owner === i.verificationOwner && a.mandatory) a.status = 'Done';
    for (const d of i.delays) if (!d.end) d.end = this.now;
    this.resolutionError = '';
    i.status = 'Closed';
    i.closedAt = this.now;
    if (i.rootCause === 'Under investigation') i.rootCause = 'Not recorded';
    this.log(i, 'Verified and closed');
    this.showToast(`${i.id} verified and closed. The job's delay events stay on record.`);
  }

  reopen(i: Issue): void {
    i.status = 'Investigating';
    i.closedAt = '';
    i.retestPassed = i.evidenceReviewed = false;
    this.log(i, 'Issue reopened');
    this.open(i);
    this.showToast(`${i.id} reopened.`);
  }

  // ===== SLA pause =====

  requestPause(i: Issue): void {
    this.pauseFor = i;
    this.pauseReason = '';
    this.pauseError = '';
  }

  savePause(): void {
    const i = this.pauseFor;
    if (!i) return;
    if (!this.pauseReason.trim()) return void (this.pauseError = 'Enter why the SLA clock should pause.');
    i.slaPause = 'Requested';
    this.log(i, `SLA pause requested: ${this.pauseReason.trim()}`);
    this.pauseFor = null;
    this.showToast(`SLA pause for ${i.sla || i.stage} sent for approval. The clock keeps running until it is approved.`);
  }

  decidePause(i: Issue, ok: boolean): void {
    i.slaPause = ok ? 'Approved' : '';
    i.slaTimer = ok ? 'Paused' : 'Running';
    this.log(i, ok ? 'SLA pause approved' : 'SLA pause rejected');
    this.showToast(ok ? `SLA clock paused for ${i.job}.` : `SLA pause for ${i.job} rejected.`);
  }

  get pauseRequests(): Issue[] {
    return this.siteIssues.filter((i) => i.slaPause === 'Requested');
  }

  // ===== Escalations =====

  get escalationRows(): { issue: Issue; at: string; level: string; to: string; reason: string; by: string }[] {
    return this.siteIssues.flatMap((issue) => issue.escalations.map((e) => ({ issue, ...e }))).sort((a, b) => b.at.localeCompare(a.at));
  }

  openEscalate(i: Issue): void {
    const next = this.levels[Math.min(this.levels.length - 1, i.escalations.length)];
    this.escalateForm = { issue: i, level: next, to: '', reason: '' };
  }

  saveEscalate(): void {
    const f = this.escalateForm;
    if (!f || !f.to.trim() || !f.reason.trim()) return;
    f.issue.escalations.push({ at: this.now, level: f.level, to: f.to.trim(), reason: f.reason.trim(), by: CURRENT_USER });
    this.log(f.issue, `Escalated (${f.level}) to ${f.to.trim()}`);
    this.escalateForm = null;
    this.showToast(`${f.issue.id} escalated to ${f.to.trim()}.`);
  }

  get openIssues(): Issue[] {
    return this.siteIssues.filter((i) => this.isOpen(i));
  }

  // ===== Corrective actions tab =====

  get actionRows(): ActionRow[] {
    return this.siteIssues.filter((i) => this.isOpen(i)).flatMap((issue) => issue.actions.map((action) => ({ issue, action })));
  }

  get actionTable(): ActionRow[] {
    return this.actionRows.filter((r) => !this.overdueOnly || this.isOverdue(r.action)).sort((a, b) => a.action.due.localeCompare(b.action.due));
  }

  // ===== Resolution history =====

  get closed(): Issue[] {
    return this.siteIssues.filter((i) => !this.isOpen(i)).sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  }

  // ===== Evidence =====

  addEvidence(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const i = this.selected;
    const photos = files.filter((f) => f.type.startsWith('image/')).length;
    i.photos += photos;
    i.logs += files.length - photos;
    this.log(i, `${files.length} evidence file(s) attached`);
    this.showToast(`${files.length} file(s) attached to ${i.id}.`);
  }

  // ===== Report issue =====

  openReport(): void {
    this.reportError = '';
    this.reportForm = {
      title: '', type: this.types[0], job: '', stage: '', task: '', asset: '', severity: 'Medium', priority: 'Normal', owner: this.teams[0] ?? '', responsible: '',
      blocking: false, description: '',
    };
  }

  saveReport(): void {
    const f = this.reportForm;
    if (!f) return;
    if (!f.title.trim() || !f.job.trim() || !f.stage.trim()) {
      this.reportError = 'Enter the issue title, job order and stage.';
      return;
    }
    const n = Math.max(0, ...this.issues.map((i) => Number(i.id.slice(3)) || 0)) + 1;
    const id = `IS-${String(n).padStart(4, '0')}`;
    const now = this.now;
    const due = stamp(new Date(parseLocal(now).getTime() + (f.severity === 'Critical' || f.severity === 'High' ? 1 : 4) * 3_600_000));
    this.issues.push({
      id, title: f.title.trim(), summary: f.title.trim(), type: f.type, site: this.site, job: f.job.trim().toUpperCase(), stage: f.stage.trim(), task: f.task.trim(),
      asset: f.asset.trim().toUpperCase(), severity: f.severity, priority: f.priority, owner: f.owner, responsible: f.responsible.trim() || f.owner, status: 'Open',
      reportedBy: CURRENT_USER, reportedAt: now, due, description: f.description.trim(), blocking: f.blocking, delays: f.blocking ? [{ start: now, end: '' }] : [],
      sla: '', slaTimer: 'Running', slaPause: '', workOrder: '', photos: 0, logs: 0, rootCause: 'Under investigation', actions: [], resolution: '',
      verificationOwner: 'Quality Supervisor', retestPassed: false, evidenceReviewed: false, closedAt: '', escalations: [],
      history: [{ at: now, by: CURRENT_USER, text: 'Issue reported' }],
    });
    this.reportForm = null;
    this.status = 'open';
    this.type = this.severity = this.search = '';
    this.tab = 'register';
    this.selectedId = id;
    this.showToast(`${id} reported${f.blocking ? '; a delay was started on ' + f.job.trim().toUpperCase() : ''}.`);
  }

  // ===== Export =====

  export(): void {
    const rows = this.rows.map((i) => ({
      Issue: i.id, Title: i.title, Type: i.type, Site: i.site, 'Job Order': i.job, Stage: i.stage, Task: i.task, Asset: i.asset, Severity: i.severity,
      Priority: i.priority, Owner: i.owner, Responsible: i.responsible, Status: i.status, Blocking: i.blocking ? 'Yes' : 'No', 'Delay (min)': this.delayMinutes(i),
      'Reported At': i.reportedAt.replace('T', ' '), 'Resolution Due': i.due.replace('T', ' '), 'Root Cause': i.rootCause, Resolution: i.resolution,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Issues');
    XLSX.writeFile(book, `Issues_${this.site.replace(/\s+/g, '_')}_${this.today}.xlsx`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.reportForm = this.escalateForm = this.pauseFor = this.actionForm = null;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
