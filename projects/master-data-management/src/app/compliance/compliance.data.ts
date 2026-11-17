import { CertificationTypeRecord, ComplianceStatus, PermitTypeRecord, RegulationRecord, StandardRecord } from './compliance.model';

export const CERT_CATEGORIES = ['Management System', 'Environmental', 'Health & Safety', 'Calibration', 'Safety', 'Regulatory', 'Personnel'];
export const APPLICABLE_TO = ['Asset', 'Vendor', 'People'];
export const PERMIT_CATEGORIES = ['Safety', 'Electrical', 'Civil', 'Mechanical', 'Regulatory'];
export const APPROVER_ROLES = ['Supervisor', 'Area Owner', 'HSE Officer', 'Maintenance Manager', 'Site Manager', 'Radiation Safety Officer'];
export const REGULATION_COUNTRIES = ['UAE', 'Saudi Arabia', 'Qatar', 'Oman', 'USA', 'EU', 'United Kingdom', 'International'];
export const REGULATION_CATEGORIES = ['Safety', 'Environment', 'Municipal', 'Electrical', 'Machinery', 'Fire Safety', 'Health', 'Data Protection'];
export const STANDARD_ORGANIZATIONS = ['ISO', 'IEC', 'NFPA', 'ASHRAE', 'API', 'ASME', 'BSI', 'ANSI'];
export const STANDARD_CATEGORIES = ['Quality Management', 'Environmental', 'Occupational Health', 'Electrical', 'Functional Safety', 'HVAC', 'Mechanical', 'Information Security'];
export const DOCUMENT_OPTIONS = ['Certificate copy', 'Audit report', 'Test report', 'Calibration report', 'Inspection report', 'Training record', 'ID copy'];

export function blankCertificationType(): CertificationTypeRecord {
  return {
    code: '',
    name: '',
    category: '',
    applicableTo: ['Asset'],
    validityMonths: 12,
    renewalReminderDays: 30,
    description: '',
    status: '' as ComplianceStatus,
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
    status: '' as ComplianceStatus,
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
    status: '' as ComplianceStatus,
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
    status: '' as ComplianceStatus,
    title: '',
    publishedOn: '',
    nextReview: '',
    url: '',
    mandatory: false,
    createdOn: '',
    updatedOn: ''
  };
}
