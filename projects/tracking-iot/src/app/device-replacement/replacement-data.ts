/*
 * Device Replacement — types, helpers and in-memory session state.
 * Stock comes from the Tracking API (/api/replacement-devices); the queue of devices needing replacement is the IoT
 * devices whose health is Critical (/api/iot-devices) plus a device opened from another page (?device=…).
 * Replacement requests and drafts have no endpoint and are kept for the session.
 */

export type DeviceKind = 'beacon' | 'vibration' | 'temperature' | 'gps' | 'other';
/** IoT device health as the API reports it (Good, Warning, Critical) or Retired once replaced in this session. */
export type Health = string;
export type CheckStatus = 'pass' | 'warn' | 'fail';
/** One of the API's ReplacementCompatibility values. */
export type Compat = 'Compatible' | 'Partial' | 'Incompatible';
export const REASONS = ['Battery failure', 'Hardware fault', 'End of life', 'Damaged', 'Upgrade'];

export interface HistoryEvent { at: string; kind: 'install' | 'alert' | 'maint' | 'fw' | 'info' | 'replace'; text: string }

export interface ExistingDevice {
  id: string;
  kind: DeviceKind;
  type: string;
  model: string;
  /** Connectivity of the IoT device, e.g. LoRaWAN. */
  protocol: string;
  /** Percent, or null for mains-powered / not reported. */
  battery: number | null;
  status: Health;
  assetId: string;
  assetName: string;
  site: string;
  /** Not provided by the API (shown as —). */
  zone: string;
  gateway: string;
  firmware: string;
  /** Not provided by the API (shown as —). */
  channels: string[];
  lastSeen: string; // ISO local, '' when never seen
  reason: string;
  group: string;
  history: HistoryEvent[];
}

export interface Candidate {
  id: string;
  model: string;
  protocol: string;
  battery: number | null;
  location: string;
  /** Available / Reserved / Unavailable. */
  availability: string;
  /** Compatibility recorded on the stock record. */
  compatibility: Compat;
}

export interface CheckResult { key: string; name: string; status: CheckStatus; text: string }

/** Devices awaiting replacement (filled from the API). */
export const QUEUE: ExistingDevice[] = [];

/** Spare devices (filled from the API). */
export const STOCK: Candidate[] = [];

/** Placeholder used while no device is selected (all fields blank). */
export function blankDevice(): ExistingDevice {
  return { id: '', kind: 'other', type: '', model: '', protocol: '', battery: null, status: '', assetId: '', assetName: '', site: '', zone: '', gateway: '', firmware: '', channels: [], lastSeen: '', reason: '', group: '', history: [] };
}

/** Device family from the IoT device type, e.g. "BLE Beacon" → beacon. */
export function kindOf(type: string): DeviceKind {
  const t = type.toLowerCase();
  if (t.includes('beacon') || t.includes('ble') || t.includes('tag')) return 'beacon';
  if (t.includes('vibration')) return 'vibration';
  if (t.includes('temp')) return 'temperature';
  if (t.includes('gps') || t.includes('tracker')) return 'gps';
  return 'other';
}

/** Session-only state shared across component instances (survives navigation, not a page reload). */
export interface ReplacementDraft { deviceId: string; reason: string; candidateId: string; step: number; opts: Record<string, boolean>; savedAt: string }
export const SESSION = {
  draft: null as ReplacementDraft | null,
  requests: {} as Record<string, string>,
  nextRequest: 1,
  completed: [] as { oldId: string; newId: string; asset: string; at: string }[],
};

/** First word of a protocol, lower-case: "LoRaWAN 1.0.3" → "lorawan". */
function protoKey(p: string): string {
  return p.trim().split(/[\s/]+/)[0]?.toLowerCase() ?? '';
}

/** Checks that can be made from the records the API holds. */
export function checksFor(d: ExistingDevice, c: Candidate): CheckResult[] {
  const comp: CheckStatus = c.compatibility === 'Compatible' ? 'pass' : c.compatibility === 'Partial' ? 'warn' : 'fail';
  const protoKnown = !!d.protocol && !!c.protocol;
  const sameProto = protoKnown && protoKey(d.protocol) === protoKey(c.protocol);
  const avail: CheckStatus = c.availability === 'Available' ? 'pass' : c.availability === 'Reserved' ? 'warn' : 'fail';
  const lowBattery = c.battery !== null && c.battery < 20;
  return [
    { key: 'compat', name: 'Compatibility (stock record)', status: comp, text: `${c.id} is recorded as ${c.compatibility}` },
    {
      key: 'proto', name: 'Protocol compatible', status: !protoKnown ? 'warn' : sameProto ? 'pass' : 'fail',
      text: !protoKnown ? `Protocol not recorded for ${!d.protocol ? d.id : c.id}` : sameProto ? `${c.protocol} matches ${d.protocol}` : `${c.protocol} does not match ${d.protocol}`,
    },
    { key: 'avail', name: 'Available in stock', status: avail, text: `${c.availability} at ${c.location || '—'}` },
    {
      key: 'battery', name: 'Battery level', status: lowBattery ? 'warn' : 'pass',
      text: c.battery === null ? 'Not battery powered / not reported' : lowBattery ? `Low battery (${c.battery}%) — charge or replace before install` : `${c.battery}%`,
    },
  ];
}

export function compatOf(d: ExistingDevice, c: Candidate): Compat {
  const r = checksFor(d, c);
  if (r.some((x) => x.status === 'fail')) return 'Incompatible';
  return r.some((x) => x.status === 'warn') ? 'Partial' : 'Compatible';
}
