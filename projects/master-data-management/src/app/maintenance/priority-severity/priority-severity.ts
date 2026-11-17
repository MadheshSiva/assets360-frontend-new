import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, ShieldAlert, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { WorkTypeService } from '../work-type/work-type.service';
import { PriorityForm } from './priority-form/priority-form';
import { PriorityFilters, PriorityRecord } from './priority-severity.model';
import { PriorityService } from './priority-severity.service';

type SortKey = 'name' | 'code' | 'kind';

/** Master Data Management > Maintenance > Priority / Severity */
@Component({
  selector: 'app-mdm-maintenance-priority-severity',
  imports: [FormsModule, RouterLink, LucideAngularModule, PriorityForm],
  templateUrl: './priority-severity.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../people/people.css', '../maintenance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class PrioritySeverityPage extends ListPage<PriorityRecord, PriorityFilters, SortKey> implements OnInit {
  readonly service = inject(PriorityService);
  saving = false;
  private readonly workTypes = inject(WorkTypeService);
  readonly kinds = ['Priority', 'Severity'];
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses = ['Active', 'Inactive'];
  readonly icons = { ShieldAlert, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', kind: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load priorities and severities: ${message}`));
    this.workTypes.ensureLoaded();
  }

  keyOf(r: PriorityRecord): string {
    return r.code;
  }

  nameOf(r: PriorityRecord): string {
    return r.name;
  }

  protected all(): PriorityRecord[] {
    return this.service.all();
  }

  protected matches(r: PriorityRecord, f: PriorityFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.kind || r.kind === f.kind) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: PriorityRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Priorities set as a work type default can't be deleted
  protected override deleteBlocker(r: PriorityRecord): string | null {
    const count = r.kind === 'Priority' ? this.workTypes.usesPriority(r.name) : 0;
    return count ? `${r.name} is the default priority of ${count} work type${count === 1 ? '' : 's'}. Change them first.` : null;
  }

  duplicate(r: PriorityRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: PriorityRecord; originalCode: string | null; originalName: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          if (event.originalName && event.record.kind === 'Priority') this.workTypes.renamePriority(event.originalName, event.record.name);
          this.carrySelection(event.originalCode, event.record.code);
          this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => this.notify(apiErrorMessage(err))
      });
  }

  toggleStatus(r: PriorityRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
