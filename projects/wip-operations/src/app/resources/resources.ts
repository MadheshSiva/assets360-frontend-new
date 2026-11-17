import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleX,
  Ellipsis,
  Hammer,
  Info,
  Link2,
  Monitor,
  Plus,
  Search,
  TriangleAlert,
  Upload,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-angular';
import { AssetRecord } from 'shared-ui';
import { Availability, Booking, BookingRequest, Resource, ResourceType } from './resource.model';

type Tab = 'directory' | 'calendar' | 'assignments' | 'skills' | 'capacity';
type SortDir = 'none' | 'asc' | 'desc';

interface ResourceForm {
  code: string | null;
  name: string;
  type: ResourceType;
  skills: string;
  capacity: string;
  site: string;
  location: string;
  calendar: string;
  owner: string;
  linkedAsset: string;
}

interface UnavailableForm {
  code: string;
  reason: string;
  date: string;
  start: string;
  end: string;
}

const TYPES: ResourceType[] = ['Person', 'Team', 'Equipment', 'Workstation', 'Tool'];
const CODE_PREFIX: Record<ResourceType, string> = { Person: 'PER', Team: 'TEAM', Equipment: 'EQP', Workstation: 'WS', Tool: 'TL' };
const DEFAULT_CAPACITY: Record<ResourceType, string> = { Person: '8 h/day', Team: '3 members', Equipment: '1 job at a time', Workstation: '1 job at a time', Tool: '1 job at a time' };
/** Job orders that exist on the Job Orders page (others are shown as plain codes); filled from the API once wired. */
const KNOWN_JOBS: string[] = [];
const DAY_START = 8;
const DAY_END = 17;

/** Resources and booking requests are kept in memory; empty until the WIP API is wired up. */
const RESOURCES: Resource[] = [];
const REQUESTS: BookingRequest[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function addDays(date: string, n: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + n);
  return localStamp(d).slice(0, 10);
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './resources.html',
  // Buttons, controls, cards, tabs, menu, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', './resources.css', './resources-panels.css', '../shared/wip-purple-theme.css'],
})
export class Resources implements OnDestroy {
  readonly icons = {
    ArrowDown, ArrowLeftRight, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleMinus, CircleX, Ellipsis, Hammer, Info,
    Link2, Monitor, Plus, Search, TriangleAlert, Upload, User, Users, Wrench, X,
  };
  readonly typeIcon: Record<ResourceType, typeof User> = { Person: User, Team: Users, Equipment: Monitor, Workstation: Hammer, Tool: Wrench };
  readonly types = TYPES;
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'directory', label: 'Resource Directory' },
    { key: 'calendar', label: 'Availability & Calendar' },
    { key: 'assignments', label: 'Job Assignments' },
    { key: 'skills', label: 'Skills & Certifications' },
    { key: 'capacity', label: 'Capacity & Utilization' },
  ];
  readonly hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  readonly calendars = ['Factory Day Shift', 'Factory Night Shift', 'Office Hours', '24/7'];
  /** Assets that can be linked to a resource; filled from the asset register API once wired. */
  readonly assetOptions: AssetRecord[] = [];

  resources = RESOURCES;
  requests = REQUESTS;
  tab: Tab = 'directory';

  // ===== Directory =====
  search = '';
  typeFilter: ResourceType | '' = '';
  siteFilter = '';
  statusFilter: Availability | '' = '';
  sortDir: SortDir = 'none';
  readonly pageSize = 7;
  page = 1;
  selectedCode = RESOURCES[0]?.code ?? '';
  menuCode: string | null = null;

  // ===== Schedule / calendar =====
  /** Current time (ticks every 30 s). */
  now: Date;
  scheduleDate: string;
  private timer?: ReturnType<typeof setInterval>;

  // ===== Dialogs =====
  form: ResourceForm | null = null;
  formError = '';
  unavailableForm: UnavailableForm | null = null;
  reassignBookingId: number | null = null;
  alternativeFor: BookingRequest | null = null;
  reviewing: BookingRequest | null = null;
  deleteCode: string | null = null;
  importOpen = false;
  importError = '';

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.now = this.clock();
    this.scheduleDate = this.today;
    this.timer = setInterval(() => (this.now = this.clock()), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
  }

  private clock(): Date {
    return new Date();
  }

  get nowStamp(): string {
    return localStamp(this.now);
  }

  get today(): string {
    return this.nowStamp.slice(0, 10);
  }

  // ===== Availability =====

  statusOf(r: Resource): Availability {
    const now = this.nowStamp;
    const current = r.bookings.filter((b) => b.start <= now && b.end > now);
    if (current.some((b) => b.kind === 'Unavailable')) return 'Unavailable';
    if (current.some((b) => b.kind === 'Assigned')) return 'Assigned';
    if (r.bookings.some((b) => b.kind === 'Reserved' && b.end > now && b.start.slice(0, 10) === this.today)) return 'Reserved';
    return 'Available';
  }

  /** What the resource is doing now: its job, or why it is unavailable. */
  currentLabel(r: Resource): string {
    const now = this.nowStamp;
    const b = r.bookings.find((x) => x.start <= now && x.end > now && x.kind !== 'Reserved')
      ?? r.bookings.find((x) => x.kind === 'Reserved' && x.end > now && x.start.slice(0, 10) === this.today);
    if (!b) return '';
    return b.kind === 'Unavailable' ? b.stage : b.job;
  }

  count(status: Availability | 'Busy'): number {
    if (status === 'Busy') return this.resources.filter((r) => ['Assigned', 'Reserved'].includes(this.statusOf(r))).length;
    return this.resources.filter((r) => this.statusOf(r) === status).length;
  }

  isKnownJob(job: string): boolean {
    return KNOWN_JOBS.includes(job);
  }

  private isFree(r: Resource, start: string, end: string, ignoreId?: number): boolean {
    return !r.bookings.some((b) => b.id !== ignoreId && overlaps(b.start, b.end, start, end));
  }

  private nextBookingId(): number {
    return Math.max(0, ...this.resources.flatMap((r) => r.bookings.map((b) => b.id))) + 1;
  }

  // ===== Directory =====

  get sites(): string[] {
    return [...new Set(this.resources.map((r) => r.site))].sort();
  }

  get filtered(): Resource[] {
    const q = this.search.trim().toLowerCase();
    const list = this.resources.filter(
      (r) =>
        (!this.typeFilter || r.type === this.typeFilter) &&
        (!this.siteFilter || r.site === this.siteFilter) &&
        (!this.statusFilter || this.statusOf(r) === this.statusFilter) &&
        (!q || `${r.name} ${r.code} ${r.skills.join(' ')}`.toLowerCase().includes(q)),
    );
    if (this.sortDir === 'none') return list;
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => a.name.localeCompare(b.name) * dir);
  }

  toggleSort(): void {
    this.sortDir = this.sortDir === 'none' ? 'asc' : this.sortDir === 'asc' ? 'desc' : 'none';
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }

  get safePage(): number {
    return Math.min(this.page, this.pageCount);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i + 1);
  }

  get pageRows(): Resource[] {
    const start = (this.safePage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get rangeLabel(): string {
    return `Showing ${this.pageRows.length} of ${this.filtered.length} resources`;
  }

  goToPage(p: number): void {
    this.page = Math.min(Math.max(1, p), this.pageCount);
  }

  onFilterChange(): void {
    this.page = 1;
  }

  select(r: Resource): void {
    this.selectedCode = r.code;
    this.menuCode = null;
  }

  get selected(): Resource | undefined {
    return this.resources.find((r) => r.code === this.selectedCode) ?? this.resources[0];
  }

  toggleMenu(event: Event, code: string): void {
    event.stopPropagation();
    this.menuCode = this.menuCode === code ? null : code;
  }

  // ===== Details panel =====

  /** The booking in progress now, else today's next one. */
  currentBooking(r: Resource): Booking | undefined {
    const now = this.nowStamp;
    return r.bookings.find((b) => b.kind !== 'Unavailable' && b.start <= now && b.end > now);
  }

  nextBooking(r: Resource): Booking | undefined {
    const now = this.nowStamp;
    return [...r.bookings].filter((b) => b.kind !== 'Unavailable' && b.start > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  }

  allReady(r: Resource): boolean {
    return r.readiness.every((x) => x.ok);
  }

  timeRange(b: Booking): string {
    return `${b.start.slice(11)} – ${b.end.slice(11)}`;
  }

  /** Pending requests that clash with the resource's bookings or downtime. */
  get alerts(): { request: BookingRequest; resource: Resource; clash: Booking }[] {
    const out: { request: BookingRequest; resource: Resource; clash: Booking }[] = [];
    for (const req of this.requests) {
      if (req.status !== 'Pending') continue;
      const res = this.resources.find((r) => r.code === req.resource);
      const clash = res?.bookings.find((b) => overlaps(b.start, b.end, req.start, req.end));
      if (res && clash) out.push({ request: req, resource: res, clash });
    }
    return out;
  }

  alertText(a: { request: BookingRequest; resource: Resource; clash: Booking }): string {
    const what = a.clash.kind === 'Unavailable' ? `during ${a.clash.stage.toLowerCase()}` : `while it is booked for ${a.clash.job}`;
    return `${a.request.job} requests ${a.resource.linkedAsset?.tag ?? a.resource.name} at ${a.request.start.slice(11)}, ${what}.`;
  }

  // ===== Schedule =====

  shiftSchedule(days: number): void {
    this.scheduleDate = days ? addDays(this.scheduleDate, days) : this.today;
  }

  /** Resources with bookings on the schedule day (directory filters apply). */
  get scheduleRows(): Resource[] {
    const day = this.scheduleDate;
    return this.filtered.filter((r) => r.bookings.some((b) => b.start.slice(0, 10) === day));
  }

  dayBookings(r: Resource): Booking[] {
    return r.bookings.filter((b) => b.start.slice(0, 10) === this.scheduleDate);
  }

  /** Left / width of a booking on the 08:00-17:00 axis, in percent. */
  barLeft(b: Booking): number {
    return this.pos(b.start);
  }

  barWidth(b: Booking): number {
    return Math.max(2, this.pos(b.end) - this.pos(b.start));
  }

  private pos(stamp: string): number {
    const [h, m] = stamp.slice(11).split(':').map(Number);
    const t = Math.min(Math.max(h + m / 60, DAY_START), DAY_END);
    return ((t - DAY_START) / (DAY_END - DAY_START)) * 100;
  }

  /** Position of the "now" line, or null when it is off the schedule day or hours. */
  get nowLine(): number | null {
    if (this.scheduleDate !== this.today) return null;
    const h = this.now.getHours() + this.now.getMinutes() / 60;
    return h < DAY_START || h > DAY_END ? null : ((h - DAY_START) / (DAY_END - DAY_START)) * 100;
  }

  // ===== Availability & calendar (week) =====

  get weekDays(): string[] {
    const d = parseLocal(this.scheduleDate);
    const monday = addDays(this.scheduleDate, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  weekdayLabel(day: string): string {
    return parseLocal(day).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  /** Booked hours and whether the resource is off on a day. */
  dayLoad(r: Resource, day: string): { hours: number; off: boolean } {
    let hours = 0;
    let off = false;
    for (const b of r.bookings) {
      if (b.start.slice(0, 10) !== day) continue;
      if (b.kind === 'Unavailable') off = true;
      else hours += (parseLocal(b.end).getTime() - parseLocal(b.start).getTime()) / 3_600_000;
    }
    return { hours: Math.round(hours * 10) / 10, off };
  }

  openDay(day: string): void {
    this.scheduleDate = day;
    this.tab = 'directory';
    setTimeout(() => document.getElementById('res-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ===== Job assignments =====

  get assignments(): { r: Resource; b: Booking }[] {
    return this.resources
      .flatMap((r) => r.bookings.filter((b) => b.kind !== 'Unavailable').map((b) => ({ r, b })))
      .sort((x, y) => x.b.start.localeCompare(y.b.start));
  }

  confirmBooking(b: Booking): void {
    b.kind = 'Assigned';
    this.showToast(`Booking for ${b.job} confirmed.`);
  }

  releaseBooking(r: Resource, b: Booking): void {
    r.bookings = r.bookings.filter((x) => x.id !== b.id);
    this.showToast(`${r.name} released from ${b.job} (${b.stage}).`);
  }

  // ===== Skills & certifications =====

  certState(validUntil: string): 'Valid' | 'Expiring' | 'Expired' {
    if (validUntil < this.today) return 'Expired';
    return validUntil <= addDays(this.today, 30) ? 'Expiring' : 'Valid';
  }

  get certified(): Resource[] {
    return this.filtered.filter((r) => r.skills.length || r.certifications.length);
  }

  // ===== Capacity =====

  get typeSummary(): { type: ResourceType; count: number; avg: number; busy: number }[] {
    return TYPES.map((type) => {
      const list = this.resources.filter((r) => r.type === type);
      return {
        type, count: list.length,
        avg: list.length ? Math.round(list.reduce((s, r) => s + r.utilization, 0) / list.length) : 0,
        busy: list.filter((r) => ['Assigned', 'Reserved'].includes(this.statusOf(r))).length,
      };
    }).filter((t) => t.count);
  }

  get byUtilization(): Resource[] {
    return [...this.filtered].sort((a, b) => b.utilization - a.utilization);
  }

  utilTone(u: number): string {
    return u >= 85 ? 'high' : u >= 50 ? 'mid' : 'low';
  }

  // ===== Add / edit =====

  openAdd(): void {
    this.formError = '';
    this.form = { code: null, name: '', type: 'Person', skills: '', capacity: DEFAULT_CAPACITY.Person, site: '', location: '', calendar: this.calendars[0], owner: '', linkedAsset: '' };
  }

  openEdit(r: Resource): void {
    this.menuCode = null;
    this.formError = '';
    this.form = { code: r.code, name: r.name, type: r.type, skills: r.skills.join(', '), capacity: r.capacity, site: r.site, location: r.location, calendar: r.calendar, owner: r.owner, linkedAsset: r.linkedAsset?.tag ?? '' };
  }

  onFormType(type: ResourceType): void {
    if (this.form && !this.form.code) this.form.capacity = DEFAULT_CAPACITY[type];
  }

  private newCode(type: ResourceType): string {
    const prefix = CODE_PREFIX[type];
    const max = Math.max(0, ...this.resources.filter((r) => r.code.startsWith(prefix + '-')).map((r) => Number(r.code.split('-')[1]) || 0));
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    if (!f.name.trim() || !f.site.trim() || !f.capacity.trim()) {
      this.formError = 'Enter the resource name, capacity and site.';
      return;
    }
    const asset = this.assetOptions.find((a) => a.tag === f.linkedAsset);
    const values = {
      name: f.name.trim(), type: f.type, skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean), capacity: f.capacity.trim(),
      site: f.site.trim(), location: f.location.trim(), calendar: f.calendar, owner: f.owner.trim(),
      linkedAsset: asset ? { tag: asset.tag, name: asset.name } : null,
    };
    if (f.code) {
      const r = this.resources.find((x) => x.code === f.code);
      if (r) Object.assign(r, values);
      this.showToast(`${values.name} updated.`);
    } else {
      const code = this.newCode(f.type);
      this.resources.unshift({ code, ...values, readiness: [], certifications: [], utilization: 0, bookings: [], notes: '' });
      this.selectedCode = code;
      this.clearFilters();
      this.showToast(`${values.name} added as ${code}.`);
    }
    this.form = null;
  }

  clearFilters(): void {
    this.search = this.typeFilter = this.siteFilter = this.statusFilter = '';
    this.page = 1;
  }

  // ===== Unavailable / delete =====

  openUnavailable(r: Resource): void {
    this.menuCode = null;
    this.formError = '';
    this.unavailableForm = { code: r.code, reason: r.type === 'Person' ? 'Leave' : 'Maintenance', date: this.today, start: '08:00', end: '17:00' };
  }

  saveUnavailable(): void {
    const f = this.unavailableForm;
    const r = this.resources.find((x) => x.code === f?.code);
    if (!f || !r) return;
    if (!f.reason.trim() || !f.date || f.end <= f.start) {
      this.formError = 'Enter a reason and an end time after the start time.';
      return;
    }
    const start = `${f.date}T${f.start}`;
    const end = `${f.date}T${f.end}`;
    const clashes = r.bookings.filter((b) => b.kind !== 'Unavailable' && overlaps(b.start, b.end, start, end)).length;
    r.bookings.push({ id: this.nextBookingId(), job: '', stage: f.reason.trim(), start, end, kind: 'Unavailable' });
    this.unavailableForm = null;
    this.showToast(clashes ? `${r.name} marked unavailable. ${clashes} booking${clashes > 1 ? 's' : ''} now clash; reassign them.` : `${r.name} marked unavailable.`, clashes > 0);
  }

  /** Ends any unavailability covering now. */
  makeAvailable(r: Resource): void {
    this.menuCode = null;
    const now = this.nowStamp;
    r.bookings = r.bookings.filter((b) => !(b.kind === 'Unavailable' && b.start <= now && b.end > now));
    this.showToast(`${r.name} is available again.`);
  }

  confirmDelete(): void {
    const r = this.resources.find((x) => x.code === this.deleteCode);
    if (!r) return;
    const index = this.resources.indexOf(r);
    this.resources.splice(index, 1);
    if (this.selectedCode === r.code) this.selectedCode = this.resources[0]?.code ?? '';
    this.deleteCode = null;
    this.showToast(`${r.name} removed.`);
  }

  get deleting(): Resource | undefined {
    return this.resources.find((r) => r.code === this.deleteCode);
  }

  // ===== Reassign / alternatives =====

  /** Resources of the same type that are free for the whole time slot. */
  alternatives(type: ResourceType, start: string, end: string, exclude: string): Resource[] {
    return this.resources.filter((r) => r.type === type && r.code !== exclude && this.isFree(r, start, end));
  }

  openReassign(): void {
    const r = this.selected;
    const b = r && (this.currentBooking(r) ?? this.nextBooking(r));
    if (!r || !b) {
      this.showToast('This resource has no booking to reassign.');
      return;
    }
    this.reassignBookingId = b.id;
  }

  get reassignBooking(): Booking | undefined {
    return this.selected?.bookings.find((b) => b.id === this.reassignBookingId);
  }

  get reassignOptions(): Resource[] {
    const r = this.selected;
    const b = this.reassignBooking;
    return r && b ? this.alternatives(r.type, b.start, b.end, r.code) : [];
  }

  reassignTo(target: Resource): void {
    const from = this.selected;
    const b = this.reassignBooking;
    if (!from || !b) return;
    from.bookings = from.bookings.filter((x) => x.id !== b.id);
    target.bookings.push(b);
    this.reassignBookingId = null;
    this.showToast(`${b.job} (${b.stage}) moved from ${from.name} to ${target.name}.`);
  }

  get alternativeOptions(): Resource[] {
    const req = this.alternativeFor;
    const res = req && this.resources.find((r) => r.code === req.resource);
    return req && res ? this.alternatives(res.type, req.start, req.end, res.code) : [];
  }

  bookAlternative(target: Resource): void {
    const req = this.alternativeFor;
    if (!req) return;
    target.bookings.push({ id: this.nextBookingId(), job: req.job, stage: req.stage, start: req.start, end: req.end, kind: 'Reserved' });
    req.status = 'Approved';
    req.resource = target.code;
    this.alternativeFor = null;
    this.showToast(`${req.job} booked on ${target.name} at ${req.start.slice(11)}.`);
  }

  /** Approving a clashing request books it anyway; rejecting closes it. */
  decide(approve: boolean): void {
    const req = this.reviewing;
    const res = req && this.resources.find((r) => r.code === req.resource);
    if (!req || !res) return;
    req.status = approve ? 'Approved' : 'Rejected';
    if (approve) res.bookings.push({ id: this.nextBookingId(), job: req.job, stage: req.stage, start: req.start, end: req.end, kind: 'Reserved' });
    this.reviewing = null;
    this.showToast(approve ? `${req.job} approved on ${res.name} despite the clash.` : `${req.job} request rejected.`, approve);
  }

  resourceName(code: string): string {
    return this.resources.find((r) => r.code === code)?.name ?? code;
  }

  // ===== Import =====

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.arrayBuffer().then((buffer) => {
      try {
        const book = XLSX.read(buffer, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
        const get = (row: Record<string, unknown>, key: string) => {
          const k = Object.keys(row).find((x) => x.toLowerCase().replace(/[^a-z]/g, '') === key);
          return k ? String(row[k]).trim() : '';
        };
        let added = 0;
        let skipped = 0;
        for (const row of rows) {
          const name = get(row, 'name') || get(row, 'resource') || get(row, 'resourcename');
          const typeText = get(row, 'type') || get(row, 'resourcetype');
          const type = TYPES.find((t) => t.toLowerCase() === typeText.toLowerCase());
          if (!name || !type) {
            skipped++;
            continue;
          }
          this.resources.push({
            code: this.newCode(type), name, type, skills: (get(row, 'skills') || get(row, 'skillscapability')).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
            capacity: get(row, 'capacity') || DEFAULT_CAPACITY[type], site: get(row, 'site'), location: get(row, 'location'),
            calendar: get(row, 'calendar') || this.calendars[0], owner: get(row, 'owner'), linkedAsset: null,
            readiness: [], certifications: [], utilization: 0, bookings: [], notes: '',
          });
          added++;
        }
        if (!added) {
          this.importError = 'No rows could be imported. The sheet needs at least Name and Type columns (Person, Team, Equipment, Workstation or Tool).';
          return;
        }
        this.importOpen = false;
        this.showToast(`${added} resource${added > 1 ? 's' : ''} imported${skipped ? `, ${skipped} row${skipped > 1 ? 's' : ''} skipped` : ''}.`);
      } catch {
        this.importError = 'The file could not be read as a spreadsheet.';
      }
    });
  }

  downloadImportTemplate(): void {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Type', 'Skills', 'Capacity', 'Site', 'Location', 'Calendar', 'Owner'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Resources');
    XLSX.writeFile(book, 'Resources_Import_Template.xlsx');
  }

  // ===== Misc =====

  showSchedule(): void {
    this.tab = 'calendar';
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuCode = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    this.form = this.unavailableForm = null;
    this.reassignBookingId = this.deleteCode = null;
    this.alternativeFor = this.reviewing = null;
    this.importOpen = false;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
