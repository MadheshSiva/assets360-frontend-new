import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DEMO_BUILDINGS, DEMO_FLOORS, DEMO_SITES, buildingById, siteById } from '../shared/master-data.data';
import { demo } from '../shared/tracking-api';
import { liveDevices } from '../device-management/iot-devices.data';
import { liveHealth } from '../device-health/device-health.data';
import { IOT_ALERTS } from '../geofence-alerts/iot-alerts.data';
import { filterAlerts } from '../geofence-alerts/iot-alert-api.service';
import { LOCATION_EVENTS } from '../real-time-location/location-events.data';
import { FLOOR_LAYOUTS } from '../real-time-location/floor-layouts.data';
import { eventsTimeline, generateReadings } from './telemetry-readings.data';

// ===== Master Data (sites and buildings for the site / building pickers and the map) =====

/** A Master Data site; lat / lng are null when the site has no coordinates. */
export interface MdmSite { id: string; name: string; lat: number | null; lng: number | null; /** '' when not set */ country?: string }
/** A Master Data floor with its uploaded floor plan image (null when none was uploaded). */
export interface MdmFloor {
  id: string; name: string; siteId: string; siteName: string; buildingId: string; buildingName: string;
  /** Floor area in m² (sizes the plan on the map), null when not entered. */
  area: number | null;
  image: string | null; lat: number | null; lng: number | null;
}

/** A Master Data building with the site it belongs to. */
export interface MdmBuilding { id: string; name: string; siteId: string; siteName: string; lat: number | null; lng: number | null }

// ===== DTOs (dates are ISO strings in UTC) =====

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

/** Read-only access to the demo records shown on Tracking & Telemetry (and reused by Analytics & Insights). */
@Injectable({ providedIn: 'root' })
export class TelemetryReadApi {
  devices(): Observable<IotDeviceDto[]> {
    return demo(liveDevices());
  }

  deviceHealth(): Observable<DeviceHealthDto[]> {
    return demo(liveHealth());
  }

  readings(q: TelemetryQuery = {}): Observable<TelemetryReadingDto[]> {
    return demo(generateReadings(q));
  }

  locationEvents(): Observable<LocationEventDto[]> {
    return demo(LOCATION_EVENTS);
  }

  alerts(q: AlertQuery = {}): Observable<IotAlertDto[]> {
    return demo(filterAlerts(IOT_ALERTS, q));
  }

  timeline(days: number): Observable<IotEventsTimelineDto> {
    return demo(eventsTimeline(days));
  }

  sites(): Observable<MdmSite[]> {
    return demo(DEMO_SITES.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, country: s.country })));
  }

  /** Countries in use by the sites, sorted. */
  countries(): Observable<string[]> {
    return demo([...new Set(DEMO_SITES.map((s) => s.country))].sort());
  }

  buildings(): Observable<MdmBuilding[]> {
    return demo(DEMO_BUILDINGS.map((b) => ({ id: b.id, name: b.name, siteId: b.siteId, siteName: siteById(b.siteId)?.name ?? '', lat: b.lat, lng: b.lng })));
  }

  /** Floors with their floor plan image. */
  floors(): Observable<MdmFloor[]> {
    return demo(
      DEMO_FLOORS.map((f) => {
        const b = buildingById(f.buildingId);
        return {
          id: f.id, name: f.name, siteId: b?.siteId ?? '', siteName: siteById(b?.siteId)?.name ?? '', buildingId: f.buildingId, buildingName: b?.name ?? '',
          area: f.area, image: FLOOR_LAYOUTS.get(f.id)?.imageUrl ?? null, lat: b?.lat ?? null, lng: b?.lng ?? null,
        };
      }),
    );
  }
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
