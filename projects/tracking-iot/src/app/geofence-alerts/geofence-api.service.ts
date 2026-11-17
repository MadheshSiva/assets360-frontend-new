import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { ASSET_GROUPS, SCHEDULES, ZONE_COLORS, ZONE_SHAPES, ZONE_TYPES, Zone, ZoneShape, ZoneStatus, ZoneType } from './geofence-data';

/** Name recorded as createdBy: the signed-in user, else the stored login email. */
export function actorName(auth: AuthService): string {
  return auth.getUser()?.userName || auth.getUser()?.email || auth.getUserEmail() || '';
}

export interface GeofencePointDto {
  latitude: number;
  longitude: number;
}

/** GET /api/geofences row. */
export interface GeofenceDto {
  id: string;
  name: string;
  geofenceType: string;
  siteId: string | null;
  siteName: string;
  monitoredAssetCount: number;
  ruleCount: number;
  status: string | null;
  lastEventAt: string | null;
  mapColour: string;
  assetGroups: string[];
  schedule: string;
  dwellAlertMinutes: number | null;
  monitorEntry: boolean;
  monitorExit: boolean;
  shape: string;
  polygonPoints: number | null;
  coordinates: GeofencePointDto[];
  radiusMeters: number | null;
  createdBy: string | null;
  createdAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** POST / PUT /api/geofences body (same shape for both). */
export interface GeofenceRequest {
  name: string;
  geofenceType: string;
  siteId: string | null;
  siteName: string;
  monitoredAssetCount: number | null;
  ruleCount: number | null;
  status: string;
  lastEventAt: string | null;
  mapColour: string;
  assetGroups: string[];
  schedule: string;
  dwellAlertMinutes: number | null;
  monitorEntry: boolean;
  monitorExit: boolean;
  shape: string;
  polygonPoints: number | null;
  coordinates: GeofencePointDto[];
  radiusMeters: number | null;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** GET /api/geofences/options */
export interface GeofenceOptionsDto {
  zoneTypes: string[];
  mapColours: string[];
  assetGroups: string[];
  schedules: string[];
  shapes: string[];
  statuses: string[];
  defaultPolygonPoints: number;
  minPolygonPoints: number;
  maxPolygonPoints: number;
}

export const DEFAULT_GEOFENCE_OPTIONS: GeofenceOptionsDto = {
  zoneTypes: ZONE_TYPES,
  mapColours: ZONE_COLORS,
  assetGroups: ASSET_GROUPS,
  schedules: SCHEDULES,
  shapes: ZONE_SHAPES,
  statuses: ['Active', 'Disabled'],
  defaultPolygonPoints: 4,
  minPolygonPoints: 3,
  maxPolygonPoints: 50,
};

/** A site from master data (GET /api/master-data/sites). */
export interface SiteOption {
  id: string;
  name: string;
}

const DAY_MS = 86_400_000;

export function toZone(d: GeofenceDto): Zone {
  const shape = (ZONE_SHAPES as string[]).includes(d.shape) ? (d.shape as ZoneShape) : 'Polygon';
  const pts = (d.coordinates ?? []).map((p) => ({ lat: p.latitude, lng: p.longitude }));
  const created = d.createdAt ? new Date(d.createdAt) : null;
  const zone: Zone = {
    id: d.id,
    name: d.name,
    type: ((ZONE_TYPES as string[]).includes(d.geofenceType) ? d.geofenceType : 'Allowed') as ZoneType,
    site: d.siteName,
    siteId: d.siteId,
    status: (d.status === 'Disabled' ? 'Disabled' : 'Active') as ZoneStatus,
    shape,
    points: shape === 'Circle' ? 0 : pts.length || d.polygonPoints || 0,
    color: d.mapColour || ZONE_COLORS[0],
    groups: d.assetGroups ?? [],
    schedule: d.schedule,
    monitorEntry: d.monitorEntry,
    monitorExit: d.monitorExit,
    dwellMin: d.dwellAlertMinutes,
    monitoredCount: d.monitoredAssetCount ?? 0,
    lastEventAt: d.lastEventAt ? new Date(d.lastEventAt) : null,
    createdDaysAgo: created ? Math.floor((Date.now() - created.getTime()) / DAY_MS) : null,
    geoRev: 0,
  };
  if (shape === 'Circle') {
    if (pts[0] && d.radiusMeters) {
      zone.center = pts[0];
      zone.radiusM = d.radiusMeters;
    }
  } else if (pts.length >= 3) {
    zone.latlngs = pts;
  }
  return zone;
}

/** Request body for a zone (create when it has no id, else a full replacement on update). */
export function toGeofenceRequest(z: Zone, createdBy: string): GeofenceRequest {
  const circle = z.shape === 'Circle';
  const coordinates = circle
    ? z.center ? [{ latitude: z.center.lat, longitude: z.center.lng }] : []
    : (z.latlngs ?? []).map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return {
    name: z.name,
    geofenceType: z.type,
    siteId: z.siteId,
    siteName: z.site,
    monitoredAssetCount: z.monitoredCount,
    ruleCount: null,
    status: z.status,
    lastEventAt: z.lastEventAt ? z.lastEventAt.toISOString() : null,
    mapColour: z.color,
    assetGroups: z.groups,
    schedule: z.schedule,
    dwellAlertMinutes: z.dwellMin,
    monitorEntry: z.monitorEntry,
    monitorExit: z.monitorExit,
    shape: z.shape,
    polygonPoints: circle ? null : coordinates.length || z.points || null,
    coordinates,
    radiusMeters: circle && z.center ? z.radiusM ?? null : null,
    createdBy,
    ...tenantBody(),
  };
}

/** Geofence List: /api/geofences and its option lists. */
@Injectable({ providedIn: 'root' })
export class GeofenceApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('geofences');

  list(): Observable<Zone[]> {
    return this.http.get<GeofenceDto[]>(this.url, { params: tenantParams() }).pipe(
      map((rows) => rows.map(toZone)),
      catchError((err) => apiError(err, 'Could not load geofences.')),
    );
  }

  get(id: string): Observable<Zone> {
    return this.http.get<GeofenceDto>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(
      map(toZone),
      catchError((err) => apiError(err, 'Could not load the geofence.')),
    );
  }

  create(z: Zone): Observable<Zone> {
    return this.http.post<GeofenceDto>(this.url, toGeofenceRequest(z, actorName(this.auth)), { params: tenantParams() }).pipe(
      map(toZone),
      catchError((err) => apiError(err, 'Could not create the geofence.')),
    );
  }

  update(z: Zone): Observable<Zone> {
    return this.http.put<GeofenceDto>(`${this.url}/${encodeURIComponent(z.id)}`, toGeofenceRequest(z, actorName(this.auth)), { params: tenantParams() }).pipe(
      map(toZone),
      catchError((err) => apiError(err, 'Could not update the geofence.')),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not delete the geofence.')),
    );
  }

  /** Every Create Geofence dropdown in one call (zone types, colours, asset groups, schedules, shapes, statuses). */
  options(): Observable<GeofenceOptionsDto> {
    return this.http.get<GeofenceOptionsDto>(`${this.url}/options`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not load geofence options.')),
    );
  }

  zoneTypes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/zone-types`, { params: tenantParams() });
  }

  mapColours(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/map-colours`, { params: tenantParams() });
  }

  assetGroups(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/asset-groups`, { params: tenantParams() });
  }

  schedules(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/schedules`, { params: tenantParams() });
  }

  shapes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/shapes`, { params: tenantParams() });
  }

  statuses(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/statuses`, { params: tenantParams() });
  }

  /** Site dropdown (the API docs point to master-data sites). Falls back to an empty list when unavailable. */
  sites(): Observable<SiteOption[]> {
    type SiteRow = { id?: string; siteName?: string; name?: string; status?: string; isDeleted?: boolean };
    return this.http.get<SiteRow[] | { items?: SiteRow[] }>(`${environment.masterDataApiUrl}api/master-data/sites`, { params: tenantParams() }).pipe(
      map((res) => (Array.isArray(res) ? res : res?.items ?? [])),
      map((rows) =>
        rows
          .filter((r) => r.id && r.isDeleted !== true && !/^(inactive|disabled|deleted)$/i.test(r.status ?? ''))
          .map((r) => ({ id: String(r.id), name: String(r.siteName ?? r.name ?? r.id) })),
      ),
      catchError(() => of([])),
    );
  }
}
