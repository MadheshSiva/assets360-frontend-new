import { AssetModelIcon } from '../asset-model/asset-model.icons';
import { AssetCondition, TrackingMethod } from '../asset-model/asset-model.model';
import { CustomField, MaintenanceType } from '../asset-type/asset-type.model';

export type AssetSubTypeStatus = 'Active' | 'Inactive';

/** A technical attribute captured for every asset of this sub type, e.g. Power Rating (kVA). */
export interface SpecTemplate {
  name: string;
  unit: string;
  required: boolean;
}

export interface AssetSubTypeRecord {
  code: string;
  name: string;
  // Parent asset type (by name); the category follows the parent
  assetType: string;
  category: string;
  subcategory: string;
  // Built-in icon, used when no image is uploaded
  icon: AssetModelIcon;
  image: string | null;
  description: string;
  status: AssetSubTypeStatus;
  // Classification
  taggingFormat: string;
  // Technical
  specifications: SpecTemplate[];
  // Lifecycle & maintenance
  lifecycleYears: number;
  maintenanceType: MaintenanceType;
  maintenanceFrequencyDays: number;
  warrantyMonths: number;
  // Defaults for new assets
  defaultCondition: AssetCondition;
  trackingMethod: TrackingMethod;
  serialRequired: boolean;
  inspectionRequired: boolean;
  iotTracking: boolean;
  customFields: CustomField[];
  // Counts owned by other modules
  assetCount: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface AssetSubTypeFilters {
  search: string;
  assetType: string;
  status: '' | AssetSubTypeStatus;
}
