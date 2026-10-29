import { DATA_SOURCES, FIELD_GROUPS } from './custom-reports.data';
import {
  CalcField, CalcOperator, DataSource, FieldDef, FieldGroup, FieldKind, FilterOperator, PreviewColumn, PreviewResult,
  ReportDefinition, ReportFilter, ReportRow
} from './custom-reports.model';

// DEMO MODE: preview rows are generated from the field catalogue until the reporting API returns real data

export const SAMPLE_ROWS = 24;
export const COUNT_KEY = '__count';

const ALL_FIELDS: FieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields);

export function isNumeric(kind: FieldKind): boolean {
  return kind === 'number' || kind === 'money' || kind === 'percent';
}

export function sourceOf(key: string): DataSource {
  return DATA_SOURCES.find((s) => s.key === key) ?? DATA_SOURCES[0];
}

export function groupsOf(sourceKey: string): FieldGroup[] {
  const source = sourceOf(sourceKey);
  return source.groups.map((k) => FIELD_GROUPS.find((g) => g.key === k)).filter((g): g is FieldGroup => !!g);
}

/** Fields of the data source plus the report's calculated fields. */
export function availableFields(def: ReportDefinition): FieldDef[] {
  const base = groupsOf(def.sourceKey).flatMap((g) => g.fields);
  return [...base, ...def.calcFields.map(calcAsField)];
}

export function calcAsField(c: CalcField): FieldDef {
  return { key: c.key, label: c.label, kind: 'number', group: 'calculated' };
}

export function fieldOf(def: ReportDefinition, key: string): FieldDef | undefined {
  if (key === COUNT_KEY) return { key, label: 'Records', kind: 'number', group: '' };
  const calc = def.calcFields.find((c) => c.key === key);
  return calc ? calcAsField(calc) : ALL_FIELDS.find((f) => f.key === key);
}

export function operatorsFor(kind: FieldKind): FilterOperator[] {
  if (isNumeric(kind)) return ['=', '≠', '>', '<', '≥', '≤'];
  if (kind === 'date') return ['on', 'before', 'after'];
  return ['equals', 'not equals', 'contains'];
}

function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Deterministic sample value for row i. */
export function sampleValue(f: FieldDef, i: number): string | number {
  const h = hash(f.key);
  if (f.pattern) return f.pattern.replace('{n}', String((f.start ?? 1) + i).padStart(f.pad ?? 4, '0'));
  if (f.values?.length) return f.values[(i * 3 + (h % 5) + Math.floor(i / f.values.length)) % f.values.length];
  if (f.kind === 'date') return addDays(f.from ?? '2026-01-01', (i * 37 + h) % (f.span ?? 300));
  const min = f.min ?? 0;
  const max = f.max ?? 100;
  const step = f.step ?? 1;
  const t = ((i * 37 + h * 11) % 101) / 100;
  return Math.round((min + t * (max - min)) / step) * step;
}

export function calcValue(c: CalcField, row: ReportRow): number {
  const a = Number(row[c.left]) || 0;
  const b = Number(row[c.right]) || 0;
  const ops: Record<CalcOperator, number> = { '+': a + b, '-': a - b, '×': a * b, '÷': b === 0 ? 0 : a / b };
  return Math.round(ops[c.op] * 100) / 100;
}

function buildRows(def: ReportDefinition): ReportRow[] {
  const base = groupsOf(def.sourceKey).flatMap((g) => g.fields);
  const rows: ReportRow[] = [];
  for (let i = 0; i < SAMPLE_ROWS; i++) {
    const row: ReportRow = {};
    for (const f of base) row[f.key] = sampleValue(f, i);
    for (const c of def.calcFields) row[c.key] = calcValue(c, row);
    rows.push(row);
  }
  return rows;
}

/** Validation message for a filter row, or '' when it is usable. */
export function filterError(def: ReportDefinition, f: ReportFilter): string {
  const field = fieldOf(def, f.field);
  if (!field) return 'Choose a field.';
  const value = f.value.trim();
  if (!value) return 'Enter a value.';
  if (isNumeric(field.kind) && Number.isNaN(Number(value))) return 'Enter a number.';
  if (field.kind === 'date' && Number.isNaN(new Date(value).getTime())) return 'Enter a valid date.';
  return '';
}

function matches(field: FieldDef, f: ReportFilter, raw: string | number): boolean {
  const value = f.value.trim();
  if (isNumeric(field.kind)) {
    const a = Number(raw);
    const b = Number(value);
    switch (f.op) {
      case '=': return a === b;
      case '≠': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '≥': return a >= b;
      case '≤': return a <= b;
      default: return true;
    }
  }
  if (field.kind === 'date') {
    const a = String(raw);
    const b = value.slice(0, 10);
    return f.op === 'before' ? a < b : f.op === 'after' ? a > b : a === b;
  }
  const a = String(raw).toLowerCase();
  const b = value.toLowerCase();
  return f.op === 'contains' ? a.includes(b) : f.op === 'not equals' ? a !== b : a === b;
}

function aggregate(values: number[], how: ReportDefinition['aggregate']): number {
  if (!values.length) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  const v = how === 'Average' ? total / values.length : how === 'Min' ? Math.min(...values) : how === 'Max' ? Math.max(...values) : total;
  return Math.round(v * 100) / 100;
}

/** Output columns for the current definition (grouped reports show the group, a record count and numeric fields). */
export function outputColumns(def: ReportDefinition): PreviewColumn[] {
  const selected = def.fields.map((k) => fieldOf(def, k)).filter((f): f is FieldDef => !!f);
  const group = def.groupBy ? fieldOf(def, def.groupBy) : undefined;
  if (!group) return selected.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));
  const numeric = selected.filter((f) => isNumeric(f.kind) && f.key !== group.key);
  return [
    { key: group.key, label: group.label, kind: group.kind },
    { key: COUNT_KEY, label: 'Records', kind: 'number' },
    ...numeric.map((f) => ({ key: f.key, label: `${f.label} (${def.aggregate.toLowerCase()})`, kind: f.kind }))
  ];
}

/** Runs the report against the generated sample rows. */
export function runReport(def: ReportDefinition): PreviewResult {
  const columns = outputColumns(def);
  let rows = buildRows(def);

  for (const f of def.filters) {
    const field = fieldOf(def, f.field);
    if (!field || filterError(def, f)) continue;
    rows = rows.filter((r) => matches(field, f, r[f.field]));
  }

  const group = def.groupBy ? fieldOf(def, def.groupBy) : undefined;
  if (group) {
    const buckets = new Map<string, ReportRow[]>();
    for (const r of rows) {
      const k = String(r[group.key]);
      buckets.set(k, [...(buckets.get(k) ?? []), r]);
    }
    rows = [...buckets.entries()].map(([k, list]) => {
      const out: ReportRow = { [group.key]: k, [COUNT_KEY]: list.length };
      for (const c of columns.slice(2)) out[c.key] = aggregate(list.map((r) => Number(r[c.key]) || 0), def.aggregate);
      return out;
    });
  }

  if (def.sortBy && columns.some((c) => c.key === def.sortBy)) {
    const dir = def.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = a[def.sortBy];
      const y = b[def.sortBy];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }

  const matched = rows.length;
  rows = rows.slice(0, def.rowLimit);

  const labelKey = group?.key ?? columns.find((c) => !isNumeric(c.kind))?.key ?? '';
  const numericCols = columns.filter((c) => isNumeric(c.kind));
  const valueKey = numericCols.some((c) => c.key === def.chartValue) ? def.chartValue : numericCols[0]?.key ?? '';
  const labelCol = columns.find((c) => c.key === labelKey);
  const valueCol = columns.find((c) => c.key === valueKey);
  const title = labelCol && valueCol ? `${valueCol.label.replace(/ \((sum|average|min|max)\)$/, '')} by ${labelCol.label}` : 'Report preview';

  return { columns, rows, matched, labelKey, valueKey, title };
}

/** Formats a cell for display. */
export function formatCell(kind: FieldKind, value: string | number | undefined): string {
  if (value === undefined || value === '') return '—';
  if (kind === 'money') return `AED ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (kind === 'percent') return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  if (kind === 'number') return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (kind === 'date') {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return String(value);
}

/** Switches the data source and drops fields, filters and grouping the new source does not have. Returns the number of fields removed. */
export function applySource(def: ReportDefinition, sourceKey: string): number {
  def.sourceKey = sourceKey;
  const baseKeys = new Set(groupsOf(sourceKey).flatMap((g) => g.fields).map((f) => f.key));
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
