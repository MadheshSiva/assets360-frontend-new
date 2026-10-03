import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { loadLeaflet } from './leaflet-loader';

export interface MapLocation {
  name: string;
  coords: { lat: number; lng: number; zoom: number };
  children?: MapLocation[];
}

export interface MapPin {
  /** Stable identity across pin-array refreshes. Required for smooth movement animation and path trails. */
  id?: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  kind?: 'count' | 'device' | 'camera';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export type ZoneType = 'safety' | 'high_value' | 'restricted' | 'parking' | 'evacuation' | 'custom';

export const ZONE_TYPE_OPTIONS: { value: ZoneType; label: string; color: string }[] = [
  { value: 'safety', label: 'Safety', color: '#158b4b' },
  { value: 'high_value', label: 'High-Value', color: '#a8650a' },
  { value: 'restricted', label: 'Restricted', color: '#c22a3e' },
  { value: 'parking', label: 'Parking', color: '#2563eb' },
  { value: 'evacuation', label: 'Evacuation', color: '#ea580c' },
  { value: 'custom', label: 'Custom', color: '#5b3df5' },
];

export interface GeoZone {
  id: string;
  latlngs: { lat: number; lng: number }[];
  color: string;
  opacity: number;
  zoneType?: ZoneType;
}

export interface ZoneSensor {
  id: string;
  zoneId: string;
  lat: number;
  lng: number;
}

const GEO_ZONE_COLORS = [
  { label: 'Purple', value: '#5b3df5' },
  { label: 'Red', value: '#c22a3e' },
  { label: 'Green', value: '#158b4b' },
  { label: 'Amber', value: '#a8650a' },
  { label: 'Blue', value: '#2563eb' },
];

@Component({
  standalone: true,
  selector: 'app-map',
  imports: [CommonModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
})
export class MapComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() locations: MapLocation[] = [];
  @Input() pins: MapPin[] = [];

  /** Opt-in analytics/visualization layers (Phase 2). All default off so existing callers are unaffected. */
  @Input() clusterEnabled = false;
  @Input() showTrails = false;
  @Input() showHeatmap = false;
  @Input() showDeviceHealth = false;
  /** Read-only mode (Phase 2 role gating): hides zone drawing/editing from Viewer-level roles. */
  @Input() controlsDisabled = false;

  @Output() locationClick = new EventEmitter<MapLocation>();
  @Output() pinClick = new EventEmitter<MapPin>();
  @Output() zoneDrawn = new EventEmitter<GeoZone>();
  @Output() zoneDeleted = new EventEmitter<string>();
  @Output() sensorAdded = new EventEmitter<ZoneSensor>();
  @Output() sensorRemoved = new EventEmitter<string>();

  readonly zoneColors = GEO_ZONE_COLORS;
  readonly zoneTypeOptions = ZONE_TYPE_OPTIONS;

  isDrawing = false;
  drawColor = GEO_ZONE_COLORS[0].value;
  drawZoneType: ZoneType = 'custom';
  drawOpacity = 0.4;
  selectedZoneId: string | null = null;
  showColorPicker = false;
  showZoneTypePicker = false;
  showOpacitySlider = false;
  isPlacingSensor = false;

  private drawnZones: GeoZone[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drawnLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private previewLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drawingLatLngs: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private zoneLayerById = new Map<string, any>();

  private sensors: ZoneSensor[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sensorLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sensorMarkerById = new Map<string, any>();

  // ===== Phase 2: clustering / trails / heatmap / device health state =====
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private markerById = new Map<string, any>();
  private trailHistory = new Map<string, { lat: number; lng: number }[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trailLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private heatLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private healthLayer?: any;
  /** Sorted, pipe-joined pin ids from the last structural render; null if any pin lacks an id. */
  private lastPinIds: string | null = null;
  private readonly onViewChange = (): void => this.reclusterInPlace();

  @ViewChild('mapEl', { static: false }) mapEl?: ElementRef<HTMLDivElement>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private marker?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private markersLayer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private L?: any;

  private readonly isBrowser: boolean;
  /** Guards against overlapping initializeMap() calls while the async Leaflet load is in flight. */
  private mapInitStarted = false;
  /** Keeps Leaflet's tiles in sync when the host resizes the container (e.g. side panels toggling). */
  private resizeObserver?: ResizeObserver;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser || !this.mapEl) return;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(this.mapEl.nativeElement);
    }
    if (this.locations.length === 0 && this.pins.length === 0) return;
    await this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['locations'] && !changes['locations'].firstChange) {
      if (this.map) {
        this.updateInitialLocation();
      } else if (this.isBrowser && this.mapEl && this.locations.length > 0 && !this.mapInitStarted) {
        // Locations arrived after ngAfterViewInit already found nothing to initialize with
        // (e.g. data loaded asynchronously) — initialize now instead of staying blank forever.
        this.initializeMap();
      }
    }
    if (changes['pins'] && !changes['pins'].firstChange) {
      if (this.map) {
        this.renderPins();
      } else if (this.isBrowser && this.mapEl && this.pins.length > 0 && !this.mapInitStarted) {
        this.initializeMap();
      }
    }

    const visualOptionKeys = ['clusterEnabled', 'showTrails', 'showHeatmap', 'showDeviceHealth'];
    const visualOptionsChanged = visualOptionKeys.some((key) => changes[key] && !changes[key].firstChange);
    if (visualOptionsChanged && this.map) {
      // Force the next renderPins() through the full structural path so the new option takes effect.
      this.lastPinIds = null;
      this.renderPins();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.off('zoomend', this.onViewChange);
    this.map?.remove();
    this.map = undefined;
  }

  private async initializeMap(): Promise<void> {
    if (this.mapInitStarted || this.map) return;
    if (!this.mapEl || (this.locations.length === 0 && this.pins.length === 0)) return;
    this.mapInitStarted = true;
    this.L = await loadLeaflet();
    if (!this.mapEl || (this.locations.length === 0 && this.pins.length === 0)) {
      // locations/pins were cleared while Leaflet was loading — nothing to render (yet).
      this.mapInitStarted = false;
      return;
    }
    const L = this.L;

    if (this.pins.length > 0) {
      this.map = L.map(this.mapEl.nativeElement, {
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(this.map);
      this.map.on('zoomend', this.onViewChange);

      this.renderPins();

      setTimeout(() => this.map?.invalidateSize(), 100);
      setTimeout(() => this.map?.invalidateSize(), 400);
      return;
    }

    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const start = this.locations[0].coords;
    this.map = L.map(this.mapEl.nativeElement, {
      center: [start.lat, start.lng],
      zoom: start.zoom,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    this.marker = L.marker([start.lat, start.lng], { icon }).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 100);
    setTimeout(() => this.map?.invalidateSize(), 400);
  }

  // ===== Pin rendering: structural (recreate + fit bounds) vs. in-place (smooth animation) =====

  private renderPins(): void {
    if (!this.map || !this.L) return;

    const ids = this.pins.every((p) => p.id) ? this.pins.map((p) => p.id).sort().join('|') : null;
    const canAnimateInPlace = ids !== null && ids === this.lastPinIds && this.markersLayer && !this.clusterEnabled;

    if (canAnimateInPlace) {
      this.animatePinsToNewPositions();
      this.recordTrails();
      if (this.showTrails) this.renderTrails();
      if (this.showDeviceHealth) this.renderDeviceHealth();
      if (this.showHeatmap) this.renderHeatmap();
      return;
    }

    this.lastPinIds = ids;
    this.structuralRenderPins();
  }

  private structuralRenderPins(): void {
    const L = this.L;

    this.markerById.clear();
    this.markersLayer?.clearLayers();
    this.markersLayer ??= L.layerGroup().addTo(this.map);

    if (this.pins.length > 0) {
      const bounds = L.latLngBounds(this.pins.map((pin) => [pin.lat, pin.lng]));
      this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }

    const groups = this.clusterEnabled ? this.clusterPins(this.pins) : this.pins.map((p) => [p]);
    groups.forEach((group) => (group.length > 1 ? this.renderClusterMarker(group) : this.renderSingleMarker(group[0])));

    this.recordTrails();
    if (this.showTrails) this.renderTrails();
    else this.trailLayer?.clearLayers();

    if (this.showHeatmap) this.renderHeatmap();
    else this.clearHeatmap();

    if (this.showDeviceHealth) this.renderDeviceHealth();
    else this.healthLayer?.clearLayers();
  }

  /** Re-groups existing pins into clusters after a zoom/pan, without touching bounds, trails, or history. */
  private reclusterInPlace(): void {
    if (!this.clusterEnabled || !this.map || !this.L) return;
    const L = this.L;
    this.markerById.clear();
    this.markersLayer?.clearLayers();
    this.markersLayer ??= L.layerGroup().addTo(this.map);
    const groups = this.clusterPins(this.pins);
    groups.forEach((group) => (group.length > 1 ? this.renderClusterMarker(group) : this.renderSingleMarker(group[0])));
  }

  private renderSingleMarker(pin: MapPin): void {
    const L = this.L;
    const pinIcon = L.divIcon({
      className: 'colored-pin-icon',
      html: this.buildPinSvg(pin.color || '#2563eb'),
      iconSize: [28, 34],
      iconAnchor: [14, 34],
    });
    const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(this.markersLayer);
    if (pin.kind) {
      marker.on('click', () => this.pinClick.emit(pin));
    }
    if (pin.id) this.markerById.set(pin.id, marker);
  }

  /** Groups pins within a fixed pixel radius of each other at the current zoom (simple, dependency-free clustering). */
  private clusterPins(pins: MapPin[]): MapPin[][] {
    if (!this.map || pins.length === 0) return pins.map((p) => [p]);
    const radiusPx = 46;
    const points = pins.map((p) => this.map.latLngToContainerPoint([p.lat, p.lng]));
    const used = new Array(pins.length).fill(false);
    const groups: MapPin[][] = [];

    for (let i = 0; i < pins.length; i++) {
      if (used[i]) continue;
      const group = [pins[i]];
      used[i] = true;
      for (let j = i + 1; j < pins.length; j++) {
        if (used[j]) continue;
        if (points[i].distanceTo(points[j]) <= radiusPx) {
          group.push(pins[j]);
          used[j] = true;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  private renderClusterMarker(group: MapPin[]): void {
    const L = this.L;
    const lat = group.reduce((sum, p) => sum + p.lat, 0) / group.length;
    const lng = group.reduce((sum, p) => sum + p.lng, 0) / group.length;
    const icon = L.divIcon({
      className: 'cluster-marker-icon',
      html: `<div class="cluster-marker-badge">${group.length}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const marker = L.marker([lat, lng], { icon }).addTo(this.markersLayer);
    marker.on('click', () => {
      const currentZoom = this.map.getZoom() ?? 13;
      this.map.flyTo([lat, lng], Math.min(currentZoom + 3, 18), { duration: 0.6 });
    });
  }

  /** Tweens each existing marker to its new coordinates instead of a hard jump. */
  private animatePinsToNewPositions(): void {
    const durationMs = 500;
    this.pins.forEach((pin) => {
      if (!pin.id) return;
      const marker = this.markerById.get(pin.id);
      if (!marker) return;
      const from = marker.getLatLng();
      if (from.lat === pin.lat && from.lng === pin.lng) return;

      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        marker.setLatLng([from.lat + (pin.lat - from.lat) * t, from.lng + (pin.lng - from.lng) * t]);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ===== Phase 2: path trails =====

  private recordTrails(): void {
    this.pins.forEach((pin) => {
      if (!pin.id) return;
      const history = this.trailHistory.get(pin.id) ?? [];
      const last = history[history.length - 1];
      if (!last || last.lat !== pin.lat || last.lng !== pin.lng) {
        history.push({ lat: pin.lat, lng: pin.lng });
        if (history.length > 8) history.shift();
        this.trailHistory.set(pin.id, history);
      }
    });
  }

  private renderTrails(): void {
    const L = this.L;
    this.trailLayer?.clearLayers();
    this.trailLayer ??= L.layerGroup().addTo(this.map);

    this.trailHistory.forEach((points, id) => {
      if (points.length < 2) return;
      const pin = this.pins.find((p) => p.id === id);
      const color = pin?.color || '#5b3df5';
      for (let i = 1; i < points.length; i++) {
        const opacity = 0.1 + (i / points.length) * 0.45;
        L.polyline(
          [
            [points[i - 1].lat, points[i - 1].lng],
            [points[i].lat, points[i].lng],
          ],
          { color, weight: 3, opacity },
        ).addTo(this.trailLayer);
      }
    });
  }

  // ===== Phase 2: heatmap (dependency-free approximation via layered translucent circles) =====

  private renderHeatmap(): void {
    const L = this.L;
    this.heatLayer?.remove();
    this.heatLayer = L.layerGroup().addTo(this.map);
    this.pins.forEach((pin) => {
      L.circle([pin.lat, pin.lng], { radius: 40, stroke: false, fillColor: '#f97316', fillOpacity: 0.18 }).addTo(
        this.heatLayer,
      );
      L.circle([pin.lat, pin.lng], { radius: 18, stroke: false, fillColor: '#dc2626', fillOpacity: 0.32 }).addTo(
        this.heatLayer,
      );
    });
  }

  private clearHeatmap(): void {
    this.heatLayer?.remove();
    this.heatLayer = undefined;
  }

  // ===== Phase 2: device health layer (battery badge under device pins) =====

  private renderDeviceHealth(): void {
    const L = this.L;
    this.healthLayer?.clearLayers();
    this.healthLayer ??= L.layerGroup().addTo(this.map);

    this.pins
      .filter((pin) => pin.kind === 'device' && pin.payload?.battery !== undefined)
      .forEach((pin) => {
        const battery = pin.payload.battery as number;
        const color = battery > 50 ? '#16a34a' : battery > 20 ? '#d97706' : '#dc2626';
        const icon = L.divIcon({
          className: 'device-health-badge-icon',
          html: `<div class="device-health-badge" style="border-color:${color};color:${color}">${battery}%</div>`,
          iconSize: [42, 16],
          iconAnchor: [21, -16],
        });
        L.marker([pin.lat, pin.lng], { icon, interactive: false }).addTo(this.healthLayer);
      });
  }

  private buildPinSvg(color: string): string {
    return `<svg width="28" height="34" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <path fill="${color}" stroke="white" stroke-width="1" d="M12 0C5.9 0 1 4.9 1 11c0 8.25 11 18 11 18s11-9.75 11-18c0-6.1-4.9-11-11-11z"/>
      <circle cx="12" cy="11" r="4.2" fill="white"/>
    </svg>`;
  }

  private updateInitialLocation(): void {
    if (!this.map || !this.marker || this.locations.length === 0) return;
    const start = this.locations[0].coords;
    this.map.setView([start.lat, start.lng], start.zoom);
    this.marker.setLatLng([start.lat, start.lng]);
  }

  flyTo(coords: { lat: number; lng: number; zoom: number }): void {
    if (this.map && this.L) {
      this.map.flyTo([coords.lat, coords.lng], coords.zoom, { duration: 0.8 });
      if (this.marker) {
        this.marker.setLatLng([coords.lat, coords.lng]);
      }
    }
  }

  zoomIn(): void {
    this.map?.zoomIn();
  }

  zoomOut(): void {
    this.map?.zoomOut();
  }

  // ===== Draw geo-referenced zones directly on the live map (real lat/lng polygons) =====

  get selectedZone(): GeoZone | null {
    return this.drawnZones.find((zone) => zone.id === this.selectedZoneId) ?? null;
  }

  toggleDraw(): void {
    if (!this.map || !this.L || this.controlsDisabled) return;
    this.stopPlacingSensors();
    this.isDrawing = !this.isDrawing;
    this.showColorPicker = false;
    this.showZoneTypePicker = false;
    this.showOpacitySlider = false;
    this.selectedZoneId = null;
    this.drawingLatLngs = [];
    this.clearPreview();

    if (this.isDrawing) {
      this.map.dragging.disable();
      this.map.doubleClickZoom.disable();
      this.map.on('click', this.handleDrawClick);
      this.map.on('dblclick', this.handleDrawDblClick);
    } else {
      this.stopDrawListening();
    }
  }

  private stopDrawListening(): void {
    if (!this.map) return;
    this.map.dragging.enable();
    this.map.doubleClickZoom.enable();
    this.map.off('click', this.handleDrawClick);
    this.map.off('dblclick', this.handleDrawDblClick);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDrawClick = (e: any): void => {
    // Clicking back near the starting point closes the shape (standard GIS UX) —
    // more reliable than depending on a native dblclick, which some trackpads/browsers
    // don't consistently deliver.
    if (this.drawingLatLngs.length >= 3) {
      const firstPt = this.map.latLngToContainerPoint(this.drawingLatLngs[0]);
      const clickPt = e.containerPoint ?? this.map.latLngToContainerPoint(e.latlng);
      if (firstPt.distanceTo(clickPt) <= 12) {
        this.finalizeZone();
        return;
      }
    }
    this.drawingLatLngs = [...this.drawingLatLngs, e.latlng];
    this.renderPreview();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDrawDblClick = (): void => {
    if (this.drawingLatLngs.length < 3) return;
    this.finalizeZone();
  };

  @HostListener('document:keydown.enter')
  onEnterKey(): void {
    if (!this.isDrawing || this.drawingLatLngs.length < 3) return;
    this.finalizeZone();
  }

  private renderPreview(): void {
    const L = this.L;
    this.previewLayer?.remove();
    if (this.drawingLatLngs.length === 0) return;

    this.previewLayer = L.layerGroup().addTo(this.map);
    L.polyline(this.drawingLatLngs, { color: this.drawColor, weight: 2, dashArray: '4,4' }).addTo(
      this.previewLayer,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.drawingLatLngs.forEach((ll: any) => {
      L.circleMarker(ll, { radius: 4, color: this.drawColor, fillColor: this.drawColor, fillOpacity: 1 }).addTo(
        this.previewLayer,
      );
    });
  }

  private clearPreview(): void {
    this.previewLayer?.remove();
    this.previewLayer = undefined;
  }

  private finalizeZone(): void {
    const zone: GeoZone = {
      id: crypto.randomUUID(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      latlngs: this.drawingLatLngs.map((ll: any) => ({ lat: ll.lat, lng: ll.lng })),
      color: this.drawColor,
      opacity: this.drawOpacity,
      zoneType: this.drawZoneType,
    };
    this.drawnZones = [...this.drawnZones, zone];
    this.renderZone(zone);
    this.zoneDrawn.emit(zone);

    this.drawingLatLngs = [];
    this.clearPreview();
    this.isDrawing = false;
    this.stopDrawListening();
    this.selectedZoneId = zone.id;
  }

  private renderZone(zone: GeoZone): void {
    const L = this.L;
    this.drawnLayer ??= L.layerGroup().addTo(this.map);
    const layer = L.polygon(
      zone.latlngs.map((p) => [p.lat, p.lng]),
      { color: zone.color, weight: 2, fillColor: zone.color, fillOpacity: zone.opacity },
    ).addTo(this.drawnLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer.on('click', (evt: any) => {
      L.DomEvent.stopPropagation(evt);
      if (this.isDrawing) return;
      if (this.isPlacingSensor) {
        // The zone's fill intercepts the click before it reaches the map, so
        // sensor placement has to be handled here too, not just in handleSensorClick.
        this.tryAddSensorAt(evt.latlng, zone.id);
        return;
      }
      this.stopPlacingSensors();
      this.selectedZoneId = this.selectedZoneId === zone.id ? null : zone.id;
      this.showColorPicker = false;
      this.showZoneTypePicker = false;
      this.showOpacitySlider = false;
    });

    this.zoneLayerById.set(zone.id, layer);
  }

  toggleColorPicker(): void {
    this.showColorPicker = !this.showColorPicker;
    this.showZoneTypePicker = false;
    this.showOpacitySlider = false;
  }

  toggleZoneTypePicker(): void {
    this.showZoneTypePicker = !this.showZoneTypePicker;
    this.showColorPicker = false;
    this.showOpacitySlider = false;
  }

  toggleOpacitySlider(): void {
    this.showOpacitySlider = !this.showOpacitySlider;
    this.showColorPicker = false;
    this.showZoneTypePicker = false;
  }

  setColor(color: string): void {
    this.drawColor = color;
    const zone = this.selectedZone;
    if (zone) {
      zone.color = color;
      this.zoneLayerById.get(zone.id)?.setStyle({ color, fillColor: color });
    }
    this.showColorPicker = false;
  }

  /** Picking a zone type (Safety/Restricted/Parking/…) also applies its preset color. */
  setZoneType(type: ZoneType): void {
    this.drawZoneType = type;
    const preset = this.zoneTypeOptions.find((o) => o.value === type);
    if (preset) this.setColor(preset.color);
    const zone = this.selectedZone;
    if (zone) zone.zoneType = type;
    this.showZoneTypePicker = false;
  }

  setOpacity(value: number): void {
    this.drawOpacity = value;
    const zone = this.selectedZone;
    if (zone) {
      zone.opacity = value;
      this.zoneLayerById.get(zone.id)?.setStyle({ fillOpacity: value });
    }
  }

  deleteSelectedZone(): void {
    if (!this.selectedZoneId || this.controlsDisabled) return;
    this.zoneLayerById.get(this.selectedZoneId)?.remove();
    this.zoneLayerById.delete(this.selectedZoneId);
    this.drawnZones = this.drawnZones.filter((zone) => zone.id !== this.selectedZoneId);

    this.sensors
      .filter((sensor) => sensor.zoneId === this.selectedZoneId)
      .forEach((sensor) => this.removeSensorLayer(sensor.id));
    this.sensors = this.sensors.filter((sensor) => sensor.zoneId !== this.selectedZoneId);

    this.zoneDeleted.emit(this.selectedZoneId);
    if (this.isPlacingSensor) this.stopPlacingSensors();
    this.selectedZoneId = null;
  }

  // ===== Place sensors inside a drawn zone =====

  toggleAddSensor(): void {
    if (!this.map || !this.selectedZoneId || this.controlsDisabled) return;
    if (this.isPlacingSensor) {
      this.stopPlacingSensors();
      return;
    }
    this.isDrawing = false;
    this.stopDrawListening();
    this.showColorPicker = false;
    this.showZoneTypePicker = false;
    this.showOpacitySlider = false;
    this.isPlacingSensor = true;
    this.map.on('click', this.handleSensorClick);
  }

  private stopPlacingSensors(): void {
    if (!this.isPlacingSensor) return;
    this.isPlacingSensor = false;
    this.map?.off('click', this.handleSensorClick);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSensorClick = (e: any): void => {
    this.tryAddSensorAt(e.latlng, this.selectedZoneId);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tryAddSensorAt(latlng: any, targetZoneId: string | null): void {
    const zone = this.drawnZones.find((z) => z.id === targetZoneId);
    if (!zone || !this.isPointInPolygon(latlng, zone.latlngs)) return;

    const sensor: ZoneSensor = {
      id: crypto.randomUUID(),
      zoneId: zone.id,
      lat: latlng.lat,
      lng: latlng.lng,
    };
    this.sensors = [...this.sensors, sensor];
    this.renderSensor(sensor);
    this.sensorAdded.emit(sensor);
  }

  private isPointInPolygon(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    latlng: any,
    polygon: { lat: number; lng: number }[],
  ): boolean {
    const x = latlng.lng;
    const y = latlng.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private renderSensor(sensor: ZoneSensor): void {
    const L = this.L;
    this.sensorLayer ??= L.layerGroup().addTo(this.map);

    const icon = L.divIcon({
      className: 'sensor-marker-icon',
      html: this.buildSensorSvg(),
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const marker = L.marker([sensor.lat, sensor.lng], { icon }).addTo(this.sensorLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    marker.on('click', (evt: any) => {
      L.DomEvent.stopPropagation(evt);
      this.removeSensorLayer(sensor.id);
      this.sensors = this.sensors.filter((s) => s.id !== sensor.id);
      this.sensorRemoved.emit(sensor.id);
    });

    this.sensorMarkerById.set(sensor.id, marker);
  }

  private removeSensorLayer(sensorId: string): void {
    this.sensorMarkerById.get(sensorId)?.remove();
    this.sensorMarkerById.delete(sensorId);
  }

  private buildSensorSvg(): string {
    return `<div class="sensor-marker-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
        <path d="M3.27 6.96 12 12.01l8.73-5.05"></path>
        <path d="M12 22.08V12"></path>
      </svg>
    </div>`;
  }
}
