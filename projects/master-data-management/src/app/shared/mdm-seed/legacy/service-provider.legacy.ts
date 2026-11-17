import { NAME_PREFIXES, VENDOR_PALETTE, blankAddress, blankVendorBase, demoDocuments, domainFor, vendorPhone } from './vendor.legacy';
import { ServiceProviderRecord } from '../../../vendor/service-provider/service-provider.model';

/* DEMO MODE: 36 service providers; the first five match the approved design. */

export const SERVICE_TYPES = [
  'Installation', 'Maintenance', 'Facilities Management', 'Inspection', 'Calibration', 'Cleaning', 'Security Services',
  'Pest Control', 'Testing & Commissioning', 'Repairs'
];
export const COVERAGE_AREAS = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Oman', 'Qatar', 'Saudi Arabia'];

// [code, name, service type, country, contact, phone, email, rating, inactive?]
type Seed = [string, string, string, string, string, string, string, number, boolean];
const SEEDS: Seed[] = [
  ['SRV-001', 'Emirates Technical Services', 'Installation', 'UAE', 'Ahmed Al Mansoori', '+971 4 123 4567', 'info@ets.ae', 4.7, false],
  ['SRV-002', 'TechCare Solutions', 'Maintenance', 'UAE', 'Ramesh Kumar', '+971 5 678 1234', 'support@techcare.ae', 4.5, false],
  ['SRV-003', 'Facilities Pro LLC', 'Facilities Management', 'UAE', 'Sara Khan', '+971 4 987 6543', 'contact@facilitiespro.ae', 4.3, false],
  ['SRV-004', 'Al Sahel Services', 'Inspection', 'Oman', 'Khalid Al Balushi', '+968 2 345 6789', 'info@alsahel.om', 4.2, false],
  ['SRV-005', 'Global Field Services', 'Calibration', 'Qatar', 'Mohammed Rashid', '+974 4 321 9876', 'service@gfs.qa', 4.6, true]
];

const SUFFIXES = ['Technical Services', 'Facilities Management', 'Engineering Services', 'Maintenance Co.', 'Contracting LLC'];
const COUNTRIES = ['UAE', 'UAE', 'UAE', 'Oman', 'Qatar', 'Saudi Arabia'];
const CONTACTS = ['Joseph Thomas', 'Aamir Sheikh', 'Nadia Karim', 'Prakash Iyer', 'Omar Fayed', 'Grace Pinto', 'Bilal Ahmed', 'Sunita Rao'];
const SKILLS = ['Electrical', 'Mechanical', 'HVAC', 'Plumbing', 'Civil', 'Fire Protection', 'Calibration', 'IT/Network', 'Instrumentation'];
const TOTAL = 36;

function stamp(day: number): string {
  return new Date(Date.UTC(2023, 9, 1) + day * 86400000).toISOString().slice(0, 16);
}

function build(i: number, [code, name, serviceType, country, contactPerson, phone, email, rating, inactive]: Seed): ServiceProviderRecord {
  const domain = email.split('@')[1];
  const local = country === 'UAE';
  return {
    ...blankVendorBase(),
    code,
    name,
    brandColor: VENDOR_PALETTE[i % VENDOR_PALETTE.length],
    website: `https://www.${domain}`,
    contactPerson,
    email,
    phone,
    status: inactive ? 'Inactive' : 'Active',
    address: { ...blankAddress(country), line1: `Office ${100 + i}, ${['Al Quoz', 'Ruwi', 'West Bay', 'Olaya', 'Al Qusais'][i % 5]}`, city: { UAE: 'Dubai', Oman: 'Muscat', Qatar: 'Doha', 'Saudi Arabia': 'Riyadh' }[country] ?? '' },
    alternateContact: 'Operations Desk',
    alternateEmail: `ops@${domain}`,
    documents: demoDocuments(i, ['Trade Licence', 'Insurance', 'ISO Certificate']),
    serviceType,
    country,
    rating,
    services: [serviceType, SERVICE_TYPES[(i * 3 + 1) % SERVICE_TYPES.length]].filter((s, n, a) => a.indexOf(s) === n),
    skills: [SKILLS[i % SKILLS.length], SKILLS[(i + 4) % SKILLS.length]],
    coverage: local ? ['Dubai', 'Sharjah', 'Abu Dhabi'].slice(0, 1 + (i % 3)) : [country],
    technicians: 8 + ((i * 7) % 60),
    responseHours: [2, 4, 8, 24][i % 4],
    licenceNo: `${local ? 'DED' : 'CR'}-${100000 + i * 731}`,
    licenceExpiry: `${2027 + (i % 2)}-${String(1 + ((i * 5) % 12)).padStart(2, '0')}-28`,
    insurancePolicy: `POL-${20240 + i}`,
    insuranceExpiry: `${2026 + ((i + 1) % 2)}-${String(1 + ((i * 7) % 12)).padStart(2, '0')}-15`,
    isoCertified: i % 3 !== 1,
    hseApproved: i % 4 !== 3,
    preferred: i < 3 || i % 6 === 0,
    approved: !inactive,
    portalAccess: true,
    emergencyCallout: serviceType === 'Maintenance' || serviceType === 'Repairs' || i % 4 === 0,
    createdOn: stamp(i * 5),
    updatedOn: stamp(480 + i * 4)
  };
}

export function initialServiceProviders(): ServiceProviderRecord[] {
  const list = SEEDS.map((seed, i) => build(i, seed));
  const used = new Set(list.map((r) => r.name));
  for (let i = SEEDS.length, n = 0; i < TOTAL; i++, n++) {
    const k = i - SEEDS.length;
    // Offset the prefixes so names differ from the generated suppliers; skip names already taken
    let name = `${NAME_PREFIXES[(n + 7) % NAME_PREFIXES.length]} ${SUFFIXES[(n * 3) % SUFFIXES.length]}`;
    while (used.has(name)) {
      n++;
      name = `${NAME_PREFIXES[(n + 7) % NAME_PREFIXES.length]} ${SUFFIXES[(n * 3) % SUFFIXES.length]}`;
    }
    used.add(name);
    const country = COUNTRIES[k % COUNTRIES.length];
    const domain = domainFor(name, country);
    list.push(
      build(i, [
        `SRV-${String(i + 1).padStart(3, '0')}`,
        name,
        SERVICE_TYPES[(k * 3 + 1) % SERVICE_TYPES.length],
        country,
        CONTACTS[k % CONTACTS.length],
        vendorPhone(country, i + 40),
        `${['info', 'service', 'contact'][k % 3]}@${domain}`,
        Math.round((3.5 + ((k * 3) % 15) / 10) * 10) / 10,
        k % 9 === 7
      ])
    );
  }
  return list;
}

export function blankServiceProvider(): ServiceProviderRecord {
  return {
    ...blankVendorBase(),
    serviceType: '',
    country: '',
    rating: 0,
    services: [],
    skills: [],
    coverage: [],
    technicians: 0,
    responseHours: 24,
    licenceNo: '',
    licenceExpiry: '',
    insurancePolicy: '',
    insuranceExpiry: '',
    isoCertified: false,
    hseApproved: false,
    preferred: false,
    approved: false,
    portalAccess: false,
    emergencyCallout: false
  };
}
