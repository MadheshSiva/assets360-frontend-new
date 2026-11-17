export type ManufacturerStatus = 'Active' | 'Inactive';
export type PaymentTerms = 'Advance' | 'Net 15' | 'Net 30' | 'Net 45' | 'Net 60';

export interface ManufacturerRecord {
  code: string;
  name: string;
  country: string;
  website: string;
  description: string;
  // Uploaded logo (data URL); a coloured badge with the initials is shown when empty
  logo: string | null;
  brandColor: string;
  status: ManufacturerStatus;
  // Contact
  primaryContact: string;
  designation: string;
  email: string;
  phone: string;
  secondaryContact: string;
  secondaryEmail: string;
  secondaryPhone: string;
  // Headquarters address
  address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
  // Support & warranty
  supportPortal: string;
  supportEmail: string;
  supportPhone: string;
  standardWarrantyMonths: number;
  slaResponseHours: number;
  // Default settings
  defaultCurrency: string;
  paymentTerms: PaymentTerms;
  preferred: boolean;
  warrantyRegistration: boolean;
  autoCreateWarranty: boolean;
  // count owned by the Documents module
  documents: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface ManufacturerFilters {
  search: string;
  status: '' | ManufacturerStatus;
  assetType: string;
}
