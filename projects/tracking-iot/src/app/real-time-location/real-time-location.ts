import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  Bell,
  Box,
  Building2,
  ChevronDown,
  Clock,
  Crosshair,
  Eye,
  Forklift,
  Globe,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Minus,
  Package,
  Pause,
  Play,
  Plus,
  Route,
  Search,
  Settings,
  ShieldAlert,
  Signal,
  Tag,
  TriangleAlert,
  Wifi,
  X,
} from 'lucide-angular';
import {
  ASSETS, AssetState, GEOFENCE_PREFIX, LngLat, LocEvent, TrackedAsset, ZONES, Zone, circleRing, distanceM, isAlert, isLowConfidence, placeOf, setGeofenceZones,
} from './location-data';
import { apiErrorMessage } from '../shared/tracking-api';
import { GeofenceApiService } from '../geofence-alerts/geofence-api.service';
import { AlertRuleApiService } from '../geofence-alerts/alert-rule-api.service';
import { Zone as Geofence, CONDITIONS } from '../geofence-alerts/geofence-data';
import { LocationEventApiService } from './location-event-api.service';
import { MdmBuilding, MdmFloor, MdmSite, TelemetryReadApi } from '../tracking-telemetry/telemetry-api';
import { Subscription, forkJoin } from 'rxjs';
import { FloorLayout, FloorLayoutApi, LayoutPlot, RegisteredAsset } from './floor-layout-api';

/** Rows shown in the Locate Asset list (search narrows it down). */
const LOCATE_MAX_ROWS = 50;
import { LivePosition, MapLayers, RlMap, stateColor } from './rl-map';

type StatusFilter = '' | AssetState | 'alerts';
interface AlertForm { assetId: string; rule: '' | 'enter' | 'exit' | 'dwell' | 'boundary'; zone: string; minutes: number; notify: string }

/** Location events are re-polled this often (ms). */
const EVENT_POLL_MS = 15_000;

/** Geofence → zone shape used by the floor map and zone look-ups (circles become a ring). */
function geofenceZone(g: Geofence): Zone {
  const ring: LngLat[] = g.center && g.radiusM ? circleRing(g.center.lng, g.center.lat, g.radiusM) : (g.latlngs ?? []).map((p) => [p.lng, p.lat] as LngLat);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
  return {
    id: GEOFENCE_PREFIX + g.id, name: g.name, color: g.color, kind: 'zone', type: g.type + ' geofence', rule: g.status === 'Active' ? g.schedule : 'Disabled',
    restricted: g.type === 'Restricted', hidden: ring.length < 4, ring,
  };
}

const RULE_LABEL: Record<Exclude<AlertForm['rule'], ''>, string> = { enter: 'Enters zone', exit: 'Leaves zone', dwell: 'Dwells longer than', boundary: 'Comes within 3 m of boundary' };

@Component({
  selector: 'app-real-time-location',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RlMap],
  templateUrl: './real-time-location.html',
  styleUrls: ['./real-time-location.css', './real-time-location-panels.css', '../shared/iot-purple-theme.css'],
})
export class RealTimeLocation implements OnInit, OnDestroy {
  readonly icons = { Bell, Box, Building2, ChevronDown, Clock, Crosshair, Eye, Forklift, Globe, Info, Layers, LocateFixed, MapPin, Minus, Package, Pause, Play, Plus, Route, Search, Settings, ShieldAlert, Signal, Tag, TriangleAlert, Wifi, X };
  /** Master Data floors and buildings (all sites). */
  private allFloors: MdmFloor[] = [];
  private allBuildings: MdmBuilding[] = [];
  /** Floors for the Facility Map picker: those of the chosen site, else of the chosen country, else all. */
  get levels(): MdmFloor[] {
    if (this.site) return this.allFloors.filter((f) => this.floorSiteId(f) === this.site);
    if (this.country) {
      const ids = new Set(this.sites.map((s) => s.id));
      return this.allFloors.filter((f) => ids.has(this.floorSiteId(f)));
    }
    return this.allFloors;
  }
  /** Countries used by the Master Data sites (Organization › Site address), for the Country picker. */
  countries: string[] = [];
  /** Master Data sites (all countries). */
  private allSites: MdmSite[] = [];
  /** Sites of the chosen country (all sites when no country is chosen). */
  get sites(): MdmSite[] {
    const c = this.country.trim().toLowerCase();
    return c ? this.allSites.filter((s) => (s.country ?? '').toLowerCase() === c) : this.allSites;
  }
  /** Floor-plan zones plus geofences from the API. */
  get zones(): Zone[] {
    return ZONES;
  }
  /** Geofences with an outline, for the map. */
  geoZones: Zone[] = [];
  readonly ruleLabel = RULE_LABEL;
  readonly types = [...new Set(ASSETS.map((a) => a.type))].sort();

  @ViewChild(RlMap) private mapRef?: RlMap;
  private readonly router = inject(Router);
  private readonly eventApi = inject(LocationEventApiService);
  private readonly geofenceApi = inject(GeofenceApiService);
  private readonly ruleApi = inject(AlertRuleApiService);
  private readonly mdm = inject(TelemetryReadApi);
  private readonly layoutApi = inject(FloorLayoutApi);
  /** Zones / plots drawn in Maps & Floor Plans, per floor id (loaded on first view). */
  private layouts = new Map<string, FloorLayout | null>();
  private layoutSub?: Subscription;

  /** Chosen country ('' = all countries) and site (Master Data site id, '' = all sites of the country). */
  country = '';
  site = '';
  /** Floor shown on the Facility Map (Master Data floor id). */
  level = '';
  /** Seconds since the page opened; drives "updated N sec ago" and last-seen ages. */
  tick = 0;
  /** Location events poll cycle, seconds. */
  readonly refresh = EVENT_POLL_MS / 1000;
  /** Tick of the last successful events refresh (-1 = never). */
  private refreshedAt = -1;
  loadingEvents = false;
  eventsError = '';
  saving = false;
  layers: MapLayers = { zones: true, labels: true, gateways: true, trails: true, assets: true };
  imagery = false;
  layersOpen = false;

  search = '';
  typeFilter = '';
  statusFilter: StatusFilter = '';
  zoneFilter = '';

  selectedId = '';
  flPos: LivePosition | null = null;
  replaying = false;
  eventsAll = false;
  locateOpen = false;
  locateQuery = '';
  /** Registered assets for Locate Asset (loaded when the dialog first opens). */
  registered: RegisteredAsset[] = [];
  loadingRegistered = false;
  registeredError = '';
  alertForm: AlertForm | null = null;
  formError = '';
  toast = '';

  private events: LocEvent[] = [];
  /** Recorded positions of the selected asset over the last 30 minutes, oldest first (empty until loaded). */
  readonly trail: { at: number; lng: number; lat: number; place: string }[] = [];
  private timer = setInterval(() => this.tick++, 1000);
  private pollTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.loadEvents();
    this.loadGeofences();
    this.loadPlaces();
    this.pollTimer = setInterval(() => this.loadEvents(true), EVENT_POLL_MS);
  }

  /** Countries, sites, buildings and floors from Master Data for the pickers and the floor plan. */
  private loadPlaces(): void {
    forkJoin({ countries: this.mdm.countries(), sites: this.mdm.sites(), buildings: this.mdm.buildings(), floors: this.mdm.floors() }).subscribe(({ countries, sites, buildings, floors }) => {
      this.allSites = [...sites].sort((a, b) => a.name.localeCompare(b.name));
      this.allBuildings = buildings;
      this.allFloors = [...floors].sort((a, b) => this.floorLabel(a).localeCompare(this.floorLabel(b), undefined, { numeric: true }));
      this.pickFloor();
      // the countries endpoint, plus any country only found on the sites (case-insensitive, sorted)
      const seen = new Map<string, string>();
      for (const c of [...countries, ...sites.map((s) => s.country ?? '')]) if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
      this.countries = [...seen.values()].sort((a, b) => a.localeCompare(b));
    });
  }

  /** Country changed: the site picker shows that country's sites; a site from another country is cleared. */
  onCountry(): void {
    if (this.site && !this.sites.some((s) => s.id === this.site)) this.site = '';
    this.pickFloor();
  }

  /** "Building · Floor" for the floor picker. */
  floorLabel(f: MdmFloor): string {
    return f.buildingName ? `${f.buildingName} · ${f.name}` : f.name;
  }

  /** Site of a floor: its own, else its building's. */
  private floorSiteId(f: MdmFloor): string {
    return f.siteId || this.allBuildings.find((b) => b.id === f.buildingId)?.siteId || '';
  }

  /** Keeps the chosen floor when it is still listed, else the first floor with a plan (or the first floor). */
  private pickFloor(): void {
    const list = this.levels;
    if (!list.some((f) => f.id === this.level)) this.level = (list.find((f) => f.image) ?? list[0])?.id ?? '';
    this.showFloor(false);
  }

  /**
   * Puts the chosen floor on the map: its plan image (Maps & Floor Plans plan, else the Master Data floor image) where
   * the floor (else its building / site) is, with the zones, assets and devices drawn on it in Maps & Floor Plans.
   */
  private showFloor(tell: boolean, after?: (layout: FloorLayout | null) => void): void {
    const f = this.allFloors.find((x) => x.id === this.level);
    this.layoutSub?.unsubscribe();
    if (!f) {
      this.mapRef?.showFloorPlan(null);
      return;
    }
    const draw = (layout: FloorLayout | null) => {
      after?.(layout);
      // the plan from Maps & Floor Plans first, then the Master Data floor image (Maps & Floor Plans does the same)
      const urls = [...new Set([layout?.imageUrl, f.image].filter((u): u is string => !!u))];
      if (!urls.length && !layout) {
        this.mapRef?.showFloorPlan(null);
        if (tell) this.showToast(`No floor plan is uploaded for ${this.floorLabel(f)}. Add one in Master Data › Building / Floor / Zone or Administration › Maps & Floor Plans.`);
        return;
      }
      const b = this.allBuildings.find((x) => x.id === f.buildingId);
      const s = this.allSites.find((x) => x.id === this.floorSiteId(f));
      const at = [f, b, s].find((p) => p && p.lat !== null && p.lng !== null);
      this.mapRef?.showFloorPlan({
        urls, name: this.floorLabel(f), lat: at?.lat ?? null, lng: at?.lng ?? null, area: f.area,
        widthM: layout?.widthM ?? null, heightM: layout?.heightM ?? null, zones: layout?.zones ?? [], plots: layout?.plots ?? [],
      });
    };
    if (this.layouts.has(f.id)) return draw(this.layouts.get(f.id) ?? null);
    // show the plan straight away, then again with its zones and plots once they arrive
    if (f.image) {
      const pending = after;
      after = undefined;
      draw(null);
      after = pending;
    }
    this.layoutSub = this.layoutApi.layout(f.id).subscribe((layout) => {
      this.layouts.set(f.id, layout);
      if (this.level === f.id) draw(layout);
    });
  }

  /** GET /api/location-events (newest first). */
  loadEvents(silent = false): void {
    if (!silent) this.loadingEvents = true;
    this.eventApi.list().subscribe({
      next: (rows) => {
        this.events = rows.sort((a, b) => b.at - a.at);
        this.loadingEvents = false;
        this.eventsError = '';
        this.refreshedAt = this.tick;
      },
      error: (err) => {
        this.loadingEvents = false;
        const msg = apiErrorMessage(err, 'Could not load location events.');
        if (!silent || !this.eventsError) this.showToast(msg);
        this.eventsError = msg;
      },
    });
  }

  /** Geofences drawn on the map and offered in the zone filter / alert form. */
  private loadGeofences(): void {
    this.geofenceApi.list().subscribe({
      next: (list) => {
        const zones = list.map(geofenceZone);
        setGeofenceZones(zones);
        this.geoZones = zones.filter((z) => !z.hidden);
      },
      error: (err) => this.showToast(apiErrorMessage(err, 'Could not load geofences.')),
    });
  }
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    this.layoutSub?.unsubscribe();
    clearInterval(this.timer);
    clearInterval(this.pollTimer);
    clearTimeout(this.toastTimer);
  }

  // ===== KPIs =====

  get kpi() {
    let moving = 0, stationary = 0, alerts = 0;
    for (const a of ASSETS) {
      if (a.state === 'moving') moving++;
      else if (a.state === 'stationary') stationary++;
      if (isAlert(a)) alerts++;
    }
    return { total: ASSETS.length, moving, stationary, alerts };
  }

  setStatus(s: StatusFilter): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
  }

  /** Seconds since location events were last refreshed (null before the first load). */
  get updatedSec(): number | null {
    return this.refreshedAt < 0 ? null : this.tick - this.refreshedAt;
  }

  // ===== asset list =====

  /** Current position: the live position when the map reports one for this asset, otherwise the last fix. */
  posOf(a: TrackedAsset): { lng: number; lat: number } {
    return this.flPos?.id === a.id ? this.flPos : a;
  }

  zoneName(a: TrackedAsset): string {
    if (this.flPos?.id === a.id) return placeOf(this.flPos.lng, this.flPos.lat).split(' / ')[0];
    return placeOf(a.lng, a.lat).split(' / ')[0];
  }

  /** Seconds since the last fix right now (ages from the value reported when the page opened). */
  seenSec(a: TrackedAsset): number {
    return a.seenSec + this.tick;
  }

  ago(sec: number): string {
    if (sec < 60) return `${sec} sec ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    const h = Math.floor(sec / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }

  dotColor(a: TrackedAsset): string {
    return stateColor(a);
  }

  stateLabel(a: TrackedAsset): string {
    if (a.state === 'breach') return 'Geofence breach';
    if (a.state === 'stationary' && isLowConfidence(a)) return 'Stationary (low confidence)';
    return a.state[0].toUpperCase() + a.state.slice(1);
  }

  get rows(): TrackedAsset[] {
    const q = this.search.trim().toLowerCase();
    return ASSETS.filter((a) =>
      (!this.typeFilter || a.type === this.typeFilter) &&
      (!this.statusFilter || (this.statusFilter === 'alerts' ? isAlert(a) : a.state === this.statusFilter)) &&
      (!this.zoneFilter || this.zoneName(a) === this.zoneFilter) &&
      (!q || `${a.id} ${a.name} ${a.device} ${a.type}`.toLowerCase().includes(q)));
  }

  get hasFilters(): boolean {
    return !!(this.search || this.typeFilter || this.statusFilter || this.zoneFilter);
  }

  clearFilters(): void {
    this.search = this.typeFilter = this.zoneFilter = '';
    this.statusFilter = '';
  }

  trackId(_: number, a: TrackedAsset): string {
    return a.id;
  }

  // ===== selection =====

  get selected(): TrackedAsset | null {
    return ASSETS.find((a) => a.id === this.selectedId) ?? null;
  }

  select(id: string): void {
    this.selectedId = id;
    this.locateOpen = false;
  }

  onLive(p: LivePosition): void {
    this.flPos = p;
  }

  place(a: TrackedAsset): string {
    const p = this.posOf(a);
    return placeOf(p.lng, p.lat);
  }

  confidence(a: TrackedAsset): string {
    return a.accuracy < 4 ? 'High' : a.accuracy < 8 ? 'Medium' : 'Low';
  }

  speedText(a: TrackedAsset): string {
    return a.state === 'moving' ? `${a.speed} m/s (${(a.speed * 3.6).toFixed(1)} km/h)` : '0 m/s (stationary)';
  }

  clock(ms: number, seconds = false): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}${seconds ? ':' + p(d.getSeconds()) : ''}`;
  }

  fixTime(a: TrackedAsset): string {
    const d = new Date(Date.now() - this.seenSec(a) * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${this.clock(d.getTime(), true)}`;
  }

  /** Device fix vs the asset's own registered fix; only available while the map reports a live position for the asset. */
  get comparison(): { dev: { lng: number; lat: number; acc: number; sec: number }; reg: { lng: number; lat: number; acc: number; sec: number }; dist: number } | null {
    const a = this.selected;
    if (!a) return null;
    if (this.flPos?.id !== a.id) return null;
    const dev = { ...this.posOf(a), acc: a.accuracy, sec: this.seenSec(a) };
    const reg = { lng: this.flPos.regLng, lat: this.flPos.regLat, acc: a.accuracy, sec: this.seenSec(a) };
    return { dev, reg, dist: Math.round(distanceM(dev, reg) * 10) / 10 };
  }

  coord(n: number): string {
    return n.toFixed(6);
  }

  /** Last 30 minutes of recorded positions for the selected asset. */
  get trailPoints(): { at: number; place: string; moved: boolean }[] {
    if (!this.selected) return [];
    return this.trail.map((p, i) => ({ at: p.at, place: p.place, moved: i > 0 && p.place !== this.trail[i - 1].place }));
  }

  // ===== actions =====

  setLayer(key: string, on: boolean): void {
    this.layers = { ...this.layers, [key as keyof MapLayers]: on };
  }

  zoomIn(): void {
    this.mapRef?.zoomIn();
  }

  zoomOut(): void {
    this.mapRef?.zoomOut();
  }

  locate(): void {
    this.mapRef?.locate();
  }

  /** Site changed: its country becomes the chosen country (when none was chosen). */
  onSite(id: string): void {
    const s = this.allSites.find((x) => x.id === id);
    if (s?.country && !this.country) this.country = this.countries.find((c) => c.toLowerCase() === s.country!.toLowerCase()) ?? s.country;
    this.site = id;
    this.pickFloor();
  }

  onLevel(id: string): void {
    this.level = id;
    this.showFloor(true);
  }

  /** Registered assets matching the search (tag, ID, name, category, type or location). */
  get locateResults(): RegisteredAsset[] {
    const q = this.locateQuery.trim().toLowerCase();
    const list = q
      ? this.registered.filter((a) => [a.tag, a.regId, a.name, a.category, a.type, a.location].some((v) => v.toLowerCase().includes(q)))
      : this.registered;
    return list.slice(0, LOCATE_MAX_ROWS);
  }

  get locateTotal(): number {
    const q = this.locateQuery.trim();
    return q ? this.locateResults.length : this.registered.length;
  }

  openLocate(): void {
    this.locateOpen = true;
    this.locateQuery = '';
    if (this.registered.length || this.loadingRegistered) return;
    this.loadingRegistered = true;
    this.registeredError = '';
    this.layoutApi.registeredAssets().subscribe({
      next: (rows) => {
        this.registered = rows.sort((a, b) => (a.tag || a.name).localeCompare(b.tag || b.name, undefined, { numeric: true }));
        this.loadingRegistered = false;
      },
      error: (err) => {
        this.loadingRegistered = false;
        this.registeredError = apiErrorMessage(err, 'Could not load the registered assets.');
      },
    });
  }

  /** True when a plot on a floor plan is this registered asset. */
  private isPlotOf(p: LayoutPlot, a: RegisteredAsset): boolean {
    return p.kind === 'asset' && (p.id === a.regId || p.id === a.id || (!!a.tag && p.code === a.tag));
  }

  /**
   * Shows the asset on the map: the floor it is plotted on (a floor already loaded, else the floor in its registration)
   * and zooms to it. Says so when the asset hasn't been plotted on a floor plan yet.
   */
  locateRegistered(a: RegisteredAsset): void {
    this.locateOpen = false;
    const label = a.tag ? `${a.tag} · ${a.name}` : a.name;
    const notPlotted = () =>
      this.showToast(`${label} is not plotted on a floor plan yet${a.location ? ` (registered at ${a.location})` : ''}. Plot it in Administration › Maps & Floor Plans.`);
    for (const [floorId, layout] of this.layouts) {
      const plot = layout?.plots.find((p) => this.isPlotOf(p, a));
      if (plot) return this.goToPlot(floorId, plot.id);
    }
    const same = (x: string, y: string) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();
    const floor = this.allFloors.find((f) => same(f.name, a.floor) && (!a.building || same(f.buildingName, a.building)));
    if (!floor) return notPlotted();
    this.goToPlot(floor.id, '', (layout) => {
      const plot = layout?.plots.find((p) => this.isPlotOf(p, a));
      if (plot) this.mapRef?.focusPlot(plot.id);
      else notPlotted();
    });
  }

  /** Switches the map to a floor (clearing a country / site filter that hides it) and zooms to a plotted item. */
  private goToPlot(floorId: string, plotId: string, after?: (layout: FloorLayout | null) => void): void {
    if (!this.levels.some((f) => f.id === floorId)) {
      this.country = '';
      this.site = '';
    }
    if (plotId) this.mapRef?.focusPlot(plotId);
    if (this.level === floorId && this.layouts.has(floorId)) {
      after?.(this.layouts.get(floorId) ?? null);
      return;
    }
    this.level = floorId;
    this.showFloor(false, after);
  }

  configureGeofences(): void {
    this.router.navigate(['/tracking-iot/geofence-alerts']);
  }

  viewAsset(a: TrackedAsset): void {
    this.router.navigate(['/assets/status-condition'], { queryParams: { tag: a.id } });
  }

  trackHistory(a: TrackedAsset): void {
    if (this.trail.length < 2) {
      this.showToast(`No location history recorded for ${a.id} in the last 30 minutes.`);
      return;
    }
    this.replaying = true;
    this.mapRef?.replayHistory(this.trail.map((p) => [p.lng, p.lat] as LngLat));
    this.showToast(`Replaying ${a.id}: ${this.trail[0].place} → ${this.trail[this.trail.length - 1].place} (4× speed).`);
  }

  onReplayDone(): void {
    this.replaying = false;
  }

  openAlert(a: TrackedAsset): void {
    this.formError = '';
    this.alertForm = { assetId: a.id, rule: '', zone: '', minutes: 15, notify: '' };
  }

  /** Geofences the alert form can attach a rule to. */
  get alertZones(): Zone[] {
    return ZONES.filter((z) => z.id.startsWith(GEOFENCE_PREFIX));
  }

  /** Creates a geofence alert rule (POST /api/alert-rules) scoped to this asset; "within 3 m of boundary" has no API trigger. */
  saveAlert(): void {
    const f = this.alertForm;
    if (!f || this.saving) return;
    if (!f.rule) return void (this.formError = 'Choose a trigger.');
    if (f.rule === 'boundary') return void (this.formError = 'Boundary-distance alerts are not supported by the alert rule API yet.');
    if (f.rule === 'dwell' && !(f.minutes > 0)) return void (this.formError = 'Enter the dwell time in minutes.');
    const zone = this.alertZones.find((z) => z.id === f.zone);
    if (!zone) return void (this.formError = 'Choose a geofence.');
    if (!f.notify) return void (this.formError = 'Choose who to notify.');
    const meOnly = f.notify === 'Me only';
    const label = RULE_LABEL[f.rule].toLowerCase() + (f.rule === 'dwell' ? ' ' + f.minutes + ' min' : '');
    this.saving = true;
    this.formError = '';
    this.ruleApi.create({
      name: f.assetId + ' ' + label, zoneId: zone.id.slice(GEOFENCE_PREFIX.length), trigger: f.rule, dwellMin: f.minutes, severity: 'High', group: f.assetId,
      condition: CONDITIONS[0], createAlert: true, notify: !meOnly, team: meOnly ? '' : f.notify, workflow: false, workflowName: '', inApp: true, email: !meOnly, push: false, enabled: true,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.alertForm = null;
        this.showToast(`Alert rule created for ${f.assetId}: ${label} ${zone.name}.`);
      },
      error: (err) => {
        this.saving = false;
        this.formError = apiErrorMessage(err, 'Could not create the alert rule.');
      },
    });
  }

  // ===== events =====

  get shownEvents(): LocEvent[] {
    return this.eventsAll ? this.events : this.events.slice(0, 3);
  }

  get eventCount(): number {
    return this.events.length;
  }

  eventIcon(e: LocEvent) {
    return e.event === 'Geofence Alert' ? TriangleAlert : e.event === 'Dwell Exceeded' ? Clock : e.event === 'Entered Zone' ? Play : Route;
  }

  eventClass(e: LocEvent): string {
    return e.event === 'Geofence Alert' ? 'ev--red' : e.event === 'Dwell Exceeded' ? 'ev--amber' : e.event === 'Entered Zone' ? 'ev--green' : 'ev--blue';
  }

  // ===== misc =====

  @HostListener('document:click')
  closeMenus(): void {
    this.layersOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.layersOpen = false;
    this.locateOpen = false;
    this.alertForm = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
