import { TaskTemplateRecord } from './task-template.model';

export function blankTaskTemplate(): TaskTemplateRecord {
  return { code: '', name: '', maintenanceType: '', estimatedHours: 1, description: '', status: '' as TaskTemplateRecord['status'], tasks: [], createdOn: '', updatedOn: '' };
}
