import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Calendar, Download, File, FileText, Funnel, LucideAngularModule, Plus, Search, Upload } from 'lucide-angular';
import { Observable, Subject, catchError, of, switchMap } from 'rxjs';
import { AnalyticsPage } from '../shared/analytics-common';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import { ReportBuilder } from './report-builder/report-builder';
import { ReportConfig } from './report-config/report-config';
import { LibrarySort, ReportLibrary } from './report-library/report-library';
import { NOT_SCHEDULED } from './custom-reports.data';
import { CustomReport, ReportStatus, ReportVisibility } from './custom-reports.model';
import { CustomReportsService, LibraryQuery, cloneReport } from './custom-reports.service';

const MAX_IMPORT_BYTES = 1_000_000;
const ANY_TIME = 'Any time';

/** Reports & Analytics > Custom Reports (data from /api/custom-reports) */
@Component({
  selector: 'app-ra-custom-reports',
  imports: [FormsModule, RouterLink, LucideAngularModule, ReportLibrary, ReportBuilder, ReportConfig, ConfirmDialog],
  templateUrl: './custom-reports.html',
  styleUrls: ['../shared/analytics-page.css', './custom-reports.css']
})
export class CustomReportsPage extends AnalyticsPage {
  private readonly service = inject(CustomReportsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly libraryRequests = new Subject<LibraryQuery>();

  @ViewChild(ReportBuilder) builder?: ReportBuilder;
  @ViewChild('builderAnchor') builderAnchor?: ElementRef<HTMLElement>;
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  readonly icons = { FileText, Funnel, Calendar, File, Plus, Upload, Download, Search };
  readonly statuses: ReportStatus[] = ['Draft', 'Published', 'Scheduled'];

  // Filters (sent to the API)
  search = '';
  /** Owner id */
  owner = '';
  module = '';
  status: '' | ReportStatus = '';
  updated = ANY_TIME;
  librarySort: LibrarySort = 'updated';
  filtered: CustomReport[] = [];

  /** The report in the builder (a working copy until saved) */
  draft: CustomReport;
  showErrors = false;
  busy = false;
  confirmDelete: CustomReport | null = null;

  constructor() {
    super();
    this.draft = this.service.blank();

    // Library requests: the latest filters win
    this.libraryRequests
      .pipe(
        switchMap((query) =>
          this.service.loadLibrary(query).pipe(
            catchError((err: Error) => {
              this.notify(err.message);
              return of(null);
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        if (list) this.applySort();
      });

    // The catalog first: library rows and blank reports need the data source cards
    this.service.loadCatalog().subscribe({
      next: () => {
        if (!this.draft.id) this.draft = this.service.blank();
        this.refilter();
      },
      error: (err: Error) => {
        this.notify(`Data sources could not be loaded: ${err.message}`);
        this.refilter();
      }
    });
    this.service.loadOptions().subscribe({ error: () => undefined });
    this.service.loadOwners().subscribe({ error: () => undefined });
    this.refreshSummary();
  }

  get stats() {
    return this.service.stats();
  }

  get modules(): string[] {
    return this.service.modules();
  }

  get owners() {
    return this.service.owners();
  }

  get updatedRanges(): string[] {
    return this.service.lastUpdatedOptions();
  }

  get loading(): boolean {
    return this.service.loading();
  }

  get nameError(): string {
    const n = this.draft.name.trim();
    if (!n) return 'Report name is required.';
    if (n.length < 3) return 'Use at least 3 characters.';
    if (this.service.isNameTaken(n, this.draft.id)) return 'Another custom report already uses this name.';
    return '';
  }

  // ----- Library -----

  private get query(): LibraryQuery {
    return {
      search: this.search,
      ownerId: this.owner,
      module: this.module,
      status: this.status,
      lastUpdated: this.updated,
      sortBy: this.librarySort === 'name' ? 'reportName' : 'updatedAt'
    };
  }

  /** Reloads the library with the current filters. */
  refilter(): void {
    this.libraryRequests.next(this.query);
  }

  /** Search box: wait for a pause in typing. */
  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.refilter(), 300);
  }
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** The API sorts by name / last update; favourites first is applied here. */
  private applySort(): void {
    const list = [...this.service.reports()];
    if (this.librarySort === 'favourites') {
      list.sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.updatedAt.localeCompare(a.updatedAt));
    }
    this.filtered = list;
  }

  private refreshSummary(): void {
    this.service.loadSummary().subscribe({ error: () => undefined });
  }

  /** After a change: the library (status / name may have moved it) and the four cards. */
  private reloadAll(): void {
    this.refilter();
    this.refreshSummary();
  }

  get hasFilters(): boolean {
    return !!(this.search || this.owner || this.module || this.status || this.updated !== ANY_TIME);
  }

  clearFilters(): void {
    this.search = '';
    this.owner = '';
    this.module = '';
    this.status = '';
    this.updated = ANY_TIME;
    this.refilter();
  }

  setSort(sort: LibrarySort): void {
    const serverSortChanged = (sort === 'name') !== (this.librarySort === 'name');
    this.librarySort = sort;
    if (serverSortChanged) this.refilter();
    else this.applySort();
  }

  openReport(r: CustomReport): void {
    const open = (full: CustomReport) => {
      this.draft = cloneReport(full);
      this.showErrors = false;
      this.builder?.goTo(Math.max(0, full.currentStep - 1));
      this.builderAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.notify(full.canEdit ? `“${full.name}” opened in the Report Builder.` : `“${full.name}” opened read-only (owned by ${full.owner}).`);
    };
    if (r.loaded) {
      open(r);
      return;
    }
    this.service.get(r.id).subscribe({ next: open, error: (err: Error) => this.notify(err.message) });
  }

  toggleFavourite(r: CustomReport): void {
    const favourite = !r.favourite;
    this.service.setFavourite(r.id, favourite).subscribe({
      next: () => {
        if (this.draft.id === r.id) this.draft.favourite = favourite;
        this.applySort();
        this.notify(favourite ? `“${r.name}” added to favourites.` : `“${r.name}” removed from favourites.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  duplicate(r: CustomReport): void {
    this.service.duplicate(r.id, this.service.uniqueName(r.name)).subscribe({
      next: (copy) => {
        this.reloadAll();
        this.notify(`Duplicated as “${copy.name}” (draft).`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  askDelete(r: CustomReport): void {
    this.confirmDelete = r;
  }

  confirmRemove(): void {
    const r = this.confirmDelete;
    this.confirmDelete = null;
    if (!r) return;
    this.service.remove(r.id).subscribe({
      next: () => {
        if (this.draft.id === r.id) this.newReport(false);
        this.reloadAll();
        this.notify(`“${r.name}” deleted.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  togglePublish(r: CustomReport): void {
    const published = r.status !== 'Draft';
    const request$ = published ? this.service.unpublish(r.id) : this.service.publish(r.id);
    request$.subscribe({
      next: (stored) => {
        if (this.draft.id === stored.id) {
          this.draft.status = stored.status;
          this.draft.updatedAt = stored.updatedAt;
        }
        this.reloadAll();
        this.notify(published ? `“${r.name}” unpublished (Draft).` : `“${r.name}” ${stored.status.toLowerCase()} (${audience(stored.visibility)}).`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  // ----- Builder + configuration -----

  newReport(announce = true): void {
    this.draft = this.service.blank();
    this.showErrors = false;
    this.builder?.goTo(0);
    if (announce) {
      this.builderAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.notify('New blank report — start by choosing a data source.');
    }
  }

  /** Saves the draft (POST or PUT), then runs `after` on the stored report (publish / unpublish). */
  private store(message: (r: CustomReport) => string, after?: (r: CustomReport) => Observable<CustomReport>): void {
    if (this.busy) return;
    if (!this.draft.canEdit) {
      this.notify(`Only ${this.draft.owner} can change this report. Duplicate it to make your own copy.`);
      return;
    }
    this.busy = true;
    this.draft.name = this.draft.name.trim();
    const step = (this.builder?.step ?? 0) + 1;
    this.service
      .save(this.draft, step)
      .pipe(switchMap((saved) => (after ? after(saved) : of(saved))))
      .subscribe({
        next: (stored) => {
          this.busy = false;
          this.draft = cloneReport(stored);
          this.showErrors = false;
          this.reloadAll();
          this.notify(message(stored));
        },
        error: (err: Error) => {
          this.busy = false;
          this.notify(err.message);
        }
      });
  }

  /** A draft only needs a valid name; a published report saved as draft is unpublished. */
  saveDraft(): void {
    this.showErrors = true;
    if (this.nameError) {
      this.notify(this.nameError);
      return;
    }
    const wasPublished = !!this.draft.id && this.draft.status !== 'Draft';
    this.store(
      (r) => `“${r.name}” saved as a draft.`,
      wasPublished ? (r) => this.service.unpublish(r.id) : undefined
    );
  }

  /** Save / publish need a valid name, at least one field and complete filters. */
  private validateAll(): boolean {
    this.showErrors = true;
    const problem = this.nameError || (this.draft.fields.length ? '' : 'Select at least one field.') || this.builder?.firstProblem || '';
    if (problem) {
      this.notify(problem);
      return false;
    }
    return true;
  }

  /** Saves and keeps the status (a published report with a schedule becomes Scheduled on the server). */
  saveReport(): void {
    if (!this.validateAll()) return;
    const published = this.draft.status !== 'Draft';
    this.store(
      (r) => (r.schedule !== NOT_SCHEDULED && published ? `“${r.name}” saved and scheduled (${r.schedule}).` : `“${r.name}” saved.`),
      // Re-publish so a schedule added to a published report takes effect
      published ? (r) => this.service.publish(r.id) : undefined
    );
  }

  /** Publish (Published, or Scheduled with a schedule) or unpublish. */
  publish(): void {
    if (!this.validateAll()) return;
    if (this.draft.status !== 'Draft') {
      this.store((r) => `“${r.name}” unpublished.`, (r) => this.service.unpublish(r.id));
    } else {
      this.store((r) => `“${r.name}” ${r.status.toLowerCase()} (${audience(r.visibility)}).`, (r) => this.service.publish(r.id));
    }
  }

  previewReport(): void {
    this.builder?.goTo(5);
    this.builderAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- Import / export -----

  chooseImport(): void {
    this.importInput?.nativeElement.click();
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      this.notify('Choose a .json report template.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.notify('Template is larger than 1 MB.');
      return;
    }
    this.service.importTemplates(file).subscribe({
      next: (res) => {
        this.reloadAll();
        const failed = res.failed.length;
        const first = failed ? ` First problem — ${res.failed[0].name}: ${res.failed[0].message}` : '';
        this.notify(`Imported ${res.created} template${res.created === 1 ? '' : 's'} as draft${failed ? `; ${failed} skipped.${first}` : '.'}`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  exportReports(): void {
    if (!this.filtered.length) {
      this.notify('No reports to export with the current filters.');
      return;
    }
    this.service.exportLibrary(this.query).subscribe({
      next: (name) => this.notify(`Exported the reports matching the current filters (${name}).`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  override ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    super.ngOnDestroy();
  }
}

function audience(v: ReportVisibility): string {
  return v === 'Only me' ? 'visible to you only' : v === 'My team' ? 'visible to your team' : 'visible to the organization';
}
