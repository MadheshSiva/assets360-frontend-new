import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, ClipboardCheck, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { PERMIT_CATEGORIES } from '../compliance.data';
import { ComplianceStatus, PermitTypeRecord } from '../compliance.model';
import { PermitTypeService } from '../compliance.service';
import { PermitTypeForm } from './permit-type-form/permit-type-form';

type SortKey = 'name' | 'code' | 'category' | 'validDays';
interface Filters {
  search: string;
  category: string;
  status: '' | ComplianceStatus;
}

/** Master Data Management > Compliance > Permit Type */
@Component({
  selector: 'app-mdm-compliance-permit-type',
  imports: [FormsModule, RouterLink, LucideAngularModule, PermitTypeForm],
  templateUrl: './permit-type.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../compliance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class PermitTypePage extends ListPage<PermitTypeRecord, Filters, SortKey> implements OnInit {
  readonly service = inject(PermitTypeService);
  saving = false;
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly permitCategories = PERMIT_CATEGORIES;
  readonly icons = { ClipboardCheck, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', category: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load permit types: ${message}`));
  }

  keyOf(r: PermitTypeRecord): string {
    return r.code;
  }

  nameOf(r: PermitTypeRecord): string {
    return r.name;
  }

  protected all(): PermitTypeRecord[] {
    return this.service.all();
  }

  protected matches(r: PermitTypeRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.category || r.category === f.category) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.category, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: PermitTypeRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: PermitTypeRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: PermitTypeRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.carrySelection(event.originalCode, event.record.code);
          this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => this.notify(apiErrorMessage(err))
      });
  }

  toggleStatus(r: PermitTypeRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
