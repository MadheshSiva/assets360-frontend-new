/**
 * Types, config and helpers for the Asset Overview dashboard.
 * STATIC DEMO: PORTFOLIO and SITES come from the dashboard's demo register (services/dashboard/dashboard.data.ts),
 * the same assets the Dashboard service answers with.
 */
import { DEMO_ASSETS, DEMO_SITES, DemoAsset, demoLastSeen, siteOf } from '../services/dashboard/dashboard.data';

export type PortfolioStatus = 'Active' | 'Idle' | 'In Transit' | 'Under Maintenance' | 'Retired' | 'Disposed';
export type HealthBand = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
export type Criticality = 'Critical' | 'High' | 'Medium' | 'Low';
export type AgeBand = 'New' | 'Mature' | 'Aging' | 'End of Life';

export interface PortfolioAsset {
  id: string;
  name: string;
  category: string;
  type: string;
  site: string;
  status: PortfolioStatus;
  /** 0-100, or null when never assessed. */
  health: number | null;
  criticality: Criticality;
  /** Current book value (USD). */
  value: number;
  acquired: string;
  manufacturer: string;
  model: string;
  serial: string;
  owner: string;
  department: string;
  documents: number;
  lastService: string;
  nextService: string;
  connected: boolean;
  lastUpdate: string;
  /** Status and health 30 days earlier, for the period comparison. */
  prevStatus: PortfolioStatus;
  prevHealth: number | null;
}

export interface PortfolioSite {
  name: string;
  lat: number;
  lng: number;
  /** Which side of the pin the card sits on. */
  card: 'left' | 'right';
}

export const CATEGORIES: { name: string; color: string; icon: string }[] = [
  { name: 'Electrical', color: '#2f80ed', icon: 'factory' },
  { name: 'HVAC', color: '#7c5cff', icon: 'building' },
  { name: 'Power Generation', color: '#f97316', icon: 'factory' },
  { name: 'Safety & Security', color: '#ef4b5f', icon: 'hard-hat' },
  { name: 'Material Handling', color: '#2f6fe4', icon: 'truck' },
  { name: 'IT Equipment', color: '#14b8c4', icon: 'monitor' },
  { name: 'Security', color: '#64748b', icon: 'hard-hat' },
  { name: 'Renewable Energy', color: '#f5b324', icon: 'wrench' },
];
export const STATUSES: PortfolioStatus[] = ['Active', 'Idle', 'In Transit', 'Under Maintenance', 'Retired', 'Disposed'];
export const STATUS_COLORS: Record<PortfolioStatus, string> = {
  Active: '#16a34a', Idle: '#2563eb', 'In Transit': '#7c3aed', 'Under Maintenance': '#f59e0b', Retired: '#64748b', Disposed: '#475569',
};
export const HEALTH_COLORS: Record<HealthBand, string> = { Healthy: '#16a34a', Warning: '#f5b324', Critical: '#ef4b5f', Unknown: '#a3adbd' };
export const AGE_BANDS: { band: AgeBand; label: string; color: string; min: number; max: number }[] = [
  { band: 'New', label: '0-2 years', color: '#1d8cf8', min: 0, max: 3 },
  { band: 'Mature', label: '3-5 years', color: '#22b55e', min: 3, max: 6 },
  { band: 'Aging', label: '6-10 years', color: '#f5b324', min: 6, max: 11 },
  { band: 'End of Life', label: '10+ years', color: '#ef4b5f', min: 11, max: 99 },
];
/** Sites with map coordinates; the easternmost site's card opens to the left. */
export const SITES: PortfolioSite[] = DEMO_SITES.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, card: s.id === 'site-dc' ? 'left' : 'right' }));

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const PORTFOLIO_STATUS: Record<DemoAsset['status'], PortfolioStatus> = {
  Active: 'Active', 'Under Maintenance': 'Under Maintenance', 'In Repair': 'Under Maintenance', 'Checked Out': 'In Transit', 'In Storage': 'Idle', Disposed: 'Disposed',
};

/** Book value: straight-line depreciation over 10 years, never below 20% of cost. */
function bookValue(a: DemoAsset): number {
  const years = ageYears(a.purchaseDate, new Date());
  return a.status === 'Disposed' ? 0 : Math.round(a.cost * Math.max(0.2, 1 - years / 10));
}

/** Asset portfolio: the demo register in the Asset Overview's shape. */
export const PORTFOLIO: PortfolioAsset[] = DEMO_ASSETS.map((a) => {
  const status = PORTFOLIO_STATUS[a.status];
  // assets in poor health that went into repair this month were still running 30 days ago
  const prevStatus: PortfolioStatus = status === 'Under Maintenance' && a.health < 50 ? 'Active' : status;
  return {
    id: a.tag, name: a.name, category: a.category, type: a.type, site: siteOf(a).name, status,
    health: a.health, criticality: a.criticality, value: bookValue(a), acquired: a.purchaseDate,
    manufacturer: a.manufacturer, model: a.model, serial: a.serial, owner: a.custodian, department: a.department,
    documents: a.documents.length, lastService: a.lastService, nextService: a.nextService,
    connected: !!a.device, lastUpdate: a.device ? demoLastSeen(a) : `${a.lastService || a.purchaseDate}T14:30`,
    prevStatus, prevHealth: a.prevHealth,
  };
});

export function healthBand(h: number | null): HealthBand {
  return h === null ? 'Unknown' : h >= 70 ? 'Healthy' : h >= 40 ? 'Warning' : 'Critical';
}

export function ageYears(acquired: string, asOf: Date): number {
  return (asOf.getTime() - new Date(acquired + 'T00:00').getTime()) / (365.25 * 86_400_000);
}
