import { TaskTemplateRecord, TemplateTask } from '../../../maintenance/task-template/task-template.model';

/* DEMO MODE: the seven task templates from the approved design, with their task counts. */

const TASKS: Record<string, string[]> = {
  hvac: ['Isolate power', 'Replace air filters', 'Clean coils', 'Check refrigerant pressure', 'Inspect belts', 'Lubricate bearings', 'Test thermostat', 'Record readings'],
  gen: ['Check oil and coolant', 'Replace oil filter', 'Replace fuel filter', 'Inspect belts and hoses', 'Test battery', 'Clean air filter', 'Run on load', 'Check ATS changeover', 'Inspect exhaust', 'Record running hours'],
  pump: ['Check pump pressure', 'Test jockey pump start', 'Test main pump start', 'Inspect valves', 'Check controller alarms', 'Record readings'],
  ups: ['Check battery voltage', 'Inspect terminals', 'Run battery test', 'Check alarms', 'Record load'],
  lift: ['Inspect doors', 'Test alarm and intercom', 'Lubricate guide rails', 'Check ropes', 'Check brake', 'Inspect pit', 'Test leveling', 'Check lighting', 'Sign logbook'],
  light: ['Walk-through lighting check', 'Replace failed lamps', 'Test emergency lighting', 'Record defects'],
  ahu: ['Isolate AHU', 'Replace filters', 'Restart and check airflow']
};

// [code, name, maintenance type, hours, task list, inactive?]
type Seed = [string, string, string, number, string, boolean];
const SEEDS: Seed[] = [
  ['TM-HVAC-001', 'HVAC Preventive Maintenance', 'Preventive', 2, 'hvac', false],
  ['TM-GEN-001', 'Generator Service', 'Preventive', 3, 'gen', false],
  ['TM-FP-001', 'Fire Pump Inspection', 'Inspection', 1.5, 'pump', false],
  ['TM-UPS-001', 'UPS Battery Check', 'Inspection', 1, 'ups', false],
  ['TM-ELEV-001', 'Elevator Monthly Service', 'Preventive', 2, 'lift', false],
  ['TM-LGT-001', 'Lighting System Inspection', 'Inspection', 1, 'light', false],
  ['TM-AHU-001', 'AHU Filter Replacement', 'Corrective', 1.5, 'ahu', true]
];

export function initialTaskTemplates(): TaskTemplateRecord[] {
  return SEEDS.map(([code, name, maintenanceType, estimatedHours, key, inactive], i) => {
    const list = TASKS[key];
    // Spread the estimate over the tasks, rounded to 5 minutes
    const each = Math.max(5, Math.round((estimatedHours * 60) / list.length / 5) * 5);
    const tasks: TemplateTask[] = list.map((description, k) => ({ description, minutes: each, required: k < list.length - 1 || list.length < 4 }));
    return {
      code,
      name,
      maintenanceType,
      estimatedHours,
      description: `Standard steps for ${name.toLowerCase()}.`,
      status: inactive ? 'Inactive' : 'Active',
      tasks,
      createdOn: new Date(Date.UTC(2024, 3, 1) + i * 86400000).toISOString().slice(0, 16),
      updatedOn: new Date(Date.UTC(2026, 8, 1) + i * 3 * 86400000).toISOString().slice(0, 16)
    };
  });
}

export function blankTaskTemplate(): TaskTemplateRecord {
  return { code: '', name: '', maintenanceType: '', estimatedHours: 1, description: '', status: 'Active', tasks: [], createdOn: '', updatedOn: '' };
}
