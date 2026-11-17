import { initialBins, initialItemCategories, initialItems, initialStockStatuses, initialStores, initialUoms, initialWarehouses } from './legacy/inventory.legacy';
import { employeeRef } from './people.seed';
import { SeedRow, audit, once, refByCode } from './seed-utils';

const uoms = once(initialUoms);
const itemCategories = once(initialItemCategories);
const warehouses = once(initialWarehouses);
const stores = once(initialStores);
const bins = once(initialBins);

/** Seeds of the Inventory masters, keyed by resource path. */
export const INVENTORY_SEED: Record<string, () => SeedRow[]> = {
  uoms: () =>
    uoms().map((r) => ({
      ...audit('uoms', r.code, r),
      uomName: r.name,
      code: r.code,
      type: r.type,
      symbol: r.symbol,
      conversionFactor: r.conversionFactor,
      description: r.description,
      baseUom: refByCode('uoms', uoms(), r.baseUom),
      allowDecimals: r.allowDecimals,
      decimalPlaces: r.decimalPlaces
    })),

  'item-categories': () =>
    itemCategories().map((r) => ({
      ...audit('item-categories', r.code, r),
      categoryName: r.name,
      code: r.code,
      parentCategory: refByCode('item-categories', itemCategories(), r.parentCode),
      description: r.description,
      defaultUom: refByCode('uoms', uoms(), r.defaultUom),
      valuationMethod: r.valuationMethod || null,
      inspectionOnReceipt: r.inspectionOnReceipt,
      allowNegativeStock: r.allowNegativeStock
    })),

  'stock-statuses': () =>
    initialStockStatuses().map((r) => ({
      ...audit('stock-statuses', r.code, r),
      statusName: r.name,
      code: r.code,
      type: r.type,
      color: r.color,
      description: r.description,
      usage: r.usage,
      systemDefault: r.isDefault,
      canIssue: r.canIssue,
      canReserve: r.canReserve,
      countsAsAvailable: r.countsAsAvailable,
      triggersReorder: r.triggersReorder,
      showInReports: r.showInReports,
      notifyStorekeeper: r.notifyStorekeeper
    })),

  warehouses: () =>
    warehouses().map((r) => ({
      ...audit('warehouses', r.code, r),
      warehouseName: r.name,
      code: r.code,
      location: r.location,
      manager: employeeRef(r.managerId),
      description: r.description,
      addressLine1: r.address.line1,
      city: r.address.city,
      state: r.address.state,
      postalCode: r.address.postalCode,
      country: r.address.country,
      phone: r.phone,
      email: r.email,
      areaSqm: r.areaSqm,
      operatingHours: r.operatingHours,
      allowTransfersOut: r.allowTransfersOut
    })),

  stores: () =>
    stores().map((r) => ({
      ...audit('stores', r.code, r),
      storeName: r.name,
      code: r.code,
      warehouse: refByCode('warehouses', warehouses(), r.warehouseCode),
      description: r.description,
      storeType: r.storeType || null,
      keeper: employeeRef(r.keeperId),
      temperatureControlled: r.temperatureControlled,
      restrictedAccess: r.restrictedAccess
    })),

  bins: () =>
    bins().map((r) => {
      const store = stores().find((s) => s.code === r.storeCode);
      return {
        ...audit('bins', r.code, r),
        binName: r.code,
        code: r.code,
        store: refByCode('stores', stores(), r.storeCode),
        warehouse: refByCode('warehouses', warehouses(), store?.warehouseCode),
        description: r.description,
        rack: r.rack,
        shelf: r.shelf,
        binType: r.binType || null,
        capacity: r.capacity
      };
    }),

  items: () =>
    initialItems().map((r) => ({
      ...audit('items', r.code, r),
      itemName: r.name,
      itemCode: r.code,
      partNumber: r.partNumber,
      category: refByCode('item-categories', itemCategories(), r.category),
      uom: refByCode('uoms', uoms(), r.uom),
      description: r.description,
      imageUrl: r.image,
      currentStock: r.currentStock,
      reorderLevel: r.reorderLevel,
      minStock: r.minStock,
      reorderQty: r.reorderQty,
      maxStock: r.maxStock,
      warehouse: refByCode('warehouses', warehouses(), r.warehouseCode),
      store: refByCode('stores', stores(), r.storeCode),
      bin: refByCode('bins', bins(), r.binCode),
      unitCost: r.unitCost,
      currency: r.currency || null,
      valuationMethod: r.valuationMethod || null,
      manufacturer: r.manufacturer,
      specification: r.specification,
      shelfLifeDays: r.shelfLifeDays,
      hazardous: r.hazardous,
      serialized: r.serialized,
      batchTracked: r.batchTracked,
      purchasable: r.purchasable,
      issuable: r.issuable,
      criticalSpare: r.criticalSpare
    }))
};
