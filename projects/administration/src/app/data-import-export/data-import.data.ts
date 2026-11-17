import { FieldMapping, JobSchedule, ValidationRule } from './data-import.model';

// Data objects, option lists and default mapping / rules for the Data Import / Export page

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
      f('Priority', true, 'High'), f('Assigned To', false, 'Technician name'), f('Due Date', false, '30/10/2026'), f('Status', false, 'Open')
    ]
  },
  {
    name: 'People', abbr: 'PPL', icon: 'users', tone: 'blue',
    fields: [
      f('Employee ID', true, 'EMP-00412'), f('Full Name', true, 'First Last'), f('Email', true, 'name@company.com'),
      f('Department', true, 'Operations'), f('Job Title', false, 'Supervisor'), f('Location', false, 'Site name'), f('Manager', false, 'Manager name')
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
      f('Vendor Code', true, 'VEN-0042'), f('Vendor Name', true, 'Vendor legal name'), f('Trade License', true, 'DED-778812'),
      f('Contact Email', false, 'contact@vendor.com'), f('Phone', false, '+000 0 000 0000'), f('Country', false, 'UAE'), f('Payment Terms', false, 'Net 45')
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
      f('Location Code', true, 'DXB-HQ-F3'), f('Location Name', true, 'Head Office - Floor 3'), f('Site', true, 'Head Office'),
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
