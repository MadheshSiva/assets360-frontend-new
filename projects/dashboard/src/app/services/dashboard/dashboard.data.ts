/**
 * STATIC DEMO: the asset register, sites and IoT devices behind every dashboard widget.
 * The 20 assets match the Assets module (same tags, names, makers and custodians); every Dashboard service
 * response is derived from them so the KPIs, donuts, maps and drill-downs agree with each other.
 * Times are relative to when the page loads, so "last seen", alerts and location updates always look current.
 */
import type {
  AssetDashboardCategories,
  AssetDashboardKpis,
  AssetDashboardLocations,
  AssetPerformanceSummary,
  AssetStatusCounts,
  AssetTypeOption,
  ConnectedAssetDetail,
  DeviceConnectivity,
  InsightAsset,
  InsightAssetList,
  InsightEndpoint,
  KpiMetric,
  LocationUpdates,
  SiteDetail,
  SiteOption,
  TopSite,
} from './dashboard';
import type { AssetRegistrationDetail, AssetRegistrationList, AssetRegistrationListItem } from '../../shared/asset-quick-view/quick-view';

export type NetworkStatus = 'Online' | 'Idle' | 'Offline' | 'Unknown';

export interface DemoSite {
  id: string;
  name: string;
  code: string;
  type: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  /** Map colour and icon of the IoT overview's site cards. */
  color: string;
  image: 'factory' | 'warehouse';
  gateways: string[];
}

export interface DemoAsset {
  registrationId: string;
  tag: string;
  name: string;
  category: string;
  subCategory: string;
  type: string;
  siteId: string;
  building: string;
  floor: string;
  zone: string;
  room: string;
  custodian: string;
  department: string;
  /** Registration status as the Assets module shows it. */
  status: 'Active' | 'Under Maintenance' | 'In Repair' | 'In Storage' | 'Checked Out' | 'Disposed';
  criticality: 'Critical' | 'High' | 'Medium' | 'Low';
  condition: 'Good' | 'Fair' | 'Poor';
  /** Health score 0-100 from the latest assessment. */
  health: number;
  /** Health score 30 days earlier. */
  prevHealth: number;
  /** Share of the period the asset was running (0-100). */
  utilization: number;
  manufacturer: string;
  model: string;
  serial: string;
  purchaseDate: string;
  cost: number;
  vendor: string;
  warrantyEnd: string;
  lastService: string;
  nextService: string;
  every: [number, string];
  documents: string[];
  image: string;
  /** IoT tag on the asset; null when it has no tracker. */
  device: { network: NetworkStatus; gateway: string; firmware: string; battery: number; signal: number; temperature: number; vibration: number } | null;
  lat: number;
  lng: number;
  createdAt: string;
}

const NOW = new Date();
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** ISO date-time `minutes` before now. */
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (n: number, total: number) => (total ? round1((n / total) * 100) : 0);

export const DEMO_CLIENT_ID = 'demo-client';
export const LATEST_FIRMWARE_VERSION = 'v4.2.1';

export const DEMO_SITES: DemoSite[] = [
  { id: 'site-hq', name: 'Head Office', code: 'HQ', type: 'Office Campus', city: 'Dubai', country: 'United Arab Emirates', lat: 25.1866, lng: 55.265, color: '#2563eb', image: 'factory', gateways: ['GW-HQ-01', 'GW-HQ-02', 'GW-HQ-03'] },
  { id: 'site-dc', name: 'Data Center', code: 'DC', type: 'Data Center', city: 'Dubai Silicon Oasis', country: 'United Arab Emirates', lat: 25.1185, lng: 55.379, color: '#7c3aed', image: 'factory', gateways: ['GW-DC-01'] },
  { id: 'site-wh', name: 'Central Warehouse', code: 'WH', type: 'Warehouse', city: 'Jebel Ali', country: 'United Arab Emirates', lat: 25.0108, lng: 55.1238, color: '#0891b2', image: 'warehouse', gateways: ['GW-WH-01', 'GW-WH-02'] },
  { id: 'site-ss', name: 'Main Substation', code: 'SS', type: 'Utility Yard', city: 'Al Quoz', country: 'United Arab Emirates', lat: 25.139, lng: 55.229, color: '#ea580c', image: 'warehouse', gateways: ['GW-SS-01'] },
];

const DOCS = ['Purchase Order.pdf', 'Invoice.pdf', 'Warranty Certificate.pdf', 'Installation Report.pdf', 'O&M Manual.pdf'];
const dev = (network: NetworkStatus, gateway: string, firmware: string, battery: number, signal: number, temperature: number, vibration: number) => ({
  network, gateway, firmware, battery, signal, temperature, vibration,
});

type Row = Omit<DemoAsset, 'registrationId' | 'lat' | 'lng' | 'createdAt' | 'documents' | 'every'> & { every?: [number, string]; docs?: number; dLat: number; dLng: number };

const ROWS: Row[] = [
  { tag: 'GEN-00045', name: 'Diesel Generator 250 kVA', category: 'Power Generation', subCategory: 'Standby Power', type: 'Generator', siteId: 'site-hq', building: 'Building A', floor: 'Ground Floor', zone: 'Plant Zone', room: 'ER-101', custodian: 'Ahmed Basim', department: 'Facilities', status: 'Active', criticality: 'Critical', condition: 'Good', health: 85, prevHealth: 83, utilization: 72, manufacturer: 'Caterpillar', model: 'C9.3', serial: 'CAT-C93-58821', purchaseDate: '2023-01-10', cost: 68500, vendor: 'Al Masaood Power', warrantyEnd: '2028-01-10', lastService: '2026-09-12', nextService: '2026-12-12', every: [3, 'Months'], image: 'asset-generator.svg', device: dev('Online', 'GW-HQ-01', 'v4.2.1', 88, -61, 82, 4.1), dLat: 0.0006, dLng: -0.0009 },
  { tag: 'HVAC-00112', name: 'HVAC Chiller', category: 'HVAC', subCategory: 'Chillers', type: 'Chiller', siteId: 'site-hq', building: 'Building B', floor: 'Roof', zone: 'Roof Plant', room: 'Chiller Deck', custodian: 'Sara Ahmed', department: 'Facilities', status: 'Active', criticality: 'High', condition: 'Good', health: 85, prevHealth: 86, utilization: 72, manufacturer: 'Carrier', model: '30XA 400', serial: 'CAR-30XA-22874', purchaseDate: '2022-05-18', cost: 142000, vendor: 'CoolAir Trading', warrantyEnd: '2027-05-18', lastService: '2026-08-18', nextService: '2026-11-25', every: [3, 'Months'], image: 'asset-images/chiller-overview.svg', device: dev('Online', 'GW-HQ-02', 'v4.2.1', 76, -58, 9.5, 2.8), dLat: 0.0011, dLng: 0.0004 },
  { tag: 'UPS-00078', name: 'UPS 100 kVA', category: 'Electrical', subCategory: 'Power Protection', type: 'UPS', siteId: 'site-dc', building: 'Building A', floor: 'Ground Floor', zone: 'White Space', room: 'DC Room', custodian: 'Mohan Kumar', department: 'IT', status: 'Active', criticality: 'Critical', condition: 'Good', health: 91, prevHealth: 90, utilization: 95, manufacturer: 'Schneider Electric', model: 'Galaxy VS 100', serial: 'SE-GVS-100-41207', purchaseDate: '2023-06-12', cost: 54200, vendor: 'Gulf Power Systems', warrantyEnd: '2028-06-12', lastService: '2026-09-12', nextService: '2026-12-10', every: [3, 'Months'], image: 'asset-images/ups-overview.svg', device: dev('Online', 'GW-DC-01', 'v4.2.1', 97, -52, 27.5, 0.6), dLat: 0.0003, dLng: 0.0005 },
  { tag: 'FLT-00021', name: 'Forklift - Electric', category: 'Material Handling', subCategory: 'Lifting Equipment', type: 'Forklift', siteId: 'site-wh', building: 'Main Warehouse', floor: 'Ground Floor', zone: 'Racking Aisles', room: 'Aisle 4', custodian: 'Rashid Ali', department: 'Logistics', status: 'Active', criticality: 'High', condition: 'Good', health: 90, prevHealth: 88, utilization: 64, manufacturer: 'Toyota', model: '8FBE20', serial: 'TOY-8FBE-77310', purchaseDate: '2022-09-05', cost: 38900, vendor: 'Al-Futtaim Toyota Material Handling', warrantyEnd: '2026-09-05', lastService: '2026-09-05', nextService: '2026-11-22', every: [2, 'Months'], image: 'asset-images/forklift-overview.svg', device: dev('Online', 'GW-WH-01', 'v4.2.1', 64, -67, 41, 6.3), dLat: -0.0004, dLng: 0.0008 },
  { tag: 'FP-00056', name: 'Fire Pump', category: 'Safety & Security', subCategory: 'Fire Protection', type: 'Fire System', siteId: 'site-hq', building: 'Building A', floor: 'Basement', zone: 'Pump Room', room: 'B-04', custodian: 'Noura Saeed', department: 'Safety', status: 'Under Maintenance', criticality: 'Critical', condition: 'Fair', health: 63, prevHealth: 71, utilization: 1, manufacturer: 'Grundfos', model: 'NKF 150', serial: 'GRU-NKF-150-11930', purchaseDate: '2021-04-20', cost: 46800, vendor: 'NAFFCO', warrantyEnd: '2026-04-20', lastService: '2026-05-20', nextService: '2026-11-10', every: [6, 'Months'], image: 'asset-images/firepump-overview.svg', device: dev('Idle', 'GW-HQ-01', 'v4.1.0', 53, -74, 36, 9.2), dLat: 0.0002, dLng: -0.0012 },
  { tag: 'AC-00311', name: 'Split AC - 5 Ton', category: 'HVAC', subCategory: 'Air Conditioning', type: 'Air Conditioner', siteId: 'site-hq', building: 'Building C', floor: '2nd Floor', zone: 'Conference Wing', room: 'C-204', custodian: 'Faisal Ahmed', department: 'Facilities', status: 'Active', criticality: 'Medium', condition: 'Good', health: 82, prevHealth: 82, utilization: 41, manufacturer: 'Daikin', model: 'FTKF140', serial: 'DAI-FTKF-140-30561', purchaseDate: '2024-01-29', cost: 4200, vendor: 'CoolAir Trading', warrantyEnd: '2027-01-29', lastService: '2026-08-14', nextService: '2027-01-18', every: [6, 'Months'], image: 'asset-images/ac-overview.svg', device: dev('Online', 'GW-HQ-03', 'v4.2.1', 91, -63, 18.5, 1.2), dLat: -0.0008, dLng: 0.0011 },
  { tag: 'IT-00189', name: 'Laptop - Dell Latitude', category: 'IT Equipment', subCategory: 'End-User Devices', type: 'Laptop', siteId: 'site-hq', building: 'Building A', floor: '3rd Floor', zone: 'IT Department', room: 'A-312', custodian: 'Sarah James', department: 'IT', status: 'Active', criticality: 'Medium', condition: 'Good', health: 91, prevHealth: 92, utilization: 23, manufacturer: 'Dell', model: 'Latitude 5440', serial: 'DEL-5440-9KX21', purchaseDate: '2025-02-03', cost: 1450, vendor: 'Emitac Enterprise Solutions', warrantyEnd: '2028-02-03', lastService: '2026-07-01', nextService: '2027-01-01', every: [6, 'Months'], docs: 3, image: 'asset-images/laptop-overview.svg', device: null, dLat: 0.0005, dLng: -0.0003 },
  { tag: 'CCTV-00234', name: 'CCTV Camera - Dome', category: 'Security', subCategory: 'Surveillance', type: 'CCTV', siteId: 'site-hq', building: 'Building A', floor: 'Ground Floor', zone: 'Main Lobby', room: 'Lobby', custodian: 'Ibrahim Khan', department: 'Security', status: 'Active', criticality: 'Medium', condition: 'Good', health: 87, prevHealth: 86, utilization: 95, manufacturer: 'Hikvision', model: 'DS-2CD2143', serial: 'HIK-2143-55102', purchaseDate: '2023-03-08', cost: 420, vendor: 'Secure Vision LLC', warrantyEnd: '2026-03-08', lastService: '2026-09-08', nextService: '2027-02-12', every: [6, 'Months'], image: 'asset-images/cctvdome-overview.svg', device: dev('Online', 'GW-HQ-01', 'v4.2.1', 100, -55, 31, 0.2), dLat: 0.0009, dLng: -0.0006 },
  { tag: 'TRF-00067', name: 'Transformer 1 MVA', category: 'Electrical', subCategory: 'Power Distribution', type: 'Transformer', siteId: 'site-ss', building: 'Switchyard', floor: 'Outdoor', zone: 'Bay 2', room: 'TX-2', custodian: 'Hamad Lateef', department: 'Engineering', status: 'In Repair', criticality: 'Critical', condition: 'Poor', health: 46, prevHealth: 58, utilization: 0, manufacturer: 'ABB', model: 'RESIBLOC 1000', serial: 'ABB-RES-1000-80455', purchaseDate: '2019-11-14', cost: 96500, vendor: 'ABB Gulf', warrantyEnd: '2024-11-14', lastService: '2026-08-15', nextService: '2026-11-20', every: [6, 'Months'], image: 'asset-images/transformer-overview.svg', device: dev('Offline', 'GW-SS-01', 'v3.9.8', 22, 0, 68, 11.4), dLat: 0.0004, dLng: 0.0007 },
  { tag: 'SOL-00456', name: 'Solar Panel - 550W', category: 'Renewable Energy', subCategory: 'Solar', type: 'Solar Panel', siteId: 'site-hq', building: 'Building B', floor: 'Roof', zone: 'PV Array North', room: 'String 3', custodian: 'Ramesh Kumar', department: 'Engineering', status: 'Active', criticality: 'Low', condition: 'Good', health: 81, prevHealth: 80, utilization: 38, manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', serial: 'JKS-TN550-61872', purchaseDate: '2024-04-22', cost: 310, vendor: 'SolarTech Emirates', warrantyEnd: '2049-04-22', lastService: '2026-04-22', nextService: '2027-04-01', every: [12, 'Months'], image: 'asset-images/solar-array.svg', device: dev('Online', 'GW-HQ-02', 'v4.2.1', 79, -70, 46, 0.1), dLat: 0.0013, dLng: 0.0009 },
  { tag: 'GEN-00052', name: 'Gas Generator 500 kVA', category: 'Power Generation', subCategory: 'Prime Power', type: 'Generator', siteId: 'site-ss', building: 'Switchyard', floor: 'Outdoor', zone: 'Generator Pad', room: 'G-2', custodian: 'Hamad Lateef', department: 'Engineering', status: 'Active', criticality: 'High', condition: 'Good', health: 92, prevHealth: 91, utilization: 28, manufacturer: 'Cummins', model: 'C500N5', serial: 'CUM-C500-20931', purchaseDate: '2024-10-12', cost: 118000, vendor: 'Cummins Arabia', warrantyEnd: '2027-10-12', lastService: '2026-10-12', nextService: '2026-12-05', every: [2, 'Months'], image: 'asset-generator.svg', device: dev('Online', 'GW-SS-01', 'v4.2.1', 84, -64, 74, 3.5), dLat: -0.0005, dLng: -0.0004 },
  { tag: 'HVAC-00118', name: 'Air Handling Unit', category: 'HVAC', subCategory: 'Air Handling', type: 'AHU', siteId: 'site-hq', building: 'Building B', floor: '1st Floor', zone: 'Plant Room', room: 'B-118', custodian: 'Sara Ahmed', department: 'Facilities', status: 'Under Maintenance', criticality: 'High', condition: 'Fair', health: 62, prevHealth: 69, utilization: 0, manufacturer: 'Trane', model: 'Performance CSAA', serial: 'TRN-CSAA-47160', purchaseDate: '2021-08-25', cost: 38700, vendor: 'CoolAir Trading', warrantyEnd: '2025-08-25', lastService: '2026-05-25', nextService: '2026-11-12', every: [3, 'Months'], image: 'asset-images/ahu-overview.svg', device: dev('Idle', 'GW-HQ-02', 'v4.1.0', 47, -71, 29, 7.8), dLat: 0.0010, dLng: 0.0001 },
  { tag: 'IT-00204', name: 'Laptop - HP EliteBook', category: 'IT Equipment', subCategory: 'End-User Devices', type: 'Laptop', siteId: 'site-hq', building: 'Building A', floor: '2nd Floor', zone: 'Finance Department', room: 'A-215', custodian: 'Mohan Kumar', department: 'IT', status: 'Checked Out', criticality: 'Low', condition: 'Good', health: 80, prevHealth: 81, utilization: 22, manufacturer: 'HP', model: 'EliteBook 840 G10', serial: 'HP-840G10-5CD3', purchaseDate: '2025-03-15', cost: 1620, vendor: 'Emitac Enterprise Solutions', warrantyEnd: '2028-03-15', lastService: '2026-07-15', nextService: '2027-01-15', every: [6, 'Months'], docs: 3, image: 'asset-images/laptop-overview.svg', device: null, dLat: 0.0004, dLng: -0.0002 },
  { tag: 'CCTV-00241', name: 'CCTV Camera - Bullet', category: 'Security', subCategory: 'Surveillance', type: 'CCTV', siteId: 'site-wh', building: 'Main Warehouse', floor: 'Ground Floor', zone: 'Loading Bay', room: 'Dock 2', custodian: 'Ibrahim Khan', department: 'Security', status: 'Active', criticality: 'Medium', condition: 'Good', health: 84, prevHealth: 84, utilization: 98, manufacturer: 'Axis', model: 'P1455-LE', serial: 'AXS-1455-70318', purchaseDate: '2023-09-18', cost: 690, vendor: 'Secure Vision LLC', warrantyEnd: '2026-09-18', lastService: '2026-09-18', nextService: '2027-01-09', every: [6, 'Months'], image: 'asset-images/cctvbullet-overview.svg', device: dev('Online', 'GW-WH-02', 'v4.2.1', 100, -59, 34, 0.3), dLat: 0.0006, dLng: 0.0010 },
  { tag: 'FLT-00033', name: 'Pallet Jack - Electric', category: 'Material Handling', subCategory: 'Lifting Equipment', type: 'Pallet Jack', siteId: 'site-wh', building: 'Main Warehouse', floor: 'Ground Floor', zone: 'Workshop', room: 'Maintenance Bay', custodian: 'Rashid Ali', department: 'Logistics', status: 'In Repair', criticality: 'Low', condition: 'Poor', health: 49, prevHealth: 61, utilization: 0, manufacturer: 'Jungheinrich', model: 'EJE 120', serial: 'JUN-EJE120-33094', purchaseDate: '2022-02-27', cost: 6400, vendor: 'Jungheinrich Middle East', warrantyEnd: '2024-02-27', lastService: '2026-08-27', nextService: '2026-10-30', every: [2, 'Months'], image: 'asset-images/palletjack-overview.svg', device: dev('Offline', 'GW-WH-01', 'v4.0.3', 9, 0, 33, 0), dLat: -0.0009, dLng: -0.0005 },
  { tag: 'FP-00061', name: 'Fire Alarm Panel', category: 'Safety & Security', subCategory: 'Fire Detection', type: 'Fire System', siteId: 'site-hq', building: 'Building A', floor: 'Ground Floor', zone: 'Security Room', room: 'A-009', custodian: 'Noura Saeed', department: 'Safety', status: 'Active', criticality: 'High', condition: 'Good', health: 87, prevHealth: 87, utilization: 96, manufacturer: 'Honeywell', model: 'NFS2-3030', serial: 'HON-NFS2-12455', purchaseDate: '2021-11-25', cost: 18900, vendor: 'NAFFCO', warrantyEnd: '2026-11-25', lastService: '2026-05-25', nextService: '2026-12-20', every: [6, 'Months'], image: 'asset-images/alarmpanel-overview.svg', device: dev('Online', 'GW-HQ-01', 'v4.2.1', 100, -50, 26, 0), dLat: 0.0007, dLng: -0.0011 },
  { tag: 'UPS-00081', name: 'UPS 60 kVA', category: 'Electrical', subCategory: 'Power Protection', type: 'UPS', siteId: 'site-hq', building: 'Building A', floor: '3rd Floor', zone: 'IT Department', room: 'Server Room', custodian: 'Sarah James', department: 'IT', status: 'Active', criticality: 'High', condition: 'Good', health: 80, prevHealth: 79, utilization: 99, manufacturer: 'Eaton', model: '93PM 60', serial: 'EAT-93PM-60-18820', purchaseDate: '2023-02-02', cost: 31200, vendor: 'Gulf Power Systems', warrantyEnd: '2028-02-02', lastService: '2026-10-10', nextService: '2027-02-02', every: [4, 'Months'], image: 'asset-images/ups-overview.svg', device: dev('Online', 'GW-HQ-03', 'v4.1.0', 95, -57, 28, 0.4), dLat: 0.0003, dLng: -0.0001 },
  { tag: 'TRF-00072', name: 'Transformer 500 kVA', category: 'Electrical', subCategory: 'Power Distribution', type: 'Transformer', siteId: 'site-hq', building: 'Building C', floor: 'Ground Floor', zone: 'Electrical Room', room: 'C-E01', custodian: 'Hamad Lateef', department: 'Engineering', status: 'Active', criticality: 'High', condition: 'Good', health: 87, prevHealth: 86, utilization: 94, manufacturer: 'Siemens', model: 'GEAFOL 500', serial: 'SIE-GEA-500-66013', purchaseDate: '2022-06-30', cost: 61300, vendor: 'Siemens LLC', warrantyEnd: '2027-06-30', lastService: '2026-06-30', nextService: '2027-03-15', every: [9, 'Months'], image: 'asset-images/transformer-overview.svg', device: dev('Online', 'GW-HQ-03', 'v4.2.1', 93, -60, 58, 1.9), dLat: -0.0010, dLng: 0.0008 },
  { tag: 'AC-00318', name: 'Split AC - 2 Ton', category: 'HVAC', subCategory: 'Air Conditioning', type: 'Air Conditioner', siteId: 'site-hq', building: 'Building A', floor: 'Basement', zone: 'Stores', room: 'Store Room', custodian: '', department: 'Facilities', status: 'In Storage', criticality: 'Low', condition: 'Good', health: 83, prevHealth: 83, utilization: 0, manufacturer: 'Daikin', model: 'FTKF71', serial: 'DAI-FTKF-71-30877', purchaseDate: '2023-05-08', cost: 1900, vendor: 'CoolAir Trading', warrantyEnd: '2026-05-08', lastService: '2026-05-08', nextService: '', every: [6, 'Months'], image: 'asset-images/ac-overview.svg', device: null, dLat: 0.0001, dLng: -0.0013 },
  { tag: 'SOL-00462', name: 'Solar Panel - 550W', category: 'Renewable Energy', subCategory: 'Solar', type: 'Solar Panel', siteId: 'site-hq', building: 'Building B', floor: 'Roof', zone: 'PV Array North', room: 'String 5', custodian: '', department: 'Engineering', status: 'Disposed', criticality: 'Low', condition: 'Poor', health: 35, prevHealth: 38, utilization: 0, manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', serial: 'JKS-TN550-61907', purchaseDate: '2024-04-22', cost: 310, vendor: 'SolarTech Emirates', warrantyEnd: '2049-04-22', lastService: '2026-03-10', nextService: '', every: [12, 'Months'], docs: 0, image: 'asset-images/solar-array.svg', device: null, dLat: 0.0014, dLng: 0.0012 },
];

export const DEMO_ASSETS: DemoAsset[] = ROWS.map(({ dLat, dLng, docs, every, ...r }, i) => {
  const site = DEMO_SITES.find((s) => s.id === r.siteId)!;
  return {
    ...r,
    registrationId: `AR-${r.purchaseDate.slice(0, 4)}-${String(1001 + i)}`,
    lat: round6(site.lat + dLat),
    lng: round6(site.lng + dLng),
    every: every ?? [6, 'Months'],
    documents: DOCS.slice(0, docs ?? DOCS.length),
    createdAt: `${r.purchaseDate}T09:${pad(10 + i)}:00Z`,
  };
});

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export const siteOf = (a: DemoAsset): DemoSite => DEMO_SITES.find((s) => s.id === a.siteId)!;
export const locationPath = (a: DemoAsset) => [siteOf(a).name, a.building, a.floor, a.zone, a.room].filter(Boolean).join(' / ');
export const networkOf = (a: DemoAsset): NetworkStatus => a.device?.network ?? 'Unknown';

/** Minutes since the asset's tag last reported: online tags report every few minutes, offline ones went quiet days ago. */
function minutesSinceSeen(a: DemoAsset, i: number): number {
  switch (a.device?.network) {
    case 'Online': return 1 + ((i * 7) % 9);
    case 'Idle': return 45 + i * 11;
    case 'Offline': return 2 * 1440 + i * 97;
    default: return 0;
  }
}

/** Deterministic pseudo-random 0..1 for a pair of integers. */
function noise(a: number, b: number): number {
  let s = (a * 374761393 + b * 668265263) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0;
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

// ===== Responses of the Dashboard service =====

function connectedDetail(a: DemoAsset, i: number, days: number): ConnectedAssetDetail {
  return {
    assetRegistrationId: a.registrationId,
    assetTag: a.tag,
    assetName: a.name,
    assetType: a.type,
    siteName: siteOf(a).name,
    assetStatus: a.status,
    networkStatus: networkOf(a),
    gatewayId: a.device!.gateway,
    firstSeenAt: `${a.purchaseDate}T10:00:00Z`,
    lastSeenAt: ago(minutesSinceSeen(a, i)),
    readingCount: Math.round((a.device!.network === 'Offline' ? 180 : a.device!.network === 'Idle' ? 640 : 1440) * days * (0.8 + noise(i, days) * 0.4)),
  };
}

const metric = (value: number, percent: number | null, changePercent: number | null, note: string): KpiMetric => ({ value, percent, changePercent, note });

export function demoKpis(days: number): AssetDashboardKpis {
  const connected = DEMO_ASSETS.map((a, i) => ({ a, i })).filter(({ a }) => !!a.device);
  const total = DEMO_ASSETS.length;
  const online = connected.filter(({ a }) => a.device!.network === 'Online').length;
  const reporting = connected.filter(({ a }) => a.device!.network !== 'Offline');
  const located = reporting.length;
  const fresh = reporting.filter(({ a, i }) => minutesSinceSeen(a, i) <= 60).length;
  const alerts = demoAlertsSince(days).length;
  const scale = days <= 7 ? 1 : days <= 30 ? 2.4 : 5.1;
  return {
    days,
    from: new Date(NOW.getTime() - days * DAY).toISOString(),
    to: NOW.toISOString(),
    totalAssets: total,
    connectedAssets: metric(connected.length, pct(connected.length, total), round1(6.7 * scale / 2), `${connected.length} of ${total} assets have a tracker`),
    onlineNow: metric(online, pct(online, connected.length), round1(2.1 * scale / 2), 'Reported in the last 10 minutes'),
    alerts: metric(alerts, null, round1(-8.3 * scale / 2), `Alerts raised in the last ${days} days`),
    coverage: metric(located, pct(located, connected.length), round1(1.4 * scale / 2), 'Connected assets with a known position'),
    dataFreshness: metric(fresh, pct(fresh, reporting.length), round1(-0.9 * scale / 2), 'Reporting assets updated within the last hour'),
    connectedAssetDetails: connected.map(({ a, i }) => connectedDetail(a, i, days)),
  };
}

export function demoPerformanceSummary(datePreset: string): AssetPerformanceSummary {
  const live = DEMO_ASSETS.filter((a) => a.status !== 'Disposed');
  const avg = (vals: number[]) => round1(vals.reduce((s, v) => s + v, 0) / (vals.length || 1));
  const health = avg(live.map((a) => a.health));
  const prevHealth = avg(live.map((a) => a.prevHealth));
  const running = live.filter((a) => a.status === 'Active' || a.status === 'Checked Out');
  const label = `vs previous ${datePreset.replace(/^Last\s+/i, '')}`;
  const kpi = (value: number, previousValue: number, format: string, changeUnit: 'percent' | 'points') => {
    const change = changeUnit === 'points' ? round1(value - previousValue) : round1(((value - previousValue) / previousValue) * 100);
    return { value, format, previousValue, change, changeUnit, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', comparisonLabel: label };
  };
  return {
    generatedAt: NOW.toISOString(),
    data: {
      totalAssets: kpi(live.length, live.length - 1, 'number', 'percent'),
      averageHealthScore: kpi(health, prevHealth, 'score', 'points'),
      utilizationRate: kpi(avg(running.map((a) => a.utilization)), 61.2, 'percent', 'points'),
      availability: kpi(pct(running.length, live.length), 82.4, 'percent', 'points'),
      mtbf: kpi(1462, 1388, 'hours', 'percent'),
      mttr: kpi(6.4, 7.1, 'hours', 'percent'),
    },
  };
}

function insightAsset(a: DemoAsset): InsightAsset {
  return {
    assetRegistrationId: a.registrationId,
    assetTag: a.tag,
    assetName: a.name,
    category: a.category,
    subCategory: a.subCategory,
    assetType: a.type,
    criticality: a.criticality,
    assetStatus: a.status,
    siteId: a.siteId,
    siteName: siteOf(a).name,
    locationPath: locationPath(a),
    custodianName: a.custodian || null,
    custodianDepartment: a.department || null,
    documentCount: a.documents.length,
  };
}

const STATUS_ORDER: DemoAsset['status'][] = ['Active', 'Under Maintenance', 'In Repair', 'Checked Out', 'In Storage', 'Disposed'];

export function demoStatusCounts(status?: string, includeAssets = true): AssetStatusCounts {
  const total = DEMO_ASSETS.length;
  const statuses = STATUS_ORDER.map((s) => {
    const list = DEMO_ASSETS.filter((a) => a.status === s);
    return { status: s as string, count: list.length, percent: pct(list.length, total), assets: includeAssets ? list.map(insightAsset) : [] };
  }).filter((s) => s.count > 0 && (!status || s.status.toLowerCase() === status.toLowerCase()));
  return { totalAssets: total, totalStatuses: statuses.length, statuses };
}

export function demoAssetTypes(): AssetTypeOption[] {
  const seen = new Map<string, AssetTypeOption>();
  for (const a of DEMO_ASSETS) {
    if (seen.has(a.type)) continue;
    const n = seen.size + 1;
    seen.set(a.type, {
      id: `type-${String(n).padStart(3, '0')}`,
      assetTypeName: a.type,
      code: `AT-${String(n).padStart(3, '0')}`,
      category: { id: `cat-${a.category.toLowerCase().replace(/[^a-z]+/g, '-')}`, name: a.category },
      status: 'Active',
      isDeleted: false,
    });
  }
  return [...seen.values()];
}

export function demoSites(): SiteOption[] {
  return DEMO_SITES.map((s) => ({
    id: s.id, siteName: s.name, code: s.code, siteType: s.type, city: s.city, country: s.country,
    latitude: s.lat, longitude: s.lng, status: 'Active', isDeleted: false,
  }));
}

function topSite(s: DemoSite): TopSite {
  const list = DEMO_ASSETS.filter((a) => a.siteId === s.id);
  const count = (n: NetworkStatus) => list.filter((a) => networkOf(a) === n).length;
  return {
    siteId: s.id, siteName: s.name, siteCode: s.code, totalAssets: list.length,
    onlinePercent: pct(count('Online'), list.length),
    online: count('Online'), idle: count('Idle'), offline: count('Offline'), unknown: count('Unknown'),
  };
}

export function demoLocations(top?: number): AssetDashboardLocations {
  const sites = DEMO_SITES.map(topSite).sort((a, b) => b.totalAssets - a.totalAssets);
  const legend: Record<string, number> = { Online: 0, Idle: 0, Offline: 0, Unknown: 0 };
  for (const a of DEMO_ASSETS) legend[networkOf(a)]++;
  return { pins: [], legend, assetsWithoutCoordinates: 0, topSites: top ? sites.slice(0, top) : sites, totalSites: sites.length };
}

export function demoSiteDetail(siteId: string): SiteDetail | null {
  const s = DEMO_SITES.find((x) => x.id === siteId);
  if (!s) return null;
  const t = topSite(s);
  const list = DEMO_ASSETS.map((a, i) => ({ a, i })).filter(({ a }) => a.siteId === siteId);
  const statuses = (['Online', 'Idle', 'Offline', 'Unknown'] as NetworkStatus[])
    .map((n) => {
      const rows = list.filter(({ a }) => networkOf(a) === n);
      return {
        status: n as string,
        count: rows.length,
        assets: rows.map(({ a, i }) => ({
          assetRegistrationId: a.registrationId, assetTag: a.tag, assetName: a.name, assetType: a.type, assetStatus: a.status,
          buildingName: a.building, floorName: a.floor, zoneName: a.zone, locationPath: locationPath(a),
          latitude: a.lat, longitude: a.lng, networkStatus: n, gatewayId: a.device?.gateway ?? null,
          lastSeenAt: a.device ? ago(minutesSinceSeen(a, i)) : null,
        })),
      };
    })
    .filter((x) => x.count > 0);
  return {
    siteId: s.id, siteName: s.name, siteCode: s.code, siteType: s.type, city: s.city, country: s.country,
    totalAssets: t.totalAssets, onlinePercent: t.onlinePercent, statuses,
  };
}

export function demoInsightAssets(endpoint: InsightEndpoint): InsightAssetList {
  const pick: Record<InsightEndpoint, (a: DemoAsset) => boolean> = {
    'critical-assets': (a) => a.criticality === 'Critical',
    'assets-without-custodian': (a) => !a.custodian,
    'assets-without-documents': (a) => !a.documents.length,
  };
  const assets = DEMO_ASSETS.filter(pick[endpoint]).map(insightAsset);
  return { count: assets.length, totalAssets: DEMO_ASSETS.length, assets };
}

export function demoCategories(): AssetDashboardCategories {
  const total = DEMO_ASSETS.length;
  const names = [...new Set(DEMO_ASSETS.map((a) => a.category))];
  const categories = names
    .map((category) => {
      const list = DEMO_ASSETS.filter((a) => a.category === category);
      const subs = [...new Set(list.map((a) => a.subCategory))].map((subCategory) => ({ subCategory, count: list.filter((a) => a.subCategory === subCategory).length }));
      return { category, count: list.length, percent: pct(list.length, total), subCategories: subs.sort((a, b) => b.count - a.count) };
    })
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { totalAssets: total, categories };
}

export function demoDeviceConnectivity(days: number): DeviceConnectivity {
  const devices = DEMO_ASSETS.filter((a) => !!a.device);
  const total = devices.length;
  const bands = (['Online', 'Idle', 'Offline', 'Unknown'] as NetworkStatus[]).map((name) => {
    const count = devices.filter((a) => a.device!.network === name).length;
    return { name: name as string, count, percent: pct(count, total) };
  });
  void days; // the fleet's current state; the period only changes the KPIs' comparisons
  return { total, centrePercent: bands[0].percent, bands };
}

// ===== Location updates (tag moves between gateways) =====

/** Moves of one asset's tag on the day `dayAgo` days back (0 = today); vehicles move all day, fixed assets rarely. */
function movesOn(a: DemoAsset, index: number, dayAgo: number): number {
  if (!a.device) return 0;
  const r = noise(index + 11, dayAgo + 3);
  if (a.device.network === 'Offline') return dayAgo < 2 ? 0 : r < 0.15 ? 1 : 0;
  if (a.type === 'Forklift') return 14 + Math.floor(r * 18);
  if (a.type === 'Pallet Jack') return 6 + Math.floor(r * 9);
  if (a.type === 'Laptop') return Math.floor(r * 4);
  return r < 0.22 ? 1 + Math.floor(r * 6) : 0;
}

export function demoLocationUpdates(days: number, filters: { siteId?: string; assetType?: string; status?: string }): LocationUpdates {
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const to = new Date(today.getTime() + DAY);
  const tags = DEMO_ASSETS.map((a, i) => ({ a, i }))
    .filter(({ a }) => !!a.device)
    .filter(({ a }) => (!filters.siteId || a.siteId === filters.siteId) && (!filters.assetType || a.type === filters.assetType) && (!filters.status || networkOf(a) === filters.status))
    .map(({ a, i }) => {
      let count = 0;
      let lastDay = -1;
      for (let d = days - 1; d >= 0; d--) {
        const n = movesOn(a, i, d);
        count += n;
        if (n) lastDay = d;
      }
      const site = siteOf(a);
      const gws = site.gateways;
      const other = gws.length > 1 ? gws[(gws.indexOf(a.device!.gateway) + 1) % gws.length] : a.device!.gateway;
      const at = lastDay < 0 ? null : new Date(today.getTime() - lastDay * DAY + (7 + Math.floor(noise(i, lastDay) * 10)) * 3_600_000);
      const capped = at && at > NOW ? new Date(NOW.getTime() - 20 * 60_000) : at;
      const near = (v: number, k: number) => round6(v + (noise(i, k) - 0.5) * 0.0016);
      return {
        tagId: a.tag,
        count,
        lastChangedAt: capped ? capped.toISOString() : null,
        lastFromGatewayId: count ? other : null,
        lastToGatewayId: count ? a.device!.gateway : null,
        lastFromLatitude: count ? near(site.lat, 1) : null,
        lastFromLongitude: count ? near(site.lng, 2) : null,
        lastToLatitude: count ? a.lat : null,
        lastToLongitude: count ? a.lng : null,
      };
    })
    .filter((t) => t.count > 0)
    .sort((x, y) => y.count - x.count);
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    totalCount: tags.reduce((s, t) => s + t.count, 0),
    tagCount: tags.length,
    tags,
  };
}

// ===== Asset registrations (Quick View) =====

export function demoRegistrations(pageSize: number, search?: string): AssetRegistrationList {
  const term = (search ?? '').trim().toLowerCase();
  const items: AssetRegistrationListItem[] = [...DEMO_ASSETS]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((a) => !term || [a.tag, a.name, a.type, a.category, siteOf(a).name].some((v) => v.toLowerCase().includes(term)))
    .map((a) => ({
      id: a.registrationId, assetRegistrationId: a.registrationId, assetName: a.name, assetTag: a.tag, imageUrl: a.image,
      category: a.category, assetType: a.type, siteName: siteOf(a).name, status: a.status, criticality: a.criticality, createdAt: a.createdAt,
    }));
  return { items: items.slice(0, pageSize), totalCount: items.length, page: 1, pageSize };
}

export function demoRegistration(assetRegistrationId: string): AssetRegistrationDetail | null {
  const a = DEMO_ASSETS.find((x) => x.registrationId === assetRegistrationId);
  if (!a) return null;
  const docs = a.documents.map((name) => ({ fileName: name, url: `/assets/documents?tag=${encodeURIComponent(a.tag)}` }));
  return {
    id: a.registrationId,
    assetRegistrationId: a.registrationId,
    basicInformation: {
      assetName: a.name, assetTag: a.tag, model: a.model, manufacturer: a.manufacturer, serialNumber: a.serial,
      status: a.status, condition: a.condition, criticality: a.criticality, images: [a.image],
    },
    classification: {
      category: a.category, subCategory: a.subCategory, assetType: a.type, assetSubType: null, criticality: a.criticality,
      department: a.department, lifecycleStage: a.status === 'Disposed' ? 'Disposed' : 'In Operation',
      maintenanceFrequency: a.every[0], maintenanceFrequencyUnit: a.every[1],
      lastMaintenanceDate: a.lastService || null, nextMaintenanceDate: a.nextService || null,
    },
    locationAssignment: {
      location: { siteName: siteOf(a).name, buildingName: a.building, floorName: a.floor, zoneName: a.zone, roomName: a.room, locationPath: locationPath(a) },
      assignment: { custodianDepartment: a.department, assignedToName: a.custodian || null, responsibleTeam: `${a.department} Team`, costCenter: `CC-${a.department.slice(0, 3).toUpperCase()}-01` },
    },
    purchaseWarranty: {
      purchase: { manufacturer: a.manufacturer, supplierVendor: a.vendor, purchaseDate: a.purchaseDate, purchaseCost: a.cost, totalCost: Math.round(a.cost * 1.05), currency: 'USD' },
      documents: docs.slice(0, 3),
      warranty: { warrantyEndDate: a.warrantyEnd, serviceProvider: a.vendor },
    },
    additionalInformation: {
      operational: { lastMaintenanceDate: a.lastService || null, nextMaintenanceDate: a.nextService || null, maintenanceFrequency: a.every[0], maintenanceFrequencyUnit: a.every[1] },
      attachments: docs.slice(3),
    },
    createdAt: a.createdAt,
    updatedAt: `${a.lastService || a.purchaseDate}T14:30:00Z`,
  };
}

// ===== IoT alerts (shared by the KPIs and the IoT overview) =====

export type DemoAlertSeverity = 'Critical' | 'Warning' | 'Info';
export type DemoAlertStatus = 'Open' | 'Acknowledged' | 'In Progress' | 'Resolved';
export interface DemoAlert {
  id: string;
  /** yyyy-MM-ddTHH:mm, local time */
  at: string;
  tag: string;
  event: string;
  severity: DemoAlertSeverity;
  status: DemoAlertStatus;
}

const EVENTS: { event: string; severity: DemoAlertSeverity; types?: string[] }[] = [
  { event: 'Vibration High', severity: 'Critical', types: ['Generator', 'Chiller', 'AHU', 'Transformer', 'Fire System'] },
  { event: 'Temperature High', severity: 'Warning' },
  { event: 'Geofence Breach', severity: 'Critical', types: ['Forklift', 'Pallet Jack'] },
  { event: 'Sensor Offline', severity: 'Warning' },
  { event: 'Pressure Low', severity: 'Warning', types: ['Fire System', 'Chiller'] },
  { event: 'Battery Low', severity: 'Info' },
  { event: 'Unauthorized Movement', severity: 'Critical', types: ['Forklift', 'Pallet Jack', 'CCTV'] },
  { event: 'Signal Lost', severity: 'Warning' },
];

const localStamp = (d: Date) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function buildAlerts(): DemoAlert[] {
  const devices = DEMO_ASSETS.filter((a) => !!a.device);
  // assets in poor health raise most of the alerts
  const weighted = devices.flatMap((a) => Array.from({ length: a.health < 50 ? 5 : a.health < 70 ? 3 : 1 }, () => a));
  const out: DemoAlert[] = [];
  for (let i = 0; i < 96; i++) {
    const a = weighted[Math.floor(noise(i, 1) * weighted.length)];
    const options = EVENTS.filter((e) => !e.types || e.types.includes(a.type));
    const e = options[Math.floor(noise(i, 2) * options.length)];
    const ageMin = i < 34 ? noise(i, 3) * 30 * 1440 : 30 * 1440 + noise(i, 3) * 60 * 1440;
    const at = new Date(NOW.getTime() - ageMin * 60_000);
    const r = noise(i, 4);
    const status: DemoAlertStatus = ageMin > 7 * 1440 ? (r < 0.85 ? 'Resolved' : 'Acknowledged') : r < 0.45 ? 'Open' : r < 0.75 ? 'Acknowledged' : 'In Progress';
    out.push({ id: `ALT-${9000 + i}`, at: localStamp(at), tag: a.tag, event: e.event, severity: e.severity, status });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at));
}

export const DEMO_ALERTS: DemoAlert[] = buildAlerts();

export function demoAlertsSince(days: number): DemoAlert[] {
  const since = localStamp(new Date(NOW.getTime() - days * DAY));
  return DEMO_ALERTS.filter((a) => a.at >= since);
}

/** Minutes since each asset's tag last reported, by asset tag (for the IoT overview's fleet). */
export function demoLastSeen(a: DemoAsset): string {
  const i = DEMO_ASSETS.indexOf(a);
  return localStamp(new Date(NOW.getTime() - minutesSinceSeen(a, i) * 60_000));
}

/** Daily IoT event counts for the last 90 days, oldest first. */
export function demoEventHistory(): { date: string; telemetry: number; location: number; geofence: number; alerts: number }[] {
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  return Array.from({ length: 90 }, (_, i) => {
    const dayAgo = 89 - i;
    const d = new Date(today.getTime() - dayAgo * DAY);
    const date = isoDay(d);
    const location = DEMO_ASSETS.reduce((s, a, k) => s + movesOn(a, k, dayAgo), 0);
    const alerts = DEMO_ALERTS.filter((x) => x.at.startsWith(date)).length;
    const geofence = DEMO_ALERTS.filter((x) => x.at.startsWith(date) && x.event === 'Geofence Breach').length + Math.floor(noise(i, 9) * 4);
    return { date, telemetry: Math.round(1300 + Math.sin(i / 3) * 90 + noise(i, 8) * 160), location, geofence, alerts };
  });
}
