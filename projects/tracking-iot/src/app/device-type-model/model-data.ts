/* Demo data for Device Type & Model. In-memory and session-only: edits live until the page reloads. */

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
export const POWER_OPTIONS = [
  'Battery (replaceable)', 'Battery (rechargeable)', 'Battery (non-replaceable)', 'External 10–30 V DC', 'PoE (802.3af) / 12 V DC', 'PoE+ (802.3at)', 'USB-C', 'Mains 100–240 V AC',
];

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
  return { ...d, connectivity: [...d.connectivity], measurements: [...d.measurements], bands: [...d.bands], attributes: [...d.attributes], status: 'Draft' };
}

let seq = 0;
export function nextModelId(): string {
  return 'MDL-' + String(++seq).padStart(4, '0');
}

function m(name: string, manufacturer: string, typeId: string, deployed: number, over: Partial<Base> = {}): DeviceModel {
  const d = DEFAULTS[typeId];
  return {
    ...d, connectivity: [...d.connectivity], measurements: [...d.measurements], bands: [...d.bands], attributes: [...d.attributes],
    ...over, id: nextModelId(), name, manufacturer, typeId, deployed,
  };
}

const BLE_ONLY: Partial<Base> = { connectivity: ['BLE'], protocol: 'BLE 5.0', bands: ['2.4 GHz'] };

export const MODELS: DeviceModel[] = [
  // Asset trackers (12)
  m('FMC920', 'Teltonika', 'tracker', 214),
  m('FMB130', 'Teltonika', 'tracker', 176, { protocol: 'GSM / GNSS', fwMin: '3.25.0' }),
  m('TMT250', 'Teltonika', 'tracker', 64, { protocol: 'GSM / GNSS', power: 'Battery (rechargeable)', batteryLife: 'Up to 3 days (continuous)', ipRating: 'IP67', attributes: ['Reporting Interval', 'Geo-fencing', 'Motion Detection', 'LED Indication', 'OTA Firmware'] }),
  m('FMB920', 'Teltonika', 'tracker', 38, { protocol: 'GSM / GNSS', status: 'Retired', fwMax: '3.27.9' }),
  m('FMC130', 'Teltonika', 'tracker', 92),
  m('GH5200', 'Teltonika', 'tracker', 22, { protocol: 'GSM / GNSS', power: 'Battery (rechargeable)', batteryLife: 'Up to 7 days (1 report/h)', ipRating: 'IP54' }),
  m('GL320MG', 'Queclink', 'tracker', 48, { connectivity: ['Cellular'], protocol: 'LTE Cat-M1 / NB-IoT', measurements: ['Location', 'Motion', 'Temperature'], power: 'Battery (rechargeable)', batteryLife: 'Up to 3 years (1 report/day)', ipRating: 'IP67', bands: ['LTE Cat-M1', 'NB-IoT'], fwMin: '1.2.0', fwMax: '1.4.6' }),
  m('GV58LAU', 'Queclink', 'tracker', 30, { connectivity: ['Cellular'], protocol: 'LTE Cat-M1 / GNSS', bands: ['LTE Cat-M1'], fwMin: '1.0.4', fwMax: '1.2.0' }),
  m('Oyster3', 'Digital Matter', 'tracker', 120, { connectivity: ['Cellular'], protocol: 'LTE Cat-M1 / NB-IoT', power: 'Battery (replaceable)', batteryLife: 'Up to 10 years (1 fix/day)', ipRating: 'IP68', bands: ['LTE Cat-M1', 'NB-IoT'], fwMin: '1.5.0', fwMax: '1.9.2' }),
  m('Yabby Edge', 'Digital Matter', 'tracker', 56, { connectivity: ['LoRaWAN'], protocol: 'LoRaWAN 1.0.3', power: 'Battery (replaceable)', batteryLife: 'Up to 5 years', ipRating: 'IP67', bands: ['EU868', 'US915', 'AU915', 'AS923'], fwMin: '1.1.0', fwMax: '1.3.0' }),
  m('Abeeway Compact Tracker', 'Abeeway', 'tracker', 40, { connectivity: ['LoRaWAN', 'BLE'], protocol: 'LoRaWAN 1.0.3', measurements: ['Location', 'Motion', 'Temperature'], power: 'Battery (rechargeable)', batteryLife: 'Up to 6 months', ipRating: 'IP68', bands: ['EU868', 'US915', 'AS923'], fwMin: '2.2.0', fwMax: '2.4.1' }),
  m('Oyster Edge', 'Digital Matter', 'tracker', 0, { connectivity: ['LoRaWAN'], protocol: 'LoRaWAN 1.0.4', power: 'Battery (replaceable)', batteryLife: 'Up to 8 years (1 fix/day)', ipRating: 'IP68', bands: ['EU868', 'US915', 'AU915'], status: 'Draft', fwMin: '0.9.0', fwMax: '1.0.0' }),

  // Environmental sensors (9)
  m('EM300-TH', 'Milesight', 'env', 312, { measurements: ['Temperature', 'Humidity', 'Atmospheric Pressure'], ipRating: 'IP67', batteryLife: 'Up to 10 years (10 min interval)', opTemp: '-30 °C to 70 °C', fwMin: '1.1.0', fwMax: '1.4.0' }),
  m('WS301', 'Milesight', 'env', 148, { measurements: ['Door/Window State'], protocol: 'LoRaWAN 1.0.2', ipRating: 'IP30', attributes: ['Reporting Interval', 'Threshold Alerts', 'Tamper Alert', 'LED Indication'] }),
  m('SenseCAP S2101', 'Seeed Studio', 'env', 86, { ipRating: 'IP66', batteryLife: 'Up to 10 years (60 min interval)', opTemp: '-40 °C to 85 °C', fwMin: '2.0.0', fwMax: '2.3.1' }),
  m('TH Sensor Pro', 'Purple IQ', 'env', 0, { ...BLE_ONLY, measurements: ['Temperature', 'Humidity', 'Atmospheric Pressure'], batteryLife: 'Up to 2 years', status: 'Draft', fwMin: '0.9.0', fwMax: '0.9.4' }),
  m('AM307', 'Milesight', 'env', 54, { measurements: ['Temperature', 'Humidity', 'CO₂', 'TVOC'], power: 'Battery (replaceable)', ipRating: 'IP30', batteryLife: 'Up to 2 years', opTemp: '0 °C to 50 °C' }),
  m('ERS CO2', 'Elsys', 'env', 40, { measurements: ['Temperature', 'Humidity', 'CO₂', 'Light'], ipRating: 'IP20', batteryLife: 'Up to 10 years (15 min interval)', opTemp: '0 °C to 50 °C' }),
  m('LHT65N', 'Dragino', 'env', 120, { batteryLife: 'Up to 10 years', opTemp: '-40 °C to 85 °C' }),
  m('S1', 'Minew', 'env', 74, { ...BLE_ONLY, batteryLife: 'Up to 2 years', opTemp: '-30 °C to 60 °C', attributes: ['Reporting Interval', 'Threshold Alerts', 'Power Saving Mode'] }),
  m('R718A', 'Netvox', 'env', 36, { opTemp: '-40 °C to 85 °C' }),

  // Condition sensors (7)
  m('WISE-2410', 'Advantech', 'condition', 66, { batteryLife: 'Up to 2 years (1 h interval)', form: 'box' }),
  m('Industrial Node 6', 'Treon', 'condition', 42, { connectivity: ['BLE'], protocol: 'Wirepas Mesh 2.4 GHz', bands: ['2.4 GHz'], batteryLife: 'Up to 5 years' }),
  m('EM310-TILT', 'Milesight', 'condition', 24, { measurements: ['Tilt', 'Motion'], ipRating: 'IP67', form: 'box' }),
  m('QM30VT2', 'Banner', 'condition', 18, { connectivity: ['Ethernet'], protocol: 'Modbus TCP via DXM gateway', bands: [], power: 'External 10–30 V DC', batteryLife: '', ipRating: 'IP67' }),
  m('ALTA Wi-Fi Vibration', 'Monnit', 'condition', 12, { connectivity: ['Wi-Fi'], protocol: 'Wi-Fi 802.11 b/g/n', bands: ['2.4 GHz'], ipRating: 'IP65', batteryLife: 'Up to 2 years', form: 'box' }),
  m('IMx-1', 'SKF', 'condition', 0, { connectivity: ['BLE'], protocol: 'BLE 5.0 Mesh', bands: ['2.4 GHz'], status: 'Draft', batteryLife: 'Up to 5 years', fwMin: '0.8.0', fwMax: '0.9.0' }),
  m('LWL02', 'Dragino', 'condition', 9, { measurements: ['Water Leak'], status: 'Retired', ipRating: 'IP65', batteryLife: 'Up to 5 years', form: 'box', attributes: ['Reporting Interval', 'Threshold Alerts', 'Data Retransmission'] }),

  // Gateways (5)
  m('RAK7268', 'RAKwireless', 'gateway', 14, { connectivity: ['LoRaWAN', 'Ethernet', 'Wi-Fi', 'Cellular'], ipRating: 'IP30', opTemp: '-10 °C to 55 °C' }),
  m('UG65', 'Milesight', 'gateway', 11, { connectivity: ['LoRaWAN', 'Ethernet', 'Wi-Fi', 'Cellular'], ipRating: 'IP65', opTemp: '-20 °C to 70 °C' }),
  m('iStation', 'Kerlink', 'gateway', 6, { fwMin: '5.6.0', fwMax: '6.1.2' }),
  m('G1', 'Minew', 'gateway', 22, { connectivity: ['BLE', 'Wi-Fi', 'Ethernet'], protocol: 'BLE 5.0 → MQTT', measurements: ['RSSI'], power: 'USB-C', bands: ['2.4 GHz'], ipRating: 'IP30', opTemp: '-10 °C to 55 °C' }),
  m('RUT956', 'Teltonika', 'gateway', 8, { connectivity: ['Cellular', 'Wi-Fi', 'Ethernet'], protocol: 'LTE Cat-4 / Modbus / MQTT', measurements: ['RSSI'], power: 'External 10–30 V DC', bands: ['LTE Cat-4', '2.4 GHz'], ipRating: 'IP30', fwMin: '7.4.0', fwMax: '7.8.1' }),

  // RFID readers (4)
  m('FX9600', 'Zebra', 'rfid', 18, { connectivity: ['Ethernet', 'Wi-Fi'] }),
  m('R700', 'Impinj', 'rfid', 24, { protocol: 'EPC Gen2v2 / LLRP / IoT REST', fwMin: '7.6.0', fwMax: '8.2.1' }),
  m('ATR7000', 'Zebra', 'rfid', 4, { measurements: ['Tag Reads', 'RSSI', 'Location'] }),
  m('Speedway R420', 'Impinj', 'rfid', 31, { fwMin: '5.12.0', fwMax: '5.14.4' }),

  // BLE beacons (5)
  m('E8', 'Minew', 'beacon', 420, { measurements: ['Motion', 'RSSI'] }),
  m('E7', 'Minew', 'beacon', 260),
  m('E9', 'Minew', 'beacon', 180, { ipRating: 'IP67', batteryLife: 'Up to 5 years (1 s advertising)' }),
  m('Asset Tag 2', 'Kontakt.io', 'beacon', 310, { measurements: ['Motion', 'Temperature', 'RSSI'], fwMin: '4.1.0', fwMax: '4.5.0' }),
  m('BC04P', 'Blue Charm', 'beacon', 95, { ipRating: 'IP65', power: 'Battery (replaceable)' }),
];
