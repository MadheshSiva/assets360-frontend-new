import { OrganizationRecord, OrganizationSettings } from '../../../organization/organization/organization.model';

/* DEMO MODE: hard-coded organizations from the approved design until the API is wired up. */

export const COUNTRIES = [
  { name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { name: 'Oman', dial: '+968', flag: '🇴🇲' },
  { name: 'Kuwait', dial: '+965', flag: '🇰🇼' },
  { name: 'Bahrain', dial: '+973', flag: '🇧🇭' },
  { name: 'India', dial: '+91', flag: '🇮🇳' },
  { name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { name: 'United States', dial: '+1', flag: '🇺🇸' }
];

export const CURRENCIES = [
  'AED - UAE Dirham',
  'SAR - Saudi Riyal',
  'QAR - Qatari Riyal',
  'OMR - Omani Rial',
  'KWD - Kuwaiti Dinar',
  'BHD - Bahraini Dinar',
  'INR - Indian Rupee',
  'USD - US Dollar',
  'GBP - British Pound',
  'EUR - Euro'
];

export const TIME_ZONES = [
  '(GMT+04:00) Dubai',
  '(GMT+03:00) Riyadh',
  '(GMT+03:00) Qatar',
  '(GMT+04:00) Muscat',
  '(GMT+05:30) Kolkata',
  '(GMT+00:00) London',
  '(GMT-05:00) New York'
];

export const LANGUAGES = ['English', 'Arabic', 'Hindi'];
export const DATE_FORMATS = ['DD-MMM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

function svgLogo(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Simple stand-in logos drawn after the design
const LOGOS = {
  dcs: svgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" rx="8" fill="#7c3aed"/><path d="M13 11h8a9 9 0 0 1 0 18h-8z" fill="#fff"/><path d="M17 15h4a5 5 0 0 1 0 10h-4z" fill="#7c3aed"/><rect x="13" y="22" width="4" height="7" fill="#c026d3"/></svg>'
  ),
  dcsUae: svgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M5 25c5-9 9-9 13-3s8 6 13-3" fill="none" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/><path d="M9 29c5-9 9-9 13-3s8 6 13-3" fill="none" stroke="#1d4ed8" stroke-width="4" stroke-linecap="round"/></svg>'
  ),
  dcsKsa: svgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 15c-2 8-3 14-3 21h6c0-7-1-13-3-21z" fill="#a16207"/><path d="M20 15c-5-6-11-5-14-1 5-1 9 0 14 1zM20 15c5-6 11-5 14-1-5-1-9 0-14 1zM20 15c-3-5-2-10 2-12-1 4-1 8-2 12zM20 15c-7 0-11 4-11 9 3-4 7-7 11-9zM20 15c7 0 11 4 11 9-3-4-7-7-11-9z" fill="#16a34a"/></svg>'
  ),
  piq: svgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 3l15 8.5v17L20 37 5 28.5v-17z" fill="#6d28d9"/><path d="M20 3l15 8.5L20 20 5 11.5z" fill="#a78bfa"/><path d="M20 20l15-8.5v17L20 37z" fill="#4c1d95"/></svg>'
  )
};

const GULF_SETTINGS: OrganizationSettings = {
  currency: 'AED - UAE Dirham',
  timeZone: '(GMT+04:00) Dubai',
  language: 'English',
  dateFormat: 'DD-MMM-YYYY',
  effectiveFrom: '2020-01-01',
  effectiveTo: '',
  allowSubOrganizations: true,
  allowMultipleLocations: true,
  useForAssetNumbering: true,
  enableFinancialTracking: false
};

export function initialOrganizations(): OrganizationRecord[] {
  return [
    {
      code: 'DCS',
      name: 'DCS Group',
      type: 'Head Office',
      parentCode: null,
      logo: LOGOS.dcs,
      registrationNumber: '100245781',
      website: 'https://www.dcsgroup.ae',
      description: 'Group holding company for the Data Capture Systems businesses.',
      businessUnits: 5,
      sites: 12,
      status: 'Active',
      address: { line1: 'Office 1801, JLT', line2: 'Cluster A, Jumeirah Lakes Towers', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      contact: { person: 'Rex Kumar', designation: 'Group CEO', email: 'rex@dcsgroup.ae', phoneCountry: 'United Arab Emirates', phone: '50 100 2000' },
      settings: { ...GULF_SETTINGS, effectiveFrom: '2015-01-01', enableFinancialTracking: true },
      createdOn: '2024-01-02T09:00',
      updatedOn: '2026-09-14T11:20'
    },
    {
      code: 'DCS-UAE',
      name: 'Data Capture Systems LLC',
      type: 'Legal Entity',
      parentCode: 'DCS',
      logo: LOGOS.dcsUae,
      registrationNumber: '123456789',
      website: 'https://www.dcs.ae',
      description: 'Data Capture Systems LLC is a systems integrator providing networking, security, AV, IoT and AI solutions across GCC.',
      businessUnits: 6,
      sites: 18,
      status: 'Active',
      address: { line1: 'Office 1201, JLT', line2: 'Cluster A, Jumeirah Lakes Towers', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      contact: { person: 'Rex Kumar', designation: 'Managing Director', email: 'rex@dcs.ae', phoneCountry: 'United Arab Emirates', phone: '50 123 4567' },
      settings: { ...GULF_SETTINGS },
      createdOn: '2024-01-02T09:30',
      updatedOn: '2026-10-18T16:05'
    },
    {
      code: 'DCS-KSA',
      name: 'Data Capture Systems KSA',
      type: 'Legal Entity',
      parentCode: 'DCS',
      logo: LOGOS.dcsKsa,
      registrationNumber: '1010567890',
      website: 'https://www.dcs-ksa.com',
      description: 'Saudi entity delivering DCS integration and managed services in the Kingdom.',
      businessUnits: 2,
      sites: 5,
      status: 'Active',
      address: { line1: 'Office 402, Al Faisaliah Tower', line2: 'King Fahd Road, Al Olaya', city: 'Riyadh', state: 'Riyadh', country: 'Saudi Arabia', postalCode: '12212' },
      contact: { person: 'Faisal Al Harbi', designation: 'Country Manager', email: 'faisal@dcs-ksa.com', phoneCountry: 'Saudi Arabia', phone: '55 234 5678' },
      settings: { ...GULF_SETTINGS, currency: 'SAR - Saudi Riyal', timeZone: '(GMT+03:00) Riyadh', effectiveFrom: '2021-04-01' },
      createdOn: '2024-01-03T10:15',
      updatedOn: '2026-08-30T09:40'
    },
    {
      code: 'PIQ',
      name: 'Purple IQ Technologies',
      type: 'Subsidiary',
      parentCode: 'DCS',
      logo: LOGOS.piq,
      registrationNumber: '987654321',
      website: 'https://www.purpleiq.ai',
      description: 'Product company behind the Asset360 and People360 platforms.',
      businessUnits: 2,
      sites: 4,
      status: 'Active',
      address: { line1: 'Office 1205, JLT', line2: 'Cluster A, Jumeirah Lakes Towers', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      contact: { person: 'Aisha Rahman', designation: 'General Manager', email: 'aisha@purpleiq.ai', phoneCountry: 'United Arab Emirates', phone: '52 345 6789' },
      settings: { ...GULF_SETTINGS, effectiveFrom: '2022-06-01', allowSubOrganizations: false },
      createdOn: '2024-01-05T14:00',
      updatedOn: '2026-10-02T12:30'
    },
    {
      code: 'DEMO',
      name: 'Demo Organization',
      type: 'Subsidiary',
      parentCode: null,
      logo: null,
      registrationNumber: '',
      website: '',
      description: 'Sandbox organization used for demos and training.',
      businessUnits: 0,
      sites: 0,
      status: 'Inactive',
      address: { line1: '', line2: '', city: '', state: '', country: 'United Arab Emirates', postalCode: '' },
      contact: { person: '', designation: '', email: '', phoneCountry: 'United Arab Emirates', phone: '' },
      settings: { ...GULF_SETTINGS, effectiveFrom: '2024-02-01', effectiveTo: '2025-12-31', allowSubOrganizations: false, useForAssetNumbering: false },
      createdOn: '2024-02-01T08:00',
      updatedOn: '2026-01-05T10:00'
    }
  ];
}

export function blankOrganization(): OrganizationRecord {
  return {
    code: '',
    name: '',
    type: '' as OrganizationRecord['type'],
    parentCode: null,
    logo: null,
    registrationNumber: '',
    website: '',
    description: '',
    businessUnits: 0,
    sites: 0,
    status: 'Active',
    address: { line1: '', line2: '', city: '', state: '', country: 'United Arab Emirates', postalCode: '' },
    contact: { person: '', designation: '', email: '', phoneCountry: 'United Arab Emirates', phone: '' },
    settings: { ...GULF_SETTINGS, effectiveFrom: new Date().toISOString().slice(0, 10) },
    createdOn: '',
    updatedOn: ''
  };
}
