import { Component, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus, Warehouse } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { BinList } from './bin-list/bin-list';
import { StoreList } from './store-list/store-list';
import { WarehouseList } from './warehouse-list/warehouse-list';

type LocationTab = 'warehouse' | 'store' | 'bin';

/**
 * Master Data Management > Inventory > Warehouse / Store / Bin. Each tab is its own list with
 * its own drawer; counts on one tab open the next tab filtered to that row.
 */
@Component({
  selector: 'app-mdm-inventory-warehouse-store-bin',
  imports: [RouterLink, LucideAngularModule, WarehouseList, StoreList, BinList],
  templateUrl: './warehouse-store-bin.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../inventory.css', '../../shared/styles/mdm-purple-theme.css']
})
export class WarehouseStoreBinPage {
  @ViewChild('list') list?: { addNew(): void };

  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly icons = { Warehouse, Plus };
  readonly tabs: { id: LocationTab; label: string; noun: string }[] = [
    { id: 'warehouse', label: 'Warehouse', noun: 'Warehouse' },
    { id: 'store', label: 'Store', noun: 'Store' },
    { id: 'bin', label: 'Bin', noun: 'Bin' }
  ];

  tab: LocationTab = 'warehouse';
  // Set when a count is clicked so the next tab opens filtered
  warehouseFilter = '';
  storeFilter = '';

  get noun(): string {
    return this.tabs.find((t) => t.id === this.tab)!.noun;
  }

  show(tab: LocationTab): void {
    this.warehouseFilter = '';
    this.storeFilter = '';
    this.tab = tab;
  }

  showStoresOf(warehouseCode: string): void {
    this.warehouseFilter = warehouseCode;
    this.tab = 'store';
  }

  showBinsOf(storeCode: string): void {
    this.storeFilter = storeCode;
    this.tab = 'bin';
  }
}
