import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ChevronLeft, ChevronRight, LucideAngularModule } from 'lucide-angular';
import { StandardReport } from './standard-reports.data';
import { MONTH_NAMES, formatDay, isoDay, parseDay } from './standard-reports.util';

interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  generated: number;
  scheduled: number;
  review: number;
  label: string;
}

/** Month calendar marking report generated / scheduled / review-due dates. Clicking a day filters the table. */
@Component({
  selector: 'app-sr-report-calendar',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <section class="widget sr-cal">
      <div class="sr-cal__head">
        <h2>{{ title }}</h2>
        <button type="button" class="icon-btn" aria-label="Previous month" (click)="move(-1)">
          <lucide-icon [img]="icons.ChevronLeft" [size]="18" />
        </button>
        <button type="button" class="icon-btn" aria-label="Next month" (click)="move(1)">
          <lucide-icon [img]="icons.ChevronRight" [size]="18" />
        </button>
      </div>
      <div class="sr-cal__grid" role="grid">
        @for (d of weekdays; track d) {
          <span class="sr-cal__dow">{{ d }}</span>
        }
        @for (c of cells; track c.iso) {
          <button
            type="button"
            class="sr-cal__day"
            [class.sr-cal__day--out]="!c.inMonth"
            [class.sr-cal__day--today]="c.isToday"
            [class.sr-cal__day--generated]="c.generated > 0"
            [class.sr-cal__day--scheduled]="c.generated === 0 && c.scheduled > 0"
            [class.sr-cal__day--review]="c.generated === 0 && c.scheduled === 0 && c.review > 0"
            [class.sr-cal__day--selected]="c.iso === selected"
            [attr.aria-pressed]="c.iso === selected"
            [attr.aria-label]="c.label"
            [title]="c.label"
            (click)="pick(c.iso)"
          >
            {{ c.day }}
            <span class="sr-cal__dots">
              @if (c.generated) { <i class="sr-dot sr-dot--generated"></i> }
              @if (c.scheduled) { <i class="sr-dot sr-dot--scheduled"></i> }
              @if (c.review) { <i class="sr-dot sr-dot--review"></i> }
            </span>
          </button>
        }
      </div>
      <div class="sr-cal__legend">
        <span><i class="sr-dot sr-dot--generated"></i>Generated</span>
        <span><i class="sr-dot sr-dot--scheduled"></i>Scheduled</span>
        <span><i class="sr-dot sr-dot--review"></i>Review due</span>
      </div>
    </section>
  `,
  styleUrls: ['../shared/analytics-page.css', './standard-reports.css']
})
export class ReportCalendar implements OnChanges {
  @Input({ required: true }) reports: StandardReport[] = [];
  @Input({ required: true }) today = '';
  @Input() selected: string | null = null;
  @Output() selectDay = new EventEmitter<string | null>();

  readonly icons = { ChevronLeft, ChevronRight };
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  year = 2026;
  month = 9;
  cells: CalendarCell[] = [];

  get title(): string {
    return `${MONTH_NAMES[this.month]} ${this.year}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['today'] && this.today) {
      const t = parseDay(this.today);
      this.year = t.getFullYear();
      this.month = t.getMonth();
    }
    this.build();
  }

  move(step: number): void {
    const d = new Date(this.year, this.month + step, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    this.build();
  }

  pick(iso: string): void {
    this.selectDay.emit(iso === this.selected ? null : iso);
  }

  private build(): void {
    const first = new Date(this.year, this.month, 1);
    const start = new Date(this.year, this.month, 1 - first.getDay());
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      // Drop a trailing week that lies entirely in the next month
      if (i === 35 && d.getMonth() !== this.month) break;
      const iso = isoDay(d);
      const generated = this.reports.filter((r) => r.generatedOn.startsWith(iso)).length;
      const scheduled = this.reports.filter((r) => !!r.nextScheduled && r.nextScheduled.startsWith(iso)).length;
      const review = this.reports.filter((r) => r.reviewDue === iso).length;
      const parts = [formatDay(iso)];
      if (generated) parts.push(`${generated} generated`);
      if (scheduled) parts.push(`${scheduled} scheduled`);
      if (review) parts.push(`${review} review due`);
      cells.push({ iso, day: d.getDate(), inMonth: d.getMonth() === this.month, isToday: iso === this.today, generated, scheduled, review, label: parts.join(' · ') });
    }
    this.cells = cells;
  }
}
