import { ShiftRecord, ShiftType } from '../../../people/shift/shift.model';

/* DEMO MODE: the eight shifts from the approved design. */

export const SHIFT_TYPES: ShiftType[] = ['Regular', 'Flexible', 'On Call', 'Rotational'];
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const SHIFT_COLORS = ['#2563eb', '#f97316', '#9333ea', '#22c55e', '#8190b3', '#ef4444', '#0ea5e9', '#a3a8b8', '#eab308', '#db2777'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Hours between two HH:mm times, wrapping past midnight (22:00 to 06:00 is 8). */
export function shiftHours(start: string, end: string): number | null {
  const parse = (t: string) => {
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(start);
  const b = parse(end);
  if (a === null || b === null) return null;
  const minutes = (b - a + 1440) % 1440 || 1440;
  return Math.round((minutes / 60) * 100) / 100;
}

// [code, name, type, start, end, colour, days, inactive?]
type Seed = [string, string, ShiftType, string, string, string, string[], boolean];
const SEEDS: Seed[] = [
  ['SH-MOR', 'Morning Shift', 'Regular', '06:00', '14:00', '#2563eb', WEEKDAYS, false],
  ['SH-EVE', 'Evening Shift', 'Regular', '14:00', '22:00', '#f97316', WEEKDAYS, false],
  ['SH-NIG', 'Night Shift', 'Regular', '22:00', '06:00', '#9333ea', WEEKDAYS, false],
  ['SH-WKD', 'Weekend Shift', 'Regular', '08:00', '20:00', '#22c55e', ['Sat', 'Sun'], false],
  ['SH-FLX', 'Flexible Shift', 'Flexible', '', '', '#8190b3', [], false],
  ['SH-OC', 'On Call', 'On Call', '', '', '#ef4444', [], false],
  ['SH-ROT', 'Rotational Shift', 'Rotational', '06:00', '18:00', '#0ea5e9', WEEKDAYS, false],
  ['SH-SPL', 'Split Shift', 'Regular', '08:00', '12:00', '#a3a8b8', WEEKDAYS, true]
];

export function initialShifts(): ShiftRecord[] {
  return SEEDS.map(([code, name, shiftType, startTime, endTime, color, workingDays, inactive], i) => {
    const hours = shiftHours(startTime, endTime) ?? 0;
    return {
      code,
      name,
      shiftType,
      startTime,
      endTime,
      color,
      workingDays: [...workingDays],
      description: shiftType === 'On Call' ? 'Standby cover outside normal hours.' : shiftType === 'Flexible' ? 'Hours agreed with the supervisor.' : `${name} for maintenance crews.`,
      status: inactive ? 'Inactive' : 'Active',
      effectiveFrom: '2024-01-01',
      graceMinutes: 10,
      rotationPattern: shiftType === 'Rotational' ? '2 days on, 2 days off' : '',
      breaks: hours >= 8 ? [{ name: 'Lunch', start: '', minutes: 60 }, { name: 'Tea', start: '', minutes: 15 }] : hours ? [{ name: 'Tea', start: '', minutes: 15 }] : [],
      overtimeAllowed: shiftType !== 'Flexible',
      nightAllowance: code === 'SH-NIG',
      attendanceRequired: shiftType !== 'On Call',
      createdOn: new Date(Date.UTC(2024, 0, 2) + i * 86400000).toISOString().slice(0, 16),
      updatedOn: new Date(Date.UTC(2026, 3, 1) + i * 5 * 86400000).toISOString().slice(0, 16)
    };
  });
}

export function blankShift(): ShiftRecord {
  return {
    code: '',
    name: '',
    shiftType: 'Regular',
    startTime: '06:00',
    endTime: '14:00',
    color: SHIFT_COLORS[0],
    workingDays: [...WEEKDAYS],
    description: '',
    status: 'Active',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    graceMinutes: 10,
    rotationPattern: '',
    breaks: [{ name: 'Lunch', start: '', minutes: 60 }],
    overtimeAllowed: true,
    nightAllowance: false,
    attendanceRequired: true,
    createdOn: '',
    updatedOn: ''
  };
}
