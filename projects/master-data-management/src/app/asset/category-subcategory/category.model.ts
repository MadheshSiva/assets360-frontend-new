import { AssetModelIcon } from '../asset-model/asset-model.icons';
import { AssetCondition, DepreciationMethod, TrackingMethod } from '../asset-model/asset-model.model';
import { CustomField } from '../asset-type/asset-type.model';

export type CategoryStatus = 'Active' | 'Inactive';

export interface SubcategoryRecord {
  code: string;
  name: string;
  icon: AssetModelIcon;
  color: string;
  status: CategoryStatus;
  // registered assets, owned by the Assets module
  assets: number;
}

export interface CategoryRecord {
  code: string;
  name: string;
  // How assets in the category are accounted for, e.g. Fixed Asset or Consumable
  assetType: string;
  icon: AssetModelIcon;
  color: string;
  image: string | null;
  description: string;
  // Optional parent for nested categories
  parentCode: string | null;
  status: CategoryStatus;
  subcategories: SubcategoryRecord[];
  // Default values for new assets in this category
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  costCenter: string;
  tagPrefix: string;
  trackingMethod: TrackingMethod;
  defaultCondition: AssetCondition;
  customFields: CustomField[];
  // Settings
  subcategoryRequired: boolean;
  showInMobile: boolean;
  includeInReports: boolean;
  approvalForNewAssets: boolean;
  // counts owned by the Maintenance and Documents modules
  openWorkOrders: number;
  documents: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface CategoryFilters {
  search: string;
  status: '' | CategoryStatus;
  assetType: string;
}
