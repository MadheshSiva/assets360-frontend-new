import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, BookOpen, Calendar, CircleCheck, CirclePlus, Database, FileText, Info, Link, LucideAngularModule, RefreshCw, Search,
  Share2
} from 'lucide-angular';
import { AnalyticsPage, downloadCsv } from '../shared/analytics-common';
import { RA_COLORS, Sparkline } from '../shared/charts';
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
}

interface Confirm {
  title: string;
  message: string;
  run: () => void;
}

const RUN_MS = 2400;
const TEST_MS = 1400;
const DAY = 86_400_000;

/** Reports & Analytics > Data Export / API: scheduled data feeds, reporting connections, datasets and access logs. */
@Component({
  standalone: true,
  selector: 'app-ra-data-export-api',
  imports: [
    FormsModule, RouterLink, LucideAngularModule, Sparkline, ExportJobsTable, ConnectionsPanel, ExportBuilder, DeliveryHealth,
    IntegrationStatusCard, AccessSecurityCard, IntegrationInsights, ConnectionsTab, DatasetsTab, AccessLogsTab, ConnectionDialog,
    ConnectionDetails, DocsDialog, ConfirmDialog
  ],
  templateUrl: './data-export-api.html',
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css']
})
export class DataExportApiPage extends AnalyticsPage implements OnDestroy {
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
  readonly formats: ExportFormat[] = ['CSV', 'XLSX', 'JSON', 'Parquet', 'API'];
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
  healthVersion = 0;

  private readonly runTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly testTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private uiTimer: ReturnType<typeof setTimeout> | null = null;

  // ----- Header figures -----

  get kpis(): Kpi[] {
    const s = this.service;
    const rate = s.successRate;
    return [
      this.kpi('Active Exports', s.activeExports, [5, 5, 6, 6, 6, 7, 7], 'purple', FileText, 'Export jobs that are not paused or drafts'),
      this.kpi('API Connections', s.connections.length, [3, 3, 4, 4, 4, 5, 5], 'blue', Link, 'Reporting systems connected to Asset360'),
      this.kpi('Scheduled Jobs', s.scheduledJobs, [4, 4, 5, 5, 5, 6, 6], 'pink', Calendar, 'Exports that run on a schedule'),
      {
        label: 'Successful Runs', value: `${rate.toFixed(1)}%`, delta: `${rate >= 95.1 ? '+' : ''}${(rate - 95.1).toFixed(1)} pts`,
        up: rate >= 95.1, tone: 'green', icon: CircleCheck, trend: [95.1, 95.8, 96, 95.6, 96.4, 96.9, 97.2, rate], color: RA_COLORS.green,
        info: 'Export runs that succeeded, last 30 days'
      },
      {
        label: 'Data Delivered', value: `${s.deliveredTb.toFixed(1)} TB`, delta: this.pct(s.deliveredTb, 4.3), up: true, tone: 'orange',
        icon: Database, trend: [3.9, 4, 4.2, 4.3, 4.4, 4.6, 4.7, s.deliveredTb], color: RA_COLORS.orange, info: 'Volume delivered by exports and the API, last 30 days'
      }
    ];
  }

  private kpi(label: string, value: number, history: number[], tone: string, icon: typeof Info, info: string): Kpi {
    const color = tone === 'blue' ? RA_COLORS.blue : tone === 'pink' ? RA_COLORS.pink : RA_COLORS.purple;
    return { label, value: String(value), delta: this.pct(value, history[0]), up: value >= history[0], tone, icon, trend: history.concat(value), color, info };
  }

  private pct(now: number, before: number): string {
    const p = before ? ((now - before) / before) * 100 : 0;
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
    if (this.runTimers.has(job.id) || job.status === 'Running') return;
    this.service.startRun(job);
    this.notify(`“${job.name}” is running…`);
    this.runTimers.set(
      job.id,
      setTimeout(() => {
        this.runTimers.delete(job.id);
        this.service.finishRun(job);
        this.healthVersion++;
        this.notify(job.status === 'Failed' ? `“${job.name}” failed: ${job.lastError}` : `“${job.name}” delivered to ${job.destination}.`);
      }, RUN_MS)
    );
  }

  downloadJob(job: ExportJob): void {
    const s = this.service.sample(job.datasetId, job.fields, 25);
    downloadCsv(`${this.slug(job.name)}-sample.csv`, s.header, s.rows);
    this.service.log('Sample downloaded', job.name, 'Web console');
    this.notify(`Sample of “${job.name}” downloaded (25 rows, CSV).`);
  }

  editJob(job: ExportJob): void {
    this.withBuilder((b) => b.load(job));
    this.notify(`Editing “${job.name}” in the Export Builder.`);
  }

  pauseJob(job: ExportJob): void {
    this.service.pause(job);
    this.notify(`“${job.name}” paused.`);
  }

  resumeJob(job: ExportJob): void {
    this.service.resume(job);
    this.notify(`“${job.name}” resumed.`);
  }

  askDeleteJob(job: ExportJob): void {
    this.confirm = {
      title: 'Delete export job?',
      message: `“${job.name}” and its schedule will be removed. Files already delivered to ${job.destination} are not affected.`,
      run: () => {
        const t = this.runTimers.get(job.id);
        if (t) clearTimeout(t);
        this.runTimers.delete(job.id);
        this.service.deleteJob(job);
        if (this.builder?.draft.id === job.id) this.builder.reset();
        this.notify(`“${job.name}” deleted.`);
      }
    };
  }

  // ----- Export Builder -----

  createExport(datasetId?: string): void {
    this.withBuilder((b) => b.load(null, datasetId));
  }

  onDraftSaved(draft: ExportDraft): void {
    const job = this.service.saveJob(draft, 'Draft');
    if (this.builder) this.builder.draft.id = job.id;
    this.highlightId = job.id;
    this.notify(`Draft “${job.name}” saved.`);
  }

  onRunRequested(draft: ExportDraft): void {
    const job = this.service.saveJob(draft, 'Scheduled');
    this.builder?.reset();
    this.highlightId = job.id;
    this.runJob(job);
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

  testConnection(c: ApiConnection): void {
    if (this.testTimers.has(c.id)) return;
    this.service.startTest(c);
    this.testTimers.set(
      c.id,
      setTimeout(() => {
        this.testTimers.delete(c.id);
        this.notify(this.service.finishTest(c));
      }, TEST_MS)
    );
  }

  openConnection(c: ApiConnection): void {
    this.detailsId = c.id;
  }

  rotateCertificate(c: ApiConnection): void {
    this.service.rotateCertificate(c);
    this.notify(`Certificate for ${c.name} rotated — valid for 365 days. (DEMO MODE)`);
  }

  onConnectionSaved(name: string): void {
    this.showAddConnection = false;
    this.notify(`${name} added. The secret was stored and is no longer shown.`);
  }

  askRemoveConnection(c: ApiConnection): void {
    const used = this.service.jobs.filter((j) => j.target === c.name).length;
    this.confirm = {
      title: 'Remove API connection?',
      message: used
        ? `${c.name} is used by ${used} export job${used > 1 ? 's' : ''}; they will fail until a new connection is chosen.`
        : `${c.name} will be disconnected and its stored secret revoked.`,
      run: () => {
        const t = this.testTimers.get(c.id);
        if (t) clearTimeout(t);
        this.testTimers.delete(c.id);
        if (this.detailsId === c.id) this.detailsId = '';
        this.service.deleteConnection(c);
        this.notify(`${c.name} removed.`);
      }
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

  private slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  override ngOnDestroy(): void {
    // Settle simulated runs and tests so nothing is left "Running" in the in-memory store
    for (const [id, t] of this.runTimers) {
      clearTimeout(t);
      const job = this.service.jobs.find((j) => j.id === id);
      if (job) this.service.finishRun(job);
    }
    for (const [id, t] of this.testTimers) {
      clearTimeout(t);
      const con = this.service.connections.find((c) => c.id === id);
      if (con) this.service.finishTest(con);
    }
    this.runTimers.clear();
    this.testTimers.clear();
    if (this.uiTimer) clearTimeout(this.uiTimer);
    super.ngOnDestroy();
  }
}
