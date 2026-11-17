import { FilterOperator, ReportDefinition, ReportVisibility } from './custom-reports.model';

// Reports, data sources, fields and preview rows come from the Custom Reports API (custom-reports.service.ts).
// What is left here is UI wording and presets the API has no endpoint for.

/** Library Module filter until GET /options answers (the API list replaces it). */
export const RA_MODULES = [
  'Assets', 'WIP / Operations', 'Maintenance', 'Inspection', 'Inventory', 'Movement & Custody', 'Audit & Compliance', 'Financial'
];

/** UI wording for the API visibilities (the API calls "Only me" Private). */
export const VISIBILITIES: ReportVisibility[] = ['Only me', 'My team', 'Organization'];

export const NOT_SCHEDULED = 'Not scheduled';

/**
 * Schedule presets offered in Report Configuration. The text matches the API's scheduleSummary,
 * so a saved schedule maps back onto its preset. Times are Asia/Dubai.
 */
export const SCHEDULES = [
  NOT_SCHEDULED,
  'Daily – 07:00',
  'Weekly – Monday, 08:00',
  'Monthly – 1st day, 08:00',
  'Quarterly – 1st day, 08:00'
];

export const SCHEDULE_TIME_ZONE = 'Asia/Dubai';

/** Row limits offered on Group & Sort (the API allows 1–10,000). */
export const ROW_LIMITS = [10, 25, 50, 100, 500, 1000];

/** Readable operator names; numeric and date fields use symbols / words that read naturally. */
export const FILTER_OPERATOR_LABELS: Record<'text' | 'number' | 'date', Partial<Record<FilterOperator, string>>> = {
  text: {
    equals: 'equals', notEquals: 'not equals', contains: 'contains', notContains: 'does not contain', startsWith: 'starts with',
    in: 'is one of', notIn: 'is not one of', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  },
  number: {
    equals: '=', notEquals: '≠', greaterThan: '>', greaterOrEqual: '≥', lessThan: '<', lessOrEqual: '≤', between: 'between',
    in: 'is one of', notIn: 'is not one of', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  },
  date: {
    equals: 'on', notEquals: 'not on', greaterThan: 'after', greaterOrEqual: 'on or after', lessThan: 'before', lessOrEqual: 'on or before',
    between: 'between', inLastDays: 'in the last (days)', isEmpty: 'is empty', isNotEmpty: 'is not empty'
  }
};

/** Module for each Standard Reports category when a standard report is copied, and the fields it starts with. */
export const STANDARD_COPY_FIELDS: Record<string, { sources: string[]; fields: string[] }> = {
  'Maintenance': { sources: ['assets', 'maintenance'], fields: ['asset_id', 'asset_name', 'location', 'maintenance_cost', 'open_work_orders'] },
  'Inspection': { sources: ['assets', 'inspection'], fields: ['asset_id', 'location', 'last_inspection_result', 'failed_inspections', 'next_inspection_date'] },
  'Financial': { sources: ['assets'], fields: ['asset_id', 'asset_name', 'asset_category', 'purchase_date', 'purchase_cost'] }
};
export const DEFAULT_COPY_FIELDS = { sources: ['assets'], fields: ['asset_id', 'asset_name', 'asset_category', 'location', 'condition'] };

export function blankDefinition(sourceKey = 'assets'): ReportDefinition {
  return {
    sourceKey,
    fields: [],
    calcFields: [],
    filters: [],
    filterLogic: 'And',
    groupBy: '',
    aggregate: 'Sum',
    sortBy: '',
    sortDir: 'desc',
    rowLimit: 25,
    viz: 'Table',
    chartValue: ''
  };
}
