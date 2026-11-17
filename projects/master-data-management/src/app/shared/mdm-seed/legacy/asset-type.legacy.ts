import { AssetModelIcon } from '../../../asset/asset-model/asset-model.icons';
import { AssetTypeRecord, CustomField, CustomFieldType, MaintenanceType } from '../../../asset/asset-type/asset-type.model';

/*
 * DEMO MODE: hard-coded asset types until the API is wired up. The first ten rows match the
 * approved design and the totals match it too (86 types, 8 inactive, 12 asset classes). It
 * includes every asset type the Asset Model master uses.
 */

export const ASSET_CLASSES = [
  'Movable Asset',
  'Fixed Asset',
  'Infrastructure',
  'Plant & Machinery',
  'Rolling Stock',
  'Building Services',
  'Tools & Equipment',
  'Furniture & Fixtures',
  'Leased Asset',
  'Intangible Asset',
  'Consumable',
  'Leasehold Improvement'
];

export const MAINTENANCE_TYPES: MaintenanceType[] = ['Preventive + Corrective', 'Preventive + Predictive', 'Preventive', 'Corrective', 'Condition Based'];
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['Text', 'Number', 'Date', 'Dropdown', 'Yes / No'];

// Cost center, service provider and capitalization threshold (AED) for each category
const CATEGORY_DEFAULTS: Record<string, [string, string, number]> = {
  'IT Equipment': ['IT-001', 'IT Vendor (Default)', 5000],
  'Network Equipment': ['NET-001', 'Network Integrator (Default)', 5000],
  Security: ['SEC-001', 'Security Systems Vendor', 3000],
  'Safety & Security': ['HSE-001', 'Fire & Safety Contractor', 1000],
  Machinery: ['MFG-001', 'OEM Service (Default)', 25000],
  Vehicles: ['FLT-001', 'Fleet Service Center', 20000],
  HVAC: ['FM-001', 'HVAC Contractor (Default)', 10000],
  Electrical: ['ELE-001', 'Electrical Contractor', 10000],
  Facilities: ['FM-002', 'FM Contractor (Default)', 10000],
  Plumbing: ['FM-002', 'FM Contractor (Default)', 5000],
  Tools: ['TLS-001', 'In-house Workshop', 2000],
  Furniture: ['ADM-001', 'Office Supplies Vendor', 2000],
  'Office Equipment': ['ADM-001', 'Office Supplies Vendor', 2000],
  'Laboratory Equipment': ['QA-001', 'Lab Equipment Vendor', 5000],
  'Medical Equipment': ['HSE-001', 'Biomedical Service Vendor', 5000],
  Software: ['IT-001', 'IT Vendor (Default)', 10000]
};

export const TYPE_COST_CENTERS = [...new Set(Object.values(CATEGORY_DEFAULTS).map((d) => d[0]))];
export const SERVICE_PROVIDERS = [...new Set(Object.values(CATEGORY_DEFAULTS).map((d) => d[1]))];

// [name, code, category, asset class, icon, lifecycle years, warranty months, inactive?]
type Seed = [string, string, string, string, AssetModelIcon, number, number, boolean?];
const SEEDS: Seed[] = [
  ['Laptop', 'AT-LAP-001', 'IT Equipment', 'Movable Asset', 'laptop', 4, 36],
  ['Desktop', 'AT-DES-001', 'IT Equipment', 'Movable Asset', 'monitor', 4, 36],
  ['Server', 'AT-SRV-001', 'IT Equipment', 'Movable Asset', 'server', 5, 36],
  ['Network Switch', 'AT-SW-001', 'IT Equipment', 'Movable Asset', 'network', 5, 60],
  ['Printer', 'AT-PRN-001', 'IT Equipment', 'Movable Asset', 'printer', 4, 12],
  ['Forklift', 'AT-FLK-001', 'Vehicles', 'Movable Asset', 'forklift', 7, 24],
  ['Air Conditioner', 'AT-AC-001', 'HVAC', 'Fixed Asset', 'ac', 10, 24],
  ['CCTV Camera', 'AT-CCTV-001', 'Security', 'Fixed Asset', 'cctv', 5, 24],
  ['Generator', 'AT-GEN-001', 'Machinery', 'Fixed Asset', 'generator', 10, 24],
  ['Fire Extinguisher', 'AT-FE-001', 'Safety & Security', 'Fixed Asset', 'flame', 5, 12],
  ['Mobile Device', 'AT-MOB-001', 'IT Equipment', 'Movable Asset', 'smartphone', 3, 12],
  ['Tablet', 'AT-TAB-001', 'IT Equipment', 'Movable Asset', 'tablet', 3, 12],
  ['Monitor', 'AT-MON-001', 'IT Equipment', 'Movable Asset', 'monitor', 6, 36],
  ['Projector', 'AT-PRJ-001', 'IT Equipment', 'Movable Asset', 'projector', 5, 24],
  ['Scanner', 'AT-SCN-001', 'IT Equipment', 'Movable Asset', 'scanner', 5, 12],
  ['Storage Array', 'AT-STG-001', 'IT Equipment', 'Infrastructure', 'storage', 6, 36],
  ['Access Point', 'AT-AP-001', 'Network Equipment', 'Infrastructure', 'wifi', 5, 36],
  ['Router', 'AT-RTR-001', 'Network Equipment', 'Infrastructure', 'router', 7, 36],
  ['Firewall', 'AT-FW-001', 'Network Equipment', 'Infrastructure', 'firewall', 5, 36],
  ['Wireless Controller', 'AT-WLC-001', 'Network Equipment', 'Infrastructure', 'server', 7, 36],
  ['CNC Machine', 'AT-CNC-001', 'Machinery', 'Plant & Machinery', 'machine', 15, 24],
  ['Compressor', 'AT-CMP-001', 'Machinery', 'Plant & Machinery', 'gauge', 12, 24],
  ['Conveyor', 'AT-CNV-001', 'Machinery', 'Plant & Machinery', 'conveyor', 12, 12],
  ['Pump', 'AT-PMP-001', 'Machinery', 'Plant & Machinery', 'gauge', 10, 24],
  ['Lathe', 'AT-LTH-001', 'Machinery', 'Plant & Machinery', 'machine', 15, 24],
  ['Injection Moulding Machine', 'AT-IMM-001', 'Machinery', 'Plant & Machinery', 'factory', 15, 24],
  ['Reach Truck', 'AT-RCH-001', 'Vehicles', 'Movable Asset', 'forklift', 10, 24],
  ['Pickup Truck', 'AT-PKP-001', 'Vehicles', 'Rolling Stock', 'truck', 8, 36],
  ['Van', 'AT-VAN-001', 'Vehicles', 'Rolling Stock', 'car', 8, 36],
  ['Bus', 'AT-BUS-001', 'Vehicles', 'Rolling Stock', 'bus', 12, 36],
  ['Chiller', 'AT-CHL-001', 'HVAC', 'Building Services', 'chiller', 20, 24],
  ['Cooling Tower', 'AT-CTW-001', 'HVAC', 'Building Services', 'fan', 20, 24],
  ['Fan Coil Unit', 'AT-FCU-001', 'HVAC', 'Building Services', 'fan', 15, 24],
  ['UPS', 'AT-UPS-001', 'Electrical', 'Fixed Asset', 'battery', 10, 24],
  ['Transformer', 'AT-TRF-001', 'Electrical', 'Infrastructure', 'generator', 25, 24],
  ['Distribution Panel', 'AT-DBP-001', 'Electrical', 'Infrastructure', 'panel', 20, 12],
  ['Elevator', 'AT-ELV-001', 'Facilities', 'Building Services', 'elevator', 25, 24],
  ['Water Heater', 'AT-WHT-001', 'Facilities', 'Building Services', 'flame', 10, 24],
  ['Fire Alarm Panel', 'AT-FAP-001', 'Safety & Security', 'Fixed Asset', 'siren', 12, 24],
  ['Power Drill', 'AT-DRL-001', 'Tools', 'Tools & Equipment', 'drill', 5, 12],
  ['Calibration Kit', 'AT-CAL-001', 'Tools', 'Tools & Equipment', 'gauge', 8, 12],
  ['Office Chair', 'AT-CHR-001', 'Furniture', 'Furniture & Fixtures', 'chair', 7, 60],
  ['Docking Station', 'AT-DOC-001', 'IT Equipment', 'Movable Asset', 'laptop', 4, 36],
  ['IP Phone', 'AT-IPP-001', 'IT Equipment', 'Movable Asset', 'phone', 5, 12],
  ['Barcode Scanner', 'AT-BCS-001', 'IT Equipment', 'Movable Asset', 'barcode', 4, 12],
  ['Thin Client', 'AT-THC-001', 'IT Equipment', 'Movable Asset', 'monitor', 5, 36, true],
  ['Workstation', 'AT-WKS-001', 'IT Equipment', 'Movable Asset', 'monitor', 5, 36],
  ['Interactive Display', 'AT-IDP-001', 'IT Equipment', 'Fixed Asset', 'video', 6, 36],
  ['Video Conferencing System', 'AT-VCS-001', 'IT Equipment', 'Fixed Asset', 'video', 5, 24],
  ['Biometric Reader', 'AT-BIO-001', 'Security', 'Fixed Asset', 'lock', 6, 24],
  ['Access Control Panel', 'AT-ACP-001', 'Security', 'Infrastructure', 'lock', 10, 24],
  ['NVR', 'AT-NVR-001', 'Security', 'Infrastructure', 'storage', 6, 36],
  ['Fire Pump', 'AT-FPM-001', 'Safety & Security', 'Building Services', 'droplets', 20, 24],
  ['Sprinkler System', 'AT-SPR-001', 'Safety & Security', 'Building Services', 'droplets', 25, 24],
  ['Smoke Detector', 'AT-SMD-001', 'Safety & Security', 'Fixed Asset', 'siren', 10, 12],
  ['Emergency Light', 'AT-EML-001', 'Safety & Security', 'Fixed Asset', 'panel', 8, 12],
  ['Escalator', 'AT-ESC-001', 'Facilities', 'Building Services', 'elevator', 25, 24],
  ['Boiler', 'AT-BLR-001', 'Facilities', 'Building Services', 'flame', 20, 24],
  ['Air Handling Unit', 'AT-AHU-001', 'HVAC', 'Building Services', 'ac', 15, 24],
  ['Exhaust Fan', 'AT-EXF-001', 'HVAC', 'Building Services', 'fan', 10, 12],
  ['Water Tank', 'AT-WTK-001', 'Plumbing', 'Infrastructure', 'droplets', 20, 12],
  ['Solar Panel', 'AT-SOL-001', 'Electrical', 'Infrastructure', 'solar', 25, 120],
  ['EV Charger', 'AT-EVC-001', 'Electrical', 'Fixed Asset', 'ev', 10, 36],
  ['Battery Bank', 'AT-BTB-001', 'Electrical', 'Fixed Asset', 'battery', 8, 24],
  ['Welding Machine', 'AT-WLD-001', 'Machinery', 'Plant & Machinery', 'flame', 10, 12],
  ['Hydraulic Press', 'AT-HYP-001', 'Machinery', 'Plant & Machinery', 'machine', 20, 24],
  ['Overhead Crane', 'AT-CRN-001', 'Machinery', 'Plant & Machinery', 'crane', 25, 24],
  ['Pallet Jack', 'AT-PLJ-001', 'Vehicles', 'Tools & Equipment', 'forklift', 7, 12],
  ['Scissor Lift', 'AT-SCL-001', 'Vehicles', 'Movable Asset', 'crane', 10, 24],
  ['Golf Cart', 'AT-GLF-001', 'Vehicles', 'Rolling Stock', 'car', 8, 24, true],
  ['Leased Vehicle', 'AT-LSV-001', 'Vehicles', 'Leased Asset', 'car', 4, 36],
  ['Office Desk', 'AT-DSK-001', 'Furniture', 'Furniture & Fixtures', 'desk', 10, 60],
  ['Filing Cabinet', 'AT-FCB-001', 'Furniture', 'Furniture & Fixtures', 'cabinet', 15, 24],
  ['Conference Table', 'AT-CFT-001', 'Furniture', 'Furniture & Fixtures', 'desk', 10, 60],
  ['Sofa', 'AT-SOF-001', 'Furniture', 'Furniture & Fixtures', 'sofa', 8, 24, true],
  ['Refrigerator', 'AT-REF-001', 'Office Equipment', 'Movable Asset', 'chiller', 8, 24],
  ['Microwave Oven', 'AT-MWO-001', 'Office Equipment', 'Movable Asset', 'microwave', 5, 12, true],
  ['Coffee Machine', 'AT-COF-001', 'Office Equipment', 'Movable Asset', 'coffee', 5, 12],
  ['Water Dispenser', 'AT-WDS-001', 'Office Equipment', 'Movable Asset', 'droplets', 5, 12, true],
  ['Microscope', 'AT-MIC-001', 'Laboratory Equipment', 'Movable Asset', 'microscope', 10, 24],
  ['Defibrillator', 'AT-AED-001', 'Medical Equipment', 'Movable Asset', 'medical', 8, 24],
  ['Patient Monitor', 'AT-PTM-001', 'Medical Equipment', 'Movable Asset', 'activity', 7, 24, true],
  ['Software License', 'AT-SWL-001', 'Software', 'Intangible Asset', 'software', 3, 12],
  ['Toner Cartridge', 'AT-TNR-001', 'IT Equipment', 'Consumable', 'conveyor', 1, 0, true],
  ['Partition Wall', 'AT-PTW-001', 'Facilities', 'Leasehold Improvement', 'elevator', 10, 12, true],
  ['Multimeter', 'AT-MMT-001', 'Tools', 'Tools & Equipment', 'gauge', 8, 12]
];

const DESCRIPTIONS: Record<string, string> = {
  Laptop: 'Portable computing devices including notebooks, ultrabooks and workstations.',
  Desktop: 'Desk-based computers for office users.',
  Server: 'Rack and tower servers hosting business applications.',
  'Network Switch': 'Access and core switches for wired networks.',
  Printer: 'Office printers and multifunction devices.',
  Forklift: 'Counterbalance forklifts for warehouse material handling.',
  'Air Conditioner': 'Split, ducted and packaged air conditioning units.',
  'CCTV Camera': 'Fixed and PTZ surveillance cameras.',
  Generator: 'Standby and prime power generator sets.',
  'Fire Extinguisher': 'Portable fire extinguishers of all classes.'
};

const HEAVY = ['Machinery', 'Vehicles', 'HVAC', 'Electrical', 'Facilities', 'Plumbing'];

const CUSTOM_FIELDS: Record<string, [string, CustomFieldType, boolean][]> = {
  'IT Equipment': [['Serial Number', 'Text', true], ['MAC Address', 'Text', false], ['OS Version', 'Text', false], ['Encryption Enabled', 'Yes / No', false]],
  'Network Equipment': [['Serial Number', 'Text', true], ['Firmware Version', 'Text', false], ['Management IP', 'Text', false]],
  Security: [['Serial Number', 'Text', true], ['IP Address', 'Text', false], ['Recording Days', 'Number', false]],
  'Safety & Security': [['Serial Number', 'Text', true], ['Last Refill Date', 'Date', true], ['Civil Defence Certificate', 'Text', false]],
  Machinery: [['Serial Number', 'Text', true], ['Running Hours', 'Number', false], ['Commissioning Date', 'Date', false]],
  Vehicles: [['Chassis Number', 'Text', true], ['Plate Number', 'Text', true], ['Odometer (km)', 'Number', false], ['Fuel Type', 'Dropdown', false]],
  HVAC: [['Serial Number', 'Text', true], ['Refrigerant', 'Dropdown', false], ['Capacity (TR)', 'Number', false]],
  Software: [['License Key', 'Text', true], ['Seats', 'Number', true], ['Renewal Date', 'Date', true]]
};

function plural(name: string): string {
  if (/(s|x|ch|sh)$/i.test(name)) return `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 12) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

export function initialAssetTypes(): AssetTypeRecord[] {
  return SEEDS.map(([name, code, category, assetClass, icon, lifecycleYears, warrantyMonths, inactive], i): AssetTypeRecord => {
    const [costCenter, serviceProvider, threshold] = CATEGORY_DEFAULTS[category] ?? ['', '', 5000];
    const prefix = code.split('-')[1];
    const heavy = HEAVY.includes(category);
    const fields: CustomField[] = (CUSTOM_FIELDS[category] ?? [['Serial Number', 'Text', true]]).map(([n, type, required]) => ({ name: n, type, required }));
    const expensed = assetClass === 'Consumable' || assetClass === 'Intangible Asset';
    return {
      code,
      name,
      category,
      assetClass,
      icon,
      image: null,
      description: DESCRIPTIONS[name] ?? `${plural(name)} used across sites.`,
      status: inactive ? 'Inactive' : 'Active',
      subcategories: name === 'Laptop' ? ['Laptops', 'Workstations', 'Tablets'] : [plural(name), ['Standard', 'Heavy Duty', 'Premium', 'Compact'][i % 4]],
      taggingFormat: `${prefix}-{YY}-{0000}`,
      lifecycleYears,
      maintenanceType: category === 'IT Equipment' ? 'Preventive + Corrective' : heavy ? 'Preventive + Predictive' : expensed ? 'Corrective' : 'Preventive',
      maintenancePlan: `${costCenter.split('-')[0] || 'GEN'}-${prefix}-STD`,
      warrantyMonths,
      serviceProvider,
      depreciationMethod: i >= 10 && heavy && i % 3 === 0 ? 'Declining Balance' : 'Straight Line',
      usefulLifeMonths: lifecycleYears * 12,
      residualPercent: heavy ? 10 : expensed ? 0 : 5,
      costCenter,
      currency: 'AED - UAE Dirham',
      capitalizationThreshold: threshold,
      procurementType: expensed ? 'OPEX' : 'CAPEX',
      defaultCondition: 'New',
      trackingMethod: category === 'Vehicles' ? 'GPS' : heavy ? 'RFID' : category === 'Software' ? 'QR Code' : 'RFID',
      serialRequired: !['Furniture', 'Software'].includes(category) && assetClass !== 'Consumable',
      assignable: ['IT Equipment', 'Tools', 'Software'].includes(category),
      customFields: fields,
      inspectionRequired: heavy || category === 'Safety & Security',
      allowTransfers: assetClass !== 'Leasehold Improvement',
      iotTracking: category === 'Vehicles' || (heavy && i % 2 === 0),
      disposalApproval: !expensed,
      openWorkOrders: i === 0 ? 12 : inactive ? 0 : (i * 7) % 19,
      documents: i === 0 ? 8 : 1 + ((i * 5) % 9),
      createdOn: i === 0 ? '2024-01-12T10:30' : stamp(i * 4),
      createdBy: ['Rex Kumar', 'Aisha Rahman', 'Karthik R'][i % 3],
      updatedOn: i === 0 ? '2026-10-15T14:45' : stamp(i * 4 + 200 + (i % 50) * 3)
    };
  });
}

export function blankAssetType(): AssetTypeRecord {
  return {
    code: '',
    name: '',
    category: '',
    assetClass: '',
    icon: 'conveyor',
    image: null,
    description: '',
    status: 'Active',
    subcategories: [],
    taggingFormat: '',
    lifecycleYears: 5,
    maintenanceType: 'Preventive',
    maintenancePlan: '',
    warrantyMonths: 12,
    serviceProvider: '',
    depreciationMethod: 'Straight Line',
    usefulLifeMonths: 60,
    residualPercent: 5,
    costCenter: '',
    currency: 'AED - UAE Dirham',
    capitalizationThreshold: 5000,
    procurementType: 'CAPEX',
    defaultCondition: 'New',
    trackingMethod: 'RFID',
    serialRequired: true,
    assignable: false,
    customFields: [],
    inspectionRequired: false,
    allowTransfers: true,
    iotTracking: false,
    disposalApproval: true,
    openWorkOrders: 0,
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}

/** Cost center and service provider usually used for a category. */
export function categoryDefaults(category: string): { costCenter: string; serviceProvider: string; threshold: number } | null {
  const d = CATEGORY_DEFAULTS[category];
  return d ? { costCenter: d[0], serviceProvider: d[1], threshold: d[2] } : null;
}

export const TYPE_CATEGORIES = Object.keys(CATEGORY_DEFAULTS);
