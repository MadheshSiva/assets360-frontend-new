import { FacilityFeature, LngLat } from './location-data';

/**
 * CAD-style artwork for the Level 1 floor plan: yard, building shell with columns, dock doors, pallet racking,
 * production cells, conveyors, presses, tanks, trailers, charging bays and floor markings. Generated from
 * facility-level1.geo.json in local metres and laid under the live layers as a single SVG overlay, so every
 * detail stays aligned with the zones, gateways and asset positions. Purely decorative (no pointer events).
 */
export interface PlanArt { svg: SVGSVGElement; south: number; west: number; north: number; east: number }

interface Box { x: number; y: number; w: number; h: number }

/** Yard drawn around the building slab, metres. */
const PAD = 18;
const M_LAT = 111_320;

const n = (v: number) => +v.toFixed(2);
const rect = (b: Box, a: string) => `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" ${a}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, a: string) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${a}/>`;
const circle = (cx: number, cy: number, r: number, a: string) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${a}/>`;
const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });

/** Deterministic per-feature randomness, so the plan looks the same on every load. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===== palette =====
const INK = '#3f4a5a';
const LINE = '#64748b';
const SOFT = '#94a3b8';
const FAINT = '#cbd5e1';
const STEEL = '#e6eaf0';
const SAFETY = '#eab308';
const SHADOW = 'fill="#0f172a" fill-opacity="0.07"';

export function buildPlanArt(features: FacilityFeature[]): PlanArt {
  const outline = features.find((f) => f.properties.kind === 'outline')!;
  const ring = (outline.geometry.coordinates as LngLat[][])[0];
  const west = Math.min(...ring.map((c) => c[0]));
  const east = Math.max(...ring.map((c) => c[0]));
  const south = Math.min(...ring.map((c) => c[1]));
  const north = Math.max(...ring.map((c) => c[1]));
  const mLng = M_LAT * Math.cos((((north + south) / 2) * Math.PI) / 180);
  const P = ([lng, lat]: LngLat): [number, number] => [(lng - west) * mLng, (north - lat) * M_LAT];
  const boxOf = (f: FacilityFeature): Box => {
    const pts = (f.geometry.coordinates as LngLat[][])[0].map(P);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const segOf = (f: FacilityFeature) => (f.geometry.coordinates as LngLat[]).map(P);
  const of = (kind: string) => features.filter((f) => f.properties.kind === kind);

  const W = (east - west) * mLng;
  const H = (north - south) * M_LAT;
  const site: string[] = [];
  const floor: string[] = [];
  const marks: string[] = [];
  const kit: string[] = [];
  const shell: string[] = [];

  // ===== yard around the building =====
  site.push(rect({ x: -PAD, y: -PAD, w: W + 2 * PAD, h: H + 2 * PAD }, 'rx="3" fill="#eceff3" stroke="#d5dae2" stroke-width="0.25"'));
  // perimeter fence
  site.push(rect({ x: -PAD + 1.2, y: -PAD + 1.2, w: W + 2 * PAD - 2.4, h: H + 2 * PAD - 2.4 }, 'rx="2" fill="none" stroke="#c3cad4" stroke-width="0.12" stroke-dasharray="0.8 0.5"'));
  // service road along the north side
  site.push(rect({ x: -PAD + 2, y: -PAD + 2.5, w: W + 2 * PAD - 4, h: 6.5 }, 'fill="#e1e5eb"'));
  site.push(line(-PAD + 3, -PAD + 5.75, W + PAD - 3, -PAD + 5.75, 'stroke="#fff" stroke-width="0.15" stroke-dasharray="2.5 2"'));
  // trailer staging bays on the apron
  for (let x = 24; x <= 76; x += 4) site.push(line(x, -7.5, x, -0.8, 'stroke="#fff" stroke-width="0.14"'));
  // landscaped verges with trees
  for (const vx of [-PAD + 2, W + PAD - 7]) {
    site.push(rect({ x: vx, y: -PAD + 11, w: 5, h: H + 2 * PAD - 13 }, 'rx="1" fill="#e2eadf"'));
    for (let y = -PAD + 14; y < H + PAD - 3; y += 7) site.push(circle(vx + 2.5, y, 1.7, 'fill="#d3dfcc" stroke="#bccbb4" stroke-width="0.1"'));
  }
  // car park south of the hall
  site.push(rect({ x: 8, y: H + 3, w: W - 16, h: 9 }, 'fill="#e4e8ed"'));
  for (let x = 8; x <= W - 8; x += 2.6) site.push(line(x, H + 3, x, H + 7.5, 'stroke="#fff" stroke-width="0.12"'));
  const cars = rng('carpark');
  for (let x = 8; x < W - 10; x += 2.6) {
    if (cars() < 0.55) continue;
    const c = { x: x + 0.35, y: H + 3.2, w: 1.9, h: 4.1 };
    site.push(rect(c, `rx="0.5" fill="${['#d5dbe3', '#cfd6df', '#dde2e8'][Math.floor(cars() * 3)]}" stroke="#aeb7c3" stroke-width="0.06"`));
    site.push(rect({ x: c.x + 0.25, y: c.y + 1.1, w: 1.4, h: 0.7 }, 'rx="0.15" fill="#b8c1cd"'));
  }

  // ===== slab and floor =====
  site.push(rect({ x: 0, y: 0, w: W, h: H }, 'fill="#f2f4f7" stroke="#cfd5de" stroke-width="0.15"'));
  const walls = of('wall').map(segOf);
  const xs = walls.flat().map((p) => p[0]);
  const ys = walls.flat().map((p) => p[1]);
  const hall: Box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  floor.push(rect(hall, 'class="rl-art-floor" fill="#fbfcfd"'));
  // concrete pour joints, 6 m bays
  for (let x = hall.x + 6; x < hall.x + hall.w; x += 6) floor.push(line(x, hall.y, x, hall.y + hall.h, 'stroke="#eef1f5" stroke-width="0.06"'));
  for (let y = hall.y + 6; y < hall.y + hall.h; y += 6) floor.push(line(hall.x, y, hall.x + hall.w, y, 'stroke="#eef1f5" stroke-width="0.06"'));

  for (const f of features) {
    const p = f.properties;
    if (p.kind === 'zone' && p.id === 'production') floor.push(rect(boxOf(f), 'fill="#f3f6f4"'));
    if (p.kind === 'room' && p.id === 'corridor') {
      const b = boxOf(f);
      // pedestrian / traffic route: yellow edge lines and a dashed centre line
      marks.push(line(b.x, b.y + 0.2, b.x + b.w, b.y + 0.2, `stroke="${SAFETY}" stroke-width="0.14" stroke-opacity="0.75"`));
      marks.push(line(b.x + 1, b.y + b.h / 2, b.x + b.w - 1, b.y + b.h / 2, 'stroke="#d6dbe2" stroke-width="0.1" stroke-dasharray="1.2 1"'));
      for (let x = b.x + 8; x < b.x + b.w - 4; x += 16) marks.push(arrow(x, b.y + b.h / 2, 0));
    }
  }

  // ===== aisles: travel arrows and end stop lines =====
  for (const f of of('aisle')) {
    const b = boxOf(f);
    marks.push(arrow(b.x + b.w / 2, b.y + b.h * 0.3, -90), arrow(b.x + b.w / 2, b.y + b.h * 0.7, 90));
    marks.push(line(b.x + 0.3, b.y + 0.4, b.x + b.w - 0.3, b.y + 0.4, `stroke="${SAFETY}" stroke-width="0.12" stroke-opacity="0.7"`));
    marks.push(line(b.x + 0.3, b.y + b.h - 0.4, b.x + b.w - 0.3, b.y + b.h - 0.4, `stroke="${SAFETY}" stroke-width="0.12" stroke-opacity="0.7"`));
  }

  // ===== racking =====
  for (const f of of('rack')) kit.push(rack(boxOf(f), rng(p0(f))));

  // ===== equipment =====
  for (const f of of('machine')) {
    const b = boxOf(f);
    const name = String(f.properties.name ?? '');
    const r = rng(p0(f));
    if (name.startsWith('Assembly cell')) kit.push(cell(b, r));
    else if (name.startsWith('Conveyor')) kit.push(conveyor(b));
    else if (name.startsWith('Press')) kit.push(press(b));
    else if (/oven/i.test(name)) kit.push(oven(b));
    else if (/chemical/i.test(name)) kit.push(chemStore(b));
    else if (/generator/i.test(name)) kit.push(genset(b));
    else if (name.startsWith('Charger')) kit.push(charger(b));
    else if (/workbench/i.test(name)) kit.push(workbench(b));
    else kit.push(rect(b, `fill="${STEEL}" stroke="${LINE}" stroke-width="0.1"`));
  }
  const tanks = of('tank').map(boxOf);
  if (tanks.length) {
    // bunded tank farm with a header pipe
    const bx = Math.min(...tanks.map((t) => t.x)) - 0.6;
    const by = Math.min(...tanks.map((t) => t.y)) - 0.6;
    const bw = Math.max(...tanks.map((t) => t.x + t.w)) + 0.6 - bx;
    const bh = Math.max(...tanks.map((t) => t.y + t.h)) + 0.6 - by;
    kit.push(rect({ x: bx, y: by, w: bw, h: bh }, `rx="0.3" fill="#f1f3f6" stroke="${SOFT}" stroke-width="0.16"`));
    kit.push(line(bx + 0.4, by + 0.35, bx + bw + 1.2, by + 0.35, `stroke="${SOFT}" stroke-width="0.22" stroke-linecap="round"`));
    for (const t of tanks) kit.push(tank(t));
  }
  for (const f of of('truck')) kit.push(trailer(boxOf(f)));
  for (const f of of('room')) {
    if (f.properties.id === 'maintenance') kit.push(maintenance(boxOf(f)));
    if (f.properties.id === 'charging') kit.push(chargingBays(boxOf(f), of('machine').filter((m) => String(m.properties.name).startsWith('Charger')).map(boxOf)));
  }
  for (const f of features.filter((x) => x.properties.kind === 'zone' && x.properties['restricted'])) {
    // yellow / black hazard border inside the restricted area
    const b = inset(boxOf(f), 0.5);
    marks.push(rect(b, 'fill="none" stroke="#1f2937" stroke-width="0.22" stroke-opacity="0.55"'));
    marks.push(rect(b, `fill="none" stroke="${SAFETY}" stroke-width="0.22" stroke-dasharray="0.45 0.45"`));
  }

  // ===== shell: walls, dock doors, columns =====
  const docks = of('door').map(segOf);
  // piers between dock doors on the same wall line
  const spans = [...walls, ...docks].filter((s) => s.length === 2 && Math.abs(s[0][1] - s[1][1]) < 0.01)
    .map((s) => ({ y: s[0][1], a: Math.min(s[0][0], s[1][0]), b: Math.max(s[0][0], s[1][0]) }))
    .sort((u, v) => u.y - v.y || u.a - v.a);
  const piers: [number, number][][] = [];
  for (let i = 1; i < spans.length; i++) {
    const u = spans[i - 1];
    const v = spans[i];
    if (Math.abs(u.y - v.y) < 0.01 && v.a - u.b > 0.05 && v.a - u.b < 4) piers.push([[u.b, u.y], [v.a, u.y]]);
  }
  for (const d of docks) {
    const [a, b] = d;
    const x1 = Math.min(a[0], b[0]);
    const x2 = Math.max(a[0], b[0]);
    const y = a[1];
    // dock leveller plate with hazard nosing, bumpers and the roller shutter line
    shell.push(rect({ x: x1 + 0.4, y: y + 0.3, w: x2 - x1 - 0.8, h: 2.2 }, `fill="${STEEL}" stroke="${SOFT}" stroke-width="0.07"`));
    for (let k = 0; k < 4; k++) shell.push(line(x1 + 0.7, y + 0.75 + k * 0.45, x2 - 0.7, y + 0.75 + k * 0.45, `stroke="${FAINT}" stroke-width="0.05"`));
    shell.push(line(x1 + 0.4, y + 2.5, x2 - 0.4, y + 2.5, 'stroke="#1f2937" stroke-width="0.16"'));
    shell.push(line(x1 + 0.4, y + 2.5, x2 - 0.4, y + 2.5, `stroke="${SAFETY}" stroke-width="0.16" stroke-dasharray="0.35 0.35"`));
    shell.push(rect({ x: x1 + 0.15, y: y - 0.55, w: 0.35, h: 0.5 }, `fill="${INK}"`), rect({ x: x2 - 0.5, y: y - 0.55, w: 0.35, h: 0.5 }, `fill="${INK}"`));
    shell.push(line(x1, y, x2, y, `stroke="${LINE}" stroke-width="0.12" stroke-dasharray="0.25 0.18"`));
  }
  const wallPath = [...walls, ...piers].map((s) => 'M' + s.map((q) => `${n(q[0])} ${n(q[1])}`).join('L')).join('');
  // double-line walls: dark body with a lighter core
  shell.push(`<path d="${wallPath}" fill="none" stroke="${INK}" stroke-width="0.6" stroke-linecap="square"/>`);
  shell.push(`<path d="${wallPath}" fill="none" stroke="#a7b1be" stroke-width="0.26" stroke-linecap="square"/>`);
  // structural columns on the perimeter grid, skipping dock openings
  const inDock = (x: number, y: number) => docks.some(([a, b]) => Math.abs(a[1] - y) < 0.2 && x > Math.min(a[0], b[0]) - 0.5 && x < Math.max(a[0], b[0]) + 0.5);
  const col = (x: number, y: number) => !inDock(x, y) && shell.push(rect({ x: x - 0.4, y: y - 0.4, w: 0.8, h: 0.8 }, `fill="${INK}"`));
  const stepX = hall.w / Math.round(hall.w / 8);
  const stepY = hall.h / Math.round(hall.h / 8.5);
  for (let x = hall.x; x <= hall.x + hall.w + 0.01; x += stepX) {
    col(x, hall.y);
    col(x, hall.y + hall.h);
  }
  for (let y = hall.y + stepY; y < hall.y + hall.h - 0.01; y += stepY) {
    col(hall.x, y);
    col(hall.x + hall.w, y);
  }
  // free-standing columns along the warehouse / production division
  for (const s of walls.filter((s) => Math.abs(s[0][0] - s[1][0]) < 0.01 && Math.abs(s[0][1] - s[1][1]) > 8)) {
    const [a, b] = s;
    for (let y = Math.min(a[1], b[1]) + stepY; y < Math.max(a[1], b[1]) - 1; y += stepY) col(a[0], y);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${n(W + 2 * PAD)} ${n(H + 2 * PAD)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('shape-rendering', 'geometricPrecision');
  svg.innerHTML = `<g class="rl-art-site">${site.join('')}</g><g>${floor.join('')}</g><g>${marks.join('')}</g><g>${kit.join('')}</g><g>${shell.join('')}</g>`;
  return { svg, west: west - PAD / mLng, east: east + PAD / mLng, south: south - PAD / M_LAT, north: north + PAD / M_LAT };
}

const p0 = (f: FacilityFeature) => String(f.properties.id);

/** Painted floor arrow pointing along `deg` (0 = east, 90 = south). */
function arrow(x: number, y: number, deg: number): string {
  return `<path d="M-0.9 -0.28H0.2V-0.62L0.95 0L0.2 0.62V0.28H-0.9Z" transform="translate(${n(x)} ${n(y)}) rotate(${deg})" fill="#d3d9e1"/>`;
}

/** Back-to-back pallet racking: bays along the long axis, a pallet (with load) in most positions. */
function rack(b: Box, r: () => number): string {
  const out: string[] = [];
  const vertical = b.h >= b.w;
  const len = vertical ? b.h : b.w;
  const dep = vertical ? b.w : b.h;
  const bays = Math.max(1, Math.round(len / 2.6));
  const bl = len / bays;
  // (u along, v across) → plan box
  const at = (u: number, v: number, du: number, dv: number): Box => (vertical ? { x: b.x + v, y: b.y + u, w: dv, h: du } : { x: b.x + u, y: b.y + v, w: du, h: dv });
  out.push(rect({ x: b.x + 0.18, y: b.y + 0.22, w: b.w, h: b.h }, SHADOW));
  out.push(rect(b, `fill="#eef1f5" stroke="${LINE}" stroke-width="0.1"`));
  const loads = ['#d9c7a3', '#c8d5e2', '#dcdfe4', '#e6d6b8', '#cfd9cf'];
  for (let i = 0; i < bays; i++) {
    for (const side of [0, 1]) {
      if (r() < 0.13) continue;
      const pal = at(i * bl + 0.18, side * (dep / 2) + 0.12, bl - 0.36, dep / 2 - 0.24);
      out.push(rect(pal, 'fill="#e6d7b9" stroke="#b39a6e" stroke-width="0.04"'));
      const load = inset(pal, 0.14);
      out.push(rect(load, `fill="${loads[Math.floor(r() * loads.length)]}" stroke="#8f9aa8" stroke-width="0.04"`));
      // carton split / strapping
      out.push(vertical ? line(load.x, load.y + load.h / 2, load.x + load.w, load.y + load.h / 2, 'stroke="#9aa4b2" stroke-width="0.03"')
        : line(load.x + load.w / 2, load.y, load.x + load.w / 2, load.y + load.h, 'stroke="#9aa4b2" stroke-width="0.03"'));
    }
  }
  // beams and uprights at every bay boundary, plus the back-to-back spine
  for (let i = 0; i <= bays; i++) {
    const u = i * bl;
    const beam = at(u - 0.04, 0, 0.08, dep);
    out.push(rect(beam, `fill="${LINE}"`));
    for (const v of [0, dep / 2, dep]) {
      const post = at(u - 0.09, v - 0.09, 0.18, 0.18);
      out.push(rect(post, `fill="${INK}"`));
    }
  }
  const spine = at(0, dep / 2 - 0.03, len, 0.06);
  out.push(rect(spine, `fill="${SOFT}"`));
  return out.join('');
}

/** Robot assembly cell: guard fence, keep-out line, robot, fixture table, control cabinet. */
function cell(b: Box, r: () => number): string {
  const o: string[] = [];
  o.push(rect(inset(b, -0.9), `fill="none" stroke="${SAFETY}" stroke-width="0.12" stroke-opacity="0.7"`));
  o.push(rect(inset(b, -0.35), `rx="0.1" fill="none" stroke="${SOFT}" stroke-width="0.08" stroke-dasharray="0.35 0.12"`));
  o.push(rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `rx="0.15" fill="${STEEL}" stroke="${LINE}" stroke-width="0.1"`));
  const cx = b.x + 1.35;
  const cy = b.y + b.h / 2;
  const ang = (r() - 0.5) * 1.6;
  const ex = cx + Math.cos(ang) * 1.6;
  const ey = cy + Math.sin(ang) * 1.6;
  o.push(circle(cx, cy, 0.8, `fill="#d5dbe3" stroke="${INK}" stroke-width="0.08"`));
  o.push(line(cx, cy, ex, ey, `stroke="${LINE}" stroke-width="0.42" stroke-linecap="round"`));
  o.push(circle(cx, cy, 0.32, `fill="${INK}"`), circle(ex, ey, 0.22, `fill="${INK}"`));
  const table: Box = { x: b.x + 2.9, y: b.y + 0.55, w: b.w - 3.9, h: b.h - 1.1 };
  o.push(rect(table, `fill="#f8fafc" stroke="${LINE}" stroke-width="0.07"`));
  o.push(rect(inset(table, 0.35), `fill="none" stroke="${SOFT}" stroke-width="0.05"`));
  o.push(line(table.x + table.w / 2, table.y + 0.35, table.x + table.w / 2, table.y + table.h - 0.35, `stroke="${SOFT}" stroke-width="0.05"`));
  o.push(rect({ x: b.x + b.w - 0.75, y: b.y + 0.25, w: 0.5, h: 1.1 }, `fill="${INK}"`));
  o.push(circle(b.x + b.w - 0.5, b.y + 0.55, 0.08, 'fill="#4ade80"'));
  return o.join('');
}

function conveyor(b: Box): string {
  const o: string[] = [];
  const horizontal = b.w >= b.h;
  o.push(rect({ x: b.x + 0.12, y: b.y + 0.18, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `fill="#e9edf2" stroke="${LINE}" stroke-width="0.09"`));
  if (horizontal) {
    for (let x = b.x + 0.3; x < b.x + b.w - 0.2; x += 0.32) o.push(line(x, b.y + 0.15, x, b.y + b.h - 0.15, 'stroke="#aab4c1" stroke-width="0.05"'));
    o.push(line(b.x, b.y + 0.12, b.x + b.w, b.y + 0.12, `stroke="${INK}" stroke-width="0.08"`), line(b.x, b.y + b.h - 0.12, b.x + b.w, b.y + b.h - 0.12, `stroke="${INK}" stroke-width="0.08"`));
    o.push(rect({ x: b.x + b.w - 0.9, y: b.y - 0.45, w: 0.7, h: 0.45 }, `fill="${LINE}"`));
  } else {
    for (let y = b.y + 0.3; y < b.y + b.h - 0.2; y += 0.32) o.push(line(b.x + 0.15, y, b.x + b.w - 0.15, y, 'stroke="#aab4c1" stroke-width="0.05"'));
  }
  return o.join('');
}

function press(b: Box): string {
  const o: string[] = [];
  o.push(rect(inset(b, -0.7), 'fill="none" stroke="#1f2937" stroke-width="0.2" stroke-opacity="0.5"'));
  o.push(rect(inset(b, -0.7), `fill="none" stroke="${SAFETY}" stroke-width="0.2" stroke-dasharray="0.35 0.35"`));
  o.push(rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `fill="#dde3ea" stroke="${INK}" stroke-width="0.14"`));
  o.push(rect(inset(b, 0.55), `fill="#cfd6df" stroke="${LINE}" stroke-width="0.07"`));
  o.push(rect({ x: b.x + b.w * 0.25, y: b.y + b.h * 0.3, w: b.w * 0.5, h: b.h * 0.4 }, `fill="#b8c2ce" stroke="${INK}" stroke-width="0.08"`));
  for (const [x, y] of [[b.x + 0.45, b.y + 0.45], [b.x + b.w - 0.45, b.y + 0.45], [b.x + 0.45, b.y + b.h - 0.45], [b.x + b.w - 0.45, b.y + b.h - 0.45]]) o.push(circle(x, y, 0.28, `fill="${INK}"`));
  return o.join('');
}

function oven(b: Box): string {
  const o: string[] = [];
  o.push(rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `fill="#e5e7eb" stroke="${INK}" stroke-width="0.14"`));
  o.push(rect(inset(b, 0.5), 'fill="#f6e6da" stroke="#c7a48c" stroke-width="0.07"'));
  for (let y = b.y + 1.2; y < b.y + b.h - 0.8; y += 0.8) o.push(line(b.x + 0.8, y, b.x + b.w - 0.8, y, 'stroke="#dcc0ab" stroke-width="0.05"'));
  o.push(line(b.x + 0.3, b.y + b.h - 0.12, b.x + b.w - 0.3, b.y + b.h - 0.12, `stroke="${INK}" stroke-width="0.2"`));
  o.push(circle(b.x + 1, b.y + 0.3, 0.18, `fill="${LINE}"`), circle(b.x + b.w - 1, b.y + 0.3, 0.18, `fill="${LINE}"`));
  return o.join('');
}

function chemStore(b: Box): string {
  const o: string[] = [];
  o.push(rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `fill="#f1f5f9" stroke="${INK}" stroke-width="0.14"`));
  for (let y = b.y + 0.7; y < b.y + b.h - 0.4; y += 1.05) for (let x = b.x + 0.7; x < b.x + b.w - 0.4; x += 0.95) o.push(circle(x, y, 0.36, `fill="#dbe3ec" stroke="${LINE}" stroke-width="0.05"`));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  o.push(`<path d="M${n(cx)} ${n(cy - 0.7)}L${n(cx + 0.7)} ${n(cy)}L${n(cx)} ${n(cy + 0.7)}L${n(cx - 0.7)} ${n(cy)}Z" fill="#fff" stroke="#dc2626" stroke-width="0.1"/>`);
  return o.join('');
}

function genset(b: Box): string {
  const o: string[] = [];
  o.push(rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW));
  o.push(rect(b, `rx="0.2" fill="#dfe4ea" stroke="${INK}" stroke-width="0.12"`));
  const grill: Box = { x: b.x + 0.4, y: b.y + 0.4, w: b.w - 0.8, h: 1.6 };
  o.push(rect(grill, `fill="#cbd3dd" stroke="${LINE}" stroke-width="0.05"`));
  for (let x = grill.x + 0.25; x < grill.x + grill.w; x += 0.25) o.push(line(x, grill.y + 0.1, x, grill.y + grill.h - 0.1, `stroke="${SOFT}" stroke-width="0.04"`));
  o.push(rect({ x: b.x + 0.7, y: b.y + 2.5, w: b.w - 1.4, h: b.h - 4 }, `fill="#d1d8e1" stroke="${LINE}" stroke-width="0.07"`));
  o.push(circle(b.x + b.w - 0.9, b.y + b.h - 0.9, 0.35, `fill="${INK}"`));
  return o.join('');
}

function charger(b: Box): string {
  return rect(b, 'rx="0.1" fill="#334155" stroke="#1f2937" stroke-width="0.06"')
    + rect({ x: b.x + 0.3, y: b.y + 0.25, w: b.w - 0.6, h: 0.45 }, 'fill="#64748b"')
    + circle(b.x + b.w - 0.35, b.y + b.h - 0.35, 0.12, 'fill="#4ade80"');
}

function workbench(b: Box): string {
  const o: string[] = [rect({ x: b.x + 0.12, y: b.y + 0.15, w: b.w, h: b.h }, SHADOW), rect(b, 'fill="#efe6d6" stroke="#8b7a5e" stroke-width="0.08"')];
  for (let x = b.x + 1.2; x < b.x + b.w - 0.5; x += 3.2) o.push(rect({ x, y: b.y + 0.2, w: 0.5, h: 0.35 }, `fill="${LINE}"`));
  return o.join('');
}

function tank(b: Box): string {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) / 2;
  return circle(cx + 0.18, cy + 0.22, r, SHADOW)
    + circle(cx, cy, r, `fill="#e6eaef" stroke="${INK}" stroke-width="0.12"`)
    + circle(cx, cy, r * 0.78, `fill="none" stroke="${SOFT}" stroke-width="0.05"`)
    + circle(cx, cy, r * 0.5, `fill="none" stroke="${FAINT}" stroke-width="0.05"`)
    + line(cx - r, cy, cx + r, cy, `stroke="${FAINT}" stroke-width="0.04"`)
    + line(cx, cy - r, cx, cy + r, `stroke="${FAINT}" stroke-width="0.04"`)
    + circle(cx + r * 0.35, cy - r * 0.35, r * 0.18, `fill="#f8fafc" stroke="${LINE}" stroke-width="0.06"`);
}

/** Truck backed onto a dock, seen from above: cab against the wall, ribbed trailer roof. */
function trailer(b: Box): string {
  const cabH = Math.min(1.6, b.h * 0.24);
  const cab: Box = { x: b.x + 0.15, y: b.y, w: b.w - 0.3, h: cabH };
  const box: Box = { x: b.x, y: b.y + cabH + 0.15, w: b.w, h: b.h - cabH - 0.15 };
  const o: string[] = [rect({ x: b.x + 0.2, y: b.y + 0.25, w: b.w, h: b.h }, SHADOW)];
  o.push(rect(cab, `rx="0.3" fill="#dfe4ea" stroke="${LINE}" stroke-width="0.08"`));
  o.push(rect({ x: cab.x + 0.2, y: cab.y + 0.15, w: cab.w - 0.4, h: 0.45 }, 'rx="0.12" fill="#9aa6b5"'));
  o.push(rect({ x: cab.x - 0.18, y: cab.y + 0.3, w: 0.18, h: 0.3 }, `fill="${LINE}"`), rect({ x: cab.x + cab.w, y: cab.y + 0.3, w: 0.18, h: 0.3 }, `fill="${LINE}"`));
  o.push(rect(box, `fill="#f7f8fa" stroke="${LINE}" stroke-width="0.1"`));
  for (let y = box.y + 0.6; y < box.y + box.h - 0.2; y += 0.6) o.push(line(box.x + 0.1, y, box.x + box.w - 0.1, y, 'stroke="#dde2e8" stroke-width="0.05"'));
  o.push(line(box.x + box.w / 2, box.y + box.h - 0.6, box.x + box.w / 2, box.y + box.h, `stroke="${SOFT}" stroke-width="0.05"`));
  return o.join('');
}

function maintenance(b: Box): string {
  const o: string[] = [];
  // tool cabinets along the back wall, a lathe and a pillar drill
  for (let x = b.x + 1.2; x < b.x + b.w * 0.45; x += 1.1) o.push(rect({ x, y: b.y + b.h - 1.05, w: 0.95, h: 0.7 }, `fill="#d7dde5" stroke="${LINE}" stroke-width="0.05"`));
  const lathe: Box = { x: b.x + b.w * 0.52, y: b.y + b.h - 1.6, w: 4.2, h: 1.0 };
  o.push(rect({ x: lathe.x + 0.12, y: lathe.y + 0.15, w: lathe.w, h: lathe.h }, SHADOW), rect(lathe, `fill="${STEEL}" stroke="${LINE}" stroke-width="0.07"`));
  o.push(rect({ x: lathe.x + 0.2, y: lathe.y + 0.15, w: 1, h: 0.7 }, `fill="#cbd3dd"`), line(lathe.x + 1.3, lathe.y + 0.5, lathe.x + lathe.w - 0.3, lathe.y + 0.5, `stroke="${INK}" stroke-width="0.08"`));
  o.push(circle(b.x + b.w - 2, b.y + b.h - 1.3, 0.55, `fill="${STEEL}" stroke="${LINE}" stroke-width="0.07"`), circle(b.x + b.w - 2, b.y + b.h - 1.3, 0.2, `fill="${LINE}"`));
  return o.join('');
}

/** Bay lines in front of the chargers, with two forklifts parked on charge. */
function chargingBays(b: Box, chargers: Box[]): string {
  const o: string[] = [];
  const top = b.y + 1.4;
  for (const c of chargers) {
    o.push(line(c.x - 0.8, top, c.x - 0.8, c.y - 0.1, 'stroke="#d4d9e1" stroke-width="0.1"'));
    o.push(line(c.x + c.w + 0.8, top, c.x + c.w + 0.8, c.y - 0.1, 'stroke="#d4d9e1" stroke-width="0.1"'));
  }
  chargers.filter((_, i) => i % 2 === 1).forEach((c) => o.push(forklift(c.x + c.w / 2, (top + c.y) / 2 + 0.2)));
  return o.join('');
}

function forklift(cx: number, cy: number): string {
  const w = 1.2;
  const h = 2.2;
  const x = cx - w / 2;
  const y = cy - h / 2 + 0.5;
  return rect({ x: x + 0.12, y: y + 0.15, w, h }, SHADOW)
    + rect({ x, y, w, h }, 'rx="0.25" fill="#f5c542" stroke="#a37f12" stroke-width="0.06"')
    + rect({ x: x + 0.15, y: y + 0.35, w: w - 0.3, h: 0.9 }, `fill="none" stroke="${INK}" stroke-width="0.07"`)
    + rect({ x: x + 0.2, y: y + h - 0.55, w: w - 0.4, h: 0.4 }, `fill="${LINE}"`)
    + rect({ x: x + 0.22, y: y - 1.05, w: 0.14, h: 1.05 }, `fill="${INK}"`)
    + rect({ x: x + w - 0.36, y: y - 1.05, w: 0.14, h: 1.05 }, `fill="${INK}"`);
}
