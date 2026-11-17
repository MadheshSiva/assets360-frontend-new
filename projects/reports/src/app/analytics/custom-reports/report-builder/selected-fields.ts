import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GripVertical, LucideAngularModule, Plus, X } from 'lucide-angular';
import { CalcFieldDialog } from '../dialogs/calc-field-dialog';
import { fieldOf, removeField } from '../custom-reports.engine';
import { CalcField, CustomReport } from '../custom-reports.model';

/** Selected field chips: remove, drag (or Alt+←/→) to reorder, clear all and add a calculated field. */
@Component({
  selector: 'cr-selected-fields',
  imports: [LucideAngularModule, CalcFieldDialog],
  template: `
    <div class="cr-panel__head">
      <h3>Selected Fields ({{ report.fields.length }})</h3>
      @if (report.fields.length) {
        <button type="button" class="btn btn--link" (click)="clearAll()">Clear all</button>
      }
    </div>
    <div class="cr-chips" (dragover)="allowDrop($event)">
      @for (key of report.fields; track key; let i = $index) {
        <span class="cr-chip" draggable="true" tabindex="0" [class.cr-chip--drag]="dragIndex === i"
          [attr.aria-label]="label(key) + ', position ' + (i + 1) + '. Alt plus arrow keys to move.'"
          (dragstart)="dragStart(i)" (dragend)="dragIndex = null" (dragover)="allowDrop($event)" (drop)="drop(i)"
          (keydown)="chipKey($event, i)">
          <lucide-icon class="cr-chip__grip" [img]="GripVertical" [size]="13" />
          {{ label(key) }}
          <button type="button" (click)="remove(key)" [attr.aria-label]="'Remove ' + label(key)">
            <lucide-icon [img]="X" [size]="13" />
          </button>
        </span>
      } @empty {
        <p class="muted cr-chips__empty">No fields selected yet. Tick fields in the list to add them.</p>
      }
    </div>
    <button type="button" class="btn btn--outline btn--sm" (click)="calcOpen = true">
      <lucide-icon [img]="Plus" [size]="14" /> Add calculated field
    </button>

    @if (calcOpen) {
      <cr-calc-field-dialog [report]="report" (save)="addCalc($event)" (close)="calcOpen = false" />
    }
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class SelectedFields {
  @Input({ required: true }) report!: CustomReport;
  @Output() notice = new EventEmitter<string>();

  readonly GripVertical = GripVertical;
  readonly X = X;
  readonly Plus = Plus;

  dragIndex: number | null = null;
  calcOpen = false;

  label(key: string): string {
    return fieldOf(this.report, key)?.label ?? key;
  }

  remove(key: string): void {
    removeField(this.report, key);
  }

  clearAll(): void {
    for (const key of [...this.report.fields]) removeField(this.report, key);
    this.notice.emit('All selected fields cleared.');
  }

  dragStart(i: number): void {
    this.dragIndex = i;
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  drop(target: number): void {
    if (this.dragIndex === null || this.dragIndex === target) return;
    this.move(this.dragIndex, target);
    this.dragIndex = null;
  }

  chipKey(event: KeyboardEvent, i: number): void {
    if (!event.altKey) return;
    if (event.key === 'ArrowLeft' && i > 0) {
      event.preventDefault();
      this.move(i, i - 1);
    } else if (event.key === 'ArrowRight' && i < this.report.fields.length - 1) {
      event.preventDefault();
      this.move(i, i + 1);
    }
  }

  private move(from: number, to: number): void {
    const list = [...this.report.fields];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    this.report.fields = list;
  }

  addCalc(calc: CalcField): void {
    this.report.calcFields = [...this.report.calcFields, calc];
    this.report.fields = [...this.report.fields, calc.key];
    this.calcOpen = false;
    this.notice.emit(`Calculated field “${calc.label}” added.`);
  }
}
