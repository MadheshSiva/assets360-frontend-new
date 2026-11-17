import { Injectable } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import { CURRENT_USER } from '../shared/admin-common';
import {
  FILE_FORMATS,
  FileFormat,
  FloorPlan,
  FloorPlanType,
  LAYERS,
  LayerSet,
  LocationKind,
  MapLayer,
  MapStatus,
  MapVersion,
  MapZone,
  MapsSummary,
  PlotItem,
  PlotKind,
  ZONE_TYPES,
  ZoneOptions,
  ZoneShape,
  ZoneType,
  DEFAULT_ZONE_OPTIONS,
  plotKey,
  plotLook,
  zoneTone
} from './maps.data';
import {
  SEED_ASSETS,
  SEED_DEVICES,
  SEED_FLOOR_PLANS,
  SEED_LAYER_SETS,
  SEED_LOCATIONS,
  SEED_PLOTS,
  SEED_VERSIONS,
  SEED_ZONES
} from './maps.seed';

/*
 * DEMO MODE: Maps & Floor Plans works on static demo data (maps.seed.ts) kept in memory. The record shapes follow
 * the maps API contract (DTOs below); changes last until the page is reloaded. Uploaded files become object URLs.
 */

/* ===== DTOs: maps API ===== */

export interface MapsSummaryDto {
  floorPlans: number;
  zones: number;
  devicesPlotted: number;
  assetsPlotted: number;
}

export interface FloorPlanDto {
  floorPlanId: string;
  locationId: string;
  locationType: LocationKind;
  locationPath: string | null;
  name: string;
  description: string | null;
  type: FloorPlanType;
  format: FileFormat;
  fileUrl: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  widthMeters: number | null;
  heightMeters: number | null;
  scale: string | null;
  currentVersion: string | null;
  status: MapStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  zoneCount: number | null;
  plotCount: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

export interface CreateFloorPlanRequest {
  locationId: string;
  locationType: LocationKind;
  locationPath: string;
  name: string;
  description: string;
  type: FloorPlanType;
  fileUrl: string;
  fileName: string;
  format: FileFormat;
  sizeBytes: number;
  widthMeters: number | null;
  heightMeters: number | null;
  scale: string;
  status: MapStatus;
  versionNote: string;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

export interface UpdateFloorPlanRequest {
  name: string;
  description: string;
  type: FloorPlanType;
  widthMeters: number | null;
  heightMeters: number | null;
  scale: string;
  locationId: string;
  locationType: LocationKind;
  locationPath: string;
  updatedBy: string;
}

export interface VersionDto {
  version: string;
  current: boolean;
  status: MapStatus;
  fileUrl: string | null;
  fileName: string | null;
  format: FileFormat | null;
  sizeBytes: number | null;
  description: string | null;
  changes: string[] | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
}

export interface CreateVersionRequest {
  fileUrl: string;
  fileName: string;
  format: FileFormat;
  sizeBytes: number;
  bump: 'minor' | 'major';
  description: string;
  changes: string[];
  createdBy: string;
}

export interface ZoneOptionsDto {
  zoneTypes: string[];
  shapes: string[];
  accessRules: string[];
  colors: string[];
}

export interface SaveZoneRequest {
  code: string;
  name: string;
  type: ZoneType;
  color: string;
  shape: ZoneShape;
  x: number;
  y: number;
  w: number;
  h: number;
  points: { x: number; y: number }[];
  radius: number | null;
  areaM2: number;
  description: string;
  accessRule: string;
  active: boolean;
  geofence: boolean;
  entryAlert: boolean;
  exitAlert: boolean;
  dwellAlert: boolean;
  dwellMinutes: number;
  createdBy?: string;
  updatedBy?: string;
  clientId: string;
  tenantId: string;
}

export interface ZoneDto extends Omit<SaveZoneRequest, 'createdBy' | 'updatedBy' | 'clientId' | 'tenantId'> {
  zoneId: string;
  floorPlanId: string;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface SavePlotRequest {
  code: string;
  name: string;
  type: string;
  assetType: string | null;
  model: string | null;
  serial: string | null;
  status: string;
  x: number;
  y: number;
  orientation: number;
  zoneId: string | null;
  updatedBy: string;
  clientId: string;
  tenantId: string;
}

export interface PlotDto extends Omit<SavePlotRequest, 'updatedBy' | 'clientId' | 'tenantId'> {
  floorPlanId: string;
  kind: PlotKind;
  itemId: string;
  updatedAt: string | null;
}

export interface SaveLayerRequest {
  enabled: boolean;
  visible: boolean;
  locked: boolean;
  showLabel: boolean;
  showId: boolean;
  showStatusIcon: boolean;
  useCategoryColor: boolean;
  labelPosition: string;
  categories: string[];
  statusFilter: string;
  opacity: number;
  color: string;
  updatedBy: string;
}

export interface LayerDto extends Omit<SaveLayerRequest, 'updatedBy'> {
  key: string;
  name: string;
  type: string;
  description: string;
}

export interface LayerSetDto {
  layerSetId: string;
  name: string;
  layers: Record<string, boolean> | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** Settings are the Settings tab's DEFAULTS object, round-tripped as-is (plus `extra` for keys the API doesn't type). */
export type SettingsDto = Record<string, unknown> & { extra?: Record<string, unknown> | null };

/* ===== DTOs: other services (read only) ===== */

/** GET api/master-data/sites */
export interface MdmSiteDto {
  id: string;
  siteName: string;
  code?: string | null;
  /** Map position (WGS 84) from Master Data, when set */
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  isDeleted?: boolean;
}

/** GET api/master-data/buildings */
export interface MdmBuildingDto {
  id: string;
  name: string;
  code?: string | null;
  site?: { id: string | null; name?: string | null } | null;
  /** Map position (WGS 84) from Master Data, when set */
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  isDeleted?: boolean;
}

/** GET api/master-data/floors (`site` may be a reference or a plain id / name). */
export interface MdmFloorDto {
  id: string;
  name: string;
  code?: string | null;
  site?: { id: string | null; name?: string | null } | string | null;
  buildingId?: string | null;
  buildingName?: string | null;
  /** Floor layout picture set in Master Data (data URL or link) */
  imageUrl?: string | null;
  images?: string[] | null;
  /** Map position (WGS 84) from Master Data, when set */
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  isDeleted?: boolean;
}

/** One row of GET api/asset-registrations (AssetListItemResponse). */
export interface AssetListItemDto {
  id: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  assetTag: string | null;
  category: string | null;
  assetType: string | null;
  status: string | null;
  manufacturer: string | null;
}

/** One row of GET api/iot-devices (Tracking). */
export interface IoTDeviceDto {
  id: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  model: string | null;
  serialNumber: string | null;
  health: string | null;
  lastSeenAt: string | null;
}

export interface LocationSources {
  organizationName: string;
  sites: MdmSiteDto[];
  buildings: MdmBuildingDto[];
  floors: MdmFloorDto[];
}

/* ===== Mappers ===== */

function mb(bytes: number | null | undefined): number {
  return Math.round(((bytes ?? 0) / (1024 * 1024)) * 10) / 10;
}

function dims(w: number | null, h: number | null): string {
  return w && h ? `${w.toFixed(2)} m × ${h.toFixed(2)} m` : '—';
}

function formatOf(value: string | null | undefined): FileFormat {
  const f = (value ?? '').toUpperCase();
  return (FILE_FORMATS.find((x) => x === (f === 'JPEG' ? 'JPG' : f)) ?? 'PNG') as FileFormat;
}

/** File format from a file name (extension), or null when it isn't one the API accepts. */
export function formatFromFileName(name: string): FileFormat | null {
  const ext = (name.split('.').pop() ?? '').toUpperCase();
  const f = ext === 'JPEG' ? 'JPG' : ext;
  return (FILE_FORMATS as string[]).includes(f) ? (f as FileFormat) : null;
}

export function toFloorPlan(d: FloorPlanDto): FloorPlan {
  const status: MapStatus = d.status === 'Published' || d.status === 'Archived' ? d.status : 'Draft';
  return {
    id: d.floorPlanId,
    locationId: d.locationId,
    locationType: d.locationType ?? 'floor',
    locationPath: d.locationPath ?? '',
    name: d.name,
    subtitle: d.description ?? '',
    type: d.type === 'Site Map' ? 'Site Map' : 'Floor Plan',
    format: formatOf(d.format),
    fileUrl: d.fileUrl ?? '',
    fileName: d.fileName ?? '',
    sizeBytes: d.sizeBytes ?? 0,
    sizeMb: mb(d.sizeBytes),
    widthMeters: d.widthMeters ?? null,
    heightMeters: d.heightMeters ?? null,
    dimensions: dims(d.widthMeters ?? null, d.heightMeters ?? null),
    scale: d.scale ?? '',
    version: d.currentVersion ?? 'v1.0',
    status,
    publishedAt: d.publishedAt ?? null,
    publishedBy: d.publishedBy ?? null,
    zoneCount: d.zoneCount ?? 0,
    plotCount: d.plotCount ?? 0,
    updated: d.updatedAt ?? d.createdAt ?? '',
    updatedBy: d.updatedBy ?? d.createdBy ?? ''
  };
}

export function toVersion(d: VersionDto): MapVersion {
  const status: MapStatus = d.status === 'Published' || d.status === 'Archived' ? d.status : 'Draft';
  const changes = (d.changes ?? []).filter((c) => !!c?.trim());
  return {
    version: d.version,
    current: !!d.current,
    status,
    changes: changes.length ? changes : d.description ? [d.description] : [],
    uploadedBy: d.uploadedBy ?? '',
    uploadedOn: d.uploadedAt ?? '',
    fileUrl: d.fileUrl ?? '',
    fileName: d.fileName ?? '',
    format: formatOf(d.format),
    sizeMb: mb(d.sizeBytes),
    description: d.description ?? ''
  };
}

export function toZone(d: ZoneDto): MapZone {
  const type = (ZONE_TYPES.some((t) => t.type === d.type) ? d.type : 'Operational') as ZoneType;
  return {
    id: d.zoneId,
    floorPlanId: d.floorPlanId,
    code: d.code,
    name: d.name,
    type,
    tone: zoneTone(type),
    color: d.color ?? '',
    shape: (['Polygon', 'Rectangle', 'Circle', 'Custom'] as ZoneShape[]).includes(d.shape) ? d.shape : 'Rectangle',
    x: d.x ?? 0,
    y: d.y ?? 0,
    w: d.w ?? 0,
    h: d.h ?? 0,
    points: d.points ?? [],
    radius: d.radius ?? null,
    areaM2: d.areaM2 ?? 0,
    description: d.description ?? '',
    accessRule: d.accessRule ?? '',
    active: d.active ?? true,
    entryAlert: !!d.entryAlert,
    exitAlert: !!d.exitAlert,
    dwellAlert: !!d.dwellAlert,
    dwellMinutes: d.dwellMinutes ?? 30,
    geofence: !!d.geofence
  };
}

/** A plot row on its own (when its asset / device is not in the candidate lists). */
export function toPlotItem(d: PlotDto): PlotItem {
  const kind: PlotKind = d.kind === 'device' ? 'device' : 'asset';
  const look = plotLook(kind, d.type ?? '', d.assetType ?? '');
  return {
    id: plotKey(kind, d.itemId),
    itemId: d.itemId,
    code: d.code || d.itemId,
    name: d.name || d.code || d.itemId,
    kind,
    type: d.type ?? '',
    assetType: d.assetType ?? undefined,
    model: d.model ?? undefined,
    serial: d.serial ?? undefined,
    icon: look.icon,
    tone: look.tone,
    status: d.status || 'Active',
    x: d.x ?? null,
    y: d.y ?? null,
    zoneId: d.zoneId ?? undefined,
    orientation: d.orientation ?? 0,
    lastUpdated: d.updatedAt ?? ''
  };
}

function assetCandidate(d: AssetListItemDto): PlotItem {
  const itemId = d.assetRegistrationId || d.id;
  const type = d.category ?? '';
  const look = plotLook('asset', type, d.assetType ?? '');
  return {
    id: plotKey('asset', itemId),
    itemId,
    code: d.assetTag || itemId,
    name: d.assetName || d.assetTag || itemId,
    kind: 'asset',
    type,
    assetType: d.assetType ?? undefined,
    model: d.manufacturer ?? undefined,
    serial: undefined,
    icon: look.icon,
    tone: look.tone,
    status: d.status || 'Active',
    x: null,
    y: null,
    orientation: 0,
    lastUpdated: ''
  };
}

function deviceCandidate(d: IoTDeviceDto): PlotItem {
  const type = d.deviceType ?? '';
  const look = plotLook('device', type);
  // The device API has no connection state: Offline when the last message is older than 30 minutes
  const seen = d.lastSeenAt ? Date.parse(d.lastSeenAt) : NaN;
  const status = Number.isNaN(seen) ? 'Inactive' : Date.now() - seen > 30 * 60_000 ? 'Offline' : 'Active';
  return {
    id: plotKey('device', d.deviceId),
    itemId: d.deviceId,
    code: d.deviceId,
    name: d.deviceName || d.deviceId,
    kind: 'device',
    type,
    model: d.model ?? undefined,
    serial: d.serialNumber ?? undefined,
    icon: look.icon,
    tone: look.tone,
    status,
    x: null,
    y: null,
    orientation: 0,
    lastUpdated: d.lastSeenAt ?? ''
  };
}

export function toLayer(d: LayerDto): MapLayer {
  const base = LAYERS.find((l) => l.id === d.key);
  return {
    id: d.key,
    name: d.name || base?.name || d.key,
    type: d.type || base?.type || '',
    description: d.description ?? base?.description ?? '',
    icon: base?.icon ?? LAYERS[0].icon,
    tone: base?.tone ?? 'purple',
    enabled: d.enabled ?? base?.enabled ?? true,
    visible: d.visible ?? true,
    locked: d.locked ?? base?.locked ?? false,
    showLabel: d.showLabel ?? true,
    showId: d.showId ?? true,
    showStatusIcon: d.showStatusIcon ?? false,
    useCategoryColor: d.useCategoryColor ?? true,
    labelPosition: d.labelPosition || 'Bottom Center',
    categories: d.categories ?? [],
    statusFilter: d.statusFilter || 'All Statuses',
    opacity: d.opacity ?? 80,
    color: d.color || '#5B2AA8'
  };
}

export function toLayerSet(d: LayerSetDto): LayerSet {
  return { id: d.layerSetId, name: d.name, layers: d.layers ?? {}, createdBy: d.createdBy ?? '', createdAt: d.createdAt ?? '' };
}
/* ===== In-memory store ===== */

const TENANT = { clientId: 'demo-client', tenantId: 'demo-tenant' };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function notFound(what: string): Observable<never> {
  return throwError(() => new Error(`${what} no longer exists.`));
}

/** "v2.1" -> [2, 1] */
function parseVersion(v: string): [number, number] {
  const m = /v?(\d+)(?:\.(\d+))?/i.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : [1, 0];
}

function nextVersion(list: VersionDto[], bump: 'minor' | 'major'): string {
  let [maj, min] = [0, 0];
  for (const v of list) {
    const [a, b] = parseVersion(v.version);
    if (a > maj || (a === maj && b > min)) [maj, min] = [a, b];
  }
  return bump === 'major' ? `v${maj + 1}.0` : `v${maj}.${min + 1}`;
}

@Injectable({ providedIn: 'root' })
export class MapsApiService {
  private plans: FloorPlanDto[] = clone(SEED_FLOOR_PLANS);
  private versions = new Map<string, VersionDto[]>(Object.entries(clone(SEED_VERSIONS)));
  private zones: ZoneDto[] = clone(SEED_ZONES);
  private plots: PlotDto[] = clone(SEED_PLOTS);
  private layers = new Map<string, LayerDto[]>();
  private layerSets: LayerSetDto[] = clone(SEED_LAYER_SETS);
  private settings: SettingsDto = {};
  private seq = 100;

  /** Signed-in user for createdBy / updatedBy. */
  get user(): string {
    return CURRENT_USER.name;
  }

  private id(prefix: string): string {
    return `${prefix}-${String(++this.seq).padStart(4, '0')}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** The plan with live zone / plot counts. */
  private planOut(p: FloorPlanDto): FloorPlan {
    return toFloorPlan({
      ...p,
      zoneCount: this.zones.filter((z) => z.floorPlanId === p.floorPlanId).length,
      plotCount: this.plots.filter((x) => x.floorPlanId === p.floorPlanId).length
    });
  }

  private plan(id: string): FloorPlanDto | undefined {
    return this.plans.find((p) => p.floorPlanId === id);
  }

  private touch(p: FloorPlanDto): void {
    p.updatedAt = this.now();
    p.updatedBy = this.user;
  }

  /** The location and every location under it (site → buildings → floors). */
  private subtree(locationId: string): Set<string> {
    const ids = new Set([locationId]);
    for (const b of SEED_LOCATIONS.buildings) if (ids.has(b.site?.id ?? '')) ids.add(b.id);
    for (const f of SEED_LOCATIONS.floors) {
      const site = typeof f.site === 'string' ? f.site : (f.site?.id ?? '');
      if (ids.has(f.buildingId ?? '') || ids.has(site)) ids.add(f.id);
    }
    return ids;
  }

  /* ===== Summary ===== */

  summary(locationId: string): Observable<MapsSummary> {
    return defer(() => {
      const ids = locationId ? this.subtree(locationId) : null;
      const plans = this.plans.filter((p) => !ids || ids.has(p.locationId)).map((p) => p.floorPlanId);
      const plots = this.plots.filter((p) => plans.includes(p.floorPlanId));
      return of({
        floorPlans: plans.length,
        zones: this.zones.filter((z) => plans.includes(z.floorPlanId)).length,
        devicesPlotted: plots.filter((p) => p.kind === 'device').length,
        assetsPlotted: plots.filter((p) => p.kind === 'asset').length
      });
    });
  }

  /* ===== Floor plans ===== */

  listFloorPlans(filters: { locationId?: string; status?: string; type?: string; search?: string } = {}): Observable<FloorPlan[]> {
    return defer(() => {
      const q = filters.search?.trim().toLowerCase();
      const list = this.plans.filter(
        (p) =>
          (!filters.locationId || p.locationId === filters.locationId) &&
          (!filters.status || p.status === filters.status) &&
          (!filters.type || p.type === filters.type) &&
          (!q || `${p.name} ${p.description ?? ''} ${p.locationPath ?? ''}`.toLowerCase().includes(q))
      );
      return of(list.map((p) => this.planOut(p)));
    });
  }

  getFloorPlan(id: string): Observable<FloorPlan> {
    return defer(() => {
      const p = this.plan(id);
      return p ? of(this.planOut(p)) : notFound('The floor plan');
    });
  }

  createFloorPlan(body: Omit<CreateFloorPlanRequest, 'createdBy' | 'clientId' | 'tenantId'>): Observable<FloorPlan> {
    return defer(() => {
      const now = this.now();
      const published = body.status === 'Published';
      const dto: FloorPlanDto = {
        floorPlanId: this.id('FP'),
        locationId: body.locationId,
        locationType: body.locationType,
        locationPath: body.locationPath,
        name: body.name,
        description: body.description,
        type: body.type,
        format: body.format,
        fileUrl: body.fileUrl,
        fileName: body.fileName,
        sizeBytes: body.sizeBytes,
        widthMeters: body.widthMeters,
        heightMeters: body.heightMeters,
        scale: body.scale,
        currentVersion: 'v1.0',
        status: body.status,
        publishedAt: published ? now : null,
        publishedBy: published ? this.user : null,
        zoneCount: 0,
        plotCount: 0,
        createdBy: this.user,
        createdAt: now,
        updatedBy: this.user,
        updatedAt: now,
        ...TENANT
      };
      this.plans = [dto, ...this.plans];
      const note = body.versionNote || 'Initial upload';
      this.versions.set(dto.floorPlanId, [
        {
          version: 'v1.0',
          current: true,
          status: body.status,
          fileUrl: body.fileUrl,
          fileName: body.fileName,
          format: body.format,
          sizeBytes: body.sizeBytes,
          description: note,
          changes: [note],
          uploadedBy: this.user,
          uploadedAt: now
        }
      ]);
      return of(this.planOut(dto));
    });
  }

  updateFloorPlan(id: string, body: Omit<UpdateFloorPlanRequest, 'updatedBy'>): Observable<FloorPlan> {
    return defer(() => {
      const p = this.plan(id);
      if (!p) return notFound('The floor plan');
      Object.assign(p, body);
      this.touch(p);
      return of(this.planOut(p));
    });
  }

  deleteFloorPlan(id: string): Observable<void> {
    return defer(() => {
      this.plans = this.plans.filter((p) => p.floorPlanId !== id);
      this.zones = this.zones.filter((z) => z.floorPlanId !== id);
      this.plots = this.plots.filter((p) => p.floorPlanId !== id);
      this.versions.delete(id);
      this.layers.delete(id);
      return of(undefined);
    });
  }

  publishFloorPlan(id: string): Observable<FloorPlan> {
    return defer(() => {
      const p = this.plan(id);
      if (!p) return notFound('The floor plan');
      p.status = 'Published';
      p.publishedAt = this.now();
      p.publishedBy = this.user;
      this.touch(p);
      const current = this.versions.get(id)?.find((v) => v.current);
      if (current) current.status = 'Published';
      return of(this.planOut(p));
    });
  }

  archiveFloorPlan(id: string): Observable<FloorPlan> {
    return defer(() => {
      const p = this.plan(id);
      if (!p) return notFound('The floor plan');
      p.status = 'Archived';
      this.touch(p);
      return of(this.planOut(p));
    });
  }

  /* ===== Versions ===== */

  listVersions(floorPlanId: string): Observable<MapVersion[]> {
    return defer(() => {
      const list = [...(this.versions.get(floorPlanId) ?? [])].sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
      return of(list.map((v) => toVersion(clone(v))));
    });
  }

  createVersion(floorPlanId: string, body: Omit<CreateVersionRequest, 'createdBy'>): Observable<MapVersion> {
    return defer(() => {
      const p = this.plan(floorPlanId);
      if (!p) return notFound('The floor plan');
      const list = this.versions.get(floorPlanId) ?? [];
      const v: VersionDto = {
        version: nextVersion(list, body.bump),
        current: false,
        status: 'Draft',
        fileUrl: body.fileUrl,
        fileName: body.fileName,
        format: body.format,
        sizeBytes: body.sizeBytes,
        description: body.description,
        changes: body.changes,
        uploadedBy: this.user,
        uploadedAt: this.now()
      };
      this.versions.set(floorPlanId, [v, ...list]);
      this.touch(p);
      return of(toVersion(clone(v)));
    });
  }

  /** Makes the version the plan's current, published one; the previous current version is archived. */
  publishVersion(floorPlanId: string, version: string): Observable<FloorPlan> {
    return defer(() => {
      const p = this.plan(floorPlanId);
      const list = this.versions.get(floorPlanId) ?? [];
      const v = list.find((x) => x.version === version);
      if (!p || !v) return notFound(`Version ${version}`);
      for (const x of list) {
        if (x.current && x !== v) x.status = 'Archived';
        x.current = x === v;
      }
      v.status = 'Published';
      p.currentVersion = v.version;
      p.status = 'Published';
      p.fileUrl = v.fileUrl ?? p.fileUrl;
      p.fileName = v.fileName ?? p.fileName;
      p.format = v.format ?? p.format;
      p.sizeBytes = v.sizeBytes ?? p.sizeBytes;
      p.publishedAt = this.now();
      p.publishedBy = this.user;
      this.touch(p);
      return of(this.planOut(p));
    });
  }

  /** Copies an older version as a new draft. */
  restoreVersion(floorPlanId: string, version: string): Observable<MapVersion> {
    return defer(() => {
      const list = this.versions.get(floorPlanId) ?? [];
      const src = list.find((x) => x.version === version);
      if (!src) return notFound(`Version ${version}`);
      const v: VersionDto = {
        ...clone(src),
        version: nextVersion(list, 'minor'),
        current: false,
        status: 'Draft',
        description: `Restored from ${version}`,
        changes: [`Restored from ${version}`],
        uploadedBy: this.user,
        uploadedAt: this.now()
      };
      this.versions.set(floorPlanId, [v, ...list]);
      return of(toVersion(clone(v)));
    });
  }

  /* ===== Zones ===== */

  zoneOptions(): Observable<ZoneOptions> {
    return of(clone(DEFAULT_ZONE_OPTIONS));
  }

  listZones(floorPlanId: string): Observable<MapZone[]> {
    return defer(() => of(this.zones.filter((z) => z.floorPlanId === floorPlanId).map((z) => toZone(clone(z)))));
  }

  private zoneBody(z: MapZone): Omit<ZoneDto, 'zoneId' | 'floorPlanId'> {
    const polygon = z.shape === 'Polygon' || z.shape === 'Custom';
    return {
      code: z.code,
      name: z.name,
      type: z.type,
      color: z.color,
      shape: z.shape,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      points: polygon
        ? z.points.length
          ? z.points.map((p) => ({ ...p }))
          : [{ x: z.x, y: z.y }, { x: z.x + z.w, y: z.y }, { x: z.x + z.w, y: z.y + z.h }, { x: z.x, y: z.y + z.h }]
        : [],
      radius: z.shape === 'Circle' ? (z.radius ?? z.w / 2) : null,
      areaM2: z.areaM2,
      description: z.description,
      accessRule: z.accessRule,
      active: z.active,
      geofence: z.geofence,
      entryAlert: z.entryAlert,
      exitAlert: z.exitAlert,
      dwellAlert: z.dwellAlert,
      dwellMinutes: z.dwellMinutes
    };
  }

  createZone(floorPlanId: string, z: MapZone): Observable<MapZone> {
    return defer(() => {
      if (!this.plan(floorPlanId)) return notFound('The floor plan');
      if (this.zones.some((x) => x.floorPlanId === floorPlanId && x.code.toUpperCase() === z.code.toUpperCase())) {
        return throwError(() => new Error(`Zone code ${z.code} is already used on this floor plan.`));
      }
      const now = this.now();
      const dto: ZoneDto = { ...this.zoneBody(z), zoneId: this.id('ZN'), floorPlanId, createdBy: this.user, createdAt: now, updatedBy: this.user, updatedAt: now };
      this.zones = [...this.zones, dto];
      return of(toZone(clone(dto)));
    });
  }

  updateZone(z: MapZone): Observable<MapZone> {
    return defer(() => {
      const current = this.zones.find((x) => x.zoneId === z.id);
      if (!current) return notFound(`Zone ${z.code}`);
      const dto: ZoneDto = { ...current, ...this.zoneBody(z), updatedBy: this.user, updatedAt: this.now() };
      this.zones = this.zones.map((x) => (x === current ? dto : x));
      return of(toZone(clone(dto)));
    });
  }

  deleteZone(zoneId: string): Observable<void> {
    return defer(() => {
      this.zones = this.zones.filter((z) => z.zoneId !== zoneId);
      this.plots.forEach((p) => p.zoneId === zoneId && (p.zoneId = null));
      return of(undefined);
    });
  }

  /* ===== Plots ===== */

  listPlots(floorPlanId: string, kind?: PlotKind): Observable<PlotDto[]> {
    return defer(() => of(clone(this.plots.filter((p) => p.floorPlanId === floorPlanId && (!kind || p.kind === kind)))));
  }

  /** Place or move an item (upsert), with a snapshot of the asset / device. */
  savePlot(floorPlanId: string, item: PlotItem): Observable<PlotDto> {
    return defer(() => {
      const dto: PlotDto = {
        floorPlanId,
        kind: item.kind,
        itemId: item.itemId,
        code: item.code,
        name: item.name,
        type: item.type,
        assetType: item.assetType ?? null,
        model: item.model ?? null,
        serial: item.serial ?? null,
        status: item.status,
        x: item.x ?? 0,
        y: item.y ?? 0,
        orientation: item.orientation,
        zoneId: item.zoneId ?? null,
        updatedAt: this.now()
      };
      const same = (p: PlotDto) => p.floorPlanId === floorPlanId && p.kind === item.kind && p.itemId === item.itemId;
      this.plots = this.plots.some(same) ? this.plots.map((p) => (same(p) ? dto : p)) : [...this.plots, dto];
      return of(clone(dto));
    });
  }

  deletePlot(floorPlanId: string, kind: PlotKind, itemId: string): Observable<void> {
    return defer(() => {
      this.plots = this.plots.filter((p) => !(p.floorPlanId === floorPlanId && p.kind === kind && p.itemId === itemId));
      return of(undefined);
    });
  }

  /* ===== Layers ===== */

  /** The plan's layers (the default set until one is changed). */
  private planLayers(floorPlanId: string): LayerDto[] {
    let list = this.layers.get(floorPlanId);
    if (!list) {
      list = LAYERS.map((l) => ({
        key: l.id,
        name: l.name,
        type: l.type,
        description: l.description,
        enabled: l.enabled,
        visible: l.visible,
        locked: l.locked,
        showLabel: l.showLabel,
        showId: l.showId,
        showStatusIcon: l.showStatusIcon,
        useCategoryColor: l.useCategoryColor,
        labelPosition: l.labelPosition,
        categories: [...l.categories],
        statusFilter: l.statusFilter,
        opacity: l.opacity,
        color: l.color
      }));
      this.layers.set(floorPlanId, list);
    }
    return list;
  }

  listLayers(floorPlanId: string): Observable<MapLayer[]> {
    return defer(() => of(this.planLayers(floorPlanId).map((l) => toLayer(clone(l)))));
  }

  saveLayer(floorPlanId: string, l: MapLayer): Observable<MapLayer> {
    return defer(() => {
      const list = this.planLayers(floorPlanId);
      const i = list.findIndex((x) => x.key === l.id);
      if (i < 0) return notFound(`Layer ${l.name}`);
      list[i] = {
        ...list[i],
        enabled: l.enabled,
        visible: l.visible,
        locked: l.locked,
        showLabel: l.showLabel,
        showId: l.showId,
        showStatusIcon: l.showStatusIcon,
        useCategoryColor: l.useCategoryColor,
        labelPosition: l.labelPosition,
        categories: [...l.categories],
        statusFilter: l.statusFilter,
        opacity: l.opacity,
        color: l.color
      };
      return of(toLayer(clone(list[i])));
    });
  }

  listLayerSets(): Observable<LayerSet[]> {
    return defer(() => of(this.layerSets.map((s) => toLayerSet(clone(s)))));
  }

  createLayerSet(name: string, layers: Record<string, boolean>): Observable<LayerSet> {
    return defer(() => {
      const dto: LayerSetDto = { layerSetId: this.id('LS'), name, layers: { ...layers }, createdBy: this.user, createdAt: this.now() };
      this.layerSets = [...this.layerSets, dto];
      return of(toLayerSet(clone(dto)));
    });
  }

  deleteLayerSet(id: string): Observable<void> {
    return defer(() => {
      this.layerSets = this.layerSets.filter((s) => s.layerSetId !== id);
      return of(undefined);
    });
  }

  /* ===== Settings ===== */

  /** Saved settings ({} until saved: the Settings tab fills in its defaults). */
  getSettings(): Observable<SettingsDto> {
    return defer(() => of(clone(this.settings)));
  }

  saveSettings(settings: object): Observable<SettingsDto> {
    return defer(() => {
      this.settings = clone({ ...this.settings, ...settings }) as SettingsDto;
      return of(clone(this.settings));
    });
  }

  /* ===== Files ===== */

  /** Keeps the file in this browser session and returns an object URL for it. */
  uploadFile(file: File): Observable<string> {
    return defer(() => of(URL.createObjectURL(file)));
  }

  /* ===== Location tree sources ===== */

  /** Organization name + sites, buildings and floors. */
  locations(): Observable<LocationSources> {
    return defer(() => of(clone(SEED_LOCATIONS)));
  }

  /* ===== Plot candidates ===== */

  /** Registered assets that can be plotted. */
  assets(): Observable<PlotItem[]> {
    return defer(() => of(SEED_ASSETS.map(assetCandidate)));
  }

  /** IoT devices (Tracking) that can be plotted. */
  devices(): Observable<PlotItem[]> {
    return defer(() => of(SEED_DEVICES.filter((d) => !!d.deviceId).map(deviceCandidate)));
  }
}
