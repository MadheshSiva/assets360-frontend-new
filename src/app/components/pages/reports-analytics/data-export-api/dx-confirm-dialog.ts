import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Small confirm dialog used for deletes. */
@Component({
  standalone: true,
  selector: 'dx-confirm-dialog',
  styleUrls: ['../shared/analytics-page.css'],
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dx-confirm-title" (click)="$event.stopPropagation()">
        <h2 id="dx-confirm-title">{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="button" class="btn btn--primary" (click)="confirm.emit()">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  `
})
export class ConfirmDialog {
  @Input({ required: true }) title = '';
  @Input({ required: true }) message = '';
  @Input() confirmLabel = 'Delete';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
