/**
 * Geographic side of Geofence & Alerts. Zone outlines come from the API's WGS84 coordinates (polygon / rectangle
 * corners, or a circle centre + radius). Zones that have not been drawn yet have no geometry and are not shown on the map.
 */
import type { Zone } from './geofence-data';

export interface LL {
  lat: number;
  lng: number;
}

export interface ZoneShapeGeo {
  /** Polygon ring (not closed). */
  poly?: LL[];
  /** Circle zones. */
  center?: LL;
  radiusM?: number;
}

export function zoneShape(z: Zone): ZoneShapeGeo {
  if (z.shape === 'Circle') return z.center && z.radiusM ? { center: z.center, radiusM: z.radiusM } : {};
  return z.latlngs && z.latlngs.length >= 3 ? { poly: z.latlngs } : {};
}

export function hasGeometry(z: Zone): boolean {
  const g = zoneShape(z);
  return !!g.poly || !!g.center;
}

/** Polygon area in m² (equirectangular approximation, fine at site scale). */
export function areaM2(poly: LL[]): number {
  if (poly.length < 3) return 0;
  const lat0 = (poly.reduce((t, p) => t + p.lat, 0) / poly.length) * (Math.PI / 180);
  const xy = poly.map((p) => ({ x: p.lng * 111320 * Math.cos(lat0), y: p.lat * 110540 }));
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    a += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return Math.abs(a / 2);
}

export function pointInPoly(p: LL, poly: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}
