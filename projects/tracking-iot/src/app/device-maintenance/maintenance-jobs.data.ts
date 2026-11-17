/** Static demo maintenance jobs, technicians and AMC vendors. Jobs refer to the demo devices and their assets / sites. */
import { deviceById } from '../device-management/iot-devices.data';
import { isoDaysAgo, isoUtcDay } from '../shared/tracking-api';
import type { MaintenanceJobDto, MaintenanceOptionsDto } from './maintenance-api.service';

export const MAINTENANCE_OPTIONS: MaintenanceOptionsDto = {
  maintenanceTypes: ['Preventive', 'Calibration', 'Battery Replacement', 'Firmware Update', 'Inspection', 'Repair'],
  priorities: ['Low', 'Medium', 'High', 'Critical'],
  assigneeTypes: ['Technician', 'Vendor'],
  statuses: ['Scheduled', 'Due Soon', 'Overdue', 'In Progress', 'Completed', 'Cancelled'],
  defaultMaintenanceType: 'Preventive',
  defaultPriority: 'Medium',
};

export const TECHNICIANS = [
  { technicianId: 'TECH-0012', technicianName: 'Ravi Kumar', primarySkill: 'Instrumentation', email: 'ravi.kumar@example.com', phoneNumber: '+91 98400 12345' },
  { technicianId: 'TECH-0015', technicianName: 'Meena Iyer', primarySkill: 'IoT & Networking', email: 'meena.iyer@example.com', phoneNumber: '+91 98401 22871' },
  { technicianId: 'TECH-0021', technicianName: 'Sandeep Rao', primarySkill: 'Refrigeration', email: 'sandeep.rao@example.com', phoneNumber: '+91 99490 33410' },
  { technicianId: 'TECH-0027', technicianName: 'Anil Deshmukh', primarySkill: 'Mechanical', email: 'anil.deshmukh@example.com', phoneNumber: '+91 98220 44102' },
  { technicianId: 'TECH-0033', technicianName: 'Omar Haddad', primarySkill: 'Electrical', email: 'omar.haddad@example.com', phoneNumber: '+971 50 555 0133' },
];

export const AMC_VENDORS = [
  { code: 'AMC-004', amcVendorName: 'Milesight Service Partner (South)', primaryContact: 'Karthik S', email: 'service.south@example.com', phone: '+91 44 4012 7788', assetType: { name: 'LoRaWAN Devices' } },
  { code: 'AMC-007', amcVendorName: 'Zebra Authorised Service Centre', primaryContact: 'Neha Kapoor', email: 'zebra.asc@example.com', phone: '+91 80 4123 9090', assetType: { name: 'RFID Readers' } },
  { code: 'AMC-011', amcVendorName: 'ColdTrack Calibration Labs', primaryContact: 'Venkat R', email: 'lab@example.com', phone: '+91 40 2770 1144', assetType: { name: 'Temperature Sensors' } },
];

type Row = [deviceId: string, type: string, dueDays: number, assignee: string | null, priority: string, status: string, description: string, createdDays: number];

const ROWS: Row[] = [
  ['VIB-4005', 'Battery Replacement', -2, 'TECH-0027', 'Critical', 'Overdue', 'Battery at 9% and sensor offline. Replace 2× ER18505 cells and re-join to GW-PUN-01.', 6],
  ['TRK-1004', 'Battery Replacement', 1, 'TECH-0027', 'High', 'Due Soon', 'TMT250 battery 12%. Swap unit with spare from stock and recharge.', 3],
  ['VIB-4001', 'Inspection', 0, 'TECH-0012', 'Critical', 'In Progress', 'Vibration 8.4 mm/s on P-14. Verify sensor mounting, then raise work order for pump bearings.', 1],
  ['TMP-3005', 'Inspection', 3, 'TECH-0015', 'Medium', 'Scheduled', 'Late heartbeats from DG-01 enclosure sensor. Check antenna and LoRa coverage.', 2],
  ['TMP-3001', 'Calibration', 12, 'AMC-011', 'High', 'Scheduled', 'Annual 3-point calibration (-25 / -18 / 0 °C) with certificate for FSSAI audit.', 20],
  ['TMP-3002', 'Calibration', 12, 'AMC-011', 'High', 'Scheduled', 'Annual 3-point calibration (0 / 4 / 10 °C) with certificate.', 20],
  ['TMP-3003', 'Calibration', -6, 'AMC-011', 'Medium', 'Overdue', 'Calibration overdue. Lab visit postponed; reschedule.', 45],
  ['GW-PUN-01', 'Firmware Update', 1, 'TECH-0015', 'Medium', 'Scheduled', 'Upgrade UG65 to 2.4.3 during the night shift window.', 4],
  ['BLE-2004', 'Battery Replacement', 5, null, 'Medium', 'Due Soon', 'PJ-33 tag battery 17%. Replace CR2477.', 1],
  ['RFR-6002', 'Preventive', 34, 'AMC-007', 'Low', 'Scheduled', 'Half-yearly reader service: antenna check, firmware 3.18.2, cable inspection.', 10],
  ['GW-CHN-01', 'Preventive', 52, 'TECH-0015', 'Low', 'Scheduled', 'Quarterly gateway check: enclosure seal, PoE injector, backhaul failover test.', 15],
  ['EMT-5003', 'Inspection', -1, 'TECH-0033', 'High', 'In Progress', 'DG-05 meter booked for maintenance with the generator service.', 5],
  ['TMP-3004', 'Battery Replacement', -18, 'TECH-0033', 'Medium', 'Completed', 'Replaced battery during reefer PTI. Reading verified against reference probe.', 30],
  ['VIB-4003', 'Inspection', -11, 'TECH-0012', 'High', 'Completed', 'Remounted sensor after spindle tool holder replacement; baseline re-captured.', 14],
  ['BLE-2005', 'Battery Replacement', -19, 'TECH-0027', 'Medium', 'Completed', 'Tag battery replaced at 15%.', 25],
  ['GW-BLR-02', 'Firmware Update', -40, 'TECH-0015', 'Low', 'Completed', 'Updated Portal Beam to 1.5.1.', 46],
  ['TRK-1001', 'Inspection', -60, 'TECH-0033', 'Low', 'Completed', 'Checked harness and GNSS antenna after harsh braking alerts.', 65],
  ['RFR-6001', 'Repair', -75, 'AMC-007', 'High', 'Completed', 'Replaced antenna port 3 (VSWR fault).', 80],
  ['BLE-2007', 'Inspection', 8, null, 'Low', 'Cancelled', 'Locate spare tag at Jebel Ali. Cancelled: tag found in stores.', 9],
];

const ASSIGNEES = [...TECHNICIANS.map((t) => ({ id: t.technicianId, name: t.technicianName, type: 'Technician' })), ...AMC_VENDORS.map((v) => ({ id: v.code, name: v.amcVendorName, type: 'Vendor' }))];

export const MAINTENANCE_JOBS: MaintenanceJobDto[] = ROWS.map(([deviceId, type, dueDays, assignee, priority, status, description, createdDays], i) => {
  const d = deviceById(deviceId);
  const who = ASSIGNEES.find((a) => a.id === assignee);
  return {
    id: `6660c9d8a7b0e1${String(i + 1).padStart(10, '0')}`,
    maintenanceId: `DM${String(i + 1).padStart(6, '0')}`,
    deviceId,
    deviceName: d?.deviceName ?? null,
    model: d?.model ?? '',
    assetRegistrationId: d?.assetRegistrationId ?? null,
    assetName: d?.assetName ?? null,
    siteId: d?.siteId ?? null,
    siteName: d?.siteName ?? '',
    maintenanceType: type,
    dueDate: isoUtcDay(dueDays),
    assignedTo: who?.name ?? null,
    assignedToId: who?.id ?? null,
    assignedToType: who?.type ?? null,
    priority,
    description,
    status,
    createdBy: i % 2 ? 'arjun.mehta' : 'kavya.nair',
    createdAt: isoDaysAgo(createdDays),
    updatedBy: status === 'Completed' || status === 'In Progress' ? who?.name ?? null : null,
    updatedAt: status === 'Completed' ? isoDaysAgo(Math.max(0, -dueDays)) : status === 'In Progress' ? isoDaysAgo(0.2) : null,
  };
});
