import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Small confirm dialog used for deletes and other destructive actions. */
@Component({
  selector: 'cr-confirm-dialog',
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cr-confirm-title" (click)="$event.stopPropagation()">
        <h2 id="cr-confirm-title">{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="button" class="btn btn--primary cr-danger-btn" (click)="confirm.emit()">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class ConfirmDialog {
  @Input() title = 'Are you sure?';
  @Input() message = '';
  @Input() confirmLabel = 'Delete';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
