import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';

export type ApiConnectivity = 'Online' | 'Offline' | 'Warning';
export type ApiPowerSource = 'Battery' | 'External power' | 'PoE';
export type ApiHealth = 'Healthy' | 'Attention' | 'Critical' | 'Maintenance';

export const API_CONNECTIVITY: ApiConnectivity[] = ['Online', 'Warning', 'Offline'];
export const API_POWER: ApiPowerSource[] = ['Battery', 'External power', 'PoE'];
export const API_HEALTH: ApiHealth[] = ['Healthy', 'Attention', 'Critical', 'Maintenance'];

/** A row of Device Health & Status (GET /api/device-health). One record per device id. */
export interface DeviceHealthDto {
  id: string;
  deviceId: string;
  deviceModel: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  gateway: string | null;
  connectivity: ApiConnectivity;
  signalStrengthDbm: number | null;
  snrDb: number | null;
  signalQuality: 'Strong' | 'Good' | 'Fair' | 'Poor' | null;
  powerSource: ApiPowerSource;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  health: ApiHealth | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** What the add / edit form collects (POST and PUT take the same body). */
export interface DeviceHealthFields {
  deviceId: string;
  deviceModel: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  gateway: string | null;
  connectivity: ApiConnectivity;
  signalStrengthDbm: number | null;
  snrDb: number | null;
  powerSource: ApiPowerSource;
  batteryLevel: number | null;
  /** ISO timestamp or null. */
  lastSeenAt: string | null;
  health: ApiHealth;
}

/** /api/device-health: connectivity, signal, power and health per device. */
@Injectable({ providedIn: 'root' })
export class DeviceHealthApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('device-health');

  list(): Observable<DeviceHealthDto[]> {
    return this.http.get<DeviceHealthDto[]>(this.url, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load device health.')));
  }

  get(id: string): Observable<DeviceHealthDto> {
    return this.http.get<DeviceHealthDto>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load the health record.')));
  }

  create(f: DeviceHealthFields): Observable<DeviceHealthDto> {
    return this.http.post<DeviceHealthDto>(this.url, this.body(f), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not add health for ${f.deviceId}.`)));
  }

  /** Full replace; same body as create. */
  update(id: string, f: DeviceHealthFields): Observable<DeviceHealthDto> {
    return this.http.put<DeviceHealthDto>(`${this.url}/${encodeURIComponent(id)}`, this.body(f), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not update ${f.deviceId}.`)));
  }

  delete(id: string, deviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not delete the health record of ${deviceId}.`)));
  }

  private body(f: DeviceHealthFields) {
    const text = (v: string | null) => (v && v.trim() ? v.trim() : null);
    return {
      deviceId: f.deviceId.trim(),
      deviceModel: f.deviceModel.trim(),
      assetRegistrationId: text(f.assetRegistrationId),
      assetName: text(f.assetName),
      siteId: text(f.siteId),
      siteName: text(f.siteName),
      gateway: text(f.gateway),
      connectivity: f.connectivity,
      signalStrengthDbm: f.signalStrengthDbm,
      snrDb: f.snrDb,
      // worked out by the API from the dBm reading
      signalQuality: null,
      powerSource: f.powerSource,
      // the API keeps a level only for battery-powered devices
      batteryLevel: f.powerSource === 'Battery' ? f.batteryLevel : null,
      lastSeenAt: f.lastSeenAt,
      health: f.health,
      createdBy: this.auth.getUser()?.userName || this.auth.getUserEmail() || '',
      ...tenantBody(),
    };
  }
}
