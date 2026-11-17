/**
 * Identifier registry for Tracking & IoT → Tag Management. Tags are loaded from /api/tag-ids
 * (tag-id-api.service.ts); register / assign / reassign / replace / unassign / deactivate / delete save through the API.
 */

export type Tech = 'Barcode' | 'QR Code' | 'Passive RFID' | 'Active RFID' | 'BLE' | 'NFC';
export type TagType = 'Label' | 'Hard Tag' | 'Beacon';
export type TagStatus = 'Assigned' | 'Available' | 'Inactive';

export interface LinkedAsset {
  /** Asset code, e.g. GEN-00045 or FL-008. */
  tag: string;
  /** Asset name (or "Asset" when the API has none), shown before the code. */
  kind: string;
  /** True when the asset exists in the asset register (has a detail page). */
  real: boolean;
}

export interface TagEvent {
  at: number;
  text: string;
  by: string;
}

export interface TagRead {
  at: number;
  reader: string;
  rssi: number | null;
  battery: number | null;
}

export interface TagId {
  id: string;
  tech: Tech;
  type: TagType;
  /** EPC, barcode number, QR payload or BLE MAC (`value` of the API; empty when not recorded). */
  code: string;
  asset: LinkedAsset | null;
  site: string;
  location: string;
  status: TagStatus;
  /** epoch ms, or null when never assigned / not recorded. */
  assignedOn: number | null;
  /** epoch ms of the last read / scan, or null. */
  lastSeen: number | null;
  /** Reader that saw the tag last (not recorded by the API). */
  reader: string;
  registeredOn: number;
  history: TagEvent[];
  /** Set when the tag is changed on this page (moves it to the top of the list). */
  touched?: number;
  /** BLE only: reported firmware version, battery % and signal strength (dBm). */
  firmware?: string;
  battery?: number;
  rssi?: number;
  /** Recent reads, newest first, when reported. */
  reads?: TagRead[];
  /** Master-data site id stored with the tag. */
  siteId?: string | null;
  /** The tag type text as the API stores it (e.g. "Barcode Label"). */
  apiTagType?: string;
  /** Server-side validation ("Valid" / "Invalid") and its reason, from GET /api/tag-ids. */
  apiValidation?: string | null;
  apiValidationMessage?: string | null;
  /** Name of the encoded value for the technology (EPC, MAC Address, ...). */
  valueLabel?: string | null;
}

/** Technologies offered (replaced by GET /api/tag-ids/options on load). */
export const TECHS: Tech[] = ['Barcode', 'QR Code', 'Passive RFID', 'Active RFID', 'BLE', 'NFC'];
export const TYPES: TagType[] = ['Label', 'Hard Tag', 'Beacon'];
export const STATUSES: TagStatus[] = ['Assigned', 'Available', 'Inactive'];
/** Tag id prefix per technology (updated from GET /api/tag-ids/options). */
export const PREFIX: Record<Tech, string> = { Barcode: 'BC', 'QR Code': 'QR', 'Passive RFID': 'RFID', 'Active RFID': 'RFID', BLE: 'BLE', NFC: 'NFC' };
export const DEFAULT_TYPE: Record<Tech, TagType> = { Barcode: 'Label', 'QR Code': 'Label', 'Passive RFID': 'Hard Tag', 'Active RFID': 'Hard Tag', BLE: 'Beacon', NFC: 'Label' };

/** Sites (master data plus those named on tags) and the locations used on tags; `code` is the master-data site id. */
export const SITES: { name: string; locations: string[]; code: string }[] = [];

/** Adds a site (and location) the pickers do not list yet. */
export function ensureSite(name: string, code: string | null | undefined, location = ''): void {
  if (!name) return;
  let site = SITES.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!site) SITES.push((site = { name, code: code ?? '', locations: [] }));
  else if (!site.code && code) site.code = code;
  if (location && !site.locations.includes(location)) site.locations.push(location);
}

export function tagIdOf(tech: Tech, n: number): string {
  return `${PREFIX[tech] ?? 'TAG'}-${String(n).padStart(6, '0')}`;
}

/** Same rule as the Tracking API (TagId): letters, digits, '-' and '_', at most 50 characters. */
const TAG_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

/**
 * Tag ID from the "Tag number" field (Register and Import):
 * - a plain number becomes the numbered id, e.g. 123 -> BLE-000123;
 * - a device id such as a BLE MAC "c300009aaf43" is kept exactly as entered, because readings are matched to
 *   registered tags by this id (NetworkTimeSeries meta.tagid = TrackingTag tag_id).
 * Null when empty, zero or not allowed by the API.
 */
export function tagIdFromNumber(tech: Tech, input: string | number | null | undefined): string | null {
  const value = String(input ?? '').trim();
  if (/^\d+$/.test(value)) return Number(value) > 0 ? tagIdOf(tech, Number(value)) : null;
  return TAG_ID_PATTERN.test(value) ? value : null;
}

/** Tags loaded from the API. */
export const TAGS: TagId[] = [];

/** Latest read (or registration for never-read tags) or change on this page; orders the list. */
export function lastActivity(t: TagId): number {
  return Math.max(t.lastSeen ?? t.registeredOn, t.touched ?? 0);
}

/** Asset codes already used, for the assign / reassign pickers. */
export function knownAssets(): LinkedAsset[] {
  const map = new Map<string, LinkedAsset>();
  for (const t of TAGS) if (t.asset && !map.has(t.asset.tag)) map.set(t.asset.tag, t.asset);
  return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * 'Invalid': the server's validation failed (e.g. "EPC is missing"); 'Invalid format' / 'Duplicate': the page's checks of the
 * encoded value; 'Not recorded': no value and no server verdict.
 */
export type Validation = 'Valid' | 'Invalid' | 'Invalid format' | 'Duplicate' | 'Not recorded';

/** Format rule per technology: 12–13 digit barcode, any QR payload, 96-bit EPC (24 hex), BLE MAC. */
export function formatError(tech: Tech, code: string): string {
  const c = code.trim();
  if (!c) return 'Encoded value is empty';
  switch (tech) {
    case 'Barcode':
      return /^\d{12,13}$/.test(c) ? '' : 'Barcode must be 12 or 13 digits';
    case 'QR Code':
      return c.length <= 512 ? '' : 'QR payload is longer than 512 characters';
    case 'Passive RFID':
      return /^[0-9A-F]{24}$/i.test(c.replace(/ /g, '')) ? '' : 'EPC must be 24 hex characters (96-bit)';
    case 'BLE':
      return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(c) ? '' : 'MAC must look like AC:23:3F:12:AB:01';
    default:
      return '';
  }
}

/** Next free number for a technology prefix. */
export function nextNumber(tech: Tech): number {
  const prefix = PREFIX[tech] + '-';
  const nums = TAGS.filter((t) => t.id.startsWith(prefix)).map((t) => Number(t.id.slice(prefix.length)) || 0);
  return Math.max(0, ...nums) + 1;
}
