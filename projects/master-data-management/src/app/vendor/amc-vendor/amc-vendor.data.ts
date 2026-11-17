import { blankVendorBase } from '../vendor.data';
import { AmcVendorRecord } from './amc-vendor.model';

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

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
    currency: '',
    billingCycle: '',
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
