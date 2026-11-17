import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiCodeStore } from '../shared/code-store';
import { MdmApi, MdmAudit } from '../shared/mdm-api';
import { BinRecord, ItemCategoryRecord, ItemRecord, RecordStatus, StockStatusRecord, StoreRecord, UomRecord, UomType, WarehouseRecord } from './inventory.model';

/*
 * Inventory masters backed by /api/master-data. Pages work with codes; on the API side links between
 * masters are { id, name } references, so each store maps Mongo ids to codes and back. A store loads the
 * masters it points at first (items -> categories -> units, items -> bins -> stores -> warehouses -> employees).
 */

/** A link to another record as the API sends it. */
interface Ref {
  id: string | null;
  name: string | null;
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** `yyyy-mm-ddThh:mm` from an API timestamp, as the pages show it. */
function stampOf(value: string | null | undefined): string {
  return (value ?? '').slice(0, 16);
}

function statusOf(value: string | null): RecordStatus {
  return value === 'Inactive' ? 'Inactive' : 'Active';
}

/** Common code-keyed behaviour of the inventory masters. */
abstract class InventoryStore<T extends { code: string; name?: string }, TDto extends MdmAudit> extends ApiCodeStore<T, TDto> {
  // Mongo id -> code, for turning references back into codes
  private readonly codes = new Map<string, string>();

  protected abstract fromDto(dto: TDto): T;

  protected toRecord(dto: TDto): T {
    const record = this.fromDto(dto);
    this.codes.set(dto.id, record.code);
    return record;
  }

  /** Code of the record with this Mongo id, or '' when it isn't loaded. */
  codeOf(id: string | null | undefined): string {
    return (id && this.codes.get(id)) || '';
  }

  /** `{ id, name }` reference for a code, or null when there is none. */
  ref(code: string | null | undefined): Ref | null {
    const id = code ? this.idOf(code) : undefined;
    return id ? { id, name: this.find(code)?.name ?? code! } : null;
  }

  /** Masters this one points at, loaded before it. */
  protected dependencies(): Observable<unknown> {
    return of(null);
  }

  /** Resolves links to other records of the same master once the whole list is known. */
  protected relink(): void {}

  override load(query: Query = {}): Observable<T[]> {
    return this.dependencies().pipe(
      switchMap(() => super.load(query)),
      map(() => {
        this.relink();
        return this.records;
      })
    );
  }

  override persist(record: T, originalCode: string | null): Observable<T> {
    return super.persist(record, originalCode).pipe(
      map((saved) => {
        this.relink();
        return this.find(saved.code) ?? saved;
      })
    );
  }

  /** PATCH /{id}/status, then keeps what the server returned. */
  setStatus(record: T, status: RecordStatus): Observable<T> {
    const id = this.idOf(record.code);
    if (!id) return throwError(() => new Error('Record not found.'));
    return this.api.setStatus<TDto>(this.resource, id, status).pipe(
      map((dto) => {
        this.save(this.toRecord(dto), record.code);
        this.relink();
        return this.find(record.code)!;
      })
    );
  }
}

interface EmployeeDto {
  id: string;
  employeeId: string;
  employeeName: string;
}

/** Employee ID <-> Mongo id, for warehouse managers and store keepers. */
@Injectable({ providedIn: 'root' })
export class InventoryEmployees {
  private readonly api = inject(MdmApi);
  private byCode = new Map<string, EmployeeDto>();
  private byId = new Map<string, string>();

  /** Never fails: without employees, managers and keepers just show empty. */
  load(): Observable<unknown> {
    return this.api.list<EmployeeDto>('employees').pipe(
      tap((list) => {
        this.byCode = new Map(list.map((e) => [e.employeeId, e]));
        this.byId = new Map(list.map((e) => [e.id, e.employeeId]));
      }),
      catchError(() => of(null))
    );
  }

  codeOf(id: string | null | undefined): string {
    return (id && this.byId.get(id)) || '';
  }

  ref(code: string | null | undefined): Ref | null {
    const employee = code ? this.byCode.get(code) : undefined;
    return employee ? { id: employee.id, name: employee.employeeName } : null;
  }
}

interface UomDto extends MdmAudit {
  uomName: string;
  code: string;
  type: string;
  symbol: string;
  conversionFactor: number | null;
  description: string | null;
  baseUom: Ref | null;
  allowDecimals: boolean;
  decimalPlaces: number;
}

@Injectable({ providedIn: 'root' })
export class UomService extends InventoryStore<UomRecord, UomDto> {
  protected readonly resource = 'uoms';
  // Unit code -> Mongo id of its base unit
  private readonly baseIds = new Map<string, string>();

  constructor() {
    super();
  }

  label(code: string): string {
    return this.find(code)?.symbol ?? code;
  }

  /** Units based on `code`. */
  derived(code: string): UomRecord[] {
    return this.records.filter((r) => r.baseUom === code);
  }

  override save(record: UomRecord, originalCode: string | null): void {
    super.save(record, originalCode);
    if (originalCode && originalCode !== record.code) {
      this.records = this.records.map((r) => (r.baseUom === originalCode ? { ...r, baseUom: record.code } : r));
    }
  }

  protected fromDto(dto: UomDto): UomRecord {
    if (dto.baseUom?.id) this.baseIds.set(dto.code, dto.baseUom.id);
    else this.baseIds.delete(dto.code);
    return {
      code: dto.code,
      name: dto.uomName,
      type: dto.type as UomType,
      symbol: dto.symbol,
      baseUom: '',
      conversionFactor: dto.conversionFactor ?? 1,
      description: dto.description ?? '',
      status: statusOf(dto.status),
      allowDecimals: dto.allowDecimals,
      decimalPlaces: dto.decimalPlaces,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected override relink(): void {
    this.records = this.records.map((r) => ({ ...r, baseUom: this.codeOf(this.baseIds.get(r.code)) }));
  }

  protected toRequest(r: UomRecord): object {
    return {
      uomName: r.name,
      code: r.code,
      type: r.type,
      symbol: r.symbol,
      conversionFactor: r.conversionFactor,
      description: r.description,
      baseUom: this.ref(r.baseUom),
      allowDecimals: r.allowDecimals,
      decimalPlaces: r.decimalPlaces,
      status: r.status
    };
  }
}

interface ItemCategoryDto extends MdmAudit {
  categoryName: string;
  code: string;
  parentCategory: Ref | null;
  description: string | null;
  defaultUom: Ref | null;
  valuationMethod: string | null;
  inspectionOnReceipt: boolean;
  allowNegativeStock: boolean;
}

@Injectable({ providedIn: 'root' })
export class ItemCategoryService extends InventoryStore<ItemCategoryRecord, ItemCategoryDto> {
  protected readonly resource = 'item-categories';
  private readonly uoms = inject(UomService);
  // Category code -> Mongo id of its parent
  private readonly parentIds = new Map<string, string>();

  constructor() {
    super();
  }

  children(code: string): ItemCategoryRecord[] {
    return this.records.filter((r) => r.parentCode === code);
  }

  /** Parents from the top down, not including `code` itself. */
  ancestry(code: string | null): ItemCategoryRecord[] {
    const chain: ItemCategoryRecord[] = [];
    for (let c = this.find(code); c && chain.length < 20; c = this.find(c.parentCode)) chain.unshift(c);
    return chain;
  }

  /** `code` and every category under it, so none can become its own parent. */
  descendantCodes(code: string): Set<string> {
    const found = new Set([code]);
    for (let added = true; added; ) {
      added = false;
      for (const r of this.records) {
        if (r.parentCode && found.has(r.parentCode) && !found.has(r.code)) {
          found.add(r.code);
          added = true;
        }
      }
    }
    return found;
  }

  override save(record: ItemCategoryRecord, originalCode: string | null): void {
    super.save(record, originalCode);
    // Sub-categories follow a code change
    if (originalCode && originalCode !== record.code) {
      this.records = this.records.map((r) => (r.parentCode === originalCode ? { ...r, parentCode: record.code } : r));
    }
  }

  protected override dependencies(): Observable<unknown> {
    return this.uoms.load();
  }

  protected fromDto(dto: ItemCategoryDto): ItemCategoryRecord {
    if (dto.parentCategory?.id) this.parentIds.set(dto.code, dto.parentCategory.id);
    else this.parentIds.delete(dto.code);
    return {
      code: dto.code,
      name: dto.categoryName,
      parentCode: null,
      description: dto.description ?? '',
      status: statusOf(dto.status),
      defaultUom: this.uoms.codeOf(dto.defaultUom?.id),
      valuationMethod: dto.valuationMethod ?? 'Weighted Average',
      inspectionOnReceipt: dto.inspectionOnReceipt,
      allowNegativeStock: dto.allowNegativeStock,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected override relink(): void {
    this.records = this.records.map((r) => ({ ...r, parentCode: this.codeOf(this.parentIds.get(r.code)) || null }));
  }

  protected toRequest(r: ItemCategoryRecord): object {
    return {
      categoryName: r.name,
      code: r.code,
      parentCategory: this.ref(r.parentCode),
      description: r.description,
      defaultUom: this.uoms.ref(r.defaultUom),
      valuationMethod: r.valuationMethod || null,
      inspectionOnReceipt: r.inspectionOnReceipt,
      allowNegativeStock: r.allowNegativeStock,
      status: r.status
    };
  }
}

interface StockStatusDto extends MdmAudit {
  statusName: string;
  code: string;
  type: string;
  color: string | null;
  description: string | null;
  usage: string | null;
  systemDefault: boolean;
  canIssue: boolean;
  canReserve: boolean;
  countsAsAvailable: boolean;
  triggersReorder: boolean;
  showInReports: boolean;
  notifyStorekeeper: boolean;
}

@Injectable({ providedIn: 'root' })
export class StockStatusService extends InventoryStore<StockStatusRecord, StockStatusDto> {
  protected readonly resource = 'stock-statuses';

  constructor() {
    super();
  }

  /** Only one status can be the system default, so saving a default clears the others (the API does the same). */
  override save(record: StockStatusRecord, originalCode: string | null): void {
    if (record.isDefault) this.records = this.records.map((r) => ({ ...r, isDefault: false }));
    super.save(record, originalCode);
  }

  protected fromDto(dto: StockStatusDto): StockStatusRecord {
    return {
      code: dto.code,
      name: dto.statusName,
      type: dto.type as StockStatusRecord['type'],
      // The API stores colours in upper case; the swatches are lower case
      color: (dto.color ?? '').toLowerCase(),
      description: dto.description ?? '',
      usage: dto.usage ?? '',
      isDefault: dto.systemDefault,
      status: statusOf(dto.status),
      canIssue: dto.canIssue,
      canReserve: dto.canReserve,
      countsAsAvailable: dto.countsAsAvailable,
      triggersReorder: dto.triggersReorder,
      showInReports: dto.showInReports,
      notifyStorekeeper: dto.notifyStorekeeper,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: StockStatusRecord): object {
    return {
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
      notifyStorekeeper: r.notifyStorekeeper,
      status: r.status
    };
  }
}

interface WarehouseDto extends MdmAudit {
  warehouseName: string;
  code: string;
  location: string | null;
  manager: Ref | null;
  description: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  areaSqm: number | null;
  operatingHours: string | null;
  allowTransfersOut: boolean;
}

@Injectable({ providedIn: 'root' })
export class WarehouseService extends InventoryStore<WarehouseRecord, WarehouseDto> {
  protected readonly resource = 'warehouses';
  private readonly employees = inject(InventoryEmployees);

  constructor() {
    super();
  }

  protected override dependencies(): Observable<unknown> {
    return this.employees.load();
  }

  protected fromDto(dto: WarehouseDto): WarehouseRecord {
    return {
      code: dto.code,
      name: dto.warehouseName,
      location: dto.location ?? '',
      managerId: this.employees.codeOf(dto.manager?.id),
      description: dto.description ?? '',
      status: statusOf(dto.status),
      address: { line1: dto.addressLine1 ?? '', city: dto.city ?? '', state: dto.state ?? '', postalCode: dto.postalCode ?? '', country: dto.country ?? '' },
      phone: dto.phone ?? '',
      email: dto.email ?? '',
      areaSqm: dto.areaSqm,
      operatingHours: dto.operatingHours ?? '',
      allowTransfersOut: dto.allowTransfersOut,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: WarehouseRecord): object {
    return {
      warehouseName: r.name,
      code: r.code,
      location: r.location,
      manager: this.employees.ref(r.managerId),
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
      allowTransfersOut: r.allowTransfersOut,
      status: r.status
    };
  }
}

interface StoreDto extends MdmAudit {
  storeName: string;
  code: string;
  warehouse: Ref | null;
  description: string | null;
  storeType: string | null;
  keeper: Ref | null;
  temperatureControlled: boolean;
  restrictedAccess: boolean;
}

@Injectable({ providedIn: 'root' })
export class StoreService extends InventoryStore<StoreRecord, StoreDto> {
  protected readonly resource = 'stores';
  private readonly warehouses = inject(WarehouseService);
  private readonly employees = inject(InventoryEmployees);

  constructor() {
    super();
  }

  ofWarehouse(code: string): StoreRecord[] {
    return this.records.filter((r) => r.warehouseCode === code);
  }

  moveWarehouse(from: string, to: string): void {
    this.records = this.records.map((r) => (r.warehouseCode === from ? { ...r, warehouseCode: to } : r));
  }

  // Loading warehouses loads the employees too
  protected override dependencies(): Observable<unknown> {
    return this.warehouses.load();
  }

  protected fromDto(dto: StoreDto): StoreRecord {
    return {
      code: dto.code,
      name: dto.storeName,
      warehouseCode: this.warehouses.codeOf(dto.warehouse?.id),
      storeType: dto.storeType ?? 'General',
      keeperId: this.employees.codeOf(dto.keeper?.id),
      description: dto.description ?? '',
      status: statusOf(dto.status),
      temperatureControlled: dto.temperatureControlled,
      restrictedAccess: dto.restrictedAccess,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: StoreRecord): object {
    return {
      storeName: r.name,
      code: r.code,
      warehouse: this.warehouses.ref(r.warehouseCode),
      description: r.description,
      storeType: r.storeType || null,
      keeper: this.employees.ref(r.keeperId),
      temperatureControlled: r.temperatureControlled,
      restrictedAccess: r.restrictedAccess,
      status: r.status
    };
  }
}

interface BinDto extends MdmAudit {
  binName: string;
  code: string;
  store: Ref | null;
  warehouse: Ref | null;
  description: string | null;
  rack: string | null;
  shelf: string | null;
  binType: string | null;
  capacity: number | null;
}

@Injectable({ providedIn: 'root' })
export class BinService extends InventoryStore<BinRecord, BinDto> {
  protected readonly resource = 'bins';
  private readonly stores = inject(StoreService);

  constructor() {
    super();
  }

  ofStore(code: string): BinRecord[] {
    return this.records.filter((r) => r.storeCode === code);
  }

  moveStore(from: string, to: string): void {
    this.records = this.records.map((r) => (r.storeCode === from ? { ...r, storeCode: to } : r));
  }

  protected override dependencies(): Observable<unknown> {
    return this.stores.load();
  }

  protected fromDto(dto: BinDto): BinRecord {
    return {
      code: dto.code,
      storeCode: this.stores.codeOf(dto.store?.id),
      rack: dto.rack ?? '',
      shelf: dto.shelf ?? '',
      binType: dto.binType ?? 'Shelf',
      capacity: dto.capacity,
      description: dto.description ?? '',
      status: statusOf(dto.status),
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  // Bins are named by their code
  protected toRequest(r: BinRecord): object {
    return {
      binName: r.code,
      code: r.code,
      store: this.stores.ref(r.storeCode),
      description: r.description,
      rack: r.rack,
      shelf: r.shelf,
      binType: r.binType || null,
      capacity: r.capacity,
      status: r.status
    };
  }
}

export type StockState = 'In Stock' | 'Low Stock' | 'Reorder' | 'Out of Stock';

interface ItemDto extends MdmAudit {
  itemName: string;
  itemCode: string;
  partNumber: string | null;
  category: Ref | null;
  uom: Ref | null;
  description: string | null;
  imageUrl: string | null;
  currentStock: number | null;
  reorderLevel: number | null;
  minStock: number | null;
  reorderQty: number | null;
  maxStock: number | null;
  warehouse: Ref | null;
  store: Ref | null;
  bin: Ref | null;
  unitCost: number | null;
  currency: string | null;
  valuationMethod: string | null;
  manufacturer: string | null;
  specification: string | null;
  shelfLifeDays: number | null;
  hazardous: boolean;
  serialized: boolean;
  batchTracked: boolean;
  purchasable: boolean;
  issuable: boolean;
  criticalSpare: boolean;
}

@Injectable({ providedIn: 'root' })
export class ItemService extends InventoryStore<ItemRecord, ItemDto> {
  protected readonly resource = 'items';
  private readonly categories = inject(ItemCategoryService);
  private readonly uoms = inject(UomService);
  private readonly warehouses = inject(WarehouseService);
  private readonly stores = inject(StoreService);
  private readonly bins = inject(BinService);

  constructor() {
    super();
  }

  /** Out of stock at 0, Reorder at or below the minimum, Low Stock at or below the reorder level. */
  stockState(item: ItemRecord): StockState {
    if (item.currentStock <= 0) return 'Out of Stock';
    if (item.currentStock <= item.minStock) return 'Reorder';
    if (item.currentStock <= item.reorderLevel) return 'Low Stock';
    return 'In Stock';
  }

  nextCode(): string {
    const max = this.records.reduce((m, r) => Math.max(m, Number(r.code.replace(/\D/g, '')) || 0), 0);
    return `ITM-${String(max + 1).padStart(4, '0')}`;
  }

  usingCategory(code: string): ItemRecord[] {
    return this.records.filter((r) => r.category === code);
  }

  usingUom(code: string): ItemRecord[] {
    return this.records.filter((r) => r.uom === code);
  }

  inWarehouse(code: string): ItemRecord[] {
    return this.records.filter((r) => r.warehouseCode === code);
  }

  inStore(code: string): ItemRecord[] {
    return this.records.filter((r) => r.storeCode === code);
  }

  inBin(code: string): ItemRecord[] {
    return this.records.filter((r) => r.binCode === code);
  }

  /** Carries a renamed category, unit, warehouse, store or bin code into the loaded items. */
  recode(field: 'category' | 'uom' | 'warehouseCode' | 'storeCode' | 'binCode', from: string, to: string): void {
    if (from === to) return;
    this.records = this.records.map((r) => (r[field] === from ? { ...r, [field]: to } : r));
  }

  /** Loads every master an item points at, so each inventory page needs only this one load. */
  protected override dependencies(): Observable<unknown> {
    return forkJoin([this.categories.load(), this.bins.load()]);
  }

  protected fromDto(dto: ItemDto): ItemRecord {
    return {
      code: dto.itemCode,
      name: dto.itemName,
      partNumber: dto.partNumber ?? '',
      category: this.categories.codeOf(dto.category?.id),
      uom: this.uoms.codeOf(dto.uom?.id),
      description: dto.description ?? '',
      image: dto.imageUrl,
      status: statusOf(dto.status),
      currentStock: dto.currentStock ?? 0,
      minStock: dto.minStock ?? 0,
      reorderLevel: dto.reorderLevel ?? 0,
      reorderQty: dto.reorderQty ?? 0,
      maxStock: dto.maxStock,
      warehouseCode: this.warehouses.codeOf(dto.warehouse?.id),
      storeCode: this.stores.codeOf(dto.store?.id),
      binCode: this.bins.codeOf(dto.bin?.id),
      unitCost: dto.unitCost,
      currency: dto.currency ?? '',
      valuationMethod: dto.valuationMethod ?? 'Weighted Average',
      manufacturer: dto.manufacturer ?? '',
      specification: dto.specification ?? '',
      shelfLifeDays: dto.shelfLifeDays,
      hazardous: dto.hazardous,
      serialized: dto.serialized,
      batchTracked: dto.batchTracked,
      purchasable: dto.purchasable,
      issuable: dto.issuable,
      criticalSpare: dto.criticalSpare,
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: ItemRecord): object {
    return {
      itemName: r.name,
      itemCode: r.code,
      partNumber: r.partNumber,
      category: this.categories.ref(r.category),
      uom: this.uoms.ref(r.uom),
      description: r.description,
      imageUrl: r.image,
      currentStock: r.currentStock,
      reorderLevel: r.reorderLevel,
      minStock: r.minStock,
      reorderQty: r.reorderQty,
      maxStock: r.maxStock,
      warehouse: this.warehouses.ref(r.warehouseCode),
      store: this.stores.ref(r.storeCode),
      bin: this.bins.ref(r.binCode),
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
      criticalSpare: r.criticalSpare,
      status: r.status
    };
  }
}
