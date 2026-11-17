// Static demo data for the Inspection module. Every resource the pages request is seeded here; the in-memory
// stores in inspection-api.ts copy these rows and apply creates / updates / deletes to that copy.
// Dates are relative to today so overdue / due-soon states stay meaningful whenever the demo is opened.
import {
  CalibrationInstrument,
  Checklist,
  ChecklistSection,
  Inspection,
  InspectionAudit,
  InspectionFinding,
  InspectionPlan,
  InspectionResponse,
  InspectionTask,
  InspectionType,
  NotificationTemplate,
  NumberingSequence,
  ReportTemplate,
  SignatureAndStamp,
  SignOffStep,
  TaskCategory,
  WorkingCalendar,
  WorkingDay
} from './inspection.models';

const CLIENT_ID = 'demo-client';
const TENANT_ID = 'demo-tenant';
const YEAR = new Date().getFullYear();

const pad = (n: number) => String(n).padStart(2, '0');

/** Local 'YYYY-MM-DD', `offset` days from today. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO date-time `offset` days from today at local `hh:mm`. */
function at(offset: number, time = '09:00'): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h!, m!, 0, 0);
  return d.toISOString();
}

function audit(id: string, status: string, createdDaysAgo: number, by = 'ahmed.mansoori@purpleiq.ae', updatedDaysAgo?: number): InspectionAudit {
  return {
    id,
    status,
    createdBy: by,
    createdAt: at(-createdDaysAgo, '10:15'),
    updatedBy: updatedDaysAgo !== undefined ? by : null,
    updatedAt: updatedDaysAgo !== undefined ? at(-updatedDaysAgo, '16:40') : null,
    clientId: CLIENT_ID,
    tenantId: TENANT_ID
  };
}

/** Placeholder evidence photo (inline SVG, so the demo needs no image host). */
function photo(caption: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">` +
    `<rect width="640" height="480" fill="#475569"/><circle cx="320" cy="200" r="70" fill="#64748b"/>` +
    `<text x="320" y="340" text-anchor="middle" font-family="Arial" font-size="22" fill="#f8fafc">${caption.replace(/[<&>]/g, '')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ===== People =====
const AHMED = 'Ahmed Al Mansoori';
const PRIYA = 'Priya Nair';
const REX = 'Rex Kumar';
const OMAR = 'Omar Haddad';
const SARAH = 'Sarah Thomas';
const FATIMA = 'Fatima Zahra';

// ===== Task categories =====
export const TASK_CATEGORIES: TaskCategory[] = [
  ['Safety', 'Life-safety and protective system checks'],
  ['Mechanical', 'Moving parts, leaks, fluids and mounting'],
  ['Electrical', 'Voltages, insulation, terminations and protection'],
  ['Condition', 'Visual condition, vibration and thermography'],
  ['Instrumentation', 'Gauges, sensors and control readings']
].map(([name, description], i) => ({
  ...audit(`tc-${i + 1}`, 'Active', 220),
  categoryCode: `TC-${String(i + 1).padStart(3, '0')}`,
  categoryName: name!,
  description: description!,
  displayOrder: i + 1
}));

// ===== Inspection tasks =====
type TaskSeed = [
  code: string,
  title: string,
  category: string,
  responseType: string,
  unit: string,
  min: number | null,
  max: number | null,
  minutes: number,
  severity: string,
  critical: boolean,
  procedure: string
];

const TASK_SEEDS: TaskSeed[] = [
  ['ITK-001', 'Fire pump discharge pressure', 'Instrumentation', 'Numeric', 'bar', 7, 10, 10, 'Critical', true, 'Start the pump on test line and read the discharge gauge once pressure stabilises.'],
  ['ITK-002', 'Pump casing and gland leak check', 'Mechanical', 'Pass / Fail', '', null, null, 5, 'High', false, 'Inspect casing, gland packing and flanges for drips or wet patches.'],
  ['ITK-003', 'Jockey pump auto-start on pressure drop', 'Safety', 'Yes / No', '', null, null, 8, 'Critical', true, 'Open the test drain and confirm the jockey pump starts at the set cut-in pressure.'],
  ['ITK-004', 'Engine coolant level', 'Mechanical', 'Pass / Fail', '', null, null, 3, 'Medium', false, 'With the engine cold, confirm coolant is between MIN and MAX marks.'],
  ['ITK-005', 'Starter battery voltage', 'Electrical', 'Numeric', 'V', 24, 28.5, 5, 'High', false, 'Measure across battery terminals with the charger connected.'],
  ['ITK-006', 'Output voltage under load', 'Electrical', 'Numeric', 'V', 380, 420, 20, 'High', true, 'Run on load bank at 75% and record line-to-line voltage.'],
  ['ITK-007', 'Exhaust and fuel line leak check', 'Safety', 'Pass / Fail', '', null, null, 5, 'Critical', true, 'Inspect fuel lines, filters and exhaust joints for leaks or soot marks.'],
  ['ITK-008', 'Chilled water leaving temperature', 'Instrumentation', 'Numeric', '°C', 5, 8, 5, 'Medium', false, 'Read leaving water temperature on the chiller controller.'],
  ['ITK-009', 'Compressor vibration (overall velocity)', 'Condition', 'Numeric', 'mm/s', 0, 4.5, 10, 'High', false, 'Measure RMS velocity on the compressor drive-end bearing.'],
  ['ITK-010', 'Condenser coil condition', 'Condition', 'Pass / Fail', '', null, null, 5, 'Low', false, 'Check fins for fouling, corrosion or damage.'],
  ['ITK-011', 'Battery string internal resistance', 'Electrical', 'Numeric', 'mΩ', 0, 6, 25, 'High', false, 'Measure each block with the battery analyser; record the highest value.'],
  ['ITK-012', 'Transformer top oil temperature', 'Electrical', 'Numeric', '°C', 0, 85, 5, 'Critical', true, 'Read the oil temperature indicator; note the maximum pointer.'],
  ['ITK-013', 'Thermographic scan of terminations', 'Condition', 'Numeric', '°C rise', 0, 15, 15, 'High', false, 'Scan LV/HV terminations under load; record the hottest rise above ambient.'],
  ['ITK-014', 'Fire alarm panel fault indications', 'Safety', 'Pass / Fail', '', null, null, 5, 'Critical', true, 'Confirm no active fault or disablement LEDs on the panel.'],
  ['ITK-015', 'Brakes, horn and lights functional', 'Safety', 'Pass / Fail', '', null, null, 5, 'Critical', true, 'Test service brake, parking brake, horn, beacon and reverse alarm.'],
  ['ITK-016', 'General condition remarks', 'Condition', 'Text', '', null, null, 5, 'Low', false, 'Record any other observations about the asset or its surroundings.']
];

export const INSPECTION_TASKS: InspectionTask[] = TASK_SEEDS.map(([code, title, category, responseType, unit, min, max, minutes, severity, critical, procedure], i) => ({
  ...audit(`itk-${i + 1}`, 'Active', 200 - i, AHMED, 40),
  taskCode: code,
  taskTitle: title,
  taskCategory: category,
  taskDescription: procedure.split(';')[0]!,
  responseType,
  unit,
  estimatedDurationMinutes: minutes,
  minValue: min,
  maxValue: max,
  procedure,
  readingRequired: responseType === 'Numeric',
  photoRequiredOnFailure: severity === 'Critical' || severity === 'High',
  createFindingOutsideLimits: responseType === 'Numeric',
  defaultSeverity: severity,
  isCriticalTask: critical,
  isMandatory: responseType !== 'Text',
  isActive: true
}));

const taskByCode = new Map(INSPECTION_TASKS.map((t) => [t.taskCode, t]));

// ===== Checklists =====
function sections(spec: [string, string[]][]): ChecklistSection[] {
  return spec.map(([sectionName, codes], s) => ({
    sectionName,
    order: s + 1,
    tasks: codes.map((code, i) => {
      const t = taskByCode.get(code)!;
      const limits =
        t.minValue != null || t.maxValue != null ? `${t.minValue ?? '—'} to ${t.maxValue ?? '—'} ${t.unit}`.trim() : t.responseType === 'Text' ? 'Recorded' : 'Pass';
      return {
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.taskTitle,
        responseType: t.responseType,
        weight: t.isCriticalTask ? 3 : t.isMandatory ? 2 : 1,
        isMandatory: t.isMandatory,
        acceptanceCriteria: limits,
        order: i + 1
      };
    })
  }));
}

type ChecklistSeed = [code: string, name: string, typeIdx: number, category: string, assetType: string, modules: string[], version: number, status: string, spec: [string, string[]][]];

const CHECKLIST_SEEDS: ChecklistSeed[] = [
  ['CHK-001', 'Fire Pump Monthly Inspection', 0, 'Fire Safety', 'Fire Pump', ['Inspection', 'Maintenance'], 3, 'Published', [
    ['Pre-start checks', ['ITK-002', 'ITK-014']],
    ['Run test', ['ITK-001', 'ITK-003']],
    ['Close-out', ['ITK-016']]
  ]],
  ['CHK-002', 'Diesel Generator Condition Checklist', 1, 'Power Generation', 'Diesel Generator', ['Inspection', 'Maintenance'], 2, 'Published', [
    ['Static checks', ['ITK-004', 'ITK-005', 'ITK-007']],
    ['Load test', ['ITK-006', 'ITK-013']],
    ['Close-out', ['ITK-016']]
  ]],
  ['CHK-003', 'Chiller & AHU Quarterly PM Checklist', 2, 'HVAC', 'Chiller', ['Inspection', 'Maintenance'], 2, 'Published', [
    ['Performance', ['ITK-008', 'ITK-009']],
    ['Visual', ['ITK-010', 'ITK-002']],
    ['Close-out', ['ITK-016']]
  ]],
  ['CHK-004', 'Transformer & UPS Statutory Inspection', 3, 'Electrical', 'Transformer', ['Inspection', 'Audit'], 1, 'Published', [
    ['Transformer', ['ITK-012', 'ITK-013']],
    ['UPS', ['ITK-011', 'ITK-005']],
    ['Close-out', ['ITK-016']]
  ]],
  ['CHK-005', 'Forklift Daily Pre-use Check', 4, 'Material Handling', 'Forklift', ['Inspection', 'WIP'], 1, 'Published', [
    ['Safety devices', ['ITK-015']],
    ['Power & fluids', ['ITK-005', 'ITK-002']],
    ['Remarks', ['ITK-016']]
  ]],
  ['CHK-006', 'Solar Array Condition Survey', 2, 'Renewable Energy', 'Solar Panel', ['Inspection'], 1, 'Draft', [
    ['Array', ['ITK-010', 'ITK-013']],
    ['Remarks', ['ITK-016']]
  ]]
];

// ===== Inspection types =====
type TypeSeed = [code: string, name: string, category: string, description: string, checklist: string, priority: string, frequency: string, assets: string, role: string, permit: boolean];

const TYPE_SEEDS: TypeSeed[] = [
  ['IT-001', 'Fire Safety Inspection', 'Safety', 'Monthly functional inspection of fire pumps, alarm panels and suppression equipment (NFPA 25).', 'CHK-001', 'Critical', 'Monthly', 'Fire Pump, Fire Alarm Panel', 'Fire Safety Officer', false],
  ['IT-002', 'Generator Condition Inspection', 'Condition', 'Static and load-test inspection of standby generators.', 'CHK-002', 'High', 'Monthly', 'Diesel Generator, Gas Generator', 'Electrical Technician', false],
  ['IT-003', 'HVAC Preventive Inspection', 'Operational', 'Quarterly performance and condition checks of chillers and air handling units.', 'CHK-003', 'Medium', 'Quarterly', 'Chiller, Air Handling Unit, Split AC', 'HVAC Technician', false],
  ['IT-004', 'Electrical Statutory Inspection', 'Regulatory', 'Annual statutory inspection of transformers and UPS systems as required by the utility authority.', 'CHK-004', 'High', 'Annually', 'Transformer, UPS', 'Licensed Electrical Engineer', true],
  ['IT-005', 'Forklift Pre-use Check', 'Safety', 'Daily operator check of forklifts and powered pallet trucks before the first shift.', 'CHK-005', 'High', 'Daily', 'Forklift, Pallet Jack', 'Equipment Operator', false]
];

export const INSPECTION_TYPES: InspectionType[] = TYPE_SEEDS.map(([code, name, category, description, chk, priority, frequency, assets, role, permit], i) => ({
  ...audit(`it-${i + 1}`, 'Active', 210 - i * 3, AHMED, 30 + i),
  inspectionTypeCode: code,
  inspectionTypeName: name,
  category,
  description,
  defaultChecklistCode: chk,
  defaultChecklistName: CHECKLIST_SEEDS.find((c) => c[0] === chk)![1],
  defaultPriority: priority,
  defaultFrequency: frequency,
  applicableAssets: assets,
  responsibleRole: role,
  photoEvidenceOnFailure: true,
  signatureRequired: category !== 'Operational',
  correctiveActionOnFailure: true,
  permitRequired: permit,
  isActive: true
}));

export const CHECKLISTS: Checklist[] = CHECKLIST_SEEDS.map(([code, name, typeIdx, category, assetType, modules, version, status, spec], i) => {
  const type = INSPECTION_TYPES[typeIdx]!;
  return {
    ...audit(`chk-${i + 1}`, status, 180 - i * 10, PRIYA, status === 'Draft' ? 2 : 25 + i),
    checklistCode: code,
    templateName: name,
    inspectionTypeId: type.id,
    inspectionTypeName: type.inspectionTypeName,
    assetCategory: category,
    assetType,
    modules,
    scoring: 'Weighted',
    owner: i % 2 ? PRIYA : AHMED,
    version,
    versionLabel: `${version}.0`,
    effectiveDate: status === 'Draft' ? null : day(-150 + i * 12),
    sections: sections(spec),
    allMandatoryRequired: true,
    photoOnFailedItems: true,
    inspectorSignatureRequired: type.signatureRequired,
    criticalFailureOverridesScore: true,
    createFindingOnFailure: true,
    routeCorrectiveAction: true,
    isActive: status !== 'Draft'
  };
});

const checklistByCode = new Map(CHECKLISTS.map((c) => [c.checklistCode, c]));

// ===== Plans =====
type PlanSeed = [code: string, name: string, typeIdx: number, frequency: string, assets: number, nextDue: number, inspector: string, lead: number, active: boolean];

const PLAN_SEEDS: PlanSeed[] = [
  ['PLN-001', 'Monthly Fire Pump Testing - Head Office', 0, 'Monthly', 2, 6, OMAR, 3, true],
  ['PLN-002', 'Standby Generator Monthly Run Test', 1, 'Monthly', 2, 9, REX, 5, true],
  ['PLN-003', 'Quarterly HVAC Preventive Inspection', 2, 'Quarterly', 4, 21, PRIYA, 7, true],
  ['PLN-004', 'Annual Electrical Statutory Inspection', 3, 'Annually', 4, 34, AHMED, 14, true],
  ['PLN-005', 'Forklift Daily Pre-use Checks - Warehouse', 4, 'Daily', 2, 1, SARAH, 0, true],
  ['PLN-006', 'Fire Alarm Panel Weekly Test', 0, 'Weekly', 1, 4, OMAR, 1, false]
];

export const INSPECTION_PLANS: InspectionPlan[] = PLAN_SEEDS.map(([code, name, typeIdx, frequency, assets, nextDue, inspector, lead, active], i) => {
  const type = INSPECTION_TYPES[typeIdx]!;
  return {
    ...audit(`pln-${i + 1}`, active ? 'Active' : 'Inactive', 160 - i * 9, AHMED, 12 + i),
    planCode: code,
    planName: name,
    inspectionTypeName: type.inspectionTypeName,
    category: type.category,
    frequency,
    assetCount: assets,
    nextDueDate: active ? day(nextDue) : null,
    inspectorName: inspector,
    checklistCode: type.defaultChecklistCode,
    checklistName: type.defaultChecklistName,
    leadTimeDays: lead,
    autoGenerate: active,
    isActive: active
  };
});

// ===== Inspections =====
/** Responses for a checklist; `answers` maps task code -> [reading, result, notes] (missing = pending). */
function responsesFor(checklistCode: string, answers: Record<string, [string, string, string?]> = {}): InspectionResponse[] {
  const chk = checklistByCode.get(checklistCode)!;
  return chk.sections.flatMap((s) =>
    s.tasks.map((ct) => {
      const t = taskByCode.get(ct.taskCode)!;
      const a = answers[ct.taskCode];
      return {
        sectionName: s.sectionName,
        taskCode: t.taskCode,
        taskTitle: t.taskTitle,
        responseType: t.responseType,
        unit: t.unit,
        minValue: t.minValue,
        maxValue: t.maxValue,
        procedure: t.procedure,
        required: t.isMandatory,
        reading: a?.[0] ?? '',
        result: a?.[1] ?? '',
        notes: a?.[2] ?? '',
        evidence: a?.[1] === 'Fail' ? [photo(t.taskTitle)] : []
      };
    })
  );
}

function signOff(state: 'done' | 'review' | 'pending', inspector: string, signedOffset: number): SignOffStep[] {
  return [
    { role: 'Inspector', name: inspector, state: state === 'pending' ? 'Pending' : 'Signed', signedAt: state === 'pending' ? null : at(signedOffset, '15:30') },
    { role: 'Supervisor', name: AHMED, state: state === 'done' ? 'Signed' : state === 'review' ? 'Awaiting review' : 'Pending', signedAt: state === 'done' ? at(signedOffset + 1, '10:05') : null },
    { role: 'Quality Approver', name: FATIMA, state: state === 'done' ? 'Signed' : 'Pending', signedAt: state === 'done' ? at(signedOffset + 1, '14:20') : null }
  ];
}

interface InspSeed {
  seq: number;
  title: string;
  plan: number | null;
  status: string;
  priority: string;
  asset: [string, string, string];
  site: string;
  dueOffset: number;
  startTime?: string;
  inspector: string;
  team: string;
  department: string;
  trigger: string;
  answers?: Record<string, [string, string, string?]>;
  findings: number;
}

const HO = 'Head Office';
const DC = 'Data Center';
const WH = 'Central Warehouse';

const TYPE_SHORT = ['Safety', 'Condition', 'Preventive', 'Statutory', 'Pre-use'];

const INSPECTION_SEEDS: InspSeed[] = [
  // Completed
  { seq: 121, title: 'Monthly fire pump test - FP-00056', plan: 0, status: 'Completed', priority: 'Critical', asset: ['FP-00056', 'Fire Pump', 'Building A - Basement'], site: HO, dueOffset: -24, inspector: OMAR, team: 'Fire Safety Team', department: 'EHS', trigger: 'Scheduled', findings: 0,
    answers: { 'ITK-002': ['', 'Pass'], 'ITK-014': ['', 'Pass'], 'ITK-001': ['8.6', 'Pass'], 'ITK-003': ['', 'Pass', 'Cut-in at 6.8 bar'], 'ITK-016': ['Pump room clean, test line valve tagged.', 'Pass'] } },
  { seq: 124, title: 'Generator run test - GEN-00045', plan: 1, status: 'Completed', priority: 'High', asset: ['GEN-00045', 'Diesel Generator 250 kVA', 'Building C - Electrical Room'], site: HO, dueOffset: -20, inspector: REX, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 1,
    answers: { 'ITK-004': ['', 'Pass'], 'ITK-005': ['23.4', 'Fail', 'Battery charger output low; batteries 4 years old.'], 'ITK-007': ['', 'Pass'], 'ITK-006': ['401', 'Pass'], 'ITK-013': ['9', 'Pass'], 'ITK-016': ['Run for 30 min on load bank, no alarms.', 'Pass'] } },
  { seq: 129, title: 'Quarterly HVAC inspection - HVAC-00112 Chiller', plan: 2, status: 'Completed', priority: 'Medium', asset: ['HVAC-00112', 'HVAC Chiller', 'Building B - Roof'], site: HO, dueOffset: -15, inspector: PRIYA, team: 'HVAC Team', department: 'Facilities', trigger: 'Scheduled', findings: 1,
    answers: { 'ITK-008': ['6.4', 'Pass'], 'ITK-009': ['5.8', 'Fail', 'Elevated vibration on compressor 2 drive end.'], 'ITK-010': ['', 'Pass'], 'ITK-002': ['', 'Pass'], 'ITK-016': ['Recommend bearing analysis on compressor 2.', 'Pass'] } },
  { seq: 133, title: 'Transformer statutory inspection - TRF-00072', plan: 3, status: 'Completed', priority: 'High', asset: ['TRF-00072', 'Transformer 500 kVA', 'Building C - Electrical Room'], site: HO, dueOffset: -9, inspector: AHMED, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 1,
    answers: { 'ITK-012': ['72', 'Pass'], 'ITK-013': ['21', 'Fail', 'Hot spot on LV phase B lug.'], 'ITK-011': ['', 'N/A', 'No UPS on this feeder.'], 'ITK-005': ['', 'N/A'], 'ITK-016': ['Permit PTW-2026-0412 closed.', 'Pass'] } },
  { seq: 137, title: 'Forklift pre-use check - FLT-00021', plan: 4, status: 'Completed', priority: 'High', asset: ['FLT-00021', 'Forklift - Electric', 'Warehouse - Bay 3'], site: WH, dueOffset: -2, inspector: SARAH, team: 'Warehouse Operations', department: 'Operations', trigger: 'Scheduled', findings: 1,
    answers: { 'ITK-015': ['', 'Fail', 'Reverse alarm not sounding.'], 'ITK-005': ['25.1', 'Pass'], 'ITK-002': ['', 'Pass'], 'ITK-016': ['Forklift tagged out until alarm replaced.', 'Pass'] } },
  // In progress
  { seq: 141, title: 'UPS battery inspection - UPS-00078', plan: 3, status: 'In Progress', priority: 'High', asset: ['UPS-00078', 'UPS 100 kVA', 'Data Center - Building A - DC Room'], site: DC, dueOffset: 0, startTime: '08:30', inspector: AHMED, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 1,
    answers: { 'ITK-012': ['', 'N/A', 'No transformer at this location.'], 'ITK-013': ['7', 'Pass'], 'ITK-011': ['7.2', 'Fail', 'Block 14 above limit.'] } },
  { seq: 142, title: 'Fire alarm panel check - FP-00061', plan: 5, status: 'In Progress', priority: 'Critical', asset: ['FP-00061', 'Fire Alarm Panel', 'Building A - Security Room'], site: HO, dueOffset: 0, startTime: '10:00', inspector: OMAR, team: 'Fire Safety Team', department: 'EHS', trigger: 'Manual', findings: 0,
    answers: { 'ITK-002': ['', 'N/A'], 'ITK-014': ['', 'Pass'] } },
  // Scheduled (one already past due, shows as Overdue)
  { seq: 138, title: 'Generator run test - GEN-00052', plan: 1, status: 'Scheduled', priority: 'High', asset: ['GEN-00052', 'Gas Generator 500 kVA', 'Building B - Plant Room'], site: HO, dueOffset: -3, startTime: '09:00', inspector: REX, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 0 },
  { seq: 143, title: 'Monthly fire pump test - FP-00056', plan: 0, status: 'Scheduled', priority: 'Critical', asset: ['FP-00056', 'Fire Pump', 'Building A - Basement'], site: HO, dueOffset: 1, startTime: '09:30', inspector: OMAR, team: 'Fire Safety Team', department: 'EHS', trigger: 'Scheduled', findings: 0 },
  { seq: 144, title: 'Forklift pre-use check - FLT-00033', plan: 4, status: 'Scheduled', priority: 'High', asset: ['FLT-00033', 'Pallet Jack - Electric', 'Warehouse - Bay 1'], site: WH, dueOffset: 1, startTime: '07:00', inspector: SARAH, team: 'Warehouse Operations', department: 'Operations', trigger: 'Scheduled', findings: 0 },
  { seq: 145, title: 'Quarterly HVAC inspection - HVAC-00118 AHU', plan: 2, status: 'Scheduled', priority: 'Medium', asset: ['HVAC-00118', 'Air Handling Unit', 'Building B - Plant Room'], site: HO, dueOffset: 4, startTime: '11:00', inspector: PRIYA, team: 'HVAC Team', department: 'Facilities', trigger: 'Scheduled', findings: 0 },
  { seq: 146, title: 'Generator run test - GEN-00045', plan: 1, status: 'Scheduled', priority: 'High', asset: ['GEN-00045', 'Diesel Generator 250 kVA', 'Building C - Electrical Room'], site: HO, dueOffset: 9, startTime: '14:00', inspector: REX, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 0 },
  { seq: 147, title: 'Transformer statutory inspection - TRF-00067', plan: 3, status: 'Scheduled', priority: 'High', asset: ['TRF-00067', 'Transformer 1 MVA', 'Substation 1'], site: DC, dueOffset: 12, startTime: '08:00', inspector: AHMED, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 0 },
  { seq: 139, title: 'Split AC condition check - AC-00311', plan: null, status: 'Overdue', priority: 'Medium', asset: ['AC-00311', 'Split AC - 5 Ton', 'Building C - 2nd Floor'], site: HO, dueOffset: -6, startTime: '13:00', inspector: PRIYA, team: 'HVAC Team', department: 'Facilities', trigger: 'Event', findings: 0 },
  // Draft and cancelled
  { seq: 148, title: 'Solar array condition survey - SOL-00456', plan: null, status: 'Draft', priority: 'Low', asset: ['SOL-00456', 'Solar Panel - 550W', 'Building B - Roof'], site: HO, dueOffset: 18, inspector: PRIYA, team: 'Facilities Team', department: 'Facilities', trigger: 'Manual', findings: 0 },
  { seq: 135, title: 'UPS battery inspection - UPS-00081', plan: 3, status: 'Cancelled', priority: 'Medium', asset: ['UPS-00081', 'UPS 60 kVA', 'Building A - Ground Floor'], site: HO, dueOffset: -5, inspector: AHMED, team: 'Electrical Team', department: 'Maintenance & Engineering', trigger: 'Scheduled', findings: 0 }
];

export const INSPECTIONS: Inspection[] = INSPECTION_SEEDS.map((s, i) => {
  const plan = s.plan !== null ? INSPECTION_PLANS[s.plan]! : null;
  const typeIdx = plan ? PLAN_SEEDS[s.plan!]![2] : 2;
  const type = INSPECTION_TYPES[typeIdx]!;
  const checklistCode = s.asset[0].startsWith('SOL') ? 'CHK-006' : plan ? plan.checklistCode : type.defaultChecklistCode;
  const chk = checklistByCode.get(checklistCode)!;
  const completed = s.status === 'Completed';
  const started = completed || s.status === 'In Progress';
  const start = s.startTime ?? '09:00';
  const [h, m] = start.split(':').map(Number);
  const end = `${pad(Math.min(h! + 2, 23))}:${pad(m!)}`;
  return {
    ...audit(`ins-${s.seq}`, s.status, Math.max(4, -s.dueOffset + 10), AHMED, completed ? -s.dueOffset - 1 : s.status === 'In Progress' ? 0 : undefined),
    inspectionCode: `INS-${YEAR}-${String(s.seq).padStart(4, '0')}`,
    title: s.title,
    inspectionTypeName: type.inspectionTypeName,
    typeShort: TYPE_SHORT[typeIdx]!,
    priority: s.priority,
    siteName: s.site,
    department: s.department,
    planCode: plan?.planCode ?? '',
    planName: plan?.planName ?? '',
    trigger: s.trigger,
    description: `${type.inspectionTypeName} of ${s.asset[1]} (${s.asset[0]}) at ${s.site}, ${s.asset[2]}.`,
    scope: 'Asset-based',
    category: type.category,
    referenceStandard: ['NFPA 25', 'ISO 8528', 'ASHRAE 180', 'IEC 60076 / DEWA Regulations', 'ISO 3691'][typeIdx]!,
    permitRequired: type.permitRequired,
    evidenceRequired: type.photoEvidenceOnFailure,
    assetCode: s.asset[0],
    assetName: s.asset[1],
    location: `${s.site} - ${s.asset[2]}`,
    assignedTo: s.inspector,
    assignedTeam: s.team,
    dueDate: day(s.dueOffset),
    scheduledStart: s.status === 'Draft' ? null : at(s.dueOffset, start),
    scheduledEnd: s.status === 'Draft' ? null : at(s.dueOffset, end),
    startedAt: started ? at(s.dueOffset, start) : null,
    completedAt: completed ? at(s.dueOffset, end) : null,
    findingsCount: s.findings,
    checklistCode: chk.checklistCode,
    checklistName: chk.templateName,
    responses: responsesFor(chk.checklistCode, s.answers),
    signOff: signOff(completed ? (s.dueOffset < -5 ? 'done' : 'review') : 'pending', s.inspector, s.dueOffset)
  };
});

const inspByCode = new Map(INSPECTIONS.map((i) => [i.inspectionCode, i]));
const insCode = (seq: number) => `INS-${YEAR}-${String(seq).padStart(4, '0')}`;

// ===== Findings =====
interface FindingSeed {
  seq: number;
  ins: number;
  task: string;
  title: string;
  severity: string;
  step: 'Open' | 'Action' | 'Verify' | 'Closed';
  overdue?: boolean;
  dueOffset: number;
  owner: string;
  recorded: string;
  acceptance: string;
  observation: string;
  action: string;
  wo: string;
  woStatus: string;
}

const STEP_STATUS = { Open: 'Open', Action: 'In Progress', Verify: 'Pending Verification', Closed: 'Closed' } as const;

const FINDING_SEEDS: FindingSeed[] = [
  { seq: 81, ins: 124, task: 'ITK-005', title: 'Generator starter battery voltage below limit', severity: 'High', step: 'Closed', dueOffset: -12, owner: REX, recorded: '23.4 V', acceptance: '24 to 28.5 V', observation: 'Starter battery voltage measured 23.4 V with charger connected; charger float output low.', action: 'Replace starter batteries and recalibrate charger float voltage.', wo: 'WO-2026-0412', woStatus: 'Completed' },
  { seq: 84, ins: 129, task: 'ITK-009', title: 'High compressor vibration on chiller HVAC-00112', severity: 'High', step: 'Action', overdue: true, dueOffset: -2, owner: PRIYA, recorded: '5.8 mm/s', acceptance: '0 to 4.5 mm/s', observation: 'Overall velocity on compressor 2 drive-end bearing 5.8 mm/s, trending up from 3.9 mm/s last quarter.', action: 'Carry out bearing spectrum analysis and replace drive-end bearing if defect frequencies confirmed.', wo: 'WO-2026-0431', woStatus: 'In Progress' },
  { seq: 86, ins: 133, task: 'ITK-013', title: 'Hot spot on transformer LV phase B termination', severity: 'Critical', step: 'Verify', dueOffset: 2, owner: AHMED, recorded: '21 °C rise', acceptance: '0 to 15 °C rise', observation: 'Thermal scan shows 21 °C rise on LV phase B lug of TRF-00072 at 68% load.', action: 'Isolate under permit, clean and re-torque LV phase B lug; rescan under load.', wo: 'WO-2026-0438', woStatus: 'Completed' },
  { seq: 87, ins: 137, task: 'ITK-015', title: 'Forklift reverse alarm not working', severity: 'Critical', step: 'Action', dueOffset: 1, owner: SARAH, recorded: 'Fail', acceptance: 'Pass', observation: 'Reverse alarm on FLT-00021 does not sound when reverse is selected. Unit tagged out.', action: 'Replace reverse alarm buzzer and test all warning devices before return to service.', wo: 'WO-2026-0446', woStatus: 'Open' },
  { seq: 88, ins: 141, task: 'ITK-011', title: 'UPS battery block 14 internal resistance high', severity: 'High', step: 'Open', dueOffset: 7, owner: AHMED, recorded: '7.2 mΩ', acceptance: '0 to 6 mΩ', observation: 'Block 14 of string A reads 7.2 mΩ; string average 4.6 mΩ.', action: 'Raise work order to replace block 14 and re-test the string.', wo: '', woStatus: 'Not Created' },
  { seq: 79, ins: 121, task: 'ITK-016', title: 'Fire pump room emergency light faulty', severity: 'Medium', step: 'Closed', dueOffset: -18, owner: OMAR, recorded: 'Observation', acceptance: 'Pass', observation: 'Emergency light above the pump controller did not illuminate on test.', action: 'Replace emergency light fitting.', wo: 'WO-2026-0398', woStatus: 'Completed' },
  { seq: 89, ins: 129, task: 'ITK-010', title: 'Minor corrosion on condenser coil fins', severity: 'Low', step: 'Open', dueOffset: 25, owner: PRIYA, recorded: 'Observation', acceptance: 'Pass', observation: 'Light corrosion on the lower row of condenser fins on the west side.', action: 'Apply coil coating during next quarterly service.', wo: '', woStatus: 'Not Created' }
];

export const INSPECTION_FINDINGS: InspectionFinding[] = FINDING_SEEDS.map((f) => {
  const ins = inspByCode.get(insCode(f.ins))!;
  const task = taskByCode.get(f.task)!;
  const raised = ins.completedAt ?? ins.startedAt ?? at(-1);
  const status = f.overdue ? 'Overdue' : STEP_STATUS[f.step];
  const activity = [{ at: raised, by: ins.assignedTo, text: `Finding raised from ${ins.inspectionCode} (${task.taskCode}).` }];
  if (f.step !== 'Open') activity.push({ at: at(Math.min(-1, f.dueOffset - 6), '11:20'), by: f.owner, text: `Corrective action started${f.wo ? `, work order ${f.wo} raised` : ''}.` });
  if (f.step === 'Verify' || f.step === 'Closed') activity.push({ at: at(Math.min(-1, f.dueOffset - 2), '15:45'), by: f.owner, text: 'Submitted for verification.' });
  if (f.step === 'Closed') activity.push({ at: at(f.dueOffset, '10:30'), by: AHMED, text: 'Verified and closed.' });
  return {
    ...audit(`fnd-${f.seq}`, status, 30, ins.assignedTo, 1),
    createdAt: raised,
    findingCode: `FND-${YEAR}-${String(f.seq).padStart(4, '0')}`,
    title: f.title,
    inspectionCode: ins.inspectionCode,
    assetCode: ins.assetCode,
    assetName: ins.assetName,
    sourceTask: task.taskTitle,
    severity: f.severity,
    owner: f.owner,
    dueDate: day(f.dueOffset),
    recordedValue: f.recorded,
    acceptance: f.acceptance,
    observation: f.observation,
    evidence: [photo(f.title)],
    correctiveAction: f.action,
    assignedTo: f.owner,
    workOrder: f.wo,
    workOrderStatus: f.woStatus,
    workflowStep: f.step,
    activity
  };
});

// ===== Calibration instruments =====
type InstrumentSeed = [code: string, name: string, serial: string, location: string, range: string, unit: string, tolerance: string, months: number, provider: string, providerType: string, assignedTo: string, lastOffset: number, result: string, ref: number[]];

const INSTRUMENT_SEEDS: InstrumentSeed[] = [
  ['PG-001', 'Digital Pressure Gauge', 'WK-PG-22814', 'Head Office - Building A - Basement', '0 - 16', 'bar', '±0.05 bar', 12, 'Emirates Calibration Lab', 'Service Provider', OMAR, -300, 'Pass', [0, 4, 8, 12, 16]],
  ['MM-002', 'True RMS Multimeter Fluke 87V', 'FL-87V-55102', 'Head Office - Building C - Electrical Room', '0 - 1000', 'V', '±0.5 %', 12, 'Emirates Calibration Lab', 'Service Provider', REX, -350, 'Pass', [10, 100, 230, 400, 750]],
  ['TC-003', 'Thermal Imaging Camera FLIR E8', 'FLIR-E8-90311', 'Head Office - Tool Store', '-20 - 250', '°C', '±2 °C', 12, 'Al Futtaim Testing Services', 'Service Provider', AHMED, -100, 'Pass', [0, 50, 100, 150]],
  ['VA-004', 'Vibration Analyser SKF Microlog', 'SKF-CMXA-4471', 'Head Office - Building B - Plant Room', '0 - 50', 'mm/s', '±5 %', 6, 'In-house Reliability Lab', 'In-house', PRIYA, -200, 'Pass', [1, 5, 10, 25]],
  ['IR-005', 'Insulation Resistance Tester Megger MIT525', 'MEG-525-1180', 'Data Center - Building A - DC Room', '0 - 10000', 'MΩ', '±5 %', 12, 'Emirates Calibration Lab', 'Service Provider', AHMED, -380, 'Pass', [10, 100, 1000, 5000]],
  ['BA-006', 'Battery Impedance Analyser', 'HIO-BT3554-772', 'Data Center - Building A - DC Room', '0 - 3000', 'mΩ', '±1 %', 12, 'In-house Reliability Lab', 'In-house', AHMED, -90, 'Fail', [1, 10, 100]],
  ['TP-007', 'Reference Temperature Probe', 'TP-PT100-3309', 'Head Office - Building B - Roof', '-50 - 200', '°C', '±0.3 °C', 6, 'In-house Reliability Lab', 'In-house', PRIYA, -40, 'Pass', [0, 25, 100]]
];

function addMonths(offsetDays: number, months: number): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const target = new Date(d);
  target.setMonth(target.getMonth() + months);
  return Math.round((target.getTime() - Date.now()) / 86400000);
}

export const CALIBRATION_INSTRUMENTS: CalibrationInstrument[] = INSTRUMENT_SEEDS.map(
  ([code, name, serial, location, range, unit, tolerance, months, provider, providerType, assignedTo, lastOffset, result, refs], i) => {
    const nextOffset = addMonths(lastOffset, months);
    const status = result === 'Fail' ? 'Out of Tolerance' : nextOffset < 0 ? 'Overdue' : nextOffset <= 30 ? 'Due Soon' : 'Valid';
    const cert = `CAL-${YEAR}-${String(310 + i * 7).padStart(4, '0')}`;
    const drift = (r: number, k: number) => Math.round((r + (r || 1) * 0.004 * (k % 2 ? 1 : -1)) * 1000) / 1000;
    return {
      ...audit(`cal-${i + 1}`, status, 400, AHMED, -lastOffset),
      instrumentCode: code,
      instrumentName: name,
      serialNumber: serial,
      location,
      range: `${range} ${unit}`,
      unit,
      tolerance,
      intervalMonths: months,
      provider,
      providerType,
      assignedTo,
      lastCalibration: day(lastOffset),
      nextDue: day(nextOffset),
      certificate: cert,
      lastResult: result,
      results: refs.map((r, k) => {
        const failed = result === 'Fail' && k === refs.length - 1;
        return { reference: r, asFound: failed ? Math.round(r * 1.034 * 100) / 100 : drift(r, k), asLeft: failed ? Math.round(r * 1.021 * 100) / 100 : r, result: failed ? 'Fail' : 'Pass' };
      }),
      referenceStandard: providerType === 'In-house' ? 'Fluke 5522A Multi-product Calibrator' : 'Accredited lab reference set (ISO/IEC 17025)',
      referenceCertificate: providerType === 'In-house' ? `REF-${YEAR - 1}-0088` : `ENAS-CL-${1040 + i}`,
      validAtCalibration: true,
      history: [
        { date: day(lastOffset), result, certificate: cert, performedBy: providerType === 'In-house' ? PRIYA : provider },
        { date: day(lastOffset - months * 30), result: 'Pass', certificate: `CAL-${YEAR - 1}-${String(280 + i * 7).padStart(4, '0')}`, performedBy: providerType === 'In-house' ? PRIYA : provider }
      ]
    };
  }
);

// ===== Signatures & stamps =====
function signatureSvg(name: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">` +
    `<text x="16" y="70" font-family="'Brush Script MT','Segoe Script',cursive" font-size="44" fill="#1e3a8a">${name}</text>` +
    `<path d="M18 84 C 90 96, 180 74, 300 86" stroke="#1e3a8a" stroke-width="2" fill="none"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type SignatureSeed = [code: string, kind: string, user: string, name: string, role: string, department: string, authorizedRole: string, stamp: string, active: boolean];

const SIGNATURE_SEEDS: SignatureSeed[] = [
  ['SIG-001', 'Signature', AHMED, AHMED, 'Maintenance Supervisor', 'Maintenance & Engineering', 'Supervisor', 'STP-001', true],
  ['SIG-002', 'Signature', OMAR, OMAR, 'Fire Safety Officer', 'EHS', 'Inspector', 'STP-002', true],
  ['SIG-003', 'Signature', PRIYA, PRIYA, 'HVAC Engineer', 'Facilities', 'Inspector', '', true],
  ['SIG-004', 'Signature', FATIMA, FATIMA, 'Quality Manager', 'Quality', 'Quality Approver', 'STP-001', true],
  ['SIG-005', 'Signature', REX, REX, 'Electrical Technician', 'Maintenance & Engineering', 'Inspector', '', false],
  ['STP-001', 'Stamp', '', 'Purple IQ Engineering - Approved', 'Company Stamp', 'Maintenance & Engineering', 'Supervisor', '', true],
  ['STP-002', 'Stamp', '', 'Purple IQ EHS - Fire Safety', 'Department Stamp', 'EHS', 'Inspector', '', true]
];

export const SIGNATURES_AND_STAMPS: SignatureAndStamp[] = SIGNATURE_SEEDS.map(([code, kind, user, name, role, department, authorizedRole, stamp, active], i) => ({
  ...audit(`sig-${i + 1}`, active ? 'Active' : 'Inactive', 190 - i * 5, AHMED, 20 + i),
  signatureCode: code,
  kind,
  user,
  signatureName: name,
  role,
  department,
  authorizedRole,
  signatureImage: kind === 'Signature' ? signatureSvg(name.split(' ')[0]! + ' ' + name.split(' ').slice(-1)[0]!.charAt(0) + '.') : '',
  stampImage: '',
  assignedStampCode: stamp,
  effectiveDate: day(-180 + i * 5),
  expiryDate: active ? day(185 + i * 30) : day(-10),
  signaturePosition: 'Bottom right',
  stampPosition: 'Bottom left',
  includeSignerNameDate: true,
  requirePasswordConfirmationBeforeSigning: authorizedRole !== 'Inspector',
  isActive: active
}));

// ===== Notification templates =====
type NotifSeed = [code: string, name: string, event: string, channels: string[], subject: string, body: string, recipients: string[], cc: string[], button: string, timing: string, active: boolean];

const NOTIF_SEEDS: NotifSeed[] = [
  ['NT-001', 'Inspection Assigned', 'Inspection assigned', ['Email', 'In-app', 'Push'], 'New inspection assigned: {{inspection_id}} - {{inspection_title}}',
    'Hello {{inspector_name}},\n\nYou have been assigned inspection {{inspection_id}} for {{asset_name}} at {{location}}.\nPlease complete it by {{due_date}}.\n\nOpen the inspection: {{inspection_url}}', ['Assigned inspector'], ['Supervisor'], 'Open inspection', 'Send immediately on assignment', true],
  ['NT-002', 'Upcoming Inspection Reminder', 'Upcoming inspection reminder', ['Email', 'Push'], 'Reminder: {{inspection_id}} is due on {{due_date}}',
    'Hi {{inspector_name}},\n\nThis is a reminder that {{inspection_title}} ({{inspection_id}}) for {{asset_name}} is due on {{due_date}}.\n\n{{inspection_url}}', ['Assigned inspector'], [], 'View details', '1 day before due date', true],
  ['NT-003', 'Inspection Overdue Escalation', 'Inspection overdue', ['Email', 'In-app'], 'OVERDUE: {{inspection_id}} - {{asset_name}}',
    'Inspection {{inspection_id}} ({{inspection_title}}) at {{location}} was due on {{due_date}} and has not been completed.\nAssigned to: {{inspector_name}}.\n\n{{inspection_url}}', ['Assigned inspector', 'Supervisor'], ['Site manager'], 'Review now', '1 day after due date', true],
  ['NT-004', 'Critical Finding Alert', 'Critical finding raised', ['Email', 'In-app', 'Push'], 'Critical finding on {{asset_name}} ({{inspection_id}})',
    'A critical finding was raised by {{inspector_name}} during {{inspection_id}} on {{asset_name}} at {{location}}.\nImmediate corrective action is required.\n\n{{inspection_url}}', ['Supervisor', 'Asset owner'], ['Quality team', 'Site manager'], 'Open finding', 'Send immediately', true],
  ['NT-005', 'Corrective Action Due', 'Corrective action due', ['Email'], 'Corrective action due {{due_date}} - {{asset_name}}',
    'The corrective action raised from {{inspection_id}} for {{asset_name}} is due on {{due_date}}.\n\n{{inspection_url}}', ['Asset owner'], ['Supervisor'], 'View action', '3 days before due date', true],
  ['NT-006', 'Inspection Completed Summary', 'Inspection completed', ['Email', 'In-app'], 'Completed: {{inspection_id}} - {{inspection_title}}',
    '{{inspector_name}} completed {{inspection_title}} ({{inspection_id}}) on {{asset_name}} at {{location}}.\nThe report is ready for review.\n\n{{inspection_url}}', ['Supervisor', 'Approver'], [], 'Review report', 'Send immediately', false]
];

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = NOTIF_SEEDS.map(([code, name, event, channels, subject, body, recipients, cc, button, timing, active], i) => ({
  ...audit(`nt-${i + 1}`, active ? 'Active' : 'Draft', 150 - i * 6, FATIMA, 8 + i * 2),
  templateCode: code,
  templateName: name,
  event,
  channels,
  subject,
  messageBody: body,
  recipients,
  ccRecipients: cc,
  buttonLabel: button,
  timing,
  respectUserLocale: true,
  preventDuplicates: true,
  isActive: active
}));

// ===== Report templates =====
const REPORT_SECTIONS = [
  'Header & Branding',
  'Inspection Summary',
  'Asset Details',
  'Checklist Results',
  'Findings & Corrective Actions',
  'Evidence Gallery',
  'Signatures & Stamp',
  'Footer & Page Numbers'
];

type ReportSeed = [code: string, title: string, typeIdx: number, format: string, size: string, orientation: string, color: string, version: string, status: string, photos: boolean];

const REPORT_SEEDS: ReportSeed[] = [
  ['RT-001', 'Fire Safety Inspection Report', 0, 'PDF', 'A4', 'Portrait', '#DC2626', '2.0', 'Published', true],
  ['RT-002', 'Generator Condition Report', 1, 'PDF', 'A4', 'Portrait', '#6D28D9', '1.0', 'Published', true],
  ['RT-003', 'Electrical Statutory Inspection Certificate', 3, 'PDF', 'A4', 'Portrait', '#0F766E', '1.0', 'Published', false],
  ['RT-004', 'HVAC Preventive Inspection Report', 2, 'DOCX', 'A4', 'Landscape', '#2563EB', '1.1', 'Draft', true]
];

export const REPORT_TEMPLATES: ReportTemplate[] = REPORT_SEEDS.map(([code, title, typeIdx, format, size, orientation, color, version, status, photos], i) => ({
  ...audit(`rt-${i + 1}`, status, 140 - i * 15, FATIMA, 5 + i * 3),
  reportTemplateCode: code,
  reportTitle: title,
  inspectionTypeName: INSPECTION_TYPES[typeIdx]!.inspectionTypeName,
  format,
  pageSize: size,
  orientation,
  language: 'English',
  accentColor: color,
  versionLabel: version,
  reportNumberFormat: 'INSR-{YYYY}-{SEQ}',
  sections: REPORT_SECTIONS.map((name, k) => ({ name, enabled: photos || name !== 'Evidence Gallery', order: k + 1 })),
  includePassedItems: true,
  includePhotos: photos,
  showAcceptanceCriteria: true,
  showFindingStatus: true,
  includeSignatures: true,
  includeInternalNotes: false,
  isActive: true
}));

// ===== Numbering sequences =====
type SeqSeed = [code: string, name: string, type: string, prefix: string, digits: number, running: number, reset: string, scope: string, active: boolean, records: [string, string][]];

const SEQ_SEEDS: SeqSeed[] = [
  ['NS-001', 'Inspection Number', 'Inspection', 'INS', 4, 149, 'Annually', 'Tenant-wide', true, INSPECTIONS.slice().sort((a, b) => b.inspectionCode.localeCompare(a.inspectionCode)).slice(0, 5).map((i) => [i.inspectionCode, i.title])],
  ['NS-002', 'Inspection Plan Number', 'Plan', 'PLN', 3, 7, 'Never', 'Tenant-wide', true, INSPECTION_PLANS.slice().reverse().slice(0, 4).map((p) => [p.planCode, p.planName])],
  ['NS-003', 'Finding Number', 'Finding', 'FND', 4, 90, 'Annually', 'Tenant-wide', true, INSPECTION_FINDINGS.slice().sort((a, b) => b.findingCode.localeCompare(a.findingCode)).slice(0, 5).map((f) => [f.findingCode, f.title])],
  ['NS-004', 'Inspection Report Number', 'Report', 'INSR', 4, 64, 'Annually', 'Tenant-wide', true, [[`INSR-${YEAR}-0063`, 'Transformer statutory inspection - TRF-00072'], [`INSR-${YEAR}-0062`, 'Quarterly HVAC inspection - HVAC-00112 Chiller']]],
  ['NS-005', 'Calibration Certificate Number', 'Calibration', 'CAL', 4, 353, 'Annually', 'Site-wide', false, [[`CAL-${YEAR}-0352`, 'Battery Impedance Analyser']]]
];

export const NUMBERING_SEQUENCES: NumberingSequence[] = SEQ_SEEDS.map(([code, name, type, prefix, digits, running, reset, scope, active, records], i) => {
  const yearFormat = reset === 'Never' ? '' : 'YYYY';
  const format = yearFormat ? `${prefix}-{YYYY}-{SEQ}` : `${prefix}-{SEQ}`;
  const allocations = records.map(([reference, record], k) => ({ reference, record, allocatedAt: at(-(k * 3 + 1), '10:00'), state: k === 3 && type === 'Inspection' ? 'Cancelled' : 'Created' }));
  return {
    ...audit(`ns-${i + 1}`, active ? 'Active' : 'Inactive', 300, AHMED, 1),
    sequenceCode: code,
    sequenceName: name,
    numberType: type,
    prefix,
    separator: '-',
    yearFormat,
    sequenceDigits: digits,
    startingNumber: 1,
    runningNumber: running,
    resetFrequency: reset,
    scope,
    timezone: 'Asia/Dubai',
    format,
    generateOnFinalCreation: true,
    doNotReuse: true,
    allowManualOverride: type === 'Calibration',
    lastAllocated: allocations[0]?.reference ?? '',
    assignedThisYear: running - 1,
    allocations,
    isActive: active
  };
});

// ===== Working calendars =====
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function week(workingDays: string[], start: string, end: string): WorkingDay[] {
  return WEEK.map((d) => ({ day: d, working: workingDays.includes(d), start: workingDays.includes(d) ? start : '', end: workingDays.includes(d) ? end : '' }));
}

const UAE_HOLIDAYS: [string, string][] = [
  [`${YEAR}-12-02`, 'UAE National Day'],
  [`${YEAR}-12-03`, 'UAE National Day Holiday'],
  [`${YEAR + 1}-01-01`, "New Year's Day"]
];

export const WORKING_CALENDARS: WorkingCalendar[] = [
  {
    ...audit('cal-ho', 'Active', 260, AHMED, 6),
    calendarCode: 'CAL-001',
    calendarName: 'Head Office Standard Calendar',
    siteName: HO,
    timezone: 'Asia/Dubai',
    effectiveFrom: `${YEAR}-01-01`,
    workingWeek: week(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], '08:00', '17:00'),
    breakPeriod: '13:00 - 14:00',
    exceptions: [
      ...UAE_HOLIDAYS.map(([date, description]) => ({ date, description, duration: 'Full day', type: 'Holiday' })),
      { date: day(10), description: 'Fire drill - inspections paused', duration: '09:00 - 11:00', type: 'Site exception' },
      { date: day(4), description: 'Saturday shutdown inspections', duration: 'Full day', type: 'Working override' }
    ],
    nonWorkingDayRule: 'Move to next working day',
    dueDateCalculation: 'Working days',
    slaCalendar: 'Standard SLA',
    skipHolidays: true,
    respectInspectorShift: true,
    allowManualOverride: true,
    assignedPlans: 4,
    assignedInspectors: 5,
    assignedSites: 1,
    isActive: true
  },
  {
    ...audit('cal-dc', 'Active', 240, AHMED, 15),
    calendarCode: 'CAL-002',
    calendarName: 'Data Center 24x7 Calendar',
    siteName: DC,
    timezone: 'Asia/Dubai',
    effectiveFrom: `${YEAR}-01-01`,
    workingWeek: week(WEEK, '00:00', '23:59'),
    breakPeriod: '',
    exceptions: [{ date: day(14), description: 'Planned UPS maintenance window', duration: '22:00 - 04:00', type: 'Site exception' }],
    nonWorkingDayRule: 'Keep date',
    dueDateCalculation: 'Calendar days',
    slaCalendar: 'Critical 24x7 SLA',
    skipHolidays: false,
    respectInspectorShift: true,
    allowManualOverride: false,
    assignedPlans: 2,
    assignedInspectors: 2,
    assignedSites: 1,
    isActive: true
  },
  {
    ...audit('cal-wh', 'Active', 200, SARAH, 30),
    calendarCode: 'CAL-003',
    calendarName: 'Warehouse Shift Calendar',
    siteName: WH,
    timezone: 'Asia/Dubai',
    effectiveFrom: `${YEAR}-03-01`,
    workingWeek: week(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], '06:00', '22:00'),
    breakPeriod: '12:30 - 13:00',
    exceptions: UAE_HOLIDAYS.map(([date, description]) => ({ date, description, duration: 'Full day', type: 'Holiday' })),
    nonWorkingDayRule: 'Move to previous working day',
    dueDateCalculation: 'Working days',
    slaCalendar: 'Standard SLA',
    skipHolidays: true,
    respectInspectorShift: true,
    allowManualOverride: true,
    assignedPlans: 1,
    assignedInspectors: 1,
    assignedSites: 1,
    isActive: true
  }
];

/** Seed rows by API resource path. */
export const INSPECTION_SEED: Record<string, InspectionAudit[]> = {
  'inspection-types': INSPECTION_TYPES,
  'task-categories': TASK_CATEGORIES,
  'inspection-tasks': INSPECTION_TASKS,
  checklists: CHECKLISTS,
  'inspection-plans': INSPECTION_PLANS,
  inspections: INSPECTIONS,
  'inspection-findings': INSPECTION_FINDINGS,
  'calibration-instruments': CALIBRATION_INSTRUMENTS,
  'signatures-and-stamps': SIGNATURES_AND_STAMPS,
  'notification-templates': NOTIFICATION_TEMPLATES,
  'report-templates': REPORT_TEMPLATES,
  'numbering-sequences': NUMBERING_SEQUENCES,
  'holiday-and-working-calendars': WORKING_CALENDARS
};
