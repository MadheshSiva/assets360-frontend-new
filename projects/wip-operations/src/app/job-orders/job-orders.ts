import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  ArrowRight,
  Box,
  ChartColumn,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  ListChecks,
  Pause,
  Play,
  PlusCircle,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
  X,
} from 'lucide-angular';
import { Issue, JobOrder, OrderStage, OrderTask, Severity, TaskStatus } from './job-order.model';

type Tab = 'overview' | 'stages' | 'resources' | 'materials' | 'quality' | 'issues' | 'output' | 'activity';
type Dialog = 'issue' | 'progress' | 'output' | 'consumption' | 'checklist' | 'completeStage' | null;

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';

/** Orders are kept in memory; empty until the WIP API is wired up. */
const ORDERS: JobOrder[] = [];
const WORKING = new Map<string, JobOrder>();

/** Empty order used while there are no job orders to show. */
function blankOrder(): JobOrder {
  return {
    code: '', templateCode: '', templateVersion: '', name: '', image: '', status: 'Planned', priority: 'Medium', batch: '', site: '', location: '',
    supervisor: '', team: '', plannedStart: '', due: '', actualStart: '', asOf: '', linkedAsset: { tag: '', name: '' },
    output: { planned: 0, unit: '', completed: 0, accepted: 0, rework: 0, rejected: 0 },
    stages: [], gates: [], permits: [], qualityChecks: [], resources: [], materials: [], issues: [], activity: [], serials: [],
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

@Component({
  selector: 'app-job-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './job-orders.html',
  // Buttons, form controls, cards, tabs, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', './job-orders.css', '../shared/wip-purple-theme.css'],
})
export class JobOrders implements OnDestroy {
  readonly icons = {
    ArrowRight, Box, ChartColumn, Check, ChevronDown, CircleCheck, Clock, ExternalLink, FileText, ImageIcon, Info, ListChecks, Pause, Play,
    PlusCircle, ShieldCheck, TriangleAlert, Waypoints, X,
  };

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'stages', label: 'Stages & Tasks' },
    { key: 'resources', label: 'Resources & Assets' },
    { key: 'materials', label: 'Materials' },
    { key: 'quality', label: 'Quality & Permits' },
    { key: 'issues', label: 'Issues & Delays' },
    { key: 'output', label: 'Output & Traceability' },
    { key: 'activity', label: 'Activity' },
  ];
  readonly orderList = ORDERS.map((o) => ({ code: o.code, name: o.name, status: o.status }));
  readonly severities: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
  readonly taskStatuses: TaskStatus[] = ['Pending', 'In Progress', 'Completed'];
  /** Issue owners (teams); filled from master data once the API is wired. */
  readonly owners: string[] = [];

  o: JobOrder = ORDERS.length ? this.working(ORDERS[0].code) : blankOrder();
  tab: Tab = 'overview';
  switcherOpen = false;
  dialog: Dialog = null;
  formError = '';
  /** Ticks every 30 s so the SLA countdown stays current. */
  now = this.clock();
  private timer = setInterval(() => (this.now = this.clock()), 30_000);

  // Dialog forms
  issueForm = { title: '', severity: 'Medium' as Severity, stage: '', owner: '', description: '' };
  progressForm = { task: 0, status: 'Completed' as TaskStatus, photos: 0, note: '' };
  outputForm = { accepted: 0, rework: 0, rejected: 0 };
  consumptionForm = { material: 0, quantity: 1 };

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  private readonly router = inject(Router);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => {
        const code = params.get('code');
        this.o = code && ORDERS.some((x) => x.code === code) ? this.working(code) : ORDERS.length ? this.working(ORDERS[0].code) : blankOrder();
        this.now = this.clock();
        this.tab = 'overview';
        this.dialog = null;
        this.switcherOpen = false;
      });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
  }

  private working(code: string): JobOrder {
    let o = WORKING.get(code);
    if (!o) {
      o = structuredClone(ORDERS.find((x) => x.code === code)!);
      WORKING.set(code, o);
    }
    return o;
  }

  /** Current time (drives the SLA countdown). */
  private clock(): Date {
    return new Date();
  }

  private stamp(): string {
    return toLocal(this.clock());
  }

  openOrder(code: string): void {
    this.switcherOpen = false;
    this.router.navigate([], { queryParams: { code } });
  }

  // ===== Derived =====

  get allTasks(): OrderTask[] {
    return this.o.stages.flatMap((s) => s.tasks);
  }

  get doneTasks(): number {
    return this.allTasks.filter((t) => t.status === 'Completed').length;
  }

  get progress(): number {
    return this.allTasks.length ? Math.round((this.doneTasks / this.allTasks.length) * 100) : 0;
  }

  /** Ring dash for the progress donut (r = 26). */
  get progressDash(): string {
    const len = 2 * Math.PI * 26;
    const on = (this.progress / 100) * len;
    return `${on.toFixed(1)} ${(len - on).toFixed(1)}`;
  }

  get currentStage(): OrderStage | null {
    return this.o.stages.find((s) => s.status === 'In Progress') ?? null;
  }

  get currentIndex(): number {
    return this.currentStage ? this.o.stages.indexOf(this.currentStage) : -1;
  }

  /** Minutes until the due time (negative when overdue); null once the job is complete. */
  get slaMinutes(): number | null {
    if (this.o.status === 'Completed' || !this.o.due) return null;
    return Math.round((parseLocal(this.o.due).getTime() - this.now.getTime()) / 60_000);
  }

  get slaText(): string {
    const m = this.slaMinutes;
    if (m === null) return 'Met';
    const abs = Math.abs(m);
    const text = abs >= 1440 ? `${Math.floor(abs / 1440)}d ${pad(Math.floor((abs % 1440) / 60))}h` : `${pad(Math.floor(abs / 60))}h ${pad(abs % 60)}m`;
    return m < 0 ? `-${text}` : text;
  }

  get slaTone(): string {
    const m = this.slaMinutes;
    return m === null ? 'good' : m < 0 ? 'bad' : m < 60 ? 'warn' : 'amber';
  }

  get openIssue(): Issue | null {
    return this.o.issues.find((i) => i.status !== 'Resolved') ?? null;
  }

  get openIssueCount(): number {
    return this.o.issues.filter((i) => i.status !== 'Resolved').length;
  }

  stageTasksDone(s: OrderStage): number {
    return s.tasks.filter((t) => t.status === 'Completed').length;
  }

  statusTone(status: string): string {
    switch (status) {
      case 'Completed': case 'Done': case 'Accepted': case 'Approved': case 'Resolved': case 'Closed': case 'Active': case 'Released':
        return 'good';
      case 'In Progress': case 'In Use': case 'Booked':
        return 'blue';
      case 'Paused': case 'Rework': case 'Requested': case 'Open':
        return 'warn';
      case 'Rejected':
        return 'bad';
      default:
        return 'grey';
    }
  }

  severityTone(s: Severity): string {
    return s === 'Critical' || s === 'High' ? 'bad' : s === 'Medium' ? 'warn' : 'grey';
  }

  // ===== Actions =====

  private log(title: string, detail: string): void {
    this.o.activity = [{ at: this.stamp(), title, detail }, ...this.o.activity];
  }

  togglePause(): void {
    if (this.o.status === 'Completed') return this.showToast('This job is already complete.');
    if (this.o.status === 'Planned') {
      this.o.status = 'In Progress';
      this.o.actualStart = this.stamp();
      const first = this.o.stages[0];
      if (first) {
        first.status = 'In Progress';
        first.start = this.stamp();
      }
      this.log('Job started', `${CURRENT_USER} started the job`);
      return this.showToast('Job started.');
    }
    const pausing = this.o.status === 'In Progress';
    this.o.status = pausing ? 'Paused' : 'In Progress';
    this.log(pausing ? 'Job paused' : 'Job resumed', `${pausing ? 'Paused' : 'Resumed'} by ${CURRENT_USER}`);
    this.showToast(pausing ? 'Job paused. Time keeps counting towards the SLA.' : 'Job resumed.');
  }

  private requireRunning(): boolean {
    if (this.o.status === 'In Progress') return true;
    this.showToast(this.o.status === 'Paused' ? 'Resume the job first.' : this.o.status === 'Planned' ? 'Start the job first.' : 'This job is already complete.', true);
    return false;
  }

  openDialog(d: Exclude<Dialog, null>): void {
    this.formError = '';
    const stage = this.currentStage;
    if (d === 'issue') this.issueForm = { title: '', severity: 'Medium', stage: stage?.name ?? this.o.stages[0]?.name ?? '', owner: '', description: '' };
    if (d === 'progress' || d === 'checklist' || d === 'completeStage') {
      if (!this.requireRunning() || !stage) return;
      const firstOpen = stage.tasks.findIndex((t) => t.status !== 'Completed');
      this.progressForm = { task: Math.max(0, firstOpen), status: 'Completed', photos: 0, note: '' };
      if (d === 'completeStage' && firstOpen < 0) return this.completeStage();
    }
    if (d === 'output') {
      if (this.o.status === 'Planned') return this.showToast('Start the job first.', true);
      this.outputForm = { accepted: 0, rework: 0, rejected: 0 };
    }
    if (d === 'consumption') {
      if (this.o.status === 'Planned') return this.showToast('Start the job first.', true);
      this.consumptionForm = { material: 0, quantity: 1 };
    }
    this.dialog = d;
  }

  saveIssue(): void {
    const f = this.issueForm;
    if (!f.title.trim()) {
      this.formError = 'Describe the issue in the title.';
      return;
    }
    const next = Math.max(0, ...ORDERS.flatMap((x) => WORKING.get(x.code)?.issues ?? x.issues).map((i) => Number(i.id.split('-')[1]) || 0)) + 1;
    const issue: Issue = { id: `IS-${String(next).padStart(4, '0')}`, title: f.title.trim(), severity: f.severity, stage: f.stage, owner: f.owner, status: 'Open', raisedAt: this.stamp(), description: f.description.trim() };
    this.o.issues = [issue, ...this.o.issues];
    this.log(`Issue ${issue.id} raised`, issue.title);
    this.dialog = null;
    this.showToast(`Issue ${issue.id} reported to ${issue.owner}.`);
  }

  resolveIssue(i: Issue): void {
    i.status = 'Resolved';
    this.log(`Issue ${i.id} resolved`, i.title);
    this.showToast(`Issue ${i.id} resolved.`);
  }

  saveProgress(): void {
    const stage = this.currentStage;
    const f = this.progressForm;
    const task = stage?.tasks[Number(f.task)];
    if (!stage || !task) return;
    task.status = f.status;
    task.evidence += Math.max(0, Number(f.photos) || 0);
    this.log(`${task.name}: ${f.status.toLowerCase()}`, f.note.trim() || `${task.assignee} · ${stage.name} stage`);
    this.dialog = null;
    this.showToast('Progress logged.');
  }

  setTaskStatus(stage: OrderStage, task: OrderTask, status: TaskStatus): void {
    if (stage.status !== 'In Progress' || !this.requireRunning()) return;
    task.status = status;
    this.log(`${task.name}: ${status.toLowerCase()}`, `${task.assignee} · ${stage.name} stage`);
  }

  /** Completes the current stage (any open tasks are completed with it) and starts the next one. */
  completeStage(): void {
    const stage = this.currentStage;
    if (!stage) return;
    const open = stage.tasks.filter((t) => t.status !== 'Completed').length;
    stage.tasks.forEach((t) => (t.status = 'Completed'));
    stage.checklist.forEach((c) => (c.done = true));
    stage.status = 'Completed';
    stage.end = this.stamp();
    this.log(`${stage.name} completed`, open ? `${open} open task${open > 1 ? 's' : ''} closed with the stage` : `All ${stage.name.toLowerCase()} tasks marked complete`);
    // Matching quality gates pass with the stage
    this.o.gates.filter((g) => g.status !== 'Done' && g.stage === stage.name).forEach((g) => {
      g.status = 'Done';
      g.at = this.stamp();
    });
    const next = this.o.stages[this.o.stages.indexOf(stage) + 1];
    if (next) {
      next.status = 'In Progress';
      next.start = this.stamp();
      this.log(`${next.name} stage started`, `${next.tasks[0]?.assignee ?? CURRENT_USER} started ${next.name.toLowerCase()} stage`);
      this.showToast(`${stage.name} completed. ${next.name} started.`);
    } else {
      this.o.status = 'Completed';
      this.o.gates.forEach((g) => g.status !== 'Done' && ((g.status = 'Done'), (g.at = this.stamp())));
      this.log('Job completed', 'All stages complete');
      this.showToast('Last stage completed. The job is complete.');
    }
    this.dialog = null;
  }

  toggleChecklistItem(item: { item: string; done: boolean }): void {
    item.done = !item.done;
  }

  saveOutput(): void {
    const f = this.outputForm;
    const add = { accepted: Math.max(0, Number(f.accepted) || 0), rework: Math.max(0, Number(f.rework) || 0), rejected: Math.max(0, Number(f.rejected) || 0) };
    const total = add.accepted + add.rework + add.rejected;
    const out = this.o.output;
    if (!total) {
      this.formError = 'Enter at least one unit.';
      return;
    }
    if (out.completed + total > out.planned) {
      this.formError = `Only ${out.planned - out.completed} more ${out.unit.toLowerCase()} are planned.`;
      return;
    }
    out.accepted += add.accepted;
    out.rework += add.rework;
    out.rejected += add.rejected;
    out.completed += total;
    // Assign the results to the next units still in progress
    const queue = this.o.serials.filter((s) => s.status === 'In Progress' || s.status === 'Not Started');
    const stage = this.currentStage?.name ?? '';
    (['accepted', 'rework', 'rejected'] as const).forEach((k) => {
      for (let i = 0; i < add[k]; i++) {
        const unit = queue.shift();
        if (unit) Object.assign(unit, { status: k === 'accepted' ? 'Accepted' : k === 'rework' ? 'Rework' : 'Rejected', stage });
      }
    });
    this.log('Output recorded', `${add.accepted} accepted, ${add.rework} rework, ${add.rejected} rejected`);
    this.dialog = null;
    this.showToast('Output recorded.');
  }

  saveConsumption(): void {
    const line = this.o.materials[Number(this.consumptionForm.material)];
    const qty = Number(this.consumptionForm.quantity) || 0;
    if (!line || qty <= 0) {
      this.formError = 'Enter a quantity above zero.';
      return;
    }
    if (line.consumed + qty > line.issued) {
      this.formError = `Only ${line.issued - line.consumed} ${line.unit.toLowerCase()} issued and not yet consumed.`;
      return;
    }
    line.consumed += qty;
    this.log(`${line.item} consumed`, `${qty} ${line.unit.toLowerCase()} recorded against ${this.o.code}`);
    this.dialog = null;
    this.showToast('Consumption recorded.');
  }

  // ===== Menus =====

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
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
