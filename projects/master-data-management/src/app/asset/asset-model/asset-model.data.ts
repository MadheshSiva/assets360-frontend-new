import { AssetModelRecord, AssetTypeInfo, Criticality, ModelSpec, PmFrequency, TrackingMethod } from './asset-model.model';

export const PM_FREQUENCIES: PmFrequency[] = ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'None'];
export const CRITICALITIES: Criticality[] = ['Low', 'Medium', 'High', 'Critical'];
export const TRACKING_METHODS: TrackingMethod[] = ['RFID', 'BLE', 'QR Code', 'Barcode', 'GPS'];

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
