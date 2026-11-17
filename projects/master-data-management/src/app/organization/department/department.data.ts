import { DepartmentRecord, DepartmentType } from './department.model';

/* Blank record for the department form. Records come from the API; sites refer to departments by name. */

export function blankDepartment(): DepartmentRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    code: '',
    name: '',
    businessUnitCode: '',
    parentCode: null,
    icon: 'building',
    logo: null,
    type: '' as DepartmentType,
    head: '',
    deputy: '',
    costCenter: '',
    description: '',
    status: 'Active',
    employees: 0,
    assets: 0,
    openWorkOrders: 0,
    email: '',
    phoneCountry: '',
    phone: '',
    annualBudget: null,
    currency: '',
    glCode: '',
    approvalLimit: null,
    allowAssetOwnership: true,
    requireAssignmentApproval: false,
    includeInCostAllocation: true,
    effectiveFrom: today,
    effectiveTo: '',
    createdOn: '',
    updatedOn: ''
  };
}
