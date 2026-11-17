import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { apiError, getAllPages, savedRecord, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { Conn, DevEvent, Device, Health, LinkedAsset, Power } from './device-data';

/** One row of GET {assetApiUrl}api/asset-registrations (Asset service): what the asset picker needs. */
interface AssetListItemDto {
  id: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  assetTag: string | null;
}

/** A device as GET/POST/PUT /api/iot-devices returns it (addressed by deviceId). */
export interface IoTDeviceDto {
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
  health: string | null;
  firmwareVersion: string | null;
  pendingFirmwareVersion: string | null;
  firmwareUpdateScheduledAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
  /** List rows only (GET /api/iot-devices): connection state, battery % and signal as the API reports them. */
  status?: string | null;
  batteryPercent?: number | null;
  lowBattery?: boolean | null;
  signalDbm?: number | null;
  modelDisplayName?: string | null;
}

/** Body of POST /api/iot-devices and PUT /api/iot-devices/{deviceId}. */
export interface IoTDeviceRequest {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  serialNumber: string;
  connectivity: string;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  gateway: string | null;
  /** Left out (null) on create: the API takes it from the model. */
  powerSource: string | null;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  health: string | null;
  firmwareVersion: string | null;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** GET /api/iot-devices/models */
export interface DeviceModelOption {
  modelNumber: string;
  manufacturer: string;
  displayName: string;
  deviceType: string;
  connectivity: string;
  protocol: string | null;
  defaultConnectivity: string;
  powerSource: string;
}

/** GET /api/iot-devices/gateways */
export interface GatewayOption {
  deviceId: string;
  deviceName: string;
  siteId: string | null;
  siteName: string | null;
}

export interface SiteOption {
  id: string;
  name: string;
}

/** Minutes without a message after which a device counts as Offline (the page's default "mark offline after"). */
export const DEFAULT_OFFLINE_MIN = 30;

function epoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function powerOf(source: string | null | undefined): Power {
  const s = (source ?? '').toLowerCase();
  return s.startsWith('battery') ? 'Battery' : s === 'poe' ? 'PoE' : 'External';
}

/** Online / Offline from the last message; Pending until the first one arrives (the API has no connection state). */
export function connOf(lastSeenSec: number | null, offlineAfterMin = DEFAULT_OFFLINE_MIN): Conn {
  if (lastSeenSec === null) return 'Pending';
  return lastSeenSec <= offlineAfterMin * 60 ? 'Online' : 'Offline';
}

/**
 * A page device for an API device. The API has no IMEI, signal strength, telemetry or event history:
 * those stay empty (shown as "—"); the events list what the record itself says (registered, updated, last message).
 */
export function deviceFromDto(dto: IoTDeviceDto): Device {
  const created = epoch(dto.createdAt);
  const updated = epoch(dto.updatedAt);
  const seen = epoch(dto.lastSeenAt);
  const lastSeenSec = seen === null ? null : Math.max(0, Math.round((Date.now() - seen) / 1000));
  const health = (['Good', 'Warning', 'Critical'] as Health[]).find((h) => h === dto.health) ?? 'Good';
  const log: DevEvent[] = [];
  if (seen !== null) log.push({ at: seen, title: 'Last message received', detail: dto.gateway ? `via ${dto.gateway}` : '', level: 'green' });
  if (updated !== null) log.push({ at: updated, title: 'Device updated', detail: dto.updatedBy ? `by ${dto.updatedBy}` : '', level: 'purple' });
  if (created !== null) log.push({ at: created, title: 'Device registered', detail: [dto.model, dto.serialNumber, dto.createdBy ? `by ${dto.createdBy}` : ''].filter(Boolean).join(' · '), level: 'grey' });
  log.sort((a, b) => b.at - a.at);
  const code = dto.assetCode || dto.assetRegistrationId;
  const status = (['Online', 'Offline', 'Pending'] as Conn[]).find((c) => c.toLowerCase() === (dto.status ?? '').toLowerCase());
  return {
    id: dto.deviceId,
    name: dto.deviceName,
    type: dto.deviceType,
    model: dto.model,
    serial: dto.serialNumber ?? '',
    imei: '',
    protocol: dto.connectivity,
    conn: status ?? connOf(lastSeenSec),
    health,
    asset: code ? { name: dto.assetName || code, code } : null,
    site: dto.siteName ?? '',
    gateway: dto.gateway ?? '',
    power: powerOf(dto.powerSource),
    battery: dto.batteryPercent ?? dto.batteryLevel ?? null,
    rssi: dto.signalDbm ?? null,
    lastSeenSec,
    firmware: dto.firmwareVersion ?? '',
    installedDaysAgo: created === null ? 0 : Math.max(0, Math.floor((Date.now() - created) / 86_400_000)),
    settings: { intervalMin: 10, lowBattery: 20, offlineAfterMin: DEFAULT_OFFLINE_MIN, alerts: true },
    log,
    api: dto,
  };
}

/** Fields of a list row the full record should keep (drops undefined so they do not overwrite it). */
function stripUndefined(o: IoTDeviceDto | undefined): Partial<IoTDeviceDto> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<IoTDeviceDto>;
}

/** IoT Device Management → /api/iot-devices (Tracking service). */
@Injectable({ providedIn: 'root' })
export class IoTDeviceApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('iot-devices');

  currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || 'Unknown user';
  }

  /** GET /api/iot-devices: every page (a plain array is still accepted). */
  getAll(): Observable<Device[]> {
    return getAllPages<IoTDeviceDto>(this.http, this.url).pipe(
      map((rows) => rows.map(deviceFromDto)),
      catchError((e) => apiError(e, 'Could not load devices.')),
    );
  }

  /** GET /api/iot-devices/{deviceId} */
  get(deviceId: string): Observable<Device> {
    return this.http.get<IoTDeviceDto>(`${this.url}/${encodeURIComponent(deviceId)}`, { params: tenantParams() }).pipe(
      map(deviceFromDto),
      catchError((e) => apiError(e, `Could not load ${deviceId}.`)),
    );
  }

  /** GET /api/iot-devices/device-types */
  deviceTypes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/device-types`, { params: tenantParams() }).pipe(catchError(() => of([])));
  }

  /** GET /api/iot-devices/models (all device types) */
  models(deviceType?: string): Observable<DeviceModelOption[]> {
    return this.http.get<DeviceModelOption[]>(`${this.url}/models`, { params: tenantParams({ deviceType }) }).pipe(catchError(() => of([])));
  }

  /** GET /api/iot-devices/connectivities?model&deviceType */
  connectivities(model?: string, deviceType?: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/connectivities`, { params: tenantParams({ model, deviceType }) }).pipe(catchError(() => of([])));
  }

  /** GET /api/iot-devices/gateways (every site) */
  gateways(siteId?: string): Observable<GatewayOption[]> {
    return this.http.get<GatewayOption[]>(`${this.url}/gateways`, { params: tenantParams({ siteId }) }).pipe(catchError(() => of([])));
  }

  /**
   * Registered assets for the "Link to asset" pickers: GET {assetApiUrl}api/asset-registrations (Asset service, first 1000),
   * the same list Tag Management offers. Empty when the Asset service cannot be reached.
   */
  registeredAssets(): Observable<LinkedAsset[]> {
    const params = tenantParams({ page: 1, pageSize: 1000 });
    return this.http.get<AssetListItemDto[] | { items?: AssetListItemDto[] }>(`${environment.assetApiUrl}api/asset-registrations`, { params }).pipe(
      map((res) => (Array.isArray(res) ? res : res?.items ?? [])
        .map((r): LinkedAsset => {
          const code = (r.assetTag || r.assetRegistrationId || '').trim();
          return { name: r.assetName?.trim() || code, code, registrationId: r.assetRegistrationId ?? undefined };
        })
        .filter((a) => !!a.code)
        .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code))),
      catchError(() => of([])),
    );
  }

  /** Master-data sites; empty when the service cannot be reached. */
  sites(): Observable<SiteOption[]> {
    type SiteRow = { id?: string; siteName?: string; name?: string; status?: string; isDeleted?: boolean };
    // Master Data service (GET /api/master-data/sites); a list or a page of { items }
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

  /** POST /api/iot-devices */
  create(d: Device, siteId: string | null): Observable<Device> {
    return this.http.post(this.url, this.request(d, siteId), { params: tenantParams(), responseType: 'text' }).pipe(
      switchMap((body) => this.saved(body, d)),
      catchError((e) => apiError(e, `Could not register ${d.id}.`)),
    );
  }

  /**
   * The device a successful POST / PUT returned. The body may be the device, a wrapper ({ data } / { item }),
   * plain text or empty: when it is not a device, reload it by id, or keep the page's copy if that fails too.
   */
  private saved(body: string, d: Device): Observable<Device> {
    const dto = savedRecord<IoTDeviceDto>(body, 'deviceId');
    if (dto) return of(deviceFromDto(dto));
    return this.get(d.id).pipe(catchError(() => of(d)));
  }

  /** PUT /api/iot-devices/{deviceId}: full replace; fields the page does not edit are sent back as loaded. */
  update(d: Device, siteId?: string | null): Observable<Device> {
    const one = `${this.url}/${encodeURIComponent(d.id)}`;
    // list rows leave out serial, firmware, etc.: read the full record first so the PUT does not blank them
    return this.http.get<IoTDeviceDto>(one, { params: tenantParams() }).pipe(
      catchError(() => of(d.api ?? null)),
      map((full) => (full ? { ...d, serial: d.serial || full.serialNumber || '', api: { ...full, ...stripUndefined(d.api) } as IoTDeviceDto } : d)),
      switchMap((dev) =>
        this.http.put(one, this.request(dev, siteId === undefined ? dev.api?.siteId ?? null : siteId), { params: tenantParams(), responseType: 'text' }).pipe(
          switchMap((body) => this.saved(body, dev)),
        ),
      ),
      catchError((e) => apiError(e, `Could not save ${d.id}.`)),
    );
  }

  /** DELETE /api/iot-devices/{deviceId} */
  delete(deviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(deviceId)}`, { params: tenantParams() }).pipe(
      catchError((e) => apiError(e, `Could not delete ${deviceId}.`)),
    );
  }

  private request(d: Device, siteId: string | null): IoTDeviceRequest {
    const api = d.api;
    const sameAsset = !!api && !!d.asset && (api.assetCode || api.assetRegistrationId) === d.asset.code;
    return {
      deviceId: d.id,
      deviceName: d.name,
      deviceType: d.type,
      model: d.model,
      serialNumber: d.serial,
      connectivity: d.protocol,
      siteId,
      siteName: d.site || null,
      // a registered asset picked from the list carries its registration id; otherwise keep the one already stored
      assetRegistrationId: d.asset?.registrationId ?? (sameAsset ? api!.assetRegistrationId : null),
      assetCode: d.asset?.code ?? null,
      assetName: d.asset && d.asset.name !== d.asset.code ? d.asset.name : sameAsset ? api!.assetName : null,
      gateway: d.gateway || null,
      powerSource: api?.powerSource ?? null,
      batteryLevel: api?.batteryLevel ?? null,
      lastSeenAt: api?.lastSeenAt ?? null,
      health: api?.health ?? null,
      firmwareVersion: api?.firmwareVersion ?? null,
      createdBy: this.currentUser(),
      ...tenantBody(),
    };
  }
}
