import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Star, Truck } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { badgeInk, badgeText } from '../../asset/manufacturer/manufacturer.data';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { SUPPLIER_CATEGORIES } from './supplier.data';
import { SupplierForm } from './supplier-form/supplier-form';
import { SupplierFilters, SupplierRecord } from './supplier.model';
import { SupplierService } from './supplier.service';

type SortKey = 'name' | 'code' | 'category' | 'country' | 'rating';

/** Master Data Management > Vendor > Supplier */
@Component({
  selector: 'app-mdm-vendor-supplier',
  imports: [FormsModule, RouterLink, LucideAngularModule, SupplierForm],
  templateUrl: './supplier.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../vendor.css', '../../shared/styles/mdm-purple-theme.css']
})
export class SupplierPage extends ListPage<SupplierRecord, SupplierFilters, SortKey> {
  readonly service = inject(SupplierService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly categories = SUPPLIER_CATEGORIES;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;
  readonly icons = { Truck, Star, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', category: '', country: '', status: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load suppliers: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: SupplierRecord): string {
    return r.code;
  }

  nameOf(r: SupplierRecord): string {
    return r.name;
  }

  protected all(): SupplierRecord[] {
    return this.service.all();
  }

  protected matches(r: SupplierRecord, f: SupplierFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.category || r.category === f.category) &&
      (!f.country || r.country === f.country) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.contactPerson, r.category, r.email].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: SupplierRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: SupplierRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active', logo: null });
  }

  onSaved(event: { record: SupplierRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        this.carrySelection(event.originalCode, saved.code);
        this.notify(`${saved.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: SupplierRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
