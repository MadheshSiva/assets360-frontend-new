import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { Observable, catchError, forkJoin, of, switchMap } from 'rxjs';
import {
  LucideAngularModule,
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
  Timer,
  Trash2,
  TriangleAlert,
  Wifi,
  X,
} from 'lucide-angular';
import {
  AlertEvent, CONDITIONS, EVENT_STATUSES, EventStatus, Rule, SEVERITIES, Severity, TRIGGERS, Trigger,
  Zone, ZoneShape, ZoneType, startOfToday,
} from './geofence-data';
import type * as Leaflet from 'leaflet';
import { apiErrorMessage } from '../shared/tracking-api';
import { MapDrawTools } from '../shared/map-draw-tools/map-draw-tools';
import { GeofenceMap, MapAlert, MapMode } from './geofence-map';
import { LL, areaM2 } from './geofence-geo';
import { DEFAULT_GEOFENCE_OPTIONS, GeofenceApiService, GeofenceOptionsDto, SiteOption } from './geofence-api.service';
import { AlertRuleApiService } from './alert-rule-api.service';
import { IoTAlertApiService, IoTAlertDto, IoTAlertStatus, toAlertEvent } from './iot-alert-api.service';

type Tab = 'geofences' | 'rules' | 'history';
type RuleForm = Omit<Rule, 'id' | 'name' | 'zoneId' | 'enabled'>;
interface RuleDialog extends RuleForm { id: string; name: string; zoneId: string; enabled: boolean }
interface ZoneForm { id: string; name: string; type: ZoneType; site: string; color: string; groups: string[]; schedule: string; monitorEntry: boolean; monitorExit: boolean; dwellMin: number | null; shape: ZoneShape | ''; points: number; drawn?: LL[] }
interface Confirm { title: string; message: string; label: string; run: () => void }

/** Default colour per zone type (matches the API's map colours). */
const TYPE_COLOR: Record<ZoneType, string> = { Allowed: '#2563EB', Warning: '#F5B40B', Restricted: '#EF4444' };

const DEFAULT_RULE: RuleForm = {
  trigger: '' as Trigger, dwellMin: 5, severity: '' as Severity, group: '', condition: '',
  createAlert: true, notify: false, team: '', workflow: false, workflowName: '',
  inApp: true, email: true, push: false,
};

const LIST_PAGE = 5;
const HIST_PAGE = 10;
/** Alerts are re-polled this often (ms). */
const ALERT_POLL_MS = 30_000;
/** Alert event types that belong to geofences even when no rule id is set. */
const GEOFENCE_EVENT = /geofence|zone|dwell|enter|exit/i;

@Component({
  selector: 'app-geofence-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, GeofenceMap, MapDrawTools],
  templateUrl: './geofence-alerts.html',
  styleUrls: ['./geofence-alerts.css', './geofence-alerts-sections.css', '../shared/iot-purple-theme.css'],
})
export class GeofenceAlerts implements OnInit, OnDestroy {
  readonly icons = { ArrowDown, ArrowUp, Bell, Box, Boxes, Building2, CalendarClock, Check, ChevronLeft, ChevronRight, Circle, Copy, Download, Ellipsis, History, Layers, Locate, LogIn, LogOut, MapPin, Minus, Pencil, Pentagon, Plus, Power, Search, Settings, Shapes, ShieldAlert, Timer, Trash2, TriangleAlert, Wifi, X };
  readonly conditions = CONDITIONS;
  readonly severities = SEVERITIES;
  readonly triggers = TRIGGERS;
  readonly eventStatuses = EVENT_STATUSES;
  /** Teams / workflows have no API list yet; the inputs accept free text (suggestions from existing rules). */
  get teams(): string[] {
    return [...new Set(this.rules.map((r) => r.team).filter(Boolean))].sort();
  }
  get workflows(): string[] {
    return [...new Set(this.rules.map((r) => r.workflowName).filter(Boolean))].sort();
  }

  private readonly geofenceApi = inject(GeofenceApiService);
  private readonly ruleApi = inject(AlertRuleApiService);
  private readonly alertApi = inject(IoTAlertApiService);

  // option lists (GET /api/geofences/options, /api/iot-alerts/options)
  options: GeofenceOptionsDto = DEFAULT_GEOFENCE_OPTIONS;
  private alertEventTypes: string[] = [];
  private masterSites: SiteOption[] = [];

  get groups(): string[] {
    return this.options.assetGroups;
  }
  get schedules(): string[] {
    return this.options.schedules;
  }
  get colors(): string[] {
    return this.options.mapColours;
  }
  get zoneTypes(): ZoneType[] {
    return this.options.zoneTypes as ZoneType[];
  }
  get shapes(): ZoneShape[] {
    return this.options.shapes as ZoneShape[];
  }

  zones: Zone[] = [];
  rules: Rule[] = [];
  events: AlertEvent[] = [];
  private alertRows: IoTAlertDto[] = [];

  loading = false;
  loadError = '';
  saving = false;

  tab: Tab = 'geofences';
  selectedId = '';
  menuOpen = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;

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
  zoomInfo = { zoom: 2, min: 2, max: 20 };
  /** Site shown while drawing a zone for another site. */
  private drawSite = '';
  /** Site picked in the map's site selector when it has no zone to select. */
  private pickedSite = '';
  /** Zone form waiting for a shape drawn on the map. */
  private pendingForm: ZoneForm | null = null;
  private editDraft: LL[] | null = null;

  // list / filters
  listSearch = '';
  listSite = '';
  listPage = 0;
  ruleZone = '';
  ruleSearch = '';
  hDate: '' | 'today' | 'yesterday' | '7d' | 'all' = '';
  hZone = '';
  hType = '';
  hStatus = '';
  hSearch = '';
  hPage = 0;

  // forms & dialogs
  builder: RuleForm = { ...DEFAULT_RULE };
  zoneForm: ZoneForm | null = null;
  ruleDialog: RuleDialog | null = null;
  confirmBox: Confirm | null = null;
  formError = '';

  ngOnInit(): void {
    this.load();
    this.pollTimer = setInterval(() => this.loadAlerts(true), ALERT_POLL_MS);
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
    clearInterval(this.pollTimer);
  }

  // ===== loading =====
  load(): void {
    this.loading = true;
    this.loadError = '';
    forkJoin({
      zones: this.geofenceApi.list(),
      rules: this.ruleApi.list(),
      options: this.geofenceApi.options().pipe(catchError(() => of(DEFAULT_GEOFENCE_OPTIONS))),
      sites: this.geofenceApi.sites(),
      alertOptions: this.alertApi.options().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ zones, rules, options, sites, alertOptions }) => {
        this.zones = zones;
        this.rules = rules;
        this.options = options;
        this.masterSites = sites;
        this.alertEventTypes = alertOptions?.eventTypes ?? [];
        if (!this.zoneById(this.selectedId)) this.selectedId = zones[0]?.id ?? '';
        if (this.builder.group && !this.groups.includes(this.builder.group)) this.builder.group = '';
        this.loading = false;
        this.loadAlerts();
      },
      error: (err) => {
        this.loading = false;
        this.loadError = apiErrorMessage(err, 'Could not load geofences.');
        this.showToast(this.loadError);
      },
    });
  }

  /** Alerts raised by geofence rules (or with a geofence event type), newest first. */
  loadAlerts(silent = false): void {
    this.alertApi.list().subscribe({
      next: (rows) => {
        this.alertRows = rows;
        this.rebuildEvents();
      },
      error: (err) => {
        if (!silent) this.showToast(apiErrorMessage(err, 'Could not load alerts.'));
      },
    });
  }

  private rebuildEvents(): void {
    const ruleIds = new Set(this.rules.map((r) => r.id));
    this.events = this.alertRows
      .filter((a) => (a.alertRuleId && ruleIds.has(a.alertRuleId)) || GEOFENCE_EVENT.test(a.eventType ?? ''))
      .map((a) => toAlertEvent(a, (ruleId) => this.zoneOfRule(ruleId)))
      .sort((a, b) => b.ts.getTime() - a.ts.getTime());
  }

  private zoneOfRule(ruleId: string): { id: string; name: string } | null {
    const r = this.rules.find((x) => x.id === ruleId);
    const z = r ? this.zoneById(r.zoneId) : undefined;
    return z ? { id: z.id, name: z.name } : null;
  }

  private replaceZone(z: Zone): void {
    const i = this.zones.findIndex((x) => x.id === z.id);
    if (i >= 0) this.zones[i] = { ...z, geoRev: (this.zones[i].geoRev ?? 0) + 1 };
    else this.zones.push(z);
    this.zones = [...this.zones];
  }

  private fail(err: unknown, fallback: string): void {
    this.saving = false;
    this.showToast(apiErrorMessage(err, fallback));
  }

  // ===== options =====
  get sites(): string[] {
    return [...new Set([...this.masterSites.map((s) => s.name), ...this.zones.map((z) => z.site)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  get eventTypes(): string[] {
    return [...new Set([...this.alertEventTypes, ...this.events.map((e) => e.type)])];
  }

  private siteIdOf(name: string): string | null {
    return this.masterSites.find((s) => s.name === name)?.id ?? this.zones.find((z) => z.site === name && z.siteId)?.siteId ?? null;
  }

  // ===== KPIs =====
  get kpi() {
    const active = this.zones.filter((z) => z.status === 'Active');
    const activePrev = active.filter((z) => z.createdDaysAgo === null || z.createdDaysAgo >= 30).length;
    const monitored = active.reduce((t, z) => t + z.monitoredCount, 0);
    const t0 = startOfToday().getTime();
    const y0 = t0 - 86400000;
    const today = this.events.filter((e) => e.ts.getTime() >= t0).length;
    const yesterday = this.events.filter((e) => e.ts.getTime() >= y0 && e.ts.getTime() < t0).length;
    const open = this.events.filter((e) => e.status === 'Unacknowledged').length;
    return {
      active: active.length,
      activeDelta: active.length - activePrev,
      monitored,
      today,
      todayPct: yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : 0,
      open,
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
    this.pickedSite = '';
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
    if (z.shape === 'Circle') return z.radiusM ? `Circle (${Math.round(z.radiusM)} m radius)` : 'Circle (not placed)';
    if (!z.latlngs?.length) return `${z.shape} (not drawn)`;
    return z.shape === 'Rectangle' ? 'Rectangle' : `Polygon (${z.points} points)`;
  }

  /** Newest alert at the zone, else the zone's own last-event stamp. */
  lastEvent(z: Zone): Date | null {
    const e = this.events.find((x) => x.zoneId === z.id);
    if (e && (!z.lastEventAt || e.ts > z.lastEventAt)) return e.ts;
    return z.lastEventAt;
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

  evClass(t: string): string {
    return /dwell|remain/i.test(t) ? 'ev--dwell' : /exit|left|depart/i.test(t) ? 'ev--out' : 'ev--in';
  }

  stClass(s: EventStatus): string {
    return 'st--' + s.toLowerCase();
  }

  sevClass(s: Severity): string {
    return 'sev--' + s.toLowerCase();
  }

  triggerLabel(t: Trigger, dwell = 0): string {
    if (t === 'dwell') return `Remains longer than ${dwell} min`;
    return (TRIGGERS.find((x) => x.value === t)?.label ?? '').replace('When asset ', '').replace(/^./, (c) => c.toUpperCase());
  }

  actionsSummary(r: RuleForm): string {
    const out: string[] = [];
    if (r.createAlert) out.push('Create alert');
    if (r.notify) out.push(`Notify ${r.team || 'team'}`);
    if (r.workflow) out.push(`Workflow: ${r.workflowName || '—'}`);
    return out.join(' · ') || 'No actions';
  }

  channels(r: RuleForm): string {
    return [r.inApp ? 'In-app' : '', r.email ? 'Email' : '', r.push ? 'Push' : ''].filter(Boolean).join(', ') || '—';
  }

  // ===== map =====
  get mapSite(): string {
    return this.drawSite || this.pickedSite || (this.selected ? this.selected.site : this.sites[0] ?? '');
  }

  set mapSite(site: string) {
    const first = this.zones.find((z) => z.site === site);
    if (first) this.selectZone(first);
    else this.pickedSite = site;
  }

  get mapArea(): string {
    return this.mapSite;
  }

  /** Signature of everything the map draws; the map only redraws when it changes. */
  get mapRev(): string {
    const zs = this.zones.filter((z) => z.site === this.mapSite).map((z) => [z.id, z.name, z.type, z.color, z.status, z.shape, z.points, z.geoRev ?? 0, z.monitoredCount].join(':'));
    return zs.join('|') + '#' + this.mapAlerts.map((a) => a.key).join(',');
  }

  private alertCache: { sig: string; list: MapAlert[] } = { sig: '', list: [] };

  /** Open (unacknowledged) alerts, newest per zone. */
  get mapAlerts(): MapAlert[] {
    const open = this.events.filter((e) => e.status === 'Unacknowledged' && e.zoneId);
    const sig = open.map((e) => e.id).join(',');
    if (sig !== this.alertCache.sig) {
      const seen = new Set<string>();
      const list: MapAlert[] = [];
      for (const e of open) {
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
    if (!f.site) { this.formError = 'Choose a site before drawing the outline.'; return; }
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
    this.formError = '';
    if (f.shape === 'Rectangle' && pts.length !== 4) {
      this.formError = `A rectangle needs exactly 4 corners; ${pts.length} were drawn.`;
    } else if (pts.length > this.options.maxPolygonPoints) {
      this.formError = `A zone can have at most ${this.options.maxPolygonPoints} corners.`;
    } else {
      f.drawn = pts;
      if (f.shape === 'Circle') f.shape = 'Polygon';
      f.points = pts.length;
      this.showToast(`Outline drawn: ${pts.length} points, about ${this.fmtArea(areaM2(pts))}.`);
    }
    this.zoneForm = f;
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
    return !!z && z.shape === 'Polygon' && !!z.latlngs?.length;
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
    this.geofenceApi.update({ ...z, latlngs: pts, points: pts.length }).subscribe({
      next: (saved) => {
        this.replaceZone(saved);
        this.showToast(`“${z.name}” outline saved: ${pts.length} points, about ${this.fmtArea(areaM2(pts))}.`);
      },
      error: (err) => {
        this.replaceZone(z);
        this.fail(err, 'Could not save the outline.');
      },
    });
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
    if (z.shape === 'Circle' && z.radiusM) return this.fmtArea(Math.PI * z.radiusM * z.radiusM);
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
      ? { id: z.id, name: z.name, type: z.type, site: z.site, color: z.color, groups: [...z.groups], schedule: z.schedule, monitorEntry: z.monitorEntry, monitorExit: z.monitorExit, dwellMin: z.dwellMin, shape: z.shape, points: z.points || this.options.defaultPolygonPoints }
      : { id: '', name: '', type: 'Allowed', site: '', color: TYPE_COLOR.Allowed, groups: this.groups.slice(0, 1), schedule: '', monitorEntry: true, monitorExit: true, dwellMin: 10, shape: '', points: this.options.defaultPolygonPoints };
  }

  get editingDrawn(): boolean {
    const f = this.zoneForm;
    if (!f || !f.id) return false;
    const z = this.zoneById(f.id);
    return !!z && !!z.latlngs?.length && f.shape !== 'Circle';
  }

  /** Monitored asset count of the zone being edited (the API keeps this figure; new zones start at 0). */
  get formAssetCount(): number | null {
    const f = this.zoneForm;
    return f?.id ? this.zoneById(f.id)?.monitoredCount ?? null : null;
  }

  toggleFormGroup(g: string): void {
    const f = this.zoneForm;
    if (!f) return;
    f.groups = f.groups.includes(g) ? f.groups.filter((x) => x !== g) : [...f.groups, g];
  }

  setFormType(t: ZoneType): void {
    if (!this.zoneForm) return;
    this.zoneForm.type = t;
    if (!this.zoneForm.id) this.zoneForm.color = TYPE_COLOR[t];
  }

  saveZone(): void {
    const f = this.zoneForm;
    if (!f || this.saving) return;
    const name = f.name.trim();
    if (!name) { this.formError = 'Enter a zone name.'; return; }
    if (!f.site) { this.formError = 'Choose a site.'; return; }
    if (!f.schedule) { this.formError = 'Choose a schedule.'; return; }
    if (!f.shape) { this.formError = 'Choose a shape.'; return; }
    if (this.zones.some((z) => z.id !== f.id && z.site === f.site && z.name.toLowerCase() === name.toLowerCase())) { this.formError = `“${name}” already exists at ${f.site}.`; return; }
    if (!f.groups.length) { this.formError = 'Select at least one asset group.'; return; }
    const { minPolygonPoints: min, maxPolygonPoints: max } = this.options;
    const points = Math.min(max, Math.max(min, Math.round(f.points || this.options.defaultPolygonPoints)));
    const dwell = f.dwellMin === null || (f.dwellMin as unknown) === '' ? null : Math.max(1, Math.round(f.dwellMin));
    const existing = f.id ? this.zoneById(f.id) : undefined;
    const base: Zone = existing
      ? { ...existing }
      : { id: '', name, type: f.type, site: f.site, siteId: null, status: 'Active', shape: f.shape, points, color: f.color, groups: [], schedule: f.schedule, monitorEntry: true, monitorExit: true, dwellMin: null, monitoredCount: 0, lastEventAt: null, createdDaysAgo: 0 };
    const zone: Zone = {
      ...base, name, type: f.type, site: f.site, siteId: this.siteIdOf(f.site), color: f.color, groups: f.groups, schedule: f.schedule,
      monitorEntry: f.monitorEntry, monitorExit: f.monitorExit, dwellMin: dwell, shape: f.shape, points,
    };
    if (f.shape === 'Circle') {
      zone.latlngs = undefined;
      if (existing?.shape !== 'Circle') { zone.center = undefined; zone.radiusM = undefined; }
    } else {
      zone.center = undefined;
      zone.radiusM = undefined;
      if (f.drawn) zone.latlngs = f.drawn;
      if (zone.latlngs?.length) zone.points = zone.latlngs.length;
      if (f.shape === 'Rectangle' && zone.latlngs && zone.latlngs.length !== 4) zone.latlngs = undefined;
    }
    this.saving = true;
    this.formError = '';
    const req = existing ? this.geofenceApi.update(zone) : this.geofenceApi.create(zone);
    req.subscribe({
      next: (saved) => {
        this.saving = false;
        this.replaceZone(saved);
        this.zoneForm = null;
        this.pickedSite = '';
        if (existing) {
          this.showToast(`Geofence “${name}” updated.`);
        } else {
          this.selectedId = saved.id;
          this.listSite = '';
          this.listSearch = '';
          this.listPage = this.listPages - 1;
          this.showToast(`Geofence “${name}” created at ${saved.site}.`);
        }
      },
      error: (err) => {
        this.saving = false;
        this.formError = apiErrorMessage(err, 'Could not save the geofence.');
      },
    });
  }

  duplicateZone(z: Zone): void {
    this.menuOpen = '';
    let name = `${z.name} (copy)`;
    for (let i = 2; this.zones.some((x) => x.site === z.site && x.name.toLowerCase() === name.toLowerCase()); i++) name = `${z.name} (copy ${i})`;
    const zoneRules = this.rules.filter((r) => r.zoneId === z.id);
    this.geofenceApi
      .create({ ...z, id: '', name, status: 'Active', lastEventAt: null })
      .pipe(
        switchMap((copy) => {
          this.replaceZone(copy);
          this.selectedId = copy.id;
          const reqs = zoneRules.map(({ id: _id, ...r }) => this.ruleApi.create({ ...r, zoneId: copy.id }));
          return reqs.length ? forkJoin(reqs) : of([] as Rule[]);
        }),
      )
      .subscribe({
        next: (copied) => {
          this.rules = [...this.rules, ...copied];
          this.showToast(`Duplicated “${z.name}” with ${copied.length} rule${copied.length === 1 ? '' : 's'}.`);
        },
        error: (err) => this.fail(err, 'Could not duplicate the geofence.'),
      });
  }

  private patchZone(z: Zone, patch: Partial<Zone>, message: (saved: Zone) => string): void {
    this.geofenceApi.update({ ...z, ...patch }).subscribe({
      next: (saved) => {
        this.replaceZone(saved);
        this.showToast(message(saved));
      },
      error: (err) => this.fail(err, 'Could not update the geofence.'),
    });
  }

  toggleZone(z: Zone): void {
    this.menuOpen = '';
    this.patchZone(z, { status: z.status === 'Active' ? 'Disabled' : 'Active' }, (s) => `“${s.name}” ${s.status === 'Active' ? 'enabled — monitoring resumed' : 'disabled — no alerts will be raised'}.`);
  }

  deleteZone(z: Zone): void {
    this.menuOpen = '';
    const zoneRules = this.rules.filter((r) => r.zoneId === z.id);
    const n = zoneRules.length;
    this.confirmBox = {
      title: 'Delete geofence',
      message: `Delete “${z.name}” (${z.site}) and its ${n} alert rule${n === 1 ? '' : 's'}? Past alerts are kept in the history.`,
      label: 'Delete',
      run: () => {
        const deletes: Observable<unknown> = n ? forkJoin(zoneRules.map((r) => this.ruleApi.delete(r.id))) : of(null);
        deletes.pipe(switchMap(() => this.geofenceApi.delete(z.id))).subscribe({
          next: () => {
            this.zones = this.zones.filter((x) => x.id !== z.id);
            this.rules = this.rules.filter((r) => r.zoneId !== z.id);
            if (this.selectedId === z.id) this.selectedId = this.zones[0] ? this.zones[0].id : '';
            if (this.ruleZone === z.id) this.ruleZone = '';
            this.rebuildEvents();
            this.showToast(`Geofence “${z.name}” deleted.`);
          },
          error: (err) => {
            // some rules may already be gone: reload rules so the list matches the server
            this.ruleApi.list().subscribe({ next: (rules) => (this.rules = rules), error: () => undefined });
            this.fail(err, 'Could not delete the geofence.');
          },
        });
      },
    };
  }

  toggleMonitor(z: Zone, which: 'entry' | 'exit'): void {
    const patch = which === 'entry' ? { monitorEntry: !z.monitorEntry } : { monitorExit: !z.monitorExit };
    this.patchZone(z, patch, (s) => `Asset ${which} monitoring ${(which === 'entry' ? s.monitorEntry : s.monitorExit) ? 'enabled' : 'disabled'} for “${s.name}”.`);
  }

  // ===== rules =====
  private autoName(f: RuleForm): string {
    if (f.trigger === 'dwell') return `${f.group} dwell over ${f.dwellMin} min`;
    const verb = f.trigger === 'enter' ? 'entry' : f.trigger === 'exit' ? 'exit' : 'entry / exit';
    return `${f.group} ${verb}${f.condition === CONDITIONS[0] ? '' : ' — ' + f.condition.toLowerCase()}`;
  }

  private ruleProblem(f: RuleForm): string {
    if (!f.trigger) return 'Choose a trigger.';
    if (!f.severity) return 'Choose a severity.';
    if (!f.createAlert && !f.notify && !f.workflow) return 'Choose at least one action for the rule.';
    if (!f.group) return 'Choose an asset group.';
    if (!f.condition) return 'Choose a condition.';
    if (f.trigger === 'dwell' && !(f.dwellMin >= 1)) return 'Enter the dwell time in minutes.';
    if (f.notify && !f.team.trim()) return 'Enter the team to notify.';
    if (f.workflow && !f.workflowName.trim()) return 'Enter the workflow to start.';
    return '';
  }

  saveBuilder(): void {
    const z = this.selected;
    if (!z || this.saving) return;
    const problem = this.ruleProblem(this.builder);
    if (problem) { this.showToast(problem); return; }
    this.saving = true;
    this.ruleApi.create({ ...this.builder, name: this.autoName(this.builder), zoneId: z.id, enabled: true }).subscribe({
      next: (rule) => {
        this.saving = false;
        this.rules = [...this.rules, rule];
        this.showToast(`Rule “${rule.name}” saved to ${z.name} (${this.ruleCount(z)} rules).`);
      },
      error: (err) => this.fail(err, 'Could not save the alert rule.'),
    });
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
    const zoneId = r ? r.zoneId : this.ruleZone || this.selected?.id || '';
    this.ruleDialog = r ? { ...r } : { ...DEFAULT_RULE, id: '', name: '', zoneId, enabled: true };
  }

  saveRuleDialog(): void {
    const d = this.ruleDialog;
    if (!d || this.saving) return;
    if (!d.zoneId) { this.formError = 'Choose a geofence.'; return; }
    const problem = this.ruleProblem(d);
    if (problem) { this.formError = problem; return; }
    const name = d.name.trim() || this.autoName(d);
    this.saving = true;
    this.formError = '';
    const req = d.id ? this.ruleApi.update({ ...d, name }) : this.ruleApi.create({ ...d, name });
    req.subscribe({
      next: (saved) => {
        this.saving = false;
        this.rules = d.id ? this.rules.map((r) => (r.id === saved.id ? saved : r)) : [...this.rules, saved];
        this.ruleDialog = null;
        this.showToast(d.id ? `Rule “${saved.name}” updated.` : `Rule “${saved.name}” added to ${this.zoneName(saved.zoneId)}.`);
      },
      error: (err) => {
        this.saving = false;
        this.formError = apiErrorMessage(err, 'Could not save the alert rule.');
      },
    });
  }

  toggleRule(r: Rule): void {
    this.ruleApi.update({ ...r, enabled: !r.enabled }).subscribe({
      next: (saved) => {
        this.rules = this.rules.map((x) => (x.id === saved.id ? saved : x));
        this.showToast(`Rule “${saved.name}” ${saved.enabled ? 'enabled' : 'paused'}.`);
      },
      error: (err) => this.fail(err, 'Could not update the alert rule.'),
    });
  }

  deleteRule(r: Rule): void {
    this.confirmBox = {
      title: 'Delete alert rule',
      message: `Delete rule “${r.name}” on ${this.zoneName(r.zoneId)}?`,
      label: 'Delete',
      run: () =>
        this.ruleApi.delete(r.id).subscribe({
          next: () => {
            this.rules = this.rules.filter((x) => x.id !== r.id);
            this.showToast(`Rule “${r.name}” deleted.`);
          },
          error: (err) => this.fail(err, 'Could not delete the alert rule.'),
        }),
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
      return t >= from && t < to && (!this.hZone || e.zoneId === this.hZone) && (!this.hType || e.type === this.hType) && (!this.hStatus || e.status === this.hStatus) && (!q || `${e.id} ${e.assetCode} ${e.assetSub} ${e.zoneName} ${e.owner} ${e.message}`.toLowerCase().includes(q));
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

  /** PATCH /api/iot-alerts/{alertId}/status for each event, then refresh the rows from the responses. */
  private setStatus(list: AlertEvent[], status: IoTAlertStatus, done: (n: number) => string): void {
    this.menuOpen = '';
    if (!list.length) return;
    forkJoin(list.map((e) => this.alertApi.setStatus(e.id, status))).subscribe({
      next: (rows) => {
        const byId = new Map(rows.map((r) => [r.alertId, r]));
        this.alertRows = this.alertRows.map((r) => byId.get(r.alertId) ?? r);
        this.rebuildEvents();
        this.showToast(done(rows.length));
      },
      error: (err) => {
        this.loadAlerts(true);
        this.fail(err, 'Could not update the alert status.');
      },
    });
  }

  acknowledge(e: AlertEvent): void {
    this.setStatus([e], 'Acknowledged', () => `${e.assetCode} alert${e.zoneId ? ' at ' + e.zoneName : ''} acknowledged.`);
  }

  acknowledgeAll(): void {
    this.setStatus(this.historyRows.filter((e) => e.status === 'Unacknowledged'), 'Acknowledged', (n) => `${n} alert${n === 1 ? '' : 's'} acknowledged.`);
  }

  startProgress(e: AlertEvent): void {
    this.setStatus([e], 'In Progress', () => `${e.assetCode} alert marked in progress.`);
  }

  resolve(e: AlertEvent): void {
    this.setStatus([e], 'Resolved', () => `${e.assetCode} alert${e.zoneId ? ' at ' + e.zoneName : ''} resolved.`);
  }

  reopen(e: AlertEvent): void {
    this.setStatus([e], 'Open', () => `${e.assetCode} alert reopened.`);
  }

  viewZone(e: AlertEvent): void {
    this.menuOpen = '';
    const z = this.zoneById(e.zoneId);
    if (!z) { this.showToast('This alert is not linked to a geofence.'); return; }
    this.tab = 'geofences';
    this.selectZone(z, true);
  }

  exportHistory(): void {
    const rows = this.historyRows.map((e) => ({
      'Alert ID': e.id, Timestamp: e.ts.toLocaleString('en-GB'), Asset: e.assetCode, 'Asset Name': e.assetSub, Geofence: e.zoneName,
      Site: this.zoneById(e.zoneId)?.site ?? '', Event: e.type, Severity: e.severity, Message: e.message, Owner: e.owner, Status: e.status,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Events');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.zones.map((z) => ({ Geofence: z.name, Type: z.type, Site: z.site, Status: z.status, 'Monitored Assets': z.monitoredCount, Rules: this.ruleCount(z) }))), 'Geofences');
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
    this.confirmBox = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
