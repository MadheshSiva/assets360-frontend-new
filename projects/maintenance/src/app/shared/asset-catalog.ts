import { ASSET_RECORDS } from 'shared-ui';

/** Asset details the Maintenance pages show (asset panel, location block, pickers). */
export interface CatalogAsset {
  tag: string;
  name: string;
  type: string;
  site: string;
  building: string;
  area: string;
  department: string;
  manufacturer: string;
  model: string;
  serial: string;
  image?: string;
}

/** The demo asset register (same tags, names and locations as the Assets module). */
const REGISTER: CatalogAsset[] = [
  { tag: 'GEN-00045', name: 'Diesel Generator 250 kVA', type: 'Generator', site: 'Head Office', building: 'Building A', area: 'ER-101', department: 'Facilities', manufacturer: 'Caterpillar', model: 'C9.3', serial: 'CAT-C93-2023-00045' },
  { tag: 'HVAC-00112', name: 'HVAC Chiller', type: 'Chiller', site: 'Head Office', building: 'Building B', area: 'Roof', department: 'Facilities', manufacturer: 'Carrier', model: '30XA 400', serial: 'CAR-30XA-2022-00112' },
  { tag: 'UPS-00078', name: 'UPS 100 kVA', type: 'UPS', site: 'Data Center', building: 'Building A', area: 'DC Room', department: 'IT', manufacturer: 'Schneider Electric', model: 'Galaxy VS 100', serial: 'SE-GVS-2023-00078' },
  { tag: 'FLT-00021', name: 'Forklift - Electric', type: 'Forklift', site: 'Warehouse', building: 'Main Warehouse', area: 'Loading Bay 2', department: 'Logistics', manufacturer: 'Toyota', model: '8FBE20', serial: 'TOY-8FBE-2021-00021' },
  { tag: 'FP-00056', name: 'Fire Pump', type: 'Fire System', site: 'Head Office', building: 'Building A', area: 'Basement', department: 'Safety', manufacturer: 'Grundfos', model: 'NKF 150', serial: 'GRU-NKF-2020-00056' },
  { tag: 'AC-00311', name: 'Split AC - 5 Ton', type: 'Air Conditioner', site: 'Building C', building: 'Building C', area: '2nd Floor', department: 'Facilities', manufacturer: 'Daikin', model: 'FTKF140', serial: 'DAI-FTKF-2024-00311' },
  { tag: 'IT-00189', name: 'Laptop - Dell Latitude', type: 'Laptop', site: 'Head Office', building: 'Building A', area: 'IT Department', department: 'IT', manufacturer: 'Dell', model: 'Latitude 5440', serial: 'DL-5440-2024-00189' },
  { tag: 'CCTV-00234', name: 'CCTV Camera - Dome', type: 'CCTV', site: 'Building A', building: 'Building A', area: 'Ground Floor', department: 'Security', manufacturer: 'Hikvision', model: 'DS-2CD2143', serial: 'HIK-2143-2024-00234' },
  { tag: 'TRF-00067', name: 'Transformer 1 MVA', type: 'Transformer', site: 'Main Substation', building: 'Substation', area: 'Outdoor', department: 'Engineering', manufacturer: 'ABB', model: 'RESIBLOC 1000', serial: 'ABB-RB1000-2019-00067' },
  { tag: 'SOL-00456', name: 'Solar Panel - 550W', type: 'Solar Panel', site: 'Building B', building: 'Building B', area: 'Roof', department: 'Engineering', manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', serial: 'JKS-TN550-2024-00456' },
  { tag: 'GEN-00052', name: 'Gas Generator 500 kVA', type: 'Generator', site: 'Main Substation', building: 'Substation', area: 'Outdoor', department: 'Engineering', manufacturer: 'Cummins', model: 'C500N5', serial: 'CUM-C500-2021-00052' },
  { tag: 'HVAC-00118', name: 'Air Handling Unit', type: 'AHU', site: 'Head Office', building: 'Building B', area: 'Plant Room', department: 'Facilities', manufacturer: 'Trane', model: 'Performance CSAA', serial: 'TRN-CSAA-2022-00118' },
  { tag: 'IT-00204', name: 'Laptop - HP EliteBook', type: 'Laptop', site: 'Head Office', building: 'Building A', area: 'Finance Department', department: 'IT', manufacturer: 'HP', model: 'EliteBook 840 G10', serial: 'HP-840G10-2024-00204' },
  { tag: 'CCTV-00241', name: 'CCTV Camera - Bullet', type: 'CCTV', site: 'Warehouse', building: 'Main Warehouse', area: 'Loading Bay', department: 'Security', manufacturer: 'Axis', model: 'P1455-LE', serial: 'AX-P1455-2023-00241' },
  { tag: 'FLT-00033', name: 'Pallet Jack - Electric', type: 'Pallet Jack', site: 'Warehouse', building: 'Main Warehouse', area: 'Aisle 4', department: 'Logistics', manufacturer: 'Jungheinrich', model: 'EJE 120', serial: 'JH-EJE120-2022-00033' },
  { tag: 'FP-00061', name: 'Fire Alarm Panel', type: 'Fire System', site: 'Head Office', building: 'Building A', area: 'Security Room', department: 'Safety', manufacturer: 'Honeywell', model: 'NFS2-3030', serial: 'HON-NFS2-2021-00061' },
  { tag: 'UPS-00081', name: 'UPS 60 kVA', type: 'UPS', site: 'Head Office', building: 'IT Department', area: 'Server Room', department: 'IT', manufacturer: 'Eaton', model: '93PM 60', serial: 'EAT-93PM-2022-00081' },
  { tag: 'TRF-00072', name: 'Transformer 500 kVA', type: 'Transformer', site: 'Building C', building: 'Building C', area: 'Electrical Room', department: 'Engineering', manufacturer: 'Siemens', model: 'GEAFOL 500', serial: 'SIE-GEA500-2020-00072' },
  { tag: 'AC-00318', name: 'Split AC - 2 Ton', type: 'Air Conditioner', site: 'Head Office', building: 'Building A', area: 'Store Room', department: 'Facilities', manufacturer: 'Daikin', model: 'FTKF71', serial: 'DAI-FTKF71-2023-00318' },
  { tag: 'SOL-00462', name: 'Solar Panel - 550W', type: 'Solar Panel', site: 'Building B', building: 'Building B', area: 'Roof', department: 'Engineering', manufacturer: 'Jinko Solar', model: 'Tiger Neo 550', serial: 'JKS-TN550-2024-00462' }
];

/** The demo register, then any shared Asset List records not already present. */
export const ASSET_CATALOG: CatalogAsset[] = [
  ...REGISTER,
  ...ASSET_RECORDS.filter((r) => !REGISTER.some((a) => a.tag === r.tag)).map((r) => {
    const [building, ...rest] = r.area.split(' - ');
    return {
      tag: r.tag,
      name: r.name,
      type: r.type,
      site: r.site,
      building: rest.length ? building! : '',
      area: rest.length ? rest.join(' - ') : r.area,
      department: r.department,
      manufacturer: r.manufacturer,
      model: r.model,
      serial: r.serialNumber ?? '',
      image: r.image
    };
  })
];

export function findCatalogAsset(tag: string | null | undefined): CatalogAsset | undefined {
  const t = (tag ?? '').trim().toLowerCase();
  return t ? ASSET_CATALOG.find((a) => a.tag.toLowerCase() === t) : undefined;
}
