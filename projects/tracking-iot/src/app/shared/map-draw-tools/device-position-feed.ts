import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** One location fix for a device. */
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
 * Device positions for the map drawing tools. Static demo: there is no live feed; fixes can be pushed in-app with
 * `push()`. Devices that never get a fix stay where they were placed and are simulated.
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

  /** True once a fix has been pushed for this device. */
  isLive(deviceId: string): boolean {
    return this.live.has(deviceId);
  }
}
