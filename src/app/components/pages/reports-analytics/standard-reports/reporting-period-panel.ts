import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarDays, Globe, LucideAngularModule } from 'lucide-angular';
import { ReportPeriod, SR_TIME_ZONES } from './standard-reports.data';
import { quickRange } from './standard-reports.util';

const PRESETS = ['Today', 'This week', 'This month', 'This quarter', 'This year'];

/** Reporting period editor: date range, quick ranges, time zone and "include time". */
@Component({
  selector: 'app-sr-period-panel',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <section class="widget sr-period">
      <div class="widget__head">
        <h2>Reporting period <span class="muted sr-period__sub">– Date representation</span></h2>
      </div>
      <div class="sr-period__row">
        <div class="sr-range" [class.sr-range--invalid]="error">
          <lucide-icon [img]="icons.CalendarDays" [size]="18" />
          <input type="date" aria-label="Start date" [(ngModel)]="start" (ngModelChange)="edited()" />
          @if (includeTime) {
            <input type="time" aria-label="Start time" [(ngModel)]="startTime" (ngModelChange)="edited()" />
          }
          <span>–</span>
          <input type="date" aria-label="End date" [(ngModel)]="end" (ngModelChange)="edited()" />
          @if (includeTime) {
            <input type="time" aria-label="End time" [(ngModel)]="endTime" (ngModelChange)="edited()" />
          }
        </div>
        <div class="sr-presets" role="group" aria-label="Quick ranges">
          @for (p of presets; track p) {
            <button type="button" class="btn" [class.btn--primary]="preset === p" (click)="usePreset(p)">{{ p }}</button>
          }
        </div>
      </div>
      <div class="sr-period__row">
        <label class="sr-tz">
          <lucide-icon [img]="icons.Globe" [size]="18" />
          <select aria-label="Time zone" [(ngModel)]="timeZone">
            @for (z of timeZones; track z.value) {
              <option [value]="z.value">{{ z.label }}</option>
            }
          </select>
        </label>
        <label class="switch">
          <input type="checkbox" [(ngModel)]="includeTime" (ngModelChange)="edited()" />
          <i></i>
          Include time
        </label>
        <span class="sr-period__error">{{ error }}</span>
        <button type="button" class="btn btn--primary sr-period__apply" (click)="submit()">Apply Dates</button>
      </div>
    </section>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportingPeriodPanel implements OnChanges {
  @Input({ required: true }) period!: ReportPeriod;
  @Input({ required: true }) today = '';
  @Output() apply = new EventEmitter<ReportPeriod>();

  readonly icons = { CalendarDays, Globe };
  readonly presets = PRESETS;
  readonly timeZones = SR_TIME_ZONES;

  start = '';
  end = '';
  startTime = '00:00';
  endTime = '23:59';
  includeTime = false;
  timeZone = 'Asia/Dubai';
  preset = '';
  error = '';

  ngOnChanges(): void {
    this.start = this.period.start;
    this.end = this.period.end;
    this.includeTime = !!this.period.startTime;
    this.startTime = this.period.startTime ?? '00:00';
    this.endTime = this.period.endTime ?? '23:59';
    this.timeZone = this.period.timeZone;
    this.preset = this.matchingPreset();
  }

  usePreset(p: string): void {
    const range = quickRange(p, this.today);
    this.start = range.start;
    this.end = range.end;
    this.preset = p;
    this.error = '';
  }

  edited(): void {
    this.preset = this.matchingPreset();
    this.error = '';
  }

  submit(): void {
    if (!this.start || !this.end) {
      this.error = 'Enter a start and an end date.';
      return;
    }
    if (this.includeTime && (!this.startTime || !this.endTime)) {
      this.error = 'Enter a start and an end time.';
      return;
    }
    const from = this.start + (this.includeTime ? this.startTime : '');
    const to = this.end + (this.includeTime ? this.endTime : '');
    if (from > to) {
      this.error = 'The start must be before the end.';
      return;
    }
    this.error = '';
    this.apply.emit({
      start: this.start,
      end: this.end,
      startTime: this.includeTime ? this.startTime : null,
      endTime: this.includeTime ? this.endTime : null,
      timeZone: this.timeZone
    });
  }

  private matchingPreset(): string {
    for (const p of PRESETS) {
      const r = quickRange(p, this.today);
      if (r.start === this.start && r.end === this.end) return p;
    }
    return '';
  }
}
