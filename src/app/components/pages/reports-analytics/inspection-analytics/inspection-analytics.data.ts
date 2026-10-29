import { RA_CATEGORIES, RA_MONTH_LABELS, RA_PEOPLE, assetId } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import {
  RA_SITES, RaSite, dateFromOffset, formatDate, periodWindow, scale, siteWeight, sitesInScope, spread, total, weightedAverage
} from './kit/scope';

// DEMO MODE: group-wide inspection figures for 01 Jan – 28 Oct 2026, scaled to the filters below.
// Monthly arrays add up to the headline numbers in RA_METRICS.inspection (3,486 inspections, 94.2% completion,
// 128 open findings, 12 critical, 34 corrective actions due within 7 days).

export const INSPECTION_TYPES = [
  'All inspection types', 'Preventive Inspection', 'Safety Inspection', 'Statutory / Regulatory',
  'Fire & Life Safety (UAE Civil Defence)', 'Lifting Equipment (LOLER)', 'Pre-use Checklist'
];
const TYPE_WEIGHTS = [0.34, 0.24, 0.14, 0.1, 0.08, 0.1];
const TYPE_ROWS = [44, 31, 18, 13, 10, 12];

/** Share of inspections per RA_CATEGORIES entry */
const CATEGORY_WEIGHTS = [0.18, 0.22, 0.17, 0.08, 0.14, 0.13, 0.08];
const CATEGORY_ROWS = [23, 28, 22, 10, 18, 17, 10];

export interface Inspector {
  name: string;
  /** Inspections completed in the full period, group-wide */
  completed: number;
  avgHours: number;
  findingRate: number;
  closureRate: number;
  /** Open findings raised by this inspector */
  openRows: number;
}

export const INSPECTORS: Inspector[] = [
  { name: 'Michael Chen', completed: 486, avgHours: 2.4, findingRate: 8, closureRate: 95, openRows: 21 },
  { name: 'Sarah Khan', completed: 452, avgHours: 2.7, findingRate: 10, closureRate: 92, openRows: 19 },
  { name: 'Ahmed Khan', completed: 448, avgHours: 2.3, findingRate: 9, closureRate: 90, openRows: 19 },
  { name: 'Fatima Noor', completed: 424, avgHours: 2.6, findingRate: 11, closureRate: 87, openRows: 19 },
  { name: 'Daniel Kim', completed: 420, avgHours: 2.1, findingRate: 12, closureRate: 88, openRows: 18 },
  { name: 'Priya Nair', completed: 398, avgHours: 2.9, findingRate: 9, closureRate: 85, openRows: 17 },
  { name: 'James Wilson', completed: 356, avgHours: 2.5, findingRate: 11, closureRate: 82, openRows: 15 }
];
export const INSPECTOR_OPTIONS = ['All inspectors', ...INSPECTORS.map((i) => i.name)];

/** Inspection plan per month (sums to 3,486) and its outcome */
const PLANNED = [262, 285, 301, 318, 334, 352, 370, 392, 420, 452];
const OVERDUE = [13, 16, 14, 17, 15, 18, 17, 18, 15, 3];
const IN_PROGRESS = [3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
const SCHEDULED = [0, 0, 0, 0, 0, 0, 0, 0, 0, 318];
const COMPLETED = PLANNED.map((p, i) => p - OVERDUE[i] - IN_PROGRESS[i] - SCHEDULED[i]);
/** Same months of 2025, for Compare Periods */
const COMPLETED_PREVIOUS = COMPLETED.map((c, i) => Math.round(c * (0.84 + (i % 3) * 0.02)));

/** Findings raised per month by severity */
const SEVERITY_SERIES = {
  Critical: [3, 2, 2, 1, 2, 2, 1, 2, 1, 2],
  High: [8, 7, 9, 8, 10, 9, 8, 9, 7, 8],
  Medium: [12, 11, 13, 12, 14, 13, 12, 14, 12, 13],
  Low: [8, 7, 8, 7, 9, 8, 7, 8, 6, 7]
};

export const FINDING_TYPES = ['Electrical', 'Mechanical', 'Safety', 'Environmental', 'Documentation'];
const FINDING_TYPE_SHARE = [0.33, 0.25, 0.21, 0.12, 0.09];

const REPEATED = [22, 25, 27, 28, 30, 32, 34, 35, 33, 31];
const RESOLVED = [10, 11, 12, 13, 14, 15, 16, 18, 19, 21];

/** Completion-rate offset (pts) and safety-inspection compliance per site */
const SITE_RATE: Record<string, { offset: number; safety: number }> = {
  'Dubai HQ': { offset: 0.9, safety: 95.8 },
  'Abu Dhabi Office': { offset: 0.4, safety: 94.1 },
  'Sharjah Facility': { offset: -1.2, safety: 91.6 },
  'Riyadh Office': { offset: -0.6, safety: 92.8 },
  'London Office': { offset: 1.5, safety: 97.2 },
  'Singapore Office': { offset: 1.1, safety: 96.4 },
  'Jebel Ali Warehouse': { offset: -2.6, safety: 87.4 },
  'Al Ain Depot': { offset: -1.9, safety: 88.9 }
};
export const SAFETY_TARGET = 90;
export const COMPLIANCE_TARGET = 90;

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export const SEVERITY_RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export const SEVERITY_TONE: Record<Severity, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };

export interface InspectionFinding {
  id: string;
  assetId: string;
  assetName: string;
  site: string;
  category: string;
  findingType: string;
  inspectionType: string;
  severity: Severity;
  /** Index into RA_MONTHS of the inspection that raised it */
  month: number;
  dueInDays: number;
  due: string;
  owner: string;
  inspector: string;
  status: 'Open' | 'In Progress';
}

const ASSET_NAMES: Record<string, string[]> = {
  Vehicles: ['Forklift FL-12', 'Delivery Van DV-07', 'Pickup Truck PT-03'],
  Machinery: ['Conveyor CV-4', 'Pump P-16', 'Air Compressor AC-2', 'Overhead Crane OC-1'],
  Facilities: ['Fire Door FD-21', 'Passenger Lift EL-2', 'Roof Access RA-1'],
  'IT Equipment': ['Server Rack SR-08', 'UPS Unit UPS-3'],
  HVAC: ['Chiller CH-1', 'Air Handling Unit AHU-07', 'HVAC Unit 3'],
  'Power & Electrical': ['Generator G-200', 'MV Switchgear SG-4', 'Distribution Board DB-11'],
  'Safety & PPE': ['Fire Extinguisher Bank FE-12', 'Gas Detector GD-5', 'Fall Arrest Kit FA-3']
};

/** Assets with repeat findings: [rows, site, category, name, asset number] */
const RECURRING: [number[], string, string, string, number][] = [
  [[5, 48, 91], 'Dubai HQ', 'HVAC', 'Chiller CH-1', 112],
  [[17, 60], 'Jebel Ali Warehouse', 'Power & Electrical', 'Generator G-200', 247],
  [[30, 73, 116], 'Sharjah Facility', 'Machinery', 'Conveyor CV-4', 318]
];

/** The 128 open findings, generated deterministically */
export const OPEN_FINDINGS: InspectionFinding[] = buildFindings();

function buildFindings(): InspectionFinding[] {
  const n = RA_METRICS.inspection.openFindings;
  const sites = spread<RaSite>([[RA_SITES[0], 28], [RA_SITES[1], 20], [RA_SITES[2], 18], [RA_SITES[3], 15], [RA_SITES[4], 8], [RA_SITES[5], 6], [RA_SITES[6], 20], [RA_SITES[7], 13]], 11);
  const categories = spread(RA_CATEGORIES.map((c, i) => [c, CATEGORY_ROWS[i]] as [string, number]), 23);
  const types = spread(INSPECTION_TYPES.slice(1).map((t, i) => [t, TYPE_ROWS[i]] as [string, number]), 37);
  const inspectors = spread(INSPECTORS.map((p) => [p.name, p.openRows] as [string, number]), 41);
  const severities = spread<Severity>([['Critical', 12], ['High', 34], ['Medium', 52], ['Low', 30]], 53);
  const findingTypes = spread(FINDING_TYPES.map((t, i) => [t, [42, 32, 27, 15, 12][i]] as [string, number]), 67);
  const months = spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m, i) => [m, [4, 5, 6, 8, 9, 11, 14, 18, 24, 29][i]] as [number, number]), 79);

  const rows: InspectionFinding[] = [];
  for (let i = 0; i < n; i++) {
    let site = sites[i];
    let category = categories[i];
    const names = ASSET_NAMES[category];
    let assetName = names[i % names.length];
    let number = 400 + i * 7;
    for (const [idx, siteName, cat, name, num] of RECURRING) {
      if (idx.includes(i)) {
        site = RA_SITES.find((s) => s.name === siteName) ?? site;
        category = cat;
        assetName = name;
        number = num;
      }
    }
    // The first 34 findings carry corrective actions due within 7 days; every fifth of the rest is overdue
    const dueInDays = i < RA_METRICS.inspection.correctiveActionsDue ? i % 8 : i % 5 === 0 ? -(1 + (i % 9)) : 8 + ((i * 13) % 45);
    rows.push({
      id: `FND-2026-${String(1042 - i).padStart(6, '0')}`,
      assetId: assetId(site.code, number),
      assetName,
      site: site.name,
      category,
      findingType: findingTypes[i],
      inspectionType: types[i],
      severity: severities[i],
      month: months[i],
      dueInDays,
      due: formatDate(dateFromOffset(dueInDays)),
      owner: RA_PEOPLE[(i * 5) % RA_PEOPLE.length],
      inspector: inspectors[i],
      status: i % 3 === 0 ? 'In Progress' : 'Open'
    });
  }
  return rows;
}

export interface InspectionFilters {
  period: string;
  organization: string;
  location: string;
  category: string;
  type: string;
  inspector: string;
}

export interface InspectorRow {
  name: string;
  inspections: number;
  avgHours: number;
  findingRate: number;
  closureRate: number;
}

export interface SiteSafety {
  site: string;
  safety: number;
}

export interface InspectionView {
  labels: string[];
  planned: number[];
  completed: number[];
  completedPrevious: number[];
  overdue: number[];
  status: { completed: number; inProgress: number; scheduled: number; overdue: number };
  totalInspections: number;
  completionRate: number;
  rateSeries: number[];
  severity: Record<Severity, number[]>;
  byFindingType: number[];
  repeated: number[];
  resolved: number[];
  findings: InspectionFinding[];
  critical: number;
  actionsDue: number;
  inspectors: InspectorRow[];
  siteSafety: SiteSafety[];
}

function rate(completed: number, overdue: number, inProgress: number): number {
  const due = completed + overdue + inProgress;
  return due ? (completed / due) * 100 : 0;
}

/** Splits a total by shares so the parts add back up to the total. */
function split(totalValue: number, shares: number[]): number[] {
  const parts = shares.map((s) => Math.floor(totalValue * s));
  let rest = totalValue - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % parts.length, rest--) parts[i]++;
  return parts;
}

export function buildInspectionView(f: InspectionFilters): InspectionView {
  const sites = sitesInScope(f.organization, f.location);
  const siteNames = sites.map((s) => s.name);
  const { start, end } = periodWindow(f.period);
  const catIndex = RA_CATEGORIES.indexOf(f.category);
  const typeIndex = INSPECTION_TYPES.indexOf(f.type) - 1;
  const inspector = INSPECTORS.find((p) => p.name === f.inspector);
  const completedTotal = total(COMPLETED);
  const factor =
    siteWeight(sites) *
    (catIndex >= 0 ? CATEGORY_WEIGHTS[catIndex] : 1) *
    (typeIndex >= 0 ? TYPE_WEIGHTS[typeIndex] : 1) *
    (inspector ? inspector.completed / completedTotal : 1);
  const win = (values: number[]) => scale(values.slice(start, end), factor);
  // Relative to the group average so "All locations" reads exactly the group figure
  const offset = weightedAverage(sites, (s) => SITE_RATE[s.name].offset) - weightedAverage(RA_SITES, (s) => SITE_RATE[s.name].offset);

  const planned = win(PLANNED);
  const completed = win(COMPLETED);
  const overdue = win(OVERDUE);
  const inProgress = win(IN_PROGRESS);
  const scheduled = win(SCHEDULED);
  const status = { completed: total(completed), inProgress: total(inProgress), scheduled: total(scheduled), overdue: total(overdue) };
  const exactRate = rate(total(COMPLETED.slice(start, end)), total(OVERDUE.slice(start, end)), total(IN_PROGRESS.slice(start, end)));
  const hasData = factor > 0;
  const rateSeries = RA_MONTH_LABELS.slice(start, end).map((_, k) =>
    hasData ? Number(Math.min(99.9, rate(COMPLETED[start + k], OVERDUE[start + k], IN_PROGRESS[start + k]) + offset).toFixed(1)) : 0
  );

  const severity = {
    Critical: win(SEVERITY_SERIES.Critical),
    High: win(SEVERITY_SERIES.High),
    Medium: win(SEVERITY_SERIES.Medium),
    Low: win(SEVERITY_SERIES.Low)
  };
  const raised = total(severity.Critical) + total(severity.High) + total(severity.Medium) + total(severity.Low);

  const findings = OPEN_FINDINGS.filter(
    (r) =>
      siteNames.includes(r.site) &&
      r.month >= start &&
      r.month < end &&
      (catIndex < 0 || r.category === f.category) &&
      (typeIndex < 0 || r.inspectionType === f.type) &&
      (!inspector || r.inspector === inspector.name)
  );

  const inspectorFactor = siteWeight(sites) * (catIndex >= 0 ? CATEGORY_WEIGHTS[catIndex] : 1) * (typeIndex >= 0 ? TYPE_WEIGHTS[typeIndex] : 1);
  const periodShare = total(COMPLETED.slice(start, end)) / completedTotal;
  const inspectors = INSPECTORS.filter((p) => !inspector || p === inspector).map((p) => ({
    name: p.name,
    inspections: Math.round(p.completed * inspectorFactor * periodShare),
    avgHours: p.avgHours,
    findingRate: p.findingRate,
    closureRate: p.closureRate
  }));

  return {
    labels: RA_MONTH_LABELS.slice(start, end),
    planned,
    completed,
    completedPrevious: win(COMPLETED_PREVIOUS),
    overdue,
    status,
    totalInspections: total(planned),
    completionRate: hasData ? Math.min(99.9, exactRate + offset) : 0,
    rateSeries,
    severity,
    byFindingType: split(raised, FINDING_TYPE_SHARE),
    repeated: win(REPEATED),
    resolved: win(RESOLVED),
    findings,
    critical: findings.filter((r) => r.severity === 'Critical').length,
    actionsDue: findings.filter((r) => r.dueInDays >= 0 && r.dueInDays <= 7).length,
    inspectors,
    siteSafety: sites.map((s) => ({ site: s.name, safety: SITE_RATE[s.name].safety }))
  };
}

/** Assets that appear on more than one open finding. */
export function recurringAssets(findings: InspectionFinding[]): { assetId: string; assetName: string; site: string; count: number }[] {
  const map = new Map<string, { assetId: string; assetName: string; site: string; count: number }>();
  for (const r of findings) {
    const entry = map.get(r.assetId) ?? { assetId: r.assetId, assetName: r.assetName, site: r.site, count: 0 };
    entry.count++;
    map.set(r.assetId, entry);
  }
  return [...map.values()].filter((a) => a.count > 1).sort((a, b) => b.count - a.count);
}
