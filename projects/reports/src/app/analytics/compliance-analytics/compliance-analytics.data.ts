import { AP_REGISTER } from '../asset-performance/asset-performance.data';
import { DEMO_PERIODS, DEMO_SITES, dayFromToday, formatDate, pickOf, rnd, rndInt } from '../asset-performance/kit/demo-data';
import { RA_PEOPLE } from '../shared/analytics-common';

// Compliance Analytics view model and its DEMO MODE records (aggregated in compliance-analytics.service.ts).

export const ALL_ORGANIZATIONS = 'All organizations';
export const ALL_LOCATIONS = 'All locations';
export const ALL_AREAS = 'All areas';
export const ALL_REGULATIONS = 'All regulations';
export const ALL_RISK_LEVELS = 'All risk levels';

/** Compliance areas, expiry types and period presets offered by the page. */
export const COMPLIANCE_AREAS = ['Safety', 'Environmental', 'Quality', 'Maintenance', 'Operations'];
export const EXPIRY_TYPES = ['Permits', 'Certifications', 'Licenses', 'Other'];
export const CA_DEFAULT_PERIOD = 'This year';
export const CA_FALLBACK_PERIODS = DEMO_PERIODS;
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

/** The page before the first load. */
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

// ----- DEMO MODE compliance records -----

export interface Regulation {
  name: string;
  area: string;
}

export const REGULATIONS: Regulation[] = [
  { name: 'ISO 45001:2018', area: 'Safety' },
  { name: 'OSHAD-SF Abu Dhabi', area: 'Safety' },
  { name: 'UAE Fire & Life Safety Code', area: 'Safety' },
  { name: 'ISO 14001:2015', area: 'Environmental' },
  { name: 'Dubai Municipality Environmental Code', area: 'Environmental' },
  { name: 'ISO 9001:2015', area: 'Quality' },
  { name: 'ISO 55001:2014', area: 'Maintenance' },
  { name: 'NFPA 70B', area: 'Maintenance' },
  { name: 'RTA Fleet Operations Standard', area: 'Operations' }
];

/** Requirement not met → the corrective action raised for it, per compliance area. */
const REQUIREMENTS: Record<string, [string, string][]> = {
  Safety: [
    ['Fire extinguisher monthly inspection overdue', 'Inspect and re-tag all fire extinguishers'],
    ['Emergency lighting duration test not recorded', 'Run the 3-hour emergency lighting test and log results'],
    ['Lifting equipment thorough examination certificate missing', 'Book a third-party lifting equipment examination'],
    ['Machine guarding incomplete on rotating equipment', 'Install fixed guards and update the risk assessment'],
    ['Permit-to-work not closed out after hot work', 'Close out open permits and brief supervisors'],
    ['PPE inspection records incomplete', 'Complete the PPE inspection register']
  ],
  Environmental: [
    ['Generator stack emissions test overdue', 'Commission the annual stack emissions test'],
    ['Waste oil consignment note missing', 'Recover consignment notes from the waste contractor'],
    ['Refrigerant leak check not logged', 'Perform F-gas leak checks and update the log'],
    ['Spill kit not stocked at fuel storage', 'Restock spill kits and add them to the weekly checklist'],
    ['Wastewater discharge sample overdue', 'Collect and submit the quarterly discharge sample']
  ],
  Quality: [
    ['Calibration certificate expired on test instrument', 'Send instruments for accredited calibration'],
    ['SOP revision issued without approval', 'Approve SOP revision through document control'],
    ['Nonconformance log not reviewed', 'Review open nonconformances in the monthly quality meeting']
  ],
  Maintenance: [
    ['Preventive maintenance compliance below 90%', 'Reschedule overdue PM work orders'],
    ['Pressure vessel statutory inspection overdue', 'Book the statutory pressure vessel inspection'],
    ['Electrical thermography survey overdue', 'Carry out the thermography survey on LV panels'],
    ['Asset criticality assessment out of date', 'Re-run the criticality assessment for the site']
  ],
  Operations: [
    ['Driver medical fitness certificate expired', 'Arrange driver medical assessments'],
    ['Vehicle telematics unit offline', 'Repair telematics units and verify tracking'],
    ['Operator competency record missing', 'Complete operator competency assessments']
  ]
};

/** How each site performs: compliance and environmental scores (%), and how many findings it carries. */
export const SITE_COMPLIANCE: Record<string, { score: number; environmental: number; findings: number }> = {
  'Dubai HQ': { score: 94.6, environmental: 93.1, findings: 9 },
  'Abu Dhabi Office': { score: 92.8, environmental: 91.4, findings: 7 },
  'Sharjah Facility': { score: 86.2, environmental: 84.7, findings: 11 },
  'Jebel Ali Warehouse': { score: 90.4, environmental: 87.9, findings: 10 },
  'Al Ain Depot': { score: 83.5, environmental: 86.2, findings: 9 },
  'Riyadh Office': { score: 91.7, environmental: 90.6, findings: 7 },
  'Doha Office': { score: 93.9, environmental: 92.2, findings: 4 },
  'London Office': { score: 97.1, environmental: 96.4, findings: 3 },
  'Singapore Office': { score: 96.2, environmental: 95.3, findings: 4 }
};

export interface CapaRecord extends CapaAction {
  area: string;
  regulation: string;
  severity: RiskLevel;
}

interface ExpiryTemplate {
  name: string;
  type: string;
  source: string;
  area: string;
}

const EXPIRY_TEMPLATES: ExpiryTemplate[] = [
  { name: 'Trade License', type: 'Licenses', source: 'Asset document', area: 'Operations' },
  { name: 'Civil Defence Completion Certificate', type: 'Certifications', source: 'Permit', area: 'Safety' },
  { name: 'Generator Operating Permit', type: 'Permits', source: 'Permit', area: 'Environmental' },
  { name: 'Forklift Operator Certificate', type: 'Certifications', source: 'Employee', area: 'Safety' },
  { name: 'Pressure Gauge Calibration', type: 'Certifications', source: 'Calibration', area: 'Quality' },
  { name: 'Refrigerant Handling License', type: 'Licenses', source: 'Technician', area: 'Environmental' },
  { name: 'Vehicle Registration', type: 'Licenses', source: 'Asset document', area: 'Operations' },
  { name: 'Elevator Safety Certificate', type: 'Certifications', source: 'Asset document', area: 'Safety' },
  { name: 'Environmental Permit', type: 'Permits', source: 'Permit', area: 'Environmental' },
  { name: 'Hot Work Permit (annual)', type: 'Permits', source: 'Permit', area: 'Safety' },
  { name: 'Equipment Insurance Certificate', type: 'Other', source: 'Asset document', area: 'Operations' },
  { name: 'HV Authorised Person Certificate', type: 'Certifications', source: 'Technician', area: 'Maintenance' },
  { name: 'Water Quality Test Report', type: 'Other', source: 'Asset document', area: 'Environmental' },
  { name: 'First Aid Certificate', type: 'Certifications', source: 'Employee', area: 'Safety' }
];

const RISK_TITLES: Record<string, string[]> = {
  Safety: ['Fire protection certification lapse', 'Working at height controls not verified', 'Contractor safety induction gaps', 'Confined space permit non-conformance'],
  Environmental: ['Hazardous waste storage non-conformance', 'Unlogged refrigerant top-ups', 'Diesel storage bund integrity'],
  Quality: ['Calibration backlog on QA instruments', 'Uncontrolled document versions in use'],
  Maintenance: ['Statutory inspection backlog', 'Critical spares below minimum stock', 'PM compliance trending down'],
  Operations: ['Fleet driver certification gaps', 'Telematics coverage below policy']
};

export interface ComplianceRecords {
  findings: ComplianceFinding[];
  capa: CapaRecord[];
  expiring: (ExpiringItem & { offset: number })[];
  risks: ComplianceRisk[];
}

const SEVERITY_BY_ROLL = (r: number): RiskLevel => (r < 0.1 ? 'Critical' : r < 0.35 ? 'High' : r < 0.75 ? 'Medium' : 'Low');
const OPEN_STATUSES = ['Open', 'In Progress', 'Under Review'];

/** Open findings with their CAPA, expiring permits and certifications, and the risk register for every site. */
function buildRecords(): ComplianceRecords {
  const findings: ComplianceFinding[] = [];
  const capa: CapaRecord[] = [];
  const expiring: (ExpiringItem & { offset: number })[] = [];
  const risks: ComplianceRisk[] = [];
  let k = 0;
  for (const site of DEMO_SITES) {
    const profile = SITE_COMPLIANCE[site.name];
    const assets = AP_REGISTER.filter((a) => a.site === site);
    for (let n = 0; n < profile.findings; n++, k++) {
      const area = COMPLIANCE_AREAS[(k * 2 + n) % COMPLIANCE_AREAS.length];
      const regs = REGULATIONS.filter((r) => r.area === area);
      const regulation = pickOf(regs, k, 21).name;
      const [requirement, action] = pickOf(REQUIREMENTS[area], k, 22);
      // Weaker sites carry more of the serious findings
      const severity = SEVERITY_BY_ROLL(Math.max(0, rnd(k, 23) - (95 - profile.score) * 0.02));
      const dueInDays = rndInt(k, 24, -28, 60);
      const asset = assets[(k * 7) % assets.length];
      const owner = pickOf(RA_PEOPLE, k, 25);
      const id = `FND-2026-${String(41 + k * 3).padStart(4, '0')}`;
      const hasCapa = rnd(k, 26) < 0.7;
      const capaId = `CAPA-2026-${String(118 + k).padStart(4, '0')}`;
      findings.push({
        id,
        requirement,
        regulation,
        area,
        assetId: asset.id,
        asset: asset.name,
        site: site.name,
        severity,
        dueInDays,
        due: formatDate(dayFromToday(dueInDays)),
        owner,
        status: dueInDays < 0 ? 'Overdue' : pickOf(OPEN_STATUSES, k, 27),
        inspectionId: `INS-2026-${String(1200 + k * 11).padStart(5, '0')}`,
        correctiveAction: hasCapa ? action : null,
        workOrder: hasCapa && rnd(k, 28) < 0.6 ? `WO-2026-${String(4800 + k * 13).padStart(6, '0')}` : null
      });
      if (hasCapa) {
        const capaDue = dueInDays + rndInt(k, 29, -10, 6);
        capa.push({
          id: capaId, findingId: id, site: site.name, title: action, owner, dueInDays: capaDue, due: formatDate(dayFromToday(capaDue)),
          daysOverdue: Math.max(0, -capaDue), area, regulation, severity
        });
      }
    }
    // Permits, certifications and licenses that expire in the next six months
    for (let n = 0; n < 6; n++) {
      const j = expiring.length;
      const t = EXPIRY_TEMPLATES[(j * 5 + n) % EXPIRY_TEMPLATES.length];
      const offset = rndInt(j, 31, 3, 175);
      const person = t.source === 'Employee' || t.source === 'Technician' ? ` – ${pickOf(RA_PEOPLE, j, 32)}` : ` – ${site.name}`;
      expiring.push({
        id: `${t.type === 'Permits' ? 'PRM' : t.type === 'Licenses' ? 'LIC' : t.type === 'Certifications' ? 'CRT' : 'DOC'}-${site.code}-${String(210 + j * 3).padStart(4, '0')}`,
        name: `${t.name}${person}`,
        type: t.type,
        source: t.source,
        area: t.area,
        site: site.name,
        monthIndex: 0,
        daysLeft: offset,
        expires: formatDate(dayFromToday(offset)),
        offset
      });
    }
  }
  // Risk register: more open risks where the score is weaker
  let r = 0;
  for (const site of DEMO_SITES) {
    const count = Math.max(1, Math.round((97 - SITE_COMPLIANCE[site.name].score) / 2.5));
    for (let n = 0; n < count; n++, r++) {
      const area = COMPLIANCE_AREAS[(r * 3 + n) % COMPLIANCE_AREAS.length];
      risks.push({
        id: `RSK-2026-${String(301 + r * 4).padStart(4, '0')}`,
        title: pickOf(RISK_TITLES[area], r, 41),
        source: pickOf(['Audit finding', 'Inspection', 'Risk assessment', 'Incident'], r, 42),
        regulation: pickOf(REGULATIONS.filter((x) => x.area === area), r, 43).name,
        area,
        site: site.name,
        level: SEVERITY_BY_ROLL(Math.max(0, rnd(r, 44) - 0.05)),
        owner: pickOf(RA_PEOPLE, r, 45)
      });
    }
  }
  return { findings, capa, expiring, risks };
}

export const COMPLIANCE_RECORDS: ComplianceRecords = buildRecords();
