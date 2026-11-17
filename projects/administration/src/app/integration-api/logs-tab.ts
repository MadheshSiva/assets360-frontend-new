import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search } from 'lucide-angular';
import { Integration, LogEntry, LogLevel } from './integration-api.data';
import { levelTone, stampLabel } from './integration-format';

const PAGE_SIZE = 10;

/** Logs tab: searchable, filterable activity log for the integration. */
@Component({
  standalone: true,
  selector: 'app-integration-logs-tab',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/admin-workspace.css', './integration-api.css'],
  template: `
    <section class="sub-panel">
      <div class="panel__head">
        <h3>Activity Log ({{ filtered().length }})</h3>
        <label class="search int-search-sm">
          <lucide-icon [img]="icons.Search" [size]="14"></lucide-icon>
          <input type="search" placeholder="Search logs..." aria-label="Search logs" [(ngModel)]="query" (ngModelChange)="page = 1" />
        </label>
        <select class="select int-select-sm" aria-label="Level" [(ngModel)]="level" (ngModelChange)="page = 1">
          <option value="">Select Level</option>
          @for (l of levels; track l) {
            <option [value]="l">{{ l }}</option>
          }
        </select>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Event</th>
              <th>Message</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            @for (l of pageRows(); track l.id) {
              <tr>
                <td class="int-nowrap">{{ stamp(l.at) }}</td>
                <td><span class="pill" [attr.data-tone]="tone(l)"><i></i> {{ l.level }}</span></td>
                <td><b>{{ l.event }}</b></td>
                <td>{{ l.message }}</td>
                <td class="muted">{{ l.actor }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="center muted">No log entries match.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (pages() > 1) {
        <div class="pager">
          <span>Page {{ page }} of {{ pages() }}</span>
          <div class="pager__pages">
            <button type="button" class="page-btn" [disabled]="page === 1" (click)="page = page - 1">‹</button>
            <button type="button" class="page-btn" [disabled]="page === pages()" (click)="page = page + 1">›</button>
          </div>
        </div>
      }
    </section>
  `
})
export class IntegrationLogsTab implements OnChanges {
  @Input({ required: true }) integration!: Integration;

  readonly icons = { Search };
  readonly levels: LogLevel[] = ['Info', 'Warning', 'Error'];
  query = '';
  level = '';
  page = 1;

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes['integration']?.previousValue as Integration | undefined;
    if (prev && prev.id !== this.integration.id) {
      this.query = '';
      this.level = '';
      this.page = 1;
    }
  }

  filtered(): LogEntry[] {
    const q = this.query.trim().toLowerCase();
    return this.integration.logs.filter(
      (l) =>
        (!this.level || l.level === this.level) &&
        (!q || l.event.toLowerCase().includes(q) || l.message.toLowerCase().includes(q) || l.actor.toLowerCase().includes(q))
    );
  }

  pages(): number {
    return Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE));
  }

  pageRows(): LogEntry[] {
    const page = Math.min(this.page, this.pages());
    return this.filtered().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  stamp(iso: string): string {
    return stampLabel(iso);
  }

  tone(l: LogEntry): string {
    return levelTone(l.level);
  }
}
