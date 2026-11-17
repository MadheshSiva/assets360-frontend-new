import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AP_REGISTER } from '../asset-performance/asset-performance.data';
import {
  CURRENT, DEMO_ORGANIZATIONS, DEMO_SITES, drifted, formatDate, mean, monthAxisLabel, monthStart, pctChange, periodMonths, periodWeight, previousMonths,
  rnd, round1, siteInScope, sum
} from '../asset-performance/kit/demo-data';
import { downloadCsv } from '../shared/analytics-common';
import {
  ALL_AREAS, ALL_LOCATIONS, ALL_ORGANIZATIONS, ALL_REGULATIONS, ALL_RISK_LEVELS, CA_DEFAULT_PERIOD, CA_FALLBACK_PERIODS, CAPA_TARGET, COMPLIANCE_AREAS,
  COMPLIANCE_RECORDS, ComplianceView, EXPIRY_TYPES, ExpiringItem, LocationRow, REGULATIONS, RISK_LEVEL_VALUES, RiskLevel, SCORE_TARGET, SITE_COMPLIANCE,
  emptyCompliance
} from './compliance-analytics.data';

// ----- UI shapes -----

/** The filter bar as the page holds it ("All …" means no filter). */
export interface CaFilters {
  period: string;
  organization: string;
  location: string;
  area: string;
  regulation: string;
  risk: string;
}

export interface CaOptions {
  periods: string[];
  defaultPeriod: string;
  areas: string[];
  riskLevels: string[];
}

export interface CaFilterLists {
  organizations: string[];
  locations: string[];
  regulations: string[];
}

export interface CaSavedView {
  viewId: string;
  name: string;
  builtIn: boolean;
  isDefault: boolean;
  filters: CaFilters;
}

/** "Create action plan" form plus what it was raised from. */
export interface CaActionPlanRequest {
  title: string;
  owner: string;
  due: string;
  priority: string;
  notes: string;
  context: string;
  sourceType: 'finding' | 'insight' | 'location' | 'kpi' | 'other';
  sourceId: string | null;
  location: string | null;
  regulation: string | null;
}

export interface CaActionPlan {
  id: string;
  title: string;
  owner: string;
  due: string;
  priority: string;
  status: string;
}

/** Months shown on the expiry chart: this month and the next five. */
const EXPIRY_MONTHS = 6;
/** Share of findings raised per month at each severity. */
const SEVERITY_SHARE: Record<RiskLevel, number> = { Critical: 0.1, High: 0.25, Medium: 0.4, Low: 0.25 };

const DEFAULT_FILTERS: CaFilters = {
  period: CA_DEFAULT_PERIOD, organization: ALL_ORGANIZATIONS, location: ALL_LOCATIONS, area: ALL_AREAS, regulation: ALL_REGULATIONS, risk: ALL_RISK_LEVELS
};

const matches = (value: string, filter: string, all: string) => !filter || filter === all || value === filter;

/** Asset-weighted compliance score of the sites in scope, for one month. */
function siteScore(sites: string[], key: 'score' | 'environmental', month: number, salt: number): number | null {
  if (!sites.length) return null;
  const weights = sites.map((s) => AP_REGISTER.filter((a) => a.site.name === s).length || 1);
  const values = sites.map((s) => SITE_COMPLIANCE[s][key]);
  const current = sum(values.map((v, i) => v * weights[i])) / sum(weights);
  return round1(Math.min(100, drifted(current, month, 0.32, 0.5, salt)));
}

function buildView(f: CaFilters): ComplianceView {
  const records = COMPLIANCE_RECORDS;
  const sites = DEMO_SITES.map((s) => s.name).filter((s) => siteInScope(s, f.organization, f.location));
  const inSite = (site: string) => sites.includes(site);
  const months = periodMonths(f.period);
  const previous = previousMonths(f.period);
  const weight = periodWeight(f.period);

  const findings = records.findings
    .filter((x) => inSite(x.site) && matches(x.area, f.area, ALL_AREAS) && matches(x.regulation, f.regulation, ALL_REGULATIONS) && matches(x.severity, f.risk, ALL_RISK_LEVELS))
    .sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0));
  const capa = records.capa
    .filter((x) => inSite(x.site) && matches(x.area, f.area, ALL_AREAS) && matches(x.regulation, f.regulation, ALL_REGULATIONS) && matches(x.severity, f.risk, ALL_RISK_LEVELS))
    .sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0));
  const risks = records.risks.filter((x) => inSite(x.site) && matches(x.area, f.area, ALL_AREAS) && matches(x.regulation, f.regulation, ALL_REGULATIONS)
    && matches(x.level, f.risk, ALL_RISK_LEVELS));
  const thisMonth = monthStart(CURRENT);
  const expiring: ExpiringItem[] = records.expiring
    .filter((x) => inSite(x.site) && matches(x.area, f.area, ALL_AREAS))
    .map(({ offset, ...item }) => {
      const d = new Date(Date.now() + offset * 86_400_000);
      const monthIndex = (d.getUTCFullYear() - thisMonth.getUTCFullYear()) * 12 + d.getUTCMonth() - thisMonth.getUTCMonth();
      return { ...item, monthIndex };
    })
    .filter((x) => x.monthIndex < EXPIRY_MONTHS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const expiringSoon = expiring.filter((e) => e.daysLeft <= 90);

  // Score trend: the latest month is today's score; earlier months were a little lower
  const score = (m: number, salt: number, key: 'score' | 'environmental' = 'score', shift = 0) => {
    const v = siteScore(sites, key, m, salt);
    return v === null ? 0 : round1(Math.min(100, v + shift));
  };
  const overall = months.map((m) => score(m, 51));
  const prevOverall = previous.map((m) => score(m, 51));
  const currentScore = sites.length ? siteScore(sites, 'score', CURRENT, 51) : null;

  // Findings raised per month, by severity
  const perMonth = Math.max(2, findings.length / 5);
  const raised = {} as Record<RiskLevel, number[]>;
  RISK_LEVEL_VALUES.forEach((l, li) => {
    const share = matches(l, f.risk, ALL_RISK_LEVELS) ? SEVERITY_SHARE[l] : 0;
    raised[l] = months.map((m) => (findings.length ? Math.round(perMonth * share * (0.7 + rnd(m, 60 + li) * 0.6) * (1 + (CURRENT - m) * 0.03) * weight) : 0));
  });

  // Compliance status of the assets in scope: open Critical/High findings make an asset non-compliant, other findings partially compliant
  const assets = AP_REGISTER.filter((a) => inSite(a.site.name));
  const worst = new Map<string, RiskLevel>();
  for (const x of findings) {
    const was = worst.get(x.assetId);
    if (!was || RISK_LEVEL_VALUES.indexOf(x.severity) < RISK_LEVEL_VALUES.indexOf(was)) worst.set(x.assetId, x.severity);
  }
  const status = { compliant: 0, partial: 0, nonCompliant: 0, notAssessed: 0 };
  for (const a of assets) {
    const w = worst.get(a.id);
    if (w === 'Critical' || w === 'High') status.nonCompliant++;
    else if (w) status.partial++;
    else if (a.health === null) status.notAssessed++;
    else status.compliant++;
  }

  // CAPA closure: rate per month around 85%, improving through the year
  const capaRateAt = (m: number) => round1(Math.min(99, drifted(capa.length ? 87.4 : 100, m, 0.45, 1.6, 71)));
  const capaSeries = months.map(capaRateAt);
  const capaRate = round1(mean(capaSeries));
  const capaOpen = capa.map(({ area: _a, regulation: _r, severity: _s, ...c }) => c);
  const capaClosed = capa.length ? Math.round(capa.length * 0.55 * months.length * weight) : 0;
  const capaOverdue = capaOpen.filter((c) => c.dueInDays !== null && c.dueInDays < 0);

  const locations: LocationRow[] = sites.map((s) => {
    const list = findings.filter((x) => x.site === s);
    const critical = list.filter((x) => x.severity === 'Critical').length;
    const siteRisks = risks.filter((x) => x.site === s);
    const value = SITE_COMPLIANCE[s].score;
    return {
      site: s,
      score: value,
      environmental: SITE_COMPLIANCE[s].environmental,
      openFindings: list.length,
      critical,
      expiring: expiringSoon.filter((e) => e.site === s).length,
      risks: siteRisks.length,
      risk: critical >= 2 || value < 88 ? 'High' : critical || value < SCORE_TARGET + 3 || siteRisks.some((x) => x.level === 'Critical') ? 'Medium' : 'Low',
      status: value >= SCORE_TARGET && critical < 2 ? 'Compliant' : 'At Risk'
    };
  });

  const scale = Math.max(1, months.length / 3);
  const kpiCount = (value: number, growth: number) => ({ value, change: pctChange(value, Math.max(1, Math.round(value * (1 + growth * scale)))), unit: 'percent' });
  const prevScore = prevOverall.length ? mean(prevOverall) : null;

  return {
    generatedAt: new Date().toISOString(),
    scoreTarget: SCORE_TARGET,
    capaTarget: CAPA_TARGET,
    labels: months.map(monthAxisLabel),
    score: currentScore,
    kpi: {
      score: { value: currentScore, change: currentScore === null || prevScore === null ? null : round1(mean(overall) - prevScore), unit: 'points' },
      findings: kpiCount(findings.length, 0.08),
      expiring: kpiCount(expiringSoon.length, -0.06),
      capa: kpiCount(capaOverdue.length, 0.12),
      risks: kpiCount(risks.length, 0.05)
    },
    scoreSeries: {
      overall,
      regulatory: months.map((m) => score(m, 52, 'score', 1.4)),
      safety: months.map((m) => score(m, 53, 'score', -1.1)),
      environmental: months.map((m) => score(m, 54, 'environmental')),
      previous: months.map((_, i) => prevOverall[i] ?? 0)
    },
    raised,
    status,
    areas: COMPLIANCE_AREAS,
    areaCounts: COMPLIANCE_AREAS.map((a) => findings.filter((x) => x.area === a).length),
    findings,
    findingsTotal: findings.length,
    capaOpen,
    capaOverdue,
    capaClosed,
    capaRate: capa.length || capaClosed ? capaRate : null,
    capaSeries,
    expiryLabels: Array.from({ length: EXPIRY_MONTHS }, (_, i) => monthAxisLabel(CURRENT + i)),
    expiryTypes: EXPIRY_TYPES,
    expiring,
    expiringSoon,
    risks,
    locations,
    environmental: sites.map((s) => ({ site: s, score: SITE_COMPLIANCE[s].environmental }))
  };
}

/** DEMO MODE: Compliance Analytics figures, filters, saved views and action plans built in the browser from static records. */
@Injectable()
export class ComplianceAnalyticsService {
  readonly view = signal<ComplianceView>(emptyCompliance());
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly periods = signal<string[]>(CA_FALLBACK_PERIODS);

  private views: CaSavedView[] = [
    { viewId: 'all-compliance', name: 'All Compliance', builtIn: true, isDefault: false, filters: { ...DEFAULT_FILTERS } },
    { viewId: 'view-uae-safety', name: 'UAE Safety', builtIn: false, isDefault: false, filters: { ...DEFAULT_FILTERS, organization: 'Purple IQ UAE', area: 'Safety' } }
  ];
  private plans: CaActionPlan[] = [];

  /** Period presets, compliance areas and risk levels. */
  loadOptions(): Observable<CaOptions> {
    return of({
      periods: CA_FALLBACK_PERIODS,
      defaultPeriod: CA_DEFAULT_PERIOD,
      areas: [ALL_AREAS, ...COMPLIANCE_AREAS],
      riskLevels: [ALL_RISK_LEVELS, ...RISK_LEVEL_VALUES]
    });
  }

  /** Organization, Location and Regulation values. */
  loadFilters(): Observable<CaFilterLists> {
    return of({
      organizations: [ALL_ORGANIZATIONS, ...DEMO_ORGANIZATIONS],
      locations: [ALL_LOCATIONS, ...DEMO_SITES.map((s) => s.name)],
      regulations: [ALL_REGULATIONS, ...REGULATIONS.map((r) => r.name)]
    });
  }

  /** Every section for the filter bar. */
  loadOverview(f: CaFilters): Observable<ComplianceView> {
    const v = buildView(f);
    this.view.set(v);
    this.loaded.set(true);
    this.loading.set(false);
    return of(v);
  }

  /** The open findings for the filter bar as a CSV download. */
  export(f: CaFilters): Observable<void> {
    const v = buildView(f);
    downloadCsv('compliance-analytics.csv',
      ['Finding ID', 'Requirement', 'Regulation', 'Area', 'Asset ID', 'Asset', 'Location', 'Severity', 'Due Date', 'Owner', 'Status', 'Corrective Action', 'Work Order'],
      v.findings.map((r) => [r.id, r.requirement, r.regulation, r.area, r.assetId, r.asset, r.site, r.severity, r.due, r.owner, r.status, r.correctiveAction ?? '', r.workOrder ?? '']));
    return of(undefined);
  }

  // ----- Saved views (kept in memory) -----

  /** The built-in All Compliance view, then the user's own. */
  loadViews(): Observable<CaSavedView[]> {
    return of(this.views);
  }

  createView(name: string, f: CaFilters, isDefault = false): Observable<CaSavedView> {
    const saved: CaSavedView = { viewId: `view-${Date.now()}`, name: name.trim(), builtIn: false, isDefault, filters: { ...f, period: f.period || CA_DEFAULT_PERIOD } };
    this.views = [...this.views, saved];
    return of(saved);
  }

  // ----- Action plans (kept in memory) -----

  /** "Create action plan". */
  createActionPlan(plan: CaActionPlanRequest): Observable<CaActionPlan> {
    const saved: CaActionPlan = {
      id: `CAP-2026-${String(512 + this.plans.length).padStart(4, '0')}`,
      title: plan.title.trim(),
      owner: plan.owner,
      due: plan.due && !Number.isNaN(new Date(plan.due).getTime()) ? formatDate(plan.due) : plan.due || '—',
      priority: plan.priority,
      status: 'Open'
    };
    this.plans = [...this.plans, saved];
    return of(saved);
  }
}
