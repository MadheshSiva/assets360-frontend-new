import { BusinessUnitRecord } from './business-unit.model';

/* Option lists and the blank record for the business unit form. Records come from the API. */

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
    currency: '',
    status: 'Active',
    address: { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' },
    contactEmail: '',
    phoneCountry: '',
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
