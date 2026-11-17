/**
 * Static demo data for the Maintenance module (no backend). Dates are relative to today so the overdue /
 * upcoming states and the "This Year" charts stay meaningful whenever the demo is opened.
 * Work orders reference their PM schedules, service requests and predictive alerts by code.
 */
import { CatalogAsset, findCatalogAsset } from './asset-catalog';
import { frequencyDays } from './derive';
import {
  PredictiveAnomaly, PredictiveMaintenance, PreventiveMaintenance, ServiceRequest, WorkOrder, WorkOrderHistoryEntry, WorkOrderLabour,
  WorkOrderPart, WorkOrderTask
} from './maintenance.models';
import { isoDay } from './mnt-utils';

const CLIENT = { clientId: 'CLT-1001', tenantId: 'TENANT-DEFAULT' };
const PLANNER = 'Khalid Mansoor';

const base = new Date();
base.setHours(0, 0, 0, 0);

/** 'YYYY-MM-DD' `offset` days from today. */
function on(offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

/** ISO date-time `offset` days from today at hh:mm local time. */
function at(offset: number, hh = 9, mm = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function asset(tag: string): CatalogAsset {
  const a = findCatalogAsset(tag);
  if (!a) throw new Error(`Unknown demo asset ${tag}`);
  return a;
}

const audit = (createdOffset: number, createdBy: string, updatedOffset = createdOffset) => ({
  createdBy,
  createdAt: at(createdOffset, 9, 15),
  updatedBy: createdBy,
  updatedAt: at(Math.min(updatedOffset, 0), 16, 40),
  isDeleted: false,
  ...CLIENT
});

// ---------------------------------------------------------------- reference lists

const TEAM_OF: Record<string, string> = {
  'Ravi Shankar': 'Electrical Team',
  'Vikram Singh': 'Electrical Team',
  'Ali Hassan': 'HVAC Team',
  'John Mathew': 'Mechanical Team',
  'Omar Farooq': 'Fire & Safety Team',
  'Priya Nair': 'IT & Critical Power',
  'Ibrahim Khan': 'Security Systems',
  'Ramesh Kumar': 'Renewables Team'
};

const RATE_OF: Record<string, number> = {
  'Electrical Team': 55, 'HVAC Team': 50, 'Mechanical Team': 45, 'Fire & Safety Team': 50, 'IT & Critical Power': 60, 'Security Systems': 40, 'Renewables Team': 45
};

const PARTS_BY_TYPE: Record<string, WorkOrderPart[]> = {
  Generator: [{ partNumber: 'FLT-OIL-C93', partName: 'Oil filter', quantity: 1, unitCost: 38 }, { partNumber: 'LUBE-15W40-20L', partName: 'Engine oil 15W-40 (20 L)', quantity: 1, unitCost: 96 }],
  Chiller: [{ partNumber: 'REF-R134A', partName: 'Refrigerant R-134a (kg)', quantity: 3, unitCost: 42 }],
  AHU: [{ partNumber: 'FLT-G4-592', partName: 'G4 panel filter 592x592', quantity: 4, unitCost: 22 }, { partNumber: 'BELT-SPA-1250', partName: 'V-belt SPA 1250', quantity: 2, unitCost: 19 }],
  UPS: [{ partNumber: 'BAT-12V-9AH', partName: 'VRLA battery 12V 9Ah', quantity: 4, unitCost: 55 }],
  Forklift: [{ partNumber: 'HYD-OIL-46-5L', partName: 'Hydraulic oil ISO 46 (5 L)', quantity: 1, unitCost: 34 }],
  'Pallet Jack': [{ partNumber: 'HYD-OIL-46-5L', partName: 'Hydraulic oil ISO 46 (5 L)', quantity: 1, unitCost: 34 }],
  'Fire System': [{ partNumber: 'PKG-GLAND-150', partName: 'Gland packing set', quantity: 1, unitCost: 65 }],
  'Air Conditioner': [{ partNumber: 'FLT-AC-140', partName: 'AC air filter', quantity: 2, unitCost: 18 }],
  Transformer: [{ partNumber: 'SIL-GEL-1KG', partName: 'Silica gel breather refill (1 kg)', quantity: 1, unitCost: 28 }],
  Laptop: [{ partNumber: 'SSD-512-NVME', partName: 'SSD 512 GB NVMe', quantity: 1, unitCost: 85 }]
};

const TASKS_BY_TYPE: Record<string, string[]> = {
  Preventive: ['Isolate equipment and apply LOTO', 'Inspect and clean components', 'Check fluid levels and filters', 'Run functional test and record readings'],
  Corrective: ['Diagnose fault and confirm root cause', 'Replace or repair failed component', 'Test and return to service'],
  Predictive: ['Review sensor trend and alarm history', 'Inspect component flagged by the model', 'Carry out corrective action', 'Verify readings are back within limits'],
  Inspection: ['Visual inspection', 'Record measurements', 'Report findings'],
  Service: ['Attend site and assess request', 'Complete service work', 'Requester sign-off']
};

// ---------------------------------------------------------------- preventive maintenance

interface PmSpec {
  tag: string;
  name: string;
  frequency: string;
  trigger: string;
  last: number;
  next: number;
  priority: string;
  tech: string;
  hours: number;
  status?: string;
  auto?: boolean;
  description: string;
  checklist: string[];
}

const PM_SPECS: PmSpec[] = [
  { tag: 'GEN-00045', name: 'Generator Monthly Service', frequency: 'Monthly', trigger: 'Time Based', last: -22, next: 8, priority: 'High', tech: 'Ravi Shankar', hours: 4, description: 'Monthly service of the 250 kVA standby generator including a 30 minute on-load run.', checklist: ['Check engine oil and coolant levels', 'Inspect fuel filters and drain water separator', 'Check battery voltage and terminals', 'Run on load for 30 minutes and record parameters'] },
  { tag: 'HVAC-00112', name: 'Chiller Quarterly Maintenance', frequency: 'Quarterly', trigger: 'Calendar Based', last: -75, next: 16, priority: 'High', tech: 'Ali Hassan', hours: 6, description: 'Quarterly chiller maintenance: condenser coil cleaning, refrigerant check and controls calibration.', checklist: ['Clean condenser coils', 'Check refrigerant pressures and superheat', 'Inspect compressor oil level', 'Calibrate leaving water temperature sensor'] },
  { tag: 'UPS-00078', name: 'UPS Battery Health Check', frequency: 'Quarterly', trigger: 'Time Based', last: -95, next: -4, priority: 'High', tech: 'Priya Nair', hours: 3, description: 'Battery impedance test and visual inspection of the data centre UPS battery strings.', checklist: ['Measure battery block voltages', 'Run impedance test on each string', 'Check terminal torque and corrosion', 'Review UPS event log'] },
  { tag: 'FLT-00021', name: 'Forklift 250 Hour Service', frequency: 'Every 250 Hours', trigger: 'Usage Based', last: -20, next: 5, priority: 'Medium', tech: 'John Mathew', hours: 3, description: 'Usage based service of the electric forklift every 250 operating hours.', checklist: ['Inspect mast chains and rollers', 'Check hydraulic oil level and hoses', 'Test brakes, horn and lights', 'Check traction battery water level'] },
  { tag: 'FP-00056', name: 'Fire Pump Weekly Run Test', frequency: 'Weekly', trigger: 'Time Based', last: -6, next: 1, priority: 'High', tech: 'Omar Farooq', hours: 1, description: 'Weekly churn test of the main fire pump as required by NFPA 25.', checklist: ['Start pump and run for 10 minutes', 'Record suction and discharge pressure', 'Check gland leakage', 'Reset controller to auto'] },
  { tag: 'AC-00311', name: 'Split AC Filter Cleaning', frequency: 'Monthly', trigger: 'Time Based', last: -29, next: 1, priority: 'Medium', tech: 'Ali Hassan', hours: 2, description: 'Monthly filter cleaning and drain check of the 5 ton split AC.', checklist: ['Clean indoor unit filters', 'Flush condensate drain', 'Check supply air temperature'] },
  { tag: 'TRF-00067', name: 'Transformer Oil Analysis', frequency: 'Bi-Annual', trigger: 'Condition Based', last: -170, next: -12, priority: 'High', tech: 'Vikram Singh', hours: 4, description: 'Dissolved gas analysis and dielectric strength test of the 1 MVA transformer oil.', checklist: ['Take oil sample for DGA', 'Test dielectric breakdown voltage', 'Inspect silica gel breather', 'Check oil level and leaks'] },
  { tag: 'GEN-00052', name: 'Gas Generator 500 Hour Service', frequency: 'Every 500 Hours', trigger: 'Usage Based', last: -40, next: 10, priority: 'Medium', tech: 'Ravi Shankar', hours: 5, description: 'Usage based service of the 500 kVA gas generator every 500 running hours.', checklist: ['Change engine oil and filters', 'Inspect spark plugs', 'Check gas train pressure', 'Load test for 1 hour'] },
  { tag: 'HVAC-00118', name: 'AHU Filter & Belt Inspection', frequency: 'Monthly', trigger: 'Time Based', last: -31, next: -1, priority: 'Medium', tech: 'Ali Hassan', hours: 2, description: 'Monthly AHU filter replacement and fan belt inspection.', checklist: ['Replace pre-filters', 'Inspect fan belt tension and alignment', 'Check damper actuators', 'Record differential pressure'] },
  { tag: 'CCTV-00234', name: 'CCTV Health Check', frequency: 'Quarterly', trigger: 'Calendar Based', last: -60, next: 31, priority: 'Low', tech: 'Ibrahim Khan', hours: 1, description: 'Quarterly lens cleaning, focus check and recording verification.', checklist: ['Clean dome and lens', 'Verify focus and field of view', 'Confirm recording on NVR'] },
  { tag: 'SOL-00456', name: 'Solar Panel Cleaning', frequency: 'Monthly', trigger: 'Calendar Based', last: -15, next: 15, priority: 'Low', tech: 'Ramesh Kumar', hours: 2, status: 'Paused', description: 'Monthly dry cleaning of the Building B rooftop array (paused during the rainy season).', checklist: ['Dry brush panel surfaces', 'Inspect cabling and connectors', 'Record string output'] },
  { tag: 'FP-00061', name: 'Fire Alarm Panel Annual Test', frequency: 'Yearly', trigger: 'Calendar Based', last: -330, next: 35, priority: 'High', tech: 'Omar Farooq', hours: 6, description: 'Annual statutory test of the fire alarm panel and all detection zones.', checklist: ['Test every detector and call point', 'Test sounders and strobes', 'Check standby battery capacity', 'Issue annual test certificate'] },
  { tag: 'UPS-00081', name: 'UPS 60 kVA Preventive Service', frequency: 'Bi-Annual', trigger: 'Time Based', last: -120, next: 62, priority: 'Medium', tech: 'Priya Nair', hours: 3, description: 'Six monthly service of the server room UPS.', checklist: ['Clean fans and filters', 'Check capacitor condition', 'Run battery autonomy test'] },
  { tag: 'TRF-00072', name: 'Transformer Thermographic Scan', frequency: 'Yearly', trigger: 'Condition Based', last: -200, next: 165, priority: 'Medium', tech: 'Vikram Singh', hours: 2, description: 'Annual infrared scan of the 500 kVA transformer terminations.', checklist: ['Thermal scan of LV and HV terminations', 'Check cooling fins', 'Record hot spots'] },
  { tag: 'FLT-00033', name: 'Pallet Jack Battery Service', frequency: 'Monthly', trigger: 'Time Based', last: -45, next: -15, priority: 'Low', tech: 'John Mathew', hours: 1, status: 'Inactive', auto: false, description: 'Monthly battery service; inactive while the pallet jack is in repair.', checklist: ['Check battery electrolyte', 'Clean terminals', 'Test charger'] }
];

const YEAR_OF = (iso: string) => iso.slice(0, 4);

export const PREVENTIVE_SEED: PreventiveMaintenance[] = PM_SPECS.map((s, i) => {
  const a = asset(s.tag);
  const created = -330 + i * 7;
  return {
    id: `pm-${String(i + 1).padStart(4, '0')}`,
    pmScheduleId: `PM-${YEAR_OF(on(created))}-${String(i + 1).padStart(3, '0')}`,
    scheduleName: s.name,
    assetId: a.tag,
    assetName: a.name,
    assetType: a.type,
    location: a.site,
    frequency: s.frequency,
    triggerType: s.trigger,
    lastMaintenanceDate: on(s.last),
    nextDueDate: on(s.next),
    autoCreateWorkOrder: s.auto ?? true,
    priority: s.priority,
    assignedTo: s.tech,
    estimatedHours: s.hours,
    description: s.description,
    checklist: s.checklist,
    status: s.status ?? 'Active',
    ...audit(created, PLANNER, s.last)
  };
});

// ---------------------------------------------------------------- work orders

interface WoSpec {
  tag: string;
  workType: string;
  title: string;
  priority: string;
  status: string;
  /** Due date, days from today. */
  due: number;
  /** Created, days from today. */
  created: number;
  tech: string | null;
  category: string;
  source: string;
  ref?: string | null;
  description?: string;
  vendor?: string | null;
  notes?: string | null;
  hours?: number;
  tasks?: string[];
  /** Days late (completed after the due date). */
  late?: number;
  additionalCost?: number;
  /** Stable key so service requests / predictions can point at the order. */
  key?: string;
}

const specs: WoSpec[] = [];

// Work orders generated by the PM schedules: past services (completed) plus the current cycle.
PREVENTIVE_SEED.forEach((pm, i) => {
  const s = PM_SPECS[i]!;
  const step = frequencyDays(s.frequency);
  const cap = step <= 7 ? 8 : 10;
  let n = 0;
  for (let due = s.last; due >= -310 && n < cap; due -= step, n++) {
    const missed = s.tag === 'FLT-00033' && n === 0;
    specs.push({
      tag: s.tag, workType: 'Preventive', title: `${s.name}`, priority: s.priority, due, created: due - Math.min(10, step),
      tech: s.tech, category: s.frequency === 'Yearly' ? 'Statutory' : 'Routine', source: 'PM Schedule', ref: pm.pmScheduleId,
      status: missed ? 'On Hold' : 'Completed', hours: s.hours, tasks: s.checklist, late: n % 4 === 3 ? 2 : 0,
      notes: missed ? 'On hold: pallet jack sent for traction battery repair.' : null
    });
  }
  if ((pm.status ?? 'Active') === 'Active' && s.next >= -7 && s.next <= 7) {
    const inProgress = s.tag === 'AC-00311' || s.tag === 'HVAC-00118';
    specs.push({
      tag: s.tag, workType: 'Preventive', title: s.name, priority: s.priority, due: s.next, created: s.next - 7, tech: s.tech,
      category: 'Routine', source: 'PM Schedule', ref: pm.pmScheduleId, status: inProgress ? 'In Progress' : 'Scheduled', hours: s.hours, tasks: s.checklist
    });
  }
});

// Corrective, inspection, service and predictive work.
specs.push(
  { key: 'sr-ac', tag: 'AC-00311', workType: 'Corrective', title: 'Split AC - 5 Ton - Repair Request', priority: 'High', status: 'In Progress', due: 1, created: -3, tech: 'Ali Hassan', category: 'Breakdown', source: 'Service Request', description: 'AC blowing warm air on the 2nd floor meeting area. Suspected low refrigerant charge.' },
  { key: 'sr-plt', tag: 'FLT-00033', workType: 'Corrective', title: 'Pallet Jack - Electric - Repair Request', priority: 'High', status: 'Completed', due: -45, created: -47, tech: 'John Mathew', category: 'Breakdown', source: 'Service Request', description: 'Pallet jack not lifting under load. Hydraulic pump relief valve replaced.', late: 6, additionalCost: 120 },
  { key: 'sr-fap', tag: 'FP-00061', workType: 'Inspection', title: 'Fire Alarm Panel - Inspection Request', priority: 'High', status: 'Completed', due: -14, created: -19, tech: 'Omar Farooq', category: 'Routine', source: 'Service Request', description: 'False alarms from zone 3. Two contaminated smoke detectors replaced.' },
  { key: 'sr-ups', tag: 'UPS-00081', workType: 'Corrective', title: 'UPS 60 kVA - Repair Request', priority: 'High', status: 'Completed', due: -66, created: -69, tech: 'Priya Nair', category: 'Breakdown', source: 'Service Request', description: 'Intermittent bypass alarm traced to a loose static switch connector.', vendor: 'Eaton Service' },
  { key: 'sr-flt', tag: 'FLT-00021', workType: 'Corrective', title: 'Forklift - Electric - Repair Request', priority: 'Medium', status: 'Completed', due: -175, created: -179, tech: 'John Mathew', category: 'Breakdown', source: 'Service Request', description: 'Horn and reverse beeper not working. Blown fuse and corroded connector replaced.' },
  { key: 'sr-gen', tag: 'GEN-00052', workType: 'Corrective', title: 'Gas Generator 500 kVA - Repair Request', priority: 'High', status: 'Completed', due: -228, created: -230, tech: 'Ravi Shankar', category: 'Emergency', source: 'Service Request', description: 'Generator failed to start during the weekly test. Starter motor replaced.', vendor: 'Cummins Service', additionalCost: 640 },
  { key: 'sr-chl', tag: 'HVAC-00112', workType: 'Corrective', title: 'HVAC Chiller - Replace condenser fan motor', priority: 'Medium', status: 'Open', due: -3, created: -30, tech: 'Ali Hassan', category: 'Breakdown', source: 'Service Request', description: 'Condenser fan motor 2 drawing high current; spare motor requested.', notes: 'Waiting for spare motor delivery from Carrier.' },
  { key: 'pdm-trf', tag: 'TRF-00067', workType: 'Predictive', title: 'Transformer 1 MVA - Inspect cooling fans and reduce load', priority: 'High', status: 'Scheduled', due: 6, created: -2, tech: 'Vikram Singh', category: 'Routine', source: 'Predictive Alert', description: 'Predicted issue: Winding insulation overheating\nTop oil and winding temperature trending above the 95 °C limit.' },
  { key: 'pdm-ahu', tag: 'HVAC-00118', workType: 'Predictive', title: 'Air Handling Unit - Realign and re-tension fan belts', priority: 'Medium', status: 'In Progress', due: 2, created: -9, tech: 'Ali Hassan', category: 'Routine', source: 'Predictive Alert', description: 'Predicted issue: Fan belt misalignment\nVibration at the fan bearing above 4.5 mm/s.' },
  { key: 'pdm-plt', tag: 'FLT-00033', workType: 'Predictive', title: 'Pallet Jack - Electric - Replace traction battery', priority: 'High', status: 'Completed', due: -38, created: -44, tech: 'John Mathew', category: 'Routine', source: 'Predictive Alert', description: 'Predicted issue: Traction battery cell failure' },
  { tag: 'TRF-00067', workType: 'Corrective', title: 'Transformer bushing repair', priority: 'High', status: 'On Hold', due: 10, created: -8, tech: 'Vikram Singh', category: 'Breakdown', source: 'Manual', vendor: 'ABB Service', description: 'Oil seepage at LV bushing B-phase.', notes: 'Awaiting replacement bushing gasket kit from ABB.' },
  { tag: 'GEN-00045', workType: 'Inspection', title: 'Annual generator load bank test', priority: 'High', status: 'Completed', due: -150, created: -165, tech: 'Ravi Shankar', category: 'Statutory', source: 'Manual', vendor: 'Caterpillar Service', description: '4 hour load bank test at 100% rated load.', additionalCost: 850 },
  { tag: 'FP-00056', workType: 'Corrective', title: 'Fire pump gland leak repair', priority: 'High', status: 'Completed', due: -95, created: -98, tech: 'Omar Farooq', category: 'Breakdown', source: 'Inspection', description: 'Excessive gland leakage found during the weekly run test.' },
  { tag: 'SOL-00456', workType: 'Service', title: 'Inverter firmware update', priority: 'Low', status: 'Cancelled', due: -60, created: -70, tech: 'Ramesh Kumar', category: 'Improvement', source: 'Manual', description: 'Vendor confirmed the update is not required for this inverter model.' },
  { tag: 'UPS-00078', workType: 'Inspection', title: 'UPS thermal imaging survey', priority: 'Medium', status: 'Scheduled', due: 20, created: -5, tech: 'Priya Nair', category: 'Routine', source: 'Manual', vendor: 'Schneider Electric Service', description: 'Infrared survey of UPS input/output breakers and battery links.' },
  { tag: 'TRF-00072', workType: 'Inspection', title: 'Annual transformer statutory inspection', priority: 'Medium', status: 'Scheduled', due: 28, created: -4, tech: 'Vikram Singh', category: 'Statutory', source: 'Manual', description: 'Statutory inspection by the authority-approved inspector.' },
  { tag: 'FLT-00021', workType: 'Corrective', title: 'Replace forklift mast chain rollers', priority: 'Medium', status: 'Completed', due: -200, created: -206, tech: 'John Mathew', category: 'Breakdown', source: 'Inspection', description: 'Worn mast rollers causing jerky lift.' },
  { tag: 'CCTV-00241', workType: 'Service', title: 'Loading bay camera IR illuminator check', priority: 'Medium', status: 'Open', due: 4, created: -1, tech: null, category: 'Routine', source: 'Manual', description: 'Night image blurry; check IR illuminator and re-focus.' },
  { tag: 'IT-00189', workType: 'Corrective', title: 'Replace laptop keyboard', priority: 'Medium', status: 'Scheduled', due: 3, created: -5, tech: 'Priya Nair', category: 'Breakdown', source: 'Manual', description: 'Several keys unresponsive; replacement keyboard ordered.' },
  { tag: 'HVAC-00112', workType: 'Corrective', title: 'Chiller condenser fan bearing replacement', priority: 'High', status: 'Completed', due: -116, created: -119, tech: 'Ali Hassan', category: 'Breakdown', source: 'Predictive Alert', description: 'Bearing failed as predicted by the vibration model.', additionalCost: 210 },
  { tag: 'GEN-00045', workType: 'Corrective', title: 'Coolant pump seal replacement', priority: 'High', status: 'Completed', due: -186, created: -188, tech: 'Ravi Shankar', category: 'Breakdown', source: 'Manual', description: 'Coolant leak at the water pump seal.' },
  { tag: 'AC-00311', workType: 'Service', title: 'Relocate thermostat in meeting room', priority: 'Low', status: 'Completed', due: -240, created: -250, tech: 'Ali Hassan', category: 'Improvement', source: 'Manual', description: 'Thermostat moved away from direct sunlight.' },
  { tag: 'CCTV-00234', workType: 'Inspection', title: 'Annual security system audit', priority: 'Low', status: 'Completed', due: -280, created: -290, tech: 'Ibrahim Khan', category: 'Statutory', source: 'Manual', description: 'Annual audit of camera coverage and retention.' }
);

function buildWorkOrder(s: WoSpec): WorkOrder {
  const a = asset(s.tag);
  const team = s.tech ? TEAM_OF[s.tech] ?? null : null;
  const done = s.status === 'Completed';
  const started = done || s.status === 'In Progress' || s.status === 'On Hold';
  const titles = s.tasks ?? TASKS_BY_TYPE[s.workType] ?? TASKS_BY_TYPE['Corrective']!;
  const doneCount = done ? titles.length : s.status === 'In Progress' ? Math.ceil(titles.length / 2) : s.status === 'On Hold' ? 1 : 0;
  const endOffset = s.due + (s.late ?? 0);
  const tasks: WorkOrderTask[] = titles.map((title, i) => ({
    title, assignedTo: s.tech, isDone: i < doneCount, completedAt: i < doneCount ? at(Math.min(done ? endOffset : s.due - 1, 0), 10 + i, 0) : null
  }));
  const hours = s.hours ?? (s.workType === 'Inspection' ? 2 : s.workType === 'Corrective' ? 4 : 3);
  const parts = started && s.workType !== 'Inspection' ? (PARTS_BY_TYPE[a.type] ?? []).map((p) => ({ ...p })) : [];
  const labour: WorkOrderLabour[] = started && s.tech ? [{ technician: s.tech, role: 'Technician', hours: done ? hours + (s.late ? 1 : 0) : Math.round(hours / 2), hourlyRate: RATE_OF[team ?? ''] ?? 45 }] : [];
  const history: WorkOrderHistoryEntry[] = [{ at: at(s.created, 9, 15), by: s.source === 'PM Schedule' ? 'System' : PLANNER, action: 'Created', details: s.source === 'Manual' ? null : `Raised from ${s.source}${s.ref ? ` ${s.ref}` : ''}` }];
  if (s.tech) history.push({ at: at(s.created, 11, 30), by: PLANNER, action: 'Assigned', details: `Assigned to ${s.tech}` });
  if (started) history.push({ at: at(Math.min(s.due - 1, 0), 8, 30), by: s.tech, action: 'Status changed', details: 'Scheduled → In Progress' });
  if (s.status === 'On Hold') history.push({ at: at(Math.min(s.due, 0), 14, 0), by: s.tech, action: 'Status changed', details: 'In Progress → On Hold' });
  if (done) history.push({ at: at(Math.min(endOffset, 0), 15, 45), by: s.tech, action: 'Status changed', details: 'In Progress → Completed' });
  if (s.status === 'Cancelled') history.push({ at: at(s.due - 2, 12, 0), by: PLANNER, action: 'Status changed', details: 'Scheduled → Cancelled' });
  const wo: WorkOrder = {
    id: '',
    workOrderId: '',
    assetId: a.tag,
    assetName: a.name,
    workType: s.workType,
    title: s.title,
    description: s.description ?? null,
    priority: s.priority,
    status: s.status,
    scheduledDate: on(s.due),
    assignedTechnician: s.tech,
    category: s.category,
    dueDate: on(s.due),
    plannedStartDate: at(s.due - 1, 8, 0),
    plannedEndDate: at(s.due, 17, 0),
    actualStartDate: started ? at(Math.min(s.due - 1, 0), 8, 30) : null,
    actualEndDate: done ? at(Math.min(endOffset, 0), 15, 45) : null,
    estimatedHours: hours,
    source: s.source,
    sourceReference: s.ref ?? null,
    site: a.site,
    building: a.building,
    area: a.area,
    department: a.department,
    team,
    vendor: s.vendor ?? null,
    notes: s.notes ?? null,
    progress: done ? 100 : Math.round((doneCount / titles.length) * 100),
    tasks,
    parts,
    labour,
    additionalCost: s.additionalCost ?? 0,
    documents: done ? [{ name: `${s.title} - Job Sheet.pdf`, url: null, fileType: 'pdf', uploadedBy: s.tech, uploadedAt: at(Math.min(endOffset, 0), 16, 0) }] : [],
    history: history.reverse(),
    partsCost: 0,
    labourCost: 0,
    totalCost: 0,
    ...audit(s.created, s.source === 'PM Schedule' ? 'System' : PLANNER, done ? endOffset : s.due - 1)
  };
  return withWorkOrderTotals(wo);
}

/** Parts, labour and total cost of a work order (computed by the server in the live system). */
export function withWorkOrderTotals(w: WorkOrder): WorkOrder {
  const partsCost = (w.parts ?? []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unitCost) || 0), 0);
  const labourCost = (w.labour ?? []).reduce((s, l) => s + (Number(l.hours) || 0) * (Number(l.hourlyRate) || 0), 0);
  return { ...w, partsCost, labourCost, totalCost: partsCost + labourCost + (Number(w.additionalCost) || 0) };
}

const built = specs
  .map((s) => ({ s, wo: buildWorkOrder(s) }))
  .sort((x, y) => (x.wo.createdAt ?? '').localeCompare(y.wo.createdAt ?? ''));
const counters = new Map<string, number>();
built.forEach(({ wo }, i) => {
  const year = YEAR_OF(on(0)) === YEAR_OF(wo.createdAt!) ? YEAR_OF(on(0)) : new Date(wo.createdAt!).getFullYear().toString();
  const n = (counters.get(year) ?? 0) + 1;
  counters.set(year, n);
  wo.id = `wo-${String(i + 1).padStart(4, '0')}`;
  wo.workOrderId = `WO-${year}-${String(n).padStart(3, '0')}`;
});

/** Code of the work order seeded under `key`. */
function woCode(key: string): string {
  return built.find((b) => b.s.key === key)!.wo.workOrderId;
}

// ---------------------------------------------------------------- service requests

interface SrSpec {
  type: string;
  category: string;
  tag: string;
  by: string;
  severity: string;
  description: string;
  requested: number;
  target: number;
  assignedTo: string | null;
  status: string;
  wo?: string;
  resolved?: number;
  notes?: string;
}

const SR_SPECS: SrSpec[] = [
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'AC-00311', by: 'Faisal Ahmed', severity: 'High', description: 'AC blowing warm air in the 2nd floor meeting area since this morning.', requested: -3, target: 1, assignedTo: 'Ali Hassan', status: 'In Progress', wo: 'sr-ac' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'FLT-00033', by: 'Rashid Ali', severity: 'High', description: 'Pallet jack not lifting pallets over 800 kg.', requested: -48, target: -45, assignedTo: 'John Mathew', status: 'Closed', wo: 'sr-plt', resolved: -39, notes: 'Hydraulic relief valve replaced and load tested at 1,200 kg.' },
  { type: 'Service Request', category: 'Facility Issue', tag: 'CCTV-00241', by: 'Ibrahim Khan', severity: 'Medium', description: 'Loading bay camera image is blurry at night.', requested: -9, target: -2, assignedTo: 'Omar Farooq', status: 'Open' },
  { type: 'Spare Part Request', category: 'Spare Part Request', tag: 'GEN-00045', by: 'Ahmed Basim', severity: 'Medium', description: 'Request 4 spare fuel filters for generator stock.', requested: -12, target: 3, assignedTo: 'Ravi Shankar', status: 'In Progress' },
  { type: 'Inspection Request', category: 'Inspection Request', tag: 'FP-00061', by: 'Noura Saeed', severity: 'High', description: 'Repeated false alarms from zone 3 detectors. Please inspect the panel and detectors.', requested: -20, target: -14, assignedTo: 'Omar Farooq', status: 'Resolved', wo: 'sr-fap', resolved: -14, notes: 'Two contaminated smoke detectors replaced; zone tested OK.' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'IT-00204', by: 'Mohan Kumar', severity: 'Low', description: 'Laptop battery drains from full in under two hours.', requested: -2, target: 5, assignedTo: null, status: 'Open' },
  { type: 'Repair Request', category: 'Facility Issue', tag: 'HVAC-00118', by: 'Sara Ahmed', severity: 'Medium', description: 'Unusual squealing noise from the AHU in the plant room.', requested: -16, target: -10, assignedTo: 'Ali Hassan', status: 'Resolved', resolved: -9, notes: 'Covered by predictive work order for fan belt alignment.' },
  { type: 'Service Request', category: 'Equipment Issue', tag: 'SOL-00456', by: 'Ramesh Kumar', severity: 'Low', description: 'Solar output 15% below forecast; check panel soiling.', requested: -1, target: 7, assignedTo: null, status: 'Open' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'UPS-00081', by: 'Sarah James', severity: 'High', description: 'UPS showing bypass alarm intermittently in the server room.', requested: -70, target: -66, assignedTo: 'Priya Nair', status: 'Closed', wo: 'sr-ups', resolved: -66, notes: 'Static switch connector re-terminated by Eaton engineer.' },
  { type: 'Inspection Request', category: 'Inspection Request', tag: 'TRF-00072', by: 'Hamad Lateef', severity: 'Medium', description: 'Check transformer room ventilation after the hot spell.', requested: -110, target: -100, assignedTo: 'Vikram Singh', status: 'Closed', resolved: -101, notes: 'Exhaust fan filter cleaned; room temperature normal.' },
  { type: 'Service Request', category: 'Facility Issue', tag: 'AC-00318', by: 'Faisal Ahmed', severity: 'Low', description: 'Relocate the stored 2 ton split AC to Building C.', requested: -140, target: -130, assignedTo: 'Ali Hassan', status: 'Rejected', notes: 'Unit to remain in storage pending disposal review.' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'FLT-00021', by: 'Rashid Ali', severity: 'Medium', description: 'Forklift horn and reverse beeper not working.', requested: -180, target: -175, assignedTo: 'John Mathew', status: 'Closed', wo: 'sr-flt', resolved: -176, notes: 'Fuse and corroded connector replaced.' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'GEN-00052', by: 'Hamad Lateef', severity: 'High', description: 'Gas generator failed to start during the weekly test.', requested: -231, target: -228, assignedTo: 'Ravi Shankar', status: 'Closed', wo: 'sr-gen', resolved: -228, notes: 'Starter motor replaced by Cummins.' },
  { type: 'Service Request', category: 'Facility Issue', tag: 'CCTV-00234', by: 'Ibrahim Khan', severity: 'Low', description: 'Adjust the dome camera to cover the new side entrance.', requested: -260, target: -250, assignedTo: 'Omar Farooq', status: 'Closed', resolved: -255, notes: 'Camera re-aimed and preset saved.' },
  { type: 'Spare Part Request', category: 'Spare Part Request', tag: 'HVAC-00112', by: 'Sara Ahmed', severity: 'Medium', description: 'Spare condenser fan motor for the chiller.', requested: -35, target: -20, assignedTo: 'Ali Hassan', status: 'In Progress', wo: 'sr-chl' },
  { type: 'Repair Request', category: 'Equipment Issue', tag: 'IT-00189', by: 'Sarah James', severity: 'Medium', description: 'Laptop keyboard keys unresponsive.', requested: -6, target: 2, assignedTo: 'Priya Nair', status: 'In Progress' },
  { type: 'Repair Request', category: 'Other', tag: 'FP-00056', by: 'Noura Saeed', severity: 'Medium', description: 'Water dripping from fire pump gland.', requested: -99, target: -95, assignedTo: 'Omar Farooq', status: 'Closed', resolved: -95, notes: 'Gland repacked (see work order).' }
];

export const SERVICE_REQUEST_SEED: ServiceRequest[] = SR_SPECS
  .slice()
  .sort((a, b) => a.requested - b.requested)
  .map((s, i) => {
    const a = asset(s.tag);
    return {
      id: `sr-${String(i + 1).padStart(4, '0')}`,
      issueId: `SR-${YEAR_OF(on(s.requested))}-${String(i + 1).padStart(3, '0')}`,
      assetId: a.tag,
      assetName: a.name,
      reportedBy: s.by,
      issueType: s.type,
      severity: s.severity,
      description: s.description,
      category: s.category,
      location: a.site,
      requestedDate: on(s.requested),
      targetDate: on(s.target),
      assignedTo: s.assignedTo,
      workOrderId: s.wo ? woCode(s.wo) : null,
      resolvedDate: s.resolved !== undefined ? on(s.resolved) : null,
      resolutionNotes: s.notes ?? null,
      status: s.status,
      ...audit(s.requested, s.by, s.resolved ?? s.requested + 1)
    };
  });

// Service request work orders point back at their request code.
built.forEach(({ s, wo }) => {
  if (s.source !== 'Service Request') return;
  const sr = SERVICE_REQUEST_SEED.find((r) => r.workOrderId === wo.workOrderId);
  if (sr) {
    wo.sourceReference = sr.issueId;
    wo.history = wo.history.map((h) => (h.action === 'Created' ? { ...h, details: `Raised from Service Request ${sr.issueId}` } : h));
  }
});

// ---------------------------------------------------------------- predictive maintenance

interface PdmSpec {
  tag: string;
  sensor: string;
  threshold: number;
  condition: string;
  reading: number;
  model: string;
  risk: string;
  health: number;
  issue: string | null;
  predicted: number | null;
  confidence: number | null;
  action: string | null;
  status: string;
  actual?: number;
  wo?: string;
  output?: string;
  /** [days ago, value, severity, note] */
  anomalies?: [number, number, string, string][];
}

const PDM_SPECS: PdmSpec[] = [
  { tag: 'TRF-00067', sensor: 'Temperature', threshold: 95, condition: 'Above Threshold', reading: 104, model: 'Thermal Degradation Model', risk: 'High', health: 38, issue: 'Winding insulation overheating', predicted: 9, confidence: 87, action: 'Inspect cooling fans and reduce load', status: 'Work Order Raised', wo: 'pdm-trf', output: 'Winding hot-spot temperature rising 1.8 °C/day; insulation ageing rate 4x nominal.', anomalies: [[1, 104, 'High', 'Top oil temperature above limit'], [3, 99, 'High', 'Sustained above threshold for 6 h'], [8, 93, 'Medium', 'Upward trend started']] },
  { tag: 'UPS-00078', sensor: 'Voltage', threshold: 12.2, condition: 'Below Threshold', reading: 11.8, model: 'Battery Life Predictor', risk: 'High', health: 44, issue: 'Battery string end-of-life', predicted: 18, confidence: 82, action: 'Replace battery string B', status: 'Alert', output: 'String B float voltage below 12.2 V per block; estimated remaining autonomy 6 minutes.', anomalies: [[0, 11.8, 'High', 'Block 14 voltage low'], [5, 12.0, 'Medium', 'Impedance up 35% vs baseline']] },
  { tag: 'GEN-00045', sensor: 'Vibration', threshold: 7.1, condition: 'Above Threshold', reading: 6.4, model: 'Vibration Anomaly v2.1', risk: 'At Risk', health: 63, issue: 'Alternator bearing wear', predicted: 41, confidence: 71, action: 'Schedule bearing inspection at next service', status: 'Monitoring', output: 'Bearing defect frequency amplitude increasing; RMS velocity 6.4 mm/s.', anomalies: [[4, 6.4, 'Medium', 'Bearing defect frequency detected']] },
  { tag: 'HVAC-00112', sensor: 'Current', threshold: 180, condition: 'Above Threshold', reading: 186, model: 'Motor Current Signature', risk: 'At Risk', health: 58, issue: 'Compressor motor overload', predicted: 24, confidence: 76, action: 'Check refrigerant charge and compressor amps', status: 'Alert', output: 'Compressor current 3% above rated; correlated with high condensing pressure.', anomalies: [[2, 186, 'Medium', 'Current above rated'], [6, 182, 'Low', 'Brief overcurrent during peak load']] },
  { tag: 'HVAC-00118', sensor: 'Vibration', threshold: 4.5, condition: 'Above Threshold', reading: 5.2, model: 'Vibration Anomaly v2.1', risk: 'At Risk', health: 61, issue: 'Fan belt misalignment', predicted: 12, confidence: 79, action: 'Realign and re-tension fan belts', status: 'Work Order Raised', wo: 'pdm-ahu', output: '1x running speed vibration dominant; consistent with pulley misalignment.', anomalies: [[9, 5.2, 'Medium', 'Vibration above limit'], [14, 4.7, 'Low', 'Rising trend']] },
  { tag: 'FP-00056', sensor: 'Pressure', threshold: 7, condition: 'Below Threshold', reading: 7.6, model: 'Pressure Decay Model', risk: 'Healthy', health: 86, issue: null, predicted: null, confidence: 90, action: null, status: 'Monitoring', output: 'Discharge pressure stable at 7.6 bar during weekly runs.' },
  { tag: 'FLT-00021', sensor: 'Runtime Hours', threshold: 250, condition: 'Above Threshold', reading: 236, model: 'Usage Forecast', risk: 'Healthy', health: 81, issue: 'Service interval due', predicted: 6, confidence: 92, action: 'Carry out 250 hour service', status: 'Monitoring', output: 'Average 2.3 operating hours/day; 250 h interval reached in about 6 days.' },
  { tag: 'GEN-00052', sensor: 'Oil Quality', threshold: 150, condition: 'Above Threshold', reading: 132, model: 'Oil Condition Model', risk: 'At Risk', health: 67, issue: 'Oil contamination (iron particles)', predicted: 35, confidence: 68, action: 'Take oil sample and change oil', status: 'Monitoring', output: 'Ferrous particle count rising 6 ppm/week.', anomalies: [[11, 132, 'Low', 'Iron particles increasing']] },
  { tag: 'UPS-00081', sensor: 'Temperature', threshold: 35, condition: 'Above Threshold', reading: 27, model: 'Battery Life Predictor', risk: 'Healthy', health: 91, issue: null, predicted: null, confidence: 88, action: null, status: 'Monitoring', output: 'Battery room temperature stable; expected battery life 3.4 years.' },
  { tag: 'TRF-00072', sensor: 'Temperature', threshold: 95, condition: 'Above Threshold', reading: 71, model: 'Thermal Degradation Model', risk: 'Healthy', health: 88, issue: null, predicted: null, confidence: 85, action: null, status: 'Monitoring', output: 'Top oil temperature within normal band.' },
  { tag: 'AC-00311', sensor: 'Current', threshold: 22, condition: 'Above Threshold', reading: 20.5, model: 'Motor Current Signature', risk: 'Healthy', health: 74, issue: null, predicted: null, confidence: 80, action: null, status: 'Monitoring', output: 'Compressor current normal; filter loading moderate.' },
  { tag: 'FLT-00033', sensor: 'Current', threshold: 160, condition: 'Above Threshold', reading: 172, model: 'Battery Life Predictor', risk: 'High', health: 35, issue: 'Traction battery cell failure', predicted: -40, confidence: 84, action: 'Replace traction battery', status: 'Resolved', actual: -37, wo: 'pdm-plt', output: 'Cell 7 voltage collapse under load.', anomalies: [[45, 172, 'High', 'Discharge current spike'], [50, 165, 'Medium', 'Cell imbalance']] },
  { tag: 'HVAC-00112', sensor: 'Vibration', threshold: 7.1, condition: 'Above Threshold', reading: 9.3, model: 'Vibration Anomaly v2.1', risk: 'High', health: 41, issue: 'Condenser fan bearing failure', predicted: -120, confidence: 81, action: 'Replace condenser fan bearing', status: 'Resolved', actual: -116, output: 'Bearing outer race defect.', anomalies: [[125, 9.3, 'High', 'Vibration above limit']] },
  { tag: 'GEN-00045', sensor: 'Temperature', threshold: 98, condition: 'Above Threshold', reading: 101, model: 'Thermal Degradation Model', risk: 'High', health: 48, issue: 'Coolant pump seal leak', predicted: -200, confidence: 66, action: 'Replace coolant pump seal', status: 'Resolved', actual: -188, output: 'Coolant temperature drift under load.' },
  { tag: 'UPS-00078', sensor: 'Temperature', threshold: 35, condition: 'Above Threshold', reading: 38, model: 'Battery Life Predictor', risk: 'High', health: 46, issue: 'Battery cell thermal runaway risk', predicted: -150, confidence: 83, action: 'Replace swollen battery blocks', status: 'Resolved', actual: -147, output: 'Two blocks 6 °C above string average.' },
  { tag: 'FP-00056', sensor: 'Pressure', threshold: 7, condition: 'Below Threshold', reading: 6.3, model: 'Pressure Decay Model', risk: 'At Risk', health: 55, issue: 'Gland packing wear', predicted: -90, confidence: 74, action: 'Repack pump gland', status: 'Resolved', actual: -95, output: 'Discharge pressure decaying 0.1 bar/week.' },
  { tag: 'TRF-00067', sensor: 'Oil Quality', threshold: 30, condition: 'Below Threshold', reading: 26, model: 'Oil Condition Model', risk: 'At Risk', health: 57, issue: 'Low dielectric strength', predicted: -250, confidence: 70, action: 'Filter transformer oil', status: 'Resolved', actual: -245, output: 'Breakdown voltage 26 kV, below the 30 kV limit.' }
];

const DEVICE_PREFIX: Record<string, string> = { Temperature: 'T', Vibration: 'V', Pressure: 'P', Current: 'I', Voltage: 'U', Humidity: 'H', 'Oil Quality': 'O', 'Runtime Hours': 'R' };

export const PREDICTIVE_SEED: PredictiveMaintenance[] = PDM_SPECS.map((s, i) => {
  const a = asset(s.tag);
  const resolved = s.status === 'Resolved';
  const lastAt = resolved ? (s.actual ?? 0) - 1 : 0;
  const anomalies: PredictiveAnomaly[] = (s.anomalies ?? []).map(([ago, value, severity, note], k) => ({
    detectedAt: at(-ago, 6 + k * 3, 20),
    metric: s.sensor,
    value,
    expected: `${s.condition === 'Below Threshold' ? '≥' : '≤'} ${s.threshold}`,
    severity,
    note
  }));
  const created = Math.min(-60, (s.predicted ?? 0) - 30) - i;
  return {
    id: `pdm-${String(i + 1).padStart(4, '0')}`,
    assetId: a.tag,
    assetName: a.name,
    assetType: a.type,
    location: a.site,
    sensorType: s.sensor,
    thresholdValue: s.threshold,
    alertCondition: s.condition,
    dataSourceDeviceId: `IOT-${a.tag}-${DEVICE_PREFIX[s.sensor] ?? 'S'}1`,
    lastReading: s.reading,
    lastReadingAt: at(lastAt, 8, 45),
    predictionModelOutput: s.output ?? null,
    modelName: s.model,
    riskLevel: s.risk,
    healthScore: s.health,
    predictedIssue: s.issue,
    predictedFailureDate: s.predicted === null ? null : on(s.predicted),
    confidence: s.confidence,
    recommendedAction: s.action,
    actualFailureDate: s.actual !== undefined ? on(s.actual) : null,
    workOrderId: s.wo ? woCode(s.wo) : null,
    anomalies,
    status: s.status,
    ...audit(created, 'Predictive Engine', resolved ? s.actual ?? 0 : 0)
  };
});

// Predictive work orders carry "<asset> · <model>" as their source reference, like the page raises them.
built.forEach(({ s, wo }) => {
  if (s.source !== 'Predictive Alert') return;
  const p = PREDICTIVE_SEED.find((x) => x.workOrderId === wo.workOrderId) ?? PREDICTIVE_SEED.find((x) => x.assetId === wo.assetId);
  wo.sourceReference = `${wo.assetId} · ${p?.modelName ?? 'Predictive model'}`;
});

export const WORK_ORDER_SEED: WorkOrder[] = built.map((b) => b.wo);
