import { MaintenanceTypeRecord } from '../../../maintenance/maintenance-type/maintenance-type.model';

/* DEMO MODE: the seven maintenance types from the approved design. */

export const TYPE_COLORS = ['#2563eb', '#ef4444', '#7c3aed', '#0ea5e9', '#22c55e', '#14b8a6', '#f97316', '#eab308', '#db2777', '#64748b'];

// [code, name, description, colour, planned?, inactive?]
type Seed = [string, string, string, string, boolean, boolean];
const SEEDS: Seed[] = [
  ['MT-PRE', 'Preventive', 'Scheduled maintenance to prevent failures', '#2563eb', true, false],
  ['MT-COR', 'Corrective', 'Unscheduled maintenance to fix failures', '#ef4444', false, false],
  ['MT-PRE-D', 'Predictive', 'Condition-based maintenance', '#7c3aed', true, false],
  ['MT-INS', 'Inspection', 'Inspection and condition assessment', '#0ea5e9', true, false],
  ['MT-CAL', 'Calibration', 'Calibration of instruments and equipment', '#22c55e', true, false],
  ['MT-INS-T', 'Installation', 'Installation and commissioning', '#14b8a6', false, false],
  ['MT-UPG', 'Upgrade', 'Upgrade or modification', '#f97316', false, true]
];

export function initialMaintenanceTypes(): MaintenanceTypeRecord[] {
  return SEEDS.map(([code, name, description, color, planned, inactive], i) => ({
    code,
    name,
    description,
    color,
    status: inactive ? 'Inactive' : 'Active',
    planned,
    approvalRequired: !planned,
    countsAsDowntime: name === 'Corrective' || name === 'Upgrade',
    defaultPriority: name === 'Corrective' ? 'High' : 'Medium',
    createdOn: new Date(Date.UTC(2024, 0, 5) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 4, 1) + i * 7 * 86400000).toISOString().slice(0, 16)
  }));
}

export function blankMaintenanceType(): MaintenanceTypeRecord {
  return {
    code: '',
    name: '',
    description: '',
    color: TYPE_COLORS[0],
    status: 'Active',
    planned: true,
    approvalRequired: false,
    countsAsDowntime: false,
    defaultPriority: 'Medium',
    createdOn: '',
    updatedOn: ''
  };
}
