import { initialAssetModels } from './legacy/asset-model.legacy';
import { initialAssetTypes } from './legacy/asset-type.legacy';
import { initialCategories } from './legacy/category.legacy';
import { initialConditions } from './legacy/condition.legacy';
import { initialCriticalities } from './legacy/criticality.legacy';
import { initialManufacturers } from './legacy/manufacturer.legacy';
import { SeedRow, audit, idFor, once, refByName } from './seed-utils';

const categories = once(initialCategories);
export const assetTypes = once(initialAssetTypes);
const types = assetTypes;
const makers = once(initialManufacturers);

const toAssetFieldType = (type: string): string => (type === 'Yes / No' ? 'Checkbox' : type);

/** Seeds of the Asset masters, keyed by resource path. */
export const ASSET_SEED: Record<string, () => SeedRow[]> = {
  conditions: () =>
    initialConditions().map((r) => ({
      ...audit('conditions', r.code, r),
      conditionName: r.name,
      code: r.code,
      type: r.type,
      color: r.color,
      defaultCondition: r.isDefault,
      description: r.description,
      healthScore: r.healthScore,
      icon: r.icon,
      image: r.image,
      displayOrder: r.displayOrder || null,
      showInMobile: r.showInMobile,
      showInReports: r.showInReports,
      characteristics: r.characteristics,
      canMoveFrom: r.canMoveFrom,
      canMoveTo: r.canMoveTo,
      triggerCriteria: r.triggerCriteria,
      autoUpdate: r.autoUpdate,
      photoRequired: r.photoRequired,
      commentRequired: r.commentRequired,
      notifyOwner: r.notifyOwner,
      blocksAssignment: r.blocksAssignment
    })),

  criticalities: () =>
    initialCriticalities().map((r) => ({
      ...audit('criticalities', r.code, r),
      criticalityName: r.name,
      code: r.code,
      riskLevel: r.riskLevel,
      maintenancePriority: r.maintenancePriority,
      color: r.color,
      defaultCriticality: r.isDefault,
      description: r.description,
      icon: r.icon,
      image: r.image,
      likelihood: r.likelihood,
      impact: r.impact,
      businessImpact: r.businessImpact,
      recommendedStrategy: r.recommendedStrategy,
      inspectionFrequency: r.inspectionFrequency,
      conditionMonitoring: r.conditionMonitoring,
      sparePartsPriority: r.sparePartsPriority,
      responseTimeHours: r.responseTimeHours,
      escalateOnFailure: r.escalateOnFailure,
      rootCauseRequired: r.rootCauseRequired,
      approvalForDisposal: r.approvalForDisposal,
      showInReports: r.showInReports
    })),

  manufacturers: () =>
    makers().map((r) => ({
      ...audit('manufacturers', r.code, r),
      manufacturerName: r.name,
      code: r.code,
      country: r.country,
      website: r.website,
      description: r.description,
      contactPerson: r.primaryContact,
      email: r.email,
      phoneNumber: r.phone,
      logo: r.logo,
      brandColor: r.brandColor,
      designation: r.designation,
      secondaryContact: r.secondaryContact,
      secondaryEmail: r.secondaryEmail,
      secondaryPhone: r.secondaryPhone,
      address: r.address,
      supportPortal: r.supportPortal,
      supportEmail: r.supportEmail,
      supportPhone: r.supportPhone,
      standardWarrantyMonths: r.standardWarrantyMonths,
      slaResponseHours: r.slaResponseHours,
      defaultCurrency: r.defaultCurrency,
      paymentTerms: r.paymentTerms,
      preferred: r.preferred,
      warrantyRegistration: r.warrantyRegistration,
      autoCreateWarranty: r.autoCreateWarranty
    })),

  'asset-categories': () => {
    const all = categories();
    return all.map((r) => ({
      ...audit('asset-categories', r.code, r),
      parentCategoryId: r.parentCode ? idFor('asset-categories', r.parentCode) : null,
      parentCategoryName: all.find((p) => p.code === r.parentCode)?.name ?? null,
      name: r.name,
      code: r.code,
      description: r.description,
      imageUrl: r.image,
      customFields: r.customFields.map((f, i) => ({
        id: idFor('custom-field', `${r.code}-${i}`),
        fieldName: f.name,
        type: toAssetFieldType(f.type),
        required: f.required,
        inherited: false
      })),
      details: {
        assetType: r.assetType || null,
        icon: r.icon,
        color: r.color,
        subcategories: r.subcategories.map(({ code, name, icon, color, status }) => ({ code, name, icon, color, status })),
        depreciationMethod: r.depreciationMethod,
        usefulLifeYears: r.usefulLifeYears,
        costCenter: r.costCenter,
        tagPrefix: r.tagPrefix,
        trackingMethod: r.trackingMethod,
        defaultCondition: r.defaultCondition,
        subcategoryRequired: r.subcategoryRequired,
        showInMobile: r.showInMobile,
        includeInReports: r.includeInReports,
        approvalForNewAssets: r.approvalForNewAssets
      }
    }));
  },

  'asset-types': () =>
    types().map((r) => ({
      ...audit('asset-types', r.code, r),
      assetTypeName: r.name,
      code: r.code,
      category: refByName('asset-categories', categories(), r.category) ?? (r.category ? { id: null, name: r.category } : null),
      assetClass: r.assetClass,
      description: r.description,
      depreciationMethod: r.depreciationMethod,
      defaultLifetime: r.lifecycleYears,
      icon: r.icon,
      image: r.image,
      subcategories: r.subcategories,
      taggingFormat: r.taggingFormat,
      maintenanceType: r.maintenanceType,
      maintenancePlan: r.maintenancePlan,
      warrantyMonths: r.warrantyMonths,
      serviceProvider: r.serviceProvider,
      usefulLifeMonths: r.usefulLifeMonths,
      residualPercent: r.residualPercent,
      costCenter: r.costCenter,
      currency: r.currency,
      capitalizationThreshold: r.capitalizationThreshold,
      procurementType: r.procurementType,
      defaultCondition: r.defaultCondition,
      trackingMethod: r.trackingMethod,
      serialRequired: r.serialRequired,
      assignable: r.assignable,
      customFields: r.customFields,
      inspectionRequired: r.inspectionRequired,
      allowTransfers: r.allowTransfers,
      iotTracking: r.iotTracking,
      disposalApproval: r.disposalApproval
    })),

  'asset-models': () =>
    initialAssetModels().map((r) => ({
      ...audit('asset-models', r.code, r),
      modelName: r.name,
      modelCode: r.code,
      manufacturer: refByName('manufacturers', makers(), r.manufacturer) ?? { id: null, name: r.manufacturer },
      assetType: refByName('asset-types', types(), r.assetType) ?? { id: null, name: r.assetType },
      category: refByName('asset-categories', categories(), r.category) ?? { id: null, name: r.category },
      description: r.description,
      image: r.image,
      specs: r.specs,
      lifecycleYears: r.lifecycleYears,
      warrantyMonths: r.warrantyMonths,
      pmFrequency: r.pmFrequency,
      maintenanceStrategy: r.maintenanceStrategy,
      criticality: r.criticality,
      calibrationRequired: r.calibrationRequired,
      costCenter: r.costCenter,
      currency: r.currency,
      purchasePrice: r.purchasePrice,
      includeInDepreciation: r.includeInDepreciation,
      depreciationMethod: r.depreciationMethod,
      salvagePercent: r.salvagePercent,
      procurementType: r.procurementType,
      subcategories: r.subcategories,
      taggingFormat: r.taggingFormat,
      trackingMethod: r.trackingMethod,
      defaultCondition: r.defaultCondition,
      serialRequired: r.serialRequired,
      assignable: r.assignable
    }))
};
