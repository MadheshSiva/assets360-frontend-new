import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, Circle, Hexagon, LucideAngularModule, MousePointer2, PenTool, Plus, Search, ShieldAlert, Square } from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { MapViewer } from '../map-viewer/map-viewer';
import { MapZone, TONE_HEX, ZoneGeometry, ZoneType, zoneIcon } from '../maps.data';
import { MapsStore } from '../maps.store';
import { ZoneForm } from '../zone-form/zone-form';

/** Zones & Geofences: every zone on the floor with type filters, the map, and the zone form. */
@Component({
  standalone: true,
  selector: 'app-maps-zones',
  imports: [FormsModule, LucideAngularModule, MapViewer, MapCanvas, ZoneForm],
  template: `
    <div class="mws">
      <aside class="panel side">
        <div>
          <span class="field-label">Location</span>
          <select class="select select--full" aria-label="Location" [ngModel]="store.selectedFloorId" (ngModelChange)="store.selectFloor($event)">
            <option value="" disabled>Select Location</option>
            @for (f of store.floors; track f.id) { <option [value]="f.id">{{ f.label }}</option> }
          </select>
        </div>

        <div class="panel__head" style="margin: 0">
          <h3>Zones ({{ store.zones.length }})</h3>
          <button type="button" class="btn btn--primary btn--sm" [disabled]="!store.editing || store.working || store.creatingPlan || !store.canDraw" (click)="draw('Rectangle')">
            <lucide-icon [img]="icons.Plus" [size]="14"></lucide-icon> Add Zone
          </button>
        </div>

        <div class="tools-row" style="margin: 0">
          <label class="search">
            <lucide-icon [img]="icons.Search" [size]="15"></lucide-icon>
            <input placeholder="Search zones..." aria-label="Search zones" [(ngModel)]="search" />
          </label>
        </div>

        <div class="chips">
          <button type="button" class="chip-btn" [class.on]="!typeFilter" (click)="typeFilter = ''">All</button>
          @for (t of types; track t.type) {
            @if (store.zoneCountOf(t.type)) {
              <button type="button" class="chip-btn" [class.on]="typeFilter === t.type" (click)="typeFilter = typeFilter === t.type ? '' : t.type">
                {{ t.type }} ({{ store.zoneCountOf(t.type) }})
              </button>
            }
          }
        </div>

        <div>
          @for (z of rows; track z.id) {
            <button type="button" class="item-row" [class.active]="z.id === store.selectedZoneId" [style.--tone]="hex(z)" (click)="store.selectedZoneId = z.id">
              <span class="item-row__icon"><lucide-icon [img]="icon(z)" [size]="15"></lucide-icon></span>
              <span class="item-row__body">
                <b>{{ z.name }} ({{ z.code }})</b>
                <small>{{ z.type }} · {{ z.areaM2 }} m²</small>
              </span>
              @if (z.geofence) {
                <lucide-icon [img]="icons.ShieldAlert" [size]="15" class="geo" title="Geofence alerts on"></lucide-icon>
              }
            </button>
          } @empty {
            <p class="list-empty">{{ emptyText }}</p>
          }
        </div>

        <p class="note">{{ geofenceCount }} of {{ store.zones.length }} zones raise geofence alerts.</p>
      </aside>

      <app-map-viewer #v>
        <ng-container ngProjectAs="[tools]">
          <button type="button" class="btn on"><lucide-icon [img]="icons.MousePointer2" [size]="15"></lucide-icon> Select</button>
          <div class="dd">
            <button type="button" class="btn" [disabled]="!store.editing || store.working || store.creatingPlan || !store.canDraw" aria-haspopup="menu" [attr.aria-expanded]="drawOpen" (click)="toggleDraw($event)">
              <lucide-icon [img]="icons.Hexagon" [size]="15"></lucide-icon> Draw Zone <lucide-icon [img]="icons.ChevronDown" [size]="14"></lucide-icon>
            </button>
            @if (drawOpen) {
              <div class="menu" role="menu">
                @for (s of shapes; track s.shape) {
                  <button type="button" role="menuitem" (click)="draw(s.shape)"><lucide-icon [img]="s.icon" [size]="14"></lucide-icon> {{ s.label }}</button>
                }
              </div>
            }
          </div>
        </ng-container>

        <app-map-canvas
          [zoom]="v.zoom"
          [showDevices]="false"
          [showAssets]="false"
          [showLabels]="labels"
          [selectedZoneId]="store.selectedZoneId"
          (zoneSelect)="store.selectedZoneId = $event.id"
          [drawShape]="drawing"
          (zoneDrawn)="zoneDrawn($event)"
          (drawCancel)="drawing = null"
        ></app-map-canvas>

        <div class="map-foot" foot>
          <label><input type="checkbox" [(ngModel)]="labels" /> Labels</label>
          @for (t of types; track t.type) {
            @if (store.zoneCountOf(t.type)) {
              <span class="legend"><i [style.background]="toneHex(t.tone)"></i>{{ t.type }}</span>
            }
          }
        </div>
      </app-map-viewer>

      <aside class="panel">
        <nav class="rtabs" role="tablist"><button type="button" role="tab" class="active">Zone Details</button></nav>
        <app-zone-form [zone]="store.selectedZone"></app-zone-form>
      </aside>
    </div>
  `,
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-btn { padding: 4px 10px; border: 1px solid var(--adm-border); border-radius: 999px; background: #fff; font: inherit; font-size: 11.5px; cursor: pointer; }
    .chip-btn.on { background: var(--adm-purple); border-color: var(--adm-purple); color: #fff; }
    .geo { color: var(--adm-red); }
    .legend { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 10px; height: 10px; border-radius: 3px; opacity: 0.7; }
  `
})
export class ZonesTab {
  readonly store = inject(MapsStore);
  readonly icons = { ChevronDown, Hexagon, MousePointer2, Plus, Search, ShieldAlert };
  get types() {
    return this.store.zoneTypes;
  }

  readonly shapes: { shape: MapZone['shape']; label: string; icon: typeof Square }[] = [
    { shape: 'Polygon', label: 'Polygon Zone', icon: Hexagon },
    { shape: 'Rectangle', label: 'Rectangle Zone', icon: Square },
    { shape: 'Circle', label: 'Circle Zone', icon: Circle },
    { shape: 'Custom', label: 'Custom Shape', icon: PenTool }
  ];

  search = '';
  typeFilter: '' | ZoneType = '';
  labels = true;
  drawOpen = false;
  /** Zone shape being drawn on the map (clicks draw its outline), or null. */
  drawing: MapZone['shape'] | null = null;

  get rows(): MapZone[] {
    const q = this.search.trim().toLowerCase();
    return this.store.zones.filter(
      (z) => (!q || `${z.name} ${z.code}`.toLowerCase().includes(q)) && (!this.typeFilter || z.type === this.typeFilter)
    );
  }

  get geofenceCount(): number {
    return this.store.zones.filter((z) => z.geofence).length;
  }

  icon(z: MapZone) {
    return zoneIcon(z.type);
  }

  hex(z: MapZone): string {
    return this.store.zoneHex(z);
  }

  toneHex(tone: keyof typeof TONE_HEX): string {
    return TONE_HEX[tone];
  }

  toggleDraw(event: MouseEvent): void {
    event.stopPropagation();
    this.drawOpen = !this.drawOpen;
    this.drawing = null;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.drawOpen = false;
  }

  draw(shape: MapZone['shape']): void {
    this.drawOpen = false;
    // Draw the outline on the map; a floor with only a Master Data image gets its floor plan first
    this.store.ensurePlan(() => (this.drawing = shape));
  }

  /** The outline is finished: save the zone there. */
  zoneDrawn(geometry: ZoneGeometry): void {
    const shape = this.drawing;
    this.drawing = null;
    if (shape) this.store.addZone(shape, () => (this.typeFilter = ''), geometry);
  }

  get emptyText(): string {
    if (this.store.zonesLoading) return 'Loading zones…';
    if (!this.store.currentPlan) return this.store.canDraw ? 'No zones yet - use Add Zone or Draw Zone.' : 'No floor plan for this location - upload one to draw zones.';
    return this.store.zones.length ? 'No zones match.' : 'No zones yet - use Add Zone or Draw Zone.';
  }
}
