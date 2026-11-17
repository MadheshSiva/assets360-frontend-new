import { NAME_PREFIXES, VENDOR_PALETTE, blankAddress, blankVendorBase, demoDocuments, domainFor, vendorPhone } from './vendor.legacy';
import { SupplierRecord } from '../../../vendor/supplier/supplier.model';

/* DEMO MODE: 58 suppliers; the first five match the approved design. */

export const SUPPLIER_CATEGORIES = [
  'IT Hardware', 'Network Equipment', 'Electrical Equipment', 'Spare Parts', 'HVAC Equipment', 'Safety Equipment',
  'Office Supplies', 'Tools & Hardware', 'Consumables', 'Software', 'Furniture', 'Vehicles & Fleet'
];
export const PAYMENT_TERMS = ['Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

// [code, name, category, country, contact, phone, email, rating, colour, brands, city]
type Seed = [string, string, string, string, string, string, string, number, string, string[], string];
const SEEDS: Seed[] = [
  ['SUP-001', 'Dell Technologies', 'IT Hardware', 'USA', 'John Smith', '+1 800 624 9896', 'sales@dell.com', 4.8, '#0076ce', ['Dell'], 'Round Rock'],
  ['SUP-002', 'Lenovo', 'IT Hardware', 'China', 'Kevin Zhang', '+86 400 100 6000', 'sales@lenovo.com', 4.5, '#e2231a', ['Lenovo'], 'Beijing'],
  ['SUP-003', 'HP', 'IT Hardware', 'USA', 'Sarah Lee', '+1 800 474 6836', 'enterprise@hp.com', 4.6, '#0096d6', ['HP'], 'Palo Alto'],
  ['SUP-004', 'Cisco', 'Network Equipment', 'USA', 'Maria Lopez', '+1 800 553 6387', 'sales@cisco.com', 4.7, '#049fd9', ['Cisco'], 'San Jose'],
  ['SUP-005', 'Schneider Electric', 'Electrical Equipment', 'France', 'Pierre Dubois', '+33 1 41 29 70 00', 'contact@se.com', 4.3, '#3dcd58', ['Schneider Electric', 'APC'], 'Rueil-Malmaison']
];

const SUFFIXES = ['Trading LLC', 'Supplies', 'Industrial Supplies', 'Technologies', 'Distribution'];
const GULF = ['UAE', 'UAE', 'UAE', 'Saudi Arabia', 'Oman', 'Qatar', 'India', 'Germany'];
const CONTACTS = ['Ali Hassan', 'Ravi Menon', 'Fatima Noor', 'George Mathew', 'Samir Khoury', 'Anjali Rao', 'Mark Evans', 'Huda Saeed', 'Tom Becker', 'Leena Das'];
const BRANDS = ['Siemens', 'ABB', 'Bosch', 'Makita', 'Honeywell', 'Grundfos', 'Daikin', 'Carrier', 'Hikvision', 'Microsoft', 'Kidde', 'Fluke'];
const TOTAL = 58;

function stamp(day: number): string {
  return new Date(Date.UTC(2023, 8, 1) + day * 86400000).toISOString().slice(0, 16);
}

function build(i: number, [code, name, category, country, contactPerson, phone, email, rating, brandColor, brands, city]: Seed): SupplierRecord {
  const domain = email.split('@')[1];
  const inactive = i >= SEEDS.length && i % 11 === 4;
  return {
    ...blankVendorBase(),
    code,
    name,
    logo: null,
    brandColor,
    website: `https://www.${domain}`,
    contactPerson,
    email,
    phone,
    status: inactive ? 'Inactive' : 'Active',
    address: { ...blankAddress(country), line1: `${10 + (i % 90)} Business Bay Road`, city },
    alternateContact: 'Accounts Team',
    alternateEmail: `accounts@${domain}`,
    alternatePhone: '',
    documents: demoDocuments(i, ['Trade Licence', 'VAT Certificate']),
    category,
    country,
    rating,
    products: [`${category} items`],
    assetCategories: [],
    brands,
    currency: country === 'UAE' ? 'AED - UAE Dirham' : 'USD - US Dollar',
    paymentTerms: PAYMENT_TERMS[2 + (i % 3)],
    creditLimit: 50000 + (i % 8) * 25000,
    trn: country === 'UAE' ? `1000${String(234567890 + i * 7919).slice(0, 11)}` : '',
    bankName: ['Emirates NBD', 'ADCB', 'Mashreq', 'FAB', 'HSBC'][i % 5],
    iban: `AE07 0331 2345 6789 01${String(1000 + i).slice(-4)}`,
    preferred: i < SEEDS.length || i % 5 === 0,
    approved: !inactive,
    portalAccess: i % 3 !== 2,
    emailPurchaseOrders: true,
    createdOn: stamp(i * 4),
    updatedOn: stamp(500 + i * 3)
  };
}

export function initialSuppliers(): SupplierRecord[] {
  const list = SEEDS.map((seed, i) => build(i, seed));
  for (let i = SEEDS.length; i < TOTAL; i++) {
    const k = i - SEEDS.length;
    const name = `${NAME_PREFIXES[k % NAME_PREFIXES.length]} ${SUFFIXES[(k * 7) % SUFFIXES.length]}`;
    const country = GULF[k % GULF.length];
    const category = SUPPLIER_CATEGORIES[(k * 5 + 2) % SUPPLIER_CATEGORIES.length];
    const domain = domainFor(name, country);
    list.push(
      build(i, [
        `SUP-${String(i + 1).padStart(3, '0')}`,
        name,
        category,
        country,
        CONTACTS[k % CONTACTS.length],
        vendorPhone(country, i),
        `${['sales', 'info', 'orders'][k % 3]}@${domain}`,
        Math.round((3.4 + ((k * 7) % 16) / 10) * 10) / 10,
        VENDOR_PALETTE[k % VENDOR_PALETTE.length],
        [BRANDS[k % BRANDS.length], BRANDS[(k + 5) % BRANDS.length]],
        country === 'UAE' ? ['Dubai', 'Sharjah', 'Abu Dhabi'][k % 3] : country === 'Saudi Arabia' ? 'Riyadh' : country === 'Oman' ? 'Muscat' : country === 'Qatar' ? 'Doha' : country === 'India' ? 'Mumbai' : 'Munich'
      ])
    );
  }
  return list;
}

export function blankSupplier(): SupplierRecord {
  return {
    ...blankVendorBase(),
    category: '',
    country: '',
    rating: 0,
    products: [],
    assetCategories: [],
    brands: [],
    currency: 'AED - UAE Dirham',
    paymentTerms: 'Net 30',
    creditLimit: null,
    trn: '',
    bankName: '',
    iban: '',
    preferred: false,
    approved: false,
    portalAccess: false,
    emailPurchaseOrders: true
  };
}
