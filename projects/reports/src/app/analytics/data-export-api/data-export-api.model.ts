export type ExportFormat = 'CSV' | 'XLSX' | 'JSON';
export type DeliveryType = 'S3' | 'Secure FTP' | 'Email' | 'API';
export type ExportStatus = 'Success' | 'Running' | 'Scheduled' | 'Failed' | 'Paused' | 'Draft';
export type Frequency = 'Real-time' | 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | 'On demand';
export type FieldType = 'id' | 'text' | 'number' | 'money' | 'percent' | 'date';

export type ConnectionType = 'REST' | 'OData' | 'JDBC';
export type ConnectionStatus = 'Untested' | 'Connected' | 'Warning' | 'Disconnected' | 'Testing';

export interface DatasetField {
  group: string;
  name: string;
  type: FieldType;
}

/** A dataset backed by one live collection (GET /api/data-export/datasets). */
export interface Dataset {
  id: string;
  name: string;
  description: string;
  modules: string[];
  groups: string[];
  fields: DatasetField[];
  rows: number;
  /** Approximate stored size; null when the database does not report it */
  sizeBytes: number | null;
  /** Newest record ("yyyy-MM-ddTHH:mm", GST); null when the dataset is empty */
  refreshed: string | null;
  /** The service that owns the data */
  owner: string;
  /** Export jobs built on this dataset */
  exports: number;
}

export interface ExportFilter {
  field: string;
  operator: string;
  value: string;
}

export interface ExportJob {
  id: string;
  name: string;
  module: string;
  datasetId: string;
  format: ExportFormat;
  delivery: DeliveryType;
  /** Where the file should land: bucket path, SFTP host, recipients or connection name */
  target: string;
  /** Short label shown in the Destination column (S3, SFTP, Email or the connection name) */
  destination: string;
  frequency: Frequency;
  time: string;
  lastRun: string | null;
  nextRun: string | null;
  status: ExportStatus;
  owner: string;
  fields: string[];
  filters: ExportFilter[];
  encrypted: boolean;
  lastError?: string;
  /** Latest run; its generated file can be downloaded */
  lastRunId: string | null;
  lastRowCount: number | null;
  lastSizeBytes: number | null;
}

/** One run from the run history (POST /jobs/{id}/run, GET /runs). */
export interface ExportRun {
  id: string;
  jobId: string;
  jobName: string;
  status: 'Success' | 'Failed';
  startedAt: string | null;
  rowCount: number;
  sizeBytes: number;
  fileName: string | null;
  hasFile: boolean;
  deliveryStatus: string;
  /** "not delivered: no transport configured" while no S3 / SFTP / e-mail / API transport exists */
  deliveryMessage: string | null;
  error: string | null;
}

export interface ApiConnection {
  id: string;
  name: string;
  type: ConnectionType;
  baseUrl: string;
  auth: string;
  authClientId: string | null;
  status: ConnectionStatus;
  /** Share of successful tests in the last 30 days; null when never tested */
  uptime: number | null;
  lastTested: string | null;
  lastTestMessage: string | null;
  /** Only whether a secret is stored and its mask — the value itself is never kept */
  secretStored: boolean;
  secretMask: string | null;
  /** From the server certificate seen by the last test; null when unknown */
  certExpiresInDays: number | null;
  owner: string;
}

export type LogResult = 'Success' | 'Denied' | 'Failed';

export interface AccessLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  resource: string;
  client: string;
  ip: string;
  result: LogResult;
}

/** Daily run and access counts (oldest first), from the run history and access logs. */
export interface RunStats {
  labels: string[];
  success: number[];
  failed: number[];
  generatedBytes: number[];
  accessOk: number[];
  accessFailed: number[];
  successRate: number | null;
}

/** Headline figures; "WeekAgo" counts are current items that already existed seven days ago. */
export interface ExportSummary {
  activeExports: number;
  activeExportsWeekAgo: number;
  connections: number;
  connectionsWeekAgo: number;
  scheduledJobs: number;
  scheduledJobsWeekAgo: number;
  successRate30: number | null;
  successRatePrevious30: number | null;
  generatedBytes30: number;
  generatedBytesPrevious30: number;
  deliveryNote: string;
}

/** Export Builder output, turned into a job by the service */
export interface ExportDraft {
  id: string | null;
  name: string;
  datasetId: string;
  format: ExportFormat;
  fields: string[];
  filters: ExportFilter[];
  delivery: DeliveryType;
  target: string;
  frequency: Frequency;
  time: string;
  encrypted: boolean;
}

export interface DatasetSample {
  header: string[];
  rows: (string | number | null)[][];
  totalRows: number;
}
