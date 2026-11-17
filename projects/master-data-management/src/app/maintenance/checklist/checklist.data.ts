import { ChecklistRecord, ResponseType } from './checklist.model';

export const CHECKLIST_TYPES = ['Inspection', 'Maintenance', 'Safety', 'Audit'];
export const CHECKLIST_CATEGORIES = ['HVAC', 'Power Systems', 'Fire Safety', 'Elevators', 'Electrical', 'Safety', 'Fleet', 'Plumbing', 'General'];
export const RESPONSE_TYPES: ResponseType[] = ['Yes / No', 'Pass / Fail', 'Number', 'Text', 'Photo'];

export function blankChecklist(): ChecklistRecord {
  return { code: '', name: '', checklistType: '', category: '', description: '', status: '' as ChecklistRecord['status'], items: [], createdOn: '', updatedOn: '' };
}
