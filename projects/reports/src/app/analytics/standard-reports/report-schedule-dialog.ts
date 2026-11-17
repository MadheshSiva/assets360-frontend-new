import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { CURRENT_USER } from '../shared/analytics-common';
import { ReportFormat, ReportFrequency, ReportSchedule, SR_FORMATS, SR_SCHEDULE_FREQUENCIES, StandardReport } from './standard-reports.data';
import { WEEKDAYS, isEmail } from './standard-reports.util';

/** Schedule editor: frequency, day, time, recipients (email chips) and output format. */
@Component({
  selector: 'app-sr-schedule-dialog',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="sr-schedule-title" (click)="stop($event)" (ngSubmit)="submit()">
        <h2 id="sr-schedule-title">Schedule report</h2>
        <p>{{ report.name }} · times are in Asia/Dubai (GST).</p>
        <div class="sr-form-grid">
          <div class="field" [class.invalid]="submitted && !frequency">
            <label for="sr-freq">Frequency <span class="req">*</span></label>
            <select id="sr-freq" name="frequency" [(ngModel)]="frequency" (ngModelChange)="frequencyChanged()">
              <option value="" disabled>Select Frequency</option>
              @for (f of frequencies; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
            @if (submitted && !frequency) {
              <small>Choose a frequency.</small>
            }
          </div>
          <div class="field" [class.invalid]="submitted && dayMissing">
            <label for="sr-day">{{ dayLabel }} <span class="req">*</span></label>
            @if (frequency === 'Weekly') {
              <select id="sr-day" name="day" [(ngModel)]="day">
                <option [ngValue]="null" disabled>Select Day</option>
                @for (w of weekdays; track $index) {
                  <option [ngValue]="$index">{{ w }}</option>
                }
              </select>
            } @else if (frequency === 'Daily') {
              <select id="sr-day" name="day" disabled>
                <option value="" disabled>Select Day</option>
                <option>Every day</option>
              </select>
            } @else {
              <select id="sr-day" name="day" [(ngModel)]="day">
                <option [ngValue]="null" disabled>Select Day</option>
                @for (d of monthDays; track d) {
                  <option [ngValue]="d">{{ dayText(d) }}</option>
                }
              </select>
            }
            @if (submitted && dayMissing) {
              <small>Choose a day.</small>
            }
          </div>
          <div class="field" [class.invalid]="submitted && !time">
            <label for="sr-time">Time <span class="req">*</span></label>
            <input id="sr-time" name="time" type="time" [(ngModel)]="time" />
            @if (submitted && !time) {
              <small>Choose a time.</small>
            }
          </div>
          <div class="field" [class.invalid]="submitted && !format">
            <label for="sr-format">Format <span class="req">*</span></label>
            <select id="sr-format" name="format" [(ngModel)]="format">
              <option value="" disabled>Select Format</option>
              @for (f of formats; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
            @if (submitted && !format) {
              <small>Choose a format.</small>
            }
          </div>
        </div>
        <div class="field" [class.invalid]="!!emailError || (submitted && recipients.length === 0)">
          <label for="sr-recipient">Recipients <span class="req">*</span></label>
          <div class="sr-chips">
            @for (r of recipients; track r) {
              <span class="sr-chip">
                {{ r }}
                <button type="button" [attr.aria-label]="'Remove ' + r" (click)="removeRecipient(r)">
                  <lucide-icon [img]="icons.X" [size]="12" />
                </button>
              </span>
            }
            <input
              id="sr-recipient"
              name="recipient"
              type="email"
              placeholder="name@purpleiq.com, press Enter"
              [(ngModel)]="draftEmail"
              (keydown)="recipientKey($event)"
              (blur)="addRecipient()"
            />
          </div>
          @if (emailError) {
            <small>{{ emailError }}</small>
          } @else if (submitted && recipients.length === 0) {
            <small>Add at least one recipient.</small>
          } @else {
            <small>Press Enter or comma to add an address.</small>
          }
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Save schedule</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportScheduleDialog implements OnChanges {
  @Input({ required: true }) report!: StandardReport;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<ReportSchedule>();

  readonly icons = { X };
  readonly frequencies = SR_SCHEDULE_FREQUENCIES;
  readonly formats = SR_FORMATS;
  readonly weekdays = WEEKDAYS;
  readonly monthDays = Array.from({ length: 28 }, (_, i) => i + 1);

  frequency = '' as ReportFrequency;
  day: number | null = null;
  time = '08:00';
  format = '' as ReportFormat;
  recipients: string[] = [];
  draftEmail = '';
  emailError = '';
  submitted = false;

  get dayLabel(): string {
    return this.frequency === 'Weekly' ? 'Day of week' : this.frequency === 'Daily' ? 'Day' : this.frequency === 'Quarterly' ? 'Day of quarter month' : 'Day of month';
  }

  get dayMissing(): boolean {
    return this.frequency !== 'Daily' && this.day === null;
  }

  ngOnChanges(): void {
    const s = this.report.schedule;
    this.frequency = s?.frequency ?? ('' as ReportFrequency);
    this.day = s ? s.day : null;
    this.time = s?.time ?? '08:00';
    this.format = s?.format ?? ('' as ReportFormat);
    this.recipients = s ? [...s.recipients] : [CURRENT_USER.email];
    this.submitted = false;
  }

  dayText(d: number): string {
    const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
    return `${d}${suffix} day`;
  }

  frequencyChanged(): void {
    this.day = null;
  }

  recipientKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addRecipient();
    } else if (event.key === 'Backspace' && !this.draftEmail && this.recipients.length) {
      this.recipients = this.recipients.slice(0, -1);
    }
  }

  addRecipient(): void {
    const email = this.draftEmail.trim().replace(/,$/, '').toLowerCase();
    if (!email) {
      this.emailError = '';
      return;
    }
    if (!isEmail(email)) {
      this.emailError = `“${email}” is not a valid email address.`;
      return;
    }
    if (!this.recipients.includes(email)) this.recipients = [...this.recipients, email];
    this.draftEmail = '';
    this.emailError = '';
  }

  removeRecipient(email: string): void {
    this.recipients = this.recipients.filter((r) => r !== email);
  }

  submit(): void {
    this.addRecipient();
    this.submitted = true;
    if (this.emailError || !this.frequency || this.dayMissing || !this.time || !this.format || this.recipients.length === 0) return;
    this.save.emit({ frequency: this.frequency, day: this.day ?? 1, time: this.time, recipients: [...this.recipients], format: this.format });
  }

  stop(event: Event): void {
    event.stopPropagation();
  }
}
