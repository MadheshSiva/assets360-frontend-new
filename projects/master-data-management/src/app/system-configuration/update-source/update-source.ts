import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, Ellipsis, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { SOURCE_TYPES } from '../system-config.data';
import { ConfigStatus, UpdateSourceRecord } from '../system-config.model';
import { SystemSettingsService, UpdateSourceService } from '../system-config.service';
import { UpdateSourceForm } from './update-source-form/update-source-form';

type SortKey = 'name' | 'code' | 'type';
interface Filters {
  search: string;
  type: string;
  status: '' | ConfigStatus;
}

/** Master Data Management > System Configuration > Update Source */
@Component({
  selector: 'app-mdm-system-configuration-update-source',
  imports: [FormsModule, RouterLink, LucideAngularModule, UpdateSourceForm],
  templateUrl: './update-source.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../system-config.css', '../../shared/styles/mdm-purple-theme.css']
})
export class UpdateSourcePage extends ListPage<UpdateSourceRecord, Filters, SortKey> {
  readonly service = inject(UpdateSourceService);
  private readonly settings = inject(SystemSettingsService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly sourceTypes = SOURCE_TYPES;
  readonly icons = { Database, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', type: '', status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.service.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
    this.settings.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: UpdateSourceRecord): string {
    return r.code;
  }

  nameOf(r: UpdateSourceRecord): string {
    return r.name;
  }

  protected all(): UpdateSourceRecord[] {
    return this.service.all();
  }

  protected matches(r: UpdateSourceRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.type || r.type === f.type) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.type, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: UpdateSourceRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Sources picked in System Settings (default source, integration sources) can't be deleted
  protected override deleteBlocker(r: UpdateSourceRecord): string | null {
    return this.settings.usesSource(r.code) ? `${r.name} is used in System Settings. Remove it there first.` : null;
  }

  duplicate(r: UpdateSourceRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: UpdateSourceRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: () => {
        this.saving = false;
        this.carrySelection(event.originalCode, event.record.code);
        this.notify(`${event.record.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: UpdateSourceRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
