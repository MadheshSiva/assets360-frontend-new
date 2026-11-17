import { SiteContact, SiteRecord, SiteType } from './site.model';

/* Blank record for the site form. Records come from the API. */

const NO_CONTACT: SiteContact = { name: '', designation: '', email: '', phoneCountry: '', phone: '' };

function base(): Omit<SiteRecord, 'id' | 'code' | 'name' | 'siteType' | 'businessUnit' | 'department'> {
  return {
    organizationCode: '',
    parentId: null,
    timeZone: '',
    description: '',
    status: 'Active',
    image: null,
    images: [],
    address: { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' },
    lat: null,
    lng: null,
    manager: { ...NO_CONTACT },
    emergency: { ...NO_CONTACT },
    openTime: '08:00',
    closeTime: '18:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    open24x7: false,
    allowAssetAssignment: true,
    enableTracking: true,
    assets: 0,
    people: 0,
    createdOn: '',
    updatedOn: ''
  };
}

export function blankSite(): SiteRecord {
  const now = new Date().toISOString().slice(0, 16);
  return {
    ...base(),
    id: '',
    code: '',
    name: '',
    siteType: '' as SiteType,
    businessUnit: '',
    department: '',
    createdOn: now,
    updatedOn: now
  };
}
