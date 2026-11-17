import { Component, HostListener, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  FileText,
  GripVertical,
  History,
  Info,
  Maximize2,
  Plus,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { ReportSection, ReportTemplate } from '../shared/inspection.models';
import { pillClass } from '../shared/insp-utils';
import { nextVersionLabel, withoutAudit } from '../checklists/checklist-utils';
import { ReportPreview, reportPageCount } from './report-preview';
import { ReportVersionHistory } from './report-version-history';

const DEFAULT_SECTIONS = [
  'Header & Branding',
  'Inspection Summary',
  'Asset Details',
  'Checklist Results',
  'Findings & Corrective Actions',
  'Evidence Gallery',
  'Signatures & Stamp',
  'Footer & Page Numbers'
];

function blankTemplate(): Partial<ReportTemplate> {
  return {
    reportTemplateCode: '',
    reportTitle: '',
    inspectionTypeName: '',
    format: '',
    pageSize: '',
    orientation: '',
    language: '',
    accentColor: '#6D28D9',
    versionLabel: '1.0',
    reportNumberFormat: 'INSR-{YYYY}-{SEQ}',
    sections: DEFAULT_SECTIONS.map((name, i) => ({ name, enabled: true, order: i + 1 })),
    includePassedItems: true,
    includePhotos: true,
    showAcceptanceCriteria: true,
    showFindingStatus: true,
    includeSignatures: true,
    includeInternalNotes: false,
    isActive: true,
    status: 'Draft'
  };
}

@Component({
  selector: 'app-insp-report-templates',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportPreview, ReportVersionHistory],
  templateUrl: './report-templates.html',
  styleUrls: ['../shared/insp-page.css', './report-templates.css']
})
export class ReportTemplatesPage implements OnInit {
  readonly api = inject(InspectionApi);
  readonly store = this.api.reportTemplates;
  readonly icons = {
    ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, FileText, GripVertical, History, Info, Maximize2,
    Plus, Search, Trash2, X, ZoomIn, ZoomOut
  };
  readonly pillClass = pillClass;
  readonly formats = ['PDF', 'DOCX', 'HTML'];
  readonly pageSizes = ['A4', 'Letter', 'Legal', 'A3'];
  readonly orientations = ['Portrait', 'Landscape'];
  readonly languages = ['English', 'Arabic', 'French', 'Spanish', 'German'];
  readonly zooms = [50, 75, 100, 125];

  private readonly preview = viewChild(ReportPreview);

  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  draft: ReportTemplate | null = null;
  private draftJson = '';
  menuKey = '';
  confirmId = '';
  newSection: string | null = null;
  dragIndex = -1;
  zoom = 75;
  page = 1;
  expanded = false;
  historyOpen = false;
  busy = false;
  form: Partial<ReportTemplate> | null = null;
  formError = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.store
      .items()
      .filter((t) => !q || `${t.reportTemplateCode} ${t.reportTitle} ${t.inspectionTypeName}`.toLowerCase().includes(q))
      .sort((a, b) => a.reportTitle.localeCompare(b.reportTitle) || b.versionLabel.localeCompare(a.versionLabel, undefined, { numeric: true }));
  });

  readonly selected = computed(
    () => this.store.items().find((t) => t.id === this.selectedId()) ?? this.filtered().at(0) ?? null
  );

  /** First completed (else in-progress) inspection, preferring the template's inspection type. */
  readonly sampleInspection = computed(() => {
    const type = this.selected()?.inspectionTypeName;
    const rows = this.api.inspections.items();
    const pick = (status: string) =>
      rows.find((i) => i.status === status && i.inspectionTypeName === type) ?? rows.find((i) => i.status === status);
    return pick('Completed') ?? pick('In Progress') ?? null;
  });

  readonly sampleFindings = computed(() => {
    const code = this.sampleInspection()?.inspectionCode;
    return code ? this.api.findings.items().filter((f) => f.inspectionCode === code) : [];
  });

  constructor() {
    // Work on a copy of the selected template; reset whenever another record (or a saved version) arrives.
    effect(() => {
      const t = this.selected();
      untracked(() => this.resetDraft(t));
    });
  }

  ngOnInit(): void {
    this.store.load();
    this.api.types.load();
    this.api.inspections.load();
    this.api.findings.load();
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuKey = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.expanded = false;
    this.historyOpen = false;
  }

  private resetDraft(t: ReportTemplate | null): void {
    if (!t) {
      this.draft = null;
      return;
    }
    const d = structuredClone(t);
    d.sections = [...(d.sections ?? [])].sort((a, b) => a.order - b.order);
    this.draft = d;
    this.draftJson = JSON.stringify(d);
    this.newSection = null;
    this.page = 1;
  }

  get locked(): boolean {
    return this.draft?.status === 'Published';
  }

  get dirty(): boolean {
    return !!this.draft && JSON.stringify(this.draft) !== this.draftJson;
  }

  get sections(): ReportSection[] {
    return this.draft?.sections ?? [];
  }

  /** Every version of the selected template (same title), newest first. */
  versions(): ReportTemplate[] {
    const title = this.selected()?.reportTitle;
    return this.store
      .items()
      .filter((t) => t.reportTitle === title)
      .sort((a, b) => b.versionLabel.localeCompare(a.versionLabel, undefined, { numeric: true }));
  }

  pageCount(): number {
    return this.draft ? reportPageCount(this.draft) : 1;
  }

  zoomBy(step: number): void {
    const i = this.zooms.indexOf(this.zoom) + step;
    if (i >= 0 && i < this.zooms.length) this.zoom = this.zooms[i]!;
  }

  toggleMenu(ev: Event, key: string): void {
    ev.stopPropagation();
    this.confirmId = '';
    this.menuKey = this.menuKey === key ? '' : key;
  }

  select(id: string): void {
    this.selectedId.set(id || null);
    this.historyOpen = false;
  }

  // ===== Sections =====
  private renumber(): void {
    this.sections.forEach((s, i) => (s.order = i + 1));
  }

  moveSection(i: number, delta: number): void {
    const list = this.sections;
    const to = i + delta;
    if (this.locked || to < 0 || to >= list.length) return;
    [list[i], list[to]] = [list[to]!, list[i]!];
    this.renumber();
    this.menuKey = '';
  }

  removeSection(i: number): void {
    this.sections.splice(i, 1);
    this.renumber();
    this.menuKey = '';
  }

  addSection(): void {
    const name = (this.newSection ?? '').trim();
    if (!name || !this.draft) return;
    this.draft.sections.push({ name, enabled: true, order: this.sections.length + 1 });
    this.newSection = null;
  }

  onDragStart(ev: DragEvent, i: number): void {
    if (this.locked) return ev.preventDefault();
    this.dragIndex = i;
    ev.dataTransfer?.setData('text/plain', String(i));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onDrop(ev: DragEvent, i: number): void {
    ev.preventDefault();
    const from = this.dragIndex;
    this.dragIndex = -1;
    if (this.locked || from < 0 || from === i) return;
    const list = this.sections;
    const [moved] = list.splice(from, 1);
    if (moved) list.splice(i, 0, moved);
    this.renumber();
  }

  // ===== Persistence =====
  save(publish = false): void {
    const d = this.draft;
    if (!d) return;
    if (!d.reportTitle?.trim()) return this.flash('Template name is required.');
    this.busy = true;
    this.store.save({ ...d, reportTitle: d.reportTitle.trim(), status: publish ? 'Published' : 'Draft' }).subscribe({
      next: (saved) => {
        this.busy = false;
        this.flash(publish ? `${saved.reportTitle} v${saved.versionLabel} published.` : 'Template saved.');
      },
      error: (e) => {
        this.busy = false;
        this.flash(apiErrorMessage(e));
      }
    });
  }

  discard(): void {
    this.resetDraft(this.selected());
  }

  createNewVersion(): void {
    const src = this.selected();
    if (!src) return;
    const top = this.versions()[0]?.versionLabel ?? src.versionLabel;
    this.clone(src, { status: 'Draft', versionLabel: nextVersionLabel(top, 1) }, (s) => `Draft v${s.versionLabel} created — edit and publish when ready.`);
  }

  duplicate(t: ReportTemplate): void {
    this.menuKey = '';
    this.clone(t, { status: 'Draft', versionLabel: '1.0', reportTitle: `${t.reportTitle} (Copy)` }, (s) => `Created ${s.reportTitle}.`);
  }

  private clone(src: ReportTemplate, patch: Partial<ReportTemplate>, msg: (s: ReportTemplate) => string): void {
    this.busy = true;
    this.store.save({ ...withoutAudit(structuredClone(src)), reportTemplateCode: '', ...patch }).subscribe({
      next: (saved) => {
        this.busy = false;
        this.select(saved.id);
        this.flash(msg(saved));
      },
      error: (e) => {
        this.busy = false;
        this.flash(apiErrorMessage(e));
      }
    });
  }

  askDelete(ev: Event, t: ReportTemplate): void {
    ev.stopPropagation();
    this.confirmId = t.id;
  }

  remove(t: ReportTemplate): void {
    this.menuKey = '';
    this.confirmId = '';
    this.store.remove(t.id).subscribe({
      next: () => {
        if (this.selectedId() === t.id) this.selectedId.set(null);
        this.flash(`${t.reportTitle} v${t.versionLabel} deleted.`);
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  previewPdf(): void {
    const p = this.preview();
    if (!p || !this.draft) return this.flash('Select a template to preview.');
    if (!p.print(`${this.draft.reportTitle} v${this.draft.versionLabel}`)) this.flash('Allow pop-ups to open the PDF preview.');
  }

  // ===== New template drawer =====
  openNew(): void {
    this.form = blankTemplate();
    this.formError = '';
  }

  closeForm(): void {
    this.form = null;
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    const title = f.reportTitle?.trim();
    if (!title) {
      this.formError = 'Template name is required.';
      return;
    }
    if (!f.format || !f.pageSize || !f.orientation || !f.language) {
      this.formError = 'Select a format, page size, orientation and language.';
      return;
    }
    this.busy = true;
    this.formError = '';
    this.store.save({ ...f, reportTitle: title }).subscribe({
      next: (saved) => {
        this.busy = false;
        this.form = null;
        this.search.set('');
        this.select(saved.id);
        this.flash(`${saved.reportTitle} created as a draft.`);
      },
      error: (e) => {
        this.busy = false;
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
