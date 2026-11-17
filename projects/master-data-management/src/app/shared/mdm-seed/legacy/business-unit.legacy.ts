import { BusinessUnitIcon, BusinessUnitRecord } from '../../../organization/business-unit/business-unit.model';

/*
 * DEMO MODE: hard-coded business units until the API is wired up. The first six match the
 * approved design; the totals match it too (15 units, 2 inactive). Departments and sites belong
 * to business units through the Department and Site masters.
 */

export const EMPLOYEES = [
  'Suresh Nair', 'Rex Kumar', 'Aisha Rahman', 'Omar Haddad', 'Priya Nair', 'Faisal Al Harbi',
  'Divya Raman', 'Karthik R', 'Fatima Ali', 'Murugan S', 'Ahmed Saleh', 'Meera Iyer',
  'Amit Sharma', 'Ravi Prakash', 'Khalid Hassan'
];

export const COST_CENTERS = [
  'CC-MFG-001', 'CC-ENG-001', 'CC-LOG-001', 'CC-FM-001', 'CC-RET-001', 'CC-CORP-001', 'CC-OPS-001', 'CC-IT-001',
  'CC-QA-001', 'CC-HSE-001', 'CC-RND-001', 'CC-SNM-001', 'CC-FIN-001', 'CC-HR-001', 'CC-PRJ-001'
];

// [code, name, organization, icon, head, inactive?, description]
type Seed = [string, string, string, BusinessUnitIcon, string, boolean, string];
const SEEDS: Seed[] = [
  ['MFG', 'Manufacturing', 'DCS', 'chart', 'Suresh Nair', false, 'Manages all manufacturing operations, production assets, facilities and resources.'],
  ['ES', 'Engineering Services', 'DCS', 'gear', 'Karthik R', false, 'Design, installation and commissioning engineering for customer projects.'],
  ['LOG', 'Logistics', 'DCS', 'truck', 'Omar Haddad', false, 'Warehousing, fleet and inbound / outbound logistics.'],
  ['FM', 'Facilities Management', 'DCS', 'building', 'Aisha Rahman', false, 'Upkeep of buildings, utilities and shared services across sites.'],
  ['RET', 'Retail Operations', 'DCS', 'cart', 'Meera Iyer', false, 'Showrooms and retail stores.'],
  ['CORP', 'Corporate Services', 'DCS', 'bars', 'Rex Kumar', true, 'Group administration, legal and corporate affairs.'],
  ['OPS', 'Operations', 'DCS-UAE', 'briefcase', 'Murugan S', false, 'Field operations and service delivery.'],
  ['ITS', 'IT Services', 'PIQ', 'server', 'Priya Nair', false, 'Data centers, networks and business applications.'],
  ['QA', 'Quality Assurance', 'DCS', 'shield', 'Fatima Ali', false, 'Quality systems, audits and certifications.'],
  ['HSE', 'Health, Safety & Environment', 'DCS', 'shield', 'Divya Raman', false, 'Workplace safety, environment and compliance.'],
  ['RND', 'Research & Development', 'PIQ', 'flask', 'Ahmed Saleh', false, 'Product research and prototyping.'],
  ['SNM', 'Sales & Marketing', 'DCS', 'users', 'Meera Iyer', false, 'Sales, marketing and customer success.'],
  ['FIN', 'Finance', 'DCS', 'wallet', 'Faisal Al Harbi', false, 'Accounting, treasury and asset costing.'],
  ['HR', 'Human Resources', 'DCS', 'users', 'Aisha Rahman', false, 'People operations, payroll and training.'],
  ['PRJ', 'Projects', 'DCS-KSA', 'briefcase', 'Faisal Al Harbi', true, 'Project delivery for the Saudi market (paused).']
];

export function initialBusinessUnits(): BusinessUnitRecord[] {
  return SEEDS.map(([code, name, organizationCode, icon, head, inactive, description], i) => {
    const created = i === 0 ? '2024-01-01T10:30' : new Date(Date.UTC(2024, 0, 2) + i * 5 * 86400000).toISOString().slice(0, 16);
    const ksa = organizationCode === 'DCS-KSA';
    return {
      code,
      name,
      organizationCode,
      parentCode: null,
      icon,
      logo: null,
      description,
      head,
      costCenter: COST_CENTERS[i],
      currency: ksa ? 'SAR - Saudi Riyal' : 'AED - UAE Dirham',
      status: inactive ? 'Inactive' : 'Active',
      address: ksa
        ? { line1: 'Al Faisaliah Tower', line2: 'King Fahd Road', city: 'Riyadh', state: 'Riyadh', country: 'Saudi Arabia', postalCode: '12212' }
        : { line1: 'Office 1201, JLT', line2: 'Cluster A, Jumeirah Lakes Towers', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
      contactEmail: `${code.toLowerCase()}@dcs.ae`,
      phoneCountry: ksa ? 'Saudi Arabia' : 'United Arab Emirates',
      phone: `50 ${String(100 + i * 37).slice(0, 3)} ${String(4000 + i * 211).slice(0, 4)}`,
      effectiveFrom: '2024-01-01',
      effectiveTo: inactive ? '2026-06-30' : '',
      allowSites: true,
      budgetTracking: !inactive,
      assetNumbering: true,
      approvals: code === 'MFG' || code === 'FIN',
      createdOn: created,
      updatedOn: i === 0 ? '2026-10-15T14:45' : created
    };
  });
}

export function blankBusinessUnit(): BusinessUnitRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    code: '',
    name: '',
    organizationCode: '',
    parentCode: null,
    icon: 'building',
    logo: null,
    description: '',
    head: '',
    costCenter: '',
    currency: 'AED - UAE Dirham',
    status: 'Active',
    address: { line1: '', line2: '', city: '', state: '', country: 'United Arab Emirates', postalCode: '' },
    contactEmail: '',
    phoneCountry: 'United Arab Emirates',
    phone: '',
    effectiveFrom: today,
    effectiveTo: '',
    allowSites: true,
    budgetTracking: true,
    assetNumbering: true,
    approvals: false,
    createdOn: '',
    updatedOn: ''
  };
}
