/**
 * Types, config and helpers for the Asset Overview dashboard.
 * PORTFOLIO and SITES stay empty until the asset API is wired.
 */

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
  { name: 'Production Equipment', color: '#2f80ed', icon: 'factory' },
  { name: 'Vehicles & Fleet', color: '#2f6fe4', icon: 'truck' },
  { name: 'Facilities & Infrastructure', color: '#7c5cff', icon: 'building' },
  { name: 'IT & Network', color: '#14b8c4', icon: 'monitor' },
  { name: 'Tools & Instruments', color: '#f5b324', icon: 'wrench' },
  { name: 'Safety Equipment', color: '#ef4b5f', icon: 'hard-hat' },
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
/** Sites with map coordinates; filled from the API once wired. */
export const SITES: PortfolioSite[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Asset portfolio; empty until the asset API is wired. */
export const PORTFOLIO: PortfolioAsset[] = [];

export function healthBand(h: number | null): HealthBand {
  return h === null ? 'Unknown' : h >= 70 ? 'Healthy' : h >= 40 ? 'Warning' : 'Critical';
}

export function ageYears(acquired: string, asOf: Date): number {
  return (asOf.getTime() - new Date(acquired + 'T00:00').getTime()) / (365.25 * 86_400_000);
}
