/**
 * Static demo master data shared by every Tracking & IoT page: sites, buildings, floors and the registered assets
 * that devices, tags, sensors, alerts and location events refer to. Ids cross-reference across all demo data files.
 */

export interface DemoSite { id: string; name: string; code: string; country: string; city: string; lat: number; lng: number }
export interface DemoBuilding { id: string; name: string; siteId: string; lat: number; lng: number }
export interface DemoFloor { id: string; name: string; buildingId: string; area: number }
export interface DemoAsset {
  /** Asset service record id. */
  id: string;
  /** Asset registration id, e.g. REG-000101. */
  regId: string;
  /** Asset tag / code printed on the asset, e.g. FLT-0107. */
  tag: string;
  name: string;
  category: string;
  type: string;
  status: string;
  siteId: string;
  buildingId: string;
  floorId: string;
  zone: string;
}

export const DEMO_SITES: DemoSite[] = [
  { id: 'SITE-CHN-01', name: 'Chennai Manufacturing Plant', code: 'CHN-MFG', country: 'India', city: 'Sriperumbudur', lat: 12.96921, lng: 79.94503 },
  { id: 'SITE-BLR-01', name: 'Bengaluru Distribution Center', code: 'BLR-DC', country: 'India', city: 'Peenya', lat: 13.02872, lng: 77.51904 },
  { id: 'SITE-PUN-01', name: 'Pune Assembly Unit', code: 'PUN-ASM', country: 'India', city: 'Chakan', lat: 18.75702, lng: 73.86301 },
  { id: 'SITE-HYD-01', name: 'Hyderabad Cold Chain Hub', code: 'HYD-CCH', country: 'India', city: 'Medchal', lat: 17.62904, lng: 78.48098 },
  { id: 'SITE-DXB-01', name: 'Jebel Ali Logistics Hub', code: 'DXB-JAF', country: 'United Arab Emirates', city: 'Dubai', lat: 25.01041, lng: 55.09102 },
];

export const DEMO_BUILDINGS: DemoBuilding[] = [
  { id: 'BLD-CHN-A', name: 'Production Block A', siteId: 'SITE-CHN-01', lat: 12.96968, lng: 79.94431 },
  { id: 'BLD-CHN-B', name: 'Warehouse & Dispatch', siteId: 'SITE-CHN-01', lat: 12.96862, lng: 79.94589 },
  { id: 'BLD-CHN-U', name: 'Utility Block', siteId: 'SITE-CHN-01', lat: 12.97012, lng: 79.94578 },
  { id: 'BLD-BLR-1', name: 'Main Warehouse', siteId: 'SITE-BLR-01', lat: 13.02901, lng: 77.51862 },
  { id: 'BLD-BLR-2', name: 'Cross-Dock Shed', siteId: 'SITE-BLR-01', lat: 13.02829, lng: 77.51968 },
  { id: 'BLD-PUN-1', name: 'Assembly Hall', siteId: 'SITE-PUN-01', lat: 18.75731, lng: 73.86262 },
  { id: 'BLD-PUN-2', name: 'Paint Shop', siteId: 'SITE-PUN-01', lat: 18.75662, lng: 73.86358 },
  { id: 'BLD-HYD-1', name: 'Cold Storage Building', siteId: 'SITE-HYD-01', lat: 17.62931, lng: 78.48062 },
  { id: 'BLD-DXB-1', name: 'Logistics Warehouse', siteId: 'SITE-DXB-01', lat: 25.01072, lng: 55.09053 },
];

export const DEMO_FLOORS: DemoFloor[] = [
  { id: 'FLR-CHN-A-G', name: 'Ground Floor', buildingId: 'BLD-CHN-A', area: 4800 },
  { id: 'FLR-CHN-B-G', name: 'Ground Floor', buildingId: 'BLD-CHN-B', area: 6200 },
  { id: 'FLR-CHN-U-G', name: 'Ground Floor', buildingId: 'BLD-CHN-U', area: 1500 },
  { id: 'FLR-BLR-1-G', name: 'Ground Floor', buildingId: 'BLD-BLR-1', area: 9000 },
  { id: 'FLR-BLR-2-G', name: 'Ground Floor', buildingId: 'BLD-BLR-2', area: 3600 },
  { id: 'FLR-PUN-1-G', name: 'Ground Floor', buildingId: 'BLD-PUN-1', area: 7200 },
  { id: 'FLR-PUN-2-G', name: 'Ground Floor', buildingId: 'BLD-PUN-2', area: 2400 },
  { id: 'FLR-HYD-1-G', name: 'Ground Floor', buildingId: 'BLD-HYD-1', area: 5000 },
  { id: 'FLR-DXB-1-G', name: 'Ground Floor', buildingId: 'BLD-DXB-1', area: 8000 },
];

function asset(n: number, regId: string, tag: string, name: string, category: string, type: string, floorId: string, zone: string, status = 'In Use'): DemoAsset {
  const floor = DEMO_FLOORS.find((f) => f.id === floorId)!;
  const building = DEMO_BUILDINGS.find((b) => b.id === floor.buildingId)!;
  return { id: `66f1a0c4e2b9d1${String(n).padStart(10, '0')}`, regId, tag, name, category, type, status, siteId: building.siteId, buildingId: building.id, floorId, zone };
}

export const DEMO_ASSETS: DemoAsset[] = [
  asset(101, 'REG-000101', 'FLT-0107', 'Forklift FL-07 (Toyota 8FBE20)', 'Material Handling', 'Forklift', 'FLR-CHN-B-G', 'Loading Dock A'),
  asset(102, 'REG-000102', 'FLT-0112', 'Forklift FL-12 (Godrej GX 300E)', 'Material Handling', 'Forklift', 'FLR-CHN-B-G', 'Racking Aisles'),
  asset(103, 'REG-000103', 'CMP-0203', 'Air Compressor AC-03 (Atlas Copco GA37)', 'Utilities', 'Compressor', 'FLR-CHN-U-G', 'Compressor Room'),
  asset(104, 'REG-000104', 'PMP-0314', 'Cooling Water Pump P-14 (Grundfos CR 32)', 'Utilities', 'Pump', 'FLR-CHN-U-G', 'Pump House'),
  asset(105, 'REG-000105', 'GEN-0401', 'Diesel Generator DG-01 (Cummins C500D5)', 'Power', 'Generator', 'FLR-CHN-U-G', 'DG Yard'),
  asset(106, 'REG-000106', 'CNC-0502', 'CNC Machining Center VMC-02 (Haas VF-4)', 'Production Equipment', 'CNC Machine', 'FLR-CHN-A-G', 'Machining Cell'),
  asset(107, 'REG-000107', 'IMM-0505', 'Injection Moulding Machine IMM-05 (Engel victory 200)', 'Production Equipment', 'Moulding Machine', 'FLR-CHN-A-G', 'Moulding Line'),
  asset(108, 'REG-000108', 'CHL-0601', 'Process Chiller CH-01 (Blue Star BCH-60)', 'Utilities', 'Chiller', 'FLR-CHN-U-G', 'Chiller Plant'),
  asset(201, 'REG-000201', 'FLT-0121', 'Reach Truck RT-21 (Crown RR 5700)', 'Material Handling', 'Forklift', 'FLR-BLR-1-G', 'High-Bay Racking'),
  asset(202, 'REG-000202', 'PJK-0133', 'Electric Pallet Jack PJ-33 (Jungheinrich EJE 116)', 'Material Handling', 'Pallet Jack', 'FLR-BLR-1-G', 'Inbound Staging'),
  asset(203, 'REG-000203', 'TRK-0702', 'Delivery Truck KA-01-AB-4521 (Tata Ultra T.7)', 'Fleet', 'Vehicle', 'FLR-BLR-2-G', 'Truck Bays'),
  asset(204, 'REG-000204', 'TRK-0705', 'Delivery Truck KA-01-AC-1187 (Ashok Leyland Partner)', 'Fleet', 'Vehicle', 'FLR-BLR-2-G', 'Truck Bays'),
  asset(205, 'REG-000205', 'CNV-0801', 'Sortation Conveyor CV-01 (Interroll)', 'Material Handling', 'Conveyor', 'FLR-BLR-2-G', 'Sortation Line'),
  asset(206, 'REG-000206', 'BCS-0902', 'Battery Charging Station BC-02', 'Utilities', 'Charging Station', 'FLR-BLR-1-G', 'Charging Bay'),
  asset(301, 'REG-000301', 'ROB-1001', 'Welding Robot WR-01 (FANUC ARC Mate 120)', 'Production Equipment', 'Robot', 'FLR-PUN-1-G', 'Welding Cell'),
  asset(302, 'REG-000302', 'CMP-0207', 'Air Compressor AC-07 (Ingersoll Rand R55)', 'Utilities', 'Compressor', 'FLR-PUN-1-G', 'Utility Corner'),
  asset(303, 'REG-000303', 'OVN-1101', 'Paint Curing Oven OV-01 (Dürr EcoInCure)', 'Production Equipment', 'Oven', 'FLR-PUN-2-G', 'Curing Oven'),
  asset(304, 'REG-000304', 'AGV-1204', 'AGV Tugger AGV-04 (MiR250)', 'Material Handling', 'AGV', 'FLR-PUN-1-G', 'Assembly Line 1'),
  asset(305, 'REG-000305', 'TLC-1311', 'Torque Tool Cart TC-11 (Atlas Copco)', 'Mobile Tools', 'Tool Cart', 'FLR-PUN-1-G', 'Tool Crib'),
  asset(401, 'REG-000401', 'CLD-1401', 'Cold Room CR-01 (-18 °C Frozen)', 'Cold Chain', 'Cold Room', 'FLR-HYD-1-G', 'Cold Room 1'),
  asset(402, 'REG-000402', 'CLD-1402', 'Cold Room CR-02 (+4 °C Chilled)', 'Cold Chain', 'Cold Room', 'FLR-HYD-1-G', 'Cold Room 2'),
  asset(403, 'REG-000403', 'RFT-1501', 'Reefer Truck TS-09-UC-7734 (Eicher Pro 2110)', 'Fleet', 'Reefer Vehicle', 'FLR-HYD-1-G', 'Reefer Dock'),
  asset(404, 'REG-000404', 'GEN-0405', 'Standby Generator DG-05 (Kirloskar 250 kVA)', 'Power', 'Generator', 'FLR-HYD-1-G', 'Plant Room'),
  asset(405, 'REG-000405', 'FLT-0141', 'Forklift FL-41 (Toyota 8FBN25)', 'Material Handling', 'Forklift', 'FLR-HYD-1-G', 'Ante Room'),
  asset(501, 'REG-000501', 'FLT-0151', 'Forklift FL-51 (Linde E20)', 'Material Handling', 'Forklift', 'FLR-DXB-1-G', 'Dispatch Apron'),
  asset(502, 'REG-000502', 'RCN-1602', 'Reefer Container RC-02 (Carrier ThinLINE)', 'Cold Chain', 'Reefer Container', 'FLR-DXB-1-G', 'Reefer Plug-in Area'),
  asset(503, 'REG-000503', 'DKL-1703', 'Dock Leveller DL-03 (Hörmann HLS 2)', 'Material Handling', 'Dock Leveller', 'FLR-DXB-1-G', 'Dispatch Apron', 'Under Maintenance'),
];

export function siteById(id: string | null | undefined): DemoSite | undefined {
  return DEMO_SITES.find((s) => s.id === id);
}

export function siteByName(name: string | null | undefined): DemoSite | undefined {
  const n = (name ?? '').trim().toLowerCase();
  return DEMO_SITES.find((s) => s.name.toLowerCase() === n);
}

export function buildingById(id: string | null | undefined): DemoBuilding | undefined {
  return DEMO_BUILDINGS.find((b) => b.id === id);
}

export function floorById(id: string | null | undefined): DemoFloor | undefined {
  return DEMO_FLOORS.find((f) => f.id === id);
}

/** An asset by registration id, asset tag or record id. */
export function assetByRef(ref: string | null | undefined): DemoAsset | undefined {
  const r = (ref ?? '').trim().toLowerCase();
  if (!r) return undefined;
  return DEMO_ASSETS.find((a) => a.regId.toLowerCase() === r || a.tag.toLowerCase() === r || a.id === r);
}

/** "Site › Building › Floor › Zone" of an asset. */
export function assetLocation(a: DemoAsset): string {
  const b = buildingById(a.buildingId);
  return [siteById(a.siteId)?.name, b?.name, floorById(a.floorId)?.name, a.zone].filter(Boolean).join(' › ');
}
