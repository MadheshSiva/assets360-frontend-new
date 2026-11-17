/**
 * Shared asset types and helpers used by the Asset List and the asset detail tabs.
 * Asset records come from the Assets API.
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

/** Asset register; empty until loaded from the Assets API. */
export const ASSET_RECORDS: AssetRecord[] = [];

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
