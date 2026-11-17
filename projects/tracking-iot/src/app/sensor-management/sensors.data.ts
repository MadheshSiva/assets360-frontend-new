/**
 * Static demo sensors (what /api/sensors returned). Each sensor is a channel of a demo IoT device and is mapped to the
 * device's asset; telemetry readings for these sensor ids are generated in tracking-telemetry/telemetry-readings.data.ts.
 */
import { assetByRef, siteById } from '../shared/master-data.data';
import { isoDaysAgo, isoUtcDay } from '../shared/tracking-api';
import { deviceById } from '../device-management/iot-devices.data';
import type { SensorDto, SensorFormOptionsDto, SensorTypeOptionDto } from './sensor-api.service';

export const SENSOR_TYPES: SensorTypeOptionDto[] = [
  { sensorType: 'Temperature Probe', idPrefix: 'SEN-T', measuredParameter: 'Temperature', unit: '°C' },
  { sensorType: 'Humidity Sensor', idPrefix: 'SEN-H', measuredParameter: 'Humidity', unit: '%RH' },
  { sensorType: 'Vibration Sensor', idPrefix: 'SEN-V', measuredParameter: 'Vibration', unit: 'mm/s' },
  { sensorType: 'Energy Meter', idPrefix: 'SEN-E', measuredParameter: 'Energy', unit: 'kWh' },
  { sensorType: 'Current Transformer', idPrefix: 'SEN-C', measuredParameter: 'Current', unit: 'A' },
];

export const MEASUREMENT_POINTS: Record<string, string[]> = {
  'Temperature Probe': ['Return air', 'Supply air', 'Product core', 'Supply water', 'Enclosure', 'Bearing housing', 'Load compartment'],
  'Humidity Sensor': ['Room ambient', 'Door zone', 'Enclosure'],
  'Vibration Sensor': ['Motor drive end', 'Motor non-drive end', 'Pump bearing', 'Spindle housing', 'Gearbox'],
  'Energy Meter': ['Main incomer', 'Machine feeder', 'Generator output'],
  'Current Transformer': ['Phase L1', 'Phase L2', 'Phase L3'],
};

export const SENSOR_FORM_OPTIONS: SensorFormOptionsDto = {
  sensorTypes: SENSOR_TYPES,
  samplingIntervals: [
    { seconds: 10, label: '10 seconds' }, { seconds: 30, label: '30 seconds' }, { seconds: 60, label: '1 minute' }, { seconds: 300, label: '5 minutes' },
    { seconds: 600, label: '10 minutes' }, { seconds: 900, label: '15 minutes' }, { seconds: 3600, label: '1 hour' },
  ],
  measurementPointsBySensorType: MEASUREMENT_POINTS,
  statuses: ['Active', 'Attention', 'Offline', 'Inactive'],
};

type Row = [num: number, type: string, name: string, deviceId: string, channel: number, interval: number, low: number | null, high: number | null, point: string, reading: number | null, calDays: number, status: string];

const ROWS: Row[] = [
  [80211, 'Temperature Probe', 'CR-01 Return Air Temp', 'TMP-3001', 1, 300, -25, -15, 'Return air', -18.4, 64, 'Active'],
  [80212, 'Humidity Sensor', 'CR-01 Humidity', 'TMP-3001', 2, 300, null, 90, 'Room ambient', 72.5, 64, 'Active'],
  [80214, 'Temperature Probe', 'CR-02 Return Air Temp', 'TMP-3002', 1, 300, 0, 8, 'Return air', 3.9, 12, 'Active'],
  [80215, 'Humidity Sensor', 'CR-02 Humidity', 'TMP-3002', 2, 300, null, 90, 'Door zone', 81.2, 12, 'Active'],
  [80221, 'Temperature Probe', 'Chiller CH-01 Supply Water', 'TMP-3003', 1, 300, 4, 12, 'Supply water', 7.3, -6, 'Active'],
  [80222, 'Humidity Sensor', 'Chiller Plant Humidity', 'TMP-3003', 2, 600, null, 85, 'Room ambient', 64.8, -6, 'Active'],
  [80231, 'Temperature Probe', 'Reefer RC-02 Load Temp', 'TMP-3004', 1, 300, -25, -15, 'Product core', -19.7, 140, 'Active'],
  [80241, 'Temperature Probe', 'DG-01 Enclosure Temp', 'TMP-3005', 1, 600, null, 55, 'Enclosure', 41.6, 22, 'Attention'],
  [80251, 'Temperature Probe', 'Reefer TS-09 Load Temp', 'TRK-1003', 1, 60, -25, -15, 'Load compartment', -16.8, 95, 'Attention'],
  [40311, 'Vibration Sensor', 'Pump P-14 Bearing Vibration', 'VIB-4001', 1, 600, null, 7.1, 'Pump bearing', 8.4, 48, 'Attention'],
  [40312, 'Temperature Probe', 'Pump P-14 Bearing Temp', 'VIB-4001', 2, 600, null, 80, 'Bearing housing', 61.2, 48, 'Active'],
  [40321, 'Vibration Sensor', 'Compressor AC-03 Motor DE', 'VIB-4002', 1, 600, null, 7.1, 'Motor drive end', 5.2, 110, 'Active'],
  [40331, 'Vibration Sensor', 'VMC-02 Spindle Vibration', 'VIB-4003', 1, 300, null, 7.1, 'Spindle housing', 2.4, 200, 'Active'],
  [40341, 'Vibration Sensor', 'WR-01 Gearbox Vibration', 'VIB-4004', 1, 600, null, 7.1, 'Gearbox', 3.1, 75, 'Active'],
  [40351, 'Vibration Sensor', 'Compressor AC-07 Motor DE', 'VIB-4005', 1, 600, null, 7.1, 'Motor drive end', null, -15, 'Offline'],
  [40361, 'Vibration Sensor', 'Conveyor CV-01 Drive Vibration', 'VIB-4006', 1, 600, null, 7.1, 'Gearbox', 2.8, 160, 'Active'],
  [60411, 'Energy Meter', 'IMM-05 Feeder Energy', 'EMT-5001', 1, 900, null, 45, 'Machine feeder', 31.6, 300, 'Active'],
  [60412, 'Current Transformer', 'IMM-05 Phase L1 Current', 'EMT-5001', 2, 60, null, 120, 'Phase L1', 86, 300, 'Active'],
  [60421, 'Energy Meter', 'Chiller CH-01 Energy', 'EMT-5002', 1, 900, null, 60, 'Machine feeder', 38.2, 280, 'Active'],
  [60431, 'Energy Meter', 'DG-05 Output Energy', 'EMT-5003', 1, 900, null, null, 'Generator output', 0, 240, 'Inactive'],
];

export const SENSORS: SensorDto[] = ROWS.map(([num, type, name, deviceId, channel, interval, low, high, point, reading, calDays, status], i) => {
  const t = SENSOR_TYPES.find((x) => x.sensorType === type)!;
  const d = deviceById(deviceId);
  const a = assetByRef(d?.assetRegistrationId);
  const site = siteById(d?.siteId);
  return {
    id: `6640a7b6e5f8c9${String(i + 1).padStart(10, '0')}`,
    sensorId: `${t.idPrefix}-${num}`,
    sensorNumber: String(num),
    serialNumber: `${t.idPrefix.replace('SEN-', 'S')}${(num * 7919).toString(16).toUpperCase()}`,
    name,
    sensorType: type,
    measuredParameter: t.measuredParameter,
    unit: t.unit,
    deviceId,
    deviceModel: d?.model ?? null,
    channel,
    samplingIntervalSeconds: interval,
    lowAlarm: low,
    highAlarm: high,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    assetRegistrationId: a?.regId ?? null,
    assetCode: a?.tag ?? null,
    assetName: a?.name ?? null,
    measurementPoint: point,
    liveReading: reading,
    calibrationDueDate: isoUtcDay(calDays),
    status,
    createdBy: 'priya.raman',
    createdAt: d?.createdAt ?? isoDaysAgo(200),
    updatedBy: i % 3 === 0 ? 'kavya.nair' : null,
    updatedAt: i % 3 === 0 ? isoDaysAgo(20 + i) : null,
  };
});
