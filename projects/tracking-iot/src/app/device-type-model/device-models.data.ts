/** Static demo device model catalogue (what /api/device-models returned). Device records refer to these model numbers. */
import { isoDaysAgo } from '../shared/tracking-api';
import type { DeviceModelDto, DeviceModelFormOptions } from './device-model-api.service';

const LORA_BANDS = ['IN865', 'EU868', 'US915', 'AS923'];

function model(
  id: number, modelNumber: string, manufacturer: string, deviceType: string, connectivity: string, protocol: string,
  supportedMeasurements: string[], powerSource: string, frequencyBands: string[], ipRating: string, batteryLife: string | null,
  operatingTemperature: string, firmwareFrom: string, firmwareTo: string, configurableAttributes: string[], status: string, ageDays: number,
): DeviceModelDto {
  return {
    id: `65e0b7a1c4d2f3${String(id).padStart(10, '0')}`, modelNumber, manufacturer, deviceType, connectivity, supportedMeasurements, powerSource, protocol,
    frequencyBands, ipRating, batteryLife, operatingTemperature, firmwareFrom, firmwareTo, configurableAttributes, status,
    createdBy: 'priya.raman', createdAt: isoDaysAgo(ageDays), updatedBy: ageDays > 120 ? 'arjun.mehta' : null, updatedAt: ageDays > 120 ? isoDaysAgo(ageDays - 90) : null,
    clientId: 'demo-client', tenantId: 'demo-tenant',
  };
}

export const DEVICE_MODELS: DeviceModelDto[] = [
  model(1, 'FMC130', 'Teltonika', 'Asset Tracker', 'Cellular', 'LTE Cat-1 / GNSS', ['Location', 'Motion', 'Battery'], 'External power', ['LTE B1/B3/B5/B8', 'GSM 900/1800'], 'IP41', null, '-40 °C to 85 °C', '3.27.0', '3.29.4', ['Reporting Interval', 'Geo-fencing', 'Motion Detection', 'OTA Firmware', 'Tamper Alert'], 'Active', 410),
  model(2, 'TMT250', 'Teltonika', 'Asset Tracker', 'Cellular', 'LTE Cat-M1 / GNSS', ['Location', 'Motion', 'Battery'], 'Battery (rechargeable)', ['LTE-M B1/B3/B8/B20'], 'IP67', 'Up to 30 days (5 min interval)', '-20 °C to 60 °C', '2.1.0', '2.4.2', ['Reporting Interval', 'Geo-fencing', 'Motion Detection', 'Power Saving Mode'], 'Active', 300),
  model(3, 'EM300-TH', 'Milesight', 'Environmental Sensor', 'LoRaWAN', 'LoRaWAN 1.0.3', ['Temperature', 'Humidity', 'Battery'], 'Battery (replaceable)', LORA_BANDS, 'IP67', 'Up to 10 years (10 min interval)', '-30 °C to 70 °C', '1.1.0', '1.3.2', ['Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'Data Retransmission', 'Time Sync'], 'Active', 520),
  model(4, 'WISE-2410', 'Advantech', 'Condition Sensor', 'LoRaWAN', 'LoRaWAN 1.0.2', ['Vibration', 'Temperature', 'Battery'], 'Battery (replaceable)', LORA_BANDS, 'IP66', 'Up to 3 years (1 h interval)', '-40 °C to 85 °C', '2.0.0', '2.2.1', ['Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'OTA Firmware'], 'Active', 470),
  model(5, 'UG65', 'Milesight', 'Gateway', 'LoRaWAN', 'LoRaWAN / Basics Station', ['Uplink Packets', 'RSSI'], 'PoE', LORA_BANDS, 'IP30', null, '-40 °C to 70 °C', '2.1.0', '2.4.3', ['Reporting Interval', 'LED Indication', 'OTA Firmware', 'Time Sync'], 'Active', 560),
  model(6, 'Portal Beam', 'Kontakt.io', 'Gateway', 'BLE', 'BLE 5.0 / Wi-Fi uplink', ['People Count', 'RSSI', 'Temperature'], 'PoE', ['2.4 GHz'], 'IP20', null, '0 °C to 40 °C', '1.4.0', '1.6.2', ['Reporting Interval', 'OTA Firmware', 'Time Sync'], 'Active', 350),
  model(7, 'Asset Tag 2', 'Kontakt.io', 'BLE Beacon', 'BLE', 'BLE 5.0 (iBeacon / Eddystone)', ['RSSI', 'Motion', 'Battery'], 'Battery (replaceable)', ['2.4 GHz'], 'IP67', 'Up to 3 years (1 s advertising)', '-20 °C to 60 °C', '2.3.0', '2.6.1', ['Reporting Interval', 'Motion Detection', 'LED Indication', 'Power Saving Mode'], 'Active', 380),
  model(8, 'FX9600', 'Zebra', 'RFID Reader', 'Ethernet', 'EPC Gen2 / LLRP', ['Tag Reads', 'RSSI'], 'PoE', ['UHF 865–867 MHz (ETSI)'], 'IP53', null, '-20 °C to 55 °C', '3.10.0', '3.18.2', ['Reporting Interval', 'Threshold Alerts', 'LED Indication', 'OTA Firmware'], 'Active', 610),
  model(9, 'SDM630-LoRa', 'Eastron', 'Smart Meter', 'LoRaWAN', 'LoRaWAN 1.0.3 / Modbus', ['Energy'], 'External power', LORA_BANDS, 'IP51', null, '-25 °C to 55 °C', '1.0.0', '1.2.0', ['Reporting Interval', 'Threshold Alerts', 'Time Sync'], 'Active', 260),
  model(10, 'AM307', 'Milesight', 'Environmental Sensor', 'LoRaWAN', 'LoRaWAN 1.0.3', ['Temperature', 'Humidity', 'CO₂', 'TVOC', 'Light'], 'Battery (replaceable)', LORA_BANDS, 'IP30', 'Up to 2 years (10 min interval)', '-20 °C to 60 °C', '1.0.0', '1.1.4', ['Reporting Interval', 'Threshold Alerts', 'LED Indication'], 'Pending Review', 21),
  model(11, 'GL300W', 'Queclink', 'Asset Tracker', 'Cellular', 'WCDMA / GNSS', ['Location', 'Motion', 'Battery'], 'Battery (rechargeable)', ['WCDMA B1/B8', 'GSM 900/1800'], 'IP65', 'Up to 14 days', '-20 °C to 60 °C', '1.08', '1.12', ['Reporting Interval', 'Geo-fencing'], 'Inactive', 900),
];

export const DEVICE_MODEL_FORM_OPTIONS: DeviceModelFormOptions = {
  deviceTypes: [],
  manufacturers: ['Advantech', 'Eastron', 'Kontakt.io', 'Milesight', 'Queclink', 'Teltonika', 'Zebra'],
  connectivities: ['LoRaWAN', 'BLE', 'Wi-Fi', 'Cellular', 'Ethernet'],
  protocolsByConnectivity: {
    LoRaWAN: ['LoRaWAN 1.0.2', 'LoRaWAN 1.0.3', 'LoRaWAN 1.0.3 / Modbus', 'LoRaWAN 1.1', 'LoRaWAN / Basics Station'],
    BLE: ['BLE 4.2', 'BLE 5.0 (iBeacon / Eddystone)', 'BLE 5.0 / Wi-Fi uplink'],
    'Wi-Fi': ['Wi-Fi 802.11 b/g/n', 'Wi-Fi 6 (802.11ax)'],
    Cellular: ['LTE Cat-1 / GNSS', 'LTE Cat-M1 / GNSS', 'NB-IoT', 'WCDMA / GNSS'],
    Ethernet: ['EPC Gen2 / LLRP', 'Modbus TCP', 'MQTT over TCP'],
  },
  frequencyBandsByConnectivity: {
    LoRaWAN: ['IN865', 'EU868', 'US915', 'AU915', 'AS923', 'KR920'],
    BLE: ['2.4 GHz'],
    'Wi-Fi': ['2.4 GHz', '5 GHz'],
    Cellular: ['LTE B1/B3/B5/B8', 'LTE-M B1/B3/B8/B20', 'GSM 900/1800', 'WCDMA B1/B8'],
    Ethernet: ['UHF 865–867 MHz (ETSI)', 'UHF 902–928 MHz (FCC)'],
  },
  powerSources: ['Battery (replaceable)', 'Battery (rechargeable)', 'External power', 'PoE'],
  measurements: [
    { name: 'Temperature', unit: '°C' }, { name: 'Humidity', unit: '%RH' }, { name: 'Vibration', unit: 'mm/s' }, { name: 'Battery', unit: '%' },
    { name: 'Atmospheric Pressure', unit: 'hPa' }, { name: 'CO₂', unit: 'ppm' }, { name: 'TVOC', unit: 'ppb' }, { name: 'Light', unit: 'lux' },
    { name: 'Door/Window State', unit: 'open/closed' }, { name: 'Water Leak', unit: 'yes/no' }, { name: 'Tilt', unit: '°' }, { name: 'Location', unit: 'GNSS' },
    { name: 'Motion', unit: 'g' }, { name: 'Tag Reads', unit: 'reads/s' }, { name: 'RSSI', unit: 'dBm' }, { name: 'Uplink Packets', unit: 'pkt/min' },
    { name: 'Energy', unit: 'kWh' }, { name: 'People Count', unit: 'count' },
  ],
  ipRatings: ['IP20', 'IP30', 'IP41', 'IP51', 'IP53', 'IP54', 'IP65', 'IP66', 'IP67', 'IP68'],
  configurableAttributes: [
    'Reporting Interval', 'Measurement Intervals', 'Threshold Alerts', 'Motion Detection', 'Geo-fencing', 'LED Indication',
    'Data Retransmission', 'OTA Firmware', 'Time Sync', 'Tamper Alert', 'Power Saving Mode',
  ],
  statuses: ['Active', 'Draft', 'Pending Review', 'Inactive'],
};

export function modelByNumber(modelNumber: string | null | undefined): DeviceModelDto | undefined {
  const m = (modelNumber ?? '').trim().toLowerCase();
  return DEVICE_MODELS.find((x) => x.modelNumber.toLowerCase() === m);
}
