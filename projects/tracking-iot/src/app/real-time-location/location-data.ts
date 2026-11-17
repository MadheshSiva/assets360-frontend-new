/**
 * Indoor real-time location: floor plan geometry (walls, zones, racks, gateways) as geo-referenced GeoJSON (WGS84),
 * tracked assets and location events. Empty until loaded from the API. Zone membership is always computed with
 * point-in-polygon against the GeoJSON, so zone names, events and boundary distances agree with the map.
 */

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

/** Event types the Location Events API accepts. */
export type LocEventType = 'Entered Zone' | 'Departed Zone' | 'Geofence Alert' | 'Dwell Exceeded';

export interface LocEvent {
  /** Event id, e.g. LE000001. */
  id: string;
  at: number;
  assetId: string;
  assetName: string;
  /** One of LocEventType (older records may hold other text). */
  event: string;
  zone: string;
  details: string;
}

/** Floor plan of the current level as GeoJSON (empty until loaded). */
export const FACILITY_GEO: { type: 'FeatureCollection'; name: string; features: FacilityFeature[] } = { type: 'FeatureCollection', name: '', features: [] };
/** Site whose floor plan is shown (empty until loaded). */
export const SITE = '';
/** Levels of the site; `mapped` = has a floor plan for location tracking (empty until loaded). */
export const LEVELS: { id: string; name: string; mapped: boolean }[] = [];

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

const ringOf = (f: FacilityFeature) => (f.geometry.coordinates as LngLat[][])[0];

export const ZONES: Zone[] = FACILITY_GEO.features
  .filter((f) => f.properties.kind === 'zone' || f.properties.kind === 'room')
  .map((f) => ({
    id: f.properties.id, name: String(f.properties.name), color: String(f.properties['color']), kind: f.properties.kind as 'zone' | 'room',
    type: String(f.properties['type']), rule: String(f.properties['rule']), restricted: !!f.properties['restricted'], hidden: !!f.properties['hidden'], ring: ringOf(f),
  }));

const AISLES = FACILITY_GEO.features.filter((f) => f.properties.kind === 'aisle').map((f) => ({ name: String(f.properties.name), ring: ringOf(f) }));
export const RESTRICTED: Zone | null = ZONES.find((z) => z.restricted) ?? null;

/** Ids of zones that came from the Geofences API (prefixed so they never clash with floor-plan ids). */
export const GEOFENCE_PREFIX = 'gf:';

/** Replaces the geofence zones in ZONES (floor-plan zones are kept), so zone look-ups include them. */
export function setGeofenceZones(zones: Zone[]): void {
  for (let i = ZONES.length - 1; i >= 0; i--) if (ZONES[i].id.startsWith(GEOFENCE_PREFIX)) ZONES.splice(i, 1);
  ZONES.push(...zones);
}

/** Ring approximating a circle of `radiusM` metres around a centre (for circular geofences). */
export function circleRing(lng: number, lat: number, radiusM: number, steps = 48): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + (radiusM * Math.cos(a)) / mLng(lat), lat + (radiusM * Math.sin(a)) / M_LAT]);
  }
  return ring;
}

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

// ===== assets =====

/** Tracked assets on this level (empty until loaded). */
export const ASSETS: TrackedAsset[] = [];

/** Assets whose location raises an alert: inside / near the restricted zone, stale fixes or lost signal. */
export function isAlert(a: TrackedAsset): boolean {
  return a.state === 'breach' || a.state === 'stale' || a.state === 'offline';
}

export function isLowConfidence(a: TrackedAsset): boolean {
  return a.accuracy >= 8;
}
