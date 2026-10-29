/**
 * DEMO MODE: indoor real-time location for Dubai Plant, Level 1. The floor plan, zones, gateways, featured assets
 * and the forklift's route come from facility-level1.geo.json (geo-referenced, WGS84). The rest of the 238 assets in
 * view are generated once from a fixed seed inside those zones. Zone membership is always computed with
 * point-in-polygon against the GeoJSON, so zone names, events and boundary distances agree with the map.
 */
import FACILITY from './facility-level1.geo.json';

export type LngLat = [number, number];
export type AssetState = 'moving' | 'stationary' | 'stale' | 'offline' | 'breach';

export interface FacilityFeature {
  type: 'Feature';
  properties: { kind: string; id: string; name?: string; [k: string]: unknown };
  geometry: { type: 'Point' | 'LineString' | 'MultiLineString' | 'Polygon'; coordinates: unknown };
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  kind: 'zone' | 'room';
  type: string;
  rule: string;
  restricted: boolean;
  hidden: boolean;
  ring: LngLat[];
}

export interface TrackedAsset {
  id: string;
  name: string;
  type: string;
  state: AssetState;
  lng: number;
  lat: number;
  /** Assigned tracking device (tag / sensor). */
  device: string;
  source: string;
  /** Location accuracy radius, metres. */
  accuracy: number;
  /** Seconds since the last location fix when the page opened. */
  seenSec: number;
  /** m/s when moving. */
  speed: number;
  featured: boolean;
  /** Back-and-forth path for moving assets (featured movers use a GeoJSON route instead). */
  path: LngLat[] | null;
}

export interface LocEvent {
  at: number;
  assetId: string;
  assetName: string;
  event: 'Entered Zone' | 'Departed Zone' | 'Geofence Alert' | 'Signal Lost' | 'Stale Location';
  zone: string;
  details: string;
}

export const FACILITY_GEO = FACILITY as unknown as { type: 'FeatureCollection'; name: string; features: FacilityFeature[] };
export const SITE = 'Dubai Plant';
export const LEVELS = [
  { id: 'L1', name: 'Level 1 – Production & Warehouse', mapped: true },
  { id: 'L2', name: 'Level 2 – Offices & Mezzanine', mapped: false },
];

// ===== geometry =====

const M_LAT = 111_320;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Ray-casting point-in-polygon on a lng/lat ring. */
export function inRing(lng: number, lat: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from a point to a ring's edges. */
export function distToRingM(lng: number, lat: number, ring: LngLat[]): number {
  const kx = mLng(lat);
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1][0] - lng) * kx, ay = (ring[i - 1][1] - lat) * M_LAT;
    const bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * M_LAT;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function distanceM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  return Math.hypot((a.lng - b.lng) * mLng(a.lat), (a.lat - b.lat) * M_LAT);
}

/** Offsets a point by metres east / north. */
function offset(lng: number, lat: number, eastM: number, northM: number): LngLat {
  return [lng + eastM / mLng(lat), lat + northM / M_LAT];
}

const ringOf = (f: FacilityFeature) => (f.geometry.coordinates as LngLat[][])[0];

export const ZONES: Zone[] = FACILITY_GEO.features
  .filter((f) => f.properties.kind === 'zone' || f.properties.kind === 'room')
  .map((f) => ({
    id: f.properties.id, name: String(f.properties.name), color: String(f.properties['color']), kind: f.properties.kind as 'zone' | 'room',
    type: String(f.properties['type']), rule: String(f.properties['rule']), restricted: !!f.properties['restricted'], hidden: !!f.properties['hidden'], ring: ringOf(f),
  }));

const AISLES = FACILITY_GEO.features.filter((f) => f.properties.kind === 'aisle').map((f) => ({ name: String(f.properties.name), ring: ringOf(f) }));
export const RESTRICTED = ZONES.find((z) => z.restricted)!;

export function zoneAt(lng: number, lat: number): Zone | null {
  return ZONES.find((z) => inRing(lng, lat, z.ring)) ?? null;
}

export function aisleAt(lng: number, lat: number): string {
  return AISLES.find((a) => inRing(lng, lat, a.ring))?.name ?? '';
}

/** "Warehouse A / Aisle 04", or just the zone name. */
export function placeOf(lng: number, lat: number): string {
  const z = zoneAt(lng, lat);
  const aisle = aisleAt(lng, lat);
  return z ? (aisle ? `${z.name} / ${aisle}` : z.name) : 'Outside zones';
}

export function pointAlong(path: LngLat[], metres: number): LngLat {
  let left = metres;
  for (let i = 1; i < path.length; i++) {
    const seg = distanceM({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] });
    if (left <= seg) {
      const k = seg ? left / seg : 0;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
    }
    left -= seg;
  }
  return path[path.length - 1];
}

export function pathLength(path: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceM({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] });
  return total;
}

export const ROUTE_FL008 = FACILITY_GEO.features.find((f) => f.properties.kind === 'route')!.geometry.coordinates as LngLat[];
export const HISTORY_FL008 = FACILITY_GEO.features.find((f) => f.properties.kind === 'history')!.geometry.coordinates as LngLat[];

// ===== assets =====

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

const KINDS: { type: string; prefix: string; zones: string[]; device: string }[] = [
  { type: 'Pallet', prefix: 'PLT', zones: ['warehouse-a', 'warehouse-a', 'warehouse-a', 'loading-bay'], device: 'RF' },
  { type: 'Pallet Jack', prefix: 'PJ', zones: ['warehouse-a', 'loading-bay', 'charging'], device: 'BL' },
  { type: 'Container', prefix: 'CNT', zones: ['warehouse-a', 'loading-bay'], device: 'RF' },
  { type: 'Tool Kit', prefix: 'TK', zones: ['maintenance', 'production'], device: 'BL' },
  { type: 'Tool Cart', prefix: 'TC', zones: ['production', 'maintenance'], device: 'BL' },
  { type: 'Welding Set', prefix: 'WS', zones: ['production', 'maintenance'], device: 'BL' },
  { type: 'Handheld Scanner', prefix: 'HS', zones: ['warehouse-a', 'loading-bay', 'production'], device: 'WF' },
  { type: 'Mould', prefix: 'MLD', zones: ['production'], device: 'BL' },
  { type: 'Compressor', prefix: 'CMP', zones: ['utilities'], device: 'VS' },
  { type: 'Forklift', prefix: 'FL', zones: ['warehouse-a', 'loading-bay', 'charging'], device: 'BL' },
];

/** Random point inside a zone, kept 1 m from its edges. */
function pointIn(zone: Zone, rng: () => number): LngLat {
  const xs = zone.ring.map((p) => p[0]);
  const ys = zone.ring.map((p) => p[1]);
  const lat = (Math.min(...ys) + Math.max(...ys)) / 2;
  const padX = 1 / mLng(lat), padY = 1 / M_LAT;
  const x1 = Math.min(...xs) + padX, x2 = Math.max(...xs) - padX, y1 = Math.min(...ys) + padY, y2 = Math.max(...ys) - padY;
  return [x1 + rng() * (x2 - x1), y1 + rng() * (y2 - y1)];
}

function build(): TrackedAsset[] {
  const rng = mulberry32(238_421);
  const zoneById = (id: string) => ZONES.find((z) => z.id === id)!;
  const list: TrackedAsset[] = [];

  // featured assets come straight from the GeoJSON
  const SEEN: Record<string, number> = { 'FL-008': 8, 'PMP-118': 12, 'GEN-042': 18, 'TC-021': 25, 'BL-20963': 10 };
  for (const f of FACILITY_GEO.features.filter((x) => x.properties.kind === 'asset')) {
    const [lng, lat] = f.geometry.coordinates as LngLat;
    const p = f.properties;
    list.push({
      id: p.id, name: String(p.name), type: String(p['type']), state: p['state'] as AssetState, lng, lat, device: String(p['device']), source: String(p['source']),
      accuracy: Number(p['accuracy']), seenSec: SEEN[p.id] ?? 10, speed: p.id === 'FL-008' ? 1.4 : 0, featured: true, path: null,
    });
  }

  // the rest of the estate on this level: 41 more moving, 178 more stationary, 3 more breaches, 8 stale, 3 offline
  const plan: [AssetState, number][] = [['moving', 41], ['stationary', 178], ['breach', 3], ['stale', 8], ['offline', 3]];
  const used = new Set(list.map((a) => a.id));
  let serial = 0;
  for (const [state, count] of plan) {
    for (let i = 0; i < count; i++) {
      const kind = KINDS[Math.floor(rng() * KINDS.length)];
      let id = '';
      do id = `${kind.prefix}-${String(100 + Math.floor(rng() * 880)).padStart(3, '0')}`; while (used.has(id));
      used.add(id);
      const zone = state === 'breach' ? RESTRICTED : zoneById(kind.zones[Math.floor(rng() * kind.zones.length)]);
      let [lng, lat] = pointIn(zone, rng);
      let path: LngLat[] | null = null;
      if (state === 'moving') {
        // movers run back and forth along a straight lane inside their zone
        const len = 6 + rng() * 14;
        const vertical = zone.id === 'warehouse-a';
        const end = vertical ? offset(lng, lat, 0, rng() < 0.5 ? len : -len) : offset(lng, lat, rng() < 0.5 ? len : -len, 0);
        const endZone = zoneAt(end[0], end[1]);
        path = endZone?.id === zone.id ? [[lng, lat], end] : [[lng, lat], offset(lng, lat, 0, 0.5)];
      }
      if (state === 'breach') {
        // breaches sit just inside the restricted boundary
        const xs = zone.ring.map((p) => p[0]);
        [lng, lat] = [Math.min(...xs) + (1.2 + rng() * 2.2) / mLng(lat), lat];
      }
      serial++;
      const devPrefix = kind.device;
      list.push({
        id, name: kind.type, type: kind.type, state, lng, lat,
        device: `${devPrefix}-${String(30000 + Math.floor(rng() * 9000))}`,
        source: devPrefix === 'WF' ? 'Wi-Fi' : devPrefix === 'RF' ? 'RFID portal' : 'BLE',
        accuracy: Math.round((state === 'stationary' && serial % 18 === 0 ? 8 + rng() * 4 : 1.6 + rng() * 3.8) * 10) / 10,
        seenSec: state === 'moving' ? 1 + Math.floor(rng() * 9) : state === 'stationary' || state === 'breach' ? 5 + Math.floor(rng() * 55)
          : state === 'stale' ? 180 + Math.floor(rng() * 2200) : 3600 * (2 + Math.floor(rng() * 20)),
        speed: state === 'moving' ? Math.round((0.5 + rng() * 1.2) * 10) / 10 : 0,
        featured: false, path,
      });
    }
  }
  return list;
}

export const ASSETS: TrackedAsset[] = build();

/** Assets whose location raises an alert: inside / near the restricted zone, stale fixes or lost signal. */
export function isAlert(a: TrackedAsset): boolean {
  return a.state === 'breach' || a.state === 'stale' || a.state === 'offline';
}

export function isLowConfidence(a: TrackedAsset): boolean {
  return a.accuracy >= 8;
}

// ===== events =====

export function buildEvents(now: number): LocEvent[] {
  const rng = mulberry32(51_204);
  const tc = ASSETS.find((a) => a.id === 'TC-021')!;
  const dTc = distToRingM(tc.lng, tc.lat, RESTRICTED.ring);
  const ev: LocEvent[] = [
    { at: now - 66_000, assetId: 'FL-008', assetName: 'Forklift', event: 'Entered Zone', zone: 'Warehouse A', details: 'Entered Warehouse A from Main Corridor' },
    { at: now - 255_000, assetId: 'FL-008', assetName: 'Forklift', event: 'Departed Zone', zone: 'Charging Zone', details: 'Departed Charging Zone (dwell time 18 min)' },
    { at: now - 457_000, assetId: 'TC-021', assetName: 'Tool Cart', event: 'Geofence Alert', zone: 'Restricted Zone', details: `Asset within ${Math.max(1, Math.round(dTc))} m of Restricted Zone boundary` },
  ];
  let t = now - 520_000;
  for (const a of ASSETS.filter((x) => !x.featured && x.state !== 'stationary')) {
    t -= 40_000 + Math.floor(rng() * 160_000);
    const z = zoneAt(a.lng, a.lat)?.name ?? 'Outside zones';
    if (a.state === 'breach') ev.push({ at: t, assetId: a.id, assetName: a.name, event: 'Geofence Alert', zone: z, details: `Entered Restricted Zone (${Math.round(distToRingM(a.lng, a.lat, RESTRICTED.ring) * 10) / 10} m inside boundary)` });
    else if (a.state === 'offline') ev.push({ at: now - a.seenSec * 1000, assetId: a.id, assetName: a.name, event: 'Signal Lost', zone: z, details: `No location fix from ${a.device}` });
    else if (a.state === 'stale') ev.push({ at: now - a.seenSec * 1000, assetId: a.id, assetName: a.name, event: 'Stale Location', zone: z, details: 'Last fix older than 2 min' });
    else if (rng() < 0.45) ev.push({ at: t, assetId: a.id, assetName: a.name, event: rng() < 0.6 ? 'Entered Zone' : 'Departed Zone', zone: z, details: `${a.source} fix, accuracy ${a.accuracy} m` });
  }
  return ev.sort((a, b) => b.at - a.at);
}

/** FL-008 positions over the last 30 minutes (5 min apart), from its recorded run (charging → corridor → Aisle 04). */
export function trailFL008(now: number): { at: number; lng: number; lat: number; place: string }[] {
  const total = pathLength(HISTORY_FL008);
  // charged until 4 min 15 s ago, then drove the recorded path at 1.4 m/s
  const departed = now - 255_000;
  const out: { at: number; lng: number; lat: number; place: string }[] = [];
  for (let k = 6; k >= 0; k--) {
    const at = now - k * 300_000;
    const along = at <= departed ? 0 : Math.min(total, ((at - departed) / 1000) * 1.4);
    const [lng, lat] = pointAlong(HISTORY_FL008, along);
    out.push({ at, lng, lat, place: placeOf(lng, lat) });
  }
  return out;
}
