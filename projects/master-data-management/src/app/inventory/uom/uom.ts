import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Ruler, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { UOM_TYPES } from '../inventory.data';
import { RecordStatus, UomRecord, UomType } from '../inventory.model';
import { ItemService, UomService } from '../inventory.service';
import { UomForm } from './uom-form/uom-form';

type SortKey = 'name' | 'code' | 'type';
interface Filters {
  search: string;
  type: '' | UomType;
  status: '' | RecordStatus;
}

/** Master Data Management > Inventory > Unit of Measure */
@Component({
  selector: 'app-mdm-inventory-uom',
  imports: [FormsModule, RouterLink, LucideAngularModule, UomForm],
  templateUrl: './uom.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../inventory.css', '../../shared/styles/mdm-purple-theme.css']
})
export class UomPage extends ListPage<UomRecord, Filters, SortKey> {
  readonly service = inject(UomService);
  private readonly items = inject(ItemService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly types = UOM_TYPES;
  readonly icons = { Ruler, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', type: '', status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.items.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: UomRecord): string {
    return r.code;
  }

  nameOf(r: UomRecord): string {
    return r.name;
  }

  protected all(): UomRecord[] {
    return this.service.all();
  }

  protected matches(r: UomRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.symbol].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: UomRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Units used by items or as another unit's base can't be deleted
  protected override deleteBlocker(r: UomRecord): string | null {
    const items = this.items.usingUom(r.code).length;
    if (items) return `${r.name} is used by ${items} item${items === 1 ? '' : 's'}.`;
    const derived = this.service.derived(r.code);
    return derived.length ? `${derived[0].name} is based on ${r.name}. Change its base unit first.` : null;
  }

  /** "1 Box = 12 Nos" style text, or the factor alone for base units. */
  conversion(r: UomRecord): string {
    const base = this.service.find(r.baseUom);
    return base ? `${r.conversionFactor} ${base.symbol}` : String(r.conversionFactor);
  }

  onSaved(event: { record: UomRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: () => {
        this.saving = false;
        if (event.originalCode) this.items.recode('uom', event.originalCode, event.record.code);
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

  toggleStatus(r: UomRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
