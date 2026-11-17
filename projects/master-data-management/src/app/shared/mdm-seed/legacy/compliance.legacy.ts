import { CertificationTypeRecord, PermitTypeRecord, RegulationRecord, StandardRecord } from '../../../compliance/compliance.model';

/* DEMO MODE: the compliance masters from the approved designs until the API is wired up. */

export const CERT_CATEGORIES = ['Management System', 'Environmental', 'Health & Safety', 'Calibration', 'Safety', 'Regulatory', 'Personnel'];
export const APPLICABLE_TO = ['Asset', 'Vendor', 'People'];
export const PERMIT_CATEGORIES = ['Safety', 'Electrical', 'Civil', 'Mechanical', 'Regulatory'];
export const APPROVER_ROLES = ['Supervisor', 'Area Owner', 'HSE Officer', 'Maintenance Manager', 'Site Manager', 'Radiation Safety Officer'];
export const REGULATION_COUNTRIES = ['UAE', 'Saudi Arabia', 'Qatar', 'Oman', 'USA', 'EU', 'United Kingdom', 'International'];
export const REGULATION_CATEGORIES = ['Safety', 'Environment', 'Municipal', 'Electrical', 'Machinery', 'Fire Safety', 'Health', 'Data Protection'];
export const STANDARD_ORGANIZATIONS = ['ISO', 'IEC', 'NFPA', 'ASHRAE', 'API', 'ASME', 'BSI', 'ANSI'];
export const STANDARD_CATEGORIES = ['Quality Management', 'Environmental', 'Occupational Health', 'Electrical', 'Functional Safety', 'HVAC', 'Mechanical', 'Information Security'];
export const DOCUMENT_OPTIONS = ['Certificate copy', 'Audit report', 'Test report', 'Calibration report', 'Inspection report', 'Training record', 'ID copy'];

const stamp = (day: number) => new Date(Date.UTC(2024, 0, 15) + day * 86400000).toISOString().slice(0, 16);

// [code, name, category, applicable to, validity months, reminder days, issuing body, standard]
const CERTS: [string, string, string, string[], number, number, string, string][] = [
  ['CERT-001', 'ISO 9001 Quality Management', 'Management System', ['Asset', 'Vendor'], 36, 60, 'Accredited certification body', 'STD-001'],
  ['CERT-002', 'ISO 14001 Environmental', 'Environmental', ['Asset', 'Vendor'], 36, 60, 'Accredited certification body', 'STD-002'],
  ['CERT-003', 'ISO 45001 Health & Safety', 'Health & Safety', ['Asset', 'Vendor', 'People'], 36, 60, 'Accredited certification body', 'STD-003'],
  ['CERT-004', 'Calibration Certificate', 'Calibration', ['Asset'], 12, 30, 'ISO 17025 accredited lab', ''],
  ['CERT-005', 'Electrical Safety Certificate', 'Safety', ['Asset'], 12, 30, 'Approved electrical contractor', 'STD-004'],
  ['CERT-006', 'Pressure Vessel Certificate', 'Regulatory', ['Asset'], 24, 60, 'Third-party inspection agency', 'STD-008'],
  ['CERT-007', 'Emissions Test Certificate', 'Regulatory', ['Asset'], 12, 30, 'Environment authority approved lab', ''],
  ['CERT-008', 'Operator Certification', 'Personnel', ['People'], 24, 60, 'Approved training provider', '']
];

export function initialCertificationTypes(): CertificationTypeRecord[] {
  return CERTS.map(([code, name, category, applicableTo, validityMonths, renewalReminderDays, issuingBody, standardCode], i) => ({
    code,
    name,
    category,
    applicableTo,
    validityMonths,
    renewalReminderDays,
    description: '',
    status: 'Active',
    issuingBody,
    standardCode,
    requiredDocuments: category === 'Calibration' ? ['Calibration report'] : category === 'Personnel' ? ['Certificate copy', 'Training record'] : ['Certificate copy', 'Audit report'],
    inspectionRequired: ['Regulatory', 'Safety', 'Calibration'].includes(category),
    blockWhenExpired: ['Regulatory', 'Safety', 'Personnel'].includes(category),
    notifyOwner: true,
    createdOn: stamp(i),
    updatedOn: stamp(400 + i * 6)
  }));
}

// [code, name, category, valid days, description, approval levels, roles, isolation, gas test]
const PERMITS: [string, string, string, number, string, number, string[], boolean, boolean][] = [
  ['PER-001', 'Hot Work Permit', 'Safety', 1, 'For welding, cutting, grinding', 2, ['Supervisor', 'HSE Officer'], false, true],
  ['PER-002', 'Cold Work Permit', 'Safety', 1, 'For non-hot maintenance work', 1, ['Supervisor'], false, false],
  ['PER-003', 'Confined Space Permit', 'Safety', 1, 'Entry to confined spaces', 3, ['Supervisor', 'HSE Officer', 'Area Owner'], true, true],
  ['PER-004', 'Electrical Work Permit', 'Electrical', 1, 'Electrical maintenance work', 2, ['Supervisor', 'Area Owner'], true, false],
  ['PER-005', 'Work at Height Permit', 'Safety', 1, 'Work above 1.8 meters', 2, ['Supervisor', 'HSE Officer'], false, false],
  ['PER-006', 'Excavation Permit', 'Civil', 1, 'Excavation and digging work', 2, ['Supervisor', 'Site Manager'], true, false],
  ['PER-007', 'Lifting Permit', 'Mechanical', 1, 'Lifting operations with crane', 2, ['Supervisor', 'HSE Officer'], false, false],
  ['PER-008', 'Radiation Permit', 'Regulatory', 30, 'Use of radiation sources', 3, ['Radiation Safety Officer', 'HSE Officer', 'Site Manager'], false, false]
];

export function initialPermitTypes(): PermitTypeRecord[] {
  return PERMITS.map(([code, name, category, validDays, description, approvalLevels, approverRoles, isolationRequired, gasTestRequired], i) => ({
    code,
    name,
    category,
    validDays,
    description,
    status: 'Active',
    approvalLevels,
    approverRoles,
    maxExtensionDays: validDays === 1 ? 1 : 15,
    isolationRequired,
    gasTestRequired,
    closeOutInspection: true,
    createdOn: stamp(i + 20),
    updatedOn: stamp(420 + i * 5)
  }));
}

// [code, name, country, category, description, authority, standards]
const REGS: [string, string, string, string, string, string, string[]][] = [
  ['REG-001', 'UAE Fire & Life Safety Code', 'UAE', 'Safety', 'Fire safety requirements for buildings', 'UAE Civil Defence', ['STD-006']],
  ['REG-002', 'UAE Environmental Law', 'UAE', 'Environment', 'Environmental protection and emissions', 'Ministry of Climate Change & Environment', ['STD-002']],
  ['REG-003', 'Dubai Municipality Guidelines', 'UAE', 'Municipal', 'Building and facility compliance', 'Dubai Municipality', []],
  ['REG-004', 'ESMA Electrical Regulations', 'UAE', 'Electrical', 'Electrical installation standards', 'Emirates Authority for Standardization & Metrology', ['STD-004']],
  ['REG-005', 'OSHA Regulations', 'USA', 'Safety', 'Occupational safety and health', 'Occupational Safety and Health Administration', ['STD-003']],
  ['REG-006', 'EU Machinery Directive', 'EU', 'Machinery', 'Machinery safety requirements', 'European Commission', ['STD-005']],
  ['REG-007', 'IEC Regulations', 'International', 'Electrical', 'International electrotechnical rules', 'International Electrotechnical Commission', ['STD-004', 'STD-005']],
  ['REG-008', 'NFPA Standards', 'International', 'Fire Safety', 'Fire protection standards', 'National Fire Protection Association', ['STD-006']]
];

export function initialRegulations(): RegulationRecord[] {
  return REGS.map(([code, name, country, category, description, issuingAuthority, standardCodes], i) => ({
    code,
    name,
    country,
    category,
    issuingAuthority,
    description,
    status: 'Active',
    assetCategories: [],
    standardCodes,
    effectiveDate: `${2015 + i}-01-01`,
    reviewMonths: 12,
    penalties: category === 'Safety' || category === 'Fire Safety' ? 'Fines and closure of non-compliant premises' : '',
    createdOn: stamp(i + 40),
    updatedOn: stamp(440 + i * 4)
  }));
}

// [code, name, organization, category, version, description, title]
const STANDARDS: [string, string, string, string, string, string, string][] = [
  ['STD-001', 'ISO 9001', 'ISO', 'Quality Management', '2015', 'Quality management systems', 'Quality management systems - Requirements'],
  ['STD-002', 'ISO 14001', 'ISO', 'Environmental', '2015', 'Environmental management', 'Environmental management systems - Requirements with guidance for use'],
  ['STD-003', 'ISO 45001', 'ISO', 'Occupational Health', '2018', 'OH&S management systems', 'Occupational health and safety management systems'],
  ['STD-004', 'IEC 60364', 'IEC', 'Electrical', '8.0', 'Low voltage installations', 'Low-voltage electrical installations'],
  ['STD-005', 'IEC 61508', 'IEC', 'Functional Safety', '2010', 'Functional safety of E/E/PE systems', 'Functional safety of electrical/electronic/programmable electronic safety-related systems'],
  ['STD-006', 'NFPA 70 (NEC)', 'NFPA', 'Electrical', '2023', 'National Electrical Code', 'National Electrical Code'],
  ['STD-007', 'ASHRAE 62.1', 'ASHRAE', 'HVAC', '2022', 'Ventilation for indoor air quality', 'Ventilation and Acceptable Indoor Air Quality'],
  ['STD-008', 'API 650', 'API', 'Mechanical', '2020', 'Welded tanks for oil storage', 'Welded Tanks for Oil Storage']
];

export function initialStandards(): StandardRecord[] {
  return STANDARDS.map(([code, name, organization, category, version, description, title], i) => {
    const year = /^\d{4}$/.test(version) ? Number(version) : 2016;
    return {
      code,
      name,
      organization,
      category,
      version,
      description,
      status: 'Active',
      title,
      publishedOn: `${year}-09-15`,
      nextReview: `${Math.max(year + 5, 2027)}-09-15`,
      url: '',
      mandatory: ['Electrical', 'Mechanical'].includes(category),
      createdOn: stamp(i + 60),
      updatedOn: stamp(460 + i * 3)
    };
  });
}

export function blankCertificationType(): CertificationTypeRecord {
  return {
    code: '',
    name: '',
    category: '',
    applicableTo: ['Asset'],
    validityMonths: 12,
    renewalReminderDays: 30,
    description: '',
    status: 'Active',
    issuingBody: '',
    standardCode: '',
    requiredDocuments: ['Certificate copy'],
    inspectionRequired: false,
    blockWhenExpired: false,
    notifyOwner: true,
    createdOn: '',
    updatedOn: ''
  };
}

export function blankPermitType(): PermitTypeRecord {
  return {
    code: '',
    name: '',
    category: '',
    validDays: 1,
    description: '',
    status: 'Active',
    approvalLevels: 1,
    approverRoles: ['Supervisor'],
    maxExtensionDays: 1,
    isolationRequired: false,
    gasTestRequired: false,
    closeOutInspection: true,
    createdOn: '',
    updatedOn: ''
  };
}

export function blankRegulation(): RegulationRecord {
  return {
    code: '',
    name: '',
    country: '',
    category: '',
    issuingAuthority: '',
    description: '',
    status: 'Active',
    assetCategories: [],
    standardCodes: [],
    effectiveDate: '',
    reviewMonths: 12,
    penalties: '',
    createdOn: '',
    updatedOn: ''
  };
}

export function blankStandard(): StandardRecord {
  return {
    code: '',
    name: '',
    organization: '',
    category: '',
    version: '',
    description: '',
    status: 'Active',
    title: '',
    publishedOn: '',
    nextReview: '',
    url: '',
    mandatory: false,
    createdOn: '',
    updatedOn: ''
  };
}
