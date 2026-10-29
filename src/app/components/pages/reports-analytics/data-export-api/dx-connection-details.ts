import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExternalLink, LucideAngularModule } from 'lucide-angular';
import { ApiConnection, ExportJob } from './data-export-api.model';
import { CONNECTION_TONES, formatStamp } from './dx-format';

/** Read-only view of a connection. Secrets are shown masked only; credentials are managed in Administration. */
@Component({
  standalone: true,
  selector: 'dx-connection-details',
  imports: [RouterLink, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <div class="overlay" (click)="closed.emit()">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dx-cd-title" (click)="$event.stopPropagation()">
        <h2 id="dx-cd-title">{{ connection.name }}</h2>
        <span class="pill" [attr.data-tone]="tone"><i></i>{{ connection.status }}</span>
        <dl class="dx-dl">
          <dt>Type</dt><dd>{{ connection.type }}</dd>
          <dt>Base URL</dt><dd class="dx-mono">{{ connection.baseUrl }}</dd>
          <dt>Authentication</dt><dd>{{ connection.auth }}</dd>
          <dt>Secret</dt><dd class="dx-mono">{{ connection.secretStored ? '•••••••••••• (stored in vault)' : 'Not set' }}</dd>
          <dt>Certificate</dt>
          <dd [class.dx-warn]="connection.certExpiresInDays <= 30">Expires in {{ connection.certExpiresInDays }} days</dd>
          <dt>Uptime (30 days)</dt><dd>{{ connection.uptime }}%</dd>
          @if (connection.syncDelayMin > 0) {
            <dt>Sync delay</dt><dd class="dx-warn">{{ connection.syncDelayMin }} minutes behind</dd>
          }
          <dt>Last tested</dt><dd>{{ stamp(connection.lastTested) }}</dd>
          <dt>Owner</dt><dd>{{ connection.owner }}</dd>
          <dt>Feeds using it</dt>
          <dd>
            @for (j of jobs; track j.id; let last = $last) {
              {{ j.name }}{{ last ? '' : ', ' }}
            } @empty {
              None
            }
          </dd>
        </dl>
        <p class="muted dx-small">Credentials, API keys and certificates are managed in Administration › Integration &amp; API.</p>
        <div class="dialog__actions">
          <a class="btn" routerLink="/administration/integration-api">
            Manage credentials <lucide-icon [img]="icons.ExternalLink" [size]="13"></lucide-icon>
          </a>
          @if (connection.certExpiresInDays <= 30) {
            <button type="button" class="btn btn--outline" (click)="rotate.emit(connection)">Rotate certificate</button>
          }
          <button type="button" class="btn btn--outline" [disabled]="connection.status === 'Testing'" (click)="test.emit(connection)">
            {{ connection.status === 'Testing' ? 'Testing…' : 'Test connection' }}
          </button>
          <button type="button" class="btn btn--primary" (click)="closed.emit()">Close</button>
        </div>
      </div>
    </div>
  `
})
export class ConnectionDetails {
  @Input({ required: true }) connection!: ApiConnection;
  @Input() jobs: ExportJob[] = [];
  @Output() test = new EventEmitter<ApiConnection>();
  @Output() rotate = new EventEmitter<ApiConnection>();
  @Output() closed = new EventEmitter<void>();

  readonly icons = { ExternalLink };

  get tone(): string {
    return CONNECTION_TONES[this.connection.status];
  }

  stamp(s: string): string {
    return formatStamp(s);
  }
}
