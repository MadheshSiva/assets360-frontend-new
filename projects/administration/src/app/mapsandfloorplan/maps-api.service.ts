import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
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
  plotKey,
  plotLook,
  zoneTone
} from './maps.data';

/*
 * Maps & Floor Plans API (Administration service, base api/administration/maps) plus the read-only sources the
 * page needs: Master Data Management (location tree), Asset registrations and IoT devices (plot candidates),
 * and the Media service (file upload). DTOs follow the maps API contract (camelCase JSON).
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

interface MediaUploadDto {
  url: string;
}

/** GET api/master-data/organizations (only the name is used). */
interface MdmOrganizationDto {
  id: string;
  organizationName?: string | null;
  name?: string | null;
}

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
interface AssetListItemDto {
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
interface IoTDeviceDto {
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

/** Rows of a list response that is either a plain array or `{ items }`. */
function rows<T>(res: T[] | { items?: T[] | null } | null | undefined): T[] {
  return Array.isArray(res) ? res : (res?.items ?? []);
}

function live<T extends { isDeleted?: boolean; status?: string | null }>(list: T[]): T[] {
  return list.filter((r) => r.isDeleted !== true && !/^(deleted)$/i.test(r.status ?? ''));
}

@Injectable({ providedIn: 'root' })
export class MapsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.administrationApiUrl}api/administration/maps`;
  private readonly mdm = `${environment.masterDataApiUrl}api/master-data`;

  /** Signed-in user for createdBy / updatedBy. */
  get user(): string {
    return this.auth.getUserEmail() ?? '';
  }

  private tenant(extra: Record<string, string | null | undefined> = {}): HttpParams {
    let params = new HttpParams().set('clientId', environment.clientId).set('tenantId', environment.tenantId);
    for (const [k, v] of Object.entries(extra)) if (v) params = params.set(k, v);
    return params;
  }

  private planUrl(floorPlanId: string): string {
    return `${this.base}/floor-plans/${encodeURIComponent(floorPlanId)}`;
  }

  /* ===== Summary ===== */

  summary(locationId: string): Observable<MapsSummary> {
    return this.http.get<MapsSummaryDto>(`${this.base}/summary`, { params: this.tenant({ locationId }) }).pipe(
      map((d) => ({ floorPlans: d?.floorPlans ?? 0, zones: d?.zones ?? 0, devicesPlotted: d?.devicesPlotted ?? 0, assetsPlotted: d?.assetsPlotted ?? 0 }))
    );
  }

  /* ===== Floor plans ===== */

  listFloorPlans(filters: { locationId?: string; status?: string; type?: string; search?: string } = {}): Observable<FloorPlan[]> {
    return this.http.get<FloorPlanDto[]>(`${this.base}/floor-plans`, { params: this.tenant(filters) }).pipe(map((list) => rows(list).map(toFloorPlan)));
  }

  getFloorPlan(id: string): Observable<FloorPlan> {
    return this.http.get<FloorPlanDto>(this.planUrl(id)).pipe(map(toFloorPlan));
  }

  createFloorPlan(body: Omit<CreateFloorPlanRequest, 'createdBy' | 'clientId' | 'tenantId'>): Observable<FloorPlan> {
    const req: CreateFloorPlanRequest = { ...body, createdBy: this.user, clientId: environment.clientId, tenantId: environment.tenantId };
    return this.http.post<FloorPlanDto>(`${this.base}/floor-plans`, req).pipe(map(toFloorPlan));
  }

  updateFloorPlan(id: string, body: Omit<UpdateFloorPlanRequest, 'updatedBy'>): Observable<FloorPlan> {
    return this.http.put<FloorPlanDto>(this.planUrl(id), { ...body, updatedBy: this.user }).pipe(map(toFloorPlan));
  }

  deleteFloorPlan(id: string): Observable<void> {
    return this.http.delete<void>(this.planUrl(id));
  }

  publishFloorPlan(id: string): Observable<FloorPlan> {
    return this.http.post<FloorPlanDto>(`${this.planUrl(id)}/publish`, { updatedBy: this.user }).pipe(map(toFloorPlan));
  }

  archiveFloorPlan(id: string): Observable<FloorPlan> {
    return this.http.post<FloorPlanDto>(`${this.planUrl(id)}/archive`, { updatedBy: this.user }).pipe(map(toFloorPlan));
  }

  /* ===== Versions ===== */

  listVersions(floorPlanId: string): Observable<MapVersion[]> {
    return this.http.get<VersionDto[]>(`${this.planUrl(floorPlanId)}/versions`).pipe(map((list) => rows(list).map(toVersion)));
  }

  createVersion(floorPlanId: string, body: Omit<CreateVersionRequest, 'createdBy'>): Observable<MapVersion> {
    return this.http.post<VersionDto>(`${this.planUrl(floorPlanId)}/versions`, { ...body, createdBy: this.user }).pipe(map(toVersion));
  }

  publishVersion(floorPlanId: string, version: string): Observable<FloorPlan> {
    return this.http
      .post<FloorPlanDto>(`${this.planUrl(floorPlanId)}/versions/${encodeURIComponent(version)}/publish`, { updatedBy: this.user })
      .pipe(map(toFloorPlan));
  }

  restoreVersion(floorPlanId: string, version: string): Observable<MapVersion> {
    return this.http
      .post<VersionDto>(`${this.planUrl(floorPlanId)}/versions/${encodeURIComponent(version)}/restore`, { updatedBy: this.user })
      .pipe(map(toVersion));
  }

  /* ===== Zones ===== */

  zoneOptions(): Observable<ZoneOptions> {
    return this.http.get<ZoneOptionsDto>(`${this.base}/zones/options`).pipe(
      map((d) => ({ zoneTypes: d?.zoneTypes ?? [], shapes: d?.shapes ?? [], accessRules: d?.accessRules ?? [], colors: d?.colors ?? [] }))
    );
  }

  listZones(floorPlanId: string): Observable<MapZone[]> {
    return this.http.get<ZoneDto[]>(`${this.planUrl(floorPlanId)}/zones`, { params: this.tenant() }).pipe(map((list) => rows(list).map(toZone)));
  }

  private zoneBody(z: MapZone): SaveZoneRequest {
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
          ? z.points
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
      dwellMinutes: z.dwellMinutes,
      clientId: environment.clientId,
      tenantId: environment.tenantId
    };
  }

  createZone(floorPlanId: string, z: MapZone): Observable<MapZone> {
    return this.http.post<ZoneDto>(`${this.planUrl(floorPlanId)}/zones`, { ...this.zoneBody(z), createdBy: this.user }).pipe(map(toZone));
  }

  updateZone(z: MapZone): Observable<MapZone> {
    return this.http
      .put<ZoneDto>(`${this.base}/zones/${encodeURIComponent(z.id)}`, { ...this.zoneBody(z), updatedBy: this.user })
      .pipe(map(toZone));
  }

  deleteZone(zoneId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/zones/${encodeURIComponent(zoneId)}`);
  }

  /* ===== Plots ===== */

  listPlots(floorPlanId: string, kind?: PlotKind): Observable<PlotDto[]> {
    return this.http.get<PlotDto[]>(`${this.planUrl(floorPlanId)}/plots`, { params: this.tenant({ kind }) }).pipe(map((list) => rows(list)));
  }

  /** Place or move an item (upsert); sends a snapshot of the asset / device with the position. */
  savePlot(floorPlanId: string, item: PlotItem): Observable<PlotDto> {
    const body: SavePlotRequest = {
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
      updatedBy: this.user,
      clientId: environment.clientId,
      tenantId: environment.tenantId
    };
    return this.http.put<PlotDto>(`${this.planUrl(floorPlanId)}/plots/${item.kind}/${encodeURIComponent(item.itemId)}`, body);
  }

  deletePlot(floorPlanId: string, kind: PlotKind, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.planUrl(floorPlanId)}/plots/${kind}/${encodeURIComponent(itemId)}`);
  }

  /* ===== Layers ===== */

  listLayers(floorPlanId: string): Observable<MapLayer[]> {
    return this.http.get<LayerDto[]>(`${this.planUrl(floorPlanId)}/layers`).pipe(map((list) => rows(list).map(toLayer)));
  }

  saveLayer(floorPlanId: string, l: MapLayer): Observable<MapLayer> {
    const body: SaveLayerRequest = {
      enabled: l.enabled,
      visible: l.visible,
      locked: l.locked,
      showLabel: l.showLabel,
      showId: l.showId,
      showStatusIcon: l.showStatusIcon,
      useCategoryColor: l.useCategoryColor,
      labelPosition: l.labelPosition,
      categories: l.categories,
      statusFilter: l.statusFilter,
      opacity: l.opacity,
      color: l.color,
      updatedBy: this.user
    };
    return this.http.put<LayerDto>(`${this.planUrl(floorPlanId)}/layers/${encodeURIComponent(l.id)}`, body).pipe(map(toLayer));
  }

  listLayerSets(): Observable<LayerSet[]> {
    return this.http.get<LayerSetDto[]>(`${this.base}/layer-sets`, { params: this.tenant() }).pipe(map((list) => rows(list).map(toLayerSet)));
  }

  createLayerSet(name: string, layers: Record<string, boolean>): Observable<LayerSet> {
    const body = { name, layers, createdBy: this.user, clientId: environment.clientId, tenantId: environment.tenantId };
    return this.http.post<LayerSetDto>(`${this.base}/layer-sets`, body).pipe(map(toLayerSet));
  }

  deleteLayerSet(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/layer-sets/${encodeURIComponent(id)}`);
  }

  /* ===== Settings ===== */

  getSettings(): Observable<SettingsDto> {
    return this.http.get<SettingsDto>(`${this.base}/settings`, { params: this.tenant() });
  }

  saveSettings(settings: object): Observable<SettingsDto> {
    const body = { ...settings, updatedBy: this.user, clientId: environment.clientId, tenantId: environment.tenantId };
    return this.http.put<SettingsDto>(`${this.base}/settings`, body);
  }

  /* ===== Files (Media service) ===== */

  /** POST api/media/upload (multipart: `file` + `category`, both required) → the stored file's URL. */
  uploadFile(file: File): Observable<string> {
    const form = new FormData();
    form.append('file', file, file.name);
    // Media stores files under uploads/<category>/
    form.append('category', 'floor-plans');
    return this.http.post<MediaUploadDto>(`${environment.mediaApiUrl}api/media/upload`, form).pipe(map((r) => r?.url ?? ''));
  }

  /* ===== Location tree sources (Master Data Management) ===== */

  /** Organization name + sites, buildings and floors. Sites / buildings / floors errors propagate; the name falls back. */
  locations(): Observable<LocationSources> {
    const orgs = this.http.get<MdmOrganizationDto[] | { items?: MdmOrganizationDto[] }>(`${this.mdm}/organizations`).pipe(
      map((res) => rows(res)[0]),
      map((o) => o?.organizationName || o?.name || 'Organization'),
      catchError(() => of('Organization'))
    );
    const sites = this.http.get<MdmSiteDto[] | { items?: MdmSiteDto[] }>(`${this.mdm}/sites`).pipe(map((r) => live(rows(r))));
    const buildings = this.http.get<MdmBuildingDto[] | { items?: MdmBuildingDto[] }>(`${this.mdm}/buildings`).pipe(map((r) => live(rows(r))));
    const floors = this.http.get<MdmFloorDto[] | { items?: MdmFloorDto[] }>(`${this.mdm}/floors`).pipe(map((r) => live(rows(r))));
    return forkJoin({ organizationName: orgs, sites, buildings, floors });
  }

  /* ===== Plot candidates ===== */

  /** GET api/asset-registrations (first 200). */
  assets(): Observable<PlotItem[]> {
    const params = this.tenant().set('page', 1).set('pageSize', 200);
    return this.http
      .get<{ items?: AssetListItemDto[] } | AssetListItemDto[]>(`${environment.assetApiUrl}api/asset-registrations`, { params })
      .pipe(map((res) => rows(res).map(assetCandidate)));
  }

  /** GET api/iot-devices (Tracking). */
  devices(): Observable<PlotItem[]> {
    return this.http
      .get<IoTDeviceDto[] | { items?: IoTDeviceDto[] }>(`${environment.trackingApiUrl}api/iot-devices`, { params: this.tenant() })
      .pipe(map((res) => rows(res).filter((d) => !!d.deviceId).map(deviceCandidate)));
  }
}
