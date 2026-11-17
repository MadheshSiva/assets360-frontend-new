import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, getAllPages, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { Candidate, Compat, ExistingDevice, HistoryEvent, kindOf } from './replacement-data';

/** A spare device as /api/replacement-devices returns it (addressed by deviceId). */
export interface ReplacementDeviceDto {
  id: string;
  deviceId: string;
  model: string;
  availability: string | null;
  compatibility: string;
  protocol: string | null;
  batteryLevel: number | null;
  locationName: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Body of POST /api/replacement-devices and PUT /api/replacement-devices/{deviceId}. */
export interface ReplacementDeviceRequest {
  deviceId: string;
  model: string;
  availability: string | null;
  compatibility: string;
  protocol: string | null;
  batteryLevel: number | null;
  locationName: string;
}

/** The fields of an IoT device (GET /api/iot-devices) the replacement page shows. */
export interface IoTDeviceDto {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  connectivity: string;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  gateway: string | null;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  health: string | null;
  firmwareVersion: string | null;
  createdAt: string | null;
}

/** Device Replacement → Tracking service /api/replacement-devices (stock) and /api/iot-devices (devices to replace). */
@Injectable({ providedIn: 'root' })
export class ReplacementDeviceApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  list(): Observable<ReplacementDeviceDto[]> {
    return this.http.get<ReplacementDeviceDto[]>(trackingUrl('replacement-devices'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load replacement stock.')));
  }

  get(deviceId: string): Observable<ReplacementDeviceDto> {
    return this.http.get<ReplacementDeviceDto>(trackingUrl(`replacement-devices/${encodeURIComponent(deviceId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load ${deviceId}.`)));
  }

  create(body: ReplacementDeviceRequest): Observable<ReplacementDeviceDto> {
    return this.http
      .post<ReplacementDeviceDto>(trackingUrl('replacement-devices'), { ...body, createdBy: this.userName(), ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, 'Could not add the replacement device.')));
  }

  update(deviceId: string, body: ReplacementDeviceRequest): Observable<ReplacementDeviceDto> {
    return this.http
      .put<ReplacementDeviceDto>(trackingUrl(`replacement-devices/${encodeURIComponent(deviceId)}`), { ...body, createdBy: null, ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, `Could not update ${deviceId}.`)));
  }

  remove(deviceId: string): Observable<void> {
    return this.http.delete<void>(trackingUrl(`replacement-devices/${encodeURIComponent(deviceId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not delete ${deviceId}.`)));
  }

  /** Every IoT device (read only here; the queue is built from their health). */
  iotDevices(): Observable<IoTDeviceDto[]> {
    return getAllPages<IoTDeviceDto>(this.http, trackingUrl('iot-devices')).pipe(catchError((e) => apiError(e, 'Could not load IoT devices.')));
  }

  iotDevice(deviceId: string): Observable<IoTDeviceDto> {
    return this.http.get<IoTDeviceDto>(trackingUrl(`iot-devices/${encodeURIComponent(deviceId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Device ${deviceId} was not found.`)));
  }

  userName(): string | null {
    let stored: string | null = null;
    try { stored = localStorage.getItem('userEmail'); } catch { /* storage blocked */ }
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || stored || null;
  }
}

/** Local "YYYY-MM-DDTHH:mm" for an API timestamp, '' when missing. */
export function localIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}

export function toCandidate(d: ReplacementDeviceDto): Candidate {
  const compat = (['Compatible', 'Partial', 'Incompatible'] as Compat[]).find((c) => c.toLowerCase() === (d.compatibility ?? '').toLowerCase()) ?? 'Partial';
  return { id: d.deviceId, model: d.model, protocol: d.protocol ?? '', battery: d.batteryLevel, location: d.locationName, availability: d.availability ?? 'Available', compatibility: compat };
}

export function requestOf(c: Candidate): ReplacementDeviceRequest {
  return { deviceId: c.id, model: c.model, availability: c.availability, compatibility: c.compatibility, protocol: c.protocol || null, batteryLevel: c.battery, locationName: c.location };
}

export function toExisting(d: IoTDeviceDto): ExistingDevice {
  const history: HistoryEvent[] = [];
  const created = localIso(d.createdAt);
  const seen = localIso(d.lastSeenAt);
  if (created) history.push({ at: created, kind: 'install', text: `Registered${d.assetName ? ` on ${d.assetName}` : ''}${d.siteName ? ` at ${d.siteName}` : ''}` });
  if (seen) history.unshift({ at: seen, kind: d.health === 'Critical' ? 'alert' : 'info', text: `Last seen (health ${d.health ?? '—'})` });
  return {
    id: d.deviceId, kind: kindOf(`${d.deviceType} ${d.deviceName}`), type: d.deviceType, model: d.model, protocol: d.connectivity ?? '', battery: d.batteryLevel,
    status: d.health ?? '', assetId: d.assetCode ?? d.assetRegistrationId ?? '', assetName: d.assetName ?? '', site: d.siteName ?? '', zone: '',
    gateway: d.gateway ?? '', firmware: d.firmwareVersion ?? '', channels: [], lastSeen: seen, reason: '', group: '', history,
  };
}
