import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ArrowDown, ArrowUp, ArrowUpDown, LucideAngularModule } from 'lucide-angular';
import { ComplianceFinding, LEVEL_RANK, LEVEL_TONE, LocationRow, SCORE_TARGET } from './compliance-analytics.data';

type SortDir = 1 | -1;

function compare(a: string | number, b: string | number, dir: SortDir): number {
  return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * dir;
}

const SORT_ICONS = { ArrowDown, ArrowUp, ArrowUpDown };

type FindingKey = 'id' | 'requirement' | 'asset' | 'area' | 'severity' | 'due' | 'owner' | 'status';

/** Open Compliance Findings: sortable, most severe first. */
@Component({
  selector: 'app-ra-compliance-findings-table',
  imports: [LucideAngularModule],
  template: `
    @if (rows.length) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              @for (c of columns; track c.key) {
                <th [attr.aria-sort]="ariaSort(c.key)">
                  <button type="button" class="sort" (click)="sortBy(c.key)">{{ c.label }} <lucide-icon [img]="sortIcon(c.key)" [size]="12" /></button>
                </th>
              }
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (r of shown; track r.id; let i = $index) {
              <tr>
                <td class="muted">{{ i + 1 }}</td>
                <td><button type="button" class="link" (click)="view.emit(r)">{{ r.id }}</button></td>
                <td>{{ r.requirement }}<br /><span class="muted">{{ r.regulation }}</span></td>
                <td>{{ r.asset }} / {{ r.site }}</td>
                <td>{{ r.area }}</td>
                <td><span class="pill" [attr.data-tone]="tone(r)"><i></i>{{ r.severity }}</span></td>
                <td [class.ca-overdue]="r.dueInDays < 0">{{ r.due }}</td>
                <td>{{ r.owner }}</td>
                <td><span class="pill" [attr.data-tone]="r.status === 'Open' ? 'red' : 'blue'">{{ r.status }}</span></td>
                <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(r)">View</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows.length > limit) {
        <button type="button" class="btn btn--link ca-more" (click)="viewAll.emit()">View all {{ rows.length }} open findings</button>
      }
    } @else {
      <div class="empty">No open compliance findings for the current filters.</div>
    }
  `,
  styleUrls: ['../shared/analytics-page.css', './compliance-analytics.css']
})
export class ComplianceFindingsTable implements OnChanges {
  readonly icons = SORT_ICONS;
  readonly columns: { key: FindingKey; label: string }[] = [
    { key: 'id', label: 'Finding ID' },
    { key: 'requirement', label: 'Requirement' },
    { key: 'asset', label: 'Asset / Location' },
    { key: 'area', label: 'Area' },
    { key: 'severity', label: 'Severity' },
    { key: 'due', label: 'Due Date' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status' }
  ];

  @Input({ required: true }) rows: ComplianceFinding[] = [];
  @Input() limit = 8;
  @Output() view = new EventEmitter<ComplianceFinding>();
  @Output() viewAll = new EventEmitter<void>();

  sortKey: FindingKey = 'severity';
  sortDir: SortDir = -1;
  sorted: ComplianceFinding[] = [];

  get shown(): ComplianceFinding[] {
    return this.sorted.slice(0, this.limit);
  }

  ngOnChanges(): void {
    this.applySort();
  }

  sortBy(key: FindingKey): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'severity' ? -1 : 1;
    this.sortKey = key;
    this.applySort();
  }

  sortIcon(key: FindingKey) {
    return this.sortKey !== key ? SORT_ICONS.ArrowUpDown : this.sortDir === 1 ? SORT_ICONS.ArrowUp : SORT_ICONS.ArrowDown;
  }

  ariaSort(key: FindingKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  tone(r: ComplianceFinding): string {
    return LEVEL_TONE[r.severity];
  }

  private applySort(): void {
    const key = this.sortKey;
    const value = (r: ComplianceFinding): string | number =>
      key === 'severity' ? LEVEL_RANK[r.severity] * 1000 - r.dueInDays : key === 'due' ? r.dueInDays : key === 'asset' ? `${r.asset} ${r.site}` : r[key];
    this.sorted = [...this.rows].sort((a, b) => compare(value(a), value(b), this.sortDir));
  }
}

type LocationKey = 'site' | 'score' | 'openFindings' | 'expiring' | 'risk' | 'status';
const RISK_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** Regulatory Compliance by Location */
@Component({
  selector: 'app-ra-compliance-location-table',
  imports: [LucideAngularModule],
  template: `
    @if (rows.length) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              @for (c of columns; track c.key) {
                <th [class.num]="c.num" [attr.aria-sort]="ariaSort(c.key)">
                  <button type="button" class="sort" (click)="sortBy(c.key)">{{ c.label }} <lucide-icon [img]="sortIcon(c.key)" [size]="12" /></button>
                </th>
              }
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (r of sorted; track r.site; let i = $index) {
              <tr>
                <td class="muted">{{ i + 1 }}</td>
                <td>{{ r.site }}</td>
                <td class="num"><span class="score" [attr.data-tone]="scoreTone(r)">{{ r.score }}%</span></td>
                <td class="num">{{ r.openFindings }}</td>
                <td class="num">{{ r.expiring }}</td>
                <td><span class="pill" [attr.data-tone]="riskTone(r)">{{ r.risk }}</span></td>
                <td><span class="pill" [attr.data-tone]="r.status === 'Compliant' ? 'green' : 'orange'">{{ r.status }}</span></td>
                <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(r)">View</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty">No locations in the current filters.</div>
    }
  `,
  styleUrls: ['../shared/analytics-page.css']
})
export class ComplianceLocationTable implements OnChanges {
  readonly icons = SORT_ICONS;
  readonly columns: { key: LocationKey; label: string; num: boolean }[] = [
    { key: 'site', label: 'Location', num: false },
    { key: 'score', label: 'Score', num: true },
    { key: 'openFindings', label: 'Open Findings', num: true },
    { key: 'expiring', label: 'Expiring Items', num: true },
    { key: 'risk', label: 'Risk', num: false },
    { key: 'status', label: 'Status', num: false }
  ];

  @Input({ required: true }) rows: LocationRow[] = [];
  @Output() view = new EventEmitter<LocationRow>();

  sortKey: LocationKey = 'score';
  sortDir: SortDir = -1;
  sorted: LocationRow[] = [];

  ngOnChanges(): void {
    this.applySort();
  }

  sortBy(key: LocationKey): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'site' || key === 'status' ? 1 : -1;
    this.sortKey = key;
    this.applySort();
  }

  sortIcon(key: LocationKey) {
    return this.sortKey !== key ? SORT_ICONS.ArrowUpDown : this.sortDir === 1 ? SORT_ICONS.ArrowUp : SORT_ICONS.ArrowDown;
  }

  ariaSort(key: LocationKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  scoreTone(r: LocationRow): string {
    return r.score >= 93 ? 'green' : r.score >= SCORE_TARGET ? 'orange' : 'red';
  }

  riskTone(r: LocationRow): string {
    return r.risk === 'High' ? 'red' : r.risk === 'Medium' ? 'orange' : 'green';
  }

  private applySort(): void {
    const key = this.sortKey;
    const value = (r: LocationRow): string | number => (key === 'risk' ? RISK_RANK[r.risk] : r[key]);
    this.sorted = [...this.rows].sort((a, b) => compare(value(a), value(b), this.sortDir));
  }
}
