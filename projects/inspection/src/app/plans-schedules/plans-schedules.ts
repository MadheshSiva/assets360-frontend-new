import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  CalendarDays,
  CalendarPlus,
  CircleAlert,
  Download,
  Ellipsis,
  FileText,
  Layers,
  Pencil,
  Plus,
  Search,
  User,
  Users
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { InspectionPlan } from '../shared/inspection.models';
import { downloadCsv, fmtDate, isoDay, pillClass } from '../shared/insp-utils';
import { ScheduleCalendar } from './schedule-calendar';
import { PlanFormDrawer } from './plan-form-drawer';

const CLOSED = ['Completed', 'Cancelled'];
const PREVIEW = 4;

/** Inspection Plan & Schedule: recurring plans, KPIs, the schedule calendar and the selected plan's summary. */
@Component({
  selector: 'app-insp-plans-schedules',
  imports: [FormsModule, RouterLink, LucideAngularModule, ScheduleCalendar, PlanFormDrawer],
  templateUrl: './plans-schedules.html',
  styleUrls: ['../shared/insp-page.css', './plans-schedules.css']
})
export class PlansSchedulesPage {
  private readonly api = inject(InspectionApi);
  readonly icons = { CalendarDays, CalendarPlus, CircleAlert, Download, Ellipsis, FileText, Layers, Pencil, Plus, Search, User, Users };
  readonly fmtDate = fmtDate;
  readonly pillClass = pillClass;

  readonly plans = this.api.plans;
  readonly inspections = this.api.inspections;
  private readonly today = isoDay(new Date());
  private readonly weekEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // through Sunday
    return isoDay(d);
  })();

  readonly search = signal('');
  readonly statusFilter = signal<'Active' | 'Inactive' | ''>('');
  readonly selectedId = signal<string | null>(null);
  readonly menuId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);
  readonly showAll = signal(false);
  readonly drawerOpen = signal(false);
  readonly editing = signal<InspectionPlan | null>(null);
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.plans.items().filter((p) => {
      if (status === 'Active' && !this.isActive(p)) return false;
      if (status === 'Inactive' && this.isActive(p)) return false;
      if (!q) return true;
      return [p.planName, p.planCode, p.category, p.inspectionTypeName, p.inspectorName].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  });

  readonly visible = computed(() => (this.showAll() ? this.filtered() : this.filtered().slice(0, PREVIEW)));
  readonly selected = computed(() => this.plans.items().find((p) => p.id === this.selectedId()) ?? null);

  readonly people = computed(() => {
    const names = new Set<string>();
    this.plans.items().forEach((p) => p.inspectorName && names.add(p.inspectorName));
    this.inspections.items().forEach((i) => i.assignedTo && names.add(i.assignedTo));
    this.api.findings.items().forEach((f) => f.owner && names.add(f.owner));
    return [...names].sort();
  });

  readonly kpis = computed(() => {
    const t = this.today;
    const day = (v: string | null) => (v ? v.slice(0, 10) : '');
    const plans = this.plans.items().filter((p) => this.isActive(p));
    const open = this.inspections.items().filter((i) => !CLOSED.includes(i.status ?? ''));
    const dueWeek = open.filter((i) => day(i.dueDate) >= t && day(i.dueDate) <= this.weekEnd);
    // Plans due this week that have no generated inspection yet also count.
    const plannedWeek = plans.filter(
      (p) => day(p.nextDueDate) >= t && day(p.nextDueDate) <= this.weekEnd && !dueWeek.some((i) => i.planCode === p.planCode)
    );
    const overdue =
      open.filter((i) => i.status === 'Overdue' || (i.status !== 'In Progress' && !!i.dueDate && day(i.dueDate) < t)).length +
      plans.filter((p) => !!p.nextDueDate && day(p.nextDueDate) < t).length;
    const unassigned = open.filter((i) => !i.assignedTo?.trim()).length + plans.filter((p) => !p.inspectorName?.trim()).length;
    return { active: plans.length, dueWeek: dueWeek.length + plannedWeek.length, overdue, unassigned };
  });

  constructor() {
    this.api.plans.load();
    this.api.inspections.load();
    this.api.types.load();
    this.api.checklists.load();
    // Keep a plan selected: the first visible one once plans arrive or when the selection is removed.
    effect(() => {
      const rows = this.filtered();
      const id = this.selectedId();
      if (rows.length && (!id || !this.plans.items().some((p) => p.id === id))) this.selectedId.set(rows[0]!.id);
    });
  }

  isActive(p: InspectionPlan): boolean {
    return p.isActive && p.status !== 'Inactive';
  }

  planStatus(p: InspectionPlan): string {
    return this.isActive(p) ? 'Active' : 'Inactive';
  }

  toggleMenu(id: string, ev: Event): void {
    ev.stopPropagation();
    this.menuId.update((cur) => (cur === id ? null : id));
    this.confirmDeleteId.set(null);
  }

  openNew(): void {
    this.editing.set(null);
    this.drawerOpen.set(true);
  }

  edit(p: InspectionPlan): void {
    this.menuId.set(null);
    this.editing.set(p);
    this.drawerOpen.set(true);
  }

  onSaved(p: InspectionPlan): void {
    this.drawerOpen.set(false);
    this.selectedId.set(p.id);
    this.flash(`Plan ${p.planCode || p.planName} saved.`);
  }

  toggleActive(p: InspectionPlan): void {
    this.menuId.set(null);
    const isActive = !this.isActive(p);
    this.persist({ ...p, isActive, status: isActive ? 'Active' : 'Inactive' }, isActive ? 'Plan activated.' : 'Plan deactivated.');
  }

  setAutoGenerate(p: InspectionPlan, autoGenerate: boolean): void {
    this.persist({ ...p, autoGenerate }, `Auto-generate turned ${autoGenerate ? 'on' : 'off'}.`);
  }

  askDelete(p: InspectionPlan): void {
    this.menuId.set(null);
    this.confirmDeleteId.set(p.id);
  }

  remove(p: InspectionPlan): void {
    this.confirmDeleteId.set(null);
    this.plans.remove(p.id).subscribe({
      next: () => {
        if (this.selectedId() === p.id) this.selectedId.set(null);
        this.flash('Plan deleted.');
      },
      error: (e) => this.flash(apiErrorMessage(e))
    });
  }

  export(): void {
    const rows = this.filtered().map((p) => ({
      'Plan Code': p.planCode,
      'Plan Name': p.planName,
      Type: p.inspectionTypeName,
      Category: p.category,
      Frequency: p.frequency,
      Assets: p.assetCount,
      'Next Due': p.nextDueDate ?? '',
      Inspector: p.inspectorName,
      Checklist: p.checklistName,
      'Lead Time (days)': p.leadTimeDays,
      'Auto Generate': p.autoGenerate ? 'Yes' : 'No',
      Status: this.planStatus(p)
    }));
    if (!rows.length) return this.flash('No plans to export.');
    downloadCsv(`inspection-plans-${this.today}.csv`, rows);
  }

  closeMenus(): void {
    this.menuId.set(null);
  }

  private persist(p: InspectionPlan, message: string): void {
    this.plans.save(p).subscribe({ next: () => this.flash(message), error: (e) => this.flash(apiErrorMessage(e)) });
  }

  private flash(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }
}
