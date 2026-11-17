/** Static demo replacement stock: spare devices held at the demo sites, of the same models as the deployed devices. */
import { isoDaysAgo } from '../shared/tracking-api';
import type { ReplacementDeviceDto } from './replacement-device-api.service';

type Row = [deviceId: string, model: string, availability: string, compatibility: string, protocol: string, battery: number | null, location: string, ageDays: number];

const ROWS: Row[] = [
  ['VIB-4101', 'WISE-2410', 'Available', 'Compatible', 'LoRaWAN 1.0.2', 100, 'Pune Assembly Unit · Stores', 40],
  ['VIB-4102', 'WISE-2410', 'Available', 'Compatible', 'LoRaWAN 1.0.2', 100, 'Chennai Manufacturing Plant · Stores', 40],
  ['TRK-1101', 'TMT250', 'Available', 'Compatible', 'LTE Cat-M1 / GNSS', 96, 'Pune Assembly Unit · Stores', 22],
  ['TRK-1102', 'FMC130', 'Reserved', 'Compatible', 'LTE Cat-1 / GNSS', 100, 'Bengaluru Distribution Center · Fleet bay', 60],
  ['BLE-2101', 'Asset Tag 2', 'Available', 'Compatible', 'BLE 5.0 (iBeacon / Eddystone)', 100, 'Bengaluru Distribution Center · Stores', 15],
  ['BLE-2102', 'Asset Tag 2', 'Available', 'Compatible', 'BLE 5.0 (iBeacon / Eddystone)', 100, 'Chennai Manufacturing Plant · Stores', 15],
  ['TMP-3101', 'EM300-TH', 'Available', 'Compatible', 'LoRaWAN 1.0.3', 100, 'Hyderabad Cold Chain Hub · Stores', 33],
  ['TMP-3102', 'AM307', 'Available', 'Partial', 'LoRaWAN 1.0.3', 100, 'Chennai Manufacturing Plant · Stores', 10],
  ['GW-SPR-01', 'UG65', 'Available', 'Compatible', 'LoRaWAN / Basics Station', null, 'Chennai Manufacturing Plant · IT room', 90],
  ['TRK-0901', 'GL300W', 'Available', 'Incompatible', 'WCDMA / GNSS', 64, 'Bengaluru Distribution Center · Scrap cage', 400],
  ['EMT-5101', 'SDM630-LoRa', 'In Transit', 'Compatible', 'LoRaWAN 1.0.3 / Modbus', null, 'In transit to Hyderabad Cold Chain Hub', 3],
];

export const REPLACEMENT_STOCK: ReplacementDeviceDto[] = ROWS.map(([deviceId, model, availability, compatibility, protocol, batteryLevel, locationName, age], i) => ({
  id: `6670dae9b8c1f2${String(i + 1).padStart(10, '0')}`,
  deviceId, model, availability, compatibility, protocol, batteryLevel, locationName,
  createdBy: 'arjun.mehta', createdAt: isoDaysAgo(age), updatedBy: null, updatedAt: null,
}));
