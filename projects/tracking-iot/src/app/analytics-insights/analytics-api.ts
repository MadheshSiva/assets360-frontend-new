import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { apiError, tenantParams, trackingUrl } from '../shared/tracking-api';
import {
  DeviceHealthDto, IotAlertDto, IotDeviceDto, IotEventsTimelineDto, LocationEventDto, MAX_DAYS, MAX_READINGS, TelemetryReadApi, TelemetryReadingDto,
} from '../tracking-telemetry/telemetry-api';

/** GET /api/asset-utilization: one asset's running / idle time on one day. */
export interface AssetUtilizationDto {
  id: string;
  utilizationId: string;
  /** The day (00:00 UTC). */
  date: string;
  assetRegistrationId: string;
  assetName: string | null;
  assetType: string;
  deviceId: string | null;
  siteName: string | null;
  runningMinutes: number;
  idleMinutes: number;
  runningPercent: number;
  idlePercent: number;
  createdBy: string | null;
  createdAt: string | null;
}

export interface AssetTypeUtilizationDto {
  assetType: string;
  assetCount: number;
  runningHours: number;
  idleHours: number;
  runningPercent: number;
  idlePercent: number;
}

/** GET /api/asset-utilization/by-asset-type */
export interface UtilizationByAssetTypeDto {
  days: number;
  from: string;
  to: string;
  overallRunningPercent: number;
  overallIdlePercent: number;
  items: AssetTypeUtilizationDto[];
}

/** Everything Analytics & Insights aggregates, for a window of the last `days` days. */
export interface AnalyticsSource {
  days: number;
  devices: IotDeviceDto[];
  health: DeviceHealthDto[];
  utilization: AssetUtilizationDto[];
  byAssetType: UtilizationByAssetTypeDto;
  alerts: IotAlertDto[];
  readings: TelemetryReadingDto[];
  timeline: IotEventsTimelineDto;
  locationEvents: LocationEventDto[];
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  private readonly reads = inject(TelemetryReadApi);

  utilization(days: number, assetType?: string): Observable<AssetUtilizationDto[]> {
    return this.http
      .get<AssetUtilizationDto[]>(trackingUrl('asset-utilization'), { params: tenantParams({ days, assetType }) })
      .pipe(catchError((err) => apiError(err, 'Could not load asset utilization.')));
  }

  utilizationByAssetType(days: number): Observable<UtilizationByAssetTypeDto> {
    return this.http
      .get<UtilizationByAssetTypeDto>(trackingUrl('asset-utilization/by-asset-type'), { params: tenantParams({ days }) })
      .pipe(catchError((err) => apiError(err, 'Could not load utilization by asset type.')));
  }

  /**
   * Loads the analytics data for the last `days` days (the API windows are whole UTC days ending today).
   * Alerts and the events timeline cover twice that, for the change vs the previous period.
   */
  load(days: number): Observable<AnalyticsSource> {
    const d = Math.min(MAX_DAYS, Math.max(1, days));
    const d2 = Math.min(MAX_DAYS, d * 2);
    return forkJoin({
      days: of(d),
      devices: this.reads.devices(),
      health: this.reads.deviceHealth(),
      utilization: this.utilization(d),
      byAssetType: this.utilizationByAssetType(d),
      alerts: this.reads.alerts({ days: d2 }),
      readings: this.reads.readings({ days: d, limit: MAX_READINGS }),
      timeline: this.reads.timeline(d2),
      locationEvents: this.reads.locationEvents(),
    });
  }
}
