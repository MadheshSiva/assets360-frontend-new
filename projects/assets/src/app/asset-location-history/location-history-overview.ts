import { Component, DestroyRef, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CalendarDays,
  Clock,
  Download,
  EllipsisVertical,
  List,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
  Table,
  X,
} from 'lucide-angular';
import { ASSET_RECORDS, ASSET_TYPE_ICONS, AssetRecord, AssetStatus, TODAY, findAsset } from 'shared-ui';
import { LocationHistory } from './location-history';
import { GEOFENCE, LOCATION_SOURCES, Movement, MovementType, PLACES, Place, findPlace, historyOf, parseLocal, recordMovement, sourceShort, stamp } from './location-history.data';

/** One location change: an asset arriving at a place. */
interface LocationEvent {
  key: string;
  asset: AssetRecord;
  m: Movement;
  place: Place;
  /** Where the asset was before; empty for its first recorded location. */
  from: string;
  /** Minutes it stayed; null while it is still there. */
  dwell: number | null;
}

/** An asset with its latest and previous location. */
interface SummaryRow {
  asset: AssetRecord;
  current: LocationEvent;
  previous: string;
  changes: number;
}

interface TrendPoint {
  day: string;
  count: number;
  x: number;
  y: number;
}

interface DonutSlice {
  short: string;
  value: string;
  color: string;
  count: number;
  pct: number;
  dash: string;
  offset: number;
}

interface MapSpot {
  place: Place;
  x: number;
  y: number;
  r: number;
  rows: SummaryRow[];
}

interface MovementForm {
  tag: string;
  location: string;
  movement: MovementType;
  at: string;
  source: string;
  remarks: string;
}

type SortKey = 'tag' | 'last';
type Tab = 'summary' | 'events';

const CURRENT_USER = 'Rex Kumar';
const DAY = 86_400_000;
const isoDay = (d: Date) => stamp(d).slice(0, 10);
/** Colour per source, in the validated chart order (BLE, GPS, Manual, QR Scan, RFID). */
const SOURCE_COLORS = ['#7c4dff', '#d4900f', '#1e88e5', '#1f9d55', '#e0489a'];

/** Chart box (SVG user units). */
const TREND = { w: 340, h: 170, left: 34, right: 10, top: 10, bottom: 26 };
const PLAN = { w: 760, h: 380, pad: 40 };

/**
 * Location History. Without ?tag= it lists every asset's latest location and every location change, with trend and
 * source charts. Opening a row (?tag=GEN-00045) shows that asset's own history page.
 */
@Component({
  selector: 'app-location-history-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule, LocationHistory],
  templateUrl: './location-history-overview.html',
  styleUrls: ['./location-history-overview.css'],
})
export class LocationHistoryOverview {
  readonly icons = { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, Boxes, CalendarDays, Clock, Download, EllipsisVertical, List, MapIcon, MapPin, Plus, Search, Table, X };
  readonly typeIcons = ASSET_TYPE_ICONS;
  readonly assets = ASSET_RECORDS;
  readonly places = PLACES;
  readonly sources = LOCATION_SOURCES;
  readonly pageSizes = [10, 25, 50];
  readonly ranges = [
    { days: 7, label: 'Last 7 Days' },
    { days: 30, label: 'Last 30 Days' },
    { days: 90, label: 'Last 90 Days' },
    { days: 0, label: 'All Time' },
  ];
  readonly trendBox = TREND;
  readonly plan = PLAN;
  readonly sourceShort = sourceShort;

  /** Set from ?tag=: that asset's history page is shown instead of the overview. */
  tag = '';

  // Filters
  rangeDays = 30;
  siteFilter = '';
  categoryFilter = '';
  typeFilter = '';
  zoneFilter = '';
  sourceFilter = '';
  statusFilter = '';
  search = '';

  tab: Tab = 'summary';
  view: 'table' | 'map' = 'table';
  sortKey: SortKey = 'last';
  sortAsc = false;
  pageSize = 10;
  page = 0;
  selected = new Set<string>();
  menuOpen = '';

  hoverDay: TrendPoint | null = null;
  hoverSlice: DonutSlice | null = null;
  hoverSpot: MapSpot | null = null;

  form: MovementForm | null = null;
  formError = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Bumped when a movement is recorded, so the derived lists are rebuilt. */
  private version = 0;
  private cache: { key: string; events: LocationEvent[] } | null = null;

  private readonly router = inject(Router);
  private readonly today = isoDay(TODAY);

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        this.tag = findAsset(p.get('tag'))?.tag ?? '';
        this.version++;
      });
  }

  // ===== Data =====

  /** Every location change of every asset, newest first. */
  private get allEvents(): LocationEvent[] {
    const key = String(this.version);
    if (this.cache?.key === key) return this.cache.events;
    const events: LocationEvent[] = [];
    for (const asset of this.assets) {
      const list = [...historyOf(asset).movements].sort((a, b) => a.at.localeCompare(b.at));
      list.forEach((m, i) => {
        const next = list[i + 1];
        events.push({
          key: `${asset.tag}-${m.id}`, asset, m, place: findPlace(m.location), from: list[i - 1]?.location ?? '',
          dwell: next ? Math.round((parseLocal(next.at).getTime() - parseLocal(m.at).getTime()) / 60_000) : null,
        });
      });
    }
    events.sort((a, b) => b.m.at.localeCompare(a.m.at));
    this.cache = { key, events };
    return events;
  }

  /** First day of the chosen range ('' for all time) and of the range before it. */
  private get rangeStart(): string {
    return this.rangeDays ? isoDay(new Date(TODAY.getTime() - (this.rangeDays - 1) * DAY)) : '';
  }

  private get prevStart(): string {
    return this.rangeDays ? isoDay(new Date(TODAY.getTime() - (2 * this.rangeDays - 1) * DAY)) : '';
  }

  private assetMatches(a: AssetRecord): boolean {
    const q = this.search.trim().toLowerCase();
    return (
      (!this.categoryFilter || a.category === this.categoryFilter) &&
      (!this.typeFilter || a.type === this.typeFilter) &&
      (!this.statusFilter || a.status === this.statusFilter) &&
      (!q || `${a.tag} ${a.name} ${historyOf(a).serialNumber}`.toLowerCase().includes(q))
    );
  }

  private placeMatches(e: LocationEvent): boolean {
    return (!this.siteFilter || e.place.site === this.siteFilter) && (!this.zoneFilter || e.place.name === this.zoneFilter) && (!this.sourceFilter || e.m.source === this.sourceFilter);
  }

  /** Changes matching every filter except the date range. */
  private get matching(): LocationEvent[] {
    return this.allEvents.filter((e) => this.assetMatches(e.asset) && this.placeMatches(e));
  }

  /** Location changes in the chosen range that match the filters. */
  get events(): LocationEvent[] {
    const from = this.rangeStart;
    return this.matching.filter((e) => !from || e.m.at.slice(0, 10) >= from);
  }

  private get previousEvents(): LocationEvent[] {
    const from = this.prevStart;
    const to = this.rangeStart;
    return from ? this.matching.filter((e) => e.m.at.slice(0, 10) >= from && e.m.at.slice(0, 10) < to) : [];
  }

  /** Each asset's latest location, for assets whose latest move is in range and matches the filters. */
  get summary(): SummaryRow[] {
    const from = this.rangeStart;
    const rows: SummaryRow[] = [];
    for (const asset of this.assets) {
      if (!this.assetMatches(asset)) continue;
      const own = this.allEvents.filter((e) => e.asset === asset);
      const current = own[0];
      if (!current || !this.placeMatches(current) || (from && current.m.at.slice(0, 10) < from)) continue;
      rows.push({ asset, current, previous: current.from, changes: own.length });
    }
    const dir = this.sortAsc ? 1 : -1;
    return rows.sort((a, b) => dir * (this.sortKey === 'tag' ? a.asset.tag.localeCompare(b.asset.tag) : a.current.m.at.localeCompare(b.current.m.at)));
  }

  get sortedEvents(): LocationEvent[] {
    const list = this.events;
    const dir = this.sortAsc ? 1 : -1;
    return [...list].sort((a, b) => dir * (this.sortKey === 'tag' ? a.asset.tag.localeCompare(b.asset.tag) || b.m.at.localeCompare(a.m.at) : a.m.at.localeCompare(b.m.at)));
  }

  // ===== KPIs =====

  get assetsWithHistory(): number {
    return new Set(this.events.map((e) => e.asset.tag)).size;
  }

  get assetsDelta(): number | null {
    return this.delta(this.assetsWithHistory, new Set(this.previousEvents.map((e) => e.asset.tag)).size);
  }

  get changesDelta(): number | null {
    return this.delta(this.events.length, this.previousEvents.length);
  }

  get movedToday(): number {
    return this.matching.filter((e) => e.m.at.startsWith(this.today)).length;
  }

  get movedTodayDelta(): number | null {
    const yesterday = isoDay(new Date(TODAY.getTime() - DAY));
    return this.dayDelta(this.movedToday, this.matching.filter((e) => e.m.at.startsWith(yesterday)).length);
  }

  get avgDwell(): string {
    const d = this.events.filter((e) => e.dwell !== null).map((e) => e.dwell as number);
    return d.length ? this.fmtDwell(Math.round(d.reduce((s, v) => s + v, 0) / d.length)) : '—';
  }

  /** Assets whose current location was entered by hand rather than read from a tag or scan. */
  get unverified(): number {
    return this.summary.filter((r) => r.current.m.source === 'Manual Update').length;
  }

  private delta(now: number, before: number): number | null {
    // Too little in the earlier period for a meaningful percentage
    if (!this.rangeDays || before < 5) return null;
    return Math.round(((now - before) / before) * 1000) / 10;
  }

  private dayDelta(now: number, before: number): number | null {
    return before ? Math.round(((now - before) / before) * 1000) / 10 : null;
  }

  get periodLabel(): string {
    return `vs. previous ${this.rangeDays} days`;
  }

  // ===== Charts =====

  /** Location changes per day across the range (all time: since the first change). */
  get trend(): { points: TrendPoint[]; line: string; area: string; yTicks: { y: number; label: number }[]; xTicks: TrendPoint[]; max: number } {
    const events = this.events;
    const first = this.rangeDays ? new Date(TODAY.getTime() - (this.rangeDays - 1) * DAY) : events.length ? parseLocal(events[events.length - 1].m.at.slice(0, 10)) : TODAY;
    const days: string[] = [];
    for (let t = new Date(first); t <= TODAY; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) days.push(isoDay(t));
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.m.at.slice(0, 10), (counts.get(e.m.at.slice(0, 10)) ?? 0) + 1);
    const peak = Math.max(1, ...days.map((d) => counts.get(d) ?? 0));
    const step = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : 10;
    const max = Math.ceil(peak / step) * step;
    const { w, h, left, right, top, bottom } = TREND;
    const iw = w - left - right;
    const ih = h - top - bottom;
    const points = days.map((day, i) => ({
      day, count: counts.get(day) ?? 0,
      x: Math.round((left + (days.length > 1 ? (i / (days.length - 1)) * iw : iw / 2)) * 10) / 10,
      y: Math.round((top + ih - ((counts.get(day) ?? 0) / max) * ih) * 10) / 10,
    }));
    const line = points.map((p) => `${p.x},${p.y}`).join(' ');
    const area = points.length ? `M${points[0].x},${top + ih} L${line.replace(/ /g, ' L')} L${points[points.length - 1].x},${top + ih} Z` : '';
    const yTicks = Array.from({ length: max / step + 1 }, (_, i) => ({ label: i * step, y: top + ih - ((i * step) / max) * ih }));
    const every = Math.max(1, Math.ceil(days.length / 7));
    const xTicks = points.filter((_, i) => (days.length - 1 - i) % every === 0);
    return { points, line, area, yTicks, xTicks, max };
  }

  /** Point under the pointer: the nearest day. */
  trendMove(event: PointerEvent, svg: Element): void {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * TREND.w;
    const pts = this.trend.points;
    this.hoverDay = pts.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), pts[0]) ?? null;
  }

  get slices(): DonutSlice[] {
    const events = this.events;
    const total = events.length;
    const circ = 2 * Math.PI * 70;
    const gap = total ? 2 : 0;
    let offset = 0;
    return this.sources.map((s, i) => {
      const count = events.filter((e) => e.m.source === s.value).length;
      const len = total ? (count / total) * circ : 0;
      const slice = {
        short: s.short, value: s.value, color: SOURCE_COLORS[i], count, pct: total ? Math.round((count / total) * 1000) / 10 : 0,
        dash: `${Math.max(0, len - gap)} ${circ}`, offset: -offset,
      };
      offset += len;
      return slice;
    });
  }

  // ===== Map (site plan) =====

  /** Places drawn on the site plan with the assets now there; far-away sites are listed beside it. */
  get spots(): { spots: MapSpot[]; offsite: SummaryRow[]; fence: string } {
    const rows = this.summary;
    const local = PLACES.filter((p) => p.site !== 'External Site');
    const lats = local.map((p) => p.lat);
    const lngs = local.map((p) => p.lng);
    const [n, s, e, w] = [Math.max(...lats), Math.min(...lats), Math.max(...lngs), Math.min(...lngs)];
    const kx = (PLAN.w - 2 * PLAN.pad) / (e - w || 1);
    const ky = (PLAN.h - 2 * PLAN.pad) / (n - s || 1);
    const at = (lat: number, lng: number) => ({ x: Math.round(PLAN.pad + (lng - w) * kx), y: Math.round(PLAN.pad + (n - lat) * ky) });
    const spots: MapSpot[] = local
      .map((place) => ({ place, ...at(place.lat, place.lng), rows: rows.filter((r) => r.current.place.name === place.name), r: 0 }))
      .map((spot) => ({ ...spot, r: spot.rows.length ? 7 + Math.min(7, spot.rows.length * 2) : 4 }));
    const fence = GEOFENCE.map(([lat, lng]) => at(lat, lng))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
    return { spots, offsite: rows.filter((r) => r.current.place.site === 'External Site'), fence };
  }

  spotClick(spot: MapSpot): void {
    this.zoneFilter = this.zoneFilter === spot.place.name ? '' : spot.place.name;
    this.onFilter();
  }

  // ===== Filters & options =====

  get siteOptions(): string[] {
    return [...new Set(PLACES.map((p) => p.site))].sort();
  }

  get zoneOptions(): Place[] {
    return PLACES.filter((p) => !this.siteFilter || p.site === this.siteFilter);
  }

  get categoryOptions(): string[] {
    return [...new Set(this.assets.map((a) => a.category))].sort();
  }

  get typeOptions(): string[] {
    return [...new Set(this.assets.filter((a) => !this.categoryFilter || a.category === this.categoryFilter).map((a) => a.type))].sort();
  }

  get statusOptions(): AssetStatus[] {
    return [...new Set(this.assets.map((a) => a.status))];
  }

  get filtersActive(): boolean {
    return !!(this.rangeDays !== 30 || this.siteFilter || this.categoryFilter || this.typeFilter || this.zoneFilter || this.sourceFilter || this.statusFilter || this.search);
  }

  onFilter(): void {
    this.page = 0;
    this.selected.clear();
  }

  onSite(): void {
    if (this.zoneFilter && !this.zoneOptions.some((p) => p.name === this.zoneFilter)) this.zoneFilter = '';
    this.onFilter();
  }

  onCategory(): void {
    if (this.typeFilter && !this.typeOptions.includes(this.typeFilter)) this.typeFilter = '';
    this.onFilter();
  }

  resetFilters(): void {
    this.rangeDays = 30;
    this.siteFilter = this.categoryFilter = this.typeFilter = this.zoneFilter = this.sourceFilter = this.statusFilter = this.search = '';
    this.onFilter();
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.sortKey = 'last';
    this.sortAsc = false;
    this.onFilter();
  }

  sortBy(key: SortKey): void {
    this.sortAsc = this.sortKey === key ? !this.sortAsc : key === 'tag';
    this.sortKey = key;
    this.page = 0;
  }

  // ===== Paging & selection =====

  get total(): number {
    return this.tab === 'summary' ? this.summary.length : this.events.length;
  }

  get pageSummary(): SummaryRow[] {
    return this.summary.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageEvents(): LocationEvent[] {
    return this.sortedEvents.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  /** Page numbers with gaps (-1) for long lists: 1 2 3 … 125. */
  get pageList(): number[] {
    const n = this.pageCount;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const set = new Set([0, n - 1, this.page - 1, this.page, this.page + 1].filter((p) => p >= 0 && p < n));
    if (this.page < 3) [1, 2].forEach((p) => set.add(p));
    const sorted = [...set].sort((a, b) => a - b);
    return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? [-1, p] : [p]));
  }

  get showingLabel(): string {
    const n = this.total;
    const noun = this.tab === 'summary' ? 'assets' : 'changes';
    return n ? `Showing ${this.page * this.pageSize + 1} – ${Math.min(n, (this.page + 1) * this.pageSize)} of ${n} ${noun}` : `No ${noun} match the filters`;
  }

  goPage(p: number): void {
    this.page = Math.min(this.pageCount - 1, Math.max(0, p));
  }

  private get pageKeys(): string[] {
    return this.tab === 'summary' ? this.pageSummary.map((r) => r.asset.tag) : this.pageEvents.map((e) => e.key);
  }

  get allOnPageSelected(): boolean {
    const keys = this.pageKeys;
    return keys.length > 0 && keys.every((k) => this.selected.has(k));
  }

  toggleAll(): void {
    const on = !this.allOnPageSelected;
    for (const k of this.pageKeys) on ? this.selected.add(k) : this.selected.delete(k);
  }

  toggle(key: string): void {
    this.selected.has(key) ? this.selected.delete(key) : this.selected.add(key);
  }

  // ===== trackBy (rows and marks are rebuilt by the getters) =====

  byAsset = (_: number, r: SummaryRow) => r.asset.tag;
  byKey = (_: number, e: LocationEvent) => e.key;
  bySpot = (_: number, s: MapSpot) => s.place.name;
  bySlice = (_: number, s: DonutSlice) => s.short;
  byDay = (_: number, p: TrendPoint) => p.day;

  // ===== Display helpers =====

  fmtDwell(min: number | null): string {
    if (min === null) return '—';
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }

  fmtDate(at: string): string {
    return parseLocal(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmtShort(day: string): string {
    return parseLocal(day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  statusClass(s: AssetStatus): string {
    return s === 'Active' ? 'st-green' : s === 'Disposed' ? 'st-red' : s === 'In Storage' || s === 'Checked Out' ? 'st-gray' : 'st-amber';
  }

  sourceClass(source: string): string {
    return 'src-' + sourceShort(source).toLowerCase().replace(/\W/g, '');
  }

  // ===== Actions =====

  open(tag: string): void {
    this.menuOpen = '';
    this.router.navigate([], { queryParams: { tag } });
  }

  openDetails(tag: string): void {
    this.router.navigate(['/assets/overview'], { queryParams: { tag } });
  }

  toggleMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  openForm(tag = ''): void {
    this.menuOpen = '';
    this.formError = '';
    this.form = { tag, location: '', movement: 'In', at: stamp(new Date()), source: 'Manual Update', remarks: '' };
  }

  get formCurrent(): string {
    const a = findAsset(this.form?.tag);
    if (!a) return '';
    const cur = [...historyOf(a).movements].sort((x, y) => y.at.localeCompare(x.at))[0];
    return cur ? `${cur.location} since ${cur.at.replace('T', ' ')}` : 'No location recorded yet';
  }

  saveForm(): void {
    const f = this.form;
    if (!f) return;
    const asset = findAsset(f.tag);
    if (!asset) return void (this.formError = 'Choose the asset.');
    const error = recordMovement(asset, { at: f.at, location: f.location, movement: f.movement, source: f.source, remarks: f.remarks.trim() || 'Location updated', by: CURRENT_USER });
    if (error) return void (this.formError = error);
    this.form = null;
    this.version++;
    this.showToast(`${asset.tag} moved to ${f.location}.`);
  }

  export(): void {
    this.menuOpen = '';
    const book = XLSX.utils.book_new();
    if (this.tab === 'summary') {
      const rows = this.summary.filter((r) => !this.selected.size || this.selected.has(r.asset.tag));
      const data = rows.map((r) => ({
        'Asset ID': r.asset.tag, 'Asset Name': r.asset.name, 'Asset Type': r.asset.type, Category: r.asset.category, Site: r.current.place.site,
        'Current Location': r.current.place.name, Zone: r.current.place.zone, 'Previous Location': r.previous || '—', 'Last Movement': r.current.m.at.replace('T', ' '),
        Source: sourceShort(r.current.m.source), Status: r.asset.status, 'Location Changes': r.changes,
      }));
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Asset Summary');
    } else {
      const rows = this.sortedEvents.filter((e) => !this.selected.size || this.selected.has(e.key));
      const data = rows.map((e) => ({
        'Date & Time': e.m.at.replace('T', ' '), 'Asset ID': e.asset.tag, 'Asset Name': e.asset.name, From: e.from || '—', To: e.place.name, Site: e.place.site, Zone: e.place.zone,
        'Movement Type': e.m.movement, Source: sourceShort(e.m.source), Remarks: e.m.remarks, 'Dwell Time': this.fmtDwell(e.dwell), 'Recorded By': e.m.by,
      }));
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Location Changes');
    }
    XLSX.writeFile(book, `Location_History_${this.tab === 'summary' ? 'Assets' : 'Changes'}_${this.today}.xlsx`);
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = '';
    this.form = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
