export type ResponseType = 'Yes/No' | 'Pass/Fail' | 'Photo' | 'Numeric' | 'Text';
export type TemplateStatus = 'Active' | 'Draft' | 'Inactive';
export type TemplateIcon = 'file' | 'flame' | 'settings' | 'hardhat' | 'shield' | 'clipboard' | 'truck' | 'server' | 'building' | 'zap' | 'droplets';

export interface ChecklistItem {
  id: string;
  text: string;
  responseType: ResponseType;
  required: boolean;
  critical: boolean;
  score: number;
  helpText: string;
  expected: string;
  attachmentRequired: boolean;
  failureAction: string;
  escalate: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface VersionRecord {
  version: string;
  date: string;
  user: string;
  status: TemplateStatus;
  note: string;
}

export interface ExecutionRecord {
  date: string;
  asset: string;
  location: string;
  performedBy: string;
  score: number;
  result: 'Passed' | 'Failed';
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  code: string;
  version: string;
  category: string;
  owner: string;
  updated: string;
  status: TemplateStatus;
  icon: TemplateIcon;
  tone: string;
  description: string;
  frequency: string;
  assetTypes: string[];
  locations: string[];
  teams: string[];
  requireApproval: boolean;
  passThreshold: number;
  scoringMethod: 'Weighted' | 'Equal weight';
  failOnCritical: boolean;
  sections: ChecklistSection[];
  uses: number;
  versions: VersionRecord[];
  executions: ExecutionRecord[];
}

export const RESPONSE_TYPES: ResponseType[] = ['Yes/No', 'Pass/Fail', 'Photo', 'Numeric', 'Text'];
export const CATEGORIES = ['Maintenance', 'Safety', 'Operations', 'Compliance', 'Inspection', 'IT', 'Facilities'];
export const STATUSES: TemplateStatus[] = ['Active', 'Draft', 'Inactive'];
export const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'On demand'];
export const FAILURE_ACTIONS = ['None', 'Create Maintenance Issue', 'Create Work Order', 'Notify Supervisor', 'Block Asset Use', 'Flag for Review'];
export const ASSET_TYPES = ['Generator', 'Chiller', 'Air Conditioner', 'UPS', 'Elevator', 'Forklift', 'Vehicle', 'Fire Extinguisher', 'Server', 'Pump', 'Building'];
export const TEAMS = ['Maintenance Team', 'Facilities Team', 'HSE Team', 'Operations Team', 'IT Support', 'Compliance Team', 'Fleet Team'];

export const CATEGORY_CODES: Record<string, string> = {
  Maintenance: 'MNT',
  Safety: 'SAF',
  Operations: 'OPS',
  Compliance: 'CMP',
  Inspection: 'INS',
  IT: 'ITS',
  Facilities: 'FAC'
};

export const RESPONSE_TONES: Record<ResponseType, string> = {
  'Yes/No': 'blue',
  'Pass/Fail': 'green',
  Photo: 'purple',
  Numeric: 'blue',
  Text: 'grey'
};

export function statusTone(status: TemplateStatus): string {
  return status === 'Active' ? 'green' : status === 'Draft' ? 'blue' : 'grey';
}

export function itemCount(t: ChecklistTemplate): number {
  return t.sections.reduce((sum, s) => sum + s.items.length, 0);
}

export function maxScore(t: ChecklistTemplate): number {
  return t.sections.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (t.scoringMethod === 'Weighted' ? i.score : 1), 0), 0);
}

export function bumpVersion(version: string): string {
  const m = /^v?(\d+)\.(\d+)$/.exec(version);
  if (!m) return 'v1.0';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

export function blankItem(id: string): ChecklistItem {
  return {
    id,
    text: '',
    responseType: '' as ResponseType,
    required: true,
    critical: false,
    score: 10,
    helpText: '',
    expected: '',
    attachmentRequired: false,
    failureAction: '',
    escalate: false
  };
}

/** Field errors for one checklist item */
export function itemErrors(item: ChecklistItem): Record<string, string> {
  const e: Record<string, string> = {};
  if (!item.text.trim()) e['text'] = 'Item text is required.';
  else if (item.text.trim().length > 200) e['text'] = 'Keep item text under 200 characters.';
  if (!item.responseType) e['responseType'] = 'Response type is required.';
  if (!Number.isInteger(item.score) || item.score < 0 || item.score > 100) e['score'] = 'Score must be a whole number from 0 to 100.';
  if (item.responseType === 'Numeric' && item.expected.trim() && !/^\s*-?\d+(\.\d+)?\s*(-\s*-?\d+(\.\d+)?)?\s*[a-zA-Z%°]*\s*$/.test(item.expected)) {
    e['expected'] = 'Use a number or a range, e.g. 40-60 or 75%.';
  }
  return e;
}

/** Field errors for the template-level settings */
export function templateErrors(t: ChecklistTemplate, codeTaken: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!t.name.trim()) e['name'] = 'Template name is required.';
  if (!t.code.trim()) e['code'] = 'Template code is required.';
  else if (!/^[A-Z0-9-]{3,20}$/.test(t.code.trim())) e['code'] = 'Use 3-20 capitals, digits or dashes.';
  else if (codeTaken) e['code'] = 'This code is already used by another template.';
  if (!t.category) e['category'] = 'Category is required.';
  if (!t.owner) e['owner'] = 'Owner is required.';
  if (!Number.isFinite(t.passThreshold) || t.passThreshold < 0 || t.passThreshold > 100) e['passThreshold'] = 'Pass threshold must be 0-100%.';
  return e;
}
