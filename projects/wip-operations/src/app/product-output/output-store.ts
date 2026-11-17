/**
 * Output units for a job, shared by the Product / Output and Progress Log pages.
 * Kept in memory; empty until the production API is wired up.
 */

export type Disposition = 'Accepted' | 'Awaiting QC' | 'Rework' | 'Rejected';
export type HandoverState = 'Received' | 'Pending' | 'Not eligible';

export interface OutputUnit {
  serial: string;
  stage: string;
  producedAt: string;
  operator: string;
  disposition: Disposition;
  inspection: string;
  inspectionRef: string;
  location: string;
  /** Goods receipt the unit was handed over on (empty until received into stock). */
  handoverRef: string;
  /** Asset register tag once registered (qualifying serialized equipment). */
  assetTag: string;
  notes: string;
  evidence: number;
  reworkCount: number;
  rejectReason: string;
  history: { at: string; by: string; text: string }[];
}

export interface Handover {
  ref: string;
  store: string;
  at: string;
  by: string;
  serials: string[];
}

export interface OutputJob {
  code: string;
  name: string;
  status: string;
  item: string;
  batch: string;
  uom: string;
  site: string;
  planned: number;
  routing: string;
}

/** The job whose output is shown; blank until the production API is wired up. */
export const OUTPUT_JOB: OutputJob = { code: '', name: '', status: '', item: '', batch: '', uom: '', site: '', planned: 0, routing: '' };
export const OUTPUT_COMPONENTS: { part: string; ref: string }[] = [];
export const OUTPUTS: OutputUnit[] = [];
export const HANDOVERS: Handover[] = [];
/** Stores, locations, operators and stages for the dialogs; filled from master data once the API is wired. */
export const OUTPUT_LISTS: { stores: string[]; locations: string[]; operators: string[]; stages: string[] } = { stores: [], locations: [], operators: [], stages: [] };

/** Only accepted units can be received into stock. */
export function handoverState(u: OutputUnit): HandoverState {
  if (u.disposition !== 'Accepted') return 'Not eligible';
  return u.handoverRef ? 'Received' : 'Pending';
}

const pad = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Current local time as yyyy-MM-ddTHH:mm (shared by the Product / Output and Progress Log pages). */
export function nowStamp(): string {
  return stamp(new Date());
}
