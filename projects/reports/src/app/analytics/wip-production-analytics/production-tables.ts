import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { ArrowUpDown, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { SortState, fmtDate, toggleSort } from '../inventory-analytics/parts/ra-parts';
import { ProductionOrder, WorkCenter } from './wip-production-analytics.data';

export const ORDER_STATUS_TONES: Record<string, string> = {
  'In Progress': 'blue', 'On Track': 'green', 'Not Started': 'grey', Completed: 'green', 'At Risk': 'red', Delayed: 'red', 'Quality Hold': 'orange',
  'On Hold': 'orange'
};
const RISK_TONES: Record<string, string> = { High: 'red', Medium: 'orange', Low: 'green' };

export type OrderMenuAction = 'view' | 'plan';

/** Sorts a copy of `rows`; rows without a value (no quantities or due date) go last either way. */
function sortNullable<T>(rows: T[], state: SortState): T[] {
  const k = state.key as keyof T;
  return [...rows].sort((a, b) => {
    const x = a[k];
    const y = b[k];
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * state.dir;
  });
}

const qty = (v: number | null): string => (v === null ? '—' : v.toLocaleString('en-US'));

/** Active Production Orders: sortable, View opens the order, row menu adds an action plan. */
@Component({
  selector: 'app-ra-wip-order-table',
  imports: [LucideAngularModule],
  template: `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            @for (c of columns; track c.key) {
              <th [class.num]="c.num">
                <button type="button" class="sort" (click)="sortOn(c.key)" [attr.aria-label]="'Sort by ' + c.label">
                  {{ c.label }} <lucide-icon [img]="icons.ArrowUpDown" [size]="11"></lucide-icon>
                </button>
              </th>
            }
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (o of visible; track o.key; let i = $index) {
            <tr>
              <td><button type="button" class="link" (click)="action.emit({ order: o, action: 'view' })">{{ o.code }}</button></td>
              <td>{{ o.product }}</td>
              <td>{{ o.line }}</td>
              <td class="num">{{ qty(o.planned) }}</td>
              <td class="num">{{ qty(o.completed) }}</td>
              <td class="num rap-wip">{{ qty(o.wip) }}</td>
              <td [class.rap-due]="o.schedule !== 'On Track'">{{ date(o.due) }}</td>
              <td><span class="pill" [attr.data-tone]="tone(o.state)"><i></i>{{ o.state }}</span></td>
              <td>
                <span class="rap-actions">
                  <button type="button" class="btn btn--sm btn--outline" (click)="action.emit({ order: o, action: 'view' })">View</button>
                  <span class="row-menu">
                    <button type="button" class="icon-btn" [attr.aria-label]="'More for ' + o.code" (click)="toggleMenu(i)">
                      <lucide-icon [img]="icons.Ellipsis" [size]="16"></lucide-icon>
                    </button>
                    @if (menuIndex === i) {
                      <div class="menu" role="menu">
                        <button type="button" role="menuitem" (click)="pick(o, 'view')">View order</button>
                        <button type="button" role="menuitem" (click)="pick(o, 'plan')">Create action plan</button>
                      </div>
                    }
                  </span>
                </span>
              </td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="9">No active orders for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (count > limit) {
      <button type="button" class="btn btn--link rap-more" (click)="viewAll.emit()">View all {{ count }} active orders</button>
    }
  `,
  styleUrls: ['../shared/analytics-page.css', './wip-production-analytics.css']
})
export class ProductionOrderTable implements OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** The orders the overview returned; sorted here in the browser */
  @Input({ required: true }) rows: ProductionOrder[] = [];
  /** Every active order for the filters (the overview may return fewer rows) */
  @Input() total: number | null = null;
  @Input() limit = 5;
  @Output() action = new EventEmitter<{ order: ProductionOrder; action: OrderMenuAction }>();
  @Output() viewAll = new EventEmitter<void>();

  readonly icons = { ArrowUpDown, Ellipsis };
  readonly qty = qty;
  readonly columns = [
    { key: 'code', label: 'Order No', num: false },
    { key: 'product', label: 'Product', num: false },
    { key: 'line', label: 'Line', num: false },
    { key: 'planned', label: 'Planned Qty', num: true },
    { key: 'completed', label: 'Completed Qty', num: true },
    { key: 'wip', label: 'WIP Qty', num: true },
    { key: 'due', label: 'Due Date', num: false },
    { key: 'state', label: 'Status', num: false }
  ];
  // Default: most urgent first
  sort: SortState = { key: 'due', dir: 1 };
  visible: ProductionOrder[] = [];
  menuIndex = -1;

  get count(): number {
    return Math.max(this.total ?? 0, this.rows.length);
  }

  ngOnChanges(): void {
    this.update();
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort, key);
    this.update();
  }

  date(iso: string | null): string {
    return iso ? fmtDate(iso) : '—';
  }

  tone(status: string): string {
    return ORDER_STATUS_TONES[status] ?? 'grey';
  }

  toggleMenu(i: number): void {
    this.menuIndex = this.menuIndex === i ? -1 : i;
  }

  pick(order: ProductionOrder, action: OrderMenuAction): void {
    this.menuIndex = -1;
    this.action.emit({ order, action });
  }

  @HostListener('document:click', ['$event'])
  closeOutside(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (this.menuIndex >= 0 && !(this.host.nativeElement.contains(target) && target.closest('.row-menu'))) this.menuIndex = -1;
  }

  private update(): void {
    this.visible = sortNullable(this.rows, this.sort).slice(0, this.limit);
    this.menuIndex = -1;
  }
}

/** Bottleneck Work Centers: queue, average wait and utilization with a risk pill (highest risk first). */
@Component({
  selector: 'app-ra-wip-work-center-table',
  imports: [LucideAngularModule],
  template: `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            @for (c of columns; track c.key) {
              <th [class.num]="c.num">
                <button type="button" class="sort" (click)="sortOn(c.key)" [attr.aria-label]="'Sort by ' + c.label">
                  {{ c.label }} <lucide-icon [img]="icons.ArrowUpDown" [size]="11"></lucide-icon>
                </button>
              </th>
            }
            <th>Risk</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (c of visible; track c.name; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td>{{ c.name }}</td>
              <td class="num" [class.rap-due]="c.risk === 'High'">{{ c.queue }}</td>
              <td class="num">{{ c.avgWait ?? '—' }}</td>
              <td class="num">{{ c.utilization === null ? '—' : c.utilization + '%' }}</td>
              <td><span class="pill" [attr.data-tone]="tone(c.risk)"><i></i>{{ c.risk }}</span></td>
              <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(c)">View</button></td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="7">No work centers for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './wip-production-analytics.css']
})
export class WorkCenterTable implements OnChanges {
  @Input({ required: true }) rows: WorkCenter[] = [];
  @Output() view = new EventEmitter<WorkCenter>();

  readonly icons = { ArrowUpDown };
  readonly columns = [
    { key: 'name', label: 'Work Center', num: false },
    { key: 'queue', label: 'Queue (Orders)', num: true },
    { key: 'avgWait', label: 'Avg. Wait (days)', num: true },
    { key: 'utilization', label: 'Utilization', num: true }
  ];
  // The API ranks the rows (risk, then utilization, then queue); a header click re-sorts them here
  sort: SortState | null = null;
  visible: WorkCenter[] = [];

  ngOnChanges(): void {
    this.visible = this.sort ? sortNullable(this.rows, this.sort) : [...this.rows];
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort ?? { key: '', dir: 1 }, key);
    this.visible = sortNullable(this.rows, this.sort);
  }

  tone(risk: string): string {
    return RISK_TONES[risk] ?? 'grey';
  }
}
