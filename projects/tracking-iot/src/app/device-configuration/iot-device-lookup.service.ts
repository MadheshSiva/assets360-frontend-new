import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError } from 'rxjs';
import { apiError, getAllPages, trackingUrl } from '../shared/tracking-api';

/** A device as GET /api/iot-devices returns it. Read-only here: the IoT Device Management page owns create / update / delete. */
export interface IoTDeviceDto {
  id: string;
  deviceId: string;
  deviceName: string;
  /** e.g. BLE Tracker, Temperature Sensor, Gateway. */
  deviceType: string;
  model: string;
  serialNumber: string | null;
  /** The protocol the device talks, e.g. BLE 5.0, LoRaWAN 1.0.3, Cellular (not online / offline). */
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
}

/** Device type the API gives gateways (the devices other devices report through). */
export const GATEWAY_TYPE = 'Gateway';

/** Whether an IoT device runs the given firmware-inventory model ("EM300-TH" matches "Milesight EM300-TH" either way round). */
export function sameModel(deviceModel: string | null | undefined, firmwareModel: string | null | undefined): boolean {
  const a = (deviceModel ?? '').trim().toLowerCase();
  const b = (firmwareModel ?? '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith(' ' + b) || b.endsWith(' ' + a);
}

/** Read-only access to the IoT device registry (GET /api/iot-devices). */
@Injectable({ providedIn: 'root' })
export class IoTDeviceLookupService {
  private readonly http = inject(HttpClient);

  /** Every registered device (all pages of the list). */
  list(): Observable<IoTDeviceDto[]> {
    return getAllPages<IoTDeviceDto>(this.http, trackingUrl('iot-devices')).pipe(catchError((e) => apiError(e, 'Could not load IoT devices.')));
  }
}
