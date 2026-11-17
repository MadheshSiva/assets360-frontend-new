import { LocationType, SummaryTab } from './organization.model';

// Lookup lists for the location hierarchy and the layouts of the master data summary tabs

export const LOCATION_TYPES: LocationType[] = ['Location', 'Building', 'Floor', 'Zone'];

/** The level a parent must be for each type (a top-level location has no parent). */
export const PARENT_TYPE: Record<LocationType, LocationType | null> = {
  Location: null,
  Building: 'Location',
  Floor: 'Building',
  Zone: 'Floor'
};

export const CHILD_TYPE: Record<LocationType, LocationType | null> = {
  Location: 'Building',
  Building: 'Floor',
  Floor: 'Zone',
  Zone: null
};

export const TYPE_TONES: Record<LocationType, 'purple' | 'blue' | 'pink' | 'green'> = {
  Location: 'purple',
  Building: 'blue',
  Floor: 'pink',
  Zone: 'green'
};

export const COUNTRY_CITIES: Record<string, string[]> = {
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Dammam'],
  Qatar: ['Doha'],
  Oman: ['Muscat'],
  'United Kingdom': ['London', 'Manchester'],
  Singapore: ['Singapore']
};

export const TIME_ZONES = [
  '(GMT+00:00) London',
  '(GMT+03:00) Riyadh',
  '(GMT+03:00) Doha',
  '(GMT+04:00) Dubai',
  '(GMT+04:00) Muscat',
  '(GMT+08:00) Singapore'
];
/* ===== Summary tabs ===== */

const STATUS_TONES = { Active: 'green', Inactive: 'grey' } as const;
const LEVEL_TONES = { Low: 'grey', Medium: 'blue', High: 'orange', Critical: 'red' } as const;

/** Summary tab layouts (columns + stat cards); the rows come from the master data APIs (empty until wired). */
export function seedSummaryTabs(): SummaryTab[] {
  return [
    {
      id: 'asset',
      title: 'Assets',
      singular: 'Asset',
      filterKey: 'category',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Asset Code', kind: 'code' },
        { key: 'name', label: 'Asset Name' },
        { key: 'category', label: 'Category' },
        { key: 'model', label: 'Model / Type' },
        { key: 'serial', label: 'Serial Number' },
        { key: 'location', label: 'Location' },
        { key: 'custodian', label: 'Custodian' },
        { key: 'criticality', label: 'Criticality', kind: 'pill', tones: LEVEL_TONES },
        { key: 'lifecycle', label: 'Lifecycle Stage', kind: 'pill', tones: { 'In Use': 'blue', 'In Storage': 'grey', 'Under Maintenance': 'orange', Commissioning: 'purple', Retired: 'red' } },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Assets', icon: 'Box', tone: 'purple', kind: 'total' },
        { label: 'Categories', icon: 'Layers', tone: 'blue', kind: 'distinct', column: 'category' },
        { label: 'High / Critical', icon: 'ShieldCheck', tone: 'pink', kind: 'match', column: 'criticality', values: ['High', 'Critical'] },
        { label: 'Under Maintenance', icon: 'Wrench', tone: 'green', kind: 'match', column: 'lifecycle', values: ['Under Maintenance'] }
      ],
      rows: []
    },
    {
      id: 'people',
      title: 'People',
      singular: 'Employee',
      filterKey: 'department',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Employee ID', kind: 'code' },
        { key: 'name', label: 'Employee Name' },
        { key: 'department', label: 'Department' },
        { key: 'role', label: 'Role', kind: 'pill', tones: {} },
        { key: 'skill', label: 'Skill / Certification' },
        { key: 'shift', label: 'Shift' },
        { key: 'assets', label: 'Assigned Assets' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Employees', icon: 'Users', tone: 'purple', kind: 'total' },
        { label: 'Departments', icon: 'Building2', tone: 'blue', kind: 'distinct', column: 'department' },
        { label: 'Assigned Assets', icon: 'Box', tone: 'pink', kind: 'sum', column: 'assets' },
        { label: 'Active', icon: 'ShieldCheck', tone: 'green', kind: 'match', column: 'status', values: ['Active'] }
      ],
      rows: []
    },
    {
      id: 'vendor',
      title: 'Vendors',
      singular: 'Vendor',
      filterKey: 'type',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Vendor Code', kind: 'code' },
        { key: 'name', label: 'Vendor Name' },
        { key: 'type', label: 'Vendor Type', kind: 'pill', tones: { 'Service Contractor': 'blue', OEM: 'purple', Supplier: 'green', Logistics: 'orange', 'Certification Body': 'pink' } },
        { key: 'services', label: 'Services Provided' },
        { key: 'contact', label: 'Contact Person' },
        { key: 'sla', label: 'SLA' },
        { key: 'rating', label: 'Rating' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Vendors', icon: 'Truck', tone: 'purple', kind: 'total' },
        { label: 'Service Contractors', icon: 'Wrench', tone: 'blue', kind: 'match', column: 'type', values: ['Service Contractor'] },
        { label: 'OEMs & Suppliers', icon: 'Package', tone: 'pink', kind: 'match', column: 'type', values: ['OEM', 'Supplier'] },
        { label: 'Active', icon: 'ShieldCheck', tone: 'green', kind: 'match', column: 'status', values: ['Active'] }
      ],
      rows: []
    },
    {
      id: 'maintenance',
      title: 'Maintenance Plans',
      singular: 'Plan',
      filterKey: 'type',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Code', kind: 'code' },
        { key: 'name', label: 'Plan' },
        { key: 'type', label: 'Maintenance Type', kind: 'pill', tones: { Preventive: 'blue', Corrective: 'orange', Statutory: 'red', Predictive: 'purple', Inspection: 'green', Calibration: 'pink' } },
        { key: 'work', label: 'Work Type' },
        { key: 'priority', label: 'Priority', kind: 'pill', tones: LEVEL_TONES },
        { key: 'frequency', label: 'Frequency' },
        { key: 'checklist', label: 'Checklist' },
        { key: 'sla', label: 'SLA' },
        { key: 'escalation', label: 'Escalation' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Maintenance Plans', icon: 'Wrench', tone: 'purple', kind: 'total' },
        { label: 'Preventive', icon: 'ShieldCheck', tone: 'blue', kind: 'match', column: 'type', values: ['Preventive'] },
        { label: 'Statutory', icon: 'ClipboardCheck', tone: 'pink', kind: 'match', column: 'type', values: ['Statutory'] },
        { label: 'High / Critical Priority', icon: 'Activity', tone: 'green', kind: 'match', column: 'priority', values: ['High', 'Critical'] }
      ],
      rows: []
    },
    {
      id: 'inventory',
      title: 'Inventory Items',
      singular: 'Item',
      filterKey: 'category',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Item Code', kind: 'code' },
        { key: 'item', label: 'Item' },
        { key: 'category', label: 'Item Category' },
        { key: 'uom', label: 'UOM' },
        { key: 'levels', label: 'Min / Max Level' },
        { key: 'bin', label: 'Warehouse / Store / Bin' },
        { key: 'onHand', label: 'On Hand' },
        { key: 'stock', label: 'Stock Status', kind: 'pill', tones: { 'In Stock': 'green', 'Low Stock': 'orange', 'Out of Stock': 'red' } },
        { key: 'reorder', label: 'Reorder Level' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Items', icon: 'Package', tone: 'purple', kind: 'total' },
        { label: 'Stores', icon: 'Building2', tone: 'blue', kind: 'distinct', column: 'store' },
        { label: 'Low Stock', icon: 'Activity', tone: 'pink', kind: 'match', column: 'stock', values: ['Low Stock'] },
        { label: 'Out of Stock', icon: 'Box', tone: 'green', kind: 'match', column: 'stock', values: ['Out of Stock'] }
      ],
      rows: []
    },
    {
      id: 'compliance',
      title: 'Compliance Obligations',
      singular: 'Obligation',
      filterKey: 'validity',
      statusKey: 'status',
      columns: [
        { key: 'code', label: 'Code', kind: 'code' },
        { key: 'regulation', label: 'Regulation' },
        { key: 'standard', label: 'Standard' },
        { key: 'certificate', label: 'Certificate' },
        { key: 'permit', label: 'Permit Type' },
        { key: 'expiry', label: 'Validity / Expiry Date' },
        { key: 'validity', label: 'Validity', kind: 'pill', tones: { Valid: 'green', 'Expiring Soon': 'orange', Expired: 'red' } },
        { key: 'owner', label: 'Owner' },
        { key: 'reminder', label: 'Renewal / Reminder' },
        { key: 'status', label: 'Status', kind: 'status', tones: STATUS_TONES }
      ],
      stats: [
        { label: 'Obligations', icon: 'ShieldCheck', tone: 'purple', kind: 'total' },
        { label: 'Valid', icon: 'ClipboardCheck', tone: 'blue', kind: 'match', column: 'validity', values: ['Valid'] },
        { label: 'Expiring in 60 Days', icon: 'Activity', tone: 'pink', kind: 'match', column: 'validity', values: ['Expiring Soon'] },
        { label: 'Expired', icon: 'FileText', tone: 'green', kind: 'match', column: 'validity', values: ['Expired'] }
      ],
      rows: []
    }
  ];
}
