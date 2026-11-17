import { initialCertificationTypes, initialPermitTypes, initialRegulations, initialStandards } from './legacy/compliance.legacy';
import { SeedRow, audit } from './seed-utils';

const date = (v: string | null | undefined) => v || null;

/** Seeds of the Compliance masters, keyed by resource path. */
export const COMPLIANCE_SEED: Record<string, () => SeedRow[]> = {
  standards: () =>
    initialStandards().map((r) => ({
      ...audit('standards', r.code, r),
      standardName: r.name,
      code: r.code,
      organization: r.organization,
      category: r.category,
      version: r.version,
      description: r.description,
      title: r.title,
      publishedOn: date(r.publishedOn),
      nextReview: date(r.nextReview),
      url: r.url,
      mandatory: r.mandatory
    })),

  'certification-types': () =>
    initialCertificationTypes().map((r) => ({
      ...audit('certification-types', r.code, r),
      certificationTypeName: r.name,
      code: r.code,
      category: r.category,
      applicableTo: r.applicableTo,
      validityMonths: r.validityMonths,
      renewalReminderDays: r.renewalReminderDays,
      description: r.description,
      issuingBody: r.issuingBody,
      standardCode: r.standardCode || null,
      requiredDocuments: r.requiredDocuments,
      inspectionRequired: r.inspectionRequired,
      blockWhenExpired: r.blockWhenExpired,
      notifyOwner: r.notifyOwner
    })),

  'permit-types': () =>
    initialPermitTypes().map((r) => ({
      ...audit('permit-types', r.code, r),
      permitTypeName: r.name,
      code: r.code,
      category: r.category,
      validTillDays: r.validDays,
      description: r.description,
      approvalLevels: r.approvalLevels,
      approverRoles: r.approverRoles,
      maxExtensionDays: r.maxExtensionDays,
      isolationRequired: r.isolationRequired,
      gasTestRequired: r.gasTestRequired,
      closeOutInspection: r.closeOutInspection
    })),

  regulations: () =>
    initialRegulations().map((r) => ({
      ...audit('regulations', r.code, r),
      regulationName: r.name,
      code: r.code,
      country: r.country,
      category: r.category,
      issuingAuthority: r.issuingAuthority,
      description: r.description,
      assetCategories: r.assetCategories,
      standardCodes: r.standardCodes,
      effectiveDate: date(r.effectiveDate),
      reviewMonths: r.reviewMonths,
      penalties: r.penalties
    }))
};
