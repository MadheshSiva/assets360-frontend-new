import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CircleHelp, Eye, EyeOff, GripVertical, Lock, LucideAngularModule, Pencil, Plus, Trash2, X } from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { MapViewer } from '../map-viewer/map-viewer';
import { MapLayer } from '../maps.data';
import { MapsStore } from '../maps.store';

const CATEGORIES = ['HVAC', 'Electrical', 'Mechanical', 'Plumbing', 'Fire Safety', 'IT'];
const LAYER_TYPES = ['Zone (Area)', 'Geofence (Alerting)', 'Asset (Plotted / Tracked)', 'Device (IoT)', 'Annotation (Text)', 'Room (Space)', 'Heatmap', 'Base Map'];

/**
 * Layers: which layers draw on the map and their style (per floor plan, GET / PUT layers), and saved layer sets
 * (views, GET / POST / DELETE layer-sets). The API has a fixed set of eight layers: name, type and description are
 * read only, layers can't be added or removed, and the drag order is kept on this page only.
 */
@Component({
  standalone: true,
  selector: 'app-maps-layers',
  imports: [FormsModule, LucideAngularModule, MapViewer, MapCanvas],
  templateUrl: './layers.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `
    .layer-row { display: flex; align-items: center; gap: 8px; padding: 7px 6px; border: 1px solid transparent; border-bottom-color: #f1f2f6; border-radius: 8px; cursor: pointer; }
    .layer-row:hover { background: #faf9fe; }
    .layer-row.active { background: var(--adm-purple-soft); border-color: #c9b8ef; }
    .layer-row.drag-over { box-shadow: inset 0 2px 0 var(--adm-purple); }
    .layer-row__name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12.5px; }
    .layer-row__name lucide-icon { color: var(--adm-purple); }
    .grip { cursor: grab; color: #94a3b8; }
    .sets { display: flex; flex-direction: column; gap: 2px; }
    .set-row { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 8px; font-size: 12.5px; }
    .set-row.active { background: var(--adm-purple-soft); }
    .set-row label { flex: 1; display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .set-row input[type='text'] { flex: 1; height: 28px; border: 1px solid var(--adm-border); border-radius: 6px; padding: 0 6px; font: inherit; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; border: 1px solid var(--adm-border); border-radius: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: var(--adm-purple-soft); color: var(--adm-purple); font-size: 12px; font-weight: 600; }
    .chip button { display: grid; place-items: center; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
    .chips select { flex: 1; min-width: 90px; border: 0; outline: 0; font: inherit; background: transparent; }
    .range { display: flex; align-items: center; gap: 10px; }
    .range input { flex: 1; }
    .show-row { display: flex; align-items: center; gap: 12px; font-size: 12.5px; }
    .show-row label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  `
})
export class LayersTab {
  readonly store = inject(MapsStore);
  readonly icons = { CircleHelp, Eye, EyeOff, GripVertical, Lock, Pencil, Plus, Trash2, X };
  readonly categories = CATEGORIES;
  readonly layerTypes = LAYER_TYPES;
  readonly labelPositions = ['Bottom Center', 'Top Center', 'Right', 'Left', 'Hidden'];
  readonly statuses = ['All Statuses', 'Active', 'Inactive', 'Under Maintenance'];

  rightTab: 'details' | 'style' = 'details';
  selectedId = 'assets';
  dragId: string | null = null;
  overId: string | null = null;
  /** Id of the layer set being renamed. */
  renaming: string | null = null;
  renameText = '';

  private draft: MapLayer | null = null;
  /** Store layer the draft was copied from; a new object (load, save, toggle) refreshes the draft. */
  private draftSource: MapLayer | undefined;

  get enabledCount(): number {
    return this.store.layers.length;
  }

  /** Editable copy of the selected layer. */
  get d(): MapLayer | null {
    const l = this.store.layer(this.selectedId);
    if (l !== this.draftSource) {
      this.draftSource = l;
      this.draft = l ? { ...l, categories: [...l.categories] } : null;
    }
    return this.draft;
  }

  pick(id: string): void {
    this.selectedId = id;
    this.draftSource = undefined;
  }

  toggleEye(event: MouseEvent, l: MapLayer): void {
    event.stopPropagation();
    if (l.locked || this.store.working) return;
    this.store.saveLayer({ ...l, visible: !l.visible }, { quiet: true });
  }

  /* ===== Drag to reorder (this page only - the API keeps a fixed order) ===== */

  dragStart(id: string): void {
    this.dragId = id;
  }

  dragOver(event: DragEvent, id: string): void {
    event.preventDefault();
    this.overId = id;
  }

  drop(id: string): void {
    const from = this.store.layers.findIndex((l) => l.id === this.dragId);
    const to = this.store.layers.findIndex((l) => l.id === id);
    if (from >= 0 && to >= 0 && from !== to) {
      const list = [...this.store.layers];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      this.store.layers = list;
    }
    this.dragId = null;
    this.overId = null;
  }

  /* ===== Layer sets ===== */

  applySet(id: string): void {
    this.store.applyLayerSet(id);
  }

  addSet(): void {
    const names = new Set(this.store.layerSets.map((s) => s.name));
    let n = this.store.layerSets.length + 1;
    while (names.has(`Custom View ${n}`)) n++;
    this.store.addLayerSet(`Custom View ${n}`, (s) => this.startRename(s.id, s.name));
  }

  startRename(id: string, name: string): void {
    this.renaming = id;
    this.renameText = name;
  }

  commitRename(): void {
    const id = this.renaming;
    const to = this.renameText.trim();
    this.renaming = null;
    const set = this.store.layerSets.find((s) => s.id === id);
    if (!id || !set || !to || to === set.name) return;
    if (this.store.layerSets.some((s) => s.name === to)) {
      this.store.notify(`A layer set named ${to} already exists`, 'error');
      return;
    }
    this.store.renameLayerSet(id, to);
  }

  removeSet(id: string): void {
    const set = this.store.layerSets.find((s) => s.id === id);
    if (!set || !confirm(`Delete layer set ${set.name}?`)) return;
    this.store.removeLayerSet(id);
  }

  /* ===== Edit layer ===== */

  addLayer(): void {
    this.store.notify('The maps API has a fixed set of layers - custom layers are not supported yet');
  }

  addCategory(c: string): void {
    const d = this.d;
    if (d && c && !d.categories.includes(c)) d.categories = [...d.categories, c];
  }

  removeCategory(c: string): void {
    const d = this.d;
    if (d) d.categories = d.categories.filter((x) => x !== c);
  }

  reset(): void {
    this.draftSource = undefined;
  }

  save(): void {
    // Enter on the Details tab moves on to Style instead of saving
    if (this.rightTab === 'details') {
      this.rightTab = 'style';
      return;
    }
    const d = this.d;
    if (!d || this.store.working || !d.name.trim()) return;
    this.store.saveLayer({ ...d, name: d.name.trim(), categories: [...d.categories] }, { success: `Layer ${d.name.trim()} saved` });
  }

  /* ===== Quick "Show" toggles above the map ===== */

  isShown(id: string): boolean {
    return !!this.store.layer(id)?.enabled;
  }

  setShown(id: string, on: boolean): void {
    this.store.setLayerEnabled(id, on);
  }
}
