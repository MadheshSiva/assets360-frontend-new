import { MasterIcon } from '../../master-icons';
import { EMPLOYEES } from './business-unit.legacy';
import { DepartmentRecord, DepartmentType } from '../../../organization/department/department.model';

/*
 * DEMO MODE: hard-coded departments until the API is wired up. The first six match the approved
 * design. Each business unit gets as many departments as the design's business unit counts
 * (86 in all, 8 inactive). Sites refer to departments by name.
 */

// [code, name, business unit, type, icon, parent?, inactive?]
type Seed = [string, string, string, DepartmentType, MasterIcon, string?, boolean?];

const SEEDS: Seed[] = [
  ['DES', 'Design', 'MFG', 'Technical', 'gear', 'ENG'],
  ['RND', 'R&D', 'MFG', 'Technical', 'flask', 'ENG'],
  ['PE', 'Process Engineering', 'MFG', 'Technical', 'gear', 'ENG'],
  ['PLN', 'Production Planning', 'MFG', 'Operational', 'clipboard'],
  ['TLG', 'Tooling', 'MFG', 'Technical', 'wrench'],
  ['STR', 'Stores', 'MFG', 'Operational', 'building'],
  ['PKG', 'Packaging', 'MFG', 'Operational', 'cart'],
  ['ADM', 'Administration', 'CORP', 'Administrative', 'briefcase'],
  ['LGL', 'Legal', 'CORP', 'Administrative', 'shield'],
  ['PRC', 'Procurement', 'CORP', 'Support', 'cart'],
  ['COM', 'Communications', 'CORP', 'Support', 'users', undefined, true],
  ['FAC', 'Front Office', 'CORP', 'Support', 'building', undefined, true],
  ['RSK', 'Risk Management', 'CORP', 'Administrative', 'shield', undefined, true],
  ['WHS', 'Warehouse', 'LOG', 'Operational', 'building'],
  ['FLT', 'Fleet', 'LOG', 'Operational', 'truck'],
  ['DSP', 'Dispatch', 'LOG', 'Operational', 'truck'],
  ['INB', 'Inbound', 'LOG', 'Operational', 'clipboard'],
  ['CUS', 'Customs Clearance', 'LOG', 'Support', 'clipboard'],
  ['TRN', 'Transport Planning', 'LOG', 'Operational', 'truck'],
  ['FOP', 'Field Operations', 'OPS', 'Operational', 'briefcase'],
  ['SVC', 'Service Delivery', 'OPS', 'Operational', 'wrench'],
  ['NOC', 'Network Monitoring', 'OPS', 'Technical', 'server'],
  ['DPL', 'Deployment', 'OPS', 'Technical', 'gear'],
  ['FSP', 'Field Support', 'OPS', 'Support', 'wrench'],
  ['OPL', 'Operations Planning', 'OPS', 'Operational', 'clipboard'],
  ['IT', 'IT', 'ITS', 'Technical', 'server'],
  ['INF', 'Infrastructure', 'ITS', 'Technical', 'server'],
  ['APP', 'Applications', 'ITS', 'Technical', 'gear'],
  ['SEC', 'Cyber Security', 'ITS', 'Technical', 'shield'],
  ['HDK', 'IT Helpdesk', 'ITS', 'Support', 'users'],
  ['DCO', 'Data Center Operations', 'ITS', 'Technical', 'server'],
  ['DAT', 'Data & Analytics', 'ITS', 'Technical', 'chart'],
  ['ELE', 'Electrical Engineering', 'ES', 'Technical', 'gear'],
  ['MEC', 'Mechanical Engineering', 'ES', 'Technical', 'wrench'],
  ['CIV', 'Civil Engineering', 'ES', 'Technical', 'building'],
  ['ELV', 'ELV Systems', 'ES', 'Technical', 'server'],
  ['PMO', 'Project Management', 'ES', 'Operational', 'clipboard'],
  ['CMS', 'Commissioning', 'ES', 'Technical', 'gear'],
  ['EST', 'Estimation', 'ES', 'Commercial', 'dollar'],
  ['DRF', 'Drafting', 'ES', 'Technical', 'clipboard', undefined, true],
  ['SFM', 'Soft Services', 'FM', 'Support', 'users'],
  ['HFM', 'Hard Services', 'FM', 'Technical', 'wrench'],
  ['ENR', 'Energy Management', 'FM', 'Technical', 'chart'],
  ['SPC', 'Space Planning', 'FM', 'Support', 'building'],
  ['CLN', 'Cleaning', 'FM', 'Support', 'users'],
  ['SHW', 'Showroom Operations', 'RET', 'Commercial', 'cart'],
  ['STO', 'Store Operations', 'RET', 'Operational', 'cart'],
  ['VMD', 'Visual Merchandising', 'RET', 'Commercial', 'chart'],
  ['ECM', 'E-commerce', 'RET', 'Commercial', 'cart'],
  ['CSV', 'Customer Service', 'RET', 'Support', 'users'],
  ['RIN', 'Retail Inventory', 'RET', 'Operational', 'clipboard'],
  ['PRM', 'Promotions', 'RET', 'Commercial', 'chart', undefined, true],
  ['RLP', 'Loss Prevention', 'RET', 'Support', 'shield', undefined, true],
  ['QC', 'Quality Control', 'QA', 'Quality', 'clipboard'],
  ['AUD', 'Internal Audit', 'QA', 'Quality', 'clipboard'],
  ['CRT', 'Certification', 'QA', 'Quality', 'shield'],
  ['MET', 'Metrology', 'QA', 'Quality', 'gear'],
  ['SAF', 'Safety', 'HSE', 'Quality', 'shield'],
  ['ENV', 'Environment', 'HSE', 'Quality', 'flask'],
  ['OHC', 'Occupational Health', 'HSE', 'Support', 'users'],
  ['RSC', 'Research', 'RND', 'Technical', 'flask'],
  ['PRT', 'Prototyping', 'RND', 'Technical', 'wrench'],
  ['HWD', 'Hardware Development', 'RND', 'Technical', 'server'],
  ['FWD', 'Firmware Development', 'RND', 'Technical', 'server'],
  ['SWD', 'Software Development', 'RND', 'Technical', 'gear'],
  ['SAL', 'Sales', 'SNM', 'Commercial', 'dollar'],
  ['MKT', 'Marketing', 'SNM', 'Commercial', 'chart'],
  ['PSL', 'Pre-Sales', 'SNM', 'Commercial', 'briefcase'],
  ['CSM', 'Customer Success', 'SNM', 'Support', 'users'],
  ['BDV', 'Business Development', 'SNM', 'Commercial', 'briefcase'],
  ['CRM', 'CRM Operations', 'SNM', 'Support', 'users'],
  ['ACC', 'Accounts', 'FIN', 'Finance', 'dollar'],
  ['TRS', 'Treasury', 'FIN', 'Finance', 'wallet'],
  ['PAY', 'Payables', 'FIN', 'Finance', 'wallet'],
  ['AST', 'Asset Accounting', 'FIN', 'Finance', 'dollar'],
  ['HRO', 'HR Operations', 'HR', 'Administrative', 'users'],
  ['PYR', 'Payroll', 'HR', 'Finance', 'wallet'],
  ['TND', 'Training & Development', 'HR', 'Support', 'users'],
  ['PDL', 'Project Delivery', 'PRJ', 'Operational', 'briefcase', undefined, true],
  ['PCT', 'Project Controls', 'PRJ', 'Finance', 'chart', undefined, true]
];

function base(code: string, i: number): Omit<DepartmentRecord, 'code' | 'name' | 'businessUnitCode' | 'type' | 'icon' | 'head'> {
  const created = new Date(Date.UTC(2024, 0, 20) + i * 4 * 86400000).toISOString().slice(0, 16);
  return {
    parentCode: null,
    logo: null,
    deputy: EMPLOYEES[(i + 5) % EMPLOYEES.length],
    costCenter: '',
    description: '',
    status: 'Active',
    employees: 4 + ((i * 7) % 30),
    assets: 10 + ((i * 53) % 400),
    openWorkOrders: (i * 3) % 15,
    email: `${code.toLowerCase()}@dcs.ae`,
    phoneCountry: 'United Arab Emirates',
    phone: '',
    annualBudget: 50000 + ((i * 7919) % 40) * 10000,
    currency: 'AED - UAE Dirham',
    glCode: `6${String(100 + i).padStart(4, '0')}`,
    approvalLimit: 10000 + (i % 5) * 5000,
    allowAssetOwnership: true,
    requireAssignmentApproval: i % 4 === 0,
    includeInCostAllocation: true,
    effectiveFrom: created.slice(0, 10),
    effectiveTo: '',
    createdOn: created,
    updatedOn: created
  };
}

export function initialDepartments(): DepartmentRecord[] {
  const design: DepartmentRecord[] = [
    {
      ...base('ENG', 0), code: 'ENG', name: 'Engineering', businessUnitCode: 'MFG', type: 'Technical', icon: 'gear', head: 'Suresh Nair',
      costCenter: 'CC-MFG-ENG', employees: 120, assets: 2450, openWorkOrders: 28,
      description: 'Responsible for engineering design, development and technical support for manufacturing operations.',
      createdOn: '2024-01-15T10:30', updatedOn: '2026-10-12T16:15', effectiveFrom: '2024-01-15'
    },
    { ...base('PRD', 1), code: 'PRD', name: 'Production', businessUnitCode: 'MFG', type: 'Operational', icon: 'chart', head: 'Amit Sharma', costCenter: 'CC-MFG-PRD', employees: 180, assets: 3210, openWorkOrders: 41, description: 'Runs the production lines and shift operations.' },
    { ...base('MNT', 2), code: 'MNT', name: 'Maintenance', businessUnitCode: 'MFG', type: 'Technical', icon: 'wrench', head: 'Ravi Prakash', costCenter: 'CC-MFG-MNT', employees: 45, assets: 1125, openWorkOrders: 63, description: 'Preventive and corrective maintenance of plant and equipment.' },
    { ...base('QA', 3), code: 'QA', name: 'Quality Assurance', businessUnitCode: 'MFG', type: 'Quality', icon: 'clipboard', head: 'Fatima Ali', costCenter: 'CC-MFG-QA', employees: 60, assets: 980, openWorkOrders: 12, description: 'Inspection, testing and quality records for manufactured goods.' },
    { ...base('LOG', 4), code: 'LOG', name: 'Logistics', businessUnitCode: 'MFG', type: 'Operational', icon: 'truck', head: 'Khalid Hassan', costCenter: 'CC-MFG-LOG', employees: 75, assets: 812, openWorkOrders: 9, description: 'Plant logistics: material movement, dispatch and stores coordination.' },
    { ...base('FIN', 5), code: 'FIN', name: 'Finance', businessUnitCode: 'CORP', type: 'Finance', icon: 'dollar', head: 'Meera Iyer', costCenter: 'CC-CORP-FIN', employees: 35, assets: 120, openWorkOrders: 0, description: 'Group finance, reporting and budgeting.' }
  ];
  const rest = SEEDS.map(([code, name, businessUnitCode, type, icon, parentCode, inactive], j): DepartmentRecord => {
    const i = j + design.length;
    return {
      ...base(code, i),
      code,
      name,
      businessUnitCode,
      type,
      icon,
      head: EMPLOYEES[i % EMPLOYEES.length],
      parentCode: parentCode ?? null,
      costCenter: `CC-${businessUnitCode}-${code}`,
      status: inactive ? 'Inactive' : 'Active',
      currency: businessUnitCode === 'PRJ' ? 'SAR - Saudi Riyal' : 'AED - UAE Dirham',
      description: parentCode ? `Sub-department of ${design.find((d) => d.code === parentCode)?.name ?? parentCode}.` : ''
    };
  });
  return [...design, ...rest];
}

export function blankDepartment(): DepartmentRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...base('', 0),
    code: '',
    name: '',
    businessUnitCode: '',
    type: '' as DepartmentType,
    icon: 'building',
    head: '',
    deputy: '',
    employees: 0,
    assets: 0,
    openWorkOrders: 0,
    email: '',
    annualBudget: null,
    glCode: '',
    approvalLimit: null,
    requireAssignmentApproval: false,
    effectiveFrom: today,
    createdOn: '',
    updatedOn: ''
  };
}
