/**
 * Static demo IoT device registry (what /api/iot-devices returned). This array is the in-memory store every page
 * reads: IoT Device Management edits it, the other pages (health, configuration, firmware, telemetry, analytics,
 * replacement, maintenance, sensors) look devices up in it. Changes last until the page is reloaded.
 */
import { assetByRef, siteById } from '../shared/master-data.data';
import { hashOf, isoDaysAgo, isoMinutesAgo } from '../shared/tracking-api';
import { modelByNumber } from '../device-type-model/device-models.data';
import type { IoTDeviceDto } from './iot-device-api.service';

/** Connection state the demo keeps per device (drives last seen, health records and status). */
export type DemoConn = 'Online' | 'Warning' | 'Offline';

interface DeviceSpec {
  id: string;
  name: string;
  model: string;
  asset: string | null;
  site: string;
  gateway: string | null;
  battery: number | null;
  /** Minutes since the last message. */
  seenMin: number;
  conn: DemoConn;
  health: 'Good' | 'Warning' | 'Critical';
  firmware: string;
  installedDays: number;
  rssi: number;
}

const S: DeviceSpec[] = [
  // gateways
  { id: 'GW-CHN-01', name: 'Chennai LoRaWAN Gateway (Roof)', model: 'UG65', asset: null, site: 'SITE-CHN-01', gateway: null, battery: null, seenMin: 0.4, conn: 'Online', health: 'Good', firmware: '2.4.3', installedDays: 540, rssi: -58 },
  { id: 'GW-CHN-02', name: 'Chennai BLE Gateway (Warehouse)', model: 'Portal Beam', asset: null, site: 'SITE-CHN-01', gateway: null, battery: null, seenMin: 0.6, conn: 'Online', health: 'Good', firmware: '1.6.2', installedDays: 342, rssi: -52 },
  { id: 'GW-BLR-01', name: 'Bengaluru LoRaWAN Gateway', model: 'UG65', asset: null, site: 'SITE-BLR-01', gateway: null, battery: null, seenMin: 0.3, conn: 'Online', health: 'Good', firmware: '2.4.3', installedDays: 498, rssi: -61 },
  { id: 'GW-BLR-02', name: 'Bengaluru BLE Gateway (Main Warehouse)', model: 'Portal Beam', asset: null, site: 'SITE-BLR-01', gateway: null, battery: null, seenMin: 0.8, conn: 'Online', health: 'Good', firmware: '1.5.1', installedDays: 330, rssi: -55 },
  { id: 'GW-PUN-01', name: 'Pune LoRaWAN Gateway', model: 'UG65', asset: null, site: 'SITE-PUN-01', gateway: null, battery: null, seenMin: 0.5, conn: 'Online', health: 'Good', firmware: '2.3.0', installedDays: 455, rssi: -63 },
  { id: 'GW-PUN-02', name: 'Pune BLE Gateway (Assembly Hall)', model: 'Portal Beam', asset: null, site: 'SITE-PUN-01', gateway: null, battery: null, seenMin: 1.1, conn: 'Online', health: 'Good', firmware: '1.6.2', installedDays: 301, rssi: -57 },
  { id: 'GW-HYD-01', name: 'Hyderabad LoRaWAN Gateway', model: 'UG65', asset: null, site: 'SITE-HYD-01', gateway: null, battery: null, seenMin: 0.7, conn: 'Online', health: 'Good', firmware: '2.4.3', installedDays: 276, rssi: -60 },
  { id: 'GW-HYD-02', name: 'Hyderabad BLE Gateway (Ante Room)', model: 'Portal Beam', asset: null, site: 'SITE-HYD-01', gateway: null, battery: null, seenMin: 0.9, conn: 'Online', health: 'Good', firmware: '1.6.2', installedDays: 240, rssi: -54 },
  { id: 'GW-DXB-01', name: 'Jebel Ali LoRaWAN Gateway', model: 'UG65', asset: null, site: 'SITE-DXB-01', gateway: null, battery: null, seenMin: 0.5, conn: 'Online', health: 'Good', firmware: '2.4.3', installedDays: 190, rssi: -62 },
  // vehicle and mobile asset trackers
  { id: 'TRK-1001', name: 'Truck KA-01-AB-4521 Tracker', model: 'FMC130', asset: 'REG-000203', site: 'SITE-BLR-01', gateway: null, battery: 100, seenMin: 1, conn: 'Online', health: 'Good', firmware: '3.29.4', installedDays: 388, rssi: -71 },
  { id: 'TRK-1002', name: 'Truck KA-01-AC-1187 Tracker', model: 'FMC130', asset: 'REG-000204', site: 'SITE-BLR-01', gateway: null, battery: 96, seenMin: 2, conn: 'Online', health: 'Good', firmware: '3.28.1', installedDays: 365, rssi: -79 },
  { id: 'TRK-1003', name: 'Reefer Truck TS-09-UC-7734 Tracker', model: 'FMC130', asset: 'REG-000403', site: 'SITE-HYD-01', gateway: null, battery: 100, seenMin: 1, conn: 'Online', health: 'Warning', firmware: '3.29.4', installedDays: 214, rssi: -83 },
  { id: 'TRK-1004', name: 'Tool Cart TC-11 Tracker', model: 'TMT250', asset: 'REG-000305', site: 'SITE-PUN-01', gateway: null, battery: 12, seenMin: 22, conn: 'Warning', health: 'Critical', firmware: '2.3.1', installedDays: 260, rssi: -94 },
  // BLE asset tags
  { id: 'BLE-2001', name: 'Forklift FL-07 Tag', model: 'Asset Tag 2', asset: 'REG-000101', site: 'SITE-CHN-01', gateway: 'GW-CHN-02', battery: 78, seenMin: 0.2, conn: 'Online', health: 'Good', firmware: '2.6.1', installedDays: 330, rssi: -67 },
  { id: 'BLE-2002', name: 'Forklift FL-12 Tag', model: 'Asset Tag 2', asset: 'REG-000102', site: 'SITE-CHN-01', gateway: 'GW-CHN-02', battery: 64, seenMin: 0.3, conn: 'Online', health: 'Good', firmware: '2.6.1', installedDays: 330, rssi: -72 },
  { id: 'BLE-2003', name: 'Reach Truck RT-21 Tag', model: 'Asset Tag 2', asset: 'REG-000201', site: 'SITE-BLR-01', gateway: 'GW-BLR-02', battery: 91, seenMin: 0.4, conn: 'Online', health: 'Good', firmware: '2.5.0', installedDays: 128, rssi: -69 },
  { id: 'BLE-2004', name: 'Pallet Jack PJ-33 Tag', model: 'Asset Tag 2', asset: 'REG-000202', site: 'SITE-BLR-01', gateway: 'GW-BLR-02', battery: 17, seenMin: 0.6, conn: 'Online', health: 'Warning', firmware: '2.5.0', installedDays: 612, rssi: -81 },
  { id: 'BLE-2005', name: 'AGV Tugger AGV-04 Tag', model: 'Asset Tag 2', asset: 'REG-000304', site: 'SITE-PUN-01', gateway: 'GW-PUN-02', battery: 83, seenMin: 0.2, conn: 'Online', health: 'Good', firmware: '2.6.1', installedDays: 175, rssi: -64 },
  { id: 'BLE-2006', name: 'Forklift FL-41 Tag', model: 'Asset Tag 2', asset: 'REG-000405', site: 'SITE-HYD-01', gateway: 'GW-HYD-02', battery: 58, seenMin: 0.5, conn: 'Online', health: 'Good', firmware: '2.6.1', installedDays: 233, rssi: -70 },
  { id: 'BLE-2007', name: 'Spare Asset Tag (Jebel Ali)', model: 'Asset Tag 2', asset: null, site: 'SITE-DXB-01', gateway: null, battery: 31, seenMin: 5760, conn: 'Offline', health: 'Warning', firmware: '2.3.0', installedDays: 402, rssi: -96 },
  // environmental (temperature / humidity) sensors
  { id: 'TMP-3001', name: 'Cold Room CR-01 Temp/Humidity', model: 'EM300-TH', asset: 'REG-000401', site: 'SITE-HYD-01', gateway: 'GW-HYD-01', battery: 88, seenMin: 4, conn: 'Online', health: 'Good', firmware: '1.3.2', installedDays: 270, rssi: -88 },
  { id: 'TMP-3002', name: 'Cold Room CR-02 Temp/Humidity', model: 'EM300-TH', asset: 'REG-000402', site: 'SITE-HYD-01', gateway: 'GW-HYD-01', battery: 86, seenMin: 6, conn: 'Online', health: 'Good', firmware: '1.3.2', installedDays: 270, rssi: -86 },
  { id: 'TMP-3003', name: 'Process Chiller CH-01 Supply Temp', model: 'EM300-TH', asset: 'REG-000108', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: 72, seenMin: 3, conn: 'Online', health: 'Good', firmware: '1.2.0', installedDays: 452, rssi: -91 },
  { id: 'TMP-3004', name: 'Reefer Container RC-02 Temp', model: 'EM300-TH', asset: 'REG-000502', site: 'SITE-DXB-01', gateway: 'GW-DXB-01', battery: 54, seenMin: 7, conn: 'Online', health: 'Good', firmware: '1.3.2', installedDays: 150, rssi: -99 },
  { id: 'TMP-3005', name: 'DG-01 Enclosure Temp', model: 'EM300-TH', asset: 'REG-000105', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: 41, seenMin: 38, conn: 'Warning', health: 'Warning', firmware: '1.1.0', installedDays: 505, rssi: -104 },
  // condition (vibration) sensors
  { id: 'VIB-4001', name: 'Pump P-14 Vibration', model: 'WISE-2410', asset: 'REG-000104', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: 67, seenMin: 5, conn: 'Online', health: 'Critical', firmware: '2.2.1', installedDays: 410, rssi: -89 },
  { id: 'VIB-4002', name: 'Compressor AC-03 Vibration', model: 'WISE-2410', asset: 'REG-000103', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: 59, seenMin: 9, conn: 'Online', health: 'Warning', firmware: '2.1.0', installedDays: 410, rssi: -92 },
  { id: 'VIB-4003', name: 'VMC-02 Spindle Vibration', model: 'WISE-2410', asset: 'REG-000106', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: 81, seenMin: 4, conn: 'Online', health: 'Good', firmware: '2.2.1', installedDays: 220, rssi: -84 },
  { id: 'VIB-4004', name: 'Welding Robot WR-01 Vibration', model: 'WISE-2410', asset: 'REG-000301', site: 'SITE-PUN-01', gateway: 'GW-PUN-01', battery: 76, seenMin: 8, conn: 'Online', health: 'Good', firmware: '2.2.1', installedDays: 198, rssi: -87 },
  { id: 'VIB-4005', name: 'Compressor AC-07 Vibration', model: 'WISE-2410', asset: 'REG-000302', site: 'SITE-PUN-01', gateway: 'GW-PUN-01', battery: 9, seenMin: 545, conn: 'Offline', health: 'Critical', firmware: '2.0.0', installedDays: 690, rssi: -112 },
  { id: 'VIB-4006', name: 'Conveyor CV-01 Drive Vibration', model: 'WISE-2410', asset: 'REG-000205', site: 'SITE-BLR-01', gateway: 'GW-BLR-01', battery: 70, seenMin: 6, conn: 'Online', health: 'Good', firmware: '2.2.1', installedDays: 160, rssi: -85 },
  // energy meters
  { id: 'EMT-5001', name: 'IMM-05 Energy Meter', model: 'SDM630-LoRa', asset: 'REG-000107', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: null, seenMin: 2, conn: 'Online', health: 'Good', firmware: '1.2.0', installedDays: 240, rssi: -80 },
  { id: 'EMT-5002', name: 'Chiller CH-01 Energy Meter', model: 'SDM630-LoRa', asset: 'REG-000108', site: 'SITE-CHN-01', gateway: 'GW-CHN-01', battery: null, seenMin: 3, conn: 'Online', health: 'Good', firmware: '1.1.0', installedDays: 240, rssi: -82 },
  { id: 'EMT-5003', name: 'Standby Generator DG-05 Energy Meter', model: 'SDM630-LoRa', asset: 'REG-000404', site: 'SITE-HYD-01', gateway: 'GW-HYD-01', battery: null, seenMin: 12, conn: 'Online', health: 'Warning', firmware: '1.2.0', installedDays: 120, rssi: -90 },
  // RFID portals
  { id: 'RFR-6001', name: 'Dock Door 3 RFID Portal', model: 'FX9600', asset: null, site: 'SITE-BLR-01', gateway: null, battery: null, seenMin: 0.2, conn: 'Online', health: 'Good', firmware: '3.18.2', installedDays: 610, rssi: -45 },
  { id: 'RFR-6002', name: 'Dispatch Gate RFID Portal', model: 'FX9600', asset: null, site: 'SITE-CHN-01', gateway: null, battery: null, seenMin: 0.3, conn: 'Online', health: 'Good', firmware: '3.16.0', installedDays: 575, rssi: -48 },
];

/** Minutes since the last message, per device id (kept current on every read, so online devices stay online). */
export const LAST_SEEN_MIN: Record<string, number> = Object.fromEntries(S.map((s) => [s.id, s.seenMin]));
/** Connection state per device id. */
export const DEVICE_CONN: Record<string, DemoConn> = Object.fromEntries(S.map((s) => [s.id, s.conn]));
/** Signal strength per device id, dBm. */
export const DEVICE_RSSI: Record<string, number> = Object.fromEntries(S.map((s) => [s.id, s.rssi]));

function serialOf(model: string, id: string): string {
  const h = String(hashOf(id)).padStart(10, '0');
  if (model === 'FMC130' || model === 'TMT250') return `86427507${h.slice(0, 7)}`;
  if (model === 'Asset Tag 2') return `KTAG2-${h.slice(0, 6)}`;
  if (model === 'FX9600') return `FX96${h.slice(0, 8)}`;
  if (model === 'SDM630-LoRa') return `SDM${h.slice(0, 9)}`;
  if (model === 'WISE-2410') return `AKW${h.slice(0, 8)}`;
  if (model === 'Portal Beam') return `PB-${h.slice(0, 8)}`;
  return `6136${h.slice(0, 6)}`;
}

function build(s: DeviceSpec): IoTDeviceDto {
  const m = modelByNumber(s.model);
  const a = assetByRef(s.asset);
  const site = siteById(s.site);
  const created = isoDaysAgo(s.installedDays);
  return {
    id: `6600c3d2a1b4e5${String(hashOf(s.id) % 10_000_000_000).padStart(10, '0')}`,
    deviceId: s.id,
    deviceName: s.name,
    deviceType: m?.deviceType ?? 'Sensor',
    model: s.model,
    serialNumber: serialOf(s.model, s.id),
    connectivity: m?.protocol ?? m?.connectivity ?? '',
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    assetRegistrationId: a?.regId ?? null,
    assetCode: a?.tag ?? null,
    assetName: a?.name ?? null,
    gateway: s.gateway,
    powerSource: m?.powerSource ?? 'Battery (replaceable)',
    batteryLevel: s.battery,
    lastSeenAt: isoMinutesAgo(s.seenMin),
    health: s.health,
    firmwareVersion: s.firmware,
    pendingFirmwareVersion: null,
    firmwareUpdateScheduledAt: null,
    createdBy: s.installedDays > 300 ? 'arjun.mehta' : 'priya.raman',
    createdAt: created,
    updatedBy: s.installedDays > 200 ? 'kavya.nair' : null,
    updatedAt: s.installedDays > 200 ? isoDaysAgo(Math.round(s.installedDays / 3)) : null,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
    status: s.conn === 'Offline' ? 'Offline' : 'Online',
    batteryPercent: s.battery,
    lowBattery: s.battery !== null && s.battery < 20,
    signalDbm: s.rssi,
    modelDisplayName: m ? `${m.manufacturer} ${m.modelNumber}` : s.model,
  };
}

/** Firmware updates already scheduled (device id → target version, hours from now; negative = rolling out now). */
const PENDING_FIRMWARE: Record<string, [string, number]> = {
  'GW-PUN-01': ['2.4.3', 20],
  'VIB-4002': ['2.2.1', -2],
  'TMP-3003': ['1.3.2', -2],
  'TMP-3005': ['1.3.2', -2],
  'TRK-1002': ['3.29.4', 44],
};

/** The in-memory device registry. */
export const IOT_DEVICES: IoTDeviceDto[] = S.map((s) => {
  const d = build(s);
  const p = PENDING_FIRMWARE[s.id];
  if (p) {
    d.pendingFirmwareVersion = p[0];
    d.firmwareUpdateScheduledAt = new Date(Math.round((Date.now() + p[1] * 3_600_000) / 900_000) * 900_000).toISOString();
  }
  return d;
});

/** The registry with last-seen times moved up to now (devices keep the same "minutes ago"). */
export function liveDevices(): IoTDeviceDto[] {
  const now = Date.now();
  for (const d of IOT_DEVICES) {
    const min = LAST_SEEN_MIN[d.deviceId];
    if (min !== undefined) d.lastSeenAt = isoMinutesAgo(min, now);
  }
  return IOT_DEVICES;
}

export function deviceById(deviceId: string | null | undefined): IoTDeviceDto | undefined {
  const id = (deviceId ?? '').trim().toLowerCase();
  return IOT_DEVICES.find((d) => d.deviceId.toLowerCase() === id);
}

/** Device types in use, sorted. */
export function deviceTypesInUse(): string[] {
  return [...new Set(IOT_DEVICES.map((d) => d.deviceType))].sort();
}
