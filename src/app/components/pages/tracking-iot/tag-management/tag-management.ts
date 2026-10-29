import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Ban,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Download,
  Droplet,
  Ellipsis,
  ExternalLink,
  Forklift,
  House,
  Info,
  Link2,
  MapPin,
  Package,
  Plus,
  Search,
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
import { DEFAULT_TYPE, LinkedAsset, lastActivity, SITES, STATUSES, TAGS, TECHS, TYPES, TagEvent, TagId, TagStatus, TagType, Tech, codeFor, knownAssets, nextNumber, readerFor, tagIdOf } from '../tag-ids/tag-data';

type Dialog =
  | { kind: 'register'; tech: Tech; type: TagType; number: string; code: string; site: string; location: string; asset: string }
  | { kind: 'assign'; tagId: string; asset: string; site: string; location: string; note: string }
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

const CURRENT_USER = 'John Doe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TECH_ALIASES: Record<string, Tech> = { barcode: 'Barcode', qr: 'QR Code', 'qr code': 'QR Code', rfid: 'Passive RFID', 'passive rfid': 'Passive RFID', ble: 'BLE', beacon: 'BLE' };
const TECH_LONG: Record<Tech, string> = { Barcode: 'Barcode (1D)', 'QR Code': 'QR Code (2D)', 'Passive RFID': 'Passive RFID (UHF)', BLE: 'BLE (Bluetooth Low Energy)' };
/** Month-over-month change shown on the KPI cards (demo figures). */
const KPI_TREND = { Total: 12, Assigned: 8, Available: -6, Inactive: -14 };
/** How often each technology is read, for the telemetry list. */
const READ_EVERY_MIN: Record<Tech, number> = { BLE: 10, 'Passive RFID': 120, 'QR Code': 4320, Barcode: 4320 };

/** Stable 0..1 value per tag and salt, so derived readings don't change between renders. */
function unit(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

@Component({
  selector: 'app-tag-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './tag-management.html',
  styleUrls: ['./tag-management.css', './tag-management-panel.css', './tag-management-layout.css'],
})
export class TagManagement implements OnDestroy {
  readonly icons = { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Ban, Box, ChevronLeft, ChevronRight, CircleCheck, CircleSlash, Download, Ellipsis, ExternalLink, House, Info, Link2, MapPin, Plus, Search, Tag, Unlink, Upload, X };
  readonly techs = TECHS;
  readonly types = TYPES;
  readonly statuses = STATUSES;
  readonly sites = SITES;
  readonly pageSizes = [5, 10, 25, 50];
  readonly trend = KPI_TREND;

  search = '';
  techFilter: Tech | '' = '';
  statusFilter: TagStatus | '' = '';
  siteFilter = '';
  typeFilter: TagType | '' = '';
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

  constructor(private router: Router) {}

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====

  get counts(): Record<TagStatus | 'Total', number> {
    const c = { Total: TAGS.length, Assigned: 0, Available: 0, Inactive: 0 };
    for (const t of TAGS) c[t.status]++;
    return c;
  }

  setStatus(s: TagStatus | ''): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
    this.onFilter();
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  // ===== Table =====

  get rows(): TagId[] {
    const key = JSON.stringify([this.search, this.techFilter, this.statusFilter, this.siteFilter, this.typeFilter, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    const rows = TAGS.filter((t) =>
      (!this.techFilter || t.tech === this.techFilter) && (!this.statusFilter || t.status === this.statusFilter) && (!this.siteFilter || t.site === this.siteFilter) &&
      (!this.typeFilter || t.type === this.typeFilter) &&
      (!q || `${t.id} ${t.code} ${t.asset ? t.asset.kind + ' ' + t.asset.tag : ''} ${t.site} ${t.location}`.toLowerCase().includes(q)));
    rows.sort((a, b) => lastActivity(b) - lastActivity(a) || a.id.localeCompare(b.id));
    this.cacheKey = key;
    this.cacheRows = rows;
    return rows;
  }

  get pageRows(): TagId[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
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
    const n = this.rows.length;
    return n ? `Showing ${(this.page * this.pageSize + 1).toLocaleString()}–${Math.min(n, (this.page + 1) * this.pageSize).toLocaleString()} of ${n.toLocaleString()} tags` : 'No tags';
  }

  onFilter(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.techFilter = this.statusFilter = this.typeFilter = '';
    this.siteFilter = '';
    this.onFilter();
  }

  /** "QR Label", "Barcode Label", "Hard Tag", "Beacon". */
  typeLabel(t: TagId): string {
    if (t.type !== 'Label') return t.type;
    return t.tech === 'QR Code' ? 'QR Label' : t.tech === 'Barcode' ? 'Barcode Label' : 'RFID Label';
  }

  techLong(t: TagId): string {
    return TECH_LONG[t.tech];
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
    if (ms >= startOfToday - 86_400_000) return `Yesterday, ${time}`;
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

  codeLabel(t: TagId): string {
    return t.tech === 'BLE' ? 'Serial Number' : t.tech === 'Passive RFID' ? 'EPC' : 'Encoded Value';
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

  /** Assign / reassign / unassign entries, newest first. */
  assignHistory(t: TagId): TagEvent[] {
    return t.history.filter((e) => /^(Assigned|Unassigned|Reassigned)/.test(e.text)).slice(0, 4);
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
    this.clearFilters();
    this.search = assetTag;
  }

  // ===== Changes =====

  private log(t: TagId, text: string): void {
    t.history.unshift({ at: Date.now(), text, by: CURRENT_USER });
    t.touched = Date.now();
    this.version++;
  }

  openAssign(t: TagId): void {
    this.menuOpen = '';
    this.formError = '';
    this.dialog = { kind: 'assign', tagId: t.id, asset: t.asset?.tag ?? '', site: t.site, location: t.location, note: '' };
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

  openUnassign(t: TagId): void {
    this.menuOpen = '';
    this.formError = '';
    this.dialog = { kind: 'unassign', tagId: t.id, reason: '' };
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
    this.menuOpen = '';
    this.formError = '';
    this.dialog = { kind: 'status', tagId: t.id, to, reason: '' };
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

  // ===== Add tag =====

  openRegister(): void {
    this.menuOpen = '';
    this.formError = '';
    const tech: Tech = 'BLE';
    this.dialog = { kind: 'register', tech, type: DEFAULT_TYPE[tech], number: String(nextNumber(tech)).padStart(6, '0'), code: '', site: SITES[0].name, location: SITES[0].locations[0], asset: '' };
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
    if (!d.code.trim()) return void (this.formError = 'Enter the encoded value.');
    if (TAGS.some((t) => t.code === d.code.trim())) return void (this.formError = 'Another tag already uses this encoded value.');
    const t = this.createTag(d.tech, id, d.type, d.code.trim(), d.site, d.location, d.asset);
    this.selectedId = t.id;
    this.dialog = null;
    this.clearFilters();
    this.showToast(`${t.id} added${t.asset ? ' and assigned to ' + t.asset.tag : ''}.`);
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
    this.menuOpen = '';
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
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
        d.rows = this.validate(raw);
        if (!d.rows.length) d.error = 'The file has no rows.';
      } catch {
        d.error = 'This file could not be read. Use the Excel or CSV template.';
        d.rows = [];
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private validate(raw: Record<string, unknown>[]): ImportRow[] {
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

  /** Exports the ticked tags, or the filtered list when nothing is ticked. */
  exportRows(): void {
    this.menuOpen = '';
    const list = this.checked.size ? TAGS.filter((t) => this.checked.has(t.id)) : this.rows;
    const rows = list.map((t) => ({
      'Tag ID': t.id, 'Tag Type': this.typeLabel(t), Technology: t.tech, 'Encoded Value': t.code, 'Linked Asset': t.asset ? this.assetLabel(t.asset) : '',
      Site: t.site, Location: t.location, Status: t.status, 'Last Seen': t.lastSeen ? this.fmtDate(t.lastSeen, true) : '',
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Tags');
    XLSX.writeFile(book, 'Tags.xlsx');
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
