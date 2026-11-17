import { Component, DestroyRef, HostListener, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  ChartLine,
  ChevronDown,
  CircleCheck,
  CircleAlert,
  Clock,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  GitBranch,
  Info,
  ListChecks,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
} from 'lucide-angular';
import { JobTemplate, ResourceType, Stage, VersionEntry } from './job-template.model';

type Tab = 'general' | 'routing' | 'tasks' | 'resources' | 'quality' | 'sla' | 'access';
type ListKind = 'stage' | 'task' | 'checklist' | 'resource' | 'material' | 'check' | 'permit' | 'kpi' | 'alert';

interface ReadinessCheck {
  label: string;
  done: boolean;
  doneText: string;
  todoText: string;
  /** Tab where the check is fixed. */
  tab: Tab;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';

/** Templates are kept in memory; empty until the WIP API is wired up. */
const TEMPLATES: JobTemplate[] = [];

/** Empty template used while there are no templates to edit. */
function blankTemplate(): JobTemplate {
  return {
    code: '', name: '', version: '0.1', status: 'Draft', lastUpdated: '', lastUpdatedBy: '',
    general: {
      jobCategory: '', assetType: '', organization: '', defaultSite: '', outputItem: '', baseQuantity: 1, unit: 'Unit', estimatedHours: 0,
      defaultPriority: 'Medium', owner: '', description: '', requireApproval: false, allowParallel: false, batchTraceability: false,
    },
    stages: [], tasks: [], checklists: [], resources: [], materials: [],
    quality: { checks: [], permits: [], kpis: [] },
    sla: { targetHours: 0, warningPercent: 80, escalateTo: '', alerts: [] },
    access: { approvalPolicy: null, editors: [], viewers: [], versions: [] },
    execution: { reworkAllowed: false, completionGate: '', workflow: '' },
  };
}
/** Working copy of each template (unsaved edits survive leaving the page) and its last saved state. */
const WORKING = new Map<string, JobTemplate>();
const SAVED = new Map<string, string>();

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 1.3 -> 1.4 */
function nextVersion(v: string): string {
  const [major, minor] = v.split('.').map(Number);
  return `${major || 0}.${(minor || 0) + 1}`;
}

@Component({
  selector: 'app-job-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './job-templates.html',
  // Split to keep each stylesheet under the anyComponentStyle budget
  styleUrls: ['./job-templates.css', './job-templates-tabs.css', '../shared/wip-purple-theme.css'],
})
export class JobTemplates implements OnDestroy {
  readonly icons = {
    ArrowDown, ArrowRight, ArrowUp, BadgeCheck, ChartLine, ChevronDown, CircleCheck, CircleAlert, Clock, ClipboardCheck, ClipboardList, Eye,
    FileText, GitBranch, Info, ListChecks, Package, Pencil, Plus, RotateCcw, Save, Send, Settings, ShieldCheck, Trash2, Workflow, X,
  };

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'routing', label: 'Process & Routing' },
    { key: 'tasks', label: 'Tasks & Checklists' },
    { key: 'resources', label: 'Resources & Materials' },
    { key: 'quality', label: 'Quality & Compliance' },
    { key: 'sla', label: 'SLA & Alerts' },
    { key: 'access', label: 'Access & Version History' },
  ];

  // ===== Option lists =====
  readonly jobCategories = ['Manufacturing', 'Assembly', 'Maintenance', 'Repair', 'Inspection', 'Installation'];
  // Asset types, organizations and sites come from master data once the API is wired
  readonly assetTypes: string[] = [];
  readonly organizations: string[] = [];
  readonly sites: string[] = [];
  readonly units = ['Unit', 'Set', 'Kg', 'Litre', 'Metre'];
  readonly priorities = ['Low', 'Medium', 'High', 'Critical'];
  readonly roles = ['Production Manager', 'Maintenance Manager', 'Quality Manager', 'Operations Manager', 'Process Engineer', 'Quality Inspector', 'Operators'];
  readonly resourceTypes: ResourceType[] = ['Team', 'Role', 'Equipment'];
  readonly channels = ['In-app', 'Email', 'SMS', 'Email + SMS'];
  readonly workflows: string[] = [];
  readonly templateList = TEMPLATES.map((t) => ({ code: t.code, name: t.name }));

  t: JobTemplate = TEMPLATES.length ? this.working(TEMPLATES[0].code) : blankTemplate();
  tab: Tab = 'general';
  bannerOpen = true;
  switcherOpen = false;
  previewOpen = false;
  /** Readiness item to highlight after a failed publish. */
  showReadinessErrors = false;
  formError = '';
  private stageNameBefore = '';

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  private readonly router = inject(Router);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => {
        const code = params.get('code');
        const known = TEMPLATES.some((x) => x.code === code);
        this.t = known && code ? this.working(code) : TEMPLATES.length ? this.working(TEMPLATES[0].code) : blankTemplate();
        this.tab = 'general';
        this.showReadinessErrors = false;
        this.formError = '';
        this.previewOpen = this.switcherOpen = false;
      });
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  /** The editable copy of a template, created from the JSON the first time. */
  private working(code: string): JobTemplate {
    let t = WORKING.get(code);
    if (!t) {
      t = structuredClone(TEMPLATES.find((x) => x.code === code)!);
      WORKING.set(code, t);
      SAVED.set(code, JSON.stringify(t));
    }
    return t;
  }

  get dirty(): boolean {
    if (!SAVED.has(this.t.code)) return false;
    return JSON.stringify(this.t) !== SAVED.get(this.t.code);
  }

  openTemplate(code: string): void {
    this.switcherOpen = false;
    this.router.navigate([], { queryParams: { code } });
  }

  // ===== Readiness & linked configuration =====

  get readiness(): ReadinessCheck[] {
    const g = this.t.general;
    const general = !!(this.t.name.trim() && this.t.code.trim() && g.jobCategory && g.assetType && g.organization && g.defaultSite && g.outputItem.trim() && g.baseQuantity > 0 && g.unit && g.owner);
    const policy = this.t.access.approvalPolicy;
    return [
      { label: 'General details', done: general, doneText: 'Basic template information is complete', todoText: 'Fill in the required template details', tab: 'general' },
      { label: 'Routing configured', done: this.t.stages.length > 0 && this.t.stages.every((s) => s.name.trim() && s.durationHours > 0), doneText: 'Process flow and stages defined', todoText: 'Add stages with a name and duration', tab: 'routing' },
      { label: 'Tasks & checklists', done: this.t.tasks.length > 0 && this.t.checklists.length > 0, doneText: 'Tasks and checklists are configured', todoText: 'Add tasks and at least one checklist', tab: 'tasks' },
      { label: 'Resources & materials', done: this.t.resources.length > 0 && this.t.materials.length > 0, doneText: 'Resource assignments and materials defined', todoText: 'Add resources and material items', tab: 'resources' },
      g.requireApproval
        ? { label: policy?.approvers.length ? 'Approval policy set' : 'Approval policy pending', done: !!policy?.approvers.length, doneText: `${policy?.minApprovals ?? 0} approval(s) from ${policy?.approvers.join(', ')}`, todoText: 'Configure approval policy for release', tab: 'access' }
        : { label: 'Approval not required', done: true, doneText: 'Released without approval', todoText: '', tab: 'access' },
    ];
  }

  get readyCount(): number {
    return this.readiness.filter((r) => r.done).length;
  }

  get stagesHours(): number {
    return this.t.stages.reduce((s, x) => s + (Number(x.durationHours) || 0), 0);
  }

  get linked(): { label: string; value: string; icon: keyof JobTemplates['icons']; tab: Tab }[] {
    const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    return [
      { label: 'Process stages', value: n(this.t.stages.length, 'stage'), icon: 'Workflow', tab: 'routing' },
      { label: 'Tasks', value: n(this.t.tasks.length, 'task'), icon: 'ListChecks', tab: 'tasks' },
      { label: 'Checklists', value: n(this.t.checklists.length, 'checklist'), icon: 'ClipboardCheck', tab: 'tasks' },
      { label: 'Material items', value: n(this.t.materials.length, 'material item'), icon: 'Package', tab: 'resources' },
      { label: 'Permit rules', value: n(this.t.quality.permits.length, 'permit rule'), icon: 'FileText', tab: 'quality' },
      { label: 'KPI definitions', value: n(this.t.quality.kpis.length, 'KPI definition'), icon: 'ChartLine', tab: 'quality' },
    ];
  }

  get stageNames(): string[] {
    return this.t.stages.map((s) => s.name).filter((n) => !!n.trim());
  }

  hasResource(name: string): boolean {
    return this.t.resources.some((r) => r.name === name);
  }

  tasksIn(stage: string): number {
    return this.t.tasks.filter((x) => x.stage === stage).length;
  }

  // ===== Lists =====

  private nextId(): number {
    const all = [
      ...this.t.stages, ...this.t.tasks, ...this.t.checklists, ...this.t.resources, ...this.t.materials,
      ...this.t.quality.checks, ...this.t.quality.permits, ...this.t.quality.kpis, ...this.t.sla.alerts,
    ];
    return Math.max(0, ...all.map((x) => x.id)) + 1;
  }

  add(kind: ListKind): void {
    const id = this.nextId();
    const stage = this.stageNames[0] ?? '';
    switch (kind) {
      case 'stage':
        this.t.stages = [...this.t.stages, { id, name: `Stage ${this.t.stages.length + 1}`, durationHours: 1, resource: '', checklist: '', gate: '' }];
        break;
      case 'task':
        this.t.tasks = [...this.t.tasks, { id, stage, name: '', durationMins: 15, mandatory: true, skill: '' }];
        break;
      case 'checklist':
        this.t.checklists = [...this.t.checklists, { id, name: '', stage, items: 1 }];
        break;
      case 'resource':
        this.t.resources = [...this.t.resources, { id, name: '', type: 'Team', quantity: 1, stage }];
        break;
      case 'material':
        this.t.materials = [...this.t.materials, { id, code: '', name: '', quantity: 1, unit: 'Unit', stage }];
        break;
      case 'check':
        this.t.quality.checks = [...this.t.quality.checks, { id, name: '', stage, criteria: '' }];
        break;
      case 'permit':
        this.t.quality.permits = [...this.t.quality.permits, { id, name: '', stage, issuer: '' }];
        break;
      case 'kpi':
        this.t.quality.kpis = [...this.t.quality.kpis, { id, name: '', target: 0, unit: '%' }];
        break;
      case 'alert':
        this.t.sla.alerts = [...this.t.sla.alerts, { id, event: '', notify: this.t.general.owner, channel: 'In-app' }];
        break;
    }
  }

  remove(kind: ListKind, id: number): void {
    const without = <T extends { id: number }>(list: T[]) => list.filter((x) => x.id !== id);
    switch (kind) {
      case 'stage': {
        const stage = this.t.stages.find((s) => s.id === id);
        const orphanTasks = stage ? this.tasksIn(stage.name) : 0;
        this.t.stages = without(this.t.stages);
        if (stage && orphanTasks) {
          this.t.tasks = this.t.tasks.filter((x) => x.stage !== stage.name);
          this.showToast(`Stage "${stage.name}" and its ${orphanTasks} task${orphanTasks > 1 ? 's' : ''} removed.`);
        }
        break;
      }
      case 'task': this.t.tasks = without(this.t.tasks); break;
      case 'checklist': {
        const c = this.t.checklists.find((x) => x.id === id);
        this.t.checklists = without(this.t.checklists);
        if (c) this.t.stages.forEach((s) => s.checklist === c.name && (s.checklist = ''));
        break;
      }
      case 'resource': this.t.resources = without(this.t.resources); break;
      case 'material': this.t.materials = without(this.t.materials); break;
      case 'check': this.t.quality.checks = without(this.t.quality.checks); break;
      case 'permit': this.t.quality.permits = without(this.t.quality.permits); break;
      case 'kpi': this.t.quality.kpis = without(this.t.quality.kpis); break;
      case 'alert': this.t.sla.alerts = without(this.t.sla.alerts); break;
    }
  }

  moveStage(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.t.stages.length) return;
    const stages = [...this.t.stages];
    [stages[index], stages[to]] = [stages[to], stages[index]];
    this.t.stages = stages;
  }

  rememberStageName(s: Stage): void {
    this.stageNameBefore = s.name;
  }

  /** Keeps tasks, checklists and other references pointing at a renamed stage. */
  stageRenamed(s: Stage): void {
    const before = this.stageNameBefore;
    if (!before || before === s.name) return;
    for (const list of [this.t.tasks, this.t.checklists, this.t.resources, this.t.materials, this.t.quality.checks, this.t.quality.permits]) {
      list.forEach((x) => x.stage === before && (x.stage = s.name));
    }
    this.stageNameBefore = s.name;
  }

  // ===== Access =====

  get approvalEnabled(): boolean {
    return !!this.t.access.approvalPolicy;
  }

  setApprovalEnabled(on: boolean): void {
    this.t.access.approvalPolicy = on ? { approvers: [], minApprovals: 1 } : null;
  }

  toggleRole(list: string[], role: string, on: boolean): void {
    const i = list.indexOf(role);
    if (on && i < 0) list.push(role);
    if (!on && i >= 0) list.splice(i, 1);
  }

  // ===== Save / publish =====

  private validate(): boolean {
    if (!this.t.name.trim() || !this.t.code.trim()) {
      this.tab = 'general';
      this.formError = 'Template name and template code are required.';
      return false;
    }
    this.formError = '';
    return true;
  }

  private versionEntry(status: VersionEntry['status'], note: string): void {
    const versions = this.t.access.versions;
    const last = versions[versions.length - 1];
    const entry: VersionEntry = { version: this.t.version, date: this.today, by: CURRENT_USER, note, status };
    if (last && last.version === this.t.version) versions[versions.length - 1] = { ...entry, note: last.status === 'Draft' && status === 'Draft' ? last.note : note };
    else versions.push(entry);
  }

  private commit(): void {
    this.t.lastUpdated = this.today;
    this.t.lastUpdatedBy = CURRENT_USER;
    SAVED.set(this.t.code, JSON.stringify(this.t));
  }

  saveDraft(): void {
    if (!this.validate()) return;
    // Editing a published template starts the next version as a draft
    if (this.t.status === 'Published') {
      if (!this.dirty) {
        this.showToast('No changes to save.');
        return;
      }
      this.t.version = nextVersion(this.t.version);
      this.t.status = 'Draft';
    }
    this.versionEntry('Draft', 'Draft saved');
    this.commit();
    this.showToast(`Draft saved (version ${this.t.version}).`);
  }

  publish(): void {
    if (!this.validate()) return;
    const missing = this.readiness.filter((r) => !r.done);
    if (missing.length) {
      this.showReadinessErrors = true;
      this.showToast(`Cannot publish yet: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`, true);
      return;
    }
    if (this.t.status === 'Published' && !this.dirty) {
      this.showToast(`Version ${this.t.version} is already published.`);
      return;
    }
    if (this.t.status === 'Published') this.t.version = nextVersion(this.t.version);
    this.t.status = 'Published';
    this.versionEntry('Published', 'Published');
    this.commit();
    this.showReadinessErrors = false;
    this.showToast(`Version ${this.t.version} published. New job orders will use it.`);
  }

  /** Throws away unsaved edits. */
  cancel(): void {
    if (!this.dirty) {
      this.showToast('No unsaved changes.');
      return;
    }
    const saved = JSON.parse(SAVED.get(this.t.code)!) as JobTemplate;
    WORKING.set(this.t.code, saved);
    this.t = saved;
    this.formError = '';
    this.showToast('Unsaved changes discarded.');
  }

  // ===== Menus =====

  @HostListener('document:click')
  closeMenus(): void {
    this.switcherOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    this.previewOpen = false;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    // Edits are only kept in memory, so warn before a reload loses them
    if ([...WORKING.keys()].some((code) => JSON.stringify(WORKING.get(code)) !== SAVED.get(code))) event.preventDefault();
  }

  toggleSwitcher(event: Event): void {
    event.stopPropagation();
    this.switcherOpen = !this.switcherOpen;
  }

  readonly today = toIsoDate(new Date());

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
