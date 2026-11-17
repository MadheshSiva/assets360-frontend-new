import { AssetModelIcon } from '../../../asset/asset-model/asset-model.icons';
import { CustomField, CustomFieldType } from '../../../asset/asset-type/asset-type.model';
import { CategoryRecord, SubcategoryRecord } from '../../../asset/category-subcategory/category.model';

/*
 * DEMO MODE: hard-coded categories until the API is wired up. The first ten rows match the
 * approved design and the totals match it too (24 categories, 22 active, 156 subcategories,
 * 12,450 assets). A category's asset count is the sum of its subcategories.
 */

export const CATEGORY_ASSET_TYPES = ['Fixed Asset', 'Movable Asset', 'Fleet Asset', 'Facility Asset', 'Consumable', 'Intangible Asset', 'Leased Asset'];
export const CATEGORY_COST_CENTERS = ['IT-001', 'MFG-001', 'FLT-001', 'FM-001', 'FM-002', 'TLS-001', 'ADM-001', 'HSE-001', 'ELE-001', 'NET-001', 'QA-001', 'SEC-001'];

// [code, name, asset type, icon, colour, description, inactive?, assets, subcategories as [name, icon] or [name, icon, assets]]
type SubSeed = [string, AssetModelIcon, number?];
type Seed = [string, string, string, AssetModelIcon, string, string, boolean, number, SubSeed[]];
const SEEDS: Seed[] = [
  ['CAT-IT', 'IT Equipment', 'Fixed Asset', 'monitor', '#1d4ed8', 'Computers, servers, networking devices, peripherals and other IT related equipment.', false, 2450, [
    ['Laptops', 'laptop', 850], ['Desktops', 'monitor', 420], ['Servers', 'server', 120], ['Network Devices', 'network', 310],
    ['Monitors', 'monitor', 280], ['Printers', 'printer', 190], ['Mobile Devices', 'smartphone', 210], ['Tablets', 'tablet', 70]
  ]],
  ['CAT-MAC', 'Machinery', 'Fixed Asset', 'machine', '#dc2626', 'Production machinery, power generation and plant equipment.', false, 3280, [
    ['Generators', 'generator'], ['CNC Machines', 'machine'], ['Compressors', 'gauge'], ['Conveyors', 'conveyor'], ['Pumps', 'gauge'], ['Lathes', 'machine'],
    ['Injection Moulding', 'factory'], ['Hydraulic Presses', 'machine'], ['Welding Machines', 'flame'], ['Cranes', 'crane'], ['Boilers', 'flame'], ['Mixers', 'machine']
  ]],
  ['CAT-VEH', 'Vehicles', 'Fleet Asset', 'car', '#dc2626', 'Fleet vehicles and material handling vehicles.', false, 1245, [
    ['Forklifts', 'forklift'], ['Reach Trucks', 'forklift'], ['Pickup Trucks', 'truck'], ['Vans', 'car'], ['Buses', 'bus'], ['Cars', 'car']
  ]],
  ['CAT-BLD', 'Buildings & Infrastructure', 'Facility Asset', 'elevator', '#334155', 'Buildings, building services and site infrastructure.', false, 850, [
    ['Office Buildings', 'elevator'], ['Warehouses', 'elevator'], ['Factories', 'factory'], ['Elevators', 'elevator'], ['Escalators', 'elevator'],
    ['Roads & Parking', 'car'], ['Fences & Gates', 'lock'], ['Substations', 'generator'], ['Solar Plants', 'solar'], ['Water Networks', 'droplets']
  ]],
  ['CAT-TOOL', 'Tools & Equipment', 'Movable Asset', 'wrench', '#475569', 'Hand tools, power tools and measuring instruments.', false, 1120, [
    ['Power Drills', 'drill'], ['Hand Tools', 'wrench'], ['Calibration Kits', 'gauge'], ['Multimeters', 'gauge'], ['Torque Wrenches', 'wrench'],
    ['Ladders', 'crane'], ['Welding Sets', 'flame'], ['Measuring Instruments', 'gauge']
  ]],
  ['CAT-FUR', 'Furniture & Fixtures', 'Movable Asset', 'chair', '#f59e0b', 'Office furniture, fixtures and fittings.', false, 640, [
    ['Office Chairs', 'chair'], ['Desks', 'desk'], ['Conference Tables', 'desk'], ['Filing Cabinets', 'cabinet'], ['Sofas', 'sofa'], ['Shelving', 'cabinet']
  ]],
  ['CAT-SAF', 'Safety & Security', 'Fixed Asset', 'firewall', '#334155', 'Surveillance, access control and security systems.', false, 320, [
    ['CCTV Cameras', 'cctv'], ['Access Control', 'lock'], ['Biometric Readers', 'lock'], ['Intrusion Alarms', 'siren'], ['NVRs', 'storage']
  ]],
  ['CAT-MED', 'Medical Equipment', 'Fixed Asset', 'medical', '#dc2626', 'First aid and occupational health equipment.', false, 420, [
    ['Defibrillators', 'medical'], ['Patient Monitors', 'activity'], ['First Aid Kits', 'medical'], ['Stretchers', 'medical'], ['Wheelchairs', 'chair'],
    ['Oxygen Cylinders', 'gauge'], ['Medical Fridges', 'chiller'], ['Examination Beds', 'sofa'], ['ECG Machines', 'activity']
  ]],
  ['CAT-ELC', 'Electrical & Utilities', 'Fixed Asset', 'ev', '#334155', 'Power distribution, backup power and utilities.', true, 520, [
    ['UPS', 'battery'], ['Transformers', 'generator'], ['Distribution Panels', 'panel'], ['EV Chargers', 'ev'], ['Battery Banks', 'battery'],
    ['Solar Panels', 'solar'], ['Emergency Lights', 'panel']
  ]],
  ['CAT-CONS', 'Consumables', 'Consumable', 'conveyor', '#334155', 'Items used up in operations and not depreciated.', false, 180, [
    ['Toner Cartridges', 'printer'], ['Stationery', 'conveyor'], ['Cleaning Supplies', 'droplets'], ['Lubricants', 'droplets']
  ]],
  ['CAT-NET', 'Network Equipment', 'Fixed Asset', 'network', '#0369a1', 'Switching, routing and wireless network infrastructure.', false, 260, [
    ['Switches', 'network'], ['Routers', 'router'], ['Firewalls', 'firewall'], ['Access Points', 'wifi'], ['Wireless Controllers', 'server'], ['Load Balancers', 'server'], ['Patch Panels', 'network']
  ]],
  ['CAT-HVAC', 'HVAC', 'Fixed Asset', 'ac', '#0891b2', 'Heating, ventilation and air conditioning.', false, 210, [
    ['Air Conditioners', 'ac'], ['Chillers', 'chiller'], ['Cooling Towers', 'fan'], ['Fan Coil Units', 'fan'], ['Air Handling Units', 'ac'], ['Exhaust Fans', 'fan'], ['Thermostats', 'gauge']
  ]],
  ['CAT-OFF', 'Office Equipment', 'Movable Asset', 'printer', '#4f46e5', 'Shared office devices.', false, 150, [
    ['Printers & Copiers', 'printer'], ['Shredders', 'conveyor'], ['Projectors', 'projector'], ['Scanners', 'scanner'], ['Laminators', 'conveyor'], ['Binding Machines', 'conveyor']
  ]],
  ['CAT-LAB', 'Laboratory Equipment', 'Fixed Asset', 'microscope', '#7c3aed', 'Quality and research laboratory instruments.', false, 60, [
    ['Microscopes', 'microscope'], ['Centrifuges', 'machine'], ['Incubators', 'chiller'], ['Balances', 'gauge'], ['Fume Hoods', 'fan'], ['Spectrometers', 'microscope']
  ]],
  ['CAT-SW', 'Software & Licenses', 'Intangible Asset', 'software', '#0f766e', 'Perpetual and subscription software licenses.', false, 140, [
    ['Operating Systems', 'software'], ['Productivity Suites', 'software'], ['Design Software', 'software'], ['Security Software', 'firewall'], ['ERP Licenses', 'software']
  ]],
  ['CAT-PLM', 'Plumbing & Water', 'Fixed Asset', 'droplets', '#0284c7', 'Water supply, storage and drainage equipment.', false, 90, [
    ['Pumps', 'gauge'], ['Water Tanks', 'droplets'], ['Water Heaters', 'flame'], ['Valves', 'gauge'], ['Filtration Units', 'droplets'], ['Water Meters', 'gauge']
  ]],
  ['CAT-FIRE', 'Fire Protection', 'Fixed Asset', 'flame', '#dc2626', 'Fire detection and suppression systems.', false, 120, [
    ['Fire Extinguishers', 'flame'], ['Fire Alarm Panels', 'siren'], ['Sprinkler Systems', 'droplets'], ['Smoke Detectors', 'siren'], ['Fire Pumps', 'gauge'], ['Hose Reels', 'droplets']
  ]],
  ['CAT-MHE', 'Material Handling', 'Movable Asset', 'forklift', '#b45309', 'Non-powered and light material handling equipment.', false, 85, [
    ['Pallet Jacks', 'forklift'], ['Conveyors', 'conveyor'], ['Hoists', 'crane'], ['Trolleys', 'conveyor'], ['Stackers', 'forklift'], ['Dock Levelers', 'crane']
  ]],
  ['CAT-KIT', 'Kitchen & Pantry', 'Movable Asset', 'coffee', '#a16207', 'Pantry and canteen appliances.', false, 70, [
    ['Refrigerators', 'chiller'], ['Microwave Ovens', 'microwave'], ['Coffee Machines', 'coffee'], ['Water Dispensers', 'droplets'], ['Dishwashers', 'droplets'], ['Cooking Ranges', 'flame']
  ]],
  ['CAT-AV', 'Audio Visual', 'Movable Asset', 'video', '#9333ea', 'Meeting room and signage equipment.', false, 95, [
    ['Displays', 'monitor'], ['Video Conferencing', 'video'], ['Speakers', 'video'], ['Microphones', 'video'], ['Cameras', 'camera'], ['Digital Signage', 'monitor']
  ]],
  ['CAT-TEL', 'Telecommunications', 'Movable Asset', 'phone', '#2563eb', 'Voice and radio communication equipment.', false, 65, [
    ['IP Phones', 'phone'], ['PBX Systems', 'server'], ['Two-way Radios', 'phone'], ['Satellite Phones', 'phone'], ['Mobile Boosters', 'wifi']
  ]],
  ['CAT-LHI', 'Leasehold Improvements', 'Facility Asset', 'elevator', '#64748b', 'Fit-out works in leased premises.', false, 30, [
    ['Partitions', 'elevator'], ['False Ceilings', 'elevator'], ['Flooring', 'elevator'], ['Fit-out Works', 'wrench'], ['Signage', 'panel']
  ]],
  ['CAT-RENT', 'Rental Equipment', 'Leased Asset', 'truck', '#64748b', 'Short-term rented equipment.', true, 25, [
    ['Rented Vehicles', 'car'], ['Rented Generators', 'generator'], ['Rented Lifts', 'crane'], ['Rented Tools', 'drill']
  ]],
  ['CAT-SPR', 'Spare Parts', 'Consumable', 'conveyor', '#475569', 'Critical spares held in stores.', false, 25, [
    ['Filters', 'conveyor'], ['Belts', 'conveyor'], ['Bearings', 'gauge'], ['Batteries', 'battery'], ['Motors', 'machine'], ['Circuit Boards', 'server']
  ]]
];

const SUB_COLORS = ['#1d4ed8', '#334155', '#dc2626', '#7c3aed', '#f59e0b', '#0f766e'];

// Defaults by category asset type: [depreciation, useful life (years), tracking]
const TYPE_DEFAULTS: Record<string, [CategoryRecord['depreciationMethod'], number, CategoryRecord['trackingMethod']]> = {
  'Fixed Asset': ['Straight Line', 5, 'RFID'],
  'Movable Asset': ['Straight Line', 5, 'QR Code'],
  'Fleet Asset': ['Declining Balance', 8, 'GPS'],
  'Facility Asset': ['Straight Line', 20, 'Barcode'],
  Consumable: ['Straight Line', 1, 'Barcode'],
  'Intangible Asset': ['Straight Line', 3, 'QR Code'],
  'Leased Asset': ['Straight Line', 3, 'GPS']
};

const COST_CENTER_OF: Record<string, string> = {
  'CAT-IT': 'IT-001', 'CAT-NET': 'NET-001', 'CAT-SW': 'IT-001', 'CAT-MAC': 'MFG-001', 'CAT-VEH': 'FLT-001', 'CAT-MHE': 'FLT-001',
  'CAT-BLD': 'FM-001', 'CAT-HVAC': 'FM-001', 'CAT-PLM': 'FM-002', 'CAT-LHI': 'FM-002', 'CAT-TOOL': 'TLS-001', 'CAT-FUR': 'ADM-001',
  'CAT-OFF': 'ADM-001', 'CAT-KIT': 'ADM-001', 'CAT-AV': 'ADM-001', 'CAT-TEL': 'IT-001', 'CAT-SAF': 'SEC-001', 'CAT-FIRE': 'HSE-001',
  'CAT-MED': 'HSE-001', 'CAT-ELC': 'ELE-001', 'CAT-LAB': 'QA-001', 'CAT-CONS': 'ADM-001', 'CAT-RENT': 'FLT-001', 'CAT-SPR': 'MFG-001'
};

const FIELDS: [string, CustomFieldType, boolean][] = [['Serial Number', 'Text', true], ['Purchase Order', 'Text', false], ['Warranty Expiry', 'Date', false]];

// IT subcategory codes from the design; the rest use the first three letters of the name
const SUB_CODE_OVERRIDES: Record<string, string> = { Servers: 'SRV', Printers: 'PRN', 'Network Devices': 'NET', 'Mobile Devices': 'MOB' };

/** SUB-IT-LAP for Laptops in CAT-IT; adds letters when three clash. */
export function subcategoryCode(categoryCode: string, name: string, taken: Set<string>): string {
  const short = categoryCode.replace(/^CAT-/, '');
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  const base = SUB_CODE_OVERRIDES[name] ?? letters.slice(0, 3);
  let code = `SUB-${short}-${base}`;
  for (let n = 4; taken.has(code) && n <= letters.length; n++) code = `SUB-${short}-${letters.slice(0, n)}`;
  for (let n = 2; taken.has(code); n++) code = `SUB-${short}-${base}${n}`;
  return code;
}

/** Spreads `total` assets over the subcategories, larger shares first, summing exactly. */
function spread(total: number, count: number, seed: number): number[] {
  const weights = Array.from({ length: count }, (_, i) => count - i + ((seed + i * 7) % 5));
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  parts[0] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 12) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

export function initialCategories(): CategoryRecord[] {
  const taken = new Set<string>();
  return SEEDS.map(([code, name, assetType, icon, color, description, inactive, total, subs], i): CategoryRecord => {
    const fixed = subs.every((s) => s[2] !== undefined);
    const counts = fixed ? subs.map((s) => s[2]!) : spread(total, subs.length, i);
    const subcategories: SubcategoryRecord[] = subs.map(([subName, subIcon], k) => {
      const subCode = subcategoryCode(code, subName, taken);
      taken.add(subCode);
      return {
        code: subCode,
        name: subName,
        icon: subIcon,
        color: SUB_COLORS[(i + k) % SUB_COLORS.length],
        status: inactive ? 'Inactive' : 'Active',
        assets: counts[k]
      };
    });
    const [depreciationMethod, usefulLifeYears, trackingMethod] = TYPE_DEFAULTS[assetType];
    const fields: CustomField[] = FIELDS.map(([n, type, required]) => ({ name: n, type, required }));
    return {
      code,
      name,
      assetType,
      icon,
      color,
      image: null,
      description,
      parentCode: null,
      status: inactive ? 'Inactive' : 'Active',
      subcategories,
      depreciationMethod,
      usefulLifeYears,
      costCenter: COST_CENTER_OF[code] ?? '',
      tagPrefix: code.replace(/^CAT-/, ''),
      trackingMethod,
      defaultCondition: 'New',
      customFields: assetType === 'Consumable' ? [] : fields,
      subcategoryRequired: assetType !== 'Consumable',
      showInMobile: !inactive,
      includeInReports: true,
      approvalForNewAssets: assetType === 'Fleet Asset' || assetType === 'Facility Asset',
      openWorkOrders: i === 0 ? 56 : inactive ? 0 : (i * 13) % 40,
      documents: 1 + ((i * 3) % 6),
      createdOn: i === 0 ? '2024-01-12T10:30' : stamp(i * 3),
      createdBy: ['Rex Kumar', 'Aisha Rahman', 'Karthik R'][i % 3],
      updatedOn: i === 0 ? '2026-10-15T14:45' : stamp(i * 3 + 300 + (i % 20) * 9)
    };
  });
}

export function blankCategory(): CategoryRecord {
  return {
    code: '',
    name: '',
    assetType: '',
    icon: 'conveyor',
    color: '#1d4ed8',
    image: null,
    description: '',
    parentCode: null,
    status: 'Active',
    subcategories: [],
    depreciationMethod: 'Straight Line',
    usefulLifeYears: 5,
    costCenter: '',
    tagPrefix: '',
    trackingMethod: 'RFID',
    defaultCondition: 'New',
    customFields: [],
    subcategoryRequired: true,
    showInMobile: true,
    includeInReports: true,
    approvalForNewAssets: false,
    openWorkOrders: 0,
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}

export const CATEGORY_TYPE_DEFAULTS = TYPE_DEFAULTS;
