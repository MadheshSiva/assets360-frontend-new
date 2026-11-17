import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ChevronLeft, ChevronRight, Eye, Plus, Search, Share2, Upload, X } from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { Checklist } from '../shared/inspection.models';
import { Pager, pillClass } from '../shared/insp-utils';
import { ChecklistDetail } from './checklist-detail';
import { ChecklistPreview } from './checklist-preview';
import { MODULES, SCORING_METHODS, checklistIcon } from './checklist-utils';

function blankChecklist(): Partial<Checklist> {
  return {
    checklistCode: '',
    templateName: '',
    inspectionTypeId: '',
    inspectionTypeName: '',
    assetCategory: '',
    assetType: '',
    modules: ['Inspection'],
    scoring: '',
    owner: '',
    version: 1,
    versionLabel: '1.0',
    effectiveDate: null,
    sections: [],
    allMandatoryRequired: true,
    photoOnFailedItems: true,
    inspectorSignatureRequired: true,
    criticalFailureOverridesScore: true,
    createFindingOnFailure: true,
    routeCorrectiveAction: true,
    isActive: true,
    status: 'Draft'
  };
}

@Component({
  selector: 'app-insp-checklists',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ChecklistDetail, ChecklistPreview],
  templateUrl: './checklists.html',
  styleUrls: ['../shared/insp-page.css', './checklists.css']
})
export class ChecklistsPage implements OnInit {
  readonly api = inject(InspectionApi);
  readonly store = this.api.checklists;
  readonly icons = { ChevronLeft, ChevronRight, Eye, Plus, Search, Share2, Upload, X };
  readonly pillClass = pillClass;
  readonly checklistIcon = checklistIcon;
  readonly modules = MODULES;
  readonly scoringMethods = SCORING_METHODS;

  readonly search = signal('');
  readonly moduleFilter = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly pager = new Pager(5);
  previewOpen = false;

  form: Partial<Checklist> | null = null;
  formError = '';
  saving = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const m = this.moduleFilter();
    return this.store
      .items()
      .filter(
        (c) =>
          (!q || `${c.checklistCode} ${c.templateName}`.toLowerCase().includes(q)) && (!m || (c.modules ?? []).includes(m))
      )
      .sort((a, b) => a.templateName.localeCompare(b.templateName) || (b.version ?? 0) - (a.version ?? 0));
  });

  readonly selected = computed(
    () => this.store.items().find((c) => c.id === this.selectedId()) ?? this.filtered().at(0) ?? null
  );

  ngOnInit(): void {
    this.store.load();
    this.api.tasks.load();
    this.api.types.load();
    this.api.plans.load();
    this.api.inspections.load();
  }

  mods(c: Checklist): string[] {
    return c.modules ?? [];
  }

  taskCount(c: Checklist): number {
    return (c.sections ?? []).reduce((n, s) => n + (s.tasks?.length ?? 0), 0);
  }

  resetPage(): void {
    this.pager.page = 1;
  }

  select(id: string): void {
    this.selectedId.set(id || null);
    if (id) {
      const i = this.filtered().findIndex((c) => c.id === id);
      if (i >= 0) this.pager.page = Math.floor(i / this.pager.size) + 1;
    }
  }

  // ===== Import (checklist JSON) =====
  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let data: Partial<Checklist>;
    try {
      data = JSON.parse(await file.text());
    } catch {
      this.flash('The file is not valid JSON.');
      return;
    }
    if (!data || typeof data !== 'object' || !data.templateName) {
      this.flash('The JSON needs at least a "templateName" and "sections".');
      return;
    }
    const { id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = data;
    void id; void createdAt; void createdBy; void updatedAt; void updatedBy;
    const record: Partial<Checklist> = {
      ...blankChecklist(),
      scoring: 'Weighted',
      ...rest,
      checklistCode: '',
      status: 'Draft',
      sections: Array.isArray(rest.sections) ? rest.sections : [],
      modules: Array.isArray(rest.modules) ? rest.modules : ['Inspection']
    };
    this.store.save(record).subscribe({
      next: (saved) => {
        this.select(saved.id);
        this.flash(`Imported ${saved.templateName} as a draft (${saved.checklistCode}).`);
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  // ===== New checklist drawer =====
  openNew(): void {
    this.form = blankChecklist();
    this.formError = '';
  }

  closeForm(): void {
    this.form = null;
  }

  pickType(id: string): void {
    if (!this.form) return;
    const t = this.api.types.byId(id);
    this.form.inspectionTypeId = id;
    this.form.inspectionTypeName = t?.inspectionTypeName ?? '';
    if (t && !this.form.assetCategory) this.form.assetCategory = t.applicableAssets;
  }

  toggleModule(m: string, on: boolean): void {
    if (!this.form) return;
    const list = this.form.modules ?? [];
    this.form.modules = on ? [...list, m] : list.filter((x) => x !== m);
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    const name = f.templateName?.trim();
    if (!name) {
      this.formError = 'Checklist name is required.';
      return;
    }
    if (!f.modules?.length) {
      this.formError = 'Select at least one module.';
      return;
    }
    if (!f.scoring) {
      this.formError = 'Select a scoring method.';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.store.save({ ...f, templateName: name }).subscribe({
      next: (saved) => {
        this.saving = false;
        this.form = null;
        this.search.set('');
        this.moduleFilter.set('');
        this.select(saved.id);
        this.flash(`${saved.templateName} created as a draft.`);
      },
      error: (e) => {
        this.saving = false;
        this.formError = apiErrorMessage(e);
      }
    });
  }

  flash(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
