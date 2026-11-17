import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ClipboardCheck, Ellipsis, LucideAngularModule, Plus } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { RecordStatus, StockStatusRecord } from '../inventory.model';
import { ItemService, StockStatusService } from '../inventory.service';
import { StockStatusForm } from './stock-status-form/stock-status-form';

type SortKey = 'name' | 'code' | 'type';
interface Filters {
  status: '' | RecordStatus;
}

/** Master Data Management > Inventory > Stock Status */
@Component({
  selector: 'app-mdm-inventory-stock-status',
  imports: [FormsModule, RouterLink, LucideAngularModule, StockStatusForm],
  templateUrl: './stock-status.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../inventory.css', '../../shared/styles/mdm-purple-theme.css']
})
export class StockStatusPage extends ListPage<StockStatusRecord, Filters, SortKey> {
  readonly service = inject(StockStatusService);
  private readonly items = inject(ItemService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly icons = { ClipboardCheck, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.service.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
    this.items.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: StockStatusRecord): string {
    return r.code;
  }

  nameOf(r: StockStatusRecord): string {
    return r.name;
  }

  protected all(): StockStatusRecord[] {
    return this.service.all();
  }

  protected matches(r: StockStatusRecord, f: Filters): boolean {
    return !f.status || r.status === f.status;
  }

  protected sortValue(r: StockStatusRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // The default status and the four statuses items are graded with stay
  protected override deleteBlocker(r: StockStatusRecord): string | null {
    if (r.isDefault) return `${r.name} is the system default. Make another status the default first.`;
    const inUse = this.items.all().filter((i) => this.items.stockState(i) === r.name).length;
    return inUse ? `${inUse} item${inUse === 1 ? ' is' : 's are'} ${r.name}. Mark it Inactive instead.` : null;
  }

  makeDefault(r: StockStatusRecord): void {
    this.menuFor = null;
    if (r.status !== 'Active') {
      this.notify(`Activate ${r.name} before making it the default.`);
      return;
    }
    this.service.persist({ ...r, isDefault: true }, r.code).subscribe({
      next: () => this.notify(`${r.name} is now the system default.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  onSaved(event: { record: StockStatusRecord; originalCode: string | null }): void {
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

  toggleStatus(r: StockStatusRecord): void {
    this.menuFor = null;
    if (r.isDefault && r.status === 'Active') {
      this.notify(`${r.name} is the system default. Make another status the default first.`);
      return;
    }
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
