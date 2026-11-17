/** Static demo device health records (one per registered device), built from the demo device registry. */
import { DEVICE_CONN, DEVICE_RSSI, IOT_DEVICES, LAST_SEEN_MIN } from '../device-management/iot-devices.data';
import { isoMinutesAgo, seeded } from '../shared/tracking-api';
import type { ApiHealth, ApiPowerSource, DeviceHealthDto } from './device-health-api.service';

export function signalQualityOf(dbm: number | null): DeviceHealthDto['signalQuality'] {
  if (dbm === null) return null;
  return dbm >= -70 ? 'Strong' : dbm >= -85 ? 'Good' : dbm >= -100 ? 'Fair' : 'Poor';
}

export function powerOf(source: string | null | undefined): ApiPowerSource {
  const s = (source ?? '').toLowerCase();
  return s.startsWith('battery') ? 'Battery' : s.startsWith('poe') ? 'PoE' : 'External power';
}

/** Devices whose health record says they are booked for maintenance. */
const IN_MAINTENANCE = new Set(['EMT-5003']);

function healthOf(deviceHealth: string | null, deviceId: string): ApiHealth {
  if (IN_MAINTENANCE.has(deviceId)) return 'Maintenance';
  return deviceHealth === 'Critical' ? 'Critical' : deviceHealth === 'Warning' ? 'Attention' : 'Healthy';
}

/** The in-memory health records. */
export const DEVICE_HEALTH: DeviceHealthDto[] = IOT_DEVICES.map((d, i) => {
  const rssi = DEVICE_RSSI[d.deviceId] ?? null;
  const lora = /lora/i.test(d.connectivity);
  return {
    id: `6611d4e3b2c5f6${String(1000 + i).padStart(10, '0')}`,
    deviceId: d.deviceId,
    deviceModel: d.model,
    assetRegistrationId: d.assetRegistrationId,
    assetName: d.assetName,
    siteId: d.siteId,
    siteName: d.siteName,
    gateway: d.gateway,
    connectivity: DEVICE_CONN[d.deviceId] ?? 'Online',
    signalStrengthDbm: rssi,
    snrDb: lora && rssi !== null ? Math.round((12 + (rssi + 90) * 0.35 + seeded(d.deviceId) * 2) * 10) / 10 : null,
    signalQuality: signalQualityOf(rssi),
    powerSource: powerOf(d.powerSource),
    batteryLevel: d.batteryLevel,
    lastSeenAt: d.lastSeenAt,
    health: healthOf(d.health, d.deviceId),
    createdBy: 'system',
    createdAt: d.createdAt,
  };
});

/** Health records with last-seen times kept current (same "minutes ago" as the device registry). */
export function liveHealth(): DeviceHealthDto[] {
  const now = Date.now();
  for (const h of DEVICE_HEALTH) {
    const min = LAST_SEEN_MIN[h.deviceId];
    if (min !== undefined) h.lastSeenAt = isoMinutesAgo(min, now);
  }
  return DEVICE_HEALTH;
}
