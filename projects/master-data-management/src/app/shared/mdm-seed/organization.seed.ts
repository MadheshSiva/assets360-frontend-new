import { initialBfz } from './legacy/bfz.legacy';
import { initialBusinessUnits } from './legacy/business-unit.legacy';
import { initialLocations } from './legacy/location.legacy';
import { initialOrganizations } from './legacy/organization.legacy';
import { initialSites } from './legacy/site.legacy';
import { departments } from './people.seed';
import { SeedRow, audit, idFor, once, refByCode } from './seed-utils';

const organizations = once(initialOrganizations);
const businessUnits = once(initialBusinessUnits);
const sites = once(initialSites);
const bfz = once(initialBfz);
const locations = once(initialLocations);

const RESOURCE_OF = { Building: 'buildings', Floor: 'floors', Zone: 'zones' } as const;

/** Sites are keyed by their own id (S01...), which buildings and locations point at. */
function siteRef(siteId: string | null | undefined): { id: string; name: string } | null {
  const site = siteId ? sites().find((s) => s.id === siteId) : undefined;
  return site ? { id: site.id, name: site.name } : siteId ? { id: siteId, name: siteId } : null;
}

function spaces(type: 'Building' | 'Floor' | 'Zone'): SeedRow[] {
  return bfz()
    .filter((r) => r.type === type)
    .map((r) => {
      const common = {
        ...audit(RESOURCE_OF[type], r.code, r),
        name: r.name,
        code: r.code,
        site: siteRef(r.siteId),
        description: r.description,
        capacity: r.capacity,
        area: r.area,
        imageUrl: r.image,
        images: r.images,
        allowAssetAssignment: r.allowAssetAssignment,
        enableTracking: r.enableTracking,
        restrictedAccess: r.restrictedAccess,
        showOnMap: r.showOnMap,
        latitude: r.lat,
        longitude: r.lng
      };
      if (type === 'Building') return { ...common, category: r.category, address: r.address };
      const buildingId = r.buildingCode ? idFor('buildings', r.buildingCode) : null;
      if (type === 'Floor') return { ...common, buildingId, levelNumber: r.levelNumber };
      return { ...common, buildingId, floorId: r.floorCode ? idFor('floors', r.floorCode) : null, category: r.category, color: r.color };
    });
}

/** Seeds of the Organization structure masters, keyed by resource path. */
export const ORGANIZATION_SEED: Record<string, () => SeedRow[]> = {
  organizations: () =>
    organizations().map((r) => ({
      ...audit('organizations', r.code, r),
      organizationName: r.name,
      code: r.code,
      logoUrl: r.logo,
      type: r.type || null,
      parentOrganization: refByCode('organizations', organizations(), r.parentCode),
      registrationNumber: r.registrationNumber,
      website: r.website,
      description: r.description,
      address: r.address,
      contact: { name: r.contact.person, designation: r.contact.designation, email: r.contact.email, phoneCountry: r.contact.phoneCountry, phone: r.contact.phone },
      settings: { ...r.settings, effectiveFrom: r.settings.effectiveFrom || null, effectiveTo: r.settings.effectiveTo || null }
    })),

  'business-units': () =>
    businessUnits().map((r) => ({
      ...audit('business-units', r.code, r),
      businessUnitName: r.name,
      code: r.code,
      logoUrl: r.logo,
      parentOrganization: refByCode('organizations', organizations(), r.organizationCode),
      parentBusinessUnit: refByCode('business-units', businessUnits(), r.parentCode),
      icon: r.icon,
      description: r.description,
      head: r.head,
      costCenter: r.costCenter,
      currency: r.currency,
      address: r.address,
      contactEmail: r.contactEmail,
      phoneCountry: r.phoneCountry,
      phone: r.phone,
      effectiveFrom: r.effectiveFrom || null,
      effectiveTo: r.effectiveTo || null,
      allowSites: r.allowSites,
      budgetTracking: r.budgetTracking,
      assetNumbering: r.assetNumbering,
      approvals: r.approvals
    })),

  departments: () =>
    departments().map((r) => ({
      ...audit('departments', r.code, r),
      departmentName: r.name,
      code: r.code,
      businessUnit: refByCode('business-units', businessUnits(), r.businessUnitCode),
      departmentHead: r.head.trim() ? { id: null, name: r.head.trim() } : null,
      employeeCount: r.employees,
      assetCount: r.assets,
      parentDepartment: refByCode('departments', departments(), r.parentCode),
      icon: r.icon,
      logoUrl: r.logo,
      type: r.type || null,
      deputy: r.deputy,
      costCenter: r.costCenter,
      description: r.description,
      email: r.email,
      phoneCountry: r.phoneCountry,
      phone: r.phone,
      annualBudget: r.annualBudget,
      currency: r.currency,
      glCode: r.glCode,
      approvalLimit: r.approvalLimit,
      allowAssetOwnership: r.allowAssetOwnership,
      requireAssignmentApproval: r.requireAssignmentApproval,
      includeInCostAllocation: r.includeInCostAllocation,
      effectiveFrom: r.effectiveFrom || null,
      effectiveTo: r.effectiveTo || null
    })),

  sites: () =>
    sites().map((r) => {
      const unit = businessUnits().find((u) => u.name === r.businessUnit);
      const department = departments().find((d) => d.name === r.department && (!unit || d.businessUnitCode === unit.code));
      const parent = r.parentId ? sites().find((s) => s.id === r.parentId) : undefined;
      return {
        ...audit('sites', r.code, r),
        id: r.id,
        siteName: r.name,
        code: r.code,
        siteType: r.siteType || null,
        organization: refByCode('organizations', organizations(), r.organizationCode),
        businessUnit: unit ? refByCode('business-units', businessUnits(), unit.code) : null,
        department: department ? refByCode('departments', departments(), department.code) : null,
        parentSite: parent ? { id: parent.id, name: parent.name } : null,
        city: r.address.city,
        country: r.address.country,
        timeZone: r.timeZone,
        description: r.description,
        imageUrl: r.image,
        images: r.images,
        address: r.address,
        latitude: r.lat,
        longitude: r.lng,
        manager: r.manager,
        emergency: r.emergency,
        openTime: r.openTime,
        closeTime: r.closeTime,
        workingDays: r.workingDays,
        open24x7: r.open24x7,
        allowAssetAssignment: r.allowAssetAssignment,
        enableTracking: r.enableTracking
      };
    }),

  buildings: () => spaces('Building'),
  floors: () => spaces('Floor'),
  zones: () => spaces('Zone'),

  locations: () =>
    locations().map((r) => ({
      ...audit('locations', r.code, r),
      locationName: r.name,
      code: r.code,
      type: r.type,
      environment: r.environment,
      site: siteRef(r.siteId),
      building: r.buildingCode || null,
      floor: r.floorCode || null,
      zone: r.zoneCode || null,
      parentLocationId: r.parentCode ? idFor('locations', r.parentCode) : null,
      area: r.area,
      capacity: r.capacity,
      description: r.description,
      imageUrl: r.image,
      latitude: r.lat,
      longitude: r.lng,
      restrictedAccess: r.restrictedAccess,
      temperatureControlled: r.temperatureControlled,
      allowAssetAssignment: r.allowAssetAssignment,
      enableTracking: r.enableTracking,
      geofenceAlerts: r.geofenceAlerts
    }))
};
