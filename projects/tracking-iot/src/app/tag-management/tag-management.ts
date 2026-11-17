import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Ban,
  Barcode,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bluetooth,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Download,
  Droplet,
  Ellipsis,
  ExternalLink,
  FileText,
  Forklift,
  History,
  House,
  Info,
  Link2,
  MapPin,
  Package,
  Pencil,
  Plus,
  QrCode,
  Radio,
  Replace,
  Search,
  ShieldCheck,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Tag,
  Truck,
  Unlink,
  Upload,
  Wind,
  X,
  Zap,
} from 'lucide-angular';
import { DEFAULT_TYPE, LinkedAsset, lastActivity, PREFIX, SITES, STATUSES, TAGS, TECHS, TYPES, TagEvent, TagId, TagStatus, TagType, Tech, Validation, codeFor, formatError, knownAssets, nextNumber, readerFor, tagIdOf } from './tag-data';

/** Tag IDs = the identifier registry; Assignments = lifecycle of each tag on assets; Audit = every change. */
type View = 'ids' | 'assignments' | 'audit';
type SortKey = 'activity' | 'id' | 'registered' | 'assigned' | 'lastSeen';
type EventKind = 'Registered' | 'Assigned' | 'Unassigned' | 'Reassigned' | 'Replaced' | 'Deactivated' | 'Reactivated' | 'Validated' | 'Edited' | 'Read';
type Dialog =
  | { kind: 'register'; tech: Tech; type: TagType; number: string; code: string; site: string; location: string; asset: string }
  | { kind: 'edit'; tagId: string; type: TagType; code: string }
  | { kind: 'assign'; tagId: string; asset: string; site: string; location: string; note: string }
  | { kind: 'replace'; tagId: string; newId: string; oldTo: 'Inactive' | 'Available'; reason: string }
  | { kind: 'unassign'; tagId: string; reason: string }
  | { kind: 'status'; tagId: string; to: 'Inactive' | 'Available'; reason: string }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string };

interface ImportRow {
  line: number;
  tech: Tech | null;
  id: string;
  type: TagType;
  code: string;
  site: string;
  location: string;
  asset: string;
  error: string;
}

interface Read { at: number; reader: string; rssi: number | null; battery: number | null }
interface AuditRow { at: number; tag: TagId; text: string; by: string; kind: EventKind }

const CURRENT_USER = 'John Doe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TECH_ALIASES: Record<string, Tech> = { barcode: 'Barcode', qr: 'QR Code', 'qr code': 'QR Code', rfid: 'Passive RFID', 'passive rfid': 'Passive RFID', ble: 'BLE', beacon: 'BLE' };
const TECH_LONG: Record<Tech, string> = { Barcode: 'Barcode (1D)', 'QR Code': 'QR Code (2D)', 'Passive RFID': 'Passive RFID (UHF)', BLE: 'BLE (Bluetooth Low Energy)' };
/** Month-over-month change shown on the KPI cards (demo figures). */
const KPI_TREND = { Total: 12, Assigned: 8, Available: -6, Inactive: -14 };
/** How often each technology is read, for the telemetry list. */
const READ_EVERY_MIN: Record<Tech, number> = { BLE: 10, 'Passive RFID': 120, 'QR Code': 4320, Barcode: 4320 };
const EVENT_KINDS: EventKind[] = ['Registered', 'Assigned', 'Reassigned', 'Replaced', 'Unassigned', 'Deactivated', 'Reactivated', 'Validated', 'Edited', 'Read'];
const DAY = 86_400_000;

/** Stable 0..1 value per tag and salt, so derived readings don't change between renders. */
function unit(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function eventKind(text: string): EventKind {
  if (text.startsWith('Last read')) return 'Read';
  if (text.startsWith('Validation')) return 'Validated';
  return EVENT_KINDS.find((k) => text.startsWith(k)) ?? 'Edited';
}

@Component({
  selector: 'app-tag-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './tag-management.html',
  styleUrls: ['./tag-management.css', './tag-management-panel.css', './tag-management-layout.css', './tag-management-views.css'],
})
export class TagManagement implements OnDestroy {
  readonly icons = { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Ban, Box, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleSlash, Download, Ellipsis, ExternalLink, FileText, History, House, Info, Link2, MapPin, Pencil, Plus, Replace, Search, ShieldCheck, Tag, Unlink, Upload, X };
  readonly techs = TECHS;
  readonly types = TYPES;
  readonly statuses = STATUSES;
  readonly sites = SITES;
  readonly eventKinds = EVENT_KINDS;
  readonly users = [CURRENT_USER, 'Ahmed Khan', 'Priya Nair', 'Ravi Patel', 'Stores Team', 'System'];
  readonly pageSizes = [5, 10, 25, 50];
  readonly trend = KPI_TREND;
  readonly views: { key: View; label: string; hint: string }[] = [
    { key: 'ids', label: 'Tag IDs', hint: 'Store and manage individual identifiers: barcode numbers, QR values, RFID EPCs and BLE tag IDs. Create, import, validate and deactivate them here.' },
    { key: 'assignments', label: 'Assignments', hint: 'Manage the full lifecycle of each tag: assign, reassign, replace and unassign it, with assignment dates, location and history.' },
    { key: 'audit', label: 'Audit Trail', hint: 'Every registration, assignment, replacement and status change across all tags, with who made it.' },
  ];

  view: View = 'assignments';
  search = '';
  techFilter: Tech | '' = '';
  statusFilter: TagStatus | '' = '';
  siteFilter = '';
  typeFilter: TagType | '' = '';
  validFilter: Validation | '' = '';
  eventFilter: EventKind | '' = '';
  userFilter = '';
  periodFilter: '' | '1' | '7' | '30' | '90' = '';
  sortKey: SortKey = 'activity';
  sortDesc = true;
  pageSize = 10;
  page = 0;
  /** Tag ids ticked in the table. */
  checked = new Set<string>();

  /** Wide screens open with a tag selected; narrower ones keep the drawer closed until a row is clicked. */
  selectedId: string | null = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 'BLE-002951' : null;
  panelTab: 'details' | 'telemetry' | 'history' = 'details';
  menuOpen = '';
  dialog: Dialog | null = null;
  formError = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Bumped on every change so the cached rows recompute. */
  private version = 0;
  private cacheKey = '';
  private cacheRows: TagId[] = [];

  constructor(private router: Router, private route: ActivatedRoute) {
    // ?view=ids|assignments|audit wins; the old /tag-ids route opens on the Tag IDs tab
    const v = route.snapshot.queryParamMap.get('view') ?? route.snapshot.data['view'];
    if (this.views.some((x) => x.key === v)) this.view = v as View;
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Views =====

  get viewHint(): string {
    return this.views.find((v) => v.key === this.view)!.hint;
  }

  setView(v: View): void {
    if (this.view === v) return;
    this.view = v;
    this.page = 0;
    this.menuOpen = '';
    this.router.navigate([], { relativeTo: this.route, queryParams: { view: v }, replaceUrl: true });
  }

  viewCount(v: View): number {
    if (v === 'ids') return TAGS.length;
    if (v === 'assignments') return this.counts.Assigned;
    return this.audit.length;
  }

  // ===== KPIs =====

  get counts(): Record<TagStatus | 'Total', number> {
    const c = { Total: TAGS.length, Assigned: 0, Available: 0, Inactive: 0 };
    for (const t of TAGS) c[t.status]++;
    return c;
  }

  setStatus(s: TagStatus | ''): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
    if (this.view === 'audit') this.setView('assignments');
    this.onFilter();
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  // ===== Validation =====

  private codeUse = { version: -1, map: new Map<string, number>() };

  validation(t: TagId): Validation {
    if (this.codeUse.version !== this.version) {
      const map = new Map<string, number>();
      for (const x of TAGS) map.set(x.code, (map.get(x.code) ?? 0) + 1);
      this.codeUse = { version: this.version, map };
    }
    if (formatError(t.tech, t.code)) return 'Invalid format';
    return (this.codeUse.map.get(t.code) ?? 0) > 1 ? 'Duplicate' : 'Valid';
  }

  validationDetail(t: TagId): string {
    const v = this.validation(t);
    if (v === 'Invalid format') return formatError(t.tech, t.code);
    if (v === 'Duplicate') return `Same ${this.codeLabel(t).toLowerCase()} as ${TAGS.filter((x) => x !== t && x.code === t.code).map((x) => x.id).join(', ')}`;
    return `${this.codeLabel(t)} format and uniqueness OK`;
  }

  private issues = { version: -1, count: 0 };

  get issueCount(): number {
    if (this.issues.version !== this.version) this.issues = { version: this.version, count: TAGS.filter((t) => this.validation(t) !== 'Valid').length };
    return this.issues.count;
  }

  /** Records a validation check in the tag's history (the column always shows the live result). */
  validate(list: TagId[]): void {
    this.menuOpen = '';
    let bad = 0;
    for (const t of list) {
      const v = this.validation(t);
      if (v !== 'Valid') bad++;
      this.log(t, v === 'Valid' ? 'Validated: format and uniqueness OK' : `Validation failed: ${this.validationDetail(t)}`);
    }
    const one = list.length === 1 ? list[0].id : `${list.length} tags`;
    this.showToast(bad ? `${one} checked: ${bad} with issues.` : `${one} validated. No issues found.`);
  }

  validateChecked(): void {
    this.validate(TAGS.filter((t) => this.checked.has(t.id)));
  }

  showIssues(): void {
    this.setView('ids');
    this.clearFilters();
    this.validFilter = 'Invalid format';
    if (!this.rows.length) this.validFilter = 'Duplicate';
  }

  // ===== Tag tables =====

  get rows(): TagId[] {
    const key = JSON.stringify([this.view, this.search, this.techFilter, this.statusFilter, this.siteFilter, this.typeFilter, this.validFilter, this.sortKey, this.sortDesc, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    const rows = TAGS.filter((t) =>
      (!this.techFilter || t.tech === this.techFilter) && (!this.statusFilter || t.status === this.statusFilter) &&
      (!this.typeFilter || t.type === this.typeFilter) &&
      (this.view !== 'assignments' || !this.siteFilter || t.site === this.siteFilter) &&
      (this.view !== 'ids' || !this.validFilter || this.validation(t) === this.validFilter) &&
      (!q || `${t.id} ${t.code} ${t.asset ? t.asset.kind + ' ' + t.asset.tag : ''} ${t.site} ${t.location}`.toLowerCase().includes(q)));
    const dir = this.sortDesc ? -1 : 1;
    const val = (t: TagId): number => {
      switch (this.sortKey) {
        case 'registered': return t.registeredOn;
        case 'assigned': return t.assignedOn ?? 0;
        case 'lastSeen': return t.lastSeen ?? 0;
        default: return lastActivity(t);
      }
    };
    rows.sort((a, b) => this.sortKey === 'id' ? dir * a.id.localeCompare(b.id) : dir * (val(a) - val(b)) || a.id.localeCompare(b.id));
    this.cacheKey = key;
    this.cacheRows = rows;
    return rows;
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) this.sortDesc = !this.sortDesc;
    else {
      this.sortKey = key;
      this.sortDesc = key !== 'id';
    }
    this.onFilter();
  }

  sortState(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey === key ? (this.sortDesc ? 'descending' : 'ascending') : 'none';
  }

  // ===== Audit trail =====

  private auditCache: { version: number; list: AuditRow[] } = { version: -1, list: [] };

  /** Every history entry of every tag, newest first. */
  get audit(): AuditRow[] {
    if (this.auditCache.version !== this.version) {
      const list: AuditRow[] = [];
      for (const t of TAGS) for (const e of t.history) list.push({ at: e.at, tag: t, text: e.text, by: e.by, kind: eventKind(e.text) });
      list.sort((a, b) => b.at - a.at);
      this.auditCache = { version: this.version, list };
    }
    return this.auditCache.list;
  }

  private auditKey = '';
  private auditRows: AuditRow[] = [];

  get filteredAudit(): AuditRow[] {
    const key = JSON.stringify([this.search, this.techFilter, this.eventFilter, this.userFilter, this.periodFilter, this.version]);
    if (key === this.auditKey) return this.auditRows;
    const q = this.search.trim().toLowerCase();
    const since = this.periodFilter ? Date.now() - Number(this.periodFilter) * DAY : 0;
    this.auditRows = this.audit.filter((r) =>
      (!this.techFilter || r.tag.tech === this.techFilter) && (!this.eventFilter || r.kind === this.eventFilter) &&
      (!this.userFilter || r.by === this.userFilter) && r.at >= since &&
      (!q || `${r.tag.id} ${r.text} ${r.by}`.toLowerCase().includes(q)));
    this.auditKey = key;
    return this.auditRows;
  }

  get pageAudit(): AuditRow[] {
    return this.filteredAudit.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  eventClass(k: EventKind): string {
    if (k === 'Assigned' || k === 'Reactivated' || k === 'Registered') return 'ev--good';
    if (k === 'Unassigned' || k === 'Deactivated') return 'ev--bad';
    if (k === 'Reassigned' || k === 'Replaced') return 'ev--move';
    return 'ev--info';
  }

  // ===== Paging =====

  private get total(): number {
    return this.view === 'audit' ? this.filteredAudit.length : this.rows.length;
  }

  get pageRows(): TagId[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  /** Page buttons with a gap, e.g. 1 2 3 4 5 … 249. */
  get pages(): (number | null)[] {
    const n = this.pageCount;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const p = this.page;
    if (p <= 3) return [0, 1, 2, 3, 4, null, n - 1];
    if (p >= n - 4) return [0, null, n - 5, n - 4, n - 3, n - 2, n - 1];
    return [0, null, p - 1, p, p + 1, null, n - 1];
  }

  get showing(): string {
    const n = this.total;
    const what = this.view === 'audit' ? 'events' : 'tags';
    return n ? `Showing ${(this.page * this.pageSize + 1).toLocaleString()}–${Math.min(n, (this.page + 1) * this.pageSize).toLocaleString()} of ${n.toLocaleString()} ${what}` : `No ${what}`;
  }

  onFilter(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.techFilter = this.statusFilter = this.typeFilter = this.validFilter = this.eventFilter = this.periodFilter = '';
    this.siteFilter = this.userFilter = '';
    this.onFilter();
  }

  // ===== Formatting =====

  /** "QR Label", "Barcode Label", "Hard Tag", "Beacon". */
  typeLabel(t: TagId): string {
    if (t.type !== 'Label') return t.type;
    return t.tech === 'QR Code' ? 'QR Label' : t.tech === 'Barcode' ? 'Barcode Label' : 'RFID Label';
  }

  techLong(t: TagId): string {
    return TECH_LONG[t.tech];
  }

  techIcon(t: Tech) {
    return t === 'Barcode' ? Barcode : t === 'QR Code' ? QrCode : t === 'BLE' ? Bluetooth : Radio;
  }

  techClass(t: Tech): string {
    return 'tech--' + PREFIX[t].toLowerCase();
  }

  siteLabel(t: TagId): string {
    return t.location ? `${t.site} / ${t.location}` : t.site;
  }

  assetLabel(a: LinkedAsset): string {
    return `${a.kind} ${a.tag}`;
  }

  fmtSeen(ms: number | null): string {
    if (ms === null) return '—';
    const now = new Date();
    const mins = Math.round((now.getTime() - ms) / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const time = new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= startOfToday) return `Today, ${time}`;
    if (ms >= startOfToday - DAY) return `Yesterday, ${time}`;
    return this.fmtDate(ms);
  }

  fmtDate(ms: number | null, withTime = false): string {
    if (ms === null) return '—';
    const d = new Date(ms);
    const date = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!withTime) return date;
    return `${date}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** History timestamps: "Today, 10:15 AM" for today, otherwise the date and time. */
  fmtWhen(ms: number): string {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return ms >= startOfToday ? `Today, ${new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : this.fmtDate(ms, true);
  }

  // ===== Row selection =====

  isChecked(t: TagId): boolean {
    return this.checked.has(t.id);
  }

  toggleCheck(t: TagId): void {
    if (this.checked.has(t.id)) this.checked.delete(t.id);
    else this.checked.add(t.id);
  }

  get pageAllChecked(): boolean {
    const rows = this.pageRows;
    return rows.length > 0 && rows.every((t) => this.checked.has(t.id));
  }

  get pageSomeChecked(): boolean {
    return !this.pageAllChecked && this.pageRows.some((t) => this.checked.has(t.id));
  }

  togglePage(): void {
    const all = this.pageAllChecked;
    for (const t of this.pageRows) {
      if (all) this.checked.delete(t.id);
      else this.checked.add(t.id);
    }
  }

  clearChecked(): void {
    this.checked.clear();
  }

  // ===== Panel =====

  get selected(): TagId | null {
    return this.selectedId ? TAGS.find((t) => t.id === this.selectedId) ?? null : null;
  }

  select(t: TagId): void {
    this.selectedId = t.id;
    this.panelTab = 'details';
    this.menuOpen = '';
  }

  isBle(t: TagId): boolean {
    return t.tech === 'BLE';
  }

  codeLabel(t: { tech: Tech }): string {
    return t.tech === 'BLE' ? 'MAC Address' : t.tech === 'Passive RFID' ? 'EPC' : 'Encoded Value';
  }

  firmware(t: TagId): string {
    return `v1.${3 + Math.floor(unit(t.id, 7) * 2)}.${Math.floor(unit(t.id, 8) * 6)}`;
  }

  battery(t: TagId): number {
    return t.id === 'BLE-002951' ? 78 : 22 + Math.round(unit(t.id, 3) * 76);
  }

  rssi(t: TagId): number {
    return t.id === 'BLE-002951' ? -62 : -(55 + Math.round(unit(t.id, 5) * 35));
  }

  batteryIcon(t: TagId) {
    const b = this.battery(t);
    return b >= 60 ? BatteryFull : b >= 25 ? BatteryMedium : BatteryLow;
  }

  batteryLevel(t: TagId): 'ok' | 'warn' | 'bad' {
    const b = this.battery(t);
    return b >= 40 ? 'ok' : b >= 20 ? 'warn' : 'bad';
  }

  signalWord(rssi: number): string {
    return rssi >= -70 ? 'Good' : rssi >= -82 ? 'Fair' : 'Weak';
  }

  signalIcon(rssi: number) {
    return rssi >= -65 ? Signal : rssi >= -75 ? SignalHigh : rssi >= -85 ? SignalMedium : SignalLow;
  }

  assetIcon(a: LinkedAsset) {
    const k = a.kind.toLowerCase();
    if (k.includes('forklift') || k.includes('pallet')) return Forklift;
    if (k.includes('vehicle') || k.includes('truck') || k.includes('van')) return Truck;
    if (k.includes('generator') || k.includes('panel')) return Zap;
    if (k.includes('pump')) return Droplet;
    if (k.includes('chiller') || k.includes('ahu')) return Wind;
    return Package;
  }

  /** Other identifiers on the same asset ("one asset can have multiple identifiers"). */
  siblings(t: TagId): TagId[] {
    return t.asset ? TAGS.filter((x) => x !== t && x.status === 'Assigned' && x.asset?.tag === t.asset!.tag) : [];
  }

  /** Assign / reassign / replace / unassign entries, newest first. */
  assignHistory(t: TagId): TagEvent[] {
    return t.history.filter((e) => /^(Assigned|Unassigned|Reassigned|Replaced)/.test(e.text)).slice(0, 4);
  }

  /** Splits "Assigned to Forklift FL-008" so the asset name can be shown as a link. */
  histAsset(t: TagId, e: TagEvent): { lead: string; asset: string } | null {
    if (!t.asset || !e.text.startsWith('Assigned to ')) return null;
    const label = this.assetLabel(t.asset);
    return e.text === `Assigned to ${label}` ? { lead: 'Assigned to ', asset: label } : null;
  }

  private readsCache: { id: string; version: number; list: Read[] } = { id: '', version: -1, list: [] };

  /** Recent reads leading up to the last seen time (derived for the demo). */
  reads(t: TagId): Read[] {
    if (this.readsCache.id === t.id && this.readsCache.version === this.version) return this.readsCache.list;
    const list: Read[] = [];
    if (t.lastSeen !== null) {
      const every = READ_EVERY_MIN[t.tech] * 60_000;
      for (let i = 0; i < 6; i++) {
        const jitter = 0.7 + unit(t.id, 20 + i) * 0.6;
        list.push({
          at: t.lastSeen - Math.round(i * every * jitter),
          reader: t.reader,
          rssi: t.tech === 'BLE' ? this.rssi(t) - Math.round((unit(t.id, 40 + i) - 0.5) * 8) : null,
          battery: t.tech === 'BLE' ? Math.min(100, this.battery(t) + Math.floor(i / 3)) : null,
        });
      }
    }
    this.readsCache = { id: t.id, version: this.version, list };
    return list;
  }

  viewAsset(t: TagId): void {
    this.menuOpen = '';
    if (!t.asset) return;
    if (t.asset.real) {
      this.router.navigate(['/assets/status-condition'], { queryParams: { tag: t.asset.tag } });
      return;
    }
    this.showAssetTags(t.asset.tag);
    this.showToast(`${t.asset.tag} isn't in the demo asset register. Showing its tags instead.`);
  }

  viewOnMap(t: TagId): void {
    this.router.navigate(['/tracking-iot/real-time-location'], { queryParams: { tag: t.id } });
  }

  showAssetTags(assetTag: string): void {
    this.setView('assignments');
    this.clearFilters();
    this.search = assetTag;
  }

  // ===== Changes =====

  private log(t: TagId, text: string): void {
    t.history.unshift({ at: Date.now(), text, by: CURRENT_USER });
    t.touched = Date.now();
    this.version++;
  }

  private open(d: Dialog): void {
    this.menuOpen = '';
    this.formError = '';
    this.dialog = d;
  }

  openAssign(t: TagId): void {
    this.open({ kind: 'assign', tagId: t.id, asset: t.asset?.tag ?? '', site: t.site, location: t.location, note: '' });
  }

  private assetCache: { version: number; list: LinkedAsset[] } = { version: -1, list: [] };

  get assetOptions(): LinkedAsset[] {
    if (this.assetCache.version !== this.version) this.assetCache = { version: this.version, list: knownAssets() };
    return this.assetCache.list;
  }

  locationsOf(site: string): string[] {
    return SITES.find((s) => s.name === site)?.locations ?? [];
  }

  private resolveAsset(code: string): LinkedAsset | null {
    const c = code.trim().toUpperCase();
    if (!c) return null;
    return knownAssets().find((a) => a.tag.toUpperCase() === c) ?? { tag: c, kind: 'Asset', real: false };
  }

  saveAssign(): void {
    const d = this.dialog;
    if (d?.kind !== 'assign') return;
    const t = TAGS.find((x) => x.id === d.tagId);
    const asset = this.resolveAsset(d.asset);
    if (!t) return;
    if (!asset) return void (this.formError = 'Choose the asset to link.');
    if (t.status === 'Assigned' && t.asset?.tag === asset.tag) return void (this.formError = `${t.id} is already linked to ${asset.tag}.`);
    const previous = t.asset;
    if (previous) this.log(t, `Unassigned from ${this.assetLabel(previous)}${d.note.trim() ? ': ' + d.note.trim() : ''}`);
    t.asset = asset;
    t.status = 'Assigned';
    t.assignedOn = Date.now();
    t.site = d.site;
    t.location = d.location;
    this.log(t, `Assigned to ${this.assetLabel(asset)}`);
    this.dialog = null;
    this.selectedId = t.id;
    this.showToast(`${t.id} ${previous ? 'reassigned' : 'assigned'} to ${asset.tag}.`);
  }

  // ----- Replace: a new tag takes over the asset, the old one is retired or freed -----

  openReplace(t: TagId): void {
    const same = this.spareTags(t)[0];
    this.open({ kind: 'replace', tagId: t.id, newId: same?.id ?? '', oldTo: 'Inactive', reason: '' });
  }

  /** Available tags, same technology first. */
  spareTags(old: TagId): TagId[] {
    return TAGS.filter((t) => t.status === 'Available')
      .sort((a, b) => Number(b.tech === old.tech) - Number(a.tech === old.tech) || a.id.localeCompare(b.id));
  }

  saveReplace(): void {
    const d = this.dialog;
    if (d?.kind !== 'replace') return;
    const old = TAGS.find((x) => x.id === d.tagId);
    const next = TAGS.find((x) => x.id === d.newId.trim().toUpperCase());
    if (!old?.asset) return;
    if (!next) return void (this.formError = 'Choose an available tag to fit.');
    if (next.status !== 'Available') return void (this.formError = `${next.id} is ${next.status.toLowerCase()}. Pick an available tag.`);
    if (d.oldTo === 'Inactive' && !d.reason.trim()) return void (this.formError = 'Enter why the old tag is being retired.');
    const asset = old.asset;
    const why = d.reason.trim() ? `: ${d.reason.trim()}` : '';
    old.asset = null;
    old.assignedOn = null;
    old.status = d.oldTo;
    this.log(old, `Replaced by ${next.id} on ${this.assetLabel(asset)}${d.oldTo === 'Inactive' ? ' and deactivated' : ''}${why}`);
    next.asset = asset;
    next.status = 'Assigned';
    next.assignedOn = Date.now();
    next.site = old.site;
    next.location = old.location;
    this.log(next, `Assigned to ${this.assetLabel(asset)} (replaces ${old.id})`);
    this.dialog = null;
    this.selectedId = next.id;
    this.showToast(`${next.id} now identifies ${asset.tag}. ${old.id} is ${d.oldTo.toLowerCase()}.`);
  }

  openUnassign(t: TagId): void {
    this.open({ kind: 'unassign', tagId: t.id, reason: '' });
  }

  saveUnassign(): void {
    const d = this.dialog;
    if (d?.kind !== 'unassign') return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t?.asset) return;
    const from = t.asset;
    t.asset = null;
    t.status = 'Available';
    t.assignedOn = null;
    this.log(t, `Unassigned from ${this.assetLabel(from)}${d.reason.trim() ? ': ' + d.reason.trim() : ''}`);
    this.dialog = null;
    this.showToast(`${t.id} is now available. ${from.tag}'s history keeps the link.`);
  }

  openStatus(t: TagId, to: 'Inactive' | 'Available'): void {
    this.open({ kind: 'status', tagId: t.id, to, reason: '' });
  }

  saveStatus(): void {
    const d = this.dialog;
    if (d?.kind !== 'status') return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t) return;
    if (d.to === 'Inactive' && !d.reason.trim()) return void (this.formError = 'Enter why the tag is being deactivated.');
    const from = t.asset;
    if (d.to === 'Inactive') {
      t.asset = null;
      t.assignedOn = null;
    }
    t.status = d.to;
    this.log(t, d.to === 'Inactive' ? `Deactivated${from ? ' and unlinked from ' + this.assetLabel(from) : ''}: ${d.reason.trim()}` : `Reactivated${d.reason.trim() ? ': ' + d.reason.trim() : ''}`);
    this.dialog = null;
    this.showToast(`${t.id} ${d.to === 'Inactive' ? 'deactivated' : 'reactivated'}.`);
  }

  // ----- Edit identifier (fix a wrong encoded value or type) -----

  openEdit(t: TagId): void {
    this.open({ kind: 'edit', tagId: t.id, type: t.type, code: t.code });
  }

  get editError(): string {
    const d = this.dlg('edit');
    const t = d && this.tagById(d.tagId);
    return t ? formatError(t.tech, d.code) : '';
  }

  saveEdit(): void {
    const d = this.dialog;
    if (d?.kind !== 'edit') return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t) return;
    const code = d.code.trim();
    if (!code) return void (this.formError = `Enter the ${this.codeLabel(t).toLowerCase()}.`);
    if (TAGS.some((x) => x !== t && x.code === code)) return void (this.formError = `Another tag already uses this ${this.codeLabel(t).toLowerCase()}.`);
    if (code === t.code && d.type === t.type) return void (this.dialog = null);
    const changes = [code !== t.code ? `${this.codeLabel(t)} ${t.code} → ${code}` : '', d.type !== t.type ? `type ${t.type} → ${d.type}` : ''].filter(Boolean).join(', ');
    t.code = code;
    t.type = d.type;
    this.log(t, `Edited: ${changes}`);
    this.dialog = null;
    this.showToast(`${t.id} updated${formatError(t.tech, code) ? ', but the value still fails validation' : ''}.`);
  }

  // ===== Register =====

  openRegister(): void {
    const tech: Tech = 'BLE';
    this.open({ kind: 'register', tech, type: DEFAULT_TYPE[tech], number: String(nextNumber(tech)).padStart(6, '0'), code: '', site: SITES[0].name, location: SITES[0].locations[0], asset: '' });
    this.fillCode();
  }

  onRegisterTech(): void {
    const d = this.dialog;
    if (d?.kind !== 'register') return;
    d.type = DEFAULT_TYPE[d.tech];
    d.number = String(nextNumber(d.tech)).padStart(6, '0');
    this.fillCode();
  }

  /** Suggest a code value (EPC / barcode / MAC) for the number; the user can overwrite it. */
  fillCode(): void {
    const d = this.dialog;
    if (d?.kind === 'register') d.code = codeFor(d.tech, Number(d.number) || 0);
  }

  get registerPreview(): string {
    const d = this.dialog;
    return d?.kind === 'register' ? tagIdOf(d.tech, Number(d.number) || 0) : '';
  }

  saveRegister(): void {
    const d = this.dialog;
    if (d?.kind !== 'register') return;
    const n = Number(d.number);
    if (!Number.isInteger(n) || n <= 0) return void (this.formError = 'Enter a tag number.');
    const id = tagIdOf(d.tech, n);
    if (TAGS.some((t) => t.id === id)) return void (this.formError = `${id} already exists.`);
    const bad = formatError(d.tech, d.code);
    if (bad) return void (this.formError = bad + '.');
    if (TAGS.some((t) => t.code === d.code.trim())) return void (this.formError = 'Another tag already uses this encoded value.');
    const t = this.createTag(d.tech, id, d.type, d.code.trim(), d.site, d.location, d.asset);
    this.selectedId = t.id;
    this.dialog = null;
    this.clearFilters();
    this.sortKey = 'activity';
    this.sortDesc = true;
    this.showToast(`${t.id} registered${t.asset ? ' and assigned to ' + t.asset.tag : ''}.`);
  }

  private createTag(tech: Tech, id: string, type: TagType, code: string, site: string, location: string, asset: string): TagId {
    const now = Date.now();
    const linked = this.resolveAsset(asset);
    const siteCode = SITES.find((s) => s.name === site)?.code ?? 'CST';
    const t: TagId = {
      id, tech, type, code, asset: linked, site, location, status: linked ? 'Assigned' : 'Available', assignedOn: linked ? now : null,
      lastSeen: null, reader: readerFor(tech, siteCode), registeredOn: now,
      history: [...(linked ? [{ at: now, text: `Assigned to ${this.assetLabel(linked)}`, by: CURRENT_USER }] : []), { at: now, text: `Registered as ${tech} ${type.toLowerCase()}`, by: CURRENT_USER }],
    };
    TAGS.unshift(t);
    this.version++;
    return t;
  }

  // ===== Import =====

  openImport(): void {
    this.open({ kind: 'import', rows: [], fileName: '', error: '' });
  }

  downloadTemplate(): void {
    const sample = [
      { Technology: 'BLE', 'Tag Number': nextNumber('BLE'), Type: 'Beacon', 'Encoded Value': '', Site: 'Dubai Plant', Location: 'Warehouse', 'Asset Code': 'FL-008' },
      { Technology: 'QR Code', 'Tag Number': nextNumber('QR Code'), Type: 'Label', 'Encoded Value': '', Site: 'Central Store', Location: '', 'Asset Code': '' },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sample), 'Tags');
    XLSX.writeFile(book, 'Tag_Import_Template.xlsx');
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const d = this.dialog;
    if (!file || d?.kind !== 'import') return;
    d.fileName = file.name;
    d.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const book = XLSX.read(reader.result, { type: 'array' });
        const sheet = book.Sheets[book.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        d.rows = this.validateImport(raw);
        if (!d.rows.length) d.error = 'The file has no rows.';
      } catch {
        d.error = 'This file could not be read. Use the Excel or CSV template.';
        d.rows = [];
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private validateImport(raw: Record<string, unknown>[]): ImportRow[] {
    const ids = new Set(TAGS.map((t) => t.id));
    const codes = new Set(TAGS.map((t) => t.code));
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
      return k ? String(r[k]).trim() : '';
    };
    return raw.map((r, i) => {
      const techText = get(r, 'technology', 'tech');
      const tech = TECH_ALIASES[techText.toLowerCase()] ?? null;
      const num = Number(get(r, 'tag number', 'number', 'tag no'));
      const id = tech && num > 0 ? tagIdOf(tech, num) : '';
      const typeText = get(r, 'type');
      const type = (TYPES.find((x) => x.toLowerCase() === typeText.toLowerCase()) ?? (tech ? DEFAULT_TYPE[tech] : 'Label')) as TagType;
      const code = get(r, 'encoded value', 'epc', 'code') || (tech && num > 0 ? codeFor(tech, num) : '');
      const site = SITES.find((s) => s.name.toLowerCase() === get(r, 'site').toLowerCase())?.name ?? '';
      const location = get(r, 'location');
      let error = '';
      if (!tech) error = techText ? `Unknown technology "${techText}"` : 'Technology missing';
      else if (!(num > 0)) error = 'Tag number missing';
      else if (ids.has(id)) error = `${id} already exists`;
      else if (formatError(tech, code)) error = formatError(tech, code);
      else if (codes.has(code)) error = 'Encoded value already used';
      else if (!site) error = 'Unknown site';
      if (!error) {
        ids.add(id);
        codes.add(code);
      }
      return { line: i + 2, tech, id, type, code, site, location, asset: get(r, 'asset code', 'asset'), error };
    });
  }

  get importValid(): number {
    const d = this.dialog;
    return d?.kind === 'import' ? d.rows.filter((r) => !r.error).length : 0;
  }

  saveImport(): void {
    const d = this.dialog;
    if (d?.kind !== 'import') return;
    const ok = d.rows.filter((r) => !r.error && r.tech);
    for (const r of ok) this.createTag(r.tech!, r.id, r.type, r.code, r.site, r.location, r.asset);
    const skipped = d.rows.length - ok.length;
    this.dialog = null;
    this.clearFilters();
    this.showToast(`${ok.length} tag${ok.length === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped` : ''}.`);
  }

  // ===== Export / menus =====

  /** Exports the current view: ticked tags (or the filtered list), or the filtered audit trail. */
  exportRows(): void {
    this.menuOpen = '';
    const book = XLSX.utils.book_new();
    if (this.view === 'audit') {
      const rows = this.filteredAudit.map((r) => ({ When: this.fmtDate(r.at, true), 'Tag ID': r.tag.id, Technology: r.tag.tech, Event: r.kind, Details: r.text, By: r.by }));
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Audit Trail');
      XLSX.writeFile(book, 'Tag_Audit_Trail.xlsx');
      return;
    }
    const list = this.checked.size ? TAGS.filter((t) => this.checked.has(t.id)) : this.rows;
    const rows = list.map((t) => this.view === 'ids'
      ? { 'Tag ID': t.id, Technology: t.tech, Format: this.typeLabel(t), [this.codeLabel(t)]: t.code, 'Registered On': this.fmtDate(t.registeredOn), Validation: this.validation(t), Status: t.status }
      : { 'Tag ID': t.id, 'Tag Type': this.typeLabel(t), Technology: t.tech, 'Linked Asset': t.asset ? this.assetLabel(t.asset) : '', Site: t.site, Location: t.location,
          'Assigned On': t.assignedOn ? this.fmtDate(t.assignedOn, true) : '', Status: t.status, 'Last Seen': t.lastSeen ? this.fmtDate(t.lastSeen, true) : '' });
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), this.view === 'ids' ? 'Tag IDs' : 'Assignments');
    XLSX.writeFile(book, this.view === 'ids' ? 'Tag_IDs.xlsx' : 'Tag_Assignments.xlsx');
  }

  toggleMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    if (this.dialog) this.dialog = null;
    // drawer mode: Esc also closes the details
    else if (window.innerWidth < 1200) this.selectedId = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }

  /** Narrow a dialog for the template (strict templates cannot narrow a union on their own). */
  dlg<K extends Dialog['kind']>(kind: K): Extract<Dialog, { kind: K }> | null {
    return this.dialog?.kind === kind ? (this.dialog as Extract<Dialog, { kind: K }>) : null;
  }

  tagById(id: string): TagId | undefined {
    return TAGS.find((t) => t.id === id);
  }
}
