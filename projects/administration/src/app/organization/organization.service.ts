import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, concatMap, from, map, of, switchMap, tap, throwError, toArray } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { ORGANIZATIONS } from '../shared/admin-common';
import { LocationType, OrgLocation, SummaryRow, SummaryStat, SummaryTab } from './organization.model';
import { LOCATION_TYPES, seedSummaryTabs } from './organization.data';

/** LocationResponse from the Administration API. */
interface LocationDto {
  locationId: string;
  locationCode: string;
  locationName: string;
  locationType: string;
  parentLocation: { locationId: string; locationCode: string; locationName: string } | null;
  address: string | null;
  country: string;
  city: string;
  timeZone: string;
  locationManager: string;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  tenantId: string | null;
  clientId: string | null;
}

/** Request body for POST {administrationApiUrl}api/organization/locations */
interface CreateLocationRequest {
  locationCode: string;
  locationName: string;
  locationType: string;
  parentLocationId: string | null;
  address: string;
  country: string;
  city: string;
  timeZone: string;
  locationManager: string;
  status: string;
  createdBy: string;
  tenantId: string;
  clientId: string;
}

type LocationFields = Omit<CreateLocationRequest, 'createdBy' | 'tenantId' | 'clientId'>;

/** Request body for PUT {administrationApiUrl}api/organization/locations/{locationId} */
type UpdateLocationRequest = LocationFields;

/** The API only lets a location of this type have no parent, so top-level locations hang off one hidden root. */
const ROOT_TYPE = 'Organization';
const ROOT_CODE = 'ORG-ROOT';

function toAppLocation(dto: LocationDto, rootId: string | null): OrgLocation {
  return {
    id: dto.locationId,
    code: dto.locationCode,
    name: dto.locationName,
    type: LOCATION_TYPES.find((t) => t.toLowerCase() === dto.locationType?.toLowerCase()) ?? 'Location',
    parent: dto.parentLocation && dto.parentLocation.locationId !== rootId ? dto.parentLocation.locationCode : null,
    address: dto.address ?? '',
    country: dto.country,
    city: dto.city,
    timeZone: dto.timeZone,
    contact: dto.locationManager,
    status: dto.status === 'Inactive' ? 'Inactive' : 'Active'
  };
}

/** A readable message from a validation problem, a conflict or a network failure. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body?.errors) return (Object.values(body.errors) as string[][]).flat().join(' ');
    if (body?.message) return body.message;
    if (err.status === 0) return 'The Administration service could not be reached.';
    return fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.administrationApiUrl}api/organization/locations`;

  private readonly locations = signal<OrgLocation[]>([]);
  private rootId: string | null = null;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Master data summary tabs (Asset, People, Vendor, ...): layouts only, rows stay empty until their APIs are wired
  private readonly tabs: SummaryTab[] = seedSummaryTabs();

  constructor() {
    this.load();
  }

  /** GET /api/organization/locations for this tenant; the hidden organization root is kept aside, not shown in the tree. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http
      .get<LocationDto[]>(this.apiUrl, { params: { tenantId: environment.tenantId, clientId: environment.clientId } })
      .subscribe({
        next: (list) => {
          this.rootId = list.find((d) => d.locationType === ROOT_TYPE)?.locationId ?? null;
          this.locations.set(list.filter((d) => d.locationType !== ROOT_TYPE).map((d) => toAppLocation(d, this.rootId)));
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(apiErrorMessage(err, 'Locations could not be loaded from the Administration service.'));
          this.loading.set(false);
        }
      });
  }

  all(): OrgLocation[] {
    return this.locations();
  }

  find(code: string | null): OrgLocation | undefined {
    return code ? this.locations().find((l) => l.code === code) : undefined;
  }

  ofType(type: LocationType): OrgLocation[] {
    return this.locations().filter((l) => l.type === type);
  }

  childrenOf(code: string | null): OrgLocation[] {
    return this.locations().filter((l) => l.parent === code);
  }

  /** Every code below the given node. */
  descendantsOf(code: string): string[] {
    const out: string[] = [];
    const walk = (c: string) => {
      for (const child of this.childrenOf(c)) {
        out.push(child.code);
        walk(child.code);
      }
    };
    walk(code);
    return out;
  }

  /** Ancestors from the top-level location down to the direct parent. */
  ancestorsOf(code: string): OrgLocation[] {
    const out: OrgLocation[] = [];
    let current = this.find(this.find(code)?.parent ?? null);
    while (current) {
      out.unshift(current);
      current = this.find(current.parent);
    }
    return out;
  }

  codeTaken(code: string, except: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.locations().some((l) => l.code.toUpperCase() === c && l.code !== except);
  }

  /** Two siblings can't share a name. */
  nameTaken(name: string, parent: string | null, except: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.locations().some((l) => l.parent === parent && l.name.toLowerCase() === n && l.code !== except);
  }

  nextCode(): string {
    const max = this.locations().reduce((m, l) => Math.max(m, Number(l.code.replace(/\D/g, '')) || 0), 0);
    return `LOC-${String(max + 1).padStart(3, '0')}`;
  }

  /** POST /api/organization/locations; the first top-level location also creates the hidden organization root. */
  create(record: OrgLocation): Observable<OrgLocation> {
    const parent = this.find(record.parent);
    if (record.parent && !parent?.id) return throwError(() => new Error(`Parent ${record.parent} is not saved yet.`));
    const parentId$ = parent?.id ? of(parent.id) : this.ensureRoot(record);
    return parentId$.pipe(
      switchMap((parentLocationId) =>
        this.post({
          locationCode: record.code,
          locationName: record.name,
          locationType: record.type,
          parentLocationId,
          address: record.address,
          country: record.country,
          city: record.city,
          timeZone: record.timeZone,
          locationManager: record.contact,
          status: record.status
        })
      ),
      map((dto) => toAppLocation(dto, this.rootId)),
      tap((saved) => this.locations.update((list) => [...list, saved]))
    );
  }

  /** The root takes the organization name and the first location's address details (all required by the API). */
  private ensureRoot(sample: OrgLocation): Observable<string> {
    if (this.rootId) return of(this.rootId);
    return this.post({
      locationCode: ROOT_CODE,
      locationName: ORGANIZATIONS[0],
      locationType: ROOT_TYPE,
      parentLocationId: null,
      address: '',
      country: sample.country,
      city: sample.city,
      timeZone: sample.timeZone,
      locationManager: sample.contact,
      status: 'Active'
    }).pipe(
      map((dto) => dto.locationId),
      tap((id) => (this.rootId = id))
    );
  }

  private post(fields: LocationFields): Observable<LocationDto> {
    const request: CreateLocationRequest = {
      ...fields,
      createdBy: this.auth.getUserEmail() || 'unknown',
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<LocationDto>(this.apiUrl, request);
  }

  /** PUT /api/organization/locations/{id}; children reference the parent by id, so a changed code needs nothing else on the server. */
  update(record: OrgLocation, originalCode: string): Observable<OrgLocation> {
    const current = this.find(originalCode);
    if (!current?.id) return throwError(() => new Error(`${record.name} is not saved yet.`));
    const parent = this.find(record.parent);
    if (record.parent && !parent?.id) return throwError(() => new Error(`Parent ${record.parent} is not saved yet.`));
    const parentId$ = parent?.id ? of(parent.id) : this.ensureRoot(record);
    return parentId$.pipe(
      switchMap((parentLocationId) => {
        const request: UpdateLocationRequest = {
          locationCode: record.code,
          locationName: record.name,
          locationType: record.type,
          parentLocationId,
          address: record.address,
          country: record.country,
          city: record.city,
          timeZone: record.timeZone,
          locationManager: record.contact,
          status: record.status
        };
        return this.http.put<LocationDto>(`${this.apiUrl}/${current.id}`, request);
      }),
      map((dto) => toAppLocation(dto, this.rootId)),
      tap((saved) =>
        this.locations.update((list) =>
          list.map((l) => {
            if (l.code === originalCode) return saved;
            if (l.parent === originalCode) return { ...l, parent: saved.code };
            return l;
          })
        )
      )
    );
  }

  /**
   * DELETE /api/organization/locations/{id} one at a time, deepest first, because the API refuses a location that
   * still has children. Each record leaves the list as soon as the server confirms it.
   */
  remove(codes: string[]): Observable<void> {
    const depth = (code: string) => this.ancestorsOf(code).length;
    const ordered = [...codes].sort((a, b) => depth(b) - depth(a));
    return from(ordered).pipe(
      concatMap((code) => {
        const id = this.find(code)?.id;
        const delete$ = id ? this.http.delete<void>(`${this.apiUrl}/${id}`) : of(undefined);
        return delete$.pipe(tap(() => this.locations.update((list) => list.filter((l) => l.code !== code))));
      }),
      toArray(),
      map(() => undefined)
    );
  }

  /* ===== Summary tabs ===== */

  tab(id: string): SummaryTab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  statValue(tab: SummaryTab, stat: SummaryStat): number {
    const rows: SummaryRow[] = tab.rows;
    const col = stat.column ?? '';
    switch (stat.kind) {
      case 'total':
        return rows.length;
      case 'match':
        return rows.filter((r) => (stat.values ?? []).includes(r[col])).length;
      case 'distinct':
        return new Set(rows.map((r) => r[col])).size;
      case 'sum':
        return rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);
    }
  }
}
