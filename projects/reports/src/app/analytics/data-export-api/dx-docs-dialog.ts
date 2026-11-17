import { Component, EventEmitter, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from 'shared-ui';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  text: string;
}

/** Quick reference for the Data Export API (/api/data-export on the Asset360 gateway). */
@Component({
  standalone: true,
  selector: 'dx-docs-dialog',
  imports: [RouterLink],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <div class="overlay" (click)="closed.emit()">
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="dx-docs-title" (click)="$event.stopPropagation()">
        <h2 id="dx-docs-title">Data Export API — Documentation</h2>
        <p>
          The endpoints below are served by the Asset360 gateway under <code class="dx-mono">{{ baseUrl }}</code>. Calls carry the
          <code class="dx-mono">Authorization: Bearer &lt;token&gt;</code> header of the signed-in user, plus
          <code class="dx-mono">tenantId</code> / <code class="dx-mono">clientId</code>.
        </p>
        <table class="table dx-docs">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            @for (e of endpoints; track e.method + e.path) {
              <tr>
                <td><span class="pill" [attr.data-tone]="e.method === 'GET' ? 'green' : e.method === 'DELETE' ? 'red' : 'blue'">{{ e.method }}</span></td>
                <td class="dx-mono">{{ e.path }}</td>
                <td>{{ e.text }}</td>
              </tr>
            }
          </tbody>
        </table>
        <h3 class="dx-h3">Example</h3>
        <pre class="dx-code">{{ example }}</pre>
        <p class="muted dx-small">
          Formats: csv, xlsx, json. A run reads at most 100,000 rows and keeps files up to 12 MB. Times are shown in Asia/Dubai.
          Delivery to S3, SFTP, e-mail or an API connection is not configured yet: runs report “not delivered: no transport configured”
          and the generated file is downloaded from <code class="dx-mono">/runs/{{ '{' }}runId{{ '}' }}/file</code>.
          API keys and IP allowlists are managed in
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

  readonly baseUrl = `${environment.reportAnalyticsApiUrl}api/data-export`;

  readonly endpoints: Endpoint[] = [
    { method: 'GET', path: '/datasets', text: 'Datasets with their fields, row count, size and newest record.' },
    { method: 'GET', path: '/datasets/{id}/preview?rows=10', text: 'Newest rows of a dataset (JSON).' },
    { method: 'GET', path: '/datasets/{id}/sample?rows=25', text: 'Sample rows as CSV.' },
    { method: 'GET', path: '/jobs', text: 'Export jobs and their last run.' },
    { method: 'POST', path: '/jobs', text: 'Create an export job (dataset, fields, filters, format, delivery, schedule).' },
    { method: 'PUT', path: '/jobs/{id}', text: 'Update an export job.' },
    { method: 'POST', path: '/jobs/{id}/run', text: 'Run now: generates the file and records the run.' },
    { method: 'GET', path: '/runs/{runId}/file', text: 'Download the file a run generated.' },
    { method: 'GET', path: '/stats?days=7', text: 'Successful / failed runs per day (7 or 30 days).' },
    { method: 'GET', path: '/connections', text: 'API connections (secrets are masked).' },
    { method: 'POST', path: '/connections/{id}/test', text: 'Test a connection over HTTPS and read its certificate.' },
    { method: 'GET', path: '/access-logs', text: 'Who ran, downloaded or changed what.' },
    { method: 'DELETE', path: '/jobs/{id}', text: 'Delete an export job (run history is kept).' }
  ];

  readonly example = [
    'curl -X POST -H "Authorization: Bearer $ASSET360_TOKEN" \\',
    `  "${this.baseUrl}/jobs/EXP-0001/run?tenantId=${environment.tenantId}&clientId=${environment.clientId}"`,
    '',
    '# 200 OK  { "job": { … "status": "Success" }, "run": { "id": "RUN-000001", "rowCount": 244,',
    '#   "hasFile": true, "deliveryMessage": "not delivered: no transport configured" } }'
  ].join('\n');
}
