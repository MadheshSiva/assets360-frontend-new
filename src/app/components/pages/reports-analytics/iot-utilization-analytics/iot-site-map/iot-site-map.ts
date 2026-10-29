import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';

export interface MapPoint {
  lat: number;
  lng: number;
  color: string;
  /** Tooltip text */
  label: string;
}

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
/** UAE + KSA view used when nothing narrower is selected */
const GULF_CENTER: [number, number] = [24.6, 52.2];

/**
 * OpenStreetMap with coloured pins (Leaflet). Fits the pins in the Gulf region; sites far away
 * (London, Singapore) stay on the map and are reachable by zooming out.
 */
@Component({
  selector: 'app-ra-site-map',
  standalone: true,
  template: `<div class="ra-site-map" #mapEl [style.height.px]="height"></div>`,
  styles: [
    `
      :host { display: block; }
      .ra-site-map { width: 100%; border-radius: 10px; overflow: hidden; background: #e8eef3; z-index: 0; }
      :host ::ng-deep .ra-site-map-pin { background: transparent; border: none; }
      :host ::ng-deep .ra-site-map-tip {
        font-family: 'Red Hat Display', sans-serif; font-size: 12px; font-weight: 600; color: #0f172a;
        border: none; border-radius: 8px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.2);
      }
    `
  ]
})
export class IotSiteMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) points: MapPoint[] = [];
  @Input() height = 220;

  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private L: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private layer: any;
  private resize: ResizeObserver | null = null;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    const mod = await import('leaflet');
    // Leaflet is UMD; depending on the bundler the API is on the module or its default export
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.L = (mod as any).map ? mod : (mod as any).default;
    if (this.destroyed || !this.mapEl) return;
    this.map = this.L.map(this.mapEl.nativeElement, { attributionControl: true, scrollWheelZoom: false }).setView(GULF_CENTER, 5);
    this.L.tileLayer(OSM_TILES, { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(this.map);
    this.layer = this.L.layerGroup().addTo(this.map);
    this.draw();
    if (typeof ResizeObserver !== 'undefined') {
      // The map lives in resizable grids and dialogs; keep the tiles in sync with the box
      this.resize = new ResizeObserver(() => this.map?.invalidateSize());
      this.resize.observe(this.mapEl.nativeElement);
    }
  }

  ngOnChanges(): void {
    if (this.map) this.draw();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resize?.disconnect();
    this.map?.remove();
  }

  private draw(): void {
    const L = this.L;
    this.layer.clearLayers();
    this.points.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'ra-site-map-pin',
          html: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="${p.color}" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`,
          iconSize: [26, 26],
          iconAnchor: [13, 24]
        })
      })
        .bindTooltip(p.label, { direction: 'top', offset: [0, -22], className: 'ra-site-map-tip' })
        .addTo(this.layer);
    });
    const near = this.points.filter((p) => p.lng > 35 && p.lng < 65 && p.lat > 10 && p.lat < 35);
    const fit = near.length ? near : this.points;
    if (fit.length > 1) {
      this.map.fitBounds(L.latLngBounds(fit.map((p) => [p.lat, p.lng])), { padding: [28, 28], maxZoom: 9 });
    } else if (fit.length === 1) {
      this.map.setView([fit[0].lat, fit[0].lng], 9);
    } else {
      this.map.setView(GULF_CENTER, 5);
    }
  }
}
