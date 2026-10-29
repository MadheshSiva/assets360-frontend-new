import { RA_MONTH_LABELS, RA_PEOPLE, assetId } from '../shared/analytics-common';
import { RA_METRICS } from '../shared/analytics-metrics';
import {
  RA_SITES, RaSite, dateFromOffset, formatDate, periodWindow, scale, siteWeight, sitesInScope, spread, total, weightedAverage
} from '../inspection-analytics/kit/scope';

// DEMO MODE: group-wide compliance figures for 01 Jan – 28 Oct 2026, scaled to the filters below.
// Unfiltered, the rows add up to RA_METRICS.compliance (93.6% score, 42 open audit findings, 18 certificates
// expiring within 90 days, 9 overdue CAPA, 16 active risks, 88.4% CAPA closure).

export const COMPLIANCE_AREAS = ['Safety', 'Environmental', 'Quality', 'Maintenance', 'Operations'];
const AREA_WEIGHTS: Record<string, number> = { Safety: 0.32, Environmental: 0.27, Quality: 0.17, Maintenance: 0.14, Operations: 0.1 };
/** Score per area for the full period; the group score is 93.6% */
const AREA_SCORES: Record<string, number> = { Safety: 92.4, Environmental: 90.9, Quality: 95.6, Maintenance: 94.1, Operations: 96.2 };
export const SCORE_TARGET = 90;
export const CAPA_TARGET = 90;

export interface Regulation {
  name: string;
  area: string;
  weight: number;
  requirements: string[];
}

/** UAE / KSA regulations and ISO standards (names follow Master Data Management > Compliance) */
export const REGULATIONS: Regulation[] = [
  { name: 'UAE Civil Defence Fire Code', area: 'Safety', weight: 0.14, requirements: ['Fire alarm quarterly test', 'Emergency lighting test', 'Sprinkler system inspection'] },
  { name: 'OSHAD-SF (Abu Dhabi)', area: 'Safety', weight: 0.09, requirements: ['Risk assessment review', 'Permit-to-work audit'] },
  { name: 'ISO 45001 Occupational H&S', area: 'Safety', weight: 0.09, requirements: ['Incident investigation record', 'PPE issue register'] },
  { name: 'Dubai Municipality Environmental', area: 'Environmental', weight: 0.15, requirements: ['Hazardous waste manifest', 'Generator emission test', 'Spill response drill'] },
  { name: 'ISO 14001 Environmental', area: 'Environmental', weight: 0.12, requirements: ['Aspect & impact register', 'Environmental objectives review'] },
  { name: 'ISO 9001 Quality', area: 'Quality', weight: 0.17, requirements: ['Calibration records', 'Document control review', 'Supplier evaluation'] },
  { name: 'Lifting Equipment (LOLER)', area: 'Maintenance', weight: 0.08, requirements: ['Thorough examination report', 'Load test certificate'] },
  { name: 'Pressure Equipment Certification', area: 'Maintenance', weight: 0.06, requirements: ['Pressure test certificate', 'Safety valve calibration'] },
  { name: 'Trade Licence & Operating Permits', area: 'Operations', weight: 0.1, requirements: ['Trade licence renewal', 'Operating permit conditions'] }
];
export const REGULATION_OPTIONS = ['All regulations', ...REGULATIONS.map((r) => r.name)];
export const AREA_OPTIONS = ['All areas', ...COMPLIANCE_AREAS];
export const RISK_LEVELS = ['All risk levels', 'Critical', 'High', 'Medium', 'Low'];

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const LEVEL_RANK: Record<RiskLevel, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export const LEVEL_TONE: Record<RiskLevel, string> = { Critical: 'red', High: 'pink', Medium: 'orange', Low: 'blue' };

/** Compliance score offset per site (pts) and the site's environmental compliance score */
const SITE_SCORE: Record<string, { offset: number; environmental: number }> = {
  'Dubai HQ': { offset: 1.6, environmental: 93.4 },
  'Abu Dhabi Office': { offset: 0.8, environmental: 92.1 },
  'Sharjah Facility': { offset: -1.0, environmental: 88.9 },
  'Riyadh Office': { offset: -1.6, environmental: 90.6 },
  'London Office': { offset: 2.4, environmental: 95.2 },
  'Singapore Office': { offset: 1.9, environmental: 94.8 },
  'Jebel Ali Warehouse': { offset: -3.2, environmental: 86.8 },
  'Al Ain Depot': { offset: -0.9, environmental: 91.3 }
};

/** Monthly score path: rises 0.6–0.7 pts a month to the period value */
const SCORE_RAMP = [5.4, 4.6, 3.9, 3.3, 2.6, 2.0, 1.4, 0.9, 0.4, 0];
const CAPA_CLOSURE = [80.2, 81.5, 82.4, 83.6, 84.1, 85.3, 86.0, 86.9, 87.7, 88.4];

/** Audit findings raised per month */
const FINDINGS_RAISED: Record<RiskLevel, number[]> = {
  Critical: [2, 1, 2, 1, 2, 1, 2, 1, 1, 1],
  High: [5, 6, 5, 7, 6, 8, 7, 9, 6, 5],
  Medium: [8, 9, 10, 9, 11, 12, 10, 14, 9, 8],
  Low: [6, 7, 6, 8, 7, 9, 8, 10, 7, 6]
};

/** Asset compliance status, group-wide (adds up to RA_METRICS.assets.total) */
const ASSET_STATUS = { compliant: 849, partial: 250, nonCompliant: 100, notAssessed: 49 };

export const EXPIRY_TYPES = ['Permits', 'Certifications', 'Licenses', 'Other'];
/** Upcoming expiry months Nov 2026 – Aug 2027 */
export const EXPIRY_LABELS = ['Nov\n2026', 'Dec\n2026', 'Jan\n2027', 'Feb\n2027', 'Mar\n2027', 'Apr\n2027', 'May\n2027', 'Jun\n2027', 'Jul\n2027', 'Aug\n2027'];
const EXPIRY_PER_MONTH = [7, 6, 5, 9, 12, 14, 10, 8, 6, 5];
/** Day offsets from 28 Oct 2026 where each expiry month starts */
const EXPIRY_MONTH_START = [4, 34, 65, 96, 124, 155, 185, 216, 246, 277];

const CERTIFICATES: Record<string, { name: string; type: string }[]> = {
  'UAE Civil Defence Fire Code': [{ name: 'Civil Defence Completion Certificate', type: 'Certifications' }, { name: 'Fire System AMC Certificate', type: 'Certifications' }],
  'OSHAD-SF (Abu Dhabi)': [{ name: 'OSHAD Compliance Certificate', type: 'Certifications' }],
  'ISO 45001 Occupational H&S': [{ name: 'ISO 45001 Certificate', type: 'Certifications' }],
  'Dubai Municipality Environmental': [{ name: 'Environmental Permit (DM)', type: 'Permits' }, { name: 'Waste Transport Permit', type: 'Permits' }],
  'ISO 14001 Environmental': [{ name: 'ISO 14001 Certificate', type: 'Certifications' }],
  'ISO 9001 Quality': [{ name: 'ISO 9001 Certificate', type: 'Certifications' }, { name: 'Calibration Lab Accreditation', type: 'Other' }],
  'Lifting Equipment (LOLER)': [{ name: 'Lifting Equipment Certificate', type: 'Certifications' }],
  'Pressure Equipment Certification': [{ name: 'Pressure Vessel Certificate', type: 'Certifications' }, { name: 'Boiler Operating Permit', type: 'Permits' }],
  'Trade Licence & Operating Permits': [{ name: 'Trade Licence', type: 'Licenses' }, { name: 'Generator Operating Permit', type: 'Permits' }, { name: 'Radio Equipment Licence (TDRA)', type: 'Licenses' }]
};

const ASSETS = ['Boiler B-1', 'Crane C-3', 'Generator G3', 'Tank T-2', 'Fuel Farm F-1', 'Fire Pump FP-2', 'Chiller CH-4', 'Forklift FL-09', 'Compressor AC-5', 'Switchgear SG-2'];

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

const SITE_ROWS_42: [RaSite, number][] = [[RA_SITES[0], 9], [RA_SITES[1], 6], [RA_SITES[2], 6], [RA_SITES[3], 5], [RA_SITES[4], 2], [RA_SITES[5], 2], [RA_SITES[6], 8], [RA_SITES[7], 4]];

function regulationsFor(area: string): Regulation[] {
  return REGULATIONS.filter((r) => r.area === area);
}

/** The 42 open audit findings */
export const OPEN_FINDINGS: ComplianceFinding[] = (() => {
  const n = RA_METRICS.compliance.openAuditFindings;
  const sites = spread(SITE_ROWS_42, 101);
  const areas = spread<string>([['Safety', 14], ['Environmental', 11], ['Quality', 7], ['Maintenance', 6], ['Operations', 4]], 103);
  const levels = spread<RiskLevel>([['Critical', 4], ['High', 12], ['Medium', 16], ['Low', 10]], 107);
  const months = spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m, i) => [m, [1, 2, 2, 3, 3, 4, 5, 6, 7, 9][i]] as [number, number]), 109);
  const rows: ComplianceFinding[] = [];
  for (let i = 0; i < n; i++) {
    const regs = regulationsFor(areas[i]);
    const reg = regs[i % regs.length];
    const dueInDays = i % 4 === 0 ? -(2 + (i % 11)) : 5 + ((i * 11) % 80);
    rows.push({
      id: `FND-2026-${String(2101 + i).padStart(6, '0')}`,
      requirement: reg.requirements[i % reg.requirements.length],
      regulation: reg.name,
      area: areas[i],
      assetId: assetId(sites[i].code, 600 + i * 11),
      asset: ASSETS[i % ASSETS.length],
      site: sites[i].name,
      severity: levels[i],
      month: months[i],
      dueInDays,
      due: formatDate(dateFromOffset(dueInDays)),
      owner: RA_PEOPLE[(i * 3 + 2) % RA_PEOPLE.length],
      status: i % 3 === 1 ? 'In Progress' : 'Open'
    });
  }
  return rows;
})();

/** Open CAPA actions (13): the first 9 are overdue. Closed CAPA in the period: 99. */
const CLOSED_CAPA = 99;
export const OPEN_CAPA: CapaAction[] = OPEN_FINDINGS.slice(0, 13).map((f, i) => {
  const dueInDays = i < RA_METRICS.compliance.overdueCapa ? -(3 + ((i * 5) % 21)) : 6 + i * 3;
  return {
    id: `CAPA-2026-${String(68 + i).padStart(4, '0')}`,
    finding: f,
    title: `${f.requirement} – corrective action`,
    owner: f.owner,
    dueInDays,
    due: formatDate(dateFromOffset(dueInDays))
  };
});

/** Permits, certificates and licences expiring in the next 10 months (18 within 90 days) */
export const EXPIRING: ExpiringItem[] = (() => {
  const rows: ExpiringItem[] = [];
  const sites = spread(RA_SITES.map((s, i) => [s, [12, 10, 10, 9, 6, 5, 18, 12][i]] as [RaSite, number]), 113);
  let k = 0;
  EXPIRY_PER_MONTH.forEach((count, m) => {
    for (let j = 0; j < count; j++, k++) {
      const reg = REGULATIONS[(k * 7) % REGULATIONS.length];
      const certs = CERTIFICATES[reg.name];
      const cert = certs[k % certs.length];
      const daysLeft = EXPIRY_MONTH_START[m] + Math.min(27, j * 4 + (k % 3));
      rows.push({
        id: `CRT-2026-${String(310 + k).padStart(4, '0')}`,
        name: cert.name,
        type: cert.type,
        regulation: reg.name,
        area: reg.area,
        site: sites[k % sites.length].name,
        monthIndex: m,
        daysLeft,
        expires: formatDate(dateFromOffset(daysLeft))
      });
    }
  });
  return rows;
})();

/** Active compliance risks (16) */
export const RISKS: ComplianceRisk[] = (() => {
  const titles = [
    'Fire system maintenance contract lapse', 'Hazardous waste stored beyond 90 days', 'Lifting gear without valid examination',
    'Expired pressure vessel certificate', 'Permit-to-work not closed out', 'Generator emissions above DM limit',
    'Calibration overdue on QA instruments', 'Trade licence renewal pending', 'Emergency drill not completed',
    'Contractor H&S induction gaps', 'Spill kit shortages at loading bay', 'Supplier audits overdue',
    'Asbestos survey outdated', 'Legionella risk assessment due', 'Noise exposure above action level', 'Incomplete incident records'
  ];
  const levels = spread<RiskLevel>([['Critical', 2], ['High', 5], ['Medium', 6], ['Low', 3]], 127);
  const sites = spread(RA_SITES.map((s, i) => [s, [3, 2, 2, 2, 1, 1, 3, 2][i]] as [RaSite, number]), 131);
  return titles.map((title, i) => {
    const reg = REGULATIONS[(i * 4) % REGULATIONS.length];
    return {
      id: `RSK-2026-${String(41 + i).padStart(4, '0')}`,
      title,
      regulation: reg.name,
      area: reg.area,
      site: sites[i].name,
      level: levels[i],
      owner: RA_PEOPLE[(i * 7 + 1) % RA_PEOPLE.length]
    };
  });
})();

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

export function buildComplianceView(f: ComplianceFilters): ComplianceView {
  const sites = sitesInScope(f.organization, f.location);
  const siteNames = sites.map((s) => s.name);
  const { start, end } = periodWindow(f.period);
  const reg = REGULATIONS.find((r) => r.name === f.regulation);
  const area = COMPLIANCE_AREAS.includes(f.area) ? f.area : '';
  const level = (RISK_LEVELS.indexOf(f.risk) > 0 ? f.risk : '') as RiskLevel | '';
  // A regulation outside the chosen area matches nothing
  const conflict = !!reg && !!area && reg.area !== area;
  const scopeShare = conflict ? 0 : reg ? reg.weight : area ? AREA_WEIGHTS[area] : 1;
  const factor = siteWeight(sites) * scopeShare;
  const hasData = factor > 0;

  const groupOffset = weightedAverage(RA_SITES, (s) => SITE_SCORE[s.name].offset);
  const siteOffset = (name: string) => SITE_SCORE[name].offset - groupOffset;
  const offset = weightedAverage(sites, (s) => siteOffset(s.name));
  const areaScore = area ? AREA_SCORES[area] : reg ? AREA_SCORES[reg.area] : RA_METRICS.compliance.score;
  const score = hasData ? Math.min(99.9, areaScore + offset) : 0;
  const ramp = SCORE_RAMP.slice(start, end);
  const line = (final: number) => ramp.map((r) => (hasData ? Number(Math.min(99.9, final + offset - r).toFixed(1)) : 0));

  const matches = (row: { site: string; regulation: string; area: string }) =>
    siteNames.includes(row.site) && (!reg || row.regulation === reg.name) && (!area || row.area === area);
  const findings = OPEN_FINDINGS.filter((r) => matches(r) && r.month >= start && r.month < end && (!level || r.severity === level));
  const findingIds = new Set(findings.map((r) => r.id));
  const capaOpen = OPEN_CAPA.filter((c) => findingIds.has(c.finding.id));
  const capaClosed = Math.round(CLOSED_CAPA * factor * (total(CAPA_CLOSURE.slice(start, end)) / total(CAPA_CLOSURE)) * (level ? 0.25 : 1));
  const capaTotal = capaClosed + capaOpen.length;
  const capaRate = capaTotal ? (capaClosed / capaTotal) * 100 : 0;
  const expiring = EXPIRING.filter(matches);
  const risks = RISKS.filter((r) => matches(r) && (!level || r.level === level));

  const raised = {} as Record<RiskLevel, number[]>;
  (['Critical', 'High', 'Medium', 'Low'] as RiskLevel[]).forEach((l) => {
    raised[l] = !level || level === l ? scale(FINDINGS_RAISED[l].slice(start, end), factor) : FINDINGS_RAISED[l].slice(start, end).map(() => 0);
  });

  const locations: LocationRow[] = sites.map((s) => {
    const siteScore = Number(Math.min(99.9, areaScore + siteOffset(s.name)).toFixed(1));
    const open = findings.filter((r) => r.site === s.name);
    const critical = open.filter((r) => r.severity === 'Critical').length;
    const risk = siteScore < SCORE_TARGET || critical > 1 ? 'High' : siteScore < 93 || critical ? 'Medium' : 'Low';
    return {
      site: s.name,
      score: siteScore,
      openFindings: open.length,
      critical,
      expiring: expiring.filter((e) => e.site === s.name && e.daysLeft <= 90).length,
      risk,
      status: risk === 'High' ? 'At Risk' : 'Compliant'
    };
  });

  return {
    labels: RA_MONTH_LABELS.slice(start, end),
    score,
    scoreSeries: {
      overall: line(areaScore),
      regulatory: line(Math.min(99, areaScore + 1.2)),
      safety: line(AREA_SCORES['Safety'] + (areaScore - RA_METRICS.compliance.score)),
      environmental: line(AREA_SCORES['Environmental'] + (areaScore - RA_METRICS.compliance.score)),
      previous: line(areaScore - 2.2)
    },
    raised,
    status: {
      compliant: Math.round(ASSET_STATUS.compliant * factor),
      partial: Math.round(ASSET_STATUS.partial * factor),
      nonCompliant: Math.round(ASSET_STATUS.nonCompliant * factor),
      notAssessed: Math.round(ASSET_STATUS.notAssessed * factor)
    },
    findings,
    capaOpen,
    capaOverdue: capaOpen.filter((c) => c.dueInDays < 0),
    capaClosed,
    capaRate,
    capaSeries: CAPA_CLOSURE.slice(start, end).map((v) => (hasData ? Number(Math.min(99.9, v + offset / 2).toFixed(1)) : 0)),
    expiring,
    expiringSoon: expiring.filter((e) => e.daysLeft <= 90),
    risks,
    locations,
    environmental: sites.map((s) => ({ site: s.name, score: SITE_SCORE[s.name].environmental }))
  };
}
