import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Building2, Calendar, CircleCheck, Database, Download, Ellipsis, FileDown, FileText, FileUp, Funnel, LucideAngularModule, Package,
  Pencil, Play, Plus, Search, Settings, ShieldCheck, TriangleAlert, Truck, Upload, User, Users, Wrench
} from 'lucide-angular';
import { AdminPage, ADMIN_PEOPLE } from '../shared/admin-common';
import { DataJob, FieldMapping, JobSchedule, JobStatus, JobType, ValidationRule } from './data-import.model';
import { DATA_OBJECT_NAMES, objectDef } from './data-import.data';
import { DataJobService, apiErrorMessage, cloneJob } from './data-import.service';
import { compactNumber, downloadFile, formatStamp, toCsv } from './data-import.util';
import { JobDrawer } from './job-drawer/job-drawer';
import { JobOverview } from './job-overview/job-overview';
import { JobHistory } from './job-tabs/job-history';
import { JobMapping } from './job-tabs/job-mapping';
import { JobRules } from './job-tabs/job-rules';
import { JobScheduleTab } from './job-tabs/job-schedule';

type Tab = 'overview' | 'mapping' | 'rules' | 'schedule' | 'history';

const PAGE_SIZE = 20;

const STATUS_TONES: Record<JobStatus, string> = {
  Completed: 'green',
  Running: 'blue',
  Failed: 'red',
  Scheduled: 'purple',
  Draft: 'grey'
};

const OBJECT_ICONS: Record<string, typeof Database> = {
  database: Database, file: FileText, users: Users, package: Package, truck: Truck, shield: ShieldCheck, building: Building2, wrench: Wrench
};

/** Administration > Data Import / Export */
@Component({
  selector: 'app-admin-data-import-export',
  imports: [FormsModule, RouterLink, LucideAngularModule, JobDrawer, JobOverview, JobMapping, JobRules, JobScheduleTab, JobHistory],
  templateUrl: './data-import-export.html',
  styleUrls: ['../shared/admin-workspace.css', './data-import-export.css']
})
export class DataImportExportPage extends AdminPage implements OnInit {
  readonly service = inject(DataJobService);
  @ViewChild(JobDrawer) drawer?: JobDrawer;

  readonly icons = {
    Upload, Download, Database, TriangleAlert, Plus, FileUp, FileDown, Search, Funnel, Play, CircleCheck, Pencil, Ellipsis,
    User, Calendar, Settings
  };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'mapping', label: 'Field Mapping' },
    { key: 'rules', label: 'Validation Rules' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'history', label: 'History' }
  ];
  readonly statuses: JobStatus[] = ['Completed', 'Running', 'Failed', 'Scheduled', 'Draft'];
  readonly objects = DATA_OBJECT_NAMES;
  readonly owners = [...ADMIN_PEOPLE].sort();
  readonly formatStamp = formatStamp;
  readonly compactNumber = compactNumber;

  // Filters
  search = '';
  listSearch = '';
  typeFilter: '' | JobType = '';
  statusFilter: '' | JobStatus = '';
  objectFilter = '';
  ownerFilter = '';
  showMoreFilters = false;
  visibleCount = PAGE_SIZE;

  selectedId = '';
  tab: Tab = 'overview';
  drawerOpen = true;
  draft: DataJob;
  moreOpen = false;
  validatingId = '';
  saving = false;
  confirmDelete: DataJob | null = null;

  constructor() {
    super();
    const first = this.service.all()[0];
    this.selectedId = first?.id ?? '';
    this.draft = first ? cloneJob(first) : this.service.blank('Import');
  }

  ngOnInit(): void {
    this.service.load().subscribe({
      next: (list) => {
        if (this.service.get(this.selectedId)) return;
        // Keep an unsaved new-job draft open; otherwise show the first job
        const first = list[0];
        this.selectedId = first?.id ?? '';
        if (this.draft.id || !this.draft.name.trim()) this.draft = first ? cloneJob(first) : this.service.blank('Import');
      },
      error: (err) => this.notify(apiErrorMessage(err, 'Could not load import jobs.'))
    });
  }

  // ----- Derived data -----
  get selected(): DataJob | undefined {
    return this.service.get(this.selectedId);
  }

  get filtered(): DataJob[] {
    const terms = [this.search, this.listSearch].map((t) => t.trim().toLowerCase()).filter(Boolean);
    return this.service.all().filter(
      (j) =>
        (!this.typeFilter || j.type === this.typeFilter) &&
        (!this.statusFilter || j.status === this.statusFilter) &&
        (!this.objectFilter || j.dataObject === this.objectFilter) &&
        (!this.ownerFilter || j.owner === this.ownerFilter) &&
        terms.every((t) => [j.name, j.dataObject, j.owner, j.code].some((v) => v.toLowerCase().includes(t)))
    );
  }

  get visibleJobs(): DataJob[] {
    return this.filtered.slice(0, this.visibleCount);
  }

  get activeFilterCount(): number {
    return [this.objectFilter, this.ownerFilter].filter(Boolean).length;
  }

  get isRunning(): boolean {
    return this.selected?.status === 'Running';
  }

  onFilterChange(): void {
    this.visibleCount = PAGE_SIZE;
  }

  clearFilters(): void {
    this.search = '';
    this.listSearch = '';
    this.typeFilter = '';
    this.statusFilter = '';
    this.objectFilter = '';
    this.ownerFilter = '';
    this.onFilterChange();
  }

  loadMore(): void {
    this.visibleCount += PAGE_SIZE;
  }

  statusTone(s: JobStatus): string {
    return STATUS_TONES[s];
  }

  objectIcon(name: string): typeof Database {
    return OBJECT_ICONS[objectDef(name).icon] ?? Database;
  }

  objectTone(name: string): string {
    return objectDef(name).tone;
  }

  // ----- Selection + drawer -----
  select(job: DataJob): void {
    this.selectedId = job.id;
    this.moreOpen = false;
    this.draft = cloneJob(job);
  }

  newJob(type: JobType): void {
    // New jobs open with every dropdown unselected (the shared blank() also backs non-drawer drafts)
    this.draft = {
      ...this.service.blank(type),
      dataObject: '',
      operation: '' as DataJob['operation'],
      fileFormat: '' as DataJob['fileFormat'],
      duplicateHandling: '',
      dateFormat: '',
      delimiter: '',
      encoding: ''
    };
    this.drawerOpen = true;
    setTimeout(() => this.drawer?.focusName());
  }

  edit(): void {
    const job = this.selected;
    if (!job) return;
    this.draft = cloneJob(job);
    this.drawerOpen = true;
    setTimeout(() => this.drawer?.focusName());
  }

  onSaved(draft: DataJob): void {
    if (this.saving) return;
    const isNew = !draft.id;
    this.saving = true;
    this.service.save(draft).subscribe({
      next: (saved) => {
        this.saving = false;
        this.selectedId = saved.id;
        this.draft = cloneJob(saved);
        if (isNew) {
          this.clearFilters();
          this.tab = 'overview';
        }
        this.notify(isNew ? `${saved.name} created as ${saved.code}.` : `${saved.name} saved (${saved.version}).`);
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err, `Could not save ${draft.name.trim()}.`));
      }
    });
  }

  cancelDrawer(): void {
    const job = this.selected;
    this.draft = job ? cloneJob(job) : this.service.blank('Import');
  }

  /** Keep the drawer in step after a tab or a run changes the selected job. */
  private resyncDrawer(): void {
    const job = this.selected;
    if (job && this.draft.id === job.id) this.draft = cloneJob(job);
  }

  // ----- Actions -----
  runNow(): void {
    const job = this.selected;
    if (!job || job.status === 'Running') return;
    if (!job.active) {
      this.notify('This job is inactive. Turn on Status in the settings drawer first.');
      return;
    }
    if (job.type === 'Import' && !job.fileName) {
      this.notify('Attach a source file before running the import.');
      return;
    }
    this.service.run(job.id, (done) => {
      this.resyncDrawer();
      this.notify(`${done.name} completed: ${done.successful.toLocaleString('en-US')} successful, ${done.failed} failed.`);
    });
    this.resyncDrawer();
    this.notify(`DEMO MODE: ${job.name} is running…`);
  }

  validate(): void {
    const job = this.selected;
    if (!job || this.validatingId) return;
    this.validatingId = job.id;
    this.service.validate(job.id, (errors, warnings) => {
      this.validatingId = '';
      this.notify(errors || warnings ? `Validation complete: ${errors} errors, ${warnings} warnings.` : 'Validation passed with no issues.');
    });
  }

  downloadErrors(): void {
    const job = this.selected;
    if (!job || !job.issues.length) return;
    const csv = toCsv(
      ['Row', 'Field', 'Issue', 'Severity', 'Status'],
      job.issues.map((i) => [i.row, i.field, i.issue, i.severity, i.status])
    );
    downloadFile(`${job.code}_errors.csv`, csv);
    this.notify(`Error file downloaded (${job.issues.length} rows).`);
  }

  downloadReport(): void {
    const job = this.selected;
    if (!job) return;
    const rows: unknown[][] = [
      ['Job', job.name], ['Job Code', job.code], ['Type', job.type], ['Data Object', job.dataObject], ['Status', job.status],
      ['Version', job.version], ['Owner', job.owner], ['Last Run', formatStamp(job.date)], ['Source File', job.fileName],
      ['Total Records', job.records], ['Successful', job.successful], ['Failed', job.failed], ['Warnings', job.warnings], [],
      ['Row', 'Field', 'Issue', 'Severity', 'Status'],
      ...job.issues.map((i) => [i.row, i.field, i.issue, i.severity, i.status])
    ];
    downloadFile(`${job.code}_report.csv`, toCsv(['Field', 'Value'], rows));
    this.notify('Job report downloaded.');
  }

  /** Header + sample row CSV for the filtered (or selected) data object. */
  downloadTemplate(type: JobType): void {
    const def = objectDef(this.objectFilter || this.selected?.dataObject || 'Asset Master');
    const header = def.fields.map((f) => (f.required ? `${f.label} *` : f.label));
    const slug = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadFile(`${slug}_${type.toLowerCase()}_template.csv`, toCsv(header, [def.fields.map((f) => f.sample)]));
    this.notify(`${type} template for ${def.name} downloaded.`);
  }

  duplicate(): void {
    const job = this.selected;
    this.moreOpen = false;
    if (!job) return;
    const copy = cloneJob(job);
    copy.id = '';
    copy.code = '';
    copy.name = `${job.name} (Copy)`.slice(0, 80);
    copy.status = 'Draft';
    this.draft = copy;
    this.drawerOpen = true;
    this.notify('Review the copy in the settings drawer, then Save Job.');
  }

  askDelete(): void {
    this.moreOpen = false;
    this.confirmDelete = this.selected ?? null;
  }

  doDelete(): void {
    const job = this.confirmDelete;
    this.confirmDelete = null;
    if (!job) return;
    if (this.service.get(job.id)?.status === 'Running') {
      this.notify('A running job can’t be deleted. Wait for it to finish.');
      return;
    }
    this.service.remove(job.id).subscribe({
      next: () => {
        const next = this.filtered[0] ?? this.service.all()[0];
        this.selectedId = next?.id ?? '';
        this.draft = next ? cloneJob(next) : this.service.blank('Import');
        this.notify(`${job.name} deleted.`);
      },
      error: (err) => this.notify(apiErrorMessage(err, `Could not delete ${job.name}.`))
    });
  }

  // ----- Tab outputs -----
  onMapping(mapping: FieldMapping[]): void {
    this.service.patch(this.selectedId, { mapping }).subscribe(() => {
      this.resyncDrawer();
      this.notify('Field mapping saved.');
    });
  }

  onRules(change: { rules: ValidationRule[]; rule: ValidationRule }): void {
    this.service.patch(this.selectedId, { rules: change.rules }).subscribe(() => {
      this.resyncDrawer();
      this.notify(`${change.rule.name} ${change.rule.enabled ? 'enabled' : 'disabled'}.`);
    });
  }

  onSchedule(schedule: JobSchedule): void {
    const id = this.selectedId;
    this.service.patch(id, { schedule }).subscribe({
      next: () => {
        this.resyncDrawer();
        this.notify('Schedule saved.');
      },
      error: (err) => this.notify(apiErrorMessage(err, 'Could not save the schedule.'))
    });
  }
}
