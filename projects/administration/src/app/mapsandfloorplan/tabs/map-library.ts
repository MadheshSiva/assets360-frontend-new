import { Component, EventEmitter, HostListener, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChevronDown,
  Circle,
  Cpu,
  Hexagon,
  LucideAngularModule,
  MousePointer2,
  Package,
  PenTool,
  Square,
  Upload
} from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { MapViewer } from '../map-viewer/map-viewer';
import { MapZone, PlotItem, PlotKind, ZoneGeometry, fmtDate } from '../maps.data';
import { MapsStore } from '../maps.store';
import { SiteTree } from '../site-tree/site-tree';
import { UploadDialog } from '../upload-dialog/upload-dialog';
import { ZoneForm } from '../zone-form/zone-form';

/** Map Library: browse sites / floors, view the map, draw zones and plot items; zone details on the right. */
@Component({
  standalone: true,
  selector: 'app-maps-library',
  imports: [FormsModule, LucideAngularModule, SiteTree, MapViewer, MapCanvas, ZoneForm, UploadDialog],
  templateUrl: './map-library.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css']
})
export class MapLibraryTab {
  readonly store = inject(MapsStore);
  readonly icons = { ChevronDown, Circle, Cpu, Hexagon, MousePointer2, Package, PenTool, Square, Upload };
  readonly shapes: { shape: MapZone['shape']; label: string; icon: typeof Square }[] = [
    { shape: 'Polygon', label: 'Polygon Zone', icon: Hexagon },
    { shape: 'Rectangle', label: 'Rectangle Zone', icon: Square },
    { shape: 'Circle', label: 'Circle Zone', icon: Circle },
    { shape: 'Custom', label: 'Custom Shape', icon: PenTool }
  ];

  @Output() goTo = new EventEmitter<string>();

  rightTab: 'zone' | 'layers' | 'info' = 'zone';
  drawOpen = false;
  uploadMenuOpen = false;
  uploadOpen = false;
  /** Plot Device / Plot Asset: the next plan click drops the first unplotted item of that kind. */
  placing: PlotKind | null = null;
  /** Zone shape being drawn on the map (clicks draw its outline), or null. */
  drawing: MapZone['shape'] | null = null;
  show = { zones: true, devices: true, assets: true, labels: true };

  /** Storage quota shown in the Storage & Usage card (no quota API yet). */
  readonly totalGb = 10;
  date = fmtDate;

  @HostListener('document:click')
  closeMenus(): void {
    this.drawOpen = false;
    this.uploadMenuOpen = false;
  }

  toggleDraw(event: MouseEvent): void {
    event.stopPropagation();
    this.drawOpen = !this.drawOpen;
    this.placing = null;
    this.drawing = null;
  }

  draw(shape: MapZone['shape']): void {
    this.drawOpen = false;
    // Draw the outline on the map; a floor with only a Master Data image gets its floor plan first
    this.store.ensurePlan(() => {
      this.placing = null;
      this.drawing = shape;
    });
  }

  /** The outline is finished: save the zone there and open its details. */
  zoneDrawn(geometry: ZoneGeometry): void {
    const shape = this.drawing;
    this.drawing = null;
    if (shape) this.store.addZone(shape, () => (this.rightTab = 'zone'), geometry);
  }

  startPlacing(kind: PlotKind): void {
    if (this.placing === kind) {
      this.placing = null;
      return;
    }
    this.drawing = null;
    if (!this.store.currentPlan) {
      this.store.ensurePlan(() => this.startPlacing(kind));
      return;
    }
    if (!this.store.unplotted.some((i) => i.kind === kind)) {
      this.store.notify(`Every ${kind} is already plotted - use Device & Asset Plotting to reposition`);
      return;
    }
    this.placing = kind;
  }

  place(pos: { x: number; y: number }): void {
    const item = this.store.unplotted.find((i) => i.kind === this.placing);
    this.placing = null;
    if (!item) return;
    this.store.selectedItemId = item.id;
    this.store.plot(item.id, pos.x, pos.y, `${item.name} (${item.code}) plotted`);
  }

  selectZone(z: MapZone): void {
    this.store.selectedZoneId = z.id;
    this.rightTab = 'zone';
  }

  selectItem(i: PlotItem): void {
    this.store.selectedItemId = i.id;
    this.goTo.emit('device-asset-plotting');
  }

  /** Size of the floor plan files (current versions) stored for the tenant. */
  get usedBytes(): number {
    return this.store.floorPlans.reduce((sum, p) => sum + (p.sizeBytes || 0), 0);
  }

  get usedLabel(): string {
    const gb = this.usedBytes / 1024 ** 3;
    return gb >= 0.1 ? `${gb.toFixed(1)} GB` : `${(this.usedBytes / 1024 ** 2).toFixed(1)} MB`;
  }

  get storagePct(): number {
    return Math.min(100, Math.round((this.usedBytes / (this.totalGb * 1024 ** 3)) * 100));
  }

  toggleUploadMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.uploadMenuOpen = !this.uploadMenuOpen;
  }

  /** The store already showed the success toast. */
  uploaded(): void {
    this.uploadOpen = false;
  }
}
