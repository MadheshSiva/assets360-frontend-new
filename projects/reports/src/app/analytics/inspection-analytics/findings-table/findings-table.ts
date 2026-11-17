import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { InspectionFinding, SEVERITY_RANK, SEVERITY_TONE } from '../inspection-analytics.data';

type SortKey = 'id' | 'asset' | 'site' | 'findingType' | 'severity' | 'due' | 'owner' | 'status';

/** Open Inspection Findings: sortable, worst first, with View and a row menu. */
@Component({
  selector: 'app-ra-inspection-findings-table',
  imports: [LucideAngularModule],
  templateUrl: './findings-table.html',
  styleUrls: ['../../shared/analytics-page.css', './findings-table.css']
})
export class InspectionFindingsTable implements OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis };
  readonly columns: { key: SortKey; label: string }[] = [
    { key: 'id', label: 'Finding ID' },
    { key: 'asset', label: 'Asset' },
    { key: 'site', label: 'Location' },
    { key: 'findingType', label: 'Category' },
    { key: 'severity', label: 'Severity' },
    { key: 'due', label: 'Due Date' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status' }
  ];

  @Input({ required: true }) rows: InspectionFinding[] = [];
  @Input() limit = 8;
  @Output() view = new EventEmitter<InspectionFinding>();
  @Output() plan = new EventEmitter<InspectionFinding>();
  @Output() progress = new EventEmitter<InspectionFinding>();
  @Output() viewAll = new EventEmitter<void>();

  sortKey: SortKey = 'severity';
  sortDir: 1 | -1 = -1;
  sorted: InspectionFinding[] = [];
  menuId = '';

  get shown(): InspectionFinding[] {
    return this.sorted.slice(0, this.limit);
  }

  ngOnChanges(): void {
    this.applySort();
  }

  sortBy(key: SortKey): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'severity' ? -1 : 1;
    this.sortKey = key;
    this.applySort();
  }

  sortIcon(key: SortKey) {
    return this.sortKey !== key ? this.icons.ArrowUpDown : this.sortDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  tone(row: InspectionFinding): string {
    return SEVERITY_TONE[row.severity];
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

  private applySort(): void {
    const key = this.sortKey;
    const value = (r: InspectionFinding): string | number => {
      switch (key) {
        case 'severity':
          return SEVERITY_RANK[r.severity] * 1000 - r.dueInDays;
        case 'due':
          return r.dueInDays;
        case 'asset':
          return r.assetName;
        default:
          return r[key];
      }
    };
    this.sorted = [...this.rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * this.sortDir;
    });
  }
}
