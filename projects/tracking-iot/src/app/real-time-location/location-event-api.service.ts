import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { actorName } from '../geofence-alerts/geofence-api.service';
import { LocEvent, LocEventType } from './location-data';
import { LOCATION_EVENTS } from './location-events.data';

/** A location event record. */
export interface LocationEventDto {
  id: string;
  eventId: string;
  eventTime: string;
  assetId: string;
  assetName: string;
  eventType: string;
  zoneName: string;
  details: string | null;
  createdBy: string | null;
  createdAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** POST / PUT /api/location-events body. EventType is one of Entered Zone, Departed Zone, Geofence Alert, Dwell Exceeded. */
export interface LocationEventRequest {
  eventTime: string | null;
  assetId: string;
  assetName: string;
  eventType: LocEventType;
  zoneName: string;
  details: string | null;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

export function toLocEvent(d: LocationEventDto): LocEvent {
  return {
    id: d.eventId,
    at: new Date(d.eventTime).getTime(),
    assetId: d.assetId,
    assetName: d.assetName,
    event: d.eventType,
    zone: d.zoneName,
    details: d.details ?? '—',
  };
}

export function toLocationEventRequest(e: Omit<LocEvent, 'id'> & { event: LocEventType }, createdBy: string): LocationEventRequest {
  return {
    eventTime: new Date(e.at).toISOString(),
    assetId: e.assetId,
    assetName: e.assetName,
    eventType: e.event,
    zoneName: e.zone,
    details: e.details && e.details !== '—' ? e.details : null,
    createdBy,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
}

/** Recent Location Events (static demo, location-events.data.ts), newest first. */
@Injectable({ providedIn: 'root' })
export class LocationEventApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<LocEvent[]> {
    return demo(LOCATION_EVENTS.map(toLocEvent));
  }

  get(eventId: string): Observable<LocEvent> {
    const e = LOCATION_EVENTS.find((x) => x.eventId === eventId);
    return e ? demo(toLocEvent(e)) : demoError('The location event was not found.');
  }

  create(e: Omit<LocEvent, 'id'> & { event: LocEventType }): Observable<LocEvent> {
    const n = LOCATION_EVENTS.reduce((m, x) => Math.max(m, Number(x.eventId.slice(2)) || 0), 0) + 1;
    const dto = this.toDto(`LE${String(n).padStart(6, '0')}`, e, null);
    LOCATION_EVENTS.unshift(dto);
    return demo(toLocEvent(dto));
  }

  update(e: LocEvent & { event: LocEventType }): Observable<LocEvent> {
    const i = LOCATION_EVENTS.findIndex((x) => x.eventId === e.id);
    if (i < 0) return demoError('Could not update the location event: it no longer exists.');
    LOCATION_EVENTS[i] = this.toDto(e.id, e, LOCATION_EVENTS[i]);
    return demo(toLocEvent(LOCATION_EVENTS[i]));
  }

  delete(eventId: string): Observable<void> {
    const i = LOCATION_EVENTS.findIndex((x) => x.eventId === eventId);
    if (i >= 0) LOCATION_EVENTS.splice(i, 1);
    return demo(undefined as void);
  }

  private toDto(eventId: string, e: Omit<LocEvent, 'id'> & { event: LocEventType }, old: LocationEventDto | null): LocationEventDto {
    const req = toLocationEventRequest(e, old?.createdBy ?? (actorName(this.auth) || DEMO_USER));
    return { ...req, id: old?.id ?? newRecordId(), eventId, eventTime: req.eventTime ?? new Date().toISOString(), createdAt: old?.createdAt ?? new Date().toISOString() };
  }
}
