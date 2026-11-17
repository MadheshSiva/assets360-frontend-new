import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Factory,
  Folder,
  House,
  Info,
  Layers,
  Map as MapIcon,
  MapPin,
  Monitor,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-angular';
import { Movement, MovementControls, Occupancy, OpLocation } from './location.model';

type Tab = 'directory' | 'layout' | 'occupancy' | 'history' | 'routing';
type LocState = 'Available' | 'Full' | 'Inactive';

interface ZoneNode {
  zone: string;
  locations: OpLocation[];
}

interface FloorNode {
  floor: string;
  zones: ZoneNode[];
}

interface BuildingNode {
  building: string;
  floors: FloorNode[];
}

interface MoveForm {
  job: string;
  from: string;
  to: string;
  stageDone: boolean;
  scan: string;
}

interface LocationForm {
  name: string;
  type: string;
  building: string;
  floor: string;
  zone: string;
  capacity: number;
  supervisor: string;
  shift: string;
}

/** Signed-in user's display name; filled from the auth/user API once wired. */
const CURRENT_USER = '';
const WORK_TYPES = ['Workstation', 'Testing', 'Quality'];
const TYPE_PREFIX: Record<string, string> = { Staging: 'PRE', Workstation: 'WRK', Testing: 'TST', Quality: 'QLT', Dispatch: 'DSP', Process: 'PRC', Receiving: 'RCV', Storage: 'STR' };
/** Job orders that exist on the Job Orders page; filled from the API once wired. */
const KNOWN_JOBS: string[] = [];

/** Locations, occupancy and movements are kept in memory; empty until the WIP API is wired up. */
const LOCATIONS: OpLocation[] = [];
const OCCUPANCY: Occupancy[] = [];
let MOVEMENTS: Movement[] = [];
/** Placeholder while no location exists (keeps the detail bindings safe). */
const NO_LOCATION: OpLocation = {
  code: '', name: '', type: '', site: '', building: '', floor: '', zone: '', capacity: 0, supervisor: '', shift: '', status: 'Active', workstation: '', assets: [], next: [],
  controls: { requireCapacity: false, requireStage: false, scanQr: false, supervisorApproval: false },
};

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

@Component({
  selector: 'app-location-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './location-management.html',
  // Buttons, controls, cards, tabs, switches, menu, modal and toast come from the Job Templates stylesheet
  styleUrls: ['../job-templates/job-templates.css', './location-management.css', './location-management-panels.css', '../shared/wip-purple-theme.css'],
})
export class LocationManagement implements OnDestroy {
  readonly icons = {
    ArrowRight, Building2, ChevronDown, ChevronRight, ClipboardList, ExternalLink, Factory, Folder, House, Info, Layers, MapIcon, MapPin, Monitor, Plus,
    QrCode, RefreshCw, Search, TriangleAlert, Upload, X,
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'directory', label: 'Location Directory' },
    { key: 'layout', label: 'Layout & Zones' },
    { key: 'occupancy', label: 'Job Occupancy' },
    { key: 'history', label: 'Movement History' },
    { key: 'routing', label: 'Routing Rules' },
  ];
  readonly types = Object.keys(TYPE_PREFIX);
  readonly shifts = ['Factory Day Shift', 'Factory Night Shift', 'Office Hours', '24/7'];

  locations = LOCATIONS;
  occupancy = OCCUPANCY;
  tab: Tab = 'directory';

  // Filters
  site = LOCATIONS[0]?.site ?? '';
  building = '';
  floor = '';
  statusFilter: LocState | '' = '';
  search = '';
  /** Collapsed tree nodes ("Building", "Building|Floor", "Building|Floor|Zone"). */
  readonly collapsed = new Set<string>();

  selectedCode = LOCATIONS[0]?.code ?? '';
  /** Unsaved movement-control edits for the selected location. */
  controlsDraft: MovementControls = { ...this.selected.controls };

  // Dialogs
  moveForm: MoveForm | null = null;
  moveError = '';
  locationForm: LocationForm | null = null;
  formError = '';
  qrOpen = false;
  importOpen = false;
  importError = '';
  /** Routing rules: location whose "add next location" picker is open. */
  addNextFor: string | null = null;

  toast = '';
  toastError = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  private nowStamp(): string {
    return stamp(new Date());
  }

  isKnownJob(job: string): boolean {
    return KNOWN_JOBS.includes(job);
  }

  // ===== Lookups =====

  loc(code: string): OpLocation | undefined {
    return this.locations.find((l) => l.code === code);
  }

  locName(code: string): string {
    return this.loc(code)?.name ?? code;
  }

  jobsAt(code: string): Occupancy[] {
    return this.occupancy.filter((o) => o.location === code);
  }

  stateOf(l: OpLocation): LocState {
    if (l.status === 'Inactive') return 'Inactive';
    return this.jobsAt(l.code).length >= l.capacity ? 'Full' : 'Available';
  }

  get selected(): OpLocation {
    return this.loc(this.selectedCode) ?? this.locations[0] ?? NO_LOCATION;
  }

  // ===== Filters & hierarchy =====

  get sites(): string[] {
    return [...new Set(this.locations.map((l) => l.site))];
  }

  get buildings(): string[] {
    return [...new Set(this.locations.filter((l) => l.site === this.site).map((l) => l.building))];
  }

  get floors(): string[] {
    return [...new Set(this.locations.filter((l) => l.site === this.site && (!this.building || l.building === this.building)).map((l) => l.floor))];
  }

  onSite(): void {
    this.building = this.floor = '';
  }

  onBuilding(): void {
    if (this.floor && !this.floors.includes(this.floor)) this.floor = '';
  }

  /** Locations matching site, building, floor and status (the search box narrows the table only). */
  get scoped(): OpLocation[] {
    return this.locations.filter(
      (l) => l.site === this.site && (!this.building || l.building === this.building) && (!this.floor || l.floor === this.floor) && (!this.statusFilter || this.stateOf(l) === this.statusFilter),
    );
  }

  get tableRows(): OpLocation[] {
    const q = this.search.trim().toLowerCase();
    return this.scoped.filter((l) => !q || `${l.name} ${l.code} ${l.type} ${l.zone}`.toLowerCase().includes(q));
  }

  get tree(): BuildingNode[] {
    const out: BuildingNode[] = [];
    for (const l of this.scoped) {
      let b = out.find((x) => x.building === l.building);
      if (!b) out.push((b = { building: l.building, floors: [] }));
      let f = b.floors.find((x) => x.floor === l.floor);
      if (!f) b.floors.push((f = { floor: l.floor, zones: [] }));
      let z = f.zones.find((x) => x.zone === l.zone);
      if (!z) f.zones.push((z = { zone: l.zone, locations: [] }));
      z.locations.push(l);
    }
    return out;
  }

  toggleNode(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
  }

  isOpen(key: string): boolean {
    return !this.collapsed.has(key);
  }

  // ===== KPIs (whole site) =====

  private get siteLocations(): OpLocation[] {
    return this.locations.filter((l) => l.site === this.site);
  }

  get kpiOperational(): number {
    return this.siteLocations.filter((l) => l.status === 'Active').length;
  }

  get kpiWorkstations(): number {
    return this.siteLocations.filter((l) => l.status === 'Active' && WORK_TYPES.includes(l.type)).length;
  }

  get kpiJobs(): number {
    const codes = new Set(this.siteLocations.map((l) => l.code));
    return this.occupancy.filter((o) => codes.has(o.location)).length;
  }

  get fullLocations(): OpLocation[] {
    return this.siteLocations.filter((l) => this.stateOf(l) === 'Full');
  }

  showFull(): void {
    this.building = this.floor = '';
    this.statusFilter = 'Full';
    this.tab = 'directory';
  }

  // ===== Selection & controls =====

  select(l: OpLocation): void {
    if (this.controlsChanged && l.code !== this.selectedCode) this.showToast(`Unsaved movement controls for ${this.selected.name} were discarded.`);
    this.selectedCode = l.code;
    this.controlsDraft = { ...l.controls };
  }

  get controlsChanged(): boolean {
    const c = this.selected.controls;
    const d = this.controlsDraft;
    return c.requireCapacity !== d.requireCapacity || c.requireStage !== d.requireStage || c.scanQr !== d.scanQr || c.supervisorApproval !== d.supervisorApproval;
  }

  saveControls(): void {
    if (!this.controlsChanged) return this.showToast('No changes to save.');
    this.selected.controls = { ...this.controlsDraft };
    this.showToast(`Movement controls saved for ${this.selected.name}.`);
  }

  cancelControls(): void {
    this.controlsDraft = { ...this.selected.controls };
  }

  freeCapacity(l: OpLocation): number {
    return Math.max(0, l.capacity - this.jobsAt(l.code).length);
  }

  /** Assets and the workstation link to the Resources page. */
  get assetLinks(): string[] {
    return this.selected.assets;
  }

  // ===== Move job =====

  openMove(o: Occupancy): void {
    const from = this.loc(o.location);
    if (!from) return;
    if (!from.next.length) return this.showToast(`${from.name} has no approved next locations. Add one under Routing Rules.`, true);
    const first = from.next.find((c) => this.canReceive(c)) ?? from.next[0];
    this.moveForm = { job: o.job, from: from.code, to: first, stageDone: false, scan: '' };
    this.moveError = '';
  }

  canReceive(code: string): boolean {
    const l = this.loc(code);
    return !!l && l.status === 'Active' && this.freeCapacity(l) > 0;
  }

  get moveFrom(): OpLocation | undefined {
    return this.moveForm ? this.loc(this.moveForm.from) : undefined;
  }

  get moveStage(): string {
    const f = this.moveForm;
    return f ? this.occupancy.find((o) => o.job === f.job)?.stage ?? '' : '';
  }

  saveMove(): void {
    const f = this.moveForm;
    const from = this.moveFrom;
    const to = f && this.loc(f.to);
    if (!f || !from || !to) return;
    const c = from.controls;
    if (to.status === 'Inactive') return void (this.moveError = `${to.name} is inactive.`);
    if (c.requireCapacity && this.freeCapacity(to) === 0) return void (this.moveError = `${to.name} is full (${to.capacity} / ${to.capacity}). Choose another location or wait for capacity.`);
    if (c.requireStage && !f.stageDone) return void (this.moveError = `Confirm that the ${this.moveStage} stage is complete.`);
    if (c.scanQr && f.scan.trim().toUpperCase() !== to.code) return void (this.moveError = `Scan the destination code (${to.code}) to confirm arrival.`);
    const at = this.nowStamp();
    const id = Math.max(0, ...MOVEMENTS.map((m) => m.id)) + 1;
    if (c.supervisorApproval) {
      MOVEMENTS = [{ id, job: f.job, from: from.code, to: to.code, at, by: CURRENT_USER, status: 'Pending Approval' }, ...MOVEMENTS];
      this.moveForm = null;
      this.showToast(`Move of ${f.job} to ${to.name} sent for supervisor approval.`);
      return;
    }
    this.applyMove(f.job, to.code, at);
    MOVEMENTS = [{ id, job: f.job, from: from.code, to: to.code, at, by: CURRENT_USER, status: 'Completed' }, ...MOVEMENTS];
    this.moveForm = null;
    this.showToast(`${f.job} moved from ${from.name} to ${to.name}.`);
  }

  private applyMove(job: string, to: string, at: string): void {
    const o = this.occupancy.find((x) => x.job === job);
    if (o) Object.assign(o, { location: to, arrival: at });
  }

  get movements(): Movement[] {
    return MOVEMENTS;
  }

  approve(m: Movement, ok: boolean): void {
    if (ok && !this.canReceive(m.to)) return this.showToast(`${this.locName(m.to)} is full; approve once it has space.`, true);
    m.status = ok ? 'Completed' : 'Rejected';
    if (ok) this.applyMove(m.job, m.to, this.nowStamp());
    this.showToast(ok ? `${m.job} moved to ${this.locName(m.to)}.` : `Move of ${m.job} rejected.`);
  }

  durationSince(arrival: string): string {
    const mins = Math.max(0, Math.round((parseLocal(this.nowStamp()).getTime() - parseLocal(arrival).getTime()) / 60_000));
    return mins >= 60 ? `${Math.floor(mins / 60)} h ${pad(mins % 60)} m` : `${mins} m`;
  }

  // ===== Routing rules =====

  removeNext(l: OpLocation, code: string): void {
    l.next = l.next.filter((c) => c !== code);
  }

  addNext(l: OpLocation, code: string): void {
    if (code && !l.next.includes(code)) l.next = [...l.next, code];
    this.addNextFor = null;
  }

  nextOptions(l: OpLocation): OpLocation[] {
    return this.locations.filter((x) => x.code !== l.code && !l.next.includes(x.code) && x.site === l.site);
  }

  // ===== Add location =====

  openAdd(): void {
    const l = this.selected;
    this.formError = '';
    this.locationForm = { name: '', type: 'Workstation', building: l.building, floor: l.floor, zone: l.zone, capacity: 1, supervisor: l.supervisor, shift: l.shift };
  }

  get zonesFor(): string[] {
    const f = this.locationForm;
    return f ? [...new Set(this.locations.filter((l) => l.building === f.building && l.floor === f.floor).map((l) => l.zone))] : [];
  }

  private newCode(type: string): string {
    const prefix = `LOC-${TYPE_PREFIX[type] ?? 'GEN'}-`;
    const max = Math.max(0, ...this.locations.filter((l) => l.code.startsWith(prefix)).map((l) => Number(l.code.slice(prefix.length)) || 0));
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  saveLocation(): void {
    const f = this.locationForm;
    if (!f) return;
    if (!f.name.trim() || !f.building.trim() || !f.floor.trim() || !f.zone.trim() || !(Number(f.capacity) > 0)) {
      this.formError = 'Enter the name, building, floor, zone and a capacity above zero.';
      return;
    }
    const code = this.newCode(f.type);
    this.locations.push({
      code, name: f.name.trim(), type: f.type, site: this.site, building: f.building.trim(), floor: f.floor.trim(), zone: f.zone.trim(),
      capacity: Number(f.capacity), supervisor: f.supervisor.trim(), shift: f.shift, status: 'Active', workstation: '', assets: [], next: [],
      controls: { requireCapacity: true, requireStage: true, scanQr: true, supervisorApproval: false },
    });
    this.locationForm = null;
    this.building = f.building.trim();
    this.floor = f.floor.trim();
    this.statusFilter = '';
    this.select(this.loc(code)!);
    this.showToast(`${f.name.trim()} linked as ${code}.`);
  }

  toggleActive(l: OpLocation): void {
    if (l.status === 'Active' && this.jobsAt(l.code).length) return this.showToast(`Move the ${this.jobsAt(l.code).length} job(s) out of ${l.name} before deactivating it.`, true);
    l.status = l.status === 'Active' ? 'Inactive' : 'Active';
    this.showToast(`${l.name} is now ${l.status.toLowerCase()}.`);
  }

  // ===== Import =====

  onImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.arrayBuffer().then((buffer) => {
      try {
        const book = XLSX.read(buffer, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
        const get = (r: Record<string, unknown>, key: string) => {
          const k = Object.keys(r).find((x) => x.toLowerCase().replace(/[^a-z]/g, '') === key);
          return k ? String(r[k]).trim() : '';
        };
        let added = 0;
        let skipped = 0;
        for (const r of rows) {
          const name = get(r, 'name') || get(r, 'location');
          const building = get(r, 'building');
          const floor = get(r, 'floor');
          const zone = get(r, 'zone');
          if (!name || !building || !floor || !zone) {
            skipped++;
            continue;
          }
          const type = this.types.find((t) => t.toLowerCase() === get(r, 'type').toLowerCase()) ?? 'Workstation';
          this.locations.push({
            code: this.newCode(type), name, type, site: get(r, 'site') || this.site, building, floor, zone, capacity: Number(get(r, 'capacity')) || 1,
            supervisor: get(r, 'supervisor'), shift: get(r, 'shift') || this.shifts[0], status: 'Active', workstation: '', assets: [], next: [],
            controls: { requireCapacity: true, requireStage: true, scanQr: true, supervisorApproval: false },
          });
          added++;
        }
        if (!added) {
          this.importError = 'No rows imported. Each row needs Name, Building, Floor and Zone.';
          return;
        }
        this.importOpen = false;
        this.showToast(`${added} location${added > 1 ? 's' : ''} imported${skipped ? `, ${skipped} skipped` : ''}.`);
      } catch {
        this.importError = 'The file could not be read as a spreadsheet.';
      }
    });
  }

  downloadTemplate(): void {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Type', 'Building', 'Floor', 'Zone', 'Capacity', 'Supervisor', 'Shift'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Locations');
    XLSX.writeFile(book, 'Locations_Import_Template.xlsx');
  }

  printQr(): void {
    window.print();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.moveForm = this.locationForm = null;
    this.qrOpen = this.importOpen = false;
    this.addNextFor = null;
  }

  private showToast(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
