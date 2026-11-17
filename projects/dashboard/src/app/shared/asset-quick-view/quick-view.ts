import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../../../src/environments/environment';
import type { ConnectedAssetDetail, Dashboard } from '../../services/dashboard/dashboard';

// ===== Asset registration DTOs (Asset service, camelCase) — only the fields the Quick View reads =====

/** One row of GET api/asset-registrations (AssetListItemResponse). */
export interface AssetRegistrationListItem {
  id: string;
  assetRegistrationId: string;
  assetName: string | null;
  assetTag: string | null;
  imageUrl: string | null;
  category: string | null;
  assetType: string | null;
  siteName: string | null;
  status: string | null;
  criticality: string | null;
  createdAt: string | null;
}

/** Response of GET api/asset-registrations. */
export interface AssetRegistrationList {
  items: AssetRegistrationListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Response of GET api/asset-registrations/{assetRegistrationId} (AssetRegistrationResponse). */
export interface AssetRegistrationDetail {
  id: string;
  assetRegistrationId: string;
  basicInformation: {
    assetName: string | null;
    assetTag: string | null;
    model: string | null;
    manufacturer: string | null;
    serialNumber: string | null;
    status: string | null;
    condition: string | null;
    criticality: string | null;
    images: string[] | null;
  } | null;
  classification: {
    category: string | null;
    subCategory: string | null;
    assetType: string | null;
    assetSubType: string | null;
    criticality: string | null;
    department: string | null;
    lifecycleStage: string | null;
    maintenanceFrequency: number | null;
    maintenanceFrequencyUnit: string | null;
    lastMaintenanceDate: string | null;
    nextMaintenanceDate: string | null;
  } | null;
  locationAssignment: {
    location: {
      siteName: string | null;
      buildingName: string | null;
      floorName: string | null;
      zoneName: string | null;
      roomName: string | null;
      locationPath: string | null;
    } | null;
    assignment: {
      custodianDepartment: string | null;
      assignedToName: string | null;
      responsibleTeam: string | null;
      costCenter: string | null;
    } | null;
  } | null;
  purchaseWarranty: {
    purchase: {
      manufacturer: string | null;
      supplierVendor: string | null;
      purchaseDate: string | null;
      purchaseCost: number | null;
      totalCost: number | null;
      currency: string | null;
    } | null;
    documents: { fileName: string | null; url: string | null }[] | null;
    warranty: { warrantyEndDate: string | null; serviceProvider: string | null } | null;
  } | null;
  additionalInformation: {
    operational: {
      lastMaintenanceDate: string | null;
      nextMaintenanceDate: string | null;
      maintenanceFrequency: number | null;
      maintenanceFrequencyUnit: string | null;
    } | null;
    attachments: { fileName: string | null; url: string | null }[] | null;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** What the Asset Quick View widget shows; built from one registration (plus its IoT link when connected). */
export interface QuickViewAsset {
  registrationId: string;
  tag: string;
  name: string;
  image: string | null;
  status: string;
  category: string;
  subCategory: string;
  type: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  room: string;
  locationPath: string;
  manufacturer: string;
  model: string;
  serial: string;
  criticality: string;
  condition: string;
  department: string;
  custodian: string;
  /** yyyy-MM-dd or ''. */
  commissioned: string;
  lastService: string;
  nextService: string;
  maintenanceFrequency: string;
  purchaseDate: string;
  cost: number | null;
  currency: string;
  vendor: string;
  warrantyEnd: string;
  documents: { name: string; url: string }[];
  /** Last change to the record (ISO date-time) or ''. */
  lastUpdate: string;
  /** IoT link from the KPIs' connected assets; null when the asset has no device. */
  iot: { network: string; gateway: string; lastSeen: string; readings: number } | null;
}

/** Absolute URL of a file the Asset API returns as a relative path. */
export function assetFileUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return environment.assetApiUrl.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const text = (...v: (string | null | undefined)[]) => v.find((x) => !!x?.trim())?.trim() ?? '';

/** Quick View shape of a registration; `connected` is its row in the KPIs' connected assets, if any. */
export function toQuickView(dto: AssetRegistrationDetail, connected?: ConnectedAssetDetail | null): QuickViewAsset {
  const b = dto.basicInformation;
  const c = dto.classification;
  const loc = dto.locationAssignment?.location;
  const asg = dto.locationAssignment?.assignment;
  const p = dto.purchaseWarranty?.purchase;
  const op = dto.additionalInformation?.operational;
  const files = [...(dto.purchaseWarranty?.documents ?? []), ...(dto.additionalInformation?.attachments ?? [])]
    .filter((f) => !!f?.url)
    .map((f) => ({ name: f.fileName || f.url!.split('/').pop() || 'Document', url: assetFileUrl(f.url) }));
  const every = op?.maintenanceFrequency || c?.maintenanceFrequency;
  const freq = every ? `Every ${every} ${(op?.maintenanceFrequency ? op.maintenanceFrequencyUnit : c?.maintenanceFrequencyUnit) ?? ''}`.trim() : '';
  return {
    registrationId: dto.assetRegistrationId,
    tag: text(b?.assetTag, dto.assetRegistrationId),
    name: text(b?.assetName),
    image: assetFileUrl(b?.images?.[0]) || null,
    status: text(b?.status),
    category: text(c?.category),
    subCategory: text(c?.subCategory),
    type: text(c?.assetType),
    site: text(loc?.siteName),
    building: text(loc?.buildingName),
    floor: text(loc?.floorName),
    zone: text(loc?.zoneName),
    room: text(loc?.roomName),
    locationPath: text(loc?.locationPath),
    manufacturer: text(b?.manufacturer, p?.manufacturer),
    model: text(b?.model),
    serial: text(b?.serialNumber),
    criticality: text(c?.criticality, b?.criticality),
    condition: text(b?.condition),
    department: text(c?.department, asg?.custodianDepartment),
    custodian: text(asg?.assignedToName),
    // no commissioning date on the registration: purchase date, else when it was registered
    commissioned: day(p?.purchaseDate) || day(dto.createdAt),
    lastService: day(op?.lastMaintenanceDate) || day(c?.lastMaintenanceDate),
    nextService: day(op?.nextMaintenanceDate) || day(c?.nextMaintenanceDate),
    maintenanceFrequency: freq,
    purchaseDate: day(p?.purchaseDate),
    cost: p?.totalCost ?? p?.purchaseCost ?? null,
    currency: text(p?.currency),
    vendor: text(p?.supplierVendor),
    warrantyEnd: day(dto.purchaseWarranty?.warranty?.warrantyEndDate),
    documents: files,
    lastUpdate: text(dto.updatedAt, dto.createdAt),
    iot: connected
      ? { network: text(connected.networkStatus) || 'Unknown', gateway: text(connected.gatewayId), lastSeen: text(connected.lastSeenAt), readings: connected.readingCount ?? 0 }
      : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Dec 2, 2024" of a yyyy-MM-dd; '-' when missing. */
export function qvDate(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return '-';
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/** "Nov 8, 2026 17:49" of an API date-time, in local time; '-' when missing. */
export function qvDateTime(v: string | null | undefined): string {
  const d = v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Drill-down of a connected asset, with a button that shows it in the Quick View. */
export function connectedAssetDrill(a: ConnectedAssetDetail, show: (assetRegistrationId: string) => void) {
  return {
    title: `${a.assetTag} · ${a.assetName}`,
    subtitle: [a.assetType, a.siteName].filter(Boolean).join(' · '),
    stats: [
      { label: 'Network', value: a.networkStatus || '-', color: (a.networkStatus ?? '').toLowerCase() === 'online' ? '#16a34a' : undefined },
      { label: 'Readings', value: a.readingCount ?? 0 },
    ],
    fields: [
      { label: 'Asset Status', value: a.assetStatus || '-' }, { label: 'Gateway', value: a.gatewayId || '-' },
      { label: 'First Seen', value: qvDateTime(a.firstSeenAt) }, { label: 'Last Seen', value: qvDateTime(a.lastSeenAt) },
    ],
    actions: [{ label: 'Show in Quick View', run: () => show(a.assetRegistrationId) }],
  };
}

/** CSS modifier of a registration status, e.g. "Under Maintenance" → "under-maintenance". */
export function statusKey(status: string): string {
  return (status || 'unknown').toLowerCase().replace(/[^a-z]+/g, '-');
}

/**
 * State of an Asset Quick View widget: the registered assets (GET api/asset-registrations) to page through and the
 * one on show (GET api/asset-registrations/{id}). The latest request wins when several are made quickly.
 */
export class AssetQuickView {
  /** Registered assets, newest first. */
  items: AssetRegistrationListItem[] = [];
  asset: QuickViewAsset | null = null;
  loading = false;
  error = '';
  private connected: ConnectedAssetDetail[] = [];
  private readonly show$ = new Subject<string>();

  constructor(private readonly api: Dashboard, private readonly destroyRef: DestroyRef) {
    this.show$
      .pipe(
        switchMap((id) =>
          this.api.getAssetRegistration(id).pipe(
            map((dto) => ({ dto, failed: false })),
            catchError(() => of({ dto: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ dto, failed }) => {
        this.loading = false;
        this.error = failed || !dto ? 'Could not load this asset.' : '';
        this.asset = dto ? toQuickView(dto, this.connectedOf(dto.assetRegistrationId)) : null;
      });
  }

  /** Loads the asset list and shows `preferId` (else the newest asset). */
  load(preferId?: string): void {
    this.loading = true;
    this.api
      .getAssetRegistrations()
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        this.items = res?.items ?? [];
        const id = preferId && this.items.some((i) => i.assetRegistrationId === preferId) ? preferId : this.items[0]?.assetRegistrationId;
        if (id) this.show(id);
        else {
          this.loading = false;
          this.error = res ? '' : 'Could not load registered assets.';
        }
      });
  }

  /** Shows the asset with this registration id. */
  show(assetRegistrationId: string | null | undefined): void {
    if (!assetRegistrationId) return;
    this.loading = true;
    this.error = '';
    this.show$.next(assetRegistrationId);
  }

  /** True when an asset is registered under this tag. */
  hasTag(tag: string | null | undefined): boolean {
    return !!this.byTag(tag);
  }

  /** Shows the asset with this tag when it is registered; false when it is not. */
  showTag(tag: string | null | undefined): boolean {
    const row = this.byTag(tag);
    if (row) this.show(row.assetRegistrationId);
    return !!row;
  }

  private byTag(tag: string | null | undefined): AssetRegistrationListItem | undefined {
    const key = (tag ?? '').trim().toLowerCase();
    return key ? this.items.find((i) => (i.assetTag ?? '').trim().toLowerCase() === key) : undefined;
  }

  /** Connected assets from the KPIs; refreshes the IoT link of the asset on show. */
  setConnected(list: ConnectedAssetDetail[]): void {
    this.connected = list ?? [];
    if (this.asset) {
      const c = this.connectedOf(this.asset.registrationId);
      this.asset = {
        ...this.asset,
        iot: c ? { network: c.networkStatus || 'Unknown', gateway: c.gatewayId || '', lastSeen: c.lastSeenAt || '', readings: c.readingCount ?? 0 } : null,
      };
    }
  }

  /** 0-based position of the asset on show in the list, or -1. */
  get index(): number {
    return this.asset ? this.items.findIndex((i) => i.assetRegistrationId === this.asset!.registrationId) : -1;
  }

  /** Steps to the previous (-1) or next (+1) registered asset, wrapping around. */
  step(by: -1 | 1): void {
    const n = this.items.length;
    if (!n) return;
    const at = this.index < 0 ? 0 : (this.index + by + n) % n;
    this.show(this.items[at].assetRegistrationId);
  }

  private connectedOf(id: string): ConnectedAssetDetail | null {
    return this.connected.find((c) => c.assetRegistrationId === id) ?? null;
  }
}
