/** Assets from the shared register linked to WIP jobs. */
export type Allocation = 'Exclusive' | 'Shared';

export interface Inspection {
  certificate: string;
  validTo: string;
  inspectedBy: string;
}

/** A booking that is not a job link on this page (maintenance, another module's reservation). */
export interface ExternalBooking {
  label: string;
  start: string;
  end: string;
}

export interface RegisterAsset {
  tag: string;
  name: string;
  category: string;
  site: string;
  location: string;
  status: 'Available' | 'In Use' | 'Under Maintenance';
  condition: 'Good' | 'Fair' | 'Poor';
  owner: string;
  capabilities: string[];
  lastServiced: string;
  serviceIntervalDays: number;
  /** Empty when the asset needs no calibration. */
  calibrationValidTo: string;
  /** Date of the last calibration (shown under the calibration check). */
  calibratedOn?: string;
  /** Lifting and handling equipment needs a valid inspection certificate. */
  inspection: Inspection | null;
  bookings: ExternalBooking[];
}

export interface AssetLink {
  id: number;
  job: string;
  asset: string;
  role: string;
  stage: string;
  task: string;
  /** Capability the stage needs from the asset. */
  capability: string;
  /** What the asset is used for when it differs from the stage name, e.g. "Torque verification". */
  purpose?: string;
  start: string;
  end: string;
  allocation: Allocation;
  requiredForStart: boolean;
  releaseOnCompletion: boolean;
  linkedAt: string;
  by: string;
}

export interface LinkHistory {
  at: string;
  job: string;
  asset: string;
  action: 'Linked' | 'Updated' | 'Unlinked' | 'Released' | 'Inspection recorded';
  by: string;
  note: string;
}

export interface JobRef {
  code: string;
  name: string;
  status: string;
  site: string;
  templateCode: string;
  templateVersion: string;
  stages: { name: string; status: string; tasks: { name: string }[] }[];
}
