import {
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { LucideIconData } from 'lucide-angular';
import { FloorPlan, MapZone, PlotItem, SiteNode, TONE_HEX, ZoneGeometry, ZoneShape, isImageFormat, zoneIcon } from '../maps.data';
import { MapsStore } from '../maps.store';

/** Plan size used when the floor plan has no width / height in metres (same 600 × 320 shape as before). */
const DEFAULT_WIDTH_M = 60;
const DEFAULT_HEIGHT_M = 32;
/** Where the map opens when no location in Master Data has coordinates yet (zoomed out). */
const FALLBACK_CENTER = { lat: 20.5937, lng: 78.9629 };
const FALLBACK_ZOOM = 4;
/** Street-map zoom for each kind of location: a whole site, one building, one floor. */
const KIND_ZOOM: Record<SiteNode['kind'], number> = { org: 14, site: 16, building: 18, floor: 19 };
const METRES_PER_DEGREE_LAT = 111_320;
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

interface Frame {
  north: number;
  west: number;
  dLat: number;
  dLng: number;
  widthM: number;
}

/**
 * The map tab canvas, two views:
 * - A floor with a layout picture (uploaded floor plan, else the floor image from Master Data): the picture alone,
 *   with zones and plotted devices / assets on it. No street map.
 * - Any other location (site, building, floor without a picture): a Leaflet street map (OpenStreetMap) at the
 *   latitude / longitude set in Master Data Management, with a pin for the location and its child locations.
 *   Switching locations flies the map to the new position.
 * Positions of zones and plots are kept in % of the plan (what the API stores); they are converted to and from
 * latitude / longitude here, so every tab works unchanged. With `preview` it is a small, non-interactive thumbnail.
 */
@Component({
  standalone: true,
  selector: 'app-map-canvas',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="mfp-viewport" [class.mfp-viewport--preview]="preview" [class.mfp-placing]="placing || !!drawShape" [class.mfp-viewport--image]="imageMode">
      <div #mapEl class="mfp-map" [attr.aria-label]="'Map of ' + (locationLabel || 'the location')" role="application"></div>
      @if (!preview && drawShape) {
        <div class="mfp-draw-bar" role="status">
          <span>{{ drawHint }}</span>
          @if (canFinishPolygon) {
            <button type="button" class="mfp-draw-btn mfp-draw-btn--primary" (click)="finishPolygon()">Finish</button>
          }
          <button type="button" class="mfp-draw-btn" (click)="cancelDraw()">Cancel</button>
        </div>
      } @else if (!preview && geoNote; as note) {
        <div class="mfp-note" role="status">{{ note }}</div>
      }
    </div>
  `,
  styles: `
    app-map-canvas { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    /* Inside a fixed-height workspace the map takes the viewer's spare height */
    app-map-viewer > .viewer { min-height: 0; }
    .mfp-viewport {
      flex: 1;
      position: relative;
      min-height: 280px;
      border: 1px solid #e6e8ef;
      border-radius: 10px;
      overflow: hidden;
      background: #eef2f7;
    }
    .mfp-viewport--image, .mfp-viewport--image .leaflet-container { background: #fff; }
    .mfp-viewport--preview { min-height: 0; border-radius: 6px; flex: 1; }
    .mfp-map { position: absolute; inset: 0; z-index: 0; }
    .mfp-viewport--preview .mfp-map { position: relative; inset: auto; width: 100%; height: 100%; min-height: 100%; aspect-ratio: 600 / 320; }
    app-map-canvas.thumb .mfp-viewport--preview .mfp-map { aspect-ratio: auto; }
    .mfp-viewport--preview .leaflet-container { cursor: default; }
    .mfp-placing .leaflet-container,
    .mfp-placing .leaflet-interactive { cursor: crosshair !important; }
    .mfp-note {
      position: absolute;
      left: 10px;
      right: 10px;
      top: 10px;
      z-index: 500;
      padding: 7px 10px;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      background: #fffbeb;
      color: #92400e;
      font-size: 12px;
      line-height: 1.35;
      pointer-events: none;
    }
    .mfp-draw-bar {
      position: absolute;
      left: 50%;
      top: 10px;
      transform: translateX(-50%);
      z-index: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: calc(100% - 20px);
      padding: 6px 8px 6px 12px;
      border: 1px solid #c9b8ef;
      border-radius: 999px;
      background: #fff;
      box-shadow: 0 4px 14px rgba(76, 29, 149, 0.18);
      color: #3b0764;
      font-size: 12.5px;
    }
    .mfp-draw-bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mfp-draw-btn {
      flex-shrink: 0;
      padding: 4px 12px;
      border: 1px solid #d8cdf3;
      border-radius: 999px;
      background: #fff;
      color: #4c1d95;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .mfp-draw-btn--primary { border-color: transparent; background: linear-gradient(90deg, #4c1d95, #6d28d9); color: #fff; }
    .mfp-marker, .mfp-pin { background: none; border: 0; }
    .mfp-marker__wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; transform: translate(-50%, -12px); width: max-content; margin-left: 12px; }
    .mfp-marker__dot {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--tone);
      color: #fff;
      box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(15, 23, 42, 0.3);
    }
    .mfp-marker--asset .mfp-marker__dot { border-radius: 6px; }
    /* "Total Assets N" at the centre of a zone with a gateway: linked assets heard by the zone's gateway(s) */
    .mfp-ztotal {
      position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
      display: inline-flex; align-items: center; gap: 8px; padding: 5px 6px 5px 12px; white-space: nowrap; cursor: pointer;
      border-radius: 999px; background: #fff; border: 1px solid #ddd6fe;
      box-shadow: 0 6px 16px -6px rgba(46, 26, 140, 0.45), 0 1px 3px rgba(15, 23, 42, 0.12);
      font: 600 12px/1 system-ui, sans-serif; color: #4c1d95; animation: mfp-ztotal-in 0.25s ease-out;
    }
    .mfp-ztotal small { font: inherit; letter-spacing: 0.01em; }
    .mfp-ztotal b {
      display: grid; place-items: center; min-width: 24px; height: 24px; padding: 0 7px; box-sizing: border-box;
      border-radius: 999px; background: linear-gradient(145deg, #7c5cff, #5b3fd4); color: #fff; font-size: 13px;
    }
    .mfp-ztotal:hover { border-color: #a78bfa; }
    /* zone drawn too small for the text: only the count */
    .mfp-ztotal--compact { gap: 0; padding: 3px; }
    .mfp-ztotal--compact small { display: none; }
    .mfp-ztotal--zero { color: #6b7280; border-color: #e5e7eb; }
    .mfp-ztotal--zero b { background: #e5e7eb; color: #6b7280; }
    @keyframes mfp-ztotal-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); } to { opacity: 1; transform: translate(-50%, -50%); } }
    .mfp-marker--active .mfp-marker__dot { box-shadow: 0 0 0 2px #fff, 0 0 0 5px var(--tone); }
    .mfp-marker__label, .mfp-pin__label {
      padding: 0 4px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.92);
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
    }
    /* The icon box's bottom-centre is the location: label on top, pin tip at the bottom */
    .mfp-pin__wrap { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; width: max-content; }
    .mfp-pin__icon { display: block; line-height: 0; }
    .mfp-pin__icon { color: #5b2aa8; filter: drop-shadow(0 2px 3px rgba(15, 23, 42, 0.35)); }
    .mfp-pin__icon svg { fill: #fff; }
    .mfp-pin--child .mfp-pin__icon { color: #7c3aed; opacity: 0.85; }
    .mfp-pin--child { cursor: pointer; }
    .mfp-pin__label { margin-bottom: 1px; font-size: 11.5px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2); }
    .mfp-pin--child .mfp-pin__label { font-size: 10.5px; font-weight: 600; }
    .leaflet-tooltip.mfp-zone-label {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border: 1px solid #e6e8ef;
      border-radius: 6px;
      background: #fff;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
      color: #1e293b;
      white-space: nowrap;
    }
    .mfp-zone-label svg { display: block; color: var(--zone); }
    .mfp-zone-label strong { font-size: 12px; font-weight: 700; }
    .mfp-zone-label small { font-size: 11px; color: #475569; }
  `
})
export class MapCanvas implements AfterViewInit, OnChanges, DoCheck, OnDestroy {
  readonly store = inject(MapsStore);
  private readonly ngZone = inject(NgZone);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('mapEl', { static: true }) mapEl?: ElementRef<HTMLDivElement>;

  /** Zoom in % of the fitted view (100 = fitted), from the viewer's zoom controls. */
  @Input() zoom = 100;
  @Input() showZones = true;
  @Input() showDevices = true;
  @Input() showAssets = true;
  @Input() showLabels = true;
  @Input() showItemLabels = true;
  /** Kept for the tabs' templates; Leaflet's own panning replaces the old minimap. */
  @Input() showMinimap = true;
  @Input() showScale = true;
  @Input() preview = false;
  @Input() selectedZoneId: string | null = null;
  @Input() selectedItemId: string | null = null;
  /** While set, a click on the map reports its position (in % of the plan) instead of selecting. */
  @Input() placing = false;

  /** While set, clicks on the map draw a zone of this shape (outline reported through `zoneDrawn`). */
  @Input() drawShape: ZoneShape | null = null;

  @Output() zoneSelect = new EventEmitter<MapZone>();
  @Output() itemSelect = new EventEmitter<PlotItem>();
  @Output() place = new EventEmitter<{ x: number; y: number }>();
  /** A zone outline finished on the map, in % of the plan. */
  @Output() zoneDrawn = new EventEmitter<ZoneGeometry>();
  /** Drawing was cancelled (Esc or the Cancel button). */
  @Output() drawCancel = new EventEmitter<void>();

  /** Plan to draw (defaults to the store's current plan). Zones and plots are drawn only for the current plan. */
  @Input() plan: FloorPlan | undefined;
  /**
   * Assets per gateway, keyed by gateway id in lower case (NetworkTimeSeries meta.gatewayid). A plotted device whose
   * device id or code is a gateway id shows the count on its icon.
   */
  @Input() gatewayCounts: Record<string, { count: number; names: string[] }> | null = null;

  private gatewayCount(i: PlotItem): { count: number; names: string[] } | null {
    if (!this.gatewayCounts) return null;
    return this.gatewayCounts[i.itemId?.toLowerCase()] ?? this.gatewayCounts[i.code?.toLowerCase()] ?? null;
  }

  /** A zone's "Total Assets" label was clicked: the zone and the plotted gateways in it. */
  @Output() zoneTotalSelect = new EventEmitter<{ zone: MapZone; gateways: PlotItem[] }>();

  /** Item to track on screen (e.g. for a popup above it); its position is reported through `anchorMove`. */
  @Input() anchorItemId: string | null = null;
  /** Or a zone: its "Total Assets" label (the zone's centre) is tracked instead; takes precedence over `anchorItemId`. */
  @Input() anchorZoneId: string | null = null;
  /**
   * Where the anchored item's marker sits, in pixels from the map's top-left corner (null when it is not plotted
   * or the map is not ready). Re-sent while the map pans, zooms or resizes.
   */
  @Output() anchorMove = new EventEmitter<{ x: number; y: number; inView: boolean } | null>();
  /** A version's file (Versions tab): shown instead of the plan's current file when it is an image. */
  @Input() fileUrl: string | null = null;
  @Input() fileFormat: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private L: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tiles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private overlay: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scale: any;
  /** Preview of the zone being drawn. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drawLayer: any;
  /** Points clicked so far while drawing (corner / centre / polygon vertices). */
  drawPoints: { lat: number; lng: number }[] = [];
  private hover: { lat: number; lng: number } | null = null;
  private frame: Frame | null = null;
  /** Map zoom of the fitted view; the viewer's zoom % is applied on top of it. */
  private baseZoom = 0;
  private viewKey = '';
  private drawKey = '';
  /** False until the first view is set: the first one jumps, later ones fly. */
  private hasView = false;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  /** Width / height of each floor image, once loaded (the frame takes the image's shape). */
  private static readonly aspects = new Map<string, number>();
  /** Images that failed to load: the street map shows instead. */
  private static readonly broken = new Set<string>();
  private loading = new Set<string>();

  get shownPlan(): FloorPlan | undefined {
    return this.plan ?? this.store.currentPlan;
  }

  /** True when the zones / plots in the store belong to the plan shown. */
  get ownZones(): boolean {
    return !this.plan || this.plan.id === this.store.selectedPlanId;
  }

  /** Location shown. */
  private get locationId(): string {
    return this.shownPlan?.locationId || this.store.selectedFloorId;
  }

  private get node(): SiteNode | undefined {
    return this.store.locationNode(this.locationId);
  }

  get locationLabel(): string {
    return this.node?.label ?? this.shownPlan?.name ?? '';
  }

  /** True when the floor's picture is shown instead of the street map. */
  get imageMode(): boolean {
    return !!this.imageSrc;
  }

  /**
   * The floor's layout picture: a version's file (Versions tab), else the uploaded floor plan when it is an image,
   * else the floor image from Master Data. Null for sites and buildings, and for images that don't load.
   */
  private get imageSrc(): string | null {
    const id = this.locationId;
    if (this.store.locationNode(id)?.kind !== 'floor') return null;
    const p = this.shownPlan;
    const candidates = [
      this.fileUrl && isImageFormat(this.fileFormat ?? '') ? this.fileUrl : null,
      p?.fileUrl && isImageFormat(p.format) ? p.fileUrl : null,
      this.store.floorImage(id)
    ];
    return candidates.find((src): src is string => !!src && !MapCanvas.broken.has(src)) ?? null;
  }

  /** Short identity of an image source (data URLs can be megabytes long). */
  private static imageKey(src: string | null): string {
    return src ? `${src.length}:${src.slice(0, 40)}:${src.slice(-40)}` : '';
  }

  /** Learns the image's shape so the frame matches it; redraws once known. */
  private measure(src: string): void {
    if (MapCanvas.aspects.has(src) || this.loading.has(src)) return;
    this.loading.add(src);
    const img = new Image();
    img.onload = () => {
      this.loading.delete(src);
      if (img.naturalWidth && img.naturalHeight) MapCanvas.aspects.set(src, img.naturalWidth / img.naturalHeight);
      this.ngZone.run(() => this.ngDoCheck());
    };
    img.onerror = () => {
      this.loading.delete(src);
      MapCanvas.broken.add(src);
      this.ngZone.run(() => this.ngDoCheck());
    };
    img.src = src;
  }

  /** Explains where the street map was placed when the location itself has no coordinates. */
  get geoNote(): string | null {
    if (this.store.treeLoading || this.imageMode || !this.locationId) return null;
    const anchor = this.store.geoAnchor(this.locationId);
    if (!anchor) {
      return 'This location has no latitude / longitude yet. Add them in Master Data Management › Site, Building or Floor to show it on the map.';
    }
    return anchor.inherited ? `Shown at the position of ${anchor.from.label} (this location has no coordinates of its own).` : null;
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser || !this.mapEl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('leaflet');
    if (this.destroyed) return;
    this.L = mod.icon ? mod : mod.default;
    this.ngZone.runOutsideAngular(() => this.createMap());
    this.ngDoCheck();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['zoom'] && !changes['zoom'].firstChange && this.map) this.ngZone.runOutsideAngular(() => this.applyZoom(true));
    if (changes['drawShape']) this.resetDraw();
    if (changes['preview'] && !changes['preview'].firstChange && this.map) {
      // Interaction and controls depend on preview: rebuild the map
      this.teardown();
      this.ngZone.runOutsideAngular(() => this.createMap());
    }
  }

  /** Moves / redraws when the location, picture, plan size, zones, plots or display options change. */
  ngDoCheck(): void {
    if (!this.map) return;
    const viewKey = this.computeViewKey();
    if (viewKey !== this.viewKey) {
      this.viewKey = viewKey;
      this.ngZone.runOutsideAngular(() => this.setView());
      this.drawKey = '';
    }
    const drawKey = this.computeDrawKey();
    if (drawKey !== this.drawKey) {
      this.drawKey = drawKey;
      this.ngZone.runOutsideAngular(() => this.draw());
    }
    this.syncScale();
    // after this check (item moved, anchor changed): emitting during change detection would change the parent mid-check
    // (scheduled outside Angular so the wait itself does not start another check; emitAnchor re-enters only on a change)
    if (!this.anchorQueued) {
      this.anchorQueued = true;
      this.ngZone.runOutsideAngular(() =>
        Promise.resolve().then(() => {
          this.anchorQueued = false;
          this.emitAnchor();
        })
      );
    }
  }

  private anchorKey = '';
  private anchorQueued = false;

  /** Reports the anchored zone label's or item marker's position in map pixels, only when it changed. */
  private emitAnchor(): void {
    let next: { x: number; y: number; inView: boolean } | null = null;
    let at: { x: number; y: number } | null = null;
    let lift = 0;
    const zone = this.anchorZoneId ? this.store.zones.find((z) => z.id === this.anchorZoneId) : undefined;
    if (zone) {
      // the Total Assets label sits on the zone's centre; aim at its top edge so the popup does not cover it
      at = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
      lift = 14;
    } else {
      const item = this.anchorItemId ? this.store.items.find((i) => i.id === this.anchorItemId) : undefined;
      if (item && item.x !== null && item.y !== null) at = { x: item.x, y: item.y };
    }
    if (at && this.map && this.frame) {
      const p = this.map.latLngToContainerPoint(this.toLatLng(at.x, at.y));
      p.y -= lift;
      const size = this.map.getSize();
      // measured from this component's box (the map element may sit inside a border / padding)
      const mapBox = (this.map.getContainer() as HTMLElement).getBoundingClientRect();
      const hostBox = this.hostEl.nativeElement.getBoundingClientRect();
      next = {
        x: Math.round(p.x + mapBox.left - hostBox.left),
        y: Math.round(p.y + mapBox.top - hostBox.top),
        inView: p.x >= 0 && p.y >= 0 && p.x <= size.x && p.y <= size.y
      };
    }
    const key = next ? `${next.x},${next.y},${next.inView}` : '';
    if (key === this.anchorKey) return;
    this.anchorKey = key;
    this.ngZone.run(() => this.anchorMove.emit(next));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.teardown();
  }

  /* ===== Map set-up ===== */

  private createMap(): void {
    const L = this.L;
    const el = this.mapEl!.nativeElement;
    const interactive = !this.preview;
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      // A floor picture is often a single building: allow zooming past the tiles' native detail
      maxZoom: 22
    });
    this.tiles = L.tileLayer(TILE_URL, { maxZoom: 22, maxNativeZoom: 19, attribution: '© OpenStreetMap contributors' });
    this.overlay = L.layerGroup().addTo(this.map);
    this.drawLayer = L.layerGroup().addTo(this.map);
    this.map.on('click', (e: { latlng: { lat: number; lng: number } }) => this.onMapClick(e.latlng));
    // keep a popup anchored to its marker while the map moves
    this.map.on('move zoom zoomend moveend resize viewreset', () => this.emitAnchor());
    // a zone's Total Assets label shrinks to the count when the zone is drawn too small for the text
    this.map.on('zoomend resize viewreset', () => this.fitZoneTotals());
    this.map.on('mousemove', (e: { latlng: { lat: number; lng: number } }) => {
      if (!this.drawShape || !this.drawPoints.length) return;
      this.hover = e.latlng;
      this.drawPreview();
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(el);
    }
    this.viewKey = '';
    this.drawKey = '';
    this.scale = null;
    this.hasView = false;
  }

  private teardown(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.map?.remove();
    this.map = null;
    this.tiles = null;
    this.overlay = null;
    this.drawLayer = null;
    this.scale = null;
  }

  /* ===== View: where the map is, and the plan frame (% of the plan <-> latitude / longitude) ===== */

  private computeViewKey(): string {
    const p = this.shownPlan;
    const c = this.center();
    const src = this.imageSrc;
    if (src) this.measure(src);
    return [
      this.locationId,
      c.lat,
      c.lng,
      p?.id ?? '',
      p?.widthMeters ?? '',
      p?.heightMeters ?? '',
      MapCanvas.imageKey(src),
      src ? (MapCanvas.aspects.get(src) ?? '') : ''
    ].join('|');
  }

  /** The location's position, its parent's, any location's, or a default. */
  private center(): { lat: number; lng: number } {
    return this.store.geoAnchor(this.locationId) ?? this.store.anyGeo ?? FALLBACK_CENTER;
  }

  /** The plan frame, sized from the plan's metres (else the picture's shape), centred on the location. */
  private computeFrame(): Frame {
    const p = this.shownPlan;
    const src = this.imageSrc;
    const aspect = (src && MapCanvas.aspects.get(src)) || DEFAULT_WIDTH_M / DEFAULT_HEIGHT_M;
    const widthM = p?.widthMeters && p.widthMeters > 0 ? p.widthMeters : DEFAULT_WIDTH_M;
    const heightM = p?.heightMeters && p.heightMeters > 0 ? p.heightMeters : widthM / aspect;
    const { lat, lng } = this.center();
    const dLat = heightM / METRES_PER_DEGREE_LAT;
    const dLng = widthM / (METRES_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    return { north: lat + dLat / 2, west: lng - dLng / 2, dLat, dLng, widthM };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private frameBounds(f: Frame): any {
    return this.L.latLngBounds([f.north - f.dLat, f.west], [f.north, f.west + f.dLng]);
  }

  /** True when the street map should show the plan frame (the location has a floor plan to draw zones on). */
  private get showFrame(): boolean {
    return !!this.shownPlan;
  }

  private setView(): void {
    this.frame = this.computeFrame();
    this.map.invalidateSize();
    const animate = this.hasView && !this.preview;
    const bounds = this.frameBounds(this.frame);

    if (this.imageMode) {
      // The floor picture alone: no street tiles, panning kept to the picture
      this.tiles.remove();
      this.map.setMaxBounds(bounds.pad(0.25));
      this.map.fitBounds(bounds, { padding: this.preview ? [2, 2] : [16, 16], animate: false });
    } else {
      if (!this.map.hasLayer(this.tiles)) this.tiles.addTo(this.map);
      this.map.setMaxBounds(null);
      const hasCoords = !!(this.store.geoAnchor(this.locationId) ?? this.store.anyGeo);
      if (this.showFrame) {
        // A plan to draw zones on: show its frame
        if (animate) this.map.flyToBounds(bounds, { padding: [24, 24], duration: 0.8 });
        else this.map.fitBounds(bounds, { padding: this.preview ? [4, 4] : [24, 24], animate: false });
      } else {
        const c = this.center();
        const zoom = hasCoords ? KIND_ZOOM[this.node?.kind ?? 'site'] : FALLBACK_ZOOM;
        if (animate) this.map.flyTo([c.lat, c.lng], zoom, { duration: 0.8 });
        else this.map.setView([c.lat, c.lng], zoom, { animate: false });
      }
    }
    // The zoom the viewer's 100 % stands for (the target zoom when flying)
    this.baseZoom = this.imageMode || this.showFrame ? this.map.getBoundsZoom(bounds) : (this.store.geoAnchor(this.locationId) ?? this.store.anyGeo) ? KIND_ZOOM[this.node?.kind ?? 'site'] : FALLBACK_ZOOM;
    this.hasView = true;
    this.applyZoom(false);
  }

  /** Viewer zoom % → map zoom (100 % = fitted; each doubling is one zoom level). */
  private applyZoom(animate: boolean): void {
    if (!this.map || !this.frame) return;
    const pct = Math.min(400, Math.max(10, this.zoom || 100));
    if (pct === 100 && !animate) return; // the fitted view is already set (and may be flying)
    this.map.setZoom(this.baseZoom + Math.log2(pct / 100), { animate });
  }

  private toLatLng(x: number, y: number): [number, number] {
    const f = this.frame!;
    return [f.north - (y / 100) * f.dLat, f.west + (x / 100) * f.dLng];
  }

  private toPercent(lat: number, lng: number): { x: number; y: number } {
    const f = this.frame!;
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return { x: clamp(((lng - f.west) / f.dLng) * 100), y: clamp(((f.north - lat) / f.dLat) * 100) };
  }

  /* ===== Drawing ===== */

  private visibleItems(): PlotItem[] {
    if (this.preview || !this.ownZones || !(this.imageMode || this.showFrame)) return [];
    return this.store.plotted.filter((i) => (i.kind === 'device' && this.showDevices) || (i.kind === 'asset' && this.showAssets));
  }

  private visibleZones(): MapZone[] {
    return this.showZones && this.ownZones && (this.imageMode || this.showFrame) ? this.store.zones : [];
  }

  /** Pins on the street map: the location itself and its child locations that have their own coordinates. */
  private pins(): { node: SiteNode; lat: number; lng: number; self: boolean }[] {
    if (this.imageMode) return [];
    const node = this.node;
    const anchor = this.store.geoAnchor(this.locationId);
    const out: { node: SiteNode; lat: number; lng: number; self: boolean }[] = [];
    if (node && anchor) out.push({ node, lat: anchor.lat, lng: anchor.lng, self: true });
    if (!this.preview) {
      const walk = (n: SiteNode) =>
        n.children?.forEach((c) => {
          if (c.lat !== undefined && c.lng !== undefined) out.push({ node: c, lat: c.lat, lng: c.lng, self: false });
          walk(c);
        });
      if (node) walk(node);
    }
    return out;
  }

  private computeDrawKey(): string {
    const zones = this.visibleZones().map((z) => [z.id, z.x, z.y, z.w, z.h, z.shape, z.radius, this.store.zoneHex(z), z.name, z.code, z.type, JSON.stringify(z.points)]);
    const items = this.visibleItems().map((i) => [i.id, i.x, i.y, i.tone, i.kind, i.code]);
    const pins = this.pins().map((p) => [p.node.id, p.lat, p.lng, p.self]);
    // gateways: drawn as their count at their zone's centre, so their count, zone and gateway status redraw the map
    const counts = this.visibleItems()
      .filter((i) => i.kind === 'device')
      .map((i) => [i.id, this.isGateway(i), this.zoneOf(i)?.id ?? '', this.gatewayCount(i)?.count ?? 0]);
    return JSON.stringify([this.viewKey, zones, items, pins, counts, this.selectedZoneId, this.selectedItemId, this.showLabels, this.showItemLabels, this.preview, this.placing]);
  }

  private draw(): void {
    if (!this.frame || !this.overlay) return;
    const L = this.L;
    this.overlay.clearLayers();
    const area = this.frameBounds(this.frame);

    const src = this.imageSrc;
    if (src) {
      L.imageOverlay(src, area, { interactive: false, className: 'mfp-floor-image' }).addTo(this.overlay);
    } else if (this.showFrame) {
      L.rectangle(area, { color: '#5b2aa8', weight: this.preview ? 1 : 2, dashArray: '6 4', fill: false, interactive: false }).addTo(this.overlay);
    }

    for (const z of this.visibleZones()) this.drawZone(z);
    for (const i of this.visibleItems()) this.drawItem(i);
    this.drawZoneTotals();
    for (const p of this.pins()) this.drawPin(p);
  }

  private drawPin(p: { node: SiteNode; lat: number; lng: number; self: boolean }): void {
    const L = this.L;
    const size = p.self ? 30 : 22;
    const label = this.preview ? '' : `<span class="mfp-pin__label">${esc(p.node.label)}</span>`;
    const pin = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`;
    const html = `<span class="mfp-pin__wrap ${p.self ? '' : 'mfp-pin--child'}">${label}<span class="mfp-pin__icon">${pin}</span></span>`;
    const marker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: 'mfp-pin', html, iconSize: [size, size], iconAnchor: [size / 2, size] }),
      title: p.node.label,
      keyboard: !p.self,
      zIndexOffset: p.self ? 500 : 0,
      interactive: !p.self && !this.preview
    });
    if (!p.self && !this.preview) {
      // A child location: open it, as in the location tree
      marker.on('click', (e: unknown) => {
        if (this.placing) return;
        L.DomEvent.stop(e);
        this.ngZone.run(() => this.store.selectFloor(p.node.id));
      });
    }
    marker.addTo(this.overlay);
  }

  private drawZone(z: MapZone): void {
    const L = this.L;
    const hex = this.store.zoneHex(z);
    const active = z.id === this.selectedZoneId;
    const style = {
      color: hex,
      weight: active ? 3 : 1.5,
      dashArray: active ? undefined : '5 4',
      fillColor: hex,
      fillOpacity: active ? 0.32 : 0.22,
      interactive: !this.preview
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let layer: any;
    if (z.shape === 'Circle') {
      const radiusPct = z.radius ?? z.w / 2;
      layer = L.circle(this.toLatLng(z.x + z.w / 2, z.y + z.h / 2), { ...style, radius: (radiusPct / 100) * this.frame!.widthM });
    } else if ((z.shape === 'Polygon' || z.shape === 'Custom') && z.points?.length >= 3) {
      layer = L.polygon(z.points.map((p) => this.toLatLng(p.x, p.y)), style);
    } else {
      layer = L.rectangle([this.toLatLng(z.x, z.y), this.toLatLng(z.x + z.w, z.y + z.h)], style);
    }
    // Name only on hover: a label sitting on the zone would cover the spot where devices / assets get plotted
    if (!this.preview) {
      const html = `<span style="--zone:${hex}">${svgIcon(zoneIcon(z.type), 14)}</span><strong>${esc(z.name)}</strong><small>(${esc(z.code)})</small>`;
      layer.bindTooltip(html, { sticky: true, direction: 'top', offset: [0, -8], className: 'mfp-zone-label', interactive: false });
    }
    layer.on('click', (e: unknown) => {
      // While placing or drawing, the click goes on to the map
      if (this.preview || this.placing || this.drawShape) return;
      L.DomEvent.stop(e);
      this.ngZone.run(() => this.zoneSelect.emit(z));
    });
    layer.addTo(this.overlay);
  }

  /** A gateway device: reported as a gateway by the readings feed, or registered with the Gateway type. */
  private isGateway(i: PlotItem): boolean {
    return i.kind === 'device' && (this.gatewayCount(i) !== null || i.type?.toLowerCase() === 'gateway');
  }

  /**
   * "Total Assets" at the centre of each zone that holds a plotted gateway: the distinct linked assets heard by the
   * gateways in the zone. Clicking it opens the (first) gateway's popup.
   */
  private drawZoneTotals(): void {
    const L = this.L;
    this.zoneTotals = [];
    const gateways = this.visibleItems().filter((i) => this.isGateway(i));
    if (!gateways.length) return;
    for (const zone of this.visibleZones()) {
      const inZone = gateways.filter((g) => this.zoneOf(g)?.id === zone.id);
      if (!inZone.length) continue;
      const names = [...new Set(inZone.flatMap((g) => this.gatewayCount(g)?.names ?? []))];
      const n = names.length;
      const html = `<span class="mfp-ztotal${n ? '' : ' mfp-ztotal--zero'}"><small>Total Assets</small><b>${n}</b></span>`;
      const marker = L.marker(this.toLatLng(zone.x + zone.w / 2, zone.y + zone.h / 2), {
        // zero-size icon: the label centres itself on the point (it sizes to its text)
        icon: L.divIcon({ className: 'mfp-marker', html, iconSize: [0, 0], iconAnchor: [0, 0] }),
        title: `${zone.name} (${zone.code}) · ${n} linked asset${n === 1 ? '' : 's'}${n ? ': ' + names.join(', ') : ''}`,
        keyboard: true,
        // under the device / asset markers, so a device plotted near the centre stays visible and clickable
        zIndexOffset: -500
      });
      marker.on('click', (e: unknown) => {
        if (this.placing || this.drawShape) return;
        L.DomEvent.stop(e);
        this.ngZone.run(() => this.zoneTotalSelect.emit({ zone, gateways: inZone }));
      });
      marker.addTo(this.overlay);
      this.zoneTotals.push({ marker, zone });
    }
    this.fitZoneTotals();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private zoneTotals: { marker: any; zone: MapZone }[] = [];

  /**
   * Shows the "Total Assets" text only while the whole label fits inside its zone's outline on screen; when the zone
   * is drawn smaller (zoomed out), only the count is shown.
   */
  private fitZoneTotals(): void {
    if (!this.map || !this.frame) return;
    for (const { marker, zone } of this.zoneTotals) {
      const label = (marker.getElement() as HTMLElement | undefined)?.querySelector('.mfp-ztotal') as HTMLElement | null;
      if (!label) continue;
      const a = this.map.latLngToContainerPoint(this.toLatLng(zone.x, zone.y));
      const b = this.map.latLngToContainerPoint(this.toLatLng(zone.x + zone.w, zone.y + zone.h));
      const zoneW = Math.abs(b.x - a.x);
      const zoneH = Math.abs(b.y - a.y);
      // measure the full label, then decide (a little margin so it does not touch the outline)
      label.classList.remove('mfp-ztotal--compact');
      const fits = label.offsetWidth + 12 <= zoneW && label.offsetHeight + 8 <= zoneH;
      label.classList.toggle('mfp-ztotal--compact', !fits);
    }
  }

  /**
   * The zone an item sits in on the map: the smallest zone whose outline box contains its plotted point (so a small
   * zone inside a large polygon's box wins), else the zone saved with the plot.
   */
  private zoneOf(i: PlotItem): MapZone | undefined {
    if (i.x !== null && i.y !== null) {
      const x = i.x, y = i.y;
      const containing = this.store.zones
        .filter((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)
        .sort((a, b) => a.w * a.h - b.w * b.h);
      if (containing.length) return containing[0];
    }
    return i.zoneId ? this.store.zones.find((z) => z.id === i.zoneId) : undefined;
  }

  private drawItem(i: PlotItem): void {
    const L = this.L;
    const tone = TONE_HEX[i.tone];
    const active = i.id === this.selectedItemId;
    const classes = ['mfp-marker__wrap', i.kind === 'asset' ? 'mfp-marker--asset' : '', active ? 'mfp-marker--active' : ''].join(' ');
    // a gateway shows no id label: its zone carries the Total Assets count, and the tooltip names it
    const label = this.showLabels && this.showItemLabels && !this.isGateway(i) ? `<span class="mfp-marker__label">${esc(i.code)}</span>` : '';
    const html = `<span class="${classes}" style="--tone:${tone}"><span class="mfp-marker__dot">${svgIcon(i.icon, 13)}</span>${label}</span>`;
    // a gateway's tooltip names the linked assets it hears (the count is shown at its zone's centre)
    const gw = this.isGateway(i) ? this.gatewayCount(i) : null;
    const title = gw ? `${i.name} ${i.code} · ${gw.count} linked asset${gw.count === 1 ? '' : 's'}${gw.count ? ': ' + gw.names.join(', ') : ''}` : `${i.name} ${i.code}`;
    const marker = L.marker(this.toLatLng(i.x ?? 0, i.y ?? 0), {
      icon: L.divIcon({ className: 'mfp-marker', html, iconSize: [24, 24], iconAnchor: [12, 12] }),
      title,
      keyboard: true,
      zIndexOffset: i.id === this.selectedItemId ? 1000 : 0
    });
    marker.on('click', (e: unknown) => {
      if (this.placing) return;
      L.DomEvent.stop(e);
      this.ngZone.run(() => this.itemSelect.emit(i));
    });
    marker.addTo(this.overlay);
  }

  private syncScale(): void {
    if (!this.map) return;
    const want = this.showScale && !this.preview;
    if (want && !this.scale) {
      this.ngZone.runOutsideAngular(() => (this.scale = this.L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(this.map)));
    } else if (!want && this.scale) {
      this.scale.remove();
      this.scale = null;
    }
  }

  private onMapClick(latlng: { lat: number; lng: number }): void {
    if (this.preview || !this.frame) return;
    if (this.drawShape) {
      this.ngZone.run(() => this.drawClick(latlng));
      return;
    }
    if (!this.placing) return;
    const pos = this.toPercent(latlng.lat, latlng.lng);
    this.ngZone.run(() => this.place.emit(pos));
  }

  /* ===== Drawing a zone ===== */

  private get isPolygon(): boolean {
    return this.drawShape === 'Polygon' || this.drawShape === 'Custom';
  }

  get canFinishPolygon(): boolean {
    return this.isPolygon && this.drawPoints.length >= 3;
  }

  get drawHint(): string {
    const n = this.drawPoints.length;
    if (this.drawShape === 'Rectangle') return n ? 'Click the opposite corner' : 'Click the first corner of the zone';
    if (this.drawShape === 'Circle') return n ? 'Click the edge to set the radius' : 'Click the centre of the zone';
    if (n < 3) return n ? `Click the next corner (${n} placed)` : 'Click the first corner of the zone';
    return 'Click the first point or press Enter to finish · Backspace removes the last point';
  }

  private drawClick(latlng: { lat: number; lng: number }): void {
    const pts = this.drawPoints;
    if (this.drawShape === 'Rectangle' || this.drawShape === 'Circle') {
      if (!pts.length) {
        this.drawPoints = [latlng];
        this.hover = latlng;
        this.ngZone.runOutsideAngular(() => this.drawPreview());
        return;
      }
      const geom = this.drawShape === 'Rectangle' ? this.rectangleGeometry(pts[0], latlng) : this.circleGeometry(pts[0], latlng);
      if (geom) this.finish(geom);
      return;
    }
    // Polygon / custom: a click near the first point closes the shape
    if (pts.length >= 3) {
      const first = this.map.latLngToContainerPoint(pts[0]);
      if (first.distanceTo(this.map.latLngToContainerPoint(latlng)) < 12) {
        this.finishPolygon();
        return;
      }
    }
    this.drawPoints = [...pts, latlng];
    this.ngZone.runOutsideAngular(() => this.drawPreview());
  }

  finishPolygon(): void {
    if (!this.canFinishPolygon) return;
    const points = this.drawPoints.map((p) => this.toPercent(p.lat, p.lng));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    this.finish({ x: round(x), y: round(y), w: round(Math.max(...xs) - x), h: round(Math.max(...ys) - y), points: points.map((p) => ({ x: round(p.x), y: round(p.y) })), radius: null });
  }

  cancelDraw(): void {
    this.resetDraw();
    this.drawCancel.emit();
  }

  private rectangleGeometry(a: { lat: number; lng: number }, b: { lat: number; lng: number }): ZoneGeometry | null {
    const p = this.toPercent(a.lat, a.lng);
    const q = this.toPercent(b.lat, b.lng);
    const x = Math.min(p.x, q.x);
    const y = Math.min(p.y, q.y);
    const w = Math.abs(p.x - q.x);
    const h = Math.abs(p.y - q.y);
    if (w < 0.5 || h < 0.5) return null; // a click, not a box: keep waiting for the second corner
    return { x: round(x), y: round(y), w: round(w), h: round(h), points: [], radius: null };
  }

  private circleGeometry(centre: { lat: number; lng: number }, edge: { lat: number; lng: number }): ZoneGeometry | null {
    const f = this.frame!;
    const metres = this.map.distance(centre, edge);
    const heightM = f.dLat * METRES_PER_DEGREE_LAT;
    const rx = (metres / f.widthM) * 100; // radius in % of the plan width (what the API stores)
    const ry = (metres / heightM) * 100;
    if (rx < 0.3) return null;
    const c = this.toPercent(centre.lat, centre.lng);
    return { x: round(c.x - rx), y: round(c.y - ry), w: round(2 * rx), h: round(2 * ry), points: [], radius: round(rx) };
  }

  private finish(geom: ZoneGeometry): void {
    this.resetDraw();
    this.zoneDrawn.emit(geom);
  }

  private resetDraw(): void {
    this.drawPoints = [];
    this.hover = null;
    this.drawLayer?.clearLayers();
    if (this.map) {
      // Double-click adds points while drawing instead of zooming
      if (this.drawShape) this.map.doubleClickZoom.disable();
      else if (!this.preview) this.map.doubleClickZoom.enable();
    }
  }

  /** Redraws the outline being drawn: placed points plus the mouse position. */
  private drawPreview(): void {
    const L = this.L;
    if (!this.drawLayer || !L) return;
    this.drawLayer.clearLayers();
    const pts = this.drawPoints;
    if (!pts.length) return;
    const style = { color: '#6d28d9', weight: 2, dashArray: '6 4', fillColor: '#7c3aed', fillOpacity: 0.15, interactive: false };
    const hover = this.hover ?? pts[pts.length - 1];
    if (this.drawShape === 'Rectangle') {
      L.rectangle([pts[0], hover], style).addTo(this.drawLayer);
    } else if (this.drawShape === 'Circle') {
      L.circle(pts[0], { ...style, radius: Math.max(this.map.distance(pts[0], hover), 0.1) }).addTo(this.drawLayer);
    } else {
      L.polyline([...pts, hover], { ...style, fill: false }).addTo(this.drawLayer);
      if (pts.length >= 3) L.polygon(pts, { ...style, dashArray: undefined, weight: 0 }).addTo(this.drawLayer);
    }
    pts.forEach((p, i) =>
      L.circleMarker(p, { radius: i === 0 ? 6 : 4, color: '#fff', weight: 2, fillColor: '#6d28d9', fillOpacity: 1, interactive: false }).addTo(this.drawLayer)
    );
  }

  /** Esc cancels, Enter finishes a polygon, Backspace removes its last point. */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.drawShape || this.preview) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelDraw();
    } else if (event.key === 'Enter' && this.canFinishPolygon) {
      event.preventDefault();
      this.finishPolygon();
    } else if (event.key === 'Backspace' && this.isPolygon && this.drawPoints.length) {
      event.preventDefault();
      this.drawPoints = this.drawPoints.slice(0, -1);
      this.ngZone.runOutsideAngular(() => this.drawPreview());
    }
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Escapes text for the Leaflet HTML (labels, tooltips). */
function esc(text: string | null | undefined): string {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A lucide icon as an inline SVG string (marker and zone label HTML can't use the Angular component). */
function svgIcon(icon: LucideIconData | null | undefined, size: number): string {
  if (!icon) return '';
  const nodes = icon
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs ?? {})
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${esc(String(v))}"`)
        .join(' ');
      return `<${tag} ${a}></${tag}>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodes}</svg>`;
}
