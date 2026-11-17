import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Cog,
  Copy,
  Ellipsis,
  FileText,
  Gauge,
  Image,
  Info,
  Layers,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  SlidersHorizontal,
  Thermometer,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  Zap
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { Checklist, InspectionTask } from '../shared/inspection.models';
import { Pager, pillClass } from '../shared/insp-utils';

const RESPONSE_TYPES = ['Pass / Fail', 'Yes / No', 'Numeric', 'Text'];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

function blankTask(category: string): Partial<InspectionTask> {
  return {
    taskCode: '',
    taskTitle: '',
    taskCategory: category,
    taskDescription: '',
    responseType: 'Pass / Fail',
    unit: '',
    estimatedDurationMinutes: 2,
    minValue: null,
    maxValue: null,
    procedure: '',
    readingRequired: false,
    photoRequiredOnFailure: true,
    createFindingOutsideLimits: true,
    defaultSeverity: 'Medium',
    isCriticalTask: false,
    isMandatory: true,
    isActive: true,
    status: 'Active'
  };
}

function asNew(r: InspectionTask): Partial<InspectionTask> {
  const { id, createdBy, createdAt, updatedBy, updatedAt, ...rest } = r;
  void id; void createdBy; void createdAt; void updatedBy; void updatedAt;
  return rest;
}

/** Normalises a spreadsheet header: 'Task Title' / 'task_title' -> 'tasktitle'. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function yes(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['yes', 'y', 'true', '1', 'x'].includes(String(v).trim().toLowerCase());
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

@Component({
  selector: 'app-insp-inspection-tasks',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './inspection-tasks.html',
  styleUrls: ['../shared/insp-page.css', './inspection-tasks.css']
})
export class InspectionTasksPage implements OnInit {
  readonly api = inject(InspectionApi);
  readonly store = this.api.tasks;
  readonly icons = {
    Activity, Camera, ChevronLeft, ChevronRight, CircleCheck, Clock, Cog, Copy, Ellipsis, FileText, Gauge, Image, Info, Layers,
    Link2, ListChecks, Pencil, Plus, Power, Search, Shield, SlidersHorizontal, Thermometer, Trash2, TriangleAlert, Upload, X, Zap
  };
  readonly pillClass = pillClass;
  readonly responseTypes = RESPONSE_TYPES;
  readonly severities = SEVERITIES;

  readonly search = signal('');
  readonly categoryFilter = signal('');
  readonly statusFilter = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  readonly confirmId = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly importing = signal(false);
  readonly pager = new Pager(7);

  form: Partial<InspectionTask> | null = null;
  formError = '';
  saving = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly categories = computed(() => {
    const fromStore = [...this.api.taskCategories.items()]
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((c) => c.categoryName);
    const set = new Set(fromStore);
    this.store.items().forEach((t) => t.taskCategory && set.add(t.taskCategory));
    return [...set];
  });

  /** Checklists that use each task code. */
  private readonly checklistsByTask = computed(() => {
    const m = new Map<string, Checklist[]>();
    for (const c of this.api.checklists.items()) {
      const codes = new Set((c.sections ?? []).flatMap((s) => (s.tasks ?? []).map((t) => t.taskCode)));
      codes.forEach((code) => m.set(code, [...(m.get(code) ?? []), c]));
    }
    return m;
  });

  readonly kpis = computed(() => {
    const rows = this.store.items();
    return {
      total: rows.length,
      active: rows.filter((t) => t.isActive).length,
      used: rows.filter((t) => this.checklistsByTask().has(t.taskCode)).length,
      evidence: rows.filter((t) => t.photoRequiredOnFailure).length
    };
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    const st = this.statusFilter();
    return this.store
      .items()
      .filter(
        (t) =>
          (!q || `${t.taskCode} ${t.taskTitle}`.toLowerCase().includes(q)) &&
          (!cat || t.taskCategory === cat) &&
          (!st || (st === 'Active') === t.isActive)
      )
      .sort((a, b) => a.taskCode.localeCompare(b.taskCode, undefined, { numeric: true }));
  });

  readonly selected = computed(
    () => this.store.items().find((t) => t.id === this.selectedId()) ?? this.filtered().at(0) ?? null
  );

  readonly linkedChecklists = computed(() => {
    const t = this.selected();
    return t ? (this.checklistsByTask().get(t.taskCode) ?? []) : [];
  });

  ngOnInit(): void {
    this.store.load();
    this.api.taskCategories.load();
    this.api.checklists.load();
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId.set(null);
  }

  categoryIcon(cat: string) {
    const c = (cat ?? '').toLowerCase();
    if (c.includes('safety')) return this.icons.Shield;
    if (c.includes('mechan')) return this.icons.Cog;
    if (c.includes('condition') || c.includes('vibration')) return this.icons.Activity;
    if (c.includes('electr')) return this.icons.Zap;
    if (c.includes('instrument') || c.includes('pressure')) return this.icons.Gauge;
    if (c.includes('temp')) return this.icons.Thermometer;
    return this.icons.ListChecks;
  }

  /** 'Numeric (°C)' for numeric tasks with a unit. */
  responseLabel(t: Pick<InspectionTask, 'responseType' | 'unit'>): string {
    return t.responseType === 'Numeric' && t.unit ? `Numeric (${t.unit})` : t.responseType;
  }

  statusLabel(t: InspectionTask): string {
    return t.isActive ? 'Active' : 'Inactive';
  }

  resetPage(): void {
    this.pager.page = 1;
  }

  /** Page buttons with gaps (0 = ellipsis): 1 2 3 4 5 … 13. */
  pageButtons(total: number): number[] {
    const last = this.pager.pages(total);
    if (last <= 7) return this.pager.pageList(total);
    const cur = this.pager.page;
    const start = Math.max(1, Math.min(cur - 2, last - 5));
    const end = Math.min(last - 1, start + 4);
    const out: number[] = [];
    for (let p = start; p <= end; p++) out.push(p);
    if (start > 1) out.unshift(...(start > 2 ? [1, 0] : [1]));
    if (end < last - 1) out.push(0);
    out.push(last);
    return out;
  }

  toggleMenu(ev: Event, id: string): void {
    ev.stopPropagation();
    this.confirmId.set(null);
    this.menuId.set(this.menuId() === id ? null : id);
  }

  // ===== Row actions =====
  setActive(t: InspectionTask, active: boolean): void {
    this.menuId.set(null);
    this.store.save({ ...t, isActive: active, status: active ? 'Active' : 'Inactive' }).subscribe({
      next: () => this.flash(`${t.taskCode} ${active ? 'activated' : 'deactivated'}.`),
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  duplicate(t: InspectionTask): void {
    this.menuId.set(null);
    this.store.save({ ...asNew(t), taskCode: '', taskTitle: `${t.taskTitle} (Copy)` }).subscribe({
      next: (saved) => {
        this.selectedId.set(saved.id);
        this.flash(`Created ${saved.taskCode || saved.taskTitle}.`);
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  askDelete(ev: Event, t: InspectionTask): void {
    ev.stopPropagation();
    this.confirmId.set(t.id);
  }

  remove(t: InspectionTask): void {
    this.menuId.set(null);
    this.confirmId.set(null);
    this.store.remove(t.id).subscribe({
      next: () => this.flash(`${t.taskCode} deleted.`),
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  // ===== Import (CSV / XLSX) =====
  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
      rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
    } catch {
      this.flash('Could not read the file. Use a CSV or XLSX file.');
      return;
    }
    const tasks = rows.map((r) => this.rowToTask(r)).filter((t): t is Partial<InspectionTask> => !!t);
    if (!tasks.length) {
      this.flash('No tasks found. The file needs at least a "Task Title" column.');
      return;
    }
    this.importing.set(true);
    from(tasks)
      .pipe(
        concatMap((t) => this.store.save(t).pipe(map(() => true), catchError(() => of(false)))),
        toArray()
      )
      .subscribe((results) => {
        this.importing.set(false);
        const ok = results.filter(Boolean).length;
        const failed = results.length - ok;
        const skipped = rows.length - tasks.length;
        this.flash(`Imported ${ok} task${ok === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped (no title)` : ''}.`);
      });
  }

  private rowToTask(raw: Record<string, unknown>): Partial<InspectionTask> | null {
    const r = new Map(Object.entries(raw).map(([k, v]) => [norm(k), v]));
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = r.get(k);
        if (v !== undefined && v !== '') return v;
      }
      return undefined;
    };
    const title = String(get('tasktitle', 'taskname', 'title', 'name') ?? '').trim();
    if (!title) return null;
    const base = blankTask(String(get('taskcategory', 'category') ?? this.categories()[0] ?? ''));
    let responseType = String(get('responsetype', 'response') ?? base.responseType);
    const unitMatch = /^numeric\s*\((.+)\)$/i.exec(responseType);
    if (unitMatch) responseType = 'Numeric';
    const known = RESPONSE_TYPES.find((x) => norm(x) === norm(responseType));
    const active = yes(get('isactive', 'active'), String(get('status') ?? 'Active').toLowerCase() !== 'inactive');
    return {
      ...base,
      taskTitle: title,
      taskDescription: String(get('taskdescription', 'description') ?? ''),
      responseType: known ?? responseType,
      unit: String(get('unit') ?? unitMatch?.[1] ?? ''),
      estimatedDurationMinutes: num(get('estimateddurationminutes', 'estimatedduration', 'duration', 'durationminutes')) ?? 2,
      minValue: num(get('minvalue', 'min', 'minimum')),
      maxValue: num(get('maxvalue', 'max', 'maximum')),
      procedure: String(get('procedure') ?? ''),
      readingRequired: yes(get('readingrequired', 'requiredreading'), false),
      photoRequiredOnFailure: yes(get('photorequiredonfailure', 'photorequired'), true),
      createFindingOutsideLimits: yes(get('createfindingoutsidelimits', 'createfinding'), true),
      defaultSeverity: String(get('defaultseverity', 'severity') ?? 'Medium'),
      isCriticalTask: yes(get('iscriticaltask', 'critical'), false),
      isMandatory: yes(get('ismandatory', 'mandatory'), true),
      isActive: active,
      status: active ? 'Active' : 'Inactive'
    };
  }

  // ===== Drawer form =====
  openNew(): void {
    this.form = { ...blankTask(this.categoryFilter()), responseType: '', defaultSeverity: '' };
    this.formError = '';
  }

  openEdit(t: InspectionTask, ev?: Event): void {
    ev?.stopPropagation();
    this.menuId.set(null);
    this.form = { ...t };
    this.formError = '';
  }

  closeForm(): void {
    this.form = null;
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    const title = f.taskTitle?.trim();
    if (!title) {
      this.formError = 'Task name is required.';
      return;
    }
    if (!f.responseType) {
      this.formError = 'Select a response type.';
      return;
    }
    const numeric = f.responseType === 'Numeric';
    if (numeric && f.minValue != null && f.maxValue != null && f.minValue > f.maxValue) {
      this.formError = 'Minimum must not be greater than maximum.';
      return;
    }
    const record: Partial<InspectionTask> = {
      ...f,
      taskTitle: title,
      minValue: numeric ? (f.minValue ?? null) : null,
      maxValue: numeric ? (f.maxValue ?? null) : null,
      status: f.isActive ? 'Active' : 'Inactive'
    };
    this.saving = true;
    this.formError = '';
    this.store.save(record).subscribe({
      next: (saved) => {
        this.saving = false;
        this.form = null;
        this.selectedId.set(saved.id);
        this.flash(`${saved.taskCode || saved.taskTitle} saved.`);
      },
      error: (e) => {
        this.saving = false;
        this.formError = apiErrorMessage(e);
      }
    });
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
