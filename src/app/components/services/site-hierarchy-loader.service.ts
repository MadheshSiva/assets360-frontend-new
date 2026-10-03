import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, tap } from 'rxjs';
import { Area, Building, Coords, Floor, OuterZone, Project, SiteHierarchyService, State, Zone } from 'shared-ui';
import { ProjectService, AppProject } from './project.service';
import { CountryService, AppCountry } from './country.service';
import { ProjectAreaService, AppProjectArea } from './project-area.service';
import { OuterZoneService, AppOuterZone } from './outer-zone.service';
import { BuildingService, AppBuilding } from './building.service';
import { FloorService, AppFloor } from './floor.service';
import { ZoneService, AppZone } from './zone.service';
import { SubZoneService, AppSubZone } from './sub-zone.service';

/** Used for backend-sourced projects/countries, which don't carry map coordinates of their own. */
export const DEFAULT_COORDS: Coords = { lat: 25.2048, lng: 55.2708, zoom: 6 };

export const ZONE_COLORS = [
  { label: 'Purple', value: '#5b3df5' },
  { label: 'Red', value: '#c22a3e' },
  { label: 'Green', value: '#158b4b' },
  { label: 'Amber', value: '#a8650a' },
  { label: 'Blue', value: '#2563eb' },
];

/**
 * Loads the site hierarchy (Project -> Country -> Area -> Outer Zone -> Building -> Floor -> Zone -> Sub Zone)
 * from the backend's flat endpoints and puts it in the shared SiteHierarchyService, the store that
 * Projects, Locating and Asset Registration all read.
 */
@Injectable({ providedIn: 'root' })
export class SiteHierarchyLoader {
  private readonly hierarchy = inject(SiteHierarchyService);
  private readonly projectService = inject(ProjectService);
  private readonly countryService = inject(CountryService);
  private readonly projectAreaService = inject(ProjectAreaService);
  private readonly outerZoneService = inject(OuterZoneService);
  private readonly buildingService = inject(BuildingService);
  private readonly floorService = inject(FloorService);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);

  /** Fetches every level, builds the tree and replaces the shared hierarchy with it. */
  load(): Observable<Project[]> {
    return forkJoin({
      projects: this.projectService.getAll(),
      countries: this.countryService.getAll(),
      areas: this.projectAreaService.getAll(),
      outerZones: this.outerZoneService.getAll(),
      buildings: this.buildingService.getAll(),
      floors: this.floorService.getAll(),
      zones: this.zoneService.getAll(),
      subZones: this.subZoneService.getAll(),
    }).pipe(
      map(({ projects, countries, areas, outerZones, buildings, floors, zones, subZones }) =>
        projects.map((project) =>
          toTreeProject(
            project,
            countries.filter((c) => c.projectId === project.id),
            areas,
            outerZones,
            buildings,
            floors,
            zones,
            subZones,
          ),
        ),
      ),
      tap((tree) => this.hierarchy.seedProjects(tree)),
    );
  }
}

// ===== Backend records -> shared hierarchy nodes =====

export function toTreeProject(
  project: AppProject,
  countries: AppCountry[],
  areas: AppProjectArea[],
  outerZones: AppOuterZone[],
  buildings: AppBuilding[],
  floors: AppFloor[],
  zones: AppZone[],
  subZones: AppSubZone[],
): Project {
  return {
    kind: 'project',
    id: project.id,
    name: project.projectName,
    description: project.description || undefined,
    weekStart: project.weekStart ? project.weekStart.slice(0, 10) : undefined,
    weekEnd: project.weekEnd ? project.weekEnd.slice(0, 10) : undefined,
    status: project.status ? 'active' : 'inactive',
    coords: DEFAULT_COORDS,
    areas: countries.map((country) =>
      toTreeArea(
        country,
        areas.filter((a) => a.countryId === country.id),
        outerZones,
        buildings,
        floors,
        zones,
        subZones,
      ),
    ),
  };
}

export function toTreeArea(
  country: AppCountry,
  states: AppProjectArea[],
  outerZones: AppOuterZone[],
  buildings: AppBuilding[],
  floors: AppFloor[],
  zones: AppZone[],
  subZones: AppSubZone[],
): Area {
  const lat = parseFloat(country.latitude);
  const lng = parseFloat(country.longitude);
  return {
    kind: 'area',
    id: country.id,
    name: country.countryName,
    coords: !isNaN(lat) && !isNaN(lng) ? { lat, lng, zoom: 11 } : DEFAULT_COORDS,
    states: states.map((state) =>
      toTreeState(
        state,
        outerZones.filter((o) => o.areaId === state.id),
        buildings,
        floors,
        zones,
        subZones,
      ),
    ),
    description: country.description || undefined,
    timeZone: country.timeZone || undefined,
    countryCode: country.countryCode || undefined,
    status: country.status ? 'active' : 'inactive',
  };
}

/**
 * The backend "Area" resource has no indoor/outdoor classification, so a freshly-loaded state
 * always allows both zones and outer zones (`indoor_outdoor`) — the "Outdoor Map" choice made in
 * the form only affects the current session's tree behavior, since there's nowhere to persist it.
 */
export function toTreeState(
  area: AppProjectArea,
  outerZones: AppOuterZone[],
  buildings: AppBuilding[],
  floors: AppFloor[],
  zones: AppZone[],
  subZones: AppSubZone[],
): State {
  const lat = parseFloat(area.latitude);
  const lng = parseFloat(area.longitude);
  return {
    kind: 'state',
    id: area.id,
    name: area.areaName,
    type: 'indoor_outdoor',
    coords: !isNaN(lat) && !isNaN(lng) ? { lat, lng, zoom: 13 } : DEFAULT_COORDS,
    zones: [],
    outerZones: outerZones.map((oz) =>
      toTreeOuterZone(oz, buildings.filter((b) => b.outerZoneId === oz.id), floors, zones, subZones),
    ),
    description: area.description || undefined,
    status: area.status ? 'active' : 'inactive',
  };
}

export function toTreeOuterZone(
  outerZone: AppOuterZone,
  buildings: AppBuilding[],
  floors: AppFloor[],
  zones: AppZone[],
  subZones: AppSubZone[],
): OuterZone {
  const lat = parseFloat(outerZone.latitude);
  const lng = parseFloat(outerZone.longitude);
  return {
    kind: 'outerZone',
    id: outerZone.id,
    name: outerZone.outerZoneName,
    coords: !isNaN(lat) && !isNaN(lng) ? { lat, lng, zoom: 14 } : DEFAULT_COORDS,
    buildings: buildings.map((b) => toTreeBuilding(b, floors, zones, subZones)),
    description: outerZone.description || undefined,
    status: outerZone.status ? 'active' : 'inactive',
  };
}

export function toTreeBuilding(building: AppBuilding, floors: AppFloor[], zones: AppZone[], subZones: AppSubZone[]): Building {
  const lat = parseFloat(building.latitude);
  const lng = parseFloat(building.longitude);
  const coords = !isNaN(lat) && !isNaN(lng) ? { lat, lng, zoom: 16 } : DEFAULT_COORDS;
  return {
    kind: 'building',
    id: building.id,
    name: building.buildingName,
    coords,
    floors: floors.filter((f) => f.buildingId === building.id).map((f) => toTreeFloor(f, coords, zones, subZones)),
    description: building.description || undefined,
    status: building.status ? 'active' : 'inactive',
  };
}

/** The backend "Floor" resource carries no coordinates of its own, so it inherits its building's. */
export function toTreeFloor(floor: AppFloor, buildingCoords: Coords, zones: AppZone[], subZones: AppSubZone[]): Floor {
  return {
    kind: 'floor',
    id: floor.id,
    name: floor.floorName,
    coords: buildingCoords,
    zones: zones.filter((z) => z.floorId === floor.id).map((z) => toTreeZone(z, buildingCoords, subZones)),
    description: floor.description || undefined,
    mapImage: floor.mapPath || undefined,
    status: floor.status ? 'active' : 'inactive',
  };
}

/** The backend "Zone" resource carries no coordinates of its own, so it inherits its floor's. */
export function toTreeZone(zone: AppZone, floorCoords: Coords, subZones: AppSubZone[]): Zone {
  return {
    kind: 'zone',
    id: zone.id,
    name: zone.zoneName,
    color: ZONE_COLORS[0].value,
    coords: floorCoords,
    zones: subZones.filter((s) => s.zoneId === zone.id).map((s) => toTreeSubZone(s, floorCoords)),
    description: zone.description || undefined,
    mapImage: zone.mapPath || undefined,
    topZone: zone.topZone || undefined,
    priority: zone.priority || undefined,
    exit: zone.exitPoint ? 'active' : 'inactive',
    assemblyPoint: zone.musterPoint ? 'active' : 'inactive',
    timeTakenAssemblePoint: zone.timeTakenAssemblePoint,
    status: zone.status ? 'active' : 'inactive',
  };
}

/** The backend "Sub-Zone" resource carries no coordinates of its own, so it inherits its zone's. */
export function toTreeSubZone(subZone: AppSubZone, zoneCoords: Coords): Zone {
  return {
    kind: 'zone',
    id: subZone.id,
    name: subZone.subZoneName,
    color: ZONE_COLORS[0].value,
    coords: zoneCoords,
    zones: [],
    description: subZone.description || undefined,
    mapImage: subZone.mapPath || undefined,
    isTopZone: subZone.topZone ? 'active' : 'inactive',
    priority: String(subZone.priority),
    exit: subZone.exit ? 'active' : 'inactive',
    assemblyPoint: subZone.assemblyPoint ? 'active' : 'inactive',
    timeTakenAssemblePoint: subZone.timeTakenAssemblePoint,
    status: subZone.status ? 'active' : 'inactive',
  };
}
