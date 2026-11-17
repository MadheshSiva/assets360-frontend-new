import { AssetRecord, TODAY } from 'shared-ui';
import DATA from './location-history.json';

/**
 * Static demo data shared by the Location History overview (every asset) and the single-asset history page.
 * DEMO MODE: kept in memory; recorded movements survive moving between the two pages.
 */

export type MovementType = 'In' | 'Out' | 'Move';

export interface Place {
  name: string;
  site: string;
  zone: string;
  type: string;
  lat: number;
  lng: number;
}

export interface Movement {
  id: number;
  /** Local time, "YYYY-MM-DDTHH:mm". */
  at: string;
  location: string;
  movement: MovementType;
  source: string;
  remarks: string;
  by: string;
}

export interface AssetHistory {
  serialNumber: string;
  assignedTo: string;
  custodian: string;
  movements: Movement[];
}

/** How a location change was captured, with its short name for tables and charts. */
export const LOCATION_SOURCES: { value: string; short: string }[] = [
  { value: 'BLE Tag', short: 'BLE' },
  { value: 'GPS Tag', short: 'GPS' },
  { value: 'Manual Update', short: 'Manual' },
  { value: 'QR Scan', short: 'QR Scan' },
  { value: 'RFID Gate', short: 'RFID' },
];

export function sourceShort(source: string): string {
  return LOCATION_SOURCES.find((s) => s.value === source)?.short ?? source;
}

const SOURCE = DATA as unknown as { locations: Place[]; geofence: [number, number][]; assets: Record<string, AssetHistory> };
export const PLACES: Place[] = SOURCE.locations;
export const GEOFENCE: [number, number][] = SOURCE.geofence;

const pad = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function parseLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function findPlace(name: string): Place {
  return PLACES.find((p) => p.name === name) ?? { name, site: '—', zone: '—', type: '—', lat: 0, lng: 0 };
}

/**
 * Assets without recorded history get a plausible one built from their tag, so every asset in the register
 * has a history. Movements are within the asset's own site and the main plant.
 */
function buildHistory(asset: AssetRecord): AssetHistory {
  let seed = 0;
  for (const ch of asset.tag) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const own = PLACES.filter((p) => p.site === asset.site);
  const plant = PLACES.filter((p) => p.site === 'Main Plant');
  const inside = own.length ? [...own, ...own, ...plant] : plant;
  const remarks: Record<string, string> = {
    Operational: 'Moved to operating area', Maintenance: 'Sent for preventive maintenance', Storage: 'Moved to storage', Deployment: 'Deployed to client site',
  };
  // Weighted like a site that is mostly tag-tracked: BLE, then manual updates, QR scans, GPS and RFID gates
  const sources = ['BLE Tag', 'BLE Tag', 'BLE Tag', 'BLE Tag', 'Manual Update', 'Manual Update', 'Manual Update', 'QR Scan', 'GPS Tag', 'RFID Gate'];
  const movements: Movement[] = [];
  // Latest movement within the four days before the demo's base day (then shifted to end today)
  let t = parseLocal('2026-10-15T08:00').getTime() - Math.floor(rnd() * 4 * 24 * 4) * 15 * 60_000;
  let last = '';
  const count = 9 + Math.floor(rnd() * 7);
  for (let i = 0; i < count; i++) {
    let place = inside[Math.floor(rnd() * inside.length)];
    if (place.name === last) place = inside.find((p) => p.name !== last) ?? place;
    last = place.name;
    const source = sources[Math.floor(rnd() * sources.length)];
    movements.push({
      id: count - i, at: stamp(new Date(t)), location: place.name, movement: i === count - 1 ? 'Move' : 'In', source,
      remarks: remarks[place.type] ?? 'Internal movement', by: source === 'Manual Update' ? asset.custodian : 'System',
    });
    t -= (24 + Math.floor(rnd() * 140)) * 3_600_000 + Math.floor(rnd() * 4) * 15 * 60_000;
  }
  return {
    serialNumber: asset.serialNumber ?? `${asset.model.replace(/\W/g, '').toUpperCase().slice(0, 6)}${asset.id.toString().padStart(4, '0')}`,
    assignedTo: `${asset.department} Dept.`,
    custodian: asset.custodian,
    movements,
  };
}

/** The demo data is written as of 15 Oct 2026; it is moved forward so its last day is today. */
const BASE_DAY = new Date(2026, 9, 15);
const SHIFT_DAYS = Math.round((TODAY.getTime() - BASE_DAY.getTime()) / 86_400_000);

function shiftAt(at: string): string {
  const d = parseLocal(at);
  d.setDate(d.getDate() + SHIFT_DAYS);
  return stamp(d);
}

const HISTORIES = new Map<string, AssetHistory>();

/** The asset's location history (built once per page load, then kept in memory). */
export function historyOf(asset: AssetRecord): AssetHistory {
  let h = HISTORIES.get(asset.tag);
  if (!h) {
    h = SOURCE.assets[asset.tag] ? structuredClone(SOURCE.assets[asset.tag]) : buildHistory(asset);
    h.movements = h.movements.map((m) => ({ ...m, at: shiftAt(m.at) }));
    HISTORIES.set(asset.tag, h);
  }
  return h;
}

/** Adds a movement to the asset's history; returns an error message when it can't be recorded. */
export function recordMovement(asset: AssetRecord, m: Omit<Movement, 'id'>): string {
  const h = historyOf(asset);
  if (!m.location || !m.at) return 'Choose the location and the date and time.';
  const cur = [...h.movements].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (cur && m.at <= cur.at) return `The movement must be after the current location's arrival (${cur.at.replace('T', ' ')}).`;
  if (cur && m.location === cur.location) return `${asset.tag} is already at ${m.location}.`;
  const id = Math.max(0, ...h.movements.map((x) => x.id)) + 1;
  h.movements = [...h.movements, { ...m, id }];
  return '';
}
