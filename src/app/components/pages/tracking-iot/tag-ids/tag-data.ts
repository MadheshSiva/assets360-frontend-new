/**
 * DEMO MODE: identifier registry for Tracking & IoT → Tag IDs. Tags are generated once from a fixed seed and kept in
 * memory for the session (register / assign / reassign / unassign / deactivate change them in place).
 * Assets from the asset register keep their real tags so "View Asset" opens the asset; the rest of the estate uses
 * generated asset codes.
 */
import { ASSET_RECORDS } from '../../assets/asset-data';

export type Tech = 'Barcode' | 'QR Code' | 'Passive RFID' | 'BLE';
export type TagType = 'Label' | 'Hard Tag' | 'Beacon';
export type TagStatus = 'Assigned' | 'Available' | 'Inactive';

export interface LinkedAsset {
  /** Asset code, e.g. GEN-00045 or FL-008. */
  tag: string;
  /** Short kind shown before the code, e.g. "Forklift". */
  kind: string;
  /** True when the asset exists in the asset register (has a detail page). */
  real: boolean;
}

export interface TagEvent {
  at: number;
  text: string;
  by: string;
}

export interface TagId {
  id: string;
  tech: Tech;
  type: TagType;
  /** EPC, barcode number, QR payload or BLE MAC. */
  code: string;
  asset: LinkedAsset | null;
  site: string;
  location: string;
  status: TagStatus;
  /** epoch ms, or null when never assigned. */
  assignedOn: number | null;
  /** epoch ms of the last read / scan, or null. */
  lastSeen: number | null;
  /** Reader that saw the tag last. */
  reader: string;
  registeredOn: number;
  history: TagEvent[];
  /** Set when the tag is changed on this page (moves it to the top of the list). */
  touched?: number;
}

export const TECHS: Tech[] = ['Barcode', 'QR Code', 'Passive RFID', 'BLE'];
export const TYPES: TagType[] = ['Label', 'Hard Tag', 'Beacon'];
export const STATUSES: TagStatus[] = ['Assigned', 'Available', 'Inactive'];
export const PREFIX: Record<Tech, string> = { Barcode: 'BC', 'QR Code': 'QR', 'Passive RFID': 'RFID', BLE: 'BLE' };
export const DEFAULT_TYPE: Record<Tech, TagType> = { Barcode: 'Label', 'QR Code': 'Label', 'Passive RFID': 'Hard Tag', BLE: 'Beacon' };

export const SITES: { name: string; locations: string[]; code: string }[] = [
  { name: 'Dubai Plant', code: 'DXB', locations: ['Utilities', 'Warehouse', 'Roof', 'Production Hall', 'Workshop'] },
  { name: 'Abu Dhabi', code: 'AUH', locations: ['Building A', 'Building B', 'Data Hall'] },
  { name: 'Sharjah Warehouse', code: 'SHJ', locations: ['Zone A', 'Zone B', 'Loading Bay'] },
  { name: 'Al Ain Depot', code: 'AAN', locations: ['Yard', 'Workshop'] },
  { name: 'Central Store', code: 'CST', locations: [] },
];

const KINDS: Record<Tech, [string, string][]> = {
  Barcode: [['Generator', 'GEN'], ['Pump', 'PMP'], ['Compressor', 'CMP'], ['Laptop', 'LT'], ['Panel', 'PNL']],
  'QR Code': [['Pump', 'PMP'], ['Tool Kit', 'TK'], ['Ladder', 'LD'], ['Fire Extinguisher', 'FE']],
  'Passive RFID': [['Forklift', 'FL'], ['Pallet Jack', 'PJ'], ['Vehicle', 'VEH'], ['Container', 'CNT']],
  BLE: [['Chiller', 'CH'], ['AHU', 'AHU'], ['Forklift', 'FL'], ['Vehicle', 'VEH']],
};
const COUNTS: Record<Tech, number> = { Barcode: 820, 'QR Code': 640, 'Passive RFID': 760, BLE: 266 };
const START: Record<Tech, number> = { Barcode: 200, 'QR Code': 200, 'Passive RFID': 8600, BLE: 2500 };
const USERS = ['John Doe', 'Ahmed Khan', 'Priya Nair', 'Ravi Patel', 'Stores Team'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n: number, len: number) => n.toString(16).toUpperCase().padStart(len, '0').slice(-len);

export function tagIdOf(tech: Tech, n: number): string {
  return `${PREFIX[tech]}-${String(n).padStart(6, '0')}`;
}

export function codeFor(tech: Tech, n: number, rng: () => number = Math.random): string {
  switch (tech) {
    case 'Barcode':
      return `629104${String(100000 + n).slice(-6)}`;
    case 'QR Code':
      return `A360|${tagIdOf(tech, n)}|${hex(Math.floor(rng() * 0xffffff), 6)}`;
    case 'Passive RFID':
      return `3008 33B2 DDD9 0140 ${hex(Math.floor(n / 65536), 4)} ${hex(n, 4)}`;
    case 'BLE':
      return `AC:23:3F:${hex(Math.floor(rng() * 256), 2)}:${hex(Math.floor(rng() * 256), 2)}:${hex(n & 255, 2)}`;
  }
}

export function readerFor(tech: Tech, siteCode: string, rng: () => number = Math.random): string {
  const k = 1 + Math.floor(rng() * 4);
  if (tech === 'BLE') return `Gateway GW-${siteCode}-0${k}`;
  if (tech === 'Passive RFID') return `RFID portal RP-${siteCode}-0${k}`;
  return `Handheld scanner HS-0${k}`;
}

const MIN = 60_000;
const DAY = 86_400_000;

function build(): TagId[] {
  const rng = mulberry32(9183);
  const now = Date.now();
  const tags: TagId[] = [];

  // rows shown in the design, recent and in this order
  const fixed: [Tech, number, string | null, string, string, TagStatus, number][] = [
    ['Barcode', 842, 'Generator|GEN-042', 'Dubai Plant', 'Utilities', 'Assigned', 6],
    ['QR Code', 843, 'Pump|PMP-118', 'Abu Dhabi', 'Building A', 'Assigned', 9],
    ['Passive RFID', 9183, 'Forklift|FL-008', 'Dubai Plant', 'Warehouse', 'Assigned', 11],
    ['BLE', 2951, 'Chiller|CH-011', 'Dubai Plant', 'Roof', 'Assigned', 2],
    ['QR Code', 844, null, 'Central Store', '', 'Available', 0],
  ];
  for (const [tech, n, asset, site, location, status, minsAgo] of fixed) {
    const [kind, code] = asset ? asset.split('|') : ['', ''];
    const siteCode = SITES.find((s) => s.name === site)!.code;
    // the unassigned design row was registered a few minutes ago
    const registeredOn = asset ? now - (200 + Math.floor(rng() * 300)) * DAY : now - 13 * MIN;
    const assignedOn = asset ? (n === 9183 ? new Date(2026, 7, 14, 9, 21).getTime() : now - (30 + Math.floor(rng() * 300)) * DAY) : null;
    tags.push({
      id: tagIdOf(tech, n), tech, type: DEFAULT_TYPE[tech], code: n === 9183 ? '3008 33B2 DDD9 0140 0000 0001' : codeFor(tech, n, rng),
      asset: asset ? { tag: code, kind, real: false } : null, site, location, status,
      assignedOn, lastSeen: asset ? now - minsAgo * MIN : null, reader: readerFor(tech, siteCode, rng), registeredOn, history: [],
    });
  }

  // the rest of the estate
  const statusPool: TagStatus[] = [
    ...Array<TagStatus>(2214 - 4).fill('Assigned'),
    ...Array<TagStatus>(198 - 1).fill('Available'),
    ...Array<TagStatus>(74).fill('Inactive'),
  ];
  for (let i = statusPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [statusPool[i], statusPool[j]] = [statusPool[j], statusPool[i]];
  }
  const taken = new Set(tags.map((t) => t.id));
  let p = 0;
  for (const tech of TECHS) {
    const need = COUNTS[tech] - tags.filter((t) => t.tech === tech).length;
    let n = START[tech];
    for (let k = 0; k < need; k++) {
      while (taken.has(tagIdOf(tech, n))) n++;
      const id = tagIdOf(tech, n);
      taken.add(id);
      const status = statusPool[p++];
      const site = SITES[Math.floor(rng() * SITES.length)];
      const location = site.locations.length ? site.locations[Math.floor(rng() * site.locations.length)] : '';
      const [kind, prefix] = KINDS[tech][Math.floor(rng() * KINDS[tech].length)];
      const registeredOn = now - (60 + Math.floor(rng() * 700)) * DAY;
      const assigned = status === 'Assigned';
      const lastSeen = status === 'Assigned'
        ? now - (tech === 'BLE' ? 15 + Math.floor(rng() * 240) : tech === 'Passive RFID' ? 20 + Math.floor(rng() * 900) : 30 + Math.floor(rng() * 20 * 1440)) * MIN
        : status === 'Inactive' ? now - (40 + Math.floor(rng() * 200)) * DAY : null;
      tags.push({
        id, tech, type: tech === 'Passive RFID' && rng() < 0.25 ? 'Label' : DEFAULT_TYPE[tech], code: codeFor(tech, n, rng),
        asset: assigned ? { tag: `${prefix}-${String(1 + Math.floor(rng() * 640)).padStart(3, '0')}`, kind, real: false } : null,
        site: site.name, location, status,
        assignedOn: assigned ? Math.max(registeredOn + DAY, now - Math.floor(rng() * 500) * DAY) : null,
        lastSeen, reader: readerFor(tech, site.code, rng), registeredOn, history: [],
      });
      n++;
    }
  }

  // assets from the register keep their own identifiers (one asset can carry several)
  const assignedPool = tags.filter((t, i) => i >= fixed.length && t.status === 'Assigned');
  let q = 0;
  for (const a of ASSET_RECORDS) {
    const count = a.tag === 'GEN-00045' ? 3 : 1 + (a.id % 2);
    const techs = TECHS.slice(0, count);
    for (const tech of techs) {
      const t = assignedPool.slice(q).find((x) => x.tech === tech);
      if (!t) continue;
      q = assignedPool.indexOf(t) + 1;
      t.asset = { tag: a.tag, kind: a.type, real: true };
    }
  }

  for (const t of tags) t.history = seedHistory(t, rng);
  return tags;
}

function seedHistory(t: TagId, rng: () => number): TagEvent[] {
  const by = () => USERS[Math.floor(rng() * USERS.length)];
  const h: TagEvent[] = [{ at: t.registeredOn, text: `Registered as ${t.tech} ${t.type.toLowerCase()}`, by: by() }];
  if (t.status === 'Assigned' && t.asset && t.assignedOn) {
    h.push({ at: t.assignedOn, text: `Assigned to ${t.asset.kind} ${t.asset.tag}`, by: by() });
    // many tags were on another asset before (tags are reused when an asset is retired or re-tagged)
    const span = t.assignedOn - t.registeredOn;
    if (span > 30 * DAY && rng() < 0.6) {
      const [kind, prefix] = KINDS[t.tech][Math.floor(rng() * KINDS[t.tech].length)];
      const prior = `${kind} ${prefix}-${String(1 + Math.floor(rng() * 640)).padStart(3, '0')}`;
      h.push(
        { at: t.registeredOn + Math.floor(span * (0.1 + rng() * 0.3)), text: `Assigned to ${prior}`, by: by() },
        { at: t.assignedOn - Math.floor((1 + rng() * 20) * DAY), text: `Unassigned from ${prior}`, by: by() },
      );
    }
  }
  if (t.status === 'Inactive') {
    const at = (t.lastSeen ?? t.registeredOn) + DAY * (1 + Math.floor(rng() * 10));
    h.push({ at, text: rng() < 0.5 ? 'Deactivated: tag damaged' : 'Deactivated: asset disposed', by: by() });
  }
  if (t.lastSeen) h.push({ at: t.lastSeen, text: `Last read by ${t.reader}`, by: 'System' });
  return h.sort((a, b) => b.at - a.at);
}

export const TAGS: TagId[] = build();

/** Latest read (or registration for never-read tags) or change on this page; orders the list. */
export function lastActivity(t: TagId): number {
  return Math.max(t.lastSeen ?? t.registeredOn, t.touched ?? 0);
}

/** Asset codes already used, for the assign / reassign pickers. */
export function knownAssets(): LinkedAsset[] {
  const map = new Map<string, LinkedAsset>();
  for (const a of ASSET_RECORDS) map.set(a.tag, { tag: a.tag, kind: a.type, real: true });
  for (const t of TAGS) if (t.asset && !map.has(t.asset.tag)) map.set(t.asset.tag, t.asset);
  return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Next free number for a technology. */
export function nextNumber(tech: Tech): number {
  const nums = TAGS.filter((t) => t.tech === tech).map((t) => Number(t.id.split('-')[1]) || 0);
  return Math.max(0, ...nums) + 1;
}
