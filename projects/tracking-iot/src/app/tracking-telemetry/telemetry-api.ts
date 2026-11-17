import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from 'shared-ui';
import { apiError, getAllPages, tenantParams, trackingUrl } from '../shared/tracking-api';

// ===== Master Data (sites and buildings for the site / building pickers and the map) =====

interface MdmSiteDto {
  id: string; siteName: string | null; code: string | null; country: string | null; address?: { country?: string | null } | null;
  latitude: number | null; longitude: number | null; status?: string | null; isDeleted?: boolean;
}
interface MdmBuildingDto {
  id: string; name: string | null; code: string | null; site: { id: string | null; name: string | null } | null;
  latitude: number | null; longitude: number | null; status?: string | null; isDeleted?: boolean;
}

/** A Master Data site; lat / lng are null when the site has no coordinates. */
export interface MdmSite { id: string; name: string; lat: number | null; lng: number | null; /** '' when not set */ country?: string }
interface MdmFloorDto {
  id: string; name: string | null; code: string | null; site: { id: string | null; name: string | null } | null; buildingId: string | null; buildingName: string | null;
  area: number | null; imageUrl: string | null; images: string[] | null; latitude: number | null; longitude: number | null; status?: string | null; isDeleted?: boolean;
}

/** A Master Data floor with its uploaded floor plan image (null when none was uploaded). */
export interface MdmFloor {
  id: string; name: string; siteId: string; siteName: string; buildingId: string; buildingName: string;
  /** Floor area in m² (sizes the plan on the map), null when not entered. */
  area: number | null;
  image: string | null; lat: number | null; lng: number | null;
}

/** A Master Data building with the site it belongs to. */
export interface MdmBuilding { id: string; name: string; siteId: string; siteName: string; lat: number | null; lng: number | null }

// ===== DTOs (Tracking service responses; dates are ISO strings in UTC) =====

/** GET /api/iot-devices */
export interface IotDeviceDto {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  serialNumber: string | null;
  connectivity: string;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  gateway: string | null;
  powerSource: string;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  /** Good | Warning | Critical */
  health: string | null;
  firmwareVersion: string | null;
  createdAt: string | null;
}

/** GET /api/device-health */
export interface DeviceHealthDto {
  id: string;
  deviceId: string;
  deviceModel: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  gateway: string | null;
  /** Online | Offline | Warning */
  connectivity: string;
  signalStrengthDbm: number | null;
  snrDb: number | null;
  signalQuality: string | null;
  powerSource: string;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  /** Healthy | Attention | Critical | Maintenance */
  health: string | null;
}

/** GET /api/telemetry-readings (newest first) */
export interface TelemetryReadingDto {
  id: string;
  readingId: string;
  recordedAt: string;
  deviceId: string;
  sensorId: string | null;
  assetRegistrationId: string | null;
  parameter: string;
  value: number;
  unit: string | null;
  createdAt: string | null;
}

/** GET /api/location-events (newest first) */
export interface LocationEventDto {
  id: string;
  eventId: string;
  eventTime: string;
  assetId: string;
  assetName: string;
  /** Entered Zone | Departed Zone | Geofence Alert | Dwell Exceeded */
  eventType: string;
  zoneName: string;
  details: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** GET /api/iot-alerts (most recently raised first) */
export interface IotAlertDto {
  id: string;
  alertId: string;
  raisedAt: string;
  assetRegistrationId: string | null;
  assetName: string;
  deviceId: string | null;
  siteId: string | null;
  siteName: string | null;
  eventType: string;
  /** Critical | Warning | Info */
  severity: string;
  /** Open | Acknowledged | In Progress | Resolved */
  status: string | null;
  message: string | null;
  alertRuleId: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface IotEventsTimelinePointDto {
  /** yyyy-MM-dd (UTC day), or "total" */
  date: string;
  telemetryData: number;
  locationUpdates: number;
  geofenceEvents: number;
  alerts: number;
}

/** GET /api/iot-events/timeline */
export interface IotEventsTimelineDto {
  days: number;
  from: string;
  to: string;
  totals: IotEventsTimelinePointDto;
  points: IotEventsTimelinePointDto[];
}

export interface TelemetryQuery {
  /** Last N whole UTC days including today (1–365, default 7 on the server). */
  days?: number;
  deviceId?: string;
  sensorId?: string;
  /** 1–5000, default 500 on the server. */
  limit?: number;
}

export interface AlertQuery {
  /** Last N whole UTC days; all time when omitted. */
  days?: number;
  status?: string;
  severity?: string;
  siteName?: string;
  assetRegistrationId?: string;
  search?: string;
  limit?: number;
}

/** Highest `limit` the telemetry-readings endpoint accepts. */
export const MAX_READINGS = 5000;
/** Longest `days` window the dashboard endpoints accept. */
export const MAX_DAYS = 365;

/** Read-only access to the Tracking service resources shown on Tracking & Telemetry (and reused by Analytics & Insights). */
@Injectable({ providedIn: 'root' })
export class TelemetryReadApi {
  private readonly http = inject(HttpClient);

  devices(): Observable<IotDeviceDto[]> {
    return getAllPages<IotDeviceDto>(this.http, trackingUrl('iot-devices')).pipe(catchError((err) => apiError(err, 'Could not load IoT devices.')));
  }

  deviceHealth(): Observable<DeviceHealthDto[]> {
    return this.get<DeviceHealthDto[]>('device-health', {}, 'Could not load device health.');
  }

  readings(q: TelemetryQuery = {}): Observable<TelemetryReadingDto[]> {
    return this.get<TelemetryReadingDto[]>('telemetry-readings', { ...q }, 'Could not load telemetry readings.');
  }

  locationEvents(): Observable<LocationEventDto[]> {
    return this.get<LocationEventDto[]>('location-events', {}, 'Could not load location events.');
  }

  alerts(q: AlertQuery = {}): Observable<IotAlertDto[]> {
    return this.get<IotAlertDto[]>('iot-alerts', { ...q }, 'Could not load IoT alerts.');
  }

  timeline(days: number): Observable<IotEventsTimelineDto> {
    return this.get<IotEventsTimelineDto>('iot-events/timeline', { days }, 'Could not load the IoT events timeline.');
  }

  /** Sites from Master Data (GET /api/master-data/sites); an empty list when Master Data can't be reached. */
  sites(): Observable<MdmSite[]> {
    return this.masterData<MdmSiteDto>('sites').pipe(
      map((rows) =>
        rows.map((s) => ({
          id: s.id, name: s.siteName || s.code || s.id, lat: coord(s.latitude, 90), lng: coord(s.longitude, 180), country: (s.country || s.address?.country || '').trim(),
        })),
      ),
    );
  }

  /**
   * Countries in use by the Master Data sites (GET /api/master-data/sites/countries), sorted; each site takes its
   * country from the address entered in Organization › Site. Empty when Master Data can't be reached.
   */
  countries(): Observable<string[]> {
    return this.http
      .get<{ country: string; siteCount: number }[]>(`${environment.masterDataApiUrl}api/master-data/sites/countries`, { params: new HttpParams().set('clientId', environment.clientId) })
      .pipe(
        map((rows) => (Array.isArray(rows) ? rows : []).map((r) => (r.country ?? '').trim()).filter(Boolean)),
        catchError(() => of([] as string[])),
      );
  }

  /** Buildings from Master Data (GET /api/master-data/buildings), each with its site; empty when unavailable. */
  buildings(): Observable<MdmBuilding[]> {
    return this.masterData<MdmBuildingDto>('buildings').pipe(
      map((rows) =>
        rows.map((b) => ({ id: b.id, name: b.name || b.code || b.id, siteId: b.site?.id ?? '', siteName: b.site?.name ?? '', lat: coord(b.latitude, 90), lng: coord(b.longitude, 180) })),
      ),
    );
  }

  /** Floors from Master Data (GET /api/master-data/floors) with their floor plan image; empty when unavailable. */
  floors(): Observable<MdmFloor[]> {
    const abs = (u: string | null | undefined) => (!u ? null : /^(https?:|data:|blob:)/i.test(u) ? u : `${environment.mediaApiUrl}${u.replace(/^\/+/, '')}`);
    return this.masterData<MdmFloorDto>('floors').pipe(
      map((rows) =>
        rows.map((f) => ({
          id: f.id, name: f.name || f.code || f.id, siteId: f.site?.id ?? '', siteName: f.site?.name ?? '', buildingId: f.buildingId ?? '', buildingName: f.buildingName ?? '',
          area: typeof f.area === 'number' && f.area > 0 ? f.area : null,
          image: abs(f.imageUrl || f.images?.find((i) => !!i)), lat: coord(f.latitude, 90), lng: coord(f.longitude, 180),
        })),
      ),
    );
  }

  private masterData<T extends { status?: string | null; isDeleted?: boolean }>(resource: string): Observable<T[]> {
    return this.http
      .get<T[]>(`${environment.masterDataApiUrl}api/master-data/${resource}`, { params: new HttpParams().set('clientId', environment.clientId) })
      .pipe(
        map((rows) => (Array.isArray(rows) ? rows : []).filter((r) => !r.isDeleted && (r.status ?? 'Active').toLowerCase() !== 'inactive')),
        catchError(() => of([] as T[])),
      );
  }

  private get<T>(resource: string, query: Record<string, string | number | undefined>, fallback: string): Observable<T> {
    return this.http.get<T>(trackingUrl(resource), { params: tenantParams(query) }).pipe(catchError((err) => apiError(err, fallback)));
  }
}

/** Latitude / longitude when it is a real coordinate (0,0 and out-of-range values count as not set). */
function coord(v: number | null | undefined, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0 && Math.abs(v) <= max ? v : null;
}

// ===== shared mapping helpers =====

/** Sensor parameter family of a reading ("Temperature", "temp_c", "Vibration RMS", "Battery %", "RSSI" ...). */
export type ParamKind = 'temp' | 'vib' | 'battery' | 'rssi' | 'energy';

export function paramKind(parameter: string | null | undefined): ParamKind | null {
  const p = (parameter ?? '').toLowerCase();
  if (p.includes('temp')) return 'temp';
  if (p.includes('vib')) return 'vib';
  if (p.includes('batt')) return 'battery';
  if (p.includes('rssi') || p.includes('signal')) return 'rssi';
  if (p.includes('energy') || p.includes('kwh') || p.includes('power consumption')) return 'energy';
  return null;
}

/** Epoch ms of an API timestamp; NaN when missing. */
export function timeOf(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : NaN;
}
