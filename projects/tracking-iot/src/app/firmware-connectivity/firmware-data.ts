/**
 * Types for Tracking & IoT → Firmware & Connectivity. Everything is loaded from the API:
 * models from /api/firmware-versions, campaigns / sites / gateways derived from /api/iot-devices and /api/device-health.
 */

export type ModelKind = 'sensor' | 'beacon' | 'tracker' | 'vibration' | 'tag';
/** Scheduled = install time still ahead; Running = install time passed, waiting for devices to report the new version. */
export type CampaignStatus = 'Running' | 'Paused' | 'Scheduled' | 'Completed' | 'Cancelled';
export type Health = 'Healthy' | 'Degraded' | 'Offline';
export type Conn = 'Online' | 'Degraded' | 'Offline' | 'Stable';
export type Protocol = 'Wi-Fi / Ethernet' | 'Cellular' | 'LoRaWAN' | 'BLE';

export interface DeviceModel {
  /** API record id. */
  id: string;
  name: string;
  /** Not kept by the API (''). */
  vendor: string;
  kind: ModelKind;
  current: string;
  latest: string;
  devices: number;
  /** Devices of this model reported Online in device health; null when no device of the model has a health record. */
  online: number | null;
  /** yyyy-MM-dd or ''. */
  releaseDate: string;
  notes: string[];
  updateAvailable: boolean;
}

/**
 * A firmware rollout: the devices of one model with an update to the same version scheduled
 * (PUT /api/device-configurations/{deviceId}/firmware/schedule). The API has no campaign record of its own.
 */
export interface Campaign {
  id: string;
  name: string;
  /** Firmware-inventory model ids. */
  models: string[];
  /** Earliest scheduled install time (ISO). */
  started: string;
  status: CampaignStatus;
  target: number;
  /** Devices of the model already reporting the target version. */
  updated: number;
  /** Not reported by the API. */
  failed: number | null;
  window: string;
  targetVersion: string;
  /** Devices still waiting for the update. */
  pendingDeviceIds: string[];
}

export interface Site {
  code: string;
  name: string;
  /** % of the site's devices with a health record that are Online; null without health records. */
  health: number | null;
  gateways: number;
  online: number;
  issues: number;
}

export interface Gateway {
  id: string;
  site: string;
  /** Connectivity the device registry gives (e.g. LoRaWAN, Cellular, Ethernet). */
  protocol: string;
  model: string;
  conn: Conn | null;
  lastSeenMin: number | null;
  rssi: number | null;
  devices: number;
  firmware: string;
}

export interface NetworkProfile {
  id: string;
  name: string;
  type: Protocol;
  detail: string;
  security: string;
  sites: string[];
  devices: number;
  active: boolean;
}

/** Network profiles (static demo data; changes are kept for this session only). */
export const PROFILES: NetworkProfile[] = [
  { id: 'NP-01', name: 'LoRaWAN IN865 – Plants', type: 'LoRaWAN', detail: 'IN865 · OTAA · ADR on · Class A', security: 'AES-128 (AppKey / NwkKey)', sites: ['SITE-CHN-01', 'SITE-PUN-01', 'SITE-HYD-01', 'SITE-BLR-01'], devices: 17, active: true },
  { id: 'NP-02', name: 'LoRaWAN EU868 – Jebel Ali', type: 'LoRaWAN', detail: 'EU868 · OTAA · ADR on · Class A', security: 'AES-128 (AppKey / NwkKey)', sites: ['SITE-DXB-01'], devices: 2, active: true },
  { id: 'NP-03', name: 'BLE Indoor Positioning', type: 'BLE', detail: 'BLE 5.0 · 1 s advertising · Tx −8 dBm', security: 'Secure shuffling (rotating IDs)', sites: ['SITE-CHN-01', 'SITE-BLR-01', 'SITE-PUN-01', 'SITE-HYD-01'], devices: 11, active: true },
  { id: 'NP-04', name: 'Fleet LTE APN', type: 'Cellular', detail: 'APN iot.fleet.in · LTE Cat-1 / Cat-M1', security: 'Private APN + TLS 1.2 (MQTT)', sites: ['SITE-BLR-01', 'SITE-HYD-01', 'SITE-PUN-01'], devices: 4, active: true },
  { id: 'NP-05', name: 'OT Network (Readers)', type: 'Wi-Fi / Ethernet', detail: 'VLAN 140 · PoE+ · LLRP 5084', security: '802.1X (EAP-TLS)', sites: ['SITE-CHN-01', 'SITE-BLR-01'], devices: 2, active: true },
  { id: 'NP-06', name: 'Legacy 3G Trackers', type: 'Cellular', detail: 'WCDMA · APN legacy.m2m', security: 'Public APN + TLS 1.0', sites: [], devices: 0, active: false },
];
