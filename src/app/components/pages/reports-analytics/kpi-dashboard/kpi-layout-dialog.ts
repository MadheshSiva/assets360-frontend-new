import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, ChevronUp, LucideAngularModule } from 'lucide-angular';

export interface LayoutItem {
  id: string;
  name: string;
  module: string;
  visible: boolean;
}

/** Edit KPI Layout: show / hide and reorder the tiles of the current view. */
@Component({
  selector: 'app-ra-kpi-layout-dialog',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="kd-layout-title">
        <h2 id="kd-layout-title">Edit KPI layout</h2>
        <p>{{ viewLabel }} · {{ visibleCount }} of {{ items.length }} tiles shown. Untick a KPI to hide it and use the arrows to change the order.</p>
        <ul class="kd-layout">
          @for (item of items; track item.id; let i = $index; let first = $first; let last = $last) {
            <li [class.kd-layout__hidden]="!item.visible">
              <label class="kd-layout__label">
                <input type="checkbox" [name]="'show-' + item.id" [(ngModel)]="item.visible" />
                <span>{{ item.name }}</span>
                <span class="muted">{{ item.module }}</span>
              </label>
              <button type="button" class="icon-btn" [disabled]="first" [attr.aria-label]="'Move ' + item.name + ' up'" (click)="move(i, -1)">
                <lucide-icon [img]="icons.ChevronUp" [size]="16" />
              </button>
              <button type="button" class="icon-btn" [disabled]="last" [attr.aria-label]="'Move ' + item.name + ' down'" (click)="move(i, 1)">
                <lucide-icon [img]="icons.ChevronDown" [size]="16" />
              </button>
            </li>
          }
        </ul>
        @if (!visibleCount) { <p class="kd-error">Show at least one KPI.</p> }
        <div class="dialog__actions">
          <button type="button" class="btn btn--link" (click)="reset.emit()">Reset to default</button>
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="button" class="btn btn--primary" [disabled]="!visibleCount" (click)="save()">Apply layout</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './kpi-dashboard.css']
})
export class KpiLayoutDialog implements OnInit {
  readonly icons = { ChevronDown, ChevronUp };
  @Input() viewLabel = '';
  @Input({ required: true }) layout: LayoutItem[] = [];
  @Output() saved = new EventEmitter<LayoutItem[]>();
  @Output() reset = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  /** Working copy so Cancel leaves the dashboard untouched */
  items: LayoutItem[] = [];

  ngOnInit(): void {
    this.items = this.layout.map((i) => ({ ...i }));
  }

  get visibleCount(): number {
    return this.items.filter((i) => i.visible).length;
  }

  move(index: number, step: number): void {
    const target = index + step;
    if (target < 0 || target >= this.items.length) return;
    const next = [...this.items];
    [next[index], next[target]] = [next[target], next[index]];
    this.items = next;
  }

  save(): void {
    if (this.visibleCount) this.saved.emit(this.items);
  }

  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
