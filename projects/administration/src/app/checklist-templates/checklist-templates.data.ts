import { ChecklistItem, ChecklistSection, ResponseType, TemplateIcon } from './checklist-templates.model';

// Item pools and starter templates for the "Template Library"; the organization's templates come from the checklist API

type ItemSeed = [string, ResponseType, boolean, boolean, number, string?, string?, string?, boolean?];

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
