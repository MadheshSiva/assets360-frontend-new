import { BfzAddress, BfzRecord, BfzSite } from '../../../organization/building-floor-zone/bfz.model';

/*
 * DEMO MODE: hard-coded buildings, floors and zones until the API is wired up. Site ids and names
 * match the Site master (S01-S05).
 * Dubai Factory (DXB-B01) matches the approved design; the other buildings are generated so the
 * totals match it too (28 buildings, 86 floors, 210 zones).
 */

export const BFZ_SITES: BfzSite[] = [
  { id: 'S01', name: 'Dubai Factory', prefix: 'DXB', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', lat: 24.98605, lng: 55.07445 },
  { id: 'S02', name: 'Abu Dhabi Office', prefix: 'AUH', city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.33912, lng: 54.52731 },
  { id: 'S03', name: 'Sharjah Warehouse', prefix: 'SHJ', city: 'Sharjah', state: 'Sharjah', country: 'United Arab Emirates', lat: 25.32718, lng: 55.39134 },
  { id: 'S04', name: 'Riyadh Plant', prefix: 'RUH', city: 'Riyadh', state: 'Riyadh', country: 'Saudi Arabia', lat: 24.60942, lng: 46.84215 },
  { id: 'S05', name: 'Doha Office', prefix: 'DOH', city: 'Doha', state: 'Doha', country: 'Qatar', lat: 25.31863, lng: 51.52817 }
];

export const COUNTRIES = ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Oman', 'Kuwait', 'Bahrain', 'India'];
export const COUNTRY_FLAGS: Partial<Record<string, string>> = {
  'United Arab Emirates': '🇦🇪',
  'Saudi Arabia': '🇸🇦',
  Qatar: '🇶🇦',
  Oman: '🇴🇲',
  Kuwait: '🇰🇼',
  Bahrain: '🇧🇭',
  India: '🇮🇳'
};

export const FLOOR_NAMES: { short: string; name: string; level: number }[] = [
  { short: 'B1', name: 'Basement', level: -1 },
  { short: 'GF', name: 'Ground Floor', level: 0 },
  { short: 'FF', name: 'First Floor', level: 1 },
  { short: 'SF', name: 'Second Floor', level: 2 },
  { short: 'TF', name: 'Third Floor', level: 3 },
  { short: '4F', name: 'Fourth Floor', level: 4 },
  { short: '5F', name: 'Fifth Floor', level: 5 },
  { short: '6F', name: 'Sixth Floor', level: 6 }
];

export const ZONE_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7'];

const NO_ADDRESS: BfzAddress = { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' };

function base(): Omit<BfzRecord, 'code' | 'name' | 'type' | 'siteId'> {
  return {
    buildingCode: null,
    floorCode: null,
    description: '',
    capacity: null,
    area: null,
    status: 'Active',
    image: null,
    images: [],
    category: '',
    levelNumber: null,
    color: ZONE_COLORS[0],
    address: { ...NO_ADDRESS },
    lat: null,
    lng: null,
    allowAssetAssignment: true,
    enableTracking: true,
    restrictedAccess: false,
    showOnMap: true,
    assets: 0,
    people: 0,
    departments: 0,
    createdOn: '2024-01-01T10:30',
    updatedOn: '2026-10-12T16:15'
  };
}

function dubaiFactory(): BfzRecord[] {
  const b = 'DXB-B01';
  const building: BfzRecord = {
    ...base(),
    code: b,
    name: 'Dubai Factory',
    type: 'Building',
    siteId: 'S01',
    description: 'Main manufacturing building with production, assembly and packaging lines.',
    area: 45000,
    capacity: 2500,
    category: 'Factory',
    address: { line1: 'Jebel Ali Industrial Area', line2: 'Plot No. S201, Street 7', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', postalCode: '00000' },
    lat: 24.98605,
    lng: 55.07445,
    assets: 1245,
    people: 320,
    departments: 6
  };
  const floor = (short: string, capacity: number, area: number): BfzRecord => {
    const f = FLOOR_NAMES.find((x) => x.short === short)!;
    return { ...base(), code: `${b}-${short}`, name: f.name, type: 'Floor', siteId: 'S01', buildingCode: b, levelNumber: f.level, capacity, area };
  };
  const zone = (floorShort: string, code: string, name: string, category: string, capacity: number, area: number, color: string): BfzRecord => ({
    ...base(),
    code,
    name,
    type: 'Zone',
    siteId: 'S01',
    buildingCode: b,
    floorCode: `${b}-${floorShort}`,
    category,
    capacity,
    area,
    color
  });
  return [
    building,
    floor('GF', 500, 8500),
    zone('GF', 'DZ-GF-PRD', 'Production Zone', 'Production', 200, 3200, '#22c55e'),
    zone('GF', 'DZ-GF-MNT', 'Maintenance Zone', 'Maintenance', 50, 1200, '#f59e0b'),
    zone('GF', 'DZ-GF-UTL', 'Utilities Zone', 'Utility', 30, 800, '#3b82f6'),
    floor('FF', 400, 8000),
    zone('FF', 'DZ-FF-ASM', 'Assembly Zone', 'Production', 180, 3000, '#22c55e'),
    zone('FF', 'DZ-FF-PKG', 'Packaging Zone', 'Production', 120, 2000, '#f59e0b'),
    floor('SF', 350, 7500),
    zone('SF', 'DZ-SF-QC', 'Quality Control Zone', 'Production', 60, 1500, '#22c55e'),
    zone('SF', 'DZ-SF-STR', 'Stores Zone', 'Storage', 20, 2200, '#f59e0b'),
    zone('SF', 'DZ-SF-LAB', 'Test Lab Zone', 'Restricted', 25, 900, '#ec4899'),
    zone('SF', 'DZ-SF-OFF', 'Engineering Office', 'Office', 80, 1400, '#3b82f6'),
    floor('TF', 300, 7000),
    zone('TF', 'DZ-TF-OFF', 'Admin Office Zone', 'Office', 150, 3000, '#3b82f6'),
    zone('TF', 'DZ-TF-MTG', 'Meeting Zone', 'Common Area', 60, 900, '#a855f7'),
    zone('TF', 'DZ-TF-SRV', 'Server Zone', 'Restricted', 10, 300, '#ec4899'),
    floor('4F', 250, 7000),
    zone('4F', 'DZ-4F-TRN', 'Training Zone', 'Common Area', 120, 1800, '#a855f7'),
    zone('4F', 'DZ-4F-CAF', 'Cafeteria Zone', 'Common Area', 200, 2000, '#14b8a6'),
    zone('4F', 'DZ-4F-HR', 'HR Office Zone', 'Office', 40, 900, '#3b82f6'),
    floor('5F', 200, 7000),
    zone('5F', 'DZ-5F-EXE', 'Executive Zone', 'Office', 30, 1500, '#3b82f6'),
    zone('5F', 'DZ-5F-BRD', 'Boardroom Zone', 'Common Area', 25, 600, '#a855f7'),
    zone('5F', 'DZ-5F-ROOF', 'Roof Plant Zone', 'Utility', 5, 1200, '#f59e0b')
  ];
}

const BUILDING_NAMES = [
  'Logistics Hub', 'Admin Block', 'Warehouse A', 'Cold Store', 'Office Tower', 'Workshop', 'R&D Center',
  'Training Center', 'Warehouse B', 'Service Center', 'Utility Block', 'Parking Structure', 'Data Center',
  'Showroom', 'Assembly Plant', 'Spare Parts Store', 'Security Building'
];
const ZONE_NAMES: [string, string][] = [
  ['Storage Zone', 'Storage'],
  ['Office Zone', 'Office'],
  ['Utility Zone', 'Utility'],
  ['Production Zone', 'Production'],
  ['Common Zone', 'Common Area'],
  ['Restricted Zone', 'Restricted'],
  ['Maintenance Zone', 'Maintenance']
];

// 27 more buildings: 80 floors and 192 zones between them
function generated(): BfzRecord[] {
  const records: BfzRecord[] = [];
  const perSite = new Map<string, number>([['S01', 1]]);
  let zoneSlot = 0;
  for (let i = 0; i < 27; i++) {
    const site = BFZ_SITES[(i + 1) % BFZ_SITES.length];
    const n = (perSite.get(site.id) ?? 0) + 1;
    perSite.set(site.id, n);
    const code = `${site.prefix}-B${String(n).padStart(2, '0')}`;
    const name = BUILDING_NAMES[i % BUILDING_NAMES.length] + (i >= BUILDING_NAMES.length ? ' 2' : '');
    const floorCount = i === 4 ? 2 : 3;
    const created = new Date(Date.UTC(2024, 1, 1) + i * 9 * 86400000).toISOString().slice(0, 16);
    records.push({
      ...base(),
      code,
      name,
      type: 'Building',
      siteId: site.id,
      description: '',
      area: 6000 + ((i * 3779) % 30000),
      capacity: 200 + ((i * 97) % 1500),
      category: ['Warehouse', 'Office', 'Factory', 'Data Center', 'Mixed Use'][i % 5],
      address: { line1: `Plot ${100 + i}`, line2: `${site.city} Industrial Area`, city: site.city, state: site.state, country: site.country, postalCode: '00000' },
      lat: (site.lat ?? 0) + ((i % 5) - 2) * 0.0024,
      lng: (site.lng ?? 0) + (Math.floor(i / 5) - 2) * 0.0026,
      status: i === 11 ? 'Inactive' : 'Active',
      assets: 80 + ((i * 131) % 900),
      people: 10 + ((i * 37) % 250),
      departments: 1 + (i % 5),
      createdOn: created,
      updatedOn: created
    });
    for (let f = 0; f < floorCount; f++) {
      const meta = FLOOR_NAMES[f + 1];
      const floorCode = `${code}-${meta.short}`;
      records.push({ ...base(), code: floorCode, name: meta.name, type: 'Floor', siteId: site.id, buildingCode: code, levelNumber: meta.level, capacity: 60 + ((i + f) * 23) % 300, area: 1500 + ((i + f) * 811) % 6000, createdOn: created, updatedOn: created });
      // 32 of the 80 floors get a third zone
      const zoneCount = zoneSlot % 5 < 2 ? 3 : 2;
      for (let z = 0; z < zoneCount; z++) {
        const [zoneName, category] = ZONE_NAMES[(zoneSlot + z) % ZONE_NAMES.length];
        records.push({
          ...base(),
          code: `${floorCode}-Z${z + 1}`,
          name: zoneName,
          type: 'Zone',
          siteId: site.id,
          buildingCode: code,
          floorCode,
          category,
          capacity: 10 + ((zoneSlot + z) * 17) % 120,
          area: 300 + ((zoneSlot + z) * 233) % 2000,
          color: ZONE_COLORS[z % ZONE_COLORS.length],
          restrictedAccess: category === 'Restricted',
          createdOn: created,
          updatedOn: created
        });
      }
      zoneSlot++;
    }
  }
  return records;
}

export function initialBfz(): BfzRecord[] {
  return [...dubaiFactory(), ...generated()];
}

export function blankBfz(): BfzRecord {
  const now = new Date().toISOString().slice(0, 16);
  return { ...base(), code: '', name: '', type: 'Building', siteId: '', createdOn: now, updatedOn: now };
}
