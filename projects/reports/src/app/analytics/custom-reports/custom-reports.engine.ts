import { FILTER_OPERATOR_LABELS } from './custom-reports.data';
import {
  Aggregate, CalcField, DataSource, FieldDef, FieldGroup, FieldKind, FilterOperator, PreviewColumn, ReportCatalog, ReportCell,
  ReportDefinition, ReportFilter
} from './custom-reports.model';

// Builder helpers over the field catalog loaded from the API. Report rows are produced by the API
// (POST /api/custom-reports/preview); this file only handles what the builder needs while editing:
// field lookups, step validation for instant feedback, output column names and cell formatting.

/** UI key of the record count column of a grouped report (the API calls it "count"). */
export const COUNT_KEY = '__count';
export const CALC_GROUP = 'calculated';

const NUMERIC_OPERATORS: FilterOperator[] = [
  'equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'in', 'notIn', 'isEmpty', 'isNotEmpty'
];

export const AGGREGATE_FUNCTIONS: Record<Aggregate, string> = { Sum: 'sum', Average: 'avg', Min: 'min', Max: 'max' };

export const EMPTY_CATALOG: ReportCatalog = { sources: [], groups: [], fields: [] };

export function isNumeric(kind: FieldKind): boolean {
  return kind === 'number' || kind === 'money' || kind === 'percent';
}

/** API dataType (string, number, currency, date) → UI kind. */
export function kindOf(dataType: string | null | undefined): FieldKind {
  if (dataType === 'number') return 'number';
  if (dataType === 'currency') return 'money';
  if (dataType === 'date') return 'date';
  return 'text';
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

/** Source card key for a list of API data sources (assets is always part of it). */
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

/** Validation message for a filter row, or '' when it is usable (mirrors the API's checks). */
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

/** UI column key → the API's column key (e.g. maintenance_cost → sum_maintenance_cost when grouped). */
export function apiColumnKey(def: ReportDefinition, key: string): string {
  if (!def.groupBy) return key === COUNT_KEY ? '' : key;
  if (key === COUNT_KEY) return 'count';
  if (key === def.groupBy) return key;
  return `${AGGREGATE_FUNCTIONS[def.aggregate]}_${key}`;
}

/** API column key → UI key. */
export function uiColumnKey(grouped: boolean, key: string | null | undefined): string {
  if (!key) return '';
  if (!grouped) return key;
  if (key === 'count') return COUNT_KEY;
  const m = /^(sum|avg|min|max)_(.+)$/.exec(key);
  return m ? m[2] : key;
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
