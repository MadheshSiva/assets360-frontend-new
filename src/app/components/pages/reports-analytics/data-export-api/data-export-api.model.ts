export type ExportFormat = 'CSV' | 'XLSX' | 'JSON' | 'Parquet' | 'API';
export type DeliveryType = 'S3' | 'Secure FTP' | 'Email' | 'API';
export type ExportStatus = 'Success' | 'Running' | 'Scheduled' | 'Failed' | 'Paused' | 'Draft';
export type Frequency = 'Real-time' | 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | 'On demand';
export type FieldType = 'id' | 'text' | 'number' | 'money' | 'percent' | 'date';

export type ConnectionType = 'REST' | 'OData' | 'JDBC';
export type ConnectionStatus = 'Connected' | 'Warning' | 'Disconnected' | 'Testing';

export interface DatasetField {
  group: string;
  name: string;
  type: FieldType;
}

export interface Dataset {
  id: string;
  name: string;
  modules: string[];
  /** Field groups (see FIELD_GROUPS) that make up the dataset */
  groups: string[];
  rows: number;
  sizeGb: number;
  refreshed: string;
  owner: string;
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
  /** Where the file lands: bucket path, SFTP host, recipients or connection name */
  target: string;
  /** Short label shown in the Destination column (S3, SFTP, Snowflake, Power BI…) */
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
  /** Size of one delivery, in GB */
  sizeGb: number;
  lastError?: string;
}

export interface ApiConnection {
  id: string;
  name: string;
  type: ConnectionType;
  baseUrl: string;
  auth: string;
  status: ConnectionStatus;
  uptime: number;
  lastTested: string;
  /** Only whether a secret is stored — the value itself is never kept in the browser */
  secretStored: boolean;
  certExpiresInDays: number;
  syncDelayMin: number;
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
