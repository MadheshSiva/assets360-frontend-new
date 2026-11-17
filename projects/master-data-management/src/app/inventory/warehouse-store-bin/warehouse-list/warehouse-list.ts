import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Search } from 'lucide-angular';
import { EmployeeService } from '../../../people/employee/employee.service';
import { Observable } from 'rxjs';
import { ListPage } from '../../../shared/list-page';
import { apiErrorMessage } from '../../../shared/mdm-api';
import { RecordStatus, WarehouseRecord } from '../../inventory.model';
import { ItemService, StoreService, WarehouseService } from '../../inventory.service';
import { WarehouseForm } from '../warehouse-form/warehouse-form';

type SortKey = 'name' | 'code' | 'location' | 'stores';
interface Filters {
  search: string;
  status: '' | RecordStatus;
}

/** Warehouse tab of Warehouse / Store / Bin. */
@Component({
  selector: 'app-warehouse-list',
  imports: [FormsModule, LucideAngularModule, WarehouseForm],
  templateUrl: './warehouse-list.html',
  styleUrls: ['../../../shared/styles/mdm-page.css', '../../inventory.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class WarehouseList extends ListPage<WarehouseRecord, Filters, SortKey> {
  @Output() showStores = new EventEmitter<string>();

  readonly service = inject(WarehouseService);
  private readonly stores = inject(StoreService);
  private readonly items = inject(ItemService);
  private readonly employees = inject(EmployeeService);
  readonly icons = { Search, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.items.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: WarehouseRecord): string {
    return r.code;
  }

  nameOf(r: WarehouseRecord): string {
    return r.name;
  }

  protected all(): WarehouseRecord[] {
    return this.service.all();
  }

  protected matches(r: WarehouseRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.location, this.managerName(r)].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: WarehouseRecord, key: SortKey): string | number {
    return key === 'stores' ? this.storeCount(r) : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Warehouses with stores or stock can't be deleted
  protected override deleteBlocker(r: WarehouseRecord): string | null {
    const stores = this.storeCount(r);
    if (stores) return `${r.name} has ${stores} store${stores === 1 ? '' : 's'}. Move or delete them first.`;
    const items = this.items.inWarehouse(r.code).length;
    return items ? `${items} item${items === 1 ? ' is' : 's are'} stocked in ${r.name}.` : null;
  }

  addNew(): void {
    this.openAdd();
  }

  managerName(r: WarehouseRecord): string {
    return this.employees.find(r.managerId)?.name ?? '';
  }

  storeCount(r: WarehouseRecord): number {
    return this.stores.ofWarehouse(r.code).length;
  }

  onSaved(event: { record: WarehouseRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: () => {
        this.saving = false;
        // Stores and items follow a code change
        if (event.originalCode && event.originalCode !== event.record.code) {
          this.stores.moveWarehouse(event.originalCode, event.record.code);
          this.items.recode('warehouseCode', event.originalCode, event.record.code);
        }
        this.carrySelection(event.originalCode, event.record.code);
        this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: WarehouseRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
