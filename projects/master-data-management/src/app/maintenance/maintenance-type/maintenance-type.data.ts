import { MaintenanceTypeRecord } from './maintenance-type.model';

export const TYPE_COLORS = ['#2563eb', '#ef4444', '#7c3aed', '#0ea5e9', '#22c55e', '#14b8a6', '#f97316', '#eab308', '#db2777', '#64748b'];

export function blankMaintenanceType(): MaintenanceTypeRecord {
  return {
    code: '',
    name: '',
    description: '',
    color: TYPE_COLORS[0],
    status: '' as MaintenanceTypeRecord['status'],
    planned: true,
    approvalRequired: false,
    countsAsDowntime: false,
    defaultPriority: '',
    createdOn: '',
    updatedOn: ''
  };
}
