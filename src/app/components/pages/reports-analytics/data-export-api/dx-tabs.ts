import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Download, Eye, LucideAngularModule, Play, Plus } from 'lucide-angular';
import { downloadCsv } from '../shared/analytics-common';
import { AccessLog, ApiConnection, Dataset, LogResult } from './data-export-api.model';
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
                <td class="dx-mono">{{ c.secretStored ? '••••••••' : '—' }}</td>
                <td><span class="pill" [attr.data-tone]="tone(c)"><i></i>{{ c.status }}</span></td>
                <td class="dx-uptime"><span class="meter"><i [style.width.%]="c.uptime" [style.background]="meterColor(c)"></i></span>{{ c.uptime }}%</td>
                <td [class.dx-warn]="c.certExpiresInDays <= 30">{{ c.certExpiresInDays }} days</td>
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
      <p class="muted dx-small">Secrets are write-only. Rotate keys and certificates in Administration › Integration &amp; API.</p>
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
    return c.uptime >= 99 ? '#10b981' : c.uptime >= 95 ? '#f59e0b' : '#ef4444';
  }

  stamp(s: string): string {
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
                <td class="num">{{ d.sizeGb }} GB</td>
                <td>{{ stamp(d.refreshed) }}</td>
                <td>{{ d.owner }}</td>
                <td class="num">{{ exportCount(d) }}</td>
                <td>
                  <span class="dx-actions">
                    <button type="button" class="icon-btn" (click)="preview = d" [attr.aria-label]="'Preview ' + d.name" title="Preview sample">
                      <lucide-icon [img]="icons.Eye" [size]="15"></lucide-icon>
                    </button>
                    <button type="button" class="icon-btn" (click)="download(d)" [attr.aria-label]="'Download sample of ' + d.name" title="Download sample (CSV)">
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
          <p class="muted">First {{ sample.rows.length }} of {{ preview.rows.toLocaleString('en-US') }} rows. DEMO MODE sample data.</p>
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
                      <td>{{ c }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="dialog__actions">
            <button type="button" class="btn" (click)="download(preview)">Download CSV</button>
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
  private sampleFor: Dataset | null = null;
  private sampleCache: { header: string[]; rows: (string | number)[][] } = { header: [], rows: [] };

  get rows(): Dataset[] {
    const q = this.search.trim().toLowerCase();
    return this.service.datasets.filter((d) => !q || `${d.name} ${d.modules.join(' ')} ${d.owner}`.toLowerCase().includes(q));
  }

  get sample(): { header: string[]; rows: (string | number)[][] } {
    if (this.preview && this.preview !== this.sampleFor) {
      this.sampleFor = this.preview;
      this.sampleCache = this.service.sample(this.preview.id, null, 10);
    }
    return this.sampleCache;
  }

  fieldCount(d: Dataset): number {
    return this.service.fields(d.id).length;
  }

  exportCount(d: Dataset): number {
    return this.service.jobs.filter((j) => j.datasetId === d.id).length;
  }

  moduleTone(m: string): string {
    return MODULE_TONES[m] ?? 'grey';
  }

  stamp(s: string): string {
    return formatStamp(s);
  }

  download(d: Dataset): void {
    const s = this.service.sample(d.id, null, 25);
    downloadCsv(`${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-sample.csv`, s.header, s.rows);
    this.service.log('Sample downloaded', d.name, 'Web console');
    this.downloaded.emit(d.name);
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
        <button type="button" class="btn btn--sm" (click)="exportCsv()">
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
      <p class="muted dx-small">Reporting data access only. The full system audit trail is in Administration › System Audit Log.</p>
    </section>
  `
})
export class AccessLogsTab {
  private readonly service = inject(DataExportService);
  @Input() search = '';
  /** Pre-filter from "View logs" on an insight */
  @Input() resource = '';
  @Output() resourceCleared = new EventEmitter<void>();

  readonly icons = { Download };
  result: '' | LogResult = '';
  page = 0;

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

  exportCsv(): void {
    downloadCsv(
      'reporting-access-logs.csv',
      ['Time (GST)', 'Actor', 'Action', 'Resource', 'Client', 'IP address', 'Result'],
      this.filtered.map((l) => [l.at.replace('T', ' '), l.actor, l.action, l.resource, l.client, l.ip, l.result])
    );
  }
}
