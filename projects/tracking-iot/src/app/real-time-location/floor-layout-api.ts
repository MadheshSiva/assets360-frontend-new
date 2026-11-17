import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from 'shared-ui';

/**
 * Read-only access to what was drawn in Administration › Maps & Floor Plans for a floor: its floor plan, the zones
 * drawn on it and the assets / devices plotted on it. Positions are stored as % of the plan (0–100, from the top-left
 * corner), so they line up with the plan image wherever the image is placed.
 */

interface FloorPlanDto {
  floorPlanId: string;
  locationId: string;
  name: string;
  format: string | null;
  fileUrl: string | null;
  widthMeters: number | null;
  heightMeters: number | null;
  status: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

interface ZoneDto {
  zoneId: string;
  code: string | null;
  name: string | null;
  type: string | null;
  color: string | null;
  shape: string | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  points: { x: number; y: number }[] | null;
  radius: number | null;
  accessRule: string | null;
  active: boolean | null;
}

interface PlotDto {
  kind: string;
  itemId: string;
  code: string | null;
  name: string | null;
  type: string | null;
  assetType: string | null;
  status: string | null;
  x: number | null;
  y: number | null;
}

export interface LayoutZone {
  id: string;
  code: string;
  name: string;
  type: string;
  color: string;
  shape: 'Rectangle' | 'Circle' | 'Polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  points: { x: number; y: number }[];
  /** % of the plan width (circles). */
  radius: number | null;
  restricted: boolean;
  rule: string;
}

export interface LayoutPlot {
  id: string;
  kind: 'asset' | 'device';
  code: string;
  name: string;
  type: string;
  status: string;
  x: number;
  y: number;
}

/** A floor's plan from Maps & Floor Plans with its zones and plots. */
export interface FloorLayout {
  planName: string;
  /** Image of the plan when it was uploaded as a picture (PDF / DWG plans have none). */
  imageUrl: string | null;
  widthM: number | null;
  heightM: number | null;
  zones: LayoutZone[];
  plots: LayoutPlot[];
}

/** One row of GET api/asset-registrations (the Asset list). */
interface AssetListItemDto {
  id: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  assetTag: string | null;
  category: string | null;
  assetType: string | null;
  siteName: string | null;
  buildingName: string | null;
  floorName: string | null;
  zoneName: string | null;
  locationPath: string | null;
  status: string | null;
}

/** A registered asset for the Locate Asset search. */
export interface RegisteredAsset {
  /** Mongo id and registration id (plots use the registration id, else the Mongo id). */
  id: string;
  regId: string;
  name: string;
  tag: string;
  category: string;
  type: string;
  status: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  /** "Site › Building › Floor › Zone" (or what was entered). */
  location: string;
}

/** Registered assets fetched for the search (the Asset list's first page size). */
const REGISTERED_PAGE_SIZE = 500;

const IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const ZONE_FALLBACK_COLOR = '#7c3aed';

function isImage(format: string | null, url: string | null): boolean {
  const f = (format ?? '').toLowerCase();
  if (IMAGE_FORMATS.includes(f)) return true;
  return !!url && /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(url);
}

function rows<T>(r: T[] | { items?: T[] } | null | undefined): T[] {
  return Array.isArray(r) ? r : (r?.items ?? []);
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

@Injectable({ providedIn: 'root' })
export class FloorLayoutApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.administrationApiUrl}api/administration/maps`;

  private params(extra: Record<string, string> = {}): HttpParams {
    let p = new HttpParams().set('clientId', environment.clientId).set('tenantId', environment.tenantId);
    for (const [k, v] of Object.entries(extra)) p = p.set(k, v);
    return p;
  }

  /** Registered assets (GET api/asset-registrations), as listed on the Asset list. */
  registeredAssets(): Observable<RegisteredAsset[]> {
    const params = this.params({ page: '1', pageSize: String(REGISTERED_PAGE_SIZE) });
    return this.http.get<AssetListItemDto[] | { items?: AssetListItemDto[] }>(`${environment.assetApiUrl}api/asset-registrations`, { params }).pipe(
      map((r) =>
        rows(r).map((d) => {
          const site = d.siteName ?? '';
          const building = d.buildingName ?? '';
          const floor = d.floorName ?? '';
          const zone = d.zoneName ?? '';
          return {
            id: d.id,
            regId: d.assetRegistrationId ?? '',
            name: d.assetName || d.assetTag || d.assetRegistrationId || d.id,
            tag: d.assetTag ?? '',
            category: d.category ?? '',
            type: d.assetType ?? '',
            status: d.status ?? '',
            site,
            building,
            floor,
            zone,
            location: d.locationPath || [site, building, floor, zone].filter(Boolean).join(' › '),
          };
        }),
      ),
    );
  }

  /**
   * The floor's plan (the published one, else the most recently changed) with its zones and plots; null when the
   * floor has no plan in Maps & Floor Plans or the Administration service can't be reached.
   */
  layout(floorId: string): Observable<FloorLayout | null> {
    return this.http.get<FloorPlanDto[] | { items?: FloorPlanDto[] }>(`${this.base}/floor-plans`, { params: this.params({ locationId: floorId }) }).pipe(
      map((r) => rows(r).filter((p) => p.locationId === floorId && (p.status ?? '').toLowerCase() !== 'archived')),
      map((plans) => {
        const time = (p: FloorPlanDto) => Date.parse(p.updatedAt ?? p.createdAt ?? '') || 0;
        const published = plans.filter((p) => (p.status ?? '').toLowerCase() === 'published');
        return (published.length ? published : plans).sort((a, b) => time(b) - time(a))[0] ?? null;
      }),
      switchMap((plan) => {
        if (!plan) return of(null);
        const url = `${this.base}/floor-plans/${encodeURIComponent(plan.floorPlanId)}`;
        const plots = (kind: 'asset' | 'device') =>
          this.http.get<PlotDto[] | { items?: PlotDto[] }>(`${url}/plots`, { params: this.params({ kind }) }).pipe(map(rows), catchError(() => of([] as PlotDto[])));
        return forkJoin({
          zones: this.http.get<ZoneDto[] | { items?: ZoneDto[] }>(`${url}/zones`, { params: this.params() }).pipe(map(rows), catchError(() => of([] as ZoneDto[]))),
          assets: plots('asset'),
          devices: plots('device'),
        }).pipe(
          map(({ zones, assets, devices }) => ({
            planName: plan.name,
            imageUrl: isImage(plan.format, plan.fileUrl) ? plan.fileUrl : null,
            widthM: plan.widthMeters && plan.widthMeters > 0 ? plan.widthMeters : null,
            heightM: plan.heightMeters && plan.heightMeters > 0 ? plan.heightMeters : null,
            zones: zones.filter((z) => z.active !== false).map(toZone),
            plots: [...assets, ...devices]
              .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
              .map((p) => ({
                id: p.itemId,
                kind: (p.kind === 'device' ? 'device' : 'asset') as LayoutPlot['kind'],
                code: p.code || p.itemId,
                name: p.name || p.code || p.itemId,
                type: p.assetType || p.type || '',
                status: p.status || '',
                x: num(p.x),
                y: num(p.y),
              })),
          })),
        );
      }),
      catchError(() => of(null)),
    );
  }
}

function toZone(z: ZoneDto): LayoutZone {
  const shape = z.shape === 'Circle' ? 'Circle' : (z.shape === 'Polygon' || z.shape === 'Custom') && (z.points?.length ?? 0) >= 3 ? 'Polygon' : 'Rectangle';
  const type = z.type ?? '';
  const rule = z.accessRule ?? '';
  return {
    id: z.zoneId,
    code: z.code ?? '',
    name: z.name || z.code || 'Zone',
    type,
    color: z.color || ZONE_FALLBACK_COLOR,
    shape,
    x: num(z.x),
    y: num(z.y),
    w: num(z.w),
    h: num(z.h),
    points: z.points ?? [],
    radius: z.radius ?? null,
    restricted: /restrict/i.test(type) || /restrict|no entry|deny/i.test(rule),
    rule,
  };
}
