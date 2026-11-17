import { Injectable } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { SEED_ASSETS, SEED_TAG_LINKS, SEED_UNLINKED_TAGS } from './maps.seed';

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
 * DEMO MODE: live sensor readings of asset tags, simulated from static data (maps.seed.ts). A "connection" opens
 * after a short delay, then a new message is pushed every few seconds with fresh timestamps and slightly moving
 * RSSI / battery values, as the real WebSocket feed would. Unsubscribing stops the timers.
 */
@Injectable({ providedIn: 'root' })
export class AssetTelemetryService {
  /** Current battery / RSSI per tag, nudged on every tick so the popup shows changes. */
  private readonly readings = new Map<string, { battery: number; rssi: number }>();

  /** One-off read of the asset's tags and their latest readings. */
  get(assetId: string): Observable<AssetTelemetry> {
    return defer(() => of(this.snapshot(assetId)));
  }

  /** Live readings: the current values on connect, then again every 4 s. */
  live(assetId: string): Observable<LiveEvent> {
    return this.simulate(4000, () => this.snapshot(assetId));
  }

  /** Assets per gateway, live: re-sent every 6 s. */
  gatewaysLive(): Observable<LiveMessage<GatewayAssets[]>> {
    return this.simulate(6000, () => this.gateways());
  }

  /** Emits 'connecting', then 'live' with data after a short delay and on every tick. */
  private simulate<T>(everyMs: number, read: () => T): Observable<LiveMessage<T>> {
    return new Observable<LiveMessage<T>>((subscriber) => {
      subscriber.next({ state: 'connecting' });
      let tick: ReturnType<typeof setInterval> | undefined;
      const open = setTimeout(() => {
        subscriber.next({ state: 'live', data: read() });
        tick = setInterval(() => subscriber.next({ state: 'live', data: read() }), everyMs);
      }, 600);
      return () => {
        clearTimeout(open);
        clearInterval(tick);
      };
    });
  }

  private reading(tagId: string, base: { battery: number; rssi: number }): { battery: number; rssi: number } {
    const prev = this.readings.get(tagId) ?? { battery: base.battery, rssi: base.rssi };
    // RSSI drifts a few dBm around its base value; the battery very slowly drains
    const rssi = Math.max(base.rssi - 6, Math.min(base.rssi + 6, prev.rssi + Math.round(Math.random() * 4 - 2)));
    const battery = Math.max(1, prev.battery - (Math.random() < 0.05 ? 1 : 0));
    const next = { battery, rssi };
    this.readings.set(tagId, next);
    return next;
  }

  private snapshot(assetId: string): AssetTelemetry {
    const key = assetId.toLowerCase();
    const asset = SEED_ASSETS.find((a) => a.assetRegistrationId?.toLowerCase() === key || a.assetTag?.toLowerCase() === key || a.id === assetId);
    const link = SEED_TAG_LINKS.find((l) => l.assetTag.toLowerCase() === (asset?.assetTag ?? assetId).toLowerCase());
    const now = new Date().toISOString();
    const tags: TagTelemetry[] = link
      ? link.tagIds.map((tagId, i) => {
          const r = this.reading(tagId, { battery: link.battery - i * 7, rssi: link.rssi - i * 4 });
          return { tagId, isAssigned: true, gatewayId: link.gatewayId, timestamp: now, status: 'online', connection: 'Online', battery: r.battery, rssi: r.rssi };
        })
      : [
          // the asset's own RFID tag, which no gateway hears
          {
            tagId: `RFID-${(asset?.assetTag ?? assetId).replace(/[^\w]/g, '')}`,
            isAssigned: false,
            gatewayId: null,
            timestamp: null,
            status: null,
            connection: 'No data',
            battery: null,
            rssi: null
          }
        ];
    return {
      assetRegistrationId: asset?.assetRegistrationId ?? assetId,
      assetTag: asset?.assetTag ?? null,
      assetName: asset?.assetName ?? null,
      tags
    };
  }

  private gateways(): GatewayAssets[] {
    const now = new Date().toISOString();
    const ids = [...new Set([...SEED_TAG_LINKS.map((l) => l.gatewayId), ...Object.keys(SEED_UNLINKED_TAGS)])];
    return ids.map((gatewayId) => {
      const links = SEED_TAG_LINKS.filter((l) => l.gatewayId === gatewayId);
      const unlinked = SEED_UNLINKED_TAGS[gatewayId] ?? [];
      return {
        gatewayId,
        assetCount: links.length,
        tagCount: links.reduce((n, l) => n + l.tagIds.length, 0) + unlinked.length,
        lastSeenAt: now,
        assets: links.map((l) => ({ assetId: l.assetTag, assetName: l.assetName, tagIds: [...l.tagIds], lastSeenAt: now })),
        unlinkedTagIds: [...unlinked]
      };
    });
  }
}
