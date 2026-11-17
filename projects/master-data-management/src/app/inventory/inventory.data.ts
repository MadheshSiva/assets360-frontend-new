import { BinRecord, ItemCategoryRecord, ItemRecord, RecordStatus, StockStatusRecord, StockStatusType, StoreRecord, UomRecord, UomType, WarehouseRecord } from './inventory.model';

/* Option lists and blank records for the inventory masters. Items point at categories, units of measure and bins by code. */

export const VALUATION_METHODS = ['Weighted Average', 'FIFO', 'Standard Cost'];
export const UOM_TYPES: UomType[] = ['Discrete', 'Weight', 'Volume', 'Length', 'Area', 'Time', 'Energy'];
export const STOCK_STATUS_TYPES: StockStatusType[] = ['Available', 'Warning', 'Unavailable', 'Allocated', 'In Transit', 'On Hold', 'Closed'];
export const STATUS_COLORS = ['#16a34a', '#f59e0b', '#ef4444', '#2563eb', '#7c3aed', '#a3a8b8', '#111827', '#0891b2'];
export const STORE_TYPES = ['Spare Parts', 'Consumables', 'Tools', 'PPE', 'Chemicals', 'Electrical', 'General'];
export const BIN_TYPES = ['Shelf', 'Rack', 'Drawer', 'Pallet', 'Cabinet', 'Floor', 'Hazmat Cabinet'];

export function blankItemCategory(): ItemCategoryRecord {
  return { code: '', name: '', parentCode: null, description: '', status: '' as RecordStatus, defaultUom: '', valuationMethod: '', inspectionOnReceipt: false, allowNegativeStock: false, createdOn: '', updatedOn: '' };
}

export function blankUom(): UomRecord {
  return { code: '', name: '', type: '' as UomType, symbol: '', baseUom: '', conversionFactor: 1, description: '', status: '' as RecordStatus, allowDecimals: false, decimalPlaces: 0, createdOn: '', updatedOn: '' };
}

export function blankStockStatus(): StockStatusRecord {
  return {
    code: '',
    name: '',
    type: '' as StockStatusType,
    color: STATUS_COLORS[0],
    description: '',
    usage: '',
    isDefault: false,
    status: '' as RecordStatus,
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
    status: '' as RecordStatus,
    address: { line1: '', city: '', state: '', postalCode: '', country: '' },
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
  return { code: '', name: '', warehouseCode, storeType: '', keeperId: '', description: '', status: '' as RecordStatus, temperatureControlled: false, restrictedAccess: false, createdOn: '', updatedOn: '' };
}

export function blankBin(storeCode = ''): BinRecord {
  return { code: '', storeCode, rack: '', shelf: '', binType: '', capacity: null, description: '', status: '' as RecordStatus, createdOn: '', updatedOn: '' };
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
    status: '' as RecordStatus,
    currentStock: 0,
    minStock: 0,
    reorderLevel: 0,
    reorderQty: 0,
    maxStock: null,
    warehouseCode: '',
    storeCode: '',
    binCode: '',
    unitCost: null,
    currency: '',
    valuationMethod: '',
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
