import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Search } from 'lucide-angular';
import { EmployeeService } from '../../../people/employee/employee.service';
import { Observable } from 'rxjs';
import { ListPage } from '../../../shared/list-page';
import { apiErrorMessage } from '../../../shared/mdm-api';
import { blankStore } from '../../inventory.data';
import { RecordStatus, StoreRecord } from '../../inventory.model';
import { BinService, ItemService, StoreService, WarehouseService } from '../../inventory.service';
import { StoreForm } from '../store-form/store-form';

type SortKey = 'name' | 'code' | 'warehouse' | 'bins';
interface Filters {
  search: string;
  warehouse: string;
  status: '' | RecordStatus;
}

/** Store tab of Warehouse / Store / Bin. */
@Component({
  selector: 'app-store-list',
  imports: [FormsModule, LucideAngularModule, StoreForm],
  templateUrl: './store-list.html',
  styleUrls: ['../../../shared/styles/mdm-page.css', '../../inventory.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class StoreList extends ListPage<StoreRecord, Filters, SortKey> implements OnInit {
  // Opens the tab filtered to one warehouse (from its store count)
  @Input() warehouseFilter = '';
  @Output() showBins = new EventEmitter<string>();

  readonly service = inject(StoreService);
  readonly warehouses = inject(WarehouseService);
  private readonly bins = inject(BinService);
  private readonly items = inject(ItemService);
  private readonly employees = inject(EmployeeService);
  readonly icons = { Search, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', warehouse: '', status: '' });
    this.refresh();
  }

  ngOnInit(): void {
    if (this.warehouseFilter) {
      this.draft.warehouse = this.warehouseFilter;
      this.apply();
    }
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.items.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: StoreRecord): string {
    return r.code;
  }

  nameOf(r: StoreRecord): string {
    return r.name;
  }

  protected all(): StoreRecord[] {
    return this.service.all();
  }

  protected matches(r: StoreRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.warehouse || r.warehouseCode === f.warehouse) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.storeType, this.keeperName(r)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: StoreRecord, key: SortKey): string | number {
    return key === 'bins' ? this.binCount(r) : key === 'warehouse' ? this.warehouseName(r) : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Stores with bins or stock can't be deleted
  protected override deleteBlocker(r: StoreRecord): string | null {
    const bins = this.binCount(r);
    if (bins) return `${r.name} has ${bins} bin${bins === 1 ? '' : 's'}. Move or delete them first.`;
    const items = this.items.inStore(r.code).length;
    return items ? `${items} item${items === 1 ? ' is' : 's are'} stocked in ${r.name}.` : null;
  }

  // New stores go into the warehouse the list is filtered to
  addNew(): void {
    this.openAdd(blankStore(this.applied.warehouse));
  }

  warehouseName(r: StoreRecord): string {
    return this.warehouses.find(r.warehouseCode)?.name ?? r.warehouseCode;
  }

  keeperName(r: StoreRecord): string {
    return this.employees.find(r.keeperId)?.name ?? '';
  }

  binCount(r: StoreRecord): number {
    return this.bins.ofStore(r.code).length;
  }

  onSaved(event: { record: StoreRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: () => {
        this.saving = false;
        if (event.originalCode && event.originalCode !== event.record.code) {
          this.bins.moveStore(event.originalCode, event.record.code);
          this.items.recode('storeCode', event.originalCode, event.record.code);
        }
        // Items in the store follow it to another warehouse (the API moves them too)
        for (const item of this.items.inStore(event.record.code)) {
          if (item.warehouseCode !== event.record.warehouseCode) this.items.save({ ...item, warehouseCode: event.record.warehouseCode }, item.code);
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

  toggleStatus(r: StoreRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
