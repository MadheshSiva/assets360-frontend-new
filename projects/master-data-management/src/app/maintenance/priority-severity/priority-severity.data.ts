import { PriorityRecord } from './priority-severity.model';

export const LEVEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#2563eb', '#7c3aed'];
export const APPLIES_TO = ['Work Orders', 'Work Requests', 'Incidents', 'Inspections', 'Preventive Schedules'];

export function blankPriority(): PriorityRecord {
  return {
    code: '',
    name: '',
    kind: 'Priority',
    color: LEVEL_COLORS[0],
    responseTime: '',
    description: '',
    status: '' as PriorityRecord['status'],
    appliesTo: ['Work Orders'],
    escalateAfterHours: null,
    notifyManager: false,
    createdOn: '',
    updatedOn: ''
  };
}
