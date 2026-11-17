import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { DeviceModel, ModelKind } from './firmware-data';

export type FirmwareUpdateStatus = 'Up to date' | 'Update available';

/** A row of Firmware Versions by Device Model (GET /api/firmware-versions). */
export interface FirmwareVersionDto {
  id: string;
  deviceModel: string;
  currentVersion: string;
  latestVersion: string;
  deviceCount: number;
  status: FirmwareUpdateStatus | null;
  /** Release date of the latest version (UTC midnight). */
  releaseDate: string | null;
  releaseNotes: string[];
  createdBy: string | null;
  createdAt: string | null;
}

/** What the add / edit form collects. */
export interface FirmwareVersionFields {
  deviceModel: string;
  currentVersion: string;
  latestVersion: string;
  deviceCount: number | null;
  /** yyyy-MM-dd or ''. */
  releaseDate: string;
  releaseNotes: string[];
}

/** POST / PUT body (same shape for both). */
interface FirmwareVersionRequest {
  deviceModel: string;
  currentVersion: string;
  latestVersion: string;
  deviceCount: number | null;
  status: FirmwareUpdateStatus;
  releaseDate: string | null;
  releaseNotes: string[];
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** Icon kind for a model name (the API has no device kind; this only picks the row icon). */
export function kindOf(name: string): ModelKind {
  const n = name.toLowerCase();
  if (n.includes('beacon')) return 'beacon';
  if (n.includes('tag')) return 'tag';
  if (n.includes('vib')) return 'vibration';
  if (/track|gps|fm[a-z]?\d|tmt/.test(n)) return 'tracker';
  return 'sensor';
}

/** Page row for an API row. Online count is filled in by the page from device health; vendor is not kept by the API. */
export function modelFromDto(dto: FirmwareVersionDto): DeviceModel {
  return {
    id: dto.id,
    name: dto.deviceModel,
    vendor: '',
    kind: kindOf(dto.deviceModel),
    current: dto.currentVersion,
    latest: dto.latestVersion,
    devices: dto.deviceCount ?? 0,
    online: null,
    releaseDate: dto.releaseDate ? dto.releaseDate.slice(0, 10) : '',
    notes: dto.releaseNotes ?? [],
    updateAvailable: dto.status ? dto.status === 'Update available' : dto.currentVersion.trim().toLowerCase() !== dto.latestVersion.trim().toLowerCase(),
  };
}

/** /api/firmware-versions: firmware inventory by device model. */
@Injectable({ providedIn: 'root' })
export class FirmwareVersionApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('firmware-versions');

  list(): Observable<FirmwareVersionDto[]> {
    return this.http.get<FirmwareVersionDto[]>(this.url, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load firmware versions.')));
  }

  get(id: string): Observable<FirmwareVersionDto> {
    return this.http.get<FirmwareVersionDto>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load the firmware version.')));
  }

  create(f: FirmwareVersionFields): Observable<FirmwareVersionDto> {
    return this.http.post<FirmwareVersionDto>(this.url, this.body(f), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not add ${f.deviceModel}.`)));
  }

  /** Full replace; takes the same body as create. */
  update(id: string, f: FirmwareVersionFields): Observable<FirmwareVersionDto> {
    return this.http.put<FirmwareVersionDto>(`${this.url}/${encodeURIComponent(id)}`, this.body(f), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not save ${f.deviceModel}.`)));
  }

  delete(id: string, name: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`, { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not delete ${name}.`)));
  }

  private body(f: FirmwareVersionFields): FirmwareVersionRequest {
    const current = f.currentVersion.trim();
    const latest = f.latestVersion.trim();
    return {
      deviceModel: f.deviceModel.trim(),
      currentVersion: current,
      latestVersion: latest,
      deviceCount: f.deviceCount,
      status: current.toLowerCase() === latest.toLowerCase() ? 'Up to date' : 'Update available',
      // the API keeps the date only, as UTC midnight
      releaseDate: f.releaseDate ? `${f.releaseDate}T00:00:00Z` : null,
      releaseNotes: f.releaseNotes.map((n) => n.trim()).filter((n) => n),
      createdBy: this.auth.getUser()?.userName || this.auth.getUserEmail() || '',
      ...tenantBody(),
    };
  }
}
