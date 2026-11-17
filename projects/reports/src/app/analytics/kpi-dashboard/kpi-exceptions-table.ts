import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ArrowDown, ArrowUp, ArrowUpDown, LucideAngularModule } from 'lucide-angular';
import { Sparkline } from '../shared/charts';
import { KpiState, STATUS_TONE } from './kpi-dashboard.data';

type SortKey = 'name' | 'value' | 'variance' | 'owner' | 'due' | 'status';
const STATUS_RANK: Record<string, number> = { 'At Risk': 4, 'Over Budget': 3, Watch: 2, 'On Track': 1, 'No Data': 0 };

/** KPI Exceptions: KPIs off target in the current view, worst first. */
@Component({
  selector: 'app-ra-kpi-exceptions-table',
  imports: [LucideAngularModule, Sparkline],
  template: `
    @if (rows.length) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th [attr.aria-sort]="ariaSort('name')"><button type="button" class="sort" (click)="sortBy('name')">KPI <lucide-icon [img]="sortIcon('name')" [size]="12" /></button></th>
              <th class="num" [attr.aria-sort]="ariaSort('value')"><button type="button" class="sort" (click)="sortBy('value')">Current <lucide-icon [img]="sortIcon('value')" [size]="12" /></button></th>
              <th class="num">Target</th>
              <th class="num" [attr.aria-sort]="ariaSort('variance')"><button type="button" class="sort" (click)="sortBy('variance')">Variance <lucide-icon [img]="sortIcon('variance')" [size]="12" /></button></th>
              <th>Trend</th>
              <th [attr.aria-sort]="ariaSort('owner')"><button type="button" class="sort" (click)="sortBy('owner')">Owner <lucide-icon [img]="sortIcon('owner')" [size]="12" /></button></th>
              <th [attr.aria-sort]="ariaSort('due')"><button type="button" class="sort" (click)="sortBy('due')">Due Date <lucide-icon [img]="sortIcon('due')" [size]="12" /></button></th>
              <th [attr.aria-sort]="ariaSort('status')"><button type="button" class="sort" (click)="sortBy('status')">Status <lucide-icon [img]="sortIcon('status')" [size]="12" /></button></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (r of sorted; track r.def.id; let i = $index) {
              <tr>
                <td class="muted">{{ i + 1 }}</td>
                <td>{{ r.def.name }}</td>
                <td class="num kd-bad">{{ r.valueText }}</td>
                <td class="num">{{ targetValue(r) }}</td>
                <td class="num kd-bad">{{ r.varianceText }}</td>
                <td><ra-sparkline [values]="r.spark" [color]="r.changeGood ? '#10b981' : '#ef4444'" [width]="70" [height]="22" /></td>
                <td>{{ r.def.owner }}</td>
                <td>{{ r.due }}</td>
                <td><span class="pill" [attr.data-tone]="tone(r)"><i></i>{{ r.status }}</span></td>
                <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(r)">View Details</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty">No KPI exceptions for this view and status — everything is on track.</div>
    }
  `,
  styleUrls: ['../shared/analytics-page.css', './kpi-dashboard.css']
})
export class KpiExceptionsTable implements OnChanges {
  readonly icons = { ArrowDown, ArrowUp, ArrowUpDown };

  @Input({ required: true }) rows: KpiState[] = [];
  @Output() view = new EventEmitter<KpiState>();

  sortKey: SortKey = 'status';
  sortDir: 1 | -1 = -1;
  sorted: KpiState[] = [];

  ngOnChanges(): void {
    this.applySort();
  }

  sortBy(key: SortKey): void {
    this.sortDir = this.sortKey === key ? (this.sortDir === 1 ? -1 : 1) : key === 'name' || key === 'owner' || key === 'due' ? 1 : -1;
    this.sortKey = key;
    this.applySort();
  }

  sortIcon(key: SortKey) {
    return this.sortKey !== key ? this.icons.ArrowUpDown : this.sortDir === 1 ? this.icons.ArrowUp : this.icons.ArrowDown;
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  tone(r: KpiState): string {
    return STATUS_TONE[r.status];
  }

  /** "Budget AED 1.72M" → "AED 1.72M" for the table column */
  targetValue(r: KpiState): string {
    return r.targetText.replace(/^(Budget|Target) /, '');
  }

  private applySort(): void {
    const key = this.sortKey;
    const value = (r: KpiState): string | number => {
      switch (key) {
        case 'name':
          return r.def.name;
        case 'owner':
          return r.def.owner;
        case 'due':
          return r.def.dueInDays;
        case 'value':
          return r.attainment;
        case 'variance':
          return Math.abs(100 - r.attainment);
        default:
          return STATUS_RANK[r.status] * 1000 + Math.abs(100 - r.attainment);
      }
    };
    this.sorted = [...this.rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * this.sortDir;
    });
  }
}
