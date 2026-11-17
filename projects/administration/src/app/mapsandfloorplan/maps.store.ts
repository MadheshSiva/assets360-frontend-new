import { Injectable, OnDestroy, inject } from '@angular/core';
import { EMPTY, Observable, Subscription, catchError, defer, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { adminApiError } from '../role-access-control/role-access.service';
import { ToastTone } from '../shared/admin-common';
import { LocationSources, MapsApiService, PlotDto, toPlotItem } from './maps-api.service';
import {
  DEFAULT_ZONE_OPTIONS,
  FloorPlan,
  LayerSet,
  LocationKind,
  MapLayer,
  MapVersion,
  MapZone,
  MapsSummary,
  PlotItem,
  PlotKind,
  SiteNode,
  TONE_HEX,
  Tone,
  ZONE_TYPES,
  ZoneOptions,
  ZoneGeometry,
  ZoneShape,
  ZoneType,
  defaultLayers,
  plotKey,
  zoneIcon,
  zoneTone
} from './maps.data';

const EMPTY_SUMMARY: MapsSummary = { floorPlans: 0, zones: 0, devicesPlotted: 0, assetsPlotted: 0 };

/** Options for a write call: toast while it runs, on success and on failure. */
interface RunOptions<T> {
  pending?: string;
  success?: string | ((result: T) => string);
  /** Prefix of the error toast, e.g. "Could not save the zone" (the server's message follows). */
  error: string;
  onError?: () => void;
}

/** Position of a zone / plot as kept by undo / redo. */
interface MapSnapshot {
  zones: MapZone[];
  items: { id: string; x: number | null; y: number | null; zoneId?: string; orientation: number }[];
}

/**
 * State shared by the Maps & Floor Plans tabs. Provided by the page, so switching tabs keeps the selected location,
 * plan, zone or plot. Records come from the maps API (Administration) and the location tree from Master Data.
 */
@Injectable()
export class MapsStore implements OnDestroy {
  private readonly api = inject(MapsApiService);

  /* ===== Location tree ===== */

  tree: SiteNode | null = null;
  treeLoading = false;
  treeError: string | null = null;
  /** Every selectable location (site / building / floor) as a picker option, in tree order. */
  floors: { id: string; label: string; kind: LocationKind }[] = [];
  private paths = new Map<string, SiteNode[]>();

  /* ===== Records ===== */

  floorPlans: FloorPlan[] = [];
  plansLoading = false;
  plansError: string | null = null;
  versions: MapVersion[] = [];
  versionsLoading = false;
  zones: MapZone[] = [];
  zonesLoading = false;
  /** Assets + devices: candidates from their registers merged with the plots of the current plan. */
  items: PlotItem[] = [];
  itemsLoading = false;
  private candidates: PlotItem[] = [];
  private plotRows: PlotDto[] = [];
  /** Marker colours picked on the Plotting tab (not stored by the API). */
  private toneOverrides = new Map<string, Tone>();
  layers: MapLayer[] = defaultLayers();
  layersLoading = false;
  layerSets: LayerSet[] = [];
  /** Id of the layer set last applied. */
  activeLayerSet: string | null = null;
  summary: MapsSummary = { ...EMPTY_SUMMARY };
  zoneOptions: ZoneOptions = DEFAULT_ZONE_OPTIONS;

  selectedFloorId = '';
  selectedPlanId = '';
  selectedZoneId: string | null = null;
  selectedItemId: string | null = null;

  /** View / Edit switch in the map header: drawing and plotting tools need Edit. */
  editing = true;

  toast: string | null = null;
  toastTone: ToastTone = 'info';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Write calls in flight; buttons that start one are disabled while it is above zero. */
  private busy = 0;
  private planSub: Subscription | null = null;
  private summarySub: Subscription | null = null;

  constructor() {
    this.init();
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.planSub?.unsubscribe();
    this.summarySub?.unsubscribe();
  }

  get working(): boolean {
    return this.busy > 0;
  }

  notify(message: string, tone: ToastTone = 'info'): void {
    this.toast = message;
    this.toastTone = tone;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    // errors stay a little longer so the reason can be read
    this.toastTimer = setTimeout(() => (this.toast = null), tone === 'error' ? 5000 : 3200);
  }

  /** Readable reason for a failed call. */
  errorText(err: unknown): string {
    return adminApiError(err, 'maps');
  }

  /**
   * Runs a write call: counts it as busy, shows the pending / success / error toasts, and calls `then` with the
   * result on success. Errors are reported and swallowed (onError lets the caller roll back).
   */
  run<T>(source: Observable<T>, o: RunOptions<T>, then?: (result: T) => void): void {
    defer(() => {
      this.busy++;
      if (o.pending) this.notify(o.pending, 'info');
      return source;
    })
      .pipe(
        tap((r) => {
          if (o.success) this.notify(typeof o.success === 'function' ? o.success(r) : o.success, 'success');
          then?.(r);
        }),
        catchError((err) => {
          this.notify(`${o.error}: ${this.errorText(err)}`, 'error');
          o.onError?.();
          return EMPTY;
        }),
        finalize(() => this.busy--)
      )
      .subscribe();
  }

  /* ===== Loading ===== */

  private init(): void {
    this.loadTree();
    this.api.zoneOptions().subscribe({ next: (o) => (this.zoneOptions = this.mergeZoneOptions(o)), error: () => undefined });
    this.loadLayerSets();
    this.loadCandidates();
  }

  /** Location tree (MDM) + every floor plan of the tenant (for the counts), then selects a location. */
  loadTree(): void {
    this.treeLoading = true;
    this.plansLoading = true;
    this.treeError = null;
    this.plansError = null;
    const locations = this.api.locations().pipe(
      catchError((err) => {
        this.treeError = `Could not load locations from Master Data Management: ${this.errorText(err)}`;
        this.notify(this.treeError, 'error');
        return of<LocationSources>({ organizationName: 'Organization', sites: [], buildings: [], floors: [] });
      })
    );
    const plans = this.api.listFloorPlans().pipe(
      catchError((err) => {
        this.plansError = `Could not load floor plans: ${this.errorText(err)}`;
        this.notify(this.plansError, 'error');
        return of<FloorPlan[]>([]);
      })
    );
    forkJoin({ locations, plans })
      .pipe(
        finalize(() => {
          this.treeLoading = false;
          this.plansLoading = false;
        })
      )
      .subscribe(({ locations: src, plans: list }) => {
        this.setTree(this.buildTree(src));
        this.floorPlans = list;
        this.selectFloor(this.initialLocation());
      });
  }

  /** Floor plans again (after a create / delete elsewhere), keeping the selection when it still exists. */
  reloadPlans(): void {
    this.plansLoading = true;
    this.api
      .listFloorPlans()
      .pipe(finalize(() => (this.plansLoading = false)))
      .subscribe({
        next: (list) => {
          this.floorPlans = list;
          this.plansError = null;
        },
        error: (err) => {
          this.plansError = `Could not load floor plans: ${this.errorText(err)}`;
          this.notify(this.plansError, 'error');
        }
      });
  }

  private buildTree(src: LocationSources): SiteNode {
    const label = (name: string, code?: string | null) => (code && code !== name ? `${name} (${code})` : name);
    // Latitude / longitude from Master Data, kept only when both are real coordinates
    const geo = (r: { latitude?: number | null; longitude?: number | null }): Pick<SiteNode, 'lat' | 'lng'> =>
      isCoord(r.latitude, 90) && isCoord(r.longitude, 180) ? { lat: r.latitude, lng: r.longitude } : {};
    const root: SiteNode = { id: 'org', label: src.organizationName || 'Organization', kind: 'org', children: [] };
    const sites = new Map<string, SiteNode>();
    const buildings = new Map<string, SiteNode>();
    for (const s of src.sites ?? []) {
      if (!s?.id) continue;
      const node: SiteNode = { id: s.id, label: label(s.siteName || s.code || s.id, s.code), kind: 'site', ...geo(s), children: [] };
      sites.set(s.id, node);
      root.children!.push(node);
    }
    for (const b of src.buildings ?? []) {
      if (!b?.id) continue;
      const node: SiteNode = { id: b.id, label: label(b.name || b.code || b.id, b.code), kind: 'building', ...geo(b), children: [] };
      buildings.set(b.id, node);
      (sites.get(b.site?.id ?? '') ?? root).children!.push(node);
    }
    for (const f of src.floors ?? []) {
      if (!f?.id) continue;
      const image = f.imageUrl || f.images?.find((i) => !!i) || undefined;
      const node: SiteNode = { id: f.id, label: f.name || f.code || f.id, kind: 'floor', ...geo(f), ...(image ? { image } : {}) };
      const siteId = typeof f.site === 'string' ? f.site : (f.site?.id ?? '');
      const parent =
        buildings.get(f.buildingId ?? '') ??
        [...buildings.values()].find((b) => !!f.buildingName && b.label.startsWith(f.buildingName)) ??
        sites.get(siteId) ??
        [...sites.values()].find((s) => typeof f.site === 'string' && s.label.startsWith(f.site)) ??
        root;
      parent.children!.push(node);
    }
    // Leaf sites / buildings have no children to expand
    const prune = (n: SiteNode) => {
      if (n.children && !n.children.length && n.kind !== 'org') delete n.children;
      n.children?.forEach(prune);
    };
    prune(root);
    return root;
  }

  private setTree(tree: SiteNode): void {
    this.tree = tree;
    this.paths.clear();
    this.floors = [];
    const walk = (node: SiteNode, trail: SiteNode[]) => {
      const next = [...trail, node];
      this.paths.set(node.id, next.slice(1));
      if (node.kind !== 'org') this.floors.push({ id: node.id, label: this.locationLabel(node.id), kind: node.kind });
      node.children?.forEach((c) => walk(c, next));
    };
    walk(tree, []);
  }

  /**
   * Where a location sits on the world map: its own latitude / longitude from Master Data, else the nearest parent's
   * (floor → building → site). `inherited` is true when it came from a parent. Null when none of them has coordinates.
   */
  geoAnchor(locationId: string): { lat: number; lng: number; from: SiteNode; inherited: boolean } | null {
    const path = this.paths.get(locationId) ?? [];
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      if (n.lat !== undefined && n.lng !== undefined) return { lat: n.lat, lng: n.lng, from: n, inherited: i !== path.length - 1 };
    }
    return null;
  }

  /**
   * True when zones can be drawn and items plotted here: the location has a floor plan, or it is a floor with an
   * image in Master Data (that image becomes its floor plan on the first draw / plot, see ensurePlan).
   */
  get canDraw(): boolean {
    return !!this.currentPlan || (!this.plansOf(this.selectedFloorId).length && !!this.floorImage(this.selectedFloorId));
  }

  /** A floor plan is being created from the floor image (buttons wait for it). */
  creatingPlan = false;

  /**
   * Runs `next` once the selected location has a floor plan. A floor without one but with an image in Master Data
   * gets a draft floor plan made from that image first (uploaded to Media like any floor plan), so the drawing and
   * plotting tools work on the picture shown on the map.
   */
  ensurePlan(next: () => void): void {
    if (this.currentPlan) {
      next();
      return;
    }
    const locationId = this.selectedFloorId;
    const image = this.floorImage(locationId);
    if (!image || this.plansOf(locationId).length) {
      this.notify('Upload a floor plan for this location first', 'error');
      return;
    }
    if (this.creatingPlan) return;
    this.creatingPlan = true;
    const label = this.locationNode(locationId)?.label ?? 'Floor';
    fetch(image)
      .then((res) => res.blob())
      .then((blob) => {
        const format: FloorPlan['format'] = /png/i.test(blob.type) ? 'PNG' : /svg/i.test(blob.type) ? 'SVG' : 'JPG';
        const file = new File([blob], `${label.replace(/[^\w.-]+/g, '-')}-layout.${format.toLowerCase()}`, { type: blob.type || 'image/png' });
        this.addPlan(
          file,
          { name: `${label} layout`, description: 'Floor image from Master Data Management', type: 'Floor Plan', format },
          () => this.whenPlanLoaded(() => {
            this.creatingPlan = false;
            next();
          })
        );
        // addPlan reports its own errors; let the buttons work again after a failure
        setTimeout(() => !this.currentPlan && (this.creatingPlan = false), 15_000);
      })
      .catch(() => {
        this.creatingPlan = false;
        this.notify('Could not read the floor image from Master Data', 'error');
      });
  }

  /** Calls `next` once the selected plan's zones and items have loaded (so they don't replace what `next` adds). */
  private whenPlanLoaded(next: () => void, tries = 0): void {
    if ((!this.zonesLoading && !this.itemsLoading) || tries > 50) next();
    else setTimeout(() => this.whenPlanLoaded(next, tries + 1), 100);
  }

  /** The tree node of a location (site / building / floor), or undefined when it isn't in the tree. */
  locationNode(locationId: string): SiteNode | undefined {
    const path = this.paths.get(locationId) ?? [];
    return path[path.length - 1];
  }

  /** The floor's layout picture from Master Data, when the location is a floor that has one. */
  floorImage(locationId: string): string | null {
    const path = this.paths.get(locationId) ?? [];
    const node = path[path.length - 1];
    return node?.kind === 'floor' && node.image ? node.image : null;
  }

  /** First location in the tree with coordinates (used to place the map when the selected one has none). */
  get anyGeo(): { lat: number; lng: number } | null {
    for (const [, path] of this.paths) {
      const n = path[path.length - 1];
      if (n && n.lat !== undefined && n.lng !== undefined) return { lat: n.lat, lng: n.lng };
    }
    return null;
  }

  /** True when MDM has no sites, buildings or floors. */
  get treeEmpty(): boolean {
    return !this.treeLoading && !this.tree?.children?.length;
  }

  /** First location with floor plans (floors first), else the first floor, else the first location. */
  private initialLocation(): string {
    const withPlans = this.floors.filter((f) => this.countOf(f.id) > 0);
    return (
      (withPlans.find((f) => f.kind === 'floor') ?? withPlans[0] ?? this.floors.find((f) => f.kind === 'floor') ?? this.floors[0])?.id ?? ''
    );
  }

  private loadLayerSets(): void {
    this.api.listLayerSets().subscribe({
      next: (sets) => {
        this.layerSets = sets;
        if (!sets.some((s) => s.id === this.activeLayerSet)) this.activeLayerSet = null;
      },
      error: (err) => this.notify(`Could not load layer sets: ${this.errorText(err)}`, 'error')
    });
  }

  /** Assets (Asset service) and IoT devices (Tracking) that can be plotted; either may fail on its own. */
  private loadCandidates(): void {
    this.itemsLoading = true;
    const assets = this.api.assets().pipe(
      catchError((err) => {
        this.notify(`Could not load assets: ${this.errorText(err)}`, 'error');
        return of<PlotItem[]>([]);
      })
    );
    const devices = this.api.devices().pipe(
      catchError((err) => {
        this.notify(`Could not load devices: ${this.errorText(err)}`, 'error');
        return of<PlotItem[]>([]);
      })
    );
    forkJoin([devices, assets])
      .pipe(finalize(() => (this.itemsLoading = false)))
      .subscribe(([d, a]) => {
        this.candidates = [...d, ...a];
        this.rebuildItems();
      });
  }

  private mergeZoneOptions(o: ZoneOptions): ZoneOptions {
    return {
      zoneTypes: o.zoneTypes.length ? o.zoneTypes : DEFAULT_ZONE_OPTIONS.zoneTypes,
      shapes: o.shapes.length ? o.shapes : DEFAULT_ZONE_OPTIONS.shapes,
      accessRules: o.accessRules.length ? o.accessRules : DEFAULT_ZONE_OPTIONS.accessRules,
      colors: o.colors.length ? o.colors : DEFAULT_ZONE_OPTIONS.colors
    };
  }

  /** Zone types offered by the API, with their icon and tone. */
  get zoneTypes(): { type: ZoneType; tone: Tone; icon: ReturnType<typeof zoneIcon> }[] {
    return this.zoneOptions.zoneTypes.map((t) => ZONE_TYPES.find((x) => x.type === t) ?? { type: t as ZoneType, tone: zoneTone(t), icon: zoneIcon(t as ZoneType) });
  }

  /** Zones, plots, layers and versions of the selected plan. */
  loadPlan(): void {
    this.planSub?.unsubscribe();
    this.clearHistory();
    const id = this.selectedPlanId;
    if (!id) {
      this.zones = [];
      this.plotRows = [];
      this.versions = [];
      this.layers = defaultLayers();
      this.rebuildItems();
      this.selectedZoneId = null;
      return;
    }
    this.zonesLoading = this.versionsLoading = this.layersLoading = true;
    const failed: string[] = [];
    const safe = <T>(what: string, source: Observable<T>, fallback: T) =>
      source.pipe(
        catchError((err) => {
          failed.push(`${what} (${this.errorText(err)})`);
          return of(fallback);
        })
      );
    this.planSub = forkJoin({
      zones: safe('zones', this.api.listZones(id), [] as MapZone[]),
      plots: safe('plots', this.api.listPlots(id), [] as PlotDto[]),
      layers: safe('layers', this.api.listLayers(id), defaultLayers()),
      versions: safe('versions', this.api.listVersions(id), [] as MapVersion[])
    })
      .pipe(finalize(() => (this.zonesLoading = this.versionsLoading = this.layersLoading = false)))
      .subscribe((r) => {
        if (id !== this.selectedPlanId) return;
        this.zones = r.zones;
        this.plotRows = r.plots;
        this.layers = r.layers.length ? r.layers : defaultLayers();
        this.versions = r.versions;
        this.rebuildItems();
        if (!this.zones.some((z) => z.id === this.selectedZoneId)) this.selectedZoneId = this.zones[0]?.id ?? null;
        if (failed.length) this.notify(`Could not load ${failed.join(', ')}`, 'error');
      });
  }

  loadVersions(): void {
    const id = this.selectedPlanId;
    if (!id) return;
    this.versionsLoading = true;
    this.api
      .listVersions(id)
      .pipe(finalize(() => (this.versionsLoading = false)))
      .subscribe({
        next: (v) => id === this.selectedPlanId && (this.versions = v),
        error: (err) => this.notify(`Could not load versions: ${this.errorText(err)}`, 'error')
      });
  }

  /** KPIs of the selected location (floor plans / zones / devices / assets plotted). */
  loadSummary(): void {
    this.summarySub?.unsubscribe();
    const loc = this.selectedFloorId;
    this.summarySub = this.api.summary(loc).subscribe({
      next: (s) => loc === this.selectedFloorId && (this.summary = s),
      error: () => (this.summary = { ...EMPTY_SUMMARY })
    });
  }

  /** Candidates merged with the current plan's plots (plots of unknown items are kept from their snapshot). */
  private rebuildItems(): void {
    const plots = new Map(this.plotRows.map((p) => [plotKey(p.kind === 'device' ? 'device' : 'asset', p.itemId), p]));
    const merged: PlotItem[] = this.candidates.map((c) => {
      const p = plots.get(c.id);
      plots.delete(c.id);
      return p
        ? { ...c, x: p.x ?? null, y: p.y ?? null, zoneId: p.zoneId ?? undefined, orientation: p.orientation ?? 0, lastUpdated: p.updatedAt ?? c.lastUpdated }
        : { ...c, x: null, y: null, zoneId: undefined, orientation: 0 };
    });
    for (const p of plots.values()) merged.push(toPlotItem(p));
    merged.forEach((i) => (i.tone = this.toneOverrides.get(i.id) ?? i.tone));
    this.items = merged;
    if (this.selectedItemId && !merged.some((i) => i.id === this.selectedItemId)) this.selectedItemId = null;
    if (!this.selectedItemId) this.selectedItemId = (merged.find((i) => i.x !== null) ?? merged[0])?.id ?? null;
  }

  /* ===== Undo / redo of map edits (zone edits + plots) =====
   * Every step is persisted: undo / redo writes the differences back (PUT zone, PUT / DELETE plot).
   * Creating or deleting a zone, or switching plans, clears the history (those cannot be replayed safely). */

  private undoStack: MapSnapshot[] = [];
  private redoStack: MapSnapshot[] = [];

  private snapshotOf(): MapSnapshot {
    return {
      zones: this.zones.map((z) => ({ ...z, points: z.points.map((p) => ({ ...p })) })),
      items: this.items.map((i) => ({ id: i.id, x: i.x, y: i.y, zoneId: i.zoneId, orientation: i.orientation }))
    };
  }

  /** Call before every map edit so it can be undone. */
  checkpoint(): void {
    this.undoStack.push(this.snapshotOf());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.working;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.working;
  }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.snapshotOf());
    this.restore(snap, 'Undone');
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.snapshotOf());
    this.restore(snap, 'Redone');
  }

  /** Applies a snapshot locally and saves what differs from the current state. */
  private restore(snap: MapSnapshot, label: string): void {
    const planId = this.selectedPlanId;
    const calls: Observable<unknown>[] = [];
    const zones = new Map(this.zones.map((z) => [z.id, z]));
    for (const z of snap.zones) {
      const now = zones.get(z.id);
      if (now && JSON.stringify(now) !== JSON.stringify(z)) calls.push(this.api.updateZone(z));
    }
    this.zones = this.zones.map((z) => snap.zones.find((s) => s.id === z.id) ?? z);
    const byId = new Map(snap.items.map((s) => [s.id, s]));
    for (const item of this.items) {
      const s = byId.get(item.id);
      if (!s || (s.x === item.x && s.y === item.y && s.zoneId === item.zoneId && s.orientation === item.orientation)) continue;
      Object.assign(item, { x: s.x, y: s.y, zoneId: s.zoneId, orientation: s.orientation });
      calls.push(s.x === null ? this.api.deletePlot(planId, item.kind, item.itemId) : this.api.savePlot(planId, item));
    }
    if (!calls.length || !planId) return;
    this.run(forkJoin(calls), {
      pending: 'Saving…',
      success: `${label} - changes saved`,
      error: `Could not save the ${label.toLowerCase()} change`,
      onError: () => this.loadPlan()
    }, () => this.loadSummary());
  }

  /* ===== Location ===== */

  /** Path from the organization down to a node, e.g. Head Office > Building A > Floor 1 (organization left out). */
  pathOf(id: string): SiteNode[] {
    return this.paths.get(id) ?? [];
  }

  /** Floor plans directly on a location. */
  countOf(id: string): number {
    return this.floorPlans.filter((p) => p.locationId === id).length;
  }

  locationLabel(id = this.selectedFloorId): string {
    const path = this.pathOf(id);
    if (path.length) return path.map((n) => n.label.replace(/\s*\(.*\)$/, '')).join(' > ');
    return this.floorPlans.find((p) => p.locationId === id)?.locationPath ?? '';
  }

  /** Location of a plan: from the tree, or the path stored with the plan. */
  planLocation(p: FloorPlan): string {
    return this.pathOf(p.locationId).length ? this.locationLabel(p.locationId) : p.locationPath || '—';
  }

  /** "Building A – Floor 1" */
  floorTitle(id = this.selectedFloorId): string {
    const path = this.pathOf(id);
    if (!path.length) return this.treeLoading ? 'Loading…' : 'No location selected';
    return path
      .slice(-2)
      .map((n) => n.label.replace(/\s*\(.*\)$/, ''))
      .join(' – ');
  }

  selectedKind(): LocationKind {
    return (this.pathOf(this.selectedFloorId).at(-1)?.kind as LocationKind | undefined) ?? 'floor';
  }

  selectFloor(id: string): void {
    this.selectedFloorId = id;
    const plans = this.plansOf(id);
    this.selectPlan((plans.find((p) => p.status === 'Published') ?? plans[0])?.id ?? '');
    this.loadSummary();
  }

  /* ===== Floor plans ===== */

  plansOf(locationId: string): FloorPlan[] {
    return this.floorPlans.filter((p) => p.locationId === locationId);
  }

  get currentPlan(): FloorPlan | undefined {
    return this.floorPlans.find((p) => p.id === this.selectedPlanId);
  }

  selectPlan(id: string): void {
    if (id === this.selectedPlanId && id) return;
    this.selectedPlanId = id;
    this.loadPlan();
  }

  /** Puts a plan returned by the API into the list (insert or replace). */
  upsertPlan(plan: FloorPlan): void {
    const exists = this.floorPlans.some((p) => p.id === plan.id);
    this.floorPlans = exists ? this.floorPlans.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...this.floorPlans];
  }

  /** Upload the file, then POST the floor plan on the selected location. */
  addPlan(
    file: File,
    form: { name: string; description: string; type: FloorPlan['type']; format: FloorPlan['format'] },
    done: (plan: FloorPlan) => void
  ): void {
    const locationId = this.selectedFloorId;
    if (!locationId) {
      this.notify('Select a site, building or floor first', 'error');
      return;
    }
    const create = this.api.uploadFile(file).pipe(
      tap(() => this.notify('Saving floor plan…', 'info')),
      switchMap((fileUrl) =>
        this.api.createFloorPlan({
          locationId,
          locationType: this.selectedKind(),
          locationPath: this.locationLabel(locationId),
          name: form.name,
          description: form.description,
          type: form.type,
          fileUrl,
          fileName: file.name,
          format: form.format,
          sizeBytes: file.size,
          widthMeters: null,
          heightMeters: null,
          scale: '',
          status: 'Draft',
          versionNote: 'Initial upload'
        })
      )
    );
    this.run(create, { pending: `Uploading ${file.name}…`, success: (p) => `${p.name} uploaded as a draft`, error: 'Could not upload the floor plan' }, (plan) => {
      this.upsertPlan(plan);
      this.selectPlan(plan.id);
      this.loadSummary();
      done(plan);
    });
  }

  updatePlan(plan: FloorPlan, done?: () => void): void {
    this.run(
      this.api.updateFloorPlan(plan.id, {
        name: plan.name,
        description: plan.subtitle,
        type: plan.type,
        widthMeters: plan.widthMeters,
        heightMeters: plan.heightMeters,
        scale: plan.scale,
        locationId: plan.locationId,
        locationType: plan.locationType,
        locationPath: plan.locationPath || this.locationLabel(plan.locationId)
      }),
      { pending: 'Saving…', success: 'Floor plan details saved', error: 'Could not save the floor plan' },
      (saved) => {
        this.upsertPlan(saved);
        done?.();
      }
    );
  }

  publishPlan(plan: FloorPlan): void {
    this.run(this.api.publishFloorPlan(plan.id), { pending: `Publishing ${plan.name}…`, success: (p) => `${p.name} published`, error: 'Could not publish' }, (p) => {
      this.upsertPlan(p);
      if (p.id === this.selectedPlanId) this.loadVersions();
    });
  }

  archivePlan(plan: FloorPlan): void {
    this.run(this.api.archiveFloorPlan(plan.id), { pending: `Archiving ${plan.name}…`, success: (p) => `${p.name} archived`, error: 'Could not archive' }, (p) =>
      this.upsertPlan(p)
    );
  }

  removePlans(ids: string[], done?: () => void): void {
    if (!ids.length) return;
    const n = ids.length;
    this.run(
      forkJoin(ids.map((id) => this.api.deleteFloorPlan(id))),
      { pending: 'Deleting…', success: n === 1 ? 'Floor plan deleted' : `${n} floor plans deleted`, error: 'Could not delete', onError: () => this.reloadPlans() },
      () => {
        this.floorPlans = this.floorPlans.filter((p) => !ids.includes(p.id));
        if (ids.includes(this.selectedPlanId)) {
          this.selectedPlanId = '';
          this.selectPlan(this.plansOf(this.selectedFloorId)[0]?.id ?? '');
        }
        this.loadSummary();
        done?.();
      }
    );
  }

  /** Opens the plan's file (or a version's) in a new tab. */
  download(fileUrl: string, fileName: string): void {
    if (!fileUrl) {
      this.notify(`${fileName || 'This floor plan'} has no stored file to download`, 'error');
      return;
    }
    window.open(fileUrl, '_blank', 'noopener');
  }

  /* ===== Versions ===== */

  get currentVersion(): MapVersion | undefined {
    return this.versions.find((v) => v.current);
  }

  versionCount(status: MapVersion['status']): number {
    return this.versions.filter((v) => v.status === status).length;
  }

  /** Upload the file, then POST a new Draft version of the current plan. */
  addVersion(file: File, form: { format: FloorPlan['format']; bump: 'minor' | 'major'; description: string }, done: (v: MapVersion) => void): void {
    const planId = this.selectedPlanId;
    if (!planId) {
      this.notify('Select a floor plan first', 'error');
      return;
    }
    const changes = form.description
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
    const create = this.api.uploadFile(file).pipe(
      tap(() => this.notify('Saving version…', 'info')),
      switchMap((fileUrl) =>
        this.api.createVersion(planId, {
          fileUrl,
          fileName: file.name,
          format: form.format,
          sizeBytes: file.size,
          bump: form.bump,
          description: form.description.trim() || 'New upload',
          changes: changes.length ? changes : ['New upload']
        })
      )
    );
    this.run(create, { pending: `Uploading ${file.name}…`, success: (v) => `${v.version} uploaded as a draft`, error: 'Could not upload the version' }, (v) => {
      this.loadVersions();
      done(v);
    });
  }

  publishVersion(version: string, done?: () => void): void {
    const planId = this.selectedPlanId;
    this.run(
      this.api.publishVersion(planId, version),
      { pending: `Publishing ${version}…`, success: `${version} published - previous version archived`, error: `Could not publish ${version}` },
      (plan) => {
        this.upsertPlan(plan);
        this.loadVersions();
        done?.();
      }
    );
  }

  restoreVersion(version: string, done?: (v: MapVersion) => void): void {
    this.run(
      this.api.restoreVersion(this.selectedPlanId, version),
      { pending: `Restoring ${version}…`, success: (v) => `${version} restored as draft ${v.version}`, error: `Could not restore ${version}` },
      (v) => {
        this.loadVersions();
        done?.(v);
      }
    );
  }

  /* ===== Zones ===== */

  get selectedZone(): MapZone | undefined {
    return this.zones.find((z) => z.id === this.selectedZoneId);
  }

  /** Area in m² of a box in % of the plan, from the plan's dimensions (0 when they are unknown). */
  areaOf(z: Pick<MapZone, 'shape' | 'w' | 'h'>): number {
    const p = this.currentPlan;
    if (!p?.widthMeters || !p?.heightMeters) return 0;
    const w = (z.w / 100) * p.widthMeters;
    const h = (z.h / 100) * p.heightMeters;
    const area = z.shape === 'Circle' ? Math.PI * (w / 2) * (h / 2) : w * h;
    return Math.round(area * 100) / 100;
  }

  /** POST a new zone with defaults (at the outline drawn on the map, when given); the user fills in its details in the zone form. */
  addZone(shape: ZoneShape, done?: (z: MapZone) => void, drawn?: ZoneGeometry): void {
    const planId = this.selectedPlanId;
    if (!planId) {
      this.notify('Upload a floor plan for this location before drawing zones', 'error');
      return;
    }
    const used = new Set(this.zones.map((z) => z.code.toUpperCase()));
    let n = this.zones.length + 1;
    while (used.has(`ZN-${String(n).padStart(2, '0')}`)) n++;
    const w = shape === 'Circle' ? 12 : 18;
    const h = shape === 'Circle' ? 22 : 18;
    const type = (this.zoneOptions.zoneTypes.includes('Operational') ? 'Operational' : this.zoneOptions.zoneTypes[0] ?? 'Operational') as ZoneType;
    const zone: MapZone = {
      id: '',
      floorPlanId: planId,
      code: `ZN-${String(n).padStart(2, '0')}`,
      name: `New ${shape} Zone`,
      type,
      tone: zoneTone(type),
      color: TONE_HEX[zoneTone(type)],
      shape,
      x: 40,
      y: 40,
      w,
      h,
      points: shape === 'Polygon' || shape === 'Custom' ? [{ x: 40, y: 40 }, { x: 40 + w, y: 40 }, { x: 40 + w, y: 40 + h }, { x: 40, y: 40 + h }] : [],
      radius: shape === 'Circle' ? w / 2 : null,
      ...(drawn ?? {}),
      areaM2: 0,
      description: '',
      accessRule: this.zoneOptions.accessRules.includes('All Staff') ? 'All Staff' : (this.zoneOptions.accessRules[0] ?? ''),
      active: true,
      entryAlert: false,
      exitAlert: false,
      dwellAlert: false,
      dwellMinutes: 30,
      geofence: false
    };
    zone.areaM2 = this.areaOf(zone);
    this.run(this.api.createZone(planId, zone), { pending: 'Saving zone…', success: (z) => `${z.name} added - fill in its details and save`, error: 'Could not add the zone' }, (z) => {
      this.zones = [...this.zones, z];
      this.selectedZoneId = z.id;
      this.clearHistory();
      this.loadSummary();
      done?.(z);
    });
  }

  saveZone(draft: MapZone, done?: () => void): void {
    const before = this.snapshotOf();
    const zone: MapZone = { ...draft, tone: zoneTone(draft.type) };
    const prev = this.zones.find((z) => z.id === draft.id);
    // A new type takes its colour unless the zone had a custom one
    if (prev && prev.type !== zone.type && (!prev.color || prev.color.toLowerCase() === TONE_HEX[prev.tone])) zone.color = TONE_HEX[zone.tone];
    this.run(this.api.updateZone(zone), { pending: 'Saving zone…', success: (z) => `Zone ${z.code} saved`, error: 'Could not save the zone' }, (saved) => {
      this.undoStack.push(before);
      this.redoStack = [];
      this.zones = this.zones.map((z) => (z.id === saved.id ? saved : z));
      done?.();
    });
  }

  removeZone(id: string): void {
    const zone = this.zones.find((z) => z.id === id);
    if (!zone) return;
    this.run(this.api.deleteZone(id), { pending: 'Deleting zone…', success: `Zone ${zone.code} deleted`, error: 'Could not delete the zone' }, () => {
      this.zones = this.zones.filter((z) => z.id !== id);
      this.items.forEach((i) => i.zoneId === id && (i.zoneId = undefined));
      if (this.selectedZoneId === id) this.selectedZoneId = this.zones[0]?.id ?? null;
      this.clearHistory();
      this.loadSummary();
    });
  }

  zoneCountOf(type: ZoneType): number {
    return this.zones.filter((z) => z.type === type).length;
  }

  zoneHex(z: MapZone): string {
    return z.color || TONE_HEX[z.tone];
  }

  /* ===== Plots ===== */

  get selectedItem(): PlotItem | undefined {
    return this.items.find((i) => i.id === this.selectedItemId);
  }

  get devices(): PlotItem[] {
    return this.items.filter((i) => i.kind === 'device');
  }

  get assets(): PlotItem[] {
    return this.items.filter((i) => i.kind === 'asset');
  }

  get plotted(): PlotItem[] {
    return this.items.filter((i) => i.x !== null);
  }

  get unplotted(): PlotItem[] {
    return this.items.filter((i) => i.x === null);
  }

  /** The zone whose box contains a point on the plan. */
  zoneAt(x: number, y: number): MapZone | undefined {
    return this.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  }

  private requirePlan(): string | null {
    if (!this.selectedPlanId) {
      this.notify('Upload a floor plan for this location before plotting', 'error');
      return null;
    }
    return this.selectedPlanId;
  }

  /** Place or move several items (PUT each); rolled back when the save fails. */
  plotMany(moves: { id: string; x: number; y: number }[], success: string): void {
    const planId = this.requirePlan();
    if (!planId || !moves.length) return;
    const before = this.snapshotOf();
    const targets: PlotItem[] = [];
    for (const m of moves) {
      const item = this.items.find((i) => i.id === m.id);
      if (!item) continue;
      item.x = Math.round(m.x * 10) / 10;
      item.y = Math.round(m.y * 10) / 10;
      item.zoneId = this.zoneAt(item.x, item.y)?.id;
      targets.push(item);
    }
    this.undoStack.push(before);
    this.redoStack = [];
    this.run(
      forkJoin(targets.map((i) => this.api.savePlot(planId, i))),
      { pending: 'Saving…', success, error: 'Could not save the plot', onError: () => this.rollback(before) },
      (saved) => {
        saved.forEach((p) => {
          const item = this.items.find((i) => i.id === plotKey(p.kind === 'device' ? 'device' : 'asset', p.itemId));
          if (item) item.lastUpdated = p.updatedAt ?? new Date().toISOString();
        });
        this.loadSummary();
      }
    );
  }

  plot(id: string, x: number, y: number, success: string): void {
    this.plotMany([{ id, x, y }], success);
  }

  /** Remove items from the plan (DELETE each). */
  unplotMany(ids: string[], success: string): void {
    const planId = this.requirePlan();
    const targets = this.items.filter((i) => ids.includes(i.id) && i.x !== null);
    if (!planId || !targets.length) return;
    const before = this.snapshotOf();
    targets.forEach((i) => {
      i.x = null;
      i.y = null;
      i.zoneId = undefined;
    });
    this.undoStack.push(before);
    this.redoStack = [];
    this.run(
      forkJoin(targets.map((i) => this.api.deletePlot(planId, i.kind, i.itemId))),
      { pending: 'Removing…', success, error: 'Could not remove the plot', onError: () => this.rollback(before) },
      () => this.loadSummary()
    );
  }

  unplot(id: string, success: string): void {
    this.unplotMany([id], success);
  }

  /** Orientation of a plotted item (PUT). */
  rotate(item: PlotItem, deg: number): void {
    const planId = this.requirePlan();
    if (!planId || item.x === null) return;
    const before = this.snapshotOf();
    item.orientation = ((Number(deg) % 360) + 360) % 360;
    this.undoStack.push(before);
    this.redoStack = [];
    this.run(this.api.savePlot(planId, item), { error: 'Could not save the orientation', onError: () => this.rollback(before) });
  }

  setTone(item: PlotItem, tone: Tone): void {
    item.tone = tone;
    this.toneOverrides.set(item.id, tone);
  }

  /** Puts zones / plot positions back after a failed save (no API call). */
  private rollback(snap: MapSnapshot): void {
    this.undoStack = this.undoStack.filter((s) => s !== snap);
    const byId = new Map(snap.items.map((s) => [s.id, s]));
    this.items.forEach((i) => {
      const s = byId.get(i.id);
      if (s) Object.assign(i, { x: s.x, y: s.y, zoneId: s.zoneId, orientation: s.orientation });
    });
  }

  /* ===== Layers ===== */

  layer(id: string): MapLayer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  isOn(id: string): boolean {
    const l = this.layer(id);
    return !!l && l.enabled && l.visible;
  }

  /** PUT one layer of the current plan; without a plan the change stays on screen only. */
  saveLayer(l: MapLayer, opts: { success?: string; quiet?: boolean } = {}, done?: () => void): void {
    const planId = this.selectedPlanId;
    const prev = this.layer(l.id);
    const before = prev ? { ...prev, categories: [...prev.categories] } : null;
    this.layers = this.layers.map((x) => (x.id === l.id ? l : x));
    if (!planId) {
      if (!opts.quiet) this.notify('No floor plan selected - layer change is not saved', 'info');
      done?.();
      return;
    }
    this.run(
      this.api.saveLayer(planId, l),
      {
        pending: opts.quiet ? undefined : 'Saving…',
        success: opts.success,
        error: `Could not save layer ${l.name}`,
        onError: () => before && (this.layers = this.layers.map((x) => (x.id === before.id ? before : x)))
      },
      (saved) => {
        // keep the page's order and icon; take the stored values
        this.layers = this.layers.map((x) => (x.id === saved.id ? { ...saved, icon: x.icon, tone: x.tone } : x));
        done?.();
      }
    );
  }

  /** Turn one layer on / off (PUT). */
  setLayerEnabled(id: string, on: boolean): void {
    const l = this.layer(id);
    if (!l || l.enabled === on) return;
    this.saveLayer({ ...l, enabled: on }, { quiet: true });
  }

  /** Apply a layer set: switch layers as it says (PUT each that changes). */
  applyLayerSet(setId: string): void {
    const set = this.layerSets.find((s) => s.id === setId);
    if (!set) return;
    this.activeLayerSet = setId;
    const changed = this.layers.filter((l) => !l.locked && set.layers[l.id] !== undefined && set.layers[l.id] !== l.enabled);
    if (!changed.length) return;
    const next = changed.map((l) => ({ ...l, enabled: set.layers[l.id] }));
    const before = this.layers;
    this.layers = this.layers.map((l) => next.find((n) => n.id === l.id) ?? l);
    const planId = this.selectedPlanId;
    if (!planId) return;
    this.run(
      forkJoin(next.map((l) => this.api.saveLayer(planId, l))),
      { pending: 'Applying view…', success: `${set.name} applied`, error: `Could not apply ${set.name}`, onError: () => (this.layers = before) }
    );
  }

  addLayerSet(name: string, done?: (s: LayerSet) => void): void {
    const layers = Object.fromEntries(this.layers.map((l) => [l.id, l.enabled]));
    this.run(this.api.createLayerSet(name, layers), { pending: 'Saving view…', success: (s) => `${s.name} saved`, error: 'Could not save the layer set' }, (s) => {
      this.layerSets = [...this.layerSets, s];
      this.activeLayerSet = s.id;
      done?.(s);
    });
  }

  /** The API has no rename: a new set is created with the same layers, then the old one deleted. */
  renameLayerSet(id: string, name: string): void {
    const set = this.layerSets.find((s) => s.id === id);
    if (!set) return;
    const swap = this.api
      .createLayerSet(name, set.layers)
      .pipe(switchMap((created) => this.api.deleteLayerSet(id).pipe(map(() => created))));
    this.run(swap, { pending: 'Renaming…', success: `Renamed to ${name}`, error: 'Could not rename the layer set', onError: () => this.loadLayerSets() }, (created) => {
      this.layerSets = this.layerSets.map((s) => (s.id === id ? created : s));
      if (this.activeLayerSet === id) this.activeLayerSet = created.id;
    });
  }

  removeLayerSet(id: string): void {
    const set = this.layerSets.find((s) => s.id === id);
    if (!set) return;
    this.run(this.api.deleteLayerSet(id), { pending: 'Deleting…', success: `${set.name} deleted`, error: 'Could not delete the layer set' }, () => {
      this.layerSets = this.layerSets.filter((s) => s.id !== id);
      if (this.activeLayerSet === id) this.activeLayerSet = null;
    });
  }
}

/** A finite number within ±limit (latitude 90, longitude 180). */
function isCoord(v: number | null | undefined, limit: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
}
