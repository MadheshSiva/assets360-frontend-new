/** SLA policies, live timers and their history.  */
export type SlaScope = 'Job' | 'Stage' | 'Task' | 'Issue';
export type PolicyStatus = 'Active' | 'Draft' | 'Inactive';
export type TimerState = 'Within Target' | 'At Risk' | 'Breached' | 'Paused';

export interface EscalationStep {
  /** "pct" = percent of the completion target elapsed; "overdue" = minutes past due. */
  trigger: 'pct' | 'overdue';
  value: number;
  action: string;
}

export interface SlaPolicy {
  id: string;
  name: string;
  scope: SlaScope;
  appliesTo: string;
  priority: string;
  responseMin: number;
  completionMin: number;
  calendar: string;
  timeZone: string;
  status: PolicyStatus;
  version: number;
  startEvent: string;
  stopEvent: string;
  pauseStates: string;
  resumeEvent: string;
  pauseRequiresApproval: boolean;
  excludeNonWorking: boolean;
  warningPct: number;
  escalationMatrix: string;
  channels: string;
  ladder: EscalationStep[];
}

export interface WorkCalendar {
  name: string;
  /** Short name used in the policy table. */
  label: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  start: string;
  end: string;
  holidays: string[];
  note: string;
}

export interface SlaTimer {
  id: string;
  job: string;
  stage: string;
  policyId: string;
  owner: string;
  /** Local time the clock started, "YYYY-MM-DDTHH:mm". */
  start: string;
  targetMin: number;
  /** Approved pause time already taken off the clock. */
  pausedMin: number;
  paused: boolean;
  /** When the current pause started (empty when running). */
  pausedAt: string;
  pauseReason: string;
  /** Shown on the monitoring card. */
  watch: boolean;
  breachReason: string;
}

export interface SlaEscalation {
  at: string;
  job: string;
  stage: string;
  policyId: string;
  step: string;
  notified: string;
  channel: string;
  acknowledged: string;
}

export interface CompletedSla {
  policyId: string;
  job: string;
  targetMin: number;
  actualMin: number;
  completedAt: string;
}

export interface PolicyVersion {
  policyId: string;
  version: number;
  at: string;
  by: string;
  note: string;
}
