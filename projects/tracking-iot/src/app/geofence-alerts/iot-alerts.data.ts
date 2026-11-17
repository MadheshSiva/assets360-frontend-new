/**
 * Static demo IoT alerts (what /api/iot-alerts returned). Device alerts point at demo devices; geofence alerts point at
 * the alert rules of geofences.data.ts, which resolve to their geofence.
 */
import { assetByRef, siteById } from '../shared/master-data.data';
import { isoMinutesAgo } from '../shared/tracking-api';
import { deviceById } from '../device-management/iot-devices.data';
import type { IoTAlertDto } from './iot-alert-api.service';

type Row = [minutesAgo: number, deviceId: string | null, asset: string, eventType: string, severity: string, status: string, message: string, ruleId: string | null, owner: string | null];

const H = 60;
const D = 1440;

const ROWS: Row[] = [
  [12, 'VIB-4001', 'REG-000104', 'Excessive Vibration', 'Critical', 'Open', 'Velocity RMS 8.4 mm/s on Pump P-14 (limit 7.1 mm/s). Check bearing and coupling alignment.', null, null],
  [26, 'TRK-1004', 'REG-000305', 'Low Battery', 'Warning', 'Open', 'Tool Cart TC-11 tracker battery at 12%. Recharge within 24 h.', null, null],
  [41, 'BLE-2002', 'REG-000102', 'Restricted Zone Entry', 'Critical', 'In Progress', 'Forklift FL-12 entered Hazardous Materials Store without a permit.', 'AR-0003', 'ravi.kumar'],
  [55, 'TMP-3005', 'REG-000105', 'Late Heartbeat', 'Warning', 'Open', 'DG-01 enclosure sensor has not reported for 38 minutes (expected every 10).', null, null],
  [2 * H + 5, 'BLE-2001', 'REG-000101', 'Dwell Time Exceeded', 'Warning', 'Acknowledged', 'Forklift FL-07 idle at Loading Dock A for 42 min (limit 30 min).', 'AR-0002', 'meena.iyer'],
  [3 * H + 20, 'TRK-1003', 'REG-000403', 'Temperature Excursion', 'Critical', 'Acknowledged', 'Reefer TS-09-UC-7734 load temperature -12.6 °C for 14 min (set point -18 °C).', 'AR-0006', 'sandeep.rao'],
  [5 * H, 'VIB-4005', 'REG-000302', 'Device Offline', 'Critical', 'Open', 'Compressor AC-07 vibration sensor offline for 9 h. Battery last reported 9%.', null, null],
  [6 * H + 30, 'BLE-2004', 'REG-000202', 'Low Battery', 'Warning', 'Open', 'Pallet Jack PJ-33 tag battery at 17%.', null, null],
  [9 * H, 'VIB-4002', 'REG-000103', 'Vibration Above Baseline', 'Warning', 'Acknowledged', 'Compressor AC-03 vibration 5.2 mm/s, 38% above its 30-day baseline.', null, 'arjun.mehta'],
  [14 * H, 'TRK-1001', 'REG-000203', 'Geofence Exit', 'Info', 'Resolved', 'Truck KA-01-AB-4521 left Bengaluru DC Yard on route BLR-07.', 'AR-0004', 'system'],
  [20 * H, 'EMT-5001', 'REG-000107', 'Energy Spike', 'Warning', 'Resolved', 'IMM-05 drew 52 kWh in 1 h (normal 31 kWh). Heater band fault cleared.', null, 'arjun.mehta'],
  [D + 3 * H, 'BLE-2007', 'BLE-2007', 'Device Offline', 'Warning', 'Open', 'Spare asset tag at Jebel Ali has not been seen for 4 days.', null, null],
  [D + 7 * H, 'TMP-3001', 'REG-000401', 'High Temperature', 'Critical', 'Resolved', 'Cold Room CR-01 reached -14.8 °C during door-open event (limit -15 °C).', null, 'sandeep.rao'],
  [D + 11 * H, 'TRK-1004', 'REG-000305', 'Geofence Breach', 'Warning', 'Resolved', 'Torque Tool Cart TC-11 entered Paint Shop Clean Zone.', 'AR-0005', 'ravi.kumar'],
  [2 * D + 2 * H, 'TRK-1002', 'REG-000204', 'Geofence Entry', 'Info', 'Resolved', 'Truck KA-01-AC-1187 returned to Bengaluru DC Yard.', 'AR-0004', 'system'],
  [2 * D + 9 * H, 'VIB-4001', 'REG-000104', 'Vibration Above Baseline', 'Warning', 'Resolved', 'Pump P-14 vibration 5.6 mm/s, trending up over 7 days.', null, 'arjun.mehta'],
  [3 * D + 4 * H, 'TMP-3004', 'REG-000502', 'Temperature Excursion', 'Warning', 'Resolved', 'Reefer Container RC-02 at -16.9 °C after power changeover (set point -20 °C).', null, 'omar.haddad'],
  [3 * D + 15 * H, 'BLE-2001', 'REG-000101', 'Dwell Time Exceeded', 'Warning', 'Resolved', 'Forklift FL-07 idle at Loading Dock A for 35 min.', 'AR-0002', 'meena.iyer'],
  [4 * D + 6 * H, 'GW-PUN-01', 'GW-PUN-01', 'Gateway Restart', 'Info', 'Resolved', 'Pune LoRaWAN gateway restarted after power dip; back online in 3 min.', null, 'system'],
  [5 * D + 2 * H, 'TRK-1003', 'REG-000403', 'Geofence Dwell', 'Warning', 'Resolved', 'Reefer truck waited 27 min at Cold Chain Dispatch Dock.', 'AR-0006', 'sandeep.rao'],
  [6 * D + 8 * H, 'TMP-3002', 'REG-000402', 'High Humidity', 'Warning', 'Resolved', 'Cold Room CR-02 humidity 91 %RH for 20 min. Door seal inspected.', null, 'sandeep.rao'],
  [8 * D + 1 * H, 'BLE-2002', 'REG-000102', 'Restricted Zone Entry', 'Critical', 'Resolved', 'Forklift FL-12 entered Hazardous Materials Store (authorised delivery).', 'AR-0003', 'ravi.kumar'],
  [9 * D + 5 * H, 'EMT-5003', 'REG-000404', 'Generator Run Detected', 'Info', 'Resolved', 'Standby Generator DG-05 ran 46 min during grid outage.', null, 'system'],
  [11 * D + 3 * H, 'VIB-4003', 'REG-000106', 'Excessive Vibration', 'Critical', 'Resolved', 'VMC-02 spindle 9.1 mm/s during heavy cut. Tool holder replaced.', null, 'arjun.mehta'],
  [13 * D + 9 * H, 'TRK-1001', 'REG-000203', 'Harsh Braking', 'Info', 'Resolved', 'Truck KA-01-AB-4521 harsh braking event on NH-48.', null, 'system'],
  [16 * D + 4 * H, 'TMP-3003', 'REG-000108', 'High Temperature', 'Warning', 'Resolved', 'Chiller CH-01 supply water 13.4 °C (limit 12 °C).', null, 'arjun.mehta'],
  [19 * D + 6 * H, 'BLE-2005', 'REG-000304', 'Low Battery', 'Warning', 'Resolved', 'AGV-04 tag battery replaced at 15%.', null, 'ravi.kumar'],
  [23 * D + 2 * H, 'TRK-1002', 'REG-000204', 'Geofence Exit', 'Info', 'Resolved', 'Truck KA-01-AC-1187 left Bengaluru DC Yard.', 'AR-0004', 'system'],
  [26 * D + 7 * H, 'VIB-4005', 'REG-000302', 'Vibration Above Baseline', 'Warning', 'Resolved', 'Compressor AC-07 vibration 4.9 mm/s.', null, 'ravi.kumar'],
  [29 * D + 10 * H, 'TMP-3001', 'REG-000401', 'High Temperature', 'Critical', 'Resolved', 'Cold Room CR-01 defrost overrun, -13.2 °C for 25 min.', null, 'sandeep.rao'],
  [34 * D, 'TRK-1003', 'REG-000403', 'Temperature Excursion', 'Warning', 'Resolved', 'Reefer TS-09-UC-7734 -15.8 °C at loading.', null, 'sandeep.rao'],
  [41 * D, 'BLE-2003', 'REG-000201', 'Dwell Time Exceeded', 'Info', 'Resolved', 'Reach Truck RT-21 parked outside charging bay for 2 h.', null, 'system'],
];

function build(r: Row, i: number): IoTAlertDto {
  const [min, deviceId, assetRef, eventType, severity, status, message, ruleId, owner] = r;
  const dev = deviceById(deviceId);
  const asset = assetByRef(assetRef);
  const site = siteById(dev?.siteId ?? asset?.siteId);
  const raised = isoMinutesAgo(min);
  const acked = status !== 'Open';
  const resolved = status === 'Resolved';
  return {
    id: `6620e5f4c3d6a7${String(i + 1).padStart(10, '0')}`,
    alertId: `ALT-${String(1240 - i).padStart(6, '0')}`,
    raisedAt: raised,
    assetRegistrationId: asset?.regId ?? null,
    assetName: asset?.name ?? dev?.deviceName ?? assetRef,
    deviceId,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    eventType,
    severity,
    status,
    message,
    alertRuleId: ruleId,
    acknowledgedBy: acked ? owner : null,
    acknowledgedAt: acked ? isoMinutesAgo(min - Math.min(8, min / 3)) : null,
    resolvedBy: resolved ? owner : null,
    resolvedAt: resolved ? isoMinutesAgo(min - Math.min(95, min / 2)) : null,
    createdBy: 'system',
    createdAt: raised,
    updatedBy: acked ? owner : null,
    updatedAt: acked ? isoMinutesAgo(min - Math.min(8, min / 3)) : null,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
}

/** The in-memory alerts, most recently raised first. */
export const IOT_ALERTS: IoTAlertDto[] = ROWS.map(build);
