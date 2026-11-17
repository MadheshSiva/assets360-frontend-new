import { ChecklistItem, ChecklistRecord, ResponseType } from '../../../maintenance/checklist/checklist.model';

/* DEMO MODE: the seven checklists from the approved design, with their item counts. */

export const CHECKLIST_TYPES = ['Inspection', 'Maintenance', 'Safety', 'Audit'];
export const CHECKLIST_CATEGORIES = ['HVAC', 'Power Systems', 'Fire Safety', 'Elevators', 'Electrical', 'Safety', 'Fleet', 'Plumbing', 'General'];
export const RESPONSE_TYPES: ResponseType[] = ['Yes / No', 'Pass / Fail', 'Number', 'Text', 'Photo'];

const QUESTIONS: Record<string, string[]> = {
  HVAC: ['Check filter condition', 'Measure supply air temperature', 'Inspect belts and pulleys', 'Check refrigerant pressure', 'Clean condenser coil', 'Check drain pan and line', 'Inspect fan motor', 'Check thermostat operation', 'Inspect ductwork joints', 'Check electrical connections', 'Measure motor current', 'Check vibration level', 'Inspect insulation', 'Check damper operation', 'Record overall condition'],
  'Power Systems': ['Check engine oil level', 'Check coolant level', 'Inspect fuel level', 'Check battery voltage', 'Inspect belts and hoses', 'Check air filter', 'Run load test', 'Record running hours', 'Check exhaust for leaks', 'Inspect alternator', 'Check control panel alarms', 'Test automatic transfer switch', 'Inspect cable terminations', 'Check fuel filter', 'Drain water separator', 'Check radiator', 'Test emergency stop', 'Record output voltage', 'Record frequency', 'Clean enclosure'],
  'Fire Safety': ['Check extinguisher pressure', 'Inspect extinguisher seal', 'Test fire alarm panel', 'Test smoke detectors', 'Check sprinkler valves', 'Inspect hose reels', 'Check emergency lights', 'Check exit signs', 'Inspect fire doors', 'Test fire pump', 'Check jockey pump', 'Inspect fire blankets', 'Check assembly point signage', 'Verify evacuation plan posted', 'Check suppression system gauge', 'Inspect manual call points', 'Test bell / sounder', 'Record inspection tag'],
  Elevators: ['Check door operation', 'Test emergency alarm', 'Check car lighting', 'Test leveling accuracy', 'Inspect ropes', 'Check pit for water', 'Test emergency stop', 'Inspect machine room', 'Check brake operation', 'Test intercom', 'Check load certificate', 'Record ride quality'],
  Electrical: ['Check panel labeling', 'Inspect breakers', 'Thermal scan connections', 'Check earthing', 'Measure voltage', 'Check RCD trip test', 'Inspect cable glands', 'Check panel door lock', 'Clean panel', 'Check indicator lamps', 'Record load current', 'Photograph panel'],
  Safety: ['Check first aid kit', 'Inspect PPE stock', 'Check eyewash station', 'Inspect safety harnesses', 'Check spill kit', 'Inspect ladders', 'Check signage', 'Inspect guard rails', 'Check gas detectors', 'Inspect lockout kits', 'Check safety showers', 'Inspect fall arrest', 'Check fire watch log', 'Verify permit board', 'Record findings'],
  Fleet: ['Check tyre pressure', 'Check engine oil', 'Check lights and indicators', 'Test brakes', 'Check horn', 'Inspect wipers', 'Check fuel level', 'Record odometer']
};

const RESPONSES: ResponseType[] = ['Pass / Fail', 'Yes / No', 'Number', 'Pass / Fail', 'Text', 'Photo'];

function itemsFor(category: string, count: number): ChecklistItem[] {
  const pool = QUESTIONS[category] ?? QUESTIONS['Safety'];
  return Array.from({ length: count }, (_, i) => ({
    question: pool[i % pool.length],
    response: /measure|record/i.test(pool[i % pool.length]) ? 'Number' : /photograph/i.test(pool[i % pool.length]) ? 'Photo' : RESPONSES[i % 2],
    required: i % 4 !== 3
  }));
}

// [code, name, type, category, items, inactive?]
type Seed = [string, string, string, string, number, boolean];
const SEEDS: Seed[] = [
  ['CL-HVAC-001', 'HVAC Inspection Checklist', 'Inspection', 'HVAC', 15, false],
  ['CL-GEN-001', 'Generator Service Checklist', 'Maintenance', 'Power Systems', 20, false],
  ['CL-FS-001', 'Fire Safety Checklist', 'Inspection', 'Fire Safety', 18, false],
  ['CL-LIFT-001', 'Lift Inspection Checklist', 'Inspection', 'Elevators', 12, false],
  ['CL-EL-001', 'Electrical Panel Checklist', 'Inspection', 'Electrical', 12, false],
  ['CL-SE-001', 'Safety Equipment Checklist', 'Inspection', 'Safety', 15, false],
  ['CL-VEH-001', 'Vehicle Daily Checklist', 'Maintenance', 'Fleet', 8, true]
];

export function initialChecklists(): ChecklistRecord[] {
  return SEEDS.map(([code, name, checklistType, category, count, inactive], i) => ({
    code,
    name,
    checklistType,
    category,
    description: `${checklistType} points for ${category.toLowerCase()} assets.`,
    status: inactive ? 'Inactive' : 'Active',
    items: itemsFor(category, count),
    createdOn: new Date(Date.UTC(2024, 2, 4) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 7, 3) + i * 4 * 86400000).toISOString().slice(0, 16)
  }));
}

export function blankChecklist(): ChecklistRecord {
  return { code: '', name: '', checklistType: '', category: '', description: '', status: 'Active', items: [], createdOn: '', updatedOn: '' };
}
