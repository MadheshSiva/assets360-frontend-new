import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChartColumn, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { CHART_CATEGORIES } from '../system-config.data';
import { ConfigStatus, ChartTypeRecord } from '../system-config.model';
import { ChartTypeService, SystemSettingsService } from '../system-config.service';
import { ChartPreviewIcon } from './chart-preview';
import { ChartTypeForm } from './chart-type-form/chart-type-form';

type SortKey = 'name' | 'code' | 'category';
interface Filters {
  search: string;
  category: string;
  status: '' | ConfigStatus;
}

/** Master Data Management > System Configuration > Chart Type */
@Component({
  selector: 'app-mdm-system-configuration-chart-type',
  imports: [FormsModule, RouterLink, LucideAngularModule, ChartTypeForm, ChartPreviewIcon],
  templateUrl: './chart-type.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../system-config.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ChartTypePage extends ListPage<ChartTypeRecord, Filters, SortKey> {
  readonly service = inject(ChartTypeService);
  private readonly settings = inject(SystemSettingsService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly chartCategories = CHART_CATEGORIES;
  readonly icons = { ChartColumn, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', category: '', status: '' });
    this.refresh();
  }

  /** Loads the list from the API, with the masters it points at. */
  refresh(): void {
    this.service.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
    this.settings.load().subscribe({ error: (err) => this.notify(apiErrorMessage(err)) });
  }

  keyOf(r: ChartTypeRecord): string {
    return r.code;
  }

  nameOf(r: ChartTypeRecord): string {
    return r.name;
  }

  protected all(): ChartTypeRecord[] {
    return this.service.all();
  }

  protected matches(r: ChartTypeRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.category || r.category === f.category) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.category, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: ChartTypeRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // The default chart type in System Settings can't be deleted
  protected override deleteBlocker(r: ChartTypeRecord): string | null {
    return this.settings.isDefault('chartType', r.code) ? `${r.name} is the default chart type in System Settings. Pick another one there first.` : null;
  }

  duplicate(r: ChartTypeRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: ChartTypeRecord; originalCode: string | null }): void {
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

  toggleStatus(r: ChartTypeRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
