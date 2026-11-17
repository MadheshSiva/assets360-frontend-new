import { Injectable, Injector, inject, signal } from '@angular/core';
import { Observable, finalize, map, shareReplay, switchMap, tap } from 'rxjs';
import { MdmApi, MdmAudit, apiErrorMessage, inSequence } from '../../shared/mdm-api';
import { BfzService } from '../building-floor-zone/bfz.service';
import { BusinessUnitService } from '../business-unit/business-unit.service';
import { DepartmentService } from '../department/department.service';
import { OrganizationService } from '../organization/organization.service';
import { StructureAddressDto, StructureContactDto, StructureReference, fromApiAddress, reference, toLocalStamp } from '../structure-api';
import { SiteContact, SiteFilters, SiteRecord, SiteStatus, SiteType } from './site.model';

const RESOURCE = 'sites';

interface SiteDto extends MdmAudit {
  siteName: string;
  code: string;
  businessUnit: StructureReference | null;
  department: StructureReference | null;
  siteType: string | null;
  city: string | null;
  country: string | null;
  organization: StructureReference | null;
  parentSite: StructureReference | null;
  timeZone: string | null;
  description: string | null;
  imageUrl: string | null;
  images: string[] | null;
  address: StructureAddressDto | null;
  latitude: number | null;
  longitude: number | null;
  manager: StructureContactDto | null;
  emergency: StructureContactDto | null;
  openTime: string | null;
  closeTime: string | null;
  workingDays: string[] | null;
  open24x7: boolean;
  allowAssetAssignment: boolean;
  enableTracking: boolean;
}

/**
 * Sites from `/api/master-data/sites`. A site's `id` is its API id, which buildings, locations and
 * child sites refer to. Business unit and department are kept by name, the organization by code.
 */
@Injectable({ providedIn: 'root' })
export class SiteService {
  private readonly api = inject(MdmApi);
  private readonly injector = inject(Injector);
  private readonly organizations = inject(OrganizationService);
  private readonly businessUnits = inject(BusinessUnitService);
  private readonly departments = inject(DepartmentService);
  private records: SiteRecord[] = [];
  private firstLoad?: Observable<SiteRecord[]>;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Buildings use this service for their sites, so look them up lazily
  private get bfz(): BfzService {
    return this.injector.get(BfzService);
  }

  load(): Observable<SiteRecord[]> {
    this.loading.set(true);
    this.error.set(null);
    return this.organizations.ensureLoaded().pipe(
      switchMap(() => this.api.list<SiteDto>(RESOURCE)),
      map((dtos) => (this.records = dtos.map((dto) => this.toRecord(dto)))),
      tap({ error: (err) => this.error.set(apiErrorMessage(err)) }),
      finalize(() => this.loading.set(false))
    );
  }

  /** Loads once and shares the result; used by pages that only need sites for lookups. */
  ensureLoaded(): Observable<SiteRecord[]> {
    this.firstLoad ??= this.load().pipe(
      tap({ error: () => (this.firstLoad = undefined) }),
      shareReplay(1)
    );
    return this.firstLoad;
  }

  all(): SiteRecord[] {
    return this.records;
  }

  find(id: string | null): SiteRecord | undefined {
    return id ? this.records.find((r) => r.id === id) : undefined;
  }

  /** `id` and every site under it, so none can become its own parent. */
  descendantIds(id: string): Set<string> {
    const found = new Set([id]);
    for (let added = true; added; ) {
      added = false;
      for (const r of this.records) {
        if (r.parentId && found.has(r.parentId) && !found.has(r.id)) {
          found.add(r.id);
          added = true;
        }
      }
    }
    return found;
  }

  /** Sites refer to business units by name. */
  ofBusinessUnit(name: string): SiteRecord[] {
    return this.records.filter((r) => r.businessUnit === name);
  }

  renameBusinessUnit(oldName: string, newName: string): void {
    if (oldName === newName) return;
    this.records = this.records.map((r) => (r.businessUnit === oldName ? { ...r, businessUnit: newName } : r));
  }

  /** Sites refer to departments by name. */
  renameDepartment(oldName: string, newName: string): void {
    if (oldName === newName) return;
    this.records = this.records.map((r) => (r.department === oldName ? { ...r, department: newName } : r));
  }

  childSites(id: string): SiteRecord[] {
    return this.records.filter((r) => r.parentId === id);
  }

  filter(f: SiteFilters): SiteRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.status || r.status === f.status) &&
        (!f.siteType || r.siteType === f.siteType) &&
        (!f.businessUnit || r.businessUnit === f.businessUnit) &&
        (!term ||
          [r.name, r.code, r.address.line1, r.address.line2, r.address.city, r.address.country].some((v) => v.toLowerCase().includes(term)))
    );
  }

  stats() {
    const active = this.records.filter((r) => r.status === 'Active').length;
    return {
      total: this.records.length,
      active,
      inactive: this.records.length - active,
      buildings: this.bfz.buildings().length,
      plants: this.records.filter((r) => r.siteType === 'Plant').length,
      warehouses: this.records.filter((r) => r.siteType === 'Warehouse').length
    };
  }

  buildingsOf(id: string) {
    return this.bfz.buildings(id);
  }

  organizationName(code: string): string {
    return this.organizations.find(code)?.name ?? code;
  }

  isCodeTaken(code: string, exceptId: string | null): boolean {
    const wanted = code.trim().toLowerCase();
    return this.records.some((r) => r.code.toLowerCase() === wanted && r.id !== exceptId);
  }

  /** New sites get their id from the API when saved. */
  nextId(): string {
    return '';
  }

  /** Creates (no id yet) or updates the site, then stores what the server returned. */
  persist(record: SiteRecord): Observable<SiteRecord> {
    const body = this.toRequest(record);
    const call = record.id ? this.api.update<SiteDto>(RESOURCE, record.id, body) : this.api.create<SiteDto>(RESOURCE, body);
    return call.pipe(
      map((dto) => {
        const saved = this.toRecord(dto, record);
        this.store(saved);
        return saved;
      })
    );
  }

  setStatus(record: SiteRecord, status: SiteStatus): Observable<SiteRecord> {
    return this.api.setStatus<SiteDto>(RESOURCE, record.id, status).pipe(
      map((dto) => {
        const saved = { ...record, status: (dto.status as SiteStatus) ?? status, updatedOn: toLocalStamp(dto.updatedAt) || record.updatedOn };
        this.store(saved);
        return saved;
      })
    );
  }

  /** Deletes one at a time; sites deleted before a failure are still removed locally. */
  delete(ids: string[]): Observable<unknown> {
    return inSequence(ids.map((id) => this.api.remove(RESOURCE, id).pipe(tap(() => this.forget(id)))));
  }

  private store(record: SiteRecord): void {
    const index = this.records.findIndex((r) => r.id === record.id);
    this.records = index >= 0 ? this.records.map((r, i) => (i === index ? record : r)) : [...this.records, record];
  }

  private forget(id: string): void {
    this.records = this.records
      .filter((r) => r.id !== id)
      .map((r) => (r.parentId === id ? { ...r, parentId: null } : r));
  }

  private toRecord(dto: SiteDto, previous?: SiteRecord): SiteRecord {
    const known = previous ?? this.find(dto.id);
    const contact = (c: StructureContactDto | null): SiteContact => ({
      name: c?.name ?? '',
      designation: c?.designation ?? '',
      email: c?.email ?? '',
      phoneCountry: c?.phoneCountry ?? 'United Arab Emirates',
      phone: c?.phone ?? ''
    });
    const address = fromApiAddress(dto.address);
    return {
      id: dto.id,
      code: dto.code,
      name: dto.siteName,
      siteType: (dto.siteType ?? '') as SiteType,
      organizationCode: this.organizations.codeOf(dto.organization?.id) ?? '',
      businessUnit: dto.businessUnit?.name ?? '',
      department: dto.department?.name ?? '',
      parentId: dto.parentSite?.id ?? null,
      timeZone: dto.timeZone ?? '',
      description: dto.description ?? '',
      status: (dto.status as SiteStatus) ?? 'Active',
      image: dto.imageUrl,
      images: dto.images ?? [],
      address: { ...address, city: address.city || dto.city || '', country: address.country || dto.country || '' },
      lat: dto.latitude ?? null,
      lng: dto.longitude ?? null,
      manager: contact(dto.manager),
      emergency: contact(dto.emergency),
      openTime: dto.openTime ?? '',
      closeTime: dto.closeTime ?? '',
      workingDays: dto.workingDays ?? [],
      open24x7: dto.open24x7,
      allowAssetAssignment: dto.allowAssetAssignment,
      enableTracking: dto.enableTracking,
      // Counts owned by the asset and people modules
      assets: known?.assets ?? 0,
      people: known?.people ?? 0,
      createdOn: toLocalStamp(dto.createdAt),
      updatedOn: toLocalStamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  private toRequest(r: SiteRecord): object {
    const unit = r.businessUnit ? this.businessUnits.findByName(r.businessUnit) : undefined;
    const department = r.department
      ? this.departments.all().find((d) => d.name === r.department && (!unit || d.businessUnitCode === unit.code))
      : undefined;
    return {
      siteName: r.name,
      code: r.code,
      siteType: r.siteType || null,
      organization: this.organizations.refOf(r.organizationCode),
      businessUnit: unit ? this.businessUnits.refOf(unit.code) : null,
      department: department ? this.departments.refOf(department.code) : null,
      parentSite: reference(r.parentId, this.find(r.parentId)?.name),
      city: r.address.city,
      country: r.address.country,
      timeZone: r.timeZone,
      description: r.description,
      imageUrl: r.image,
      images: r.images,
      address: r.address,
      latitude: r.lat,
      longitude: r.lng,
      manager: r.manager,
      emergency: r.emergency,
      openTime: r.openTime,
      closeTime: r.closeTime,
      workingDays: r.workingDays,
      open24x7: r.open24x7,
      allowAssetAssignment: r.allowAssetAssignment,
      enableTracking: r.enableTracking,
      status: r.status
    };
  }
}
