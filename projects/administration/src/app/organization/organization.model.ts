export type LocationType = 'Location' | 'Building' | 'Floor' | 'Zone';
export type RecordStatus = 'Active' | 'Inactive';
export type Tone = 'green' | 'orange' | 'red' | 'pink' | 'blue' | 'purple' | 'grey';

/** One node of the location hierarchy: Location (site) > Building > Floor > Zone. */
export interface OrgLocation {
  code: string;
  name: string;
  type: LocationType;
  /** Code of the parent node; null for a top-level location. */
  parent: string | null;
  address: string;
  country: string;
  city: string;
  timeZone: string;
  /** Manager / contact person. */
  contact: string;
  status: RecordStatus;
}

export type OrgTabId = 'location' | 'asset' | 'people' | 'vendor' | 'maintenance' | 'inventory' | 'compliance';

/* ===== Summary tabs (Asset, People, Vendor, ...) ===== */

export type SummaryRow = Record<string, string>;

export interface SummaryColumn {
  key: string;
  label: string;
  /** code = bold blue link text, pill = coloured pill (tones), status = pill with dot. */
  kind?: 'text' | 'code' | 'pill' | 'status';
  tones?: Record<string, Tone>;
}

/** A stat card worked out from the rows: total, matching rows, distinct values or a sum. */
export interface SummaryStat {
  label: string;
  icon: string;
  tone: Tone | 'purple';
  kind: 'total' | 'match' | 'distinct' | 'sum';
  column?: string;
  values?: string[];
}

export interface SummaryTab {
  id: OrgTabId;
  title: string;
  singular: string;
  /** Column offered as the second filter next to Status. */
  filterKey: string;
  /** Column holding the record status shown in the status filter. */
  statusKey: string;
  columns: SummaryColumn[];
  stats: SummaryStat[];
  rows: SummaryRow[];
}
