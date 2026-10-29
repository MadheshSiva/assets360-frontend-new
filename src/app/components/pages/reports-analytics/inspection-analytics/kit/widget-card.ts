import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { Ellipsis, GripVertical, Info, LucideAngularModule, X } from 'lucide-angular';

/**
 * Report widget frame: title, info tip and a ⋯ menu with Export CSV / Expand (the card floats as a wide dialog)
 * plus any page-specific items. Put tools (e.g. a select) in the header with the `widget-tools` attribute.
 */
@Component({
  selector: 'app-ra-widget',
  imports: [LucideAngularModule],
  template: `
    @if (expanded) {
      <div class="rak-backdrop" (click)="expanded = false"></div>
    }
    <section class="widget rak-fill" [class.rak-expanded]="expanded" [attr.aria-label]="title">
      <header class="widget__head">
        <lucide-icon class="widget__grip" [img]="icons.GripVertical" [size]="16" />
        <h2>
          {{ title }}
          @if (info) {
            <span class="widget__info" [title]="info"><lucide-icon [img]="icons.Info" [size]="14" /></span>
          }
        </h2>
        <div class="rak-head-tools"><ng-content select="[widget-tools]" /></div>
        <div class="row-menu">
          <button type="button" class="icon-btn" aria-label="Widget options" [attr.aria-expanded]="menuOpen" (click)="menuOpen = !menuOpen">
            <lucide-icon [img]="icons.Ellipsis" [size]="18" />
          </button>
          @if (menuOpen) {
            <div class="menu" role="menu">
              <button type="button" role="menuitem" (click)="exportClicked()">Export CSV</button>
              <button type="button" role="menuitem" (click)="toggleExpand()">{{ expanded ? 'Collapse' : 'Expand' }}</button>
              @for (item of menuItems; track item) {
                <button type="button" role="menuitem" (click)="itemClicked(item)">{{ item }}</button>
              }
            </div>
          }
        </div>
        @if (expanded) {
          <button type="button" class="icon-btn" aria-label="Close" (click)="expanded = false"><lucide-icon [img]="icons.X" [size]="18" /></button>
        }
      </header>
      <div class="widget__body"><ng-content /></div>
    </section>
  `,
  styleUrls: ['../../shared/analytics-page.css', './kit.css']
})
export class RaWidget {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { Ellipsis, GripVertical, Info, X };

  @Input({ required: true }) title = '';
  @Input() info = '';
  /** Extra ⋯ menu entries after Export CSV / Expand */
  @Input() menuItems: string[] = [];
  @Output() exportCsv = new EventEmitter<void>();
  @Output() menuAction = new EventEmitter<string>();

  menuOpen = false;
  expanded = false;

  exportClicked(): void {
    this.menuOpen = false;
    this.exportCsv.emit();
  }

  toggleExpand(): void {
    this.menuOpen = false;
    this.expanded = !this.expanded;
  }

  itemClicked(item: string): void {
    this.menuOpen = false;
    this.menuAction.emit(item);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
    this.expanded = false;
  }
}
