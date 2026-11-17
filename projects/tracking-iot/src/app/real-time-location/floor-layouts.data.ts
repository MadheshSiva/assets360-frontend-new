/**
 * Static demo floor plans (what Administration › Maps & Floor Plans held): per floor, its zones and the assets /
 * devices plotted on it, as % of the plan from the top-left corner, plus a generated SVG plan image.
 */
import { DEMO_ASSETS, DEMO_FLOORS, buildingById } from '../shared/master-data.data';
import { seeded } from '../shared/tracking-api';
import { DEVICE_CONN, IOT_DEVICES } from '../device-management/iot-devices.data';
import type { FloorLayout, LayoutPlot, LayoutZone } from './floor-layout-api';

type ZoneRow = [name: string, type: string, x: number, y: number, w: number, h: number, color: string];

const ZONES: Record<string, ZoneRow[]> = {
  'FLR-CHN-A-G': [
    ['Machining Cell', 'Production', 4, 6, 40, 42, '#2563EB'], ['Moulding Line', 'Production', 48, 6, 48, 42, '#7C3AED'],
    ['Raw Material Store', 'Storage', 4, 54, 30, 40, '#0D9488'], ['QC Lab', 'Restricted', 38, 54, 22, 40, '#EF4444'], ['Maintenance Workshop', 'Utility', 64, 54, 32, 40, '#F97316'],
  ],
  'FLR-CHN-B-G': [
    ['Loading Dock A', 'Loading', 4, 70, 46, 24, '#F5B40B'], ['Dispatch Bay', 'Loading', 54, 70, 42, 24, '#0891B2'], ['Racking Aisles', 'Storage', 4, 6, 60, 58, '#0D9488'],
    ['Hazmat Cage', 'Restricted', 68, 6, 28, 26, '#EF4444'], ['Packing Area', 'Production', 68, 38, 28, 26, '#7C3AED'],
  ],
  'FLR-CHN-U-G': [
    ['Compressor Room', 'Utility', 4, 6, 28, 40, '#2563EB'], ['Pump House', 'Utility', 36, 6, 26, 40, '#0891B2'], ['Chiller Plant', 'Utility', 66, 6, 30, 40, '#0D9488'],
    ['DG Yard', 'Utility', 4, 54, 50, 40, '#F97316'], ['Electrical Room', 'Restricted', 58, 54, 38, 40, '#EF4444'],
  ],
  'FLR-BLR-1-G': [
    ['High-Bay Racking', 'Storage', 4, 6, 62, 56, '#0D9488'], ['Pick Faces', 'Storage', 70, 6, 26, 56, '#2563EB'], ['Inbound Staging', 'Loading', 4, 68, 40, 26, '#F5B40B'],
    ['Charging Bay', 'Utility', 48, 68, 20, 26, '#F97316'], ['Returns Area', 'Storage', 72, 68, 24, 26, '#7C3AED'],
  ],
  'FLR-BLR-2-G': [
    ['Truck Bays', 'Loading', 4, 64, 92, 30, '#F5B40B'], ['Sortation Line', 'Production', 4, 6, 56, 52, '#7C3AED'], ['Cross-Dock Lane', 'Loading', 64, 6, 32, 52, '#0891B2'],
  ],
  'FLR-PUN-1-G': [
    ['Assembly Line 1', 'Production', 4, 6, 44, 40, '#2563EB'], ['Assembly Line 2', 'Production', 52, 6, 44, 40, '#0891B2'], ['Welding Cell', 'Restricted', 4, 52, 34, 42, '#EF4444'],
    ['Tool Crib', 'Storage', 42, 52, 24, 42, '#0D9488'], ['Utility Corner', 'Utility', 70, 52, 26, 42, '#F97316'],
  ],
  'FLR-PUN-2-G': [
    ['Prep Area', 'Production', 4, 6, 30, 88, '#2563EB'], ['Spray Booth', 'Restricted', 38, 6, 28, 88, '#EF4444'], ['Curing Oven', 'Production', 70, 6, 26, 88, '#F97316'],
  ],
  'FLR-HYD-1-G': [
    ['Cold Room 1', 'Cold Storage', 4, 6, 34, 50, '#2563EB'], ['Cold Room 2', 'Cold Storage', 42, 6, 30, 50, '#0891B2'], ['Plant Room', 'Restricted', 76, 6, 20, 50, '#EF4444'],
    ['Ante Room', 'Storage', 4, 62, 50, 32, '#0D9488'], ['Reefer Dock', 'Loading', 58, 62, 38, 32, '#F5B40B'],
  ],
  'FLR-DXB-1-G': [
    ['Bulk Storage', 'Storage', 4, 6, 60, 54, '#0D9488'], ['Office Block', 'Restricted', 68, 6, 28, 30, '#EF4444'], ['Reefer Plug-in Area', 'Cold Storage', 68, 40, 28, 20, '#0891B2'],
    ['Dispatch Apron', 'Loading', 4, 66, 92, 28, '#F5B40B'],
  ],
};

/** Floor of each fixed device (gateways and readers have no asset to place them). */
const FIXED_DEVICE_FLOOR: Record<string, [floor: string, x: number, y: number]> = {
  'GW-CHN-01': ['FLR-CHN-U-G', 50, 50], 'GW-CHN-02': ['FLR-CHN-B-G', 50, 66], 'RFR-6002': ['FLR-CHN-B-G', 75, 96],
  'GW-BLR-01': ['FLR-BLR-2-G', 62, 60], 'GW-BLR-02': ['FLR-BLR-1-G', 46, 64], 'RFR-6001': ['FLR-BLR-2-G', 30, 96],
  'GW-PUN-01': ['FLR-PUN-1-G', 50, 49], 'GW-PUN-02': ['FLR-PUN-1-G', 20, 49], 'GW-HYD-01': ['FLR-HYD-1-G', 40, 59], 'GW-HYD-02': ['FLR-HYD-1-G', 56, 78],
  'GW-DXB-01': ['FLR-DXB-1-G', 66, 63],
};

const ASPECT = 1.6;

function zonesOf(floorId: string): LayoutZone[] {
  return (ZONES[floorId] ?? []).map(([name, type, x, y, w, h, color], i) => ({
    id: `${floorId}-Z${i + 1}`, code: `Z${String(i + 1).padStart(2, '0')}`, name, type, color, shape: 'Rectangle', x, y, w, h, points: [], radius: null,
    restricted: type === 'Restricted', rule: type === 'Restricted' ? 'Authorised personnel only' : type === 'Cold Storage' ? 'Max dwell 15 min' : '',
  }));
}

function plotsOf(floorId: string, zones: LayoutZone[]): LayoutPlot[] {
  const plots: LayoutPlot[] = [];
  for (const a of DEMO_ASSETS.filter((x) => x.floorId === floorId)) {
    const z = zones.find((zz) => zz.name === a.zone);
    const dev = IOT_DEVICES.find((d) => d.assetRegistrationId === a.regId);
    const conn = dev ? DEVICE_CONN[dev.deviceId] : undefined;
    const mobile = /forklift|pallet|agv|vehicle|cart/i.test(a.type);
    const status = a.status === 'Under Maintenance' ? 'Under Maintenance' : conn === 'Offline' ? 'Offline' : conn === 'Warning' ? 'Stale' : mobile ? 'Moving' : 'Stationary';
    const fx = 0.25 + seeded(a.regId) * 0.5;
    const fy = 0.3 + seeded(a.tag) * 0.45;
    plots.push({
      id: a.regId, kind: 'asset', code: a.tag, name: a.name, type: a.type, status,
      x: z ? z.x + z.w * fx : 50, y: z ? z.y + z.h * fy : 50,
    });
  }
  for (const [id, [floor, x, y]] of Object.entries(FIXED_DEVICE_FLOOR)) {
    if (floor !== floorId) continue;
    const d = IOT_DEVICES.find((dd) => dd.deviceId === id);
    if (!d) continue;
    plots.push({ id, kind: 'device', code: id, name: d.deviceName, type: d.deviceType, status: DEVICE_CONN[id] === 'Offline' ? 'Offline' : 'Online', x, y });
  }
  return plots;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A simple architectural floor plan drawing for the zones, as an SVG data URL. */
function planImage(title: string, zones: LayoutZone[]): string {
  const W = 1600;
  const H = W / ASPECT;
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#f8fafc"/>`);
  for (let x = 100; x < W; x += 100) for (let y = 100; y < H; y += 100) parts.push(`<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#cbd5e1"/>`);
  for (const z of zones) {
    const x = (z.x / 100) * W;
    const y = (z.y / 100) * H;
    const w = (z.w / 100) * W;
    const h = (z.h / 100) * H;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${z.restricted ? '#fef2f2' : '#ffffff'}" stroke="#64748b" stroke-width="4"/>`);
    if (/rack|pick|storage|store|crib/i.test(z.name)) {
      for (let rx = x + 30; rx < x + w - 30; rx += 46) parts.push(`<rect x="${rx}" y="${y + 50}" width="18" height="${Math.max(10, h - 90)}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>`);
    } else if (/line|sortation|cell|oven|booth/i.test(z.name)) {
      parts.push(`<rect x="${x + 30}" y="${y + h / 2 - 14}" width="${w - 60}" height="28" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>`);
      for (let rx = x + 50; rx < x + w - 60; rx += 120) parts.push(`<rect x="${rx}" y="${y + h / 2 - 60}" width="60" height="36" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>`);
    } else if (/dock|bay|apron|lane/i.test(z.name)) {
      for (let rx = x + 24; rx < x + w - 70; rx += 96) parts.push(`<rect x="${rx}" y="${y + h - 16}" width="72" height="12" fill="#fde68a" stroke="#d97706" stroke-width="2"/>`);
    }
    parts.push(`<text x="${x + 18}" y="${y + 36}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#475569">${esc(z.name.toUpperCase())}</text>`);
    // door gap on the bottom wall
    parts.push(`<rect x="${x + w / 2 - 30}" y="${y + h - 4}" width="60" height="8" fill="#f8fafc"/>`);
  }
  parts.push(`<rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#1e293b" stroke-width="12"/>`);
  parts.push(`<rect x="${W - 420}" y="${H - 64}" width="400" height="44" fill="#ffffff" stroke="#64748b" stroke-width="2"/>`);
  parts.push(`<text x="${W - 404}" y="${H - 34}" font-family="Arial, sans-serif" font-size="20" fill="#334155">${esc(title)}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Floor plan per floor id. */
export const FLOOR_LAYOUTS = new Map<string, FloorLayout>(
  DEMO_FLOORS.filter((f) => ZONES[f.id]).map((f) => {
    const zones = zonesOf(f.id);
    const b = buildingById(f.buildingId);
    const widthM = Math.round(Math.sqrt(f.area * ASPECT));
    const title = `${b?.name ?? ''} · ${f.name}`;
    return [f.id, { planName: `${title} (rev C)`, imageUrl: planImage(title, zones), widthM, heightM: Math.round(widthM / ASPECT), zones, plots: plotsOf(f.id, zones) }];
  }),
);
