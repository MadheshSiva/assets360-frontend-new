import { SiteContact, SiteRecord, SiteType } from '../../../organization/site/site.model';

/*
 * DEMO MODE: hard-coded sites until the API is wired up. The first six match the approved
 * design; S01-S05 are also the sites used by the Building / Floor / Zone master. The rest are
 * generated so the totals match the design (42 sites, 4 inactive, 6 plants, 8 warehouses).
 */

const NO_CONTACT: SiteContact = { name: '', designation: '', email: '', phoneCountry: 'United Arab Emirates', phone: '' };

function base(): Omit<SiteRecord, 'id' | 'code' | 'name' | 'siteType' | 'businessUnit' | 'department'> {
  return {
    organizationCode: 'DCS',
    parentId: null,
    timeZone: '(GMT+04:00) Dubai',
    description: '',
    status: 'Active',
    image: null,
    images: [],
    address: { line1: '', line2: '', city: '', state: '', country: 'United Arab Emirates', postalCode: '' },
    lat: null,
    lng: null,
    manager: { ...NO_CONTACT },
    emergency: { ...NO_CONTACT },
    openTime: '08:00',
    closeTime: '18:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    open24x7: false,
    allowAssetAssignment: true,
    enableTracking: true,
    assets: 0,
    people: 0,
    createdOn: '2024-01-01T10:30',
    updatedOn: '2026-10-15T14:45'
  };
}

function seeds(): SiteRecord[] {
  return [
    {
      ...base(),
      id: 'S01', code: 'DXB-01', name: 'Dubai Factory', siteType: 'Plant', organizationCode: 'DCS-UAE', businessUnit: 'Manufacturing', department: 'Production',
      description: 'Main manufacturing facility for production and assembly operations.',
      address: { line1: 'Jebel Ali Industrial Area', line2: 'Plot No. S201, Street 7', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      lat: 25.0107, lng: 55.1378,
      manager: { name: 'Rex Kumar', designation: 'Plant Manager', email: 'rex@dcs.ae', phoneCountry: 'United Arab Emirates', phone: '50 123 4567' },
      emergency: { name: 'Divya Raman', designation: 'Safety Officer', email: 'divya@dcs.ae', phoneCountry: 'United Arab Emirates', phone: '50 765 4321' },
      openTime: '06:00', closeTime: '22:00', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      assets: 1245, people: 320
    },
    {
      ...base(),
      id: 'S02', code: 'AUH-01', name: 'Abu Dhabi Office', siteType: 'Office', organizationCode: 'DCS-UAE', businessUnit: 'Corporate Services', department: 'Administration',
      address: { line1: 'Al Maryah Island', line2: 'Sowwah Square, Tower 2', city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'United Arab Emirates', postalCode: '00000' },
      lat: 24.5008, lng: 54.3893, manager: { name: 'Aisha Rahman', designation: 'Office Manager', email: 'aisha@dcs.ae', phoneCountry: 'United Arab Emirates', phone: '52 345 6789' },
      assets: 410, people: 85
    },
    {
      ...base(),
      id: 'S03', code: 'SHJ-01', name: 'Sharjah Warehouse', siteType: 'Warehouse', organizationCode: 'DCS-UAE', businessUnit: 'Logistics', department: 'Warehouse',
      address: { line1: 'Industrial Area 13', line2: 'Warehouse 22', city: 'Sharjah', state: 'Sharjah', country: 'United Arab Emirates', postalCode: '00000' },
      lat: 25.3176, lng: 55.4258, manager: { name: 'Omar Haddad', designation: 'Warehouse Manager', email: 'omar@dcs.ae', phoneCountry: 'United Arab Emirates', phone: '55 222 3344' },
      assets: 620, people: 46
    },
    {
      ...base(),
      id: 'S04', code: 'RUH-01', name: 'Riyadh Plant', siteType: 'Plant', organizationCode: 'DCS-KSA', businessUnit: 'Manufacturing', department: 'Production', timeZone: '(GMT+03:00) Riyadh',
      address: { line1: '2nd Industrial City', line2: 'Street 145', city: 'Riyadh', state: 'Riyadh', country: 'Saudi Arabia', postalCode: '14332' },
      lat: 24.6094, lng: 46.8421, manager: { name: 'Faisal Al Harbi', designation: 'Plant Manager', email: 'faisal@dcs-ksa.com', phoneCountry: 'Saudi Arabia', phone: '55 234 5678' },
      assets: 980, people: 210
    },
    {
      ...base(),
      id: 'S05', code: 'DOH-01', name: 'Doha Office', siteType: 'Office', organizationCode: 'DCS', businessUnit: 'Corporate Services', department: 'Administration', timeZone: '(GMT+03:00) Qatar',
      address: { line1: 'West Bay', line2: 'Tornado Tower, Floor 21', city: 'Doha', state: 'Doha', country: 'Qatar', postalCode: '00000' },
      lat: 25.3186, lng: 51.5282, manager: { name: 'Priya Nair', designation: 'Office Manager', email: 'priya@dcs.qa', phoneCountry: 'Qatar', phone: '3344 5566' },
      assets: 150, people: 34
    },
    {
      ...base(),
      id: 'S06', code: 'MCT-01', name: 'Muscat Site', siteType: 'Field Site', organizationCode: 'DCS', businessUnit: 'Operations', department: 'Field Operations', status: 'Inactive', timeZone: '(GMT+04:00) Muscat',
      description: 'Project site closed after handover.',
      address: { line1: 'Rusayl Industrial Estate', line2: '', city: 'Muscat', state: 'Muscat', country: 'Oman', postalCode: '124' },
      lat: 23.5683, lng: 58.1592, assets: 0, people: 0, updatedOn: '2026-03-01T09:00'
    }
  ];
}

// [code, name, type, business unit, department, city, state, country, lat, lng, inactive]
type Gen = [string, string, SiteType, string, string, string, string, string, number, number, boolean?];
const GENERATED: Gen[] = [
  ['JEA-01', 'Jebel Ali Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Dubai', 'Dubai', 'United Arab Emirates', 25.0115, 55.0839],
  ['DIP-01', 'Dubai Investments Park Plant', 'Plant', 'Manufacturing', 'Production', 'Dubai', 'Dubai', 'United Arab Emirates', 24.9822, 55.1693],
  ['DXB-02', 'Dubai Head Office', 'Office', 'Corporate Services', 'Administration', 'Dubai', 'Dubai', 'United Arab Emirates', 25.0763, 55.1406],
  ['DXB-03', 'Dubai Data Center', 'Data Center', 'IT Services', 'IT', 'Dubai', 'Dubai', 'United Arab Emirates', 25.1184, 55.2007],
  ['DXB-04', 'Al Quoz Service Center', 'Field Site', 'Operations', 'Maintenance', 'Dubai', 'Dubai', 'United Arab Emirates', 25.1377, 55.2306],
  ['AUH-02', 'Mussafah Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Abu Dhabi', 'Abu Dhabi', 'United Arab Emirates', 24.3529, 54.5028],
  ['AUH-03', 'KEZAD Plant', 'Plant', 'Manufacturing', 'Production', 'Abu Dhabi', 'Abu Dhabi', 'United Arab Emirates', 24.7836, 54.6611],
  ['AAN-01', 'Al Ain Office', 'Office', 'Corporate Services', 'Administration', 'Al Ain', 'Abu Dhabi', 'United Arab Emirates', 24.2075, 55.7447],
  ['SHJ-02', 'Sharjah Office', 'Office', 'Corporate Services', 'Administration', 'Sharjah', 'Sharjah', 'United Arab Emirates', 25.3463, 55.4209],
  ['SHJ-03', 'Sharjah Yard', 'Yard', 'Logistics', 'Warehouse', 'Sharjah', 'Sharjah', 'United Arab Emirates', 25.2950, 55.4870],
  ['AJM-01', 'Ajman Retail Store', 'Retail Store', 'Operations', 'Administration', 'Ajman', 'Ajman', 'United Arab Emirates', 25.4052, 55.5136],
  ['RAK-01', 'Ras Al Khaimah Plant', 'Plant', 'Manufacturing', 'Production', 'Ras Al Khaimah', 'Ras Al Khaimah', 'United Arab Emirates', 25.6741, 55.9804],
  ['FUJ-01', 'Fujairah Port Yard', 'Yard', 'Logistics', 'Warehouse', 'Fujairah', 'Fujairah', 'United Arab Emirates', 25.1288, 56.3265],
  ['FUJ-02', 'Fujairah Field Site', 'Field Site', 'Operations', 'Field Operations', 'Fujairah', 'Fujairah', 'United Arab Emirates', 25.1500, 56.3000, true],
  ['UAQ-01', 'Umm Al Quwain Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Umm Al Quwain', 'Umm Al Quwain', 'United Arab Emirates', 25.5647, 55.5552],
  ['RUH-02', 'Riyadh Office', 'Office', 'Corporate Services', 'Administration', 'Riyadh', 'Riyadh', 'Saudi Arabia', 24.7136, 46.6753],
  ['RUH-03', 'Riyadh Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Riyadh', 'Riyadh', 'Saudi Arabia', 24.5711, 46.8560],
  ['JED-01', 'Jeddah Office', 'Office', 'Corporate Services', 'Administration', 'Jeddah', 'Makkah', 'Saudi Arabia', 21.5433, 39.1728],
  ['JED-02', 'Jeddah Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Jeddah', 'Makkah', 'Saudi Arabia', 21.4167, 39.2167],
  ['DMM-01', 'Dammam Plant', 'Plant', 'Manufacturing', 'Production', 'Dammam', 'Eastern Province', 'Saudi Arabia', 26.3927, 50.0918],
  ['DMM-02', 'Dammam Field Site', 'Field Site', 'Operations', 'Field Operations', 'Dammam', 'Eastern Province', 'Saudi Arabia', 26.4207, 50.0888],
  ['KHB-01', 'Al Khobar Office', 'Office', 'Corporate Services', 'Administration', 'Al Khobar', 'Eastern Province', 'Saudi Arabia', 26.2172, 50.1971],
  ['NEOM-01', 'NEOM Field Site', 'Field Site', 'Operations', 'Field Operations', 'Tabuk', 'Tabuk', 'Saudi Arabia', 27.9871, 35.2128, true],
  ['DOH-02', 'Doha Data Center', 'Data Center', 'IT Services', 'IT', 'Doha', 'Doha', 'Qatar', 25.2854, 51.5310],
  ['DOH-03', 'Doha Industrial Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Doha', 'Doha', 'Qatar', 25.2002, 51.4392],
  ['LUS-01', 'Lusail Office', 'Office', 'Corporate Services', 'Administration', 'Lusail', 'Doha', 'Qatar', 25.4200, 51.4900],
  ['MCT-02', 'Muscat Office', 'Office', 'Corporate Services', 'Administration', 'Muscat', 'Muscat', 'Oman', 23.5880, 58.3829],
  ['SLL-01', 'Salalah Warehouse', 'Warehouse', 'Logistics', 'Warehouse', 'Salalah', 'Dhofar', 'Oman', 16.9420, 54.0046],
  ['SOH-01', 'Sohar Field Site', 'Field Site', 'Operations', 'Field Operations', 'Sohar', 'Al Batinah', 'Oman', 24.3460, 56.7076],
  ['KWI-01', 'Kuwait City Office', 'Office', 'Corporate Services', 'Administration', 'Kuwait City', 'Al Asimah', 'Kuwait', 29.3759, 47.9774],
  ['KWI-02', 'Shuwaikh Retail Store', 'Retail Store', 'Operations', 'Administration', 'Kuwait City', 'Al Asimah', 'Kuwait', 29.3500, 47.9333],
  ['BAH-01', 'Manama Office', 'Office', 'Corporate Services', 'Administration', 'Manama', 'Capital', 'Bahrain', 26.2235, 50.5876],
  ['BAH-02', 'Sitra Field Site', 'Field Site', 'Operations', 'Maintenance', 'Sitra', 'Capital', 'Bahrain', 26.1547, 50.6206, true],
  ['BLR-01', 'Bengaluru R&D Office', 'Office', 'IT Services', 'IT', 'Bengaluru', 'Karnataka', 'India', 12.9716, 77.5946],
  ['CHN-01', 'Chennai Data Center', 'Data Center', 'IT Services', 'IT', 'Chennai', 'Tamil Nadu', 'India', 13.0827, 80.2707],
  ['MAA-01', 'Chennai Service Center', 'Field Site', 'Facilities Management', 'Maintenance', 'Chennai', 'Tamil Nadu', 'India', 13.0480, 80.2000]
];

const ZONES_BY_COUNTRY: Record<string, string> = {
  'Saudi Arabia': '(GMT+03:00) Riyadh',
  Qatar: '(GMT+03:00) Qatar',
  Kuwait: '(GMT+03:00) Riyadh',
  Bahrain: '(GMT+03:00) Riyadh',
  Oman: '(GMT+04:00) Muscat',
  India: '(GMT+05:30) Kolkata'
};

export function initialSites(): SiteRecord[] {
  const generated = GENERATED.map(([code, name, siteType, businessUnit, department, city, state, country, lat, lng, inactive], i): SiteRecord => {
    const created = new Date(Date.UTC(2024, 2, 1) + i * 11 * 86400000).toISOString().slice(0, 16);
    return {
      ...base(),
      id: `S${String(i + 7).padStart(2, '0')}`,
      code,
      name,
      siteType,
      organizationCode: country === 'Saudi Arabia' ? 'DCS-KSA' : country === 'United Arab Emirates' ? 'DCS-UAE' : 'DCS',
      businessUnit,
      department,
      status: inactive ? 'Inactive' : 'Active',
      timeZone: ZONES_BY_COUNTRY[country] ?? '(GMT+04:00) Dubai',
      address: { line1: `Plot ${120 + i}`, line2: '', city, state, country, postalCode: '00000' },
      lat,
      lng,
      openTime: siteType === 'Data Center' ? '00:00' : '08:00',
      closeTime: siteType === 'Data Center' ? '23:59' : '18:00',
      open24x7: siteType === 'Data Center',
      workingDays: siteType === 'Data Center' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      assets: inactive ? 0 : 40 + ((i * 137) % 700),
      people: inactive ? 0 : 5 + ((i * 29) % 120),
      createdOn: created,
      updatedOn: created
    };
  });
  return [...seeds(), ...generated];
}

export function blankSite(): SiteRecord {
  const now = new Date().toISOString().slice(0, 16);
  return {
    ...base(),
    id: '',
    code: '',
    name: '',
    siteType: '' as SiteType,
    businessUnit: '',
    department: '',
    createdOn: now,
    updatedOn: now
  };
}
