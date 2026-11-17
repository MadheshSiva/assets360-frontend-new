import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataJob, JobSchedule, ScheduleFrequency } from '../data-import.model';
import { WEEKDAYS } from '../data-import.data';
import { formatStamp } from '../data-import.util';

/** Schedule tab: run manually, once, or on a daily / weekly / monthly cadence. */
@Component({
  selector: 'app-adm-job-schedule',
  imports: [FormsModule],
  styleUrls: ['../../shared/admin-workspace.css', '../data-import-export.css'],
  template: `
    <div class="panel__head"><h3>Schedule</h3></div>
    <form (ngSubmit)="save()" novalidate class="schedule">
      <div class="schedule__modes" role="radiogroup" aria-label="Schedule type">
        <label [class.active]="s.mode === 'manual'"><input type="radio" name="mode" value="manual" [(ngModel)]="s.mode" />
          <span><b>Run manually</b><small>Only when someone clicks Run Now</small></span></label>
        <label [class.active]="s.mode === 'once'"><input type="radio" name="mode" value="once" [(ngModel)]="s.mode" />
          <span><b>One-time</b><small>Run once at a set date and time</small></span></label>
        <label [class.active]="s.mode === 'recurring'"><input type="radio" name="mode" value="recurring" [(ngModel)]="s.mode" />
          <span><b>Recurring</b><small>Repeat daily, weekly or monthly</small></span></label>
      </div>

      @if (s.mode === 'once') {
        <div class="grid2">
          <div class="field" [class.invalid]="error">
            <label for="sch-date">Run Date <span class="req">*</span></label>
            <input id="sch-date" type="date" name="date" [min]="today" [(ngModel)]="s.date" />
            @if (error) { <small>{{ error }}</small> }
          </div>
          <div class="field">
            <label for="sch-time">Time</label>
            <input id="sch-time" type="time" name="time" [(ngModel)]="s.time" />
          </div>
        </div>
      }

      @if (s.mode === 'recurring') {
        <div class="seg">
          @for (fq of frequencies; track fq) {
            <button type="button" [class.active]="s.frequency === fq" (click)="setFrequency(fq)">{{ fq }}</button>
          }
        </div>
        <div class="grid2">
          @if (s.frequency === 'Weekly') {
            <div class="field">
              <label for="sch-day">Day of Week</label>
              <select id="sch-day" name="day" [(ngModel)]="s.day">
                <option value="" disabled>Select Day of Week</option>
                @for (d of weekdays; track d) { <option [value]="d">{{ d }}</option> }
              </select>
            </div>
          }
          @if (s.frequency === 'Monthly') {
            <div class="field">
              <label for="sch-dom">Day of Month</label>
              <select id="sch-dom" name="day" [(ngModel)]="s.day">
                <option value="" disabled>Select Day of Month</option>
                @for (d of monthDays; track d) { <option [value]="d">{{ d }}</option> }
              </select>
            </div>
          }
          <div class="field">
            <label for="sch-rtime">Time</label>
            <input id="sch-rtime" type="time" name="time" [(ngModel)]="s.time" />
          </div>
        </div>
      }

      <div class="note">{{ summary }}</div>
      <div class="schedule__foot">
        <button type="submit" class="btn btn--primary">Save Schedule</button>
      </div>
    </form>
  `
})
export class JobScheduleTab implements OnChanges {
  @Input({ required: true }) job!: DataJob;
  @Output() scheduleChange = new EventEmitter<JobSchedule>();

  readonly frequencies: ScheduleFrequency[] = ['Daily', 'Weekly', 'Monthly'];
  readonly weekdays = WEEKDAYS;
  readonly monthDays = Array.from({ length: 28 }, (_, i) => String(i + 1));
  readonly today = new Date().toISOString().slice(0, 10);
  s!: JobSchedule;
  error = '';

  ngOnChanges(): void {
    this.s = { ...this.job.schedule };
    this.error = '';
  }

  setFrequency(fq: ScheduleFrequency): void {
    this.s.frequency = fq;
    if (fq === 'Weekly' && !this.weekdays.includes(this.s.day)) this.s.day = 'Monday';
    if (fq === 'Monthly' && !this.monthDays.includes(this.s.day)) this.s.day = '1';
  }

  get summary(): string {
    const s = this.s;
    if (s.mode === 'manual') return 'This job runs only when started manually.';
    if (s.mode === 'once') return s.date ? `Runs once on ${formatStamp(s.date)} at ${s.time}.` : 'Pick a date for the one-time run.';
    if (s.frequency === 'Daily') return `Runs every day at ${s.time}.`;
    if (s.frequency === 'Weekly') return `Runs every ${s.day} at ${s.time}.`;
    return `Runs on day ${s.day} of every month at ${s.time}.`;
  }

  save(): void {
    this.error = '';
    if (this.s.mode === 'once' && (!this.s.date || this.s.date < this.today)) {
      this.error = 'Choose today or a future date.';
      return;
    }
    if (!this.s.time) this.s.time = '02:00';
    this.scheduleChange.emit({ ...this.s });
  }
}
