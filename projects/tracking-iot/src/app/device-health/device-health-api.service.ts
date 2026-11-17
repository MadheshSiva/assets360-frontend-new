import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { DEVICE_HEALTH, liveHealth, signalQualityOf } from './device-health.data';

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

/** Device health (static demo): connectivity, signal, power and health per device, from device-health.data.ts. */
@Injectable({ providedIn: 'root' })
export class DeviceHealthApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<DeviceHealthDto[]> {
    return demo(liveHealth());
  }

  get(id: string): Observable<DeviceHealthDto> {
    const h = liveHealth().find((x) => x.id === id);
    return h ? demo(h) : demoError('The health record was not found.');
  }

  create(f: DeviceHealthFields): Observable<DeviceHealthDto> {
    if (DEVICE_HEALTH.some((x) => x.deviceId.toLowerCase() === f.deviceId.trim().toLowerCase())) return demoError(`${f.deviceId} already has a health record.`);
    const dto = this.toDto(f, { id: newRecordId(), createdBy: this.user(), createdAt: new Date().toISOString() });
    DEVICE_HEALTH.unshift(dto);
    return demo(dto);
  }

  update(id: string, f: DeviceHealthFields): Observable<DeviceHealthDto> {
    const i = DEVICE_HEALTH.findIndex((x) => x.id === id);
    if (i < 0) return demoError(`Could not update ${f.deviceId}: the record no longer exists.`);
    const old = DEVICE_HEALTH[i];
    DEVICE_HEALTH[i] = this.toDto(f, { id, createdBy: old.createdBy, createdAt: old.createdAt });
    return demo(DEVICE_HEALTH[i]);
  }

  delete(id: string, deviceId: string): Observable<void> {
    const i = DEVICE_HEALTH.findIndex((x) => x.id === id);
    if (i < 0) return demoError(`Could not delete the health record of ${deviceId}.`);
    DEVICE_HEALTH.splice(i, 1);
    return demo(undefined as void);
  }

  private user(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  private toDto(f: DeviceHealthFields, keep: Pick<DeviceHealthDto, 'id' | 'createdBy' | 'createdAt'>): DeviceHealthDto {
    const text = (v: string | null) => (v && v.trim() ? v.trim() : null);
    return {
      ...keep,
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
      signalQuality: signalQualityOf(f.signalStrengthDbm),
      powerSource: f.powerSource,
      batteryLevel: f.powerSource === 'Battery' ? f.batteryLevel : null,
      lastSeenAt: f.lastSeenAt,
      health: f.health,
    };
  }
}
