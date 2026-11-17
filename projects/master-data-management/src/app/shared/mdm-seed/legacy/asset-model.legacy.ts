import { AssetModelIcon } from '../../../asset/asset-model/asset-model.icons';
import { AssetModelRecord, AssetTypeInfo, Criticality, MaintenanceStrategy, ModelSpec, PmFrequency, TrackingMethod } from '../../../asset/asset-model/asset-model.model';

/*
 * DEMO MODE: hard-coded asset models until the API is wired up. The first ten rows match the
 * approved design, and the totals match it too (520 models, 52 inactive, 86 manufacturers,
 * 42 asset types). The rest are generated from the asset types below.
 */

// [asset type, category, icon, tag prefix, lifecycle years, warranty months, manufacturers, series name]
type TypeSeed = [string, string, AssetModelIcon, string, number, number, string[], string];
const TYPE_SEEDS: TypeSeed[] = [
  ['Laptop', 'IT Equipment', 'laptop', 'LAP', 4, 36, ['Dell', 'Lenovo', 'HP', 'Apple', 'Acer', 'Asus', 'Microsoft'], 'Notebook'],
  ['Desktop', 'IT Equipment', 'monitor', 'DSK', 5, 36, ['Dell', 'HP', 'Lenovo', 'Acer'], 'Tower'],
  ['Mobile Device', 'IT Equipment', 'smartphone', 'MOB', 3, 12, ['Apple', 'Samsung', 'Huawei'], 'Phone'],
  ['Tablet', 'IT Equipment', 'tablet', 'TAB', 3, 12, ['Apple', 'Samsung', 'Microsoft', 'Lenovo'], 'Tab'],
  ['Printer', 'IT Equipment', 'printer', 'PRN', 5, 12, ['HP', 'Epson', 'Canon', 'Brother', 'Xerox'], 'LaserPro'],
  ['Monitor', 'IT Equipment', 'monitor', 'MON', 6, 36, ['Dell', 'LG', 'Samsung', 'BenQ'], 'Display'],
  ['Server', 'IT Equipment', 'server', 'SRV', 6, 36, ['Dell', 'HP', 'Lenovo', 'Cisco'], 'Rack Server'],
  ['Projector', 'IT Equipment', 'projector', 'PRJ', 5, 24, ['Epson', 'BenQ', 'Sony'], 'Beam'],
  ['Scanner', 'IT Equipment', 'scanner', 'SCN', 5, 12, ['Canon', 'Epson', 'Brother'], 'DocScan'],
  ['CCTV Camera', 'Security', 'cctv', 'CAM', 5, 24, ['Hikvision', 'Axis', 'Bosch', 'Sony'], 'Dome Cam'],
  ['Storage Array', 'IT Equipment', 'storage', 'STG', 6, 36, ['NetApp', 'Synology', 'Dell'], 'NAS'],
  ['Network Switch', 'Network Equipment', 'network', 'SWT', 7, 60, ['Cisco', 'Juniper', 'Aruba', 'Extreme Networks', 'Huawei', 'Netgear'], 'Switch'],
  ['Access Point', 'Network Equipment', 'wifi', 'APT', 5, 36, ['Extreme Networks', 'Aruba', 'Cisco', 'Ubiquiti', 'Ruckus'], 'AP'],
  ['Router', 'Network Equipment', 'router', 'RTR', 7, 36, ['Cisco', 'Juniper', 'MikroTik', 'Huawei'], 'Edge Router'],
  ['Firewall', 'Network Equipment', 'firewall', 'FWL', 5, 36, ['Fortinet', 'Palo Alto Networks', 'Cisco'], 'NGFW'],
  ['Wireless Controller', 'Network Equipment', 'server', 'WLC', 7, 36, ['Aruba', 'Ruckus', 'Cisco'], 'WLC'],
  ['Generator', 'Machinery', 'generator', 'GEN', 15, 24, ['Caterpillar', 'Cummins', 'Perkins', 'Kohler'], 'GenSet'],
  ['CNC Machine', 'Machinery', 'machine', 'CNC', 15, 24, ['Haas', 'DMG Mori', 'Mazak'], 'VMC'],
  ['Compressor', 'Machinery', 'gauge', 'CMP', 12, 24, ['Atlas Copco', 'Ingersoll Rand'], 'Screw Compressor'],
  ['Conveyor', 'Machinery', 'conveyor', 'CNV', 12, 12, ['Siemens', 'ABB'], 'Belt Conveyor'],
  ['Pump', 'Machinery', 'gauge', 'PMP', 10, 24, ['Grundfos', 'KSB'], 'Centrifugal Pump'],
  ['Lathe', 'Machinery', 'machine', 'LTH', 15, 24, ['Mazak', 'DMG Mori', 'Haas'], 'Turning Center'],
  ['Injection Moulding Machine', 'Machinery', 'factory', 'IMM', 15, 24, ['Engel'], 'Injection Press'],
  ['Forklift', 'Vehicles', 'forklift', 'FLT', 10, 24, ['Toyota', 'Komatsu', 'Hyster', 'Linde', 'Jungheinrich', 'Crown'], 'Forklift'],
  ['Reach Truck', 'Vehicles', 'forklift', 'RCH', 10, 24, ['Crown', 'Jungheinrich', 'Linde'], 'Reach Truck'],
  ['Pickup Truck', 'Vehicles', 'truck', 'PKP', 8, 36, ['Toyota', 'Nissan', 'Ford', 'Isuzu'], 'Pickup'],
  ['Van', 'Vehicles', 'car', 'VAN', 8, 36, ['Ford', 'Mercedes-Benz', 'Toyota', 'Nissan'], 'Cargo Van'],
  ['Bus', 'Vehicles', 'bus', 'BUS', 12, 36, ['Volvo', 'Mercedes-Benz', 'Isuzu'], 'Staff Bus'],
  ['Air Conditioner', 'HVAC', 'ac', 'ACU', 12, 24, ['Daikin', 'Carrier', 'Mitsubishi Electric', 'Gree', 'LG', 'Midea', 'Hitachi'], 'Split AC'],
  ['Chiller', 'HVAC', 'chiller', 'CHL', 20, 24, ['Carrier', 'Trane', 'York', 'Daikin', 'Johnson Controls'], 'Chiller'],
  ['Cooling Tower', 'HVAC', 'fan', 'CTW', 20, 24, ['Johnson Controls', 'Trane', 'Lennox'], 'Cooling Tower'],
  ['Fan Coil Unit', 'HVAC', 'fan', 'FCU', 15, 24, ['Carrier', 'Daikin', 'Trane', 'Lennox'], 'FCU'],
  ['UPS', 'Electrical', 'battery', 'UPS', 10, 24, ['APC', 'Eaton', 'Vertiv', 'Schneider Electric'], 'UPS'],
  ['Transformer', 'Electrical', 'generator', 'TRF', 25, 24, ['ABB', 'Siemens', 'Schneider Electric'], 'Transformer'],
  ['Distribution Panel', 'Electrical', 'panel', 'DBP', 20, 12, ['Schneider Electric', 'ABB', 'Legrand', 'Eaton'], 'MDB Panel'],
  ['Elevator', 'Facilities', 'elevator', 'ELV', 25, 24, ['Otis', 'Schindler', 'KONE', 'Thyssenkrupp'], 'Passenger Lift'],
  ['Water Heater', 'Facilities', 'flame', 'WHT', 10, 24, ['Ariston', 'Rheem'], 'Water Heater'],
  ['Fire Extinguisher', 'Safety & Security', 'flame', 'FEX', 10, 12, ['Kidde', 'Tyco'], 'CO2 Extinguisher'],
  ['Fire Alarm Panel', 'Safety & Security', 'siren', 'FAP', 12, 24, ['Honeywell', 'Tyco', 'Bosch', 'Siemens'], 'FACP'],
  ['Power Drill', 'Tools', 'drill', 'DRL', 5, 12, ['Makita', 'DeWalt', 'Bosch', 'Hilti'], 'Hammer Drill'],
  ['Calibration Kit', 'Tools', 'gauge', 'CAL', 8, 12, ['Fluke'], 'Calibrator'],
  ['Office Chair', 'Furniture', 'chair', 'CHR', 7, 60, ['Herman Miller', 'Steelcase'], 'Task Chair']
];

export const ASSET_TYPES: AssetTypeInfo[] = TYPE_SEEDS.map(([name, category, icon, tagPrefix, lifecycleYears, warrantyMonths]) => ({
  name,
  category,
  icon,
  tagPrefix,
  lifecycleYears,
  warrantyMonths
}));

export const CATEGORIES = [...new Set(TYPE_SEEDS.map((t) => t[1]))];

export const MANUFACTURERS = [...new Set(TYPE_SEEDS.flatMap((t) => t[6]))].sort((a, b) => a.localeCompare(b));

// Default cost center for new models of each category
export const CATEGORY_COST_CENTERS: Record<string, string> = {
  'IT Equipment': 'IT-001',
  'Network Equipment': 'NET-001',
  Machinery: 'MFG-001',
  Vehicles: 'FLT-001',
  HVAC: 'FM-001',
  Electrical: 'ELE-001',
  Facilities: 'FM-002',
  'Safety & Security': 'HSE-001',
  Security: 'SEC-001',
  Tools: 'TLS-001',
  Furniture: 'ADM-001'
};
export const MODEL_COST_CENTERS = Object.values(CATEGORY_COST_CENTERS);

export const PM_FREQUENCIES: PmFrequency[] = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'None'];
export const CRITICALITIES: Criticality[] = ['Low', 'Medium', 'High', 'Critical'];
export const TRACKING_METHODS: TrackingMethod[] = ['RFID', 'BLE', 'QR Code', 'Barcode', 'GPS'];

// Price range in AED for each category, used for the generated rows
const PRICE_RANGE: Record<string, [number, number]> = {
  'IT Equipment': [800, 12000],
  'Network Equipment': [1500, 45000],
  Machinery: [40000, 650000],
  Vehicles: [60000, 320000],
  HVAC: [4000, 480000],
  Electrical: [6000, 220000],
  Facilities: [3000, 380000],
  'Safety & Security': [250, 28000],
  Security: [400, 9000],
  Tools: [600, 15000],
  Furniture: [900, 6500]
};

const CODE_OVERRIDES: Record<string, string> = {
  Dell: 'DELL',
  Lenovo: 'LEN',
  Apple: 'APL',
  Samsung: 'SAM',
  Cisco: 'CIS',
  'Extreme Networks': 'EXT',
  Caterpillar: 'CAT',
  Toyota: 'TYT',
  Daikin: 'DAI'
};

export function manufacturerCode(name: string): string {
  return CODE_OVERRIDES[name] ?? name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

export function typeInfo(name: string): AssetTypeInfo | undefined {
  return ASSET_TYPES.find((t) => t.name === name);
}

export function defaultTaggingFormat(type: AssetTypeInfo | undefined): string {
  return `${type?.tagPrefix ?? 'AST'}-(YY)-(0000)`;
}

/** LAP-(YY)-(0000) or LAP-{YY}-{0000} becomes LAP-26-0001 for the current year. */
export function sampleTag(format: string): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  return format.replace(/[({]YY[)}]/g, yy).replace(/[({](0+)[)}]/, (_, zeros: string) => '1'.padStart(zeros.length, '0'));
}

/** A tagging format needs a running number such as (0000) or {0000}. */
export function hasRunningNumber(format: string): boolean {
  return /[({]0+[)}]/.test(format);
}

function pick<T>(list: T[], s: number, salt = 0): T {
  return list[(s + salt * 7) % list.length];
}

function spec(rows: [string, string][]): ModelSpec[] {
  return rows.map(([label, value]) => ({ label, value }));
}

/** Typical specification rows for an asset type; values vary with `s`. */
export function specsFor(type: Pick<AssetTypeInfo, 'name'>, s: number): ModelSpec[] {
  switch (type.name) {
    case 'Laptop':
    case 'Desktop': {
      const laptop = type.name === 'Laptop';
      return spec([
        ['Processor', pick(['Intel Core i5 (13th Gen)', 'Intel Core i7 (13th Gen)', 'AMD Ryzen 7 7840U', 'Intel Core Ultra 7'], s)],
        ['RAM', pick(['8 GB', '16 GB', '32 GB'], s, 1)],
        ['Storage', pick(['256 GB SSD', '512 GB SSD', '1 TB SSD'], s, 2)],
        ['Display', laptop ? pick(['14" FHD (1920 x 1080)', '15.6" FHD (1920 x 1080)', '13.3" QHD (2560 x 1600)'], s, 3) : 'External monitor'],
        ['Operating System', pick(['Windows 11 Pro', 'Windows 11 Pro', 'Ubuntu 22.04 LTS'], s, 4)],
        ['Weight', laptop ? `${(1.1 + (s % 9) / 10).toFixed(1)} kg` : `${5 + (s % 4)} kg`],
        ['Dimensions (mm)', laptop ? `${300 + (s % 60)} x ${200 + (s % 40)} x ${15 + (s % 6)}` : `${290 + (s % 30)} x ${95 + (s % 20)} x 293`],
        ['Color', pick(['Silver', 'Black', 'Grey'], s, 5)]
      ]);
    }
    case 'Mobile Device':
    case 'Tablet':
      return spec([
        ['Chipset', pick(['Apple A16 Bionic', 'Snapdragon 8 Gen 3', 'Kirin 9000S', 'Apple M2'], s)],
        ['RAM', pick(['6 GB', '8 GB', '12 GB'], s, 1)],
        ['Storage', pick(['128 GB', '256 GB', '512 GB'], s, 2)],
        ['Display', type.name === 'Tablet' ? pick(['11" LCD', '12.4" AMOLED', '13" OLED'], s, 3) : pick(['6.1" OLED', '6.2" AMOLED', '6.7" OLED'], s, 3)],
        ['Operating System', pick(['iOS 17', 'Android 14', 'HarmonyOS 4'], s, 4)],
        ['Weight', type.name === 'Tablet' ? `${450 + (s % 250)} g` : `${165 + (s % 60)} g`],
        ['Color', pick(['Black', 'Blue', 'Titanium', 'Silver'], s, 5)]
      ]);
    case 'Printer':
    case 'Scanner':
      return spec([
        ['Technology', type.name === 'Printer' ? pick(['Mono Laser', 'Colour Laser', 'Inkjet'], s) : 'Sheet-fed CIS'],
        ['Speed', type.name === 'Printer' ? `${30 + (s % 30)} ppm` : `${40 + (s % 40)} ppm`],
        ['Max Resolution', pick(['600 x 600 dpi', '1200 x 1200 dpi', '4800 x 1200 dpi'], s, 1)],
        ['Connectivity', pick(['USB, Ethernet, Wi-Fi', 'USB, Ethernet', 'Wi-Fi Direct'], s, 2)],
        ['Duty Cycle', `${(20 + (s % 80)) * 1000} pages / month`],
        ['Weight', `${8 + (s % 15)} kg`]
      ]);
    case 'Network Switch':
    case 'Router':
    case 'Firewall':
    case 'Wireless Controller':
    case 'Access Point':
      return spec([
        ['Ports', type.name === 'Access Point' ? '1 x 2.5GbE' : pick(['24 x 1GbE', '48 x 1GbE PoE+', '8 x 10GbE SFP+'], s)],
        ['Uplinks', type.name === 'Access Point' ? '-' : pick(['4 x 10G SFP+', '2 x 25G SFP28', '4 x 1G SFP'], s, 1)],
        ['Throughput', `${pick([10, 40, 176, 208], s, 2)} Gbps`],
        ['Wireless', type.name === 'Access Point' ? pick(['Wi-Fi 6 (802.11ax)', 'Wi-Fi 6E', 'Wi-Fi 7'], s, 3) : '-'],
        ['Power Supply', pick(['Single 350W', 'Dual 715W (redundant)', 'PoE powered'], s, 4)],
        ['Rack Units', type.name === 'Access Point' ? 'Ceiling mount' : `${1 + (s % 2)}U`]
      ]);
    case 'Generator':
    case 'Transformer':
    case 'UPS':
      return spec([
        ['Rating', type.name === 'UPS' ? `${pick([10, 20, 40, 80, 160], s)} kVA` : `${pick([250, 500, 1000, 1250, 2000], s)} kVA`],
        ['Input', type.name === 'Generator' ? pick(['Diesel', 'Diesel', 'Natural Gas'], s, 1) : '415 V, 3 phase'],
        ['Output', '400 / 230 V, 50 Hz'],
        [type.name === 'UPS' ? 'Battery Runtime' : 'Cooling', type.name === 'UPS' ? `${10 + (s % 20)} min at full load` : pick(['Radiator', 'ONAN', 'Air cooled'], s, 2)],
        ['Weight', `${(1 + (s % 12)) * (type.name === 'UPS' ? 45 : 650)} kg`]
      ]);
    case 'Forklift':
    case 'Reach Truck':
      return spec([
        ['Load Capacity', `${pick([1.5, 2, 2.5, 3, 3.5], s)} t`],
        ['Lift Height', `${(3 + (s % 8) * 0.5).toFixed(1)} m`],
        ['Power', pick(['Diesel', 'LPG', 'Electric 48V', 'Electric 80V'], s, 1)],
        ['Tyres', pick(['Pneumatic', 'Solid', 'Non-marking'], s, 2)],
        ['Service Weight', `${3000 + (s % 30) * 60} kg`]
      ]);
    case 'Pickup Truck':
    case 'Van':
    case 'Bus':
      return spec([
        ['Engine', pick(['2.4L Diesel', '2.8L Diesel', '3.0L Diesel', '2.7L Petrol'], s)],
        ['Transmission', pick(['6-speed Manual', '6-speed Automatic', '8-speed Automatic'], s, 1)],
        [type.name === 'Bus' ? 'Seating' : 'Payload', type.name === 'Bus' ? `${pick([26, 30, 40, 52], s, 2)} seats` : `${900 + (s % 12) * 50} kg`],
        ['Fuel Tank', `${70 + (s % 60)} L`],
        ['Gross Weight', `${type.name === 'Bus' ? 9000 + (s % 30) * 100 : 2800 + (s % 30) * 30} kg`]
      ]);
    case 'Air Conditioner':
    case 'Chiller':
    case 'Cooling Tower':
    case 'Fan Coil Unit':
      return spec([
        ['Cooling Capacity', type.name === 'Air Conditioner' || type.name === 'Fan Coil Unit' ? `${pick([1.5, 2, 3, 5, 10], s)} TR` : `${pick([150, 250, 400, 600], s)} TR`],
        ['Refrigerant', pick(['R-32', 'R-410A', 'R-134a', 'R-1234ze'], s, 1)],
        ['Power Supply', pick(['230 V, 1 phase', '415 V, 3 phase'], s, 2)],
        ['Airflow', `${(800 + (s % 40) * 100).toLocaleString('en-US')} CFM`],
        ['EER', (10 + (s % 30) / 10).toFixed(1)],
        ['Weight', `${40 + (s % 60) * 20} kg`]
      ]);
    case 'Office Chair':
      return spec([
        ['Material', pick(['Mesh back, fabric seat', 'Leather', 'Fabric'], s)],
        ['Adjustments', 'Height, tilt, armrests, lumbar'],
        ['Max Load', `${120 + (s % 4) * 10} kg`],
        ['Color', pick(['Black', 'Grey', 'Blue'], s, 1)]
      ]);
    default:
      return spec([
        ['Power', pick(['230 V, 1 phase', '415 V, 3 phase', '18 V battery', '-'], s)],
        ['Capacity', `${pick([5, 10, 22, 45, 75, 110], s, 1)} ${pick(['kW', 'L', 'kg'], s, 2)}`],
        ['Weight', `${2 + (s % 90) * 5} kg`],
        ['Dimensions (mm)', `${400 + (s % 40) * 20} x ${300 + (s % 30) * 15} x ${500 + (s % 25) * 30}`]
      ]);
  }
}

function base(type: AssetTypeInfo, manufacturer: string, s: number): Omit<AssetModelRecord, 'code' | 'name' | 'description' | 'specs' | 'status' | 'assetCount' | 'createdOn' | 'updatedOn'> {
  const [low, high] = PRICE_RANGE[type.category] ?? [1000, 10000];
  const price = Math.round((low + ((s % 997) / 997) * (high - low)) / 50) * 50;
  const heavy = ['Machinery', 'Vehicles', 'HVAC', 'Electrical', 'Facilities'].includes(type.category);
  return {
    manufacturer,
    assetType: type.name,
    category: type.category,
    image: null,
    lifecycleYears: type.lifecycleYears,
    warrantyMonths: type.warrantyMonths,
    pmFrequency: heavy ? pick<PmFrequency>(['Monthly', 'Quarterly', 'Half-yearly'], s) : pick<PmFrequency>(['Yearly', 'None', 'Half-yearly'], s),
    maintenanceStrategy: heavy ? pick<MaintenanceStrategy>(['Preventive', 'Predictive', 'Condition Based'], s, 1) : pick<MaintenanceStrategy>(['Preventive', 'Run to Failure'], s, 1),
    criticality: heavy ? pick<Criticality>(['High', 'Critical', 'Medium'], s, 2) : pick<Criticality>(['Low', 'Medium'], s, 2),
    calibrationRequired: type.category === 'Tools' || type.name === 'CNC Machine',
    costCenter: CATEGORY_COST_CENTERS[type.category] ?? '',
    currency: 'AED - UAE Dirham',
    purchasePrice: price,
    includeInDepreciation: price >= 1000,
    depreciationMethod: heavy ? 'Declining Balance' : 'Straight Line',
    salvagePercent: heavy ? 10 : 5,
    procurementType: price >= 1000 ? 'CAPEX' : 'OPEX',
    subcategories: [`${type.name}s`, pick(['Business Series', 'Standard', 'Heavy Duty', 'Premium'], s, 3)],
    taggingFormat: defaultTaggingFormat(type),
    trackingMethod: type.category === 'Vehicles' ? 'GPS' : heavy ? 'RFID' : pick<TrackingMethod>(['RFID', 'BLE', 'QR Code', 'Barcode'], s, 4),
    defaultCondition: 'New',
    serialRequired: type.category !== 'Furniture',
    assignable: ['IT Equipment', 'Tools'].includes(type.category)
  };
}

// [name, code, manufacturer, asset type, assets, description] - the rows in the approved design
type DesignSeed = [string, string, string, string, number, string];
const DESIGN_SEEDS: DesignSeed[] = [
  ['Latitude 7440', 'MOD-DELL-7440', 'Dell', 'Laptop', 850, 'Business laptop with high performance, security and portability for enterprise users.'],
  ['ThinkPad X1 Carbon', 'MOD-LEN-X1C', 'Lenovo', 'Laptop', 412, 'Lightweight premium business laptop for executives and travelling staff.'],
  ['iPhone 15', 'MOD-APL-15', 'Apple', 'Mobile Device', 236, 'Corporate smartphone issued to managers and field staff.'],
  ['Galaxy S24', 'MOD-SAM-S24', 'Samsung', 'Mobile Device', 198, 'Android corporate smartphone with Knox security.'],
  ['HP LaserJet M407', 'MOD-HP-M407', 'HP', 'Printer', 64, 'Mono laser printer for office floors.'],
  ['Cisco C9300-48P', 'MOD-CIS-9300', 'Cisco', 'Network Switch', 38, 'Catalyst 48-port PoE+ access switch.'],
  ['AP4020', 'MOD-EXT-4020', 'Extreme Networks', 'Access Point', 120, 'Wi-Fi 6 indoor access point.'],
  ['GenSet 1250kVA', 'MOD-CAT-1250', 'Caterpillar', 'Generator', 6, 'Standby diesel generator set for site backup power.'],
  ['Forklift 3T', 'MOD-TYT-3T', 'Toyota', 'Forklift', 18, '3 tonne diesel counterbalance forklift for warehouses.'],
  ['HVAC AHU-10TR', 'MOD-DAI-AHU10', 'Daikin', 'Air Conditioner', 44, '10 TR air handling unit for office floors.']
];

// Exact specifications shown in the design for the Dell Latitude 7440
const DELL_SPECS = spec([
  ['Processor', 'Intel Core i7 (13th Gen)'],
  ['RAM', '16 GB'],
  ['Storage', '512 GB SSD'],
  ['Display', '14" FHD (1920 x 1080)'],
  ['Operating System', 'Windows 11 Pro'],
  ['Weight', '1.3 kg'],
  ['Dimensions (mm)', '313 x 220 x 18'],
  ['Color', 'Silver']
]);

const GENERATED = 510;

// Models per manufacturer in the approved Manufacturer design, counting the rows above
const MODEL_QUOTAS: Record<string, number> = {
  Dell: 42,
  HP: 38,
  Lenovo: 36,
  Cisco: 28,
  Samsung: 24,
  Apple: 18,
  'Extreme Networks': 22,
  Caterpillar: 16,
  Daikin: 12,
  Toyota: 20
};

// Registered assets per manufacturer in the same design
const ASSET_TOTALS: Record<string, number> = { Dell: 1280 };
const DESCRIPTIONS: Record<string, string> = {
  'IT Equipment': 'for office and remote users',
  'Network Equipment': 'for campus and branch networks',
  Machinery: 'for production lines',
  Vehicles: 'for site logistics and transport',
  HVAC: 'for building cooling and ventilation',
  Electrical: 'for power distribution and backup',
  Facilities: 'for building services',
  'Safety & Security': 'for fire and life safety',
  Security: 'for site surveillance',
  Tools: 'for maintenance teams',
  Furniture: 'for workstations and meeting rooms'
};

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 15) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

export function initialAssetModels(): AssetModelRecord[] {
  const designed = DESIGN_SEEDS.map(([name, code, manufacturer, assetType, assetCount, description], i): AssetModelRecord => {
    const type = typeInfo(assetType)!;
    const s = i * 131 + 17;
    const record: AssetModelRecord = {
      ...base(type, manufacturer, s),
      code,
      name,
      description,
      specs: i === 0 ? DELL_SPECS : specsFor(type, s),
      status: 'Active',
      assetCount,
      createdOn: i === 0 ? '2024-01-12T10:30' : stamp(i * 3),
      updatedOn: i === 0 ? '2026-10-15T14:45' : stamp(i * 40)
    };
    if (i === 0) {
      Object.assign(record, {
        purchasePrice: 5000,
        costCenter: 'IT-001',
        includeInDepreciation: true,
        procurementType: 'CAPEX',
        subcategories: ['Laptops', 'Business Series']
      });
    }
    if (assetType === 'Laptop') record.lifecycleYears = 4;
    return record;
  });

  // One job per generated model: the manufacturer and a type it makes, cycling through its types
  const jobs: [string, TypeSeed][] = [];
  let spare = GENERATED - Object.entries(MODEL_QUOTAS).reduce((sum, [m, q]) => sum + q - designed.filter((r) => r.manufacturer === m).length, 0);
  const others = MANUFACTURERS.filter((m) => !(m in MODEL_QUOTAS));
  for (const manufacturer of MANUFACTURERS) {
    const makes = TYPE_SEEDS.filter((t) => t[6].includes(manufacturer));
    let count: number;
    if (manufacturer in MODEL_QUOTAS) {
      count = MODEL_QUOTAS[manufacturer] - designed.filter((r) => r.manufacturer === manufacturer).length;
    } else {
      // Share what is left as evenly as possible
      const left = others.length - others.indexOf(manufacturer);
      count = Math.ceil(spare / left);
      spare -= count;
    }
    for (let k = 0; k < count; k++) jobs.push([manufacturer, makes[k % makes.length]]);
  }

  const used = new Set(designed.map((r) => r.code));
  const generated = jobs.map(([manufacturer, seed], i): AssetModelRecord => {
    const type = typeInfo(seed[0])!;
    const s = (i * 7919 + 104729) >>> 0;
    // 37 and 900 share no factors, so every model gets its own number
    const number = 100 + ((i * 37) % 900);
    let code = `MOD-${manufacturerCode(manufacturer)}-${number}`;
    for (let n = 2; used.has(code); n++) code = `MOD-${manufacturerCode(manufacturer)}-${number}-${n}`;
    used.add(code);
    const inactive = i % 10 === 9 || i === 4;
    return {
      ...base(type, manufacturer, s),
      code,
      name: `${seed[7]} ${number}`,
      description: `${type.name} ${DESCRIPTIONS[type.category] ?? ''}.`.replace(' .', '.'),
      specs: specsFor(type, s),
      status: inactive ? 'Inactive' : 'Active',
      // Some models are newly added and have no assets yet
      assetCount: inactive || i % 11 === 5 ? 0 : 1 + (s % 24),
      createdOn: stamp(30 + i),
      updatedOn: stamp(30 + i + (s % 300))
    };
  });

  // Top up one model so the manufacturer's total matches the design
  for (const [manufacturer, target] of Object.entries(ASSET_TOTALS)) {
    const mine = [...designed, ...generated].filter((r) => r.manufacturer === manufacturer);
    const gap = target - mine.reduce((sum, r) => sum + r.assetCount, 0);
    const pad = generated.find((r) => r.manufacturer === manufacturer && r.status === 'Active' && r.assetCount + gap >= 0);
    if (pad) pad.assetCount += gap;
  }
  return [...designed, ...generated];
}

export function blankAssetModel(): AssetModelRecord {
  return {
    code: '',
    name: '',
    manufacturer: '',
    assetType: '',
    category: '',
    description: '',
    image: null,
    status: 'Active',
    specs: [],
    lifecycleYears: 5,
    warrantyMonths: 12,
    pmFrequency: 'Yearly',
    maintenanceStrategy: 'Preventive',
    criticality: 'Medium',
    calibrationRequired: false,
    costCenter: '',
    currency: 'AED - UAE Dirham',
    purchasePrice: null,
    includeInDepreciation: true,
    depreciationMethod: 'Straight Line',
    salvagePercent: 5,
    procurementType: 'CAPEX',
    subcategories: [],
    taggingFormat: '',
    trackingMethod: 'RFID',
    defaultCondition: 'New',
    serialRequired: true,
    assignable: false,
    assetCount: 0,
    createdOn: '',
    updatedOn: ''
  };
}
