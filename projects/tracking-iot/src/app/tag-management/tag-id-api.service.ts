import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_ASSETS, DEMO_SITES, assetByRef, siteById, siteByName } from '../shared/master-data.data';
import { DEMO_USER, demo, demoError } from '../shared/tracking-api';
import { LinkedAsset, PREFIX, TagId, TagStatus, TagType, Tech } from './tag-data';
import { TAG_IDS, TAG_TECHNOLOGIES } from './tag-ids.data';

/**
 * A tag as /api/tag-ids returns it (addressed by tagId). List rows carry registeredOn, value and validation;
 * single-tag responses may still carry id / createdAt / createdBy instead, so those fields are all optional.
 */
export interface TagIdDto {
  id?: string;
  tagId: string;
  tagType: string;
  technology: string;
  /** Name of the encoded value for the technology (EPC, MAC Address, ...). */
  valueLabel?: string | null;
  /** The encoded value (EPC / barcode / QR payload / MAC). */
  value?: string | null;
  registeredOn?: string | null;
  /** Server-side validation: "Valid" / "Invalid", with the reason. */
  validation?: string | null;
  validationMessage?: string | null;
  assetRegistrationId: string | null;
  assetCode?: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  locationName: string | null;
  status: string | null;
  assignedAt?: string | null;
  lastSeenAt: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  clientId?: string | null;
  tenantId?: string | null;
}

/** Fields saved for a tag on create / update. */
export interface TagIdRequest {
  tagId: string;
  /** The number part of the tag id (BLE-000123 → "000123"; a device id kept as entered). Required. */
  tagNumber: string;
  /** The encoded value (EPC / MAC / barcode / QR payload / UID). Required. */
  value: string | null;
  tagType: string;
  technology: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  locationName: string | null;
  status: TagStatus;
  lastSeenAt: string | null;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** GET /api/tag-ids/options (technologies, their id prefix and tag types) */
export interface TagTechnologyOption {
  technology: string;
  idPrefix: string;
  /** Name of the encoded value (EPC, MAC Address, UID, Encoded Value). */
  valueLabel: string;
  /** Tag types the technology comes in, as the API names them ("Barcode Label", "Hard Tag", ...). */
  tagTypes: string[];
}

/** A master-data site, for the site pickers. */
export interface SiteOption {
  id: string;
  name: string;
}

/** The page's tag type for the API's text ("Barcode Label", "QR Label", "Label", "Hard Tag", "Beacon"). */
export function pageType(tagType: string): TagType {
  const t = (tagType ?? '').toLowerCase();
  return t.includes('beacon') ? 'Beacon' : t.includes('hard') ? 'Hard Tag' : 'Label';
}

/** The API's tag type text for a page type: labels are named after their technology ("Barcode Label", "QR Label"). */
export function apiType(tech: Tech, type: TagType): string {
  if (type !== 'Label') return type;
  return tech === 'Barcode' ? 'Barcode Label' : tech === 'QR Code' ? 'QR Label' : 'Label';
}

function epoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * A page tag for an API tag. The API keeps no encoded value (EPC / barcode / MAC), reader, assignment date,
 * telemetry or change history: the value is empty (shown as "—"), and the history holds what the record itself
 * says (registration and last read).
 */
export function tagFromDto(dto: TagIdDto): TagId {
  const registeredOn = epoch(dto.registeredOn) ?? epoch(dto.createdAt) ?? Date.now();
  const lastSeen = epoch(dto.lastSeenAt);
  const assignedOn = epoch(dto.assignedAt);
  const tech = dto.technology as Tech;
  const status: TagStatus = (['Assigned', 'Available', 'Inactive'] as TagStatus[]).find((s) => s === dto.status) ?? (dto.assetRegistrationId ? 'Assigned' : 'Available');
  const by = dto.createdBy || '—';
  return {
    id: dto.tagId,
    tech,
    type: pageType(dto.tagType),
    code: dto.value ?? '',
    asset: dto.assetRegistrationId ? { tag: dto.assetCode || dto.assetRegistrationId, kind: dto.assetName?.trim() || 'Asset', real: false } : null,
    site: dto.siteName ?? '',
    location: dto.locationName ?? '',
    status,
    assignedOn,
    lastSeen,
    reader: '',
    registeredOn,
    history: [
      ...(lastSeen !== null ? [{ at: lastSeen, text: 'Last read by a reader', by: 'System' }] : []),
      ...(assignedOn !== null && dto.assetName ? [{ at: assignedOn, text: `Assigned to ${dto.assetName}`, by }] : []),
      { at: registeredOn, text: `Registered as ${tech} ${dto.tagType.toLowerCase()}`, by },
    ],
    siteId: dto.siteId,
    apiTagType: dto.tagType,
    apiValidation: dto.validation ?? null,
    apiValidationMessage: dto.validationMessage ?? null,
    valueLabel: dto.valueLabel ?? null,
  };
}

/** One KPI of GET /api/tag-ids/summary: this month's count, last month's and the change in %. */
export interface TagSummaryCountDto {
  count: number;
  lastMonthCount: number;
  changePercent: number;
}

/** GET /api/tag-ids/summary */
export interface TagSummaryDto {
  total: TagSummaryCountDto;
  assigned: TagSummaryCountDto;
  available: TagSummaryCountDto;
  inactive: TagSummaryCountDto;
  failingValidation: number;
  byTechnology: Record<string, number>;
}

export type TagSummaryKey = 'Total' | 'Assigned' | 'Available' | 'Inactive';

/** The summary as the page uses it: KPI counts with their change vs last month. */
export interface TagSummary {
  counts: Record<TagSummaryKey, number>;
  /** Change vs last month in % (null when the API gave none). */
  change: Record<TagSummaryKey, number | null>;
  failingValidation: number;
  byTechnology: Record<string, number>;
}

export function summaryFromDto(dto: TagSummaryDto | null): TagSummary | null {
  if (!dto?.total) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const parts: [TagSummaryKey, TagSummaryCountDto | undefined][] = [
    ['Total', dto.total],
    ['Assigned', dto.assigned],
    ['Available', dto.available],
    ['Inactive', dto.inactive],
  ];
  const counts = {} as Record<TagSummaryKey, number>;
  const change = {} as Record<TagSummaryKey, number | null>;
  for (const [k, v] of parts) {
    counts[k] = n(v?.count) ?? 0;
    change[k] = n(v?.changePercent);
  }
  return { counts, change, failingValidation: n(dto.failingValidation) ?? 0, byTechnology: dto.byTechnology ?? {} };
}

/** The number part of a tag id: the id without its technology prefix (BLE-000123 → "000123"). */
export function tagNumberOf(t: { id: string; tech: Tech }): string {
  const prefix = `${PREFIX[t.tech]}-`.toLowerCase();
  return t.id.toLowerCase().startsWith(prefix) ? t.id.slice(prefix.length) : t.id;
}

/** Tag Management (static demo, tag-ids.data.ts). */
@Injectable({ providedIn: 'root' })
export class TagIdApiService {
  private readonly auth = inject(AuthService);
  /** Emits after a tag is created, updated or deleted (the summary counts are then stale). */
  readonly changed$ = new Subject<void>();

  /** Name recorded on changes: the signed-in user, or the stored e-mail. */
  currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  getAll(): Observable<TagId[]> {
    return demo(TAG_IDS.map(tagFromDto));
  }

  /** KPI counts with the change vs last month. */
  summary(): Observable<TagSummary | null> {
    const monthAgo = Date.now() - 30 * 86_400_000;
    const count = (pred: (t: TagIdDto) => boolean): TagSummaryCountDto => {
      const now = TAG_IDS.filter(pred).length;
      const last = TAG_IDS.filter((t) => pred(t) && Date.parse(t.registeredOn ?? '') < monthAgo).length;
      return { count: now, lastMonthCount: last, changePercent: last ? Math.round(((now - last) / last) * 1000) / 10 : 0 };
    };
    const byTechnology: Record<string, number> = {};
    for (const t of TAG_IDS) byTechnology[t.technology] = (byTechnology[t.technology] ?? 0) + 1;
    return demo(summaryFromDto({
      total: count(() => true),
      assigned: count((t) => t.status === 'Assigned'),
      available: count((t) => t.status === 'Available'),
      inactive: count((t) => t.status === 'Inactive'),
      failingValidation: TAG_IDS.filter((t) => t.validation === 'Invalid').length,
      byTechnology,
    }));
  }

  get(tagId: string): Observable<TagId> {
    const t = TAG_IDS.find((x) => x.tagId === tagId);
    return t ? demo(tagFromDto(t)) : demoError(`Tag ${tagId} was not found.`);
  }

  /** Technologies, their id prefix and tag types. */
  technologies(): Observable<TagTechnologyOption[]> {
    return demo(TAG_TECHNOLOGIES);
  }

  /** Sites for the site pickers. */
  sites(): Observable<SiteOption[]> {
    return demo(DEMO_SITES.map((s) => ({ id: s.id, name: s.name })));
  }

  /** Registered assets for the "Link to asset" pickers. */
  assets(): Observable<LinkedAsset[]> {
    return demo(DEMO_ASSETS.map((a) => ({ tag: a.tag, kind: a.name, real: true })).sort((a, b) => a.kind.localeCompare(b.kind) || a.tag.localeCompare(b.tag)));
  }

  create(t: TagId): Observable<TagId> {
    if (TAG_IDS.some((x) => x.tagId.toLowerCase() === t.id.toLowerCase())) return demoError(`Tag ${t.id} is already registered.`);
    const dto = this.toDto(t, null);
    TAG_IDS.unshift(dto);
    this.changed$.next();
    return demo(tagFromDto(dto));
  }

  /** Full replace of the tag fields (the tag id itself cannot change). */
  update(t: TagId): Observable<TagId> {
    const i = TAG_IDS.findIndex((x) => x.tagId === t.id);
    if (i < 0) return demoError(`Could not save ${t.id}: it is no longer registered.`);
    TAG_IDS[i] = this.toDto(t, TAG_IDS[i]);
    this.changed$.next();
    return demo(tagFromDto(TAG_IDS[i]));
  }

  delete(tagId: string): Observable<void> {
    const i = TAG_IDS.findIndex((x) => x.tagId === tagId);
    if (i >= 0) TAG_IDS.splice(i, 1);
    this.changed$.next();
    return demo(undefined as void);
  }

  private toDto(t: TagId, old: TagIdDto | null): TagIdDto {
    const req = this.request(t);
    const asset = assetByRef(req.assetRegistrationId);
    const site = siteById(req.siteId) ?? siteByName(req.siteName);
    const tech = TAG_TECHNOLOGIES.find((x) => x.technology === req.technology);
    const now = new Date().toISOString();
    const regId = asset?.regId ?? req.assetRegistrationId;
    const assignedChanged = (old?.assetRegistrationId ?? null) !== regId;
    return {
      id: old?.id, tagId: req.tagId, tagType: req.tagType, technology: req.technology, valueLabel: tech?.valueLabel ?? null, value: req.value,
      registeredOn: old?.registeredOn ?? now, validation: req.value ? 'Valid' : 'Invalid', validationMessage: req.value ? null : 'Encoded value is missing',
      assetRegistrationId: regId, assetCode: asset?.tag ?? req.assetRegistrationId, assetName: asset?.name ?? req.assetName,
      siteId: site?.id ?? req.siteId, siteName: site?.name ?? req.siteName, locationName: req.locationName, status: req.status,
      assignedAt: regId ? (assignedChanged ? now : old?.assignedAt ?? now) : null, lastSeenAt: req.lastSeenAt,
      createdBy: old?.createdBy ?? req.createdBy, createdAt: old?.createdAt ?? now, clientId: 'demo-client', tenantId: 'demo-tenant',
    };
  }

  private request(t: TagId): TagIdRequest {
    const assigned = t.status === 'Assigned' && !!t.asset;
    const kind = t.asset?.kind;
    return {
      tagId: t.id,
      tagNumber: tagNumberOf(t),
      value: t.code.trim() || null,
      // keep the stored type text while the page type is unchanged
      tagType: t.apiTagType && pageType(t.apiTagType) === t.type ? t.apiTagType : apiType(t.tech, t.type),
      technology: t.tech,
      // a linked asset is only kept on an Assigned tag
      assetRegistrationId: assigned ? t.asset!.tag : null,
      assetName: assigned && kind && kind !== 'Asset' ? kind : null,
      siteId: t.site ? t.siteId ?? null : null,
      siteName: t.site || null,
      locationName: t.location || null,
      status: t.status === 'Assigned' && !t.asset ? 'Available' : t.status,
      lastSeenAt: t.lastSeen !== null ? new Date(t.lastSeen).toISOString() : null,
      createdBy: this.currentUser(),
      clientId: 'demo-client',
      tenantId: 'demo-tenant',
    };
  }
}
