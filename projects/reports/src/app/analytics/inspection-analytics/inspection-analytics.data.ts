import { RA_PEOPLE } from '../shared/analytics-common';
import { InspectionFinding, InspectionView, InspectorRow, InsightCardModel, KpiFigure, SEVERITIES, SEVERITY_RANK } from './inspection-analytics.model';

// Static demo data for Inspection Analytics. Every figure is generated in the browser from the fixtures below
// and scales with the filter bar, so the page is fully populated without a backend.

export interface DemoOption {
  value: string;
  label: string;
}

/** Filter bar values; empty fields mean "all". */
export interface DemoInspectionQuery {
  datePreset: string;
  organization?: string | null;
  location?: string | null;
  category?: string | null;
  inspectionType?: string | null;
  inspector?: string | null;
}

export interface DemoFindingsQuery {
  search?: string;
  severity?: string;
  dueWithinDays?: number;
  repeatOnly?: boolean;
  overdueOnly?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const DATE_PRESETS = ['Last 30 days', 'This month', 'Last month', 'This quarter', 'This year', 'Last 12 months'];
export const DEFAULT_DATE_PRESET = 'This year';
export const COMPLIANCE_TARGET = 90;
export const DUE_WITHIN_DAYS = 7;
export const FINDING_SORT_FIELDS = ['findingId', 'assetName', 'category', 'severity', 'dueDate', 'owner', 'status'];

/** Location → organization and share of the group's inspection volume. */
const LOCATIONS: { name: string; org: string; weight: number; compliance: number }[] = [
  { name: 'Dubai HQ', org: 'Purple IQ UAE', weight: 0.24, compliance: 94.2 },
  { name: 'Abu Dhabi Office', org: 'Purple IQ UAE', weight: 0.16, compliance: 92.8 },
  { name: 'Sharjah Facility', org: 'Purple IQ UAE', weight: 0.14, compliance: 84.6 },
  { name: 'Jebel Ali Warehouse', org: 'Purple IQ UAE', weight: 0.12, compliance: 91.5 },
  { name: 'Al Ain Depot', org: 'Purple IQ UAE', weight: 0.07, compliance: 86.3 },
  { name: 'Riyadh Office', org: 'Purple IQ KSA', weight: 0.11, compliance: 88.7 },
  { name: 'Doha Office', org: 'Purple IQ Qatar', weight: 0.06, compliance: 93.1 },
  { name: 'London Office', org: 'Purple IQ Group', weight: 0.05, compliance: 96.4 },
  { name: 'Singapore Office', org: 'Purple IQ Group', weight: 0.05, compliance: 95.0 }
];
const ORGANIZATIONS = ['Purple IQ Group', 'Purple IQ UAE', 'Purple IQ KSA', 'Purple IQ Qatar'];

const CATEGORIES: { name: string; weight: number }[] = [
  { name: 'Vehicles', weight: 0.2 },
  { name: 'Machinery', weight: 0.18 },
  { name: 'Facilities', weight: 0.17 },
  { name: 'IT Equipment', weight: 0.1 },
  { name: 'HVAC', weight: 0.14 },
  { name: 'Power & Electrical', weight: 0.12 },
  { name: 'Safety & PPE', weight: 0.09 }
];

const INSPECTION_TYPES: { name: string; weight: number }[] = [
  { name: 'Preventive Inspection', weight: 0.32 },
  { name: 'Safety Inspection', weight: 0.2 },
  { name: 'Statutory / Regulatory', weight: 0.14 },
  { name: 'Fire & Life Safety (UAE Civil Defence)', weight: 0.12 },
  { name: 'Lifting Equipment (LOLER)', weight: 0.1 },
  { name: 'Pre-use Checklist', weight: 0.12 }
];

const INSPECTORS: { name: string; weight: number; avgHours: number; findingRate: number; closureRate: number }[] = [
  { name: 'Omar Hassan', weight: 0.17, avgHours: 1.8, findingRate: 9.4, closureRate: 91.2 },
  { name: 'Aisha Rahman', weight: 0.15, avgHours: 2.1, findingRate: 11.6, closureRate: 88.5 },
  { name: 'James Tan', weight: 0.14, avgHours: 1.6, findingRate: 7.9, closureRate: 93.4 },
  { name: 'Priya Sharma', weight: 0.13, avgHours: 2.4, findingRate: 12.8, closureRate: 84.1 },
  { name: 'Mohammed Ali', weight: 0.12, avgHours: 2.9, findingRate: 13.5, closureRate: 79.6 },
  { name: 'Daniel Kim', weight: 0.11, avgHours: 1.5, findingRate: 6.8, closureRate: 95.2 },
  { name: 'Rahul Mehta', weight: 0.1, avgHours: 2.2, findingRate: 10.1, closureRate: 87.3 },
  { name: 'Lisa Wong', weight: 0.08, avgHours: 1.9, findingRate: 8.6, closureRate: 90.7 }
];

const FINDING_TYPES: { name: string; weight: number; descriptions: string[] }[] = [
  { name: 'Electrical', weight: 0.26, descriptions: ['Exposed wiring at distribution board', 'Earth bonding resistance above limit', 'Overheating terminal found on thermal scan', 'RCD failed trip test'] },
  { name: 'Mechanical', weight: 0.27, descriptions: ['Excessive bearing vibration', 'Hydraulic hose showing abrasion', 'Drive belt worn beyond tolerance', 'Oil leak at gearbox seal'] },
  { name: 'Safety', weight: 0.22, descriptions: ['Guard missing on rotating part', 'Emergency stop not functional', 'Fire extinguisher past service date', 'Load test certificate expired'] },
  { name: 'Environmental', weight: 0.11, descriptions: ['Refrigerant leak detected', 'Spill kit incomplete', 'Exhaust emission above threshold'] },
  { name: 'Documentation', weight: 0.14, descriptions: ['Inspection checklist not signed', 'Operator log incomplete', 'Calibration record missing'] }
];

/** Assets inspected in the demo, spread over every location and category. */
const ASSETS: { id: string; name: string; location: string; category: string }[] = [
  { id: 'AST-2026-DXB-000247', name: 'Forklift FL-07', location: 'Dubai HQ', category: 'Vehicles' },
  { id: 'AST-2026-DXB-000312', name: 'Chiller Unit CH-02', location: 'Dubai HQ', category: 'HVAC' },
  { id: 'AST-2026-DXB-000418', name: 'Main LV Panel MDB-1', location: 'Dubai HQ', category: 'Power & Electrical' },
  { id: 'AST-2026-DXB-000455', name: 'Passenger Lift L-3', location: 'Dubai HQ', category: 'Facilities' },
  { id: 'AST-2026-AUH-000118', name: 'Diesel Generator DG-1', location: 'Abu Dhabi Office', category: 'Power & Electrical' },
  { id: 'AST-2026-AUH-000164', name: 'Rooftop AHU-4', location: 'Abu Dhabi Office', category: 'HVAC' },
  { id: 'AST-2026-AUH-000203', name: 'Server Rack SR-11', location: 'Abu Dhabi Office', category: 'IT Equipment' },
  { id: 'AST-2026-SHJ-000091', name: 'CNC Lathe ML-04', location: 'Sharjah Facility', category: 'Machinery' },
  { id: 'AST-2026-SHJ-000107', name: 'Overhead Crane OC-2', location: 'Sharjah Facility', category: 'Machinery' },
  { id: 'AST-2026-SHJ-000133', name: 'Air Compressor AC-5', location: 'Sharjah Facility', category: 'Machinery' },
  { id: 'AST-2026-SHJ-000150', name: 'Fire Pump FP-1', location: 'Sharjah Facility', category: 'Safety & PPE' },
  { id: 'AST-2026-JAF-000072', name: 'Reach Truck RT-03', location: 'Jebel Ali Warehouse', category: 'Vehicles' },
  { id: 'AST-2026-JAF-000088', name: 'Dock Leveller DL-6', location: 'Jebel Ali Warehouse', category: 'Facilities' },
  { id: 'AST-2026-JAF-000096', name: 'Cold Room Compressor CR-1', location: 'Jebel Ali Warehouse', category: 'HVAC' },
  { id: 'AST-2026-AAN-000041', name: 'Delivery Van DV-12', location: 'Al Ain Depot', category: 'Vehicles' },
  { id: 'AST-2026-AAN-000057', name: 'Fuel Dispenser FD-2', location: 'Al Ain Depot', category: 'Facilities' },
  { id: 'AST-2026-RUH-000064', name: 'UPS System UPS-3', location: 'Riyadh Office', category: 'Power & Electrical' },
  { id: 'AST-2026-RUH-000079', name: 'Pool Car PC-08', location: 'Riyadh Office', category: 'Vehicles' },
  { id: 'AST-2026-RUH-000085', name: 'Fire Alarm Panel FAP-1', location: 'Riyadh Office', category: 'Safety & PPE' },
  { id: 'AST-2026-DOH-000023', name: 'Split AC Bank SA-2', location: 'Doha Office', category: 'HVAC' },
  { id: 'AST-2026-DOH-000031', name: 'Core Switch SW-01', location: 'Doha Office', category: 'IT Equipment' },
  { id: 'AST-2026-LON-000015', name: 'Standby Generator SG-1', location: 'London Office', category: 'Power & Electrical' },
  { id: 'AST-2026-SIN-000019', name: 'Breathing Apparatus Set BA-4', location: 'Singapore Office', category: 'Safety & PPE' },
  { id: 'AST-2026-SIN-000026', name: 'Scissor Lift SL-02', location: 'Singapore Office', category: 'Machinery' }
];

const STATUSES = ['Open', 'Open', 'In Progress', 'Awaiting Parts'];
const DUE_WINDOW: Record<string, number> = { Critical: 7, High: 14, Medium: 30, Low: 45 };
/** Older findings of each severity are closed, so open ones were raised within this many days */
const RAISED_WINDOW: Record<string, number> = { Critical: 20, High: 40, Medium: 75, Low: 110 };
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ===== Deterministic randomness =====

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0..1, the same for the same key. */
function noise(key: string): number {
  return (hash(key) % 10_000) / 10_000;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T extends { weight: number }>(items: T[], r: number): T {
  let acc = 0;
  for (const item of items) {
    acc += item.weight;
    if (r < acc) return item;
  }
  return items[items.length - 1];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// ===== Findings fixture =====

interface FindingFixture {
  key: string;
  id: string;
  assetId: string;
  assetName: string;
  location: string;
  org: string;
  category: string;
  inspectionType: string;
  inspector: string;
  findingType: string;
  severity: string;
  description: string;
  raisedDaysAgo: number;
  dueInDays: number;
  owner: string;
  status: string;
  repeat: boolean;
}

function buildFindings(): FindingFixture[] {
  const r = rng(20260117);
  const severityWeights = [
    { name: 'Critical', weight: 0.12 },
    { name: 'High', weight: 0.26 },
    { name: 'Medium', weight: 0.36 },
    { name: 'Low', weight: 0.26 }
  ];
  const owners = RA_PEOPLE.slice(0, 14);
  const rows: FindingFixture[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 78; i++) {
    // Sharjah, Dubai and Riyadh assets get more findings, matching their lower compliance
    const asset = ASSETS[Math.floor(Math.pow(r(), 0.85) * ASSETS.length) % ASSETS.length];
    const loc = LOCATIONS.find((l) => l.name === asset.location)!;
    const type = pick(FINDING_TYPES, r());
    const severity = pick(severityWeights, r()).name;
    const raisedDaysAgo = 1 + Math.floor(r() * RAISED_WINDOW[severity]);
    const dueInDays = DUE_WINDOW[severity] * 2 + Math.floor(r() * 10) - raisedDaysAgo;
    const repeatKey = `${asset.id}|${type.name}`;
    rows.push({
      key: `fnd-${i + 1}`,
      id: `FND-2026-${String(1180 + i * 7).padStart(5, '0')}`,
      assetId: asset.id,
      assetName: asset.name,
      location: asset.location,
      org: loc.org,
      category: asset.category,
      inspectionType: pick(INSPECTION_TYPES, r()).name,
      inspector: pick(INSPECTORS, r()).name,
      findingType: type.name,
      severity,
      description: type.descriptions[Math.floor(r() * type.descriptions.length)],
      raisedDaysAgo,
      dueInDays,
      owner: owners[Math.floor(r() * owners.length)],
      status: STATUSES[Math.floor(r() * STATUSES.length)],
      repeat: seen.has(repeatKey)
    });
    seen.add(repeatKey);
  }
  return rows;
}

const FINDINGS = buildFindings();

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toFinding(f: FindingFixture): InspectionFinding {
  const now = Date.now();
  return {
    key: f.key,
    id: f.id,
    assetId: f.assetId,
    assetName: f.assetName,
    site: f.location,
    findingType: f.findingType,
    severity: f.severity,
    description: f.description,
    raised: formatDate(new Date(now - f.raisedDaysAgo * DAY_MS)),
    dueInDays: f.dueInDays,
    due: formatDate(new Date(now + f.dueInDays * DAY_MS)),
    owner: f.owner,
    status: f.status,
    overdue: f.dueInDays < 0,
    ageDays: f.raisedDaysAgo
  };
}

// ===== Filter options =====

const opts = (names: string[]): DemoOption[] => names.map((n) => ({ value: n, label: n }));

export const DEMO_FILTERS = {
  organizations: opts(ORGANIZATIONS),
  locations: opts(LOCATIONS.map((l) => l.name)),
  assetCategories: opts(CATEGORIES.map((c) => c.name)),
  assetTypes: opts(['Forklift', 'Chiller', 'Generator', 'Lift', 'Compressor', 'Crane', 'Van', 'UPS']),
  inspectionTypes: opts(INSPECTION_TYPES.map((t) => t.name)),
  inspectors: opts(INSPECTORS.map((i) => i.name))
};

// ===== Filtering helpers =====

const eq = (a: string, b: string | null | undefined) => !b || a.toLowerCase() === b.toLowerCase();

function filteredLocations(q: DemoInspectionQuery) {
  return LOCATIONS.filter((l) => eq(l.org, q.organization) && eq(l.name, q.location));
}

/** Share of the group's inspection volume covered by the filters. */
function share(q: DemoInspectionQuery): number {
  const loc = filteredLocations(q).reduce((s, l) => s + l.weight, 0);
  const cat = CATEGORIES.filter((c) => eq(c.name, q.category)).reduce((s, c) => s + c.weight, 0);
  const type = INSPECTION_TYPES.filter((t) => eq(t.name, q.inspectionType)).reduce((s, t) => s + t.weight, 0);
  const insp = INSPECTORS.filter((i) => eq(i.name, q.inspector)).reduce((s, i) => s + i.weight, 0);
  return loc * cat * type * insp;
}

function filterKey(q: DemoInspectionQuery): string {
  return [q.organization, q.location, q.category, q.inspectionType, q.inspector].map((v) => v ?? '').join('|');
}

function matchingFindings(q: DemoInspectionQuery): FindingFixture[] {
  return FINDINGS.filter(
    (f) => eq(f.org, q.organization) && eq(f.location, q.location) && eq(f.category, q.category) &&
      eq(f.inspectionType, q.inspectionType) && eq(f.inspector, q.inspector)
  );
}

// ===== Period buckets =====

interface Bucket {
  label: string;
  /** Fraction of a month the bucket covers */
  weight: number;
  /** Month index used for seasonality */
  month: number;
  /** The bucket is still in progress */
  current: boolean;
}

function monthBuckets(start: Date, count: number): Bucket[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const current = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return { label: `${MONTHS[d.getMonth()]}\n${d.getFullYear()}`, weight: current ? now.getDate() / 30 : 1, month: d.getMonth(), current };
  });
}

function weekBuckets(start: Date, end: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const now = new Date();
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 7 * DAY_MS)) {
    const days = Math.min(7, Math.ceil((end.getTime() - d.getTime()) / DAY_MS));
    const label = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}\n${d.getFullYear()}`;
    buckets.push({ label, weight: days / 30, month: d.getMonth(), current: end.getTime() >= now.getTime() - DAY_MS && d.getTime() + 7 * DAY_MS > now.getTime() });
  }
  return buckets;
}

function periodBuckets(preset: string, previous = false): { buckets: Bucket[]; from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = now.getFullYear();
  const m = now.getMonth();
  const shift = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  switch (preset) {
    case 'Last 30 days': {
      let from = new Date(today.getTime() - 29 * DAY_MS);
      let to = new Date(today.getTime() + DAY_MS);
      if (previous) [from, to] = [new Date(from.getTime() - 30 * DAY_MS), from];
      return { buckets: weekBuckets(from, to), from, to: new Date(to.getTime() - DAY_MS) };
    }
    case 'This month': {
      const from = new Date(y, m - (previous ? 1 : 0), 1);
      const to = previous ? new Date(y, m, 1) : new Date(today.getTime() + DAY_MS);
      return { buckets: weekBuckets(from, to), from, to: new Date(to.getTime() - DAY_MS) };
    }
    case 'Last month': {
      const from = new Date(y, m - (previous ? 2 : 1), 1);
      const to = new Date(y, m - (previous ? 1 : 0), 1);
      return { buckets: weekBuckets(from, to), from, to: new Date(to.getTime() - DAY_MS) };
    }
    case 'This quarter': {
      const q = Math.floor(m / 3) * 3;
      const from = new Date(y, q - (previous ? 3 : 0), 1);
      const to = previous ? new Date(y, q, 1) : new Date(today.getTime() + DAY_MS);
      return { buckets: weekBuckets(from, to), from, to: new Date(to.getTime() - DAY_MS) };
    }
    case 'Last 12 months': {
      const from = new Date(y, m - 11 - (previous ? 12 : 0), 1);
      return { buckets: monthBuckets(from, 12), from, to: previous ? new Date(y, m - 11, 0) : today };
    }
    default: {
      // This year
      const from = new Date(y - (previous ? 1 : 0), 0, 1);
      return { buckets: monthBuckets(from, m + 1), from, to: previous ? shift(today, -12) : today };
    }
  }
}

// ===== Trend figures =====

const BASE_MONTHLY = 460;
const SEASON = [0.92, 0.95, 1.04, 1.06, 1.02, 0.9, 0.84, 0.88, 1.03, 1.08, 1.1, 0.96];

interface BucketFigures {
  planned: number;
  completed: number;
  overdue: number;
  inProgress: number;
  scheduled: number;
  cancelled: number;
  severity: number[];
  compliance: number;
  repeated: number;
  resolved: number;
}

function bucketFigures(b: Bucket, i: number, s: number, key: string, previous: boolean): BucketFigures {
  const n = (k: string) => noise(`${key}|${previous ? 'p' : 'c'}|${b.label}|${k}`);
  const trendUp = previous ? 0.94 : 1;
  const planned = Math.max(1, Math.round(BASE_MONTHLY * SEASON[b.month] * b.weight * s * (0.94 + n('p') * 0.12) * trendUp));
  // The current bucket is part-way through: fewer completed, more scheduled / in progress
  const rate = b.current ? 0.62 + n('r') * 0.08 : (previous ? 0.82 : 0.85) + n('r') * 0.08 + Math.min(i, 10) * 0.002;
  const completed = Math.min(planned, Math.round(planned * rate));
  const overdue = Math.min(planned - completed, Math.round(planned * (0.025 + n('o') * 0.03)));
  const cancelled = Math.min(planned - completed - overdue, Math.round(planned * 0.01));
  const rest = planned - completed - overdue - cancelled;
  const inProgress = Math.round(rest * (b.current ? 0.45 : 0.6));
  const scheduled = rest - inProgress;
  const findings = Math.round(completed * (0.085 + n('f') * 0.03));
  const sevShares = [0.07 + n('c') * 0.04, 0.22, 0.4];
  const critical = Math.round(findings * sevShares[0]);
  const high = Math.round(findings * sevShares[1]);
  const medium = Math.round(findings * sevShares[2]);
  const low = Math.max(0, findings - critical - high - medium);
  const compliance = round1(Math.min(99, (previous ? 85.5 : 86.5) + Math.min(i, 11) * 0.55 + n('cmp') * 2.4));
  return {
    planned, completed, overdue, inProgress, scheduled, cancelled,
    severity: [critical, high, medium, low],
    compliance,
    repeated: Math.round(findings * (0.1 + n('rp') * 0.06)),
    resolved: Math.round(findings * (0.78 + n('rs') * 0.14))
  };
}

function figures(q: DemoInspectionQuery, previous = false) {
  const { buckets, from, to } = periodBuckets(q.datePreset, previous);
  const s = share(q);
  const key = filterKey(q);
  return { buckets, from, to, rows: buckets.map((b, i) => bucketFigures(b, i, s, key, previous)) };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function kpi(value: number, previous: number, unit: 'percent' | 'points' = 'percent'): KpiFigure {
  const change = unit === 'points' ? value - previous : previous ? ((value - previous) / previous) * 100 : null;
  return {
    value,
    previous,
    change: change === null ? null : round1(change),
    changeUnit: unit,
    trend: change === null || Math.abs(change) < 0.05 ? 'flat' : change > 0 ? 'up' : 'down'
  };
}

// ===== Public builders =====

export function buildOverview(q: DemoInspectionQuery): InspectionView {
  const cur = figures(q);
  const prev = figures(q, true);
  const rows = cur.rows;
  const col = (k: keyof BucketFigures) => rows.map((r) => r[k] as number);

  const planned = col('planned');
  const completed = col('completed');
  const total = sum(planned);
  const done = sum(completed);
  const prevTotal = sum(prev.rows.map((r) => r.planned));
  const prevDone = sum(prev.rows.map((r) => r.completed));
  const rate = total ? round1((done / total) * 100) : 0;
  const prevRate = prevTotal ? round1((prevDone / prevTotal) * 100) : 0;

  const open = matchingFindings(q);
  const critical = open.filter((f) => f.severity === 'Critical');
  const due = open.filter((f) => f.dueInDays <= DUE_WITHIN_DAYS);

  // Findings by category: the period's findings split by finding type
  const findingsTotal = sum(rows.map((r) => sum(r.severity)));
  const key = filterKey(q);
  const typeWeights = FINDING_TYPES.map((t) => t.weight * (0.85 + noise(`${key}|type|${t.name}`) * 0.3));
  const typeSum = sum(typeWeights);
  const byCategory = typeWeights.map((w) => Math.round((findingsTotal * w) / typeSum));

  const compSeries = rows.map((r) => r.compliance);
  const compValue = compSeries.length ? round1(sum(compSeries.slice(-3)) / Math.min(3, compSeries.length)) : 0;
  const prevComp = prev.rows.length ? round1(sum(prev.rows.slice(-3).map((r) => r.compliance)) / Math.min(3, prev.rows.length)) : 0;
  const scheduledAssets = Math.max(4, Math.round(1240 * share(q)));

  const status = [
    { name: 'Completed', value: done },
    { name: 'In Progress', value: sum(col('inProgress')) },
    { name: 'Scheduled', value: sum(col('scheduled')) },
    { name: 'Overdue', value: sum(col('overdue')) },
    { name: 'Cancelled', value: sum(col('cancelled')) }
  ];

  const sorted = sortFindings(open, 'severity', 'asc');
  return {
    generatedAt: new Date(Date.now() - 4 * 60_000),
    periodLabel: `${formatDate(cur.from)} – ${formatDate(cur.to)}`,
    labels: cur.buckets.map((b) => b.label),
    planned,
    completed,
    overdue: col('overdue'),
    completedPrevious: [],
    status,
    statusTotal: total,
    kpis: {
      total: kpi(total, prevTotal),
      rate: kpi(rate, prevRate, 'points'),
      open: kpi(open.length, Math.round(open.length * 1.12 + 1)),
      critical: kpi(critical.length, Math.max(0, critical.length + (critical.length > 2 ? -1 : 1))),
      due: kpi(due.length, Math.round(due.length * 0.9 + 1))
    },
    severity: SEVERITIES.map((name, si) => ({ name, values: rows.map((r) => r.severity[si]) })),
    categories: FINDING_TYPES.map((t) => t.name),
    byCategory,
    compliance: {
      value: compValue,
      target: COMPLIANCE_TARGET,
      change: round1(compValue - prevComp),
      compliantAssets: Math.round((scheduledAssets * compValue) / 100),
      scheduledAssets,
      series: compSeries
    },
    repeated: col('repeated'),
    resolved: col('resolved'),
    findings: sorted.slice(0, 10).map(toFinding),
    findingsTotal: open.length,
    inspectors: inspectorRows(q, total, done),
    insights: insights(q, open),
    dueWithinDays: DUE_WITHIN_DAYS
  };
}

export function buildCompare(q: DemoInspectionQuery): { completed: number[]; label: string } {
  const prev = figures(q, true);
  return { completed: prev.rows.map((r) => r.completed), label: `${formatDate(prev.from)} – ${formatDate(prev.to)}` };
}

function inspectorRows(q: DemoInspectionQuery, total: number, done: number): InspectorRow[] {
  const list = INSPECTORS.filter((i) => eq(i.name, q.inspector));
  const weight = sum(list.map((i) => i.weight));
  const key = filterKey(q);
  return list.map((i) => {
    const inspections = Math.round((total * i.weight) / weight);
    const completed = Math.min(inspections, Math.round((done * i.weight) / weight * (0.97 + noise(`${key}|${i.name}`) * 0.05)));
    return {
      name: i.name,
      inspections,
      completed,
      avgHours: i.avgHours,
      findingRate: round1(i.findingRate + (noise(`${key}|fr|${i.name}`) - 0.5)),
      closureRate: round1(Math.min(99, i.closureRate + (noise(`${key}|cr|${i.name}`) - 0.5) * 2))
    };
  });
}

function insights(q: DemoInspectionQuery, open: FindingFixture[]): InsightCardModel[] {
  const list: InsightCardModel[] = [];
  const findingModel = (f: FindingFixture, reasons: string) => {
    const v = toFinding(f);
    return { id: v.id, assetId: v.assetId, assetName: v.assetName, severity: v.severity, category: v.findingType, due: v.due, reasons };
  };

  const critical = sortFindings(open.filter((f) => f.severity === 'Critical'), 'dueDate', 'asc');
  if (critical.length) {
    const overdue = critical.filter((f) => f.dueInDays < 0).length;
    list.push({
      key: 'critical_findings',
      severity: 'critical',
      title: `${critical.length} critical finding${critical.length === 1 ? '' : 's'} open`,
      message: `${critical.length} critical findings need corrective action${overdue ? `; ${overdue} already past due` : ''}. Prioritise isolation and repair.`,
      count: critical.length,
      findings: critical.map((f) => findingModel(f, f.dueInDays < 0 ? 'Critical, overdue' : 'Critical')),
      assets: [],
      locations: [...new Set(critical.map((f) => f.location))],
      actions: ['Isolate affected assets', 'Assign corrective work orders'],
      query: 'severity=Critical'
    });
  }

  const due = sortFindings(open.filter((f) => f.dueInDays <= DUE_WITHIN_DAYS), 'dueDate', 'asc');
  if (due.length) {
    const overdue = due.filter((f) => f.dueInDays < 0).length;
    list.push({
      key: 'corrective_actions_due',
      severity: 'warning',
      title: `${due.length} corrective action${due.length === 1 ? '' : 's'} due within ${DUE_WITHIN_DAYS} days`,
      message: `${overdue} overdue and ${due.length - overdue} due this week. Confirm owners and parts availability.`,
      count: due.length,
      findings: due.map((f) => findingModel(f, f.dueInDays < 0 ? 'Overdue' : `Due in ${f.dueInDays} days`)),
      assets: [],
      locations: [...new Set(due.map((f) => f.location))],
      actions: ['Escalate overdue actions'],
      query: `dueWithinDays=${DUE_WITHIN_DAYS}`
    });
  }

  const byAsset = new Map<string, FindingFixture[]>();
  for (const f of open) byAsset.set(f.assetId, [...(byAsset.get(f.assetId) ?? []), f]);
  // Assets where the same finding category was raised again while an earlier one is still open
  const recurring = [...byAsset.values()].filter((rows) => rows.some((f) => f.repeat)).sort((a, b) => b.length - a.length);
  if (recurring.length) {
    list.push({
      key: 'recurring_findings',
      severity: 'info',
      title: `${recurring.length} asset${recurring.length === 1 ? '' : 's'} with recurring findings`,
      message: `${recurring[0][0].assetName} has ${recurring[0].length} open findings. Review root cause before the next inspection cycle.`,
      count: recurring.length,
      findings: [],
      assets: recurring.map((rows) => ({
        assetId: rows[0].assetId,
        assetName: rows[0].assetName,
        site: rows[0].location,
        reasons: `${rows.length} findings (${[...new Set(rows.map((r) => r.findingType))].join(', ')})`
      })),
      locations: [...new Set(recurring.map((rows) => rows[0].location))],
      actions: ['Root cause analysis'],
      query: 'repeatOnly=true'
    });
  }

  const locs = filteredLocations(q);
  const below = locs.filter((l) => l.compliance < COMPLIANCE_TARGET);
  list.push({
    key: 'safety_compliance',
    severity: below.length ? 'warning' : 'success',
    title: below.length ? `Safety compliance below ${COMPLIANCE_TARGET}% at ${below.length} location${below.length === 1 ? '' : 's'}` : 'Safety compliance on target',
    message: below.length
      ? `${below.map((l) => `${l.name} (${l.compliance}%)`).join(', ')} are below the ${COMPLIANCE_TARGET}% target.`
      : `All ${locs.length} location${locs.length === 1 ? '' : 's'} meet the ${COMPLIANCE_TARGET}% safety inspection target.`,
    count: below.length,
    findings: [],
    assets: [],
    locations: below.map((l) => l.name),
    actions: ['Schedule catch-up safety inspections'],
    query: 'inspectionType=Safety Inspection'
  });
  return list;
}

// ===== Findings query =====

const STATUS_RANK: Record<string, number> = { Open: 1, 'In Progress': 2, 'Awaiting Parts': 3 };

function sortFindings(rows: FindingFixture[], sortBy = 'severity', dir: 'asc' | 'desc' = 'asc'): FindingFixture[] {
  const value = (f: FindingFixture): string | number => {
    switch (sortBy) {
      case 'findingId': return f.id;
      case 'assetName': return f.assetName;
      case 'category': return f.findingType;
      case 'dueDate': return f.dueInDays;
      case 'owner': return f.owner;
      case 'status': return STATUS_RANK[f.status] ?? 9;
      // Critical ranks lowest, so ascending = most severe first
      default: return -(SEVERITY_RANK[f.severity] ?? 0);
    }
  };
  const sign = dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return c * sign || a.dueInDays - b.dueInDays;
  });
}

export function queryFindings(q: DemoInspectionQuery, extra: DemoFindingsQuery): { rows: InspectionFinding[]; total: number } {
  const search = extra.search?.trim().toLowerCase();
  let rows = matchingFindings(q).filter((f) => {
    if (extra.severity && f.severity.toLowerCase() !== extra.severity.toLowerCase()) return false;
    if (extra.dueWithinDays && f.dueInDays > extra.dueWithinDays) return false;
    if (extra.repeatOnly && !f.repeat) return false;
    if (extra.overdueOnly && f.dueInDays >= 0) return false;
    if (search) {
      const text = [f.id, f.assetId, f.assetName, f.location, f.owner, f.description].join(' ').toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });
  rows = sortFindings(rows, extra.sortBy, extra.sortDirection);
  const size = extra.pageSize ?? 25;
  const page = Math.max(1, extra.page ?? 1);
  return { rows: rows.slice((page - 1) * size, page * size).map(toFinding), total: rows.length };
}
