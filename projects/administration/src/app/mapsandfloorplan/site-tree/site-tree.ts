import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChevronDown, ChevronRight, ListFilter, LucideAngularModule, Search } from 'lucide-angular';
import { KIND_ICONS, SiteNode } from '../maps.data';
import { MapsStore } from '../maps.store';

/**
 * Organization > site > building > floor tree (from Master Data Management) with search. Sites, buildings and floors
 * are selectable, since floor plans can hang on any of them; the caret folds a branch. Counts = floor plans on the node.
 */
@Component({
  standalone: true,
  selector: 'app-site-tree',
  imports: [FormsModule, NgTemplateOutlet, LucideAngularModule],
  template: `
    <div class="tree-tools">
      <label class="search">
        <lucide-icon [img]="icons.Search" [size]="15"></lucide-icon>
        <input [placeholder]="placeholder" [attr.aria-label]="placeholder" [(ngModel)]="query" />
      </label>
      <button type="button" class="icon-btn" aria-label="Filter" title="Only floors with floor plans" [class.on]="floorsOnly" (click)="floorsOnly = !floorsOnly">
        <lucide-icon [img]="icons.ListFilter" [size]="16"></lucide-icon>
      </button>
    </div>
    @if (store.treeLoading) {
      <p class="tree-note">Loading locations…</p>
    } @else if (store.treeEmpty) {
      <p class="tree-note">{{ store.treeError || 'No sites yet — add sites, buildings and floors in Master Data Management.' }}</p>
      @if (store.treeError) {
        <button type="button" class="retry" (click)="store.loadTree()">Retry</button>
      }
    } @else if (store.tree) {
      <ul class="tree" role="tree">
        <ng-container *ngTemplateOutlet="branch; context: { $implicit: store.tree, depth: 0 }"></ng-container>
      </ul>
    }

    <ng-template #branch let-node let-depth="depth">
      @if (matches(node)) {
        <li role="treeitem" [attr.aria-expanded]="node.children ? isOpen(node) : null" [attr.aria-selected]="node.id === store.selectedFloorId">
          <div
            class="node"
            [class.node--floor]="node.kind === 'floor'"
            [class.active]="node.id === store.selectedFloorId"
            [style.padding-left.px]="depth * 16 + 4"
            (click)="onNode(node)"
          >
            <span class="node__caret" (click)="toggle($event, node)">
              @if (node.children?.length) {
                <lucide-icon [img]="isOpen(node) ? icons.ChevronDown : icons.ChevronRight" [size]="14"></lucide-icon>
              }
            </span>
            <lucide-icon class="node__icon" [img]="kindIcon(node)" [size]="15"></lucide-icon>
            <span class="node__label" [title]="node.label">{{ node.label }}</span>
            @if (node.kind !== 'org') {
              <span class="node__count">{{ store.countOf(node.id) }}</span>
            }
          </div>
          @if (node.children?.length && isOpen(node)) {
            <ul role="group">
              @for (c of node.children; track c.id) {
                <ng-container *ngTemplateOutlet="branch; context: { $implicit: c, depth: depth + 1 }"></ng-container>
              }
            </ul>
          }
        </li>
      }
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .tree-tools { display: flex; gap: 8px; margin-bottom: 10px; }
    .search { flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 10px;
      border: 1px solid #e6e8ef; border-radius: 10px; color: #94a3b8; background: #fff; }
    .search input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit; color: #0f172a; background: transparent; }
    .icon-btn { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #e6e8ef; border-radius: 10px;
      background: #fff; color: #475569; cursor: pointer; }
    .icon-btn.on { border-color: #5b2aa8; color: #5b2aa8; background: #f3effc; }
    ul { list-style: none; margin: 0; padding: 0; }
    .node { display: flex; align-items: center; gap: 6px; height: 32px; padding-right: 6px; border-radius: 8px; cursor: pointer; color: #1e293b; }
    .node:hover { background: #faf9fe; }
    .node.active { background: #ede7fb; color: #5b2aa8; font-weight: 700; }
    .node__caret { display: grid; place-items: center; width: 14px; min-height: 20px; color: #64748b; }
    .node__icon { color: #5b2aa8; }
    .node--floor .node__icon { color: #7c6bb0; }
    .node__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .node__count { min-width: 20px; padding: 0 6px; border-radius: 6px; background: #f1f5f9; font-size: 11px; text-align: center; color: #475569; }
    .node.active .node__count { background: #fff; color: #5b2aa8; }
    .tree-note { margin: 8px 4px; font-size: 12.5px; color: #64748b; line-height: 1.45; }
    .retry { margin: 0 4px; padding: 4px 10px; border: 1px solid #e6e8ef; border-radius: 8px; background: #fff; font: inherit; font-size: 12px; cursor: pointer; }
  `
})
export class SiteTree {
  readonly store = inject(MapsStore);
  readonly icons = { ChevronDown, ChevronRight, ListFilter, Search };

  @Input() placeholder = 'Search maps, sites or floors...';
  @Output() floorSelect = new EventEmitter<string>();

  query = '';
  /** Filter button: hide floors that hold no floor plans. */
  floorsOnly = false;
  private closed = new Set<string>();

  kindIcon(node: SiteNode) {
    return KIND_ICONS[node.kind];
  }

  isOpen(node: SiteNode): boolean {
    return !!this.query.trim() || !this.closed.has(node.id);
  }

  onNode(node: SiteNode): void {
    if (node.kind === 'org') {
      this.flip(node.id);
      return;
    }
    this.closed.delete(node.id);
    this.store.selectFloor(node.id);
    this.floorSelect.emit(node.id);
  }

  toggle(event: MouseEvent, node: SiteNode): void {
    if (!node.children?.length) return;
    event.stopPropagation();
    this.flip(node.id);
  }

  private flip(id: string): void {
    if (this.closed.has(id)) this.closed.delete(id);
    else this.closed.add(id);
  }

  matches(node: SiteNode): boolean {
    const q = this.query.trim().toLowerCase();
    const self = (!q || node.label.toLowerCase().includes(q)) && (!this.floorsOnly || node.kind !== 'floor' || this.store.countOf(node.id) > 0);
    return self || !!node.children?.some((c) => this.matches(c));
  }
}
