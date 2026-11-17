import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, NgZone, OnDestroy, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Barcode,
  Box,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  EllipsisVertical,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Plus,
  Search,
  Shapes,
  User,
  Users,
  X,
} from 'lucide-angular';
import { ASSET_RECORDS, ASSET_TYPE_ICONS, AssetRecord, findAsset } from 'shared-ui';
import { AssetHistory, GEOFENCE, LOCATION_SOURCES, Movement, MovementType, PLACES, Place, findPlace, historyOf, parseLocal, recordMovement, stamp } from './location-history.data';

/** A movement with its place and how long the asset stayed there. */
interface Row extends Movement {
  place: Place;
  /** Minutes until the next movement; null while the asset is still there. */
  dwell: number | null;
}

/** What the map draws for the current view (screen pixels inside the map box). */
interface MapTile {
  key: string;
  url: string;
  x: number;
  y: number;
}

interface MapPinView {
  row: Row;
  x: number;
  y: number;
  current: boolean;
  when: string;
}

interface MapView {
  tiles: MapTile[];
  pins: MapPinView[];
  path: string;
  fence: string;
}

interface RecordForm {
  location: string;
  movement: MovementType;
  at: string;
  source: string;
  remarks: string;
}

const DEFAULT_TAG = 'GEN-00045';
const CURRENT_USER = 'Rex Kumar';

const TILE = 256;
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;
/** Satellite imagery (Esri World Imagery); a plain site-plan background shows wherever a tile can't load. */
const TILE_URL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** Web Mercator: lat/lng to world pixels at a zoom level, and back. */
function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * size, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size };
}

function unproject(x: number, y: number, z: number): { lat: number; lng: number } {
  const size = TILE * 2 ** z;
  return { lng: (x / size) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI };
}

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-location-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './location-history.html',
  styleUrls: ['./location-history.css', './location-history-table.css'],
})
export class LocationHistory implements AfterViewInit, OnDestroy {
  readonly icons = {
    Barcode, Box, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, EllipsisVertical, List, LocateFixed, MapIcon, MapPin, Minus, Plus, Search,
    Shapes, User, Users, X,
  };
  readonly typeIcons = ASSET_TYPE_ICONS;
  readonly places = PLACES;
  readonly assets = ASSET_RECORDS;
  readonly pageSizes = [10, 25, 50];
  readonly sources = LOCATION_SOURCES;

  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  asset: AssetRecord = findAsset(DEFAULT_TAG) ?? ASSET_RECORDS[0];
  history: AssetHistory = historyOf(this.asset);
  view: 'map' | 'list' = 'map';

  // Filters
  dateFrom = '';
  dateTo = '';
  dateOpen = false;
  typeFilter = '';
  siteFilter = '';
  zoneFilter = '';
  movementFilter: MovementType | '' = '';
  search = '';
  pageSize = 10;
  page = 0;

  /** Table row highlighted on the map. */
  selectedId: number | null = null;
  menuOpen = '';
  pickerOpen = false;
  pickerSearch = '';
  recordForm: RecordForm | null = null;
  recordError = '';
  showAllRecent = false;

  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private resizeObserver?: ResizeObserver;
  /** Map state: zoom level, centre and the map box size in pixels. */
  mapZoom = 17;
  private center = { lat: PLACES[0].lat, lng: PLACES[0].lng };
  mapW = 800;
  mapH = 290;
  private fitted = false;
  readonly failedTiles = new Set<string>();
  private drag: { x: number; y: number; cx: number; cy: number; id: number } | null = null;
  private viewCache: { key: string; view: MapView } | null = null;
  private destroyed = false;

  constructor() {
    // ?tag=GEN-00045 opens an asset's history
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => {
        const a = findAsset(p.get('tag'));
        if (a && a.tag !== this.asset.tag) this.setAsset(a, false);
      });
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || !this.mapEl || typeof ResizeObserver === 'undefined') return;
    // Keep the map sized to its box (it changes with the window and when the map view is shown again)
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      this.zone.run(() => {
        this.mapW = Math.round(width);
        this.mapH = Math.round(height);
        if (!this.fitted) this.fit();
      });
    });
    this.resizeObserver.observe(this.mapEl.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.toastTimer);
    this.resizeObserver?.disconnect();
  }

  // ===== Asset =====

  setAsset(a: AssetRecord, updateUrl = true): void {
    this.asset = a;
    this.history = historyOf(a);
    this.selectedId = null;
    this.page = 0;
    this.pickerOpen = false;
    this.fit();
    if (updateUrl) this.router.navigate([], { queryParams: { tag: a.tag }, replaceUrl: true });
  }

  get pickerAssets(): AssetRecord[] {
    const q = this.pickerSearch.trim().toLowerCase();
    return this.assets.filter((a) => !q || `${a.tag} ${a.name}`.toLowerCase().includes(q));
  }

  place(name: string): Place {
    return findPlace(name);
  }

  // ===== History rows =====

  /** All movements, newest first, with dwell time (time until the next movement). */
  get rows(): Row[] {
    const list = [...this.history.movements].sort((a, b) => b.at.localeCompare(a.at));
    return list.map((m, i) => ({
      ...m,
      place: this.place(m.location),
      dwell: i === 0 ? null : Math.round((parseLocal(list[i - 1].at).getTime() - parseLocal(m.at).getTime()) / 60_000),
    }));
  }

  get current(): Row | undefined {
    return this.rows[0];
  }

  get currentZone(): string {
    return this.current?.place.zone ?? '';
  }

  get recent(): Row[] {
    return this.rows.slice(0, this.showAllRecent ? this.rows.length : 5);
  }

  fmtDwell(min: number | null): string {
    if (min === null) return '—';
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    return d ? `${d}d ${h}h ${pad(m)}m` : h ? `${h}h ${pad(m)}m` : `${m}m`;
  }

  get siteOptions(): string[] {
    return [...new Set(PLACES.map((p) => p.site))];
  }

  get zoneOptions(): string[] {
    return [...new Set(PLACES.filter((p) => !this.siteFilter || p.site === this.siteFilter).map((p) => p.zone))];
  }

  get typeOptions(): string[] {
    return [...new Set(PLACES.map((p) => p.type))];
  }

  get filtered(): Row[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter(
      (r) =>
        (!this.dateFrom || r.at.slice(0, 10) >= this.dateFrom) &&
        (!this.dateTo || r.at.slice(0, 10) <= this.dateTo) &&
        (!this.typeFilter || r.place.type === this.typeFilter) &&
        (!this.siteFilter || r.place.site === this.siteFilter) &&
        (!this.zoneFilter || r.place.zone === this.zoneFilter) &&
        (!this.movementFilter || r.movement === this.movementFilter) &&
        (!q || `${r.location} ${r.remarks} ${r.place.zone} ${r.source}`.toLowerCase().includes(q)),
    );
  }

  get pageRows(): Row[] {
    return this.filtered.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i);
  }

  get showingLabel(): string {
    const n = this.filtered.length;
    if (!n) return 'No records';
    return `Showing ${this.page * this.pageSize + 1} - ${Math.min(n, (this.page + 1) * this.pageSize)} of ${n} records`;
  }

  /** Row number in the full (filtered) list. */
  rowNo(i: number): number {
    return this.page * this.pageSize + i + 1;
  }

  onFilter(): void {
    this.page = 0;
  }

  onSite(): void {
    if (this.zoneFilter && !this.zoneOptions.includes(this.zoneFilter)) this.zoneFilter = '';
    this.onFilter();
  }

  get dateLabel(): string {
    if (!this.dateFrom && !this.dateTo) return 'Select Date Range';
    const f = (s: string) => parseLocal(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${this.dateFrom ? f(this.dateFrom) : '…'} – ${this.dateTo ? f(this.dateTo) : '…'}`;
  }

  clearDates(): void {
    this.dateFrom = this.dateTo = '';
    this.dateOpen = false;
    this.onFilter();
  }

  resetFilters(): void {
    this.dateFrom = this.dateTo = this.typeFilter = this.siteFilter = this.zoneFilter = this.search = '';
    this.movementFilter = '';
    this.menuOpen = '';
    this.onFilter();
  }

  get filtersActive(): boolean {
    return !!(this.dateFrom || this.dateTo || this.typeFilter || this.siteFilter || this.zoneFilter || this.movementFilter || this.search);
  }

  selectRow(r: Row): void {
    this.selectedId = this.selectedId === r.id ? null : r.id;
    this.view = 'map';
    if (this.selectedId !== null && r.place.lat) {
      this.mapZoom = Math.max(this.mapZoom, 16);
      this.center = { lat: r.place.lat, lng: r.place.lng };
    } else {
      this.fit();
    }
  }

  // ===== Map =====

  /** Map shows the four latest movements (and a highlighted older one) joined by the movement path. */
  private get mapRows(): Row[] {
    const list = this.rows.slice(0, 4);
    const sel = this.rows.find((r) => r.id === this.selectedId);
    if (sel && !list.some((r) => r.id === sel.id)) list.push(sel);
    return list.filter((r) => r.place.lat);
  }

  /** Tiles, pins, path and geofence for the current view; recomputed only when something they depend on changes. */
  get mapView(): MapView {
    const rows = this.mapRows;
    const key = [this.mapZoom, this.center.lat.toFixed(6), this.center.lng.toFixed(6), this.mapW, this.mapH, this.asset.tag, this.history.movements.length, this.selectedId].join('|');
    if (this.viewCache?.key === key) return this.viewCache.view;
    const z = this.mapZoom;
    const c = project(this.center.lat, this.center.lng, z);
    const left = c.x - this.mapW / 2;
    const top = c.y - this.mapH / 2;
    const at = (lat: number, lng: number) => {
      const p = project(lat, lng, z);
      return { x: Math.round(p.x - left), y: Math.round(p.y - top) };
    };
    const tiles: MapTile[] = [];
    const max = 2 ** z;
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + this.mapH) / TILE); ty++) {
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + this.mapW) / TILE); tx++) {
        if (ty < 0 || ty >= max) continue;
        const wx = ((tx % max) + max) % max;
        tiles.push({ key: `${z}/${wx}/${ty}`, url: TILE_URL(z, wx, ty), x: Math.round(tx * TILE - left), y: Math.round(ty * TILE - top) });
      }
    }
    const latest = this.current;
    const seen = new Set<string>();
    const pins: MapPinView[] = [];
    // Several visits to one place share a pin; it shows the latest visit
    for (const r of rows) {
      if (seen.has(r.location)) continue;
      seen.add(r.location);
      pins.push({ row: r, ...at(r.place.lat, r.place.lng), current: r.id === latest?.id, when: r.at });
    }
    pins.sort((a, b) => Number(a.current) - Number(b.current));
    const path = [...rows].sort((a, b) => a.at.localeCompare(b.at)).map((r) => at(r.place.lat, r.place.lng)).map((p) => `${p.x},${p.y}`).join(' ');
    const fence = GEOFENCE.map(([lat, lng]) => at(lat, lng)).map((p) => `${p.x},${p.y}`).join(' ');
    const view = { tiles, pins, path, fence };
    this.viewCache = { key, view };
    return view;
  }

  trackTile(_: number, t: MapTile): string {
    return t.key;
  }

  trackPin(_: number, p: MapPinView): number {
    return p.row.id;
  }

  tileFailed(key: string): void {
    this.failedTiles.add(key);
  }

  pinClick(p: MapPinView): void {
    this.selectedId = p.row.id;
  }

  /** Zooms and centres so every recent location is in view. */
  fit(): void {
    const rows = this.mapRows;
    if (!rows.length) return;
    this.fitted = true;
    const lats = rows.map((r) => r.place.lat);
    const lngs = rows.map((r) => r.place.lng);
    const n = Math.max(...lats);
    const sLat = Math.min(...lats);
    const e = Math.max(...lngs);
    const w = Math.min(...lngs);
    // Room for the labels beside the pins and the legend in the corner
    const availW = Math.max(120, this.mapW - 300);
    const availH = Math.max(80, this.mapH - 100);
    let z = 18;
    for (; z > MIN_ZOOM; z--) {
      const a = project(n, w, z);
      const b = project(sLat, e, z);
      if (b.x - a.x <= availW && b.y - a.y <= availH) break;
    }
    this.mapZoom = z;
    const a = project(n, w, z);
    const b = project(sLat, e, z);
    // Centre a little left of the middle, so labels to the right of the pins stay in view
    this.center = unproject((a.x + b.x) / 2 + 60, (a.y + b.y) / 2 - 10, z);
  }

  zoom(delta: number): void {
    this.mapZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.mapZoom + delta));
  }

  setView(v: 'map' | 'list'): void {
    this.view = v;
  }

  // Drag to pan
  onMapDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) return;
    const c = project(this.center.lat, this.center.lng, this.mapZoom);
    this.drag = { x: event.clientX, y: event.clientY, cx: c.x, cy: c.y, id: event.pointerId };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onMapMove(event: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== event.pointerId) return;
    this.center = unproject(d.cx - (event.clientX - d.x), d.cy - (event.clientY - d.y), this.mapZoom);
  }

  onMapUp(event: PointerEvent): void {
    if (this.drag?.id === event.pointerId) this.drag = null;
  }

  /** Arrow keys pan the map, + and - zoom. */
  onMapKey(event: KeyboardEvent): void {
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === '+' || event.key === '=') this.zoom(1);
    else if (event.key === '-') this.zoom(-1);
    else if (moves[event.key]) {
      const c = project(this.center.lat, this.center.lng, this.mapZoom);
      this.center = unproject(c.x + moves[event.key][0], c.y + moves[event.key][1], this.mapZoom);
    } else return;
    event.preventDefault();
  }

  // ===== Record movement =====

  openRecord(): void {
    this.menuOpen = '';
    const now = new Date();
    this.recordError = '';
    this.recordForm = { location: '', movement: 'In', at: stamp(now), source: 'Manual Update', remarks: '' };
  }

  saveRecord(): void {
    const f = this.recordForm;
    if (!f) return;
    const error = recordMovement(this.asset, { at: f.at, location: f.location, movement: f.movement, source: f.source, remarks: f.remarks.trim() || 'Location updated', by: CURRENT_USER });
    if (error) return void (this.recordError = error);
    this.recordForm = null;
    this.page = 0;
    this.fit();
    this.showToast(`${this.asset.tag} moved to ${f.location}.`);
  }

  // ===== Export =====

  export(): void {
    const rows = this.filtered.map((r, i) => ({
      '#': i + 1, 'Date & Time': r.at.replace('T', ' '), Location: r.location, Site: r.place.site, 'Zone / Area': r.place.zone, 'Location Type': r.place.type,
      'Movement Type': r.movement, Source: r.source, Remarks: r.remarks, 'Dwell Time': this.fmtDwell(r.dwell), 'Recorded By': r.by,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Location History');
    XLSX.writeFile(book, `${this.asset.tag}_Location_History.xlsx`);
    this.menuOpen = '';
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
    this.menuOpen = '';
    this.dateOpen = this.pickerOpen = false;
    this.recordForm = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
