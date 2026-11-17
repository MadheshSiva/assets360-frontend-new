import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bluetooth,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Cpu,
  Download,
  Ellipsis,
  Gauge,
  Info,
  Link,
  ListChecks,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Router as RouterIcon,
  Search,
  ShieldCheck,
  Signal,
  Thermometer,
  TriangleAlert,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-angular';
import { apiErrorMessage } from '../shared/tracking-api';
import {
  DEVICES, Device, DeviceKind, HISTORY, HistoryEntry, KIND_LABELS, MAINT_TYPES, MaintType, PLANS, PRIORITIES, Plan, Priority, REQUESTS, ReqStatus,
  SITES, SITE_AREAS, ServiceRequest, TASKS, TECHNICIANS, Task, TaskStatus, VENDORS, Vendor, daysFromToday, kindOf, rel, telemetry, titleOf, toIso, todayIso,
} from './maintenance-data';
import { Assignee, MaintenanceApiService, MaintenanceDeviceDto, MaintenanceJobDto, MaintenanceJobRequest, requestOf, toTechnician, toVendor } from './maintenance-api.service';

type Tab = 'overview' | 'requests' | 'plans' | 'history' | 'vendors';
type PanelTab = 'details' | 'maintenance' | 'telemetry';
type Category = 'preventive' | 'calibration' | 'overdue' | 'other';

interface CalCell { iso: string; day: number; inMonth: boolean; today: boolean; cats: Category[]; count: number }
interface Chart { line: string; area: string; min: number; max: number; last: number; ticks: { y: number; label: string }[] }

type Dialog =
  | { kind: 'assign'; task: Task | null; req: ServiceRequest | null; value: string }
  | { kind: 'reschedule'; task: Task; value: string }
  | { kind: 'request'; deviceId: string; type: MaintType | null; priority: Priority | null; due: string; assignee: string; site: string; description: string; error: string }
  | { kind: 'plan'; plan: Plan | null; name: string; deviceKind: DeviceKind | null; interval: number; type: MaintType | null; checklist: string; error: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICONS = { gateway: RouterIcon, vibration: Activity, temp: Thermometer, beacon: Bluetooth, tracker: Truck, meter: Gauge, other: Cpu };
const CW = 300;
const CH = 92;
const CP = { l: 34, r: 6, t: 6, b: 16 };
const OPEN_REQ: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold'];
const UNASSIGNED = 'Unassigned';

@Component({
  selector: 'app-device-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-maintenance.html',
  styleUrls: ['./device-maintenance.css', './device-maintenance-panel.css', './device-maintenance-tabs.css', '../shared/iot-purple-theme.css'],
})
export class DeviceMaintenance implements OnInit, OnDestroy {
  readonly icons = { ArrowDown, ArrowRight, ArrowUp, Building2, Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, Cpu, Download, Ellipsis, Info, Link, ListChecks, Mail, MapPin, Pencil, Phone, Plus, RotateCcw, Search, ShieldCheck, Signal, TriangleAlert, Users, Wrench, X };
  readonly devices = DEVICES;
  readonly tasks = TASKS;
  readonly requests = REQUESTS;
  readonly plans = PLANS;
  readonly vendors = VENDORS;
  readonly sites = SITES;
  readonly maintTypes = MAINT_TYPES;
  readonly priorities = PRIORITIES;
  readonly technicians = TECHNICIANS;
  readonly kinds = Object.keys(KIND_LABELS) as DeviceKind[];
  readonly kindLabels = KIND_LABELS;
  readonly statuses: TaskStatus[] = ['Scheduled', 'In Progress', 'Due Soon', 'Overdue', 'Completed'];
  /** "On Hold" has no API status, so it is not offered. */
  readonly reqStatuses: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'Completed', 'Cancelled'];
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly pageSizes = [8, 15, 30];
  readonly cw = CW;
  readonly ch = CH;
  readonly cp = CP;

  private readonly router = inject(Router);
  private readonly api = inject(MaintenanceApiService);
  private subs = new Subscription();

  tab: Tab = 'overview';
  panelTab: PanelTab = 'details';
  /** No device is selected until a row is clicked. */
  selectedId: string | null = null;

  // overview filters
  search = '';
  fSite = '';
  fKind = '';
  fType = '';
  fStatus = '';
  dayFilter = '';
  sortDue: 'none' | 'asc' | 'desc' = 'none';
  page = 0;
  pageSize = 8;

  // calendar
  viewYear = new Date().getFullYear();
  viewMonth = new Date().getMonth();

  // requests tab
  rSearch = '';
  rStatus = '';
  rPriority = '';
  rPage = 0;

  // history tab
  hSearch = '';
  hDevice = '';
  hType = '';
  hRange: '' | 'month' | '90' | '365' | 'all' = '';
  hPage = 0;

  menuOpen = '';
  dialog: Dialog | null = null;
  toast = '';
  loading = false;
  loadError = '';
  /** A create / update / delete is in flight. */
  busy = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  /** API records and the device dropdown, the source every list above is built from. */
  private jobs: MaintenanceJobDto[] = [];
  private deviceOpts: MaintenanceDeviceDto[] = [];
  private assignees: Assignee[] = [];
  private defaultType = '';
  private defaultPriority = '';

  ngOnInit(): void {
    this.loadOptions();
    this.loadAssignees();
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    this.subs.unsubscribe();
  }

  // ===== Loading =====

  private loadOptions(): void {
    this.subs.add(this.api.options().subscribe({
      next: (o) => {
        MAINT_TYPES.splice(0, MAINT_TYPES.length, ...o.maintenanceTypes);
        PRIORITIES.splice(0, PRIORITIES.length, ...o.priorities);
        this.defaultType = o.defaultMaintenanceType;
        this.defaultPriority = o.defaultPriority;
      },
      error: (e: unknown) => this.showToast(apiErrorMessage(e, 'Could not load the maintenance options.')),
    }));
  }

  /** Technicians and AMC vendors from Master Data; when unavailable, only names already on jobs are offered. */
  private loadAssignees(): void {
    this.subs.add(forkJoin({
      techs: this.api.technicians().pipe(catchError(() => of([]))),
      vendors: this.api.vendors().pipe(catchError(() => of([]))),
    }).subscribe(({ techs, vendors }) => {
      this.assignees = [...techs.filter((t) => !t.isDeleted).map(toTechnician), ...vendors.filter((v) => !v.isDeleted).map(toVendor)];
      VENDORS.splice(0, VENDORS.length, ...this.assignees.map((a): Vendor => ({
        id: a.id, name: a.name, internal: a.type === 'Technician', services: a.skill ? [a.skill] : [], sla: '', contact: a.contact, phone: a.phone, email: a.email, rating: null,
      })));
      this.rebuild();
    }));
  }

  /** Jobs (GET /api/device-maintenance) and the device list (GET /api/device-maintenance/devices). */
  load(): void {
    this.loading = true;
    this.loadError = '';
    this.subs.add(forkJoin({
      jobs: this.api.list(),
      devices: this.api.devices('', 100).pipe(catchError((e: unknown) => {
        this.showToast(apiErrorMessage(e, 'Could not load devices.'));
        return of([] as MaintenanceDeviceDto[]);
      })),
    }).subscribe({
      next: ({ jobs, devices }) => {
        this.jobs = jobs;
        this.deviceOpts = devices;
        this.loading = false;
        this.rebuild();
      },
      error: (e: unknown) => {
        this.loading = false;
        this.loadError = apiErrorMessage(e, 'Could not load maintenance jobs.');
      },
    }));
  }

  /** Rebuilds devices, tasks, requests and history from the API records (checklist ticks are kept per job). */
  private rebuild(): void {
    const devices = new Map<string, Device>();
    const put = (d: Device) => {
      const old = devices.get(d.id);
      devices.set(d.id, old ? { ...old, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v !== null)) } as Device : d);
    };
    for (const o of this.deviceOpts) {
      put({
        id: o.deviceId, name: o.deviceName || o.deviceType, kind: kindOf(`${o.deviceType} ${o.deviceName}`), model: o.model,
        asset: o.assetName ? { id: o.assetRegistrationId ?? '', name: o.assetName } : null, infra: '', site: o.siteName ?? '', siteId: o.siteId ?? '',
        health: null, uptime: null, firmware: '', warranty: '',
      });
    }
    // jobs are newest first, so the latest job's device details win over older ones
    for (const j of [...this.jobs].reverse()) {
      const known = devices.get(j.deviceId);
      put({
        id: j.deviceId, name: j.deviceName ?? known?.name ?? '', kind: known?.kind ?? kindOf(j.deviceName ?? ''), model: j.model,
        asset: j.assetName ? { id: j.assetRegistrationId ?? '', name: j.assetName } : known?.asset ?? null, infra: '', site: j.siteName, siteId: j.siteId ?? '',
        health: null, uptime: null, firmware: '', warranty: '',
      });
    }
    DEVICES.splice(0, DEVICES.length, ...[...devices.values()].sort((a, b) => a.id.localeCompare(b.id)));

    const ticks = new Map(TASKS.map((t) => [t.id, t.checklist]));
    TASKS.splice(0, TASKS.length, ...this.jobs.filter((j) => j.status !== 'Cancelled').map((j) => this.taskOf(j, ticks.get(j.maintenanceId))));
    REQUESTS.splice(0, REQUESTS.length, ...this.jobs.map((j) => this.requestOfJob(j)));
    HISTORY.splice(0, HISTORY.length, ...this.jobs.filter((j) => j.status === 'Completed').map((j): HistoryEntry => ({
      id: j.maintenanceId, deviceId: j.deviceId, date: this.completedOn(j), by: j.assignedTo || j.updatedBy || '—', title: titleOf(j.maintenanceType), note: j.description || '—',
    })));
    SITES.splice(0, SITES.length, ...[...new Set(DEVICES.map((d) => d.site).filter((s) => !!s))].sort());
    const names = [...this.assignees.map((a) => a.name), ...this.jobs.map((j) => j.assignedTo ?? '')].filter((n) => !!n);
    TECHNICIANS.splice(0, TECHNICIANS.length, UNASSIGNED, ...[...new Set(names)].sort((a, b) => a.localeCompare(b)));
    if (this.selectedId && !DEVICES.some((d) => d.id === this.selectedId)) this.selectedId = null;
    this.chartCache.clear();
  }

  private completedOn(j: MaintenanceJobDto): string {
    return (j.updatedAt ?? j.dueDate).slice(0, 10);
  }

  private taskOf(j: MaintenanceJobDto, checklist?: boolean[]): Task {
    const stage = j.status === 'Completed' ? 'completed' : j.status === 'In Progress' ? 'in-progress' : 'planned';
    const items = this.planOf(this.device(j.deviceId).kind)?.checklist.length ?? 0;
    return {
      id: j.maintenanceId, deviceId: j.deviceId, type: j.maintenanceType, due: j.dueDate.slice(0, 10), assignee: j.assignedTo || UNASSIGNED,
      booked: !!j.assignedTo, stage, checklist: checklist && checklist.length === items ? checklist : new Array(items).fill(false),
      completedOn: stage === 'completed' ? this.completedOn(j) : undefined, job: j,
    };
  }

  private requestOfJob(j: MaintenanceJobDto): ServiceRequest {
    const status: ReqStatus = j.status === 'Completed' ? 'Completed' : j.status === 'Cancelled' ? 'Cancelled' : j.status === 'In Progress' ? 'In Progress' : j.assignedTo ? 'Assigned' : 'Open';
    return {
      id: j.maintenanceId, deviceId: j.deviceId, type: j.maintenanceType, priority: j.priority, status, created: (j.createdAt ?? '').slice(0, 10),
      due: j.dueDate.slice(0, 10), assignee: j.assignedTo || UNASSIGNED, description: j.description || '—', job: j,
    };
  }

  /** Date-driven status the API keeps for open jobs (Scheduled / Due Soon / Overdue). */
  private dateStatus(due: string, assigned: boolean): string {
    const n = daysFromToday(due);
    if (n < 0) return 'Overdue';
    return assigned || n > 30 ? 'Scheduled' : 'Due Soon';
  }

  /** PUT a job with some fields changed; the list is rebuilt from the server copy. */
  private saveJob(job: MaintenanceJobDto, change: Partial<MaintenanceJobRequest>, done: (saved: MaintenanceJobDto) => void): void {
    if (this.busy) return;
    const body = { ...requestOf(job), ...change };
    if (!change.status && body.status && ['Scheduled', 'Due Soon', 'Overdue'].includes(body.status)) body.status = this.dateStatus(body.dueDate, !!body.assignedTo);
    this.busy = true;
    this.subs.add(this.api.update(job.maintenanceId, body).subscribe({
      next: (saved) => {
        this.busy = false;
        this.jobs = this.jobs.map((j) => (j.maintenanceId === saved.maintenanceId ? saved : j));
        this.rebuild();
        done(saved);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not update ${job.maintenanceId}.`));
      },
    }));
  }

  private assigneeFields(name: string): Pick<MaintenanceJobRequest, 'assignedTo' | 'assignedToId' | 'assignedToType'> {
    if (!name || name === UNASSIGNED) return { assignedTo: null, assignedToId: null, assignedToType: null };
    const a = this.assignees.find((x) => x.name === name);
    return { assignedTo: name, assignedToId: a?.id ?? null, assignedToType: a?.type ?? null };
  }

  // ===== Lookups & formatting =====

  device(id: string): Device {
    return DEVICES.find((d) => d.id === id) ?? { id, name: '', kind: 'other', model: '', asset: null, infra: '', site: '', siteId: '', health: null, uptime: null, firmware: '', warranty: '' };
  }

  kindIcon(id: string) {
    return KIND_ICONS[this.device(id).kind];
  }

  planOf(kind: DeviceKind): Plan | undefined {
    return PLANS.find((p) => p.kind === kind);
  }

  checklistOf(t: Task): string[] {
    return this.planOf(this.device(t.deviceId).kind)?.checklist ?? [];
  }

  fmt(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
    return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  }

  isPast(iso: string): boolean {
    return !!iso && daysFromToday(iso) < 0;
  }

  goPage(which: string, p: number): void {
    if (which === 'ov') this.page = p;
    else if (which === 'req') this.rPage = p;
    else this.hPage = p;
  }

  relLabel(iso: string): string {
    const n = daysFromToday(iso);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n > 1) return `in ${n} days`;
    return n === -1 ? '1 day overdue' : `${-n} days overdue`;
  }

  dueClass(t: Task): string {
    if (t.stage === 'completed') return '';
    const n = daysFromToday(t.due);
    return n < 0 ? 'due--bad' : n <= 7 ? 'due--warn' : '';
  }

  status(t: Task): TaskStatus {
    if (t.stage === 'completed') return 'Completed';
    if (t.stage === 'in-progress') return 'In Progress';
    const n = daysFromToday(t.due);
    if (n < 0) return 'Overdue';
    if (t.booked || n > 30) return 'Scheduled';
    return 'Due Soon';
  }

  statusClass(t: Task): string {
    return 'ps--' + this.status(t).toLowerCase().replace(' ', '-');
  }

  reqClass(s: ReqStatus): string {
    return 'rs--' + s.toLowerCase().replace(' ', '-');
  }

  priorityClass(p: string): string {
    return 'pr--' + p.toLowerCase();
  }

  isOpenReq(r: ServiceRequest): boolean {
    return OPEN_REQ.includes(r.status);
  }

  category(t: Task): Category {
    if (this.status(t) === 'Overdue') return 'overdue';
    return t.type === 'Preventive' ? 'preventive' : t.type === 'Calibration' ? 'calibration' : 'other';
  }

  private get openTasks(): Task[] {
    return TASKS.filter((t) => t.stage !== 'completed');
  }

  /** Text of the overview table's empty row while loading or after a failed load. */
  get emptyText(): string {
    if (this.loading) return 'Loading maintenance jobs…';
    if (this.loadError) return 'Maintenance jobs could not be loaded.';
    if (!TASKS.length) return 'No maintenance jobs yet.';
    return '';
  }

  // ===== KPIs =====

  get kpis() {
    const open = this.openTasks;
    const due = new Set(open.filter((t) => daysFromToday(t.due) <= 30).map((t) => t.deviceId)).size;
    const openReq = REQUESTS.filter((r) => this.isOpenReq(r)).length;
    const overdue = open.filter((t) => this.status(t) === 'Overdue').length;
    const month = todayIso().slice(0, 7);
    const completed = HISTORY.filter((h) => h.date.startsWith(month)).length;
    return { due, open: openReq, overdue, completed };
  }

  kpiGo(which: 'due' | 'open' | 'overdue' | 'completed'): void {
    if (which === 'open') return void (this.tab = 'requests');
    if (which === 'completed') {
      this.tab = 'history';
      this.hRange = 'month';
      this.hPage = 0;
      return;
    }
    this.tab = 'overview';
    this.clearFilters();
    if (which === 'overdue') this.fStatus = 'Overdue';
  }

  // ===== Overview table =====

  get rows(): Task[] {
    const q = this.search.trim().toLowerCase();
    const rows = TASKS.filter((t) => {
      const d = this.device(t.deviceId);
      if (q && !`${t.id} ${d.id} ${d.name} ${d.model} ${d.asset?.id ?? ''} ${d.asset?.name ?? ''} ${t.assignee}`.toLowerCase().includes(q)) return false;
      if (this.fSite && d.site !== this.fSite) return false;
      if (this.fKind && d.kind !== this.fKind) return false;
      if (this.fType && t.type !== this.fType) return false;
      if (this.fStatus && this.status(t) !== this.fStatus) return false;
      if (this.dayFilter && t.due !== this.dayFilter) return false;
      return true;
    });
    if (this.sortDue !== 'none') rows.sort((a, b) => (this.sortDue === 'asc' ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)));
    return rows;
  }

  get pageRows(): Task[] {
    const rows = this.rows;
    if (this.page * this.pageSize >= rows.length) this.page = 0;
    return rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
  }

  /** Page buttons with gaps, e.g. 1 2 3 … 9. */
  pagesOf(current: number, total: number, size: number): (number | null)[] {
    const n = this.pageCount(total, size);
    const set = [...new Set([0, current - 1, current, current + 1, n - 1])].filter((x) => x >= 0 && x < n).sort((a, b) => a - b);
    const out: (number | null)[] = [];
    set.forEach((x, i) => {
      if (i && x - set[i - 1] > 1) out.push(null);
      out.push(x);
    });
    return out;
  }

  rangeLabel(current: number, size: number, total: number): string {
    if (!total) return '0 results';
    return `${current * size + 1}–${Math.min(total, (current + 1) * size)} of ${total}`;
  }

  onFilter(): void {
    this.page = 0;
  }

  cycleSort(): void {
    this.sortDue = this.sortDue === 'none' ? 'asc' : this.sortDue === 'asc' ? 'desc' : 'none';
  }

  clearFilters(): void {
    this.search = this.fSite = this.fKind = this.fType = this.fStatus = this.dayFilter = '';
    this.page = 0;
  }

  get hasFilters(): boolean {
    return !!(this.search || this.fSite || this.fKind || this.fType || this.fStatus || this.dayFilter);
  }

  select(id: string, panelTab: PanelTab = 'details'): void {
    this.selectedId = id;
    this.panelTab = panelTab;
    this.menuOpen = '';
  }

  // ===== Calendar =====

  get monthLabel(): string {
    return `${MONTHS[this.viewMonth]} ${this.viewYear}`;
  }

  shiftMonth(n: number): void {
    const d = new Date(this.viewYear, this.viewMonth + n, 1);
    this.viewYear = d.getFullYear();
    this.viewMonth = d.getMonth();
  }

  get cells(): CalCell[] {
    const first = new Date(this.viewYear, this.viewMonth, 1);
    const start = new Date(this.viewYear, this.viewMonth, 1 - first.getDay());
    const daysIn = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysIn) / 7);
    const byDay = new Map<string, Task[]>();
    for (const t of this.openTasks) byDay.set(t.due, [...(byDay.get(t.due) ?? []), t]);
    const today = todayIso();
    const out: CalCell[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toIso(d);
      const list = byDay.get(iso) ?? [];
      out.push({ iso, day: d.getDate(), inMonth: d.getMonth() === this.viewMonth, today: iso === today, cats: [...new Set(list.map((t) => this.category(t)))], count: list.length });
    }
    return out;
  }

  get legend(): { cat: Category; label: string; n: number }[] {
    const open = this.openTasks;
    const n = (c: Category) => open.filter((t) => this.category(t) === c).length;
    return [
      { cat: 'preventive', label: 'Preventive', n: n('preventive') },
      { cat: 'calibration', label: 'Calibration', n: n('calibration') },
      { cat: 'overdue', label: 'Overdue', n: n('overdue') },
      { cat: 'other', label: 'Other', n: n('other') },
    ];
  }

  pickDay(c: CalCell): void {
    if (!c.inMonth) {
      const [y, m] = c.iso.split('-').map(Number);
      this.viewYear = y;
      this.viewMonth = m - 1;
    }
    this.dayFilter = this.dayFilter === c.iso ? '' : c.iso;
    this.page = 0;
  }

  dayTitle(c: CalCell): string {
    return `${this.fmt(c.iso)}${c.count ? ` – ${c.count} maintenance job${c.count > 1 ? 's' : ''}` : ''}`;
  }

  // ===== Selected device =====

  get selected(): Device | null {
    return this.selectedId ? this.device(this.selectedId) : null;
  }

  /** The device's next open task (earliest due), or its most recent completed one. */
  currentTask(id: string): Task | null {
    const all = TASKS.filter((t) => t.deviceId === id);
    const open = all.filter((t) => t.stage !== 'completed').sort((a, b) => a.due.localeCompare(b.due));
    if (open.length) return open[0];
    return all.sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''))[0] ?? null;
  }

  openTasksOf(id: string): Task[] {
    return this.openTasks.filter((t) => t.deviceId === id).sort((a, b) => a.due.localeCompare(b.due));
  }

  historyOf(id: string): HistoryEntry[] {
    return HISTORY.filter((h) => h.deviceId === id).sort((a, b) => b.date.localeCompare(a.date));
  }

  lastService(id: string): string {
    return this.historyOf(id)[0]?.date ?? '';
  }

  requestsOf(id: string): ServiceRequest[] {
    return REQUESTS.filter((r) => r.deviceId === id && this.isOpenReq(r));
  }

  doneCount(t: Task): number {
    return t.checklist.filter((c) => c).length;
  }

  /** Checklists come from session plans (no API), so ticks are kept on the page only. */
  toggleCheck(t: Task, i: number): void {
    t.checklist[i] = !t.checklist[i];
  }

  primaryLabel(t: Task): string {
    if (t.stage === 'planned') return 'Start Service';
    if (t.stage === 'in-progress') return this.doneCount(t) === t.checklist.length ? 'Complete Service' : 'Service In Progress';
    return 'Service Completed';
  }

  primaryDisabled(t: Task): boolean {
    return this.busy || t.stage === 'completed' || (t.stage === 'in-progress' && this.doneCount(t) < t.checklist.length);
  }

  primaryAction(t: Task): void {
    if (t.stage === 'planned') this.startService(t);
    else if (t.stage === 'in-progress' && this.doneCount(t) === t.checklist.length) this.completeTask(t);
  }

  startService(t: Task): void {
    this.menuOpen = '';
    if (t.stage !== 'planned') return;
    this.saveJob(t.job, { status: 'In Progress' }, () =>
      this.showToast(`Service started on ${t.deviceId}${t.assignee === UNASSIGNED ? ' – remember to assign a technician' : ` by ${t.assignee}`}.`));
  }

  /** Marks the job completed; when the device type has a plan, the next service is created from its interval. */
  completeTask(t: Task): void {
    this.menuOpen = '';
    if (t.stage === 'completed') return;
    const d = this.device(t.deviceId);
    const plan = this.planOf(d.kind);
    const done = this.doneCount(t);
    const note = done ? `Checklist completed (${done}/${t.checklist.length}).` : '';
    const description = [t.job.description, note].filter((x) => !!x).join(' ') || null;
    this.saveJob(t.job, { status: 'Completed', description }, (saved) => {
      if (!plan) return this.showToast(`${titleOf(t.type)} on ${d.id} completed.`);
      const next = rel(plan.interval);
      const body: MaintenanceJobRequest = {
        ...requestOf(saved), maintenanceType: plan.type, dueDate: next, priority: null, status: null,
        description: `${plan.name} (every ${plan.interval} days).`,
      };
      this.subs.add(this.api.create(body).subscribe({
        next: (job) => {
          this.jobs = [job, ...this.jobs];
          this.rebuild();
          this.showToast(`${titleOf(t.type)} on ${d.id} completed. Next service ${job.maintenanceId} scheduled for ${this.fmt(next)}.`);
        },
        error: (e: unknown) => this.showToast(`${titleOf(t.type)} on ${d.id} completed, but the next service could not be scheduled: ${apiErrorMessage(e, 'request failed')}`),
      }));
    });
  }

  // ===== Navigation =====

  createReplacement(id: string): void {
    this.menuOpen = '';
    this.router.navigate(['/tracking-iot/device-replacement'], { queryParams: { device: id } });
  }

  viewAsset(d: Device): void {
    this.router.navigate(['/assets/list'], { queryParams: { search: d.asset ? d.asset.id || d.asset.name : d.id } });
  }

  viewOnMap(d: Device): void {
    this.router.navigate(['/tracking-iot/real-time-location'], { queryParams: { device: d.id } });
  }

  siteArea(site: string): string {
    return SITE_AREAS[site] ?? '';
  }

  viewAllHistory(id: string): void {
    this.tab = 'history';
    this.hDevice = id;
    this.hRange = 'all';
    this.hPage = 0;
  }

  // ===== Telemetry =====

  private chartCache = new Map<string, { up: Chart; rssi: Chart } | null>();

  /** Null when no telemetry has been reported for the device. */
  charts(d: Device): { up: Chart; rssi: Chart } | null {
    let c = this.chartCache.get(d.id);
    if (c === undefined) {
      const t = telemetry(d.id, d.uptime ?? 0);
      c = t.uptime.length >= 2 && t.rssi.length >= 2 ? { up: this.chart(t.uptime, 1, '%'), rssi: this.chart(t.rssi, 0, ' dBm') } : null;
      this.chartCache.set(d.id, c);
    }
    return c;
  }

  private chart(v: number[], dp: number, unit: string): Chart {
    const min = Math.min(...v);
    const max = Math.max(...v);
    const lo = Math.floor(min - 1);
    const hi = Math.ceil(max + 1);
    const x = (i: number) => CP.l + (i / (v.length - 1)) * (CW - CP.l - CP.r);
    const y = (n: number) => CP.t + (1 - (n - lo) / (hi - lo)) * (CH - CP.t - CP.b);
    const line = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join('');
    const area = `${line}L${x(v.length - 1)},${CH - CP.b}L${x(0)},${CH - CP.b}Z`;
    const ticks = [hi, (hi + lo) / 2, lo].map((n) => ({ y: y(n), label: `${n.toFixed(dp ? 0 : 0)}${unit === '%' ? '%' : ''}` }));
    return { line, area, min: +min.toFixed(dp), max: +max.toFixed(dp), last: v[v.length - 1], ticks };
  }

  readonly chartDays = [{ x: CP.l, label: '30d ago' }, { x: CP.l + (CW - CP.l - CP.r) / 2, label: '15d' }, { x: CW - CP.r, label: 'Today' }];

  // ===== Service requests tab =====

  get requestRows(): ServiceRequest[] {
    const q = this.rSearch.trim().toLowerCase();
    return REQUESTS.filter((r) => {
      if (this.rStatus === 'active' && !this.isOpenReq(r)) return false;
      if (this.rStatus && this.rStatus !== 'active' && this.rStatus !== 'all' && r.status !== this.rStatus) return false;
      if (this.rPriority && r.priority !== this.rPriority) return false;
      const d = this.device(r.deviceId);
      return !q || `${r.id} ${d.id} ${d.name} ${r.assignee} ${r.description}`.toLowerCase().includes(q);
    });
  }

  get requestPage(): ServiceRequest[] {
    const rows = this.requestRows;
    if (this.rPage * 10 >= rows.length) this.rPage = 0;
    return rows.slice(this.rPage * 10, this.rPage * 10 + 10);
  }

  /** Request status → job status: Open (reopen) → Scheduled / Due Soon / Overdue by date; On Hold has no API status. */
  setReq(r: ServiceRequest, s: ReqStatus): void {
    this.menuOpen = '';
    if (s === 'On Hold') return;
    if (s === 'Cancelled' && !confirm(`Cancel ${r.id}?`)) return;
    const status = s === 'Open' || s === 'Assigned' ? this.dateStatus(r.due, !!r.job.assignedTo) : s;
    this.saveJob(r.job, { status }, () => this.showToast(`${r.id} ${s === 'In Progress' ? 'started' : s === 'Open' ? 'reopened' : s.toLowerCase()}.`));
  }

  deleteRequest(r: ServiceRequest): void {
    this.menuOpen = '';
    if (this.busy || !confirm(`Delete ${r.id}? This removes the job permanently.`)) return;
    this.busy = true;
    this.subs.add(this.api.remove(r.id).subscribe({
      next: () => {
        this.busy = false;
        this.jobs = this.jobs.filter((j) => j.maintenanceId !== r.id);
        this.rebuild();
        this.showToast(`${r.id} deleted.`);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.showToast(apiErrorMessage(e, `Could not delete ${r.id}.`));
      },
    }));
  }

  viewDevice(id: string): void {
    this.menuOpen = '';
    this.tab = 'overview';
    this.select(id, 'maintenance');
  }

  // ===== Plans tab =====

  devicesCovered(p: Plan): number {
    return DEVICES.filter((d) => d.kind === p.kind).length;
  }

  nextDueOf(p: Plan): string {
    const due = this.openTasks.filter((t) => this.device(t.deviceId).kind === p.kind).map((t) => t.due).sort();
    return due[0] ?? '';
  }

  showPlanDevices(p: Plan): void {
    this.tab = 'overview';
    this.clearFilters();
    this.fKind = p.kind;
  }

  // ===== Service history tab =====

  get historyTitles(): string[] {
    return [...new Set(HISTORY.map((h) => h.title))].sort();
  }

  get historyRows(): HistoryEntry[] {
    const q = this.hSearch.trim().toLowerCase();
    const month = todayIso().slice(0, 7);
    const span = this.hRange === '90' ? 90 : this.hRange === '365' ? 365 : 0;
    return HISTORY.filter((h) => {
      if (this.hDevice && h.deviceId !== this.hDevice) return false;
      if (this.hType && h.title !== this.hType) return false;
      if (this.hRange === 'month' && !h.date.startsWith(month)) return false;
      if (span && daysFromToday(h.date) < -span) return false;
      return !q || `${h.deviceId} ${this.device(h.deviceId).name} ${h.by} ${h.title} ${h.note}`.toLowerCase().includes(q);
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  get historyPage(): HistoryEntry[] {
    const rows = this.historyRows;
    if (this.hPage * 12 >= rows.length) this.hPage = 0;
    return rows.slice(this.hPage * 12, this.hPage * 12 + 12);
  }

  exportHistory(): void {
    const rows = this.historyRows.map((h) => {
      const d = this.device(h.deviceId);
      return { Date: h.date, Job: h.id, Device: d.id, 'Device Type': d.name, Model: d.model, Site: d.site, 'Linked Asset': d.asset ? d.asset.name : '', Service: h.title, 'Performed By': h.by, Notes: h.note, Result: 'Completed' };
    });
    if (!rows.length) return this.showToast('Nothing to export for these filters.');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Service History');
    XLSX.writeFile(book, `Device_Service_History_${todayIso()}.xlsx`);
    this.showToast(`Exported ${rows.length} service records.`);
  }

  // ===== Vendors tab =====

  openJobs(v: Vendor): number {
    return this.openTasks.filter((t) => t.assignee === v.name).length;
  }

  showVendorJobs(v: Vendor): void {
    this.tab = 'overview';
    this.clearFilters();
    this.search = v.name;
  }

  // ===== Dialogs =====

  openAssign(task: Task | null, req: ServiceRequest | null = null): void {
    this.menuOpen = '';
    const current = (task ?? req)?.assignee;
    this.dialog = { kind: 'assign', task, req, value: current && current !== UNASSIGNED ? current : '' };
  }

  openReschedule(task: Task): void {
    this.menuOpen = '';
    this.dialog = { kind: 'reschedule', task, value: task.due };
  }

  openRequest(deviceId = ''): void {
    this.menuOpen = '';
    const id = deviceId || this.selectedId || '';
    this.dialog = {
      kind: 'request', deviceId: id, type: null, priority: null, due: rel(7),
      assignee: '', site: id ? this.device(id).site : '', description: '', error: '',
    };
  }

  /** Device picked in the request form: its known site fills the Site field. */
  onRequestDevice(): void {
    const g = this.requestDialog;
    if (g && g.deviceId) g.site = this.device(g.deviceId).site || g.site;
  }

  openPlan(plan: Plan | null): void {
    const kind: DeviceKind | null = plan ? plan.kind : this.selected ? this.selected.kind : null;
    this.dialog = {
      kind: 'plan', plan, error: '', name: plan ? plan.name : kind ? `${KIND_LABELS[kind]} service` : '', deviceKind: kind,
      interval: plan ? plan.interval : 90, type: plan ? plan.type : null, checklist: plan ? plan.checklist.join('\n') : '',
    };
  }

  get assignDialog() {
    return this.dialog && this.dialog.kind === 'assign' ? this.dialog : null;
  }

  get rescheduleDialog() {
    return this.dialog && this.dialog.kind === 'reschedule' ? this.dialog : null;
  }

  get requestDialog() {
    return this.dialog && this.dialog.kind === 'request' ? this.dialog : null;
  }

  get planDialog() {
    return this.dialog && this.dialog.kind === 'plan' ? this.dialog : null;
  }

  saveAssign(): void {
    const g = this.assignDialog;
    if (!g) return;
    const job = (g.task ?? g.req)?.job;
    if (!job || !g.value) return;
    const label = g.task ? g.task.deviceId : g.req ? g.req.id : '';
    this.saveJob(job, this.assigneeFields(g.value), () => {
      this.dialog = null;
      this.showToast(g.value === UNASSIGNED ? `${label} unassigned.` : `${label} assigned to ${g.value}.`);
    });
  }

  saveReschedule(): void {
    const g = this.rescheduleDialog;
    if (!g || !g.value) return;
    this.saveJob(g.task.job, { dueDate: g.value }, () => {
      this.dialog = null;
      this.showToast(`${g.task.deviceId} rescheduled to ${this.fmt(g.value)}.`);
    });
  }

  saveRequest(): void {
    const g = this.requestDialog;
    if (!g || this.busy) return;
    if (!g.deviceId) return void (g.error = 'Choose a device.');
    if (!g.type) return void (g.error = 'Choose a maintenance type.');
    if (!g.due) return void (g.error = 'Choose a due date.');
    if (!g.site.trim()) return void (g.error = 'Enter the site.');
    const d = this.device(g.deviceId);
    const site = g.site.trim();
    const body: MaintenanceJobRequest = {
      deviceId: d.id, deviceName: d.name || null, model: d.model || null, assetRegistrationId: d.asset?.id || null, assetName: d.asset?.name || null,
      siteId: site === d.site ? d.siteId || null : DEVICES.find((x) => x.site === site && x.siteId)?.siteId ?? null, siteName: site,
      maintenanceType: g.type, dueDate: g.due, ...this.assigneeFields(g.assignee), priority: g.priority || null,
      description: g.description.trim() || null, status: this.dateStatus(g.due, !!g.assignee && g.assignee !== UNASSIGNED),
    };
    this.busy = true;
    g.error = '';
    this.subs.add(this.api.create(body).subscribe({
      next: (job) => {
        this.busy = false;
        this.jobs = [job, ...this.jobs];
        this.rebuild();
        this.dialog = null;
        this.select(job.deviceId, 'maintenance');
        this.showToast(`${job.maintenanceId} created for ${job.deviceId} and added to the maintenance schedule.`);
      },
      error: (e: unknown) => {
        this.busy = false;
        g.error = apiErrorMessage(e, 'Could not create the service request.');
      },
    }));
  }

  /** Plans have no API endpoint: they are kept for this session only. */
  savePlan(): void {
    const g = this.planDialog;
    if (!g) return;
    const items = g.checklist.split('\n').map((s) => s.trim()).filter((s) => s);
    if (!g.name.trim()) return void (g.error = 'Enter a plan name.');
    if (!g.deviceKind) return void (g.error = 'Choose a device type.');
    if (!g.type) return void (g.error = 'Choose a maintenance type.');
    if (!g.interval || g.interval < 1) return void (g.error = 'Interval must be at least 1 day.');
    if (!items.length) return void (g.error = 'Add at least one checklist item.');
    const data = { name: g.name.trim(), kind: g.deviceKind, interval: Math.round(g.interval), type: g.type, checklist: items };
    let saved = g.plan;
    if (saved) Object.assign(saved, data);
    else PLANS.push((saved = { id: `PL-${String(PLANS.length + 1).padStart(2, '0')}`, ...data }));
    // open jobs follow the checklist of their device type's primary plan (ticked items are kept)
    const primary = this.planOf(g.deviceKind) === saved;
    for (const t of primary ? this.openTasks : []) {
      if (this.device(t.deviceId).kind !== g.deviceKind || t.checklist.length === items.length) continue;
      t.checklist = items.map((_, i) => !!t.checklist[i]);
    }
    this.dialog = null;
    this.showToast(`Plan "${data.name}" saved for this session (plans are not stored on the server yet).`);
  }

  // ===== Menus =====

  toggleMenu(name: string, e: Event): void {
    e.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    const hadMenu = !!this.menuOpen;
    this.menuOpen = '';
    if (this.dialog) this.dialog = null;
    else if (!hadMenu && window.innerWidth < 1200) this.selectedId = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3800);
  }
}

