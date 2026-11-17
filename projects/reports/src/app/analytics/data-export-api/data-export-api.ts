import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { catchError, of } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, BookOpen, Calendar, CircleCheck, CirclePlus, Database, FileText, Info, Link, LucideAngularModule, RefreshCw, Search,
  Share2
} from 'lucide-angular';
import { AnalyticsPage } from '../shared/analytics-common';
import { RA_COLORS, Sparkline } from '../shared/charts';
import { formatBytes } from './data-export-api.data';
import { ApiConnection, Dataset, ExportDraft, ExportFormat, ExportJob, ExportStatus } from './data-export-api.model';
import { DataExportService } from './data-export-api.service';
import { ConfirmDialog } from './dx-confirm-dialog';
import { ConnectionDetails } from './dx-connection-details';
import { ConnectionDialog } from './dx-connection-dialog';
import { ConnectionsPanel } from './dx-connections-panel';
import { DeliveryHealth } from './dx-delivery-health';
import { DocsDialog } from './dx-docs-dialog';
import { ExportBuilder } from './dx-export-builder';
import { ExportJobsTable } from './dx-export-jobs';
import { AccessSecurityCard, InsightEvent, IntegrationInsights, IntegrationStatusCard } from './dx-side-cards';
import { AccessLogsTab, ConnectionsTab, DatasetsTab } from './dx-tabs';

type Tab = 'exports' | 'connections' | 'datasets' | 'logs';

interface Kpi {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  tone: string;
  icon: typeof Info;
  trend: number[];
  color: string;
  info: string;
  since: string;
}

interface Confirm {
  title: string;
  message: string;
  run: () => void;
}

const DAY = 86_400_000;

/** Reports & Analytics > Data Export / API: export jobs, reporting connections, datasets and access logs from /api/data-export. */
@Component({
  standalone: true,
  selector: 'app-ra-data-export-api',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, Sparkline, ExportJobsTable, ConnectionsPanel, ExportBuilder, DeliveryHealth,
    IntegrationStatusCard, AccessSecurityCard, IntegrationInsights, ConnectionsTab, DatasetsTab, AccessLogsTab, ConnectionDialog,
    ConnectionDetails, DocsDialog, ConfirmDialog
  ],
  providers: [DataExportService],
  templateUrl: './data-export-api.html',
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css']
})
export class DataExportApiPage extends AnalyticsPage implements OnInit, OnDestroy {
  readonly service = inject(DataExportService);
  @ViewChild(ExportBuilder) builder?: ExportBuilder;
  @ViewChild(ExportBuilder, { read: ElementRef }) builderEl?: ElementRef<HTMLElement>;

  readonly icons = { BookOpen, Share2, CirclePlus, Search, ArrowUp, ArrowDown, Info, RefreshCw };
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'exports', label: 'Exports' },
    { key: 'connections', label: 'API Connections' },
    { key: 'datasets', label: 'Datasets' },
    { key: 'logs', label: 'Access Logs' }
  ];
  readonly statuses: ExportStatus[] = ['Success', 'Running', 'Scheduled', 'Failed', 'Paused', 'Draft'];

  tab: Tab = 'exports';
  search = '';
  formatFilter = '';
  statusFilter = '';
  ownerFilter = '';
  lastRunFilter = '';

  showDocs = false;
  showAddConnection = false;
  detailsId = '';
  confirm: Confirm | null = null;
  logResource = '';
  highlightId = '';

  private uiTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUpdated = 0;
  private readonly clock = setInterval(() => this.tick(), 60_000);

  get formats(): ExportFormat[] {
    return this.service.formats;
  }

  get healthVersion(): number {
    return this.service.version();
  }

  /** Nothing to show yet: no jobs, no connections and every dataset empty. */
  get empty(): boolean {
    const s = this.service;
    return s.loaded() && !s.jobs.length && !s.connections.length && s.datasets.every((d) => !d.rows);
  }

  ngOnInit(): void {
    this.refreshing = true;
    this.service.loadOptions().pipe(catchError(() => of(undefined))).subscribe();
    this.load();
  }

  private load(announce?: string): void {
    this.refreshing = true;
    this.service.loadOverview().subscribe({
      next: () => {
        this.refreshing = false;
        this.lastUpdated = Date.now();
        this.updatedMinutes = 0;
        if (announce) this.notify(announce);
      },
      error: (err: Error) => {
        this.refreshing = false;
        this.notify(err.message);
      }
    });
  }

  override refresh(): void {
    if (!this.refreshing) this.load('Data refreshed.');
  }

  private tick(): void {
    if (this.lastUpdated) this.updatedMinutes = Math.floor((Date.now() - this.lastUpdated) / 60_000);
  }

  // ----- Header figures -----

  get kpis(): Kpi[] {
    const s = this.service;
    const sum = s.summary;
    const rate = s.successRate;
    const prevRate = sum.successRatePrevious30;
    const rateTrend = s.stats7.success.map((v, i) => (v + s.stats7.failed[i] ? (v / (v + s.stats7.failed[i])) * 100 : 0));
    const rateDelta = rate !== null && prevRate !== null ? rate - prevRate : null;
    const bytesTrend = s.stats7.generatedBytes.slice();
    return [
      this.kpi('Active Exports', s.activeExports, sum.activeExportsWeekAgo, 'purple', FileText, 'Export jobs that are not paused or drafts'),
      this.kpi('API Connections', s.connections.length, sum.connectionsWeekAgo, 'blue', Link, 'Reporting systems connected to Asset360'),
      this.kpi('Scheduled Jobs', s.scheduledJobs, sum.scheduledJobsWeekAgo, 'pink', Calendar, 'Exports that run on a schedule'),
      {
        label: 'Successful Runs', value: rate === null ? '—' : `${rate.toFixed(1)}%`,
        delta: rateDelta === null ? '—' : `${rateDelta >= 0 ? '+' : ''}${rateDelta.toFixed(1)} pts`,
        up: rateDelta === null || rateDelta >= 0, tone: 'green', icon: CircleCheck, trend: rateTrend, color: RA_COLORS.green,
        info: 'Export runs that succeeded, last 30 days (vs the 30 days before)', since: 'vs previous 30 days'
      },
      {
        label: 'Data Generated', value: formatBytes(sum.generatedBytes30), delta: this.pct(sum.generatedBytes30, sum.generatedBytesPrevious30),
        up: sum.generatedBytes30 >= sum.generatedBytesPrevious30, tone: 'orange', icon: Database, trend: bytesTrend, color: RA_COLORS.orange,
        info: `Size of the files generated by export runs, last 30 days (${s.deliveryNote})`, since: 'vs previous 30 days'
      }
    ];
  }

  private kpi(label: string, value: number, weekAgo: number, tone: string, icon: typeof Info, info: string): Kpi {
    const color = tone === 'blue' ? RA_COLORS.blue : tone === 'pink' ? RA_COLORS.pink : RA_COLORS.purple;
    return { label, value: String(value), delta: this.pct(value, weekAgo), up: value >= weekAgo, tone, icon, trend: [weekAgo, value], color, info, since: 'vs last week' };
  }

  private pct(now: number, before: number): string {
    if (!before) return now ? 'new' : '—';
    const p = ((now - before) / before) * 100;
    return `${p >= 0 ? '+' : ''}${Math.round(p)}%`;
  }

  // ----- Filters -----

  get owners(): string[] {
    return Array.from(new Set(this.service.jobs.map((j) => j.owner))).sort();
  }

  get filteredJobs(): ExportJob[] {
    const q = this.search.trim().toLowerCase();
    const since = this.lastRunFilter === '24h' ? Date.now() - DAY : this.lastRunFilter === '7d' ? Date.now() - 7 * DAY : 0;
    return this.service.jobs.filter((j) => {
      if (q && !`${j.name} ${j.module} ${j.owner} ${j.destination} ${j.format}`.toLowerCase().includes(q)) return false;
      if (this.formatFilter && j.format !== this.formatFilter) return false;
      if (this.statusFilter && j.status !== this.statusFilter) return false;
      if (this.ownerFilter && j.owner !== this.ownerFilter) return false;
      if (this.lastRunFilter === 'never') return !j.lastRun;
      if (since && (!j.lastRun || new Date(j.lastRun).getTime() < since)) return false;
      return true;
    });
  }

  get filtersActive(): boolean {
    return !!(this.search || this.formatFilter || this.statusFilter || this.ownerFilter || this.lastRunFilter);
  }

  clearFilters(): void {
    this.search = '';
    this.formatFilter = '';
    this.statusFilter = '';
    this.ownerFilter = '';
    this.lastRunFilter = '';
  }

  setTab(t: Tab): void {
    this.tab = t;
    if (t !== 'logs') this.logResource = '';
  }

  get searchPlaceholder(): string {
    if (this.tab === 'connections') return 'Search connections…';
    if (this.tab === 'datasets') return 'Search datasets…';
    if (this.tab === 'logs') return 'Search access logs…';
    return 'Search exports…';
  }

  get detailsConnection(): ApiConnection | null {
    return this.service.connections.find((c) => c.id === this.detailsId) ?? null;
  }

  get detailsJobs(): ExportJob[] {
    const c = this.detailsConnection;
    return c ? this.service.jobs.filter((j) => j.target === c.name) : [];
  }

  // ----- Export jobs -----

  runJob(job: ExportJob): void {
    const current = this.service.jobs.find((j) => j.id === job.id) ?? job;
    if (current.status === 'Running') return;
    this.notify(`“${job.name}” is running…`);
    this.service.runJob(current).subscribe({
      next: ({ job: done, run }) => {
        if (run.status === 'Failed') {
          this.notify(`“${done.name}” failed: ${run.error ?? done.lastError ?? 'unknown error'}`);
          return;
        }
        const rows = `${run.rowCount.toLocaleString('en-US')} row${run.rowCount === 1 ? '' : 's'}`;
        this.notify(`“${done.name}” generated (${rows}, ${formatBytes(run.sizeBytes)} ${done.format}); ${run.deliveryMessage ?? this.service.deliveryNote}. Use Download to get the file.`);
      },
      error: (err: Error) => this.notify(err.message)
    });
  }

  downloadJob(job: ExportJob): void {
    this.service.downloadJob(job).subscribe({
      next: (kind) => this.notify(kind === 'file' ? `Latest file of “${job.name}” downloaded.` : `Sample of “${job.name}” downloaded (25 rows, CSV).`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  editJob(job: ExportJob): void {
    this.withBuilder((b) => b.load(job));
    this.notify(`Editing “${job.name}” in the Export Builder.`);
  }

  pauseJob(job: ExportJob): void {
    this.service.pause(job).subscribe({
      next: () => this.notify(`“${job.name}” paused.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  resumeJob(job: ExportJob): void {
    this.service.resume(job).subscribe({
      next: () => this.notify(`“${job.name}” resumed.`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  askDeleteJob(job: ExportJob): void {
    this.confirm = {
      title: 'Delete export job?',
      message: `“${job.name}” and its schedule will be removed. Its run history and generated files are kept.`,
      run: () =>
        this.service.deleteJob(job).subscribe({
          next: () => {
            if (this.builder?.draft.id === job.id) this.builder.reset();
            this.notify(`“${job.name}” deleted.`);
          },
          error: (err: Error) => this.notify(err.message)
        })
    };
  }

  // ----- Export Builder -----

  createExport(datasetId?: string): void {
    this.withBuilder((b) => b.load(null, datasetId));
  }

  onDraftSaved(draft: ExportDraft): void {
    this.builder?.setBusy(true);
    this.service.saveJob(draft, 'Draft').subscribe({
      next: (job) => {
        this.builder?.setBusy(false);
        if (this.builder) this.builder.draft.id = job.id;
        this.highlightId = job.id;
        this.notify(`Draft “${job.name}” saved.`);
      },
      error: (err: Error) => {
        this.builder?.setBusy(false, err.message);
      }
    });
  }

  onRunRequested(draft: ExportDraft): void {
    this.builder?.setBusy(true);
    this.service.saveJob(draft, 'Scheduled').subscribe({
      next: (job) => {
        this.builder?.setBusy(false);
        this.builder?.reset();
        this.highlightId = job.id;
        this.runJob(job);
      },
      error: (err: Error) => {
        this.builder?.setBusy(false, err.message);
      }
    });
  }

  private withBuilder(fn: (b: ExportBuilder) => void): void {
    this.setTab('exports');
    if (this.uiTimer) clearTimeout(this.uiTimer);
    // The builder is only rendered on the Exports tab, so wait one tick after switching
    this.uiTimer = setTimeout(() => {
      if (!this.builder) return;
      fn(this.builder);
      this.builderEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ----- Connections -----

  testConnection(c: ApiConnection, announce?: (con: ApiConnection) => string): void {
    const current = this.service.connections.find((x) => x.id === c.id) ?? c;
    if (current.status === 'Testing') return;
    this.service.testConnection(current).subscribe({
      next: (con) => this.notify(announce ? announce(con) : `${con.name}: ${con.lastTestMessage ?? con.status}`),
      error: (err: Error) => this.notify(err.message)
    });
  }

  openConnection(c: ApiConnection): void {
    this.detailsId = c.id;
  }

  /** Certificates are renewed on the remote system; this re-checks the certificate it now presents. */
  rotateCertificate(c: ApiConnection): void {
    this.testConnection(c, (con) =>
      con.certExpiresInDays === null
        ? `${con.name}: certificate could not be read. ${con.lastTestMessage ?? ''}`
        : `${con.name} certificate re-checked: expires in ${con.certExpiresInDays} days. Renew it on the ${con.name} side if it is still close to expiry.`
    );
  }

  onConnectionSaved(name: string): void {
    this.showAddConnection = false;
    const con = this.service.connections.find((c) => c.name === name);
    this.notify(`${name} added and tested${con ? ` (${con.status})` : ''}. Only a masked form of the secret was stored.`);
  }

  askRemoveConnection(c: ApiConnection): void {
    const used = this.service.jobs.filter((j) => j.target === c.name).length;
    this.confirm = {
      title: 'Remove API connection?',
      message: used
        ? `${c.name} is used by ${used} export job${used > 1 ? 's' : ''}; edit them to choose another connection.`
        : `${c.name} will be removed together with its stored (masked) secret.`,
      run: () =>
        this.service.deleteConnection(c).subscribe({
          next: () => {
            if (this.detailsId === c.id) this.detailsId = '';
            this.notify(`${c.name} removed.`);
          },
          error: (err: Error) => this.notify(err.message)
        })
    };
  }

  // ----- Insights & tabs -----

  onInsight(e: InsightEvent): void {
    switch (e.action) {
      case 'retry':
        for (const j of e.jobs) this.runJob(j);
        break;
      case 'rotate':
        if (e.connection) this.rotateCertificate(e.connection);
        break;
      case 'logs':
        this.tab = 'logs';
        this.logResource = e.resource;
        break;
      case 'open':
        if (e.connection) this.openConnection(e.connection);
        break;
    }
  }

  onDatasetExport(d: Dataset): void {
    this.createExport(d.id);
  }

  onDatasetDownloaded(name: string): void {
    this.notify(`Sample of ${name} downloaded (25 rows, CSV).`);
  }

  onConfirm(): void {
    const c = this.confirm;
    this.confirm = null;
    c?.run();
  }

  override ngOnDestroy(): void {
    clearInterval(this.clock);
    if (this.uiTimer) clearTimeout(this.uiTimer);
    super.ngOnDestroy();
  }
}
