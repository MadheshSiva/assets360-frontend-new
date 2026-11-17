/* Types, option lists and the model catalogue for Device Type & Model. Models come from /api/device-models (device-model-api.service.ts);
   the option lists are replaced by GET /api/device-models/form-options on load. */

import type { DeviceModelDto } from './device-model-api.service';

export type ModelStatus = 'Active' | 'Draft' | 'Retired';
export type Connectivity = 'LoRaWAN' | 'BLE' | 'Wi-Fi' | 'Cellular' | 'Ethernet';
/** Thumbnail illustration drawn for a model. */
export type FormFactor = 'box' | 'cylinder' | 'beacon' | 'gateway' | 'reader' | 'tracker' | 'meter';
export type TypeIcon = 'tracker' | 'env' | 'condition' | 'gateway' | 'rfid' | 'beacon' | 'meter' | 'counter' | 'chip';

export interface DeviceType {
  id: string;
  name: string;
  icon: TypeIcon;
  form: FormFactor;
  description: string;
}

export interface DeviceModel {
  id: string;
  name: string;
  manufacturer: string;
  typeId: string;
  connectivity: Connectivity[];
  protocol: string;
  measurements: string[];
  power: string;
  bands: string[];
  ipRating: string;
  batteryLife: string;
  opTemp: string;
  fwMin: string;
  fwMax: string;
  status: ModelStatus;
  attributes: string[];
  /** IoT devices registered against this model (each device is its own record). */
  deployed: number;
  form?: FormFactor;
  /** The record as the API returned it. */
  api?: DeviceModelDto;
}

export interface Measurement {
  name: string;
  short: string;
  unit: string;
}

export const STATUSES: ModelStatus[] = ['Active', 'Draft', 'Retired'];
export const CONNECTIVITY: Connectivity[] = ['LoRaWAN', 'BLE', 'Wi-Fi', 'Cellular', 'Ethernet'];
export const FORMS: { id: FormFactor; label: string }[] = [
  { id: 'box', label: 'Sensor box' }, { id: 'cylinder', label: 'Cylinder' }, { id: 'beacon', label: 'Beacon disc' },
  { id: 'gateway', label: 'Gateway' }, { id: 'reader', label: 'Reader panel' }, { id: 'tracker', label: 'Tracker' }, { id: 'meter', label: 'Meter' },
];
export const TYPE_ICONS: TypeIcon[] = ['tracker', 'env', 'condition', 'gateway', 'rfid', 'beacon', 'meter', 'counter', 'chip'];
/** The API only accepts these power sources (GET /api/device-models/power-sources). */
export const POWER_OPTIONS = ['Battery (replaceable)', 'Battery (rechargeable)', 'External power', 'PoE'];

/** Nearest accepted power source for a free-text one (e.g. "PoE+ (802.3at)" → "PoE"). */
export function normalizePower(power: string): string {
  if (POWER_OPTIONS.includes(power)) return power;
  const p = power.toLowerCase();
  const pick = p.includes('recharge') ? 'Battery (rechargeable)' : p.startsWith('battery') ? 'Battery (replaceable)' : p.startsWith('poe') ? 'PoE' : 'External power';
  return POWER_OPTIONS.includes(pick) ? pick : POWER_OPTIONS[0] ?? power;
}

export const MEASUREMENTS: Measurement[] = [
  { name: 'Temperature', short: 'Temperature', unit: '°C' },
  { name: 'Humidity', short: 'Humidity', unit: '%RH' },
  { name: 'Vibration', short: 'Vibration', unit: 'mm/s' },
  { name: 'Battery', short: 'Battery', unit: '%' },
  { name: 'Atmospheric Pressure', short: 'Pressure', unit: 'hPa' },
  { name: 'CO₂', short: 'CO₂', unit: 'ppm' },
  { name: 'TVOC', short: 'TVOC', unit: 'ppb' },
  { name: 'Light', short: 'Light', unit: 'lux' },
  { name: 'Door/Window State', short: 'Door/Window State', unit: 'open/closed' },
  { name: 'Water Leak', short: 'Water Leak', unit: 'yes/no' },
  { name: 'Tilt', short: 'Tilt', unit: '°' },
  { name: 'Location', short: 'Location', unit: 'GNSS' },
  { name: 'Motion', short: 'Motion', unit: 'g' },
  { name: 'Tag Reads', short: 'Tag Reads', unit: 'reads/s' },
  { name: 'RSSI', short: 'RSSI', unit: 'dBm' },
  { name: 'Uplink Packets', short: 'Uplinks', unit: 'pkt/min' },
  { name: 'Energy', short: 'Energy', unit: 'kWh' },
  { name: 'People Count', short: 'People Count', unit: 'count' },
];

export const ATTRIBUTES = [
  'Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'Motion Detection', 'Geo-fencing', 'LED Indication',
  'Data Retransmission', 'OTA Firmware', 'Time Sync', 'Tamper Alert', 'Power Saving Mode',
];

export const TYPES: DeviceType[] = [
  { id: 'tracker', name: 'Asset Tracker', icon: 'tracker', form: 'tracker', description: 'GNSS / cellular trackers fitted to vehicles and mobile assets.' },
  { id: 'env', name: 'Environmental Sensor', icon: 'env', form: 'box', description: 'Ambient temperature, humidity, air quality and door state sensors.' },
  { id: 'condition', name: 'Condition Sensor', icon: 'condition', form: 'cylinder', description: 'Vibration, tilt and leak sensors for condition monitoring.' },
  { id: 'gateway', name: 'Gateway', icon: 'gateway', form: 'gateway', description: 'LoRaWAN, BLE and cellular gateways that backhaul device data.' },
  { id: 'rfid', name: 'RFID Reader', icon: 'rfid', form: 'reader', description: 'Fixed UHF RFID readers for portals and zones.' },
  { id: 'beacon', name: 'BLE Beacon', icon: 'beacon', form: 'beacon', description: 'Bluetooth beacons for indoor positioning and proximity.' },
  { id: 'meter', name: 'Smart Meter', icon: 'meter', form: 'meter', description: 'Electricity, water and gas meters with remote reading.' },
  { id: 'counter', name: 'People Counter', icon: 'counter', form: 'box', description: 'Occupancy and footfall counters for spaces and entrances.' },
];

const LORA_BANDS = ['EU868', 'US915', 'AU915', 'AS923', 'KR920', 'IN865'];

type Base = Omit<DeviceModel, 'id' | 'name' | 'manufacturer' | 'typeId' | 'deployed'>;
const DEFAULTS: Record<string, Base> = {
  tracker: {
    connectivity: ['Cellular', 'BLE'], protocol: 'LTE Cat-1 / GNSS', measurements: ['Location', 'Motion'], power: 'External 10–30 V DC',
    bands: ['LTE B1/B3/B7/B8/B20', 'GSM 900/1800'], ipRating: 'IP54', batteryLife: '', opTemp: '-40 °C to 85 °C', fwMin: '3.27.0', fwMax: '3.29.4',
    status: 'Active', attributes: ['Reporting Interval', 'Geo-fencing', 'Motion Detection', 'Threshold Alerts', 'OTA Firmware', 'Tamper Alert'],
  },
  env: {
    connectivity: ['LoRaWAN'], protocol: 'LoRaWAN 1.0.3', measurements: ['Temperature', 'Humidity'], power: 'Battery (replaceable)',
    bands: LORA_BANDS, ipRating: 'IP65', batteryLife: 'Up to 5 years', opTemp: '-20 °C to 60 °C', fwMin: '1.1.0', fwMax: '1.3.2',
    status: 'Active', attributes: ['Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'LED Indication', 'Data Retransmission'],
  },
  condition: {
    connectivity: ['LoRaWAN'], protocol: 'LoRaWAN 1.0.3', measurements: ['Vibration', 'Temperature'], power: 'Battery (replaceable)',
    bands: LORA_BANDS, ipRating: 'IP66', batteryLife: 'Up to 3 years (1 h interval)', opTemp: '-40 °C to 85 °C', fwMin: '2.0.0', fwMax: '2.2.1',
    status: 'Active', attributes: ['Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'Motion Detection', 'OTA Firmware'],
  },
  gateway: {
    connectivity: ['LoRaWAN', 'Ethernet', 'Cellular'], protocol: 'LoRaWAN / Basics Station', measurements: ['Uplink Packets', 'RSSI'], power: 'PoE (802.3af) / 12 V DC',
    bands: LORA_BANDS, ipRating: 'IP67', batteryLife: '', opTemp: '-40 °C to 70 °C', fwMin: '2.1.0', fwMax: '2.4.3',
    status: 'Active', attributes: ['Reporting Interval', 'LED Indication', 'OTA Firmware', 'Time Sync'], form: 'gateway',
  },
  rfid: {
    connectivity: ['Ethernet'], protocol: 'EPC Gen2 / LLRP', measurements: ['Tag Reads', 'RSSI'], power: 'PoE+ (802.3at)',
    bands: ['UHF 865–868 MHz (ETSI)', 'UHF 902–928 MHz (FCC)'], ipRating: 'IP53', batteryLife: '', opTemp: '-20 °C to 55 °C', fwMin: '3.10.0', fwMax: '3.18.2',
    status: 'Active', attributes: ['Reporting Interval', 'Threshold Alerts', 'LED Indication', 'OTA Firmware'], form: 'reader',
  },
  beacon: {
    connectivity: ['BLE'], protocol: 'BLE 5.0 (iBeacon / Eddystone)', measurements: ['RSSI'], power: 'Battery (non-replaceable)',
    bands: ['2.4 GHz'], ipRating: 'IP66', batteryLife: 'Up to 3 years (1 s advertising)', opTemp: '-20 °C to 60 °C', fwMin: '2.3.0', fwMax: '2.6.1',
    status: 'Active', attributes: ['Reporting Interval', 'Motion Detection', 'LED Indication', 'Power Saving Mode'], form: 'beacon',
  },
};

export function blankModel(typeId: string): Base {
  const d = DEFAULTS[typeId] ?? DEFAULTS['env'];
  // the API takes one connectivity per model: the type's main one
  return { ...d, connectivity: d.connectivity.slice(0, 1), power: normalizePower(d.power), measurements: [...d.measurements], bands: [...d.bands], attributes: [...d.attributes], status: 'Draft' };
}

let seq = 0;
export function nextModelId(): string {
  return 'MDL-' + String(++seq).padStart(4, '0');
}

/** Device models loaded from the API. */
export const MODELS: DeviceModel[] = [];
