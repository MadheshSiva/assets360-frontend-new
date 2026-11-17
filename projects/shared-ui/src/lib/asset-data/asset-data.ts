/**
 * Shared asset sample data (DEMO MODE) used by the Asset List and the asset detail tabs
 * (Relationships, Documents, Images, Status & Condition) until the Assets API is wired up.
 * Per-asset detail data lives in asset-details/ (one JSON file per asset).
 * Detail pages are opened with the asset tag in the query string, e.g. /assets/relationships?tag=GEN-00045.
 */

import { AirVent, BatteryCharging, Cctv, Cog, Fan, Flame, Forklift, Laptop, SolarPanel, Zap } from 'lucide-angular';

export type AssetStatus = 'Active' | 'Under Maintenance' | 'In Repair' | 'Disposed' | 'In Storage' | 'Checked Out';
export type Criticality = 'Critical' | 'High' | 'Medium' | 'Low';
export type AssetCondition = 'Good' | 'Fair' | 'Poor';
export type AssetIconKey =
  | 'generator' | 'chiller' | 'ups' | 'forklift' | 'fire' | 'ac' | 'laptop' | 'cctv' | 'transformer' | 'solar';

export interface AssetRecord {
  id: number;
  name: string;
  tag: string;
  category: string;
  type: string;
  site: string;
  area: string;
  custodian: string;
  department: string;
  status: AssetStatus;
  criticality: Criticality;
  manufacturer: string;
  model: string;
  /** ISO date (yyyy-mm-dd), or null when no maintenance is scheduled. */
  nextMaintenance: string | null;
  icon: AssetIconKey;
  /** Photo shown in the detail page headers. */
  image: string;
  /** Set for assets imported through Bulk Import / Export. */
  serialNumber?: string;
  /** ISO date (yyyy-mm-dd). */
  purchaseDate?: string;
}

/** What the asset detail pages show in their header. */
export interface AssetHeader {
  tag: string;
  name: string;
  category: string;
  model: string;
  location: string;
  status: AssetStatus;
  condition: AssetCondition;
  criticality: Criticality;
  /** Photo for the header, or null to show the asset-type icon instead. */
  image: string | null;
  icon: AssetIconKey;
}

export interface AssetTabLink {
  label: string;
  path?: string;
  active?: boolean;
}

const NOW = new Date();
export const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Icon per asset type, used where an asset has no photo. */
export const ASSET_TYPE_ICONS = {
  generator: Zap,
  chiller: Fan,
  ups: BatteryCharging,
  forklift: Forklift,
  fire: Flame,
  ac: AirVent,
  laptop: Laptop,
  cctv: Cctv,
  transformer: Cog,
  solar: SolarPanel,
};

/**
 * Every asset in the register. Shared, so pages see the same records.
 * Each one has its detail data (documents, images, status & condition, relationships) in asset-details/<tag>.json.
 */
export const ASSET_RECORDS: AssetRecord[] = [
  { id: 1, name: 'Diesel Generator 250 kVA', tag: 'GEN-00045', category: 'Power Generation', type: 'Generator', site: 'Head Office', area: 'Building A - ER-101', custodian: 'Ahmed Basim', department: 'Facilities', status: 'Active', criticality: 'Critical', manufacturer: 'Caterpillar', model: 'C9.3', nextMaintenance: '2027-03-01', icon: 'generator', image: 'asset-generator.svg' },
  { id: 2, name: 'HVAC Chiller', tag: 'HVAC-00112', category: 'HVAC', type: 'Chiller', site: 'Head Office', area: 'Building B - Roof', custodian: 'Sara Ahmed', department: 'Facilities', status: 'Active', criticality: 'High', manufacturer: 'Carrier', model: '30XA 400', nextMaintenance: '2026-11-15', icon: 'chiller', image: 'asset-images/chiller-overview.svg' },
  { id: 3, name: 'UPS 100 kVA', tag: 'UPS-00078', category: 'Electrical', type: 'UPS', site: 'Data Center', area: 'Building A - DC Room', custodian: 'Mohan Kumar', department: 'IT', status: 'Active', criticality: 'Critical', manufacturer: 'Schneider Electric', model: 'Galaxy VS 100', nextMaintenance: '2026-12-10', icon: 'ups', image: 'asset-images/ups-overview.svg' },
  { id: 4, name: 'Forklift - Electric', tag: 'FLT-00021', category: 'Material Handling', type: 'Forklift', site: 'Warehouse', area: 'Main Warehouse', custodian: 'Rashid Ali', department: 'Logistics', status: 'Active', criticality: 'High', manufacturer: 'Toyota', model: '8FBE20', nextMaintenance: '2026-10-22', icon: 'forklift', image: 'asset-images/forklift-overview.svg' },
  { id: 5, name: 'Fire Pump', tag: 'FP-00056', category: 'Safety & Security', type: 'Fire System', site: 'Head Office', area: 'Building A - Basement', custodian: 'Noura Saeed', department: 'Safety', status: 'Under Maintenance', criticality: 'Critical', manufacturer: 'Grundfos', model: 'NKF 150', nextMaintenance: '2026-10-05', icon: 'fire', image: 'asset-images/firepump-overview.svg' },
  { id: 6, name: 'Split AC - 5 Ton', tag: 'AC-00311', category: 'HVAC', type: 'Air Conditioner', site: 'Building C', area: '2nd Floor', custodian: 'Faisal Ahmed', department: 'Facilities', status: 'Active', criticality: 'Medium', manufacturer: 'Daikin', model: 'FTKF140', nextMaintenance: '2027-01-18', icon: 'ac', image: 'asset-images/ac-overview.svg' },
  { id: 7, name: 'Laptop - Dell Latitude', tag: 'IT-00189', category: 'IT Equipment', type: 'Laptop', site: 'Head Office', area: 'IT Department', custodian: 'Sarah James', department: 'IT', status: 'Active', criticality: 'Medium', manufacturer: 'Dell', model: 'Latitude 5440', nextMaintenance: null, icon: 'laptop', image: 'asset-images/laptop-overview.svg' },
  { id: 8, name: 'CCTV Camera - Dome', tag: 'CCTV-00234', category: 'Security', type: 'CCTV', site: 'Building A', area: 'Ground Floor', custodian: 'Ibrahim Khan', department: 'Security', status: 'Active', criticality: 'Medium', manufacturer: 'Hikvision', model: 'DS-2CD2143', nextMaintenance: '2027-02-12', icon: 'cctv', image: 'asset-images/cctvdome-overview.svg' },
  { id: 9, name: 'Transformer 1 MVA', tag: 'TRF-00067', category: 'Electrical', type: 'Transformer', site: 'Main Substation', area: 'Outdoor', custodian: 'Hamad Lateef', department: 'Engineering', status: 'In Repair', criticality: 'Critical', manufacturer: 'ABB', model: 'RESIBLOC 1000', nextMaintenance: '2026-10-20', icon: 'transformer', image: 'asset-images/transformer-overview.svg' },
  { id: 10, name: 'Solar Panel - 550W', tag: 'SOL-00456', category: 'Renewable Energy', type: 'Solar Panel', site: 'Building B', area: 'Roof', custodian: 'Ramesh Kumar', department: 'Engineering', status: 'Active', criticality: 'Low', manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', nextMaintenance: '2027-04-01', icon: 'solar', image: 'asset-images/solar-array.svg' },
  { id: 11, name: 'Gas Generator 500 kVA', tag: 'GEN-00052', category: 'Power Generation', type: 'Generator', site: 'Main Substation', area: 'Outdoor', custodian: 'Hamad Lateef', department: 'Engineering', status: 'Active', criticality: 'High', manufacturer: 'Cummins', model: 'C500N5', nextMaintenance: '2026-12-05', icon: 'generator', image: 'asset-generator.svg' },
  { id: 12, name: 'Air Handling Unit', tag: 'HVAC-00118', category: 'HVAC', type: 'AHU', site: 'Head Office', area: 'Building B - Plant Room', custodian: 'Sara Ahmed', department: 'Facilities', status: 'Under Maintenance', criticality: 'High', manufacturer: 'Trane', model: 'Performance CSAA', nextMaintenance: '2026-10-28', icon: 'chiller', image: 'asset-images/ahu-overview.svg' },
  { id: 13, name: 'Laptop - HP EliteBook', tag: 'IT-00204', category: 'IT Equipment', type: 'Laptop', site: 'Head Office', area: 'Finance Department', custodian: 'Mohan Kumar', department: 'IT', status: 'Checked Out', criticality: 'Low', manufacturer: 'HP', model: 'EliteBook 840 G10', nextMaintenance: null, icon: 'laptop', image: 'asset-images/laptop-overview.svg' },
  { id: 14, name: 'CCTV Camera - Bullet', tag: 'CCTV-00241', category: 'Security', type: 'CCTV', site: 'Warehouse', area: 'Loading Bay', custodian: 'Ibrahim Khan', department: 'Security', status: 'Active', criticality: 'Medium', manufacturer: 'Axis', model: 'P1455-LE', nextMaintenance: '2027-01-09', icon: 'cctv', image: 'asset-images/cctvbullet-overview.svg' },
  { id: 15, name: 'Pallet Jack - Electric', tag: 'FLT-00033', category: 'Material Handling', type: 'Pallet Jack', site: 'Warehouse', area: 'Main Warehouse', custodian: 'Rashid Ali', department: 'Logistics', status: 'In Repair', criticality: 'Low', manufacturer: 'Jungheinrich', model: 'EJE 120', nextMaintenance: '2026-10-30', icon: 'forklift', image: 'asset-images/palletjack-overview.svg' },
  { id: 16, name: 'Fire Alarm Panel', tag: 'FP-00061', category: 'Safety & Security', type: 'Fire System', site: 'Head Office', area: 'Building A - Security Room', custodian: 'Noura Saeed', department: 'Safety', status: 'Active', criticality: 'High', manufacturer: 'Honeywell', model: 'NFS2-3030', nextMaintenance: '2026-12-20', icon: 'fire', image: 'asset-images/alarmpanel-overview.svg' },
  { id: 17, name: 'UPS 60 kVA', tag: 'UPS-00081', category: 'Electrical', type: 'UPS', site: 'Head Office', area: 'IT Department - Server Room', custodian: 'Sarah James', department: 'IT', status: 'Active', criticality: 'High', manufacturer: 'Eaton', model: '93PM 60', nextMaintenance: '2027-02-02', icon: 'ups', image: 'asset-images/ups-overview.svg' },
  { id: 18, name: 'Transformer 500 kVA', tag: 'TRF-00072', category: 'Electrical', type: 'Transformer', site: 'Building C', area: 'Electrical Room', custodian: 'Hamad Lateef', department: 'Engineering', status: 'Active', criticality: 'High', manufacturer: 'Siemens', model: 'GEAFOL 500', nextMaintenance: '2027-03-15', icon: 'transformer', image: 'asset-images/transformer-overview.svg' },
  { id: 19, name: 'Split AC - 2 Ton', tag: 'AC-00318', category: 'HVAC', type: 'Air Conditioner', site: 'Head Office', area: 'Store Room', custodian: 'Faisal Ahmed', department: 'Facilities', status: 'In Storage', criticality: 'Low', manufacturer: 'Daikin', model: 'FTKF71', nextMaintenance: null, icon: 'ac', image: 'asset-images/ac-overview.svg' },
  { id: 20, name: 'Solar Panel - 550W', tag: 'SOL-00462', category: 'Renewable Energy', type: 'Solar Panel', site: 'Building B', area: 'Roof', custodian: 'Ramesh Kumar', department: 'Engineering', status: 'Disposed', criticality: 'Low', manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', nextMaintenance: null, icon: 'solar', image: 'asset-images/solar-array.svg' },
];

export function findAsset(tag: string | null | undefined): AssetRecord | undefined {
  return tag ? ASSET_RECORDS.find((a) => a.tag === tag) : undefined;
}

export function assetLocation(asset: AssetRecord): string {
  return `${asset.site} - ${asset.area}`;
}

/** No condition field in the register yet, so it follows the status. */
export function assetCondition(asset: AssetRecord): AssetCondition {
  if (asset.status === 'In Repair' || asset.status === 'Disposed') return 'Poor';
  if (asset.status === 'Under Maintenance') return 'Fair';
  return 'Good';
}

export function assetHeader(asset: AssetRecord): AssetHeader {
  return {
    tag: asset.tag,
    name: asset.name,
    category: asset.category,
    model: `${asset.manufacturer} ${asset.model}`,
    location: assetLocation(asset),
    status: asset.status,
    condition: assetCondition(asset),
    criticality: asset.criticality,
    image: asset.image,
    icon: asset.icon,
  };
}

/** Pill colour class (see .pill--* in the page stylesheets). */
export function statusPill(status: AssetStatus): string {
  if (status === 'Active') return 'pill--active';
  if (status === 'Disposed') return 'pill--critical';
  return 'pill--fair';
}

export function conditionPill(condition: AssetCondition): string {
  return condition === 'Good' ? 'pill--active' : condition === 'Fair' ? 'pill--fair' : 'pill--critical';
}

export function criticalityPill(criticality: Criticality): string {
  if (criticality === 'Critical') return 'pill--critical';
  if (criticality === 'Low') return 'pill--active';
  return 'pill--fair';
}

/**
 * The asset detail tab bar. Tabs with a path link to that page for the same asset (pass the tag as a query param);
 * tabs without one are not built yet.
 */
export function assetTabs(active: string): AssetTabLink[] {
  const tabs: AssetTabLink[] = [
    { label: 'Overview', path: '/assets/overview' },
    { label: 'Components', path: '/assets/component-details' },
    { label: 'Relationships', path: '/assets/relationships' },
    { label: 'Maintenance', path: '/assets/maintenance-details' },
    { label: 'Service History', path: '/assets/service-history' },
    { label: 'Documents', path: '/assets/documents' },
    { label: 'Images', path: '/assets/images' },
    { label: 'Custom Fields', path: '/assets/field-values' },
    { label: 'Status & Condition', path: '/assets/status-condition' },
    { label: 'Criticality', path: '/assets/criticality' },
    { label: 'Asset Lifecycle', path: '/assets/lifecycle' },
    { label: 'History', path: '/assets/history' },
    { label: 'Asset Health Score', path: '/assets/health-score' },
  ];
  return tabs.map((t) => (t.label === active ? { label: t.label, active: true } : t));
}
