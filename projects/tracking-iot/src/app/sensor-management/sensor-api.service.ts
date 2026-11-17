import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { Parameter, Sensor } from './sensor-data';

/** A sensor as GET/POST/PUT /api/sensors return it (addressed by sensorId, e.g. SEN-T-80214). */
export interface SensorDto {
  id: string;
  sensorId: string;
  sensorNumber: string | null;
  serialNumber: string | null;
  name: string;
  sensorType: string;
  measuredParameter: string;
  unit: string | null;
  deviceId: string | null;
  deviceModel: string | null;
  channel: number | null;
  samplingIntervalSeconds: number | null;
  lowAlarm: number | null;
  highAlarm: number | null;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  measurementPoint: string | null;
  liveReading: number | null;
  calibrationDueDate: string | null;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Body of POST /api/sensors and PUT /api/sensors/{sensorId} (CreateSensorRequest). */
export interface SensorRequest {
  sensorId: string | null;
  sensorNumber: string | null;
  serialNumber: string;
  name: string | null;
  sensorType: string;
  measuredParameter: string | null;
  unit: string | null;
  deviceId: string;
  deviceModel: string | null;
  channel: number | null;
  samplingIntervalSeconds: number | null;
  lowAlarm: number | null;
  highAlarm: number | null;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  measurementPoint: string;
  liveReading: number | null;
  /** yyyy-MM-dd; only the date is kept. */
  calibrationDueDate: string;
  status: string | null;
  createdBy: string | null;
  clientId: string;
  tenantId: string;
}

/** GET /api/sensors/types. */
export interface SensorTypeOptionDto { sensorType: string; idPrefix: string; measuredParameter: string; unit: string }

/** GET /api/sensors/form-options: every dropdown of the Add Sensor form. */
export interface SensorFormOptionsDto {
  sensorTypes: SensorTypeOptionDto[];
  samplingIntervals: { seconds: number; label: string }[];
  measurementPointsBySensorType: Record<string, string[]>;
  statuses: string[];
}

/** GET /api/sensors/devices: an option of the Linked device dropdown. */
export interface SensorDeviceOptionDto {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  usedChannels: number[];
  nextChannel: number;
}

/** GET /api/sensors/devices/{deviceId}/channels. */
export interface SensorChannelsDto { deviceId: string; usedChannels: number[]; nextChannel: number }

/** GET /api/telemetry-readings?sensorId=… (used for the Readings chart). */
export interface TelemetryReadingDto { readingId: string; recordedAt: string; deviceId: string; sensorId: string | null; parameter: string; value: number; unit: string | null }

/** Sensor Management → Tracking service /api/sensors. */
@Injectable({ providedIn: 'root' })
export class SensorApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  list(): Observable<SensorDto[]> {
    return this.http.get<SensorDto[]>(trackingUrl('sensors'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load sensors.')));
  }

  get(sensorId: string): Observable<SensorDto> {
    return this.http.get<SensorDto>(trackingUrl(`sensors/${encodeURIComponent(sensorId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load ${sensorId}.`)));
  }

  create(body: Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>): Observable<SensorDto> {
    return this.http
      .post<SensorDto>(trackingUrl('sensors'), { ...body, createdBy: this.userName(), ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, 'Could not add the sensor.')));
  }

  update(sensorId: string, body: Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>): Observable<SensorDto> {
    return this.http
      .put<SensorDto>(trackingUrl(`sensors/${encodeURIComponent(sensorId)}`), { ...body, createdBy: null, ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, `Could not update ${sensorId}.`)));
  }

  remove(sensorId: string): Observable<void> {
    return this.http.delete<void>(trackingUrl(`sensors/${encodeURIComponent(sensorId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not delete ${sensorId}.`)));
  }

  formOptions(): Observable<SensorFormOptionsDto> {
    return this.http.get<SensorFormOptionsDto>(trackingUrl('sensors/form-options'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load the sensor form options.')));
  }

  /** Common points for the type plus any already used on sensors of that type. */
  measurementPoints(sensorType: string): Observable<string[]> {
    return this.http.get<string[]>(trackingUrl('sensors/measurement-points'), { params: tenantParams({ sensorType }) }).pipe(catchError((e) => apiError(e, 'Could not load measurement points.')));
  }

  devices(search = '', limit = 100): Observable<SensorDeviceOptionDto[]> {
    return this.http.get<SensorDeviceOptionDto[]>(trackingUrl('sensors/devices'), { params: tenantParams({ search, limit }) }).pipe(catchError((e) => apiError(e, 'Could not load devices.')));
  }

  channels(deviceId: string): Observable<SensorChannelsDto> {
    return this.http.get<SensorChannelsDto>(trackingUrl(`sensors/devices/${encodeURIComponent(deviceId)}/channels`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Device ${deviceId} was not found.`)));
  }

  /** Readings of the last `days` days, oldest first. */
  readings(sensorId: string, days = 1): Observable<{ at: number; v: number | null }[]> {
    return this.http
      .get<TelemetryReadingDto[]>(trackingUrl('telemetry-readings'), { params: tenantParams({ sensorId, days, limit: 500 }) })
      .pipe(
        map((rows) => rows.map((r) => ({ at: new Date(r.recordedAt).getTime(), v: Number(r.value) })).sort((a, b) => a.at - b.at)),
        catchError((e) => apiError(e, 'Could not load readings.')),
      );
  }

  /** Signed-in user for createdBy. */
  userName(): string | null {
    let stored: string | null = null;
    try { stored = localStorage.getItem('userEmail'); } catch { /* storage blocked */ }
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || stored || null;
  }
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Page parameter for an API sensor type option. */
export function toParameter(o: SensorTypeOptionDto): Parameter {
  return { name: o.measuredParameter, label: o.measuredParameter, unit: o.unit, type: o.sensorType, prefix: o.idPrefix, decimals: o.unit === 'A' ? 0 : 1 };
}

/** Page sensor for an API record. The calibration due date is a UTC date, read as local midnight + 9 h so it never shifts a day. */
export function toSensor(d: SensorDto, types: Parameter[]): Sensor {
  const known = types.find((p) => p.type.toLowerCase() === d.sensorType.toLowerCase());
  const param: Parameter = {
    name: d.measuredParameter, label: d.measuredParameter, unit: d.unit ?? known?.unit ?? '', type: d.sensorType,
    prefix: known?.prefix ?? 'SEN', decimals: known?.decimals ?? 1,
  };
  const due = d.calibrationDueDate ? new Date(`${d.calibrationDueDate.slice(0, 10)}T09:00`).getTime() : null;
  return {
    id: d.sensorId,
    number: d.sensorNumber ?? '',
    name: d.name,
    type: d.sensorType,
    param,
    serial: d.serialNumber ?? '',
    deviceId: d.deviceId ?? '',
    deviceModel: d.deviceModel ?? '',
    channel: d.channel,
    assetId: d.assetCode ?? '',
    assetRegId: d.assetRegistrationId ?? '',
    assetName: d.assetName ?? d.assetCode ?? d.assetRegistrationId ?? '',
    point: d.measurementPoint ?? '',
    siteId: d.siteId ?? '',
    site: d.siteName ?? '',
    intervalSec: d.samplingIntervalSeconds,
    low: d.lowAlarm,
    high: d.highAlarm,
    reading: d.liveReading,
    status: d.status ?? 'Active',
    installedOn: ms(d.createdAt),
    createdBy: d.createdBy ?? '',
    updatedOn: ms(d.updatedAt),
    updatedBy: d.updatedBy ?? '',
    lastCal: null,
    calDue: due,
    certificate: '',
    events: [],
  };
}
