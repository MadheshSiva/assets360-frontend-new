import { ASSET_SEED } from './asset.seed';
import { COMPLIANCE_SEED } from './compliance.seed';
import { INVENTORY_SEED } from './inventory.seed';
import { MAINTENANCE_SEED } from './maintenance.seed';
import { ORGANIZATION_SEED } from './organization.seed';
import { PEOPLE_SEED } from './people.seed';
import { SECURITY_SEED } from './security.seed';
import { SeedRow } from './seed-utils';
import { VENDOR_SYSTEM_SEED } from './vendor-system.seed';

/**
 * STATIC DEMO: the master data every page reads, as the API used to return it, keyed by resource path.
 * Built from the demo records the pages shipped with before the API (see legacy/), converted to the API shape.
 */
export const MDM_SEED: Record<string, () => SeedRow[]> = {
  ...ASSET_SEED,
  ...COMPLIANCE_SEED,
  ...INVENTORY_SEED,
  ...MAINTENANCE_SEED,
  ...ORGANIZATION_SEED,
  ...PEOPLE_SEED,
  ...SECURITY_SEED,
  ...VENDOR_SYSTEM_SEED
};
