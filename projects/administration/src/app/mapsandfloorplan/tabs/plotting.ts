import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Ellipsis,
  Image,
  ListFilter,
  LucideAngularModule,
  MapPin,
  Move,
  MousePointer2,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2
} from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { MapViewer } from '../map-viewer/map-viewer';
import { AssetLivePopup } from '../asset-live-popup/asset-live-popup';
import { AssetTelemetryService, GatewayAsset, GatewayAssets, LiveState } from '../asset-telemetry.service';
import { ZonePopupInfo } from '../asset-live-popup/asset-live-popup';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MapZone, PlotItem, PlotKind, TONE_HEX, Tone, fmtDate, fmtTime } from '../maps.data';
import { MapsStore } from '../maps.store';

/** Device & Asset Plotting: place devices and assets on the plan, reposition them, and inspect a plot. */
@Component({
  standalone: true,
  selector: 'app-maps-plotting',
  imports: [FormsModule, LucideAngularModule, MapViewer, MapCanvas, AssetLivePopup],
  templateUrl: './plotting.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `
    .swatches { display: flex; gap: 6px; }
    .swatches button { width: 22px; height: 22px; border: 2px solid #fff; border-radius: 6px; cursor: pointer; box-shadow: 0 0 0 1px var(--adm-border); }
    .swatches button.on { box-shadow: 0 0 0 2px var(--adm-purple); }
    .unplotted { padding: 0; }
    .unplotted .panel__head { padding: 12px 14px 0; }
    .unplotted .list { padding: 0 10px 10px; margin: 0; }
    .rhead__icon--solid { border-style: solid; }
    .map-stage { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  `
})
export class PlottingTab {
  readonly store = inject(MapsStore);
  readonly icons = {
    ChevronDown, ChevronUp, Cpu, Ellipsis, Image, ListFilter, MapPin, Move, MousePointer2, Package, Plus, Search, Sparkles, Trash2
  };
  readonly tones: Tone[] = ['purple', 'blue', 'green', 'orange', 'red', 'pink'];

  listTab: PlotKind = 'device';
  rightTab: 'details' | 'settings' = 'details';
  search = '';
  activeOnly = false;
  unplottedOpen = true;
  /** Item waiting for a click on the plan (plot or reposition). */
  placingId: string | null = null;
  plotMenu: PlotKind | null = null;
  menuFor: string | null = null;
  show = { devices: true, assets: true, zones: true, labels: true };
  showFilter: 'all' | 'devices' | 'assets' = 'all';

  settings = { snap: true, grid: 1, labelMode: 'ID', autoZone: true };

  date = fmtDate;
  time = fmtTime;

  get list(): PlotItem[] {
    const q = this.search.trim().toLowerCase();
    return this.store.items.filter(
      (i) =>
        i.kind === this.listTab &&
        (!q || `${i.name} ${i.code} ${i.type}`.toLowerCase().includes(q)) &&
        (!this.activeOnly || i.status === 'Active')
    );
  }

  get selected(): PlotItem | undefined {
    return this.store.selectedItem;
  }

  get selectedZoneLabel(): string {
    const z = this.store.zones.find((x) => x.id === this.selected?.zoneId);
    return z ? `${z.name} (${z.code})` : 'Not in a zone';
  }

  hex(t: Tone): string {
    return TONE_HEX[t];
  }

  /** Plan size in metres (60 m × 32 m when the plan has no dimensions). */
  get planSize(): { w: number; h: number } {
    const p = this.store.currentPlan;
    return { w: p?.widthMeters || 60, h: p?.heightMeters || 32 };
  }

  /** Map coordinates in metres on the current plan. */
  metres(i: PlotItem): { x: string; y: string } {
    const { w, h } = this.planSize;
    return { x: (((i.x ?? 0) / 100) * w).toFixed(2), y: (((i.y ?? 0) / 100) * h).toFixed(2) };
  }

  get emptyText(): string {
    if (this.store.itemsLoading) return `Loading ${this.listTab}s…`;
    return this.count(this.listTab) ? `No ${this.listTab}s match.` : `No ${this.listTab}s registered yet.`;
  }

  count(kind: PlotKind): number {
    return this.store.items.filter((i) => i.kind === kind).length;
  }

  /**
   * Assets per gateway from the Dashboard service (live): a tag counts at the gateway of its newest reading
   * (NetworkTimeSeries meta.gatewayid), and the tag's asset comes from Tag Management. Keyed by gateway id in lower case.
   */
  gatewayCounts: Record<string, { count: number; names: string[] }> | null = null;
  /** The same feed in full (assets, tags, last reading) for the device popup, keyed by gateway id in lower case. */
  private gateways: Record<string, GatewayAssets> = {};
  gatewayState: LiveState = 'connecting';

  constructor() {
    inject(AssetTelemetryService)
      .gatewaysLive()
      .pipe(takeUntilDestroyed())
      .subscribe((m) => {
        this.gatewayState = m.state;
        if (!m.data) return;
        const counts: Record<string, { count: number; names: string[] }> = {};
        const full: Record<string, GatewayAssets> = {};
        for (const g of m.data) {
          const key = g.gatewayId.toLowerCase();
          full[key] = g;
          counts[key] = { count: g.assetCount, names: g.assets.map((a) => (a.assetName ? `${a.assetName} (${a.assetId})` : a.assetId)) };
        }
        this.gateways = full;
        this.gatewayCounts = counts;
      });
  }

  /** What the gateways feed says about a device (matched by device id or code); null when it reports nothing. */
  gatewayOf(i: PlotItem): GatewayAssets | null {
    return this.gateways[i.itemId?.toLowerCase()] ?? this.gateways[i.code?.toLowerCase()] ?? null;
  }

  /** Asset whose live readings (tags, battery, RSSI, online status) are shown over the map; null when closed. */
  livePopup: PlotItem | null = null;
  /** Where the popup's asset sits on the map (pixels), so the popup opens above it; null when it is not plotted. */
  popupAnchor: { x: number; y: number; inView: boolean } | null = null;

  select(i: PlotItem): void {
    this.store.selectedItemId = i.id;
    this.listTab = i.kind;
    this.rightTab = 'details';
    // clicking an asset or a device (on the map or in the list) opens its own popup
    this.livePopup = i;
    this.zonePopup = null;
  }

  /** A zone whose "Total Assets" label was clicked: its popup lists the linked assets its gateways hear. */
  zonePopup: { zone: MapZone; gateways: PlotItem[] } | null = null;

  openZoneTotals(e: { zone: MapZone; gateways: PlotItem[] }): void {
    if (!e.gateways.length) return;
    this.zonePopup = e;
    // the popup needs an item; the zone's first gateway (a device opens no socket of its own)
    this.livePopup = e.gateways[0];
  }

  closePopup(): void {
    this.livePopup = null;
    this.zonePopup = null;
  }

  /** The zone popup's content from the live gateways feed: one row per asset across the zone's gateways. */
  get zonePopupInfo(): ZonePopupInfo | null {
    const zp = this.zonePopup;
    if (!zp) return null;
    // same object until the zone or the feed changes (a new object on every check would trip change detection)
    if (this.zoneInfoCache?.zp === zp && this.zoneInfoCache.feed === this.gateways) return this.zoneInfoCache.info;
    const info = this.buildZoneInfo(zp);
    this.zoneInfoCache = { zp, feed: this.gateways, info };
    return info;
  }

  private zoneInfoCache: { zp: { zone: MapZone; gateways: PlotItem[] }; feed: Record<string, GatewayAssets>; info: ZonePopupInfo } | null = null;

  private buildZoneInfo(zp: { zone: MapZone; gateways: PlotItem[] }): ZonePopupInfo {
    const feeds = zp.gateways.map((g) => this.gatewayOf(g)).filter((g): g is GatewayAssets => !!g);
    const assets = new Map<string, GatewayAsset>();
    for (const a of feeds.flatMap((f) => f.assets)) {
      const key = a.assetId.toLowerCase();
      const seen = assets.get(key);
      assets.set(key, seen
        ? { ...seen, tagIds: [...new Set([...seen.tagIds, ...a.tagIds])], lastSeenAt: [seen.lastSeenAt, a.lastSeenAt].filter(Boolean).sort().at(-1) ?? null }
        : a);
    }
    return {
      name: zp.zone.name,
      code: zp.zone.code,
      gateways: zp.gateways.map((g) => g.name),
      assets: [...assets.values()].sort((a, b) => (a.assetName ?? a.assetId).localeCompare(b.assetName ?? b.assetId)),
      unlinkedTags: new Set(feeds.flatMap((f) => f.unlinkedTagIds.map((t) => t.toLowerCase()))).size
    };
  }

  togglePlotMenu(event: MouseEvent, kind: PlotKind): void {
    event.stopPropagation();
    this.plotMenu = this.plotMenu === kind ? null : kind;
    this.menuFor = null;
  }

  toggleMenu(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === id ? null : id;
    this.plotMenu = null;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.plotMenu = null;
    this.menuFor = null;
  }

  unplottedOf(kind: PlotKind): PlotItem[] {
    return this.store.unplotted.filter((i) => i.kind === kind);
  }

  /** Arm placement for an item; the next plan click drops it there. */
  startPlacing(i: PlotItem): void {
    if (!this.store.editing) {
      this.store.notify('Switch to Edit to plot items');
      return;
    }
    if (!this.store.currentPlan) {
      // A floor with only a Master Data image gets its floor plan first
      this.store.ensurePlan(() => this.startPlacing(this.store.items.find((x) => x.id === i.id) ?? i));
      return;
    }
    this.plotMenu = null;
    this.menuFor = null;
    this.select(i);
    this.livePopup = null;
    this.placingId = i.id;
  }

  place(pos: { x: number; y: number }): void {
    const id = this.placingId;
    this.placingId = null;
    if (!id) return;
    let { x, y } = pos;
    if (this.settings.snap) {
      // Snap to the grid size in metres
      const { w, h } = this.planSize;
      const gx = (this.settings.grid / w) * 100;
      const gy = (this.settings.grid / h) * 100;
      x = Math.round(x / gx) * gx;
      y = Math.round(y / gy) * gy;
    }
    const item = this.store.items.find((i) => i.id === id);
    if (!item) return;
    this.store.selectedItemId = id;
    const zone = this.store.zoneAt(x, y);
    this.store.plot(id, x, y, `${item.name} (${item.code}) plotted${zone ? ` in ${zone.name} (${zone.code})` : ''}`);
  }

  /** Auto Plot (Bulk): drop every unplotted item inside a zone, or on a free spot (one PUT per item). */
  autoPlot(): void {
    if (!this.store.currentPlan) {
      this.store.ensurePlan(() => this.autoPlot());
      return;
    }
    const pending = this.store.unplotted;
    if (!pending.length) {
      this.store.notify('Nothing left to plot');
      return;
    }
    const zone = this.store.zones.find((z) => z.type === 'Production') ?? this.store.zones[0];
    const moves = pending.map((item, n) => ({
      id: item.id,
      x: zone ? zone.x + zone.w * (0.25 + 0.2 * (n % 3)) : 20 + 15 * (n % 5),
      y: zone ? zone.y + zone.h * (0.75 - 0.15 * Math.floor(n / 3)) : 20 + 15 * Math.floor(n / 5)
    }));
    const n = moves.length;
    this.store.plotMany(moves, `${n} item${n === 1 ? '' : 's'} plotted automatically - review their positions`);
  }

  remove(i: PlotItem): void {
    this.store.unplot(i.id, `${i.name} (${i.code}) removed from the map`);
  }

  /** Marker colour (kept on this page only - the plot API has no colour). */
  setTone(i: PlotItem, t: Tone): void {
    this.store.setTone(i, t);
  }

  rotate(i: PlotItem, deg: number): void {
    this.store.rotate(i, deg);
  }

  replaceIcon(): void {
    this.store.notify('Icon library is not connected yet - pick a colour instead');
  }
}
