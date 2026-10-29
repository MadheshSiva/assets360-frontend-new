export type ReportStatus = 'Draft' | 'Published' | 'Scheduled';
export type ReportVisibility = 'Only me' | 'My team' | 'Organization';
export type VizType = 'Table' | 'Bar' | 'Line' | 'Donut';
export type FieldKind = 'text' | 'number' | 'money' | 'percent' | 'date';
export type CalcOperator = '+' | '-' | '×' | '÷';
export type Aggregate = 'Sum' | 'Average' | 'Min' | 'Max';
export type SortDir = 'asc' | 'desc';
export type FilterOperator =
  | 'equals' | 'not equals' | 'contains'
  | '=' | '≠' | '>' | '<' | '≥' | '≤'
  | 'on' | 'before' | 'after';

/** A reportable field. Sample values are generated from `values`, `pattern`, a numeric range or a date span. */
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  group: string;
  values?: string[];
  /** e.g. 'WO-2026-{n}' with n = start + row */
  pattern?: string;
  start?: number;
  pad?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Dates: first day and span in days */
  from?: string;
  span?: number;
}

export interface FieldGroup {
  key: string;
  label: string;
  fields: FieldDef[];
}

export interface DataSource {
  key: string;
  label: string;
  module: string;
  groups: string[];
  description: string;
}

/** Calculated field: left <op> right, both numeric fields. Stored with key "calc:<id>". */
export interface CalcField {
  key: string;
  label: string;
  left: string;
  op: CalcOperator;
  right: string;
}

export interface ReportFilter {
  field: string;
  op: FilterOperator;
  value: string;
}

/** What the builder edits: data, filters, grouping and visualization. */
export interface ReportDefinition {
  sourceKey: string;
  fields: string[];
  calcFields: CalcField[];
  filters: ReportFilter[];
  groupBy: string;
  aggregate: Aggregate;
  sortBy: string;
  sortDir: SortDir;
  rowLimit: number;
  viz: VizType;
  /** Column plotted on charts; '' picks the first numeric column */
  chartValue: string;
}

export interface CustomReport extends ReportDefinition {
  id: string;
  name: string;
  description: string;
  owner: string;
  module: string;
  status: ReportStatus;
  favourite: boolean;
  /** ISO local date-time, Asia/Dubai */
  updatedAt: string;
  visibility: ReportVisibility;
  schedule: string;
}

export type ReportRow = Record<string, string | number>;

export interface PreviewColumn {
  key: string;
  label: string;
  kind: FieldKind;
}

export interface PreviewResult {
  columns: PreviewColumn[];
  rows: ReportRow[];
  /** Rows matching the filters before the row limit */
  matched: number;
  labelKey: string;
  valueKey: string;
  title: string;
}
