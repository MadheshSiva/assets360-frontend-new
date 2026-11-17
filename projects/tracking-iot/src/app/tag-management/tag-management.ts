import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, catchError, concatMap, from, map, of, switchMap, toArray } from 'rxjs';
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
import { DEFAULT_TYPE, LinkedAsset, lastActivity, PREFIX, SITES, STATUSES, TAGS, TECHS, TYPES, TagEvent, TagId, TagRead, TagStatus, TagType, Tech, Validation, ensureSite, formatError, knownAssets, nextNumber, tagIdFromNumber } from './tag-data';
import { TagIdApiService, TagSummary, apiType, pageType } from './tag-id-api.service';

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
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string }
  | { kind: 'delete'; tagId: string };

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

interface AuditRow { at: number; tag: TagId; text: string; by: string; kind: EventKind }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TECH_ALIASES: Record<string, Tech> = {
  barcode: 'Barcode', qr: 'QR Code', 'qr code': 'QR Code', rfid: 'Passive RFID', 'passive rfid': 'Passive RFID', 'active rfid': 'Active RFID', ble: 'BLE', beacon: 'BLE', nfc: 'NFC',
};
const TECH_LONG: Record<Tech, string> = {
  Barcode: 'Barcode (1D)', 'QR Code': 'QR Code (2D)', 'Passive RFID': 'Passive RFID (UHF)', 'Active RFID': 'Active RFID', BLE: 'BLE (Bluetooth Low Energy)', NFC: 'NFC (Near Field Communication)',
};
const EVENT_KINDS: EventKind[] = ['Registered', 'Assigned', 'Reassigned', 'Replaced', 'Unassigned', 'Deactivated', 'Reactivated', 'Validated', 'Edited', 'Read'];
const DAY = 86_400_000;

function eventKind(text: string): EventKind {
  if (text.startsWith('Last read')) return 'Read';
  if (text.startsWith('Validation')) return 'Validated';
  return EVENT_KINDS.find((k) => text.startsWith(k)) ?? 'Edited';
}

type ToastTone = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  /** New for every toast, so the card (and its countdown bar) restarts. */
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}
/** How long a toast stays up (errors included); hovering pauses it. */
const TOAST_MS = 4000;

@Component({
  selector: 'app-tag-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './tag-management.html',
  styleUrls: ['./tag-management.css', './tag-management-panel.css', './tag-management-layout.css', './tag-management-views.css', '../shared/iot-purple-theme.css'],
})
export class TagManagement implements OnInit, OnDestroy {
  private readonly api = inject(TagIdApiService);
  readonly icons = { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Ban, Box, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleSlash, Download, Ellipsis, ExternalLink, FileText, History, House, Info, Link2, MapPin, Pencil, Plus, Replace, Search, ShieldCheck, Tag, Unlink, Upload, X };
  techs: Tech[] = TECHS;
  readonly types = TYPES;
  /** Per technology, from GET /api/tag-ids/options: the tag types it comes in and the name of its encoded value. */
  private techOptions = new Map<Tech, { types: TagType[]; apiTypes: string[]; valueLabel: string }>();
  readonly statuses = STATUSES;
  readonly sites = SITES;
  readonly eventKinds = EVENT_KINDS;
  readonly pageSizes = [5, 10, 25, 50];
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
  /** Tag type as the API names it ("Barcode Label", "Hard Tag", ...). */
  typeFilter = '';
  /** Validation filter: 'Valid', or 'Invalid' = any failing result (server, format, duplicate or missing value). */
  validFilter: 'Valid' | 'Invalid' | '' = '';
  readonly validFilters = ['Valid', 'Invalid'] as const;
  eventFilter: EventKind | '' = '';
  userFilter = '';
  periodFilter: '' | '1' | '7' | '30' | '90' = '';
  sortKey: SortKey = 'activity';
  sortDesc = true;
  pageSize = 10;
  page = 0;
  /** Tag ids ticked in the table. */
  checked = new Set<string>();

  /** No tag is selected until a row is clicked. */
  selectedId: string | null = null;
  panelTab: 'details' | 'telemetry' | 'history' = 'details';
  menuOpen = '';
  dialog: Dialog | null = null;
  formError = '';
  /** Top-right toast; replaced by the next one, closed after TOAST_MS (paused while hovered). */
  toast: Toast | null = null;
  readonly toastMs = TOAST_MS;
  /** True while the pointer is on the toast: its countdown stops. */
  toastPaused = false;
  private toastEndsAt = 0;
  private toastLeft = 0;
  private toastSeq = 0;
  /** True while the tag list is being fetched. */
  loading = false;
  /** Why the tag list could not be loaded. */
  loadError = '';
  /** True while a change is being saved. */
  saving = false;
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

  private changedSub?: Subscription;

  ngOnInit(): void {
    this.load();
    // Create / update / delete change the counts: ask the server again
    this.changedSub = this.api.changed$.subscribe(() => this.loadSummary());
    this.api.technologies().subscribe({
      next: (opts) => {
        const list = opts.map((o) => o.technology as Tech).filter((t) => t in DEFAULT_TYPE);
        for (const o of opts) {
          if (!(o.technology in DEFAULT_TYPE)) continue;
          const tech = o.technology as Tech;
          if (o.idPrefix) PREFIX[tech] = o.idPrefix;
          const types = [...new Set(o.tagTypes.map(pageType))];
          this.techOptions.set(tech, { types, apiTypes: o.tagTypes, valueLabel: o.valueLabel });
        }
        if (list.length) this.techs = list;
        // An open Register dialog follows the new options
        const d = this.dialog;
        if (d?.kind === 'register' && d.type && !this.typesFor(d.tech).includes(d.type)) d.type = '' as TagType;
      },
      error: () => {},
    });
    this.api.assets().subscribe((assets) => {
      this.registeredAssets = assets;
      this.version++;
    });
    this.api.sites().subscribe((sites) => {
      for (const s of sites) ensureSite(s.name, s.id);
      this.version++;
    });
  }

  /** GET /api/tag-ids/summary → the KPI counts (null: counted from the loaded list). */
  summary: TagSummary | null = null;

  loadSummary(): void {
    this.api.summary().subscribe((s) => {
      this.summary = s;
      this.version++;
    });
  }

  /** GET /api/tag-ids → the tag list. */
  load(): void {
    this.loadSummary();
    this.loading = true;
    this.loadError = '';
    this.api.getAll().subscribe({
      next: (tags) => {
        TAGS.splice(0, TAGS.length, ...tags);
        for (const t of tags) ensureSite(t.site, t.siteId, t.location);
        this.loading = false;
        this.version++;
      },
      error: (e: Error) => {
        this.loading = false;
        this.loadError = e.message;
        this.version++;
      },
    });
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
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

  /** KPI counts from GET /api/tag-ids/summary; counted from the loaded list until it answers (or when it fails). */
  get counts(): Record<TagStatus | 'Total', number> {
    if (this.summary) return this.summary.counts;
    const c = { Total: TAGS.length, Assigned: 0, Available: 0, Inactive: 0 };
    for (const t of TAGS) c[t.status]++;
    return c;
  }

  /** Change vs last month in % for a KPI card (null: not shown). */
  kpiChange(key: TagStatus | 'Total'): number | null {
    return this.summary?.change[key] ?? null;
  }

  setStatus(s: TagStatus | ''): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
    if (this.view === 'audit') this.setView('assignments');
    this.onFilter();
  }

  // ===== Validation =====

  private codeUse = { version: -1, map: new Map<string, number>() };

  validation(t: TagId): Validation {
    if (this.codeUse.version !== this.version) {
      const map = new Map<string, number>();
      for (const x of TAGS) map.set(x.code, (map.get(x.code) ?? 0) + 1);
      this.codeUse = { version: this.version, map };
    }
    // The page's checks of the value first (more specific), then the server's verdict
    const local: Validation | null = !t.code ? null : formatError(t.tech, t.code) ? 'Invalid format' : (this.codeUse.map.get(t.code) ?? 0) > 1 ? 'Duplicate' : 'Valid';
    if (local && local !== 'Valid') return local;
    if (/^invalid$/i.test(t.apiValidation ?? '')) return 'Invalid';
    return local ?? 'Not recorded';
  }

  validationDetail(t: TagId): string {
    const v = this.validation(t);
    if (v === 'Invalid') return t.apiValidationMessage || 'Failed server validation';
    if (v === 'Not recorded') return t.apiValidationMessage || `No ${this.codeLabel(t).toLowerCase()} is stored for this tag`;
    if (v === 'Invalid format') return formatError(t.tech, t.code);
    if (v === 'Duplicate') return `Same ${this.codeLabel(t).toLowerCase()} as ${TAGS.filter((x) => x !== t && x.code === t.code).map((x) => x.id).join(', ')}`;
    return `${this.codeLabel(t)} format and uniqueness OK`;
  }

  private issues = { version: -1, count: 0 };

  get issueCount(): number {
    if (this.issues.version !== this.version) this.issues = { version: this.version, count: TAGS.filter((t) => ['Invalid', 'Invalid format', 'Duplicate'].includes(this.validation(t))).length };
    return this.issues.count;
  }

  /** Records a validation check in the tag's history (the column always shows the live result). */
  validate(list: TagId[]): void {
    this.menuOpen = '';
    let bad = 0;
    for (const t of list) {
      const v = this.validation(t);
      if (v === 'Not recorded') continue;
      if (v !== 'Valid') bad++;
      this.log(t, v === 'Valid' ? 'Validated: format and uniqueness OK' : `Validation failed: ${this.validationDetail(t)}`);
    }
    const one = list.length === 1 ? list[0].id : `${list.length} tags`;
    this.showToast(bad ? 'Issues found' : 'Validated', bad ? `${bad} of ${one} need attention` : one, bad ? 'warning' : 'success');
  }

  validateChecked(): void {
    this.validate(TAGS.filter((t) => this.checked.has(t.id)));
  }

  showIssues(): void {
    this.setView('ids');
    this.clearFilters();
    this.validFilter = 'Invalid';
  }

  // ===== Tag tables =====

  get rows(): TagId[] {
    const key = JSON.stringify([this.view, this.search, this.techFilter, this.statusFilter, this.siteFilter, this.typeFilter, this.validFilter, this.sortKey, this.sortDesc, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    const rows = TAGS.filter((t) =>
      (!this.techFilter || t.tech === this.techFilter) && (!this.statusFilter || t.status === this.statusFilter) &&
      (!this.typeFilter || this.typeLabel(t) === this.typeFilter) &&
      (this.view !== 'assignments' || !this.siteFilter || t.site === this.siteFilter) &&
      (this.view !== 'ids' || !this.validFilter || (this.validation(t) === 'Valid') === (this.validFilter === 'Valid')) &&
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

  /** People who appear in the audit trail, for the "Performed By" filter. */
  get users(): string[] {
    return [...new Set(this.audit.map((r) => r.by))].sort((a, b) => a.localeCompare(b));
  }

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
    // A type the chosen technology doesn't come in is dropped
    if (this.typeFilter && !this.typeOptions.includes(this.typeFilter)) this.typeFilter = '';
  }

  /** Tag Type filter: the API's type names, for the chosen technology (or all technologies). */
  get typeOptions(): string[] {
    const techs = this.techFilter ? [this.techFilter as Tech] : this.techs;
    const names = techs.flatMap((tech) => this.typesFor(tech).map((type) => this.typeName(tech, type)));
    for (const t of TAGS) if (!this.techFilter || t.tech === this.techFilter) names.push(this.typeLabel(t));
    return [...new Set(names)];
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
    if (t.apiTagType && pageType(t.apiTagType) === t.type) return t.apiTagType;
    return this.typeName(t.tech, t.type);
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

  /** Tag types offered for a technology (from GET /api/tag-ids/options; all types until it answers). */
  typesFor(tech: Tech): TagType[] {
    const types = this.techOptions.get(tech)?.types;
    return types?.length ? types : this.types;
  }

  /** The technology's usual type, when it is offered; else its first offered type. */
  defaultType(tech: Tech): TagType {
    const types = this.typesFor(tech);
    return types.includes(DEFAULT_TYPE[tech]) ? DEFAULT_TYPE[tech] : types[0];
  }

  /** Dropdown text of a type for a technology: the API's name ("Barcode Label", "QR Label", "Hard Tag"). */
  typeName(tech: Tech, type: TagType): string {
    return this.techOptions.get(tech)?.apiTypes.find((a) => pageType(a) === type) ?? apiType(tech, type);
  }

  /** Example of the encoded value for a technology (input placeholder). */
  valuePlaceholder(tech: Tech): string {
    switch (tech) {
      case 'Barcode': return '12 or 13 digits, e.g. 4006381333931';
      case 'QR Code': return 'Text or URL';
      case 'BLE': return 'e.g. AC:23:3F:12:AB:01';
      case 'NFC': return 'e.g. 04A224B2C35E80';
      default: return '24 hex characters, e.g. E28011606000020D6A7B1C2F';
    }
  }

  codeLabel(t: { tech: Tech }): string {
    const fromApi = this.techOptions.get(t.tech)?.valueLabel;
    if (fromApi) return fromApi;
    return t.tech === 'BLE' ? 'MAC Address' : t.tech === 'Passive RFID' ? 'EPC' : 'Encoded Value';
  }

  batteryIcon(b: number) {
    return b >= 60 ? BatteryFull : b >= 25 ? BatteryMedium : BatteryLow;
  }

  batteryLevel(b: number): 'ok' | 'warn' | 'bad' {
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

  /** Recent reads reported for the tag, newest first. */
  reads(t: TagId): TagRead[] {
    return t.reads ?? [];
  }

  viewAsset(t: TagId): void {
    this.menuOpen = '';
    if (!t.asset) return;
    if (t.asset.real || this.registeredAssets.some((a) => a.tag.toUpperCase() === t.asset!.tag.toUpperCase())) {
      this.router.navigate(['/assets/status-condition'], { queryParams: { tag: t.asset.tag } });
      return;
    }
    this.showAssetTags(t.asset.tag);
    this.showToast('Asset not registered', `Showing tags of ${t.asset.tag}`, 'info');
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

  /** Adds a page event to the tag's history (kept for this session; the API stores no change history). */
  private log(t: TagId, text: string): void {
    t.history.unshift({ at: Date.now(), text, by: this.api.currentUser() });
    t.touched = Date.now();
    this.version++;
  }

  /** A working copy of a tag to send to the API (the list keeps the original until the save succeeds). */
  private draftOf(t: TagId): TagId {
    return { ...t, asset: t.asset ? { ...t.asset } : null, history: [...t.history] };
  }

  /** Puts the saved tag into the list, keeping the page-only fields of the local copy. */
  private commit(saved: TagId, local: TagId): TagId {
    const t: TagId = { ...saved, code: local.code, assignedOn: local.assignedOn, history: local.history, touched: local.touched, reads: local.reads, reader: local.reader };
    const i = TAGS.findIndex((x) => x.id === t.id);
    if (i >= 0) TAGS[i] = t;
    else TAGS.unshift(t);
    ensureSite(t.site, t.siteId, t.location);
    this.version++;
    return t;
  }

  /** Master-data id of a site picked on the page; keeps the tag's own id while the site is unchanged. */
  private siteIdOf(site: string, t?: TagId): string | null {
    if (!site) return null;
    if (t && t.site === site && t.siteId) return t.siteId;
    return SITES.find((s) => s.name === site)?.code || null;
  }

  /** Shows a failed save in the open dialog, or as a toast. */
  private failed(e: Error): void {
    this.saving = false;
    if (this.dialog) this.formError = e.message;
    else this.showToast('Action failed', e.message, 'error');
  }

  private open(d: Dialog): void {
    this.menuOpen = '';
    this.formError = '';
    this.dialog = d;
  }

  openAssign(t: TagId): void {
    this.open({ kind: 'assign', tagId: t.id, asset: t.asset?.tag ?? '', site: t.site, location: t.location, note: '' });
  }

  /** Assets from the asset register (GET api/asset-registrations). */
  private registeredAssets: LinkedAsset[] = [];
  private assetCache: { version: number; list: LinkedAsset[] } = { version: -1, list: [] };

  /** Picker options: registered assets, then any asset a tag is linked to that the register doesn't list. */
  get assetOptions(): LinkedAsset[] {
    if (this.assetCache.version !== this.version) {
      const seen = new Set(this.registeredAssets.map((a) => a.tag.toUpperCase()));
      const extra = knownAssets().filter((a) => !seen.has(a.tag.toUpperCase()));
      this.assetCache = { version: this.version, list: [...this.registeredAssets, ...extra] };
    }
    return this.assetCache.list;
  }

  assetOptionLabel(a: LinkedAsset): string {
    return `${a.kind} - ${a.tag}`;
  }

  locationsOf(site: string): string[] {
    return SITES.find((s) => s.name === site)?.locations ?? [];
  }

  private resolveAsset(code: string): LinkedAsset | null {
    const c = code.trim().toUpperCase();
    if (!c) return null;
    return this.assetOptions.find((a) => a.tag.toUpperCase() === c) ?? { tag: c, kind: 'Asset', real: false };
  }

  saveAssign(): void {
    const d = this.dialog;
    if (d?.kind !== 'assign' || this.saving) return;
    const t = TAGS.find((x) => x.id === d.tagId);
    const asset = this.resolveAsset(d.asset);
    if (!t) return;
    if (!asset) return void (this.formError = 'Choose the asset to link.');
    if (t.status === 'Assigned' && t.asset?.tag === asset.tag && t.site === d.site && t.location === d.location) return void (this.formError = `${t.id} is already linked to ${asset.tag}.`);
    const previous = t.asset;
    const draft = this.draftOf(t);
    Object.assign(draft, { asset, status: 'Assigned', assignedOn: Date.now(), site: d.site, location: d.location, siteId: this.siteIdOf(d.site, t) });
    this.saving = true;
    this.api.update(draft).subscribe({
      next: (saved) => {
        const n = this.commit(saved, draft);
        if (previous && previous.tag !== asset.tag) this.log(n, `Unassigned from ${this.assetLabel(previous)}${d.note.trim() ? ': ' + d.note.trim() : ''}`);
        this.log(n, `Assigned to ${this.assetLabel(n.asset ?? asset)}`);
        this.saving = false;
        this.dialog = null;
        this.selectedId = n.id;
        this.showToast(previous ? 'Tag reassigned' : 'Tag assigned', `${n.id} → ${asset.tag}`);
      },
      error: (e: Error) => this.failed(e),
    });
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

  /** Two saves: the old tag is freed / retired first, then the new tag takes the asset. */
  saveReplace(): void {
    const d = this.dialog;
    if (d?.kind !== 'replace' || this.saving) return;
    const old = TAGS.find((x) => x.id === d.tagId);
    const next = TAGS.find((x) => x.id === d.newId.trim().toUpperCase());
    if (!old?.asset) return;
    if (!next) return void (this.formError = 'Choose an available tag to fit.');
    if (next.status !== 'Available') return void (this.formError = `${next.id} is ${next.status.toLowerCase()}. Pick an available tag.`);
    if (d.oldTo === 'Inactive' && !d.reason.trim()) return void (this.formError = 'Enter why the old tag is being retired.');
    const asset = old.asset;
    const why = d.reason.trim() ? `: ${d.reason.trim()}` : '';
    const oldDraft = this.draftOf(old);
    Object.assign(oldDraft, { asset: null, assignedOn: null, status: d.oldTo });
    const nextDraft = this.draftOf(next);
    Object.assign(nextDraft, { asset, status: 'Assigned', assignedOn: Date.now(), site: old.site, location: old.location, siteId: old.siteId ?? null });
    this.saving = true;
    let oldSaved: TagId | null = null;
    this.api.update(oldDraft).pipe(
      switchMap((saved) => {
        oldSaved = this.commit(saved, oldDraft);
        this.log(oldSaved, `Replaced by ${next.id} on ${this.assetLabel(asset)}${d.oldTo === 'Inactive' ? ' and deactivated' : ''}${why}`);
        return this.api.update(nextDraft);
      }),
    ).subscribe({
      next: (saved) => {
        const n = this.commit(saved, nextDraft);
        this.log(n, `Assigned to ${this.assetLabel(asset)} (replaces ${old.id})`);
        this.saving = false;
        this.dialog = null;
        this.selectedId = n.id;
        this.showToast('Tag replaced', `${old.id} → ${n.id} on ${asset.tag}`);
      },
      error: (e: Error) => {
        this.failed(oldSaved ? new Error(`${old.id} was updated, but ${next.id} could not be assigned: ${e.message}`) : e);
      },
    });
  }

  openUnassign(t: TagId): void {
    this.open({ kind: 'unassign', tagId: t.id, reason: '' });
  }

  saveUnassign(): void {
    const d = this.dialog;
    if (d?.kind !== 'unassign' || this.saving) return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t?.asset) return;
    const from = t.asset;
    const draft = this.draftOf(t);
    Object.assign(draft, { asset: null, status: 'Available', assignedOn: null });
    this.saving = true;
    this.api.update(draft).subscribe({
      next: (saved) => {
        const n = this.commit(saved, draft);
        this.log(n, `Unassigned from ${this.assetLabel(from)}${d.reason.trim() ? ': ' + d.reason.trim() : ''}`);
        this.saving = false;
        this.dialog = null;
        this.showToast('Tag unassigned', `${n.id} is available`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  openStatus(t: TagId, to: 'Inactive' | 'Available'): void {
    this.open({ kind: 'status', tagId: t.id, to, reason: '' });
  }

  saveStatus(): void {
    const d = this.dialog;
    if (d?.kind !== 'status' || this.saving) return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t) return;
    if (d.to === 'Inactive' && !d.reason.trim()) return void (this.formError = 'Enter why the tag is being deactivated.');
    const from = t.asset;
    const draft = this.draftOf(t);
    // a deactivated or reactivated tag is not linked to an asset
    Object.assign(draft, { asset: null, assignedOn: null, status: d.to });
    this.saving = true;
    this.api.update(draft).subscribe({
      next: (saved) => {
        const n = this.commit(saved, draft);
        this.log(n, d.to === 'Inactive' ? `Deactivated${from ? ' and unlinked from ' + this.assetLabel(from) : ''}: ${d.reason.trim()}` : `Reactivated${d.reason.trim() ? ': ' + d.reason.trim() : ''}`);
        this.saving = false;
        this.dialog = null;
        this.showToast(d.to === 'Inactive' ? 'Tag deactivated' : 'Tag reactivated', n.id);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // ----- Edit identifier (the tag type; the API stores no encoded value) -----

  openEdit(t: TagId): void {
    this.open({ kind: 'edit', tagId: t.id, type: t.type, code: t.code });
  }

  get editError(): string {
    const d = this.dlg('edit');
    const t = d && this.tagById(d.tagId);
    return t && d.code.trim() ? formatError(t.tech, d.code) : '';
  }

  saveEdit(): void {
    const d = this.dialog;
    if (d?.kind !== 'edit' || this.saving) return;
    const t = TAGS.find((x) => x.id === d.tagId);
    if (!t) return;
    const code = d.code.trim();
    if (d.type === t.type && code === t.code) return void (this.dialog = null);
    if (!code) return void (this.formError = `Enter the ${this.codeLabel(t).toLowerCase()}.`);
    const bad = formatError(t.tech, code);
    if (bad) return void (this.formError = bad);
    const draft = this.draftOf(t);
    draft.type = d.type;
    draft.code = code;
    const changes = [d.type !== t.type ? `type ${t.type} → ${d.type}` : '', code !== t.code ? `${this.codeLabel(t)} ${t.code || '—'} → ${code}` : ''].filter(Boolean).join(', ');
    this.saving = true;
    this.api.update(draft).subscribe({
      next: (saved) => {
        const n = this.commit(saved, draft);
        this.log(n, `Edited: ${changes}`);
        this.saving = false;
        this.dialog = null;
        this.showToast('Tag updated', n.id);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // ----- Delete -----

  openDelete(t: TagId): void {
    this.open({ kind: 'delete', tagId: t.id });
  }

  saveDelete(): void {
    const d = this.dialog;
    if (d?.kind !== 'delete' || this.saving) return;
    this.saving = true;
    this.api.delete(d.tagId).subscribe({
      next: () => {
        const i = TAGS.findIndex((x) => x.id === d.tagId);
        if (i >= 0) TAGS.splice(i, 1);
        this.checked.delete(d.tagId);
        if (this.selectedId === d.tagId) this.selectedId = null;
        this.saving = false;
        this.dialog = null;
        this.version++;
        this.page = Math.min(this.page, this.pageCount - 1);
        this.showToast('Tag deleted', d.tagId);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // ===== Register =====

  openRegister(): void {
    this.open({ kind: 'register', tech: '' as Tech, type: '' as TagType, number: '', code: '', site: '', location: '', asset: '' });
  }

  onRegisterTech(): void {
    const d = this.dialog;
    if (d?.kind !== 'register') return;
    d.type = '' as TagType;
    if (d.tech) d.number = String(nextNumber(d.tech)).padStart(6, '0');
  }

  get registerPreview(): string {
    const d = this.dialog;
    return d?.kind === 'register' ? (tagIdFromNumber(d.tech, d.number) ?? '–') : '';
  }

  saveRegister(): void {
    const d = this.dialog;
    if (d?.kind !== 'register' || this.saving) return;
    if (!d.tech) return void (this.formError = 'Choose the technology.');
    if (!d.type) return void (this.formError = 'Choose the tag type.');
    if (!String(d.number ?? '').trim()) return void (this.formError = 'Enter a tag number.');
    const id = tagIdFromNumber(d.tech, d.number);
    if (!id) return void (this.formError = "Tag number can only contain letters, digits, '-' and '_' (up to 50 characters).");
    if (TAGS.some((t) => t.id.toLowerCase() === id.toLowerCase())) return void (this.formError = `${id} already exists.`);
    const code = d.code.trim();
    if (!code) return void (this.formError = `Enter the ${this.codeLabel(d).toLowerCase()}.`);
    const bad = formatError(d.tech, code);
    if (bad) return void (this.formError = bad);
    const draft = this.newTag(d.tech, id, d.type, d.site, d.location, d.asset, code);
    this.saving = true;
    this.api.create(draft).subscribe({
      next: (saved) => {
        const t = this.commit(saved, { ...draft, history: saved.history });
        if (t.asset) this.log(t, `Assigned to ${this.assetLabel(t.asset)}`);
        this.saving = false;
        this.selectedId = t.id;
        this.dialog = null;
        this.clearFilters();
        this.sortKey = 'activity';
        this.sortDesc = true;
        this.showToast('Tag registered', t.asset ? `${t.id} → ${t.asset.tag}` : t.id);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  /** A new tag to POST; the API fills in who registered it and when. */
  private newTag(tech: Tech, id: string, type: TagType, site: string, location: string, asset: string, code: string): TagId {
    const now = Date.now();
    const linked = this.resolveAsset(asset);
    return {
      id, tech, type, code, asset: linked, site, location, status: linked ? 'Assigned' : 'Available', assignedOn: linked ? now : null,
      lastSeen: null, reader: '', registeredOn: now, history: [], siteId: this.siteIdOf(site),
    };
  }

  // ===== Import =====

  openImport(): void {
    this.open({ kind: 'import', rows: [], fileName: '', error: '' });
  }

  downloadTemplate(): void {
    const header = ['Technology', 'Tag Number', 'Value', 'Type', 'Site', 'Location', 'Asset Code'];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([], { header }), 'Tags');
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
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
      return k ? String(r[k]).trim() : '';
    };
    return raw.map((r, i) => {
      const techText = get(r, 'technology', 'tech');
      const tech = TECH_ALIASES[techText.toLowerCase()] ?? null;
      const numText = get(r, 'tag number', 'number', 'tag no');
      const id = (tech && tagIdFromNumber(tech, numText)) || '';
      const typeText = get(r, 'type');
      const type = (TYPES.find((x) => x.toLowerCase() === typeText.toLowerCase()) ?? (tech ? DEFAULT_TYPE[tech] : 'Label')) as TagType;
      const siteText = get(r, 'site');
      const site = SITES.find((s) => s.name.toLowerCase() === siteText.toLowerCase())?.name ?? siteText;
      const location = get(r, 'location');
      // EPC / MAC / barcode / QR payload / UID: required by the API
      const code = get(r, 'value', 'encoded value', 'epc', 'mac', 'mac address', 'uid', 'barcode', 'code');
      let error = '';
      if (!tech) error = techText ? `Unknown technology "${techText}"` : 'Technology missing';
      else if (!numText) error = 'Tag number missing';
      else if (!id) error = `Tag number "${numText}" can only contain letters, digits, '-' and '_'`;
      else if (ids.has(id)) error = `${id} already exists`;
      else if (!code) error = `${this.codeLabel({ tech })} missing`;
      else if (formatError(tech, code)) error = formatError(tech, code);
      if (!error) ids.add(id);
      return { line: i + 2, tech, id, type, code, site, location, asset: get(r, 'asset code', 'asset'), error };
    });
  }

  get importValid(): number {
    const d = this.dialog;
    return d?.kind === 'import' ? d.rows.filter((r) => !r.error).length : 0;
  }

  /** POSTs the valid rows one by one; rows the API rejects are reported with its reason. */
  saveImport(): void {
    const d = this.dialog;
    if (d?.kind !== 'import' || this.saving) return;
    const ok = d.rows.filter((r) => !r.error && r.tech);
    this.saving = true;
    from(ok).pipe(
      concatMap((r) => {
        const draft = this.newTag(r.tech!, r.id, r.type, r.site, r.location, r.asset, r.code);
        return this.api.create(draft).pipe(
          map((saved) => {
            this.commit(saved, { ...draft, history: saved.history });
            return '';
          }),
          catchError((e: Error) => {
            r.error = e.message;
            return of(r.error);
          }),
        );
      }),
      toArray(),
    ).subscribe((results) => {
      this.saving = false;
      const done = results.filter((x) => !x).length;
      const failed = results.length - done;
      const skipped = d.rows.length - ok.length;
      this.clearFilters();
      if (failed) {
        d.error = `${done} imported; ${failed} rejected by the server (see Result).`;
        d.rows = d.rows.filter((r) => r.error);
        return;
      }
      this.dialog = null;
      this.showToast('Import complete', `${done} imported${skipped ? ` · ${skipped} skipped` : ''}`, skipped ? 'warning' : 'success');
    });
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

  /** Short action title ("Tag registered") and a one-line detail ("c3000071fe4c → TV12333"). */
  private showToast(title: string, message: string, tone: ToastTone = 'success'): void {
    this.toast = { id: ++this.toastSeq, tone, title, message };
    this.toastPaused = false;
    this.runToastTimer(TOAST_MS);
  }

  closeToast(): void {
    clearTimeout(this.toastTimer);
    this.toast = null;
    this.toastPaused = false;
  }

  /** Hovering the toast stops its countdown; leaving resumes it with the time that was left. */
  pauseToast(): void {
    if (!this.toast || this.toastPaused) return;
    clearTimeout(this.toastTimer);
    this.toastLeft = Math.max(0, this.toastEndsAt - Date.now());
    this.toastPaused = true;
  }

  resumeToast(): void {
    if (!this.toast || !this.toastPaused) return;
    this.toastPaused = false;
    this.runToastTimer(this.toastLeft);
  }

  private runToastTimer(ms: number): void {
    clearTimeout(this.toastTimer);
    this.toastEndsAt = Date.now() + ms;
    this.toastTimer = setTimeout(() => this.closeToast(), ms);
  }

  trackToast(_: number, t: Toast): number {
    return t.id;
  }

  toastIcon(tone: ToastTone) {
    return tone === 'success' ? this.icons.CircleCheck : tone === 'info' ? this.icons.Info : this.icons.CircleAlert;
  }

  /** Narrow a dialog for the template (strict templates cannot narrow a union on their own). */
  dlg<K extends Dialog['kind']>(kind: K): Extract<Dialog, { kind: K }> | null {
    return this.dialog?.kind === kind ? (this.dialog as Extract<Dialog, { kind: K }>) : null;
  }

  tagById(id: string): TagId | undefined {
    return TAGS.find((t) => t.id === id);
  }
}
