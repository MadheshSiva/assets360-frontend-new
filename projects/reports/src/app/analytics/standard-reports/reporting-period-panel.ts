import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarDays, Globe, LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { ReportPeriod, SR_TIME_ZONES } from './standard-reports.data';
import { StandardReportsService } from './standard-reports.service';

const PRESETS = ['Today', 'This week', 'This month', 'This quarter', 'This year'];

/** Reporting period editor: date range, quick ranges (resolved by GET /api/standard-reports/period), time zone and "include time". */
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
          <select aria-label="Time zone" [(ngModel)]="timeZone" (ngModelChange)="timeZoneChanged()">
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
        <button type="button" class="btn btn--primary sr-period__apply" [disabled]="busy" (click)="submit()">{{ busy ? 'Applying…' : 'Apply Dates' }}</button>
      </div>
    </section>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportingPeriodPanel implements OnChanges {
  @Input({ required: true }) period!: ReportPeriod;
  /** True while the page is saving the period */
  @Input() busy = false;
  @Output() apply = new EventEmitter<ReportPeriod>();

  private readonly service = inject(StandardReportsService);

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
  /** Quick ranges resolved by the API for the selected time zone */
  private ranges: Record<string, { start: string; end: string }> = {};
  private rangesZone = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['period']) return;
    this.start = this.period.start;
    this.end = this.period.end;
    this.includeTime = !!this.period.startTime;
    this.startTime = this.period.startTime ?? '00:00';
    this.endTime = this.period.endTime ?? '23:59';
    this.timeZone = this.period.timeZone;
    this.preset = this.matchingPreset();
    this.loadRanges();
  }

  usePreset(p: string): void {
    const range = this.ranges[p];
    if (range) {
      this.useRange(p, range);
      return;
    }
    this.service.resolvePeriod(p, this.timeZone).subscribe({
      next: (r) => {
        this.ranges[p] = r;
        this.useRange(p, r);
      },
      error: (err: Error) => (this.error = err.message)
    });
  }

  timeZoneChanged(): void {
    this.loadRanges();
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

  private useRange(p: string, range: { start: string; end: string }): void {
    this.start = range.start;
    this.end = range.end;
    this.preset = p;
    this.error = '';
  }

  private matchingPreset(): string {
    for (const p of PRESETS) {
      const r = this.ranges[p];
      if (r && r.start === this.start && r.end === this.end) return p;
    }
    return '';
  }

  /** Resolve every quick range for the time zone once, so the matching button can be highlighted. */
  private loadRanges(): void {
    const zone = this.timeZone;
    if (!zone || zone === this.rangesZone) return;
    this.rangesZone = zone;
    this.ranges = {};
    forkJoin(PRESETS.map((p) => this.service.resolvePeriod(p, zone))).subscribe({
      next: (list) => {
        if (zone !== this.timeZone) return;
        PRESETS.forEach((p, i) => (this.ranges[p] = list[i]));
        this.preset = this.matchingPreset();
      },
      // Buttons still work: each one resolves on click
      error: () => (this.rangesZone = '')
    });
  }
}
