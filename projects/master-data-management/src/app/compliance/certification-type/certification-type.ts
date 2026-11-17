import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, Award, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { CERT_CATEGORIES } from '../compliance.data';
import { ComplianceStatus, CertificationTypeRecord } from '../compliance.model';
import { CertificationTypeService } from '../compliance.service';
import { CertificationTypeForm } from './certification-type-form/certification-type-form';

type SortKey = 'name' | 'code' | 'category' | 'validityMonths';
interface Filters {
  search: string;
  category: string;
  status: '' | ComplianceStatus;
}

/** Master Data Management > Compliance > Certification Type */
@Component({
  selector: 'app-mdm-compliance-certification-type',
  imports: [FormsModule, RouterLink, LucideAngularModule, CertificationTypeForm],
  templateUrl: './certification-type.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../compliance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class CertificationTypePage extends ListPage<CertificationTypeRecord, Filters, SortKey> implements OnInit {
  readonly service = inject(CertificationTypeService);
  saving = false;
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly certCategories = CERT_CATEGORIES;
  readonly icons = { Award, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', category: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load certification types: ${message}`));
  }

  keyOf(r: CertificationTypeRecord): string {
    return r.code;
  }

  nameOf(r: CertificationTypeRecord): string {
    return r.name;
  }

  protected all(): CertificationTypeRecord[] {
    return this.service.all();
  }

  protected matches(r: CertificationTypeRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.category || r.category === f.category) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.category, r.issuingBody].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: CertificationTypeRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: CertificationTypeRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: CertificationTypeRecord; originalCode: string | null }): void {
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

  toggleStatus(r: CertificationTypeRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
