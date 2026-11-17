/* IoT Device Management: types, option lists and the device list loaded from /api/iot-devices (iot-device-api.service.ts). */

import type { IoTDeviceDto } from './iot-device-api.service';

/** Device type text as the API stores it (from the model catalogue), e.g. "Asset Tracker" or "BLE Tracker". */
export type DeviceType = string;
export type Conn = 'Online' | 'Offline' | 'Pending';
export type Health = 'Good' | 'Warning' | 'Critical';
export type Power = 'Battery' | 'External' | 'PoE';
/** Connectivity / protocol text as the API stores it, e.g. "BLE 5.0" or "LoRaWAN". */
export type Protocol = string;
export type Level = 'red' | 'amber' | 'green' | 'purple' | 'grey';

/** code: asset tag (or registration id); registrationId: set for assets picked from the asset register. */
export interface LinkedAsset { name: string; code: string; registrationId?: string }

export interface DevEvent { at: number; title: string; detail: string; level: Level }

export interface DeviceSettings { intervalMin: number; lowBattery: number; offlineAfterMin: number; alerts: boolean }

export type HealthRange = '24h' | '7d';

export interface HealthPoint { at: number; rssi: number | null; battery: number | null; msgs: number }

export interface Device {
  id: string;
  /** Display name, e.g. "BLE Beacon". */
  name: string;
  type: DeviceType;
  model: string;
  serial: string;
  /** Only cellular trackers have an IMEI (not recorded by the API). */
  imei: string;
  protocol: Protocol;
  /** Derived from the last message: Pending until the first one, Offline after the offline window. */
  conn: Conn;
  health: Health;
  asset: LinkedAsset | null;
  site: string;
  /** Gateway id, or "Cellular" for devices that report over the mobile network. */
  gateway: string;
  power: Power;
  /** Battery %, null when powered externally / PoE or not reported yet. */
  battery: number | null;
  /** Signal strength (dBm); null when not reported (the API has none). */
  rssi: number | null;
  /** Seconds since the last message; null for a device that has never reported. */
  lastSeenSec: number | null;
  firmware: string;
  installedDaysAgo: number;
  /** Page-only settings (kept for this session). */
  settings: DeviceSettings;
  /** Device events (and changes made on this page), newest first. */
  log: DevEvent[];
  /** Type-specific values of the latest payload, when reported. */
  payload?: { k: string; v: string }[];
  /** Last few messages, newest first, when reported. */
  messages?: { at: number; rssi: number }[];
  /** Signal / battery / message buckets for the health chart, per range, when reported. */
  healthSeries?: Partial<Record<HealthRange, HealthPoint[]>>;
  /** The record as the API returned it (fields the page does not edit are sent back unchanged). */
  api?: IoTDeviceDto;
}

/** Sites (master data, gateways and devices) with their master-data id and gateways. */
export const SITES: { name: string; id: string; gateways: string[] }[] = [];

/** Adds a site (and gateway) the pickers do not list yet. */
export function ensureSite(name: string, id: string | null | undefined, gateway = ''): void {
  if (!name) return;
  let site = SITES.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!site) SITES.push((site = { name, id: id ?? '', gateways: [] }));
  else if (!site.id && id) site.id = id;
  if (gateway && gateway !== 'Cellular' && !site.gateways.includes(gateway)) site.gateways.push(gateway);
}

/** Device types offered (GET /api/iot-devices/device-types plus the types of loaded devices). */
export const TYPES: DeviceType[] = [];
export const CONNS: Conn[] = ['Online', 'Offline', 'Pending'];
export const HEALTHS: Health[] = ['Good', 'Warning', 'Critical'];

/** Selectable model numbers per device type (GET /api/iot-devices/models). */
export const MODELS_BY_TYPE: Record<string, string[]> = {};

/** True for devices that report over the mobile network rather than through a gateway. */
export function isCellular(type: string, protocol: string): boolean {
  return type === 'GPS / Cellular' || /cellular|lte|nb-iot|4g|5g/i.test(protocol);
}

/** Which KPI a device counts towards. */
export function bucketOf(d: Device): 'online' | 'offline' | 'attention' | 'pending' {
  if (d.conn === 'Pending') return 'pending';
  if (d.conn !== 'Online') return 'offline';
  return d.health === 'Good' ? 'online' : 'attention';
}

/** Devices loaded from the API. */
export const DEVICES: Device[] = [];

/** Asset codes in use, for the link picker. */
export function knownAssets(): LinkedAsset[] {
  const map = new Map<string, LinkedAsset>();
  for (const d of DEVICES) if (d.asset && !map.has(d.asset.code)) map.set(d.asset.code, d.asset);
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
