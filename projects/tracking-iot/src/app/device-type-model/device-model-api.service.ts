import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, retry, switchMap, timer } from 'rxjs';
import { AuthService } from 'shared-ui';
import { apiError, getAllPages, savedRecord, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';
import { CONNECTIVITY, Connectivity, DeviceModel, ModelStatus } from './model-data';

/** A model as GET/POST/PUT /api/device-models returns it (addressed by modelNumber). */
export interface DeviceModelDto {
  id: string;
  modelNumber: string;
  manufacturer: string;
  deviceType: string;
  connectivity: string;
  supportedMeasurements: string[];
  powerSource: string;
  protocol: string | null;
  frequencyBands: string[];
  ipRating: string | null;
  batteryLife: string | null;
  operatingTemperature: string | null;
  firmwareFrom: string | null;
  firmwareTo: string | null;
  configurableAttributes: string[];
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** Body of POST /api/device-models and PUT /api/device-models/{modelNumber}. */
export interface DeviceModelRequest {
  modelNumber: string;
  manufacturer: string;
  deviceType: string;
  connectivity: string;
  supportedMeasurements: string[];
  powerSource: string;
  protocol: string | null;
  frequencyBands: string[];
  ipRating: string | null;
  batteryLife: string | null;
  operatingTemperature: string | null;
  firmwareFrom: string | null;
  firmwareTo: string | null;
  configurableAttributes: string[];
  status: string;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** GET /api/device-models/form-options: every dropdown of the model form in one call. */
export interface DeviceModelFormOptions {
  deviceTypes: { deviceType: string; modelCount: number }[];
  manufacturers: string[];
  connectivities: string[];
  protocolsByConnectivity: Record<string, string[]>;
  frequencyBandsByConnectivity: Record<string, string[]>;
  powerSources: string[];
  measurements: { name: string; unit: string }[];
  ipRatings: string[];
  configurableAttributes: string[];
  statuses: string[];
}

/** API status → page status: Draft and Pending Review are both shown as Draft (Pending Review); Inactive is Retired. */
export function pageStatus(status: string | null | undefined): ModelStatus {
  return status === 'Active' ? 'Active' : status === 'Inactive' ? 'Retired' : 'Draft';
}

/** Page status → API status; a Draft keeps the API's own Draft / Pending Review, new drafts go to Pending Review. */
export function apiStatus(m: DeviceModel): string {
  if (m.status === 'Active') return 'Active';
  if (m.status === 'Retired') return 'Inactive';
  return m.api?.status === 'Draft' || m.api?.status === 'Pending Review' ? m.api.status : 'Pending Review';
}

/** A page model for an API model; `typeId` is the page's id for dto.deviceType. `deployed` is counted separately. */
export function modelFromDto(dto: DeviceModelDto, typeId: string): DeviceModel {
  return {
    id: dto.modelNumber,
    name: dto.modelNumber,
    manufacturer: dto.manufacturer ?? '',
    typeId,
    connectivity: CONNECTIVITY.filter((c) => c.toLowerCase() === (dto.connectivity ?? '').toLowerCase()),
    protocol: dto.protocol ?? '',
    measurements: dto.supportedMeasurements ?? [],
    power: dto.powerSource ?? '',
    bands: dto.frequencyBands ?? [],
    ipRating: dto.ipRating ?? '',
    batteryLife: dto.batteryLife ?? '',
    opTemp: dto.operatingTemperature ?? '',
    fwMin: dto.firmwareFrom ?? '',
    fwMax: dto.firmwareTo ?? '',
    status: pageStatus(dto.status),
    attributes: dto.configurableAttributes ?? [],
    deployed: 0,
    api: dto,
  };
}

/** Device Type & Model → /api/device-models (Tracking service). */
@Injectable({ providedIn: 'root' })
export class DeviceModelApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = trackingUrl('device-models');

  currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || 'Unknown user';
  }

  /** GET /api/device-models: every page. */
  getAll(): Observable<DeviceModelDto[]> {
    return getAllPages<DeviceModelDto>(this.http, this.url).pipe(
      catchError((e) => apiError(e, 'Could not load device models.')),
    );
  }

  /** GET /api/device-models/{modelNumber} */
  get(modelNumber: string): Observable<DeviceModelDto> {
    return this.http.get<DeviceModelDto>(`${this.url}/${encodeURIComponent(modelNumber)}`, { params: tenantParams() }).pipe(
      catchError((e) => apiError(e, `Could not load ${modelNumber}.`)),
    );
  }

  /** GET /api/device-models/form-options */
  formOptions(): Observable<DeviceModelFormOptions> {
    return this.http.get<DeviceModelFormOptions>(`${this.url}/form-options`, { params: tenantParams() }).pipe(
      // a slow / cold service sometimes fails the first call: try again twice before giving up
      retry({ count: 2, delay: (_e, n) => timer(800 * n) }),
      catchError((e) => apiError(e, 'Could not load the model form options.')),
    );
  }

  /** Devices registered per model number (GET /api/iot-devices), for the "deployed" counts. */
  deployedCounts(): Observable<Record<string, number>> {
    return getAllPages<{ model: string }>(this.http, trackingUrl('iot-devices')).pipe(
      map((rows) => {
        const counts: Record<string, number> = {};
        for (const r of rows) if (r.model) counts[r.model.toLowerCase()] = (counts[r.model.toLowerCase()] ?? 0) + 1;
        return counts;
      }),
      catchError(() => of({})),
    );
  }

  /** POST /api/device-models */
  create(m: DeviceModel, deviceType: string): Observable<DeviceModelDto> {
    return this.http.post(this.url, this.request(m, deviceType), { params: tenantParams(), responseType: 'text' }).pipe(
      switchMap((body) => this.saved(body, m.name)),
      catchError((e) => apiError(e, `Could not add ${m.name}.`)),
    );
  }

  /** PUT /api/device-models/{modelNumber}: full replace (the model number cannot change). */
  update(m: DeviceModel, deviceType: string): Observable<DeviceModelDto> {
    return this.http.put(`${this.url}/${encodeURIComponent(m.id)}`, this.request(m, deviceType), { params: tenantParams(), responseType: 'text' }).pipe(
      switchMap((body) => this.saved(body, m.id)),
      catchError((e) => apiError(e, `Could not save ${m.name}.`)),
    );
  }

  /** The model a successful POST / PUT returned; reloaded by model number when the body is not the model. */
  private saved(body: string, modelNumber: string): Observable<DeviceModelDto> {
    const dto = savedRecord<DeviceModelDto>(body, 'modelNumber');
    return dto ? of(dto) : this.get(modelNumber);
  }

  /** DELETE /api/device-models/{modelNumber} */
  delete(modelNumber: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(modelNumber)}`, { params: tenantParams() }).pipe(
      catchError((e) => apiError(e, `Could not delete ${modelNumber}.`)),
    );
  }

  private request(m: DeviceModel, deviceType: string): DeviceModelRequest {
    const conn: Connectivity | undefined = m.connectivity[0];
    return {
      modelNumber: m.name,
      manufacturer: m.manufacturer,
      deviceType,
      connectivity: conn ?? '',
      supportedMeasurements: m.measurements,
      powerSource: m.power,
      protocol: m.protocol || null,
      frequencyBands: m.bands,
      ipRating: m.ipRating || null,
      batteryLife: m.batteryLife || null,
      operatingTemperature: m.opTemp || null,
      firmwareFrom: m.fwMin || null,
      firmwareTo: m.fwMax || null,
      configurableAttributes: m.attributes,
      status: apiStatus(m),
      createdBy: this.currentUser(),
      ...tenantBody(),
    };
  }
}
