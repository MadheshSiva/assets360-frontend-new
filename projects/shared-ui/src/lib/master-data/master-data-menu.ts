/**
 * Sub-modules of the Master Data Management micro-frontend. The shell's sidebar and the
 * remote's routes are both built from this list, so a page added here shows up in both.
 * Page URLs are `${MASTER_DATA_BASE_PATH}/<group slug>/<item slug>`.
 */
export interface MasterDataItem {
  label: string;
  slug: string;
}

export interface MasterDataGroup {
  label: string;
  slug: string;
  description: string;
  items: MasterDataItem[];
}

export const MASTER_DATA_BASE_PATH = '/master-data-management';

export const MASTER_DATA_MENU: MasterDataGroup[] = [
  {
    label: 'Organization',
    slug: 'organization',
    description: 'Company structure and the places where assets live.',
    items: [
      { label: 'Organization', slug: 'organization' },
      { label: 'Business Unit', slug: 'business-unit' },
      { label: 'Department', slug: 'department' },
      { label: 'Site', slug: 'site' },
      { label: 'Building / Floor / Zone', slug: 'building-floor-zone' },
      { label: 'Location', slug: 'location' }
    ]
  },
  {
    label: 'Asset',
    slug: 'asset',
    description: 'How assets are classified, described and ranked.',
    items: [
      { label: 'Category / Subcategory', slug: 'category-subcategory' },
      { label: 'Asset Type', slug: 'asset-type' },
      { label: 'Asset Sub Type', slug: 'asset-sub-type' },
      { label: 'Asset Model', slug: 'asset-model' },
      { label: 'Manufacturer', slug: 'manufacturer' },
      { label: 'Condition', slug: 'condition' },
      { label: 'Criticality', slug: 'criticality' }
    ]
  },
  {
    label: 'People',
    slug: 'people',
    description: 'Employees, technicians and how they are organised.',
    items: [
      { label: 'Employee', slug: 'employee' },
      { label: 'Technician', slug: 'technician' },
      { label: 'Skill', slug: 'skill' },
      { label: 'Team', slug: 'team' },
      { label: 'Shift', slug: 'shift' }
    ]
  },
  {
    label: 'Vendor',
    slug: 'vendor',
    description: 'Suppliers and service partners.',
    items: [
      { label: 'Supplier', slug: 'supplier' },
      { label: 'Service Provider', slug: 'service-provider' },
      { label: 'AMC Vendor', slug: 'amc-vendor' }
    ]
  },
  {
    label: 'Maintenance',
    slug: 'maintenance',
    description: 'Building blocks for work orders and inspections.',
    items: [
      { label: 'Maintenance Type', slug: 'maintenance-type' },
      { label: 'Work Type', slug: 'work-type' },
      { label: 'Failure Code', slug: 'failure-code' },
      { label: 'Task Template', slug: 'task-template' },
      { label: 'Checklist', slug: 'checklist' },
      { label: 'Priority / Severity', slug: 'priority-severity' }
    ]
  },
  {
    label: 'Inventory',
    slug: 'inventory',
    description: 'Spare parts, units and where stock is kept.',
    items: [
      { label: 'Item', slug: 'item' },
      { label: 'Item Category', slug: 'item-category' },
      { label: 'UOM', slug: 'uom' },
      { label: 'Warehouse / Store / Bin', slug: 'warehouse-store-bin' },
      { label: 'Stock Status', slug: 'stock-status' }
    ]
  },
  {
    label: 'Compliance',
    slug: 'compliance',
    description: 'Certifications, regulations and permits.',
    items: [
      { label: 'Certification Type', slug: 'certification-type' },
      { label: 'Regulation', slug: 'regulation' },
      { label: 'Standard', slug: 'standard' },
      { label: 'Permit Type', slug: 'permit-type' }
    ]
  },
  {
    label: 'System Configuration',
    slug: 'system-configuration',
    description: 'Integrations, data sources and system-wide settings.',
    items: [
      { label: 'API Sync Status', slug: 'api-sync-status' },
      { label: 'Update Source', slug: 'update-source' },
      { label: 'Chart Type', slug: 'chart-type' },
      { label: 'System Settings', slug: 'system-settings' }
    ]
  },
  {
    label: 'Security',
    slug: 'security',
    description: 'Who can see and do what.',
    items: [
      { label: 'Permission Master', slug: 'permission-master' },
      { label: 'Module Access Master', slug: 'module-access-master' },
      { label: 'Role Master', slug: 'role-master' },
      { label: 'User Management', slug: 'user-management' }
    ]
  }
];
