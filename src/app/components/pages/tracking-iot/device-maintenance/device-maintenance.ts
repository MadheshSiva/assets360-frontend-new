import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import {
  DEVICES, Device, DeviceKind, HISTORY, HistoryEntry, KIND_LABELS, MAINT_TYPES, MaintType, PLANS, PREVIOUS, PRIORITIES, Plan, Priority, REQUESTS, ReqStatus,
  SITES, SITE_AREAS, ServiceRequest, TASKS, TECHNICIANS, Task, TaskStatus, VENDORS, Vendor, daysFromToday, rel, telemetry, titleOf, toIso, todayIso,
} from './maintenance-data';

type Tab = 'overview' | 'requests' | 'plans' | 'history' | 'vendors';
type PanelTab = 'details' | 'maintenance' | 'telemetry';
type Category = 'preventive' | 'calibration' | 'overdue' | 'other';

interface CalCell { iso: string; day: number; inMonth: boolean; today: boolean; cats: Category[]; count: number }
interface Chart { line: string; area: string; min: number; max: number; last: number; ticks: { y: number; label: string }[] }

type Dialog =
  | { kind: 'assign'; task: Task | null; req: ServiceRequest | null; value: string }
  | { kind: 'reschedule'; task: Task; value: string }
  | { kind: 'request'; deviceId: string; type: MaintType; priority: Priority; due: string; assignee: string; description: string; error: string }
  | { kind: 'plan'; plan: Plan | null; name: string; deviceKind: DeviceKind; interval: number; type: MaintType; checklist: string; error: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICONS = { gateway: RouterIcon, vibration: Activity, temp: Thermometer, beacon: Bluetooth, tracker: Truck, meter: Gauge };
const CW = 300;
const CH = 92;
const CP = { l: 34, r: 6, t: 6, b: 16 };
const OPEN_REQ: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold'];

@Component({
  selector: 'app-device-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-maintenance.html',
  styleUrls: ['./device-maintenance.css', './device-maintenance-panel.css', './device-maintenance-tabs.css'],
})
export class DeviceMaintenance implements OnDestroy {
  readonly icons = { ArrowDown, ArrowRight, ArrowUp, Building2, Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, Cpu, Download, Ellipsis, Info, Link, ListChecks, Mail, MapPin, Pencil, Phone, Plus, Search, ShieldCheck, Signal, TriangleAlert, Users, Wrench, X };
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
  readonly reqStatuses: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly pageSizes = [8, 15, 30];
  readonly cw = CW;
  readonly ch = CH;
  readonly cp = CP;

  private readonly router = inject(Router);

  tab: Tab = 'overview';
  panelTab: PanelTab = 'details';
  /** Wide screens open with a device selected; narrower ones keep the drawer closed until a row is clicked. */
  selectedId: string | null = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'GW-DXB-02' : null;

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
  rStatus = 'active';
  rPriority = '';
  rPage = 0;

  // history tab
  hSearch = '';
  hDevice = '';
  hType = '';
  hRange: 'month' | '90' | '365' | 'all' = 'all';
  hPage = 0;

  menuOpen = '';
  dialog: Dialog | null = null;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private seq = 2200;

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Lookups & formatting =====

  device(id: string): Device {
    return DEVICES.find((d) => d.id === id) ?? DEVICES[0];
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
    if (!iso) return '—';
    return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  }

  isPast(iso: string): boolean {
    return daysFromToday(iso) < 0;
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

  // ===== KPIs =====

  get kpis() {
    const open = this.openTasks;
    const due = new Set(open.filter((t) => daysFromToday(t.due) <= 30).map((t) => t.deviceId)).size;
    const openReq = REQUESTS.filter((r) => this.isOpenReq(r)).length;
    const overdue = open.filter((t) => this.status(t) === 'Overdue').length;
    const month = todayIso().slice(0, 7);
    const completed = HISTORY.filter((h) => h.date.startsWith(month)).length;
    const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
    return {
      due, dueChange: pct(due, PREVIOUS.due),
      open: openReq, openChange: pct(openReq, PREVIOUS.open),
      overdue, overdueChange: pct(overdue, PREVIOUS.overdue),
      completed, completedChange: pct(completed, PREVIOUS.completed),
    };
  }

  abs(n: number): number {
    return Math.abs(n);
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
      if (q && !`${d.id} ${d.name} ${d.model} ${d.asset?.id ?? ''} ${d.asset?.name ?? ''} ${t.assignee}`.toLowerCase().includes(q)) return false;
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

  toggleCheck(t: Task, i: number): void {
    t.checklist[i] = !t.checklist[i];
  }

  primaryLabel(t: Task): string {
    if (t.stage === 'planned') return 'Start Service';
    if (t.stage === 'in-progress') return this.doneCount(t) === t.checklist.length ? 'Complete Service' : 'Service In Progress';
    return 'Service Completed';
  }

  primaryDisabled(t: Task): boolean {
    return t.stage === 'completed' || (t.stage === 'in-progress' && this.doneCount(t) < t.checklist.length);
  }

  primaryAction(t: Task): void {
    if (t.stage === 'planned') this.startService(t);
    else if (t.stage === 'in-progress' && this.doneCount(t) === t.checklist.length) this.completeTask(t);
  }

  startService(t: Task): void {
    this.menuOpen = '';
    if (t.stage !== 'planned') return;
    t.stage = 'in-progress';
    t.booked = true;
    for (const r of this.requestsOf(t.deviceId)) if (r.status !== 'On Hold') r.status = 'In Progress';
    this.showToast(`Service started on ${t.deviceId}${t.assignee === 'Unassigned' ? ' – remember to assign a technician' : ` by ${t.assignee}`}.`);
  }

  /** Marks the job completed, writes a history entry and schedules the next service from the plan interval. */
  completeTask(t: Task): void {
    this.menuOpen = '';
    if (t.stage === 'completed') return;
    const d = this.device(t.deviceId);
    const plan = this.planOf(d.kind);
    const today = todayIso();
    const done = this.doneCount(t);
    t.stage = 'completed';
    t.completedOn = today;
    const by = t.assignee === 'Unassigned' ? 'Internal IoT Team' : t.assignee;
    HISTORY.unshift({ id: `H-${Date.now()}`, deviceId: d.id, date: today, by, title: titleOf(t.type), note: done ? `Checklist completed (${done}/${t.checklist.length}). Device verified online.` : 'Marked complete by maintenance planner.' });
    for (const r of this.requestsOf(d.id)) r.status = 'Completed';
    let next = '';
    if (plan) {
      next = rel(plan.interval);
      TASKS.push({ id: `MT-${++this.seq}`, deviceId: d.id, type: plan.type, due: next, assignee: t.assignee, booked: t.assignee !== 'Unassigned', stage: 'planned', checklist: plan.checklist.map(() => false) });
    }
    this.showToast(`${titleOf(t.type)} on ${d.id} completed.${next ? ` Next service scheduled for ${this.fmt(next)}.` : ''}`);
  }

  // ===== Navigation =====

  createReplacement(id: string): void {
    this.menuOpen = '';
    this.router.navigate(['/tracking-iot/device-replacement'], { queryParams: { device: id } });
  }

  viewAsset(d: Device): void {
    this.router.navigate(['/assets/list'], { queryParams: { search: d.asset ? d.asset.id : d.id } });
  }

  viewOnMap(d: Device): void {
    this.router.navigate(['/tracking-iot/real-time-location'], { queryParams: { device: d.id } });
  }

  siteArea(site: string): string {
    return SITE_AREAS[site] ?? site;
  }

  viewAllHistory(id: string): void {
    this.tab = 'history';
    this.hDevice = id;
    this.hRange = 'all';
    this.hPage = 0;
  }

  // ===== Telemetry =====

  private chartCache = new Map<string, { up: Chart; rssi: Chart }>();

  charts(d: Device): { up: Chart; rssi: Chart } {
    let c = this.chartCache.get(d.id);
    if (!c) {
      const t = telemetry(d.id, d.uptime);
      c = { up: this.chart(t.uptime, 1, '%'), rssi: this.chart(t.rssi, 0, ' dBm') };
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
      if (this.rStatus !== 'active' && this.rStatus !== 'all' && r.status !== this.rStatus) return false;
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

  setReq(r: ServiceRequest, s: ReqStatus): void {
    this.menuOpen = '';
    if (s === 'Cancelled' && !confirm(`Cancel ${r.id}?`)) return;
    r.status = s;
    if (s === 'In Progress') {
      const t = this.openTasksOf(r.deviceId)[0];
      if (t && t.stage === 'planned') {
        t.stage = 'in-progress';
        t.booked = true;
      }
    }
    this.showToast(`${r.id} ${s === 'In Progress' ? 'started' : s === 'On Hold' ? 'put on hold' : s.toLowerCase()}.`);
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
      return { Date: h.date, Device: d.id, 'Device Type': d.name, Model: d.model, Site: d.site, 'Linked Asset': d.asset ? d.asset.name : '', Service: h.title, 'Performed By': h.by, Notes: h.note, Result: 'Completed' };
    });
    if (!rows.length) return this.showToast('Nothing to export for these filters.');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Service History');
    XLSX.writeFile(book, `Device_Service_History_${todayIso()}.xlsx`);
    this.showToast(`Exported ${rows.length} service records.`);
  }

  // ===== Vendors tab =====

  openJobs(v: Vendor): number {
    return this.openTasks.filter((t) => t.assignee === v.name).length + REQUESTS.filter((r) => r.assignee === v.name && this.isOpenReq(r)).length;
  }

  showVendorJobs(v: Vendor): void {
    this.tab = 'overview';
    this.clearFilters();
    this.search = v.name;
  }

  // ===== Dialogs =====

  openAssign(task: Task | null, req: ServiceRequest | null = null): void {
    this.menuOpen = '';
    this.dialog = { kind: 'assign', task, req, value: (task ?? req)?.assignee ?? 'Unassigned' };
  }

  openReschedule(task: Task): void {
    this.menuOpen = '';
    this.dialog = { kind: 'reschedule', task, value: task.due };
  }

  openRequest(deviceId = ''): void {
    this.menuOpen = '';
    this.dialog = { kind: 'request', deviceId: deviceId || this.selectedId || '', type: 'Corrective repair', priority: 'Medium', due: rel(7), assignee: 'Unassigned', description: '', error: '' };
  }

  openPlan(plan: Plan | null): void {
    const kind: DeviceKind = plan ? plan.kind : this.selected ? this.selected.kind : 'gateway';
    this.dialog = {
      kind: 'plan', plan, error: '', name: plan ? plan.name : `${KIND_LABELS[kind]} service`, deviceKind: kind,
      interval: plan ? plan.interval : 90, type: plan ? plan.type : 'Preventive', checklist: plan ? plan.checklist.join('\n') : '',
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
    if (g.task) {
      g.task.assignee = g.value;
      g.task.booked = g.value !== 'Unassigned';
    }
    if (g.req) {
      g.req.assignee = g.value;
      if (g.req.status === 'Open' && g.value !== 'Unassigned') g.req.status = 'Assigned';
    }
    const id = g.task ? g.task.deviceId : g.req ? g.req.id : '';
    this.dialog = null;
    this.showToast(`${id} assigned to ${g.value}.`);
  }

  saveReschedule(): void {
    const g = this.rescheduleDialog;
    if (!g || !g.value) return;
    g.task.due = g.value;
    g.task.booked = true;
    this.dialog = null;
    this.showToast(`${g.task.deviceId} rescheduled to ${this.fmt(g.value)}.`);
  }

  saveRequest(): void {
    const g = this.requestDialog;
    if (!g) return;
    if (!g.deviceId) return void (g.error = 'Choose a device.');
    if (!g.due) return void (g.error = 'Choose a due date.');
    const d = this.device(g.deviceId);
    const n = Math.max(...REQUESTS.map((r) => Number(r.id.slice(3)))) + 1;
    const assigned = g.assignee !== 'Unassigned';
    const req: ServiceRequest = {
      id: `SR-${n}`, deviceId: d.id, type: g.type, priority: g.priority, status: assigned ? 'Assigned' : 'Open', created: todayIso(), due: g.due,
      assignee: g.assignee, description: g.description.trim() || `${g.type} requested for ${d.name}.`,
    };
    REQUESTS.unshift(req);
    const items = this.planOf(d.kind)?.checklist.length ?? 3;
    TASKS.unshift({ id: `MT-${++this.seq}`, deviceId: d.id, type: g.type, due: g.due, assignee: g.assignee, booked: assigned, stage: 'planned', checklist: new Array(items).fill(false) });
    this.dialog = null;
    this.select(d.id, 'maintenance');
    this.showToast(`${req.id} created for ${d.id} and added to the maintenance schedule.`);
  }

  savePlan(): void {
    const g = this.planDialog;
    if (!g) return;
    const items = g.checklist.split('\n').map((s) => s.trim()).filter((s) => s);
    if (!g.name.trim()) return void (g.error = 'Enter a plan name.');
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
    this.showToast(`Plan "${data.name}" saved.`);
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
