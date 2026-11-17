import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  LucideAngularModule,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  Ellipsis,
  FileText,
  Plus,
  Search,
  SquareCheckBig
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { InspectionFinding } from '../shared/inspection.models';
import { Pager, downloadCsv, fmtDate, isoDay, pillClass } from '../shared/insp-utils';
import { FindingDetail } from './finding-detail';
import { FindingFormDrawer } from './finding-form-drawer';

export const FINDING_STATUSES = ['Open', 'In Progress', 'Pending Verification', 'Overdue', 'Closed'];
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

/** Inspection Findings: register of exceptions with corrective actions and a closure workflow. */
@Component({
  selector: 'app-insp-findings',
  imports: [FormsModule, RouterLink, LucideAngularModule, FindingDetail, FindingFormDrawer],
  templateUrl: './findings.html',
  styleUrls: ['../shared/insp-page.css', './findings.css']
})
export class FindingsPage {
  private readonly api = inject(InspectionApi);
  private readonly queryCode = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });
  private handledCode: string | null = null;
  readonly icons = { ChevronLeft, ChevronRight, CircleAlert, Clock, Download, Ellipsis, FileText, Plus, Search, SquareCheckBig };
  readonly fmtDate = fmtDate;
  readonly pillClass = pillClass;
  readonly statuses = FINDING_STATUSES;
  readonly severities = SEVERITIES;
  readonly today = isoDay(new Date());

  readonly findings = this.api.findings;
  readonly pager = new Pager(6);

  readonly search = signal('');
  readonly severity = signal('');
  /** '' = all, 'Open' = anything not Closed, otherwise an exact status. */
  readonly status = signal('');
  readonly overdueOnly = signal(false);
  readonly page = signal(1);
  readonly selectedId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly drawerOpen = signal(false);
  readonly editing = signal<InspectionFinding | null>(null);
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sev = this.severity();
    const st = this.status();
    const overdue = this.overdueOnly();
    return this.findings.items().filter((f) => {
      if (sev === 'Critical/High' ? !['Critical', 'High'].includes(f.severity) : sev && f.severity !== sev) return false;
      if (st === 'Open' ? f.status === 'Closed' : st && f.status !== st) return false;
      if (overdue && !this.isOverdue(f)) return false;
      if (!q) return true;
      return [f.findingCode, f.title, f.assetCode, f.assetName, f.inspectionCode, f.owner].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  });

  readonly rows = computed(() => {
    const all = this.filtered();
    this.pager.page = Math.min(this.page(), this.pager.pages(all.length));
    return this.pager.slice(all);
  });

  readonly selected = computed(() => this.findings.items().find((f) => f.id === this.selectedId()) ?? null);

  readonly people = computed(() => {
    const names = new Set<string>();
    this.findings.items().forEach((f) => {
      if (f.owner) names.add(f.owner);
      if (f.assignedTo) names.add(f.assignedTo);
    });
    this.api.inspections.items().forEach((i) => i.assignedTo && names.add(i.assignedTo));
    this.api.plans.items().forEach((p) => p.inspectorName && names.add(p.inspectorName));
    return [...names].sort();
  });

  readonly kpis = computed(() => {
    const open = this.findings.items().filter((f) => f.status !== 'Closed');
    return {
      open: open.length,
      critical: open.filter((f) => ['Critical', 'High'].includes(f.severity)).length,
      overdue: open.filter((f) => this.isOverdue(f)).length,
      verify: open.filter((f) => f.status === 'Pending Verification').length
    };
  });

  constructor() {
    this.api.findings.load();
    this.api.inspections.load();
    this.api.plans.load();
    // Deep link: /inspection/findings?code=FND-2026-0087 selects that finding and clears filters hiding it.
    effect(() => {
      const code = this.queryCode().get('code');
      const items = this.findings.items();
      if (!code || code === this.handledCode || !items.length) return;
      const f = items.find((x) => x.findingCode.toLowerCase() === code.toLowerCase());
      if (!f) return;
      this.handledCode = code;
      if (!this.filtered().includes(f)) {
        this.search.set('');
        this.severity.set('');
        this.overdueOnly.set(false);
        this.status.set(f.status === 'Closed' ? '' : 'Open');
      }
      this.selectedId.set(f.id);
      this.page.set(Math.floor(this.filtered().indexOf(f) / this.pager.size) + 1);
    });
    effect(() => {
      const rows = this.filtered();
      const id = this.selectedId();
      if (rows.length && (!id || !this.findings.items().some((f) => f.id === id))) this.selectedId.set(rows[0]!.id);
    });
  }

  isOverdue(f: InspectionFinding): boolean {
    return f.status !== 'Closed' && (f.status === 'Overdue' || (!!f.dueDate && f.dueDate.slice(0, 10) < this.today));
  }

  setFilter(kind: 'search' | 'severity' | 'status', value: string): void {
    this[kind].set(value);
    this.page.set(1);
  }

  kpiFilter(kind: 'open' | 'critical' | 'overdue' | 'verify'): void {
    this.search.set('');
    this.severity.set(kind === 'critical' ? 'Critical/High' : '');
    this.status.set(kind === 'verify' ? 'Pending Verification' : 'Open');
    this.overdueOnly.set(kind === 'overdue');
    this.page.set(1);
  }

  pageCount(): number {
    return this.pager.pages(this.filtered().length);
  }

  goPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  toggleMenu(id: string, ev: Event): void {
    ev.stopPropagation();
    this.menuId.update((cur) => (cur === id ? null : id));
  }

  openNew(): void {
    this.editing.set(null);
    this.drawerOpen.set(true);
  }

  edit(f: InspectionFinding): void {
    this.menuId.set(null);
    this.editing.set(f);
    this.drawerOpen.set(true);
  }

  onSaved(f: InspectionFinding): void {
    this.drawerOpen.set(false);
    this.selectedId.set(f.id);
    this.flash(`Finding ${f.findingCode || f.title} saved.`);
  }

  askDelete(f: InspectionFinding): void {
    this.menuId.set(null);
    this.confirmDeleteId.set(f.id);
  }

  remove(f: InspectionFinding): void {
    this.confirmDeleteId.set(null);
    this.findings.remove(f.id).subscribe({
      next: () => this.flash('Finding deleted.'),
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  export(): void {
    const rows = this.filtered().map((f) => ({
      'Finding ID': f.findingCode,
      Finding: f.title,
      Inspection: f.inspectionCode,
      Asset: f.assetCode,
      'Asset Name': f.assetName,
      Severity: f.severity,
      Owner: f.owner,
      'Due Date': f.dueDate ?? '',
      Status: f.status ?? '',
      'Workflow Step': f.workflowStep,
      'Corrective Action': f.correctiveAction,
      'Work Order': f.workOrder
    }));
    if (!rows.length) return this.flash('No findings to export.');
    downloadCsv(`inspection-findings-${this.today}.csv`, rows);
  }

  flash(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }
}
