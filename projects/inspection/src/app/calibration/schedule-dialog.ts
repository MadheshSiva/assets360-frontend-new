import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { CalibrationInstrument } from '../shared/inspection.models';
import { isoDay } from '../shared/insp-utils';
import { calibrationStatus } from './calibration-utils';

/** Small dialog: pick an instrument and a date; sets its next due date and recalculates the status. */
@Component({
  selector: 'app-insp-schedule-dialog',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="dialog" role="dialog" aria-label="Schedule calibration">
      <div class="d-head">
        <h2 class="grow">Schedule Calibration</h2>
        <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="18"></lucide-icon></button>
      </div>
      @if (error()) { <div class="alert">{{ error() }}</div> }
      <label class="field"><span class="field-label">Instrument <span class="req">*</span></span>
        <select class="control" [(ngModel)]="instrumentKey">
          <option value="">Select Instrument</option>
          @for (i of api.instruments.items(); track i.id) { <option [value]="i.id">{{ i.instrumentCode }} — {{ i.instrumentName }}</option> }
        </select></label>
      <label class="field"><span class="field-label">Calibration date <span class="req">*</span></span>
        <input class="control" type="date" [min]="today" [(ngModel)]="date" /></label>
      <div class="d-foot">
        <button type="button" class="btn btn-outline" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Schedule' }}</button>
      </div>
    </div>
  `,
  styles: [
    `.dialog { position: fixed; z-index: 901; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px));
        display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; background: #fff; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.2); }
     .d-head { display: flex; align-items: center; } .d-head h2 { margin: 0; font-size: 18px; }
     .d-foot { display: flex; justify-content: flex-end; gap: 10px; }`
  ],
  styleUrls: ['../shared/insp-page.css']
})
export class ScheduleDialog implements OnInit {
  readonly api = inject(InspectionApi);
  readonly instrumentId = input<string | null>(null);
  readonly saved = output<CalibrationInstrument>();
  readonly closed = output<void>();

  readonly icons = { X };
  readonly today = isoDay(new Date());
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  instrumentKey = '';
  date = '';

  ngOnInit(): void {
    this.instrumentKey = this.instrumentId() ?? '';
    const current = this.api.instruments.byId(this.instrumentKey);
    this.date = current?.nextDue && current.nextDue.slice(0, 10) >= this.today ? current.nextDue.slice(0, 10) : this.today;
  }

  save(): void {
    const inst = this.api.instruments.byId(this.instrumentKey);
    if (!inst) return this.error.set('Select an instrument.');
    if (!this.date) return this.error.set('Pick a calibration date.');
    this.error.set(null);
    this.saving.set(true);
    const record: CalibrationInstrument = { ...inst, nextDue: this.date };
    record.status = calibrationStatus(record, this.today);
    this.api.instruments.save(record).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.saved.emit(s);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(e));
      }
    });
  }
}
