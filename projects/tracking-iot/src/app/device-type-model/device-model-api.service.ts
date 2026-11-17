import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { IOT_DEVICES } from '../device-management/iot-devices.data';
import { CONNECTIVITY, DeviceModel, ModelStatus } from './model-data';
import { DEVICE_MODELS, DEVICE_MODEL_FORM_OPTIONS } from './device-models.data';

/** A device model record (addressed by modelNumber). */
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

/** Device Type & Model (static demo): the in-memory catalogue of device-models.data.ts. */
@Injectable({ providedIn: 'root' })
export class DeviceModelApiService {
  private readonly auth = inject(AuthService);

  currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  getAll(): Observable<DeviceModelDto[]> {
    return demo(DEVICE_MODELS);
  }

  get(modelNumber: string): Observable<DeviceModelDto> {
    const m = DEVICE_MODELS.find((x) => x.modelNumber.toLowerCase() === modelNumber.toLowerCase());
    return m ? demo(m) : demoError(`Model ${modelNumber} was not found.`);
  }

  formOptions(): Observable<DeviceModelFormOptions> {
    const counts = new Map<string, number>();
    for (const m of DEVICE_MODELS) counts.set(m.deviceType, (counts.get(m.deviceType) ?? 0) + 1);
    return demo({ ...DEVICE_MODEL_FORM_OPTIONS, deviceTypes: [...counts].map(([deviceType, modelCount]) => ({ deviceType, modelCount })) });
  }

  /** Devices registered per model number (lower-cased), for the "deployed" counts. */
  deployedCounts(): Observable<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const d of IOT_DEVICES) if (d.model) counts[d.model.toLowerCase()] = (counts[d.model.toLowerCase()] ?? 0) + 1;
    return demo(counts);
  }

  create(m: DeviceModel, deviceType: string): Observable<DeviceModelDto> {
    if (DEVICE_MODELS.some((x) => x.modelNumber.toLowerCase() === m.name.toLowerCase())) return demoError(`Model ${m.name} already exists.`);
    const dto = this.toDto(m, deviceType, null);
    DEVICE_MODELS.unshift(dto);
    return demo(dto);
  }

  /** Full replace (the model number cannot change). */
  update(m: DeviceModel, deviceType: string): Observable<DeviceModelDto> {
    const i = DEVICE_MODELS.findIndex((x) => x.modelNumber === m.id);
    if (i < 0) return demoError(`Could not save ${m.name}: it no longer exists.`);
    const dto = this.toDto(m, deviceType, DEVICE_MODELS[i]);
    DEVICE_MODELS[i] = dto;
    return demo(dto);
  }

  delete(modelNumber: string): Observable<void> {
    const i = DEVICE_MODELS.findIndex((x) => x.modelNumber === modelNumber);
    if (i < 0) return demoError(`Could not delete ${modelNumber}: it no longer exists.`);
    if (IOT_DEVICES.some((d) => d.model === modelNumber)) return demoError(`${modelNumber} cannot be deleted while devices are registered against it.`);
    DEVICE_MODELS.splice(i, 1);
    return demo(undefined as void);
  }

  private toDto(m: DeviceModel, deviceType: string, old: DeviceModelDto | null): DeviceModelDto {
    const now = new Date().toISOString();
    const user = this.currentUser();
    return {
      id: old?.id ?? newRecordId(),
      modelNumber: old?.modelNumber ?? m.name,
      manufacturer: m.manufacturer,
      deviceType,
      connectivity: m.connectivity[0] ?? '',
      supportedMeasurements: [...m.measurements],
      powerSource: m.power,
      protocol: m.protocol || null,
      frequencyBands: [...m.bands],
      ipRating: m.ipRating || null,
      batteryLife: m.batteryLife || null,
      operatingTemperature: m.opTemp || null,
      firmwareFrom: m.fwMin || null,
      firmwareTo: m.fwMax || null,
      configurableAttributes: [...m.attributes],
      status: apiStatus(m),
      createdBy: old?.createdBy ?? user,
      createdAt: old?.createdAt ?? now,
      updatedBy: old ? user : null,
      updatedAt: old ? now : null,
      clientId: 'demo-client',
      tenantId: 'demo-tenant',
    };
  }
}
