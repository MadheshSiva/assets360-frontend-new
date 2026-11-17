// Compliance Analytics view model. Every figure comes from the Report Analytics API (/api/compliance-analytics);
// see compliance-analytics.service.ts. This file holds the UI shapes, fallbacks and the empty state.

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_AREAS = 'All areas';
export const ALL_REGULATIONS = 'All regulations';
export const ALL_RISK_LEVELS = 'All risk levels';

/** Fallbacks until /options answers (the API sends the same lists). */
export const COMPLIANCE_AREAS = ['Safety', 'Environmental', 'Quality', 'Maintenance', 'Operations'];
export const EXPIRY_TYPES = ['Permits', 'Certifications', 'Licenses', 'Other'];
export const CA_DEFAULT_PERIOD = 'This year';
export const CA_FALLBACK_PERIODS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'This year'];
export const SCORE_TARGET = 90;
export const CAPA_TARGET = 90;

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const RISK_LEVEL_VALUES: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];
export const LEVEL_RANK: Record<RiskLevel, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export const LEVEL_TONE: Record<RiskLevel, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };

export interface ComplianceFinding {
  /** Finding code (e.g. FND-2026-0082) */
  id: string;
  requirement: string;
  regulation: string;
  area: string;
  assetId: string;
  asset: string;
  site: string;
  severity: RiskLevel;
  /** Days until due (negative when overdue); null without a due date */
  dueInDays: number | null;
  due: string;
  owner: string;
  status: string;
  inspectionId: string | null;
  correctiveAction: string | null;
  workOrder: string | null;
}

export interface CapaAction {
  id: string;
  findingId: string;
  site: string;
  title: string;
  owner: string;
  dueInDays: number | null;
  due: string;
  daysOverdue: number;
}

export interface ExpiringItem {
  id: string;
  name: string;
  type: string;
  /** Where the record comes from: Calibration, Permit, Technician, Employee or Asset document */
  source: string;
  area: string;
  site: string;
  monthIndex: number;
  daysLeft: number;
  expires: string;
}

export interface ComplianceRisk {
  id: string;
  title: string;
  source: string;
  regulation: string;
  area: string;
  site: string;
  level: RiskLevel;
  owner: string;
}

export interface LocationRow {
  site: string;
  /** null when no compliance check fell due at the location in the period */
  score: number | null;
  environmental: number | null;
  openFindings: number;
  critical: number;
  expiring: number;
  risks: number;
  risk: 'Low' | 'Medium' | 'High';
  status: 'Compliant' | 'At Risk';
}

/** A KPI value with its change against the previous period ("percent" = relative change, "points" = difference). */
export interface CaKpiValue {
  value: number | null;
  change: number | null;
  unit: string;
}

export interface ComplianceView {
  generatedAt: string | null;
  scoreTarget: number;
  capaTarget: number;
  labels: string[];
  score: number | null;
  kpi: { score: CaKpiValue; findings: CaKpiValue; expiring: CaKpiValue; capa: CaKpiValue; risks: CaKpiValue };
  scoreSeries: { overall: number[]; regulatory: number[]; safety: number[]; environmental: number[]; previous: number[] };
  raised: Record<RiskLevel, number[]>;
  status: { compliant: number; partial: number; nonCompliant: number; notAssessed: number };
  areas: string[];
  areaCounts: number[];
  findings: ComplianceFinding[];
  findingsTotal: number;
  capaOpen: CapaAction[];
  capaOverdue: CapaAction[];
  capaClosed: number;
  capaRate: number | null;
  capaSeries: number[];
  expiryLabels: string[];
  expiryTypes: string[];
  expiring: ExpiringItem[];
  expiringSoon: ExpiringItem[];
  risks: ComplianceRisk[];
  locations: LocationRow[];
  environmental: { site: string; score: number | null }[];
}

const emptyKpi = (): CaKpiValue => ({ value: null, change: null, unit: 'percent' });

/** The page before the first answer, or when the API cannot be reached. */
export function emptyCompliance(): ComplianceView {
  return {
    generatedAt: null,
    scoreTarget: SCORE_TARGET,
    capaTarget: CAPA_TARGET,
    labels: [],
    score: null,
    kpi: { score: { ...emptyKpi(), unit: 'points' }, findings: emptyKpi(), expiring: emptyKpi(), capa: emptyKpi(), risks: emptyKpi() },
    scoreSeries: { overall: [], regulatory: [], safety: [], environmental: [], previous: [] },
    raised: { Critical: [], High: [], Medium: [], Low: [] },
    status: { compliant: 0, partial: 0, nonCompliant: 0, notAssessed: 0 },
    areas: COMPLIANCE_AREAS,
    areaCounts: COMPLIANCE_AREAS.map(() => 0),
    findings: [],
    findingsTotal: 0,
    capaOpen: [],
    capaOverdue: [],
    capaClosed: 0,
    capaRate: null,
    capaSeries: [],
    expiryLabels: [],
    expiryTypes: EXPIRY_TYPES,
    expiring: [],
    expiringSoon: [],
    risks: [],
    locations: [],
    environmental: []
  };
}
