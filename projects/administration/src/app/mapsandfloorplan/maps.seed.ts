import type {
  AssetListItemDto,
  FloorPlanDto,
  IoTDeviceDto,
  LayerSetDto,
  LocationSources,
  PlotDto,
  VersionDto,
  ZoneDto
} from './maps-api.service';

// Static demo data for Maps & Floor Plans: locations, floor plans (drawn as SVG), versions, zones, plotted assets / devices

/* ===== Time helpers ===== */

const NOW = Date.now();

/** ISO time `minutes` ago. */
function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/* ===== Floor plan pictures (inline SVG, served as data URIs) ===== */

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill?: string;
}

/**
 * A simple architectural floor plan: outer walls, rooms (in % of the plan), door gaps, a 5 m grid and a title block.
 * The picture's aspect ratio follows the plan's real width / height.
 */
function floorPlanSvg(title: string, widthM: number, heightM: number, rooms: Room[], extras = ''): string {
  const W = 1200;
  const H = Math.round((W * heightM) / widthM);
  const px = (p: number) => (p / 100) * W;
  const py = (p: number) => (p / 100) * H;
  const grid: string[] = [];
  for (let m = 5; m < widthM; m += 5) grid.push(`<line x1="${((m / widthM) * W).toFixed(1)}" y1="0" x2="${((m / widthM) * W).toFixed(1)}" y2="${H}"/>`);
  for (let m = 5; m < heightM; m += 5) grid.push(`<line x1="0" y1="${((m / heightM) * H).toFixed(1)}" x2="${W}" y2="${((m / heightM) * H).toFixed(1)}"/>`);
  const roomSvg = rooms
    .map((r) => {
      const x = px(r.x);
      const y = py(r.y);
      const w = px(r.w);
      const h = py(r.h);
      // door gap on the bottom wall
      const door = Math.min(36, w / 3);
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${r.fill ?? '#ffffff'}" stroke="#334155" stroke-width="4"/>` +
        `<line x1="${x + w / 2 - door / 2}" y1="${y + h}" x2="${x + w / 2 + door / 2}" y2="${y + h}" stroke="${r.fill ?? '#ffffff'}" stroke-width="6"/>` +
        `<path d="M${x + w / 2 - door / 2} ${y + h} A${door} ${door} 0 0 1 ${x + w / 2 + door / 2} ${y + h - door}" fill="none" stroke="#94a3b8" stroke-width="1.5"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${Math.max(13, Math.min(22, w / 9))}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-family="Arial, sans-serif">${r.label}</text>`
      );
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#f8fafc"/>` +
    `<g stroke="#e2e8f0" stroke-width="1">${grid.join('')}</g>` +
    roomSvg +
    extras +
    `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="#1e293b" stroke-width="8"/>` +
    `<g font-family="Arial, sans-serif"><rect x="${W - 330}" y="${H - 64}" width="314" height="48" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>` +
    `<text x="${W - 318}" y="${H - 36}" font-size="17" font-weight="bold" fill="#1e293b">${title}</text>` +
    `<text x="${W - 318}" y="${H - 22}" font-size="11" fill="#64748b">${widthM} m × ${heightM} m · Purple IQ Facilities</text></g>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Storage racks drawn as rows of thin rectangles (warehouse). */
function racks(x0: number, y0: number, rows: number, len: number, W = 1200, H = 733): string {
  let out = '';
  for (let i = 0; i < rows; i++) {
    const y = (y0 / 100) * H + i * 46;
    out += `<rect x="${(x0 / 100) * W}" y="${y}" width="${(len / 100) * W}" height="18" fill="#dbeafe" stroke="#64748b" stroke-width="2"/>`;
  }
  return out;
}

const OFFICE = '#fff7ed';
const PROD = '#eff6ff';
const STORE = '#ecfdf5';
const RESTRICT = '#fef2f2';
const MAINT = '#f5f3ff';

export const IMG_BLDA_GROUND = floorPlanSvg('Building A - Ground Floor', 60, 32, [
  { x: 3, y: 12, w: 15, h: 31, label: 'Admin Office', fill: OFFICE },
  { x: 3, y: 45, w: 15, h: 26, label: 'Engineering', fill: OFFICE },
  { x: 24, y: 12, w: 41, h: 54, label: 'Production Hall', fill: PROD },
  { x: 70, y: 15, w: 25, h: 27, label: 'Stores', fill: STORE },
  { x: 70, y: 45, w: 25, h: 24, label: 'Electrical Room', fill: RESTRICT },
  { x: 30, y: 74, w: 27, h: 18, label: 'Workshop', fill: MAINT },
  { x: 3, y: 75, w: 15, h: 17, label: 'Lobby' },
  { x: 62, y: 74, w: 33, h: 18, label: 'Loading Bay' }
]);

export const IMG_BLDA_GROUND_V2 = floorPlanSvg('Building A - Ground Floor (v2.0)', 60, 32, [
  { x: 3, y: 12, w: 15, h: 59, label: 'Offices', fill: OFFICE },
  { x: 24, y: 12, w: 41, h: 54, label: 'Production Hall', fill: PROD },
  { x: 70, y: 15, w: 25, h: 27, label: 'Stores', fill: STORE },
  { x: 70, y: 45, w: 25, h: 24, label: 'Electrical Room', fill: RESTRICT },
  { x: 30, y: 74, w: 27, h: 18, label: 'Workshop', fill: MAINT }
]);

export const IMG_BLDA_FLOOR1 = floorPlanSvg('Building A - Floor 1', 60, 32, [
  { x: 3, y: 8, w: 22, h: 38, label: 'Open Office East', fill: OFFICE },
  { x: 27, y: 8, w: 22, h: 38, label: 'Open Office West', fill: OFFICE },
  { x: 51, y: 8, w: 14, h: 18, label: 'Meeting Room 1' },
  { x: 51, y: 28, w: 14, h: 18, label: 'Meeting Room 2' },
  { x: 67, y: 8, w: 30, h: 38, label: 'Board Room', fill: '#fdf4ff' },
  { x: 3, y: 56, w: 30, h: 36, label: 'Cafeteria', fill: STORE },
  { x: 35, y: 56, w: 20, h: 36, label: 'Reception' },
  { x: 57, y: 56, w: 18, h: 36, label: 'IT Room', fill: RESTRICT },
  { x: 77, y: 56, w: 20, h: 36, label: 'Print & Copy' }
]);

export const IMG_BLDA_FLOOR2 = floorPlanSvg('Building A - Floor 2', 60, 32, [
  { x: 3, y: 8, w: 30, h: 50, label: 'Server Room', fill: RESTRICT },
  { x: 35, y: 8, w: 18, h: 50, label: 'UPS & Batteries', fill: RESTRICT },
  { x: 55, y: 8, w: 42, h: 50, label: 'Archive Storage', fill: STORE },
  { x: 3, y: 66, w: 45, h: 26, label: 'NOC', fill: OFFICE },
  { x: 50, y: 66, w: 47, h: 26, label: 'Spare Parts Store', fill: STORE }
]);

export const IMG_BLDB_FLOOR1 = floorPlanSvg('Building B - Floor 1', 48, 30, [
  { x: 4, y: 8, w: 52, h: 56, label: 'Fabrication Workshop', fill: MAINT },
  { x: 60, y: 8, w: 36, h: 30, label: 'Tool Crib', fill: STORE },
  { x: 60, y: 42, w: 36, h: 22, label: 'Paint Booth', fill: RESTRICT },
  { x: 4, y: 70, w: 40, h: 22, label: 'Supervisor Office', fill: OFFICE },
  { x: 48, y: 70, w: 48, h: 22, label: 'Goods In' }
]);

export const IMG_DUBAI_SITE = floorPlanSvg(
  'Dubai HQ - Site Map',
  220,
  140,
  [
    { x: 6, y: 10, w: 34, h: 40, label: 'Building A', fill: PROD },
    { x: 46, y: 10, w: 26, h: 30, label: 'Building B', fill: MAINT },
    { x: 78, y: 10, w: 16, h: 30, label: 'Gatehouse' },
    { x: 6, y: 58, w: 50, h: 30, label: 'Staff Parking', fill: '#f1f5f9' },
    { x: 62, y: 50, w: 32, h: 38, label: 'Utility Yard', fill: RESTRICT }
  ],
  ''
);

export const IMG_WAREHOUSE = floorPlanSvg(
  'Sharjah Warehouse - Ground Floor',
  90,
  55,
  [
    { x: 3, y: 6, w: 64, h: 66, label: '', fill: STORE },
    { x: 70, y: 6, w: 27, h: 30, label: 'Cold Store', fill: PROD },
    { x: 70, y: 40, w: 27, h: 32, label: 'Hazmat Cage', fill: RESTRICT },
    { x: 3, y: 78, w: 30, h: 16, label: 'Dispatch Office', fill: OFFICE },
    { x: 36, y: 78, w: 61, h: 16, label: 'Loading Docks 1-6' }
  ],
  racks(6, 10, 9, 58)
);

/** Floor image held in Master Data (no floor plan yet): drawing on it creates the plan. */
export const IMG_RIYADH_L5 = floorPlanSvg('Riyadh Tower - Level 5', 40, 24, [
  { x: 4, y: 8, w: 44, h: 50, label: 'Open Office', fill: OFFICE },
  { x: 52, y: 8, w: 44, h: 50, label: 'Training Room' },
  { x: 4, y: 64, w: 30, h: 28, label: 'Pantry', fill: STORE },
  { x: 38, y: 64, w: 58, h: 28, label: 'Records Room', fill: RESTRICT }
]);

/* ===== Location tree (Master Data Management) ===== */

export const SEED_LOCATIONS: LocationSources = {
  organizationName: 'Purple IQ Group',
  sites: [
    { id: 'SITE-DXB', siteName: 'Dubai HQ', code: 'DXB', latitude: 25.1857, longitude: 55.2723, status: 'Active' },
    { id: 'SITE-SHJ', siteName: 'Sharjah Facility', code: 'SHJ', latitude: 25.3216, longitude: 55.4729, status: 'Active' },
    { id: 'SITE-RUH', siteName: 'Riyadh Office', code: 'RUH', latitude: 24.7114, longitude: 46.6744, status: 'Active' },
    { id: 'SITE-LON', siteName: 'London Office', code: 'LON', latitude: 51.5145, longitude: -0.0835, status: 'Active' }
  ],
  buildings: [
    { id: 'BLD-DXB-A', name: 'Building A', code: 'DXB-A', site: { id: 'SITE-DXB', name: 'Dubai HQ' }, latitude: 25.1861, longitude: 55.2716 },
    { id: 'BLD-DXB-B', name: 'Building B', code: 'DXB-B', site: { id: 'SITE-DXB', name: 'Dubai HQ' }, latitude: 25.1853, longitude: 55.2731 },
    { id: 'BLD-SHJ-WH', name: 'Main Warehouse', code: 'SHJ-WH1', site: { id: 'SITE-SHJ', name: 'Sharjah Facility' }, latitude: 25.3219, longitude: 55.4734 },
    { id: 'BLD-RUH-T', name: 'Riyadh Tower', code: 'RUH-T1', site: { id: 'SITE-RUH', name: 'Riyadh Office' }, latitude: 24.7114, longitude: 46.6744 }
  ],
  floors: [
    { id: 'FLR-DXB-A-G', name: 'Ground Floor', code: 'A-G', buildingId: 'BLD-DXB-A' },
    { id: 'FLR-DXB-A-1', name: 'Floor 1', code: 'A-1', buildingId: 'BLD-DXB-A' },
    { id: 'FLR-DXB-A-2', name: 'Floor 2', code: 'A-2', buildingId: 'BLD-DXB-A' },
    { id: 'FLR-DXB-B-1', name: 'Floor 1', code: 'B-1', buildingId: 'BLD-DXB-B' },
    { id: 'FLR-DXB-B-2', name: 'Floor 2', code: 'B-2', buildingId: 'BLD-DXB-B' },
    { id: 'FLR-SHJ-WH-G', name: 'Ground Floor', code: 'WH-G', buildingId: 'BLD-SHJ-WH' },
    { id: 'FLR-RUH-T-5', name: 'Level 5', code: 'T-5', buildingId: 'BLD-RUH-T', imageUrl: IMG_RIYADH_L5 }
  ]
};

/* ===== Floor plans ===== */

const TENANT = { clientId: 'demo-client', tenantId: 'demo-tenant' };

function plan(p: Partial<FloorPlanDto> & Pick<FloorPlanDto, 'floorPlanId' | 'locationId' | 'locationPath' | 'name'>): FloorPlanDto {
  return {
    locationType: 'floor',
    description: null,
    type: 'Floor Plan',
    format: 'SVG',
    fileUrl: null,
    fileName: null,
    sizeBytes: null,
    widthMeters: 60,
    heightMeters: 32,
    scale: '1 : 100',
    currentVersion: 'v1.0',
    status: 'Published',
    publishedAt: null,
    publishedBy: null,
    zoneCount: 0,
    plotCount: 0,
    createdBy: 'Sarah Ahmed',
    createdAt: null,
    updatedBy: 'Sarah Ahmed',
    updatedAt: null,
    ...TENANT,
    ...p
  };
}

export const SEED_FLOOR_PLANS: FloorPlanDto[] = [
  plan({
    floorPlanId: 'FP-0001', locationId: 'FLR-DXB-A-G', locationPath: 'Dubai HQ > Building A > Ground Floor', name: 'Building A - Ground Floor',
    description: 'Main production floor', fileUrl: IMG_BLDA_GROUND, fileName: 'BuildingA_Ground_v2.1.svg', sizeBytes: 2_516_582,
    currentVersion: 'v2.1', publishedAt: '2026-10-15T10:24:00Z', publishedBy: 'James Tan',
    createdAt: '2026-06-05T11:20:00Z', updatedBy: 'James Tan', updatedAt: '2026-10-15T10:24:00Z'
  }),
  plan({
    floorPlanId: 'FP-0002', locationId: 'FLR-DXB-A-G', locationPath: 'Dubai HQ > Building A > Ground Floor', name: 'Building A - Ground Floor (CAD)',
    description: 'Detailed layout from the architect (DWG)', format: 'DWG', fileName: 'BuildingA_Ground_CAD_v1.0.dwg', sizeBytes: 9_122_611,
    scale: '1 : 50', status: 'Draft', createdBy: 'Priya Sharma', createdAt: '2026-10-28T15:15:00Z', updatedBy: 'Priya Sharma', updatedAt: '2026-10-28T15:15:00Z'
  }),
  plan({
    floorPlanId: 'FP-0003', locationId: 'FLR-DXB-A-1', locationPath: 'Dubai HQ > Building A > Floor 1', name: 'Building A - Floor 1',
    description: 'Offices, meeting rooms and cafeteria', fileUrl: IMG_BLDA_FLOOR1, fileName: 'BuildingA_Floor1_v1.2.svg', sizeBytes: 1_992_294,
    currentVersion: 'v1.2', publishedAt: '2026-09-02T09:10:00Z', publishedBy: 'Omar Hassan',
    createdAt: '2026-05-12T08:00:00Z', updatedBy: 'Omar Hassan', updatedAt: '2026-09-02T09:10:00Z'
  }),
  plan({
    floorPlanId: 'FP-0004', locationId: 'FLR-DXB-A-2', locationPath: 'Dubai HQ > Building A > Floor 2', name: 'Building A - Floor 2',
    description: 'Server room, NOC and storage', fileUrl: IMG_BLDA_FLOOR2, fileName: 'BuildingA_Floor2_v1.0.svg', sizeBytes: 1_258_291,
    publishedAt: '2026-08-20T14:40:00Z', publishedBy: 'Priya Sharma',
    createdAt: '2026-08-18T10:00:00Z', updatedBy: 'Priya Sharma', updatedAt: '2026-08-20T14:40:00Z'
  }),
  plan({
    floorPlanId: 'FP-0005', locationId: 'FLR-DXB-B-1', locationPath: 'Dubai HQ > Building B > Floor 1', name: 'Building B - Floor 1',
    description: 'Fabrication workshop and tool crib', fileUrl: IMG_BLDB_FLOOR1, fileName: 'BuildingB_Floor1_v1.1.svg', sizeBytes: 2_306_867,
    widthMeters: 48, heightMeters: 30, currentVersion: 'v1.1', status: 'Draft',
    createdBy: 'Omar Hassan', createdAt: '2026-09-25T11:00:00Z', updatedBy: 'Omar Hassan', updatedAt: '2026-11-03T11:00:00Z'
  }),
  plan({
    floorPlanId: 'FP-0006', locationId: 'SITE-DXB', locationType: 'site', locationPath: 'Dubai HQ', name: 'Dubai HQ - Site Map',
    description: 'Campus overview with buildings, parking and utility yard', type: 'Site Map', fileUrl: IMG_DUBAI_SITE, fileName: 'DubaiHQ_site_v3.0.svg',
    sizeBytes: 838_861, widthMeters: 220, heightMeters: 140, scale: '1 : 500', currentVersion: 'v3.0',
    publishedAt: '2026-07-11T08:30:00Z', publishedBy: 'James Tan', createdAt: '2025-11-02T08:30:00Z', updatedBy: 'James Tan', updatedAt: '2026-07-11T08:30:00Z'
  }),
  plan({
    floorPlanId: 'FP-0007', locationId: 'FLR-SHJ-WH-G', locationPath: 'Sharjah Facility > Main Warehouse > Ground Floor', name: 'Sharjah Warehouse - Ground',
    description: 'Racking layout, cold store and loading docks', fileUrl: IMG_WAREHOUSE, fileName: 'SharjahWarehouse_v2.0.svg', sizeBytes: 4_823_449,
    widthMeters: 90, heightMeters: 55, scale: '1 : 200', currentVersion: 'v2.0',
    publishedAt: '2026-09-18T16:05:00Z', publishedBy: 'Fatima Noor', createdAt: '2026-03-08T09:00:00Z', updatedBy: 'Fatima Noor', updatedAt: '2026-09-18T16:05:00Z'
  }),
  plan({
    floorPlanId: 'FP-0008', locationId: 'FLR-DXB-A-G', locationPath: 'Dubai HQ > Building A > Ground Floor', name: 'Building A - Ground Floor (2025 fit-out)',
    description: 'Layout before the 2026 production line expansion', fileUrl: IMG_BLDA_GROUND_V2, fileName: 'BuildingA_Ground_2025.svg', sizeBytes: 2_202_009,
    status: 'Archived', publishedAt: '2025-12-01T09:00:00Z', publishedBy: 'James Tan',
    createdAt: '2025-11-20T09:00:00Z', updatedBy: 'Sarah Ahmed', updatedAt: '2026-06-05T11:25:00Z'
  })
];

/* ===== Versions ===== */

function version(v: Partial<VersionDto> & Pick<VersionDto, 'version' | 'status'>): VersionDto {
  return {
    current: false, fileUrl: null, fileName: null, format: 'SVG', sizeBytes: null, description: null, changes: [], uploadedBy: 'Sarah Ahmed', uploadedAt: null, ...v
  };
}

export const SEED_VERSIONS: Record<string, VersionDto[]> = {
  'FP-0001': [
    version({
      version: 'v2.2', status: 'Draft', fileUrl: IMG_BLDA_GROUND, fileName: 'BuildingA_Ground_v2.2.svg', sizeBytes: 2_570_000, uploadedBy: 'Priya Sharma',
      uploadedAt: '2026-11-10T13:05:00Z', description: 'Loading bay re-marked for the new forklift route.', changes: ['Loading bay re-marked for the new forklift route', 'Moved the fire assembly point marker']
    }),
    version({
      version: 'v2.1', current: true, status: 'Published', fileUrl: IMG_BLDA_GROUND, fileName: 'BuildingA_Ground_v2.1.svg', sizeBytes: 2_516_582, uploadedBy: 'James Tan',
      uploadedAt: '2026-10-15T10:24:00Z', description: 'Updated production zone layout, added 2 new asset plots and refined zone boundaries.',
      changes: ['Updated production zone layout', 'Added 2 new asset plots (CH-001, AHU-01)', 'Refined zone boundaries']
    }),
    version({
      version: 'v2.0', status: 'Archived', fileUrl: IMG_BLDA_GROUND_V2, fileName: 'BuildingA_Ground_v2.0.svg', sizeBytes: 2_411_724, uploadedBy: 'Priya Sharma',
      uploadedAt: '2026-08-10T15:15:00Z', description: 'Added the storage zone and moved gateways to their surveyed positions.',
      changes: ['Added storage zone (SZ-01)', 'Updated device locations', 'Minor layout adjustments']
    }),
    version({
      version: 'v1.0', status: 'Archived', fileUrl: IMG_BLDA_GROUND_V2, fileName: 'BuildingA_Ground_v1.0.svg', sizeBytes: 2_202_009, uploadedBy: 'Sarah Ahmed',
      uploadedAt: '2026-06-05T11:20:00Z', description: 'Initial floor plan upload with the basic zones.', changes: ['Initial floor plan upload', 'Basic zones and locations']
    })
  ],
  'FP-0002': [
    version({ version: 'v1.0', current: true, status: 'Draft', format: 'DWG', fileName: 'BuildingA_Ground_CAD_v1.0.dwg', sizeBytes: 9_122_611, uploadedBy: 'Priya Sharma', uploadedAt: '2026-10-28T15:15:00Z', description: 'Initial upload', changes: ['Initial upload of the architect CAD drawing'] })
  ],
  'FP-0003': [
    version({ version: 'v1.2', current: true, status: 'Published', fileUrl: IMG_BLDA_FLOOR1, fileName: 'BuildingA_Floor1_v1.2.svg', sizeBytes: 1_992_294, uploadedBy: 'Omar Hassan', uploadedAt: '2026-09-02T09:10:00Z', description: 'Board room merged with meeting room 3.', changes: ['Board room merged with meeting room 3', 'Wi-Fi access points re-plotted'] }),
    version({ version: 'v1.1', status: 'Archived', fileUrl: IMG_BLDA_FLOOR1, fileName: 'BuildingA_Floor1_v1.1.svg', sizeBytes: 1_960_000, uploadedBy: 'Omar Hassan', uploadedAt: '2026-07-14T12:00:00Z', description: 'Cafeteria extended.', changes: ['Cafeteria extended'] }),
    version({ version: 'v1.0', status: 'Archived', fileUrl: IMG_BLDA_FLOOR1, fileName: 'BuildingA_Floor1_v1.0.svg', sizeBytes: 1_903_000, uploadedBy: 'Sarah Ahmed', uploadedAt: '2026-05-12T08:00:00Z', description: 'Initial upload', changes: ['Initial upload'] })
  ],
  'FP-0004': [
    version({ version: 'v1.0', current: true, status: 'Published', fileUrl: IMG_BLDA_FLOOR2, fileName: 'BuildingA_Floor2_v1.0.svg', sizeBytes: 1_258_291, uploadedBy: 'Priya Sharma', uploadedAt: '2026-08-18T10:00:00Z', description: 'Initial upload', changes: ['Initial upload', 'Server room and UPS zones'] })
  ],
  'FP-0005': [
    version({ version: 'v1.1', current: true, status: 'Draft', fileUrl: IMG_BLDB_FLOOR1, fileName: 'BuildingB_Floor1_v1.1.svg', sizeBytes: 2_306_867, uploadedBy: 'Omar Hassan', uploadedAt: '2026-11-03T11:00:00Z', description: 'Paint booth added.', changes: ['Paint booth added', 'Tool crib resized'] }),
    version({ version: 'v1.0', status: 'Archived', fileUrl: IMG_BLDB_FLOOR1, fileName: 'BuildingB_Floor1_v1.0.svg', sizeBytes: 2_150_000, uploadedBy: 'Omar Hassan', uploadedAt: '2026-09-25T11:00:00Z', description: 'Initial upload', changes: ['Initial upload'] })
  ],
  'FP-0006': [
    version({ version: 'v3.0', current: true, status: 'Published', fileUrl: IMG_DUBAI_SITE, fileName: 'DubaiHQ_site_v3.0.svg', sizeBytes: 838_861, uploadedBy: 'James Tan', uploadedAt: '2026-07-11T08:30:00Z', description: 'Utility yard and new gatehouse.', changes: ['Utility yard fenced', 'New gatehouse'] }),
    version({ version: 'v2.0', status: 'Archived', fileUrl: IMG_DUBAI_SITE, fileName: 'DubaiHQ_site_v2.0.svg', sizeBytes: 801_000, uploadedBy: 'James Tan', uploadedAt: '2026-02-03T08:30:00Z', description: 'Building B added.', changes: ['Building B added'] })
  ],
  'FP-0007': [
    version({ version: 'v2.0', current: true, status: 'Published', fileUrl: IMG_WAREHOUSE, fileName: 'SharjahWarehouse_v2.0.svg', sizeBytes: 4_823_449, uploadedBy: 'Fatima Noor', uploadedAt: '2026-09-18T16:05:00Z', description: 'Racking re-layout for 9 aisles.', changes: ['Racking re-layout for 9 aisles', 'Hazmat cage moved next to the cold store'] }),
    version({ version: 'v1.0', status: 'Archived', fileUrl: IMG_WAREHOUSE, fileName: 'SharjahWarehouse_v1.0.svg', sizeBytes: 4_600_000, uploadedBy: 'Fatima Noor', uploadedAt: '2026-03-08T09:00:00Z', description: 'Initial upload', changes: ['Initial upload'] })
  ],
  'FP-0008': [
    version({ version: 'v1.0', current: true, status: 'Archived', fileUrl: IMG_BLDA_GROUND_V2, fileName: 'BuildingA_Ground_2025.svg', sizeBytes: 2_202_009, uploadedBy: 'James Tan', uploadedAt: '2025-11-20T09:00:00Z', description: 'Initial upload', changes: ['Initial upload'] })
  ]
};

/* ===== Zones ===== */

function zone(
  floorPlanId: string,
  zoneId: string,
  z: Partial<ZoneDto> & Pick<ZoneDto, 'code' | 'name' | 'type' | 'color' | 'x' | 'y' | 'w' | 'h'>
): ZoneDto {
  return {
    zoneId,
    floorPlanId,
    shape: 'Rectangle',
    points: [],
    radius: null,
    areaM2: 0,
    description: '',
    accessRule: 'All Staff',
    active: true,
    geofence: false,
    entryAlert: false,
    exitAlert: false,
    dwellAlert: false,
    dwellMinutes: 30,
    createdBy: 'Sarah Ahmed',
    createdAt: '2026-06-05T11:30:00Z',
    updatedBy: 'Sarah Ahmed',
    updatedAt: '2026-10-15T10:30:00Z',
    ...z
  };
}

export const SEED_ZONES: ZoneDto[] = [
  // Building A - Ground Floor
  zone('FP-0001', 'ZN-0001', { code: 'OZ-01', name: 'Admin Office', type: 'Office', color: '#F59E0B', x: 3, y: 12, w: 15, h: 31, areaM2: 142.8, description: 'Administration offices.' }),
  zone('FP-0001', 'ZN-0002', { code: 'OZ-02', name: 'Engineering Office', type: 'Office', color: '#F59E0B', x: 3, y: 45, w: 15, h: 26, areaM2: 119.8, description: 'Engineering offices.' }),
  zone('FP-0001', 'ZN-0003', {
    code: 'PZ-01', name: 'Production Hall', type: 'Production', color: '#2563EB', shape: 'Polygon', x: 24, y: 12, w: 41, h: 54,
    points: [{ x: 24, y: 12 }, { x: 65, y: 12 }, { x: 65, y: 66 }, { x: 40, y: 66 }, { x: 24, y: 52 }], areaM2: 1280.5,
    description: 'Main production area with equipment and assembly lines.', accessRule: 'Authorized Personnel Only', geofence: true, entryAlert: true, exitAlert: true
  }),
  zone('FP-0001', 'ZN-0004', { code: 'SZ-01', name: 'Stores', type: 'Storage', color: '#10B981', x: 70, y: 15, w: 25, h: 27, areaM2: 129.6, description: 'Raw material and spares storage.', geofence: true, exitAlert: true }),
  zone('FP-0001', 'ZN-0005', {
    code: 'RZ-01', name: 'Electrical Room', type: 'Restricted', color: '#EF4444', x: 70, y: 45, w: 25, h: 24, areaM2: 115.2,
    description: 'Main LV panel, transformers and chemical store.', accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true, exitAlert: true, dwellAlert: true, dwellMinutes: 15
  }),
  zone('FP-0001', 'ZN-0006', { code: 'MZ-01', name: 'Maintenance Workshop', type: 'Maintenance', color: '#7C3AED', x: 30, y: 74, w: 27, h: 18, areaM2: 93.3, description: 'Maintenance workshop and tool crib.', accessRule: 'Authorized Personnel Only' }),
  zone('FP-0001', 'ZN-0007', { code: 'LB-01', name: 'Loading Bay', type: 'Operational', color: '#64748B', x: 62, y: 74, w: 33, h: 18, areaM2: 114.0, description: 'Forklift and delivery area.', accessRule: 'Contractors with Escort', geofence: true, dwellAlert: true, dwellMinutes: 45 }),
  // Building A - Floor 1
  zone('FP-0003', 'ZN-0011', { code: 'OZ-11', name: 'Open Office East', type: 'Office', color: '#F59E0B', x: 3, y: 8, w: 22, h: 38, areaM2: 160.5 }),
  zone('FP-0003', 'ZN-0012', { code: 'OZ-12', name: 'Open Office West', type: 'Office', color: '#F59E0B', x: 27, y: 8, w: 22, h: 38, areaM2: 160.5 }),
  zone('FP-0003', 'ZN-0013', { code: 'OZ-13', name: 'Board Room', type: 'Office', color: '#EC4899', x: 67, y: 8, w: 30, h: 38, areaM2: 218.9, accessRule: 'Authorized Personnel Only' }),
  zone('FP-0003', 'ZN-0014', { code: 'RZ-11', name: 'IT Room', type: 'Restricted', color: '#EF4444', x: 57, y: 56, w: 18, h: 36, areaM2: 124.4, accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true }),
  // Building A - Floor 2
  zone('FP-0004', 'ZN-0021', {
    code: 'RZ-21', name: 'Server Room', type: 'Restricted', color: '#EF4444', x: 3, y: 8, w: 30, h: 50, areaM2: 288.0,
    description: 'Tier III server hall.', accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true, exitAlert: true, dwellAlert: true, dwellMinutes: 60
  }),
  zone('FP-0004', 'ZN-0022', { code: 'SZ-21', name: 'Archive Storage', type: 'Storage', color: '#10B981', x: 55, y: 8, w: 42, h: 50, areaM2: 403.2 }),
  zone('FP-0004', 'ZN-0023', { code: 'OZ-21', name: 'NOC', type: 'Office', color: '#F59E0B', x: 3, y: 66, w: 45, h: 26, areaM2: 224.6, accessRule: 'Authorized Personnel Only' }),
  // Building B - Floor 1
  zone('FP-0005', 'ZN-0031', { code: 'MZ-31', name: 'Fabrication Workshop', type: 'Maintenance', color: '#7C3AED', x: 4, y: 8, w: 52, h: 56, areaM2: 419.3, accessRule: 'Authorized Personnel Only' }),
  zone('FP-0005', 'ZN-0032', { code: 'RZ-31', name: 'Paint Booth', type: 'Restricted', color: '#EF4444', shape: 'Circle', x: 66, y: 42, w: 24, h: 22, radius: 12, areaM2: 74.6, accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true, dwellAlert: true, dwellMinutes: 20 }),
  // Dubai HQ site map
  zone('FP-0006', 'ZN-0041', { code: 'GF-01', name: 'Campus Perimeter', type: 'Operational', color: '#7C3AED', x: 2, y: 4, w: 96, h: 92, areaM2: 28_310, description: 'Site geofence for vehicle tracking.', geofence: true, entryAlert: true, exitAlert: true }),
  zone('FP-0006', 'ZN-0042', { code: 'RZ-41', name: 'Utility Yard', type: 'Restricted', color: '#EF4444', x: 62, y: 50, w: 32, h: 38, areaM2: 3_745, accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true }),
  // Sharjah warehouse
  zone('FP-0007', 'ZN-0051', { code: 'SZ-51', name: 'Racking Aisles 1-9', type: 'Storage', color: '#10B981', x: 3, y: 6, w: 64, h: 66, areaM2: 2_091, description: 'Selective pallet racking.', geofence: true, exitAlert: true }),
  zone('FP-0007', 'ZN-0052', { code: 'PZ-51', name: 'Cold Store', type: 'Production', color: '#2563EB', x: 70, y: 6, w: 27, h: 30, areaM2: 401.0, description: 'Kept at 2-8 °C.', accessRule: 'Authorized Personnel Only', dwellAlert: true, dwellMinutes: 20 }),
  zone('FP-0007', 'ZN-0053', { code: 'RZ-51', name: 'Hazmat Cage', type: 'Restricted', color: '#EF4444', x: 70, y: 40, w: 27, h: 32, areaM2: 427.7, accessRule: 'Restricted - Badge Required', geofence: true, entryAlert: true, exitAlert: true }),
  zone('FP-0007', 'ZN-0054', { code: 'OP-51', name: 'Loading Docks', type: 'Operational', color: '#64748B', x: 36, y: 78, w: 61, h: 16, areaM2: 483.1, accessRule: 'Contractors with Escort', geofence: true, dwellAlert: true, dwellMinutes: 60 })
];

/* ===== Plot candidates: assets (Asset service) and IoT devices (Tracking) ===== */

export const SEED_ASSETS: AssetListItemDto[] = [
  { id: 'a1', assetRegistrationId: 'AR-000101', assetName: 'Chiller-01', assetTag: 'CH-001', category: 'HVAC', assetType: 'Chiller', status: 'Active', manufacturer: 'Trane' },
  { id: 'a2', assetRegistrationId: 'AR-000102', assetName: 'Chiller-02', assetTag: 'CH-002', category: 'HVAC', assetType: 'Chiller', status: 'Under Maintenance', manufacturer: 'Trane' },
  { id: 'a3', assetRegistrationId: 'AR-000103', assetName: 'Chiller-03', assetTag: 'CH-003', category: 'HVAC', assetType: 'Chiller', status: 'Active', manufacturer: 'Carrier' },
  { id: 'a4', assetRegistrationId: 'AR-000110', assetName: 'AHU-01', assetTag: 'AHU-01', category: 'HVAC', assetType: 'Air Handling Unit', status: 'Active', manufacturer: 'Daikin' },
  { id: 'a5', assetRegistrationId: 'AR-000111', assetName: 'AHU-02', assetTag: 'AHU-02', category: 'HVAC', assetType: 'Air Handling Unit', status: 'Active', manufacturer: 'Daikin' },
  { id: 'a6', assetRegistrationId: 'AR-000120', assetName: 'Pump-01', assetTag: 'PMP-01', category: 'Mechanical', assetType: 'Pump', status: 'Active', manufacturer: 'Grundfos' },
  { id: 'a7', assetRegistrationId: 'AR-000121', assetName: 'Booster Pump-02', assetTag: 'PMP-02', category: 'Mechanical', assetType: 'Pump', status: 'Active', manufacturer: 'Grundfos' },
  { id: 'a8', assetRegistrationId: 'AR-000130', assetName: 'Diesel Generator 500 kVA', assetTag: 'GEN-01', category: 'Electrical', assetType: 'Generator', status: 'Active', manufacturer: 'Caterpillar' },
  { id: 'a9', assetRegistrationId: 'AR-000131', assetName: 'UPS 200 kVA', assetTag: 'UPS-01', category: 'Electrical', assetType: 'UPS', status: 'Active', manufacturer: 'Schneider Electric' },
  { id: 'a10', assetRegistrationId: 'AR-000132', assetName: 'Main LV Panel', assetTag: 'PNL-01', category: 'Electrical', assetType: 'Panel', status: 'Active', manufacturer: 'ABB' },
  { id: 'a11', assetRegistrationId: 'AR-000140', assetName: 'CNC Machine Haas VF-2', assetTag: 'CNC-01', category: 'Machinery', assetType: 'CNC Machine', status: 'Active', manufacturer: 'Haas' },
  { id: 'a12', assetRegistrationId: 'AR-000141', assetName: 'Air Compressor', assetTag: 'CMP-01', category: 'Machinery', assetType: 'Compressor', status: 'Active', manufacturer: 'Atlas Copco' },
  { id: 'a13', assetRegistrationId: 'AR-000150', assetName: 'Forklift Toyota 8FBE', assetTag: 'FLT-01', category: 'Vehicles', assetType: 'Forklift', status: 'Active', manufacturer: 'Toyota' },
  { id: 'a14', assetRegistrationId: 'AR-000151', assetName: 'Forklift Toyota 8FBE', assetTag: 'FLT-02', category: 'Vehicles', assetType: 'Forklift', status: 'Active', manufacturer: 'Toyota' },
  { id: 'a15', assetRegistrationId: 'AR-000152', assetName: 'Reach Truck', assetTag: 'RT-01', category: 'Vehicles', assetType: 'Reach Truck', status: 'Active', manufacturer: 'Crown' },
  { id: 'a16', assetRegistrationId: 'AR-000160', assetName: 'Dell PowerEdge R750 Rack', assetTag: 'SRV-01', category: 'IT Equipment', assetType: 'Server', status: 'Active', manufacturer: 'Dell' },
  { id: 'a17', assetRegistrationId: 'AR-000161', assetName: 'Core Switch Cisco 9500', assetTag: 'NET-01', category: 'IT Equipment', assetType: 'Network Switch', status: 'Active', manufacturer: 'Cisco' },
  { id: 'a18', assetRegistrationId: 'AR-000170', assetName: 'Precision AC Unit', assetTag: 'CRAC-01', category: 'HVAC', assetType: 'CRAC', status: 'Active', manufacturer: 'Vertiv' }
];

export const SEED_DEVICES: IoTDeviceDto[] = [
  { id: 'd1', deviceId: 'GW-01', deviceName: 'BLE Gateway - Production', deviceType: 'BLE Gateway', model: 'Minew G1', serialNumber: 'GW99812', health: 'Good', lastSeenAt: ago(1) },
  { id: 'd2', deviceId: 'GW-02', deviceName: 'BLE Gateway - Stores', deviceType: 'BLE Gateway', model: 'Minew G1', serialNumber: 'GW99813', health: 'Good', lastSeenAt: ago(2) },
  { id: 'd3', deviceId: 'GW-03', deviceName: 'BLE Gateway - Warehouse North', deviceType: 'BLE Gateway', model: 'Minew G1', serialNumber: 'GW99840', health: 'Good', lastSeenAt: ago(1) },
  { id: 'd4', deviceId: 'GW-04', deviceName: 'BLE Gateway - Warehouse Docks', deviceType: 'BLE Gateway', model: 'Minew G1', serialNumber: 'GW99841', health: 'Warning', lastSeenAt: ago(4) },
  { id: 'd5', deviceId: 'LG-01', deviceName: 'LoRa Gateway', deviceType: 'LoRa Gateway', model: 'Kerlink iStation', serialNumber: 'LG55120', health: 'Good', lastSeenAt: ago(3) },
  { id: 'd6', deviceId: 'AP-01', deviceName: 'Wi-Fi Access Point', deviceType: 'Access Point', model: 'Aruba AP-535', serialNumber: 'AP11290', health: 'Good', lastSeenAt: ago(1) },
  { id: 'd7', deviceId: 'AP-02', deviceName: 'Wi-Fi Access Point', deviceType: 'Access Point', model: 'Aruba AP-535', serialNumber: 'AP11291', health: 'Good', lastSeenAt: ago(2) },
  { id: 'd8', deviceId: 'CAM-01', deviceName: 'IP Camera - Production', deviceType: 'CCTV Camera', model: 'Axis P3265', serialNumber: 'CM00451', health: 'Good', lastSeenAt: ago(1) },
  { id: 'd9', deviceId: 'CAM-02', deviceName: 'IP Camera - Server Room', deviceType: 'CCTV Camera', model: 'Axis P3265', serialNumber: 'CM00452', health: 'Good', lastSeenAt: ago(1) },
  { id: 'd10', deviceId: 'TS-01', deviceName: 'Temp & Humidity Sensor', deviceType: 'Temperature Sensor', model: 'Milesight EM300', serialNumber: 'TS77001', health: 'Good', lastSeenAt: ago(5) },
  { id: 'd11', deviceId: 'TS-02', deviceName: 'Cold Store Temp Sensor', deviceType: 'Temperature Sensor', model: 'Milesight EM300', serialNumber: 'TS77002', health: 'Good', lastSeenAt: ago(2) },
  { id: 'd12', deviceId: 'EM-01', deviceName: 'Energy Meter - LV Panel', deviceType: 'Energy Meter', model: 'Schneider PM5560', serialNumber: 'EM40022', health: 'Offline', lastSeenAt: ago(190) }
];

/* ===== Plots: positions of assets / devices on the plans ===== */

function plotRow(
  floorPlanId: string,
  kind: 'asset' | 'device',
  itemId: string,
  x: number,
  y: number,
  zoneId: string | null,
  orientation = 0,
  minutesAgo = 600
): PlotDto {
  const a = kind === 'asset' ? SEED_ASSETS.find((r) => r.assetRegistrationId === itemId) : undefined;
  const d = kind === 'device' ? SEED_DEVICES.find((r) => r.deviceId === itemId) : undefined;
  return {
    floorPlanId,
    kind,
    itemId,
    code: a?.assetTag ?? d?.deviceId ?? itemId,
    name: a?.assetName ?? d?.deviceName ?? itemId,
    type: a?.category ?? d?.deviceType ?? '',
    assetType: a?.assetType ?? null,
    model: a?.manufacturer ?? d?.model ?? null,
    serial: d?.serialNumber ?? null,
    status: a?.status ?? 'Active',
    x,
    y,
    orientation,
    zoneId,
    updatedAt: ago(minutesAgo)
  };
}

export const SEED_PLOTS: PlotDto[] = [
  // Building A - Ground Floor
  plotRow('FP-0001', 'device', 'GW-01', 54, 16, 'ZN-0003', 0, 1440),
  plotRow('FP-0001', 'device', 'GW-02', 82, 20, 'ZN-0004', 0, 1440),
  plotRow('FP-0001', 'device', 'AP-01', 21, 16, null, 0, 2880),
  plotRow('FP-0001', 'device', 'LG-01', 42, 78, 'ZN-0006', 0, 2880),
  plotRow('FP-0001', 'device', 'CAM-01', 41, 14, 'ZN-0003', 180, 2880),
  plotRow('FP-0001', 'device', 'TS-01', 13, 80, null),
  plotRow('FP-0001', 'device', 'EM-01', 93, 50, 'ZN-0005'),
  plotRow('FP-0001', 'asset', 'AR-000101', 30, 45, 'ZN-0003', 0, 300),
  plotRow('FP-0001', 'asset', 'AR-000110', 49, 47, 'ZN-0003', 0, 300),
  plotRow('FP-0001', 'asset', 'AR-000120', 75, 36, 'ZN-0004'),
  plotRow('FP-0001', 'asset', 'AR-000132', 78, 58, 'ZN-0005'),
  plotRow('FP-0001', 'asset', 'AR-000140', 36, 28, 'ZN-0003'),
  plotRow('FP-0001', 'asset', 'AR-000141', 58, 60, 'ZN-0003'),
  plotRow('FP-0001', 'asset', 'AR-000150', 70, 84, 'ZN-0007', 90, 20),
  // Building A - Floor 1
  plotRow('FP-0003', 'device', 'AP-02', 38, 26, 'ZN-0012'),
  plotRow('FP-0003', 'asset', 'AR-000111', 82, 70, null),
  // Building A - Floor 2
  plotRow('FP-0004', 'device', 'CAM-02', 18, 12, 'ZN-0021', 135),
  plotRow('FP-0004', 'asset', 'AR-000160', 12, 30, 'ZN-0021'),
  plotRow('FP-0004', 'asset', 'AR-000161', 24, 30, 'ZN-0021'),
  plotRow('FP-0004', 'asset', 'AR-000131', 44, 30, null),
  plotRow('FP-0004', 'asset', 'AR-000170', 18, 50, 'ZN-0021'),
  // Dubai HQ site map
  plotRow('FP-0006', 'asset', 'AR-000130', 72, 66, 'ZN-0042'),
  // Sharjah warehouse
  plotRow('FP-0007', 'device', 'GW-03', 35, 12, 'ZN-0051'),
  plotRow('FP-0007', 'device', 'GW-04', 66, 86, 'ZN-0054'),
  plotRow('FP-0007', 'device', 'TS-02', 84, 20, 'ZN-0052'),
  plotRow('FP-0007', 'asset', 'AR-000151', 48, 84, 'ZN-0054', 270, 15),
  plotRow('FP-0007', 'asset', 'AR-000152', 22, 40, 'ZN-0051', 0, 35),
  plotRow('FP-0007', 'asset', 'AR-000102', 80, 26, 'ZN-0052')
];

/* ===== Layer sets ===== */

export const SEED_LAYER_SETS: LayerSetDto[] = [
  {
    layerSetId: 'LS-0001', name: 'Operations View', createdBy: 'Sarah Ahmed', createdAt: '2026-06-10T09:00:00Z',
    layers: { zones: true, geofences: false, assets: true, devices: true, annotations: false, rooms: true, heatmap: false }
  },
  {
    layerSetId: 'LS-0002', name: 'Maintenance View', createdBy: 'James Tan', createdAt: '2026-06-12T09:00:00Z',
    layers: { zones: true, geofences: false, assets: true, devices: false, annotations: true, rooms: false, heatmap: false }
  },
  {
    layerSetId: 'LS-0003', name: 'Security View', createdBy: 'Omar Hassan', createdAt: '2026-07-02T09:00:00Z',
    layers: { zones: false, geofences: true, assets: false, devices: true, annotations: false, rooms: false, heatmap: false }
  },
  {
    layerSetId: 'LS-0004', name: 'Space Utilization', createdBy: 'Priya Sharma', createdAt: '2026-08-21T09:00:00Z',
    layers: { zones: true, geofences: false, assets: false, devices: false, annotations: false, rooms: true, heatmap: true }
  }
];

/* ===== Live telemetry: which gateway hears which asset tag ===== */

/** Asset tags and the gateway that hears them (Tag Management + NetworkTimeSeries in the real system). */
export const SEED_TAG_LINKS: { assetTag: string; assetName: string; gatewayId: string; tagIds: string[]; battery: number; rssi: number }[] = [
  { assetTag: 'CH-001', assetName: 'Chiller-01', gatewayId: 'GW-01', tagIds: ['BLE-AC2301', 'BLE-AC2302'], battery: 86, rssi: -58 },
  { assetTag: 'AHU-01', assetName: 'AHU-01', gatewayId: 'GW-01', tagIds: ['BLE-AC2310'], battery: 64, rssi: -66 },
  { assetTag: 'CNC-01', assetName: 'CNC Machine Haas VF-2', gatewayId: 'GW-01', tagIds: ['BLE-AC2340'], battery: 92, rssi: -61 },
  { assetTag: 'CMP-01', assetName: 'Air Compressor', gatewayId: 'GW-01', tagIds: ['BLE-AC2341'], battery: 31, rssi: -74 },
  { assetTag: 'PMP-01', assetName: 'Pump-01', gatewayId: 'GW-02', tagIds: ['BLE-AC2320'], battery: 77, rssi: -63 },
  { assetTag: 'PNL-01', assetName: 'Main LV Panel', gatewayId: 'GW-02', tagIds: ['BLE-AC2332'], battery: 55, rssi: -79 },
  { assetTag: 'FLT-01', assetName: 'Forklift Toyota 8FBE', gatewayId: 'LG-01', tagIds: ['LORA-7781'], battery: 18, rssi: -84 },
  { assetTag: 'RT-01', assetName: 'Reach Truck', gatewayId: 'GW-03', tagIds: ['BLE-WH1152'], battery: 71, rssi: -68 },
  { assetTag: 'CH-002', assetName: 'Chiller-02', gatewayId: 'GW-03', tagIds: ['BLE-WH1102'], battery: 90, rssi: -71 },
  { assetTag: 'FLT-02', assetName: 'Forklift Toyota 8FBE', gatewayId: 'GW-04', tagIds: ['BLE-WH1151', 'BLE-WH1199'], battery: 45, rssi: -62 }
];

/** Tags heard by a gateway that are not linked to an asset yet. */
export const SEED_UNLINKED_TAGS: Record<string, string[]> = { 'GW-01': ['BLE-FF0912'], 'GW-04': ['BLE-FF1033', 'BLE-FF1034'] };
