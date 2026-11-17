import { FILTER_OPERATOR_LABELS } from './custom-reports.data';
import {
  Aggregate, CalcField, CalcOperator, DataSource, FieldDef, FieldGroup, FieldKind, FilterOperator, PreviewColumn, PreviewResult,
  ReportCatalog, ReportCell, ReportDefinition, ReportFilter, ReportRow
} from './custom-reports.model';

// Report engine over the static demo catalog: field lookups, step validation, output columns,
// cell formatting and runReport, which filters, groups, sorts and limits the demo rows in the browser.

/** UI key of the record count column of a grouped report. */
export const COUNT_KEY = '__count';
export const CALC_GROUP = 'calculated';

const NUMERIC_OPERATORS: FilterOperator[] = [
  'equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'in', 'notIn', 'isEmpty', 'isNotEmpty'
];

export const EMPTY_CATALOG: ReportCatalog = { sources: [], groups: [], fields: [] };

export function isNumeric(kind: FieldKind): boolean {
  return kind === 'number' || kind === 'money' || kind === 'percent';
}

/** Source card for a key; a placeholder while the catalog is loading or for an unknown combination. */
export function sourceOf(catalog: ReportCatalog, key: string): DataSource {
  const found = catalog.sources.find((s) => s.key === key);
  if (found) return found;
  const sources = key ? key.split('+') : ['assets'];
  return {
    key,
    label: sources.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' + '),
    module: 'Assets',
    groups: [],
    description: '',
    sources,
    fieldCount: 0
  };
}

/** Source card key for a list of data sources (assets is always part of it). */
export function sourceKeyFor(catalog: ReportCatalog, sources: string[]): string {
  const wanted = new Set(['assets', ...sources.map((s) => s.toLowerCase())]);
  const match = catalog.sources.find((s) => s.sources.length === wanted.size && s.sources.every((k) => wanted.has(k)));
  return match?.key ?? [...wanted].join('+');
}

export function groupsOf(catalog: ReportCatalog, sourceKey: string): FieldGroup[] {
  const sources = new Set(sourceOf(catalog, sourceKey).sources);
  return catalog.groups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => sources.has(f.dataSource)) }))
    .filter((g) => g.fields.length > 0);
}

/** Fields of the data source plus the report's calculated fields. */
export function availableFields(catalog: ReportCatalog, def: ReportDefinition): FieldDef[] {
  const base = groupsOf(catalog, def.sourceKey).flatMap((g) => g.fields);
  return [...base, ...def.calcFields.map(calcAsField)];
}

export function calcAsField(c: CalcField): FieldDef {
  return { key: c.key, label: c.label, kind: 'number', group: CALC_GROUP, dataSource: '', operators: NUMERIC_OPERATORS };
}

export function fieldOf(catalog: ReportCatalog, def: ReportDefinition, key: string): FieldDef | undefined {
  if (key === COUNT_KEY) return { key, label: 'Records', kind: 'number', group: '', dataSource: '', operators: NUMERIC_OPERATORS };
  const calc = def.calcFields.find((c) => c.key === key);
  return calc ? calcAsField(calc) : catalog.fields.find((f) => f.key === key);
}

export function operatorLabel(kind: FieldKind | undefined, op: FilterOperator): string {
  const labels = kind === 'date' ? FILTER_OPERATOR_LABELS.date : kind && isNumeric(kind) ? FILTER_OPERATOR_LABELS.number : FILTER_OPERATOR_LABELS.text;
  return labels[op] ?? op;
}

export function needsNoValue(op: FilterOperator): boolean {
  return op === 'isEmpty' || op === 'isNotEmpty';
}

export function needsList(op: FilterOperator): boolean {
  return op === 'in' || op === 'notIn';
}

/** Comma-separated value list for in / notIn. */
export function listValues(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter((v) => !!v);
}

function validFor(kind: FieldKind, value: string): boolean {
  if (isNumeric(kind)) return value !== '' && !Number.isNaN(Number(value));
  if (kind === 'date') return !Number.isNaN(new Date(value).getTime());
  return value !== '';
}

/** Validation message for a filter row, or '' when it is usable. */
export function filterError(catalog: ReportCatalog, def: ReportDefinition, f: ReportFilter): string {
  const field = availableFields(catalog, def).find((x) => x.key === f.field);
  if (!field) return 'Choose a field.';
  if (!field.operators.includes(f.op)) return 'Choose an operator.';
  if (needsNoValue(f.op)) return '';
  const value = f.value.trim();
  const what = isNumeric(field.kind) ? 'a number' : field.kind === 'date' ? 'a valid date' : 'a value';
  if (needsList(f.op)) {
    const values = listValues(value);
    if (!values.length) return 'Enter one or more values, separated by commas.';
    return values.every((v) => validFor(field.kind, v)) ? '' : `Each value must be ${what}.`;
  }
  if (f.op === 'inLastDays') {
    const days = Number(value);
    return Number.isInteger(days) && days > 0 && days <= 3650 ? '' : 'Enter a number of days between 1 and 3650.';
  }
  if (!value) return 'Enter a value.';
  if (!validFor(field.kind, value)) return `Enter ${what}.`;
  if (f.op === 'between') {
    const to = (f.valueTo ?? '').trim();
    if (!to || !validFor(field.kind, to)) return `Enter ${what} for the upper bound.`;
    const a = isNumeric(field.kind) ? Number(value) : new Date(value).getTime();
    const b = isNumeric(field.kind) ? Number(to) : new Date(to).getTime();
    if (a > b) return 'The first value must not be greater than the second.';
  }
  return '';
}

/** Numeric selected fields that a grouped report aggregates. */
export function aggregatedFields(catalog: ReportCatalog, def: ReportDefinition): FieldDef[] {
  return def.fields
    .map((k) => fieldOf(catalog, def, k))
    .filter((f): f is FieldDef => !!f && isNumeric(f.kind) && f.key !== def.groupBy);
}

/** Output columns for the current definition, with UI keys (grouped reports show the group, a record count and numeric fields). */
export function outputColumns(catalog: ReportCatalog, def: ReportDefinition): PreviewColumn[] {
  const selected = def.fields.map((k) => fieldOf(catalog, def, k)).filter((f): f is FieldDef => !!f);
  const group = def.groupBy ? fieldOf(catalog, def, def.groupBy) : undefined;
  if (!group) return selected.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));
  return [
    { key: group.key, label: group.label, kind: group.kind },
    { key: COUNT_KEY, label: 'Records', kind: 'number' },
    ...aggregatedFields(catalog, def).map((f) => ({ key: f.key, label: aggregateLabel(f.label, def.aggregate), kind: f.kind }))
  ];
}

export function aggregateLabel(label: string, aggregate: Aggregate): string {
  return `${label} (${aggregate.toLowerCase()})`;
}

/** Switches the data source and drops fields, filters and grouping the new source does not have. Returns the number of fields removed. */
export function applySource(catalog: ReportCatalog, def: ReportDefinition, sourceKey: string): number {
  def.sourceKey = sourceKey;
  const baseKeys = new Set(groupsOf(catalog, sourceKey).flatMap((g) => g.fields).map((f) => f.key));
  def.calcFields = def.calcFields.filter((c) => baseKeys.has(c.left) && baseKeys.has(c.right));
  const keys = new Set([...baseKeys, ...def.calcFields.map((c) => c.key)]);
  const before = def.fields.length;
  def.fields = def.fields.filter((k) => keys.has(k));
  def.filters = def.filters.filter((f) => keys.has(f.field));
  if (def.groupBy && !keys.has(def.groupBy)) def.groupBy = '';
  if (def.sortBy && def.sortBy !== COUNT_KEY && !keys.has(def.sortBy)) def.sortBy = '';
  if (def.chartValue && def.chartValue !== COUNT_KEY && !keys.has(def.chartValue)) def.chartValue = '';
  return before - def.fields.length;
}

/** Removes a selected field and anything that depends on it. */
export function removeField(def: ReportDefinition, key: string): void {
  def.fields = def.fields.filter((k) => k !== key);
  if (def.groupBy === key) def.groupBy = '';
  if (def.sortBy === key) def.sortBy = '';
  if (def.chartValue === key) def.chartValue = '';
}

/** Formats a cell for display. */
export function formatCell(kind: FieldKind, value: ReportCell | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (kind === 'money') return `AED ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (kind === 'percent') return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  if (kind === 'number') return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (kind === 'date') {
    const s = String(value);
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return String(value);
}

/** Category (x) and value (y) columns a chart plots, as UI keys; null when the report has no text + numeric pair. */
export function chartAxes(catalog: ReportCatalog, def: ReportDefinition): { x: string; y: string } | null {
  const cols = outputColumns(catalog, def);
  const x = def.groupBy ? cols[0] : cols.find((c) => !isNumeric(c.kind));
  const numeric = cols.filter((c) => isNumeric(c.kind) && c.key !== x?.key);
  const y = numeric.find((c) => c.key === def.chartValue) ?? numeric[0];
  return x && y ? { x: x.key, y: y.key } : null;
}

// ----- Running a report -----

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function calcValue(c: CalcField, row: ReportRow): number | null {
  const a = Number(row[c.left]);
  const b = Number(row[c.right]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const ops: Record<CalcOperator, () => number | null> = {
    '+': () => a + b, '-': () => a - b, '×': () => a * b, '÷': () => (b === 0 ? null : a / b)
  };
  const v = ops[c.op]();
  return v === null ? null : round2(v);
}

function isEmptyCell(v: ReportCell | undefined): boolean {
  return v === null || v === undefined || v === '';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Comparable value of a cell / filter value for the field kind. */
function comparable(kind: FieldKind, v: ReportCell | undefined): number | string {
  if (isNumeric(kind)) return Number(v);
  if (kind === 'date') return String(v ?? '').slice(0, 10);
  return String(v ?? '').trim().toLowerCase();
}

function matches(field: FieldDef, f: ReportFilter, raw: ReportCell | undefined): boolean {
  if (f.op === 'isEmpty') return isEmptyCell(raw);
  if (f.op === 'isNotEmpty') return !isEmptyCell(raw);
  if (isEmptyCell(raw)) return f.op === 'notEquals' || f.op === 'notIn' || f.op === 'notContains';
  const kind = field.kind;
  const a = comparable(kind, raw);
  const b = comparable(kind, f.value.trim());
  switch (f.op) {
    case 'equals': return a === b;
    case 'notEquals': return a !== b;
    case 'contains': return String(a).includes(String(b));
    case 'notContains': return !String(a).includes(String(b));
    case 'startsWith': return String(a).startsWith(String(b));
    case 'in': return listValues(f.value).some((v) => comparable(kind, v) === a);
    case 'notIn': return !listValues(f.value).some((v) => comparable(kind, v) === a);
    case 'greaterThan': return a > b;
    case 'greaterOrEqual': return a >= b;
    case 'lessThan': return a < b;
    case 'lessOrEqual': return a <= b;
    case 'between': return a >= b && a <= comparable(kind, (f.valueTo ?? '').trim());
    case 'inLastDays': {
      const today = todayIso();
      return String(a) <= today && String(a) >= minusDays(today, Number(f.value));
    }
    default: return true;
  }
}

function aggregate(values: number[], how: Aggregate): number {
  if (!values.length) return 0;
  const total = values.reduce((x, y) => x + y, 0);
  if (how === 'Average') return round2(total / values.length);
  if (how === 'Min') return Math.min(...values);
  if (how === 'Max') return Math.max(...values);
  return round2(total);
}

function compareCells(x: ReportCell | undefined, y: ReportCell | undefined): number {
  if (isEmptyCell(x)) return isEmptyCell(y) ? 0 : 1;
  if (isEmptyCell(y)) return -1;
  return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
}

/** Runs a definition against source rows: calculated fields, filters, grouping, sort and the row limit. */
export function runReport(catalog: ReportCatalog, def: ReportDefinition, source: ReportRow[], limit = def.rowLimit): PreviewResult {
  const columns = outputColumns(catalog, def);
  let rows: ReportRow[] = source.map((r) => {
    const row = { ...r };
    for (const c of def.calcFields) row[c.key] = calcValue(c, row);
    return row;
  });

  // Incomplete filters are skipped, as in the builder's summary
  const filters = def.filters
    .filter((f) => !filterError(catalog, def, f))
    .map((f) => ({ f, field: fieldOf(catalog, def, f.field) as FieldDef }));
  if (filters.length) {
    rows = rows.filter((r) =>
      def.filterLogic === 'Or'
        ? filters.some(({ f, field }) => matches(field, f, r[f.field]))
        : filters.every(({ f, field }) => matches(field, f, r[f.field]))
    );
  }

  const group = def.groupBy ? fieldOf(catalog, def, def.groupBy) : undefined;
  if (group) {
    const buckets = new Map<string, ReportRow[]>();
    for (const r of rows) {
      const k = isEmptyCell(r[group.key]) ? '—' : String(r[group.key]);
      const list = buckets.get(k);
      if (list) list.push(r);
      else buckets.set(k, [r]);
    }
    rows = [...buckets.entries()].map(([k, list]) => {
      const out: ReportRow = { [group.key]: k, [COUNT_KEY]: list.length };
      for (const c of columns.slice(2)) {
        const values = list.map((r) => r[c.key]).filter((v) => !isEmptyCell(v)).map(Number);
        out[c.key] = aggregate(values, def.aggregate);
      }
      return out;
    });
  }

  // Grouped reports without a sort show the largest groups first
  const sortKey = def.sortBy && columns.some((c) => c.key === def.sortBy) ? def.sortBy : group ? COUNT_KEY : '';
  if (sortKey) {
    const dir = sortKey === def.sortBy && def.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      // Empty values last in either direction
      if (isEmptyCell(x) || isEmptyCell(y)) return compareCells(x, y);
      return compareCells(x, y) * dir;
    });
  }

  const axes = chartAxes(catalog, def);
  const labelKey = axes?.x ?? '';
  const valueKey = axes?.y ?? '';
  const labelCol = columns.find((c) => c.key === labelKey);
  const valueCol = columns.find((c) => c.key === valueKey);
  const title = labelCol && valueCol ? `${valueCol.label.replace(/ \((sum|average|min|max)\)$/, '')} by ${labelCol.label}` : 'Report preview';
  const points = def.viz !== 'Table' && axes
    ? rows.map((r) => ({ label: String(r[labelKey] ?? '—'), value: Number(r[valueKey]) || 0 }))
    : null;

  return {
    columns,
    rows: rows.slice(0, Math.max(1, limit)).map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null])) as ReportRow),
    matched: rows.length,
    labelKey,
    valueKey,
    title,
    points
  };
}
