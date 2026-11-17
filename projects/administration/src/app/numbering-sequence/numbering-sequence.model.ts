/** A building block of a numbering format, e.g. AST | 2026 | DXB | 000247 */
export type TokenKind = 'prefix' | 'date' | 'location' | 'number' | 'suffix';

export interface FormatToken {
  kind: TokenKind;
  /** prefix / suffix text, location code or date format (YYYY, YY, MM, YYYYMM, YYMM). Unused for number. */
  value: string;
}

export type SequenceScope = 'Organization' | 'Location' | 'Department';
export type ResetRule = 'Never' | 'Yearly' | 'Monthly';
export type SequenceStatus = 'Active' | 'Near Limit' | 'Inactive';

/** Icon key; mapped to a lucide icon by the page */
export type SequenceIcon =
  | 'box' | 'wrench' | 'clipboard' | 'package' | 'cart' | 'users' | 'user' | 'truck' | 'key' | 'trash'
  | 'receipt' | 'file' | 'shield' | 'chart' | 'tag' | 'map' | 'building' | 'calendar' | 'zap';

export interface UsageRecord {
  date: string;
  number: string;
  record: string;
  generatedBy: string;
  method: 'Auto' | 'Manual';
}

export interface ChangeRecord {
  date: string;
  version: string;
  user: string;
  change: string;
}

export interface NumberSequence {
  id: string;
  name: string;
  code: string;
  module: string;
  recordType: string;
  icon: SequenceIcon;
  tone: string;
  description: string;
  tokens: FormatToken[];
  separator: string;
  /** Minimum digits of the running number (zero padded) */
  numberLength: number;
  startNumber: number;
  /** The next number the sequence will issue */
  currentNumber: number;
  incrementBy: number;
  scope: SequenceScope;
  resetRule: ResetRule;
  resetDate: string;
  duplicatePrevention: boolean;
  manualOverride: boolean;
  active: boolean;
  version: string;
  createdOn: string;
  updatedOn: string;
  usage: UsageRecord[];
  changes: ChangeRecord[];
}

export const TOKEN_KINDS: TokenKind[] = ['prefix', 'date', 'location', 'number', 'suffix'];
export const TOKEN_LABELS: Record<TokenKind, string> = {
  prefix: 'Prefix',
  date: 'Date',
  location: 'Location',
  number: 'Number',
  suffix: 'Suffix'
};
export const DATE_FORMATS = ['YYYY', 'YY', 'MM', 'YYYYMM', 'YYMM'];
/** Site codes for the location token; come from the locations API (empty until wired). */
export const LOCATION_CODES: string[] = [];
export const SEPARATORS = [
  { value: '-', label: '-' },
  { value: '/', label: '/' },
  { value: '_', label: '_' },
  { value: '.', label: '.' },
  { value: '', label: 'None' }
];
export const NUMBER_LENGTHS = [2, 3, 4, 5, 6, 7, 8];
export const SCOPES: SequenceScope[] = ['Organization', 'Location', 'Department'];
export const RESET_RULES: ResetRule[] = ['Never', 'Yearly', 'Monthly'];
export const RECORD_TYPES = [
  'Physical Asset', 'Work Order', 'Inspection', 'Inventory Item', 'Purchase Request', 'Vendor', 'User',
  'Transfer', 'Checkout', 'Disposal', 'Gate Pass', 'Visitor', 'Audit', 'Incident', 'Purchase Order',
  'Contract', 'Warranty Claim', 'Invoice', 'Depreciation Run', 'Report', 'Device', 'Tag', 'Location', 'Department'
];

// Icon given to a new sequence, by module
export const MODULE_ICONS: Record<string, SequenceIcon> = {
  Assets: 'box',
  Maintenance: 'wrench',
  Inspection: 'clipboard',
  Inventory: 'package',
  'Audit & Compliance': 'shield',
  'Movement & Custody': 'truck',
  'Contracts & Warranty': 'file',
  Financial: 'receipt',
  'Reports & Analytics': 'chart',
  'Tracking & IoT': 'zap',
  'Master Data Management': 'building',
  Administration: 'user'
};

/** Share of the number range after which a sequence is flagged "Near Limit" */
export const NEAR_LIMIT_RATIO = 0.9;

export function maxNumber(seq: NumberSequence): number {
  return Math.pow(10, seq.numberLength) - 1;
}

export function isNearLimit(seq: NumberSequence): boolean {
  if (!seq.numberLength) return false;
  return seq.currentNumber >= maxNumber(seq) * NEAR_LIMIT_RATIO;
}

export function sequenceStatus(seq: NumberSequence): SequenceStatus {
  if (!seq.active) return 'Inactive';
  return isNearLimit(seq) ? 'Near Limit' : 'Active';
}

export function statusTone(status: SequenceStatus): string {
  return status === 'Active' ? 'green' : status === 'Near Limit' ? 'orange' : 'grey';
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function renderDate(format: string, date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = pad(date.getMonth() + 1, 2);
  switch (format) {
    case 'YY':
      return yyyy.slice(2);
    case 'MM':
      return mm;
    case 'YYYYMM':
      return yyyy + mm;
    case 'YYMM':
      return yyyy.slice(2) + mm;
    default:
      return yyyy;
  }
}

/** The number as it will be issued, e.g. AST-2026-DXB-000247 */
export function formatNumber(seq: NumberSequence, n: number, date = new Date()): string {
  return seq.tokens
    .map((t) => {
      switch (t.kind) {
        case 'date':
          return renderDate(t.value, date);
        case 'number':
          return pad(n, seq.numberLength);
        default:
          return t.value.trim();
      }
    })
    .filter((p) => p !== '')
    .join(seq.separator);
}

/** Pattern shown in the list, e.g. AST-YYYY-DXB-000001 */
export function formatSample(seq: NumberSequence): string {
  return seq.tokens
    .map((t) => (t.kind === 'number' ? pad(1, seq.numberLength) : t.value.trim()))
    .filter((p) => p !== '')
    .join(seq.separator);
}

/** Everything before the running number, e.g. AST-2026-DXB- */
export function prefixPreview(seq: NumberSequence, date = new Date()): string {
  const idx = seq.tokens.findIndex((t) => t.kind === 'number');
  const head = idx < 0 ? seq.tokens : seq.tokens.slice(0, idx);
  const parts = head.map((t) => (t.kind === 'date' ? renderDate(t.value, date) : t.value.trim())).filter((p) => p !== '');
  return parts.length ? parts.join(seq.separator) + seq.separator : '';
}

export function nextNumbers(seq: NumberSequence, count: number, date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(formatNumber(seq, seq.currentNumber + i * seq.incrementBy, date));
  return out;
}

/** Problems with the format itself (shown in the "Format is valid" box) */
export function formatErrors(seq: NumberSequence): string[] {
  const errors: string[] = [];
  const numbers = seq.tokens.filter((t) => t.kind === 'number').length;
  if (numbers === 0) errors.push('Add a Number token so every record gets a unique number.');
  if (numbers > 1) errors.push('Use only one Number token.');
  for (const kind of TOKEN_KINDS) {
    if (kind !== 'number' && seq.tokens.filter((t) => t.kind === kind).length > 1) errors.push(`Use only one ${TOKEN_LABELS[kind]} token.`);
  }
  const prefix = seq.tokens.find((t) => t.kind === 'prefix');
  if (prefix && !/^[A-Za-z0-9]{1,10}$/.test(prefix.value.trim())) errors.push('Prefix must be 1-10 letters or digits.');
  const suffix = seq.tokens.find((t) => t.kind === 'suffix');
  if (suffix && suffix.value.trim() && !/^[A-Za-z0-9]{1,6}$/.test(suffix.value.trim())) errors.push('Suffix must be up to 6 letters or digits.');
  if (seq.tokens.length && seq.tokens[0].kind === 'number' && !seq.separator) errors.push('Start with a prefix or add a separator.');
  if (seq.numberLength && seq.currentNumber > maxNumber(seq)) errors.push(`Current number exceeds the ${seq.numberLength}-digit limit.`);
  return errors;
}

/** Field-level problems for the settings form (keyed by field) */
export function settingErrors(seq: NumberSequence, codeTaken: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!seq.name.trim()) e['name'] = 'Sequence name is required.';
  if (!seq.code.trim()) e['code'] = 'Sequence code is required.';
  else if (!/^[A-Z0-9-]{3,20}$/.test(seq.code.trim())) e['code'] = 'Use 3-20 capitals, digits or dashes.';
  else if (codeTaken) e['code'] = 'This code is already used by another sequence.';
  if (!seq.module) e['module'] = 'Module is required.';
  if (!seq.recordType) e['recordType'] = 'Record type is required.';
  if (!Number.isInteger(seq.startNumber) || seq.startNumber < 0) e['startNumber'] = 'Enter a whole number of 0 or more.';
  if (!Number.isInteger(seq.currentNumber) || seq.currentNumber < seq.startNumber) e['currentNumber'] = 'Must be at least the start number.';
  if (!Number.isInteger(seq.incrementBy) || seq.incrementBy < 1 || seq.incrementBy > 100) e['incrementBy'] = 'Enter 1-100.';
  if (seq.numberLength == null) e['numberLength'] = 'Number length is required.';
  else if (!Number.isInteger(seq.numberLength) || seq.numberLength < 2 || seq.numberLength > 8) e['numberLength'] = 'Enter 2-8 digits.';
  if (!seq.scope) e['scope'] = 'Scope is required.';
  if (!seq.resetRule) e['resetRule'] = 'Reset frequency is required.';
  else if (seq.resetRule !== 'Never' && !seq.resetDate) e['resetDate'] = 'Pick the next reset date.';
  return e;
}

export function bumpVersion(version: string): string {
  const m = /^v?(\d+)\.(\d+)$/.exec(version);
  if (!m) return 'v1.0';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

export function cloneSequence(seq: NumberSequence): NumberSequence {
  return structuredClone(seq);
}
