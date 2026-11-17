import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Package, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { blankItem } from '../inventory.data';
import { ItemRecord } from '../inventory.model';
import { ItemCategoryService, ItemService, UomService } from '../inventory.service';
import { ItemForm } from './item-form/item-form';

type SortKey = 'name' | 'code' | 'category' | 'stock';
// "Active" is an active item with enough stock; the rest are stock warnings or Inactive
type RowStatus = 'Active' | 'Low Stock' | 'Reorder' | 'Out of Stock' | 'Inactive';
interface Filters {
  search: string;
  category: string;
  status: '' | RowStatus;
}

/** Master Data Management > Inventory > Item */
@Component({
  selector: 'app-mdm-inventory-item',
  imports: [FormsModule, RouterLink, DecimalPipe, LucideAngularModule, ItemForm],
  templateUrl: './item.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../inventory.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ItemPage extends ListPage<ItemRecord, Filters, SortKey> {
  readonly service = inject(ItemService);
  readonly categories = inject(ItemCategoryService);
  private readonly uoms = inject(UomService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses: RowStatus[] = ['Active', 'Low Stock', 'Reorder', 'Out of Stock', 'Inactive'];
  readonly icons = { Package, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', category: '', status: '' });
    this.refresh();
    this.sortKey = 'name';
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.service.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: ItemRecord): string {
    return r.code;
  }

  nameOf(r: ItemRecord): string {
    return r.name;
  }

  protected all(): ItemRecord[] {
    return this.service.all();
  }

  protected matches(r: ItemRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.category || r.category === f.category) &&
      (!f.status || this.rowStatus(r) === f.status) &&
      (!term || [r.name, r.code, r.partNumber, this.categoryName(r)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: ItemRecord, key: SortKey): string | number {
    return key === 'stock' ? r.currentStock : key === 'category' ? this.categoryName(r) : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Items still holding stock can't be deleted
  protected override deleteBlocker(r: ItemRecord): string | null {
    return r.currentStock > 0 ? `${r.name} still has ${r.currentStock} ${this.uomLabel(r)} in stock. Issue or adjust it to 0 first.` : null;
  }

  rowStatus(r: ItemRecord): RowStatus {
    if (r.status === 'Inactive') return 'Inactive';
    const state = this.service.stockState(r);
    return state === 'In Stock' ? 'Active' : state;
  }

  categoryName(r: ItemRecord): string {
    return this.categories.find(r.category)?.name ?? r.category;
  }

  uomLabel(r: ItemRecord): string {
    return this.uoms.label(r.uom);
  }

  // New items get the next free item code
  addNew(): void {
    this.openAdd({ ...blankItem(), code: this.service.nextCode() });
  }

  duplicate(r: ItemRecord): void {
    this.openAdd({ ...structuredClone(r), code: this.service.nextCode(), name: `${r.name} (Copy)`, partNumber: '', currentStock: 0, status: 'Active' });
  }

  onSaved(event: { record: ItemRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: () => {
        this.saving = false;
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

  toggleStatus(r: ItemRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
