import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { actorName } from '../geofence-alerts/geofence-api.service';
import { LocEvent, LocEventType } from './location-data';

/** GET /api/location-events row. */
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
    ...tenantBody(),
  };
}

/** Recent Location Events: /api/location-events (newest first). */
@Injectable({ providedIn: 'root' })
export class LocationEventApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('location-events');

  list(): Observable<LocEvent[]> {
    return this.http.get<LocationEventDto[]>(this.url, { params: tenantParams() }).pipe(
      map((rows) => rows.map(toLocEvent)),
      catchError((err) => apiError(err, 'Could not load location events.')),
    );
  }

  get(eventId: string): Observable<LocEvent> {
    return this.http.get<LocationEventDto>(`${this.url}/${encodeURIComponent(eventId)}`, { params: tenantParams() }).pipe(
      map(toLocEvent),
      catchError((err) => apiError(err, 'Could not load the location event.')),
    );
  }

  create(e: Omit<LocEvent, 'id'> & { event: LocEventType }): Observable<LocEvent> {
    return this.http.post<LocationEventDto>(this.url, toLocationEventRequest(e, actorName(this.auth)), { params: tenantParams() }).pipe(
      map(toLocEvent),
      catchError((err) => apiError(err, 'Could not save the location event.')),
    );
  }

  update(e: LocEvent & { event: LocEventType }): Observable<LocEvent> {
    return this.http.put<LocationEventDto>(`${this.url}/${encodeURIComponent(e.id)}`, toLocationEventRequest(e, actorName(this.auth)), { params: tenantParams() }).pipe(
      map(toLocEvent),
      catchError((err) => apiError(err, 'Could not update the location event.')),
    );
  }

  delete(eventId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(eventId)}`, { params: tenantParams() }).pipe(
      catchError((err) => apiError(err, 'Could not delete the location event.')),
    );
  }
}
