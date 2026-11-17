import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, FileText, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { STANDARD_CATEGORIES, STANDARD_ORGANIZATIONS } from '../compliance.data';
import { ComplianceStatus, StandardRecord } from '../compliance.model';
import { CertificationTypeService, RegulationService, StandardService } from '../compliance.service';
import { StandardForm } from './standard-form/standard-form';

type SortKey = 'name' | 'code' | 'organization' | 'category';
interface Filters {
  search: string;
  organization: string;
  category: string;
  status: '' | ComplianceStatus;
}

/** Master Data Management > Compliance > Standard */
@Component({
  selector: 'app-mdm-compliance-standard',
  imports: [FormsModule, RouterLink, LucideAngularModule, StandardForm],
  templateUrl: './standard.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../compliance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class StandardPage extends ListPage<StandardRecord, Filters, SortKey> implements OnInit {
  readonly service = inject(StandardService);
  saving = false;
  private readonly certifications = inject(CertificationTypeService);
  private readonly regulations = inject(RegulationService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly standardCategories = STANDARD_CATEGORIES;
  readonly standardOrganizations = STANDARD_ORGANIZATIONS;
  readonly icons = { FileText, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', organization: '', category: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load standards: ${message}`));
    this.certifications.ensureLoaded();
    this.regulations.ensureLoaded();
  }

  keyOf(r: StandardRecord): string {
    return r.code;
  }

  nameOf(r: StandardRecord): string {
    return r.name;
  }

  protected all(): StandardRecord[] {
    return this.service.all();
  }

  protected matches(r: StandardRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.organization || r.organization === f.organization) &&
      (!f.category || r.category === f.category) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.organization, r.category, r.title].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: StandardRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Standards referenced by certification types or regulations can't be deleted
  protected override deleteBlocker(r: StandardRecord): string | null {
    const users = [...this.certifications.usingStandard(r.code), ...this.regulations.usingStandard(r.code)];
    return users.length ? `${r.name} is used by ${users[0].name}${users.length > 1 ? ` and ${users.length - 1} more` : ''}. Remove it there first.` : null;
  }

  duplicate(r: StandardRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: StandardRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          if (event.originalCode) {
            this.certifications.recodeStandard(event.originalCode, event.record.code);
            this.regulations.recodeStandard(event.originalCode, event.record.code);
          }
          this.carrySelection(event.originalCode, event.record.code);
          this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => this.notify(apiErrorMessage(err))
      });
  }

  toggleStatus(r: StandardRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
