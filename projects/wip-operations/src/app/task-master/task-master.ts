import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-angular';
import { TaskDef, TaskVersion } from './task.model';

type Tab = 'general' | 'instructions' | 'checklist' | 'resources' | 'materials' | 'safety' | 'sla' | 'versions';

interface Check {
  label: string;
  done: boolean;
  tab: Tab;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';

/** Tasks are kept in memory; empty until the WIP API is wired up. */
const TASKS: TaskDef[] = [];

/** Empty task used while there are no tasks to edit. */
function blankTask(): TaskDef {
  return {
    code: '', name: '', version: '0.1', status: 'Draft', lastUpdated: '', lastUpdatedBy: '', usedIn: [],
    general: { category: '', taskType: '', assetType: '', durationMins: 0, priority: 'Medium', responsibleRole: '', owner: '', description: '' },
    instructions: [], sop: null, measurements: [], captureReadings: false, requirePassFail: false,
    resources: { skill: '', resourceType: '', defaultAsset: '', crewSize: '', tools: [] },
    checklist: { name: '', items: [], photoEvidence: 'Optional', minPhotos: 0, signature: 'None', attachment: 'Optional' },
    materials: [],
    safety: { ppe: [], hazards: [], permitRequired: false, permitType: '', isolationRequired: false },
    completion: { rules: [], failureAction: '' },
    controls: { mandatory: false, allowSkip: false, approvalRequired: false, slaMins: 0 },
    notifications: { warnPercent: 80, onComplete: '', onFail: '', onOverdue: '' },
    versions: [],
  };
}
const WORKING = new Map<string, TaskDef>();
const SAVED = new Map<string, string>();
/** SOP files picked in this session, by task code. */
const SOP_FILES = new Map<string, File>();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function nextVersion(v: string): string {
  const [major, minor] = v.split('.').map(Number);
  return `${major || 0}.${(minor || 0) + 1}`;
}

@Component({
  selector: 'app-task-master',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './task-master.html',
  // Buttons, controls, cards, tabs, switches, tables, modal and toast come from the Job Templates stylesheets
  styleUrls: ['../job-templates/job-templates.css', '../job-templates/job-templates-tabs.css', './task-master.css', '../shared/wip-purple-theme.css'],
})
export class TaskMaster implements OnDestroy {
  readonly icons = { ArrowDown, ArrowUp, ChevronDown, CircleAlert, CircleCheck, ClipboardList, ExternalLink, Eye, FileText, Info, Paperclip, Plus, Save, Send, Trash2, X };

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'checklist', label: 'Checklist & Evidence' },
    { key: 'resources', label: 'Resources & Tools' },
    { key: 'materials', label: 'Materials' },
    { key: 'safety', label: 'Safety & Quality' },
    { key: 'sla', label: 'SLA & Notifications' },
    { key: 'versions', label: 'Version History' },
  ];

  // ===== Option lists =====
  readonly categories = ['Testing', 'Assembly', 'Inspection', 'Maintenance', 'Preparation', 'Packing'];
  readonly taskTypes = ['Measurement', 'Operation', 'Inspection', 'Approval', 'Data Entry'];
  // Asset types, default assets and named checklists come from master data once the API is wired
  readonly assetTypes: string[] = [];
  readonly priorities = ['Low', 'Medium', 'High', 'Critical'];
  readonly roles = ['Test Technician', 'Fitter', 'QC Inspector', 'Electrician', 'Operator', 'Quality Supervisor', 'Production Manager', 'Process Engineer'];
  readonly skills = ['Pressure Testing', 'Mechanical Assembly', 'Electrical testing', 'Final QC', 'Valve repair', 'Welding'];
  readonly resourceTypes = ['Test Bench', 'Workstation', 'Equipment', 'Tool', 'Person', 'Team'];
  readonly assets = [''];
  readonly crewSizes = ['1 technician', '2 technicians', '3 technicians', 'Team'];
  readonly checklists: string[] = [];
  readonly evidenceOptions = ['Required', 'Optional', 'Not needed'];
  readonly signatureOptions = ['Technician', 'Technician + Supervisor', 'Supervisor', 'None'];
  readonly failureActions = ['Create defect & route to rework', 'Repeat task', 'Hold job & notify supervisor', 'Scrap unit'];
  readonly units = ['Unit', 'Litre', 'Kg', 'Roll', 'Set', 'Metre'];
  readonly taskList = TASKS.map((t) => ({ code: t.code, name: t.name }));

  t: TaskDef = TASKS.length ? this.working(TASKS[0].code) : blankTask();
  tab: Tab = 'general';
  switcherOpen = false;
  previewOpen = false;
  usageOpen = false;
  showChecks = false;
  formError = '';
  newTool = '';
  newPpe = '';
  newHazard = '';

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private sopUrl: string | null = null;

  private readonly router = inject(Router);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const code = p.get('code');
        this.t = code && TASKS.some((x) => x.code === code) ? this.working(code) : TASKS.length ? this.working(TASKS[0].code) : blankTask();
        this.tab = 'general';
        this.formError = '';
        this.showChecks = this.previewOpen = this.usageOpen = this.switcherOpen = false;
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    if (this.sopUrl) URL.revokeObjectURL(this.sopUrl);
  }

  private working(code: string): TaskDef {
    let t = WORKING.get(code);
    if (!t) {
      t = structuredClone(TASKS.find((x) => x.code === code)!);
      WORKING.set(code, t);
      SAVED.set(code, JSON.stringify(t));
    }
    return t;
  }

  get dirty(): boolean {
    if (!SAVED.has(this.t.code)) return false;
    return JSON.stringify(this.t) !== SAVED.get(this.t.code);
  }

  openTask(code: string): void {
    this.switcherOpen = false;
    this.router.navigate([], { queryParams: { code } });
  }

  get usageLabel(): string {
    const n = this.t.usedIn.length;
    return n ? `Used in ${n} process stage${n === 1 ? '' : 's'}` : 'Not used in any process stage yet';
  }

  // ===== Readiness =====

  get checks(): Check[] {
    const g = this.t.general;
    return [
      { label: 'Task name, code, category and owner', done: !!(this.t.name.trim() && this.t.code && g.category && g.owner && g.responsibleRole), tab: 'general' },
      { label: 'At least one work instruction', done: this.t.instructions.some((s) => s.trim()), tab: 'instructions' },
      { label: 'Checklist chosen with items', done: !!this.t.checklist.name && this.t.checklist.items.length > 0, tab: 'checklist' },
      { label: 'Readings defined when captured', done: !this.t.captureReadings || this.t.measurements.some((m) => m.parameter.trim()), tab: 'safety' },
      { label: 'Permit type set when a permit is required', done: !this.t.safety.permitRequired || !!this.t.safety.permitType.trim(), tab: 'safety' },
      { label: 'At least one completion rule', done: this.t.completion.rules.some((r) => r.on), tab: 'general' },
    ];
  }

  get missing(): Check[] {
    return this.checks.filter((c) => !c.done);
  }

  // ===== Instructions =====

  addStep(): void {
    this.t.instructions = [...this.t.instructions, ''];
  }

  removeStep(i: number): void {
    this.t.instructions = this.t.instructions.filter((_, n) => n !== i);
  }

  moveStep(i: number, delta: number): void {
    const to = i + delta;
    if (to < 0 || to >= this.t.instructions.length) return;
    const list = [...this.t.instructions];
    [list[i], list[to]] = [list[to], list[i]];
    this.t.instructions = list;
  }

  /** ngFor over strings re-renders inputs on every keystroke without this. */
  trackIndex(i: number): number {
    return i;
  }

  onSopFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      this.showToast('The SOP file can be up to 25 MB.', true);
      return;
    }
    SOP_FILES.set(this.t.code, file);
    this.t.sop = { name: file.name, revision: this.t.sop?.revision ?? 'Rev A' };
    this.showToast(`${file.name} attached.`);
  }

  viewSop(): void {
    const file = SOP_FILES.get(this.t.code);
    if (!file) {
      this.showToast(`${this.t.sop?.name ?? 'The SOP'} is a sample record with no stored file. Attach the file to view it.`);
      return;
    }
    if (this.sopUrl) URL.revokeObjectURL(this.sopUrl);
    this.sopUrl = URL.createObjectURL(file);
    window.open(this.sopUrl, '_blank', 'noopener');
  }

  removeSop(): void {
    SOP_FILES.delete(this.t.code);
    this.t.sop = null;
  }

  // ===== Lists =====

  private nextId(list: { id: number }[]): number {
    return Math.max(0, ...list.map((x) => x.id)) + 1;
  }

  addMeasurement(): void {
    this.t.measurements = [...this.t.measurements, { id: this.nextId(this.t.measurements), parameter: '', target: '', unit: '', required: true }];
  }

  removeMeasurement(id: number): void {
    this.t.measurements = this.t.measurements.filter((m) => m.id !== id);
  }

  addChecklistItem(): void {
    this.t.checklist.items = [...this.t.checklist.items, { id: this.nextId(this.t.checklist.items), text: '', mandatory: true }];
  }

  removeChecklistItem(id: number): void {
    this.t.checklist.items = this.t.checklist.items.filter((x) => x.id !== id);
  }

  addMaterial(): void {
    this.t.materials = [...this.t.materials, { id: this.nextId(this.t.materials), code: '', name: '', quantity: 1, unit: 'Unit', optional: false }];
  }

  removeMaterial(id: number): void {
    this.t.materials = this.t.materials.filter((m) => m.id !== id);
  }

  /** Adds a word to a list (tools, PPE, hazards) and clears its input. */
  addTo(list: string[], value: string): string {
    const v = value.trim();
    if (v && !list.includes(v)) list.push(v);
    return '';
  }

  removeFrom(list: string[], value: string): void {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
  }

  // ===== Save / publish =====

  private versionEntry(status: TaskVersion['status'], note: string): void {
    const versions = this.t.versions;
    const last = versions[versions.length - 1];
    const entry: TaskVersion = { version: this.t.version, date: today(), by: CURRENT_USER, note, status };
    if (last && last.version === this.t.version) versions[versions.length - 1] = { ...entry, note: status === 'Draft' && last.status === 'Draft' ? last.note : note };
    else versions.push(entry);
  }

  private commit(): void {
    this.t.lastUpdated = today();
    this.t.lastUpdatedBy = CURRENT_USER;
    this.t.instructions = this.t.instructions.map((s) => s.trim()).filter(Boolean);
    SAVED.set(this.t.code, JSON.stringify(this.t));
  }

  saveDraft(): void {
    if (!this.t.name.trim()) {
      this.tab = 'general';
      this.formError = 'The task name is required.';
      return;
    }
    this.formError = '';
    if (this.t.status === 'Published') {
      if (!this.dirty) return this.showToast('No changes to save.');
      this.t.version = nextVersion(this.t.version);
      this.t.status = 'Draft';
    }
    this.versionEntry('Draft', 'Draft saved');
    this.commit();
    this.showToast(`Draft saved (version ${this.t.version}).`);
  }

  publish(): void {
    if (this.missing.length) {
      this.showChecks = true;
      this.showToast(`Cannot publish yet: ${this.missing.length} item${this.missing.length > 1 ? 's' : ''} to complete.`, true);
      return;
    }
    if (this.t.status === 'Published' && !this.dirty) return this.showToast(`Version ${this.t.version} is already published.`);
    if (this.t.status === 'Published') this.t.version = nextVersion(this.t.version);
    this.t.status = 'Published';
    this.versionEntry('Published', 'Published');
    this.commit();
    this.showChecks = false;
    const n = this.t.usedIn.length;
    this.showToast(`Version ${this.t.version} published.${n ? ` New job orders for the ${n} stage${n > 1 ? 's' : ''} using it get this version.` : ''}`);
  }

  cancel(): void {
    if (!this.dirty) return this.showToast('No unsaved changes.');
    const saved = JSON.parse(SAVED.get(this.t.code)!) as TaskDef;
    WORKING.set(this.t.code, saved);
    this.t = saved;
    this.formError = '';
    this.showToast('Unsaved changes discarded.');
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
    this.previewOpen = this.usageOpen = this.showChecks = false;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if ([...WORKING.keys()].some((code) => JSON.stringify(WORKING.get(code)) !== SAVED.get(code))) event.preventDefault();
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
