import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, Settings, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { TaskTemplateService } from '../task-template/task-template.service';
import { WorkTypeService } from '../work-type/work-type.service';
import { MaintenanceTypeForm } from './maintenance-type-form/maintenance-type-form';
import { MaintenanceTypeFilters, MaintenanceTypeRecord } from './maintenance-type.model';
import { MaintenanceTypeService } from './maintenance-type.service';

type SortKey = 'name' | 'code';

/** Master Data Management > Maintenance > Maintenance Type */
@Component({
  selector: 'app-mdm-maintenance-maintenance-type',
  imports: [FormsModule, RouterLink, LucideAngularModule, MaintenanceTypeForm],
  templateUrl: './maintenance-type.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../people/people.css', '../maintenance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class MaintenanceTypePage extends ListPage<MaintenanceTypeRecord, MaintenanceTypeFilters, SortKey> implements OnInit {
  readonly service = inject(MaintenanceTypeService);
  saving = false;
  private readonly workTypes = inject(WorkTypeService);
  private readonly templates = inject(TaskTemplateService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses = ['Active', 'Inactive'];
  readonly icons = { Settings, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load maintenance types: ${message}`));
    this.workTypes.ensureLoaded();
    this.templates.ensureLoaded();
  }

  keyOf(r: MaintenanceTypeRecord): string {
    return r.code;
  }

  nameOf(r: MaintenanceTypeRecord): string {
    return r.name;
  }

  protected all(): MaintenanceTypeRecord[] {
    return this.service.all();
  }

  protected matches(r: MaintenanceTypeRecord, f: MaintenanceTypeFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: MaintenanceTypeRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Types used by work types or task templates can't be deleted
  protected override deleteBlocker(r: MaintenanceTypeRecord): string | null {
    const count = this.workTypes.usesType(r.name) + this.templates.usesType(r.name);
    return count ? `${r.name} is used by ${count} work types and task templates. Mark it Inactive instead.` : null;
  }

  duplicate(r: MaintenanceTypeRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: MaintenanceTypeRecord; originalCode: string | null; originalName: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          // Work types and task templates refer to the type by name
          if (event.originalName) {
            this.workTypes.renameType(event.originalName, event.record.name);
            this.templates.renameType(event.originalName, event.record.name);
          }
          this.carrySelection(event.originalCode, event.record.code);
          this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => this.notify(apiErrorMessage(err))
      });
  }

  toggleStatus(r: MaintenanceTypeRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
