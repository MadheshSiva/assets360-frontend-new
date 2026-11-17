import {
  BinRecord,
  ItemCategoryRecord,
  ItemRecord,
  StockStatusRecord,
  StockStatusType,
  StoreRecord,
  UomRecord,
  UomType,
  WarehouseRecord
} from '../../../inventory/inventory.model';

/*
 * DEMO MODE: inventory masters from the approved designs until the API is wired up.
 * Items point at categories, units of measure and bins by code.
 */

export const VALUATION_METHODS = ['Weighted Average', 'FIFO', 'Standard Cost'];
export const UOM_TYPES: UomType[] = ['Discrete', 'Weight', 'Volume', 'Length', 'Area', 'Time', 'Energy'];
export const STOCK_STATUS_TYPES: StockStatusType[] = ['Available', 'Warning', 'Unavailable', 'Allocated', 'In Transit', 'On Hold', 'Closed'];
export const STATUS_COLORS = ['#16a34a', '#f59e0b', '#ef4444', '#2563eb', '#7c3aed', '#a3a8b8', '#111827', '#0891b2'];
export const STORE_TYPES = ['Spare Parts', 'Consumables', 'Tools', 'PPE', 'Chemicals', 'Electrical', 'General'];
export const BIN_TYPES = ['Shelf', 'Rack', 'Drawer', 'Pallet', 'Cabinet', 'Floor', 'Hazmat Cabinet'];

const stamp = (day: number) => new Date(Date.UTC(2024, 0, 8) + day * 86400000).toISOString().slice(0, 16);

// [code, name, parent, description, default UOM]
const CATEGORIES: [string, string, string | null, string, string][] = [
  ['CAT-001', 'Electrical', null, 'Electrical items and spares', 'NOS'],
  ['CAT-002', 'Mechanical', null, 'Mechanical parts and components', 'NOS'],
  ['CAT-003', 'Instrumentation', null, 'Instruments and controllers', 'NOS'],
  ['CAT-004', 'HVAC', null, 'HVAC spares and consumables', 'NOS'],
  ['CAT-005', 'Plumbing', null, 'Plumbing materials and fittings', 'NOS'],
  ['CAT-006', 'Safety & PPE', null, 'Safety equipment and PPE', 'NOS'],
  ['CAT-007', 'Lubricants', null, 'Oils, grease and lubricants', 'LTR'],
  ['CAT-008', 'Filters', 'CAT-002', 'Filters and filter elements', 'NOS'],
  ['CAT-009', 'Consumables', null, 'General consumables', 'NOS']
];

export function initialItemCategories(): ItemCategoryRecord[] {
  return CATEGORIES.map(([code, name, parentCode, description, defaultUom], i) => ({
    code,
    name,
    parentCode,
    description,
    status: 'Active',
    defaultUom,
    valuationMethod: 'Weighted Average',
    inspectionOnReceipt: ['Instrumentation', 'Safety & PPE', 'Electrical'].includes(name),
    allowNegativeStock: false,
    createdOn: stamp(i),
    updatedOn: stamp(300 + i * 7)
  }));
}

// [code, name, type, symbol, description, decimals]
const UOMS: [string, string, UomType, string, string, boolean][] = [
  ['NOS', 'Number', 'Discrete', 'Nos', 'Individual count', false],
  ['KG', 'Kilogram', 'Weight', 'kg', 'Weight unit', true],
  ['LTR', 'Litre', 'Volume', 'L', 'Volume unit', true],
  ['MTR', 'Metre', 'Length', 'm', 'Length unit', true],
  ['SQM', 'Square Metre', 'Area', 'm²', 'Area unit', true],
  ['CBM', 'Cubic Metre', 'Volume', 'm³', 'Volume unit', true],
  ['BOX', 'Box', 'Discrete', 'Box', 'Box quantity', false],
  ['PK', 'Pack', 'Discrete', 'Pack', 'Pack quantity', false]
];

export function initialUoms(): UomRecord[] {
  return UOMS.map(([code, name, type, symbol, description, allowDecimals], i) => ({
    code,
    name,
    type,
    symbol,
    baseUom: '',
    conversionFactor: 1,
    description,
    status: 'Active',
    allowDecimals,
    decimalPlaces: allowDecimals ? 2 : 0,
    createdOn: stamp(i + 20),
    updatedOn: stamp(320 + i * 5)
  }));
}

// [code, name, type, colour, description, usage, default, issue, reserve, available, reorder]
const STATUSES: [string, string, StockStatusType, string, string, string, boolean, boolean, boolean, boolean, boolean][] = [
  ['STK-01', 'In Stock', 'Available', '#16a34a', 'Item available for issue', 'Normal stock', true, true, true, true, false],
  ['STK-02', 'Low Stock', 'Warning', '#f59e0b', 'Stock below reorder level', 'Trigger reorder', false, true, true, true, true],
  ['STK-03', 'Reorder', 'Warning', '#ef4444', 'Stock at or below minimum level', 'Procurement required', false, true, true, true, true],
  ['STK-04', 'Out of Stock', 'Unavailable', '#2563eb', 'No stock available', 'Cannot issue', false, false, false, false, true],
  ['STK-05', 'Reserved', 'Allocated', '#1d4ed8', 'Stock reserved for work order', 'Reserved quantity', false, false, false, false, false],
  ['STK-06', 'In Transit', 'In Transit', '#7c3aed', 'Stock in transit', 'Incoming shipment', false, false, true, false, false],
  ['STK-07', 'Quarantine', 'On Hold', '#a3a8b8', 'Stock under inspection', 'Quality hold', false, false, false, false, false],
  ['STK-08', 'Disposed', 'Closed', '#111827', 'Stock disposed or scrapped', 'No longer usable', false, false, false, false, false]
];

export function initialStockStatuses(): StockStatusRecord[] {
  return STATUSES.map(([code, name, type, color, description, usage, isDefault, canIssue, canReserve, countsAsAvailable, triggersReorder], i) => ({
    code,
    name,
    type,
    color,
    description,
    usage,
    isDefault,
    status: 'Active',
    canIssue,
    canReserve,
    countsAsAvailable,
    triggersReorder,
    showInReports: true,
    notifyStorekeeper: triggersReorder || type === 'On Hold',
    createdOn: stamp(i + 40),
    updatedOn: stamp(340 + i * 4)
  }));
}

// [code, name, location, manager, city, emirate]
const WAREHOUSES: [string, string, string, string, string, string][] = [
  ['WH-001', 'Main Warehouse', 'Dubai - HQ', 'EMP005', 'Dubai', 'Dubai'],
  ['WH-002', 'Spare Parts Warehouse', 'Jebel Ali', 'EMP001', 'Dubai', 'Dubai'],
  ['WH-003', 'Maintenance Warehouse', 'Abu Dhabi', 'EMP004', 'Abu Dhabi', 'Abu Dhabi'],
  ['WH-004', 'Project Site Warehouse', 'Sharjah', 'EMP007', 'Sharjah', 'Sharjah']
];

export function initialWarehouses(): WarehouseRecord[] {
  return WAREHOUSES.map(([code, name, location, managerId, city, state], i) => ({
    code,
    name,
    location,
    managerId,
    description: `${name} at ${location}.`,
    status: 'Active',
    address: { line1: `Plot ${100 + i * 17}, Industrial Area`, city, state, postalCode: '', country: 'UAE' },
    phone: `+971 4 ${300 + i * 11} ${4000 + i * 123}`,
    email: `${name.toLowerCase().split(' ')[0]}.wh@dcs.ae`,
    areaSqm: [12000, 6500, 4200, 1800][i],
    operatingHours: '07:00 - 19:00',
    allowTransfersOut: true,
    createdOn: stamp(i + 60),
    updatedOn: stamp(360 + i * 9)
  }));
}

// [code, name, warehouse, type, keeper, bins]
const STORES: [string, string, string, string, string, number][] = [
  ['ST-001', 'Electrical Store', 'WH-001', 'Electrical', 'EMP011', 4],
  ['ST-002', 'Mechanical Store', 'WH-001', 'Spare Parts', 'EMP012', 5],
  ['ST-003', 'Consumables Store', 'WH-001', 'Consumables', 'EMP013', 3],
  ['ST-004', 'PPE Store', 'WH-001', 'PPE', 'EMP014', 3],
  ['ST-005', 'Chemical Store', 'WH-001', 'Chemicals', 'EMP015', 2],
  ['ST-006', 'Rotating Spares Store', 'WH-002', 'Spare Parts', 'EMP016', 5],
  ['ST-007', 'Critical Spares Store', 'WH-002', 'Spare Parts', 'EMP017', 4],
  ['ST-008', 'Filters Store', 'WH-002', 'Consumables', 'EMP018', 3],
  ['ST-009', 'Tools Crib', 'WH-003', 'Tools', 'EMP019', 3],
  ['ST-010', 'Plumbing Store', 'WH-003', 'Spare Parts', 'EMP020', 3],
  ['ST-011', 'HVAC Store', 'WH-003', 'Spare Parts', 'EMP021', 4],
  ['ST-012', 'Lubricants Store', 'WH-003', 'Chemicals', 'EMP022', 2],
  ['ST-013', 'Site Store A', 'WH-004', 'General', 'EMP023', 2],
  ['ST-014', 'Site Store B', 'WH-004', 'General', 'EMP024', 2]
];

export function initialStores(): StoreRecord[] {
  return STORES.map(([code, name, warehouseCode, storeType, keeperId], i) => ({
    code,
    name,
    warehouseCode,
    storeType,
    keeperId,
    description: '',
    status: 'Active',
    temperatureControlled: storeType === 'Chemicals',
    restrictedAccess: name.startsWith('Critical') || storeType === 'Chemicals',
    createdOn: stamp(i + 80),
    updatedOn: stamp(380 + i * 3)
  }));
}

/** Bins are coded <store number>-<rack><shelf>, e.g. 01-A1 is rack A shelf 1 in ST-001. */
export function initialBins(): BinRecord[] {
  const bins: BinRecord[] = [];
  STORES.forEach(([storeCode, , , storeType, , count], s) => {
    for (let b = 0; b < count; b++) {
      const rack = String.fromCharCode(65 + Math.floor(b / 2));
      const shelf = String((b % 2) + 1);
      bins.push({
        code: `${storeCode.slice(3)}-${rack}${shelf}`,
        storeCode,
        rack,
        shelf,
        binType: storeType === 'Chemicals' ? 'Hazmat Cabinet' : storeType === 'Tools' ? 'Cabinet' : b % 3 === 2 ? 'Pallet' : 'Shelf',
        capacity: [200, 500, 100, 1000][(s + b) % 4],
        description: '',
        status: 'Active',
        createdOn: stamp(s * 3 + b + 100),
        updatedOn: stamp(400 + s * 3 + b)
      });
    }
  });
  return bins;
}

// [code, name, part number, category, uom, stock, min, reorder, unit cost, bin]
const ITEMS: [string, string, string, string, string, number, number, number, number, string][] = [
  ['ITM-0001', 'Ball Bearing 6205', '6205-2RS', 'CAT-002', 'NOS', 150, 20, 40, 18, '002-A1'],
  ['ITM-0002', 'Air Filter Element', 'AF-001', 'CAT-008', 'NOS', 40, 10, 20, 65, '008-A1'],
  ['ITM-0003', 'Hydraulic Oil 46', 'HO-46', 'CAT-007', 'LTR', 200, 40, 80, 9.5, '012-A1'],
  ['ITM-0004', 'LED Tube 18W', 'LED-18W', 'CAT-001', 'NOS', 75, 15, 30, 22, '001-A1'],
  ['ITM-0005', 'Safety Helmet', 'SH-01', 'CAT-006', 'NOS', 300, 50, 100, 35, '004-A1'],
  ['ITM-0006', 'Gate Valve 2"', 'GV-2', 'CAT-005', 'NOS', 12, 5, 15, 140, '010-A1'],
  ['ITM-0007', 'Cleaning Chemical', 'CLN-001', 'CAT-009', 'LTR', 8, 10, 25, 14, '005-A1'],
  ['ITM-0008', 'UPS Battery 12V', 'UB-12V', 'CAT-001', 'NOS', 0, 4, 10, 120, '001-A2']
];

export function initialItems(): ItemRecord[] {
  const bins = initialBins();
  const stores = initialStores();
  return ITEMS.map(([code, name, partNumber, category, uom, currentStock, minStock, reorderLevel, unitCost, binCode], i) => {
    const storeCode = bins.find((b) => b.code === binCode)?.storeCode ?? '';
    return {
      code,
      name,
      partNumber,
      category,
      uom,
      description: '',
      image: null,
      status: 'Active',
      currentStock,
      minStock,
      reorderLevel,
      reorderQty: reorderLevel * 2,
      maxStock: reorderLevel * 6,
      warehouseCode: stores.find((s) => s.code === storeCode)?.warehouseCode ?? '',
      storeCode,
      binCode,
      unitCost,
      currency: 'AED - UAE Dirham',
      valuationMethod: 'Weighted Average',
      manufacturer: ['SKF', 'Donaldson', 'Shell', 'Philips', '3M', 'Kitz', 'Diversey', 'Yuasa'][i],
      specification: '',
      shelfLifeDays: uom === 'LTR' ? 730 : null,
      hazardous: code === 'ITM-0007',
      serialized: false,
      batchTracked: uom === 'LTR',
      purchasable: true,
      issuable: true,
      criticalSpare: code === 'ITM-0008' || code === 'ITM-0006',
      createdOn: stamp(i + 120),
      updatedOn: stamp(420 + i * 6)
    };
  });
}

export function blankItemCategory(): ItemCategoryRecord {
  return { code: '', name: '', parentCode: null, description: '', status: 'Active', defaultUom: 'NOS', valuationMethod: 'Weighted Average', inspectionOnReceipt: false, allowNegativeStock: false, createdOn: '', updatedOn: '' };
}

export function blankUom(): UomRecord {
  return { code: '', name: '', type: 'Discrete', symbol: '', baseUom: '', conversionFactor: 1, description: '', status: 'Active', allowDecimals: false, decimalPlaces: 0, createdOn: '', updatedOn: '' };
}

export function blankStockStatus(): StockStatusRecord {
  return {
    code: '',
    name: '',
    type: 'Available',
    color: STATUS_COLORS[0],
    description: '',
    usage: '',
    isDefault: false,
    status: 'Active',
    canIssue: true,
    canReserve: true,
    countsAsAvailable: true,
    triggersReorder: false,
    showInReports: true,
    notifyStorekeeper: false,
    createdOn: '',
    updatedOn: ''
  };
}

export function blankWarehouse(): WarehouseRecord {
  return {
    code: '',
    name: '',
    location: '',
    managerId: '',
    description: '',
    status: 'Active',
    address: { line1: '', city: '', state: '', postalCode: '', country: 'UAE' },
    phone: '',
    email: '',
    areaSqm: null,
    operatingHours: '',
    allowTransfersOut: true,
    createdOn: '',
    updatedOn: ''
  };
}

export function blankStore(warehouseCode = ''): StoreRecord {
  return { code: '', name: '', warehouseCode, storeType: 'General', keeperId: '', description: '', status: 'Active', temperatureControlled: false, restrictedAccess: false, createdOn: '', updatedOn: '' };
}

export function blankBin(storeCode = ''): BinRecord {
  return { code: '', storeCode, rack: '', shelf: '', binType: 'Shelf', capacity: null, description: '', status: 'Active', createdOn: '', updatedOn: '' };
}

export function blankItem(): ItemRecord {
  return {
    code: '',
    name: '',
    partNumber: '',
    category: '',
    uom: '',
    description: '',
    image: null,
    status: 'Active',
    currentStock: 0,
    minStock: 0,
    reorderLevel: 0,
    reorderQty: 0,
    maxStock: null,
    warehouseCode: '',
    storeCode: '',
    binCode: '',
    unitCost: null,
    currency: 'AED - UAE Dirham',
    valuationMethod: 'Weighted Average',
    manufacturer: '',
    specification: '',
    shelfLifeDays: null,
    hazardous: false,
    serialized: false,
    batchTracked: false,
    purchasable: true,
    issuable: true,
    criticalSpare: false,
    createdOn: '',
    updatedOn: ''
  };
}
