import { buildingBounds, center, locationBounds, zoneCells } from '../../../organization/location/location.geometry';
import { Building, Floor, LocationRecord, LocationType, Site, Zone } from '../../../organization/location/location.model';

/*
 * DEMO MODE: hard-coded hierarchy and locations until the master data API is wired up.
 * The first ten locations match the approved design; the rest are generated so the list,
 * KPIs and paging behave like a real site (1,248 locations, 66 inactive, 356 outdoor).
 */

export const SITES: Site[] = [
  { id: 'S01', name: 'Dubai Factory', lat: 24.98605, lng: 55.17445 },
  { id: 'S02', name: 'Abu Dhabi Warehouse', lat: 24.33912, lng: 54.52731 },
  { id: 'S03', name: 'Sharjah Office', lat: 25.32718, lng: 55.39134 }
];

export const FLOORS: Floor[] = [
  { code: 'B1', name: 'Basement' },
  { code: 'GF', name: 'Ground Floor' },
  { code: '1F', name: 'First Floor' },
  { code: '2F', name: 'Second Floor' },
  { code: '3F', name: 'Third Floor' }
];

export const BUILDINGS: Building[] = [
  { code: 'B01', name: 'Main Building', siteId: 'S01', floorCodes: ['GF', '1F', '2F'], lat: 24.98605, lng: 55.17445 },
  { code: 'B02', name: 'IT Block', siteId: 'S01', floorCodes: ['GF', '1F'], lat: 24.98815, lng: 55.17445 },
  { code: 'B03', name: 'Warehouse', siteId: 'S01', floorCodes: ['GF'], lat: 24.98605, lng: 55.17705 },
  { code: 'B04', name: 'Parking Structure', siteId: 'S01', floorCodes: ['B1', 'GF'], lat: 24.98395, lng: 55.17445 },
  { code: 'B05', name: 'Utility Block', siteId: 'S01', floorCodes: ['GF'], lat: 24.98395, lng: 55.17705 },
  { code: 'B06', name: 'Central Warehouse', siteId: 'S02', floorCodes: ['GF', '1F'], lat: 24.33912, lng: 54.52731 },
  { code: 'B07', name: 'Cold Store', siteId: 'S02', floorCodes: ['GF'], lat: 24.34122, lng: 54.52731 },
  { code: 'B08', name: 'Office Tower', siteId: 'S03', floorCodes: ['GF', '1F', '2F', '3F'], lat: 25.32718, lng: 55.39134 }
];

export const ZONES: Zone[] = [
  { code: 'Z-PROD', name: 'Production Zone', buildingCode: 'B01', floorCode: 'GF', outdoor: false },
  { code: 'Z-ASSEMBLY', name: 'Assembly Zone', buildingCode: 'B01', floorCode: 'GF', outdoor: false },
  { code: 'Z-UTILITY', name: 'Utilities Zone', buildingCode: 'B01', floorCode: 'GF', outdoor: false },
  { code: 'Z-QC', name: 'Quality Zone', buildingCode: 'B01', floorCode: 'GF', outdoor: false },
  { code: 'Z-FACILITY', name: 'Facilities Zone', buildingCode: 'B01', floorCode: '1F', outdoor: false },
  { code: 'Z-STORES', name: 'Stores Zone', buildingCode: 'B01', floorCode: '1F', outdoor: false },
  { code: 'Z-OFFICE', name: 'Office Zone', buildingCode: 'B01', floorCode: '2F', outdoor: false },
  { code: 'Z-IT', name: 'IT Zone', buildingCode: 'B02', floorCode: '1F', outdoor: false },
  { code: 'Z-NOC', name: 'Network Ops Zone', buildingCode: 'B02', floorCode: 'GF', outdoor: false },
  { code: 'Z-WAREHOUSE', name: 'Warehouse Zone', buildingCode: 'B03', floorCode: 'GF', outdoor: false },
  { code: 'Z-LOGISTICS', name: 'Logistics Zone', buildingCode: 'B03', floorCode: 'GF', outdoor: true },
  { code: 'Z-PARKING', name: 'Parking Zone', buildingCode: 'B04', floorCode: 'GF', outdoor: true },
  { code: 'Z-PARKING-B1', name: 'Basement Parking', buildingCode: 'B04', floorCode: 'B1', outdoor: false },
  { code: 'Z-UTILITY', name: 'Utilities Zone', buildingCode: 'B05', floorCode: 'GF', outdoor: true },
  { code: 'Z-STORAGE', name: 'Storage Zone', buildingCode: 'B06', floorCode: 'GF', outdoor: false },
  { code: 'Z-YARD', name: 'Container Yard', buildingCode: 'B06', floorCode: 'GF', outdoor: true },
  { code: 'Z-MEZZ', name: 'Mezzanine Zone', buildingCode: 'B06', floorCode: '1F', outdoor: false },
  { code: 'Z-COLD', name: 'Cold Room Zone', buildingCode: 'B07', floorCode: 'GF', outdoor: false },
  { code: 'Z-LOBBY', name: 'Lobby Zone', buildingCode: 'B08', floorCode: 'GF', outdoor: false },
  { code: 'Z-WORK-1', name: 'Workspace Zone 1F', buildingCode: 'B08', floorCode: '1F', outdoor: false },
  { code: 'Z-WORK-2', name: 'Workspace Zone 2F', buildingCode: 'B08', floorCode: '2F', outdoor: false },
  { code: 'Z-EXEC', name: 'Executive Zone', buildingCode: 'B08', floorCode: '3F', outdoor: false }
];

export function findBuilding(code: string): Building | undefined {
  return BUILDINGS.find((b) => b.code === code);
}

export function findZone(buildingCode: string, floorCode: string, zoneCode: string): Zone | undefined {
  return ZONES.find((z) => z.buildingCode === buildingCode && z.floorCode === floorCode && z.code === zoneCode);
}

export function zonesOnFloor(buildingCode: string, floorCode: string): Zone[] {
  return ZONES.filter((z) => z.buildingCode === buildingCode && z.floorCode === floorCode);
}

/** Map position for a location: inside its zone's cell, or the building centre when it has no zone. */
export function positionFor(code: string, buildingCode: string, floorCode: string, zoneCode: string): { lat: number; lng: number } {
  const building = findBuilding(buildingCode);
  if (!building) return { lat: SITES[0].lat, lng: SITES[0].lng };
  const cell = zoneCells(building, zonesOnFloor(buildingCode, floorCode)).get(zoneCode);
  return center(cell ? locationBounds(cell, code) : buildingBounds(building));
}

type Seed = [
  code: string,
  name: string,
  type: LocationType,
  building: string,
  floor: string,
  zone: string,
  parent: string | null,
  status: 'Active' | 'Inactive',
  outdoor: boolean,
  area: number | null,
  description: string,
  createdOn: string,
  updatedOn: string
];

const SEEDS: Seed[] = [
  ['LOC-001', 'Production Line 1', 'Area', 'B01', 'GF', 'Z-PROD', null, 'Active', false, 5000, 'Main production line area with CNC machines', '2024-01-12T10:30', '2026-10-15T14:45'],
  ['LOC-002', 'Assembly Room A', 'Room', 'B01', 'GF', 'Z-ASSEMBLY', 'LOC-001', 'Active', false, 420, 'Final assembly of control panels', '2024-01-12T11:05', '2026-09-28T09:10'],
  ['LOC-003', 'Rack A1', 'Rack', 'B01', 'GF', 'Z-ASSEMBLY', 'LOC-002', 'Active', false, 4, 'Tool and fixture rack', '2024-01-15T09:20', '2026-08-02T16:40'],
  ['LOC-004', 'Server Room', 'Room', 'B02', '1F', 'Z-IT', null, 'Active', false, 85, 'Primary server and network room', '2024-02-03T08:45', '2026-10-01T12:00'],
  ['LOC-005', 'Warehouse Bin 01', 'Bin', 'B03', 'GF', 'Z-WAREHOUSE', null, 'Active', false, 2, 'Fast-moving spares bin', '2024-02-10T14:00', '2026-07-19T10:25'],
  ['LOC-006', 'Parking - P1-01', 'Parking Bay', 'B04', 'GF', 'Z-PARKING', null, 'Active', true, 15, 'Reserved bay for service vehicles', '2024-02-18T07:30', '2026-05-06T08:15'],
  ['LOC-007', 'Generator Yard', 'Area', 'B05', 'GF', 'Z-UTILITY', null, 'Inactive', true, 640, 'Standby diesel generator yard (decommissioned)', '2024-03-01T13:10', '2026-06-22T17:50'],
  ['LOC-008', 'Conference Room', 'Room', 'B01', '2F', 'Z-OFFICE', null, 'Active', false, 60, '12-seat conference room with VC', '2024-03-04T10:00', '2026-10-09T11:35'],
  ['LOC-009', 'Restroom - 1F-M', 'Room', 'B01', '1F', 'Z-FACILITY', null, 'Active', false, 24, "Men's restroom, first floor", '2024-03-04T10:20', '2026-04-11T09:00'],
  ['LOC-010', 'Loading Dock 1', 'Area', 'B03', 'GF', 'Z-LOGISTICS', null, 'Active', true, 300, 'Inbound loading dock with leveller', '2024-03-12T06:55', '2026-10-20T15:05'],
  ['LOC-001-01', 'CNC Machine 1', 'Equipment', 'B01', 'GF', 'Z-PROD', 'LOC-001', 'Active', false, 18, 'Haas VF-2 vertical machining centre', '2024-01-20T09:00', '2026-10-12T10:10'],
  ['LOC-001-02', 'CNC Machine 2', 'Equipment', 'B01', 'GF', 'Z-PROD', 'LOC-001', 'Active', false, 18, 'Haas VF-2 vertical machining centre', '2024-01-20T09:15', '2026-10-12T10:12'],
  ['LOC-001-03', 'Inspection Area', 'Area', 'B01', 'GF', 'Z-PROD', 'LOC-001', 'Active', false, 120, 'First-article inspection bench', '2024-01-22T11:40', '2026-09-30T13:30']
];

function fromSeed(s: Seed): LocationRecord {
  const [code, name, type, buildingCode, floorCode, zoneCode, parentCode, status, outdoor, area, description, createdOn, updatedOn] = s;
  const building = findBuilding(buildingCode)!;
  return {
    code,
    name,
    type,
    environment: outdoor ? 'Outdoor' : 'Indoor',
    siteId: building.siteId,
    buildingCode,
    floorCode,
    zoneCode,
    parentCode,
    area,
    capacity: null,
    description,
    status,
    image: null,
    ...positionFor(code, buildingCode, floorCode, zoneCode),
    restrictedAccess: type === 'Room' && /server/i.test(name),
    temperatureControlled: /server/i.test(name),
    allowAssetAssignment: true,
    enableTracking: true,
    geofenceAlerts: false,
    createdOn,
    updatedOn
  };
}

// Generated locations: one in every 7 is outdoor (two slots) and 65 are inactive, giving the
// design's totals together with the seeds above.
const GENERATED_COUNT = 1235;
const INDOOR_TYPES: LocationType[] = ['Room', 'Rack', 'Bin', 'Workstation', 'Area', 'Equipment'];
const OUTDOOR_TYPES: LocationType[] = ['Parking Bay', 'Yard', 'Dock'];

function generatedName(type: LocationType, n: number, floorCode: string): string {
  const pad = String(n).padStart(2, '0');
  switch (type) {
    case 'Room': return `${['Meeting Room', 'Office', 'Store Room', 'Training Room', 'Pantry'][n % 5]} ${floorCode}-${pad}`;
    case 'Rack': return `Rack ${String.fromCharCode(65 + (n % 8))}${(n % 24) + 1}`;
    case 'Bin': return `Bin W-${String(n).padStart(4, '0')}`;
    case 'Workstation': return `Workstation WS-${String(n).padStart(3, '0')}`;
    case 'Area': return `${['Packing Area', 'Staging Area', 'Kitting Area', 'Test Bay'][n % 4]} ${(n % 12) + 1}`;
    case 'Equipment': return `${['Compressor', 'Press', 'Conveyor', 'Lathe', 'Chiller'][n % 5]} ${String(n).padStart(3, '0')}`;
    case 'Parking Bay': return `Parking - P${(n % 3) + 1}-${pad}`;
    case 'Yard': return `${['Storage Yard', 'Scrap Yard', 'Container Yard'][n % 3]} ${(n % 6) + 1}`;
    default: return `Loading Dock ${(n % 14) + 2}`;
  }
}

function generate(): LocationRecord[] {
  const indoorZones = ZONES.filter((z) => !z.outdoor);
  const outdoorZones = ZONES.filter((z) => z.outdoor);
  const start = Date.UTC(2024, 3, 1);
  const records: LocationRecord[] = [];
  let inactive = 0;
  for (let i = 0; i < GENERATED_COUNT; i++) {
    const outdoor = i % 7 === 2 || i % 7 === 5;
    const isInactive = i % 19 === 7 && inactive < 65;
    if (isInactive) inactive++;
    const type = outdoor ? OUTDOOR_TYPES[i % OUTDOOR_TYPES.length] : INDOOR_TYPES[i % INDOOR_TYPES.length];
    const zone = outdoor ? outdoorZones[i % outdoorZones.length] : indoorZones[(i * 7) % indoorZones.length];
    const building = findBuilding(zone.buildingCode)!;
    const code = `LOC-${String(i + 11).padStart(3, '0')}`;
    const created = new Date(start + i * 13 * 3600 * 1000);
    const updated = new Date(created.getTime() + ((i * 37) % 400) * 24 * 3600 * 1000);
    const area = type === 'Bin' || type === 'Rack' ? 2 + (i % 4) : 20 + ((i * 53) % 900);
    records.push({
      code,
      name: generatedName(type, i + 1, zone.floorCode),
      type,
      environment: outdoor ? 'Outdoor' : 'Indoor',
      siteId: building.siteId,
      buildingCode: building.code,
      floorCode: zone.floorCode,
      zoneCode: zone.code,
      parentCode: null,
      area,
      capacity: type === 'Room' ? 4 + (i % 20) : null,
      description: '',
      status: isInactive ? 'Inactive' : 'Active',
      image: null,
      ...positionFor(code, building.code, zone.floorCode, zone.code),
      restrictedAccess: zone.code === 'Z-IT' || zone.code === 'Z-NOC',
      temperatureControlled: zone.code === 'Z-COLD',
      allowAssetAssignment: true,
      enableTracking: i % 3 !== 0,
      geofenceAlerts: i % 5 === 0,
      createdOn: created.toISOString().slice(0, 16),
      updatedOn: (updated > new Date(Date.UTC(2026, 9, 26)) ? new Date(Date.UTC(2026, 9, 26)) : updated).toISOString().slice(0, 16)
    });
  }
  return records;
}

export function initialLocations(): LocationRecord[] {
  const seeds = SEEDS.map(fromSeed);
  // Sub-codes (LOC-001-01) go after the main list so the first page matches the design
  const isSubCode = (r: LocationRecord) => /^LOC-\d+-\d+$/.test(r.code);
  return [...seeds.filter((r) => !isSubCode(r)), ...generate(), ...seeds.filter(isSubCode)];
}
