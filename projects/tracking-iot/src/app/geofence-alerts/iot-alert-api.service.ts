import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { actorName } from './geofence-api.service';
import { AlertEvent, EventStatus } from './geofence-data';

/** GET /api/iot-alerts row. */
export interface IoTAlertDto {
  id: string;
  alertId: string;
  raisedAt: string;
  assetRegistrationId: string | null;
  assetName: string;
  deviceId: string | null;
  siteId: string | null;
  siteName: string | null;
  eventType: string;
  severity: string;
  status: string | null;
  message: string | null;
  alertRuleId: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** POST / PUT /api/iot-alerts body. */
export interface IoTAlertRequest {
  raisedAt: string | null;
  assetRegistrationId: string | null;
  assetName: string;
  deviceId: string | null;
  siteId: string | null;
  siteName: string | null;
  eventType: string;
  severity: string;
  status: string | null;
  message: string | null;
  alertRuleId: string | null;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** GET /api/iot-alerts/options */
export interface IoTAlertOptionsDto {
  severities: string[];
  statuses: string[];
  eventTypes: string[];
}

/** GET /api/iot-alerts/count */
export interface IoTAlertCountDto {
  days: number;
  from: string;
  to: string;
  total: number;
  previousPeriodTotal: number;
  changePercent: number | null;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface IoTAlertQuery {
  days?: number;
  status?: string;
  severity?: string;
  siteName?: string;
  assetRegistrationId?: string;
  search?: string;
  limit?: number;
}

export type IoTAlertStatus = 'Open' | 'Acknowledged' | 'In Progress' | 'Resolved';

const STATUS_FROM_API: Record<string, EventStatus> = { open: 'Unacknowledged', acknowledged: 'Acknowledged', 'in progress': 'Assigned', resolved: 'Resolved' };
const STATUS_TO_API: Record<EventStatus, IoTAlertStatus> = { Unacknowledged: 'Open', Acknowledged: 'Acknowledged', Assigned: 'In Progress', Resolved: 'Resolved' };

export function statusFromApi(s: string | null): EventStatus {
  return STATUS_FROM_API[(s ?? 'open').toLowerCase()] ?? 'Unacknowledged';
}

export function statusToApi(s: EventStatus): IoTAlertStatus {
  return STATUS_TO_API[s];
}

/** Maps an alert; the geofence is resolved through the rule that raised it (`zoneOfRule`). */
export function toAlertEvent(d: IoTAlertDto, zoneOfRule: (ruleId: string) => { id: string; name: string } | null): AlertEvent {
  const zone = d.alertRuleId ? zoneOfRule(d.alertRuleId) : null;
  const code = d.assetRegistrationId || d.assetName;
  return {
    id: d.alertId,
    ts: new Date(d.raisedAt),
    assetCode: code,
    assetSub: d.assetRegistrationId ? d.assetName : '',
    zoneId: zone?.id ?? '',
    zoneName: zone?.name ?? '—',
    type: d.eventType,
    severity: d.severity,
    message: d.message ?? '',
    owner: d.resolvedBy || d.acknowledgedBy || '—',
    status: statusFromApi(d.status),
  };
}

/** Alerts raised on tracked assets: /api/iot-alerts. */
@Injectable({ providedIn: 'root' })
export class IoTAlertApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('iot-alerts');

  /** Most recently raised first. */
  list(query: IoTAlertQuery = {}): Observable<IoTAlertDto[]> {
    return this.http.get<IoTAlertDto[]>(this.url, { params: tenantParams({ ...query }) }).pipe(
      catchError((err) => apiError(err, 'Could not load alerts.')),
    );
  }

  get(alertId: string): Observable<IoTAlertDto> {
    return this.http.get<IoTAlertDto>(`${this.url}/${encodeURIComponent(alertId)}`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not load the alert.')),
    );
  }

  count(days?: number, siteName?: string): Observable<IoTAlertCountDto> {
    return this.http.get<IoTAlertCountDto>(`${this.url}/count`, { params: tenantParams({ days, siteName }) }).pipe(
      catchError((err) => apiError(err, 'Could not load the alert count.')),
    );
  }

  options(): Observable<IoTAlertOptionsDto> {
    return this.http.get<IoTAlertOptionsDto>(`${this.url}/options`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not load alert options.')),
    );
  }

  create(body: Omit<IoTAlertRequest, 'createdBy' | 'clientId' | 'tenantId'>): Observable<IoTAlertDto> {
    return this.http.post<IoTAlertDto>(this.url, { ...body, createdBy: actorName(this.auth), ...tenantBody() }, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not create the alert.')),
    );
  }

  /** Acknowledge, start (In Progress), resolve or reopen an alert. */
  setStatus(alertId: string, status: IoTAlertStatus): Observable<IoTAlertDto> {
    return this.http.patch<IoTAlertDto>(`${this.url}/${encodeURIComponent(alertId)}/status`, { status }, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not update the alert status.')),
    );
  }

  delete(alertId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(alertId)}`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not delete the alert.')),
    );
  }
}
