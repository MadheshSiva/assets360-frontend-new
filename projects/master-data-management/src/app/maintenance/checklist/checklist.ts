import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, ClipboardList, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { CHECKLIST_TYPES } from './checklist.data';
import { WorkTypeService } from '../work-type/work-type.service';
import { ChecklistForm } from './checklist-form/checklist-form';
import { ChecklistFilters, ChecklistRecord } from './checklist.model';
import { ChecklistService } from './checklist.service';

type SortKey = 'name' | 'code' | 'category' | 'items';

/** Master Data Management > Maintenance > Checklist */
@Component({
  selector: 'app-mdm-maintenance-checklist',
  imports: [FormsModule, RouterLink, LucideAngularModule, ChecklistForm],
  templateUrl: './checklist.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../people/people.css', '../maintenance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ChecklistPage extends ListPage<ChecklistRecord, ChecklistFilters, SortKey> implements OnInit {
  readonly service = inject(ChecklistService);
  saving = false;
  private readonly workTypes = inject(WorkTypeService);
  readonly types = CHECKLIST_TYPES;
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses = ['Active', 'Inactive'];
  readonly icons = { ClipboardList, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', checklistType: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load checklists: ${message}`));
    this.workTypes.ensureLoaded();
  }

  keyOf(r: ChecklistRecord): string {
    return r.code;
  }

  nameOf(r: ChecklistRecord): string {
    return r.name;
  }

  protected all(): ChecklistRecord[] {
    return this.service.all();
  }

  protected matches(r: ChecklistRecord, f: ChecklistFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.checklistType || r.checklistType === f.checklistType) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.category].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: ChecklistRecord, key: SortKey): string | number {
    return key === 'items' ? r.items.length : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Checklists attached to work types can't be deleted
  protected override deleteBlocker(r: ChecklistRecord): string | null {
    const count = this.workTypes.usesChecklist(r.code);
    return count ? `${r.name} is used by ${count} work type${count === 1 ? '' : 's'}. Remove it there first.` : null;
  }

  duplicate(r: ChecklistRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: ChecklistRecord; originalCode: string | null; originalName: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          if (event.originalCode) this.workTypes.renameChecklist(event.originalCode, event.record.code);
          this.carrySelection(event.originalCode, event.record.code);
          this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => this.notify(apiErrorMessage(err))
      });
  }

  toggleStatus(r: ChecklistRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
