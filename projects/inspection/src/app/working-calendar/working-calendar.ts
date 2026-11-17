import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  User,
  X
} from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { CalendarException, Inspection, WorkingCalendar } from '../shared/inspection.models';
import { fmtDate, isoDay } from '../shared/insp-utils';
import { CalendarMonthView } from './calendar-month';
import { EXCEPTION_TYPES, WEEK_DAYS, dayName, exceptionOn, isWorkingDay, parseDay, reschedule } from './calendar-utils';

interface ExceptionForm {
  index: number | null;
  date: string;
  description: string;
  fullDay: boolean;
  start: string;
  end: string;
  type: string;
}

interface Affected {
  inspection: Inspection;
  due: string;
  moved: string;
  reason: string;
}

@Component({
  selector: 'app-insp-working-calendar',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, CalendarMonthView],
  templateUrl: './working-calendar.html',
  styleUrls: ['../shared/insp-page.css', './working-calendar.css']
})
export class WorkingCalendarPage implements OnInit {
  readonly icons = { ArrowRight, ChevronDown, ChevronUp, FileText, Info, MapPin, Pencil, Plus, Trash2, Upload, User, X };
  readonly api = inject(InspectionApi);
  readonly store = this.api.calendars;
  readonly fmtDate = fmtDate;
  readonly exceptionTypes = EXCEPTION_TYPES;
  readonly timezones = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'UTC'];
  readonly rules = ['Move to next working day', 'Move to previous working day', 'Keep date'];
  readonly dueCalcs = ['Working days', 'Calendar days'];

  readonly selectedId = signal<string | null>(null);
  readonly sites = computed(() => {
    const names = [
      ...this.store.items().map((c) => c.siteName),
      ...this.api.inspections.items().map((i) => i.siteName)
    ].filter(Boolean);
    return [...new Set(names)].sort();
  });

  draft: WorkingCalendar | null = null;
  dirty = false;
  saving = false;
  editHours = false;
  showAffected = false;
  confirmDelete: number | null = null;
  form: ExceptionForm | null = null;
  readonly toast = signal<string | null>(null);

  constructor() {
    effect(() => {
      const first = this.store.items()[0];
      if (first && this.selectedId() === null) this.select(first);
    });
  }

  ngOnInit(): void {
    this.store.load();
    this.api.inspections.load();
  }

  select(c: WorkingCalendar): void {
    this.selectedId.set(c.id);
    const d = structuredClone(c);
    d.effectiveFrom = d.effectiveFrom ? d.effectiveFrom.slice(0, 10) : null;
    d.exceptions = d.exceptions ?? [];
    // Always show the seven days in order
    d.workingWeek = WEEK_DAYS.map(
      (day) => d.workingWeek?.find((w) => w.day === day) ?? { day, working: false, start: '08:00', end: '17:00' }
    );
    this.draft = d;
    this.dirty = false;
    this.editHours = false;
    this.showAffected = false;
  }

  switchTo(id: string): void {
    const c = this.store.byId(id);
    if (c) this.select(c);
  }

  touch(): void {
    this.dirty = true;
  }

  /** SLA calendar options: this calendar plus the others. */
  slaOptions(d: WorkingCalendar): string[] {
    return ['Use this calendar', ...this.store.items().filter((c) => c.id !== d.id).map((c) => c.calendarName)];
  }

  sortedExceptions(d: WorkingCalendar): { ex: CalendarException; index: number }[] {
    return d.exceptions.map((ex, index) => ({ ex, index })).sort((a, b) => a.ex.date.localeCompare(b.ex.date));
  }

  typePill(type: string): string {
    if (type === 'Site exception') return 'pill pill--amber';
    if (type === 'Working override') return 'pill pill--blue';
    if (type === 'Holiday') return 'pill pill--red';
    return 'pill';
  }

  // ===== Exceptions drawer =====
  openException(index: number | null = null): void {
    const d = this.draft;
    if (!d) return;
    const ex = index !== null ? d.exceptions[index] : undefined;
    const times = ex && ex.duration !== 'Full day' ? ex.duration.split(/\s*[–-]\s*/) : [];
    this.form = {
      index,
      date: ex ? ex.date.slice(0, 10) : isoDay(new Date()),
      description: ex?.description ?? '',
      fullDay: !ex || ex.duration === 'Full day',
      start: times[0] ?? '08:00',
      end: times[1] ?? '17:00',
      type: ex?.type ?? ''
    };
  }

  saveException(): void {
    const d = this.draft;
    const f = this.form;
    if (!d || !f || !f.date || !f.description.trim() || !f.type) return;
    const ex: CalendarException = {
      date: f.date,
      description: f.description.trim(),
      duration: f.fullDay ? 'Full day' : `${f.start} – ${f.end}`,
      type: f.type
    };
    if (f.index !== null) d.exceptions[f.index] = ex;
    else d.exceptions.push(ex);
    this.form = null;
    this.dirty = true;
  }

  deleteException(index: number): void {
    this.draft?.exceptions.splice(index, 1);
    this.confirmDelete = null;
    this.dirty = true;
  }

  // ===== Import holidays (CSV: date,description) =====
  importHolidays(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    const d = this.draft;
    inputEl.value = '';
    if (!file || !d) return;
    file.text().then((text) => {
      let added = 0;
      for (const line of text.split(/\r?\n/)) {
        const [rawDate, ...rest] = line.split(',');
        const date = this.toIsoDate((rawDate ?? '').replace(/"/g, '').trim());
        const description = rest.join(',').replace(/"/g, '').trim() || 'Holiday';
        if (!date) continue; // header or blank row
        if (d.exceptions.some((e) => e.date.slice(0, 10) === date && e.type === 'Holiday')) continue;
        d.exceptions.push({ date, description, duration: 'Full day', type: 'Holiday' });
        added++;
      }
      if (added) this.dirty = true;
      this.flash(added ? `Imported ${added} holiday${added === 1 ? '' : 's'}. Save the calendar to keep them.` : 'No new holidays found in the file.');
    });
  }

  private toIsoDate(raw: string): string | null {
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (m) return isoDay(new Date(+m[1]!, +m[2]! - 1, +m[3]!));
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
    if (m) return isoDay(new Date(+m[3]!, +m[2]! - 1, +m[1]!));
    return null;
  }

  // ===== Impact preview =====
  affected(d: WorkingCalendar): Affected[] {
    const today = isoDay(new Date());
    return this.api.inspections
      .items()
      .filter((i) => !!i.dueDate && i.dueDate.slice(0, 10) >= today)
      .filter((i) => i.status !== 'Completed' && i.status !== 'Cancelled')
      .filter((i) => !d.siteName || !i.siteName || i.siteName === d.siteName)
      .filter((i) => !isWorkingDay(d, parseDay(i.dueDate!)))
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((i) => {
        const due = parseDay(i.dueDate!);
        const ex = exceptionOn(d, isoDay(due));
        return {
          inspection: i,
          due: fmtDate(isoDay(due)),
          moved: fmtDate(isoDay(reschedule(d, due))),
          reason: ex ? `${ex.description} (${ex.type.toLowerCase()})` : `${dayName(due)} is a non-working day`
        };
      });
  }

  // ===== Save / cancel =====
  cancel(): void {
    const orig = this.store.byId(this.selectedId());
    if (orig) this.select(orig);
  }

  save(): void {
    const d = this.draft;
    if (!d || this.saving) return;
    if (!d.calendarName.trim()) {
      this.flash('Calendar name is required.');
      return;
    }
    this.saving = true;
    this.store.save(d).subscribe({
      next: (saved) => {
        this.saving = false;
        this.select(saved);
        this.flash('Calendar saved.');
      },
      error: (err) => {
        this.saving = false;
        this.flash(apiErrorMessage(err));
      }
    });
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3500);
  }
}
