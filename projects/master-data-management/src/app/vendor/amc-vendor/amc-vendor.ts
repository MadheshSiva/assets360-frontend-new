import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Settings } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { badgeInk, badgeText } from '../../asset/manufacturer/manufacturer.data';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { formatDate } from '../vendor.data';
import { AMC_ASSET_TYPES, CONTRACT_TYPES } from './amc-vendor.data';
import { AmcVendorForm } from './amc-vendor-form/amc-vendor-form';
import { AmcVendorFilters, AmcVendorRecord } from './amc-vendor.model';
import { AmcVendorService } from './amc-vendor.service';

type SortKey = 'name' | 'code' | 'assetType' | 'contractType' | 'startDate' | 'endDate';

const DAY = 86400000;

/** Master Data Management > Vendor > AMC Vendor */
@Component({
  selector: 'app-mdm-vendor-amc-vendor',
  imports: [FormsModule, RouterLink, LucideAngularModule, AmcVendorForm],
  templateUrl: './amc-vendor.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../vendor.css', '../../shared/styles/mdm-purple-theme.css']
})
export class AmcVendorPage extends ListPage<AmcVendorRecord, AmcVendorFilters, SortKey> {
  readonly service = inject(AmcVendorService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly assetTypes = AMC_ASSET_TYPES;
  readonly contractTypes = CONTRACT_TYPES;
  readonly formatDate = formatDate;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;
  readonly icons = { Settings, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  private readonly today = new Date().toISOString().slice(0, 10);

  saving = false;

  constructor() {
    super({ search: '', assetType: '', contractType: '', status: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load AMC vendors: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: AmcVendorRecord): string {
    return r.code;
  }

  nameOf(r: AmcVendorRecord): string {
    return r.name;
  }

  protected all(): AmcVendorRecord[] {
    return this.service.all();
  }

  protected matches(r: AmcVendorRecord, f: AmcVendorFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.assetType || r.assetType === f.assetType) &&
      (!f.contractType || r.contractType === f.contractType) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.assetType, r.contractType, r.contactPerson].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: AmcVendorRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  /** 'ended', 'soon' (within the notice period) or '' for the end date flag. */
  term(r: AmcVendorRecord): 'ended' | 'soon' | '' {
    if (r.endDate < this.today) return 'ended';
    const days = (new Date(r.endDate).getTime() - new Date(this.today).getTime()) / DAY;
    return days <= r.renewalNoticeDays ? 'soon' : '';
  }

  daysLeft(r: AmcVendorRecord): number {
    return Math.round((new Date(r.endDate).getTime() - new Date(this.today).getTime()) / DAY);
  }

  duplicate(r: AmcVendorRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active', logo: null, contractNo: '' });
  }

  // Starts a new term of the same length the day after the current one ends
  renew(r: AmcVendorRecord): void {
    this.menuFor = null;
    const start = new Date(new Date(r.endDate).getTime() + DAY);
    const length = new Date(r.endDate).getTime() - new Date(r.startDate).getTime();
    const end = new Date(start.getTime() + length);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    this.service.persist({ ...r, startDate, endDate, status: 'Active' }, r.code).subscribe({
      next: () => this.notify(`${r.name} renewed to ${formatDate(endDate)}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  onSaved(event: { record: AmcVendorRecord; originalCode: string | null }): void {
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

  toggleStatus(r: AmcVendorRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
