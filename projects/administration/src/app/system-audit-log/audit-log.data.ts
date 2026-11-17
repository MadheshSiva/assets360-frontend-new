import { todayIso } from '../shared/admin-common';
import { AuditCategory } from './audit-log.model';

// Lookups for the System Audit Log; the events themselves come from the audit API (empty until wired)

/** The day the header stats and default date filter refer to. */
export const AUDIT_DAY = todayIso();
export const RETENTION_DAYS = 365;

/** Category chips, in display order. */
export const AUDIT_CATEGORIES: AuditCategory[] = [
  'User Activity',
  'Configuration',
  'Security',
  'Data Changes',
  'Integrations',
  'Workflow',
  'Imports/Exports'
];
