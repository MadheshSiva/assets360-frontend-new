/**
 * Static demo tag registry (what /api/tag-ids returned): RFID, barcode, QR, NFC and BLE identifiers, assigned to the
 * demo assets or held as stock at the demo sites.
 */
import { DEMO_ASSETS, assetByRef, siteById } from '../shared/master-data.data';
import { hashOf, isoDaysAgo, isoMinutesAgo } from '../shared/tracking-api';
import type { TagIdDto, TagTechnologyOption } from './tag-id-api.service';

export const TAG_TECHNOLOGIES: TagTechnologyOption[] = [
  { technology: 'Barcode', idPrefix: 'BC', valueLabel: 'Barcode Number', tagTypes: ['Barcode Label'] },
  { technology: 'QR Code', idPrefix: 'QR', valueLabel: 'Encoded Value', tagTypes: ['QR Label'] },
  { technology: 'Passive RFID', idPrefix: 'RFID', valueLabel: 'EPC', tagTypes: ['Label', 'Hard Tag'] },
  { technology: 'Active RFID', idPrefix: 'RFID', valueLabel: 'EPC', tagTypes: ['Hard Tag'] },
  { technology: 'BLE', idPrefix: 'BLE', valueLabel: 'MAC Address', tagTypes: ['Beacon'] },
  { technology: 'NFC', idPrefix: 'NFC', valueLabel: 'UID', tagTypes: ['Label'] },
];

const hex = (seed: string, n: number) => {
  let out = '';
  for (let i = 0; out.length < n; i++) out += hashOf(`${seed}|${i}`).toString(16).toUpperCase().padStart(8, '0');
  return out.slice(0, n);
};

function ean13(seed: string): string {
  const body = ('890' + String(hashOf(seed)).padStart(10, '0')).slice(0, 12);
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

function valueOf(tech: string, id: string): string {
  switch (tech) {
    case 'Barcode': return ean13(id);
    case 'QR Code': return `https://assets360.example.com/a/${id.toLowerCase()}`;
    case 'BLE': return hex(id, 12).match(/../g)!.join(':');
    case 'NFC': return '04' + hex(id, 12);
    default: return 'E280' + hex(id, 20);
  }
}

type Row = [id: string, tech: string, tagType: string, asset: string | null, site: string, location: string, status: string, regDays: number, seenMin: number | null];

const ROWS: Row[] = [];
// every tracked asset carries a passive RFID hard tag and a barcode label
DEMO_ASSETS.forEach((a, i) => {
  ROWS.push([`RFID-${String(100101 + i)}`, 'Passive RFID', 'Hard Tag', a.regId, a.siteId, a.zone, 'Assigned', 380 - i * 7, 30 + i * 47]);
  ROWS.push([`BC-${String(200101 + i)}`, 'Barcode', 'Barcode Label', a.regId, a.siteId, a.zone, 'Assigned', 400 - i * 6, i % 3 ? 60 * 24 * (i % 9 + 1) : null]);
});
// BLE beacons on the mobile assets (the BLE asset tag devices)
const BLE: [string, string | null, string, string, number | null][] = [
  ['BLE-002001', 'REG-000101', 'SITE-CHN-01', 'Loading Dock A', 1], ['BLE-002002', 'REG-000102', 'SITE-CHN-01', 'Racking Aisles', 1],
  ['BLE-002003', 'REG-000201', 'SITE-BLR-01', 'High-Bay Racking', 1], ['BLE-002004', 'REG-000202', 'SITE-BLR-01', 'Inbound Staging', 1],
  ['BLE-002005', 'REG-000304', 'SITE-PUN-01', 'Assembly Line 1', 1], ['BLE-002006', 'REG-000405', 'SITE-HYD-01', 'Ante Room', 1],
  ['BLE-002007', null, 'SITE-DXB-01', 'Dispatch Apron', 5760],
];
for (const [id, a, site, loc, seen] of BLE) ROWS.push([id, 'BLE', 'Beacon', a, site, loc, a ? 'Assigned' : 'Available', 330, seen]);
// QR / NFC labels on mobile tools and vehicles
ROWS.push(['QR-000041', 'QR Code', 'QR Label', 'REG-000305', 'SITE-PUN-01', 'Tool Crib', 'Assigned', 120, 300]);
ROWS.push(['QR-000042', 'QR Code', 'QR Label', 'REG-000203', 'SITE-BLR-01', 'Truck Bays', 'Assigned', 118, 2900]);
ROWS.push(['QR-000043', 'QR Code', 'QR Label', 'REG-000204', 'SITE-BLR-01', 'Truck Bays', 'Assigned', 118, 4300]);
ROWS.push(['NFC-000012', 'NFC', 'Label', 'REG-000403', 'SITE-HYD-01', 'Reefer Dock', 'Assigned', 95, 600]);
ROWS.push(['NFC-000013', 'NFC', 'Label', 'REG-000502', 'SITE-DXB-01', 'Reefer Plug-in Area', 'Assigned', 80, 1500]);
ROWS.push(['RFID-300011', 'Active RFID', 'Hard Tag', 'REG-000403', 'SITE-HYD-01', 'Reefer Dock', 'Assigned', 210, 15]);
// stock and retired tags
const STOCK: [string, string, string, string, string, string, number][] = [
  ['RFID-100190', 'Passive RFID', 'Hard Tag', 'SITE-CHN-01', 'Stores – Tag stock', 'Available', 40],
  ['RFID-100191', 'Passive RFID', 'Hard Tag', 'SITE-CHN-01', 'Stores – Tag stock', 'Available', 40],
  ['RFID-100192', 'Passive RFID', 'Label', 'SITE-BLR-01', 'Admin Office', 'Available', 25],
  ['RFID-100193', 'Passive RFID', 'Label', 'SITE-BLR-01', 'Admin Office', 'Available', 25],
  ['BC-200190', 'Barcode', 'Barcode Label', 'SITE-PUN-01', 'Stores – Tag stock', 'Available', 18],
  ['BC-200191', 'Barcode', 'Barcode Label', 'SITE-PUN-01', 'Stores – Tag stock', 'Available', 18],
  ['QR-000050', 'QR Code', 'QR Label', 'SITE-HYD-01', 'Security Desk', 'Available', 12],
  ['BLE-002020', 'BLE', 'Beacon', 'SITE-CHN-01', 'Stores – Tag stock', 'Available', 9],
  ['BLE-002021', 'BLE', 'Beacon', 'SITE-BLR-01', 'Stores – Tag stock', 'Available', 9],
  ['NFC-000020', 'NFC', 'Label', 'SITE-DXB-01', 'Admin Office', 'Available', 6],
  ['RFID-100150', 'Passive RFID', 'Hard Tag', 'SITE-CHN-01', 'Scrap bin', 'Inactive', 520],
  ['BC-200150', 'Barcode', 'Barcode Label', 'SITE-BLR-01', 'Scrap bin', 'Inactive', 610],
  ['BLE-001990', 'BLE', 'Beacon', 'SITE-HYD-01', 'Returned to vendor', 'Inactive', 700],
];
for (const [id, tech, type, site, loc, status, days] of STOCK) ROWS.push([id, tech, type, null, site, loc, status, days, null]);

export const TAG_IDS: TagIdDto[] = ROWS.map(([tagId, tech, tagType, assetRef, siteId, location, status, regDays, seenMin], i) => {
  const a = assetByRef(assetRef);
  const site = siteById(siteId);
  const registered = isoDaysAgo(regDays);
  // two labels were printed with a bad value, so they fail validation
  const bad = tagId === 'BC-200107' || tagId === 'RFID-100192';
  return {
    id: `6650b8c7f6a9d0${String(i + 1).padStart(10, '0')}`,
    tagId,
    tagType,
    technology: tech,
    valueLabel: TAG_TECHNOLOGIES.find((t) => t.technology === tech)?.valueLabel ?? null,
    value: bad ? (tech === 'Barcode' ? '89012345' : 'E2801160') : valueOf(tech, tagId),
    registeredOn: registered,
    validation: bad ? 'Invalid' : 'Valid',
    validationMessage: bad ? (tech === 'Barcode' ? 'Barcode must be 12 or 13 digits' : 'EPC must be 24 hex characters (96-bit)') : null,
    assetRegistrationId: a?.regId ?? null,
    assetCode: a?.tag ?? null,
    assetName: a?.name ?? null,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    locationName: location,
    status,
    assignedAt: a ? isoDaysAgo(Math.max(1, regDays - 3)) : null,
    lastSeenAt: seenMin === null ? null : isoMinutesAgo(seenMin),
    createdBy: i % 2 ? 'priya.raman' : 'kavya.nair',
    createdAt: registered,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
});

