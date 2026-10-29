/**
 * Geographic side of the geofence demo. `geofences.geo.json` holds real-world outlines (WGS84) for the three sites,
 * every seeded zone and the gateways. Zones created or redrawn in the UI keep their own `latlngs`; anything that only
 * has a plan position (`poly` / `slot` in plan units) is projected onto its site's outline.
 */
import GEO from './geofences.geo.json';
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

interface Feature {
  properties: { kind: 'site' | 'zone' | 'gateway'; id?: string; name?: string; site: string; area?: string };
  geometry: { type: 'Polygon' | 'Point'; coordinates: number[][][] | number[] };
}

const FEATURES = (GEO as unknown as { features: Feature[] }).features;
/** Plan coordinates that map to the site outline (see the site rectangle in the demo plan). */
const PLAN = { x0: 8, y0: 8, x1: 992, y1: 612, mPerUnit: 0.625 };

const toLL = (c: number[]): LL => ({ lat: c[1], lng: c[0] });

function ringOf(f: Feature): LL[] {
  const ring = (f.geometry.coordinates as number[][][])[0].map(toLL);
  return ring.slice(0, -1);
}

export function siteBox(site: string): { n: number; s: number; w: number; e: number } {
  const f = FEATURES.find((x) => x.properties.kind === 'site' && x.properties.site === site) ?? FEATURES.find((x) => x.properties.kind === 'site')!;
  const r = ringOf(f);
  return { n: Math.max(...r.map((p) => p.lat)), s: Math.min(...r.map((p) => p.lat)), w: Math.min(...r.map((p) => p.lng)), e: Math.max(...r.map((p) => p.lng)) };
}

export function siteArea(site: string): string {
  return FEATURES.find((x) => x.properties.kind === 'site' && x.properties.site === site)?.properties.area ?? site;
}

/** Plan (x, y) → lat/lng inside the site outline. */
export function fromPlan(site: string, x: number, y: number): LL {
  const b = siteBox(site);
  return {
    lat: b.n - ((y - PLAN.y0) / (PLAN.y1 - PLAN.y0)) * (b.n - b.s),
    lng: b.w + ((x - PLAN.x0) / (PLAN.x1 - PLAN.x0)) * (b.e - b.w),
  };
}

/** Seeded outline from the GeoJSON, if the zone still has its original site. */
export function seededOutline(z: Zone): LL[] | undefined {
  const f = FEATURES.find((x) => x.properties.kind === 'zone' && x.properties.id === z.id && x.properties.site === z.site);
  return f ? ringOf(f) : undefined;
}

/** Gives every seeded zone its real-world outline from the GeoJSON (once, at start-up). */
export function applySeedOutlines(zones: Zone[]): void {
  for (const z of zones) if (!z.latlngs) z.latlngs = seededOutline(z);
}

export function zoneShape(z: Zone): ZoneShapeGeo {
  if (z.shape === 'Circle') {
    if (z.center && z.radiusM) return { center: z.center, radiusM: z.radiusM };
    const s = z.slot ?? { x: 400, y: 260, w: 140, h: 90 };
    return { center: fromPlan(z.site, s.x + s.w / 2, s.y + s.h / 2), radiusM: (Math.min(s.w, s.h) / 2) * PLAN.mPerUnit };
  }
  if (z.latlngs?.length) return { poly: z.latlngs };
  if (z.poly) return { poly: z.poly.map((p) => fromPlan(z.site, p.x, p.y)) };
  const s = z.slot ?? { x: 400, y: 260, w: 140, h: 90 };
  if (z.points === 4) {
    return { poly: [fromPlan(z.site, s.x, s.y), fromPlan(z.site, s.x + s.w, s.y), fromPlan(z.site, s.x + s.w, s.y + s.h), fromPlan(z.site, s.x, s.y + s.h)] };
  }
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const poly: LL[] = [];
  for (let i = 0; i < z.points; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / z.points;
    poly.push(fromPlan(z.site, cx + (s.w / 2) * Math.cos(a), cy + (s.h / 2) * Math.sin(a)));
  }
  return { poly };
}

export function gatewaysOf(site: string): { name: string; at: LL }[] {
  return FEATURES.filter((f) => f.properties.kind === 'gateway' && f.properties.site === site).map((f) => ({ name: f.properties.name ?? '', at: toLL(f.geometry.coordinates as number[]) }));
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
