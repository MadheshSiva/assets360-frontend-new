import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ReportFrequency, ReportModule, ReportPeriod, ReportStatus, SR_MODULES, SR_STATUSES, SR_TIME_ZONES
} from './standard-reports.data';
import { NewStandardReport } from './standard-reports.service';

const FREQUENCIES: ReportFrequency[] = ['On demand', 'Daily', 'Weekly', 'Monthly', 'Quarterly'];

/** "New report" form: posts a standard report definition to the API. */
@Component({
  selector: 'app-sr-create-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="sr-create-title" (click)="stop($event)" (ngSubmit)="submit()">
        <h2 id="sr-create-title">New standard report</h2>
        <div class="field" [class.invalid]="submitted && !name.trim()">
          <label for="sr-c-name">Report name <span class="req">*</span></label>
          <input id="sr-c-name" name="name" maxlength="150" [(ngModel)]="name" />
          @if (submitted && !name.trim()) {
            <small>Enter a report name.</small>
          }
        </div>
        <div class="field">
          <label for="sr-c-desc">Description</label>
          <textarea id="sr-c-desc" name="description" rows="2" maxlength="500" [(ngModel)]="description"></textarea>
        </div>
        <div class="sr-form-grid">
          <div class="field" [class.invalid]="submitted && !module">
            <label for="sr-c-cat">Category <span class="req">*</span></label>
            <select id="sr-c-cat" name="module" [(ngModel)]="module">
              <option value="" disabled>Select Category</option>
              @for (m of modules; track m) {
                <option [value]="m">{{ m }}</option>
              }
            </select>
            @if (submitted && !module) {
              <small>Choose a category.</small>
            }
          </div>
          <div class="field">
            <label for="sr-c-type">Report type</label>
            <input id="sr-c-type" name="reportType" placeholder="e.g. Summary" maxlength="100" [(ngModel)]="reportType" />
          </div>
          <div class="field" [class.invalid]="!!periodError">
            <label for="sr-c-from">Period from <span class="req">*</span></label>
            <input id="sr-c-from" name="start" type="date" [(ngModel)]="start" />
            @if (periodError) {
              <small>{{ periodError }}</small>
            }
          </div>
          <div class="field" [class.invalid]="!!periodError">
            <label for="sr-c-to">Period to <span class="req">*</span></label>
            <input id="sr-c-to" name="end" type="date" [(ngModel)]="end" />
          </div>
          @if (includeTime) {
            <div class="field">
              <label for="sr-c-from-t">Start time</label>
              <input id="sr-c-from-t" name="startTime" type="time" [(ngModel)]="startTime" />
            </div>
            <div class="field">
              <label for="sr-c-to-t">End time</label>
              <input id="sr-c-to-t" name="endTime" type="time" [(ngModel)]="endTime" />
            </div>
          }
          <div class="field" [class.invalid]="submitted && !timeZone">
            <label for="sr-c-tz">Time zone <span class="req">*</span></label>
            <select id="sr-c-tz" name="timeZone" [(ngModel)]="timeZone">
              <option value="" disabled>Select Time Zone</option>
              @for (z of timeZones; track z.value) {
                <option [value]="z.value">{{ z.label }}</option>
              }
            </select>
            @if (submitted && !timeZone) {
              <small>Choose a time zone.</small>
            }
          </div>
          <div class="field">
            <span>&nbsp;</span>
            <label class="switch">
              <input type="checkbox" name="includeTime" [(ngModel)]="includeTime" />
              <i></i>
              Include time
            </label>
          </div>
          <div class="field" [class.invalid]="submitted && !frequency">
            <label for="sr-c-freq">Frequency <span class="req">*</span></label>
            <select id="sr-c-freq" name="frequency" [(ngModel)]="frequency">
              <option value="" disabled>Select Frequency</option>
              @for (f of frequencies; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
            @if (submitted && !frequency) {
              <small>Choose a frequency.</small>
            }
          </div>
          <div class="field" [class.invalid]="submitted && !status">
            <label for="sr-c-status">Status <span class="req">*</span></label>
            <select id="sr-c-status" name="status" [(ngModel)]="status">
              <option value="" disabled>Select Status</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
            @if (submitted && !status) {
              <small>Choose a status.</small>
            }
          </div>
          <div class="field">
            <label for="sr-c-next">Next scheduled on</label>
            <input id="sr-c-next" name="nextScheduled" type="datetime-local" [(ngModel)]="nextScheduled" />
          </div>
          <div class="field">
            <label for="sr-c-review">Review due on</label>
            <input id="sr-c-review" name="reviewDue" type="date" [(ngModel)]="reviewDue" />
          </div>
        </div>
        @if (error) {
          <p class="sr-period__error" role="alert">{{ error }}</p>
        }
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="close.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="saving">{{ saving ? 'Saving…' : 'Create report' }}</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportCreateDialog implements OnInit {
  /** Prefills the period with the applied reporting period. */
  @Input({ required: true }) period!: ReportPeriod;
  @Input() saving = false;
  /** Server error from the last attempt. */
  @Input() error = '';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<NewStandardReport>();

  readonly modules = SR_MODULES;
  readonly statuses = SR_STATUSES;
  readonly frequencies = FREQUENCIES;
  readonly timeZones = SR_TIME_ZONES;

  name = '';
  description = '';
  module = '' as ReportModule;
  reportType = '';
  start = '';
  end = '';
  includeTime = false;
  startTime = '00:00';
  endTime = '23:59';
  timeZone = '';
  frequency = '' as ReportFrequency;
  status = '' as ReportStatus;
  nextScheduled = '';
  reviewDue = '';
  submitted = false;

  get periodError(): string {
    if (!this.submitted) return '';
    if (!this.start || !this.end) return 'Enter the period dates.';
    const from = this.start + (this.includeTime ? this.startTime : '');
    const to = this.end + (this.includeTime ? this.endTime : '');
    return from > to ? 'The start must be before the end.' : '';
  }

  ngOnInit(): void {
    this.start = this.period.start;
    this.end = this.period.end;
    this.includeTime = !!this.period.startTime;
    this.startTime = this.period.startTime ?? '00:00';
    this.endTime = this.period.endTime ?? '23:59';
  }

  submit(): void {
    this.submitted = true;
    if (!this.name.trim() || !this.module || !this.timeZone || !this.frequency || !this.status || this.periodError || this.saving) return;
    this.save.emit({
      name: this.name,
      description: this.description,
      module: this.module,
      reportType: this.reportType,
      period: {
        start: this.start,
        end: this.end,
        startTime: this.includeTime ? this.startTime : null,
        endTime: this.includeTime ? this.endTime : null,
        timeZone: this.timeZone
      },
      frequency: this.frequency,
      status: this.status,
      nextScheduled: this.nextScheduled || null,
      reviewDue: this.reviewDue || null
    });
  }

  stop(event: Event): void {
    event.stopPropagation();
  }
}
