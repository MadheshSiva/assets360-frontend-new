import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, ClipboardCheck, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, finalize } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { MaintenanceTypeService } from '../maintenance-type/maintenance-type.service';
import { TaskTemplateForm } from './task-template-form/task-template-form';
import { TaskTemplateFilters, TaskTemplateRecord } from './task-template.model';
import { TaskTemplateService } from './task-template.service';

type SortKey = 'name' | 'code' | 'maintenanceType' | 'estimatedHours' | 'tasks';

/** Master Data Management > Maintenance > Task Template */
@Component({
  selector: 'app-mdm-maintenance-task-template',
  imports: [FormsModule, RouterLink, LucideAngularModule, TaskTemplateForm],
  templateUrl: './task-template.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../people/people.css', '../maintenance.css', '../../shared/styles/mdm-purple-theme.css']
})
export class TaskTemplatePage extends ListPage<TaskTemplateRecord, TaskTemplateFilters, SortKey> implements OnInit {
  readonly service = inject(TaskTemplateService);
  saving = false;
  private readonly types = inject(MaintenanceTypeService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses = ['Active', 'Inactive'];
  readonly icons = { ClipboardCheck, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  constructor() {
    super({ search: '', maintenanceType: '', status: '' });
  }

  ngOnInit(): void {
    this.service.refresh((message) => this.notify(`Could not load task templates: ${message}`));
    this.types.ensureLoaded();
  }

  get maintenanceTypes(): string[] {
    return this.types.all().map((t) => t.name);
  }

  hours(h: number): string {
    return `${h} hr${h === 1 ? '' : 's'}`;
  }

  keyOf(r: TaskTemplateRecord): string {
    return r.code;
  }

  nameOf(r: TaskTemplateRecord): string {
    return r.name;
  }

  protected all(): TaskTemplateRecord[] {
    return this.service.all();
  }

  protected matches(r: TaskTemplateRecord, f: TaskTemplateFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.maintenanceType || r.maintenanceType === f.maintenanceType) && (!f.status || r.status === f.status) && (!term || [r.name, r.code].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: TaskTemplateRecord, key: SortKey): string | number {
    return key === 'tasks' ? r.tasks.length : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: TaskTemplateRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: TaskTemplateRecord; originalCode: string | null; originalName: string | null }): void {
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

  toggleStatus(r: TaskTemplateRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
