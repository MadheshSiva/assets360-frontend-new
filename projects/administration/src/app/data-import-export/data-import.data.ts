import { ADMIN_PEOPLE, CURRENT_USER } from '../shared/admin-common';
import { DataJob, FieldMapping, JobRun, JobSchedule, JobStatus, JobType, ValidationIssue, ValidationRule } from './data-import.model';

// Static demo data for the Data Import / Export page (deterministic, no Math.random)

export interface ObjectField {
  label: string;
  required: boolean;
  sample: string;
}

export interface DataObjectDef {
  name: string;
  /** Three-letter code used in job codes (IMP-AST-0086). */
  abbr: string;
  icon: string;
  tone: string;
  fields: ObjectField[];
}

function f(label: string, required: boolean, sample: string): ObjectField {
  return { label, required, sample };
}

export const DATA_OBJECTS: DataObjectDef[] = [
  {
    name: 'Asset Master', abbr: 'AST', icon: 'database', tone: 'purple',
    fields: [
      f('Asset Code', true, 'AST-2026-DXB-000247'), f('Asset Name', true, 'Dell Latitude 7440'), f('Asset Category', true, 'IT Equipment'),
      f('Serial Number', true, 'DL7440-88K2Q'), f('Location Code', true, 'DXB-HQ-F3'), f('Department', false, 'IT'),
      f('Purchase Date', false, '12/03/2026'), f('Purchase Cost', false, '5,450.00'), f('Vendor', false, 'Dell Technologies'),
      f('Warranty Expiry', false, '11/03/2029'), f('Status', false, 'In Use')
    ]
  },
  {
    name: 'Work Order', abbr: 'WO', icon: 'file', tone: 'pink',
    fields: [
      f('Work Order No', true, 'WO-10245'), f('Title', true, 'Chiller PM - Q4'), f('Asset Code', true, 'AST-2026-DXB-000118'),
      f('Priority', true, 'High'), f('Assigned To', false, 'James Tan'), f('Due Date', false, '30/10/2026'), f('Status', false, 'Open')
    ]
  },
  {
    name: 'People', abbr: 'PPL', icon: 'users', tone: 'blue',
    fields: [
      f('Employee ID', true, 'EMP-00412'), f('Full Name', true, 'Aisha Khan'), f('Email', true, 'aisha.khan@purpleiq.com'),
      f('Department', true, 'Operations'), f('Job Title', false, 'Supervisor'), f('Location', false, 'Dubai HQ'), f('Manager', false, 'Omar Hassan')
    ]
  },
  {
    name: 'Inventory Stock', abbr: 'INV', icon: 'package', tone: 'orange',
    fields: [
      f('Item Code', true, 'INV-SP-0091'), f('Item Name', true, 'Air Filter 24x24'), f('Warehouse', true, 'DXB-WH-01'),
      f('Quantity', true, '120'), f('Unit of Measure', false, 'EA'), f('Reorder Level', false, '40'), f('Unit Cost', false, '38.50')
    ]
  },
  {
    name: 'Vendor', abbr: 'VEN', icon: 'truck', tone: 'purple',
    fields: [
      f('Vendor Code', true, 'VEN-0042'), f('Vendor Name', true, 'Gulf Facility Services LLC'), f('Trade License', true, 'DED-778812'),
      f('Contact Email', false, 'ops@gfs.ae'), f('Phone', false, '+971 4 555 0192'), f('Country', false, 'UAE'), f('Payment Terms', false, 'Net 45')
    ]
  },
  {
    name: 'Compliance', abbr: 'CMP', icon: 'shield', tone: 'green',
    fields: [
      f('Certificate No', true, 'CERT-2026-0193'), f('Asset Code', true, 'AST-2026-DXB-000031'), f('Certificate Type', true, 'Fire Safety'),
      f('Issued On', false, '01/02/2026'), f('Expires On', true, '31/01/2027'), f('Issuing Body', false, 'Dubai Civil Defence')
    ]
  },
  {
    name: 'Location', abbr: 'LOC', icon: 'building', tone: 'blue',
    fields: [
      f('Location Code', true, 'DXB-HQ-F3'), f('Location Name', true, 'Dubai HQ - Floor 3'), f('Site', true, 'Dubai HQ'),
      f('Building', false, 'Tower A'), f('Floor', false, '3'), f('Latitude', false, '25.2048'), f('Longitude', false, '55.2708')
    ]
  },
  {
    name: 'Maintenance Plan', abbr: 'MNT', icon: 'wrench', tone: 'pink',
    fields: [
      f('Plan Code', true, 'PM-HVAC-012'), f('Plan Name', true, 'HVAC Quarterly PM'), f('Asset Category', true, 'HVAC'),
      f('Frequency', true, 'Quarterly'), f('Checklist', false, 'CHK-HVAC-03'), f('Estimated Hours', false, '4')
    ]
  }
];

export const DATA_OBJECT_NAMES = DATA_OBJECTS.map((o) => o.name);
export const DUPLICATE_OPTIONS = ['Update existing', 'Skip duplicates', 'Create new', 'Fail job'];
export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
export const DELIMITERS = ['Comma ( , )', 'Semicolon ( ; )', 'Tab', 'Pipe ( | )'];
export const ENCODINGS = ['UTF-8', 'UTF-16', 'ISO-8859-1', 'Windows-1256'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function objectDef(name: string): DataObjectDef {
  return DATA_OBJECTS.find((o) => o.name === name) ?? DATA_OBJECTS[0];
}

/** Small deterministic generator (LCG) so the demo data is identical on every load. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, '0');
}

/** yyyy-mm-ddThh:mm in local time. */
function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "asset_code" style source column for a field label. */
function sourceColumn(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function defaultMapping(objectName: string): FieldMapping[] {
  return objectDef(objectName).fields.map((x) => ({ source: sourceColumn(x.label), target: x.label, sample: x.sample }));
}

export function defaultRules(objectName: string, jobCode: string): ValidationRule[] {
  const def = objectDef(objectName);
  const rules: ValidationRule[] = [];
  const key = def.fields[0];
  rules.push({ id: `${jobCode}-R1`, name: 'Required fields present', description: `${def.fields.filter((x) => x.required).map((x) => x.label).join(', ')} must not be blank.`, field: 'All required', severity: 'Error', enabled: true });
  rules.push({ id: `${jobCode}-R2`, name: `Unique ${key.label}`, description: `Reject rows whose ${key.label} already appears in the file.`, field: key.label, severity: 'Error', enabled: true });
  const dateField = def.fields.find((x) => /date|expir|issued|due/i.test(x.label));
  if (dateField) rules.push({ id: `${jobCode}-R3`, name: 'Valid date format', description: `${dateField.label} must match the job date format.`, field: dateField.label, severity: 'Warning', enabled: true });
  const refField = def.fields.find((x) => /location|warehouse|asset code|category/i.test(x.label) && x !== key);
  if (refField) rules.push({ id: `${jobCode}-R4`, name: `${refField.label} exists in master data`, description: `${refField.label} must match an existing Asset360 record.`, field: refField.label, severity: 'Error', enabled: true });
  const numField = def.fields.find((x) => /cost|quantity|hours|level|latitude/i.test(x.label));
  if (numField) rules.push({ id: `${jobCode}-R5`, name: `Numeric ${numField.label}`, description: `${numField.label} must be a positive number.`, field: numField.label, severity: 'Warning', enabled: true });
  rules.push({ id: `${jobCode}-R6`, name: 'Trim whitespace', description: 'Strip leading and trailing spaces from text values.', field: 'All text', severity: 'Warning', enabled: false });
  return rules;
}

export function manualSchedule(): JobSchedule {
  return { mode: 'manual', date: '', frequency: 'Daily', day: 'Monday', time: '02:00' };
}

/** 37 errors + 12 warnings for the featured job; the first four rows match the design. */
function assetMasterIssues(): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    { row: 15, field: 'Location Code', issue: 'Missing location code', severity: 'Error', status: 'Open' },
    { row: 28, field: 'Serial Number', issue: 'Duplicate serial number exists', severity: 'Error', status: 'Open' },
    { row: 104, field: 'Asset Category', issue: 'Invalid asset category "IT-DEV"', severity: 'Warning', status: 'Open' },
    { row: 237, field: 'Purchase Date', issue: 'Invalid date format', severity: 'Warning', status: 'Open' }
  ];
  const errors = [
    ['Location Code', 'Location code "DXB-HQ-F9" not found'], ['Serial Number', 'Duplicate serial number exists'],
    ['Asset Code', 'Asset code is blank'], ['Asset Category', 'Asset category is blank'], ['Asset Name', 'Asset name exceeds 120 characters']
  ];
  const warnings = [['Purchase Date', 'Invalid date format'], ['Purchase Cost', 'Purchase cost is not a number'], ['Vendor', 'Vendor not found, left blank']];
  const rand = seeded(86);
  let row = 240;
  for (let i = 0; i < 35; i++) {
    row += 40 + Math.floor(rand() * 300);
    const [field, issue] = errors[i % errors.length];
    issues.push({ row, field, issue, severity: 'Error', status: 'Open' });
  }
  row = 300;
  for (let i = 0; i < 10; i++) {
    row += 200 + Math.floor(rand() * 900);
    const [field, issue] = warnings[i % warnings.length];
    issues.push({ row, field, issue, severity: 'Warning', status: 'Open' });
  }
  return issues.sort((a, b) => a.row - b.row);
}

function runsFor(code: string, date: string, owner: string, total: number, failed: number, count: number): JobRun[] {
  const runs: JobRun[] = [];
  const base = new Date(date);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() - i * 7 * 86400000);
    const fail = i === 0 ? failed : Math.max(0, failed - i * 9);
    runs.push({
      id: `${code}-R${pad(count - i, 3)}`,
      startedAt: stamp(d),
      durationSec: 30 + Math.round(total / 140) + i * 7,
      runBy: i % 2 ? CURRENT_USER.name : owner,
      total,
      successful: total - fail,
      failed: fail,
      status: 'Completed'
    });
  }
  return runs;
}

interface SeedSpec {
  name: string;
  type: JobType;
  object: string;
  owner: string;
  records: number;
  date: string;
}

/** The six jobs shown at the top of the list in the design. */
const FEATURED: SeedSpec[] = [
  { name: 'Asset Master Import', type: 'Import', object: 'Asset Master', owner: 'Sarah Ahmed', records: 12450, date: '2026-10-24T10:32' },
  { name: 'Work Order Export', type: 'Export', object: 'Work Order', owner: 'James Tan', records: 8320, date: '2026-10-22T14:20' },
  { name: 'People Directory Import', type: 'Import', object: 'People', owner: 'Aisha Khan', records: 4105, date: '2026-10-20T09:15' },
  { name: 'Inventory Stock Update', type: 'Import', object: 'Inventory Stock', owner: 'Rahul Mehta', records: 25680, date: '2026-10-18T16:08' },
  { name: 'Vendor Master Export', type: 'Export', object: 'Vendor', owner: 'Sarah Ahmed', records: 2350, date: '2026-10-15T11:45' },
  { name: 'Compliance Certificates Import', type: 'Import', object: 'Compliance', owner: 'Daniel Kim', records: 1420, date: '2026-10-12T10:12' }
];

const IMPORT_TOTAL = 86;
const EXPORT_TOTAL = 142;
/** Records across all jobs; shown compactly as 1.28M. */
const RECORDS_TARGET = 1_281_640;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildJob(spec: SeedSpec, code: string, status: JobStatus, version: string, index: number): DataJob {
  const def = objectDef(spec.object);
  const isImport = spec.type === 'Import';
  const d = new Date(spec.date);
  const slug = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const fmt = isImport ? 'XLSX' : index % 3 === 0 ? 'XLSX' : 'CSV';
  const records = status === 'Completed' || status === 'Running' ? spec.records : 0;
  const sizeMb = Math.max(0.1, (spec.records * 0.39) / 1000);
  const schedule = manualSchedule();
  if (status === 'Scheduled') {
    schedule.mode = 'recurring';
    schedule.frequency = index % 2 ? 'Weekly' : 'Monthly';
    schedule.day = index % 2 ? WEEKDAYS[index % 7] : String((index % 27) + 1);
    schedule.time = `0${index % 6}:30`;
  }
  return {
    id: code,
    code,
    name: spec.name,
    type: spec.type,
    dataObject: def.name,
    owner: spec.owner,
    createdBy: spec.owner,
    version,
    status,
    active: status !== 'Draft',
    date: spec.date,
    records,
    successful: records,
    failed: 0,
    warnings: 0,
    failureReason: status === 'Failed' ? 'Source file header row does not match the job mapping.' : '',
    operation: index % 4 === 1 ? 'Insert' : index % 4 === 2 ? 'Update' : 'Upsert',
    fileName: `${slug}_${MONTHS[d.getMonth()].toLowerCase()}_${d.getFullYear()}.${fmt.toLowerCase()}`,
    fileFormat: fmt,
    fileSize: sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.round(sizeMb * 1024)} KB`,
    uploadedBy: spec.owner,
    uploadedOn: spec.date,
    duplicateHandling: 'Update existing',
    dateFormat: 'DD/MM/YYYY',
    delimiter: 'Comma ( , )',
    encoding: 'UTF-8',
    batchSize: 1000,
    schedule,
    recipients: [`${spec.owner.toLowerCase().replace(/\s+/g, '.')}@purpleiq.com`],
    mapping: defaultMapping(def.name),
    rules: defaultRules(def.name, code),
    issues: [],
    runs: status === 'Completed' ? runsFor(code, spec.date, spec.owner, records, 0, 1 + (index % 4)) : []
  };
}

/** 228 jobs (86 imports, 142 exports), newest first. */
export function seedJobs(): DataJob[] {
  const rand = seeded(228);
  const featuredImports = FEATURED.filter((s) => s.type === 'Import').length;
  const featuredExports = FEATURED.length - featuredImports;
  let importsLeft = IMPORT_TOTAL - featuredImports;
  let exportsLeft = EXPORT_TOTAL - featuredExports;

  // Older generated jobs, walking back in time from 11 Oct 2026
  const specs: SeedSpec[] = [];
  let t = new Date('2026-10-11T15:40').getTime();
  while (importsLeft + exportsLeft > 0) {
    const pickImport = rand() < importsLeft / (importsLeft + exportsLeft);
    const type: JobType = pickImport ? 'Import' : 'Export';
    if (pickImport) importsLeft--; else exportsLeft--;
    const obj = DATA_OBJECTS[Math.floor(rand() * DATA_OBJECTS.length)];
    t -= (22 + Math.floor(rand() * 26)) * 3600000 + Math.floor(rand() * 59) * 60000;
    const d = new Date(t);
    const verb = type === 'Import' ? (rand() < 0.5 ? 'Import' : 'Bulk Update') : rand() < 0.5 ? 'Export' : 'Extract';
    specs.push({
      name: `${obj.name} ${verb} – ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      type,
      object: obj.name,
      owner: ADMIN_PEOPLE[Math.floor(rand() * ADMIN_PEOPLE.length)],
      records: 500 + Math.floor(rand() * 9500),
      date: stamp(d)
    });
  }

  // Job codes number imports and exports separately, oldest = 0001
  const all = [...FEATURED, ...specs];
  let impNo = IMPORT_TOTAL;
  let expNo = EXPORT_TOTAL;
  const jobs = all.map((spec, i) => {
    const no = spec.type === 'Import' ? impNo-- : expNo--;
    const code = `${spec.type === 'Import' ? 'IMP' : 'EXP'}-${objectDef(spec.object).abbr}-${pad(no, 4)}`;
    let status: JobStatus = 'Completed';
    if (i >= FEATURED.length) {
      if (i % 41 === 9) status = 'Failed';
      else if (i % 19 === 4) status = 'Scheduled';
      else if (i % 29 === 13) status = 'Draft';
    }
    const version = i === 0 ? 'v1.3' : `v1.${i % 5}`;
    return buildJob(spec, code, status, version, i);
  });

  // Featured Asset Master Import: 12,450 rows, 37 failed, 12 warnings
  const featured = jobs[0];
  featured.issues = assetMasterIssues();
  featured.failed = 37;
  featured.successful = featured.records - 37;
  featured.warnings = 12;
  featured.fileSize = '4.8 MB';
  featured.recipients = ['sarah@purpleiq.ai', 'ops@purpleiq.ai'];
  featured.runs = runsFor(featured.code, featured.date, featured.owner, featured.records, 37, 4);

  // Scale the generated completed jobs so all records add up to the target
  const generated = jobs.slice(FEATURED.length).filter((j) => j.status === 'Completed');
  const fixed = jobs.reduce((s, j) => s + j.records, 0) - generated.reduce((s, j) => s + j.records, 0);
  const genSum = generated.reduce((s, j) => s + j.records, 0);
  let remaining = RECORDS_TARGET - fixed;
  generated.forEach((j, i) => {
    const n = i === generated.length - 1 ? remaining : Math.round((j.records * (RECORDS_TARGET - fixed)) / genSum);
    remaining -= n;
    j.records = n;
    j.successful = n;
    for (const r of j.runs) {
      r.total = n;
      r.successful = n;
    }
  });
  return jobs;
}
