import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { Ellipsis, GripVertical, Info, LucideAngularModule, X } from 'lucide-angular';

/**
 * Widget frame: grip, title with info tip and a ⋯ menu (Export CSV / Expand).
 * Expanding turns the same frame into a wide dialog, so the projected chart simply re-renders at the larger size.
 */
@Component({
  selector: 'ra-c-widget',
  imports: [LucideAngularModule],
  template: `
    <div class="rac-widget-wrap" [class.overlay]="expanded" (click)="backdrop($event)">
      <section class="widget rac-widget" [class.dialog]="expanded" [class.dialog--wide]="expanded" [attr.role]="expanded ? 'dialog' : null"
        [attr.aria-modal]="expanded ? true : null" [attr.aria-label]="title">
        <header class="widget__head">
          <lucide-icon class="widget__grip" [img]="icons.GripVertical" [size]="16"></lucide-icon>
          <h2>
            {{ title }}
            @if (info) {
              <lucide-icon class="widget__info" [img]="icons.Info" [size]="14" [attr.title]="info"></lucide-icon>
            }
          </h2>
          <ng-content select="[widget-actions]"></ng-content>
          @if (expanded) {
            <button type="button" class="icon-btn" aria-label="Close" (click)="expanded = false">
              <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
            </button>
          } @else {
            <div class="row-menu">
              <button type="button" class="icon-btn" [attr.aria-label]="title + ' options'" [attr.aria-expanded]="menuOpen" (click)="menuOpen = !menuOpen">
                <lucide-icon [img]="icons.Ellipsis" [size]="16"></lucide-icon>
              </button>
              @if (menuOpen) {
                <div class="menu" role="menu">
                  <button type="button" role="menuitem" (click)="doExport()">Export CSV</button>
                  <button type="button" role="menuitem" (click)="expand()">Expand</button>
                </div>
              }
            </div>
          }
        </header>
        <div class="widget__body">
          <ng-content></ng-content>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaWidget {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) title = '';
  @Input() info = '';
  @Output() exportCsv = new EventEmitter<void>();

  menuOpen = false;
  expanded = false;
  readonly icons = { GripVertical, Info, Ellipsis, X };

  doExport(): void {
    this.menuOpen = false;
    this.exportCsv.emit();
  }

  expand(): void {
    this.menuOpen = false;
    this.expanded = true;
  }

  backdrop(e: MouseEvent): void {
    if (this.expanded && e.target === e.currentTarget) this.expanded = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.expanded = false;
    this.menuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeOutside(e: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(e.target as Node)) this.menuOpen = false;
  }
}
