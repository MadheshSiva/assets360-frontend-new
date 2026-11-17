import { Component, DestroyRef, ElementRef, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { Battery, BatteryFull, BatteryLow, BatteryMedium, Clock, LucideAngularModule, MapPin, Package, Router, Signal, Tag, X } from 'lucide-angular';
import { PlotItem } from '../maps.data';
import { AssetTelemetry, AssetTelemetryService, GatewayAsset, GatewayAssets, LiveState, TagTelemetry } from '../asset-telemetry.service';

/** What the zone popup shows: the zone, its gateways and the linked assets they hear (one row per asset). */
export interface ZonePopupInfo {
  name: string;
  code: string;
  /** Names of the plotted gateways in the zone. */
  gateways: string[];
  assets: GatewayAsset[];
  /** Tags heard in the zone that are not linked to an asset. */
  unlinkedTags: number;
}

/**
 * Live popup for a plotted asset: its name and id, and for each tag the latest NetworkTimeSeries reading
 * (online status, battery, RSSI, gateway, time), kept current over the Dashboard service's WebSocket.
 */
@Component({
  standalone: true,
  selector: 'app-asset-live-popup',
  imports: [LucideAngularModule, DatePipe],
  template: `
    <span class="alp__caret" [style.left.px]="pos.caretX" aria-hidden="true"></span>
    <section class="alp" role="dialog" [attr.aria-label]="zone ? 'Linked assets in zone' : isDevice ? 'Device details' : 'Live asset details'" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()" (wheel)="$event.stopPropagation()">
      <header class="alp__head">
        <span class="alp__icon"><lucide-icon [img]="zone ? icons.MapPin : isDevice ? icons.Router : icons.Package" [size]="18"></lucide-icon></span>
        <div class="alp__title">
          @if (zone) {
            <strong>{{ zone.name }}</strong>
            <small>Zone ID: <b>{{ zone.code }}</b> · {{ zone.gateways.join(', ') }}</small>
          } @else if (isDevice) {
            <strong>{{ item.name }}</strong>
            <small>Device ID: <b>{{ item.code || item.itemId }}</b></small>
          } @else {
            <strong>{{ data?.assetName || item.name }}</strong>
            <small>Asset ID: <b>{{ data?.assetTag || item.code }}</b>@if ((data?.assetRegistrationId || item.itemId) !== (data?.assetTag || item.code)) { · {{ data?.assetRegistrationId || item.itemId }} }</small>
          }
        </div>
        <span class="alp__live" [class.is-live]="liveState === 'live'" [attr.title]="stateText">
          <i></i>{{ liveState === 'live' ? 'Live' : liveState === 'connecting' ? 'Connecting' : 'Reconnecting' }}
        </span>
        <button type="button" class="alp__close" (click)="close.emit()" aria-label="Close"><lucide-icon [img]="icons.X" [size]="16"></lucide-icon></button>
      </header>

      <div class="alp__body">
        @if (zone) {
          <!-- zone (Total Assets clicked): every linked asset heard by the zone's gateway(s), live -->
          <h4 class="dev__h">Linked assets <span class="dev__n">{{ zone.assets.length }}</span></h4>
          @for (a of zone.assets; track a.assetId) {
            <article class="dev__asset">
              <span class="dev__aic"><lucide-icon [img]="icons.Package" [size]="14"></lucide-icon></span>
              <div class="dev__ainfo">
                <strong>{{ a.assetName || a.assetId }}</strong>
                <small>{{ a.assetId }} · <span class="mono">{{ a.tagIds.join(', ') }}</span></small>
              </div>
              @if (a.lastSeenAt) { <small class="muted dev__ago" [title]="a.lastSeenAt | date: 'dd MMM yyyy, HH:mm:ss'">{{ ago(a.lastSeenAt) }}</small> }
            </article>
          } @empty {
            <p class="alp__empty">{{ liveState === 'live' ? 'No linked asset is reporting in this zone. Link tags to assets in Tag Management.' : 'Connecting…' }}</p>
          }
          @if (zone.unlinkedTags) {
            <p class="dev__note">+ {{ zone.unlinkedTags }} tag{{ zone.unlinkedTags === 1 ? '' : 's' }} not linked to an asset</p>
          }
        } @else if (isDevice) {
          <!-- device (icon clicked): the device itself only -->
          <dl class="tag__grid dev__info">
            <div><dt>Device name</dt><dd>{{ item.name }}</dd></div>
            <div><dt>Device ID</dt><dd class="mono">{{ item.code || item.itemId }}</dd></div>
            <div><dt>Type</dt><dd>{{ item.type || '–' }}</dd></div>
            <div><dt>Model</dt><dd>{{ item.model || '–' }}</dd></div>
            <div class="dev__wide">
              <dt>Last reading</dt>
              <dd>
                @if (gateway?.lastSeenAt; as seen) {
                  <span [title]="seen | date: 'dd MMM yyyy, HH:mm:ss'">{{ ago(seen) }}<small class="muted"> · {{ seen | date: 'dd MMM yyyy, HH:mm:ss' }}</small></span>
                } @else {
                  <span class="muted">{{ liveState === 'live' ? 'No readings in the last 24 h' : 'Connecting…' }}</span>
                }
              </dd>
            </div>
          </dl>
        } @else if (!data) {
          <p class="alp__empty">{{ state === 'live' ? 'Loading readings…' : 'Connecting to live data…' }}</p>
        } @else if (!data.tags.length) {
          <p class="alp__empty">No tag is linked to this asset. Assign one in <b>Tracking &amp; IoT › Tag Management</b>.</p>
        } @else {
          @for (t of data.tags; track t.tagId) {
            <article class="tag">
              <div class="tag__head">
                <span class="tag__id"><lucide-icon [img]="icons.Tag" [size]="14"></lucide-icon>{{ t.tagId }}</span>
                <span class="pill" [class]="'pill pill--' + connKey(t)"><i></i>{{ t.connection }}</span>
              </div>
              <dl class="tag__grid">
                <div>
                  <dt>Battery</dt>
                  <dd>
                    @if (t.battery !== null) {
                      <span class="bat" [class]="'bat bat--' + batteryKey(t.battery)"><lucide-icon [img]="batteryIcon(t.battery)" [size]="16"></lucide-icon>{{ t.battery }}%</span>
                      <span class="bar"><span [style.width.%]="t.battery" [class]="'bar__fill bat--' + batteryKey(t.battery)"></span></span>
                    } @else { <span class="muted">–</span> }
                  </dd>
                </div>
                <div>
                  <dt>Signal (RSSI)</dt>
                  <dd>
                    @if (t.rssi !== null) {
                      <span class="rssi" [class.flash]="flashing.has(t.tagId)">
                        <span class="bars" [attr.aria-label]="quality(t.rssi).label">
                          @for (n of [1, 2, 3, 4]; track n) { <i [class.on]="n <= quality(t.rssi).bars"></i> }
                        </span>
                        {{ t.rssi }} dBm
                      </span>
                      <small class="muted">{{ quality(t.rssi).label }}</small>
                    } @else { <span class="muted">–</span> }
                  </dd>
                </div>
                <div>
                  <dt>Gateway</dt>
                  <dd class="mono">{{ t.gatewayId || '–' }}</dd>
                </div>
                <div>
                  <dt>Last reading</dt>
                  <dd>
                    @if (t.timestamp) {
                      <span [title]="t.timestamp | date: 'dd MMM yyyy, HH:mm:ss'">{{ ago(t.timestamp) }}</span>
                      <small class="muted">{{ t.timestamp | date: 'HH:mm:ss' }}</small>
                    } @else { <span class="muted">Never</span> }
                  </dd>
                </div>
              </dl>
            </article>
          }
        }
      </div>
    </section>
  `,
  styles: `
    /* Above the marker (pointer underneath), below it near the top edge, or docked top-right when the asset is not plotted */
    :host { position: absolute; z-index: 1100; width: 300px; max-width: calc(100% - 16px); pointer-events: none; }
    :host(.above) { transform: translate(-50%, calc(-100% - 22px)); }
    :host(.below) { transform: translate(-50%, 22px); }
    :host(.docked) { top: 12px !important; right: 12px; left: auto !important; transform: none; }
    :host(.hidden) { display: none; }
    .alp, .alp__caret { pointer-events: auto; }
    .alp__caret { position: absolute; width: 14px; height: 14px; margin-left: -7px; background: #fff; border: 1px solid #ececf3; transform: rotate(45deg); z-index: 1; }
    :host(.above) .alp__caret { bottom: -7px; border-top: 0; border-left: 0; }
    :host(.below) .alp__caret { top: -7px; border-bottom: 0; border-right: 0; }
    :host(.docked) .alp__caret { display: none; }
    .alp { position: relative; background: #fff; border: 1px solid #ececf3; border-radius: 12px; box-shadow: 0 14px 34px -12px rgba(30, 20, 80, 0.34), 0 2px 8px rgba(15, 23, 42, 0.06);
      overflow: hidden; animation: alp-in 0.2s cubic-bezier(0.21, 1.02, 0.73, 1) both; font-size: 12.5px; color: #111827; }
    .alp__head { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; padding: 9px 6px 9px 10px; border-bottom: 1px solid #f1f1f6; }
    .alp__icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #ede9fe; color: #5b3fd4; }
    .alp__title { min-width: 0; display: flex; flex-direction: column; }
    .alp__title strong { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alp__title small { color: #6b7280; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alp__title b { color: #111827; font-weight: 600; }
    .alp__live { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; color: #6b7280; font-size: 11px; font-weight: 600; }
    .alp__live i { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; }
    .alp__live.is-live { background: #dcfce7; color: #15803d; }
    .alp__live.is-live i { background: #16a34a; animation: alp-pulse 1.6s ease-out infinite; }
    .alp__close { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: #9ca3af; cursor: pointer; }
    .alp__close:hover { background: #f3f4f6; color: #111827; }
    .alp__body { max-height: 230px; overflow-y: auto; padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
    .alp__empty { margin: 4px 2px; color: #6b7280; line-height: 1.45; }
    .tag { border: 1px solid #f0f0f5; border-radius: 10px; padding: 8px 10px; background: #fcfcfe; }
    .tag__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .tag__id { display: inline-flex; align-items: center; gap: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 600; color: #374151; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .pill--online { background: #dcfce7; color: #15803d; }
    .pill--offline { background: #fee2e2; color: #b91c1c; }
    .pill--idle { background: #fef3c7; color: #b45309; }
    .pill--nodata { background: #f3f4f6; color: #6b7280; }
    .tag__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; margin: 0; }
    .tag__grid dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; margin-bottom: 2px; }
    .tag__grid dd { margin: 0; display: flex; flex-direction: column; gap: 2px; font-weight: 600; }
    .tag__grid small { font-weight: 400; font-size: 11px; }
    .muted { color: #9ca3af; font-weight: 400; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; }
    .bat { display: inline-flex; align-items: center; gap: 5px; }
    .bar { height: 4px; border-radius: 4px; background: #eef0f4; overflow: hidden; }
    .bar__fill { display: block; height: 100%; border-radius: 4px; background: currentColor; transition: width 0.4s ease; }
    .bat--good { color: #16a34a; }
    .bat--mid { color: #d97706; }
    .bat--low { color: #dc2626; }
    .rssi { display: inline-flex; align-items: center; gap: 7px; padding: 1px 6px; margin: -1px -6px; border-radius: 6px; transition: background 0.6s ease; }
    .rssi.flash { background: #ede9fe; transition: none; }
    .bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
    .bars i { width: 3px; border-radius: 1px; background: #e5e7eb; }
    .bars i:nth-child(1) { height: 4px; } .bars i:nth-child(2) { height: 7px; } .bars i:nth-child(3) { height: 10px; } .bars i:nth-child(4) { height: 14px; }
    .bars i.on { background: #5b3fd4; }
    .dev__seen { display: flex; flex-direction: column; gap: 2px; padding: 2px 2px 8px; border-bottom: 1px solid #f1f1f6; }
    .dev__label, .dev__h { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; font-weight: 600; margin: 0; }
    .dev__val { font-weight: 600; }
    .dev__val small { font-weight: 400; font-size: 11px; }
    .dev__h { display: flex; align-items: center; gap: 6px; padding: 2px 2px 0; }
    .dev__n { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 10.5px; letter-spacing: 0; }
    .dev__asset { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid #f0f0f5; border-radius: 10px; background: #fcfcfe; }
    .dev__aic { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; background: #ede9fe; color: #5b3fd4; }
    .dev__ainfo { min-width: 0; display: flex; flex-direction: column; }
    .dev__ainfo strong { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dev__ainfo small { color: #6b7280; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dev__ago { font-size: 11px; white-space: nowrap; }
    .dev__note { margin: 0 2px; color: #9ca3af; font-size: 11.5px; }
    .dev__info { padding: 2px 2px 0; }
    .dev__wide { grid-column: 1 / -1; }
    @keyframes alp-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
    @keyframes alp-pulse { 0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.5); } 100% { box-shadow: 0 0 0 7px rgba(22, 163, 74, 0); } }
    @media (prefers-reduced-motion: reduce) { .alp, .alp__live.is-live i { animation: none; } }
  `,
})
export class AssetLivePopup implements OnChanges, OnDestroy {
  /** The plotted asset (itemId = asset registration id, code = asset tag). */
  @Input({ required: true }) item!: PlotItem;
  /** The asset's marker in map pixels (from MapCanvas `anchorMove`); null docks the popup in the map's corner. */
  @Input() anchor: { x: number; y: number; inView: boolean } | null = null;
  /** For a device: what the live gateways feed says about it (assets it hears, last reading); null until it arrives. */
  @Input() gateway: GatewayAssets | null = null;
  /** For a device: state of the page's gateways WebSocket (the popup opens no socket of its own). */
  @Input() gatewayState: LiveState = 'connecting';
  @Output() close = new EventEmitter<void>();

  /**
   * Zone mode (a zone's Total Assets label was clicked): the zone and the linked assets heard by its gateway(s),
   * from the page's gateways feed. Null for the device / asset popups.
   */
  @Input() zone: ZonePopupInfo | null = null;

  get isDevice(): boolean {
    return this.item.kind === 'device';
  }

  /** Connection shown in the Live badge: the asset's own socket, or the page's gateways socket for a device / zone. */
  get liveState(): LiveState {
    return this.zone || this.isDevice ? this.gatewayState : this.state;
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Placement over the map: centred on the marker, kept inside the map's width; below it when there is no room above. */
  get pos(): { left: number; top: number; mode: 'above' | 'below' | 'docked' | 'hidden'; caretX: number } {
    const a = this.anchor;
    if (!a) return { left: 0, top: 0, mode: 'docked', caretX: 0 };
    if (!a.inView) return { left: 0, top: 0, mode: 'hidden', caretX: 0 };
    const el = this.host.nativeElement;
    const width = el.offsetWidth || 300;
    const height = el.offsetHeight || 240;
    const mapWidth = el.parentElement?.clientWidth ?? width;
    const half = width / 2;
    const left = mapWidth < width + 16 ? mapWidth / 2 : Math.min(Math.max(a.x, half + 8), mapWidth - half - 8);
    const caretX = Math.min(Math.max(half + (a.x - left), 16), width - 16);
    return { left, top: a.y, mode: a.y < height + 30 ? 'below' : 'above', caretX };
  }

  @HostBinding('style.left.px') get hostLeft(): number | null {
    return this.pos.mode === 'above' || this.pos.mode === 'below' ? this.pos.left : null;
  }

  @HostBinding('style.top.px') get hostTop(): number | null {
    return this.pos.mode === 'above' || this.pos.mode === 'below' ? this.pos.top : null;
  }

  @HostBinding('class') get hostClass(): string {
    return this.pos.mode;
  }

  private readonly telemetry = inject(AssetTelemetryService);
  readonly icons = { Package, Tag, X, Router, Clock, Signal, MapPin };

  data: AssetTelemetry | null = null;
  state: LiveState = 'connecting';
  /** Tags whose RSSI just changed (highlighted briefly). */
  readonly flashing = new Set<string>();
  /** Re-renders "12 s ago" every second. */
  now = Date.now();

  private live?: Subscription;
  private readonly clock = setInterval(() => (this.now = Date.now()), 1000);
  private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.clock));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['item']) return;
    const prev = changes['item'].previousValue as PlotItem | undefined;
    if (prev && prev.id === this.item.id) return;
    this.data = null;
    this.live?.unsubscribe();
    this.live = undefined;
    // a device reads the page's gateways feed (input `gateway`); only an asset opens its own socket
    if (this.isDevice) return;
    this.live = this.telemetry.live(this.item.itemId || this.item.code).subscribe((e) => {
      this.state = e.state;
      if (e.data) this.apply(e.data);
    });
  }

  ngOnDestroy(): void {
    this.live?.unsubscribe();
    this.flashTimers.forEach((t) => clearTimeout(t));
  }

  get stateText(): string {
    return this.liveState === 'live' ? 'Receiving live readings' : 'Waiting for the live connection';
  }

  /** Highlights the RSSI of every tag whose value changed since the last message. */
  private apply(next: AssetTelemetry): void {
    const before = new Map(this.data?.tags.map((t) => [t.tagId, t.rssi]) ?? []);
    for (const t of next.tags) {
      if (!before.has(t.tagId) || before.get(t.tagId) === t.rssi) continue;
      this.flashing.add(t.tagId);
      clearTimeout(this.flashTimers.get(t.tagId));
      this.flashTimers.set(t.tagId, setTimeout(() => this.flashing.delete(t.tagId), 900));
    }
    this.data = next;
  }

  connKey(t: TagTelemetry): string {
    return t.connection === 'No data' ? 'nodata' : t.connection.toLowerCase();
  }

  batteryKey(pct: number): 'good' | 'mid' | 'low' {
    return pct > 50 ? 'good' : pct > 20 ? 'mid' : 'low';
  }

  batteryIcon(pct: number) {
    return pct > 70 ? BatteryFull : pct > 35 ? BatteryMedium : pct > 10 ? BatteryLow : Battery;
  }

  /** Signal quality from RSSI (dBm): -60 or better Excellent … below -80 Weak. */
  quality(rssi: number): { bars: number; label: string } {
    return rssi >= -60 ? { bars: 4, label: 'Excellent' } : rssi >= -70 ? { bars: 3, label: 'Good' } : rssi >= -80 ? { bars: 2, label: 'Fair' } : { bars: 1, label: 'Weak' };
  }

  /** "Just now", "45 s ago", "3 min ago", "2 h ago", "4 d ago". */
  ago(iso: string): string {
    const s = Math.max(0, Math.round((this.now - new Date(iso).getTime()) / 1000));
    return s < 5 ? 'Just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
  }
}
