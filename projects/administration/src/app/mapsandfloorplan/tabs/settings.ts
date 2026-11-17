import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Bell,
  Check,
  CircleHelp,
  Crosshair,
  FileStack,
  Layers,
  Lock,
  LucideAngularModule,
  LucideIconData,
  Map,
  MapPin,
  Minus,
  Plug,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Shield,
  SlidersHorizontal
} from 'lucide-angular';
import { MapsApiService, SettingsDto } from '../maps-api.service';
import { MapsStore } from '../maps.store';

type SectionId = 'general' | 'plotting' | 'zones' | 'layers' | 'access' | 'calibration' | 'integrations' | 'advanced';

const DEFAULTS = {
  defaultView: 'Fit to Floor Plan',
  defaultZoom: 100,
  unit: 'Metric (m, m²)',
  fileTypes: { PNG: true, JPG: true, PDF: true, SVG: true, DWG: false, DXF: false } as Record<string, boolean>,
  maxFileMb: 50,
  coordinateSystem: 'Floor Plan (Local XY)',
  plotted: { Assets: true, Devices: true, Zones: true, Annotations: false } as Record<string, boolean>,
  assetLabel: 'Asset ID + Name',
  labelPosition: 'Bottom Center',
  statusIcon: true,
  snap: true,
  gridSize: 1,
  zoneType: 'Operational',
  dwellMinutes: 30,
  zoneColor: '#7c3aed',
  zoneOverlap: false,
  geofenceLogging: true,
  versioning: 'Semantic (v1.0, v1.1, v2.0)',
  approval: true,
  keepVersions: 10,
  autoArchive: true,
  archiveAfter: 180,
  mapAccess: 'View Only',
  allowDownload: true,
  watermark: false,
  notifyPublish: true,
  notifyGeofence: true,
  notifyVersion: false,
  calibrationPoints: 3,
  calibrationTolerance: 0.5,
  originX: 0,
  originY: 0,
  rotation: 0,
  integrations: { 'BMS / BACnet': false, 'RTLS (BLE)': true, 'CAFM / IWMS': false, 'Autodesk (DWG import)': true } as Record<string, boolean>,
  tileCache: true,
  cacheHours: 24,
  auditEdits: true
};

export type MapSettings = typeof DEFAULTS;

/** The Settings tab defaults (also the shape PUT api/administration/maps/settings receives). */
export const MAP_SETTINGS_DEFAULTS: Readonly<MapSettings> = DEFAULTS;

export function cloneSettings(s: MapSettings): MapSettings {
  return JSON.parse(JSON.stringify(s)) as MapSettings;
}

const clone = cloneSettings;

/**
 * GET settings merged over the defaults: every DEFAULTS key is taken from the response (or its `extra` bag) when the
 * stored value has the same type; maps (fileTypes, plotted, integrations) are merged key by key.
 */
export function mergeSettings(dto: SettingsDto | null | undefined): MapSettings {
  const out = clone(DEFAULTS) as unknown as Record<string, unknown>;
  const src: Record<string, unknown> = { ...(dto?.extra ?? {}), ...(dto ?? {}) };
  for (const key of Object.keys(out)) {
    const value = src[key];
    const def = out[key];
    if (value === null || value === undefined) continue;
    if (def && typeof def === 'object') {
      if (typeof value === 'object' && !Array.isArray(value)) out[key] = { ...(def as object), ...(value as object) };
    } else if (typeof value === typeof def) {
      out[key] = value;
    }
  }
  return out as unknown as MapSettings;
}

/** Settings: global defaults for maps, plotting, zones, versioning, access and notifications. */
@Component({
  standalone: true,
  selector: 'app-maps-settings',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './settings.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `
    .set-ws { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 12px; align-items: stretch; }
    .set-nav { display: flex; flex-direction: column; gap: 2px; padding: 10px; }
    .set-nav button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 8px; background: none; font: inherit; font-weight: 600; color: #334155; text-align: left; cursor: pointer; }
    .set-nav button:hover { background: #faf9fe; }
    .set-nav button.active { background: var(--adm-purple-soft); color: var(--adm-purple); }
    .set-nav lucide-icon { color: var(--adm-purple); }
    .set-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
    .srow select { width: 100%; }
    .set-card { border: 1px solid var(--adm-border); border-radius: 12px; padding: 14px 16px; }
    .set-card h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 14.5px; font-weight: 800; }
    .set-card h3 lucide-icon { color: var(--adm-purple); }
    .srow { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 38px; font-size: 12.5px; }
    .srow > span:first-child { display: flex; align-items: center; gap: 4px; color: #334155; }
    .srow select, .srow input[type='number'] { height: 32px; padding: 0 8px; border: 1px solid var(--adm-border); border-radius: 8px; font: inherit; background: #fff; }
    .srow input[type='number'] { width: 90px; }
    .srow .inline { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    .srow .inline label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
    .stepper { display: inline-flex; align-items: center; border: 1px solid var(--adm-border); border-radius: 8px; overflow: hidden; }
    .stepper button { width: 30px; height: 30px; border: 0; background: #fff; cursor: pointer; display: grid; place-items: center; }
    .stepper span { min-width: 54px; text-align: center; font-weight: 600; }
    .swatch { width: 24px; height: 24px; border: 2px solid #fff; border-radius: 6px; cursor: pointer; box-shadow: 0 0 0 1px var(--adm-border); display: grid; place-items: center; color: #fff; padding: 0; }
    .swatch.on { box-shadow: 0 0 0 2px var(--adm-purple); }
    .switch { justify-self: end; }
    @media (max-width: 1100px) { .set-ws, .set-cards { grid-template-columns: minmax(0, 1fr); } }
  `
})
export class SettingsTab {
  readonly store = inject(MapsStore);
  readonly icons = { Check, CircleHelp, Minus, Plus, RotateCcw, Save, Bell, Layers, Lock, MapPin, Map, Shield, FileStack, SlidersHorizontal };
  readonly sections: { id: SectionId; label: string; icon: LucideIconData }[] = [
    { id: 'general', label: 'General Settings', icon: Settings },
    { id: 'plotting', label: 'Map & Plotting', icon: Map },
    { id: 'zones', label: 'Zones & Geofences', icon: Shield },
    { id: 'layers', label: 'Layers & Display', icon: Layers },
    { id: 'access', label: 'Access & Permissions', icon: Lock },
    { id: 'calibration', label: 'Coordinate Calibration', icon: Crosshair },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal }
  ];
  readonly zoneColors = ['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#f97316', '#ec4899'];
  readonly objectKeys = Object.keys;

  private readonly api = inject(MapsApiService);

  section: SectionId = 'general';
  s: MapSettings = clone(DEFAULTS);
  private saved: MapSettings = clone(DEFAULTS);
  loading = true;
  loadError: string | null = null;

  constructor() {
    this.load();
  }

  /** GET settings (the API answers with defaults when none are saved). */
  load(): void {
    this.loading = true;
    this.loadError = null;
    this.api.getSettings().subscribe({
      next: (dto) => {
        this.s = mergeSettings(dto);
        this.saved = clone(this.s);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.loadError = `Could not load map settings: ${this.store.errorText(err)}`;
        this.store.notify(this.loadError, 'error');
      }
    });
  }

  get sectionLabel(): string {
    return this.sections.find((x) => x.id === this.section)!.label;
  }

  get sectionIcon(): LucideIconData {
    return this.sections.find((x) => x.id === this.section)!.icon;
  }

  get dirty(): boolean {
    return JSON.stringify(this.s) !== JSON.stringify(this.saved);
  }

  zoomBy(step: number): void {
    this.s.defaultZoom = Math.min(200, Math.max(25, this.s.defaultZoom + step));
  }

  reset(): void {
    this.s = clone(DEFAULTS);
    this.store.notify('Settings reset to defaults - save to apply');
  }

  save(): void {
    if (this.store.working || this.loading) return;
    if (this.s.maxFileMb < 1 || this.s.keepVersions < 1 || this.s.gridSize <= 0) {
      this.store.notify('Check the values: file size, versions kept and grid size must be above zero', 'error');
      return;
    }
    const sent = clone(this.s);
    this.store.run(this.api.saveSettings(sent), { pending: 'Saving…', success: 'Map settings saved', error: 'Could not save map settings' }, (dto) => {
      this.s = dto && typeof dto === 'object' ? mergeSettings(dto) : sent;
      this.saved = clone(this.s);
    });
  }
}
