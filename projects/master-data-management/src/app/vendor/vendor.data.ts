import { MdmAudit } from '../shared/mdm-api';
import { apiDate, apiText, stampOf } from '../people/people.data';
import { VendorAddress, VendorBase, VendorStatus } from './vendor.model';

export type { VendorBase, VendorStatus } from './vendor.model';

/* Option lists and helpers shared by the Vendor masters. */

export const VENDOR_COUNTRIES = [
  { name: 'UAE', flag: '🇦🇪', dial: '+971' },
  { name: 'Saudi Arabia', flag: '🇸🇦', dial: '+966' },
  { name: 'Qatar', flag: '🇶🇦', dial: '+974' },
  { name: 'Oman', flag: '🇴🇲', dial: '+968' },
  { name: 'Kuwait', flag: '🇰🇼', dial: '+965' },
  { name: 'Bahrain', flag: '🇧🇭', dial: '+973' },
  { name: 'India', flag: '🇮🇳', dial: '+91' },
  { name: 'USA', flag: '🇺🇸', dial: '+1' },
  { name: 'China', flag: '🇨🇳', dial: '+86' },
  { name: 'Japan', flag: '🇯🇵', dial: '+81' },
  { name: 'South Korea', flag: '🇰🇷', dial: '+82' },
  { name: 'Germany', flag: '🇩🇪', dial: '+49' },
  { name: 'France', flag: '🇫🇷', dial: '+33' },
  { name: 'United Kingdom', flag: '🇬🇧', dial: '+44' },
  { name: 'Switzerland', flag: '🇨🇭', dial: '+41' },
  { name: 'Sweden', flag: '🇸🇪', dial: '+46' },
  { name: 'Finland', flag: '🇫🇮', dial: '+358' },
  { name: 'Ireland', flag: '🇮🇪', dial: '+353' }
];

export const DOCUMENT_TYPES = ['Trade Licence', 'VAT Certificate', 'Insurance', 'ISO Certificate', 'Contract', 'Bank Letter', 'Other'];
export const VENDOR_PALETTE = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#c2410c', '#334155', '#9333ea'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2024-01-01 becomes 01-Jan-2024. */
export function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : value || '-';
}

export function countryFlag(name: string): string {
  return VENDOR_COUNTRIES.find((c) => c.name === name)?.flag ?? '';
}

export function countryDial(name: string): string {
  return VENDOR_COUNTRIES.find((c) => c.name === name)?.dial ?? '+971';
}

export function blankAddress(country = ''): VendorAddress {
  return { line1: '', line2: '', city: '', state: '', postalCode: '', country };
}

/** Base fields for a new vendor of any type. */
export function blankVendorBase(): VendorBase {
  return {
    code: '',
    name: '',
    logo: null,
    brandColor: VENDOR_PALETTE[0],
    website: '',
    contactPerson: '',
    email: '',
    phone: '',
    status: '' as VendorStatus,
    address: blankAddress(),
    alternateContact: '',
    alternateEmail: '',
    alternatePhone: '',
    documents: [],
    createdOn: '',
    updatedOn: ''
  };
}

export const WEB_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;

/** Fields the vendor resources share on the API side. */
export interface VendorBaseDto extends MdmAudit {
  code: string;
  brandColor: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; country: string | null; postalCode: string | null } | null;
  alternateContact: string | null;
  alternateEmail: string | null;
  alternatePhone: string | null;
  documents: { name: string; type: string | null; expiry: string | null }[];
}

/** The shared vendor fields of an API record; `own` holds the ones each resource names its own way. */
export function vendorBaseFrom(
  dto: VendorBaseDto,
  own: { name: string; logo: string | null; website: string | null; contactPerson: string | null; email: string | null; phone: string | null }
): VendorBase {
  const a = dto.address;
  return {
    code: dto.code,
    name: own.name,
    logo: own.logo,
    brandColor: dto.brandColor || VENDOR_PALETTE[0],
    website: own.website ?? '',
    contactPerson: own.contactPerson ?? '',
    email: own.email ?? '',
    phone: own.phone ?? '',
    status: dto.status === 'Inactive' ? 'Inactive' : 'Active',
    address: {
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
      state: a?.state ?? '',
      postalCode: a?.postalCode ?? '',
      country: a?.country ?? ''
    },
    alternateContact: dto.alternateContact ?? '',
    alternateEmail: dto.alternateEmail ?? '',
    alternatePhone: dto.alternatePhone ?? '',
    documents: (dto.documents ?? []).map((d) => ({ name: d.name, type: d.type ?? 'Other', expiry: d.expiry ?? '' })),
    createdOn: stampOf(dto.createdAt),
    updatedOn: stampOf(dto.updatedAt)
  };
}

/** Request body for the shared vendor fields (the resource adds name, code, contact and its own fields). */
export function vendorBaseRequest(r: VendorBase): object {
  const a = r.address;
  return {
    code: r.code,
    brandColor: apiText(r.brandColor),
    address: {
      line1: apiText(a.line1),
      line2: apiText(a.line2),
      city: apiText(a.city),
      state: apiText(a.state),
      country: apiText(a.country),
      postalCode: apiText(a.postalCode)
    },
    alternateContact: apiText(r.alternateContact),
    alternateEmail: apiText(r.alternateEmail),
    alternatePhone: apiText(r.alternatePhone),
    documents: r.documents.map((d) => ({ name: d.name, type: apiText(d.type), expiry: apiDate(d.expiry) })),
    status: r.status
  };
}
