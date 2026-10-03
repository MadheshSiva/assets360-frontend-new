import { Component, ElementRef, HostListener, ViewChild, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Coords, HierarchyNode, Project, SiteHierarchyService } from 'shared-ui';
import { SiteHierarchyLoader } from '../../../services/site-hierarchy-loader.service';
import {
  LucideAngularModule,
  ArrowLeft,
  ArrowRight,
  Box,
  Building,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Cog,
  Cpu,
  Download,
  EllipsisVertical,
  FileCog,
  FileImage,
  FileSpreadsheet,
  FileText,
  Flag,
  Folder,
  House,
  IdCard,
  Images,
  Info,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Maximize,
  Minimize,
  Minus,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  ScanBarcode,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Square,
  SquareCheck,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  UsersRound,
  Wifi,
  X,
} from 'lucide-angular';

interface Step {
  title: string;
  subtitle: string;
}

interface Option {
  label: string;
  value: string;
}

interface StatusOption extends Option {
  color: string;
}

interface SubTypeOption extends Option {
  image?: string;
}

interface Person extends Option {
  initials: string;
  department: string;
}

/** Form fields that hold a location, top to bottom. */
type LocationLevelKey = 'country' | 'site' | 'building' | 'floor' | 'zone' | 'room';

/** Tree levels as the Locating module shows them; the backend's Outer Zone level is skipped. */
type LocationKind = 'project' | 'country' | 'site' | 'building' | 'outdoorZone' | 'floor' | 'zone' | 'subZone';

interface LocationNode {
  /** Id of the node in the shared SiteHierarchyService. */
  id: string;
  label: string;
  kind: LocationKind;
  children: LocationNode[];
  coords: Coords;
  /** Uploaded map image of a floor, zone or sub zone. */
  mapImage?: string;
}

interface LocationModel {
  tree: LocationNode[];
  index: Record<string, LocationNode>;
  parentOf: Record<string, string>;
}

interface LocationLevel {
  key: LocationLevelKey;
  label: string;
  placeholder: string;
  required: boolean;
}

/** A child location drawn on the map, in percent of the image. */
interface PlanPin {
  node: LocationNode;
  x: number;
  y: number;
}

interface AssetImage {
  src: string;
  alt: string;
}

/** A row of the Custom Fields table; organisation fields are fixed, user-added ones can be renamed and removed. */
interface CustomField {
  label: string;
  type: 'text' | 'select' | 'date' | 'textarea';
  value: string;
  options?: Option[];
  maxLength?: number;
  userAdded?: boolean;
}

/** An uploaded file: purchase documents (step 4) or attachments (step 5). */
interface AssetDocument {
  name: string;
  /** Bytes. */
  size: number;
  /** ISO date (yyyy-mm-dd). */
  uploadedAt: string;
  /** Present for files picked in this session; the sample rows have none. */
  file?: File;
}

type DocumentList = 'purchaseDocuments' | 'attachments';

/** Step 5 technical specifications; units sit next to their value. */
interface TechnicalSpecs {
  powerRating: string;
  powerUnit: string;
  voltage: string;
  voltageUnit: string;
  frequency: string;
  frequencyUnit: string;
  phase: string;
  fuelType: string;
  fuelTankCapacity: string;
  fuelTankUnit: string;
  length: string;
  width: string;
  height: string;
  dimensionUnit: string;
  weight: string;
  weightUnit: string;
  temperatureRange: string;
  temperatureUnit: string;
  ipRating: string;
  noiseLevel: string;
  noiseUnit: string;
  lifespan: string;
  lifespanUnit: string;
  remarks: string;
}

/** One cell of the technical specifications grid. */
interface SpecField {
  label: string;
  kind: 'unit' | 'select' | 'dimensions';
  key: keyof TechnicalSpecs;
  inputType?: 'number' | 'text';
  unitKey?: keyof TechnicalSpecs;
  units?: Option[];
  options?: Option[];
}

interface OperationalInfo {
  operatingHours: string;
  operatingHoursUnit: string;
  operatingShift: string;
  utilization: string;
  maintenanceFrequency: string;
  maintenanceFrequencyUnit: string;
  lastMaintenance: string;
  nextMaintenance: string;
  complianceStandards: string[];
}

type InfoTab = 'technical' | 'operational' | 'custom' | 'attachments';

type DocumentType = 'pdf' | 'sheet' | 'image' | 'doc';

/** All registration fields, pre-filled with static sample data until the Assets API is wired up. */
interface AssetForm {
  // Step 1: Basic Information
  assetName: string;
  assetTag: string;
  barcode: string;
  rfidTag: string;
  category: string;
  subCategory: string;
  assetType: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  status: string;
  condition: string;
  criticality: string;
  description: string;
  // Step 2: Classification
  assetSubType: string;
  functionPurpose: string;
  costCenter: string;
  businessUnit: string;
  taggingMethod: string;
  complianceCategory: string;
  lifecycleStage: string;
  keywords: string[];
  // Step 3: Location & Assignment (location fields hold LocationNode ids)
  country: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  room: string;
  department: string;
  assignedTo: string;
  ownershipType: string;
  responsibleTeam: string;
  assignmentStart: string;
  assignmentEnd: string;
  setAsCurrent: boolean;
  // Step 4: Purchase & Warranty (manufacturer is shared with step 1)
  purchaseOrder: string;
  invoiceNumber: string;
  vendor: string;
  purchaseDate: string;
  deliveryDate: string;
  /** Plain number as typed, e.g. "250000"; shown formatted. */
  purchaseCost: string;
  quantity: string;
  unit: string;
  currency: string;
  taxRate: string;
  paymentTerms: string;
  procurementMethod: string;
  projectReference: string;
  remarks: string;
  warrantyType: string;
  warrantyStart: string;
  warrantyPeriod: string;
  warrantyPeriodUnit: 'years' | 'months';
  amcIncluded: boolean;
  supportCoverage: string;
  serviceProvider: string;
  warrantyReference: string;
  // Step 5: Additional Information
  specs: TechnicalSpecs;
  operations: OperationalInfo;
}

const DESCRIPTION_MAX = 500;
const REMARKS_MAX = 500;
const NOTES_MAX = 200;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];
const QR_SIZE = 25;
const PLAN_ZOOM_MIN = 1;
const PLAN_ZOOM_MAX = 3;
const PLAN_ZOOM_STEP = 0.5;

/** Options whose label and value are the same, e.g. units('kVA', 'kW'). */
function units(...labels: string[]): Option[] {
  return labels.map((label) => ({ label, value: label }));
}

const LOCATION_LEVELS: LocationLevelKey[] = ['country', 'site', 'building', 'floor', 'zone', 'room'];

/** Which form field a tree level fills; projects fill none. */
const LEVEL_OF_KIND: Record<LocationKind, LocationLevelKey | null> = {
  project: null,
  country: 'country',
  site: 'site',
  building: 'building',
  outdoorZone: 'zone',
  floor: 'floor',
  zone: 'zone',
  subZone: 'room',
};

const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  project: 'Project',
  country: 'Country',
  site: 'Area',
  building: 'Building',
  outdoorZone: 'Outdoor Zone',
  floor: 'Floor',
  zone: 'Zone',
  subZone: 'Sub Zone',
};

/** Levels that can carry their own map image. */
const MAP_LEVEL_KINDS: LocationKind[] = ['floor', 'zone', 'outdoorZone', 'subZone'];

/** Floor plan the Locating module shows when a level has no uploaded map. */
const DEFAULT_MAP_IMAGE = 'mapp.png';

/**
 * Same shape as the Locating tree: Project -> Country -> Area -> (Outdoor Zone | Building) -> Floor -> Zone -> Sub Zone.
 * Buildings of the backend's Outer Zones sit directly under their Area.
 */
function toLocationNode(node: HierarchyNode, parentKind?: LocationKind): LocationNode {
  const base = { id: node.id, label: node.name, coords: node.coords };
  switch (node.kind) {
    case 'project':
      return { ...base, kind: 'project', children: node.areas.map((a) => toLocationNode(a, 'project')) };
    case 'area':
      return { ...base, kind: 'country', children: node.states.map((s) => toLocationNode(s, 'country')) };
    case 'state':
      return {
        ...base,
        kind: 'site',
        children: [...node.zones, ...node.outerZones.flatMap((o) => o.buildings)].map((c) => toLocationNode(c, 'site')),
      };
    case 'outerZone':
    case 'building': {
      const floors = node.kind === 'building' ? node.floors : node.buildings.flatMap((b) => b.floors);
      return { ...base, kind: 'building', children: floors.map((f) => toLocationNode(f, 'building')) };
    }
    case 'floor':
      return { ...base, kind: 'floor', mapImage: node.mapImage, children: node.zones.map((z) => toLocationNode(z, 'floor')) };
    case 'zone': {
      const kind: LocationKind = parentKind === 'floor' ? 'zone' : parentKind === 'site' ? 'outdoorZone' : 'subZone';
      return { ...base, kind, mapImage: node.mapImage, children: node.zones.map((z) => toLocationNode(z, kind)) };
    }
  }
}

function buildLocationModel(projects: Project[]): LocationModel {
  const tree = projects.map((project) => toLocationNode(project));
  const index: Record<string, LocationNode> = {};
  const parentOf: Record<string, string> = {};
  const walk = (nodes: LocationNode[], parentId?: string) =>
    nodes.forEach((node) => {
      index[node.id] = node;
      if (parentId) parentOf[node.id] = parentId;
      walk(node.children, node.id);
    });
  walk(tree);
  return { tree, index, parentOf };
}

@Component({
  standalone: true,
  selector: 'app-asset-registration',
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './asset-registration.html',
  // Split by step, in cascade order, to keep each stylesheet under the anyComponentStyle budget (20 kB)
  styleUrls: [
    './asset-registration.css',
    './asset-registration-classification-location.css',
    './asset-registration-purchase-additional.css',
  ],
})
export class AssetRegistration {
  readonly icons = {
    ArrowLeft, ArrowRight, Box, Building, Calendar, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList,
    CloudUpload, Cog, Cpu, Download, EllipsisVertical, FileCog, FileImage, FileSpreadsheet, FileText, Flag, Folder, House,
    IdCard, Images, Info, LayoutGrid, ListChecks, MapIcon, MapPin, Maximize, Minimize, Minus, Paperclip, Pencil, Plus,
    Printer, QrCode, RotateCcw,
    ScanBarcode, ScanLine, Search, Settings, ShieldCheck, ShoppingCart, Square, SquareCheck, Tag, Trash2, Upload, User,
    Users, UsersRound, Wifi, X,
  };

  readonly descriptionMax = DESCRIPTION_MAX;

  readonly steps: Step[] = [
    { title: 'Basic Information', subtitle: 'Asset details and identification' },
    { title: 'Classification', subtitle: 'Category and type' },
    { title: 'Location & Assignment', subtitle: 'Where and with whom' },
    { title: 'Purchase & Warranty', subtitle: 'Cost and warranty details' },
    { title: 'Additional Information', subtitle: 'Custom fields and attachments' },
  ];

  currentStep = 0;
  /** Set once the user tries to leave a step with missing fields, so required-field errors only show after that. */
  submitted = false;

  form: AssetForm = {
    assetName: 'Diesel Generator 250 kVA',
    assetTag: 'GEN-00045',
    barcode: 'DG250-2026-00045',
    rfidTag: 'E28011606000020B3C4F8E9A',
    category: 'machinery',
    subCategory: 'power-generation',
    assetType: 'generator',
    model: 'C250D6E',
    manufacturer: 'caterpillar',
    serialNumber: 'CAT2026G45001',
    status: 'active',
    condition: 'good',
    criticality: 'critical',
    description: '250 kVA diesel generator for main plant backup power. Installed at Building A.',
    assetSubType: 'diesel',
    functionPurpose: 'backup-power',
    costCenter: 'fm-001',
    businessUnit: 'head-office',
    taggingMethod: 'barcode',
    complianceCategory: 'safety-critical',
    lifecycleStage: 'in-use',
    keywords: ['generator', 'diesel', 'backup power', 'critical'],
    country: '',
    site: '',
    building: '',
    floor: '',
    zone: '',
    room: '',
    department: 'facilities',
    assignedTo: 'ahmed-basim',
    ownershipType: 'company-owned',
    responsibleTeam: 'mep',
    assignmentStart: '2026-09-01',
    assignmentEnd: '',
    setAsCurrent: true,
    purchaseOrder: 'PO-2026-00458',
    invoiceNumber: 'INV-2026-0789',
    vendor: 'al-futtaim',
    purchaseDate: '2026-06-15',
    deliveryDate: '2026-06-28',
    purchaseCost: '250000',
    quantity: '1',
    unit: 'units',
    currency: 'AED',
    taxRate: '5',
    paymentTerms: '30-days',
    procurementMethod: 'direct',
    projectReference: 'Main Plant Expansion 2026',
    remarks: 'Procured as part of main plant expansion. Includes commissioning and operator training.',
    warrantyType: 'manufacturer',
    warrantyStart: '2026-06-28',
    warrantyPeriod: '5',
    warrantyPeriodUnit: 'years',
    amcIncluded: true,
    supportCoverage: '24x7',
    serviceProvider: 'caterpillar-uae',
    warrantyReference: 'WARR-2026-CAT-001',
    specs: {
      powerRating: '250',
      powerUnit: 'kVA',
      voltage: '400',
      voltageUnit: 'V',
      frequency: '50',
      frequencyUnit: 'Hz',
      phase: '3-phase',
      fuelType: 'diesel',
      fuelTankCapacity: '500',
      fuelTankUnit: 'liters',
      length: '3200',
      width: '1100',
      height: '1800',
      dimensionUnit: 'mm',
      weight: '2500',
      weightUnit: 'kg',
      temperatureRange: '-10 to 50',
      temperatureUnit: 'C',
      ipRating: 'IP23',
      noiseLevel: '75',
      noiseUnit: 'dBA',
      lifespan: '20',
      lifespanUnit: 'years',
      remarks: 'Air cooled diesel generator with automatic transfer switch. Suitable for continuous operation.',
    },
    operations: {
      operatingHours: '8',
      operatingHoursUnit: 'hours',
      operatingShift: '24x7',
      utilization: 'primary',
      maintenanceFrequency: '500',
      maintenanceFrequencyUnit: 'hours',
      lastMaintenance: '2026-09-01',
      nextMaintenance: '2027-03-01',
      complianceStandards: ['iso-8528', 'uae-civil-defence', 'manufacturer'],
    },
  };

  readonly categories: Option[] = [
    { label: 'Machinery & Equipment', value: 'machinery' },
    { label: 'IT & Electronics', value: 'it' },
    { label: 'Vehicles', value: 'vehicles' },
    { label: 'Furniture & Fixtures', value: 'furniture' },
  ];

  readonly subCategoriesByCategory: Record<string, Option[]> = {
    machinery: [
      { label: 'Power Generation', value: 'power-generation' },
      { label: 'HVAC', value: 'hvac' },
      { label: 'Pumps & Compressors', value: 'pumps' },
    ],
    it: [
      { label: 'Laptops', value: 'laptops' },
      { label: 'Servers', value: 'servers' },
      { label: 'Network Devices', value: 'network' },
    ],
    vehicles: [
      { label: 'Trucks', value: 'trucks' },
      { label: 'Forklifts', value: 'forklifts' },
    ],
    furniture: [
      { label: 'Office Furniture', value: 'office' },
      { label: 'Storage', value: 'storage' },
    ],
  };

  readonly assetTypesBySubCategory: Record<string, Option[]> = {
    'power-generation': [
      { label: 'Generator', value: 'generator' },
      { label: 'Transformer', value: 'transformer' },
      { label: 'UPS', value: 'ups' },
      { label: 'Switchgear', value: 'switchgear' },
      { label: 'Control Panel', value: 'control-panel' },
      { label: 'Others', value: 'others' },
    ],
    hvac: [
      { label: 'Chiller', value: 'chiller' },
      { label: 'Air Handling Unit', value: 'ahu' },
      { label: 'Cooling Tower', value: 'cooling-tower' },
    ],
    pumps: [
      { label: 'Compressor', value: 'compressor' },
      { label: 'Pump', value: 'pump' },
      { label: 'Motor', value: 'motor' },
    ],
    laptops: [{ label: 'Laptop', value: 'laptop' }],
    servers: [{ label: 'Rack Server', value: 'rack-server' }, { label: 'Blade Server', value: 'blade-server' }],
    network: [{ label: 'Switch', value: 'switch' }, { label: 'Router', value: 'router' }],
    trucks: [{ label: 'Truck', value: 'truck' }],
    forklifts: [{ label: 'Forklift', value: 'forklift' }],
    office: [{ label: 'Desk', value: 'desk' }, { label: 'Chair', value: 'chair' }],
    storage: [{ label: 'Cabinet', value: 'cabinet' }, { label: 'Rack', value: 'rack' }],
  };

  readonly assetSubTypesByType: Record<string, SubTypeOption[]> = {
    generator: [
      { label: 'Diesel Generator', value: 'diesel', image: 'subtype-diesel-generator.svg' },
      { label: 'Gas Generator', value: 'gas', image: 'subtype-gas-generator.svg' },
      { label: 'UPS Generator', value: 'ups', image: 'subtype-ups-generator.svg' },
      { label: 'Solar Generator', value: 'solar', image: 'subtype-solar-generator.svg' },
    ],
    transformer: [
      { label: 'Step-Up Transformer', value: 'step-up' },
      { label: 'Step-Down Transformer', value: 'step-down' },
      { label: 'Isolation Transformer', value: 'isolation' },
    ],
    ups: [
      { label: 'Online UPS', value: 'online' },
      { label: 'Line-Interactive UPS', value: 'line-interactive' },
    ],
  };

  readonly manufacturers: Option[] = [
    { label: 'Caterpillar', value: 'caterpillar' },
    { label: 'Cummins', value: 'cummins' },
    { label: 'Kohler', value: 'kohler' },
    { label: 'Siemens', value: 'siemens' },
  ];

  readonly statuses: StatusOption[] = [
    { label: 'Active', value: 'active', color: '#16a34a' },
    { label: 'Inactive', value: 'inactive', color: '#94a3b8' },
    { label: 'Under Maintenance', value: 'maintenance', color: '#f59e0b' },
    { label: 'Retired', value: 'retired', color: '#64748b' },
  ];

  readonly conditions: StatusOption[] = [
    { label: 'Excellent', value: 'excellent', color: '#15803d' },
    { label: 'Good', value: 'good', color: '#16a34a' },
    { label: 'Fair', value: 'fair', color: '#f59e0b' },
    { label: 'Poor', value: 'poor', color: '#dc2626' },
  ];

  readonly criticalities: StatusOption[] = [
    { label: 'Critical', value: 'critical', color: '#dc2626' },
    { label: 'High', value: 'high', color: '#f97316' },
    { label: 'Medium', value: 'medium', color: '#f59e0b' },
    { label: 'Low', value: 'low', color: '#16a34a' },
  ];

  readonly functionPurposes: Option[] = [
    { label: 'Backup Power', value: 'backup-power' },
    { label: 'Primary Power', value: 'primary-power' },
    { label: 'Production', value: 'production' },
    { label: 'Support / Utility', value: 'utility' },
  ];

  readonly costCenters: Option[] = [
    { label: 'FM-001 - Building Operations', value: 'fm-001' },
    { label: 'OP-010 - Plant Operations', value: 'op-010' },
    { label: 'MT-020 - Maintenance', value: 'mt-020' },
  ];

  readonly businessUnits: Option[] = [
    { label: 'Head Office', value: 'head-office' },
    { label: 'Manufacturing', value: 'manufacturing' },
    { label: 'Logistics', value: 'logistics' },
  ];

  readonly taggingMethods: Option[] = [
    { label: 'Barcode', value: 'barcode' },
    { label: 'RFID', value: 'rfid' },
    { label: 'BLE', value: 'ble' },
    { label: 'QR Code', value: 'qr' },
  ];

  readonly complianceCategories: Option[] = [
    { label: 'Safety Critical Equipment', value: 'safety-critical' },
    { label: 'Environmental', value: 'environmental' },
    { label: 'Regulatory Inspection', value: 'regulatory' },
    { label: 'Not Applicable', value: 'none' },
  ];

  readonly lifecycleStages: Option[] = [
    { label: 'Planned', value: 'planned' },
    { label: 'Procured', value: 'procured' },
    { label: 'In Use', value: 'in-use' },
    { label: 'Under Repair', value: 'under-repair' },
    { label: 'Retired', value: 'retired' },
  ];

  /** Text typed into the keywords input before it becomes a chip. */
  keywordDraft = '';

  // ===== Step 3: Location & Assignment =====

  private readonly hierarchy = inject(SiteHierarchyService);
  private readonly hierarchyLoader = inject(SiteHierarchyLoader);

  /** The Locating module's hierarchy, reshaped for the tree, the dropdowns and the map. */
  private readonly locationModel = computed(() => buildLocationModel(this.hierarchy.projects()));

  readonly locationLevels: LocationLevel[] = [
    { key: 'country', label: 'Country', placeholder: 'Select country', required: true },
    { key: 'site', label: 'Site', placeholder: 'Select site', required: true },
    { key: 'building', label: 'Building', placeholder: 'Select building', required: true },
    { key: 'floor', label: 'Floor', placeholder: 'Select floor', required: true },
    { key: 'zone', label: 'Zone / Area', placeholder: 'Select zone / area', required: false },
    { key: 'room', label: 'Room / Location', placeholder: 'Select room', required: false },
  ];

  /** Ids of tree nodes the user has expanded. */
  expandedLocations = new Set<string>();
  locationQuery = '';
  locationView: 'hierarchy' | 'map' = 'hierarchy';
  planZoom = PLAN_ZOOM_MIN;
  isPlanFullscreen = false;

  readonly departments: Option[] = [
    { label: 'Facilities Management', value: 'facilities' },
    { label: 'Operations', value: 'operations' },
    { label: 'Maintenance', value: 'maintenance' },
  ];
  readonly people: Person[] = [
    { label: 'Ahmed Basim', value: 'ahmed-basim', initials: 'AB', department: 'facilities' },
    { label: 'Rex Kumar', value: 'rex-kumar', initials: 'RK', department: 'facilities' },
    { label: 'Priya Nair', value: 'priya-nair', initials: 'PN', department: 'operations' },
    { label: 'Omar Haddad', value: 'omar-haddad', initials: 'OH', department: 'maintenance' },
  ];

  readonly ownershipTypes: Option[] = [
    { label: 'Company Owned', value: 'company-owned' },
    { label: 'Leased', value: 'leased' },
    { label: 'Rented', value: 'rented' },
    { label: 'Customer Owned', value: 'customer-owned' },
  ];

  readonly teams: Option[] = [
    { label: 'MEP Team', value: 'mep' },
    { label: 'Electrical Team', value: 'electrical' },
    { label: 'HVAC Team', value: 'hvac' },
    { label: 'Operations Team', value: 'operations' },
    { label: 'Maintenance Team', value: 'maintenance' },
  ];

  private readonly defaultTeamByDepartment: Record<string, string> = {
    facilities: 'mep',
    operations: 'operations',
    maintenance: 'maintenance',
  };

  // ===== Step 4: Purchase & Warranty =====

  readonly remarksMax = REMARKS_MAX;

  readonly vendors: Option[] = [
    { label: 'Al-Futtaim Power Systems LLC', value: 'al-futtaim' },
    { label: 'PowerGen Solutions LLC', value: 'powergen' },
    { label: 'Emirates Electrical Supplies', value: 'emirates-electrical' },
  ];

  readonly units: Option[] = [
    { label: 'Unit(s)', value: 'units' },
    { label: 'Set(s)', value: 'sets' },
    { label: 'Lot(s)', value: 'lots' },
  ];

  readonly currencies: Option[] = [
    { label: 'AED - UAE Dirham', value: 'AED' },
    { label: 'SAR - Saudi Riyal', value: 'SAR' },
    { label: 'USD - US Dollar', value: 'USD' },
    { label: 'EUR - Euro', value: 'EUR' },
  ];

  /** Standard VAT per currency's country, used by the tax reset button. */
  private readonly defaultVatByCurrency: Record<string, string> = { AED: '5', SAR: '15', USD: '0', EUR: '0' };

  readonly paymentTermsOptions: Option[] = [
    { label: 'Advance Payment', value: 'advance' },
    { label: '15 Days', value: '15-days' },
    { label: '30 Days', value: '30-days' },
    { label: '45 Days', value: '45-days' },
    { label: '60 Days', value: '60-days' },
  ];

  readonly procurementMethods: Option[] = [
    { label: 'Direct Purchase', value: 'direct' },
    { label: 'Tender', value: 'tender' },
    { label: 'Lease', value: 'lease' },
    { label: 'Internal Transfer', value: 'transfer' },
  ];

  readonly warrantyTypes: Option[] = [
    { label: 'Manufacturer Warranty', value: 'manufacturer' },
    { label: 'Extended Warranty', value: 'extended' },
    { label: 'Vendor Warranty', value: 'vendor' },
    { label: 'No Warranty', value: 'none' },
  ];

  readonly warrantyPeriodUnits: Option[] = [
    { label: 'Year(s)', value: 'years' },
    { label: 'Month(s)', value: 'months' },
  ];

  readonly supportCoverages: Option[] = [
    { label: '24x7', value: '24x7' },
    { label: 'Business Hours (8x5)', value: '8x5' },
    { label: 'On-Call', value: 'on-call' },
  ];

  readonly serviceProviders: Option[] = [
    { label: 'Caterpillar (UAE)', value: 'caterpillar-uae' },
    { label: 'Al-Futtaim Power Systems LLC', value: 'al-futtaim' },
    { label: 'In-house Maintenance', value: 'in-house' },
  ];

  /** True while the cost box has focus, so it shows the raw number instead of "250,000.00". */
  costEditing = false;

  purchaseDocuments: AssetDocument[] = [
    { name: 'Purchase Invoice_INV-2026-0789.pdf', size: 1258291, uploadedAt: '2026-06-15' },
    { name: 'Purchase Order_PO-2026-00458.xlsx', size: 870400, uploadedAt: '2026-06-10' },
    { name: 'Delivery Note_DN-2026-0456.pdf', size: 634880, uploadedAt: '2026-06-28' },
  ];
  /** The document list a file is being dragged over. */
  draggingList: DocumentList | null = null;
  /** "list:index" of the document whose "more" menu is open. */
  docMenuKey: string | null = null;

  // ===== Step 5: Additional Information =====

  readonly infoTabs: { key: InfoTab; label: string; icon: typeof Cog }[] = [
    { key: 'technical', label: 'Technical Details', icon: Cog },
    { key: 'operational', label: 'Operational Details', icon: ClipboardList },
    { key: 'custom', label: 'Custom Fields', icon: LayoutGrid },
    { key: 'attachments', label: 'Attachments', icon: Paperclip },
  ];
  /** The right column shows Operational + Custom Fields, except whichever one is open in a tab on the left. */
  activeInfoTab: InfoTab = 'technical';

  readonly technicalRemarksMax = REMARKS_MAX;
  readonly notesMax = NOTES_MAX;

  readonly specFields: SpecField[] = [
    { label: 'Power Rating', kind: 'unit', key: 'powerRating', unitKey: 'powerUnit', units: units('kVA', 'kW', 'HP') },
    { label: 'Voltage', kind: 'unit', key: 'voltage', unitKey: 'voltageUnit', units: units('V', 'kV') },
    { label: 'Frequency', kind: 'unit', key: 'frequency', unitKey: 'frequencyUnit', units: units('Hz') },
    {
      label: 'Phase', kind: 'select', key: 'phase',
      options: [{ label: 'Single Phase', value: '1-phase' }, { label: '3 Phase', value: '3-phase' }],
    },
    {
      label: 'Fuel Type', kind: 'select', key: 'fuelType',
      options: [
        { label: 'Diesel', value: 'diesel' },
        { label: 'Petrol', value: 'petrol' },
        { label: 'Natural Gas', value: 'gas' },
        { label: 'Electric', value: 'electric' },
        { label: 'Not Applicable', value: 'na' },
      ],
    },
    {
      label: 'Fuel Tank Capacity', kind: 'unit', key: 'fuelTankCapacity', unitKey: 'fuelTankUnit',
      units: [{ label: 'Liters', value: 'liters' }, { label: 'Gallons', value: 'gallons' }],
    },
    { label: 'Dimensions (L × W × H)', kind: 'dimensions', key: 'length', unitKey: 'dimensionUnit', units: units('mm', 'cm', 'm') },
    { label: 'Weight', kind: 'unit', key: 'weight', unitKey: 'weightUnit', units: units('kg', 'ton') },
    {
      label: 'Operating Temperature Range', kind: 'unit', key: 'temperatureRange', inputType: 'text', unitKey: 'temperatureUnit',
      units: [{ label: '°C', value: 'C' }, { label: '°F', value: 'F' }],
    },
    {
      label: 'IP Rating', kind: 'select', key: 'ipRating',
      options: units('IP20', 'IP23', 'IP44', 'IP54', 'IP55', 'IP65', 'IP66', 'IP67'),
    },
    { label: 'Noise Level', kind: 'unit', key: 'noiseLevel', unitKey: 'noiseUnit', units: [{ label: 'dB(A)', value: 'dBA' }] },
    {
      label: 'Expected Lifespan', kind: 'unit', key: 'lifespan', unitKey: 'lifespanUnit',
      units: [{ label: 'Year(s)', value: 'years' }, { label: 'Month(s)', value: 'months' }],
    },
  ];

  readonly hourUnits: Option[] = [{ label: 'Hours', value: 'hours' }];
  readonly maintenanceUnits: Option[] = [
    { label: 'Hours', value: 'hours' },
    { label: 'Days', value: 'days' },
    { label: 'Months', value: 'months' },
  ];
  readonly operatingShifts: Option[] = [
    { label: '24x7', value: '24x7' },
    { label: 'Day Shift', value: 'day' },
    { label: 'Night Shift', value: 'night' },
    { label: 'Two Shifts', value: 'two-shifts' },
  ];
  readonly utilizations: Option[] = [
    { label: 'Primary', value: 'primary' },
    { label: 'Standby', value: 'standby' },
    { label: 'Backup', value: 'backup' },
  ];
  readonly complianceOptions: Option[] = [
    { label: 'ISO 8528', value: 'iso-8528' },
    { label: 'UAE Civil Defence', value: 'uae-civil-defence' },
    { label: 'Manufacturer Standard', value: 'manufacturer' },
    { label: 'IEC 60034', value: 'iec-60034' },
    { label: 'NFPA 110', value: 'nfpa-110' },
  ];

  customFields: CustomField[] = [
    {
      label: 'Asset Criticality Level', type: 'select', value: 'critical',
      options: [
        { label: 'Critical', value: 'critical' },
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
      ],
    },
    {
      label: 'Environmental Impact', type: 'select', value: 'high',
      options: [{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }],
    },
    { label: 'Installation Date', type: 'date', value: '2026-06-15' },
    { label: 'Commissioning Date', type: 'date', value: '2026-06-20' },
    {
      label: 'Asset Color', type: 'select', value: 'yellow',
      options: units('Yellow', 'White', 'Grey', 'Black', 'Green').map((o) => ({ ...o, value: o.value.toLowerCase() })),
    },
    { label: 'Notes', type: 'textarea', value: 'Installed near main entrance. Fire rated enclosure.', maxLength: NOTES_MAX },
  ];

  attachments: AssetDocument[] = [
    { name: 'Installation_Certificate.pdf', size: 1258291, uploadedAt: '2026-06-20' },
    { name: 'Operation_Manual_C250D6E.pdf', size: 5033165, uploadedAt: '2026-06-20' },
  ];

  images: AssetImage[] = [
    { src: 'asset-generator.svg', alt: 'Diesel generator, front view' },
    { src: 'asset-generator-panel.svg', alt: 'Generator control panel' },
    { src: 'asset-generator.svg', alt: 'Diesel generator, side view' },
  ];
  activeImageIndex = 0;

  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;

  /** Dark-module path of the preview QR pattern, regenerated from the asset tag. */
  qrPath = '';
  readonly qrSize = QR_SIZE;

  toastMessage = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly router: Router) {
    this.generateQr();
    this.ensureLocationSelection();
    this.loadLocations();
  }

  // ===== Lookups for the template =====

  get subCategories(): Option[] {
    return this.subCategoriesByCategory[this.form.category] ?? [];
  }

  get assetTypes(): Option[] {
    return this.assetTypesBySubCategory[this.form.subCategory] ?? [];
  }

  get assetSubTypes(): SubTypeOption[] {
    return this.assetSubTypesByType[this.form.assetType] ?? [];
  }

  /** Sub types that have a picture, shown as tiles in the Category Reference card. */
  get assetSubTypeTiles(): SubTypeOption[] {
    return this.assetSubTypes.filter((o) => o.image);
  }

  labelOf(options: Option[], value: string): string {
    return options.find((o) => o.value === value)?.label ?? '—';
  }

  colorOf(options: StatusOption[], value: string): string {
    return options.find((o) => o.value === value)?.color ?? '#cbd5e1';
  }

  get activeImage(): AssetImage | undefined {
    return this.images[this.activeImageIndex];
  }

  /** Thumbnails beside the main image: the next two images after the active one. */
  get thumbnails(): { image: AssetImage; index: number }[] {
    return this.images
      .map((image, index) => ({ image, index }))
      .filter(({ index }) => index !== this.activeImageIndex)
      .slice(0, 2);
  }

  onCategoryChange(): void {
    this.form.subCategory = this.subCategories[0]?.value ?? '';
    this.onSubCategoryChange();
  }

  onSubCategoryChange(): void {
    this.form.assetType = this.assetTypes[0]?.value ?? '';
    this.onAssetTypeChange();
  }

  onAssetTypeChange(): void {
    this.form.assetSubType = this.assetSubTypes[0]?.value ?? '';
  }

  selectAssetType(value: string): void {
    if (this.form.assetType === value) return;
    this.form.assetType = value;
    this.onAssetTypeChange();
  }

  /** Scrolls a form control into view and focuses it (used by "Change Category" / "Edit" buttons). */
  focusField(id: string): void {
    const control = document.getElementById(id);
    control?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    control?.focus({ preventScroll: true });
  }

  manageCategories(level: string): void {
    this.showToast(`Manage ${level} options from Administration > Configuration.`);
  }

  // ===== Location =====

  get locationTree(): LocationNode[] {
    return this.locationModel().tree;
  }

  /** Refreshes the shared hierarchy from the backend, the same data the Locating module shows. */
  private loadLocations(): void {
    this.hierarchyLoader.load().subscribe({
      next: () => this.ensureLocationSelection(),
      error: () => this.showToast('Could not load locations from the server. Showing the locations already loaded.'),
    });
  }

  /** Keeps the chosen location if it still exists after a reload, otherwise picks the first zone of the first floor. */
  private ensureLocationSelection(): void {
    const { index } = this.locationModel();
    const allKnown = LOCATION_LEVELS.every((level) => !this.form[level] || index[this.form[level]]);
    if (this.selectedLocation && allKnown) {
      this.selectLocation(this.selectedLocation);
      return;
    }
    const floor = this.findFirst(this.locationTree, 'floor');
    this.selectLocation(floor?.children[0] ?? floor ?? this.findFirst(this.locationTree, 'country'));
  }

  private findFirst(nodes: LocationNode[], kind: LocationKind): LocationNode | undefined {
    for (const node of nodes) {
      const found = node.kind === kind ? node : this.findFirst(node.children, kind);
      if (found) return found;
    }
    return undefined;
  }

  /** Root-to-node chain, including the node. */
  private ancestorsOf(node: LocationNode): LocationNode[] {
    const { index, parentOf } = this.locationModel();
    const chain = [node];
    for (let id = parentOf[node.id]; id; id = parentOf[id]) chain.unshift(index[id]);
    return chain;
  }

  /** Options for a location dropdown: the matching children of the nearest filled level above it. */
  locationOptions(levelIndex: number): LocationNode[] {
    const { index, tree } = this.locationModel();
    let parent: LocationNode | undefined;
    for (let i = levelIndex - 1; i >= 0 && !parent; i--) parent = index[this.form[LOCATION_LEVELS[i]]];
    const pool = parent ? parent.children : tree.flatMap((project) => project.children);
    return pool.filter((node) => LEVEL_OF_KIND[node.kind] === LOCATION_LEVELS[levelIndex]);
  }

  /** A dropdown changed: clear the levels below it and reveal the choice in the tree. */
  onLocationLevelChange(levelIndex: number): void {
    const node = this.locationModel().index[this.form[LOCATION_LEVELS[levelIndex]]];
    if (node) this.selectLocation(node);
  }

  /** Projects only group countries, so clicking one just expands or collapses it. */
  onLocationClick(node: LocationNode): void {
    if (node.kind === 'project') this.toggleLocation(node);
    else this.selectLocation(node);
  }

  /** Selects a node and fills every level down to it; deeper levels are cleared. */
  selectLocation(node: LocationNode | undefined): void {
    const previousMap = this.mapLevel?.id;
    LOCATION_LEVELS.forEach((level) => (this.form[level] = ''));
    if (!node) return;
    for (const n of this.ancestorsOf(node)) {
      const level = LEVEL_OF_KIND[n.kind];
      if (level) this.form[level] = n.id;
      this.expandedLocations.add(n.id);
    }
    if (this.mapLevel?.id !== previousMap) this.planZoom = PLAN_ZOOM_MIN;
  }

  toggleLocation(node: LocationNode): void {
    if (this.expandedLocations.has(node.id)) this.expandedLocations.delete(node.id);
    else this.expandedLocations.add(node.id);
  }

  isLocationExpanded(node: LocationNode): boolean {
    return !!this.locationQuery.trim() || this.expandedLocations.has(node.id);
  }

  /** While searching, only nodes that match (or have a matching descendant) are shown. */
  visibleLocations(nodes: LocationNode[]): LocationNode[] {
    const query = this.locationQuery.trim().toLowerCase();
    if (!query) return nodes;
    const matches = (node: LocationNode): boolean =>
      node.label.toLowerCase().includes(query) || node.children.some(matches);
    return nodes.filter(matches);
  }

  /** Same level icons as the Locating tree; floors and zones keep the check box style. */
  locationIcon(node: LocationNode) {
    switch (node.kind) {
      case 'project':
        return this.icons.Folder;
      case 'country':
        return this.icons.Flag;
      case 'site':
        return this.icons.MapIcon;
      case 'building':
        return this.icons.Building;
      default:
        return this.isCheckedLocation(node) ? this.icons.SquareCheck : this.icons.Square;
    }
  }

  /** Floors and zones show a filled check box when they are the selected location. */
  isCheckedLocation(node: LocationNode): boolean {
    return MAP_LEVEL_KINDS.includes(node.kind) && node.id === this.selectedLocation?.id;
  }

  /** Outdoor zones hang off an Area directly, so they have no building or floor. */
  get isOutdoorLocation(): boolean {
    return this.locationModel().index[this.form.zone]?.kind === 'outdoorZone';
  }

  isLevelRequired(level: LocationLevel): boolean {
    return level.required && !(this.isOutdoorLocation && (level.key === 'building' || level.key === 'floor'));
  }

  /** Nodes for the filled levels, top to bottom. */
  get locationPath(): LocationNode[] {
    const { index } = this.locationModel();
    return LOCATION_LEVELS.map((level) => index[this.form[level]]).filter((n): n is LocationNode => !!n);
  }

  get locationPathText(): string {
    return this.locationPath.map((n) => n.label).join(' > ');
  }

  /** Deepest selected node. */
  get selectedLocation(): LocationNode | undefined {
    return this.locationPath[this.locationPath.length - 1];
  }

  /**
   * The level whose map is shown: the nearest selected floor / zone / sub zone with an uploaded map,
   * otherwise the selected floor (or outdoor zone) on the default plan.
   */
  get mapLevel(): LocationNode | undefined {
    const selected = this.selectedLocation;
    if (!selected) return undefined;
    const chain = this.ancestorsOf(selected);
    return (
      [...chain].reverse().find((n) => MAP_LEVEL_KINDS.includes(n.kind) && n.mapImage) ??
      chain.find((n) => n.kind === 'floor') ??
      chain.find((n) => n.kind === 'outdoorZone')
    );
  }

  get mapImageSrc(): string {
    return this.mapLevel?.mapImage || DEFAULT_MAP_IMAGE;
  }

  /** e.g. "Street One - Third Right" for a floor, "Third Right - Second Colony" for a zone map. */
  get planTitle(): string {
    const level = this.mapLevel;
    if (!level) return 'Floor Plan';
    const parent = this.locationModel().index[this.locationModel().parentOf[level.id]];
    return parent ? `${parent.label} - ${level.label}` : level.label;
  }

  /**
   * Children of the shown map, placed the way the Locating floor plan places zone pins: their coordinates
   * normalised into the 10-90% box. Backend zones inherit their parent's coordinates, so when they all
   * coincide they are laid out on an even grid instead of stacking on one spot.
   */
  get planPins(): PlanPin[] {
    const children = this.mapLevel?.children ?? [];
    if (!children.length) return [];
    const lats = children.map((c) => c.coords.lat);
    const lngs = children.map((c) => c.coords.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const latRange = maxLat - minLat;
    const lngRange = Math.max(...lngs) - minLng;
    if (latRange || lngRange) {
      return children.map((node) => ({
        node,
        x: 10 + ((node.coords.lng - minLng) / (lngRange || 1)) * 80,
        y: 10 + ((maxLat - node.coords.lat) / (latRange || 1)) * 80,
      }));
    }
    const cols = Math.ceil(Math.sqrt(children.length));
    const rows = Math.ceil(children.length / cols);
    return children.map((node, i) => ({
      node,
      x: 10 + (((i % cols) + 0.5) / cols) * 80,
      y: 10 + ((Math.floor(i / cols) + 0.5) / rows) * 80,
    }));
  }

  /** The pin on the shown map that is, or contains, the selected location. */
  get selectedPin(): PlanPin | undefined {
    const selected = this.selectedLocation;
    if (!selected) return undefined;
    const chainIds = new Set(this.ancestorsOf(selected).map((n) => n.id));
    return this.planPins.find((pin) => chainIds.has(pin.node.id));
  }

  /** Callout subtitle: the selected location inside the pin, or the pin's level name. */
  pinSubtitle(pin: PlanPin): string {
    const selected = this.selectedLocation;
    return selected && selected.id !== pin.node.id ? selected.label : LOCATION_KIND_LABELS[pin.node.kind];
  }

  /** Keeps the callout inside the map near its edges. */
  popupPlacement(pin: { x: number; y: number } | undefined): Record<string, boolean> {
    return {
      'is-left': !!pin && pin.x > 65,
      'is-right': !!pin && pin.x < 30,
      'is-above': !!pin && pin.y > 60,
    };
  }

  zoomPlan(direction: 1 | -1): void {
    this.planZoom = Math.min(PLAN_ZOOM_MAX, Math.max(PLAN_ZOOM_MIN, this.planZoom + direction * PLAN_ZOOM_STEP));
  }

  get canZoomIn(): boolean {
    return this.planZoom < PLAN_ZOOM_MAX;
  }

  get canZoomOut(): boolean {
    return this.planZoom > PLAN_ZOOM_MIN;
  }

  togglePlanFullscreen(panel: HTMLElement): void {
    if (document.fullscreenElement) document.exitFullscreen();
    else panel.requestFullscreen?.().catch(() => this.showToast('Full screen is not available in this browser.'));
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isPlanFullscreen = !!document.fullscreenElement;
  }

  // ===== Assignment =====

  get assignedPerson(): Person | undefined {
    return this.people.find((p) => p.value === this.form.assignedTo);
  }

  resetResponsibleTeam(): void {
    this.form.responsibleTeam = this.defaultTeamByDepartment[this.form.department] ?? '';
    const team = this.labelOf(this.teams, this.form.responsibleTeam);
    this.showToast(this.form.responsibleTeam ? `Responsible team reset to ${team}.` : 'No default team for this department.');
  }

  /** Opens the browser date picker for the hidden native input behind a formatted date control. */
  openDatePicker(input: HTMLInputElement): void {
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  // ===== Purchase =====

  /** "250000" -> "250,000.00"; empty or invalid input stays empty. */
  formatAmount(value: string | number): string {
    const amount = typeof value === 'number' ? value : parseFloat(value);
    if (value === '' || isNaN(amount)) return '';
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onCostInput(event: Event): void {
    this.form.purchaseCost = (event.target as HTMLInputElement).value.replace(/[^0-9.]/g, '');
  }

  /** Cost x quantity, plus VAT. */
  get totalCost(): number | '' {
    const cost = parseFloat(this.form.purchaseCost);
    if (isNaN(cost)) return '';
    const quantity = parseFloat(this.form.quantity) || 0;
    const tax = parseFloat(this.form.taxRate) || 0;
    return cost * quantity * (1 + tax / 100);
  }

  resetTaxRate(): void {
    this.form.taxRate = this.defaultVatByCurrency[this.form.currency] ?? '0';
    this.showToast(`VAT reset to ${this.form.taxRate}% for ${this.form.currency}.`);
  }

  // ===== Warranty =====

  /** Start date plus the warranty period, minus one day (5 years from 28 Jun 2026 ends 27 Jun 2031). */
  get warrantyEnd(): string {
    const period = parseInt(this.form.warrantyPeriod, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.form.warrantyStart);
    if (!match || !(period > 0) || this.form.warrantyType === 'none') return '';
    const [year, month, day] = match.slice(1).map(Number);
    const months = this.form.warrantyPeriodUnit === 'years' ? period * 12 : period;
    const end = new Date(year, month - 1 + months, day - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  }

  // ===== Purchase documents =====

  docType(doc: AssetDocument): DocumentType {
    const ext = doc.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
    return 'doc';
  }

  docIcon(doc: AssetDocument) {
    const icons = { pdf: this.icons.FileText, sheet: this.icons.FileSpreadsheet, image: this.icons.FileImage, doc: this.icons.FileText };
    return icons[this.docType(doc)];
  }

  formatFileSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  documentsOf(list: DocumentList): AssetDocument[] {
    return this[list];
  }

  openDocumentPicker(list: DocumentList): void {
    document.getElementById(`doc-input-${list}`)?.click();
  }

  onDocumentsSelected(event: Event, list: DocumentList): void {
    const input = event.target as HTMLInputElement;
    this.addDocuments(list, Array.from(input.files ?? []));
    input.value = '';
  }

  onDocDragOver(event: DragEvent, list: DocumentList): void {
    event.preventDefault();
    this.draggingList = list;
  }

  onDocDrop(event: DragEvent, list: DocumentList): void {
    event.preventDefault();
    this.draggingList = null;
    this.addDocuments(list, Array.from(event.dataTransfer?.files ?? []));
  }

  /** Adds allowed files (type + 10 MB limit) and reports the rest. */
  private addDocuments(list: DocumentList, files: File[]): void {
    const today = new Date();
    const uploadedAt = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const accepted: AssetDocument[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (DOCUMENT_EXTENSIONS.includes(ext) && file.size <= DOCUMENT_MAX_BYTES) {
        accepted.push({ name: file.name, size: file.size, uploadedAt, file });
      } else {
        rejected.push(file.name);
      }
    }
    this[list] = [...this[list], ...accepted];
    if (rejected.length) {
      this.showToast(`Not added (only PDF, JPG, PNG, DOC, XLS up to 10 MB): ${rejected.join(', ')}`);
    } else if (accepted.length) {
      this.showToast(`${accepted.length} file${accepted.length > 1 ? 's' : ''} added.`);
    }
  }

  downloadDocument(doc: AssetDocument): void {
    this.docMenuKey = null;
    if (!doc.file) {
      this.showToast(`${doc.name} is sample data and has no file to download.`);
      return;
    }
    const url = URL.createObjectURL(doc.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  removeDocument(list: DocumentList, index: number): void {
    this.docMenuKey = null;
    this[list] = this[list].filter((_, i) => i !== index);
  }

  toggleDocMenu(key: string): void {
    this.docMenuKey = this.docMenuKey === key ? null : key;
  }

  /** Closes the document menu on any click outside it. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.docMenuKey !== null && !(event.target as HTMLElement).closest('.doc-menu-wrap')) {
      this.docMenuKey = null;
    }
  }

  // ===== Keywords / tags =====

  addKeyword(event?: Event): void {
    event?.preventDefault();
    const keyword = this.keywordDraft.replace(/,/g, ' ').trim();
    if (keyword && !this.form.keywords.some((k) => k.toLowerCase() === keyword.toLowerCase())) {
      this.form.keywords = [...this.form.keywords, keyword];
    }
    this.keywordDraft = '';
  }

  removeKeyword(index: number): void {
    this.form.keywords = this.form.keywords.filter((_, i) => i !== index);
  }

  onKeywordBackspace(): void {
    if (!this.keywordDraft && this.form.keywords.length) this.removeKeyword(this.form.keywords.length - 1);
  }

  // ===== Step navigation =====

  /** Required fields per step (marked with a red asterisk); steps without an entry have none. */
  private readonly requiredByStep: (keyof AssetForm)[][] = [
    ['assetName', 'assetTag', 'category', 'subCategory', 'assetType', 'status'],
    ['category', 'subCategory', 'assetType', 'criticality', 'department', 'taggingMethod', 'lifecycleStage'],
    ['country', 'site', 'building', 'floor', 'department'],
    ['purchaseOrder', 'vendor', 'manufacturer', 'purchaseDate', 'purchaseCost', 'quantity'],
  ];

  isInvalid(field: keyof AssetForm): boolean {
    return (
      this.submitted &&
      this.requiredByStep.some((fields) => fields.includes(field)) &&
      this.isMissing(field)
    );
  }

  private isMissing(field: keyof AssetForm): boolean {
    if ((field === 'building' || field === 'floor') && this.isOutdoorLocation) return false;
    return !String(this.form[field]).trim();
  }

  private stepValid(step: number): boolean {
    return (this.requiredByStep[step] ?? []).every((field) => !this.isMissing(field));
  }

  /** First step before `index` with a missing required field, or -1. */
  private firstInvalidStepBefore(index: number): number {
    for (let step = 0; step < index; step++) {
      if (!this.stepValid(step)) return step;
    }
    return -1;
  }

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  goToStep(index: number): void {
    const invalidStep = this.firstInvalidStepBefore(index);
    if (invalidStep !== -1) {
      this.submitted = true;
      this.currentStep = invalidStep;
      this.showToast('Fill in the required fields first.');
      return;
    }
    this.currentStep = index;
  }

  next(): void {
    if (this.isLastStep) {
      this.register();
      return;
    }
    this.goToStep(this.currentStep + 1);
  }

  previous(): void {
    if (this.currentStep > 0) this.currentStep--;
  }

  private register(): void {
    if (this.firstInvalidStepBefore(this.steps.length) !== -1) {
      this.goToStep(this.steps.length);
      return;
    }
    this.showToast(`${this.form.assetName} (${this.form.assetTag}) registered.`);
  }

  saveDraft(): void {
    this.showToast('Draft saved.');
  }

  backToList(): void {
    this.router.navigateByUrl('/assets/list');
  }

  // ===== Images =====

  openImagePicker(): void {
    this.imageInput?.nativeElement.click();
  }

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    Array.from(input.files ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          this.images = [...this.images, { src: String(reader.result), alt: file.name }];
          this.activeImageIndex = this.images.length - 1;
        };
        reader.readAsDataURL(file);
      });
    input.value = '';
  }

  // ===== Identification =====

  /** Builds a QR-style preview pattern from the asset tag (visual placeholder, not a scannable code). */
  generateQr(): void {
    const size = QR_SIZE;
    let seed = 0;
    for (const ch of this.form.assetTag + this.form.barcode) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const inFinder = (x: number, y: number) =>
      (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
    const finderDark = (x: number, y: number) => {
      const fx = x >= size - 8 ? x - (size - 7) : x;
      const fy = y >= size - 8 ? y - (size - 7) : y;
      if (fx < 0 || fy < 0 || fx > 6 || fy > 6) return false; // separator
      const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3));
      return ring !== 2;
    };

    let path = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = inFinder(x, y) ? finderDark(x, y) : random() > 0.52;
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      }
    }
    this.qrPath = path;
  }

  onGenerateQr(): void {
    this.generateQr();
    this.showToast('QR code generated for ' + this.form.assetTag + '.');
  }

  scanBarcode(): void {
    this.showToast('Scanner not connected. Demo barcode kept: ' + this.form.barcode);
  }

  readRfid(): void {
    this.showToast('RFID reader not connected. Demo tag kept: ' + this.form.rfidTag);
  }

  printLabel(): void {
    this.showToast('Label for ' + this.form.assetTag + ' sent to printer (demo).');
  }

  // ===== Step 5 =====

  /** Compliance standards not yet chosen, for the "add" dropdown. */
  get availableCompliance(): Option[] {
    return this.complianceOptions.filter((o) => !this.form.operations.complianceStandards.includes(o.value));
  }

  addCompliance(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value) {
      this.form.operations.complianceStandards = [...this.form.operations.complianceStandards, select.value];
    }
    select.value = '';
  }

  removeCompliance(value: string): void {
    this.form.operations.complianceStandards = this.form.operations.complianceStandards.filter((v) => v !== value);
  }

  addCustomField(): void {
    this.customFields = [...this.customFields, { label: '', type: 'text', value: '', userAdded: true }];
    const index = this.customFields.length - 1;
    // Wait for the new row to render, then put the cursor in its name box
    setTimeout(() => document.getElementById(`cf-name-${index}`)?.focus());
  }

  removeCustomField(index: number): void {
    this.customFields = this.customFields.filter((_, i) => i !== index);
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastMessage = ''), 3000);
  }
}
