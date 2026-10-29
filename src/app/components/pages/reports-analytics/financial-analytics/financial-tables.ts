import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { ArrowUpDown, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { SortState, sortBy, toggleSort } from '../inventory-analytics/parts/ra-parts';
import { CostAsset, CostCenterRow, Currency, moneyIn, toCurrency } from './financial-analytics.data';

const STATUS_TONES: Record<string, string> = { 'Over Budget': 'red', 'At Risk': 'orange', 'On Track': 'green' };

/** Highest Cost Assets: top assets by total cost of ownership, sortable, with View and a row menu. */
@Component({
  selector: 'app-ra-fin-asset-table',
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
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (a of visible; track a.id; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td><button type="button" class="link" (click)="view.emit(a)">{{ a.id }}</button></td>
              <td>{{ a.name }}</td>
              <td>{{ a.site }}</td>
              <td class="num">{{ fmt(a.acquisition) }}</td>
              <td class="num">{{ fmt(a.maintenance) }}</td>
              <td class="num">{{ fmt(a.depreciation) }}</td>
              <td class="num"><strong>{{ fmt(a.tco) }}</strong></td>
              <td class="num">{{ perHour(a) }}</td>
              <td>
                <span class="raf-actions">
                  <button type="button" class="btn btn--sm btn--outline" (click)="view.emit(a)">View</button>
                  <span class="row-menu">
                    <button type="button" class="icon-btn" [attr.aria-label]="'More for ' + a.id" (click)="toggleMenu(i)">
                      <lucide-icon [img]="icons.Ellipsis" [size]="16"></lucide-icon>
                    </button>
                    @if (menuIndex === i) {
                      <div class="menu" role="menu">
                        <button type="button" role="menuitem" (click)="pick(a, 'view')">View cost breakdown</button>
                        <button type="button" role="menuitem" (click)="pick(a, 'plan')">Create action plan</button>
                      </div>
                    }
                  </span>
                </span>
              </td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="10">No assets for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './financial-analytics.css']
})
export class CostAssetTable implements OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) rows: CostAsset[] = [];
  @Input() currency: Currency = 'AED';
  @Input() limit = 5;
  @Output() view = new EventEmitter<CostAsset>();
  @Output() plan = new EventEmitter<CostAsset>();

  readonly icons = { ArrowUpDown, Ellipsis };
  readonly columns = [
    { key: 'id', label: 'Asset ID', num: false },
    { key: 'name', label: 'Asset Name', num: false },
    { key: 'site', label: 'Location', num: false },
    { key: 'acquisition', label: 'Acquisition Cost', num: true },
    { key: 'maintenance', label: 'Maintenance Cost', num: true },
    { key: 'depreciation', label: 'Depreciation', num: true },
    { key: 'tco', label: 'TCO', num: true },
    { key: 'costPerHour', label: 'Cost per Op. Hour', num: true }
  ];
  sort: SortState = { key: 'tco', dir: -1 };
  visible: CostAsset[] = [];
  menuIndex = -1;

  ngOnChanges(): void {
    this.update();
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort, key);
    this.update();
  }

  fmt(aed: number): string {
    return moneyIn(aed, this.currency);
  }

  perHour(a: CostAsset): string {
    return `${this.currency} ${toCurrency(a.costPerHour, this.currency).toFixed(2)}`;
  }

  toggleMenu(i: number): void {
    this.menuIndex = this.menuIndex === i ? -1 : i;
  }

  pick(a: CostAsset, action: 'view' | 'plan'): void {
    this.menuIndex = -1;
    (action === 'view' ? this.view : this.plan).emit(a);
  }

  @HostListener('document:click', ['$event'])
  closeOutside(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (this.menuIndex >= 0 && !(this.host.nativeElement.contains(target) && target.closest('.row-menu'))) this.menuIndex = -1;
  }

  private update(): void {
    this.visible = sortBy(this.rows, this.sort).slice(0, this.limit);
    this.menuIndex = -1;
  }
}

/** Cost Center Performance: budget vs actual per cost center with a status pill. */
@Component({
  selector: 'app-ra-fin-cost-center-table',
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
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          @for (r of visible; track r.code; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td><button type="button" class="link" (click)="view.emit(r)">{{ r.code }} {{ r.name }}</button></td>
              <td class="num">{{ fmt(r.budget) }}</td>
              <td class="num">{{ fmt(r.actual) }}</td>
              <td class="num" [class.raf-over]="r.variance > 0" [class.raf-under]="r.variance <= 0">{{ variance(r) }}</td>
              <td class="num">{{ r.utilization.toFixed(0) }}%</td>
              <td><span class="pill" [attr.data-tone]="tone(r.status)">{{ r.status }}</span></td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="7">No cost centers for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './financial-analytics.css']
})
export class CostCenterTable implements OnChanges {
  @Input({ required: true }) rows: CostCenterRow[] = [];
  @Input() currency: Currency = 'AED';
  @Output() view = new EventEmitter<CostCenterRow>();

  readonly icons = { ArrowUpDown };
  readonly columns = [
    { key: 'code', label: 'Cost Center', num: false },
    { key: 'budget', label: 'Budget', num: true },
    { key: 'actual', label: 'Actual', num: true },
    { key: 'variance', label: 'Variance', num: true },
    { key: 'utilization', label: 'Utilization', num: true }
  ];
  sort: SortState = { key: 'code', dir: 1 };
  visible: CostCenterRow[] = [];

  ngOnChanges(): void {
    this.visible = sortBy(this.rows, this.sort);
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort, key);
    this.visible = sortBy(this.rows, this.sort);
  }

  fmt(aed: number): string {
    return moneyIn(aed, this.currency);
  }

  variance(r: CostCenterRow): string {
    return `${r.variance > 0 ? '+' : ''}${moneyIn(r.variance, this.currency)}`;
  }

  tone(status: string): string {
    return STATUS_TONES[status] ?? 'grey';
  }
}
