import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, Landmark, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { REGULATION_CATEGORIES, REGULATION_COUNTRIES } from '../compliance.data';
import { ComplianceStatus, RegulationRecord } from '../compliance.model';
import { RegulationService } from '../compliance.service';
import { RegulationForm } from './regulation-form/regulation-form';

type SortKey = 'name' | 'code' | 'country' | 'category';
interface Filters {
  search: string;
  country: string;
  category: string;
  status: '' | ComplianceStatus;
}

/** Master Data Management > Compliance > Regulation */
@Component({
  selector: 'app-mdm-compliance-regulation',
  imports: [FormsModule, RouterLink, LucideAngularModule, RegulationForm],
  templateUrl: './regulation.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../compliance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class RegulationPage extends ListPage<RegulationRecord, Filters, SortKey> implements OnInit {
  readonly service = inject(RegulationService);
  saving = false;
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly regulationCategories = REGULATION_CATEGORIES;
  readonly regulationCountries = REGULATION_COUNTRIES;
  readonly icons = { Landmark, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', country: '', category: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load regulations: ${message}`));
  }

  keyOf(r: RegulationRecord): string {
    return r.code;
  }

  nameOf(r: RegulationRecord): string {
    return r.name;
  }

  protected all(): RegulationRecord[] {
    return this.service.all();
  }

  protected matches(r: RegulationRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.country || r.country === f.country) &&
      (!f.category || r.category === f.category) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.country, r.category, r.issuingAuthority].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: RegulationRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: RegulationRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: RegulationRecord; originalCode: string | null }): void {
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

  toggleStatus(r: RegulationRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
