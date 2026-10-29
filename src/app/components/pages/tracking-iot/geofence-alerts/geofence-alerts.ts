import { Component, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  LucideIconData,
  ArrowDown,
  ArrowUp,
  Bell,
  Box,
  Boxes,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Ellipsis,
  Forklift,
  History,
  Layers,
  Locate,
  LogIn,
  LogOut,
  MapPin,
  Minus,
  Pencil,
  Pentagon,
  Plus,
  Power,
  Search,
  Settings,
  Shapes,
  ShieldAlert,
  ShoppingCart,
  Timer,
  Trash2,
  TriangleAlert,
  Truck,
  Wifi,
  Wrench,
  X,
} from 'lucide-angular';
import {
  ASSETS, ASSET_GROUPS, AlertEvent, AssetKind, BUILDINGS, CONDITIONS, EVENTS, EventStatus, EventType, GATEWAYS, MAP_H, MAP_W, PREV_MONITORED, PREV_OPEN,
  Pt, RULES, Rule, SCHEDULES, SEVERITIES, SITES, SITE_SLOTS, Severity, Slot, TEAMS, TREES, TRIGGERS, Trigger, UNITS_PER_100M, WORKFLOWS, ZONES, ZONE_COLORS,
  Zone, ZoneShape, ZoneType, assetGroup, startOfToday,
} from './geofence-data';
import type * as Leaflet from 'leaflet';
import { MapDrawTools } from '../../../shared/map-draw-tools/map-draw-tools';
import { GeofenceMap, MapAlert, MapMode } from './geofence-map';
import { LL, applySeedOutlines, areaM2, siteArea } from './geofence-geo';

type Tab = 'geofences' | 'rules' | 'history';
type RuleForm = Omit<Rule, 'id' | 'name' | 'zoneId' | 'enabled'>;
interface RuleDialog extends RuleForm { id: string; name: string; zoneId: string; enabled: boolean }
interface ZoneForm { id: string; name: string; type: ZoneType; site: string; color: string; groups: string[]; schedule: string; monitorEntry: boolean; monitorExit: boolean; dwellMin: number; shape: ZoneShape; points: number; drawn?: LL[] }
interface Geo { z: Zone; circle: boolean; cx: number; cy: number; r: number; pts: string; verts: Pt[]; lx: number; ly: number; lw: number }
interface Marker { key: string; x: number; y: number; d: string; title: string; sub: string }
interface Tip { x: number; y: number; title: string; sub: string }
interface Confirm { title: string; message: string; label: string; run: () => void }

/** Converts lucide icon nodes into one SVG path so markers can be drawn inside the map SVG. */
function iconPath(data: LucideIconData): string {
  const n = (v: string | number | undefined) => Number(v ?? 0);
  return data
    .map(([tag, a]) => {
      if (tag === 'path') return String(a['d']);
      if (tag === 'circle' || tag === 'ellipse') {
        const rx = n(a['r'] ?? a['rx']);
        const ry = n(a['r'] ?? a['ry']);
        const cx = n(a['cx']);
        const cy = n(a['cy']);
        return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
      }
      if (tag === 'rect') return `M${n(a['x'])} ${n(a['y'])}h${n(a['width'])}v${n(a['height'])}h${-n(a['width'])}Z`;
      if (tag === 'line') return `M${n(a['x1'])} ${n(a['y1'])}L${n(a['x2'])} ${n(a['y2'])}`;
      if (tag === 'polyline' || tag === 'polygon') return `M${String(a['points'])}${tag === 'polygon' ? 'Z' : ''}`;
      return '';
    })
    .join(' ');
}

const KIND_PATH: Record<AssetKind, string> = {
  Forklift: iconPath(Forklift),
  'Pallet Jack': iconPath(Forklift),
  Truck: iconPath(Truck),
  'Tool Cart': iconPath(ShoppingCart),
  'Mobile Tool': iconPath(Wrench),
};

const DEFAULT_RULE: RuleForm = {
  trigger: 'enter-exit', dwellMin: 5, severity: 'High', group: 'Forklifts', condition: 'During all hours',
  createAlert: true, notify: true, team: 'Security Team', workflow: true, workflowName: 'Restricted Zone Incident',
  inApp: true, email: true, push: false,
};

const LIST_PAGE = 5;
const HIST_PAGE = 10;

@Component({
  selector: 'app-geofence-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, GeofenceMap, MapDrawTools],
  templateUrl: './geofence-alerts.html',
  styleUrls: ['./geofence-alerts.css', './geofence-alerts-sections.css'],
})
export class GeofenceAlerts implements OnDestroy {
  readonly icons = { ArrowDown, ArrowUp, Bell, Box, Boxes, Building2, CalendarClock, Check, ChevronLeft, ChevronRight, Circle, Copy, Download, Ellipsis, History, Layers, Locate, LogIn, LogOut, MapPin, Minus, Pencil, Pentagon, Plus, Power, Search, Settings, Shapes, ShieldAlert, Timer, Trash2, TriangleAlert, Wifi, X };
  readonly sites = SITES;
  readonly groups = ASSET_GROUPS;
  readonly schedules = SCHEDULES;
  readonly teams = TEAMS;
  readonly workflows = WORKFLOWS;
  readonly conditions = CONDITIONS;
  readonly severities = SEVERITIES;
  readonly triggers = TRIGGERS;
  readonly colors = ZONE_COLORS;
  readonly zoneTypes: ZoneType[] = ['Allowed', 'Warning', 'Restricted'];
  readonly eventTypes: EventType[] = ['Entered', 'Exited', 'Dwell Exceeded'];
  readonly eventStatuses: EventStatus[] = ['Unacknowledged', 'Acknowledged', 'Assigned', 'Resolved'];
  readonly kindPaths = KIND_PATH;

  zones: Zone[] = ZONES;
  rules: Rule[] = RULES;
  events: AlertEvent[] = EVENTS;

  tab: Tab = 'geofences';
  selectedId = ZONES[0].id;
  menuOpen = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private seq = 100;

  // map
  satellite = false;
  drawMap: Leaflet.Map | null = null;
  showAssets = true;
  showGateways = true;
  showLabels = true;
  layersOpen = false;
  @ViewChild(GeofenceMap) private gmap?: GeofenceMap;
  mapMode: MapMode = 'view';
  editId = '';
  drawCount = 0;
  zoomInfo = { zoom: 16, min: 13, max: 20 };
  /** Site shown while drawing a zone for another site. */
  private drawSite = '';
  /** Zone form waiting for a shape drawn on the map. */
  private pendingForm: ZoneForm | null = null;
  private editDraft: LL[] | null = null;

  // list / filters
  listSearch = '';
  listSite = '';
  listPage = 0;
  ruleZone = '';
  ruleSearch = '';
  hDate: 'today' | 'yesterday' | '7d' | 'all' = 'all';
  hZone = '';
  hType = '';
  hStatus = '';
  hSearch = '';
  hPage = 0;

  // forms & dialogs
  builder: RuleForm = { ...DEFAULT_RULE };
  zoneForm: ZoneForm | null = null;
  ruleDialog: RuleDialog | null = null;
  assignOf: { ev: AlertEvent; owner: string } | null = null;
  confirmBox: Confirm | null = null;
  formError = '';

  constructor() {
    applySeedOutlines(this.zones);
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====
  get kpi() {
    const active = this.zones.filter((z) => z.status === 'Active');
    const activePrev = active.filter((z) => z.createdDaysAgo >= 30).length;
    const monitored = new Set(active.flatMap((z) => z.assetIds)).size;
    const t0 = startOfToday().getTime();
    const y0 = t0 - 86400000;
    const today = this.events.filter((e) => e.ts.getTime() >= t0).length;
    const yesterday = this.events.filter((e) => e.ts.getTime() >= y0 && e.ts.getTime() < t0).length;
    const open = this.events.filter((e) => e.status === 'Unacknowledged').length;
    return {
      active: active.length,
      activeDelta: active.length - activePrev,
      monitored,
      monitoredDelta: monitored - PREV_MONITORED,
      today,
      todayPct: yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : 0,
      open,
      openDelta: open - PREV_OPEN,
    };
  }

  signed(n: number, suffix = ''): string {
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${suffix}`;
  }

  // ===== selection =====
  get selected(): Zone | null {
    return this.zones.find((z) => z.id === this.selectedId) ?? this.zones[0] ?? null;
  }

  get selectedName(): string {
    return this.selected ? this.selected.name : '';
  }

  selectZone(z: Zone, recenter = false): void {
    if (this.mapMode !== 'view') return;
    this.selectedId = z.id;
    if (recenter) setTimeout(() => this.locate(), 50);
  }

  selectZoneById(id: string): void {
    const z = this.zoneById(id);
    if (z) this.selectZone(z);
  }

  zoneById(id: string): Zone | undefined {
    return this.zones.find((z) => z.id === id);
  }

  zoneColor(id: string): string {
    return this.zoneById(id)?.color ?? '#9ca3af';
  }

  ruleCount(z: Zone): number {
    return this.rules.filter((r) => r.zoneId === z.id).length;
  }

  shapeLabel(z: Zone): string {
    return z.shape === 'Circle' ? 'Circle' : `Polygon (${z.points} points)`;
  }

  lastEvent(z: Zone): Date | null {
    const e = this.events.find((x) => x.zoneId === z.id);
    return e ? e.ts : null;
  }

  fmtWhen(d: Date | null): string {
    if (!d) return '—';
    const t0 = startOfToday().getTime();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.getTime() >= t0) return hm;
    if (d.getTime() >= t0 - 86400000) return `Yesterday ${hm}`;
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${hm}`;
  }

  fmtStamp(d: Date): string {
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${this.fmtWhen(d).slice(-5)}`;
  }

  typeClass(t: ZoneType): string {
    return 'zt--' + t.toLowerCase();
  }

  evClass(t: EventType): string {
    return t === 'Entered' ? 'ev--in' : t === 'Exited' ? 'ev--out' : 'ev--dwell';
  }

  stClass(s: EventStatus): string {
    return 'st--' + s.toLowerCase();
  }

  sevClass(s: Severity): string {
    return 'sev--' + s.toLowerCase();
  }

  triggerLabel(t: Trigger, dwell = 0): string {
    if (t === 'dwell') return `Dwells longer than ${dwell} min`;
    return (TRIGGERS.find((x) => x.value === t)?.label ?? '').replace('When asset ', '').replace(/^./, (c) => c.toUpperCase());
  }

  actionsSummary(r: RuleForm): string {
    const out: string[] = [];
    if (r.createAlert) out.push('Create alert');
    if (r.notify) out.push(`Notify ${r.team}`);
    if (r.workflow) out.push(`Workflow: ${r.workflowName}`);
    return out.join(' · ') || 'No actions';
  }

  channels(r: RuleForm): string {
    return [r.inApp ? 'In-app' : '', r.email ? 'Email' : '', r.push ? 'Push' : ''].filter(Boolean).join(', ') || '—';
  }

  // ===== map =====
  get mapSite(): string {
    return this.drawSite || (this.selected ? this.selected.site : SITES[0]);
  }

  set mapSite(site: string) {
    const first = this.zones.find((z) => z.site === site);
    if (first) this.selectZone(first);
  }

  get mapArea(): string {
    return siteArea(this.mapSite);
  }

  /** Signature of everything the map draws; the map only redraws when it changes. */
  get mapRev(): string {
    const zs = this.zones.filter((z) => z.site === this.mapSite).map((z) => [z.id, z.name, z.type, z.color, z.status, z.shape, z.points, z.geoRev ?? 0, z.assetIds.length].join(':'));
    return zs.join('|') + '#' + this.mapAlerts.map((a) => a.key).join(',');
  }

  private alertCache: { sig: string; list: MapAlert[] } = { sig: '', list: [] };

  /** Open (unacknowledged) alerts, newest per zone. */
  get mapAlerts(): MapAlert[] {
    const open = this.events.filter((e) => e.status === 'Unacknowledged');
    const sig = open.map((e) => e.id).join(',');
    if (sig !== this.alertCache.sig) {
      const seen = new Set<string>();
      const list: MapAlert[] = [];
      for (const e of [...open].sort((a, b) => b.ts.getTime() - a.ts.getTime())) {
        if (seen.has(e.zoneId)) continue;
        seen.add(e.zoneId);
        list.push({ key: e.id, zoneId: e.zoneId, assetCode: e.assetCode, title: `${e.type}: ${e.assetCode}`, sub: `${e.zoneName} · ${this.fmtWhen(e.ts)} · Unacknowledged` });
      }
      this.alertCache = { sig, list };
    }
    return this.alertCache.list;
  }

  zoomIn(): void {
    this.gmap?.zoomIn();
  }

  zoomOut(): void {
    this.gmap?.zoomOut();
  }

  locate(): void {
    this.gmap?.locate();
  }

  resetView(): void {
    this.gmap?.resetView();
  }

  onAlertClick(): void {
    this.openHistory('all', 'Unacknowledged');
  }

  // ----- draw a new / replacement outline -----
  startDraw(): void {
    const f = this.zoneForm;
    if (!f) return;
    this.pendingForm = f;
    this.zoneForm = null;
    this.drawSite = f.site;
    this.drawCount = 0;
    this.mapMode = 'draw';
    this.tab = 'geofences';
  }

  onDrawDone(pts: LL[]): void {
    const f = this.pendingForm;
    this.mapMode = 'view';
    this.drawSite = '';
    this.pendingForm = null;
    if (!f) return;
    f.drawn = pts;
    f.shape = 'Polygon';
    f.points = pts.length;
    this.zoneForm = f;
    this.showToast(`Outline drawn: ${pts.length} points, about ${this.fmtArea(areaM2(pts))}.`);
  }

  finishDraw(): void {
    this.gmap?.finishDraw();
  }

  undoPoint(): void {
    this.gmap?.undoPoint();
  }

  cancelDraw(): void {
    this.mapMode = 'view';
    this.drawSite = '';
    this.zoneForm = this.pendingForm;
    this.pendingForm = null;
  }

  // ----- drag the corners of an existing zone -----
  canEditShape(z: Zone | null): boolean {
    return !!z && z.shape === 'Polygon';
  }

  startEditShape(z: Zone): void {
    this.menuOpen = '';
    if (!this.canEditShape(z)) return;
    this.selectedId = z.id;
    this.editId = z.id;
    this.editDraft = null;
    this.mapMode = 'edit';
    setTimeout(() => this.locate(), 50);
  }

  onEditChange(pts: LL[]): void {
    this.editDraft = pts;
  }

  saveShape(): void {
    const z = this.zoneById(this.editId);
    const pts = this.editDraft;
    this.mapMode = 'view';
    this.editId = '';
    this.editDraft = null;
    if (!z || !pts) return;
    z.latlngs = pts;
    z.points = pts.length;
    z.poly = undefined;
    z.slot = undefined;
    z.geoRev = (z.geoRev ?? 0) + 1;
    this.showToast(`“${z.name}” outline saved: ${pts.length} points, about ${this.fmtArea(areaM2(pts))}.`);
  }

  cancelShape(): void {
    this.mapMode = 'view';
    this.editId = '';
    this.editDraft = null;
  }

  fmtArea(m2: number): string {
    return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`;
  }

  drawnArea(f: ZoneForm): number {
    return f.drawn ? areaM2(f.drawn) : 0;
  }

  zoneArea(z: Zone): string {
    return z.latlngs?.length ? this.fmtArea(areaM2(z.latlngs)) : '';
  }

  // ===== geofence list =====
  get listFiltered(): Zone[] {
    const q = this.listSearch.trim().toLowerCase();
    return this.zones.filter((z) => (!this.listSite || z.site === this.listSite) && (!q || `${z.name} ${z.type} ${z.site}`.toLowerCase().includes(q)));
  }

  get listPages(): number {
    return Math.max(1, Math.ceil(this.listFiltered.length / LIST_PAGE));
  }

  get listRows(): Zone[] {
    const p = Math.min(this.listPage, this.listPages - 1);
    return this.listFiltered.slice(p * LIST_PAGE, p * LIST_PAGE + LIST_PAGE);
  }

  get listRange(): string {
    const n = this.listFiltered.length;
    if (!n) return '0 of 0';
    const p = Math.min(this.listPage, this.listPages - 1);
    return `${p * LIST_PAGE + 1}–${Math.min(n, p * LIST_PAGE + LIST_PAGE)} of ${n}`;
  }

  get listPageNo(): number {
    return Math.min(this.listPage, this.listPages - 1);
  }

  pageList(d: number): void {
    this.listPage = Math.min(Math.max(this.listPageNo + d, 0), this.listPages - 1);
  }

  showRules(z: Zone): void {
    this.ruleZone = z.id;
    this.ruleSearch = '';
    this.tab = 'rules';
  }

  // ===== zone actions =====
  openZone(z?: Zone): void {
    this.menuOpen = '';
    this.formError = '';
    this.zoneForm = z
      ? { id: z.id, name: z.name, type: z.type, site: z.site, color: z.color, groups: [...z.groups], schedule: z.schedule, monitorEntry: z.monitorEntry, monitorExit: z.monitorExit, dwellMin: z.dwellMin, shape: z.shape, points: z.points }
      : { id: '', name: '', type: 'Allowed', site: this.mapSite, color: ZONE_COLORS[0], groups: ['Forklifts'], schedule: SCHEDULES[0], monitorEntry: true, monitorExit: true, dwellMin: 10, shape: 'Polygon', points: 4 };
  }

  get editingDrawn(): boolean {
    const f = this.zoneForm;
    if (!f || !f.id) return false;
    const z = this.zoneById(f.id);
    return !!z && (!!z.poly || !!z.latlngs) && f.shape === 'Polygon' && f.site === z.site;
  }

  toggleFormGroup(g: string): void {
    const f = this.zoneForm;
    if (!f) return;
    f.groups = f.groups.includes(g) ? f.groups.filter((x) => x !== g) : [...f.groups, g];
  }

  setFormType(t: ZoneType): void {
    if (!this.zoneForm) return;
    this.zoneForm.type = t;
    if (!this.zoneForm.id) this.zoneForm.color = t === 'Restricted' ? '#dc2626' : t === 'Warning' ? '#eab308' : '#2563eb';
  }

  private fleetFor(site: string, groups: string[]): string[] {
    return ASSETS.filter((a) => a.site === site && (groups.includes('All assets') || groups.includes(assetGroup(a.kind)))).map((a) => a.id);
  }

  get formAssetCount(): number {
    const f = this.zoneForm;
    return f ? this.fleetFor(f.site, f.groups).length : 0;
  }

  private freeSlot(site: string, exceptId = ''): Slot {
    const used = this.zones.filter((z) => z.site === site && z.id !== exceptId && z.slot).map((z) => z.slot);
    const free = (SITE_SLOTS[site] ?? []).find((s) => !used.includes(s));
    if (free) return free;
    const k = used.length % 6;
    return { x: 300 + k * 26, y: 250 + k * 18, w: 150, h: 96 };
  }

  saveZone(): void {
    const f = this.zoneForm;
    if (!f) return;
    const name = f.name.trim();
    if (!name) { this.formError = 'Enter a zone name.'; return; }
    if (this.zones.some((z) => z.id !== f.id && z.site === f.site && z.name.toLowerCase() === name.toLowerCase())) { this.formError = `“${name}” already exists at ${f.site}.`; return; }
    if (!f.groups.length) { this.formError = 'Select at least one asset group.'; return; }
    const points = Math.min(12, Math.max(3, Math.round(f.points || 4)));
    const dwell = Math.max(1, Math.round(f.dwellMin || 1));
    const existing = f.id ? this.zoneById(f.id) : undefined;
    if (existing) {
      const groupsChanged = existing.site !== f.site || existing.groups.join() !== f.groups.join();
      const keepPoly = (!!existing.poly || !!existing.latlngs) && f.shape === 'Polygon' && f.site === existing.site;
      Object.assign(existing, { name, type: f.type, color: f.color, groups: f.groups, schedule: f.schedule, monitorEntry: f.monitorEntry, monitorExit: f.monitorExit, dwellMin: dwell, shape: f.shape });
      if (f.drawn) {
        existing.latlngs = f.drawn;
        existing.poly = undefined;
        existing.slot = undefined;
        existing.points = f.drawn.length;
      } else if (!keepPoly) {
        if (existing.poly || existing.latlngs || existing.site !== f.site) existing.slot = this.freeSlot(f.site, existing.id);
        existing.poly = undefined;
        existing.latlngs = undefined;
        existing.center = undefined;
        existing.radiusM = undefined;
        existing.points = points;
      }
      existing.geoRev = (existing.geoRev ?? 0) + 1;
      existing.site = f.site;
      if (groupsChanged) existing.assetIds = this.fleetFor(f.site, f.groups);
      this.showToast(`Geofence “${name}” updated.`);
    } else {
      const z: Zone = {
        id: `gz-${++this.seq}`, name, type: f.type, site: f.site, status: 'Active', shape: f.shape, points, color: f.color, groups: f.groups,
        schedule: f.schedule, monitorEntry: f.monitorEntry, monitorExit: f.monitorExit, dwellMin: dwell, assetIds: this.fleetFor(f.site, f.groups),
        createdDaysAgo: 0, slot: f.drawn ? undefined : this.freeSlot(f.site), latlngs: f.drawn,
      };
      if (f.drawn) z.points = f.drawn.length;
      this.zones.push(z);
      this.selectZone(z);
      this.listSite = '';
      this.listSearch = '';
      this.listPage = this.listPages - 1;
      this.showToast(`Geofence “${name}” created at ${f.site} with ${z.assetIds.length} monitored assets.`);
    }
    this.zoneForm = null;
  }

  duplicateZone(z: Zone): void {
    this.menuOpen = '';
    const copy: Zone = { ...z, id: `gz-${++this.seq}`, name: `${z.name} (copy)`, groups: [...z.groups], assetIds: [...z.assetIds], poly: undefined, latlngs: undefined, center: undefined, radiusM: undefined, slot: this.freeSlot(z.site), createdDaysAgo: 0, status: 'Active', geoRev: 0 };
    this.zones.push(copy);
    const copied = this.rules.filter((r) => r.zoneId === z.id).map((r) => ({ ...r, id: this.nextRuleId(), zoneId: copy.id }));
    this.rules.push(...copied);
    this.selectedId = copy.id;
    this.showToast(`Duplicated “${z.name}” with ${copied.length} rule${copied.length === 1 ? '' : 's'}.`);
  }

  toggleZone(z: Zone): void {
    this.menuOpen = '';
    z.status = z.status === 'Active' ? 'Disabled' : 'Active';
    this.showToast(`“${z.name}” ${z.status === 'Active' ? 'enabled — monitoring resumed' : 'disabled — no alerts will be raised'}.`);
  }

  deleteZone(z: Zone): void {
    this.menuOpen = '';
    const n = this.ruleCount(z);
    this.confirmBox = {
      title: 'Delete geofence',
      message: `Delete “${z.name}” (${z.site}) and its ${n} alert rule${n === 1 ? '' : 's'}? Past events are kept in the history.`,
      label: 'Delete',
      run: () => {
        this.zones = this.zones.filter((x) => x.id !== z.id);
        this.rules = this.rules.filter((r) => r.zoneId !== z.id);
        if (this.selectedId === z.id) this.selectedId = this.zones[0] ? this.zones[0].id : '';
        if (this.ruleZone === z.id) this.ruleZone = '';
        this.showToast(`Geofence “${z.name}” deleted.`);
      },
    };
  }

  toggleMonitor(z: Zone, which: 'entry' | 'exit'): void {
    if (which === 'entry') z.monitorEntry = !z.monitorEntry;
    else z.monitorExit = !z.monitorExit;
    const on = which === 'entry' ? z.monitorEntry : z.monitorExit;
    this.showToast(`Asset ${which} monitoring ${on ? 'enabled' : 'disabled'} for “${z.name}”.`);
  }

  // ===== rules =====
  private nextRuleId(): string {
    const max = this.rules.reduce((m, r) => Math.max(m, Number(r.id.slice(3)) || 0), 0);
    return `AR-${String(max + 1).padStart(3, '0')}`;
  }

  private autoName(f: RuleForm): string {
    if (f.trigger === 'dwell') return `${f.group} dwell over ${f.dwellMin} min`;
    const verb = f.trigger === 'enter' ? 'entry' : f.trigger === 'exit' ? 'exit' : 'entry / exit';
    return `${f.group} ${verb}${f.condition === 'During all hours' ? '' : ' — ' + f.condition.toLowerCase()}`;
  }

  saveBuilder(): void {
    const z = this.selected;
    if (!z) return;
    if (!this.builder.createAlert && !this.builder.notify && !this.builder.workflow) { this.showToast('Choose at least one action for the rule.'); return; }
    const rule: Rule = { ...this.builder, id: this.nextRuleId(), name: this.autoName(this.builder), zoneId: z.id, enabled: true };
    this.rules.push(rule);
    this.showToast(`Rule ${rule.id} “${rule.name}” saved to ${z.name} (${this.ruleCount(z)} rules).`);
  }

  resetBuilder(): void {
    this.builder = { ...DEFAULT_RULE };
  }

  get rulesFiltered(): Rule[] {
    const q = this.ruleSearch.trim().toLowerCase();
    return this.rules.filter((r) => (!this.ruleZone || r.zoneId === this.ruleZone) && (!q || `${r.id} ${r.name} ${this.zoneName(r.zoneId)} ${r.group}`.toLowerCase().includes(q)));
  }

  get enabledRules(): number {
    return this.rules.filter((r) => r.enabled).length;
  }

  zoneName(id: string): string {
    return this.zoneById(id)?.name ?? '—';
  }

  openRule(r?: Rule): void {
    this.menuOpen = '';
    this.formError = '';
    const zoneId = r ? r.zoneId : this.ruleZone || this.selectedId;
    this.ruleDialog = r ? { ...r } : { ...DEFAULT_RULE, id: '', name: '', zoneId, enabled: true };
  }

  saveRuleDialog(): void {
    const d = this.ruleDialog;
    if (!d) return;
    if (!d.zoneId) { this.formError = 'Choose a geofence.'; return; }
    if (!d.createAlert && !d.notify && !d.workflow) { this.formError = 'Choose at least one action.'; return; }
    const name = d.name.trim() || this.autoName(d);
    if (d.id) {
      const r = this.rules.find((x) => x.id === d.id);
      if (r) Object.assign(r, { ...d, name });
      this.showToast(`Rule ${d.id} updated.`);
    } else {
      const r: Rule = { ...d, id: this.nextRuleId(), name };
      this.rules.push(r);
      this.showToast(`Rule ${r.id} “${name}” added to ${this.zoneName(r.zoneId)}.`);
    }
    this.ruleDialog = null;
  }

  toggleRule(r: Rule): void {
    r.enabled = !r.enabled;
    this.showToast(`Rule ${r.id} ${r.enabled ? 'enabled' : 'paused'}.`);
  }

  deleteRule(r: Rule): void {
    this.confirmBox = {
      title: 'Delete alert rule',
      message: `Delete rule ${r.id} “${r.name}” on ${this.zoneName(r.zoneId)}?`,
      label: 'Delete',
      run: () => {
        this.rules = this.rules.filter((x) => x.id !== r.id);
        this.showToast(`Rule ${r.id} deleted.`);
      },
    };
  }

  // ===== events =====
  get recentEvents(): AlertEvent[] {
    return this.events.slice(0, 5);
  }

  get historyRows(): AlertEvent[] {
    const t0 = startOfToday().getTime();
    const from = this.hDate === 'today' ? t0 : this.hDate === 'yesterday' ? t0 - 86400000 : this.hDate === '7d' ? t0 - 6 * 86400000 : 0;
    const to = this.hDate === 'yesterday' ? t0 : Infinity;
    const q = this.hSearch.trim().toLowerCase();
    return this.events.filter((e) => {
      const t = e.ts.getTime();
      return t >= from && t < to && (!this.hZone || e.zoneId === this.hZone) && (!this.hType || e.type === this.hType) && (!this.hStatus || e.status === this.hStatus) && (!q || `${e.id} ${e.assetCode} ${e.assetKind} ${e.zoneName} ${e.owner}`.toLowerCase().includes(q));
    });
  }

  get hPages(): number {
    return Math.max(1, Math.ceil(this.historyRows.length / HIST_PAGE));
  }

  get hPageNo(): number {
    return Math.min(this.hPage, this.hPages - 1);
  }

  get historyPage(): AlertEvent[] {
    return this.historyRows.slice(this.hPageNo * HIST_PAGE, this.hPageNo * HIST_PAGE + HIST_PAGE);
  }

  get hRange(): string {
    const n = this.historyRows.length;
    if (!n) return '0 of 0';
    return `${this.hPageNo * HIST_PAGE + 1}–${Math.min(n, this.hPageNo * HIST_PAGE + HIST_PAGE)} of ${n}`;
  }

  pageHist(d: number): void {
    this.hPage = Math.min(Math.max(this.hPageNo + d, 0), this.hPages - 1);
  }

  get openInView(): number {
    return this.historyRows.filter((e) => e.status === 'Unacknowledged').length;
  }

  openHistory(date: 'today' | 'all', status = ''): void {
    this.hDate = date;
    this.hStatus = status;
    this.hZone = '';
    this.hType = '';
    this.hSearch = '';
    this.hPage = 0;
    this.tab = 'history';
  }

  clearHistoryFilters(): void {
    this.openHistory('all');
  }

  acknowledge(e: AlertEvent): void {
    this.menuOpen = '';
    e.status = 'Acknowledged';
    this.showToast(`${e.assetCode} alert at ${e.zoneName} acknowledged.`);
  }

  acknowledgeAll(): void {
    const open = this.historyRows.filter((e) => e.status === 'Unacknowledged');
    open.forEach((e) => (e.status = 'Acknowledged'));
    this.showToast(`${open.length} alert${open.length === 1 ? '' : 's'} acknowledged.`);
  }

  openAssign(e: AlertEvent): void {
    this.menuOpen = '';
    this.assignOf = { ev: e, owner: e.owner };
  }

  saveAssign(): void {
    const a = this.assignOf;
    if (!a) return;
    a.ev.owner = a.owner;
    a.ev.status = 'Assigned';
    this.showToast(`${a.ev.assetCode} alert assigned to ${a.owner}.`);
    this.assignOf = null;
  }

  resolve(e: AlertEvent): void {
    this.menuOpen = '';
    e.status = 'Resolved';
    this.showToast(`${e.assetCode} alert at ${e.zoneName} resolved.`);
  }

  reopen(e: AlertEvent): void {
    this.menuOpen = '';
    e.status = 'Unacknowledged';
    this.showToast(`${e.assetCode} alert reopened.`);
  }

  viewZone(e: AlertEvent): void {
    this.menuOpen = '';
    const z = this.zoneById(e.zoneId);
    if (!z) { this.showToast(`“${e.zoneName}” no longer exists.`); return; }
    this.tab = 'geofences';
    this.selectZone(z, true);
  }

  exportHistory(): void {
    const rows = this.historyRows.map((e) => ({
      'Event ID': e.id, Timestamp: e.ts.toLocaleString('en-GB'), Asset: e.assetCode, 'Asset Type': e.assetKind, Geofence: e.zoneName,
      Site: this.zoneById(e.zoneId)?.site ?? '', Event: e.type, 'Duration (min)': e.durationMin ?? '', Owner: e.owner, Status: e.status,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Events');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.zones.map((z) => ({ Geofence: z.name, Type: z.type, Site: z.site, Status: z.status, 'Monitored Assets': z.assetIds.length, Rules: this.ruleCount(z) }))), 'Geofences');
    XLSX.writeFile(book, `Geofence_Events_${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.showToast(`Exported ${rows.length} events to Excel.`);
  }

  // ===== shared =====
  runConfirm(): void {
    const c = this.confirmBox;
    this.confirmBox = null;
    if (c) c.run();
  }

  toggleMenu(name: string, e: Event): void {
    e.stopPropagation();
    this.layersOpen = false;
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
    this.layersOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mapMode === 'draw') { this.cancelDraw(); return; }
    if (this.mapMode === 'edit') { this.cancelShape(); return; }
    this.menuOpen = '';
    this.layersOpen = false;
    this.zoneForm = null;
    this.ruleDialog = null;
    this.assignOf = null;
    this.confirmBox = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
