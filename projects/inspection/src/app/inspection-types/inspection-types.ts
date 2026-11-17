import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  CircleCheck,
  CircleMinus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Info,
  Layers,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { InspectionType } from '../shared/inspection.models';
import { Pager, downloadCsv, pillClass } from '../shared/insp-utils';

type SortKey = 'inspectionTypeCode' | 'inspectionTypeName' | 'category' | 'defaultChecklistName' | 'status';

const CATEGORIES = ['Safety', 'Condition', 'Regulatory', 'Operational', 'Quality', 'Environmental'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-annually', 'Annually', 'On demand'];
/** Inspection statuses that still count as "active" work. */
const OPEN_INSPECTION = ['Draft', 'Scheduled', 'In Progress', 'Overdue'];

function blankType(): Partial<InspectionType> {
  return {
    inspectionTypeCode: '',
    inspectionTypeName: '',
    category: '',
    description: '',
    defaultChecklistCode: '',
    defaultChecklistName: '',
    defaultPriority: '',
    defaultFrequency: '',
    applicableAssets: 'All equipment',
    responsibleRole: '',
    photoEvidenceOnFailure: true,
    signatureRequired: true,
    correctiveActionOnFailure: true,
    permitRequired: false,
    isActive: true,
    status: 'Active'
  };
}

/** Copy of a record without its identity / audit fields, ready to POST as a new record. */
function asNew(r: InspectionType): Partial<InspectionType> {
  const { id, createdBy, createdAt, updatedBy, updatedAt, ...rest } = r;
  void id; void createdBy; void createdAt; void updatedBy; void updatedAt;
  return rest;
}

@Component({
  selector: 'app-insp-inspection-types',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './inspection-types.html',
  styleUrls: ['../shared/insp-page.css', './inspection-types.css']
})
export class InspectionTypesPage implements OnInit {
  readonly api = inject(InspectionApi);
  readonly store = this.api.types;
  readonly icons = { CircleCheck, CircleMinus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, Download, Ellipsis, FileText, Info, Layers, Pencil, Plus, Power, Search, Trash2, X };
  readonly pillClass = pillClass;
  readonly priorities = PRIORITIES;
  readonly frequencies = FREQUENCIES;

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly categoryFilter = signal('');
  readonly sortKey = signal<SortKey>('inspectionTypeCode');
  readonly sortAsc = signal(true);
  readonly selectedId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  readonly confirmId = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly pager = new Pager(6);

  form: Partial<InspectionType> | null = null;
  formError = '';
  saving = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly categories = computed(() => {
    const set = new Set(CATEGORIES);
    this.store.items().forEach((t) => t.category && set.add(t.category));
    return [...set];
  });

  /** Plans per inspection type name. */
  private readonly planCounts = computed(() => {
    const m = new Map<string, number>();
    this.api.plans.items().forEach((p) => m.set(p.inspectionTypeName, (m.get(p.inspectionTypeName) ?? 0) + 1));
    return m;
  });

  readonly kpis = computed(() => {
    const rows = this.store.items();
    const active = rows.filter((t) => t.isActive).length;
    return {
      total: rows.length,
      active,
      inactive: rows.length - active,
      usedInPlans: rows.filter((t) => this.planCounts().has(t.inspectionTypeName)).length
    };
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const st = this.statusFilter();
    const cat = this.categoryFilter();
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    return this.store
      .items()
      .filter(
        (t) =>
          (!q || `${t.inspectionTypeCode} ${t.inspectionTypeName}`.toLowerCase().includes(q)) &&
          (!st || (st === 'Active') === t.isActive) &&
          (!cat || t.category === cat)
      )
      .sort((a, b) => this.sortValue(a, key).localeCompare(this.sortValue(b, key), undefined, { numeric: true }) * dir);
  });

  readonly selected = computed(() => {
    const rows = this.store.items();
    return rows.find((t) => t.id === this.selectedId()) ?? this.filtered().at(0) ?? null;
  });

  readonly usage = computed(() => {
    const t = this.selected();
    if (!t) return { plans: 0, inspections: 0 };
    return {
      plans: this.planCounts().get(t.inspectionTypeName) ?? 0,
      inspections: this.api.inspections
        .items()
        .filter((i) => i.inspectionTypeName === t.inspectionTypeName && OPEN_INSPECTION.includes(i.status ?? '')).length
    };
  });

  ngOnInit(): void {
    this.store.load();
    this.api.plans.load();
    this.api.inspections.load();
    this.api.checklists.load();
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId.set(null);
  }

  statusLabel(t: InspectionType): string {
    return t.isActive ? 'Active' : 'Inactive';
  }

  private sortValue(t: InspectionType, key: SortKey): string {
    return key === 'status' ? this.statusLabel(t) : String(t[key] ?? '');
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortAsc.update((v) => !v);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
  }

  sortIcon(key: SortKey) {
    return this.sortKey() === key && !this.sortAsc() ? this.icons.ChevronUp : this.icons.ChevronDown;
  }

  toggleMenu(ev: Event, id: string): void {
    ev.stopPropagation();
    this.confirmId.set(null);
    this.menuId.set(this.menuId() === id ? null : id);
  }

  resetPage(): void {
    this.pager.page = 1;
  }

  // ===== Row actions =====
  setActive(t: InspectionType, active: boolean): void {
    this.menuId.set(null);
    this.store.save({ ...t, isActive: active, status: active ? 'Active' : 'Inactive' }).subscribe({
      next: () => this.flash(`${t.inspectionTypeName} ${active ? 'activated' : 'deactivated'}.`),
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  duplicate(t: InspectionType): void {
    this.menuId.set(null);
    this.store.save({ ...asNew(t), inspectionTypeCode: '', inspectionTypeName: `${t.inspectionTypeName} (Copy)` }).subscribe({
      next: (saved) => {
        this.selectedId.set(saved.id);
        this.flash(`Created ${saved.inspectionTypeCode || saved.inspectionTypeName}.`);
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  askDelete(ev: Event, t: InspectionType): void {
    ev.stopPropagation();
    this.confirmId.set(t.id);
  }

  remove(t: InspectionType): void {
    this.menuId.set(null);
    this.confirmId.set(null);
    this.store.remove(t.id).subscribe({
      next: () => {
        if (this.selectedId() === t.id) this.selectedId.set(null);
        this.flash(`${t.inspectionTypeName} deleted.`);
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  exportCsv(): void {
    const rows = this.filtered();
    if (!rows.length) return this.flash('Nothing to export.');
    downloadCsv(
      'inspection-types.csv',
      rows.map((t) => ({
        Code: t.inspectionTypeCode,
        'Inspection Type': t.inspectionTypeName,
        Category: t.category,
        Description: t.description,
        Checklist: t.defaultChecklistName,
        'Checklist Code': t.defaultChecklistCode,
        Priority: t.defaultPriority,
        Frequency: t.defaultFrequency,
        'Applicable Assets': t.applicableAssets,
        'Responsible Role': t.responsibleRole,
        'Photo Evidence On Failure': t.photoEvidenceOnFailure ? 'Yes' : 'No',
        'Signature Required': t.signatureRequired ? 'Yes' : 'No',
        'Corrective Action On Failure': t.correctiveActionOnFailure ? 'Yes' : 'No',
        'Permit Required': t.permitRequired ? 'Yes' : 'No',
        'Used In Plans': this.planCounts().get(t.inspectionTypeName) ?? 0,
        Status: this.statusLabel(t)
      }))
    );
  }

  // ===== Drawer form =====
  openNew(): void {
    this.form = blankType();
    this.formError = '';
  }

  openEdit(t: InspectionType, ev?: Event): void {
    ev?.stopPropagation();
    this.menuId.set(null);
    this.form = { ...t };
    this.formError = '';
  }

  closeForm(): void {
    this.form = null;
  }

  pickChecklist(code: string): void {
    if (!this.form) return;
    const c = this.api.checklists.items().find((x) => x.checklistCode === code);
    this.form.defaultChecklistCode = code;
    this.form.defaultChecklistName = c ? `${c.templateName} v${c.versionLabel}` : '';
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    const name = f.inspectionTypeName?.trim();
    if (!name) {
      this.formError = 'Inspection type name is required.';
      return;
    }
    if (!f.category) {
      this.formError = 'Category is required.';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.store.save({ ...f, inspectionTypeName: name, status: f.isActive ? 'Active' : 'Inactive' }).subscribe({
      next: (saved) => {
        this.saving = false;
        this.form = null;
        this.selectedId.set(saved.id);
        this.flash(`${saved.inspectionTypeName} saved.`);
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
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
