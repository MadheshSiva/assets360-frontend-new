import { WorkTypeRecord } from '../../../maintenance/work-type/work-type.model';

/* DEMO MODE: the seven work types from the approved design. */

// [code, name, maintenance type, description, hours, priority, skill, checklist, inactive?]
type Seed = [string, string, string, string, number, string, string, string, boolean];
const SEEDS: Seed[] = [
  ['WT-RS', 'Routine Service', 'Preventive', 'Regular service as per schedule', 2, 'Medium', 'Maintenance', 'CL-HVAC-001', false],
  ['WT-OC', 'Oil Change', 'Preventive', 'Engine oil and filter change', 1.5, 'Low', 'Mechanical', 'CL-VEH-001', false],
  ['WT-INSP', 'Inspection', 'Inspection', 'General inspection and check', 2, 'Medium', 'Asset Inspection', 'CL-SE-001', false],
  ['WT-REP', 'Repair', 'Corrective', 'Repair and restore operation', 4, 'High', 'Maintenance', '', false],
  ['WT-REP-L', 'Replacement', 'Predictive', 'Replace worn components', 3, 'Medium', 'Mechanical', '', false],
  ['WT-TEST', 'Testing', 'Calibration', 'Functional testing', 2, 'Low', 'Instrumentation', '', false],
  ['WT-INST', 'Installation', 'Installation', 'Install and configure', 6, 'Medium', 'Electrical', 'CL-EL-001', true]
];

export function initialWorkTypes(): WorkTypeRecord[] {
  return SEEDS.map(([code, name, maintenanceType, description, durationHours, defaultPriority, requiredSkill, checklistCode, inactive], i) => ({
    code,
    name,
    maintenanceType,
    description,
    durationHours,
    status: inactive ? 'Inactive' : 'Active',
    defaultPriority,
    requiredSkill,
    checklistCode,
    permitRequired: name === 'Repair' || name === 'Installation',
    createdOn: new Date(Date.UTC(2024, 3, 10) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 8, 12) + i * 2 * 86400000).toISOString().slice(0, 16)
  }));
}

export function blankWorkType(): WorkTypeRecord {
  return {
    code: '',
    name: '',
    maintenanceType: '',
    description: '',
    durationHours: 1,
    status: 'Active',
    defaultPriority: 'Medium',
    requiredSkill: '',
    checklistCode: '',
    permitRequired: false,
    createdOn: '',
    updatedOn: ''
  };
}
