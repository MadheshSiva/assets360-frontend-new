import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ComboOption {
  value: string;
  /** Extra text shown after the value in the list (e.g. device name · model). */
  hint?: string;
}

/**
 * Free-text input with a suggestion list that opens on the first click or focus.
 * Replaces <datalist>, whose list in Chrome only opens on a second click of an already focused input.
 */
@Component({
  selector: 'sm-combo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <input class="smc-input" [value]="value" [placeholder]="placeholder" [disabled]="disabled" autocomplete="off" spellcheck="false"
      role="combobox" [attr.aria-expanded]="open" aria-autocomplete="list"
      (focus)="show()" (click)="show()" (input)="onInput($event)" (keydown)="onKey($event)" (blur)="onBlur()" />
    <ul *ngIf="open && filtered.length" class="smc-list" role="listbox">
      <li *ngFor="let o of filtered; let i = index; trackBy: byValue" role="option" [class.is-active]="i === active" [attr.aria-selected]="i === active"
        (mousedown)="$event.preventDefault(); pick(o)" (mouseenter)="active = i">
        <span class="smc-val">{{ o.value }}</span><small *ngIf="o.hint">{{ o.hint }}</small>
      </li>
    </ul>
  `,
  styles: [`
    :host { position: relative; display: block; }
    .smc-input { width: 100%; height: 36px; box-sizing: border-box; padding: 0 11px; border: 1px solid var(--sm-control, #d6d9e0); border-radius: 8px; background: #fff; font: inherit; font-size: 13px; color: var(--sm-ink, #111827); outline: none; }
    .smc-input:focus { border-color: var(--sm-accent, #4f2bd8); box-shadow: 0 0 0 3px rgba(79, 43, 216, 0.12); }
    .smc-input:disabled { background: #f6f7f9; color: var(--sm-muted, #6b7280); }
    .smc-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; max-height: 220px; margin: 0; padding: 4px; overflow-y: auto; list-style: none; border: 1px solid var(--sm-control, #d6d9e0); border-radius: 8px; background: #fff; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14); }
    .smc-list li { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .smc-list li.is-active { background: #f1edff; }
    .smc-list small { font-size: 11.5px; color: var(--sm-muted, #6b7280); }
    .smc-val { font-weight: 600; color: var(--sm-ink, #111827); }
  `],
})
export class SmCombo {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() value = '';
  @Input() options: ComboOption[] = [];
  @Input() placeholder = '';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  /** Fires when the value is committed: an option picked, or the input left after typing. */
  @Output() committed = new EventEmitter<string>();

  open = false;
  active = -1;
  private typed = false;

  /** Options matching the typed text; all of them while the text equals the current value (just opened). */
  get filtered(): ComboOption[] {
    const q = this.typed ? this.value.trim().toLowerCase() : '';
    const list = q ? this.options.filter((o) => o.value.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q)) : this.options;
    return list.slice(0, 100);
  }

  byValue(_: number, o: ComboOption): string {
    return o.value;
  }

  show(): void {
    if (this.disabled) return;
    this.open = true;
  }

  onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.typed = true;
    this.open = true;
    this.active = -1;
    this.valueChange.emit(this.value);
  }

  onKey(e: KeyboardEvent): void {
    const list = this.filtered;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.open = true;
      this.active = Math.min(list.length - 1, this.active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = Math.max(0, this.active - 1);
    } else if (e.key === 'Enter' && this.open && list[this.active]) {
      e.preventDefault();
      this.pick(list[this.active]);
    } else if (e.key === 'Escape' && this.open) {
      e.stopPropagation(); // close the list, not the dialog
      this.open = false;
    }
  }

  pick(o: ComboOption): void {
    this.value = o.value;
    this.valueChange.emit(o.value);
    this.close();
    this.committed.emit(o.value);
  }

  onBlur(): void {
    if (!this.open && !this.typed) return;
    const changed = this.typed;
    this.close();
    if (changed) this.committed.emit(this.value);
  }

  private close(): void {
    this.open = false;
    this.typed = false;
    this.active = -1;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocDown(e: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(e.target as Node)) this.open = false;
  }
}
