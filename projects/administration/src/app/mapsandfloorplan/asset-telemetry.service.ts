import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService, environment } from 'shared-ui';

/** Connection of a tag: Online (newest reading online, within 10 min), Offline, Idle (no reading for 10 min) or No data. */
export type TagConnection = 'Online' | 'Offline' | 'Idle' | 'No data';

/** The newest NetworkTimeSeries reading of one tag (Dashboard service). */
export interface TagTelemetry {
  tagId: string;
  /** Assigned to the asset in Tag Management; false for the asset's own RFID / NFC / barcode / tag id. */
  isAssigned: boolean;
  gatewayId: string | null;
  /** Time of the newest reading (UTC ISO); null when the tag has never reported. */
  timestamp: string | null;
  status: string | null;
  connection: TagConnection;
  /** Battery % */
  battery: number | null;
  /** Signal strength in dBm; changes as the asset moves. */
  rssi: number | null;
}

/** GET /api/dashboards/network-status/assets/{id} and each message of its /live WebSocket. */
export interface AssetTelemetry {
  assetRegistrationId: string;
  assetTag: string | null;
  assetName: string | null;
  tags: TagTelemetry[];
}

export type LiveState = 'connecting' | 'live' | 'reconnecting';

/** A state change of a live connection, with the server's latest message when it sent one. */
export interface LiveMessage<T> {
  state: LiveState;
  data?: T;
}

/** A state change of the asset's live connection, with the latest readings when the server sent some. */
export type LiveEvent = LiveMessage<AssetTelemetry>;

/** An asset whose tag a gateway currently hears. */
export interface GatewayAsset {
  /** Asset tag (e.g. TB123) or registration id, as stored on the tag link. */
  assetId: string;
  assetName: string | null;
  tagIds: string[];
  lastSeenAt: string | null;
}

/** GET /api/dashboards/network-status/gateways: per gateway (meta.gatewayid), the assets whose tags it hears now. */
export interface GatewayAssets {
  gatewayId: string;
  /** The number shown on the gateway's map icon. */
  assetCount: number;
  tagCount: number;
  /** Newest reading that came through this gateway (any tag), UTC ISO. */
  lastSeenAt: string | null;
  assets: GatewayAsset[];
  /** Tags heard by the gateway that are not linked to an asset. */
  unlinkedTagIds: string[];
}

/**
 * Live sensor readings of an asset's tags from the Dashboard service, which reads NetworkTimeSeries (written by
 * NetworkerService) and pushes a new message over the WebSocket whenever a reading changes.
 */
@Injectable({ providedIn: 'root' })
export class AssetTelemetryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.dashboardApiUrl}api/dashboards/network-status/assets`;

  /** One-off read of the asset's tags and their latest readings. */
  get(assetId: string): Observable<AssetTelemetry> {
    return this.http.get<AssetTelemetry>(`${this.base}/${encodeURIComponent(assetId)}`);
  }

  /**
   * Live readings over a WebSocket: the server sends the current readings on connect and again on every change.
   * A dropped connection is retried with back-off (1 s, 2 s, 4 s … up to 30 s). Unsubscribing closes the socket.
   * Browsers cannot send headers on a WebSocket, so the sign-in token goes in ?access_token= (the API accepts it there).
   */
  live(assetId: string): Observable<LiveEvent> {
    return this.socket<AssetTelemetry>(`${this.base}/${encodeURIComponent(assetId)}/live`);
  }

  /** Assets per gateway, live: re-sent whenever an asset's tag is heard by another gateway. */
  gatewaysLive(): Observable<LiveMessage<GatewayAssets[]>> {
    return this.socket<GatewayAssets[]>(`${environment.dashboardApiUrl}api/dashboards/network-status/gateways/live`);
  }

  /** Opens a WebSocket that reconnects with back-off; each JSON message is emitted as `data`. */
  private socket<T>(httpUrl: string): Observable<LiveMessage<T>> {
    return new Observable<LiveMessage<T>>((subscriber) => {
      if (typeof WebSocket === 'undefined') {
        subscriber.complete();
        return undefined;
      }

      let socket: WebSocket | null = null;
      let retries = 0;
      let stopped = false;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;

      const connect = () => {
        subscriber.next({ state: retries ? 'reconnecting' : 'connecting' });
        socket = new WebSocket(this.socketUrl(httpUrl));
        socket.onopen = () => {
          retries = 0;
          subscriber.next({ state: 'live' });
        };
        socket.onmessage = (event) => {
          try {
            subscriber.next({ state: 'live', data: JSON.parse(event.data as string) as T });
          } catch {
            // ignore a message that is not JSON
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          if (stopped) return;
          retries++;
          subscriber.next({ state: 'reconnecting' });
          retryTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retries - 1, 5)));
        };
      };

      connect();

      return () => {
        stopped = true;
        clearTimeout(retryTimer);
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000);
      };
    });
  }

  private socketUrl(httpUrl: string): string {
    const url = new URL(httpUrl, typeof window !== 'undefined' ? window.location.href : undefined);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = this.auth.getToken();
    if (token) url.searchParams.set('access_token', token);
    return url.toString();
  }
}
