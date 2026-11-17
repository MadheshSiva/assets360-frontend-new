import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { actorName } from './geofence-api.service';
import { AlertEvent, EventStatus } from './geofence-data';
import { IOT_ALERTS } from './iot-alerts.data';

/** An IoT alert record. */
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

/** Alerts raised on tracked assets (static demo, iot-alerts.data.ts). */
@Injectable({ providedIn: 'root' })
export class IoTAlertApiService {
  private readonly auth = inject(AuthService);

  /** Most recently raised first. */
  list(query: IoTAlertQuery = {}): Observable<IoTAlertDto[]> {
    return demo(filterAlerts(IOT_ALERTS, query));
  }

  get(alertId: string): Observable<IoTAlertDto> {
    const a = IOT_ALERTS.find((x) => x.alertId === alertId);
    return a ? demo(a) : demoError('The alert was not found.');
  }

  count(days?: number, siteName?: string): Observable<IoTAlertCountDto> {
    const d = days ?? 30;
    const now = Date.now();
    const from = now - d * 86_400_000;
    const inSite = IOT_ALERTS.filter((a) => !siteName || a.siteName === siteName);
    const cur = inSite.filter((a) => Date.parse(a.raisedAt) >= from);
    const prev = inSite.filter((a) => Date.parse(a.raisedAt) >= from - d * 86_400_000 && Date.parse(a.raisedAt) < from).length;
    const tally = (k: 'status' | 'severity') => cur.reduce<Record<string, number>>((m, a) => ((m[a[k] ?? 'Open'] = (m[a[k] ?? 'Open'] ?? 0) + 1), m), {});
    return demo({
      days: d, from: new Date(from).toISOString(), to: new Date(now).toISOString(), total: cur.length, previousPeriodTotal: prev,
      changePercent: prev ? Math.round(((cur.length - prev) / prev) * 1000) / 10 : null, byStatus: tally('status'), bySeverity: tally('severity'),
    });
  }

  options(): Observable<IoTAlertOptionsDto> {
    return demo({
      severities: ['Critical', 'Warning', 'Info'],
      statuses: ['Open', 'Acknowledged', 'In Progress', 'Resolved'],
      eventTypes: [...new Set(IOT_ALERTS.map((a) => a.eventType))].sort(),
    });
  }

  create(body: Omit<IoTAlertRequest, 'createdBy' | 'clientId' | 'tenantId'>): Observable<IoTAlertDto> {
    const n = IOT_ALERTS.reduce((m, a) => Math.max(m, Number(a.alertId.slice(4)) || 0), 0) + 1;
    const now = new Date().toISOString();
    const dto: IoTAlertDto = {
      ...body, id: newRecordId(), alertId: `ALT-${String(n).padStart(6, '0')}`, raisedAt: body.raisedAt ?? now, status: body.status ?? 'Open',
      acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, createdBy: this.user(), createdAt: now, updatedBy: null, updatedAt: null,
      clientId: 'demo-client', tenantId: 'demo-tenant',
    };
    IOT_ALERTS.unshift(dto);
    return demo(dto);
  }

  /** Acknowledge, start (In Progress), resolve or reopen an alert. */
  setStatus(alertId: string, status: IoTAlertStatus): Observable<IoTAlertDto> {
    const a = IOT_ALERTS.find((x) => x.alertId === alertId);
    if (!a) return demoError('Could not update the alert status: it no longer exists.');
    const now = new Date().toISOString();
    const user = this.user();
    a.status = status;
    if (status === 'Open') Object.assign(a, { acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null });
    if (status !== 'Open' && !a.acknowledgedAt) Object.assign(a, { acknowledgedBy: user, acknowledgedAt: now });
    if (status === 'Resolved') Object.assign(a, { resolvedBy: user, resolvedAt: now });
    else Object.assign(a, { resolvedBy: null, resolvedAt: null });
    Object.assign(a, { updatedBy: user, updatedAt: now });
    return demo(a);
  }

  delete(alertId: string): Observable<void> {
    const i = IOT_ALERTS.findIndex((x) => x.alertId === alertId);
    if (i >= 0) IOT_ALERTS.splice(i, 1);
    return demo(undefined as void);
  }

  private user(): string {
    return actorName(this.auth) || DEMO_USER;
  }
}

/** Alerts matching a query (all filters optional), most recently raised first. */
export function filterAlerts<T extends IoTAlertDto>(rows: T[], q: IoTAlertQuery): T[] {
  const since = q.days ? Date.now() - q.days * 86_400_000 : -Infinity;
  const text = (q.search ?? '').trim().toLowerCase();
  const out = rows
    .filter((a) => Date.parse(a.raisedAt) >= since)
    .filter((a) => !q.status || (a.status ?? 'Open').toLowerCase() === q.status.toLowerCase())
    .filter((a) => !q.severity || a.severity.toLowerCase() === q.severity.toLowerCase())
    .filter((a) => !q.siteName || a.siteName === q.siteName)
    .filter((a) => !q.assetRegistrationId || a.assetRegistrationId === q.assetRegistrationId)
    .filter((a) => !text || [a.alertId, a.assetName, a.eventType, a.message ?? '', a.deviceId ?? ''].some((v) => v.toLowerCase().includes(text)))
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
  return q.limit ? out.slice(0, q.limit) : out;
}
