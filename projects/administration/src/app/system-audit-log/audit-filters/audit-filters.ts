import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Calendar, LucideAngularModule, Search } from 'lucide-angular';
import { AuditFilters, AuditOutcome, AuditSeverity, SavedAuditFilter } from '../audit-log.model';
import { emptyFilters } from '../audit-log.service';

const IP_PREFIX = /^[0-9.]*$/;

/** Filter panel above the audit table; edits a draft until Apply Filters. */
@Component({
  selector: 'app-adm-audit-filters',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../../shared/admin-workspace.css', '../system-audit-log.css'],
  template: `
    <form class="panel filters" (ngSubmit)="apply()" novalidate>
      <div class="filters__grid">
        <div class="field" [class.invalid]="rangeError">
          <span>Date Range</span>
          <div class="range">
            <lucide-icon [img]="icons.Calendar" [size]="15"></lucide-icon>
            <input type="date" name="from" [(ngModel)]="draft.from" aria-label="From date" />
            <span>–</span>
            <input type="date" name="to" [(ngModel)]="draft.to" aria-label="To date" />
          </div>
          @if (rangeError) { <small>{{ rangeError }}</small> }
        </div>
        <div class="field">
          <label for="f-type">Event Type</label>
          <select id="f-type" name="eventType" [(ngModel)]="draft.eventType">
            <option value="">Select Event Type</option>
            @for (t of eventTypes; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="f-module">Module</label>
          <select id="f-module" name="module" [(ngModel)]="draft.module">
            <option value="">Select Module</option>
            @for (m of modules; track m) { <option [value]="m">{{ m }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="f-user">User</label>
          <select id="f-user" name="user" [(ngModel)]="draft.user">
            <option value="">Select User</option>
            @for (u of users; track u) { <option [value]="u">{{ u }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="f-sev">Severity</label>
          <select id="f-sev" name="severity" [(ngModel)]="draft.severity">
            <option value="">Select Severity</option>
            @for (s of severities; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </div>
        <div class="field" [class.invalid]="ipError">
          <label for="f-ip">IP Address</label>
          <input id="f-ip" name="ip" [(ngModel)]="draft.ip" placeholder="e.g. 10.20.4.18" maxlength="15" />
          @if (ipError) { <small>{{ ipError }}</small> }
        </div>
        <div class="field">
          <label for="f-out">Outcome</label>
          <select id="f-out" name="outcome" [(ngModel)]="draft.outcome">
            <option value="">Select Outcome</option>
            @for (o of outcomes; track o) { <option [value]="o">{{ o }}</option> }
          </select>
        </div>
        <div class="filters__actions">
          <button type="button" class="btn btn--outline" (click)="clear()">Clear Filters</button>
          <button type="submit" class="btn btn--primary"><lucide-icon [img]="icons.Search" [size]="15"></lucide-icon> Apply Filters</button>
        </div>
      </div>
      @if (saved.length) {
        <div class="filters__saved">
          <label for="f-saved">Saved filters</label>
          <select id="f-saved" class="select select--sm" name="saved" [ngModel]="''" (ngModelChange)="useSaved($event)">
            <option value="">Select Saved Filter</option>
            @for (s of saved; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
          </select>
        </div>
      }
    </form>
  `
})
export class AuditFiltersPanel implements OnChanges {
  @Input({ required: true }) filters!: AuditFilters;
  @Input() eventTypes: string[] = [];
  @Input() modules: string[] = [];
  @Input() users: string[] = [];
  @Input() saved: readonly SavedAuditFilter[] = [];
  @Output() applied = new EventEmitter<AuditFilters>();
  @Output() savedChosen = new EventEmitter<SavedAuditFilter>();

  readonly icons = { Calendar, Search };
  readonly severities: AuditSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
  readonly outcomes: AuditOutcome[] = ['Success', 'Failed', 'Blocked'];
  draft: AuditFilters = emptyFilters();
  rangeError = '';
  ipError = '';

  ngOnChanges(): void {
    this.draft = { ...this.filters };
    this.rangeError = '';
    this.ipError = '';
  }

  /** Current draft, so Save Filter can store what the user sees. */
  current(): AuditFilters {
    return { ...this.draft };
  }

  apply(): void {
    this.rangeError = this.draft.from && this.draft.to && this.draft.from > this.draft.to ? 'Start date must be before end date.' : '';
    this.ipError = IP_PREFIX.test(this.draft.ip.trim()) ? '' : 'Use digits and dots only (prefix match).';
    if (this.rangeError || this.ipError) return;
    this.applied.emit({ ...this.draft, ip: this.draft.ip.trim() });
  }

  clear(): void {
    this.draft = emptyFilters();
    this.rangeError = '';
    this.ipError = '';
    this.applied.emit(emptyFilters());
  }

  useSaved(name: string): void {
    const s = this.saved.find((x) => x.name === name);
    if (s) this.savedChosen.emit(s);
  }
}
