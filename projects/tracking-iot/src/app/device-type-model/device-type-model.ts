import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  Battery,
  Bluetooth,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Copy,
  Cpu,
  DoorOpen,
  Download,
  Droplet,
  Ellipsis,
  EthernetPort,
  ExternalLink,
  Gauge,
  Info,
  Layers,
  MapPin,
  Move,
  Navigation,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Rotate3d,
  Router,
  ScanLine,
  Search,
  Signal,
  Sun,
  Tag,
  Thermometer,
  Upload,
  Users,
  Wifi,
  Wind,
  X,
  Zap,
  BatteryLow,
  CalendarClock,
  CloudDownload,
  Lightbulb,
  MapPinned,
  RefreshCw,
  ShieldAlert,
  Timer,
  TriangleAlert,
} from 'lucide-angular';
import {
  ATTRIBUTES, CONNECTIVITY, Connectivity, DeviceModel, DeviceType, FORMS, FormFactor, MEASUREMENTS, MODELS, ModelStatus, POWER_OPTIONS,
  STATUSES, TYPES, TYPE_ICONS, TypeIcon, blankModel, normalizePower,
} from './model-data';
import { DeviceModelApiService, DeviceModelDto, DeviceModelFormOptions, modelFromDto } from './device-model-api.service';

type Icon = typeof Box;

interface ModelForm {
  name: string;
  manufacturer: string;
  typeId: string;
  connectivity: Connectivity[];
  protocol: string;
  power: string;
  measurements: string[];
  bands: string;
  ipRating: string;
  batteryLife: string;
  opTemp: string;
  fwMin: string;
  fwMax: string;
  status: ModelStatus | '';
  attributes: string[];
}

interface ImportRow {
  line: number;
  model: DeviceModel | null;
  name: string;
  manufacturer: string;
  typeName: string;
  error: string;
}

type Dialog =
  | { kind: 'model'; editId: string | null; title: string; f: ModelForm }
  | { kind: 'type'; name: string; icon: TypeIcon; form: FormFactor | ''; description: string }
  | { kind: 'import'; rows: ImportRow[]; fileName: string; error: string }
  | { kind: 'delete'; id: string }
  | { kind: 'retire'; id: string };

type Tone = 'red' | 'blue' | 'teal' | 'green' | 'violet' | 'amber' | 'slate';

const CORE_MEAS = ['Temperature', 'Humidity', 'Vibration', 'Battery'];
const ATTR_VISIBLE = 6;
const ATTR_ICONS: Record<string, Icon> = {
  'Reporting Interval': CalendarClock, 'Measurement Intervals': Radio, 'Threshold Alerts': TriangleAlert, 'Motion Detection': Move,
  'Geo-fencing': MapPinned, 'LED Indication': Lightbulb, 'Data Retransmission': RefreshCw, 'OTA Firmware': CloudDownload,
  'Time Sync': Timer, 'Tamper Alert': ShieldAlert, 'Power Saving Mode': BatteryLow,
};
const CONN_ALIASES: Record<string, Connectivity> = {
  lorawan: 'LoRaWAN', lora: 'LoRaWAN', ble: 'BLE', bluetooth: 'BLE', 'wi-fi': 'Wi-Fi', wifi: 'Wi-Fi', cellular: 'Cellular', lte: 'Cellular',
  'lte-m': 'Cellular', 'nb-iot': 'Cellular', '4g': 'Cellular', gsm: 'Cellular', ethernet: 'Ethernet', lan: 'Ethernet', poe: 'Ethernet',
};

@Component({
  selector: 'app-device-type-model',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './device-type-model.html',
  styleUrls: ['./device-type-model.css', './device-type-model-sections.css', './device-type-model-dialogs.css', '../shared/iot-purple-theme.css'],
})
export class DeviceTypeModel implements OnInit, OnDestroy {
  private readonly api = inject(DeviceModelApiService);
  readonly icons = { Activity, Battery, Bluetooth, Box, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, Download, Ellipsis, ExternalLink, Info, Layers, Pencil, Plus, Search, Upload, X };
  readonly types = TYPES;
  readonly models = MODELS;
  readonly connOptions = CONNECTIVITY;
  readonly statuses = STATUSES;
  readonly measOptions = MEASUREMENTS;
  readonly attrOptions = ATTRIBUTES;
  readonly powerOptions = POWER_OPTIONS;
  readonly typeIcons = TYPE_ICONS;
  readonly forms = FORMS;
  readonly pageSize = 8;

  typeFilter = 'env';
  search = '';
  mfrFilter = '';
  connFilter: Connectivity | '' = '';
  statusFilter: ModelStatus | '' = '';
  measFilter = '';
  attrFilter = '';
  page = 0;

  selectedId: string | null = null;
  menuId = '';
  menuPos = { top: 0, left: 0 };
  attrMoreOpen = false;
  dialog: Dialog | null = null;
  formError = '';
  toast = '';
  /** True while the model list is being fetched. */
  loading = false;
  /** Why the model list could not be loaded. */
  loadError = '';
  /** True while a change is being saved. */
  saving = false;
  /** Protocol / frequency band suggestions per connectivity (form-options). */
  protocolsByConn: Record<string, string[]> = {};
  bandsByConn: Record<string, string[]> = {};
  ipRatings: string[] = [];
  private apiManufacturers: string[] = [];
  private deployedByModel: Record<string, number> = {};
  private toastTimer?: ReturnType<typeof setTimeout>;
  private version = 0;
  private cacheKey = '';
  private cacheRows: DeviceModel[] = [];

  ngOnInit(): void {
    this.loadOptions();
    this.load();
  }

  /** True once GET /api/device-models/form-options has filled the dropdowns. */
  private optionsLoaded = false;
  private optionsLoading = false;

  /** GET /api/device-models/form-options (retried); called again when a form opens and the first try failed. */
  private loadOptions(): void {
    if (this.optionsLoaded || this.optionsLoading) return;
    this.optionsLoading = true;
    this.api.formOptions().subscribe({
      next: (o) => {
        this.optionsLoading = false;
        this.optionsLoaded = true;
        this.applyOptions(o);
        // models loaded first were matched against the default connectivity list: match them again
        if (MODELS.length) this.remapModels();
      },
      error: () => (this.optionsLoading = false),
    });
  }

  /** Re-reads every loaded model from its API record, so it uses the latest option lists. */
  private remapModels(): void {
    for (let i = 0; i < MODELS.length; i++) {
      const api = MODELS[i].api;
      if (!api) continue;
      const form = MODELS[i].form;
      MODELS[i] = this.toModel(api);
      if (form) MODELS[i].form = form;
    }
    this.version++;
  }

  /** Adds values the loaded models use (connectivity, power, measurements, attributes) that the option lists lack. */
  private addModelOptions(rows: DeviceModelDto[]): void {
    const add = (list: string[], v: string | null | undefined) => {
      const t = (v ?? '').trim();
      if (t && !list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t);
    };
    for (const r of rows) {
      add(CONNECTIVITY as string[], r.connectivity);
      add(POWER_OPTIONS, r.powerSource);
      for (const a of r.configurableAttributes ?? []) add(ATTRIBUTES, a);
      for (const n of r.supportedMeasurements ?? []) {
        if (n && !MEASUREMENTS.some((x) => x.name.toLowerCase() === n.toLowerCase())) MEASUREMENTS.push({ name: n, unit: '', short: n });
      }
    }
  }

  /** GET /api/device-models (and the device counts per model from /api/iot-devices). */
  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getAll().subscribe({
      next: (rows) => {
        this.addModelOptions(rows);
        MODELS.splice(0, MODELS.length, ...rows.map((r) => this.toModel(r)));
        this.loading = false;
        this.version++;
        if (this.selectedId && !this.byId(this.selectedId)) this.selectedId = null;
        this.api.deployedCounts().subscribe((counts) => {
          this.deployedByModel = counts;
          for (const m of MODELS) m.deployed = counts[m.name.toLowerCase()] ?? 0;
          this.version++;
        });
      },
      error: (e: Error) => {
        this.loading = false;
        this.loadError = e.message;
        this.version++;
      },
    });
  }

  /** Replaces the option lists with the API's (device types, connectivity, power, measurements, attributes...). */
  private applyOptions(o: DeviceModelFormOptions): void {
    for (const t of o.deviceTypes ?? []) this.typeIdOf(t.deviceType);
    if (o.connectivities?.length) CONNECTIVITY.splice(0, CONNECTIVITY.length, ...(o.connectivities as Connectivity[]));
    if (o.powerSources?.length) POWER_OPTIONS.splice(0, POWER_OPTIONS.length, ...o.powerSources);
    if (o.measurements?.length) {
      const shortOf = (n: string) => MEASUREMENTS.find((x) => x.name === n)?.short ?? n;
      MEASUREMENTS.splice(0, MEASUREMENTS.length, ...o.measurements.map((x) => ({ name: x.name, unit: x.unit, short: shortOf(x.name) })));
    }
    if (o.configurableAttributes?.length) ATTRIBUTES.splice(0, ATTRIBUTES.length, ...o.configurableAttributes);
    this.protocolsByConn = o.protocolsByConnectivity ?? {};
    this.bandsByConn = o.frequencyBandsByConnectivity ?? {};
    this.ipRatings = o.ipRatings ?? [];
    this.apiManufacturers = o.manufacturers ?? [];
    this.version++;
  }

  /** The page id of an API device type, adding the type to the list when it is new. */
  private typeIdOf(name: string): string {
    const found = TYPES.find((t) => t.name.toLowerCase() === (name ?? '').trim().toLowerCase());
    if (found) return found.id;
    let id = (name || 'type').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    while (TYPES.some((t) => t.id === id)) id += '-2';
    TYPES.push({ id, name: name.trim(), icon: 'chip', form: 'box', description: '' });
    return id;
  }

  private toModel(dto: DeviceModelDto): DeviceModel {
    const m = modelFromDto(dto, this.typeIdOf(dto.deviceType));
    m.deployed = this.deployedByModel[m.name.toLowerCase()] ?? 0;
    return m;
  }

  /** Puts a saved model into the list (replacing `oldId` when given). */
  private commit(dto: DeviceModelDto, oldId?: string, form?: FormFactor): DeviceModel {
    const m = this.toModel(dto);
    if (form) m.form = form;
    const i = MODELS.findIndex((x) => x.id === (oldId ?? m.id));
    if (i >= 0) MODELS[i] = m;
    else MODELS.unshift(m);
    this.version++;
    return m;
  }

  /** PUT with a changed status (Approve / Reactivate / Retire). */
  private saveStatus(m: DeviceModel, status: ModelStatus, done: (saved: DeviceModel) => void): void {
    if (this.saving) return;
    this.saving = true;
    this.api.update({ ...m, status }, this.typeName(m.typeId)).subscribe({
      next: (dto) => {
        this.saving = false;
        done(this.commit(dto, m.id, m.form));
      },
      error: (e: Error) => this.failed(e),
    });
  }

  private failed(e: Error): void {
    this.saving = false;
    if (this.dialog) this.formError = e.message;
    else this.showToast(e.message);
  }

  /** Protocol suggestions for the form's connectivity. */
  protocolHints(c: Connectivity | undefined): string[] {
    return c ? this.protocolsByConn[c] ?? [] : [];
  }

  /** The API takes one connectivity per model, so picking one replaces the other. */
  pickConn(list: Connectivity[], c: Connectivity): void {
    list.splice(0, list.length, c);
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Lookups =====

  typeOf(m: DeviceModel): DeviceType | undefined {
    return TYPES.find((t) => t.id === m.typeId);
  }

  typeName(id: string): string {
    return TYPES.find((t) => t.id === id)?.name ?? '—';
  }

  formOf(m: DeviceModel): FormFactor {
    return m.form ?? this.typeOf(m)?.form ?? 'box';
  }

  typeIcon(icon: TypeIcon): Icon {
    const map: Record<TypeIcon, Icon> = { tracker: Navigation, env: Thermometer, condition: Activity, gateway: Router, rfid: ScanLine, beacon: Bluetooth, meter: Gauge, counter: Users, chip: Cpu };
    return map[icon];
  }

  connIcon(c: Connectivity): Icon {
    const map: Record<Connectivity, Icon> = { LoRaWAN: RadioTower, BLE: Bluetooth, 'Wi-Fi': Wifi, Cellular: Signal, Ethernet: EthernetPort };
    return map[c] ?? Radio;
  }

  shortOf(name: string): string {
    return MEASUREMENTS.find((x) => x.name === name)?.short ?? name;
  }

  /** "Battery (replaceable)" → "Battery" for the table; the panel shows the full text. */
  powerShort(m: DeviceModel): string {
    return m.power.split(' (')[0].split(' / ')[0] || '—';
  }

  measIcon(name: string): Icon {
    const map: Record<string, Icon> = {
      Temperature: Thermometer, Humidity: Droplet, Vibration: Activity, Battery, 'Atmospheric Pressure': Gauge, 'CO₂': Wind, TVOC: Wind, Light: Sun,
      'Door/Window State': DoorOpen, 'Water Leak': Droplet, Tilt: Rotate3d, Location: MapPin, Motion: Move, 'Tag Reads': Tag, RSSI: Signal,
      'Uplink Packets': Radio, Energy: Zap, 'People Count': Users,
    };
    return map[name] ?? Gauge;
  }

  measTone(name: string): Tone {
    const map: Record<string, Tone> = { Temperature: 'red', Humidity: 'blue', Vibration: 'teal', Battery: 'green', 'Water Leak': 'blue', Location: 'violet', Light: 'amber', Energy: 'amber', 'CO₂': 'slate', TVOC: 'slate' };
    return map[name] ?? 'violet';
  }

  unitOf(name: string): string {
    return MEASUREMENTS.find((x) => x.name === name)?.unit ?? '';
  }

  measText(m: DeviceModel): string {
    return m.measurements.map((n) => MEASUREMENTS.find((x) => x.name === n)?.short ?? n).join(' · ') || '—';
  }

  statusLabel(s: ModelStatus): string {
    return s;
  }

  fwRange(m: DeviceModel): string {
    if (!m.fwMin && !m.fwMax) return '—';
    if (!m.fwMax || m.fwMin === m.fwMax) return 'v' + (m.fwMin || m.fwMax);
    return `v${m.fwMin || '?'} – v${m.fwMax}`;
  }

  isBattery(m: DeviceModel): boolean {
    return m.power.toLowerCase().startsWith('battery');
  }

  private hasMeas(m: DeviceModel, name: string): boolean {
    return name === 'Battery' ? this.isBattery(m) || m.measurements.includes(name) : m.measurements.includes(name);
  }

  // ===== KPIs & type list =====

  get kpi(): { types: number; withModels: number; models: number; active: number; draft: number; retired: number } {
    const c = { types: TYPES.length, withModels: 0, models: MODELS.length, active: 0, draft: 0, retired: 0 };
    for (const m of MODELS) {
      if (m.status === 'Active') c.active++;
      else if (m.status === 'Draft') c.draft++;
      else c.retired++;
    }
    c.withModels = TYPES.filter((t) => MODELS.some((m) => m.typeId === t.id)).length;
    return c;
  }

  countFor(typeId: string): number {
    return MODELS.filter((m) => m.typeId === typeId).length;
  }

  selectType(id: string): void {
    this.typeFilter = this.typeFilter === id ? '' : id;
    this.measFilter = this.attrFilter = '';
    this.page = 0;
    const sel = this.selected;
    if (sel && id && sel.typeId !== id && window.innerWidth >= 1200) this.selectedId = this.rows[0]?.id ?? null;
  }

  kpiStatus(s: ModelStatus | ''): void {
    this.statusFilter = this.statusFilter === s ? '' : s;
    this.onFilter();
  }

  showAllModels(): void {
    this.typeFilter = '';
    this.clearFilters();
  }

  // ===== Table =====

  get manufacturers(): string[] {
    return [...new Set([...this.apiManufacturers, ...MODELS.map((m) => m.manufacturer)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  get rows(): DeviceModel[] {
    const key = JSON.stringify([this.typeFilter, this.search, this.mfrFilter, this.connFilter, this.statusFilter, this.measFilter, this.attrFilter, this.version]);
    if (key === this.cacheKey) return this.cacheRows;
    const q = this.search.trim().toLowerCase();
    this.cacheRows = MODELS.filter((m) =>
      (!this.typeFilter || m.typeId === this.typeFilter) && (!this.mfrFilter || m.manufacturer === this.mfrFilter) &&
      (!this.connFilter || m.connectivity.includes(this.connFilter)) && (!this.statusFilter || m.status === this.statusFilter) &&
      (!this.measFilter || this.hasMeas(m, this.measFilter)) && (!this.attrFilter || m.attributes.includes(this.attrFilter)) &&
      (!q || `${m.name} ${m.manufacturer} ${this.typeName(m.typeId)} ${m.protocol} ${m.measurements.join(' ')}`.toLowerCase().includes(q)));
    this.cacheKey = key;
    return this.cacheRows;
  }

  get pageRows(): DeviceModel[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get showing(): string {
    const n = this.rows.length;
    return n ? `Showing ${this.page * this.pageSize + 1}–${Math.min(n, (this.page + 1) * this.pageSize)} of ${n} models` : 'No models';
  }

  get hasFilters(): boolean {
    return !!(this.search || this.mfrFilter || this.connFilter || this.statusFilter || this.measFilter || this.attrFilter);
  }

  onFilter(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = this.mfrFilter = this.measFilter = this.attrFilter = '';
    this.connFilter = this.statusFilter = '';
    this.onFilter();
  }

  // ===== Capability overview (scoped to the selected type) =====

  private get scope(): DeviceModel[] {
    return this.typeFilter ? MODELS.filter((m) => m.typeId === this.typeFilter) : MODELS;
  }

  get scopeName(): string {
    return this.typeFilter ? this.typeName(this.typeFilter) : 'all device types';
  }

  connUsed(c: Connectivity): number {
    return this.scope.filter((m) => m.connectivity.includes(c)).length;
  }

  measUsed(name: string): number {
    return this.scope.filter((m) => this.hasMeas(m, name)).length;
  }

  attrUsed(a: string): number {
    return this.scope.filter((m) => m.attributes.includes(a)).length;
  }

  /** The four core tiles plus up to four other measurements the type's models report. */
  get measTiles(): string[] {
    return CORE_MEAS;
  }

  attrIcon(a: string): Icon {
    return ATTR_ICONS[a] ?? Tag;
  }

  get attrVisible(): string[] {
    return ATTRIBUTES.slice(0, ATTR_VISIBLE);
  }

  get attrHidden(): string[] {
    return ATTRIBUTES.slice(ATTR_VISIBLE);
  }

  toggleConn(c: Connectivity): void {
    this.connFilter = this.connFilter === c ? '' : c;
    this.onFilter();
  }

  toggleMeas(name: string): void {
    this.measFilter = this.measFilter === name ? '' : name;
    this.onFilter();
  }

  toggleAttr(a: string): void {
    this.attrFilter = this.attrFilter === a ? '' : a;
    this.attrMoreOpen = false;
    this.onFilter();
  }

  // ===== Panel =====

  get selected(): DeviceModel | null {
    return this.selectedId ? MODELS.find((m) => m.id === this.selectedId) ?? null : null;
  }

  select(m: DeviceModel): void {
    this.selectedId = m.id;
    this.menuId = '';
  }

  downloadConfig(m: DeviceModel): void {
    const cfg = {
      schemaVersion: '1.0',
      model: m.name,
      manufacturer: m.manufacturer,
      deviceType: this.typeName(m.typeId),
      radio: { connectivity: m.connectivity, protocol: m.protocol, frequencyBands: m.bands },
      power: { source: m.power, estimatedBatteryLife: m.batteryLife || null },
      environment: { ipRating: m.ipRating, operatingTemperature: m.opTemp },
      measurements: m.measurements.map((n) => ({ parameter: n, unit: this.unitOf(n), enabled: true })),
      configuration: Object.fromEntries(m.attributes.map((a) => [a.replace(/[^A-Za-z]+(.)?/g, (_s: string, c?: string) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toLowerCase()), this.defaultSetting(a)])),
      firmware: { min: m.fwMin, max: m.fwMax },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.name} Template.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast(`${m.name} Template.json downloaded.`);
  }

  private defaultSetting(a: string): unknown {
    switch (a) {
      case 'Reporting Interval': return { minutes: 10 };
      case 'Measurement Intervals': return { seconds: 60 };
      case 'Threshold Alerts': return { enabled: true, rules: [] };
      case 'Geo-fencing': return { enabled: false, zones: [] };
      default: return { enabled: true };
    }
  }

  // ===== Row actions =====

  openMenu(m: DeviceModel, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuId === m.id) return void (this.menuId = '');
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const h = 250;
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    this.menuPos = { top, left: Math.max(8, r.right - 210) };
    this.menuId = m.id;
    this.attrMoreOpen = false;
  }

  get menuModel(): DeviceModel | null {
    return this.menuId ? MODELS.find((m) => m.id === this.menuId) ?? null : null;
  }

  approve(m: DeviceModel): void {
    this.menuId = '';
    this.saveStatus(m, 'Active', (s) => this.showToast(`${s.name} approved and now Active.`));
  }

  reactivate(m: DeviceModel): void {
    this.menuId = '';
    this.saveStatus(m, 'Active', (s) => this.showToast(`${s.name} reactivated.`));
  }

  askRetire(m: DeviceModel): void {
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'retire', id: m.id };
  }

  confirmRetire(): void {
    const d = this.dlg('retire');
    const m = d ? this.byId(d.id) : undefined;
    if (!m) return;
    this.saveStatus(m, 'Retired', (s) => {
      this.dialog = null;
      this.showToast(`${s.name} retired. ${s.deployed} deployed device${s.deployed === 1 ? '' : 's'} keep working.`);
    });
  }

  askDelete(m: DeviceModel): void {
    this.menuId = '';
    if (m.deployed) return this.showToast(`${m.name} has ${m.deployed} deployed devices. Retire it instead.`);
    this.formError = '';
    this.dialog = { kind: 'delete', id: m.id };
  }

  confirmDelete(): void {
    const d = this.dlg('delete');
    if (!d || this.saving) return;
    this.saving = true;
    this.api.delete(d.id).subscribe({
      next: () => {
        this.saving = false;
        const i = MODELS.findIndex((m) => m.id === d.id);
        if (i >= 0) MODELS.splice(i, 1);
        this.version++;
        this.dialog = null;
        this.page = Math.min(this.page, this.pageCount - 1);
        if (this.selectedId === d.id) this.selectedId = this.rows[0]?.id ?? null;
        this.showToast(`${d.id} deleted.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // ===== Add / edit / duplicate =====

  private formFrom(m: DeviceModel): ModelForm {
    return {
      name: m.name, manufacturer: m.manufacturer, typeId: m.typeId, connectivity: [...m.connectivity], protocol: m.protocol, power: m.power,
      measurements: [...m.measurements], bands: m.bands.join(', '), ipRating: m.ipRating, batteryLife: m.batteryLife, opTemp: m.opTemp,
      fwMin: m.fwMin, fwMax: m.fwMax, status: m.status, attributes: [...m.attributes],
    };
  }

  openAdd(): void {
    this.loadOptions();
    this.menuId = '';
    this.formError = '';
    const b = blankModel('env');
    this.dialog = {
      kind: 'model', editId: null, title: 'Add Device Model',
      f: { ...this.formFrom({ ...b, id: '', name: '', manufacturer: '', typeId: '', deployed: 0 }), fwMin: '', fwMax: '', power: '', status: '' },
    };
  }

  openEdit(m: DeviceModel): void {
    this.loadOptions();
    this.menuId = '';
    this.formError = '';
    this.dialog = { kind: 'model', editId: m.id, title: `Edit ${m.name}`, f: this.formFrom(m) };
  }

  openDuplicate(m: DeviceModel): void {
    this.menuId = '';
    this.formError = '';
    let name = `${m.name} Copy`;
    for (let n = 2; this.nameTaken(name, null); n++) name = `${m.name} Copy ${n}`;
    this.dialog = { kind: 'model', editId: null, title: `Duplicate ${m.name}`, f: { ...this.formFrom(m), name, status: 'Draft' } };
  }

  /** Re-fill radio and measurement defaults when a new model switches type before anything is customised. */
  onFormType(): void {
    const d = this.dlg('model');
    if (!d || d.editId) return;
    const b = blankModel(d.f.typeId);
    Object.assign(d.f, { connectivity: [...b.connectivity], protocol: b.protocol, power: normalizePower(b.power), measurements: [...b.measurements], bands: b.bands.join(', '), ipRating: b.ipRating, opTemp: b.opTemp, attributes: [...b.attributes] });
  }

  toggleIn<T>(list: T[], v: T): void {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
  }

  private nameTaken(name: string, exceptId: string | null): boolean {
    const n = name.trim().toLowerCase();
    return MODELS.some((m) => m.id !== exceptId && m.name.toLowerCase() === n);
  }

  saveModel(): void {
    const d = this.dlg('model');
    if (!d || this.saving) return;
    const f = d.f;
    if (!f.name.trim()) return void (this.formError = 'Enter the model name.');
    if (!f.manufacturer.trim()) return void (this.formError = 'Enter the manufacturer.');
    if (!f.typeId) return void (this.formError = 'Choose a device type.');
    if (this.nameTaken(f.name, d.editId)) return void (this.formError = `A model named "${f.name.trim()}" already exists.`);
    if (d.editId && f.name.trim() !== d.editId) return void (this.formError = 'The model name cannot be changed. Duplicate the model to use a new name.');
    if (!f.connectivity.length) return void (this.formError = 'Choose a connectivity option.');
    if (!f.power) return void (this.formError = 'Choose the power source.');
    if (!f.status) return void (this.formError = 'Choose the status.');
    const data = {
      name: f.name.trim(), manufacturer: f.manufacturer.trim(), typeId: f.typeId, connectivity: CONNECTIVITY.filter((c) => f.connectivity.includes(c)),
      protocol: f.protocol.trim(), power: f.power, measurements: MEASUREMENTS.map((x) => x.name).filter((n) => f.measurements.includes(n)),
      bands: f.bands.split(/[,;|]/).map((s) => s.trim()).filter(Boolean), ipRating: f.ipRating.trim(), batteryLife: f.batteryLife.trim(),
      opTemp: f.opTemp.trim(), fwMin: f.fwMin.trim().replace(/^v/i, ''), fwMax: f.fwMax.trim().replace(/^v/i, ''), status: f.status,
      attributes: ATTRIBUTES.filter((a) => f.attributes.includes(a)),
    };
    const existing = d.editId ? this.byId(d.editId) : undefined;
    const draft: DeviceModel = existing ? { ...existing, ...data } : { ...data, id: data.name, deployed: 0 };
    const keepForm = existing && existing.typeId === data.typeId ? existing.form : undefined;
    const typeName = this.typeName(data.typeId);
    this.saving = true;
    (existing ? this.api.update(draft, typeName) : this.api.create(draft, typeName)).subscribe({
      next: (dto) => {
        this.saving = false;
        const m = this.commit(dto, existing?.id, keepForm);
        this.dialog = null;
        if (this.typeFilter && this.typeFilter !== m.typeId) this.typeFilter = m.typeId;
        this.clearFilters();
        this.selectedId = m.id;
        this.page = Math.floor(Math.max(0, this.rows.indexOf(m)) / this.pageSize);
        this.showToast(d.editId ? `${m.name} saved.` : `${m.name} added${m.status === 'Draft' ? ' as Pending Review' : ''}.`);
      },
      error: (e: Error) => this.failed(e),
    });
  }

  // ===== Device types =====

  openAddType(): void {
    this.formError = '';
    this.dialog = { kind: 'type', name: '', icon: 'chip', form: '', description: '' };
  }

  saveType(): void {
    const d = this.dlg('type');
    if (!d) return;
    const name = d.name.trim();
    if (!name) return void (this.formError = 'Enter the type name.');
    if (!d.form) return void (this.formError = 'Choose a thumbnail style.');
    if (TYPES.some((t) => t.name.toLowerCase() === name.toLowerCase())) return void (this.formError = `"${name}" already exists.`);
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    while (TYPES.some((t) => t.id === id)) id += '-2';
    TYPES.push({ id, name, icon: d.icon, form: d.form, description: d.description.trim() });
    this.dialog = null;
    this.selectType(id);
    // there is no device-type endpoint: the type is stored with its first model
    this.showToast(`Device type "${name}" added for this session. It is saved with its first model.`);
  }

  // ===== Import =====

  openImport(): void {
    this.menuId = '';
    this.dialog = { kind: 'import', rows: [], fileName: '', error: '' };
  }

  downloadTemplate(csv: boolean): void {
    const header = ['Model Name', 'Manufacturer', 'Device Type', 'Connectivity', 'Protocol', 'Power', 'Measurements', 'Frequency Bands', 'IP Rating', 'Battery Life', 'Operating Temperature', 'Firmware Min', 'Firmware Max', 'Status'];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([], { header }), 'Device Models');
    XLSX.writeFile(book, csv ? 'Device_Models_Import_Template.csv' : 'Device_Models_Import_Template.xlsx', csv ? { bookType: 'csv' } : undefined);
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const d = this.dlg('import');
    if (!file || !d) return;
    d.fileName = file.name;
    d.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const book = XLSX.read(reader.result, { type: 'array' });
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
        d.rows = this.validate(raw);
        if (!d.rows.length) d.error = 'The file has no rows.';
      } catch {
        d.rows = [];
        d.error = 'This file could not be read. Use the Excel or CSV template.';
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private validate(raw: Record<string, unknown>[]): ImportRow[] {
    const names = new Set(MODELS.map((m) => m.name.toLowerCase()));
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase()));
      return k ? String(r[k]).trim() : '';
    };
    const list = (s: string) => s.split(/[,;|/·]/).map((x) => x.trim()).filter(Boolean);
    return raw.map((r, i) => {
      const name = get(r, 'model name', 'model', 'name');
      const manufacturer = get(r, 'manufacturer', 'vendor', 'make');
      const typeName = get(r, 'device type', 'type');
      const type = TYPES.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
      const connRaw = list(get(r, 'connectivity', 'radio'));
      const conn: (Connectivity | null)[] = connRaw.map((c) => CONN_ALIASES[c.toLowerCase()] ?? null);
      const measRaw = list(get(r, 'measurements', 'supported measurements'));
      const meas = measRaw.map((n) => MEASUREMENTS.find((x) => [x.name.toLowerCase(), x.short.toLowerCase()].includes(n.toLowerCase()))?.name ?? null);
      const statusText = get(r, 'status') || 'Draft';
      const status = statusText.toLowerCase() === 'active' ? 'Active' : ['draft', 'pending review', 'pending'].includes(statusText.toLowerCase()) ? 'Draft' : null;
      let error = '';
      if (!name) error = 'Model name missing';
      else if (names.has(name.toLowerCase())) error = `"${name}" already exists`;
      else if (!manufacturer) error = 'Manufacturer missing';
      else if (!type) error = typeName ? `Unknown device type "${typeName}"` : 'Device type missing';
      else if (!connRaw.length) error = 'Connectivity missing';
      else if (conn.includes(null)) error = `Unknown connectivity "${connRaw[conn.indexOf(null)]}"`;
      else if (meas.includes(null)) error = `Unknown measurement "${measRaw[meas.indexOf(null)]}"`;
      else if (!status) error = `Status must be Draft or Active`;
      let model: DeviceModel | null = null;
      if (!error && type && status) {
        names.add(name.toLowerCase());
        const b = blankModel(type.id);
        model = {
          ...b, id: '', name, manufacturer, typeId: type.id, deployed: 0, status, form: undefined,
          connectivity: CONNECTIVITY.filter((c) => conn.includes(c)).slice(0, 1), measurements: meas.filter((x): x is string => !!x),
          protocol: get(r, 'protocol') || b.protocol, power: normalizePower(get(r, 'power') || b.power),
          bands: get(r, 'frequency bands', 'bands') ? list(get(r, 'frequency bands', 'bands').replace(/\//g, ' ')) : b.bands,
          ipRating: get(r, 'ip rating', 'ip') || b.ipRating, batteryLife: get(r, 'battery life', 'battery life (est.)'),
          opTemp: get(r, 'operating temperature') || b.opTemp, fwMin: get(r, 'firmware min').replace(/^v/i, ''), fwMax: get(r, 'firmware max').replace(/^v/i, ''),
        };
      }
      return { line: i + 2, model, name, manufacturer, typeName: type?.name ?? typeName, error };
    });
  }

  get importValid(): number {
    return this.dlg('import')?.rows.filter((r) => r.model).length ?? 0;
  }

  /** POSTs the valid rows one by one; rows the API rejects are reported with its reason. */
  saveImport(): void {
    const d = this.dlg('import');
    if (!d || this.saving) return;
    const ok = d.rows.filter((r) => r.model);
    this.saving = true;
    from(ok).pipe(
      concatMap((r) => this.api.create({ ...r.model!, id: r.name }, this.typeName(r.model!.typeId)).pipe(
        map((dto) => {
          this.commit(dto);
          return '';
        }),
        catchError((e: Error) => {
          r.error = e.message;
          r.model = null;
          return of(e.message);
        }),
      )),
      toArray(),
    ).subscribe((results) => {
      this.saving = false;
      const done = results.filter((x) => !x).length;
      const failed = results.length - done;
      const skipped = d.rows.length - ok.length;
      this.typeFilter = '';
      this.clearFilters();
      if (failed) {
        d.error = `${done} imported; ${failed} rejected by the server (see Result).`;
        d.rows = d.rows.filter((r) => r.error);
        return;
      }
      this.dialog = null;
      this.showToast(`${done} model${done === 1 ? '' : 's'} imported${skipped ? `, ${skipped} skipped` : ''}.`);
    });
  }

  // ===== Plumbing =====

  byId(id: string): DeviceModel | undefined {
    return MODELS.find((m) => m.id === id);
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId = '';
    this.attrMoreOpen = false;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    this.menuId = '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    const hadMenu = !!this.menuId || this.attrMoreOpen;
    this.closeMenus();
    if (this.dialog) this.dialog = null;
    else if (!hadMenu && window.innerWidth < 1200) this.selectedId = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }

  /** Narrow a dialog for the template (strict templates cannot narrow a union on their own). */
  dlg<K extends Dialog['kind']>(kind: K): Extract<Dialog, { kind: K }> | null {
    return this.dialog?.kind === kind ? (this.dialog as Extract<Dialog, { kind: K }>) : null;
  }
}
