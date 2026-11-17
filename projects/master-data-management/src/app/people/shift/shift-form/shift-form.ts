import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { nowStamp } from '../../people.data';
import { TeamService } from '../../team/team.service';
import { SHIFT_COLORS, SHIFT_TYPES, WEEK_DAYS, blankShift, shiftHours } from '../shift.data';
import { ShiftRecord } from '../shift.model';
import { ShiftService } from '../shift.service';

type FormTab = 'basic' | 'schedule' | 'breaks' | 'assignments' | 'settings';
type FieldKey = 'name' | 'code' | 'shiftType' | 'status' | 'startTime' | 'endTime' | 'workingDays' | 'grace' | 'breaks';

const TAB_OF: Record<FieldKey, FormTab> = {
  name: 'basic',
  code: 'basic',
  shiftType: 'basic',
  status: 'basic',
  startTime: 'basic',
  endTime: 'basic',
  workingDays: 'basic',
  grace: 'schedule',
  breaks: 'breaks'
};

/** Right-hand "Add / Edit Shift" panel. Emits the record and the teams put on it; the page saves both. */
@Component({
  selector: 'app-shift-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './shift-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../people-form.css', './shift-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ShiftForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() shift: ShiftRecord | null = null;
  @Output() saved = new EventEmitter<{ record: ShiftRecord; originalCode: string | null; teamCodes: string[] }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(ShiftService);
  readonly teams = inject(TeamService);
  readonly icons = { X, Plus, Trash2 };
  readonly types = SHIFT_TYPES;
  readonly days = WEEK_DAYS;
  readonly colors = SHIFT_COLORS;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'breaks', label: 'Breaks' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: ShiftRecord = blankShift();
  teamCodes: string[] = [];
  errors: Partial<Record<FieldKey, string>> = {};
  private original: ShiftRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.shift : null;
    this.form = this.shift ? structuredClone(this.shift) : blankShift();
    this.teamCodes = this.original ? this.teams.teamsOnShift(this.original.code).map((t) => t.code) : [];
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Flexible and on-call shifts have no fixed hours or days
  get fixedHours(): boolean {
    return this.form.shiftType === 'Regular' || this.form.shiftType === 'Rotational';
  }

  get duration(): string {
    const h = shiftHours(this.form.startTime, this.form.endTime);
    return h === null ? '-' : String(h);
  }

  get overnight(): boolean {
    return this.fixedHours && !!this.form.startTime && !!this.form.endTime && this.form.endTime <= this.form.startTime;
  }

  get breakMinutes(): number {
    return this.form.breaks.reduce((sum, b) => sum + (Number(b.minutes) || 0), 0);
  }

  // Name of the team's current shift, when it is on another one
  otherShift(shiftCode: string): string {
    if (!shiftCode || shiftCode === this.original?.code) return '';
    return this.service.find(shiftCode)?.name ?? '';
  }

  hasDay(day: string): boolean {
    return this.form.workingDays.includes(day);
  }

  toggleDay(day: string): void {
    const days = this.hasDay(day) ? this.form.workingDays.filter((d) => d !== day) : [...this.form.workingDays, day];
    this.form.workingDays = this.days.filter((d) => days.includes(d));
  }

  hasTeam(code: string): boolean {
    return this.teamCodes.includes(code);
  }

  toggleTeam(code: string): void {
    this.teamCodes = this.hasTeam(code) ? this.teamCodes.filter((c) => c !== code) : [...this.teamCodes, code];
  }

  addBreak(): void {
    this.form.breaks = [...this.form.breaks, { name: '', start: '', minutes: 15 }];
  }

  removeBreak(index: number): void {
    this.form.breaks = this.form.breaks.filter((_, i) => i !== index);
  }

  /** True on the final tab, where the primary button saves instead of advancing. */
  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  /** Move to the next tab. */
  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    // Enter key / primary button on earlier tabs just advances
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!f.name.trim()) errors.name = 'Enter a shift name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.shiftType) errors.shiftType = 'Select a shift type.';
    if (!f.status) errors.status = 'Select a status.';
    if (this.fixedHours) {
      if (!f.startTime) errors.startTime = 'Enter a start time.';
      if (!f.endTime) errors.endTime = 'Enter an end time.';
      else if (f.endTime === f.startTime) errors.endTime = 'End time must differ from start time.';
      if (!f.workingDays.length) errors.workingDays = 'Pick at least one working day.';
    }
    if (!Number.isInteger(f.graceMinutes) || f.graceMinutes < 0 || f.graceMinutes > 120) errors.grace = 'Enter 0 to 120 minutes.';
    if (f.breaks.some((b) => !b.name.trim() || !(Number(b.minutes) > 0))) errors.breaks = 'Every break needs a name and minutes.';
    else if (this.fixedHours && f.startTime && f.endTime && this.breakMinutes >= (shiftHours(f.startTime, f.endTime) ?? 0) * 60) {
      errors.breaks = 'Breaks can’t fill the whole shift.';
    }
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))!.id;
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...f,
        name: f.name.trim(),
        code: f.code.trim().toUpperCase(),
        description: f.description.trim(),
        // Shifts without fixed hours keep no times or days
        startTime: this.fixedHours ? f.startTime : '',
        endTime: this.fixedHours ? f.endTime : '',
        workingDays: this.fixedHours ? f.workingDays : [],
        breaks: f.breaks.map((b) => ({ ...b, name: b.name.trim(), minutes: Number(b.minutes) })),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null,
      teamCodes: this.teamCodes
    });
  }
}
