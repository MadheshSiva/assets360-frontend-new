import { AssetSubTypeRecord } from './asset-sub-type.model';

export function blankAssetSubType(): AssetSubTypeRecord {
  return {
    code: '',
    name: '',
    assetType: '',
    category: '',
    subcategory: '',
    icon: 'conveyor',
    image: null,
    description: '',
    status: 'Active',
    taggingFormat: '',
    specifications: [],
    lifecycleYears: 5,
    maintenanceType: 'Preventive',
    maintenanceFrequencyDays: 90,
    warrantyMonths: 12,
    defaultCondition: 'New',
    trackingMethod: 'RFID',
    serialRequired: true,
    inspectionRequired: false,
    iotTracking: false,
    customFields: [],
    assetCount: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}

/** Parent asset types offered when the Asset Type master has not loaded (hardcoded until the API exists). */
export const FALLBACK_PARENT_TYPES: { name: string; category: string; subcategories: string[] }[] = [
  { name: 'Diesel Generator', category: 'Electrical Equipment', subcategories: ['Generators'] },
  { name: 'Chiller', category: 'HVAC', subcategories: ['Cooling Systems'] },
  { name: 'Air Handling Unit', category: 'HVAC', subcategories: ['Air Distribution'] },
  { name: 'Laptop', category: 'IT Equipment', subcategories: ['End User Devices'] },
  { name: 'Forklift', category: 'Material Handling', subcategories: ['Lifting Equipment'] }
];

const row = (r: Partial<AssetSubTypeRecord>): AssetSubTypeRecord => ({ ...blankAssetSubType(), ...r });

/** Hardcoded seed records. */
export const SEED_SUB_TYPES: AssetSubTypeRecord[] = [
  row({
    code: 'AST-DG-STB', name: 'Standby Diesel Generator', assetType: 'Diesel Generator', category: 'Electrical Equipment', subcategory: 'Generators',
    icon: 'generator', description: 'Backup generator that starts on mains failure.', taggingFormat: 'DGS-{YY}-{0000}',
    specifications: [
      { name: 'Power Rating', unit: 'kVA', required: true },
      { name: 'Voltage', unit: 'V', required: true },
      { name: 'Fuel Tank Capacity', unit: 'L', required: false },
      { name: 'Noise Level', unit: 'dB', required: false }
    ],
    lifecycleYears: 20, maintenanceType: 'Preventive + Corrective', maintenanceFrequencyDays: 30, warrantyMonths: 24,
    trackingMethod: 'Barcode', inspectionRequired: true, iotTracking: true,
    customFields: [{ name: 'ATS Model', type: 'Text', required: false }, { name: 'Last Load Test', type: 'Date', required: false }],
    assetCount: 12, createdOn: '2026-08-14T09:20', createdBy: 'admin', updatedOn: '2026-10-02T11:05'
  }),
  row({
    code: 'AST-DG-PRM', name: 'Prime Power Diesel Generator', assetType: 'Diesel Generator', category: 'Electrical Equipment', subcategory: 'Generators',
    icon: 'generator', description: 'Continuous-duty generator for off-grid sites.', taggingFormat: 'DGP-{YY}-{0000}',
    specifications: [{ name: 'Power Rating', unit: 'kVA', required: true }, { name: 'Running Hours', unit: 'hrs', required: false }],
    lifecycleYears: 15, maintenanceType: 'Preventive + Predictive', maintenanceFrequencyDays: 15, warrantyMonths: 12,
    trackingMethod: 'GPS', inspectionRequired: true, iotTracking: true, assetCount: 4,
    createdOn: '2026-08-14T09:25', createdBy: 'admin', updatedOn: '2026-08-14T09:25'
  }),
  row({
    code: 'AST-CH-AIR', name: 'Air-Cooled Chiller', assetType: 'Chiller', category: 'HVAC', subcategory: 'Cooling Systems',
    icon: 'chiller', description: 'Packaged chiller with condenser fans.', taggingFormat: 'CHA-{YY}-{0000}',
    specifications: [{ name: 'Cooling Capacity', unit: 'TR', required: true }, { name: 'Refrigerant', unit: '', required: true }],
    lifecycleYears: 20, maintenanceType: 'Preventive', maintenanceFrequencyDays: 90, warrantyMonths: 18, assetCount: 7,
    createdOn: '2026-09-01T10:00', createdBy: 'facility.admin', updatedOn: '2026-09-20T15:40'
  }),
  row({
    code: 'AST-CH-WTR', name: 'Water-Cooled Chiller', assetType: 'Chiller', category: 'HVAC', subcategory: 'Cooling Systems',
    icon: 'chiller', description: 'Centrifugal chiller connected to cooling towers.', taggingFormat: 'CHW-{YY}-{0000}',
    specifications: [{ name: 'Cooling Capacity', unit: 'TR', required: true }, { name: 'COP', unit: '', required: false }],
    lifecycleYears: 25, maintenanceType: 'Condition Based', maintenanceFrequencyDays: 60, warrantyMonths: 24,
    status: 'Inactive', assetCount: 0, createdOn: '2026-09-01T10:10', createdBy: 'facility.admin', updatedOn: '2026-10-11T08:15'
  }),
  row({
    code: 'AST-LAP-BUS', name: 'Business Laptop', assetType: 'Laptop', category: 'IT Equipment', subcategory: 'End User Devices',
    icon: 'laptop', description: 'Standard issue laptop for office staff.', taggingFormat: 'LAP-{YY}-{0000}',
    specifications: [{ name: 'Processor', unit: '', required: true }, { name: 'RAM', unit: 'GB', required: true }, { name: 'Storage', unit: 'GB', required: true }],
    lifecycleYears: 4, maintenanceType: 'Corrective', maintenanceFrequencyDays: 365, warrantyMonths: 36, trackingMethod: 'QR Code',
    customFields: [{ name: 'MAC Address', type: 'Text', required: true }], assetCount: 148,
    createdOn: '2026-07-10T12:00', createdBy: 'it.admin', updatedOn: '2026-10-28T16:22'
  }),
  row({
    code: 'AST-FL-ELE', name: 'Electric Forklift', assetType: 'Forklift', category: 'Material Handling', subcategory: 'Lifting Equipment',
    icon: 'forklift', description: 'Battery-powered counterbalance forklift.', taggingFormat: 'FLE-{YY}-{0000}',
    specifications: [{ name: 'Load Capacity', unit: 'kg', required: true }, { name: 'Lift Height', unit: 'm', required: true }, { name: 'Battery Voltage', unit: 'V', required: false }],
    lifecycleYears: 10, maintenanceType: 'Preventive + Corrective', maintenanceFrequencyDays: 30, warrantyMonths: 12,
    trackingMethod: 'BLE', inspectionRequired: true, iotTracking: true, assetCount: 9,
    createdOn: '2026-08-22T08:45', createdBy: 'ops.admin', updatedOn: '2026-08-22T08:45'
  })
];
