import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ChevronLeft, ChevronRight } from 'lucide-angular';
import { WorkingCalendar } from '../shared/inspection.models';
import { isoDay } from '../shared/insp-utils';
import { exceptionClass, exceptionOn, isWeekendDay } from './calendar-utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Cell {
  key: string;
  date: number;
  sub: string;
  inMonth: boolean;
  today: boolean;
  weekend: boolean;
  cls: string;
  exLabel: string;
}

/** Month grid (Monday first) shading non-working days and colouring exceptions by type. */
@Component({
  selector: 'app-insp-calendar-month',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="nav">
      <button type="button" class="nav-btn" aria-label="Previous month" (click)="move(-1)"><lucide-icon [img]="icons.ChevronLeft" [size]="18"></lucide-icon></button>
      <select class="month-sel" [ngModel]="key()" (ngModelChange)="pick($event)" aria-label="Month">
        <option value="" disabled>Select Month</option>
        @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
      </select>
      <button type="button" class="nav-btn" aria-label="Next month" (click)="move(1)"><lucide-icon [img]="icons.ChevronRight" [size]="18"></lucide-icon></button>
    </div>
    <div class="grid" role="grid">
      @for (d of dows; track d) { <div class="dow">{{ d }}</div> }
      @for (c of cells(); track c.key) {
        <div [class]="c.cls" [attr.title]="c.exLabel || null">
          <span class="num" [class.today]="c.today">{{ c.date }}</span>
          @if (c.sub) { <span class="sub">{{ c.sub }}</span> }
          @if (c.exLabel && c.inMonth) { <span class="ex-l">{{ c.exLabel }}</span> }
        </div>
      }
    </div>
    <div class="legend">
      <span><i class="sw"></i>Working day</span>
      <span><i class="sw sw-wk"></i>Weekend</span>
      <span><i class="sw sw-site"></i>Site exception</span>
      <span><i class="sw sw-hol"></i>Holiday</span>
      <span><i class="sw sw-ov"></i>Shift exception</span>
      <span><i class="sw sw-today"></i>Today</span>
    </div>
  `,
  styleUrls: ['./calendar-month.css']
})
export class CalendarMonthView {
  readonly icons = { ChevronLeft, ChevronRight };
  readonly calendar = input.required<WorkingCalendar>();
  readonly dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  year = new Date().getFullYear();
  month = new Date().getMonth();

  key(): string {
    return `${this.year}-${this.month}`;
  }

  options(): { value: string; label: string }[] {
    const out: { value: string; label: string }[] = [];
    for (let y = this.year - 1; y <= this.year + 1; y++) {
      for (let m = 0; m < 12; m++) out.push({ value: `${y}-${m}`, label: `${MONTHS[m]} ${y}` });
    }
    return out;
  }

  pick(value: string): void {
    const [y, m] = value.split('-').map(Number);
    this.year = y!;
    this.month = m!;
  }

  move(step: number): void {
    const d = new Date(this.year, this.month + step, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
  }

  cells(): Cell[] {
    const cal = this.calendar();
    const first = new Date(this.year, this.month, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(this.year, this.month + 1, 0);
    const total = Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7) * 7;
    const today = isoDay(new Date());
    const out: Cell[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = isoDay(d);
      const inMonth = d.getMonth() === this.month;
      const ex = exceptionOn(cal, key);
      out.push({
        key,
        date: d.getDate(),
        sub: !inMonth || d.getDate() === 1 ? SHORT[d.getMonth()]! : '',
        inMonth,
        today: key === today,
        weekend: isWeekendDay(cal, d),
        cls: ['cell', !inMonth ? 'out' : '', isWeekendDay(cal, d) ? 'wk' : '', ex ? exceptionClass(ex.type) : ''].filter(Boolean).join(' '),
        exLabel: ex?.description ?? ''
      });
    }
    return out;
  }
}
