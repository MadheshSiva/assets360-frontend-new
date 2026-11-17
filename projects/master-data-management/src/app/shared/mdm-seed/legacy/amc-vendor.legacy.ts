import { VENDOR_PALETTE, blankAddress, blankVendorBase, demoDocuments, vendorPhone } from './vendor.legacy';
import { AmcVendorRecord } from '../../../vendor/amc-vendor/amc-vendor.model';

/* DEMO MODE: 28 AMC vendors; the first five match the approved design. */

export const AMC_ASSET_TYPES = [
  'Network Equipment', 'Machinery', 'HVAC', 'Elevators', 'Communication Systems', 'Fire Safety', 'Power & UPS',
  'Security Systems', 'IT Hardware', 'Vehicles', 'Generators', 'Pumps & Compressors'
];
export const CONTRACT_TYPES = ['Comprehensive AMC', 'Non-Comprehensive AMC', 'Preventive Maintenance', 'Support & Maintenance', 'On-call Support', 'Warranty Extension'];
export const BILLING_CYCLES = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'Upfront'];

// Asset types on the Asset Model page that each AMC asset type usually covers
export const MODEL_TYPES_FOR: Record<string, string[]> = {
  'Network Equipment': ['Network Switch', 'Access Point', 'Router', 'Firewall', 'Wireless Controller'],
  Machinery: ['Generator', 'CNC Machine', 'Compressor', 'Conveyor', 'Lathe', 'Injection Moulding Machine'],
  HVAC: ['Air Conditioner', 'Chiller', 'Cooling Tower', 'Fan Coil Unit'],
  Elevators: ['Elevator'],
  'Communication Systems': ['Mobile Device'],
  'Fire Safety': ['Fire Extinguisher', 'Fire Alarm Panel'],
  'Power & UPS': ['UPS', 'Transformer', 'Distribution Panel'],
  'Security Systems': ['CCTV Camera'],
  'IT Hardware': ['Laptop', 'Desktop', 'Server', 'Printer', 'Monitor', 'Storage Array'],
  Vehicles: ['Forklift', 'Reach Truck', 'Pickup Truck', 'Van', 'Bus'],
  Generators: ['Generator'],
  'Pumps & Compressors': ['Pump', 'Compressor']
};

// [code, name, asset type, contract type, start, end, contact, phone, inactive?, colour, country, manufacturer whose models are covered]
type Seed = [string, string, string, string, string, string, string, string, boolean, string, string, string];
const SEEDS: Seed[] = [
  ['AMC-001', 'Extreme Networks', 'Network Equipment', 'Comprehensive AMC', '2024-01-01', '2026-12-31', 'David Wilson', '+1 603 952 5000', false, '#7c3aed', 'USA', 'Extreme Networks'],
  ['AMC-002', 'Caterpillar', 'Machinery', 'Preventive Maintenance', '2024-02-15', '2027-02-14', 'Robert King', '+1 309 675 1000', false, '#ffcd11', 'USA', 'Caterpillar'],
  ['AMC-003', 'Daikin', 'HVAC', 'Comprehensive AMC', '2024-03-10', '2027-03-09', 'Yuki Tanaka', '+81 3 6716 0200', false, '#0097e0', 'Japan', 'Daikin'],
  ['AMC-004', 'OTIS', 'Elevators', 'Comprehensive AMC', '2024-04-01', '2027-03-31', 'Hiroshi Sato', '+81 3 3817 7111', false, '#1f2937', 'USA', 'Otis'],
  ['AMC-005', 'Avaya', 'Communication Systems', 'Support & Maintenance', '2024-05-20', '2027-05-19', 'Linda Chen', '+1 408 331 3000', true, '#dc2626', 'USA', '']
];

// [name, asset type, country] for the rest; most are OEMs that also appear as manufacturers
const OTHERS: [string, string, string][] = [
  ['Carrier', 'HVAC', 'USA'], ['Schindler', 'Elevators', 'Switzerland'], ['KONE', 'Elevators', 'Finland'], ['Siemens', 'Power & UPS', 'Germany'],
  ['ABB', 'Power & UPS', 'Switzerland'], ['Honeywell', 'Fire Safety', 'USA'], ['Johnson Controls', 'HVAC', 'Ireland'], ['Trane', 'HVAC', 'Ireland'],
  ['Vertiv', 'Power & UPS', 'USA'], ['Eaton', 'Power & UPS', 'Ireland'], ['APC', 'Power & UPS', 'USA'], ['Cummins', 'Generators', 'USA'],
  ['Atlas Copco', 'Pumps & Compressors', 'Sweden'], ['Grundfos', 'Pumps & Compressors', 'Germany'], ['Hikvision', 'Security Systems', 'China'],
  ['Bosch', 'Security Systems', 'Germany'], ['Fortinet', 'Network Equipment', 'USA'], ['Dell', 'IT Hardware', 'USA'], ['HP', 'IT Hardware', 'USA'],
  ['Cisco', 'Network Equipment', 'USA'], ['Kidde', 'Fire Safety', 'USA'], ['Tyco', 'Fire Safety', 'Switzerland'], ['Toyota', 'Vehicles', 'Japan']
];
const CONTACTS = ['Paul Andrews', 'Nikhil Shah', 'Emma Lindqvist', 'Hans Muller', 'Aisha Noor', 'Carlos Ruiz', 'Wei Zhang', 'Sophie Laurent'];

/** Whose models a seeded contract covers; the service turns this into model codes. */
export interface AmcSeedCoverage {
  manufacturer: string;
  assetType: string;
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function build(i: number, [code, name, assetType, contractType, startDate, endDate, contactPerson, phone, inactive, brandColor]: Seed): AmcVendorRecord {
  const domain = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const comprehensive = contractType === 'Comprehensive AMC';
  return {
    ...blankVendorBase(),
    code,
    name,
    brandColor,
    website: `https://www.${domain}`,
    contactPerson,
    email: `service@${domain}`,
    phone,
    status: inactive ? 'Inactive' : 'Active',
    address: { ...blankAddress('UAE'), line1: `${name} Middle East, Dubai Silicon Oasis`, city: 'Dubai', state: 'Dubai' },
    alternateContact: 'Service Desk',
    alternateEmail: `support@${domain}`,
    documents: demoDocuments(i, ['Contract', 'Insurance']),
    assetType,
    contractType,
    startDate,
    endDate,
    contractNo: `AMC/${startDate.slice(0, 4)}/${String(101 + i)}`,
    contractValue: 40000 + ((i * 37) % 20) * 15000,
    currency: 'AED - UAE Dirham',
    billingCycle: BILLING_CYCLES[i % 4],
    renewalNoticeDays: [30, 60, 90][i % 3],
    autoRenew: i % 3 === 0,
    coveredModels: [],
    visitsPerYear: comprehensive ? 12 : contractType === 'Preventive Maintenance' ? 4 : 2,
    responseHours: comprehensive ? 4 : 8,
    resolutionHours: comprehensive ? 24 : 48,
    uptimePercent: comprehensive ? 99.5 : 98,
    penaltyPerHour: comprehensive ? 250 : null,
    notifyBeforeExpiry: true,
    serviceReportRequired: true,
    createdOn: new Date(`${startDate}T09:00:00Z`).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 1, 1) + i * 6 * 86400000).toISOString().slice(0, 16)
  };
}

export function initialAmcVendors(): { records: AmcVendorRecord[]; coverage: AmcSeedCoverage[] } {
  const seeds: Seed[] = [...SEEDS];
  OTHERS.forEach(([name, assetType, country], k) => {
    const i = SEEDS.length + k;
    // Some contracts end soon or have ended, so the renewal flags show
    const start = `${2024 + (k % 2)}-${String(1 + ((k * 5) % 12)).padStart(2, '0')}-01`;
    const end = k === 3 ? '2026-11-30' : k === 8 ? '2026-12-20' : k === 14 ? '2026-06-30' : addYears(start, 3);
    seeds.push([
      `AMC-${String(i + 1).padStart(3, '0')}`,
      name,
      assetType,
      CONTRACT_TYPES[(k * 5) % CONTRACT_TYPES.length],
      start,
      end,
      CONTACTS[k % CONTACTS.length],
      vendorPhone(country === 'USA' ? 'USA' : 'UAE', i + 70),
      k % 10 === 9,
      VENDOR_PALETTE[k % VENDOR_PALETTE.length],
      country,
      name
    ]);
  });
  return {
    records: seeds.map((s, i) => build(i, s)),
    coverage: seeds.map((s) => ({ manufacturer: s[11], assetType: s[2] }))
  };
}

export function blankAmcVendor(): AmcVendorRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...blankVendorBase(),
    assetType: '',
    contractType: '',
    startDate: today,
    endDate: addYears(today, 1),
    contractNo: '',
    contractValue: null,
    currency: 'AED - UAE Dirham',
    billingCycle: 'Yearly',
    renewalNoticeDays: 60,
    autoRenew: false,
    coveredModels: [],
    visitsPerYear: 4,
    responseHours: 8,
    resolutionHours: 48,
    uptimePercent: 98,
    penaltyPerHour: null,
    notifyBeforeExpiry: true,
    serviceReportRequired: true
  };
}
