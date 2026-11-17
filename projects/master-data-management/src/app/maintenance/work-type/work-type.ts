import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, Wrench, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { MaintenanceTypeService } from '../maintenance-type/maintenance-type.service';
import { WorkTypeForm } from './work-type-form/work-type-form';
import { WorkTypeFilters, WorkTypeRecord } from './work-type.model';
import { WorkTypeService } from './work-type.service';

type SortKey = 'name' | 'code' | 'maintenanceType' | 'durationHours';

/** Master Data Management > Maintenance > Work Type */
@Component({
  selector: 'app-mdm-maintenance-work-type',
  imports: [FormsModule, RouterLink, LucideAngularModule, WorkTypeForm],
  templateUrl: './work-type.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../people/people.css', '../maintenance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class WorkTypePage extends ListPage<WorkTypeRecord, WorkTypeFilters, SortKey> implements OnInit {
  readonly service = inject(WorkTypeService);
  saving = false;
  private readonly types = inject(MaintenanceTypeService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses = ['Active', 'Inactive'];
  readonly icons = { Wrench, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', maintenanceType: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load work types: ${message}`));
    this.types.ensureLoaded();
  }

  get maintenanceTypes(): string[] {
    return this.types.all().map((t) => t.name);
  }

  keyOf(r: WorkTypeRecord): string {
    return r.code;
  }

  nameOf(r: WorkTypeRecord): string {
    return r.name;
  }

  protected all(): WorkTypeRecord[] {
    return this.service.all();
  }

  protected matches(r: WorkTypeRecord, f: WorkTypeFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.maintenanceType || r.maintenanceType === f.maintenanceType) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: WorkTypeRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: WorkTypeRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: WorkTypeRecord; originalCode: string | null; originalName: string | null }): void {
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

  toggleStatus(r: WorkTypeRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
