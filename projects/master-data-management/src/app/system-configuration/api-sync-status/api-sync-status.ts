import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, RefreshCw, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { ConfigStatus, SyncStatusRecord } from '../system-config.model';
import { SyncStatusService, SystemSettingsService } from '../system-config.service';
import { SyncStatusForm } from './sync-status-form/sync-status-form';

type SortKey = 'name' | 'code';
interface Filters {
  search: string;
  status: '' | ConfigStatus;
}

/** Master Data Management > System Configuration > API Sync Status */
@Component({
  selector: 'app-mdm-system-configuration-api-sync-status',
  imports: [FormsModule, RouterLink, LucideAngularModule, SyncStatusForm],
  templateUrl: './api-sync-status.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../system-config.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ApiSyncStatusPage extends ListPage<SyncStatusRecord, Filters, SortKey> {
  readonly service = inject(SyncStatusService);
  private readonly settings = inject(SystemSettingsService);
  readonly basePath = MASTER_DATA_BASE_PATH;

  readonly icons = { RefreshCw, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.service.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
    this.settings.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: SyncStatusRecord): string {
    return r.code;
  }

  nameOf(r: SyncStatusRecord): string {
    return r.name;
  }

  protected all(): SyncStatusRecord[] {
    return this.service.all();
  }

  protected matches(r: SyncStatusRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: SyncStatusRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // The status used for failed syncs in Integration settings can't be deleted
  protected override deleteBlocker(r: SyncStatusRecord): string | null {
    return this.settings.usesSyncStatus(r.code) ? `${r.name} is the failed-sync status in System Settings › Integration. Pick another one there first.` : null;
  }

  duplicate(r: SyncStatusRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: SyncStatusRecord; originalCode: string | null }): void {
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

  toggleStatus(r: SyncStatusRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
