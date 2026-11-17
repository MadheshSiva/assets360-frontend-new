import { OrganizationRecord, OrganizationSettings } from './organization.model';

/* Option lists for the organization forms (also used by other masters). */

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
    address: { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' },
    contact: { person: '', designation: '', email: '', phoneCountry: '', phone: '' },
    settings: { ...GULF_SETTINGS, currency: '', timeZone: '', language: '', dateFormat: '', effectiveFrom: new Date().toISOString().slice(0, 10) },
    createdOn: '',
    updatedOn: ''
  };
}
