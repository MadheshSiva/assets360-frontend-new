import {
  Bluetooth,
  Briefcase,
  Building,
  Building2,
  Cctv,
  Cpu,
  Factory,
  Fan,
  Gauge,
  Hand,
  Layers,
  LucideIconData,
  Package,
  Radio,
  Snowflake,
  Thermometer,
  Type,
  Warehouse,
  Wifi,
  Wrench,
  Zap
} from 'lucide-angular';

// Types, option lists and display lookups for Maps & Floor Plans.
// Records come from the maps API (maps-api.service.ts) and Master Data Management (location tree).

export type Tone = 'purple' | 'blue' | 'pink' | 'green' | 'orange' | 'red' | 'grey';
export type MapStatus = 'Published' | 'Draft' | 'Archived';

/* ===== Tabs (one per sub page in ADMINISTRATION_MENU > Maps & Floor Plans) ===== */

export type MapsTabId =
  | 'map-library'
  | 'floor-plans'
  | 'zones-geofences'
  | 'device-asset-plotting'
  | 'layers'
  | 'versions-publishing'
  | 'settings';

/* ===== Site tree (built from Master Data Management sites / buildings / floors) ===== */

export interface SiteNode {
  /** MDM id ('org' for the root) */
  id: string;
  label: string;
  kind: 'org' | 'site' | 'building' | 'floor';
  /** Map position from Master Data (WGS 84); absent when not set */
  lat?: number;
  lng?: number;
  /** Floors: the layout picture uploaded in Master Data, drawn on the map at the floor's position */
  image?: string;
  children?: SiteNode[];
}

export const KIND_ICONS: Record<SiteNode['kind'], LucideIconData> = {
  org: Building2,
  site: Building2,
  building: Building,
  floor: Layers
};

/* ===== Floor plans + versions ===== */

export type FileFormat = 'PNG' | 'JPG' | 'PDF' | 'SVG' | 'DWG' | 'DXF';
export type FloorPlanType = 'Floor Plan' | 'Site Map';
/** Where a floor plan hangs in the Master Data location hierarchy. */
export type LocationKind = 'site' | 'building' | 'floor';

export const FILE_FORMATS: FileFormat[] = ['PNG', 'JPG', 'PDF', 'SVG', 'DWG', 'DXF'];
export const IMAGE_FORMATS: FileFormat[] = ['PNG', 'JPG', 'SVG'];

export interface FloorPlan {
  id: string;
  locationId: string;
  locationType: LocationKind;
  /** Display text, e.g. "Head Office > Building A > Floor 1" */
  locationPath: string;
  name: string;
  /** The plan's description */
  subtitle: string;
  type: FloorPlanType;
  format: FileFormat;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  sizeMb: number;
  widthMeters: number | null;
  heightMeters: number | null;
  /** "60.00 m × 32.00 m", or "—" when unknown */
  dimensions: string;
  scale: string;
  /** Current version, e.g. "v2.1" */
  version: string;
  status: MapStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  zoneCount: number;
  plotCount: number;
  updated: string;
  updatedBy: string;
}

export interface MapVersion {
  version: string;
  current: boolean;
  status: MapStatus;
  changes: string[];
  uploadedBy: string;
  uploadedOn: string;
  fileUrl: string;
  fileName: string;
  format: FileFormat;
  sizeMb: number;
  description: string;
}

/* ===== Zones ===== */

export type ZoneType = 'Production' | 'Office' | 'Storage' | 'Restricted' | 'Maintenance' | 'Operational';
export type ZoneShape = 'Polygon' | 'Rectangle' | 'Circle' | 'Custom';

export interface MapZone {
  id: string;
  floorPlanId: string;
  code: string;
  name: string;
  type: ZoneType;
  tone: Tone;
  /** Colour stored with the zone (hex) */
  color: string;
  shape: ZoneShape;
  // Bounding box on the plan, in % of its width / height
  x: number;
  y: number;
  w: number;
  h: number;
  /** Polygon / Custom outline in % of the plan */
  points: { x: number; y: number }[];
  /** Circle radius in % of the plan width */
  radius: number | null;
  areaM2: number;
  description: string;
  accessRule: string;
  active: boolean;
  entryAlert: boolean;
  exitAlert: boolean;
  dwellAlert: boolean;
  dwellMinutes: number;
  geofence: boolean;
}

export const ZONE_TYPES: { type: ZoneType; tone: Tone; icon: LucideIconData }[] = [
  { type: 'Production', tone: 'blue', icon: Factory },
  { type: 'Office', tone: 'orange', icon: Briefcase },
  { type: 'Storage', tone: 'green', icon: Package },
  { type: 'Restricted', tone: 'red', icon: Hand },
  { type: 'Maintenance', tone: 'purple', icon: Wrench },
  { type: 'Operational', tone: 'grey', icon: Gauge }
];

export const ACCESS_RULES = ['Authorized Personnel Only', 'All Staff', 'Contractors with Escort', 'Restricted - Badge Required'];

export const ZONE_COLORS = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#F97316', '#EC4899'];

/** GET zones/options; these are the fallbacks while it loads (or when it fails). */
export interface ZoneOptions {
  zoneTypes: string[];
  shapes: string[];
  accessRules: string[];
  colors: string[];
}

export const DEFAULT_ZONE_OPTIONS: ZoneOptions = {
  zoneTypes: ZONE_TYPES.map((t) => t.type),
  shapes: ['Polygon', 'Rectangle', 'Circle', 'Custom'],
  accessRules: [...ACCESS_RULES],
  colors: [...ZONE_COLORS]
};

/* ===== Devices + assets plotted on the plan ===== */

export type PlotKind = 'device' | 'asset';

/** A zone outline drawn on the map, in % of the plan (same fields as MapZone). */
export type ZoneGeometry = Pick<MapZone, 'x' | 'y' | 'w' | 'h' | 'points' | 'radius'>;

export interface PlotItem {
  /** `${kind}:${itemId}` - unique across devices and assets */
  id: string;
  /** Asset registration id or device id */
  itemId: string;
  code: string;
  name: string;
  kind: PlotKind;
  // Device type (Gateway, Sensor...) or asset category (HVAC...)
  type: string;
  assetType?: string;
  model?: string;
  serial?: string;
  icon: LucideIconData;
  tone: Tone;
  status: string;
  // Position on the plan in %; null when not plotted yet
  x: number | null;
  y: number | null;
  zoneId?: string;
  orientation: number;
  lastUpdated: string;
}

export function plotKey(kind: PlotKind, itemId: string): string {
  return `${kind}:${itemId}`;
}

/** Marker icon + colour for a device type or asset category. */
export function plotLook(kind: PlotKind, type: string, assetType = ''): { icon: LucideIconData; tone: Tone } {
  const t = `${type} ${assetType}`.toLowerCase();
  if (kind === 'device') {
    if (/ble|bluetooth/.test(t)) return { icon: Bluetooth, tone: 'green' };
    if (/gateway|lora|radio/.test(t)) return { icon: Radio, tone: 'purple' };
    if (/access|wi-?fi|\bap\b/.test(t)) return { icon: Wifi, tone: 'blue' };
    if (/camera|cctv/.test(t)) return { icon: Cctv, tone: 'purple' };
    if (/temp|sensor|humid/.test(t)) return { icon: Thermometer, tone: 'green' };
    if (/meter|energy|power/.test(t)) return { icon: Zap, tone: 'orange' };
    return { icon: Cpu, tone: 'blue' };
  }
  if (/chiller|hvac|cool|refriger/.test(t)) return { icon: Snowflake, tone: 'blue' };
  if (/fan|ahu|air/.test(t)) return { icon: Fan, tone: 'purple' };
  if (/pump|mechan/.test(t)) return { icon: Gauge, tone: 'purple' };
  if (/electr|generator|ups|panel/.test(t)) return { icon: Zap, tone: 'orange' };
  return { icon: Package, tone: 'purple' };
}

/* ===== Layers ===== */

export interface MapLayer {
  /** LayerKey: zones | geofences | assets | devices | annotations | rooms | base | heatmap */
  id: string;
  name: string;
  type: string;
  description: string;
  icon: LucideIconData;
  tone: Tone;
  enabled: boolean;
  visible: boolean;
  locked: boolean;
  showLabel: boolean;
  showId: boolean;
  showStatusIcon: boolean;
  useCategoryColor: boolean;
  labelPosition: string;
  categories: string[];
  statusFilter: string;
  opacity: number;
  color: string;
}

function layer(id: string, name: string, type: string, icon: LucideIconData, tone: Tone, enabled: boolean, description: string, extra: Partial<MapLayer> = {}): MapLayer {
  return {
    id, name, type, icon, tone, enabled, description, visible: true, locked: false, showLabel: true, showId: true, showStatusIcon: false,
    useCategoryColor: true, labelPosition: 'Bottom Center', categories: [], statusFilter: 'All Statuses', opacity: 80, color: '#5B2AA8', ...extra
  };
}

/** Default layer definitions (same as the API's defaults); fallback until a plan's layers load. */
export const LAYERS: MapLayer[] = [
  layer('zones', 'Zones', 'Zone (Area)', Layers, 'purple', true, 'Operational zones drawn on the floor plan.'),
  layer('geofences', 'Geofences', 'Geofence (Alerting)', Layers, 'purple', true, 'Geofence boundaries that raise entry / exit alerts.'),
  layer('assets', 'Assets', 'Asset (Plotted / Tracked)', Package, 'purple', true, 'Displays assets and major equipment on the floor plan.'),
  layer('devices', 'Devices', 'Device (IoT)', Wifi, 'blue', true, 'Gateways, access points, cameras, sensors and meters.'),
  layer('annotations', 'Annotations', 'Annotation (Text)', Type, 'grey', false, 'Free text notes and dimension markers.'),
  layer('rooms', 'Room & Space', 'Room (Space)', Building, 'orange', true, 'Rooms and spaces from the location hierarchy.'),
  layer('base', 'Floor Plan (Base)', 'Base Map', Layers, 'grey', true, 'The uploaded floor plan image.', { locked: true }),
  layer('heatmap', 'Heatmap (Utilization)', 'Heatmap', Warehouse, 'orange', false, 'Space utilization heatmap from occupancy sensors.')
];

/** Fresh copy of the default layers (used until the plan's layers load, or when no plan is selected). */
export function defaultLayers(): MapLayer[] {
  return LAYERS.map((l) => ({ ...l, categories: [...l.categories] }));
}

/** A saved layer set (view): which layers it switches on. */
export interface LayerSet {
  id: string;
  name: string;
  layers: Record<string, boolean>;
  createdBy: string;
  createdAt: string;
}

export interface MapsSummary {
  floorPlans: number;
  zones: number;
  devicesPlotted: number;
  assetsPlotted: number;
}

/* ===== Lookups ===== */

export const TONE_HEX: Record<Tone, string> = {
  purple: '#7c3aed',
  blue: '#2563eb',
  pink: '#ec4899',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  grey: '#64748b'
};

export const STATUS_TONE: Record<MapStatus, Tone> = { Published: 'green', Draft: 'grey', Archived: 'orange' };

export function zoneIcon(type: ZoneType): LucideIconData {
  return ZONE_TYPES.find((t) => t.type === type)?.icon ?? Gauge;
}

export function zoneTone(type: string): Tone {
  return ZONE_TYPES.find((t) => t.type === type)?.tone ?? 'grey';
}

export function isImageFormat(format: string | null | undefined): boolean {
  return IMAGE_FORMATS.includes((format ?? '').toUpperCase() as FileFormat);
}

/** "15 Jan 2026" ("—" when missing) */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "10:24 AM" ('' when missing) */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
