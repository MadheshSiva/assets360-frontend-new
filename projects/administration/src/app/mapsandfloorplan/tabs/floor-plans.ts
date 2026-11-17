import { Component, EventEmitter, HostListener, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Eye,
  Info,
  LayoutGrid,
  Layers,
  List,
  LucideAngularModule,
  Maximize2,
  Package,
  Pencil,
  Plus,
  Search,
  Wifi
} from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { FloorPlan, MapStatus, STATUS_TONE, fmtDate, fmtTime } from '../maps.data';
import { MapsStore } from '../maps.store';
import { SiteTree } from '../site-tree/site-tree';
import { UploadDialog } from '../upload-dialog/upload-dialog';

type SortKey = 'updated' | 'name' | 'version';

/** Floor Plans: list of plans for the selected location with filters, and details of the selected plan. */
@Component({
  standalone: true,
  selector: 'app-maps-floor-plans',
  imports: [FormsModule, LucideAngularModule, SiteTree, MapCanvas, UploadDialog],
  templateUrl: './floor-plans.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css']
})
export class FloorPlansTab {
  readonly store = inject(MapsStore);
  readonly icons = {
    Building2, ChevronDown, ChevronLeft, ChevronRight, Download, Ellipsis, Eye, Info, LayoutGrid, Layers, List, Maximize2, Package,
    Pencil, Plus, Search, Wifi
  };
  readonly pageSizes = [5, 10, 20];

  @Output() goTo = new EventEmitter<string>();

  search = '';
  statusFilter: '' | MapStatus = '';
  typeFilter: '' | FloorPlan['type'] = '';
  sort: SortKey = 'updated';
  view: 'list' | 'grid' = 'list';
  page = 0;
  pageSize = 10;
  checked = new Set<string>();
  menuFor: string | null = null;
  headMenuOpen = false;
  uploadOpen = false;
  editing: FloorPlan | null = null;

  date = fmtDate;
  time = fmtTime;

  tone(s: MapStatus) {
    return STATUS_TONE[s];
  }

  get all(): FloorPlan[] {
    return this.store.plansOf(this.store.selectedFloorId);
  }

  get emptyText(): string {
    if (this.store.plansLoading || this.store.treeLoading) return 'Loading floor plans…';
    if (this.store.plansError) return this.store.plansError;
    if (!this.store.selectedFloorId) return 'Select a site, building or floor.';
    return this.all.length ? 'No floor plans match.' : 'No floor plans for this location yet. Use Add Floor Plan to upload one.';
  }

  get rows(): FloorPlan[] {
    const q = this.search.trim().toLowerCase();
    const list = this.all.filter(
      (p) =>
        (!q || `${p.name} ${p.subtitle} ${p.fileName}`.toLowerCase().includes(q)) &&
        (!this.statusFilter || p.status === this.statusFilter) &&
        (!this.typeFilter || p.type === this.typeFilter)
    );
    const by: Record<SortKey, (a: FloorPlan, b: FloorPlan) => number> = {
      updated: (a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
      version: (a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })
    };
    return [...list].sort(by[this.sort]);
  }

  get paged(): FloorPlan[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i);
  }

  get selected(): FloorPlan | undefined {
    return this.all.find((p) => p.id === this.store.selectedPlanId) ?? this.all[0];
  }

  get allChecked(): boolean {
    return this.paged.length > 0 && this.paged.every((p) => this.checked.has(p.id));
  }

  toggleAll(): void {
    const on = !this.allChecked;
    this.paged.forEach((p) => (on ? this.checked.add(p.id) : this.checked.delete(p.id)));
  }

  toggle(id: string): void {
    if (this.checked.has(id)) this.checked.delete(id);
    else this.checked.add(id);
  }

  onFilter(): void {
    this.page = 0;
  }

  onFloor(): void {
    this.page = 0;
    this.checked.clear();
    this.editing = null;
  }

  select(p: FloorPlan): void {
    this.store.selectPlan(p.id);
    this.editing = null;
  }

  toggleMenu(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === id ? null : id;
  }

  toggleHeadMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.headMenuOpen = !this.headMenuOpen;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuFor = null;
    this.headMenuOpen = false;
  }

  publish(p: FloorPlan): void {
    this.store.publishPlan(p);
  }

  archive(p: FloorPlan): void {
    this.store.archivePlan(p);
  }

  remove(p: FloorPlan): void {
    if (!confirm(`Delete ${p.name}? Its zones, plots and layers are deleted with it.`)) return;
    this.store.removePlans([p.id], () => this.checked.delete(p.id));
  }

  removeChecked(): void {
    const ids = [...this.checked];
    if (!ids.length || !confirm(`Delete ${ids.length} floor plan${ids.length === 1 ? '' : 's'}? Their zones, plots and layers are deleted with them.`)) return;
    this.store.removePlans(ids, () => this.checked.clear());
  }

  download(p: FloorPlan): void {
    this.store.download(p.fileUrl, p.fileName);
  }

  edit(p: FloorPlan): void {
    this.editing = { ...p };
  }

  saveEdit(): void {
    const draft = this.editing;
    if (!draft || !draft.name.trim() || this.store.working) return;
    const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    this.store.updatePlan(
      { ...draft, name: draft.name.trim(), subtitle: draft.subtitle.trim(), widthMeters: num(draft.widthMeters), heightMeters: num(draft.heightMeters), scale: draft.scale.trim() },
      () => (this.editing = null)
    );
  }

  open(p: FloorPlan, tab: string): void {
    this.store.selectPlan(p.id);
    this.goTo.emit(tab);
  }

  /** The store already showed the success toast. */
  uploaded(): void {
    this.uploadOpen = false;
  }
}
