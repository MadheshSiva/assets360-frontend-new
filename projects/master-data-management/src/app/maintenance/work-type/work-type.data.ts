import { WorkTypeRecord } from './work-type.model';

export function blankWorkType(): WorkTypeRecord {
  return {
    code: '',
    name: '',
    maintenanceType: '',
    description: '',
    durationHours: 1,
    // Left empty so the drawer shows "Select …" until the user picks
    status: '' as WorkTypeRecord['status'],
    defaultPriority: '',
    requiredSkill: '',
    checklistCode: '',
    permitRequired: false,
    createdOn: '',
    updatedOn: ''
  };
}
