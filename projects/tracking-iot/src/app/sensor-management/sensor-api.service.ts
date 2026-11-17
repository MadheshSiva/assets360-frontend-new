import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { IOT_DEVICES } from '../device-management/iot-devices.data';
import { generateReadings } from '../tracking-telemetry/telemetry-readings.data';
import { Parameter, Sensor } from './sensor-data';
import { MEASUREMENT_POINTS, SENSORS, SENSOR_FORM_OPTIONS } from './sensors.data';

/** A sensor record (addressed by sensorId, e.g. SEN-T-80214). */
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

/** Sensor Management (static demo, sensors.data.ts). */
@Injectable({ providedIn: 'root' })
export class SensorApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<SensorDto[]> {
    return demo(SENSORS);
  }

  get(sensorId: string): Observable<SensorDto> {
    const x = SENSORS.find((s) => s.sensorId === sensorId);
    return x ? demo(x) : demoError(`Sensor ${sensorId} was not found.`);
  }

  create(body: Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>): Observable<SensorDto> {
    const type = SENSOR_FORM_OPTIONS.sensorTypes.find((t) => t.sensorType === body.sensorType);
    const prefix = type?.idPrefix ?? 'SEN';
    let id = body.sensorId?.trim() || '';
    if (!id) {
      const n = SENSORS.filter((s) => s.sensorId.startsWith(prefix + '-')).reduce((m, s) => Math.max(m, Number(s.sensorNumber) || 0), 80000) + 1;
      id = `${prefix}-${body.sensorNumber?.trim() || n}`;
    }
    if (SENSORS.some((s) => s.sensorId.toLowerCase() === id.toLowerCase())) return demoError(`Sensor ${id} already exists.`);
    const dto = this.toDto(id, body, null);
    SENSORS.unshift(dto);
    return demo(dto);
  }

  update(sensorId: string, body: Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>): Observable<SensorDto> {
    const i = SENSORS.findIndex((s) => s.sensorId === sensorId);
    if (i < 0) return demoError(`Could not update ${sensorId}: it no longer exists.`);
    SENSORS[i] = this.toDto(sensorId, body, SENSORS[i]);
    return demo(SENSORS[i]);
  }

  remove(sensorId: string): Observable<void> {
    const i = SENSORS.findIndex((s) => s.sensorId === sensorId);
    if (i >= 0) SENSORS.splice(i, 1);
    return demo(undefined as void);
  }

  formOptions(): Observable<SensorFormOptionsDto> {
    return demo(SENSOR_FORM_OPTIONS);
  }

  /** Common points for the type plus any already used on sensors of that type. */
  measurementPoints(sensorType: string): Observable<string[]> {
    const used = SENSORS.filter((s) => s.sensorType === sensorType).map((s) => s.measurementPoint ?? '').filter(Boolean);
    return demo([...new Set([...(MEASUREMENT_POINTS[sensorType] ?? []), ...used])]);
  }

  devices(search = '', limit = 100): Observable<SensorDeviceOptionDto[]> {
    const q = search.trim().toLowerCase();
    return demo(
      IOT_DEVICES.filter((d) => d.deviceType !== 'Gateway' && d.deviceType !== 'RFID Reader')
        .filter((d) => !q || [d.deviceId, d.deviceName, d.model, d.assetName ?? ''].some((v) => v.toLowerCase().includes(q)))
        .slice(0, limit)
        .map((d) => {
          const used = this.usedChannels(d.deviceId);
          return {
            deviceId: d.deviceId, deviceName: d.deviceName, deviceType: d.deviceType, model: d.model, siteId: d.siteId, siteName: d.siteName,
            assetRegistrationId: d.assetRegistrationId, assetCode: d.assetCode, assetName: d.assetName, usedChannels: used, nextChannel: nextFree(used),
          };
        }),
    );
  }

  channels(deviceId: string): Observable<SensorChannelsDto> {
    if (!IOT_DEVICES.some((d) => d.deviceId === deviceId)) return demoError(`Device ${deviceId} was not found.`);
    const used = this.usedChannels(deviceId);
    return demo({ deviceId, usedChannels: used, nextChannel: nextFree(used) });
  }

  /** Readings of the last `days` days, oldest first. */
  readings(sensorId: string, days = 1): Observable<{ at: number; v: number | null }[]> {
    return demo(generateReadings({ sensorId, days, limit: 500 }).map((r) => ({ at: new Date(r.recordedAt).getTime(), v: Number(r.value) })).sort((a, b) => a.at - b.at));
  }

  /** Signed-in user for createdBy. */
  userName(): string | null {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  private usedChannels(deviceId: string): number[] {
    return SENSORS.filter((s) => s.deviceId === deviceId && s.channel !== null).map((s) => s.channel!).sort((a, b) => a - b);
  }

  private toDto(sensorId: string, b: Omit<SensorRequest, 'clientId' | 'tenantId' | 'createdBy'>, old: SensorDto | null): SensorDto {
    const type = SENSOR_FORM_OPTIONS.sensorTypes.find((t) => t.sensorType === b.sensorType);
    const now = new Date().toISOString();
    return {
      id: old?.id ?? newRecordId(), sensorId, sensorNumber: b.sensorNumber ?? sensorId.split('-').pop() ?? null, serialNumber: b.serialNumber, name: b.name ?? sensorId,
      sensorType: b.sensorType, measuredParameter: b.measuredParameter ?? type?.measuredParameter ?? '', unit: b.unit ?? type?.unit ?? null, deviceId: b.deviceId,
      deviceModel: b.deviceModel ?? IOT_DEVICES.find((d) => d.deviceId === b.deviceId)?.model ?? null, channel: b.channel, samplingIntervalSeconds: b.samplingIntervalSeconds,
      lowAlarm: b.lowAlarm, highAlarm: b.highAlarm, siteId: b.siteId, siteName: b.siteName, assetRegistrationId: b.assetRegistrationId, assetCode: b.assetCode,
      assetName: b.assetName, measurementPoint: b.measurementPoint, liveReading: b.liveReading ?? old?.liveReading ?? null,
      calibrationDueDate: b.calibrationDueDate ? `${b.calibrationDueDate.slice(0, 10)}T00:00:00Z` : null, status: b.status ?? 'Active',
      createdBy: old?.createdBy ?? this.userName(), createdAt: old?.createdAt ?? now, updatedBy: old ? this.userName() : null, updatedAt: old ? now : null,
    };
  }
}

function nextFree(used: number[]): number {
  let n = 1;
  while (used.includes(n)) n++;
  return n;
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
