import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WIDGET_CATALOG, WidgetCategory, WidgetCategoryKey, WidgetDef } from '../dashboard-widgets/widget-catalog';

const CLOSE_ANIMATION_MS = 180;

/**
 * "Add Widgets" popup. Edits a draft copy of `selected`; `applied` emits the new
 * selection (full ids, catalog order) and `closed` fires once the close animation ends.
 */
@Component({
  standalone: true,
  selector: 'app-widget-picker',
  imports: [CommonModule],
  templateUrl: './widget-picker.html',
  styleUrls: ['./widget-picker.css'],
})
export class WidgetPicker implements OnInit, OnDestroy {
  /** Currently selected widget ids, e.g. 'asset.stat:Total Assets'. */
  @Input() selected: string[] = [];
  /** Module group to show expanded when the popup opens. */
  @Input() expand: WidgetCategoryKey | null = null;

  @Output() applied = new EventEmitter<string[]>();
  @Output() closed = new EventEmitter<void>();

  readonly catalog: WidgetCategory[] = WIDGET_CATALOG;
  expandedCategory: WidgetCategoryKey | null = null;
  // True while the close animation plays
  closing = false;

  private draft = new Set<string>();
  private closeTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.draft = new Set(this.selected);
    this.expandedCategory = this.expand;
  }

  ngOnDestroy(): void {
    clearTimeout(this.closeTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  toggleCategory(key: WidgetCategoryKey): void {
    this.expandedCategory = this.expandedCategory === key ? null : key;
  }

  isDraftSelected(category: WidgetCategory, widget: WidgetDef): boolean {
    return this.draft.has(`${category.key}.${widget.id}`);
  }

  toggleDraft(category: WidgetCategory, widget: WidgetDef): void {
    const id = `${category.key}.${widget.id}`;
    if (this.draft.has(id)) this.draft.delete(id);
    else this.draft.add(id);
  }

  draftCount(category: WidgetCategory): number {
    return category.widgets.filter((w) => this.isDraftSelected(category, w)).length;
  }

  isCategoryFullySelected(category: WidgetCategory): boolean {
    return this.draftCount(category) === category.widgets.length;
  }

  toggleCategoryAll(category: WidgetCategory): void {
    const selectAll = !this.isCategoryFullySelected(category);
    for (const w of category.widgets) {
      const id = `${category.key}.${w.id}`;
      if (selectAll) this.draft.add(id);
      else this.draft.delete(id);
    }
  }

  get draftTotal(): number {
    return this.draft.size;
  }

  apply(): void {
    if (this.closing) return;
    // Keep catalog order so the saved list is stable
    const ids = this.catalog.flatMap((c) => c.widgets.map((w) => `${c.key}.${w.id}`)).filter((id) => this.draft.has(id));
    this.applied.emit(ids);
    this.close();
  }

  close(): void {
    if (this.closing) return;
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      this.closed.emit();
      return;
    }
    this.closing = true;
    this.closeTimer = setTimeout(() => this.closed.emit(), CLOSE_ANIMATION_MS);
  }
}
