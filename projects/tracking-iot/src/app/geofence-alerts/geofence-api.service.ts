import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_SITES } from '../shared/master-data.data';
import { DEMO_USER, demo, demoError } from '../shared/tracking-api';
import { ASSET_GROUPS, SCHEDULES, ZONE_COLORS, ZONE_SHAPES, ZONE_TYPES, Zone, ZoneShape, ZoneStatus, ZoneType } from './geofence-data';
import { ALERT_RULES, GEOFENCES, syncRuleCounts } from './geofences.data';

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
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
}

/** Geofence List (static demo): the in-memory geofences of geofences.data.ts and their option lists. */
@Injectable({ providedIn: 'root' })
export class GeofenceApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<Zone[]> {
    syncRuleCounts();
    return demo(GEOFENCES.map(toZone));
  }

  get(id: string): Observable<Zone> {
    const g = GEOFENCES.find((x) => x.id === id);
    return g ? demo(toZone(g)) : demoError('The geofence was not found.');
  }

  create(z: Zone): Observable<Zone> {
    const n = GEOFENCES.reduce((m, g) => Math.max(m, Number(g.id.slice(3)) || 0), 0) + 1;
    const dto = this.toDto(`GF-${String(n).padStart(4, '0')}`, z, null);
    GEOFENCES.push(dto);
    return demo(toZone(dto));
  }

  update(z: Zone): Observable<Zone> {
    const i = GEOFENCES.findIndex((g) => g.id === z.id);
    if (i < 0) return demoError('Could not update the geofence: it no longer exists.');
    GEOFENCES[i] = this.toDto(z.id, z, GEOFENCES[i]);
    return demo(toZone(GEOFENCES[i]));
  }

  delete(id: string): Observable<void> {
    const i = GEOFENCES.findIndex((g) => g.id === id);
    if (i < 0) return demoError('Could not delete the geofence.');
    GEOFENCES.splice(i, 1);
    for (let r = ALERT_RULES.length - 1; r >= 0; r--) if (ALERT_RULES[r].geofenceId === id) ALERT_RULES.splice(r, 1);
    return demo(undefined as void);
  }

  /** Every Create Geofence dropdown in one call. */
  options(): Observable<GeofenceOptionsDto> {
    return demo(DEFAULT_GEOFENCE_OPTIONS);
  }

  zoneTypes(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.zoneTypes);
  }

  mapColours(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.mapColours);
  }

  assetGroups(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.assetGroups);
  }

  schedules(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.schedules);
  }

  shapes(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.shapes);
  }

  statuses(): Observable<string[]> {
    return demo(DEFAULT_GEOFENCE_OPTIONS.statuses);
  }

  /** Site dropdown (demo master-data sites). */
  sites(): Observable<SiteOption[]> {
    return demo(DEMO_SITES.map((s) => ({ id: s.id, name: s.name })));
  }

  private toDto(id: string, z: Zone, old: GeofenceDto | null): GeofenceDto {
    const req = toGeofenceRequest(z, old?.createdBy ?? (actorName(this.auth) || DEMO_USER));
    return {
      ...req,
      id,
      siteId: req.siteId ?? DEMO_SITES.find((s) => s.name === req.siteName)?.id ?? null,
      monitoredAssetCount: req.monitoredAssetCount ?? 0,
      ruleCount: ALERT_RULES.filter((r) => r.geofenceId === id).length,
      createdAt: old?.createdAt ?? new Date().toISOString(),
    };
  }
}
