/** Work permits and their compliance evidence for WIP jobs.  */
export type PermitStatus = 'Awaiting Approval' | 'Approved' | 'Suspended' | 'Rejected' | 'Closed';
/** Status shown to users, derived from the stored status and the validity window. */
export type PermitState = 'Active' | 'Expiring Soon' | 'Expired' | 'Scheduled' | 'Awaiting Approval' | 'Suspended' | 'Rejected' | 'Closed';
export type CheckResult = 'Verified' | 'Valid' | 'Complete' | 'Pending' | 'Missing';

export interface ApprovalStep {
  step: string;
  status: 'Approved' | 'Pending' | 'Rejected';
  by: string;
  at: string;
}

export interface Evidence {
  kind: string;
  ref: string;
  /** Empty when the evidence has no expiry. */
  validTo: string;
}

export interface ChecklistItem {
  requirement: string;
  evidence: string;
  owner: string;
  result: CheckResult;
}

/** Job Authorization Gate conditions other than "permit active", which comes from the permit itself. */
export interface GateChecks {
  riskAssessment: boolean;
  personnelQualified: boolean;
  calibrationValid: boolean;
  isolationsConfirmed: boolean;
  supervisorRelease: boolean;
}

export interface RiskAssessment {
  ref: string;
  hazards: string[];
  controls: string[];
  rating: 'Low' | 'Medium' | 'High';
  status: 'Approved' | 'Pending';
  reviewedBy: string;
}

export interface Extension {
  until: string;
  reason: string;
  requestedBy: string;
  at: string;
}

export interface Permit {
  id: string;
  type: string;
  site: string;
  job: string;
  stage: string;
  asset: string;
  location: string;
  owner: string;
  issuingAuthority: string;
  validFrom: string;
  validUntil: string;
  status: PermitStatus;
  scope: string;
  precautions: string[];
  approvals: ApprovalStep[];
  evidence: Evidence[];
  checklist: ChecklistItem[];
  gate: GateChecks;
  risk: RiskAssessment;
  /** Pending extension request (needs approval). */
  extension: Extension | null;
  suspendReason: string;
  /** Permit this one replaces (e.g. after expiry). */
  replaces: string;
}

export interface PermitEvent {
  at: string;
  permit: string;
  action: string;
  by: string;
  note: string;
}
