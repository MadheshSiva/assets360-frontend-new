import { RA_MONTH_LABELS } from '../shared/analytics-common';
import { ChartSeries, HBarRow, RA_COLORS } from '../shared/charts';
import { RA_ASSETS, RA_WORK_ORDERS, RaAsset, RaScope, RaSite, inScope, mean, periodMonths, round1 } from './kit/asset-universe';

// DEMO MODE: Asset Performance figures are aggregated from the shared sample register in ./kit/asset-universe.

/** Average utilization each site is expected to reach. */
export const UTILIZATION_TARGET = 75;

/** Change vs the previous period shown on the KPI cards (%). */
export const AP_DELTAS = { total: 8.4, health: 3.2, utilization: 5.6, availability: 1.8, mtbf: 12.5, mttr: -18.4 };

export interface ApLocationRow {
  site: RaSite;
  name: string;
  assets: number;
  health: number;
  utilization: number;
  availability: number;
}

export interface ApAssetRow {
  asset: RaAsset;
  id: string;
  name: string;
  location: string;
  health: number;
  utilization: number;
  availability: number;
  status: 'Top Performer' | 'Underperforming';
}

export interface ApBands {
  excellent: number;
  good: number;
  watch: number;
  critical: number;
}

export interface AssetPerformanceView {
  assets: RaAsset[];
  total: number;
  health: number;
  utilization: number;
  availability: number;
  mtbf: number;
  mttr: number;
  labels: string[];
  healthTrend: ChartSeries[];
  categoryLabels: string[];
  categoryUtilization: ChartSeries[];
  bands: ApBands;
  distribution: HBarRow[];
  reliability: ChartSeries[];
  downtime: ChartSeries[];
  downtimeHours: number;
  topBottom: ApAssetRow[];
  locations: ApLocationRow[];
  /** Assets with health < 40 */
  critical: RaAsset[];
  /** Watch-band assets running hard: maintenance is recommended before they degrade further */
  intervention: RaAsset[];
  lowUtilization: ApLocationRow[];
}

function avg(assets: RaAsset[], get: (a: RaAsset) => number): number {
  return assets.length ? mean(assets.map(get)) : 0;
}

function share(count: number, total: number): number {
  return total ? Math.round((count / total) * 100) : 0;
}

/** Recomputes every widget for the current filters. */
export function buildAssetPerformance(scope: RaScope, period: string, compare: boolean): AssetPerformanceView {
  const assets = RA_ASSETS.filter((a) => inScope(a, scope));
  const months = periodMonths(period);
  const ids = new Set(assets.map((a) => a.id));
  const orders = RA_WORK_ORDERS.filter((o) => ids.has(o.asset.id) && months.includes(o.month));
  const total = assets.length;

  const bands: ApBands = {
    excellent: assets.filter((a) => a.health >= 80).length,
    good: assets.filter((a) => a.health >= 60 && a.health < 80).length,
    watch: assets.filter((a) => a.health >= 40 && a.health < 60).length,
    critical: assets.filter((a) => a.health < 40).length
  };

  // Health trend: share of assets per health state; the latest month is today's register
  const healthyNow = share(bands.excellent + bands.good, total);
  const criticalNow = share(bands.critical, total);
  const healthy = months.map((m) => (total ? Math.max(0, healthyNow - (9 - m) * 1.1 - (m % 3 === 1 ? 0.8 : 0)) : 0));
  const critical = months.map((m) => (total ? round1(criticalNow + (9 - m) * 0.25) : 0));
  const atRisk = months.map((_, i) => (total ? round1(100 - healthy[i] - critical[i]) : 0));
  const healthTrend: ChartSeries[] = [
    { name: 'Healthy', values: healthy.map(round1), color: RA_COLORS.green, area: true },
    { name: 'At Risk', values: atRisk, color: RA_COLORS.orange },
    { name: 'Critical', values: critical, color: RA_COLORS.red }
  ];
  if (compare) healthTrend.push({ name: 'Healthy (previous period)', values: healthy.map((v) => round1(v / (1 + AP_DELTAS.health / 100))), color: RA_COLORS.green, dashed: true });

  // Utilization split per category: in use, out for maintenance (unavailable hours) and idle
  const categories = [...new Set(assets.map((a) => a.category))];
  const catAssets = categories.map((c) => assets.filter((a) => a.category === c));
  const active = catAssets.map((list) => Math.round(avg(list, (a) => a.utilization)));
  const maintenance = catAssets.map((list) => Math.round(100 - avg(list, (a) => a.availability)));
  const categoryUtilization: ChartSeries[] = [
    { name: 'Active', values: active, color: RA_COLORS.purple },
    { name: 'Idle', values: active.map((v, i) => Math.max(0, 100 - v - maintenance[i])), color: RA_COLORS.sky },
    { name: 'Maintenance', values: maintenance, color: RA_COLORS.orange }
  ];

  const distribution: HBarRow[] = [
    { label: 'Excellent (80–100)', value: bands.excellent, display: `${bands.excellent} (${share(bands.excellent, total)}%)`, color: RA_COLORS.green },
    { label: 'Good (60–79)', value: bands.good, display: `${bands.good} (${share(bands.good, total)}%)`, color: RA_COLORS.blue },
    { label: 'Watch (40–59)', value: bands.watch, display: `${bands.watch} (${share(bands.watch, total)}%)`, color: RA_COLORS.orange },
    { label: 'Critical (0–39)', value: bands.critical, display: `${bands.critical} (${share(bands.critical, total)}%)`, color: RA_COLORS.red }
  ];

  // Reliability: MTBF improves through the year; MTTR is the mean repair time of that month's breakdowns
  const mtbf = Math.round(avg(assets, (a) => a.mtbf));
  const repairs = orders.filter((o) => o.type === 'Corrective' || o.type === 'Emergency');
  const mttr = round1(repairs.length ? mean(repairs.map((o) => o.repairHours)) : 0);
  const mtbfShape = months.map((m) => 0.8 + m * 0.045);
  const shapeMean = mean([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => 0.8 + m * 0.045));
  const mttrByMonth = months.map((m) => {
    const list = repairs.filter((o) => o.month === m);
    return list.length ? round1(mean(list.map((o) => o.repairHours))) : 0;
  });
  const reliability: ChartSeries[] = [
    { name: 'MTBF (hrs)', values: mtbfShape.map((s) => Math.round((mtbf * s) / shapeMean)), color: RA_COLORS.purple, area: true },
    { name: 'MTTR (hrs)', values: mttrByMonth, color: RA_COLORS.blue, axis: 'right' }
  ];
  if (compare) reliability.push({ name: 'MTBF (previous period)', values: reliability[0].values.map((v) => Math.round(v / (1 + AP_DELTAS.mtbf / 100))), color: RA_COLORS.purple, dashed: true });

  const planned = months.map((m) => round1(orders.filter((o) => o.month === m && (o.type === 'Preventive' || o.type === 'Inspection')).reduce((s, o) => s + o.downtimeHours, 0)));
  const unplanned = months.map((m) => round1(orders.filter((o) => o.month === m && (o.type === 'Corrective' || o.type === 'Emergency')).reduce((s, o) => s + o.downtimeHours, 0)));
  const downtime: ChartSeries[] = [
    { name: 'Planned', values: planned, color: RA_COLORS.blue },
    { name: 'Unplanned', values: unplanned, color: RA_COLORS.pink }
  ];

  // Three best and two worst assets by health score
  const ranked = [...assets].sort((a, b) => b.health - a.health || b.utilization - a.utilization);
  const picks = ranked.length > 5 ? [...ranked.slice(0, 3), ...ranked.slice(-2)] : ranked;
  const topBottom: ApAssetRow[] = picks.map((a, i) => ({
    asset: a,
    id: a.id,
    name: a.name,
    location: a.site.name,
    health: a.health,
    utilization: a.utilization,
    availability: a.availability,
    status: i < 3 && a.health >= 60 ? 'Top Performer' : 'Underperforming'
  }));

  const sites = [...new Set(assets.map((a) => a.site))];
  const locations: ApLocationRow[] = sites.map((site) => {
    const list = assets.filter((a) => a.site === site);
    return {
      site,
      name: site.name,
      assets: list.length,
      health: Math.round(avg(list, (a) => a.health)),
      utilization: Math.round(avg(list, (a) => a.utilization)),
      availability: round1(avg(list, (a) => a.availability))
    };
  });

  const utilization = avg(assets, (a) => a.utilization);
  return {
    assets,
    total,
    health: Math.round(avg(assets, (a) => a.health)),
    utilization: Math.round(utilization),
    availability: round1(avg(assets, (a) => a.availability)),
    mtbf,
    mttr,
    labels: months.map((m) => RA_MONTH_LABELS[m]),
    healthTrend,
    categoryLabels: categories.map((c, i) => `${c}\n${active[i]}%`),
    categoryUtilization,
    bands,
    distribution,
    reliability,
    downtime,
    downtimeHours: Math.round(planned.reduce((a, b) => a + b, 0) + unplanned.reduce((a, b) => a + b, 0)),
    topBottom,
    locations,
    critical: assets.filter((a) => a.health < 40).sort((a, b) => a.health - b.health),
    intervention: assets.filter((a) => a.health >= 40 && a.health < 50 && a.utilization >= 80).sort((a, b) => a.health - b.health),
    lowUtilization: locations.filter((l) => l.utilization < UTILIZATION_TARGET)
  };
}
