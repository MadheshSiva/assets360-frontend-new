import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { liveDevices } from '../device-management/iot-devices.data';
import { Candidate, Compat, ExistingDevice, HistoryEvent, kindOf } from './replacement-data';
import { REPLACEMENT_STOCK } from './replacement-stock.data';

/** A spare device in replacement stock (addressed by deviceId). */
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

/** The fields of an IoT device the replacement page shows. */
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

/** Device Replacement (static demo): spare stock (replacement-stock.data.ts) and the demo device registry. */
@Injectable({ providedIn: 'root' })
export class ReplacementDeviceApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<ReplacementDeviceDto[]> {
    return demo(REPLACEMENT_STOCK);
  }

  get(deviceId: string): Observable<ReplacementDeviceDto> {
    const d = REPLACEMENT_STOCK.find((x) => x.deviceId === deviceId);
    return d ? demo(d) : demoError(`Spare ${deviceId} was not found.`);
  }

  create(body: ReplacementDeviceRequest): Observable<ReplacementDeviceDto> {
    if (REPLACEMENT_STOCK.some((x) => x.deviceId.toLowerCase() === body.deviceId.toLowerCase())) return demoError(`${body.deviceId} is already in stock.`);
    const dto: ReplacementDeviceDto = { ...body, id: newRecordId(), createdBy: this.userName(), createdAt: new Date().toISOString(), updatedBy: null, updatedAt: null };
    REPLACEMENT_STOCK.unshift(dto);
    return demo(dto);
  }

  update(deviceId: string, body: ReplacementDeviceRequest): Observable<ReplacementDeviceDto> {
    const i = REPLACEMENT_STOCK.findIndex((x) => x.deviceId === deviceId);
    if (i < 0) return demoError(`Could not update ${deviceId}: it is no longer in stock.`);
    REPLACEMENT_STOCK[i] = { ...REPLACEMENT_STOCK[i], ...body, updatedBy: this.userName(), updatedAt: new Date().toISOString() };
    return demo(REPLACEMENT_STOCK[i]);
  }

  remove(deviceId: string): Observable<void> {
    const i = REPLACEMENT_STOCK.findIndex((x) => x.deviceId === deviceId);
    if (i >= 0) REPLACEMENT_STOCK.splice(i, 1);
    return demo(undefined as void);
  }

  /** Every IoT device (read only here; the queue is built from their health). */
  iotDevices(): Observable<IoTDeviceDto[]> {
    return demo(liveDevices());
  }

  iotDevice(deviceId: string): Observable<IoTDeviceDto> {
    const d = liveDevices().find((x) => x.deviceId === deviceId);
    return d ? demo(d) : demoError(`Device ${deviceId} was not found.`);
  }

  userName(): string | null {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
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
