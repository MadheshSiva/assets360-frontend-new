import { AssetTypeRecord, CustomFieldType, MaintenanceType } from './asset-type.model';

export const ASSET_CLASSES = [
  'Movable Asset',
  'Fixed Asset',
  'Infrastructure',
  'Plant & Machinery',
  'Rolling Stock',
  'Building Services',
  'Tools & Equipment',
  'Furniture & Fixtures',
  'Leased Asset',
  'Intangible Asset',
  'Consumable',
  'Leasehold Improvement'
];

export const MAINTENANCE_TYPES: MaintenanceType[] = ['Preventive + Corrective', 'Preventive + Predictive', 'Preventive', 'Corrective', 'Condition Based'];
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['Text', 'Number', 'Date', 'Dropdown', 'Yes / No'];

export function blankAssetType(): AssetTypeRecord {
  return {
    code: '',
    name: '',
    category: '',
    assetClass: '',
    icon: 'conveyor',
    image: null,
    description: '',
    status: 'Active',
    subcategories: [],
    taggingFormat: '',
    lifecycleYears: 5,
    maintenanceType: 'Preventive',
    maintenancePlan: '',
    warrantyMonths: 12,
    serviceProvider: '',
    depreciationMethod: 'Straight Line',
    usefulLifeMonths: 60,
    residualPercent: 5,
    costCenter: '',
    currency: 'AED - UAE Dirham',
    capitalizationThreshold: 5000,
    procurementType: 'CAPEX',
    defaultCondition: 'New',
    trackingMethod: 'RFID',
    serialRequired: true,
    assignable: false,
    customFields: [],
    inspectionRequired: false,
    allowTransfers: true,
    iotTracking: false,
    disposalApproval: true,
    openWorkOrders: 0,
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}
