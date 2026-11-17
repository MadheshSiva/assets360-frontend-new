import { ReportPeriod, ReportSchedule } from './standard-reports.data';

// Report dates are wall-clock strings ('YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'); these helpers work on local
// calendar parts so nothing shifts with the browser's own time zone.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "28 Oct 2026" */
export function formatDay(iso: string): string {
  const d = parseDay(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "28 Oct 2026, 09:15" */
export function formatStamp(iso: string | null): string {
  if (!iso) return '—';
  return iso.length > 10 ? `${formatDay(iso)}, ${iso.slice(11, 16)}` : formatDay(iso);
}

/** "01 – 30 Sep 2026", "01 Sep – 15 Oct 2026", or with times "01 Sep 2026 00:00 – 30 Sep 2026 23:59" */
export function formatPeriod(p: ReportPeriod): string {
  const a = parseDay(p.start);
  const b = parseDay(p.end);
  if (p.startTime && p.endTime) return `${formatDay(p.start)} ${p.startTime} – ${formatDay(p.end)} ${p.endTime}`;
  if (p.start === p.end) return formatDay(p.start);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${pad(a.getDate())} – ${formatDay(p.end)}`;
  }
  if (a.getFullYear() === b.getFullYear()) return `${pad(a.getDate())} ${MONTHS[a.getMonth()]} – ${formatDay(p.end)}`;
  return `${formatDay(p.start)} – ${formatDay(p.end)}`;
}

/** Next run strictly after `today` for a schedule, as 'YYYY-MM-DDTHH:mm'. */
export function nextRun(schedule: ReportSchedule, today: string): string {
  const base = parseDay(today);
  const d = new Date(base);
  if (schedule.frequency === 'Daily') {
    d.setDate(d.getDate() + 1);
  } else if (schedule.frequency === 'Weekly') {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() !== schedule.day);
  } else {
    // Monthly or Quarterly (quarter months: Jan, Apr, Jul, Oct)
    d.setDate(1);
    let candidate = new Date(d.getFullYear(), d.getMonth(), schedule.day);
    while (candidate <= base || (schedule.frequency === 'Quarterly' && candidate.getMonth() % 3 !== 0)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, schedule.day);
    }
    return `${isoDay(candidate)}T${schedule.time}`;
  }
  return `${isoDay(d)}T${schedule.time}`;
}

/** Calendar quick ranges relative to the reporting "today". */
export function quickRange(key: string, today: string): { start: string; end: string } {
  const t = parseDay(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  switch (key) {
    case 'Today':
      return { start: today, end: today };
    case 'This week':
      return { start: addDays(today, -t.getDay()), end: addDays(today, 6 - t.getDay()) };
    case 'This month':
      return { start: isoDay(new Date(y, m, 1)), end: isoDay(new Date(y, m + 1, 0)) };
    case 'This quarter': {
      const q = Math.floor(m / 3) * 3;
      return { start: isoDay(new Date(y, q, 1)), end: isoDay(new Date(y, q + 3, 0)) };
    }
    default:
      return { start: isoDay(new Date(y, 0, 1)), end: isoDay(new Date(y, 11, 31)) };
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
