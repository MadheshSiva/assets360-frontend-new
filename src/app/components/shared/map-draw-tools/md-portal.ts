import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Moves its element to <body> while it exists, so a dialog opened from inside the map escapes the map's stacking
 * context (and any transformed ancestor) and layers above the app's topbar like the other page modals.
 */
@Directive({ selector: '[mdPortal]', standalone: true })
export class MdPortal implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngOnInit(): void {
    document.body.appendChild(this.el);
  }

  ngOnDestroy(): void {
    this.el.remove();
  }
}
