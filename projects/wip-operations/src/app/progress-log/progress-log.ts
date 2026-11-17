import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Boxes,
  CalendarDays,
  CircleCheck,
  CircleCheckBig,
  Clock,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  Layers,
  MapPin,
  Pencil,
  Plus,
  TriangleAlert,
  Upload,
  UsersRound,
  Wrench,
  X,
} from 'lucide-angular';
import { OUTPUTS, OUTPUT_JOB, nowStamp, handoverState, parseLocal } from '../product-output/output-store';

type Tab = 'timeline' | 'entries' | 'stages' | 'outputs' | 'review';
type EntryType = 'System event' | 'Verified' | 'Delay' | 'Task update' | 'Output' | 'Work progress' | 'Note' | 'Correction';

interface Ref {
  kind: 'issue' | 'wo' | 'file' | 'task' | 'checklist' | 'batch' | 'serials' | 'duration';
  label: string;
  serial?: string;
}

interface Entry {
  id: number;
  at: string;
  type: EntryType;
  title: string;
  by: string;
  stage: string;
  task: string;
  notes: string;
  minutes: number;
  refs: Ref[];
  review: 'Pending' | 'Reviewed';
  reviewedBy: string;
  /** This entry corrects an earlier one (which keeps its original content). */
  correctionOf: number | null;
  correctedBy: number | null;
}

interface Task {
  id: string;
  name: string;
  done: boolean;
  checklistDone: number;
  checklistTotal: number;
}

interface Stage {
  name: string;
  tasks: Task[];
}

interface Blocker {
  ref: string;
  title: string;
  stage: string;
  since: string;
  status: 'Open' | 'Resolved';
  note: string;
}

interface UpdateForm {
  stage: string;
  task: string;
  type: EntryType;
  at: string;
  operator: string;
  minutes: number;
  notes: string;
  files: string[];
  complete: boolean;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
const TITLES: Partial<Record<EntryType, string>> = { 'Work progress': 'Work progress', 'Task update': 'Task updated', Delay: 'Delay reported', Output: 'Output noted', Note: 'Note added' };
/** The job being logged; blank until the WIP API is wired up. */
const JOB: { code: string; name: string; status: string; site: string; image: string; currentStage: string } = { code: '', name: '', status: '', site: '', image: '', currentStage: '' };
/** Stages, entries and blockers are kept in memory; empty until the WIP API is wired up. */
const STAGES: Stage[] = [];
let ENTRIES: Entry[] = [];
const BLOCKERS: Blocker[] = [];
let DRAFT: UpdateForm | null = null;

@Component({
  selector: 'app-progress-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './progress-log.html',
  // Buttons, controls, tabs, switches, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', '../shared/wip-board.css', './progress-log.css', '../shared/wip-purple-theme.css'],
})
export class ProgressLog implements OnDestroy {
  readonly icons = {
    ArrowRight, Boxes, CalendarDays, CircleCheck, CircleCheckBig, Clock, FileText, Globe, ImageIcon, Info, Layers, MapPin, Pencil, Plus, TriangleAlert, Upload, UsersRound,
    Wrench, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'timeline', label: 'Activity Timeline' },
    { key: 'entries', label: 'Progress Entries' },
    { key: 'stages', label: 'Stage Summary' },
    { key: 'outputs', label: 'Output Records' },
    { key: 'review', label: 'Review & Corrections' },
  ];
  readonly job = JOB;
  readonly stages = STAGES;
  readonly blockers = BLOCKERS;
  readonly updateTypes: EntryType[] = ['Work progress', 'Task update', 'Delay', 'Output', 'Note'];
  /** Operators; filled from master data once the API is wired. */
  readonly operators: string[] = [];
  readonly durations = [0, 15, 30, 45, 60, 90, 120, 180];
  readonly outputJob = OUTPUT_JOB;

  tab: Tab = 'timeline';

  // Timeline filters
  date = nowStamp().slice(0, 10);
  stageFilter = '';
  typeFilter = '';
  byFilter = '';

  form: UpdateForm = DRAFT ? structuredClone(DRAFT) : this.blankForm();
  formError = '';

  // Dialogs
  correcting: Entry | null = null;
  correctNotes = '';
  correctMinutes = 0;
  correctReason = '';
  attachment: { entry: Entry; name: string } | null = null;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  get now(): string {
    return nowStamp();
  }

  get entries(): Entry[] {
    return ENTRIES;
  }

  // ===== KPIs =====

  get allTasks(): Task[] {
    return this.stages.flatMap((s) => s.tasks);
  }

  get doneTasks(): number {
    return this.allTasks.filter((t) => t.done).length;
  }

  get taskPct(): number {
    return Math.round((this.doneTasks / Math.max(1, this.allTasks.length)) * 100);
  }

  get accepted(): number {
    return OUTPUTS.filter((o) => o.disposition === 'Accepted').length;
  }

  /** Labor from current entries: a corrected entry counts with its correction's time, once. */
  get laborHours(): number {
    const mins = this.entries.filter((e) => e.correctedBy === null).reduce((t, e) => t + e.minutes, 0);
    return Math.round((mins / 60) * 10) / 10;
  }

  get openBlockers(): Blocker[] {
    return this.blockers.filter((b) => b.status === 'Open');
  }

  get pendingReview(): Entry[] {
    return this.entries.filter((e) => e.review === 'Pending');
  }

  get reviewedToday(): number {
    const day = this.now.slice(0, 10);
    return this.entries.filter((e) => e.review === 'Reviewed' && e.at.slice(0, 10) === day).length;
  }

  // ===== Stages =====

  stageDone(s: Stage): number {
    return s.tasks.filter((t) => t.done).length;
  }

  stageStatus(s: Stage): 'Completed' | 'In Progress' | 'Pending' {
    const done = this.stageDone(s);
    if (done === s.tasks.length) return 'Completed';
    return done > 0 || s.name === this.currentStage ? 'In Progress' : 'Pending';
  }

  /** The first stage that is not complete. */
  get currentStage(): string {
    return this.stages.find((s) => s.tasks.some((t) => !t.done))?.name ?? 'Completed';
  }

  stageClass(status: string): string {
    return status === 'Completed' ? 'pill--green' : status === 'In Progress' ? 'pill--purple' : 'pill--grey';
  }

  task(id: string): Task | undefined {
    return this.allTasks.find((t) => t.id === id);
  }

  tasksOf(stage: string): Task[] {
    return this.stages.find((s) => s.name === stage)?.tasks ?? [];
  }

  // ===== Timeline =====

  get dates(): string[] {
    return [...new Set([this.now.slice(0, 10), ...this.entries.map((e) => e.at.slice(0, 10))])].sort().reverse();
  }

  get people(): string[] {
    return [...new Set(this.entries.map((e) => e.by))].sort();
  }

  get types(): EntryType[] {
    return [...new Set(this.entries.map((e) => e.type))];
  }

  get timeline(): Entry[] {
    return this.entries
      .filter(
        (e) =>
          (!this.date || e.at.slice(0, 10) === this.date) &&
          (!this.stageFilter || e.stage === this.stageFilter) &&
          (!this.typeFilter || e.type === this.typeFilter) &&
          (!this.byFilter || e.by === this.byFilter),
      )
      .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
  }

  typeClass(t: EntryType): string {
    return (
      {
        'System event': 'pill--blue', Verified: 'pill--green', Delay: 'pill--amber', 'Task update': 'pill--purple', Output: 'pill--green', 'Work progress': 'pill--blue',
        Note: 'pill--grey', Correction: 'pill--amber',
      } as Record<EntryType, string>
    )[t];
  }

  dotClass(t: EntryType): string {
    return 'dot--' + this.typeClass(t).replace('pill--', '');
  }

  entry(id: number | null): Entry | undefined {
    return id === null ? undefined : this.entries.find((e) => e.id === id);
  }

  openRef(e: Entry, r: Ref): void {
    if (r.kind === 'file') this.attachment = { entry: e, name: r.label };
    else if (r.kind === 'task') this.tab = 'stages';
  }

  // ===== Add update =====

  private blankForm(): UpdateForm {
    const testing = STAGES.find((s) => s.name === 'Testing');
    return {
      stage: testing ? 'Testing' : STAGES[0]?.name ?? '', task: testing?.tasks.find((t) => !t.done)?.id ?? '', type: 'Work progress', at: nowStamp(), operator: CURRENT_USER,
      minutes: 30, notes: '', files: [], complete: false,
    };
  }

  onStage(): void {
    const tasks = this.tasksOf(this.form.stage);
    if (!tasks.some((t) => t.id === this.form.task)) this.form.task = tasks.find((t) => !t.done)?.id ?? tasks[0]?.id ?? '';
    this.form.complete = false;
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const ok = files.filter((f) => f.size <= 10 * 1024 * 1024);
    if (ok.length < files.length) this.showToast('Files over 10 MB were not attached.', true);
    this.form.files = [...this.form.files, ...ok.map((f) => f.name)];
  }

  removeFile(name: string): void {
    this.form.files = this.form.files.filter((f) => f !== name);
  }

  get formTask(): Task | undefined {
    return this.task(this.form.task);
  }

  saveDraft(): void {
    DRAFT = structuredClone(this.form);
    this.showToast('Draft saved. It stays here until you submit or clear it.');
  }

  submitUpdate(): void {
    const f = this.form;
    const t = this.formTask;
    if (!f.stage || !f.at || !f.operator) return void (this.formError = 'Fill in the stage, event time and operator.');
    if (f.at > this.now) return void (this.formError = 'The event time cannot be in the future.');
    if (!f.notes.trim()) return void (this.formError = 'Describe the update in the notes.');
    if (f.complete) {
      if (!t) return void (this.formError = 'Choose the task to complete.');
      if (t.done) return void (this.formError = `${t.name} is already complete.`);
      if (t.checklistDone < t.checklistTotal) return void (this.formError = `Completion requires checklist and quality checks: ${t.name} checklist is ${t.checklistDone} / ${t.checklistTotal}.`);
    }
    this.formError = '';
    const id = Math.max(0, ...this.entries.map((e) => e.id)) + 1;
    const refs: Ref[] = [];
    if (t) refs.push({ kind: 'task', label: t.id });
    if (f.complete && t) refs.push({ kind: 'checklist', label: `${t.checklistDone} / ${t.checklistTotal}` });
    for (const name of f.files) refs.push({ kind: 'file', label: name });
    const type: EntryType = f.complete ? 'Task update' : f.type;
    const title = f.complete ? 'Task completed' : TITLES[f.type] ?? f.type;
    ENTRIES = [...ENTRIES, { id, at: f.at, type, title, by: f.operator, stage: f.stage, task: f.task, notes: f.notes.trim(), minutes: Number(f.minutes) || 0, refs, review: 'Pending', reviewedBy: '', correctionOf: null, correctedBy: null }];
    if (f.complete && t) t.done = true;
    if (type === 'Delay') this.blockers.push({ ref: `DLY-${id}`, title: f.notes.trim(), stage: f.stage, since: f.at, status: 'Open', note: 'Reported in the progress log' });
    DRAFT = null;
    this.form = this.blankForm();
    this.date = f.at.slice(0, 10);
    this.showToast(f.complete && t ? `${t.name} completed. The entry is waiting for review.` : 'Progress update posted for review.');
  }

  // ===== Review & corrections =====

  approve(e: Entry): void {
    e.review = 'Reviewed';
    e.reviewedBy = CURRENT_USER;
    this.showToast(`Entry at ${e.at.slice(11)} reviewed.`);
  }

  openCorrect(e: Entry): void {
    this.correcting = e;
    this.correctNotes = e.notes;
    this.correctMinutes = e.minutes;
    this.correctReason = '';
  }

  saveCorrection(): void {
    const e = this.correcting;
    if (!e || !this.correctReason.trim()) return;
    const id = Math.max(0, ...this.entries.map((x) => x.id)) + 1;
    ENTRIES = [
      ...ENTRIES,
      {
        id, at: this.now, type: 'Correction', title: `Correction to ${e.title.toLowerCase()} (${e.at.slice(11)})`, by: CURRENT_USER, stage: e.stage, task: e.task,
        notes: `${this.correctNotes.trim()} — Reason: ${this.correctReason.trim()}`, minutes: Number(this.correctMinutes) || 0, refs: e.refs.filter((r) => r.kind !== 'file'),
        review: 'Pending', reviewedBy: '', correctionOf: e.id, correctedBy: null,
      },
    ];
    // The original keeps its content; it is only linked to the correction
    e.correctedBy = id;
    this.correcting = null;
    this.showToast('Correction posted and linked to the original entry.');
  }

  get corrections(): Entry[] {
    return this.entries.filter((e) => e.correctionOf !== null);
  }

  resolveBlocker(b: Blocker): void {
    b.status = 'Resolved';
    this.showToast(`${b.ref} marked resolved for this job.`);
  }

  // ===== Output records =====

  get outputs() {
    return OUTPUTS;
  }

  handover(serial: string): string {
    const u = OUTPUTS.find((o) => o.serial === serial);
    return u ? handoverState(u) : '';
  }

  // ===== Export =====

  exportLog(): void {
    const rows = [...this.entries].sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({
      Time: e.at.replace('T', ' '), Type: e.type, Title: e.title, 'Logged By': e.by, Stage: e.stage, Task: e.task, Notes: e.notes, 'Time Spent (min)': e.minutes,
      References: e.refs.map((r) => r.label).join('; '), Review: e.review, 'Reviewed By': e.reviewedBy, 'Corrects Entry': e.correctionOf ?? '', 'Corrected By Entry': e.correctedBy ?? '',
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Progress Log');
    XLSX.writeFile(book, `Progress_Log_${this.job.code}.xlsx`);
  }

  fmtDate(day: string): string {
    return parseLocal(day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.correcting = null;
    this.attachment = null;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4500);
  }
}
