import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Bell,
  CircleCheck,
  CirclePause,
  CirclePlay,
  Clock,
  Download,
  Gauge,
  House,
  Info,
  Plus,
  Search,
  Settings2,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-angular';
import { CompletedSla, EscalationStep, PolicyVersion, SlaEscalation, SlaPolicy, SlaScope, SlaTimer, TimerState, WorkCalendar } from './sla.model';

type Tab = 'policies' | 'timers' | 'breaches' | 'escalations' | 'performance';

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];
const SCOPE_FOR: Record<string, SlaScope> = { 'Job Order': 'Job', 'Process Stage': 'Stage', Task: 'Task', Issue: 'Issue' };

/** Built-in round-the-clock calendar; site work calendars come from the SLA service once wired. */
const CALENDARS: WorkCalendar[] = [
  { name: '24×7', label: '24×7', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00', holidays: [], note: 'Every day, all hours' },
];
/** Policies, timers, escalations, completed SLAs and versions are kept in memory; empty until the SLA service is wired up. */
const POLICIES: SlaPolicy[] = [];
const TIMERS: SlaTimer[] = [];
const ESCALATIONS: SlaEscalation[] = [];
const COMPLETED: CompletedSla[] = [];
const VERSIONS: PolicyVersion[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** Working windows [from, to) in ms for one calendar day. */
function windowOf(cal: WorkCalendar, day: Date): [number, number] | null {
  const key = stamp(day).slice(0, 10);
  if (!cal.days.includes(day.getDay()) || cal.holidays.includes(key)) return null;
  const base = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return [base + hm(cal.start) * 60_000, base + hm(cal.end) * 60_000];
}

/** Working minutes between two times on a calendar. */
function workingMinutes(cal: WorkCalendar, from: string, to: string): number {
  const a = parseLocal(from).getTime();
  const b = parseLocal(to).getTime();
  if (b <= a) return 0;
  let total = 0;
  for (let d = new Date(parseLocal(from.slice(0, 10)).getTime()); d.getTime() < b; d = nextDay(d)) {
    const w = windowOf(cal, d);
    if (w) total += Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0]));
  }
  return Math.round(total / 60_000);
}

/** The time `mins` working minutes after `from`. */
function addWorking(cal: WorkCalendar, from: string, mins: number): string {
  let t = parseLocal(from).getTime();
  let left = mins * 60_000;
  for (let d = new Date(parseLocal(from.slice(0, 10)).getTime()), guard = 0; guard < 400; d = nextDay(d), guard++) {
    const w = windowOf(cal, d);
    if (!w) continue;
    const s = Math.max(t, w[0]);
    if (s >= w[1]) continue;
    if (s + left <= w[1]) return stamp(new Date(s + left));
    left -= w[1] - s;
    t = w[1];
  }
  return stamp(new Date(t + left));
}

@Component({
  selector: 'app-sla-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './sla-management.html',
  // Buttons, controls, tabs, switches, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './sla-management.css', '../shared/wip-purple-theme.css'],
})
export class SlaManagement implements OnDestroy {
  readonly icons = { ArrowRight, Bell, CircleCheck, CirclePause, CirclePlay, Clock, Download, Gauge, House, Info, Plus, Search, Settings2, Timer, TriangleAlert, X };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'policies', label: 'SLA Policies' },
    { key: 'timers', label: 'Active SLA Timers' },
    { key: 'breaches', label: 'Breaches & Exceptions' },
    { key: 'escalations', label: 'Escalation History' },
    { key: 'performance', label: 'Performance' },
  ];
  readonly calendars = CALENDARS;
  readonly appliesToOptions = Object.keys(SCOPE_FOR);
  readonly scopes: SlaScope[] = ['Job', 'Stage', 'Task', 'Issue'];
  readonly priorities = ['High', 'Medium', 'Low'];
  readonly timeZones = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London'];
  readonly startEvents = ['Stage ready', 'Job released', 'Task assigned', 'Issue reported', 'Job completed'];
  readonly stopEvents = ['Stage approved', 'Job completed', 'Task completed', 'Issue closed', 'Job dispatched'];
  readonly resumeEvents = ['Dependency resolved', 'Material received', 'Approval received'];
  /** Escalation matrices; filled from the SLA service once wired. */
  readonly matrices: string[] = [];
  readonly channelOptions = ['In-app', 'In-app + Email', 'In-app + Email + SMS'];
  readonly states: TimerState[] = ['Within Target', 'At Risk', 'Breached', 'Paused'];

  policies = POLICIES;
  timers = TIMERS;
  tab: Tab = 'policies';

  // Policy table filters
  search = '';
  scopeFilter: SlaScope | '' = '';
  statusFilter: 'Active' | 'Draft' | 'Inactive' | '' = 'Active';

  // Timer filters
  timerState: TimerState | '' = '';
  timerPolicy = '';

  selectedId = POLICIES[0]?.id ?? '';
  /** Unsaved edits to the selected (or new) policy; a blank new policy while none exist. */
  draft: SlaPolicy = this.blankPolicy();
  isNew = !POLICIES.length;
  complValue = 2;
  complUnit: 'hours' | 'minutes' = 'hours';
  formError = '';
  previewStart = '12:30';

  ladderOpen = false;
  pauseFor: SlaTimer | null = null;
  pauseReason = '';

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.loadDraft();
    // ?policy=Pressure Testing (or SLA-00012) opens a policy (links from other pages)
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const key = (p.get('policy') ?? '').toLowerCase();
        const found = key && this.policies.find((x) => x.id.toLowerCase() === key || x.name.toLowerCase() === key);
        if (found) {
          this.statusFilter = '';
          this.selectPolicy(found);
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

  policy(id: string): SlaPolicy | undefined {
    return this.policies.find((p) => p.id === id);
  }

  policyName(id: string): string {
    return this.policy(id)?.name ?? id;
  }

  calendar(name: string): WorkCalendar {
    return this.calendars.find((c) => c.name === name) ?? this.calendars[0];
  }

  /** Calendar a policy counts time on: its own, or every hour when non-working time is not excluded. */
  private clockOf(p: SlaPolicy): WorkCalendar {
    return p.excludeNonWorking ? this.calendar(p.calendar) : this.calendar('24×7');
  }

  fmtTarget(mins: number): string {
    if (mins >= 60 && mins % 60 === 0) return `${mins / 60} hour${mins === 60 ? '' : 's'}`;
    return mins > 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  }

  // ===== Policies =====

  get policyRows(): SlaPolicy[] {
    const q = this.search.trim().toLowerCase();
    return this.policies.filter(
      (p) => (!this.scopeFilter || p.scope === this.scopeFilter) && (!this.statusFilter || p.status === this.statusFilter) && (!q || `${p.name} ${p.id}`.toLowerCase().includes(q)),
    );
  }

  get selected(): SlaPolicy | undefined {
    return this.isNew ? undefined : this.policy(this.selectedId);
  }

  private loadDraft(): void {
    const p = this.policy(this.selectedId);
    if (!p) return;
    this.draft = structuredClone(p);
    this.isNew = false;
    this.setCompletionFields(p.completionMin);
    this.formError = '';
  }

  private setCompletionFields(mins: number): void {
    this.complUnit = mins % 60 === 0 ? 'hours' : 'minutes';
    this.complValue = this.complUnit === 'hours' ? mins / 60 : mins;
  }

  get completionMin(): number {
    return Math.round((Number(this.complValue) || 0) * (this.complUnit === 'hours' ? 60 : 1));
  }

  get dirty(): boolean {
    if (this.isNew) return true;
    const p = this.selected;
    return !!p && (JSON.stringify({ ...this.draft, completionMin: this.completionMin }) !== JSON.stringify(p));
  }

  selectPolicy(p: SlaPolicy): void {
    if (p.id === this.selectedId && !this.isNew) return;
    if (this.dirty) this.showToast(`Unsaved changes to ${this.draft.name || 'the new policy'} were discarded.`);
    this.selectedId = p.id;
    this.loadDraft();
  }

  createPolicy(): void {
    this.tab = 'policies';
    this.isNew = true;
    this.formError = '';
    this.draft = this.blankPolicy();
    this.setCompletionFields(120);
  }

  /** Defaults for a new policy. */
  private blankPolicy(): SlaPolicy {
    return {
      id: '', name: '', scope: 'Stage', appliesTo: 'Process Stage', priority: 'Medium', responseMin: 15, completionMin: 120, calendar: this.calendars[0]?.name ?? '',
      timeZone: 'Asia/Dubai', status: 'Draft', version: 0, startEvent: 'Stage ready', stopEvent: 'Stage approved', pauseStates: 'Awaiting approved external dependency',
      resumeEvent: 'Dependency resolved', pauseRequiresApproval: true, excludeNonWorking: true, warningPct: 80, escalationMatrix: this.matrices[0] ?? '',
      channels: 'In-app + Email', ladder: [
        { trigger: 'pct', value: 80, action: 'Notify assignee' },
        { trigger: 'pct', value: 100, action: 'Notify supervisor' },
        { trigger: 'overdue', value: 30, action: 'Escalate to operations manager' },
      ],
    };
  }

  onAppliesTo(): void {
    this.draft.scope = SCOPE_FOR[this.draft.appliesTo] ?? 'Stage';
  }

  cancelPolicy(): void {
    if (this.isNew) {
      this.isNew = false;
      this.loadDraft();
      return;
    }
    this.loadDraft();
  }

  savePolicy(): void {
    const d = this.draft;
    const name = d.name.trim();
    const compl = this.completionMin;
    if (!name) return void (this.formError = 'Enter the policy name.');
    if (this.policies.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== d.id)) return void (this.formError = `"${name}" already exists.`);
    if (!(d.responseMin > 0) || !(compl > 0)) return void (this.formError = 'Response and completion targets must be above zero.');
    if (d.responseMin >= compl) return void (this.formError = 'The response target must be shorter than the completion target.');
    if (!(d.warningPct > 0 && d.warningPct < 100)) return void (this.formError = 'The warning threshold must be between 1% and 99%.');
    if (!this.ladderValid(d.ladder)) return void (this.formError = 'Every escalation step needs a value above zero and an action.');
    if (!this.dirty) return this.showToast('No changes to save.');
    this.formError = '';
    const saved: SlaPolicy = { ...structuredClone(d), name, completionMin: compl, version: d.version + 1 };
    if (this.isNew) {
      const n = Math.max(0, ...this.policies.map((p) => Number(p.id.slice(4)) || 0)) + 1;
      saved.id = `SLA-${String(n).padStart(5, '0')}`;
      this.policies.push(saved);
      VERSIONS.unshift({ policyId: saved.id, version: 1, at: this.now, by: CURRENT_USER, note: 'Created' });
      this.statusFilter = '';
    } else {
      const old = this.policy(d.id)!;
      VERSIONS.unshift({ policyId: d.id, version: saved.version, at: this.now, by: CURRENT_USER, note: this.changeNote(old, saved) });
      Object.assign(old, saved);
      // New targets apply to clocks that start from now on; running timers keep the version they started with
    }
    this.selectedId = saved.id;
    this.loadDraft();
    this.showToast(`${saved.name} saved as version ${saved.version}. Running timers keep the version they started with.`);
  }

  private changeNote(a: SlaPolicy, b: SlaPolicy): string {
    const parts: string[] = [];
    if (a.name !== b.name) parts.push(`renamed to ${b.name}`);
    if (a.responseMin !== b.responseMin) parts.push(`response ${this.fmtTarget(b.responseMin)}`);
    if (a.completionMin !== b.completionMin) parts.push(`completion ${this.fmtTarget(b.completionMin)}`);
    if (a.calendar !== b.calendar) parts.push(`calendar ${b.calendar}`);
    if (a.warningPct !== b.warningPct) parts.push(`warning at ${b.warningPct}%`);
    if (JSON.stringify(a.ladder) !== JSON.stringify(b.ladder)) parts.push('escalation ladder');
    return parts.length ? parts.join(', ') : 'Timer rules and alerts updated';
  }

  setStatus(status: 'Active' | 'Inactive'): void {
    const p = this.selected;
    if (!p) return;
    if (status === 'Inactive' && this.timersOf(p).length) {
      return this.showToast(`${p.name} has ${this.timersOf(p).length} running timer(s). They finish on this policy; new work won't start one.`, true);
    }
    p.status = status;
    this.draft.status = status;
    VERSIONS.unshift({ policyId: p.id, version: p.version, at: this.now, by: CURRENT_USER, note: status === 'Active' ? 'Activated' : 'Deactivated' });
    this.showToast(`${p.name} is now ${status.toLowerCase()}.`);
  }

  versionsOf(id: string): PolicyVersion[] {
    return VERSIONS.filter((v) => v.policyId === id);
  }

  // ===== Escalation ladder =====

  stepLabel(s: EscalationStep): string {
    return s.trigger === 'pct' ? `${s.value}% elapsed` : `${s.value} min overdue`;
  }

  private ladderValid(l: EscalationStep[]): boolean {
    return l.every((s) => s.value > 0 && s.action.trim());
  }

  addStep(): void {
    this.draft.ladder.push({ trigger: 'overdue', value: 60, action: '' });
  }

  removeStep(i: number): void {
    this.draft.ladder.splice(i, 1);
  }

  closeLadder(): void {
    if (!this.ladderValid(this.draft.ladder)) return this.showToast('Every step needs a value above zero and an action.', true);
    this.draft.ladder.sort((a, b) => (a.trigger === b.trigger ? a.value - b.value : a.trigger === 'pct' ? -1 : 1));
    this.ladderOpen = false;
  }

  // ===== Preview =====

  get previewDate(): string {
    return this.now.slice(0, 10);
  }

  get previewDue(): string {
    if (!/^\d{2}:\d{2}$/.test(this.previewStart) || !(this.completionMin > 0)) return '';
    return addWorking(this.clockOf(this.draft), `${this.previewDate}T${this.previewStart}`, this.completionMin);
  }

  get previewSameDay(): boolean {
    return this.previewDue.slice(0, 10) === this.previewDate;
  }

  // ===== Timers =====

  timersOf(p: SlaPolicy): SlaTimer[] {
    return this.timers.filter((t) => t.policyId === p.id);
  }

  elapsed(t: SlaTimer): number {
    const p = this.policy(t.policyId);
    if (!p) return 0;
    return Math.max(0, workingMinutes(this.clockOf(p), t.start, t.paused && t.pausedAt ? t.pausedAt : this.now) - t.pausedMin);
  }

  pct(t: SlaTimer): number {
    return Math.round((this.elapsed(t) / t.targetMin) * 100);
  }

  state(t: SlaTimer): TimerState {
    if (t.paused) return 'Paused';
    const p = this.pct(t);
    return p >= 100 ? 'Breached' : p >= (this.policy(t.policyId)?.warningPct ?? 80) ? 'At Risk' : 'Within Target';
  }

  stateClass(s: TimerState): string {
    return { 'Within Target': 'pill--green', 'At Risk': 'pill--amber', Breached: 'pill--red', Paused: 'pill--blue' }[s];
  }

  remaining(t: SlaTimer): string {
    const left = t.targetMin - this.elapsed(t);
    const a = Math.abs(left);
    const txt = `${pad(Math.floor(a / 60))}h ${pad(a % 60)}m`;
    return left < 0 ? `Overdue ${a >= 60 ? txt : a + 'm'}` : txt;
  }

  due(t: SlaTimer): string {
    const p = this.policy(t.policyId);
    return p ? addWorking(this.clockOf(p), t.start, t.targetMin + t.pausedMin) : '';
  }

  get watched(): SlaTimer[] {
    return this.timers.filter((t) => t.watch);
  }

  get kpiWithin(): number {
    return this.timers.filter((t) => ['Within Target', 'Paused'].includes(this.state(t))).length;
  }

  get kpiRisk(): number {
    return this.timers.filter((t) => this.state(t) === 'At Risk').length;
  }

  get breached(): SlaTimer[] {
    return this.timers.filter((t) => this.state(t) === 'Breached');
  }

  get pausedTimers(): SlaTimer[] {
    return this.timers.filter((t) => t.paused || t.pausedMin > 0);
  }

  showTimers(state: TimerState | ''): void {
    this.tab = 'timers';
    this.timerState = state;
    this.timerPolicy = '';
  }

  get timerRows(): SlaTimer[] {
    return this.timers
      .filter((t) => (!this.timerState || this.state(t) === this.timerState || (this.timerState === 'Within Target' && t.paused)) && (!this.timerPolicy || t.policyId === this.timerPolicy))
      .sort((a, b) => this.pct(b) - this.pct(a));
  }

  openPause(t: SlaTimer): void {
    this.pauseFor = t;
    this.pauseReason = '';
  }

  savePause(): void {
    const t = this.pauseFor;
    if (!t || !this.pauseReason.trim()) return;
    t.paused = true;
    t.pausedAt = this.now;
    t.pauseReason = this.pauseReason.trim();
    this.pauseFor = null;
    const p = this.policy(t.policyId);
    this.showToast(`${t.job} clock paused${p?.pauseRequiresApproval ? `, approved by ${CURRENT_USER}` : ''}. The pause is kept in the audit trail.`);
  }

  resume(t: SlaTimer): void {
    const p = this.policy(t.policyId);
    if (!p || !t.pausedAt) return;
    t.pausedMin += workingMinutes(this.clockOf(p), t.pausedAt, this.now);
    t.paused = false;
    t.pausedAt = '';
    this.showToast(`${t.job} clock resumed. Due ${this.due(t).replace('T', ' ')}.`);
  }

  saveBreachReason(t: SlaTimer, reason: string): void {
    t.breachReason = reason.trim();
    this.showToast(t.breachReason ? `Breach reason recorded for ${t.job}.` : `Breach reason cleared for ${t.job}.`);
  }

  // ===== Escalations =====

  get escalations(): SlaEscalation[] {
    return [...ESCALATIONS].sort((a, b) => b.at.localeCompare(a.at));
  }

  acknowledge(e: SlaEscalation): void {
    e.acknowledged = this.now;
    this.showToast(`Escalation for ${e.job} acknowledged.`);
  }

  escalateNow(t: SlaTimer): void {
    const p = this.policy(t.policyId);
    const step = p?.ladder[p.ladder.length - 1];
    ESCALATIONS.push({
      at: this.now, job: t.job, stage: t.stage, policyId: t.policyId, step: 'Manual escalation', notified: step?.action.replace(/^(Escalate|Notify) to /i, '') || 'Operations Manager',
      channel: p?.channels ?? 'In-app', acknowledged: '',
    });
    this.showToast(`${t.job} escalated. See Escalation History.`);
  }

  // ===== Performance =====

  get performance(): { policy: SlaPolicy; done: number; onTime: number; pct: number; avg: number; breachedNow: number }[] {
    return this.policies
      .filter((p) => p.status !== 'Draft')
      .map((policy) => {
        const rows = COMPLETED.filter((c) => c.policyId === policy.id);
        const onTime = rows.filter((c) => c.actualMin <= c.targetMin).length;
        const avg = rows.length ? Math.round(rows.reduce((s, c) => s + c.actualMin, 0) / rows.length) : 0;
        return { policy, done: rows.length, onTime, pct: rows.length ? Math.round((onTime / rows.length) * 100) : 0, avg, breachedNow: this.breached.filter((t) => t.policyId === policy.id).length };
      });
  }

  get overallCompliance(): number {
    const rows = COMPLETED;
    return rows.length ? Math.round((rows.filter((c) => c.actualMin <= c.targetMin).length / rows.length) * 100) : 0;
  }

  // ===== Export =====

  export(): void {
    const book = XLSX.utils.book_new();
    const policies = this.policies.map((p) => ({
      ID: p.id, Policy: p.name, Scope: p.scope, 'Response Target (min)': p.responseMin, 'Completion Target (min)': p.completionMin, Calendar: p.calendar,
      'Time Zone': p.timeZone, Status: p.status, Version: p.version, 'Warning %': p.warningPct, Escalation: p.ladder.map((s) => `${this.stepLabel(s)}: ${s.action}`).join('; '),
    }));
    const timers = this.timers.map((t) => ({
      Job: t.job, Stage: t.stage, Policy: this.policyName(t.policyId), Owner: t.owner, Started: t.start.replace('T', ' '), Due: this.due(t).replace('T', ' '),
      'Elapsed %': this.pct(t), Remaining: this.remaining(t), State: this.state(t), 'Pause Reason': t.pauseReason, 'Breach Reason': t.breachReason,
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(policies), 'Policies');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(timers), 'Active Timers');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.escalations.map((e) => ({ ...e, policyId: this.policyName(e.policyId) }))), 'Escalations');
    XLSX.writeFile(book, `SLA_Report_${this.now.slice(0, 10)}.xlsx`);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.pauseFor = null;
    if (this.ladderOpen) this.closeLadder();
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
}
