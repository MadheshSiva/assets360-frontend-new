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

/** Network profiles have no API yet; they are kept for this session only. */
export const PROFILES: NetworkProfile[] = [];
