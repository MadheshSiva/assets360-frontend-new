import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, LucideAngularModule, X } from 'lucide-angular';
import { ManufacturerService } from '../../../asset/manufacturer/manufacturer.service';
import { MasterForm } from '../../../maintenance/form-base';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { readPhoto } from '../../../people/people.data';
import { VALUATION_METHODS, blankItem } from '../../inventory.data';
import { ItemRecord } from '../../inventory.model';
import { BinService, ItemCategoryService, ItemService, StoreService, UomService, WarehouseService } from '../../inventory.service';

type Tab = 'basic' | 'inventory' | 'financial' | 'additional' | 'settings';

const TAB_OF: Record<string, Tab> = {
  category: 'basic',
  uom: 'basic',
  status: 'basic',
  image: 'basic',
  partNumber: 'basic',
  currentStock: 'inventory',
  minStock: 'inventory',
  reorderLevel: 'inventory',
  reorderQty: 'inventory',
  maxStock: 'inventory',
  location: 'inventory',
  unitCost: 'financial',
  shelfLifeDays: 'additional'
};

/** Right-hand "Add / Edit Item" panel. */
@Component({
  selector: 'app-item-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './item-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ItemForm extends MasterForm<ItemRecord, Tab> {
  protected readonly store = inject(ItemService);
  readonly categories = inject(ItemCategoryService);
  readonly uoms = inject(UomService);
  readonly warehouses = inject(WarehouseService);
  readonly stores = inject(StoreService);
  readonly bins = inject(BinService);
  readonly manufacturers = inject(ManufacturerService);
  readonly icons = { X, Camera };
  readonly currencies = CURRENCIES;
  readonly valuationMethods = VALUATION_METHODS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'financial', label: 'Financial' },
    { id: 'additional', label: 'Additional' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): ItemRecord {
    return { ...blankItem(), code: this.store.nextCode() };
  }

  get categoryOptions() {
    return this.categories.all().filter((c) => c.status === 'Active' || c.code === this.form.category);
  }

  get uomOptions() {
    return this.uoms.all().filter((u) => u.status === 'Active' || u.code === this.form.uom);
  }

  get storeOptions() {
    return this.stores.all().filter((s) => s.warehouseCode === this.form.warehouseCode && (s.status === 'Active' || s.code === this.form.storeCode));
  }

  get binOptions() {
    return this.bins.all().filter((b) => b.storeCode === this.form.storeCode && (b.status === 'Active' || b.code === this.form.binCode));
  }

  get stockState(): string {
    return this.store.stockState(this.form);
  }

  get stockValue(): number | null {
    return this.form.unitCost === null ? null : Math.round(this.form.unitCost * this.form.currentStock * 100) / 100;
  }

  // A new item picks up its category's default unit and valuation method
  onCategoryChange(): void {
    const c = this.categories.find(this.form.category);
    if (!c || this.isEdit) return;
    if (!this.form.uom) this.form.uom = c.defaultUom;
    this.form.valuationMethod = c.valuationMethod;
  }

  // Store and bin are cleared when they no longer belong to the chosen warehouse / store
  onWarehouseChange(): void {
    if (!this.storeOptions.some((s) => s.code === this.form.storeCode)) this.form.storeCode = '';
    this.onStoreChange();
  }

  onStoreChange(): void {
    if (!this.binOptions.some((b) => b.code === this.form.binCode)) this.form.binCode = '';
  }

  onImagePicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.form.image = url;
        delete this.errors['image'];
      },
      (message) => (this.errors = { ...this.errors, image: message })
    );
  }

  protected validate(f: ItemRecord) {
    const errors: Record<string, string> = {};
    const whole = (n: number) => Number.isFinite(n) && n >= 0;
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.uom) errors['uom'] = 'Select a unit of measure.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (f.partNumber.trim() && this.store.all().some((i) => i.partNumber.toLowerCase() === f.partNumber.trim().toLowerCase() && i.code !== this.original?.code)) {
      errors['partNumber'] = 'Another item has this part number.';
    }
    if (!whole(f.currentStock)) errors['currentStock'] = 'Enter 0 or more.';
    if (!whole(f.minStock)) errors['minStock'] = 'Enter 0 or more.';
    if (!whole(f.reorderLevel)) errors['reorderLevel'] = 'Enter 0 or more.';
    else if (f.reorderLevel < f.minStock) errors['reorderLevel'] = 'The reorder level can’t be below the minimum stock.';
    if (!whole(f.reorderQty)) errors['reorderQty'] = 'Enter 0 or more.';
    if (f.maxStock !== null && !(f.maxStock >= f.reorderLevel)) errors['maxStock'] = 'Maximum stock must be at least the reorder level.';
    if (f.currentStock > 0 && !f.binCode) errors['location'] = 'Choose where the stock is kept.';
    const uom = this.uoms.find(f.uom);
    if (uom && !uom.allowDecimals && [f.currentStock, f.minStock, f.reorderLevel, f.reorderQty].some((n) => !Number.isInteger(n))) {
      errors['currentStock'] = `${uom.name} quantities must be whole numbers.`;
    }
    if (f.unitCost !== null && !(f.unitCost >= 0)) errors['unitCost'] = 'Enter 0 or more.';
    if (f.shelfLifeDays !== null && !(Number.isInteger(f.shelfLifeDays) && f.shelfLifeDays > 0)) errors['shelfLifeDays'] = 'Enter a whole number of days.';
    const first = Object.keys(errors).map((k) => TAB_OF[k]).find(Boolean);
    return { errors, tab: first ?? 'basic' };
  }

  protected override tidy(f: ItemRecord): ItemRecord {
    return { ...f, partNumber: f.partNumber.trim().toUpperCase(), description: f.description.trim(), manufacturer: f.manufacturer.trim(), specification: f.specification.trim() };
  }
}
