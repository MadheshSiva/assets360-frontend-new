import { CategoryRecord } from './category.model';

export const CATEGORY_ASSET_TYPES = ['Fixed Asset', 'Movable Asset', 'Fleet Asset', 'Facility Asset', 'Consumable', 'Intangible Asset', 'Leased Asset'];

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
