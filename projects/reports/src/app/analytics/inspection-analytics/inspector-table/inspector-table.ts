import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ArrowDown, ArrowUp, ArrowUpDown, LucideAngularModule } from 'lucide-angular';
import { InspectorRow } from '../inspection-analytics.data';

type SortKey = 'name' | 'inspections' | 'avgHours' | 'findingRate' | 'closureRate';

/** Inspector Performance: workload, speed, finding rate and closure rate per inspector. */
@Component({
  selector: 'app-ra-inspector-table',
  imports: [LucideAngularModule],
  template: `
    @if (rows.length) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              @for (c of columns; track c.key) {
                <th [class.num]="c.key !== 'name' && c.key !== 'closureRate'" [attr.aria-sort]="ariaSort(c.key)">
                  <button type="button" class="sort" (click)="sortBy(c.key)">{{ c.label }} <lucide-icon [img]="sortIcon(c.key)" [size]="12" /></button>
                </th>
              }
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (r of sorted; track r.name; let i = $index) {
              <tr>
                <td class="muted">{{ i + 1 }}</td>
                <td>{{ r.name }}</td>
                <td class="num">{{ r.inspections.toLocaleString('en-US') }}</td>
                <td class="num">{{ r.avgHours }} hrs</td>
                <td class="num">{{ r.findingRate }}%</td>
                <td>
                  <span class="ia-closure">
                    <span class="meter"><i [style.width.%]="r.closureRate" [style.background]="closureColor(r)"></i></span>
                    <b>{{ r.closureRate }}%</b>
                  </span>
                </td>
                <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(r)">View</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty">No inspectors match the current filters.</div>
    }
  `,
  styles: [
    `
      .ia-closure {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 130px;
      }
    `
  ],
  styleUrls: ['../../shared/analytics-page.css']
})
export class InspectorTable implements OnChanges {
  readonly icons = { ArrowDown, ArrowUp, ArrowUpDown };
  readonly columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Inspector' },
    { key: 'inspections', label: 'Inspections Completed' },
    { key: 'avgHours', label: 'Avg. Duration' },
    { key: 'findingRate', label: 'Finding Rate' },
    { key: 'closureRate', label: 'Closure Rate' }
  ];

  @Input({ required: true }) rows: InspectorRow[] = [];
  @Output() view = new EventEmitter<InspectorRow>();

  sortKey: SortKey = 'inspections';
  sortDir: 1 | -1 = -1;
  sorted: InspectorRow[] = [];

  ngOnChanges(): void {
    this.applySort();
  }

  sortBy(key: SortKey): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'name' ? 1 : -1;
    this.sortKey = key;
    this.applySort();
  }

  sortIcon(key: SortKey) {
    return this.sortKey !== key ? this.icons.ArrowUpDown : this.sortDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  /** Green at 90%+, orange from 85%, red below */
  closureColor(r: InspectorRow): string {
    return r.closureRate >= 90 ? '#10b981' : r.closureRate >= 85 ? '#f59e0b' : '#ef4444';
  }

  private applySort(): void {
    const key = this.sortKey;
    this.sorted = [...this.rows].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * this.sortDir;
    });
  }
}
