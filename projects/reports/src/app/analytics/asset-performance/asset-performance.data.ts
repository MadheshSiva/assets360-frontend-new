import { RA_CATEGORIES, assetId } from '../shared/analytics-common';
import { ChartSeries, HBarRow } from '../shared/charts';
import { RA_ASSET_TYPES } from './kit/asset-universe';
import { DEMO_PERIODS, DEMO_SITES, DemoSite, rnd, rndInt, round1 } from './kit/demo-data';

// View models and the DEMO MODE asset register behind the Asset Performance page (aggregated in asset-performance.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_ASSETS_VIEW = 'All Assets';

/** Period presets offered by the filter bar. */
export const AP_FALLBACK_PERIODS = DEMO_PERIODS;
export const AP_DEFAULT_PERIOD = 'This year';

/** Health score below which an asset is flagged, and the utilization each site is expected to reach. */
export const AP_DEFAULT_HEALTH_THRESHOLD = 60;
export const AP_DEFAULT_UTILIZATION_TARGET = 60;

/** One asset's figures over the period. Missing measurements are null. */
export interface ApAssetRow {
  /** Record id */
  key: string;
  /** Asset ID shown to users (falls back to the record id) */
  id: string;
  name: string;
  category: string;
  type: string;
  location: string;
  health: number | null;
  utilization: number | null;
  availability: number | null;
  mtbf: number | null;
  mttr: number | null;
  downtime: number;
  failures: number;
  score: number | null;
  band: string | null;
  /** Top Performer, On Track, Underperforming or Not rated */
  status: string;
}

export interface ApLocationRow {
  name: string;
  assets: number;
  health: number | null;
  utilization: number | null;
  availability: number | null;
  score: number | null;
  status: string;
}

/** An asset named on an insight card. */
export interface ApInsightAsset {
  key: string;
  id: string;
  name: string;
  location: string;
  health: number | null;
  reasons: string[];
}

export interface ApInsight {
  key: string;
  severity: string;
  title: string;
  message: string;
  count: number;
  assets: ApInsightAsset[];
  locations: string[];
  actions: string[];
  /** Filter behind "View assets" / "View locations", e.g. healthBelow=60 */
  query: string;
}

/** A KPI value with its change against the previous period (0 when there is nothing to compare). */
export interface ApKpiValue {
  value: number | null;
  change: number;
}

export interface AssetPerformanceView {
  generatedAt: string | null;
  /** Previous period (UTC, end exclusive), used by Compare Periods */
  previousFromUtc: string | null;
  previousToUtc: string | null;
  healthThreshold: number;
  utilizationTarget: number;
  total: number;
  totalChange: number;
  health: ApKpiValue;
  utilization: ApKpiValue;
  availability: ApKpiValue;
  mtbf: ApKpiValue;
  mttr: ApKpiValue;
  labels: string[];
  healthTrend: ChartSeries[];
  categoryLabels: string[];
  categoryUtilization: ChartSeries[];
  distribution: HBarRow[];
  ratedAssets: number;
  notRated: number;
  reliability: ChartSeries[];
  downtime: ChartSeries[];
  downtimeHours: number;
  topBottom: ApAssetRow[];
  locations: ApLocationRow[];
  insights: ApInsight[];
}

const none = (): ApKpiValue => ({ value: null, change: 0 });

/** What the page shows before the first load. */
export function emptyAssetPerformance(): AssetPerformanceView {
  return {
    generatedAt: null,
    previousFromUtc: null,
    previousToUtc: null,
    healthThreshold: AP_DEFAULT_HEALTH_THRESHOLD,
    utilizationTarget: AP_DEFAULT_UTILIZATION_TARGET,
    total: 0,
    totalChange: 0,
    health: none(),
    utilization: none(),
    availability: none(),
    mtbf: none(),
    mttr: none(),
    labels: [],
    healthTrend: [],
    categoryLabels: [],
    categoryUtilization: [],
    distribution: [],
    ratedAssets: 0,
    notRated: 0,
    reliability: [],
    downtime: [],
    downtimeHours: 0,
    topBottom: [],
    locations: [],
    insights: []
  };
}

// ----- DEMO MODE asset register -----

/** An asset in the register with its 12-month figures. Unrated assets have no health assessment yet. */
export interface ApRegisterAsset {
  key: string;
  id: string;
  name: string;
  category: string;
  type: string;
  site: DemoSite;
  health: number | null;
  utilization: number;
  availability: number;
  mtbf: number | null;
  mttr: number | null;
  /** Breakdowns over the last 12 months */
  failuresYear: number;
  /** Planned (preventive) downtime over the last 12 months */
  plannedHoursYear: number;
}

const MODELS: Record<string, string[]> = {
  Vehicles: ['Toyota Hilux Pickup', 'Nissan Urvan Van', 'Mitsubishi Fuso Truck', 'Toyota Land Cruiser', 'Isuzu NPR Truck'],
  Machinery: ['Caterpillar Forklift', 'Atlas Copco Compressor', 'Toyota Reach Truck', 'Grundfos Pump Set', 'Kaeser Air Compressor', 'Hyster Forklift'],
  Facilities: ['Otis Passenger Lift', 'KONE Service Elevator', 'Fire Pump Set', 'Loading Dock Leveller', 'Water Treatment Unit'],
  'IT Equipment': ['Dell PowerEdge Server', 'Cisco Core Switch', 'HP LaserJet Printer', 'APC Smart-UPS', 'NetApp Storage Array'],
  HVAC: ['Carrier Chiller', 'Daikin Air Handling Unit', 'Trane Rooftop Unit', 'York Cooling Tower', 'Daikin VRF Outdoor Unit'],
  'Power & Electrical': ['Cummins Diesel Generator', 'ABB Transformer', 'Schneider LV Panel', 'Eaton UPS System', 'Huawei Solar Inverter'],
  'Safety & PPE': ['Draeger SCBA Set', 'Honeywell Gas Detector', 'Notifier Fire Alarm Panel', 'MSA Fall Arrest System']
};

const TYPE_OF: Record<string, string> = {
  Vehicles: RA_ASSET_TYPES[2],
  Machinery: RA_ASSET_TYPES[0],
  Facilities: RA_ASSET_TYPES[1],
  'IT Equipment': RA_ASSET_TYPES[4],
  HVAC: RA_ASSET_TYPES[0],
  'Power & Electrical': RA_ASSET_TYPES[3],
  'Safety & PPE': RA_ASSET_TYPES[1]
};

/** Typical utilization per category (%). */
const UTILIZATION_BASE: Record<string, number> = {
  Vehicles: 72, Machinery: 70, Facilities: 63, 'IT Equipment': 79, HVAC: 75, 'Power & Electrical': 58, 'Safety & PPE': 52
};

/** Assets per site, and how the site's health and utilization differ from the group. */
const SITE_PROFILE: Record<string, { assets: number; health: number; utilization: number }> = {
  DXB: { assets: 34, health: 4, utilization: 4 },
  AUH: { assets: 24, health: 2, utilization: 2 },
  SHJ: { assets: 22, health: -3, utilization: -10 },
  JAW: { assets: 28, health: 0, utilization: 6 },
  AAN: { assets: 14, health: -7, utilization: -14 },
  RUH: { assets: 20, health: 1, utilization: 0 },
  DOH: { assets: 10, health: 3, utilization: -2 },
  LON: { assets: 12, health: 5, utilization: 1 },
  SIN: { assets: 12, health: 3, utilization: 3 }
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function buildRegister(): ApRegisterAsset[] {
  const list: ApRegisterAsset[] = [];
  let k = 0;
  for (const site of DEMO_SITES) {
    const profile = SITE_PROFILE[site.code];
    for (let n = 1; n <= profile.assets; n++, k++) {
      const category = RA_CATEGORIES[(k * 3 + n) % RA_CATEGORIES.length];
      const models = MODELS[category];
      const model = models[(k + n * 2) % models.length];
      const r = rnd(k, 1);
      const rated = k % 29 !== 7;
      const band = r < 0.05 ? rndInt(k, 2, 22, 39) : r < 0.16 ? rndInt(k, 2, 40, 59) : r < 0.56 ? rndInt(k, 2, 60, 79) : rndInt(k, 2, 80, 97);
      const health = rated ? clamp(band + profile.health, 15, 99) : null;
      const h = health ?? 70;
      const utilization = round1(clamp(UTILIZATION_BASE[category] + profile.utilization + (rnd(k, 3) - 0.5) * 30, 6, 98));
      const availability = round1(clamp(88 + h * 0.105 + (rnd(k, 4) - 0.5) * 2, 82, 99.8));
      const mtbf = rated ? Math.round(260 + h * 7 + (rnd(k, 5) - 0.5) * 160) : null;
      const mttr = rated ? round1(1.8 + (100 - h) * 0.07 + rnd(k, 6) * 1.4) : null;
      const runHours = 8760 * (utilization / 100);
      list.push({
        key: `ast-${site.code.toLowerCase()}-${n}`,
        id: assetId(site.code, 100 + n * 7 + (k % 5)),
        name: `${model} ${String(n).padStart(2, '0')}`,
        category,
        type: TYPE_OF[category],
        site,
        health,
        utilization,
        availability,
        mtbf,
        mttr,
        failuresYear: mtbf ? Math.max(1, Math.round(runHours / mtbf / 2)) : 0,
        plannedHoursYear: Math.round(10 + rnd(k, 7) * 18)
      });
    }
  }
  return list;
}

export const AP_REGISTER: ApRegisterAsset[] = buildRegister();
