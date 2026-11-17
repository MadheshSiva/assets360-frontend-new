import { Component, HostListener, Input, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Download,
  Ellipsis,
  GripVertical,
  Info,
  Lock,
  Package,
  Pencil,
  Plus,
  Shield,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { Checklist, ChecklistSection, ChecklistTaskItem, InspectionTask } from '../shared/inspection.models';
import { fmtDate, pillClass } from '../shared/insp-utils';
import {
  MODULES,
  RESPONSE_TYPES,
  SCORING_METHODS,
  checklistIcon,
  defaultCriteria,
  nextVersionLabel,
  responseLabel,
  withoutAudit
} from './checklist-utils';
import { ChecklistTaskPicker } from './checklist-task-picker';
import { ChecklistUsage } from './checklist-usage';

type Tab = 'items' | 'rules' | 'usage';

/** Right-hand panel of the checklist library: edits a working copy of one checklist. */
@Component({
  selector: 'app-checklist-detail',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ChecklistTaskPicker, ChecklistUsage],
  templateUrl: './checklist-detail.html',
  styleUrls: ['../shared/insp-page.css', './checklist-detail.css']
})
export class ChecklistDetail {
  readonly api = inject(InspectionApi);
  readonly icons = {
    ArrowDown, ArrowUp, ChartColumn, ChevronDown, ChevronUp, ClipboardCheck, Copy, Download, Ellipsis, GripVertical, Info, Lock,
    Package, Pencil, Plus, Shield, Trash2, TriangleAlert, X
  };
  readonly pillClass = pillClass;
  readonly fmtDate = fmtDate;
  readonly checklistIcon = checklistIcon;
  readonly modules = MODULES;
  readonly scoringMethods = SCORING_METHODS;

  /** Asks the page to select another checklist ('' = pick the first one). */
  readonly selectId = output<string>();
  readonly notify = output<string>();

  source!: Checklist;
  draft!: Checklist;
  tab: Tab = 'items';
  collapsed = new Set<number>();
  editingRow = '';
  menuKey = '';
  confirmDelete = false;
  picker = false;
  pickerSection: number | null = null;
  newSectionName: string | null = null;
  busy = false;
  private sourceJson = '';

  @Input({ required: true }) set checklist(c: Checklist) {
    const changedRecord = !this.source || this.source.id !== c.id;
    this.source = c;
    this.draft = structuredClone(c);
    this.draft.sections = [...(this.draft.sections ?? [])].sort((a, b) => a.order - b.order);
    this.draft.sections.forEach((s) => (s.tasks = [...(s.tasks ?? [])].sort((a, b) => a.order - b.order)));
    this.draft.modules = this.draft.modules ?? [];
    this.sourceJson = JSON.stringify(this.draft);
    if (changedRecord) {
      this.collapsed.clear();
      this.tab = 'items';
      this.picker = false;
      this.newSectionName = null;
      this.confirmDelete = false;
    }
  }

  get locked(): boolean {
    return this.draft.status === 'Published';
  }

  get dirty(): boolean {
    return JSON.stringify(this.draft) !== this.sourceJson;
  }

  /** Every version of this checklist (same name), newest first. */
  versions(): Checklist[] {
    return this.api.checklists
      .items()
      .filter((c) => c.templateName === this.source.templateName)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  get taskCount(): number {
    return this.draft.sections.reduce((n, s) => n + s.tasks.length, 0);
  }

  get shownCount(): number {
    return this.draft.sections.reduce((n, s, i) => n + (this.collapsed.has(i) ? 0 : s.tasks.length), 0);
  }

  get totalWeight(): number {
    return this.draft.sections.reduce((n, s) => n + this.sectionWeight(s), 0);
  }

  sectionWeight(s: ChecklistSection): number {
    return s.tasks.reduce((n, t) => n + (Number(t.weight) || 0), 0);
  }

  /** Running task number across sections. */
  rowNumber(si: number, ti: number): number {
    return this.draft.sections.slice(0, si).reduce((n, s) => n + s.tasks.length, 0) + ti + 1;
  }

  responseOptions(item: ChecklistTaskItem): string[] {
    const list = [...RESPONSE_TYPES];
    if (item.responseType?.startsWith('Numeric')) list[2] = item.responseType;
    else if (item.responseType && !list.includes(item.responseType)) list.push(item.responseType);
    return list;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuKey = '';
  }

  toggleMenu(ev: Event, key: string): void {
    ev.stopPropagation();
    this.confirmDelete = false;
    this.menuKey = this.menuKey === key ? '' : key;
  }

  toggleSection(i: number): void {
    if (this.collapsed.has(i)) this.collapsed.delete(i);
    else this.collapsed.add(i);
  }

  expandAll(): void {
    this.collapsed.clear();
  }

  // ===== Editing (drafts only) =====
  private renumber(): void {
    this.draft.sections.forEach((s, i) => {
      s.order = i + 1;
      s.tasks.forEach((t, j) => (t.order = j + 1));
    });
  }

  moveTask(si: number, ti: number, delta: number): void {
    const tasks = this.draft.sections[si]!.tasks;
    const to = ti + delta;
    if (to < 0 || to >= tasks.length) return;
    [tasks[ti], tasks[to]] = [tasks[to]!, tasks[ti]!];
    this.renumber();
    this.menuKey = '';
  }

  removeTask(si: number, ti: number): void {
    this.draft.sections[si]!.tasks.splice(ti, 1);
    this.renumber();
    this.menuKey = '';
    this.editingRow = '';
  }

  moveSection(si: number, delta: number): void {
    const s = this.draft.sections;
    const to = si + delta;
    if (to < 0 || to >= s.length) return;
    [s[si], s[to]] = [s[to]!, s[si]!];
    this.collapsed.clear();
    this.renumber();
    this.menuKey = '';
  }

  removeSection(si: number): void {
    this.draft.sections.splice(si, 1);
    this.collapsed.clear();
    this.renumber();
    this.menuKey = '';
  }

  addSection(): void {
    const name = (this.newSectionName ?? '').trim();
    if (!name) return;
    this.draft.sections.push({ sectionName: name, order: this.draft.sections.length + 1, tasks: [] });
    this.newSectionName = null;
    this.pickerSection = this.draft.sections.length - 1;
  }

  openPicker(): void {
    if (!this.draft.sections.length) this.draft.sections.push({ sectionName: 'General', order: 1, tasks: [] });
    this.pickerSection = null;
    this.picker = true;
  }

  sectionNames(): string[] {
    return this.draft.sections.map((s) => s.sectionName);
  }

  usedCodes(): string[] {
    return this.draft.sections.flatMap((s) => s.tasks.map((t) => t.taskCode));
  }

  addTask(t: InspectionTask): void {
    if (this.pickerSection === null) return;
    const section = this.draft.sections[this.pickerSection];
    if (!section) return;
    section.tasks.push({
      taskId: t.id,
      taskCode: t.taskCode,
      taskTitle: t.taskTitle,
      responseType: responseLabel(t),
      weight: 10,
      isMandatory: t.isMandatory,
      acceptanceCriteria: defaultCriteria(t),
      order: section.tasks.length + 1
    });
    this.collapsed.delete(this.pickerSection);
  }

  toggleModule(m: string, on: boolean): void {
    this.draft.modules = on ? [...this.draft.modules, m] : this.draft.modules.filter((x) => x !== m);
  }

  pickType(id: string): void {
    const t = this.api.types.byId(id);
    this.draft.inspectionTypeId = id;
    this.draft.inspectionTypeName = t?.inspectionTypeName ?? '';
  }

  discard(): void {
    this.checklist = this.source;
  }

  // ===== Persistence =====
  save(publish = false): void {
    if (publish && !this.taskCount) {
      this.notify.emit('Add at least one task before publishing.');
      return;
    }
    this.renumber();
    const record: Checklist = {
      ...this.draft,
      status: publish ? 'Published' : this.draft.status || 'Draft',
      effectiveDate: publish && !this.draft.effectiveDate ? new Date().toISOString().slice(0, 10) : this.draft.effectiveDate
    };
    this.busy = true;
    this.api.checklists.save(record).subscribe({
      next: (saved) => {
        this.busy = false;
        this.notify.emit(publish ? `${saved.templateName} v${saved.versionLabel} published.` : 'Checklist saved.');
      },
      error: (e) => {
        this.busy = false;
        this.notify.emit(apiErrorMessage(e));
      }
    });
  }

  createNewVersion(): void {
    const src = this.source;
    const top = Math.max(src.version ?? 1, ...this.versions().map((v) => v.version ?? 1));
    const topLabel = this.versions().find((v) => v.version === top)?.versionLabel ?? src.versionLabel;
    const record: Partial<Checklist> = {
      ...withoutAudit(structuredClone(src)),
      checklistCode: '',
      status: 'Draft',
      version: top + 1,
      versionLabel: nextVersionLabel(topLabel, top),
      effectiveDate: null
    };
    this.busy = true;
    this.api.checklists.save(record).subscribe({
      next: (saved) => {
        this.busy = false;
        this.selectId.emit(saved.id);
        this.notify.emit(`Draft v${saved.versionLabel} created — edit and publish when ready.`);
      },
      error: (e) => {
        this.busy = false;
        this.notify.emit(apiErrorMessage(e));
      }
    });
  }

  duplicate(): void {
    this.menuKey = '';
    const record: Partial<Checklist> = {
      ...withoutAudit(structuredClone(this.source)),
      checklistCode: '',
      templateName: `${this.source.templateName} (Copy)`,
      status: 'Draft',
      version: 1,
      versionLabel: '1.0',
      effectiveDate: null
    };
    this.api.checklists.save(record).subscribe({
      next: (saved) => {
        this.selectId.emit(saved.id);
        this.notify.emit(`Created ${saved.templateName}.`);
      },
      error: (e) => this.notify.emit(apiErrorMessage(e))
    });
  }

  exportJson(): void {
    this.menuKey = '';
    const blob = new Blob([JSON.stringify(withoutAudit(this.source), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.source.checklistCode || 'checklist'}-v${this.source.versionLabel}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  remove(): void {
    this.menuKey = '';
    this.confirmDelete = false;
    const c = this.source;
    this.api.checklists.remove(c.id).subscribe({
      next: () => {
        this.selectId.emit('');
        this.notify.emit(`${c.templateName} v${c.versionLabel} deleted.`);
      },
      error: (e) => this.notify.emit(apiErrorMessage(e))
    });
  }
}
