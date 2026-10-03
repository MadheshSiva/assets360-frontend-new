import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ZONE_TYPE_OPTIONS, ZoneType } from '../map/map';

export interface FloorPlanZoneInput {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
}

export interface FloorPlanPin {
  left: number;
  top: number;
  color: string;
  label: string;
}

export interface DrawPoint {
  x: number;
  y: number;
}

/** One asset icon dropped inside a drawn zone, at the spot the user clicked. */
export interface ZoneAsset extends DrawPoint {
  id: string;
}

export interface DrawnZone {
  id: string;
  points: DrawPoint[];
  color: string;
  opacity: number;
  assets: ZoneAsset[];
  zoneType?: ZoneType;
}

const DEFAULT_ZONE_COLOR = '#5b3df5';

/**
 * A static floor-plan image with real-zone pins overlaid, plus tools to draw
 * ad-hoc zones on top of it and attach one or more assets to each drawn zone.
 * Used wherever a floor's image-based view is shown (Projects config, Locating).
 */
@Component({
  standalone: true,
  selector: 'app-floor-plan',
  imports: [CommonModule, FormsModule],
  templateUrl: './floor-plan.html',
  styleUrls: ['./floor-plan.css'],
})
export class FloorPlanComponent implements OnChanges {
  @Input() image = 'mapp.png';
  /** Identifies the floor being displayed; drawn zones are kept separate per floor,
   *  and changing this resets zoom/pan/draw state (mirrors switching floors). */
  @Input() floorId: string | null = null;
  @Input() zones: FloorPlanZoneInput[] = [];
  /** Read-only mode (Phase 2 role gating): hides zone drawing/editing from Viewer-level roles. */
  @Input() controlsDisabled = false;
  /** Label shown on each drawn zone's asset count (e.g. "Unique Assets", "Movable Assets"),
   *  driven by the host's asset-category filter so it stays in sync with the toolbar. */
  @Input() assetLabel = 'Unique Assets';
  /** Lets the plan be dragged anywhere at any zoom (Locating), instead of only panning while zoomed in. */
  @Input() freePan = false;
  /** Fired when a placed asset icon is clicked, so the host can show that asset's details. */
  @Output() assetClick = new EventEmitter<{ zone: DrawnZone; asset: ZoneAsset }>();
  /** Fired when the zone's "<Label>: N" count badge is clicked, so the host can list every
   *  asset placed in that zone (name + type), not just one at a time. */
  @Output() assetsSummaryClick = new EventEmitter<DrawnZone>();

  get floorPlanPins(): FloorPlanPin[] {
    if (this.zones.length === 0) return [];

    const lats = this.zones.map((zone) => zone.lat);
    const lngs = this.zones.map((zone) => zone.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    return this.zones.map((zone) => ({
      left: 10 + ((zone.lng - minLng) / lngRange) * 80,
      top: 10 + ((maxLat - zone.lat) / latRange) * 80,
      color: zone.color,
      label: zone.name,
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['floorId'] && !changes['floorId'].firstChange) {
      this.resetFloorPlanTools();
    }
  }

  // ===== Zoom / pan =====

  readonly minZoom = 1;
  readonly maxZoom = 3;
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isPanning = false;

  @ViewChild('floorPlanCanvas') floorPlanCanvasRef?: ElementRef<HTMLElement>;

  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  get canPan(): boolean {
    return !this.isDrawing && (this.freePan || this.zoomLevel > this.minZoom);
  }

  /** How far the zoom layer may move from center. Normally just enough to reach the edges of the
   *  zoomed image; with freePan, until only ~20% of the plan is left in view. */
  private maxPan(rect: DOMRect): { x: number; y: number } {
    const reach = this.freePan ? this.zoomLevel / 2 + 0.3 : (this.zoomLevel - 1) / 2;
    return { x: reach * rect.width, y: reach * rect.height };
  }

  startPan(event: MouseEvent): void {
    if (!this.canPan) return;
    event.preventDefault();
    this.isPanning = true;
    this.dragMoved = false;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
    if (!this.dragMoved) return;

    const rect = this.floorPlanCanvasRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const max = this.maxPan(rect);
    this.panX = this.clamp(this.panStartX + dx, -max.x, max.x);
    this.panY = this.clamp(this.panStartY + dy, -max.y, max.y);
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.isPanning = false;
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(this.maxZoom, +(this.zoomLevel + 0.25).toFixed(2));
    this.clampPanToZoom();
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(this.minZoom, +(this.zoomLevel - 0.25).toFixed(2));
    this.clampPanToZoom();
  }

  isFullscreen = false;

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {}

  /** Expands the whole floor plan (tools + canvas) to fill the screen, or exits fullscreen. */
  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.hostRef.nativeElement.requestFullscreen?.();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = document.fullscreenElement === this.hostRef.nativeElement;
  }

  private clampPanToZoom(): void {
    const rect = this.floorPlanCanvasRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const max = this.maxPan(rect);
    this.panX = this.clamp(this.panX, -max.x, max.x);
    this.panY = this.clamp(this.panY, -max.y, max.y);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private clampPct(value: number): number {
    return this.clamp(value, 0, 100);
  }

  /** The asset icon most recently zoomed to via `flyToAsset`, kept ringed/pulsing
   *  indefinitely — until a different asset is located or the canvas is deselected —
   *  so it stays unmistakable even when several icons started out clustered together. */
  highlightedAssetId: string | null = null;

  /** The zoom/pan state as it was right before the first `flyToAsset` call in the
   *  current "detour" — lets "Back" return to wherever the user actually was
   *  (mid-drawing, panned, etc.) instead of always resetting to the default view. */
  private preFlyView: { zoomLevel: number; panX: number; panY: number } | null = null;

  get hasPreviousView(): boolean {
    return this.preFlyView !== null;
  }

  /** Zooms and pans so the given asset icon is centered in the canvas, then highlights
   *  it — used when a "Location" action elsewhere (e.g. a table row) needs to reveal
   *  which of several overlapping icons a given asset actually is. */
  flyToAsset(zone: DrawnZone, asset: ZoneAsset, targetZoom: number = this.maxZoom): void {
    if (!this.preFlyView) {
      this.preFlyView = { zoomLevel: this.zoomLevel, panX: this.panX, panY: this.panY };
    }

    this.selectedZoneId = zone.id;
    this.showOpacitySlider = false;
    this.zoomLevel = this.clamp(targetZoom, this.minZoom, this.maxZoom);

    this.floorPlanCanvasRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const rect = this.floorPlanCanvasRef?.nativeElement.getBoundingClientRect();
    if (rect) {
      const maxPanX = ((this.zoomLevel - 1) / 2) * rect.width;
      const maxPanY = ((this.zoomLevel - 1) / 2) * rect.height;
      this.panX = this.clamp((0.5 - asset.x / 100) * this.zoomLevel * rect.width, -maxPanX, maxPanX);
      this.panY = this.clamp((0.5 - asset.y / 100) * this.zoomLevel * rect.height, -maxPanY, maxPanY);
    }

    this.highlightedAssetId = asset.id;
  }

  /** Restores the zoom/pan state captured just before the last `flyToAsset` detour. */
  goToPreviousView(): void {
    if (!this.preFlyView) return;
    this.zoomLevel = this.preFlyView.zoomLevel;
    this.panX = this.preFlyView.panX;
    this.panY = this.preFlyView.panY;
    this.preFlyView = null;
    this.highlightedAssetId = null;
    this.selectedZoneId = null;
  }

  // ===== Draw zones on the image =====

  isDrawing = false;
  drawingPoints: DrawPoint[] = [];
  drawColor = DEFAULT_ZONE_COLOR;
  drawZoneType: ZoneType = 'custom';
  drawOpacity = 0.55;
  readonly zoneTypeOptions = ZONE_TYPE_OPTIONS;

  /** Opacity of the floor plan image itself — useful for seeing zones/pins more
   *  clearly against a faded background. Adjusted by the same opacity slider when
   *  no zone is selected; adjusting a selected zone's fill takes over otherwise. */
  imageOpacity = 1;

  selectedZoneId: string | null = null;
  showOpacitySlider = false;

  private drawnZonesByFloor = new Map<string, DrawnZone[]>();

  get drawnZones(): DrawnZone[] {
    return this.floorId ? this.drawnZonesByFloor.get(this.floorId) ?? [] : [];
  }

  get selectedZone(): DrawnZone | null {
    return this.drawnZones.find((zone) => zone.id === this.selectedZoneId) ?? null;
  }

  /** Every placed asset icon across all drawn zones, flattened for the template's *ngFor. */
  get zonePins(): { zone: DrawnZone; asset: ZoneAsset }[] {
    return this.drawnZones.flatMap((zone) => zone.assets.map((asset) => ({ zone, asset })));
  }

  get drawingPreviewPoints(): string {
    return this.drawingPoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  polygonPoints(zone: DrawnZone): string {
    return zone.points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  toggleDraw(): void {
    if (this.controlsDisabled) return;
    this.isDrawing = !this.isDrawing;
    this.drawingPoints = [];
    this.selectedZoneId = null;
    this.showOpacitySlider = false;
  }

  /** Distance (in the 0-100 image-percent space) within which clicking counts as
   *  hitting the first placed point again, closing the shape early. */
  private readonly closePointRadius = 3;

  /** Converts a click into the same 0-100 image-percent space used by drawn-zone
   *  points, undoing the canvas's independent pan/zoom transform. Always measured
   *  against the canvas element itself, not whichever child was actually clicked. */
  private toImagePoint(event: MouseEvent): DrawPoint | null {
    const rect = this.floorPlanCanvasRef?.nativeElement.getBoundingClientRect();
    if (!rect) return null;
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    return {
      x: this.clampPct((0.5 + (fx - 0.5 - this.panX / rect.width) / this.zoomLevel) * 100),
      y: this.clampPct((0.5 + (fy - 0.5 - this.panY / rect.height) / this.zoomLevel) * 100),
    };
  }

  onFloorPlanClick(event: MouseEvent): void {
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    if (!this.isDrawing) {
      // Clicked empty canvas (not a zone, not one of its asset icons) — deselect.
      this.selectedZoneId = null;
      this.showOpacitySlider = false;
      this.highlightedAssetId = null;
      return;
    }
    const point = this.toImagePoint(event);
    if (!point) return;

    // Clicking back on the starting point closes the shape immediately, whatever
    // its number of sides — 3 points finishes a triangle, 4 a square, and so on.
    if (this.drawingPoints.length >= 3 && this.isNearFirstPoint(point)) {
      this.finishDrawing();
      return;
    }

    this.drawingPoints = [...this.drawingPoints, point];
  }

  onFloorPlanDblClick(event: MouseEvent): void {
    event.preventDefault();
    this.finishDrawing();
  }

  private isNearFirstPoint(point: DrawPoint): boolean {
    const first = this.drawingPoints[0];
    return Math.hypot(point.x - first.x, point.y - first.y) <= this.closePointRadius;
  }

  /** Closes the in-progress shape (however many sides it ended up with) and selects it. */
  private finishDrawing(): void {
    if (!this.isDrawing || this.drawingPoints.length < 3) return;
    if (!this.floorId) return;

    const zone: DrawnZone = {
      id: crypto.randomUUID(),
      points: this.drawingPoints,
      color: this.drawColor,
      opacity: this.drawOpacity,
      assets: [],
      zoneType: this.drawZoneType,
    };
    this.drawnZonesByFloor.set(this.floorId, [...(this.drawnZonesByFloor.get(this.floorId) ?? []), zone]);

    this.drawingPoints = [];
    this.isDrawing = false;
    this.selectedZoneId = zone.id;
  }

  centroidX(zone: DrawnZone): number {
    return zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
  }

  centroidY(zone: DrawnZone): number {
    return zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
  }

  /** Clicking inside a finished shape both selects it (for the color/delete/opacity
   *  tools) and drops a new asset icon at the exact spot clicked — click once for a
   *  single asset, click again elsewhere inside the same shape to add another. */
  addAssetAt(zone: DrawnZone, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isDrawing) return;
    // A drag that ended over a zone is a pan, not a click — don't drop an asset icon.
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    const point = this.toImagePoint(event);
    if (!point) return;
    this.selectedZoneId = zone.id;
    this.showOpacitySlider = false;
    zone.assets = [...zone.assets, { id: crypto.randomUUID(), ...point }];
  }

  /** Click an existing asset icon to open its details (host listens on `assetClick`). */
  onAssetPinClick(zone: DrawnZone, asset: ZoneAsset, event: MouseEvent): void {
    event.stopPropagation();
    this.assetClick.emit({ zone, asset });
  }

  /** Click the "<Label>: N" badge to see every asset placed in that zone. */
  onAssetsSummaryClick(zone: DrawnZone, event: MouseEvent): void {
    event.stopPropagation();
    if (!zone.assets.length) return;
    this.assetsSummaryClick.emit(zone);
  }

  /** Removes one placed asset icon — called by the host, e.g. from a "Remove from zone"
   *  action in its own asset-details view, so it stays reachable without a second click target. */
  removeAsset(zone: DrawnZone, assetId: string): void {
    zone.assets = zone.assets.filter((a) => a.id !== assetId);
  }

  deleteSelectedZone(): void {
    if (!this.floorId || !this.selectedZoneId || this.controlsDisabled) return;
    const remaining = this.drawnZones.filter((zone) => zone.id !== this.selectedZoneId);
    this.drawnZonesByFloor.set(this.floorId, remaining);
    this.selectedZoneId = null;
  }

  toggleOpacitySlider(): void {
    this.showOpacitySlider = !this.showOpacitySlider;
  }

  setColor(color: string): void {
    this.drawColor = color;
    const zone = this.selectedZone;
    if (zone) zone.color = color;
  }

  /** Picking a zone type (Safety/Restricted/Parking/…) also applies its preset color. */
  setZoneType(type: ZoneType): void {
    this.drawZoneType = type;
    const preset = this.zoneTypeOptions.find((o) => o.value === type);
    if (preset) this.setColor(preset.color);
    const zone = this.selectedZone;
    if (zone) zone.zoneType = type;
  }

  setOpacity(value: number): void {
    const zone = this.selectedZone;
    if (zone) {
      zone.opacity = value;
      this.drawOpacity = value;
    } else {
      this.imageOpacity = value;
    }
  }

  private resetFloorPlanTools(): void {
    this.isDrawing = false;
    this.drawingPoints = [];
    this.selectedZoneId = null;
    this.showOpacitySlider = false;
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.imageOpacity = 1;
    this.highlightedAssetId = null;
    this.preFlyView = null;
  }
}
