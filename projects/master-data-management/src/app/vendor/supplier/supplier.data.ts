import { blankVendorBase } from '../vendor.data';
import { SupplierRecord } from './supplier.model';

export const SUPPLIER_CATEGORIES = [
  'IT Hardware', 'Network Equipment', 'Electrical Equipment', 'Spare Parts', 'HVAC Equipment', 'Safety Equipment',
  'Office Supplies', 'Tools & Hardware', 'Consumables', 'Software', 'Furniture', 'Vehicles & Fleet'
];
export const PAYMENT_TERMS = ['Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

export function blankSupplier(): SupplierRecord {
  return {
    ...blankVendorBase(),
    category: '',
    country: '',
    rating: 0,
    products: [],
    assetCategories: [],
    brands: [],
    currency: '',
    paymentTerms: '',
    creditLimit: null,
    trn: '',
    bankName: '',
    iban: '',
    preferred: false,
    approved: false,
    portalAccess: false,
    emailPurchaseOrders: true
  };
}
