import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError } from '../shared/tracking-api';
import { DeviceModel, ModelKind } from './firmware-data';
import { FIRMWARE_VERSIONS } from './firmware-versions.data';

export type FirmwareUpdateStatus = 'Up to date' | 'Update available';

/** A row of Firmware Versions by Device Model. */
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

/** Firmware inventory by device model (static demo, firmware-versions.data.ts). */
@Injectable({ providedIn: 'root' })
export class FirmwareVersionApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<FirmwareVersionDto[]> {
    return demo(FIRMWARE_VERSIONS);
  }

  get(id: string): Observable<FirmwareVersionDto> {
    const row = FIRMWARE_VERSIONS.find((f) => f.id === id);
    return row ? demo(row) : demoError('The firmware version was not found.');
  }

  create(f: FirmwareVersionFields): Observable<FirmwareVersionDto> {
    const n = FIRMWARE_VERSIONS.reduce((m, x) => Math.max(m, Number(x.id.slice(3)) || 0), 0) + 1;
    const dto = this.toDto(f, `FW-${String(n).padStart(4, '0')}`, null);
    FIRMWARE_VERSIONS.unshift(dto);
    return demo(dto);
  }

  /** Full replace; takes the same fields as create. */
  update(id: string, f: FirmwareVersionFields): Observable<FirmwareVersionDto> {
    const i = FIRMWARE_VERSIONS.findIndex((x) => x.id === id);
    if (i < 0) return demoError(`Could not save ${f.deviceModel}: it no longer exists.`);
    FIRMWARE_VERSIONS[i] = this.toDto(f, id, FIRMWARE_VERSIONS[i]);
    return demo(FIRMWARE_VERSIONS[i]);
  }

  delete(id: string, name: string): Observable<void> {
    const i = FIRMWARE_VERSIONS.findIndex((x) => x.id === id);
    if (i < 0) return demoError(`Could not delete ${name}.`);
    FIRMWARE_VERSIONS.splice(i, 1);
    return demo(undefined as void);
  }

  private toDto(f: FirmwareVersionFields, id: string, old: FirmwareVersionDto | null): FirmwareVersionDto {
    const current = f.currentVersion.trim();
    const latest = f.latestVersion.trim();
    return {
      id,
      deviceModel: f.deviceModel.trim(),
      currentVersion: current,
      latestVersion: latest,
      deviceCount: f.deviceCount ?? 0,
      status: current.toLowerCase() === latest.toLowerCase() ? 'Up to date' : 'Update available',
      releaseDate: f.releaseDate ? `${f.releaseDate}T00:00:00Z` : null,
      releaseNotes: f.releaseNotes.map((n) => n.trim()).filter((n) => n),
      createdBy: old?.createdBy ?? (this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER),
      createdAt: old?.createdAt ?? new Date().toISOString(),
    };
  }
}
