import { LevelKind, PriorityRecord } from '../../../maintenance/priority-severity/priority-severity.model';

/* DEMO MODE: the four priorities and four severities from the approved design. */

export const LEVEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#2563eb', '#7c3aed'];
export const APPLIES_TO = ['Work Orders', 'Work Requests', 'Incidents', 'Inspections', 'Preventive Schedules'];

// [code, name, kind, colour, response, description, escalate after, inactive?]
type Seed = [string, string, LevelKind, string, string, string, number | null, boolean];
const SEEDS: Seed[] = [
  ['PR-001', 'Critical', 'Priority', '#ef4444', '1 hour', 'Immediate attention required', 1, false],
  ['PR-002', 'High', 'Priority', '#f97316', '4 hours', 'High priority, fix ASAP', 4, false],
  ['PR-003', 'Medium', 'Priority', '#eab308', '1 day', 'Standard priority', 24, false],
  ['PR-004', 'Low', 'Priority', '#22c55e', '3 days', 'Low priority', 72, false],
  ['SV-001', 'Critical', 'Severity', '#ef4444', 'Asset not operational', 'Major impact, urgent attention', 2, false],
  ['SV-002', 'Major', 'Severity', '#f97316', 'Severe impact', 'Significant degradation', 8, false],
  ['SV-003', 'Minor', 'Severity', '#eab308', 'Minor impact', 'Small degradation', null, false],
  ['SV-004', 'Trivial', 'Severity', '#22c55e', 'No impact', 'Cosmetic issue', null, true]
];

export function initialPriorities(): PriorityRecord[] {
  return SEEDS.map(([code, name, kind, color, responseTime, description, escalateAfterHours, inactive], i) => ({
    code,
    name,
    kind,
    color,
    responseTime,
    description,
    status: inactive ? 'Inactive' : 'Active',
    appliesTo: kind === 'Priority' ? ['Work Orders', 'Work Requests'] : ['Incidents', 'Work Orders'],
    escalateAfterHours,
    notifyManager: i % 4 < 2,
    createdOn: new Date(Date.UTC(2024, 0, 8) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 5, 2) + i * 3 * 86400000).toISOString().slice(0, 16)
  }));
}

export function blankPriority(): PriorityRecord {
  return {
    code: '',
    name: '',
    kind: 'Priority',
    color: LEVEL_COLORS[0],
    responseTime: '',
    description: '',
    status: 'Active',
    appliesTo: ['Work Orders'],
    escalateAfterHours: null,
    notifyManager: false,
    createdOn: '',
    updatedOn: ''
  };
}
