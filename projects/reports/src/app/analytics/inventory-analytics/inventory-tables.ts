import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { ArrowUpDown, Ellipsis, LucideAngularModule } from 'lucide-angular';
import { ReorderItem, Supplier } from './inventory-analytics.data';
import { SortState, sortBy, toggleSort } from './parts/ra-parts';

const RISK_TONES: Record<string, string> = { High: 'red', Medium: 'orange', Low: 'green' };

/** Items Below Reorder Level: sortable, with Create Request and a row menu. */
@Component({
  selector: 'app-ra-inv-reorder-table',
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
          @for (r of visible; track r.code + r.warehouse; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td><button type="button" class="link" (click)="view.emit(r)">{{ r.code }}</button></td>
              <td>{{ r.name }}</td>
              <td>{{ r.category }}</td>
              <td>{{ r.warehouseName }}</td>
              <td class="num">{{ r.available }}</td>
              <td class="num">{{ r.reorderLevel }}</td>
              <td class="num">{{ r.leadTime }} days</td>
              <td>{{ r.supplier }}</td>
              <td><span class="pill" [attr.data-tone]="tone(r.risk)"><i></i>{{ r.risk }}</span></td>
              <td>
                <span class="rai-actions">
                  <button type="button" class="btn btn--sm btn--outline" (click)="createRequest.emit(r)">Create Request</button>
                  <span class="row-menu">
                    <button type="button" class="icon-btn" [attr.aria-label]="'More for ' + r.code" (click)="toggleMenu(i)">
                      <lucide-icon [img]="icons.Ellipsis" [size]="16"></lucide-icon>
                    </button>
                    @if (menuIndex === i) {
                      <div class="menu" role="menu">
                        <button type="button" role="menuitem" (click)="pickView(r)">View item</button>
                        <button type="button" role="menuitem" (click)="pickRequest(r)">Create request</button>
                      </div>
                    }
                  </span>
                </span>
              </td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="11">No items below reorder level for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (rows.length > limit) {
      <button type="button" class="btn btn--link rai-more" (click)="viewAll.emit()">View all {{ rows.length }} items</button>
    }
  `,
  styleUrls: ['../shared/analytics-page.css', './inventory-analytics.css']
})
export class ReorderTable implements OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) rows: ReorderItem[] = [];
  @Input() limit = 5;
  @Output() createRequest = new EventEmitter<ReorderItem>();
  @Output() view = new EventEmitter<ReorderItem>();
  @Output() viewAll = new EventEmitter<void>();

  readonly icons = { ArrowUpDown, Ellipsis };
  readonly columns = [
    { key: 'code', label: 'Item Code', num: false },
    { key: 'name', label: 'Item Name', num: false },
    { key: 'category', label: 'Category', num: false },
    { key: 'warehouseName', label: 'Warehouse', num: false },
    { key: 'available', label: 'Available', num: true },
    { key: 'reorderLevel', label: 'Reorder Level', num: true },
    { key: 'leadTime', label: 'Lead Time', num: true },
    { key: 'supplier', label: 'Supplier', num: false },
    { key: 'riskRank', label: 'Risk', num: false }
  ];
  sort: SortState = { key: 'riskRank', dir: 1 };
  visible: ReorderItem[] = [];
  menuIndex = -1;

  ngOnChanges(): void {
    this.update();
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort, key);
    this.update();
  }

  tone(risk: string): string {
    return RISK_TONES[risk] ?? 'grey';
  }

  toggleMenu(i: number): void {
    this.menuIndex = this.menuIndex === i ? -1 : i;
  }

  pickView(r: ReorderItem): void {
    this.menuIndex = -1;
    this.view.emit(r);
  }

  pickRequest(r: ReorderItem): void {
    this.menuIndex = -1;
    this.createRequest.emit(r);
  }

  @HostListener('document:click', ['$event'])
  closeOutside(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (this.menuIndex >= 0 && !(this.host.nativeElement.contains(target) && target.closest('.row-menu'))) this.menuIndex = -1;
  }

  private update(): void {
    // Ties within a risk band show the fewest days of cover first
    const sorted = this.sort.key === 'riskRank' ? sortBy(sortBy(this.rows, { key: 'daysCover', dir: 1 }), this.sort) : sortBy(this.rows, this.sort);
    this.visible = sorted.slice(0, this.limit);
    this.menuIndex = -1;
  }
}

/** Top Inventory Suppliers: sortable, View opens the supplier summary. */
@Component({
  selector: 'app-ra-inv-supplier-table',
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
          @for (s of visible; track s.name; let i = $index) {
            <tr>
              <td class="muted">{{ i + 1 }}</td>
              <td>{{ s.name }}</td>
              <td class="num">{{ s.items.toLocaleString('en-US') }}</td>
              <td class="num"><span class="score" [attr.data-tone]="tone(s.onTime, 95)">{{ s.onTime }}%</span></td>
              <td class="num"><span class="score" [attr.data-tone]="tone(s.fillRate, 92)">{{ s.fillRate }}%</span></td>
              <td class="num">{{ s.openPos }}</td>
              <td><button type="button" class="btn btn--sm btn--outline" (click)="view.emit(s)">View</button></td>
            </tr>
          } @empty {
            <tr><td class="empty" colspan="7">No suppliers for the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './inventory-analytics.css']
})
export class SupplierTable implements OnChanges {
  @Input({ required: true }) rows: Supplier[] = [];
  @Output() view = new EventEmitter<Supplier>();

  readonly icons = { ArrowUpDown };
  readonly columns = [
    { key: 'name', label: 'Supplier', num: false },
    { key: 'items', label: 'Items', num: true },
    { key: 'onTime', label: 'On-Time Delivery', num: true },
    { key: 'fillRate', label: 'Fill Rate', num: true },
    { key: 'openPos', label: 'Open POs', num: true }
  ];
  sort: SortState = { key: 'items', dir: -1 };
  visible: Supplier[] = [];

  ngOnChanges(): void {
    this.visible = sortBy(this.rows, this.sort);
  }

  sortOn(key: string): void {
    this.sort = toggleSort(this.sort, key);
    this.visible = sortBy(this.rows, this.sort);
  }

  /** Green at or above target, orange within 5 points, red below */
  tone(value: number, target: number): string {
    return value >= target ? 'green' : value >= target - 5 ? 'orange' : 'red';
  }
}
