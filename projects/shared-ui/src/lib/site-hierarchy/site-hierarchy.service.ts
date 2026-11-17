import { Injectable, computed, signal } from '@angular/core';
import {
  Area,
  AreaType,
  Building,
  Coords,
  Floor,
  HierarchyNode,
  OuterZone,
  Project,
  ProjectStatus,
  State,
  Zone,
  areaAllowsDirectZones,
  childrenOf,
} from './site-hierarchy.model';

export interface AddProjectInput {
  name: string;
  description?: string;
  weekStart?: string;
  weekEnd?: string;
  status: ProjectStatus;
}

export interface AddAreaInput {
  name: string;
  description?: string;
  timeZone?: string;
  countryCode?: string;
  status?: 'active' | 'inactive';
  coords?: Coords;
}

export interface AddStateInput {
  name: string;
  type: AreaType;
  description?: string;
  status?: 'active' | 'inactive';
  coords?: Coords;
}

export interface AddZoneInput {
  name: string;
  color: string;
  description?: string;
  mapImage?: string;
  topZone?: string;
  isTopZone?: 'active' | 'inactive';
  priority?: string;
  exit?: 'active' | 'inactive';
  assemblyPoint?: 'active' | 'inactive';
  timeTakenAssemblePoint?: number;
  status?: 'active' | 'inactive';
  coords?: Coords;
}

export interface AddBuildingInput {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  coords?: Coords;
}

/**
 * Single source of truth for the Project -> Area (Country) -> State ->
 * (Zone and/or Building -> Floor -> Zone) hierarchy. Projects (Administration -> Configuration)
 * is the only consumer allowed to call the mutators below; Locating reads `projects` only.
 */
@Injectable({ providedIn: 'root' })
export class SiteHierarchyService {
  private nextId = 1000;

  private readonly _projects = signal<Project[]>([this.seedProject()]);
  readonly projects = this._projects.asReadonly();
  readonly allZones = computed(() => this.flattenZones(this._projects()));

  private genId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private jitteredCoords(base: Coords, zoomStep = 2): Coords {
    const jitter = () => (Math.random() - 0.5) * 0.01;
    return {
      lat: base.lat + jitter(),
      lng: base.lng + jitter(),
      zoom: Math.min(base.zoom + zoomStep, 20),
    };
  }

  private seedProject(): Project {
    const projectCoords: Coords = { lat: 25.2048, lng: 55.2708, zoom: 6 };
    const areaCoords: Coords = { lat: 25.2048, lng: 55.2708, zoom: 11 };
    const floorCoords: Coords = { lat: 25.2048, lng: 55.2708, zoom: 17 };

    const zone = (id: string, name: string, color: string, coords: Coords, subZones: Zone[] = []): Zone => ({
      kind: 'zone',
      id,
      name,
      color,
      coords,
      zones: subZones,
    });

    // Azy floor is a sub-zone nested inside Second Colony.
    const azyFloorZone = zone('zone-2', 'Azy floor', '#dc2626', { lat: 25.2045, lng: 55.2705, zoom: 19 });
    const secondColonyZone = zone('zone-1', 'Second Colony', '#158b4b', { lat: 25.2051, lng: 55.2711, zoom: 19 }, [
      azyFloorZone,
    ]);

    const thirdRightFloor: Floor = {
      kind: 'floor',
      id: 'floor-1',
      name: 'Third Right',
      coords: floorCoords,
      zones: [secondColonyZone],
    };

    const building: Building = {
      kind: 'building',
      id: 'building-1',
      name: 'Street One',
      coords: areaCoords,
      floors: [thirdRightFloor],
    };

    const outerZone: OuterZone = {
      kind: 'outerZone',
      id: 'outerzone-1',
      name: 'Main Outer Zone',
      coords: areaCoords,
      buildings: [building],
    };

    // A direct outdoor zone on Oman itself, alongside its indoor outer-zone/building/floor/zone chain.
    const outdoorParkingZone = zone('zone-3', 'Outdoor Parking', '#2563eb', {
      lat: 25.2058,
      lng: 55.2695,
      zoom: 15,
    });

    const state: State = {
      kind: 'state',
      id: 'state-1',
      name: 'Oman',
      type: 'indoor_outdoor',
      coords: areaCoords,
      zones: [outdoorParkingZone],
      outerZones: [outerZone],
    };

    // Country -> State -> Outer Zone -> Building -> Floor -> Zone.
    const area: Area = {
      kind: 'area',
      id: 'area-1',
      name: 'UAE',
      coords: areaCoords,
      states: [state],
    };

    return {
      kind: 'project',
      id: 'project-1',
      name: 'Track Assets',
      description: 'Primary demo project',
      status: 'active',
      coords: projectCoords,
      areas: [area],
    };
  }

  // ===== Read-only helpers (Projects + Locating) =====

  findNode(id: string): HierarchyNode | undefined {
    const stack: HierarchyNode[] = [...this._projects()];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.id === id) return n;
      stack.push(...childrenOf(n));
    }
    return undefined;
  }

  private findWithParent(
    id: string,
  ): { parent: HierarchyNode | null; node: HierarchyNode } | undefined {
    for (const project of this._projects()) {
      if (project.id === id) return { parent: null, node: project };
    }
    const stack: HierarchyNode[] = [...this._projects()];
    while (stack.length) {
      const n = stack.pop()!;
      for (const child of childrenOf(n)) {
        if (child.id === id) return { parent: n, node: child };
        stack.push(child);
      }
    }
    return undefined;
  }

  private flattenZones(projects: Project[]): Zone[] {
    const zones: Zone[] = [];
    const walk = (n: HierarchyNode) => {
      if (n.kind === 'zone') zones.push(n);
      childrenOf(n).forEach(walk);
    };
    projects.forEach(walk);
    return zones;
  }

  // ===== Mutators (Projects only) =====

  addProject(input: AddProjectInput): Project {
    const reference = this._projects()[0]?.coords ?? { lat: 24.4539, lng: 54.3773, zoom: 6 };
    const project: Project = {
      kind: 'project',
      id: this.genId('project'),
      name: input.name,
      description: input.description || undefined,
      weekStart: input.weekStart || undefined,
      weekEnd: input.weekEnd || undefined,
      status: input.status,
      coords: this.jitteredCoords(reference, 0),
      areas: [],
    };
    this._projects.update((projects) => [...projects, project]);
    return project;
  }

  addArea(projectId: string, input: AddAreaInput): Area | undefined {
    const project = this.findNode(projectId);
    if (!project || project.kind !== 'project') return undefined;

    const area: Area = {
      kind: 'area',
      id: this.genId('area'),
      name: input.name,
      coords: input.coords ?? this.jitteredCoords(project.coords),
      states: [],
      description: input.description || undefined,
      timeZone: input.timeZone || undefined,
      countryCode: input.countryCode || undefined,
      status: input.status ?? 'active',
    };
    project.areas = [...project.areas, area];
    this._projects.update((projects) => [...projects]);
    return area;
  }

  addState(areaId: string, input: AddStateInput): State | undefined {
    const area = this.findNode(areaId);
    if (!area || area.kind !== 'area') return undefined;

    const state: State = {
      kind: 'state',
      id: this.genId('state'),
      name: input.name,
      type: input.type,
      coords: input.coords ?? this.jitteredCoords(area.coords),
      zones: [],
      outerZones: [],
      description: input.description || undefined,
      status: input.status ?? 'active',
    };
    area.states = [...area.states, state];
    this._projects.update((projects) => [...projects]);
    return state;
  }

  addZoneToState(stateId: string, input: AddZoneInput): Zone | undefined {
    const state = this.findNode(stateId);
    if (!state || state.kind !== 'state' || !areaAllowsDirectZones(state.type)) return undefined;

    const zone: Zone = {
      kind: 'zone',
      id: this.genId('zone'),
      name: input.name,
      color: input.color,
      coords: input.coords ?? this.jitteredCoords(state.coords, 1),
      zones: [],
      description: input.description || undefined,
      mapImage: input.mapImage || undefined,
      topZone: input.topZone || undefined,
      priority: input.priority || undefined,
      exit: input.exit || undefined,
      assemblyPoint: input.assemblyPoint ?? 'active',
      timeTakenAssemblePoint: input.timeTakenAssemblePoint,
      status: input.status ?? 'active',
    };
    state.zones = [...state.zones, zone];
    this._projects.update((projects) => [...projects]);
    return zone;
  }

  addBuilding(outerZoneId: string, input: AddBuildingInput): Building | undefined {
    const outerZone = this.findNode(outerZoneId);
    if (!outerZone || outerZone.kind !== 'outerZone') return undefined;

    const building: Building = {
      kind: 'building',
      id: this.genId('building'),
      name: input.name,
      coords: input.coords ?? this.jitteredCoords(outerZone.coords),
      floors: [],
      description: input.description || undefined,
      status: input.status ?? 'active',
    };
    outerZone.buildings = [...outerZone.buildings, building];
    this._projects.update((projects) => [...projects]);
    return building;
  }

  addSubZone(parentZoneId: string, input: AddZoneInput): Zone | undefined {
    const parentZone = this.findNode(parentZoneId);
    if (!parentZone || parentZone.kind !== 'zone') return undefined;

    const zone: Zone = {
      kind: 'zone',
      id: this.genId('zone'),
      name: input.name,
      color: input.color,
      coords: input.coords ?? this.jitteredCoords(parentZone.coords, 1),
      zones: [],
      description: input.description || undefined,
      mapImage: input.mapImage || undefined,
      topZone: input.topZone || undefined,
      isTopZone: input.isTopZone,
      priority: input.priority || undefined,
      exit: input.exit || undefined,
      assemblyPoint: input.assemblyPoint ?? 'active',
      timeTakenAssemblePoint: input.timeTakenAssemblePoint,
      status: input.status ?? 'active',
    };
    parentZone.zones = [...parentZone.zones, zone];
    this._projects.update((projects) => [...projects]);
    return zone;
  }

  // ===== Backend-hydrated data (Projects only) =====
  // Project, Area (Country), State (Area), Outer Zone, Building, Floor, Zone, and Sub-Zone records
  // are owned by a real backend; the methods below let the Projects component fetch/create/update/
  // delete them over HTTP and feed the results back into this shared tree, without this library
  // needing to know about HttpClient or environment config. The Zone API only models a zone added
  // directly under a Floor, and the Sub-Zone API only models a zone nested one level under one of
  // those — so a zone added directly to a State (outdoor), or a sub-zone nested under a State-direct
  // zone, has no backend shape to persist through and remains purely local via
  // addZoneToState/addSubZone above.

  /** Replaces the whole project tree — used once real project + country data has been fetched. */
  seedProjects(projects: Project[]): void {
    this._projects.set(projects);
  }

  /** Inserts an already-built project (e.g. one just created via a real backend call). */
  insertProject(project: Project): void {
    this._projects.update((projects) => [...projects, project]);
  }

  /** Patches editable fields (including name) on an existing project in place. */
  updateProjectFields(id: string, changes: Partial<Pick<Project, 'name' | 'description' | 'weekStart' | 'weekEnd' | 'status'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'project') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built area/country under an existing project. */
  insertArea(projectId: string, area: Area): boolean {
    const project = this.findNode(projectId);
    if (!project || project.kind !== 'project') return false;
    project.areas = [...project.areas, area];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing area/country in place. */
  updateAreaFields(id: string, changes: Partial<Pick<Area, 'name' | 'description' | 'timeZone' | 'countryCode' | 'status' | 'coords'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'area') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built state/area (UI label "Area") under an existing country. */
  insertState(countryId: string, state: State): boolean {
    const area = this.findNode(countryId);
    if (!area || area.kind !== 'area') return false;
    area.states = [...area.states, state];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing state/area in place. */
  updateStateFields(id: string, changes: Partial<Pick<State, 'name' | 'description' | 'status' | 'coords' | 'type'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'state') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built outer zone under an existing state/area. */
  insertOuterZone(stateId: string, outerZone: OuterZone): boolean {
    const state = this.findNode(stateId);
    if (!state || state.kind !== 'state') return false;
    state.outerZones = [...state.outerZones, outerZone];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing outer zone in place. */
  updateOuterZoneFields(id: string, changes: Partial<Pick<OuterZone, 'name' | 'description' | 'status' | 'coords'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'outerZone') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built building under an existing outer zone. */
  insertBuilding(outerZoneId: string, building: Building): boolean {
    const outerZone = this.findNode(outerZoneId);
    if (!outerZone || outerZone.kind !== 'outerZone') return false;
    outerZone.buildings = [...outerZone.buildings, building];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing building in place. */
  updateBuildingFields(id: string, changes: Partial<Pick<Building, 'name' | 'description' | 'status' | 'coords'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'building') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built floor under an existing building. */
  insertFloor(buildingId: string, floor: Floor): boolean {
    const building = this.findNode(buildingId);
    if (!building || building.kind !== 'building') return false;
    building.floors = [...building.floors, floor];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing floor in place. */
  updateFloorFields(id: string, changes: Partial<Pick<Floor, 'name' | 'description' | 'status' | 'mapImage'>>): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'floor') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built zone under an existing floor. */
  insertZone(floorId: string, zone: Zone): boolean {
    const floor = this.findNode(floorId);
    if (!floor || floor.kind !== 'floor') return false;
    floor.zones = [...floor.zones, zone];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Patches editable fields (including name) on an existing zone or sub-zone in place. */
  updateZoneFields(
    id: string,
    changes: Partial<
      Pick<
        Zone,
        | 'name'
        | 'description'
        | 'status'
        | 'mapImage'
        | 'topZone'
        | 'isTopZone'
        | 'priority'
        | 'exit'
        | 'assemblyPoint'
        | 'timeTakenAssemblePoint'
      >
    >,
  ): boolean {
    const node = this.findNode(id);
    if (!node || node.kind !== 'zone') return false;
    Object.assign(node, changes);
    this._projects.update((projects) => [...projects]);
    return true;
  }

  /** Inserts an already-built sub-zone under an existing zone. */
  insertSubZone(zoneId: string, subZone: Zone): boolean {
    const zone = this.findNode(zoneId);
    if (!zone || zone.kind !== 'zone') return false;
    zone.zones = [...zone.zones, subZone];
    this._projects.update((projects) => [...projects]);
    return true;
  }

  rename(nodeId: string, newName: string): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.name = newName;
    this._projects.update((projects) => [...projects]);
    return true;
  }

  deleteNode(nodeId: string): boolean {
    const found = this.findWithParent(nodeId);
    if (!found) return false;

    if (found.parent === null) {
      this._projects.update((projects) => projects.filter((p) => p.id !== nodeId));
      return true;
    }

    const parent = found.parent;
    switch (parent.kind) {
      case 'project':
        parent.areas = parent.areas.filter((a) => a.id !== nodeId);
        break;
      case 'area':
        parent.states = parent.states.filter((s) => s.id !== nodeId);
        break;
      case 'state':
        parent.zones = parent.zones.filter((z) => z.id !== nodeId);
        parent.outerZones = parent.outerZones.filter((o) => o.id !== nodeId);
        break;
      case 'outerZone':
        parent.buildings = parent.buildings.filter((b) => b.id !== nodeId);
        break;
      case 'building':
        parent.floors = parent.floors.filter((f) => f.id !== nodeId);
        break;
      case 'floor':
        parent.zones = parent.zones.filter((z) => z.id !== nodeId);
        break;
      case 'zone':
        parent.zones = parent.zones.filter((z) => z.id !== nodeId);
        break;
    }
    this._projects.update((projects) => [...projects]);
    return true;
  }
}
