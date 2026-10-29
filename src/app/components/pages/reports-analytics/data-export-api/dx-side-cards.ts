import { Component, EventEmitter, Output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CalendarClock, ChartColumn, ChevronRight, CircleCheck, CircleX, Database, FileText, Info, KeyRound, Layers, LucideAngularModule, Plug,
  ScrollText, Shield, TriangleAlert, Users
} from 'lucide-angular';
import { ApiConnection, ExportJob } from './data-export-api.model';
import { DataExportService } from './data-export-api.service';
import { formatStamp } from './dx-format';

/** Integration Status: health of each part of the data delivery pipeline. */
@Component({
  standalone: true,
  selector: 'dx-integration-status',
  imports: [LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>Integration Status <lucide-icon class="widget__info" [img]="icons.Info" [size]="14" title="Computed from the latest runs and connection tests"></lucide-icon></h2>
      </div>
      <ul class="dx-status-list">
        @for (r of rows; track r.label) {
          <li>
            <lucide-icon [img]="r.icon" [size]="15"></lucide-icon>
            <span>{{ r.label }}</span>
            <span class="pill" [attr.data-tone]="r.ok ? 'green' : 'orange'"><i></i>{{ r.ok ? 'Operational' : 'Degraded' }}</span>
          </li>
        }
      </ul>
    </section>
  `
})
export class IntegrationStatusCard {
  private readonly service = inject(DataExportService);
  readonly icons = { Info };

  get rows(): { label: string; icon: typeof Info; ok: boolean }[] {
    const jobs = this.service.jobs;
    const cons = this.service.connections;
    return [
      { label: 'Exports', icon: FileText, ok: !jobs.some((j) => j.status === 'Failed') },
      { label: 'API Connections', icon: Plug, ok: !cons.some((c) => c.status === 'Warning' || c.status === 'Disconnected') },
      { label: 'Scheduled Jobs', icon: CalendarClock, ok: true },
      { label: 'Data Delivery', icon: Database, ok: this.service.successRate >= 95 },
      { label: 'External Systems', icon: ChartColumn, ok: !cons.some((c) => c.status === 'Disconnected') },
      { label: 'Storage & Queues', icon: Layers, ok: true }
    ];
  }
}

/** Access & Security summary. Credentials themselves are managed in Administration. */
@Component({
  standalone: true,
  selector: 'dx-access-security',
  imports: [RouterLink, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>Access &amp; Security</h2>
        <a class="btn btn--link" routerLink="/administration/integration-api">Manage Access</a>
      </div>
      <ul class="dx-sec-list">
        <li>
          <span class="kpi__icon dx-icon-sm" data-tone="purple"><lucide-icon [img]="icons.KeyRound" [size]="16"></lucide-icon></span>
          <span><strong>API Keys</strong><small>{{ service.apiKeys }} active keys</small></span>
          <a class="btn btn--sm" routerLink="/administration/integration-api">View <lucide-icon [img]="icons.ChevronRight" [size]="13"></lucide-icon></a>
        </li>
        <li>
          <span class="kpi__icon dx-icon-sm" data-tone="blue"><lucide-icon [img]="icons.Shield" [size]="16"></lucide-icon></span>
          <span><strong>IP Allowlist</strong><small>{{ service.allowlistedIps }} allowed IPs</small></span>
          <a class="btn btn--sm" routerLink="/administration/integration-api">Manage <lucide-icon [img]="icons.ChevronRight" [size]="13"></lucide-icon></a>
        </li>
        <li>
          <span class="kpi__icon dx-icon-sm" data-tone="green"><lucide-icon [img]="icons.Users" [size]="16"></lucide-icon></span>
          <span><strong>Role-Based Access</strong><small>{{ service.roles }} roles configured</small></span>
          <a class="btn btn--sm" routerLink="/administration/integration-api">Manage <lucide-icon [img]="icons.ChevronRight" [size]="13"></lucide-icon></a>
        </li>
        <li>
          <span class="kpi__icon dx-icon-sm" data-tone="orange"><lucide-icon [img]="icons.ScrollText" [size]="16"></lucide-icon></span>
          <span><strong>Audit Logging</strong><small>Enabled</small></span>
          <a class="btn btn--sm" routerLink="/administration/system-audit-log">View Logs <lucide-icon [img]="icons.ChevronRight" [size]="13"></lucide-icon></a>
        </li>
      </ul>
    </section>
  `
})
export class AccessSecurityCard {
  readonly service = inject(DataExportService);
  readonly icons = { KeyRound, Shield, Users, ScrollText, ChevronRight };
}

export type InsightAction = 'retry' | 'rotate' | 'logs' | 'open';

export interface InsightEvent {
  action: InsightAction;
  jobs: ExportJob[];
  connection: ApiConnection | null;
  resource: string;
}

interface Insight {
  key: string;
  tone: 'red' | 'orange' | 'green';
  icon: typeof Info;
  title: string;
  text: string;
  label: string;
  event: InsightEvent;
}

/** Integration Insights: what needs attention, each with a one-click action. */
@Component({
  standalone: true,
  selector: 'dx-insights',
  imports: [LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>Integration Insights</h2>
        <button type="button" class="btn btn--link" (click)="viewAll.emit()">View all</button>
      </div>
      <div class="dx-insights">
        @for (i of insights; track i.key) {
          <div class="insight" [attr.data-tone]="i.tone">
            <div class="insight__head">
              <lucide-icon class="insight__icon" [img]="i.icon" [size]="18"></lucide-icon>
              <div>
                <h3>{{ i.title }}</h3>
                <p>{{ i.text }}</p>
              </div>
            </div>
            <div class="insight__actions">
              <button type="button" class="btn btn--sm btn--outline" (click)="act.emit(i.event)">{{ i.label }}</button>
            </div>
          </div>
        } @empty {
          <p class="empty">All exports and connections are healthy.</p>
        }
      </div>
    </section>
  `
})
export class IntegrationInsights {
  private readonly service = inject(DataExportService);
  @Output() act = new EventEmitter<InsightEvent>();
  @Output() viewAll = new EventEmitter<void>();

  get insights(): Insight[] {
    const out: Insight[] = [];
    const failed = this.service.jobs.filter((j) => j.status === 'Failed');
    if (failed.length) {
      out.push({
        key: 'failed', tone: 'red', icon: CircleX,
        title: `${failed.length} export job${failed.length > 1 ? 's' : ''} failed in the last 24 hours`,
        text: failed.map((j) => j.name).join(', '),
        label: failed.length > 1 ? 'Retry jobs' : 'Retry job',
        event: { action: 'retry', jobs: failed, connection: null, resource: '' }
      });
    }
    for (const c of this.service.connections) {
      if (c.certExpiresInDays <= 30) {
        out.push({
          key: 'cert-' + c.id, tone: 'orange', icon: TriangleAlert,
          title: `API connection certificate expires in ${c.certExpiresInDays} days`, text: c.name, label: 'Rotate certificate',
          event: { action: 'rotate', jobs: [], connection: c, resource: c.name }
        });
      }
      if (c.status === 'Disconnected') {
        out.push({
          key: 'down-' + c.id, tone: 'red', icon: CircleX,
          title: `${c.name} is disconnected`, text: `Last tested ${formatStamp(c.lastTested)}`, label: 'Open connection',
          event: { action: 'open', jobs: [], connection: c, resource: c.name }
        });
      } else if (c.syncDelayMin > 0) {
        out.push({
          key: 'delay-' + c.id, tone: 'orange', icon: TriangleAlert,
          title: `${c.name} sync delayed by ${c.syncDelayMin} minutes`, text: `Last sync: ${formatStamp(c.lastTested)}`, label: 'Open connection',
          event: { action: 'open', jobs: [], connection: c, resource: c.name }
        });
      }
    }
    const delivered = this.service.jobs
      .filter((j) => j.status === 'Success' && j.lastRun)
      .sort((a, b) => (b.lastRun ?? '').localeCompare(a.lastRun ?? ''))[0];
    if (delivered) {
      out.push({
        key: 'ok-' + delivered.id, tone: 'green', icon: CircleCheck,
        title: `${delivered.name} delivered successfully`, text: formatStamp(delivered.lastRun), label: 'View logs',
        event: { action: 'logs', jobs: [delivered], connection: null, resource: delivered.name }
      });
    }
    return out;
  }
}
