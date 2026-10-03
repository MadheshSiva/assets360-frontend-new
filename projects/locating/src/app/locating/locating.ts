import { AfterViewInit, Component, HostListener, OnDestroy, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ALL_ROLES,
  AREA_TYPE_LABELS,
  AREA_TYPE_SHORT_LABELS,
  Coords,
  CurrentRoleService,
  DrawnZone,
  Floor,
  FloorPlanComponent,
  GEOFENCE_ACTIONS,
  GEOFENCE_ACTION_LABELS,
  GeofenceAction,
  GeofenceRule,
  GeofenceService,
  GeofenceTrigger,
  HierarchyNode,
  MapComponent,
  MapPin,
  ROLE_LABELS,
  SiteHierarchyService,
  UserRole,
  ZONE_TYPE_OPTIONS,
  Zone,
  ZoneAsset,
  ZoneType,
  childrenOf,
} from 'shared-ui';

export type TrackMode = 'people' | 'assets';
type Period = 'day' | 'week' | 'month';
type PopupKind = 'count' | 'device' | 'camera' | 'asset';

interface Row {
  node: HierarchyNode;
  depth: number;
  /** A zone whose parent is another zone is a Sub Zone. */
  parentKind?: HierarchyNode['kind'];
}

interface MockItem {
  id: string;
  name: string;
  coords: Coords;
}

interface DeviceItem extends MockItem {
  battery: number;
  rssi: number;
  firmware: string;
  lastHeartbeat: string;
}

/** Details shown for one asset icon dropped inside a drawn floor-plan zone. */
interface AssetDetailData {
  zoneId: string;
  assetId: string;
  name: string;
  type: string;
  status: string;
  zoneLabel: string;
  battery: number;
  signal: string;
  lastSync: string;
}

interface ZoneAssetSummaryItem {
  assetId: string;
  name: string;
  type: string;
  status: 'online' | 'idle' | 'offline';
}

interface ZoneAssetsPanelState {
  zoneId: string;
  title: string;
  items: ZoneAssetSummaryItem[];
}

interface LevelFilters {
  period: Period;
  parameter: string;
  selectedItemIds: string[];
  /** Multiple attributes may be selected at once (Phase 1, item 1.c) and are all shown on the map label. */
  deviceAttributes: string[];
  /** Asset-monitoring header's third dropdown (mirrors the Unique/Repeated Visitor filter on a people-tracking floor plan). */
  category: string;
}

interface Popup {
  kind: PopupKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface DetailPanelState {
  title: string;
  kind: PopupKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface TimelineEntry {
  time: string;
  text: string;
}

const CATEGORY_PARAMETERS = new Set(['employee', 'asset', 'device']);
const REPLAY_MINUTES = 30;

@Component({
  standalone: true,
  selector: 'app-locating',
  imports: [CommonModule, FormsModule, MapComponent, FloorPlanComponent],
  templateUrl: './locating.html',
  styleUrls: ['./locating.css'],
})
export class Locating implements AfterViewInit, OnDestroy {
  mode: TrackMode = 'people';
  isPanelCollapsed = false;

  private queryParamsSub?: Subscription;

  constructor(
    private readonly hierarchy: SiteHierarchyService,
    private readonly route: ActivatedRoute,
    private readonly roleService: CurrentRoleService,
    private readonly geofenceService: GeofenceService,
  ) {
    // Re-derive pins whenever the underlying (shared, signal-based) zone data changes.
    effect(() => {
      this.hierarchy.allZones();
      this.refreshPins();
    });

    this.generateMockHistory();
  }

  ngAfterViewInit(): void {
    // Deep link from elsewhere in the app (e.g. Dashboard's "Locate" action): fly to and
    // highlight a zone by name. Subscribed here (not the constructor) so mapComponent is ready.
    this.queryParamsSub = this.route.queryParams.subscribe((params) => {
      const zoneName = params['zone'];
      if (zoneName) this.locateZoneByName(zoneName);
    });
  }

  private locateZoneByName(zoneName: string): void {
    const pin = this.zonePins().find((p) => p.label === zoneName);
    if (!pin) return;
    this.mapComponent?.flyTo({ lat: pin.lat, lng: pin.lng, zoom: 19 });
    this.onPinClick(pin);
  }

  /** Left-edge toggle: hides the hierarchy tree so the map can use the full width. */
  isTreeHidden = false;

  togglePanel(): void {
    this.isPanelCollapsed = !this.isPanelCollapsed;
  }

  toggleTree(): void {
    this.isTreeHidden = !this.isTreeHidden;
  }

  // ===== Read-only cascade (mirrors the Area/State/Zone/Floor hierarchy configured in Projects) =====

  expanded = new Set<string>();
  activeNodeId: string | null = null;

  @ViewChild(MapComponent, { static: false }) mapComponent?: MapComponent;
  @ViewChild(FloorPlanComponent, { static: false }) floorPlanComponent?: FloorPlanComponent;

  readonly areaTypeLabels = AREA_TYPE_LABELS;
  readonly areaTypeShortLabels = AREA_TYPE_SHORT_LABELS;

  get visibleRows(): Row[] {
    const rows: Row[] = [];
    const walk = (node: HierarchyNode, depth: number, parentKind?: HierarchyNode['kind']) => {
      rows.push({ node, depth, parentKind });
      if (this.expanded.has(node.id)) {
        this.treeChildren(node).forEach((child) => walk(child, depth + 1, node.kind));
      }
    };
    this.hierarchy.projects().forEach((project) => walk(project, 0));
    return rows;
  }

  trackByRow = (_: number, row: Row) => row.node.id;

  isActive(id: string): boolean {
    return this.activeNodeId === id;
  }

  /**
   * Children as displayed in this tree: Project -> Country -> Area -> (Outdoor Zone | Building)
   * -> Floor -> Zone -> Sub Zone. The backend's Outer Zone level is skipped, so its buildings
   * sit directly under the Area alongside the outdoor zones. The shared data itself is unchanged.
   */
  treeChildren(node: HierarchyNode): HierarchyNode[] {
    if (node.kind === 'state') {
      return [...node.zones, ...node.outerZones.flatMap((outerZone) => outerZone.buildings)];
    }
    return childrenOf(node);
  }

  /** Icon per tree level: Project folder, Country flag, Area map, Building, Floor stairs, Zone grid, Sub Zone square. */
  levelIcon(row: Row): 'folder' | 'flag' | 'map' | 'building' | 'floor' | 'zone' | 'subzone' {
    switch (row.node.kind) {
      case 'project': return 'folder';
      case 'area': return 'flag';
      case 'state': return 'map';
      case 'outerZone':
      case 'building': return 'building';
      case 'floor': return 'floor';
      case 'zone': return row.parentKind === 'zone' ? 'subzone' : 'zone';
    }
  }

  isExpandable(node: HierarchyNode): boolean {
    return this.treeChildren(node).length > 0 && !this.expanded.has(node.id);
  }

  areaTypeOf(node: HierarchyNode) {
    return node.kind === 'state' ? node.type : null;
  }

  toggle(node: HierarchyNode): void {
    this.activeNodeId = node.id;
    this.mapComponent?.flyTo(node.coords);
    this.refreshPins();

    if (this.expanded.has(node.id)) {
      const next = new Set(this.expanded);
      next.delete(node.id);
      const collectDescendants = (n: HierarchyNode) => {
        this.treeChildren(n).forEach((child) => {
          next.delete(child.id);
          collectDescendants(child);
        });
      };
      collectDescendants(node);
      this.expanded = next;
      return;
    }

    if (this.treeChildren(node).length === 0) return;
    this.expanded = new Set(this.expanded).add(node.id);
  }

  get activeNode(): HierarchyNode | undefined {
    return this.activeNodeId ? this.hierarchy.findNode(this.activeNodeId) : undefined;
  }

  /** Which per-level filter bar to show: the spec calls for filters at Area level and Floor level only. */
  get activeLevel(): 'area' | 'floor' | null {
    const kind = this.activeNode?.kind;
    return kind === 'area' ? 'area' : kind === 'floor' ? 'floor' : null;
  }

  /** The floor plan image is shown instead of the geo map when a floor,
   *  or a zone that belongs to a floor, is the active node (mirrors Projects). */
  get activeFloor(): Floor | null {
    const node = this.activeNode;
    if (!node) return null;
    if (node.kind === 'floor') return node;
    if (node.kind === 'zone') return this.findParentFloor(node.id) ?? null;
    return null;
  }

  get showFloorPlan(): boolean {
    return this.activeFloor !== null;
  }

  /** The floor a zone belongs to, at any depth — so a sub zone shows the same floor plan as its parent zone. */
  private findParentFloor(zoneId: string): Floor | undefined {
    let result: Floor | undefined;
    const containsZone = (zones: Zone[]): boolean =>
      zones.some((zone) => zone.id === zoneId || containsZone(zone.zones));
    const walk = (node: HierarchyNode) => {
      if (result) return;
      if (node.kind === 'floor' && containsZone(node.zones)) {
        result = node;
        return;
      }
      childrenOf(node).forEach(walk);
    };
    this.hierarchy.projects().forEach(walk);
    return result;
  }

  get currentFilters(): LevelFilters | null {
    if (this.activeLevel === 'area') return this.areaFilters;
    if (this.activeLevel === 'floor') return this.floorFilters;
    return null;
  }

  // ===== Area-level & floor-level filters (independent state per level) =====

  private defaultFilters(): LevelFilters {
    return { period: 'month', parameter: '', selectedItemIds: [], deviceAttributes: [], category: 'unique' };
  }

  areaFilters: LevelFilters = this.defaultFilters();
  floorFilters: LevelFilters = this.defaultFilters();

  parameters = [
    { label: 'Employee', value: 'employee' },
    { label: 'Asset', value: 'asset' },
    { label: 'Device', value: 'device' },
    { label: 'Heart Rate', value: 'heart_rate' },
    { label: 'Body Temperature', value: 'body_temperature' },
    { label: 'Location', value: 'location' },
    { label: 'Movement Status', value: 'movement' },
    { label: 'Battery Level', value: 'battery' },
  ];

  /** Asset-360 equivalent of the Employee/Customer/Unique Visitor/Repeated Visitor filter on a
   *  people-tracking floor plan: same "how is this entity showing up here" idea, applied to assets. */
  assetTrackingCategories = [
    { label: 'Fixed Asset', value: 'fixed' },
    { label: 'Movable Asset', value: 'movable' },
    { label: 'Unique Asset', value: 'unique' },
    { label: 'Repeated Asset', value: 'repeated' },
  ];

  /** Drives the floor plan's drawn-zone asset label — switches between "Unique Assets",
   *  "Movable Assets", etc. as the toolbar's category dropdown changes. */
  get zoneAssetLabel(): string {
    const category = this.assetTrackingCategories.find((c) => c.value === this.floorFilters.category);
    const label = category?.label ?? 'Unique Asset';
    return label.endsWith('s') ? label : `${label}s`;
  }

  /** Header's "Select Item"/"Select Device" checkbox dropdown, open state. */
  isItemDropdownOpen = false;
  /** Header's "Track" button menu (picks the asset-tracking category), open state. */
  isTrackMenuOpen = false;

  // Floor-plan header filters — UI selections only; not yet applied to the data.
  timeRange = '';
  duration = '';

  readonly timeRangeOptions = [
    { label: 'Today', value: 'today' },
    { label: 'Last 24 Hours', value: '24h' },
    { label: 'Last 7 Days', value: '7d' },
    { label: 'Last 30 Days', value: '30d' },
  ];

  readonly durationOptions = [
    { label: '15 min', value: '15m' },
    { label: '30 min', value: '30m' },
    { label: '1 hour', value: '1h' },
    { label: '4 hours', value: '4h' },
    { label: '8 hours', value: '8h' },
  ];

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isItemDropdownOpen = false;
    this.isTrackMenuOpen = false;
  }

  selectTrackCategory(filters: LevelFilters, value: string): void {
    filters.category = value;
    this.isTrackMenuOpen = false;
  }

  itemDropdownPlaceholder(filters: LevelFilters): string {
    return this.isDeviceCategory(filters) ? 'Select Device' : 'Select Item';
  }

  selectedItemsSummary(filters: LevelFilters): string {
    const count = filters.selectedItemIds.length;
    return count === 0 ? this.itemDropdownPlaceholder(filters) : `${count} selected`;
  }

  deviceAttributes = [
    { label: 'Battery', value: 'battery' },
    { label: 'RSSI', value: 'rssi' },
    { label: 'Firmware Version', value: 'firmware' },
    { label: 'Last Heartbeat', value: 'heartbeat' },
  ];

  selectPeriod(filters: LevelFilters, period: Period): void {
    filters.period = period;
  }

  onParameterChange(filters: LevelFilters): void {
    filters.selectedItemIds = [];
    filters.deviceAttributes = [];
    this.isItemDropdownOpen = false;
    this.refreshPins();
  }

  hasCategoryItems(filters: LevelFilters | null): boolean {
    return !!filters && CATEGORY_PARAMETERS.has(filters.parameter);
  }

  isDeviceCategory(filters: LevelFilters | null): boolean {
    return filters?.parameter === 'device';
  }

  /** Phase 2: fuzzy substring/subsequence match so "frk12" still finds "Forklift #12". */
  private fuzzyMatch(text: string, query: string): boolean {
    if (!query.trim()) return true;
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    if (haystack.includes(needle)) return true;
    let ti = 0;
    for (const ch of needle) {
      ti = haystack.indexOf(ch, ti);
      if (ti === -1) return false;
      ti++;
    }
    return true;
  }

  searchQuery = '';

  itemsForParameter(parameter: string): MockItem[] {
    let items: MockItem[];
    switch (parameter) {
      case 'employee':
        items = this.employeeItems;
        break;
      case 'asset':
        items = this.assetItems;
        break;
      case 'device':
        items = this.deviceItems;
        break;
      default:
        return [];
    }
    return items.filter((item) => this.fuzzyMatch(item.name, this.searchQuery) || this.fuzzyMatch(item.id, this.searchQuery));
  }

  toggleItemSelection(filters: LevelFilters, id: string): void {
    const idx = filters.selectedItemIds.indexOf(id);
    if (idx >= 0) filters.selectedItemIds.splice(idx, 1);
    else filters.selectedItemIds.push(id);
    this.refreshPins();
  }

  isItemSelected(filters: LevelFilters, id: string): boolean {
    return filters.selectedItemIds.includes(id);
  }

  toggleDeviceAttribute(filters: LevelFilters, value: string): void {
    const idx = filters.deviceAttributes.indexOf(value);
    if (idx >= 0) filters.deviceAttributes.splice(idx, 1);
    else filters.deviceAttributes.push(value);
    this.refreshPins();
  }

  isDeviceAttributeSelected(filters: LevelFilters, value: string): boolean {
    return filters.deviceAttributes.includes(value);
  }

  // ===== Mock items (Employee / Asset / Device categories) =====

  employeeItems: MockItem[] = [
    { id: 'emp-1', name: 'John Doe', coords: { lat: 23.6138, lng: 58.5406, zoom: 19 } },
    { id: 'emp-2', name: 'Jane Smith', coords: { lat: 23.6149, lng: 58.5418, zoom: 19 } },
    { id: 'emp-3', name: 'Ali Hassan', coords: { lat: 23.6128, lng: 58.5395, zoom: 19 } },
  ];

  assetItems: MockItem[] = [
    { id: 'asset-1', name: 'Forklift #12', coords: { lat: 23.6135, lng: 58.5399, zoom: 19 } },
    { id: 'asset-2', name: 'Pallet Jack #04', coords: { lat: 23.6151, lng: 58.542, zoom: 19 } },
  ];

  deviceItems: DeviceItem[] = [
    {
      id: 'dev-1',
      name: 'Wearable Tag 101',
      coords: { lat: 23.6143, lng: 58.541, zoom: 19 },
      battery: 82,
      rssi: -61,
      firmware: '2.3.1',
      lastHeartbeat: '2 min ago',
    },
    {
      id: 'dev-2',
      name: 'Fixed Beacon B2',
      coords: { lat: 23.6146, lng: 58.5419, zoom: 19 },
      battery: 45,
      rssi: -74,
      firmware: '2.2.0',
      lastHeartbeat: '5 min ago',
    },
  ];

  cameraPins: MapPin[] = [
    {
      id: 'cam-1',
      lat: 23.6136,
      lng: 58.5412,
      color: '#1e293b',
      label: 'Lobby Camera',
      kind: 'camera',
      payload: { id: 'cam-1', name: 'Lobby Camera', zoneName: 'Reception' },
    },
    {
      id: 'cam-2',
      lat: 23.6126,
      lng: 58.5397,
      color: '#1e293b',
      label: 'Parking Camera',
      kind: 'camera',
      payload: { id: 'cam-2', name: 'Parking Camera', zoneName: 'Parking Zone' },
    },
  ];

  private deviceAttributeValue(device: DeviceItem, attribute: string): string {
    switch (attribute) {
      case 'battery':
        return `${device.battery}%`;
      case 'rssi':
        return `${device.rssi} dBm`;
      case 'firmware':
        return device.firmware;
      case 'heartbeat':
        return device.lastHeartbeat;
      default:
        return '';
    }
  }

  /** Zones from the real configured hierarchy, each doubling as a "count" marker on the map. */
  private zonePins(): MapPin[] {
    return this.hierarchy.allZones().map((zone, i) => ({
      id: zone.id,
      lat: zone.coords.lat,
      lng: zone.coords.lng,
      color: zone.color,
      label: zone.name,
      kind: 'count' as const,
      payload: { zoneName: zone.name, items: this.mockTrackedItems(zone.name, i) },
    }));
  }

  private mockTrackedItems(zoneName: string, seed: number) {
    const statuses: Array<'online' | 'idle' | 'offline'> = ['online', 'idle', 'offline'];
    return Array.from({ length: 2 + (seed % 2) }, (_, i) => ({
      name: `Asset ${seed * 3 + i + 1}`,
      location: zoneName,
      status: statuses[(seed + i) % statuses.length],
    }));
  }

  private selectedItemPins(filters: LevelFilters | null): MapPin[] {
    if (!filters || !this.hasCategoryItems(filters)) return [];

    if (filters.parameter === 'device') {
      return this.deviceItems
        .filter((d) => filters.selectedItemIds.includes(d.id))
        .map((d) => ({
          id: d.id,
          lat: d.coords.lat,
          lng: d.coords.lng,
          color: '#2563eb',
          label: filters.deviceAttributes.length
            ? `${d.name} (${filters.deviceAttributes.map((a) => this.deviceAttributeValue(d, a)).join(', ')})`
            : d.name,
          kind: 'device' as const,
          payload: {
            id: d.id,
            name: d.name,
            battery: d.battery,
            rssi: d.rssi,
            firmware: d.firmware,
            lastHeartbeat: d.lastHeartbeat,
          },
        }));
    }

    const items = this.itemsForParameter(filters.parameter);
    return items
      .filter((item) => filters.selectedItemIds.includes(item.id))
      .map((item) => ({ id: item.id, lat: item.coords.lat, lng: item.coords.lng, color: '#5b3df5', label: item.name }));
  }

  mapPins: MapPin[] = [];

  private refreshPins(): void {
    this.mapPins = [
      ...this.zonePins(),
      ...this.selectedItemPins(this.currentFilters),
      ...this.cameraPins,
    ];
  }

  // ===== Click-to-popup =====

  activePopup: Popup | null = null;
  cameraClockTime = '';
  private cameraClockInterval?: ReturnType<typeof setInterval>;

  onPinClick(pin: MapPin): void {
    if (!pin.kind) return;
    this.activePopup = { kind: pin.kind, data: pin.payload };
    if (pin.kind === 'camera') this.startCameraClock();
    else this.stopCameraClock();
  }

  closePopup(): void {
    this.activePopup = null;
    this.stopCameraClock();
  }

  private startCameraClock(): void {
    this.stopCameraClock();
    this.cameraClockTime = new Date().toLocaleTimeString();
    this.cameraClockInterval = setInterval(() => {
      this.cameraClockTime = new Date().toLocaleTimeString();
    }, 1000);
  }

  private stopCameraClock(): void {
    if (this.cameraClockInterval) {
      clearInterval(this.cameraClockInterval);
      this.cameraClockInterval = undefined;
    }
  }

  ngOnDestroy(): void {
    this.stopCameraClock();
    this.stopReplayPlayback();
    this.queryParamsSub?.unsubscribe();
  }

  // ===== Existing Statistics panel (unrelated to the spec changes above; left as-is) =====

  selectedPeriod: 'hour' | '4h' | '24h' | '1d' | '3d' | '5d' | 'week' | 'month' = '24h';
  isStatsModalOpen = false;

  periodButtons: { value: 'hour' | '4h' | '24h' | '1d' | '3d' | '5d'; label: string }[] = [
    { value: 'hour', label: 'Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '24h', label: '24 Hour' },
    { value: '1d', label: '1 Day' },
    { value: '3d', label: '3 Day' },
    { value: '5d', label: '5 Day' },
  ];

  stats = {
    topZone: 'Zone A',
    peakTime: '14:00',
    peakDay: 'Monday',
  };

  statOptions: { key: string; label: string; checked: boolean }[] = [
    { key: 'topZone', label: 'Top Zone', checked: true },
    { key: 'peakTime', label: 'Peak Time', checked: true },
    { key: 'peakDay', label: 'Peak Day', checked: true },
  ];

  selectStatsPeriod(period: 'hour' | '4h' | '24h' | '1d' | '3d' | '5d' | 'week' | 'month'): void {
    this.selectedPeriod = period;
  }

  openStatsModal(): void {
    this.isStatsModalOpen = true;
  }

  closeStatsModal(): void {
    this.isStatsModalOpen = false;
  }

  toggleStatOption(key: string): void {
    const opt = this.statOptions.find((o) => o.key === key);
    if (opt) opt.checked = !opt.checked;
  }

  saveStatsSelection(): void {
    this.isStatsModalOpen = false;
  }

  isStatVisible(key: string): boolean {
    return this.statOptions.find((o) => o.key === key)?.checked ?? false;
  }

  trackedPeople = [
    { name: 'Assets1', location: 'Azy floor - Room 101', status: 'online' as const, lastActiveMin: 1 },
    { name: 'Assets2', location: 'Azy floor - Room 102', status: 'online' as const, lastActiveMin: 4 },
    { name: 'Assets3', location: 'Azy floor - Room 103', status: 'idle' as const, lastActiveMin: 22 },
    { name: 'Assets4', location: 'Azy floor - Room 101', status: 'offline' as const, lastActiveMin: 95 },
  ];

  // =====================================================================================
  // Phase 2 enhancements — all additive, client-side/mock-data-driven (no backend here).
  // =====================================================================================

  // ----- Admin: role gate (Viewer/Supervisor/Admin/Technician) -----

  readonly roleLabels = ROLE_LABELS;
  readonly allRoles = ALL_ROLES;

  get currentRole(): UserRole {
    return this.roleService.role();
  }

  setRole(role: string): void {
    this.roleService.setRole(role as UserRole);
  }

  /** Viewer role can look but not draw/edit zones (drives [controlsDisabled] on the map/floor-plan). */
  get mapControlsDisabled(): boolean {
    return !this.roleService.canDraw();
  }

  get canManageGeofencing(): boolean {
    return this.roleService.canManageGeofencing();
  }

  // ----- Advanced multi-level filters: zone / alert status / last-active-time -----

  showAdvancedFilters = false;
  advancedZoneFilter = '';
  advancedStatuses = new Set<'online' | 'idle' | 'offline'>(['online', 'idle', 'offline']);
  advancedLastActiveMax = 0; // 0 = "any"

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  toggleAdvancedStatus(status: 'online' | 'idle' | 'offline'): void {
    if (this.advancedStatuses.has(status)) this.advancedStatuses.delete(status);
    else this.advancedStatuses.add(status);
  }

  isAdvancedStatusChecked(status: 'online' | 'idle' | 'offline'): boolean {
    return this.advancedStatuses.has(status);
  }

  get zoneFilterOptions(): Zone[] {
    return this.hierarchy.allZones();
  }

  get filteredTrackedPeople(): typeof this.trackedPeople {
    return this.trackedPeople.filter((p) => {
      if (!this.advancedStatuses.has(p.status)) return false;
      if (this.advancedLastActiveMax > 0 && p.lastActiveMin > this.advancedLastActiveMax) return false;
      if (this.advancedZoneFilter && !p.location.toLowerCase().includes(this.advancedZoneFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }

  // ----- Live indicator: purely a visual toggle on the "Live" button, no tracking side effects -----

  liveTrackingEnabled = false;

  toggleLiveTracking(): void {
    this.liveTrackingEnabled = !this.liveTrackingEnabled;
  }

  // ----- Replay / time-travel mode (mock 30-minute history, generated once at load) -----

  replayEnabled = false;
  replayOffsetMin = 0; // 0 = now, up to REPLAY_MINUTES = furthest back
  isReplayPlaying = false;
  private replayTimer?: ReturnType<typeof setInterval>;
  private replayHistory: { lat: number; lng: number }[] = [];
  readonly replayMaxMinutes = REPLAY_MINUTES;

  private generateMockHistory(): void {
    const base = { lat: 25.2048, lng: 55.2708 };
    this.replayHistory = Array.from({ length: REPLAY_MINUTES + 1 }, (_, i) => ({
      lat: base.lat + Math.sin(i / 3) * 0.0025 + (Math.random() - 0.5) * 0.0006,
      lng: base.lng + Math.cos(i / 4) * 0.0025 + (Math.random() - 0.5) * 0.0006,
    }));
  }

  toggleReplay(): void {
    this.replayEnabled = !this.replayEnabled;
    if (!this.replayEnabled) this.stopReplayPlayback();
  }

  get replayPosition(): { lat: number; lng: number } {
    return this.replayHistory[REPLAY_MINUTES - this.replayOffsetMin] ?? this.replayHistory[0];
  }

  onReplayScrub(minutesAgo: number): void {
    this.replayOffsetMin = minutesAgo;
    if (!this.mapComponent) return;
    const pos = this.replayPosition;
    this.mapComponent.flyTo({ lat: pos.lat, lng: pos.lng, zoom: 17 });
  }

  toggleReplayPlayback(): void {
    this.isReplayPlaying ? this.stopReplayPlayback() : this.startReplayPlayback();
  }

  private startReplayPlayback(): void {
    if (this.replayOffsetMin <= 0) this.replayOffsetMin = this.replayMaxMinutes;
    this.isReplayPlaying = true;
    this.replayTimer = setInterval(() => {
      if (this.replayOffsetMin <= 0) {
        this.stopReplayPlayback();
        return;
      }
      this.onReplayScrub(this.replayOffsetMin - 1);
    }, 600);
  }

  private stopReplayPlayback(): void {
    this.isReplayPlaying = false;
    if (this.replayTimer) clearInterval(this.replayTimer);
    this.replayTimer = undefined;
  }

  // ----- Sliding contextual detail panel (adds to, doesn't replace, the existing popups) -----

  detailPanel: DetailPanelState | null = null;

  openDetailPanel(): void {
    if (!this.activePopup) return;
    this.detailPanel = { title: this.detailPanelTitle(this.activePopup), kind: this.activePopup.kind, data: this.activePopup.data };
  }

  closeDetailPanel(): void {
    this.detailPanel = null;
  }

  private detailPanelTitle(popup: Popup): string {
    if (popup.kind === 'count') return popup.data.zoneName;
    return popup.data.name;
  }

  get detailPanelTimeline(): TimelineEntry[] {
    if (!this.detailPanel) return [];
    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (this.detailPanel.kind === 'device') {
      return [
        { time: minutesAgo(2), text: 'Heartbeat received' },
        { time: minutesAgo(18), text: 'Entered current zone' },
        { time: minutesAgo(46), text: 'Battery dropped below 90%' },
        { time: minutesAgo(120), text: 'Device came online' },
      ];
    }
    if (this.detailPanel.kind === 'camera') {
      return [
        { time: minutesAgo(1), text: 'Motion detected' },
        { time: minutesAgo(35), text: 'Snapshot captured' },
        { time: minutesAgo(200), text: 'Camera stream reconnected' },
      ];
    }
    if (this.detailPanel.kind === 'asset') {
      const data = this.detailPanel.data as AssetDetailData;
      return [
        { time: minutesAgo(3), text: `Entered ${data.zoneLabel}` },
        { time: minutesAgo(25), text: 'Checked device' },
        { time: minutesAgo(60), text: 'Patrol completed' },
      ];
    }
    return [
      { time: minutesAgo(5), text: 'Occupancy count updated' },
      { time: minutesAgo(40), text: 'Peak occupancy reached' },
      { time: minutesAgo(150), text: 'Zone opened for the shift' },
    ];
  }

  get detailPanelAlarms(): string[] {
    if (!this.detailPanel) return [];
    if (this.detailPanel.kind === 'device' && this.detailPanel.data.battery < 50) {
      return [`Low battery warning (${this.detailPanel.data.battery}%)`];
    }
    if (this.detailPanel.kind === 'count') {
      const offline = this.detailPanel.data.items?.filter((i: { status: string }) => i.status === 'offline').length ?? 0;
      return offline > 0 ? [`${offline} item(s) reporting offline in this zone`] : [];
    }
    if (this.detailPanel.kind === 'asset') {
      const data = this.detailPanel.data as AssetDetailData;
      const alarms: string[] = [];
      if (data.battery < 50) alarms.push('Low Battery Warning');
      if (data.signal === 'Weak') alarms.push('Weak Signal Alert');
      return alarms;
    }
    return [];
  }

  locateDetailOnMap(): void {
    if (!this.detailPanel) return;
    if (this.detailPanel.kind === 'count') {
      this.locateZoneByName(this.detailPanel.data.zoneName);
    }
    this.closeDetailPanel();
    this.closePopup();
  }

  /** Real-world object types assigned to dropped asset icons, so a zone reads "Laptop 2",
   *  "Fan 1", etc. instead of a generic "Unique Asset 2" — picked deterministically per
   *  asset id (see `hashString`) so the same icon always resolves to the same type. */
  private readonly assetTypePool = [
    'Laptop', 'Fan', 'Projector', 'Printer', 'Router', 'Chair',
    'Fire Extinguisher', 'Camera', 'Forklift', 'Generator', 'Monitor', 'Scanner',
  ];
  private readonly assetStatusPool: Array<'online' | 'idle' | 'offline'> = ['online', 'idle', 'offline'];
  private readonly assetStatusLabels: Record<'online' | 'idle' | 'offline', string> = {
    online: 'Active',
    idle: 'Idle',
    offline: 'Offline',
  };

  /** Deterministic mock fields for one placed asset icon, shared by the single-asset detail
   *  panel and the zone's full asset list so both agree on the same name/type/status. */
  private buildAssetFields(asset: ZoneAsset, indexInZone: number) {
    const seed = this.hashString(asset.id);
    const type = this.assetTypePool[seed % this.assetTypePool.length];
    const statusKey = this.assetStatusPool[seed % this.assetStatusPool.length];
    const signals = ['Weak', 'Moderate', 'Strong'];
    const minutesAgo = 1 + (seed % 10);
    return {
      name: `${type} ${indexInZone + 1}`,
      type,
      statusKey,
      statusLabel: this.assetStatusLabels[statusKey],
      battery: 40 + (seed % 60),
      signal: signals[seed % signals.length],
      lastSync: `${minutesAgo} min${minutesAgo === 1 ? '' : 's'} ago`,
    };
  }

  /** Opens the details panel for one asset icon dropped inside a drawn floor-plan zone,
   *  in the same "Profile Details / Timeline Activity / Recent Alarms / Last Health Report"
   *  format used elsewhere, with mock fields derived deterministically from the asset's id
   *  so the same icon always shows the same details. */
  onZoneAssetClick(event: { zone: DrawnZone; asset: ZoneAsset }): void {
    const { zone, asset } = event;
    const categoryLabel = this.assetTrackingCategories.find((c) => c.value === this.floorFilters.category)?.label ?? 'Unique Asset';
    const indexInZone = zone.assets.findIndex((a) => a.id === asset.id);
    const fields = this.buildAssetFields(asset, indexInZone);

    const data: AssetDetailData = {
      zoneId: zone.id,
      assetId: asset.id,
      name: fields.name,
      type: fields.type,
      status: fields.statusLabel,
      zoneLabel: this.zoneTypeLabel(zone.zoneType),
      battery: fields.battery,
      signal: fields.signal,
      lastSync: fields.lastSync,
    };

    this.detailPanel = { title: `${categoryLabel} Details`, kind: 'asset', data };
  }

  /** Left-docked panel listing every asset placed in the clicked zone — name, type, status —
   *  opened by clicking the zone's "<Label>: N" badge (mirrors the right-docked asset-details
   *  panel opened by clicking an individual icon). */
  zoneAssetsPanel: ZoneAssetsPanelState | null = null;

  onZoneAssetsSummaryClick(zone: DrawnZone): void {
    const items: ZoneAssetSummaryItem[] = zone.assets.map((asset, i) => {
      const fields = this.buildAssetFields(asset, i);
      return { assetId: asset.id, name: fields.name, type: fields.type, status: fields.statusKey };
    });
    this.zoneAssetsPanel = { zoneId: zone.id, title: `${this.zoneAssetLabel} in this zone`, items };
  }

  closeZoneAssetsPanel(): void {
    this.zoneAssetsPanel = null;
  }

  /** Location-column click in the zone's asset list: zooms/pans the floor plan to that
   *  specific asset's icon and briefly highlights it, without closing the summary panel —
   *  lets clustered icons that looked identical be told apart one at a time. */
  locateZoneAsset(assetId: string, event?: Event): void {
    event?.stopPropagation();
    const panel = this.zoneAssetsPanel;
    if (!panel) return;
    const zone = this.floorPlanComponent?.drawnZones.find((z) => z.id === panel.zoneId);
    const asset = zone?.assets.find((a) => a.id === assetId);
    // Close the panel first — on narrow viewports it covers almost the entire
    // screen, so the floor plan has to be visible for the zoom to be seen at all.
    this.closeZoneAssetsPanel();
    if (zone && asset) this.floorPlanComponent?.flyToAsset(zone, asset);
  }

  /** Clicking a row in the zone's asset list opens that one asset's full details panel. */
  openZoneAssetDetailFromSummary(assetId: string): void {
    const panel = this.zoneAssetsPanel;
    if (!panel) return;
    const zone = this.floorPlanComponent?.drawnZones.find((z) => z.id === panel.zoneId);
    const asset = zone?.assets.find((a) => a.id === assetId);
    this.closeZoneAssetsPanel();
    if (zone && asset) this.onZoneAssetClick({ zone, asset });
  }

  /** "Remove from zone" action in the asset details panel — replaces the old click-to-remove
   *  on the pin itself, now that clicking a pin opens its details instead. */
  removeDetailAsset(): void {
    if (!this.detailPanel || this.detailPanel.kind !== 'asset') return;
    const data = this.detailPanel.data as AssetDetailData;
    const zone = this.floorPlanComponent?.drawnZones.find((z) => z.id === data.zoneId);
    if (zone) this.floorPlanComponent?.removeAsset(zone, data.assetId);
    this.closeDetailPanel();
  }

  private zoneTypeLabel(zoneType?: ZoneType): string {
    return ZONE_TYPE_OPTIONS.find((o) => o.value === zoneType)?.label ?? 'Custom Zone';
  }

  private hashString(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return hash;
  }

  // ----- Geofencing rule builder (mock rules; simulated firing, see checkGeofenceTransition) -----

  readonly geofenceActionLabels = GEOFENCE_ACTION_LABELS;
  readonly geofenceActions = GEOFENCE_ACTIONS;

  isGeofenceModalOpen = false;
  newRuleZoneId = '';
  newRuleTrigger: GeofenceTrigger = 'enter';
  newRuleAction: GeofenceAction = 'notify';

  get geofenceRules(): GeofenceRule[] {
    return this.geofenceService.rules();
  }

  get geofenceEvents() {
    return this.geofenceService.events();
  }

  openGeofenceModal(): void {
    this.isGeofenceModalOpen = true;
  }

  closeGeofenceModal(): void {
    this.isGeofenceModalOpen = false;
  }

  addGeofenceRule(): void {
    const zone = this.hierarchy.allZones().find((z) => z.id === this.newRuleZoneId);
    if (!zone) return;
    this.geofenceService.addRule({
      zoneId: zone.id,
      zoneName: zone.name,
      trigger: this.newRuleTrigger,
      action: this.newRuleAction,
    });
    this.newRuleZoneId = '';
  }

  toggleGeofenceRule(id: string): void {
    this.geofenceService.toggleRule(id);
  }

  deleteGeofenceRule(id: string): void {
    this.geofenceService.deleteRule(id);
  }

  simulateGeofenceRule(rule: GeofenceRule): void {
    this.geofenceService.simulateFire(rule);
  }

  // ----- Lightweight heuristic "insights" panel (rule-based, explicitly not ML/AI) -----

  get insights(): string[] {
    const results: string[] = [];

    const idleTooLong = this.trackedPeople.filter((p) => p.status === 'idle' && p.lastActiveMin > 15);
    if (idleTooLong.length) {
      results.push(`${idleTooLong.length} asset(s) idle for over 15 minutes — check for stalled equipment.`);
    }

    const lowBattery = this.deviceItems.filter((d) => d.battery < 50);
    if (lowBattery.length) {
      results.push(`${lowBattery.length} device(s) below 50% battery — plan a swap soon.`);
    }

    if (results.length === 0) {
      results.push('No anomalies detected right now.');
    }
    return results;
  }
}
