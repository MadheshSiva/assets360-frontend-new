import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  LucideAngularModule,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Lightbulb,
  Paperclip,
  Save,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { Checklist, Inspection, InspectionResponse, InspectionTask, SignOffStep } from '../shared/inspection.models';
import { fmtDate, pillClass } from '../shared/insp-utils';

interface WizardForm {
  title: string;
  inspectionTypeName: string;
  priority: string;
  siteName: string;
  department: string;
  planCode: string;
  trigger: string;
  description: string;
  scope: string;
  category: string;
  referenceStandard: string;
  permitRequired: boolean;
  evidenceRequired: boolean;
  assetCode: string;
  assetName: string;
  location: string;
  checklistCode: string;
  assignedTo: string;
  assignedTeam: string;
  dueDate: string;
  startTime: string;
  endTime: string;
}

type Field = keyof WizardForm;

const STEPS = ['Details', 'Assets & Scope', 'Checklist', 'Assign & Schedule', 'Review & Submit'];

function blankForm(): WizardForm {
  return {
    title: '', inspectionTypeName: '', priority: '', siteName: '', department: '', planCode: '', trigger: '',
    description: '', scope: 'Asset-based', category: '', referenceStandard: '', permitRequired: false, evidenceRequired: true,
    assetCode: '', assetName: '', location: '', checklistCode: '', assignedTo: '', assignedTeam: '', dueDate: '', startTime: '09:00', endTime: '10:00'
  };
}

function uniq(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && !!v.trim()))].sort();
}

/** Local 'HH:mm' of an ISO date-time. */
function hhmm(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'Safety Inspection' -> 'Safety'. */
function shortType(name: string): string {
  return name.replace(/\s+inspection$/i, '').trim() || name;
}

@Component({
  selector: 'app-insp-new-inspection',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './new-inspection.html',
  styleUrls: ['../shared/insp-page.css', './new-inspection.css']
})
export class NewInspectionPage {
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly icons = { ArrowLeft, ArrowRight, Check, ClipboardList, Lightbulb, Paperclip, Save, X };
  readonly steps = STEPS;
  readonly priorities = ['Critical', 'High', 'Medium', 'Low'];
  readonly triggers = ['Scheduled', 'Manual', 'Event'];
  readonly categories = ['Internal', 'External', 'Regulatory', 'Third-party'];
  readonly fmtDate = fmtDate;
  readonly pillClass = pillClass;

  readonly inspections = this.api.inspections;
  readonly types = this.api.types;
  readonly checklists = this.api.checklists;
  readonly plans = this.api.plans;

  form: WizardForm = blankForm();
  step = 1;
  visited = 1;
  /** Steps whose required fields should be highlighted. */
  private readonly checked = new Set<number>();
  /** Draft being edited (from ?id=). */
  editing: Inspection | null = null;
  attachments: string[] = [];
  dragOver = false;
  readonly saving = signal(false);
  saveError = '';

  private readonly draftId = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('id'))), { initialValue: null });
  readonly draftMissing = computed(() => {
    const id = this.draftId();
    return !!id && this.inspections.loaded() && !this.inspections.byId(id);
  });

  constructor() {
    for (const s of [this.inspections, this.types, this.checklists, this.plans, this.api.tasks, this.api.signatures, this.api.calendars]) s.load();

    // Reopen a draft once the inspections have loaded
    effect(() => {
      const rec = this.inspections.byId(this.draftId());
      if (rec && rec.id !== this.editing?.id) untracked(() => this.fill(rec));
    });
  }

  // ===== Options built from loaded data =====
  readonly activeTypes = computed(() => this.types.items().filter((t) => t.isActive !== false));
  readonly sites = computed(() => uniq([...this.inspections.items().map((i) => i.siteName), ...this.api.calendars.items().map((c) => c.siteName)]));
  readonly departments = computed(() => uniq(this.inspections.items().map((i) => i.department)));
  readonly teams = computed(() => uniq(this.inspections.items().map((i) => i.assignedTeam)));
  readonly people = computed(() =>
    uniq([
      ...this.inspections.items().map((i) => i.assignedTo),
      ...this.plans.items().map((p) => p.inspectorName),
      ...this.api.signatures.items().map((s) => s.user)
    ])
  );
  readonly taskByCode = computed(() => new Map(this.api.tasks.items().map((t) => [t.taskCode, t] as const)));

  /** Published / active checklists, those for the chosen type first. */
  checklistOptions(): Checklist[] {
    const type = this.form.inspectionTypeName;
    return this.checklists
      .items()
      .filter((c) => c.status === 'Published' || c.isActive || c.checklistCode === this.form.checklistCode)
      .sort((a, b) => Number(b.inspectionTypeName === type) - Number(a.inspectionTypeName === type) || a.templateName.localeCompare(b.templateName));
  }

  get selectedChecklist(): Checklist | undefined {
    return this.checklists.items().find((c) => c.checklistCode === this.form.checklistCode);
  }

  get defaultChecklistCode(): string {
    return this.types.items().find((t) => t.inspectionTypeName === this.form.inspectionTypeName)?.defaultChecklistCode ?? '';
  }

  taskCount(c: Checklist): number {
    return c.sections.reduce((n, s) => n + s.tasks.length, 0);
  }

  mandatoryCount(c: Checklist): number {
    return c.sections.reduce((n, s) => n + s.tasks.filter((t) => t.isMandatory).length, 0);
  }

  estimatedMinutes(c: Checklist): number {
    const byCode = this.taskByCode();
    return c.sections.reduce((n, s) => n + s.tasks.reduce((m, t) => m + (byCode.get(t.taskCode)?.estimatedDurationMinutes ?? 0), 0), 0);
  }

  // ===== Prefills =====
  onTypeChange(name: string): void {
    this.form.inspectionTypeName = name;
    const t = this.types.items().find((x) => x.inspectionTypeName === name);
    if (!t) return;
    if (t.defaultPriority) this.form.priority = t.defaultPriority;
    if (t.defaultChecklistCode) this.form.checklistCode = t.defaultChecklistCode;
    this.form.permitRequired = t.permitRequired;
    this.form.evidenceRequired = t.photoEvidenceOnFailure;
    if (!this.form.title) this.form.title = name;
  }

  onPlanChange(code: string): void {
    this.form.planCode = code;
    const p = this.plans.items().find((x) => x.planCode === code);
    if (!p) return;
    this.form.trigger = 'Scheduled';
    if (p.inspectionTypeName && !this.form.inspectionTypeName) this.onTypeChange(p.inspectionTypeName);
    if (p.checklistCode) this.form.checklistCode = p.checklistCode;
    if (p.inspectorName && !this.form.assignedTo) this.form.assignedTo = p.inspectorName;
    if (p.nextDueDate && !this.form.dueDate) this.form.dueDate = p.nextDueDate.slice(0, 10);
  }

  // ===== Validation =====
  private required(step: number): Field[] {
    switch (step) {
      case 1: return ['title', 'inspectionTypeName', 'priority', 'siteName', 'trigger', 'description', 'category'];
      case 2: return this.form.scope === 'Location-based' ? ['location'] : ['assetCode', 'assetName'];
      case 3: return ['checklistCode'];
      case 4: return ['assignedTo', 'dueDate'];
      default: return [];
    }
  }

  private stepErrors(step: number): string[] {
    const missing = this.required(step).filter((f) => !String(this.form[f]).trim());
    const errs = missing.length ? ['Fill in the required fields marked with an asterisk.'] : [];
    if (step === 4 && this.form.startTime && this.form.endTime && this.form.endTime <= this.form.startTime) errs.push('End time must be after the start time.');
    return errs;
  }

  bad(f: Field): boolean {
    return this.checked.has(this.step) && this.required(this.step).includes(f) && !String(this.form[f]).trim();
  }

  get errors(): string[] {
    return this.checked.has(this.step) ? this.stepErrors(this.step) : [];
  }

  // ===== Navigation =====
  next(): void {
    this.checked.add(this.step);
    if (this.stepErrors(this.step).length) return;
    this.step++;
    this.visited = Math.max(this.visited, this.step);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  back(): void {
    if (this.step > 1) this.step--;
  }

  goTo(n: number): void {
    if (n <= this.visited) this.step = n;
  }

  // ===== Attachments (UI only, not uploaded) =====
  addFiles(list: FileList | null | undefined): void {
    for (const f of Array.from(list ?? [])) if (!this.attachments.includes(f.name)) this.attachments.push(f.name);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver = false;
    this.addFiles(ev.dataTransfer?.files);
  }

  // ===== Save =====
  saveDraft(): void {
    if (!this.form.title.trim()) {
      this.step = 1;
      this.checked.add(1);
      this.saveError = 'Give the inspection a title before saving the draft.';
      return;
    }
    this.persist('Draft');
  }

  submit(): void {
    for (let s = 1; s <= 4; s++) {
      if (this.stepErrors(s).length) {
        this.checked.add(s);
        this.step = s;
        return;
      }
    }
    this.persist('Scheduled');
  }

  private persist(status: 'Draft' | 'Scheduled'): void {
    const f = this.form;
    const chk = this.selectedChecklist;
    const plan = this.plans.items().find((p) => p.planCode === f.planCode);
    const prev = this.editing;
    const at = (time: string) => (f.dueDate && time ? new Date(`${f.dueDate}T${time}:00`).toISOString() : null);
    const keepResponses = !!prev?.responses?.length && prev.checklistCode === f.checklistCode;
    const responses = status === 'Scheduled' && chk && !keepResponses ? this.buildResponses(chk) : (prev?.responses ?? []);
    const signOff: SignOffStep[] = prev?.signOff?.length
      ? prev.signOff
      : [
          { role: 'Inspector', name: f.assignedTo, state: 'Pending', signedAt: null },
          { role: 'Reviewer', name: '', state: 'Pending', signedAt: null }
        ];

    const body: Partial<Inspection> = {
      ...(prev ?? {}),
      title: f.title.trim(),
      inspectionTypeName: f.inspectionTypeName,
      typeShort: shortType(f.inspectionTypeName),
      priority: f.priority,
      siteName: f.siteName,
      department: f.department,
      planCode: f.planCode,
      planName: plan?.planName ?? '',
      trigger: f.trigger,
      description: f.description,
      scope: f.scope,
      category: f.category,
      referenceStandard: f.referenceStandard,
      permitRequired: f.permitRequired,
      evidenceRequired: f.evidenceRequired,
      assetCode: f.scope === 'Asset-based' ? f.assetCode : '',
      assetName: f.scope === 'Asset-based' ? f.assetName : '',
      location: f.location,
      assignedTo: f.assignedTo,
      assignedTeam: f.assignedTeam,
      dueDate: f.dueDate || null,
      scheduledStart: at(f.startTime),
      scheduledEnd: at(f.endTime),
      startedAt: prev?.startedAt ?? null,
      completedAt: null,
      findingsCount: prev?.findingsCount ?? 0,
      checklistCode: f.checklistCode,
      checklistName: chk ? `${chk.templateName}${chk.versionLabel ? ' ' + chk.versionLabel : ''}` : '',
      responses,
      signOff: signOff.map((s) => (s.role === 'Inspector' && s.state !== 'Signed' ? { ...s, name: f.assignedTo } : s)),
      status
    };

    this.saving.set(true);
    this.saveError = '';
    this.inspections.save(body).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/inspection/overview']);
      },
      error: (e) => {
        this.saving.set(false);
        this.saveError = apiErrorMessage(e);
      }
    });
  }

  /** One pending response per checklist task, with limits and procedure from the task library. */
  private buildResponses(chk: Checklist): InspectionResponse[] {
    const byCode = this.taskByCode();
    return [...chk.sections]
      .sort((a, b) => a.order - b.order)
      .flatMap((s) =>
        [...s.tasks]
          .sort((a, b) => a.order - b.order)
          .map((t) => {
            const lib: InspectionTask | undefined = byCode.get(t.taskCode);
            return {
              sectionName: s.sectionName,
              taskCode: t.taskCode,
              taskTitle: t.taskTitle || lib?.taskTitle || t.taskCode,
              responseType: t.responseType || lib?.responseType || 'Pass / Fail',
              unit: lib?.unit ?? '',
              minValue: lib?.minValue ?? null,
              maxValue: lib?.maxValue ?? null,
              procedure: lib?.procedure || t.acceptanceCriteria || '',
              required: t.isMandatory,
              reading: '',
              result: '',
              notes: '',
              evidence: []
            };
          })
      );
  }

  private fill(i: Inspection): void {
    this.editing = i;
    this.form = {
      title: i.title ?? '',
      inspectionTypeName: i.inspectionTypeName ?? '',
      priority: i.priority || 'Medium',
      siteName: i.siteName ?? '',
      department: i.department ?? '',
      planCode: i.planCode ?? '',
      trigger: i.trigger || 'Manual',
      description: i.description ?? '',
      scope: i.scope || 'Asset-based',
      category: i.category || 'Internal',
      referenceStandard: i.referenceStandard ?? '',
      permitRequired: !!i.permitRequired,
      evidenceRequired: !!i.evidenceRequired,
      assetCode: i.assetCode ?? '',
      assetName: i.assetName ?? '',
      location: i.location ?? '',
      checklistCode: i.checklistCode ?? '',
      assignedTo: i.assignedTo ?? '',
      assignedTeam: i.assignedTeam ?? '',
      dueDate: (i.dueDate ?? '').slice(0, 10),
      startTime: hhmm(i.scheduledStart) || '09:00',
      endTime: hhmm(i.scheduledEnd) || '10:00'
    };
    this.visited = 5;
  }

  // ===== Summary =====
  get assetsSummary(): string {
    const f = this.form;
    if (f.scope === 'Location-based') return f.location || 'Not selected';
    return f.assetCode || f.assetName ? [f.assetCode, f.assetName].filter(Boolean).join(' – ') : 'Not selected';
  }

  get scheduleSummary(): string {
    const f = this.form;
    if (!f.dueDate) return 'Not configured';
    return `${fmtDate(f.dueDate)}${f.startTime ? ` · ${f.startTime}–${f.endTime}` : ''}`;
  }

  priorityClass(p: string): string {
    return `pri-dot pri-${(p || 'none').toLowerCase()}`;
  }
}
