import { Component, ViewChild, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of, switchMap } from 'rxjs';
import { ProjectService, AppProject, ProjectFormValue } from '../../../../services/project.service';
import { CountryService, AppCountry, CountryFormValue } from '../../../../services/country.service';
import { ProjectAreaService, AppProjectArea, ProjectAreaFormValue } from '../../../../services/project-area.service';
import { OuterZoneService, AppOuterZone, OuterZoneFormValue } from '../../../../services/outer-zone.service';
import { BuildingService, AppBuilding, BuildingFormValue } from '../../../../services/building.service';
import { FloorService, AppFloor, FloorFormValue } from '../../../../services/floor.service';
import { ZoneService, AppZone, ZoneFormValue } from '../../../../services/zone.service';
import { SubZoneService, AppSubZone, SubZoneFormValue } from '../../../../services/sub-zone.service';
import {
  DEFAULT_COORDS,
  SiteHierarchyLoader,
  ZONE_COLORS,
  toTreeArea,
  toTreeBuilding,
  toTreeFloor,
  toTreeOuterZone,
  toTreeProject,
  toTreeState,
  toTreeSubZone,
  toTreeZone,
} from '../../../../services/site-hierarchy-loader.service';
import {
  AREA_TYPE_LABELS,
  AREA_TYPE_SHORT_LABELS,
  Area,
  AreaType,
  Building,
  childrenOf,
  Coords,
  Floor,
  FloorPlanComponent,
  FloorPlanZoneInput,
  HierarchyNode,
  MapComponent,
  MapLocation,
  MapPin,
  OuterZone,
  Project,
  ProjectStatus,
  SiteHierarchyService,
  State,
  Zone,
  areaAllowsBuildings,
  areaAllowsDirectZones,
} from 'shared-ui';
import { COUNTRIES, TIME_ZONES } from './country-data';

export interface AddProjectForm {
  name: string;
  description: string;
  weekStart: string;
  weekEnd: string;
  status: ProjectStatus;
}

type ChildModalKind = 'area' | 'state' | 'outerZone' | 'building' | 'floor' | 'zone';

interface ChildModalState {
  kind: ChildModalKind;
  parentId: string;
  /** Only relevant when kind === 'zone': a zone can attach to a state, a floor, or another zone (a sub-zone). */
  zoneParentKind?: 'state' | 'floor' | 'zone';
  /**
   * Set when editing an existing node instead of adding a new one. Used for kind === 'area' |
   * 'state' | 'outerZone' | 'building' | 'floor', and for 'zone' only when zoneParentKind === 'floor'.
   */
  editingId?: string;
}

interface Row {
  node: HierarchyNode;
  depth: number;
}

type ToastType = 'success' | 'error';

interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

@Component({
  standalone: true,
  selector: 'app-projects',
  imports: [CommonModule, FormsModule, MapComponent, FloorPlanComponent],
  templateUrl: './projects.html',
  styleUrls: ['./projects.css'],
})
export class Projects {
  private readonly hierarchy = inject(SiteHierarchyService);
  private readonly projectService = inject(ProjectService);
  private readonly countryService = inject(CountryService);
  private readonly projectAreaService = inject(ProjectAreaService);
  private readonly outerZoneService = inject(OuterZoneService);
  private readonly buildingService = inject(BuildingService);
  private readonly floorService = inject(FloorService);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly hierarchyLoader = inject(SiteHierarchyLoader);

  // Backend record -> tree node builders (shared with the loader)
  private readonly toTreeProject = toTreeProject;
  private readonly toTreeArea = toTreeArea;
  private readonly toTreeState = toTreeState;
  private readonly toTreeOuterZone = toTreeOuterZone;
  private readonly toTreeBuilding = toTreeBuilding;
  private readonly toTreeFloor = toTreeFloor;
  private readonly toTreeZone = toTreeZone;
  private readonly toTreeSubZone = toTreeSubZone;

  readonly projects = this.hierarchy.projects;
  readonly areaTypeLabels = AREA_TYPE_LABELS;
  readonly areaTypeShortLabels = AREA_TYPE_SHORT_LABELS;
  readonly zoneColors = ZONE_COLORS;

  loading = false;
  loadError: string | null = null;

  // ===== Toasts =====

  toasts: ToastMessage[] = [];
  private toastSeq = 0;

  private showToast(text: string, type: ToastType = 'success'): void {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts, { id, type, text }];
    setTimeout(() => this.dismissToast(id), 4000);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  private nodeKindLabel(kind: HierarchyNode['kind']): string {
    switch (kind) {
      case 'project':
        return 'Project';
      case 'area':
        return 'Country';
      case 'state':
        return 'Area';
      case 'outerZone':
        return 'Outer Zone';
      case 'building':
        return 'Building';
      case 'floor':
        return 'Floor';
      case 'zone':
        return 'Zone';
    }
  }

  constructor() {
    this.loadFromBackend();
  }

  private loadFromBackend(): void {
    this.loading = true;
    this.loadError = null;
    this.hierarchyLoader.load().subscribe({
      next: () => {
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Failed to load projects from the server.';
        this.loading = false;
      },
    });
  }

  private findParentProjectOfArea(areaId: string): Project | undefined {
    return this.projects().find((p) => p.areas.some((a) => a.id === areaId));
  }

  private findParentAreaOfState(stateId: string): Area | undefined {
    for (const project of this.projects()) {
      const area = project.areas.find((a) => a.states.some((s) => s.id === stateId));
      if (area) return area;
    }
    return undefined;
  }

  private findParentStateOfOuterZone(outerZoneId: string): State | undefined {
    for (const project of this.projects()) {
      for (const area of project.areas) {
        const state = area.states.find((s) => s.outerZones.some((o) => o.id === outerZoneId));
        if (state) return state;
      }
    }
    return undefined;
  }

  private findParentOuterZoneOfBuilding(buildingId: string): OuterZone | undefined {
    for (const project of this.projects()) {
      for (const area of project.areas) {
        for (const state of area.states) {
          const outerZone = state.outerZones.find((o) => o.buildings.some((b) => b.id === buildingId));
          if (outerZone) return outerZone;
        }
      }
    }
    return undefined;
  }

  private findParentBuildingOfFloor(floorId: string): Building | undefined {
    for (const project of this.projects()) {
      for (const area of project.areas) {
        for (const state of area.states) {
          for (const outerZone of state.outerZones) {
            const building = outerZone.buildings.find((b) => b.floors.some((f) => f.id === floorId));
            if (building) return building;
          }
        }
      }
    }
    return undefined;
  }

  private extractError(err: unknown, fallback: string): string {
    const body = (err as { error?: { errors?: Record<string, string[]>; message?: string } })?.error;
    if (body?.errors) return Object.values(body.errors).flat().join(' ');
    return body?.message || fallback;
  }

  /** Everything starts collapsed — only the top-level project(s) show at first, and each
   *  click reveals just that node's own children, one level at a time. */
  expanded = new Set<string>();
  activeNodeId: string | null = null;

  editingId: string | null = null;
  editingValue = '';

  @ViewChild(MapComponent, { static: false }) mapComponent?: MapComponent;

  readonly mapPins = computed<MapPin[]>(() =>
    this.hierarchy.allZones().map((zone) => ({
      lat: zone.coords.lat,
      lng: zone.coords.lng,
      color: zone.color,
      label: zone.name,
    })),
  );

  /** Gives the map something to center on even before any zone exists to derive a pin from —
   *  otherwise it never initializes (see MapComponent.ngAfterViewInit). */
  readonly mapLocations = computed<MapLocation[]>(() => {
    const project = this.projects()[0];
    return project ? [{ name: project.name, coords: project.coords }] : [];
  });

  /** The floor plan image is shown instead of the geo map when a floor,
   *  or a zone that belongs to a floor, is the active node. */
  get activeFloor(): Floor | null {
    const node = this.findNode(this.activeNodeId);
    if (!node) return null;
    if (node.kind === 'floor') return node;
    if (node.kind === 'zone') return this.findParentFloor(node.id) ?? null;
    return null;
  }

  get showFloorPlan(): boolean {
    return this.activeFloor !== null;
  }

  /** When the active node is a zone with an uploaded map image, that image is shown in the
   *  map panel instead of the geo map or the floor plan. A sub-zone with no image of its own
   *  falls back to its parent zone's image, since it's just an area within that same zone. */
  get activeZoneImage(): string | null {
    const node = this.findNode(this.activeNodeId);
    if (!node || node.kind !== 'zone') return null;
    if (node.mapImage) return node.mapImage;
    return this.findParentZone(node.id)?.mapImage ?? null;
  }

  get floorPlanZones(): FloorPlanZoneInput[] {
    return (this.activeFloor?.zones ?? []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      color: zone.color,
      lat: zone.coords.lat,
      lng: zone.coords.lng,
    }));
  }

  private findNode(id: string | null): HierarchyNode | undefined {
    if (!id) return undefined;
    let found: HierarchyNode | undefined;
    const walk = (node: HierarchyNode) => {
      if (found) return;
      if (node.id === id) {
        found = node;
        return;
      }
      childrenOf(node).forEach(walk);
    };
    this.projects().forEach(walk);
    return found;
  }

  /** Walks a zone's own sub-zones (recursively) to see if the target zone is anywhere underneath it. */
  private zoneContains(zone: Zone, zoneId: string): boolean {
    return zone.zones.some((sub) => sub.id === zoneId || this.zoneContains(sub, zoneId));
  }

  private findParentFloor(zoneId: string): Floor | undefined {
    let result: Floor | undefined;
    const walk = (node: HierarchyNode) => {
      if (result) return;
      // Match a zone directly on this floor, or a sub-zone nested inside one of those zones.
      if (node.kind === 'floor' && node.zones.some((zone) => zone.id === zoneId || this.zoneContains(zone, zoneId))) {
        result = node;
        return;
      }
      childrenOf(node).forEach(walk);
    };
    this.projects().forEach(walk);
    return result;
  }

  /**
   * The floor this zone is a direct child of — as opposed to a zone added straight to a State
   * (outdoor) or nested under another zone (sub-zone), which `findParentFloor` above would also
   * match if the sub-zone happens to live inside a floor-zone. Only zones found here are backed by
   * the Zone API (see the "Backend-hydrated data" note in SiteHierarchyService), since the backend
   * has no field to represent that kind of nesting.
   */
  private findFloorContainingZoneDirectly(zoneId: string): Floor | undefined {
    let result: Floor | undefined;
    const walk = (node: HierarchyNode) => {
      if (result) return;
      if (node.kind === 'floor' && node.zones.some((zone) => zone.id === zoneId)) {
        result = node;
        return;
      }
      childrenOf(node).forEach(walk);
    };
    this.projects().forEach(walk);
    return result;
  }

  /** The zone this one is nested under, if it's a sub-zone (nesting is one level deep only). */
  private findParentZone(zoneId: string): Zone | undefined {
    let result: Zone | undefined;
    const walk = (node: HierarchyNode) => {
      if (result) return;
      if (node.kind === 'zone' && node.zones.some((z) => z.id === zoneId)) {
        result = node;
        return;
      }
      childrenOf(node).forEach(walk);
    };
    this.projects().forEach(walk);
    return result;
  }

  /**
   * The zone this sub-zone is nested under, but only when that parent zone is itself backed by the
   * Zone API (a direct floor-zone) — the Sub-Zone API's ancestry chain bottoms out at that parent
   * zone's own floorId, so a sub-zone nested under a State-direct (outdoor) zone has nothing to
   * resolve that chain from and stays purely local (see `findFloorContainingZoneDirectly` above).
   */
  private findBackendParentZone(subZoneId: string): Zone | undefined {
    const parent = this.findParentZone(subZoneId);
    if (!parent) return undefined;
    return this.findFloorContainingZoneDirectly(parent.id) ? parent : undefined;
  }

  get visibleRows(): Row[] {
    const rows: Row[] = [];
    const walk = (node: HierarchyNode, depth: number) => {
      rows.push({ node, depth });
      if (this.expanded.has(node.id)) {
        childrenOf(node).forEach((child) => walk(child, depth + 1));
      }
    };
    this.projects().forEach((project) => walk(project, 0));
    return rows;
  }

  trackByRow = (_: number, row: Row) => row.node.id;

  isActive(id: string): boolean {
    return this.activeNodeId === id;
  }

  isExpandable(node: HierarchyNode): boolean {
    return childrenOf(node).length > 0 && !this.expanded.has(node.id);
  }

  areaTypeOf(node: HierarchyNode): AreaType | null {
    return node.kind === 'state' ? node.type : null;
  }

  canAddZone(node: HierarchyNode): boolean {
    return node.kind === 'state' ? areaAllowsDirectZones(node.type) : node.kind === 'floor';
  }

  canAddOuterZone(node: HierarchyNode): boolean {
    return node.kind === 'state' && areaAllowsBuildings(node.type);
  }

  canAddBuilding(node: HierarchyNode): boolean {
    return node.kind === 'outerZone';
  }

  /** A zone can add sub-zones, but a sub-zone itself cannot — nesting stops at one level. */
  canAddSubZone(node: HierarchyNode): boolean {
    return node.kind === 'zone' && !this.findParentZone(node.id);
  }

  toggle(node: HierarchyNode): void {
    this.activeNodeId = node.id;
    this.mapComponent?.flyTo(node.coords);

    if (this.expanded.has(node.id)) {
      const next = new Set(this.expanded);
      next.delete(node.id);
      const collectDescendants = (n: HierarchyNode) => {
        childrenOf(n).forEach((child) => {
          next.delete(child.id);
          collectDescendants(child);
        });
      };
      collectDescendants(node);
      this.expanded = next;
      return;
    }

    if (childrenOf(node).length === 0) return;
    this.expanded = new Set(this.expanded).add(node.id);
  }

  // ===== Inline rename =====

  startEdit(node: HierarchyNode, event?: Event): void {
    event?.stopPropagation();
    if (node.kind === 'project') {
      this.openEditProject(node, event);
      return;
    }
    if (node.kind === 'area') {
      this.openEditArea(node, event);
      return;
    }
    if (node.kind === 'state') {
      this.openEditState(node, event);
      return;
    }
    if (node.kind === 'outerZone') {
      this.openEditOuterZone(node, event);
      return;
    }
    if (node.kind === 'building') {
      this.openEditBuilding(node, event);
      return;
    }
    if (node.kind === 'floor') {
      this.openEditFloor(node, event);
      return;
    }
    if (node.kind === 'zone' && this.findFloorContainingZoneDirectly(node.id)) {
      this.openEditZone(node, event);
      return;
    }
    if (node.kind === 'zone' && this.findBackendParentZone(node.id)) {
      this.openEditSubZone(node, event);
      return;
    }
    this.editingId = node.id;
    this.editingValue = node.name;
  }

  commitEdit(): void {
    if (this.editingId === null) return;
    const newName = this.editingValue.trim();
    if (newName) {
      this.hierarchy.rename(this.editingId, newName);
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editingValue = '';
  }

  // ===== Delete =====

  deleteTarget: HierarchyNode | null = null;
  deleteError: string | null = null;
  deleting = false;

  deleteNode(node: HierarchyNode, event?: Event): void {
    event?.stopPropagation();
    this.deleteTarget = node;
    this.deleteError = null;
  }

  cancelDeleteNode(): void {
    if (this.deleting) return;
    this.deleteTarget = null;
    this.deleteError = null;
  }

  confirmDeleteNode(): void {
    const node = this.deleteTarget;
    if (!node) return;

    this.deleting = true;
    this.deleteError = null;

    if (node.kind === 'project') {
      this.projectService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete project. Please try again.'),
      });
      return;
    }
    if (node.kind === 'area') {
      this.countryService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete country. Please try again.'),
      });
      return;
    }
    if (node.kind === 'state') {
      this.projectAreaService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete area. Please try again.'),
      });
      return;
    }
    if (node.kind === 'outerZone') {
      this.outerZoneService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete outer zone. Please try again.'),
      });
      return;
    }
    if (node.kind === 'building') {
      this.buildingService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete building. Please try again.'),
      });
      return;
    }
    if (node.kind === 'floor') {
      this.floorService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete floor. Please try again.'),
      });
      return;
    }
    if (node.kind === 'zone' && this.findFloorContainingZoneDirectly(node.id)) {
      this.zoneService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete zone. Please try again.'),
      });
      return;
    }
    if (node.kind === 'zone' && this.findBackendParentZone(node.id)) {
      this.subZoneService.delete(node.id).subscribe({
        next: () => this.finishLocalDelete(node),
        error: (err) => this.handleDeleteResult(err, node, 'Failed to delete sub-zone. Please try again.'),
      });
      return;
    }

    this.finishLocalDelete(node);
  }

  private finishLocalDelete(node: HierarchyNode): void {
    this.hierarchy.deleteNode(node.id);
    if (this.activeNodeId === node.id) this.activeNodeId = null;
    if (this.editingId === node.id) this.cancelEdit();
    this.deleting = false;
    this.deleteTarget = null;
    this.showToast(`${this.nodeKindLabel(node.kind)} "${node.name}" deleted successfully.`, 'success');
  }

  /**
   * A 404 means the record is already gone server-side (e.g. deleted from another tab/session) —
   * that's the exact end state a delete wants, so treat it as success and clean up the stale local
   * row instead of surfacing an error the user can't act on.
   */
  private handleDeleteResult(err: unknown, node: HierarchyNode, message: string): void {
    if ((err as { status?: number })?.status === 404) {
      this.finishLocalDelete(node);
      return;
    }
    this.handleDeleteError(message);
  }

  private handleDeleteError(message: string): void {
    this.deleting = false;
    this.deleteError = message;
    this.showToast(message, 'error');
  }

  // ===== Add Project modal =====

  isAddProjectOpen = false;
  addProjectForm: AddProjectForm = this.emptyAddProjectForm();
  addProjectError: string | null = null;
  addProjectSaving = false;
  editingProjectId: string | null = null;

  get isEditProjectMode(): boolean {
    return this.editingProjectId !== null;
  }

  /** Week Start can't be backdated for a new project; an existing project's past start date stays editable. */
  get minWeekStartDate(): string {
    return this.isEditProjectMode ? '' : this.todayDateString();
  }

  /** Week End must be at least a day after whichever Week Start is currently entered. */
  get minWeekEndDate(): string {
    if (this.addProjectForm.weekStart) {
      return this.addDays(this.addProjectForm.weekStart, 1);
    }
    return this.isEditProjectMode ? '' : this.todayDateString();
  }

  /** Clears an already-picked Week End once it's no longer after the newly-picked Week Start. */
  onWeekStartChange(): void {
    if (this.addProjectForm.weekEnd && this.addProjectForm.weekEnd <= this.addProjectForm.weekStart) {
      this.addProjectForm.weekEnd = '';
    }
  }

  private todayDateString(): string {
    return this.toDateString(new Date());
  }

  private toDateString(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return this.toDateString(date);
  }

  private emptyAddProjectForm(): AddProjectForm {
    return { name: '', description: '', weekStart: '', weekEnd: '', status: 'active' };
  }

  openAddProject(): void {
    this.editingProjectId = null;
    this.addProjectForm = this.emptyAddProjectForm();
    this.addProjectError = null;
    this.isAddProjectOpen = true;
  }

  openEditProject(project: Project, event?: Event): void {
    event?.stopPropagation();
    this.editingProjectId = project.id;
    this.addProjectForm = {
      name: project.name,
      description: project.description ?? '',
      weekStart: project.weekStart ?? '',
      weekEnd: project.weekEnd ?? '',
      status: project.status,
    };
    this.addProjectError = null;
    this.isAddProjectOpen = true;
  }

  closeAddProject(): void {
    this.isAddProjectOpen = false;
    this.editingProjectId = null;
  }

  toggleAddProjectStatus(): void {
    this.addProjectForm.status = this.addProjectForm.status === 'active' ? 'inactive' : 'active';
  }

  submitAddProject(): void {
    const name = this.addProjectForm.name.trim();
    if (!name) {
      this.addProjectError = 'Project name is required.';
      return;
    }
    if (!this.addProjectForm.weekStart || !this.addProjectForm.weekEnd) {
      this.addProjectError = 'Week start and week end are required.';
      return;
    }
    if (!this.isEditProjectMode && this.addProjectForm.weekStart < this.todayDateString()) {
      this.addProjectError = 'Week start cannot be in the past.';
      return;
    }
    if (this.addProjectForm.weekStart >= this.addProjectForm.weekEnd) {
      this.addProjectError = 'Week end must be after week start.';
      return;
    }

    const fields: ProjectFormValue = {
      projectName: name,
      description: this.addProjectForm.description.trim(),
      status: this.addProjectForm.status === 'active',
      weekStart: this.addProjectForm.weekStart,
      weekEnd: this.addProjectForm.weekEnd,
    };

    const editingId = this.editingProjectId;
    this.addProjectSaving = true;
    const request$ = editingId ? this.projectService.update(editingId, fields) : this.projectService.create(fields);

    request$.subscribe({
      next: (saved) => {
        this.addProjectSaving = false;
        if (editingId) {
          this.hierarchy.updateProjectFields(editingId, {
            name: saved.projectName,
            description: saved.description || undefined,
            weekStart: saved.weekStart ? saved.weekStart.slice(0, 10) : undefined,
            weekEnd: saved.weekEnd ? saved.weekEnd.slice(0, 10) : undefined,
            status: saved.status ? 'active' : 'inactive',
          });
          this.activeNodeId = editingId;
        } else {
          const project = this.toTreeProject(saved, [], [], [], [], [], [], []);
          this.hierarchy.insertProject(project);
          this.activeNodeId = project.id;
          this.mapComponent?.flyTo(project.coords);
        }
        this.isAddProjectOpen = false;
        this.editingProjectId = null;
        this.showToast(`Project "${name}" ${editingId ? 'updated' : 'created'} successfully.`, 'success');
      },
      error: (err) => {
        this.addProjectSaving = false;
        this.addProjectError = this.extractError(err, editingId ? 'Failed to update project.' : 'Failed to create project.');
        this.showToast(this.addProjectError, 'error');
      },
    });
  }

  // ===== Add Area / State / Building / Floor / Zone modal (shared) =====

  readonly countryOptions = COUNTRIES;
  readonly timeZoneOptions = TIME_ZONES;

  childModal: ChildModalState | null = null;
  childFormName = '';
  childFormZoneColor = ZONE_COLORS[0].value;
  childFormDescription = '';
  childFormTimeZone = '';
  childFormCountryCode = '';
  childFormLatitude = '';
  childFormLongitude = '';
  childFormZoomLevel = '';
  childFormStatus: 'active' | 'inactive' = 'active';
  childFormStateType: AreaType | '' = '';
  childFormMapImage: string | null = null;
  childFormMapFileName: string | null = null;
  childFormMapFile: File | null = null;
  childFormTopZone = '';
  childFormIsTopZone: 'active' | 'inactive' = 'inactive';
  childFormPriority = '';
  childFormExit: 'active' | 'inactive' = 'inactive';
  childFormAssemblyPoint: 'active' | 'inactive' = 'active';
  childFormTimeTakenAssemblePoint = '';
  childFormError: string | null = null;
  childFormSaving = false;

  get childModalTitle(): string {
    if (this.childModal?.editingId) {
      if (this.childModal.kind === 'area') return 'Edit Country';
      if (this.childModal.kind === 'state') return 'Edit Area';
      if (this.childModal.kind === 'outerZone') return 'Edit Outer Zone';
      if (this.childModal.kind === 'building') return 'Edit Building';
      if (this.childModal.kind === 'floor') return 'Edit Floor';
      if (this.childModal.kind === 'zone') {
        return this.childModal.zoneParentKind === 'zone' ? 'Edit Subzone' : 'Edit Zone';
      }
    }
    switch (this.childModal?.kind) {
      case 'area':
        return 'Add Country';
      case 'state':
        return 'Add Area';
      case 'outerZone':
        return 'Add Outer Zone';
      case 'building':
        return 'Add Building';
      case 'floor':
        return 'Add Floor';
      case 'zone':
        return this.childModal?.zoneParentKind === 'zone' ? 'Add Subzone' : 'Add Zone';
      default:
        return '';
    }
  }

  get childModalSubmitLabel(): string {
    if (this.childFormSaving) return 'Saving...';
    if (
      this.childModal?.editingId &&
      (this.childModal.kind === 'area' ||
        this.childModal.kind === 'state' ||
        this.childModal.kind === 'outerZone' ||
        this.childModal.kind === 'building' ||
        this.childModal.kind === 'floor' ||
        this.childModal.kind === 'zone')
    ) {
      return 'Save Changes';
    }
    switch (this.childModal?.kind) {
      case 'area':
        return 'Add Country';
      case 'state':
        return 'Add State';
      case 'outerZone':
        return 'Add Outer Zone';
      case 'building':
        return 'Add City';
      case 'floor':
        return 'Add Street';
      case 'zone':
        return this.childModal?.zoneParentKind === 'zone' ? 'Add Subzone' : 'Add Building';
      default:
        return 'Create';
    }
  }

  /** Countries (areas) already added under the project currently open in the "Add Country" modal. */
  get countryListRows(): Area[] {
    if (!this.childModal || this.childModal.kind !== 'area') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && parent.kind === 'project' ? parent.areas : [];
  }

  /** States already added under the country currently open in the "Add Area" modal. */
  get stateListRows(): State[] {
    if (!this.childModal || this.childModal.kind !== 'state') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && parent.kind === 'area' ? parent.states : [];
  }

  /** Outer zones already added under the area currently open in the "Add Outer Zone" modal. */
  get outerZoneListRows(): OuterZone[] {
    if (!this.childModal || this.childModal.kind !== 'outerZone') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && parent.kind === 'state' ? parent.outerZones : [];
  }

  /** Buildings ("cities") already added under the outer zone currently open in the "Add Building" modal. */
  get buildingListRows(): Building[] {
    if (!this.childModal || this.childModal.kind !== 'building') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && parent.kind === 'outerZone' ? parent.buildings : [];
  }

  /** Floors ("streets") already added under the building currently open in the "Add Floor" modal. */
  get floorListRows(): Floor[] {
    if (!this.childModal || this.childModal.kind !== 'floor') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && parent.kind === 'building' ? parent.floors : [];
  }

  /** Zones already added under the state/floor/zone currently open in the "Add Zone" modal. */
  get zoneListRows(): Zone[] {
    if (!this.childModal || this.childModal.kind !== 'zone') return [];
    const parent = this.findNode(this.childModal.parentId);
    return parent && (parent.kind === 'state' || parent.kind === 'floor' || parent.kind === 'zone')
      ? parent.zones
      : [];
  }

  openAddArea(project: Project, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'area', parentId: project.id };
    this.resetChildForm();
  }

  openEditArea(area: Area, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findParentProjectOfArea(area.id);
    if (!parent) return;

    this.childModal = { kind: 'area', parentId: parent.id, editingId: area.id };
    this.childFormName = area.name;
    this.childFormDescription = area.description ?? '';
    this.childFormTimeZone = area.timeZone ?? '';
    this.childFormCountryCode = area.countryCode ?? '';
    this.childFormLatitude = area.coords ? String(area.coords.lat) : '';
    this.childFormLongitude = area.coords ? String(area.coords.lng) : '';
    this.childFormZoomLevel = area.coords ? String(area.coords.zoom) : '';
    this.childFormStatus = area.status ?? 'active';
    this.childFormError = null;
  }

  openAddState(area: Area, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'state', parentId: area.id };
    this.resetChildForm();
  }

  openEditState(state: State, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findParentAreaOfState(state.id);
    if (!parent) return;

    this.childModal = { kind: 'state', parentId: parent.id, editingId: state.id };
    this.childFormName = state.name;
    this.childFormDescription = state.description ?? '';
    this.childFormLatitude = state.coords ? String(state.coords.lat) : '';
    this.childFormLongitude = state.coords ? String(state.coords.lng) : '';
    this.childFormZoomLevel = state.coords ? String(state.coords.zoom) : '';
    this.childFormStatus = state.status ?? 'active';
    this.childFormStateType = state.type;
    this.childFormError = null;
  }

  openAddOuterZone(state: State, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'outerZone', parentId: state.id };
    this.resetChildForm();
  }

  openEditOuterZone(outerZone: OuterZone, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findParentStateOfOuterZone(outerZone.id);
    if (!parent) return;

    this.childModal = { kind: 'outerZone', parentId: parent.id, editingId: outerZone.id };
    this.childFormName = outerZone.name;
    this.childFormDescription = outerZone.description ?? '';
    this.childFormLatitude = outerZone.coords ? String(outerZone.coords.lat) : '';
    this.childFormLongitude = outerZone.coords ? String(outerZone.coords.lng) : '';
    this.childFormZoomLevel = outerZone.coords ? String(outerZone.coords.zoom) : '';
    this.childFormStatus = outerZone.status ?? 'active';
    this.childFormError = null;
  }

  openAddBuilding(outerZone: OuterZone, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'building', parentId: outerZone.id };
    this.resetChildForm();
  }

  openEditBuilding(building: Building, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findParentOuterZoneOfBuilding(building.id);
    if (!parent) return;

    this.childModal = { kind: 'building', parentId: parent.id, editingId: building.id };
    this.childFormName = building.name;
    this.childFormDescription = building.description ?? '';
    this.childFormLatitude = building.coords ? String(building.coords.lat) : '';
    this.childFormLongitude = building.coords ? String(building.coords.lng) : '';
    this.childFormZoomLevel = building.coords ? String(building.coords.zoom) : '';
    this.childFormStatus = building.status ?? 'active';
    this.childFormError = null;
  }

  openAddFloor(building: Building, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'floor', parentId: building.id };
    this.resetChildForm();
  }

  openEditFloor(floor: Floor, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findParentBuildingOfFloor(floor.id);
    if (!parent) return;

    this.childModal = { kind: 'floor', parentId: parent.id, editingId: floor.id };
    this.childFormName = floor.name;
    this.childFormDescription = floor.description ?? '';
    this.childFormStatus = floor.status ?? 'active';
    this.childFormMapFileName = floor.mapImage ? 'Current map uploaded' : null;
    this.childFormError = null;
  }

  openAddZone(parent: State | Floor | Zone, event?: Event): void {
    event?.stopPropagation();
    this.childModal = { kind: 'zone', parentId: parent.id, zoneParentKind: parent.kind };
    this.resetChildForm();
  }

  /** Only reachable for a zone added directly under a Floor — the only kind the Zone API backs. */
  openEditZone(zone: Zone, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findFloorContainingZoneDirectly(zone.id);
    if (!parent) return;

    this.childModal = { kind: 'zone', parentId: parent.id, zoneParentKind: 'floor', editingId: zone.id };
    this.childFormName = zone.name;
    this.childFormDescription = zone.description ?? '';
    this.childFormTopZone = zone.topZone ?? '';
    this.childFormPriority = zone.priority ?? '';
    this.childFormExit = zone.exit ?? 'inactive';
    this.childFormAssemblyPoint = zone.assemblyPoint ?? 'active';
    this.childFormTimeTakenAssemblePoint =
      zone.timeTakenAssemblePoint !== undefined ? String(zone.timeTakenAssemblePoint) : '';
    this.childFormStatus = zone.status ?? 'active';
    this.childFormMapFileName = zone.mapImage ? 'Current map uploaded' : null;
    this.childFormError = null;
  }

  /** Only reachable for a sub-zone nested under a zone that's itself backed by the Zone API. */
  openEditSubZone(subZone: Zone, event?: Event): void {
    event?.stopPropagation();
    const parent = this.findBackendParentZone(subZone.id);
    if (!parent) return;

    this.childModal = { kind: 'zone', parentId: parent.id, zoneParentKind: 'zone', editingId: subZone.id };
    this.childFormName = subZone.name;
    this.childFormDescription = subZone.description ?? '';
    this.childFormIsTopZone = subZone.isTopZone ?? 'inactive';
    this.childFormPriority = subZone.priority ?? '';
    this.childFormExit = subZone.exit ?? 'inactive';
    this.childFormAssemblyPoint = subZone.assemblyPoint ?? 'active';
    this.childFormTimeTakenAssemblePoint =
      subZone.timeTakenAssemblePoint !== undefined ? String(subZone.timeTakenAssemblePoint) : '';
    this.childFormStatus = subZone.status ?? 'active';
    this.childFormMapFileName = subZone.mapImage ? 'Current map uploaded' : null;
    this.childFormError = null;
  }

  private resetChildForm(): void {
    this.childFormName = '';
    this.childFormZoneColor = ZONE_COLORS[0].value;
    this.childFormDescription = '';
    this.childFormTimeZone = '';
    this.childFormCountryCode = '';
    this.childFormLatitude = '';
    this.childFormLongitude = '';
    this.childFormZoomLevel = '';
    this.childFormStatus = 'active';
    this.childFormStateType = '';
    this.childFormMapImage = null;
    this.childFormMapFileName = null;
    this.childFormMapFile = null;
    this.childFormTopZone = '';
    this.childFormIsTopZone = 'inactive';
    this.childFormPriority = '';
    this.childFormExit = 'inactive';
    this.childFormAssemblyPoint = 'active';
    this.childFormTimeTakenAssemblePoint = '';
    this.childFormError = null;
    this.childFormSaving = false;
  }

  closeChildModal(): void {
    this.childModal = null;
  }

  onMapFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.childFormMapFileName = file.name;
    this.childFormMapFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.childFormMapImage = typeof reader.result === 'string' ? reader.result : null;
    };
    reader.readAsDataURL(file);
  }

  onCountryNameChange(): void {
    const match = this.countryOptions.find((c) => c.name === this.childFormName);
    this.childFormCountryCode = match?.code ?? '';
  }

  toggleChildFormStatus(): void {
    this.childFormStatus = this.childFormStatus === 'active' ? 'inactive' : 'active';
  }

  toggleChildFormAssemblyPoint(): void {
    this.childFormAssemblyPoint = this.childFormAssemblyPoint === 'active' ? 'inactive' : 'active';
  }

  toggleChildFormExit(): void {
    this.childFormExit = this.childFormExit === 'active' ? 'inactive' : 'active';
  }

  toggleChildFormIsTopZone(): void {
    this.childFormIsTopZone = this.childFormIsTopZone === 'active' ? 'inactive' : 'active';
  }

  submitChildModal(): void {
    if (!this.childModal) return;

    if (this.childModal.kind === 'area') {
      this.submitAddCountry();
      return;
    }
    if (this.childModal.kind === 'state') {
      this.submitAddState();
      return;
    }
    if (this.childModal.kind === 'outerZone') {
      this.submitAddOuterZone();
      return;
    }
    if (this.childModal.kind === 'building') {
      this.submitAddBuilding();
      return;
    }
    if (this.childModal.kind === 'floor') {
      this.submitAddFloor();
      return;
    }

    this.submitAddZone();
  }

  /** Adding a country keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddCountry(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Country name is required.';
      return;
    }
    const timeZone = this.childFormTimeZone.trim();
    if (!timeZone) {
      this.childFormError = 'Time zone is required.';
      return;
    }

    const fields: CountryFormValue = {
      projectId: this.childModal.parentId,
      countryName: name,
      description: this.childFormDescription.trim(),
      timeZone,
      countryCode: this.childFormCountryCode,
      latitude: this.childFormLatitude.trim(),
      longitude: this.childFormLongitude.trim(),
      status: this.childFormStatus === 'active',
    };

    const editingId = this.childModal.editingId;
    const parentId = this.childModal.parentId;
    this.childFormSaving = true;
    const request$ = editingId ? this.countryService.update(editingId, fields) : this.countryService.create(fields);

    request$.subscribe({
      next: (saved) => {
        this.childFormSaving = false;
        const area = this.toTreeArea(saved, [], [], [], [], [], []);

        if (editingId) {
          this.hierarchy.updateAreaFields(editingId, {
            name: area.name,
            description: area.description,
            timeZone: area.timeZone,
            countryCode: area.countryCode,
            status: area.status,
            coords: area.coords,
          });
          this.activeNodeId = editingId;
          this.mapComponent?.flyTo(area.coords);
          this.closeChildModal();
          this.showToast(`Country "${area.name}" updated successfully.`, 'success');
          return;
        }

        this.hierarchy.insertArea(parentId, area);
        this.expanded = new Set(this.expanded).add(parentId);
        this.activeNodeId = area.id;
        this.mapComponent?.flyTo(area.coords);
        this.resetChildForm();
        this.showToast(`Country "${area.name}" created successfully.`, 'success');
      },
      error: (err) => {
        this.childFormSaving = false;
        this.childFormError = this.extractError(err, editingId ? 'Failed to update country.' : 'Could not add this country.');
        this.showToast(this.childFormError, 'error');
      },
    });
  }

  /** Adding an area keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddState(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Area name is required.';
      return;
    }
    if (!this.childFormStateType) {
      this.childFormError = 'Outdoor map type is required.';
      return;
    }

    const countryId = this.childModal.parentId;
    const project = this.findParentProjectOfArea(countryId);
    if (!project) {
      this.childFormError = 'Could not find the parent project for this country.';
      return;
    }

    const fields: ProjectAreaFormValue = {
      projectId: project.id,
      countryId,
      areaName: name,
      description: this.childFormDescription.trim(),
      outlineMap: '',
      latitude: this.childFormLatitude.trim(),
      longitude: this.childFormLongitude.trim(),
      status: this.childFormStatus === 'active',
      mapPath: '',
    };

    const editingId = this.childModal.editingId;
    const stateType = this.childFormStateType;
    this.childFormSaving = true;
    const request$ = editingId ? this.projectAreaService.update(editingId, fields) : this.projectAreaService.create(fields);

    request$.subscribe({
      next: (saved) => {
        this.childFormSaving = false;
        const state = this.toTreeState(saved, [], [], [], [], []);
        // The backend has no indoor/outdoor field — keep whatever type was chosen in this form
        // for the current session (see toTreeState's note on why it can't be persisted).
        state.type = stateType;

        if (editingId) {
          this.hierarchy.updateStateFields(editingId, {
            name: state.name,
            description: state.description,
            status: state.status,
            coords: state.coords,
            type: state.type,
          });
          this.activeNodeId = editingId;
          this.mapComponent?.flyTo(state.coords);
          this.closeChildModal();
          this.showToast(`Area "${state.name}" updated successfully.`, 'success');
          return;
        }

        this.hierarchy.insertState(countryId, state);
        this.expanded = new Set(this.expanded).add(countryId);
        this.activeNodeId = state.id;
        this.mapComponent?.flyTo(state.coords);
        this.resetChildForm();
        this.showToast(`Area "${state.name}" created successfully.`, 'success');
      },
      error: (err) => {
        this.childFormSaving = false;
        this.childFormError = this.extractError(err, editingId ? 'Failed to update area.' : 'Could not add this area.');
        this.showToast(this.childFormError, 'error');
      },
    });
  }

  /** Resolves the project + country ids that own a given state (UI "Area"). */
  private resolveStateAncestry(stateId: string): { projectId: string; countryId: string } | null {
    const area = this.findParentAreaOfState(stateId);
    if (!area) return null;
    const project = this.findParentProjectOfArea(area.id);
    if (!project) return null;
    return { projectId: project.id, countryId: area.id };
  }

  /** Adding an outer zone keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddOuterZone(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Outer zone name is required.';
      return;
    }

    const areaId = this.childModal.parentId;
    const ancestry = this.resolveStateAncestry(areaId);
    if (!ancestry) {
      this.childFormError = 'Could not find the parent country/project for this area.';
      return;
    }

    const fields: OuterZoneFormValue = {
      projectId: ancestry.projectId,
      countryId: ancestry.countryId,
      areaId,
      outerZoneName: name,
      description: this.childFormDescription.trim(),
      outlineMap: '',
      latitude: this.childFormLatitude.trim(),
      longitude: this.childFormLongitude.trim(),
      status: this.childFormStatus === 'active',
      mapPath: '',
    };

    const editingId = this.childModal.editingId;
    this.childFormSaving = true;
    const request$ = editingId ? this.outerZoneService.update(editingId, fields) : this.outerZoneService.create(fields);

    request$.subscribe({
      next: (saved) => {
        this.childFormSaving = false;
        const outerZone = this.toTreeOuterZone(saved, [], [], [], []);

        if (editingId) {
          this.hierarchy.updateOuterZoneFields(editingId, {
            name: outerZone.name,
            description: outerZone.description,
            status: outerZone.status,
            coords: outerZone.coords,
          });
          this.activeNodeId = editingId;
          this.mapComponent?.flyTo(outerZone.coords);
          this.closeChildModal();
          this.showToast(`Outer Zone "${outerZone.name}" updated successfully.`, 'success');
          return;
        }

        this.hierarchy.insertOuterZone(areaId, outerZone);
        this.expanded = new Set(this.expanded).add(areaId);
        this.activeNodeId = outerZone.id;
        this.mapComponent?.flyTo(outerZone.coords);
        this.resetChildForm();
        this.showToast(`Outer Zone "${outerZone.name}" created successfully.`, 'success');
      },
      error: (err) => {
        this.childFormSaving = false;
        this.childFormError = this.extractError(err, editingId ? 'Failed to update outer zone.' : 'Could not add this outer zone.');
        this.showToast(this.childFormError, 'error');
      },
    });
  }

  /** Resolves the project + country + area ids that own a given outer zone. */
  private resolveOuterZoneAncestry(outerZoneId: string): { projectId: string; countryId: string; areaId: string } | null {
    const state = this.findParentStateOfOuterZone(outerZoneId);
    if (!state) return null;
    const ancestry = this.resolveStateAncestry(state.id);
    if (!ancestry) return null;
    return { ...ancestry, areaId: state.id };
  }

  /** Resolves the project + country + area + outer zone ids that own a given building. */
  private resolveBuildingAncestry(
    buildingId: string,
  ): { projectId: string; countryId: string; areaId: string; outerZoneId: string } | null {
    const outerZone = this.findParentOuterZoneOfBuilding(buildingId);
    if (!outerZone) return null;
    const ancestry = this.resolveOuterZoneAncestry(outerZone.id);
    if (!ancestry) return null;
    return { ...ancestry, outerZoneId: outerZone.id };
  }

  /** Resolves the project + country + area + outer zone + building ids that own a given floor. */
  private resolveFloorAncestry(
    floorId: string,
  ): { projectId: string; countryId: string; areaId: string; outerZoneId: string; buildingId: string } | null {
    const building = this.findParentBuildingOfFloor(floorId);
    if (!building) return null;
    const ancestry = this.resolveBuildingAncestry(building.id);
    if (!ancestry) return null;
    return { ...ancestry, buildingId: building.id };
  }

  /** Resolves the project..floorId ids that own a given zone, for a zone eligible for the Sub-Zone API. */
  private resolveSubZoneAncestry(
    zoneId: string,
  ): { projectId: string; countryId: string; areaId: string; outerZoneId: string; buildingId: string; floorId: string } | null {
    const floor = this.findFloorContainingZoneDirectly(zoneId);
    if (!floor) return null;
    const ancestry = this.resolveFloorAncestry(floor.id);
    if (!ancestry) return null;
    return { ...ancestry, floorId: floor.id };
  }

  /** Adding a building ("city") keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddBuilding(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Building name is required.';
      return;
    }

    const outerZoneId = this.childModal.parentId;
    const ancestry = this.resolveOuterZoneAncestry(outerZoneId);
    if (!ancestry) {
      this.childFormError = 'Could not find the parent area/country/project for this outer zone.';
      return;
    }

    const fields: BuildingFormValue = {
      projectId: ancestry.projectId,
      countryId: ancestry.countryId,
      areaId: ancestry.areaId,
      outerZoneId,
      buildingName: name,
      description: this.childFormDescription.trim(),
      latitude: this.childFormLatitude.trim(),
      longitude: this.childFormLongitude.trim(),
      status: this.childFormStatus === 'active',
    };

    const editingId = this.childModal.editingId;
    this.childFormSaving = true;
    const request$ = editingId ? this.buildingService.update(editingId, fields) : this.buildingService.create(fields);

    request$.subscribe({
      next: (saved) => {
        this.childFormSaving = false;
        const building = this.toTreeBuilding(saved, [], [], []);

        if (editingId) {
          this.hierarchy.updateBuildingFields(editingId, {
            name: building.name,
            description: building.description,
            status: building.status,
            coords: building.coords,
          });
          this.activeNodeId = editingId;
          this.mapComponent?.flyTo(building.coords);
          this.closeChildModal();
          this.showToast(`Building "${building.name}" updated successfully.`, 'success');
          return;
        }

        this.hierarchy.insertBuilding(outerZoneId, building);
        this.expanded = new Set(this.expanded).add(outerZoneId);
        this.activeNodeId = building.id;
        this.mapComponent?.flyTo(building.coords);
        this.resetChildForm();
        this.showToast(`Building "${building.name}" created successfully.`, 'success');
      },
      error: (err) => {
        this.childFormSaving = false;
        this.childFormError = this.extractError(err, editingId ? 'Failed to update building.' : 'Could not add this building.');
        this.showToast(this.childFormError, 'error');
      },
    });
  }

  /** Adding a floor keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddFloor(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Floor name is required.';
      return;
    }

    const buildingId = this.childModal.parentId;
    const ancestry = this.resolveBuildingAncestry(buildingId);
    if (!ancestry) {
      this.childFormError = 'Could not find the parent outer zone/area/country/project for this building.';
      return;
    }

    const editingId = this.childModal.editingId;
    const existingFloor = editingId ? this.findNode(editingId) : undefined;
    const existingMapPath = existingFloor && existingFloor.kind === 'floor' ? existingFloor.mapImage ?? '' : '';

    const fields: FloorFormValue = {
      projectId: ancestry.projectId,
      countryId: ancestry.countryId,
      areaId: ancestry.areaId,
      outerZoneId: ancestry.outerZoneId,
      buildingId,
      floorName: name,
      description: this.childFormDescription.trim(),
      status: this.childFormStatus === 'active',
      mapPath: existingMapPath,
    };

    const mapFile = this.childFormMapFile;
    this.childFormSaving = true;
    const request$ = editingId ? this.floorService.update(editingId, fields) : this.floorService.create(fields);

    request$
      .pipe(switchMap((saved) => (mapFile ? this.floorService.uploadMap(saved.id, mapFile) : of(saved))))
      .subscribe({
        next: (saved) => {
          this.childFormSaving = false;
          const buildingCoords = this.findNode(buildingId)?.coords ?? DEFAULT_COORDS;
          const floor = this.toTreeFloor(saved, buildingCoords, [], []);

          if (editingId) {
            this.hierarchy.updateFloorFields(editingId, {
              name: floor.name,
              description: floor.description,
              status: floor.status,
              mapImage: floor.mapImage,
            });
            this.activeNodeId = editingId;
            this.mapComponent?.flyTo(floor.coords);
            this.closeChildModal();
            this.showToast(`Floor "${floor.name}" updated successfully.`, 'success');
            return;
          }

          this.hierarchy.insertFloor(buildingId, floor);
          this.expanded = new Set(this.expanded).add(buildingId);
          this.activeNodeId = floor.id;
          this.mapComponent?.flyTo(floor.coords);
          this.resetChildForm();
          this.showToast(`Floor "${floor.name}" created successfully.`, 'success');
        },
        error: (err) => {
          this.childFormSaving = false;
          this.childFormError = this.extractError(err, editingId ? 'Failed to update floor.' : 'Could not add this floor.');
          this.showToast(this.childFormError, 'error');
        },
      });
  }

  /**
   * A zone added directly under a Floor persists through the Zone API, and a sub-zone added under
   * one of those persists through the Sub-Zone API (both support editing an existing one, matching
   * Building/Floor). A zone added directly under a State (outdoor), or a sub-zone nested under one
   * of those state-direct zones, stays purely local — neither backend resource has a way to
   * represent that shape (see the note on SiteHierarchyService).
   */
  private submitAddZone(): void {
    if (!this.childModal) return;
    const name = this.childFormName.trim();
    if (!name) {
      this.childFormError = 'Name is required.';
      return;
    }

    if (this.childModal.zoneParentKind === 'floor') {
      this.submitAddFloorZone(name);
      return;
    }

    if (this.childModal.zoneParentKind === 'zone' && this.findFloorContainingZoneDirectly(this.childModal.parentId)) {
      this.submitAddSubZone(name);
      return;
    }

    if (this.childModal.zoneParentKind === 'zone') {
      this.submitAddLocalSubZone(name);
      return;
    }

    const zoom = parseFloat(this.childFormZoomLevel);
    const input = {
      name,
      color: this.childFormZoneColor,
      description: this.childFormDescription.trim(),
      mapImage: this.childFormMapImage ?? undefined,
      topZone: this.childFormTopZone.trim(),
      priority: this.childFormPriority.trim(),
      exit: this.childFormExit,
      assemblyPoint: this.childFormAssemblyPoint,
      timeTakenAssemblePoint: this.childFormTimeTakenAssemblePoint.trim()
        ? Number(this.childFormTimeTakenAssemblePoint)
        : undefined,
      status: this.childFormStatus,
      coords: !isNaN(zoom) ? { ...this.jitteredParentCoords(), zoom } : undefined,
    };

    const created = this.hierarchy.addZoneToState(this.childModal.parentId, input);

    if (!created) {
      this.childFormError = 'Could not add this zone.';
      return;
    }

    this.expanded = new Set(this.expanded).add(this.childModal.parentId);
    this.activeNodeId = created.id;
    this.mapComponent?.flyTo(created.coords);
    this.resetChildForm();
  }

  /** A sub-zone nested under a State-direct (outdoor) zone has no backend ancestry to persist through. */
  private submitAddLocalSubZone(name: string): void {
    if (!this.childModal) return;
    const input = {
      name,
      color: this.childFormZoneColor,
      description: this.childFormDescription.trim(),
      mapImage: this.childFormMapImage ?? undefined,
      isTopZone: this.childFormIsTopZone,
      priority: this.childFormPriority.trim(),
      exit: this.childFormExit,
      assemblyPoint: this.childFormAssemblyPoint,
      timeTakenAssemblePoint: this.childFormTimeTakenAssemblePoint.trim()
        ? Number(this.childFormTimeTakenAssemblePoint)
        : undefined,
      status: this.childFormStatus,
    };

    const created = this.hierarchy.addSubZone(this.childModal.parentId, input);
    if (!created) {
      this.childFormError = 'Could not add this sub-zone.';
      return;
    }

    this.expanded = new Set(this.expanded).add(this.childModal.parentId);
    this.activeNodeId = created.id;
    this.mapComponent?.flyTo(created.coords);
    this.resetChildForm();
  }

  /** Adding a floor-zone keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddFloorZone(name: string): void {
    if (!this.childModal) return;
    const floorId = this.childModal.parentId;
    const ancestry = this.resolveFloorAncestry(floorId);
    if (!ancestry) {
      this.childFormError = 'Could not find the parent building/outer zone/area/country/project for this floor.';
      return;
    }

    const editingId = this.childModal.editingId;
    const existingZone = editingId ? this.findNode(editingId) : undefined;
    const existingMapPath = existingZone && existingZone.kind === 'zone' ? existingZone.mapImage ?? '' : '';

    const fields: ZoneFormValue = {
      projectId: ancestry.projectId,
      countryId: ancestry.countryId,
      areaId: ancestry.areaId,
      outerZoneId: ancestry.outerZoneId,
      buildingId: ancestry.buildingId,
      floorId,
      zoneName: name,
      description: this.childFormDescription.trim(),
      topZone: this.childFormTopZone.trim(),
      priority: this.childFormPriority.trim(),
      musterPoint: this.childFormAssemblyPoint === 'active',
      exitPoint: this.childFormExit === 'active',
      status: this.childFormStatus === 'active',
      timeTakenAssemblePoint: this.childFormTimeTakenAssemblePoint.trim()
        ? Number(this.childFormTimeTakenAssemblePoint)
        : 0,
      mapPath: existingMapPath,
    };

    const mapFile = this.childFormMapFile;
    this.childFormSaving = true;
    const request$ = editingId ? this.zoneService.update(editingId, fields) : this.zoneService.create(fields);

    request$
      .pipe(switchMap((saved) => (mapFile ? this.zoneService.uploadMap(saved.id, mapFile) : of(saved))))
      .subscribe({
        next: (saved) => {
          this.childFormSaving = false;
          const floorCoords = this.findNode(floorId)?.coords ?? DEFAULT_COORDS;
          const zone = this.toTreeZone(saved, floorCoords, []);

          if (editingId) {
            this.hierarchy.updateZoneFields(editingId, {
              name: zone.name,
              description: zone.description,
              status: zone.status,
              mapImage: zone.mapImage,
              topZone: zone.topZone,
              priority: zone.priority,
              exit: zone.exit,
              assemblyPoint: zone.assemblyPoint,
              timeTakenAssemblePoint: zone.timeTakenAssemblePoint,
            });
            this.activeNodeId = editingId;
            this.mapComponent?.flyTo(zone.coords);
            this.closeChildModal();
            this.showToast(`Zone "${zone.name}" updated successfully.`, 'success');
            return;
          }

          this.hierarchy.insertZone(floorId, zone);
          this.expanded = new Set(this.expanded).add(floorId);
          this.activeNodeId = zone.id;
          this.mapComponent?.flyTo(zone.coords);
          this.resetChildForm();
          this.showToast(`Zone "${zone.name}" created successfully.`, 'success');
        },
        error: (err) => {
          this.childFormSaving = false;
          this.childFormError = this.extractError(err, editingId ? 'Failed to update zone.' : 'Could not add this zone.');
          this.showToast(this.childFormError, 'error');
        },
      });
  }

  /** Adding a sub-zone keeps the modal open so several can be added in one session; editing closes it. */
  private submitAddSubZone(name: string): void {
    if (!this.childModal) return;
    const zoneId = this.childModal.parentId;
    const ancestry = this.resolveSubZoneAncestry(zoneId);
    if (!ancestry) {
      this.childFormError = 'Could not find the parent floor/building/outer zone/area/country/project for this zone.';
      return;
    }

    const editingId = this.childModal.editingId;
    const existingSubZone = editingId ? this.findNode(editingId) : undefined;
    const existingMapPath = existingSubZone && existingSubZone.kind === 'zone' ? existingSubZone.mapImage ?? '' : '';

    const fields: SubZoneFormValue = {
      projectId: ancestry.projectId,
      countryId: ancestry.countryId,
      areaId: ancestry.areaId,
      outerZoneId: ancestry.outerZoneId,
      buildingId: ancestry.buildingId,
      floorId: ancestry.floorId,
      zoneId,
      subZoneName: name,
      description: this.childFormDescription.trim(),
      topZone: this.childFormIsTopZone === 'active',
      priority: this.childFormPriority.trim() ? Number(this.childFormPriority) : 0,
      assemblyPoint: this.childFormAssemblyPoint === 'active',
      exit: this.childFormExit === 'active',
      status: this.childFormStatus === 'active',
      timeTakenAssemblePoint: this.childFormTimeTakenAssemblePoint.trim()
        ? Number(this.childFormTimeTakenAssemblePoint)
        : 0,
      mapPath: existingMapPath,
    };

    const mapFile = this.childFormMapFile;
    this.childFormSaving = true;
    const request$ = editingId ? this.subZoneService.update(editingId, fields) : this.subZoneService.create(fields);

    request$
      .pipe(switchMap((saved) => (mapFile ? this.subZoneService.uploadMap(saved.id, mapFile) : of(saved))))
      .subscribe({
        next: (saved) => {
          this.childFormSaving = false;
          const zoneCoords = this.findNode(zoneId)?.coords ?? DEFAULT_COORDS;
          const subZone = this.toTreeSubZone(saved, zoneCoords);

          if (editingId) {
            this.hierarchy.updateZoneFields(editingId, {
              name: subZone.name,
              description: subZone.description,
              status: subZone.status,
              mapImage: subZone.mapImage,
              isTopZone: subZone.isTopZone,
              priority: subZone.priority,
              exit: subZone.exit,
              assemblyPoint: subZone.assemblyPoint,
              timeTakenAssemblePoint: subZone.timeTakenAssemblePoint,
            });
            this.activeNodeId = editingId;
            this.mapComponent?.flyTo(subZone.coords);
            this.closeChildModal();
            this.showToast(`Sub-zone "${subZone.name}" updated successfully.`, 'success');
            return;
          }

          this.hierarchy.insertSubZone(zoneId, subZone);
          this.expanded = new Set(this.expanded).add(zoneId);
          this.activeNodeId = subZone.id;
          this.mapComponent?.flyTo(subZone.coords);
          this.resetChildForm();
          this.showToast(`Sub-zone "${subZone.name}" created successfully.`, 'success');
        },
        error: (err) => {
          this.childFormSaving = false;
          this.childFormError = this.extractError(err, editingId ? 'Failed to update sub-zone.' : 'Could not add this sub-zone.');
          this.showToast(this.childFormError, 'error');
        },
      });
  }

  /** The parent's own lat/lng, used as the base point when only a zoom level is given for a new zone. */
  private jitteredParentCoords(): Coords {
    const parent = this.childModal ? this.findNode(this.childModal.parentId) : undefined;
    return parent?.coords ?? { lat: 25.2048, lng: 55.2708, zoom: 12 };
  }
}
