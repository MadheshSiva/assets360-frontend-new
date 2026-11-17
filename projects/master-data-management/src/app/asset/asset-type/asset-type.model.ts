import { AssetModelIcon } from '../asset-model/asset-model.icons';
import { AssetCondition, DepreciationMethod, ProcurementType, TrackingMethod } from '../asset-model/asset-model.model';

export type AssetTypeStatus = 'Active' | 'Inactive';
export type MaintenanceType = 'Preventive + Corrective' | 'Preventive + Predictive' | 'Preventive' | 'Corrective' | 'Condition Based';
export type CustomFieldType = 'Text' | 'Number' | 'Date' | 'Dropdown' | 'Yes / No';

export interface CustomField {
  name: string;
  type: CustomFieldType;
  required: boolean;
}

export interface AssetTypeRecord {
  code: string;
  name: string;
  category: string;
  assetClass: string;
  // Built-in icon, used when no image is uploaded
  icon: AssetModelIcon;
  image: string | null;
  description: string;
  status: AssetTypeStatus;
  // Classification
  subcategories: string[];
  taggingFormat: string;
  // Lifecycle & maintenance
  lifecycleYears: number;
  maintenanceType: MaintenanceType;
  maintenancePlan: string;
  warrantyMonths: number;
  serviceProvider: string;
  // Financial
  depreciationMethod: DepreciationMethod;
  usefulLifeMonths: number;
  residualPercent: number;
  costCenter: string;
  currency: string;
  // Assets bought for less than this are expensed, not capitalised
  capitalizationThreshold: number;
  procurementType: ProcurementType;
  // Default values for new assets
  defaultCondition: AssetCondition;
  trackingMethod: TrackingMethod;
  serialRequired: boolean;
  assignable: boolean;
  customFields: CustomField[];
  // Settings
  inspectionRequired: boolean;
  allowTransfers: boolean;
  iotTracking: boolean;
  disposalApproval: boolean;
  // counts owned by the Maintenance and Documents modules
  openWorkOrders: number;
  documents: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface AssetTypeFilters {
  search: string;
  category: string;
  status: '' | AssetTypeStatus;
}
