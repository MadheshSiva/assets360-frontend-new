import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { InspectionFinding, SEVERITY_TONE } from '../inspection-analytics.model';

type SortKey = 'id' | 'asset' | 'site' | 'findingType' | 'severity' | 'due' | 'owner' | 'status';

/** Sort request for GET /findings (sortBy is one of /options findingSortFields). */
export interface FindingsSort {
  sortBy: string;
  sortDirection: 'asc' | 'desc';
}

/** Server-side sort field per column; Location has none, so it is not sortable. */
const SORT_FIELDS: Partial<Record<SortKey, string>> = {
  id: 'findingId',
  asset: 'assetName',
  findingType: 'category',
  severity: 'severity',
  due: 'dueDate',
  owner: 'owner',
  status: 'status'
};

/** Open Inspection Findings: sorted on the server (worst first by default), with View and a row menu. */
@Component({
  selector: 'app-ra-inspection-findings-table',
  imports: [LucideAngularModule],
  templateUrl: './findings-table.html',
  styleUrls: ['../../shared/analytics-page.css', './findings-table.css']
})
export class InspectionFindingsTable {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis };
  readonly columns: { key: SortKey; label: string; sortable: boolean }[] = [
    { key: 'id', label: 'Finding ID', sortable: true },
    { key: 'asset', label: 'Asset', sortable: true },
    { key: 'site', label: 'Location', sortable: false },
    { key: 'findingType', label: 'Category', sortable: true },
    { key: 'severity', label: 'Severity', sortable: true },
    { key: 'due', label: 'Due Date', sortable: true },
    { key: 'owner', label: 'Owner', sortable: true },
    { key: 'status', label: 'Status', sortable: true }
  ];

  /** Rows already sorted by the API */
  @Input({ required: true }) rows: InspectionFinding[] = [];
  /** Open findings matching the filters (rows holds the first page) */
  @Input() total = 0;
  @Input() limit = 8;
  @Output() view = new EventEmitter<InspectionFinding>();
  @Output() plan = new EventEmitter<InspectionFinding>();
  @Output() progress = new EventEmitter<InspectionFinding>();
  @Output() viewAll = new EventEmitter<void>();
  @Output() sortChange = new EventEmitter<FindingsSort>();

  sortKey: SortKey = 'severity';
  sortDir: 1 | -1 = -1;
  menuId = '';

  get shown(): InspectionFinding[] {
    return this.rows.slice(0, this.limit);
  }

  get count(): number {
    return Math.max(this.total, this.rows.length);
  }

  sortBy(key: SortKey): void {
    const field = SORT_FIELDS[key];
    if (!field) return;
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'severity' ? -1 : 1;
    this.sortKey = key;
    // The API ranks Critical lowest, so "most severe first" is ascending there
    const ascending = key === 'severity' ? this.sortDir === -1 : this.sortDir === 1;
    this.sortChange.emit({ sortBy: field, sortDirection: ascending ? 'asc' : 'desc' });
  }

  /** Back to the default order (after the filters change). */
  resetSort(): void {
    this.sortKey = 'severity';
    this.sortDir = -1;
  }

  sortIcon(key: SortKey) {
    return this.sortKey !== key ? this.icons.ArrowUpDown : this.sortDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  tone(row: InspectionFinding): string {
    return SEVERITY_TONE[row.severity] ?? 'grey';
  }

  toggleMenu(id: string): void {
    this.menuId = this.menuId === id ? '' : id;
  }

  choose(action: 'view' | 'plan' | 'progress', row: InspectionFinding): void {
    this.menuId = '';
    if (action === 'view') this.view.emit(row);
    else if (action === 'plan') this.plan.emit(row);
    else this.progress.emit(row);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuId && !this.host.nativeElement.contains(event.target as Node)) this.menuId = '';
  }
}
