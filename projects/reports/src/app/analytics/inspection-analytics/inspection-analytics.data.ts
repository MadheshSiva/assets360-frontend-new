// Inspection figures come from the reporting API; until it is wired up every widget renders empty.

export const INSPECTION_TYPES = [
  'All inspection types', 'Preventive Inspection', 'Safety Inspection', 'Statutory / Regulatory',
  'Fire & Life Safety (UAE Civil Defence)', 'Lifting Equipment (LOLER)', 'Pre-use Checklist'
];

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

/** Inspectors (to be loaded from the people / user API) */
export const INSPECTORS: Inspector[] = [];
export const INSPECTOR_OPTIONS = ['All inspectors', ...INSPECTORS.map((i) => i.name)];

export const FINDING_TYPES = ['Electrical', 'Mechanical', 'Safety', 'Environmental', 'Documentation'];

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

/** Empty view until the inspection reporting API is available. */
export function buildInspectionView(_f: InspectionFilters): InspectionView {
  return {
    labels: [],
    planned: [],
    completed: [],
    completedPrevious: [],
    overdue: [],
    status: { completed: 0, inProgress: 0, scheduled: 0, overdue: 0 },
    totalInspections: 0,
    completionRate: 0,
    rateSeries: [],
    severity: { Critical: [], High: [], Medium: [], Low: [] },
    byFindingType: FINDING_TYPES.map(() => 0),
    repeated: [],
    resolved: [],
    findings: [],
    critical: 0,
    actionsDue: 0,
    inspectors: [],
    siteSafety: []
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
