/** Issue / delay records for WIP jobs.  */
export type IssueStatus = 'Open' | 'Investigating' | 'Action in progress' | 'Awaiting verification' | 'Closed';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type ActionStatus = 'Pending' | 'In progress' | 'Done';

export interface CorrectiveAction {
  id: number;
  text: string;
  owner: string;
  /** Local time, "YYYY-MM-DDTHH:mm". */
  due: string;
  status: ActionStatus;
  /** Must be done before the issue can close. */
  mandatory: boolean;
}

/** A delay on the job; `end` is empty while the delay is still running. */
export interface DelayEvent {
  start: string;
  end: string;
}

export interface Escalation {
  at: string;
  level: string;
  to: string;
  reason: string;
  by: string;
}

export interface HistoryEntry {
  at: string;
  by: string;
  text: string;
}

export interface Issue {
  id: string;
  title: string;
  /** Longer headline shown in the details panel. */
  summary: string;
  type: string;
  site: string;
  job: string;
  stage: string;
  task: string;
  asset: string;
  severity: Severity;
  priority: string;
  owner: string;
  responsible: string;
  status: IssueStatus;
  reportedBy: string;
  reportedAt: string;
  due: string;
  description: string;
  /** Blocking stops the stage; non-blocking lets work continue. */
  blocking: boolean;
  delays: DelayEvent[];
  /** SLA clock on the affected stage. */
  sla: string;
  slaTimer: 'Running' | 'Paused';
  slaPause: '' | 'Requested' | 'Approved';
  workOrder: string;
  photos: number;
  logs: number;
  rootCause: string;
  actions: CorrectiveAction[];
  resolution: string;
  verificationOwner: string;
  retestPassed: boolean;
  evidenceReviewed: boolean;
  closedAt: string;
  escalations: Escalation[];
  history: HistoryEntry[];
}
