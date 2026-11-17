import { ADMIN_DEPARTMENTS, ADMIN_LOCATIONS, ADMIN_PEOPLE, formatDate } from '../shared/admin-common';
import { LocationType, OrgLocation, SummaryRow, SummaryTab } from './organization.model';

// Static demo data for Administration > Organization, generated deterministically (no randomness)

export const LOCATION_TYPES: LocationType[] = ['Location', 'Building', 'Floor', 'Zone'];

/** The level a parent must be for each type (a top-level location has no parent). */
export const PARENT_TYPE: Record<LocationType, LocationType | null> = {
  Location: null,
  Building: 'Location',
  Floor: 'Building',
  Zone: 'Floor'
};

export const CHILD_TYPE: Record<LocationType, LocationType | null> = {
  Location: 'Building',
  Building: 'Floor',
  Floor: 'Zone',
  Zone: null
};

export const TYPE_TONES: Record<LocationType, 'purple' | 'blue' | 'pink' | 'green'> = {
  Location: 'purple',
  Building: 'blue',
  Floor: 'pink',
  Zone: 'green'
};

export const COUNTRY_CITIES: Record<string, string[]> = {
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Dammam'],
  Qatar: ['Doha'],
  Oman: ['Muscat'],
  'United Kingdom': ['London', 'Manchester'],
  Singapore: ['Singapore']
};

export const TIME_ZONES = [
  '(GMT+00:00) London',
  '(GMT+03:00) Riyadh',
  '(GMT+03:00) Doha',
  '(GMT+04:00) Dubai',
  '(GMT+04:00) Muscat',
  '(GMT+08:00) Singapore'
];

interface SiteSeed {
  name: string;
  address: string;
  country: string;
  city: string;
  timeZone: string;
  contact: string;
  status?: 'Inactive';
}

// The six offices of the design first, then the smaller sites
const SITES: SiteSeed[] = [
  { name: 'Dubai HQ', address: 'Sheikh Zayed Road, Trade Centre 1', country: 'United Arab Emirates', city: 'Dubai', timeZone: '(GMT+04:00) Dubai', contact: 'Ahmed Al Marri' },
  { name: 'Abu Dhabi Office', address: 'Al Maryah Island, Tower 2', country: 'United Arab Emirates', city: 'Abu Dhabi', timeZone: '(GMT+04:00) Dubai', contact: 'Omar Hassan' },
  { name: 'Sharjah Facility', address: 'Industrial Area 13, Plot 42', country: 'United Arab Emirates', city: 'Sharjah', timeZone: '(GMT+04:00) Dubai', contact: 'Mohammed Ali' },
  { name: 'Riyadh Office', address: 'King Fahd Road, Olaya District', country: 'Saudi Arabia', city: 'Riyadh', timeZone: '(GMT+03:00) Riyadh', contact: 'Ahmed Khan' },
  { name: 'London Office', address: '25 Canada Square, Canary Wharf', country: 'United Kingdom', city: 'London', timeZone: '(GMT+00:00) London', contact: 'James Wilson' },
  { name: 'Singapore Office', address: '8 Marina View, Asia Square', country: 'Singapore', city: 'Singapore', timeZone: '(GMT+08:00) Singapore', contact: 'Lisa Wong' },
  { name: 'Jebel Ali Warehouse', address: 'Jebel Ali Free Zone, South 5', country: 'United Arab Emirates', city: 'Dubai', timeZone: '(GMT+04:00) Dubai', contact: 'Rahul Mehta' },
  { name: 'Al Ain Depot', address: 'Al Sanaiya, Street 18', country: 'United Arab Emirates', city: 'Al Ain', timeZone: '(GMT+04:00) Dubai', contact: 'Fatima Ali' },
  { name: 'Jeddah Office', address: 'Prince Sultan Street, Al Rawdah', country: 'Saudi Arabia', city: 'Jeddah', timeZone: '(GMT+03:00) Riyadh', contact: 'Omar Khalid' },
  { name: 'Dammam Yard', address: '2nd Industrial City, Gate 4', country: 'Saudi Arabia', city: 'Dammam', timeZone: '(GMT+03:00) Riyadh', contact: 'Priya Nair', status: 'Inactive' },
  { name: 'Doha Office', address: 'West Bay, Tornado Tower', country: 'Qatar', city: 'Doha', timeZone: '(GMT+03:00) Doha', contact: 'Daniel Kim' },
  { name: 'Muscat Office', address: 'Al Khuwair, Way 3013', country: 'Oman', city: 'Muscat', timeZone: '(GMT+04:00) Muscat', contact: 'Priya Sharma' }
];

/** Buildings with their floor labels; `prefix` keeps zone names distinct between buildings. */
const BUILDINGS = [
  { name: 'Building A', site: 'Dubai HQ', contact: 'Sarah Khan', prefix: '', floors: ['Ground', '1', '2', '3', '4'] },
  { name: 'Building B', site: 'Dubai HQ', contact: 'James Tan', prefix: 'B', floors: ['Ground', '1', '2', '3'] },
  { name: 'Abu Dhabi Tower', site: 'Abu Dhabi Office', contact: 'Daniel Tan', prefix: 'T', floors: ['Ground', '1', '2', '3', '4', '5'] },
  { name: 'Warehouse Block', site: 'Sharjah Facility', contact: 'Mohammed Ali', prefix: 'W', floors: ['Ground', 'Mezzanine', '1'] }
];

function floorName(label: string): string {
  return label === 'Ground' || label === 'Mezzanine' ? `${label} Floor` : `Floor ${label}`;
}

function floorShort(label: string): string {
  return label === 'Ground' ? 'G' : label === 'Mezzanine' ? 'M' : label;
}

/**
 * 12 locations, 4 buildings, 18 floors and 67 zones (the first 13 floors have four zones, the rest three).
 * The Dubai HQ > Building A > Floor 2 > Zone 2A chain gets LOC-001..004 as in the design.
 */
function buildLocations(): OrgLocation[] {
  // Records are built with a reference to their parent record, then numbered
  type Draft = Omit<OrgLocation, 'code' | 'parent'> & { parentRef: Draft | null };
  const out: Draft[] = [];
  const add = (r: Draft): Draft => {
    out.push(r);
    return r;
  };
  const designChain: Draft[] = [];
  let floorIndex = 0;
  let zoneIndex = 0;
  const sites = new Map<string, Draft>();
  for (const s of SITES) {
    const { status, ...rest } = s;
    sites.set(s.name, add({ ...rest, type: 'Location', parentRef: null, status: status ?? 'Active' }));
  }
  designChain.push(sites.get('Dubai HQ')!);
  for (const b of BUILDINGS) {
    const site = sites.get(b.site)!;
    const building = add({ ...site, name: b.name, type: 'Building', parentRef: site, address: `${b.name}, ${site.name}`, contact: b.contact, status: 'Active' });
    if (b.name === 'Building A') designChain.push(building);
    for (const label of b.floors) {
      const fName = floorName(label);
      const isDesignFloor = b.name === 'Building A' && label === '2';
      const floor = add({
        ...site,
        name: fName,
        type: 'Floor',
        parentRef: building,
        address: `${fName}, ${b.name}, ${site.name}`,
        contact: isDesignFloor ? 'Michael Chen' : ADMIN_PEOPLE[(floorIndex * 5 + 3) % ADMIN_PEOPLE.length],
        status: 'Active'
      });
      if (isDesignFloor) designChain.push(floor);
      const zones = floorIndex < 13 ? 4 : 3;
      for (let z = 0; z < zones; z++) {
        const zName = `Zone ${b.prefix}${floorShort(label)}${'ABCD'[z]}`;
        const zone = add({
          ...site,
          name: zName,
          type: 'Zone',
          parentRef: floor,
          address: `${zName}, ${fName}, ${b.name}, ${site.name}`,
          contact: isDesignFloor && z === 0 ? 'Fatima Noor' : ADMIN_PEOPLE[(zoneIndex * 7 + 1) % ADMIN_PEOPLE.length],
          status: zoneIndex % 11 === 10 ? 'Inactive' : 'Active'
        });
        if (isDesignFloor && z === 0) designChain.push(zone);
        zoneIndex++;
      }
      floorIndex++;
    }
  }

  const codeOf = new Map<Draft, string>();
  const code = (n: number) => `LOC-${String(n).padStart(3, '0')}`;
  designChain.forEach((r, i) => codeOf.set(r, code(i + 1)));
  let next = designChain.length + 1;
  for (const r of out) if (!codeOf.has(r)) codeOf.set(r, code(next++));

  return out.map((d) => {
    const { parentRef, ...r } = d;
    return { ...r, code: codeOf.get(d)!, parent: parentRef ? codeOf.get(parentRef)! : null };
  });
}

export function seedLocations(): OrgLocation[] {
  return buildLocations();
}

/* ===== Summary tabs ===== */

const STATUS_TONES = { Active: 'green', Inactive: 'grey' } as const;
const LEVEL_TONES = { Low: 'grey', Medium: 'blue', High: 'orange', Critical: 'red' } as const;

const ASSET_CATALOG = [
  ['Chiller Unit', 'HVAC', 'Carrier 30XA'],
  ['Air Handling Unit', 'HVAC', 'Daikin AHU-200'],
  ['Diesel Generator', 'Power', 'Caterpillar C18'],
  ['UPS System', 'Power', 'APC Symmetra 80kVA'],
  ['Passenger Lift', 'Vertical Transport', 'KONE MonoSpace'],
  ['Fire Pump', 'Fire Safety', 'Grundfos NKF'],
  ['CCTV Camera', 'Security', 'Axis P3265'],
  ['Access Controller', 'Security', 'HID VertX V1000'],
  ['Forklift', 'Material Handling', 'Toyota 8FBE18'],
  ['Laptop', 'IT Equipment', 'Dell Latitude 7440'],
  ['Core Switch', 'IT Equipment', 'Cisco C9300'],
  ['Delivery Van', 'Fleet', 'Toyota Hiace 2024']
];
const LIFECYCLE = ['In Use', 'In Use', 'In Use', 'In Storage', 'Under Maintenance', 'Commissioning', 'In Use', 'Retired'];
const CRITICALITY = ['Medium', 'High', 'Low', 'Critical', 'Medium', 'High', 'Low'];

function assetRows(): SummaryRow[] {
  const rows: SummaryRow[] = [];
  for (let i = 0; i < 36; i++) {
    const [name, category, model] = ASSET_CATALOG[i % ASSET_CATALOG.length];
    const lifecycle = LIFECYCLE[(i * 3) % LIFECYCLE.length];
    rows.push({
      code: `AST-${String(1001 + i)}`,
      name: `${name} ${String(Math.floor(i / ASSET_CATALOG.length) + 1).padStart(2, '0')}`,
      category,
      model,
      serial: `SN-${(73519 + i * 2741).toString(36).toUpperCase()}`,
      location: ADMIN_LOCATIONS[(i * 5) % ADMIN_LOCATIONS.length],
      custodian: ADMIN_PEOPLE[(i * 4 + 2) % ADMIN_PEOPLE.length],
      criticality: CRITICALITY[i % CRITICALITY.length],
      lifecycle,
      status: lifecycle === 'Retired' ? 'Inactive' : 'Active'
    });
  }
  return rows;
}

const ROLES_BY_DEPT: Record<string, string> = {
  Administration: 'Administrator',
  Operations: 'Operations Manager',
  Maintenance: 'Technician',
  Finance: 'Finance Analyst',
  IT: 'IT Engineer',
  Compliance: 'Compliance Officer',
  Inventory: 'Storekeeper',
  HR: 'HR Officer',
  Procurement: 'Buyer'
};
const SKILLS = ['HVAC Level 2', 'Electrical (LV)', 'First Aid', 'ISO 9001 Auditor', 'Forklift Licence', 'NEBOSH IGC', 'CCNA', '', 'IOSH Managing Safely'];
const SHIFTS = ['Day (07:00-15:00)', 'Evening (15:00-23:00)', 'General (09:00-18:00)', 'Night (23:00-07:00)'];

function peopleRows(assets: SummaryRow[]): SummaryRow[] {
  return ADMIN_PEOPLE.map((name, i) => {
    const department = ADMIN_DEPARTMENTS[(i * 4) % ADMIN_DEPARTMENTS.length];
    return {
      code: `EMP-${String(1001 + i * 7)}`,
      name,
      department,
      role: ROLES_BY_DEPT[department],
      skill: SKILLS[i % SKILLS.length] || '—',
      shift: SHIFTS[i % SHIFTS.length],
      assets: String(assets.filter((a) => a['custodian'] === name).length),
      status: i % 9 === 8 ? 'Inactive' : 'Active'
    };
  });
}

const VENDORS = [
  ['Emirates Cooling Services', 'Service Contractor', 'HVAC maintenance', 'Gold (4h)'],
  ['Gulf Power Systems', 'Service Contractor', 'Generator & UPS service', 'Gold (4h)'],
  ['KONE Middle East', 'OEM', 'Lift maintenance', 'Platinum (2h)'],
  ['SafeGuard Fire Protection', 'Service Contractor', 'Fire system inspection', 'Silver (8h)'],
  ['Axis Security Solutions', 'Supplier', 'CCTV & access control', 'Silver (8h)'],
  ['Dell Technologies', 'OEM', 'IT hardware & warranty', 'Gold (4h)'],
  ['Al Futtaim Logistics', 'Logistics', 'Freight & delivery', 'Bronze (24h)'],
  ['CleanPro Facilities', 'Service Contractor', 'Cleaning & janitorial', 'Bronze (24h)'],
  ['Office Supplies Co.', 'Supplier', 'Stationery & consumables', 'Standard'],
  ['Desert Pest Control', 'Service Contractor', 'Pest control', 'Bronze (24h)'],
  ['Toyota Material Handling', 'OEM', 'Forklift service', 'Silver (8h)'],
  ['Bureau Veritas', 'Certification Body', 'Inspection & certification', 'Standard'],
  ['Cisco Systems', 'OEM', 'Network equipment', 'Gold (4h)'],
  ['Spare Parts Trading LLC', 'Supplier', 'Mechanical spares', 'Standard'],
  ['Green Waste Management', 'Service Contractor', 'Waste disposal', 'Bronze (24h)'],
  ['Prime Calibration Labs', 'Service Contractor', 'Instrument calibration', 'Silver (8h)']
];

function vendorRows(): SummaryRow[] {
  return VENDORS.map(([name, type, services, sla], i) => ({
    code: `VEN-${String(201 + i)}`,
    name,
    type,
    services,
    contact: ADMIN_PEOPLE[(i * 3 + 5) % ADMIN_PEOPLE.length],
    sla,
    rating: `${(3.6 + ((i * 7) % 14) / 10).toFixed(1)} / 5`,
    status: i === 9 || i === 14 ? 'Inactive' : 'Active'
  }));
}

const PLANS = [
  ['Chiller Quarterly Service', 'Preventive', 'Mechanical', 'High', 'Quarterly', 'Chiller PM Checklist', '48h', 'Facilities Manager'],
  ['AHU Filter Replacement', 'Preventive', 'Mechanical', 'Medium', 'Monthly', 'AHU Filter Checklist', '72h', 'Maintenance Lead'],
  ['Generator Load Test', 'Preventive', 'Electrical', 'High', 'Monthly', 'Generator Load Test', '24h', 'Facilities Manager'],
  ['UPS Battery Check', 'Preventive', 'Electrical', 'High', 'Quarterly', 'UPS Battery Checklist', '48h', 'Maintenance Lead'],
  ['Lift Safety Inspection', 'Statutory', 'Vertical Transport', 'Critical', 'Monthly', 'Lift Safety Checklist', '8h', 'Operations Manager'],
  ['Fire Pump Weekly Run', 'Statutory', 'Fire Safety', 'Critical', 'Weekly', 'Fire Pump Run Sheet', '8h', 'HSE Manager'],
  ['CCTV Health Check', 'Preventive', 'Security', 'Low', 'Monthly', 'CCTV Checklist', '72h', 'Security Supervisor'],
  ['Breakdown Repair', 'Corrective', 'General', 'High', 'On Demand', '—', '24h', 'Maintenance Lead'],
  ['Forklift Daily Inspection', 'Inspection', 'Material Handling', 'Medium', 'Daily', 'Forklift Pre-use Checklist', '4h', 'Warehouse Supervisor'],
  ['Thermal Imaging Survey', 'Predictive', 'Electrical', 'Medium', 'Half-yearly', 'Thermography Checklist', '5 days', 'Facilities Manager'],
  ['Vibration Analysis', 'Predictive', 'Mechanical', 'Medium', 'Quarterly', 'Vibration Route', '5 days', 'Maintenance Lead'],
  ['Water Tank Cleaning', 'Preventive', 'Plumbing', 'Low', 'Half-yearly', 'Tank Cleaning Checklist', '7 days', 'Facilities Manager'],
  ['Emergency Lighting Test', 'Statutory', 'Fire Safety', 'High', 'Monthly', 'Emergency Lighting Checklist', '48h', 'HSE Manager'],
  ['Server Room Cooling Check', 'Preventive', 'IT Infrastructure', 'High', 'Weekly', 'Server Room Checklist', '24h', 'IT Manager'],
  ['Pest Control Visit', 'Preventive', 'Hygiene', 'Low', 'Monthly', '—', '7 days', 'Facilities Manager'],
  ['Calibration of Gauges', 'Calibration', 'Instrumentation', 'Medium', 'Yearly', 'Calibration Record', '10 days', 'Quality Manager'],
  ['Roof Inspection', 'Inspection', 'Civil', 'Low', 'Yearly', 'Roof Survey Checklist', '14 days', 'Facilities Manager'],
  ['Fleet Service', 'Preventive', 'Fleet', 'Medium', 'Every 10,000 km', 'Vehicle Service Checklist', '72h', 'Fleet Coordinator']
];

function maintenanceRows(): SummaryRow[] {
  return PLANS.map(([name, type, work, priority, frequency, checklist, sla, escalation], i) => ({
    code: `MP-${String(301 + i)}`,
    name,
    type,
    work,
    priority,
    frequency,
    checklist,
    sla,
    escalation,
    status: i === 16 ? 'Inactive' : 'Active'
  }));
}

const ITEMS = [
  ['Air Filter 24x24', 'HVAC Spares', 'Each'],
  ['V-Belt B52', 'Mechanical Spares', 'Each'],
  ['Engine Oil 15W-40', 'Lubricants', 'Litre'],
  ['LED Tube 18W', 'Electrical', 'Each'],
  ['Circuit Breaker 32A', 'Electrical', 'Each'],
  ['Refrigerant R-410A', 'HVAC Spares', 'Kg'],
  ['Safety Gloves', 'PPE', 'Pair'],
  ['Hard Hat', 'PPE', 'Each'],
  ['A4 Paper', 'Stationery', 'Ream'],
  ['Cable Ties 300mm', 'Consumables', 'Pack'],
  ['Hydraulic Hose 1/2"', 'Mechanical Spares', 'Metre'],
  ['UPS Battery 12V 9Ah', 'Electrical', 'Each'],
  ['Cleaning Detergent', 'Consumables', 'Litre'],
  ['Fire Extinguisher 6kg', 'Fire Safety', 'Each']
];
const STORES = ['Main Store', 'Dubai HQ Store', 'Sharjah Warehouse', 'Abu Dhabi Store'];

function inventoryRows(): SummaryRow[] {
  const rows: SummaryRow[] = [];
  for (let i = 0; i < 28; i++) {
    const [item, category, uom] = ITEMS[i % ITEMS.length];
    const store = STORES[(i * 3) % STORES.length];
    const min = 10 + ((i * 7) % 5) * 10;
    const max = min * 4;
    const reorder = Math.round(min * 1.5);
    // Every 9th item is out of stock, every 4th is below its reorder level
    const onHand = i % 9 === 4 ? 0 : i % 4 === 1 ? Math.max(1, min - 3) : min * 2 + ((i * 13) % min);
    const stock = onHand === 0 ? 'Out of Stock' : onHand <= reorder ? 'Low Stock' : 'In Stock';
    rows.push({
      code: `ITM-${String(5001 + i)}`,
      item: i < ITEMS.length ? item : `${item} (${store.split(' ')[0]})`,
      category,
      uom,
      levels: `${min} / ${max}`,
      bin: `${store} / ${'ABCD'[i % 4]}-${String((i % 12) + 1).padStart(2, '0')}`,
      store,
      onHand: String(onHand),
      stock,
      reorder: String(reorder),
      status: i === 27 ? 'Inactive' : 'Active'
    });
  }
  return rows;
}

const OBLIGATIONS = [
  ['UAE Civil Defence Code', 'NFPA 25', 'Fire System Completion Certificate', 'Fire Safety Permit'],
  ['Dubai Municipality Lift Regulation', 'EN 81-20', 'Lift Inspection Certificate', 'Lift Operating Permit'],
  ['Quality Management', 'ISO 9001:2015', 'ISO 9001 Certificate', '—'],
  ['Environmental Management', 'ISO 14001:2015', 'ISO 14001 Certificate', '—'],
  ['Occupational Health & Safety', 'ISO 45001:2018', 'ISO 45001 Certificate', '—'],
  ['Information Security', 'ISO 27001:2022', 'ISO 27001 Certificate', '—'],
  ['DEWA Generator Registration', 'DEWA Regulations', 'Generator Registration', 'Generator Operating Permit'],
  ['RTA Vehicle Registration', 'UAE Traffic Law', 'Vehicle Registration Card', 'Vehicle Permit'],
  ['Trade Licence', 'DED Regulations', 'Trade Licence', 'Commercial Licence'],
  ['Pressure Vessel Inspection', 'ASME VIII', 'Pressure Vessel Certificate', 'Operating Permit'],
  ['Waste Disposal', 'DM Waste Regulations', 'Waste Contractor Approval', 'Waste Transport Permit'],
  ['Forklift Certification', 'LOLER', 'Thorough Examination Report', 'Equipment Permit'],
  ['Food Safety (Pantry)', 'HACCP', 'Food Hygiene Certificate', 'Food Permit'],
  ['Saudi Civil Defence', 'SBC 801', 'Civil Defence Certificate', 'Safety Permit']
];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function complianceRows(): SummaryRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Expiry offsets in days from today: a few expired, a few within 60 days, the rest later
  const offsets = [210, 45, 320, -12, 540, 28, 190, -40, 400, 75, 15, 260, 600, 120];
  return OBLIGATIONS.map(([regulation, standard, certificate, permit], i) => {
    const expiry = addDays(today, offsets[i]);
    const days = offsets[i];
    return {
      code: `CMP-${String(401 + i)}`,
      regulation,
      standard,
      certificate,
      permit,
      expiry: formatDate(expiry.toISOString()),
      validity: days < 0 ? 'Expired' : days <= 60 ? 'Expiring Soon' : 'Valid',
      owner: ADMIN_PEOPLE[(i * 5 + 4) % ADMIN_PEOPLE.length],
      reminder: `${days > 180 ? 60 : 30} days before expiry`,
      status: i === 12 ? 'Inactive' : 'Active'
    };
  });
}

export function seedSummaryTabs(): SummaryTab[] {
  const assets = assetRows();
  return [
    {
      id: 'asset',
      title: 'Assets',
      singular: 'Asset',
      filterKey: 'category',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Asset Code', kind: 'code' },
        { key: 'name', label: 'Asset Name' },
        { key: 'category', label: 'Category' },
        { key: 'model', label: 'Model / Type' },
        { key: 'serial', label: 'Serial Number' },
        { key: 'location', label: 'Location' },
        { key: 'custodian', label: 'Custodian' },
        { key: 'criticality', label: 'Criticality', kind: 'pill', tones: LEVEL_TONES },
        { key: 'lifecycle', label: 'Lifecycle Stage', kind: 'pill', tones: { 'In Use': 'blue', 'In Storage': 'grey', 'Under Maintenance': 'orange', Commissioning: 'purple', Retired: 'red' } },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Assets', icon: 'Box', tone: 'purple', kind: 'total' },
        { label: 'Categories', icon: 'Layers', tone: 'blue', kind: 'distinct', column: 'category' },
        { label: 'High / Critical', icon: 'ShieldCheck', tone: 'pink', kind: 'match', column: 'criticality', values: ['High', 'Critical'] },
        { label: 'Under Maintenance', icon: 'Wrench', tone: 'green', kind: 'match', column: 'lifecycle', values: ['Under Maintenance'] }
      ],
      rows: assets
    },
    {
      id: 'people',
      title: 'People',
      singular: 'Employee',
      filterKey: 'department',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Employee ID', kind: 'code' },
        { key: 'name', label: 'Employee Name' },
        { key: 'department', label: 'Department' },
        { key: 'role', label: 'Role', kind: 'pill', tones: {} },
        { key: 'skill', label: 'Skill / Certification' },
        { key: 'shift', label: 'Shift' },
        { key: 'assets', label: 'Assigned Assets' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Employees', icon: 'Users', tone: 'purple', kind: 'total' },
        { label: 'Departments', icon: 'Building2', tone: 'blue', kind: 'distinct', column: 'department' },
        { label: 'Assigned Assets', icon: 'Box', tone: 'pink', kind: 'sum', column: 'assets' },
        { label: 'Active', icon: 'ShieldCheck', tone: 'green', kind: 'match', column: 'status', values: ['Active'] }
      ],
      rows: peopleRows(assets)
    },
    {
      id: 'vendor',
      title: 'Vendors',
      singular: 'Vendor',
      filterKey: 'type',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Vendor Code', kind: 'code' },
        { key: 'name', label: 'Vendor Name' },
        { key: 'type', label: 'Vendor Type', kind: 'pill', tones: { 'Service Contractor': 'blue', OEM: 'purple', Supplier: 'green', Logistics: 'orange', 'Certification Body': 'pink' } },
        { key: 'services', label: 'Services Provided' },
        { key: 'contact', label: 'Contact Person' },
        { key: 'sla', label: 'SLA' },
        { key: 'rating', label: 'Rating' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Vendors', icon: 'Truck', tone: 'purple', kind: 'total' },
        { label: 'Service Contractors', icon: 'Wrench', tone: 'blue', kind: 'match', column: 'type', values: ['Service Contractor'] },
        { label: 'OEMs & Suppliers', icon: 'Package', tone: 'pink', kind: 'match', column: 'type', values: ['OEM', 'Supplier'] },
        { label: 'Active', icon: 'ShieldCheck', tone: 'green', kind: 'match', column: 'status', values: ['Active'] }
      ],
      rows: vendorRows()
    },
    {
      id: 'maintenance',
      title: 'Maintenance Plans',
      singular: 'Plan',
      filterKey: 'type',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Code', kind: 'code' },
        { key: 'name', label: 'Plan' },
        { key: 'type', label: 'Maintenance Type', kind: 'pill', tones: { Preventive: 'blue', Corrective: 'orange', Statutory: 'red', Predictive: 'purple', Inspection: 'green', Calibration: 'pink' } },
        { key: 'work', label: 'Work Type' },
        { key: 'priority', label: 'Priority', kind: 'pill', tones: LEVEL_TONES },
        { key: 'frequency', label: 'Frequency' },
        { key: 'checklist', label: 'Checklist' },
        { key: 'sla', label: 'SLA' },
        { key: 'escalation', label: 'Escalation' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Maintenance Plans', icon: 'Wrench', tone: 'purple', kind: 'total' },
        { label: 'Preventive', icon: 'ShieldCheck', tone: 'blue', kind: 'match', column: 'type', values: ['Preventive'] },
        { label: 'Statutory', icon: 'ClipboardCheck', tone: 'pink', kind: 'match', column: 'type', values: ['Statutory'] },
        { label: 'High / Critical Priority', icon: 'Activity', tone: 'green', kind: 'match', column: 'priority', values: ['High', 'Critical'] }
      ],
      rows: maintenanceRows()
    },
    {
      id: 'inventory',
      title: 'Inventory Items',
      singular: 'Item',
      filterKey: 'category',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Item Code', kind: 'code' },
        { key: 'item', label: 'Item' },
        { key: 'category', label: 'Item Category' },
        { key: 'uom', label: 'UOM' },
        { key: 'levels', label: 'Min / Max Level' },
        { key: 'bin', label: 'Warehouse / Store / Bin' },
        { key: 'onHand', label: 'On Hand' },
        { key: 'stock', label: 'Stock Status', kind: 'pill', tones: { 'In Stock': 'green', 'Low Stock': 'orange', 'Out of Stock': 'red' } },
        { key: 'reorder', label: 'Reorder Level' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Items', icon: 'Package', tone: 'purple', kind: 'total' },
        { label: 'Stores', icon: 'Building2', tone: 'blue', kind: 'distinct', column: 'store' },
        { label: 'Low Stock', icon: 'Activity', tone: 'pink', kind: 'match', column: 'stock', values: ['Low Stock'] },
        { label: 'Out of Stock', icon: 'Box', tone: 'green', kind: 'match', column: 'stock', values: ['Out of Stock'] }
      ],
      rows: inventoryRows()
    },
    {
      id: 'compliance',
      title: 'Compliance Obligations',
      singular: 'Obligation',
      filterKey: 'validity',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Code', kind: 'code' },
        { key: 'regulation', label: 'Regulation' },
        { key: 'standard', label: 'Standard' },
        { key: 'certificate', label: 'Certificate' },
        { key: 'permit', label: 'Permit Type' },
        { key: 'expiry', label: 'Validity / Expiry Date' },
        { key: 'validity', label: 'Validity', kind: 'pill', tones: { Valid: 'green', 'Expiring Soon': 'orange', Expired: 'red' } },
        { key: 'owner', label: 'Owner' },
        { key: 'reminder', label: 'Renewal / Reminder' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Obligations', icon: 'ShieldCheck', tone: 'purple', kind: 'total' },
        { label: 'Valid', icon: 'ClipboardCheck', tone: 'blue', kind: 'match', column: 'validity', values: ['Valid'] },
        { label: 'Expiring in 60 Days', icon: 'Activity', tone: 'pink', kind: 'match', column: 'validity', values: ['Expiring Soon'] },
        { label: 'Expired', icon: 'FileText', tone: 'green', kind: 'match', column: 'validity', values: ['Expired'] }
      ],
      rows: complianceRows()
    }
  ];
}
