import { ShiftRecord, ShiftType } from './shift.model';

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

export function blankShift(): ShiftRecord {
  return {
    code: '',
    name: '',
    shiftType: '' as ShiftRecord['shiftType'],
    startTime: '06:00',
    endTime: '14:00',
    color: SHIFT_COLORS[0],
    workingDays: [...WEEKDAYS],
    description: '',
    status: '' as ShiftRecord['status'],
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
