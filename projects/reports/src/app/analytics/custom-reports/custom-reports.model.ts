export type ReportStatus = 'Draft' | 'Published' | 'Scheduled';
export type ReportVisibility = 'Only me' | 'My team' | 'Organization';
export type VizType = 'Table' | 'Bar' | 'Line' | 'Donut';
export type FieldKind = 'text' | 'number' | 'money' | 'percent' | 'date';
export type CalcOperator = '+' | '-' | '×' | '÷';
export type Aggregate = 'Sum' | 'Average' | 'Min' | 'Max';
export type SortDir = 'asc' | 'desc';
/** Filter operators as the Custom Reports API names them (labels come from FILTER_OPERATOR_LABELS). */
export type FilterOperator =
  | 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'in' | 'notIn'
  | 'greaterThan' | 'greaterOrEqual' | 'lessThan' | 'lessOrEqual' | 'between' | 'inLastDays'
  | 'isEmpty' | 'isNotEmpty';

/** A reportable field from GET /api/custom-reports/fields (or a calculated field). */
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** Group key on the Select Fields step ('calculated' for calculated fields) */
  group: string;
  /** API data source the field needs (assets, maintenance, inspection); '' for calculated fields */
  dataSource: string;
  /** Filter operators the API accepts for this field */
  operators: FilterOperator[];
  /** Optional value suggestions for filters */
  values?: string[];
}

export interface FieldGroup {
  key: string;
  label: string;
  fields: FieldDef[];
}

/**
 * A data source card in the builder. The API joins Assets (always included) with optional sources,
 * so each card is one combination, e.g. key "assets+maintenance".
 */
export interface DataSource {
  key: string;
  label: string;
  module: string;
  /** Field group keys available with this combination */
  groups: string[];
  description: string;
  /** API data source keys */
  sources: string[];
  fieldCount: number;
}

/** Field catalog loaded from the builder endpoints. */
export interface ReportCatalog {
  sources: DataSource[];
  groups: FieldGroup[];
  fields: FieldDef[];
}

/** Calculated field: left <op> right, both numeric fields. Keys look like "calc_<name>" (the API's format). */
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
  /** Single value; comma-separated list for in / notIn; days for inLastDays */
  value: string;
  /** Upper bound for between */
  valueTo?: string;
}

/** What the builder edits: data, filters, grouping and visualization. */
export interface ReportDefinition {
  sourceKey: string;
  fields: string[];
  calcFields: CalcField[];
  filters: ReportFilter[];
  /** Combine filters with And / Or */
  filterLogic: 'And' | 'Or';
  groupBy: string;
  aggregate: Aggregate;
  sortBy: string;
  sortDir: SortDir;
  rowLimit: number;
  viz: VizType;
  /** Column plotted on charts; '' picks the first numeric column */
  chartValue: string;
}

/** Schedule as stored by the API; kept so recipients / time zone survive a save. */
export interface ReportScheduleDto {
  frequency: string;
  dayOfWeek: string | null;
  dayOfMonth: number | null;
  time: string | null;
  timeZone: string | null;
  recipients: string[] | null;
  nextRunAt?: string | null;
}

export interface CustomReport extends ReportDefinition {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerId: string;
  module: string;
  status: ReportStatus;
  favourite: boolean;
  /** ISO local date-time, Asia/Dubai */
  updatedAt: string;
  visibility: ReportVisibility;
  schedule: string;
  /** The API schedule behind `schedule` (null when not scheduled or not loaded) */
  scheduleDetail: ReportScheduleDto | null;
  /** False when the report belongs to someone else */
  canEdit: boolean;
  /** Builder step to reopen at (1-6) */
  currentStep: number;
  /** False for library rows whose definition has not been loaded yet */
  loaded: boolean;
}

export type ReportCell = string | number | boolean | null;
export type ReportRow = Record<string, ReportCell>;

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
  /** Chart points over every matching row, when the API built a chart */
  points: { label: string; value: number }[] | null;
}

export interface ReportOwner {
  id: string;
  name: string;
}

export interface CustomReportStats {
  total: number;
  published: number;
  scheduled: number;
  drafts: number;
}
