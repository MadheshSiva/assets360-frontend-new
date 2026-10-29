import { Injectable } from '@angular/core';
import { CURRENT_USER } from '../shared/analytics-common';
import {
  DATASETS, NEXT_BY_FREQUENCY, buildConnections, buildJobs, buildLogs, buildRunStats, datasetFields, localStamp, sampleValue
} from './data-export-api.data';
import {
  AccessLog, ApiConnection, ConnectionType, Dataset, DatasetField, ExportDraft, ExportJob, ExportStatus, LogResult
} from './data-export-api.model';

/** New-connection form. The secret is only checked for presence and then dropped. */
export interface ConnectionForm {
  name: string;
  type: ConnectionType;
  baseUrl: string;
  auth: string;
  clientId: string;
  secret: string;
}

export const DESTINATION_LABEL: Record<string, string> = { S3: 'S3', 'Secure FTP': 'SFTP', Email: 'Email', API: 'API' };

// DEMO MODE: export jobs, connections and access logs live in memory; runs and connection tests are simulated
@Injectable({ providedIn: 'root' })
export class DataExportService {
  readonly datasets: Dataset[] = DATASETS;
  jobs: ExportJob[] = buildJobs();
  connections: ApiConnection[] = buildConnections();
  logs: AccessLog[] = buildLogs();
  readonly stats7 = buildRunStats(7);
  readonly stats30 = buildRunStats(30);
  /** Data delivered over the last 30 days, in TB */
  deliveredTb = 4.8;
  apiKeys = 8;
  allowlistedIps = 12;
  roles = 5;

  private seq = 1009;
  private logSeq = 5281;
  private conSeq = 6;

  dataset(id: string): Dataset | undefined {
    return this.datasets.find((d) => d.id === id);
  }

  fields(datasetId: string): DatasetField[] {
    const ds = this.dataset(datasetId);
    return ds ? datasetFields(ds) : [];
  }

  nameTaken(name: string, exceptId: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.jobs.some((j) => j.id !== exceptId && j.name.toLowerCase() === n);
  }

  connectionNameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.connections.some((c) => c.name.toLowerCase() === n);
  }

  log(action: string, resource: string, client: string, result: LogResult = 'Success'): void {
    this.logs.unshift({
      id: `LOG-${this.logSeq++}`,
      at: localStamp(new Date()),
      actor: CURRENT_USER.name,
      action,
      resource,
      client,
      ip: '10.20.4.18',
      result
    });
  }

  // ----- Export jobs -----

  /** Creates or updates a job from the Export Builder. */
  saveJob(draft: ExportDraft, status: ExportStatus): ExportJob {
    const ds = this.dataset(draft.datasetId) ?? this.datasets[0];
    const destination = draft.delivery === 'API' ? draft.target : DESTINATION_LABEL[draft.delivery];
    const values = {
      name: draft.name.trim(),
      module: ds.modules[0],
      datasetId: ds.id,
      format: draft.format,
      delivery: draft.delivery,
      target: draft.target.trim(),
      destination,
      frequency: draft.frequency,
      time: draft.frequency === 'Real-time' ? 'Continuous' : draft.time,
      fields: draft.fields.slice(),
      filters: draft.filters.map((x) => ({ ...x })),
      encrypted: draft.encrypted
    };
    const existing = draft.id ? this.jobs.find((j) => j.id === draft.id) : undefined;
    if (existing) {
      Object.assign(existing, values);
      if (existing.status === 'Draft' || status === 'Draft') existing.status = status;
      existing.nextRun = this.nextRun(existing);
      this.log('Export updated', existing.name, 'Web console');
      return existing;
    }
    const job: ExportJob = {
      id: `EXP-${this.seq++}`,
      ...values,
      lastRun: null,
      nextRun: null,
      status,
      owner: CURRENT_USER.name,
      sizeGb: Math.max(0.01, Number(((ds.sizeGb * draft.fields.length) / Math.max(1, this.fields(ds.id).length)).toFixed(2)))
    };
    job.nextRun = this.nextRun(job);
    this.jobs.unshift(job);
    this.log(status === 'Draft' ? 'Export draft saved' : 'Export created', job.name, 'Web console');
    return job;
  }

  startRun(job: ExportJob): void {
    job.status = 'Running';
    job.lastError = undefined;
    this.log('Export run started', job.name, 'Web console');
  }

  /** Settles a simulated run. Jobs whose target connection is down fail. */
  finishRun(job: ExportJob): void {
    const con = this.connections.find((c) => c.name === job.target);
    const ok = !con || con.status !== 'Disconnected';
    job.lastRun = localStamp(new Date());
    job.nextRun = this.nextRun(job);
    const last = this.stats7.success.length - 1;
    const last30 = this.stats30.success.length - 1;
    if (ok) {
      job.status = job.frequency === 'Real-time' ? 'Scheduled' : 'Success';
      this.stats7.success[last]++;
      this.stats30.success[last30]++;
      this.deliveredTb = Number((this.deliveredTb + job.sizeGb / 1000).toFixed(3));
      this.log('Export delivered', job.name, job.destination);
    } else {
      job.status = 'Failed';
      job.lastError = `${con?.name} is disconnected. Test the connection and retry.`;
      this.stats7.failed[last]++;
      this.stats30.failed[last30]++;
      this.log('Export failed', job.name, job.destination, 'Failed');
    }
  }

  pause(job: ExportJob): void {
    job.status = 'Paused';
    job.nextRun = null;
    this.log('Export paused', job.name, 'Web console');
  }

  resume(job: ExportJob): void {
    job.status = 'Scheduled';
    job.lastError = undefined;
    job.nextRun = this.nextRun(job);
    this.log('Export resumed', job.name, 'Web console');
  }

  deleteJob(job: ExportJob): void {
    this.jobs = this.jobs.filter((j) => j.id !== job.id);
    this.log('Export deleted', job.name, 'Web console');
  }

  private nextRun(job: ExportJob): string | null {
    const step = NEXT_BY_FREQUENCY[job.frequency];
    if (step <= 0 || job.status === 'Paused' || job.status === 'Draft') return null;
    return localStamp(new Date(Date.now() + step));
  }

  /** Header + 12 deterministic sample rows for a dataset (optionally limited to some fields). */
  sample(datasetId: string, fieldNames: string[] | null, rows = 12): { header: string[]; rows: (string | number)[][] } {
    let fields = this.fields(datasetId);
    if (fieldNames && fieldNames.length) fields = fields.filter((x) => fieldNames.includes(x.name));
    const out: (string | number)[][] = [];
    for (let i = 0; i < rows; i++) out.push(fields.map((x) => sampleValue(x, i)));
    return { header: fields.map((x) => x.name), rows: out };
  }

  // ----- Connections -----

  addConnection(form: ConnectionForm): ApiConnection {
    // The secret is not stored: in production it goes straight to the secrets vault (Administration > Integration & API)
    const con: ApiConnection = {
      id: `CON-${String(this.conSeq++).padStart(2, '0')}`,
      name: form.name.trim(),
      type: form.type,
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
      auth: form.auth,
      status: 'Connected',
      uptime: 100,
      lastTested: localStamp(new Date()),
      secretStored: form.secret.length > 0,
      certExpiresInDays: 365,
      syncDelayMin: 0,
      owner: CURRENT_USER.name
    };
    this.connections.push(con);
    this.log('API connection added', con.name, con.type);
    return con;
  }

  deleteConnection(con: ApiConnection): void {
    this.connections = this.connections.filter((c) => c.id !== con.id);
    this.log('API connection removed', con.name, con.type);
  }

  startTest(con: ApiConnection): void {
    con.status = 'Testing';
  }

  /** Simulated test result: a connection recovers, but an expiring certificate keeps it in Warning. */
  finishTest(con: ApiConnection): string {
    con.lastTested = localStamp(new Date());
    con.syncDelayMin = 0;
    if (con.certExpiresInDays <= 30) {
      con.status = 'Warning';
      this.log('Connection test', con.name, con.name);
      return `${con.name} responded, but its certificate expires in ${con.certExpiresInDays} days.`;
    }
    const wasDown = con.uptime < 90;
    con.status = 'Connected';
    con.uptime = wasDown ? 95.0 : Math.min(99.9, Number((con.uptime + 0.1).toFixed(1)));
    this.log('Connection test', con.name, con.name);
    return wasDown ? `${con.name} is reachable again.` : `${con.name} connection is healthy.`;
  }

  rotateCertificate(con: ApiConnection): void {
    con.certExpiresInDays = 365;
    if (con.status === 'Warning') con.status = 'Connected';
    this.log('Certificate rotated', con.name, con.name);
  }

  // ----- Headline figures -----

  get activeExports(): number {
    return this.jobs.filter((j) => j.status !== 'Paused' && j.status !== 'Draft').length;
  }

  get scheduledJobs(): number {
    return this.jobs.filter((j) => j.frequency !== 'On demand' && j.status !== 'Paused' && j.status !== 'Draft').length;
  }

  /** Share of successful runs over the last 30 days */
  get successRate(): number {
    let ok = 0;
    let all = 0;
    this.stats30.success.forEach((v, i) => {
      ok += v;
      all += v + this.stats30.failed[i];
    });
    return all ? (ok / all) * 100 : 100;
  }
}
