import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { Ellipsis, LucideAngularModule } from 'lucide-angular';

export const WIDGET_MENU = ['Export CSV', 'Expand'];
export const KPI_MENU = ['View details', 'Export'];

/** "⋯" button with a small dropdown; closes on outside click or Escape. */
@Component({
  selector: 'ra-menu',
  standalone: true,
  imports: [LucideAngularModule],
  styleUrls: ['../../shared/analytics-page.css'],
  styles: [':host { display: inline-block; }'],
  template: `
    <div class="row-menu">
      <button type="button" class="icon-btn" [attr.aria-label]="label" aria-haspopup="menu" [attr.aria-expanded]="open" (click)="toggle()">
        <lucide-icon [img]="icons.Ellipsis" [size]="18" />
      </button>
      @if (open) {
        <div class="menu" role="menu">
          @for (item of items; track item) {
            <button type="button" role="menuitem" (click)="pick(item)">{{ item }}</button>
          }
        </div>
      }
    </div>
  `
})
export class RaMenu {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { Ellipsis };
  @Input() items: string[] = WIDGET_MENU;
  @Input() label = 'More actions';
  @Output() select = new EventEmitter<string>();
  open = false;

  toggle(): void {
    this.open = !this.open;
  }

  pick(item: string): void {
    this.open = false;
    this.select.emit(item);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }
}
