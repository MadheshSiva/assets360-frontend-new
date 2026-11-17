import { initialChecklists } from './legacy/checklist.legacy';
import { initialFailureCodes } from './legacy/failure-code.legacy';
import { initialMaintenanceTypes } from './legacy/maintenance-type.legacy';
import { initialPriorities } from './legacy/priority-severity.legacy';
import { initialTaskTemplates } from './legacy/task-template.legacy';
import { initialWorkTypes } from './legacy/work-type.legacy';
import { SeedRow, audit, once, refByName } from './seed-utils';

const maintenanceTypes = once(initialMaintenanceTypes);
const typeRef = (name: string | null | undefined) => (name ? (refByName('maintenance-types', maintenanceTypes(), name) ?? { id: null, name }) : null);

/** Seeds of the Maintenance masters, keyed by resource path. */
export const MAINTENANCE_SEED: Record<string, () => SeedRow[]> = {
  checklists: () =>
    initialChecklists().map((r) => ({
      ...audit('checklists', r.code, r),
      checklistName: r.name,
      code: r.code,
      checklistType: r.checklistType,
      category: r.category,
      description: r.description,
      items: r.items.map((i) => ({ name: i.question, description: null, responseType: i.response, isRequired: i.required }))
    })),

  'failure-codes': () =>
    initialFailureCodes().map((r) => ({
      ...audit('failure-codes', r.code, r),
      failureCodeName: r.name,
      code: r.code,
      category: r.category,
      severity: r.severity,
      description: r.description,
      assetCategories: r.assetCategories,
      causes: r.causes,
      actions: r.actions
    })),

  'maintenance-types': () =>
    maintenanceTypes().map((r) => ({
      ...audit('maintenance-types', r.code, r),
      maintenanceTypeName: r.name,
      code: r.code,
      description: r.description,
      color: r.color,
      planned: r.planned,
      approvalRequired: r.approvalRequired,
      countsAsDowntime: r.countsAsDowntime,
      defaultPriority: r.defaultPriority || null
    })),

  'priority-severities': () =>
    initialPriorities().map((r) => ({
      ...audit('priority-severities', r.code, r),
      name: r.name,
      code: r.code,
      type: r.kind,
      color: r.color,
      responseTime: r.responseTime,
      description: r.description,
      appliesTo: r.appliesTo,
      escalateAfterHours: r.escalateAfterHours,
      notifyManager: r.notifyManager
    })),

  'task-templates': () =>
    initialTaskTemplates().map((r) => ({
      ...audit('task-templates', r.code, r),
      templateName: r.name,
      code: r.code,
      maintenanceType: typeRef(r.maintenanceType),
      estimatedDuration: r.estimatedHours,
      description: r.description,
      tasks: r.tasks.map((t) => ({ name: t.description, description: null, durationMinutes: t.minutes, isRequired: t.required }))
    })),

  'work-types': () =>
    initialWorkTypes().map((r) => ({
      ...audit('work-types', r.code, r),
      workTypeName: r.name,
      code: r.code,
      maintenanceType: typeRef(r.maintenanceType),
      description: r.description,
      estimatedDuration: r.durationHours,
      defaultPriority: r.defaultPriority || null,
      requiredSkill: r.requiredSkill || null,
      checklistCode: r.checklistCode || null,
      permitRequired: r.permitRequired
    }))
};
