import { MANUFACTURERS, manufacturerCode } from './asset-model.legacy';
import { ManufacturerRecord, PaymentTerms } from '../../../asset/manufacturer/manufacturer.model';

/*
 * DEMO MODE: hard-coded manufacturers until the API is wired up. The first ten rows match the
 * approved design and the totals match it too (86 manufacturers, 8 inactive). They are the same
 * manufacturers the Asset Model master uses.
 */

export interface ManufacturerCountry {
  name: string;
  flag: string;
  dial: string;
}

export const MANUFACTURER_COUNTRIES: ManufacturerCountry[] = [
  { name: 'USA', flag: '🇺🇸', dial: '+1' },
  { name: 'China', flag: '🇨🇳', dial: '+86' },
  { name: 'Japan', flag: '🇯🇵', dial: '+81' },
  { name: 'South Korea', flag: '🇰🇷', dial: '+82' },
  { name: 'Taiwan', flag: '🇹🇼', dial: '+886' },
  { name: 'Germany', flag: '🇩🇪', dial: '+49' },
  { name: 'United Kingdom', flag: '🇬🇧', dial: '+44' },
  { name: 'France', flag: '🇫🇷', dial: '+33' },
  { name: 'Italy', flag: '🇮🇹', dial: '+39' },
  { name: 'Sweden', flag: '🇸🇪', dial: '+46' },
  { name: 'Finland', flag: '🇫🇮', dial: '+358' },
  { name: 'Denmark', flag: '🇩🇰', dial: '+45' },
  { name: 'Switzerland', flag: '🇨🇭', dial: '+41' },
  { name: 'Austria', flag: '🇦🇹', dial: '+43' },
  { name: 'Ireland', flag: '🇮🇪', dial: '+353' },
  { name: 'Liechtenstein', flag: '🇱🇮', dial: '+423' },
  { name: 'Latvia', flag: '🇱🇻', dial: '+371' },
  { name: 'Netherlands', flag: '🇳🇱', dial: '+31' },
  { name: 'India', flag: '🇮🇳', dial: '+91' },
  { name: 'United Arab Emirates', flag: '🇦🇪', dial: '+971' }
];

export const PAYMENT_TERMS: PaymentTerms[] = ['Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

export function countryInfo(name: string): ManufacturerCountry | undefined {
  return MANUFACTURER_COUNTRIES.find((c) => c.name === name);
}

// [name, code, country, contact, email, phone, brand colour, website, [line1, city, state, postal]]
type DesignSeed = [string, string, string, string, string, string, string, string, [string, string, string, string]];
const DESIGN_SEEDS: DesignSeed[] = [
  ['Dell', 'MFG-DELL', 'USA', 'John Smith', 'support@dell.com', '+1 800 624 9896', '#0076ce', 'https://www.dell.com', ['One Dell Way', 'Round Rock', 'Texas', '78682']],
  ['HP', 'MFG-HP', 'USA', 'Sarah Lee', 'enterprise@hp.com', '+1 800 474 6836', '#0096d6', 'https://www.hp.com', ['1501 Page Mill Road', 'Palo Alto', 'California', '94304']],
  ['Lenovo', 'MFG-LEN', 'China', 'Kevin Zhang', 'support@lenovo.com', '+86 400 100 6000', '#e2231a', 'https://www.lenovo.com', ['No. 6 Chuang Ye Road', 'Beijing', 'Beijing', '100085']],
  ['Cisco', 'MFG-CISCO', 'USA', 'Maria Lopez', 'support@cisco.com', '+1 800 553 6387', '#049fd9', 'https://www.cisco.com', ['170 West Tasman Drive', 'San Jose', 'California', '95134']],
  ['Samsung', 'MFG-SAM', 'South Korea', 'Ji-Hoon Park', 'b2b@samsung.com', '+82 1588 3366', '#1428a0', 'https://www.samsung.com', ['129 Samsung-ro', 'Suwon', 'Gyeonggi', '16677']],
  ['Apple', 'MFG-APL', 'USA', 'Michael Chen', 'enterprise@apple.com', '+1 800 692 7753', '#1f2937', 'https://www.apple.com', ['One Apple Park Way', 'Cupertino', 'California', '95014']],
  ['Extreme Networks', 'MFG-EXT', 'USA', 'David Wilson', 'support@extremenetworks.com', '+1 603 952 5000', '#7c3aed', 'https://www.extremenetworks.com', ['2121 RDU Center Drive', 'Morrisville', 'North Carolina', '27560']],
  ['Caterpillar', 'MFG-CAT', 'USA', 'Robert King', 'parts@cat.com', '+1 309 675 1000', '#ffcd11', 'https://www.cat.com', ['5205 N. O\'Connor Blvd', 'Irving', 'Texas', '75039']],
  ['Daikin', 'MFG-DAI', 'Japan', 'Yuki Tanaka', 'info@daikin.com', '+81 3 6716 0200', '#0097e0', 'https://www.daikin.com', ['Umeda Center Building', 'Osaka', 'Osaka', '530-8323']],
  ['Toyota', 'MFG-TOY', 'Japan', 'Hiroshi Sato', 'support@toyota.com', '+81 3 3817 7111', '#eb0a1e', 'https://www.toyota.com', ['1 Toyota-cho', 'Toyota City', 'Aichi', '471-8571']]
];

// Every other manufacturer: home country
const COUNTRY_OF: Record<string, string> = {
  Acer: 'Taiwan', Asus: 'Taiwan', Microsoft: 'USA', Epson: 'Japan', Canon: 'Japan', Brother: 'Japan', Xerox: 'USA',
  LG: 'South Korea', BenQ: 'Taiwan', Sony: 'Japan', Huawei: 'China', Juniper: 'USA', Aruba: 'USA', Fortinet: 'USA',
  'Palo Alto Networks': 'USA', Ubiquiti: 'USA', Netgear: 'USA', MikroTik: 'Latvia', Ruckus: 'USA', Hikvision: 'China',
  Axis: 'Sweden', Bosch: 'Germany', NetApp: 'USA', Synology: 'Taiwan', Cummins: 'USA', Perkins: 'United Kingdom',
  Kohler: 'USA', Haas: 'USA', 'DMG Mori': 'Germany', Mazak: 'Japan', 'Atlas Copco': 'Sweden', 'Ingersoll Rand': 'USA',
  Siemens: 'Germany', ABB: 'Switzerland', Grundfos: 'Denmark', KSB: 'Germany', Engel: 'Austria', Komatsu: 'Japan',
  Hyster: 'USA', Linde: 'Germany', Jungheinrich: 'Germany', Crown: 'USA', Nissan: 'Japan', Ford: 'USA', Isuzu: 'Japan',
  'Mercedes-Benz': 'Germany', Volvo: 'Sweden', Carrier: 'USA', 'Mitsubishi Electric': 'Japan', Gree: 'China',
  Midea: 'China', Hitachi: 'Japan', Trane: 'Ireland', York: 'USA', 'Johnson Controls': 'Ireland', Lennox: 'USA',
  APC: 'USA', Eaton: 'Ireland', Vertiv: 'USA', 'Schneider Electric': 'France', Legrand: 'France', Otis: 'USA',
  Schindler: 'Switzerland', KONE: 'Finland', Thyssenkrupp: 'Germany', Ariston: 'Italy', Rheem: 'USA', Kidde: 'USA',
  Tyco: 'Switzerland', Honeywell: 'USA', Makita: 'Japan', DeWalt: 'USA', Hilti: 'Liechtenstein', Fluke: 'USA',
  'Herman Miller': 'USA', Steelcase: 'USA'
};

// City, state and postal code used for a country's generated headquarters
const HQ_OF: Record<string, [string, string, string]> = {
  USA: ['New York', 'New York', '10001'],
  China: ['Shenzhen', 'Guangdong', '518000'],
  Japan: ['Tokyo', 'Tokyo', '100-0005'],
  'South Korea': ['Seoul', 'Seoul', '04524'],
  Taiwan: ['Taipei', 'Taipei', '110'],
  Germany: ['Munich', 'Bavaria', '80333'],
  'United Kingdom': ['Peterborough', 'Cambridgeshire', 'PE1 5FQ'],
  France: ['Rueil-Malmaison', 'Ile-de-France', '92500'],
  Italy: ['Fabriano', 'Marche', '60044'],
  Sweden: ['Stockholm', 'Stockholm', '111 20'],
  Finland: ['Espoo', 'Uusimaa', '02150'],
  Denmark: ['Bjerringbro', 'Central Jutland', '8850'],
  Switzerland: ['Zurich', 'Zurich', '8001'],
  Austria: ['Schwertberg', 'Upper Austria', '4311'],
  Ireland: ['Dublin', 'Leinster', 'D02 R296'],
  Liechtenstein: ['Schaan', 'Schaan', '9494'],
  Latvia: ['Riga', 'Riga', 'LV-1009']
};

const INACTIVE = ['Gree', 'MikroTik', 'BenQ', 'Rheem', 'Kohler', 'York', 'Netgear', 'Engel'];

const CONTACTS = [
  'Anna Becker', 'Lars Nilsson', 'Chen Wei', 'Emma Clarke', 'Kenji Mori', 'Sofia Rossi', 'James Carter', 'Mei Lin',
  'Thomas Weber', 'Olivia Brown', 'Hannah Schmidt', 'Daniel Kim', 'Laura Martin', 'Ahmed Khan', 'Mikko Virtanen', 'Peter Hansen'
];
const DESIGNATIONS = ['Enterprise Sales Manager', 'Key Account Manager', 'Regional Sales Director', 'Channel Partner Manager'];
const PALETTE = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#c2410c', '#334155', '#9333ea'];

const DOMAIN_OVERRIDES: Record<string, string> = {
  'Palo Alto Networks': 'paloaltonetworks.com',
  'Mercedes-Benz': 'mercedes-benz.com',
  'Mitsubishi Electric': 'mitsubishielectric.com',
  'Johnson Controls': 'johnsoncontrols.com'
};

function domainOf(name: string): string {
  return DOMAIN_OVERRIDES[name] ?? `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
}

function phoneFor(dial: string, n: number): string {
  return `${dial} ${200 + ((n * 37) % 700)} ${100 + ((n * 53) % 900)} ${1000 + ((n * 7919) % 9000)}`;
}

/** Short label shown in the logo badge: DELL, HP, EN for Extreme Networks, L for Lenovo. */
export function badgeText(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
  return name.length <= 4 ? name.toUpperCase() : name[0].toUpperCase();
}

/** Dark text on light brand colours (e.g. Caterpillar yellow), white otherwise. */
export function badgeInk(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 12) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

function record(i: number, name: string, code: string, country: string, contact: string, email: string, phone: string, color: string, website: string, hq: [string, string, string, string]): ManufacturerRecord {
  const domain = website.replace(/^https?:\/\/(www\.)?/, '');
  const dial = countryInfo(country)?.dial ?? '+1';
  const second = CONTACTS[(i * 5 + 3) % CONTACTS.length];
  const [first, last] = second.toLowerCase().split(' ');
  return {
    code,
    name,
    country,
    website,
    description: `${name} manufactures equipment used across the organization.`,
    logo: null,
    brandColor: color,
    status: INACTIVE.includes(name) ? 'Inactive' : 'Active',
    primaryContact: contact,
    designation: DESIGNATIONS[i % DESIGNATIONS.length],
    email,
    phone,
    secondaryContact: second,
    secondaryEmail: `${first}.${last}@${domain}`,
    secondaryPhone: phoneFor(dial, i + 97),
    address: { line1: hq[0], line2: '', city: hq[1], state: hq[2], postalCode: hq[3], country },
    supportPortal: `${website}/support`,
    supportEmail: `support@${domain}`,
    supportPhone: phone,
    standardWarrantyMonths: [12, 24, 36][i % 3],
    slaResponseHours: [4, 8, 24, 48][i % 4],
    defaultCurrency: country === 'USA' ? 'USD - US Dollar' : 'AED - UAE Dirham',
    paymentTerms: (['Net 30', 'Net 45', 'Net 60', 'Net 30'] as PaymentTerms[])[i % 4],
    preferred: i < 10 || i % 4 === 0,
    warrantyRegistration: i % 3 !== 2,
    autoCreateWarranty: true,
    documents: 1 + ((i * 3) % 7),
    createdOn: i === 0 ? '2024-01-12T10:30' : stamp(i * 5),
    createdBy: i === 0 ? 'Rex Kumar' : ['Rex Kumar', 'Aisha Rahman', 'Karthik R'][i % 3],
    updatedOn: i === 0 ? '2026-10-15T14:45' : stamp(i * 5 + 180 + (i % 40) * 4)
  };
}

export function initialManufacturers(): ManufacturerRecord[] {
  const designed = DESIGN_SEEDS.map(([name, code, country, contact, email, phone, color, website, hq], i) =>
    record(i, name, code, country, contact, email, phone, color, website, hq)
  );
  Object.assign(designed[0], {
    description: 'Global technology company providing IT infrastructure, computers and related equipment.',
    designation: 'Enterprise Sales Manager',
    secondaryContact: 'Emily Davis',
    secondaryEmail: 'emily.davis@dell.com',
    secondaryPhone: '+1 512 728 7000',
    supportPortal: 'https://www.dell.com/support',
    supportEmail: 'support@dell.com',
    standardWarrantyMonths: 36,
    documents: 6
  });

  const usedCodes = new Set(designed.map((r) => r.code));
  const others = MANUFACTURERS.filter((m) => !DESIGN_SEEDS.some((d) => d[0] === m)).map((name, k) => {
    const i = k + DESIGN_SEEDS.length;
    const country = COUNTRY_OF[name] ?? 'USA';
    const [city, state, postal] = HQ_OF[country] ?? HQ_OF['USA'];
    // Fall back to four letters when three clash (Juniper / Jungheinrich)
    let code = `MFG-${manufacturerCode(name)}`;
    if (usedCodes.has(code)) code = `MFG-${name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}`;
    for (let n = 2; usedCodes.has(code); n++) code = `MFG-${manufacturerCode(name)}${n}`;
    usedCodes.add(code);
    const domain = domainOf(name);
    const dial = countryInfo(country)?.dial ?? '+1';
    return record(
      i,
      name,
      code,
      country,
      CONTACTS[k % CONTACTS.length],
      `${['support', 'sales', 'info', 'enterprise'][k % 4]}@${domain}`,
      phoneFor(dial, i),
      PALETTE[k % PALETTE.length],
      `https://www.${domain}`,
      [`${100 + ((k * 37) % 800)} ${name} Plaza`, city, state, postal]
    );
  });
  return [...designed, ...others];
}

export function blankManufacturer(): ManufacturerRecord {
  return {
    code: '',
    name: '',
    country: '',
    website: '',
    description: '',
    logo: null,
    brandColor: PALETTE[0],
    status: 'Active',
    primaryContact: '',
    designation: '',
    email: '',
    phone: '',
    secondaryContact: '',
    secondaryEmail: '',
    secondaryPhone: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    supportPortal: '',
    supportEmail: '',
    supportPhone: '',
    standardWarrantyMonths: 12,
    slaResponseHours: 24,
    defaultCurrency: 'AED - UAE Dirham',
    paymentTerms: 'Net 30',
    preferred: false,
    warrantyRegistration: true,
    autoCreateWarranty: true,
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}

export const BRAND_PALETTE = PALETTE;
