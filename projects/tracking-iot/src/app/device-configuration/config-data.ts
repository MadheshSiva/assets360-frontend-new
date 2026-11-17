/* Types for Device Configuration. Everything is loaded from /api/device-configurations and /api/iot-devices. */

/** Protocol family that decides which connectivity fields the page shows. */
export type ProtocolKind = 'LoRaWAN' | 'BLE' | 'Cellular' | 'Other';
export type ParamIcon = 'temp' | 'hum' | 'battery' | 'rssi' | 'snr' | 'vib' | 'accel' | 'speed' | 'volt' | 'ign';
/** API version lifecycle: Draft → Queued (applied, waiting for check-in) → Applied (confirmed) → Superseded. */
export type VersionStatus = 'Draft' | 'Queued' | 'Applied' | 'Superseded';

export interface TelemetryParam {
  /** The parameter name; alert rules refer to it. */
  key: string;
  name: string;
  icon: ParamIcon;
  /** sensor = Measurement (shown on Connectivity tab and preview); diag = Diagnostic. */
  kind: 'sensor' | 'diag';
  unit: string;
  units: string[];
  enabled: boolean;
  agg: string;
  /** Minimum change that triggers an uplink; null when not set. */
  threshold: number | null;
}

export interface AlertRule {
  /** API ruleId; '' for a rule not saved yet. */
  id: string;
  param: string;
  cond: string;
  value: number;
  unit: string | null;
  severity: string;
  notify: string[];
  enabled: boolean;
}

/** The editable settings of a configuration version (what the tabs show). */
export interface DeviceConfig {
  protocol: string;
  // LoRaWAN
  region: string;
  joinMode: string;
  appEui: string;
  devEui: string;
  confirmed: boolean;
  adr: boolean;
  dataRate: string;
  // common
  interval: number;
  intervalUnit: string;
  sampling: number;
  batteryReporting: boolean;
  batteryInterval: string;
  params: TelemetryParam[];
  alerts: AlertRule[];
}

/** A row of History → Configuration Versions. Settings are loaded on demand (View changes). */
export interface ConfigVersion {
  v: number;
  status: VersionStatus;
  createdBy: string;
  created: string | null;
  applied: string | null;
  confirmed: string | null;
  note: string;
}

export interface HistoryEvent {
  at: string;
  by: string;
  text: string;
  version: number;
}

/** A device option of the Device dropdown (GET /api/iot-devices). */
export interface DeviceOption {
  id: string;
  label: string;
  type: string;
  /** Connectivity from the device registry (e.g. LoRaWAN 1.0.3). */
  protocol: string;
}

/** The selected device (GET /api/device-configurations/{deviceId}). */
export interface Device {
  id: string;
  name: string;
  type: string;
  model: string;
  protocol: string;
  protocolKind: ProtocolKind;
  gateway: string | null;
  asset: string | null;
  status: string | null;
  lastSeen: string | null;
  battery: number | null;
  rssi: number | null;
  snr: number | null;
  firmware: string | null;
  latestFirmware: string | null;
  updateAvailable: boolean;
  latestReleaseDate: string | null;
  /** Lowest firmware that supports this configuration schema. */
  minFirmware: string | null;
  isCompatible: boolean | null;
  releaseNotes: string[];
  firmwareTarget: { version: string; when: string | null } | null;
}

export function protocolKind(protocol: string | null | undefined): ProtocolKind {
  const p = (protocol ?? '').toLowerCase();
  if (p.includes('lora')) return 'LoRaWAN';
  if (p.includes('ble') || p.includes('bluetooth')) return 'BLE';
  if (p.includes('cell') || p.includes('lte') || p.includes('nb-iot') || p.includes('gsm') || p.includes('4g') || p.includes('5g')) return 'Cellular';
  return 'Other';
}

/** Blank configuration used before a device is loaded. */
export function blankConfig(): DeviceConfig {
  return {
    protocol: '', region: '', joinMode: '', appEui: '', devEui: '', confirmed: false, adr: false, dataRate: '',
    interval: 5, intervalUnit: 'minutes', sampling: 60, batteryReporting: false, batteryInterval: '', params: [], alerts: [],
  };
}
