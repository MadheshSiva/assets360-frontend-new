import { ADMIN_LOCATIONS, ADMIN_PEOPLE } from '../shared/admin-common';
import {
  CATEGORY_CODES, ChecklistItem, ChecklistSection, ChecklistTemplate, ExecutionRecord, ResponseType, TemplateIcon, TemplateStatus, VersionRecord
} from './checklist-templates.model';

/*
 * DEMO MODE: 38 checklist templates. The first six match the approved design (Monthly Generator
 * Inspection is built item by item). Totals line up with the stat cards: 31 active, 5 draft,
 * 2 inactive, and per-template uses summing to 2,846 (drafts have never been run).
 */

const TOTAL_USES = 2846;

type ItemSeed = [string, ResponseType, boolean, boolean, number, string?, string?, string?, boolean?];

// The design's template: [text, response type, required, critical, score, help text, expected, failure action, escalate]
const GENERATOR_SECTIONS: [string, ItemSeed[]][] = [
  ['Safety & General', [
    ['Is the generator area clean and unobstructed?', 'Yes/No', true, false, 10, 'Remove any stored materials within 1 m of the enclosure.'],
    ['Verify there are no fuel or oil leaks.', 'Pass/Fail', true, true, 10, 'Check under the base frame and around the day tank.', 'No leaks', 'Create Maintenance Issue', true],
    ['Check that warning signage is in place.', 'Pass/Fail', true, false, 5],
    ['Take a photo of the generator and surroundings.', 'Photo', true, false, 5]
  ]],
  ['Engine & Fluid Levels', [
    ['Check engine oil level.', 'Numeric', true, false, 10, 'Read the dipstick with the engine stopped.', '75-100%', 'Create Maintenance Issue'],
    ['Inspect coolant level.', 'Numeric', true, false, 10, '', '50-100%', 'Create Maintenance Issue'],
    ['Check for fuel leaks around lines and connections.', 'Text', false, false, 5]
  ]],
  ['Electrical System', [
    ['Inspect battery terminals for corrosion.', 'Pass/Fail', true, true, 10, 'Check for any signs of corrosion, loose connections or damage.', '', 'Create Maintenance Issue', true],
    ['Verify emergency stop button function.', 'Pass/Fail', true, true, 10, '', '', 'Block Asset Use', true]
  ]],
  ['Load Test & Sign-off', [
    ['Run the generator under load for 15 minutes.', 'Pass/Fail', true, true, 10, '', '', 'Create Work Order'],
    ['Record output voltage.', 'Numeric', true, false, 10, '', '380-415 V', 'Notify Supervisor'],
    ['Add technician remarks.', 'Text', false, false, 0]
  ]]
];

// Generic sections used to build the other templates
const GENERIC_SECTIONS: [string, [string, ResponseType][]][] = [
  ['Safety & General', [
    ['Is the work area clean and free of obstructions?', 'Yes/No'],
    ['Are safety signs and labels visible and legible?', 'Pass/Fail'],
    ['Is the required PPE available and in use?', 'Yes/No'],
    ['Check emergency exits and access routes are clear.', 'Pass/Fail'],
    ['Verify lock-out / tag-out is applied where required.', 'Pass/Fail'],
    ['Take a photo of the area before work starts.', 'Photo'],
    ['Are fire extinguishers present and in date?', 'Yes/No'],
    ['Check lighting levels are adequate.', 'Pass/Fail']
  ]],
  ['Condition Checks', [
    ['Inspect for visible damage or wear.', 'Pass/Fail'],
    ['Check for leaks, stains or corrosion.', 'Pass/Fail'],
    ['Record operating temperature.', 'Numeric'],
    ['Record pressure reading.', 'Numeric'],
    ['Inspect cables, hoses and connections.', 'Pass/Fail'],
    ['Check fluid or consumable levels.', 'Numeric'],
    ['Photograph any defects found.', 'Photo'],
    ['Check mountings, guards and covers are secure.', 'Pass/Fail']
  ]],
  ['Functional Tests', [
    ['Start-up completes without alarms.', 'Pass/Fail'],
    ['Controls and indicators work correctly.', 'Pass/Fail'],
    ['Emergency stop functions correctly.', 'Pass/Fail'],
    ['Record running hours.', 'Numeric'],
    ['Is there unusual noise or vibration?', 'Yes/No'],
    ['Alarm and notification test completed.', 'Pass/Fail'],
    ['Record output reading.', 'Numeric'],
    ['Shut-down completes normally.', 'Pass/Fail']
  ]],
  ['Records & Sign-off', [
    ['Previous issues have been resolved.', 'Yes/No'],
    ["Service label updated with today's date.", 'Yes/No'],
    ['Record spare parts used.', 'Text'],
    ['Add remarks and recommendations.', 'Text'],
    ['Photo of the completed work.', 'Photo'],
    ['Supervisor notified of any defects.', 'Yes/No'],
    ['Tools and materials removed from site.', 'Yes/No'],
    ['Log book entry completed.', 'Yes/No']
  ]]
];

// [name, category, icon, tone, owner, item count, status, updated, frequency]
type TemplateSeed = [string, string, TemplateIcon, string, string, number, TemplateStatus, string, string];
const SEEDS: TemplateSeed[] = [
  ['Monthly Generator Inspection', 'Maintenance', 'file', 'purple', 'Sarah Ahmed', 12, 'Active', '2024-03-12', 'Monthly'],
  ['Fire Safety Checklist', 'Safety', 'flame', 'pink', 'Mohammed Ali', 15, 'Active', '2024-03-08', 'Monthly'],
  ['Preventive Maintenance – HVAC', 'Maintenance', 'settings', 'blue', 'Priya Nair', 18, 'Draft', '2024-03-05', 'Quarterly'],
  ['Warehouse Safety Walk', 'Safety', 'hardhat', 'orange', 'Daniel Tan', 20, 'Active', '2024-02-28', 'Weekly'],
  ['Asset Handover Checklist', 'Operations', 'file', 'purple', 'Sarah Ahmed', 14, 'Inactive', '2024-02-28', 'On demand'],
  ['Compliance Audit', 'Compliance', 'shield', 'green', 'Fatima Khan', 22, 'Active', '2024-02-14', 'Quarterly'],
  ['Weekly Chiller Check', 'Maintenance', 'droplets', 'blue', '', 10, 'Active', '', 'Weekly'],
  ['Elevator Monthly Service', 'Maintenance', 'settings', 'purple', '', 16, 'Active', '', 'Monthly'],
  ['UPS Battery Inspection', 'Maintenance', 'zap', 'orange', '', 9, 'Active', '', 'Monthly'],
  ['Forklift Daily Pre-Use Check', 'Operations', 'truck', 'orange', '', 12, 'Active', '', 'Daily'],
  ['Pump Station Maintenance', 'Maintenance', 'droplets', 'green', '', 14, 'Active', '', 'Monthly'],
  ['Boiler Quarterly Service', 'Maintenance', 'flame', 'red', '', 17, 'Active', '', 'Quarterly'],
  ['Cooling Tower Inspection', 'Inspection', 'droplets', 'blue', '', 11, 'Active', '', 'Monthly'],
  ['Compressor PM Checklist', 'Maintenance', 'settings', 'purple', '', 13, 'Active', '', 'Quarterly'],
  ['Fire Extinguisher Monthly Check', 'Safety', 'flame', 'pink', '', 8, 'Active', '', 'Monthly'],
  ['Emergency Lighting Test', 'Safety', 'zap', 'orange', '', 9, 'Active', '', 'Monthly'],
  ['First Aid Kit Inspection', 'Safety', 'clipboard', 'green', '', 10, 'Active', '', 'Monthly'],
  ['Working at Height Permit Check', 'Safety', 'hardhat', 'orange', '', 12, 'Active', '', 'On demand'],
  ['PPE Compliance Walk', 'Safety', 'hardhat', 'blue', '', 11, 'Active', '', 'Weekly'],
  ['Hazardous Materials Storage Check', 'Safety', 'shield', 'red', '', 15, 'Draft', '', 'Monthly'],
  ['Shift Handover Checklist', 'Operations', 'clipboard', 'purple', '', 8, 'Active', '', 'Daily'],
  ['Vehicle Pre-Trip Inspection', 'Operations', 'truck', 'blue', '', 16, 'Active', '', 'Daily'],
  ['Loading Dock Inspection', 'Operations', 'building', 'orange', '', 10, 'Active', '', 'Weekly'],
  ['Daily Opening Checklist', 'Operations', 'clipboard', 'green', '', 9, 'Active', '', 'Daily'],
  ['Asset Return Inspection', 'Operations', 'file', 'purple', '', 11, 'Active', '', 'On demand'],
  ['ISO 9001 Internal Audit', 'Compliance', 'shield', 'green', '', 24, 'Active', '', 'Yearly'],
  ['Fixed Asset Verification', 'Compliance', 'clipboard', 'blue', '', 12, 'Active', '', 'Yearly'],
  ['Calibration Records Review', 'Compliance', 'file', 'purple', '', 10, 'Active', '', 'Quarterly'],
  ['Environmental Compliance Check', 'Compliance', 'shield', 'green', '', 14, 'Draft', '', 'Quarterly'],
  ['Building Exterior Inspection', 'Inspection', 'building', 'blue', '', 13, 'Active', '', 'Quarterly'],
  ['Roof Condition Survey', 'Inspection', 'building', 'orange', '', 12, 'Draft', '', 'Half-yearly'],
  ['Electrical Panel Inspection', 'Inspection', 'zap', 'orange', '', 14, 'Active', '', 'Quarterly'],
  ['Plumbing System Inspection', 'Inspection', 'droplets', 'blue', '', 11, 'Active', '', 'Quarterly'],
  ['Server Room Daily Check', 'IT', 'server', 'purple', '', 10, 'Active', '', 'Daily'],
  ['Laptop Handover Checklist', 'IT', 'server', 'blue', '', 9, 'Inactive', '', 'On demand'],
  ['Network Cabinet Inspection', 'IT', 'server', 'green', '', 8, 'Active', '', 'Monthly'],
  ['Office Cleaning Audit', 'Facilities', 'building', 'pink', '', 12, 'Active', '', 'Weekly'],
  ['Pest Control Inspection', 'Facilities', 'clipboard', 'orange', '', 10, 'Draft', '', 'Monthly']
];

// Uses for the design's rows; the generator template absorbs the remainder so the total is 2,846
const FIXED_USES: Record<string, number> = {
  'Fire Safety Checklist': 196,
  'Warehouse Safety Walk': 174,
  'Asset Handover Checklist': 63,
  'Compliance Audit': 121
};

const CATEGORY_ASSETS: Record<string, string[]> = {
  Maintenance: ['Generator', 'Chiller', 'Pump'],
  Safety: ['Fire Extinguisher', 'Building'],
  Operations: ['Forklift', 'Vehicle'],
  Compliance: ['Building'],
  Inspection: ['Building', 'Air Conditioner'],
  IT: ['Server', 'UPS'],
  Facilities: ['Building']
};

const CATEGORY_TEAMS: Record<string, string> = {
  Maintenance: 'Maintenance Team',
  Safety: 'HSE Team',
  Operations: 'Operations Team',
  Compliance: 'Compliance Team',
  Inspection: 'Facilities Team',
  IT: 'IT Support',
  Facilities: 'Facilities Team'
};

const EXEC_ASSETS = ['GEN-DXB-0012', 'CHL-AUH-0004', 'FLT-SHJ-0019', 'UPS-DXB-0031', 'ELV-DXB-0002', 'PMP-RUH-0008', 'BLD-DXB-0001', 'SRV-DXB-0017'];

function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function item(id: string, s: ItemSeed): ChecklistItem {
  const [text, responseType, required, critical, score, helpText, expected, failureAction, escalate] = s;
  return {
    id,
    text,
    responseType,
    required,
    critical,
    score,
    helpText: helpText ?? '',
    expected: expected ?? '',
    attachmentRequired: responseType === 'Photo',
    failureAction: failureAction ?? (critical ? 'Create Maintenance Issue' : 'None'),
    escalate: escalate ?? false
  };
}

function generatorSections(tid: string): ChecklistSection[] {
  return GENERATOR_SECTIONS.map(([title, items], si) => ({
    id: `${tid}-S${si + 1}`,
    title,
    items: items.map((s, ii) => item(`${tid}-S${si + 1}-I${ii + 1}`, s))
  }));
}

/** Splits `count` items over 3 sections (4 when there are 16 or more), cycling the generic pools. */
function genericSections(tid: string, count: number, seed: number): ChecklistSection[] {
  const sectionCount = count >= 16 ? 4 : 3;
  const pools = sectionCount === 4 ? GENERIC_SECTIONS : [GENERIC_SECTIONS[0], GENERIC_SECTIONS[1], GENERIC_SECTIONS[3]];
  const sections: ChecklistSection[] = [];
  let left = count;
  pools.forEach(([title, pool], si) => {
    const n = si === pools.length - 1 ? left : Math.ceil(left / (pools.length - si));
    left -= n;
    const items: ChecklistItem[] = [];
    for (let k = 0; k < n; k++) {
      const [text, type] = pool[(k + seed) % pool.length];
      const critical = type === 'Pass/Fail' && (k + seed) % 3 === 1;
      items.push(item(`${tid}-S${si + 1}-I${k + 1}`, [text, type, type !== 'Text', critical, type === 'Text' || type === 'Photo' ? 5 : 10]));
    }
    sections.push({ id: `${tid}-S${si + 1}`, title, items });
  });
  return sections;
}

function versionHistory(version: string, status: TemplateStatus, updated: string, owner: string, i: number): VersionRecord[] {
  const [major, minor] = version.slice(1).split('.').map(Number);
  const rows: VersionRecord[] = [];
  for (let k = 0; k < 5 && minor - k >= 0; k++) {
    rows.push({
      version: `v${major}.${minor - k}`,
      date: isoDaysBefore(updated, k * 34),
      user: k === 0 ? owner : ADMIN_PEOPLE[(i + k * 3) % ADMIN_PEOPLE.length],
      status: k === 0 ? status : 'Inactive',
      note: k === 0 ? (status === 'Draft' ? 'Draft changes in progress' : 'Current published version') : ['Updated scoring', 'Added items', 'Reworded instructions', 'Changed pass threshold'][(i + k) % 4]
    });
  }
  return rows;
}

function executions(t: ChecklistTemplate, i: number): ExecutionRecord[] {
  if (!t.uses) return [];
  const rows: ExecutionRecord[] = [];
  for (let k = 0; k < Math.min(6, t.uses); k++) {
    const score = 68 + ((i * 13 + k * 7) % 32);
    rows.push({
      date: isoDaysBefore(t.updated, -(k * 5 + 3)),
      asset: EXEC_ASSETS[(i + k) % EXEC_ASSETS.length],
      location: ADMIN_LOCATIONS[(i + k) % ADMIN_LOCATIONS.length],
      performedBy: ADMIN_PEOPLE[(i * 2 + k + 3) % ADMIN_PEOPLE.length],
      score,
      result: score >= t.passThreshold ? 'Passed' : 'Failed'
    });
  }
  return rows.reverse();
}

const codeCounters: Record<string, number> = {};

export const TEMPLATES: ChecklistTemplate[] = SEEDS.map((s, i) => {
  const [name, category, icon, tone, owner, count, status, updated, frequency] = s;
  const prefix = CATEGORY_CODES[category];
  codeCounters[prefix] = (codeCounters[prefix] ?? 0) + 1;
  const id = `CHT-${String(i + 1).padStart(3, '0')}`;
  const realOwner = owner || ADMIN_PEOPLE[(i * 5) % ADMIN_PEOPLE.length];
  const realUpdated = updated || isoDaysBefore('2024-02-10', (i - 6) * 4);
  const version = i === 0 ? 'v2.3' : `v${1 + (i % 3)}.${(i * 7) % 10}`;
  const uses = status === 'Draft' ? 0 : FIXED_USES[name] ?? (i === 0 ? 0 : 43 + ((i * 23) % 60));
  return {
    id,
    name,
    code: `CHK-${prefix}-${String(codeCounters[prefix]).padStart(3, '0')}`,
    version,
    category,
    owner: realOwner,
    updated: realUpdated,
    status,
    icon,
    tone,
    description: i === 0
      ? 'Monthly inspection of standby generators covering safety, fluids, electrical system and a load test.'
      : `${name} used by the ${CATEGORY_TEAMS[category]}.`,
    frequency,
    assetTypes: CATEGORY_ASSETS[category],
    locations: [ADMIN_LOCATIONS[i % ADMIN_LOCATIONS.length]],
    teams: [CATEGORY_TEAMS[category]],
    requireApproval: category === 'Compliance' || i % 4 === 0,
    passThreshold: 80,
    scoringMethod: 'Weighted',
    failOnCritical: true,
    sections: i === 0 ? generatorSections(id) : genericSections(id, count, i),
    uses,
    versions: versionHistory(version, status, realUpdated, realOwner, i),
    executions: []
  };
});

// Give the remainder to the generator template so the per-template uses add up to the stat card
TEMPLATES[0].uses = TOTAL_USES - TEMPLATES.reduce((sum, t) => sum + t.uses, 0);
TEMPLATES.forEach((t, i) => (t.executions = executions(t, i)));

export interface LibraryEntry {
  name: string;
  category: string;
  icon: TemplateIcon;
  tone: string;
  items: number;
  frequency: string;
  description: string;
}

/** Starter templates offered by "Template Library" */
export const LIBRARY: LibraryEntry[] = [
  { name: 'Generator Weekly Run Test', category: 'Maintenance', icon: 'zap', tone: 'orange', items: 10, frequency: 'Weekly', description: 'Start-up, no-load run and alarm checks for standby generators.' },
  { name: 'HVAC Filter Replacement', category: 'Maintenance', icon: 'settings', tone: 'blue', items: 8, frequency: 'Quarterly', description: 'Filter condition, replacement and airflow verification.' },
  { name: 'Fire Alarm Panel Test', category: 'Safety', icon: 'flame', tone: 'pink', items: 12, frequency: 'Monthly', description: 'Panel status, zone tests and battery backup.' },
  { name: 'Workplace Safety Inspection', category: 'Safety', icon: 'hardhat', tone: 'orange', items: 16, frequency: 'Monthly', description: 'General housekeeping, PPE, exits and signage.' },
  { name: 'Vehicle Monthly Inspection', category: 'Operations', icon: 'truck', tone: 'blue', items: 14, frequency: 'Monthly', description: 'Tyres, lights, fluids, brakes and documents.' },
  { name: 'Asset Physical Verification', category: 'Compliance', icon: 'clipboard', tone: 'green', items: 9, frequency: 'Yearly', description: 'Tag, location, custodian and condition confirmation.' },
  { name: 'Data Centre Daily Walk', category: 'IT', icon: 'server', tone: 'purple', items: 11, frequency: 'Daily', description: 'Temperature, humidity, UPS, cooling and access checks.' },
  { name: 'Washroom Hygiene Audit', category: 'Facilities', icon: 'building', tone: 'pink', items: 8, frequency: 'Daily', description: 'Cleanliness, consumables and fixtures.' }
];

/** Builds the sections for a library entry; ids are prefixed so they stay unique */
export function librarySections(idPrefix: string, entry: LibraryEntry, seed: number): ChecklistSection[] {
  return genericSections(idPrefix, entry.items, seed);
}

export function categoryAssets(category: string): string[] {
  return CATEGORY_ASSETS[category] ?? [];
}

export function categoryTeam(category: string): string {
  return CATEGORY_TEAMS[category] ?? 'Maintenance Team';
}

/** Reusable items saved to the organization's item bank, shown under "Saved items" in the library. */
export const SAVED_ITEMS: { section: string; item: ChecklistItem }[] = [
  ['Safety & General', 'ITM-0001', ['Is the work area clean and free of obstructions?', 'Yes/No', true, false, 10, 'Remove stored materials within 1 m of the equipment.']],
  ['Safety & General', 'ITM-0002', ['Verify lock-out / tag-out is applied before work starts.', 'Pass/Fail', true, true, 10, '', '', 'Block Asset Use', true]],
  ['Safety & General', 'ITM-0003', ['Is the required PPE available and in use?', 'Yes/No', true, false, 5]],
  ['Condition Checks', 'ITM-0004', ['Check for leaks, stains or corrosion.', 'Pass/Fail', true, true, 10, 'Look under the base frame and around all joints.', 'No leaks', 'Create Maintenance Issue']],
  ['Condition Checks', 'ITM-0005', ['Record operating temperature.', 'Numeric', true, false, 10, '', '20-45 °C', 'Notify Supervisor']],
  ['Condition Checks', 'ITM-0006', ['Photograph any defects found.', 'Photo', false, false, 5]],
  ['Records & Sign-off', 'ITM-0007', ["Service label updated with today's date.", 'Yes/No', true, false, 5]],
  ['Records & Sign-off', 'ITM-0008', ['Add remarks and recommendations.', 'Text', false, false, 0]]
].map(([section, id, seed]) => ({ section: section as string, item: item(id as string, seed as ItemSeed) }));
