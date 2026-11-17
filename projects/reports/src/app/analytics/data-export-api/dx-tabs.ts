import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Download, Eye, LucideAngularModule, Play, Plus } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { formatBytes } from './data-export-api.data';
import { AccessLog, ApiConnection, Dataset, DatasetSample, LogResult } from './data-export-api.model';
import { DataExportService } from './data-export-api.service';
import { CONNECTION_TONES, MODULE_TONES, formatStamp } from './dx-format';

/** API Connections tab: every reporting connection with test / open / remove. */
@Component({
  standalone: true,
  selector: 'dx-connections-tab',
  imports: [LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>API Connections <span class="muted">({{ rows.length }})</span></h2>
        <button type="button" class="btn btn--sm btn--primary" (click)="add.emit()">
          <lucide-icon [img]="icons.Plus" [size]="13"></lucide-icon> Add API Connection
        </button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Connection</th><th>Type</th><th>Base URL</th><th>Authentication</th><th>Secret</th><th>Status</th>
              <th>Uptime</th><th>Certificate</th><th>Last tested</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (c of rows; track c.id) {
              <tr>
                <td><button type="button" class="link" (click)="open.emit(c)">{{ c.name }}</button></td>
                <td>{{ c.type }}</td>
                <td class="dx-mono">{{ c.baseUrl }}</td>
                <td>{{ c.auth }}</td>
                <td class="dx-mono">{{ c.secretStored ? (c.secretMask || '••••••••') : '—' }}</td>
                <td><span class="pill" [attr.data-tone]="tone(c)"><i></i>{{ c.status }}</span></td>
                <td class="dx-uptime" [title]="c.uptime === null ? 'Not tested in the last 30 days' : 'Successful tests, last 30 days'">
                  <span class="meter"><i [style.width.%]="c.uptime ?? 0" [style.background]="meterColor(c)"></i></span>{{ c.uptime === null ? '—' : c.uptime + '%' }}
                </td>
                <td [class.dx-warn]="c.certExpiresInDays !== null && c.certExpiresInDays <= 30">{{ c.certExpiresInDays === null ? '—' : c.certExpiresInDays + ' days' }}</td>
                <td>{{ stamp(c.lastTested) }}</td>
                <td>
                  <span class="dx-actions">
                    <button type="button" class="btn btn--sm" [disabled]="c.status === 'Testing'" (click)="test.emit(c)">Test</button>
                    <button type="button" class="btn btn--sm btn--link" (click)="remove.emit(c)">Remove</button>
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="10" class="empty">No connections match “{{ search }}”.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted dx-small">Secrets are write-only: only a masked form is stored. Test calls the base URL over HTTPS without credentials and reads its certificate.</p>
    </section>
  `
})
export class ConnectionsTab {
  private readonly service = inject(DataExportService);
  @Input() search = '';
  @Output() add = new EventEmitter<void>();
  @Output() test = new EventEmitter<ApiConnection>();
  @Output() open = new EventEmitter<ApiConnection>();
  @Output() remove = new EventEmitter<ApiConnection>();

  readonly icons = { Plus };

  get rows(): ApiConnection[] {
    const q = this.search.trim().toLowerCase();
    return this.service.connections.filter((c) => !q || `${c.name} ${c.type} ${c.baseUrl} ${c.auth}`.toLowerCase().includes(q));
  }

  tone(c: ApiConnection): string {
    return CONNECTION_TONES[c.status];
  }

  meterColor(c: ApiConnection): string {
    const u = c.uptime ?? 0;
    return u >= 99 ? '#10b981' : u >= 95 ? '#f59e0b' : '#ef4444';
  }

  stamp(s: string | null): string {
    return formatStamp(s);
  }
}

/** Datasets tab: the data feeds that exports and the reporting API read from. */
@Component({
  standalone: true,
  selector: 'dx-datasets-tab',
  imports: [LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>Datasets <span class="muted">({{ rows.length }})</span></h2>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Dataset</th><th>Modules</th><th class="num">Fields</th><th class="num">Rows</th><th class="num">Size</th>
              <th>Refreshed</th><th>Owner</th><th class="num">Exports</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (d of rows; track d.id) {
              <tr>
                <td><strong>{{ d.name }}</strong><br /><small class="muted">{{ d.id }}</small></td>
                <td>
                  <span class="dx-pills">
                    @for (m of d.modules; track m) {
                      <span class="pill" [attr.data-tone]="moduleTone(m)">{{ m }}</span>
                    }
                  </span>
                </td>
                <td class="num">{{ fieldCount(d) }}</td>
                <td class="num">{{ d.rows.toLocaleString('en-US') }}</td>
                <td class="num">{{ size(d) }}</td>
                <td>{{ stamp(d.refreshed) }}</td>
                <td>{{ d.owner }}</td>
                <td class="num">{{ exportCount(d) }}</td>
                <td>
                  <span class="dx-actions">
                    <button type="button" class="icon-btn" (click)="openPreview(d)" [attr.aria-label]="'Preview ' + d.name" title="Preview sample">
                      <lucide-icon [img]="icons.Eye" [size]="15"></lucide-icon>
                    </button>
                    <button type="button" class="icon-btn" [disabled]="downloading === d.id" (click)="download(d)" [attr.aria-label]="'Download sample of ' + d.name" title="Download sample (CSV)">
                      <lucide-icon [img]="icons.Download" [size]="15"></lucide-icon>
                    </button>
                    <button type="button" class="btn btn--sm btn--outline" (click)="createExport.emit(d)">
                      <lucide-icon [img]="icons.Play" [size]="12"></lucide-icon> Create export
                    </button>
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty">No datasets match “{{ search }}”.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (preview) {
      <div class="overlay" (click)="preview = null">
        <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="dx-prev-title" (click)="$event.stopPropagation()">
          <h2 id="dx-prev-title">{{ preview.name }} — sample rows</h2>
          @if (sampleLoading) {
            <p class="muted">Loading the newest rows…</p>
          } @else if (sampleError) {
            <p class="dx-error">{{ sampleError }}</p>
          } @else if (!sample.rows.length) {
            <p class="muted">{{ preview.name }} has no records for this client yet.</p>
          } @else {
            <p class="muted">Newest {{ sample.rows.length }} of {{ sample.totalRows.toLocaleString('en-US') }} rows, live from {{ preview.owner }}.</p>
          }
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  @for (h of sample.header; track h) {
                    <th>{{ h }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of sample.rows; track $index) {
                  <tr>
                    @for (c of r; track $index) {
                      <td>{{ c ?? '—' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="dialog__actions">
            <button type="button" class="btn" [disabled]="downloading === preview.id" (click)="download(preview)">Download CSV</button>
            <button type="button" class="btn btn--primary" (click)="preview = null">Close</button>
          </div>
        </div>
      </div>
    }
  `
})
export class DatasetsTab {
  private readonly service = inject(DataExportService);
  @Input() search = '';
  @Output() createExport = new EventEmitter<Dataset>();
  @Output() downloaded = new EventEmitter<string>();

  readonly icons = { Eye, Download, Play };
  preview: Dataset | null = null;
  sample: DatasetSample = { header: [], rows: [], totalRows: 0 };
  sampleLoading = false;
  sampleError = '';
  downloading = '';
  private previewSub?: Subscription;

  get rows(): Dataset[] {
    const q = this.search.trim().toLowerCase();
    return this.service.datasets.filter((d) => !q || `${d.name} ${d.modules.join(' ')} ${d.owner}`.toLowerCase().includes(q));
  }

  /** GET /datasets/{id}/preview: the newest 10 rows. */
  openPreview(d: Dataset): void {
    this.preview = d;
    this.sample = { header: d.fields.map((f) => f.name), rows: [], totalRows: d.rows };
    this.sampleError = '';
    this.sampleLoading = true;
    this.previewSub?.unsubscribe();
    this.previewSub = this.service.preview(d.id, 10).subscribe({
      next: (s) => {
        this.sample = s;
        this.sampleLoading = false;
      },
      error: (err: Error) => {
        this.sampleError = err.message;
        this.sampleLoading = false;
      }
    });
  }

  fieldCount(d: Dataset): number {
    return d.fields.length;
  }

  exportCount(d: Dataset): number {
    return this.service.jobs.filter((j) => j.datasetId === d.id).length;
  }

  size(d: Dataset): string {
    return formatBytes(d.sizeBytes);
  }

  moduleTone(m: string): string {
    return MODULE_TONES[m] ?? 'grey';
  }

  stamp(s: string | null): string {
    return formatStamp(s);
  }

  download(d: Dataset): void {
    this.downloading = d.id;
    this.service.downloadDatasetSample(d, 25).subscribe({
      next: () => {
        this.downloading = '';
        this.downloaded.emit(d.name);
      },
      error: (err: Error) => {
        this.downloading = '';
        this.sampleError = err.message;
      }
    });
  }
}

const LOG_PAGE = 15;

/** Access Logs tab: who called the reporting API or received an export. */
@Component({
  standalone: true,
  selector: 'dx-access-logs-tab',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>Access Logs <span class="muted">({{ filtered.length }})</span></h2>
        @if (resource) {
          <span class="pill" data-tone="purple">{{ resource }}
            <button type="button" class="dx-chip-x" (click)="clearResource()" aria-label="Clear resource filter">×</button>
          </span>
        }
        <select class="select dx-select-sm" [(ngModel)]="result" (ngModelChange)="page = 0" aria-label="Result">
          <option value="">All results</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
          <option value="Denied">Denied</option>
        </select>
        <button type="button" class="btn btn--sm" [disabled]="exporting" (click)="exportCsv()">
          <lucide-icon [img]="icons.Download" [size]="13"></lucide-icon> Export CSV
        </button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Time (GST)</th><th>Actor</th><th>Action</th><th>Resource</th><th>Client / destination</th><th>IP address</th><th>Result</th></tr>
          </thead>
          <tbody>
            @for (l of pageRows; track l.id) {
              <tr>
                <td>{{ stamp(l.at) }}</td>
                <td>{{ l.actor }}</td>
                <td>{{ l.action }}</td>
                <td>{{ l.resource }}</td>
                <td>{{ l.client }}</td>
                <td class="dx-mono">{{ l.ip }}</td>
                <td><span class="pill" [attr.data-tone]="tone(l.result)"><i></i>{{ l.result }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No log entries match the filters.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (pages > 1) {
        <div class="dx-pager">
          <button type="button" class="btn btn--sm" [disabled]="page === 0" (click)="page = page - 1">Previous</button>
          <span class="muted">Page {{ page + 1 }} of {{ pages }}</span>
          <button type="button" class="btn btn--sm" [disabled]="page >= pages - 1" (click)="page = page + 1">Next</button>
        </div>
      }
      @if (exportError) {
        <p class="dx-error">{{ exportError }}</p>
      }
      @if (service.logsTotal > service.logs.length) {
        <p class="muted dx-small">Showing the latest {{ service.logs.length }} of {{ service.logsTotal }} entries; Export CSV includes every match.</p>
      }
      <p class="muted dx-small">Reporting data access only. The full system audit trail is in Administration › System Audit Log.</p>
    </section>
  `
})
export class AccessLogsTab {
  readonly service = inject(DataExportService);
  @Input() search = '';
  /** Pre-filter from "View logs" on an insight */
  @Input() resource = '';
  @Output() resourceCleared = new EventEmitter<void>();

  readonly icons = { Download };
  result: '' | LogResult = '';
  page = 0;
  exporting = false;
  exportError = '';

  get filtered(): AccessLog[] {
    const q = this.search.trim().toLowerCase();
    return this.service.logs.filter(
      (l) =>
        (!this.result || l.result === this.result) &&
        (!this.resource || l.resource === this.resource) &&
        (!q || `${l.actor} ${l.action} ${l.resource} ${l.client} ${l.ip}`.toLowerCase().includes(q))
    );
  }

  get pages(): number {
    return Math.max(1, Math.ceil(this.filtered.length / LOG_PAGE));
  }

  get pageRows(): AccessLog[] {
    const p = Math.min(this.page, this.pages - 1);
    return this.filtered.slice(p * LOG_PAGE, p * LOG_PAGE + LOG_PAGE);
  }

  tone(r: LogResult): string {
    return r === 'Success' ? 'green' : r === 'Denied' ? 'orange' : 'red';
  }

  stamp(s: string): string {
    return formatStamp(s);
  }

  clearResource(): void {
    this.page = 0;
    this.resourceCleared.emit();
  }

  /** GET /export?section=access-logs with the same search / result / resource filters. */
  exportCsv(): void {
    this.exporting = true;
    this.exportError = '';
    this.service.exportLogs({ search: this.search, result: this.result, resource: this.resource }).subscribe({
      next: () => (this.exporting = false),
      error: (err: Error) => {
        this.exporting = false;
        this.exportError = err.message;
      }
    });
  }
}
