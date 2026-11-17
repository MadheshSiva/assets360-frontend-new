// Compliance figures come from the reporting API; until it is wired up every widget renders empty.

export const COMPLIANCE_AREAS = ['Safety', 'Environmental', 'Quality', 'Maintenance', 'Operations'];
export const SCORE_TARGET = 90;
export const CAPA_TARGET = 90;

export interface Regulation {
  name: string;
  area: string;
  weight: number;
  requirements: string[];
}

/** Regulations / standards (to be loaded from Master Data Management > Compliance) */
export const REGULATIONS: Regulation[] = [];
export const REGULATION_OPTIONS = ['All regulations', ...REGULATIONS.map((r) => r.name)];
export const AREA_OPTIONS = ['All areas', ...COMPLIANCE_AREAS];
export const RISK_LEVELS = ['All risk levels', 'Critical', 'High', 'Medium', 'Low'];

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const LEVEL_RANK: Record<RiskLevel, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export const LEVEL_TONE: Record<RiskLevel, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };

export const EXPIRY_TYPES = ['Permits', 'Certifications', 'Licenses', 'Other'];
/** Upcoming expiry months (next 10 months from today); '\n' splits the axis label onto two lines. */
export const EXPIRY_LABELS: string[] = Array.from({ length: 10 }, (_, i) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
  return `${d.toLocaleDateString('en-GB', { month: 'short' })}\n${d.getFullYear()}`;
});

export interface ComplianceFinding {
  id: string;
  requirement: string;
  regulation: string;
  area: string;
  assetId: string;
  asset: string;
  site: string;
  severity: RiskLevel;
  month: number;
  dueInDays: number;
  due: string;
  owner: string;
  status: 'Open' | 'In Progress';
}

export interface CapaAction {
  id: string;
  finding: ComplianceFinding;
  title: string;
  owner: string;
  dueInDays: number;
  due: string;
}

export interface ExpiringItem {
  id: string;
  name: string;
  type: string;
  regulation: string;
  area: string;
  site: string;
  monthIndex: number;
  daysLeft: number;
  expires: string;
}

export interface ComplianceRisk {
  id: string;
  title: string;
  regulation: string;
  area: string;
  site: string;
  level: RiskLevel;
  owner: string;
}

export interface ComplianceFilters {
  period: string;
  organization: string;
  location: string;
  area: string;
  regulation: string;
  risk: string;
}

export interface LocationRow {
  site: string;
  score: number;
  openFindings: number;
  critical: number;
  expiring: number;
  risk: 'Low' | 'Medium' | 'High';
  status: 'Compliant' | 'At Risk';
}

export interface ComplianceView {
  labels: string[];
  score: number;
  scoreSeries: { overall: number[]; regulatory: number[]; safety: number[]; environmental: number[]; previous: number[] };
  raised: Record<RiskLevel, number[]>;
  status: { compliant: number; partial: number; nonCompliant: number; notAssessed: number };
  findings: ComplianceFinding[];
  capaOpen: CapaAction[];
  capaOverdue: CapaAction[];
  capaClosed: number;
  capaRate: number;
  capaSeries: number[];
  expiring: ExpiringItem[];
  expiringSoon: ExpiringItem[];
  risks: ComplianceRisk[];
  locations: LocationRow[];
  environmental: { site: string; score: number }[];
}

/** Empty view until the compliance reporting API is available. */
export function buildComplianceView(_f: ComplianceFilters): ComplianceView {
  return {
    labels: [],
    score: 0,
    scoreSeries: { overall: [], regulatory: [], safety: [], environmental: [], previous: [] },
    raised: { Critical: [], High: [], Medium: [], Low: [] },
    status: { compliant: 0, partial: 0, nonCompliant: 0, notAssessed: 0 },
    findings: [],
    capaOpen: [],
    capaOverdue: [],
    capaClosed: 0,
    capaRate: 0,
    capaSeries: [],
    expiring: [],
    expiringSoon: [],
    risks: [],
    locations: [],
    environmental: []
  };
}
