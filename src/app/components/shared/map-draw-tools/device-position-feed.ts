import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** One location fix for a device, as reported by the location engine / backend. */
export interface DeviceFix {
  deviceId: string;
  lat: number;
  lng: number;
  /** Fix time, epoch ms. */
  at: number;
  /** Accuracy radius, metres. */
  accuracy?: number;
  /** Ground speed, m/s. */
  speed?: number;
}

/**
 * Live device positions for the map drawing tools. Connect the backend either by calling `push()` from a WebSocket /
 * SSE handler, or with `poll(url)` (or the `feedUrl` input of <app-map-draw-tools>). Devices that never get a real fix
 * are simulated by the drawing tools so the map stays alive in demo mode; a device switches to the live feed as soon
 * as its first real fix arrives.
 */
@Injectable({ providedIn: 'root' })
export class DevicePositionFeed {
  private readonly subject = new Subject<DeviceFix>();
  private readonly live = new Set<string>();
  readonly fixes$: Observable<DeviceFix> = this.subject.asObservable();

  push(fix: DeviceFix): void {
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return;
    this.live.add(fix.deviceId);
    this.subject.next(fix);
  }

  /** True once the backend has reported this device. */
  isLive(deviceId: string): boolean {
    return this.live.has(deviceId);
  }

  /**
   * Polls `url` (GET) every `everyMs` for a JSON array of fixes and pushes them. Accepts the field names
   * deviceId | id | device_id, lat | latitude, lng | lon | longitude, at | timestamp | time (epoch ms or ISO),
   * accuracy, speed. Returns a function that stops polling.
   */
  poll(url: string, everyMs = 2000): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const body = (await res.json()) as unknown;
          const rows = Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? []);
          for (const r of rows as Record<string, unknown>[]) {
            const fix = toFix(r);
            if (fix) this.push(fix);
          }
        }
      } catch {
        /* network hiccup: try again on the next cycle */
      }
      if (!stopped) timer = setTimeout(run, everyMs);
    };
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
}

function toFix(r: Record<string, unknown>): DeviceFix | null {
  const id = r['deviceId'] ?? r['id'] ?? r['device_id'];
  const lat = Number(r['lat'] ?? r['latitude']);
  const lng = Number(r['lng'] ?? r['lon'] ?? r['longitude']);
  if (id == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const t = r['at'] ?? r['timestamp'] ?? r['time'];
  const at = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : Date.now();
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return { deviceId: String(id), lat, lng, at: Number.isFinite(at) ? at : Date.now(), accuracy: num(r['accuracy']), speed: num(r['speed']) };
}
