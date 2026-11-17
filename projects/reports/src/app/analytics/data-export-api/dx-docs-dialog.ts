import { Component, EventEmitter, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  text: string;
}

/** Reporting API quick reference (DEMO MODE text; the real reference ships with the reporting API). */
@Component({
  standalone: true,
  selector: 'dx-docs-dialog',
  imports: [RouterLink],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <div class="overlay" (click)="closed.emit()">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="dx-docs-title" (click)="$event.stopPropagation()">
        <h2 id="dx-docs-title">Reporting API &amp; Data Export — Documentation</h2>
        <p>
          DEMO MODE: endpoints below describe the planned Asset360 reporting API. Base URL
          <code class="dx-mono">https://api.asset360.purpleiq.com</code>. All calls use HTTPS and an
          <code class="dx-mono">Authorization: Bearer &lt;token&gt;</code> header — never put keys in the URL.
        </p>
        <table class="table dx-docs">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            @for (e of endpoints; track e.path) {
              <tr>
                <td><span class="pill" [attr.data-tone]="e.method === 'GET' ? 'green' : 'blue'">{{ e.method }}</span></td>
                <td class="dx-mono">{{ e.path }}</td>
                <td>{{ e.text }}</td>
              </tr>
            }
          </tbody>
        </table>
        <h3 class="dx-h3">Example</h3>
        <pre class="dx-code">{{ example }}</pre>
        <p class="muted dx-small">
          Formats: csv, xlsx, json, parquet. Responses are paginated (<code class="dx-mono">?page=1&amp;pageSize=500</code>), times are
          ISO 8601 in Asia/Dubai, amounts in AED. Rate limit: 600 requests/minute per key.
          API keys, IP allowlist and roles are managed in
          <a class="link" routerLink="/administration/integration-api" (click)="closed.emit()">Administration › Integration &amp; API</a>.
        </p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--primary" (click)="closed.emit()">Close</button>
        </div>
      </div>
    </div>
  `
})
export class DocsDialog {
  @Output() closed = new EventEmitter<void>();

  readonly endpoints: Endpoint[] = [
    { method: 'GET', path: '/api/v1/reports', text: 'List standard and custom reports you can access.' },
    { method: 'GET', path: '/api/v1/reports/{id}/export?format=csv', text: 'Download a report in csv, xlsx, json or parquet.' },
    { method: 'GET', path: '/api/v1/datasets', text: 'List datasets with their fields and refresh time.' },
    { method: 'GET', path: '/api/v1/datasets/{id}/rows?updatedSince=2026-10-01T00:00:00+04:00', text: 'Incremental rows for a dataset.' },
    { method: 'GET', path: '/api/v1/exports', text: 'List export jobs and their last run.' },
    { method: 'POST', path: '/api/v1/exports/{id}/run', text: 'Start an export job now; returns a run ID.' },
    { method: 'GET', path: '/api/v1/exports/{id}/runs/{runId}', text: 'Run status and download link (valid 15 minutes).' }
  ];

  readonly example = [
    'curl -H "Authorization: Bearer $ASSET360_TOKEN" \\',
    '  "https://api.asset360.purpleiq.com/api/v1/reports/RPT-0012/export?format=csv" \\',
    '  -o asset-register.csv',
    '',
    '# 200 OK  Content-Type: text/csv',
    '# "Asset ID","Asset Name","Category","Location",…',
    '# "AST-2026-DXB-000241","Forklift FL-12","Vehicles","Dubai HQ",…'
  ].join('\n');
}
