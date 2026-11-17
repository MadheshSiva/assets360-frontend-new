import { ADMIN_PEOPLE, CURRENT_USER, todayIso } from '../shared/admin-common';
import { ChangeRecord, FormatToken, NumberSequence, ResetRule, SequenceIcon, SequenceScope, UsageRecord, formatNumber } from './numbering-sequence.model';

/*
 * DEMO MODE: 28 numbering sequences. The first seven match the approved design and the totals line up
 * with the stat cards: all 28 active, current numbers summing to 14,862, 46 prefix / location / suffix
 * codes, and exactly 3 sequences at 90% or more of their number range (Purchase Request, Gate Pass,
 * Visitor Pass). The last four were created this month ("+4 this month").
 */

// [name, code, module, record type, icon, tone, prefix, date format, location, suffix, digits, current, scope, reset]
type Seed = [string, string, string, string, SequenceIcon, string, string, string, string, string, number, number, SequenceScope, ResetRule];
const SEEDS: Seed[] = [
  ['Asset Number', 'ASSET-001', 'Assets', 'Physical Asset', 'box', 'purple', 'AST', 'YYYY', 'DXB', '', 6, 247, 'Organization', 'Never'],
  ['Work Order Number', 'WO-001', 'Maintenance', 'Work Order', 'wrench', 'pink', 'WO', 'YYYY', '', '', 6, 1482, 'Organization', 'Yearly'],
  ['Inspection Number', 'INS-001', 'Audit & Compliance', 'Inspection', 'clipboard', 'purple', 'INS', 'YYYY', '', '', 6, 892, 'Organization', 'Yearly'],
  ['Inventory Item', 'INV-001', 'Inventory', 'Inventory Item', 'package', 'orange', 'INV', 'YYYY', '', '', 6, 1156, 'Organization', 'Never'],
  ['Purchase Request', 'PR-001', 'Inventory', 'Purchase Request', 'cart', 'orange', 'PR', 'YYYY', '', '', 4, 9872, 'Organization', 'Yearly'],
  ['Vendor Code', 'VND-001', 'Inventory', 'Vendor', 'users', 'blue', 'VND', '', '', '', 6, 126, 'Organization', 'Never'],
  ['User ID', 'USR-001', 'Administration', 'User', 'user', 'purple', 'USR', '', '', '', 6, 318, 'Organization', 'Never'],
  ['Gate Pass', 'GP-001', 'Movement & Custody', 'Gate Pass', 'key', 'blue', 'GP', 'YYMM', 'DXB', '', 2, 94, 'Location', 'Monthly'],
  ['Visitor Pass', 'VIS-001', 'Movement & Custody', 'Visitor', 'users', 'pink', 'VIS', 'YYMM', 'AUH', '', 2, 91, 'Location', 'Monthly'],
  ['Asset Transfer', 'TRF-001', 'Movement & Custody', 'Transfer', 'truck', 'blue', 'TRF', 'YYYY', 'DXB', '', 5, 68, 'Location', 'Yearly'],
  ['Asset Checkout', 'CHK-001', 'Movement & Custody', 'Checkout', 'key', 'green', 'CHK', 'YYYY', '', '', 5, 54, 'Organization', 'Yearly'],
  ['Asset Disposal', 'DSP-001', 'Assets', 'Disposal', 'trash', 'red', 'DSP', 'YYYY', '', '', 5, 12, 'Organization', 'Never'],
  ['Maintenance Request', 'MR-001', 'Maintenance', 'Work Order', 'wrench', 'orange', 'MR', 'YYYY', 'SHJ', '', 6, 73, 'Location', 'Yearly'],
  ['Preventive Maintenance Plan', 'PM-001', 'Maintenance', 'Work Order', 'calendar', 'green', 'PM', '', '', '', 5, 41, 'Organization', 'Never'],
  ['Audit Number', 'AUD-001', 'Audit & Compliance', 'Audit', 'shield', 'purple', 'AUD', 'YYYY', 'DXB', '', 5, 18, 'Location', 'Yearly'],
  ['Incident Report', 'INC-001', 'Audit & Compliance', 'Incident', 'shield', 'red', 'INC', 'YYYY', 'RUH', '', 5, 9, 'Location', 'Yearly'],
  ['Stock Transfer', 'STR-001', 'Inventory', 'Transfer', 'truck', 'orange', 'STR', 'YYYY', 'DXB', '', 5, 36, 'Location', 'Yearly'],
  ['Goods Receipt Note', 'GRN-001', 'Inventory', 'Inventory Item', 'package', 'green', 'GRN', 'YYYY', 'SHJ', '', 5, 47, 'Location', 'Yearly'],
  ['Purchase Order', 'PO-001', 'Financial', 'Purchase Order', 'receipt', 'blue', 'PO', 'YYYY', '', 'P', 6, 52, 'Organization', 'Yearly'],
  ['Contract Number', 'CTR-001', 'Contracts & Warranty', 'Contract', 'file', 'purple', 'CTR', 'YYYY', '', 'A', 5, 23, 'Organization', 'Never'],
  ['Warranty Claim', 'WCL-001', 'Contracts & Warranty', 'Warranty Claim', 'file', 'pink', 'WCL', 'YYYY', 'AUH', '', 5, 14, 'Location', 'Never'],
  ['Invoice Number', 'BIL-001', 'Financial', 'Invoice', 'receipt', 'green', 'BIL', 'YYYY', 'DXB', 'TX', 6, 61, 'Location', 'Yearly'],
  ['Depreciation Run', 'DEP-001', 'Financial', 'Depreciation Run', 'chart', 'blue', 'DEP', 'YYYYMM', '', '', 4, 10, 'Organization', 'Monthly'],
  ['Report Export', 'RPT-001', 'Reports & Analytics', 'Report', 'chart', 'purple', 'RPT', 'YYYY', '', 'X', 5, 27, 'Department', 'Yearly'],
  ['IoT Device ID', 'IOT-001', 'Tracking & IoT', 'Device', 'zap', 'orange', 'IOT', '', 'DXB', '', 5, 19, 'Location', 'Never'],
  ['RFID Tag', 'RFID-001', 'Tracking & IoT', 'Tag', 'tag', 'pink', 'RFID', '', '', 'R', 8, 8, 'Organization', 'Never'],
  ['Location Code', 'LOC-001', 'Master Data Management', 'Location', 'map', 'green', 'LOC', '', 'DXB', '', 4, 7, 'Organization', 'Never'],
  ['Department Code', 'DEPT-001', 'Master Data Management', 'Department', 'building', 'blue', 'DEPT', '', '', '', 4, 5, 'Organization', 'Never']
];

const DESCRIPTIONS: Record<string, string> = {
  'Asset Number': 'Asset number with year and location',
  'Work Order Number': 'Work orders numbered per year',
  'Purchase Request': 'Purchase requests numbered per year'
};

const CHANGE_NOTES = [
  'Created sequence',
  'Changed number length',
  'Added date token',
  'Updated reset rule',
  'Enabled duplicate prevention',
  'Updated description',
  'Changed separator'
];

const RECORD_NAMES = ['Dell Latitude 5440', 'Chiller Unit 02', 'Forklift FL-07', 'HP LaserJet M404', 'Generator G-11', 'Server Rack R4', 'UPS 10kVA', 'Split AC Floor 3'];

function isoDaysAgo(days: number): string {
  const d = new Date(todayIso());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  return todayIso().slice(0, 8) + '01';
}

function tokens(prefix: string, date: string, location: string, suffix: string): FormatToken[] {
  const list: FormatToken[] = [{ kind: 'prefix', value: prefix }];
  if (date) list.push({ kind: 'date', value: date });
  if (location) list.push({ kind: 'location', value: location });
  list.push({ kind: 'number', value: '' });
  if (suffix) list.push({ kind: 'suffix', value: suffix });
  return list;
}

function changeLog(minor: number, i: number, createdOn: string): ChangeRecord[] {
  const rows: ChangeRecord[] = [];
  for (let v = minor; v >= 0; v--) {
    const step = minor - v;
    rows.push({
      date: v === 0 ? createdOn : isoDaysAgo(6 + step * 23 + i),
      version: `v1.${v}`,
      user: v === minor ? CURRENT_USER.name : ADMIN_PEOPLE[(i + v) % ADMIN_PEOPLE.length],
      change: v === 0 ? 'Created sequence' : CHANGE_NOTES[(i + v) % (CHANGE_NOTES.length - 1) + 1]
    });
  }
  return rows;
}

function usageLog(seq: NumberSequence, i: number): UsageRecord[] {
  const rows: UsageRecord[] = [];
  for (let k = 1; k <= 8; k++) {
    const n = seq.currentNumber - k * seq.incrementBy;
    if (n < seq.startNumber) break;
    rows.push({
      date: isoDaysAgo(k - 1 + (i % 3)),
      number: formatNumber(seq, n),
      record: `${seq.recordType} – ${RECORD_NAMES[(i + k) % RECORD_NAMES.length]}`,
      generatedBy: ADMIN_PEOPLE[(i * 3 + k) % ADMIN_PEOPLE.length],
      method: seq.manualOverride && k % 4 === 0 ? 'Manual' : 'Auto'
    });
  }
  return rows;
}

export const SEQUENCES: NumberSequence[] = SEEDS.map((s, i) => {
  const [name, code, module, recordType, icon, tone, prefix, date, location, suffix, digits, current, scope, resetRule] = s;
  const minor = i === 0 ? 4 : (i * 3) % 5;
  const createdOn = i >= SEEDS.length - 4 ? firstOfMonth() : isoDaysAgo(420 - i * 9);
  const seq: NumberSequence = {
    id: `SEQ-${String(i + 1).padStart(3, '0')}`,
    name,
    code,
    module,
    recordType,
    icon,
    tone,
    description: DESCRIPTIONS[name] ?? `${recordType} numbers for ${module}`,
    tokens: tokens(prefix, date, location, suffix),
    separator: '-',
    numberLength: digits,
    startNumber: 1,
    currentNumber: current,
    incrementBy: 1,
    scope,
    resetRule,
    resetDate: resetRule === 'Never' ? '' : resetRule === 'Yearly' ? `${new Date().getFullYear() + 1}-01-01` : firstOfNextMonth(),
    duplicatePrevention: true,
    manualOverride: i % 5 === 3,
    active: true,
    version: `v1.${minor}`,
    createdOn,
    updatedOn: isoDaysAgo(i % 9),
    usage: [],
    changes: changeLog(minor, i, createdOn)
  };
  seq.usage = usageLog(seq, i);
  return seq;
});

function firstOfNextMonth(): string {
  const d = new Date(todayIso());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
