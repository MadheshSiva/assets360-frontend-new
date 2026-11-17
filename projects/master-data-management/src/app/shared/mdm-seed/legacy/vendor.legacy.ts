import { VendorAddress, VendorBase, VendorDocument } from '../../../vendor/vendor.model';

/* DEMO MODE: lists shared by the Vendor masters until they come from the API. */

export const VENDOR_COUNTRIES = [
  { name: 'UAE', flag: '🇦🇪', dial: '+971' },
  { name: 'Saudi Arabia', flag: '🇸🇦', dial: '+966' },
  { name: 'Qatar', flag: '🇶🇦', dial: '+974' },
  { name: 'Oman', flag: '🇴🇲', dial: '+968' },
  { name: 'Kuwait', flag: '🇰🇼', dial: '+965' },
  { name: 'Bahrain', flag: '🇧🇭', dial: '+973' },
  { name: 'India', flag: '🇮🇳', dial: '+91' },
  { name: 'USA', flag: '🇺🇸', dial: '+1' },
  { name: 'China', flag: '🇨🇳', dial: '+86' },
  { name: 'Japan', flag: '🇯🇵', dial: '+81' },
  { name: 'South Korea', flag: '🇰🇷', dial: '+82' },
  { name: 'Germany', flag: '🇩🇪', dial: '+49' },
  { name: 'France', flag: '🇫🇷', dial: '+33' },
  { name: 'United Kingdom', flag: '🇬🇧', dial: '+44' },
  { name: 'Switzerland', flag: '🇨🇭', dial: '+41' },
  { name: 'Sweden', flag: '🇸🇪', dial: '+46' },
  { name: 'Finland', flag: '🇫🇮', dial: '+358' },
  { name: 'Ireland', flag: '🇮🇪', dial: '+353' }
];

export const DOCUMENT_TYPES = ['Trade Licence', 'VAT Certificate', 'Insurance', 'ISO Certificate', 'Contract', 'Bank Letter', 'Other'];
export const VENDOR_PALETTE = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#c2410c', '#334155', '#9333ea'];

// Name parts for generated vendors
export const NAME_PREFIXES = ['Gulf', 'Emirates', 'Al Noor', 'Delta', 'Prime', 'Apex', 'Crescent', 'Desert', 'Falcon', 'Horizon', 'Oasis', 'Pearl', 'Royal', 'Summit', 'Unity', 'Arabian', 'Bluewave', 'Coastal'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2024-01-01 becomes 01-Jan-2024. */
export function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : value || '-';
}

export function countryFlag(name: string): string {
  return VENDOR_COUNTRIES.find((c) => c.name === name)?.flag ?? '';
}

export function countryDial(name: string): string {
  return VENDOR_COUNTRIES.find((c) => c.name === name)?.dial ?? '+971';
}

export function vendorPhone(country: string, n: number): string {
  return `${countryDial(country)} ${1 + (n % 9)} ${100 + ((n * 37) % 900)} ${1000 + ((n * 7919) % 9000)}`;
}

/** Website domain from a name: "TechCare Solutions" gives techcaresolutions.ae for UAE firms. */
export function domainFor(name: string, country: string): string {
  const tld = { UAE: 'ae', Oman: 'om', Qatar: 'qa', 'Saudi Arabia': 'sa', Kuwait: 'kw', Bahrain: 'bh' }[country] ?? 'com';
  return `${name.toLowerCase().replace(/\b(llc|co)\b/g, '').replace(/[^a-z0-9]/g, '')}.${tld}`;
}

export function blankAddress(country = ''): VendorAddress {
  return { line1: '', line2: '', city: '', state: '', postalCode: '', country };
}

export function demoDocuments(seed: number, kinds: string[]): VendorDocument[] {
  return kinds.map((type, i) => ({
    name: `${type} ${2024 + ((seed + i) % 3)}`,
    type,
    expiry: type === 'Trade Licence' || type === 'Insurance' ? `${2026 + ((seed + i) % 2)}-${String(1 + ((seed * 5 + i) % 12)).padStart(2, '0')}-28` : ''
  }));
}

/** Base fields for a new vendor of any type. */
export function blankVendorBase(): VendorBase {
  return {
    code: '',
    name: '',
    logo: null,
    brandColor: VENDOR_PALETTE[0],
    website: '',
    contactPerson: '',
    email: '',
    phone: '',
    status: 'Active',
    address: blankAddress(),
    alternateContact: '',
    alternateEmail: '',
    alternatePhone: '',
    documents: [],
    createdOn: '',
    updatedOn: ''
  };
}

export const WEB_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
