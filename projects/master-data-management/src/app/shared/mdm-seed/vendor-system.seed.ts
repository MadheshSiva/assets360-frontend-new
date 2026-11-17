import { vendorBaseRequest } from '../../vendor/vendor.data';
import { assetTypes } from './asset.seed';
import { initialAmcVendors } from './legacy/amc-vendor.legacy';
import { initialServiceProviders } from './legacy/service-provider.legacy';
import { initialSuppliers } from './legacy/supplier.legacy';
import { initialChartTypes, initialSyncStatuses, initialUpdateSources } from './legacy/system-config.legacy';
import { SeedRow, audit, refByName } from './seed-utils';

const text = (v: string | null | undefined) => (v && v.trim() ? v : null);

/** Seeds of the Vendor and System Configuration masters, keyed by resource path. */
export const VENDOR_SYSTEM_SEED: Record<string, () => SeedRow[]> = {
  suppliers: () =>
    initialSuppliers().map((r) => ({
      ...audit('suppliers', r.code, r),
      ...vendorBaseRequest(r),
      supplierName: r.name,
      website: text(r.website),
      supplierLogo: r.logo,
      primaryContact: text(r.contactPerson),
      category: text(r.category),
      email: text(r.email),
      country: text(r.country),
      phone: text(r.phone),
      rating: r.rating,
      products: r.products,
      assetCategories: r.assetCategories,
      brands: r.brands,
      currency: text(r.currency),
      paymentTerms: text(r.paymentTerms),
      creditLimit: r.creditLimit,
      trn: text(r.trn),
      bankName: text(r.bankName),
      iban: text(r.iban),
      preferred: r.preferred,
      approved: r.approved,
      portalAccess: r.portalAccess,
      emailPurchaseOrders: r.emailPurchaseOrders
    })),

  'service-providers': () =>
    initialServiceProviders().map((r) => ({
      ...audit('service-providers', r.code, r),
      ...vendorBaseRequest(r),
      serviceProviderName: r.name,
      website: text(r.website),
      logo: r.logo,
      primaryContact: text(r.contactPerson),
      serviceType: text(r.serviceType),
      email: text(r.email),
      country: text(r.country),
      phone: text(r.phone),
      description: `${r.serviceType} services across ${r.coverage.join(', ') || 'the region'}.`,
      rating: r.rating,
      services: r.services,
      skills: r.skills,
      coverage: r.coverage,
      technicians: r.technicians,
      responseHours: r.responseHours,
      licenceNo: text(r.licenceNo),
      licenceExpiry: text(r.licenceExpiry),
      insurancePolicy: text(r.insurancePolicy),
      insuranceExpiry: text(r.insuranceExpiry),
      isoCertified: r.isoCertified,
      hseApproved: r.hseApproved,
      preferred: r.preferred,
      approved: r.approved,
      portalAccess: r.portalAccess,
      emergencyCallout: r.emergencyCallout
    })),

  'amc-vendors': () =>
    initialAmcVendors().records.map((r) => ({
      ...audit('amc-vendors', r.code, r),
      ...vendorBaseRequest(r),
      amcVendorName: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      primaryContact: text(r.contactPerson),
      assetType: refByName('asset-types', assetTypes(), r.assetType) ?? (r.assetType ? { id: null, name: r.assetType } : null),
      email: text(r.email),
      contractType: text(r.contractType),
      logo: r.logo,
      website: text(r.website),
      phone: text(r.phone),
      contractNo: text(r.contractNo),
      contractValue: r.contractValue,
      currency: text(r.currency),
      billingCycle: text(r.billingCycle),
      renewalNoticeDays: r.renewalNoticeDays,
      autoRenew: r.autoRenew,
      coveredModels: r.coveredModels,
      visitsPerYear: r.visitsPerYear,
      responseHours: r.responseHours,
      resolutionHours: r.resolutionHours,
      uptimePercent: r.uptimePercent,
      penaltyPerHour: r.penaltyPerHour,
      notifyBeforeExpiry: r.notifyBeforeExpiry,
      serviceReportRequired: r.serviceReportRequired
    })),

  'api-sync-statuses': () =>
    initialSyncStatuses().map((r) => ({
      ...audit('api-sync-statuses', r.code, r),
      statusName: r.name,
      code: r.code,
      description: r.description,
      color: r.color,
      isSuccess: r.isSuccess
    })),

  'chart-types': () =>
    initialChartTypes().map((r) => ({
      ...audit('chart-types', r.code, r),
      chartTypeName: r.name,
      code: r.code,
      category: r.category,
      description: r.description,
      iconUrl: r.image,
      previewType: r.preview
    })),

  'update-sources': () =>
    initialUpdateSources().map((r) => ({
      ...audit('update-sources', r.code, r),
      sourceName: r.name,
      code: r.code,
      type: r.type,
      description: r.description
    }))
};
